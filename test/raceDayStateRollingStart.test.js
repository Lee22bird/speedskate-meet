const test = require('node:test');
const assert = require('node:assert/strict');
const createMobileApiRoutes = require('../routes/mobileApiRoutes');
const { startRollingFinal, undoRollingFinal } = require('../services/rollingStart');

// The iPad reads race-day-state to decide whether to show the judges board's
// rolling-start "Set up rolling final" / "Undo setup" buttons.

function meetFixture() {
  const heat = (id, heatNumber, firstId) => ({
    id, groupId: 'elementary_girls', groupLabel: 'Elementary Girls', division: 'elite',
    dayIndex: 1, distanceLabel: '700m', parentRaceKey: 'elementary_girls|elite|1|700m',
    stage: 'heat', heatNumber, status: 'open', laneEntries: [0, 1].map(offset => ({
      lane: offset + 1, registrationId: firstId + offset, helmetNumber: String(firstId + offset),
      skaterName: `Skater ${firstId + offset}`, team: 'Team United', place: '', time: '', status: '',
    })),
  });
  return {
    id: 42, currentRaceId: 'h1', currentRaceIndex: 0,
    groups: [{ id: 'elementary_girls', label: 'Elementary Girls' }], registrations: [],
    races: [heat('h1', 1, 1), heat('h2', 2, 3), {
      id: 'f1', groupId: 'elementary_girls', groupLabel: 'Elementary Girls', division: 'elite',
      dayIndex: 1, distanceLabel: '700m', parentRaceKey: 'elementary_girls|elite|1|700m',
      stage: 'final', isFinal: true, countsForOverall: true, heatNumber: 0, status: 'open', laneEntries: [],
    }],
    blocks: [{ id: 'b1', name: 'Elite Long Races', raceIds: ['h1', 'h2', 'f1'] }],
  };
}

function raceDayState(meet) {
  const db = { meets: [meet], users: [] };
  const user = { id: 1, roles: ['super_admin'] };
  const router = createMobileApiRoutes({ getSessionUser: () => ({ db, user }), loadDb: () => db, saveDb() {} });
  const layer = router.stack.find(l => l.route?.path === '/api/v1/meets/:meetId/race-day-state' && l.route.methods.get);
  let body = null;
  layer.route.stack[layer.route.stack.length - 1].handle(
    { params: { meetId: String(meet.id) }, headers: {}, get: () => '' },
    { status() { return this; }, json(value) { body = value; return this; } },
  );
  return body;
}

test('race-day-state offers rolling-start setup on an eligible heat 1', () => {
  const state = raceDayState(meetFixture());
  assert.equal(state.ok, true);
  assert.deepEqual(state.rollingStart, { raceId: 'h1', canStart: true, isRollingFinal: false, canUndo: false, skaters: 4 });
});

test('race-day-state reports an undoable rolling final, then nothing after undo', () => {
  const meet = meetFixture();
  assert.equal(startRollingFinal(meet, 'h1').ok, true);
  let state = raceDayState(meet);
  assert.deepEqual(state.rollingStart, { raceId: 'f1', canStart: false, isRollingFinal: true, canUndo: true, skaters: 4 });
  assert.deepEqual(state.orderedRaces.map(r => r.id), ['f1']);

  meet.races.find(r => r.id === 'f1').status = 'closed';
  assert.equal(raceDayState(meet).rollingStart.canUndo, false);
  meet.races.find(r => r.id === 'f1').status = 'open';

  assert.equal(undoRollingFinal(meet, 'f1').ok, true);
  state = raceDayState(meet);
  assert.equal(state.rollingStart.canStart, true);
  assert.equal(state.rollingStart.raceId, 'h1');
});

test('race-day-state has no rolling-start control for an ordinary race', () => {
  const meet = meetFixture();
  meet.currentRaceId = 'h2';
  assert.equal(raceDayState(meet).rollingStart, null);
});
