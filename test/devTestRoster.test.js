const test = require('node:test');
const assert = require('node:assert/strict');
const { DEV_TEST_COHORTS, buildDevelopmentTestRoster } = require('../services/devTestRoster');
const { TRAINING_ROSTER_SOURCE, buildTrainingRoster115 } = require('../services/trainingRoster');
const { defaultMeet, applyDivisionScheme } = require('../services/meetHelpers');
const { buildNationalsDevRoster } = require('../services/nationalsRoster');
const createRegistrationRoutes = require('../routes/registrationRoutes');

test('development roster includes race-sizing foundation cohorts', () => {
  const roster = buildDevelopmentTestRoster();
  const expectedCount = DEV_TEST_COHORTS.reduce((sum, cohort) => sum + cohort.count, 0);
  assert.equal(roster.length, expectedCount);
  assert.deepEqual(DEV_TEST_COHORTS.map(cohort =>
    roster.filter(row => row.testCohort === cohort.key).length
  ), [6, 7, 8, 12, 14, 7]);
});

test('development roster has unique identities and valid race entries', () => {
  const roster = buildDevelopmentTestRoster();
  assert.equal(new Set(roster.map(row => row.name)).size, roster.length);
  assert.equal(new Set(roster.map(row => row.helmetNumber)).size, roster.length);
  assert.ok(roster.every(row => row.name && row.team && row.age > 0));
  assert.ok(roster.every(row => row.options.length === 1 && ['novice', 'elite'].includes(row.options[0])));
});

test('developer import route adds the complete test roster', () => {
  const meet = {
    id: 1,
    meetName: 'Simulated Meet',
    groups: [],
    registrations: [],
    races: [],
    blocks: [],
    additionalGroups: [],
    openGroups: [],
    quadGroups: [],
    relayTemplates: [],
  };
  const db = { meets: [meet] };
  const router = createRegistrationRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => {},
    loadDb: () => db,
    getSessionUser: () => null,
    TEAM_LIST: [],
    toggleSwitch: () => '',
    renderCheckinView: () => '',
    renderRegisteredView: () => '',
  });
  const layer = router.stack.find(item =>
    item.route?.path === '/portal/meet/:meetId/dev/import-spring-fling' && item.route.methods.post
  );
  assert.ok(layer, 'developer import POST route should exist');

  let redirect = '';
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  handler({
    params: { meetId: '1' },
    db,
    user: { id: 1, roles: ['super_admin'] },
    body: { action: 'import', replace: 'on', checkedIn: 'on', paid: 'on' },
  }, {
    redirect(value) { redirect = value; },
    status() { return this; },
    send() {},
  });

  assert.equal(meet.registrations.length, buildDevelopmentTestRoster().length);
  assert.ok(meet.registrations.every(row => row.importSource === 'spring_fling_2026_test'));
  assert.match(redirect, /devImported=54$/);
});

test('115-skater training roster preserves identities and event options', () => {
  const roster = buildTrainingRoster115();
  assert.equal(roster.length, 115);
  assert.equal(new Set(roster.map(row => row.name)).size, 115);
  assert.equal(new Set(roster.map(row => row.helmetNumber)).size, 115);
  assert.equal(new Set(roster.map(row => row.meetNumber)).size, 115);
  assert.ok(new Set(roster.map(row => row.team)).size >= 10);
  assert.ok(roster.some(row => row.options.novice));
  assert.ok(roster.some(row => row.options.elite));
  assert.ok(roster.some(row => row.options.open));
  assert.ok(roster.some(row => row.options.quad));
  assert.ok(roster.some(row => row.options.relays));
  assert.ok(roster.some(row => row.options.additional));
});

test('training import route builds a complete 115-skater simulated meet', () => {
  const meet = defaultMeet({ id: 1, displayName: 'Developer', roles: ['super_admin'] });
  meet.id = 1;
  for (const group of meet.groups) {
    group.divisions.novice = { enabled: true, cost: 0, distances: ['300m', '500m', '1000m', ''] };
    group.divisions.elite = { enabled: true, cost: 0, distances: ['300m', '500m', '1000m', ''] };
  }
  const db = { meets: [meet] };
  const router = createRegistrationRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => {},
    loadDb: () => db,
    getSessionUser: () => null,
    TEAM_LIST: [],
    toggleSwitch: () => '',
    renderCheckinView: () => '',
    renderRegisteredView: () => '',
  });
  const layer = router.stack.find(item =>
    item.route?.path === '/portal/meet/:meetId/dev/import-training-115' && item.route.methods.post
  );
  assert.ok(layer, '115-skater training import POST route should exist');

  let redirect = '';
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  handler({
    params: { meetId: '1' },
    db,
    user: { id: 1, roles: ['super_admin'] },
    body: { action: 'import', replace: 'on', checkedIn: 'on', paid: 'on' },
  }, {
    redirect(value) { redirect = value; },
    status() { return this; },
    send() {},
  });

  assert.equal(meet.registrations.length, 115);
  assert.ok(meet.registrations.every(row => row.importSource === TRAINING_ROSTER_SOURCE));
  assert.ok(meet.registrations.every(row => row.paid && row.checkedIn));
  assert.ok(meet.registrations.every(row => row.divisionGroupId && row.divisionGroupLabel !== 'Unassigned'));
  assert.ok(meet.races.length > 0);
  assert.ok(meet.blocks.length > 0);
  assert.match(redirect, /devImported=115$/);
});

test('nationals dev roster: one row per (person × discipline), per-discipline helmets and divisions', () => {
  const rows = buildNationalsDevRoster();
  // THE IDENTITY MODEL (owner-confirmed, answer-key-verified): each discipline is
  // its own registration with its OWN helmet and its OWN age-division label.
  // 386 rows = 353 people (33 raced both disciplines). Relay rows carry temp
  // TEAM numbers and never contribute identities.
  assert.equal(rows.length, 386, 'one row per person per discipline');
  assert.equal(new Set(rows.map(r => r.name.trim().toLowerCase())).size, 353, '353 real people');
  assert.ok(rows.every(r => String(r.helmet || '').trim()), 'every row carries its real helmet');

  const inline = rows.filter(r => r.discipline !== 'quad');
  const quad = rows.filter(r => r.discipline === 'quad');
  assert.equal(quad.length, 77, '77 quad individual entries');
  // Discipline drives options: inline rows enter inline (elite), quad rows enter
  // quad — never each other.
  assert.ok(inline.every(r => r.options.includes('elite') && !r.options.includes('quad')));
  assert.ok(quad.every(r => r.options.includes('quad') && !r.options.includes('elite')));

  // Matthew Towne II — answer key lists him as #497 in BOTH Juvenile Boys and
  // Quad Elementary Boys (his #13 was a stale heat-sheet number: collapsed).
  const townes = rows.filter(r => /towne/i.test(r.name));
  assert.equal(townes.length, 2, 'Towne = two per-discipline rows');
  const towneInline = townes.find(r => r.discipline !== 'quad');
  const towneQuad = townes.find(r => r.discipline === 'quad');
  assert.equal(towneInline.helmet, '497');
  assert.equal(towneQuad.helmet, '497');
  for (const o of ['relay2Person', 'relay3Person', 'relay4Person']) assert.ok(towneInline.options.includes(o));
  assert.ok(towneQuad.options.includes('quadRelay2Person') && towneQuad.options.includes('quadRelay3Person'));
  // The quad row carries the QUAD division label — a DIFFERENT age group than
  // his inline division (this is the crux: quads age-group differently).
  assert.ok(towneQuad.age > towneInline.age, 'quad row ages from the quad division (Elementary), inline from Juvenile');
  assert.ok(!rows.some(r => r.helmet === '13'), 'stale heat-sheet #13 never becomes an identity');

  // Lilliann Salazar — answer key: #64 inline Freshman Girls, #129 Quad Freshman
  // Girls. Two rows, two numbers, one person (sheet typo Salizar canonicalized).
  const lilliann = rows.filter(r => /lilliann/i.test(r.name));
  assert.deepEqual(lilliann.map(r => r.helmet).sort(), ['129', '64']);
  assert.ok(lilliann.every(r => /salazar/i.test(r.name)), 'sheet typo canonicalized');
  assert.equal(lilliann.find(r => r.helmet === '64').discipline, 'inline');
  assert.equal(lilliann.find(r => r.helmet === '129').discipline, 'quad');

  // Isabella Salazar — #374 inline Sophomore Ladies, #40 Quad Junior Ladies
  // (quad division NAME differs from inline for the same person).
  const isabella = rows.filter(r => /isabella salazar/i.test(r.name));
  assert.deepEqual(isabella.map(r => r.helmet).sort(), ['374', '40']);
  assert.equal(isabella.find(r => r.helmet === '40').division, 'Junior Ladies');
  assert.equal(isabella.find(r => r.helmet === '374').division, 'Sophomore Ladies');

  // #37 Brayden Thomas: quad-only person — exactly one row, quad, never inline.
  const brayden = rows.filter(r => /brayden thomas/i.test(r.name));
  assert.equal(brayden.length, 1);
  assert.equal(brayden[0].discipline, 'quad');

  // Velli siblings stay distinct (#333/#334 despite their swapped stray rows).
  assert.ok(/harshini/i.test(rows.find(r => r.helmet === '333')?.name || ''));
  assert.ok(/hemtej/i.test(rows.find(r => r.helmet === '334')?.name || ''));

  // Helmets are unique within a discipline EXCEPT the two real shared-number
  // pairs the sheets contain (#182 Bella Daddy / Marnie Alapati, #183 Brandon
  // Gray / Matthew Tseng — different people, different teams and divisions).
  const dupes = list => { const m = new Map(); for (const r of list) m.set(r.helmet, (m.get(r.helmet) || 0) + 1); return [...m].filter(([, n]) => n > 1).map(([h]) => h).sort(); };
  assert.deepEqual(dupes(inline), ['182', '183'], 'only the known shared-number pairs');
  assert.deepEqual(dupes(quad), []);

  // Quad-relay-only people carry quadRelay options on their inline row without
  // ever entering quad individual.
  const qrOnly = rows.filter(r => !r.options.includes('quad') &&
    (r.options.includes('quadRelay2Person') || r.options.includes('quadRelay3Person')));
  assert.ok(qrOnly.length > 0, 'quad-relay-only skaters exist and are not over-entered in quad individual');

  // Team names are clean (golden-master-style backfill).
  assert.ok(rows.every(r => !/new record|did not finish|did not start|\d:\d\d\.\d/i.test(r.team)),
    'no polluted team names in the dev roster');
});

test('nationals merged (one-profile) demo mode: no duplicate names, disciplines combined', () => {
  // For demos (check-in walkthroughs) — how a real SSM registration looks: one
  // person, one profile, everything they race on it. Faithful per-discipline
  // mode stays the DEFAULT for answer-key work.
  const merged = buildNationalsDevRoster({ mergeDisciplines: true });
  assert.equal(merged.length, 353, 'one row per PERSON');
  assert.equal(new Set(merged.map(r => r.name.trim().toLowerCase())).size, 353, 'no duplicate names');

  // Towne: single profile under his inline number with ALL his participation.
  const towne = merged.find(r => /towne/i.test(r.name));
  assert.equal(towne.helmet, '497');
  for (const o of ['elite', 'quad', 'relay2Person', 'relay3Person', 'relay4Person', 'quadRelay2Person', 'quadRelay3Person']) {
    assert.ok(towne.options.includes(o), `merged Towne missing ${o}`);
  }
  // Lilliann: inline number (#64) wins as the profile number; quad participation folds in.
  const lilliann = merged.find(r => /lilliann/i.test(r.name));
  assert.equal(lilliann.helmet, '64');
  assert.ok(lilliann.options.includes('elite') && lilliann.options.includes('quad'));
  assert.ok(lilliann.options.includes('quadRelay2Person'));
  // Quad-only skaters keep their quad row/number and still never enter inline.
  const brayden = merged.find(r => /brayden thomas/i.test(r.name));
  assert.equal(brayden.helmet, '37');
  assert.ok(brayden.options.includes('quad') && !brayden.options.includes('elite'));
  // Default (faithful) mode is unchanged.
  assert.equal(buildNationalsDevRoster().length, 386, 'default stays per-discipline');
});

test('nationals import enters skaters under their REAL helmet numbers into a full USARS meet', () => {
  const meet = defaultMeet({ id: 1, displayName: 'Developer', roles: ['super_admin'] });
  meet.id = 1;
  applyDivisionScheme(meet, true); // the complete USARS national preset
  const db = { meets: [meet] };
  const router = createRegistrationRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: value => value,
    saveDb: () => {},
    loadDb: () => db,
    getSessionUser: () => null,
    TEAM_LIST: [],
    toggleSwitch: () => '',
    renderCheckinView: () => '',
    renderRegisteredView: () => '',
  });
  const layer = router.stack.find(item =>
    item.route?.path === '/portal/meet/:meetId/dev/import-nationals' && item.route.methods.post
  );
  assert.ok(layer, 'nationals import POST route should exist');

  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  handler({
    params: { meetId: '1' },
    db,
    user: { id: 1, roles: ['super_admin'] },
    body: { action: 'import', replace: 'on', checkedIn: 'on', paid: 'on' },
  }, {
    redirect() {},
    status() { return this; },
    send() {},
  });

  assert.equal(meet.registrations.length, 386);
  assert.ok(meet.registrations.every(r => r.importSource === 'nationals_2026_roster'));
  // Real per-discipline helmet rides on BOTH meetNumber and helmetNumber, so the
  // live meet cross-references the printed sheets and answer key 1:1.
  const brayden = meet.registrations.find(r => /brayden thomas/i.test(r.name));
  assert.equal(Number(brayden.meetNumber), 37);
  assert.equal(Number(brayden.helmetNumber), 37);
  assert.equal(brayden.options.elite, false);
  assert.equal(brayden.options.quad, true);
  assert.equal(brayden.options.quadRelay2Person, true);

  // Towne imports TWICE — one registration per discipline, both under his real
  // #497 (as the answer key lists him), landing in DIFFERENT age groups: inline
  // in Juvenile Boys, quad in Elementary Boys (quads age-group differently).
  const townes = meet.registrations.filter(r => /matthew towne/i.test(r.name));
  assert.equal(townes.length, 2, 'one registration per discipline');
  assert.ok(townes.every(r => Number(r.meetNumber) === 497 && Number(r.helmetNumber) === 497));
  const towneInline = townes.find(r => r.options.elite);
  const towneQuad = townes.find(r => r.options.quad);
  assert.ok(towneInline && towneQuad && towneInline !== towneQuad);
  assert.equal(towneInline.options.quad, false);
  assert.equal(towneQuad.options.elite, false);
  assert.match(towneInline.divisionGroupLabel, /Juvenile Boys/i, 'inline row in the inline age group');
  assert.match(towneQuad.divisionGroupLabel, /Elementary Boys/i, 'quad row in the QUAD age group as raced');
  assert.equal(towneQuad.options.quadRelay2Person, true);

  // Lilliann: two registrations, two REAL numbers (#64 inline / #129 quad).
  const lilliann = meet.registrations.filter(r => /lilliann/i.test(r.name));
  assert.deepEqual(lilliann.map(r => Number(r.meetNumber)).sort((a, b) => a - b), [64, 129]);
  assert.equal(lilliann.find(r => Number(r.meetNumber) === 64).options.elite, true);
  assert.equal(lilliann.find(r => Number(r.meetNumber) === 129).options.quad, true);
  assert.ok(meet.races.length > 0, 'races generated');

  // LIVE ROUND-TRIP (§10 — the bug class that was green in unit tests and broke
  // on load, twice): serialize like saveDb, reload through the REAL migrateMeet,
  // and re-check helmets, options, and division groups survived.
  const reloaded = JSON.parse(JSON.stringify(meet));
  const { migrateMeet } = require('../services/meetHelpers');
  migrateMeet(reloaded, 'roundtrip-owner');
  assert.equal(reloaded.registrations.length, 386, 'registrations survived reload');
  const rTownes = reloaded.registrations.filter(r => /matthew towne/i.test(r.name));
  assert.equal(rTownes.length, 2);
  assert.ok(rTownes.every(r => Number(r.helmetNumber) === 497 && Number(r.meetNumber) === 497), 'helmets survived reload');
  const rQuad = rTownes.find(r => r.options.quad);
  assert.ok(rQuad && rQuad.options.elite === false, 'discipline options survived reload');
  assert.equal(rQuad.options.quadRelay2Person, true, 'quad-relay option survived reload (whitelisted)');
  assert.match(rQuad.divisionGroupLabel, /Elementary Boys/i, 'quad division group survived reload');
  const rLil = reloaded.registrations.filter(r => /lilliann/i.test(r.name));
  assert.deepEqual(rLil.map(r => Number(r.helmetNumber)).sort((a, b) => a - b), [64, 129], 'per-discipline helmets survived reload');
});
