// Mixed (league scratch) relay scope.
//
// League meets rarely have enough same-age skaters on one club to field a relay,
// so directors build "scratch" relays across clubs. The relay builder's MIXED
// scope draws the skater dropdown from EVERY skater in the meet (still filtered
// per division by age/gender), and saves clubless teams marked { mixed:true }.
//
// This proves, deterministically and through a real save/load round-trip:
//   1. the mixed pool surfaces exactly the age/gender-eligible skaters, across
//      clubs (not scoped to one club);
//   2. a cross-club team survives migrateMeet with its `mixed` marker + members
//      (relayTeams is not whitelisted — §10 — so this must be verified, not assumed);
//   3. it generates a real relay race labeled by its MEMBERS (not a club), with a
//      blank team field — and coexists with an ordinary per-club team.
//
//   node --test test/mixedRelayScope.test.js

const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const { RELAY_DIVISIONS, eligibleForRelayDivision } = require(path.join(ROOT, 'services', 'relayDivisions'));
const { migrateMeet } = require(path.join(ROOT, 'services', 'meetHelpers'));
const { buildRelayRacesFromTeams, teamLabel } = require(path.join(ROOT, 'services', 'relayGenerator'));
const { renderCoachRelaysView } = require(path.join(ROOT, 'views', 'coachRelaysView'));
const { MIXED_RELAY_SCOPE } = require(path.join(ROOT, 'services', 'relayHelpers'));

const DIV = RELAY_DIVISIONS.find(d => d.id === 'r2_primary_boys'); // "7 & under" boys, 2-person

// A meet whose relay-age skaters (≤7 boys) are spread across THREE clubs, plus
// two skaters who fall outside the division (wrong age / wrong gender) to prove
// the age-group filter still narrows the "everybody" pool.
function makeMeet() {
  const reg = (id, name, team, age, gender) => ({ id, name, team, age, gender, helmetNumber: id, options: {} });
  return {
    id: 7001,
    meetName: 'League Night',
    registrations: [
      reg(1, 'Aaron A', 'Astro', 6, 'male'),
      reg(2, 'Ben B', 'Blaze', 7, 'male'),
      reg(3, 'Cody C', 'Comet', 6, 'male'),
      reg(4, 'Dylan D', 'Astro', 7, 'male'),
      reg(5, 'Eve E', 'Blaze', 10, 'female'), // wrong age + gender
      reg(6, 'Finn F', 'Comet', 12, 'male'),   // wrong age
    ],
    relayTeams: [],
    races: [],
  };
}

test('mixed pool surfaces every age/gender-eligible skater across clubs (not one club)', () => {
  const meet = makeMeet();
  // The MIXED scope pool is the whole meet (server.js relayScopePool). The view's
  // per-division filter then narrows it exactly as the dropdown does.
  const pool = meet.registrations;
  const elig = eligibleForRelayDivision(DIV, pool);

  const names = elig.map(s => s.name).sort();
  assert.deepStrictEqual(names, ['Aaron A', 'Ben B', 'Cody C', 'Dylan D'],
    'mixed dropdown should list exactly the ≤7 boys, and only them');
  // ...and they come from more than one club — the whole point of scratch relays.
  const clubs = new Set(elig.map(s => s.team));
  assert.deepStrictEqual([...clubs].sort(), ['Astro', 'Blaze', 'Comet'],
    'eligible skaters should span multiple clubs');
});

test('a cross-club mixed team survives a migrateMeet round-trip and generates a member-labeled race, alongside a per-club team', () => {
  const meet = makeMeet();
  // One clubless MIXED team built across clubs (Blaze + Comet), and one ordinary
  // per-club team (Astro) — they must coexist.
  meet.relayTeams = [
    { id: 1, divisionId: DIV.id, club: '', mixed: true, memberRegIds: [2, 3], color: '' },       // Ben (Blaze) + Cody (Comet)
    { id: 2, divisionId: DIV.id, club: 'Astro', mixed: false, memberRegIds: [1, 4], color: '' },  // Aaron + Dylan (Astro)
  ];

  // Real disk round-trip: serialize (saveDb) + migrateMeet (loadDb). relayTeams
  // is NOT whitelisted, so the `mixed` marker must ride through untouched.
  const reloaded = JSON.parse(JSON.stringify(meet));
  migrateMeet(reloaded, 'test-owner');

  const mixedTeam = reloaded.relayTeams.find(t => t.id === 1);
  const clubTeam = reloaded.relayTeams.find(t => t.id === 2);
  assert.ok(mixedTeam && clubTeam, 'both teams survived the round-trip');
  assert.strictEqual(mixedTeam.mixed, true, 'mixed marker survived migrateMeet');
  assert.strictEqual(mixedTeam.club, '', 'mixed team stays clubless');
  assert.deepStrictEqual(mixedTeam.memberRegIds, [2, 3], 'mixed team members survived');
  assert.notStrictEqual(clubTeam.mixed, true, 'per-club team is not marked mixed');
  assert.strictEqual(clubTeam.club, 'Astro', 'per-club team keeps its club');

  // Generate races from the (reloaded) teams.
  buildRelayRacesFromTeams(reloaded);
  const relayRaces = reloaded.races.filter(r => r.isRelayRace && r.relayDivisionId === DIV.id);
  assert.ok(relayRaces.length >= 1, 'a relay race was generated for the division');

  // Both teams appear as lane entries somewhere in the division's race(s).
  const lanes = relayRaces.flatMap(r => r.laneEntries || []);
  const mixedLane = lanes.find(l => Number(l.relayTeamId) === 1);
  const clubLane = lanes.find(l => Number(l.relayTeamId) === 2);
  assert.ok(mixedLane, 'mixed team became a race lane');
  assert.ok(clubLane, 'per-club team became a race lane');

  // The mixed team is labeled by its MEMBERS (cross-club), with a blank club field.
  assert.strictEqual(mixedLane.skaterName, 'Ben B / Cody C', 'mixed team labeled by member names');
  assert.strictEqual(mixedLane.team, '', 'mixed team carries no club');
  assert.strictEqual(clubLane.skaterName, 'Aaron A / Dylan D', 'per-club team labeled by member names');
  assert.strictEqual(clubLane.team, 'Astro', 'per-club team carries its club');
});

test('the relay builder renders the mixed option and, when mixed, a cross-club dropdown + mixed-scoped form', () => {
  const meet = makeMeet();
  const teams = ['Astro', 'Blaze', 'Comet'];

  // MIXED render: this is exactly what the route passes (skaters = whole meet).
  const mixedHtml = renderCoachRelaysView({
    meet, club: MIXED_RELAY_SCOPE, skaters: meet.registrations, mixed: true, locked: false,
    teamPicker: { teams, selected: '', allowMixed: true, mixed: true },
  });
  assert.match(mixedHtml, /🔀 All skaters \(mixed relays\)/, 'mixed option is offered');
  assert.match(mixedHtml, /<option value="__mixed__" selected>/, 'mixed option is the selected scope');
  // The form must POST back in the mixed scope, or the save silently falls back to a club.
  assert.match(mixedHtml, /action="\/portal\/meet\/7001\/coach\/relays\?team=__mixed__"/, 'form stays in mixed scope');
  // Dropdown lists the eligible skaters from every club (cross-club).
  for (const n of ['Aaron A', 'Ben B', 'Cody C', 'Dylan D']) {
    assert.ok(mixedHtml.includes(n), `mixed dropdown lists ${n}`);
  }
  assert.ok(!mixedHtml.includes('Eve E') && !mixedHtml.includes('Finn F'), 'mixed dropdown excludes out-of-division skaters');

  // PER-CLUB render (Astro): mixed offered but NOT selected; only Astro skaters,
  // and the form is scoped to the club.
  const astro = meet.registrations.filter(r => r.team === 'Astro');
  const clubHtml = renderCoachRelaysView({
    meet, club: 'Astro', skaters: astro, mixed: false, locked: false,
    teamPicker: { teams, selected: 'Astro', allowMixed: true, mixed: false },
  });
  assert.match(clubHtml, /🔀 All skaters \(mixed relays\)/, 'mixed option still offered in club view');
  assert.ok(!/<option value="__mixed__" selected>/.test(clubHtml), 'mixed is not selected in club view');
  assert.match(clubHtml, /<option value="Astro" selected>/, 'the club is the selected scope');
  assert.match(clubHtml, /action="\/portal\/meet\/7001\/coach\/relays\?team=Astro"/, 'form stays in the club scope');
  assert.ok(clubHtml.includes('Aaron A') && clubHtml.includes('Dylan D'), 'club dropdown lists that club\'s skaters');
  assert.ok(!clubHtml.includes('Ben B') && !clubHtml.includes('Cody C'), 'club dropdown excludes other clubs\' skaters');
});
