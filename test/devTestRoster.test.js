const test = require('node:test');
const assert = require('node:assert/strict');
const { DEV_TEST_COHORTS, buildDevelopmentTestRoster } = require('../services/devTestRoster');
const { TRAINING_ROSTER_SOURCE, buildTrainingRoster115 } = require('../services/trainingRoster');
const { defaultMeet, applyDivisionScheme } = require('../services/meetHelpers');
const { buildNationalsDevRoster } = require('../services/nationalsRoster');
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

test('115-skater training roster preserves identities and event options', () => {
  const roster = buildTrainingRoster115();
  assert.equal(roster.length, 115);
  assert.equal(new Set(roster.map(row => row.name)).size, 115);
  assert.equal(new Set(roster.map(row => row.helmetNumber)).size, 115);
  assert.equal(new Set(roster.map(row => row.meetNumber)).size, 115);
  assert.ok(new Set(roster.map(row => row.team)).size >= 10);
  assert.ok(roster.some(row => row.options.novice));
  assert.ok(roster.some(row => row.options.elite));
  assert.ok(roster.some(row => row.options.open));
  assert.ok(roster.some(row => row.options.quad));
  assert.ok(roster.some(row => row.options.relays));
  assert.ok(roster.some(row => row.options.additional));
});

test('training import route builds a complete 115-skater simulated meet', () => {
  const meet = defaultMeet({ id: 1, displayName: 'Developer', roles: ['super_admin'] });
  meet.id = 1;
  for (const group of meet.groups) {
    group.divisions.novice = { enabled: true, cost: 0, distances: ['300m', '500m', '1000m', ''] };
    group.divisions.elite = { enabled: true, cost: 0, distances: ['300m', '500m', '1000m', ''] };
  }
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
    item.route?.path === '/portal/meet/:meetId/dev/import-training-115' && item.route.methods.post
  );
  assert.ok(layer, '115-skater training import POST route should exist');

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

  assert.equal(meet.registrations.length, 115);
  assert.ok(meet.registrations.every(row => row.importSource === TRAINING_ROSTER_SOURCE));
  assert.ok(meet.registrations.every(row => row.paid && row.checkedIn));
  assert.ok(meet.registrations.every(row => row.divisionGroupId && row.divisionGroupLabel !== 'Unassigned'));
  assert.ok(meet.races.length > 0);
  assert.ok(meet.blocks.length > 0);
  assert.match(redirect, /devImported=115$/);
});

test('nationals dev roster mirrors real IDN 2026 participation (helmets, inline/quad split, quad relays)', () => {
  const rows = buildNationalsDevRoster();
  assert.equal(rows.length, 362, 'all 362 real helmet entries');
  // Real helmet numbers, unique, carried on every row.
  assert.ok(rows.every(r => String(r.helmet || '').trim()), 'every row carries its real helmet');
  assert.equal(new Set(rows.map(r => r.helmet)).size, rows.length, 'helmets unique');

  const byHelmet = new Map(rows.map(r => [r.helmet, r]));
  // #37 Brayden Thomas: QUAD-ONLY at real Nationals (quad individual + quad
  // relays, no inline individual) — must NOT be entered inline.
  const brayden = byHelmet.get('37');
  assert.ok(brayden && /brayden/i.test(brayden.name));
  assert.ok(!brayden.options.includes('elite'), 'quad-only skater must not be entered inline');
  assert.ok(brayden.options.includes('quad'));
  assert.ok(brayden.options.includes('quadRelay2Person') && brayden.options.includes('quadRelay3Person'));
  // #13 Matthew Towne II: inline + inline relays + quad RELAYS but NO quad
  // individual — must not be entered in quad individual races.
  const towne = byHelmet.get('13');
  assert.ok(towne && /towne/i.test(towne.name));
  assert.ok(towne.options.includes('elite'));
  assert.ok(!towne.options.includes('quad'), 'quad-relay-only skater must not enter quad individual');
  assert.ok(towne.options.includes('quadRelay2Person') && towne.options.includes('quadRelay3Person'));
  // #25 Eddie Wilcox: ordinary inline skater with all three inline relay sizes.
  const wilcox = byHelmet.get('25');
  assert.ok(wilcox.options.includes('elite'));
  for (const o of ['relay2Person', 'relay3Person', 'relay4Person']) assert.ok(wilcox.options.includes(o), `Wilcox missing ${o}`);
  // The 51 quad-only helmets are exactly the rows without inline entry.
  assert.equal(rows.filter(r => !r.options.includes('elite')).length, 51);
});

test('nationals import enters skaters under their REAL helmet numbers into a full USARS meet', () => {
  const meet = defaultMeet({ id: 1, displayName: 'Developer', roles: ['super_admin'] });
  meet.id = 1;
  applyDivisionScheme(meet, true); // the complete USARS national preset
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
    item.route?.path === '/portal/meet/:meetId/dev/import-nationals' && item.route.methods.post
  );
  assert.ok(layer, 'nationals import POST route should exist');

  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  handler({
    params: { meetId: '1' },
    db,
    user: { id: 1, roles: ['super_admin'] },
    body: { action: 'import', replace: 'on', checkedIn: 'on', paid: 'on' },
  }, {
    redirect() {},
    status() { return this; },
    send() {},
  });

  assert.equal(meet.registrations.length, 362);
  assert.ok(meet.registrations.every(r => r.importSource === 'nationals_2026_roster'));
  // Real helmet number rides on BOTH meetNumber and helmetNumber (1:1 with the
  // printed heat sheets / answer key), and stays unique.
  const brayden = meet.registrations.find(r => /brayden thomas/i.test(r.name));
  assert.equal(Number(brayden.meetNumber), 37);
  assert.equal(Number(brayden.helmetNumber), 37);
  assert.equal(new Set(meet.registrations.map(r => Number(r.meetNumber))).size, 362, 'meet numbers unique');
  // Participation flags survive the option-object mapping.
  assert.equal(brayden.options.elite, false);
  assert.equal(brayden.options.quad, true);
  assert.equal(brayden.options.quadRelay2Person, true);
  const towne = meet.registrations.find(r => /matthew towne/i.test(r.name));
  assert.equal(towne.options.quad, false);
  assert.equal(towne.options.quadRelay2Person, true);
  assert.ok(meet.races.length > 0, 'races generated');
});
