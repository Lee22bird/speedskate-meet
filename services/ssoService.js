const crypto = require('crypto');
const { nowIso } = require('../utils/date');
const { hasRole } = require('../utils/auth');

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const ALLOWED_SSM_ROLES = new Set(['super_admin', 'meet_director', 'league_director', 'judge', 'announcer', 'coach']);

function signingSecret() {
  const secret = String(process.env.SSO_SECRET || process.env.SSM_SSO_SECRET || process.env.SSO_SHARED_SECRET || '').trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') throw new Error('SSO_SECRET is required in production.');
  return 'ssl-ssm-local-dev-secret';
}

function base64UrlDecode(value) {
  let normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function signBody(body) {
  return crypto
    .createHmac('sha256', signingSecret())
    .update(body)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function verifySslSsoToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid SSO token format.');

  const [body, signature] = parts;
  const expected = signBody(body);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('Invalid SSO signature.');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch (err) {
    throw new Error('Invalid SSO payload.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== 'speedskateleague.com') throw new Error('Invalid SSO issuer.');
  if (payload.aud !== 'speedskatemeet.com') throw new Error('Invalid SSO audience.');
  if (!payload.exp || payload.exp < now) throw new Error('SSO token expired.');
  if (payload.iat && payload.iat > now + 60) throw new Error('SSO token issued in the future.');
  if (!payload.user_id && !payload.sub) throw new Error('SSO token missing user identity.');

  return payload;
}

function ssmAllowedRolesFromSsl(payload) {
  const roles = new Set();
  const add = value => {
    const role = String(value || '').trim().toLowerCase();
    if (!role) return;
    if (role === 'admin') roles.add('super_admin');
    else if (role === 'tabulator') roles.add('judge');
    else if (ALLOWED_SSM_ROLES.has(role)) roles.add(role);
  };

  if (Array.isArray(payload?.roles)) payload.roles.forEach(add);
  else add(payload?.role);

  return Array.from(roles);
}

function nextUserId(db) {
  return (db.users || []).reduce((max, user) => Math.max(max, Number(user.id) || 0), 0) + 1;
}

function findMirroredUser(db, mirror) {
  const email = String(mirror.email || '').trim().toLowerCase();
  const username = String(mirror.username || '').trim().toLowerCase();
  return (db.users || []).find(u => String(u.ssl_user_id || u.sslUserId || '').trim() === mirror.ssl_user_id)
    || (db.users || []).find(u => email && String(u.email || '').trim().toLowerCase() === email)
    || (db.users || []).find(u => username && String(u.username || '').trim().toLowerCase() === username)
    || null;
}

function mirrorSslUser(db, payload) {
  if (!Array.isArray(db.users)) db.users = [];

  const sslUserId = String(payload.user_id || payload.sub || '').trim();
  const sslSkaterId = String(payload.ssl_skater_id || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const name = String(payload.full_name || payload.name || email || 'SSL User').trim();
  const roles = ssmAllowedRolesFromSsl(payload);
  const avatarUrl = String(payload.avatar_url || '').trim();
  const username = email || `ssl_${sslUserId.slice(0, 12)}`;
  const mirror = {
    ssl_user_id: sslUserId,
    ssl_skater_id: sslSkaterId,
    name,
    roles,
    avatar_url: avatarUrl,
    email,
    username,
  };

  if (!sslUserId) throw new Error('SSO token missing user identity.');

  let user = findMirroredUser(db, mirror);
  if (!user) {
    user = {
      id: nextUserId(db),
      username,
      password: crypto.randomBytes(18).toString('hex'),
      email,
      displayName: name,
      roles,
      team: String(payload.team || 'Independent'),
      league: String(payload.league || ''),
      active: true,
      authProvider: 'ssl',
      createdAt: nowIso(),
    };
    db.users.push(user);
  }

  user.username = user.username || username;
  user.email = email || user.email || '';
  user.displayName = name || user.displayName || email || 'SSL User';
  user.name = name || user.name || user.displayName;
  user.roles = roles;
  user.team = String(payload.team || user.team || 'Independent');
  user.league = String(payload.league || user.league || '');
  user.active = true;
  user.authProvider = 'ssl';

  user.ssl_user_id = sslUserId;
  user.ssl_skater_id = sslSkaterId;
  user.avatar_url = avatarUrl;

  // Keep legacy camelCase fields alive for existing SSM code and data.
  user.sslUserId = sslUserId;
  user.sslSkaterId = sslSkaterId;
  user.avatarUrl = avatarUrl;
  user.updatedAt = nowIso();

  return user;
}

function createSsmSessionForUser(db, user, ttlMs = DEFAULT_SESSION_TTL_MS) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions = (db.sessions || []).filter(s => Number(s.userId) !== Number(user.id));
  db.sessions.push({
    token,
    userId: user.id,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  });
  return token;
}

function ssmRedirectForUser(user) {
  if (!Array.isArray(user?.roles) || user.roles.length === 0) return '/account/pending';
  if (hasRole(user, 'coach') && !hasRole(user, 'meet_director') && !hasRole(user, 'super_admin')) return '/portal/coach';
  if ((hasRole(user, 'judge') || hasRole(user, 'announcer')) && !hasRole(user, 'meet_director') && !hasRole(user, 'super_admin')) return '/portal/meet-picker';
  return '/portal';
}

function configuredSslBaseUrl() {
  return String(
    process.env.SSL_BASE_URL ||
    process.env.SPEEDSKATELEAGUE_BASE_URL ||
    process.env.PUBLIC_SSL_BASE_URL ||
    'https://speedskateleague.com'
  ).trim().replace(/\/+$/, '');
}

function configuredSslApiKey() {
  return String(
    process.env.SSL_SHARED_API_KEY ||
    process.env.SSL_SSM_API_KEY ||
    process.env.SSM_SSL_API_KEY ||
    process.env.SSM_PACKAGE_API_KEY ||
    process.env.SSM_RESULTS_API_KEY ||
    process.env.SSO_SHARED_SECRET ||
    'ssl-ssm-local-dev-package-key'
  ).trim();
}

// Lets someone log into SSM (web, desktop, or the iOS app) with their SSL
// email/password directly, instead of needing a separate SSM account or a
// browser-based "Sign in with SSL" redirect. SSL is the only place that ever
// sees the real password — this just asks it to verify the pair and hands
// back a profile shaped exactly like the existing SSO token payload, so it
// can be passed straight into mirrorSslUser(). Returns null (never throws)
// on any failure — wrong password, unknown email, or SSL being unreachable —
// so callers can cleanly fall back to a local SSM account check.
async function verifySslCredentials(email, password) {
  if (!email || !password) return null;
  if (typeof fetch !== 'function') return null;
  const base = configuredSslBaseUrl();
  if (!base) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${base}/api/ssm/verify-credentials`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-ssl-api-key': configuredSslApiKey(),
      },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    if (!body?.ok || !body.profile?.user_id) return null;
    return body.profile;
  } catch (err) {
    // Network error, timeout, or SSL is down/unreachable (e.g. desktop app
    // offline at a meet) — treat exactly like "not an SSL account" so the
    // caller falls back to the local SSM password check.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function ssmUserMirrorSnapshot(user) {
  const roles = Array.isArray(user?.roles) ? user.roles.map(role => String(role || '').trim()).filter(Boolean) : [];
  const requestedRole = String(user?.requestedRole || user?.pending_role || user?.requested_role || '').trim();
  const sslUserId = String(user?.ssl_user_id || user?.sslUserId || '').trim();
  const sslSkaterId = String(user?.ssl_skater_id || user?.sslSkaterId || '').trim();
  return {
    ssm_user_id: String(user?.id || ''),
    ssl_user_id: sslUserId || null,
    ssl_skater_id: sslSkaterId || null,
    name: String(user?.name || user?.displayName || user?.username || user?.email || 'SSM User'),
    email: String(user?.email || '').trim().toLowerCase(),
    team: String(user?.team || ''),
    league: String(user?.league || ''),
    role: roles[0] || requestedRole || '',
    roles,
    requested_role: requestedRole,
    avatar_url: String(user?.avatar_url || user?.avatarUrl || ''),
    active: user?.active !== false,
    disabled: user?.active === false || !!user?.disabledAt,
    migrated: !!user?.migratedAt,
    status: user?.disabledAt ? 'disabled' : (user?.migratedAt ? 'migrated' : 'active'),
  };
}

async function postSsmUserMirrorToSsl(user) {
  const base = configuredSslBaseUrl();
  if (!base) throw new Error('SSL_BASE_URL is not configured.');
  if (typeof fetch !== 'function') throw new Error('This Node runtime does not support fetch. Upgrade Node or add a fetch polyfill.');
  const apiKey = configuredSslApiKey();

  const response = await fetch(`${base}/api/ssm/user-mirror`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-ssm-api-key': apiKey,
      'x-ssl-api-key': apiKey,
    },
    body: JSON.stringify({ user: ssmUserMirrorSnapshot(user) }),
  });

  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text }; }
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || body.message || `SSL user mirror sync failed with HTTP ${response.status}`);
  }
  return body;
}

module.exports = {
  DEFAULT_SESSION_TTL_MS,
  verifySslSsoToken,
  ssmAllowedRolesFromSsl,
  nextUserId,
  mirrorSslUser,
  verifySslCredentials,
  createSsmSessionForUser,
  ssmRedirectForUser,
  configuredSslBaseUrl,
  configuredSslApiKey,
  ssmUserMirrorSnapshot,
  postSsmUserMirrorToSsl,
};
