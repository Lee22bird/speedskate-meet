const express = require('express');
const { esc } = require('../utils/html');
const { canManageMeetSettings } = require('../utils/auth');
const { getMeetOr404 } = require('../services/meetHelpers');
const {
  STAFF_ROLE_KEYS,
  upsertMeetStaffAssignment,
  clearMeetStaffAssignment,
} = require('../services/staffAssignments');
const {
  createStaffPin, revokeStaffPin, regenerateStaffPin, PIN_ROLE_LABELS,
} = require('../services/meetStaffPins');

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

async function searchSslStaff({ q, role, meetId = '' }) {
  const base = configuredSslBaseUrl();
  if (!base) throw new Error('SSL_BASE_URL is not configured.');
  if (typeof fetch !== 'function') throw new Error('This Node runtime does not support SSL staff search.');
  const url = new URL('/api/ssm/staff-search', base);
  url.searchParams.set('q', q);
  url.searchParams.set('role', role);
  url.searchParams.set('staff_role', role);
  if (meetId) url.searchParams.set('meetId', meetId);
  const response = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
      'x-ssm-api-key': configuredSslStaffApiKey(),
      'x-ssl-api-key': configuredSslStaffApiKey(),
    },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text }; }
  const people = Array.isArray(body.people) ? body.people : [];
  console.log('SSM staff search proxy:', {
    requested_role: role,
    query: q,
    meet_id: meetId,
    ssl_url: url.toString(),
    ssl_response_status: response.status,
    ssl_result_count: people.length,
    ssl_error: body.error || body.message || '',
  });
  if (!response.ok || body.ok === false) throw new Error(body.error || body.message || `SSL staff search failed with HTTP ${response.status}`);
  return people;
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
  const { requireRole, saveDb, pageShell } = deps;

  // The generated PIN is shown ONCE (no redirect — never put the code in a URL).
  function pinRevealPage(req, meet, row, pin) {
    return pageShell({
      title: 'Meet PIN', user: req.user, meet, activeTab: 'builder',
      bodyHtml: `
        <div class="page-header"><h1>Meet PIN Created</h1><div class="sub">${esc(meet.meetName || '')}</div></div>
        <div class="card" style="max-width:620px;border-left:5px solid var(--orange)">
          <h2 style="margin-top:0">${esc(row.name)} — ${esc(PIN_ROLE_LABELS[row.role] || 'Staff')}</h2>
          <div class="note" style="margin-bottom:12px">This PIN is shown once. Give it only to this person. They sign in at <strong>/meet-pin</strong> (pick this meet, enter the code).</div>
          <div style="font-size:46px;font-weight:900;letter-spacing:.18em;color:var(--navy);line-height:1">${esc(pin)}</div>
          <div class="action-row" style="margin-top:18px">
            <a class="btn-orange" href="/portal/meet/${esc(meet.id)}/builder">Back To Meet Builder</a>
            <a class="btn2" href="/meet-pin" target="_blank">Open Meet-PIN sign-in</a>
          </div>
        </div>`,
    });
  }

  router.post('/portal/meet/:meetId/staff/pin/create', requireRole('meet_director'), (req, res) => {
    const meetId = req.params.meetId;
    try {
      const meet = getMeetOr404(req.db, meetId);
      if (!meet) throw new Error('Meet not found.');
      if (!canManageMeetSettings(req.user, meet)) throw new Error('Only the meet owner or Super Admin can manage meet PINs.');
      const { row, pin } = createStaffPin(meet, { name: req.body.name, role: req.body.role, createdByUserId: req.user.id });
      saveDb(req.db);
      return res.send(pinRevealPage(req, meet, row, pin));
    } catch (err) {
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?error=${encodeURIComponent(err.message)}`);
    }
  });

  router.post('/portal/meet/:meetId/staff/pin/regenerate', requireRole('meet_director'), (req, res) => {
    const meetId = req.params.meetId;
    try {
      const meet = getMeetOr404(req.db, meetId);
      if (!meet) throw new Error('Meet not found.');
      if (!canManageMeetSettings(req.user, meet)) throw new Error('Only the meet owner or Super Admin can manage meet PINs.');
      const { row, pin } = regenerateStaffPin(meet, String(req.body.pinId || ''));
      saveDb(req.db);
      return res.send(pinRevealPage(req, meet, row, pin));
    } catch (err) {
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?error=${encodeURIComponent(err.message)}`);
    }
  });

  router.post('/portal/meet/:meetId/staff/pin/revoke', requireRole('meet_director'), (req, res) => {
    const meetId = req.params.meetId;
    try {
      const meet = getMeetOr404(req.db, meetId);
      if (!meet) throw new Error('Meet not found.');
      if (!canManageMeetSettings(req.user, meet)) throw new Error('Only the meet owner or Super Admin can manage meet PINs.');
      revokeStaffPin(meet, String(req.body.pinId || ''));
      saveDb(req.db);
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?saved=1`);
    } catch (err) {
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?error=${encodeURIComponent(err.message)}`);
    }
  });

  router.get('/api/meet/:meetId/staff-search', requireRole('meet_director'), async (req, res) => {
    try {
      const meet = getMeetOr404(req.db, req.params.meetId);
      if (!meet) return res.status(404).json({ ok: false, error: 'Meet not found.' });
      if (!canManageMeetSettings(req.user, meet)) return res.status(403).json({ ok: false, error: 'Only the meet owner or Super Admin can change staff assignments.' });
      const role = String(req.query.role || '').trim();
      const q = String(req.query.q || '').trim();
      if (!STAFF_ROLE_KEYS.has(role)) return res.status(400).json({ ok: false, error: 'Unsupported staff role.' });
      if (q.length < 2) return res.json({ ok: true, people: [] });
      const people = await searchSslStaff({ q, role, meetId: req.params.meetId });
      console.log('SSM staff search result:', {
        meet_id: String(req.params.meetId || ''),
        requested_role: role,
        query: q,
        result_count: people.length,
        empty_reason: people.length ? '' : 'No approved SSL users found for this staff role.',
      });
      return res.json({ ok: true, people });
    } catch (err) {
      console.warn('SSM staff search failed:', {
        meet_id: String(req.params.meetId || ''),
        requested_role: String(req.query.role || req.query.staff_role || ''),
        query: String(req.query.q || ''),
        message: err.message,
      });
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
      const candidates = await searchSslStaff({ q: posted.staff_ssl_id || posted.staff_name || posted.staff_user_id, role, meetId });
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
      // With multiple people per role, the Remove button targets ONE assignment
      // by id; a missing id (legacy form) clears the whole role.
      clearMeetStaffAssignment(meet, role, String(req.body.staff_assignment_id || '').trim());
      saveDb(req.db);
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?saved=1`);
    } catch (err) {
      return res.redirect(`/portal/meet/${encodeURIComponent(meetId)}/builder?error=${encodeURIComponent(err.message)}`);
    }
  });

  return router;
};
