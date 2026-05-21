// TESTING ONLY — do not run against production meet data unless intentional.
// Script: revertLastStressSeed.js
// Usage: node scripts/revertLastStressSeed.js
// WARNING: This will restore the most recent stress-test backup into the live DB file after explicit confirmation.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const DATA_FILE = process.env.SSM_DATA_FILE || path.join(DATA_DIR, 'ssm_db.json');

function safeReadDir(dir) {
  try { return fs.readdirSync(dir); } catch (e) { return []; }
}

function usage() {
  console.log('Usage: node scripts/revertLastStressSeed.js');
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

async function confirmPrompt(question) {
  const rl = readline.createInterface({input:process.stdin,output:process.stdout});
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(String(answer||'').trim()); }));
}

function writeJsonAtomic(fp,data) {
  const tmp = fp + '.tmp.' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, fp);
}

async function main() {
  if(process.argv.length > 2) { usage(); process.exit(1); }

  if(!fs.existsSync(DATA_FILE)) {
    console.error('DB file not found at', DATA_FILE);
    process.exit(1);
  }

  const dir = path.dirname(DATA_FILE);
  const basename = path.basename(DATA_FILE);
  const files = safeReadDir(dir);
  const backups = files
    .filter(f => f.startsWith(basename + '.bak.'))
    .map(f => ({
      name: f,
      path: path.join(dir, f),
      mtime: fs.statSync(path.join(dir, f)).mtime.getTime(),
    }))
    .sort((a,b) => b.mtime - a.mtime);

  if(!backups.length) {
    console.error('No stress-test backup files found in', dir);
    process.exit(1);
  }

  const latest = backups[0];
  console.log('\nFound latest stress-test backup:');
  console.log('  Backup file:', latest.path);
  console.log('  Timestamp:', formatTimestamp(latest.mtime));
  console.log('  Target DB file:', DATA_FILE);
  console.log('\nThis will restore the backup file over the live DB file. Never delete backups automatically.');
  console.log('To proceed TYPE EXACTLY: YES TO RESTORE\n');

  const answer = await confirmPrompt('Type YES TO RESTORE: ');
  if(answer !== 'YES TO RESTORE') {
    console.log('Aborted.');
    process.exit(0);
  }

  const backupData = fs.readFileSync(latest.path, 'utf8');
  writeJsonAtomic(DATA_FILE, backupData);
  console.log('Restored backup to', DATA_FILE);
  console.log('Done.');
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
