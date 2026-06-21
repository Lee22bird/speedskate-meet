const express = require('express');
const { esc } = require('../utils/html');
const {
  DEFAULT_PRODUCT,
  validateLicense,
  recordActivation,
} = require('../services/licenseService');
const {
  isDesktopMeetUnlocked,
  setDesktopMeetUnlockCookie,
  verifyDesktopPin,
} = require('../services/desktopMeetPinService');

module.exports = function createDesktopRoutes(deps = {}) {
  const router = express.Router();
  const { getSessionUser, pageShell, loadDb, saveDb } = deps;

  if (typeof pageShell !== 'function') throw new Error('desktopRoutes requires pageShell');
  if (typeof loadDb !== 'function') throw new Error('desktopRoutes requires loadDb');
  if (typeof saveDb !== 'function') throw new Error('desktopRoutes requires saveDb');

  router.get('/desktop', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    res.send(pageShell({
      title: 'SSM Desktop',
      description: 'SpeedSkateMeet Desktop licensing and download foundation.',
      user: data?.user || null,
      bodyHtml: `
        <div class="page-header">
          <h1>SpeedSkateMeet Desktop</h1>
          <div class="sub">Desktop meet operations are coming soon.</div>
        </div>
        <div class="grid-2">
          <div class="card">
            <h2>Desktop Workflow</h2>
            <div class="stack">
              <div class="toggle-row"><div><div class="toggle-row-label">Purchase</div><div class="toggle-row-desc">Licenses will be sold through SpeedSkateLeague.com.</div></div></div>
              <div class="toggle-row"><div><div class="toggle-row-label">Download</div><div class="toggle-row-desc">Installers will appear here when SSM Desktop is ready.</div></div></div>
              <div class="toggle-row"><div><div class="toggle-row-label">Activate</div><div class="toggle-row-desc">Desktop apps will validate against SSM licensing.</div></div></div>
            </div>
          </div>
          <div class="card">
            <h2>License Ready</h2>
            <p style="line-height:1.7;color:var(--text)">The SSM licensing foundation is in place for future desktop activation, validation, and update workflows.</p>
            <div class="action-row">
              <a class="btn-orange" href="/desktop/open-meet">Open Meet on Desktop</a>
              <a class="btn2" href="/desktop/download">Download Placeholder</a>
            </div>
          </div>
        </div>
      `,
    }));
  });

  router.get('/desktop/open-meet', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const db = loadDb();
    const meets = (db.meets || []).filter(meet => !meet.archivedAt);
    const rows = meets.map(meet => {
      const hasPin = !!String(meet.desktop_pin_hash || '').trim();
      const unlocked = hasPin && isDesktopMeetUnlocked(req, meet);
      return `
        <tr>
          <td><strong>${esc(meet.meetName || 'Untitled Meet')}</strong><div class="muted">${esc(meet.date || '')}</div></td>
          <td>${hasPin ? (unlocked ? '<span class="chip chip-good">Unlocked</span>' : '<span class="chip chip-orange">PIN Required</span>') : '<span class="muted">No Desktop PIN</span>'}</td>
          <td style="text-align:right">
            ${hasPin ? `<a class="${unlocked ? 'btn2' : 'btn-orange'} btn-sm" href="/desktop/meet/${esc(meet.id)}/unlock">${unlocked ? 'Open' : 'Unlock'}</a>` : ''}
          </td>
        </tr>`;
    }).join('') || '<tr><td colspan="3" class="muted">No local meets found.</td></tr>';
    res.send(pageShell({
      title: 'Open Meet on Desktop',
      user: data?.user || null,
      bodyHtml: `
        <div class="page-header">
          <h1>Open Meet on Desktop</h1>
          <div class="sub">Unlock a local meet with its 6-digit meet-day PIN.</div>
        </div>
        <div class="card">
          <table class="table">
            <thead><tr><th>Meet</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `,
    }));
  });

  router.get('/desktop/meet/:meetId/unlock', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const db = loadDb();
    const meet = (db.meets || []).find(row => String(row.id) === String(req.params.meetId));
    if (!meet) return res.status(404).send(pageShell({ title: 'Meet Not Found', user: data?.user || null, bodyHtml: '<div class="card"><div class="danger">Meet not found.</div></div>' }));
    if (!String(meet.desktop_pin_hash || '').trim()) {
      return res.send(pageShell({
        title: 'Desktop PIN Not Set',
        user: data?.user || null,
        bodyHtml: `
          <div class="page-header"><h1>Desktop PIN Not Set</h1><div class="sub">${esc(meet.meetName || '')}</div></div>
          <div class="card"><div class="danger">This meet does not have a desktop PIN yet.</div><div class="note" style="margin-top:10px">A Meet Director or admin can generate one from Meet Builder.</div></div>
        `,
      }));
    }
    if (isDesktopMeetUnlocked(req, meet)) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race-day/judges`);
    const error = req.query.error ? `<div class="danger" style="margin-bottom:12px">${esc(req.query.error)}</div>` : '';
    res.send(pageShell({
      title: 'Unlock Meet',
      user: data?.user || null,
      bodyHtml: `
        <div style="max-width:520px;margin:40px auto">
          <div class="page-header"><h1>Open Meet on Desktop</h1><div class="sub">${esc(meet.meetName || '')}</div></div>
          <div class="card">
            ${error}
            <form method="POST" action="/desktop/meet/${esc(meet.id)}/unlock" class="stack">
              <div>
                <label>6-Digit Meet PIN</label>
                <input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus />
              </div>
              <button class="btn-orange" type="submit" style="width:100%">Unlock Meet</button>
            </form>
            <div class="note" style="margin-top:12px">This unlocks only this meet on this desktop app. It does not grant admin, license, or global account access.</div>
          </div>
        </div>
      `,
    }));
  });

  router.post('/desktop/meet/:meetId/unlock', (req, res) => {
    const db = loadDb();
    const meet = (db.meets || []).find(row => String(row.id) === String(req.params.meetId));
    if (!meet) return res.status(404).send('Meet not found');
    const result = verifyDesktopPin(meet, req.body?.pin);
    if (!result.ok) {
      const message = result.reason === 'expired' ? 'This desktop PIN has expired.' : 'Invalid desktop PIN.';
      return res.redirect(`/desktop/meet/${encodeURIComponent(meet.id)}/unlock?error=${encodeURIComponent(message)}`);
    }
    setDesktopMeetUnlockCookie(res, meet);
    return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race-day/judges`);
  });

  router.get('/desktop/download', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    res.send(pageShell({
      title: 'Download SSM Desktop',
      description: 'SpeedSkateMeet Desktop download placeholder.',
      user: data?.user || null,
      bodyHtml: `
        <div class="page-header">
          <h1>Download SSM Desktop</h1>
          <div class="sub">No installer is available yet.</div>
        </div>
        <div class="card">
          <h2>Coming Soon</h2>
          <p style="line-height:1.7;color:var(--text)">This page is reserved for future SSM Desktop installers, release notes, and license activation instructions.</p>
          <a class="btn2" href="/desktop">Back to Desktop</a>
        </div>
      `,
    }));
  });

  router.post('/api/license/validate', (req, res) => {
    const db = loadDb();
    const result = validateLicense(db, {
      licenseKey: req.body?.license_key || req.body?.licenseKey,
      product: req.body?.product || DEFAULT_PRODUCT,
    });
    if (result.valid) saveDb(db);
    return res.status(result.valid ? 200 : 400).json(result);
  });

  router.post('/api/license/activate', (req, res) => {
    const db = loadDb();
    const result = recordActivation(db, {
      licenseKey: req.body?.license_key || req.body?.licenseKey,
      product: req.body?.product || DEFAULT_PRODUCT,
      deviceId: req.body?.device_id || req.body?.deviceId,
      deviceName: req.body?.device_name || req.body?.deviceName,
      appVersion: req.body?.app_version || req.body?.appVersion,
      platform: req.body?.platform,
    });
    if (result.activated) saveDb(db);
    return res.status(result.activated ? 200 : 400).json(result);
  });

  return router;
};
