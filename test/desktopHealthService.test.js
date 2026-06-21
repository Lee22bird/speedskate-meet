const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildHealthReport,
  databaseStats,
  meetPinStatus,
  runDiagnostics,
  validateDatabase,
} = require('../services/desktopHealthService');
const { writeJsonAtomic } = require('../utils/db');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ssm-health-test-'));
}

function sampleDb() {
  return {
    version: 19,
    users: [{ id: 1, username: 'admin' }],
    rinks: [{ id: 1, name: 'Roller City' }],
    desktopLicenses: [],
    meets: [
      {
        id: 1,
        meetName: 'Protected Meet',
        desktop_pin_hash: 'hash',
        registrations: [{ id: 1, name: 'Skater One' }],
        races: [{ id: 'r1', laneEntries: [{ lane: 1, place: '1', time: '12.345' }] }],
      },
      {
        id: 2,
        meetName: 'Unprotected Meet',
        registrations: [],
        races: [],
      },
    ],
  };
}

test('validates desktop database shape', () => {
  assert.equal(validateDatabase(sampleDb()).valid, true);
  assert.equal(validateDatabase({ users: [], rinks: [] }).valid, false);
  assert.equal(validateDatabase({ users: [], rinks: [] }).reason, 'missing_meets');
});

test('calculates database stats and record counts', () => {
  const root = tempRoot();
  const dataFile = path.join(root, 'ssm_db.json');
  const db = sampleDb();
  writeJsonAtomic(dataFile, db);

  const stats = databaseStats(db, { dataFile });
  assert.equal(stats.validation.valid, true);
  assert.equal(stats.counts.meets, 2);
  assert.equal(stats.counts.registrations, 1);
  assert.equal(stats.counts.races, 1);
  assert.equal(stats.counts.results, 1);
  assert.ok(stats.sizeBytes > 0);
});

test('calculates meet PIN protection status', () => {
  const status = meetPinStatus(sampleDb());
  assert.equal(status.totalMeets, 2);
  assert.equal(status.protectedMeets, 1);
  assert.equal(status.unprotectedMeets, 1);
  assert.equal(status.level, 'warning');
});

test('runs desktop diagnostics', () => {
  const root = tempRoot();
  const dataFile = path.join(root, 'ssm_db.json');
  const backupDir = path.join(root, 'backups');
  const checks = runDiagnostics(sampleDb(), { dataFile, backupDir });

  assert.equal(checks.some(check => check.name === 'Database readable' && check.status === 'pass'), true);
  assert.equal(checks.some(check => check.name === 'Backup folder writable' && check.status === 'pass'), true);
  assert.equal(checks.some(check => check.name === 'Desktop storage writable' && check.status === 'pass'), true);
  assert.equal(checks.some(check => check.name === 'Meet PIN service healthy' && check.status === 'pass'), true);
  assert.equal(checks.some(check => check.name === 'License service healthy' && check.status === 'pass'), true);
});

test('builds health report for support export', () => {
  const root = tempRoot();
  const dataFile = path.join(root, 'ssm_db.json');
  const backupDir = path.join(root, 'backups');
  writeJsonAtomic(dataFile, sampleDb());

  const report = buildHealthReport(sampleDb(), { dataFile, backupDir, startupTime: '2026-06-21T12:00:00.000Z' });
  assert.ok(report.generatedAt);
  assert.equal(report.database.counts.meets, 2);
  assert.equal(report.meetPins.unprotectedMeets, 1);
  assert.equal(Array.isArray(report.diagnostics.checks), true);
  assert.equal(report.license.status, 'Development Mode');
});
