const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createBackup,
  createDailyBackup,
  deleteBackup,
  emergencyExport,
  listBackups,
  restoreBackup,
  validateBackup,
  validateSqliteBackup,
} = require('../services/desktopBackupService');
const { writeJsonAtomic } = require('../utils/db');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ssm-backup-test-'));
}

function sampleDb(name = 'Alpha Meet') {
  return {
    version: 19,
    users: [{ id: 1, username: 'admin', roles: ['super_admin'] }],
    rinks: [{ id: 1, name: 'Roller City' }],
    meets: [{
      id: 1,
      meetName: name,
      date: '2026-06-22',
      currentRaceId: 'r1',
      currentRaceIndex: 0,
      registrations: [{ id: 1, name: 'Skater One' }],
      races: [{ id: 'r1', laneEntries: [{ lane: 1, skaterName: 'Skater One', place: '1' }] }],
      blocks: [{ id: 'b1', raceIds: ['r1'] }],
      groups: [{ id: 'g1', label: 'Primary' }],
    }],
    rosters: [],
    setupPresets: [],
    desktopLicenses: [],
  };
}

function paths() {
  const root = tempRoot();
  return {
    root,
    dataFile: path.join(root, 'ssm_db.json'),
    sqliteFile: path.join(root, 'ssm.sqlite'),
    backupDir: path.join(root, 'backups'),
  };
}

test('creates a complete desktop database backup', () => {
  const p = paths();
  writeJsonAtomic(p.dataFile, sampleDb());

  const backup = createBackup({ dataFile: p.dataFile, backupDir: p.backupDir, reason: 'test' });
  const backups = listBackups({ backupDir: p.backupDir });

  assert.match(backup.fileName, /^ssm-backup-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/);
  assert.equal(backup.compressed, true);
  assert.equal(backup.meetName, 'Alpha Meet');
  assert.equal(backups.length, 1);
  assert.equal(backups[0].meetCount, 1);
  assert.equal(backups[0].registrationCount, 1);
  assert.equal(backups[0].blockCount, 1);
  assert.equal(backups[0].raceCount, 1);
  assert.equal(backups[0].laneEntryCount, 1);
  assert.equal(backups[0].resultCount, 1);
});

test('validates backup JSON and rejects invalid backups', () => {
  const valid = validateBackup({ database: sampleDb() });
  assert.equal(valid.valid, true);
  assert.equal(valid.info.meetCount, 1);

  assert.equal(validateBackup('{bad json').reason, 'invalid_json');
  assert.equal(validateBackup({ users: [], rinks: [] }).reason, 'missing_meets');
  assert.equal(validateBackup({ users: [], rinks: [], meets: [{ meetName: 'Missing ID' }] }).reason, 'invalid_meet_record');
});

test('restores a backup after creating a restore-point backup', () => {
  const p = paths();
  writeJsonAtomic(p.dataFile, sampleDb('Original Meet'));
  const backup = createBackup({ dataFile: p.dataFile, backupDir: p.backupDir, reason: 'original' });
  writeJsonAtomic(p.dataFile, sampleDb('Damaged Meet'));

  const result = restoreBackup(backup.filePath, { dataFile: p.dataFile, backupDir: p.backupDir });
  const restored = JSON.parse(fs.readFileSync(p.dataFile, 'utf8'));
  const backups = listBackups({ backupDir: p.backupDir });

  assert.equal(result.restored, true);
  assert.equal(restored.meets[0].meetName, 'Original Meet');
  assert.equal(backups.length, 2);
  assert.equal(backups.some(row => row.reason === 'before_restore'), true);
});

test('prunes old backups while keeping the newest backups', () => {
  const p = paths();
  writeJsonAtomic(p.dataFile, sampleDb());

  for (let i = 0; i < 33; i += 1) {
    createBackup({
      dataFile: p.dataFile,
      backupDir: p.backupDir,
      reason: `backup_${i}`,
      date: new Date(Date.UTC(2026, 5, 21, 12, 0, i)),
    });
  }

  const backups = listBackups({ backupDir: p.backupDir });
  assert.equal(backups.length, 30);
  assert.equal(backups[0].reason, 'backup_32');
  assert.equal(backups.some(row => row.reason === 'backup_0'), false);
});

test('retention always keeps the latest backup for each meet', () => {
  const p = paths();
  const db = sampleDb();
  for (let i = 0; i < 35; i += 1) {
    const meetId = i === 0 ? 'special' : 'main';
    db.meets[0].id = meetId;
    db.meets[0].meetName = meetId === 'special' ? 'Special Meet' : 'Main Meet';
    db.meets[0].currentRaceId = 'r1';
    createBackup({
      db,
      meetId,
      backupDir: p.backupDir,
      reason: `backup_${i}`,
      date: new Date(Date.UTC(2026, 5, 21, 12, 0, i)),
    });
  }

  const backups = listBackups({ backupDir: p.backupDir });
  assert.equal(backups.length, 31);
  assert.equal(backups.some(row => row.meetName === 'Special Meet'), true);
});

test('creates one daily backup per local day', () => {
  const p = paths();
  writeJsonAtomic(p.dataFile, sampleDb());

  const first = createDailyBackup({
    dataFile: p.dataFile,
    backupDir: p.backupDir,
    date: new Date(2026, 5, 21, 8, 0, 0),
  });
  const second = createDailyBackup({
    dataFile: p.dataFile,
    backupDir: p.backupDir,
    date: new Date(2026, 5, 21, 18, 0, 0),
  });

  assert.equal(first.skipped, false);
  assert.equal(second.skipped, true);
  assert.equal(listBackups({ backupDir: p.backupDir }).length, 1);
});

test('creates, validates, and restores a compressed SQLite backup when configured', () => {
  const p = paths();
  const original = Buffer.concat([Buffer.from('SQLite format 3\0', 'binary'), Buffer.alloc(32, 1)]);
  const damaged = Buffer.concat([Buffer.from('SQLite format 3\0', 'binary'), Buffer.alloc(32, 2)]);
  fs.writeFileSync(p.sqliteFile, original);

  const backup = createBackup({
    sourceType: 'sqlite',
    sqliteFile: p.sqliteFile,
    backupDir: p.backupDir,
    reason: 'sqlite_test',
  });
  assert.match(backup.fileName, /^ssm-backup-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/);
  assert.equal(backup.sourceType, 'sqlite');
  assert.equal(backup.compressed, true);

  fs.writeFileSync(p.sqliteFile, damaged);
  const result = restoreBackup(backup.filePath, { sqliteFile: p.sqliteFile, backupDir: p.backupDir });
  assert.equal(result.restored, true);
  assert.deepEqual(fs.readFileSync(p.sqliteFile), original);
});

test('rejects invalid SQLite backups', () => {
  assert.equal(validateSqliteBackup(Buffer.from('not sqlite')).valid, false);
});

test('does not delete the newest backup manually', () => {
  const p = paths();
  writeJsonAtomic(p.dataFile, sampleDb());
  createBackup({ dataFile: p.dataFile, backupDir: p.backupDir, reason: 'first', date: new Date(Date.UTC(2026, 5, 21, 12, 0, 0)) });
  createBackup({ dataFile: p.dataFile, backupDir: p.backupDir, reason: 'newest', date: new Date(Date.UTC(2026, 5, 21, 12, 0, 1)) });
  const newest = listBackups({ backupDir: p.backupDir })[0];

  const result = deleteBackup(newest.filePath, { backupDir: p.backupDir });
  assert.equal(result.deleted, false);
  assert.equal(result.reason, 'newest_backup_protected');
});

test('emergency export returns a plain database JSON copy', () => {
  const p = paths();
  writeJsonAtomic(p.dataFile, sampleDb('Emergency Meet'));

  const exported = JSON.parse(emergencyExport({ dataFile: p.dataFile }));
  assert.equal(exported.meets[0].meetName, 'Emergency Meet');
  assert.equal(exported.backup_meta, undefined);
});
