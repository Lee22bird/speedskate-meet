// Division-scheme: the Meet Builder "USARS National" button must produce the
// COMPLETE race-ready national preset — not just an age-group list.
//
// Regression history (both bit for real):
//  1. The /division-scheme route only rebuilt groups when the usars flag FLIPPED,
//     so a meet already flagged usarsDivisions=true with a stale group list could
//     never be healed (Grand Classic/Masters/Veteran/Esquire + Premier missing).
//  2. Even when it did rebuild, it set ONLY meet.groups — no elite enablement, no
//     quad divisions, no relays, no SR832 — while the dev "Set Up Full USARS
//     Meet" shortcut set all of it. The two paths drifted; Meet Builder "USARS"
//     meets looked configured but weren't raceable (elite off everywhere, no quad
//     relays, no inline relay options).
//
// applyDivisionScheme is now the single source of truth for BOTH paths and
// always rebuilds the full preset.
//
//   node --test test/divisionScheme.test.js

const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const {
  applyDivisionScheme, baseGroups, baseGroupsUSARS, makeQuadGroupsTemplate, migrateMeet, defaultMeet,
} = require(path.join(ROOT, 'services', 'meetHelpers'));

const GRAND_AND_PREMIER = [
  'grand_classic_ladies', 'grand_classic_men',
  'grand_masters_ladies', 'grand_masters_men',
  'grand_veteran_ladies', 'grand_veteran_men',
  'grand_esquire_ladies', 'grand_esquire_men',
  'premier_ladies', 'premier_men',
];

// A stale "USARS" meet the way the old builder button left it: flagged usars but
// only the standard-ish group subset, elite off, no quads, no relays, d2 tiebreak.
function staleMeet() {
  return {
    usarsDivisions: true,
    groups: baseGroupsUSARS().filter(g => !/^grand_|^premier_/.test(g.id))
      .map(g => ({ ...g, divisions: { ...g.divisions, elite: { enabled: false, cost: 0, distances: ['', '', '', ''] } } })),
    quadGroups: makeQuadGroupsTemplate(), // all disabled
    relayEnabled: false,
    tiebreaker: 'd2',
  };
}

test('the USARS national set defines all 34 divisions incl. Grand + Premier', () => {
  const ids = baseGroupsUSARS().map(g => g.id);
  assert.strictEqual(ids.length, 34, 'expected 34 USARS divisions');
  for (const id of GRAND_AND_PREMIER) assert.ok(ids.includes(id), `USARS set missing ${id}`);
});

test('USARS National = the complete race-ready preset (heals a stale incomplete meet)', () => {
  const meet = staleMeet();
  applyDivisionScheme(meet, true);

  // 1. All 34 age divisions, including every Grand + Premier.
  assert.strictEqual(meet.groups.length, 34, 'expected the full 34-group national set');
  const ids = meet.groups.map(g => g.id);
  for (const id of GRAND_AND_PREMIER) assert.ok(ids.includes(id), `heal did not add ${id}`);

  // 2. ELITE enabled on EVERY group, with the official distances filled in.
  for (const g of meet.groups) {
    assert.ok(g.divisions?.elite?.enabled, `elite not enabled on ${g.id}`);
    assert.ok((g.divisions.elite.distances || []).some(Boolean), `no elite distances on ${g.id}`);
  }

  // 3. The FULL quad division set — quads mirror the inline age structure
  // (verified vs real 2026 Nationals), not the legacy 8-entry wide-band list.
  assert.strictEqual(meet.quadGroups.length, 34, 'expected the full 34-division quad set');
  const quadIds = meet.quadGroups.map(q => q.id);
  for (const id of GRAND_AND_PREMIER) {
    assert.ok(quadIds.includes(`quad_${id}`), `quad set missing quad_${id}`);
  }
  for (const q of meet.quadGroups) {
    assert.ok(q.enabled, `quad division not enabled: ${q.id}`);
    assert.strictEqual((q.distances || []).filter(Boolean).length, 3, `${q.id} should race 3 distances`);
  }
  // Quad-specific distance tables (not the inline ones) — spot-check against what
  // these divisions actually raced at Nationals.
  assert.deepStrictEqual(meet.quadGroups.find(q => q.id === 'quad_veteran_men').distances, ['300m', '500m', '700m']);
  assert.deepStrictEqual(meet.quadGroups.find(q => q.id === 'quad_junior_men').distances, ['500m', '1000m', '1500m']);
  assert.deepStrictEqual(meet.quadGroups.find(q => q.id === 'quad_masters_ladies').distances, ['300m', '700m', '1000m']);

  // 4. Relays on — the master switch AND every per-division Relay Builder row
  // (relayEnabled alone just showed the list with all checkboxes off).
  assert.strictEqual(meet.relayEnabled, true, 'relays not enabled');
  const { ALL_RELAY_DIVISIONS } = require(path.join(ROOT, 'services', 'relayDivisions'));
  assert.strictEqual(meet.relayTemplates.length, ALL_RELAY_DIVISIONS.length,
    'expected one enabled template row per relay division (inline + quad)');
  for (const t of meet.relayTemplates) assert.ok(t.enabled, `relay division not toggled on: ${t.divisionId}`);
  assert.ok(meet.relayTemplates.some(t => t.discipline === 'inline'), 'no inline relay rows');
  assert.ok(meet.relayTemplates.some(t => t.discipline === 'quad'), 'no quad relay rows');

  // 5. Relay RACES materialized — enabled toggles alone schedule nothing; the
  // Block Builder can only place races that EXIST (they were otherwise only
  // created when someone clicked Save Relay Builder).
  const relayRaces = meet.races.filter(r => r.isRelayRace);
  assert.strictEqual(relayRaces.length, meet.relayTemplates.length, 'one relay race per enabled division');
  assert.strictEqual(relayRaces.filter(r => r.isQuadRace).length, 26, '26 quad relay races');
  assert.strictEqual(relayRaces.filter(r => !r.isQuadRace).length, 49, '49 inline relay races');
  assert.strictEqual(new Set(relayRaces.map(r => r.relayDivisionId)).size, relayRaces.length,
    'each relay race keyed to its own division');
  for (const r of relayRaces) {
    assert.ok(r.isFinal, `relay race should be a final: ${r.groupLabel}`);
    assert.strictEqual(r.countsForOverall, false, `relay race must never score the overall: ${r.groupLabel}`);
  }

  // 6. USARS tiebreaker + flag.
  assert.strictEqual(meet.tiebreaker, 'sr832');
  assert.strictEqual(meet.usarsDivisions, true);
});

test('Block Builder lists the preset relay races as schedulable items', () => {
  const { renderBlockBuilderView } = require(path.join(ROOT, 'views', 'blockBuilderView'));
  const meet = defaultMeet('owner');
  meet.id = 9;
  applyDivisionScheme(meet, true);
  const html = renderBlockBuilderView({ meet });
  assert.match(html, /🔄 /, 'relay items render in the unassigned list');
  assert.ok(html.includes('Quad '), 'quad relay races present in the list');
});

test('re-clicking USARS National is idempotent (same complete preset)', () => {
  const meet = staleMeet();
  applyDivisionScheme(meet, true);
  const once = JSON.parse(JSON.stringify(meet));
  applyDivisionScheme(meet, true);
  assert.deepStrictEqual(meet, once, 'second click changed the meet');
});

test('Standard rebuilds the 24 standard groups, preserves settings, leaves quads/relays/tiebreaker alone', () => {
  const meet = { usarsDivisions: true, groups: baseGroupsUSARS(), quadGroups: makeQuadGroupsTemplate().map(g => ({ ...g, enabled: true })), relayEnabled: true, tiebreaker: 'sr832' };
  // Customize a division that survives the switch.
  meet.groups.find(g => g.id === 'tiny_tot_girls').divisions.novice = { enabled: true, cost: 7, distances: ['50m', '', '', ''] };

  applyDivisionScheme(meet, false);

  assert.strictEqual(meet.usarsDivisions, false);
  assert.strictEqual(meet.groups.length, baseGroups().length);
  const ids = meet.groups.map(g => g.id);
  for (const id of GRAND_AND_PREMIER) assert.ok(!ids.includes(id), `standard set should not contain ${id}`);
  assert.strictEqual(meet.groups.find(g => g.id === 'tiny_tot_girls').divisions.novice.cost, 7, 'surviving settings lost');
  // Standard is groups-only: quads/relays/tiebreaker untouched.
  assert.ok(meet.quadGroups.every(q => q.enabled), 'standard switch should not disable quads');
  assert.strictEqual(meet.relayEnabled, true, 'standard switch should not turn relays off');
  assert.strictEqual(meet.tiebreaker, 'sr832', 'standard switch should not change tiebreaker');
});

test('the complete USARS preset survives a migrateMeet reload round-trip (§10 guard)', () => {
  const meet = staleMeet();
  applyDivisionScheme(meet, true);

  const reloaded = JSON.parse(JSON.stringify(meet));
  migrateMeet(reloaded, 'owner');

  const ids = reloaded.groups.map(g => g.id);
  for (const id of GRAND_AND_PREMIER) assert.ok(ids.includes(id), `migrateMeet dropped ${id}`);
  for (const g of reloaded.groups) assert.ok(g.divisions?.elite?.enabled, `reload disabled elite on ${g.id}`);
  assert.strictEqual(reloaded.quadGroups.length, 34, 'reload changed the quad division count');
  assert.ok(reloaded.quadGroups.every(q => q.enabled), 'reload disabled quad divisions');
  assert.strictEqual(reloaded.relayEnabled, true, 'reload turned relays off');
  // relayTemplates passes through migrateMeet untouched, and the Relay Builder
  // page re-normalizes on load — enabled must survive BOTH.
  const { normalizeRelayTemplates } = require(path.join(ROOT, 'services', 'relayHelpers'));
  const renormalized = normalizeRelayTemplates(reloaded.relayTemplates);
  assert.ok(renormalized.length > 0 && renormalized.every(t => t.enabled),
    'relay division toggles did not survive reload + relay-builder normalization');
  // The materialized relay races survive too, with their division keys (§10:
  // relayDivisionId is whitelisted only under isRelayRace — prove it holds).
  const reloadedRelays = reloaded.races.filter(r => r.isRelayRace);
  assert.strictEqual(reloadedRelays.length, 75, 'relay races survived reload');
  assert.ok(reloadedRelays.every(r => String(r.relayDivisionId || '').trim()),
    'relayDivisionId survived migrateMeet');
  assert.strictEqual(reloaded.tiebreaker, 'sr832', 'reload changed tiebreaker');
  assert.strictEqual(reloaded.groups.find(g => g.id === 'grand_classic_men').label, 'Grand Classic Men');
});
