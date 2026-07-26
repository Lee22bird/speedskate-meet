const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRaceSetForEntries,
  distributeByTeam,
} = require('../services/meetHelpers');
const { laneRowsForRace } = require('../services/raceDay');
const { rebuildRaceAssignmentsSafe } = require('../services/ttHelpers');

function baseRace(overrides = {}) {
  return {
    id: 'race-base',
    groupId: 'primary_boys',
    groupLabel: 'Primary Boys',
    division: 'novice',
    dayIndex: 1,
    distanceLabel: '500m',
    orderHint: 1,
    laneEntries: [],
    ...overrides,
  };
}

function registrations(count, teams = []) {
  return Array.from({ length: count }, (_, idx) => ({
    id: `reg-${idx + 1}`,
    helmetNumber: idx + 1,
    name: `Skater ${String(idx + 1).padStart(2, '0')}`,
    team: teams[idx] || `Team ${idx + 1}`,
    age: 10,
    options: { novice: true },
    divisionGroupId: 'primary_boys',
  }));
}

function laneRegistrationIds(races) {
  return races.flatMap(race => (race.laneEntries || []).map(entry => entry.registrationId));
}

test('6 skaters generate a final only', () => {
  const races = buildRaceSetForEntries(baseRace(), registrations(6), 6);

  assert.equal(races.length, 1);
  assert.equal(races[0].stage, 'final');
  assert.equal(races[0].laneEntries.length, 6);
});

test('7 skaters generate a final only even on a 6-lane track', () => {
  const races = buildRaceSetForEntries(baseRace(), registrations(7), 6);

  assert.equal(races.length, 1);
  assert.equal(races[0].stage, 'final');
  assert.equal(races[0].laneEntries.length, 7);
});

test('8 skaters generate two heats and a final', () => {
  const races = buildRaceSetForEntries(baseRace(), registrations(8), 8);

  assert.equal(races.length, 3);
  assert.deepEqual(races.map(r => r.stage), ['heat', 'heat', 'final']);
  assert.deepEqual(races.slice(0, 2).map(r => r.laneEntries.length), [4, 4]);
  assert.equal(races[2].laneEntries.length, 0);
});

test('12 skaters generate two heats of 6 and a final', () => {
  const races = buildRaceSetForEntries(baseRace(), registrations(12), 7);

  assert.equal(races.length, 3);
  assert.deepEqual(races.slice(0, 2).map(r => r.laneEntries.length), [6, 6]);
  assert.equal(races[2].stage, 'final');
});

test('14 skaters generate two heats of 7 and a final', () => {
  const races = buildRaceSetForEntries(baseRace(), registrations(14), 6);

  assert.equal(races.length, 3);
  assert.deepEqual(races.slice(0, 2).map(r => r.laneEntries.length), [7, 7]);
  assert.equal(races[2].stage, 'final');
});

test('heat generation does not drop skaters', () => {
  const regs = registrations(14);
  const races = buildRaceSetForEntries(baseRace(), regs, 6);
  const heatIds = laneRegistrationIds(races.filter(r => r.stage === 'heat'));

  assert.equal(heatIds.length, regs.length);
  assert.equal(new Set(heatIds).size, regs.length);
});

test('team balancing spreads teammates across heats when possible', () => {
  const teams = ['Falcons', 'Falcons', 'Falcons', 'Falcons', 'Comets', 'Comets', 'Comets', 'Comets'];
  const buckets = distributeByTeam(registrations(8, teams), [4, 4]);
  const falconCounts = buckets.map(bucket => bucket.filter(reg => reg.team === 'Falcons').length);
  const cometCounts = buckets.map(bucket => bucket.filter(reg => reg.team === 'Comets').length);

  assert.deepEqual(falconCounts, [2, 2]);
  assert.deepEqual(cometCounts, [2, 2]);
});

test('open races keep current final-only rolling behavior', () => {
  const races = buildRaceSetForEntries(
    baseRace({ division: 'open', isOpenRace: true }),
    registrations(10),
    6
  );

  assert.equal(races.length, 1);
  assert.equal(races[0].stage, 'final');
  assert.equal(races[0].startType, 'rolling');
  assert.equal(races[0].laneEntries.length, 10);
});

test('relay races are preserved by safe rebuild', () => {
  const relayRace = {
    id: 'relay-1',
    division: 'relay',
    isRelayRace: true,
    stage: 'final',
    laneEntries: [{ lane: 1, skaterName: 'Relay Team' }],
  };
  const meet = { lanes: 6, races: [relayRace], registrations: [], blocks: [] };

  rebuildRaceAssignmentsSafe(meet);

  assert.equal(meet.races.length, 1);
  assert.equal(meet.races[0], relayRace);
});

test('race day renders all 7 final entries on a 6-lane track', () => {
  const regs = registrations(7);
  const race = buildRaceSetForEntries(baseRace(), regs, 6)[0];
  const rows = laneRowsForRace(race, { lanes: 6 });

  assert.equal(rows.length, 7);
  // Lane order is randomized (see services/laneAssignment.js), so assert
  // every skater appears exactly once across the 7 lanes rather than
  // pinning a specific skater to a specific lane.
  const names = rows.map(r => r.skaterName).sort();
  assert.deepEqual(names, regs.map(r => r.name).sort());
});

test('lane assignment is a random permutation, not registration order', () => {
  const regs = registrations(6);
  const laneIds = race => buildRaceSetForEntries(baseRace(), race, 6)[0].laneEntries.map(e => e.registrationId);

  const sequential = regs.map(r => r.id);
  const samples = Array.from({ length: 25 }, () => laneIds(regs));

  // Every sample must contain exactly the same registrations (no one dropped or duplicated).
  for (const sample of samples) {
    assert.deepEqual([...sample].sort(), [...sequential].sort());
  }

  // With 25 independent shuffles of 8 items, at least one should differ from
  // strict registration order — this would only fail by astronomical chance
  // if shuffling were broken (e.g. accidentally returning the input order).
  assert.ok(samples.some(sample => sample.join(',') !== sequential.join(',')));
});

// ── Pre-created semifinals (SR505.4) ─────────────────────────────────────────
// 3–4 heat divisions qualify through TWO semis. They are now created at
// GENERATION time (empty placeholders) so the Block Builder / printed program
// shows the real running order — previously they materialized mid-meet when
// the last heat closed, leaving an invisible gap in every block schedule.

test('20 skaters generate 3 heats + TWO pre-created semifinals + a final', () => {
  const races = buildRaceSetForEntries(baseRace(), registrations(20), 6);
  const heats = races.filter(r => r.stage === 'heat');
  const semis = races.filter(r => r.stage === 'semi');
  const final = races.find(r => r.stage === 'final');
  assert.equal(heats.length, 3);
  assert.equal(semis.length, 2, 'semifinals pre-created at generation time');
  assert.ok(final);
  assert.deepEqual(semis.map(s => s.heatNumber).sort(), [1, 2]);
  for (const s of semis) {
    assert.equal(s.laneEntries.length, 0, 'placeholder until heats close');
    assert.equal(s.countsForOverall, false, 'semis never score the overall');
    assert.equal(s.isFinal, false);
  }
  // Block/printed order: all heats, then both semis, then the final.
  const maxHeat = Math.max(...heats.map(r => Number(r.orderHint)));
  const minSemi = Math.min(...semis.map(r => Number(r.orderHint)));
  const maxSemi = Math.max(...semis.map(r => Number(r.orderHint)));
  assert.ok(maxHeat < minSemi && maxSemi < Number(final.orderHint), 'Heats → Semis → Final ordering');
});

test('12 skaters (2 heats) pre-create NO semifinals — heats feed the final directly', () => {
  const races = buildRaceSetForEntries(baseRace(), registrations(12), 6);
  assert.equal(races.filter(r => r.stage === 'semi').length, 0);
});

test('heat advancement SEEDS the pre-created semis — never duplicates them', () => {
  const { advanceRaceProgression } = require('../services/meetHelpers');
  const races = buildRaceSetForEntries(baseRace({ parentRaceKey: 'fam|test' }), registrations(20), 6);
  const meet = { id: 1, races, registrations: [] };
  const semiIdsBefore = races.filter(r => r.stage === 'semi').map(r => r.id).sort();

  for (const h of races.filter(r => r.stage === 'heat')) {
    h.laneEntries.forEach((e, i) => { e.place = String(i + 1); });
    h.status = 'closed';
    advanceRaceProgression(meet, h);
  }

  const semis = meet.races.filter(r => r.stage === 'semi');
  assert.equal(semis.length, 2, 'still exactly two semis (no lazy duplicates)');
  assert.deepEqual(semis.map(r => r.id).sort(), semiIdsBefore, 'the SAME pre-created semi races were seeded');
  assert.ok(semis.every(s => s.laneEntries.length === 6), 'each semi seeded with its 6 qualifiers');
});
