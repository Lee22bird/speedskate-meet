'use strict';

const crypto = require('crypto');

// Fisher–Yates shuffle using the platform's secure RNG (crypto.randomInt).
// Returns a new array — does not mutate the input. Every position has an
// equal probability of holding any item.
function shuffleArray(items, randomInt = crypto.randomInt) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomLaneNumbers(entryCount, laneCount, randomInt = crypto.randomInt) {
  const count = Math.max(0, Number(entryCount) || 0);
  const availableLanes = Math.max(1, Number(laneCount) || 7);
  const lanePool = Array.from(
    { length: Math.max(availableLanes, count) },
    (_, idx) => idx + 1
  );
  return shuffleArray(lanePool, randomInt).slice(0, count).sort((a, b) => a - b);
}

// Select distinct lanes from the entire track, then independently randomize
// skaters across that selection. Sparse races therefore don't default to L1…Ln.
function assignRandomLaneEntries(regs, laneCount = 7, randomInt = crypto.randomInt) {
  const entries = shuffleArray(regs || [], randomInt);
  const lanes = randomLaneNumbers(entries.length, laneCount, randomInt);
  return entries.map((reg, idx) => ({
    lane: lanes[idx],
    registrationId: reg.id,
    helmetNumber: reg.helmetNumber || '',
    skaterName: reg.name || '',
    team: reg.team || '',
    place: '',
    time: '',
    status: '',
  }));
}

// Re-randomizes lane numbers for an already-built race's laneEntries without
// touching which skaters are in the race, heat membership, race order, or
// block placement — only the lane each entry holds changes. Result/place
// fields are preserved so re-randomizing a race that already has results
// recorded doesn't lose them (still scoped to lane reassignment only).
function reRandomizeLaneEntries(laneEntries, laneCount = 7, randomInt = crypto.randomInt) {
  const entries = Array.isArray(laneEntries) ? laneEntries : [];
  const randomizedEntries = shuffleArray(entries, randomInt);
  const lanes = randomLaneNumbers(randomizedEntries.length, laneCount, randomInt);
  return randomizedEntries.map((entry, idx) => ({ ...entry, lane: lanes[idx] }));
}

module.exports = { shuffleArray, randomLaneNumbers, assignRandomLaneEntries, reRandomizeLaneEntries };
