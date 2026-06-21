'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const source = path.join(dist, 'mac-arm64', 'SpeedSkateMeet.app');
const target = path.join(dist, 'SpeedSkateMeet.app');

if (!fs.existsSync(source)) {
  throw new Error('SpeedSkateMeet.app was not found under dist.');
}

fs.rmSync(target, { recursive: true, force: true });
fs.renameSync(source, target);

console.log(`Alpha app ready: ${path.relative(root, target)}`);
