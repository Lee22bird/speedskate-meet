const test = require('node:test');
const assert = require('node:assert/strict');
const createRegistrationRoutes = require('../routes/registrationRoutes');

// The check-in toggles historically invert (reg.paid = !reg.paid). They now
// also accept an OPTIONAL absolute value in the body so a stale client's tap
// is idempotent instead of a reversal. These tests pin both behaviors:
// no body field = legacy toggle (website forms), body field = absolute set
// (iPad app), including urlencoded string forms of false ("0"/"false").

function routeHandler(router, path) {
  const layer = router.stack.find(item => item.route?.path === path && item.route.methods.post);
  assert.ok(layer, `POST ${path} should exist`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function testRouter() {
  return createRegistrationRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => {},
    loadDb: () => ({}),
    getSessionUser: () => null,
    TEAM_LIST: [],
    toggleSwitch: () => '',
    renderCheckinView: () => '',
    renderRegisteredView: () => '',
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

function makeReq(db, body) {
  return {
    params: { meetId: '1', regId: '7' },
    query: {},
    body,
    db,
    user: { id: 1, roles: ['super_admin'] },
  };
}

test('toggle-paid without a body field keeps legacy inversion', () => {
  const reg = { id: 7, name: 'Skater', paid: false, checkedIn: false };
  const db = { meets: [{ id: 1, registrations: [reg] }] };
  const handler = routeHandler(testRouter(), '/portal/meet/:meetId/checkin/toggle-paid/:regId');

  handler(makeReq(db, {}), responseRecorder());
  assert.equal(reg.paid, true, 'first bare POST flips false→true');
  handler(makeReq(db, {}), responseRecorder());
  assert.equal(reg.paid, false, 'second bare POST flips back');
});

test('toggle-paid with an absolute value is idempotent', () => {
  const reg = { id: 7, name: 'Skater', paid: false, checkedIn: false };
  const db = { meets: [{ id: 1, registrations: [reg] }] };
  const handler = routeHandler(testRouter(), '/portal/meet/:meetId/checkin/toggle-paid/:regId');

  handler(makeReq(db, { paid: true }), responseRecorder());
  assert.equal(reg.paid, true);
  handler(makeReq(db, { paid: true }), responseRecorder());
  assert.equal(reg.paid, true, 'repeat set-true stays true (no reversal)');
  handler(makeReq(db, { paid: false }), responseRecorder());
  assert.equal(reg.paid, false, 'JSON false clears');
  handler(makeReq(db, { paid: '1' }), responseRecorder());
  assert.equal(reg.paid, true, 'urlencoded "1" sets');
  handler(makeReq(db, { paid: '0' }), responseRecorder());
  assert.equal(reg.paid, false, 'urlencoded "0" clears (not truthy-string trap)');
  handler(makeReq(db, { paid: 'false' }), responseRecorder());
  assert.equal(reg.paid, false, 'urlencoded "false" clears');
});

test('toggle-checkin honors both modes the same way', () => {
  const reg = { id: 7, name: 'Skater', paid: false, checkedIn: false };
  const db = { meets: [{ id: 1, registrations: [reg] }] };
  const handler = routeHandler(testRouter(), '/portal/meet/:meetId/checkin/toggle-checkin/:regId');

  handler(makeReq(db, {}), responseRecorder());
  assert.equal(reg.checkedIn, true, 'bare POST still toggles');
  handler(makeReq(db, { checkedIn: true }), responseRecorder());
  assert.equal(reg.checkedIn, true, 'absolute true is a no-op when already true');
  handler(makeReq(db, { checkedIn: '0' }), responseRecorder());
  assert.equal(reg.checkedIn, false, 'string "0" clears');
});
