const crypto = require('crypto');
const { parseCookies, setCookie } = require('../utils/cookies');
const { nowIso } = require('../utils/date');

const PIN_LENGTH = 6;
const DEFAULT_UNLOCK_TTL_MS = 1000 * 60 * 60 * 24 * 3;
const DEFAULT_PIN_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const COOKIE_PREFIX = 'ssm_desktop_meet_';

function pinSecret() {
  return String(
    process.env.SSM_DESKTOP_PIN_SECRET ||
    process.env.SSM_SSO_SECRET ||
    process.env.SSO_SHARED_SECRET ||
    'ssm-desktop-pin-local-dev-secret'
  );
}

function normalizePin(pin) {
  return String(pin || '').replace(/\D/g, '').slice(0, PIN_LENGTH);
}

function isValidPin(pin) {
  return /^\d{6}$/.test(String(pin || ''));
}

function generateDesktopPin() {
  return String(crypto.randomInt(0, 1000000)).padStart(PIN_LENGTH, '0');
}

function hashDesktopPin(pin) {
  const normalized = normalizePin(pin);
  if (!isValidPin(normalized)) throw new Error('Desktop meet PIN must be 6 digits.');
  return crypto.createHmac('sha256', pinSecret()).update(normalized).digest('hex');
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function defaultPinExpiresAt(meet, now = new Date()) {
  const dateValue = String(meet?.endDate || meet?.date || '').trim();
  if (dateValue) {
    const end = new Date(`${dateValue}T23:59:59`);
    if (Number.isFinite(end.getTime())) {
      end.setDate(end.getDate() + 7);
      return end.toISOString();
    }
  }
  return new Date(now.getTime() + DEFAULT_PIN_TTL_MS).toISOString();
}

function generatePinForMeet(meet, options = {}) {
  if (!meet) throw new Error('Meet is required.');
  const pin = generateDesktopPin();
  meet.desktop_pin_hash = hashDesktopPin(pin);
  meet.desktop_pin_created_at = nowIso();
  meet.desktop_pin_expires_at = options.expiresAt || defaultPinExpiresAt(meet);
  meet.updatedAt = nowIso();
  return {
    pin,
    expiresAt: meet.desktop_pin_expires_at,
  };
}

function clearPinForMeet(meet) {
  if (!meet) return meet;
  meet.desktop_pin_hash = '';
  meet.desktop_pin_created_at = '';
  meet.desktop_pin_expires_at = '';
  meet.updatedAt = nowIso();
  return meet;
}

function pinExpired(meet, at = new Date()) {
  const expiresAt = String(meet?.desktop_pin_expires_at || '').trim();
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  return Number.isFinite(ts) && ts <= at.getTime();
}

function verifyDesktopPin(meet, pin, at = new Date()) {
  const hash = String(meet?.desktop_pin_hash || '').trim();
  const normalized = normalizePin(pin);
  if (!hash) return { ok: false, reason: 'missing_pin' };
  if (!isValidPin(normalized)) return { ok: false, reason: 'invalid_format' };
  if (pinExpired(meet, at)) return { ok: false, reason: 'expired' };
  const candidate = hashDesktopPin(normalized);
  if (!timingSafeEqual(candidate, hash)) return { ok: false, reason: 'invalid_pin' };
  return { ok: true, reason: 'verified' };
}

function cookieNameForMeet(meetId) {
  return COOKIE_PREFIX + crypto.createHash('sha1').update(String(meetId || '')).digest('hex').slice(0, 16);
}

function markerExpiryForMeet(meet, at = new Date()) {
  const unlockExpiry = new Date(at.getTime() + DEFAULT_UNLOCK_TTL_MS).getTime();
  const pinExpiry = new Date(String(meet?.desktop_pin_expires_at || '')).getTime();
  const finalExpiry = Number.isFinite(pinExpiry) ? Math.min(unlockExpiry, pinExpiry) : unlockExpiry;
  return new Date(finalExpiry).toISOString();
}

function signUnlockMarker(meetId, pinHash, expiresAt) {
  return crypto
    .createHmac('sha256', pinSecret())
    .update(`${meetId}|${pinHash}|${expiresAt}`)
    .digest('hex');
}

function makeUnlockMarker(meet) {
  const meetId = String(meet?.id || '');
  const pinHash = String(meet?.desktop_pin_hash || '');
  const expiresAt = markerExpiryForMeet(meet);
  return {
    meetId,
    expiresAt,
    sig: signUnlockMarker(meetId, pinHash, expiresAt),
  };
}

function encodeMarker(marker) {
  return Buffer.from(JSON.stringify(marker), 'utf8').toString('base64url');
}

function decodeMarker(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
}

function setDesktopMeetUnlockCookie(res, meet) {
  const marker = makeUnlockMarker(meet);
  const expiresMs = new Date(marker.expiresAt).getTime();
  const maxAgeSec = Math.max(1, Math.floor((expiresMs - Date.now()) / 1000));
  setCookie(res, cookieNameForMeet(meet.id), encodeMarker(marker), maxAgeSec);
  return marker;
}

function isDesktopMeetUnlocked(req, meet, at = new Date()) {
  if (!meet || !String(meet.desktop_pin_hash || '').trim()) return false;
  if (pinExpired(meet, at)) return false;
  const value = parseCookies(req)[cookieNameForMeet(meet.id)];
  const marker = decodeMarker(value);
  if (!marker || String(marker.meetId || '') !== String(meet.id || '')) return false;
  const expiresAt = String(marker.expiresAt || '');
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= at.getTime()) return false;
  const expected = signUnlockMarker(String(meet.id || ''), String(meet.desktop_pin_hash || ''), expiresAt);
  return timingSafeEqual(expected, marker.sig);
}

module.exports = {
  DEFAULT_PIN_TTL_MS,
  DEFAULT_UNLOCK_TTL_MS,
  cookieNameForMeet,
  clearPinForMeet,
  defaultPinExpiresAt,
  generateDesktopPin,
  generatePinForMeet,
  hashDesktopPin,
  isDesktopMeetUnlocked,
  isValidPin,
  normalizePin,
  pinExpired,
  setDesktopMeetUnlockCookie,
  verifyDesktopPin,
};
