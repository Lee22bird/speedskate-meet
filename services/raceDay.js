const { ensureTimeTrialEvent, timeTrialEventTitle } = require('./timeTrialEvents');

function orderedRaces(meet) {
  const timeTrialEvent = ensureTimeTrialEvent(meet);
  const timeTrialById = new Map((meet.timeTrialEvents || []).filter(event => event.enabled).map(event => [String(event.id), event]));
  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const out = [];

  for (const block of meet.blocks || []) {
    for (const eventId of block.timeTrialEventIds || []) {
      const event = timeTrialById.get(String(eventId));
      if (event) {
        out.push({
          id: event.id,
          type: 'time_trial',
          groupLabel: timeTrialEventTitle(event),
          division: 'time_trial',
          distanceLabel: event.distance || '100m',
          stage: 'event',
          status: event.status || 'open',
          startType: 'individual',
          laneEntries: [],
          timeTrialEvent: event,
          blockId: block.id,
          blockName: block.name,
          blockDay: block.day,
          blockType: block.type || 'race',
          blockNotes: block.notes || '',
        });
      }
    }
    for (const raceId of block.raceIds || []) {
      const race = raceById.get(raceId);
      if (race) {
        out.push({
          ...race,
          type: 'race',
          blockId: block.id,
          blockName: block.name,
          blockDay: block.day,
          blockType: block.type || 'race',
          blockNotes: block.notes || '',
        });
      }
    }
  }

  const assigned = new Set(out.map(r => r.id));

  for (const race of meet.races || []) {
    if (!assigned.has(race.id)) {
      out.push({
        ...race,
        type: 'race',
        blockId: '',
        blockName: 'Unassigned',
        blockDay: '',
        blockType: 'race',
        blockNotes: '',
      });
    }
  }

  if (timeTrialEvent && !out.some(item => String(item.id) === String(timeTrialEvent.id))) {
    out.push({
      id: timeTrialEvent.id,
      type: 'time_trial',
      groupLabel: timeTrialEventTitle(timeTrialEvent),
      division: 'time_trial',
      distanceLabel: timeTrialEvent.distance || '100m',
      stage: 'event',
      status: timeTrialEvent.status || 'open',
      startType: 'individual',
      laneEntries: [],
      timeTrialEvent,
      blockId: '',
      blockName: 'Unassigned',
      blockDay: '',
      blockType: 'race',
      blockNotes: '',
    });
  }

  return out;
}

function currentRaceInfo(meet) {
  const ordered = orderedRaces(meet);
  let idx = ordered.findIndex(r => r.id === meet.currentRaceId);

  if (idx < 0) {
    idx = Number.isFinite(meet.currentRaceIndex) ? meet.currentRaceIndex : -1;
  }

  if (idx < 0 && ordered.length) {
    idx = 0;
  }

  return {
    ordered,
    idx,
    current: idx >= 0 ? ordered[idx] : null,
    next: idx >= 0 && ordered[idx + 1] ? ordered[idx + 1] : null,
    coming: idx >= 0 ? ordered.slice(idx + 2, idx + 5) : ordered.slice(0, 3),
  };
}

function isRaceDayItemComplete(item) {
  const status = String(item?.status || '').toLowerCase();
  return status === 'closed' || status === 'complete' || status === 'completed';
}

function raceDayProgress(meet) {
  const ordered = orderedRaces(meet);
  return {
    total: ordered.length,
    completed: ordered.filter(isRaceDayItemComplete).length,
  };
}

function ensureCurrentRace(meet) {
  const info = currentRaceInfo(meet);

  if (info.current && meet.currentRaceId !== info.current.id) {
    meet.currentRaceId = info.current.id;
    meet.currentRaceIndex = info.idx;
    return true;
  }
  return false;
}

function laneRowsForRace(race, meet) {
  const out = [];

  const maxLanes =
    race.isOpenRace || String(race.division || '') === 'open'
      ? Math.max((race.laneEntries || []).length, 1)
      : Math.max((race.laneEntries || []).length, Number(meet.lanes) || 4, 1);

  for (let lane = 1; lane <= maxLanes; lane++) {
    const existing =
      (race.laneEntries || []).find(x => Number(x.lane) === lane) || {};

    out.push({
      lane,
      registrationId: existing.registrationId || '',
      helmetNumber: existing.helmetNumber || '',
      skaterName: existing.skaterName || '',
      team: existing.team || '',
      place: existing.place || '',
      time: existing.time || '',
      status: existing.status || '',
    });
  }

  return out;
}

function recentClosedRaces(meet, count = 5) {
  return (meet.races || [])
    .filter(r => String(r.status || '') === 'closed')
    .sort(
      (a, b) =>
        new Date(b.closedAt || 0).getTime() -
        new Date(a.closedAt || 0).getTime()
    )
    .slice(0, count);
}

function raceDisplayStage(race) {
  if (race?.type === 'time_trial') return 'Event';
  if (race.stage === 'heat') return `Heat ${race.heatNumber}`;
  if (race.stage === 'semi') return `Semi ${race.heatNumber}`;
  if (race.stage === 'final') return 'Final';
  return 'Race';
}

module.exports = {
  orderedRaces,
  currentRaceInfo,
  isRaceDayItemComplete,
  raceDayProgress,
  ensureCurrentRace,
  laneRowsForRace,
  recentClosedRaces,
  raceDisplayStage,
};
