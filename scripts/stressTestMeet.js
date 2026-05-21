// TESTING ONLY — do not run against production meet data unless intentional.
// Script: stressTestMeet.js
// Usage: node scripts/stressTestMeet.js <meetId> <count> [--simulateResults=true] [--simulateCheckin=true] [--simulateHeats=true]
// WARNING: This will MODIFY the on-disk DB file after explicit confirmation.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const vm = require('vm');

const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const DATA_FILE = process.env.SSM_DATA_FILE || path.join(DATA_DIR, 'ssm_db.json');
const SERVER_JS = path.join(__dirname, '..', 'server.js');

function usage() {
  console.log('Usage: node scripts/stressTestMeet.js <meetId> <count> [--simulateResults=true] [--simulateCheckin=true] [--simulateHeats=true]');
}

function safeReadJson(fp) {
  try { return JSON.parse(fs.readFileSync(fp,'utf8')); } catch (e) { return null; }
}

function writeJsonAtomic(fp,obj) {
  const tmp = fp + '.tmp.' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

async function confirmPrompt(question) {
  const rl = readline.createInterface({input:process.stdin,output:process.stdout});
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(String(answer||'').trim()); }));
}

function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

function extractTeamListFromServer() {
  try {
    const src = fs.readFileSync(SERVER_JS,'utf8');
    const idx = src.indexOf('const TEAM_LIST =');
    if(idx<0) return null;
    const slice = src.slice(idx);
    const start = slice.indexOf('[');
    const end = slice.indexOf('];', start);
    if(start<0||end<0) return null;
    const arrSrc = slice.slice(start, end+1);
    // evaluate in VM
    const script = 'const TEAM_LIST = ' + arrSrc + '; TEAM_LIST;';
    const list = vm.runInNewContext(script, {});
    if(Array.isArray(list) && list.length) return list;
  } catch (e) {
    return null;
  }
  return null;
}

function divisionEnabledForRegistration(reg,division) { return !!reg.options?.[division]; }

function calculateRegistrationTotal(meet, reg) {
  let total = 0;
  for(const race of meet.races || []) {
    if(String(race.groupId)===String(reg.divisionGroupId) && divisionEnabledForRegistration(reg, race.division)) {
      total += Number(race.cost||0);
    }
  }
  return total;
}

function nextHelmetNumber(meet) {
  const used=new Set((meet.registrations||[]).map(r=>Number(r.helmetNumber)).filter(n=>Number.isFinite(n)&&n>0));
  let n=1; while(used.has(n)) n+=1; return n;
}

function ensureRegistrationTotalsAndNumbers(meet) {
  for(const reg of meet.registrations||[]) {
    reg.totalCost = calculateRegistrationTotal(meet, reg);
    if(!Number.isFinite(Number(reg.helmetNumber))||Number(reg.helmetNumber)<=0) reg.helmetNumber = nextHelmetNumber(meet);
  }
}

async function main(){
  const args = process.argv.slice(2);
  if(args.length < 2) { usage(); process.exit(1); }
  const meetId = args[0];
  const count = Number(args[1]);
  const opts = Object.fromEntries(args.slice(2).map(a=>a.split('=').map(s=>s.trim())));
  const simulateResults = String(opts['--simulateResults']||'').toLowerCase()==='true';
  const simulateCheckin = String(opts['--simulateCheckin']||'').toLowerCase()==='true';
  const simulateHeats = String(opts['--simulateHeats']||'').toLowerCase()==='true';

  if(!meetId || !Number.isFinite(count) || count<=0) { usage(); process.exit(1); }

  if(!fs.existsSync(DATA_FILE)) { console.error('DB file not found at', DATA_FILE); process.exit(1); }
  const db = safeReadJson(DATA_FILE);
  if(!db) { console.error('Failed to parse DB file:', DATA_FILE); process.exit(1); }

  // Confirm a backup .bak exists in same dir
  const dir = path.dirname(DATA_FILE);
  const files = fs.readdirSync(dir);
  const bakExists = files.some(f=>f.startsWith(path.basename(DATA_FILE)+'.bak.'));
  if(!bakExists) {
    console.error('No backup .bak file detected in', dir);
    console.error('Please create a backup copy of the DB (or run the simpler seeder which creates a backup) before proceeding. Aborting.');
    process.exit(1);
  }

  const meet = (db.meets||[]).find(m=>String(m.id)===String(meetId) || Number(m.id)===Number(meetId));
  if(!meet) { console.error('Meet not found with id', meetId); process.exit(1); }

  console.log('\n*** WARNING — TESTING ONLY ***');
  console.log('This script will ADD %d fake registrations to meet: %s (id=%s)\n', count, meet.meetName||'(unnamed)', meet.id);
  console.log('Database file: %s', DATA_FILE);
  console.log('Detected backup files in %s. Proceeding requires explicit confirmation.', dir);
  console.log('To proceed TYPE EXACTLY: YES\n');

  const answer = await confirmPrompt('Type YES to continue: ');
  if(answer !== 'YES') { console.log('Aborted.'); process.exit(0); }

  // write our own backup as well
  const bak = DATA_FILE + '.bak.' + Date.now();
  fs.copyFileSync(DATA_FILE, bak);
  console.log('Created backup:', bak);

  // get team list from server.js when possible
  let teams = extractTeamListFromServer() || [];
  if(!teams.length) teams = ['Independent','Team Alpha','Team Beta','Club Rockets'];

  // sample names
  const sampleFirst = ['Alex','Sam','Taylor','Jordan','Riley','Casey','Morgan','Jamie','Drew','Cameron','Logan','Parker','Avery','Quinn','Reese'];
  const sampleLast = ['Smith','Johnson','Lee','Brown','Garcia','Martinez','Davis','Wilson','Clark','Lewis','Walker','Young','Allen','King','Wright'];

  if(!Array.isArray(meet.registrations)) meet.registrations = [];
  const startCount = meet.registrations.length;
  const existingIds = (meet.registrations||[]).map(r=>Number(r.id)).filter(n=>Number.isFinite(n));
  let nextId = existingIds.length?Math.max(...existingIds)+1:1;

  for(let i=0;i<count;i++){
    const id = nextId++;
    const team = randChoice(teams);
    const name = randChoice(sampleFirst) + ' ' + randChoice(sampleLast);
    const age = randInt(8,40);
    const gender = Math.random()<0.5 ? 'boys' : 'girls';

    // options randomization
    const options = {
      challengeUp: Math.random() < 0.15,
      novice: Math.random() < 0.6,
      elite: false,
      open: Math.random() < 0.05,
      quad: Math.random() < 0.02,
      timeTrials: Math.random() < 0.05,
      relays: Math.random() < 0.05,
      skateability: Math.random() < 0.03,
      skateabilityGroupId: ''
    };
    if(!options.novice) options.elite = true; // either novice or elite

    const divisionGroup = (meet.groups && meet.groups.length) ? meet.groups[Math.floor(Math.random()*meet.groups.length)] : {id:'g1',label:'Default'};

    const reg = {
      id: id,
      createdAt: new Date().toISOString(),
      name: name,
      age: age,
      gender: gender,
      team: team,
      sponsor: '',
      divisionGroupId: String(divisionGroup.id||''),
      divisionGroupLabel: String(divisionGroup.label||''),
      originalDivisionGroupId: String(divisionGroup.id||''),
      originalDivisionGroupLabel: String(divisionGroup.label||''),
      meetNumber: startCount + i + 1,
      birthdate: '',
      email: `test+${id}@example.com`,
      helmetNumber: '',
      paid: Math.random() < 0.5,
      checkedIn: false,
      totalCost: 0,
      options: options
    };

    meet.registrations.push(reg);
  }

  // Optional simulate checkin
  if(simulateCheckin) {
    console.log('Simulating check-in for ~80% of registrations...');
    for(const r of meet.registrations) {
      if(Math.random() < 0.8) r.checkedIn = true;
    }
  }

  // Ensure totals and helmet numbers
  ensureRegistrationTotalsAndNumbers(meet);

  // Create another backup after modifications (timestamped)
  const bak2 = DATA_FILE + '.bak.after.' + Date.now();
  fs.copyFileSync(DATA_FILE, bak2);
  console.log('Created secondary pre-write backup:', bak2);

  // write db
  writeJsonAtomic(DATA_FILE, db);
  console.log('Wrote %d registrations. Meet registrations now: %d', count, meet.registrations.length);

  if(simulateResults) console.log('Note: --simulateResults requested, but full results simulation is not implemented in this script.');
  if(simulateHeats) console.log('Note: --simulateHeats requested, but full heat generation simulation is not implemented in this script.');

  console.log('Done.');
}

main().catch(err=>{ console.error('Error:', err); process.exit(1); });
