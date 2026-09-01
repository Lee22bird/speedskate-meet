const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../services/desktopProtestSync');

// The pull-merge is the heart of desktop protest sync. These lock in the two
// gotchas the design turns on: (1) protest ids collide across the online and
// local copies (both mint "P-00N" independently), so merging must NOT key on the
// id; (2) a re-sync must never duplicate a protest already pulled, and must never
// clobber a ruling an official entered on the desktop.

function onlineProtest(over = {}) {
  return {
    id: 'P-001', filedByUserId: 'coach42', raceId: 'r10',
    createdAt: '2026-09-01T10:00:00Z', category: 'Competition', status: 'open',
    ...over,
  };
}

test('mergeProtests pulls new online protests, tagged + re-minted', () => {
  const meet = { protests: [] };
  const added = S.mergeProtests(meet, [
    onlineProtest(),
    onlineProtest({ id: 'P-002', filedByUserId: 'coach77', raceId: 'r11', category: 'Conduct' }),
  ]);
  assert.equal(added, 2);
  assert.equal(meet.protests.length, 2);
  for (const p of meet.protests) {
    assert.equal(p.source, 'online');
    assert.ok(p.hostedProtestId, 'keeps the original online id');
    assert.ok(p.pulledAt, 'stamps pulledAt');
  }
});

test('re-syncing the same online protests adds nothing (natural-key dedup)', () => {
  const meet = { protests: [] };
  const online = [onlineProtest(), onlineProtest({ id: 'P-002', raceId: 'r11' })];
  assert.equal(S.mergeProtests(meet, online), 2);
  assert.equal(S.mergeProtests(meet, online), 0);
  assert.equal(meet.protests.length, 2);
});

test('id collision: online P-001 does not overwrite a local P-001', () => {
  // A ruling already entered locally under P-001, different protest entirely.
  const meet = { protests: [{
    id: 'P-001', filedByUserId: 'localCoach', raceId: 'rX',
    createdAt: '2026-01-01T00:00:00Z', category: 'Conduct', status: 'resolved',
  }] };
  const added = S.mergeProtests(meet, [
    onlineProtest({ id: 'P-001' }),
    onlineProtest({ id: 'P-002', raceId: 'r11', category: 'Conduct' }),
  ]);
  assert.equal(added, 2);
  const local = meet.protests.find(p => p.filedByUserId === 'localCoach');
  assert.equal(local.id, 'P-001', 'local protest keeps its id');
  assert.equal(local.status, 'resolved', 'local ruling untouched');
  const ids = meet.protests.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate local ids');
  const pulled = meet.protests.filter(p => p.source === 'online');
  assert.deepEqual(pulled.map(p => p.hostedProtestId).sort(), ['P-001', 'P-002']);
});

test('mintLocalProtestId skips ids already taken', () => {
  const meet = { protests: [{ id: 'P-001' }, { id: 'P-002' }] };
  assert.equal(S.mintLocalProtestId(meet), 'P-003');
  const gappy = { protests: [{ id: 'P-001' }, { id: 'P-003' }] };
  // length+1 = 3, which is taken → must advance past it.
  assert.equal(S.mintLocalProtestId(gappy), 'P-004');
});

test('naturalKey ignores the (colliding) id, uses filer+race+time+category', () => {
  const a = S.naturalKey({ id: 'P-001', filedByUserId: 'c1', raceId: 'r1', createdAt: 't1', category: 'Competition' });
  const b = S.naturalKey({ id: 'P-999', filedByUserId: 'c1', raceId: 'r1', createdAt: 't1', category: 'Competition' });
  assert.equal(a, b, 'same protest, different minted id → same key');
});

test('statusFor reports disconnected when no session is active', () => {
  S.disconnect();
  assert.equal(S.statusFor('anything').connected, false);
});
