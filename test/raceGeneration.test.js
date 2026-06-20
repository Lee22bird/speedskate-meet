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
  const race = buildRaceSetForEntries(baseRace(), registrations(7), 6)[0];
  const rows = laneRowsForRace(race, { lanes: 6 });

  assert.equal(rows.length, 7);
  assert.equal(rows[6].skaterName, 'Skater 07');
});
