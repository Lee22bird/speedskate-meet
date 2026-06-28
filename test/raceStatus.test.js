const test = require('node:test');
const assert = require('node:assert/strict');
const createRaceDayRoutes = require('../routes/raceDayRoutes');
const { raceStatusResultsHtml } = require('../services/meetHelpers');
const { scoreRaceByStandardPoints } = require('../services/usarsScoring');
const { tryAdvanceTopThreeFromTwoHeats } = require('../services/meetHelpers');
const {
  RACE_STATUS_OPTIONS,
  isDisqualification,
  isValidRaceStatus,
  raceStatusLabel,
  statusRowsForMeet,
} = require('../services/raceStatus');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; },
    redirect(value) { this.body = value; return this; },
  };
}

function testRouter() {
  return createRaceDayRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => {},
    renderBlockBuilderView: () => '',
    resultsSectionHtml: () => '',
    announcerBoxHtml: () => '',
    meetTabs: () => '',
  });
}

function routeHandler(router, method, path) {
  const layer = router.stack.find(item => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} should exist`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function advancementRace(overrides = {}) {
  return {
    id: overrides.id || 'race',
    groupId: 'g1',
    groupLabel: 'Freshman Girls',
    division: 'elite',
    dayIndex: 1,
    distanceLabel: '500m',
    parentRaceKey: 'g1|elite|1|500m',
    stage: 'heat',
    heatNumber: 1,
    status: 'closed',
    laneEntries: [],
    ...overrides,
  };
}

test('structured race statuses and legacy DQ are recognized', () => {
  assert.equal(RACE_STATUS_OPTIONS.length, 13);
  assert.equal(isDisqualification('DQ'), true);
  assert.equal(isDisqualification('DQ_FALSE_START'), true);
  assert.equal(isDisqualification('DNF'), false);
  assert.equal(isValidRaceStatus('DQ_TEAM_FOUL'), true);
  assert.equal(isValidRaceStatus('DQ'), true);
  assert.equal(isValidRaceStatus('DQ_UNKNOWN_REASON'), false);
  assert.equal(raceStatusLabel('DQ_BODY_CONTACT'), 'DQ – Body Contact');
});

test('structured and legacy disqualifications receive zero points', () => {
  const scored = scoreRaceByStandardPoints({
    laneEntries: [
      { registrationId: 1, skaterName: 'Structured DQ', place: '1', status: 'DQ_FALSE_START' },
      { registrationId: 2, skaterName: 'Legacy DQ', place: '2', status: 'DQ' },
      { registrationId: 3, skaterName: 'Eligible', place: '3', status: '' },
    ],
  });
  assert.deepEqual(scored.map(row => row.skaterName), ['Eligible']);
  assert.equal(scored[0].points, 10);
});

test('DQ entries do not advance from qualifying heats', () => {
  const heatOne = advancementRace({
    id: 'h1',
    heatNumber: 1,
    laneEntries: [
      { registrationId: 1, skaterName: 'DQ Skater', place: '1', status: 'DQ_TRACK_CUT' },
      { registrationId: 2, skaterName: 'H1 Two', place: '2', status: '' },
      { registrationId: 3, skaterName: 'H1 Three', place: '3', status: '' },
      { registrationId: 4, skaterName: 'H1 Four', place: '4', status: '' },
    ],
  });
  const heatTwo = advancementRace({
    id: 'h2',
    heatNumber: 2,
    laneEntries: [1, 2, 3].map(place => ({ registrationId: 10 + place, skaterName: `H2 ${place}`, place: String(place), status: '' })),
  });
  const final = advancementRace({ id: 'f1', stage: 'final', heatNumber: 0, status: 'open', isFinal: true, laneEntries: [] });
  const meet = { races: [heatOne, heatTwo, final] };

  const result = tryAdvanceTopThreeFromTwoHeats(meet, heatTwo);
  assert.equal(result.advanced, true);
  assert.equal(final.laneEntries.some(entry => entry.registrationId === 1), false);
  assert.deepEqual(final.laneEntries.slice(0, 3).map(entry => entry.registrationId), [2, 3, 4]);
});

test('public status output shows DQ reason but never official notes', () => {
  const meet = {
    races: [{
      id: 'r1', status: 'closed', groupLabel: 'Freshman Girls', division: 'elite', distanceLabel: '500m',
      laneEntries: [{
        registrationId: 1, skaterName: 'Jane Skater', team: 'Fast Wheels', status: 'DQ_BODY_CONTACT',
        dqCategory: 'DQ_BODY_CONTACT', dqRuleReference: 'SR 7.3', dqOfficialNotes: 'Private referee detail',
        dqTimestamp: '2026-06-28T10:00:00.000Z', dqRecordedBy: 'Chief Referee',
      }],
    }],
  };
  const publicHtml = raceStatusResultsHtml(meet);
  assert.match(publicHtml, /DQ – Body Contact/);
  assert.doesNotMatch(publicHtml, /Private referee detail/);
  assert.doesNotMatch(publicHtml, /SR 7\.3/);

  const officialRows = statusRowsForMeet(meet, { onlyDisqualifications: true });
  assert.equal(officialRows[0].dqOfficialNotes, 'Private referee detail');
  assert.equal(officialRows[0].dqRuleReference, 'SR 7.3');
});

test('judge save records structured DQ audit fields on the race entry', () => {
  const race = advancementRace({
    id: 'r1', stage: 'final', isFinal: true, status: 'open',
    laneEntries: [{ lane: 1, registrationId: 1, helmetNumber: 101, skaterName: 'Jane Skater', team: 'Fast Wheels' }],
  });
  const meet = { id: 1, ownerUserId: 9, lanes: 1, races: [race], blocks: [], registrations: [] };
  const db = { meets: [meet] };
  const router = testRouter();
  const handler = routeHandler(router, 'post', '/portal/meet/:meetId/race-day/judges/save');
  const response = responseRecorder();
  handler({
    params: { meetId: '1' },
    db,
    user: { id: 9, displayName: 'Referee One', roles: ['super_admin'] },
    body: {
      raceId: 'r1', action: 'save', resultsMode: 'places',
      skaterName_1: 'Jane Skater', team_1: 'Fast Wheels', place_1: '1', time_1: '',
      status_1: 'DQ_TRACK_CUT', dqRuleReference_1: 'SR 8.2', dqOfficialNotes_1: 'Inside both cones',
      dqTimestamp_1: '2026-06-28T11:00:00.000Z',
    },
    get: () => 'application/json',
    is: () => false,
  }, response);

  assert.equal(response.body.ok, true);
  assert.equal(race.laneEntries[0].status, 'DQ_TRACK_CUT');
  assert.equal(race.laneEntries[0].dqCategory, 'DQ_TRACK_CUT');
  assert.equal(race.laneEntries[0].dqRuleReference, 'SR 8.2');
  assert.equal(race.laneEntries[0].dqOfficialNotes, 'Inside both cones');
  assert.equal(race.laneEntries[0].dqRecordedBy, 'Referee One');
  assert.equal(race.laneEntries[0].dqTimestamp, '2026-06-28T11:00:00.000Z');
});

test('judge screen includes every requested status and the DQ dialog', () => {
  const race = advancementRace({ id: 'r1', stage: 'final', isFinal: true, status: 'open', laneEntries: [{ lane: 1, registrationId: 1, skaterName: 'Jane Skater' }] });
  const meet = { id: 1, meetName: 'Test Meet', ownerUserId: 9, lanes: 1, races: [race], blocks: [{ id: 'b1', raceIds: ['r1'] }], registrations: [] };
  const router = testRouter();
  const handler = routeHandler(router, 'get', '/portal/meet/:meetId/race-day/:mode');
  const response = responseRecorder();
  handler({ params: { meetId: '1', mode: 'judges' }, query: {}, db: { meets: [meet] }, user: { id: 9, displayName: 'Referee One', roles: ['super_admin'] } }, response);
  const html = response.body.bodyHtml;

  for (const option of RACE_STATUS_OPTIONS) assert.match(html, new RegExp(`value="${option.value}"`));
  assert.match(html, /id="dqDetailsDialog"/);
  assert.match(html, /Optional Rule Reference/);
  assert.match(html, /Internal officials-only notes/);
  assert.match(html, /Recorded By/);
});
