'use strict';

const { spawnSync } = require('child_process');

module.exports = async function cleanMacExtendedAttributes(context) {
  if (process.platform !== 'darwin' || context.electronPlatformName !== 'darwin') return;

  const result = spawnSync('xattr', ['-cr', context.appOutDir], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`xattr cleanup failed with exit code ${result.status}`);
  }
};
