// Regenerate data/nationalsRoster.js from the parsed Nationals results.
//
// THE SKATER IDENTITY MODEL (owner-confirmed; verified against the answer key):
// at USARS Nationals ONE person competes across disciplines, and EACH DISCIPLINE
// is its own registration with its OWN helmet number and its OWN (differently
// named) age division. Lilliann Salazar is #64 in inline "Freshman Girls" AND
// #129 in quad "Freshman Girls"; Matthew Towne II (inline "Juvenile Boys") raced
// quad as "Elementary Boys" — both under #497. data/nationals_champions.js lists
// the per-discipline numbers separately, so the dev roster must too, or the live
// app can't be checked against the answer key by helmet.
//
// Therefore this generator emits ONE ROW PER (person × discipline):
//   - identity is the PERSON (rows are keyed by name+discipline, never by helmet);
//   - each row carries the helmet + division AS RACED IN THAT DISCIPLINE;
//   - within a discipline, the official sheets sometimes renumber a skater
//     between rounds (Towne raced inline heats as #13, semis/finals as #497; the
//     answer key only ever uses #497) — those collapse to the deepest-stage
//     number. ACROSS disciplines rows are never collapsed.
//
// RELAY rows carry temporary grouped TEAM numbers (a relay "helmet" identifies
// the team for that one event and collides freely with real individual numbers).
// They never contribute identities: relay members are matched back by NAME, and
// inline relay sizes attach to the person's inline row, quad relay sizes to
// their quad row (falling back to whichever row exists).
//
//   node tools/nationals/gen_dev_roster.js

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
const stageWeight = label => /^final/i.test(String(label || '')) ? 3 : /^semi/i.test(String(label || '')) ? 2 : 1;

// KNOWN SHEET TYPOS — canonicalized AT INGEST (before identity keying) so the
// variant never creates a duplicate entry. Only for cases where the majority
// spelling is known-wrong (Lilliann: both spellings appear across her own rows
// and the TYPO is the majority; her sister's consistent "Salazar" decides it).
const NAME_FIXES = new Map([
  ['lilliann salizar', 'Lilliann Salazar'],
]);
const fixName = raw => NAME_FIXES.get(norm(raw)) || String(raw || '').trim();

// Edit distance ≤ 2 (names are short; full DP is fine). Used to detect spelling
// variants of the SAME skater — only ever inside the same discipline + helmet +
// team + division, so genuinely different people sharing a printed number
// (e.g. inline #183: Brandon Gray / Matthew Tseng — different teams AND
// divisions) are never merged.
function editDistanceLe2(a, b) {
  a = norm(a).replace(/\s+/g, ''); b = norm(b).replace(/\s+/g, '');
  if (Math.abs(a.length - b.length) > 2) return false;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length] <= 2;
}

function build() {
  // (name|discipline) -> { name, team, division, discipline,
  //                        helmets: Map(helmet -> {rows, maxStage}),
  //                        relays:Set, quadRelays:Set }
  const entries = new Map();
  const byName = new Map(); // norm(name) -> { inline?: entry, quad?: entry }
  const relayTeams = [];    // { isQuad, size, members:[name] }

  // PASS 1 — individual events only: one entry per person per discipline.
  for (const day of HEATS.days || []) {
    const quad = isQuadDay(day);
    const discipline = quad ? 'quad' : 'inline';
    for (const session of day.sessions || []) {
      for (const event of session.events || []) {
        const rounds = event.rounds || [];
        if (rounds.some(r => r.relay)) continue;
        const division = String(event.division || '').trim();
        for (const round of rounds) {
          const w = stageWeight(round.label);
          for (const s of round.skaters || []) {
            const helmet = String(s.helmet == null ? '' : s.helmet).trim();
            const name = fixName(s.name);
            if (!helmet || !name) continue;
            const key = norm(name) + '|' + discipline;
            if (!entries.has(key)) {
              entries.set(key, {
                name, team: String(s.team || '').trim(), division, discipline,
                helmets: new Map(), relays: new Set(), quadRelays: new Set(),
              });
              const slot = byName.get(norm(name)) || {};
              slot[discipline] = entries.get(key);
              byName.set(norm(name), slot);
            }
            const e = entries.get(key);
            e.division = division; // per-discipline label; last write within the discipline is fine
            if (!e.team && s.team) e.team = String(s.team).trim();
            const h = e.helmets.get(helmet) || { rows: 0, maxStage: 0 };
            h.rows += 1; h.maxStage = Math.max(h.maxStage, w);
            e.helmets.set(helmet, h);
          }
        }
      }
    }
  }

  // Resolve each entry's helmet: the number the skater raced the DEEPEST stage
  // under in THAT discipline (then most rows, then lowest number). Renumber cases
  // (Towne inline #13 heats -> #497 finals) collapse here; the kept number is the
  // one the answer key uses.
  const renumberLog = [];
  for (const e of entries.values()) {
    const ranked = Array.from(e.helmets.entries())
      .sort((a, b) => b[1].maxStage - a[1].maxStage || b[1].rows - a[1].rows || Number(a[0]) - Number(b[0]));
    e.helmet = ranked[0][0];
    for (const [h] of ranked.slice(1)) renumberLog.push(`${e.name} [${e.discipline}]: #${h} -> #${e.helmet}`);
  }

  // CLEAN TEAM NAMES — PDF pollution (record times / DNF-DNS notes bled into the
  // team column). Same technique as the golden-master adapter: detect by markers
  // and time patterns (never bare digits — "SS2-Wolverines" is a real club), then
  // backfill by longest-common-prefix against clean team names. Runs BEFORE the
  // variant merge so a polluted team string can't defeat its same-team guard.
  const POLLUTED = /new record|did not finish|did not start|\d:\d\d\.\d/i;
  const cleanTeams = Array.from(new Set(
    Array.from(entries.values()).map(e => e.team).filter(t => t && !POLLUTED.test(t))
  ));
  const lcp = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++; return i; };
  let teamsCleaned = 0;
  for (const e of entries.values()) {
    if (!POLLUTED.test(e.team || '')) continue;
    let best = '', bestLen = 0;
    for (const t of cleanTeams) { const l = lcp(e.team, t); if (l > bestLen && l >= 4) { bestLen = l; best = t; } }
    e.team = best || e.team.replace(/\s*\d.*$/, '').replace(/\s*-?\s*(New Record|Did Not Finish|Did Not Start).*$/i, '').trim();
    teamsCleaned++;
  }

  // VARIANT MERGE — spelling variants of the SAME skater otherwise become two
  // entries (Pricilla/Priscilla Yang #189, Koralyn/Koralyne Hick #303,
  // Shrewsbery/Shrewsbury #62…). Merge ONLY under the strictest guard: same
  // discipline + same resolved helmet + same team + same division + names within
  // edit distance 2. Genuinely different people who SHARE a printed number
  // (inline #182 Bella Daddy / Marnie Alapati, #183 Brandon Gray / Matthew Tseng
  // — different teams AND divisions) fail the guard and stay separate rows.
  // Keeps the most-attested spelling; the dropped spelling becomes a NAME ALIAS
  // so relay member lists written with either spelling still match in PASS 2.
  const totalRows = e => Array.from(e.helmets.values()).reduce((n, h) => n + h.rows, 0);
  const variantLog = [];
  {
    const byDiscHelmet = new Map();
    for (const [key, e] of entries) {
      const k = e.discipline + '|' + e.helmet;
      if (!byDiscHelmet.has(k)) byDiscHelmet.set(k, []);
      byDiscHelmet.get(k).push({ key, e });
    }
    for (const [, list] of byDiscHelmet) {
      if (list.length < 2) continue;
      list.sort((a, b) => totalRows(b.e) - totalRows(a.e));
      const kept = list[0];
      for (const cand of list.slice(1)) {
        const samePerson = norm(cand.e.team) === norm(kept.e.team)
          && norm(cand.e.division) === norm(kept.e.division)
          && editDistanceLe2(cand.e.name, kept.e.name);
        if (!samePerson) continue;
        for (const n of cand.e.relays) kept.e.relays.add(n);
        for (const n of cand.e.quadRelays) kept.e.quadRelays.add(n);
        entries.delete(cand.key);
        const slot = byName.get(norm(cand.e.name)) || {};
        slot[cand.e.discipline] = kept.e;
        byName.set(norm(cand.e.name), slot);
        variantLog.push(`${cand.e.name} -> ${kept.e.name} [${cand.e.discipline} #${kept.e.helmet}]`);
      }
    }
  }

  // PASS 2 — relays: attach sizes by member NAME to the discipline-matching row.
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
      // Canonicalize through the same known-typo map as ingest — relay member
      // lists use the sheet spellings too ("…, Lilliann Salizar").
      const slot = byName.get(norm(fixName(member)));
      // Inline relays attach to the inline row, quad relays to the quad row; a
      // person with only the other discipline's row still gets the option there
      // (eligibility keys on the option + age/gender, not on discipline rows).
      const target = slot ? (t.isQuad ? (slot.quad || slot.inline) : (slot.inline || slot.quad)) : null;
      if (!target) { relayUnmatched++; continue; }
      relayMatched++;
      (t.isQuad ? target.quadRelays : target.relays).add(t.size);
    }
  }

  // Emit one row per (person × discipline).
  // (Team cleaning + known-typo canonicalization already happened above — the
  // typos at INGEST so variants can never key separate identities, the teams
  // before the variant merge so pollution can't defeat its same-team guard.)
  const rows = Array.from(entries.values())
    .sort((a, b) => Number(a.helmet) - Number(b.helmet) || a.name.localeCompare(b.name) || a.discipline.localeCompare(b.discipline))
    .map(e => {
      const row = { helmet: e.helmet, name: e.name, team: e.team, division: e.division };
      if (e.discipline === 'quad') row.discipline = 'quad';
      const relays = Array.from(e.relays).sort((a, b) => a - b);
      if (relays.length) row.relays = relays;
      const quadRelays = Array.from(e.quadRelays).sort((a, b) => a - b);
      if (quadRelays.length) row.quadRelays = quadRelays;
      return row;
    });

  const header =
    '// AUTO-GENERATED Nationals dev roster — ONE ROW PER (person × discipline).\n' +
    '// Identity is the PERSON, but each discipline is its own registration with\n' +
    '// its OWN helmet number and its OWN age-division label (quads use different\n' +
    '// age-group names than inline for the same skater). Fields: helmet, name,\n' +
    '// team, division (as raced in THAT discipline), discipline ("quad" | absent\n' +
    '// = inline), relays (inline relay sizes), quadRelays (quad relay sizes).\n' +
    '// Regenerate with: node tools/nationals/gen_dev_roster.js\n';
  const body = 'module.exports = [\n' + rows.map(r => '  ' + JSON.stringify(r)).join(',\n') + '\n];\n';
  require('fs').writeFileSync(OUT, header + body);

  const inline = rows.filter(r => r.discipline !== 'quad');
  const quad = rows.filter(r => r.discipline === 'quad');
  const names = new Set(rows.map(r => norm(r.name)));
  console.log(`wrote ${OUT}`);
  console.log(`  rows: ${rows.length}   people: ${names.size}   inline rows: ${inline.length}   quad rows: ${quad.length}`);
  console.log(`  dual-discipline people: ${rows.length - names.size}`);
  console.log(`  with inline relays: ${rows.filter(r => r.relays).length}   with quad relays: ${rows.filter(r => r.quadRelays).length}`);
  console.log(`  relay members matched: ${relayMatched}   unmatched (relay-only / name mismatch): ${relayUnmatched}`);
  console.log(`  polluted team names cleaned: ${teamsCleaned}`);
  console.log(`  within-discipline renumbers collapsed: ${renumberLog.length}`);
  for (const m of renumberLog) console.log(`    ${m}`);
  console.log(`  spelling variants merged: ${variantLog.length}`);
  for (const m of variantLog) console.log(`    ${m}`);
}

build();
