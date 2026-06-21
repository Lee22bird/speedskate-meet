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
const {
  backupDir,
  createBackup,
  deleteBackup,
  emergencyExport,
  listBackups,
  restoreBackup,
} = require('../services/desktopBackupService');

function dbStats(db) {
  const meets = Array.isArray(db?.meets) ? db.meets : [];
  return {
    meetCount: meets.length,
    registrationCount: meets.reduce((sum, meet) => sum + (Array.isArray(meet.registrations) ? meet.registrations.length : 0), 0),
  };
}

function backupAgeLabel(value) {
  const ts = new Date(value || '').getTime();
  if (!Number.isFinite(ts)) return 'Never';
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

module.exports = function createDesktopRoutes(deps = {}) {
  const router = express.Router();
  const { getSessionUser, pageShell, loadDb, saveDb } = deps;

  if (typeof pageShell !== 'function') throw new Error('desktopRoutes requires pageShell');
  if (typeof loadDb !== 'function') throw new Error('desktopRoutes requires loadDb');
  if (typeof saveDb !== 'function') throw new Error('desktopRoutes requires saveDb');

  router.get('/desktop', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const db = loadDb();
    const backups = listBackups();
    const lastBackup = backups[0];
    res.send(pageShell({
      title: 'SSM Desktop',
      description: 'SpeedSkateMeet Desktop licensing and download foundation.',
      user: data?.user || null,
      bodyHtml: `
        <div class="page-header">
          <h1>SpeedSkateMeet Desktop</h1>
          <div class="sub">Desktop meet operations are coming soon.</div>
        </div>
        <div class="card" style="margin-bottom:16px;border-left:5px solid var(--green)">
          <div class="row between center" style="gap:12px;flex-wrap:wrap">
            <div>
              <h2 style="margin:0">Desktop Mode</h2>
              <div class="note">Database Protected</div>
            </div>
            <div class="action-row" style="margin:0">
              <span class="chip chip-green">Backups: ${backups.length}</span>
              <span class="chip">Last Backup: ${esc(backupAgeLabel(lastBackup?.createdAt))}</span>
              <a class="btn2" href="/desktop/tools/backups">Backup & Recovery</a>
            </div>
          </div>
          <div class="note" style="margin-top:10px">Database Location: ${esc(process.env.SSM_DATA_FILE || 'ssm_db.json')}</div>
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
              <a class="btn2" href="/desktop/tools/backups">Backup & Recovery</a>
              <a class="btn2" href="/desktop/download">Download Placeholder</a>
            </div>
          </div>
        </div>
      `,
    }));
  });

  router.get('/desktop/tools/backups', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const db = loadDb();
    const backups = listBackups();
    const stats = dbStats(db);
    const okFlash = req.query.ok ? `<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">${esc(req.query.ok)}</div></div>` : '';
    const errorFlash = req.query.error ? `<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">${esc(req.query.error)}</div></div>` : '';
    const rows = backups.map((backup, index) => `
      <tr>
        <td><strong>${esc(backup.fileName)}</strong><div class="muted">${esc(backup.reason || 'manual')} • ${esc(new Date(backup.createdAt).toLocaleString())}</div></td>
        <td>${backup.valid ? '<span class="chip chip-good">Valid</span>' : `<span class="chip chip-warn">Invalid: ${esc(backup.reasonInvalid)}</span>`}</td>
        <td>${esc(String(backup.meetCount))}</td>
        <td>${esc(String(backup.registrationCount))}</td>
        <td style="text-align:right">
          <div class="action-row" style="justify-content:flex-end;margin:0">
            <a class="btn2 btn-sm" href="/desktop/tools/backups/${encodeURIComponent(backup.fileName)}/download">Download</a>
            <a class="btn-orange btn-sm" href="/desktop/tools/backups/${encodeURIComponent(backup.fileName)}/restore">Restore</a>
            <form method="POST" action="/desktop/tools/backups/${encodeURIComponent(backup.fileName)}/delete" style="margin:0" onsubmit="return confirm('Delete this backup?');">
              <button class="btn-danger btn-sm" type="submit" ${index === 0 ? 'disabled title="Newest backup is protected"' : ''}>Delete</button>
            </form>
          </div>
        </td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">No backups yet.</td></tr>';

    res.send(pageShell({
      title: 'Backup & Recovery',
      user: data?.user || null,
      bodyHtml: `
        <div class="page-header">
          <h1>Backup & Recovery</h1>
          <div class="sub">Protect local SpeedSkateMeet desktop data.</div>
        </div>
        ${okFlash}
        ${errorFlash}
        <div class="stat-grid" style="margin-bottom:16px">
          <div class="stat-card navy"><div class="stat-label">Current Database</div><div class="stat-value">${stats.meetCount}</div><div class="stat-sub">meets</div></div>
          <div class="stat-card green"><div class="stat-label">Backups</div><div class="stat-value">${backups.length}</div><div class="stat-sub">${esc(backupDir())}</div></div>
          <div class="stat-card orange"><div class="stat-label">Last Backup</div><div class="stat-value" style="font-size:22px">${esc(backupAgeLabel(backups[0]?.createdAt))}</div><div class="stat-sub">${backups[0] ? esc(backups[0].fileName) : 'None yet'}</div></div>
        </div>
        <div class="card" style="margin-bottom:16px">
          <div class="action-row">
            <form method="POST" action="/desktop/tools/backups/create" style="margin:0"><button class="btn-orange" type="submit">Create Backup</button></form>
            <a class="btn2" href="/desktop/tools/backups/emergency-export">Export Emergency Copy</a>
            <a class="btn2" href="/desktop">Back To Desktop</a>
          </div>
          <div class="note" style="margin-top:10px">Database Location: ${esc(process.env.SSM_DATA_FILE || 'ssm_db.json')}</div>
        </div>
        <div class="card">
          <table class="table">
            <thead><tr><th>Backup</th><th>Health</th><th>Meets</th><th>Registrations</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `,
    }));
  });

  router.post('/desktop/tools/backups/create', (req, res) => {
    try {
      const backup = createBackup({ reason: 'manual' });
      return res.redirect('/desktop/tools/backups?ok=' + encodeURIComponent(`Backup created: ${backup.fileName}`));
    } catch (err) {
      return res.redirect('/desktop/tools/backups?error=' + encodeURIComponent(err.message));
    }
  });

  router.get('/desktop/tools/backups/emergency-export', (req, res) => {
    const json = emergencyExport({ db: loadDb() });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ssm-emergency-export.json"');
    res.send(json);
  });

  router.get('/desktop/tools/backups/:fileName/download', (req, res) => {
    const backup = listBackups().find(row => row.fileName === String(req.params.fileName || ''));
    if (!backup) return res.status(404).send('Backup not found');
    res.download(backup.filePath, backup.fileName);
  });

  router.get('/desktop/tools/backups/:fileName/restore', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const backup = listBackups().find(row => row.fileName === String(req.params.fileName || ''));
    if (!backup) return res.status(404).send('Backup not found');
    res.send(pageShell({
      title: 'Restore Backup',
      user: data?.user || null,
      bodyHtml: `
        <div style="max-width:680px;margin:40px auto">
          <div class="page-header"><h1>Restore Backup</h1><div class="sub">${esc(backup.fileName)}</div></div>
          <div class="card" style="border-left:5px solid var(--orange)">
            <div class="danger" style="margin-bottom:12px">Restoring replaces the current local database. SSM will create an emergency restore-point backup first.</div>
            <div class="stat-grid" style="margin-bottom:16px">
              <div class="stat-card navy"><div class="stat-label">Meet Count</div><div class="stat-value">${backup.meetCount}</div></div>
              <div class="stat-card green"><div class="stat-label">Registrations</div><div class="stat-value">${backup.registrationCount}</div></div>
              <div class="stat-card orange"><div class="stat-label">Backup Date</div><div class="stat-value" style="font-size:18px">${esc(new Date(backup.createdAt).toLocaleString())}</div></div>
            </div>
            <form method="POST" action="/desktop/tools/backups/${encodeURIComponent(backup.fileName)}/restore" class="action-row" onsubmit="return confirm('Restore this backup now? A restore-point backup will be created first.');">
              <button class="btn-danger" type="submit">Restore This Backup</button>
              <a class="btn2" href="/desktop/tools/backups">Cancel</a>
            </form>
          </div>
        </div>
      `,
    }));
  });

  router.post('/desktop/tools/backups/:fileName/restore', (req, res) => {
    try {
      const backup = listBackups().find(row => row.fileName === String(req.params.fileName || ''));
      if (!backup) throw new Error('Backup not found.');
      const result = restoreBackup(backup.filePath);
      return res.redirect('/desktop/tools/backups?ok=' + encodeURIComponent(`Restored ${result.restoredFrom.fileName}. Restore point: ${result.restorePoint.fileName}`));
    } catch (err) {
      return res.redirect('/desktop/tools/backups?error=' + encodeURIComponent(err.message));
    }
  });

  router.post('/desktop/tools/backups/:fileName/delete', (req, res) => {
    try {
      const backup = listBackups().find(row => row.fileName === String(req.params.fileName || ''));
      if (!backup) throw new Error('Backup not found.');
      const result = deleteBackup(backup.filePath);
      if (!result.deleted) throw new Error(result.reason || 'Backup could not be deleted.');
      return res.redirect('/desktop/tools/backups?ok=' + encodeURIComponent(`Deleted ${result.fileName}.`));
    } catch (err) {
      return res.redirect('/desktop/tools/backups?error=' + encodeURIComponent(err.message));
    }
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
