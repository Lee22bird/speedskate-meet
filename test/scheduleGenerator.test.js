const test = require('node:test');
const assert = require('node:assert/strict');
const { generateScheduleBlocks, isChampionshipPool } = require('../services/scheduleGenerator');

let idc = 0;
const race = o => ({ id: 'r' + (++idc), ages: '10', stage: 'final', dayIndex: 1, distanceLabel: 'D', division: 'novice', ...o });
const meet = races => ({ id: 1, date: '2026-07-11', endDate: '2026-07-11', blocks: [], races });
// name of the block a race id landed in, and the ordered list of block names
function layout(res) { return res.blocks.map(b => b.name); }
function blockOf(res, raceId) { const b = res.blocks.find(b => b.raceIds.includes(String(raceId))); return b && b.name; }
function order(res, name) { return res.blocks.findIndex(b => b.name === name); }

// ── mode detection ──
test('mode: any heat/semi -> championship; all-finals -> league', () => {
  assert.equal(isChampionshipPool([race({ stage: 'heat' })]), true);
  assert.equal(isChampionshipPool([race({ stage: 'semi' })]), true);
  assert.equal(isChampionshipPool([race({ stage: 'final' }), race({ stage: 'race' })]), false);
});

test('mode: a single heat anywhere flips the whole meet to championship', () => {
  const res = generateScheduleBlocks(meet([
    race({ id: 'h', stage: 'heat', division: 'Elite', ages: '15' }),
    race({ id: 'f', stage: 'final', division: 'Elite', ages: '15' }),
  ]));
  assert.ok(res.blocks.some(b => /Heats/.test(b.name)), 'has a Heats block');
});

// ── CHAMPIONSHIP heats: tier (semis-bound) before tier (heat-only), age within ──
test('championship heats: two-tier — semis-bound before heat-only, regardless of age', () => {
  const races = [
    // tier 1 (heat-only), youngest
    race({ id: 'A1', stage: 'heat', division: 'Primary', ages: '6', heatNumber: 1 }),
    race({ id: 'A2', stage: 'heat', division: 'Primary', ages: '6', heatNumber: 2 }),
    race({ id: 'Afin', stage: 'final', division: 'Primary', ages: '6' }),
    // tier 0 (has a semi), oldest
    race({ id: 'B1', stage: 'heat', division: 'SophMen', ages: '15', heatNumber: 1 }),
    race({ id: 'B2', stage: 'heat', division: 'SophMen', ages: '15', heatNumber: 2 }),
    race({ id: 'Bsemi', stage: 'semi', division: 'SophMen', ages: '15' }),
    race({ id: 'Bfin', stage: 'final', division: 'SophMen', ages: '15' }),
    // tier 1 (heat-only), middle age
    race({ id: 'C1', stage: 'heat', division: 'Mid', ages: '10', heatNumber: 1 }),
    race({ id: 'Cfin', stage: 'final', division: 'Mid', ages: '10' }),
  ];
  const res = generateScheduleBlocks(meet(races));
  const heatsBlock = res.blocks.find(b => /Heats/.test(b.name));
  const ids = heatsBlock.raceIds;
  // B (semis-bound, age 15) entirely before the heat-only A(6) and C(10)
  assert.ok(ids.indexOf('B1') < ids.indexOf('A1'), 'semis-bound SophMen heats precede younger heat-only Primary');
  assert.ok(ids.indexOf('B2') < ids.indexOf('A1'));
  // within tier 1, youngest first: A(6) before C(10)
  assert.ok(ids.indexOf('A1') < ids.indexOf('C1'), 'within heat-only tier, younger first');
  // a division's heats stay contiguous, in heat-number order
  assert.equal(ids.indexOf('B2') - ids.indexOf('B1'), 1, 'SophMen heats contiguous, in order');
  assert.equal(ids.indexOf('A2') - ids.indexOf('A1'), 1, 'Primary heats contiguous, in order');
});

test('championship: finals strict youngest->oldest incl. a direct-final Tiny Tot; semis youngest->oldest', () => {
  const races = [
    race({ id: 'tt', stage: 'final', division: 'TinyTot', ages: '4' }),      // direct final, youngest
    race({ id: 'h', stage: 'heat', division: 'Elite', ages: '16', heatNumber: 1 }),
    race({ id: 's1', stage: 'semi', division: 'Elite', ages: '16' }),
    race({ id: 's2', stage: 'semi', division: 'Juv', ages: '10' }),
    race({ id: 'fE', stage: 'final', division: 'Elite', ages: '16' }),
    race({ id: 'fJ', stage: 'final', division: 'Juv', ages: '10' }),
  ];
  const res = generateScheduleBlocks(meet(races));
  const finals = res.blocks.find(b => /Finals/.test(b.name)).raceIds;
  assert.ok(finals.indexOf('tt') < finals.indexOf('fJ'), 'Tiny Tot (4) leads finals');
  assert.ok(finals.indexOf('fJ') < finals.indexOf('fE'), 'Juv(10) before Elite(16)');
  const semis = res.blocks.find(b => /Semis/.test(b.name)).raceIds;
  assert.ok(semis.indexOf('s2') < semis.indexOf('s1'), 'semis youngest->oldest');
});

test('championship: a distance with zero semis -> heats in pure age order', () => {
  const races = [
    race({ id: 'x', stage: 'heat', division: 'Old', ages: '14', heatNumber: 1 }),
    race({ id: 'y', stage: 'heat', division: 'Young', ages: '7', heatNumber: 1 }),
    race({ id: 'fx', stage: 'final', division: 'Old', ages: '14' }),
    race({ id: 'fy', stage: 'final', division: 'Young', ages: '7' }),
  ];
  const heats = generateScheduleBlocks(meet(races)).blocks.find(b => /Heats/.test(b.name)).raceIds;
  assert.ok(heats.indexOf('y') < heats.indexOf('x'), 'no semis -> pure age order (7 before 14)');
});

// ── LEAGUE mode ──
function leagueMeet() {
  return meet([
    // quad at two ordinals
    race({ id: 'q1', isQuadRace: true, division: 'quad', dayIndex: 1, ages: '10' }),
    race({ id: 'q2', isQuadRace: true, division: 'quad', dayIndex: 2, ages: '12' }),
    // inline finals: ordinal 1 elite only; ordinal 2 novice + elite
    race({ id: 'e1', division: 'elite', dayIndex: 1, ages: '16' }),
    race({ id: 'n2y', division: 'novice', dayIndex: 2, ages: '8' }),
    race({ id: 'n2o', division: 'novice', dayIndex: 2, ages: '14' }),
    race({ id: 'e2', division: 'elite', dayIndex: 2, ages: '16' }),
    // opens
    race({ id: 'o1', isOpenRace: true, division: 'open', dayIndex: 1, ages: '20' }),
    // additional / skateability
    race({ id: 'add', isAdditionalRace: true, division: 'additional', ages: '30' }),
    // relays 2/3/4 person
    race({ id: 'rel2', isRelayRace: true, division: '2 Person Relay', groupLabel: '2 Person', ages: '12' }),
    race({ id: 'rel3', isRelayRace: true, division: '3 Person Relay', groupLabel: '3 Person', ages: '12' }),
    race({ id: 'rel4', isRelayRace: true, division: '4 Person Relay', groupLabel: '4 Person', ages: '12' }),
    // time-trial queue event — must be left unassigned
    race({ id: 'tt', isTimeTrial: true, division: 'time_trial' }),
  ]);
}

test('league: overall bucket order = Quad -> inline finals -> Opens -> Additional -> Relays', () => {
  const res = generateScheduleBlocks(leagueMeet());
  const names = layout(res);
  const firstQuad = names.findIndex(n => /^Quad/.test(n));
  const lastQuad = names.map((n, i) => /^Quad/.test(n) ? i : -1).filter(i => i >= 0).pop();
  const firstInline = names.findIndex(n => /Distance/.test(n) && !/^Quad/.test(n));
  const opens = order(res, 'Opens');
  const additional = order(res, 'Additional');
  const firstRelay = names.findIndex(n => /^Relays/.test(n));
  assert.equal(firstQuad, 0, 'Quad is first');
  assert.ok(lastQuad < firstInline, 'all quad before inline finals');
  assert.ok(firstInline < opens, 'inline finals before Opens');
  assert.ok(opens < additional, 'Opens before Additional');
  assert.ok(additional < firstRelay, 'Additional before Relays');
  assert.equal(firstRelay, names.length - 3, 'the 3 relay blocks are last');
});

test('league: inline interleave — Novice before Elite within an ordinal; ordinal 1 before ordinal 2', () => {
  const res = generateScheduleBlocks(leagueMeet());
  assert.ok(order(res, 'Novice — Distance 2') < order(res, 'Elite — Distance 2'), 'Novice before Elite (same ordinal)');
  assert.ok(order(res, 'Elite — Distance 1') < order(res, 'Novice — Distance 2'), 'ordinal 1 before ordinal 2');
  // elite and novice are separate blocks (not merged)
  assert.ok(order(res, 'Elite — Distance 2') >= 0 && order(res, 'Novice — Distance 2') >= 0);
});

test('league: relays ordered 3-person, 2-person, 4-person', () => {
  const res = generateScheduleBlocks(leagueMeet());
  const r3 = order(res, 'Relays — 3 Person'), r2 = order(res, 'Relays — 2 Person'), r4 = order(res, 'Relays — 4 Person');
  assert.ok(r3 < r2 && r2 < r4, `expected 3<2<4, got ${r3},${r2},${r4}`);
});

test('league: no Heats/Semis blocks; additional race kept; TT left unassigned; within-block youngest->oldest', () => {
  const res = generateScheduleBlocks(leagueMeet());
  assert.equal(res.blocks.some(b => /Heats|Semis/.test(b.name)), false, 'no heats/semis in league mode');
  assert.ok(blockOf(res, 'add'), 'additional race landed in a block');
  assert.equal(blockOf(res, 'tt'), undefined, 'time trial left unassigned');
  // within Novice — Distance 2: younger (8) before older (14)
  const nov2 = res.blocks.find(b => b.name === 'Novice — Distance 2').raceIds;
  assert.ok(nov2.indexOf('n2y') < nov2.indexOf('n2o'), 'within block youngest->oldest');
});

test('league: append mode only schedules unassigned races; every non-TT race placed in replace mode', () => {
  const m = leagueMeet();
  const res = generateScheduleBlocks(m, { mode: 'replace' });
  const nonTT = m.races.filter(r => !r.isTimeTrial).length;
  assert.equal(res.placed, nonTT, 'replace places every non-TT race');
  // append: pre-assign one race, it should be excluded
  m.blocks = [{ id: 'b0', raceIds: ['e1'] }];
  const ap = generateScheduleBlocks(m, { mode: 'append' });
  assert.equal(ap.blocks.some(b => b.raceIds.includes('e1')), false, 'append skips already-assigned e1');
});
