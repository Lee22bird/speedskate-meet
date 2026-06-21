const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearPinForMeet,
  generatePinForMeet,
  hashDesktopPin,
  isDesktopMeetUnlocked,
  isValidPin,
  pinExpired,
  setDesktopMeetUnlockCookie,
  verifyDesktopPin,
} = require('../services/desktopMeetPinService');

function meet(overrides = {}) {
  return {
    id: 'meet-1',
    meetName: 'Alpha Meet',
    date: '2026-06-21',
    ...overrides,
  };
}

function reqFromSetCookie(header) {
  const cookie = Array.isArray(header) ? header[0] : String(header || '');
  return { headers: { cookie: cookie.split(';')[0] } };
}

test('generates a 6-digit desktop PIN and stores only the hash', () => {
  const m = meet();
  const result = generatePinForMeet(m);

  assert.match(result.pin, /^\d{6}$/);
  assert.equal(isValidPin(result.pin), true);
  assert.ok(m.desktop_pin_hash);
  assert.notEqual(m.desktop_pin_hash, result.pin);
  assert.ok(m.desktop_pin_created_at);
  assert.ok(m.desktop_pin_expires_at);
});

test('verifies valid PINs and rejects invalid PINs', () => {
  const m = meet();
  const { pin } = generatePinForMeet(m);
  const badPin = pin === '000000' ? '000001' : '000000';

  assert.deepEqual(verifyDesktopPin(m, pin), { ok: true, reason: 'verified' });
  assert.equal(verifyDesktopPin(m, badPin).reason, 'invalid_pin');
  assert.equal(verifyDesktopPin(m, 'abc123').reason, 'invalid_format');
});

test('rejects expired desktop PINs', () => {
  const m = meet({ desktop_pin_hash: hashDesktopPin('123456'), desktop_pin_expires_at: '2026-01-01T00:00:00.000Z' });

  assert.equal(pinExpired(m, new Date('2026-01-02T00:00:00.000Z')), true);
  assert.equal(verifyDesktopPin(m, '123456', new Date('2026-01-02T00:00:00.000Z')).reason, 'expired');
});

test('resetting a PIN invalidates the previous PIN', () => {
  const m = meet();
  const first = generatePinForMeet(m);
  let second = generatePinForMeet(m);
  while (second.pin === first.pin) second = generatePinForMeet(m);

  assert.equal(verifyDesktopPin(m, first.pin).reason, 'invalid_pin');
  assert.equal(verifyDesktopPin(m, second.pin).ok, true);
});

test('clearing a PIN removes hash and timestamp fields', () => {
  const m = meet();
  generatePinForMeet(m);
  clearPinForMeet(m);

  assert.equal(m.desktop_pin_hash, '');
  assert.equal(m.desktop_pin_created_at, '');
  assert.equal(m.desktop_pin_expires_at, '');
  assert.equal(verifyDesktopPin(m, '123456').reason, 'missing_pin');
});

test('desktop unlock marker works for the same meet and is invalidated by PIN reset', () => {
  const m = meet();
  const { pin } = generatePinForMeet(m);
  assert.equal(verifyDesktopPin(m, pin).ok, true);

  let header = '';
  const res = { setHeader(name, value) { if (name === 'Set-Cookie') header = value; } };
  setDesktopMeetUnlockCookie(res, m);

  const req = reqFromSetCookie(header);
  assert.equal(isDesktopMeetUnlocked(req, m), true);
  assert.equal(isDesktopMeetUnlocked(req, meet({ id: 'other', desktop_pin_hash: m.desktop_pin_hash, desktop_pin_expires_at: m.desktop_pin_expires_at })), false);

  generatePinForMeet(m);
  assert.equal(isDesktopMeetUnlocked(req, m), false);
});
