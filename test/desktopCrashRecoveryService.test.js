const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  clearPendingRecovery,
  markCleanShutdown,
  markDesktopStartup,
  pendingRecovery,
  recordDesktopState,
  restorePreviousMeet,
} = require('../services/desktopCrashRecoveryService');

function tempStateFile() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssm-crash-recovery-test-'));
  return path.join(root, 'recovery.json');
}

function sampleDb() {
  return {
    users: [],
    rinks: [],
    meets: [{
      id: 'meet_1',
      meetName: 'Alpha Regional',
      date: '2026-06-22',
      currentRaceId: 'race_heat_1',
      currentRaceIndex: 2,
      raceDayPaused: false,
      blocks: [{ id: 'block_1', raceIds: ['race_heat_1', 'race_final'] }],
      races: [{
        id: 'race_heat_1',
        groupLabel: 'Senior Men',
        distanceLabel: '500m',
        isHeat: true,
        status: 'closed',
        laneEntries: [{ lane: 1, skaterName: 'Skater One', place: '1' }],
      }, {
        id: 'race_final',
        groupLabel: 'Senior Men',
        distanceLabel: '500m',
        isFinal: true,
        status: 'open',
        sourceHeatIds: ['race_heat_1'],
        laneEntries: [{ lane: 1, skaterName: 'Skater One' }],
      }],
    }],
  };
}

test('detects unexpected shutdown and preserves previous meet snapshot', () => {
  const stateFile = tempStateFile();
  const db = sampleDb();

  recordDesktopState(db, { stateFile, force: true, meetId: 'meet_1' });
  const startup = markDesktopStartup({ stateFile, processId: 123 });

  assert.equal(startup.unexpected, true);
  assert.equal(startup.snapshot.currentMeetId, 'meet_1');
  assert.equal(startup.snapshot.raceState.currentRaceIndex, 2);
  assert.equal(startup.snapshot.raceState.currentRaceId, 'race_heat_1');
  assert.equal(startup.snapshot.tabulatorState.resultRaceCount, 1);
  assert.equal(startup.snapshot.generatedHeats.length, 2);
});

test('clean shutdown does not create pending recovery', () => {
  const stateFile = tempStateFile();

  recordDesktopState(sampleDb(), { stateFile, force: true, meetId: 'meet_1' });
  markCleanShutdown({ stateFile });
  const startup = markDesktopStartup({ stateFile, processId: 456 });

  assert.equal(startup.unexpected, false);
  assert.equal(pendingRecovery({ stateFile }), null);
});

test('restores previous meet snapshot offline and clears pending recovery', () => {
  const stateFile = tempStateFile();
  const db = sampleDb();

  recordDesktopState(db, { stateFile, force: true, meetId: 'meet_1' });
  markDesktopStartup({ stateFile });

  const damaged = sampleDb();
  damaged.meets[0].currentRaceId = '';
  damaged.meets[0].currentRaceIndex = -1;
  damaged.meets[0].races = [];

  const result = restorePreviousMeet(damaged, { stateFile });
  assert.equal(result.restored, true);
  assert.equal(damaged.meets[0].currentRaceId, 'race_heat_1');
  assert.equal(damaged.meets[0].currentRaceIndex, 2);
  assert.equal(damaged.meets[0].races.length, 2);
  assert.equal(pendingRecovery({ stateFile }), null);
});

test('can clear pending recovery without changing the database', () => {
  const stateFile = tempStateFile();

  recordDesktopState(sampleDb(), { stateFile, force: true, meetId: 'meet_1' });
  markDesktopStartup({ stateFile });
  assert.ok(pendingRecovery({ stateFile }));

  clearPendingRecovery({ stateFile });
  assert.equal(pendingRecovery({ stateFile }), null);
});
