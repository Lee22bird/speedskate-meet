const test = require('node:test');
const assert = require('node:assert/strict');
const createRaceDayRoutes = require('../routes/raceDayRoutes');
const { renderBlockBuilderView } = require('../views/blockBuilderView');

function routeHandler(router, path) {
  const layer = router.stack.find(item => item.route?.path === path && item.route.methods.post);
  assert.ok(layer, `POST ${path} should exist`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function testRouter(db) {
  return createRaceDayRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => {},
    renderBlockBuilderView: () => '',
    resultsSectionHtml: () => '',
    announcerBoxHtml: () => '',
    meetTabs: () => '',
  });
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; },
    redirect(value) { this.body = value; return this; },
  };
}

test('block builder create tools return the new block location', () => {
  const meet = { id: 1, meetName: 'Test Meet', blocks: [], races: [] };
  const db = { meets: [meet] };
  const router = testRouter(db);
  const reqBase = { params: { meetId: '1' }, db, user: { id: 1, roles: ['super_admin'] } };

  const addResponse = responseRecorder();
  routeHandler(router, '/api/meet/:meetId/blocks/add')({ ...reqBase, body: {} }, addResponse);
  assert.equal(addResponse.body.ok, true);
  assert.equal(addResponse.body.blockId, meet.blocks[0].id);
  assert.equal(meet.blocks[0].type, 'race');

  const dividerResponse = responseRecorder();
  routeHandler(router, '/api/meet/:meetId/blocks/add-divider')({
    ...reqBase,
    body: { type: 'lunch', name: 'Lunch' },
  }, dividerResponse);
  assert.equal(dividerResponse.body.ok, true);
  assert.equal(dividerResponse.body.blockId, meet.blocks[1].id);
  assert.equal(meet.blocks[1].type, 'lunch');
});

test('opening an initialized Block Builder does not rewrite the database', () => {
  const meet = {
    id: 1,
    meetName: 'Test Meet',
    ownerUserId: 1,
    blocks: [{ id: 'b1', name: 'Block 1', type: 'race', day: 'Day 1', raceIds: [] }],
    races: [],
  };
  const db = { meets: [meet] };
  let saveCount = 0;
  const router = createRaceDayRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => { saveCount += 1; },
    renderBlockBuilderView: () => 'builder',
    resultsSectionHtml: () => '',
    announcerBoxHtml: () => '',
    meetTabs: () => '',
  });
  const layer = router.stack.find(item => item.route?.path === '/portal/meet/:meetId/blocks' && item.route.methods.get);
  assert.ok(layer);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const response = responseRecorder();
  handler({ params: { meetId: '1' }, db, user: { id: 1, roles: ['super_admin'] } }, response);
  assert.equal(response.body.bodyHtml, 'builder');
  assert.equal(saveCount, 0);
});

test('block builder tools include progress, timeout recovery, duplicate protection, and target highlighting', () => {
  const meet = {
    id: 1,
    meetName: 'Test Meet',
    status: 'draft',
    blocks: [{ id: 'b1', name: 'Block 1', type: 'race', day: 'Day 1', raceIds: [] }],
    races: [],
  };
  const html = renderBlockBuilderView({ meet });
  assert.match(html, /id="block-b1"/);
  assert.match(html, /onclick="addBlock\(this\)"/);
  assert.match(html, /button\.textContent='Adding…'/);
  assert.match(html, /if\(blockCreatePending\) return/);
  assert.match(html, /setTimeout\(\(\)=>controller\.abort\(\),15000\)/);
  assert.match(html, /server took too long to respond/);
  assert.match(html, /Could not add this block/);
  assert.match(html, /blocks\?created='\+createdId\+'#block-'/);

  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  assert.doesNotThrow(() => new Function(script));
});
