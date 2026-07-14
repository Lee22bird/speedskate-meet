const DIRECT_FINAL_MAX = 7;
const HEAT_ADVANCEMENT_MIN = 8;
const TWO_HEAT_ADVANCEMENT_MAX = 14;
const FINAL_TARGET_SIZE = 6;
const HEAT_MAX_SIZE = 7;
// USARS SR505.4: semis are always 2 heats of ~6, top 3 → the 6-skater final.
const SEMI_COUNT = 2;
const SEMI_PER_HEAT = Math.ceil(FINAL_TARGET_SIZE / SEMI_COUNT); // 3

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

  // 15+ : Heats → 2 Semis → Final, per USARS SR505.3/.4. Exact bands:
  //   15–24 → 3 heats, top 4 each (→12);  25–32 → 4 heats, top 3 each (→12).
  //   Each semi (2 × 6) advances its top 3 to the 6-skater final.
  //   33+ → SR505.3 requires quarterfinals; flagged (quartersNeeded) — for now
  //   we extend with more heats into the semis and mark it for the quarter round.
  let heatCount, heatPerHeat;
  if (count <= 24) { heatCount = 3; heatPerHeat = 4; }
  else if (count <= 32) { heatCount = 4; heatPerHeat = 3; }
  else { heatCount = Math.ceil(count / 8); heatPerHeat = Math.max(2, Math.ceil((SEMI_COUNT * FINAL_TARGET_SIZE) / heatCount)); }
  const semiTotal = Math.min(heatPerHeat * heatCount, count);
  return {
    kind: 'heat_semi_final',
    entryCount: count,
    finalSize: FINAL_TARGET_SIZE,
    heatCount,
    heatSizes: splitEvenly(count, heatCount),
    semiCount: SEMI_COUNT,
    semiSizes: splitEvenly(semiTotal, SEMI_COUNT),
    quartersNeeded: count >= 33, // SR505.3: quarterfinals not yet generated
    advancement: {
      type: 'heat_semi_final',
      heatPerHeat,            // top N from each heat → the semis
      semiTotal,              // teams/skaters reaching the semis
      semiPerHeat: SEMI_PER_HEAT, // top 3 from each semi → the final
      finalSize: FINAL_TARGET_SIZE,
    },
  };
}

function shouldSplitNormalRace(entryCount) {
  return planNormalRaceSizing(entryCount).kind !== 'direct_final';
}

// USARS SR505.9 — 3-person relays do NOT use the place-based individual bracket.
// They use WIN-AND-IN + FASTEST TIMES: the winner of each heat advances directly;
// the remaining slots are filled by the fastest times among all non-winners. 6
// advance into the final (7 if exactly 7 teams). Verified against the rulebook
// table (IDN 2026/USARSRules.txt SR505.9): the "Time Qualify" column equals
// advanceTotal − heatCount (winners), i.e. fillByTime below.
//   7      -> final (7 teams)
//   8-14   -> 2 heats -> 6 final          (2 winners + 4 fastest)
//   15-21  -> 3 heats -> 6 final          (3 winners + 3 fastest)
//   22-28  -> 4 heats -> 12 -> 2 semis -> 6 (4 winners + 8 fastest; semi: 2 win + 4 fastest)
//   29-35  -> 5 heats -> 12 -> 2 semis -> 6
//   36-40  -> 6 heats -> 12 -> 2 semis -> 6
//   41-45  -> 7 heats -> 12 -> 2 semis -> 6
function planThreePersonRelaySizing(teamCount) {
  const count = normalEntryCount(teamCount);
  if (count <= DIRECT_FINAL_MAX) {
    return { kind: 'relay3_final', entryCount: count, finalSize: count, heatCount: 0, heatSizes: [], semiCount: 0, qualifyBy: 'time_win_and_in', advancement: null };
  }
  let heatCount;
  if (count <= 14) heatCount = 2;
  else if (count <= 21) heatCount = 3;
  else if (count <= 28) heatCount = 4;
  else if (count <= 35) heatCount = 5;
  else if (count <= 40) heatCount = 6;
  else heatCount = 7; // 41-45 (and 46+ best-effort — rulebook table tops out at 45)
  const hasSemis = count >= 22;                 // 22+ : heats feed 2 semis of 6
  const advanceTotal = hasSemis ? 12 : FINAL_TARGET_SIZE; // teams leaving the heat round
  return {
    kind: 'relay3_win_and_in',
    entryCount: count,
    finalSize: FINAL_TARGET_SIZE,
    heatCount,
    heatSizes: splitEvenly(count, heatCount),
    semiCount: hasSemis ? SEMI_COUNT : 0,
    semiSizes: hasSemis ? splitEvenly(SEMI_COUNT * FINAL_TARGET_SIZE, SEMI_COUNT) : [],
    qualifyBy: 'time_win_and_in',
    advancement: {
      type: 'relay3_win_and_in',
      winnersPerHeat: 1,                        // heat winner advances directly
      advanceTotal,                             // total teams advancing from heats
      fillByTime: advanceTotal - heatCount,     // remaining slots = fastest times (matches rulebook "Time Qualify")
      semiCount: hasSemis ? SEMI_COUNT : 0,
      semiWinnersPerHeat: hasSemis ? 1 : 0,
      semiFillByTime: hasSemis ? (FINAL_TARGET_SIZE - SEMI_COUNT) : 0, // 2 semi winners + 4 fastest = 6
      finalSize: FINAL_TARGET_SIZE,
    },
  };
}

// Relay bracket plan. 2- and 4-person relays reuse the individual SR505.3
// place-based bands (contestant TEAMS as the entries). 3-person relays use the
// win-and-in + fastest-times SR505.9 table above.
function planRelayRaceSizing(teamCount, relaySize) {
  if (Number(relaySize) === 3) return planThreePersonRelaySizing(teamCount);
  return { ...planNormalRaceSizing(teamCount), qualifyBy: 'place' };
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
  planRelayRaceSizing,
  planThreePersonRelaySizing,
  shouldSplitNormalRace,
  distributeByTeam,
};
