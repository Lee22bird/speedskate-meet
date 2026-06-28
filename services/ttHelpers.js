const crypto = require('crypto');
const { nowIso } = require('../utils/date');
const { ageForReg, ageMatch, ensureRegistrationTotalsAndNumbers, buildRaceSetForEntries,
        divisionEnabledForRegistration, registrationMatchesStandardRace, baseRaceKey, ensureAtLeastOneBlock } = require('./meetHelpers');
const { ensureCurrentRace } = require('./raceDay');
const { assignRandomLaneEntries, reRandomizeLaneEntries } = require('./laneAssignment');

function genderBucket(value) {
  const v=String(value||'').trim().toLowerCase();
  if(['girls','girl','women','woman','female','ladies','lady'].includes(v)) return 'female';
  if(['boys','boy','men','man','male'].includes(v)) return 'male';
  return '';
}

function openGroupForTimeTrialReg(meet, reg) {
  const age = ageForReg(reg, meet);
  const regBucket = genderBucket(reg.gender);
  const enabledGroups = (meet.openGroups || []).filter(g => g.timeTrial);
  return enabledGroups.find(g => ageMatch(g.ages, age) && (!regBucket || !genderBucket(g.gender) || genderBucket(g.gender) === regBucket))
    || enabledGroups.find(g => ageMatch(g.ages, age))
    || null;
}

function timeTrialRaceForMeet(meet) {
  return (meet.races || []).find(r => r.isTimeTrial && String(r.parentRaceKey || '') === 'time_trials_100m')
    || (meet.races || []).find(r => r.isTimeTrial);
}

function timeTrialEntriesForMeet(meet) {
  const race = timeTrialRaceForMeet(meet);
  const existingByReg = new Map((race?.laneEntries || []).map(e => [String(e.registrationId || ''), e]));
  return (meet.registrations || [])
    .filter(reg => reg.options?.timeTrials)
    .map(reg => {
      const og = openGroupForTimeTrialReg(meet, reg);
      const previous = existingByReg.get(String(reg.id)) || {};
      const age = ageForReg(reg, meet);
      return {
        lane: Number(previous.lane || 0),
        registrationId: reg.id,
        helmetNumber: reg.helmetNumber || '',
        skaterName: reg.name || '',
        team: reg.team || '',
        age,
        gender: reg.gender || '',
        groupId: og?.id || '',
        groupLabel: og?.label || reg.divisionGroupLabel || 'Time Trial',
        groupAges: og?.ages || '',
        place: previous.place || '',
        time: previous.time || '',
        status: previous.status || '',
      };
    })
    .sort((a,b) =>
      Number(a.age || 999) - Number(b.age || 999) ||
      String(a.gender || '').localeCompare(String(b.gender || '')) ||
      String(a.skaterName || '').localeCompare(String(b.skaterName || ''))
    )
    .map((entry, idx) => ({...entry, lane: idx + 1}));
}

function rebuildTimeTrialRace(meet) {
  const oldTTRaces = (meet.races || []).filter(r => r.isTimeTrial);
  const previousEntries = oldTTRaces.flatMap(r => Array.isArray(r.laneEntries) ? r.laneEntries : []);
  const previousByReg = new Map(previousEntries.map(e => [String(e.registrationId || ''), e]));

  meet.races = (meet.races || []).filter(r => !r.isTimeTrial);
  const enabled = !!meet.timeTrialsEnabled || (meet.openGroups || []).some(g => g.timeTrial);
  if (!enabled) return null;

  const race = {
    id: oldTTRaces[0]?.id || ('r' + crypto.randomBytes(6).toString('hex')),
    orderHint: 7600,
    groupId: 'time_trials',
    groupLabel: 'Time Trial Session',
    ages: '0-100',
    division: 'time-trial',
    distanceLabel: '100m',
    dayIndex: 1,
    cost: 0,
    stage: 'final',
    heatNumber: 0,
    parentRaceKey: 'time_trials_100m',
    startType: 'individual',
    countsForOverall: false,
    laneEntries: [],
    resultsMode: 'times',
    status: oldTTRaces.some(r=>r.status==='closed') ? 'closed' : 'open',
    notes: '100m / 1 lap • one rolling queue • youngest to oldest',
    isFinal: true,
    closedAt: oldTTRaces.find(r=>r.closedAt)?.closedAt || '',
    isOpenRace: false, isQuadRace: false, isTimeTrial: true,
    isRelayRace: false, isAdditionalRace: false, isSkateabilityRace: false,
  };

  race.laneEntries = timeTrialEntriesForMeet({...meet, races:[...(meet.races || []), { ...race, laneEntries: previousEntries }]})
    .map(entry => {
      const prev = previousByReg.get(String(entry.registrationId || '')) || {};
      return { ...entry, time: prev.time || entry.time || '', place: prev.place || '', status: prev.status || '' };
    });

  const timed = race.laneEntries.filter(e => String(e.time || '').trim());
  const sorted = [...timed].sort((a,b)=>parseFloat(a.time||'999')-parseFloat(b.time||'999'));
  sorted.forEach((e,i)=>{
    const orig = race.laneEntries.find(x=>String(x.registrationId||'')===String(e.registrationId||''));
    if(orig) orig.place = String(i+1);
  });

  meet.races.push(race);
  return race;
}

function timeTrialLeaderboards(meet, race) {
  const entries = (race?.laneEntries || []).filter(e => String(e.time || '').trim());
  const sorted = [...entries].sort((a,b)=>parseFloat(a.time||'999')-parseFloat(b.time||'999'));
  const regMap = new Map((meet.registrations || []).map(r => [String(r.id), r]));
  const withMeta = sorted.map(e => {
    const reg = regMap.get(String(e.registrationId || ''));
    const og = reg ? openGroupForTimeTrialReg(meet, reg) : null;
    return {...e, genderBucket: genderBucket(reg?.gender || e.gender), groupId: og?.id || e.groupId || '', groupLabel: og?.label || e.groupLabel || 'Time Trial'};
  });
  const byGroup = (meet.openGroups || []).filter(g => g.timeTrial).map(g => ({
    group: g,
    rows: withMeta.filter(e => String(e.groupId || '') === String(g.id)).slice(0,3),
  })).filter(x => x.rows.length);
  return {
    overallFemale: withMeta.filter(e => e.genderBucket === 'female').slice(0,3),
    overallMale: withMeta.filter(e => e.genderBucket === 'male').slice(0,3),
    byGroup,
    overall: withMeta.slice(0,3),
  };
}

// ── Race signature / block restore helpers ────────────────────────────────────

function raceImportSignature(race) {
  return [String(race?.parentRaceKey||''),String(race?.groupId||''),String(race?.division||''),String(race?.dayIndex||''),String(race?.distanceLabel||''),String(race?.stage||''),String(race?.heatNumber||'')].join('|');
}

function raceFamilySignature(race) {
  const type = race?.isQuadRace||String(race?.division||'').toLowerCase()==='quad'?'quad':race?.isOpenRace||String(race?.division||'').toLowerCase()==='open'?'open':race?.isRelayRace||String(race?.division||'').toLowerCase()==='relay'?'relay':race?.isAdditionalRace||race?.isSkateabilityRace||['additional','skateability'].includes(String(race?.division||'').toLowerCase())?'additional':race?.isTimeTrial?'time_trial':'standard';
  return [type,String(race?.parentRaceKey||''),String(race?.groupId||''),String(race?.division||''),String(race?.dayIndex||''),String(race?.distanceLabel||'')].join('|');
}

function raceStageRankForRestore(race) {
  const stage=String(race?.stage||'').toLowerCase();
  if(stage==='heat') return 10+Number(race?.heatNumber||0);
  if(stage==='semi') return 50+Number(race?.heatNumber||0);
  if(stage==='final') return 100;
  return 90;
}

function addRaceIdsUnique(target, ids) {
  for(const id of ids||[]){const sid=String(id||'');if(sid&&!target.includes(sid))target.push(sid);}
}

function raceGenderBucketFromLabelOrGender(value) {
  const v=String(value||'').toLowerCase();
  if(['girls','girl','women','woman','female','ladies','lady'].includes(v)||/girls|women|ladies|female/.test(v)) return 'female';
  if(['boys','boy','men','man','male'].includes(v)||/boys|men|male/.test(v)) return 'male';
  return '';
}

function raceMatchesRegAgeGender(race, reg, meet) {
  const age=ageForReg(reg,meet);
  if(String(race.ages||'').trim()&&!ageMatch(race.ages,age)) return false;
  const raceBucket=raceGenderBucketFromLabelOrGender(race.gender||race.groupLabel||race.groupId||'');
  const regBucket=raceGenderBucketFromLabelOrGender(reg.gender||'');
  return !raceBucket||!regBucket||raceBucket===regBucket;
}

// Kept as a named export for backward compatibility — now assigns lanes via a
// random shuffle (see services/laneAssignment.js) rather than registration order.
function assignSequentialLaneEntries(regs) {
  return assignRandomLaneEntries(regs);
}

function restoreBlockAssignmentsBySignature(meet, previousBlocks, previousRaces) {
  const previousById=new Map((previousRaces||[]).map(r=>[String(r.id||''),r]));
  const currentIds=new Set((meet.races||[]).map(r=>String(r.id||'')));
  const currentBySignature=new Map();
  const currentByFamily=new Map();
  for(const race of meet.races||[]){
    const id=String(race.id||'');
    const sig=raceImportSignature(race);
    if(!currentBySignature.has(sig))currentBySignature.set(sig,[]);
    currentBySignature.get(sig).push(id);
    const family=raceFamilySignature(race);
    if(!currentByFamily.has(family))currentByFamily.set(family,[]);
    currentByFamily.get(family).push(race);
  }
  for(const races of currentByFamily.values()){
    races.sort((a,b)=>{const byStage=raceStageRankForRestore(a)-raceStageRankForRestore(b);if(byStage!==0)return byStage;return Number(a.orderHint||0)-Number(b.orderHint||0);});
  }
  meet.blocks=(previousBlocks||[]).map(block=>{
    const nextIds=[];
    const oldRacesInBlock=(block.raceIds||[]).map(id=>previousById.get(String(id||''))).filter(Boolean);
    const oldFamilyStageCounts=new Map();
    for(const oldRace of oldRacesInBlock){const family=raceFamilySignature(oldRace);if(!oldFamilyStageCounts.has(family))oldFamilyStageCounts.set(family,new Set());oldFamilyStageCounts.get(family).add(String(oldRace.stage||'').toLowerCase()||'race');}
    for(const oldIdRaw of block.raceIds||[]){
      const oldId=String(oldIdRaw||'');const oldRace=previousById.get(oldId);
      if(!oldRace){if(currentIds.has(oldId))addRaceIdsUnique(nextIds,[oldId]);continue;}
      const family=raceFamilySignature(oldRace);const familyRaces=currentByFamily.get(family)||[];const familyStages=oldFamilyStageCounts.get(family)||new Set();
      const oldStage=String(oldRace.stage||'').toLowerCase();const isFinalish=oldStage==='final'||oldStage==='race'||oldRace.isFinal;
      const oldBlockAlreadyHadHeatForFamily=familyStages.has('heat')||familyStages.has('semi');
      const currentFamilyHasHeats=familyRaces.some(r=>['heat','semi'].includes(String(r.stage||'').toLowerCase()));
      if(isFinalish&&!oldBlockAlreadyHadHeatForFamily&&currentFamilyHasHeats){addRaceIdsUnique(nextIds,familyRaces.map(r=>String(r.id||'')));continue;}
      if(currentIds.has(oldId)){addRaceIdsUnique(nextIds,[oldId]);continue;}
      const exactReplacements=currentBySignature.get(raceImportSignature(oldRace))||[];
      if(exactReplacements.length){addRaceIdsUnique(nextIds,exactReplacements);continue;}
      addRaceIdsUnique(nextIds,familyRaces.map(r=>String(r.id||'')));
    }
    return{...block,raceIds:nextIds};
  });
}

// Re-randomizes lane numbers for a single already-built race in place.
// Does NOT touch heat membership, race order, blocks, or scheduling — only
// which lane each currently-entered skater holds. Used by the "Re-Randomize
// Lanes" race action so officials can redraw lanes without rebuilding the meet.
function reRandomizeRaceLanes(meet, raceId) {
  const race = (meet.races || []).find(r => String(r.id) === String(raceId));
  if (!race) return { ok: false, error: 'Race not found.' };
  if (race.isRelayRace) return { ok: false, error: 'Relay lane assignments are not randomized.' };
  if (race.isTimeTrial) return { ok: false, error: 'Time trial entries do not use fixed lanes.' };
  race.laneEntries = reRandomizeLaneEntries(race.laneEntries);
  meet.updatedAt = nowIso();
  return { ok: true, race };
}

function rebuildRaceAssignmentsSafe(meet) {
  ensureRegistrationTotalsAndNumbers(meet);
  const laneCount=Math.max(1,Number(meet.lanes)||4);
  const previousBlocks=JSON.parse(JSON.stringify(meet.blocks||[]));
  const previousRaces=JSON.parse(JSON.stringify(meet.races||[]));
  const newRaces=[];const seenBaseKeys=new Set();
  const isSpecialRace=(race)=>race.isOpenRace||race.isQuadRace||race.isTimeTrial||race.isRelayRace||race.isAdditionalRace||race.isSkateabilityRace||String(race.division||'')==='additional'||String(race.division||'')==='skateability';
  const baseKeyFor=(race)=>String(race.parentRaceKey||baseRaceKey(race.groupId,race.division,race.dayIndex,race.distanceLabel));
  for(const race of meet.races||[]){
    if(isSpecialRace(race))continue;if(['heat','semi'].includes(String(race.stage||'')))continue;
    const key=baseKeyFor(race);if(seenBaseKeys.has(key))continue;seenBaseKeys.add(key);
    const matchingRegs=(meet.registrations||[]).filter(reg=>registrationMatchesStandardRace(reg,race,meet));
    newRaces.push(...buildRaceSetForEntries({...race,parentRaceKey:key},matchingRegs,laneCount));
  }
  const quadBaseKeys=new Set();
  for(const race of meet.races||[]){
    if(!race.isQuadRace)continue;if(['heat','semi'].includes(String(race.stage||'')))continue;
    const key=baseKeyFor(race);if(quadBaseKeys.has(key))continue;quadBaseKeys.add(key);
    const matchingRegs=(meet.registrations||[]).filter(reg=>!!reg.options?.quad&&raceMatchesRegAgeGender(race,reg,meet));
    newRaces.push(...buildRaceSetForEntries({...race,parentRaceKey:key,division:'quad',isQuadRace:true},matchingRegs,laneCount));
  }
  for(const race of meet.races||[]){
    if(!race.isOpenRace||race.isTimeTrial)continue;
    const matchingRegs=(meet.registrations||[]).filter(reg=>!!reg.options?.open&&raceMatchesRegAgeGender(race,reg,meet));
    newRaces.push({...race,stage:'final',heatNumber:0,isFinal:true,startType:race.startType||'rolling',countsForOverall:false,laneEntries:assignSequentialLaneEntries(matchingRegs)});
  }
  for(const race of meet.races||[]){
    const isAdditional=race.isAdditionalRace||race.isSkateabilityRace||String(race.division||'')==='additional'||String(race.division||'')==='skateability';
    if(!isAdditional)continue;
    const matchingRegs=(meet.registrations||[]).filter(reg=>{const selected=!!(reg.options?.additional||reg.options?.skateability);const selectedGroup=String(reg.options?.additionalGroupId||reg.options?.skateabilityGroupId||'');return selected&&(!selectedGroup||selectedGroup===String(race.groupId||''));});
    newRaces.push({...race,division:'additional',isAdditionalRace:true,isSkateabilityRace:false,countsForOverall:false,laneEntries:assignSequentialLaneEntries(matchingRegs)});
  }
  for(const race of meet.races||[]){if(race.isRelayRace)newRaces.push(race);}
  meet.races=newRaces;
  rebuildTimeTrialRace(meet);
  restoreBlockAssignmentsBySignature(meet,previousBlocks,previousRaces);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  meet.updatedAt=nowIso();
}

module.exports = {
  genderBucket,
  openGroupForTimeTrialReg,
  timeTrialRaceForMeet,
  timeTrialEntriesForMeet,
  rebuildTimeTrialRace,
  timeTrialLeaderboards,
  raceImportSignature,
  raceFamilySignature,
  raceStageRankForRestore,
  addRaceIdsUnique,
  raceGenderBucketFromLabelOrGender,
  raceMatchesRegAgeGender,
  assignSequentialLaneEntries,
  restoreBlockAssignmentsBySignature,
  rebuildRaceAssignmentsSafe,
  reRandomizeRaceLanes,
};
