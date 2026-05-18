const crypto = require('crypto');

const STANDARD_POINTS = { 1: 30, 2: 20, 3: 10, 4: 5 };

// SR832 tiebreaker point weights: [short, middle, long]
const SR832_WEIGHTS = {
  1: [96, 108, 120.75],
  2: [64, 72, 80.5],
  3: [32, 36, 40.25],
  4: [16, 18, 20.125],
};

function isOpenDivision(div) {
  return String(div || '').toLowerCase() === 'open';
}

function normalizePlaceValue(place) {
  const n = Number(String(place || '').trim());
  return Number.isFinite(n) ? n : null;
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

function computeMeetStandings(meet) {
  const tbMode = meet.tiebreaker || 'd2';
  const standings = {};
  const divisions = {};
  const regMap = new Map((meet.registrations || []).map(r => [Number(r.id), r]));

  for (const race of meet.races || []) {
    if (race.isOpenRace || race.isQuadRace || race.isTimeTrial) continue;
    if (!race.isFinal || !race.countsForOverall) continue;
    if (String(race.status || '') !== 'closed') continue;

    const bucketKey = `${race.groupId}|${race.division}`;

    if (!divisions[bucketKey]) {
      divisions[bucketKey] = {
        groupId: race.groupId,
        groupLabel: race.groupLabel,
        division: race.division,
        races: [],
      };
    }

    divisions[bucketKey].races.push(race);

    const scored = scoreRaceByStandardPoints(race);

    if (!standings[bucketKey]) standings[bucketKey] = {};

    for (const row of scored) {
      const regKey = String(
        row.registrationId ||
        row.skaterName ||
        crypto.randomBytes(3).toString('hex')
      );

      const reg = regMap.get(Number(row.registrationId));

      if (!standings[bucketKey][regKey]) {
        standings[bucketKey][regKey] = {
          registrationId: row.registrationId,
          skaterName: row.skaterName,
          team: row.team,
          sponsor: reg?.sponsor || '',
          totalPoints: 0,
          raceScores: [],
        };
      }

      standings[bucketKey][regKey].totalPoints += Number(row.points || 0);

      standings[bucketKey][regKey].raceScores.push({
        raceId: race.id,
        distanceLabel: race.distanceLabel,
        dayIndex: race.dayIndex,
        place: row.place,
        points: row.points,
      });
    }
  }

  return Object.keys(divisions)
    .map(key => {
      const divRaces = divisions[key].races.sort(
        (a, b) => Number(a.dayIndex || 0) - Number(b.dayIndex || 0)
      );

      const allRows = Object.values(standings[key] || {});

      allRows.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;

        const tbA = computeTiebreakerScore(a.raceScores, divRaces, tbMode);
        const tbB = computeTiebreakerScore(b.raceScores, divRaces, tbMode);

        if (tbA !== tbB) return tbB - tbA;

        return String(a.skaterName || '').localeCompare(String(b.skaterName || ''));
      });

      const rows = allRows.map((row, idx, arr) => {
        const prev = arr[idx - 1];
        const isTied = prev && prev.totalPoints === row.totalPoints;
        const tbA = isTied
          ? computeTiebreakerScore(row.raceScores, divRaces, tbMode)
          : null;
        const tbB = isTied
          ? computeTiebreakerScore(prev.raceScores, divRaces, tbMode)
          : null;

        const tbResolved = isTied && tbA !== tbB;
        const runoffNeeded = isTied && tbA === tbB;

        return {
          ...row,
          overallPlace: idx + 1,
          tiebreakerUsed: tbResolved,
          tiebreakerScore: isTied
            ? tbMode === 'sr832'
              ? computeTiebreakerScore(row.raceScores, divRaces, 'sr832')
              : null
            : null,
          runoffNeeded,
        };
      });

      return {
        key,
        groupId: divisions[key].groupId,
        groupLabel: divisions[key].groupLabel,
        division: divisions[key].division,
        races: divRaces,
        standings: rows,
        tbMode,
      };
    })
    .sort((a, b) => {
      const byGroup = String(a.groupLabel).localeCompare(String(b.groupLabel));
      return byGroup !== 0
        ? byGroup
        : String(a.division).localeCompare(String(b.division));
    });
}

function computeQuadStandings(meet) {
  const standings = {};
  const divisions = {};
  const regMap = new Map((meet.registrations || []).map(r => [Number(r.id), r]));

  for (const race of meet.races || []) {
    if (!race.isQuadRace) continue;
    if (!race.isFinal || !race.countsForOverall) continue;
    if (String(race.status || '') !== 'closed') continue;

    const bucketKey = `${race.groupId}|${race.distanceLabel}`;

    if (!divisions[bucketKey]) {
      divisions[bucketKey] = {
        groupId: race.groupId,
        groupLabel: race.groupLabel,
        distanceLabel: race.distanceLabel,
        races: [],
      };
    }

    divisions[bucketKey].races.push(race);

    const scored = scoreRaceByStandardPoints(race);

    if (!standings[bucketKey]) standings[bucketKey] = {};

    for (const row of scored) {
      const regKey = String(
        row.registrationId ||
        row.skaterName ||
        crypto.randomBytes(3).toString('hex')
      );

      const reg = regMap.get(Number(row.registrationId));

      if (!standings[bucketKey][regKey]) {
        standings[bucketKey][regKey] = {
          registrationId: row.registrationId,
          skaterName: row.skaterName,
          team: row.team,
          sponsor: reg?.sponsor || '',
          totalPoints: 0,
          raceScores: [],
        };
      }

      standings[bucketKey][regKey].totalPoints += Number(row.points || 0);

      standings[bucketKey][regKey].raceScores.push({
        raceId: race.id,
        distanceLabel: race.distanceLabel,
        place: row.place,
        points: row.points,
      });
    }
  }

  return Object.keys(divisions)
    .map(key => {
      const rows = Object.values(standings[key] || {})
        .sort((a, b) =>
          b.totalPoints !== a.totalPoints
            ? b.totalPoints - a.totalPoints
            : String(a.skaterName || '').localeCompare(String(b.skaterName || ''))
        )
        .map((row, idx) => ({
          ...row,
          overallPlace: idx + 1,
        }));

      return {
        key,
        groupId: divisions[key].groupId,
        groupLabel: divisions[key].groupLabel,
        distanceLabel: divisions[key].distanceLabel,
        races: divisions[key].races,
        standings: rows,
      };
    })
    .sort((a, b) => String(a.groupLabel).localeCompare(String(b.groupLabel)));
}

function computeOpenResults(meet) {
  return (meet.races || [])
    .filter(
      r =>
        (isOpenDivision(r.division) || r.isOpenRace) &&
        r.isFinal &&
        String(r.status || '') === 'closed'
    )
    .sort((a, b) => {
      const byGroup = String(a.groupLabel || '').localeCompare(String(b.groupLabel || ''));
      return byGroup !== 0
        ? byGroup
        : Number(a.dayIndex || 0) - Number(b.dayIndex || 0);
    })
    .map(race => ({
      race,
      rows: (race.laneEntries || [])
        .filter(x => String(x.place || '').trim())
        .filter(x => String(x.registrationId || '').trim() || String(x.skaterName || '').trim())
        .sort((a, b) => Number(a.place || 999) - Number(b.place || 999)),
    }));
}

module.exports = {
  STANDARD_POINTS,
  scoreRaceByStandardPoints,
  computeTiebreakerScore,
  computeMeetStandings,
  computeQuadStandings,
  computeOpenResults,
};
