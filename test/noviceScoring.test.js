// Novice league scoring: 2 distances, longest-distance place as the tiebreaker.
// Nationals has no Novice, so this exercises the league-only branch that must
// NOT affect the SR832 championship path (that's covered by the golden master).
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeMeetStandings } = require('../services/standings');
const { isNoviceDivision, noviceTiebreakerPlace, distanceMeters } = require('../services/usarsScoring');

function finalRace(id, division, distanceLabel, dayIndex, entries, cls) {
  return {
    id, groupId: 'g1', groupLabel: 'Juvenile Boys', division, class: cls || '',
    distanceLabel, dayIndex, stage: 'final', isFinal: true, countsForOverall: true,
    isQuadRace: false, isOpenRace: false, isRelayRace: false, isTimeTrial: false,
    status: 'closed',
    laneEntries: entries.map(([regId, place]) => ({
      registrationId: regId, skaterName: 'S' + regId, team: 'T', place: String(place), status: '',
    })),
  };
}

// A novice division, two distances. Two skaters end tied on total points; the
// LONGEST distance decides it.
function noviceMeet() {
  return {
    tiebreaker: 'sr832',
    registrations: [{ id: 1, skaterName: 'S1' }, { id: 2, skaterName: 'S2' }],
    races: [
      finalRace(1, 'novice', '200m', 1, [[1, 1], [2, 2]]), // short: S1 1st, S2 2nd
      finalRace(2, 'novice', '500m', 2, [[1, 2], [2, 1]]), // long:  S1 2nd, S2 1st
    ],
  };
}

test('novice: a tie on total points is broken by the LONGEST distance place', () => {
  const st = computeMeetStandings(noviceMeet());
  assert.equal(st.length, 1, 'one novice division');
  const rows = st[0].standings;
  assert.equal(rows[0].totalPoints, 50, 'both skaters tie at 50 pts');
  assert.equal(rows[1].totalPoints, 50);
  // S2 won the 500m (the long race), so S2 takes the overall.
  assert.equal(rows[0].skaterName, 'S2', 'long-race winner takes the overall');
  assert.equal(rows[0].overallPlace, 1);
  assert.equal(rows[1].skaterName, 'S1');
  assert.equal(rows[1].tiebreakerUsed, true, 'the tie was resolved by the tiebreaker');
});

test('novice detection is division-scoped (never fires on a named championship division)', () => {
  assert.equal(isNoviceDivision('novice', []), true);
  assert.equal(isNoviceDivision('Juvenile Boys', [{ class: 'novice' }]), true);
  assert.equal(isNoviceDivision('Juvenile Boys', [{ class: 'elite' }]), false);
  assert.equal(isNoviceDivision('Juvenile Boys', []), false);
});

test('noviceTiebreakerPlace reads the long-race place; Infinity when unplaced there', () => {
  const races = [{ id: 1, distanceLabel: '200m' }, { id: 2, distanceLabel: '500m' }];
  assert.equal(noviceTiebreakerPlace([{ raceId: 2, place: 1 }], races), 1);
  assert.equal(noviceTiebreakerPlace([{ raceId: 1, place: 1 }], races), Infinity, 'placed only in the short race');
  assert.equal(distanceMeters('1500m'), 1500);
});
