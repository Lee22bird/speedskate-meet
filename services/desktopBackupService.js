const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeReadJson, writeJsonAtomic } = require('../utils/db');

const MAX_BACKUPS = 20;
const BACKUP_PREFIX = 'ssm-backup-';
const BACKUP_SUFFIX = '.json';

function dataFilePath(options = {}) {
  return String(options.dataFile || process.env.SSM_DATA_FILE || path.join(process.cwd(), 'ssm_db.json'));
}

function defaultDesktopDataDir() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'SpeedSkateMeet');
}

function backupDir(options = {}) {
  if (options.backupDir) return String(options.backupDir);
  if (process.env.SSM_BACKUP_DIR) return String(process.env.SSM_BACKUP_DIR);
  if (process.env.SSM_DATA_FILE) return path.join(path.dirname(process.env.SSM_DATA_FILE), 'backups');
  return path.join(defaultDesktopDataDir(), 'backups');
}

function ensureBackupDir(options = {}) {
  const dir = backupDir(options);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function timestampForFile(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function backupFileName(date = new Date()) {
  return `${BACKUP_PREFIX}${timestampForFile(date)}${BACKUP_SUFFIX}`;
}

function uniqueBackupPath(dir, baseDate = new Date()) {
  for (let i = 0; i < 120; i += 1) {
    const candidateDate = new Date(baseDate.getTime() + i * 1000);
    const candidate = path.join(dir, backupFileName(candidateDate));
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not create a unique backup filename.');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function countRegistrations(db) {
  return (Array.isArray(db?.meets) ? db.meets : []).reduce((sum, meet) => sum + (Array.isArray(meet.registrations) ? meet.registrations.length : 0), 0);
}

function backupPayload(db, options = {}) {
  const database = clone(db);
  return {
    backup_meta: {
      app: 'SpeedSkateMeet',
      kind: 'desktop_database_backup',
      reason: String(options.reason || 'manual'),
      created_at: new Date().toISOString(),
      version: database?.version || null,
      meet_count: Array.isArray(database?.meets) ? database.meets.length : 0,
      registration_count: countRegistrations(database),
    },
    database,
  };
}

function unwrapBackup(raw) {
  if (raw && typeof raw === 'object' && raw.database && typeof raw.database === 'object') return raw.database;
  return raw;
}

function validateBackup(input) {
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (err) {
      return { valid: false, reason: 'invalid_json' };
    }
  }

  const db = unwrapBackup(raw);
  if (!db || typeof db !== 'object' || Array.isArray(db)) return { valid: false, reason: 'not_object' };
  for (const key of ['meets', 'users', 'rinks']) {
    if (!Array.isArray(db[key])) return { valid: false, reason: `missing_${key}` };
  }
  const meetCount = db.meets.length;
  const registrationCount = countRegistrations(db);
  if (db.meets.some(meet => !meet || typeof meet !== 'object' || meet.id == null)) {
    return { valid: false, reason: 'invalid_meet_record' };
  }
  return {
    valid: true,
    reason: 'ok',
    database: db,
    info: {
      meetCount,
      registrationCount,
      version: db.version || null,
      backupDate: raw?.backup_meta?.created_at || raw?.updatedAt || '',
    },
  };
}

function getBackupInfo(filePath) {
  const raw = safeReadJson(filePath);
  const validation = validateBackup(raw);
  const stat = fs.statSync(filePath);
  return {
    fileName: path.basename(filePath),
    filePath,
    size: stat.size,
    createdAt: raw?.backup_meta?.created_at || stat.mtime.toISOString(),
    reason: raw?.backup_meta?.reason || '',
    valid: validation.valid,
    reasonInvalid: validation.valid ? '' : validation.reason,
    meetCount: validation.info?.meetCount || 0,
    registrationCount: validation.info?.registrationCount || 0,
    version: validation.info?.version || null,
    mtimeMs: stat.mtimeMs,
  };
}

function listBackups(options = {}) {
  const dir = ensureBackupDir(options);
  return fs.readdirSync(dir)
    .filter(name => name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX))
    .map(name => getBackupInfo(path.join(dir, name)))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function pruneBackups(options = {}) {
  const keep = Number(options.keep || MAX_BACKUPS);
  const protectedFiles = new Set([
    ...(Array.isArray(options.protectFiles) ? options.protectFiles : []),
    options.keepFile,
  ].filter(Boolean).map(filePath => path.resolve(filePath)));
  const backups = listBackups(options);
  const deletable = backups.slice(keep).filter(row => !protectedFiles.has(path.resolve(row.filePath)));
  for (const backup of deletable) {
    fs.unlinkSync(backup.filePath);
  }
  return { deleted: deletable.length, kept: listBackups(options).length };
}

function createBackup(options = {}) {
  const file = dataFilePath(options);
  const db = options.db ? clone(options.db) : safeReadJson(file);
  if (!db) throw new Error('No database found to back up.');
  const validation = validateBackup(db);
  if (!validation.valid) throw new Error(`Current database is not safe to back up: ${validation.reason}`);

  const dir = ensureBackupDir(options);
  const target = uniqueBackupPath(dir, options.date || new Date());
  writeJsonAtomic(target, backupPayload(db, options));
  pruneBackups({ ...options, keepFile: target, protectFiles: [...(options.protectFiles || []), target] });
  return getBackupInfo(target);
}

function restoreBackup(filePath, options = {}) {
  const target = dataFilePath(options);
  const rawText = fs.readFileSync(filePath, 'utf8');
  const validation = validateBackup(rawText);
  if (!validation.valid) throw new Error(`Invalid backup: ${validation.reason}`);

  const restorePoint = createBackup({ ...options, reason: 'before_restore', protectFiles: [filePath, ...(options.protectFiles || [])] });
  writeJsonAtomic(target, validation.database);
  return {
    restored: true,
    restoredFrom: getBackupInfo(filePath),
    restorePoint,
  };
}

function deleteBackup(filePath, options = {}) {
  const backups = listBackups(options);
  if (!backups.length) return { deleted: false, reason: 'no_backups' };
  const newest = backups[0];
  if (path.resolve(newest.filePath) === path.resolve(filePath)) {
    return { deleted: false, reason: 'newest_backup_protected' };
  }
  const match = backups.find(row => path.resolve(row.filePath) === path.resolve(filePath));
  if (!match) return { deleted: false, reason: 'not_found' };
  fs.unlinkSync(match.filePath);
  return { deleted: true, fileName: match.fileName };
}

function emergencyExport(options = {}) {
  const db = options.db ? clone(options.db) : safeReadJson(dataFilePath(options));
  if (!db) throw new Error('No database found to export.');
  const validation = validateBackup(db);
  if (!validation.valid) throw new Error(`Current database cannot be exported: ${validation.reason}`);
  return JSON.stringify(db, null, 2);
}

module.exports = {
  MAX_BACKUPS,
  backupDir,
  createBackup,
  deleteBackup,
  emergencyExport,
  getBackupInfo,
  listBackups,
  restoreBackup,
  validateBackup,
  pruneBackups,
};
