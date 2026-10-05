const test = require('node:test');
const assert = require('node:assert/strict');
const { computeQuadStandings } = require('../services/standings');
const { normalizePlaceValue, scoreRaceByStandardPoints } = require('../services/usarsScoring');

test('blank, zero, and non-integer places are not valid finishes', () => {
  for (const place of ['', ' ', null, undefined, '0', 0, '2.5']) {
    assert.equal(normalizePlaceValue(place), null);
  }
  assert.equal(normalizePlaceValue('2'), 2);
});

test('blank Quad placements cannot turn into a tied zero-place score', () => {
  const races = ['300m', '500m'].map((distanceLabel, index) => ({
    id: `q${index}`,
    groupId: 'quad-freshman-girls',
    groupLabel: 'Quad Freshman Girls',
    division: 'quad',
    distanceLabel,
    dayIndex: index + 1,
    isQuadRace: true,
    isFinal: true,
    countsForOverall: true,
    status: 'closed',
    laneEntries: Array.from({ length: 7 }, (_, lane) => ({
      lane: lane + 1,
      registrationId: lane + 1,
      skaterName: `Skater ${lane + 1}`,
      place: '',
    })),
  }));

  const [section] = computeQuadStandings({ races, registrations: [] });
  assert.ok(section);
  assert.deepEqual(section.standings, []);
});

test('only the entered top four receive points when later finish places are blank', () => {
  const scored = scoreRaceByStandardPoints({
    laneEntries: Array.from({ length: 7 }, (_, lane) => ({
      registrationId: lane + 1,
      skaterName: `Skater ${lane + 1}`,
      place: lane < 4 ? String(lane + 1) : '',
    })),
  });

  assert.deepEqual(scored.map(row => [row.place, row.points]), [
    [1, 30],
    [2, 20],
    [3, 10],
    [4, 5],
  ]);
});
