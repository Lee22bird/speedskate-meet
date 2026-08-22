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
  // raceId must resolve to a REAL race in the meet — an unresolvable id would
  // skip the deadline gate and break the uphold→correction deep link.
  const meet = { protests: [], races: [{ id: 'r1', groupLabel: 'Juvenile Girls', division: 'novice', distanceLabel: '500m' }] };
  assert.equal(P.buildProtest(meet, { category: 'Nope', statement: 'x' }, 't').ok, false);
  assert.equal(P.buildProtest(meet, { category: 'Competition', statement: '' }, 't').ok, false);
  assert.equal(P.buildProtest(meet, { category: 'Competition', statement: 'a'.repeat(2001) }, 't').ok, false);
  const good = P.buildProtest(meet, { category: 'Competition', raceId: 'r1', raceLabel: 'CLIENT LABEL IGNORED', statement: 'bad call', filedByUserId: 'u1', filedByName: 'Coach', team: 'United' }, '2026-10-17T00:00:00Z');
  assert.equal(good.ok, true);
  assert.equal(good.protest.id, 'P-001');
  assert.equal(good.protest.raceId, 'r1');
  assert.equal(good.protest.state, 'new');
  // the label is derived server-side from the resolved race, never trusted
  // from the client form
  assert.equal(good.protest.raceLabel, 'Juvenile Girls · Novice · 500m');
  // meet-wide category drops the raceId even if one is passed
  const wide = P.buildProtest(meet, { category: 'Officials', raceId: 'r1', statement: 'x' }, 't');
  assert.equal(wide.protest.raceId, '');
  // a race-specific category with a BOGUS raceId drops it too (stored as
  // meet-wide rather than pointing at a race that doesn't exist)
  const bogus = P.buildProtest(meet, { category: 'Competition', raceId: 'nope', raceLabel: 'X', statement: 'x' }, 't');
  assert.equal(bogus.protest.raceId, '');
  assert.equal(bogus.protest.raceLabel, '');
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

test('buildProtest snapshots feeAmount from meet.protestFee', () => {
  const meet = { protests: [], protestFee: 25, races: [] };
  const r = P.buildProtest(meet, { category: 'Officials', statement: 'x' }, 't');
  assert.equal(r.protest.feeAmount, 25);
  assert.equal(r.protest.feeCollected, false);
});

test('deadline: raceDeadlineAt = closedAt + minutes; window-closed logic', () => {
  const closedAt = '2026-10-17T14:00:00.000Z';
  const meet = { protestDeadlineMinutes: 30, races: [{ id: 'r1', closedAt }] };
  const race = meet.races[0];
  assert.equal(P.raceDeadlineAt(meet, race), '2026-10-17T14:30:00.000Z');
  // before deadline -> open; after -> closed
  assert.equal(P.raceProtestWindowClosed(meet, race, Date.parse('2026-10-17T14:20:00Z')), false);
  assert.equal(P.raceProtestWindowClosed(meet, race, Date.parse('2026-10-17T14:45:00Z')), true);
  // 0 minutes = no limit -> never closed
  assert.equal(P.raceProtestWindowClosed({ protestDeadlineMinutes: 0, races: [race] }, race, Date.parse('2030-01-01T00:00:00Z')), false);
  // no closedAt -> no deadline
  assert.equal(P.raceDeadlineAt(meet, { id: 'r2' }), '');
});

test('buildProtest snapshots deadlineAt for a race-specific protest', () => {
  const meet = { protests: [], protestFee: 0, protestDeadlineMinutes: 30, races: [{ id: 'r1', closedAt: '2026-10-17T14:00:00.000Z' }] };
  const r = P.buildProtest(meet, { category: 'Competition', raceId: 'r1', statement: 'x' }, 't');
  assert.equal(r.protest.deadlineAt, '2026-10-17T14:30:00.000Z');
  // meet-wide category -> no deadline snapshot
  const w = P.buildProtest(meet, { category: 'Officials', statement: 'x' }, 't');
  assert.equal(w.protest.deadlineAt, '');
});

test('unresolvedProtestCount counts new + review only', () => {
  const meet = { protests: [
    P.normalizeProtest({ state: 'new' }), P.normalizeProtest({ state: 'review' }),
    P.normalizeProtest({ state: 'upheld' }), P.normalizeProtest({ state: 'denied' }),
  ] };
  assert.equal(P.unresolvedProtestCount(meet), 2);
});
