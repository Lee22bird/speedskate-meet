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
const ADMIN_PHONE = '+13166516013';

// ── Twilio ────────────────────────────────────────────────────────────────────
const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM   = process.env.TWILIO_FROM_NUMBER;
const TWILIO_READY  = !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

async function sendSms(to, body) {
  if(!TWILIO_READY) { console.log('[SMS disabled] To:', to, '\n', body); return; }
  try {
    const creds = Buffer.from(TWILIO_SID+':'+TWILIO_TOKEN).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic '+creds, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
    });
    const data = await res.json();
    if(data.error_code) console.error('[SMS error]', data.error_code, data.message);
    else console.log('[SMS sent]', to, data.sid);
  } catch(err) { console.error('[SMS exception]', err.message); }
}

// ── SendGrid ──────────────────────────────────────────────────────────────────
const SG_KEY       = process.env.SENDGRID_API_KEY;
const SG_FROM      = process.env.SENDGRID_FROM      || 'noreply@speedskatemeet.com';
const SG_FROM_NAME = process.env.SENDGRID_FROM_NAME || 'SpeedSkateMeet';
const SG_READY     = !!SG_KEY;

async function sendEmail(to, subject, htmlBody, textBody) {
  if(!SG_READY) { console.log('[Email disabled] To:', to, 'Subject:', subject); return; }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer '+SG_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: SG_FROM, name: SG_FROM_NAME },
        subject,
        content: [
          { type: 'text/plain', value: textBody||subject },
          { type: 'text/html',  value: htmlBody||'<p>'+subject+'</p>' },
        ],
      }),
    });
    if(res.status===202) console.log('[Email sent]', to, subject);
    else { const d=await res.json(); console.error('[Email error]', d); }
  } catch(err) { console.error('[Email exception]', err.message); }
}

function emailHtmlWrap(content) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#0F1F3D">
    <div style="background:#0F1F3D;padding:20px;border-radius:12px;text-align:center;margin-bottom:24px">
      <img src="https://speedskatemeet.com/public/images/branding/ssm-logo.png" style="height:60px;width:auto;max-width:280px;display:block;margin:0 auto" alt="SpeedSkateMeet" />
    </div>
    ${content}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center">
      SpeedSkateMeet.com — The Platform for Inline Speed Skating<br/>
      <a href="https://speedskatemeet.com" style="color:#F97316">speedskatemeet.com</a>
    </div>
  </body></html>`;
}

function formatTime(t){
  if(!t) return '';
  const [h,m]=t.split(':');
  const hr=Number(h); const min=m||'00';
  const ampm=hr>=12?'PM':'AM';
  const h12=hr%12||12;
  return h12+':'+min+' '+ampm;
}

function meetDateRange(meet){const s=meet.date||'';const e=meet.endDate||'';if(!s)return'Date TBD';if(!e||e===s)return s;return s+' – '+e;}

function normalizePhone(raw) {
  const digits = String(raw||'').replace(/\D/g,'');
  if(digits.length===10) return '+1'+digits;
  if(digits.length===11&&digits[0]==='1') return '+'+digits;
  return null;
}

// Fire alerts when race advances — check 2-away and on-deck subscriptions
async function fireRaceAlerts(meet, newIdx, ordered) {
  const subs = meet.textAlerts || [];
  if(!subs.length) return;

  // On deck (delta=1) and 2 away (delta=2)
  for(const delta of [1,2]) {
    const targetRace = ordered[newIdx + delta];
    if(!targetRace) continue;
    // Find subs for skaters in this race
    for(const entry of targetRace.laneEntries||[]) {
      const regId = String(entry.registrationId||'');
      const matched = subs.filter(s=>String(s.registrationId||'')===regId);
      for(const sub of matched) {
        const laneInfo = targetRace.isOpenRace||targetRace.isTimeTrial ? '' :
          (entry.lane ? `\nLane ${entry.lane} • Helmet #${entry.helmetNumber||'?'}` : `\nLane TBD • Helmet #${entry.helmetNumber||'?'}`);
        const msg = delta===1
          ? `⚡ ${entry.skaterName} is IN STAGING\n${targetRace.groupLabel} • ${cap(targetRace.division)} • ${targetRace.distanceLabel}${laneInfo}\n${meet.meetName}`
          : `🏁 Heads up! ${entry.skaterName} races in 2\n${targetRace.groupLabel} • ${cap(targetRace.division)} • ${targetRace.distanceLabel}${laneInfo}\n${meet.meetName}`;
        sendSms(sub.phone, msg);
      }
    }
  }
}

// Fire result alerts when a race closes
async function fireResultAlerts(meet, race) {
  const subs = meet.textAlerts || [];
  if(!subs.length) return;
  // Get standings for points context
  const standings = computeMeetStandings(meet);
  const bucketKey = `${race.groupId}|${race.division}`;
  const section = standings.find(s=>s.key===bucketKey);

  for(const entry of race.laneEntries||[]) {
    if(!entry.place||!entry.registrationId) continue;
    const regId = String(entry.registrationId||'');
    const matched = subs.filter(s=>String(s.registrationId||'')===regId);
    if(!matched.length) continue;

    const place = Number(entry.place);
    const placeEmoji = place===1?'🥇':place===2?'🥈':place===3?'🥉':`${place}th`;
    const pts = STANDARD_POINTS[place];
    const skaterRow = section?.standings.find(r=>String(r.registrationId||'')===regId);
    const totalPts = skaterRow?.totalPoints;

    let msg;
    if(race.isTimeTrial) {
      const sorted=[...(race.laneEntries||[])].sort((a,b)=>parseFloat(a.time||'999')-parseFloat(b.time||'999'));
      const ttPlace = sorted.findIndex(e=>String(e.registrationId||'')===regId)+1;
      msg = `⏱ ${entry.skaterName} — ${entry.time}\n${race.groupLabel}\nCurrent standing: ${ttPlace===1?'🥇':ttPlace===2?'🥈':ttPlace===3?'🥉':ttPlace+'th'} place\n${meet.meetName}`;
    } else if(race.isOpenRace||race.countsForOverall===false) {
      msg = `✅ ${entry.skaterName} — ${placeEmoji} place!\n${race.groupLabel} • ${cap(race.division)} • ${race.distanceLabel}\nPlacement only\n${meet.meetName} 🏁`;
    } else if(pts) {
      msg = `✅ ${entry.skaterName} — ${placeEmoji} place!\n${race.groupLabel} • ${cap(race.division)} • ${race.distanceLabel}\n${pts} pts earned${totalPts!=null?' | '+totalPts+' pts total':''}\n${meet.meetName} 🏁`;
    } else {
      msg = `✅ ${entry.skaterName} — ${placeEmoji} place!\n${race.groupLabel} • ${cap(race.division)} • ${race.distanceLabel}\n${meet.meetName} 🏁`;
    }
    for(const sub of matched) sendSms(sub.phone, msg);
  }
}
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

// USARS SR150.1: age is birth year subtracted from Jan 1 of competition year
function usarsAge(birthdate, meetDate) {
  // USARS SR150.1: age is what the skater IS on January 1 of the meet year
  const refYear = meetDate ? new Date(meetDate).getFullYear() : new Date().getFullYear();
  if (!birthdate) return null;
  const bd = new Date(birthdate);
  if (isNaN(bd.getTime())) return null;
  let age = refYear - bd.getFullYear();
  // If birthday falls after Jan 1, they haven't yet reached that age on Jan 1
  if (new Date(refYear, bd.getMonth(), bd.getDate()) > new Date(refYear, 0, 1)) age -= 1;
  return age;
}

function ageForReg(reg, meet) {
  if (reg.birthdate) return usarsAge(reg.birthdate, meet?.date) ?? Number(reg.age||0);
  return Number(reg.age||0);
}

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

// Defaults from USARS flyer — e=Elite distances, n=Novice distances (empty = no novice for that group)
// Novice: Primary(7&under)=100/300, Juvenile(8-9)=200/500, Elementary(10-11)=300/700,
//         Freshman(12-13)=300/1000, Sophomore(14-15)=500/1000, Junior(16-17)=500/1000,
//         Senior(18-29)=500/1000, Masters(30+)=500/1000  — stops at Masters, none above
// Elite:  Tiny Tot=100/200/300, Primary=200/300/400, Juvenile=200/300/500,
//         Elementary=300/500/700, Freshman=300/500/1000, Sophomore=500/1000/1500,
//         Junior=500/1000/1500, Senior=500/1000/1500, Classic=500/1000/1500,
//         Masters=500/700/1000, Veterans=500/700/1000, Esquire=500/700/1000, Premier=500/700/1000
const GROUP_DEFAULTS = {
  tiny_tot_girls:   {e:['100m','200m','300m',''], n:['','','','']},
  tiny_tot_boys:    {e:['100m','200m','300m',''], n:['','','','']},
  primary_girls:    {e:['200m','300m','400m',''], n:['100m','300m','','']},
  primary_boys:     {e:['200m','300m','400m',''], n:['100m','300m','','']},
  juvenile_girls:   {e:['200m','300m','500m',''], n:['200m','500m','','']},
  juvenile_boys:    {e:['200m','300m','500m',''], n:['200m','500m','','']},
  elementary_girls: {e:['300m','500m','700m',''], n:['300m','700m','','']},
  elementary_boys:  {e:['300m','500m','700m',''], n:['300m','700m','','']},
  freshman_girls:   {e:['300m','500m','1000m',''],n:['300m','1000m','','']},
  freshman_boys:    {e:['300m','500m','1000m',''],n:['300m','1000m','','']},
  sophomore_girls:  {e:['500m','1000m','1500m',''],n:['500m','1000m','','']},
  sophomore_boys:   {e:['500m','1000m','1500m',''],n:['500m','1000m','','']},
  junior_women:     {e:['500m','1000m','1500m',''],n:['500m','1000m','','']},
  junior_men:       {e:['500m','1000m','1500m',''],n:['500m','1000m','','']},
  senior_women:     {e:['500m','1000m','1500m',''],n:['500m','1000m','','']},
  senior_men:       {e:['500m','1000m','1500m',''],n:['500m','1000m','','']},
  classic_women:    {e:['500m','1000m','1500m',''],n:['','','','']},
  classic_men:      {e:['500m','1000m','1500m',''],n:['','','','']},
  master_women:     {e:['500m','700m','1000m',''], n:['500m','1000m','','']},
  master_men:       {e:['500m','700m','1000m',''], n:['500m','1000m','','']},
  veteran_women:    {e:['500m','700m','1000m',''], n:['','','','']},
  veteran_men:      {e:['500m','700m','1000m',''], n:['','','','']},
  esquire_women:    {e:['500m','700m','1000m',''], n:['','','','']},
  esquire_men:      {e:['500m','700m','1000m',''], n:['','','','']},
  premier_women:    {e:['500m','700m','1000m',''], n:['','','','']},
  premier_men:      {e:['500m','700m','1000m',''], n:['','','','']},
};

function makeDefaultDivisions(groupId) {
  const def = GROUP_DEFAULTS[groupId];
  if(!def) return makeDivisionsTemplate();
  return {
    novice:{enabled:false,cost:0,distances:[...def.n]},
    elite: {enabled:false,cost:0,distances:[...def.e]},
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
    {id:'senior_women',    label:'Senior Women',     ages:'18-29',    gender:'women'},
    {id:'senior_men',      label:'Senior Men',       ages:'18-29',    gender:'men'},
    {id:'classic_women',   label:'Classic Women',    ages:'25-34',    gender:'women'},
    {id:'classic_men',     label:'Classic Men',      ages:'25-34',    gender:'men'},
    {id:'master_women',    label:'Master Women',     ages:'35-44',    gender:'women'},
    {id:'master_men',      label:'Master Men',       ages:'35-44',    gender:'men'},
    {id:'veteran_women',   label:'Veteran Women',    ages:'45-54',    gender:'women'},
    {id:'veteran_men',     label:'Veteran Men',      ages:'45-54',    gender:'men'},
    {id:'esquire_women',   label:'Esquire Women',    ages:'55-64',    gender:'women'},
    {id:'esquire_men',     label:'Esquire Men',      ages:'55-64',    gender:'men'},
    {id:'premier_women',   label:'Premier Women',    ages:'65+',      gender:'women'},
    {id:'premier_men',     label:'Premier Men',      ages:'65+',      gender:'men'},
  ].map(g=>({...g,divisions:makeDefaultDivisions(g.id)}));
}

function defaultMeet(ownerUserId) {
  return {
    id:null, createdByUserId:ownerUserId, createdAt:nowIso(), updatedAt:nowIso(),
    meetName:'New Meet', date:'', startTime:'', registrationCloseAt:'',
    rinkId:1, trackLength:100, lanes:4,
    timeTrialsEnabled:false, relayEnabled:false, judgesPanelRequired:true,
    notes:'', relayNotes:'', isPublic:false, status:'draft', tiebreaker:'d2', baseEntryFee:0, additionalEntryFee:0, entryCap:0,
    groups:baseGroups(), openGroups:makeOpenGroupsTemplate(), quadGroups:makeQuadGroupsTemplate(),
    races:[], blocks:[], registrations:[], skateabilityGroups:[],
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
    meets:[], rosters:[],
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
    if(!out[key]) out[key]={enabled:false,cost:0,distances:['','','',''],ages:''};
    out[key].enabled=!!out[key].enabled; out[key].cost=Number(out[key].cost||0);
    if(!Array.isArray(out[key].distances)) out[key].distances=['','','',''];
    out[key].distances=[0,1,2,3].map(i=>String(out[key].distances[i]||'').trim());
    if(typeof out[key].ages!=='string') out[key].ages='';
  } return out;
}

function normalizeOpenGroups(raw) {
  const defaults=makeOpenGroupsTemplate();
  if(!Array.isArray(raw)||raw.length===0) return defaults;
  return defaults.map(def=>{
    const saved=raw.find(r=>r.id===def.id); if(!saved) return def;
    return {id:def.id,label:def.label,ages:String(saved.ages||def.ages||'').trim()||def.ages,gender:def.gender,
      enabled:!!saved.enabled, distance:String(saved.distance||def.defaultDistance||'').trim(), cost:Number(saved.cost||0),
      timeTrial:!!saved.timeTrial, ttDistance:String(saved.ttDistance||'').trim()};
  });
}

function normalizeQuadGroups(raw) {
  const defaults=makeQuadGroupsTemplate();
  if(!Array.isArray(raw)||raw.length===0) return defaults;
  return defaults.map(def=>{
    const saved=raw.find(r=>r.id===def.id); if(!saved) return def;
    return {id:def.id,label:def.label,ages:String(saved.ages||def.ages||"").trim()||def.ages,gender:def.gender,
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
  if(!Number.isFinite(Number(meet.trackLength))) meet.trackLength=100;
  if(!Number.isFinite(Number(meet.lanes))) meet.lanes=4;
  if(typeof meet.timeTrialsEnabled!=='boolean') meet.timeTrialsEnabled=false;
  if(typeof meet.relayEnabled!=='boolean') meet.relayEnabled=false;
  if(typeof meet.judgesPanelRequired!=='boolean') meet.judgesPanelRequired=true;
  if(typeof meet.notes!=='string') meet.notes='';
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
    // Append any base groups missing from this meet (e.g. Premier added after meet was created)
    const existingIds=new Set(meet.groups.map(g=>g.id));
    for(const base of baseGroups()) {
      if(!existingIds.has(base.id)) meet.groups.push({...base,divisions:normalizeDivisionSet({})});
    }
  }
  if(!Array.isArray(meet.races)) meet.races=[];
  if(!Array.isArray(meet.blocks)) meet.blocks=[];
  if(!Array.isArray(meet.registrations)) meet.registrations=[];
  if(typeof meet.currentRaceId!=='string') meet.currentRaceId='';
  if(typeof meet.currentRaceIndex!=='number') meet.currentRaceIndex=-1;
  if(typeof meet.raceDayPaused!=='boolean') meet.raceDayPaused=false;
  if(!Number.isFinite(Number(meet.baseEntryFee))) meet.baseEntryFee=0;
  if(!Number.isFinite(Number(meet.additionalEntryFee))) meet.additionalEntryFee=0;
  if(!Number.isFinite(Number(meet.entryCap))) meet.entryCap=0;
  if(!Array.isArray(meet.textAlerts)) meet.textAlerts=[];
  if(!Array.isArray(meet.skateabilityGroups)) meet.skateabilityGroups=[];
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
    isOpenRace:!!r.isOpenRace, isQuadRace:!!r.isQuadRace, isTimeTrial:!!r.isTimeTrial, isRelayRace:!!r.isRelayRace,
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
    challengeUpGroupId:String(reg.challengeUpGroupId||''),
    challengeUpGroupLabel:String(reg.challengeUpGroupLabel||''),
    options:{challengeUp:!!reg.options?.challengeUp, novice:!!reg.options?.novice,
      elite:!!reg.options?.elite, open:!!reg.options?.open, quad:!!reg.options?.quad,
      timeTrials:!!reg.options?.timeTrials, relays:!!reg.options?.relays, skateability:!!reg.options?.skateability,
      skateabilityGroups:Array.isArray(reg.options?.skateabilityGroups)?reg.options.skateabilityGroups:[]},
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
  if(!Array.isArray(db.rosters)) db.rosters=[];
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
function canEditMeet(user,meet) {
  if(hasRole(user,'super_admin')) return true;
  if(hasRole(user,'coach')&&!hasRole(user,'meet_director')) return false;
  if(hasRole(user,'judge')&&!hasRole(user,'meet_director')) return false;
  if(hasRole(user,'announcer')&&!hasRole(user,'meet_director')) return false;
  return Number(meet.createdByUserId)===Number(user.id);
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

function groupAgeMatch(group,age) {
  const n=Number(age); const ages=String(group.ages||'');
  if(ages.includes('& under')) { const limit=Number((ages.match(/\d+/)||[0])[0]); return n<=limit; }
  if(ages.includes('+')) { const min=Number((ages.match(/\d+/)||[999])[0]); return n>=min; }
  const nums=ages.match(/\d+/g)||[]; if(nums.length>=2) return n>=Number(nums[0])&&n<=Number(nums[1]); return false;
}

function normalizeGender(raw,age) {
  const g=String(raw||'').toLowerCase();
  const isFem=g==='female'||g==='girls'||g==='women'||g==='f';
  const n=Number(age)||0;
  // Under 16: boys/girls; 16+: men/women
  if(isFem) return n>=16?'women':'girls';
  return n>=16?'men':'boys';
}

function findAgeGroup(groups,age,genderGuess) {
  const n=Number(age); if(!Number.isFinite(n)) return null;
  const normalizedGender=normalizeGender(genderGuess,age);
  const candidates=groups.filter(g=>groupAgeMatch(g,n)); if(!candidates.length) return null;
  return candidates.find(g=>g.gender===normalizedGender)||candidates[0];
}

function findChallengeUpGroup(groups,currentGroupId) {
  // Senior is the peak — everyone challenges toward Senior, same gender side only.
  // girls/women are the same side, boys/men are the same side.
  const SENIOR_IDS = ['senior_men','senior_women'];
  const isFemale = g => g.gender==='girls'||g.gender==='women';
  const isMale   = g => g.gender==='boys'||g.gender==='men';
  const current = groups.find(g=>String(g.id)===String(currentGroupId));
  if(!current) return null;
  if(SENIOR_IDS.includes(current.id)) return null; // Senior cannot challenge
  const female = isFemale(current);
  // Same gender side: girls+women together, boys+men together
  const sameGender = groups.filter(g=>female?isFemale(g):isMale(g));
  const idx = sameGender.findIndex(g=>String(g.id)===String(currentGroupId));
  if(idx<0) return null;
  const seniorIdx = sameGender.findIndex(g=>SENIOR_IDS.includes(g.id));
  if(seniorIdx<0) return null;
  if(idx < seniorIdx) return sameGender[idx+1]||null; // younger → challenge up
  if(idx > seniorIdx) return sameGender[idx-1]||null; // older → challenge down
  return null;
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
    reg.totalCost=calcRegistrationCost(meet,reg.options||{});
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

// SR832 tiebreaker point weights: [short, middle, long]
const SR832_WEIGHTS = {
  1: [96, 108, 120.75],   // 1st place
  2: [64,  72,  80.5 ],   // 2nd place
  3: [32,  36,  40.25],   // 3rd place
  4: [16,  18,  20.125],  // 4th place
};

function computeTiebreakerScore(raceScores, races, mode) {
  // Sort races by dayIndex to get short/middle/long order
  const sorted = [...races].sort((a,b)=>Number(a.dayIndex||0)-Number(b.dayIndex||0));
  const raceOrder = new Map(sorted.map((r,i)=>[r.id, i])); // 0=short,1=mid,2=long

  if(mode==='d2') {
    // D2 middle race tiebreaker: find place in middle race (index 1)
    const midRace = sorted[1] || sorted[0];
    if(!midRace) return 0;
    const midScore = raceScores.find(s=>s.raceId===midRace.id);
    // Lower place = better (1st beats 2nd), return negative so sort works
    return -(midScore?.place||999);
  }

  // SR832 full formula
  let total=0;
  for(const rs of raceScores) {
    const pos = raceOrder.get(rs.raceId); // 0=short,1=mid,2=long
    if(pos==null) continue;
    const place = Number(rs.place||0);
    const weights = SR832_WEIGHTS[place];
    if(!weights) continue;
    total += weights[Math.min(pos, 2)];
  }
  return total;
}

function computeMeetStandings(meet) {
  const tbMode = meet.tiebreaker || 'd2';
  const standings={}; const divisions={}; const regMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));
  for(const race of meet.races||[]) {
    if(race.isOpenRace||race.isQuadRace||race.isTimeTrial) continue;
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
      standings[bucketKey][regKey].raceScores.push({raceId:race.id,distanceLabel:race.distanceLabel,dayIndex:race.dayIndex,place:row.place,points:row.points});
    }
  }
  return Object.keys(divisions).map(key=>{
    const divRaces=divisions[key].races.sort((a,b)=>Number(a.dayIndex||0)-Number(b.dayIndex||0));
    const allRows=Object.values(standings[key]||{});

    // Sort: primary = totalPoints desc, tiebreaker when tied
    allRows.sort((a,b)=>{
      if(b.totalPoints!==a.totalPoints) return b.totalPoints-a.totalPoints;
      // Tied — apply tiebreaker
      const tbA=computeTiebreakerScore(a.raceScores,divRaces,tbMode);
      const tbB=computeTiebreakerScore(b.raceScores,divRaces,tbMode);
      if(tbMode==='d2') {
        // For d2 mode tbScore is negative place — higher (less negative) wins
        if(tbA!==tbB) return tbB-tbA; // less negative = better place = wins
      } else {
        if(tbA!==tbB) return tbB-tbA; // higher SR832 score wins
      }
      return String(a.skaterName||'').localeCompare(String(b.skaterName||''));
    });

    // Assign places, detect ties and runoff needed
    const rows=allRows.map((row,idx,arr)=>{
      const prev=arr[idx-1];
      const isTied=prev&&prev.totalPoints===row.totalPoints;
      const tbA=isTied?computeTiebreakerScore(row.raceScores,divRaces,tbMode):null;
      const tbB=isTied?computeTiebreakerScore(prev.raceScores,divRaces,tbMode):null;
      const tbResolved=isTied&&tbA!==tbB;
      const runoffNeeded=isTied&&tbA===tbB;
      return {...row,overallPlace:idx+1,
        tiebreakerUsed:tbResolved,
        tiebreakerScore:isTied?(tbMode==='sr832'?computeTiebreakerScore(row.raceScores,divRaces,'sr832'):null):null,
        runoffNeeded};
    });

    return {key,groupId:divisions[key].groupId,groupLabel:divisions[key].groupLabel,
      division:divisions[key].division,races:divRaces,standings:rows,tbMode};
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
  // If a race already has scored results or is closed, preserve its laneEntries entirely
  const hasResults = (baseRace.laneEntries||[]).some(e=>e.place||e.time);
  const isClosed = baseRace.status==='closed';
  if(isOpenDivision(baseRace.division)||baseRace.isOpenRace) {
    if(hasResults||isClosed) return [{...baseRace}]; // preserve scored race
    return [{...baseRace,stage:'final',heatNumber:0,isFinal:true,startType:'rolling',countsForOverall:false,
      laneEntries:sorted.map((reg,idx)=>({lane:idx+1,registrationId:reg.id,helmetNumber:reg.helmetNumber,skaterName:reg.name,team:reg.team,place:'',time:'',status:''}))}];
  }
  if(!shouldSplitIntoHeats(baseRace,sorted.length,laneCount)) {
    if(hasResults||isClosed) return [{...baseRace}]; // preserve scored race
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
  // Generate races for Additional Divisions (skateability groups — Diaper Dash, etc.)
  const existingSkRaces=(meet.races||[]).filter(r=>r.isSkateabilityRace);
  const skRaceMap=new Map(existingSkRaces.map(r=>[r.groupId+'|'+r.distanceLabel,r]));
  let skOrderHint=8500;
  for(const sg of meet.skateabilityGroups||[]) {
    if(!sg.ageGroupLabel) continue;
    const distances=(sg.distances||[]).filter(Boolean);
    for(const dist of distances) {
      const mapKey=sg.id+'|'+dist;
      const old=skRaceMap.get(mapKey);
      races.push({
        id:old?.id||('r'+crypto.randomBytes(6).toString('hex')),
        orderHint:skOrderHint++,
        groupId:sg.id, groupLabel:sg.ageGroupLabel, ages:sg.ageGroupId||'',
        division:'skateability', distanceLabel:dist, dayIndex:1, cost:0,
        stage:'final', heatNumber:0, parentRaceKey:'sk|'+sg.id+'|'+dist,
        startType:'standing', countsForOverall:false,
        laneEntries:Array.isArray(old?.laneEntries)?old.laneEntries:[],
        resultsMode:'places', status:old?.status||'open',
        notes:String(old?.notes||''), isFinal:true, closedAt:old?.closedAt||'',
        isOpenRace:false, isQuadRace:false, isTimeTrial:false, isSkateabilityRace:true
      });
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

function getOpenGroupIdForReg(reg) {
  const groupId=String(reg.divisionGroupId||reg.originalDivisionGroupId||'');
  const groupIsFemale=groupId.includes('girls')||groupId.includes('women')||groupId.includes('ladies');
  const groupIsMale=groupId.includes('boys')||groupId.includes('men');
  const storedGender=String(reg.gender||'').toLowerCase();
  const genderFemale=storedGender==='female'||storedGender==='girls'||storedGender==='women';
  const isFemale=groupIsFemale?true:groupIsMale?false:genderFemale;
  const age=Number(reg.age||0);
  if(age<=9)  return isFemale?'open_juv_girls':'open_juv_boys';
  if(age<=13) return isFemale?'open_fresh_girls':'open_fresh_boys';
  if(age>=35) return isFemale?'open_mast_ladies':'open_mast_men';
  return isFemale?'open_sr_ladies':'open_sr_men';
}

function generateOpenRacesForMeet(meet) {
  // TT is now managed via ttConfig — clear any stale timeTrial flags so open races always generate
  (meet.openGroups||[]).forEach(og=>{og.timeTrial=false;og.ttDistance='';});
  const nonOpenRaces=(meet.races||[]).filter(r=>!r.isOpenRace&&!r.isTimeTrial); // TT races rebuilt below with data preserved
  const openRaces=[]; let orderHint=9000;
  const TT_ORDER=['open_juv_girls','open_juv_boys','open_fresh_girls','open_fresh_boys','open_sr_ladies','open_sr_men','open_mast_ladies','open_mast_men'];
  for(const og of meet.openGroups||[]) {
    if(!og.enabled||!og.distance) continue;
    const existingRace=(meet.races||[]).find(r=>r.isOpenRace&&r.groupId===og.id&&!r.isTimeTrial);
    // Always recompute open race entries from registrations
    // Preserve scored/closed entries, but rebuild unscored entries from current registrations
    const existingScored=(existingRace?.laneEntries||[]).filter(e=>e.place||e.time);
    let laneEntries;
    if(existingScored.length||existingRace?.status==='closed') {
      // Race has scores — preserve as-is
      laneEntries=Array.isArray(existingRace?.laneEntries)?existingRace.laneEntries:[];
    } else {
      // Rebuild from registrations
      const matchingRegs=(meet.registrations||[]).filter(r=>!!r.options?.open&&getOpenGroupIdForReg(r)===og.id);
      laneEntries=matchingRegs.map((reg,idx)=>({lane:idx+1,registrationId:reg.id,helmetNumber:reg.helmetNumber,skaterName:reg.name,team:reg.team,place:'',time:'',status:''}));
    }
    openRaces.push({id:existingRace?.id||('r'+crypto.randomBytes(6).toString('hex')),orderHint:orderHint++,
      groupId:og.id,groupLabel:og.label,ages:og.ages,division:'open',distanceLabel:og.distance,dayIndex:1,cost:Number(og.cost||0),
      stage:'final',heatNumber:0,parentRaceKey:`open|${og.id}`,startType:'rolling',countsForOverall:false,
      laneEntries,
      resultsMode:existingRace?.resultsMode||'places',status:existingRace?.status||'open',
      notes:String(existingRace?.notes||''),isFinal:true,closedAt:existingRace?.closedAt||'',
      isOpenRace:true,isQuadRace:false,isTimeTrial:false});
  }
  // Single combined Time Trial race — all ages 0-99, scored by age group
  const hasTT=(meet.ttConfig?.enabled)||false;
  if(hasTT) {
    const ttDist=String(meet.ttConfig?.distance||'100m');
    const existingTT=(meet.races||[]).find(r=>r.isTimeTrial&&r.groupId==='tt_combined');
    let ttEntries;
    const ttHasTimes=(existingTT?.laneEntries||[]).some(e=>e.time);
    if(existingTT&&(ttHasTimes||existingTT.status==='closed')) {
      // Preserve all entries — times have been posted, never wipe
      ttEntries=Array.isArray(existingTT.laneEntries)?existingTT.laneEntries:[];
    } else if(existingTT&&(existingTT.laneEntries||[]).length) {
      // Roster exists but no times yet — merge: keep existing entries, add any new registrants
      const existingRegIds=new Set((existingTT.laneEntries||[]).map(e=>String(e.registrationId||'')).filter(Boolean));
      const newRegs=(meet.registrations||[]).filter(r=>!!r.options?.timeTrials&&!existingRegIds.has(String(r.id))).sort((a,b)=>Number(a.age||0)-Number(b.age||0));
      const merged=[...(existingTT.laneEntries||[]),...newRegs.map((reg,idx)=>({lane:(existingTT.laneEntries||[]).length+idx+1,registrationId:reg.id,helmetNumber:reg.helmetNumber,skaterName:reg.name,team:reg.team,age:reg.age,gender:reg.gender,place:'',time:'',status:''}))];
      ttEntries=merged;
    } else {
      // Fresh — build from registrations
      const ttRegs=(meet.registrations||[]).filter(r=>!!r.options?.timeTrials).sort((a,b)=>Number(a.age||0)-Number(b.age||0));
      ttEntries=ttRegs.map((reg,idx)=>({lane:idx+1,registrationId:reg.id,helmetNumber:reg.helmetNumber,skaterName:reg.name,team:reg.team,age:reg.age,gender:reg.gender,place:'',time:'',status:''}));
    }
    openRaces.push({
      id:existingTT?.id||('r'+crypto.randomBytes(6).toString('hex')),
      orderHint:9500,
      groupId:'tt_combined',groupLabel:'Time Trials — All Ages',ages:'0-99',
      division:'open',distanceLabel:ttDist,dayIndex:1,cost:0,
      stage:'final',heatNumber:0,parentRaceKey:'tt|combined',startType:'individual',countsForOverall:false,
      laneEntries:ttEntries,
      resultsMode:'times',status:existingTT?.status||'open',
      notes:String(existingTT?.notes||''),isFinal:true,closedAt:existingTT?.closedAt||'',
      isOpenRace:false,isQuadRace:false,isTimeTrial:true
    });
  }
  meet.races=[...nonOpenRaces,...openRaces]; meet.updatedAt=nowIso();
}

function generateQuadRacesForMeet(meet) {
  const nonQuadRaces=(meet.races||[]).filter(r=>!r.isQuadRace);
  const quadRaces=[]; let orderHint=8000;
  const laneCount=Math.max(1,Number(meet.lanes)||4);
  for(const qg of meet.quadGroups||[]) {
    if(!qg.enabled) continue;
    const distances=(qg.distances||[]).filter(Boolean);
    const qgRegs=(meet.registrations||[]).filter(r=>!!r.options?.quad&&getQuadGroupIdForReg(r)===qg.id);
    distances.forEach((distance,di)=>{
      const parentKey=`quad|${qg.id}|${distance}`;
      // Use same buildRaceSetForEntries logic as inline divisions
      const baseRace={
        id:'r'+crypto.randomBytes(6).toString('hex'),
        orderHint:orderHint++,
        groupId:qg.id,groupLabel:qg.label,ages:qg.ages,
        division:'quad',distanceLabel:distance,dayIndex:di+1,
        cost:Number(qg.cost||0),parentRaceKey:parentKey,
        startType:'standing',countsForOverall:true,
        laneEntries:[],resultsMode:'places',status:'open',
        notes:'',isFinal:false,closedAt:'',
        isOpenRace:false,isQuadRace:true
      };
      // Preserve existing race data
      const existingRaces=(meet.races||[]).filter(r=>r.isQuadRace&&r.groupId===qg.id&&r.distanceLabel===distance);
      if(existingRaces.length) {
        // Restore laneEntries and status from existing
        existingRaces.forEach(er=>{if(er.laneEntries?.length) baseRace.laneEntries=er.laneEntries;});
      }
      const raceSet=buildRaceSetForEntries(baseRace,qgRegs,laneCount);
      // Mark all as quad races
      raceSet.forEach(r=>{r.isQuadRace=true;r.isOpenRace=false;orderHint++;});
      quadRaces.push(...raceSet);
    });
  }
  meet.races=[...nonQuadRaces,...quadRaces]; meet.updatedAt=nowIso();
}

function getQuadGroupIdForReg(reg) {
  const groupId=String(reg.divisionGroupId||reg.originalDivisionGroupId||'');
  const groupIsFemale=groupId.includes('girls')||groupId.includes('women')||groupId.includes('ladies');
  const groupIsMale=groupId.includes('boys')||groupId.includes('men');
  const storedGender=String(reg.gender||'').toLowerCase();
  const genderFemale=storedGender==='female'||storedGender==='girls'||storedGender==='women';
  const isFemale=groupIsFemale?true:groupIsMale?false:genderFemale;
  const age=Number(reg.age||0);
  if(age<=9)  return isFemale?'quad_juv_girls':'quad_juv_boys';
  if(age<=13) return isFemale?'quad_fresh_girls':'quad_fresh_boys';
  if(age>=35) return isFemale?'quad_mast_ladies':'quad_mast_men';
  return isFemale?'quad_sr_ladies':'quad_sr_men';
}

function rebuildRaceAssignments(meet) {
  ensureRegistrationTotalsAndNumbers(meet);
  const laneCount=Math.max(1,Number(meet.lanes)||4);
  const originalBlocks=(meet.blocks||[]).map(block=>({...block,raceIds:[...(block.raceIds||[])]}));
  const baseRaces=(meet.races||[]).filter(r=>!r.isOpenRace&&!r.isQuadRace&&!r.isTimeTrial&&!r.isRelayRace&&!['heat','semi'].includes(String(r.stage||'')));
  const newRaces=[];
  for(const baseRace of baseRaces) {
    // Regular registrations for this group — always compute true age group from age/gender
    const matchingRegs=(meet.registrations||[]).filter(reg=>{
      if(!divisionEnabledForRegistration(reg,baseRace.division)) return false;
      const trueGroup=findAgeGroup(meet.groups,Number(reg.age||0),reg.gender||'boys');
      return trueGroup&&String(trueGroup.id)===String(baseRace.groupId||'');
    });
    // Challenge-up skaters — always compute from age/gender
    const SENIOR_IDS=['senior_men','senior_women'];
    const challengeUpRegs=baseRace.division==='elite'?(meet.registrations||[]).filter(reg=>{
      if(matchingRegs.find(r=>r.id===reg.id)) return false;
      if(!reg.options?.challengeUp || !reg.options?.elite) return false;
      const trueGroup=findAgeGroup(meet.groups,Number(reg.age||0),reg.gender||'boys');
      if(!trueGroup) return false;
      if(SENIOR_IDS.includes(trueGroup.id)) return false; // Seniors cannot challenge up
      const cuGroup=findChallengeUpGroup(meet.groups||[],trueGroup.id);
      return cuGroup && String(cuGroup.id)===String(baseRace.groupId||'');
    }):[];
    newRaces.push(...buildRaceSetForEntries(baseRace,[...matchingRegs,...challengeUpRegs],laneCount));
  }
  // getQuadGroupIdForReg is defined globally below
  const quadBaseRaces=(meet.races||[]).filter(r=>r.isQuadRace&&!['heat','semi'].includes(String(r.stage||'')));
  for(const baseRace of quadBaseRaces) {
    const matchingQuadRegs=(meet.registrations||[]).filter(reg=>
      !!reg.options?.quad && getQuadGroupIdForReg(reg)===baseRace.groupId
    );
    const raceSet=buildRaceSetForEntries(baseRace,matchingQuadRegs,laneCount);
    newRaces.push(...raceSet);
  }
  const openRaces=(meet.races||[]).filter(r=>r.isOpenRace||r.isTimeTrial||r.isRelayRace);
  newRaces.push(...openRaces);
  const mappedBlocks=originalBlocks.map(block=>{
    const nextRaceIds=[];
    for(const oldRid of block.raceIds||[]) {
      const oldRace=(meet.races||[]).find(r=>r.id===oldRid); if(!oldRace) continue;
      // Preserve open/TT/relay races as-is
      if(oldRace.isOpenRace||oldRace.isTimeTrial||oldRace.isRelayRace){
        if(!nextRaceIds.includes(oldRace.id)) nextRaceIds.push(oldRace.id); continue;
      }
      const parentKey=oldRace.parentRaceKey||baseRaceKey(oldRace.groupId,oldRace.division,oldRace.dayIndex,oldRace.distanceLabel);
      const replacements=newRaces.filter(r=>(r.parentRaceKey||'')===parentKey);
      for(const rep of replacements) if(!nextRaceIds.includes(rep.id)) nextRaceIds.push(rep.id);
    } return {...block,raceIds:nextRaceIds};
  });
  meet.races=newRaces; meet.blocks=mappedBlocks; meet.updatedAt=nowIso(); ensureCurrentRace(meet);
}

function buildCostWidget(base, addl, cap) {
  const html=[
    '<div class="card" style="background:#f8fafc;margin-top:8px">',
    '<div style="display:flex;justify-content:space-between;align-items:center">',
    '<div style="font-weight:700">Estimated Total</div>',
    '<div style="font-size:28px;font-weight:900;color:#F97316" id="ssm-cost">$'+base+'</div>',
    '</div>',
    '<div style="font-size:12px;color:#64748b;margin-top:4px" id="ssm-breakdown">Select events above</div>',
    '</div>',
    '<script>(function(){',
    'var BASE='+base+',ADDL='+addl+',CAP='+cap+';',
    'var KEYS=["novice","elite","open","quad","timeTrials","relays","skateability"];',
    'function upd(){',
    '  var count=KEYS.filter(function(k){var el=document.querySelector("[name="+k+"]");return el&&el.checked;}).length;',
    '  if(count===0){document.getElementById("ssm-cost").textContent="$"+BASE;document.getElementById("ssm-breakdown").textContent="Base entry fee";return;}',
    '  var total=BASE+(count>1?(count-1)*ADDL:0);',
    '  if(CAP>0&&total>CAP)total=CAP;',
    '  var lines=["1st event: $"+BASE];',
    '  if(count>1&&ADDL>0)lines.push("+"+(count-1)+" additional @ $"+ADDL+" ea");',
    '  else if(count>1&&ADDL===0)lines.push("+"+(count-1)+" additional events included");',
    '  if(CAP>0&&(BASE+(count>1?(count-1)*ADDL:0))>CAP)lines.push("(capped at $"+CAP+")");',
    '  document.getElementById("ssm-cost").textContent="$"+total;',
    '  document.getElementById("ssm-breakdown").textContent=lines.join(" | ");',
    '}',
    'document.addEventListener("change",upd);setTimeout(upd,300);',
    '})();</script>'
  ];
  return html.join("");
}

function calcRegistrationCost(meet, options) {
  const base=Number(meet.baseEntryFee||0);
  const addl=Number(meet.additionalEntryFee||0);
  const cap=Number(meet.entryCap||0);
  const eventKeys=['novice','elite','open','quad','timeTrials','relays','skateability'];
  const count=eventKeys.filter(k=>!!options[k]).length;
  if(count===0) return 0;
  let total=base+(count>1?(count-1)*addl:0);
  if(cap>0&&total>cap) total=cap;
  return total;
}

function racingSoonLabel(delta) {
  if(delta<=0) return 'NOW'; if(delta===1) return 'IN STAGING';
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
        <a class="nav-link" href="/about">About</a>
        <a class="nav-link" href="/help">Help</a>
        <a class="nav-link" href="/submit-meet">Submit a Meet</a>
        <a class="nav-link" href="/submit-rink">Submit a Rink</a>
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
    ['tt-builder','⏱ TT Builder',`/portal/meet/${meet.id}/tt-builder`],
    ['relay-builder','Relay Builder',`/portal/meet/${meet.id}/relay-builder`],
    ['blocks','Block Builder',`/portal/meet/${meet.id}/blocks`],
    ['registered','Registered',`/portal/meet/${meet.id}/registered`],
    ['checkin','Check-In',`/portal/meet/${meet.id}/checkin`],
    ['race-day','Race Day',`/portal/meet/${meet.id}/race-day/director`],
    ['results','Results',`/portal/meet/${meet.id}/results`],
    ['import','📥 Import',`/portal/meet/${meet.id}/import`],
  ];
  return `<div class="meet-tabs">${tabs.map(([key,label,href])=>`<a class="meet-tab${active===key?' active':''}" href="${href}">${label}</a>`).join('')}</div>`;
}
function pageShell({ title, bodyHtml, user, meet, activeTab, description }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} — SpeedSkateMeet</title>
  <meta name="description" content="${esc(description||'SpeedSkateMeet — The all-in-one platform for inline speed skating meets. Registration, heat assignments, live scoring, text alerts, and results.')}" />
  <meta name="keywords" content="inline speed skating, speed skating meet, inline skating competition, race management, heat assignments, skating results" />
  <meta property="og:title" content="${esc(title)} — SpeedSkateMeet" />
  <meta property="og:description" content="${esc(description||'SpeedSkateMeet — The all-in-one platform for inline speed skating meets.')}" />
  <meta property="og:url" content="https://speedskatemeet.com" />
  <meta property="og:type" content="website" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@400;500;600;700&family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
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
      background: linear-gradient(160deg, #eef2f7 0%, #e4eaf3 50%, #eef2f7 100%);
      background-attachment: fixed;
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
    .toggle-group { display: flex; flex-direction: column; gap: 6px; }
    .toggle-row   { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--off); border: 1px solid var(--border); }
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
    .group-pair-row  { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    @media(max-width: 900px) { .group-pair-row { grid-template-columns: 1fr; } }
    .group-pair-col  { background: #fff; border: 1.5px solid var(--border2); border-radius: var(--radius-lg); padding: 16px; }
    .group-pair-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid var(--border); }
    .group-pair-name { font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 700; color: var(--navy); }
    .group-pair-age  { font-size: 12px; color: var(--muted); font-weight: 600; }
    .group-pair-age-input { font-size: 12px; color: #64748b; font-weight: 600; border: none; border-bottom: 1px dashed #cbd5e1; background: transparent; padding: 1px 4px; width: 90px; cursor: text; }
    .group-pair-age-input:hover, .group-pair-age-input:focus { border-bottom-color: var(--orange); outline: none; color: var(--navy); }
    .group-div-card  { border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 10px; background: var(--off); }
    .group-div-card:last-child { margin-bottom: 0; }

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
    .race-item.tt-item    { border-color: #bae6fd; background: #f0f9ff; }
    .race-item.relay-item { border-color: #93c5fd; background: #eff6ff; }
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
    .announcer-box { background: var(--navy); color: #fff; border-radius: var(--radius-lg); padding: 32px; }
    .announcer-label { font-family:'Orbitron',sans-serif; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .18em; color: var(--orange); }
    .announcer-group { font-family: 'Orbitron',sans-serif; font-size: 38px; font-weight: 700; line-height: 1.15; margin-top: 10px; letter-spacing: -.5px; }
    .announcer-meta  { font-family: 'Barlow',sans-serif; font-size: 18px; font-weight: 500; opacity: .75; margin-top: 8px; letter-spacing: .02em; }
    .announcer-start { font-family: 'Barlow',sans-serif; font-size: 14px; opacity: .50; margin-top: 4px; }
    .announcer-divider { height: 1px; background: rgba(255,255,255,.12); margin: 20px 0; }
    .announcer-lanes-label { font-family:'Orbitron',sans-serif; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .18em; color: var(--sky); margin-bottom: 12px; }
    .announcer-lane { padding: 12px 0; border-top: 1px solid rgba(255,255,255,.08); }
    .announcer-lane-name   { font-family: 'Orbitron',sans-serif; font-size: 17px; font-weight: 700; letter-spacing: .01em; line-height: 1.3; }
    .announcer-lane-team   { font-family: 'Barlow',sans-serif; font-size: 14px; opacity: .65; margin-top: 2px; }
    .announcer-lane-sponsor{ font-family: 'Barlow',sans-serif; font-size: 13px; color: var(--sky); margin-top: 1px; }
    .announcer-empty { font-size: 15px; opacity: .5; padding-top: 10px; }

    /* ── Live board ───────────────────────────────────────────────── */
    /* ── Live Board ─────────────────────────────────────────────────── */
    .live-hero {
      background: linear-gradient(135deg, #0a1628 0%, #0F1F3D 60%, #0d2a4a 100%);
      border-radius: var(--radius-lg); padding: 32px 36px; margin-bottom: 20px; color: #fff;
      border: 1px solid rgba(249,115,22,.25); position: relative; overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,.4);
    }
    .live-hero::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, var(--orange), #fbbf24, var(--orange));
    }
    .live-meet-name {
      font-family: 'Orbitron',sans-serif; font-size: 13px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.6); margin-bottom: 16px;
    }
    .live-status-grid { display: grid; grid-template-columns: 1fr 1px 1fr; gap: 0; }
    .live-status-divider { background: rgba(255,255,255,.12); margin: 0 28px; }
    .live-race-label {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .15em;
      color: var(--orange); margin-bottom: 6px;
    }
    .live-race-name {
      font-family: 'Orbitron',sans-serif; font-size: 36px; font-weight: 900;
      line-height: 1.1; color: #fff; margin-bottom: 4px;
    }
    .live-race-sub { font-size: 15px; color: rgba(255,255,255,.55); font-weight: 500; margin-top: 4px; }
    .live-race-counter {
      display: inline-block; background: rgba(249,115,22,.2); border: 1px solid rgba(249,115,22,.4);
      color: var(--orange); font-size: 12px; font-weight: 700; padding: 2px 10px;
      border-radius: 20px; margin-top: 8px; letter-spacing: .05em;
    }
    /* Lane cards */
    .live-lane-grid { display: flex; flex-direction: column; gap: 8px; }
    .live-lane-card {
      display: grid; grid-template-columns: 48px 52px 1fr auto auto;
      align-items: center; gap: 12px;
      background: #f8fafc; border: 1.5px solid var(--border);
      border-radius: 10px; padding: 12px 16px;
      transition: background .15s;
    }
    .live-lane-card.has-place { background: #fff; border-color: var(--orange); }
    .live-lane-num {
      font-family: 'Orbitron',sans-serif; font-size: 22px; font-weight: 900;
      color: var(--navy); text-align: center; line-height: 1;
    }
    .live-helmet {
      font-family: 'Barlow Condensed',sans-serif; font-size: 16px; font-weight: 700;
      color: #fff; background: var(--navy); border-radius: 6px;
      padding: 4px 8px; text-align: center; line-height: 1.2;
    }
    .live-skater-name {
      font-family: 'Barlow Condensed',sans-serif; font-size: 22px; font-weight: 800;
      color: var(--navy); line-height: 1.1;
    }
    .live-skater-team { font-size: 12px; color: var(--muted); margin-top: 1px; }
    .live-result {
      font-family: 'Orbitron',sans-serif; font-size: 20px; font-weight: 900;
      color: var(--orange); min-width: 48px; text-align: right;
    }
    .live-status-badge {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
      padding: 3px 9px; border-radius: 20px; white-space: nowrap;
      background: #e2e8f0; color: #64748b;
    }
    .live-status-badge.ready { background: #dcfce7; color: #15803d; }
    .live-status-badge.dns { background: #fee2e2; color: #991b1b; }
    /* Recent results */
    .recent-race-block { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
    .recent-race-block:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .recent-race-title {
      font-family: 'Barlow Condensed',sans-serif; font-size: 17px; font-weight: 800;
      color: var(--navy); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em;
    }
    .recent-place-row { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
    .recent-medal { font-size: 20px; width: 28px; text-align: center; flex-shrink: 0; }
    .recent-place-num {
      font-family: 'Barlow Condensed',sans-serif; font-size: 18px; font-weight: 900;
      color: var(--muted); width: 28px; text-align: center; flex-shrink: 0;
    }
    .recent-name {
      font-family: 'Barlow Condensed',sans-serif; font-size: 18px; font-weight: 700; color: var(--navy);
    }
    .recent-team { font-size: 12px; color: var(--muted); }

    /* ── Homepage hero ────────────────────────────────────────────── */
    .hero {
      position: relative; border-radius: var(--radius-lg); overflow: hidden;
      min-height: 360px; display: flex; align-items: flex-end;
      background: var(--navy); margin-bottom: 28px; box-shadow: var(--shadow-lg);
    }
    .hero.hero-centered { min-height: 0; height: auto; align-items: center; justify-content: center; padding: 0; }
    .hero-centered { align-items: center; justify-content: center; height: auto !important; min-height: 0 !important; padding: 0 !important; }
    .hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center top; opacity: .40; }
    .hero-gradient { position: absolute; inset: 0; background: linear-gradient(to top, rgba(15,31,61,.95) 40%, rgba(15,31,61,.20) 100%); }
    .hero-content { position: relative; z-index: 1; padding: 36px; }
    .hero-content-centered { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; width: 100%; }
    .hero-logo { height: auto; width: 700px; max-width: 88vw; display: block; filter: drop-shadow(0 6px 32px rgba(0,0,0,.6)); flex-shrink: 0; }
    .hero-eyebrow { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .15em; color: var(--orange); margin-bottom: 8px; }
    .hero-title { font-family: 'Barlow Condensed',sans-serif; font-size: 64px; font-weight: 900; line-height: .95; letter-spacing: -1px; color: #fff; }
    .hero-title span { color: var(--orange); }
    .hero-sub { font-size: 17px; color: rgba(255,255,255,.80); margin-top: 12px; max-width: 520px; }
    .hero-actions { display: flex; gap: 12px; margin-top: 22px; flex-wrap: wrap; }
    .hero-actions-centered { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; justify-content: center; }
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
    .tb-badge { display:inline-block; font-size:10px; font-weight:700; padding:2px 6px; border-radius:999px; background:#fef9c3; color:#92400e; border:1px solid #fde68a; margin-left:5px; vertical-align:middle; }
    .tb-badge.tb-runoff { background:#fee2e2; color:#991b1b; border-color:#fca5a5; }
    .runoff-row td { background:#fff7ed; }
    .hidden    { display: none !important; }
    .text-orange { color: var(--orange); }
    .text-sky    { color: var(--sky2); }
    .text-navy   { color: var(--navy); }
    .bold { font-weight: 700; }
    .checkin-row {}
    .filters-row { display: grid; grid-template-columns: 1.2fr .8fr .8fr; gap: 10px; }
    @media(max-width:700px){.filters-row{grid-template-columns:1fr;}}
    .footer-note { font-size: 11px; color: var(--muted); margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--border); }
    .live-tabs { display:flex; gap:8px; margin-bottom:18px; flex-wrap:wrap; }
    .live-tab { padding:10px 18px; border-radius:var(--radius-sm); font-weight:700; font-size:14px; border:1.5px solid var(--border2); color:var(--navy); background:#fff; text-decoration:none; }
    .live-tab:hover { background:var(--off); color:var(--navy); }
    .live-tab.active { background:var(--navy); color:#fff; border-color:var(--navy); }
  </style>
</head>
<body>
  ${navHtml(user)}
  <div class="wrap">
    ${meetTabs(meet, activeTab)}
    ${bodyHtml}
  </div>
</body>
</html>`;
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
  res.send(pageShell({ title:'Home', description:'SpeedSkateMeet is the all-in-one platform for inline speed skating meets. Registration, heat assignments, live scoring, TV display, and text alerts for parents.', user:data?.user||null, bodyHtml:`
    <div class="hero hero-centered">
      <img class="hero-img" src="/public/images/home/hero-banner.jpg" alt="" />
      <div class="hero-gradient"></div>
      <div class="hero-content-centered" style="padding:20px 20px 24px">
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
  const pending=(req.db.pendingMeets||[]).filter(p=>p.status==='pending');
  const approved=(req.db.pendingMeets||[]).filter(p=>p.status==='approved').slice(-10);
  const rejected=(req.db.pendingMeets||[]).filter(p=>p.status==='rejected').slice(-10);

  const pendingRows=pending.map(p=>`
    <div class="card" style="margin-bottom:14px;border-left:4px solid var(--orange)">
      <div class="row between" style="margin-bottom:8px">
        <div>
          <h2 style="margin:0">${esc(p.meetName)}</h2>
          <div class="note">${esc(p.city)}, ${esc(p.state)} • ${esc(p.date)}</div>
        </div>
        <span class="chip chip-orange">Pending Review</span>
      </div>
      <div class="grid-2" style="margin-bottom:12px">
        <div><div class="note"><strong>Contact:</strong> ${esc(p.contactName)}</div>
          <div class="note">${esc(p.contactEmail)}${p.contactPhone?' • '+esc(p.contactPhone):''}</div></div>
        <div>${p.registrationUrl?`<div class="note"><strong>Reg URL:</strong> <a href="${esc(p.registrationUrl)}" target="_blank" style="color:var(--orange)">View →</a></div>`:''}</div>
      </div>
      ${p.description?`<div class="note" style="margin-bottom:12px">${esc(p.description)}</div>`:''}
      <div class="action-row">
        <form method="POST" action="/portal/pending-meets/approve" style="display:inline">
          <input type="hidden" name="id" value="${esc(p.id)}" />
          <button class="btn-orange" type="submit">✅ Approve</button>
        </form>
        <form method="POST" action="/portal/pending-meets/reject" style="display:inline">
          <input type="hidden" name="id" value="${esc(p.id)}" />
          <input name="reason" placeholder="Reason (optional, emailed to submitter)" style="width:260px" />
          <button class="btn-danger" type="submit">❌ Reject</button>
        </form>
      </div>
    </div>`).join('');

  res.send(pageShell({title:'Pending Meets',user:req.user, bodyHtml:`
    <div class="page-header"><h1>Pending Meets</h1><div class="sub">Review and approve meet submissions.</div></div>
    <div class="action-row" style="margin-bottom:20px">
      <a class="btn2" href="/portal">← Portal</a>
    </div>
    ${pending.length?`<h2 style="margin-bottom:12px">⏳ Awaiting Review (${pending.length})</h2>${pendingRows}`:`<div class="card"><div class="muted">No pending submissions. 🎉</div></div>`}
    ${approved.length?`<div class="spacer"></div><h2 style="margin-bottom:12px;color:var(--green)">✅ Recently Approved</h2>
      ${approved.map(p=>`<div class="card" style="margin-bottom:8px;opacity:.7"><div class="row between"><div><strong>${esc(p.meetName)}</strong> — ${esc(p.city)}, ${esc(p.state)} • ${esc(p.date)}</div><span class="chip chip-green">Approved</span></div></div>`).join('')}`:''}
    ${rejected.length?`<div class="spacer"></div><h2 style="margin-bottom:12px;color:var(--muted)">❌ Recently Rejected</h2>
      ${rejected.map(p=>`<div class="card" style="margin-bottom:8px;opacity:.7"><div class="row between"><div><strong>${esc(p.meetName)}</strong> — ${esc(p.city)}, ${esc(p.state)} • ${esc(p.date)}</div><span class="chip">Rejected</span></div></div>`).join('')}`:''}
  `}));
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


// ── About Page ────────────────────────────────────────────────────────────────
app.get('/about', (req, res) => {
  const data=getSessionUser(req);
  res.send(pageShell({title:'About', description:'SpeedSkateMeet was built by a skater for the skating community. Learn about our platform for inline speed skating meet management, live scoring, and race day tools.', user:data?.user||null, bodyHtml:`
    <div class="page-header">
      <h1>About SpeedSkateMeet</h1>
      <div class="sub">Built by a skater, for the skating community.</div>
    </div>

    <div class="grid-2" style="margin-bottom:24px">
      <div class="card">
        <h2>The Story</h2>
        <p style="line-height:1.7;color:var(--text)">SpeedSkateMeet was built out of frustration. Anyone who has ever run an inline speed skating meet knows the chaos — spreadsheets flying around, handwritten heat sheets, parents asking "when does my kid race?" every five minutes, and a whiteboard that nobody can read from the stands.</p>
        <p style="line-height:1.7;color:var(--text);margin-top:12px">So we built the platform we always wished existed. One place to build your meet, manage registrations, run race day, display live results on a TV, and keep parents in the loop with text alerts — all from your phone or laptop.</p>
        <p style="line-height:1.7;color:var(--text);margin-top:12px">SpeedSkateMeet is built and maintained by Lee Bird out of Wichita, Kansas. Lee has been involved in inline speed skating for years and built this platform from the ground up specifically for the inline community.</p>
      </div>
      <div class="card">
        <h2>What It Does</h2>
        <div class="stack">
          <div class="toggle-row"><div><div class="toggle-row-label">🏗️ Meet Builder</div><div class="toggle-row-desc">Set up divisions, distances, costs, and registration — all in one place. Inline, Open, Quad, Time Trial, and Relay support.</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">🧱 Block Builder</div><div class="toggle-row-desc">Drag and drop races into blocks. Add breaks, lunch, and awards. Print your race list in one click.</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">🏁 Race Day</div><div class="toggle-row-desc">Director, judges, and announcer panels. Live scoreboard. TV display for AirPlay. Text alerts for parents.</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">📊 Standings</div><div class="toggle-row-desc">Automatic points, tiebreaker support (D2 and SR832), and real-time standings updated as races close.</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">📲 Text Alerts</div><div class="toggle-row-desc">Parents sign up and get a text when their skater is 2 races away, in staging, and when results post.</div></div></div>
        </div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:24px">
      <div class="card">
        <h2>Who It's For</h2>
        <div class="stack">
          <div class="toggle-row"><div><div class="toggle-row-label">🎯 Meet Directors</div><div class="toggle-row-desc">Run your entire meet from one platform. No more spreadsheets, no more whiteboard standings.</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">🛡️ Judges</div><div class="toggle-row-desc">Clean, simple judges panel. Post times and places, close races, move on. Works great on a tablet.</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">📣 Announcers</div><div class="toggle-row-desc">Full skater info, team names, coming up next — everything you need to keep the crowd engaged.</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">🏋️ Coaches</div><div class="toggle-row-desc">See your team's upcoming races, lane assignments, recent results, and standings — all in one panel.</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">👨‍👩‍👧 Parents</div><div class="toggle-row-desc">Follow along on the live board or sign up for text alerts so you never miss your skater's race.</div></div></div>
        </div>
      </div>
      <div class="card">
        <h2>Get Involved</h2>
        <p style="line-height:1.7;color:var(--text);margin-bottom:16px">SpeedSkateMeet is growing. If you run meets and want to get your club on the platform, submit your meet and we'll get you set up.</p>
        <div class="stack">
          <a class="btn-orange" href="/submit-meet">Submit Your Meet</a>
          <a class="btn2" href="/meets">Find a Meet</a>
          <a class="btn2" href="/help">Help & FAQ</a>
        </div>
        <div class="hr"></div>
        <p style="line-height:1.7;color:var(--text);margin-bottom:8px">Questions? Feedback? Want to get your club set up with full race management?</p>
        <a href="mailto:LBird@speedskatemeet.com" style="color:var(--orange);font-weight:700">LBird@speedskatemeet.com</a>
      </div>
    </div>
  `}));
});

// ── Help & FAQ Page ───────────────────────────────────────────────────────────
app.get('/help', (req, res) => {
  const data=getSessionUser(req);
  const isPortal=data?.user&&(hasRole(data.user,'meet_director')||hasRole(data.user,'super_admin'));
  res.send(pageShell({title:'Help & FAQ', description:'Complete guide to running an inline speed skating meet on SpeedSkateMeet. Learn about meet builder, block builder, race day, text alerts, scoring, and more.', user:data?.user||null, bodyHtml:`
    <div class="page-header">
      <h1>Help & FAQ</h1>
      <div class="sub">Everything you need to know about running a meet on SpeedSkateMeet.</div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <a href="#getting-started" class="chip" style="text-decoration:none">Getting Started</a>
        <a href="#meet-builder" class="chip" style="text-decoration:none">Meet Builder</a>
        <a href="#builders" class="chip" style="text-decoration:none">Open/Quad/TT/Relay</a>
        <a href="#block-builder" class="chip" style="text-decoration:none">Block Builder</a>
        <a href="#registration" class="chip" style="text-decoration:none">Registration</a>
        <a href="#race-day" class="chip" style="text-decoration:none">Race Day</a>
        <a href="#text-alerts" class="chip" style="text-decoration:none">Text Alerts</a>
        <a href="#coach" class="chip" style="text-decoration:none">Coach Portal</a>
        <a href="#scoring" class="chip" style="text-decoration:none">Scoring</a>
      </div>
    </div>

    <!-- Getting Started -->
    <div class="card" style="margin-bottom:16px" id="getting-started">
      <h2 style="margin-bottom:16px">🚀 Getting Started</h2>
      <div class="stack">
        <div><h3>What is SpeedSkateMeet?</h3><p style="line-height:1.7;color:var(--text)">SpeedSkateMeet is an all-in-one platform for running inline speed skating meets. It handles registration, heat assignments, race day management, live scoring, text alerts, and results — all from your browser.</p></div>
        <div class="hr"></div>
        <div><h3>How do I get a meet director account?</h3><p style="line-height:1.7;color:var(--text)">Contact Lee at <a href="mailto:LBird@speedskatemeet.com" style="color:var(--orange)">LBird@speedskatemeet.com</a> or submit your meet at <a href="/submit-meet" style="color:var(--orange)">/submit-meet</a>. Once your listing is approved we'll reach out to get you fully set up.</p></div>
        <div class="hr"></div>
        <div><h3>What's the recommended workflow for a new meet?</h3>
          <ol style="line-height:2;color:var(--text);padding-left:20px">
            <li>Meet Builder — set up divisions, distances, and open registration</li>
            <li>Open/Quad/Relay Builders — enable any special race types</li>
            <li>Skaters register publicly (or you register them in the portal)</li>
            <li>Block Builder → Generate Blocks — create your race schedule</li>
            <li>Block Builder — drag races into blocks, add breaks and lunch</li>
            <li>Check-In — mark who showed up on race day</li>
            <li>Block Builder → Rebuild — rebalance heats with actual attendees</li>
            <li>Race Day → Director panel — run the meet</li>
          </ol>
        </div>
      </div>
    </div>

    <!-- Meet Builder -->
    <div class="card" style="margin-bottom:16px" id="meet-builder">
      <h2 style="margin-bottom:16px">🏗️ Meet Builder</h2>
      <div class="stack">
        <div><h3>What does "Save Meet" do?</h3><p style="line-height:1.7;color:var(--text)">Save Meet saves all your settings — name, date, venue, distances, toggles — without touching your races or block assignments. Use this whenever you update meet details.</p></div>
        <div class="hr"></div>
        <div><h3>What does "Generate Blocks ⚠️" do in Block Builder?</h3><p style="line-height:1.7;color:var(--text)">Generate Blocks creates all races from your division settings. It will clear your existing block assignments, so only run it when you're ready to start fresh. It shows a confirmation dialog before doing anything.</p></div>
        <div class="hr"></div>
        <div><h3>What does "Rebuild Assignments" do?</h3><p style="line-height:1.7;color:var(--text)">Rebuild re-splits heats and reassigns lanes based on current registrations, while preserving your block structure. Use this after check-in to rebalance heats with skaters who actually showed up. It also automatically distributes skaters from the same team across different heats.</p></div>
        <div class="hr"></div>
        <div><h3>What are D1, D2, D3?</h3><p style="line-height:1.7;color:var(--text)">D1, D2, and D3 are the three distance races per division per day — short, middle, and long. For example: 300m, 500m, 1000m. All three count toward overall standings points.</p></div>
        <div class="hr"></div>
        <div><h3>What's the difference between Novice and Elite?</h3><p style="line-height:1.7;color:var(--text)">Novice and Elite are skill-based classes within each age group. They race separately and have separate standings. Skaters self-select their class when registering, or the director assigns it.</p></div>
        <div class="hr"></div>
        <div><h3>What is "Challenge Up"?</h3><p style="line-height:1.7;color:var(--text)">Challenge Up allows a skater to race in a higher age division than their own. It's optional and the director controls whether it's available for their meet.</p></div>
        <div class="hr"></div>
        <div><h3>What is the Tiebreaker setting?</h3><p style="line-height:1.7;color:var(--text)">When two skaters are tied on total points, the tiebreaker determines the winner. D2 (default) uses the skater's place in the middle distance race. SR832 uses the full USARS SR832 formula with weighted scores across all three distances.</p></div>
      </div>
    </div>

    <!-- Open/Quad/TT/Relay -->
    <div class="card" style="margin-bottom:16px" id="builders">
      <h2 style="margin-bottom:16px">🏁 Open, Quad, Time Trial & Relay Builders</h2>
      <div class="stack">
        <div><h3>What is an Open race?</h3><p style="line-height:1.7;color:var(--text)">Open races are rolling-start pack finals with no lane cap. Any number of skaters can enter. Results are placement only — no points toward overall inline standings. Great for exhibition races or open divisions.</p></div>
        <div class="hr"></div>
        <div><h3>What is a Quad race?</h3><p style="line-height:1.7;color:var(--text)">Quad races are for quad skates (4-wheel inline). They use 30/20/10/5 point scoring and have their own separate standings bucket. Heat splitting works the same as inline.</p></div>
        <div class="hr"></div>
        <div><h3>What is a Time Trial?</h3><p style="line-height:1.7;color:var(--text)">Time Trials are individual races against the clock. Skaters go one at a time, judges post their time, and the system auto-sorts by fastest time. No lanes — judges just post times as skaters finish. Results show a live top 3 leaderboard.</p></div>
        <div class="hr"></div>
        <div><h3>What is a Relay race?</h3><p style="line-height:1.7;color:var(--text)">Relay races are fully manual — the director creates the race with a name and distance, and judges fill in team names, skater names, and places on race day. Relay results show in their own section and don't count toward individual standings.</p></div>
      </div>
    </div>

    <!-- Block Builder -->
    <div class="card" style="margin-bottom:16px" id="block-builder">
      <h2 style="margin-bottom:16px">🧱 Block Builder</h2>
      <div class="stack">
        <div><h3>How do I build my race schedule?</h3><p style="line-height:1.7;color:var(--text)">Click "Generate Blocks" to create all races from your division settings. Then click "+ Add Race Block" to create blocks (groups of races). Drag races from the Unassigned pile on the right into your blocks. Add dividers like Break, Lunch, Awards, and Practice between blocks.</p></div>
        <div class="hr"></div>
        <div><h3>What are the colored tags on races?</h3><p style="line-height:1.7;color:var(--text)">🏁 Orange = Open race. 🛼 Purple = Quad race. ⏱ Blue = Time Trial. 🔄 Blue = Relay. Plain white = standard inline race.</p></div>
        <div class="hr"></div>
        <div><h3>How do I print the race list?</h3><p style="line-height:1.7;color:var(--text)">Click "Print Race List" in the Block Builder toolbar. It opens a clean printable page with all blocks, dividers, and lane assignments. Use your browser's print function (Cmd+P on Mac).</p></div>
        <div class="hr"></div>
        <div><h3>What does "Rebuild" do in Block Builder?</h3><p style="line-height:1.7;color:var(--text)">Rebuild re-splits heats based on current check-ins and reassigns lanes. Your block structure is preserved — races stay in their blocks, only the lane assignments inside each race update. Always confirm after check-in closes before starting race day.</p></div>
      </div>
    </div>

    <!-- Registration -->
    <div class="card" style="margin-bottom:16px" id="registration">
      <h2 style="margin-bottom:16px">📋 Registration & Check-In</h2>
      <div class="stack">
        <div><h3>How do skaters register?</h3><p style="line-height:1.7;color:var(--text)">Once you publish your meet, a public registration page is available at speedskatemeet.com/meet/[id]/register. Share that link with your skaters. Directors can also register skaters manually from the Registered tab in the portal.</p></div>
        <div class="hr"></div>
        <div><h3>How does USARS age work?</h3><p style="line-height:1.7;color:var(--text)">The system uses the USARS SR150.1 rule — a skater's competitive age is calculated as the meet year minus their birth year (January 1 cutoff). So a skater born in 2015 competing in a 2026 meet is age 11, regardless of whether they've had their birthday yet.</p></div>
        <div class="hr"></div>
        <div><h3>Do I have to use Check-In?</h3><p style="line-height:1.7;color:var(--text)">No — Check-In is completely optional. You can go straight from Block Builder to Race Day and everything works fine. All registered skaters appear in the judges panel regardless. Check-In is only useful if you want to Rebuild heats after no-shows — it lets the system rebalance with only skaters who actually showed up. If you skip it, empty lanes just get skipped by the judge on race day.</p></div>
        <div class="hr"></div>
        <div><h3>How do I check in skaters on race day?</h3><p style="line-height:1.7;color:var(--text)">Go to the Check-In tab. Find each skater as they arrive and toggle them as checked in. After check-in closes, go to Block Builder and hit Rebuild to rebalance heats with actual attendees.</p></div>
        <div class="hr"></div>
        <div><h3>How do helmet numbers work?</h3><p style="line-height:1.7;color:var(--text)">Helmet numbers are assigned in the Registered tab. You can assign them individually or use the auto-assign button which numbers skaters sequentially. Numbers show on the judges panel, live board, coach panel, and text alerts.</p></div>
      </div>
    </div>

    <!-- Race Day -->
    <div class="card" style="margin-bottom:16px" id="race-day">
      <h2 style="margin-bottom:16px">🏁 Race Day</h2>
      <div class="stack">
        <div><h3>What are the Race Day sub-tabs?</h3>
          <ul style="line-height:2;color:var(--text);padding-left:20px">
            <li><strong>Director</strong> — advance races, set current race, pause/resume, open TV display</li>
            <li><strong>Judges</strong> — post times and places, close races</li>
            <li><strong>Announcer</strong> — clean view of current race with full skater info for the PA</li>
            <li><strong>Live View</strong> — public scoreboard, same as what parents see</li>
          </ul>
        </div>
        <div class="hr"></div>
        <div><h3>How do I advance to the next race?</h3><p style="line-height:1.7;color:var(--text)">On the Director panel, click "Next →" to move to the next race. You can also use the dropdown to jump to any race directly. The judges panel always shows the current race automatically.</p></div>
        <div class="hr"></div>
        <div><h3>How do judges post results?</h3><p style="line-height:1.7;color:var(--text)">On the Judges panel, enter places (and times for TT) for each lane. Click "Save" to save without closing, or "Close Race" to finalize the result and trigger text alerts to parents.</p></div>
        <div class="hr"></div>
        <div><h3>How do I set up the TV display?</h3><p style="line-height:1.7;color:var(--text)">On the Director panel, click "📺 TV Display" to open the full-screen scoreboard in a new tab. On your iPad or Mac, use AirPlay to mirror that tab to your Apple TV. The display auto-refreshes every 4 seconds.</p></div>
        <div class="hr"></div>
        <div><h3>What does "Unlock Race" do?</h3><p style="line-height:1.7;color:var(--text)">If a race was closed by mistake, the director can unlock it to re-open it for editing. The race goes back to open status and the director panel moves back to that race.</p></div>
        <div class="hr"></div>
        <div><h3>What is "In Staging"?</h3><p style="line-height:1.7;color:var(--text)">In Staging means the skater is one race away — they should be at the staging area right now getting ready. The system sends a text alert when a skater hits In Staging so parents and coaches know to get them to the line.</p></div>
      </div>
    </div>

    <!-- Text Alerts -->
    <div class="card" style="margin-bottom:16px" id="text-alerts">
      <h2 style="margin-bottom:16px">📲 Text Alerts</h2>
      <div class="stack">
        <div><h3>How do parents sign up for text alerts?</h3><p style="line-height:1.7;color:var(--text)">On the public meet page, click the "📲 Text Alerts" tab. Select the skater from the dropdown (type to search by name), enter a cell phone number, and click Sign Me Up. A confirmation text fires immediately.</p></div>
        <div class="hr"></div>
        <div><h3>What texts do parents receive?</h3>
          <ul style="line-height:2;color:var(--text);padding-left:20px">
            <li><strong>2 Races Away</strong> — heads up, start making your way to the track</li>
            <li><strong>In Staging</strong> — skater should be at the line right now, includes lane number</li>
            <li><strong>Result Posted</strong> — place, points earned, and total points for the day</li>
          </ul>
        </div>
        <div class="hr"></div>
        <div><h3>How do I unsubscribe from texts?</h3><p style="line-height:1.7;color:var(--text)">Reply STOP to any text message. Twilio handles unsubscribes automatically.</p></div>
        <div class="hr"></div>
        <div><h3>When do text alerts fire?</h3><p style="line-height:1.7;color:var(--text)">Alerts fire automatically when the director advances the race using the Next button. Result alerts fire when a judge clicks "Close Race". No manual action needed from the director.</p></div>
      </div>
    </div>

    <!-- Coach Portal -->
    <div class="card" style="margin-bottom:16px" id="coach">
      <h2 style="margin-bottom:16px">🏋️ Coach Portal</h2>
      <div class="stack">
        <div><h3>How does the Coach Portal work?</h3><p style="line-height:1.7;color:var(--text)">Coaches log in and see a portal specific to their team. They can see all meets their skaters are registered for, upcoming races with lane assignments, recent results, and team standings.</p></div>
        <div class="hr"></div>
        <div><h3>How does the system know which skaters are on my team?</h3><p style="line-height:1.7;color:var(--text)">The coach account has a team name assigned to it. Any skater registered with that same team name will appear in the coach's panel automatically.</p></div>
        <div class="hr"></div>
        <div><h3>What does "Racing Soon" show?</h3><p style="line-height:1.7;color:var(--text)">Racing Soon shows your team's upcoming races in order, color-coded by urgency — orange for the current race, red for In Staging, yellow for 2 races away. Lane numbers are shown for each skater. The panel auto-refreshes every 8 seconds during race day.</p></div>
      </div>
    </div>

    <!-- Scoring -->
    <div class="card" style="margin-bottom:16px" id="scoring">
      <h2 style="margin-bottom:16px">📊 Scoring & Standings</h2>
      <div class="stack">
        <div><h3>How are points awarded?</h3>
          <p style="line-height:1.7;color:var(--text)">Standard USARS inline points:</p>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px;text-align:center">
            ${[['🥇 1st','30'],['🥈 2nd','20'],['🥉 3rd','15'],['4th','10'],['5th','7']].map(([p,pts])=>`<div class="card" style="padding:10px"><div style="font-size:18px">${p}</div><div style="font-weight:700;color:var(--orange)">${pts} pts</div></div>`).join('')}
          </div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:8px;text-align:center">
            ${[['6th','5'],['7th','4'],['8th','3'],['9th','2'],['10th','1']].map(([p,pts])=>`<div class="card" style="padding:10px"><div style="font-size:14px">${p}</div><div style="font-weight:700;color:var(--orange)">${pts} pts</div></div>`).join('')}
          </div>
        </div>
        <div class="hr"></div>
        <div><h3>What counts toward overall standings?</h3><p style="line-height:1.7;color:var(--text)">Only standard inline races (D1, D2, D3) count toward overall standings. Open races, Quad races, Time Trials, and Relay races are all placement-only and have their own separate results sections.</p></div>
        <div class="hr"></div>
        <div><h3>How does the D2 tiebreaker work?</h3><p style="line-height:1.7;color:var(--text)">When two skaters are tied on total points, the system looks at their place in the D2 (middle distance) race. The skater who placed higher in D2 wins the tiebreaker. This is the default and most commonly used method at local meets.</p></div>
        <div class="hr"></div>
        <div><h3>How does the SR832 tiebreaker work?</h3><p style="line-height:1.7;color:var(--text)">SR832 is the full USARS tiebreaker formula. It assigns weighted scores to each place across all three distance races, with different weights for short, middle, and long distances. The skater with the higher weighted total wins. Enable SR832 in Meet Builder under Tiebreaker Settings.</p></div>
        <div class="hr"></div>
        <div><h3>What does the TB badge mean on standings?</h3><p style="line-height:1.7;color:var(--text)">The TB (Tiebreaker) badge on the results page means two or more skaters were tied on points and the tiebreaker was used to determine final placement. If skaters are still tied after the tiebreaker, a run-off race is required.</p></div>
      </div>
    </div>

    <div class="card" style="text-align:center">
      <h2 style="margin-bottom:8px">Still have questions?</h2>
      <p style="color:var(--muted);margin-bottom:16px">Reach out directly — happy to help.</p>
      <a href="mailto:LBird@speedskatemeet.com" class="btn-orange">Email Lee →</a>
    </div>
  `}));
});

app.get('/meets', (req, res) => {
  const db=loadDb(); const data=getSessionUser(req);
  const cards=(db.meets||[]).filter(m=>m.isPublic).map(m=>{
    const rink=db.rinks.find(r=>Number(r.id)===Number(m.rinkId));
    const dateStr=(()=>{
      const fmt=d=>{if(!d)return'';const [y,mo,dy]=d.split('-');const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return months[Number(mo)-1]+' '+Number(dy)+', '+y;};
      const s=m.date||''; const e=m.endDate||'';
      if(!s) return 'Date TBD';
      if(!e||e===s) return fmt(s);
      const [sy,sm]=s.split('-'); const [ey,em,ed]=e.split('-');
      if(sy===ey&&sm===em) return fmt(s).replace(/, \d{4}$/,'')+'-'+Number(ed)+', '+sy;
      return fmt(s)+' – '+fmt(e);
    })();
    const raceCount=(m.races||[]).length;
    const regCount=(m.registrations||[]).length;
    return `
      <div style="max-width:680px;margin:0 auto 20px;background:#fff;border-radius:16px;box-shadow:0 2px 16px rgba(0,0,0,.08);border:1px solid var(--border);overflow:hidden">
        <div style="background:linear-gradient(135deg,#0F1F3D 0%,#0d2a4a 100%);padding:24px 28px;position:relative">
          <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--orange),#fbbf24,var(--orange))"></div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div>
              <div style="font-family:'Orbitron',sans-serif;font-size:18px;font-weight:900;color:#fff;line-height:1.2;margin-bottom:10px">${esc(m.meetName)}</div>
              <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:rgba(255,255,255,.7)">
                <span>📅 ${esc(dateStr)}</span>
                ${m.startTime?`<span>🕓 ${esc(formatTime(m.startTime))}</span>`:''}
                ${rink?`<span>📍 ${esc(rink.name)} • ${esc(rink.city)}, ${esc(rink.state)}</span>`:''}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
              ${raceCount?`<span style="background:rgba(249,115,22,.2);border:1px solid rgba(249,115,22,.4);color:var(--orange);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap">${raceCount} Races</span>`:''}
              ${regCount?`<span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.7);font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;white-space:nowrap">${regCount} Registered</span>`:''}
            </div>
          </div>
        </div>
        <div style="padding:18px 28px;display:flex;gap:10px;align-items:center;border-top:1px solid var(--border)">
          <a class="btn-orange" href="/meet/${m.id}/register" style="font-size:14px;padding:8px 20px">🏁 Register Now</a>
          <a class="btn2" href="/meet/${m.id}/live" style="font-size:14px;padding:8px 16px">📡 Live</a>
          <a class="btn2" href="/meet/${m.id}/results" style="font-size:14px;padding:8px 16px">🏆 Results</a>
        </div>
      </div>`;
  }).join('');
  res.send(pageShell({title:'Find a Meet', description:'Find upcoming inline speed skating meets near you. View schedules, register online, and follow live results on race day.', user:data?.user||null, bodyHtml:`
    <div style="max-width:680px;margin:0 auto 24px;background:linear-gradient(135deg,#0F1F3D 0%,#0d2a4a 100%);border-radius:16px;padding:28px 32px;position:relative;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.15)">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--orange),#fbbf24,var(--orange))"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px">
        <div>
          <div style="font-family:'Orbitron',sans-serif;font-size:22px;font-weight:900;color:#fff;margin-bottom:4px">Find a Meet</div>
          <div style="color:rgba(255,255,255,.55);font-size:13px">Upcoming inline speed skating meets open for registration</div>
        </div>
        <a class="btn-orange" href="/submit-meet" style="white-space:nowrap;flex-shrink:0;font-size:13px">+ Submit Your Meet</a>
      </div>
    </div>
    ${cards||`<div style="max-width:680px;margin:0 auto"><div class="card"><div class="muted">No public meets yet.</div></div></div>`}`}));
});


// ── Submit a Rink (public) ────────────────────────────────────────────────────
app.get('/submit-rink', (req, res) => {
  const data=getSessionUser(req);
  const ok=req.query.ok;
  res.send(pageShell({title:'Submit a Rink', description:'Add your inline speed skating rink or venue to the SpeedSkateMeet directory. Free listing, no account required.', user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Submit a Rink</h1><div class="sub">Add your inline speed skating venue to SpeedSkateMeet.com — free, no account required.</div></div>
    ${ok?`<div class="card" style="border-left:4px solid var(--green);margin-bottom:16px"><div class="good">✅ Your rink has been submitted! Lee will review it and add it to the directory shortly.</div></div>`:`
    <div class="card">
      <form method="POST" action="/submit-rink" class="stack">
        <div class="form-grid cols-2">
          <div><label>Rink Name *</label><input name="name" required placeholder="Roller King Skating Center" /></div>
          <div><label>Track Length</label><input name="trackLength" placeholder="e.g. 100m" /></div>
          <div><label>Address *</label><input name="address" required placeholder="123 Main St" /></div>
          <div><label>City *</label><input name="city" required placeholder="Wichita" /></div>
          <div><label>State *</label><input name="state" required placeholder="KS" maxlength="2" /></div>
          <div><label>Zip</label><input name="zip" placeholder="67201" /></div>
          <div><label>Phone</label><input type="tel" name="phone" placeholder="(316) 555-1234" /></div>
          <div><label>Website</label><input name="website" placeholder="rollerking.com" /></div>
          <div><label>Your Name *</label><input name="contactName" required placeholder="Bob Jones" /></div>
          <div><label>Your Email *</label><input type="email" name="contactEmail" required placeholder="bob@rink.com" /></div>
        </div>
        <div><label>Notes (surface type, parking, directions, etc.)</label><textarea name="notes" rows="3" placeholder="Smooth concrete floor, 200 car parking lot, exit 42 off I-35..."></textarea></div>
        <div><button class="btn-orange" type="submit">Submit Rink →</button></div>
      </form>
    </div>`}`}));
});

app.post('/submit-rink', (req, res) => {
  const db=loadDb();
  const pending={
    id:'pr'+crypto.randomBytes(6).toString('hex'),
    name:String(req.body.name||'').trim(),
    address:String(req.body.address||'').trim(),
    city:String(req.body.city||'').trim(),
    state:String(req.body.state||'').trim(),
    zip:String(req.body.zip||'').trim(),
    phone:String(req.body.phone||'').trim(),
    website:String(req.body.website||'').trim(),
    trackLength:String(req.body.trackLength||'').trim(),
    notes:String(req.body.notes||'').trim(),
    contactName:String(req.body.contactName||'').trim(),
    contactEmail:String(req.body.contactEmail||'').trim(),
    submittedAt:nowIso(), status:'pending',
  };
  if(!pending.name||!pending.address||!pending.city||!pending.contactName||!pending.contactEmail)
    return res.redirect('/submit-rink');
  if(!Array.isArray(db.pendingRinks)) db.pendingRinks=[];
  db.pendingRinks.push(pending);
  saveDb(db);
  sendSms(ADMIN_PHONE, `🏟️ New rink submission!\n${pending.name}\n${pending.city}, ${pending.state}\n${pending.contactName} • ${pending.contactEmail}\nReview: speedskatemeet.com/portal/pending-rinks`);
  res.redirect('/submit-rink?ok=1');
});

// ── Pending Rinks (super admin only) ─────────────────────────────────────────
app.get('/portal/pending-rinks', requireRole('super_admin'), (req, res) => {
  const pending=(req.db.pendingRinks||[]).filter(p=>p.status==='pending');
  const approved=(req.db.pendingRinks||[]).filter(p=>p.status==='approved').slice(-10);
  const rejected=(req.db.pendingRinks||[]).filter(p=>p.status==='rejected').slice(-10);

  const pendingRows=pending.map(p=>`
    <div class="card" style="margin-bottom:14px;border-left:4px solid var(--orange)">
      <div class="row between" style="margin-bottom:8px">
        <div>
          <h2 style="margin:0">${esc(p.name)}</h2>
          <div class="note">${esc(p.address)} • ${esc(p.city)}, ${esc(p.state)} ${esc(p.zip||'')}</div>
        </div>
        <span class="chip chip-orange">Pending Review</span>
      </div>
      <div class="grid-2" style="margin-bottom:12px">
        <div>
          ${p.phone?`<div class="note"><strong>Phone:</strong> ${esc(p.phone)}</div>`:''}
          ${p.website?`<div class="note"><strong>Website:</strong> ${esc(p.website)}</div>`:''}
          ${p.trackLength?`<div class="note"><strong>Track:</strong> ${esc(p.trackLength)}</div>`:''}
        </div>
        <div>
          <div class="note"><strong>Contact:</strong> ${esc(p.contactName)}</div>
          <div class="note">${esc(p.contactEmail)}</div>
        </div>
      </div>
      ${p.notes?`<div class="note" style="margin-bottom:12px">${esc(p.notes)}</div>`:''}
      <div class="action-row">
        <form method="POST" action="/portal/pending-rinks/approve" style="display:inline">
          <input type="hidden" name="id" value="${esc(p.id)}" />
          <button class="btn-orange" type="submit">✅ Approve & Add</button>
        </form>
        <form method="POST" action="/portal/pending-rinks/reject" style="display:inline">
          <input type="hidden" name="id" value="${esc(p.id)}" />
          <input name="reason" placeholder="Reason (optional)" style="width:220px" />
          <button class="btn-danger" type="submit">❌ Reject</button>
        </form>
      </div>
    </div>`).join('');

  res.send(pageShell({title:'Pending Rinks',user:req.user, bodyHtml:`
    <div class="page-header"><h1>Pending Rinks</h1><div class="sub">Review and approve rink submissions.</div></div>
    <div class="action-row" style="margin-bottom:20px"><a class="btn2" href="/portal">← Portal</a></div>
    ${pending.length?`<h2 style="margin-bottom:12px">⏳ Awaiting Review (${pending.length})</h2>${pendingRows}`:`<div class="card"><div class="muted">No pending rink submissions. 🎉</div></div>`}
    ${approved.length?`<div class="spacer"></div><h2 style="margin-bottom:12px;color:var(--green)">✅ Recently Approved</h2>
      ${approved.map(p=>`<div class="card" style="margin-bottom:8px;opacity:.7"><div class="row between"><div><strong>${esc(p.name)}</strong> — ${esc(p.city)}, ${esc(p.state)}</div><span class="chip chip-green">Approved</span></div></div>`).join('')}`:''}
    ${rejected.length?`<div class="spacer"></div><h2 style="margin-bottom:12px;color:var(--muted)">❌ Recently Rejected</h2>
      ${rejected.map(p=>`<div class="card" style="margin-bottom:8px;opacity:.7"><div class="row between"><div><strong>${esc(p.name)}</strong> — ${esc(p.city)}, ${esc(p.state)}</div><span class="chip">Rejected</span></div></div>`).join('')}`:''}
  `}));
});

app.post('/portal/pending-rinks/approve', requireRole('super_admin'), (req, res) => {
  const db=req.db;
  const p=(db.pendingRinks||[]).find(x=>x.id===String(req.body.id||''));
  if(!p) return res.redirect('/portal/pending-rinks');
  p.status='approved'; p.approvedAt=nowIso();
  if(!Array.isArray(db.rinks)) db.rinks=[];
  db.rinks.push({
    id:nextId(db.rinks), name:p.name, address:p.address,
    city:p.city, state:p.state, zip:p.zip||'',
    phone:p.phone||'', website:p.website||'',
    trackLength:p.trackLength||'', notes:p.notes||'',
  });
  sanitizeRinks(db);
  saveDb(db);
  if(p.contactEmail) {
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Your Rink is Listed! 🏟️</h2>
      <p>Hi ${esc(p.contactName)},</p>
      <p><strong>${esc(p.name)}</strong> has been approved and is now listed in the SpeedSkateMeet rink directory!</p>
      <p><a href="https://speedskatemeet.com/rinks" style="background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">View on SpeedSkateMeet →</a></p>
    `);
    sendEmail(p.contactEmail, `Your Rink is Listed — ${p.name}`, html, `${p.name} is now listed on SpeedSkateMeet.com!`);
  }
  res.redirect('/portal/pending-rinks');
});

app.post('/portal/pending-rinks/reject', requireRole('super_admin'), (req, res) => {
  const db=req.db;
  const p=(db.pendingRinks||[]).find(x=>x.id===String(req.body.id||''));
  if(!p) return res.redirect('/portal/pending-rinks');
  p.status='rejected'; p.rejectedAt=nowIso(); p.rejectReason=String(req.body.reason||'').trim();
  saveDb(db);
  if(p.contactEmail) {
    const reason=p.rejectReason||'It did not meet our listing requirements at this time.';
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Rink Submission Update</h2>
      <p>Hi ${esc(p.contactName)},</p>
      <p>Thank you for submitting <strong>${esc(p.name)}</strong> to SpeedSkateMeet.com.</p>
      <p>Unfortunately we were unable to approve this listing: <em>${esc(reason)}</em></p>
      <p>If you have questions, reply to this email.</p>
    `);
    sendEmail(p.contactEmail, `Rink Submission Update — ${p.name}`, html, `Update regarding your rink submission ${p.name}.`);
  }
  res.redirect('/portal/pending-rinks');
});

app.get('/rinks', (req, res) => {
  const db=loadDb(); const data=getSessionUser(req);
  // Group rinks by state
  const sorted=[...db.rinks].sort((a,b)=>{
    const sc=String(a.state||'').localeCompare(String(b.state||''));
    if(sc!==0) return sc;
    return String(a.name||'').localeCompare(String(b.name||''));
  });
  const byState={};
  for(const r of sorted) {
    const s=String(r.state||'Other').toUpperCase();
    if(!byState[s]) byState[s]=[];
    byState[s].push(r);
  }
  const stateNames={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
  const stateLinks=Object.keys(byState).map(s=>`<a href="#state-${s}" style="text-decoration:none"><span class="chip" style="cursor:pointer">${s}</span></a>`).join('');
  const sections=Object.entries(byState).map(([state,rinks])=>`
    <div id="state-${state}" style="margin-bottom:28px">
      <h2 style="margin-bottom:12px;color:var(--navy);border-bottom:2px solid var(--border);padding-bottom:8px">
        ${esc(stateNames[state]||state)} <span style="font-size:16px;color:var(--muted);font-weight:400">(${rinks.length} rink${rinks.length!==1?'s':''})</span>
      </h2>
      ${rinks.map(r=>`
        <div class="card" style="margin-bottom:10px">
          <div class="row between">
            <div>
              <div style="font-weight:700;font-size:16px">📍 ${esc(r.name)}</div>
              <div class="muted" style="font-size:13px">${esc(r.address||'')} • ${esc(r.city||'')}, ${esc(r.state||'')}${r.zip?' '+esc(r.zip):''}</div>
              <div class="note">
                ${r.phone?esc(r.phone):''}
                ${r.phone&&r.website?' • ':''}
                ${r.website?`<a href="https://${esc(r.website)}" target="_blank" rel="noreferrer" style="color:var(--orange)">${esc(r.website)}</a>`:''}
                ${r.trackLength?`<span style="margin-left:8px" class="chip">${esc(r.trackLength)}</span>`:''}
              </div>
            </div>
            ${data?.user&&(hasRole(data.user,'super_admin')||hasRole(data.user,'meet_director'))?`<a class="btn2 btn-sm" href="/portal/rinks">Edit</a>`:''}
          </div>
        </div>`).join('')}
    </div>`).join('');
  res.send(pageShell({title:'Rinks', description:'Inline speed skating venues and rinks across the United States. Find a rink near you or submit your venue to the SpeedSkateMeet directory.', user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Rinks</h1><div class="sub">Inline speed skating venues across the country.</div></div>
    <div class="row between" style="margin-bottom:16px">
      <div class="row" style="flex-wrap:wrap;gap:6px">${stateLinks}</div>
      <a class="btn2" href="/submit-rink">+ Submit a Rink</a>
    </div>
    ${sections||'<div class="card"><div class="muted">No rinks listed yet. Be the first to submit one!</div></div>'}`}));
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


// ── Password Reset ────────────────────────────────────────────────────────────
app.get('/admin/forgot-password', (req, res) => {
  const sent=req.query.sent;
  res.send(pageShell({title:'Forgot Password',user:null, bodyHtml:`
    <div style="max-width:400px;margin:40px auto">
      <div class="page-header"><h1>Forgot Password</h1></div>
      <div class="card">
        ${sent?`<div class="good" style="margin-bottom:14px">✅ If that email is in our system, a reset link is on its way.</div><a class="btn2" href="/admin/login">Back to Login</a>`:`
        <form method="POST" action="/admin/forgot-password" class="stack">
          <div><label>Your Email Address</label><input type="email" name="email" required placeholder="LBird@speedskatemeet.com" /></div>
          <button class="btn" type="submit" style="width:100%">Send Reset Link</button>
          <a href="/admin/login" style="text-align:center;font-size:13px;color:var(--muted)">Back to login</a>
        </form>`}
      </div>
    </div>`}));
});

app.post('/admin/forgot-password', (req, res) => {
  const db=loadDb();
  const email=String(req.body.email||'').trim().toLowerCase();
  const user=db.users.find(u=>String(u.email||'').trim().toLowerCase()===email&&u.active!==false);
  if(user) {
    const token=crypto.randomBytes(24).toString('hex');
    const expires=new Date(Date.now()+1000*60*60).toISOString(); // 1 hour
    if(!db.passwordResets) db.passwordResets=[];
    db.passwordResets=db.passwordResets.filter(r=>r.userId!==user.id&&new Date(r.expires).getTime()>Date.now());
    db.passwordResets.push({token,userId:user.id,expires});
    saveDb(db);
    const resetUrl=`https://speedskatemeet.com/admin/reset-password?token=${token}`;
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Password Reset Request</h2>
      <p>Hi ${esc(user.displayName||user.username)},</p>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${resetUrl}" style="background:#F97316;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700">Reset My Password</a>
      </p>
      <p style="font-size:12px;color:#64748b">If you didn't request this, ignore this email. Your password won't change.</p>
    `);
    sendEmail(email, 'Password Reset — SpeedSkateMeet', html, `Reset your password: ${resetUrl}`);
  }
  res.redirect('/admin/forgot-password?sent=1');
});

app.get('/admin/reset-password', (req, res) => {
  const token=String(req.query.token||'');
  const db=loadDb();
  const reset=(db.passwordResets||[]).find(r=>r.token===token&&new Date(r.expires).getTime()>Date.now());
  if(!reset) return res.send(pageShell({title:'Reset Password',user:null, bodyHtml:`
    <div style="max-width:400px;margin:40px auto">
      <div class="page-header"><h1>Reset Password</h1></div>
      <div class="card"><div class="danger">This reset link has expired or is invalid. <a href="/admin/forgot-password">Request a new one</a>.</div></div>
    </div>`}));
  res.send(pageShell({title:'Reset Password',user:null, bodyHtml:`
    <div style="max-width:400px;margin:40px auto">
      <div class="page-header"><h1>Reset Password</h1></div>
      <div class="card">
        <form method="POST" action="/admin/reset-password" class="stack">
          <input type="hidden" name="token" value="${esc(token)}" />
          <div><label>New Password</label><input type="password" name="password" required minlength="6" /></div>
          <div><label>Confirm Password</label><input type="password" name="confirm" required minlength="6" /></div>
          <button class="btn" type="submit" style="width:100%">Set New Password</button>
        </form>
      </div>
    </div>`}));
});

app.post('/admin/reset-password', (req, res) => {
  const db=loadDb();
  const token=String(req.body.token||'');
  const password=String(req.body.password||'').trim();
  const confirm=String(req.body.confirm||'').trim();
  const reset=(db.passwordResets||[]).find(r=>r.token===token&&new Date(r.expires).getTime()>Date.now());
  if(!reset||password!==confirm||password.length<6) return res.redirect(`/admin/reset-password?token=${token}&err=1`);
  const user=db.users.find(u=>u.id===reset.userId);
  if(!user) return res.redirect('/admin/forgot-password');
  user.password=password;
  db.passwordResets=(db.passwordResets||[]).filter(r=>r.token!==token);
  saveDb(db);
  res.redirect('/admin/login?reset=1');
});

app.get('/admin/login', (req, res) => {
  res.send(pageShell({title:'Login',user:null, bodyHtml:`
    <div style="max-width:400px;margin:40px auto">
      <div class="page-header"><h1>Login</h1></div>
      ${req.query.reset?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Password updated! Sign in with your new password.</div></div>':''}
      <div class="card">
        <form method="POST" action="/admin/login" class="stack">
          <div><label>Username</label><input name="username" autocomplete="username" required /></div>
          <div><label>Password</label><input name="password" type="password" autocomplete="current-password" required /></div>
          <button class="btn" type="submit" style="width:100%">Sign In</button>
          <a href="/admin/forgot-password" style="text-align:center;font-size:13px;color:var(--muted);display:block;margin-top:8px">Forgot password?</a>
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
  saveDb(db); setCookie(res,SESSION_COOKIE,token,Math.floor(SESSION_TTL_MS/1000));
  // Role-based redirect
  if(hasRole(user,'coach')&&!hasRole(user,'meet_director')&&!hasRole(user,'super_admin')) return res.redirect('/portal/coach');
  if((hasRole(user,'judge')||hasRole(user,'announcer'))&&!hasRole(user,'meet_director')&&!hasRole(user,'super_admin')) return res.redirect('/portal/meet-picker');
  res.redirect('/portal');
});

app.get('/admin/logout', (req, res) => {
  const db=loadDb(); const token=parseCookies(req)[SESSION_COOKIE];
  db.sessions=db.sessions.filter(s=>s.token!==token);
  saveDb(db); clearCookie(res,SESSION_COOKIE); res.redirect('/');
});


// ── Meet Picker (judges + announcers) ─────────────────────────────────────────
app.get('/portal/meet-picker', requireRole('judge','announcer','meet_director','super_admin'), (req, res) => {
  const db=loadDb();
  const isJudge=hasRole(req.user,'judge');
  const isAnnouncer=hasRole(req.user,'announcer');
  const role=isJudge?'judge':'announcer';
  const target=isJudge?'judges':'announcer';
  // Show published + live meets only
  const meets=(db.meets||[]).filter(m=>m.isPublic&&m.status!=='draft'&&m.status!=='complete');
  const cards=meets.map(meet=>{
    const rink=db.rinks.find(r=>Number(r.id)===Number(meet.rinkId));
    const info=currentRaceInfo(meet);
    const isLive=meet.status==='live'||(info.current&&info.current.status==='open');
    return `<div class="card" style="margin-bottom:14px;border-left:4px solid ${isLive?'var(--orange)':'var(--border2)'}">
      <div class="row between center">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="muted">${rink?esc(rink.name)+' • '+esc(rink.city)+', '+esc(rink.state):''} • ${esc(meetDateRange(meet))}</div>
          ${isLive?'<span class="chip chip-orange" style="margin-top:6px">🔴 Live Now</span>':''}
        </div>
        <a class="btn-orange" href="/portal/meet/${meet.id}/race-day/${target}">Enter ${isJudge?'Judges Panel':'Announcer View'}</a>
      </div>
    </div>`;
  }).join('');
  res.send(pageShell({title:isJudge?'Judge — Select Meet':'Announcer — Select Meet',user:req.user, bodyHtml:`
    <div class="page-header">
      <h1>${isJudge?'⚖️ Judge Portal':'📢 Announcer Portal'}</h1>
      <div class="sub">Welcome, ${esc(req.user.displayName||req.user.username)}. Select your meet.</div>
    </div>
    ${meets.length?cards:`<div class="card"><div class="muted">No active meets right now.</div></div>`}
    <div style="margin-top:24px"><a class="btn2" href="/admin/logout">Logout</a></div>`}));
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
            <div class="muted" style="font-size:13px">${rink?`${esc(rink.city)}, ${esc(rink.state)} • `:``}${esc(meetDateRange(meet))} • <span class="chip chip-${meet.status==='live'?'green':meet.status==='complete'?'sky':'orange'}" style="font-size:11px">${esc(meet.status||'draft')}</span></div>
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
      ${hasRole(req.user,'super_admin')?`<a class="btn2" href="/portal/users">Users</a>
        <a class="btn2" href="/portal/pending-rinks" style="position:relative">Pending Rinks${req.db.pendingRinks?.filter(p=>p.status==='pending').length?`<span style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700">${req.db.pendingRinks.filter(p=>p.status==='pending').length}</span>`:''}
        </a>
        <a class="btn2" href="/portal/pending-meets" style="position:relative">Pending Meets${req.db.pendingMeets?.length?`<span style="position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700">${req.db.pendingMeets.length}</span>`:''}
        </a>`:''}
    </div>
    ${cards||`<div class="card"><div class="muted">No meets yet. Click "New Meet" to get started.</div></div>`}`}));
});

// ── Coach Portal ──────────────────────────────────────────────────────────────


// ── Coach Roster ──────────────────────────────────────────────────────────────
app.get('/portal/coach/roster', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const db=loadDb();
  const teamKey=String(req.user.team||'').trim().toLowerCase();
  const roster=(db.rosters||[]).filter(r=>String(r.team||'').trim().toLowerCase()===teamKey);
  const ok=req.query.ok; const err=req.query.err;

  const rows=roster.sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(s=>`
    <tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.birthdate||'—')}</td>
      <td>${esc(cap(s.gender||''))}</td>
      <td>${esc(s.team||'')}</td>
      <td>
        <form method="POST" action="/portal/coach/roster/delete" style="display:inline">
          <input type="hidden" name="skaterId" value="${esc(s.id)}" />
          <button class="btn-danger btn-sm" type="submit" onclick="return confirm('Remove ${esc(s.name)} from roster?')">Remove</button>
        </form>
      </td>
    </tr>`).join('');

  res.send(pageShell({title:'Team Roster',user:req.user, bodyHtml:`
    <div class="page-header"><h1>Team Roster</h1><div class="sub">${esc(req.user.team||'')} • ${roster.length} skaters</div></div>
    ${ok?`<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ ${esc(decodeURIComponent(ok))}</div></div>`:''}
    ${err?`<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">❌ ${esc(decodeURIComponent(err))}</div></div>`:''}
    <div class="grid-2" style="margin-bottom:16px">
      <div class="card">
        <h2 style="margin-bottom:14px">Add Skater</h2>
        <form method="POST" action="/portal/coach/roster/add" class="stack">
          <div class="form-grid cols-2">
            <div><label>Skater Name</label><input name="name" required placeholder="Jane Smith" /></div>
            <div><label>Date of Birth</label><input type="date" name="birthdate" min="1900-01-01" max="${new Date().toISOString().split('T')[0]}" required /></div>
            <div><label>Gender</label>
              <select name="gender">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
          <div><button class="btn-orange" type="submit">+ Add to Roster</button></div>
        </form>
      </div>
      <div class="card">
        <h2 style="margin-bottom:8px">About the Roster</h2>
        <div class="stack" style="margin-top:8px">
          <div class="toggle-row"><div><div class="toggle-row-label">Year-round</div><div class="toggle-row-desc">Your roster persists across all meets — add once, use forever</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">No helmet numbers</div><div class="toggle-row-desc">Helmet numbers are meet-specific and assigned at check-in</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">Register from roster</div><div class="toggle-row-desc">Coming soon — register your whole team for a meet with checkboxes</div></div></div>
        </div>
      </div>
    </div>
    ${roster.length?`
    <div class="card">
      <h2 style="margin-bottom:12px">Roster (${roster.length})</h2>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Name</th><th>Birthdate</th><th>Gender</th><th>Team</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`:`<div class="card"><div class="muted">No skaters on your roster yet. Add some above!</div></div>`}
    <div style="margin-top:16px"><a class="btn2" href="/portal/coach">← Coach Portal</a></div>`}));
});

app.post('/portal/coach/roster/add', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const db=loadDb();
  const name=String(req.body.name||'').trim();
  const birthdate=String(req.body.birthdate||'').trim();
  const gender=String(req.body.gender||'girls').trim();
  if(!name||!birthdate) return res.redirect('/portal/coach/roster?err='+encodeURIComponent('Name and birthdate required'));
  if(!Array.isArray(db.rosters)) db.rosters=[];
  db.rosters.push({
    id:'rs'+crypto.randomBytes(6).toString('hex'),
    name, birthdate, gender,
    team:String(req.user.team||'').trim(),
    createdByUserId:req.user.id,
    createdAt:nowIso(),
  });
  saveDb(db);
  res.redirect('/portal/coach/roster?ok='+encodeURIComponent(name+' added to roster'));
});

app.post('/portal/coach/roster/delete', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const db=loadDb();
  const skaterId=String(req.body.skaterId||'');
  const skater=(db.rosters||[]).find(r=>r.id===skaterId);
  if(!skater) return res.redirect('/portal/coach/roster');
  db.rosters=(db.rosters||[]).filter(r=>r.id!==skaterId);
  saveDb(db);
  res.redirect('/portal/coach/roster?ok='+encodeURIComponent(skater.name+' removed from roster'));
});

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
            <div class="muted">${esc(req.user.team||'')} • ${esc(meetDateRange(meet))}</div>
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
    <div class="action-row" style="margin-bottom:16px">
      <a class="btn-orange" href="/portal/coach/roster">👥 Team Roster</a>
      <a class="btn2" href="/admin/logout">Logout</a>
    </div>
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

  // Build upcoming race cards with lane numbers
  const upcomingCards=upcoming.map(item=>{
    const delta=item.delta;
    const statusLabel=racingSoonLabel(delta);
    const statusColor=delta===0?'var(--orange)':delta===1?'var(--red)':delta===2?'var(--yellow)':'var(--muted)';
    const skaterLines=item.skaters.map(s=>{
      const laneStr=item.race.isOpenRace||item.race.isTimeTrial?'':(s.lane?`Lane ${esc(s.lane)}`:'Lane TBD');
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:700;font-size:16px">${esc(s.skaterName)}</div>
        ${s.helmetNumber?`<span class="chip">#${esc(s.helmetNumber)}</span>`:''}
        ${laneStr?`<span class="chip chip-sky">${laneStr}</span>`:''}
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:10px;border-left:4px solid ${statusColor}">
      <div class="row between center" style="margin-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--navy)">${esc(item.race.groupLabel)}</div>
          <div class="note">${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)} • ${esc(raceDisplayStage(item.race))}</div>
        </div>
        <div style="font-family:Barlow Condensed,sans-serif;font-size:18px;font-weight:700;color:${statusColor}">${statusLabel}</div>
      </div>
      ${skaterLines}
    </div>`;
  }).join('');

  // Build recent results cards
  const recentCards=recent.map(item=>{
    const rows=item.skaters.filter(s=>s.place).sort((a,b)=>Number(a.place||99)-Number(b.place||99)).map(s=>{
      const place=Number(s.place); const pts=item.race.countsForOverall&&!item.race.isOpenRace&&!item.race.isTimeTrial?STANDARD_POINTS[place]:null;
      const medal=place===1?'🥇':place===2?'🥈':place===3?'🥉':`${place}th`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:22px">${medal}</div>
        <div style="font-weight:700;font-size:15px;flex:1">${esc(s.skaterName||'')}</div>
        ${s.time?`<div style="font-family:Barlow Condensed,sans-serif;font-size:18px;font-weight:700;color:var(--sky2)">${esc(s.time)}</div>`:''}
        ${pts?`<div class="chip chip-green">+${pts}pts</div>`:''}
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:10px;border-left:4px solid var(--green)">
      <div style="font-weight:700;font-size:15px;color:var(--navy)">${esc(item.race.groupLabel)} • ${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)}</div>
      ${rows||`<div class="muted note">No placed results yet.</div>`}
    </div>`;
  }).join('');

  // Roster table with lane info per race
  const rosterRows=regs.map(reg=>{
    const assignedRaces=orderedRaces(meet).filter(r=>(r.laneEntries||[]).some(le=>Number(le.registrationId)===Number(reg.id)));
    const age=ageForReg(reg,meet);
    const raceDetails=assignedRaces.slice(0,3).map(r=>{
      const entry=(r.laneEntries||[]).find(le=>Number(le.registrationId)===Number(reg.id));
      const laneStr=r.isOpenRace||r.isTimeTrial?'Open':(entry?.lane?`L${entry.lane}`:'TBD');
      return `<div class="note">${esc(cap(r.division))} ${esc(r.distanceLabel)} <span class="chip chip-sky" style="font-size:10px;padding:2px 6px">${laneStr}</span></div>`;
    }).join('');
    return `<tr>
      <td><strong>${esc(reg.name)}</strong>${sponsorLineHtml(reg.sponsor||'')}</td>
      <td>${esc(reg.divisionGroupLabel||'')}<div class="note">Age ${age}</div></td>
      <td>${reg.helmetNumber?`<strong>#${esc(reg.helmetNumber)}</strong>`:''}</td>
      <td>${reg.checkedIn?`<span class="good">✔ In</span>`:`<span class="muted">—</span>`}</td>
      <td>${raceDetails||`<span class="muted">None</span>`}</td>
    </tr>`;
  }).join('');

  res.send(pageShell({title:'Coach Panel',user:req.user,meet, bodyHtml:`
    <div class="page-header">
      <h1>Coach Panel</h1>
      <div class="sub">${esc(meet.meetName)} • ${esc(team)}</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between center">
        <div class="row">
          <span class="chip chip-${info.current?'orange':'sky'}">
            ${info.current?`▶ ${esc(info.current.groupLabel)} — ${esc(cap(info.current.division))}`:'No race running'}
          </span>
          ${info.next?`<span class="chip">Up next: ${esc(info.next.groupLabel)}</span>`:''}
        </div>
        <a class="btn2 btn-sm" href="/portal/coach">← Coach Portal</a>
      </div>
    </div>
    <div class="grid-2" style="margin-bottom:16px">
      <div>
        <h2 style="margin-bottom:12px">🏁 Your Team Racing Soon</h2>
        ${upcomingCards||`<div class="card"><div class="muted">No upcoming races for ${esc(team)} yet.</div></div>`}
      </div>
      <div>
        <h2 style="margin-bottom:12px">✅ Recent Results</h2>
        ${recentCards||`<div class="card"><div class="muted">No results yet.</div></div>`}
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <h2 style="margin-bottom:12px">Team Roster</h2>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Skater</th><th>Division</th><th>Helmet</th><th>Status</th><th>Races & Lanes</th></tr></thead>
          <tbody>${rosterRows||`<tr><td colspan="5" class="muted">No team skaters registered.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    ${standings.length?`<h2 style="margin-bottom:12px">📊 Team Standings</h2>${standings.map(section=>resultsSectionHtml(section)).join('<div class="spacer"></div>')}
    `:''}
    <script>setTimeout(()=>location.reload(),8000);</script>`}));
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
      <td>${Number(u.id)===Number(req.user.id)?'<span class="muted" style="font-size:12px">You</span>':`<a class="btn-danger btn-sm" href="/portal/users/${u.id}/delete" onclick="return confirm('Delete ${esc(u.displayName||u.username)}?')">Delete</a>`}</td>
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
        <thead><tr><th>Name</th><th>Username</th><th>Roles</th><th>Team</th><th>Active</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`}));
});

app.post('/portal/users/new', requireRole('super_admin'), (req, res) => {
  const rolesRaw=req.body.roles; const roles=Array.isArray(rolesRaw)?rolesRaw:(rolesRaw?[rolesRaw]:[]);
  req.db.users.push({id:nextId(req.db.users),displayName:String(req.body.displayName||'').trim(),username:String(req.body.username||'').trim(),password:String(req.body.password||'').trim(),team:String(req.body.team||'Midwest Racing').trim(),roles,active:true,createdAt:nowIso()});
  saveDb(req.db); res.redirect('/portal/users');
});

app.get('/portal/users/:userId/delete', requireRole('super_admin'), (req, res) => {
  const uid=Number(req.params.userId);
  if(uid===Number(req.user.id)) return res.redirect('/portal/users'); // can't delete yourself
  req.db.users=req.db.users.filter(u=>Number(u.id)!==uid);
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

app.get('/portal/rinks', requireRole('super_admin'), (req, res) => {
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
  const savedFlash=req.query.saved?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Meet saved successfully.</div></div>':'';
  const blockSavedFlash=req.query.saved?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Block Builder saved.</div></div>':'';

  function divCardHtml(group, gi, divKey) {
    const div=group.divisions[divKey];
    const colors={novice:'var(--sky2)',elite:'var(--navy)'};
    return '<div class="group-div-card">' +
      '<div class="row between center" style="margin-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="font-weight:700;font-size:14px;color:'+colors[divKey]+'">'+divKey.toUpperCase()+'</div>' +
          '<input name="g_'+gi+'_'+divKey+'_ages" value="'+esc(div.ages||'')+'" placeholder="Ages e.g. 18-29" style="font-size:12px;color:#64748b;border:none;border-bottom:1px solid var(--border2);background:transparent;padding:2px 4px;width:110px" />' +
        '</div>' +
        toggleSwitch('g_'+gi+'_'+divKey+'_enabled', div.enabled) +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:flex-end">' +
        '<input type="hidden" name="g_'+gi+'_'+divKey+'_cost" value="0" />' +
        '<div style="flex:1"><label>D1</label><input name="g_'+gi+'_'+divKey+'_d1" value="'+esc(div.distances[0]||'')+'" placeholder="200m" /></div>' +
        '<div style="flex:1"><label>D2</label><input name="g_'+gi+'_'+divKey+'_d2" value="'+esc(div.distances[1]||'')+'" placeholder="500m" /></div>' +
        '<div style="flex:1"><label>D3</label><input name="g_'+gi+'_'+divKey+'_d3" value="'+esc(div.distances[2]||'')+'" placeholder="1000m" /></div>' +
        '<input type="hidden" name="g_'+gi+'_'+divKey+'_d4" value="'+esc(div.distances[3]||'')+'" />' +
      '</div>' +
    '</div>';
  }
  const groupsRows=[];
  for(let i=0;i<meet.groups.length;i+=2) {
    const L=meet.groups[i]; const R=meet.groups[i+1];
    const Lcards=['novice','elite'].map(d=>divCardHtml(L,i,d)).join('');
    const Rcards=R?['novice','elite'].map(d=>divCardHtml(R,i+1,d)).join(''):'';
    groupsRows.push(
      '<div class="group-pair-row">' +
        '<div class="group-pair-col">' +
          '<div class="group-pair-header"><span class="group-pair-name">'+esc(L.label)+'</span></div>' +
          '<input type="hidden" name="g_'+i+'_id" value="'+esc(L.id)+'" />' +
          Lcards +
        '</div>' +
        (R?'<div class="group-pair-col">' +
          '<div class="group-pair-header"><span class="group-pair-name">'+esc(R.label)+'</span></div>' +
          '<input type="hidden" name="g_'+(i+1)+'_id" value="'+esc(R.id)+'" />' +
          Rcards +
        '</div>':'') +
      '</div>'
    );
  }
  const groupsHtml=groupsRows.join('');

  res.send(pageShell({title:'Meet Builder',user:req.user,meet,activeTab:'builder', bodyHtml:`
    <div class="page-header"><h1>Meet Builder</h1><div class="sub">${esc(meet.meetName)}</div></div>
    ${savedFlash}
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
          <button class="btn2" type="submit" formaction="/portal/meet/${meet.id}/builder/save-meet">Save Meet</button>
        </div>
        <div class="form-grid cols-3" style="margin-bottom:14px">
          <div><label>Meet Name</label><input name="meetName" value="${esc(meet.meetName)}" required /></div>
          <div><label>Start Date</label><input type="date" name="date" value="${esc(meet.date)}" /></div>
          <div><label>End Date</label><input type="date" name="endDate" value="${esc(meet.endDate||'')}" /></div>
          <div><label>Start Time</label><input type="time" name="startTime" value="${esc(meet.startTime)}" /></div>
          <div><label>Registration Close Date</label><input type="date" name="registrationCloseDate" value="${esc(meet.registrationCloseAt?meet.registrationCloseAt.slice(0,10):'')}" /></div>
          <div><label>Registration Close Time</label><input type="time" name="registrationCloseTime" value="${esc(meet.registrationCloseAt?meet.registrationCloseAt.slice(11,16):'')}" /></div>
          <div><label>Rink</label><select name="rinkId">${rinkOptions}</select></div>
          <div><label>Track Length (m)</label><input name="trackLength" value="${esc(meet.trackLength)}" /></div>
          <div><label>Lanes</label><input name="lanes" value="${esc(meet.lanes)}" /></div>
          <div><label>Base Entry Fee ($)</label><input type="number" name="baseEntryFee" value="${esc(String(meet.baseEntryFee||0))}" min="0" /><div class="note">Registration + first event fee.</div></div>
          <div><label>Additional Entry Fee ($)</label><input type="number" name="additionalEntryFee" value="${esc(String(meet.additionalEntryFee||0))}" min="0" /><div class="note">Charged for each event after the first.</div></div>
          <div><label>Per-Skater Cap ($)</label><input type="number" name="entryCap" value="${esc(String(meet.entryCap||0))}" min="0" /><div class="note">Max total per skater (0 = no cap).</div></div>
          <div><label>Status</label>
            <select name="status">
              <option value="draft"     ${meet.status==='draft'    ?'selected':''}>Draft</option>
              <option value="published" ${meet.status==='published'?'selected':''}>Published</option>
              <option value="live"      ${meet.status==='live'     ?'selected':''}>Live</option>
              <option value="complete"  ${meet.status==='complete' ?'selected':''}>Complete</option>
            </select>
          </div>
          <div><label>Tiebreaker Rule</label>
            <select name="tiebreaker">
              <option value="d2"    ${(meet.tiebreaker||'d2')==='d2'   ?'selected':''}>D2 Middle Race (local standard)</option>
              <option value="sr832" ${meet.tiebreaker==='sr832'?'selected':''}>USARS SR832 Formula (regionals/nationals)</option>
            </select>
            <div class="note">D2 = most common at local meets. SR832 = official weighted formula.</div>
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
      <div class="card" style="margin-top:8px">
        <div class="row between center" style="margin-bottom:14px">
          <div>
            <h2 style="margin:0">Additional Divisions</h2>
            <div class="note">Add any custom division — Diaper Dash, Skateability, etc.</div>
          </div>
          <button type="button" class="btn2 btn-sm" onclick="addSkateability()">+ Add Division</button>
        </div>
        <div id="sk-list" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${(meet.skateabilityGroups||[]).map((sg,si)=>
            '<div class="card" style="margin:0" id="sk-'+si+'">'+
            '<div class="group-pair-header" style="align-items:center">'+
              '<div style="display:flex;gap:10px;align-items:center;flex:1">'+
                '<input name="sk_'+si+'_ageGroupLabel" value="'+esc(sg.ageGroupLabel||'')+'" placeholder="Division name" style="font-family:\'Barlow Condensed\',sans-serif;font-size:20px;font-weight:700;color:var(--navy);border:none;border-bottom:2px solid var(--border2);background:transparent;padding:2px 4px;width:180px" />'+
                '<input name="sk_'+si+'_ageGroupId" value="'+esc(sg.ageGroupId||sg.ageGroupLabel||'')+'" placeholder="Age range (e.g. 8-9)" style="font-size:13px;color:#64748b;border:none;border-bottom:1px solid var(--border2);background:transparent;padding:2px 4px;width:130px" />'+
              '</div>'+
              '<button type="button" class="btn-danger btn-sm" onclick="this.closest(\'.group-pair-col\').remove()">Remove</button>'+
            '</div>'+
            '<div style="display:flex;gap:8px;align-items:flex-end;margin-top:10px">'+
              '<input type="hidden" name="sk_'+si+'_cost" value="0" />'+
              '<div style="flex:1"><label>D1</label><input name="sk_'+si+'_d1" value="'+esc((sg.distances&&sg.distances[0])||'')+'" placeholder="100m" /></div>'+
              '<div style="flex:1"><label>D2</label><input name="sk_'+si+'_d2" value="'+esc((sg.distances&&sg.distances[1])||'')+'" placeholder="200m" /></div>'+
              '<div style="flex:1"><label>D3</label><input name="sk_'+si+'_d3" value="'+esc((sg.distances&&sg.distances[2])||'')+'" placeholder="300m" /></div>'+
            '</div>'+
            '</div>'
          ).join('')}
        </div>
        <input type="hidden" name="sk_count" id="sk_count" value="${(meet.skateabilityGroups||[]).length}" />
      </div>
      <script>
        var skCount=${(meet.skateabilityGroups||[]).length};
        function addSkateability(){
          var si=skCount++; document.getElementById('sk_count').value=skCount;
          var wrap=document.createElement('div');
          wrap.className='card'; wrap.style.margin='0'; wrap.id='sk-'+si;

          var header=document.createElement('div');
          header.className='group-pair-header'; header.style.alignItems='center';

          var nameWrap=document.createElement('div');
          nameWrap.style.cssText='display:flex;gap:10px;align-items:center;flex:1';

          var nameInput=document.createElement('input');
          nameInput.name='sk_'+si+'_ageGroupLabel'; nameInput.placeholder='Division name';
          nameInput.style.cssText="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;color:var(--navy);border:none;border-bottom:2px solid var(--border2);background:transparent;padding:2px 4px;width:180px";

          var ageInput=document.createElement('input');
          ageInput.name='sk_'+si+'_ageGroupId'; ageInput.placeholder='Age range (e.g. 8-9)';
          ageInput.style.cssText='font-size:13px;color:#64748b;border:none;border-bottom:1px solid var(--border2);background:transparent;padding:2px 4px;width:130px';

          nameWrap.appendChild(nameInput); nameWrap.appendChild(ageInput);

          var removeBtn=document.createElement('button');
          removeBtn.type='button'; removeBtn.className='btn-danger btn-sm'; removeBtn.textContent='Remove';
          removeBtn.onclick=function(){ wrap.remove(); };

          header.appendChild(nameWrap); header.appendChild(removeBtn);

          var distRow=document.createElement('div');
          distRow.style.cssText='display:flex;gap:8px;align-items:flex-end;margin-top:10px';

          var costHidden=document.createElement('input');
          costHidden.type='hidden'; costHidden.name='sk_'+si+'_cost'; costHidden.value='0';
          distRow.appendChild(costHidden);

          [['D1','100m'],['D2','200m'],['D3','300m']].forEach(function(pair,idx){
            var cell=document.createElement('div'); cell.style.flex='1';
            var lbl=document.createElement('label'); lbl.textContent=pair[0];
            var inp=document.createElement('input'); inp.name='sk_'+si+'_d'+(idx+1); inp.placeholder=pair[1];
            cell.appendChild(lbl); cell.appendChild(inp); distRow.appendChild(cell);
          });

          wrap.appendChild(header); wrap.appendChild(distRow);
          document.getElementById('sk-list').appendChild(wrap);
          nameInput.focus();
        }
      </script>
      <div class="card">
        <div class="row between center">
          <div class="muted">Save Meet saves all settings without touching races or blocks.</div>
          <button class="btn2" type="submit" formaction="/portal/meet/${meet.id}/builder/save-meet">Save Meet</button>
        </div>
      </div>
    </form>`}));
});

function saveMeetFields(meet, body) {
  meet.meetName=String(body.meetName||'New Meet').trim();
  meet.date=String(body.date||'').trim();
  meet.endDate=String(body.endDate||'').trim();
  meet.startTime=String(body.startTime||'').trim();
  meet.registrationCloseAt=combineDateTime(body.registrationCloseDate,body.registrationCloseTime);
  meet.rinkId=Number(body.rinkId||1);
  meet.trackLength=Number(body.trackLength||100);
  meet.lanes=Number(body.lanes||4);
  meet.timeTrialsEnabled=!!body.timeTrialsEnabled;
  meet.relayEnabled=!!body.relayEnabled;
  meet.judgesPanelRequired=!!body.judgesPanelRequired;
  meet.isPublic=!!body.isPublic;
  meet.status=String(body.status||'draft');
  meet.notes=String(body.notes||'');
  meet.relayNotes=String(body.relayNotes||'');
  meet.tiebreaker=String(body.tiebreaker||'d2')==='sr832'?'sr832':'d2';
  meet.baseEntryFee=Number(String(body.baseEntryFee||'0').trim()||0);
  meet.additionalEntryFee=Number(String(body.additionalEntryFee||'0').trim()||0);
  meet.entryCap=Number(String(body.entryCap||'0').trim()||0);
  // Build a map of submitted group data by group ID (more reliable than index)
  const submittedGroupCount=meet.groups.length;
  for(let gi=0;gi<submittedGroupCount;gi++){
    const submittedId=String(body[`g_${gi}_id`]||'').trim();
    const group=submittedId?meet.groups.find(g=>g.id===submittedId):meet.groups[gi];
    if(!group) continue;
    for(const divKey of ['novice','elite']) {
      group.divisions[divKey]={
        enabled:!!body[`g_${gi}_${divKey}_enabled`],
        cost:0,
        distances:[String(body[`g_${gi}_${divKey}_d1`]||'').trim(),String(body[`g_${gi}_${divKey}_d2`]||'').trim(),String(body[`g_${gi}_${divKey}_d3`]||'').trim(),String(body[`g_${gi}_${divKey}_d4`]||'').trim()],
        ages:String(body[`g_${gi}_${divKey}_ages`]||'').trim(),
      };
    }
  }
  const skCount=Number(body.sk_count||0);
  meet.skateabilityGroups=[];
  for(let si=0;si<skCount;si++){
    const ageGroupLabel=String(body['sk_'+si+'_ageGroupLabel']||'').trim();
    const ageGroupId=String(body['sk_'+si+'_ageGroupId']||ageGroupLabel).trim()||('sk_'+si);
    if(!ageGroupLabel) continue;
    meet.skateabilityGroups.push({id:'sk_'+ageGroupId,ageGroupId,ageGroupLabel,
      cost:Number(String(body['sk_'+si+'_cost']||'0').trim()||0),
      distances:[String(body['sk_'+si+'_d1']||'').trim(),String(body['sk_'+si+'_d2']||'').trim(),String(body['sk_'+si+'_d3']||'').trim()],
    });
  }
  meet.updatedAt=nowIso();
}

// Save meet fields only — does NOT touch races or blocks
app.post('/portal/meet/:meetId/builder/save-meet', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  saveMeetFields(meet, req.body);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/builder?saved=1`);
});

// Save AND rebuild races — warns user first via confirm dialog in the UI
app.post('/portal/meet/:meetId/builder/save', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  saveMeetFields(meet, req.body);
  generateBaseRacesForMeet(meet); rebuildRaceAssignments(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/blocks`);
});


// ── Relay Builder ─────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/relay-builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const relayRaces=(meet.races||[]).filter(r=>r.isRelayRace);
  const relayRows=relayRaces.map(r=>`
    <tr>
      <td><strong>${esc(r.groupLabel)}</strong></td>
      <td>${esc(r.distanceLabel)}</td>
      <td>${esc(r.notes||'—')}</td>
      <td><span class="chip chip-${r.status==='closed'?'green':'sky'}">${esc(r.status)}</span></td>
      <td>
        <form method="POST" action="/portal/meet/${meet.id}/relay-builder/delete" style="display:inline">
          <input type="hidden" name="raceId" value="${esc(r.id)}" />
          <button class="btn-danger btn-sm" type="submit">Delete</button>
        </form>
      </td>
    </tr>`).join('');

  res.send(pageShell({title:'Relay Builder',user:req.user,meet,activeTab:'relay-builder', bodyHtml:`
    <div class="builder-banner" style="background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);margin-bottom:18px">
      <h2>🔄 Relay Builder</h2>
      <div class="sub">Create relay races manually. Judges fill in team names and skaters on race day.</div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h2 style="margin-bottom:14px">Add Relay Race</h2>
        <form method="POST" action="/portal/meet/${meet.id}/relay-builder/add" class="stack">
          <div><label>Relay Name</label><input name="name" placeholder="e.g. Senior 4 Man Relay" required /></div>
          <div><label>Distance</label><input name="distance" placeholder="e.g. 4000m" required /></div>
          <div><label>Notes (optional)</label><input name="notes" placeholder="e.g. Mixed relay, 4 skaters" /></div>
          <div><button class="btn-sky" type="submit">+ Add Relay Race</button></div>
        </form>
        ${req.query.saved?'<div class="good" style="margin-top:8px">✅ Saved.</div>':''}
      </div>
      <div class="card">
        <h2 style="margin-bottom:6px">How it works</h2>
        <div class="stack" style="margin-top:8px">
          <div class="toggle-row"><div><div class="toggle-row-label">1. Add relay races here</div><div class="toggle-row-desc">Name it whatever — Senior 4 Man, Freshman 4 Girl, Junior 2 Mix, etc.</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">2. Drag into Block Builder</div><div class="toggle-row-desc">Relay races show up in the unassigned pile tagged with 🔄</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">3. Judges fill in on race day</div><div class="toggle-row-desc">Team name, skater names, and place — all manual on the judges panel</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">4. Results show separately</div><div class="toggle-row-desc">Relay results don't count toward overall standings points</div></div></div>
        </div>
      </div>
    </div>
    ${relayRaces.length?`
    <div class="card" style="margin-top:16px">
      <div class="row between" style="margin-bottom:12px">
        <h2 style="margin:0">Relay Races (${relayRaces.length})</h2>
        <span class="chip chip-sky">🔄 Manual fill-in on race day</span>
      </div>
      <table class="table">
        <thead><tr><th>Name</th><th>Distance</th><th>Notes</th><th>Status</th><th></th></tr></thead>
        <tbody>${relayRows}</tbody>
      </table>
    </div>`:''}`}));
});

app.post('/portal/meet/:meetId/relay-builder/add', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const name=String(req.body.name||'').trim();
  const distance=String(req.body.distance||'').trim();
  const notes=String(req.body.notes||'').trim();
  if(!name||!distance) return res.redirect(`/portal/meet/${meet.id}/relay-builder`);
  const orderHint=9800+(meet.races||[]).filter(r=>r.isRelayRace).length;
  meet.races.push({
    id:'r'+crypto.randomBytes(6).toString('hex'), orderHint,
    groupId:'relay_'+crypto.randomBytes(4).toString('hex'),
    groupLabel:name, ages:'', division:'relay', distanceLabel:distance,
    dayIndex:1, cost:0, stage:'final', heatNumber:0,
    parentRaceKey:'relay_'+crypto.randomBytes(4).toString('hex'),
    startType:'standing', countsForOverall:false,
    laneEntries:[], resultsMode:'places', status:'open',
    notes, isFinal:true, closedAt:'',
    isOpenRace:false, isQuadRace:false, isTimeTrial:false, isRelayRace:true,
  });
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/relay-builder`);
});

app.post('/portal/meet/:meetId/relay-builder/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const raceId=String(req.body.raceId||'');
  meet.races=(meet.races||[]).filter(r=>r.id!==raceId);
  meet.blocks=(meet.blocks||[]).map(b=>({...b,raceIds:(b.raceIds||[]).filter(id=>id!==raceId)}));
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/relay-builder`);
});

// ── Open Builder ──────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/open-builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.openGroups=normalizeOpenGroups(meet.openGroups);
  const enabledCount=meet.openGroups.filter(g=>g.enabled).length;
  const savedFlashOpen=req.query.saved?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Open Builder saved.</div></div>':'';
  // Pair groups as girls/boys side by side
  const openGroupPairs=[];
  for(let i=0;i<meet.openGroups.length;i+=2) openGroupPairs.push([i,i+1].filter(x=>x<meet.openGroups.length));
  const groupCards=openGroupPairs.map(pair=>{
    const cards=pair.map(i=>{
    const og=meet.openGroups[i];
    const def=OPEN_GROUP_DEFAULTS[i];
    const liveRace=(meet.races||[]).find(r=>r.isOpenRace&&r.groupId===og.id&&!r.isTimeTrial);
    // TT now managed in TT Builder tab
    return `
      <div class="open-group-card" style="flex:1">
        <div class="row between center" style="margin-bottom:12px">
          <div>
            <div style="font-weight:700;font-size:16px;color:var(--navy)">${esc(og.label)}</div>
            <input name="og_${i}_ages" value="${esc(og.ages)}" class="group-pair-age-input" placeholder="e.g. 10-13" title="Edit age range" />
          </div>
          ${toggleSwitch(`og_${i}_enabled`, og.enabled, 'Open Race')}
        </div>
        <div class="form-grid cols-3" style="margin-bottom:14px">
          <div>
            <label>Open Distance</label>
            <input name="og_${i}_distance" value="${esc(og.distance)}" placeholder="${esc(def?.defaultDistance||'')}" />
          </div>
          <input type="hidden" name="og_${i}_cost" value="0" />
          <div style="display:flex;align-items:flex-end">
            ${liveRace?`<div class="chip chip-green">Open Entries: ${(liveRace.laneEntries||[]).length}</div>`:`<div class="note">Open race generated on save.</div>`}
          </div>
        </div>
        <input type="hidden" name="og_${i}_timeTrial" value="" />
        <input type="hidden" name="og_${i}_ttDistance" value="" />
      </div>`;
    });
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">${cards.join('')}</div>`;
  }).join('');
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
    ${savedFlashOpen}
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
    if(req.body[`og_${i}_ages`]!==undefined) og.ages=String(req.body[`og_${i}_ages`]||'').trim();
    og.cost=Number(String(req.body[`og_${i}_cost`]||'0').trim()||0);
    // TT config now managed via TT Builder tab
  });
  generateOpenRacesForMeet(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/open-builder?saved=1`);
});


// ── TT Builder ────────────────────────────────────────────────────────────────

const TT_AGE_GROUPS = [
  {id:'tt_juv_girls',   label:'Juvenile Girls',   ages:'0-9',   gender:'girls'},
  {id:'tt_juv_boys',    label:'Juvenile Boys',    ages:'0-9',   gender:'boys'},
  {id:'tt_fresh_girls', label:'Freshman Girls',   ages:'10-13', gender:'girls'},
  {id:'tt_fresh_boys',  label:'Freshman Boys',    ages:'10-13', gender:'boys'},
  {id:'tt_sr_ladies',   label:'Senior Ladies',    ages:'14-34', gender:'women'},
  {id:'tt_sr_men',      label:'Senior Men',       ages:'14-34', gender:'men'},
  {id:'tt_mast_ladies', label:'Masters Ladies',   ages:'35-99', gender:'women'},
  {id:'tt_mast_men',    label:'Masters Men',      ages:'35-99', gender:'men'},
];

function normalizeTTConfig(meet) {
  if(!meet.ttConfig) meet.ttConfig = {
    enabled: false,
    distance: '100m',
    showOverallLeaderboard: true,
    groups: TT_AGE_GROUPS.map(g=>({...g, enabled:true}))
  };
  if(!meet.ttConfig.groups||!meet.ttConfig.groups.length)
    meet.ttConfig.groups=TT_AGE_GROUPS.map(g=>({...g,enabled:true}));
  return meet.ttConfig;
}

app.get('/portal/meet/:meetId/tt-builder', requireRole('meet_director'), (req,res)=>{
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const tt=normalizeTTConfig(meet);
  const flash=req.query.saved?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ TT Builder saved.</div></div>':'';
  const combinedRace=(meet.races||[]).find(r=>r.isTimeTrial&&r.groupId==='tt_combined');
  const timesPosted=(combinedRace?.laneEntries||[]).filter(e=>e.time).length;
  const totalSkaters=(combinedRace?.laneEntries||[]).filter(e=>e.skaterName).length;

  const groupRows=tt.groups.map((g,i)=>{
    const groupTimes=(combinedRace?.laneEntries||[]).filter(e=>e.time&&e.skaterName&&(()=>{
      const reg=(meet.registrations||[]).find(r=>String(r.id)===String(e.registrationId||''));
      if(reg) return getOpenGroupIdForReg(reg).includes(g.id.replace('tt_','open_').replace('juv','juv').replace('fresh','fresh').replace('sr','sr').replace('mast','mast').replace('girls','girls').replace('boys','boys').replace('ladies','ladies').replace('men','men'));
      return false;
    })()).length;
    return `
    <div style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-weight:700">${esc(g.label)}</div>
        <div style="font-size:12px;color:var(--muted)">Ages ${esc(g.ages)} • ${esc(g.gender)}</div>
      </div>
      ${groupTimes?`<div class="chip chip-sky">${groupTimes} time${groupTimes!==1?'s':''} posted</div>`:''}
      <div>${toggleSwitch('ttg_'+i+'_enabled', g.enabled)}</div>
    </div>`;
  }).join('');

  res.send(pageShell({title:'TT Builder',user:req.user,meet,activeTab:'tt-builder',bodyHtml:`
    <div class="builder-banner" style="background:linear-gradient(135deg,#0ea5e9,#0369a1)">
      <h2>⏱ Time Trial Builder</h2>
      <div class="sub">Individual timed laps • Youngest to Oldest • All groups in one combined race</div>
    </div>

    ${flash}

    <form method="POST" action="/portal/meet/${meet.id}/tt-builder/save" class="stack">
      <!-- Master enable + distance -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div>
            <div style="font-weight:700;font-size:16px">Enable Time Trials</div>
            <div style="font-size:12px;color:var(--muted)">Creates a single combined TT race with all skaters sorted youngest to oldest</div>
          </div>
          ${toggleSwitch('tt_enabled', tt.enabled)}
        </div>
        <div style="display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:end">
          <div>
            <label>Distance</label>
            <input name="tt_distance" value="${esc(tt.distance||'100m')}" placeholder="e.g. 100m" />
          </div>
          <div style="padding-bottom:8px;color:var(--muted);font-size:13px">One distance for all groups. Times are scored per age group below.</div>
        </div>
      </div>

      <!-- Overall leaderboard toggle -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:700">Overall TT Leaderboard</div>
            <div style="font-size:12px;color:var(--muted)">Show a cross-group fastest times board on the TV display and Live Board</div>
          </div>
          ${toggleSwitch('tt_showOverallLeaderboard', tt.showOverallLeaderboard!==false)}
        </div>
      </div>

      <!-- Per-group toggles -->
      <div class="card">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">Age Groups</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Toggle which groups participate. Enabled groups appear in TT judges panel and results.</div>
        ${groupRows}
      </div>

      <!-- Status summary -->
      ${combinedRace?`
      <div class="card" style="border-left:4px solid var(--sky2)">
        <div style="font-weight:700;margin-bottom:8px">⏱ Live TT Status</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div class="chip chip-sky">${timesPosted} of ${totalSkaters} times posted</div>
          <div class="chip chip-${combinedRace.status==='closed'?'green':'sky'}">${esc(combinedRace.status)}</div>
          <a class="chip chip-orange" href="/meet/${meet.id}/tt-live" target="_blank">⏱ TT Live Board →</a>
        </div>
      </div>`:''}

      <div class="card">
        <div class="row between center">
          <div class="muted">Saving regenerates the combined TT race. Existing times are preserved.</div>
          <div class="action-row">
            <a class="btn2" href="/portal/meet/${meet.id}/open-builder">← Open Builder</a>
            <button class="btn-orange" type="submit">Save TT Builder</button>
          </div>
        </div>
      </div>
    </form>
  `}));
});

app.post('/portal/meet/:meetId/tt-builder/save', requireRole('meet_director'), (req,res)=>{
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const tt=normalizeTTConfig(meet);
  tt.enabled=!!req.body.tt_enabled;
  tt.distance=String(req.body.tt_distance||'100m').trim()||'100m';
  tt.showOverallLeaderboard=!!req.body.tt_showOverallLeaderboard;
  tt.groups.forEach((g,i)=>{ g.enabled=!!req.body[`ttg_${i}_enabled`]; });
  // TT config is self-contained in ttConfig — openGroups.timeTrial no longer used
  (meet.openGroups||[]).forEach(og=>{ og.timeTrial=false; og.ttDistance=""; });


  generateOpenRacesForMeet(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/tt-builder?saved=1`);
});

// ── Quad Builder ──────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/quad-builder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.quadGroups=normalizeQuadGroups(meet.quadGroups);
  const enabledCount=meet.quadGroups.filter(g=>g.enabled).length;
  const savedFlashQuad=req.query.saved?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Quad Builder saved.</div></div>':'';
  const quadGroupPairs=[];
  for(let i=0;i<meet.quadGroups.length;i+=2) quadGroupPairs.push([i,i+1].filter(x=>x<meet.quadGroups.length));
  const groupCards=quadGroupPairs.map(pair=>{
    const cards=pair.map(i=>{
    const qg=meet.quadGroups[i];
    const def=QUAD_GROUP_DEFAULTS[i];
    const liveRaces=(meet.races||[]).filter(r=>r.isQuadRace&&r.groupId===qg.id);
    return `
      <div class="quad-group-card" style="flex:1">
        <div class="row between center" style="margin-bottom:12px">
          <div>
            <div style="font-weight:700;font-size:16px;color:var(--navy)">${esc(qg.label)}</div>
            <input name="qg_${i}_ages" value="${esc(qg.ages)}" class="group-pair-age-input" placeholder="e.g. 10-13" title="Edit age range" />
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
            ${liveRaces.length?`<div class="note" style="margin-top:6px">${liveRaces.map(r=>`${esc(r.distanceLabel)}: ${(r.laneEntries||[]).length} entries`).join(' | ')}</div>`:''}
          </div>
        </div>
      </div>`;
    });
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">${cards.join('')}</div>`;
  }).join('');
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
    ${savedFlashQuad}
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
    if(req.body[`qg_${i}_ages`]!==undefined) qg.ages=String(req.body[`qg_${i}_ages`]||'').trim();
    qg.cost=Number(String(req.body[`qg_${i}_cost`]||'0').trim()||0);
  });
  generateQuadRacesForMeet(meet); ensureAtLeastOneBlock(meet); ensureCurrentRace(meet);
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/quad-builder?saved=1`);
});
// ── Public Registration ───────────────────────────────────────────────────────

app.get('/meet/:meetId/register', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId); const data=getSessionUser(req);
  if(!meet||!meet.isPublic) return res.redirect('/meets');
  const closed=isRegistrationClosed(meet);
  const base=Number(meet.baseEntryFee||0);
  const hasAnyCost=base>0||Number(meet.additionalEntryFee||0)>0;
  const costWidget=hasAnyCost ? buildCostWidget(base,Number(meet.additionalEntryFee||0),Number(meet.entryCap||0)) : '';
  res.send(pageShell({title:'Register',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Register</h1><div class="sub">${esc(meet.meetName)}${meet.date?` • ${esc(meetDateRange(meet))}`:''}</div></div>
    <div class="card">
      ${closed?`<div class="danger" style="font-size:18px">Registration is closed.</div>`:`
        <form method="POST" action="/meet/${meet.id}/register" class="stack">
          <div class="form-grid cols-3">
            <div><label>Skater Name <span style="font-weight:400;color:#94a3b8;font-size:12px">(First &amp; Last)</span></label><input name="name" required /></div>
            <div><label>Date of Birth</label><input type="date" name="birthdate" min="1900-01-01" max="2026-04-06" /><div class="note">Used for USARS division placement (age as of Jan 1)</div></div>
            <div><label>Age <span style="font-weight:400;color:#94a3b8">(if no birthdate)</span></label><input type="number" name="manualAge" min="0" max="120" placeholder="e.g. 11" /><div class="note">Only used if birthdate is blank.</div></div>
            <div>
              <label>Gender</label>
              <select name="gender">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <div class="note">Boys/Men and Girls/Women assigned automatically by age.</div>
            </div>
            <div><label>Team</label><input name="team" list="teams-reg" value="Midwest Racing" /></div>
            <div><label>Email (for confirmation)</label><input type="email" name="email" placeholder="parent@email.com" /></div>
            <div><label>Sponsor (optional)</label><input name="sponsor" placeholder="Bones Bearings" /></div>
          </div>
          <datalist id="teams-reg">${TEAM_LIST.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
            <div class="toggle-row"><div><div class="toggle-row-label">Challenge Up</div></div>${toggleSwitch('challengeUp',false)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Novice</div></div>${toggleSwitch('novice',false)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Elite</div></div>${toggleSwitch('elite',false)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Open</div></div>${toggleSwitch('open',false)}</div>
            ${(meet.quadGroups||[]).some(g=>g.enabled)?`<div class="toggle-row"><div><div class="toggle-row-label">Quad</div></div>${toggleSwitch('quad',false)}</div>`:''}
            ${meet.timeTrialsEnabled?`<div class="toggle-row"><div><div class="toggle-row-label">Time Trials</div></div>${toggleSwitch('timeTrials',false)}</div>`:''}
            ${meet.relayEnabled?`<div class="toggle-row"><div><div class="toggle-row-label">Relays</div></div>${toggleSwitch('relays',false)}</div>`:''}
            ${(meet.skateabilityGroups||[]).map(sg=>`<div class="toggle-row"><div><div class="toggle-row-label">${esc(sg.ageGroupLabel||'Skateability')}</div><div class="toggle-row-desc">${sg.distances?.filter(Boolean).length?sg.distances.filter(Boolean).join(', '):''}</div></div>${toggleSwitch('sk_grp_'+sg.ageGroupId,false)}</div>`).join('')}
          </div>
          ${costWidget}
          <div><button class="btn-orange" type="submit">Register Skater</button></div>
        </form>`}
    </div>`}));
});

app.post('/meet/:meetId/register', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!meet||!meet.isPublic||isRegistrationClosed(meet)) return res.redirect(`/meet/${req.params.meetId}/register`);
  const rawGender=String(req.body.gender||'').trim().toLowerCase();
  const gender=rawGender==='female'||rawGender==='girls'||rawGender==='women'?'female':
               rawGender==='male'||rawGender==='boys'||rawGender==='men'?'male':'male';
  const birthdate=String(req.body.birthdate||'').trim();
  const compAge=usarsAge(birthdate,meet.date)||Number(req.body.manualAge||req.body.age||0);
  let baseGroup=findAgeGroup(meet.groups,compAge,gender);
  // Novice bump: if age group has no novice, find nearest group with novice enabled toward Senior
  if(!!req.body.novice && baseGroup) {
    const hasNovice = baseGroup.divisions?.novice?.enabled;
    if(!hasNovice) {
      const SENIOR_IDS = ['senior_men','senior_women'];
      const sameGender = meet.groups.filter(g=>g.gender===gender);
      const idx = sameGender.findIndex(g=>g.id===baseGroup.id);
      const seniorIdx = sameGender.findIndex(g=>SENIOR_IDS.includes(g.id));
      const hasNoviceEnabled = g => g.divisions?.novice?.enabled;
      let bump = null;
      if(idx < seniorIdx) {
        // Younger than Senior — search upward toward Senior, then downward if nothing found
        bump = sameGender.slice(idx+1, seniorIdx+1).find(hasNoviceEnabled)
            || sameGender.slice(0, idx).reverse().find(hasNoviceEnabled);
      } else if(idx > seniorIdx) {
        // Older than Senior — search downward toward Senior, then upward if nothing found
        bump = sameGender.slice(seniorIdx, idx).reverse().find(hasNoviceEnabled)
            || sameGender.slice(idx+1).find(hasNoviceEnabled);
      }
      if(bump) baseGroup = bump;
    }
  }
  // Challenge Up: skater stays in their own age group AND races elite in the next group toward Senior
  const challengeUpGroup=(!!req.body.challengeUp && !!req.body.elite)?findChallengeUpGroup(meet.groups||[],baseGroup?.id||''):null;
  const meetNumber=(meet.registrations||[]).reduce((max,r)=>Math.max(max,Number(r.meetNumber)||0),0)+1;
  const regEmail=String(req.body.email||'').trim();
  const skGroups=(meet.skateabilityGroups||[]).map(sg=>sg.ageGroupId).filter(id=>!!req.body['sk_grp_'+id]);
  const regOpts={challengeUp:!!req.body.challengeUp,novice:!!req.body.novice,elite:!!req.body.elite,open:!!req.body.open,quad:!!req.body.quad,timeTrials:!!req.body.timeTrials,relays:!!req.body.relays,skateability:skGroups.length>0,skateabilityGroups:skGroups};
  const totalCost=calcRegistrationCost(meet,regOpts);
  meet.registrations.push({
    id:nextId(meet.registrations),createdAt:nowIso(),
    name:String(req.body.name||'').trim(),birthdate,age:compAge,gender,email:regEmail,
    team:String(req.body.team||'Midwest Racing').trim()||'Midwest Racing',
    sponsor:String(req.body.sponsor||'').trim(),
    divisionGroupId:baseGroup?.id||'',divisionGroupLabel:baseGroup?.label||'Unassigned',
    challengeUpGroupId:challengeUpGroup?.id||'',challengeUpGroupLabel:challengeUpGroup?.label||'',
    originalDivisionGroupId:baseGroup?.id||'',originalDivisionGroupLabel:baseGroup?.label||'',
    meetNumber,helmetNumber:nextHelmetNumber(meet),
    paid:false,checkedIn:false,totalCost,
    options:regOpts,
  });
  rebuildRaceAssignments(meet); ensureCurrentRace(meet); saveDb(db);
  // Send confirmation email to registrant
  if(regEmail) {
    const rink=db.rinks.find(r=>Number(r.id)===Number(meet.rinkId));
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Registration Confirmed! 🏁</h2>
      <p>Hi ${esc(String(req.body.name||'').trim())},</p>
      <p>You're registered for <strong>${esc(meet.meetName)}</strong>!</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Date</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${esc(meetDateRange(meet))}</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Venue</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${rink?esc(rink.name)+', '+esc(rink.city)+' '+esc(rink.state):'TBD'}</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Division</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${esc(finalGroup?.label||'TBD')}</strong></td></tr>
        ${meet.startTime?'<tr><td style="padding:8px;color:#64748b">Start Time</td><td style="padding:8px"><strong>'+esc(meet.startTime)+'</strong></td></tr>':''}
      </table>
      <p>Follow live results on race day at <a href="https://speedskatemeet.com/meet/${meet.id}/live" style="color:#F97316">speedskatemeet.com</a></p>
      <p>Sign up for text alerts at <a href="https://speedskatemeet.com/meet/${meet.id}/alerts" style="color:#F97316">speedskatemeet.com/meet/${meet.id}/alerts</a></p>
    `);
    sendEmail(regEmail, `Registration Confirmed — ${meet.meetName}`, html, `You're registered for ${meet.meetName} on ${meet.date||'TBD'}. Follow live at speedskatemeet.com`);
  }
  // Notify meet director
  const director=db.users.find(u=>Number(u.id)===Number(meet.createdByUserId));
  if(director&&director.email) {
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">New Registration 🏁</h2>
      <p><strong>${esc(String(req.body.name||'').trim())}</strong> just registered for <strong>${esc(meet.meetName)}</strong>.</p>
      <p>Total registrations: <strong>${meet.registrations.length}</strong></p>
      <p><a href="https://speedskatemeet.com/portal/meet/${meet.id}/registered" style="background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">View Registrations</a></p>
    `);
    sendEmail(director.email, `New Registration — ${meet.meetName}`, html, `${String(req.body.name||'').trim()} just registered for ${meet.meetName}. Total: ${meet.registrations.length}`);
  }
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
            <div><label>Date of Birth</label><input type="date" name="birthdate" value="${esc(reg.birthdate||'')}" min="1900-01-01" max="2026-04-06" /><div class="note">USARS age as of Jan 1 — ${reg.birthdate?'Age '+ageForReg(reg,meet):'no birthdate yet'}</div></div>
            <div><label>Gender</label>
              <select name="gender">
                <option value="male"   ${gender==='male'||gender==='boys'||gender==='men'  ?'selected':''}>Male</option>
                <option value="female" ${gender==='female'||gender==='girls'||gender==='women'?'selected':''}>Female</option>
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
            ${(meet.quadGroups||[]).some(g=>g.enabled)?`<div class="toggle-row"><div><div class="toggle-row-label">Quad</div></div>${toggleSwitch('quad',!!reg.options?.quad)}</div>`:''}
            <div class="toggle-row"><div><div class="toggle-row-label">Time Trials</div></div>${toggleSwitch('timeTrials',!!reg.options?.timeTrials)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Relays</div></div>${toggleSwitch('relays',!!reg.options?.relays)}</div>
            ${(meet.skateabilityGroups||[]).map(sg=>`<div class="toggle-row"><div><div class="toggle-row-label">${esc(sg.ageGroupLabel||'Skateability')}</div><div class="toggle-row-desc">${sg.distances?.filter(Boolean).length?sg.distances.filter(Boolean).join(', '):''}</div></div>${toggleSwitch('sk_grp_'+sg.ageGroupId,!!(reg.options?.skateabilityGroups||[]).includes(sg.ageGroupId))}</div>`).join('')}
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
  const qName=String(req.query.q||'').toLowerCase().trim();
  const qTeam=String(req.query.team||'').toLowerCase().trim();
  const regs=(meet.registrations||[]).filter(r=>{
    if(qName&&!String(r.name||'').toLowerCase().includes(qName)) return false;
    if(qTeam&&!String(r.team||'').toLowerCase().includes(qTeam)) return false;
    return true;
  });
  const rows=regs.map(r=>`
    <tr>
      <td>${esc(r.meetNumber)}</td><td>${esc(r.helmetNumber)}</td>
      <td><strong>${esc(r.name)}</strong>${sponsorLineHtml(r.sponsor||'')}</td>
      <td>${esc(r.age)}</td><td>${esc(r.team)}</td>
      <td>${esc(r.divisionGroupLabel||'')}${r.options?.challengeUp?`<div class="note">↑ from ${esc(r.originalDivisionGroupLabel||'')}</div>`:''}</td>
      <td>${[
        r.options?.challengeUp?'CU':null,
        r.options?.novice?'Novice':null,
        r.options?.elite?'Elite':null,
        r.options?.open?'Open':null,
        r.options?.quad?'Quad':null,
        r.options?.timeTrials?'Time Trials':null,
        r.options?.relays?'Relays':null,
        ...((r.options?.skateabilityGroups||[]).length?(r.options.skateabilityGroups):r.options?.skateability?['Skateability']:[])
      ].filter(Boolean).join(', ')||'—'}</td>
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
      <form method="GET" action="/portal/meet/${meet.id}/registered" style="margin-bottom:14px">
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <input name="q" value="${esc(qName)}" placeholder="Search name..." style="flex:1;min-width:180px" autocomplete="off" />
          <input name="team" value="${esc(qTeam)}" placeholder="Search team..." style="flex:1;min-width:180px" autocomplete="off" />
          <button class="btn-orange btn-sm" type="submit">Search</button>
          ${qName||qTeam?`<a class="btn2 btn-sm" href="/portal/meet/${meet.id}/registered">Clear</a>`:''}
        </div>
      </form>
      <div class="row between" style="margin-bottom:14px">
        <div class="note">Registration close: ${meet.registrationCloseAt?esc(meet.registrationCloseAt.replace('T',' ')):'Not set'} • Showing ${regs.length} of ${(meet.registrations||[]).length}</div>
        <div class="action-row">
          <form method="POST" action="/portal/meet/${meet.id}/assign-races" onsubmit="return confirm('Rebuild will re-split heats and reassign lanes.\n\nYour block structure will be preserved but lane assignments will change.\n\nContinue?')"><button class="btn2" type="submit">Rebuild Assignments</button></form>
          <a class="btn-orange" href="/meet/${meet.id}/register" target="_blank">Public Registration</a>
          <a class="btn2" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>#</th><th>Helmet</th><th>Name</th><th>Age</th><th>Team</th><th>Division</th><th>Entries</th><th>Total</th><th>Paid</th><th>In</th><th></th></tr></thead>
          <tbody>${rows||`<tr><td colspan="11" class="muted">No results.</td></tr>`}</tbody>
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
  const rawGender=String(req.body.gender||'').trim().toLowerCase();
  const gender=rawGender==='female'||rawGender==='girls'||rawGender==='women'?'female':
               rawGender==='male'||rawGender==='boys'||rawGender==='men'?'male':'male';
  const birthdate=String(req.body.birthdate||'').trim()||reg.birthdate||'';
  const compAge=usarsAge(birthdate,meet.date)||Number(reg.age||0);
  let baseGroup=findAgeGroup(meet.groups,compAge,gender);
  // Novice bump toward Senior for edit route
  if(!!req.body.novice && baseGroup) {
    const hasNovice = baseGroup.divisions?.novice?.enabled;
    if(!hasNovice) {
      const SENIOR_IDS = ['senior_men','senior_women'];
      const sameGender = meet.groups.filter(g=>g.gender===gender);
      const idx = sameGender.findIndex(g=>g.id===baseGroup.id);
      const seniorIdx = sameGender.findIndex(g=>SENIOR_IDS.includes(g.id));
      const hasNoviceEnabled = g => g.divisions?.novice?.enabled;
      let bump = null;
      if(idx < seniorIdx) {
        bump = sameGender.slice(idx+1, seniorIdx+1).find(hasNoviceEnabled)
            || sameGender.slice(0, idx).reverse().find(hasNoviceEnabled);
      } else if(idx > seniorIdx) {
        bump = sameGender.slice(seniorIdx, idx).reverse().find(hasNoviceEnabled)
            || sameGender.slice(idx+1).find(hasNoviceEnabled);
      }
      if(bump) baseGroup = bump;
    }
  }
  // Challenge Up is Elite only
  const editChallengeUpGroup=(!!req.body.challengeUp && !!req.body.elite)?findChallengeUpGroup(meet.groups||[],baseGroup?.id||''):null;
  const editSkGroups=(meet.skateabilityGroups||[]).map(sg=>sg.ageGroupId).filter(id=>!!req.body['sk_grp_'+id]);
  const editOpts={challengeUp:!!req.body.challengeUp,novice:!!req.body.novice,elite:!!req.body.elite,open:!!req.body.open,quad:!!req.body.quad,timeTrials:!!req.body.timeTrials,relays:!!req.body.relays,skateability:editSkGroups.length>0,skateabilityGroups:editSkGroups};
  const editCost=calcRegistrationCost(meet,editOpts);
  Object.assign(reg,{name:String(req.body.name||'').trim(),birthdate,age:compAge,gender,team:String(req.body.team||'Midwest Racing').trim()||'Midwest Racing',sponsor:String(req.body.sponsor||'').trim(),originalDivisionGroupId:baseGroup?.id||'',originalDivisionGroupLabel:baseGroup?.label||'',divisionGroupId:baseGroup?.id||'',divisionGroupLabel:baseGroup?.label||'Unassigned',challengeUpGroupId:editChallengeUpGroup?.id||'',challengeUpGroupLabel:editChallengeUpGroup?.label||'',totalCost:editCost,options:editOpts});
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
  // Server-side filtering
  const qName=(String(req.query.q||'')).toLowerCase().trim();
  const qTeam=(String(req.query.team||'')).toLowerCase().trim();
  const qStatus=String(req.query.status||'all');
  const filtered=(meet.registrations||[]).filter(r=>{
    if(qName&&!String(r.name||'').toLowerCase().includes(qName)) return false;
    if(qTeam&&!String(r.team||'').toLowerCase().includes(qTeam)) return false;
    if(qStatus==='not_paid'&&r.paid) return false;
    if(qStatus==='not_in'&&r.checkedIn) return false;
    if(qStatus==='in'&&!r.checkedIn) return false;
    return true;
  });
  const rows=filtered.map(r=>{
    const entries=['challengeUp','novice','elite','open','quad','timeTrials','relays'].filter(k=>r.options?.[k]).map(k=>k==='challengeUp'?'CU':cap(k));
    (r.options?.skateabilityGroups||[]).forEach(g=>entries.push(g));
    if(r.options?.skateability&&!entries.length) entries.push('Skateability');
    return `
    <tr class="checkin-row" data-name="${esc(String(r.name||'').toLowerCase())}" data-team="${esc(String(r.team||'').toLowerCase())}"
      data-paid="${r.paid?'1':'0'}" data-in="${r.checkedIn?'1':'0'}"
      data-reg-id="${esc(String(r.id))}" onclick="openCiModal(this)" style="cursor:pointer">
      <td>${esc(r.meetNumber)}</td>
      <td><strong>${esc(r.name)}</strong>${sponsorLineHtml(r.sponsor||'')}</td>
      <td>${esc(r.team)}</td>
      <td>${esc(r.divisionGroupLabel)}</td>
      <td onclick="event.stopPropagation()">
        <form method="POST" action="/portal/meet/${meet.id}/checkin/helmet/${r.id}" class="checkin-form row center" style="gap:6px"
          onsubmit="sessionStorage.setItem('ciY',String(window.scrollY))">
          <input style="max-width:80px" name="helmetNumber" value="${esc(r.helmetNumber)}" />
          <button class="btn2 btn-sm" type="submit">✓</button>
        </form>
      </td>
      <td><strong>$${esc(r.totalCost)}</strong></td>
      <td onclick="event.stopPropagation()">
        <form method="POST" action="/portal/meet/${meet.id}/checkin/toggle-paid/${r.id}" class="checkin-form"
          onsubmit="sessionStorage.setItem('ciY',String(window.scrollY))">
          <button class="${r.paid?'btn-good':'btn2'} btn-sm" type="submit">${r.paid?'✔ Paid':'Mark Paid'}</button>
        </form>
      </td>
      <td onclick="event.stopPropagation()">
        <form method="POST" action="/portal/meet/${meet.id}/checkin/toggle-checkin/${r.id}" class="checkin-form"
          onsubmit="sessionStorage.setItem('ciY',String(window.scrollY))">
          <button class="${r.checkedIn?'btn-good':'btn2'} btn-sm" type="submit">${r.checkedIn?'✔ In':'Check In'}</button>
        </form>
      </td>
    </tr>`;
  }).join('');
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
      <form method="GET" action="/portal/meet/${meet.id}/checkin" style="margin-bottom:14px">
        <div class="filters-row">
          <div><label>Search Name</label><input name="q" value="${esc(qName)}" placeholder="skater name..." id="ciSearch" autocomplete="off" /></div>
          <div><label>Team</label><input name="team" value="${esc(qTeam)}" placeholder="team..." id="ciTeam" autocomplete="off" /></div>
          <div><label>Filter</label>
            <select name="status" onchange="this.form.submit()">
              <option value="all" ${qStatus==='all'?'selected':''}>All</option>
              <option value="not_paid" ${qStatus==='not_paid'?'selected':''}>Not Paid</option>
              <option value="not_in" ${qStatus==='not_in'?'selected':''}>Not Checked In</option>
              <option value="in" ${qStatus==='in'?'selected':''}>Checked In</option>
            </select>
          </div>
          <div style="display:flex;align-items:flex-end;gap:6px">
            <button class="btn-orange btn-sm" type="submit">Search</button>
            ${qName||qTeam||qStatus!=='all'?`<a class="btn2 btn-sm" href="/portal/meet/${meet.id}/checkin">Clear</a>`:''}
          </div>
        </div>
      </form>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>#</th><th>Name</th><th>Team</th><th>Division</th><th>Helmet</th><th>Total</th><th>Paid</th><th>Check In</th></tr></thead>
          <tbody id="ciBody">${rows||`<tr><td colspan="8" class="muted">No registrations yet.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <div id="ci-modal" style="display:none;position:fixed;inset:0;z-index:999;background:rgba(15,31,61,.65);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)closeCiModal()">
      <div style="background:#fff;border-radius:20px;padding:28px;max-width:460px;width:100%;box-shadow:0 20px 60px rgba(15,31,61,.3);position:relative;max-height:90vh;overflow-y:auto">
        <button onclick="closeCiModal()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:#94a3b8;line-height:1">&#x2715;</button>
        <div id="ci-modal-body"></div>
      </div>
    </div>
    <script>
      const CI_DATA=${JSON.stringify(Object.fromEntries((meet.registrations||[]).map(r=>{
        const entries=['challengeUp','novice','elite','open','quad','timeTrials','relays'].filter(k=>r.options?.[k]).map(k=>k==='challengeUp'?'CU':cap(k));
        (r.options?.skateabilityGroups||[]).forEach(g=>entries.push(g));
        if(r.options?.skateability&&!entries.length) entries.push('Skateability');
        return [String(r.id),{name:r.name,team:r.team,division:r.divisionGroupLabel,sponsor:r.sponsor||'',
          helmet:r.helmetNumber,totalCost:r.totalCost,age:r.age||'?',paid:!!r.paid,checkedIn:!!r.checkedIn,entries,
          paidUrl:'/portal/meet/'+meet.id+'/checkin/toggle-paid/'+r.id,
          checkinUrl:'/portal/meet/'+meet.id+'/checkin/toggle-checkin/'+r.id,
          editUrl:'/portal/meet/'+meet.id+'/registered/'+r.id+'/edit'}];
      })))};
      const savedY=sessionStorage.getItem('ciY');
      if(savedY) { window.scrollTo(0,parseInt(savedY,10)); sessionStorage.removeItem('ciY'); }
      function openCiModal(row) {
        var d=CI_DATA[row.getAttribute('data-reg-id')];
        if(!d) return;
        var chips=d.entries.length ? d.entries.map(function(e){return '<span style="display:inline-block;padding:5px 12px;border-radius:999px;font-size:13px;font-weight:700;background:#f0f9ff;border:1px solid #bae6fd;color:#0ea5e9;margin:3px 3px 3px 0">'+e+'</span>';}).join('') : '<span style="color:#94a3b8;font-size:14px">No events selected</span>';
        var paidSt=d.paid?'border:1.5px solid #6ee7b7;background:#ecfdf5;color:#059669':'border:1.5px solid #cbd5e1;background:#fff;color:#64748b';
        var ciSt=d.checkedIn?'border:1.5px solid #6ee7b7;background:#ecfdf5;color:#059669':'border:1.5px solid #F97316;background:#F97316;color:#fff';
        document.getElementById('ci-modal-body').innerHTML=
          '<div style="margin-bottom:18px">'+
            '<div style="font-size:24px;font-weight:900;color:#0F1F3D;margin-bottom:3px">'+d.name+'</div>'+
            '<div style="font-size:14px;color:#64748b">'+d.team+' &middot; '+d.division+'</div>'+
            (d.sponsor?'<div style="font-size:12px;color:#0ea5e9;margin-top:2px">Sponsored by '+d.sponsor+'</div>':'')+
          '</div>'+
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px">'+
            '<div style="background:#f8fafc;border-radius:10px;padding:12px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px">Helmet</div><div style="font-size:22px;font-weight:900;color:#0F1F3D">#'+(d.helmet||'?')+'</div></div>'+
            '<div style="background:#f8fafc;border-radius:10px;padding:12px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px">Total</div><div style="font-size:22px;font-weight:900;color:#0F1F3D">$'+d.totalCost+'</div></div>'+
            '<div style="background:#f8fafc;border-radius:10px;padding:12px;text-align:center"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px">Age</div><div style="font-size:22px;font-weight:900;color:#0F1F3D">'+d.age+'</div></div>'+
          '</div>'+
          '<div style="margin-bottom:18px">'+
            '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:8px;font-weight:700">Entered In</div>'+
            chips+
          '</div>'+
          '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
            '<form method="POST" action="'+d.paidUrl+'" style="flex:1" onsubmit="sessionStorage.setItem(\'ciY\',String(window.scrollY))">'+
              '<button type="submit" style="width:100%;padding:11px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;'+paidSt+'">'+(d.paid?'&#x2714; Paid':'Mark Paid')+'</button>'+
            '</form>'+
            '<form method="POST" action="'+d.checkinUrl+'" style="flex:1" onsubmit="sessionStorage.setItem(\'ciY\',String(window.scrollY))">'+
              '<button type="submit" style="width:100%;padding:11px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;'+ciSt+'">'+(d.checkedIn?'&#x2714; Checked In':'Check In')+'</button>'+
            '</form>'+
            '<a href="'+d.editUrl+'" style="flex:1;display:block;padding:11px;border-radius:10px;font-weight:700;font-size:13px;text-align:center;border:1.5px solid #cbd5e1;background:#fff;color:#0F1F3D;text-decoration:none">Edit</a>'+
          '</div>';
        document.getElementById('ci-modal').style.display='flex';
      }
      function closeCiModal(){document.getElementById('ci-modal').style.display='none';}
      document.addEventListener('keydown',function(e){if(e.key==='Escape')closeCiModal();});
      // filtering handled server-side
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
    const tag=race.isTimeTrial?'⏱ ':race.isRelayRace?'🔄 ':race.isOpenRace?'🏁 ':race.isQuadRace?'🛼 ':race.isSkateabilityRace?'⛸️ ':'';
    const cls=race.isTimeTrial?'tt-item':race.isRelayRace?'relay-item':race.isOpenRace?'open-item':race.isQuadRace?'quad-item':race.isSkateabilityRace?'open-item':'';
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
          <span class="chip chip-sky">⏱ TT: ${(meet.races||[]).filter(r=>r.isTimeTrial).length}</span>
          <span class="chip" style="border-color:#93c5fd;color:#1d4ed8">🔄 Relays: ${(meet.races||[]).filter(r=>r.isRelayRace).length}</span>
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
          <form method="POST" action="/portal/meet/${meet.id}/assign-races" onsubmit="return confirm('Rebuild will re-split heats and reassign lanes.\n\nYour block structure is preserved.\n\nContinue?')"><button class="btn2" type="submit">Rebuild</button></form>
          <form method="POST" action="/portal/meet/${meet.id}/blocks/generate" onsubmit="return confirm('⚠️ Generate Blocks will create races from your division settings.\n\nExisting block assignments will be cleared.\n\nContinue?')" style="display:inline">
              <button class="btn2" type="submit">Generate Blocks ⚠️</button>
            </form>
            <form method="POST" action="/portal/meet/${meet.id}/blocks/auto-build" onsubmit="return confirm('Auto-build blocks using Wichita 2026 schedule order?\n\nThis will organize all races into blocks matching the paper schedule.')" style="display:inline">
              <button class="btn-orange" type="submit">🗓 Auto-Build Schedule</button>
            </form>
            <a class="btn2" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
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
      function getDragAfterElement(zone,y){
        const els=Array.from(zone.querySelectorAll('.race-item:not(.dragging)'));
        return els.reduce((closest,el)=>{
          const box=el.getBoundingClientRect();
          const offset=y-box.top-box.height/2;
          if(offset<0&&offset>closest.offset) return {offset,element:el};
          return closest;
        },{offset:-Infinity,element:null}).element;
      }
      function attachDnD(){
        document.querySelectorAll('.race-item').forEach(el=>{
          if(el.getAttribute('draggable')!=='true') return;
          el.addEventListener('dragstart',e=>{dragRaceId=el.getAttribute('data-race-id');el.classList.add('dragging');e.dataTransfer.setData('text/plain',dragRaceId);saveFilters();});
          el.addEventListener('dragend',()=>el.classList.remove('dragging'));
        });
        document.querySelectorAll('.drop-zone').forEach(zone=>{
          zone.addEventListener('dragover',e=>{
            e.preventDefault();zone.classList.add('over');
            // Show insertion indicator
            const after=getDragAfterElement(zone,e.clientY);
            zone.querySelectorAll('.drop-indicator').forEach(d=>d.remove());
            const indicator=document.createElement('div');
            indicator.className='drop-indicator';
            indicator.style.cssText='height:3px;background:var(--sky2);border-radius:2px;margin:2px 0;';
            if(after) zone.insertBefore(indicator,after);
            else zone.appendChild(indicator);
          });
          zone.addEventListener('dragleave',e=>{
            if(!zone.contains(e.relatedTarget)){zone.classList.remove('over');zone.querySelectorAll('.drop-indicator').forEach(d=>d.remove());}
          });
          zone.addEventListener('drop',async e=>{
            e.preventDefault();zone.classList.remove('over');zone.querySelectorAll('.drop-indicator').forEach(d=>d.remove());
            const raceId=e.dataTransfer.getData('text/plain')||dragRaceId;
            const destBlockId=zone.getAttribute('data-drop-block');
            const afterEl=getDragAfterElement(zone,e.clientY);
            const beforeRaceId=afterEl?afterEl.getAttribute('data-race-id'):'';
            saveFilters();
            const res=await fetch('/api/meet/'+meetId+'/blocks/move-race',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId,destBlockId,beforeRaceId})});
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
  const raceId=String(req.body.raceId||'');
  const destBlockId=String(req.body.destBlockId||'');
  const beforeRaceId=String(req.body.beforeRaceId||''); // optional: insert before this race
  for(const block of meet.blocks||[]) block.raceIds=(block.raceIds||[]).filter(id=>id!==raceId);
  if(destBlockId!=='__unassigned__') {
    const block=(meet.blocks||[]).find(b=>b.id===destBlockId);
    if(!block) return res.status(404).send('Block not found');
    if((block.type||'race')!=='race') return res.status(400).send('Cannot drop races into non-race blocks');
    if(beforeRaceId && block.raceIds.includes(beforeRaceId)) {
      const idx=block.raceIds.indexOf(beforeRaceId);
      block.raceIds.splice(idx,0,raceId);
    } else {
      block.raceIds.push(raceId);
    }
  }
  ensureCurrentRace(meet); meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

app.post('/portal/meet/:meetId/blocks/auto-build', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');

  // Track used race IDs globally to prevent duplicates across blocks
  const usedRaceIds=new Set();
  function findRace(groupLabel, division, distance) {
    const gl=groupLabel.toLowerCase(); const div=division.toLowerCase(); const dist=String(distance).toLowerCase().replace('m','');
    const words=gl.split(' ');
    const r=(meet.races||[]).find(r=>
      !usedRaceIds.has(r.id) &&
      words.every(w=>r.groupLabel?.toLowerCase().includes(w)) &&
      r.division?.toLowerCase()===div &&
      r.distanceLabel?.toLowerCase().replace('m','')===dist &&
      !r.isOpenRace && !r.isQuadRace && !r.isTimeTrial
    );
    if(r) usedRaceIds.add(r.id);
    return r;
  }
  function findOpen(groupLabel) {
    const gl=groupLabel.toLowerCase(); const words=gl.split(' ');
    const r=(meet.races||[]).find(r=>!usedRaceIds.has(r.id)&&r.isOpenRace&&words.every(w=>r.groupLabel?.toLowerCase().includes(w)));
    if(r) usedRaceIds.add(r.id); return r;
  }
  function findTT(groupLabel) {
    const gl=groupLabel.toLowerCase(); const words=gl.split(' ');
    const r=(meet.races||[]).find(r=>!usedRaceIds.has(r.id)&&r.isTimeTrial&&words.every(w=>r.groupLabel?.toLowerCase().includes(w)));
    if(r) usedRaceIds.add(r.id); return r;
  }
  function findQuad(groupLabel, distance) {
    const gl=groupLabel.toLowerCase(); const dist=String(distance).toLowerCase().replace('m','');
    const QUAD_ID_MAP={'freshman girls':'quad_fresh_girls','freshman boys':'quad_fresh_boys',
      'juvenile girls':'quad_juv_girls','juvenile boys':'quad_juv_boys',
      'senior ladies':'quad_sr_ladies','senior men':'quad_sr_men',
      'master ladies':'quad_mast_ladies','master men':'quad_mast_men'};
    const targetId=QUAD_ID_MAP[gl];
    // Find next unused quad race (heat or final) for this group+distance
    const r=(meet.races||[]).find(r=>!usedRaceIds.has(r.id)&&r.isQuadRace&&
      (targetId?r.groupId===targetId:r.groupLabel?.toLowerCase().includes(gl))&&
      r.distanceLabel?.toLowerCase().replace('m','')===dist);
    if(r) usedRaceIds.add(r.id); return r;
  }
  function raceId(r){return r?.id||null;}

  // Build blocks matching Wichita 2026 schedule EXACTLY from paper schedule
  meet.blocks = [
    // ── FRIDAY APR 24 ────────────────────────────────────────────────
    {id:'f1',name:'Friday — Time Trials',day:'Friday Apr 24',type:'race',notes:'5:00pm • One Lap TT • Youngest to Oldest • Determines Open Starting Position',raceIds:[
      raceId((()=>{const r=(meet.races||[]).find(r=>r.isTimeTrial&&r.groupId==='tt_combined');if(r)usedRaceIds.add(r.id);return r;})()),
    ].filter(Boolean)},
    {id:'f2',name:'Friday — Open Races',day:'Friday Apr 24',type:'race',notes:'6:30pm • Rolling Start • Awards Follow Sr Mens Open',raceIds:[
      raceId(findOpen('Juvenile Girls')),    // Race 2
      raceId(findOpen('Juvenile Boys')),     // Race 3
      raceId(findOpen('Freshman Girls')),    // Race 4
      raceId(findOpen('Freshman Boys')),     // Race 5
      raceId(findOpen('Master Ladies')),     // Race 6
      raceId(findOpen('Master Men')),        // Race 7
      raceId(findOpen('Senior Ladies')),     // Race 8
      raceId(findOpen('Senior Men')),        // Race 9
    ].filter(Boolean)},

    // ── SATURDAY APR 25 ───────────────────────────────────────────────
    // Quad Short Race 7:30am — races 10-18
    {id:'s1',name:'Quad Short Race',day:'Saturday Apr 25',type:'race',notes:'7:30am • Warm Up Quad Division Short Race',raceIds:[
      raceId(findQuad('Freshman Girls',300)),   // 10 Heat 1
      raceId(findQuad('Freshman Girls',300)),   // 10 Heat 2
      raceId(findQuad('Juvenile Girls',200)),   // 11
      raceId(findQuad('Juvenile Boys',200)),    // 12
      raceId(findQuad('Freshman Boys',300)),    // 13
      raceId(findQuad('Senior Ladies',300)),    // 14
      raceId(findQuad('Senior Men',300)),       // 15
      raceId(findQuad('Master Ladies',300)),    // 16
      raceId(findQuad('Master Men',300)),       // 17
      raceId(findQuad('Freshman Girls',300)),   // 18 Final
    ].filter(Boolean)},

    // Quad Long Race 8:00am — races 19-27
    {id:'s2',name:'Quad Long Race',day:'Saturday Apr 25',type:'race',notes:'8:00am • Warm Up Quad Division Long Race',raceIds:[
      raceId(findQuad('Juvenile Girls',500)),   // 19
      raceId(findQuad('Juvenile Boys',500)),    // 20
      raceId(findQuad('Freshman Girls',700)),   // 21 Heat 1
      raceId(findQuad('Freshman Girls',700)),   // 21 Heat 2
      raceId(findQuad('Freshman Boys',700)),    // 22
      raceId(findQuad('Senior Ladies',1000)),   // 23
      raceId(findQuad('Senior Men',1000)),      // 24
      raceId(findQuad('Master Ladies',1000)),   // 25
      raceId(findQuad('Master Men',1000)),      // 26
      raceId(findQuad('Freshman Girls',700)),   // 27 Final
    ].filter(Boolean)},

    // Elite Short Block 1 8:45am — races 28-43
    {id:'s3',name:'Elite Short Race — Block 1',day:'Saturday Apr 25',type:'race',notes:'8:45am • Warm Up Standard Elite Divisions Short Race',raceIds:[
      raceId(findRace('Elementary Girls','elite','300')),   // 28 Heat 1-2
      raceId(findRace('Sophomore Men','elite','500')),      // 29 Heat 1-2
      raceId(findRace('Senior Men','elite','500')),         // 30 Heat 1-2
      raceId(findRace('Master Men','elite','500')),         // 31 Heat 1-2
      raceId(findRace('Primary Girls','elite','200')),      // 32 Final
      raceId(findRace('Primary Boys','elite','200')),       // 33 Final
      raceId(findRace('Elementary Girls','elite','300')),   // 34 Final
      raceId(findRace('Elementary Boys','elite','300')),    // 35 Final
      raceId(findRace('Sophomore Ladies','elite','500')),   // 36 Final
      raceId(findRace('Sophomore Men','elite','500')),      // 37 Final
      raceId(findRace('Senior Ladies','elite','500')),      // 38 Final
      raceId(findRace('Senior Men','elite','500')),         // 39 Final
      raceId(findRace('Master Ladies','elite','500')),      // 40 Final
      raceId(findRace('Master Men','elite','500')),         // 41
      raceId(findRace('Esquire Ladies','elite','500')),     // 42
      raceId(findRace('Esquire Men','elite','500')),        // 43
    ].filter(Boolean)},

    // Elite Short Block 2 9:30am — races 44-55
    {id:'s4',name:'Elite Short Race — Block 2',day:'Saturday Apr 25',type:'race',notes:'9:30am • Warm Up Standard Elite Divisions Short Race 2nd Block',raceIds:[
      raceId(findRace('Freshman Girls','elite','300')),     // 44 Heat 1-2
      raceId(findRace('Junior Men','elite','500')),         // 45 Heat 1-2
      raceId(findRace('Tiny Tot Girls','elite','100')),     // 46 Final
      raceId(findRace('Juvenile Girls','elite','200')),     // 47 Final
      raceId(findRace('Juvenile Boys','elite','200')),      // 48 Final
      raceId(findRace('Freshman Girls','elite','300')),     // 49 Final
      raceId(findRace('Freshman Boys','elite','300')),      // 50 Final
      raceId(findRace('Junior Ladies','elite','500')),      // 51 Final
      raceId(findRace('Junior Men','elite','500')),         // 52 Final
      raceId(findRace('Classic Ladies','elite','500')),     // 53 Final
      raceId(findRace('Classic Men','elite','500')),        // 54 Final
      raceId(findRace('Veteran Men','elite','500')),        // 55 Final
    ].filter(Boolean)},

    // Diaper Dash 9:55am — race 56
    {id:'s5',name:'Diaper Dash',day:'Saturday Apr 25',type:'race',notes:'9:55am • Race for Skaters 3 Years Old & Under on Date of Meet',raceIds:
      (meet.races||[]).filter(r=>r.groupLabel?.toLowerCase().includes('diaper')||r.isSkateabilityRace).map(r=>{usedRaceIds.add(r.id);return r.id;}).filter(Boolean)
    },

    // Novice Short 10:00am — races 57-71
    {id:'s6',name:'Novice Short Race',day:'Saturday Apr 25',type:'race',notes:'10:00am • Warm Up Novice Divisions Short Race',raceIds:[
      raceId(findRace('Elementary Girls','novice','300')),  // 57 Heat 1-2
      raceId(findRace('Juvenile Girls','novice','200')),    // 58 Final
      raceId(findRace('Juvenile Boys','novice','200')),     // 59 Final
      raceId(findRace('Elementary Boys','novice','300')),   // 60 Final
      raceId(findRace('Freshman Girls','novice','300')),    // 61 Final
      raceId(findRace('Freshman Boys','novice','300')),     // 62 Final
      raceId(findRace('Sophomore Ladies','novice','500')),  // 63 Final
      raceId(findRace('Sophomore Men','novice','500')),     // 64 Final
      raceId(findRace('Elementary Girls','novice','300')),  // 65 Final (Elem Girls heat final)
      raceId(findRace('Junior Ladies','novice','500')),     // 66 Final
      raceId(findRace('Junior Men','novice','500')),        // 67 Final
      raceId(findRace('Senior Ladies','novice','500')),     // 68 Final
      raceId(findRace('Senior Men','novice','500')),        // 69 Final
      raceId(findRace('Master Ladies','novice','500')),     // 70 Final
      raceId(findRace('Master Men','novice','500')),        // 71 Final
    ].filter(Boolean)},

    // Elite Middle Block 1 10:45am — races 72-87
    {id:'s7',name:'Elite Middle Race — Block 1',day:'Saturday Apr 25',type:'race',notes:'10:45am • Warm Up Standard Elite Divisions Middle Race 1st Block',raceIds:[
      raceId(findRace('Elementary Girls','elite','500')),   // 72 Heat 1-2
      raceId(findRace('Sophomore Men','elite','1000')),     // 73 Heat 1-2
      raceId(findRace('Senior Men','elite','1000')),        // 74 Heat 1-2
      raceId(findRace('Master Men','elite','1000')),        // 75 Heat 1-2
      raceId(findRace('Primary Girls','elite','300')),      // 76 Final
      raceId(findRace('Primary Boys','elite','300')),       // 77 Final
      raceId(findRace('Elementary Girls','elite','500')),   // 78 Final
      raceId(findRace('Elementary Boys','elite','500')),    // 79 Final
      raceId(findRace('Sophomore Ladies','elite','1000')),  // 80 Final
      raceId(findRace('Sophomore Men','elite','1000')),     // 81 Final
      raceId(findRace('Senior Ladies','elite','1000')),     // 82 Final
      raceId(findRace('Senior Men','elite','1000')),        // 83 Final
      raceId(findRace('Master Ladies','elite','700')),      // 84 Final
      raceId(findRace('Master Men','elite','700')),         // 85 Final
      raceId(findRace('Esquire Ladies','elite','700')),     // 86 Final
      raceId(findRace('Esquire Men','elite','700')),        // 87 Final
    ].filter(Boolean)},

    // Elite Middle Block 2 11:45am — races 88-99
    {id:'s8',name:'Elite Middle Race — Block 2',day:'Saturday Apr 25',type:'race',notes:'11:45am • Warm Up Standard Elite Divisions Middle Race 2nd Block',raceIds:[
      raceId(findRace('Freshman Girls','elite','500')),     // 88 Heat 1-2
      raceId(findRace('Junior Men','elite','1000')),        // 89 Heat 1-2
      raceId(findRace('Tiny Tot Girls','elite','200')),     // 90 Final
      raceId(findRace('Juvenile Girls','elite','300')),     // 91 Final
      raceId(findRace('Juvenile Boys','elite','300')),      // 92 Final
      raceId(findRace('Freshman Girls','elite','500')),     // 93 Final
      raceId(findRace('Freshman Boys','elite','500')),      // 94 Final
      raceId(findRace('Junior Ladies','elite','1000')),     // 95 Final
      raceId(findRace('Junior Men','elite','1000')),        // 96 Final
      raceId(findRace('Classic Ladies','elite','1000')),    // 97 Final
      raceId(findRace('Classic Men','elite','1000')),       // 98 Final
      raceId(findRace('Veteran Men','elite','700')),        // 99 Final
    ].filter(Boolean)},

    // Novice Long 12:45pm — races 100-114
    {id:'s9',name:'Novice Long Race',day:'Saturday Apr 25',type:'race',notes:'12:45pm • Warm Up Novice Divisions Long Race',raceIds:[
      raceId(findRace('Elementary Girls','novice','700')),  // 100 Heat 1-2
      raceId(findRace('Juvenile Girls','novice','500')),    // 101 Final
      raceId(findRace('Juvenile Boys','novice','500')),     // 102 Final
      raceId(findRace('Elementary Girls','novice','700')),  // 103 Final
      raceId(findRace('Elementary Boys','novice','700')),   // 104 Final
      raceId(findRace('Freshman Girls','novice','1000')),   // 105 Final
      raceId(findRace('Freshman Boys','novice','1000')),    // 106 Final
      raceId(findRace('Sophomore Ladies','novice','1000')), // 107 Final
      raceId(findRace('Sophomore Men','novice','1000')),    // 108 Final
      raceId(findRace('Junior Ladies','novice','1000')),    // 109 Final
      raceId(findRace('Junior Men','novice','1000')),       // 110 Final
      raceId(findRace('Senior Ladies','novice','1000')),    // 111 Final
      raceId(findRace('Senior Men','novice','1000')),       // 112 Final
      raceId(findRace('Master Ladies','novice','1000')),    // 113 Final
      raceId(findRace('Master Men','novice','1000')),       // 114 Final
    ].filter(Boolean)},

    // Elite Long Block 1 1:45pm — races 115-126
    {id:'s10',name:'Elite Long Race — Block 1',day:'Saturday Apr 25',type:'race',notes:'1:45pm • Warm Up Standard Elite Divisions Long Race 1st Block',raceIds:[
      raceId(findRace('Primary Girls','elite','400')),      // 115 Final
      raceId(findRace('Primary Boys','elite','400')),       // 116 Final
      raceId(findRace('Elementary Girls','elite','700')),   // 117 Final
      raceId(findRace('Elementary Boys','elite','700')),    // 118 Final
      raceId(findRace('Sophomore Ladies','elite','1500')),  // 119 Final
      raceId(findRace('Sophomore Men','elite','1500')),     // 120 Final
      raceId(findRace('Senior Ladies','elite','1500')),     // 121 Final
      raceId(findRace('Senior Men','elite','1500')),        // 122 Final
      raceId(findRace('Master Ladies','elite','1000')),     // 123 Final
      raceId(findRace('Master Men','elite','1000')),        // 124 Final
      raceId(findRace('Esquire Ladies','elite','1000')),    // 125 Final
      raceId(findRace('Esquire Men','elite','1000')),       // 126 Final
    ].filter(Boolean)},

    // Elite Long Block 2 2:00pm — races 127-136
    {id:'s11',name:'Elite Long Race — Block 2',day:'Saturday Apr 25',type:'race',notes:'2:00pm • Warm Up Standard Elite Divisions Long Race 2nd Block',raceIds:[
      raceId(findRace('Tiny Tot Girls','elite','300')),     // 127 Final
      raceId(findRace('Juvenile Girls','elite','500')),     // 128 Final
      raceId(findRace('Juvenile Boys','elite','500')),      // 129 Final
      raceId(findRace('Freshman Girls','elite','1000')),    // 130 Final
      raceId(findRace('Freshman Boys','elite','1000')),     // 131 Final
      raceId(findRace('Junior Ladies','elite','1500')),     // 132 Final
      raceId(findRace('Junior Men','elite','1500')),        // 133 Final
      raceId(findRace('Classic Ladies','elite','1500')),    // 134 Final
      raceId(findRace('Classic Men','elite','1500')),       // 135 Final
      raceId(findRace('Veteran Men','elite','1000')),       // 136 Final
    ].filter(Boolean)},

    // Junior Race of Champions 3:30pm — races 137-138
    {id:'s12a',name:'Junior Race of Champions',day:'Saturday Apr 25',type:'race',notes:'3:30pm • Top 3 placements from Standard Elite — Freshman, Elementary, Juvenile, Primary',raceIds:
      (meet.races||[]).filter(r=>!usedRaceIds.has(r.id)&&r.groupLabel?.toLowerCase().includes('champion')&&(r.groupLabel?.toLowerCase().includes('junior')||r.groupLabel?.toLowerCase().includes('girl')||r.groupLabel?.toLowerCase().includes('boy'))).map(r=>{usedRaceIds.add(r.id);return r.id;})
    },

    // Senior Race of Champions 4:00pm — races 139-140
    {id:'s12b',name:'Senior Race of Champions',day:'Saturday Apr 25',type:'race',notes:'4:00pm • Top 3 placements from Standard Elite — Sophomore, Junior, Senior, Classic, Masters',raceIds:
      (meet.races||[]).filter(r=>!usedRaceIds.has(r.id)&&r.groupLabel?.toLowerCase().includes('champion')).map(r=>{usedRaceIds.add(r.id);return r.id;})
    },

    {id:'s13',name:'Awards Presentation',day:'Saturday Apr 25',type:'awards',notes:'4:30pm • Trophies for Saturday Events & Triple Crown Participation T-Shirts • Presentation of 25/26 Crystal Triple Crown Championship Awards',raceIds:[]},

    // ── SUNDAY APR 26 ─────────────────────────────────────────────────
    // 2 Mixed Relays 7:00am — races 141-148
    {id:'u1',name:'Warm Up 2 Mixed Relays',day:'Sunday Apr 26',type:'race',notes:'7:00am • Relay every 2 laps',raceIds:
      (meet.races||[]).filter(r=>!usedRaceIds.has(r.id)&&r.isRelayRace&&(r.groupLabel?.toLowerCase().includes('2 mixed')||r.groupLabel?.toLowerCase().includes('2-mixed')||r.groupLabel?.toLowerCase().includes('elementary 2')||r.groupLabel?.toLowerCase().includes('sophomore 2')||r.groupLabel?.toLowerCase().includes('primary 2')||r.groupLabel?.toLowerCase().includes('masters 2')||r.groupLabel?.toLowerCase().includes('veteran 2')||r.groupLabel?.toLowerCase().includes('senior 2 mixed'))).map(r=>{usedRaceIds.add(r.id);return r.id;})
    },

    // 3 Mixed Relays 8:00am — races 149-153
    {id:'u2',name:'Warm Up 3 Mixed Relays',day:'Sunday Apr 26',type:'race',notes:'8:00am • 3 laps each 1X',raceIds:
      (meet.races||[]).filter(r=>!usedRaceIds.has(r.id)&&r.isRelayRace&&(r.groupLabel?.toLowerCase().includes('3 mixed')||r.groupLabel?.toLowerCase().includes('3-mixed')||r.groupLabel?.toLowerCase().includes('senior 3')||r.groupLabel?.toLowerCase().includes('juvenile 3')||r.groupLabel?.toLowerCase().includes('master + veteran')||r.groupLabel?.toLowerCase().includes('freshman 3'))).map(r=>{usedRaceIds.add(r.id);return r.id;})
    },

    // 4 Mixed Relay Finals 8:30am — races 154-157
    {id:'u3',name:'Warm Up 4 Mixed Relay Finals',day:'Sunday Apr 26',type:'race',notes:'8:30am',raceIds:
      (meet.races||[]).filter(r=>!usedRaceIds.has(r.id)&&r.isRelayRace&&(r.groupLabel?.toLowerCase().includes('4 mixed')||r.groupLabel?.toLowerCase().includes('4-mixed')||r.groupLabel?.toLowerCase().includes('juvenile 4')||r.groupLabel?.toLowerCase().includes('freshman 4')||r.groupLabel?.toLowerCase().includes('masters 4')||r.groupLabel?.toLowerCase().includes('senior 4 mixed'))).map(r=>{usedRaceIds.add(r.id);return r.id;})
    },

    // 4 Person Relays 9:00am — races 158-163
    {id:'u4',name:'Warm Up 4 Person Relays',day:'Sunday Apr 26',type:'race',notes:'9:00am',raceIds:
      (meet.races||[]).filter(r=>!usedRaceIds.has(r.id)&&r.isRelayRace&&(r.groupLabel?.toLowerCase().includes('4 girl')||r.groupLabel?.toLowerCase().includes('4 boy')||r.groupLabel?.toLowerCase().includes('4 lady')||r.groupLabel?.toLowerCase().includes('4 man')||r.groupLabel?.toLowerCase().includes('4 person'))).map(r=>{usedRaceIds.add(r.id);return r.id;})
    },

    // 3 Person Relays 9:45am — races 164-168
    {id:'u5',name:'Warm Up 3 Person Relays',day:'Sunday Apr 26',type:'race',notes:'9:45am • 3 laps each 1X',raceIds:
      (meet.races||[]).filter(r=>!usedRaceIds.has(r.id)&&r.isRelayRace&&(r.groupLabel?.toLowerCase().includes('3 girl')||r.groupLabel?.toLowerCase().includes('3 boy')||r.groupLabel?.toLowerCase().includes('3 lady')||r.groupLabel?.toLowerCase().includes('3 man')||r.groupLabel?.toLowerCase().includes('3 person'))).map(r=>{usedRaceIds.add(r.id);return r.id;})
    },

    // 2 Person Relay Finals 10:00am — races 169-178
    {id:'u6',name:'Warm Up 2 Person Relay Finals',day:'Sunday Apr 26',type:'race',notes:'10:00am • Relay 1-5 laps',raceIds:
      (meet.races||[]).filter(r=>!usedRaceIds.has(r.id)&&r.isRelayRace&&(r.groupLabel?.toLowerCase().includes('2 girl')||r.groupLabel?.toLowerCase().includes('2 boy')||r.groupLabel?.toLowerCase().includes('2 lady')||r.groupLabel?.toLowerCase().includes('2 man')||r.groupLabel?.toLowerCase().includes('2 person'))).map(r=>{usedRaceIds.add(r.id);return r.id;})
    },

    {id:'u7',name:'Awards — Relays & High Point Team',day:'Sunday Apr 26',type:'awards',notes:'11:45am • End of Sundays Events — Thank You for Coming to the Spring Fling!',raceIds:[]},
  ].map(b=>({...b,raceIds:(b.raceIds||[]).filter(Boolean)}));

    // Deduplicate raceIds within each block (prevent same race appearing twice)
  meet.blocks=meet.blocks.map(b=>({...b,raceIds:[...new Set((b.raceIds||[]).filter(Boolean))]}));
  // Put any remaining unassigned races into a catch-all block
  const assignedIds=new Set(meet.blocks.flatMap(b=>b.raceIds||[]));
  const remaining=(meet.races||[]).filter(r=>!assignedIds.has(r.id)).map(r=>r.id);
  if(remaining.length) meet.blocks.push({id:'blk_remaining',name:'Unscheduled Races',day:'Saturday Apr 25',type:'race',notes:'',raceIds:remaining});

  meet.updatedAt=nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/blocks/generate', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  generateBaseRacesForMeet(meet);
  generateOpenRacesForMeet(meet);
  generateQuadRacesForMeet(meet);
  rebuildRaceAssignments(meet);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  meet.updatedAt=nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

// ── Race Day ──────────────────────────────────────────────────────────────────

function raceDaySubTabs(meet,active) {
  return `<div class="sub-tabs">${[['director','Director',`/portal/meet/${meet.id}/race-day/director`],['judges','Judges',`/portal/meet/${meet.id}/race-day/judges`],['tt','⏱ Time Trials',`/portal/meet/${meet.id}/race-day/tt`],['announcer','Announcer',`/portal/meet/${meet.id}/race-day/announcer`],['live','Live View',`/portal/meet/${meet.id}/race-day/live`]].map(([k,label,href])=>`<a class="sub-tab ${active===k?'active':''}" href="${href}">${label}</a>`).join('')}</div>`;
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

  // Redirect judges/announcers away from director tab
  if(mode==='director'&&!hasRole(req.user,'meet_director')&&!hasRole(req.user,'super_admin')) {
    return res.redirect(`/portal/meet/${meet.id}/race-day/${hasRole(req.user,'judge')?'judges':'announcer'}`);
  }
  if(mode==='judges'&&!hasRole(req.user,'judge')&&!hasRole(req.user,'meet_director')&&!hasRole(req.user,'super_admin')) {
    return res.redirect(`/portal/meet/${meet.id}/race-day/announcer`);
  }
  if(mode==='director') {
    const raceOptions=info.ordered.map((r,idx)=>`<option value="${r.id}" ${r.id===meet.currentRaceId?'selected':''}>${idx+1}. ${r.groupLabel} — ${cap(r.division)} — ${r.distanceLabel} — ${raceDisplayStage(r)}</option>`).join('');
    body+=`
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card orange"><div class="stat-label">Current Race</div><div class="stat-value">${current?esc(current.groupLabel):'—'}</div><div class="stat-sub">${current?`${esc(cap(current.division))} • ${esc(current.distanceLabel)} • ${esc(raceDisplayStage(current))}`:''}</div></div>
        <div class="stat-card yellow"><div class="stat-label">In Staging</div><div class="stat-value">${info.next?esc(info.next.groupLabel):'—'}</div><div class="stat-sub">${info.next?`${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}`:''}</div></div>
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
            <a class="btn-sky" href="/meet/${meet.id}/tv" target="_blank">📺 TV Display</a>
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
              <label class="toggle-wrap"><input type="radio" name="resultsMode" value="places" ${current.resultsMode!=='times'&&!current.isTimeTrial?'checked':''} style="width:auto" /> <span style="font-size:14px;font-weight:600">Places</span></label>
              <label class="toggle-wrap"><input type="radio" name="resultsMode" value="times"  ${current.resultsMode==='times'||current.isTimeTrial ?'checked':''} style="width:auto" /> <span style="font-size:14px;font-weight:600">Times</span></label>
            </div>
            <div style="overflow-x:auto">
              <table class="table">
                <thead><tr><th>Lane</th><th>Helmet</th><th>Skater</th><th>Team</th><th>Place</th><th>Time</th><th>Status</th></tr></thead>
                <tbody>${currentLanes.map(l=>{const reg=regMap.get(Number(l.registrationId));return`<tr>
                  <td>${l.lane}</td><td>${l.helmetNumber?'#'+esc(l.helmetNumber):''}</td>
                  <td><input name="skaterName_${l.lane}" value="${esc(l.skaterName)}" />${reg?.sponsor?`<div class="sponsor-line">Sponsor: ${esc(reg.sponsor)}</div>`:''}</td>
                  <td><input name="team_${l.lane}"       value="${esc(l.team)}"       /></td>
                  <td><input name="place_${l.lane}" value="${esc(l.place)}" ${current.isTimeTrial?'style="opacity:.3" tabindex="-1"':''} /></td>
                  <td><input name="time_${l.lane}"  value="${esc(l.time)}"  ${!current.isTimeTrial&&current.resultsMode!=='times'?'style="opacity:.3" tabindex="-1"':''} /></td>
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
          ${current.isOpenRace?`
          <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div style="font-weight:700;font-size:14px">Add Walk-Up Skater</div>
              <button class="btn2 btn-sm" type="button" onclick="var f=document.getElementById('open-add-form');f.style.display=f.style.display==='none'?'flex':'none'">+ Add</button>
            </div>
            <form id="open-add-form" method="POST" action="/portal/meet/${meet.id}/race-day/judges/open-add-skater" style="display:none;gap:8px;flex-wrap:wrap;align-items:flex-end">
              <input type="hidden" name="raceId" value="${esc(current.id)}" />
              <input type="hidden" name="registrationId" id="oas-reg-id" />
              <input type="hidden" name="helmetNumber" id="oas-helmet" />
              <input type="hidden" name="team" id="oas-team" />
              <div style="flex:1;min-width:180px">
                <label style="font-size:11px">Skater Name</label>
                <input list="oas-list" placeholder="Type name..." autocomplete="off" oninput="oasFill(this)" name="skaterName" style="width:100%" />
                <datalist id="oas-list">
                  ${(meet.registrations||[]).map(r=>`<option value="${esc(r.name)}" data-id="${r.id}" data-helmet="${esc(r.helmetNumber||'')}" data-team="${esc(r.team||'')}">`).join('')}
                </datalist>
              </div>
              <div><label style="font-size:11px">Helmet#</label><input name="helmetNumberManual" id="oas-helmet-show" placeholder="#" style="width:70px" /></div>
              <button class="btn-orange btn-sm" type="submit">Add to Race</button>
            </form>
            <script>
              function oasFill(inp){const opt=document.querySelector('#oas-list option[value="'+inp.value.replace(/'/g,"\'")+'"');if(opt){document.getElementById('oas-reg-id').value=opt.getAttribute('data-id')||'';document.getElementById('oas-helmet').value=opt.getAttribute('data-helmet')||'';document.getElementById('oas-team').value=opt.getAttribute('data-team')||'';document.getElementById('oas-helmet-show').value=opt.getAttribute('data-helmet')||'';}}
            </script>
          </div>`:''}
        </div>`:`<div class="card"><div class="muted">No race selected yet.</div></div>`}`;

  } else if(mode==='announcer') {
    body+=`
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card orange"><div class="stat-label">Current Race</div><div class="stat-value">${current?esc(current.groupLabel):'—'}</div><div class="stat-sub">${current?`${esc(cap(current.division))} • ${esc(current.distanceLabel)}`:''}</div></div>
        <div class="stat-card yellow"><div class="stat-label">In Staging</div><div class="stat-value">${info.next?esc(info.next.groupLabel):'—'}</div><div class="stat-sub">${info.next?`${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}`:''}</div></div>
        <div class="stat-card sky"><div class="stat-label">After That</div><div class="stat-value">${info.coming[0]?esc(info.coming[0].groupLabel):'—'}</div><div class="stat-sub">${info.coming[0]?`${esc(cap(info.coming[0].division))} • ${esc(info.coming[0].distanceLabel)}`:''}</div></div>
      </div>
      ${announcerBoxHtml(current,currentLanes.map(l=>{const reg=regMap.get(Number(l.registrationId));return{...l,sponsor:reg?.sponsor||''};}))}`; 
  } else {
    body+=`
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card orange"><div class="stat-label">Current Race</div><div class="stat-value">${current?esc(current.groupLabel):'—'}</div><div class="stat-sub">${current?`${esc(cap(current.division))} • Race ${Math.max(info.idx+1,1)} of ${info.ordered.length}`:''}</div></div>
        <div class="stat-card yellow"><div class="stat-label">In Staging</div><div class="stat-value">${info.next?esc(info.next.groupLabel):'—'}</div><div class="stat-sub">${info.next?`${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}`:''}</div></div>
        <div class="stat-card green"><div class="stat-label">Last Result</div><div class="stat-value">${recent[0]?esc(recent[0].groupLabel):'Waiting'}</div><div class="stat-sub">${recent[0]?`${esc(cap(recent[0].division))} • ${esc(recent[0].distanceLabel)}`:''}</div></div>
      </div>`;
  }
  res.send(pageShell({title:'Race Day',user:req.user,meet,activeTab:'race-day', bodyHtml:body}));
});

app.get('/portal/meet/:meetId/race-day/tt', requireRole('judge','meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');

  // Get all TT races sorted youngest to oldest by age range
  const ttRaces=(meet.races||[]).filter(r=>r.isTimeTrial)
    .sort((a,b)=>{
      const ageA=parseInt((a.ages||'999').match(/\d+/)?.[0]||999);
      const ageB=parseInt((b.ages||'999').match(/\d+/)?.[0]||999);
      return ageA-ageB;
    });

  // Build one flat list of ALL skaters from ALL TT races, sorted youngest to oldest
  const ttConfig=meet.ttConfig||{};
  const enabledTTGroupIds=new Set((ttConfig.groups||[]).filter(g=>g.enabled!==false).map(g=>g.id));
  const allSkaters=ttRaces.flatMap(race=>{
    return (race.laneEntries||[])
      .filter(e=>e.skaterName)
      .map(e=>{
        const reg=(meet.registrations||[]).find(r=>String(r.id)===String(e.registrationId||''));
        const openGrp=reg?getOpenGroupIdForReg(reg):'';
        // Map open group id to tt group id for enabled check
        const ttGrpId='tt_'+openGrp.replace('open_','');
        return {...e, race, groupLabel:race.groupLabel, ageNum:parseInt((race.ages||'999').match(/\d+/)?.[0]||999), ttGrpId};
      });
  }).sort((a,b)=>a.ageNum-b.ageNum);

  // Overall fastest times leaderboard
  const allTimes=ttRaces.flatMap(r=>(r.laneEntries||[]).filter(e=>e.time&&e.skaterName).map(e=>({...e,groupLabel:r.groupLabel})))
    .sort((a,b)=>parseFloat(a.time||999)-parseFloat(b.time||999));

  // Skater dropdown for posting new times
  const skaterList=(meet.registrations||[])
    .sort((a,b)=>Number(a.age||0)-Number(b.age||0))
    .map(r=>`<option value="${esc(r.name)}" data-id="${r.id}" data-helmet="${esc(r.helmetNumber||'')}" data-team="${esc(r.team||'')}" data-race="${esc(ttRaces.find(t=>getOpenGroupIdForReg(r)===t.groupId.replace('open_','').replace('_','')||t.ages)?.id||'')}">`)
    .join('');

  // All skaters table
  const skaterRows=allSkaters.map(e=>`
    <tr id="sk-${esc(String(e.registrationId||e.lane))}">
      <td style="color:var(--muted);font-size:12px">${esc(e.groupLabel||'')}</td>
      <td>${esc(e.helmetNumber?'#'+e.helmetNumber:'')}</td>
      <td><strong>${esc(e.skaterName||'')}</strong></td>
      <td>${esc(e.team||'')}</td>
      <td><strong style="color:var(--orange);font-size:16px">${esc(e.time||'—')}</strong></td>
      <td>
        <form method="POST" action="/portal/meet/${meet.id}/race-day/judges/tt-post" style="display:flex;gap:4px">
          <input type="hidden" name="raceId" value="${esc(e.race.id)}" />
          <input type="hidden" name="registrationId" value="${esc(String(e.registrationId||''))}" />
          <input type="hidden" name="skaterName" value="${esc(e.skaterName||'')}" />
          <input type="hidden" name="helmetNumber" value="${esc(e.helmetNumber||'')}" />
          <input type="hidden" name="team" value="${esc(e.team||'')}" />
          <input name="time" value="${esc(e.time||'')}" placeholder="0.00" style="width:72px" />
          <button class="btn-orange btn-sm" type="submit">✓</button>
        </form>
      </td>
    </tr>`).join('');

  const leaderboard=allTimes.slice(0,20).map((e,i)=>`
    <tr>
      <td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
      <td>${esc(e.helmetNumber?'#'+e.helmetNumber:'')}</td>
      <td><strong>${esc(e.skaterName||'')}</strong></td>
      <td style="font-size:11px;color:var(--muted)">${esc(e.groupLabel||'')}</td>
      <td><strong style="color:var(--orange)">${esc(e.time)}</strong></td>
    </tr>`).join('');

  // Quick-post form — type name, enter time, post
  res.send(pageShell({title:'Time Trials',user:req.user,meet,activeTab:'race-day',bodyHtml:`
    <div class="page-header"><h1>⏱ Time Trials</h1><div class="sub">${esc(meet.meetName)} • All groups • Youngest to Oldest</div></div>
    ${raceDaySubTabs(meet,'tt')}
    <div style="display:grid;grid-template-columns:1fr 280px;gap:20px;align-items:start">
      <div>
        <!-- Quick post form at top -->
        <div class="card" style="margin-bottom:16px;background:var(--navy);color:#fff">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-family:Orbitron,sans-serif;font-size:13px;font-weight:700;color:var(--orange)">⚡ POST TIME</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5)">${ttRaces.length?`${(ttRace?.laneEntries||[]).filter(e=>e.time).length} of ${(ttRace?.laneEntries||[]).filter(e=>e.skaterName).length} posted`:'No TT race found'}</div>
          </div>
          <form method="POST" action="/portal/meet/${meet.id}/race-day/judges/tt-post" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
            <input type="hidden" name="raceId" id="quick-race-id" value="${esc(ttRaces[0]?.id||'')}" />
            <input type="hidden" name="registrationId" id="quick-reg-id" />
            <input type="hidden" name="skaterName" id="quick-name" />
            <input type="hidden" name="helmetNumber" id="quick-helmet" />
            <input type="hidden" name="team" id="quick-team" />
            <div style="flex:1;min-width:200px">
              <label style="font-size:11px;color:rgba(255,255,255,.6)">Skater Name or Helmet#</label>
              <input id="quick-search" list="quick-list" placeholder="Type name..." autocomplete="off"
                style="background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.2)"
                oninput="quickFill(this)" />
              <datalist id="quick-list">
                ${(meet.registrations||[]).sort((a,b)=>Number(a.age||0)-Number(b.age||0)).map(r=>`<option value="${esc(r.name)}" data-id="${r.id}" data-helmet="${esc(r.helmetNumber||'')}" data-team="${esc(r.team||'')}" data-race-id="${esc(ttRaces.find(t=>t.groupLabel?.toLowerCase().includes(getOpenGroupIdForReg(r).replace('open_','').split('_')[0]))?.id||ttRaces[0]?.id||'')}">`).join('')}
              </datalist>
            </div>
            <div>
              <label style="font-size:11px;color:rgba(255,255,255,.6)">Time (seconds)</label>
              <input id="quick-time" name="time" placeholder="0.00" style="width:90px;background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.2);font-size:18px;font-family:Orbitron,sans-serif" />
            </div>
            <button class="btn-orange" type="submit" style="font-size:16px;padding:10px 24px">Post ✓</button>
          </form>
        </div>

        <!-- All skaters table -->
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-weight:700">All Skaters — Youngest to Oldest</div>
            <button class="btn2 btn-sm" onclick="document.getElementById('add-skater-form').style.display=document.getElementById('add-skater-form').style.display==='none'?'flex':'none'">+ Add Skater</button>
          </div>
          <div id="add-skater-form" style="display:none;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid var(--border)">
            <form method="POST" action="/portal/meet/${meet.id}/race-day/judges/tt-post" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;width:100%">
              <input type="hidden" name="raceId" value="${esc(ttRaces[0]?.id||'')}" />
              <input type="hidden" name="registrationId" id="add-reg-id" />
              <input type="hidden" name="helmetNumber" id="add-helmet" />
              <input type="hidden" name="skaterName" id="add-sname" />
              <input type="hidden" name="team" id="add-team" />
              <input type="hidden" name="age" id="add-age" />
              <input type="hidden" name="gender" id="add-gender" />
              <div style="flex:1;min-width:180px">
                <label style="font-size:11px">Skater Name</label>
                <input list="add-skater-list" placeholder="Type name or search..." autocomplete="off" oninput="addFill(this)" style="width:100%" id="add-name-input" />
                <datalist id="add-skater-list">
                  ${(meet.registrations||[]).map(r=>`<option value="${esc(r.name)}" data-id="${r.id}" data-helmet="${esc(r.helmetNumber||'')}" data-team="${esc(r.team||'')}" data-age="${esc(String(r.age||''))}" data-gender="${esc(r.gender||'')}">`).join('')}
                </datalist>
              </div>
              <div><label style="font-size:11px">Helmet#</label><input id="add-helmet-show" name="helmetNumberManual" placeholder="#" style="width:70px" /></div>
              <div><label style="font-size:11px">Age (walk-up)</label><input id="add-age-show" placeholder="e.g. 12" style="width:60px" oninput="document.getElementById('add-age').value=this.value" /></div>
              <div><label style="font-size:11px">M/F</label><input id="add-gender-show" placeholder="M/F" style="width:44px" oninput="document.getElementById('add-gender').value=this.value" /></div>
              <div><label style="font-size:11px">Time</label><input name="time" placeholder="0.00" style="width:80px" /></div>
              <button class="btn-orange btn-sm" type="submit">Add + Post</button>
            </form>
          </div>
          <table class="table" style="font-size:13px">
            <thead><tr><th>Group</th><th>Helmet</th><th>Skater</th><th>Team</th><th>Time</th><th>Update</th></tr></thead>
            <tbody>${skaterRows||'<tr><td colspan="6" class="muted">No skaters found in TT races</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <!-- Leaderboard -->
      <div style="position:sticky;top:80px">
        <div class="card" style="background:var(--navy);color:#fff">
          <div style="font-family:Orbitron,sans-serif;font-size:12px;font-weight:700;color:var(--orange);margin-bottom:12px">🏆 OVERALL FASTEST</div>
          ${leaderboard?`<table style="width:100%;font-size:12px;border-collapse:collapse">
            <thead><tr style="color:rgba(255,255,255,.5);font-size:10px"><th style="text-align:left;padding:4px">#</th><th style="text-align:left;padding:4px">Helmet</th><th style="text-align:left;padding:4px">Skater</th><th style="text-align:right;padding:4px">Time</th></tr></thead>
            <tbody>${leaderboard}</tbody>
          </table>`:'<div style="color:rgba(255,255,255,.4);text-align:center;padding:20px">No times yet</div>'}
        </div>
      </div>
    </div>
    <script>
      function addFill(inp) {
        const opt=document.querySelector('#add-skater-list option[value="'+inp.value.replace(/'/g,"\'")+'"]');
        if(opt) {
          document.getElementById('add-reg-id').value=opt.getAttribute('data-id')||'';
          document.getElementById('add-helmet').value=opt.getAttribute('data-helmet')||'';
          document.getElementById('add-sname').value=inp.value;
          document.getElementById('add-team').value=opt.getAttribute('data-team')||'';
          document.getElementById('add-helmet-show').value=opt.getAttribute('data-helmet')||'';
          const age=opt.getAttribute('data-age')||''; const gender=opt.getAttribute('data-gender')||'';
          document.getElementById('add-age').value=age;
          document.getElementById('add-age-show').value=age;
          document.getElementById('add-gender').value=gender;
          document.getElementById('add-gender-show').value=gender;
        }
      }
      function quickFill(inp) {
        const opt=document.querySelector('#quick-list option[value="'+inp.value.replace(/'/g,"\'")+'"]');
        if(opt) {
          document.getElementById('quick-reg-id').value=opt.getAttribute('data-id')||'';
          document.getElementById('quick-helmet').value=opt.getAttribute('data-helmet')||'';
          document.getElementById('quick-name').value=inp.value;
          document.getElementById('quick-team').value=opt.getAttribute('data-team')||'';
          const raceId=opt.getAttribute('data-race-id')||'';
          if(raceId) document.getElementById('quick-race-id').value=raceId;
          document.getElementById('quick-time').focus();
        }
      }
    </script>`}));
});



app.post('/portal/meet/:meetId/race-day/judges/open-add-skater', requireRole('judge','meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||'')&&r.isOpenRace);
  if(!race) return res.redirect(`/portal/meet/${req.params.meetId}/race-day/judges`);
  const skaterName=String(req.body.skaterName||'').trim();
  const regId=String(req.body.registrationId||'').trim();
  const helmetNumber=String(req.body.helmetNumber||req.body.helmetNumberManual||'').trim();
  const team=String(req.body.team||'').trim();
  if(!skaterName) return res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
  // Don't add if already in race
  const already=(race.laneEntries||[]).find(e=>e.skaterName===skaterName||(regId&&String(e.registrationId||'')===regId));
  if(!already) {
    const nextLane=(race.laneEntries||[]).length+1;
    race.laneEntries.push({lane:nextLane,registrationId:regId,helmetNumber,skaterName,team,place:'',time:'',status:''});
  }
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
});

app.post('/portal/meet/:meetId/race-day/judges/save', requireRole('judge','meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||''));
  if(!race) return res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
  const laneCount=(race.isOpenRace||isOpenDivision(race.division))?Math.max((race.laneEntries||[]).length,1):Math.max(1,Number(meet.lanes)||4);
  const prevEntries=[...(race.laneEntries||[])];
  race.laneEntries=[];
  for(let i=1;i<=laneCount;i++) {
    const existing=prevEntries.find(x=>Number(x.lane)===i)||{};
    race.laneEntries.push({lane:i,registrationId:existing.registrationId||'',helmetNumber:existing.helmetNumber||'',skaterName:String(req.body[`skaterName_${i}`]||'').trim(),team:String(req.body[`team_${i}`]||'').trim(),place:String(req.body[`place_${i}`]||'').trim(),time:String(req.body[`time_${i}`]||'').trim(),status:String(req.body[`status_${i}`]||'').trim()});
  }
  race.resultsMode=String(req.body.resultsMode||'places')==='times'?'times':'places';
  race.notes=String(req.body.notes||''); race.status=req.body.action==='close'?'closed':'open';
  race.closedAt=req.body.action==='close'?nowIso():race.closedAt;
  meet.updatedAt=nowIso();
  if(req.body.action==='close') {
    const info=currentRaceInfo(meet);
    if(info.current&&info.current.id===race.id) { const next=info.ordered[info.idx+1]; if(next){meet.currentRaceId=next.id;meet.currentRaceIndex=info.idx+1;} }

    // Auto-qualify: if this is a heat, populate top 3 into the final
    if(race.stage==='heat' && race.parentRaceKey) {
      const final=(meet.races||[]).find(r=>r.parentRaceKey===race.parentRaceKey&&(r.stage==='final'||r.isFinal)&&r.id!==race.id);
      if(final) {
        // Get top qualifiers from this heat (top 3, skip DNS/DQ)
        const qualifiers=(race.laneEntries||[])
          .filter(e=>e.skaterName&&!['DNS','DQ','Scratch'].includes(e.status||''))
          .sort((a,b)=>Number(a.place||999)-Number(b.place||999))
          .slice(0,3);
        // Add to final if not already there
        for(const q of qualifiers) {
          const already=(final.laneEntries||[]).find(e=>e.registrationId&&e.registrationId===q.registrationId);
          if(!already) {
            const nextLane=(final.laneEntries||[]).length+1;
            final.laneEntries.push({lane:nextLane,registrationId:q.registrationId,helmetNumber:q.helmetNumber,skaterName:q.skaterName,team:q.team,place:'',time:'',status:''});
          }
        }
      }
    }
  }
  saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
});

app.post('/portal/meet/:meetId/race-day/judges/tt-post', requireRole('judge','meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||'')&&r.isTimeTrial);
  if(!race) return res.redirect(`/portal/meet/${req.params.meetId}/race-day/judges`);
  const time=String(req.body.time||'').trim();
  const regId=String(req.body.registrationId||'').trim();
  const skaterName=String(req.body.skaterName||'').trim();
  const helmetNumber=String(req.body.helmetNumber||req.body.helmetNumberManual||'').trim();
  const team=String(req.body.team||'').trim();
  const walkUpAge=String(req.body.age||'').trim();
  const walkUpGender=String(req.body.gender||'').trim();
  if(!time) return res.redirect(`/portal/meet/${meet.id}/race-day/tt`);
  // Remove existing entry for this skater if re-posting
  if(regId) race.laneEntries=(race.laneEntries||[]).filter(e=>String(e.registrationId||'')!==regId);
  else if(skaterName) race.laneEntries=(race.laneEntries||[]).filter(e=>!(e.skaterName===skaterName&&!e.registrationId));
  // Assign a pseudo-lane as running order number
  const nextLane=(race.laneEntries||[]).length+1;
  race.laneEntries.push({lane:nextLane,registrationId:regId,helmetNumber,skaterName,team,age:walkUpAge,gender:walkUpGender,time,place:'',status:''});
  // Auto-assign places by time within each age group
  const groups={};
  race.laneEntries.forEach(e=>{
    if(!e.time||!e.skaterName) return;
    // Find their open group — use registration if available, else use stored age/gender on entry (walk-ups)
    const reg=(meet.registrations||[]).find(r=>String(r.id)===String(e.registrationId||''));
    const grp=reg?getOpenGroupIdForReg(reg):(e.age?getOpenGroupIdForReg({age:e.age,gender:e.gender,divisionGroupId:''}):'other');
    if(!groups[grp]) groups[grp]=[];
    groups[grp].push(e);
  });
  Object.values(groups).forEach(grp=>{
    grp.sort((a,b)=>parseFloat(a.time||999)-parseFloat(b.time||999))
       .forEach((e,i)=>{const orig=race.laneEntries.find(x=>x.lane===e.lane);if(orig)orig.groupPlace=String(i+1);});
  });
  // Overall place by time across all
  const allTimed=[...race.laneEntries].filter(e=>e.time).sort((a,b)=>parseFloat(a.time||999)-parseFloat(b.time||999));
  allTimed.forEach((e,i)=>{const orig=race.laneEntries.find(x=>x.lane===e.lane);if(orig)orig.place=String(i+1);});
  if(req.body.action==='close') { race.status='closed'; race.closedAt=nowIso(); race.isFinal=true; }
  meet.updatedAt=nowIso(); saveDb(req.db);
  // Fire TT result alert for this skater
  if(regId) {
    const entry=race.laneEntries.find(e=>String(e.registrationId||'')===regId);
    if(entry) fireResultAlerts(meet, race);
  }
  res.redirect(`/portal/meet/${meet.id}/race-day/tt`);
});

app.post('/portal/meet/:meetId/race-day/judges/tt-remove', requireRole('judge','meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||'')&&r.isTimeTrial);
  if(!race) return res.redirect(`/portal/meet/${req.params.meetId}/race-day/judges`);
  const regId=String(req.body.registrationId||'');
  race.laneEntries=(race.laneEntries||[]).filter(e=>String(e.registrationId||'')!==regId);
  // Re-number lanes and re-assign places
  race.laneEntries.forEach((e,i)=>e.lane=i+1);
  const sorted=[...race.laneEntries].sort((a,b)=>parseFloat(a.time||'999')-parseFloat(b.time||'999'));
  sorted.forEach((e,i)=>{ const orig=race.laneEntries.find(x=>x.lane===e.lane); if(orig) orig.place=String(i+1); });
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
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
  meet.updatedAt=nowIso(); saveDb(req.db);
  fireRaceAlerts(meet, idx, info.ordered);
  res.json({ok:true});
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

app.get('/portal/meet/:meetId/fix-quad-helmets', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.status(404).send('not found');
  // Enable quad for specific helmet numbers from paper schedule
  const helmets=String(req.query.h||'').split(',').map(h=>h.trim()).filter(Boolean);
  let updated=0;
  for(const reg of meet.registrations||[]) {
    if(helmets.includes(String(reg.helmetNumber||''))) {
      if(!reg.options) reg.options={};
      reg.options.quad=true;
      reg.totalCost=calcRegistrationCost(meet,reg.options);
      updated++;
    }
  }
  rebuildRaceAssignments(meet);
  generateQuadRacesForMeet(meet);
  saveDb(req.db);
  res.send('Updated '+updated+' skaters. <a href="/portal/meet/'+meet.id+'/quad-builder">Check Quad Builder</a>');
});

app.get('/portal/meet/:meetId/debug-quad', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  const result={
    quadGroups:(meet.quadGroups||[]).map(qg=>({id:qg.id,label:qg.label,enabled:qg.enabled,distances:qg.distances})),
    freshBoyRegs:(meet.registrations||[]).filter(r=>!!r.options?.quad&&getQuadGroupIdForReg(r)==='quad_fresh_boys').map(r=>({name:r.name,age:r.age,gender:r.gender,helmet:r.helmetNumber,divisionGroupId:r.divisionGroupId,quadGroup:getQuadGroupIdForReg(r)})),
    allQuadRegs:(meet.registrations||[]).filter(r=>!!r.options?.quad).map(r=>({name:r.name,age:r.age,gender:r.gender,helmet:r.helmetNumber,quadGroup:getQuadGroupIdForReg(r)})),
    quadRaces:(meet.races||[]).filter(r=>r.isQuadRace).map(r=>({id:r.id,groupId:r.groupId,label:r.groupLabel,dist:r.distanceLabel,entries:(r.laneEntries||[]).length}))
  };
  res.json(result);
});

app.get('/portal/meet/:meetId/debug-regs', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.status(404).send('not found');
  const out=(meet.registrations||[]).map(r=>({
    id:r.id, name:r.name, age:r.age, gender:r.gender,
    divisionGroupId:r.divisionGroupId, originalDivisionGroupId:r.originalDivisionGroupId,
    challengeUpGroupId:r.challengeUpGroupId,
    challengeUp:r.options?.challengeUp, elite:r.options?.elite,
    computedOpenGroup:getOpenGroupIdForReg(r),
    computedTrueGroup:findAgeGroup(meet.groups,Number(r.age||0),r.gender||'boys')?.id,
    computedCUGroup:(()=>{
      if(!r.options?.challengeUp) return null;
      const tg=findAgeGroup(meet.groups,Number(r.age||0),r.gender||'boys');
      if(!tg) return null;
      if(['senior_men','senior_women'].includes(tg.id)) return 'SENIOR-CANNOT-CU';
      return findChallengeUpGroup(meet.groups||[],tg.id)?.id||null;
    })(),
  }));
  res.json(out);
});

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


// ── TV Display ────────────────────────────────────────────────────────────────
app.get('/meet/:meetId/tt-live', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!meet||!meet.isPublic) return res.redirect('/meets');

  const ttCfg=meet.ttConfig||{};
  const showOverall=ttCfg.showOverallLeaderboard!==false;
  const enabledGroups=(ttCfg.groups&&ttCfg.groups.length)?ttCfg.groups.filter(g=>g.enabled!==false):TT_AGE_GROUPS;

  const GROUP_LABELS={'open_juv_girls':'Juvenile Girls','open_juv_boys':'Juvenile Boys','open_fresh_girls':'Freshman Girls','open_fresh_boys':'Freshman Boys','open_sr_ladies':'Senior Ladies','open_sr_men':'Senior Men','open_mast_ladies':'Masters Ladies','open_mast_men':'Masters Men'};
  const TT_TO_OPEN={'tt_juv_girls':'open_juv_girls','tt_juv_boys':'open_juv_boys','tt_fresh_girls':'open_fresh_girls','tt_fresh_boys':'open_fresh_boys','tt_sr_ladies':'open_sr_ladies','tt_sr_men':'open_sr_men','tt_mast_ladies':'open_mast_ladies','tt_mast_men':'open_mast_men'};

  const combinedTT=(meet.races||[]).find(r=>r.isTimeTrial&&r.groupId==='tt_combined');

  // Bucket entries by age group
  const buckets={};
  (combinedTT?.laneEntries||[]).filter(e=>e.skaterName).forEach(e=>{
    const reg=(meet.registrations||[]).find(r=>String(r.id)===String(e.registrationId||''));
    const openId=reg?getOpenGroupIdForReg(reg):null;
    if(!openId) return;
    if(!buckets[openId]) buckets[openId]=[];
    buckets[openId].push(e);
  });

  const medals=['🥇','🥈','🥉'];

  const groupCards=enabledGroups.map(g=>{
    const openId=TT_TO_OPEN[g.id]||('open_'+g.id.replace('tt_',''));
    const label=GROUP_LABELS[openId]||g.label||openId;
    const entries=buckets[openId]||[];
    const top3=entries.filter(e=>e.time).sort((a,b)=>parseFloat(a.time||999)-parseFloat(b.time||999)).slice(0,3);
    const rows=top3.map((e,i)=>`
      <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.07)">
        <span style="font-size:20px;width:28px">${medals[i]}</span>
        <div style="flex:1;min-width:0">
          <div style="font-family:Orbitron,sans-serif;font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.skaterName||'')}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.45)">${esc(e.team||'')}</div>
        </div>
        <div style="font-family:Orbitron,sans-serif;font-size:16px;font-weight:700;color:#F97316">${esc(e.time)}</div>
      </div>`).join('');
    return `
      <div style="background:rgba(255,255,255,.05);border-radius:12px;padding:14px;border:1px solid rgba(255,255,255,.08)">
        <div style="font-family:Orbitron,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#38BDF8;margin-bottom:8px">${esc(label)}</div>
        ${top3.length===0?'<div style="color:rgba(255,255,255,.3);font-size:12px;padding:8px 0">No times posted</div>':rows}
      </div>`;
  }).join('');

  // Overall leaderboard card
  const allTimed=(combinedTT?.laneEntries||[]).filter(e=>e.time&&e.skaterName)
    .sort((a,b)=>parseFloat(a.time||999)-parseFloat(b.time||999)).slice(0,8);
  const overallCard=showOverall&&allTimed.length?`
    <div style="background:rgba(249,115,22,.08);border-radius:12px;padding:14px;border:1px solid rgba(249,115,22,.3);grid-column:1/-1">
      <div style="font-family:Orbitron,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#F97316;margin-bottom:10px">🏆 Overall Fastest</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
        ${allTimed.map((e,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <span style="font-size:16px;width:24px">${medals[i]||i+1+'.'}</span>
          <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.skaterName)}</div></div>
          <div style="font-family:Orbitron,sans-serif;font-size:14px;font-weight:700;color:#F97316">${esc(e.time)}</div>
        </div>`).join('')}
      </div>
    </div>`:''

  const html=`<!doctype html><html><head><meta charset="utf-8">
    <title>Time Trials — ${esc(meet.meetName)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Barlow:wght@400;600&display=swap" rel="stylesheet">
    <meta http-equiv="refresh" content="8">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#0a1628;color:#fff;font-family:Barlow,sans-serif;min-height:100vh;padding:20px}
      .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #F97316}
      .meet-name{font-family:Orbitron,sans-serif;font-size:18px;font-weight:700;color:#fff}
      .tt-label{font-family:Orbitron,sans-serif;font-size:12px;font-weight:700;color:#F97316;letter-spacing:.15em}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
    </style>
  </head><body>
    <div class="header">
      <div>
        <div class="tt-label">⏱ TIME TRIALS — LIVE TOP 3</div>
        <div class="meet-name">${esc(meet.meetName)}</div>
      </div>
      <div style="font-family:Orbitron,sans-serif;font-size:11px;color:rgba(255,255,255,.4)">Auto-refreshes every 8s</div>
    </div>
    <div class="grid">${overallCard}${groupCards}</div>
  </body></html>`;

  res.send(html);
});

app.get('/meet/:meetId/tv', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!meet) return res.redirect('/meets');
  const info=currentRaceInfo(meet);
  const current=info.current;
  const lanes=current?laneRowsForRace(current,meet):[];
  const recent=recentClosedRaces(meet,1);
  const lastRace=recent[0];
  const lastResults=lastRace?(lastRace.laneEntries||[]).filter(x=>x.place).sort((a,b)=>Number(a.place||999)-Number(b.place||999)).slice(0,3):[];
  const isTT=!!(current&&current.isTimeTrial);
  const ttSorted=isTT?[...(current.laneEntries||[])].sort((a,b)=>parseFloat(a.time||'999')-parseFloat(b.time||'999')):[];

  const lanesHtml = lanes.filter(l=>l.skaterName).map(l=>
    '<div class="tv-lane">' +
    '<div class="tv-lane-num">'+l.lane+'</div>' +
    '<div class="tv-helmet">'+(l.helmetNumber?'#'+esc(l.helmetNumber):'')+'</div>' +
    '<div style="flex:1"><div class="tv-skater-name">'+esc(l.skaterName)+'</div><div class="tv-team">'+esc(l.team||'')+'</div></div>' +
    '</div>'
  ).join('') || '<div style="opacity:.4;font-size:24px;margin-top:20px">No skaters entered yet</div>';

  const ttTop3Html = ttSorted.slice(0,3).map((e,i)=>
    '<div class="tv-podium-row" style="padding:10px 14px">' +
    '<div class="tv-podium-medal" style="font-size:28px">'+(['🥇','🥈','🥉'][i])+'</div>' +
    '<div style="flex:1"><div class="tv-next-name" style="font-size:26px">'+esc(e.skaterName)+'</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,.5)">'+esc(e.team||'')+'</div></div>' +
    '<div style="font-family:Barlow Condensed,sans-serif;font-size:28px;font-weight:900;color:#38BDF8">'+esc(e.time)+'</div>' +
    '</div>'
  ).join('') || '<div style="opacity:.4;font-size:16px">No times yet</div>';

  const lastResultHtml = lastResults.map(e=>
    '<div class="tv-footer-place">' +
    '<span class="tv-footer-medal">'+(e.place==='1'?'🥇':e.place==='2'?'🥈':e.place==='3'?'🥉':e.place+'.')+'</span>' +
    '<span class="tv-footer-name">'+esc(e.skaterName||'')+'</span>' +
    (e.time?'<span style="color:#38BDF8;font-weight:700">'+esc(e.time)+'</span>':'') +
    '</div>'
  ).join('');

  const sidebarHtml = isTT ?
    '<div class="tv-sidebar-section"><div class="tv-sidebar-label">⏱ Live Top 3</div><div class="tv-podium" style="gap:8px">'+ttTop3Html+'</div></div>'
    :
    (info.next ? '<div class="tv-sidebar-section"><div class="tv-sidebar-label">In Staging</div><div class="tv-next-name">'+esc(info.next.groupLabel)+'</div><div class="tv-next-meta">'+esc(cap(info.next.division))+' • '+esc(info.next.distanceLabel)+'</div></div>' : '') +
    (info.coming.length ? '<div class="tv-sidebar-section"><div class="tv-sidebar-label">Coming Up</div>' +
      info.coming.slice(0,4).map(r=>'<div class="tv-coming-item">'+esc(r.groupLabel)+' — '+esc(cap(r.division))+' • '+esc(r.distanceLabel)+'</div>').join('') +
      '</div>' : '');

  const currentLabel = isTT ? '⏱ TIME TRIAL — NOW RUNNING' : '▶ NOW RACING';
  const currentMeta = esc(cap(current&&current.division||''))+' • '+esc(current&&current.distanceLabel||'')+(isTT?' • Individual':' • '+(current?esc(cap(current.startType)):'')+ ' Start');

  const mainHtml = !current ?
    '<div class="tv-current" style="grid-column:1/-1;align-items:center;justify-content:center;display:flex;flex-direction:column;gap:16px;opacity:.4"><img src="/public/images/branding/ssm-logo.png" style="height:120px"/><div style="font-family:Orbitron,sans-serif;font-size:36px;font-weight:700;letter-spacing:4px;color:#fff">STAND BY</div></div>'
    :
    '<div class="tv-current">' +
      '<div><div class="tv-now-label">'+currentLabel+'</div>' +
      '<div class="tv-race-title">'+esc(current.groupLabel)+'</div>' +
      '<div class="tv-race-meta">'+currentMeta+'</div></div>' +
      '<div class="tv-lanes">' + (isTT ?
        (ttSorted.length===0 ? '<div style="font-size:28px;opacity:.5;margin-top:20px">Waiting for first time...</div>' : '') :
        lanesHtml) +
      '</div>' +
    '</div>' +
    '<div class="tv-sidebar">'+sidebarHtml+'</div>';

  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>TV — '+esc(meet.meetName)+'</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;900&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet"/>' +
    '<style>' +
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}' +
    'html,body{width:100%;height:100%;overflow:hidden;background:#0F1F3D;color:#fff;font-family:Barlow,sans-serif;}' +
    '.tv-wrap{display:grid;grid-template-rows:auto 1fr auto;height:100vh;}' +
    '.tv-header{background:#0a1628;border-bottom:3px solid #F97316;padding:12px 32px;display:flex;align-items:center;justify-content:space-between;}' +
    '.tv-logo{height:48px;width:auto;}' +
    '.tv-meet-name{font-family:Orbitron,sans-serif;font-size:16px;font-weight:700;color:#fff;letter-spacing:.05em;}' +
    '.tv-progress{font-size:16px;color:rgba(255,255,255,.6);text-align:right;}' +
    '.tv-race-num{font-family:Orbitron,sans-serif;font-size:16px;font-weight:700;color:#F97316;letter-spacing:.05em;}' +
    '.tv-main{display:grid;grid-template-columns:1.4fr .6fr;overflow:hidden;}' +
    '.tv-current{background:#162847;padding:32px 40px;display:flex;flex-direction:column;gap:16px;}' +
    '.tv-now-label{font-family:Orbitron,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:#F97316;}' +
    '.tv-race-title{font-family:Orbitron,sans-serif;font-size:44px;font-weight:700;line-height:1.1;color:#fff;letter-spacing:-.5px;}' +
    '.tv-race-meta{font-size:22px;color:rgba(255,255,255,.75);font-weight:600;}' +
    '.tv-lanes{display:flex;flex-direction:column;gap:8px;margin-top:8px;flex:1;}' +
    '.tv-lane{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.07);border-radius:10px;padding:14px 20px;}' +
    '.tv-lane-num{font-family:Orbitron,sans-serif;font-size:22px;font-weight:700;color:#38BDF8;width:36px;text-align:center;flex-shrink:0;}' +
    '.tv-helmet{font-family:Orbitron,sans-serif;font-size:18px;font-weight:700;color:#F97316;width:64px;flex-shrink:0;}' +
    '.tv-skater-name{font-family:Orbitron,sans-serif;font-size:28px;font-weight:700;line-height:1.2;}' +
    '.tv-team{font-size:16px;color:rgba(255,255,255,.6);}' +
    '.tv-sidebar{background:#0a1628;padding:24px;display:flex;flex-direction:column;gap:16px;overflow:hidden;}' +
    '.tv-sidebar-section{background:rgba(255,255,255,.05);border-radius:12px;padding:16px;}' +
    '.tv-sidebar-label{font-family:Orbitron,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:#38BDF8;margin-bottom:8px;}' +
    '.tv-next-name{font-family:Orbitron,sans-serif;font-size:22px;font-weight:700;line-height:1.2;}' +
    '.tv-next-meta{font-size:14px;color:rgba(255,255,255,.65);margin-top:4px;}' +
    '.tv-coming-item{font-size:15px;color:rgba(255,255,255,.75);padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08);}' +
    '.tv-coming-item:last-child{border:none;}' +
    '.tv-podium{display:flex;flex-direction:column;gap:8px;}' +
    '.tv-podium-row{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.07);border-radius:10px;padding:12px 16px;}' +
    '.tv-footer{background:#0a1628;border-top:2px solid rgba(255,255,255,.10);padding:10px 32px;display:flex;align-items:center;gap:24px;}' +
    '.tv-footer-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.5);white-space:nowrap;}' +
    '.tv-footer-race{font-size:14px;font-weight:700;color:rgba(255,255,255,.75);white-space:nowrap;}' +
    '.tv-footer-results{display:flex;gap:20px;flex:1;flex-wrap:wrap;}' +
    '.tv-footer-place{display:flex;align-items:center;gap:8px;font-size:16px;}' +
    '.tv-footer-medal{font-size:20px;}' +
    '.tv-footer-name{font-weight:700;}' +
    '</style></head><body>' +
    '<div class="tv-wrap">' +
    '<div class="tv-header">' +
    '<img src="/public/images/branding/ssm-logo.png" class="tv-logo" alt="SSM"/>' +
    '<div class="tv-meet-name">'+esc(meet.meetName)+'</div>' +
    '<div class="tv-progress">' +
    (current?'<div class="tv-race-num">RACE '+Math.max(info.idx+1,1)+' OF '+info.ordered.length+'</div>':'') +
    '<div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:2px">'+(meetDateRange(meet))+'</div>' +
    '</div></div>' +
    '<div class="tv-main">'+mainHtml+'</div>' +
    '<div class="tv-footer">' +
    '<div class="tv-footer-label">Last Result</div>' +
    (lastRace ?
      '<div class="tv-footer-race">'+esc(lastRace.groupLabel)+' • '+esc(cap(lastRace.division))+' • '+esc(lastRace.distanceLabel)+'</div>' +
      '<div class="tv-footer-results">'+lastResultHtml+'</div>'
      : '<div style="opacity:.4">No results yet</div>') +
    '</div></div>' +
    '<script>setTimeout(()=>location.reload(),8000);</script>' +
    '</body></html>';

  res.send(html);
});

app.get('/meet/:meetId/results', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId); const data=getSessionUser(req);
  if(!meet||!meet.isPublic) return res.redirect('/meets');
  const sections=computeMeetStandings(meet); const openSections=computeOpenResults(meet); const quadSections=computeQuadStandings(meet);
  res.send(pageShell({title:'Results',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>${esc(meet.meetName)}</h1><div class="sub">Results</div></div>
    <div class="live-tabs">
      <a class="live-tab" href="/meet/${meet.id}/live">Live Board</a>
      <a class="live-tab active" href="/meet/${meet.id}/results">Results</a>
      <a class="live-tab" href="/meet/${meet.id}/alerts">📲 Text Alerts</a>
    </div>
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
    <h1>${esc(meet.meetName)} — Results</h1><div class="meta">${esc(meetDateRange(meet))}${meet.startTime?` • ${esc(meet.startTime)}`:''}</div>
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

app.get('/meet/:meetId/alerts', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!meet||!meet.isPublic) return res.redirect('/meets');
  const data=getSessionUser(req);
  const regs=(meet.registrations||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  const ok=req.query.ok; const err=req.query.err;
  res.send(pageShell({title:'Text Alerts',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>📲 Text Alerts</h1><div class="sub">${esc(meet.meetName)}</div></div>
    <div class="live-tabs">
      <a class="live-tab" href="/meet/${meet.id}/live">Live Board</a>
      <a class="live-tab" href="/meet/${meet.id}/results">Results</a>
      <a class="live-tab active" href="/meet/${meet.id}/alerts">Text Alerts</a>
    </div>
    ${ok?`<div class="card" style="border-left:4px solid var(--green);margin-bottom:16px"><div class="good">✅ You're signed up! You'll get texts when ${esc(decodeURIComponent(ok))} is about to race and when results post.</div></div>`:''}
    ${err?`<div class="card" style="border-left:4px solid var(--red);margin-bottom:16px"><div class="danger">❌ ${esc(decodeURIComponent(err))}</div></div>`:''}
    <div class="card">
      <h2 style="margin-bottom:6px">Sign up for race alerts</h2>
      <div class="note" style="margin-bottom:16px">Get a text when your skater is 2 races away, in staging, and when their result posts. Reply STOP anytime to unsubscribe.</div>
      <form method="POST" action="/meet/${meet.id}/alerts/subscribe" class="stack">
        <div class="form-grid cols-2">
          <div>
            <label>Skater — type name to search</label>
            <input name="skaterSearch" id="skaterSearch" list="skaterList" placeholder="Type name..." autocomplete="off" oninput="fillReg(this.value)" required />
            <datalist id="skaterList">
              ${regs.map(r=>`<option value="${esc('#'+r.helmetNumber+' '+r.name)}">#${esc(r.helmetNumber||'?')} ${esc(r.name)} — ${esc(r.divisionGroupLabel||'')}</option>`).join('')}
            </datalist>
            <input type="hidden" name="registrationId" id="regIdInput" />
          </div>
          <div>
            <label>Your Cell Phone Number</label>
            <input name="phone" type="tel" placeholder="(316) 555-1234" required />
          </div>
        </div>
        <div><button class="btn-orange" type="submit">Sign Me Up →</button></div>
      </form>
      <script>
        const alertRegs=${JSON.stringify(regs.map(r=>({id:r.id,key:'#'+r.helmetNumber+' '+r.name})))};
        function fillReg(val){
          const match=alertRegs.find(r=>r.key===val||r.key.toLowerCase()===val.toLowerCase());
          document.getElementById('regIdInput').value=match?match.id:'';
        }
      </script>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 style="margin-bottom:8px">What you'll receive</h3>
      <div class="stack">
        <div class="toggle-row"><div><div class="toggle-row-label">🏁 2 Races Away</div><div class="toggle-row-desc">"Heads up! Jane Smith races in 2 — Elementary Girls Elite 500m"</div></div></div>
        <div class="toggle-row"><div><div class="toggle-row-label">⚡ In Staging</div><div class="toggle-row-desc">"Jane Smith is IN STAGING — get to the line now!"</div></div></div>
        <div class="toggle-row"><div><div class="toggle-row-label">✅ Result Posted</div><div class="toggle-row-desc">"Jane Smith — 🥇 1st place! 30 pts earned | 50 pts total"</div></div></div>
      </div>
    </div>`}));
});

app.post('/meet/:meetId/alerts/subscribe', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!meet||!meet.isPublic) return res.redirect('/meets');
  const regId=String(req.body.registrationId||'').trim();
  const rawPhone=String(req.body.phone||'').trim();
  const phone=normalizePhone(rawPhone);
  if(!phone) return res.redirect(`/meet/${meet.id}/alerts?err=${encodeURIComponent('Invalid phone number. Use format: (316) 555-1234')}`);
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(regId));
  if(!reg) return res.redirect(`/meet/${meet.id}/alerts?err=${encodeURIComponent('Skater not found.')}`);
  if(!Array.isArray(meet.textAlerts)) meet.textAlerts=[];
  // Remove existing sub for same reg+phone combo to avoid duplicates
  meet.textAlerts=meet.textAlerts.filter(s=>!(String(s.registrationId||'')===regId&&s.phone===phone));
  meet.textAlerts.push({id:crypto.randomBytes(6).toString('hex'),registrationId:regId,skaterName:reg.name,phone,createdAt:nowIso()});
  meet.updatedAt=nowIso(); saveDb(db);
  // Send confirmation text
  sendSms(phone, `✅ You're signed up for alerts for ${reg.name}!\nYou'll get texts 2 races away, in staging, and when results post.\n${meet.meetName}\nReply STOP to unsubscribe.`);
  res.redirect(`/meet/${meet.id}/alerts?ok=${encodeURIComponent(reg.name)}`);
});

app.get('/meet/:meetId/live', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId); const data=getSessionUser(req);
  if(!meet||!meet.isPublic) return res.redirect('/meets');
  const info=currentRaceInfo(meet); const current=info.current;
  const lanes=current?laneRowsForRace(current,meet):[];
  const recent=recentClosedRaces(meet,5);
  const regMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));

  const laneCardsHtml=lanes.map(l=>{
    const reg=regMap.get(Number(l.registrationId));
    const result=current?.resultsMode==='times'?l.time:l.place;
    const medal=result==='1'?'🥇':result==='2'?'🥈':result==='3'?'🥉':'';
    const sponsorHtml=reg?.sponsor?'<div class="tv-team" style="color:#38BDF8;font-size:13px">'+esc(reg.sponsor)+'</div>':'';
    return '<div class="tv-lane">'+
      '<div class="tv-lane-num">'+esc(String(l.lane||''))+'</div>'+
      '<div class="tv-helmet">'+(l.helmetNumber?'#'+esc(String(l.helmetNumber)):'')+'</div>'+
      '<div style="flex:1"><div class="tv-skater-name">'+esc(l.skaterName||'')+'</div>'+
      '<div class="tv-team">'+esc(l.team||'')+'</div>'+sponsorHtml+'</div>'+
      (result?'<div style="font-family:Orbitron,sans-serif;font-size:22px;font-weight:700;color:#F97316;margin-left:12px">'+(medal||esc(String(result)))+'</div>':'')+
    '</div>';
  }).join('');

  const recentHtml=recent.map(r=>{
    const places=(r.laneEntries||[]).filter(x=>String(x.place||'').trim())
      .sort((a,b)=>Number(a.place||999)-Number(b.place||999)).slice(0,4)
      .map(x=>{
        const p=Number(x.place);
        const med=p===1?'🥇':p===2?'🥈':p===3?'🥉':null;
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)">'+
          '<span style="font-size:18px;width:24px">'+(med||('<span style="font-family:Orbitron,sans-serif;font-size:13px;color:rgba(255,255,255,.5)">'+x.place+'</span>'))+'</span>'+
          '<div><div style="font-family:Orbitron,sans-serif;font-size:15px;font-weight:700;color:#fff">'+esc(x.skaterName||'')+'</div>'+
          '<div style="font-size:12px;color:rgba(255,255,255,.5)">'+esc(x.team||'')+'</div></div>'+
        '</div>';
      }).join('')||'<div style="color:rgba(255,255,255,.4);font-size:13px;padding:6px 0">No results yet</div>';
    return '<div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;margin-bottom:10px">'+
      '<div style="font-family:Orbitron,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#F97316;margin-bottom:8px">'+
        esc(r.groupLabel)+' • '+esc(cap(r.division))+' • '+esc(r.distanceLabel)+'</div>'+
      places+'</div>';
  }).join('')||'<div style="color:rgba(255,255,255,.4);text-align:center;padding:40px 0"><div style="font-size:32px;margin-bottom:8px">⏳</div><div style="font-family:Orbitron,sans-serif;font-size:13px;font-weight:700">Results will appear here</div></div>';

  const comingHtml=info.coming.slice(0,5).map(r=>
    '<div style="font-size:14px;color:rgba(255,255,255,.7);padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)">'+
    esc(r.groupLabel)+' — '+esc(cap(r.division))+' • '+esc(r.distanceLabel)+'</div>'
  ).join('');

  res.send(pageShell({title:'Live — '+esc(meet.meetName), user:data?.user||null, bodyHtml:`
    <div class="live-tabs" style="margin-bottom:0">
      <a class="live-tab active" href="/meet/${meet.id}/live">Live Board</a>
      <a class="live-tab" href="/meet/${meet.id}/results">Results</a>
      <a class="live-tab" href="/meet/${meet.id}/tt-live" target="_blank">⏱ TT Live</a>
      <a class="live-tab" href="/meet/${meet.id}/alerts">📲 Text Alerts</a>
      <a class="live-tab" href="/meet/${meet.id}/print-schedule" target="_blank">🖨️ Print Schedule</a>
    </div>
    <style>
      .live-wrap{display:grid;grid-template-columns:1fr 340px;grid-template-rows:auto 1fr;min-height:calc(100vh - 130px);background:#0a1628;border-radius:0 0 16px 16px;overflow:hidden}
      .live-main{background:#0d1f3c;padding:32px;display:flex;flex-direction:column;gap:16px}
      .live-sidebar-panel{background:#0a1628;padding:24px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;border-left:1px solid rgba(255,255,255,.08)}
      @media(max-width:768px){
        .live-wrap{grid-template-columns:1fr;grid-template-rows:auto auto}
        .live-sidebar-panel{border-left:none;border-top:1px solid rgba(255,255,255,.08)}
        .live-pub-title{font-size:26px}
        .live-main{padding:20px}
      }
      .live-pub-label{font-family:Orbitron,sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:#F97316}
      .live-pub-title{font-family:Orbitron,sans-serif;font-size:38px;font-weight:700;color:#fff;line-height:1.15;margin-top:8px}
      .live-pub-meta{font-size:17px;color:rgba(255,255,255,.6);margin-top:6px}
      .live-sidebar-head{font-family:Orbitron,sans-serif;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;color:#38BDF8;margin-bottom:8px}
      .live-sidebar-box{background:rgba(255,255,255,.05);border-radius:10px;padding:14px}
      .live-staging-name{font-family:Orbitron,sans-serif;font-size:20px;font-weight:700;color:#fff;line-height:1.2}
      .live-staging-meta{font-size:13px;color:rgba(255,255,255,.5);margin-top:4px}
      .tv-lane{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.06);border-radius:12px;padding:14px 18px;border:1px solid rgba(255,255,255,.08)}
      .tv-lane-num{font-family:Orbitron,sans-serif;font-size:22px;font-weight:700;color:#38BDF8;width:36px;text-align:center;flex-shrink:0}
      .tv-helmet{font-family:Orbitron,sans-serif;font-size:18px;font-weight:700;color:#F97316;width:64px;flex-shrink:0}
      .tv-skater-name{font-family:Orbitron,sans-serif;font-size:26px;font-weight:700;color:#fff;line-height:1.2}
      .tv-team{font-size:13px;color:rgba(255,255,255,.5);margin-top:2px}
    </style>
    <div class="live-wrap">
      <div class="live-main">
        ${current?`
          <div>
            <div class="live-pub-label">▶ Now Racing</div>
            <div class="live-pub-title">${esc(current.groupLabel)}</div>
            <div class="live-pub-meta">${esc(cap(current.division))} • ${esc(current.distanceLabel)} • <span style="color:rgba(255,255,255,.4)">Race ${Math.max(info.idx+1,1)} of ${info.ordered.length}</span></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">${laneCardsHtml}</div>
        `:`
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:.4;gap:16px">
            <img src="/public/images/branding/ssm-logo.png" style="height:100px"/>
            <div style="font-family:Orbitron,sans-serif;font-size:28px;font-weight:700;color:#fff;letter-spacing:4px">STAND BY</div>
          </div>
        `}
      </div>
      <div class="live-sidebar-panel">
        ${info.next?`
          <div class="live-sidebar-box">
            <div class="live-sidebar-head">In Staging</div>
            <div class="live-staging-name">${esc(info.next.groupLabel)}</div>
            <div class="live-staging-meta">${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}</div>
          </div>`:''
        }
        <div class="live-sidebar-box" style="flex:1">
          <div class="live-sidebar-head">Recent Results</div>
          ${recentHtml}
        </div>
        ${comingHtml?`
          <div class="live-sidebar-box">
            <div class="live-sidebar-head">Coming Up</div>
            ${comingHtml}
          </div>`:''
        }
      </div>
    </div>
    <script>setTimeout(()=>location.reload(),8000);</script>`}));
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
    <div style="color:#555;margin-bottom:12px">${esc(meetDateRange(meet))}${meet.startTime?` • ${esc(meet.startTime)}`:''}</div>
    ${daySections||'<div>No blocks yet.</div>'}
  </body></html>`);
});

// ── Import Registrations ─────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/import', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const flash=req.query.result?`<div class="card" style="border-left:4px solid var(--${req.query.ok?'green':'orange'});margin-bottom:16px">${esc(decodeURIComponent(req.query.result))}</div>`:'';
  res.send(pageShell({title:'Import — '+esc(meet.meetName),user:req.user,meet,activeTab:'import',bodyHtml:`
    ${flash}
    <div class="card">
      <h2>📥 Import Registrations from CSV</h2>
      <div class="note" style="margin:8px 0 16px">
        Upload a CSV file or paste data directly. Required columns: <strong>Name</strong>.
        Optional: Helmet, Age, Gender, Team, Sponsor, Novice, Elite, Open, Quad, TimeTrials, Relays, ChallengeUp, Division.
        <br>For Division, use group labels like "Elementary Boys", "Juvenile Girls", etc.
        <br>For event columns, use: <strong>yes / x / 1</strong> to mark entry. Existing skaters matched by name will be updated, not duplicated.
      </div>
      <form method="POST" action="/portal/meet/${meet.id}/import">
        <div style="margin-bottom:14px">
          <label>Upload CSV File</label>
          <input type="file" name="csvfile" accept=".csv,.txt" style="display:block;margin-top:6px" />
        </div>
        <div style="margin-bottom:14px">
          <label>— or paste CSV data directly —</label>
          <textarea name="csvtext" rows="12" style="font-family:monospace;font-size:12px;width:100%;margin-top:6px" placeholder="Name,Helmet,Age,Gender,Team,Novice,Elite,Open,Division&#10;John Smith,42,11,male,Midwest Racing,yes,yes,yes,Elementary Boys&#10;Jane Doe,7,9,female,Team Velocity,no,yes,yes,Juvenile Girls"></textarea>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn-orange" type="submit">Import Skaters</button>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px">
            <input type="checkbox" name="overwrite" value="1" />
            Overwrite existing skaters matched by name
          </label>
        </div>
      </form>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>Column Name Reference</h3>
      <table class="table" style="font-size:13px">
        <thead><tr><th>Column Header</th><th>What it does</th><th>Example</th></tr></thead>
        <tbody>
          <tr><td><strong>Name</strong></td><td>Skater full name (required)</td><td>John Smith</td></tr>
          <tr><td><strong>Helmet</strong> or <strong>Number</strong></td><td>Helmet/bib number</td><td>42</td></tr>
          <tr><td><strong>Age</strong></td><td>Age as of Jan 1</td><td>11</td></tr>
          <tr><td><strong>Gender</strong></td><td>Male or Female</td><td>male</td></tr>
          <tr><td><strong>Team</strong></td><td>Team name</td><td>Midwest Racing</td></tr>
          <tr><td><strong>Sponsor</strong></td><td>Sponsor name</td><td>Bont</td></tr>
          <tr><td><strong>Division</strong></td><td>Age group label</td><td>Elementary Boys</td></tr>
          <tr><td><strong>Novice / Elite / Open / Quad / TimeTrials / Relays / ChallengeUp</strong></td><td>yes/x/1 = entered</td><td>yes</td></tr>
        </tbody>
      </table>
    </div>`}));
});

app.post('/portal/meet/:meetId/import', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const overwrite=!!req.body.overwrite;
  let csvText=String(req.body.csvtext||'').trim();
  // If file uploaded, use that (handled by multer if available, else fallback to paste)
  if(!csvText) return res.redirect(`/portal/meet/${meet.id}/import?result=${encodeURIComponent('No CSV data provided.')}&ok=0`);

  // Parse CSV
  const lines=csvText.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return res.redirect(`/portal/meet/${meet.id}/import?result=${encodeURIComponent('CSV needs at least a header row and one data row.')}&ok=0`);

  // Parse headers
  const headers=lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/[^a-z0-9]/g,''));
  const col=h=>headers.indexOf(h);
  const get=(row,h)=>{const i=col(h);return i>=0?(row[i]||'').trim():'';};
  const isYes=v=>/^(yes|y|x|1|true)$/i.test(String(v).trim());

  // Group label to ID map
  const groupLabelMap=new Map((meet.groups||[]).map(g=>[g.label.toLowerCase(),g.id]));

  let added=0,updated=0,skipped=0;
  for(let i=1;i<lines.length;i++) {
    const row=lines[i].split(',').map(c=>c.trim().replace(/^"|"$/g,''));
    const name=get(row,'name')||get(row,'skatername')||get(row,'skater');
    if(!name) {skipped++;continue;}

    const helmetRaw=get(row,'helmet')||get(row,'number')||get(row,'helmetnumber')||get(row,'bib')||'';
    const age=Number(get(row,'age')||get(row,'usarsage')||0);
    const genderRaw=(get(row,'gender')||get(row,'sex')||'male').toLowerCase();
    const gender=genderRaw==='female'||genderRaw==='f'||genderRaw==='girl'||genderRaw==='girls'||genderRaw==='women'?'female':'male';
    const team=get(row,'team')||get(row,'club')||'';
    const sponsor=get(row,'sponsor')||'';
    const divLabel=get(row,'division')||get(row,'divisiongroup')||get(row,'class')||'';
    const divGroupId=divLabel?groupLabelMap.get(divLabel.toLowerCase())||'':'';
    const divGroup=divGroupId?(meet.groups||[]).find(g=>g.id===divGroupId):null;

    const opts={
      novice:isYes(get(row,'novice')),
      elite:isYes(get(row,'elite')),
      open:isYes(get(row,'open')),
      quad:isYes(get(row,'quad')),
      timeTrials:isYes(get(row,'timetrials')||get(row,'timetrial')||get(row,'tt')),
      relays:isYes(get(row,'relays')||get(row,'relay')),
      challengeUp:isYes(get(row,'challengeup')||get(row,'cu')),
      skateability:false,skateabilityGroups:[],
    };

    // Find existing by name match
    const existing=(meet.registrations||[]).find(r=>r.name.toLowerCase()===name.toLowerCase());
    if(existing) {
      if(overwrite) {
        if(helmetRaw) existing.helmetNumber=helmetRaw;
        if(age) existing.age=age;
        if(team) existing.team=team;
        if(sponsor&&!existing.sponsor) existing.sponsor=sponsor; // preserve existing sponsor
        existing.gender=gender;
        if(divGroup) {existing.divisionGroupId=divGroup.id;existing.divisionGroupLabel=divGroup.label;}
        existing.options=opts;
        existing.totalCost=calcRegistrationCost(meet,opts);
        updated++;
      } else {
        // Just update helmet if provided, leave rest alone
        if(helmetRaw) existing.helmetNumber=helmetRaw;
        skipped++;
      }
    } else {
      // New registration
      const baseGroup=divGroup||findAgeGroup(meet.groups,age,gender);
      const totalCost=calcRegistrationCost(meet,opts);
      const meetNumber=(meet.registrations||[]).reduce((max,r)=>Math.max(max,Number(r.meetNumber)||0),0)+1;
      meet.registrations.push({
        id:nextId(meet.registrations),createdAt:nowIso(),
        name,birthdate:'',age,gender,email:'',
        team,sponsor,
        helmetNumber:helmetRaw,meetNumber,
        divisionGroupId:baseGroup?.id||'',divisionGroupLabel:baseGroup?.label||'Unassigned',
        challengeUpGroupId:'',challengeUpGroupLabel:'',
        originalDivisionGroupId:baseGroup?.id||'',originalDivisionGroupLabel:baseGroup?.label||'',
        totalCost,paid:false,checkedIn:false,options:opts,
      });
      added++;
    }
  }

  ensureRegistrationTotalsAndNumbers(meet);
  // Auto-rebuild everything after import — same as Generate Blocks
  generateBaseRacesForMeet(meet);
  generateOpenRacesForMeet(meet);
  generateQuadRacesForMeet(meet);
  rebuildRaceAssignments(meet);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  saveDb(req.db);
  const msg=`✅ Import complete: ${added} added, ${updated} updated, ${skipped} skipped. Race assignments rebuilt automatically.`;
  res.redirect(`/portal/meet/${meet.id}/registered?imported=1`);
});

// ── Public Print Schedule ────────────────────────────────────────────────────

app.get('/meet/:meetId/print-schedule', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!meet||!meet.isPublic) return res.redirect('/meets');
  const blocksByDay={};
  for(const block of meet.blocks||[]) { const day=block.day||'Day 1'; if(!blocksByDay[day]) blocksByDay[day]=[]; blocksByDay[day].push(block); }
  const breakTypes=['break','lunch','awards','practice'];
  const breakIcons={break:'☕',lunch:'🍽️',awards:'🏆',practice:'⛸️'};
  let raceNo=1;
  const daySections=Object.keys(blocksByDay).sort().map(day=>{
    const blockSections=blocksByDay[day].map(block=>{
      const isBreak=breakTypes.includes(block.type||'');
      if(isBreak) {
        const icon=breakIcons[block.type]||'📌';
        return `<div class="break-row">${icon} ${esc(block.name)}${block.notes?' — '+esc(block.notes):''}</div>`;
      }
      const raceRows=(block.raceIds||[]).map(rid=>{
        const race=(meet.races||[]).find(r=>r.id===rid); if(!race) return '';
        const skaters=(race.laneEntries||[]).filter(l=>l.skaterName).map(l=>
          `<span class="skater">${l.lane?l.lane+'.':''} ${esc(l.skaterName)}${l.helmetNumber?' #'+esc(l.helmetNumber):''}</span>`
        ).join(' &nbsp;|&nbsp; ');
        const tag=race.isOpenRace?'🏁 ':race.isQuadRace?'🛼 ':race.isTimeTrial?'⏱ ':race.isRelayRace?'🔄 ':'';
        return `<tr>
          <td class="race-num">${raceNo++}</td>
          <td class="race-div">${tag}${esc(race.groupLabel)}</td>
          <td class="race-class">${esc(cap(race.division))}</td>
          <td class="race-dist">${esc(race.distanceLabel)}</td>
          <td class="race-skaters">${skaters||'<span style="color:#aaa">TBD</span>'}</td>
        </tr>`;
      }).join('');
      return `<div class="block">
        <div class="block-name">${esc(block.name)}${block.notes?` <span class="block-notes">${esc(block.notes)}</span>`:''}</div>
        <table><thead><tr><th>#</th><th>Division</th><th>Class</th><th>Dist</th><th>Skaters</th></tr></thead>
        <tbody>${raceRows||'<tr><td colspan="5">No races</td></tr>'}</tbody></table>
      </div>`;
    }).join('');
    return `<div class="day-section"><div class="day-header">${esc(day)}</div>${blockSections}</div>`;
  }).join('');

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <title>Schedule — ${esc(meet.meetName)}</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:Arial,sans-serif; font-size:9px; color:#111; padding:12px; }
      h1 { font-size:14px; margin-bottom:2px; }
      .meta { font-size:9px; color:#555; margin-bottom:10px; }
      .day-section { margin-bottom:14px; }
      .day-header { font-size:12px; font-weight:bold; background:#0F1F3D; color:#fff; padding:4px 8px; margin-bottom:6px; border-radius:3px; }
      .block { margin-bottom:8px; }
      .block-name { font-size:10px; font-weight:bold; color:#0F1F3D; padding:3px 0; border-bottom:1px solid #0F1F3D; margin-bottom:3px; }
      .block-notes { font-weight:normal; color:#888; font-size:9px; }
      table { width:100%; border-collapse:collapse; }
      th { font-size:8px; text-transform:uppercase; color:#888; padding:2px 4px; border-bottom:1px solid #ddd; text-align:left; }
      td { padding:2px 4px; border-bottom:1px solid #f0f0f0; vertical-align:top; }
      .race-num { width:24px; color:#888; font-weight:bold; }
      .race-div { width:130px; font-weight:600; }
      .race-class { width:55px; }
      .race-dist { width:40px; }
      .race-skaters { color:#333; }
      .skater { white-space:nowrap; }
      .break-row { background:#f8f8f8; padding:4px 8px; margin:4px 0; font-size:9px; color:#555; font-weight:600; border-left:3px solid #cbd5e1; border-radius:2px; }
      @media print {
        body { padding:6px; font-size:8px; }
        .day-header { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        @page { margin:8mm; size:letter; }
      }
      .print-btn { position:fixed; top:10px; right:10px; background:#F97316; color:#fff; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:700; }
      @media print { .print-btn { display:none; } }
    </style>
  </head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Print</button>
    <h1>${esc(meet.meetName)}</h1>
    <div class="meta">${esc(meetDateRange(meet))}${meet.startTime?' • '+esc(formatTime(meet.startTime)):''} • ${esc((db.rinks||[]).find(r=>Number(r.id)===Number(meet.rinkId))?.name||'')}</div>
    ${daySections||'<div>No schedule yet.</div>'}
  </body></html>`);
});

// ── Start server ──────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log(`SpeedSkateMeet v19 listening on ${HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});