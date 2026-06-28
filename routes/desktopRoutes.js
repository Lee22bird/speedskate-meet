const express = require('express');
const { spawn } = require('child_process');
const { esc } = require('../utils/html');
const { nowIso } = require('../utils/date');
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
const {
  buildHealthReport,
  runDiagnostics,
} = require('../services/desktopHealthService');
const {
  clearPendingRecovery,
  pendingRecovery,
  recordDesktopState,
  restorePreviousMeet,
} = require('../services/desktopCrashRecoveryService');

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

function bytesLabel(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function healthChip(level, label) {
  const normalized = String(level || '').toLowerCase();
  const cls = normalized === 'healthy' || normalized === 'pass' ? 'chip-good' : (normalized === 'error' || normalized === 'fail' ? 'chip-warn' : 'chip-orange');
  return `<span class="chip ${cls}">${esc(label || level || 'Status')}</span>`;
}

function healthCard(title, level, value, detail, actions = '') {
  return `
    <div class="card" style="border-left:5px solid ${level === 'error' ? 'var(--red)' : (level === 'warning' ? 'var(--orange)' : 'var(--green)')}">
      <div class="row between center" style="gap:12px;align-items:flex-start">
        <div>
          <h2 style="margin:0 0 8px">${esc(title)}</h2>
          <div style="font-size:24px;font-weight:900;color:var(--navy);line-height:1.1">${esc(value)}</div>
          <div class="note" style="margin-top:8px;line-height:1.5">${detail}</div>
        </div>
        ${healthChip(level, level === 'healthy' ? 'Healthy' : (level === 'error' ? 'Error' : 'Warning'))}
      </div>
      ${actions ? `<div class="action-row" style="margin-top:14px">${actions}</div>` : ''}
    </div>`;
}

function recoveryDetail(snapshot) {
  const race = snapshot?.raceState || {};
  const tab = snapshot?.tabulatorState || {};
  return `
    <div class="stat-grid" style="margin:16px 0">
      <div class="stat-card navy"><div class="stat-label">Previous Meet</div><div class="stat-value" style="font-size:22px">${esc(snapshot?.currentMeetName || 'Unknown Meet')}</div><div class="stat-sub">${esc(snapshot?.meetDate || '')}</div></div>
      <div class="stat-card orange"><div class="stat-label">Race Index</div><div class="stat-value">${esc(String((race.currentRaceIndex ?? -1) + 1))}</div><div class="stat-sub">${esc(race.currentRaceId || 'No current race')}</div></div>
      <div class="stat-card green"><div class="stat-label">Tabulator State</div><div class="stat-value">${esc(String(tab.resultRaceCount || 0))}</div><div class="stat-sub">races with results</div></div>
      <div class="stat-card sky"><div class="stat-label">Generated Heats</div><div class="stat-value">${esc(String((snapshot?.generatedHeats || []).length))}</div><div class="stat-sub">saved race structures</div></div>
    </div>
    <div class="note">Captured: ${esc(snapshot?.capturedAt ? new Date(snapshot.capturedAt).toLocaleString() : 'Unknown')}</div>
  `;
}

// In-memory only, never written to disk — desktop is a single-user app, so a
// simple module-level session is enough to carry the hosted-site login cookie
// between the login/pick/confirm steps of "Download Meet to Desktop".
let importSession = null; // { baseUrl, cookie }

module.exports = function createDesktopRoutes(deps = {}) {
  const router = express.Router();
  const { getSessionUser, pageShell, loadDb, saveDb, nextId } = deps;

  if (typeof pageShell !== 'function') throw new Error('desktopRoutes requires pageShell');
  if (typeof loadDb !== 'function') throw new Error('desktopRoutes requires loadDb');
  if (typeof saveDb !== 'function') throw new Error('desktopRoutes requires saveDb');

  router.get('/desktop/recovery', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const snapshot = pendingRecovery();
    if (!snapshot) return res.redirect('/desktop');
    const error = req.query.error ? `<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">${esc(req.query.error)}</div></div>` : '';
    res.send(pageShell({
      title: 'Crash Recovery',
      user: data?.user || null,
      bodyHtml: `
        <div style="max-width:860px;margin:36px auto">
          <div class="page-header">
            <h1>SSM detected an unexpected shutdown.</h1>
            <div class="sub">Choose how you want to continue. Recovery works fully offline from local desktop data.</div>
          </div>
          ${error}
          <div class="card" style="border-left:5px solid var(--orange)">
            ${recoveryDetail(snapshot)}
            <div class="action-row" style="margin-top:18px">
              <form method="POST" action="/desktop/recovery/restore-previous" style="margin:0">
                <button class="btn-orange" type="submit">Restore Previous Meet</button>
              </form>
              <form method="POST" action="/desktop/recovery/open-backup" style="margin:0">
                <button class="btn2" type="submit">Open Backup</button>
              </form>
              <form method="POST" action="/desktop/recovery/start-fresh" style="margin:0" onsubmit="return confirm('Start fresh and dismiss this recovery prompt? Your backups will remain available.');">
                <button class="btn2" type="submit">Start Fresh</button>
              </form>
            </div>
          </div>
        </div>
      `,
    }));
  });

  router.post('/desktop/recovery/restore-previous', (req, res) => {
    try {
      const db = loadDb();
      const snapshot = pendingRecovery();
      try { createBackup({ db, reason: 'before_crash_recovery_restore', meetId: snapshot?.currentMeetId || '' }); }
      catch (err) { console.warn('Crash recovery restore-point backup skipped:', err.message); }
      const result = restorePreviousMeet(db);
      saveDb(db);
      return res.redirect(`/desktop/meet/${encodeURIComponent(result.meetId)}/unlock`);
    } catch (err) {
      return res.redirect('/desktop/recovery?error=' + encodeURIComponent(err.message));
    }
  });

  router.post('/desktop/recovery/open-backup', (req, res) => {
    clearPendingRecovery();
    res.redirect('/desktop/settings/backups');
  });

  router.post('/desktop/recovery/start-fresh', (req, res) => {
    clearPendingRecovery();
    res.redirect('/desktop');
  });

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
              <a class="btn-orange" href="/desktop/tools/health">Health Center</a>
              <a class="btn2" href="/desktop/settings/backups">Settings → Backup Manager</a>
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
              <a class="btn-orange" href="/desktop/tools/health">Health Center</a>
              <a class="btn-orange" href="/desktop/open-meet">Open Meet on Desktop</a>
              <a class="btn2" href="/desktop/settings/backups">Settings → Backup Manager</a>
              <a class="btn2" href="/desktop/download">Download Placeholder</a>
            </div>
          </div>
        </div>
      `,
    }));
  });

  router.get('/desktop/tools/health', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const db = loadDb();
    const report = buildHealthReport(db);
    const app = report.application;
    const license = report.license;
    const backup = report.backup;
    const database = report.database;
    const pins = report.meetPins;
    const offline = report.offline;
    const backupActions = `
      <form method="POST" action="/desktop/tools/backups/create" style="margin:0"><button class="btn-orange" type="submit">Create Backup</button></form>
      <a class="btn2" href="/desktop/settings/backups">Open Backup Manager</a>`;
    res.send(pageShell({
      title: 'Desktop Health Center',
      user: data?.user || null,
      bodyHtml: `
        <div class="page-header">
          <h1>Desktop Health Center</h1>
          <div class="sub">Pre-meet readiness for SSM Desktop.</div>
        </div>
        <div class="action-row" style="margin-bottom:16px">
          <a class="btn-orange" href="/desktop/tools/health/run">Run Diagnostics</a>
          <a class="btn2" href="/desktop/tools/health/report">Export Health Report</a>
          <a class="btn2" href="/desktop/settings/backups">Settings → Backup Manager</a>
          <a class="btn2" href="/desktop">Desktop Tools</a>
        </div>
        <div class="grid-2" style="margin-bottom:16px">
          ${healthCard(
            'Application Status',
            app.level,
            `SpeedSkateMeet ${app.version}`,
            `Desktop Mode: ${app.desktopMode ? 'Active' : 'Inactive'}<br>Electron: ${esc(app.electronVersion || 'Browser Mode')}<br>Node: ${esc(app.nodeVersion || '')}<br>Startup: ${esc(app.startupTime || 'Not recorded')}`
          )}
          ${healthCard(
            'License Status',
            license.level,
            license.status,
            `License Type: ${esc(license.licenseType || 'Development Mode')}<br>Last Validation: ${esc(license.lastValidation || 'Not yet validated')}`
          )}
          ${healthCard(
            'Backup Status',
            backup.level,
            `${backup.count} backup${backup.count === 1 ? '' : 's'}`,
            `Newest Backup: ${esc(backup.newest ? backupAgeLabel(backup.newest.createdAt) : 'None')}<br>Folder: ${esc(backup.backupDir)}`,
            backupActions
          )}
          ${healthCard(
            'Database Status',
            database.validation.valid ? (database.validation.warnings.length ? 'warning' : 'healthy') : 'error',
            database.validation.valid ? 'Readable' : 'Needs Attention',
            `Location: ${esc(database.location)}<br>Size: ${esc(bytesLabel(database.sizeBytes))}<br>Last Modified: ${esc(database.lastModified || 'Missing')}<br>Meets: ${database.counts.meets} • Registrations: ${database.counts.registrations} • Races: ${database.counts.races} • Results: ${database.counts.results}`
          )}
          ${healthCard(
            'Meet PIN Status',
            pins.level,
            `${pins.protectedMeets}/${pins.totalMeets} protected`,
            `Protected Meets: ${pins.protectedMeets}<br>Unprotected Meets: ${pins.unprotectedMeets}${pins.unprotectedMeets ? '<br><strong>Warning:</strong> at least one meet exists without a desktop PIN.' : ''}`
          )}
          ${healthCard(
            'Offline Status',
            offline.level,
            offline.status,
            `Last Successful Verification: ${esc(offline.lastSuccessfulVerification || 'Not yet tracked')}<br>Future Offline Grace Period: ${esc(offline.futureGracePeriod)}`
          )}
        </div>
        <div class="card">
          <h2 style="margin-top:0">System Diagnostics</h2>
          <div class="note" style="margin-bottom:12px">Run this before meet day to verify local storage, backups, PIN support, licensing foundations, and database readability.</div>
          <a class="btn-orange" href="/desktop/tools/health/run">Run Diagnostics</a>
        </div>
      `,
    }));
  });

  router.get('/desktop/tools/health/run', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const db = loadDb();
    const checks = runDiagnostics(db);
    const rows = checks.map(check => `
      <tr>
        <td><strong>${esc(check.name)}</strong></td>
        <td>${healthChip(check.status, check.status === 'pass' ? 'Pass' : (check.status === 'fail' ? 'Fail' : 'Warning'))}</td>
        <td>${esc(check.message || '')}</td>
      </tr>`).join('');
    res.send(pageShell({
      title: 'Desktop Diagnostics',
      user: data?.user || null,
      bodyHtml: `
        <div class="page-header">
          <h1>Desktop Diagnostics</h1>
          <div class="sub">Latest readiness check.</div>
        </div>
        <div class="action-row" style="margin-bottom:16px">
          <a class="btn-orange" href="/desktop/tools/health/run">Run Again</a>
          <a class="btn2" href="/desktop/tools/health">Health Center</a>
          <a class="btn2" href="/desktop/tools/health/report">Export Health Report</a>
        </div>
        <div class="card">
          <table class="table">
            <thead><tr><th>Check</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `,
    }));
  });

  router.get('/desktop/tools/health/report', (req, res) => {
    const report = buildHealthReport(loadDb());
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ssm-health-report.json"');
    res.send(JSON.stringify(report, null, 2));
  });

  function renderBackupsPage(req, res) {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const db = loadDb();
    const backups = listBackups();
    const stats = dbStats(db);
    const okFlash = req.query.ok ? `<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">${esc(req.query.ok)}</div></div>` : '';
    const errorFlash = req.query.error ? `<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">${esc(req.query.error)}</div></div>` : '';
    const rows = backups.map((backup, index) => `
      <tr>
        <td><strong>${esc(backup.fileName)}</strong><div class="muted">${esc(backup.reason || 'manual')}</div></td>
        <td>${esc(backup.meetName || 'All Data')}<div class="muted">${esc(backup.meetDate || '')}</div></td>
        <td>${esc(new Date(backup.createdAt).toLocaleString())}</td>
        <td>${esc(bytesLabel(backup.size))}</td>
        <td>${backup.valid ? '<span class="chip chip-good">Valid</span>' : `<span class="chip chip-warn">Invalid: ${esc(backup.reasonInvalid)}</span>`}</td>
        <td>${esc(String(backup.meetCount))}</td>
        <td>${esc(String(backup.registrationCount))}</td>
        <td style="text-align:right">
          <div class="action-row" style="justify-content:flex-end;margin:0">
            <a class="btn2 btn-sm" href="/desktop/tools/backups/${encodeURIComponent(backup.fileName)}/download">Export</a>
            <a class="btn-orange btn-sm" href="/desktop/tools/backups/${encodeURIComponent(backup.fileName)}/restore">Restore</a>
            <a class="btn2 btn-sm" href="/desktop/tools/backups/${encodeURIComponent(backup.fileName)}/reveal">Reveal</a>
            <form method="POST" action="/desktop/tools/backups/${encodeURIComponent(backup.fileName)}/delete" style="margin:0" onsubmit="return confirm('Delete this backup?');">
              <button class="btn-danger btn-sm" type="submit" ${index === 0 ? 'disabled title="Newest backup is protected"' : ''}>Delete</button>
            </form>
          </div>
        </td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted">No backups yet.</td></tr>';

    res.send(pageShell({
      title: 'Settings → Backup Manager',
      user: data?.user || null,
      bodyHtml: `
        <div class="page-header">
          <h1>Settings → Backup Manager</h1>
          <div class="sub">Compressed ZIP backups protect local SpeedSkateMeet desktop data.</div>
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
          <div class="note" style="margin-top:10px">Database Location: ${esc(process.env.SSM_SQLITE_FILE || process.env.SSM_DATA_FILE || 'ssm_db.json')} · Retention: latest 30 backups, plus the latest backup for each meet</div>
        </div>
        <div class="card">
          <table class="table">
            <thead><tr><th>Backup</th><th>Meet</th><th>Created</th><th>Size</th><th>Health</th><th>Meets</th><th>Registrations</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `,
    }));
  }

  router.get('/desktop/tools/backups', renderBackupsPage);
  router.get('/desktop/settings/backups', renderBackupsPage);

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

  router.get('/desktop/tools/backups/:fileName/reveal', (req, res) => {
    const backup = listBackups().find(row => row.fileName === String(req.params.fileName || ''));
    if (!backup) return res.status(404).send('Backup not found');
    if (process.platform === 'darwin') spawn('open', ['-R', backup.filePath], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'win32') spawn('explorer.exe', ['/select,', backup.filePath], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [backupDir()], { detached: true, stdio: 'ignore' }).unref();
    res.redirect('/desktop/settings/backups');
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
              <div class="stat-card sky"><div class="stat-label">Backup Size</div><div class="stat-value" style="font-size:20px">${esc(bytesLabel(backup.size))}</div></div>
            </div>
            <div class="note" style="margin-bottom:14px">Meet: ${esc(backup.meetName || 'All Data')} · Blocks: ${esc(String(backup.blockCount || 0))} · Races: ${esc(String(backup.raceCount || 0))} · Lane Entries: ${esc(String(backup.laneEntryCount || 0))} · Results: ${esc(String(backup.resultCount || 0))} · Time Trials: ${esc(String(backup.timeTrialCount || 0))}</div>
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
      const restorePointText = result.restorePoint?.fileName ? ` Restore point: ${result.restorePoint.fileName}` : '';
      return res.redirect('/desktop/tools/backups?ok=' + encodeURIComponent(`Restored ${result.restoredFrom.fileName}.${restorePointText}`));
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
    recordDesktopState(db, { meetId: meet.id });
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

  // ── Download Meet to Desktop ──────────────────────────────────────────────
  // Pulls a meet down from the hosted SpeedSkateMeet.com site over the
  // internet (when available) and saves it as a new local meet that then
  // runs fully offline, same as any meet created directly on desktop.

  router.get('/desktop/import-meet', (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    const error = req.query.error ? `<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">${esc(req.query.error)}</div></div>` : '';
    res.send(pageShell({
      title: 'Import Meet',
      user: data?.user || null,
      bodyHtml: `
        <div style="max-width:560px;margin:36px auto">
          <div class="page-header">
            <h1>Import Meet From SpeedSkateMeet.com</h1>
            <div class="sub">Download a meet you manage online so it runs fully offline on this computer. Requires an internet connection for this one step only.</div>
          </div>
          ${error}
          <div class="card">
            <form method="POST" action="/desktop/import-meet/login" class="stack">
              <div><label>Site URL</label><input name="baseUrl" value="https://speedskatemeet.com" required /></div>
              <div><label>Email / Username</label><input name="username" required autocomplete="username" /></div>
              <div><label>Password</label><input type="password" name="password" required autocomplete="current-password" /></div>
              <button class="btn-orange" type="submit">Log In &amp; Continue</button>
            </form>
          </div>
        </div>
      `,
    }));
  });

  router.post('/desktop/import-meet/login', async (req, res) => {
    const baseUrl = String(req.body.baseUrl || '').trim().replace(/\/+$/, '');
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();
    if (!baseUrl || !username || !password) {
      return res.redirect('/desktop/import-meet?error=' + encodeURIComponent('Site URL, email, and password are all required.'));
    }
    try {
      const loginRes = await fetch(`${baseUrl}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: username, password }).toString(),
        redirect: 'manual',
      });
      const setCookie = loginRes.headers.get('set-cookie') || '';
      const match = setCookie.match(/ssm_sess=[^;]+/);
      if (!match) {
        return res.redirect('/desktop/import-meet?error=' + encodeURIComponent('Login failed. Check your email and password.'));
      }
      importSession = { baseUrl, cookie: match[0] };
      return res.redirect('/desktop/import-meet/pick');
    } catch (err) {
      return res.redirect('/desktop/import-meet?error=' + encodeURIComponent('Could not reach that site. Check the URL and your internet connection.'));
    }
  });

  router.get('/desktop/import-meet/pick', async (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    if (!importSession) return res.redirect('/desktop/import-meet?error=' + encodeURIComponent('Log in first.'));
    const error = req.query.error ? `<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">${esc(req.query.error)}</div></div>` : '';
    try {
      const listRes = await fetch(`${importSession.baseUrl}/api/my-meets`, { headers: { Cookie: importSession.cookie } });
      const payload = await listRes.json();
      if (!listRes.ok || !payload.ok) {
        return res.redirect('/desktop/import-meet?error=' + encodeURIComponent(payload.error || 'Could not load your meets. Please log in again.'));
      }
      const rows = (payload.meets || []).map(m => `
        <tr>
          <td><strong>${esc(m.meetName)}</strong><div class="muted">${esc(m.date || 'No date set')} • ${esc(String(m.registrationCount))} registered</div></td>
          <td style="text-align:right">
            <form method="POST" action="/desktop/import-meet/confirm" style="margin:0">
              <input type="hidden" name="meetId" value="${esc(m.id)}" />
              <button class="btn-orange btn-sm" type="submit">Download</button>
            </form>
          </td>
        </tr>`).join('') || '<tr><td colspan="2" class="muted">No meets found for this account.</td></tr>';
      res.send(pageShell({
        title: 'Import Meet',
        user: data?.user || null,
        bodyHtml: `
          <div class="page-header"><h1>Choose a Meet to Download</h1><div class="sub">From ${esc(importSession.baseUrl)}</div></div>
          ${error}
          <div class="card">
            <table class="table"><thead><tr><th>Meet</th><th></th></tr></thead><tbody>${rows}</tbody></table>
          </div>
        `,
      }));
    } catch (err) {
      return res.redirect('/desktop/import-meet?error=' + encodeURIComponent('Could not load your meets.'));
    }
  });

  router.post('/desktop/import-meet/confirm', async (req, res) => {
    const data = typeof getSessionUser === 'function' ? getSessionUser(req) : null;
    if (!data?.user) return res.redirect('/admin/login');
    if (process.env.SSM_DESKTOP !== '1') {
      return res.status(400).send('Importing a meet is only available in SpeedSkateMeet Desktop.');
    }
    if (!importSession) return res.redirect('/desktop/import-meet?error=' + encodeURIComponent('Log in first.'));
    const meetId = String(req.body.meetId || '').trim();
    try {
      const exportRes = await fetch(`${importSession.baseUrl}/portal/meet/${encodeURIComponent(meetId)}/desktop-export`, { headers: { Cookie: importSession.cookie } });
      const payload = await exportRes.json();
      if (!exportRes.ok || !payload.ok || !payload.meet) {
        return res.redirect('/desktop/import-meet/pick?error=' + encodeURIComponent(payload.error || 'Could not download that meet.'));
      }

      const db = loadDb();
      const importedMeet = {
        ...payload.meet,
        id: nextId(db.meets),
        meet_owner_user_id: data.user.id,
        meet_owner_ssl_id: '',
        meet_owner_name: data.user.displayName || data.user.username || '',
        ownership_locked: true,
        importedFromHostedMeetId: payload.meet.id,
        importedFromUrl: importSession.baseUrl,
        importedAt: nowIso(),
      };
      db.meets.push(importedMeet);
      saveDb(db);
      importSession = null;
      return res.redirect(`/portal/meet/${importedMeet.id}/builder?imported=1`);
    } catch (err) {
      return res.redirect('/desktop/import-meet/pick?error=' + encodeURIComponent('Could not download that meet.'));
    }
  });

  return router;
};
