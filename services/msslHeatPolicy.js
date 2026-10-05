const MSSL_SEASON_OPENER_HEAT_GROUP_IDS = Object.freeze([
  'elementary_girls',
  'sophomore_girls',
  'senior_men',
  'freshman_girls',
]);

function isMsslSeasonOpener2026(meet) {
  return String(meet?.divisionScheme || '').toLowerCase() === 'mssl' &&
    String(meet?.date || '') === '2026-10-04' &&
    /mssl\s+season\s+opener/i.test(String(meet?.meetName || ''));
}

function automaticHeatsAllowed(meet, race) {
  const allowedGroups = Array.isArray(meet?.automaticHeatGroupIds)
    ? meet.automaticHeatGroupIds.map(String)
    : null;
  if (!allowedGroups) return true;
  return String(race?.division || '').toLowerCase() === 'elite' &&
    allowedGroups.includes(String(race?.groupId || ''));
}

function repairUnscoredDisallowedHeats(meet) {
  const races = meet?.races || [];
  const families = new Map();
  for (const race of races) {
    if (!['heat', 'semi'].includes(String(race.stage || '')) ||
        automaticHeatsAllowed(meet, race) || race.isOpenRace || race.isQuadRace ||
        race.isRelayRace || race.isTimeTrial) continue;
    const key = `${race.groupId}|${race.division}|${race.dayIndex}|${race.distanceLabel}`;
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(race);
  }

  const removedIds = new Set();
  let repaired = 0;
  for (const [key, generated] of families) {
    const [groupId, division, dayIndex, distanceLabel] = key.split('|');
    const family = races.filter(race =>
      String(race.groupId) === groupId && String(race.division) === division &&
      String(race.dayIndex) === dayIndex && String(race.distanceLabel) === distanceLabel
    );
    const final = family.find(race => race.stage === 'final' || race.isFinal);
    const hasResults = family.some(race => String(race.status || 'open') !== 'open' ||
      (race.laneEntries || []).some(entry => String(entry.place || '').trim() !== ''));
    if (!final || hasResults) continue;

    const entries = generated
      .sort((a, b) => Number(a.heatNumber || 0) - Number(b.heatNumber || 0))
      .flatMap(race => [...(race.laneEntries || [])].sort((a, b) => Number(a.lane || 0) - Number(b.lane || 0)));
    final.laneEntries = entries.map((entry, index) => ({ ...entry, lane: index + 1, place: '' }));
    final.stage = 'final';
    final.heatNumber = 0;
    final.isFinal = true;
    final.countsForOverall = true;
    final.startType = final.startType || 'standing';
    for (const race of generated) removedIds.add(String(race.id));
    repaired += 1;
  }

  if (!removedIds.size) return { repaired: 0 };
  meet.races = races.filter(race => !removedIds.has(String(race.id)));
  for (const block of meet.blocks || []) {
    block.raceIds = (block.raceIds || []).filter(id => !removedIds.has(String(id)));
  }
  return { repaired };
}

module.exports = {
  MSSL_SEASON_OPENER_HEAT_GROUP_IDS,
  isMsslSeasonOpener2026,
  automaticHeatsAllowed,
  repairUnscoredDisallowedHeats,
};
