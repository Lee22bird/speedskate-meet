const express = require('express');
const { canManageMeetSettings } = require('../utils/auth');
const { getMeetOr404 } = require('../services/meetHelpers');
const {
  STAFF_ROLE_KEYS,
  upsertMeetStaffAssignment,
  clearMeetStaffAssignment,
} = require('../services/staffAssignments');

function configuredSslBaseUrl() {
  return String(
    process.env.SSL_BASE_URL ||
    process.env.SPEEDSKATELEAGUE_BASE_URL ||
    process.env.PUBLIC_SSL_BASE_URL ||
    'https://speedskateleague.com'
  ).trim().replace(/\/+$/, '');
}

function configuredSslStaffApiKey() {
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

async function searchSslStaff({ q, role }) {
  const base = configuredSslBaseUrl();
  if (!base) throw new Error('SSL_BASE_URL is not configured.');
  if (typeof fetch !== 'function') throw new Error('This Node runtime does not support SSL staff search.');
  const url = new URL('/api/ssm/staff-search', base);
  url.searchParams.set('q', q);
  url.searchParams.set('role', role);
  const response = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
      'x-ssm-api-key': configuredSslStaffApiKey(),
    },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text }; }
  if (!response.ok || body.ok === false) throw new Error(body.error || body.message || `SSL staff search failed with HTTP ${response.status}`);
  return Array.isArray(body.people) ? body.people : [];
}

function normalizePostedPerson(body = {}) {
  return {
    staff_ssl_id: String(body.staff_ssl_id || '').trim(),
    staff_user_id: String(body.staff_user_id || '').trim(),
    staff_name: String(body.staff_name || '').trim(),
    staff_avatar_url: String(body.staff_avatar_url || '').trim(),
  };
}

function personMatchesPosted(candidate, posted) {
  const postedSslId = String(posted.staff_ssl_id || '').trim();
  const postedUserId = String(posted.staff_user_id || '').trim();
  return (
    (postedSslId && String(candidate.staff_ssl_id || '').trim() === postedSslId) ||
    (postedUserId && String(candidate.staff_user_id || '').trim() === postedUserId)
  );
}

module.exports = function createStaffRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, saveDb } = deps;

  router.get('/api/meet/:meetId/staff-search', requireRole('meet_director'), async (req, res) => {
    try {
      const meet = getMeetOr404(req.db, req.params.meetId);
      if (!meet) return res.status(404).json({ ok: false, error: 'Meet not found.' });
      if (!canManageMeetSettings(req.user, meet)) return res.status(403).json({ ok: false, error: 'Only the meet owner or Super Admin can change staff assignments.' });
      const role = String(req.query.role || '').trim();
      const q = String(req.query.q || '').trim();
      if (!STAFF_ROLE_KEYS.has(role)) return res.status(400).json({ ok: false, error: 'Unsupported staff role.' });
      if (q.length < 2) return res.json({ ok: true, people: [] });
      const people = await searchSslStaff({ q, role });
      return res.json({ ok: true, people });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ ok: false, error: err.message });
    }
  });

  router.post('/portal/meet/:meetId/staff/assign', requireRole('meet_director'), async (req, res) => {
    const meetId = req.params.meetId;
    try {
      const meet = getMeetOr404(req.db, meetId);
      if (!meet) throw new Error('Meet not found.');
      if (!canManageMeetSettings(req.user, meet)) throw new Error('Only the meet owner or Super Admin can change staff assignments.');
      const role = String(req.body.staff_role || '').trim();
      if (!STAFF_ROLE_KEYS.has(role)) throw new Error('Unsupported staff role.');

      const posted = normalizePostedPerson(req.body);
      const candidates = await searchSslStaff({ q: posted.staff_ssl_id || posted.staff_name || posted.staff_user_id, role });
      const verified = candidates.find(candidate => personMatchesPosted(candidate, posted));
      if (!verified) throw new Error('That SSL profile could not be verified for this staff role.');

      upsertMeetStaffAssignment(meet, role, verified, req.user.id);
      saveDb(req.db);
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?saved=1`);
    } catch (err) {
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?error=${encodeURIComponent(err.message)}`);
    }
  });

  router.post('/portal/meet/:meetId/staff/remove', requireRole('meet_director'), (req, res) => {
    const meetId = req.params.meetId;
    try {
      const meet = getMeetOr404(req.db, meetId);
      if (!meet) throw new Error('Meet not found.');
      if (!canManageMeetSettings(req.user, meet)) throw new Error('Only the meet owner or Super Admin can change staff assignments.');
      const role = String(req.body.staff_role || '').trim();
      clearMeetStaffAssignment(meet, role);
      saveDb(req.db);
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?saved=1`);
    } catch (err) {
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?error=${encodeURIComponent(err.message)}`);
    }
  });

  return router;
};
