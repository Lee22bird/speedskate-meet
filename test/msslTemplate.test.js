const test = require('node:test');
const assert = require('node:assert/strict');

const {
  defaultMeet,
  applyDivisionScheme,
  generateConfiguredRacesForMeet,
  migrateMeet,
} = require('../services/meetHelpers');
const { rebuildRaceAssignments } = require('../services/raceGenerator');
const { generateScheduleBlocks } = require('../services/scheduleGenerator');
const { MSSL_RELAY_DIVISIONS, isMsslPresetName } = require('../services/msslTemplate');

function configuredMssl() {
  const meet = defaultMeet('owner');
  meet.id = 1;
  applyDivisionScheme(meet, 'mssl');
  generateConfiguredRacesForMeet(meet);
  return meet;
}

test('MSSL office preset is isolated from Nationals quad and relay tables', () => {
  const meet = configuredMssl();
  assert.equal(meet.divisionScheme, 'mssl');
  assert.equal(meet.usarsDivisions, false);
  assert.equal(meet.quadGroups.length, 8);
  assert.ok(meet.quadGroups.every(g => g.enabled && g.distances.filter(Boolean).length === 2));
  assert.equal(meet.openGroups.length, 8);
  assert.ok(meet.openGroups.every(g => g.enabled));
  assert.equal(meet.relayTemplates.length, 12);
  assert.ok(meet.relayTemplates.every(t => t.enabled && t.discipline === 'inline'));
  assert.equal(meet.races.filter(r => r.isRelayRace).length, 12);
  assert.equal(meet.races.filter(r => r.isRelayRace && r.isQuadRace).length, 0);
  assert.deepEqual(meet.relayTemplates.map(t => t.divisionId), MSSL_RELAY_DIVISIONS.map(d => d.id));
});

test('MSSL schedule follows the league-office block order, including warmups', () => {
  const meet = configuredMssl();
  const result = generateScheduleBlocks(meet, { mode: 'replace', style: 'league' });
  assert.deepEqual(result.blocks.map(b => b.name), [
    'Warm Ups — Quad Skaters',
    'Quad Short Races', 'Quad Middle Races',
    'Warm Up — Elite Inline',
    'Elite Long Races', 'Elite Long Races Continued',
    'Warm Up — Novice',
    'Novice Short Races',
    'Elite Short Races', 'Elite Short Races Continued',
    'Novice Middle Races',
    'Elite Middle Races', 'Elite Middle Races Continued',
    'Opens',
    '3 Person Relays', '2 Person Relays', '4 Person Relays',
  ]);
  assert.ok(result.blocks.filter(b => b.type === 'divider').every(b => b.raceIds.length === 0));
  assert.equal(result.placed, meet.races.length);

  const middleContinued = result.blocks.find(b => b.name === 'Elite Middle Races Continued');
  const labels = middleContinued.raceIds.map(id => meet.races.find(r => r.id === id)?.groupLabel);
  assert.equal(labels[0], 'Skatability');
  assert.ok(labels.includes('Juvenile Girls'));
  assert.ok(!labels.includes('Primary Girls'));
});

test('MSSL distances and relay rotation notes match the office sheet', () => {
  const meet = configuredMssl();
  const racesFor = label => meet.races.filter(r => r.groupLabel === label).map(r => r.distanceLabel);
  assert.deepEqual(racesFor('Sophomore (14-15) & Junior Men'), ['500m', '1000m']);
  assert.deepEqual(racesFor('Junior (16-17) & Senior Ladies'), ['500m', '1000m']);
  assert.deepEqual(racesFor('Senior Men'), ['500m', '1500m', '3000m', '5000m']); // elite + open

  const byId = new Map(meet.relayTemplates.map(t => [t.divisionId, t]));
  assert.equal(byId.get('mssl_r3_juvenile').distance, '900m');
  assert.equal(byId.get('mssl_r3_juvenile').notes, '1 lap 3 times each');
  assert.equal(byId.get('mssl_r2_senior').notes, '2 laps 3 times each');
  assert.equal(byId.get('mssl_r4_juvenile').distance, '1200m');
  assert.equal(byId.get('mssl_r4_senior').distance, '2000m');
});

test('MSSL broad novice bands assign skaters by age and gender', () => {
  const meet = configuredMssl();
  meet.registrations = [{
    id: 1, name: 'Seven Year Old', age: 7, gender: 'female', team: 'Test',
    divisionGroupId: 'primary_girls', originalDivisionGroupId: 'primary_girls',
    options: { novice: true },
  }];
  rebuildRaceAssignments(meet);
  const starts = meet.races.filter(r => (r.laneEntries || []).some(e => String(e.registrationId) === '1'));
  assert.deepEqual(starts.map(r => `${r.groupLabel}|${r.distanceLabel}`).sort(), [
    'Juvenile (9 and under) Girls|200m',
    'Juvenile (9 and under) Girls|300m',
  ]);
});

test('MSSL scheme and custom schedule category survive reload; legacy names are recognized', () => {
  const meet = JSON.parse(JSON.stringify(configuredMssl()));
  migrateMeet(meet, 'owner');
  assert.equal(meet.divisionScheme, 'mssl');
  assert.equal(meet.quadGroups.length, 8);
  assert.equal(meet.additionalGroups[0].scheduleCategory, 'middle');
  assert.equal(isMsslPresetName('MidSouthSpeedLeague'), true);
  assert.equal(isMsslPresetName('MidSouthSpeedLeague Preset'), true);
  assert.equal(isMsslPresetName('MSSL'), true);
});

test('loading an existing MidSouthSpeedLeague preset upgrades it to the office template', () => {
  const createBuilderRoutes = require('../routes/builderRoutes');
  const meet = defaultMeet({ id: 42, displayName: 'Owner', roles: ['meet_director'] });
  meet.id = 77;
  const db = {
    meets: [meet], rinks: [],
    setupPresets: [{
      id: 9, name: 'MidSouthSpeedLeague Preset', groups: [], openGroups: [], quadGroups: [],
      additionalGroups: [], relayTemplates: [], relayRaces: [], blocks: [],
      baseEntryFee: 40, additionalRaceFee: 10, lanes: 7, trackLength: 100,
    }],
  };
  const router = createBuilderRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => {},
    renderMeetBuilderView: () => '', renderOpenBuilderView: () => '',
    renderQuadBuilderView: () => '', renderRelayBuilderView: () => '',
  });
  const layer = router.stack.find(item => item.route?.path === '/portal/meet/:meetId/setup-presets/load' && item.route.methods.post);
  let redirect = '';
  layer.route.stack[layer.route.stack.length - 1].handle({
    params: { meetId: '77' }, db, user: { id: 42, roles: ['meet_director'] },
    body: { presetId: '9', meetName: 'MSSL Friday', status: 'draft' },
  }, {
    redirect(value) { redirect = value; },
    status() { return this; }, send() {},
  });

  assert.match(redirect, /presetLoaded=1/);
  assert.equal(meet.divisionScheme, 'mssl');
  assert.equal(meet.relayTemplates.length, 12);
  assert.equal(meet.races.filter(r => r.isRelayRace).length, 12);
  assert.equal(meet.blocks[0].name, 'Warm Ups — Quad Skaters');
  assert.equal(meet.baseEntryFee, 40);
  assert.equal(meet.additionalRaceFee, 10);
  assert.equal(meet.meetName, 'MSSL Friday');
});
