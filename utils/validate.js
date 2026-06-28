'use strict';

// Lightweight, dependency-free form validation helpers for route handlers.
// These return a list of human-readable problems; they never throw.

function missingRequiredFields(body, fields) {
  const problems = [];
  for (const field of fields) {
    const value = body && body[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      problems.push(`${field} is required.`);
    }
  }
  return problems;
}

function invalidNumericFields(body, fields) {
  const problems = [];
  for (const field of fields) {
    const raw = body && body[field];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    if (!Number.isFinite(Number(raw))) {
      problems.push(`${field} must be a number.`);
    }
  }
  return problems;
}

const VALID_GENDERS = ['male', 'female'];
const VALID_LANE_STATUSES = ['', 'DNS', 'DQ', 'Scratch'];

function invalidGender(value) {
  return value !== undefined && value !== null && String(value).trim() !== '' && !VALID_GENDERS.includes(String(value).trim().toLowerCase());
}

function invalidLaneStatus(value) {
  return value !== undefined && value !== null && !VALID_LANE_STATUSES.includes(String(value).trim());
}

function invalidBirthdate(value) {
  const str = String(value || '').trim();
  if (!str) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return true;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) || date.getTime() > Date.now();
}

// Returns true (and sends a response) if invalid; caller should `if (sendIfInvalid(...)) return;`
function sendIfInvalid(req, res, problems, redirectTo) {
  if (!problems.length) return false;
  const message = problems.join(' ');
  const wantsJson = String(req.get('accept') || '').includes('application/json') || req.is('application/json');
  if (wantsJson) {
    res.status(400).json({ ok: false, error: message });
  } else if (redirectTo) {
    res.redirect(`${redirectTo}${redirectTo.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
  } else {
    res.status(400).send(message);
  }
  return true;
}

module.exports = {
  missingRequiredFields,
  invalidNumericFields,
  invalidGender,
  invalidLaneStatus,
  invalidBirthdate,
  sendIfInvalid,
};
