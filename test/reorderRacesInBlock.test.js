const test = require('node:test');
const assert = require('node:assert/strict');
const createRaceDayRoutes = require('../routes/raceDayRoutes');

function routeHandler(router, path) {
  const layer = router.stack.find(item => item.route?.path === path && item.route.methods.post);
  assert.ok(layer, `POST ${path} should exist`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}
function testRouter() {
  return createRaceDayRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: v => v, saveDb: () => {}, renderBlockBuilderView: () => '',
    resultsSectionHtml: () => '', announcerBoxHtml: () => '', meetTabs: () => '',
  });
}
function rec() {
  return { statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    send(v) { this.body = v; return this; }, json(v) { this.body = v; return this; } };
}
function call(path, meet, body) {
  const res = rec();
  routeHandler(testRouter(), path)({ params: { meetId: '1' }, db: { meets: [meet] }, user: { id: 1, roles: ['super_admin'] }, body }, res);
  return res;
}
function raceMeet(raceIds) {
  return {
    id: 1, meetName: 'M', timeTrialEvents: [], currentRaceId: null,
    races: raceIds.map(id => ({ id, division: 'novice', ages: '10', dayIndex: 1, laneEntries: [] })),
    blocks: [{ id: 'blk', type: 'race', day: 'Day 1', raceIds: [...raceIds], timeTrialEventIds: [] }],
  };
}

// ── reorder-races (same-block) ──
test('R11 reorder-races: a valid permutation sets the new order', () => {
  const meet = raceMeet(['a', 'b', 'c']);
  const res = call('/api/meet/:meetId/blocks/reorder-races', meet, { blockId: 'blk', order: ['c', 'a', 'b'] });
  assert.equal(res.body.ok, true);
  assert.deepEqual(meet.blocks[0].raceIds, ['c', 'a', 'b']);
});

test('R11 reorder-races: non-permutations are rejected (400) and the order is untouched', () => {
  const meet = raceMeet(['a', 'b', 'c']);
  for (const bad of [['a', 'b'], ['a', 'b', 'c', 'd'], ['a', 'a', 'b']]) {
    assert.equal(call('/api/meet/:meetId/blocks/reorder-races', meet, { blockId: 'blk', order: bad }).statusCode, 400);
  }
  assert.deepEqual(meet.blocks[0].raceIds, ['a', 'b', 'c']);
});

test('R11 reorder-races: non-race block => 400; unknown block => 404', () => {
  const meet = raceMeet(['a', 'b']);
  meet.blocks.push({ id: 'div', type: 'lunch', raceIds: [] });
  assert.equal(call('/api/meet/:meetId/blocks/reorder-races', meet, { blockId: 'div', order: [] }).statusCode, 400);
  assert.equal(call('/api/meet/:meetId/blocks/reorder-races', meet, { blockId: 'nope', order: ['a'] }).statusCode, 404);
});

// ── move-race beforeRaceId (cross-block drop-at-position) ──
test('R11 move-race beforeRaceId: an incoming race lands BEFORE that race', () => {
  const meet = raceMeet(['a', 'b', 'c']);
  meet.races.push({ id: 'x', division: 'novice', ages: '10', dayIndex: 1, laneEntries: [] });
  const res = call('/api/meet/:meetId/blocks/move-race', meet, { raceId: 'x', destBlockId: 'blk', beforeRaceId: 'b' });
  assert.equal(res.body.ok, true);
  assert.deepEqual(meet.blocks[0].raceIds, ['a', 'x', 'b', 'c']);
});

test('R11 move-race WITHOUT beforeRaceId still appends (back-compat, unchanged behavior)', () => {
  const meet = raceMeet(['a', 'b']);
  meet.races.push({ id: 'x', division: 'novice', ages: '10', dayIndex: 1, laneEntries: [] });
  call('/api/meet/:meetId/blocks/move-race', meet, { raceId: 'x', destBlockId: 'blk' });
  assert.deepEqual(meet.blocks[0].raceIds, ['a', 'b', 'x']);
});

test('R11 move-race with an unknown beforeRaceId falls back to append', () => {
  const meet = raceMeet(['a', 'b']);
  meet.races.push({ id: 'x', division: 'novice', ages: '10', dayIndex: 1, laneEntries: [] });
  call('/api/meet/:meetId/blocks/move-race', meet, { raceId: 'x', destBlockId: 'blk', beforeRaceId: 'zzz' });
  assert.deepEqual(meet.blocks[0].raceIds, ['a', 'b', 'x']);
});

test('R11 move-race same-block reposition (remove then insert before)', () => {
  const meet = raceMeet(['a', 'b', 'c']);
  call('/api/meet/:meetId/blocks/move-race', meet, { raceId: 'c', destBlockId: 'blk', beforeRaceId: 'a' });
  assert.deepEqual(meet.blocks[0].raceIds, ['c', 'a', 'b']);
});
