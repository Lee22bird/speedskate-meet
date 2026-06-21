'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const target = path.join(dist, 'SpeedSkateMeet.app');

function findBuiltApp(dir) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name === 'SpeedSkateMeet.app') return full;
    if (entry.isDirectory()) {
      const nested = findBuiltApp(full);
      if (nested) return nested;
    }
  }
  return null;
}

const source = findBuiltApp(dist);
if (!source) {
  throw new Error('SpeedSkateMeet.app was not found under dist.');
}

if (path.resolve(source) !== path.resolve(target)) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

console.log(`Alpha app ready: ${path.relative(root, target)}`);
