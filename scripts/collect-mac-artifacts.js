'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dmgDir = path.join(root, 'release', 'dmg');

module.exports = async function collectMacArtifacts(context) {
  const artifactPaths = Array.isArray(context.artifactPaths) ? context.artifactPaths : [];
  fs.mkdirSync(dmgDir, { recursive: true });

  for (const artifactPath of artifactPaths) {
    if (!String(artifactPath).toLowerCase().endsWith('.dmg')) continue;
    const target = path.join(dmgDir, path.basename(artifactPath));
    fs.copyFileSync(artifactPath, target);
    console.log(`Copied DMG artifact to ${path.relative(root, target)}`);
  }
};
