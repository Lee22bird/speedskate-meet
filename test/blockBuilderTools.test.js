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

test('Optimize Flow matches the league director rule: heats-only final in age order, semis-division final at block end', () => {
  // Age order via groups: Primary (young) -> Freshman -> Senior (old).
  const groups = [
    { id: 'g_primary', label: 'Primary Girls' },
    { id: 'g_freshman', label: 'Freshman Boys' },
    { id: 'g_senior', label: 'Senior Men' },
  ];
  const R = (id, groupId, extra) => ({ id, groupId, division: 'elite', dayIndex: 1, distanceLabel: '300m', ...extra });
  const races = [
    R('primary_fin', 'g_primary', { stage: 'final', isFinal: true }),          // straight
    R('fb_h1', 'g_freshman', { stage: 'heat', heatNumber: 1, parentRaceKey: 'fb' }), // heats-only
    R('fb_h2', 'g_freshman', { stage: 'heat', heatNumber: 2, parentRaceKey: 'fb' }),
    R('fb_fin', 'g_freshman', { stage: 'final', isFinal: true, parentRaceKey: 'fb' }),
    R('sr_h1', 'g_senior', { stage: 'heat', heatNumber: 1, parentRaceKey: 'sr' }),   // semis division
    R('sr_h2', 'g_senior', { stage: 'heat', heatNumber: 2, parentRaceKey: 'sr' }),
    R('sr_s1', 'g_senior', { stage: 'semi', heatNumber: 1, parentRaceKey: 'sr' }),
    R('sr_s2', 'g_senior', { stage: 'semi', heatNumber: 2, parentRaceKey: 'sr' }),
    R('sr_fin', 'g_senior', { stage: 'final', isFinal: true, parentRaceKey: 'sr' }),
  ];
  // Scramble the block's raceIds so the arranger must actually sort them.
  const block = { id: 'blk1', type: 'race', raceIds: ['sr_fin', 'primary_fin', 'fb_fin', 'sr_s1', 'fb_h2', 'sr_h1', 'fb_h1', 'sr_h2', 'sr_s2'] };
  const meet = { id: 1, meetName: 'Flow Meet', groups, blocks: [block], races };
  const db = { meets: [meet] };
  const router = testRouter(db);
  routeHandler(router, '/portal/meet/:meetId/blocks/auto-flow')(
    { params: { meetId: '1' }, query: {}, db, user: { id: 1, roles: ['super_admin'] } },
    responseRecorder(),
  );
  const ids = meet.blocks[0].raceIds;
  const at = id => ids.indexOf(id);
  // 1) All heats ride the top, youngest -> oldest.
  assert.deepEqual(ids.slice(0, 4), ['fb_h1', 'fb_h2', 'sr_h1', 'sr_h2'], 'heats lead the block, young->old');
  // 2) Heats-only division (Freshman) runs its FINAL in age order — NOT at the end.
  assert.ok(at('fb_fin') > at('fb_h2'), 'freshman final after its heats');
  assert.ok(at('fb_fin') < at('sr_fin'), 'freshman (heats-only) final is NOT deferred to the block end');
  assert.ok(at('fb_fin') < ids.length - 1, 'freshman final runs in the sweep, not last');
  // Semis run in the age sweep, before the deferred final.
  assert.ok(at('sr_s1') < at('sr_fin') && at('sr_s2') < at('sr_fin'), 'senior semis run before its final');
  // 3) The semis-division final is dead last (the rest break).
  assert.equal(at('sr_fin'), ids.length - 1, 'senior (semis) final is last in the block');
});
