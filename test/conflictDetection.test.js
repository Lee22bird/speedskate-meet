const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectConflicts, groupByBlock,
  skaterRestWarnings, divisionSplitWarnings, unbalancedBlockWarnings,
} = require('../services/conflictDetection');

// helpers to build the normalized schedule model
const race = (raceId, division, skaters) => ({ raceId, division, skaters: skaters.map(s => ({ key: s, name: s.toUpperCase() })) });
const block = (id, day, races) => ({ id, isBreak: false, breakType: null, day, races });
const brk = (id, day, breakType = 'break') => ({ id, isBreak: true, breakType, day, races: [] });

test('skater rest: back-to-back races for the same skater are flagged on the 2nd block', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'novice', ['alice', 'bob'])]),
    block('b2', 'Day 1', [race('r2', 'novice', ['alice', 'carol'])]), // alice again, 0 rest
  ];
  const w = skaterRestWarnings(items);
  assert.equal(w.length, 1);
  assert.equal(w[0].blockId, 'b2');
  assert.match(w[0].message, /ALICE/);
  assert.doesNotMatch(w[0].message, /BOB|CAROL/); // only the repeated skater
});

test('skater rest: enough races between = not flagged (minRest default 1)', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'novice', ['alice'])]),
    block('b2', 'Day 1', [race('r2', 'novice', ['bob'])]),   // gap of 1 race between alice's two
    block('b3', 'Day 1', [race('r3', 'novice', ['alice'])]),
  ];
  assert.equal(skaterRestWarnings(items).length, 0);
});

test('skater rest: two skaters both tight in one block aggregate into one warning', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'novice', ['alice', 'bob'])]),
    block('b2', 'Day 1', [race('r2', 'novice', ['alice', 'bob'])]),
  ];
  const w = skaterRestWarnings(items);
  assert.equal(w.length, 1);
  assert.match(w[0].message, /2 skaters/);
});

test('skater rest: a break between does not grant rest (breaks are not races) but division continuity is a separate rule', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'novice', ['alice'])]),
    brk('brk1', 'Day 1', 'lunch'),
    block('b2', 'Day 1', [race('r2', 'novice', ['alice'])]),
  ];
  // races are adjacent in RACE order (the break isn't a race), so still flagged
  assert.equal(skaterRestWarnings(items).length, 1);
});

test('division split: same division before and after a break same day is flagged on the break', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'novice', ['a'])]),
    brk('brk1', 'Day 1', 'lunch'),
    block('b2', 'Day 1', [race('r2', 'novice', ['b'])]),
  ];
  const w = divisionSplitWarnings(items);
  assert.equal(w.length, 1);
  assert.equal(w[0].blockId, 'brk1');
  assert.match(w[0].message, /Novice/);
  assert.match(w[0].message, /lunch/);
});

test('division split: division fully before the break is NOT flagged', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'novice', ['a'])]),
    block('b2', 'Day 1', [race('r2', 'novice', ['b'])]),
    brk('brk1', 'Day 1'),
    block('b3', 'Day 1', [race('r3', 'elite', ['c'])]),
  ];
  assert.equal(divisionSplitWarnings(items).length, 0);
});

test('division split: same division on different days is NOT a split', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'novice', ['a'])]),
    brk('brk1', 'Day 2'),
    block('b2', 'Day 2', [race('r2', 'novice', ['b'])]),
  ];
  assert.equal(divisionSplitWarnings(items).length, 0);
});

test('unbalanced block: a block far above the average is flagged', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'n', ['a']), race('r2', 'n', ['b'])]),
    block('b2', 'Day 1', [race('r3', 'n', ['c']), race('r4', 'n', ['d'])]),
    block('b3', 'Day 1', Array.from({ length: 12 }, (_, i) => race('x' + i, 'n', ['s' + i]))),
  ];
  const w = unbalancedBlockWarnings(items);
  assert.equal(w.length, 1);
  assert.equal(w[0].blockId, 'b3');
});

test('unbalanced block: balanced schedule flags nothing', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'n', ['a']), race('r2', 'n', ['b'])]),
    block('b2', 'Day 1', [race('r3', 'n', ['c']), race('r4', 'n', ['d'])]),
    block('b3', 'Day 1', [race('r5', 'n', ['e']), race('r6', 'n', ['f'])]),
  ];
  assert.equal(unbalancedBlockWarnings(items).length, 0);
});

test('unbalanced block: fewer than 3 race blocks = no average to judge', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'n', ['a'])]),
    block('b2', 'Day 1', Array.from({ length: 20 }, (_, i) => race('x' + i, 'n', ['s' + i]))),
  ];
  assert.equal(unbalancedBlockWarnings(items).length, 0);
});

test('detectConflicts combines rules; groupByBlock maps blockId -> messages', () => {
  const items = [
    block('b1', 'Day 1', [race('r1', 'novice', ['alice'])]),
    block('b2', 'Day 1', [race('r2', 'novice', ['alice'])]),
  ];
  const all = detectConflicts(items);
  assert.ok(all.length >= 1);
  const g = groupByBlock(all);
  assert.ok(Array.isArray(g.b2));
  assert.match(g.b2[0], /Tight turnaround/);
});

test('empty / missing input is safe', () => {
  assert.deepEqual(detectConflicts([]), []);
  assert.deepEqual(detectConflicts(null), []);
  assert.deepEqual(detectConflicts(undefined), []);
});
