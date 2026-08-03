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

function newBlock(name, dayNum, raceIds, type = 'race') {
  return {
    id: 'b' + crypto.randomBytes(4).toString('hex'),
    name: String(name),
    day: 'Day ' + dayNum,
    type,
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

// ── LEAGUE (MSSL house style) ────────────────────────────────────────────────
// Block sequence: Quad(short,middle) → Elite LONG → Novice Short → Elite SHORT →
// Novice Middle → Elite MIDDLE → Opens → Relays(3,2,4). Elite blocks split the
// age divisions youngest→oldest into two — the even-position ages, then the odd-
// position ages ("… Continued") — so each division gets rest. WITHIN every block
// the running order is a 3-pass sweep (owner-specified): (1) any heats/semis
// youngest→oldest, then (2) straight finals (≤7, no qualifier) youngest→oldest,
// then (3) the finals of divisions that DID race a qualifier, youngest→oldest,
// so they get a break before their final. Additional/Skateability rides at the
// top of the matching "Continued" elite block.

const metersOf = label => { const m = /(\d+)/.exec(String(label || '')); return m ? +m[1] : 0; };
const isAdditional = r => !!r.isAdditionalRace || cls(r) === 'additional' || cls(r) === 'skateability';

// Per-division distance category: raceId -> 'short' | 'middle' | 'long'. Relative
// to each division's OWN distances (Primary's long 400m, Elementary's long 700m),
// keyed off meters so it's independent of the order distances were entered.
function distanceCategories(races) {
  const cat = new Map();
  const byDiv = groupBy(races, r => [r.groupId, cls(r), r.isQuadRace ? 'q' : 'i'].join('|'));
  for (const [, group] of byDiv) {
    const ordMeters = new Map();
    for (const r of group) { const o = ordinalOf(r); if (!ordMeters.has(o)) ordMeters.set(o, metersOf(r.distanceLabel)); }
    const ords = [...ordMeters.entries()].sort((a, b) => a[1] - b[1]).map(e => e[0]); // short→long
    const label = {};
    if (ords.length === 1) label[ords[0]] = 'short';
    else if (ords.length === 2) { label[ords[0]] = 'short'; label[ords[1]] = 'middle'; }
    else ords.forEach((o, i) => { label[o] = i === 0 ? 'short' : i === ords.length - 1 ? 'long' : 'middle'; });
    for (const r of group) cat.set(String(r.id), String(r.scheduleCategory || '').toLowerCase() || label[ordinalOf(r)] || 'middle');
  }
  return cat;
}

// The owner's 3-pass within-block running order.
// Within-block running order — the MSSL rule, straight from the meet director:
//   "all heats at the start of the block, finals at the final time. If there are
//    semis they would run at the final time and then the final for that race
//    would be at the end of the block."
// So a HEATS-ONLY division runs its final in normal age order; only a SEMIS
// division defers its final to the end (its semis take the age slot). Layout:
//   [additional] → [all heats, young→old] → [age sweep: each division's final,
//    or a semis-division's SEMIS] → [finals of semis divisions, young→old].
function orderBlockRaces(races) {
  const nonAdd = races.filter(r => !isAdditional(r));
  const byDiv = groupBy(nonAdd, identity);
  const typeOf = new Map(); // identity -> 'straight' | 'heats' | 'semis'
  for (const [k, g] of byDiv) {
    typeOf.set(k, g.some(r => r.stage === 'semi') ? 'semis' : g.some(r => r.stage === 'heat') ? 'heats' : 'straight');
  }
  const t = r => typeOf.get(identity(r));
  const isFinal = r => r.stage === 'final' || r.stage === 'race';

  const additional = races.filter(isAdditional).sort(raceOrder);
  const heats = nonAdd.filter(r => r.stage === 'heat').sort(raceOrder);
  // Age-order "final time" sweep: each division's final — but a semis division
  // shows its SEMIS here instead. Within the same age, a qualifier division's
  // race runs AFTER a straight division's (extra rest — matches the sheet).
  const sweep = nonAdd.filter(r => (t(r) === 'semis' ? r.stage === 'semi' : isFinal(r)))
    .sort((a, b) => (minAgeOf(a.ages) - minAgeOf(b.ages))
      || ((t(a) === 'straight' ? 0 : 1) - (t(b) === 'straight' ? 0 : 1))
      || raceOrder(a, b));
  const endFinals = nonAdd.filter(r => t(r) === 'semis' && isFinal(r)).sort(raceOrder);
  return [...additional, ...heats, ...sweep, ...endFinals];
}

function leagueUnits(pool, meet = {}) {
  const catOf = distanceCategories(pool);
  const cat = r => catOf.get(String(r.id)) || 'middle';
  const units = [];
  const placed = new Set();
  const mk = (name, races) => { races.forEach(r => placed.add(String(r.id))); return { name, races: orderBlockRaces(races) }; };
  const warmup = name => ({ name, races: [], divider: true });

  // Split a category into even-position AGE GROUPS then odd-position age groups,
  // youngest→oldest — the MSSL "… / … Continued" pattern. Grouped by AGE RANGE so
  // both genders of an age (Primary Girls + Primary Boys) stay in the same block.
  const evenOddSplit = races => {
    if (meet.divisionScheme === 'mssl') {
      const { MSSL_FIRST_ELITE_GROUPS } = require('./msslTemplate');
      return [
        races.filter(r => MSSL_FIRST_ELITE_GROUPS.has(String(r.groupId || ''))),
        races.filter(r => !MSSL_FIRST_ELITE_GROUPS.has(String(r.groupId || ''))),
      ];
    }
    const byAge = groupBy(races, r => String(r.ages || '').trim().toLowerCase());
    const keys = [...byAge.keys()].sort((a, b) => minAgeOf(a) - minAgeOf(b)
      || raceOrder(byAge.get(a)[0], byAge.get(b)[0]));
    const first = [], second = [];
    keys.forEach((k, i) => (i % 2 === 1 ? first : second).push(...byAge.get(k)));
    return [first, second];
  };

  // 1. QUAD — short, middle (quads race 2 distances at a league meet).
  const quad = pool.filter(r => r.isQuadRace);
  if (meet.divisionScheme === 'mssl' && quad.length) units.push([warmup('Warm Ups — Quad Skaters')]);
  for (const [c, label] of [['short', 'Quad Short Races'], ['middle', 'Quad Middle Races'], ['long', 'Quad Long Races']]) {
    const rs = quad.filter(r => cat(r) === c);
    if (rs.length) units.push([mk(label, rs)]);
  }

  // 2. ELITE by distance category (LONG → SHORT → MIDDLE), each even/odd, with
  //    Novice slotted between; Skateability rides the "Continued" elite block.
  const elite = pool.filter(r => cls(r) === 'elite' && !r.isOpenRace && !r.isQuadRace && !r.isRelayRace);
  const novice = pool.filter(r => cls(r) === 'novice' && !r.isOpenRace && !r.isQuadRace && !r.isRelayRace);
  const additional = pool.filter(r => isAdditional(r) && !r.isRelayRace && !r.isQuadRace);
  const eliteBlocks = (c, label) => {
    const rs = elite.filter(r => cat(r) === c);
    const add = additional.filter(r => cat(r) === c);
    if (!rs.length && !add.length) return;
    const [first, second] = evenOddSplit(rs);
    if (first.length) units.push([mk(label, first)]);
    const cont = add.concat(second);
    if (cont.length) units.push([mk((first.length ? label + ' Continued' : label), cont)]);
  };
  const noviceBlock = (c, label) => { const rs = novice.filter(r => cat(r) === c); if (rs.length) units.push([mk(label, rs)]); };

  if (meet.divisionScheme === 'mssl' && elite.length) units.push([warmup('Warm Up — Elite Inline')]);
  eliteBlocks('long', 'Elite Long Races');
  if (meet.divisionScheme === 'mssl' && novice.length) units.push([warmup('Warm Up — Novice')]);
  noviceBlock('short', 'Novice Short Races');
  eliteBlocks('short', 'Elite Short Races');
  noviceBlock('middle', 'Novice Middle Races');
  eliteBlocks('middle', 'Elite Middle Races');

  // 3. OPENS (rolling starts), youngest→oldest.
  const opens = pool.filter(r => r.isOpenRace && !r.isQuadRace && !r.isRelayRace).sort(raceOrder);
  if (opens.length) units.push([mk('Opens', opens)]);

  // 4. RELAYS last, in the league's 3 → 2 → 4 person order.
  const relays = pool.filter(r => r.isRelayRace);
  if (relays.length) {
    const groups = groupBy(relays, relayPersons);
    const pref = [3, 2, 4];
    const rank = k => { const i = pref.indexOf(k); return i < 0 ? 99 : i; };
    const keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a - b);
    if (keys.length <= 1) units.push([mk('Relays', relays)]);
    else keys.forEach(k => units.push([mk(k > 0 ? `${k} Person Relays` : 'Relays', groups.get(k))]));
  }

  // 5. Never drop a race — anything unbucketed lands in a final Additional block.
  const leftover = pool.filter(r => !placed.has(String(r.id)));
  if (leftover.length) units.push([mk('Additional', leftover)]);

  return units;
}

// Returns { blocks, placed }. mode 'replace' schedules every race; mode 'append'
// schedules only races not already assigned to a block.
//
// style picks the layout — the director knows which it is (league meets DO have
// heats, so auto-detecting on "has heats" is wrong):
//   'league'       → MSSL house style (leagueUnits).
//   'championship' → per-distance Heats→Semis→Finals, a day per distance (Nationals).
//   'auto'         → legacy heuristic (any heat/semi ⇒ championship); kept for
//                    back-compat callers only, not the Block Builder default.
function generateScheduleBlocks(meet, { mode = 'replace', style = 'league' } = {}) {
  const assigned = new Set();
  if (mode === 'append') {
    for (const b of meet.blocks || []) for (const id of b.raceIds || []) assigned.add(String(id));
  }
  // Time-trial queue events are left for the director to place, in both modes.
  const pool = (meet.races || []).filter(r => !assigned.has(String(r.id)) && !r.isTimeTrial);

  const useChampionship = style === 'championship' || (style === 'auto' && isChampionshipPool(pool));
  const units = useChampionship ? championshipUnits(pool) : leagueUnits(pool, meet);

  const blocks = [];
  let placed = 0;
  if (!units.length) return { blocks, placed };

  const dayCount = countMeetDays(meet);
  units.forEach((defs, i) => {
    const dayNum = Math.floor(i * dayCount / units.length) + 1;
    for (const def of defs) {
      if (!def.races.length && !def.divider) continue;
      blocks.push(newBlock(def.name, dayNum, def.races, def.divider ? 'divider' : 'race'));
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
