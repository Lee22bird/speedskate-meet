const test = require('node:test');
const assert = require('node:assert/strict');
const { generateScheduleBlocks, isChampionshipPool } = require('../services/scheduleGenerator');

let idc = 0;
const race = o => ({ id: 'r' + (++idc), ages: '10', stage: 'final', dayIndex: 1, distanceLabel: 'D', division: 'novice', ...o });
const meet = races => ({ id: 1, date: '2026-07-11', endDate: '2026-07-11', blocks: [], races });
const layout = res => res.blocks.map(b => b.name);
const order = (res, name) => res.blocks.findIndex(b => b.name === name);
const blockOf = (res, raceId) => { const b = res.blocks.find(b => b.raceIds.includes(String(raceId))); return b && b.name; };

// ── mode selection ───────────────────────────────────────────────────────────
test('isChampionshipPool: any heat/semi true; all-finals false', () => {
  assert.equal(isChampionshipPool([race({ stage: 'heat' })]), true);
  assert.equal(isChampionshipPool([race({ stage: 'semi' })]), true);
  assert.equal(isChampionshipPool([race({ stage: 'final' }), race({ stage: 'race' })]), false);
});

test('style defaults to LEAGUE — a heat does NOT flip to championship (league meets have heats)', () => {
  const races = [
    race({ id: 'h', stage: 'heat', division: 'elite', ages: '13', distanceLabel: '300m', heatNumber: 1 }),
    race({ id: 'f', stage: 'final', division: 'elite', ages: '13', distanceLabel: '300m' }),
  ];
  const def = generateScheduleBlocks(meet(races));               // default
  assert.equal(def.blocks.some(b => /Heats$/.test(b.name)), false, 'default is league — no championship Heats block');
  const champ = generateScheduleBlocks(meet(races), { style: 'championship' });
  assert.ok(champ.blocks.some(b => /Heats/.test(b.name)), 'championship style makes a Heats block');
  const auto = generateScheduleBlocks(meet(races), { style: 'auto' });
  assert.ok(auto.blocks.some(b => /Heats/.test(b.name)), 'auto flips to championship on a heat (legacy callers)');
});

// ── CHAMPIONSHIP (Nationals): per-distance Heats -> Semis -> Finals ───────────
test('championship: heats two-tier (semis-bound before heat-only), age within tier', () => {
  const races = [
    race({ id: 'A1', stage: 'heat', division: 'Primary', ages: '6', heatNumber: 1 }),
    race({ id: 'A2', stage: 'heat', division: 'Primary', ages: '6', heatNumber: 2 }),
    race({ id: 'Afin', stage: 'final', division: 'Primary', ages: '6' }),
    race({ id: 'B1', stage: 'heat', division: 'SophMen', ages: '15', heatNumber: 1 }),
    race({ id: 'B2', stage: 'heat', division: 'SophMen', ages: '15', heatNumber: 2 }),
    race({ id: 'Bsemi', stage: 'semi', division: 'SophMen', ages: '15' }),
    race({ id: 'Bfin', stage: 'final', division: 'SophMen', ages: '15' }),
    race({ id: 'C1', stage: 'heat', division: 'Mid', ages: '10', heatNumber: 1 }),
    race({ id: 'Cfin', stage: 'final', division: 'Mid', ages: '10' }),
  ];
  const ids = generateScheduleBlocks(meet(races), { style: 'championship' }).blocks.find(b => /Heats/.test(b.name)).raceIds;
  assert.ok(ids.indexOf('B1') < ids.indexOf('A1'), 'semis-bound heats precede heat-only');
  assert.ok(ids.indexOf('A1') < ids.indexOf('C1'), 'within heat-only tier, younger first');
  assert.equal(ids.indexOf('B2') - ids.indexOf('B1'), 1, 'a division heats stay contiguous');
});

test('championship: finals youngest->oldest incl. a direct-final Tiny Tot', () => {
  const races = [
    race({ id: 'tt', stage: 'final', division: 'TinyTot', ages: '4' }),
    race({ id: 'h', stage: 'heat', division: 'Elite', ages: '16', heatNumber: 1 }),
    race({ id: 's1', stage: 'semi', division: 'Elite', ages: '16' }),
    race({ id: 's2', stage: 'semi', division: 'Juv', ages: '10' }),
    race({ id: 'fE', stage: 'final', division: 'Elite', ages: '16' }),
    race({ id: 'fJ', stage: 'final', division: 'Juv', ages: '10' }),
  ];
  const res = generateScheduleBlocks(meet(races), { style: 'championship' });
  const finals = res.blocks.find(b => /Finals/.test(b.name)).raceIds;
  assert.ok(finals.indexOf('tt') < finals.indexOf('fJ') && finals.indexOf('fJ') < finals.indexOf('fE'), 'finals young->old');
  const semis = res.blocks.find(b => /Semis/.test(b.name)).raceIds;
  assert.ok(semis.indexOf('s2') < semis.indexOf('s1'), 'semis young->old');
});

// ── LEAGUE (MSSL house style) ─────────────────────────────────────────────────
// Age groups youngest->oldest; elite=3 distances, novice/quad=2. One elite
// division forced into heats to exercise the 3-pass.
const AGES = [
  ['tiny_tot', 'Tiny Tot', '5 & under', [100, 200, 300]],
  ['primary', 'Primary', '6-7', [200, 300, 400]],
  ['juvenile', 'Juvenile', '8-9', [200, 300, 500]],
  ['elementary', 'Elementary', '10-11', [300, 500, 700]],
  ['freshman', 'Freshman', '12-13', [300, 500, 1000]],
  ['sophomore', 'Sophomore', '14-15', [500, 1000, 1500]],
  ['junior', 'Junior', '16-17', [500, 1000, 2000]],
  ['senior', 'Senior', '18-24', [500, 1000, 2000]],
  ['classic', 'Classic', '25-34', [500, 1000, 1500]],
  ['master', 'Master', '35-44', [500, 700, 1000]],
  ['veteran', 'Veteran', '45-54', [500, 700, 1000]],
  ['esquire', 'Esquire', '55+', [500, 700, 1000]],
];
function leaguePool() {
  const races = [];
  for (const [k, label, ages, d] of AGES) for (const g of ['girls', 'boys']) d.forEach((m, i) =>
    races.push(race({ id: `e_${k}_${g}_${i}`, groupId: `${k}_${g}`, groupLabel: `${label} ${g}`, division: 'elite', ages, distanceLabel: m + 'm', dayIndex: i + 1 })));
  for (const [k, label, ages, d] of AGES.filter(a => ['juvenile', 'freshman', 'senior', 'master'].includes(a[0]))) for (const g of ['girls', 'boys']) d.slice(0, 2).forEach((m, i) =>
    races.push(race({ id: `q_${k}_${g}_${i}`, groupId: `quad_${k}_${g}`, groupLabel: `Quad ${label} ${g}`, division: 'quad', ages, distanceLabel: m + 'm', dayIndex: i + 1, isQuadRace: true })));
  for (const [k, label, ages, d] of AGES.filter(a => ['juvenile', 'elementary', 'freshman'].includes(a[0]))) for (const g of ['girls', 'boys']) d.slice(0, 2).forEach((m, i) =>
    races.push(race({ id: `n_${k}_${g}_${i}`, groupId: `${k}_${g}`, groupLabel: `${label} ${g}`, division: 'novice', ages, distanceLabel: m + 'm', dayIndex: i + 1 })));
  [100, 200, 300].forEach((m, i) => races.push(race({ id: `skate_${i}`, groupId: 'skate', groupLabel: 'Skateability', division: 'additional', ages: '', distanceLabel: m + 'm', dayIndex: i + 1, isAdditionalRace: true })));
  races.push(race({ id: 'open1', groupId: 'juv_open', groupLabel: 'Juvenile Open', division: 'open', ages: '8-9', distanceLabel: '1500m', isOpenRace: true }));
  for (const sz of [2, 3, 4]) races.push(race({ id: `rel${sz}`, groupId: `relay_${sz}`, groupLabel: `Freshman ${sz} Person Relay`, division: 'relay', ages: '12-13', distanceLabel: '1200m', isRelayRace: true }));
  races.push(race({ id: 'tt', isTimeTrial: true, division: 'time_trial' }));
  return races;
}

test('league: full MSSL block sequence', () => {
  const res = generateScheduleBlocks(meet(leaguePool()), { style: 'league' });
  assert.deepEqual(layout(res), [
    'Quad Short Races', 'Quad Middle Races',
    'Elite Long Races', 'Elite Long Races Continued',
    'Novice Short Races',
    'Elite Short Races', 'Elite Short Races Continued',
    'Novice Middle Races',
    'Elite Middle Races', 'Elite Middle Races Continued',
    'Opens',
    '3 Person Relays', '2 Person Relays', '4 Person Relays',
  ]);
});

test('league: Elite blocks split even-position ages, then odd-position ("Continued")', () => {
  const res = generateScheduleBlocks(meet(leaguePool()), { style: 'league' });
  const long = res.blocks.find(b => b.name === 'Elite Long Races').raceIds;
  const cont = res.blocks.find(b => b.name === 'Elite Long Races Continued').raceIds;
  // even 1-based ages in the first block
  assert.ok(long.includes('e_primary_girls_2') && long.includes('e_elementary_girls_2') && long.includes('e_esquire_girls_2'));
  // odd 1-based ages in Continued
  assert.ok(cont.includes('e_tiny_tot_girls_2') && cont.includes('e_juvenile_girls_2') && cont.includes('e_veteran_girls_2'));
  // no age group appears in both
  assert.ok(!long.includes('e_tiny_tot_girls_2') && !cont.includes('e_primary_girls_2'));
  // Skateability rides the top of the Continued block
  assert.equal(cont[0], 'skate_2', 'skateability (long=300m) leads the Continued block');
});

test('league: 3-pass within a block — qualifiers first, straight finals, then advanced final last (rest break)', () => {
  const pool = leaguePool();
  // force Freshman Boys elite SHORT (300m, dayIndex 1) into 2 heats + final
  const fb = pool.find(r => r.id === 'e_freshman_boys_0');
  fb.stage = 'heat'; fb.heatNumber = 1; fb.isFinal = false; fb.parentRaceKey = 'fb';
  pool.push(race({ id: 'fb_h2', groupId: 'freshman_boys', groupLabel: 'Freshman boys', division: 'elite', ages: '12-13', distanceLabel: '300m', dayIndex: 1, stage: 'heat', heatNumber: 2, parentRaceKey: 'fb' }));
  pool.push(race({ id: 'fb_fin', groupId: 'freshman_boys', groupLabel: 'Freshman boys', division: 'elite', ages: '12-13', distanceLabel: '300m', dayIndex: 1, stage: 'final', parentRaceKey: 'fb' }));
  const res = generateScheduleBlocks(meet(pool), { style: 'league' });
  // Freshman is an odd-position age -> lands in "Elite Short Races Continued"
  const blk = res.blocks.find(b => b.name === 'Elite Short Races Continued').raceIds;
  const iH1 = blk.indexOf('e_freshman_boys_0'), iH2 = blk.indexOf('fb_h2'), iFin = blk.indexOf('fb_fin');
  assert.ok(iH1 >= 0 && iH2 >= 0 && iFin >= 0, 'all three Freshman Boys races in the block');
  // Additional (Skateability) rides the very top, before the heats.
  assert.equal(blk[0], 'skate_0', 'skateability (short=100m) leads the block');
  // Advanced final is dead last (the rest break).
  assert.equal(iFin, blk.length - 1, 'the heat-division final is last in the block');
  // Straight finals = age-division finals with no qualifier (exclude skateability
  // + the Freshman heat trio): each runs AFTER the heats and BEFORE the adv final.
  const straightFinals = blk.filter(id => id !== 'skate_0' && id !== 'e_freshman_boys_0' && id !== 'fb_h2' && id !== 'fb_fin');
  assert.ok(straightFinals.length > 0, 'block has straight finals');
  assert.ok(straightFinals.every(id => blk.indexOf(id) > iH2), 'straight finals run after the heats');
  assert.ok(straightFinals.every(id => blk.indexOf(id) < iFin), 'straight finals run before the advanced final (rest break)');
});

test('league: relays 3 -> 2 -> 4; opens present; time trial left unassigned; every non-TT race placed', () => {
  const m = meet(leaguePool());
  const res = generateScheduleBlocks(m, { style: 'league' });
  assert.ok(order(res, '3 Person Relays') < order(res, '2 Person Relays'), '3 before 2');
  assert.ok(order(res, '2 Person Relays') < order(res, '4 Person Relays'), '2 before 4');
  assert.equal(blockOf(res, 'tt'), undefined, 'time trial left unassigned');
  assert.equal(res.placed, m.races.filter(r => !r.isTimeTrial).length, 'every non-TT race placed');
  assert.equal(res.blocks.some(b => /Heats|Semis/.test(b.name)), false, 'league never makes championship Heats/Semis blocks');
});

test('league: append mode only schedules unassigned races', () => {
  const m = meet(leaguePool());
  m.blocks = [{ id: 'b0', raceIds: ['e_primary_girls_0'] }];
  const ap = generateScheduleBlocks(m, { mode: 'append', style: 'league' });
  assert.equal(ap.blocks.some(b => b.raceIds.includes('e_primary_girls_0')), false, 'append skips already-assigned race');
});
