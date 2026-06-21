const crypto = require('crypto');

const DEFAULT_PRODUCT = 'ssm_desktop';
const DEFAULT_MAX_ACTIVATIONS = 2;
const ACTIVE_STATUS = 'active';
const INACTIVE_STATUS = 'inactive';
const REVOKED_STATUS = 'revoked';

function nowIso() {
  return new Date().toISOString();
}

function normalizeLicenseKey(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatLicenseKey(raw) {
  const clean = normalizeLicenseKey(raw);
  const body = clean.startsWith('SSMD') ? clean.slice(4) : clean;
  return ['SSMD', body.slice(0, 4), body.slice(4, 8), body.slice(8, 12), body.slice(12, 16)]
    .filter(Boolean)
    .join('-');
}

function maskLicenseKey(value) {
  const clean = normalizeLicenseKey(value);
  if (!clean) return '';
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-••••-${clean.slice(-4)}`;
}

function safeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function safeProduct(value) {
  return String(value || DEFAULT_PRODUCT).trim().toLowerCase().replace(/[\s-]+/g, '_') || DEFAULT_PRODUCT;
}

function ensureLicenseStore(db) {
  if (!db || typeof db !== 'object') throw new Error('A database object is required.');
  if (!Array.isArray(db.desktopLicenses)) db.desktopLicenses = [];
  return db.desktopLicenses;
}

function generateLicenseKey() {
  return formatLicenseKey(crypto.randomBytes(10).toString('hex').toUpperCase());
}

function safeLicenseView(license) {
  if (!license) return null;
  return {
    id: license.id,
    license_key_masked: maskLicenseKey(license.license_key),
    ssl_skater_id: license.ssl_skater_id || '',
    email: license.email || '',
    product: license.product || DEFAULT_PRODUCT,
    status: license.status || INACTIVE_STATUS,
    purchase_source: license.purchase_source || '',
    purchase_date: license.purchase_date || '',
    activation_count: Number(license.activation_count || 0),
    max_activations: Number(license.max_activations || 0),
    last_activation_at: license.last_activation_at || '',
    last_validation_at: license.last_validation_at || '',
    expires_at: license.expires_at || '',
    metadata: license.metadata || {},
    created_at: license.created_at || '',
    updated_at: license.updated_at || '',
  };
}

function getLicenseByKey(db, licenseKey) {
  const key = normalizeLicenseKey(licenseKey);
  return ensureLicenseStore(db).find(row => normalizeLicenseKey(row.license_key) === key) || null;
}

function getLicenseBySslId(db, sslSkaterId, product = DEFAULT_PRODUCT) {
  const sslId = String(sslSkaterId || '').trim().toUpperCase();
  const normalizedProduct = safeProduct(product);
  if (!sslId) return null;
  return ensureLicenseStore(db).find(row =>
    String(row.ssl_skater_id || '').trim().toUpperCase() === sslId &&
    safeProduct(row.product) === normalizedProduct
  ) || null;
}

function findDuplicateLicense(store, { sslSkaterId, email, product }) {
  const sslId = String(sslSkaterId || '').trim().toUpperCase();
  const cleanEmail = safeEmail(email);
  const normalizedProduct = safeProduct(product);
  return store.find(row => {
    if (safeProduct(row.product) !== normalizedProduct) return false;
    if (String(row.status || '').toLowerCase() === REVOKED_STATUS) return false;
    const rowSslId = String(row.ssl_skater_id || '').trim().toUpperCase();
    const rowEmail = safeEmail(row.email);
    return !!((sslId && rowSslId === sslId) || (cleanEmail && rowEmail === cleanEmail));
  }) || null;
}

function createLicense(db, {
  sslSkaterId,
  email,
  product = DEFAULT_PRODUCT,
  purchaseSource = 'manual',
  purchaseDate,
  maxActivations = DEFAULT_MAX_ACTIVATIONS,
  stripeCustomerId = '',
  stripeCheckoutSessionId = '',
  stripePaymentIntentId = '',
  expiresAt = '',
  metadata = {},
} = {}) {
  const store = ensureLicenseStore(db);
  const normalizedProduct = safeProduct(product);
  const duplicate = findDuplicateLicense(store, { sslSkaterId, email, product: normalizedProduct });
  if (duplicate) {
    const err = new Error('A license already exists for this user and product.');
    err.code = 'duplicate_license';
    err.statusCode = 409;
    throw err;
  }

  let licenseKey = generateLicenseKey();
  while (getLicenseByKey(db, licenseKey)) licenseKey = generateLicenseKey();

  const timestamp = nowIso();
  const license = {
    id: 'lic_' + crypto.randomBytes(8).toString('hex'),
    license_key: licenseKey,
    ssl_skater_id: String(sslSkaterId || '').trim().toUpperCase(),
    email: safeEmail(email),
    product: normalizedProduct,
    status: ACTIVE_STATUS,
    purchase_source: String(purchaseSource || 'manual').trim(),
    purchase_date: purchaseDate || timestamp,
    activation_count: 0,
    max_activations: Math.max(1, Number(maxActivations) || DEFAULT_MAX_ACTIVATIONS),
    last_activation_at: '',
    last_validation_at: '',
    expires_at: expiresAt || '',
    stripe_customer_id: String(stripeCustomerId || '').trim(),
    stripe_checkout_session_id: String(stripeCheckoutSessionId || '').trim(),
    stripe_payment_intent_id: String(stripePaymentIntentId || '').trim(),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    activations: [],
    created_at: timestamp,
    updated_at: timestamp,
  };

  store.push(license);
  return license;
}

function licenseExpired(license, at = new Date()) {
  if (!license?.expires_at) return false;
  const expires = new Date(license.expires_at).getTime();
  return Number.isFinite(expires) && expires <= at.getTime();
}

function validateLicense(db, { licenseKey, product = DEFAULT_PRODUCT } = {}) {
  const license = getLicenseByKey(db, licenseKey);
  if (!license) return { valid: false, reason: 'invalid_key' };

  if (safeProduct(license.product) !== safeProduct(product)) {
    return { valid: false, reason: 'wrong_product', license: safeLicenseView(license) };
  }

  const status = String(license.status || '').toLowerCase();
  if (status !== ACTIVE_STATUS) {
    return { valid: false, reason: status === REVOKED_STATUS ? 'revoked' : 'inactive', license: safeLicenseView(license) };
  }

  if (licenseExpired(license)) {
    return { valid: false, reason: 'expired', license: safeLicenseView(license) };
  }

  license.last_validation_at = nowIso();
  license.updated_at = license.last_validation_at;
  return {
    valid: true,
    reason: 'valid',
    license: safeLicenseView(license),
    offline: {
      cache_allowed: true,
      grace_period_days: 7,
    },
  };
}

function recordActivation(db, {
  licenseKey,
  product = DEFAULT_PRODUCT,
  deviceId = '',
  deviceName = '',
  appVersion = '',
  platform = '',
} = {}) {
  const validation = validateLicense(db, { licenseKey, product });
  if (!validation.valid) return { activated: false, ...validation };

  const license = getLicenseByKey(db, licenseKey);
  if (!Array.isArray(license.activations)) license.activations = [];
  const cleanDeviceId = String(deviceId || '').trim();
  const existing = cleanDeviceId
    ? license.activations.find(row => String(row.device_id || '') === cleanDeviceId && row.active !== false)
    : null;

  if (!existing && Number(license.activation_count || 0) >= Number(license.max_activations || DEFAULT_MAX_ACTIVATIONS)) {
    return { activated: false, valid: false, reason: 'activation_limit_reached', license: safeLicenseView(license) };
  }

  const timestamp = nowIso();
  if (existing) {
    existing.last_seen_at = timestamp;
    existing.device_name = String(deviceName || existing.device_name || '').trim();
    existing.app_version = String(appVersion || existing.app_version || '').trim();
    existing.platform = String(platform || existing.platform || '').trim();
  } else {
    license.activations.push({
      id: 'act_' + crypto.randomBytes(8).toString('hex'),
      device_id: cleanDeviceId || 'device_' + crypto.randomBytes(8).toString('hex'),
      device_name: String(deviceName || '').trim(),
      app_version: String(appVersion || '').trim(),
      platform: String(platform || '').trim(),
      active: true,
      activated_at: timestamp,
      last_seen_at: timestamp,
    });
    license.activation_count = license.activations.filter(row => row.active !== false).length;
  }

  license.last_activation_at = timestamp;
  license.last_validation_at = timestamp;
  license.updated_at = timestamp;
  return { activated: true, valid: true, reason: 'activated', license: safeLicenseView(license) };
}

function deactivateLicense(db, licenseKey, { status = INACTIVE_STATUS } = {}) {
  const license = getLicenseByKey(db, licenseKey);
  if (!license) return { deactivated: false, reason: 'invalid_key' };
  license.status = status === REVOKED_STATUS ? REVOKED_STATUS : INACTIVE_STATUS;
  license.updated_at = nowIso();
  return { deactivated: true, reason: 'deactivated', license: safeLicenseView(license) };
}

module.exports = {
  DEFAULT_PRODUCT,
  DEFAULT_MAX_ACTIVATIONS,
  ACTIVE_STATUS,
  INACTIVE_STATUS,
  REVOKED_STATUS,
  normalizeLicenseKey,
  formatLicenseKey,
  maskLicenseKey,
  safeLicenseView,
  ensureLicenseStore,
  generateLicenseKey,
  createLicense,
  getLicenseByKey,
  getLicenseBySslId,
  validateLicense,
  recordActivation,
  deactivateLicense,
};
