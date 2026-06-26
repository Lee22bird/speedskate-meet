const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { safeReadJson, writeJsonAtomic } = require('../utils/db');

const MAX_BACKUPS = 30;
const BACKUP_PREFIX = 'ssm-backup-';
const ZIP_BACKUP_SUFFIX = '.zip';
const JSON_BACKUP_SUFFIX = '.json.gz';
const SQLITE_BACKUP_SUFFIX = '.sqlite.gz';
const LEGACY_JSON_SUFFIX = '.json';
const SQLITE_HEADER = 'SQLite format 3\0';

let dailyBackupTimer = null;
let crcTable = null;

function dataFilePath(options = {}) {
  return String(options.dataFile || process.env.SSM_DATA_FILE || path.join(process.cwd(), 'ssm_db.json'));
}

function sqliteFilePath(options = {}) {
  return String(options.sqliteFile || process.env.SSM_SQLITE_FILE || '').trim();
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

function backupFileName(date = new Date(), sourceType = 'json') {
  if (sourceType === 'legacy_json') return `${BACKUP_PREFIX}${timestampForFile(date)}${JSON_BACKUP_SUFFIX}`;
  if (sourceType === 'legacy_sqlite') return `${BACKUP_PREFIX}${timestampForFile(date)}${SQLITE_BACKUP_SUFFIX}`;
  return `${BACKUP_PREFIX}${timestampForFile(date)}${ZIP_BACKUP_SUFFIX}`;
}

function uniqueBackupPath(dir, baseDate = new Date(), sourceType = 'json') {
  for (let i = 0; i < 120; i += 1) {
    const candidateDate = new Date(baseDate.getTime() + i * 1000);
    const candidate = path.join(dir, backupFileName(candidateDate, sourceType));
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not create a unique backup filename.');
}

function writeBufferAtomic(filePath, buffer) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, filePath);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function countRegistrations(db) {
  return (Array.isArray(db?.meets) ? db.meets : []).reduce((sum, meet) => sum + (Array.isArray(meet.registrations) ? meet.registrations.length : 0), 0);
}

function raceCounts(meet) {
  const races = Array.isArray(meet?.races) ? meet.races : [];
  return {
    raceCount: races.length,
    laneEntryCount: races.reduce((sum, race) => sum + (Array.isArray(race.laneEntries) ? race.laneEntries.length : 0), 0),
    resultCount: races.reduce((sum, race) => sum + (Array.isArray(race.laneEntries) ? race.laneEntries.filter(entry => String(entry.place || entry.time || entry.status || '').trim()).length : 0), 0),
    timeTrialCount: races.filter(race => race.isTimeTrial || String(race.resultsMode || '') === 'times').length,
  };
}

function activeMeetForBackup(db, options = {}) {
  const meets = Array.isArray(db?.meets) ? db.meets : [];
  const requestedId = String(options.meetId || db?.desktopRecovery?.currentMeetId || '').trim();
  if (requestedId) {
    const match = meets.find(meet => String(meet.id) === requestedId);
    if (match) return match;
  }
  const active = meets.filter(meet =>
    String(meet.currentRaceId || '').trim() ||
    String(meet.status || '').toLowerCase() === 'live' ||
    meet.raceDayPaused === false
  );
  return (active.length ? active : meets)
    .filter(meet => !meet.archivedAt)
    .sort((a, b) => new Date(b.updatedAt || b.date || 0) - new Date(a.updatedAt || a.date || 0))[0] || null;
}

function backupManifestForDb(db, options = {}) {
  const meet = activeMeetForBackup(db, options);
  const counts = raceCounts(meet);
  return {
    app: 'SpeedSkateMeet',
    kind: 'desktop_backup',
    format: 'zip',
    source_type: 'json',
    reason: String(options.reason || 'manual'),
    created_at: (options.date || new Date()).toISOString(),
    version: db?.version || null,
    meet_id: meet ? String(meet.id || '') : '',
    meet_name: meet ? String(meet.meetName || 'Untitled Meet') : '',
    meet_date: meet ? String(meet.date || '') : '',
    meet_count: Array.isArray(db?.meets) ? db.meets.length : 0,
    registration_count: countRegistrations(db),
    block_count: Array.isArray(meet?.blocks) ? meet.blocks.length : 0,
    division_count: Array.isArray(meet?.groups) ? meet.groups.length : 0,
    race_count: counts.raceCount,
    lane_entry_count: counts.laneEntryCount,
    result_count: counts.resultCount,
    time_trial_count: counts.timeTrialCount,
    includes: [
      'meet',
      'registrations',
      'divisions',
      'blocks',
      'races',
      'lane entries',
      'results',
      'time trials',
      'settings',
    ],
  };
}

function backupPayload(db, options = {}) {
  const database = clone(db);
  return {
    backup_meta: {
      ...backupManifestForDb(database, options),
      kind: 'desktop_database_backup',
      compressed: true,
    },
    database,
  };
}

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimeDate(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function zipEntries(entries, date = new Date()) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { dosTime, dosDate } = dosTimeDate(date);

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data || ''), 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + compressed.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

function unzipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const compressed = buffer.subarray(dataStart, dataEnd);
    const data = method === 8 ? zlib.inflateRawSync(compressed) : compressed;
    if (data.length !== uncompressedSize) throw new Error(`Invalid zip entry size for ${name}.`);
    entries.set(name, data);
    offset = dataEnd;
  }
  return entries;
}

function unwrapBackup(raw) {
  if (raw && typeof raw === 'object' && raw.database && typeof raw.database === 'object') return raw.database;
  return raw;
}

function validateBackup(input) {
  let raw = input;
  if (Buffer.isBuffer(input)) raw = input.toString('utf8');
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
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
      backupReason: raw?.backup_meta?.reason || '',
      manifest: raw?.backup_meta || null,
    },
  };
}

function validateSqliteBackup(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || '');
  if (buffer.length < SQLITE_HEADER.length) return { valid: false, reason: 'invalid_sqlite_header' };
  const header = buffer.subarray(0, SQLITE_HEADER.length).toString('binary');
  if (header !== SQLITE_HEADER) return { valid: false, reason: 'invalid_sqlite_header' };
  return {
    valid: true,
    reason: 'ok',
    info: {
      meetCount: 0,
      registrationCount: 0,
      version: null,
      backupDate: '',
    },
  };
}

function isZipBackup(filePath) {
  return String(filePath || '').endsWith(ZIP_BACKUP_SUFFIX);
}

function backupSourceTypeForFile(filePath) {
  if (String(filePath || '').endsWith(SQLITE_BACKUP_SUFFIX)) return 'sqlite';
  return 'json';
}

function isBackupFileName(name) {
  return name.startsWith(BACKUP_PREFIX) && (
    name.endsWith(ZIP_BACKUP_SUFFIX) ||
    name.endsWith(JSON_BACKUP_SUFFIX) ||
    name.endsWith(SQLITE_BACKUP_SUFFIX) ||
    name.endsWith(LEGACY_JSON_SUFFIX)
  );
}

function readLegacyBackupFile(filePath) {
  if (String(filePath || '').endsWith('.gz')) return zlib.gunzipSync(fs.readFileSync(filePath));
  return fs.readFileSync(filePath);
}

function readZipBackup(filePath) {
  const entries = unzipEntries(fs.readFileSync(filePath));
  const manifest = entries.has('manifest.json') ? JSON.parse(entries.get('manifest.json').toString('utf8')) : {};
  if (entries.has('database.json')) {
    return {
      sourceType: 'json',
      manifest,
      raw: entries.get('database.json'),
      validation: validateBackup(entries.get('database.json')),
    };
  }
  if (entries.has('database.sqlite')) {
    return {
      sourceType: 'sqlite',
      manifest,
      raw: entries.get('database.sqlite'),
      validation: validateSqliteBackup(entries.get('database.sqlite')),
    };
  }
  return {
    sourceType: manifest.source_type || 'json',
    manifest,
    raw: Buffer.alloc(0),
    validation: { valid: false, reason: 'missing_database_payload' },
  };
}

function getBackupInfo(filePath) {
  const stat = fs.statSync(filePath);
  if (isZipBackup(filePath)) {
    const zip = readZipBackup(filePath);
    return {
      fileName: path.basename(filePath),
      filePath,
      sourceType: zip.sourceType,
      compressed: true,
      size: stat.size,
      createdAt: zip.manifest.created_at || stat.mtime.toISOString(),
      reason: zip.manifest.reason || '',
      valid: zip.validation.valid,
      reasonInvalid: zip.validation.valid ? '' : zip.validation.reason,
      meetId: zip.manifest.meet_id || '',
      meetName: zip.manifest.meet_name || '',
      meetDate: zip.manifest.meet_date || '',
      meetCount: zip.validation.info?.meetCount || zip.manifest.meet_count || 0,
      registrationCount: zip.validation.info?.registrationCount || zip.manifest.registration_count || 0,
      blockCount: zip.manifest.block_count || 0,
      divisionCount: zip.manifest.division_count || 0,
      raceCount: zip.manifest.race_count || 0,
      laneEntryCount: zip.manifest.lane_entry_count || 0,
      resultCount: zip.manifest.result_count || 0,
      timeTrialCount: zip.manifest.time_trial_count || 0,
      version: zip.validation.info?.version || zip.manifest.version || null,
      mtimeMs: stat.mtimeMs,
    };
  }

  const sourceType = backupSourceTypeForFile(filePath);
  const raw = readLegacyBackupFile(filePath);
  const validation = sourceType === 'sqlite' ? validateSqliteBackup(raw) : validateBackup(raw);
  let meta = {};
  if (sourceType === 'json' && validation.valid) {
    try {
      const parsed = JSON.parse(raw.toString('utf8'));
      meta = parsed?.backup_meta || {};
    } catch (err) {
      meta = {};
    }
  }
  return {
    fileName: path.basename(filePath),
    filePath,
    sourceType,
    compressed: String(filePath || '').endsWith('.gz'),
    size: stat.size,
    createdAt: meta.created_at || validation.info?.backupDate || stat.mtime.toISOString(),
    reason: meta.reason || validation.info?.backupReason || '',
    valid: validation.valid,
    reasonInvalid: validation.valid ? '' : validation.reason,
    meetId: meta.meet_id || '',
    meetName: meta.meet_name || '',
    meetDate: meta.meet_date || '',
    meetCount: validation.info?.meetCount || 0,
    registrationCount: validation.info?.registrationCount || 0,
    blockCount: meta.block_count || 0,
    divisionCount: meta.division_count || 0,
    raceCount: meta.race_count || 0,
    laneEntryCount: meta.lane_entry_count || 0,
    resultCount: meta.result_count || 0,
    timeTrialCount: meta.time_trial_count || 0,
    version: validation.info?.version || null,
    mtimeMs: stat.mtimeMs,
  };
}

function listBackups(options = {}) {
  const dir = ensureBackupDir(options);
  return fs.readdirSync(dir)
    .filter(isBackupFileName)
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
  const keepByMeet = new Set();
  for (const backup of backups) {
    const key = String(backup.meetId || '').trim();
    if (key && !keepByMeet.has(key)) {
      keepByMeet.add(key);
      protectedFiles.add(path.resolve(backup.filePath));
    }
  }
  const deletable = backups.slice(keep).filter(row => !protectedFiles.has(path.resolve(row.filePath)));
  for (const backup of deletable) fs.unlinkSync(backup.filePath);
  return { deleted: deletable.length, kept: listBackups(options).length };
}

function shouldUseSqliteBackup(options = {}) {
  if (options.sourceType === 'json') return false;
  if (options.sourceType === 'sqlite') return true;
  if (options.db) return false;
  const sqliteFile = sqliteFilePath(options);
  return !!sqliteFile && fs.existsSync(sqliteFile);
}

function createJsonBackup(options = {}) {
  const file = dataFilePath(options);
  const db = options.db ? clone(options.db) : safeReadJson(file);
  if (!db) throw new Error('No database found to back up.');
  const validation = validateBackup(db);
  if (!validation.valid) throw new Error(`Current database is not safe to back up: ${validation.reason}`);

  const manifest = backupManifestForDb(db, options);
  const dir = ensureBackupDir(options);
  const target = uniqueBackupPath(dir, options.date || new Date(), 'json');
  const zip = zipEntries([
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    { name: 'database.json', data: JSON.stringify(backupPayload(db, options), null, 2) },
  ], options.date || new Date());
  writeBufferAtomic(target, zip);
  pruneBackups({ ...options, keepFile: target, protectFiles: [...(options.protectFiles || []), target] });
  return getBackupInfo(target);
}

function createSqliteBackup(options = {}) {
  const file = sqliteFilePath(options);
  if (!file) throw new Error('No SQLite database file is configured.');
  if (!fs.existsSync(file)) throw new Error('SQLite database file was not found.');
  const raw = fs.readFileSync(file);
  const validation = validateSqliteBackup(raw);
  if (!validation.valid) throw new Error(`Current SQLite database is not safe to back up: ${validation.reason}`);

  const manifest = {
    app: 'SpeedSkateMeet',
    kind: 'desktop_backup',
    format: 'zip',
    source_type: 'sqlite',
    reason: String(options.reason || 'manual'),
    created_at: (options.date || new Date()).toISOString(),
    meet_id: String(options.meetId || ''),
    meet_name: String(options.meetName || ''),
    meet_date: String(options.meetDate || ''),
    includes: ['settings', 'sqlite database'],
  };
  const dir = ensureBackupDir(options);
  const target = uniqueBackupPath(dir, options.date || new Date(), 'sqlite');
  const zip = zipEntries([
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    { name: 'database.sqlite', data: raw },
  ], options.date || new Date());
  writeBufferAtomic(target, zip);
  pruneBackups({ ...options, keepFile: target, protectFiles: [...(options.protectFiles || []), target] });
  return getBackupInfo(target);
}

function createBackup(options = {}) {
  return shouldUseSqliteBackup(options) ? createSqliteBackup(options) : createJsonBackup(options);
}

function restoreBackup(filePath, options = {}) {
  let sourceType;
  let raw;
  let validation;
  if (isZipBackup(filePath)) {
    const zip = readZipBackup(filePath);
    sourceType = zip.sourceType;
    raw = zip.raw;
    validation = zip.validation;
  } else {
    sourceType = backupSourceTypeForFile(filePath);
    raw = readLegacyBackupFile(filePath);
    validation = sourceType === 'sqlite' ? validateSqliteBackup(raw) : validateBackup(raw);
  }

  if (sourceType === 'sqlite') {
    if (!validation.valid) throw new Error(`Invalid backup: ${validation.reason}`);
    const target = sqliteFilePath(options);
    if (!target) throw new Error('No SQLite database file is configured for restore.');
    let restorePoint = null;
    if (fs.existsSync(target)) {
      restorePoint = createBackup({ ...options, sourceType: 'sqlite', reason: 'before_restore', protectFiles: [filePath, ...(options.protectFiles || [])] });
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    writeBufferAtomic(target, raw);
    return { restored: true, restoredFrom: getBackupInfo(filePath), restorePoint };
  }

  const target = dataFilePath(options);
  if (!validation.valid) throw new Error(`Invalid backup: ${validation.reason}`);
  const restorePoint = createBackup({ ...options, sourceType: 'json', reason: 'before_restore', protectFiles: [filePath, ...(options.protectFiles || [])] });
  writeJsonAtomic(target, validation.database);
  return { restored: true, restoredFrom: getBackupInfo(filePath), restorePoint };
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
  const latestForMeet = match.meetId && !backups.some(row =>
    row.filePath !== match.filePath &&
    String(row.meetId || '') === String(match.meetId || '') &&
    row.mtimeMs > match.mtimeMs
  );
  if (latestForMeet) return { deleted: false, reason: 'latest_meet_backup_protected' };
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

function isSameLocalDate(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function createDailyBackup(options = {}) {
  const now = options.date || new Date();
  const sourceType = shouldUseSqliteBackup(options) ? 'sqlite' : 'json';
  const db = options.db || (!shouldUseSqliteBackup(options) ? safeReadJson(dataFilePath(options)) : null);
  const activeMeet = db ? activeMeetForBackup(db, options) : null;
  if (sourceType === 'json' && !activeMeet) return { skipped: true, reason: 'no_active_meet' };
  const meetId = activeMeet ? String(activeMeet.id || '') : String(options.meetId || '');
  const existing = listBackups(options).find(backup =>
    (backup.reason === 'daily' || (sourceType === 'sqlite' && backup.sourceType === 'sqlite')) &&
    (!meetId || String(backup.meetId || '') === meetId) &&
    isSameLocalDate(new Date(backup.createdAt), now)
  );
  if (existing) return { skipped: true, backup: existing };
  return { skipped: false, backup: createBackup({ ...options, db, meetId, reason: 'daily', date: now }) };
}

function scheduleDailyBackups(options = {}) {
  if (dailyBackupTimer) return dailyBackupTimer;
  const intervalMs = Number(options.intervalMs || 24 * 60 * 60 * 1000);
  dailyBackupTimer = setInterval(() => {
    try {
      createDailyBackup(options);
    } catch (err) {
      if (typeof options.logger === 'function') options.logger(`Daily desktop backup skipped: ${err.message}`);
      else console.warn('Daily desktop backup skipped:', err.message);
    }
  }, intervalMs);
  if (typeof dailyBackupTimer.unref === 'function') dailyBackupTimer.unref();
  return dailyBackupTimer;
}

module.exports = {
  MAX_BACKUPS,
  backupDir,
  createBackup,
  createDailyBackup,
  deleteBackup,
  emergencyExport,
  getBackupInfo,
  listBackups,
  restoreBackup,
  scheduleDailyBackups,
  validateBackup,
  validateSqliteBackup,
  pruneBackups,
};
