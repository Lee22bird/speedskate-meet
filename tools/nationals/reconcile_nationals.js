// Nationals golden-master reconciliation.
//
// Imports the REAL 2026 Indoor Nationals bracket, scores it with SSM's OWN
// standings code (never a reimplementation), and compares the result against the
// OFFICIAL champions in data/nationals_champions.js.
//
// The answer key is non-circular: nationals_champions.js is produced by
// tools/nationals/gen_champions.py parsing the official "*Overall*.pdf" sheets.
// No SSM scoring logic touches it.
//
// Output is an ITEMIZED report, not pass/fail — a real championship contains
// human decisions (protests, overturned DQs, manual tiebreaks) that software
// won't reproduce. The bar is: SSM reproduces it AND every difference is
// inspectable.
//
//   node tools/nationals/reconcile_nationals.js [--verbose]

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const nationals = require(path.join(ROOT, 'data', 'nationals_heats.js'));
const official = require(path.join(ROOT, 'data', 'nationals_champions.js'));
const { nationalsToIR } = require(path.join(ROOT, 'services', 'importAdapters', 'nationalsAdapter'));
const { buildMeetFromIR } = require(path.join(ROOT, 'services', 'meetImport'));
const { computeMeetStandings, computeQuadStandings } = require(path.join(ROOT, 'services', 'standings'));

const VERBOSE = process.argv.includes('--verbose');
const norm = s => String(s || '').trim().toLowerCase();

function main() {
  const { ir } = nationalsToIR(nationals);
  const { meet, warnings, stats } = buildMeetFromIR(ir);

  console.log('=== IMPORT ===');
  console.log(' ', JSON.stringify(stats));
  if (warnings.length) console.log('  warnings:', warnings.length);

  // helmet lookup for joining SSM standings rows back to official rows
  const helmetByRegId = new Map(meet.registrations.map(r => [r.id, r.helmetNumber]));

  // --- SSM's own scoring -------------------------------------------------
  const individual = computeMeetStandings(meet);
  let quad = [];
  try { quad = computeQuadStandings(meet) || []; } catch (e) { console.log('  (quad standings threw:', e.message + ')'); }

  // division(lower) -> [ {helmet, place, points, name} ]
  const ssmByDivision = new Map();
  const absorb = (list, label) => {
    for (const d of list || []) {
      const rows = (d.standings || d.rows || []).map(r => ({
        helmet: helmetByRegId.get(Number(r.registrationId)) || '',
        name: r.skaterName,
        place: r.overallPlace,
        points: Number(r.totalPoints || 0),
      }));
      ssmByDivision.set(norm(d.division), rows);
    }
  };
  absorb(individual, 'individual');
  absorb(quad, 'quad');

  console.log(`\n=== SSM COMPUTED ===\n  individual divisions: ${individual.length}   quad divisions: ${quad.length}`);

  // --- reconcile ----------------------------------------------------------
  const report = { divisions: [], champMatch: 0, champMiss: 0, notScored: [] };

  for (const od of official.divisions || []) {
    const key = norm(od.division);
    const ssmRows = ssmByDivision.get(key);
    const officialRows = (od.skaters || []).map(s => ({
      helmet: String(s.num || '').trim(),
      name: s.name, rank: Number(s.rank), total: Number(s.total),
    }));

    if (!ssmRows) {
      report.notScored.push({ division: od.division, officialSkaters: officialRows.length });
      continue;
    }

    const ssmByHelmet = new Map(ssmRows.map(r => [r.helmet, r]));
    const diffs = [];
    let matched = 0;

    for (const o of officialRows) {
      const s = ssmByHelmet.get(o.helmet);
      if (!s) { diffs.push({ kind: 'missing_in_ssm', helmet: o.helmet, name: o.name, officialRank: o.rank }); continue; }
      if (s.place === o.rank) matched++;
      else diffs.push({
        kind: 'rank_differs', helmet: o.helmet, name: o.name,
        officialRank: o.rank, ssmRank: s.place,
        officialTotal: o.total, ssmPoints: s.points,
      });
    }

    const oChamp = officialRows.find(r => r.rank === 1);
    const sChamp = ssmRows.find(r => r.place === 1);
    const champOk = oChamp && sChamp && oChamp.helmet === sChamp.helmet;
    if (oChamp) champOk ? report.champMatch++ : report.champMiss++;

    report.divisions.push({
      division: od.division,
      officialCount: officialRows.length,
      matched,
      diffs,
      champOk: !!champOk,
      officialChamp: oChamp ? `${oChamp.name} (#${oChamp.helmet})` : '—',
      ssmChamp: sChamp ? `${sChamp.name} (#${sChamp.helmet})` : '—',
    });
  }

  // --- print --------------------------------------------------------------
  const scored = report.divisions;
  const totalMatched = scored.reduce((n, d) => n + d.matched, 0);
  const totalOfficial = scored.reduce((n, d) => n + d.officialCount, 0);

  console.log('\n=== RECONCILIATION vs OFFICIAL ===');
  console.log(`  divisions compared: ${scored.length}   (official total: ${(official.divisions || []).length})`);
  console.log(`  CHAMPIONS matched:  ${report.champMatch} / ${report.champMatch + report.champMiss}`);
  console.log(`  skater ranks matched: ${totalMatched} / ${totalOfficial}`);
  if (report.notScored.length) {
    console.log(`\n  divisions SSM produced no standings for: ${report.notScored.length}`);
    for (const n of report.notScored.slice(0, 12)) console.log(`    - ${n.division} (${n.officialSkaters} skaters)`);
    if (report.notScored.length > 12) console.log(`    …and ${report.notScored.length - 12} more`);
  }

  const bad = scored.filter(d => !d.champOk);
  if (bad.length) {
    console.log(`\n  --- divisions where the CHAMPION differs (${bad.length}) ---`);
    for (const d of bad.slice(0, 15)) {
      console.log(`    ${d.division}\n       official: ${d.officialChamp}\n       ssm:      ${d.ssmChamp}`);
    }
  }

  if (VERBOSE) {
    console.log('\n  --- per-division detail ---');
    for (const d of scored) {
      console.log(`  ${d.division}: ${d.matched}/${d.officialCount} ranks matched${d.champOk ? '' : '  [CHAMP DIFFERS]'}`);
      for (const x of d.diffs.slice(0, 6)) console.log('      ', JSON.stringify(x));
    }
  }
}

main();
