// R1 — one-click schedule generation for the Block Builder.
//
// Modeled on the proven 2026 Indoor Nationals structure (data/nationals_heats.js):
//   - each competition distance gets its own day, run as
//     Heats -> Semis -> Finals, divisions youngest to oldest
//     (Tiny Tots' direct finals appear in the Finals session);
//   - relays get their own day after the distances;
//   - quad gets its own day after relays.
// When the meet has fewer days than content units, units share days in order;
// when it has more, the extra days stay empty. The generated schedule is plain
// blocks — the director can still drag, rename, reorder and delete everything.
//
// This module is PURE (no db access, no mutation of the meet) so it can be
// unit-tested and reused by web + desktop identically.

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

// Returns { blocks, placed }. mode 'replace' schedules every race;
// mode 'append' schedules only races not already assigned to a block.
function generateScheduleBlocks(meet, { mode = 'replace' } = {}) {
  const assigned = new Set();
  if (mode === 'append') {
    for (const b of meet.blocks || []) {
      for (const id of b.raceIds || []) assigned.add(String(id));
    }
  }
  const pool = (meet.races || []).filter(r => !assigned.has(String(r.id)));
  const relays = pool.filter(r => r.isRelayRace).sort(raceOrder);
  const quads = pool.filter(r => r.isQuadRace).sort(raceOrder);
  const inline = pool.filter(r => !r.isRelayRace && !r.isQuadRace && !r.isTimeTrial);

  const ordinals = [...new Set(inline.map(r => Number(r.dayIndex) || 1))].sort((a, b) => a - b);

  // A "unit" is one day's worth of content: a distance, the relays, or quad.
  const units = [];
  for (const n of ordinals) {
    const set = inline.filter(r => (Number(r.dayIndex) || 1) === n);
    const heats = set.filter(r => String(r.stage) === 'heat').sort(raceOrder);
    const semis = set.filter(r => String(r.stage) === 'semi').sort(raceOrder);
    const finals = set.filter(r => !['heat', 'semi'].includes(String(r.stage))).sort(raceOrder);
    const label = 'Distance ' + n;
    const defs = [];
    if (heats.length) defs.push({ name: label + ' — Heats', races: heats });
    if (semis.length) defs.push({ name: label + ' — Semis', races: semis });
    if (finals.length) defs.push({ name: (heats.length || semis.length) ? label + ' — Finals' : label, races: finals });
    if (defs.length) units.push(defs);
  }
  if (relays.length) units.push([{ name: 'Relays', races: relays }]);
  if (quads.length) units.push([{ name: 'Quad', races: quads }]);

  const blocks = [];
  let placed = 0;
  if (!units.length) return { blocks, placed };

  const dayCount = countMeetDays(meet);
  units.forEach((defs, i) => {
    // even spread that preserves order: unit i of U over D days
    const dayNum = Math.floor(i * dayCount / units.length) + 1;
    for (const def of defs) {
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
};
