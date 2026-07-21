// R1 — one-click schedule generation for the Block Builder. MEET-AWARE (v2).
//
// Detects the meet shape from the race pool and builds the matching block layout:
//
//   CHAMPIONSHIP (any race has stage 'heat' or 'semi' — e.g. 2026 Indoor
//   Nationals): each distance runs Heats -> Semis -> Finals on its own day,
//   divisions youngest->oldest. HEATS use a two-tier sort: divisions whose heats
//   qualify to a semi run before divisions whose heats go straight to a final,
//   and youngest->oldest within each tier. Relays then quad get their own days.
//
//   LEAGUE (all finals, no heats/semis — e.g. a club/state meet printed from
//   speedskatemeet.com): quad first (different equipment), then the inline finals
//   by distance ordinal with NOVICE before ELITE within each ordinal, then Opens,
//   then any Additional/Skateability, then relays last (3/2/4-person).
//
// Everything is plain, fully-editable blocks — the director can still drag,
// rename (R9), reorder and delete. Time-trial queue events are left unassigned
// in both modes. This module is PURE (no db, no mutation) so web + desktop +
// unit tests share it. The overwrite-guard/append/backup live in the route.

const crypto = require('crypto');

function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
}

// Mirrors the Block Builder view's day derivation (R6): date..endDate span,
// fallback 3 days when the meet has no dates, capped at 31.
function countMeetDays(meet) {
  const start = parseIsoDate(meet.date);
  let end = parseIsoDate(meet.endDate) || start;
  if (!start) return 3;
  if (end < start) end = start;
  return Math.max(1, Math.min(31, Math.round((end - start) / 86400000) + 1));
}

function minAgeOf(ages) {
  const m = /(\d+)/.exec(String(ages || ''));
  return m ? +m[1] : 999;
}

// Youngest to oldest (USARS convention), then the director's configured group
// order (orderHint follows meet.groups order), then heat number.
function raceOrder(a, b) {
  return (minAgeOf(a.ages) - minAgeOf(b.ages))
    || ((Number(a.orderHint) || 0) - (Number(b.orderHint) || 0))
    || ((Number(a.heatNumber) || 0) - (Number(b.heatNumber) || 0))
    || String(a.id).localeCompare(String(b.id));
}

function newBlock(name, dayNum, raceIds) {
  return {
    id: 'b' + crypto.randomBytes(4).toString('hex'),
    name: String(name),
    day: 'Day ' + dayNum,
    type: 'race',
    notes: '',
    raceIds: raceIds.map(r => String(r.id)),
  };
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
function cap(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) : s; }
const cls = r => String(r.division || '').toLowerCase();
const ordinalOf = r => Number(r.dayIndex) || 1;

// Connects a heat to its own division's semi within a distance so we can tell
// which heats qualify onward. parentRaceKey when present, else a stable fallback.
function identity(r) {
  return r.parentRaceKey || [r.groupId, r.division, r.dayIndex, r.distanceLabel].join('|');
}

// Relay team size: prefer an explicit field, else parse "N Person" from labels.
function relayPersons(r) {
  for (const v of [r.relayTeamSize, r.teamSize, r.relaySize, r.persons]) {
    if (Number(v) > 0) return Number(v);
  }
  const hay = [r.groupLabel, r.division, r.distanceLabel, r.name].map(x => String(x || '')).join(' ');
  const m = /(\d+)\s*-?\s*person/i.exec(hay);
  return m ? +m[1] : 0;
}

function isChampionshipPool(pool) {
  return pool.some(r => r.stage === 'heat' || r.stage === 'semi');
}

// ── CHAMPIONSHIP: distance -> Heats(tier,age) -> Semis(age) -> Finals(age) ──
function championshipUnits(pool) {
  const relays = pool.filter(r => r.isRelayRace).sort(raceOrder);
  const quads = pool.filter(r => r.isQuadRace).sort(raceOrder);
  const inline = pool.filter(r => !r.isRelayRace && !r.isQuadRace);
  const ordinals = [...new Set(inline.map(ordinalOf))].sort((a, b) => a - b);

  const units = [];
  for (const n of ordinals) {
    const set = inline.filter(r => ordinalOf(r) === n);
    const heats = set.filter(r => r.stage === 'heat');
    const semis = set.filter(r => r.stage === 'semi').sort(raceOrder);
    const finals = set.filter(r => r.stage !== 'heat' && r.stage !== 'semi').sort(raceOrder);
    // Heats: tier-then-age. Tier 0 = this division has a semi (qualifies onward);
    // tier 1 = straight to a final. Tier 0 entirely before tier 1; age within each.
    const semiKeys = new Set(semis.map(identity));
    const tier = h => (semiKeys.has(identity(h)) ? 0 : 1);
    const heatsSorted = heats.slice().sort((a, b) => (tier(a) - tier(b)) || raceOrder(a, b));

    const label = 'Distance ' + n;
    const defs = [];
    if (heatsSorted.length) defs.push({ name: label + ' — Heats', races: heatsSorted });
    if (semis.length) defs.push({ name: label + ' — Semis', races: semis });
    if (finals.length) defs.push({ name: (heats.length || semis.length) ? label + ' — Finals' : label, races: finals });
    if (defs.length) units.push(defs);
  }
  if (relays.length) units.push([{ name: 'Relays', races: relays }]);
  if (quads.length) units.push([{ name: 'Quad', races: quads }]);
  return units;
}

// ── LEAGUE: quad -> inline finals (novice before elite per ordinal) -> opens
//    -> additional -> relays (3/2/4). Everything is a Final. ──
function leagueUnits(pool) {
  const units = [];
  const placed = new Set();
  const take = arr => { arr.forEach(r => placed.add(String(r.id))); return arr; };

  // 1. QUAD first. Split by distance ordinal when it has more than one; else by
  //    distanceLabel; else a single Quad block (director can split it via drag).
  const quads = pool.filter(r => r.isQuadRace);
  if (quads.length) {
    let groups = groupBy(quads, ordinalOf);
    let byOrdinal = true;
    if (groups.size <= 1) {
      const byLabel = groupBy(quads, r => String(r.distanceLabel || ''));
      if (byLabel.size > 1) { groups = byLabel; byOrdinal = false; }
    }
    const keys = [...groups.keys()].sort((a, b) => byOrdinal ? a - b : String(a).localeCompare(String(b)));
    if (keys.length <= 1) {
      units.push([{ name: 'Quad', races: take(quads.slice().sort(raceOrder)) }]);
    } else {
      keys.forEach(k => {
        const name = byOrdinal ? 'Quad — Distance ' + k : ('Quad — ' + (k || '?'));
        units.push([{ name, races: take(groups.get(k).slice().sort(raceOrder)) }]);
      });
    }
  }

  // 2. INLINE FINALS: for each distance ordinal ascending, Novice block then
  //    Elite block. Same-distance races stay back-to-back (novice then elite).
  const inline = pool.filter(r =>
    (cls(r) === 'novice' || cls(r) === 'elite') && !r.isOpenRace && !r.isQuadRace && !r.isRelayRace);
  const inlineOrdinals = [...new Set(inline.map(ordinalOf))].sort((a, b) => a - b);
  for (const n of inlineOrdinals) {
    for (const c of ['novice', 'elite']) {
      const races = inline.filter(r => ordinalOf(r) === n && cls(r) === c).sort(raceOrder);
      if (races.length) units.push([{ name: cap(c) + ' — Distance ' + n, races: take(races) }]);
    }
  }

  // 3. OPENS — one block (rolling starts), youngest->oldest, after the inline finals.
  const opens = pool.filter(r => r.isOpenRace && !r.isQuadRace && !r.isRelayRace).sort(raceOrder);
  if (opens.length) units.push([{ name: 'Opens', races: take(opens) }]);

  // 4. ADDITIONAL / anything not otherwise bucketed (except relays) — never drop a
  //    race. Placed before relays so relays stay last.
  const relays = pool.filter(r => r.isRelayRace);
  const relayIds = new Set(relays.map(r => String(r.id)));
  const leftover = pool.filter(r => !placed.has(String(r.id)) && !relayIds.has(String(r.id)));
  if (leftover.length) units.push([{ name: 'Additional', races: leftover.slice().sort(raceOrder) }]);

  // 5. RELAYS last, grouped by person count (3, 2, 4 — the league's running order).
  if (relays.length) {
    const groups = groupBy(relays, relayPersons);
    const pref = [3, 2, 4];
    const rank = k => { const i = pref.indexOf(k); return i < 0 ? 99 : i; };
    const keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a - b);
    if (keys.length <= 1) {
      units.push([{ name: 'Relays', races: relays.slice().sort(raceOrder) }]);
    } else {
      keys.forEach(k => {
        const name = k > 0 ? 'Relays — ' + k + ' Person' : 'Relays';
        units.push([{ name, races: groups.get(k).slice().sort(raceOrder) }]);
      });
    }
  }
  return units;
}

// Returns { blocks, placed }. mode 'replace' schedules every race;
// mode 'append' schedules only races not already assigned to a block.
function generateScheduleBlocks(meet, { mode = 'replace' } = {}) {
  const assigned = new Set();
  if (mode === 'append') {
    for (const b of meet.blocks || []) for (const id of b.raceIds || []) assigned.add(String(id));
  }
  // Time-trial queue events are left for the director to place, in both modes.
  const pool = (meet.races || []).filter(r => !assigned.has(String(r.id)) && !r.isTimeTrial);

  const units = isChampionshipPool(pool) ? championshipUnits(pool) : leagueUnits(pool);

  const blocks = [];
  let placed = 0;
  if (!units.length) return { blocks, placed };

  const dayCount = countMeetDays(meet);
  units.forEach((defs, i) => {
    const dayNum = Math.floor(i * dayCount / units.length) + 1;
    for (const def of defs) {
      if (!def.races.length) continue;
      blocks.push(newBlock(def.name, dayNum, def.races));
      placed += def.races.length;
    }
  });
  return { blocks, placed };
}

module.exports = {
  generateScheduleBlocks,
  countMeetDays,
  raceOrder,
  minAgeOf,
  isChampionshipPool,
};
