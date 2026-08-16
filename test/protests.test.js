const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../services/protests');

test('nextProtestId is sequential + zero-padded per meet', () => {
  assert.equal(P.nextProtestId({ protests: [] }), 'P-001');
  assert.equal(P.nextProtestId({ protests: [{}, {}] }), 'P-003');
  assert.equal(P.nextProtestId({}), 'P-001');
});

test('race-specific categories only', () => {
  assert.equal(P.isRaceSpecific('Competition'), true);
  assert.equal(P.isRaceSpecific('Officials'), false);
});

test('buildProtest validates category + statement, strips raceId for meet-wide', () => {
  const meet = { protests: [] };
  assert.equal(P.buildProtest(meet, { category: 'Nope', statement: 'x' }, 't').ok, false);
  assert.equal(P.buildProtest(meet, { category: 'Competition', statement: '' }, 't').ok, false);
  assert.equal(P.buildProtest(meet, { category: 'Competition', statement: 'a'.repeat(2001) }, 't').ok, false);
  const good = P.buildProtest(meet, { category: 'Competition', raceId: 'r1', raceLabel: 'R', statement: 'bad call', filedByUserId: 'u1', filedByName: 'Coach', team: 'United' }, '2026-10-17T00:00:00Z');
  assert.equal(good.ok, true);
  assert.equal(good.protest.id, 'P-001');
  assert.equal(good.protest.raceId, 'r1');
  assert.equal(good.protest.state, 'new');
  // meet-wide category drops the raceId even if one is passed
  const wide = P.buildProtest(meet, { category: 'Officials', raceId: 'r1', statement: 'x' }, 't');
  assert.equal(wide.protest.raceId, '');
});

test('coach containment: a coach sees only their own protests', () => {
  const meet = { protests: [
    P.normalizeProtest({ id: 'P-001', filedByUserId: 'u1' }),
    P.normalizeProtest({ id: 'P-002', filedByUserId: 'u2' }),
  ] };
  assert.deepEqual(P.protestsForCoach(meet, 'u1').map(p => p.id), ['P-001']);
  assert.deepEqual(P.protestsForCoach(meet, 'u2').map(p => p.id), ['P-002']);
  assert.deepEqual(P.protestsForCoach(meet, '').map(p => p.id), []);
});

test('raceHasProtest ticks the score-sheet box for a protested race', () => {
  const meet = { protests: [P.normalizeProtest({ id: 'P-001', raceId: 'r5' })] };
  assert.equal(P.raceHasProtest(meet, 'r5'), true);
  assert.equal(P.raceHasProtest(meet, 'r9'), false);
  assert.equal(P.raceHasProtest(meet, ''), false);
});
