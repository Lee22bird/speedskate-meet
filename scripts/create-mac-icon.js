'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'desktop', 'assets');
const source = path.join(outDir, 'icon-source.png');
const iconset = path.join(outDir, 'SpeedSkateMeet.iconset');
const output = path.join(outDir, 'icon.icns');
const fallbackPng = path.join(outDir, 'icon.png');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

if (!fs.existsSync(source)) {
  throw new Error(`Icon source not found: ${source}`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(iconset, { recursive: true, force: true });
fs.rmSync(output, { force: true });
fs.mkdirSync(iconset, { recursive: true });

const sizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

for (const [name, size] of sizes) {
  run('sips', ['-z', String(size), String(size), source, '--out', path.join(iconset, name)]);
}

const iconutilResult = spawnSync('iconutil', ['--convert', 'icns', '--output', output, iconset], { stdio: 'inherit' });
if (iconutilResult.status !== 0) {
  fs.copyFileSync(source, fallbackPng);
  fs.rmSync(iconset, { recursive: true, force: true });
  console.warn('iconutil did not accept the generated iconset; copied desktop/assets/icon.png as the alpha packaging icon placeholder.');
} else {
  fs.rmSync(iconset, { recursive: true, force: true });
  if (!fs.existsSync(fallbackPng)) {
    fs.copyFileSync(source, fallbackPng);
  }
}

console.log(`Created ${fs.existsSync(output) ? path.relative(root, output) : path.relative(root, fallbackPng)}`);
