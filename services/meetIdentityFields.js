const { nowIso } = require('../utils/date');
const { combineDateTime } = require('./meetHelpers');

// Save the fields that describe this specific meet, rather than its reusable
// racing setup. Preset loading submits the entire Meet Builder form, so these
// values must be retained before the preset replaces divisions, fees, track
// configuration, blocks, and races.
function saveMeetIdentityFields(meet, body, db) {
  body = body || {};
  meet.meetName = String(body.meetName || 'New Meet').trim();
  meet.leagueAssociation = String(body.leagueAssociation || body.league || '').trim();
  meet.league = meet.leagueAssociation;
  meet.date = String(body.date || '').trim();
  meet.endDate = String(body.endDate || '').trim();
  meet.startTime = String(body.startTime || '').trim();
  meet.registrationCloseAt = combineDateTime(body.registrationCloseDate, body.registrationCloseTime);

  const rinkSearch = String(body.rinkSearch || '').trim();
  let submittedRinkId = Number(body.rinkId || 0);
  if (!submittedRinkId && db && Array.isArray(db.rinks) && rinkSearch) {
    const key = rinkSearch.toLowerCase();
    const matched = db.rinks.find(r => {
      const label = `${r.name} (${r.city || ''}${r.city && r.state ? ', ' : ''}${r.state || ''})`.toLowerCase();
      return label === key || String(r.name || '').toLowerCase() === key;
    });
    if (matched) submittedRinkId = Number(matched.id || 0);
  }
  if (submittedRinkId) {
    meet.rinkId = submittedRinkId;
    meet.customRinkName = '';
  } else {
    meet.rinkId = Number(meet.rinkId || 1);
    meet.customRinkName = rinkSearch;
  }

  meet.status = String(body.status || 'draft');
  // Find a Meet visibility is controlled by status. Published shows publicly; draft stays hidden.
  meet.isPublic = String(meet.status || '').toLowerCase() === 'published';
  meet.notes = String(body.notes || '');
  meet.scheduleNotes = String(body.scheduleNotes || '');
  meet.relayNotes = String(body.relayNotes || '');
  meet.relayDeadline = String(body.relayDeadline || '').trim();
  meet.updatedAt = nowIso();
}

module.exports = { saveMeetIdentityFields };
