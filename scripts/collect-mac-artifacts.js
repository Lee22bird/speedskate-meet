'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const releaseMacDir = path.join(root, 'release', 'mac');
const dmgDir = path.join(root, 'release', 'dmg');

module.exports = async function collectMacArtifacts(context) {
  const artifactPaths = Array.isArray(context.artifactPaths) ? context.artifactPaths : [];
  fs.mkdirSync(releaseMacDir, { recursive: true });
  fs.mkdirSync(dmgDir, { recursive: true });

  for (const artifactPath of artifactPaths) {
    const releaseTarget = path.join(releaseMacDir, path.basename(artifactPath));
    fs.copyFileSync(artifactPath, releaseTarget);
    console.log(`Copied release artifact to ${path.relative(root, releaseTarget)}`);

    if (String(artifactPath).toLowerCase().endsWith('.dmg')) {
      const dmgTarget = path.join(dmgDir, path.basename(artifactPath));
      fs.copyFileSync(artifactPath, dmgTarget);
      console.log(`Copied DMG artifact to ${path.relative(root, dmgTarget)}`);
    }
  }
};
