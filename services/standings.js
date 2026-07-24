const crypto = require('crypto');
const {
  STANDARD_POINTS,
  scoreRaceByStandardPoints,
  computeTiebreakerScore,
  raceCountsForUsarsStandardOverall,
  isNoviceDivision,
  noviceTiebreakerPlace,
} = require('./usarsScoring');

function isOpenDivision(div) {
  return String(div || '').toLowerCase() === 'open';
}

function computeMeetStandings(meet) {
  const tbMode = meet.tiebreaker || 'sr832';
  const standings = {};
  const divisions = {};
  const regMap = new Map((meet.registrations || []).map(r => [Number(r.id), r]));

  for (const race of meet.races || []) {
    if (!raceCountsForUsarsStandardOverall(race)) continue;

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

      // Novice (league only) breaks ties on the longest distance; Elite/nationals
      // uses the SR832 weighted score. Detection is division-scoped, so it can
      // never alter the named-division championship (SR832) path.
      const novice = isNoviceDivision(divisions[key].division, divRaces);

      allRows.sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;

        if (novice) {
          const pa = noviceTiebreakerPlace(a.raceScores, divRaces);
          const pb = noviceTiebreakerPlace(b.raceScores, divRaces);
          if (pa !== pb) return pa - pb; // lower place in the long race wins
        } else {
          const tbA = computeTiebreakerScore(a.raceScores, divRaces, tbMode);
          const tbB = computeTiebreakerScore(b.raceScores, divRaces, tbMode);
          if (tbA !== tbB) return tbB - tbA;
        }

        return String(a.skaterName || '').localeCompare(String(b.skaterName || ''));
      });

      const tbValue = rs => novice
        ? noviceTiebreakerPlace(rs, divRaces)
        : computeTiebreakerScore(rs, divRaces, tbMode);

      const rows = allRows.map((row, idx, arr) => {
        const prev = arr[idx - 1];
        const isTied = prev && prev.totalPoints === row.totalPoints;
        const tbA = isTied ? tbValue(row.raceScores) : null;
        const tbB = isTied ? tbValue(prev.raceScores) : null;

        const tbResolved = isTied && tbA !== tbB;
        const runoffNeeded = isTied && tbA === tbB;

        return {
          ...row,
          overallPlace: idx + 1,
          tiebreakerUsed: tbResolved,
          // For novice this is the long-race place (lower = better); for elite
          // it's the SR832 weighted score (higher = better).
          tiebreakerScore: isTied ? tbValue(row.raceScores) : null,
          tiebreakerKind: isTied ? (novice ? 'novice_long' : tbMode) : null,
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

    // Quad overall is scored by division/group across all completed quad distances.
    // Example: Quad Freshman Girls 300m + 500m = one overall standings table.
    const bucketKey = String(race.groupId || race.groupLabel || 'quad');

    if (!divisions[bucketKey]) {
      divisions[bucketKey] = {
        groupId: race.groupId,
        groupLabel: race.groupLabel,
        division: race.division || 'quad',
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

      const rows = Object.values(standings[key] || {})
        .sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;

          // Simple quad tie fallback for now: better finish in the later/longer race wins.
          const lastRace = divRaces[divRaces.length - 1];
          const aLast = a.raceScores.find(s => s.raceId === lastRace?.id)?.place || 999;
          const bLast = b.raceScores.find(s => s.raceId === lastRace?.id)?.place || 999;
          if (aLast !== bLast) return aLast - bLast;

          return String(a.skaterName || '').localeCompare(String(b.skaterName || ''));
        })
        .map((row, idx) => ({
          ...row,
          overallPlace: idx + 1,
        }));

      return {
        key,
        groupId: divisions[key].groupId,
        groupLabel: divisions[key].groupLabel,
        division: divisions[key].division,
        distanceLabel: divRaces.map(r => r.distanceLabel).filter(Boolean).join(' + '),
        races: divRaces,
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
