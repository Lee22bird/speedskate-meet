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

  const scheduledHeats = {
    elementary_girls: {
      distances: ['300m', '500m', '700m'],
      heats: [
        ['Carlie Lentz', 'Rylee Washam', 'Rosalyn Reid', 'Jabree Scott', 'Maisey Hughes-Reece'],
        ['McKinley Nigh', 'Koralyne Hick', 'Rozlyn Maness', 'Gabrielle Chesny'],
      ],
    },
    sophomore_girls: {
      distances: ['500m', '1000m', '1500m'],
      heats: [
        ['Skyler Kirkhart', 'Laney Stevens', 'Aubreigh Sommer', 'Alexandria Chesny'],
        ['Stokley Shrewsbury', 'Journie Warkentin', 'Scarlett Neely', 'Anastasia Chesny'],
      ],
    },
    senior_men: {
      distances: ['500m', '1500m', '3000m'],
      heats: [
        ['Carlo Balderrama', 'Casey Chavez', 'Mason Shore', 'Noah Rumfelt'],
        ['Richie Cabrera', 'Michael Coultis', 'Trenton Kramer', 'Shaun Speidel'],
      ],
    },
    freshman_girls: {
      distances: ['300m', '500m', '1000m'],
      heats: [
        ['McKinley Nigh', 'Koralyne Hick', 'Skyler Kirkhart', 'Karlee Meier', 'Alexandria Chesny'],
        ['Jabree Scott', 'Journie Warkentin', 'Anastasia Chesny', 'Maisey Hughes-Reece'],
      ],
    },
  };
  const scheduledGroupIds = Object.keys(scheduledHeats);
  for (const race of meet.races.filter(race => race.stage === 'heat')) {
    assert.ok(scheduledGroupIds.includes(race.groupId), `${race.groupId} should not have heats`);
  }
  for (const reg of meet.registrations.filter(reg => reg.options.novice)) {
    assert.ok((reg.options.importedEliteGroupIds || []).every(groupId =>
      groupId === String(reg.originalDivisionGroupId)
    ), `${reg.name} should not be imported into an elite challenge-up group`);
  }
  for (const [groupId, schedule] of Object.entries(scheduledHeats)) {
    for (const distance of schedule.distances) {
      const races = meet.races.filter(race =>
        race.groupId === groupId && race.division === 'elite' &&
        race.distanceLabel === distance && race.stage === 'heat'
      ).sort((a, b) => a.heatNumber - b.heatNumber);
      assert.equal(races.length, 2, `${groupId} ${distance} should have exactly two heats`);
      assert.deepEqual(races.map(race => race.laneEntries.map(entry => entry.skaterName)), schedule.heats,
        `${groupId} ${distance} should match the published heat lists`);
    }
  }

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

  const mastersMenRaces = meet.races.filter(race =>
    race.groupId === 'master_men' && race.division === 'elite'
  );
  assert.deepEqual([...new Set(mastersMenRaces.map(race => race.distanceLabel))].sort(), ['1000m', '1500m', '500m']);
  for (const distance of ['500m', '1000m', '1500m']) {
    const races = mastersMenRaces.filter(race => race.distanceLabel === distance);
    assert.equal(races.length, 1, `${distance} should have only its direct final`);
    assert.equal(races[0].stage, 'final');
    assert.equal(races[0].laneEntries.length, 6, `${distance} should have six skaters and no heats`);
    assert.deepEqual(races[0].laneEntries.map(entry => entry.skaterName).sort(), [
      'Casey Chavez', 'Eddie Clapp', 'Lee Bird', 'Michael Chesny - H',
      'Michael Gulley', 'Zackery Cox',
    ].sort());
  }

  const { rebuildRaceAssignmentsSafe } = require('../services/ttHelpers');
  rebuildRaceAssignmentsSafe(meet);
  const generatedRounds = meet.races.filter(race => ['heat', 'semi'].includes(race.stage));
  assert.ok(generatedRounds.length > 0, 'the allowed fields retain their scheduled heat rounds');
  assert.ok(generatedRounds.every(race => scheduledGroupIds.includes(race.groupId)),
    'rebuilding assignments does not reintroduce heats in other divisions');
});
