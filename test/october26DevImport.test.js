const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultMeet, applyDivisionScheme } = require('../services/meetHelpers');
const createRegistrationRoutes = require('../routes/registrationRoutes');

test('October dev import honors MSSL challenge-up entries for Elementary Girls Elite', () => {
  const meet = defaultMeet({ id: 1, displayName: 'Test', roles: ['super_admin'] });
  meet.id = 1;
  meet.date = '2026-10-04';
  applyDivisionScheme(meet, 'mssl');
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
    item.route?.path === '/portal/meet/:meetId/dev/import-october-26' && item.route.methods.post
  );

  layer.route.stack.at(-1).handle(
    {
      params: { meetId: '1' },
      db,
      user: { id: 1, roles: ['super_admin'] },
      body: { action: 'import', replace: 'on' },
    },
    { redirect() {}, status() { return this; }, send() {} }
  );

  const elementaryHeats = meet.races.filter(race =>
    race.groupId === 'elementary_girls' &&
    race.division === 'elite' &&
    race.distanceLabel === '700m' &&
    race.stage === 'heat'
  );
  assert.equal(elementaryHeats.length, 2, 'nine entrants should produce two heats');

  const helmets = elementaryHeats.flatMap(race => race.laneEntries.map(entry => String(entry.helmetNumber)));
  assert.equal(helmets.length, 9);
  assert.deepEqual(helmets.sort(), ['128', '523', '552', '610', '612', '622', '655', '703', '1203'].sort());

  const freshmanGirlsHeats = meet.races.filter(race =>
    race.groupId === 'freshman_girls' &&
    race.division === 'elite' &&
    race.distanceLabel === '1000m' &&
    race.stage === 'heat'
  );
  assert.equal(freshmanGirlsHeats.length, 2);
  const freshmanGirlsHelmets = freshmanGirlsHeats.flatMap(race =>
    race.laneEntries.map(entry => String(entry.helmetNumber))
  );
  assert.equal(freshmanGirlsHelmets.length, 9);
  assert.deepEqual(freshmanGirlsHelmets.sort(), ['53', '128', '543', '544', '552', '592', '655', '663', '703'].sort());
});
