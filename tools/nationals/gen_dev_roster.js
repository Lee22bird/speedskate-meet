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
            // Merge evidence: how deep this helmet raced and how often it appears.
            p._rows = (p._rows || 0) + 1;
            const w = /^final/i.test(String(round.label || '')) ? 3 : /^semi/i.test(String(round.label || '')) ? 2 : 1;
            p._maxStage = Math.max(p._maxStage || 0, w);
            if (!helmetByName.has(norm(name))) helmetByName.set(norm(name), helmet);
          }
        }
      }
    }
  }

  // MERGE — one PERSON can appear under multiple numbers in the official sheets
  // (all confirmed in the IDN 2026 data, all same-team):
  //   1. heat-vs-final renumbering (Towne raced heats as #13, semis/finals as #497);
  //   2. separate inline and quad numbers for the same skater (~10 people);
  //   3. sibling number swaps on single PDF rows (Velli #333/#334 cross-bleed).
  // NOTE the related trap that does NOT apply here: RELAY rows carry temporary
  // grouped TEAM numbers (a relay "helmet" identifies the team, not a person, and
  // can collide with someone's real individual number) — relay rounds are already
  // excluded from PASS 1, and PASS 2 matches members by NAME only.
  // Merge individual entries by normalized name: keep the number the skater raced
  // the DEEPEST stage under (finals > semis > heats; then most rows), union their
  // participation, prefer the inline division as home. Same-name merges are safe
  // here because every observed pair shares a team; merges are logged for audit.
  const mergeLog = [];
  const byNameGroups = new Map();
  for (const p of people.values()) {
    const k = norm(p.name);
    if (!byNameGroups.has(k)) byNameGroups.set(k, []);
    byNameGroups.get(k).push(p);
  }
  for (const [k, list] of byNameGroups) {
    if (list.length < 2) continue;
    list.sort((a, b) => (b._maxStage || 0) - (a._maxStage || 0) || (b._rows || 0) - (a._rows || 0) || Number(a.helmet) - Number(b.helmet));
    const primary = list[0];
    for (const dup of list.slice(1)) {
      if (dup.quad) primary.quad = true;
      if (dup._inlineDiv && !primary._inlineDiv) { primary.division = dup.division; primary._inlineDiv = true; }
      people.delete(dup.helmet);
      mergeLog.push(`${dup.name}: #${dup.helmet} -> #${primary.helmet}`);
    }
    helmetByName.set(k, primary.helmet);
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

  // CLEAN TEAM NAMES — the PDF parser overlapped the team column with record
  // times / DNF notes on ~10 rows ("Stallions Racing1:59.111", "CC Speed Did Not
  // Finish", "Emerald Coast Spe2e:d27.486 -New Record"). Same technique as the
  // golden-master adapter (nationalsAdapter): detect pollution, backfill by
  // longest-common-prefix against the clean team names seen elsewhere, else
  // strip the polluted tail.
  const POLLUTED = /new record|did not finish|\d:\d\d\.\d/i;
  const cleanTeams = Array.from(new Set(
    Array.from(people.values()).map(p => p.team).filter(t => t && !POLLUTED.test(t))
  ));
  const lcp = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++; return i; };
  let teamsCleaned = 0;
  for (const p of people.values()) {
    if (!POLLUTED.test(p.team || '')) continue;
    let best = '', bestLen = 0;
    for (const t of cleanTeams) { const l = lcp(p.team, t); if (l > bestLen && l >= 4) { bestLen = l; best = t; } }
    p.team = best || p.team.replace(/\s*\d.*$/, '').replace(/\s*-?\s*(New Record|Did Not Finish).*$/i, '').trim();
    teamsCleaned++;
  }

  // KNOWN SHEET TYPOS — surgical, documented corrections where the official
  // sheets themselves are inconsistent. Lilliann appears as both "Salizar" and
  // "Salazar" across her own rows (inline #64 AND quad #129); her sister
  // Isabella Salazar (same club) is consistent, so Salazar is the real spelling
  // — but "Salizar" happens to be the sheets' MAJORITY spelling, so frequency
  // can't decide it. Owner-confirmed cleanup, not an inference rule.
  const NAME_FIXES = new Map([
    ['Lilliann Salizar', 'Lilliann Salazar'],
  ]);
  for (const p of people.values()) {
    if (NAME_FIXES.has(p.name)) p.name = NAME_FIXES.get(p.name);
  }

  // Emit in the existing file's shape (only the fields the importer reads).
  const rows = Array.from(people.values())
    .sort((a, b) => Number(a.helmet) - Number(b.helmet) || a.name.localeCompare(b.name))
    .map(p => {
      const row = { helmet: p.helmet, name: p.name, team: p.team, division: p.division };
      const relays = Array.from(p.relays).sort((a, b) => a - b);
      if (relays.length) row.relays = relays;
      if (p.quad) row.quad = true;
      // A helmet that never appeared in an inline INDIVIDUAL event is quad-only
      // (inline+quad split skaters carry a separate inline helmet). Emit
      // inline:false so the importer doesn't over-enter them in inline divisions
      // — that would inflate those fields' sizes (and heat counts) vs the real
      // Nationals program.
      if (!p._inlineDiv) row.inline = false;
      const quadRelays = Array.from(p.quadRelays).sort((a, b) => a - b);
      if (quadRelays.length) row.quadRelays = quadRelays;
      return row;
    });

  const header =
    '// AUTO-GENERATED unique Nationals skater roster for the dev import.\n' +
    '// Fields: helmet, name, team, division; plus real IDN 2026 participation —\n' +
    '//   relays: inline relay sizes entered [2,3,4]; quad: entered a quad\n' +
    '//   INDIVIDUAL event; quadRelays: quad relay sizes entered;\n' +
    '//   inline:false = quad-only helmet (raced no inline individual event).\n' +
    '// Regenerate with: node tools/nationals/gen_dev_roster.js\n';
  const body = 'module.exports = [\n' + rows.map(r => '  ' + JSON.stringify(r)).join(',\n') + '\n];\n';
  require('fs').writeFileSync(OUT, header + body);

  console.log(`wrote ${OUT}`);
  console.log(`  skaters: ${rows.length}   quad entrants: ${rows.filter(r => r.quad).length}   quad-only: ${rows.filter(r => r.inline === false).length}`);
  console.log(`  with inline relays: ${rows.filter(r => r.relays).length}   with quad relays: ${rows.filter(r => r.quadRelays).length}`);
  console.log(`  relay members matched to a helmet: ${relayMatched}   unmatched (relay-only / name mismatch): ${relayUnmatched}`);
  console.log(`  polluted team names cleaned: ${teamsCleaned}`);
  console.log(`  multi-number people merged: ${mergeLog.length}`);
  for (const m of mergeLog) console.log(`    ${m}`);
}

build();
