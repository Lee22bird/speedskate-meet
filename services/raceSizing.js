const DIRECT_FINAL_MAX = 7;
const HEAT_ADVANCEMENT_MIN = 8;
const TWO_HEAT_ADVANCEMENT_MAX = 14;
const FINAL_TARGET_SIZE = 6;
const HEAT_MAX_SIZE = 7;

function normalEntryCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function splitEvenly(total, bucketCount) {
  const count = Math.max(1, Math.floor(Number(bucketCount) || 1));
  const base = Math.floor(total / count);
  const extra = total % count;
  return Array.from({ length: count }, (_, idx) => base + (idx < extra ? 1 : 0));
}

function planNormalRaceSizing(entryCount) {
  const count = normalEntryCount(entryCount);

  if (count <= DIRECT_FINAL_MAX) {
    return {
      kind: 'direct_final',
      entryCount: count,
      finalSize: count,
      heatCount: 0,
      heatSizes: [],
      advancement: null,
    };
  }

  if (count <= TWO_HEAT_ADVANCEMENT_MAX) {
    return {
      kind: 'two_heat_final',
      entryCount: count,
      finalSize: FINAL_TARGET_SIZE,
      heatCount: 2,
      heatSizes: splitEvenly(count, 2),
      advancement: {
        type: 'top_by_place',
        perHeat: 3,
        finalSize: FINAL_TARGET_SIZE,
      },
    };
  }

  const heatCount = Math.max(3, Math.ceil(count / HEAT_MAX_SIZE));
  return {
    kind: 'manual_multi_heat_final',
    entryCount: count,
    finalSize: FINAL_TARGET_SIZE,
    heatCount,
    heatSizes: splitEvenly(count, heatCount),
    advancement: {
      type: 'manual',
      finalSize: FINAL_TARGET_SIZE,
    },
  };
}

function shouldSplitNormalRace(entryCount) {
  return planNormalRaceSizing(entryCount).kind !== 'direct_final';
}

function distributeByTeam(entries, heatSizesOrCount) {
  const targetSizes = Array.isArray(heatSizesOrCount)
    ? heatSizesOrCount.map(size => Math.max(0, Math.floor(Number(size) || 0)))
    : splitEvenly(entries.length, Math.max(1, Math.floor(Number(heatSizesOrCount) || 1)));

  const buckets = targetSizes.map(() => []);
  const teamMap = new Map();

  for (const entry of entries) {
    const team = String(entry.team || 'Independent');
    if (!teamMap.has(team)) teamMap.set(team, []);
    teamMap.get(team).push(entry);
  }

  for (const group of Array.from(teamMap.values()).sort((a, b) => b.length - a.length)) {
    for (const skater of group) {
      let bestIdx = -1;
      let bestScore = Infinity;

      for (let i = 0; i < buckets.length; i++) {
        if (buckets[i].length >= targetSizes[i]) continue;

        const sameTeamCount = buckets[i].filter(
          x => String(x.team || 'Independent') === String(skater.team || 'Independent')
        ).length;
        const fillRatio = targetSizes[i] ? buckets[i].length / targetSizes[i] : 1;
        const score = sameTeamCount * 100 + fillRatio;

        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx < 0) {
        bestIdx = buckets.reduce(
          (best, bucket, idx) => bucket.length < buckets[best].length ? idx : best,
          0
        );
      }

      buckets[bestIdx].push(skater);
    }
  }

  return buckets;
}

module.exports = {
  DIRECT_FINAL_MAX,
  FINAL_TARGET_SIZE,
  HEAT_MAX_SIZE,
  HEAT_ADVANCEMENT_MIN,
  TWO_HEAT_ADVANCEMENT_MAX,
  splitEvenly,
  planNormalRaceSizing,
  shouldSplitNormalRace,
  distributeByTeam,
};
