const crypto = require('crypto');
const { nowIso } = require('../utils/date');
const { esc, cap } = require('../utils/html');
const { hasRole } = require('../utils/auth');
const { calculateRegistrationTotal } = require('./pricing');
const { computeMeetStandings } = require('./standings');
const {
  generateBaseRacesForMeet,
  generateOpenRacesForMeet,
  generateQuadRacesForMeet,
} = require('./raceGenerator');
const {
  defaultPricingFields,
  normalizeMeetPricingFields,
} = require('./pricingModel');

// USARS SR150.1: ages are reckoned as of January 1 of the competitive year.
function usarsAge(birthdate, meetDate) {
  const refYear = meetDate ? new Date(meetDate).getFullYear() : new Date().getFullYear();
  if (!birthdate) return null;

  const bd = new Date(birthdate);
  if (isNaN(bd.getTime())) return null;

  const jan1 = new Date(refYear, 0, 1);
  let age = jan1.getFullYear() - bd.getFullYear();

  if (
    jan1.getMonth() < bd.getMonth() ||
    (jan1.getMonth() === bd.getMonth() && jan1.getDate() < bd.getDate())
  ) {
    age--;
  }

  return age;
}

function ageForReg(reg, meet) {
  if (reg.birthdate) return usarsAge(reg.birthdate, meet?.date) ?? Number(reg.age||0);
  return Number(reg.age||0);
}

const OPEN_GROUP_DEFAULTS = [
  { id: 'open_juv_girls',   label: 'Juvenile Girls',   ages: '9 & Under',  gender: 'girls', defaultDistance: '1500m' },
  { id: 'open_juv_boys',    label: 'Juvenile Boys',    ages: '9 & Under',  gender: 'boys',  defaultDistance: '1500m' },
  { id: 'open_fresh_girls', label: 'Freshman Girls',   ages: '10-13',      gender: 'girls', defaultDistance: '2000m' },
  { id: 'open_fresh_boys',  label: 'Freshman Boys',    ages: '10-13',      gender: 'boys',  defaultDistance: '2000m' },
  { id: 'open_soph_girls',  label: 'Sophomore Girls',  ages: '14-17',      gender: 'girls', defaultDistance: '2000m' },
  { id: 'open_soph_boys',   label: 'Sophomore Boys',   ages: '14-17',      gender: 'boys',  defaultDistance: '2000m' },
  { id: 'open_sr_ladies',   label: 'Senior Ladies',    ages: '14 & Older', gender: 'women', defaultDistance: '3000m' },
  { id: 'open_sr_men',      label: 'Senior Men',       ages: '14 & Older', gender: 'men',   defaultDistance: '5000m' },
  { id: 'open_mast_ladies', label: 'Masters Ladies',   ages: '35 & Older', gender: 'women', defaultDistance: '1500m' },
  { id: 'open_mast_men',    label: 'Masters Men',      ages: '35 & Older', gender: 'men',   defaultDistance: '2000m' },
];

function makeOpenGroupsTemplate() {
  return OPEN_GROUP_DEFAULTS.map(g => ({
    id: g.id, label: g.label, ages: g.ages, gender: g.gender,
    enabled: false, distance: g.defaultDistance, cost: 0,
    timeTrial: false, ttDistance: '',
  }));
}

const QUAD_GROUP_DEFAULTS = [
  { id: 'quad_juv_girls',   label: 'Quad Juvenile Girls',  ages: '9 & Under',  gender: 'girls', distances: ['200m', '500m'] },
  { id: 'quad_juv_boys',    label: 'Quad Juvenile Boys',   ages: '9 & Under',  gender: 'boys',  distances: ['200m', '500m'] },
  { id: 'quad_fresh_girls', label: 'Quad Freshman Girls',  ages: '10-13',      gender: 'girls', distances: ['300m', '700m'] },
  { id: 'quad_fresh_boys',  label: 'Quad Freshman Boys',   ages: '10-13',      gender: 'boys',  distances: ['300m', '700m'] },
  { id: 'quad_sr_ladies',   label: 'Quad Senior Ladies',   ages: '14 & Older', gender: 'women', distances: ['300m', '1000m'] },
  { id: 'quad_sr_men',      label: 'Quad Senior Men',      ages: '14 & Older', gender: 'men',   distances: ['300m', '1000m'] },
  { id: 'quad_mast_ladies', label: 'Quad Masters Ladies',  ages: '35 & Older', gender: 'women', distances: ['300m', '1000m'] },
  { id: 'quad_mast_men',    label: 'Quad Masters Men',     ages: '35 & Older', gender: 'men',   distances: ['300m', '1000m'] },
];

function makeQuadGroupsTemplate() {
  return QUAD_GROUP_DEFAULTS.map(g => ({
    id: g.id, label: g.label, ages: g.ages, gender: g.gender,
    enabled: false, distances: [...g.distances], cost: 0,
  }));
}

function makeAdditionalRaceSlots(raw) {
  const saved = Array.isArray(raw) ? raw : [];
  return [0,1,2,3].map(i => {
    const id = 'manual_extra_' + (i + 1);
    const match = saved.find(x => String(x.id || '') === id) || {};
    let label = String(match.ageGroupLabel || match.title || '').trim();

    // Only replace blank/old generic placeholders.
    // Do NOT wipe a custom title like “Skatability” if the meet director typed it.
    if (!label || /^manual extra race/i.test(label)) {
      label = `Additional ${i + 1}`;
    }

    return {
      id,
      ageGroupId: '',
      ageGroupLabel: label,
      ages: String(match.ages || '').trim(),
      enabled: !!match.enabled,
      distances: Array.isArray(match.distances) ? [0,1,2].map(n => String(match.distances[n] || '').trim()) : ['', '', ''],
    };
  });
}

// Backwards-compatible wrapper for older saved meets/routes.
// New code should use additionalGroups/additionalRaces language.
function makeManualExtraRaceSlots(raw) {
  return makeAdditionalRaceSlots(raw);
}


function nextId(arr) { let max=0; for(const item of arr||[]) max=Math.max(max,Number(item.id)||0); return max+1; }

function makeDivisionsTemplate() {
  return {
    novice:{enabled:false,cost:0,distances:['','','','']},
    elite: {enabled:false,cost:0,distances:['','','','']},
    open:  {enabled:false,cost:0,distances:['','','','']},
  };
}

function baseGroups() {
  return [
    {id:'tiny_tot_girls',  label:'Tiny Tot Girls',   ages:'5 & under',gender:'girls'},
    {id:'tiny_tot_boys',   label:'Tiny Tot Boys',    ages:'5 & under',gender:'boys'},
    {id:'primary_girls',   label:'Primary Girls',    ages:'6-7',      gender:'girls'},
    {id:'primary_boys',    label:'Primary Boys',     ages:'6-7',      gender:'boys'},
    {id:'juvenile_girls',  label:'Juvenile Girls',   ages:'8-9',      gender:'girls'},
    {id:'juvenile_boys',   label:'Juvenile Boys',    ages:'8-9',      gender:'boys'},
    {id:'elementary_girls',label:'Elementary Girls', ages:'10-11',    gender:'girls'},
    {id:'elementary_boys', label:'Elementary Boys',  ages:'10-11',    gender:'boys'},
    {id:'freshman_girls',  label:'Freshman Girls',   ages:'12-13',    gender:'girls'},
    {id:'freshman_boys',   label:'Freshman Boys',    ages:'12-13',    gender:'boys'},
    {id:'sophomore_girls', label:'Sophomore Girls',  ages:'14-15',    gender:'girls'},
    {id:'sophomore_boys',  label:'Sophomore Boys',   ages:'14-15',    gender:'boys'},
    {id:'junior_women',    label:'Junior Women',     ages:'16-17',    gender:'women'},
    {id:'junior_men',      label:'Junior Men',       ages:'16-17',    gender:'men'},
    {id:'senior_women',    label:'Senior Women',     ages:'18-24',    gender:'women'},
    {id:'senior_men',      label:'Senior Men',       ages:'18-24',    gender:'men'},
    {id:'classic_women',   label:'Classic Women',    ages:'25-34',    gender:'women'},
    {id:'classic_men',     label:'Classic Men',      ages:'25-34',    gender:'men'},
    {id:'master_women',    label:'Master Women',     ages:'35-44',    gender:'women'},
    {id:'master_men',      label:'Master Men',       ages:'35-44',    gender:'men'},
    {id:'veteran_women',   label:'Veteran Women',    ages:'45-54',    gender:'women'},
    {id:'veteran_men',     label:'Veteran Men',      ages:'45-54',    gender:'men'},
    {id:'esquire_women',   label:'Esquire Women',    ages:'55+',      gender:'women'},
    {id:'esquire_men',     label:'Esquire Men',      ages:'55+',      gender:'men'},
  ].map(g=>({...g,divisions:makeDivisionsTemplate()}));
}

function defaultMeet(ownerUserId) {
  return {
    id:null, createdByUserId:ownerUserId, createdAt:nowIso(), updatedAt:nowIso(),
    meetName:'New Meet', date:'', endDate:'', startTime:'', registrationCloseAt:'',
    rinkId:1, customRinkName:'', trackLength:100, lanes:4,
    timeTrialsEnabled:false, relayEnabled:false, judgesPanelRequired:true,
    notes:'', scheduleNotes:'', relayNotes:'', isPublic:false, status:'draft', tiebreaker:'d2',
    ...defaultPricingFields(),
    groups:baseGroups(), openGroups:makeOpenGroupsTemplate(), quadGroups:makeQuadGroupsTemplate(),
    races:[], blocks:[], registrations:[], additionalGroups:makeAdditionalRaceSlots([]), additionalRaceGroups:makeAdditionalRaceSlots([]), additionalRaces:makeAdditionalRaceSlots([]), skateabilityGroups:makeAdditionalRaceSlots([]),
    currentRaceId:'', currentRaceIndex:-1, raceDayPaused:false,
  };
}


function ensureLeeSuperAdmin(db) {
  if (!Array.isArray(db.users)) db.users = [];

  const wantedRoles = ['super_admin', 'meet_director', 'judge', 'announcer', 'coach'];
  const matches = (db.users || []).filter(u => {
    const username = String(u.username || '').trim().toLowerCase();
    const email = String(u.email || '').trim().toLowerCase();
    return username === 'lbird22' || email === 'thegoatbird@me.com';
  });

  if (!matches.length) {
    db.users.unshift({
      id: nextUserId(db),
      username: 'Lbird22',
      password: ADMIN_PASSWORD,
      email: 'thegoatbird@me.com',
      displayName: 'Lee Bird',
      roles: wantedRoles,
      team: 'Midwest Racing',
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    return;
  }

  for (const user of matches) {
    user.active = true;
    user.displayName = user.displayName || 'Lee Bird';
    user.team = user.team || 'Midwest Racing';
    user.email = user.email || 'thegoatbird@me.com';
    user.roles = Array.from(new Set([...(Array.isArray(user.roles) ? user.roles : []), ...wantedRoles]));
    if (String(user.username || '').trim().toLowerCase() === 'lbird22' && !user.password) {
      user.password = ADMIN_PASSWORD;
    }
    user.updatedAt = nowIso();
  }
}

function defaultDb() {
  return {
    version:19, createdAt:nowIso(), updatedAt:nowIso(), sessions:[],
    users:[{
      id:1, username:ADMIN_USERNAME, password:ADMIN_PASSWORD,
      displayName:'Lee Bird', roles:['super_admin','meet_director','judge','coach'],
      team:'Midwest Racing', active:true, createdAt:nowIso(),
    }],
    rinks:[{
      id:1, name:'Roller City', city:'Wichita', state:'KS', team:'',
      address:'3234 S. Meridian Ave, Wichita, KS 67217',
      phone:'316-942-4555', website:'rollercitywichitaks.com', notes:'',
    }],
    meets:[], rosters:[], setupPresets:[],
  };
}

function sanitizeRinks(db) {
  db.rinks=(db.rinks||[]).filter(r=>String(r.name||'').trim().toLowerCase()!=='wichita skate center');
  const rc=(db.rinks||[]).find(r=>String(r.name||'').trim().toLowerCase()==='roller city');
  if(!rc) { db.rinks.unshift(defaultDb().rinks[0]); }
  else { rc.city='Wichita';rc.state='KS';rc.address='3234 S. Meridian Ave, Wichita, KS 67217';rc.phone='316-942-4555';rc.website='rollercitywichitaks.com'; }
}

function normalizeDivisionSet(divs) {
  const out=divs||{};
  for(const key of ['novice','elite']) {
    if(!out[key]) out[key]={enabled:false,cost:0,ages:'',distances:['','','','']};
    out[key].enabled=!!out[key].enabled;
    out[key].cost=Number(out[key].cost||0);
    out[key].ages=String(out[key].ages||'').trim();
    if(!Array.isArray(out[key].distances)) out[key].distances=['','','',''];
    out[key].distances=[0,1,2,3].map(i=>String(out[key].distances[i]||'').trim());
  } return out;
}

function normalizeOpenGroups(raw) {
  const defaults=makeOpenGroupsTemplate();
  if(!Array.isArray(raw)||raw.length===0) return defaults;
  return defaults.map(def=>{
    const saved=raw.find(r=>r.id===def.id); if(!saved) return def;
    return {id:def.id,label:def.label,ages:String(saved.ages || def.ages || '').trim(),gender:def.gender,
      enabled:!!saved.enabled, distance:String(saved.distance||def.defaultDistance||'').trim(), cost:Number(saved.cost||0),
      timeTrial:!!saved.timeTrial, ttDistance:String(saved.ttDistance || '100m').trim() || '100m'};
  });
}

function normalizeQuadGroups(raw) {
  const defaults=makeQuadGroupsTemplate();
  if(!Array.isArray(raw)||raw.length===0) return defaults;
  return defaults.map(def=>{
    const saved=raw.find(r=>r.id===def.id); if(!saved) return def;
    return {id:def.id,label:def.label,ages:def.ages,gender:def.gender,
      enabled:!!saved.enabled, distances:Array.isArray(saved.distances)?saved.distances.map(String):[...def.distances], cost:Number(saved.cost||0)};
  });
}

function migrateMeet(meet,fallbackOwnerId) {
  if(!meet.createdByUserId) meet.createdByUserId=fallbackOwnerId;
  if(!meet.createdAt) meet.createdAt=nowIso();
  if(!meet.updatedAt) meet.updatedAt=nowIso();
  if(typeof meet.meetName!=='string') meet.meetName='New Meet';
  if(typeof meet.date!=='string') meet.date='';
  if(typeof meet.endDate!=='string') meet.endDate='';
  if(typeof meet.startTime!=='string') meet.startTime='';
  if(typeof meet.registrationCloseAt!=='string') meet.registrationCloseAt='';
  if(typeof meet.rinkId!=='number') meet.rinkId=1;
  if(typeof meet.customRinkName!=='string') meet.customRinkName='';
  if(!Number.isFinite(Number(meet.trackLength))) meet.trackLength=100;
  if(!Number.isFinite(Number(meet.lanes))) meet.lanes=4;
  if(typeof meet.timeTrialsEnabled!=='boolean') meet.timeTrialsEnabled=false;
  if(typeof meet.relayEnabled!=='boolean') meet.relayEnabled=false;
  if(typeof meet.judgesPanelRequired!=='boolean') meet.judgesPanelRequired=true;
  if(typeof meet.notes!=='string') meet.notes='';
  if(typeof meet.scheduleNotes!=='string') meet.scheduleNotes='';
  if(!meet.tiebreaker) meet.tiebreaker='d2';
  if(typeof meet.relayNotes!=='string') meet.relayNotes='';
  if(typeof meet.isPublic!=='boolean') meet.isPublic=false;
  if(typeof meet.status!=='string') meet.status='draft';
  meet.openGroups=normalizeOpenGroups(meet.openGroups);
  meet.quadGroups=normalizeQuadGroups(meet.quadGroups);
  if(!Array.isArray(meet.groups)||meet.groups.length===0) { meet.groups=baseGroups(); }
  else {
    const baseMap=new Map(baseGroups().map(g=>[g.id,g]));
    meet.groups=meet.groups.map(g=>{
      const base=baseMap.get(g.id);
      return {id:g.id||base?.id||crypto.randomBytes(4).toString('hex'),
        label:base?.label||g.label||'Division Group', ages:base?.ages||g.ages||'', gender:base?.gender||g.gender||'',
        divisions:normalizeDivisionSet(g.divisions)};
    });
  }
  if(!Array.isArray(meet.races)) meet.races=[];
  if(!Array.isArray(meet.blocks)) meet.blocks=[];
  if(!Array.isArray(meet.registrations)) meet.registrations=[];
  if(typeof meet.currentRaceId!=='string') meet.currentRaceId='';
  if(typeof meet.currentRaceIndex!=='number') meet.currentRaceIndex=-1;
  if(typeof meet.raceDayPaused!=='boolean') meet.raceDayPaused=false;
  normalizeMeetPricingFields(meet);
  if(!Array.isArray(meet.textAlerts)) meet.textAlerts=[];
  const savedAdditionalGroups = Array.isArray(meet.additionalGroups) ? meet.additionalGroups : (Array.isArray(meet.additionalRaceGroups) ? meet.additionalRaceGroups : (Array.isArray(meet.additionalRaces) ? meet.additionalRaces : meet.skateabilityGroups));
  meet.additionalGroups = makeAdditionalRaceSlots(savedAdditionalGroups);
  meet.additionalRaces = meet.additionalGroups.map(g => ({ ...g }));
  meet.additionalRaceGroups = meet.additionalGroups.map(g => ({ ...g }));
  // Backward-compatible read/write alias only. New code uses additionalGroups.
  meet.skateabilityGroups = meet.additionalGroups.map(g => ({ ...g }));
  meet.races=meet.races.map((r,idx)=>({
    id:r.id||('r'+crypto.randomBytes(6).toString('hex')), orderHint:Number(r.orderHint||idx+1),
    groupId:String(r.groupId||''), groupLabel:String(r.groupLabel||''), ages:String(r.ages||''),
    division:String(r.division||'elite'), distanceLabel:String(r.distanceLabel||''),
    dayIndex:Number(r.dayIndex||1), cost:Number(r.cost||0), stage:String(r.stage||'race'),
    heatNumber:Number(r.heatNumber||0), parentRaceKey:String(r.parentRaceKey||''),
    startType:String(r.startType||'standing'),
    countsForOverall:typeof r.countsForOverall==='boolean'?r.countsForOverall:(String(r.division||'')!=='open'),
    laneEntries:Array.isArray(r.laneEntries)?r.laneEntries:[],
    resultsMode:String(r.resultsMode||'places'), status:String(r.status||'open'),
    notes:String(r.notes||''), isFinal:!!r.isFinal, closedAt:String(r.closedAt||''),
    isOpenRace:!!r.isOpenRace, isQuadRace:!!r.isQuadRace, isTimeTrial:!!r.isTimeTrial, isRelayRace:!!r.isRelayRace, isAdditionalRace:!!r.isAdditionalRace, isSkateabilityRace:!!r.isSkateabilityRace,
  }));
  meet.blocks=meet.blocks.map((b,idx)=>({
    id:String(b.id||('b'+(idx+1))), name:String(b.name||`Block ${idx+1}`),
    day:String(b.day||'Day 1'), type:String(b.type||'race'), notes:String(b.notes||''),
    raceIds:Array.isArray(b.raceIds)?b.raceIds.map(String):[],
  }));
  meet.registrations=meet.registrations.map((reg,idx)=>({
    id:Number(reg.id||idx+1), createdAt:String(reg.createdAt||nowIso()),
    name:String(reg.name||''), age:Number(reg.age||0), gender:String(reg.gender||'boys'),
    team:String(reg.team||'Independent'), sponsor:String(reg.sponsor||''),
    divisionGroupId:String(reg.divisionGroupId||''), divisionGroupLabel:String(reg.divisionGroupLabel||''),
    originalDivisionGroupId:String(reg.originalDivisionGroupId||reg.divisionGroupId||''),
    originalDivisionGroupLabel:String(reg.originalDivisionGroupLabel||reg.divisionGroupLabel||''),
    meetNumber:Number(reg.meetNumber||idx+1), birthdate:String(reg.birthdate||''), email:String(reg.email||''),
    helmetNumber:reg.helmetNumber===''||reg.helmetNumber==null?'':Number(reg.helmetNumber),
    paid:!!reg.paid, checkedIn:!!reg.checkedIn, totalCost:Number(reg.totalCost||0),
    options:{challengeUp:!!reg.options?.challengeUp, novice:!!reg.options?.novice,
      elite:!!reg.options?.elite, open:!!reg.options?.open, quad:!!reg.options?.quad,
      timeTrials:!!reg.options?.timeTrials, relays:!!reg.options?.relays, relay2Person:!!reg.options?.relay2Person, relay3Person:!!reg.options?.relay3Person, relay4Person:!!reg.options?.relay4Person, additional:!!(reg.options?.additional || reg.options?.skateability), additionalGroupId:String(reg.options?.additionalGroupId || reg.options?.skateabilityGroupId || ''), skateability:!!(reg.options?.additional || reg.options?.skateability), skateabilityGroupId:String(reg.options?.additionalGroupId || reg.options?.skateabilityGroupId || '')},
  }));
}


function getMeetOr404(db,meetId) { return db.meets.find(m=>Number(m.id)===Number(meetId)); }
function getMeetRink(db, meet) { return (db.rinks || []).find(r => Number(r.id) === Number(meet?.rinkId)); }
function meetRinkLabel(db, meet) {
  const custom = String(meet?.customRinkName || '').trim();
  if (custom) return custom;
  const rink = getMeetRink(db, meet);
  if (!rink) return '';
  return [rink.name, rink.city, rink.state].filter(Boolean).join(' • ');
}
function meetDateLabel(meet) {
  const start = String(meet?.date || '').trim();
  const end = String(meet?.endDate || '').trim();
  if (start && end && start !== end) return `${start} to ${end}`;
  return start;
}
function meetDayCount(meet) {
  const start = String(meet?.date || '').trim();
  const end = String(meet?.endDate || '').trim();
  if (!start || !end || start === end) return 1;
  const a = new Date(start + 'T00:00:00');
  const b = new Date(end + 'T00:00:00');
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 1;
}
function nextSetupPresetId(db) { return nextId(db.setupPresets || []); }
function makeSetupPresetFromMeet(db, meet, name, ownerUserId) {
  return {
    id: nextSetupPresetId(db),
    name: String(name || '').trim() || `${meet.meetName || 'Meet'} Setup`,
    createdByUserId: ownerUserId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sourceMeetId: meet.id,
    tiebreaker: meet.tiebreaker || 'd2',
    baseEntryFee: Number(meet.baseEntryFee || 0),
    noviceEventFee: Number(meet.noviceEventFee || 0),
    eliteEventFee: Number(meet.eliteEventFee || 0),
    openEventFee: Number(meet.openEventFee || 0),
    quadEventFee: Number(meet.quadEventFee || 0),
    relayEventFee: Number(meet.relayEventFee || 0),
    timeTrialEventFee: Number(meet.timeTrialEventFee || 0),
    additionalRaceFee: Number(meet.additionalRaceFee || 0),
    maxRegistrationFee: Number(meet.maxRegistrationFee || 0),
    trackLength: Number(meet.trackLength || 100),
    lanes: Number(meet.lanes || 4),
    timeTrialsEnabled: !!meet.timeTrialsEnabled,
    relayEnabled: !!meet.relayEnabled || (meet.races || []).some(r => r.isRelayRace),
    relayTemplates: JSON.parse(JSON.stringify(meet.relayTemplates || [])),
    relayRaces: JSON.parse(JSON.stringify((meet.races || []).filter(r => r.isRelayRace))),
    judgesPanelRequired: !!meet.judgesPanelRequired,
    groups: JSON.parse(JSON.stringify(meet.groups || [])),
    openGroups: JSON.parse(JSON.stringify(meet.openGroups || [])),
    quadGroups: JSON.parse(JSON.stringify(meet.quadGroups || [])),
    additionalGroups: JSON.parse(JSON.stringify(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups || [])),
    additionalRaceGroups: JSON.parse(JSON.stringify(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups || [])),
    additionalRaces: JSON.parse(JSON.stringify(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups || [])),
    skateabilityGroups: JSON.parse(JSON.stringify(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups || [])),
    blocks: JSON.parse(JSON.stringify(meet.blocks || [])),
    raceOrder: orderedRaces(meet).map(r => ({
      raceId: r.id, groupId: r.groupId, groupLabel: r.groupLabel, division: r.division,
      distanceLabel: r.distanceLabel, dayIndex: r.dayIndex, blockId: r.blockId || '', blockName: r.blockName || ''
    })),
  };
}

function presetRaceSignature(row) {
  return [
    String(row?.groupId || ''),
    String(row?.division || ''),
    String(row?.dayIndex || ''),
    String(row?.distanceLabel || ''),
  ].join('|');
}

function restorePresetBlocksIntoMeet(preset, meet) {
  const presetBlocks = Array.isArray(preset?.blocks) ? preset.blocks : [];
  if (!presetBlocks.length) {
    ensureAtLeastOneBlock(meet);
    return;
  }

  const presetRaceOrder = Array.isArray(preset?.raceOrder) ? preset.raceOrder : [];
  const presetRaceById = new Map(
    presetRaceOrder.map(row => [String(row.raceId || ''), row])
  );

  const currentRaceIds = new Set((meet.races || []).map(r => String(r.id || '')));
  const currentBySignature = new Map();

  for (const race of [...(meet.races || [])].sort((a, b) => Number(a.orderHint || 0) - Number(b.orderHint || 0))) {
    const key = presetRaceSignature(race);
    if (!currentBySignature.has(key)) currentBySignature.set(key, []);
    currentBySignature.get(key).push(String(race.id || ''));
  }

  const usedRaceIds = new Set();

  meet.blocks = presetBlocks.map((block, idx) => {
    const nextBlock = JSON.parse(JSON.stringify(block || {}));
    nextBlock.id = String(nextBlock.id || ('b' + (idx + 1)));
    nextBlock.name = String(nextBlock.name || `Block ${idx + 1}`);
    nextBlock.day = String(nextBlock.day || 'Day 1');
    nextBlock.type = String(nextBlock.type || 'race');
    nextBlock.notes = String(nextBlock.notes || '');

    const restoredRaceIds = [];

    for (const originalRaceId of nextBlock.raceIds || []) {
      const raceId = String(originalRaceId || '');

      if (currentRaceIds.has(raceId) && !usedRaceIds.has(raceId)) {
        restoredRaceIds.push(raceId);
        usedRaceIds.add(raceId);
        continue;
      }

      const presetRace = presetRaceById.get(raceId);
      if (!presetRace) continue;

      const signature = presetRaceSignature(presetRace);
      const candidates = currentBySignature.get(signature) || [];
      const replacement = candidates.find(id => !usedRaceIds.has(id));

      if (replacement) {
        restoredRaceIds.push(replacement);
        usedRaceIds.add(replacement);
      }
    }

    nextBlock.raceIds = restoredRaceIds;
    return nextBlock;
  });

  ensureAtLeastOneBlock(meet);
}

function ensureAtLeastOneBlock(meet) {
  if(!Array.isArray(meet.blocks)) meet.blocks=[];
  if(meet.blocks.length===0) meet.blocks.push({id:'b1',name:'Block 1',day:'Day 1',type:'race',notes:'',raceIds:[]});
}

function combineDateTime(date,time) {
  const d=String(date||'').trim(); const t=String(time||'').trim();
  if(!d) return ''; if(!t) return `${d}T00:00:00`; return `${d}T${t}:00`;
}

function isRegistrationClosed(meet) {
  if(!meet.registrationCloseAt) return false;
  const ts=new Date(meet.registrationCloseAt).getTime();
  if(!Number.isFinite(ts)) return false; return Date.now()>ts;
}

function ageMatch(ages, age) {
  const n=Number(age); if(!Number.isFinite(n)) return false;
  const normalized=String(ages||'').trim().toLowerCase();
  if(!normalized) return false;
  if(normalized.includes('& under') || normalized.includes('and under')) { const limit=Number((normalized.match(/\d+/)||[0])[0]); return n<=limit; }
  if(normalized.includes('& older') || normalized.includes('and older') || normalized.includes('+')) { const min=Number((normalized.match(/\d+/)||[999])[0]); return n>=min; }
  const nums=normalized.match(/\d+/g)||[]; if(nums.length>=2) return n>=Number(nums[0])&&n<=Number(nums[1]); return false;
}

function groupAgeMatch(group,age) {
  const n=Number(age); if(!Number.isFinite(n)) return false;
  if(group.divisions) {
    for(const key of ['novice','elite']) {
      const div=group.divisions[key];
      if(div && String(div.ages||'').trim() && ageMatch(div.ages,n)) return true;
    }
  }
  const ages=String(group.ages||'').trim();
  return ageMatch(ages,n);
}

function findAgeGroup(groups,age,genderGuess) {
  const n=Number(age); if(!Number.isFinite(n)) return null;
  const normalizedGender=String(genderGuess||'').toLowerCase();
  const candidates=groups.filter(g=>groupAgeMatch(g,n)); if(!candidates.length) return null;
  return candidates.find(g=>g.gender===normalizedGender)||candidates[0];
}

function findChallengeUpGroup(groups,currentGroupId) {
  const idx=groups.findIndex(g=>String(g.id)===String(currentGroupId));
  if(idx<0) return null; return groups[idx+1]||null;
}

function challengeAdjustedGroup(meet,baseGroup,challengeUp) {
  if(!baseGroup) return null; if(!challengeUp) return baseGroup;
  return findChallengeUpGroup(meet.groups||[],baseGroup.id)||baseGroup;
}

function divisionEnabledForRegistration(reg,division) { return !!reg.options?.[division]; }

function nextHelmetNumber(meet) {
  const used=new Set((meet.registrations||[]).map(r=>Number(r.helmetNumber)).filter(n=>Number.isFinite(n)&&n>0));
  let n=1; while(used.has(n)) n+=1; return n;
}


function ensureRegistrationTotalsAndNumbers(meet) {
  for(const reg of meet.registrations||[]) {
    reg.totalCost=calculateRegistrationTotal(meet,reg);
    if(!Number.isFinite(Number(reg.helmetNumber))||Number(reg.helmetNumber)<=0) reg.helmetNumber=nextHelmetNumber(meet);
  }
}


function entryLabelForRegistration(reg) {
  const opts = reg?.options || {};
  return [
    'challengeUp',
    'novice',
    'elite',
    'open',
    'quad',
    'additional',
    'timeTrials',
    'relay2Person',
    'relay3Person',
    'relay4Person',
  ]
    .filter(k => opts[k])
    .map(k => {
      if (k === 'challengeUp') return 'CU';
      if (k === 'additional') return 'Additional';
      if (k === 'timeTrials') return 'Time Trials';
      if (k === 'relay2Person') return '2 Person Relay';
      if (k === 'relay3Person') return '3 Person Relay';
      if (k === 'relay4Person') return '4 Person Relay';
      return cap(k);
    })
    .join(', ') || '—';
}

function normalizeDistances(arr4) { return [0,1,2,3].map(i=>String(arr4?.[i]??'').trim()); }
function baseRaceKey(groupId,division,dayIndex,distanceLabel) { return `${groupId}|${division}|${dayIndex}|${distanceLabel}`; }
function isOpenDivision(div) { return String(div||'').toLowerCase()==='open'; }

function registrationSortKey(reg) { return [String(reg.team||''),String(reg.name||''),Number(reg.age||0),Number(reg.id||0)].join('|'); }

function distributeByTeam(entries,heatCount) {
  const buckets=Array.from({length:heatCount},()=>[]); const teamMap=new Map();
  for(const entry of entries) { const team=String(entry.team||'Independent'); if(!teamMap.has(team)) teamMap.set(team,[]); teamMap.get(team).push(entry); }
  for(const group of Array.from(teamMap.values()).sort((a,b)=>b.length-a.length)) {
    for(const skater of group) {
      let bestIdx=0,bestScore=Infinity;
      for(let i=0;i<buckets.length;i++) {
        const sameTeamCount=buckets[i].filter(x=>String(x.team||'Independent')===String(skater.team||'Independent')).length;
        const score=sameTeamCount*100+buckets[i].length;
        if(score<bestScore){bestScore=score;bestIdx=i;}
      } buckets[bestIdx].push(skater);
    }
  } return buckets;
}

function buildHeatRaceShell(baseRace,stage,heatNumber,suffixOrder) {
  return {...baseRace,id:'r'+crypto.randomBytes(6).toString('hex'),orderHint:Number(baseRace.orderHint||0)+suffixOrder/100,stage,heatNumber:stage==='final'?0:heatNumber,isFinal:stage==='final',laneEntries:[],status:'open',closedAt:''};
}

function shouldSplitIntoHeats(baseRace,entryCount,laneCount) {
  if(isOpenDivision(baseRace.division)) return false; if(baseRace.isOpenRace) return false; return entryCount>laneCount;
}

function buildRaceSetForEntries(baseRace,regs,laneCount) {
  const sorted=[...regs].sort((a,b)=>registrationSortKey(a).localeCompare(registrationSortKey(b)));
  if(isOpenDivision(baseRace.division)||baseRace.isOpenRace) {
    return [{...baseRace,stage:'final',heatNumber:0,isFinal:true,startType:'rolling',countsForOverall:false,
      laneEntries:sorted.map((reg,idx)=>({lane:idx+1,registrationId:reg.id,helmetNumber:reg.helmetNumber,skaterName:reg.name,team:reg.team,place:'',time:'',status:''}))}];
  }
  if(!shouldSplitIntoHeats(baseRace,sorted.length,laneCount)) {
    return [{...baseRace,stage:'final',heatNumber:0,isFinal:true,startType:'standing',countsForOverall:true,
      laneEntries:sorted.slice(0,laneCount).map((reg,idx)=>({lane:idx+1,registrationId:reg.id,helmetNumber:reg.helmetNumber,skaterName:reg.name,team:reg.team,place:'',time:'',status:''}))}];
  }
  const heatCount=Math.ceil(sorted.length/laneCount);
  const buckets=distributeByTeam(sorted,heatCount).map(b=>b.slice(0,laneCount)); const raceSet=[];
  buckets.forEach((bucket,idx)=>{
    const heatRace=buildHeatRaceShell(baseRace,'heat',idx+1,idx+1);
    heatRace.startType='standing'; heatRace.countsForOverall=false;
    heatRace.laneEntries=bucket.map((reg,laneIdx)=>({lane:laneIdx+1,registrationId:reg.id,helmetNumber:reg.helmetNumber,skaterName:reg.name,team:reg.team,place:'',time:'',status:''}));
    raceSet.push(heatRace);
  });
  const finalRace=buildHeatRaceShell(baseRace,'final',0,99);
  finalRace.startType='standing'; finalRace.countsForOverall=true; finalRace.laneEntries=[];
  raceSet.push(finalRace); return raceSet;
}


function generateAdditionalRacesForMeet(meet) {
  const rawGroups = makeAdditionalRaceSlots(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups);

  const nonAdditionalRaces = (meet.races || []).filter(r =>
    String(r.division || '') !== 'skateability' &&
    String(r.division || '') !== 'additional' &&
    !r.isAdditionalRace &&
    !r.isSkateabilityRace
  );

  const additionalRaces = [];
  let orderHint = 8500;

  for (const sg of rawGroups) {
    if (!sg) continue;

    // Do not auto-create legacy/placeholder extras. Director must enable it.
    const enabled = sg.enabled === true || String(sg.enabled || '').toLowerCase() === 'true' || String(sg.enabled || '').toLowerCase() === 'on';
    if (!enabled) continue;

    const savedId = String(sg.id || '').trim() || ('additional_' + crypto.randomBytes(4).toString('hex'));
    const linkedAgeGroupId = String(sg.ageGroupId || '').trim();
    const raceGroupId = savedId;

    const rawTitle = String(sg.ageGroupLabel || sg.title || '').trim();
    const title = rawTitle && rawTitle.toLowerCase() !== 'additional race' ? rawTitle : `Additional ${String(savedId).replace('manual_extra_','')}`;

    const linkedAgeGroup = (meet.groups || []).find(g => String(g.id) === linkedAgeGroupId);
    const ages = String(sg.ages || linkedAgeGroup?.ages || '').trim();

    const distances = (Array.isArray(sg.distances) ? sg.distances : [])
      .map(d => String(d || '').trim())
      .filter(Boolean);

    // Must have at least one distance. Blank placeholder cards do not generate.
    if (!distances.length) continue;

    distances.forEach((distance, idx) => {
      const parentRaceKey = `additional|${savedId}|${idx + 1}`;
      const legacyParentKey = linkedAgeGroupId ? `additional|${linkedAgeGroupId}|${idx + 1}` : '';

      const existingRace = (meet.races || []).find(r =>
        String(r.parentRaceKey || '') === parentRaceKey ||
        (legacyParentKey && String(r.parentRaceKey || '') === legacyParentKey) ||
        (
          (String(r.division || '') === 'skateability' || String(r.division || '') === 'additional' || r.isAdditionalRace || r.isSkateabilityRace) &&
          (String(r.groupId || '') === raceGroupId || (linkedAgeGroupId && String(r.groupId || '') === linkedAgeGroupId)) &&
          String(r.distanceLabel || '') === distance
        )
      );

      additionalRaces.push({
        id: existingRace?.id || ('r' + crypto.randomBytes(6).toString('hex')),
        orderHint: Number(existingRace?.orderHint || orderHint++),
        groupId: raceGroupId,
        groupLabel: title,
        ages,
        division: 'additional',
        distanceLabel: distance,
        dayIndex: idx + 1,
        cost: Number(sg.cost || 0),
        stage: existingRace?.stage || 'race',
        heatNumber: Number(existingRace?.heatNumber || 0),
        parentRaceKey,
        startType: existingRace?.startType || 'standing',
        countsForOverall: false,
        laneEntries: Array.isArray(existingRace?.laneEntries) ? existingRace.laneEntries : [],
        resultsMode: existingRace?.resultsMode || 'places',
        status: existingRace?.status || 'open',
        notes: String(existingRace?.notes || ''),
        isFinal: !!existingRace?.isFinal,
        closedAt: existingRace?.closedAt || '',
        isOpenRace: false,
        isQuadRace: false,
        isTimeTrial: false,
        isRelayRace: false,
        isAdditionalRace: true,
        isSkateabilityRace: false,
        type: 'race',
      });
    });
  }

  meet.races = [...nonAdditionalRaces, ...additionalRaces];
  meet.updatedAt = nowIso();
}


function raceBlockRestoreKey(race) {
  if (!race) return '';
  const parent = String(race.parentRaceKey || '').trim();
  if (parent) return 'parent|' + parent;
  const type = race.isRelayRace ? 'relay'
    : race.isAdditionalRace || race.isSkateabilityRace || String(race.division || '') === 'additional' || String(race.division || '') === 'skateability' ? 'additional'
    : race.isTimeTrial ? 'time_trial'
    : race.isQuadRace ? 'quad'
    : race.isOpenRace ? 'open'
    : 'standard';
  return [
    'sig',
    type,
    String(race.groupId || ''),
    String(race.groupLabel || ''),
    String(race.division || ''),
    String(race.dayIndex || ''),
    String(race.distanceLabel || ''),
  ].join('|');
}

function restoreBlockAssignmentsAfterRaceSync(meet, originalBlocks, originalRaceById) {
  const validIds = new Set((meet.races || []).map(r => String(r.id || '')));
  const currentByKey = new Map();

  for (const race of meet.races || []) {
    const key = raceBlockRestoreKey(race);
    if (!key) continue;
    if (!currentByKey.has(key)) currentByKey.set(key, []);
    currentByKey.get(key).push(String(race.id || ''));
  }

  const usedByBlock = new Map();

  meet.blocks = (originalBlocks || []).map(block => {
    const nextIds = [];
    const used = new Set();

    for (const rawId of block.raceIds || []) {
      const oldId = String(rawId || '');
      if (!oldId) continue;

      if (validIds.has(oldId) && !used.has(oldId)) {
        nextIds.push(oldId);
        used.add(oldId);
        continue;
      }

      const oldRace = originalRaceById.get(oldId);
      if (!oldRace) continue;

      const key = raceBlockRestoreKey(oldRace);
      const replacements = currentByKey.get(key) || [];
      const replacement = replacements.find(id => !used.has(id));
      if (replacement) {
        nextIds.push(replacement);
        used.add(replacement);
      }
    }

    usedByBlock.set(String(block.id || ''), used);
    return { ...block, raceIds: nextIds };
  });

  ensureAtLeastOneBlock(meet);
}

function generateConfiguredRacesForMeet(meet) {
  const originalBlocks = (meet.blocks || []).map(block => ({
    ...block,
    raceIds: [...(block.raceIds || [])],
  }));
  const originalRaceById = new Map((meet.races || []).map(r => [String(r.id || ''), { ...r }]));

  // One safe rebuild path for builder/block screens:
  // - regenerates normal divisions
  // - regenerates Open/Quad/Additional races
  // - collapses Time Trials to one unified session
  // - preserves Relay races created by Relay Builder
  // - preserves Additional Race IDs so Block Builder drops survive reloads
  const relayRaces = (meet.races || []).filter(r => r.isRelayRace);
  const additionalRacesBefore = (meet.races || []).filter(r =>
    r.isAdditionalRace ||
    r.isSkateabilityRace ||
    String(r.division || '') === 'additional' ||
    String(r.division || '') === 'skateability'
  );

  generateBaseRacesForMeet(meet);
  generateOpenRacesForMeet(meet);
  generateQuadRacesForMeet(meet);

  // Put previous additional races back temporarily so generateAdditionalRacesForMeet()
  // can match parentRaceKey/group/distance and reuse the same IDs.
  const idsAfterCore = new Set((meet.races || []).map(r => String(r.id)));
  for (const race of additionalRacesBefore) {
    if (!idsAfterCore.has(String(race.id))) meet.races.push(race);
  }

  generateAdditionalRacesForMeet(meet);

  // sync additional labels from manual slots so Block Builder never shows stale legacy names
  const manualLabelById = new Map(makeAdditionalRaceSlots(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups).map(g => [String(g.id), String(g.ageGroupLabel || '')]));
  for (const race of meet.races || []) {
    if (race.isAdditionalRace || String(race.division || '') === 'additional') {
      const label = manualLabelById.get(String(race.groupId || ''));
      if (label) race.groupLabel = label;
      race.division = 'additional';
      race.isAdditionalRace = true;
      race.isSkateabilityRace = false;
    }
  }

  const existingIds = new Set((meet.races || []).map(r => String(r.id)));
  for (const relay of relayRaces) {
    if (!existingIds.has(String(relay.id))) meet.races.push(relay);
  }

  rebuildTimeTrialRace(meet);

  const validIds = new Set((meet.races || []).map(r => String(r.id)));

  // Some lower-level generators temporarily filter block.raceIds while syncing the
  // race list. Restore the director's block schedule after all configured races
  // are back in place, including Relay and Additional races.
  restoreBlockAssignmentsAfterRaceSync(meet, originalBlocks, originalRaceById);

  if (!validIds.has(String(meet.currentRaceId || ''))) {
    meet.currentRaceId = '';
    meet.currentRaceIndex = -1;
  }

  meet.updatedAt = nowIso();
}

function isAdvancementRace(race) {
  if (!race) return false;
  if (race.isOpenRace || race.isRelayRace || race.isTimeTrial || race.isAdditionalRace || race.isSkateabilityRace) return false;
  const div = String(race.division || '').toLowerCase();
  if (div === 'open' || div === 'additional' || div === 'skateability') return false;
  // Standard novice/elite and quad races can split into heats.
  return true;
}

function advancementFamilyKey(race) {
  if (!race) return '';
  const parent = String(race.parentRaceKey || '').trim();
  if (parent) return parent;
  const type = race.isQuadRace ? 'quad' : 'standard';
  return [
    type,
    String(race.groupId || ''),
    String(race.division || ''),
    String(race.dayIndex || ''),
    String(race.distanceLabel || ''),
  ].join('|');
}

function numericPlace(value) {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tryAdvanceTopThreeFromTwoHeats(meet, changedRace) {
  if (!isAdvancementRace(changedRace)) return { advanced: false, reason: 'not_advancement_race' };
  if (String(changedRace.stage || '').toLowerCase() !== 'heat') return { advanced: false, reason: 'not_heat' };

  const familyKey = advancementFamilyKey(changedRace);
  if (!familyKey) return { advanced: false, reason: 'missing_family' };

  const familyRaces = (meet.races || []).filter(r => isAdvancementRace(r) && advancementFamilyKey(r) === familyKey);
  const heats = familyRaces
    .filter(r => String(r.stage || '').toLowerCase() === 'heat')
    .sort((a, b) => Number(a.heatNumber || 0) - Number(b.heatNumber || 0));
  const finalRace = familyRaces.find(r => String(r.stage || '').toLowerCase() === 'final' || r.isFinal);

  if (!finalRace) return { advanced: false, reason: 'missing_final' };

  // MVP rule from coach: exactly 2 heats, top 3 by place from each heat.
  // Larger brackets need manual advancement for now.
  if (heats.length !== 2) {
    finalRace.advancementWarning = heats.length > 2
      ? 'Manual advancement required — more than 2 heats.'
      : '';
    return { advanced: false, reason: 'not_two_heats' };
  }

  if (heats.some(h => String(h.status || '') !== 'closed')) {
    return { advanced: false, reason: 'heats_not_closed' };
  }

  const qualifiers = [];
  for (const heat of heats) {
    const topThree = (heat.laneEntries || [])
      .filter(entry => numericPlace(entry.place) !== null && !String(entry.status || '').trim())
      .sort((a, b) => numericPlace(a.place) - numericPlace(b.place))
      .slice(0, 3);

    if (topThree.length < 3) {
      return { advanced: false, reason: 'missing_top_three' };
    }

    for (const entry of topThree) {
      qualifiers.push({
        lane: qualifiers.length + 1,
        registrationId: entry.registrationId || '',
        helmetNumber: entry.helmetNumber || '',
        skaterName: entry.skaterName || '',
        team: entry.team || '',
        place: '',
        time: '',
        status: '',
        qualifiedFromHeat: Number(heat.heatNumber || 0),
        qualifiedPlace: numericPlace(entry.place),
      });
    }
  }

  finalRace.laneEntries = qualifiers.slice(0, 6).map((entry, idx) => ({ ...entry, lane: idx + 1 }));
  finalRace.resultsMode = finalRace.resultsMode || 'places';
  finalRace.status = String(finalRace.status || 'open') === 'closed' ? 'closed' : 'open';
  finalRace.isFinal = true;
  finalRace.countsForOverall = true;
  finalRace.advancementWarning = '';
  finalRace.advancedFromHeatsAt = nowIso();
  finalRace.notes = String(finalRace.notes || '').replace(/\n?Auto-advanced top 3 from each heat\.?/g, '');

  return { advanced: true, finalRaceId: finalRace.id };
}

function pricingFieldsFromMeet(meet) {
  return {
    baseEntryFee: Number(meet?.baseEntryFee || 0),
    additionalRaceFee: Number(meet?.additionalRaceFee || 0),
    maxRegistrationFee: Number(meet?.maxRegistrationFee || 0),
  };
}

function buildRegistrationPricingPreview(meet) {
  const fees = pricingFieldsFromMeet(meet || {});
  return buildCostWidget(
    fees.baseEntryFee,
    fees.additionalRaceFee,
    fees.maxRegistrationFee
  );
}

function racingSoonLabel(delta) {
  if(delta<=0) return 'NOW'; if(delta===1) return 'IN STAGING';
  if(delta===2) return '2 RACES AWAY'; if(delta===3) return '3 RACES AWAY'; return `${delta} RACES AWAY`;
}

function isArchivedMeet(meet) {
  return !!(meet && (meet.archivedAt || String(meet.status || '').toLowerCase() === 'archived'));
}

function activeMeets(meets) {
  return (meets || []).filter(m => !isArchivedMeet(m));
}

function archivedMeetsForUser(db, user) {
  const archived = (db.meets || []).filter(isArchivedMeet);
  if (hasRole(user, 'super_admin')) return archived;
  if (hasRole(user, 'meet_director')) return archived.filter(m => Number(m.createdByUserId) === Number(user.id));
  if (hasRole(user, 'coach')) {
    const teamKey = String(user.team || '').trim().toLowerCase();
    return archived.filter(m => (m.registrations || []).some(r => String(r.team || '').trim().toLowerCase() === teamKey));
  }
  return [];
}

function cloneMeetSetup(sourceMeet, newId, ownerUserId) {
  const clone = JSON.parse(JSON.stringify(sourceMeet || {}));

  clone.id = newId;
  clone.createdByUserId = ownerUserId;
  clone.createdAt = nowIso();
  clone.updatedAt = nowIso();
  clone.meetName = `Copy of ${String(sourceMeet?.meetName || 'Meet').trim() || 'Meet'}`;
  clone.date = '';
  clone.endDate = '';
  clone.startTime = '';
  clone.registrationCloseAt = '';
  clone.status = 'draft';
  clone.isPublic = false;

  // A clone is a fresh operational meet, not history.
  clone.archivedAt = '';
  clone.archivedByUserId = null;
  clone.previousStatus = '';

  // Do not carry meet-day/live data into the new meet.
  clone.registrations = [];
  clone.races = [];
  clone.textAlerts = [];
  clone.currentRaceId = '';
  clone.currentRaceIndex = -1;
  clone.raceDayPaused = false;

  // Keep block layout names/days/notes, but clear race references because races will be regenerated.
  clone.blocks = Array.isArray(clone.blocks)
    ? clone.blocks.map((block, idx) => ({
        id: String(block.id || ('b' + (idx + 1))),
        name: String(block.name || `Block ${idx + 1}`),
        day: String(block.day || 'Day 1'),
        type: String(block.type || 'race'),
        notes: String(block.notes || ''),
        raceIds: [],
      }))
    : [];
  ensureAtLeastOneBlock(clone);

  return clone;
}

function coachVisibleMeets(db,user) {
  const meets = activeMeets(db.meets);
  if(hasRole(user,'super_admin')) return meets;
  if(hasRole(user,'meet_director')) return meets.filter(m=>Number(m.createdByUserId)===Number(user.id));
  if(hasRole(user,'coach')) return meets.filter(m=>(m.registrations||[]).some(r=>String(r.team||'').trim().toLowerCase()===String(user.team||'').trim().toLowerCase()));
  return [];
}

function coachTeamRegistrations(meet,coachTeam) {
  const teamKey=String(coachTeam||'').trim().toLowerCase();
  return (meet.registrations||[]).filter(r=>String(r.team||'').trim().toLowerCase()===teamKey);
}

function coachUpcomingForMeet(meet,coachTeam) {
  const regs=coachTeamRegistrations(meet,coachTeam); const regIds=new Set(regs.map(r=>Number(r.id)));
  const info=currentRaceInfo(meet);
  return info.ordered.map((race,idx)=>{
    const matched=(race.laneEntries||[]).filter(le=>regIds.has(Number(le.registrationId)));
    if(!matched.length) return null;
    return {race,raceIndex:idx,delta:idx-info.idx,skaters:matched.map(m=>({registrationId:m.registrationId,skaterName:m.skaterName,helmetNumber:m.helmetNumber,team:m.team,lane:m.lane}))};
  }).filter(Boolean).filter(x=>x.delta>=0).slice(0,12);
}

function coachRecentResultsForMeet(meet,coachTeam) {
  const regs=coachTeamRegistrations(meet,coachTeam); const regIds=new Set(regs.map(r=>Number(r.id)));
  return recentClosedRaces(meet,12).map(race=>{
    const matched=(race.laneEntries||[]).filter(le=>regIds.has(Number(le.registrationId)));
    if(!matched.length) return null; return {race,skaters:matched};
  }).filter(Boolean);
}

function coachStandingsForMeet(meet,coachTeam) {
  const standings=computeMeetStandings(meet); const teamKey=String(coachTeam||'').trim().toLowerCase();
  return standings.map(section=>({...section,standings:(section.standings||[]).filter(row=>String(row.team||'').trim().toLowerCase()===teamKey)})).filter(section=>(section.standings||[]).length>0);
}





// ── Shared render helpers ─────────────────────────────────────────────────────

function resultsSectionHtml(section) {
  const tbMode = section.tbMode || 'd2';
  const tbLabel = tbMode==='sr832' ? 'SR832 Formula' : 'D2 Middle Race';
  const hasTiebreaker = section.standings.some(r=>r.tiebreakerUsed||r.runoffNeeded);
  const podium = section.standings.slice(0,3).map((row,i) => `
    <div class="podium-card">
      <div class="podium-place">${['🥇','🥈','🥉'][i]||row.overallPlace}</div>
      <div class="podium-name">${esc(row.skaterName||'Unknown')}${row.tiebreakerUsed?`<span class="tb-badge">TB</span>`:''}${row.runoffNeeded?`<span class="tb-badge tb-runoff">Run-off</span>`:''}</div>
      <div class="podium-team">${esc(row.team||'')}</div>
      ${sponsorLineHtml(row.sponsor)}
      <div class="podium-pts">${Number(row.totalPoints||0)} pts</div>
    </div>`).join('');
  const standingsRows = section.standings.map(row=>`
    <tr${row.runoffNeeded?' class="runoff-row"':''}>
      <td><strong>${row.overallPlace}</strong></td>
      <td>
        ${esc(row.skaterName||'')}
        ${row.tiebreakerUsed?`<span class="tb-badge">TB ${tbLabel}</span>`:''}
        ${row.runoffNeeded?`<span class="tb-badge tb-runoff">⚠️ Run-off required</span>`:''}
        ${sponsorLineHtml(row.sponsor)}
      </td>
      <td>${esc(row.team||'')}</td>
      <td><strong>${Number(row.totalPoints||0)}</strong>${row.tiebreakerScore!=null?`<div class="note">TB: ${row.tiebreakerScore.toFixed(2)}</div>`:''}
      </td>
    </tr>`).join('');
  return `
    <div class="card">
      <div class="row between" style="margin-bottom:14px">
        <div>
          <h2 style="margin:0">${esc(section.groupLabel)} <span class="text-orange">—</span> ${esc(cap(section.division))}</h2>
          <div class="note">Finals-only scoring • 30 / 20 / 10 / 5 pts</div>
        </div>
        ${section.standings[0]?`<div class="chip chip-orange">🏆 ${esc(section.standings[0].skaterName)}</div>`:''}
      </div>
      <div class="podium-grid">${podium||`<div class="muted">No scored finals yet.</div>`}</div>
      <div class="hr"></div>
      <table class="table">
        <thead><tr><th>Place</th><th>Skater</th><th>Team</th><th>Points</th></tr></thead>
        <tbody>${standingsRows||`<tr><td colspan="4" class="muted">No standings yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

// ── Public routes ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const data = getSessionUser(req);
  const portalLink = data ? '/portal' : '/admin/login';

  res.send(pageShell({
    title: 'Home',
    description: 'SpeedSkateMeet is the all-in-one platform for inline speed skating meets. Registration, race building, block scheduling, live scoring, and race-day operations.',
    user: data?.user || null,
    bodyHtml: `
    <section class="home-hero">
      <img class="home-hero-bg" src="/public/images/home/hero-banner.jpg" alt="" />
      <div class="home-hero-wash"></div>

      <div class="home-hero-inner">
        <img src="/public/images/branding/ssm-logo.png" alt="SpeedSkateMeet.com" class="home-hero-logo" />

        <div class="home-hero-kicker">Inline speed skating meet software</div>
        <h1 class="home-hero-title">Run meets. Build races. Go live.</h1>
        <p class="home-hero-copy">
          Registration, race builders, manual block scheduling, live results, check-in,
          standings, and race-day tools built specifically for inline speed skating.
        </p>

        <div class="home-hero-actions">
          <a class="btn-orange home-hero-primary" href="/meets">Find a Meet</a>
          <a class="btn2 btn-white" href="/live">Live Race Day</a>
          <a class="btn2 btn-white" href="${portalLink}">${data ? 'Open Portal' : 'Login'}</a>
        </div>

        <div class="home-hero-pills">
          <span>Meet Builder</span>
          <span>Race Day</span>
          <span>Live Results</span>
          <span>Text Alerts</span>
        </div>
      </div>
    </section>

    <div class="feature-grid">
      <a class="feature-card feature-card-link" href="/live">
        <img class="feature-card-bg" src="/public/images/home/feature-card-dark.jpg" alt="" />
        <div class="feature-card-overlay"></div>
        <div class="feature-card-content">
          <div class="feature-icon-emoji">🏆</div>
          <div class="feature-title">Live Results</div>
          <div class="feature-desc">Follow along in real time. Race-by-race results and standings updated the moment a race closes.</div>
          <div class="feature-cta">Watch Live →</div>
        </div>
      </a>
      <a class="feature-card feature-card-link" href="${portalLink}">
        <img class="feature-card-bg" src="/public/images/home/feature-card-gold.jpg" alt="" />
        <div class="feature-card-overlay"></div>
        <div class="feature-card-content">
          <div class="feature-icon-emoji">📋</div>
          <div class="feature-title">Meet Management</div>
          <div class="feature-desc">Build meets from scratch with registration, race builders, manual block scheduling, check-in, and standings.</div>
          <div class="feature-cta">Go to Portal →</div>
        </div>
      </a>
      <a class="feature-card feature-card-link" href="/rinks">
        <img class="feature-card-bg" src="/public/images/home/feature-card-light.jpg" alt="" />
        <div class="feature-card-overlay"></div>
        <div class="feature-card-content">
          <div class="feature-icon-emoji">📍</div>
          <div class="feature-title">Find a Rink</div>
          <div class="feature-desc">Discover inline speed skating venues and upcoming meets near you. Addresses, contact info, and schedules all in one place.</div>
          <div class="feature-cta">Browse Rinks →</div>
        </div>
      </a>
    </div>`
  }));
});

// ── Submit a Meet (public) ────────────────────────────────────────────────────
app.get('/submit-meet', (req, res) => {
  const data=getSessionUser(req);
  const ok=req.query.ok;
  res.send(pageShell({title:'Submit Your Meet', description:'List your inline speed skating meet on SpeedSkateMeet.com for free. No account required. Reach skaters and families across the country.', user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Submit Your Meet</h1><div class="sub">List your inline speed skating meet on SpeedSkateMeet.com — free, no account required.</div></div>
    ${ok?`<div class="card" style="border-left:4px solid var(--green);margin-bottom:16px"><div class="good">✅ Your meet has been submitted! Lee will review it and reach out to you shortly.</div></div>`:`
    <div class="card">
      <form method="POST" action="/submit-meet" class="stack">
        <div class="form-grid cols-2">
          <div><label>Meet Name *</label><input name="meetName" required placeholder="Wichita Spring Classic" /></div>
          <div><label>Date *</label><input type="date" name="date" required /></div>
          <div><label>City *</label><input name="city" required placeholder="Wichita" /></div>
          <div><label>State *</label><input name="state" required placeholder="KS" maxlength="2" /></div>
          <div><label>Your Name *</label><input name="contactName" required placeholder="Bob Jones" /></div>
          <div><label>Your Email *</label><input type="email" name="contactEmail" required placeholder="bob@team.com" /></div>
          <div><label>Your Phone</label><input type="tel" name="contactPhone" placeholder="(316) 555-1234" /></div>
          <div><label>External Registration URL</label><input name="registrationUrl" placeholder="https://forms.google.com/..." /></div>
        </div>
        <div><label>Description</label><textarea name="description" placeholder="Tell skaters about your meet — venue, format, divisions, etc." rows="4"></textarea></div>
        <div><button class="btn-orange" type="submit">Submit My Meet →</button></div>
      </form>
    </div>`}`}));
});

app.post('/submit-meet', (req, res) => {
  const db=loadDb();
  const pending={
    id:'pm'+crypto.randomBytes(6).toString('hex'),
    meetName:String(req.body.meetName||'').trim(),
    date:String(req.body.date||'').trim(),
    city:String(req.body.city||'').trim(),
    state:String(req.body.state||'').trim(),
    contactName:String(req.body.contactName||'').trim(),
    contactEmail:String(req.body.contactEmail||'').trim(),
    contactPhone:String(req.body.contactPhone||'').trim(),
    registrationUrl:String(req.body.registrationUrl||'').trim(),
    description:String(req.body.description||'').trim(),
    submittedAt:nowIso(), status:'pending',
  };
  if(!pending.meetName||!pending.date||!pending.city||!pending.contactName||!pending.contactEmail)
    return res.redirect('/submit-meet');
  if(!Array.isArray(db.pendingMeets)) db.pendingMeets=[];
  if(!Array.isArray(db.pendingRinks)) db.pendingRinks=[];
  db.pendingMeets.push(pending);
  saveDb(db);
  // Text Lee
  sendSms(ADMIN_PHONE, `🏁 New meet submission!\n${pending.meetName}\n${pending.city}, ${pending.state} • ${pending.date}\n${pending.contactName} • ${pending.contactEmail}\nReview: speedskatemeet.com/portal/pending-meets`);
  res.redirect('/submit-meet?ok=1');
});

// ── Pending Meets (super admin only) ──────────────────────────────────────────
app.get('/portal/pending-meets', requireRole('super_admin'), (req, res) => {
  const pending = (req.db.pendingMeets || []).filter(p => p.status === 'pending');
  const approved = (req.db.pendingMeets || []).filter(p => p.status === 'approved').slice(-10);
  const rejected = (req.db.pendingMeets || []).filter(p => p.status === 'rejected').slice(-10);

  res.send(pageShell({
    title: 'Pending Meets',
    user: req.user,
    bodyHtml: renderPendingMeetsView({ pending, approved, rejected }),
  }));
});

app.post('/portal/pending-meets/approve', requireRole('super_admin'), (req, res) => {
  const db=req.db;
  const p=(db.pendingMeets||[]).find(x=>x.id===String(req.body.id||''));
  if(!p) return res.redirect('/portal/pending-meets');
  p.status='approved'; p.approvedAt=nowIso();
  // Create a lite meet in the meets array
  const rink=db.rinks.find(r=>String(r.city||'').toLowerCase()===p.city.toLowerCase())||db.rinks[0];
  const liteMeet={
    id:nextId(db.meets), meetName:p.meetName, date:p.date, isPublic:true,
    status:'published', isLiteMeet:true,
    city:p.city, state:p.state,
    rinkId:rink?rink.id:1,
    registrationUrl:p.registrationUrl||'',
    description:p.description||'',
    contactName:p.contactName, contactEmail:p.contactEmail,
    createdByUserId:1, createdAt:nowIso(), updatedAt:nowIso(),
    races:[], blocks:[], registrations:[], groups:[], textAlerts:[],
  };
  db.meets.push(liteMeet);
  saveDb(db);
  // Email submitter
  if(p.contactEmail) {
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Your Meet is Live! 🏁</h2>
      <p>Hi ${esc(p.contactName)},</p>
      <p>Your meet <strong>${esc(p.meetName)}</strong> has been approved and is now listed on SpeedSkateMeet.com!</p>
      <p><a href="https://speedskatemeet.com/meets" style="background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">View on SpeedSkateMeet →</a></p>
      <p style="margin-top:16px">Interested in full race management — heat assignments, live scoring, text alerts, TV display? Reply to this email and we'll get you set up.</p>
    `);
    sendEmail(p.contactEmail, `Your Meet is Live — ${p.meetName}`, html, `Your meet ${p.meetName} is now live on SpeedSkateMeet.com!`);
  }
  res.redirect('/portal/pending-meets');
});

app.post('/portal/pending-meets/reject', requireRole('super_admin'), (req, res) => {
  const db=req.db;
  const p=(db.pendingMeets||[]).find(x=>x.id===String(req.body.id||''));
  if(!p) return res.redirect('/portal/pending-meets');
  p.status='rejected'; p.rejectedAt=nowIso(); p.rejectReason=String(req.body.reason||'').trim();
  saveDb(db);
  if(p.contactEmail) {
    const reason=p.rejectReason||'It did not meet our listing requirements at this time.';
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Meet Submission Update</h2>
      <p>Hi ${esc(p.contactName)},</p>
      <p>Thank you for submitting <strong>${esc(p.meetName)}</strong> to SpeedSkateMeet.com.</p>
      <p>Unfortunately we were unable to approve this listing at this time: <em>${esc(reason)}</em></p>
      <p>If you have questions, reply to this email.</p>
    `);
    sendEmail(p.contactEmail, `Meet Submission Update — ${p.meetName}`, html, `Update regarding your meet submission ${p.meetName}.`);
  }
  res.redirect('/portal/pending-meets');
});


function isPublicMeet(meet) {
  if (isArchivedMeet(meet)) return false;
  return !!(meet && (meet.isPublic || String(meet.status || '').toLowerCase() === 'published'));
}


module.exports = {
  usarsAge,
  ageForReg,
  makeOpenGroupsTemplate,
  makeQuadGroupsTemplate,
  makeAdditionalRaceSlots,
  makeManualExtraRaceSlots,
  nextId,
  makeDivisionsTemplate,
  baseGroups,
  defaultMeet,
  normalizeDivisionSet,
  normalizeOpenGroups,
  normalizeQuadGroups,
  migrateMeet,
  getMeetOr404,
  getMeetRink,
  meetRinkLabel,
  meetDateLabel,
  meetDayCount,
  nextSetupPresetId,
  makeSetupPresetFromMeet,
  presetRaceSignature,
  restorePresetBlocksIntoMeet,
  ensureAtLeastOneBlock,
  combineDateTime,
  isRegistrationClosed,
  ageMatch,
  groupAgeMatch,
  findAgeGroup,
  findChallengeUpGroup,
  challengeAdjustedGroup,
  divisionEnabledForRegistration,
  nextHelmetNumber,
  ensureRegistrationTotalsAndNumbers,
  entryLabelForRegistration,
  normalizeDistances,
  baseRaceKey,
  isOpenDivision,
  registrationSortKey,
  distributeByTeam,
  buildHeatRaceShell,
  shouldSplitIntoHeats,
  buildRaceSetForEntries,
  generateAdditionalRacesForMeet,
  raceBlockRestoreKey,
  restoreBlockAssignmentsAfterRaceSync,
  generateConfiguredRacesForMeet,
  isAdvancementRace,
  advancementFamilyKey,
  numericPlace,
  tryAdvanceTopThreeFromTwoHeats,
  pricingFieldsFromMeet,
  buildRegistrationPricingPreview,
  racingSoonLabel,
  isArchivedMeet,
  activeMeets,
  archivedMeetsForUser,
  cloneMeetSetup,
  coachVisibleMeets,
  coachTeamRegistrations,
  coachUpcomingForMeet,
  coachRecentResultsForMeet,
  coachStandingsForMeet,
  isPublicMeet,
};
