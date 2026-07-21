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
function meetWith(blocks) { return { id: 1, meetName: 'M', blocks, races: [] }; }
function addDivider(meet, body) {
  const router = testRouter();
  const res = rec();
  routeHandler(router, '/api/meet/:meetId/blocks/add-divider')(
    { params: { meetId: '1' }, db: { meets: [meet] }, user: { id: 1, roles: ['super_admin'] }, body }, res);
  return res;
}

test('R8 add-divider back-compat: no position appends a Day 1 divider (unchanged behavior)', () => {
  const meet = meetWith([{ id: 'a', type: 'race', day: 'Day 1', raceIds: [] }, { id: 'b', type: 'race', day: 'Day 2', raceIds: [] }]);
  const res = addDivider(meet, { type: 'break', name: 'Break' });
  assert.equal(res.body.ok, true);
  const last = meet.blocks[meet.blocks.length - 1];
  assert.equal(last.id, res.body.blockId);   // appended at end
  assert.equal(last.day, 'Day 1');           // legacy default preserved
  assert.equal(last.type, 'break');
});

test('R8 add-divider afterBlockId inserts right after that block with the given day', () => {
  const meet = meetWith([{ id: 'a', type: 'race', day: 'Day 1', raceIds: [] }, { id: 'b', type: 'race', day: 'Day 2', raceIds: [] }]);
  const res = addDivider(meet, { type: 'lunch', name: 'Lunch', day: 'Day 1', afterBlockId: 'a' });
  const idx = meet.blocks.findIndex(x => x.id === res.body.blockId);
  assert.equal(idx, 1);                       // directly after 'a'
  assert.equal(meet.blocks[0].id, 'a');
  assert.equal(meet.blocks[2].id, 'b');       // 'b' pushed down, not lost
  assert.equal(meet.blocks[idx].day, 'Day 1');
  assert.equal(meet.blocks[idx].type, 'lunch');
});

test('R8 add-divider __start__ prepends at the very top', () => {
  const meet = meetWith([{ id: 'a', type: 'race', day: 'Day 1', raceIds: [] }]);
  const res = addDivider(meet, { type: 'practice', name: 'Warm-Up', day: 'Day 1', afterBlockId: '__start__' });
  assert.equal(meet.blocks[0].id, res.body.blockId);
  assert.equal(meet.blocks[0].type, 'practice');
  assert.equal(meet.blocks[1].id, 'a');       // original block still present
});

test('R8 add-divider unknown afterBlockId falls back to append (never drops the divider)', () => {
  const meet = meetWith([{ id: 'a', type: 'race', day: 'Day 1', raceIds: [] }]);
  const res = addDivider(meet, { type: 'break', name: 'Break', afterBlockId: 'does-not-exist' });
  assert.equal(meet.blocks[meet.blocks.length - 1].id, res.body.blockId);
  assert.equal(meet.blocks.length, 2);
});
