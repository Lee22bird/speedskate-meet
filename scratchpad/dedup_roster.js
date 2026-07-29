const roster = require('../data/nationalsRoster.js');

function union(a, b) { return [...new Set([...(a || []), ...(b || [])])].sort((x, y) => x - y); }

const byKey = new Map();     // name|team|division -> merged entry (first occurrence kept)
const order = [];
let merged = 0;
for (const s of roster) {
  const key = `${s.name}|${s.team}|${s.division}`.toLowerCase();
  if (byKey.has(key)) {
    const e = byKey.get(key);
    if ((s.relays || []).length) e.relays = union(e.relays, s.relays);
    if (s.quad) e.quad = true;
    if ((s.quadRelays || []).length) e.quadRelays = union(e.quadRelays, s.quadRelays);
    merged++;
  } else {
    byKey.set(key, { ...s });   // keep FIRST occurrence (its helmet)
    order.push(key);
  }
}

// rebuild rows with stable key order + only non-empty enrichment fields
const rows = order.map(k => {
  const s = byKey.get(k);
  const row = { helmet: s.helmet, name: s.name, team: s.team, division: s.division };
  if ((s.relays || []).length) row.relays = s.relays;
  if (s.quad) row.quad = true;
  if ((s.quadRelays || []).length) row.quadRelays = s.quadRelays;
  return '  ' + JSON.stringify(row);
});

const header = '// AUTO-GENERATED unique Nationals skater roster for the dev import.\n'
  + '// Fields: helmet, name, team, division; plus real IDN 2026 participation —\n'
  + '//   relays: inline relay sizes entered [2,3,4]; quad: entered a quad event;\n'
  + '//   quadRelays: quad relay sizes entered [2,3]. Regenerate from IDN data.\n';
require('fs').writeFileSync(__dirname + '/../data/nationalsRoster.js',
  header + 'module.exports = [\n' + rows.join(',\n') + '\n];\n');

console.log(`deduped: ${roster.length} -> ${order.length} rows (removed ${merged} duplicates)`);
