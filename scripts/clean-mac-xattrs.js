'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function cleanOne(target) {
  const result = spawnSync('xattr', ['-c', target], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`xattr cleanup failed for ${target} with exit code ${result.status}`);
  }
}

function walk(target) {
  cleanOne(target);
  const stat = fs.lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;

  for (const entry of fs.readdirSync(target)) {
    walk(path.join(target, entry));
  }
}

module.exports = async function cleanMacExtendedAttributes(context) {
  if (process.platform !== 'darwin' || context.electronPlatformName !== 'darwin') return;

  console.log(`Clearing macOS extended attributes in ${context.appOutDir}`);
  walk(context.appOutDir);
};
