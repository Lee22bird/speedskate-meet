const crypto = require('crypto');
const {
  planNormalRaceSizing,
  shouldSplitNormalRace,
  distributeByTeam,
} = require('./raceSizing');
const { assignRandomLaneEntries } = require('./laneAssignment');


const CHALLENGE_TOWARD_SENIOR = {
  tiny_tot_girls: 'primary_girls', primary_girls: 'juvenile_girls', juvenile_girls: 'elementary_girls', elementary_girls: 'freshman_girls', freshman_girls: 'sophomore_girls', sophomore_girls: 'junior_women', junior_women: 'senior_women', classic_women: 'senior_women', master_women: 'classic_women', veteran_women: 'master_women', esquire_women: 'veteran_women',
  tiny_tot_boys: 'primary_boys', primary_boys: 'juvenile_boys', juvenile_boys: 'elementary_boys', elementary_boys: 'freshman_boys', freshman_boys: 'sophomore_boys', sophomore_boys: 'junior_men', junior_men: 'senior_men', classic_men: 'senior_men', master_men: 'classic_men', veteran_men: 'master_men', esquire_men: 'veteran_men',
};

function findChallengeUpGroup(groups, currentGroupId) {
  const nextId = CHALLENGE_TOWARD_SENIOR[String(currentGroupId || '')];
  if (!nextId) return null;
  return (groups || []).find(g => String(g.id) === String(nextId)) || null;
}

function noviceChallengeCreatesOwnElite(reg) {
  const opts = reg?.options || {};
  return !!(opts.challengeUp && opts.novice);
}

function eliteChallengeCreatesAgeGroup(reg) {
  const opts = reg?.options || {};
  return !!(opts.challengeUp && opts.elite && !opts.novice);
}

function registrationMatchesStandardRace(reg, race, meet) {
  const div = String(race?.division || '').toLowerCase();
  const opts = reg?.options || {};
  const raceGroupId = String(race?.groupId || '');
  const baseGroupId = String(reg?.originalDivisionGroupId || reg?.divisionGroupId || '');

  if (raceGroupId === baseGroupId) {
    if (div === 'elite' && noviceChallengeCreatesOwnElite(reg)) return true;
    return !!opts[div];
  }

  if (div === 'elite' && eliteChallengeCreatesAgeGroup(reg)) {
    const challengeGroup = findChallengeUpGroup(meet?.groups || [], baseGroupId);
    return !!challengeGroup && String(challengeGroup.id) === raceGroupId;
  }

  return false;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeDistances(arr4) {
  return [0, 1, 2, 3].map(i => String(arr4?.[i] ?? '').trim());
}

function baseRaceKey(groupId, division, dayIndex, distanceLabel) {
  return `${groupId}|${division}|${dayIndex}|${distanceLabel}`;
}

function isOpenDivision(div) {
  return String(div || '').toLowerCase() === 'open';
}

function divisionEnabledForRegistration(reg, division) {
  return !!reg.options?.[division];
}

function registrationSortKey(reg) {
  return [
    String(reg.team || ''),
    String(reg.name || ''),
    Number(reg.age || 0),
    Number(reg.id || 0),
  ].join('|');
}

function nextHelmetNumber(meet) {
  const used = new Set(
    (meet.registrations || [])
      .map(r => Number(r.helmetNumber))
      .filter(n => Number.isFinite(n) && n > 0)
  );

  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

function calculateRegistrationTotal(meet, reg) {
  let total = 0;

  for (const race of meet.races || []) {
    if (registrationMatchesStandardRace(reg, race, meet)) {
      total += Number(race.cost || 0);
    }
  }

  return total;
}

function ensureRegistrationTotalsAndNumbers(meet) {
  for (const reg of meet.registrations || []) {
    reg.totalCost = calculateRegistrationTotal(meet, reg);

    if (!Number.isFinite(Number(reg.helmetNumber)) || Number(reg.helmetNumber) <= 0) {
      reg.helmetNumber = nextHelmetNumber(meet);
    }
  }
}

function orderedRaces(meet) {
  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const out = [];

  for (const block of meet.blocks || []) {
    for (const raceId of block.raceIds || []) {
      const race = raceById.get(raceId);
      if (race) {
        out.push({
          ...race,
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
        blockId: '',
        blockName: 'Unassigned',
        blockDay: '',
        blockType: 'race',
        blockNotes: '',
      });
    }
  }

  return out;
}

function currentRaceInfo(meet) {
  const ordered = orderedRaces(meet);
  let idx = ordered.findIndex(r => r.id === meet.currentRaceId);

  if (idx < 0) idx = Number.isFinite(meet.currentRaceIndex) ? meet.currentRaceIndex : -1;
  if (idx < 0 && ordered.length) idx = 0;

  return {
    ordered,
    idx,
    current: idx >= 0 ? ordered[idx] : null,
    next: idx >= 0 && ordered[idx + 1] ? ordered[idx + 1] : null,
    coming: idx >= 0 ? ordered.slice(idx + 2, idx + 5) : ordered.slice(0, 3),
  };
}

function ensureCurrentRace(meet) {
  const info = currentRaceInfo(meet);

  if (info.current && meet.currentRaceId !== info.current.id) {
    meet.currentRaceId = info.current.id;
    meet.currentRaceIndex = info.idx;
  }
}

function buildHeatRaceShell(baseRace, stage, heatNumber, suffixOrder) {
  return {
    ...baseRace,
    id: 'r' + crypto.randomBytes(6).toString('hex'),
    orderHint: Number(baseRace.orderHint || 0) + suffixOrder / 100,
    stage,
    heatNumber: stage === 'final' ? 0 : heatNumber,
    isFinal: stage === 'final',
    laneEntries: [],
    status: 'open',
    closedAt: '',
  };
}

function shouldSplitIntoHeats(baseRace, entryCount, laneCount) {
  if (isOpenDivision(baseRace.division)) return false;
  if (baseRace.isOpenRace) return false;
  return shouldSplitNormalRace(entryCount);
}

function buildRaceSetForEntries(baseRace, regs, laneCount) {
  // Sorting here only feeds team-balanced heat grouping below (distributeByTeam)
  // — it does not determine lane numbers. Lane numbers are assigned by an
  // independent random shuffle (assignRandomLaneEntries) so every skater in a
  // race has an equal chance at any lane, instead of inheriting this order.
  const sorted = [...regs].sort((a, b) =>
    registrationSortKey(a).localeCompare(registrationSortKey(b))
  );

  if (isOpenDivision(baseRace.division) || baseRace.isOpenRace) {
    return [{
      ...baseRace,
      stage: 'final',
      heatNumber: 0,
      isFinal: true,
      startType: 'rolling',
      countsForOverall: false,
      laneEntries: assignRandomLaneEntries(sorted),
    }];
  }

  if (!shouldSplitIntoHeats(baseRace, sorted.length, laneCount)) {
    return [{
      ...baseRace,
      stage: 'final',
      heatNumber: 0,
      isFinal: true,
      startType: 'standing',
      countsForOverall: true,
      laneEntries: assignRandomLaneEntries(sorted),
    }];
  }

  const racePlan = planNormalRaceSizing(sorted.length);
  const buckets = distributeByTeam(sorted, racePlan.heatSizes);
  const raceSet = [];

  buckets.forEach((bucket, idx) => {
    const heatRace = buildHeatRaceShell(baseRace, 'heat', idx + 1, idx + 1);
    heatRace.startType = 'standing';
    heatRace.countsForOverall = false;
    heatRace.laneEntries = assignRandomLaneEntries(bucket);

    raceSet.push(heatRace);
  });

  const finalRace = buildHeatRaceShell(baseRace, 'final', 0, 99);
  finalRace.startType = 'standing';
  finalRace.countsForOverall = true;
  finalRace.laneEntries = [];

  raceSet.push(finalRace);

  return raceSet;
}

function generateBaseRacesForMeet(meet) {
  const oldMap = new Map(
    (meet.races || [])
      .filter(r => !r.isOpenRace && !r.isQuadRace && !['heat', 'semi'].includes(String(r.stage || '')))
      .map(r => [baseRaceKey(r.groupId, r.division, r.dayIndex, r.distanceLabel), r])
  );

  const races = [];
  let orderHint = 1;

  for (const group of meet.groups || []) {
    for (const divKey of ['novice', 'elite']) {
      const div = group.divisions?.[divKey];
      if (!div || !div.enabled) continue;

      const distances = normalizeDistances(div.distances);

      for (let i = 0; i < 4; i++) {
        const distance = distances[i];
        if (!distance) continue;

        const key = baseRaceKey(group.id, divKey, i + 1, distance);
        const old = oldMap.get(key);
        const isOpen = isOpenDivision(divKey);
        const ages = String(div.ages || group.ages || '').trim();

        races.push({
          id: old?.id || ('r' + crypto.randomBytes(6).toString('hex')),
          orderHint: orderHint++,
          groupId: group.id,
          groupLabel: group.label,
          ages,
          division: divKey,
          distanceLabel: distance,
          dayIndex: i + 1,
          cost: Number(div.cost || 0),
          stage: isOpen ? 'final' : (old?.stage || 'race'),
          heatNumber: isOpen ? 0 : Number(old?.heatNumber || 0),
          parentRaceKey: old?.parentRaceKey || key,
          startType: isOpen ? 'rolling' : (old?.startType || 'standing'),
          countsForOverall: isOpen ? false : (
            typeof old?.countsForOverall === 'boolean' ? old.countsForOverall : true
          ),
          laneEntries: Array.isArray(old?.laneEntries) ? old.laneEntries : [],
          resultsMode: old?.resultsMode || 'places',
          status: old?.status || 'open',
          notes: String(old?.notes || ''),
          isFinal: isOpen ? true : !!old?.isFinal,
          closedAt: old?.closedAt || '',
          isOpenRace: false,
          isQuadRace: false,
        });
      }
    }
  }

  const existingSpecial = (meet.races || []).filter(r => r.isOpenRace || r.isQuadRace);

  for (const r of existingSpecial) races.push(r);

  const validIds = new Set(races.map(r => r.id));

  meet.blocks = (meet.blocks || []).map(block => ({
    ...block,
    raceIds: (block.raceIds || []).filter(rid => validIds.has(rid)),
  }));

  meet.races = races;

  if (!validIds.has(meet.currentRaceId)) {
    meet.currentRaceId = '';
    meet.currentRaceIndex = -1;
  }

  meet.updatedAt = nowIso();
}

function generateOpenRacesForMeet(meet) {
  const nonOpenRaces = (meet.races || []).filter(r => !r.isOpenRace && !r.isTimeTrial);
  const openRaces = [];
  let orderHint = 9000;

  const TT_ORDER = [
    'open_juv_girls',
    'open_juv_boys',
    'open_fresh_girls',
    'open_fresh_boys',
    'open_sr_ladies',
    'open_sr_men',
    'open_mast_ladies',
    'open_mast_men',
  ];

  for (const og of meet.openGroups || []) {
    if (!og.enabled || !og.distance) continue;

    const existingRace = (meet.races || []).find(
      r => r.isOpenRace && r.groupId === og.id && !r.isTimeTrial
    );

    openRaces.push({
      id: existingRace?.id || ('r' + crypto.randomBytes(6).toString('hex')),
      orderHint: orderHint++,
      groupId: og.id,
      groupLabel: og.label,
      ages: og.ages,
      division: 'open',
      distanceLabel: og.distance,
      dayIndex: 1,
      cost: Number(og.cost || 0),
      stage: 'final',
      heatNumber: 0,
      parentRaceKey: `open|${og.id}`,
      startType: 'rolling',
      countsForOverall: false,
      laneEntries: Array.isArray(existingRace?.laneEntries) ? existingRace.laneEntries : [],
      resultsMode: existingRace?.resultsMode || 'places',
      status: existingRace?.status || 'open',
      notes: String(existingRace?.notes || ''),
      isFinal: true,
      closedAt: existingRace?.closedAt || '',
      isOpenRace: true,
      isQuadRace: false,
      isTimeTrial: false,
    });
  }

  let ttOrderHint = 9500;
  const ttSorted = [...(meet.openGroups || [])].sort(
    (a, b) => TT_ORDER.indexOf(a.id) - TT_ORDER.indexOf(b.id)
  );

  for (const og of ttSorted) {
    if (!og.timeTrial) continue;

    const dist = og.ttDistance || og.distance || '';
    const existingTT = (meet.races || []).find(r => r.isTimeTrial && r.groupId === og.id);

    openRaces.push({
      id: existingTT?.id || ('r' + crypto.randomBytes(6).toString('hex')),
      orderHint: ttOrderHint++,
      groupId: og.id,
      groupLabel: og.label + ' — Time Trial',
      ages: og.ages,
      division: 'open',
      distanceLabel: dist,
      dayIndex: 1,
      cost: 0,
      stage: 'final',
      heatNumber: 0,
      parentRaceKey: `tt|${og.id}`,
      startType: 'individual',
      countsForOverall: false,
      laneEntries: Array.isArray(existingTT?.laneEntries) ? existingTT.laneEntries : [],
      resultsMode: 'times',
      status: existingTT?.status || 'open',
      notes: String(existingTT?.notes || ''),
      isFinal: true,
      closedAt: existingTT?.closedAt || '',
      isOpenRace: false,
      isQuadRace: false,
      isTimeTrial: true,
    });
  }

  meet.races = [...nonOpenRaces, ...openRaces];
  meet.updatedAt = nowIso();
}

function generateQuadRacesForMeet(meet) {
  const nonQuadRaces = (meet.races || []).filter(r => !r.isQuadRace);
  const quadRaces = [];
  let orderHint = 8000;

  for (const qg of meet.quadGroups || []) {
    if (!qg.enabled) continue;

    const distances = (qg.distances || []).filter(Boolean);

    distances.forEach((distance, i) => {
      const existingRace = (meet.races || []).find(
        r => r.isQuadRace && r.groupId === qg.id && r.distanceLabel === distance
      );

      quadRaces.push({
        id: existingRace?.id || ('r' + crypto.randomBytes(6).toString('hex')),
        orderHint: orderHint++,
        groupId: qg.id,
        groupLabel: qg.label,
        ages: qg.ages,
        division: 'quad',
        distanceLabel: distance,
        dayIndex: i + 1,
        cost: Number(qg.cost || 0),
        stage: existingRace?.stage || 'race',
        heatNumber: Number(existingRace?.heatNumber || 0),
        parentRaceKey: existingRace?.parentRaceKey || `quad|${qg.id}|${distance}`,
        startType: existingRace?.startType || 'standing',
        countsForOverall: typeof existingRace?.countsForOverall === 'boolean'
          ? existingRace.countsForOverall
          : true,
        laneEntries: Array.isArray(existingRace?.laneEntries) ? existingRace.laneEntries : [],
        resultsMode: existingRace?.resultsMode || 'places',
        status: existingRace?.status || 'open',
        notes: String(existingRace?.notes || ''),
        isFinal: !!existingRace?.isFinal,
        closedAt: existingRace?.closedAt || '',
        isOpenRace: false,
        isQuadRace: true,
      });
    });
  }

  meet.races = [...nonQuadRaces, ...quadRaces];
  meet.updatedAt = nowIso();
}

function rebuildRaceAssignments(meet) {
  ensureRegistrationTotalsAndNumbers(meet);

  const laneCount = Math.max(1, Number(meet.lanes) || 4);
  const originalBlocks = (meet.blocks || []).map(block => ({
    ...block,
    raceIds: [...(block.raceIds || [])],
  }));

  const baseRaces = (meet.races || []).filter(
    r =>
      !r.isOpenRace &&
      !r.isQuadRace &&
      !r.isTimeTrial &&
      !r.isRelayRace &&
      !['heat', 'semi'].includes(String(r.stage || ''))
  );

  const newRaces = [];

  for (const baseRace of baseRaces) {
    const matchingRegs = (meet.registrations || []).filter(
      reg => registrationMatchesStandardRace(reg, baseRace, meet)
    );

    newRaces.push(...buildRaceSetForEntries(baseRace, matchingRegs, laneCount));
  }

  const quadBaseRaces = (meet.races || []).filter(
    r => r.isQuadRace && !['heat', 'semi'].includes(String(r.stage || ''))
  );

  for (const baseRace of quadBaseRaces) {
    const raceSet = buildRaceSetForEntries(baseRace, [], laneCount);
    newRaces.push(...raceSet);
  }

  const openRaces = (meet.races || []).filter(
    r => r.isOpenRace || r.isTimeTrial || r.isRelayRace
  );

  newRaces.push(...openRaces);

  const mappedBlocks = originalBlocks.map(block => {
    const nextRaceIds = [];

    for (const oldRid of block.raceIds || []) {
      const oldRace = (meet.races || []).find(r => r.id === oldRid);
      if (!oldRace) continue;

      if (oldRace.isOpenRace || oldRace.isTimeTrial || oldRace.isRelayRace) {
        if (!nextRaceIds.includes(oldRace.id)) nextRaceIds.push(oldRace.id);
        continue;
      }

      const parentKey =
        oldRace.parentRaceKey ||
        baseRaceKey(
          oldRace.groupId,
          oldRace.division,
          oldRace.dayIndex,
          oldRace.distanceLabel
        );

      const replacements = newRaces.filter(r => (r.parentRaceKey || '') === parentKey);

      for (const rep of replacements) {
        if (!nextRaceIds.includes(rep.id)) nextRaceIds.push(rep.id);
      }
    }

    return {
      ...block,
      raceIds: nextRaceIds,
    };
  });

  meet.races = newRaces;
  meet.blocks = mappedBlocks;
  meet.updatedAt = nowIso();

  ensureCurrentRace(meet);
}

module.exports = {
  generateBaseRacesForMeet,
  generateOpenRacesForMeet,
  generateQuadRacesForMeet,
  rebuildRaceAssignments,
};
