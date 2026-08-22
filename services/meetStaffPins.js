// Per-person, per-meet staff PINs.
//
// Officials who won't create an SSL account (and there are always a few) can be
// handed a 6-digit PIN that gets them into ONE meet, in ONE role, AS THEMSELVES.
// The director types their name, picks a role, and reads them the PIN once.
//
// Security shape:
//   • The PIN is never stored — only an HMAC, salted with the row id so two
//     people who happen to draw the same six digits never collide.
//   • A PIN is scoped to exactly one meet and expires with it.
//   • Revoking is immediate and permanent (the row keeps its name for the audit
//     trail; the hash is destroyed).
//   • The identity it produces carries NO platform roles — every permission it
//     gets is decided explicitly by the meet-pin checks in utils/auth.js, so a
//     PIN can never leak access to a different meet.

const crypto = require('crypto');
const { nowIso } = require('../utils/date');

const PIN_LENGTH = 6;
// Roles a director may hand out. Mirrors the meet's staff roles.
const PIN_ROLES = ['meet_director', 'tabulator', 'referee', 'announcer'];
const PIN_ROLE_LABELS = {
  meet_director: 'Meet Director',
  tabulator: 'Tabulator',
  referee: 'Referee',
  announcer: 'Announcer',
};

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
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(String(pin || ''));
}

function generatePin() {
  return String(crypto.randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
}

/// Salted with the row id so identical PINs on different rows hash differently.
function hashPin(pin, rowId) {
  const normalized = normalizePin(pin);
  if (!isValidPin(normalized)) throw new Error('A meet PIN must be 6 digits.');
  return crypto.createHmac('sha256', pinSecret())
    .update(`${String(rowId || '')}:${normalized}`)
    .digest('hex');
}

function timingSafeEqualHex(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

/// PINs die a week after the meet's last day — long enough for a late
/// correction, short enough that a handed-out code doesn't live forever.
function defaultExpiresAt(meet, now = new Date()) {
  const raw = String(meet?.endDate || meet?.date || '').trim();
  const base = raw ? new Date(`${raw}T23:59:59`) : new Date(now);
  const t = base.getTime();
  const from = Number.isFinite(t) ? t : now.getTime();
  return new Date(from + 7 * 24 * 3600 * 1000).toISOString();
}

function staffPinRows(meet) {
  return Array.isArray(meet?.staffPins) ? meet.staffPins : [];
}

function isActive(row, at = new Date()) {
  if (!row || row.revokedAt) return false;
  if (!row.pinHash) return false;
  const exp = new Date(String(row.expiresAt || '')).getTime();
  if (Number.isFinite(exp) && at.getTime() > exp) return false;
  return true;
}

/// Create a PIN for `name` in `role`. Returns the row plus the PLAINTEXT pin —
/// the only moment it exists; callers must show it once and never store it.
function createStaffPin(meet, { name, role, createdByUserId = '' } = {}) {
  if (!meet) throw new Error('Meet not found.');
  const cleanName = String(name || '').trim().slice(0, 80);
  if (!cleanName) throw new Error('Enter the person\'s name.');
  const cleanRole = String(role || '').trim();
  if (!PIN_ROLES.includes(cleanRole)) throw new Error('Pick a valid staff role.');

  if (!Array.isArray(meet.staffPins)) meet.staffPins = [];
  const id = `mp_${crypto.randomBytes(6).toString('hex')}`;
  const pin = generatePin();
  const row = {
    id,
    name: cleanName,
    role: cleanRole,
    pinHash: hashPin(pin, id),
    createdAt: nowIso(),
    createdByUserId: String(createdByUserId || ''),
    expiresAt: defaultExpiresAt(meet),
    lastUsedAt: '',
    revokedAt: '',
  };
  meet.staffPins.push(row);
  meet.updatedAt = nowIso();
  return { row, pin };
}

/// Find the active row this PIN belongs to, or null. Compares against every
/// active row (each with its own salt) in constant time per row.
function verifyStaffPin(meet, pin, at = new Date()) {
  const normalized = normalizePin(pin);
  if (!isValidPin(normalized)) return null;
  for (const row of staffPinRows(meet)) {
    if (!isActive(row, at)) continue;
    let candidate;
    try { candidate = hashPin(normalized, row.id); } catch (_) { continue; }
    if (timingSafeEqualHex(candidate, row.pinHash)) return row;
  }
  return null;
}

function revokeStaffPin(meet, rowId) {
  const row = staffPinRows(meet).find(r => String(r.id) === String(rowId));
  if (!row) throw new Error('That PIN was not found.');
  row.revokedAt = nowIso();
  row.pinHash = '';           // destroy the secret; keep the name for the audit trail
  meet.updatedAt = nowIso();
  return row;
}

/// Regenerate a PIN for an existing person (same row, new code).
function regenerateStaffPin(meet, rowId) {
  const row = staffPinRows(meet).find(r => String(r.id) === String(rowId));
  if (!row) throw new Error('That PIN was not found.');
  const pin = generatePin();
  row.pinHash = hashPin(pin, row.id);
  row.revokedAt = '';
  row.expiresAt = defaultExpiresAt(meet);
  meet.updatedAt = nowIso();
  return { row, pin };
}

/// Safe view for listing — never exposes the hash.
function staffPinsJson(meet, at = new Date()) {
  return staffPinRows(meet).map(row => ({
    id: String(row.id),
    name: String(row.name || ''),
    role: String(row.role || ''),
    roleLabel: PIN_ROLE_LABELS[row.role] || 'Staff',
    createdAt: String(row.createdAt || ''),
    expiresAt: String(row.expiresAt || ''),
    lastUsedAt: String(row.lastUsedAt || ''),
    revoked: !!row.revokedAt,
    active: isActive(row, at),
  }));
}

/// The identity a verified PIN produces. Deliberately carries NO platform roles
/// — utils/auth.js grants this user access to ONE meet based on meetPinRole,
/// and nothing else anywhere in the system.
function pinUserFor(meet, row) {
  return {
    id: `meetpin:${row.id}`,
    username: `meetpin:${row.id}`,
    displayName: String(row.name || 'Meet Staff'),
    name: String(row.name || 'Meet Staff'),
    email: '',
    roles: [],
    meetPinMeetId: String(meet.id),
    meetPinRole: String(row.role),
    meetPinRowId: String(row.id),
  };
}

function isMeetPinUser(user) {
  return !!(user && user.meetPinMeetId && user.meetPinRole);
}

module.exports = {
  PIN_ROLES, PIN_ROLE_LABELS,
  createStaffPin, verifyStaffPin, revokeStaffPin, regenerateStaffPin,
  staffPinsJson, pinUserFor, isMeetPinUser, isActive, defaultExpiresAt,
};
