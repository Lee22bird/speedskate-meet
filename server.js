const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = process.env.SSM_DATA_FILE || path.join(DATA_DIR, 'ssm_db.json');

const SESSION_COOKIE = 'ssm_sess';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const ADMIN_USERNAME = 'Lbird22';
const ADMIN_PASSWORD = 'Redline22';

const TEAM_LIST = [
  'Independent','Aurora Speed Club','Ashland Speedskating of Virginia','Badger State Racing',
  "Bell's Speed Skating Team",'Capital City Racing','Carolina Gold Rush','CC Speed','CCN Inline',
  'Central Florida Speed Team','Champions Speed Skating Team','Classic Speed Skate Club',
  'Cobras Speed Skating','CW SpeedTeam','Dairy Ashford Speed Team','DFW Speed',
  'Diamond State Racing','FAST Speed Team','Fast Forward Racing','Front Range Speed Team',
  'Frenchtown Speed Team','Good Vibes Skate Company','GT Speed','High Point Speed Skating',
  'Infinity Racing','Inside Edge Racing','JKL Racing','Kentucky Speed','Mach Racing',
  'Mean Girls Racing','Middlesex Racing Team','Midland Rockets','Midwest Racing',
  'National Speed Skating Circuit','North Coast Inline Racing','North Idaho Elite',
  'Ocala Speed Inline Racing Team','Olympic Speed','Omni Speed','Pac West Inline Racing',
  'Phantom Racing','Precision Inline','Precision Racing','Rocket City Speed',
  'Rollaire Speed Team','Roller King Speed','Simmons Racing / Simmons Rana','SobeRollers',
  'SOS Racing','Stallions Racing','Star Skate Speed','Stardust Inline Speed Skating Team',
  'Synergy Speed Skating','TCK Skate Supply','Team Oaks','Team Velocity','Team Xtreme',
  'Tennessee Speed','Triad Racing','Tulsa Surge Speed Skating','Warrior Racing',
  "Weber's Racing","Weber's Skateway",'West Michigan Wolverines Speed Team',
].sort((a, b) => a.localeCompare(b));

const STANDARD_POINTS = { 1: 30, 2: 20, 3: 10, 4: 5 };

const OPEN_GROUP_DEFAULTS = [
  { id: 'open_juv_girls',   label: 'Juvenile Girls',  ages: '9 & Under',  gender: 'girls', defaultDistance: '1500m' },
  { id: 'open_juv_boys',    label: 'Juvenile Boys',   ages: '9 & Under',  gender: 'boys',  defaultDistance: '1500m' },
  { id: 'open_fresh_girls', label: 'Freshman Girls',  ages: '10-13',      gender: 'girls', defaultDistance: '2000m' },
  { id: 'open_fresh_boys',  label: 'Freshman Boys',   ages: '10-13',      gender: 'boys',  defaultDistance: '2000m' },
  { id: 'open_sr_ladies',   label: 'Senior Ladies',   ages: '14 & Older', gender: 'women', defaultDistance: '3000m' },
  { id: 'open_sr_men',      label: 'Senior Men',      ages: '14 & Older', gender: 'men',   defaultDistance: '5000m' },
  { id: 'open_mast_ladies', label: 'Masters Ladies',  ages: '35 & Older', gender: 'women', defaultDistance: '1500m' },
  { id: 'open_mast_men',    label: 'Masters Men',     ages: '35 & Older', gender: 'men',   defaultDistance: '2000m' },
];

function makeOpenGroupsTemplate() {
  return OPEN_GROUP_DEFAULTS.map(g => ({
    id: g.id, label: g.label, ages: g.ages, gender: g.gender,
    enabled: false, distance: g.defaultDistance, cost: 0,
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

function nowIso() { return new Date().toISOString(); }

function esc(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;');
}

function cap(s) { const str=String(s||''); return str?str.charAt(0).toUpperCase()+str.slice(1):''; }
function nextId(arr) { let max=0; for(const item of arr||[]) max=Math.max(max,Number(item.id)||0); return max+1; }

function parseCookies(req) {
  const raw=req.headers.cookie||''; const out={};
  raw.split(';').map(s=>s.trim()).filter(Boolean).forEach(pair=>{
    const idx=pair.indexOf('='); if(idx>-1) out[pair.slice(0,idx)]=decodeURIComponent(pair.slice(idx+1));
  }); return out;
}

function setCookie(res,name,value,maxAgeSec) {
  res.setHeader('Set-Cookie',`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`);
}
function clearCookie(res,name) { res.setHeader('Set-Cookie',`${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }

function safeReadJson(filePath) {
  if(!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath,'utf8')); } catch(err) { console.error('Failed reading JSON DB:',err); return null; }
}

function writeJsonAtomic(filePath,data) {
  const dir=path.dirname(filePath);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  const tmp=filePath+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8');
  fs.renameSync(tmp,filePath);
}

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
    meetName:'New Meet', date:'', startTime:'', registrationCloseAt:'',
    rinkId:1, trackLength:100, lanes:4,
    timeTrialsEnabled:false, relayEnabled:false, judgesPanelRequired:true,
    notes:'', relayNotes:'', isPublic:false, status:'draft',
    groups:baseGroups(), openGroups:makeOpenGroupsTemplate(), quadGroups:makeQuadGroupsTemplate(),
    races:[], blocks:[], registrations:[],
    currentRaceId:'', currentRaceIndex:-1, raceDayPaused:false,
  };
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
    meets:[],
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
    if(!out[key]) out[key]={enabled:false,cost:0,distances:['','','','']};
    out[key].enabled=!!out[key].enabled; out[key].cost=Number(out[key].cost||0);
    if(!Array.isArray(out[key].distances)) out[key].distances=['','','',''];
    out[key].distances=[0,1,2,3].map(i=>String(out[key].distances[i]||'').trim());
  } return out;
}

function normalizeOpenGroups(raw) {
  const defaults=makeOpenGroupsTemplate();
  if(!Array.isArray(raw)||raw.length===0) return defaults;
  return defaults.map(def=>{
    const saved=raw.find(r=>r.id===def.id); if(!saved) return def;
    return {id:def.id,label:def.label,ages:def.ages,gender:def.gender,
      enabled:!!saved.enabled, distance:String(saved.distance||def.defaultDistance||'').trim(), cost:Number(saved.cost||0)};
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
  if(typeof meet.startTime!=='string') meet.startTime='';
  if(typeof meet.registrationCloseAt!=='string') meet.registrationCloseAt='';
  if(typeof meet.rinkId!=='number') meet.rinkId=1;
  if(!Number.isFinite(Number(meet.trackLength))) meet.trackLength=100;
  if(!Number.isFinite(Number(meet.lanes))) meet.lanes=4;
  if(typeof meet.timeTrialsEnabled!=='boolean') meet.timeTrialsEnabled=false;
  if(typeof meet.relayEnabled!=='boolean') meet.relayEnabled=false;
  if(typeof meet.judgesPanelRequired!=='boolean') meet.judgesPanelRequired=true;
  if(typeof meet.notes!=='string') meet.notes='';
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
    isOpenRace:!!r.isOpenRace, isQuadRace:!!r.isQuadRace,
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
    meetNumber:Number(reg.meetNumber||idx+1),
    helmetNumber:reg.helmetNumber===''||reg.helmetNumber==null?'':Number(reg.helmetNumber),
    paid:!!reg.paid, checkedIn:!!reg.checkedIn, totalCost:Number(reg.totalCost||0),
    options:{challengeUp:!!reg.options?.challengeUp, novice:!!reg.options?.novice,
      elite:!!reg.options?.elite, open:!!reg.options?.open,
      timeTrials:!!reg.options?.timeTrials, relays:!!reg.options?.relays},
  }));
}

function loadDb() {
  let db=safeReadJson(DATA_FILE);
  if(!db) { db=defaultDb(); writeJsonAtomic(DATA_FILE,db); return db; }
  if(!Array.isArray(db.users)||db.users.length===0) db.users=defaultDb().users;
  if(!db.users.some(u=>u.username===ADMIN_USERNAME)) db.users.unshift(defaultDb().users[0]);
  if(!Array.isArray(db.rinks)) db.rinks=defaultDb().rinks;
  if(!Array.isArray(db.meets)) db.meets=[];
  if(!Array.isArray(db.sessions)) db.sessions=[];
  sanitizeRinks(db);
  const fallbackOwnerId=(db.users[0]&&db.users[0].id)||1;
  db.meets.forEach(m=>migrateMeet(m,fallbackOwnerId));
  db.sessions=db.sessions.filter(s=>s.expiresAt&&new Date(s.expiresAt).getTime()>Date.now());
  db.version=19; db.updatedAt=nowIso(); return db;
}

function saveDb(db) { db.version=19; db.updatedAt=nowIso(); writeJsonAtomic(DATA_FILE,db); }

function getSessionUser(req) {
  const token=parseCookies(req)[SESSION_COOKIE]; if(!token) return null;
  const db=loadDb(); const sess=db.sessions.find(s=>s.token===token); if(!sess) return null;
  if(new Date(sess.expiresAt).getTime()<=Date.now()) return null;
  const user=db.users.find(u=>u.id===sess.userId&&u.active!==false); if(!user) return null;
  return {db,session:sess,token,user};
}

function extendSession(db,token) {
  const sess=db.sessions.find(s=>s.token===token);
  if(sess) sess.expiresAt=new Date(Date.now()+SESSION_TTL_MS).toISOString();
}

function hasRole(user,role) { return Array.isArray(user.roles)&&user.roles.includes(role); }

function requireRole(...roles) {
  return (req,res,next)=>{
    const data=getSessionUser(req);
    if(!data) return res.redirect('/admin/login');
    extendSession(data.db,data.token); saveDb(data.db);
    req.db=data.db; req.user=data.user; req.sessionToken=data.token;
    if(hasRole(data.user,'super_admin')||roles.some(role=>hasRole(data.user,role))) return next();
    return res.status(403).send(pageShell({title:'Forbidden',user:data.user,
      bodyHtml:`<div class="page-header"><h1>Forbidden</h1></div><div class="card"><div class="danger">You do not have access to this page.</div></div>`}));
  };
}

function getMeetOr404(db,meetId) { return db.meets.find(m=>Number(m.id)===Number(meetId)); }
function canEditMeet(user,meet) { return hasRole(user,'super_admin')||Number(meet.createdByUserId)===Number(user.id); }

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

function groupAgeMatch(group,age) {
  const n=Number(age); const ages=String(group.ages||'');
  if(ages.includes('& under')) { const limit=Number((ages.match(/\d+/)||[0])[0]); return n<=limit; }
  if(ages.includes('+')) { const min=Number((ages.match(/\d+/)||[999])[0]); return n>=min; }
  const nums=ages.match(/\d+/g)||[]; if(nums.length>=2) return n>=Number(nums[0])&&n<=Number(nums[1]); return false;
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

function calculateRegistrationTotal(meet,reg) {
  let total=0;
  for(const race of meet.races||[]) {
    if(String(race.groupId)===String(reg.divisionGroupId)&&divisionEnabledForRegistration(reg,race.division))
      total+=Number(race.cost||0);
  } return total;
}

function ensureRegistrationTotalsAndNumbers(meet) {
  for(const reg of meet.registrations||[]) {
    reg.totalCost=calculateRegistrationTotal(meet,reg);
    if(!Number.isFinite(Number(reg.helmetNumber))||Number(reg.helmetNumber)<=0) reg.helmetNumber=nextHelmetNumber(meet);
  }
}

function sponsorLineHtml(sponsor) {
  const s=String(sponsor||'').trim(); if(!s) return '';
  return `<div class="sponsor-line">Sponsored by ${esc(s)}</div>`;
}

function normalizeDistances(arr4) { return [0,1,2,3].map(i=>String(arr4?.[i]??'').trim()); }
function baseRaceKey(groupId,division,dayIndex,distanceLabel) { return `${groupId}|${division}|${dayIndex}|${distanceLabel}`; }
function isOpenDivision(div) { return String(div||'').toLowerCase()==='open'; }

function raceDisplayStage(race) {
  if(race.stage==='heat') return `Heat ${race.heatNumber}`;
  if(race.stage==='semi') return `Semi ${race.heatNumber}`;
  if(race.stage==='final') return 'Final'; return 'Race';
}

function normalizePlaceValue(place) {
  const n=Number(String(place||'').trim()); return Number.isFinite(n)?n:null;
}

function scoreRaceByStandardPoints(race) {
  const results=[];
  for(const entry of race.laneEntries||[]) {
    const place=normalizePlaceValue(entry.place);
    if(place==null||place>4) continue;
    results.push({registrationId:entry.registrationId,skaterName:entry.skaterName,team:entry.team,place});
  }
  const grouped=new Map();
  for(const item of results) { if(!grouped.has(item.place)) grouped.set(item.place,[]); grouped.get(item.place).push(item); }
  const scored=[];
  for(const place of Array.from(grouped.keys()).sort((a,b)=>a-b)) {
    const tied=grouped.get(place)||[]; if(!tied.length) continue;
    let pointPool=0;
    for(let i=0;i<tied.length;i++) pointPool+=Number(STANDARD_POINTS[place+i]||0);
    const each=tied.length?(pointPool/tied.length):0;
    for(const skater of tied) scored.push({...skater,points:each});
  } return scored;
}

function computeMeetStandings(meet) {
  const standings={}; const divisions={}; const regMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));
  for(const race of meet.races||[]) {
    if(race.isOpenRace||race.isQuadRace) continue;
    if(!race.isFinal||!race.countsForOverall) continue;
    if(String(race.status||'')!=='closed') continue;
    const bucketKey=`${race.groupId}|${race.division}`;
    if(!divisions[bucketKey]) divisions[bucketKey]={groupId:race.groupId,groupLabel:race.groupLabel,division:race.division,races:[]};
    divisions[bucketKey].races.push(race);
    const scored=scoreRaceByStandardPoints(race);
    if(!standings[bucketKey]) standings[bucketKey]={};
    for(const row of scored) {
      const regKey=String(row.registrationId||row.skaterName||crypto.randomBytes(3).toString('hex'));
      const reg=regMap.get(Number(row.registrationId));
      if(!standings[bucketKey][regKey]) standings[bucketKey][regKey]={registrationId:row.registrationId,skaterName:row.skaterName,team:row.team,sponsor:reg?.sponsor||'',totalPoints:0,raceScores:[]};
      standings[bucketKey][regKey].totalPoints+=Number(row.points||0);
      standings[bucketKey][regKey].raceScores.push({raceId:race.id,distanceLabel:race.distanceLabel,place:row.place,points:row.points});
    }
  }
  return Object.keys(divisions).map(key=>{
    const rows=Object.values(standings[key]||{}).sort((a,b)=>b.totalPoints!==a.totalPoints?b.totalPoints-a.totalPoints:String(a.skaterName||'').localeCompare(String(b.skaterName||''))).map((row,idx)=>({...row,overallPlace:idx+1}));
    return {key,groupId:divisions[key].groupId,groupLabel:divisions[key].groupLabel,division:divisions[key].division,races:divisions[key].races.sort((a,b)=>Number(a.dayIndex||0)-Number(b.dayIndex||0)),standings:rows};
  }).sort((a,b)=>{const byGroup=String(a.groupLabel).localeCompare(String(b.groupLabel));return byGroup!==0?byGroup:String(a.division).localeCompare(String(b.division));});
}

function computeQuadStandings(meet) {
  const standings={}; const divisions={}; const regMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));
  for(const race of meet.races||[]) {
    if(!race.isQuadRace) continue;
    if(!race.isFinal||!race.countsForOverall) continue;
    if(String(race.status||'')!=='closed') continue;
    const bucketKey=`${race.groupId}|${race.distanceLabel}`;
    if(!divisions[bucketKey]) divisions[bucketKey]={groupId:race.groupId,groupLabel:race.groupLabel,distanceLabel:race.distanceLabel,races:[]};
    divisions[bucketKey].races.push(race);
    const scored=scoreRaceByStandardPoints(race);
    if(!standings[bucketKey]) standings[bucketKey]={};
    for(const row of scored) {
      const regKey=String(row.registrationId||row.skaterName||crypto.randomBytes(3).toString('hex'));
      const reg=regMap.get(Number(row.registrationId));
      if(!standings[bucketKey][regKey]) standings[bucketKey][regKey]={registrationId:row.registrationId,skaterName:row.skaterName,team:row.team,sponsor:reg?.sponsor||'',totalPoints:0,raceScores:[]};
      standings[bucketKey][regKey].totalPoints+=Number(row.points||0);
      standings[bucketKey][regKey].raceScores.push({raceId:race.id,distanceLabel:race.distanceLabel,place:row.place,points:row.points});
    }
  }
  return Object.keys(divisions).map(key=>{
    const rows=Object.values(standings[key]||{}).sort((a,b)=>b.totalPoints!==a.totalPoints?b.totalPoints-a.totalPoints:String(a.skaterName||'').localeCompare(String(b.skaterName||''))).map((row,idx)=>({...row,overallPlace:idx+1}));
    return {key,groupId:divisions[key].groupId,groupLabel:divisions[key].groupLabel,distanceLabel:divisions[key].distanceLabel,races:divisions[key].races,standings:rows};
  }).sort((a,b)=>String(a.groupLabel).localeCompare(String(b.groupLabel)));
}

function computeOpenResults(meet) {
  return (meet.races||[]).filter(r=>(isOpenDivision(r.division)||r.isOpenRace)&&r.isFinal&&String(r.status||'')==='closed')
    .sort((a,b)=>{const byGroup=String(a.groupLabel||'').localeCompare(String(b.groupLabel||''));return byGroup!==0?byGroup:Number(a.dayIndex||0)-Number(b.dayIndex||0);})
    .map(race=>({race,rows:(race.laneEntries||[]).filter(x=>String(x.place||'').trim()).sort((a,b)=>Number(a.place||999)-Number(b.place||999))}));
}

function recentClosedRaces(meet,count=5) {
  return (meet.races||[]).filter(r=>String(r.status||'')==='closed')
    .sort((a,b)=>new Date(b.closedAt||0).getTime()-new Date(a.closedAt||0).getTime()).slice(0,count);
}

function orderedRaces(meet) {
  const raceById=new Map((meet.races||[]).map(r=>[r.id,r])); const out=[];
  for(const block of meet.blocks||[]) for(const raceId of block.raceIds||[]) { const race=raceById.get(raceId); if(race) out.push({...race,blockId:block.id,blockName:block.name,blockDay:block.day,blockType:block.type||'race',blockNotes:block.notes||''}); }
  const assigned=new Set(out.map(r=>r.id));
  for(const race of meet.races||[]) if(!assigned.has(race.id)) out.push({...race,blockId:'',blockName:'Unassigned',blockDay:'',blockType:'race',blockNotes:''});
  return out;
}

function currentRaceInfo(meet) {
  const ordered=orderedRaces(meet);
  let idx=ordered.findIndex(r=>r.id===meet.currentRaceId);
  if(idx<0) idx=Number.isFinite(meet.currentRaceIndex)?meet.currentRaceIndex:-1;
  if(idx<0&&ordered.length) idx=0;
  return {ordered,idx,current:idx>=0?ordered[idx]:null,next:idx>=0&&ordered[idx+1]?ordered[idx+1]:null,coming:idx>=0?ordered.slice(idx+2,idx+5):ordered.slice(0,3)};
}

function ensureCurrentRace(meet) {
  const info=currentRaceInfo(meet);
  if(info.current&&meet.currentRaceId!==info.current.id) { meet.currentRaceId=info.current.id; meet.currentRaceIndex=info.idx; }
}

function laneRowsForRace(race,meet) {
  const out=[];
  const maxLanes=(race.isOpenRace||String(race.division||'')==='open')?Math.max((race.laneEntries||[]).length,1):Math.max(1,Number(meet.lanes)||4);
  for(let lane=1;lane<=maxLanes;lane++) {
    const existing=(race.laneEntries||[]).find(x=>Number(x.lane)===lane)||{};
    out.push({lane,registrationId:existing.registrationId||'',helmetNumber:existing.helmetNumber||'',skaterName:existing.skaterName||'',team:existing.team||'',place:existing.place||'',time:existing.time||'',status:existing.status||''});
  } return out;
}

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

function generateBaseRacesForMeet(meet) {
  const oldMap=new Map((meet.races||[]).filter(r=>!r.isOpenRace&&!r.isQuadRace&&!['heat','semi'].includes(String(r.stage||''))).map(r=>[baseRaceKey(r.groupId,r.division,r.dayIndex,r.distanceLabel),r]));
  const races=[]; let orderHint=1;
  for(const group of meet.groups||[]) {
    for(const divKey of ['novice','elite']) {
      const div=group.divisions?.[divKey]; if(!div||!div.enabled) continue;
      const distances=normalizeDistances(div.distances);
      for(let i=0;i<4;i++) {
        const distance=distances[i]; if(!distance) continue;
        const key=baseRaceKey(group.id,divKey,i+1,distance); const old=oldMap.get(key); const isOpen=isOpenDivision(divKey);
        races.push({id:old?.id||('r'+crypto.randomBytes(6).toString('hex')),orderHint:orderHint++,
          groupId:group.id,groupLabel:group.label,ages:group.ages,division:divKey,distanceLabel:distance,dayIndex:i+1,cost:Number(div.cost||0),
          stage:isOpen?'final':(old?.stage||'race'),heatNumber:isOpen?0:Number(old?.heatNumber||0),
          parentRaceKey:old?.parentRaceKey||key,startType:isOpen?'rolling':(old?.startType||'standing'),
          countsForOverall:isOpen?false:(typeof old?.countsForOverall==='boolean'?old.countsForOverall:true),
          laneEntries:Array.isArray(old?.laneEntries)?old.laneEntries:[],
          resultsMode:old?.resultsMode||'places',status:old?.status||'open',notes:String(old?.notes||''),
          isFinal:isOpen?true:!!old?.isFinal,closedAt:old?.closedAt||'',isOpenRace:false,isQuadRace:false});
      }
    }
  }
  const existingSpecial=(meet.races||[]).filter(r=>r.isOpenRace||r.isQuadRace);
  for(const r of existingSpecial) races.push(r);
  const validIds=new Set(races.map(r=>r.id));
  meet.blocks=(meet.blocks||[]).map(block=>({...block,raceIds:(block.raceIds||[]).filter(rid=>validIds.has(rid))}));
  meet.races=races;
  if(!validIds.has(meet.currentRaceId)){meet.currentRaceId='';meet.currentRaceIndex=-1;}
  meet.updatedAt=nowIso();
}

function generateOpenRacesForMeet(meet) {
  const nonOpenRaces=(meet.races||[]).filter(r=>!r.isOpenRace); const openRaces=[]; let orderHint=9000;
  for(const og of meet.openGroups||[]) {
    if(!og.enabled||!og.distance) continue;
    const existingRace=(meet.races||[]).find(r=>r.isOpenRace&&r.groupId===og.id);
    openRaces.push({id:existingRace?.id||('r'+crypto.randomBytes(6).toString('hex')),orderHint:orderHint++,
      groupId:og.id,groupLabel:og.label,ages:og.ages,division:'open',distanceLabel:og.distance,dayIndex:1,cost:Number(og.cost||0),
      stage:'final',heatNumber:0,parentRaceKey:`open|${og.id}`,startType:'rolling',countsForOverall:false,
      laneEntries:Array.isArray(existingRace?.laneEntries)?existingRace.laneEntries:[],
      resultsMode:existingRace?.resultsMode||'places',status:existingRace?.status||'open',
      notes:String(existingRace?.notes||''),isFinal:true,closedAt:existingRace?.closedAt||'',
      isOpenRace:true,isQuadRace:false});
  }
  meet.races=[...nonOpenRaces,...openRaces]; meet.updatedAt=nowIso();
}

function generateQuadRacesForMeet(meet) {
  const nonQuadRaces=(meet.races||[]).filter(r=>!r.isQuadRace); const quadRaces=[]; let orderHint=8000;
  for(const qg of meet.quadGroups||[]) {
    if(!qg.enabled) continue;
    const distances=(qg.distances||[]).filter(Boolean);
    distances.forEach((distance,i)=>{
      const existingRace=(meet.races||[]).find(r=>r.isQuadRace&&r.groupId===qg.id&&r.distanceLabel===distance);
      quadRaces.push({id:existingRace?.id||('r'+crypto.randomBytes(6).toString('hex')),orderHint:orderHint++,
        groupId:qg.id,groupLabel:qg.label,ages:qg.ages,division:'quad',distanceLabel:distance,dayIndex:i+1,cost:Number(qg.cost||0),
        stage:existingRace?.stage||'race',heatNumber:Number(existingRace?.heatNumber||0),
        parentRaceKey:existingRace?.parentRaceKey||`quad|${qg.id}|${distance}`,startType:existingRace?.startType||'standing',
        countsForOverall:typeof existingRace?.countsForOverall==='boolean'?existingRace.countsForOverall:true,
        laneEntries:Array.isArray(existingRace?.laneEntries)?existingRace.laneEntries:[],
        resultsMode:existingRace?.resultsMode||'places',status:existingRace?.status||'open',
        notes:String(existingRace?.notes||''),isFinal:!!existingRace?.isFinal,closedAt:existingRace?.closedAt||'',
        isOpenRace:false,isQuadRace:true});
    });
  }
  meet.races=[...nonQuadRaces,...quadRaces]; meet.updatedAt=nowIso();
}

function rebuildRaceAssignments(meet) {
  ensureRegistrationTotalsAndNumbers(meet);
  const laneCount=Math.max(1,Number(meet.lanes)||4);
  const originalBlocks=(meet.blocks||[]).map(block=>({...block,raceIds:[...(block.raceIds||[])]}));
  const baseRaces=(meet.races||[]).filter(r=>!r.isOpenRace&&!r.isQuadRace&&!['heat','semi'].includes(String(r.stage||'')));
  const newRaces=[];
  for(const baseRace of baseRaces) {
    const matchingRegs=(meet.registrations||[]).filter(reg=>String(reg.divisionGroupId||'')===String(baseRace.groupId||'')&&divisionEnabledForRegistration(reg,baseRace.division));
    newRaces.push(...buildRaceSetForEntries(baseRace,matchingRegs,laneCount));
  }
  const quadBaseRaces=(meet.races||[]).filter(r=>r.isQuadRace&&!['heat','semi'].includes(String(r.stage||'')));
  for(const baseRace of quadBaseRaces) { const raceSet=buildRaceSetForEntries(baseRace,[],laneCount); newRaces.push(...raceSet); }
  const openRaces=(meet.races||[]).filter(r=>r.isOpenRace); newRaces.push(...openRaces);
  const mappedBlocks=originalBlocks.map(block=>{
    const nextRaceIds=[];
    for(const oldRid of block.raceIds||[]) {
      const oldRace=(meet.races||[]).find(r=>r.id===oldRid); if(!oldRace) continue;
      if(oldRace.isOpenRace){if(!nextRaceIds.includes(oldRace.id)) nextRaceIds.push(oldRace.id);continue;}
      const parentKey=oldRace.parentRaceKey||baseRaceKey(oldRace.groupId,oldRace.division,oldRace.dayIndex,oldRace.distanceLabel);
      const replacements=newRaces.filter(r=>(r.parentRaceKey||'')===parentKey);
      for(const rep of replacements) if(!nextRaceIds.includes(rep.id)) nextRaceIds.push(rep.id);
    } return {...block,raceIds:nextRaceIds};
  });
  meet.races=newRaces; meet.blocks=mappedBlocks; meet.updatedAt=nowIso(); ensureCurrentRace(meet);
}

function racingSoonLabel(delta) {
  if(delta<=0) return 'NOW'; if(delta===1) return 'ON DECK';
  if(delta===2) return '2 RACES AWAY'; if(delta===3) return '3 RACES AWAY'; return `${delta} RACES AWAY`;
}

function coachVisibleMeets(db,user) {
  if(hasRole(user,'super_admin')) return db.meets;
  if(hasRole(user,'meet_director')) return db.meets.filter(m=>Number(m.createdByUserId)===Number(user.id));
  if(hasRole(user,'coach')) return db.meets.filter(m=>(m.registrations||[]).some(r=>String(r.team||'').trim().toLowerCase()===String(user.team||'').trim().toLowerCase()));
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
    return {race,raceIndex:idx,delta:idx-info.idx,skaters:matched.map(m=>({registrationId:m.registrationId,skaterName:m.skaterName,helmetNumber:m.helmetNumber,team:m.team}))};
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

function announcerBoxHtml(current,lanes) {
  if(!current) return `<div class="muted">No race selected.</div>`;
  const laneLines=lanes.filter(l=>l.skaterName).map(l=>`
    <div class="announcer-lane">
      <div class="announcer-lane-name">LANE ${esc(l.lane)} — ${l.helmetNumber?'#'+esc(l.helmetNumber)+' ':''}${esc(l.skaterName)}</div>
      <div class="announcer-lane-team">${esc(l.team||'')}</div>
      ${l.sponsor?`<div class="announcer-lane-sponsor">Sponsored by ${esc(l.sponsor)}</div>`:''}
    </div>`).join('');
  return `
    <div class="announcer-box">
      <div class="announcer-label">Now Racing</div>
      <div class="announcer-group">${esc(current.groupLabel)}</div>
      <div class="announcer-meta">${esc(cap(current.division))} • ${esc(current.distanceLabel)} • ${esc(raceDisplayStage(current))}</div>
      <div class="announcer-start">${esc(cap(current.startType))} Start</div>
      <div class="announcer-divider"></div>
      <div class="announcer-lanes-label">Lanes</div>
      ${laneLines||`<div class="announcer-empty">No skaters entered yet.</div>`}
    </div>`;
}

// ── CSS toggle switch helper ─────────────────────────────────────────────────
function toggleSwitch(name, checked, label='', value='on') {
  return `
    <label class="toggle-wrap">
      <input type="checkbox" name="${esc(name)}" value="${esc(value)}" class="toggle-input" ${checked?'checked':''} />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      ${label?`<span class="toggle-label">${esc(label)}</span>`:''}
    </label>`;
}

// ── Nav & Tabs ────────────────────────────────────────────────────────────────
function navHtml(user) {
  return `
    <nav class="topnav">
      <div class="nav-inner">
        <a class="nav-brand" href="/">
          <img src="/public/images/branding/ssm-logo.png" alt="SpeedSkateMeet" class="nav-logo" />
        </a>
        <div class="nav-links">
          <a class="nav-link" href="/">Home</a>
          <a class="nav-link" href="/meets">Find a Meet</a>
          <a class="nav-link" href="/rinks">Rinks</a>
          <a class="nav-link" href="/live">Live</a>
          ${user
            ? `<a class="nav-link nav-cta" href="/portal">Portal</a><a class="nav-link nav-ghost" href="/admin/logout">Logout</a>`
            : `<a class="nav-link nav-cta" href="/admin/login">Login</a>`}
        </div>
      </div>
    </nav>`;
}

function meetTabs(meet, active) {
  if(!meet) return '';
  const tabs=[
    ['builder','Meet Builder',`/portal/meet/${meet.id}/builder`],
    ['open-builder','Open Builder',`/portal/meet/${meet.id}/open-builder`],
    ['quad-builder','Quad Builder',`/portal/meet/${meet.id}/quad-builder`],
    ['blocks','Block Builder',`/portal/meet/${meet.id}/blocks`],
    ['registered','Registered',`/portal/meet/${meet.id}/registered`],
    ['checkin','Check-In',`/portal/meet/${meet.id}/checkin`],
    ['race-day','Race Day',`/portal/meet/${meet.id}/race-day/director`],
    ['results','Results',`/portal/meet/${meet.id}/results`],
  ];
  return `<div class="meet-tabs">${tabs.map(([key,label,href])=>`<a class="meet-tab${active===key?' active':''}" href="${href}">${label}</a>`).join('')}</div>`;
}
function pageShell({ title, bodyHtml, user, meet, activeTab }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} — SpeedSkateMeet</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    /* ── Design Tokens ────────────────────────────────────────────── */
    :root {
      --navy:    #0F1F3D;
      --navy2:   #162847;
      --navy3:   #1e3459;
      --orange:  #F97316;
      --orange2: #ea580c;
      --sky:     #38BDF8;
      --sky2:    #0ea5e9;
      --white:   #ffffff;
      --off:     #f8fafc;
      --card:    #ffffff;
      --border:  rgba(15,31,61,.10);
      --border2: rgba(15,31,61,.18);
      --text:    #0F1F3D;
      --muted:   #64748b;
      --green:   #10b981;
      --red:     #ef4444;
      --yellow:  #f59e0b;
      --purple:  #7c3aed;
      --shadow-sm: 0 1px 3px rgba(15,31,61,.08), 0 1px 2px rgba(15,31,61,.06);
      --shadow:    0 4px 16px rgba(15,31,61,.10), 0 2px 6px rgba(15,31,61,.06);
      --shadow-lg: 0 10px 40px rgba(15,31,61,.14), 0 4px 12px rgba(15,31,61,.08);
      --radius-sm: 8px;
      --radius:    14px;
      --radius-lg: 20px;
    }

    /* ── Reset ────────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Barlow', ui-sans-serif, system-ui, sans-serif;
      font-size: 15px; line-height: 1.6; color: var(--text);
      background: var(--off);
      min-height: 100vh;
    }
    a { color: var(--sky2); text-decoration: none; }
    a:hover { color: var(--orange); }

    /* ── Nav ──────────────────────────────────────────────────────── */
    .topnav {
      background: var(--navy);
      border-bottom: 2px solid var(--orange);
      position: sticky; top: 0; z-index: 100;
      box-shadow: 0 2px 20px rgba(15,31,61,.40);
    }
    .nav-inner {
      max-width: 1340px; margin: 0 auto; padding: 0 20px;
      display: flex; align-items: center; justify-content: space-between; gap: 20px;
      height: 64px;
    }
    .nav-brand { display: flex; align-items: center; }
    .nav-logo { height: 44px; width: auto; display: block; }
    .nav-links { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
    .nav-link {
      padding: 8px 14px; border-radius: var(--radius-sm); font-weight: 600; font-size: 14px;
      color: rgba(255,255,255,.80); transition: color .15s, background .15s;
    }
    .nav-link:hover { color: #fff; background: rgba(255,255,255,.10); }
    .nav-cta {
      background: var(--orange); color: #fff; font-weight: 700;
      box-shadow: 0 2px 8px rgba(249,115,22,.40);
    }
    .nav-cta:hover { background: var(--orange2); color: #fff; }
    .nav-ghost { border: 1px solid rgba(255,255,255,.25); color: rgba(255,255,255,.70); }
    .nav-ghost:hover { border-color: rgba(255,255,255,.50); color: #fff; background: transparent; }

    /* ── Layout ───────────────────────────────────────────────────── */
    .wrap { max-width: 1340px; margin: 0 auto; padding: 28px 20px 80px; }
    .page-header { margin-bottom: 22px; }
    .page-header h1 { font-family: 'Barlow Condensed', sans-serif; font-size: 48px; font-weight: 900; letter-spacing: -1px; line-height: 1; color: var(--navy); }
    .page-header .sub { font-size: 16px; color: var(--muted); margin-top: 4px; }
    h1 { font-family: 'Barlow Condensed', sans-serif; font-size: 40px; font-weight: 900; letter-spacing: -.5px; color: var(--navy); margin-bottom: 14px; }
    h2 { font-family: 'Barlow Condensed', sans-serif; font-size: 26px; font-weight: 700; letter-spacing: -.3px; color: var(--navy); margin-bottom: 8px; }
    h3 { font-family: 'Barlow Condensed', sans-serif; font-size: 20px; font-weight: 700; color: var(--navy); margin-bottom: 6px; }
    p { margin-bottom: 12px; }

    /* ── Cards ────────────────────────────────────────────────────── */
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 22px;
    }
    .card-sm { padding: 14px; border-radius: var(--radius); }
    .card-accent { border-left: 4px solid var(--orange); }
    .card-sky   { border-left: 4px solid var(--sky); }
    .card-navy  { background: var(--navy); color: #fff; }
    .card-navy h2, .card-navy h3 { color: #fff; }

    /* ── Status cards ─────────────────────────────────────────────── */
    .stat-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
    @media(max-width:800px){.stat-grid{grid-template-columns:1fr;}}
    .stat-card {
      border-radius: var(--radius-lg); padding: 20px 22px; color: #fff;
      box-shadow: var(--shadow);
    }
    .stat-card.orange { background: linear-gradient(135deg, var(--orange2), var(--orange)); }
    .stat-card.sky    { background: linear-gradient(135deg, var(--sky2), var(--sky)); }
    .stat-card.navy   { background: linear-gradient(135deg, var(--navy2), var(--navy3)); }
    .stat-card.green  { background: linear-gradient(135deg, #059669, var(--green)); }
    .stat-card.yellow { background: linear-gradient(135deg, #d97706, var(--yellow)); }
    .stat-card.purple { background: linear-gradient(135deg, #6d28d9, var(--purple)); }
    .stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; opacity: .85; }
    .stat-value { font-family: 'Barlow Condensed', sans-serif; font-size: 30px; font-weight: 900; line-height: 1.1; margin-top: 4px; }
    .stat-sub   { font-size: 13px; opacity: .85; margin-top: 2px; }

    /* ── Buttons ──────────────────────────────────────────────────── */
    .btn, .btn2, .btn-danger, .btn-good, .btn-orange, .btn-purple, .btn-sky {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      border: 0; border-radius: var(--radius-sm); padding: 10px 18px;
      font-family: 'Barlow', sans-serif; font-weight: 700; font-size: 14px;
      cursor: pointer; transition: all .15s; white-space: nowrap; text-decoration: none;
    }
    .btn        { background: var(--navy);   color: #fff; box-shadow: var(--shadow-sm); }
    .btn:hover  { background: var(--navy2);  color: #fff; box-shadow: var(--shadow); transform: translateY(-1px); }
    .btn2       { background: #fff; color: var(--navy); border: 1.5px solid var(--border2); box-shadow: var(--shadow-sm); }
    .btn2:hover { background: var(--off); color: var(--navy); box-shadow: var(--shadow); transform: translateY(-1px); }
    .btn-danger       { background: #fff; color: var(--red); border: 1.5px solid #fca5a5; }
    .btn-danger:hover { background: #fef2f2; color: var(--red); }
    .btn-good         { background: #fff; color: var(--green); border: 1.5px solid #6ee7b7; }
    .btn-good:hover   { background: #ecfdf5; color: var(--green); }
    .btn-orange       { background: var(--orange); color: #fff; box-shadow: 0 2px 8px rgba(249,115,22,.35); }
    .btn-orange:hover { background: var(--orange2); color: #fff; transform: translateY(-1px); }
    .btn-purple       { background: var(--purple); color: #fff; box-shadow: 0 2px 8px rgba(124,58,237,.35); }
    .btn-purple:hover { background: #6d28d9; color: #fff; transform: translateY(-1px); }
    .btn-sky          { background: var(--sky2); color: #fff; box-shadow: 0 2px 8px rgba(14,165,233,.35); }
    .btn-sky:hover    { background: var(--sky); color: #fff; transform: translateY(-1px); }
    .btn-sm { padding: 7px 12px; font-size: 13px; border-radius: 6px; }
    .action-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

    /* ── Meet Tabs ────────────────────────────────────────────────── */
    .meet-tabs {
      display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px;
      background: var(--navy); border-radius: var(--radius-lg);
      padding: 8px; box-shadow: var(--shadow);
    }
    .meet-tab {
      padding: 10px 16px; border-radius: var(--radius-sm);
      font-weight: 700; font-size: 13px; color: rgba(255,255,255,.65);
      transition: all .15s; white-space: nowrap;
    }
    .meet-tab:hover { color: #fff; background: rgba(255,255,255,.10); }
    .meet-tab.active { background: var(--orange); color: #fff; box-shadow: 0 2px 8px rgba(249,115,22,.40); }

    /* ── Sub-tabs ─────────────────────────────────────────────────── */
    .sub-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    .sub-tab { padding: 9px 16px; border-radius: var(--radius-sm); border: 1.5px solid var(--border2); font-weight: 700; font-size: 13px; color: var(--navy); background: #fff; }
    .sub-tab.active { background: var(--navy); color: #fff; border-color: var(--navy); }

    /* ── Forms ────────────────────────────────────────────────────── */
    label { display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 5px; }
    input[type=text], input[type=date], input[type=time], input[type=number], input[type=email], input[type=password], input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), select, textarea {
      width: 100%; padding: 10px 12px; border-radius: var(--radius-sm);
      border: 1.5px solid var(--border2); font-family: 'Barlow', sans-serif; font-size: 14px;
      color: var(--text); background: #fff; outline: none; transition: border-color .15s, box-shadow .15s;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--sky2); box-shadow: 0 0 0 3px rgba(56,189,248,.20); }
    textarea { min-height: 90px; resize: vertical; }
    .form-grid  { display: grid; gap: 14px; }
    .cols-2 { grid-template-columns: 1fr 1fr; }
    .cols-3 { grid-template-columns: 1fr 1fr 1fr; }
    .cols-4 { grid-template-columns: repeat(4,1fr); }
    @media(max-width:1000px){ .cols-4,.cols-3 { grid-template-columns: 1fr 1fr; } }
    @media(max-width:700px) { .cols-2,.cols-3,.cols-4 { grid-template-columns: 1fr; } }
    .stack { display: flex; flex-direction: column; gap: 14px; }
    .row   { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .row.center  { align-items: center; }
    .row.between { justify-content: space-between; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    @media(max-width:860px) { .grid-2,.grid-3 { grid-template-columns: 1fr; } }

    /* ── Toggle Switches ──────────────────────────────────────────── */
    .toggle-wrap { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
    .toggle-input { position: absolute; opacity: 0; width: 0; height: 0; }
    .toggle-track {
      position: relative; width: 44px; height: 24px; border-radius: 999px;
      background: #cbd5e1; transition: background .2s; flex-shrink: 0;
    }
    .toggle-input:checked + .toggle-track { background: var(--orange); }
    .toggle-thumb {
      position: absolute; top: 3px; left: 3px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.20);
      transition: transform .2s;
    }
    .toggle-input:checked + .toggle-track .toggle-thumb { transform: translateX(20px); }
    .toggle-label { font-size: 14px; font-weight: 600; color: var(--text); text-transform: none; letter-spacing: 0; }
    .toggle-group { display: flex; flex-direction: column; gap: 12px; }
    .toggle-row   { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--off); border: 1px solid var(--border); }
    .toggle-row-label { font-weight: 700; font-size: 14px; color: var(--navy); }
    .toggle-row-desc  { font-size: 12px; color: var(--muted); margin-top: 1px; }

    /* ── Table ────────────────────────────────────────────────────── */
    .table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .table th { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700; padding: 10px 12px; border-bottom: 2px solid var(--border); text-align: left; }
    .table td { padding: 11px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .table tr:last-child td { border-bottom: 0; }
    .table tr:hover td { background: #f8fafc; }

    /* ── Chips / Badges ───────────────────────────────────────────── */
    .chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; border: 1px solid var(--border2); background: #fff; color: var(--navy); white-space: nowrap; }
    .chip-orange { background: #fff7ed; border-color: #fed7aa; color: var(--orange2); }
    .chip-purple { background: #faf5ff; border-color: #d8b4fe; color: var(--purple); }
    .chip-sky    { background: #f0f9ff; border-color: #bae6fd; color: var(--sky2); }
    .chip-green  { background: #ecfdf5; border-color: #6ee7b7; color: #059669; }

    /* ── Builder Banners ──────────────────────────────────────────── */
    .builder-banner { border-radius: var(--radius-lg); padding: 20px 24px; margin-bottom: 18px; color: #fff; }
    .builder-banner.orange { background: linear-gradient(135deg, var(--orange2) 0%, var(--orange) 60%, #fb923c 100%); }
    .builder-banner.purple { background: linear-gradient(135deg, #6d28d9 0%, var(--purple) 60%, #8b5cf6 100%); }
    .builder-banner h2 { color: #fff; margin-bottom: 4px; }
    .builder-banner .sub { color: rgba(255,255,255,.85); font-size: 14px; }

    /* ── Group Cards ──────────────────────────────────────────────── */
    .group-card      { padding: 18px; border-radius: var(--radius); border: 1.5px solid var(--border2); background: #fff; }
    .open-group-card { padding: 18px; border-radius: var(--radius); border: 1.5px solid #fed7aa; background: #fffaf5; }
    .quad-group-card { padding: 18px; border-radius: var(--radius); border: 1.5px solid #d8b4fe; background: #faf5ff; }

    /* ── Block Builder ────────────────────────────────────────────── */
    .bb-grid { display: grid; grid-template-columns: 1.3fr .85fr; gap: 18px; }
    @media(max-width:1040px) { .bb-grid { grid-template-columns: 1fr; } }
    .bb-sticky { position: sticky; top: 80px; align-self: start; }
    .block-card { border: 1.5px solid var(--border2); background: #fff; border-radius: var(--radius-lg); padding: 16px; margin-bottom: 14px; }
    .block-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .divider-card { margin-bottom: 14px; }
    .divider-card-inner { display: flex; align-items: center; gap: 12px; background: var(--off); border: 1.5px dashed var(--border2); border-radius: var(--radius); padding: 12px 16px; flex-wrap: wrap; }
    .divider-icon { font-size: 22px; flex-shrink: 0; }
    .divider-info { flex: 1; min-width: 120px; }
    .divider-name { font-weight: 700; font-size: 15px; color: var(--muted); }
    .divider-day-sel { max-width: 100px; padding: 6px 8px; font-size: 13px; }
    .divider-notes-inp { padding: 6px 8px; font-size: 13px; border-radius: 6px; border: 1.5px solid var(--border2); }
    .divider-add-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 10px; background: var(--off); border-radius: var(--radius-sm); border: 1px solid var(--border); }
    .drop-zone { min-height: 48px; padding: 8px; border-radius: var(--radius); border: 2px dashed #cbd5e1; background: var(--off); transition: all .15s; }
    .drop-zone.over { border-color: var(--sky2); background: #f0f9ff; }
    .race-item { border: 1.5px solid var(--border); background: #fff; border-radius: var(--radius-sm); padding: 11px 13px; margin: 6px 0; cursor: grab; transition: box-shadow .15s, transform .15s; }
    .race-item:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
    .race-item.open-item  { border-color: #fed7aa; background: #fffaf5; }
    .race-item.quad-item  { border-color: #d8b4fe; background: #faf5ff; }
    .race-item.active-now { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(249,115,22,.15); }
    .race-label { font-weight: 700; font-size: 14px; color: var(--navy); }
    .race-meta  { font-size: 12px; color: var(--muted); margin-top: 2px; }

    /* ── Results ──────────────────────────────────────────────────── */
    .podium-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
    @media(max-width:700px){.podium-grid{grid-template-columns:1fr;}}
    .podium-card { border: 1.5px solid var(--border); border-radius: var(--radius); padding: 16px; background: #fff; }
    .podium-place { font-family: 'Barlow Condensed',sans-serif; font-size: 40px; font-weight: 900; color: var(--orange); line-height: 1; }
    .podium-name  { font-weight: 700; font-size: 17px; margin-top: 4px; color: var(--navy); }
    .podium-team  { font-size: 13px; color: var(--muted); }
    .podium-pts   { font-family: 'Barlow Condensed',sans-serif; font-size: 22px; font-weight: 700; color: var(--green); margin-top: 6px; }

    /* ── Announcer ────────────────────────────────────────────────── */
    .announcer-box { background: var(--navy); color: #fff; border-radius: var(--radius-lg); padding: 24px; }
    .announcer-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: var(--orange); }
    .announcer-group { font-family: 'Barlow Condensed',sans-serif; font-size: 40px; font-weight: 900; line-height: 1.05; margin-top: 6px; }
    .announcer-meta  { font-size: 20px; opacity: .9; margin-top: 6px; }
    .announcer-start { font-size: 14px; opacity: .70; margin-top: 4px; }
    .announcer-divider { height: 1px; background: rgba(255,255,255,.15); margin: 16px 0; }
    .announcer-lanes-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--sky); margin-bottom: 8px; }
    .announcer-lane { padding: 10px 0; border-top: 1px solid rgba(255,255,255,.10); }
    .announcer-lane-name   { font-size: 20px; font-weight: 900; font-family: 'Barlow Condensed',sans-serif; }
    .announcer-lane-team   { font-size: 14px; opacity: .85; }
    .announcer-lane-sponsor{ font-size: 13px; color: var(--sky); }
    .announcer-empty { font-size: 15px; opacity: .6; padding-top: 10px; }

    /* ── Live board ───────────────────────────────────────────────── */
    .live-hero { background: var(--navy); border-radius: var(--radius-lg); padding: 28px; margin-bottom: 18px; color: #fff; }
    .live-meet-name { font-family: 'Barlow Condensed',sans-serif; font-size: 36px; font-weight: 900; }
    .live-race-label{ font-size: 13px; opacity: .7; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 4px; }
    .live-race-name { font-family: 'Barlow Condensed',sans-serif; font-size: 28px; font-weight: 700; }

    /* ── Homepage hero ────────────────────────────────────────────── */
    .hero {
      position: relative; border-radius: var(--radius-lg); overflow: hidden;
      min-height: 360px; display: flex; align-items: flex-end;
      background: var(--navy); margin-bottom: 28px; box-shadow: var(--shadow-lg);
    }
    .hero-centered { align-items: center; justify-content: center; min-height: 420px; }
    .hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .40; }
    .hero-gradient { position: absolute; inset: 0; background: linear-gradient(to top, rgba(15,31,61,.95) 40%, rgba(15,31,61,.20) 100%); }
    .hero-content { position: relative; z-index: 1; padding: 36px; }
    .hero-content-centered { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 36px; text-align: center; }
    .hero-logo { height: 160px; width: auto; max-width: 90%; display: block; filter: drop-shadow(0 4px 24px rgba(0,0,0,.5)); }
    .hero-eyebrow { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .15em; color: var(--orange); margin-bottom: 8px; }
    .hero-title { font-family: 'Barlow Condensed',sans-serif; font-size: 64px; font-weight: 900; line-height: .95; letter-spacing: -1px; color: #fff; }
    .hero-title span { color: var(--orange); }
    .hero-sub { font-size: 17px; color: rgba(255,255,255,.80); margin-top: 12px; max-width: 520px; }
    .hero-actions { display: flex; gap: 12px; margin-top: 22px; flex-wrap: wrap; }
    .hero-actions-centered { display: flex; gap: 12px; margin-top: 28px; flex-wrap: wrap; justify-content: center; }
    .btn-white { background: rgba(255,255,255,.15) !important; color: #fff !important; border-color: rgba(255,255,255,.35) !important; backdrop-filter: blur(4px); }
    .btn-white:hover { background: rgba(255,255,255,.25) !important; }

    /* ── Feature cards ────────────────────────────────────────────── */
    .feature-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 28px; }
    @media(max-width:900px){.feature-grid{grid-template-columns:1fr;}}
    .feature-card { border-radius: var(--radius-lg); overflow: hidden; position: relative; min-height: 240px; display: flex; align-items: flex-end; box-shadow: var(--shadow); }
    .feature-card-link { display: flex; text-decoration: none; cursor: pointer; transition: transform .2s, box-shadow .2s; }
    .feature-card-link:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
    .feature-card-link:hover .feature-card-overlay { background: linear-gradient(to top, rgba(15,31,61,.96) 50%, rgba(15,31,61,.30) 100%); }
    .feature-card-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .feature-card-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(15,31,61,.90) 50%, rgba(15,31,61,.15) 100%); transition: background .2s; }
    .feature-card-content { position: relative; z-index: 1; padding: 24px; color: #fff; width: 100%; }
    .feature-icon { width: 36px; height: 36px; margin-bottom: 8px; }
    .feature-icon-emoji { font-size: 32px; margin-bottom: 10px; line-height: 1; }
    .feature-title { font-family: 'Barlow Condensed',sans-serif; font-size: 24px; font-weight: 700; }
    .feature-desc  { font-size: 14px; opacity: .85; margin-top: 6px; line-height: 1.5; }
    .feature-cta   { font-size: 13px; font-weight: 700; color: var(--orange); margin-top: 12px; letter-spacing: .04em; }

    /* ── Misc helpers ─────────────────────────────────────────────── */
    .spacer    { height: 16px; }
    .spacer-sm { height: 8px; }
    .hr        { height: 1px; background: var(--border); margin: 16px 0; }
    .muted     { color: var(--muted); }
    .danger    { color: var(--red); font-weight: 700; }
    .good      { color: var(--green); font-weight: 700; }
    .note      { font-size: 12px; color: var(--muted); }
    .small     { font-size: 12px; }
    .sponsor-line { font-size: 12px; color: var(--sky2); margin-top: 2px; }
    .hidden    { display: none !important; }
    .text-orange { color: var(--orange); }
    .text-sky    { color: var(--sky2); }
    .text-navy   { color: var(--navy); }
    .bold { font-weight: 700; }
    .checkin-row {}
    .filters-row { display: grid; grid-template-columns: 1.2fr .8fr .8fr; gap: 10px; }
    @media(max-width:700px){.filters-row{grid-template-columns:1fr;}}
    .footer-note { font-size: 11px; color: var(--muted); margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--border); }
  </style>
</head>
<body>
  ${navHtml(user)}
  <div class="wrap">
    ${meetTabs(meet, activeTab)}
    ${bodyHtml}
    <div class="footer-note">SpeedSkateMeet v19 • Data: ${esc(DATA_FILE)}</div>
  </div>
</body>
</html>`;
}

// ── Shared render helpers ─────────────────────────────────────────────────────

function resultsSectionHtml(section) {
  const podium = section.standings.slice(0,3).map((row,i) => `
    <div class="podium-card">
      <div class="podium-place">${['🥇','🥈','🥉'][i]||row.overallPlace}</div>
      <div class="podium-name">${esc(row.skaterName||'Unknown')}</div>
      <div class="podium-team">${esc(row.team||'')}</div>
      ${sponsorLineHtml(row.sponsor)}
      <div class="podium-pts">${Number(row.totalPoints||0)} pts</div>
    </div>`).join('');
  const standingsRows = section.standings.map(row=>`
    <tr>
      <td><strong>${row.overallPlace}</strong></td>
      <td>${esc(row.skaterName||'')}${sponsorLineHtml(row.sponsor)}</td>
      <td>${esc(row.team||'')}</td>
      <td><strong>${Number(row.totalPoints||0)}</strong></td>
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
  res.send(pageShell({ title:'Home', user:data?.user||null, bodyHtml:`
    <div class="hero hero-centered">
      <img class="hero-img" src="/public/images/home/hero-banner.jpg" alt="" />
      <div class="hero-gradient"></div>
      <div class="hero-content-centered">
        <img src="/public/images/branding/ssm-logo.png" alt="SpeedSkateMeet.com" class="hero-logo" />
        <div class="hero-actions-centered">
          <a class="btn-orange" href="/meets">Find a Meet</a>
          <a class="btn2 btn-white" href="/live">Live Race Day</a>
          ${data ? '<a class="btn2 btn-white" href="/portal">Portal</a>' : '<a class="btn2 btn-white" href="/admin/login">Login</a>'}
        </div>
      </div>
    </div>
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
          <div class="feature-desc">Build your meet from scratch. Inline, Open, and Quad race builders with block scheduling, check-in, and automatic standings.</div>
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
    </div>` }));
});
app.get('/meets', (req, res) => {
  const db=loadDb(); const data=getSessionUser(req);
  const cards=(db.meets||[]).filter(m=>m.isPublic).map(m=>{
    const rink=db.rinks.find(r=>Number(r.id)===Number(m.rinkId));
    return `
      <div class="card" style="margin-bottom:14px">
        <div class="row between">
          <div>
            <h2 style="margin:0">${esc(m.meetName)}</h2>
            <div class="muted">${esc(m.date||'Date TBD')}${m.startTime?` • ${esc(m.startTime)}`:''}</div>
            ${rink?`<div class="note">${esc(rink.name)} • ${esc(rink.city)}, ${esc(rink.state)}</div>`:''}
          </div>
          <div class="row">
            <span class="chip">${(m.races||[]).length} Races</span>
            <span class="chip chip-green">${esc(m.status||'draft')}</span>
          </div>
        </div>
        <div class="hr"></div>
        <div class="action-row">
          <a class="btn-orange" href="/meet/${m.id}/register">Register</a>
          <a class="btn2" href="/meet/${m.id}/live">Live</a>
          <a class="btn2" href="/meet/${m.id}/results">Results</a>
        </div>
      </div>`;
  }).join('');
  res.send(pageShell({title:'Find a Meet',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Find a Meet</h1><div class="sub">Upcoming inline speed skating meets open for registration.</div></div>
    ${cards||`<div class="card"><div class="muted">No public meets yet.</div></div>`}`}));
});

app.get('/rinks', (req, res) => {
  const db=loadDb(); const data=getSessionUser(req);
  const cards=db.rinks.map(r=>`
    <div class="card" style="margin-bottom:14px">
      <div class="row between">
        <div>
          <h2 style="margin:0">📍 ${esc(r.name)}</h2>
          <div class="muted">${esc(r.address||'')} • ${esc(r.city||'')}, ${esc(r.state||'')}</div>
          <div class="note">${r.phone?esc(r.phone):''}${r.website?` • <a href="https://${esc(r.website)}" target="_blank" rel="noreferrer">${esc(r.website)}</a>`:''}</div>
        </div>
        ${data?.user&&(hasRole(data.user,'super_admin')||hasRole(data.user,'meet_director'))?`<a class="btn2 btn-sm" href="/portal/rinks">Edit</a>`:''}
      </div>
    </div>`).join('');
  res.send(pageShell({title:'Rinks',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Rinks</h1></div>${cards}`}));
});

app.get('/live', (req, res) => {
  const db=loadDb(); const data=getSessionUser(req);
  const cards=(db.meets||[]).filter(m=>m.isPublic).map(m=>{
    const rink=db.rinks.find(r=>Number(r.id)===Number(m.rinkId));
    return `
      <div class="card" style="margin-bottom:14px">
        <h2>${esc(m.meetName)}</h2>
        <div class="muted">${rink?`${esc(rink.city)}, ${esc(rink.state)}`:''}</div>
        <div class="hr"></div>
        <div class="action-row">
          <a class="btn-orange" href="/meet/${m.id}/live">Open Live Board</a>
          <a class="btn2" href="/meet/${m.id}/results">Results</a>
        </div>
      </div>`;
  }).join('');
  res.send(pageShell({title:'Live Race Day',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Live Race Day</h1><div class="sub">Follow along in real-time.</div></div>
    ${cards||`<div class="card"><div class="muted">No live meets right now.</div></div>`}`}));
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.get('/admin/login', (req, res) => {
  res.send(pageShell({title:'Login',user:null, bodyHtml:`
    <div style="max-width:400px;margin:40px auto">
      <div class="page-header"><h1>Login</h1></div>
      <div class="card">
        <form method="POST" action="/admin/login" class="stack">
          <div><label>Username</label><input name="username" autocomplete="username" required /></div>
          <div><label>Password</label><input name="password" type="password" autocomplete="current-password" required /></div>
          <button class="btn" type="submit" style="width:100%">Sign In</button>
        </form>
      </div>
    </div>`}));
});

app.post('/admin/login', (req, res) => {
  const db=loadDb();
  const username=String(req.body.username||'').trim();
  const password=String(req.body.password||'').trim();
  const user=db.users.find(u=>u.username===username&&u.password===password&&u.active!==false);
  if(!user) return res.send(pageShell({title:'Login',user:null, bodyHtml:`
    <div style="max-width:400px;margin:40px auto">
      <div class="page-header"><h1>Login</h1></div>
      <div class="card">
        <div class="danger" style="margin-bottom:14px">Invalid username or password.</div>
        <a class="btn2" href="/admin/login">Try again</a>
      </div>
    </div>`}));
  const token=crypto.randomBytes(24).toString('hex');
  db.sessions=db.sessions.filter(s=>s.userId!==user.id);
  db.sessions.push({token,userId:user.id,createdAt:nowIso(),expiresAt:new Date(Date.now()+SESSION_TTL_MS).toISOString()});
  saveDb(db); setCookie(res,SESSION_COOKIE,token,Math.floor(SESSION_TTL_MS/1000)); res.redirect('/portal');
});

app.get('/admin/logout', (req, res) => {
  const db=loadDb(); const token=parseCookies(req)[SESSION_COOKIE];
  db.sessions=db.sessions.filter(s=>s.token!==token);
  saveDb(db); clearCookie(res,SESSION_COOKIE); res.redirect('/');
});

// ── Portal Home ───────────────────────────────────────────────────────────────

app.get('/portal', requireRole('meet_director','judge','coach'), (req, res) => {
  const visibleMeets=coachVisibleMeets(req.db,req.user);
  const cards=visibleMeets.map(meet=>{
    const rink=req.db.rinks.find(r=>Number(r.id)===Number(meet.rinkId));
    const openCount=(meet.openGroups||[]).filter(g=>g.enabled).length;
    const quadCount=(meet.quadGroups||[]).filter(g=>g.enabled).length;
    const inlineCount=(meet.races||[]).filter(r=>!r.isOpenRace&&!r.isQuadRace).length;
    return `
      <div class="card" style="margin-bottom:14px">
        <div class="row between" style="margin-bottom:12px">
          <div>
            <h2 style="margin:0">${esc(meet.meetName)}</h2>
            <div class="muted" style="font-size:13px">${rink?`${esc(rink.city)}, ${esc(rink.state)} • `:``}${esc(meet.date||'Date TBD')} • <span class="chip chip-${meet.status==='live'?'green':meet.status==='complete'?'sky':'orange'}" style="font-size:11px">${esc(meet.status||'draft')}</span></div>
          </div>
          <div class="row">
            <span class="chip">Inline: ${inlineCount}</span>
            <span class="chip chip-orange">Open: ${openCount}</span>
            <span class="chip chip-purple">Quad: ${quadCount}</span>
            <span class="chip">Regs: ${(meet.registrations||[]).length}</span>
          </div>
        </div>
        <div class="action-row">
          ${canEditMeet(req.user,meet)?`
            <a class="btn" href="/portal/meet/${meet.id}/builder">Meet Builder</a>
            <a class="btn-orange" href="/portal/meet/${meet.id}/open-builder">🏁 Open</a>
            <a class="btn-purple" href="/portal/meet/${meet.id}/quad-builder">🛼 Quad</a>
            <a class="btn2" href="/portal/meet/${meet.id}/race-day/director">Race Day</a>
            <a class="btn2" href="/portal/meet/${meet.id}/results">Results</a>
            <a class="btn-danger btn-sm" href="/portal/meet/${meet.id}/delete-confirm">Delete</a>
          `:`<a class="btn2" href="/portal/meet/${meet.id}/coach">Coach Panel</a>
             <a class="btn2" href="/meet/${meet.id}/live">Live</a>`}
        </div>
      </div>`;
  }).join('');
  res.send(pageShell({title:'Portal',user:req.user, bodyHtml:`
    <div class="page-header">
      <h1>Director Portal</h1>
      <div class="sub">Welcome back, ${esc(req.user.displayName||req.user.username)}.</div>
    </div>
    <div class="action-row" style="margin-bottom:20px">
      ${hasRole(req.user,'super_admin')||hasRole(req.user,'meet_director')?`
        <form method="POST" action="/portal/create-meet"><button class="btn-orange" type="submit">+ New Meet</button></form>
        <a class="btn2" href="/portal/rinks">Manage Rinks</a>`:''}
      ${hasRole(req.user,'coach')||hasRole(req.user,'super_admin')||hasRole(req.user,'meet_director')?`<a class="btn2" href="/portal/coach">Coach Portal</a>`:''}
      ${hasRole(req.user,'super_admin')?`<a class="btn2" href="/portal/users">Users</a>`:''}
    </div>
    ${cards||`<div class="card"><div class="muted">No meets yet. Click "New Meet" to get started.</div></div>`}`}));
});

// ── Coach Portal ──────────────────────────────────────────────────────────────

app.get('/portal/coach', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const meets=coachVisibleMeets(req.db,req.user);
  const cards=meets.map(meet=>{
    const upcoming=coachUpcomingForMeet(meet,req.user.team);
    const regs=coachTeamRegistrations(meet,req.user.team);
    return `
      <div class="card" style="margin-bottom:14px">
        <div class="row between" style="margin-bottom:12px">
          <div>
            <h2 style="margin:0">${esc(meet.meetName)}</h2>
            <div class="muted">${esc(req.user.team||'')} • ${esc(meet.date||'')}</div>
          </div>
          <div class="row"><span class="chip">Skaters: ${regs.length}</span><span class="chip chip-orange">Racing Soon: ${upcoming.length}</span></div>
        </div>
        <div class="action-row" style="margin-bottom:${upcoming.length?'12px':'0'}">
          <a class="btn" href="/portal/meet/${meet.id}/coach">Coach Panel</a>
          <a class="btn2" href="/meet/${meet.id}/live">Live</a>
          <a class="btn2" href="/meet/${meet.id}/results">Results</a>
        </div>
        ${upcoming.length?`<div class="hr"></div><h3>Racing Soon</h3><div class="stack">${upcoming.slice(0,2).map(item=>`
          <div class="group-card">
            <div class="bold">${item.skaters.map(s=>esc(s.skaterName)).join(', ')}</div>
            <div class="muted">${esc(item.race.groupLabel)} • ${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)}</div>
            <div class="good">${esc(racingSoonLabel(item.delta))}</div>
          </div>`).join('')}</div>`:''}
      </div>`;
  }).join('');
  res.send(pageShell({title:'Coach Portal',user:req.user, bodyHtml:`
    <div class="page-header"><h1>Coach Portal</h1><div class="sub">${esc(req.user.team||'Your Team')}</div></div>
    ${cards||`<div class="card"><div class="muted">No meets found for ${esc(req.user.team||'your team')}.</div></div>`}`}));
});

app.get('/portal/meet/:meetId/coach', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const team=String(req.user.team||'').trim();
  const regs=coachTeamRegistrations(meet,team);
  const upcoming=coachUpcomingForMeet(meet,team);
  const recent=coachRecentResultsForMeet(meet,team);
  const standings=coachStandingsForMeet(meet,team);
  const info=currentRaceInfo(meet);
  const rosterRows=regs.map(reg=>{
    const assignedRaces=orderedRaces(meet).filter(r=>(r.laneEntries||[]).some(le=>Number(le.registrationId)===Number(reg.id)));
    return `<tr>
      <td>${esc(reg.name)}${sponsorLineHtml(reg.sponsor||'')}</td>
      <td>${esc(reg.divisionGroupLabel||'')}</td>
      <td>${['novice','elite','open'].filter(k=>reg.options?.[k]).map(cap).join(', ')||'—'}</td>
      <td>${reg.helmetNumber?'#'+esc(reg.helmetNumber):''}</td>
      <td>${reg.checkedIn?'<span class="good">✔</span>':'—'}</td>
      <td>${reg.paid?'<span class="good">✔</span>':'—'}</td>
      <td>${assignedRaces.slice(0,2).map(r=>`<div class="note">${esc(cap(r.division))} • ${esc(r.distanceLabel)}</div>`).join('')||`<span class="muted">None</span>`}</td>
    </tr>`;
  }).join('');
  res.send(pageShell({title:'Coach Panel',user:req.user,meet, bodyHtml:`
    <div class="page-header">
      <h1>Coach Panel</h1>
      <div class="sub">${esc(meet.meetName)} • ${esc(team)}</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between">
        <span class="chip">Current: ${info.current?esc(info.current.groupLabel)+' — '+esc(cap(info.current.division)):'—'}</span>
        <a class="btn2 btn-sm" href="/portal/coach">← Back to Coach Portal</a>
      </div>
    </div>
    <div class="card">
      <h2>Team Roster</h2>
      <table class="table">
        <thead><tr><th>Skater</th><th>Division</th><th>Classes</th><th>Helmet</th><th>In</th><th>Paid</th><th>Races</th></tr></thead>
        <tbody>${rosterRows||`<tr><td colspan="7" class="muted">No team skaters found.</td></tr>`}</tbody>
      </table>
    </div>
    ${standings.length?`<div class="spacer"></div><h2>Team Standings</h2>${standings.map(section=>resultsSectionHtml(section)).join('<div class="spacer"></div>')}`:''}`}));
});

// ── Meet CRUD ─────────────────────────────────────────────────────────────────

app.post('/portal/create-meet', requireRole('meet_director'), (req, res) => {
  const meet=defaultMeet(req.user.id); meet.id=nextId(req.db.meets);
  req.db.meets.push(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.get('/portal/meet/:meetId/delete-confirm', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  res.send(pageShell({title:'Delete Meet',user:req.user, bodyHtml:`
    <div style="max-width:500px;margin:40px auto">
      <div class="page-header"><h1>Delete Meet</h1></div>
      <div class="card">
        <div class="danger" style="margin-bottom:12px">This permanently deletes the meet, all races, blocks, and registrations.</div>
        <h2>${esc(meet.meetName)}</h2>
        <div class="hr"></div>
        <form method="POST" action="/portal/meet/${meet.id}/delete" class="action-row">
          <button class="btn-danger" type="submit">Yes, Delete Permanently</button>
          <a class="btn2" href="/portal">Cancel</a>
        </form>
      </div>
    </div>`}));
});

app.post('/portal/meet/:meetId/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  req.db.meets=req.db.meets.filter(m=>Number(m.id)!==Number(req.params.meetId));
  saveDb(req.db); res.redirect('/portal');
});

// ── Users ─────────────────────────────────────────────────────────────────────

app.get('/portal/users', requireRole('super_admin'), (req, res) => {
  const rows=req.db.users.map(u=>`
    <tr>
      <td>${esc(u.displayName||u.username)}</td><td>${esc(u.username)}</td>
      <td>${esc((u.roles||[]).join(', '))}</td><td>${esc(u.team||'')}</td>
      <td>${u.active===false?'Off':'On'}</td>
    </tr>`).join('');
  res.send(pageShell({title:'Users',user:req.user, bodyHtml:`
    <div class="page-header"><h1>Users</h1></div>
    <div class="card">
      <form method="POST" action="/portal/users/new" class="stack">
        <div class="form-grid cols-4">
          <div><label>Name</label><input name="displayName" required /></div>
          <div><label>Username</label><input name="username" required /></div>
          <div><label>Password / PIN</label><input name="password" required /></div>
          <div><label>Team</label><input name="team" list="teams-users" value="Midwest Racing" /></div>
        </div>
        <datalist id="teams-users">${TEAM_LIST.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>
        <div class="row">
          <label class="toggle-wrap"><input type="checkbox" name="roles" value="meet_director" class="toggle-input"><span class="toggle-track"><span class="toggle-thumb"></span></span><span class="toggle-label">Meet Director</span></label>
          <label class="toggle-wrap"><input type="checkbox" name="roles" value="judge" class="toggle-input"><span class="toggle-track"><span class="toggle-thumb"></span></span><span class="toggle-label">Judge</span></label>
          <label class="toggle-wrap"><input type="checkbox" name="roles" value="coach" class="toggle-input"><span class="toggle-track"><span class="toggle-thumb"></span></span><span class="toggle-label">Coach</span></label>
        </div>
        <div><button class="btn" type="submit">Add User</button></div>
      </form>
      <div class="hr"></div>
      <table class="table">
        <thead><tr><th>Name</th><th>Username</th><th>Roles</th><th>Team</th><th>Active</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`}));
});

app.post('/portal/users/new', requireRole('super_admin'), (req, res) => {
  const rolesRaw=req.body.roles; const roles=Array.isArray(rolesRaw)?rolesRaw:(rolesRaw?[rolesRaw]:[]);
  req.db.users.push({id:nextId(req.db.users),displayName:String(req.body.displayName||'').trim(),username:String(req.body.username||'').trim(),password:String(req.body.password||'').trim(),team:String(req.body.team||'Midwest Racing').trim(),roles,active:true,createdAt:nowIso()});
  saveDb(req.db); res.redirect('/portal/users');
});

// ── Rinks ─────────────────────────────────────────────────────────────────────

function rinkForm(rink,action,title) {
  return `
    <div style="max-width:700px">
      <div class="page-header"><h1>${esc(title)}</h1></div>
      <div class="card">
        <form method="POST" action="${action}" class="stack">
          <div class="form-grid cols-2">
            <div><label>Name</label><input name="name" value="${esc(rink.name||'')}" required /></div>
            <div><label>Phone</label><input name="phone" value="${esc(rink.phone||'')}" /></div>
            <div><label>Address</label><input name="address" value="${esc(rink.address||'')}" /></div>
            <div><label>Website</label><input name="website" value="${esc(rink.website||'')}" /></div>
            <div><label>City</label><input name="city" value="${esc(rink.city||'')}" /></div>
            <div><label>State</label><input name="state" value="${esc(rink.state||'')}" /></div>
            <div><label>Team</label><input name="team" value="${esc(rink.team||'')}" /></div>
          </div>
          <div><label>Notes</label><textarea name="notes">${esc(rink.notes||'')}</textarea></div>
          <div class="action-row">
            <button class="btn" type="submit">Save Rink</button>
            <a class="btn2" href="/portal/rinks">Back</a>
          </div>
        </form>
      </div>
    </div>`;
}

app.get('/portal/rinks', requireRole('meet_director'), (req, res) => {
  const rows=req.db.rinks.map(r=>`
    <tr><td>${esc(r.name)}</td><td>${esc(r.city||'')}, ${esc(r.state||'')}</td>
    <td>${esc(r.phone||'')}</td><td><a class="btn2 btn-sm" href="/portal/rinks/${r.id}/edit">Edit</a></td></tr>`).join('');
  res.send(pageShell({title:'Rink Admin',user:req.user, bodyHtml:`
    <div class="page-header"><h1>Rink Admin</h1></div>
    <div class="card">
      <div class="row between" style="margin-bottom:14px"><h2 style="margin:0">Rinks</h2><a class="btn-orange" href="/portal/rinks/new">+ Add Rink</a></div>
      <table class="table"><thead><tr><th>Name</th><th>City/State</th><th>Phone</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>`}));
});

app.get('/portal/rinks/new', requireRole('meet_director'), (req, res) => {
  res.send(pageShell({title:'Add Rink',user:req.user, bodyHtml:rinkForm({},'portal/rinks/new','Add Rink')}));
});
app.post('/portal/rinks/new', requireRole('meet_director'), (req, res) => {
  req.db.rinks.push({id:nextId(req.db.rinks),name:String(req.body.name||'').trim(),phone:String(req.body.phone||'').trim(),address:String(req.body.address||'').trim(),website:String(req.body.website||'').trim(),city:String(req.body.city||'').trim(),state:String(req.body.state||'').trim(),team:String(req.body.team||'').trim(),notes:String(req.body.notes||'').trim()});
  sanitizeRinks(req.db); saveDb(req.db); res.redirect('/portal/rinks');
});
app.get('/portal/rinks/:id/edit', requireRole('meet_director'), (req, res) => {
  const rink=req.db.rinks.find(r=>Number(r.id)===Number(req.params.id));
  if(!rink) return res.redirect('/portal/rinks');
  res.send(pageShell({title:'Edit Rink',user:req.user, bodyHtml:rinkForm(rink,`/portal/rinks/${rink.id}/edit`,'Edit Rink')}));
});
app.post('/portal/rinks/:id/edit', requireRole('meet_director'), (req, res) => {
  const rink=req.db.rinks.find(r=>Number(r.id)===Number(req.params.id));
  if(!rink) return res.redirect('/portal/rinks');
  Object.assign(rink,{name:String(req.body.name||'').trim(),phone:String(req.body.phone||'').trim(),address:String(req.body.address||'').trim(),website:String(req.body.website||'').trim(),city:String(req.body.city||'').trim(),state:String(req.body.state||'').trim(),team:String(req.body.team||'').trim(),notes:String(req.body.notes||'').trim()});
  sanitizeRinks(req.db); saveDb(req.db); res.redirect('/portal/rinks');
});

// ── Meet Builder ──────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send(pageShell({title:'Forbidden',user:req.user, bodyHtml:`<div class="page-header"><h1>Forbidden</h1></div><div class="card"><div class="danger">Only the meet owner can edit this meet.</div></div>`}));
  const rinkOptions=req.db.rinks.map(r=>`<option value="${r.id}" ${Number(meet.rinkId)===Number(r.id)?'selected':''}>${esc(r.name)} (${esc(r.city||'')}, ${esc(r.state||'')})</option>`).join('');
  const openEnabledCount=(meet.openGroups||[]).filter(g=>g.enabled).length;
  const quadEnabledCount=(meet.quadGroups||[]).filter(g=>g.enabled).length;

  const groupsHtml=meet.groups.map((group,gi)=>{
    const divCards=['novice','elite'].map(divKey=>{
      const div=group.divisions[divKey];
      const colors={novice:'var(--sky2)',elite:'var(--navy)',open:'var(--orange)'};
      return `
        <div class="group-card">
          <div class="row between center" style="margin-bottom:10px">
            <div style="font-weight:700;font-size:15px;color:${colors[divKey]}">${divKey.toUpperCase()}</div>
            ${toggleSwitch(`g_${gi}_${divKey}_enabled`, div.enabled)}
          </div>
          <div class="form-grid cols-2" style="margin-bottom:8px">
            <div><label>Cost</label><input name="g_${gi}_${divKey}_cost" value="${esc(div.cost)}" placeholder="0" /></div>
          </div>
          <div class="form-grid cols-4">
            <div><label>D1</label><input name="g_${gi}_${divKey}_d1" value="${esc(div.distances[0]||'')}" placeholder="200m" /></div>
            <div><label>D2</label><input name="g_${gi}_${divKey}_d2" value="${esc(div.distances[1]||'')}" placeholder="500m" /></div>
            <div><label>D3</label><input name="g_${gi}_${divKey}_d3" value="${esc(div.distances[2]||'')}" placeholder="1000m" /></div>
            <div><label>D4</label><input name="g_${gi}_${divKey}_d4" value="${esc(div.distances[3]||'')}" placeholder="1500m" /></div>
          </div>
        </div>`;
    }).join('<div class="spacer-sm"></div>');
    return `
      <div class="card">
        <div class="row between" style="margin-bottom:12px">
          <div><h3 style="margin:0">${esc(group.label)}</h3><div class="note">${esc(group.ages)}</div></div>
        </div>
        <div class="stack">${divCards}</div>
      </div>`;
  }).join('<div class="spacer-sm"></div>');

  res.send(pageShell({title:'Meet Builder',user:req.user,meet,activeTab:'builder', bodyHtml:`
    <div class="page-header"><h1>Meet Builder</h1><div class="sub">${esc(meet.meetName)}</div></div>
    <div class="grid-2" style="margin-bottom:16px">
      <div class="card card-accent" style="border-left-color:var(--orange)">
        <div class="row between center">
          <div>
            <div class="bold">🏁 Open Builder ${openEnabledCount>0?`<span class="chip chip-orange">${openEnabledCount} active</span>`:''}</div>
            <div class="note">Rolling-start Open races, separate results.</div>
          </div>
          <a class="btn-orange btn-sm" href="/portal/meet/${meet.id}/open-builder">Configure →</a>
        </div>
      </div>
      <div class="card card-accent" style="border-left-color:var(--purple)">
        <div class="row between center">
          <div>
            <div class="bold">🛼 Quad Builder ${quadEnabledCount>0?`<span class="chip chip-purple">${quadEnabledCount} active</span>`:''}</div>
            <div class="note">Quad divisions, own standings bucket.</div>
          </div>
          <a class="btn-purple btn-sm" href="/portal/meet/${meet.id}/quad-builder">Configure →</a>
        </div>
      </div>
    </div>
    <form method="POST" action="/portal/meet/${meet.id}/builder/save" class="stack">
      <div class="card">
        <div class="row between" style="margin-bottom:16px">
          <h2 style="margin:0">Meet Setup</h2>
          <button class="btn-orange" type="submit">Save & Generate Races</button>
        </div>
        <div class="form-grid cols-3" style="margin-bottom:14px">
          <div><label>Meet Name</label><input name="meetName" value="${esc(meet.meetName)}" required /></div>
          <div><label>Date</label><input type="date" name="date" value="${esc(meet.date)}" /></div>
          <div><label>Start Time</label><input type="time" name="startTime" value="${esc(meet.startTime)}" /></div>
          <div><label>Registration Close Date</label><input type="date" name="registrationCloseDate" value="${esc(meet.registrationCloseAt?meet.registrationCloseAt.slice(0,10):'')}" /></div>
          <div><label>Registration Close Time</label><input type="time" name="registrationCloseTime" value="${esc(meet.registrationCloseAt?meet.registrationCloseAt.slice(11,16):'')}" /></div>
          <div><label>Rink</label><select name="rinkId">${rinkOptions}</select></div>
          <div><label>Track Length (m)</label><input name="trackLength" value="${esc(meet.trackLength)}" /></div>
          <div><label>Lanes</label><input name="lanes" value="${esc(meet.lanes)}" /></div>
          <div><label>Status</label>
            <select name="status">
              <option value="draft"     ${meet.status==='draft'    ?'selected':''}>Draft</option>
              <option value="published" ${meet.status==='published'?'selected':''}>Published</option>
              <option value="live"      ${meet.status==='live'     ?'selected':''}>Live</option>
              <option value="complete"  ${meet.status==='complete' ?'selected':''}>Complete</option>
            </select>
          </div>
        </div>
        <div class="toggle-group">
          <div class="toggle-row">
            <div><div class="toggle-row-label">Time Trials</div><div class="toggle-row-desc">Enable time trial entries</div></div>
            ${toggleSwitch('timeTrialsEnabled', meet.timeTrialsEnabled)}
          </div>
          <div class="toggle-row">
            <div><div class="toggle-row-label">Relays</div><div class="toggle-row-desc">Enable relay entries</div></div>
            ${toggleSwitch('relayEnabled', meet.relayEnabled)}
          </div>
          <div class="toggle-row">
            <div><div class="toggle-row-label">Judges Panel Required</div><div class="toggle-row-desc">Require a judges panel for this meet</div></div>
            ${toggleSwitch('judgesPanelRequired', meet.judgesPanelRequired)}
          </div>
          <div class="toggle-row">
            <div><div class="toggle-row-label">Show on Find a Meet</div><div class="toggle-row-desc">Make this meet public and open for registration</div></div>
            ${toggleSwitch('isPublic', meet.isPublic)}
          </div>
        </div>
        <div class="spacer-sm"></div>
        <div class="form-grid cols-2">
          <div><label>Meet Notes</label><textarea name="notes">${esc(meet.notes||'')}</textarea></div>
          <div><label>Relay Notes</label><textarea name="relayNotes">${esc(meet.relayNotes||'')}</textarea></div>
        </div>
      </div>
      <div class="page-header"><h2>Division Groups</h2><div class="sub">Enable classes and set distances for each age group.</div></div>
      ${groupsHtml}
      <div class="card">
        <div class="row between center">
          <div class="muted">Saving regenerates the race list from your divisions.</div>
          <button class="btn-orange" type="submit">Save & Generate Races</button>
        </div>
      </div>
    </form>`}));
});

app.post('/portal/meet/:meetId/builder/save', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.meetName=String(req.body.meetName||'New Meet').trim();
  meet.date=String(req.body.date||'').trim();
  meet.startTime=String(req.body.startTime||'').trim();
  meet.registrationCloseAt=combineDateTime(req.body.registrationCloseDate,req.body.registrationCloseTime);
  meet.rinkId=Number(req.body.rinkId||1);
  meet.trackLength=Number(req.body.trackLength||100);
  meet.lanes=Number(req.body.lanes||4);
  meet.timeTrialsEnabled=!!req.body.timeTrialsEnabled;
  meet.relayEnabled=!!req.body.relayEnabled;
  meet.judgesPanelRequired=!!req.body.judgesPanelRequired;
  meet.isPublic=!!req.body.isPublic;
  meet.status=String(req.body.status||'draft');
  meet.notes=String(req.body.notes||'');
  meet.relayNotes=String(req.body.relayNotes||'');
  meet.groups.forEach((group,gi)=>{
    for(const divKey of ['novice','elite']) {
      group.divisions[divKey]={
        enabled:!!req.body[`g_${gi}_${divKey}_enabled`],
        cost:Number(String(req.body[`g_${gi}_${divKey}_cost`]||'0').trim()||0),
        distances:[String(req.body[`g_${gi}_${divKey}_d1`]||'').trim(),String(req.body[`g_${gi}_${divKey}_d2`]||'').trim(),String(req.body[`g_${gi}_${divKey}_d3`]||'').trim(),String(req.body[`g_${gi}_${divKey}_d4`]||'').trim()],
      };
    }
  });
  generateBaseRacesForMeet(meet); rebuildRaceAssignments(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/blocks`);
});

// ── Open Builder ──────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/open-builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.openGroups=normalizeOpenGroups(meet.openGroups);
  const enabledCount=meet.openGroups.filter(g=>g.enabled).length;
  const groupCards=meet.openGroups.map((og,i)=>{
    const def=OPEN_GROUP_DEFAULTS[i];
    const liveRace=(meet.races||[]).find(r=>r.isOpenRace&&r.groupId===og.id);
    return `
      <div class="open-group-card">
        <div class="row between center" style="margin-bottom:12px">
          <div>
            <div style="font-weight:700;font-size:16px;color:var(--navy)">${esc(og.label)}</div>
            <div class="note">${esc(og.ages)}</div>
          </div>
          ${toggleSwitch(`og_${i}_enabled`, og.enabled, 'Enable')}
        </div>
        <div class="form-grid cols-3">
          <div>
            <label>Distance</label>
            <input name="og_${i}_distance" value="${esc(og.distance)}" placeholder="${esc(def?.defaultDistance||'')}" />
            <div class="note">Default: ${esc(def?.defaultDistance||'')}</div>
          </div>
          <div>
            <label>Cost ($)</label>
            <input name="og_${i}_cost" value="${esc(og.cost)}" placeholder="0" />
          </div>
          <div style="display:flex;align-items:flex-end">
            ${liveRace?`<div><div class="chip chip-green">Entries: ${(liveRace.laneEntries||[]).length}</div><div class="note" style="margin-top:4px">Status: ${esc(liveRace.status)}</div></div>`:`<div class="note">Race generated on save.</div>`}
          </div>
        </div>
      </div>`;
  }).join('<div class="spacer-sm"></div>');
  const openRaces=(meet.races||[]).filter(r=>r.isOpenRace);
  res.send(pageShell({title:'Open Builder',user:req.user,meet,activeTab:'open-builder', bodyHtml:`
    <div class="builder-banner orange">
      <h2>🏁 Open Builder</h2>
      <div class="sub">Rolling-start pack finals • No lane limit • No points • Results separate from inline standings</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between center">
        <div><strong>${enabledCount} of ${meet.openGroups.length} groups enabled</strong></div>
        <div class="row"><span class="chip chip-orange">Rolling Start</span><span class="chip chip-orange">No Lane Cap</span><span class="chip chip-orange">No Points</span></div>
      </div>
    </div>
    <form method="POST" action="/portal/meet/${meet.id}/open-builder/save" class="stack">
      ${groupCards}
      <div class="card">
        <div class="row between center">
          <div class="muted">Saving generates or updates Open races. Existing entries are preserved.</div>
          <div class="action-row">
            <a class="btn2" href="/portal/meet/${meet.id}/builder">← Meet Builder</a>
            <button class="btn-orange" type="submit">Save Open Builder</button>
          </div>
        </div>
      </div>
    </form>
    ${openRaces.length?`
      <div class="spacer"></div>
      <div class="card">
        <h3>Generated Open Races</h3>
        <table class="table">
          <thead><tr><th>Group</th><th>Distance</th><th>Start</th><th>Entries</th><th>Status</th></tr></thead>
          <tbody>${openRaces.map(r=>`<tr><td>${esc(r.groupLabel)}</td><td>${esc(r.distanceLabel)}</td><td>${esc(cap(r.startType))}</td><td>${(r.laneEntries||[]).length}</td><td><span class="chip chip-${r.status==='closed'?'green':'sky'}">${esc(r.status)}</span></td></tr>`).join('')}</tbody>
        </table>
      </div>`:''}`}));
});

app.post('/portal/meet/:meetId/open-builder/save', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.openGroups=normalizeOpenGroups(meet.openGroups);
  meet.openGroups.forEach((og,i)=>{
    og.enabled=!!req.body[`og_${i}_enabled`];
    og.distance=String(req.body[`og_${i}_distance`]||'').trim()||og.distance;
    og.cost=Number(String(req.body[`og_${i}_cost`]||'0').trim()||0);
  });
  generateOpenRacesForMeet(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/open-builder`);
});

// ── Quad Builder ──────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/quad-builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.quadGroups=normalizeQuadGroups(meet.quadGroups);
  const enabledCount=meet.quadGroups.filter(g=>g.enabled).length;
  const groupCards=meet.quadGroups.map((qg,i)=>{
    const def=QUAD_GROUP_DEFAULTS[i];
    const liveRaces=(meet.races||[]).filter(r=>r.isQuadRace&&r.groupId===qg.id);
    return `
      <div class="quad-group-card">
        <div class="row between center" style="margin-bottom:12px">
          <div>
            <div style="font-weight:700;font-size:16px;color:var(--navy)">${esc(qg.label)}</div>
            <div class="note">${esc(qg.ages)}</div>
          </div>
          ${toggleSwitch(`qg_${i}_enabled`, qg.enabled, 'Enable')}
        </div>
        <div class="form-grid cols-3">
          <div>
            <label>Distance 1</label>
            <input name="qg_${i}_d1" value="${esc(qg.distances[0]||'')}" placeholder="${esc(def?.distances[0]||'')}" />
            <div class="note">Default: ${esc(def?.distances[0]||'')}</div>
          </div>
          <div>
            <label>Distance 2</label>
            <input name="qg_${i}_d2" value="${esc(qg.distances[1]||'')}" placeholder="${esc(def?.distances[1]||'')}" />
            <div class="note">Default: ${esc(def?.distances[1]||'')}</div>
          </div>
          <div>
            <label>Cost ($)</label>
            <input name="qg_${i}_cost" value="${esc(qg.cost)}" placeholder="0" />
            ${liveRaces.length?`<div class="note" style="margin-top:6px">${liveRaces.map(r=>`${esc(r.distanceLabel)}: ${(r.laneEntries||[]).length} entries`).join(' | ')}</div>`:''}
          </div>
        </div>
      </div>`;
  }).join('<div class="spacer-sm"></div>');
  const quadRaces=(meet.races||[]).filter(r=>r.isQuadRace);
  res.send(pageShell({title:'Quad Builder',user:req.user,meet,activeTab:'quad-builder', bodyHtml:`
    <div class="builder-banner purple">
      <h2>🛼 Quad Builder</h2>
      <div class="sub">30 / 20 / 10 / 5 points • Separate standings bucket • Heat splitting same as inline</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between center">
        <div><strong>${enabledCount} of ${meet.quadGroups.length} groups enabled</strong></div>
        <div class="row"><span class="chip chip-purple">30/20/10/5 Pts</span><span class="chip chip-purple">Standing Start</span><span class="chip chip-purple">Heat Splitting</span></div>
      </div>
    </div>
    <form method="POST" action="/portal/meet/${meet.id}/quad-builder/save" class="stack">
      ${groupCards}
      <div class="card">
        <div class="row between center">
          <div class="muted">Saving generates or updates Quad races. Existing entries are preserved.</div>
          <div class="action-row">
            <a class="btn2" href="/portal/meet/${meet.id}/builder">← Meet Builder</a>
            <button class="btn-purple" type="submit">Save Quad Builder</button>
          </div>
        </div>
      </div>
    </form>
    ${quadRaces.length?`
      <div class="spacer"></div>
      <div class="card">
        <h3>Generated Quad Races</h3>
        <table class="table">
          <thead><tr><th>Group</th><th>Distance</th><th>Stage</th><th>Entries</th><th>Status</th></tr></thead>
          <tbody>${quadRaces.map(r=>`<tr><td>${esc(r.groupLabel)}</td><td>${esc(r.distanceLabel)}</td><td>${esc(raceDisplayStage(r))}</td><td>${(r.laneEntries||[]).length}</td><td><span class="chip chip-${r.status==='closed'?'green':'sky'}">${esc(r.status)}</span></td></tr>`).join('')}</tbody>
        </table>
      </div>`:''}`}));
});

app.post('/portal/meet/:meetId/quad-builder/save', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.quadGroups=normalizeQuadGroups(meet.quadGroups);
  meet.quadGroups.forEach((qg,i)=>{
    qg.enabled=!!req.body[`qg_${i}_enabled`];
    qg.distances[0]=String(req.body[`qg_${i}_d1`]||'').trim()||qg.distances[0];
    qg.distances[1]=String(req.body[`qg_${i}_d2`]||'').trim()||qg.distances[1];
    qg.cost=Number(String(req.body[`qg_${i}_cost`]||'0').trim()||0);
  });
  generateQuadRacesForMeet(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/quad-builder`);
});
// ── Public Registration ───────────────────────────────────────────────────────

app.get('/meet/:meetId/register', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId); const data=getSessionUser(req);
  if(!meet||!meet.isPublic) return res.redirect('/meets');
  const closed=isRegistrationClosed(meet);
  res.send(pageShell({title:'Register',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Register</h1><div class="sub">${esc(meet.meetName)}${meet.date?` • ${esc(meet.date)}`:''}</div></div>
    <div class="card">
      ${closed?`<div class="danger" style="font-size:18px">Registration is closed.</div>`:`
        <form method="POST" action="/meet/${meet.id}/register" class="stack">
          <div class="form-grid cols-3">
            <div><label>Skater Name</label><input name="name" required /></div>
            <div><label>Age</label><input name="age" type="number" required /></div>
            <div>
              <label>Gender</label>
              <select name="gender">
                <option value="boys">Boy</option><option value="girls">Girl</option>
                <option value="men">Men</option><option value="women">Women</option>
              </select>
              <div class="note">Ages 16+ are Men/Women divisions.</div>
            </div>
            <div><label>Team</label><input name="team" list="teams-reg" value="Midwest Racing" /></div>
            <div><label>Sponsor (optional)</label><input name="sponsor" placeholder="Bones Bearings" /></div>
          </div>
          <datalist id="teams-reg">${TEAM_LIST.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>
          <div class="toggle-group">
            <div class="toggle-row"><div><div class="toggle-row-label">Challenge Up</div></div>${toggleSwitch('challengeUp',false)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Novice</div></div>${toggleSwitch('novice',false)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Elite</div></div>${toggleSwitch('elite',false)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Open</div></div>${toggleSwitch('open',false)}</div>
            ${meet.timeTrialsEnabled?`<div class="toggle-row"><div><div class="toggle-row-label">Time Trials</div></div>${toggleSwitch('timeTrials',false)}</div>`:''}
            ${meet.relayEnabled?`<div class="toggle-row"><div><div class="toggle-row-label">Relays</div></div>${toggleSwitch('relays',false)}</div>`:''}
          </div>
          <div><button class="btn-orange" type="submit">Register Skater</button></div>
        </form>`}
    </div>`}));
});

app.post('/meet/:meetId/register', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!meet||!meet.isPublic||isRegistrationClosed(meet)) return res.redirect(`/meet/${req.params.meetId}/register`);
  const gender=String(req.body.gender||'').trim()||'boys';
  const baseGroup=findAgeGroup(meet.groups,req.body.age,gender);
  const finalGroup=challengeAdjustedGroup(meet,baseGroup,!!req.body.challengeUp);
  const meetNumber=(meet.registrations||[]).reduce((max,r)=>Math.max(max,Number(r.meetNumber)||0),0)+1;
  meet.registrations.push({
    id:nextId(meet.registrations),createdAt:nowIso(),
    name:String(req.body.name||'').trim(),age:Number(req.body.age||0),gender,
    team:String(req.body.team||'Midwest Racing').trim()||'Midwest Racing',
    sponsor:String(req.body.sponsor||'').trim(),
    divisionGroupId:finalGroup?.id||'',divisionGroupLabel:finalGroup?.label||'Unassigned',
    originalDivisionGroupId:baseGroup?.id||'',originalDivisionGroupLabel:baseGroup?.label||'',
    meetNumber,helmetNumber:nextHelmetNumber(meet),
    paid:false,checkedIn:false,totalCost:0,
    options:{challengeUp:!!req.body.challengeUp,novice:!!req.body.novice,elite:!!req.body.elite,open:!!req.body.open,timeTrials:!!req.body.timeTrials,relays:!!req.body.relays},
  });
  rebuildRaceAssignments(meet); ensureCurrentRace(meet); saveDb(db);
  res.redirect(`/meet/${meet.id}/register?ok=1`);
});

function registrationForm(meet,reg,action,title) {
  const gender=reg.gender||'boys';
  return `
    <div style="max-width:700px">
      <div class="page-header"><h1>${esc(title)}</h1></div>
      <div class="card">
        <form method="POST" action="${action}" class="stack">
          <div class="form-grid cols-3">
            <div><label>Skater Name</label><input name="name" value="${esc(reg.name||'')}" required /></div>
            <div><label>Age</label><input name="age" value="${esc(reg.age||'')}" required /></div>
            <div><label>Gender</label>
              <select name="gender">
                <option value="boys"  ${gender==='boys' ?'selected':''}>Boy</option>
                <option value="girls" ${gender==='girls'?'selected':''}>Girl</option>
                <option value="men"   ${gender==='men'  ?'selected':''}>Men</option>
                <option value="women" ${gender==='women'?'selected':''}>Women</option>
              </select>
            </div>
            <div><label>Team</label><input name="team" list="teams-edit" value="${esc(reg.team||'Midwest Racing')}" /></div>
            <div><label>Sponsor (optional)</label><input name="sponsor" value="${esc(reg.sponsor||'')}" /></div>
          </div>
          <datalist id="teams-edit">${TEAM_LIST.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>
          <div class="toggle-group">
            <div class="toggle-row"><div><div class="toggle-row-label">Challenge Up</div></div>${toggleSwitch('challengeUp',!!reg.options?.challengeUp)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Novice</div></div>${toggleSwitch('novice',!!reg.options?.novice)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Elite</div></div>${toggleSwitch('elite',!!reg.options?.elite)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Open</div></div>${toggleSwitch('open',!!reg.options?.open)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Time Trials</div></div>${toggleSwitch('timeTrials',!!reg.options?.timeTrials)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Relays</div></div>${toggleSwitch('relays',!!reg.options?.relays)}</div>
          </div>
          <div class="action-row">
            <button class="btn" type="submit">Save Racer</button>
            <a class="btn2" href="/portal/meet/${meet.id}/registered">Back</a>
          </div>
        </form>
      </div>
    </div>`;
}

// ── Registered ────────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/registered', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  ensureRegistrationTotalsAndNumbers(meet); saveDb(req.db);
  const rows=(meet.registrations||[]).map(r=>`
    <tr>
      <td>${esc(r.meetNumber)}</td><td>${esc(r.helmetNumber)}</td>
      <td><strong>${esc(r.name)}</strong>${sponsorLineHtml(r.sponsor||'')}</td>
      <td>${esc(r.age)}</td><td>${esc(r.team)}</td>
      <td>${esc(r.divisionGroupLabel||'')}${r.options?.challengeUp?`<div class="note">↑ from ${esc(r.originalDivisionGroupLabel||'')}</div>`:''}</td>
      <td>${['challengeUp','novice','elite','open','timeTrials','relays'].filter(k=>r.options?.[k]).map(k=>k==='challengeUp'?'CU':cap(k)).join(', ')||'—'}</td>
      <td>$${esc(r.totalCost)}</td>
      <td>${r.paid?`<span class="good">✔</span>`:'—'}</td>
      <td>${r.checkedIn?`<span class="good">✔</span>`:'—'}</td>
      <td>
        <div class="action-row">
          <a class="btn2 btn-sm" href="/portal/meet/${meet.id}/registered/${r.id}/edit">Edit</a>
          <a class="btn-danger btn-sm" href="/portal/meet/${meet.id}/registered/${r.id}/delete">Del</a>
        </div>
      </td>
    </tr>`).join('');
  res.send(pageShell({title:'Registered',user:req.user,meet,activeTab:'registered', bodyHtml:`
    <div class="page-header"><h1>Registered</h1><div class="sub">${esc(meet.meetName)} • ${(meet.registrations||[]).length} skaters</div></div>
    <div class="card">
      <div class="row between" style="margin-bottom:14px">
        <div class="note">Registration close: ${meet.registrationCloseAt?esc(meet.registrationCloseAt.replace('T',' ')):'Not set'}</div>
        <div class="action-row">
          <form method="POST" action="/portal/meet/${meet.id}/assign-races"><button class="btn2" type="submit">Rebuild Assignments</button></form>
          <a class="btn-orange" href="/meet/${meet.id}/register" target="_blank">Public Registration</a>
          <a class="btn2" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>#</th><th>Helmet</th><th>Name</th><th>Age</th><th>Team</th><th>Division</th><th>Entries</th><th>Total</th><th>Paid</th><th>In</th><th></th></tr></thead>
          <tbody>${rows||`<tr><td colspan="11" class="muted">No registrations yet.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`}));
});

app.get('/portal/meet/:meetId/registered/:regId/edit', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);
  res.send(pageShell({title:'Edit Racer',user:req.user,meet,activeTab:'registered', bodyHtml:registrationForm(meet,reg,`/portal/meet/${meet.id}/registered/${reg.id}/edit`,'Edit Racer')}));
});

app.post('/portal/meet/:meetId/registered/:regId/edit', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);
  const gender=String(req.body.gender||'').trim()||'boys';
  const baseGroup=findAgeGroup(meet.groups,req.body.age,gender);
  const finalGroup=challengeAdjustedGroup(meet,baseGroup,!!req.body.challengeUp);
  Object.assign(reg,{name:String(req.body.name||'').trim(),age:Number(req.body.age||0),gender,team:String(req.body.team||'Midwest Racing').trim()||'Midwest Racing',sponsor:String(req.body.sponsor||'').trim(),originalDivisionGroupId:baseGroup?.id||'',originalDivisionGroupLabel:baseGroup?.label||'',divisionGroupId:finalGroup?.id||'',divisionGroupLabel:finalGroup?.label||'Unassigned',options:{challengeUp:!!req.body.challengeUp,novice:!!req.body.novice,elite:!!req.body.elite,open:!!req.body.open,timeTrials:!!req.body.timeTrials,relays:!!req.body.relays}});
  rebuildRaceAssignments(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.get('/portal/meet/:meetId/registered/:regId/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);
  res.send(pageShell({title:'Delete Racer',user:req.user,meet,activeTab:'registered', bodyHtml:`
    <div style="max-width:500px;margin:40px auto">
      <div class="page-header"><h1>Delete Racer</h1></div>
      <div class="card">
        <div class="danger" style="margin-bottom:12px">Remove ${esc(reg.name)} from all race assignments?</div>
        <form method="POST" action="/portal/meet/${meet.id}/registered/${reg.id}/delete" class="action-row">
          <button class="btn-danger" type="submit">Delete Racer</button>
          <a class="btn2" href="/portal/meet/${meet.id}/registered">Cancel</a>
        </form>
      </div>
    </div>`}));
});

app.post('/portal/meet/:meetId/registered/:regId/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  meet.registrations=(meet.registrations||[]).filter(r=>Number(r.id)!==Number(req.params.regId));
  rebuildRaceAssignments(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.post('/portal/meet/:meetId/assign-races', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  rebuildRaceAssignments(meet); ensureCurrentRace(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/registered`);
});

// ── Check-In ──────────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/checkin', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  ensureRegistrationTotalsAndNumbers(meet); saveDb(req.db);
  const totalOwed=(meet.registrations||[]).reduce((s,r)=>s+Number(r.totalCost||0),0);
  const totalPaid=(meet.registrations||[]).filter(r=>r.paid).reduce((s,r)=>s+Number(r.totalCost||0),0);
  const rows=(meet.registrations||[]).map(r=>`
    <tr class="checkin-row" data-name="${esc(String(r.name||'').toLowerCase())}" data-team="${esc(String(r.team||'').toLowerCase())}">
      <td>${esc(r.meetNumber)}</td>
      <td><strong>${esc(r.name)}</strong>${sponsorLineHtml(r.sponsor||'')}</td>
      <td>${esc(r.team)}</td>
      <td>${esc(r.divisionGroupLabel)}</td>
      <td>
        <form method="POST" action="/portal/meet/${meet.id}/checkin/helmet/${r.id}" class="checkin-form row center" style="gap:6px">
          <input style="max-width:80px" name="helmetNumber" value="${esc(r.helmetNumber)}" />
          <button class="btn2 btn-sm" type="submit">✓</button>
        </form>
      </td>
      <td><strong>$${esc(r.totalCost)}</strong></td>
      <td>
        <form method="POST" action="/portal/meet/${meet.id}/checkin/toggle-paid/${r.id}" class="checkin-form">
          <button class="${r.paid?'btn-good':'btn2'} btn-sm" type="submit">${r.paid?'✔ Paid':'Mark Paid'}</button>
        </form>
      </td>
      <td>
        <form method="POST" action="/portal/meet/${meet.id}/checkin/toggle-checkin/${r.id}" class="checkin-form">
          <button class="${r.checkedIn?'btn-good':'btn2'} btn-sm" type="submit">${r.checkedIn?'✔ In':'Check In'}</button>
        </form>
      </td>
    </tr>`).join('');
  res.send(pageShell({title:'Check-In',user:req.user,meet,activeTab:'checkin', bodyHtml:`
    <div class="page-header"><h1>Check-In</h1><div class="sub">${esc(meet.meetName)}</div></div>
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card navy"><div class="stat-label">Total Skaters</div><div class="stat-value">${(meet.registrations||[]).length}</div></div>
      <div class="stat-card orange"><div class="stat-label">Checked In</div><div class="stat-value">${(meet.registrations||[]).filter(r=>r.checkedIn).length}</div></div>
      <div class="stat-card green"><div class="stat-label">Revenue</div><div class="stat-value">$${totalPaid} <span style="font-size:16px;opacity:.7">/ $${totalOwed}</span></div></div>
    </div>
    <div class="card">
      <div class="row between" style="margin-bottom:14px">
        <form method="POST" action="/portal/meet/${meet.id}/checkin/reassign-helmets">
          <button class="btn2" type="submit">Reassign Helmet Numbers</button>
        </form>
      </div>
      <div class="filters-row" style="margin-bottom:14px">
        <div><label>Search Name</label><input id="ciSearch" placeholder="skater name..." oninput="applyCI()" /></div>
        <div><label>Team</label><input id="ciTeam" placeholder="team..." oninput="applyCI()" /></div>
        <div><label>Filter</label>
          <select id="ciStatus" onchange="applyCI()">
            <option value="all">All</option>
            <option value="not_paid">Not Paid</option>
            <option value="not_in">Not Checked In</option>
            <option value="in">Checked In</option>
          </select>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>#</th><th>Name</th><th>Team</th><th>Division</th><th>Helmet</th><th>Total</th><th>Paid</th><th>Check In</th></tr></thead>
          <tbody id="ciBody">${rows||`<tr><td colspan="8" class="muted">No registrations yet.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <script>
      const savedY=sessionStorage.getItem('ciY');
      if(savedY) { window.scrollTo(0,parseInt(savedY,10)); sessionStorage.removeItem('ciY'); }
      document.querySelectorAll('.checkin-form').forEach(f=>f.addEventListener('submit',()=>sessionStorage.setItem('ciY',String(window.scrollY))));
      function applyCI() {
        const q=(document.getElementById('ciSearch').value||'').toLowerCase().trim();
        const t=(document.getElementById('ciTeam').value||'').toLowerCase().trim();
        const s=document.getElementById('ciStatus').value;
        document.querySelectorAll('.checkin-row').forEach(row=>{
          const nm=row.getAttribute('data-name')||'';
          const tm=row.getAttribute('data-team')||'';
          const paidText=row.children[6]?.innerText||'';
          const inText=row.children[7]?.innerText||'';
          const mN=!q||nm.includes(q), mT=!t||tm.includes(t);
          let mS=true;
          if(s==='not_paid') mS=!/paid/i.test(paidText);
          if(s==='not_in')   mS=!/✔ in/i.test(inText);
          if(s==='in')       mS=/✔ in/i.test(inText);
          row.classList.toggle('hidden',!(mN&&mT&&mS));
        });
      }
    </script>`}));
});

app.post('/portal/meet/:meetId/checkin/toggle-paid/:regId', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(reg) reg.paid=!reg.paid; saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/checkin`);
});

app.post('/portal/meet/:meetId/checkin/toggle-checkin/:regId', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(reg) reg.checkedIn=!reg.checkedIn; saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/checkin`);
});

app.post('/portal/meet/:meetId/checkin/helmet/:regId', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(reg) reg.helmetNumber=Number(req.body.helmetNumber||'')||'';
  rebuildRaceAssignments(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/checkin`);
});

app.post('/portal/meet/:meetId/checkin/reassign-helmets', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  let n=1; for(const reg of meet.registrations||[]) reg.helmetNumber=n++;
  rebuildRaceAssignments(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/checkin`);
});

// ── Block Builder ─────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/blocks', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send(pageShell({title:'Forbidden',user:req.user,bodyHtml:`<div class="page-header"><h1>Forbidden</h1></div><div class="card"><div class="danger">Only the meet owner can edit this meet.</div></div>`}));
  ensureAtLeastOneBlock(meet); ensureCurrentRace(meet); saveDb(req.db);
  const raceById=new Map((meet.races||[]).map(r=>[r.id,r]));
  const assigned=new Set(); for(const block of meet.blocks||[]) for(const rid of block.raceIds||[]) assigned.add(rid);
  const unassigned=(meet.races||[]).filter(r=>!assigned.has(r.id));
  const breakTypes=['break','lunch','awards','practice'];
  const breakIcons={break:'☕',lunch:'🍽️',awards:'🏆',practice:'⛸️'};

  function raceItemHtml(race,isCurrent,draggable=true) {
    const tag=race.isOpenRace?'🏁 ':race.isQuadRace?'🛼 ':'';
    const cls=race.isOpenRace?'open-item':race.isQuadRace?'quad-item':'';
    return `
      <div class="race-item ${isCurrent?'active-now':''} ${cls}" draggable="${draggable}"
        data-race-id="${esc(race.id)}"
        data-group-label="${esc(String(race.groupLabel||'').toLowerCase())}"
        data-division="${esc(race.division)}"
        data-day-index="${esc(race.dayIndex)}">
        <div class="race-label">${tag}${esc(race.groupLabel)} <span style="opacity:.6">•</span> ${esc(cap(race.division))}</div>
        <div class="race-meta">${esc(race.distanceLabel)} • D${esc(race.dayIndex)} • ${esc(raceDisplayStage(race))} • ${esc(cap(race.startType))}</div>
      </div>`;
  }

  let raceBlockNum = 0;
  const blocksHtml=(meet.blocks||[]).map(block=>{
    const isBreak=breakTypes.includes(block.type||'');
    if(isBreak) {
      const icon=breakIcons[block.type]||'📌';
      return `
        <div class="divider-card">
          <div class="divider-card-inner">
            <div class="divider-icon">${icon}</div>
            <div class="divider-info">
              <div class="divider-name">${esc(block.name)}</div>
              <div class="note">${esc(block.day||'Day 1')}${block.notes?' • '+esc(block.notes):''}</div>
            </div>
            <div class="action-row">
              <select class="divider-day-sel" onchange="setBlockDay('${esc(block.id)}',this.value)">
                ${['Day 1','Day 2','Day 3'].map(d=>`<option value="${d}" ${block.day===d?'selected':''}>${d}</option>`).join('')}
              </select>
              <input class="divider-notes-inp" value="${esc(block.notes||'')}" placeholder="notes..." onblur="setBlockNotes('${esc(block.id)}',this.value)" style="max-width:140px" />
              <button class="btn2 btn-sm" onclick="renameBlock('${esc(block.id)}')">Rename</button>
              <button class="btn-danger btn-sm" onclick="deleteBlock('${esc(block.id)}')">Remove</button>
            </div>
          </div>
        </div>`;
    }
    raceBlockNum++;
    return `
      <div class="block-card">
        <div class="block-head" style="margin-bottom:12px">
          <div>
            <div style="font-weight:700;font-size:17px;color:var(--navy)">${esc(block.name)}</div>
            <div class="note">${esc(block.day||'Day 1')} • Race Block ${raceBlockNum}</div>
          </div>
          <div class="action-row">
            <button class="btn2 btn-sm" onclick="renameBlock('${esc(block.id)}')">Rename</button>
            <button class="btn-danger btn-sm" onclick="deleteBlock('${esc(block.id)}')">Delete</button>
          </div>
        </div>
        <div class="form-grid cols-2" style="margin-bottom:12px">
          <div><label>Day</label>
            <select onchange="setBlockDay('${esc(block.id)}',this.value)">
              ${['Day 1','Day 2','Day 3'].map(d=>`<option value="${d}" ${block.day===d?'selected':''}>${d}</option>`).join('')}
            </select>
          </div>
          <div><label>Notes</label><input value="${esc(block.notes||'')}" onblur="setBlockNotes('${esc(block.id)}',this.value)" placeholder="notes..." /></div>
        </div>
        <div class="drop-zone" data-drop-block="${esc(block.id)}">
          ${(block.raceIds||[]).map(rid=>{const race=raceById.get(rid);if(!race) return '';return raceItemHtml(race,meet.currentRaceId===race.id,true);}).join('')||`<div class="note" style="padding:8px">Drop races here…</div>`}
        </div>
      </div>`;
  }).join('');

  res.send(pageShell({title:'Block Builder',user:req.user,meet,activeTab:'blocks', bodyHtml:`
    <div class="page-header"><h1>Block Builder</h1><div class="sub">${esc(meet.meetName)} • Drag races into blocks</div></div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between">
        <div class="action-row">
          <span class="chip">Inline: ${(meet.races||[]).filter(r=>!r.isOpenRace&&!r.isQuadRace).length}</span>
          <span class="chip chip-orange">🏁 Open: ${(meet.races||[]).filter(r=>r.isOpenRace).length}</span>
          <span class="chip chip-purple">🛼 Quad: ${(meet.races||[]).filter(r=>r.isQuadRace).length}</span>
          <span class="chip" id="unassignedChip">Unassigned: ${unassigned.length}</span>
        </div>
        <div class="action-row">
          <button class="btn2" onclick="addBlock()">+ Add Race Block</button>
          <div class="divider-add-group">
            <span class="note" style="white-space:nowrap">+ Add:</span>
            <button class="btn2 btn-sm" onclick="addDivider('break','☕ Break')">☕ Break</button>
            <button class="btn2 btn-sm" onclick="addDivider('lunch','🍽️ Lunch')">🍽️ Lunch</button>
            <button class="btn2 btn-sm" onclick="addDivider('awards','🏆 Awards')">🏆 Awards</button>
            <button class="btn2 btn-sm" onclick="addDivider('practice','⛸️ Practice')">⛸️ Practice</button>
          </div>
          <form method="POST" action="/portal/meet/${meet.id}/assign-races"><button class="btn2" type="submit">Rebuild</button></form>
          <a class="btn-orange" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>
    </div>
    <div class="bb-grid">
      <div>${blocksHtml}</div>
      <div class="bb-sticky">
        <div class="card">
          <h2 style="margin-bottom:12px">Unassigned Races</h2>
          <div class="filters-row" style="margin-bottom:10px">
            <div><label>Search</label><input id="raceSearch" placeholder="division..." oninput="applyFilters()" /></div>
            <div><label>Class</label>
              <select id="classFilter" onchange="applyFilters()">
                <option value="all">All</option><option value="novice">Novice</option>
                <option value="elite">Elite</option><option value="open">Open</option><option value="quad">Quad</option>
              </select>
            </div>
            <div><label>Distance</label>
              <select id="distFilter" onchange="applyFilters()">
                <option value="all">All</option><option value="1">D1</option><option value="2">D2</option>
                <option value="3">D3</option><option value="4">D4</option>
              </select>
            </div>
          </div>
          <div class="drop-zone" data-drop-block="__unassigned__" id="unassignedZone">
            ${unassigned.map(race=>raceItemHtml(race,meet.currentRaceId===race.id)).join('')||`<div class="note" style="padding:8px">All races assigned.</div>`}
          </div>
        </div>
      </div>
    </div>
    <script>
      let dragRaceId=null; const meetId=${JSON.stringify(meet.id)};
      function saveFilters(){localStorage.setItem('ssm_s',document.getElementById('raceSearch').value||'');localStorage.setItem('ssm_c',document.getElementById('classFilter').value||'all');localStorage.setItem('ssm_d',document.getElementById('distFilter').value||'all');}
      function restoreFilters(){document.getElementById('raceSearch').value=localStorage.getItem('ssm_s')||'';document.getElementById('classFilter').value=localStorage.getItem('ssm_c')||'all';document.getElementById('distFilter').value=localStorage.getItem('ssm_d')||'all';}
      function attachDnD(){
        document.querySelectorAll('.race-item').forEach(el=>{
          if(el.getAttribute('draggable')!=='true') return;
          el.addEventListener('dragstart',e=>{dragRaceId=el.getAttribute('data-race-id');e.dataTransfer.setData('text/plain',dragRaceId);saveFilters();});
        });
        document.querySelectorAll('.drop-zone').forEach(zone=>{
          zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('over');});
          zone.addEventListener('dragleave',()=>zone.classList.remove('over'));
          zone.addEventListener('drop',async e=>{
            e.preventDefault();zone.classList.remove('over');
            const raceId=e.dataTransfer.getData('text/plain')||dragRaceId;
            const destBlockId=zone.getAttribute('data-drop-block');
            saveFilters();
            const res=await fetch('/api/meet/'+meetId+'/blocks/move-race',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId,destBlockId})});
            if(res.ok) location.reload(); else alert('Move failed');
          });
        });
      }
      async function addBlock(){saveFilters();const r=await fetch('/api/meet/'+meetId+'/blocks/add',{method:'POST'});if(r.ok) location.reload();}
      async function addDivider(type,name){saveFilters();const r=await fetch('/api/meet/'+meetId+'/blocks/add-divider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,name})});if(r.ok) location.reload();}
      async function renameBlock(id){const name=prompt('Name:');if(!name) return;saveFilters();const r=await fetch('/api/meet/'+meetId+'/blocks/update-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,name})});if(r.ok) location.reload();}
      async function deleteBlock(id){if(!confirm('Remove this?')) return;saveFilters();const r=await fetch('/api/meet/'+meetId+'/blocks/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id})});if(r.ok) location.reload();}
      async function setBlockDay(id,day){saveFilters();await fetch('/api/meet/'+meetId+'/blocks/update-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,day})});}
      async function setBlockNotes(id,notes){saveFilters();await fetch('/api/meet/'+meetId+'/blocks/update-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,notes})});}
      function applyFilters(){
        saveFilters();
        const q=(document.getElementById('raceSearch').value||'').toLowerCase().trim();
        const klass=document.getElementById('classFilter').value;
        const dist=document.getElementById('distFilter').value;
        const items=Array.from(document.querySelectorAll('#unassignedZone .race-item'));
        let v=0;
        for(const item of items){
          const mS=!q||(item.getAttribute('data-group-label')||'').includes(q);
          const mC=klass==='all'||item.getAttribute('data-division')===klass;
          const mD=dist==='all'||item.getAttribute('data-day-index')===dist;
          const show=mS&&mC&&mD; item.classList.toggle('hidden',!show); if(show) v++;
        }
        document.getElementById('unassignedChip').textContent='Unassigned: '+v;
      }
      restoreFilters(); attachDnD(); applyFilters();
    </script>`}));
});
app.post('/api/meet/:meetId/blocks/add', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const n=(meet.blocks||[]).length+1;
  meet.blocks.push({id:'b'+crypto.randomBytes(4).toString('hex'),name:'Block '+n,day:'Day 1',type:'race',notes:'',raceIds:[]});
  meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

app.post('/api/meet/:meetId/blocks/add-divider', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const type=String(req.body.type||'break');
  const name=String(req.body.name||'Break').trim();
  meet.blocks.push({id:'b'+crypto.randomBytes(4).toString('hex'),name,day:'Day 1',type,notes:'',raceIds:[]});
  meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

app.post('/api/meet/:meetId/blocks/update-meta', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const block=(meet.blocks||[]).find(b=>b.id===String(req.body.blockId||''));
  if(!block) return res.status(404).send('Not found');
  if(typeof req.body.name==='string'&&req.body.name.trim()) block.name=String(req.body.name).trim();
  if(typeof req.body.day==='string'&&req.body.day.trim()) block.day=String(req.body.day).trim();
  if(typeof req.body.type==='string'&&req.body.type.trim()) block.type=String(req.body.type).trim();
  if(typeof req.body.notes==='string') block.notes=String(req.body.notes);
  meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

app.post('/api/meet/:meetId/blocks/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const blockId=String(req.body.blockId||'');
  if(!(meet.blocks||[]).find(b=>b.id===blockId)) return res.status(404).send('Block not found');
  meet.blocks=(meet.blocks||[]).filter(b=>b.id!==blockId);
  ensureAtLeastOneBlock(meet); ensureCurrentRace(meet); meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

app.post('/api/meet/:meetId/blocks/move-race', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const raceId=String(req.body.raceId||''); const destBlockId=String(req.body.destBlockId||'');
  for(const block of meet.blocks||[]) block.raceIds=(block.raceIds||[]).filter(id=>id!==raceId);
  if(destBlockId!=='__unassigned__') {
    const block=(meet.blocks||[]).find(b=>b.id===destBlockId);
    if(!block) return res.status(404).send('Block not found');
    if((block.type||'race')!=='race') return res.status(400).send('Cannot drop races into non-race blocks');
    block.raceIds.push(raceId);
  }
  ensureCurrentRace(meet); meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

// ── Race Day ──────────────────────────────────────────────────────────────────

function raceDaySubTabs(meet,active) {
  return `<div class="sub-tabs">${[['director','Director',`/portal/meet/${meet.id}/race-day/director`],['judges','Judges',`/portal/meet/${meet.id}/race-day/judges`],['announcer','Announcer',`/portal/meet/${meet.id}/race-day/announcer`],['live','Live View',`/portal/meet/${meet.id}/race-day/live`]].map(([k,label,href])=>`<a class="sub-tab ${active===k?'active':''}" href="${href}">${label}</a>`).join('')}</div>`;
}

app.get('/portal/meet/:meetId/race-day/:mode', requireRole('meet_director','judge','coach'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const mode=String(req.params.mode||'director');
  const info=currentRaceInfo(meet); const current=info.current;
  const currentLanes=current?laneRowsForRace(current,meet):[];
  const recent=recentClosedRaces(meet,5);
  const regMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));

  let body=`<div class="page-header"><h1>Race Day</h1><div class="sub">${esc(meet.meetName)}</div></div>${raceDaySubTabs(meet,mode)}`;

  if(mode==='director') {
    const raceOptions=info.ordered.map((r,idx)=>`<option value="${r.id}" ${r.id===meet.currentRaceId?'selected':''}>${idx+1}. ${r.groupLabel} — ${cap(r.division)} — ${r.distanceLabel} — ${raceDisplayStage(r)}</option>`).join('');
    body+=`
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card orange"><div class="stat-label">Current Race</div><div class="stat-value">${current?esc(current.groupLabel):'—'}</div><div class="stat-sub">${current?`${esc(cap(current.division))} • ${esc(current.distanceLabel)} • ${esc(raceDisplayStage(current))}`:''}</div></div>
        <div class="stat-card yellow"><div class="stat-label">On Deck</div><div class="stat-value">${info.next?esc(info.next.groupLabel):'—'}</div><div class="stat-sub">${info.next?`${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}`:''}</div></div>
        <div class="stat-card navy"><div class="stat-label">Progress</div><div class="stat-value">${Math.max(info.idx+1,0)} <span style="font-size:18px;opacity:.6">/ ${info.ordered.length}</span></div><div class="stat-sub">${meet.raceDayPaused?'⏸ Paused':'▶ Running'}</div></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="form-grid cols-3">
          <div><label>Set Current Race</label><select onchange="setCurrentRace(this.value)">${raceOptions}</select></div>
          <div class="action-row" style="align-self:flex-end">
            <button class="btn2" onclick="moveCurrent(-1)">← Previous</button>
            <button class="btn-orange" onclick="moveCurrent(1)">Next →</button>
          </div>
          <div class="action-row" style="align-self:flex-end">
            <button class="btn2" onclick="pauseMeet()">${meet.raceDayPaused?'▶ Resume':'⏸ Pause'}</button>
            ${current&&current.status==='closed'?`<button class="btn-danger" onclick="unlockRace('${current.id}')">Unlock Race</button>`:''}
          </div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h2>Current Race</h2>
          ${current?`
            <div class="action-row" style="margin-bottom:12px">
              <span class="chip">${esc(current.blockName||'Unassigned')}</span>
              <span class="chip">${esc(cap(current.division))}</span>
              <span class="chip">${esc(raceDisplayStage(current))}</span>
              <span class="chip">${esc(cap(current.startType))} Start</span>
              <span class="chip chip-${current.status==='closed'?'green':'sky'}">${esc(current.status)}</span>
              ${current.isOpenRace?`<span class="chip chip-orange">🏁 Open</span>`:''}
              ${current.isQuadRace?`<span class="chip chip-purple">🛼 Quad</span>`:''}
            </div>
            <table class="table">
              <thead><tr><th>Lane</th><th>Helmet</th><th>Skater</th><th>Team</th><th>Result</th><th>Status</th></tr></thead>
              <tbody>${currentLanes.map(l=>{const reg=regMap.get(Number(l.registrationId));return`<tr><td>${l.lane}</td><td>${l.helmetNumber?'#'+esc(l.helmetNumber):''}</td><td><strong>${esc(l.skaterName||'')}</strong>${sponsorLineHtml(reg?.sponsor||'')}</td><td>${esc(l.team||'')}</td><td>${esc(current.resultsMode==='times'?l.time:l.place)}</td><td>${esc(l.status||'')}</td></tr>`;}).join('')}</tbody>
            </table>`:
          `<div class="muted">No race selected yet.</div>`}
        </div>
        <div class="card">
          <h2>Coming Up</h2>
          <table class="table">
            <thead><tr><th>Race</th><th>Division</th><th>Class</th><th>Distance</th></tr></thead>
            <tbody>${info.coming.map((r,i)=>`<tr><td>${info.idx+i+3}</td><td>${esc(r.groupLabel)}</td><td>${esc(cap(r.division))}</td><td>${esc(r.distanceLabel)}</td></tr>`).join('')||`<tr><td colspan="4" class="muted">Nothing queued.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
      <script>
        async function setCurrentRace(raceId){const r=await fetch('/api/meet/${meet.id}/race-day/set-current',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId})});if(r.ok) location.reload();}
        async function moveCurrent(dir){const r=await fetch('/api/meet/${meet.id}/race-day/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({direction:dir})});if(r.ok) location.reload();}
        async function pauseMeet(){const r=await fetch('/api/meet/${meet.id}/race-day/toggle-pause',{method:'POST'});if(r.ok) location.reload();}
        async function unlockRace(raceId){const r=await fetch('/api/meet/${meet.id}/race-day/unlock-race',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId})});if(r.ok) location.reload();}
      </script>`;

  } else if(mode==='judges') {
    body+=`
      <div class="card" style="margin-bottom:14px">
        <h2 style="margin:0">${current?`Race ${Math.max(info.idx+1,1)} — ${esc(current.groupLabel)} — ${esc(cap(current.division))} — ${esc(current.distanceLabel)}`:'No race selected'}</h2>
        <div class="note">Judges always land on the current race. Save, then close race when done.</div>
      </div>
      ${current?`
        <div class="card">
          <form method="POST" action="/portal/meet/${meet.id}/race-day/judges/save">
            <input type="hidden" name="raceId" value="${esc(current.id)}" />
            <div class="action-row" style="margin-bottom:14px">
              <label class="toggle-wrap"><input type="radio" name="resultsMode" value="places" ${current.resultsMode!=='times'?'checked':''} style="width:auto" /> <span style="font-size:14px;font-weight:600">Places</span></label>
              <label class="toggle-wrap"><input type="radio" name="resultsMode" value="times"  ${current.resultsMode==='times' ?'checked':''} style="width:auto" /> <span style="font-size:14px;font-weight:600">Times</span></label>
            </div>
            <div style="overflow-x:auto">
              <table class="table">
                <thead><tr><th>Lane</th><th>Helmet</th><th>Skater</th><th>Team</th><th>Place</th><th>Time</th><th>Status</th></tr></thead>
                <tbody>${currentLanes.map(l=>{const reg=regMap.get(Number(l.registrationId));return`<tr>
                  <td>${l.lane}</td><td>${l.helmetNumber?'#'+esc(l.helmetNumber):''}</td>
                  <td><input name="skaterName_${l.lane}" value="${esc(l.skaterName)}" />${reg?.sponsor?`<div class="sponsor-line">Sponsor: ${esc(reg.sponsor)}</div>`:''}</td>
                  <td><input name="team_${l.lane}"       value="${esc(l.team)}"       /></td>
                  <td><input name="place_${l.lane}"      value="${esc(l.place)}"      /></td>
                  <td><input name="time_${l.lane}"       value="${esc(l.time)}"       /></td>
                  <td><select name="status_${l.lane}">
                    <option value="" ${!l.status?'selected':''}>—</option>
                    <option value="DNS" ${l.status==='DNS'?'selected':''}>DNS</option>
                    <option value="DQ"  ${l.status==='DQ' ?'selected':''}>DQ</option>
                    <option value="Scratch" ${l.status==='Scratch'?'selected':''}>Scratch</option>
                  </select></td>
                </tr>`;}).join('')}</tbody>
              </table>
            </div>
            <div style="margin-top:14px"><label>Race Notes</label><textarea name="notes">${esc(current.notes||'')}</textarea></div>
            <div class="action-row" style="margin-top:14px">
              <button class="btn2" type="submit" name="action" value="save">Save</button>
              <button class="btn-orange" type="submit" name="action" value="close">Close Race</button>
            </div>
          </form>
        </div>`:`<div class="card"><div class="muted">No race selected yet.</div></div>`}`;

  } else if(mode==='announcer') {
    body+=`
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card orange"><div class="stat-label">Current Race</div><div class="stat-value">${current?esc(current.groupLabel):'—'}</div><div class="stat-sub">${current?`${esc(cap(current.division))} • ${esc(current.distanceLabel)}`:''}</div></div>
        <div class="stat-card yellow"><div class="stat-label">On Deck</div><div class="stat-value">${info.next?esc(info.next.groupLabel):'—'}</div><div class="stat-sub">${info.next?`${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}`:''}</div></div>
        <div class="stat-card sky"><div class="stat-label">After That</div><div class="stat-value">${info.coming[0]?esc(info.coming[0].groupLabel):'—'}</div><div class="stat-sub">${info.coming[0]?`${esc(cap(info.coming[0].division))} • ${esc(info.coming[0].distanceLabel)}`:''}</div></div>
      </div>
      ${announcerBoxHtml(current,currentLanes.map(l=>{const reg=regMap.get(Number(l.registrationId));return{...l,sponsor:reg?.sponsor||''};}))}`; 
  } else {
    body+=`
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card orange"><div class="stat-label">Current Race</div><div class="stat-value">${current?esc(current.groupLabel):'—'}</div><div class="stat-sub">${current?`${esc(cap(current.division))} • Race ${Math.max(info.idx+1,1)} of ${info.ordered.length}`:''}</div></div>
        <div class="stat-card yellow"><div class="stat-label">On Deck</div><div class="stat-value">${info.next?esc(info.next.groupLabel):'—'}</div><div class="stat-sub">${info.next?`${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}`:''}</div></div>
        <div class="stat-card green"><div class="stat-label">Last Result</div><div class="stat-value">${recent[0]?esc(recent[0].groupLabel):'Waiting'}</div><div class="stat-sub">${recent[0]?`${esc(cap(recent[0].division))} • ${esc(recent[0].distanceLabel)}`:''}</div></div>
      </div>`;
  }
  res.send(pageShell({title:'Race Day',user:req.user,meet,activeTab:'race-day', bodyHtml:body}));
});

app.post('/portal/meet/:meetId/race-day/judges/save', requireRole('judge','meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||''));
  if(!race) return res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
  const laneCount=(race.isOpenRace||isOpenDivision(race.division))?Math.max((race.laneEntries||[]).length,1):Math.max(1,Number(meet.lanes)||4);
  race.laneEntries=[];
  for(let i=1;i<=laneCount;i++) {
    const existing=(race.laneEntries||[]).find(x=>Number(x.lane)===i)||{};
    race.laneEntries.push({lane:i,registrationId:existing.registrationId||'',helmetNumber:existing.helmetNumber||'',skaterName:String(req.body[`skaterName_${i}`]||'').trim(),team:String(req.body[`team_${i}`]||'').trim(),place:String(req.body[`place_${i}`]||'').trim(),time:String(req.body[`time_${i}`]||'').trim(),status:String(req.body[`status_${i}`]||'').trim()});
  }
  race.resultsMode=String(req.body.resultsMode||'places')==='times'?'times':'places';
  race.notes=String(req.body.notes||''); race.status=req.body.action==='close'?'closed':'open';
  race.closedAt=req.body.action==='close'?nowIso():race.closedAt;
  meet.updatedAt=nowIso();
  if(req.body.action==='close') {
    const info=currentRaceInfo(meet);
    if(info.current&&info.current.id===race.id) { const next=info.ordered[info.idx+1]; if(next){meet.currentRaceId=next.id;meet.currentRaceIndex=info.idx+1;} }
  }
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
});

app.post('/api/meet/:meetId/race-day/set-current', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const ordered=orderedRaces(meet); const idx=ordered.findIndex(r=>r.id===String(req.body.raceId||''));
  if(idx<0) return res.status(404).send('Race not found');
  meet.currentRaceId=ordered[idx].id; meet.currentRaceIndex=idx; meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

app.post('/api/meet/:meetId/race-day/step', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const info=currentRaceInfo(meet); const dir=Number(req.body.direction||1);
  const idx=Math.max(0,Math.min(info.ordered.length-1,info.idx+(dir>=0?1:-1)));
  if(info.ordered[idx]){meet.currentRaceId=info.ordered[idx].id;meet.currentRaceIndex=idx;}
  meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

app.post('/api/meet/:meetId/race-day/toggle-pause', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.raceDayPaused=!meet.raceDayPaused; saveDb(req.db); res.json({ok:true});
});

app.post('/api/meet/:meetId/race-day/unlock-race', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||''));
  if(!race) return res.status(404).send('Race not found');
  race.status='open'; race.closedAt=''; meet.currentRaceId=race.id;
  meet.currentRaceIndex=orderedRaces(meet).findIndex(r=>r.id===race.id);
  saveDb(req.db); res.json({ok:true});
});

// ── Results ───────────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/results', requireRole('meet_director','judge','coach'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const sections=computeMeetStandings(meet);
  const openSections=computeOpenResults(meet);
  const quadSections=computeQuadStandings(meet);
  res.send(pageShell({title:'Results',user:req.user,meet,activeTab:'results', bodyHtml:`
    <div class="page-header"><h1>Results</h1><div class="sub">${esc(meet.meetName)}</div></div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between center">
        <div class="action-row">
          <span class="chip chip-${meet.status==='complete'?'green':meet.status==='live'?'orange':'sky'}">${esc(meet.status||'draft')}</span>
        </div>
        <div class="action-row">
          ${hasRole(req.user,'super_admin')||canEditMeet(req.user,meet)?(meet.status==='complete'?`<form method="POST" action="/portal/meet/${meet.id}/reopen"><button class="btn2" type="submit">Reopen Meet</button></form>`:`<form method="POST" action="/portal/meet/${meet.id}/finalize"><button class="btn-orange" type="submit">Finalize Meet</button></form>`):''}
          <a class="btn2" href="/portal/meet/${meet.id}/results/print" target="_blank">Print Results</a>
        </div>
      </div>
    </div>
    ${sections.map(resultsSectionHtml).join('<div class="spacer"></div>')||`<div class="card"><div class="muted">No inline standings yet.</div></div>`}
    ${openSections.length?`
      <div class="spacer"></div>
      <h2 style="color:var(--orange)">🏁 Open Race Results</h2>
      ${openSections.map(s=>`
        <div class="card" style="border-left:4px solid var(--orange);margin-bottom:14px">
          <div class="row between" style="margin-bottom:12px">
            <div><h2 style="margin:0">${esc(s.race.groupLabel)} — Open</h2><div class="note">${esc(s.race.distanceLabel)} • Rolling Start</div></div>
            ${s.rows[0]?`<div class="chip chip-orange">🏁 ${esc(s.rows[0].skaterName)}</div>`:''}
          </div>
          <table class="table">
            <thead><tr><th>Place</th><th>Skater</th><th>Team</th></tr></thead>
            <tbody>${s.rows.map(r=>`<tr><td><strong>${esc(r.place)}</strong></td><td>${esc(r.skaterName||'')}${sponsorLineHtml((meet.registrations||[]).find(reg=>Number(reg.id)===Number(r.registrationId))?.sponsor||'')}</td><td>${esc(r.team||'')}</td></tr>`).join('')||`<tr><td colspan="3" class="muted">No results yet.</td></tr>`}</tbody>
          </table>
        </div>`).join('')}`:``}
    ${quadSections.length?`
      <div class="spacer"></div>
      <h2 style="color:var(--purple)">🛼 Quad Results</h2>
      ${quadSections.map(s=>`
        <div class="card" style="border-left:4px solid var(--purple);margin-bottom:14px">
          <div class="row between" style="margin-bottom:12px">
            <div><h2 style="margin:0">${esc(s.groupLabel)} — ${esc(s.distanceLabel)}</h2><div class="note">30 / 20 / 10 / 5 points • Quad Division</div></div>
            ${s.standings[0]?`<div class="chip chip-purple">🛼 ${esc(s.standings[0].skaterName)}</div>`:''}
          </div>
          <table class="table">
            <thead><tr><th>Place</th><th>Skater</th><th>Team</th><th>Points</th></tr></thead>
            <tbody>${s.standings.map(r=>`<tr><td><strong>${r.overallPlace}</strong></td><td>${esc(r.skaterName||'')}${sponsorLineHtml(r.sponsor||'')}</td><td>${esc(r.team||'')}</td><td><strong>${Number(r.totalPoints||0)}</strong></td></tr>`).join('')||`<tr><td colspan="4" class="muted">No standings yet.</td></tr>`}</tbody>
          </table>
        </div>`).join('')}`:``}`}));
});

app.post('/portal/meet/:meetId/finalize', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  meet.status='complete'; meet.updatedAt=nowIso(); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/results`);
});

app.post('/portal/meet/:meetId/reopen', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  meet.status='live'; meet.updatedAt=nowIso(); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/results`);
});

app.get('/meet/:meetId/results', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId); const data=getSessionUser(req);
  if(!meet||!meet.isPublic) return res.redirect('/meets');
  const sections=computeMeetStandings(meet); const openSections=computeOpenResults(meet); const quadSections=computeQuadStandings(meet);
  res.send(pageShell({title:'Results',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>${esc(meet.meetName)}</h1><div class="sub">Results</div></div>
    ${sections.map(resultsSectionHtml).join('<div class="spacer"></div>')||`<div class="card"><div class="muted">No standings yet.</div></div>`}
    ${openSections.length?`<div class="spacer"></div><h2 style="color:var(--orange)">🏁 Open Results</h2>${openSections.map(s=>`<div class="card" style="border-left:4px solid var(--orange);margin-bottom:14px"><h2>${esc(s.race.groupLabel)} — ${esc(s.race.distanceLabel)}</h2><table class="table"><thead><tr><th>Place</th><th>Skater</th><th>Team</th></tr></thead><tbody>${s.rows.map(r=>`<tr><td><strong>${esc(r.place)}</strong></td><td>${esc(r.skaterName||'')}</td><td>${esc(r.team||'')}</td></tr>`).join('')}</tbody></table></div>`).join('')}`:``}
    ${quadSections.length?`<div class="spacer"></div><h2 style="color:var(--purple)">🛼 Quad Results</h2>${quadSections.map(s=>`<div class="card" style="border-left:4px solid var(--purple);margin-bottom:14px"><h2>${esc(s.groupLabel)} — ${esc(s.distanceLabel)}</h2><table class="table"><thead><tr><th>Place</th><th>Skater</th><th>Team</th><th>Points</th></tr></thead><tbody>${s.standings.map(r=>`<tr><td><strong>${r.overallPlace}</strong></td><td>${esc(r.skaterName||'')}</td><td>${esc(r.team||'')}</td><td><strong>${Number(r.totalPoints||0)}</strong></td></tr>`).join('')}</tbody></table></div>`).join('')}`:``}`}));
});

app.get('/portal/meet/:meetId/results/print', requireRole('meet_director','judge','coach'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId); if(!meet) return res.redirect('/portal');
  const sections=computeMeetStandings(meet); const openSections=computeOpenResults(meet); const quadSections=computeQuadStandings(meet);
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Results — ${esc(meet.meetName)}</title>
    <style>body{font-family:Arial,sans-serif;padding:18px;color:#111;font-size:12px}h1,h2{margin:0 0 6px}
    .meta{color:#555;margin-bottom:12px}.section{margin-bottom:26px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
    th{font-size:11px;text-transform:uppercase;color:#666;letter-spacing:.05em}</style></head><body>
    <h1>${esc(meet.meetName)} — Results</h1><div class="meta">${esc(meet.date||'')}${meet.startTime?` • ${esc(meet.startTime)}`:''}</div>
    ${sections.map(s=>`<div class="section"><h2>${esc(s.groupLabel)} — ${esc(cap(s.division))}</h2>
      <table><thead><tr><th>Place</th><th>Skater</th><th>Team</th><th>Points</th></tr></thead><tbody>
      ${s.standings.map(r=>`<tr><td>${r.overallPlace}</td><td>${esc(r.skaterName||'')}${r.sponsor?` (${esc(r.sponsor)})`:''}
      </td><td>${esc(r.team||'')}</td><td>${Number(r.totalPoints||0)}</td></tr>`).join('')||`<tr><td colspan="4">No standings.</td></tr>`}
      </tbody></table></div>`).join('')}
    ${openSections.length?`<h1>Open Results</h1>${openSections.map(s=>`<div class="section"><h2>${esc(s.race.groupLabel)} — ${esc(s.race.distanceLabel)}</h2>
      <table><thead><tr><th>Place</th><th>Skater</th><th>Team</th></tr></thead><tbody>
      ${s.rows.map(r=>`<tr><td>${esc(r.place)}</td><td>${esc(r.skaterName||'')}</td><td>${esc(r.team||'')}</td></tr>`).join('')||`<tr><td colspan="3">No results.</td></tr>`}
      </tbody></table></div>`).join('')}`:``}
    ${quadSections.length?`<h1>Quad Results</h1>${quadSections.map(s=>`<div class="section"><h2>${esc(s.groupLabel)} — ${esc(s.distanceLabel)}</h2>
      <table><thead><tr><th>Place</th><th>Skater</th><th>Team</th><th>Points</th></tr></thead><tbody>
      ${s.standings.map(r=>`<tr><td>${r.overallPlace}</td><td>${esc(r.skaterName||'')}</td><td>${esc(r.team||'')}</td><td>${Number(r.totalPoints||0)}</td></tr>`).join('')||`<tr><td colspan="4">No standings.</td></tr>`}
      </tbody></table></div>`).join('')}`:``}
  </body></html>`);
});

// ── Public Live ───────────────────────────────────────────────────────────────

app.get('/meet/:meetId/live', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId); const data=getSessionUser(req);
  if(!meet||!meet.isPublic) return res.redirect('/meets');
  const info=currentRaceInfo(meet); const current=info.current;
  const lanes=current?laneRowsForRace(current,meet):[];
  const recent=recentClosedRaces(meet,5);
  const regMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));
  res.send(pageShell({title:'Live',user:data?.user||null, bodyHtml:`
    <div class="live-hero">
      <div class="live-meet-name">${esc(meet.meetName)}</div>
      <div style="display:flex;gap:16px;margin-top:16px;flex-wrap:wrap">
        <div><div class="live-race-label">Current Race</div><div class="live-race-name">${current?esc(current.groupLabel):'—'}</div>${current?`<div style="opacity:.75;font-size:14px">${esc(cap(current.division))} • ${esc(current.distanceLabel)} • Race ${Math.max(info.idx+1,1)} of ${info.ordered.length}</div>`:''}</div>
        <div style="width:1px;background:rgba(255,255,255,.15)"></div>
        <div><div class="live-race-label">On Deck</div><div class="live-race-name">${info.next?esc(info.next.groupLabel):'—'}</div>${info.next?`<div style="opacity:.75;font-size:14px">${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}</div>`:''}</div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        ${current?`
          <h2>${esc(current.groupLabel)} — ${esc(cap(current.division))} — ${esc(current.distanceLabel)}</h2>
          <table class="table">
            <thead><tr><th>Lane</th><th>Helmet</th><th>Skater</th><th>Team</th><th>Result</th><th>Status</th></tr></thead>
            <tbody>${lanes.map(l=>{const reg=regMap.get(Number(l.registrationId));return`<tr><td>${l.lane}</td><td>${l.helmetNumber?'#'+esc(l.helmetNumber):''}</td><td><strong>${esc(l.skaterName)}</strong>${sponsorLineHtml(reg?.sponsor||'')}</td><td>${esc(l.team)}</td><td>${esc(current.resultsMode==='times'?l.time:l.place)}</td><td>${esc(l.status)}</td></tr>`;}).join('')}</tbody>
          </table>`:
        `<div class="muted">No race selected.</div>`}
      </div>
      <div class="card">
        <h2>Recent Results</h2>
        ${recent.map(r=>`
          <div style="margin-bottom:14px">
            <div class="bold">${esc(r.groupLabel)} — ${esc(cap(r.division))} — ${esc(r.distanceLabel)}</div>
            <table class="table"><thead><tr><th>Place</th><th>Skater</th><th>Team</th></tr></thead><tbody>
            ${(r.laneEntries||[]).filter(x=>String(x.place||'').trim()).sort((a,b)=>Number(a.place||999)-Number(b.place||999)).slice(0,4).map(x=>{const reg=regMap.get(Number(x.registrationId));return`<tr><td>${esc(x.place)}</td><td>${esc(x.skaterName||'')}${sponsorLineHtml(reg?.sponsor||'')}</td><td>${esc(x.team||'')}</td></tr>`;}).join('')||`<tr><td colspan="3" class="muted">No results yet.</td></tr>`}
            </tbody></table>
          </div>`).join('')||`<div class="muted">No recent results yet.</div>`}
      </div>
    </div>
    <script>setTimeout(()=>location.reload(),5000);</script>`}));
});

// ── Print Race List ───────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/registered/print-race-list', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId); if(!meet) return res.redirect('/portal');
  const blocksByDay={};
  for(const block of meet.blocks||[]) { const day=block.day||'Day 1'; if(!blocksByDay[day]) blocksByDay[day]=[]; blocksByDay[day].push(block); }
  const breakTypes=['break','lunch','awards','practice'];
  const breakIcons={break:'☕',lunch:'🍽️',awards:'🏆',practice:'⛸️'};
  let raceNo=1; let raceBlockNum=0;
  const daySections=Object.keys(blocksByDay).sort().map(day=>{
    const blockSections=blocksByDay[day].map(block=>{
      const isBreak=breakTypes.includes(block.type||'');
      if(isBreak) {
        const icon=breakIcons[block.type]||'📌';
        return `<div style="margin:14px 0;padding:10px 14px;background:#f8fafc;border-left:3px solid #cbd5e1;border-radius:4px;color:#64748b;font-weight:600">
          ${icon} ${esc(block.name)}${block.notes?' — '+esc(block.notes):''}
        </div>`;
      }
      raceBlockNum++;
      const raceRows=(block.raceIds||[]).map(rid=>{
        const race=(meet.races||[]).find(r=>r.id===rid); if(!race) return '';
        const tag=race.isOpenRace?'🏁 ':race.isQuadRace?'🛼 ':'';
        return `<tr><td>${raceNo++}</td><td>${tag}${esc(race.groupLabel)}</td><td>${esc(race.distanceLabel)}</td><td>${esc(cap(race.division))}</td><td>${esc(raceDisplayStage(race))}</td><td>${esc(cap(race.startType))}</td><td>${esc(race.cost)}</td></tr>`;
      }).join('');
      return `<div style="margin-bottom:18px"><h3>${esc(block.name)} <span style="font-weight:400;font-size:12px;color:#888">Race Block ${raceBlockNum}</span></h3>${block.notes?`<div style="color:#555;font-size:11px">${esc(block.notes)}</div>`:''}
        <table><thead><tr><th>Race</th><th>Division</th><th>Distance</th><th>Class</th><th>Stage</th><th>Start</th><th>Cost</th></tr></thead>
        <tbody>${raceRows||`<tr><td colspan="7">No races.</td></tr>`}</tbody></table></div>`;
    }).join('');
    return `<div style="margin-bottom:24px"><h2>${esc(day)}</h2>${blockSections}</div>`;
  }).join('');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Race List — ${esc(meet.meetName)}</title>
    <style>body{font-family:Arial,sans-serif;padding:18px;color:#111;font-size:12px}h1,h2,h3{margin:0 0 6px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
    th{font-size:11px;text-transform:uppercase;color:#666}</style></head><body>
    <h1>${esc(meet.meetName)} — Race List</h1>
    <div style="color:#555;margin-bottom:12px">${esc(meet.date||'')}${meet.startTime?` • ${esc(meet.startTime)}`:''}</div>
    ${daySections||'<div>No blocks yet.</div>'}
  </body></html>`);
});

// ── Start server ──────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log(`SpeedSkateMeet v19 listening on ${HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});