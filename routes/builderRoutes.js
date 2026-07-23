const express = require('express');
const { esc, cap } = require('../utils/html');
const { nowIso } = require('../utils/date');
const { canEditMeet, hasRole } = require('../utils/auth');
const {
  getMeetOr404, meetRinkLabel, meetDateLabel, nextId,
  normalizeOpenGroups, normalizeQuadGroups, normalizeDivisionSet,
  normalizeDistances, makeAdditionalRaceSlots, makeManualExtraRaceSlots,
  makeSetupPresetFromMeet, restorePresetBlocksIntoMeet, nextSetupPresetId,
  generateConfiguredRacesForMeet, ensureAtLeastOneBlock,
  ensureRegistrationTotalsAndNumbers,
  restoreBlockAssignmentsAfterRaceSync,
  combineDateTime,
  OPEN_GROUP_DEFAULTS, QUAD_GROUP_DEFAULTS,
  coachVisibleMeets,
  baseGroups, baseGroupsUSARS,
} = require('../services/meetHelpers');
const {
  normalizeRelayEligibleGroupIds, normalizeRelayAgeRange,
  normalizeRelayTemplates, makeRelayRace, relayRaceExists,
  renderRelayEligibleSkatersHtml, RELAY_TEMPLATE_ROWS,
} = require('../services/relayHelpers');
const { buildRelayRacesFromTeams } = require('../services/relayGenerator');
const { RELAY_DIVISION_BY_ID } = require('../services/relayDivisions');
const {
  genderBucket, openGroupForTimeTrialReg, timeTrialRaceForMeet,
  timeTrialEntriesForMeet, rebuildTimeTrialRace, timeTrialLeaderboards,
  rebuildRaceAssignmentsSafe,
} = require('../services/ttHelpers');
const { ensureTimeTrialEvent, normalizeTimeTrialSettings } = require('../services/timeTrialEvents');
const { raceDisplayStage, ensureCurrentRace } = require('../services/raceDay');
const { generatePinForMeet, clearPinForMeet } = require('../services/desktopMeetPinService');
const { createBackup: createDesktopBackup } = require('../services/desktopBackupService');


function canManageSetupPresets(user) {
  return hasRole(user, 'super_admin');
}

function createDesktopBackupIfActive(db, reason, meetId = '') {
  if (process.env.SSM_DESKTOP !== '1') return;
  try { createDesktopBackup({ db, reason, meetId }); }
  catch (err) { console.warn(`Desktop backup skipped (${reason}):`, err.message); }
}

module.exports = function createBuilderRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, pageShell, saveDb,
          renderMeetBuilderView, renderOpenBuilderView,
          renderQuadBuilderView, renderRelayBuilderView } = deps;

router.get('/portal/meet/:meetId/builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  // Normalize Additionals into the canonical additionalGroups field.
  if(!Array.isArray(meet.additionalGroups)) {
    meet.additionalGroups = Array.isArray(meet.additionalRaceGroups) ? meet.additionalRaceGroups : (Array.isArray(meet.additionalRaces) ? meet.additionalRaces : (Array.isArray(meet.skateabilityGroups) ? meet.skateabilityGroups : []));
  }
  meet.additionalGroups = makeAdditionalRaceSlots(meet.additionalGroups);
  meet.additionalRaces = meet.additionalGroups.map(g => ({ ...g }));
  meet.additionalRaceGroups = meet.additionalGroups.map(g => ({ ...g }));
  meet.skateabilityGroups = meet.additionalGroups.map(g => ({ ...g }));
  if(!canEditMeet(req.user,meet)) return res.status(403).send(pageShell({title:'Forbidden',user:req.user, bodyHtml:`<div class="page-header"><h1>Forbidden</h1></div><div class="card"><div class="danger">Only the meet owner can edit this meet.</div></div>`}));

  res.send(pageShell({
    title:'Meet Builder',
    user:req.user,
    meet,
    activeTab:'builder',
    bodyHtml:renderMeetBuilderView({ db:req.db, meet, user:req.user, query:req.query }),
  }));
});


function numberFieldFromBody(body, keys, fallback, minValue) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(body || {}, key)) continue;
    const raw = String(body[key] ?? '').trim();
    if (raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(minValue, n);
  }
  const fb = Number(fallback);
  return Number.isFinite(fb) ? Math.max(minValue, fb) : minValue;
}

function saveMeetFields(meet, body, db) {
  meet.meetName=String(body.meetName||'New Meet').trim();
  meet.leagueAssociation = String(body.leagueAssociation || body.league || '').trim();
  meet.league = meet.leagueAssociation;
  meet.date=String(body.date||'').trim();
  meet.endDate=String(body.endDate||'').trim();
  meet.startTime=String(body.startTime||'').trim();
  meet.registrationCloseAt=combineDateTime(body.registrationCloseDate,body.registrationCloseTime);
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
  // Preserve existing values if the browser does not submit these fields, and
  // accept a couple of alternate names so lane count cannot silently fall back to 4.
  meet.trackLength = numberFieldFromBody(body, ['trackLength', 'track_length'], meet.trackLength || 100, 1);
  meet.lanes = numberFieldFromBody(body, ['lanes', 'laneCount', 'lane_count'], meet.lanes || 4, 1);
  meet.timeTrialsEnabled=!!body.timeTrialsEnabled;
  meet.timeTrialEvent = {
    enabled: !!body.timeTrialEventEnabled,
    distance: String(body.timeTrialEventDistance || '100m').trim() || '100m',
    runOrder: 'youngest_oldest',
    countsForOverall: String(body.timeTrialEventCountsForOverall || '').toLowerCase() === 'yes',
  };
  normalizeTimeTrialSettings(meet);
  ensureTimeTrialEvent(meet);
  if(Array.isArray(meet.openGroups)) {
    meet.openGroups=normalizeOpenGroups(meet.openGroups).map(g=>({...g,timeTrial:!!meet.timeTrialsEnabled,ttDistance:'100m'}));
  }
  // Relay Builder controls relays. If relay races/templates exist, the meet has relays.
  meet.relayEnabled=!!((meet.races||[]).some(r=>r.isRelayRace) || (meet.relayTemplates||[]).length);
  // Every meet gets a judges panel. No director toggle needed.
  meet.judgesPanelRequired=true;
  meet.status=String(body.status||'draft');
  // Find a Meet visibility is controlled by status. Published shows publicly; draft stays hidden.
  meet.isPublic=String(meet.status||'').toLowerCase()==='published';
  meet.notes=String(body.notes||'');
  meet.scheduleNotes=String(body.scheduleNotes||'');
  meet.relayNotes=String(body.relayNotes||'');
  meet.relayDeadline=String(body.relayDeadline||'').trim(); // free text shown to coaches; locks the coach relay form once passed
  meet.tiebreaker='sr832'; // USARS SR832 is the only tiebreaker (d2 was legacy)
  meet.baseEntryFee=Number(String(body.baseEntryFee||'0').trim()||0);
  meet.additionalRaceFee=Number(String(body.additionalRaceFee||'0').trim()||0);
  meet.maxRegistrationFee=Number(String(body.maxRegistrationFee||'0').trim()||0);
  const hasGroupFields = Object.keys(body||{}).some(k=>/^g_\d+_(novice|elite)_/.test(k));
  if(hasGroupFields) {
    meet.groups.forEach((group,gi)=>{
      for(const divKey of ['novice','elite']) {
        group.divisions[divKey] = {
          enabled:!!body[`g_${gi}_${divKey}_enabled`],
          ages:String(body[`g_${gi}_${divKey}_ages`]||group.divisions?.[divKey]?.ages||group.ages||'').trim(),
          distances:[String(body[`g_${gi}_${divKey}_d1`]||'').trim(),String(body[`g_${gi}_${divKey}_d2`]||'').trim(),String(body[`g_${gi}_${divKey}_d3`]||'').trim(),String(body[`g_${gi}_${divKey}_d4`]||'').trim()],
        };
      }
    });
  }
  // Save four fixed manual extra race slots.
  if((Object.prototype.hasOwnProperty.call(body||{}, 'additional_count') || Object.prototype.hasOwnProperty.call(body||{}, 'skateability_count'))) {
    const nextManual = [];
    for(let si=0; si<4; si++) {
      const id = 'manual_extra_' + (si + 1);
      let ageGroupLabel = String(body[`sk_${si}_ageGroupLabel`]||'').trim();
      if(!ageGroupLabel) ageGroupLabel = `Additional Race ${si + 1}`;
      const ages = String(body[`sk_${si}_ages`]||'').trim();
      const distances = [
        String(body[`sk_${si}_d1`]||'').trim(),
        String(body[`sk_${si}_d2`]||'').trim(),
        String(body[`sk_${si}_d3`]||'').trim(),
      ];
      nextManual.push({
        id,
        ageGroupId: '',
        ageGroupLabel,
        ages,
        enabled: !!body[`sk_${si}_enabled`],
        distances,
      });
    }
    meet.additionalGroups = makeAdditionalRaceSlots(nextManual);
    meet.additionalRaces = meet.additionalGroups.map(g => ({ ...g }));
    meet.additionalRaceGroups = meet.additionalGroups.map(g => ({ ...g }));
    meet.skateabilityGroups = meet.additionalGroups.map(g => ({ ...g }));
  }
  // Keep existing registration totals in sync when global pricing changes.
  // This does not touch race generation or legacy stored cost fields.
  ensureRegistrationTotalsAndNumbers(meet);
  meet.updatedAt=nowIso();
}


// Save reusable setup preset — excludes meet-specific date/rink/registrations/results
router.post('/portal/meet/:meetId/builder/save-preset', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');

  // IMPORTANT: this button submits the whole Meet Builder form. Save the current
  // form values first so the preset captures the lane count, relay toggle, pricing,
  // divisions, opens, quads, and additionals the director is looking at right now.
  // Without this, presets could capture stale meet.lanes (usually 4) and stale
  // relayEnabled state.
  const oldLaneCount = Number(meet.lanes || 4);
  const oldTrackLength = Number(meet.trackLength || 100);
  saveMeetFields(meet, req.body, req.db);
  const laneOrTrackChanged = Number(meet.lanes || 4) !== oldLaneCount || Number(meet.trackLength || 100) !== oldTrackLength;
  if (laneOrTrackChanged) {
    createDesktopBackupIfActive(req.db, 'before_race_generation', meet.id);
    generateConfiguredRacesForMeet(meet);
    rebuildRaceAssignmentsSafe(meet);
  }

  if(!Array.isArray(req.db.setupPresets)) req.db.setupPresets=[];
  const preset=makeSetupPresetFromMeet(req.db, meet, req.body.presetName, req.user.id);
  req.db.setupPresets.push(preset);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/builder?presetSaved=1${laneOrTrackChanged?'&lanesSaved=1':''}`);
});

// Switch the meet's division set between the standard set and the full USARS
// national set. Its own action (not the big settings form) so rebuilding
// meet.groups can't collide with the form's per-division distance fields.
// Preserves per-division settings for any division id that survives the switch.
router.post('/portal/meet/:meetId/division-scheme', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  const wantUsars = String(req.body.scheme || '') === 'usars';
  if (wantUsars !== !!meet.usarsDivisions) {
    meet.usarsDivisions = wantUsars;
    const nextBase = wantUsars ? baseGroupsUSARS() : baseGroups();
    const prev = new Map((meet.groups || []).map(g => [g.id, g]));
    meet.groups = nextBase.map(g => {
      const old = prev.get(g.id);
      return old && old.divisions ? { ...g, divisions: old.divisions } : g;
    });
    saveDb(req.db);
  }
  res.redirect(`/portal/meet/${meet.id}/builder?schemeSwitched=${wantUsars ? 'usars' : 'standard'}`);
});

// Load a saved setup preset into the current meet (copy reusable structure only)
router.post('/portal/meet/:meetId/setup-presets/load', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const presetId = String(req.body.presetId||'').trim();
  if(!Array.isArray(req.db.setupPresets)) req.db.setupPresets=[];
  const preset = req.db.setupPresets.find(p=>String(p.id)===presetId);
  if(!preset) return res.redirect(`/portal/meet/${meet.id}/builder`);

  // Copy only allowed fields from preset into meet
  meet.groups = JSON.parse(JSON.stringify(preset.groups || []));
  meet.openGroups = JSON.parse(JSON.stringify(preset.openGroups || []));
  meet.quadGroups = JSON.parse(JSON.stringify(preset.quadGroups || []));
  meet.additionalGroups = JSON.parse(JSON.stringify(preset.additionalGroups || preset.additionalRaceGroups || preset.additionalRaces || preset.skateabilityGroups || []));
  meet.additionalRaces = meet.additionalGroups.map(g => ({ ...g }));
  meet.additionalRaceGroups = meet.additionalGroups.map(g => ({ ...g }));
  meet.skateabilityGroups = meet.additionalGroups.map(g => ({ ...g }));
  meet.tiebreaker = preset.tiebreaker || meet.tiebreaker;
  meet.baseEntryFee = Number(preset.baseEntryFee || 0);
  // Load new global pricing fields with migration from old per-group costs
  if(preset.noviceEventFee !== undefined) {
    meet.noviceEventFee = Number(preset.noviceEventFee || 0);
  } else {
    // Migration: extract from first group with novice cost
    const oldCost = (preset.groups||[]).reduce((c,g)=>g.divisions?.novice?.cost||c,0);
    meet.noviceEventFee = Number(oldCost || 0);
  }
  if(preset.eliteEventFee !== undefined) {
    meet.eliteEventFee = Number(preset.eliteEventFee || 0);
  } else {
    // Migration: extract from first group with elite cost
    const oldCost = (preset.groups||[]).reduce((c,g)=>g.divisions?.elite?.cost||c,0);
    meet.eliteEventFee = Number(oldCost || 0);
  }
  meet.openEventFee = Number(preset.openEventFee || 0);
  meet.quadEventFee = Number(preset.quadEventFee || 0);
  meet.relayEventFee = Number(preset.relayEventFee || 0);
  meet.timeTrialEventFee = Number(preset.timeTrialEventFee || 0);
  meet.additionalRaceFee = Number(preset.additionalRaceFee || 0);
  meet.maxRegistrationFee = Number(preset.maxRegistrationFee || 0);
  meet.trackLength = preset.trackLength || meet.trackLength;
  const presetLaneCount = Number(preset.lanes);
  if (Number.isFinite(presetLaneCount) && presetLaneCount > 0) meet.lanes = presetLaneCount;
  const presetTrackLength = Number(preset.trackLength);
  if (Number.isFinite(presetTrackLength) && presetTrackLength > 0) meet.trackLength = presetTrackLength;
  meet.timeTrialsEnabled = !!preset.timeTrialsEnabled;
  meet.relayTemplates = JSON.parse(JSON.stringify(preset.relayTemplates || meet.relayTemplates || []));
  const presetRelayRaces = Array.isArray(preset.relayRaces) ? JSON.parse(JSON.stringify(preset.relayRaces)) : [];
  meet.relayEnabled = !!preset.relayEnabled || presetRelayRaces.length > 0;
  meet.judgesPanelRequired = !!preset.judgesPanelRequired;

  // Presets should restore the director's relay races too. Relay Builder creates
  // actual race shells, so saving only relayEnabled was not enough for templates.
  meet.races = (meet.races || []).filter(r => !r.isRelayRace);
  for (const relay of presetRelayRaces) {
    relay.isRelayRace = true;
    relay.division = relay.division || 'relay';
    relay.status = relay.status || 'open';
    relay.laneEntries = Array.isArray(relay.laneEntries) ? relay.laneEntries : [];
    meet.races.push(relay);
  }

  // Presets should restore the director's block layout, not erase it.
  // Rebuild race structure from the preset settings using the configured generator,
  // then map saved block raceIds onto the current meet's race IDs wherever possible.
  createDesktopBackupIfActive(req.db, 'before_race_generation', meet.id);
  generateConfiguredRacesForMeet(meet);
  rebuildRaceAssignmentsSafe(meet);
  restorePresetBlocksIntoMeet(preset, meet);

  // Mirror Additionals into compatibility aliases for existing saved data.
  meet.additionalGroups = makeAdditionalRaceSlots(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups);
  meet.additionalRaces = meet.additionalGroups.map(g => ({ ...g }));
  meet.additionalRaceGroups = meet.additionalGroups.map(g => ({ ...g }));
  meet.skateabilityGroups = meet.additionalGroups.map(g => ({ ...g }));
  // Preset pricing can change global fees, so refresh existing registration totals immediately.
  ensureRegistrationTotalsAndNumbers(meet);
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder?presetLoaded=1`);
});

// Delete a saved setup preset from the DB; does not alter existing meets that already used it
router.post('/portal/meet/:meetId/setup-presets/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');

  // Setup presets are global templates shared by meet builders.
  // Only super admins may delete them. Meet directors can save/load presets,
  // but they cannot remove shared templates that other meets may depend on.
  if(!canManageSetupPresets(req.user)) {
    return res.redirect(`/portal/meet/${meet.id}/builder?error=${encodeURIComponent('Only a super admin can delete shared setup presets.')}`);
  }

  const presetId = String(req.body.presetId||req.body.deletePresetId||'').trim();
  if(!presetId) {
    return res.redirect(`/portal/meet/${meet.id}/builder?error=${encodeURIComponent('Select a setup preset before deleting.')}`);
  }

  if(!Array.isArray(req.db.setupPresets)) req.db.setupPresets=[];
  const index = req.db.setupPresets.findIndex(p=>String(p.id)===presetId);
  if(index >= 0) {
    req.db.setupPresets.splice(index, 1);
    saveDb(req.db);
    return res.redirect(`/portal/meet/${meet.id}/builder?presetDeleted=1&clearPreset=1`);
  }
  res.redirect(`/portal/meet/${meet.id}/builder?error=${encodeURIComponent('Setup preset not found.')}`);
});

router.post('/portal/meet/:meetId/desktop-pin/generate', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const result = generatePinForMeet(meet);
  saveDb(req.db);
  res.send(pageShell({
    title:'Desktop Meet PIN',
    user:req.user,
    meet,
    activeTab:'builder',
    bodyHtml:`
      <div class="page-header"><h1>Desktop Meet PIN</h1><div class="sub">${esc(meet.meetName || '')}</div></div>
      <div class="card" style="max-width:620px;border-left:5px solid var(--orange)">
        <h2 style="margin-top:0">PIN Generated</h2>
        <div class="note" style="margin-bottom:12px">This PIN is shown once. Share it only with meet-day staff who should open this meet on SSM Desktop.</div>
        <div style="font-size:46px;font-weight:900;letter-spacing:.18em;color:var(--navy);line-height:1">${esc(result.pin)}</div>
        <div class="note" style="margin-top:12px">Expires: ${esc(result.expiresAt ? new Date(result.expiresAt).toLocaleString() : 'Not set')}</div>
        <div class="action-row" style="margin-top:18px">
          <a class="btn-orange" href="/portal/meet/${esc(meet.id)}/builder">Back To Meet Builder</a>
          <a class="btn2" href="/desktop/meet/${esc(meet.id)}/unlock">Open Meet On Desktop</a>
        </div>
      </div>
    `,
  }));
});

router.post('/portal/meet/:meetId/desktop-pin/clear', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  clearPinForMeet(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder?saved=1`);
});

// ── Download Meet to Desktop ────────────────────────────────────────────────
// Two endpoints that let SSM Desktop pull a meet down from this hosted site
// over the internet, then run it fully offline from then on. Display/data
// export only — these never modify the meet on this server.

router.get('/api/my-meets', requireRole('meet_director','judge','super_admin'), (req, res) => {
  const meets = coachVisibleMeets(req.db, req.user);
  res.json({
    ok: true,
    meets: meets.map(m => ({
      id: m.id,
      meetName: m.meetName || 'Untitled Meet',
      date: m.date || '',
      status: m.status || 'draft',
      registrationCount: Array.isArray(m.registrations) ? m.registrations.length : 0,
    })),
  });
});

router.get('/portal/meet/:meetId/desktop-export', requireRole('meet_director','judge','super_admin'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
  if (!canEditMeet(req.user, meet)) return res.status(403).json({ ok:false, error:'You do not have access to this meet.' });
  res.json({ ok:true, exportedAt: nowIso(), meet });
});

// Save meet fields and sync configured races while preserving the manual Block Builder schedule.
// This save button must not rebalance heats or wipe block assignments.
router.post('/portal/meet/:meetId/builder/save-meet', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const oldLaneCount = Number(meet.lanes || 4);
  const oldTrackLength = Number(meet.trackLength || 100);
  saveMeetFields(meet, req.body, req.db);
  const laneOrTrackChanged = Number(meet.lanes || 4) !== oldLaneCount || Number(meet.trackLength || 100) !== oldTrackLength;
  createDesktopBackupIfActive(req.db, 'before_race_generation', meet.id);
  generateConfiguredRacesForMeet(meet);
  // Lane count controls heat splitting and lane rows. If it changed, immediately rebuild
  // assignments safely so the Block Builder does not keep races built from the old lane count.
  if (laneOrTrackChanged) rebuildRaceAssignmentsSafe(meet);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/builder?saved=1${laneOrTrackChanged?'&lanesSaved=1':''}`);
});

// Save AND rebuild races — warns user first via confirm dialog in the UI
router.post('/portal/meet/:meetId/builder/save', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  saveMeetFields(meet, req.body, req.db);
  createDesktopBackupIfActive(req.db, 'before_race_generation', meet.id);
  generateConfiguredRacesForMeet(meet); rebuildRaceAssignmentsSafe(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/blocks`);
});


// ── Relay Builder ─────────────────────────────────────────────────────────────






router.get('/portal/meet/:meetId/relay-builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.relayTemplates=normalizeRelayTemplates(meet.relayTemplates);
  res.send(pageShell({
    title:'Relay Builder',
    user:req.user,
    meet,
    activeTab:'relay-builder',
    bodyHtml:renderRelayBuilderView({
      meet,
      saved:req.query.saved,
      added:req.query.added,
      gen: req.query.gen ? {
        created: Number(req.query.created||0),
        updated: Number(req.query.updated||0),
        skipped: Number(req.query.skipped||0),
        bracketed: String(req.query.bracketed||'').split('|').map(s=>s.trim()).filter(Boolean),
        needsHeats: String(req.query.heats||'').split('|').map(s=>s.trim()).filter(Boolean),
      } : null,
    }),
  }));
});

router.post('/portal/meet/:meetId/relay-builder/add-template', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  let added=0;
  meet.relayTemplates = RELAY_TEMPLATE_ROWS.map((base, idx)=>{
    const enabled = req.body[`enabled_${idx}`] === 'on';
    const relayType=String(req.body[`relayType_${idx}`]||base.type).trim();
    const ageGroup=String(req.body[`ageGroup_${idx}`]||base.age).trim();
    const ageRange=normalizeRelayAgeRange(req.body[`ageRange_${idx}`] || base.ageRange || base.ages || '');
    const distance=String(req.body[`distance_${idx}`]||base.distance).trim();
    const notes=String(req.body[`notes_${idx}`]||base.notes).trim();

    if(enabled){
      const name=[ageGroup, relayType, 'Relay'].filter(Boolean).join(' ');
      // Match by relayDivisionId first so the builder and the coach-form generator
      // (services/relayGenerator.js) share one race per division; fall back to
      // name+distance for legacy relay races created before divisionId existed.
      let race=(meet.races||[]).find(r =>
        r.isRelayRace && base.divisionId && r.relayDivisionId === base.divisionId
      ) || (meet.races||[]).find(r =>
        r.isRelayRace &&
        String(r.groupLabel||'').trim().toLowerCase() === String(name||'').trim().toLowerCase() &&
        String(r.distanceLabel||'').trim().toLowerCase() === String(distance||'').trim().toLowerCase()
      );

      if(race) {
        race.relayType = relayType;
        race.relayAgeGroup = ageGroup;
        race.relayAgeRange = ageRange;
        race.ages = ageRange || ageGroup;
        race.notes = notes;
        if(base.divisionId) race.relayDivisionId = base.divisionId;
      } else if(name && distance){
        race=makeRelayRace({ name, distance, notes, relayType, ageGroup, ageRange });
        if(base.divisionId) race.relayDivisionId = base.divisionId;
        race.orderHint=9800+(meet.races||[]).filter(r=>r.isRelayRace).length+added;
        meet.races.push(race);
        added+=1;
      }
    }

    return {
      enabled,
      type: relayType,
      age: ageGroup,
      ageRange,
      distance,
      notes,
      divisionId: base.divisionId,
    };
  });

  meet.updatedAt=nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/relay-builder?saved=1&added=${added}`);
});

// Stage 4a: build relay finals from coach-submitted teams (meet.relayTeams).
router.post('/portal/meet/:meetId/relay-builder/generate-from-teams', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const { created, updated, skipped, needsHeats, bracketed } = buildRelayRacesFromTeams(meet);
  meet.updatedAt=nowIso();
  saveDb(req.db);
  const q = [
    'gen=1',
    `created=${created.length}`,
    `updated=${updated.length}`,
    `skipped=${skipped.length}`,
    `bracketed=${encodeURIComponent((bracketed||[]).map(b=>`${b.label} (${b.heats}h${b.semis?'+2s':''})`).join('|'))}`,
    `heats=${encodeURIComponent(needsHeats.map(h=>h.label).join('|'))}`,
  ].join('&');
  res.redirect(`/portal/meet/${meet.id}/relay-builder?${q}`);
});

router.post('/portal/meet/:meetId/relay-builder/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const raceId=String(req.body.raceId||'');
  const race=(meet.races||[]).find(r=>r.id===raceId);
  meet.races=(meet.races||[]).filter(r=>r.id!==raceId);
  meet.blocks=(meet.blocks||[]).map(b=>({...b,raceIds:(b.raceIds||[]).filter(id=>id!==raceId)}));
  if(race && Array.isArray(meet.relayTemplates)) {
    meet.relayTemplates=meet.relayTemplates.map(t=>{
      const sameAge=String(t.age||'')===String(race.relayAgeGroup||'');
      const sameType=String(t.type||'')===String(race.relayType||'');
      const sameDistance=String(t.distance||'')===String(race.distanceLabel||'');
      return (sameAge&&sameType&&sameDistance)?{...t,enabled:false}:t;
    });
  }
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/relay-builder`);
});

// ── Open Builder ──────────────────────────────────────────────────────────────

router.get('/portal/meet/:meetId/open-builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.openGroups=normalizeOpenGroups(meet.openGroups);
  res.send(pageShell({
    title:'Open Builder',
    user:req.user,
    meet,
    activeTab:'open-builder',
    bodyHtml:renderOpenBuilderView({
      meet,
      openGroupDefaults:OPEN_GROUP_DEFAULTS,
      saved:!!req.query.saved,
    }),
  }));
});

router.post('/portal/meet/:meetId/open-builder/save', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.openGroups=normalizeOpenGroups(meet.openGroups);
  meet.openGroups.forEach((og,i)=>{
    og.enabled=!!req.body[`og_${i}_enabled`];
    og.ages=String(req.body[`og_${i}_ages`]||'').trim()||og.ages;
    og.distance=String(req.body[`og_${i}_distance`]||'').trim()||og.distance;
  });
  createDesktopBackupIfActive(req.db, 'before_race_generation', meet.id);
  generateConfiguredRacesForMeet(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  meet.updatedAt=nowIso();
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/open-builder?saved=1`);
});

// ── Quad Builder ──────────────────────────────────────────────────────────────

router.get('/portal/meet/:meetId/quad-builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.quadGroups=normalizeQuadGroups(meet.quadGroups);
  res.send(pageShell({
    title:'Quad Builder',
    user:req.user,
    meet,
    activeTab:'quad-builder',
    bodyHtml:renderQuadBuilderView({
      meet,
      quadGroupDefaults:QUAD_GROUP_DEFAULTS,
      saved:!!req.query.saved,
      raceDisplayStage,
    }),
  }));
});

router.post('/portal/meet/:meetId/quad-builder/save', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.quadGroups=normalizeQuadGroups(meet.quadGroups);
  meet.quadGroups.forEach((qg,i)=>{
    qg.enabled=!!req.body[`qg_${i}_enabled`];
    qg.distances[0]=String(req.body[`qg_${i}_d1`]||'').trim()||qg.distances[0];
    qg.distances[1]=String(req.body[`qg_${i}_d2`]||'').trim()||qg.distances[1];
  });
  createDesktopBackupIfActive(req.db, 'before_race_generation', meet.id);
  generateConfiguredRacesForMeet(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/quad-builder?saved=1`);
});

  return router;
};
