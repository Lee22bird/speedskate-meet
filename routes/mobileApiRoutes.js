const express = require('express');
const { esc } = require('../utils/html');
const {
  hasRole, canEditMeet, canJudgeMeet, isMeetOwner, isAssignedTabulatorForMeet,
} = require('../utils/auth');
const {
  isPublicMeet, meetRinkLabel, meetDateLabel, getMeetOr404,
} = require('../services/meetHelpers');
const {
  orderedRaces, currentRaceInfo, raceDayProgress, laneRowsForRace,
  recentClosedRaces, raceDisplayStage,
} = require('../services/raceDay');
const {
  computeMeetStandings, computeQuadStandings, computeOpenResults,
} = require('../services/standings');
const { staffAssignmentsForMeet } = require('../services/staffAssignments');
const {
  protestsForMeet, normalizeProtest, findProtest, unresolvedProtestCount,
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

  return router;
};
