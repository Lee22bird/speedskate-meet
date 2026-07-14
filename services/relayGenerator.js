// Stage 4a: turn coach-submitted relay teams (meet.relayTeams, built by the coach
// relay form) into actual relay races. Each division with teams becomes a single
// FINAL with those teams pre-loaded as lane entries (a whole team per lane). This
// is complete for the common case (USARS SR505: <=7 -> straight final). Divisions
// with more teams than a single final holds are REPORTED as "needs heats", not
// built here — heat/semi splitting is stage 4b (reuses the SR505 engine + the
// 3-person SR505.9 table). We never emit an oversized/broken final.
const { DIRECT_FINAL_MAX } = require('./raceSizing');
const { RELAY_DIVISIONS, RELAY_DIVISION_BY_ID } = require('./relayDivisions');
const { makeRelayRace } = require('./relayHelpers');

// Readable team label from member registration names, e.g. "Ava R / Bea S".
function teamLabel(team, regById) {
  const names = (team.memberRegIds || [])
    .map(id => regById.get(String(id)))
    .filter(Boolean)
    .map(r => String(r.name || '').trim())
    .filter(Boolean);
  return names.join(' / ') || 'Relay Team';
}

// One submitted team -> one race lane entry (a whole team in a lane). Member names
// live in skaterName and the club in team so they survive race-day edits (which
// rebuild entries from a fixed field list); relay identity is carried too and is
// preserved by laneResultFromBody.
function teamLaneEntry(team, lane, regById) {
  return {
    lane,
    registrationId: '',
    helmetNumber: '',
    skaterName: teamLabel(team, regById),
    team: String(team.club || '').trim(),
    place: '',
    time: '',
    status: '',
    relayTeamId: team.id,
    relayMemberRegIds: Array.isArray(team.memberRegIds) ? team.memberRegIds.slice() : [],
    color: String(team.color || '').trim(),
  };
}

// True once anyone has entered a place or a DQ/status on this race's lanes.
function raceHasResults(race) {
  return (race.laneEntries || []).some(e => String(e.place || '').trim() || String(e.status || '').trim());
}

// Generate/refresh relay finals from meet.relayTeams. Mutates meet.races.
// Returns { created, updated, skipped, needsHeats } for reporting.
function buildRelayRacesFromTeams(meet) {
  const teams = Array.isArray(meet.relayTeams) ? meet.relayTeams : [];
  const regById = new Map((meet.registrations || []).map(r => [String(r.id), r]));
  meet.races = Array.isArray(meet.races) ? meet.races : [];

  const byDiv = new Map();
  for (const t of teams) {
    if (!RELAY_DIVISION_BY_ID.has(t.divisionId)) continue;
    if (!Array.isArray(t.memberRegIds) || t.memberRegIds.length === 0) continue;
    const arr = byDiv.get(t.divisionId) || [];
    arr.push(t);
    byDiv.set(t.divisionId, arr);
  }

  const created = [], updated = [], skipped = [], needsHeats = [];

  for (const div of RELAY_DIVISIONS) {
    const divTeams = byDiv.get(div.id);
    if (!divTeams || !divTeams.length) continue;

    const existing = meet.races.find(r => r.isRelayRace && r.relayDivisionId === div.id);
    const info = { divisionId: div.id, label: div.label, teamCount: divTeams.length };

    // Too many teams for one final — defer to heat generation (stage 4b).
    if (divTeams.length > DIRECT_FINAL_MAX) { needsHeats.push(info); continue; }

    // Never clobber a race that already has results entered on race day.
    if (existing && raceHasResults(existing)) { skipped.push(info); continue; }

    const laneEntries = divTeams.map((t, i) => teamLaneEntry(t, i + 1, regById));

    if (existing) {
      existing.laneEntries = laneEntries;
      existing.distanceLabel = div.distance;
      existing.groupLabel = div.label + ' Relay';
      updated.push(existing);
    } else {
      const race = makeRelayRace({
        name: div.label + ' Relay',
        distance: div.distance,
        relayType: div.size + ' Person',
        ageGroup: div.label,
        ageRange: div.ageRange,
      });
      race.relayDivisionId = div.id;
      race.laneEntries = laneEntries;
      race.orderHint = 9800 + RELAY_DIVISIONS.indexOf(div);
      meet.races.push(race);
      created.push(race);
    }
  }

  return { created, updated, skipped, needsHeats };
}

module.exports = { buildRelayRacesFromTeams, teamLabel };
