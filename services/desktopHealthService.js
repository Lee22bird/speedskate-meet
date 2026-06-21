const fs = require('fs');
const os = require('os');
const path = require('path');
const { backupDir, listBackups, validateBackup } = require('./desktopBackupService');
const { generateDesktopPin, hashDesktopPin, verifyDesktopPin } = require('./desktopMeetPinService');

function packageInfo() {
  try {
    return require('../package.json');
  } catch (err) {
    return {};
  }
}

function dataFilePath(options = {}) {
  return String(options.dataFile || process.env.SSM_DATA_FILE || path.join(process.cwd(), 'ssm_db.json'));
}

function desktopStorageDir(options = {}) {
  return path.dirname(dataFilePath(options));
}

function countRegistrations(db) {
  return (Array.isArray(db?.meets) ? db.meets : []).reduce((sum, meet) => sum + (Array.isArray(meet.registrations) ? meet.registrations.length : 0), 0);
}

function countRaces(db) {
  return (Array.isArray(db?.meets) ? db.meets : []).reduce((sum, meet) => sum + (Array.isArray(meet.races) ? meet.races.length : 0), 0);
}

function countResults(db) {
  let count = 0;
  for (const meet of Array.isArray(db?.meets) ? db.meets : []) {
    for (const race of Array.isArray(meet.races) ? meet.races : []) {
      count += (Array.isArray(race.laneEntries) ? race.laneEntries : []).filter(entry =>
        String(entry.place || '').trim() ||
        String(entry.time || '').trim() ||
        String(entry.status || '').trim()
      ).length;
    }
    for (const event of Array.isArray(meet.timeTrialEvents) ? meet.timeTrialEvents : []) {
      count += (Array.isArray(event.participants) ? event.participants : []).filter(row => String(row.time || '').trim()).length;
    }
  }
  return count;
}

function validateDatabase(db) {
  const validation = validateBackup(db);
  if (!validation.valid) return { valid: false, reason: validation.reason };
  const warnings = [];
  if ((Array.isArray(db.meets) ? db.meets : []).some(meet => !String(meet.meetName || '').trim())) warnings.push('meet_without_name');
  return {
    valid: true,
    reason: warnings.length ? 'warnings' : 'ok',
    warnings,
  };
}

function databaseStats(db, options = {}) {
  const filePath = dataFilePath(options);
  let stat = null;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    stat = null;
  }
  const validation = validateDatabase(db);
  return {
    location: filePath,
    sizeBytes: stat ? stat.size : 0,
    lastModified: stat ? stat.mtime.toISOString() : '',
    validation,
    counts: {
      meets: Array.isArray(db?.meets) ? db.meets.length : 0,
      registrations: countRegistrations(db),
      races: countRaces(db),
      results: countResults(db),
    },
  };
}

function licenseStatus(db) {
  const licenses = Array.isArray(db?.desktopLicenses) ? db.desktopLicenses : [];
  const active = licenses.find(row => String(row.status || '').toLowerCase() === 'active');
  if (active) {
    return {
      status: 'Licensed',
      level: 'healthy',
      licenseType: active.product || 'ssm_desktop',
      lastValidation: active.last_validation_at || active.last_activation_at || '',
    };
  }
  return {
    status: 'Development Mode',
    level: 'warning',
    licenseType: 'Development Mode',
    lastValidation: '',
  };
}

function backupStatus(options = {}) {
  const backups = listBackups(options);
  const newest = backups[0] || null;
  return {
    count: backups.length,
    newest,
    backupDir: backupDir(options),
    level: backups.length ? 'healthy' : 'warning',
  };
}

function meetPinStatus(db) {
  const meets = Array.isArray(db?.meets) ? db.meets : [];
  const protectedMeets = meets.filter(meet => String(meet.desktop_pin_hash || '').trim()).length;
  const unprotectedMeets = meets.length - protectedMeets;
  return {
    totalMeets: meets.length,
    protectedMeets,
    unprotectedMeets,
    level: unprotectedMeets > 0 ? 'warning' : 'healthy',
  };
}

function applicationStatus(options = {}) {
  const pkg = packageInfo();
  return {
    version: pkg.build?.extraMetadata?.version || pkg.version || 'unknown',
    packageVersion: pkg.version || 'unknown',
    desktopMode: process.env.SSM_DESKTOP === '1',
    electronVersion: process.versions?.electron || options.electronVersion || '',
    nodeVersion: process.versions?.node || '',
    startupTime: process.env.SSM_DESKTOP_STARTED_AT || options.startupTime || '',
    level: process.env.SSM_DESKTOP === '1' ? 'healthy' : 'warning',
  };
}

function offlineStatus() {
  return {
    status: 'Online check not enforced',
    online: null,
    lastSuccessfulVerification: process.env.SSM_LAST_SUCCESSFUL_VERIFICATION || '',
    futureGracePeriod: 'Planned for beta',
    level: 'warning',
  };
}

function writableCheck(dirPath, label) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const file = path.join(dirPath, `.ssm-health-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.writeFileSync(file, 'ok', 'utf8');
    fs.unlinkSync(file);
    return { name: label, status: 'pass', message: 'Writable' };
  } catch (err) {
    return { name: label, status: 'fail', message: err.message };
  }
}

function runDiagnostics(db, options = {}) {
  const checks = [];
  const dbValidation = validateDatabase(db);
  checks.push({
    name: 'Database readable',
    status: dbValidation.valid ? 'pass' : 'fail',
    message: dbValidation.valid ? 'Database JSON is readable.' : `Database validation failed: ${dbValidation.reason}`,
  });
  checks.push(writableCheck(backupDir(options), 'Backup folder writable'));
  checks.push(writableCheck(desktopStorageDir(options), 'Desktop storage writable'));

  try {
    const pin = generateDesktopPin();
    const meet = { desktop_pin_hash: hashDesktopPin(pin), desktop_pin_expires_at: new Date(Date.now() + 60000).toISOString() };
    const result = verifyDesktopPin(meet, pin);
    checks.push({ name: 'Meet PIN service healthy', status: result.ok ? 'pass' : 'fail', message: result.ok ? 'PIN hashing and verification passed.' : result.reason });
  } catch (err) {
    checks.push({ name: 'Meet PIN service healthy', status: 'fail', message: err.message });
  }

  try {
    if (!Array.isArray(db.desktopLicenses)) throw new Error('desktopLicenses collection missing.');
    checks.push({ name: 'License service healthy', status: 'pass', message: 'License store is available.' });
  } catch (err) {
    checks.push({ name: 'License service healthy', status: 'fail', message: err.message });
  }

  return checks;
}

function overallLevel(checks) {
  if (checks.some(check => check.status === 'fail')) return 'error';
  if (checks.some(check => check.status === 'warning')) return 'warning';
  return 'healthy';
}

function buildHealthReport(db, options = {}) {
  const diagnostics = runDiagnostics(db, options);
  return {
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    application: applicationStatus(options),
    license: licenseStatus(db),
    backup: backupStatus(options),
    database: databaseStats(db, options),
    meetPins: meetPinStatus(db),
    offline: offlineStatus(),
    diagnostics: {
      level: overallLevel(diagnostics),
      checks: diagnostics,
    },
  };
}

module.exports = {
  applicationStatus,
  backupStatus,
  buildHealthReport,
  databaseStats,
  licenseStatus,
  meetPinStatus,
  offlineStatus,
  runDiagnostics,
  validateDatabase,
};
