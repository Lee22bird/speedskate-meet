const fs = require('fs');
const path = require('path');

const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');

const DATA_FILE =
  process.env.SSM_DATA_FILE ||
  path.join(DATA_DIR, 'ssm_db.json');
  function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('Failed reading JSON DB:', err);
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmp = filePath + '.tmp';

  fs.writeFileSync(
    tmp,
    JSON.stringify(data, null, 2),
    'utf8'
  );

  fs.renameSync(tmp, filePath);
}
module.exports = {
  safeReadJson,
  writeJsonAtomic,
  DATA_DIR,
  DATA_FILE,
};