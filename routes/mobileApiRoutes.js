const express = require('express');
const { esc } = require('../utils/html');
const {
  hasRole, canEditMeet, canJudgeMeet, isMeetOwner, isAssignedTabulatorForMeet,
} = require('../utils/auth');
const {
  isPublicMeet, meetRinkLabel, meetDateLabel, getMeetOr404, coachTeamRegistrations,
  combineDateTime, generateConfiguredRacesForMeet, ensureAtLeastOneBlock,
  normalizeOpenGroups, normalizeQuadGroups,
} = require('../services/meetHelpers');
const {
  orderedRaces, currentRaceInfo, raceDayProgress, laneRowsForRace,
  recentClosedRaces, raceDisplayStage, ensureCurrentRace,
} = require('../services/raceDay');
const {
  computeMeetStandings, computeQuadStandings, computeOpenResults,
} = require('../services/standings');
const { staffAssignmentsForMeet } = require('../services/staffAssignments');
const {
  relayDivisionsForRuleset, RELAY_DIVISION_BY_ID, eligibleForRelayDivision,
} = require('../services/relayDivisions');
const { buildRelayRacesFromTeams } = require('../services/relayGenerator');
const { rebuildRaceAssignmentsSafe } = require('../services/ttHelpers');
const { createBackup: createDesktopBackup } = require('../services/desktopBackupService');
const { normalizeTimeTrialSettings, ensureTimeTrialEvent } = require('../services/timeTrialEvents');
const {
  relayTemplateRowsForRuleset, normalizeRelayTemplates, normalizeRelayAgeRange, makeRelayRace,
} = require('../services/relayHelpers');

// Desktop-run meets snapshot before any destructive race regeneration, exactly
// like the website's builder saves do (createDesktopBackupIfActive in server.js).
function backupBeforeRegen(db, meetId) {
  if (process.env.SSM_DESKTOP !== '1') return;
  try { createDesktopBackup({ db, reason: 'before_race_generation', meetId }); }
  catch (err) { console.warn('Desktop backup skipped (before_race_generation):', err.message); }
}

// Racing has started once any race is closed — from then on, edits that would
// rebuild/rerandomize races are refused (the rebuild blanks closed races'
// results and deletes heats/semis).
function racingHasStarted(meet) {
  return (meet.races || []).some(r => String(r.status || '') === 'closed');
}

// Mirror of server.js relayDeadlinePassed (keep in sync): datetime-local has no
// timezone and prod runs UTC, so pin to UTC + a 12h grace so the lock never
// trips EARLY for a US meet.
function relayDeadlinePassed(meet) {
  const raw = meet && meet.relayDeadline ? String(meet.relayDeadline).trim() : '';
  if (!raw) return false;
  const iso = /\dT\d/.test(raw) ? raw + 'Z' : raw;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return Date.now() > t + 12 * 3600 * 1000;
}
const {
  protestsForMeet, normalizeProtest, findProtest, unresolvedProtestCount,
  protestsForCoach, buildProtest, isRaceSpecific, raceProtestWindowClosed,
  protestDeadlineMinutes, PROTEST_CATEGORIES, RACE_SPECIFIC_CATEGORIES,
} = require('../services/protests');

// Server-controlled "featured schedule" promo shown as a banner under the
// app's Nationals tab. Returning null hides the banner in the app with NO app
// update. It auto-expires the day after Nationals ends, and can be killed
// early by setting SSM_HIDE_NATIONALS=1 in the environment.
function featuredScheduleConfig() {
  if (String(process.env.SSM_HIDE_NATIONALS || '').trim() === '1') return null;
  // Day after the 2026 Indoor Nationals ends (Central time ~ UTC-5).
  const expiresAt = Date.parse('2026-07-16T05:00:00Z');
  if (Date.now() > expiresAt) return null;
  return {
    title: '2026 Indoor Nationals',
    subtitle: 'View the full event schedule',
    url: 'https://speedskatemeet.com/nationals?embed=1',
  };
}

// ── JSON API for the SSM Companion iOS app ─────────────────────────────────
// Display/control only — every handler here calls the exact same service
// functions the website already uses (computeMeetStandings, currentRaceInfo,
// canEditMeet, etc.). Nothing in this file recomputes scoring, race
// generation, or permissions logic; it only re-shapes existing data as JSON
// and, for staff controls, defers to the same /api/meet/:meetId/race-day/*
// endpoints the website's Director panel already uses.

function isTimeTrialItem(item) {
  return item?.type === 'time_trial';
}

function laneToJson(lane, regMap) {
  const reg = regMap.get(Number(lane.registrationId));
  return {
    lane: lane.lane,
    helmetNumber: lane.helmetNumber || null,
    skaterName: lane.skaterName || '',
    team: lane.team || '',
    sponsor: reg?.sponsor || null,
    place: lane.place || null,
    time: lane.time || null,
    status: lane.status || null,
  };
}

// ── Day-of race merge (display only) ───────────────────────────────────────
// Two races (e.g. Elite Veteran & Esquire Men) line up and start as ONE pack
// but stay separate race objects scored independently. These mirror the
// route-private helpers in routes/raceDayRoutes.js (293-313) so the mobile
// display can show the combined, renumbered pack; they are NOT exported from a
// service, so we reimplement them here. Result ENTRY stays per-division — the
// tabulator hydrates each race from desktop-export, never from this pack sheet.
function mergeGroupMembers(meet, race) {
  if (!race || !race.mergeGroupId) return null;
  const members = (meet.races || [])
    .filter(r => r && r.mergeGroupId === race.mergeGroupId)
    .sort((a, b) => (a.mergeLead ? 0 : 1) - (b.mergeLead ? 0 : 1)); // lead first
  return members.length > 1 ? members : null;
}

function mergePackLabel(meet, race) {
  const members = mergeGroupMembers(meet, race);
  if (!members) return race && race.groupLabel ? race.groupLabel : '';
  return members.map(m => m.groupLabel || '').filter(Boolean).join(' & ');
}

// Combined, renumbered pack sheet: real skaters only (empties filtered like the
// website's print card), each lane renumbered 1..N across the pack and tagged
// with its home division label (`division` = the member's groupLabel).
function mergedPackLanesJson(meet, race, regMap) {
  const members = mergeGroupMembers(meet, race);
  if (!members) return null;
  const rows = [];
  let pos = 0;
  for (const m of members) {
    for (const ln of laneRowsForRace(m, meet)) {
      if (!ln.skaterName) continue;
      pos += 1;
      rows.push({ ...laneToJson(ln, regMap), lane: pos, division: m.groupLabel || '' });
    }
  }
  return rows;
}

function raceDayItemToJson(item, meet, regMap) {
  if (!item) return null;
  if (isTimeTrialItem(item)) {
    return {
      id: item.id,
      type: 'time_trial',
      groupLabel: item.groupLabel,
      distanceLabel: item.distanceLabel,
      stage: 'Event',
      lanes: [],
    };
  }
  const lanes = laneRowsForRace(item, meet).filter(l => l.skaterName).map(l => laneToJson(l, regMap));
  // Merged pack (display only): `lanes` stays this race's own lanes (entry is
  // per-division); `mergedLanes` carries the combined, renumbered, division-
  // tagged pack sheet for the Director/Announcer/Live boards.
  const mergedLanes = mergedPackLanesJson(meet, item, regMap);
  const isMerged = mergedLanes != null;
  return {
    id: item.id,
    type: 'race',
    groupLabel: item.groupLabel,
    division: item.division,
    distanceLabel: item.distanceLabel,
    stage: raceDisplayStage(item),
    startType: item.startType || null,
    status: item.status || 'open',
    isOpenRace: !!item.isOpenRace,
    isQuadRace: !!item.isQuadRace,
    // Relay race: each lane is a TEAM (skaterName = joined members, team =
    // club). Display-only flag so the boards can frame lanes as teams; result
    // entry is the same per-lane form the tabulator already posts.
    isRelay: !!item.isRelayRace,
    lanes,
    isMerged,
    packLabel: isMerged ? mergePackLabel(meet, item) : null,
    mergedLanes,
  };
}

// Resolves which staff role (if any) the logged-in user holds for this
// specific meet — same trust model as canEditMeet/canJudgeMeet, just
// surfaced as a role string so the iOS app knows which controls to show.
function resolveStaffRole(user, meet) {
  if (!user || !meet) return null;
  if (hasRole(user, 'super_admin')) return 'director';
  if (canEditMeet(user, meet)) {
    if (isMeetOwner(user, meet) && hasRole(user, 'meet_director')) return 'director';
    if (isAssignedTabulatorForMeet(user, meet)) return 'tabulator';
    return 'director';
  }
  const assignments = staffAssignmentsForMeet(meet);
  const userId = user.id == null ? '' : String(user.id);
  for (const row of assignments) {
    // A role can carry MULTIPLE people — match the user against every one.
    for (const a of row.assignments || []) {
      if (userId && String(a.staff_user_id || '') === userId) {
        if (row.key === 'meet_director') return 'director';
        if (row.key === 'tabulator') return 'tabulator';
        if (row.key === 'referee') return 'referee';
        if (row.key === 'announcer') return 'announcer';
      }
    }
  }
  if (canJudgeMeet(user, meet)) return 'tabulator';
  return null;
}

module.exports = function createMobileApiRoutes(deps = {}) {
  const router = express.Router();
  const { getSessionUser, loadDb, saveDb } = deps;

  if (typeof getSessionUser !== 'function') throw new Error('mobileApiRoutes requires getSessionUser');
  if (typeof loadDb !== 'function') throw new Error('mobileApiRoutes requires loadDb');
  if (typeof saveDb !== 'function') throw new Error('mobileApiRoutes requires saveDb');

  // ── Auth / session ────────────────────────────────────────────────────────
  router.get('/api/v1/me', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.json({ ok: true, loggedIn: false, user: null });
    res.json({
      ok: true,
      loggedIn: true,
      user: {
        id: data.user.id,
        displayName: data.user.displayName || data.user.username || '',
        email: data.user.email || '',
        roles: Array.isArray(data.user.roles) ? data.user.roles : [],
        team: data.user.team || '',
      },
    });
  });

  // ── Find a Meet ───────────────────────────────────────────────────────────
  router.get('/api/v1/meets', (req, res) => {
    const db = loadDb();
    const q = String(req.query.q || '').trim().toLowerCase();
    const city = String(req.query.city || '').trim().toLowerCase();
    const state = String(req.query.state || '').trim().toLowerCase();
    const league = String(req.query.league || '').trim().toLowerCase();
    const date = String(req.query.date || '').trim();

    const meets = (db.meets || [])
      .filter(isPublicMeet)
      .filter(m => {
        const rink = (db.rinks || []).find(r => Number(r.id) === Number(m.rinkId));
        const haystack = [m.meetName, rink?.name, rink?.city, rink?.state, m.leagueAssociation || m.league]
          .map(v => String(v || '').toLowerCase()).join(' ');
        if (q && !haystack.includes(q)) return false;
        if (city && String(rink?.city || '').toLowerCase() !== city) return false;
        if (state && String(rink?.state || '').toLowerCase() !== state) return false;
        if (league && !String(m.leagueAssociation || m.league || '').toLowerCase().includes(league)) return false;
        if (date && String(m.date || '').slice(0, 10) !== date) return false;
        return true;
      })
      .map(m => ({
        id: m.id,
        meetName: m.meetName || 'Untitled Meet',
        date: m.date || '',
        startTime: m.startTime || '',
        status: m.status || 'draft',
        location: meetRinkLabel(db, m) || '',
        raceCount: Array.isArray(m.races) ? m.races.length : 0,
        registrationCount: Array.isArray(m.registrations) ? m.registrations.length : 0,
      }));

    res.json({ ok: true, meets, featuredSchedule: featuredScheduleConfig() });
  });

  router.get('/api/v1/meets/:meetId', (req, res) => {
    const db = loadDb();
    const meet = getMeetOr404(db, req.params.meetId);
    if (!meet || !isPublicMeet(meet)) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const info = currentRaceInfo(meet);
    res.json({
      ok: true,
      meet: {
        id: meet.id,
        meetName: meet.meetName || 'Untitled Meet',
        date: meet.date || '',
        startTime: meet.startTime || '',
        status: meet.status || 'draft',
        location: meetRinkLabel(db, meet) || '',
        dateLabel: meetDateLabel(meet) || '',
        isLive: !!info.current,
        raceCount: Array.isArray(meet.races) ? meet.races.length : 0,
      },
    });
  });

  // ── Live Race Day / Live Board (same payload powers both screens) ────────
  router.get('/api/v1/meets/:meetId/live', (req, res) => {
    const db = loadDb();
    const meet = getMeetOr404(db, req.params.meetId);
    if (!meet || !isPublicMeet(meet)) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const info = currentRaceInfo(meet);
    const regMap = new Map((meet.registrations || []).map(r => [Number(r.id), r]));
    const recent = recentClosedRaces(meet, 5).map(race => ({
      id: race.id,
      groupLabel: race.groupLabel,
      division: race.division,
      distanceLabel: race.distanceLabel,
      results: (race.laneEntries || [])
        .filter(x => String(x.place || x.status || '').trim())
        .sort((a, b) => Number(a.place || 999) - Number(b.place || 999))
        .slice(0, 4)
        .map(x => ({ place: x.place || null, status: x.status || null, skaterName: x.skaterName || '', team: x.team || '' })),
    }));

    res.json({
      ok: true,
      meetName: meet.meetName || '',
      progress: raceDayProgress(meet),
      current: raceDayItemToJson(info.current, meet, regMap),
      next: raceDayItemToJson(info.next, meet, regMap),
      coming: (info.coming || []).slice(0, 3).map(item => ({
        id: item.id, groupLabel: item.groupLabel, division: item.division || null, distanceLabel: item.distanceLabel,
      })),
      recentResults: recent,
    });
  });

  // ── Results ───────────────────────────────────────────────────────────────
  router.get('/api/v1/meets/:meetId/results', (req, res) => {
    const db = loadDb();
    const meet = getMeetOr404(db, req.params.meetId);
    if (!meet || !isPublicMeet(meet)) return res.status(404).json({ ok:false, error:'Meet not found.' });

    // Additive: `distances` (the scored-race columns, in order) + per-skater
    // `raceScores` (place they took in each) let the app render the compact
    // per-division results matrix. Pure pivot of what the standings already
    // computed — no scoring logic here.
    const sectionDistances = section => (section.races || []).map(r => ({
      raceId: String(r.id), label: r.distanceLabel || '', dayIndex: r.dayIndex,
    }));
    const rowRaceScores = row => (row.raceScores || []).map(s => ({
      raceId: String(s.raceId), place: s.place || null, points: s.points || 0,
    }));

    const standard = computeMeetStandings(meet).map(section => ({
      groupLabel: section.groupLabel,
      division: section.division,
      distances: sectionDistances(section),
      standings: section.standings.map(row => ({
        place: row.overallPlace, skaterName: row.skaterName, team: row.team,
        sponsor: row.sponsor || null, totalPoints: row.totalPoints,
        raceScores: rowRaceScores(row),
        tiebreakerUsed: !!row.tiebreakerUsed, runoffNeeded: !!row.runoffNeeded,
      })),
    }));

    const quad = computeQuadStandings(meet).map(section => ({
      groupLabel: section.groupLabel,
      distanceLabel: section.distanceLabel,
      distances: sectionDistances(section),
      standings: section.standings.map(row => ({
        place: row.overallPlace, skaterName: row.skaterName, team: row.team,
        sponsor: row.sponsor || null, totalPoints: row.totalPoints,
        raceScores: rowRaceScores(row),
        tiebreakerUsed: !!row.tiebreakerUsed, runoffNeeded: !!row.runoffNeeded,
      })),
    }));

    const open = computeOpenResults(meet).map(s => ({
      groupLabel: s.race.groupLabel,
      distanceLabel: s.race.distanceLabel,
      results: s.rows.map(r => ({ place: r.place || null, skaterName: r.skaterName || '', team: r.team || '' })),
    }));

    res.json({ ok: true, meetName: meet.meetName || '', standard, quad, open });
  });

  // ── Staff: resolve role + meet list for the "Staff" tab ──────────────────
  router.get('/api/v1/meets/:meetId/staff-access', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const role = resolveStaffRole(data.user, meet);
    if (!role) return res.json({ ok:true, hasAccess:false, role:null });
    res.json({
      ok: true,
      hasAccess: true,
      role,
      canControlRaceDay: role === 'director' || role === 'tabulator',
      // Additive: whether this user could use the website's Block Builder on
      // this meet — the same canEditMeet gate every /api/meet/:meetId/blocks/*
      // endpoint already enforces. Lets the iPad offer Block Builder to
      // assigned tabulators exactly like the website does, instead of
      // guessing from the role string.
      canBuildBlocks: canEditMeet(data.user, meet),
    });
  });

  router.get('/api/v1/my-staff-meets', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meets = (data.db.meets || [])
      .map(m => ({ meet: m, role: resolveStaffRole(data.user, m) }))
      .filter(x => !!x.role)
      .map(x => ({
        id: x.meet.id,
        meetName: x.meet.meetName || 'Untitled Meet',
        date: x.meet.date || '',
        status: x.meet.status || 'draft',
        role: x.role,
      }));
    res.json({ ok: true, meets });
  });

  // ── Staff: full race-day state (adds progress/ordered list vs. public /live) ─
  router.get('/api/v1/meets/:meetId/race-day-state', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const role = resolveStaffRole(data.user, meet);
    if (!role) return res.status(403).json({ ok:false, error:'You are not assigned to this meet.' });

    const info = currentRaceInfo(meet);
    const regMap = new Map((meet.registrations || []).map(r => [Number(r.id), r]));

    res.json({
      ok: true,
      role,
      canControlRaceDay: role === 'director' || role === 'tabulator',
      paused: !!meet.raceDayPaused,
      progress: raceDayProgress(meet),
      // Drives the unresolved-protest badge on the Director + Tabulator tabs,
      // mirroring the website's sub-tab badge (new + review protests).
      protestUnresolvedCount: unresolvedProtestCount(meet),
      current: raceDayItemToJson(info.current, meet, regMap),
      next: raceDayItemToJson(info.next, meet, regMap),
      orderedRaces: info.ordered.map((item, idx) => ({
        id: item.id,
        index: idx,
        label: isTimeTrialItem(item)
          ? item.groupLabel
          : `${item.groupLabel} — ${item.division} — ${item.distanceLabel} — ${raceDisplayStage(item)}`,
        isCurrent: item.id === meet.currentRaceId,
      })),
    });
  });

  // ── Staff: protests (officials inbox + rule + fee) ───────────────────────
  // Mirrors the website's /portal/meet/:id/protests inbox and its rule/fee
  // actions for the iPad. Display + action only: every record mutation goes
  // through services/protests and the exact same canEditMeet gate the website
  // uses. No protest logic (validation, ids, fee/deadline math) is reimplemented
  // here — only re-shaped as JSON. Officials = judge (tabulator) + meet_director
  // (director), matching requireRole('judge','meet_director') on the web.

  function protestUpheldReason(protest) {
    // Same reason string the website prefills into Correction Mode.
    return `Protest ${protest.id} upheld: ${protest.ruling || protest.statement}`.slice(0, 500);
  }

  router.get('/api/v1/meets/:meetId/protests', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const role = resolveStaffRole(data.user, meet);
    if (role !== 'director' && role !== 'tabulator') {
      return res.status(403).json({ ok:false, error:'Only officials can view protests.' });
    }
    const canCorrect = canEditMeet(data.user, meet);
    res.json({
      ok: true,
      protests: protestsForMeet(meet).map(normalizeProtest),
      unresolvedCount: unresolvedProtestCount(meet),
      canRule: true,                 // judge + director may both rule
      canCollectFee: canCorrect,     // director/owner only
      canOpenCorrection: canCorrect, // upheld race-specific → correction (director only)
      protestFee: Number(meet.protestFee || 0),
      protestDeadlineMinutes: Number(meet.protestDeadlineMinutes || 0),
    });
  });

  router.post('/api/v1/meets/:meetId/protests/:protestId/rule', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const role = resolveStaffRole(data.user, meet);
    if (role !== 'director' && role !== 'tabulator') {
      return res.status(403).json({ ok:false, error:'Only officials can rule on protests.' });
    }
    const protest = findProtest(meet, req.params.protestId);
    if (!protest) return res.status(404).json({ ok:false, error:'Protest not found.' });
    const state = req.body.state === 'upheld' ? 'upheld'
                : req.body.state === 'denied' ? 'denied' : '';
    if (!state) return res.status(400).json({ ok:false, error:'Ruling must be upheld or denied.' });

    protest.state = state;
    protest.ruling = String(req.body.ruling || '').slice(0, 2000);
    protest.ruledByUserId = String(data.user.id || '');
    protest.ruledByName = String(data.user.name || data.user.fullName || data.user.email || '');
    protest.ruledAt = new Date().toISOString();

    // Upheld race-specific protest opens Correction Mode — meet-director only.
    const canCorrect = canEditMeet(data.user, meet);
    let correction = null;
    if (state === 'upheld' && protest.raceId && canCorrect) {
      protest.correctionRaceId = protest.raceId;
      correction = { available: true, raceId: protest.raceId, reason: protestUpheldReason(protest) };
    }
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);

    res.json({
      ok: true,
      protest: normalizeProtest(protest),
      unresolvedCount: unresolvedProtestCount(meet),
      correction,
    });
  });

  router.post('/api/v1/meets/:meetId/protests/:protestId/fee', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    // Fee collection is director/owner only — the same canEditMeet gate the
    // website's requireRole('meet_director') + canEditMeet check enforces.
    if (!canEditMeet(data.user, meet)) {
      return res.status(403).json({ ok:false, error:'Only a meet director can collect the fee.' });
    }
    const protest = findProtest(meet, req.params.protestId);
    if (!protest) return res.status(404).json({ ok:false, error:'Protest not found.' });
    protest.feeCollected = true;
    protest.feeCollectedBy = String(data.user.name || data.user.fullName || data.user.email || '');
    protest.feeCollectedAt = new Date().toISOString();
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);

    res.json({
      ok: true,
      protest: normalizeProtest(protest),
      unresolvedCount: unresolvedProtestCount(meet),
    });
  });

  // ── Coach: file protests from the app ────────────────────────────────────
  // Mirrors the website's coach protest flow (routes/protestRoutes.js). A coach
  // is linked to their skaters purely by team-name string match (there is no
  // coachUserId). Additive JSON only; all writes go through buildProtest and
  // land on the same meet.protests[] the officials inbox already reads.

  function coachSkaters(meet, user) {
    return coachTeamRegistrations(meet, String(user.team || ''));
  }

  function raceLabelForProtest(race) {
    const div = race.division ? String(race.division).replace(/^\w/, c => c.toUpperCase()) : '';
    return [race.groupLabel, div, race.distanceLabel].filter(Boolean).join(' · ');
  }

  // Meets where the logged-in coach has skaters (their team is registered).
  router.get('/api/v1/my-coach-meets', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    if (!hasRole(data.user, 'coach')) return res.json({ ok:true, isCoach:false, meets: [] });
    const team = String(data.user.team || '');
    const meets = (data.db.meets || [])
      .filter(m => coachTeamRegistrations(m, team).length > 0)
      .map(m => ({
        id: m.id,
        meetName: m.meetName || 'Untitled Meet',
        date: m.date || '',
        status: m.status || 'draft',
        location: meetRinkLabel(data.db, m) || '',
        mySkaterCount: coachTeamRegistrations(m, team).length,
        myProtestCount: protestsForCoach(m, data.user.id).length,
      }));
    res.json({ ok:true, isCoach:true, team, meets });
  });

  // Everything the app needs to render the coach protest form for one meet,
  // plus the coach's already-filed protests + their status.
  router.get('/api/v1/meets/:meetId/coach/protest-form', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const myRegs = coachSkaters(meet, data.user);
    if (!hasRole(data.user, 'coach') || myRegs.length === 0) {
      return res.status(403).json({ ok:false, error:'You have no skaters registered in this meet.' });
    }
    const races = orderedRaces(meet)
      .filter(r => r.type !== 'time_trial')
      .map(r => ({ id: r.id, label: raceLabelForProtest(r) }));
    res.json({
      ok: true,
      categories: PROTEST_CATEGORIES.map(c => ({ name: c, raceSpecific: RACE_SPECIFIC_CATEGORIES.includes(c) })),
      races,
      skaters: myRegs.map(r => ({
        id: String(r.id),
        name: r.name || '',
        // Helmet is a display label — stringify so it's always a string|null
        // (stored data can be a number or a string).
        helmetNumber: (r.helmetNumber == null || r.helmetNumber === '') ? null : String(r.helmetNumber),
      })),
      protestFee: Number(meet.protestFee || 0),
      protestDeadlineMinutes: Number(meet.protestDeadlineMinutes || 0),
      myProtests: protestsForCoach(meet, data.user.id).map(normalizeProtest),
    });
  });

  router.post('/api/v1/meets/:meetId/coach/protest', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const myRegs = coachSkaters(meet, data.user);
    if (!hasRole(data.user, 'coach') || myRegs.length === 0) {
      return res.status(403).json({ ok:false, error:'You have no skaters registered in this meet.' });
    }
    const category = String(req.body.category || '');
    // Skater-ownership leniency: silently drop a registrationId that isn't the
    // coach's own skater (same as the website).
    let registrationId = String(req.body.registrationId || '');
    if (registrationId && !myRegs.some(r => String(r.id) === registrationId)) registrationId = '';
    // Race-specific past-deadline block (online filing only).
    if (isRaceSpecific(category)) {
      const race = (meet.races || []).find(r => String(r.id) === String(req.body.raceId || ''));
      if (race && raceProtestWindowClosed(meet, race)) {
        return res.status(400).json({ ok:false,
          error:`The online protest window for that race has closed (${protestDeadlineMinutes(meet)} minutes after it closed). See the meet director in person.` });
      }
    }
    const built = buildProtest(meet, {
      category,
      raceId: req.body.raceId,
      raceLabel: req.body.raceLabel,
      registrationId,
      statement: req.body.statement,
      filedByUserId: data.user.id,
      filedByName: data.user.name || data.user.fullName || data.user.email || 'Coach',
      team: String(data.user.team || ''),
    }, new Date().toISOString());
    if (!built.ok) return res.status(400).json({ ok:false, error: built.error });
    if (!Array.isArray(meet.protests)) meet.protests = [];
    meet.protests.push(built.protest);
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);
    res.json({ ok:true, protest: normalizeProtest(built.protest) });
  });

  // ── Director: relay builder (build teams + generate races, all on iPad) ────
  // A relay race's lanes are teams; buildRelayRacesFromTeams turns
  // meet.relayTeams into the actual races. This lets a director set relays up
  // entirely on the iPad. Additive JSON; team/race writes reuse the same
  // meet.relayTeams + relayGenerator the website uses. Eligibility (age/gender,
  // quad opt-in) is computed server-side via eligibleForRelayDivision.

  function relayTeamClub(memberRegIds, regById) {
    const clubs = new Set(memberRegIds
      .map(id => String((regById.get(String(id)) || {}).team || '').trim())
      .filter(Boolean));
    return clubs.size === 1 ? { club: [...clubs][0], mixed: false } : { club: '', mixed: true };
  }

  router.get('/api/v1/meets/:meetId/relay-builder', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can build relays.' });

    const regs = meet.registrations || [];
    const teams = Array.isArray(meet.relayTeams) ? meet.relayTeams : [];
    const divisions = relayDivisionsForRuleset(meet.divisionScheme || meet.relayRuleset || '')
      .map(div => {
        const eligible = eligibleForRelayDivision(div, regs);
        const divTeams = teams.filter(t => t.divisionId === div.id);
        return {
          id: div.id, size: div.size, label: div.label, ageRange: div.ageRange,
          gender: div.gender, distance: div.distance,
          eligible: eligible.map(r => ({ id: String(r.id), name: r.name || '',
                                         age: (r.age == null ? null : Number(r.age)), team: r.team || '' })),
          teams: divTeams.map(t => ({ id: t.id, memberRegIds: (t.memberRegIds || []).map(String),
                                      club: t.club || '', mixed: !!t.mixed })),
        };
      })
      // Only surface divisions that can actually be built (enough eligible) or
      // already have teams — the full ruleset list is huge.
      .filter(d => d.eligible.length >= d.size || d.teams.length > 0);

    res.json({ ok:true, divisions, relayRaceCount: (meet.races || []).filter(r => r.isRelayRace).length });
  });

  // Replace the meet's relay teams with the director-submitted set (the director
  // is authoritative on the iPad). Body: { teams: [{ divisionId, memberRegIds }] }.
  router.post('/api/v1/meets/:meetId/relay-builder/teams', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can build relays.' });

    const regById = new Map((meet.registrations || []).map(r => [String(r.id), r]));
    const validRegIds = new Set(regById.keys());
    const incoming = Array.isArray(req.body.teams) ? req.body.teams : [];
    const existing = Array.isArray(meet.relayTeams) ? meet.relayTeams : [];
    // Replace is scoped to the divisions the payload mentions — teams in other
    // divisions (e.g. coach submissions the editor never showed) survive. And
    // team ids are PRESERVED for unchanged teams / minted above the existing
    // max: generated relay races reference relayTeamId, so ids must never be
    // renumbered from 1.
    const postedDivIds = new Set(incoming.map(t => String(t.divisionId || '')).filter(Boolean));
    const preserved = existing.filter(t => !postedDivIds.has(String(t.divisionId)));
    let maxId = existing.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0);
    const teamKey = (divisionId, members) => `${divisionId}|${[...members].sort().join(',')}`;
    const priorByKey = new Map(existing.map(t =>
      [teamKey(String(t.divisionId), (t.memberRegIds || []).map(String)), t]));
    const built = [];
    for (const t of incoming) {
      const div = RELAY_DIVISION_BY_ID.get(String(t.divisionId || ''));
      if (!div) continue;
      const members = [...new Set((t.memberRegIds || []).map(String))].filter(id => validRegIds.has(id));
      if (members.length !== div.size) continue; // only complete teams
      const { club, mixed } = relayTeamClub(members, regById);
      const prior = priorByKey.get(teamKey(div.id, members));
      built.push({ id: prior ? Number(prior.id) : ++maxId, divisionId: div.id, club, mixed,
                   memberRegIds: members, color: prior ? (prior.color || '') : '',
                   updatedAt: new Date().toISOString() });
    }
    meet.relayTeams = [...preserved, ...built];
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);
    res.json({ ok:true, savedTeams: built.length });
  });

  // Generate the relay races from the saved teams (reuses the website's engine).
  router.post('/api/v1/meets/:meetId/relay-builder/generate', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can build relays.' });
    const result = buildRelayRacesFromTeams(meet) || {};
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);
    res.json({
      ok: true,
      created: (result.created || []).length,
      updated: (result.updated || []).length,
      skipped: (result.skipped || []).length,
      relayRaceCount: (meet.races || []).filter(r => r.isRelayRace).length,
    });
  });

  // ── Coach: relay team entry from the phone ─────────────────────────────────
  // Coaches build their OWN club's relay teams; the director reviews and
  // generates the races on the iPad/web. Additive JSON. A coach only ever sees
  // and uses their own team's eligible skaters (team-name containment), and the
  // save MERGES — it replaces only this coach's club's teams and leaves every
  // other team (other coaches', the director's) untouched.
  const sameClub = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

  router.get('/api/v1/meets/:meetId/coach/relay-builder', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const team = String(data.user.team || '').trim();
    if (!hasRole(data.user, 'coach') || coachSkaters(meet, data.user).length === 0) {
      return res.status(403).json({ ok:false, error:'You have no skaters registered in this meet.' });
    }
    const regs = meet.registrations || [];
    const teams = Array.isArray(meet.relayTeams) ? meet.relayTeams : [];
    const divisions = relayDivisionsForRuleset(meet.divisionScheme || meet.relayRuleset || '')
      .map(div => {
        const eligible = eligibleForRelayDivision(div, regs).filter(r => sameClub(r.team, team));
        const myTeams = teams.filter(t => t.divisionId === div.id && sameClub(t.club, team));
        return {
          id: div.id, size: div.size, label: div.label, ageRange: div.ageRange,
          gender: div.gender, distance: div.distance,
          eligible: eligible.map(r => ({ id: String(r.id), name: r.name || '',
                                         age: (r.age == null ? null : Number(r.age)), team: r.team || '' })),
          teams: myTeams.map(t => ({ id: t.id, memberRegIds: (t.memberRegIds || []).map(String),
                                     club: t.club || '', mixed: !!t.mixed })),
        };
      })
      .filter(d => d.eligible.length >= d.size || d.teams.length > 0);
    res.json({ ok:true, team, divisions, locked: relayDeadlinePassed(meet) });
  });

  router.post('/api/v1/meets/:meetId/coach/relay-builder/teams', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    const team = String(data.user.team || '').trim();
    const myRegs = coachSkaters(meet, data.user);
    if (!hasRole(data.user, 'coach') || myRegs.length === 0) {
      return res.status(403).json({ ok:false, error:'You have no skaters registered in this meet.' });
    }
    // Same relay-deadline lock the website's coach relay save enforces.
    if (relayDeadlinePassed(meet)) {
      return res.status(403).json({ ok:false, error:'The relay deadline for this meet has passed — see the meet director to change teams.' });
    }
    const myRegIds = new Set(myRegs.map(r => String(r.id)));
    const regs = meet.registrations || [];
    // Eligibility per division, restricted to this coach's skaters — a coach
    // can't slip in an ineligible or another team's skater.
    const eligibleByDiv = new Map();
    for (const div of relayDivisionsForRuleset(meet.divisionScheme || meet.relayRuleset || '')) {
      eligibleByDiv.set(div.id, new Set(eligibleForRelayDivision(div, regs)
        .filter(r => sameClub(r.team, team)).map(r => String(r.id))));
    }
    const existing = Array.isArray(meet.relayTeams) ? meet.relayTeams : [];
    // Keep every team that isn't this coach's club (the coach is authoritative
    // only over their own club's teams); preserve their ids.
    const kept = existing.filter(t => !sameClub(t.club, team));
    let maxId = kept.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0);
    const incoming = Array.isArray(req.body.teams) ? req.body.teams : [];
    const mine = [];
    for (const t of incoming) {
      const div = RELAY_DIVISION_BY_ID.get(String(t.divisionId || ''));
      if (!div) continue;
      const elig = eligibleByDiv.get(div.id) || new Set();
      const members = [...new Set((t.memberRegIds || []).map(String))]
        .filter(id => myRegIds.has(id) && elig.has(id));
      if (members.length !== div.size) continue; // only complete, all-mine, all-eligible teams
      mine.push({ id: ++maxId, divisionId: div.id, club: team, mixed: false,
                  memberRegIds: members, color: '', source: 'coach',
                  submittedByUserId: String(data.user.id || ''), updatedAt: new Date().toISOString() });
    }
    meet.relayTeams = [...kept, ...mine];
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);
    res.json({ ok:true, savedTeams: mine.length, totalTeams: meet.relayTeams.length });
  });

  // ── Director: Meet Settings (phase 1 — safe scalar fields) ─────────────────
  // A SAFE partial-update editor for the iPad. The website's builder/save-meet
  // is all-or-nothing (absent booleans/numbers reset to defaults) AND regenerates
  // races on every save; this endpoint instead touches ONLY the keys present in
  // the body and never regenerates races. Scope: identity + fees + protest. Lanes,
  // track, division scheme, publish, rink, and registration window are deliberately
  // NOT here (they rebuild races / change public state) — later phases.
  function meetSettingsJson(meet, db) {
    // registrationCloseAt is "YYYY-MM-DDTHH:MM:00" (combineDateTime) — split it
    // back for the editor.
    const closeAt = String(meet.registrationCloseAt || '');
    const [closeDate, closeTimeRaw] = closeAt.includes('T') ? closeAt.split('T') : [closeAt, ''];
    return {
      meetName: meet.meetName || '',
      date: meet.date || '',
      endDate: meet.endDate || '',
      startTime: meet.startTime || '',
      registrationCloseDate: closeDate || '',
      registrationCloseTime: (closeTimeRaw || '').slice(0, 5),
      rinkId: Number(meet.rinkId || 0),
      rinkLabel: meetRinkLabel(db, meet) || '',
      customRinkName: meet.customRinkName || '',
      // Round the integer fields — legacy data can hold a stray decimal (the
      // website's own save never floored these), and the app decodes them as Int.
      lanes: Math.round(Number(meet.lanes || 4)),
      trackLength: Math.round(Number(meet.trackLength || 100)),
      divisionScheme: String(meet.divisionScheme || 'standard').toLowerCase(),
      status: String(meet.status || 'draft').toLowerCase(),
      published: isPublicMeet(meet),
      // Time-trial event config (read WITHOUT mutating — normalize ORs several
      // flags, so mirror its read here).
      ttEventEnabled: !!((meet.timeTrialEvent && meet.timeTrialEvent.enabled) || meet.timeTrialsEnabled
        || (Array.isArray(meet.timeTrialEvents) && meet.timeTrialEvents.some(e => e && e.type === 'time_trial_event' && e.enabled !== false))),
      ttDistance: String((meet.timeTrialEvent && meet.timeTrialEvent.distance) || '100m'),
      ttCountsForOverall: !!(meet.timeTrialEvent && meet.timeTrialEvent.countsForOverall),
      baseEntryFee: Number(meet.baseEntryFee || 0),
      additionalRaceFee: Number(meet.additionalRaceFee || 0),
      maxRegistrationFee: Number(meet.maxRegistrationFee || 0),
      protestFee: Number(meet.protestFee || 0),
      protestDeadlineMinutes: Math.round(Number(meet.protestDeadlineMinutes || 0)),
    };
  }

  // Rinks list for the venue picker.
  router.get('/api/v1/rinks', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const rinks = (data.db.rinks || []).map(r => ({
      id: Number(r.id),
      name: r.name || '',
      city: r.city || '',
      state: r.state || '',
      label: [r.name, r.city, r.state].filter(Boolean).join(' • '),
    }));
    res.json({ ok:true, rinks });
  });

  router.get('/api/v1/meets/:meetId/settings', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can edit settings.' });
    res.json({ ok:true, settings: meetSettingsJson(meet, data.db) });
  });

  router.post('/api/v1/meets/:meetId/settings', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can edit settings.' });

    const b = req.body || {};
    // Strings: only overwrite when the key is present. meetName won't blank out.
    if (typeof b.meetName === 'string' && b.meetName.trim()) meet.meetName = b.meetName.trim().slice(0, 200);
    if (typeof b.date === 'string') meet.date = b.date.trim();
    if (typeof b.endDate === 'string') meet.endDate = b.endDate.trim();
    if (typeof b.startTime === 'string') meet.startTime = b.startTime.trim();
    // Non-negative money/number fields: only when present and valid.
    for (const key of ['baseEntryFee','additionalRaceFee','maxRegistrationFee','protestFee','protestDeadlineMinutes']) {
      if (b[key] !== undefined && b[key] !== null && String(b[key]).trim() !== '') {
        const n = Number(b[key]);
        // The minutes field is an integer everywhere it's read — round it so a
        // stray decimal can't stick in the data.
        if (Number.isFinite(n) && n >= 0) meet[key] = key === 'protestDeadlineMinutes' ? Math.round(n) : n;
      }
    }
    // Registration window — recombine only when the form sent the date field
    // (an empty date clears the window, matching the website).
    if (Object.prototype.hasOwnProperty.call(b, 'registrationCloseDate')) {
      meet.registrationCloseAt = combineDateTime(b.registrationCloseDate, b.registrationCloseTime);
    }
    // Venue. Display-wise the CUSTOM NAME wins when set (meetRinkLabel checks it
    // first) and the website always leaves a rinkId behind it, so the two fields
    // are processed INDEPENDENTLY — each key applies only when present. The app
    // sends both on every save: picking a rink sends {rinkId:N, customRinkName:""}
    // (clears the custom override), typing a custom name sends the name and
    // leaves rinkId as-is — matching saveMeetIdentityFields.
    if (b.rinkId !== undefined && Number(b.rinkId) > 0) {
      meet.rinkId = Number(b.rinkId);
    }
    if (typeof b.customRinkName === 'string') {
      meet.customRinkName = b.customRinkName.trim();
    }
    // Publish toggle. meet.status doubles as the publish flag ('published') AND
    // the lifecycle state ('live'/'complete'/'archived'), and isPublicMeet() ORs
    // meet.isPublic with it. So only move `status` between the pre-meet states
    // (draft <-> published); for a meet that is already live/complete, flip the
    // independent isPublic flag and LEAVE the lifecycle alone. Archived meets are
    // never published from here.
    if (b.published !== undefined && String(meet.status || '').toLowerCase() !== 'archived') {
      const wantPublic = !!b.published;
      const current = String(meet.status || 'draft').toLowerCase();
      const preMeet = current === 'draft' || current === 'published' || current === '';
      meet.isPublic = wantPublic;
      if (preMeet) meet.status = wantPublic ? 'published' : 'draft';
    }
    // Time-trial event config. Disabling must ALSO flip the materialized
    // event's flag and timeTrialsEnabled — normalizeTimeTrialSettings ORs all
    // three, so clearing only one would snap back to enabled.
    if (b.ttEventEnabled !== undefined || typeof b.ttDistance === 'string' || b.ttCountsForOverall !== undefined) {
      meet.timeTrialEvent = meet.timeTrialEvent || {};
      if (typeof b.ttDistance === 'string' && b.ttDistance.trim()) {
        meet.timeTrialEvent.distance = b.ttDistance.trim().slice(0, 20);
      }
      if (b.ttCountsForOverall !== undefined) meet.timeTrialEvent.countsForOverall = !!b.ttCountsForOverall;
      if (b.ttEventEnabled !== undefined) {
        const on = !!b.ttEventEnabled;
        meet.timeTrialEvent.enabled = on;
        if (!on) meet.timeTrialsEnabled = false;
        (meet.timeTrialEvents || []).forEach(e => {
          if (e && e.type === 'time_trial_event') e.enabled = on;
        });
      }
      normalizeTimeTrialSettings(meet);
      ensureTimeTrialEvent(meet); // materializes/syncs the event when enabled; no-op when off
    }
    // Lanes / track length feed heat splitting and lane rows — changing either
    // rebuilds race assignments (the same safe rebuild the website runs). The app
    // confirms first, so we return racesRebuilt for its follow-up message.
    let racesRebuilt = false;
    const oldLanes = Number(meet.lanes || 4);
    const oldTrack = Number(meet.trackLength || 100);
    if (b.lanes !== undefined && String(b.lanes).trim() !== '') {
      const n = Number(b.lanes);
      if (Number.isFinite(n) && n >= 1) meet.lanes = Math.floor(n);
    }
    if (b.trackLength !== undefined && String(b.trackLength).trim() !== '') {
      const n = Number(b.trackLength);
      if (Number.isFinite(n) && n >= 1) meet.trackLength = Math.round(n);
    }
    if (Number(meet.lanes || 4) !== oldLanes || Number(meet.trackLength || 100) !== oldTrack) {
      // The rebuild blanks closed races' results and deletes heats/semis — once
      // racing has started this is refused outright. (Returning without saveDb
      // discards the in-memory mutation above.)
      if (racingHasStarted(meet)) {
        return res.status(409).json({ ok:false,
          error:'Races have already been scored — lane and track changes are locked once racing starts.' });
      }
      backupBeforeRegen(data.db, meet.id);
      rebuildRaceAssignmentsSafe(meet);
      racesRebuilt = true;
    }
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);
    res.json({ ok:true, settings: meetSettingsJson(meet, data.db), racesRebuilt });
  });

  // ── Director: Open + Quad builders ────────────────────────────────────────
  // The website's open-builder/save and quad-builder/save are indexed
  // full-form replaces that regenerate races unconditionally. These additive
  // twins address rows by GROUP ID (both normalizers already merge by id, so a
  // stale editor can't land on the wrong division), touch only the groups the
  // body names, and regenerate ONLY when something actually changed — with the
  // same started-racing refusal and desktop backup as the divisions editor.
  //
  // Open groups carry one distance and an editable age range; quad groups carry
  // a POSITIONAL distances array (slot = race day, like divisions) with a fixed
  // age range.
  function specialGroupsHandler(kind) {
    const isOpen = kind === 'open';
    const normalize = isOpen ? normalizeOpenGroups : normalizeQuadGroups;
    const field = isOpen ? 'openGroups' : 'quadGroups';
    const label = isOpen ? 'Open' : 'Quad';

    return {
      read(req, res) {
        const data = getSessionUser(req);
        if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
        const meet = getMeetOr404(data.db, req.params.meetId);
        if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
        if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:`Only a meet director can edit ${label} races.` });

        const scheme = String(meet.divisionScheme || 'standard').toLowerCase();
        const groups = normalize(meet[field], scheme);
        res.json({
          ok: true,
          scheme,
          groups: groups.map(g => ({
            id: String(g.id),
            label: String(g.label || ''),
            ages: String(g.ages || ''),
            gender: String(g.gender || ''),
            enabled: !!g.enabled,
            // Open: one distance. Quad: positional slots (never compacted).
            distance: isOpen ? String(g.distance || '') : '',
            distances: isOpen ? [] : (Array.isArray(g.distances) ? g.distances.map(x => String(x || '')) : []),
          })),
        });
      },

      write(req, res) {
        const data = getSessionUser(req);
        if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
        const meet = getMeetOr404(data.db, req.params.meetId);
        if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
        if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:`Only a meet director can edit ${label} races.` });

        const scheme = String(meet.divisionScheme || 'standard').toLowerCase();
        if (req.body.scheme !== undefined && String(req.body.scheme).toLowerCase() !== scheme) {
          return res.status(409).json({ ok:false, error:'The division scheme changed since this screen loaded — reload and try again.' });
        }

        const groups = normalize(meet[field], scheme);
        const byId = new Map(groups.map(g => [String(g.id), g]));
        const incoming = Array.isArray(req.body.groups) ? req.body.groups : [];
        let changed = false;

        for (const row of incoming) {
          const g = byId.get(String(row.id || ''));
          if (!g) continue;                       // unknown id — ignore, never guess
          const before = JSON.stringify(g);
          if (row.enabled !== undefined) g.enabled = !!row.enabled;
          if (isOpen) {
            if (typeof row.ages === 'string' && row.ages.trim()) g.ages = row.ages.trim();
            if (typeof row.distance === 'string' && row.distance.trim()) g.distance = row.distance.trim();
          } else if (Array.isArray(row.distances)) {
            // Positional: trimmed in place, holes preserved, length kept.
            const next = row.distances.map(x => String(x || '').trim());
            while (next.length < g.distances.length) next.push('');
            g.distances = next.slice(0, Math.max(g.distances.length, next.length));
          }
          if (JSON.stringify(g) !== before) changed = true;
        }

        meet[field] = groups;
        let racesRebuilt = false;
        if (changed) {
          if (racingHasStarted(meet)) {
            return res.status(409).json({ ok:false,
              error:`Races have already been scored — ${label} changes are locked once racing starts.` });
          }
          backupBeforeRegen(data.db, meet.id);
          // Matches the website's open/quad saves: regenerate configured races,
          // then make sure blocks + the current-race pointer stay valid.
          generateConfiguredRacesForMeet(meet);
          ensureAtLeastOneBlock(meet);
          ensureCurrentRace(meet);
          racesRebuilt = true;
        }
        meet.updatedAt = new Date().toISOString();
        saveDb(data.db);
        res.json({ ok:true, racesRebuilt,
                   enabledCount: groups.filter(g => g.enabled).length,
                   raceCount: (meet.races || []).length });
      },
    };
  }

  const openGroups = specialGroupsHandler('open');
  const quadGroups = specialGroupsHandler('quad');
  router.get('/api/v1/meets/:meetId/open-groups', openGroups.read);
  router.post('/api/v1/meets/:meetId/open-groups', openGroups.write);
  router.get('/api/v1/meets/:meetId/quad-groups', quadGroups.read);
  router.post('/api/v1/meets/:meetId/quad-groups', quadGroups.write);

  // ── Director: relay templates (which relay divisions this meet offers) ─────
  // The website's relay-builder/add-template save is an ALL-OR-NOTHING indexed
  // full-form replace. This is the additive twin: rows are addressed by
  // divisionId (never array index, so a stale editor can't write onto the wrong
  // division), and only the divisions present in the body are touched.
  function meetRelayRuleset(meet) {
    return meet.relayRuleset || (meet.divisionScheme === 'mssl' ? 'mssl' : 'usars');
  }

  function relayRaceForDivision(meet, base, name, distance) {
    return (meet.races || []).find(r =>
      r.isRelayRace && base.divisionId && r.relayDivisionId === base.divisionId
    ) || (meet.races || []).find(r =>
      r.isRelayRace &&
      String(r.groupLabel || '').trim().toLowerCase() === String(name || '').trim().toLowerCase() &&
      String(r.distanceLabel || '').trim().toLowerCase() === String(distance || '').trim().toLowerCase()
    ) || null;
  }

  // A relay race that has been run must never be silently removed.
  function relayRaceHasResults(race) {
    if (!race) return false;
    if (String(race.status || '') === 'closed') return true;
    return (race.laneEntries || []).some(l => String(l.place || '').trim() || String(l.time || '').trim());
  }

  router.get('/api/v1/meets/:meetId/relay-templates', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can edit relays.' });

    const ruleset = meetRelayRuleset(meet);
    const saved = normalizeRelayTemplates(meet.relayTemplates, ruleset);
    const bases = relayTemplateRowsForRuleset(ruleset);
    const rows = bases.map((base, idx) => {
      const t = saved[idx] || {};
      const type = String(t.type || base.type);
      const age = String(t.age || base.age);
      const distance = String(t.distance || base.distance);
      const name = (base.discipline === 'quad' ? 'Quad ' : '') + [age, type, 'Relay'].filter(Boolean).join(' ');
      const race = relayRaceForDivision(meet, base, name, distance);
      return {
        divisionId: String(base.divisionId || ''),
        label: name,
        type, age,
        ageRange: String(t.ageRange || base.ageRange || ''),
        distance,
        notes: String(t.notes || base.notes || ''),
        discipline: base.discipline || 'inline',
        enabled: !!t.enabled,
        raceId: race ? String(race.id) : null,
        raceHasResults: relayRaceHasResults(race),
      };
    });
    res.json({ ok:true, ruleset, rows });
  });

  router.post('/api/v1/meets/:meetId/relay-templates', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can edit relays.' });

    const ruleset = meetRelayRuleset(meet);
    const bases = relayTemplateRowsForRuleset(ruleset);
    const saved = normalizeRelayTemplates(meet.relayTemplates, ruleset);
    const baseByDiv = new Map(bases.map((b, i) => [String(b.divisionId), { base: b, idx: i }]));
    const incoming = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!Array.isArray(meet.races)) meet.races = [];

    let created = 0;
    let updated = 0;
    for (const row of incoming) {
      const hit = baseByDiv.get(String(row.divisionId || ''));
      if (!hit) continue;                       // unknown division — ignore, never guess
      const { base, idx } = hit;
      const t = saved[idx] || {};
      const enabled = !!row.enabled;
      const type = String(row.type || t.type || base.type).trim();
      const age = String(row.age || t.age || base.age).trim();
      const ageRange = normalizeRelayAgeRange(row.ageRange !== undefined ? row.ageRange : (t.ageRange || base.ageRange || ''));
      const distance = String(row.distance !== undefined ? row.distance : (t.distance || base.distance)).trim();
      const notes = String(row.notes !== undefined ? row.notes : (t.notes || base.notes || '')).trim();
      const isQuad = base.discipline === 'quad';
      const name = (isQuad ? 'Quad ' : '') + [age, type, 'Relay'].filter(Boolean).join(' ');

      saved[idx] = { ...t, enabled, type, age, ageRange, distance, notes,
                     divisionId: base.divisionId, discipline: base.discipline || 'inline' };

      if (enabled && name && distance) {
        const race = relayRaceForDivision(meet, base, name, distance);
        if (race) {
          race.relayType = type;
          race.relayAgeGroup = age;
          race.relayAgeRange = ageRange;
          race.ages = ageRange || age;
          race.notes = notes;
          if (base.divisionId) race.relayDivisionId = base.divisionId;
          updated += 1;
        } else {
          const fresh = makeRelayRace({ name, distance, notes, relayType: type, ageGroup: age, ageRange, quad: isQuad });
          if (base.divisionId) fresh.relayDivisionId = base.divisionId;
          fresh.orderHint = 9800 + (meet.races || []).filter(r => r.isRelayRace).length;
          meet.races.push(fresh);
          created += 1;
        }
      }
      // Disabling leaves any existing race alone (website parity) — removing a
      // relay race is the explicit delete action below.
    }

    meet.relayTemplates = saved;
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);
    res.json({ ok:true, created, updated,
               relayRaceCount: (meet.races || []).filter(r => r.isRelayRace).length });
  });

  // Delete one relay race (and disable its template row), mirroring the
  // website's relay-builder/delete — but refusing a race that has been run.
  router.post('/api/v1/meets/:meetId/relay-templates/delete-race', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can edit relays.' });

    const raceId = String(req.body.raceId || '');
    const race = (meet.races || []).find(r => String(r.id) === raceId && r.isRelayRace);
    if (!race) return res.status(404).json({ ok:false, error:'Relay race not found.' });
    if (relayRaceHasResults(race)) {
      return res.status(409).json({ ok:false, error:'That relay has already been raced — it can\'t be deleted.' });
    }

    meet.races = (meet.races || []).filter(r => String(r.id) !== raceId);
    meet.blocks = (meet.blocks || []).map(b => ({ ...b, raceIds: (b.raceIds || []).filter(id => String(id) !== raceId) }));
    if (Array.isArray(meet.relayTemplates)) {
      meet.relayTemplates = meet.relayTemplates.map(t => {
        const sameDiv = race.relayDivisionId && String(t.divisionId || '') === String(race.relayDivisionId);
        const legacy = String(t.age || '') === String(race.relayAgeGroup || '')
          && String(t.type || '') === String(race.relayType || '')
          && String(t.distance || '') === String(race.distanceLabel || '');
        return (sameDiv || legacy) ? { ...t, enabled: false } : t;
      });
    }
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);
    res.json({ ok:true, relayRaceCount: (meet.races || []).filter(r => r.isRelayRace).length });
  });

  // ── Director: unarchive a meet (JSON twin of adminRoutes' redirect flow) ───
  router.post('/api/v1/meets/:meetId/unarchive', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can unarchive.' });
    if (String(meet.status || '').toLowerCase() !== 'archived') {
      return res.json({ ok:true, status: String(meet.status || 'draft') }); // idempotent
    }
    // Same restore rule as the website (adminRoutes unarchive).
    meet.status = meet.previousStatus && meet.previousStatus !== 'archived' ? meet.previousStatus : 'complete';
    meet.archivedAt = '';
    meet.archivedByUserId = null;
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);
    res.json({ ok:true, status: String(meet.status) });
  });

  // ── Director: per-division editor (novice/elite enable, ages, distances) ────
  // Additive. Reads meet.groups; writes only the groups present in the body,
  // then regenerates races (division config drives race generation). The app
  // confirms first. Distances travel as a small array, padded to 4 slots.
  function divisionSlotJson(d, fallbackAges) {
    d = d || {};
    return {
      enabled: !!d.enabled,
      ages: String(d.ages || fallbackAges || ''),
      distances: (Array.isArray(d.distances) ? d.distances : []).slice(0, 4).map(x => String(x || '')),
    };
  }

  router.get('/api/v1/meets/:meetId/divisions', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can edit divisions.' });
    const groups = (meet.groups || []).map((g, i) => ({
      index: i,
      label: g.label || '',
      ages: g.ages || '',
      gender: g.gender || '',
      novice: divisionSlotJson(g.divisions && g.divisions.novice, g.ages),
      elite: divisionSlotJson(g.divisions && g.divisions.elite, g.ages),
    }));
    res.json({ ok:true, scheme: String(meet.divisionScheme || 'standard'), groups });
  });

  router.post('/api/v1/meets/:meetId/divisions', (req, res) => {
    const data = getSessionUser(req);
    if (!data) return res.status(401).json({ ok:false, error:'Not logged in.' });
    const meet = getMeetOr404(data.db, req.params.meetId);
    if (!meet) return res.status(404).json({ ok:false, error:'Meet not found.' });
    if (!canEditMeet(data.user, meet)) return res.status(403).json({ ok:false, error:'Only a meet director can edit divisions.' });
    if (!Array.isArray(meet.groups)) meet.groups = [];
    // Group rows are addressed by index, so a stale editor (scheme switched
    // underneath it) must not land its writes on different divisions.
    const currentScheme = String(meet.divisionScheme || 'standard').toLowerCase();
    if (String(req.body.scheme || '').toLowerCase() !== currentScheme) {
      return res.status(409).json({ ok:false, error:'The division scheme changed since this screen loaded — reload Divisions and try again.' });
    }

    const applySlot = (existing, posted, fallbackAges) => {
      existing = existing || { enabled: false, cost: 0, distances: ['', '', '', ''] };
      posted = posted || {};
      const distances = (Array.isArray(posted.distances) ? posted.distances : []).map(x => String(x || '').trim());
      while (distances.length < 4) distances.push('');
      return { ...existing, enabled: !!posted.enabled,
               ages: String(posted.ages || fallbackAges || '').trim(),
               distances: distances.slice(0, 4) };
    };

    const incoming = Array.isArray(req.body.groups) ? req.body.groups : [];
    let changed = false;
    for (const grp of incoming) {
      const idx = Number(grp.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= meet.groups.length) continue;
      const g = meet.groups[idx];
      if (!g.divisions) g.divisions = {};
      const before = JSON.stringify([g.divisions.novice, g.divisions.elite]);
      if (grp.novice) g.divisions.novice = applySlot(g.divisions.novice, grp.novice, g.ages);
      if (grp.elite) g.divisions.elite = applySlot(g.divisions.elite, grp.elite, g.ages);
      if (JSON.stringify([g.divisions.novice, g.divisions.elite]) !== before) changed = true;
    }
    // Division config drives race generation — but ONLY regenerate when the
    // save actually changed something (a no-op save, a double-tap, or an app
    // retry must never wipe and re-randomize the meet), and never once racing
    // has started.
    if (changed) {
      if (racingHasStarted(meet)) {
        return res.status(409).json({ ok:false,
          error:'Races have already been scored — division changes are locked once racing starts.' });
      }
      backupBeforeRegen(data.db, meet.id);
      generateConfiguredRacesForMeet(meet);
      rebuildRaceAssignmentsSafe(meet);
      ensureAtLeastOneBlock(meet);
      ensureCurrentRace(meet);
    }
    meet.updatedAt = new Date().toISOString();
    saveDb(data.db);
    res.json({ ok: true, racesRebuilt: changed, raceCount: (meet.races || []).length });
  });

  return router;
};
