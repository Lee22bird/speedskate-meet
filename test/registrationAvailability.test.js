const test = require('node:test');
const assert = require('node:assert/strict');

const { defaultMeet, migrateMeet, makeSetupPresetFromMeet, applyDivisionScheme } = require('../services/meetHelpers');
const { applySetupPresetToMeet } = require('../services/setupPresets');
const { registrationAvailability } = require('../services/registrationAvailability');

function registrationRouterFor(db) {
  const createRegistrationRoutes = require('../routes/registrationRoutes');
  return createRegistrationRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: ({ bodyHtml }) => bodyHtml,
    saveDb: () => {},
    loadDb: () => db,
    getSessionUser: () => null,
    TEAM_LIST: [],
    toggleSwitch: (name, checked, label = '', value = 'on') => `<input type="checkbox" name="${name}" value="${value}" ${checked ? 'checked' : ''}>${label}`,
    renderCheckinView: () => '',
    renderRegisteredView: () => '',
  });
}

function routeHandler(router, path, method) {
  const layer = router.stack.find(item => item.route?.path === path && item.route.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

test('registration availability includes only director-enabled meet options', () => {
  const meet = defaultMeet('owner');
  meet.allowChallengeUp = true;
  meet.groups[0].divisions.novice.enabled = true;
  meet.openGroups[0].enabled = true;
  meet.additionalGroups[0].enabled = true;

  const available = registrationAvailability(meet);
  assert.equal(available.challengeUp, true);
  assert.equal(available.novice, true);
  assert.equal(available.elite, false);
  assert.equal(available.open, true);
  assert.equal(available.quad, false);
  assert.deepEqual(available.additionalGroups.map(group => group.id), ['manual_extra_1']);
});

test('challenge up stays hidden unless its setup toggle and a standard class are enabled', () => {
  const meet = defaultMeet('owner');
  meet.allowChallengeUp = true;
  assert.equal(registrationAvailability(meet).challengeUp, false);

  meet.groups[0].divisions.elite.enabled = true;
  assert.equal(registrationAvailability(meet).challengeUp, true);

  meet.allowChallengeUp = false;
  assert.equal(registrationAvailability(meet).challengeUp, false);
});

test('challenge-up registration setting survives migration and setup presets', () => {
  const meet = defaultMeet('owner');
  meet.allowChallengeUp = true;
  migrateMeet(meet, 'owner');
  assert.equal(meet.allowChallengeUp, true);

  const preset = makeSetupPresetFromMeet({ setupPresets: [] }, meet, 'Challenge setup', 'owner');
  const target = defaultMeet('owner');
  applySetupPresetToMeet(target, preset);
  assert.equal(target.allowChallengeUp, true);
});

test('public registration renders only enabled event choices and enabled additional rows', () => {
  const meet = defaultMeet('owner');
  meet.id = 9;
  meet.status = 'published';
  meet.groups[0].divisions.elite.enabled = true;
  meet.additionalGroups[1].enabled = true;
  meet.additionalGroups[1].ageGroupLabel = 'Champions Race';
  const db = { meets: [meet], rinks: [], users: [] };
  const router = registrationRouterFor(db);
  let html = '';

  routeHandler(router, '/meet/:meetId/register', 'get')({ params: { meetId: '9' } }, {
    redirect() {},
    send(value) { html = value; },
  });

  assert.match(html, /name="elite"/);
  assert.match(html, /Champions Race/);
  assert.doesNotMatch(html, /toggle-row-label">Additional Races/);
  assert.doesNotMatch(html, /name="novice"/);
  assert.doesNotMatch(html, /name="open"/);
  assert.doesNotMatch(html, /name="quad"/);
  assert.doesNotMatch(html, /name="challengeUp"/);
  assert.doesNotMatch(html, /Additional 1/);
});

test('registration submission discards event choices that the director did not enable', () => {
  const meet = defaultMeet('owner');
  meet.id = 10;
  meet.date = '2026-10-01';
  meet.status = 'published';
  meet.groups[0].divisions.elite.enabled = true;
  const db = { meets: [meet], rinks: [], users: [] };
  const router = registrationRouterFor(db);

  routeHandler(router, '/meet/:meetId/register', 'post')({
    params: { meetId: '10' },
    body: {
      name: 'Test Skater', birthdate: '2021-01-01', gender: 'female',
      elite: 'on', novice: 'on', open: 'on', quad: 'on', challengeUp: 'on', additional: 'on',
      relay2Person: 'on', relay3Person: 'on', relay4Person: 'on', quadRelay2Person: 'on', quadRelay3Person: 'on',
      additionalGroupId: 'manual_extra_1',
    },
  }, {
    redirect() {},
    status() { return this; },
    send() {},
  });

  assert.equal(meet.registrations.length, 1);
  assert.equal(meet.registrations[0].options.elite, true);
  assert.equal(meet.registrations[0].options.novice, false);
  assert.equal(meet.registrations[0].options.open, false);
  assert.equal(meet.registrations[0].options.quad, false);
  assert.equal(meet.registrations[0].options.challengeUp, false);
  assert.equal(meet.registrations[0].options.additional, false);
  assert.equal(meet.registrations[0].options.relay2Person, false);
  assert.equal(meet.registrations[0].options.relay3Person, false);
  assert.equal(meet.registrations[0].options.relay4Person, false);
  assert.equal(meet.registrations[0].options.quadRelay2Person, false);
  assert.equal(meet.registrations[0].options.quadRelay3Person, false);
});

test('registration shows only explicitly enabled relay-builder rows', () => {
  const meet = defaultMeet('owner');
  meet.id = 11;
  meet.status = 'published';
  applyDivisionScheme(meet, 'mssl');
  const db = { meets: [meet], rinks: [], users: [] };
  const router = registrationRouterFor(db);
  let html = '';

  routeHandler(router, '/meet/:meetId/register', 'get')({ params: { meetId: '11' } }, {
    redirect() {},
    send(value) { html = value; },
  });

  assert.match(html, /name="relayEventIds"/);
  assert.doesNotMatch(html, /name="quadRelayEventIds"/);
  assert.doesNotMatch(html, /name="relay2Person"/);
  assert.doesNotMatch(html, /name="quadRelay2Person"/);
});

test('a stale relay master flag does not expose unconfigured relay choices', () => {
  const meet = defaultMeet('owner');
  meet.id = 12;
  meet.status = 'published';
  meet.relayEnabled = true;
  const db = { meets: [meet], rinks: [], users: [] };
  const router = registrationRouterFor(db);
  let html = '';

  routeHandler(router, '/meet/:meetId/register', 'get')({ params: { meetId: '12' } }, {
    redirect() {},
    send(value) { html = value; },
  });

  assert.doesNotMatch(html, /name="relayEventIds"/);
  assert.doesNotMatch(html, /name="quadRelayEventIds"/);
  assert.doesNotMatch(html, /name="relay2Person"/);
  assert.doesNotMatch(html, /name="quadRelay2Person"/);
});
