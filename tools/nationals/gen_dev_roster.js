// Regenerate data/nationalsRoster.js from the parsed Nationals results.
//
// The dev "Import Nationals roster" button stress-tests race generation with the
// real, national-sized field. Its source (data/nationalsRoster.js) had drifted:
// it predated the quad/quad-relay data regen, so it was missing 57 individual
// skaters and under-counted quad entrants (37 vs 77) — and no generator existed
// to rebuild it. This is that generator; it derives everything from
// data/nationals_heats.js (the same ground truth the golden-master validates).
//
//   node tools/nationals/gen_dev_roster.js
//
// Per skater (keyed by helmet): division (age group), the inline relay sizes and
// quad relay sizes their relay team raced, and whether they entered any quad
// individual event.

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HEATS = require(path.join(ROOT, 'data', 'nationals_heats.js'));
const OUT = path.join(ROOT, 'data', 'nationalsRoster.js');

const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const isQuadDay = day => JSON.stringify(day).toLowerCase().includes('quad');
const relaySize = division => {
  const m = String(division).match(/\b([234])\b/);
  return m ? Number(m[1]) : null;
};

function build() {
  const people = new Map();   // helmet -> { helmet, name, team, division, quad, relays:Set, quadRelays:Set }
  const helmetByName = new Map();
  const relayTeams = [];      // { isQuad, size, members:[name] }

  // PASS 1 — individuals: establish each helmet's identity + age division, and a
  // name->helmet index for matching relay members back to individuals.
  for (const day of HEATS.days || []) {
    const quad = isQuadDay(day);
    for (const session of day.sessions || []) {
      for (const event of session.events || []) {
        const rounds = event.rounds || [];
        const isRelay = rounds.some(r => r.relay);
        if (isRelay) continue;
        const division = String(event.division || '').trim();  // e.g. "Elementary Boys"
        for (const round of rounds) {
          for (const s of round.skaters || []) {
            const helmet = String(s.helmet == null ? '' : s.helmet).trim();
            const name = String(s.name || '').trim();
            if (!helmet || !name) continue;
            if (!people.has(helmet)) {
              people.set(helmet, { helmet, name, team: String(s.team || '').trim(), division, quad: false, relays: new Set(), quadRelays: new Set() });
            }
            const p = people.get(helmet);
            // Prefer an inline division label as the skater's home division; only
            // fall back to a quad label if that's all they raced.
            if (quad && !p._inlineDiv) { /* keep */ } else if (!quad) { p.division = division; p._inlineDiv = true; }
            if (quad) p.quad = true;
            if (!helmetByName.has(norm(name))) helmetByName.set(norm(name), helmet);
          }
        }
      }
    }
  }

  // PASS 2 — relays: teams list their members in the `team` field (comma-joined).
  // Map each member name back to an individual helmet and tag the relay size.
  for (const day of HEATS.days || []) {
    const quad = isQuadDay(day);
    for (const session of day.sessions || []) {
      for (const event of session.events || []) {
        const rounds = event.rounds || [];
        if (!rounds.some(r => r.relay)) continue;
        const size = relaySize(event.division);
        if (!size) continue;
        for (const round of rounds) {
          for (const team of round.skaters || []) {
            const members = String(team.team || '').split(',')
              .map(m => m.trim())
              // relay_parse.py sometimes bleeds a DQ annotation ("DQ #19 Team
              // Distanced") into the member list — those aren't skater names.
              .filter(m => m && !/^DQ\b/i.test(m));
            relayTeams.push({ isQuad: quad, size, members });
          }
        }
      }
    }
  }

  let relayMatched = 0, relayUnmatched = 0;
  const seenTeam = new Set();
  for (const t of relayTeams) {
    const teamKey = `${t.isQuad}|${t.size}|${t.members.map(norm).sort().join('+')}`;
    if (seenTeam.has(teamKey)) continue; // heat + final list the same team; count once
    seenTeam.add(teamKey);
    for (const member of t.members) {
      const helmet = helmetByName.get(norm(member));
      if (!helmet) { relayUnmatched++; continue; }
      relayMatched++;
      const p = people.get(helmet);
      (t.isQuad ? p.quadRelays : p.relays).add(t.size);
    }
  }

  // Emit in the existing file's shape (only the fields the importer reads).
  const rows = Array.from(people.values())
    .sort((a, b) => Number(a.helmet) - Number(b.helmet) || a.name.localeCompare(b.name))
    .map(p => {
      const row = { helmet: p.helmet, name: p.name, team: p.team, division: p.division };
      const relays = Array.from(p.relays).sort((a, b) => a - b);
      if (relays.length) row.relays = relays;
      if (p.quad) row.quad = true;
      const quadRelays = Array.from(p.quadRelays).sort((a, b) => a - b);
      if (quadRelays.length) row.quadRelays = quadRelays;
      return row;
    });

  const header =
    '// AUTO-GENERATED unique Nationals skater roster for the dev import.\n' +
    '// Fields: helmet, name, team, division; plus real IDN 2026 participation —\n' +
    '//   relays: inline relay sizes entered [2,3,4]; quad: entered a quad event;\n' +
    '//   quadRelays: quad relay sizes entered [2,3,4].\n' +
    '// Regenerate with: node tools/nationals/gen_dev_roster.js\n';
  const body = 'module.exports = [\n' + rows.map(r => '  ' + JSON.stringify(r)).join(',\n') + '\n];\n';
  require('fs').writeFileSync(OUT, header + body);

  console.log(`wrote ${OUT}`);
  console.log(`  skaters: ${rows.length}   quad entrants: ${rows.filter(r => r.quad).length}`);
  console.log(`  with inline relays: ${rows.filter(r => r.relays).length}   with quad relays: ${rows.filter(r => r.quadRelays).length}`);
  console.log(`  relay members matched to a helmet: ${relayMatched}   unmatched (relay-only / name mismatch): ${relayUnmatched}`);
}

build();
