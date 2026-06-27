const test = require('node:test');
const assert = require('node:assert/strict');
const { DEV_TEST_COHORTS, buildDevelopmentTestRoster } = require('../services/devTestRoster');
const createRegistrationRoutes = require('../routes/registrationRoutes');

test('development roster includes race-sizing foundation cohorts', () => {
  const roster = buildDevelopmentTestRoster();
  const expectedCount = DEV_TEST_COHORTS.reduce((sum, cohort) => sum + cohort.count, 0);
  assert.equal(roster.length, expectedCount);
  assert.deepEqual(DEV_TEST_COHORTS.map(cohort =>
    roster.filter(row => row.testCohort === cohort.key).length
  ), [6, 7, 8, 12, 14, 7]);
});

test('development roster has unique identities and valid race entries', () => {
  const roster = buildDevelopmentTestRoster();
  assert.equal(new Set(roster.map(row => row.name)).size, roster.length);
  assert.equal(new Set(roster.map(row => row.helmetNumber)).size, roster.length);
  assert.ok(roster.every(row => row.name && row.team && row.age > 0));
  assert.ok(roster.every(row => row.options.length === 1 && ['novice', 'elite'].includes(row.options[0])));
});

test('developer import route adds the complete test roster', () => {
  const meet = {
    id: 1,
    meetName: 'Simulated Meet',
    groups: [],
    registrations: [],
    races: [],
    blocks: [],
    additionalGroups: [],
    openGroups: [],
    quadGroups: [],
    relayTemplates: [],
  };
  const db = { meets: [meet] };
  const router = createRegistrationRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => {},
    loadDb: () => db,
    getSessionUser: () => null,
    TEAM_LIST: [],
    toggleSwitch: () => '',
    renderCheckinView: () => '',
    renderRegisteredView: () => '',
  });
  const layer = router.stack.find(item =>
    item.route?.path === '/portal/meet/:meetId/dev/import-spring-fling' && item.route.methods.post
  );
  assert.ok(layer, 'developer import POST route should exist');

  let redirect = '';
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  handler({
    params: { meetId: '1' },
    db,
    user: { id: 1, roles: ['super_admin'] },
    body: { action: 'import', replace: 'on', checkedIn: 'on', paid: 'on' },
  }, {
    redirect(value) { redirect = value; },
    status() { return this; },
    send() {},
  });

  assert.equal(meet.registrations.length, buildDevelopmentTestRoster().length);
  assert.ok(meet.registrations.every(row => row.importSource === 'spring_fling_2026_test'));
  assert.match(redirect, /devImported=54$/);
});
