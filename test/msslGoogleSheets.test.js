const test = require('node:test');
const assert = require('node:assert/strict');
const sheets = require('../services/msslGoogleSheets');

test('refresh tokens are encrypted and authenticated', () => {
  const encrypted = sheets.encryptToken('refresh-secret', 'a'.repeat(64));
  assert.notEqual(encrypted, 'refresh-secret');
  assert.equal(sheets.decryptToken(encrypted, 'a'.repeat(64)), 'refresh-secret');
  assert.throws(() => sheets.decryptToken(encrypted, 'b'.repeat(64)));
});

test('OAuth state is signed, time-limited, and rejects tampering', () => {
  const secret = 'c'.repeat(64);
  const now = 1_800_000_000_000;
  const state = sheets.signState({ meetId: '12', userId: '7', issuedAt: now }, secret);
  assert.deepEqual(sheets.verifyState(state, secret, now), { meetId: '12', userId: '7', issuedAt: now });
  assert.throws(() => sheets.verifyState(`${state}x`, secret, now));
  assert.throws(() => sheets.verifyState(state, secret, now + 11 * 60 * 1000), /expired/);
});

test('authorization asks only for read-only Sheets access', () => {
  const url = new URL(sheets.authorizationUrl({ clientId: 'client', redirectUri: 'https://ssm.test/callback', state: 'signed' }));
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/spreadsheets.readonly');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://ssm.test/callback');
});

test('Google tab fetch encodes tab names and flattens formatted values', async () => {
  let requested = '';
  const fetchImpl = async url => {
    requested = String(url);
    return { ok: true, json: async () => ({ values: [['Helmet #', 'NAME'], ['7', 'Skater\nOne']] }) };
  };
  const text = await sheets.fetchTab('book/id', "Team O'Brien", 'access-token', fetchImpl);
  assert.match(requested, /Team%20O''Brien/);
  assert.equal(text, 'Helmet #\tNAME\n7\tSkater One');
});
