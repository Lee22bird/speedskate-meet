const fs = require('fs');
const os = require('os');
const path = require('path');
const { nowIso } = require('../utils/date');

const STATE_FILE = 'desktop-crash-recovery.json';

function defaultDesktopDataDir() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'SpeedSkateMeet');
}

function stateFilePath(options = {}) {
  return String(options.stateFile || process.env.SSM_CRASH_STATE_FILE || path.join(defaultDesktopDataDir(), STATE_FILE));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function readState(options = {}) {
  try {
    const file = stateFilePath(options);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) || null;
  } catch (err) {
    return null;
  }
}

function writeState(state, options = {}) {
  const file = stateFilePath(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return state;
}

function activeMeetForRecovery(db, options = {}) {
  const meets = Array.isArray(db?.meets) ? db.meets : [];
  const requestedId = String(options.meetId || db?.desktopRecovery?.currentMeetId || '').trim();
  if (requestedId) {
    const match = meets.find(meet => String(meet.id) === requestedId);
    if (match) return match;
  }
  const withCurrentRace = meets.filter(meet => String(meet.currentRaceId || '').trim());
  if (withCurrentRace.length) {
    return withCurrentRace.sort((a, b) => new Date(b.updatedAt || b.date || 0) - new Date(a.updatedAt || a.date || 0))[0];
  }
  return meets.sort((a, b) => new Date(b.updatedAt || b.date || 0) - new Date(a.updatedAt || a.date || 0))[0] || null;
}

function raceStateForMeet(meet) {
  if (!meet) return null;
  const races = Array.isArray(meet.races) ? meet.races : [];
  const currentRace = races.find(race => String(race.id) === String(meet.currentRaceId || '')) || null;
  return {
    currentMeetId: String(meet.id || ''),
    currentMeetName: String(meet.meetName || ''),
    currentRaceId: String(meet.currentRaceId || ''),
    currentRaceIndex: Number.isFinite(Number(meet.currentRaceIndex)) ? Number(meet.currentRaceIndex) : -1,
    raceDayPaused: !!meet.raceDayPaused,
    currentRace: currentRace ? clone(currentRace) : null,
    raceStatuses: races.map(race => ({
      id: String(race.id || ''),
      label: String(race.groupLabel || race.divisionLabel || race.division || race.name || ''),
      distance: String(race.distanceLabel || race.distance || ''),
      status: String(race.status || ''),
      laneEntryCount: Array.isArray(race.laneEntries) ? race.laneEntries.length : 0,
      isHeat: !!race.isHeat,
      isFinal: !!race.isFinal,
      isRelayRace: !!race.isRelayRace,
      isTimeTrial: !!race.isTimeTrial,
    })),
  };
}

function tabulatorStateForMeet(meet) {
  const races = Array.isArray(meet?.races) ? meet.races : [];
  return {
    closedRaceCount: races.filter(race => String(race.status || '') === 'closed').length,
    openRaceCount: races.filter(race => String(race.status || '') !== 'closed').length,
    resultRaceCount: races.filter(race => Array.isArray(race.laneEntries) && race.laneEntries.some(entry => String(entry.place || entry.time || entry.status || '').trim())).length,
  };
}

function generatedHeatsForMeet(meet) {
  return (Array.isArray(meet?.races) ? meet.races : [])
    .filter(race => race && (race.isHeat || race.isFinal || race.sourceHeatIds || race.advancementRule))
    .map(race => clone(race));
}

function recoverySnapshot(db, options = {}) {
  const meet = activeMeetForRecovery(db, options);
  if (!meet) return null;
  return {
    capturedAt: nowIso(),
    currentMeetId: String(meet.id || ''),
    currentMeetName: String(meet.meetName || ''),
    meetDate: String(meet.date || ''),
    raceState: raceStateForMeet(meet),
    tabulatorState: tabulatorStateForMeet(meet),
    generatedHeats: generatedHeatsForMeet(meet),
    meetSnapshot: clone(meet),
  };
}

function markDesktopStartup(options = {}) {
  const previous = readState(options);
  const previousUnexpected = previous &&
    previous.status === 'running' &&
    previous.cleanShutdown !== true &&
    previous.lastSnapshot;
  const state = {
    ...(previous || {}),
    status: 'running',
    cleanShutdown: false,
    startedAt: nowIso(),
    processId: options.processId || process.pid,
  };
  if (previousUnexpected && !previous.lastUnexpectedShutdown) {
    state.lastUnexpectedShutdown = previous.lastSnapshot;
    state.detectedAt = nowIso();
  }
  writeState(state, options);
  return {
    unexpected: !!state.lastUnexpectedShutdown,
    snapshot: state.lastUnexpectedShutdown || null,
  };
}

function recordDesktopState(db, options = {}) {
  if (process.env.SSM_DESKTOP !== '1' && !options.force) return null;
  const snapshot = recoverySnapshot(db, options);
  const existing = readState(options) || {};
  const state = {
    ...existing,
    status: 'running',
    cleanShutdown: false,
    startedAt: existing.startedAt || nowIso(),
    updatedAt: nowIso(),
    lastSnapshot: snapshot,
  };
  return writeState(state, options);
}

function markCleanShutdown(options = {}) {
  const existing = readState(options) || {};
  return writeState({
    ...existing,
    status: 'clean',
    cleanShutdown: true,
    shutdownAt: nowIso(),
  }, options);
}

function pendingRecovery(options = {}) {
  const state = readState(options);
  return state?.lastUnexpectedShutdown || null;
}

function clearPendingRecovery(options = {}) {
  const state = readState(options) || {};
  delete state.lastUnexpectedShutdown;
  delete state.detectedAt;
  return writeState({
    ...state,
    recoveryResolvedAt: nowIso(),
  }, options);
}

function restorePreviousMeet(db, options = {}) {
  const snapshot = options.snapshot || pendingRecovery(options);
  const meetSnapshot = snapshot?.meetSnapshot;
  if (!meetSnapshot || !meetSnapshot.id) throw new Error('No previous meet snapshot is available.');
  if (!Array.isArray(db.meets)) db.meets = [];
  const index = db.meets.findIndex(meet => String(meet.id) === String(meetSnapshot.id));
  if (index >= 0) db.meets[index] = clone(meetSnapshot);
  else db.meets.push(clone(meetSnapshot));
  db.desktopRecovery = {
    ...(db.desktopRecovery || {}),
    currentMeetId: String(meetSnapshot.id || ''),
    restoredAt: nowIso(),
  };
  clearPendingRecovery(options);
  return {
    restored: true,
    meetId: String(meetSnapshot.id || ''),
    meetName: String(meetSnapshot.meetName || ''),
  };
}

module.exports = {
  activeMeetForRecovery,
  clearPendingRecovery,
  markCleanShutdown,
  markDesktopStartup,
  pendingRecovery,
  recordDesktopState,
  recoverySnapshot,
  restorePreviousMeet,
  stateFilePath,
};
