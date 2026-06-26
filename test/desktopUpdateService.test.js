'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeChannel, updateChannel, FOUR_HOURS_MS } = require('../desktop/updateService');

test('normalizes supported update channels', () => {
  assert.equal(normalizeChannel(' alpha '), 'alpha');
  assert.equal(normalizeChannel('BETA'), 'beta');
  assert.equal(normalizeChannel('stable'), 'stable');
  assert.equal(normalizeChannel('nightly'), '');
});

test('detects update channel from app version', () => {
  const original = process.env.SSM_UPDATE_CHANNEL;
  delete process.env.SSM_UPDATE_CHANNEL;
  delete process.env.UPDATE_CHANNEL;

  assert.equal(updateChannel({ getVersion: () => '0.1.0-alpha.1' }), 'alpha');
  assert.equal(updateChannel({ getVersion: () => '0.1.0-beta.2' }), 'beta');
  assert.equal(updateChannel({ getVersion: () => '1.0.0' }), 'stable');

  if (original === undefined) delete process.env.SSM_UPDATE_CHANNEL;
  else process.env.SSM_UPDATE_CHANNEL = original;
});

test('uses explicit update channel environment override', () => {
  const original = process.env.SSM_UPDATE_CHANNEL;
  process.env.SSM_UPDATE_CHANNEL = 'beta';

  assert.equal(updateChannel({ getVersion: () => '1.0.0-alpha.1' }), 'beta');

  if (original === undefined) delete process.env.SSM_UPDATE_CHANNEL;
  else process.env.SSM_UPDATE_CHANNEL = original;
});

test('scheduled update check interval is 4 hours', () => {
  assert.equal(FOUR_HOURS_MS, 4 * 60 * 60 * 1000);
});
