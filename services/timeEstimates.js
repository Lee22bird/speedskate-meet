// R5 — time-awareness helpers for the Block Builder.
//
// Pace comes from REAL timing history when available: races carry closedAt
// (ISO) stamps as they finish on race day. The median gap between consecutive
// closes (ignoring gaps under 30s or over 30min — breaks, lunch, overnight)
// is this meet's minutes-per-race. Falls back to a 3-minute default until at
// least 3 usable gaps exist. Pure module — no db access.

const DEFAULT_PACE_MIN = 3;
const DIVIDER_DEFAULT_MIN = { break: 15, lunch: 45, awards: 30, practice: 30 };
const TT_MIN_PER_PARTICIPANT = 1.5;
const TT_MIN_FLOOR = 10;

function estimateRacePaceMinutes(meet) {
  const times = (meet.races || [])
    .map(r => Date.parse(r.closedAt || ''))
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    const g = (times[i] - times[i - 1]) / 60000;
    if (g >= 0.5 && g <= 30) gaps.push(g);
  }
  if (gaps.length < 3) return DEFAULT_PACE_MIN;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.round(Math.min(10, Math.max(1, median)) * 10) / 10;
}

// "HH:MM" -> minutes after midnight, or null when unset/invalid.
function dayStartMinutes(meet) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(meet.startTime || '').trim());
  if (!m) return null;
  const v = (+m[1]) * 60 + (+m[2]);
  return v >= 0 && v < 1440 ? v : null;
}

module.exports = {
  DEFAULT_PACE_MIN,
  DIVIDER_DEFAULT_MIN,
  TT_MIN_PER_PARTICIPANT,
  TT_MIN_FLOOR,
  estimateRacePaceMinutes,
  dayStartMinutes,
};
