'use strict';
// ── R7: Block Builder conflict detection ──────────────────────────────────────
// PURE. No db, no meet mutation, no DOM. Given a normalized, ordered schedule it
// returns PASSIVE, NON-BLOCKING warnings — it never prevents an action, it only
// surfaces things a meet director probably wants to know before race day.
//
// The identical rules run client-side in blockBuilderView.js so the badges
// recompute live through R2/R3/R4's optimistic drags without a reload. Keep the
// two in sync; this file is the tested reference (see test/conflictDetection.test.js).
//
// Input `items` — the schedule in display order:
//   [{ id, isBreak, breakType, day, races: [{ raceId, division, skaters:[{key,name}] }] }]
//   - break/lunch/awards/practice dividers: isBreak=true, races=[]
//   - race blocks: isBreak=false, races=[…]
// Output — a flat array of { blockId, kind, message }. Callers group by blockId.

// Rule 1 — tight turnaround: a skater in two races with too little rest between.
// gap = number of races strictly between the two. Flag when gap < minRest.
function skaterRestWarnings(items, { minRest = 1 } = {}) {
  const flat = []; // { blockId, skaters:[{key,name}] } per race, in schedule order
  for (const it of items) {
    if (it.isBreak) continue;
    for (const r of it.races || []) flat.push({ blockId: it.id, skaters: r.skaters || [] });
  }
  const lastPos = new Map();   // skater key -> last race index seen
  const lastName = new Map();
  const perBlock = new Map();  // blockId -> Set(names) racing with too little rest
  for (let i = 0; i < flat.length; i++) {
    for (const s of flat[i].skaters) {
      if (!s || !s.key) continue;
      lastName.set(s.key, s.name || s.key);
      if (lastPos.has(s.key)) {
        const gap = i - lastPos.get(s.key) - 1;
        if (gap < minRest) {
          if (!perBlock.has(flat[i].blockId)) perBlock.set(flat[i].blockId, new Map());
          perBlock.get(flat[i].blockId).set(s.key, s.name || lastName.get(s.key) || s.key);
        }
      }
      lastPos.set(s.key, i);
    }
  }
  const out = [];
  for (const [blockId, names] of perBlock) {
    const list = [...names.values()];
    const shown = list.slice(0, 3).join(', ') + (list.length > 3 ? ` +${list.length - 3} more` : '');
    out.push({
      blockId, kind: 'skater-rest',
      message: `Tight turnaround — ${list.length} skater${list.length === 1 ? '' : 's'} racing again with little rest: ${shown}`,
    });
  }
  return out;
}

// Rule 2 — division split across a break: a division races, a break happens, then
// the SAME division races again later THAT SAME DAY. Warns on the break.
function divisionSplitWarnings(items) {
  const out = [];
  // group indices by day, preserving order
  const byDay = new Map();
  items.forEach((it, idx) => {
    const day = it.day || 'Day 1';
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(idx);
  });
  for (const idxs of byDay.values()) {
    // divisions present in each race block, in order; break positions
    for (let b = 0; b < idxs.length; b++) {
      const brk = items[idxs[b]];
      if (!brk.isBreak) continue;
      const before = new Set();
      for (let k = 0; k < b; k++) {
        const it = items[idxs[k]];
        if (it.isBreak) continue;
        for (const r of it.races || []) if (r.division) before.add(String(r.division).toLowerCase());
      }
      const after = new Set();
      for (let k = b + 1; k < idxs.length; k++) {
        const it = items[idxs[k]];
        if (it.isBreak) break; // only up to the next break — split is about THIS break
        for (const r of it.races || []) if (r.division) after.add(String(r.division).toLowerCase());
      }
      const split = [...after].filter(d => before.has(d));
      if (split.length) {
        out.push({
          blockId: brk.id, kind: 'division-split',
          message: `Division split — ${split.map(cap).join(', ')} race${split.length === 1 ? 's' : ''} again after this ${brk.breakType || 'break'}`,
        });
      }
    }
  }
  return out;
}

// Rule 3 — heavy block: a race block with far more races than the meet average.
function unbalancedBlockWarnings(items, { factor = 1.6, minExtra = 3, minBlocks = 3 } = {}) {
  const raceBlocks = items.filter(it => !it.isBreak);
  if (raceBlocks.length < minBlocks) return [];
  const counts = raceBlocks.map(it => (it.races || []).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const mean = total / raceBlocks.length;
  if (mean <= 0) return [];
  const out = [];
  raceBlocks.forEach(it => {
    const n = (it.races || []).length;
    if (n > mean * factor && n >= mean + minExtra) {
      out.push({
        blockId: it.id, kind: 'unbalanced',
        message: `Heavy block — ${n} races (meet average is ~${Math.round(mean)})`,
      });
    }
  });
  return out;
}

function cap(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) : s; }

function detectConflicts(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  return [
    ...skaterRestWarnings(list, opts.rest),
    ...divisionSplitWarnings(list),
    ...unbalancedBlockWarnings(list, opts.balance),
  ];
}

// Convenience: group warnings by blockId -> [messages] for badge rendering.
function groupByBlock(warnings) {
  const map = {};
  for (const w of warnings || []) (map[w.blockId] = map[w.blockId] || []).push(w.message);
  return map;
}

module.exports = {
  detectConflicts,
  groupByBlock,
  skaterRestWarnings,
  divisionSplitWarnings,
  unbalancedBlockWarnings,
};
