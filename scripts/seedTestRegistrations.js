// TESTING ONLY — do not run against production meet data unless intentional.
// Script: seedTestRegistrations.js
// Usage: node scripts/seedTestRegistrations.js <meetId> <count>
// WARNING: This will MODIFY the on-disk DB file after explicit confirmation.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const DATA_FILE = process.env.SSM_DATA_FILE || path.join(DATA_DIR, 'ssm_db.json');

function usage() {
  console.log('Usage: node scripts/seedTestRegistrations.js <meetId> <count>');
  console.log('Example: node scripts/seedTestRegistrations.js 1 250');
}

function safeReadJson(fp) {
  try { return JSON.parse(fs.readFileSync(fp,'utf8')); } catch (e) { return null; }
}

function writeJsonAtomic(fp,obj) {
  const tmp = fp + '.tmp.' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

async function confirmPrompt(question) {
  const rl = readline.createInterface({input:process.stdin,output:process.stdout});
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(String(answer||'').trim()); }));
}

async function main(){
  const args = process.argv.slice(2);
  if(args.length < 2) { usage(); process.exit(1); }
  const meetId = args[0];
  const count = Number(args[1]);
  if(!meetId || !Number.isFinite(count) || count<=0) { usage(); process.exit(1); }

  if(!fs.existsSync(DATA_FILE)) { console.error('DB file not found at', DATA_FILE); process.exit(1); }
  const db = safeReadJson(DATA_FILE);
  if(!db) { console.error('Failed to parse DB file:', DATA_FILE); process.exit(1); }

  const meet = (db.meets||[]).find(m=>String(m.id)===String(meetId) || Number(m.id)===Number(meetId));
  if(!meet) { console.error('Meet not found with id', meetId); process.exit(1); }

  console.log('\n*** WARNING — TESTING ONLY ***');
  console.log('This script will add %d fake registrations to meet: %s (id=%s)\n', count, meet.meetName||'(unnamed)', meet.id);
  console.log('Database file: %s', DATA_FILE);
  console.log('Backup will be created before writing.');
  console.log('To proceed type EXACTLY: YES\n');

  const answer = await confirmPrompt('Type YES to continue: ');
  if(answer !== 'YES') { console.log('Aborted.'); process.exit(0); }

  // create backup
  const bak = DATA_FILE + '.bak.' + Date.now();
  fs.copyFileSync(DATA_FILE, bak);
  console.log('Backup written to', bak);

  if(!Array.isArray(meet.registrations)) meet.registrations = [];

  // find next id
  const existingIds = (meet.registrations||[]).map(r=>Number(r.id)).filter(n=>Number.isFinite(n));
  let nextId = existingIds.length?Math.max(...existingIds)+1:1;
  const startCount = meet.registrations.length;

  const sampleTeams = ['Independent','Team Alpha','Team Beta','Team MSSL','Club Rockets'];
  const sampleFirst = ['Alex','Sam','Taylor','Jordan','Riley','Casey','Morgan','Jamie','Drew','Cameron'];
  const sampleLast = ['Smith','Johnson','Lee','Brown','Garcia','Martinez','Davis','Wilson','Clark','Lewis'];

  for(let i=0;i<count;i++){
    const id = nextId++;
    const name = randChoice(sampleFirst) + ' ' + randChoice(sampleLast) + ' (T)';
    const age = Math.floor(Math.random()*30)+8; // 8-37
    const gender = Math.random()<0.5 ? 'boys' : 'girls';
    const team = randChoice(sampleTeams);
    const divisionGroup = (meet.groups && meet.groups[0]) ? meet.groups[0] : {id:'g1',label:'Default'};

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
      paid: false,
      checkedIn: false,
      totalCost: 0,
      options: { challengeUp:false, novice:false, elite:false, open:false, quad:false, timeTrials:false, relays:false, skateability:false, skateabilityGroupId: '' }
    };

    meet.registrations.push(reg);
  }

  // write db
  writeJsonAtomic(DATA_FILE, db);
  console.log('Wrote %d registrations. Meet registrations now: %d', count, meet.registrations.length);
  console.log('Done.');
}

main().catch(err=>{ console.error('Error:', err); process.exit(1); });
