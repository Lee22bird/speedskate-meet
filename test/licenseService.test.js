const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLicense,
  getLicenseByKey,
  getLicenseBySslId,
  validateLicense,
  recordActivation,
  deactivateLicense,
  maskLicenseKey,
} = require('../services/licenseService');

function emptyDb() {
  return { desktopLicenses: [] };
}

test('creates a desktop license with future Stripe fields', () => {
  const db = emptyDb();
  const license = createLicense(db, {
    sslSkaterId: 'ssl-123',
    email: 'Skater@Example.com',
    product: 'ssm_desktop',
    stripeCustomerId: 'cus_123',
    stripeCheckoutSessionId: 'cs_123',
    stripePaymentIntentId: 'pi_123',
  });

  assert.equal(db.desktopLicenses.length, 1);
  assert.equal(license.ssl_skater_id, 'SSL-123');
  assert.equal(license.email, 'skater@example.com');
  assert.equal(license.status, 'active');
  assert.equal(license.stripe_customer_id, 'cus_123');
  assert.match(license.license_key, /^SSMD-/);
});

test('prevents duplicate active licenses for same user and product', () => {
  const db = emptyDb();
  createLicense(db, { sslSkaterId: 'SSL-123', email: 'one@example.com', product: 'ssm_desktop' });

  assert.throws(
    () => createLicense(db, { sslSkaterId: 'SSL-123', email: 'two@example.com', product: 'ssm_desktop' }),
    /already exists/
  );
});

test('looks up licenses by key and SSL ID', () => {
  const db = emptyDb();
  const license = createLicense(db, { sslSkaterId: 'SSL-456', email: 'lookup@example.com' });

  assert.equal(getLicenseByKey(db, license.license_key).id, license.id);
  assert.equal(getLicenseBySslId(db, 'ssl-456').id, license.id);
});

test('validates active licenses and rejects invalid keys', () => {
  const db = emptyDb();
  const license = createLicense(db, { sslSkaterId: 'SSL-789', email: 'valid@example.com' });
  const valid = validateLicense(db, { licenseKey: license.license_key });
  const invalid = validateLicense(db, { licenseKey: 'SSMD-NOPE-NOPE-NOPE-NOPE' });

  assert.equal(valid.valid, true);
  assert.equal(valid.reason, 'valid');
  assert.equal(valid.license.license_key_masked, maskLicenseKey(license.license_key));
  assert.equal(valid.license.license_key, undefined);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.reason, 'invalid_key');
});

test('records activation and allows repeated activation from same device', () => {
  const db = emptyDb();
  const license = createLicense(db, { sslSkaterId: 'SSL-111', email: 'activate@example.com', maxActivations: 1 });

  const first = recordActivation(db, {
    licenseKey: license.license_key,
    deviceId: 'laptop-1',
    deviceName: 'Race laptop',
    appVersion: '0.1.0',
    platform: 'darwin',
  });
  const second = recordActivation(db, {
    licenseKey: license.license_key,
    deviceId: 'laptop-1',
    deviceName: 'Race laptop',
  });

  assert.equal(first.activated, true);
  assert.equal(second.activated, true);
  assert.equal(license.activation_count, 1);
  assert.equal(license.activations.length, 1);
});

test('rejects activation over the activation limit', () => {
  const db = emptyDb();
  const license = createLicense(db, { sslSkaterId: 'SSL-222', email: 'limit@example.com', maxActivations: 1 });

  assert.equal(recordActivation(db, { licenseKey: license.license_key, deviceId: 'device-1' }).activated, true);
  const blocked = recordActivation(db, { licenseKey: license.license_key, deviceId: 'device-2' });

  assert.equal(blocked.activated, false);
  assert.equal(blocked.reason, 'activation_limit_reached');
});

test('deactivates a license and validation rejects it', () => {
  const db = emptyDb();
  const license = createLicense(db, { sslSkaterId: 'SSL-333', email: 'inactive@example.com' });

  const deactivated = deactivateLicense(db, license.license_key);
  const validation = validateLicense(db, { licenseKey: license.license_key });

  assert.equal(deactivated.deactivated, true);
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'inactive');
});
