const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRaceSetForEntries } = require('../services/raceGenerator');
const {
  MSSL_SEASON_OPENER_HEAT_GROUP_IDS,
  automaticHeatsAllowed,
  repairUnscoredDisallowedHeats,
} = require('../services/msslHeatPolicy');
const { applyDivisionScheme, defaultMeet, migrateMeet } = require('../services/meetHelpers');

function entries(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Skater ${index + 1}`,
    team: `Team ${index % 2}`,
    helmetNumber: String(index + 1),
  }));
}

function race(stage, heatNumber, id, laneEntries = []) {
  return {
    id,
    groupId: 'veteran_men',
    division: 'elite',
    dayIndex: 3,
    distanceLabel: '1000m',
    stage,
    heatNumber,
    isFinal: stage === 'final',
    laneEntries,
    status: 'open',
  };
}

test('season-opener policy allows automatic heats only in its four scheduled elite divisions', () => {
  const meet = { automaticHeatGroupIds: [...MSSL_SEASON_OPENER_HEAT_GROUP_IDS] };
  assert.equal(automaticHeatsAllowed(meet, { groupId: 'veteran_men', division: 'elite' }), false);
  assert.equal(automaticHeatsAllowed(meet, { groupId: 'senior_men', division: 'elite' }), true);
  assert.equal(automaticHeatsAllowed(meet, { groupId: 'senior_men', division: 'novice' }), false);

  const base = { groupId: 'veteran_men', division: 'elite', distanceLabel: '1000m' };
  const veteran = buildRaceSetForEntries(base, entries(8), 7, {
    allowHeats: automaticHeatsAllowed(meet, base),
  });
  assert.equal(veteran.length, 1);
  assert.equal(veteran[0].stage, 'final');
  assert.equal(veteran[0].laneEntries.length, 8);

  const scheduled = { ...base, groupId: 'senior_men' };
  assert.equal(buildRaceSetForEntries(scheduled, entries(8), 7, {
    allowHeats: automaticHeatsAllowed(meet, scheduled),
  }).filter(item => item.stage === 'heat').length, 2);
});

test('repair merges unscored disallowed heat entries into the existing final and keeps block state valid', () => {
  const h1 = race('heat', 1, 'h1', entries(4).map((entry, i) => ({ ...entry, lane: i + 1 })));
  const h2 = race('heat', 2, 'h2', entries(4).map((entry, i) => ({ ...entry, lane: i + 1 })));
  const final = race('final', 0, 'f1');
  const meet = {
    automaticHeatGroupIds: [...MSSL_SEASON_OPENER_HEAT_GROUP_IDS],
    races: [h1, h2, final],
    blocks: [{ raceIds: ['h1', 'f1', 'h2'] }],
  };

  assert.deepEqual(repairUnscoredDisallowedHeats(meet), { repaired: 1 });
  assert.deepEqual(meet.races.map(item => item.id), ['f1']);
  assert.deepEqual(meet.races[0].laneEntries.map(item => item.lane), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(meet.races[0].laneEntries.length, 8);
  assert.deepEqual(meet.blocks[0].raceIds, ['f1']);
});

test('repair does not alter a heat family that already has results', () => {
  const h1 = race('heat', 1, 'h1', [{ ...entries(1)[0], lane: 1, place: '1' }]);
  const h2 = race('heat', 2, 'h2', []);
  const final = race('final', 0, 'f1');
  const meet = {
    automaticHeatGroupIds: [...MSSL_SEASON_OPENER_HEAT_GROUP_IDS],
    races: [h1, h2, final],
    blocks: [{ raceIds: ['h1', 'f1', 'h2'] }],
  };
  assert.deepEqual(repairUnscoredDisallowedHeats(meet), { repaired: 0 });
  assert.equal(meet.races.length, 3);
  assert.equal(meet.races[0].laneEntries[0].place, '1');
});

test('migrateMeet sets the policy and repairs unscored saved heats for the 2026 MSSL Season Opener', () => {
  const meet = defaultMeet({ id: 1, displayName: 'Test', roles: ['super_admin'] });
  meet.meetName = 'MSSL Season Opener';
  meet.date = '2026-10-04';
  applyDivisionScheme(meet, 'mssl');
  meet.races = [race('heat', 1, 'h1', entries(4)), race('heat', 2, 'h2', entries(4)), race('final', 0, 'f1')];
  meet.blocks = [{ raceIds: ['h1', 'h2', 'f1'] }];

  migrateMeet(meet, 'owner');

  assert.deepEqual(meet.automaticHeatGroupIds, [...MSSL_SEASON_OPENER_HEAT_GROUP_IDS]);
  assert.deepEqual(meet.races.map(item => item.id), ['f1']);
  assert.equal(meet.races[0].laneEntries.length, 8);
});
