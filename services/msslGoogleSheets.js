const crypto = require('crypto');

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function config(env = process.env) {
  return {
    clientId: String(env.MSSL_SHEETS_CLIENT_ID || '').trim(),
    clientSecret: String(env.MSSL_SHEETS_CLIENT_SECRET || '').trim(),
    encryptionKey: String(env.MSSL_SHEETS_TOKEN_ENCRYPTION_KEY || '').trim(),
    spreadsheetId: String(env.MSSL_SHEETS_SPREADSHEET_ID || '').trim(),
    redirectUri: String(env.MSSL_SHEETS_REDIRECT_URI || '').trim(),
  };
}

function isConfigured(env = process.env) {
  const c = config(env);
  return !!(c.clientId && c.clientSecret && c.encryptionKey && c.spreadsheetId && c.redirectUri);
}

function keyBytes(secret) {
  if (!secret) throw new Error('Google Sheets token encryption is not configured.');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptToken(token, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

function decryptToken(value, secret) {
  const [iv, tag, ciphertext] = String(value || '').split('.').map(part => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !ciphertext) throw new Error('Stored Google authorization is invalid. Reconnect the account.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function signState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', keyBytes(secret)).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyState(state, secret, now = Date.now()) {
  const [body, supplied] = String(state || '').split('.');
  if (!body || !supplied) throw new Error('Google authorization state is missing. Start the connection again.');
  const expected = crypto.createHmac('sha256', keyBytes(secret)).update(body).digest();
  const actual = Buffer.from(supplied, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error('Google authorization state did not validate. Start the connection again.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.issuedAt || now - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > now + 60 * 1000) throw new Error('Google authorization expired. Start the connection again.');
  return payload;
}

function authorizationUrl({ clientId, redirectUri, state }) {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SHEETS_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${query}`;
}

async function tokenRequest(body, c, fetchImpl = fetch) {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: c.clientId, client_secret: c.clientSecret }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Google token request failed.');
  return data;
}

async function exchangeCode(code, c, fetchImpl = fetch) {
  return tokenRequest({ code, redirect_uri: c.redirectUri, grant_type: 'authorization_code' }, c, fetchImpl);
}

async function accessToken(refreshToken, c, fetchImpl = fetch) {
  const data = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }, c, fetchImpl);
  return data.access_token;
}

async function googleGet(url, bearer, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${bearer}` } });
  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message || 'Google Sheets request failed.';
    if (response.status === 401 || response.status === 403) throw new Error(`${message} Check that this Google account can view the MSSL workbook and that the Sheets API is enabled.`);
    throw new Error(message);
  }
  return data;
}

async function listTabs(spreadsheetId, bearer, fetchImpl = fetch) {
  const url = `${API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent('properties(title),sheets.properties(sheetId,title,index)')}`;
  const data = await googleGet(url, bearer, fetchImpl);
  return (data.sheets || []).map(sheet => ({ id: sheet.properties.sheetId, title: sheet.properties.title, index: sheet.properties.index }));
}

function cellText(value) {
  return String(value == null ? '' : value).replace(/[\t\r\n]+/g, ' ').trim();
}

async function fetchTab(spreadsheetId, tabTitle, bearer, fetchImpl = fetch) {
  const range = `'${String(tabTitle).replace(/'/g, "''")}'!A1:AZ1500`;
  const url = `${API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const data = await googleGet(url, bearer, fetchImpl);
  if (!Array.isArray(data.values)) return '';
  return data.values.map(row => row.map(cellText).join('\t')).join('\n');
}

module.exports = {
  SHEETS_SCOPE, config, isConfigured, encryptToken, decryptToken, signState, verifyState,
  authorizationUrl, exchangeCode, accessToken, listTabs, fetchTab,
};
