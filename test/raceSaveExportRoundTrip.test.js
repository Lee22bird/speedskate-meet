const test = require('node:test');
const assert = require('node:assert/strict');
const createBuilderRoutes = require('../routes/builderRoutes');
const createRaceDayRoutes = require('../routes/raceDayRoutes');
const { computeQuadStandings } = require('../services/standings');
const { migrateMeet, quadResultsSectionHtml } = require('../services/meetHelpers');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    redirect(value) { this.body = value; return this; },
  };
}

function routeHandler(router, method, path) {
  const layer = router.stack.find(item => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} should exist`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

test('saved Quad places survive reload and match results plus desktop export', () => {
  let persistedJson = '';
  const meet = {
    id: 987654,
    meetName: 'Disposable Round-trip Test',
    ownerUserId: 9,
    lanes: 2,
    registrations: [
      { id: 101, name: 'Skater Two', helmetNumber: '101', team: 'Team United' },
      { id: 102, name: 'Skater One', helmetNumber: '102', team: 'Team United' },
    ],
    races: [{
      id: 'quad-final', groupId: 'quad-girls', groupLabel: 'Quad Freshman Girls',
      division: 'quad', dayIndex: 1, distanceLabel: '300m', isQuadRace: true,
      isFinal: true, countsForOverall: true, status: 'open', laneEntries: [],
    }],
  };
  const db = { meets: [meet] };
  const user = { id: 9, displayName: 'Test Judge', roles: ['super_admin'] };
  const raceRouter = createRaceDayRoutes({
    requireRole: () => (req, res, next) => next(),
    saveDb: value => { persistedJson = JSON.stringify(value); },
  });
  const save = routeHandler(raceRouter, 'post', '/portal/meet/:meetId/race-day/judges/save');
  const saveResponse = responseRecorder();

  save({
    params: { meetId: meet.id }, db, user,
    body: {
      raceId: 'quad-final', action: 'close', resultsMode: 'places',
      registrationId_1: '101', helmetNumber_1: '101', skaterName_1: 'Skater Two', team_1: 'Team United', place_1: '2',
      registrationId_2: '102', helmetNumber_2: '102', skaterName_2: 'Skater One', team_2: 'Team United', place_2: '1',
    },
    get: () => 'application/json', is: () => false,
  }, saveResponse);

  assert.equal(saveResponse.body.ok, true, JSON.stringify(saveResponse.body));
  assert.ok(persistedJson, 'race save should persist the database');

  const reloadedDb = JSON.parse(persistedJson);
  const reloadedMeet = reloadedDb.meets[0];
  migrateMeet(reloadedMeet);

  const exportRouter = createBuilderRoutes({
    requireRole: () => (req, res, next) => next(),
  });
  const exportMeet = routeHandler(exportRouter, 'get', '/portal/meet/:meetId/desktop-export');
  const exportResponse = responseRecorder();
  exportMeet({ params: { meetId: meet.id }, db: reloadedDb, user }, exportResponse);

  assert.equal(exportResponse.body.ok, true);
  assert.deepEqual(exportResponse.body.meet.races[0].laneEntries.map(entry => entry.place), ['2', '1']);

  const [section] = computeQuadStandings(reloadedMeet);
  assert.deepEqual(section.standings.map(row => [row.skaterName, row.raceScores[0].place, row.totalPoints]), [
    ['Skater One', 1, 30],
    ['Skater Two', 2, 20],
  ]);
  const resultsHtml = quadResultsSectionHtml(section, reloadedMeet, { print: true });
  assert.match(resultsHtml, /<strong>1<\/strong>/);
  assert.match(resultsHtml, /<strong>2<\/strong>/);
});
