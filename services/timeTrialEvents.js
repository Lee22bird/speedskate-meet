const crypto = require('crypto');
const { nowIso } = require('../utils/date');
const { ageForReg } = require('./meetHelpers');
const { avatarUrlFromSources } = require('./avatarDisplay');

function genderBucket(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['girls', 'girl', 'women', 'woman', 'female', 'ladies', 'lady', 'f'].includes(v)) return 'female';
  if (['boys', 'boy', 'men', 'man', 'male', 'm'].includes(v)) return 'male';
  return '';
}

function timeNumber(value) {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function timeTrialEventTitle(event) {
  const distance = String(event?.distance || '100m').trim() || '100m';
  return `${distance} Time Trials`;
}

function normalizeTimeTrialSettings(meet) {
  if (!meet) return null;
  const existingEnabledEvent = Array.isArray(meet.timeTrialEvents)
    ? meet.timeTrialEvents.some(event => event && event.type === 'time_trial_event' && event.enabled !== false)
    : false;
  meet.timeTrialEvent = meet.timeTrialEvent || {};
  meet.timeTrialEvent.enabled = !!meet.timeTrialEvent.enabled || !!meet.timeTrialsEnabled || existingEnabledEvent;
  meet.timeTrialEvent.distance = String(meet.timeTrialEvent.distance || '100m').trim() || '100m';
  meet.timeTrialEvent.runOrder = 'youngest_oldest';
  meet.timeTrialEvent.countsForOverall = !!meet.timeTrialEvent.countsForOverall;
  if (!Array.isArray(meet.timeTrialEvents)) meet.timeTrialEvents = [];
  return meet.timeTrialEvent;
}

function timeTrialEventAvailable(meet) {
  const settings = normalizeTimeTrialSettings(meet);
  return !!settings?.enabled;
}

function registrationSelectedForTimeTrial(reg, event) {
  if (!reg) return false;
  const opts = reg.options || {};
  const eventId = String(event?.id || '').trim();
  const ids = []
    .concat(Array.isArray(reg.timeTrialEventIds) ? reg.timeTrialEventIds : [])
    .concat(Array.isArray(opts.timeTrialEventIds) ? opts.timeTrialEventIds : [])
    .map(value => String(value || '').trim())
    .filter(Boolean);

  if (eventId && ids.includes(eventId)) return true;
  return !!(reg.timeTrials || opts.timeTrials);
}

function queueFromRegistrations(meet, event) {
  const existing = new Map((event?.participants || []).map(row => [String(row.registrationId || ''), row]));
  return (meet.registrations || [])
    .filter(reg => registrationSelectedForTimeTrial(reg, event))
    .map(reg => {
      const previous = existing.get(String(reg.id || '')) || {};
      const age = ageForReg(reg, meet);
      return {
        registrationId: String(reg.id || ''),
        skater: String(reg.name || '').trim(),
        team: String(reg.team || '').trim(),
        gender: String(reg.gender || '').trim(),
        age,
        ageGroup: String(reg.divisionGroupLabel || reg.ageGroup || '').trim(),
        helmetNumber: String(reg.helmetNumber || '').trim(),
        avatar_url: avatarUrlFromSources(previous, reg),
        profile_photo_url: String(previous.profile_photo_url || reg.profile_photo_url || '').trim(),
        photo_url: String(previous.photo_url || reg.photo_url || '').trim(),
        time: String(previous.time || '').trim(),
        recordedAt: previous.recordedAt || '',
        recordedByUserId: previous.recordedByUserId || '',
      };
    })
    .filter(row => row.registrationId && row.skater)
    .sort((a, b) =>
      Number(a.age || 999) - Number(b.age || 999) ||
      String(a.skater || '').localeCompare(String(b.skater || ''))
    );
}

function ensureTimeTrialEvent(meet) {
  const settings = normalizeTimeTrialSettings(meet);
  if (!settings.enabled) return null;
  let event = meet.timeTrialEvents.find(row => row.type === 'time_trial_event');
  if (!event) {
    event = {
      id: `tte_${crypto.randomBytes(6).toString('hex')}`,
      type: 'time_trial_event',
      enabled: true,
      distance: settings.distance,
      runOrder: settings.runOrder,
      countsForOverall: settings.countsForOverall,
      currentIndex: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      participants: [],
    };
    meet.timeTrialEvents.push(event);
  }
  event.enabled = true;
  event.distance = settings.distance;
  event.runOrder = settings.runOrder;
  event.countsForOverall = settings.countsForOverall;
  event.title = timeTrialEventTitle(event);
  event.participants = queueFromRegistrations(meet, event);
  if (Number(event.currentIndex || 0) >= event.participants.length) {
    event.currentIndex = Math.max(0, event.participants.length - 1);
  }
  event.updatedAt = nowIso();
  return event;
}

function timeTrialEventForMeet(meet, eventId = '') {
  normalizeTimeTrialSettings(meet);
  const enabled = ensureTimeTrialEvent(meet);
  if (!eventId) return enabled;
  return (meet.timeTrialEvents || []).find(event => String(event.id || '') === String(eventId || '')) || null;
}

function timeTrialResults(event) {
  const rows = (event?.participants || [])
    .map(row => ({ ...row, numericTime: timeNumber(row.time), genderBucket: genderBucket(row.gender) }))
    .filter(row => row.numericTime != null)
    .sort((a, b) => a.numericTime - b.numericTime || String(a.skater).localeCompare(String(b.skater)));
  return {
    overall: rows.map((row, index) => ({ ...row, rank: index + 1 })),
    male: rows.filter(row => row.genderBucket === 'male').map((row, index) => ({ ...row, rank: index + 1 })),
    female: rows.filter(row => row.genderBucket === 'female').map((row, index) => ({ ...row, rank: index + 1 })),
  };
}

function timeTrialEventIsComplete(event) {
  const status = String(event?.status || '').trim().toLowerCase();
  return !!(event && (event.finalized || status === 'closed' || status === 'complete' || status === 'completed'));
}

function completedTimeTrialEvents(meet) {
  return (Array.isArray(meet?.timeTrialEvents) ? meet.timeTrialEvents : [])
    .filter(event => event && event.type === 'time_trial_event' && event.enabled !== false)
    .filter(timeTrialEventIsComplete);
}

function timeTrialStats(event) {
  const total = (event?.participants || []).length;
  const completed = (event?.participants || []).filter(row => timeNumber(row.time) != null).length;
  return { total, completed, remaining: Math.max(0, total - completed) };
}

function saveTimeTrialTime(event, registrationId, time, userId) {
  const participant = (event?.participants || []).find(row => String(row.registrationId) === String(registrationId));
  if (!participant) throw new Error('Time Trial participant not found.');
  const n = timeNumber(time);
  if (n == null) throw new Error('Enter a valid time, like 10.42.');
  participant.time = n.toFixed(2);
  participant.recordedAt = nowIso();
  participant.recordedByUserId = userId == null ? '' : String(userId);
  const idx = event.participants.findIndex(row => String(row.registrationId) === String(registrationId));
  event.currentIndex = Math.min(event.participants.length - 1, Math.max(0, idx + 1));
  event.updatedAt = nowIso();
  return participant;
}

module.exports = {
  normalizeTimeTrialSettings,
  ensureTimeTrialEvent,
  timeTrialEventForMeet,
  timeTrialEventTitle,
  timeTrialEventAvailable,
  registrationSelectedForTimeTrial,
  timeTrialEventIsComplete,
  completedTimeTrialEvents,
  timeTrialResults,
  timeTrialStats,
  saveTimeTrialTime,
  timeNumber,
};
