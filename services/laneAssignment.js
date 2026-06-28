'use strict';

const crypto = require('crypto');

// Fisher–Yates shuffle using the platform's secure RNG (crypto.randomInt).
// Returns a new array — does not mutate the input. Every position has an
// equal probability of holding any item.
function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Single place lane numbers get assigned to a group of registrations, so a
// future "balanced lane distribution" algorithm can replace the shuffle call
// here without touching every call site that builds laneEntries.
function assignRandomLaneEntries(regs) {
  return shuffleArray(regs || []).map((reg, idx) => ({
    lane: idx + 1,
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
function reRandomizeLaneEntries(laneEntries) {
  const entries = Array.isArray(laneEntries) ? laneEntries : [];
  return shuffleArray(entries).map((entry, idx) => ({ ...entry, lane: idx + 1 }));
}

module.exports = { shuffleArray, assignRandomLaneEntries, reRandomizeLaneEntries };
