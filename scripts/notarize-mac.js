'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const releaseMacDir = path.join(root, 'release', 'mac');
const releaseDmgDir = path.join(root, 'release', 'dmg');
const notarizedDir = path.join(root, 'release', 'notarized');

function envReady() {
  return Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID);
}

function shouldSkip() {
  return process.env.SSM_SKIP_NOTARIZE === '1' || process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

function copyIfExists(source, targetDir) {
  if (!source || !fs.existsSync(source)) return null;
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, path.basename(source));
  fs.copyFileSync(source, target);
  return target;
}

function newestArtifact(ext) {
  if (!fs.existsSync(releaseMacDir)) return null;
  const matches = fs.readdirSync(releaseMacDir)
    .filter(name => name.toLowerCase().endsWith(ext))
    .map(name => path.join(releaseMacDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return matches[0] || null;
}

async function notarizeAppFromBuilder(context) {
  if (process.platform !== 'darwin') return;
  if (shouldSkip()) {
    console.log('Skipping macOS notarization because SSM_SKIP_NOTARIZE=1 or code signing is disabled.');
    return;
  }
  if (!envReady()) {
    console.log('Skipping macOS notarization because APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID is missing.');
    return;
  }

  const { notarize } = require('@electron/notarize');
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) {
    throw new Error(`App bundle not found for notarization: ${appPath}`);
  }

  console.log(`Submitting ${appName}.app for Apple notarization...`);
  await notarize({
    tool: 'notarytool',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
}

function notarizeBuiltDmg() {
  if (process.platform !== 'darwin') {
    throw new Error('macOS notarization must run on macOS.');
  }
  if (!envReady()) {
    throw new Error('Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID before running notarization.');
  }

  const dmg = process.env.SSM_DMG_PATH || newestArtifact('.dmg');
  if (!dmg || !fs.existsSync(dmg)) {
    throw new Error('No DMG found under release/mac. Run npm run build:mac first.');
  }

  fs.mkdirSync(releaseDmgDir, { recursive: true });
  fs.mkdirSync(notarizedDir, { recursive: true });
  copyIfExists(dmg, releaseDmgDir);

  console.log(`Submitting ${path.basename(dmg)} to Apple notary service...`);
  run('xcrun', [
    'notarytool',
    'submit',
    dmg,
    '--apple-id',
    process.env.APPLE_ID,
    '--password',
    process.env.APPLE_APP_SPECIFIC_PASSWORD,
    '--team-id',
    process.env.APPLE_TEAM_ID,
    '--wait',
  ]);

  console.log(`Stapling notarization ticket to ${path.basename(dmg)}...`);
  run('xcrun', ['stapler', 'staple', dmg]);
  copyIfExists(dmg, notarizedDir);
  console.log(`Notarized DMG copied to ${path.relative(root, notarizedDir)}`);
}

if (require.main === module) {
  try {
    notarizeBuiltDmg();
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }
} else {
  module.exports = notarizeAppFromBuilder;
}
