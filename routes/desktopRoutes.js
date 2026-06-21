const express = require('express');
const {
  DEFAULT_PRODUCT,
  validateLicense,
  recordActivation,
} = require('../services/licenseService');

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
            <a class="btn-orange" href="/desktop/download">Download Placeholder</a>
          </div>
        </div>
      `,
    }));
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
