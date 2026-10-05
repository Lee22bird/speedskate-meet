'use strict';

const { shuffleArray } = require('./laneAssignment');

function familyKey(race) {
  const parent = String(race?.parentRaceKey || '').trim();
  if (parent) return parent;
  return [race?.groupId, race?.division, race?.dayIndex, race?.distanceLabel].map(x => String(x || '')).join('|');
}

function hasResults(race) {
  return (race?.laneEntries || []).some(entry =>
    String(entry.place || '').trim() || String(entry.time || '').trim() || String(entry.status || '').trim()
  );
}

function hasSkater(entry) {
  return String(entry?.registrationId ?? '').trim() !== '' || String(entry?.skaterName || '').trim() !== '';
}

function findRollingStartPlan(meet, raceId) {
  const races = Array.isArray(meet?.races) ? meet.races : [];
  const first = races.find(race => String(race.id) === String(raceId));
  if (!first || first.isRelayRace || first.isTimeTrial || String(first.stage) !== 'heat' || Number(first.heatNumber) !== 1) return null;
  if (String(first.division || '').toLowerCase() !== 'elite') return null;
  const divisionRaces = races.filter(race => String(race.groupId || '') === String(first.groupId || '')
    && String(race.division || '').toLowerCase() === 'elite' && !race.isRelayRace && !race.isTimeTrial);
  const longestIndex = Math.max(...divisionRaces.map(race => Number(race.dayIndex) || 0));
  if (longestIndex && Number(first.dayIndex || 0) < longestIndex) return null;

  const family = races.filter(race => !race.isRelayRace && !race.isTimeTrial && familyKey(race) === familyKey(first));
  if (family.some(race => String(race.groupId || '') !== String(first.groupId || '')
    || String(race.division || '').toLowerCase() !== String(first.division || '').toLowerCase()
    || Number(race.dayIndex || 0) !== Number(first.dayIndex || 0)
    || String(race.distanceLabel || '') !== String(first.distanceLabel || ''))) return null;
  const heats = family.filter(race => String(race.stage) === 'heat').sort((a, b) => Number(a.heatNumber) - Number(b.heatNumber));
  const finalRace = family.find(race => String(race.stage) === 'final' || race.isFinal);
  if (family.some(race => ['semi', 'quarter'].includes(String(race.stage || '')))) return null;
  if (heats.length !== 2 || Number(heats[0].heatNumber) !== 1 || Number(heats[1].heatNumber) !== 2 || !finalRace) return null;
  if ([...heats, finalRace].some(hasResults) || [...heats, finalRace].some(race => String(race.status || 'open') === 'closed')) return null;
  if (finalRace.laneEntries?.some(hasSkater)) return null;
  if (!heats.some(race => race.laneEntries?.some(hasSkater))) return null;

  return { firstHeat: heats[0], secondHeat: heats[1], finalRace };
}

function startRollingFinal(meet, raceId) {
  const plan = findRollingStartPlan(meet, raceId);
  if (!plan) return { ok: false, error: 'This race does not have an eligible, unstarted two-heat final.' };

  const { firstHeat, secondHeat, finalRace } = plan;
  const sourceIds = new Set([String(firstHeat.id), String(secondHeat.id), String(finalRace.id)]);
  const combinedEntries = shuffleArray([
    ...firstHeat.laneEntries.filter(hasSkater).map(entry => ({ ...entry, rollingSourceRaceId: String(firstHeat.id) })),
    ...secondHeat.laneEntries.filter(hasSkater).map(entry => ({ ...entry, rollingSourceRaceId: String(secondHeat.id) })),
  ]).map((entry, index) => ({ ...entry, lane: index + 1, place: '', time: '', status: '' }));

  const backup = {
    races: [firstHeat, secondHeat, finalRace].map(race => JSON.parse(JSON.stringify(race))),
    blocks: (meet.blocks || []).map(block => ({ id: String(block.id), raceIds: [...(block.raceIds || [])] })),
    currentRaceId: meet.currentRaceId || '',
    currentRaceIndex: Number(meet.currentRaceIndex ?? -1),
  };

  firstHeat.rollingStartSupersededBy = String(finalRace.id);
  secondHeat.rollingStartSupersededBy = String(finalRace.id);
  Object.assign(finalRace, {
    stage: 'final',
    heatNumber: 0,
    isFinal: true,
    startType: 'rolling',
    countsForOverall: true,
    laneEntries: combinedEntries,
    resultsMode: 'places',
    status: 'open',
    closedAt: '',
    rollingStartFinal: true,
    rollingStartSourceRaceIds: [String(firstHeat.id), String(secondHeat.id)],
    rollingStartBackup: backup,
  });

  let targetBlock = null;
  let targetIndex = 0;
  for (const block of meet.blocks || []) {
    const ids = (block.raceIds || []).map(String);
    const index = ids.indexOf(String(firstHeat.id));
    if (index >= 0) {
      targetBlock = block;
      targetIndex = ids.slice(0, index).filter(id => !sourceIds.has(id)).length;
      break;
    }
  }
  for (const block of meet.blocks || []) block.raceIds = (block.raceIds || []).filter(id => !sourceIds.has(String(id)));
  if (targetBlock) targetBlock.raceIds.splice(targetIndex, 0, String(finalRace.id));
  meet.currentRaceId = String(finalRace.id);
  meet.currentRaceIndex = -1;
  return { ok: true, finalRaceId: String(finalRace.id), skaters: combinedEntries.length };
}

function undoRollingFinal(meet, finalRaceId) {
  const finalRace = (meet.races || []).find(race => String(race.id) === String(finalRaceId));
  const backup = finalRace?.rollingStartBackup;
  if (!finalRace || !backup) return { ok: false, error: 'No reversible rolling-start setup was found.' };
  if (String(finalRace.status || '') === 'closed' || hasResults(finalRace)) {
    return { ok: false, error: 'A rolling-start final with saved results cannot be undone.' };
  }

  for (const saved of backup.races || []) {
    const current = (meet.races || []).find(race => String(race.id) === String(saved.id));
    if (current) {
      for (const key of Object.keys(current)) if (!(key in saved)) delete current[key];
      Object.assign(current, JSON.parse(JSON.stringify(saved)));
    }
  }
  for (const savedBlock of backup.blocks || []) {
    const block = (meet.blocks || []).find(item => String(item.id) === String(savedBlock.id));
    if (block) block.raceIds = [...savedBlock.raceIds];
  }
  meet.currentRaceId = backup.currentRaceId || '';
  meet.currentRaceIndex = Number(backup.currentRaceIndex ?? -1);
  return { ok: true };
}

module.exports = { findRollingStartPlan, startRollingFinal, undoRollingFinal };
