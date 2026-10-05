const test = require('node:test');
const assert = require('node:assert/strict');
const { orderedRaces } = require('../services/raceDay');
const { computeMeetStandings } = require('../services/standings');
const { scoreRaceByStandardPoints } = require('../services/usarsScoring');
const { findRollingStartPlan, startRollingFinal, undoRollingFinal } = require('../services/rollingStart');
const { renderJudgeBoard } = require('../views/raceDayView');
const { migrateMeet } = require('../services/meetHelpers');
const createRaceDayRoutes = require('../routes/raceDayRoutes');
const { generateScheduleBlocks } = require('../services/scheduleGenerator');

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
    id: 'meet-1', currentRaceId: 'h1', currentRaceIndex: 0,
    groups: [{ id: 'elementary_girls', label: 'Elementary Girls' }], registrations: [],
    races: [heat('h1', 1, 1), heat('h2', 2, 3), {
      id: 'f1', groupId: 'elementary_girls', groupLabel: 'Elementary Girls', division: 'elite',
      dayIndex: 1, distanceLabel: '700m', parentRaceKey: 'elementary_girls|elite|1|700m',
      stage: 'final', isFinal: true, countsForOverall: true, heatNumber: 0, status: 'open', laneEntries: [],
    }, { id: 'other', groupId: 'other', groupLabel: 'Other', division: 'elite', distanceLabel: '500m', stage: 'final', isFinal: true, status: 'open', laneEntries: [] }],
    blocks: [{ id: 'b1', name: 'Elite Long Races', raceIds: ['h1', 'h2', 'f1', 'other'] }],
  };
}

test('rolling-start final combines both heat fields into one shuffled final event', () => {
  const meet = meetFixture();
  const result = startRollingFinal(meet, 'h1');

  assert.equal(result.ok, true);
  assert.equal(result.skaters, 4);
  assert.equal(meet.currentRaceId, 'f1');
  assert.deepEqual(meet.blocks[0].raceIds, ['f1', 'other']);
  assert.deepEqual(orderedRaces(meet).map(race => race.id), ['f1', 'other']);
  assert.equal(meet.races.find(race => race.id === 'f1').stage, 'final');
  assert.equal(meet.races.find(race => race.id === 'f1').startType, 'rolling');
  assert.equal(meet.races.find(race => race.id === 'f1').laneEntries.length, 4);
  assert.deepEqual(meet.races.find(race => race.id === 'f1').laneEntries.map(entry => entry.lane), [1, 2, 3, 4]);
  assert.deepEqual(new Set(meet.races.find(race => race.id === 'f1').laneEntries.map(entry => entry.registrationId)), new Set([1, 2, 3, 4]));
  assert.ok(meet.races.filter(race => race.id === 'h1' || race.id === 'h2').every(race => race.rollingStartSupersededBy === 'f1'));

  migrateMeet(meet, 1);
  assert.equal(meet.races.find(race => race.id === 'f1').rollingStartBackup.races.length, 3);
  assert.equal(meet.races.find(race => race.id === 'h1').rollingStartSupersededBy, 'f1');
  const regenerated = generateScheduleBlocks(meet, { mode: 'replace', style: 'league' });
  const regeneratedIds = regenerated.blocks.flatMap(block => block.raceIds);
  assert.ok(regeneratedIds.includes('f1'));
  assert.ok(!regeneratedIds.includes('h1') && !regeneratedIds.includes('h2'));
});

test('rolling-start results share one top-four scoring order with no heat advancement', () => {
  const meet = meetFixture();
  startRollingFinal(meet, 'h1');
  const finalRace = meet.races.find(race => race.id === 'f1');
  finalRace.status = 'closed';
  finalRace.laneEntries.forEach((entry, index) => { entry.place = String(index + 1); });

  const scored = scoreRaceByStandardPoints(finalRace);
  assert.equal(scored.length, 4);
  assert.equal(scored.reduce((sum, row) => sum + row.points, 0), 65);
  assert.equal(computeMeetStandings(meet)[0].races.length, 1);
  assert.equal(computeMeetStandings(meet)[0].standings.length, 4);
});

test('an unstarted rolling-start setup can be undone back to the original heats and schedule', () => {
  const meet = meetFixture();
  const original = JSON.stringify({ races: meet.races, blocks: meet.blocks, currentRaceId: meet.currentRaceId });
  startRollingFinal(meet, 'h1');

  assert.deepEqual(undoRollingFinal(meet, 'f1'), { ok: true });
  assert.equal(JSON.stringify({ races: meet.races, blocks: meet.blocks, currentRaceId: meet.currentRaceId }), original);
});

test('rolling-start conversion refuses heats with saved results', () => {
  const meet = meetFixture();
  meet.races[0].laneEntries[0].place = '1';
  assert.equal(findRollingStartPlan(meet, 'h1'), null);
  assert.equal(startRollingFinal(meet, 'h1').ok, false);
});

test('rolling-start setup is limited to elite long-distance two-heat races', () => {
  const meet = meetFixture();
  const h1 = meet.races.find(race => race.id === 'h1');
  const h2 = meet.races.find(race => race.id === 'h2');
  const final = meet.races.find(race => race.id === 'f1');
  h1.dayIndex = 3;
  h2.dayIndex = 3;
  final.dayIndex = 3;
  meet.races.push({ id: 'short', groupId: h1.groupId, division: 'elite', dayIndex: 1, distanceLabel: '300m' });
  meet.races.push({ id: 'long', groupId: h1.groupId, division: 'elite', dayIndex: 3, distanceLabel: '1000m' });
  assert.ok(findRollingStartPlan(meet, 'h1'));

  h1.dayIndex = 1;
  h2.dayIndex = 1;
  final.dayIndex = 1;
  assert.equal(findRollingStartPlan(meet, 'h1'), null);
  h1.dayIndex = 3;
  h2.dayIndex = 3;
  final.dayIndex = 3;
  h1.division = 'novice';
  assert.equal(findRollingStartPlan(meet, 'h1'), null);
});

test('judge screen offers rolling-start setup on heat one and explains the active final', () => {
  const meet = meetFixture();
  const firstHeat = meet.races[0];
  const html = renderJudgeBoard({
    meet, current: firstHeat, rollingStartPlan: findRollingStartPlan(meet, firstHeat.id),
    currentLanes: [], user: {}, raceStatusOptionsHtml: () => '', dqMetadataFields: () => '',
    dqDialogHtml: () => '', mergeGroupMembers: () => null,
  });
  assert.match(html, /Set up rolling final/);
  assert.match(html, /one shared final order/);

  startRollingFinal(meet, firstHeat.id);
  const finalRace = meet.races.find(race => race.id === 'f1');
  const active = renderJudgeBoard({
    meet, current: finalRace, currentLanes: [], user: {}, raceStatusOptionsHtml: () => '',
    dqMetadataFields: () => '', dqDialogHtml: () => '', mergeGroupMembers: () => null,
  });
  assert.match(active, /randomized pace-lap order/);
  assert.match(active, /Undo setup/);
});

test('rolling-start endpoint updates schedule and current race without advancing qualifiers', () => {
  const meet = meetFixture();
  meet.id = 1;
  let saves = 0;
  const router = createRaceDayRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => { saves += 1; },
    renderBlockBuilderView: () => '', resultsSectionHtml: () => '', announcerBoxHtml: () => '', meetTabs: () => '',
  });
  const layer = router.stack.find(item => item.route?.path === '/portal/meet/:meetId/race-day/judges/rolling-start');
  assert.ok(layer, 'rolling-start endpoint exists');
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const response = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; return this; },
    redirect(value) { this.body = value; return this; },
  };

  handler({
    params: { meetId: '1' }, body: { raceId: 'h1', action: 'start' }, db: { meets: [meet] },
    user: { id: 1, roles: ['super_admin'] },
  }, response);

  assert.equal(response.body, '/portal/meet/1/race-day/judges');
  assert.equal(saves, 1);
  assert.equal(meet.currentRaceId, 'f1');
  assert.deepEqual(orderedRaces(meet).map(race => race.id), ['f1', 'other']);
});
