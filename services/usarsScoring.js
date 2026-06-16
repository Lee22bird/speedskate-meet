const STANDARD_POINTS = { 1: 30, 2: 20, 3: 10, 4: 5 };

// USARS SR832 tiebreaker point weights: [short, middle, long].
const SR832_WEIGHTS = {
  1: [96, 108, 120.75],
  2: [64, 72, 80.5],
  3: [32, 36, 40.25],
  4: [16, 18, 20.125],
};

function normalizePlaceValue(place) {
  const n = Number(String(place || '').trim());
  return Number.isFinite(n) ? n : null;
}

function usarsPointsForPlace(place) {
  const n = normalizePlaceValue(place);
  return n ? Number(STANDARD_POINTS[n] || 0) : 0;
}

function raceCountsForUsarsStandardOverall(race) {
  if (!race) return false;
  if (race.isOpenRace || race.isQuadRace || race.isTimeTrial) return false;
  if (!race.isFinal || !race.countsForOverall) return false;
  return String(race.status || '') === 'closed';
}

function scoreRaceByStandardPoints(race) {
  const results = [];

  for (const entry of race.laneEntries || []) {
    const place = normalizePlaceValue(entry.place);
    if (place == null || place > 4) continue;

    // Prevent blank/phantom placed lanes from becoming "Unknown" standings rows.
    const hasRegistrationId = entry.registrationId !== undefined && entry.registrationId !== null && String(entry.registrationId).trim() !== '';
    const hasSkaterName = String(entry.skaterName || '').trim() !== '';
    if (!hasRegistrationId && !hasSkaterName) continue;

    results.push({
      registrationId: entry.registrationId,
      skaterName: String(entry.skaterName || '').trim() || 'Unknown',
      team: entry.team,
      place,
    });
  }

  const grouped = new Map();

  for (const item of results) {
    if (!grouped.has(item.place)) grouped.set(item.place, []);
    grouped.get(item.place).push(item);
  }

  const scored = [];

  for (const place of Array.from(grouped.keys()).sort((a, b) => a - b)) {
    const tied = grouped.get(place) || [];
    if (!tied.length) continue;

    let pointPool = 0;

    for (let i = 0; i < tied.length; i++) {
      pointPool += Number(STANDARD_POINTS[place + i] || 0);
    }

    const each = tied.length ? pointPool / tied.length : 0;

    for (const skater of tied) {
      scored.push({
        ...skater,
        points: each,
      });
    }
  }

  return scored;
}

function computeTiebreakerScore(raceScores, races, mode) {
  const sorted = [...races].sort(
    (a, b) => Number(a.dayIndex || 0) - Number(b.dayIndex || 0)
  );

  const raceOrder = new Map(sorted.map((r, i) => [r.id, i]));

  if (mode === 'd2') {
    const midRace = sorted[1] || sorted[0];
    if (!midRace) return 0;

    const midScore = raceScores.find(s => s.raceId === midRace.id);

    return -(midScore?.place || 999);
  }

  let total = 0;

  for (const rs of raceScores) {
    const pos = raceOrder.get(rs.raceId);
    if (pos == null) continue;

    const place = Number(rs.place || 0);
    const weights = SR832_WEIGHTS[place];
    if (!weights) continue;

    total += weights[Math.min(pos, 2)];
  }

  return total;
}

module.exports = {
  STANDARD_POINTS,
  SR832_WEIGHTS,
  normalizePlaceValue,
  usarsPointsForPlace,
  raceCountsForUsarsStandardOverall,
  scoreRaceByStandardPoints,
  computeTiebreakerScore,
};
