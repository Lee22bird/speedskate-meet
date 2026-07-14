// Relay race generation + advancement from coach-submitted teams (meet.relayTeams).
//
// Stage 4a: <=7 teams -> a single FINAL with the teams pre-loaded (USARS SR505.5).
// Stage 4b: 2- & 4-person divisions with >7 teams -> heats -> (2 semis) -> final,
//   reusing the individual SR505.3/.4 PLACE-BASED engine (contestant TEAMS as the
//   entries). Semis are created lazily on the last heat close, same as individuals.
//   3-PERSON relays with >7 teams use SR505.9 win-and-in + fastest TIMES — a
//   different system not built here yet (reported as needsHeats).
//
// The advancement here mirrors meetHelpers' individual engine but keys the family
// by relayDivisionId and preserves relay-team identity. meetHelpers is accessed
// lazily (property-at-call-time) to avoid a require cycle.
const crypto = require('crypto');
const { nowIso } = require('../utils/date');
const { DIRECT_FINAL_MAX, planRelayRaceSizing, planThreePersonRelaySizing, distributeByTeam } = require('./raceSizing');
const { RELAY_DIVISIONS, RELAY_DIVISION_BY_ID } = require('./relayDivisions');
const { makeRelayRace } = require('./relayHelpers');
const mh = require('./meetHelpers'); // lazy access: mh.semiSeedingPlan / orderedFinishers / numericPlace

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
// live in skaterName and the club in team so they survive race-day edits; relay
// identity is carried too and is preserved by laneResultFromBody.
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

function raceHasResults(race) {
  return (race.laneEntries || []).some(e => String(e.place || '').trim() || String(e.status || '').trim());
}

// A relay race for a division at a given stage/order.
function makeRelayStageRace(div, order) {
  const race = makeRelayRace({
    name: div.label + ' Relay',
    distance: div.distance,
    relayType: div.size + ' Person',
    ageGroup: div.label,
    ageRange: div.ageRange,
  });
  race.relayDivisionId = div.id;
  race.orderHint = order;
  return race;
}

// Generate/refresh relay races from meet.relayTeams. Mutates meet.races.
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

  const created = [], updated = [], skipped = [], needsHeats = [], bracketed = [];

  for (const div of RELAY_DIVISIONS) {
    const divTeams = byDiv.get(div.id);
    if (!divTeams || !divTeams.length) continue;
    const info = { divisionId: div.id, label: div.label, teamCount: divTeams.length };

    const existing = meet.races.filter(r => r.isRelayRace && r.relayDivisionId === div.id);
    // Never clobber a division whose races already have results entered.
    if (existing.some(raceHasResults)) { skipped.push(info); continue; }

    const laneEntries = divTeams.map((t, i) => teamLaneEntry(t, i + 1, regById));
    const base = 9800 + RELAY_DIVISIONS.indexOf(div);

    // Rebuild this division's (resultless) relay races from scratch.
    meet.races = meet.races.filter(r => !(r.isRelayRace && r.relayDivisionId === div.id));

    if (divTeams.length <= DIRECT_FINAL_MAX) {
      // Single final (SR505.5).
      const race = makeRelayStageRace(div, base + 0.9);
      race.laneEntries = laneEntries;
      meet.races.push(race);
      created.push(race);
    } else {
      // Heats + final shell; semis created lazily on close. 2p/4p qualify by PLACE
      // (SR505.3/.4); 3-person by TIME (SR505.9 win-and-in + fastest-times), so its
      // heats/semis record times.
      const plan = planRelayRaceSizing(divTeams.length, div.size);
      const timesBased = div.size === 3;
      const buckets = distributeByTeam(laneEntries, plan.heatSizes);
      buckets.forEach((bucket, idx) => {
        const heat = makeRelayStageRace(div, base + (idx + 1) * 0.01);
        heat.stage = 'heat';
        heat.heatNumber = idx + 1;
        heat.isFinal = false;
        if (timesBased) heat.resultsMode = 'times';
        heat.laneEntries = bucket.map((e, i) => ({ ...e, lane: i + 1 }));
        meet.races.push(heat);
      });
      const finalRace = makeRelayStageRace(div, base + 0.9);
      finalRace.laneEntries = [];
      meet.races.push(finalRace);
      bracketed.push({ ...info, heats: plan.heatCount, semis: plan.semiCount || 0, timesBased });
    }
  }

  return { created, updated, skipped, needsHeats, bracketed };
}

// ── Relay advancement (place-based, 2p/4p) ────────────────────────────────────
// Mirrors the individual SR505.4 engine but keys the family by relayDivisionId and
// keeps relay-team identity. 3-person relays are excluded (SR505.9 times system).
function relayFamily(meet, race) {
  const divId = race && race.relayDivisionId;
  return divId ? (meet.races || []).filter(r => r.isRelayRace && r.relayDivisionId === divId) : [];
}

function relayEntry(src, fromLabel) {
  return {
    lane: 0,
    registrationId: '',
    helmetNumber: '',
    skaterName: src.skaterName || '',
    team: src.team || '',
    place: '', time: '', status: '',
    relayTeamId: src.relayTeamId,
    relayMemberRegIds: Array.isArray(src.relayMemberRegIds) ? src.relayMemberRegIds.slice() : [],
    color: src.color || '',
    qualifiedFrom: fromLabel,
  };
}

function relayHasEnteredResults(race) {
  return (race.laneEntries || []).some(e => mh.numericPlace(e.place) !== null || String(e.status || '').trim());
}

function byHeatNum(a, b) { return Number(a.heatNumber || 0) - Number(b.heatNumber || 0); }
function stageIs(r, s) { return String(r.stage || '').toLowerCase() === s; }

// Seed the final directly from 2 closed heats (top 3 each → 6). SR505.3 8–14 band.
function relayTwoHeatsToFinal(meet, changedRace) {
  const family = relayFamily(meet, changedRace);
  const heats = family.filter(r => stageIs(r, 'heat')).sort(byHeatNum);
  const finalRace = family.find(r => stageIs(r, 'final') || r.isFinal);
  if (!finalRace) return { advanced: false, reason: 'missing_final' };
  if (heats.length !== 2) return { advanced: false, reason: 'not_two_heats' };
  if (heats.some(h => String(h.status || '') !== 'closed')) return { advanced: false, reason: 'heats_not_closed' };
  if (relayHasEnteredResults(finalRace)) return { advanced: false, reason: 'final_has_results' };
  const qualifiers = [];
  for (const heat of heats) {
    const top3 = mh.orderedFinishers(heat).slice(0, 3);
    if (top3.length < 3) return { advanced: false, reason: 'missing_top_three' };
    for (const e of top3) qualifiers.push(relayEntry(e, 'H' + Number(heat.heatNumber || 0)));
  }
  finalRace.laneEntries = qualifiers.slice(0, 6).map((e, i) => ({ ...e, lane: i + 1 }));
  finalRace.status = String(finalRace.status || '') === 'closed' ? 'closed' : 'open';
  finalRace.isFinal = true;
  finalRace.advancedFromHeatsAt = nowIso();
  finalRace.advancementWarning = '';
  return { advanced: true, finalRaceId: finalRace.id };
}

// Seed the 2 semis from closed heats (SR505.4 seeding); creates the semis lazily.
function relayHeatsToSemis(meet, changedRace) {
  const family = relayFamily(meet, changedRace);
  const heats = family.filter(r => stageIs(r, 'heat')).sort(byHeatNum);
  const finalRace = family.find(r => stageIs(r, 'final') || r.isFinal);
  if (!finalRace) return { advanced: false, reason: 'missing_final' };
  const plan = mh.semiSeedingPlan(heats.length);
  if (!plan) { finalRace.advancementWarning = `Manual advancement required — ${heats.length} heats.`; return { advanced: false, reason: 'unsupported_heat_count' }; }
  if (heats.some(h => String(h.status || '') !== 'closed')) return { advanced: false, reason: 'heats_not_closed' };

  const finByNum = new Map(heats.map(h => [Number(h.heatNumber || 0), mh.orderedFinishers(h)]));
  const semiQual = [];
  for (const pairs of plan) {
    const q = [];
    for (const [hn, pl] of pairs) {
      const src = (finByNum.get(hn) || [])[pl - 1];
      if (!src) return { advanced: false, reason: 'missing_qualifiers' };
      q.push(relayEntry(src, 'H' + hn));
    }
    semiQual.push(q);
  }

  let semis = family.filter(r => stageIs(r, 'semi')).sort(byHeatNum);
  if (semis.some(relayHasEnteredResults)) return { advanced: false, reason: 'semis_have_results' };
  if (semis.length !== 2) {
    if (semis.length) meet.races = meet.races.filter(r => !(stageIs(r, 'semi') && r.isRelayRace && r.relayDivisionId === changedRace.relayDivisionId));
    semis = [1, 2].map(n => ({
      ...finalRace,
      id: 'r' + crypto.randomBytes(6).toString('hex'),
      stage: 'semi',
      heatNumber: n,
      isFinal: false,
      orderHint: Number(finalRace.orderHint || 0) - (n === 1 ? 0.11 : 0.10),
      status: 'open',
      closedAt: '',
      laneEntries: [],
      advancementWarning: '',
      advancedFromHeatsAt: '',
      advancedFromSemisAt: '',
    }));
    meet.races.push(...semis);
  }
  semis.forEach((semi, i) => {
    semi.laneEntries = semiQual[i].map((e, idx) => ({ ...e, lane: idx + 1 }));
    semi.resultsMode = semi.resultsMode || 'places';
    semi.status = String(semi.status || '') === 'closed' ? 'closed' : 'open';
    semi.stage = 'semi';
    semi.isFinal = false;
    semi.advancedFromHeatsAt = nowIso();
  });
  finalRace.advancementWarning = '';
  return { advanced: true, semiRaceIds: semis.map(s => s.id) };
}

// Seed the final from the 2 closed semis (top 3 each → 6).
function relaySemisToFinal(meet, changedRace) {
  const family = relayFamily(meet, changedRace);
  const semis = family.filter(r => stageIs(r, 'semi')).sort(byHeatNum);
  const finalRace = family.find(r => stageIs(r, 'final') || r.isFinal);
  if (!finalRace) return { advanced: false, reason: 'missing_final' };
  if (semis.length !== 2) return { advanced: false, reason: 'not_two_semis' };
  if (semis.some(s => String(s.status || '') !== 'closed')) return { advanced: false, reason: 'semis_not_closed' };
  const qualifiers = [];
  for (const semi of semis) {
    const top3 = mh.orderedFinishers(semi).slice(0, 3);
    if (top3.length < 3) return { advanced: false, reason: 'missing_top_three' };
    for (const e of top3) qualifiers.push(relayEntry(e, 'S' + Number(semi.heatNumber || 0)));
  }
  finalRace.laneEntries = qualifiers.slice(0, 6).map((e, i) => ({ ...e, lane: i + 1 }));
  finalRace.status = String(finalRace.status || '') === 'closed' ? 'closed' : 'open';
  finalRace.isFinal = true;
  finalRace.advancedFromSemisAt = nowIso();
  finalRace.advancementWarning = '';
  return { advanced: true, finalRaceId: finalRace.id };
}

// ── 3-person relay advancement (SR505.9 win-and-in + fastest TIMES) ────────────
function numericTime(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
// Teams in a race with a valid time and no DQ, fastest first.
function timedFinishers(race) {
  return (race.laneEntries || [])
    .filter(e => numericTime(e.time) !== null && !String(e.status || '').trim())
    .sort((a, b) => numericTime(a.time) - numericTime(b.time));
}
// Win-and-in + fastest times: the winner (fastest) of each heat advances directly,
// then the remaining slots are filled by the fastest times among all non-winners.
// Returns advanceTotal qualifiers ({entry, from}) or null if any heat has no times.
function winAndInQualifiers(heats, advanceTotal) {
  const winners = [], rest = [];
  for (const heat of heats) {
    const fin = timedFinishers(heat);
    if (!fin.length) return null;
    winners.push({ entry: fin[0], from: 'H' + Number(heat.heatNumber || 0) });
    for (const e of fin.slice(1)) rest.push({ entry: e, from: 'H' + Number(heat.heatNumber || 0), t: numericTime(e.time) });
  }
  rest.sort((a, b) => a.t - b.t);
  return [...winners, ...rest.slice(0, Math.max(0, advanceTotal - winners.length))].slice(0, advanceTotal);
}

function advanceThreePersonRelay(meet, changedRace) {
  const family = relayFamily(meet, changedRace);
  const finalRace = family.find(r => stageIs(r, 'final') || r.isFinal);
  if (!finalRace) return { advanced: false, reason: 'missing_final' };
  const stage = String(changedRace.stage || '').toLowerCase();

  if (stage === 'semi') {
    const semis = family.filter(r => stageIs(r, 'semi')).sort(byHeatNum);
    if (semis.length !== 2) return { advanced: false, reason: 'not_two_semis' };
    if (semis.some(s => String(s.status || '') !== 'closed')) return { advanced: false, reason: 'semis_not_closed' };
    const quals = winAndInQualifiers(semis, 6); // 2 semi winners + 4 fastest times
    if (!quals) return { advanced: false, reason: 'missing_qualifiers' };
    finalRace.laneEntries = quals.map((q, i) => ({ ...relayEntry(q.entry, q.from), lane: i + 1 }));
    finalRace.status = String(finalRace.status || '') === 'closed' ? 'closed' : 'open';
    finalRace.isFinal = true;
    finalRace.advancedFromSemisAt = nowIso();
    finalRace.advancementWarning = '';
    return { advanced: true, finalRaceId: finalRace.id };
  }
  if (stage !== 'heat') return { advanced: false, reason: 'not_progression_stage' };

  const heats = family.filter(r => stageIs(r, 'heat')).sort(byHeatNum);
  if (heats.some(h => String(h.status || '') !== 'closed')) return { advanced: false, reason: 'heats_not_closed' };
  const totalTeams = heats.reduce((n, h) => n + (h.laneEntries || []).length, 0);
  const adv = planThreePersonRelaySizing(totalTeams).advancement;
  if (!adv) return { advanced: false, reason: 'unsupported' };

  const quals = winAndInQualifiers(heats, adv.advanceTotal);
  if (!quals) return { advanced: false, reason: 'missing_qualifiers' };

  if (adv.semiCount === 2) {
    // Seed the 12 qualifiers into 2 semis of 6, snaked by qualifying rank so the
    // winners and fastest are spread (SR505.9 gives no explicit 3-person seeding).
    let semis = family.filter(r => stageIs(r, 'semi')).sort(byHeatNum);
    if (semis.some(relayHasEnteredResults)) return { advanced: false, reason: 'semis_have_results' };
    if (semis.length !== 2) {
      if (semis.length) meet.races = meet.races.filter(r => !(stageIs(r, 'semi') && r.isRelayRace && r.relayDivisionId === changedRace.relayDivisionId));
      semis = [1, 2].map(n => ({
        ...finalRace,
        id: 'r' + crypto.randomBytes(6).toString('hex'),
        stage: 'semi', heatNumber: n, isFinal: false, resultsMode: 'times',
        orderHint: Number(finalRace.orderHint || 0) - (n === 1 ? 0.11 : 0.10),
        status: 'open', closedAt: '', laneEntries: [], advancedFromHeatsAt: '', advancedFromSemisAt: '',
      }));
      meet.races.push(...semis);
    }
    const lanes = [[], []];
    quals.forEach((q, i) => lanes[i % 2].push(q));
    semis.forEach((semi, si) => {
      semi.laneEntries = lanes[si].map((q, i) => ({ ...relayEntry(q.entry, q.from), lane: i + 1 }));
      semi.resultsMode = 'times'; semi.stage = 'semi'; semi.isFinal = false;
      semi.status = String(semi.status || '') === 'closed' ? 'closed' : 'open';
      semi.advancedFromHeatsAt = nowIso();
    });
    return { advanced: true, semiRaceIds: semis.map(s => s.id) };
  }
  // Direct to the final (8–21 teams: 6 qualify).
  finalRace.laneEntries = quals.slice(0, 6).map((q, i) => ({ ...relayEntry(q.entry, q.from), lane: i + 1 }));
  finalRace.status = String(finalRace.status || '') === 'closed' ? 'closed' : 'open';
  finalRace.isFinal = true;
  finalRace.advancedFromHeatsAt = nowIso();
  finalRace.advancementWarning = '';
  return { advanced: true, finalRaceId: finalRace.id };
}

// Race-close dispatcher for relays. 2p/4p -> place-based; 3-person -> times (SR505.9).
function advanceRelayProgression(meet, changedRace) {
  if (!changedRace || !changedRace.isRelayRace || !changedRace.relayDivisionId) return { advanced: false, reason: 'not_relay' };
  const div = RELAY_DIVISION_BY_ID.get(changedRace.relayDivisionId);
  if (div && div.size === 3) return advanceThreePersonRelay(meet, changedRace);
  const stage = String(changedRace.stage || '').toLowerCase();
  if (stage === 'semi') return relaySemisToFinal(meet, changedRace);
  if (stage !== 'heat') return { advanced: false, reason: 'not_progression_stage' };
  const heats = relayFamily(meet, changedRace).filter(r => stageIs(r, 'heat'));
  if (heats.length >= 3 && heats.length <= 4) return relayHeatsToSemis(meet, changedRace);
  return relayTwoHeatsToFinal(meet, changedRace);
}

module.exports = { buildRelayRacesFromTeams, teamLabel, advanceRelayProgression };
