// Division-scheme heal: clicking "USARS National" must (re)build the FULL 34-group
// national set — including Grand Classic/Masters/Veteran/Esquire + Premier — even
// on a meet already flagged usarsDivisions=true with an incomplete group list.
//
// Regression: the /division-scheme route only rebuilt groups when the flag FLIPPED
// (`if (wantUsars !== !!meet.usarsDivisions)`), so a stale meet whose groups were
// set before the set grew to 34 could never be healed — the button did nothing and
// Grand Classic et al. never appeared. applyDivisionScheme now always rebuilds.
//
//   node --test test/divisionScheme.test.js

const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const { applyDivisionScheme, baseGroups, baseGroupsUSARS, migrateMeet } = require(path.join(ROOT, 'services', 'meetHelpers'));

const GRAND_AND_PREMIER = [
  'grand_classic_ladies', 'grand_classic_men',
  'grand_masters_ladies', 'grand_masters_men',
  'grand_veteran_ladies', 'grand_veteran_men',
  'grand_esquire_ladies', 'grand_esquire_men',
  'premier_ladies', 'premier_men',
];

test('the USARS national set defines all 34 divisions incl. Grand + Premier', () => {
  const ids = baseGroupsUSARS().map(g => g.id);
  assert.strictEqual(ids.length, 34, 'expected 34 USARS divisions');
  for (const id of GRAND_AND_PREMIER) assert.ok(ids.includes(id), `USARS set missing ${id}`);
});

test('applying USARS heals a stale meet (flagged usars, missing Grand/Premier) and preserves settings', () => {
  // Simulate Lee's broken test meet: usarsDivisions=true but the group list is the
  // pre-Grand/Premier subset (24), so Grand Classic etc. are absent.
  const stale = {
    usarsDivisions: true,
    groups: baseGroupsUSARS().filter(g => !/^grand_|^premier_/.test(g.id)),
  };
  assert.strictEqual(stale.groups.length, 24, 'stale fixture should start incomplete');

  // Director had customized a surviving division — must not be clobbered.
  const tg = stale.groups.find(g => g.id === 'tiny_tot_girls');
  tg.divisions.elite.distances = ['111m', '222m', '333m', ''];
  tg.divisions.novice = { enabled: true, cost: 7, distances: ['50m', '', '', ''] };

  applyDivisionScheme(stale, true);

  // Full set now present, including every Grand + Premier division.
  assert.strictEqual(stale.groups.length, 34, 'clicking USARS should rebuild to 34');
  const ids = stale.groups.map(g => g.id);
  for (const id of GRAND_AND_PREMIER) assert.ok(ids.includes(id), `heal did not add ${id}`);

  // Surviving division kept its custom settings.
  const healedTg = stale.groups.find(g => g.id === 'tiny_tot_girls');
  assert.strictEqual(healedTg.divisions.elite.distances[0], '111m', 'custom elite distance lost');
  assert.strictEqual(healedTg.divisions.novice.cost, 7, 'custom novice setting lost');

  // Newly-added division has the race-ready USARS elite template (not blank).
  const gc = stale.groups.find(g => g.id === 'grand_classic_men');
  assert.ok(gc.divisions.elite.enabled, 'Grand Classic Men should be elite-enabled');
  assert.ok(gc.divisions.elite.distances.some(Boolean), 'Grand Classic Men should have distances');
});

test('applying standard yields the 24-division set (no Grand/Premier)', () => {
  const meet = { usarsDivisions: true, groups: baseGroupsUSARS() };
  applyDivisionScheme(meet, false);
  assert.strictEqual(meet.usarsDivisions, false);
  assert.strictEqual(meet.groups.length, baseGroups().length);
  const ids = meet.groups.map(g => g.id);
  for (const id of GRAND_AND_PREMIER) assert.ok(!ids.includes(id), `standard set should not contain ${id}`);
});

test('healed USARS groups survive a migrateMeet reload round-trip', () => {
  const meet = { usarsDivisions: true, groups: baseGroupsUSARS().filter(g => !/^grand_|^premier_/.test(g.id)) };
  applyDivisionScheme(meet, true);

  const reloaded = JSON.parse(JSON.stringify(meet));
  migrateMeet(reloaded, 'owner');

  const ids = reloaded.groups.map(g => g.id);
  for (const id of GRAND_AND_PREMIER) assert.ok(ids.includes(id), `migrateMeet dropped ${id} on reload`);
  // Grand Classic keeps a readable label after the whitelist rebuild.
  const gc = reloaded.groups.find(g => g.id === 'grand_classic_men');
  assert.strictEqual(gc.label, 'Grand Classic Men');
});
