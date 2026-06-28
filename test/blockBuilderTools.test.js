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

  for (const [type, name] of [
    ['break', 'Break'],
    ['lunch', 'Lunch'],
    ['awards', 'Awards'],
    ['practice', 'Practice'],
  ]) {
    const dividerResponse = responseRecorder();
    routeHandler(router, '/api/meet/:meetId/blocks/add-divider')({
      ...reqBase,
      body: { type, name },
    }, dividerResponse);
    const created = meet.blocks[meet.blocks.length - 1];
    assert.equal(dividerResponse.body.ok, true);
    assert.equal(dividerResponse.body.blockId, created.id);
    assert.equal(created.type, type);
  }
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
  assert.match(html, /button\.innerHTML='<span class="schedule-adding-label">Adding…<\/span>'/);
  assert.match(html, /if\(blockCreatePending\) return/);
  assert.match(html, /setTimeout\(\(\)=>controller\.abort\(\),15000\)/);
  assert.match(html, /server took too long to respond/);
  assert.match(html, /Could not add this block/);
  assert.match(html, /blocks\?created='\+createdId\+'#block-'/);

  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  assert.doesNotThrow(() => new Function(script));
});

test('block builder explains schedule creation and empty state uses addBlock', () => {
  const html = renderBlockBuilderView({
    meet: { id: 1, meetName: 'Empty Meet', status: 'draft', blocks: [], races: [] },
  });

  assert.match(html, /Add To Schedule/);
  assert.match(html, /Build your race day by adding blocks, breaks, lunch, awards, or practice sessions\./);
  assert.match(html, /How it works:<\/strong>/);
  assert.match(html, /\+ New Race Block/);
  assert.match(html, /Create a block for a group of races\./);
  assert.match(html, /Insert a short intermission\./);
  assert.match(html, /Insert a meal break\./);
  assert.match(html, /Add an awards presentation\./);
  assert.match(html, /Add warm-up or practice time\./);
  assert.match(html, /Your schedule is empty\./);
  assert.match(html, /Start by creating a race block, then drag races into it\./);
  assert.match(html, /onclick="addBlock\(this\)">Create First Race Block<\/button>/);
});
