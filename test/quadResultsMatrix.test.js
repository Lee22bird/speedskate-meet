const { test } = require('node:test');
const assert = require('node:assert/strict');
const { raceScoreForRace, formatPointsForDisplay } = require('../services/standings');
const { quadResultsSectionHtml } = require('../services/meetHelpers');

test('quad report joins a race score when persisted race IDs differ only by type', () => {
  const score = raceScoreForRace({ raceScores: [{ raceId: 19, place: 2, points: 20 }] }, { id: '19' });
  assert.equal(score.place, 2);
});

test('quad report displays race placements and concise fractional totals', () => {
  const section = {
    groupLabel: 'Quad Freshman Girls',
    division: 'quad',
    distanceLabel: '300m + 500m',
    races: [
      { id: 'race-1', distanceLabel: '300m' },
      { id: 'race-2', distanceLabel: '500m' },
    ],
    standings: [{
      overallPlace: 1,
      skaterName: 'Journie Warkentin',
      team: 'Team United',
      totalPoints: 18.571428571428573,
      raceScores: [
        { raceId: 'race-1', place: 1 },
        { raceId: 'race-2', place: 1 },
      ],
    }],
  };

  const html = quadResultsSectionHtml(section, { races: [] }, { print: true });
  assert.match(html, /<strong>1<\/strong>/);
  assert.match(html, /18\.6/);
  assert.doesNotMatch(html, /18\.571428571428573/);
});

test('point display preserves integers and rounds fractional values to one decimal', () => {
  assert.equal(formatPointsForDisplay(30), '30');
  assert.equal(formatPointsForDisplay(18.571428571428573), '18.6');
});
