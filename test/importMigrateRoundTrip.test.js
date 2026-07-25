// Importer foundation guard: a SAVED import must score identically after reload.
//
// knowledge.md §10 + the closing Reflection: two production bugs silently ate
// data because headless tests never round-tripped through migrateMeet's field
// whitelists — only a live save/load caught them. The Google-Sheet importer
// (Jessica's race-day sheet) will WRITE a meet that then gets reloaded, so the
// single most important property to lock down BEFORE that adapter exists is:
//
//   build a meet from an IR  ->  save (serialize)  ->  load (migrateMeet)
//   ...must not change the scored result at all.
//
// We prove it on the hardest possible input we have — the full 2026 Indoor
// Nationals field, which the in-memory golden master already reproduces 50/50
// champions / 200-of-220 ranks. This test re-scores it AFTER a real migrateMeet
// round-trip and asserts ZERO drift, so any future whitelist edit that would
// drop an import-critical field (countsForOverall, groupId, division, dayIndex,
// a laneEntry's place/registrationId) fails here by name.
//
// Non-circular: the official champions come from data/nationals_champions.js
// (parsed from the official PDFs); no SSM scoring logic touches it.
//
//   node --test test/importMigrateRoundTrip.test.js

const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const nationals = require(path.join(ROOT, 'data', 'nationals_heats.js'));
const official = require(path.join(ROOT, 'data', 'nationals_champions.js'));
const { nationalsToIR } = require(path.join(ROOT, 'services', 'importAdapters', 'nationalsAdapter'));
const { buildMeetFromIR } = require(path.join(ROOT, 'services', 'meetImport'));
const { computeMeetStandings, computeQuadStandings } = require(path.join(ROOT, 'services', 'standings'));
const { migrateMeet } = require(path.join(ROOT, 'services', 'meetHelpers'));

const norm = s => String(s || '').trim().toLowerCase();

// Score a meet with SSM's OWN standings code and reconcile it against the
// official answer key. Mirrors tools/nationals/reconcile_nationals.js exactly,
// with one deliberate hardening: SSM helmets are String()-normalized, because
// migrateMeet coerces reg.helmetNumber to a Number on reload and helmet is our
// reconciliation join key (scoring itself joins by registrationId, so this type
// drift never touches the score — only this test-side comparison).
function scoreAndReconcile(meet) {
  const helmetByRegId = new Map(meet.registrations.map(r => [Number(r.id), String(r.helmetNumber == null ? '' : r.helmetNumber).trim()]));

  const individual = computeMeetStandings(meet);
  let quad = [];
  try { quad = computeQuadStandings(meet) || []; } catch (_) { quad = []; }

  const ssmByDivision = new Map();
  const absorb = list => {
    for (const d of list || []) {
      const rows = (d.standings || d.rows || []).map(r => ({
        helmet: String(helmetByRegId.get(Number(r.registrationId)) || '').trim(),
        place: r.overallPlace,
      }));
      ssmByDivision.set(norm(d.division), rows);
    }
  };
  absorb(individual);
  absorb(quad);

  let champMatch = 0, champTotal = 0, ranksMatched = 0, ranksTotal = 0;
  const champByDivision = {}; // division(lower) -> champion helmet (SSM)

  for (const od of official.divisions || []) {
    const ssmRows = ssmByDivision.get(norm(od.division));
    if (!ssmRows) continue; // e.g. Premier Ladies (single-skater field) — unscored by design
    const officialRows = (od.skaters || []).map(s => ({
      helmet: String(s.num || '').trim(), rank: Number(s.rank),
    }));
    const ssmByHelmet = new Map(ssmRows.map(r => [r.helmet, r]));

    for (const o of officialRows) {
      ranksTotal++;
      const s = ssmByHelmet.get(o.helmet);
      if (s && s.place === o.rank) ranksMatched++;
    }

    const oChamp = officialRows.find(r => r.rank === 1);
    const sChamp = ssmRows.find(r => r.place === 1);
    if (oChamp) {
      champTotal++;
      if (sChamp && sChamp.helmet === oChamp.helmet) champMatch++;
      champByDivision[norm(od.division)] = sChamp ? sChamp.helmet : null;
    }
  }

  return { champMatch, champTotal, ranksMatched, ranksTotal, champByDivision };
}

test('a saved import (serialize + migrateMeet reload) scores identically to the in-memory import — full Nationals field', () => {
  const { ir } = nationalsToIR(nationals);
  const { meet } = buildMeetFromIR(ir);

  // Baseline: the current golden-master path — score straight from buildMeetFromIR.
  const before = scoreAndReconcile(meet);

  // Sanity floor: if the whole pipeline is broken, don't let the differential
  // assertion pass vacuously (0 === 0). We know the real numbers are 50/220.
  assert.ok(before.champMatch >= 45, `baseline champions unexpectedly low: ${before.champMatch}/${before.champTotal}`);
  assert.ok(before.ranksMatched >= 190, `baseline ranks unexpectedly low: ${before.ranksMatched}/${before.ranksTotal}`);

  // Simulate a real disk round-trip: JSON serialize (like saveDb, which drops
  // undefined keys) then the REAL migrateMeet (like loadDb).
  const reloaded = JSON.parse(JSON.stringify(meet));
  migrateMeet(reloaded, 'roundtrip-test-owner');
  const after = scoreAndReconcile(reloaded);

  // The core property: reload changed NOTHING about the scored result.
  assert.strictEqual(after.champMatch, before.champMatch, 'champion count drifted after migrateMeet round-trip');
  assert.strictEqual(after.ranksMatched, before.ranksMatched, 'rank-match count drifted after migrateMeet round-trip');
  assert.strictEqual(after.champTotal, before.champTotal, 'scored-division count drifted after migrateMeet round-trip');
  // Tightest: the SAME skater won EVERY division before and after reload.
  assert.deepStrictEqual(after.champByDivision, before.champByDivision, 'a division champion changed after migrateMeet round-trip');
});

test('migrateMeet preserves the import-critical fields the scorer depends on (§10 guard)', () => {
  const { ir } = nationalsToIR(nationals);
  const { meet } = buildMeetFromIR(ir);
  const reloaded = JSON.parse(JSON.stringify(meet));
  migrateMeet(reloaded, 'roundtrip-test-owner');

  const finals = reloaded.races.filter(r => r.isFinal);
  assert.ok(finals.length > 0, 'no finals survived the round-trip');

  for (const r of finals) {
    // groupId|division is the standings bucket key — both must survive.
    assert.ok(String(r.groupId || '').trim(), `final lost groupId: ${r.distanceLabel} ${r.division}`);
    assert.ok(String(r.division || '').trim(), `final lost division: ${r.distanceLabel}`);
    // dayIndex drives SR832 race-order weighting; whitelist floors it at 1.
    assert.ok(Number(r.dayIndex) >= 1, `final lost dayIndex: ${r.division} ${r.distanceLabel}`);
    // An individual (non-quad, non-relay, non-open) final must keep counting
    // toward the overall, or its division silently stops scoring.
    if (!r.isQuadRace && !r.isRelayRace && !r.isOpenRace) {
      assert.strictEqual(r.countsForOverall, true, `individual final stopped counting for overall: ${r.division} ${r.distanceLabel}`);
    }
    // laneEntries are not re-whitelisted by migrateMeet; the fields the scorer
    // reads (place + registrationId) must therefore still be there.
    for (const e of r.laneEntries) {
      assert.ok('place' in e, 'lane entry lost place after round-trip');
      assert.ok('registrationId' in e, 'lane entry lost registrationId after round-trip');
    }
  }
});
