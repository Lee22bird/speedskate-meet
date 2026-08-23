const test = require('node:test');
const assert = require('node:assert/strict');
const { meetHasStartedRacing, startedRacingSummary, regenConfirmed } = require('../services/regenGuard');

test('no races → not started', () => {
  assert.equal(meetHasStartedRacing({}), false);
  assert.equal(meetHasStartedRacing({ races: [] }), false);
});

test('scheduled races with empty lane entries → not started', () => {
  const meet = { races: [{ status: 'scheduled', laneEntries: [{ helmetNumber: 12, place: '', time: '' }] }] };
  assert.equal(meetHasStartedRacing(meet), false);
});

test('a closed race → started', () => {
  assert.equal(meetHasStartedRacing({ races: [{ status: 'closed', laneEntries: [] }] }), true);
});

test('an entered place → started', () => {
  const meet = { races: [{ status: 'scheduled', laneEntries: [{ helmetNumber: 12, place: 1 }] }] };
  assert.equal(meetHasStartedRacing(meet), true);
});

test('an entered time → started', () => {
  const meet = { races: [{ status: 'scheduled', laneEntries: [{ helmetNumber: 12, time: '1:23.4' }] }] };
  assert.equal(meetHasStartedRacing(meet), true);
});

test('summary counts closed and scored races', () => {
  const meet = { races: [
    { status: 'closed', laneEntries: [{ place: 1 }] },
    { status: 'scheduled', laneEntries: [{ place: 2 }] },
    { status: 'scheduled', laneEntries: [{ place: '' }] },
  ] };
  const s = startedRacingSummary(meet);
  assert.equal(s.closed, 1);
  assert.equal(s.scored, 2); // the closed race also has a place entered
});

test('regenConfirmed reads body then query', () => {
  assert.equal(regenConfirmed({ body: { confirmRegen: '1' } }), true);
  assert.equal(regenConfirmed({ query: { confirmRegen: '1' } }), true);
  assert.equal(regenConfirmed({ body: {}, query: {} }), false);
  assert.equal(regenConfirmed({ body: { confirmRegen: '0' } }), false);
  assert.equal(regenConfirmed({}), false);
});
