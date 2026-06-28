'use strict';

const RACE_STATUS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'DNS', label: 'DNS (Did Not Start)' },
  { value: 'DNF', label: 'DNF (Did Not Finish)' },
  { value: 'Scratch', label: 'Scratch' },
  { value: 'DQ_FALSE_START', label: 'DQ – False Start', category: 'False Start' },
  { value: 'DQ_BODY_CONTACT', label: 'DQ – Body Contact', category: 'Body Contact' },
  { value: 'DQ_TRACK_CUT', label: 'DQ – Track Cut', category: 'Track Cut' },
  { value: 'DQ_PROFANITY', label: 'DQ – Profanity', category: 'Profanity' },
  { value: 'DQ_LOAFING', label: 'DQ – Loafing', category: 'Loafing' },
  { value: 'DQ_ILLEGAL_ASSISTANCE', label: 'DQ – Illegal Assistance', category: 'Illegal Assistance' },
  { value: 'DQ_DISTANCED', label: 'DQ – Distanced', category: 'Distanced' },
  { value: 'DQ_TEAM_FOUL', label: 'DQ – Team Foul', category: 'Team Foul' },
  { value: 'DQ_OTHER', label: 'DQ – Other', category: 'Other' },
];

const VALID_RACE_STATUSES = new Set([
  ...RACE_STATUS_OPTIONS.map(option => option.value),
  'DQ',
]);

const STATUS_BY_VALUE = new Map(RACE_STATUS_OPTIONS.map(option => [option.value, option]));

function normalizeRaceStatus(value) {
  return String(value || '').trim();
}

function isDisqualification(value) {
  const status = normalizeRaceStatus(value).toUpperCase();
  return status === 'DQ' || status.startsWith('DQ_');
}

function isValidRaceStatus(value) {
  return VALID_RACE_STATUSES.has(normalizeRaceStatus(value));
}

function raceStatusLabel(value) {
  const status = normalizeRaceStatus(value);
  if (!status) return '';
  if (status === 'DQ') return 'DQ';
  return STATUS_BY_VALUE.get(status)?.label || status;
}

function dqCategoryLabel(value) {
  const status = normalizeRaceStatus(value);
  if (status === 'DQ') return 'Other';
  return STATUS_BY_VALUE.get(status)?.category || (isDisqualification(status) ? 'Other' : '');
}

function dqStatusOptions() {
  return RACE_STATUS_OPTIONS.filter(option => isDisqualification(option.value));
}

function statusRowsForMeet(meet, options = {}) {
  const onlyDisqualifications = options.onlyDisqualifications === true;
  const rows = [];

  for (const race of meet?.races || []) {
    if (String(race.status || '') !== 'closed') continue;
    for (const entry of race.laneEntries || []) {
      const status = normalizeRaceStatus(entry.status);
      if (!status || (onlyDisqualifications && !isDisqualification(status))) continue;
      if (!String(entry.registrationId || entry.skaterName || '').trim()) continue;
      rows.push({
        raceId: race.id || '',
        raceLabel: [race.groupLabel, race.division, race.distanceLabel].filter(Boolean).join(' - '),
        groupLabel: race.groupLabel || '',
        division: race.division || '',
        distanceLabel: race.distanceLabel || '',
        skaterName: entry.skaterName || '',
        team: entry.team || '',
        registrationId: entry.registrationId || '',
        status,
        statusLabel: raceStatusLabel(status),
        dqCategory: entry.dqCategory || (isDisqualification(status) ? status : ''),
        dqCategoryLabel: dqCategoryLabel(entry.dqCategory || status),
        dqRuleReference: entry.dqRuleReference || '',
        dqOfficialNotes: entry.dqOfficialNotes || '',
        dqTimestamp: entry.dqTimestamp || '',
        dqRecordedBy: entry.dqRecordedBy || '',
        dqRecordedByUserId: entry.dqRecordedByUserId || '',
      });
    }
  }

  return rows;
}

module.exports = {
  RACE_STATUS_OPTIONS,
  VALID_RACE_STATUSES,
  dqCategoryLabel,
  dqStatusOptions,
  isDisqualification,
  isValidRaceStatus,
  normalizeRaceStatus,
  raceStatusLabel,
  statusRowsForMeet,
};
