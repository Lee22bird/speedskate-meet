const crypto = require('crypto');
const { esc } = require('../utils/html');
const { ageMatch } = require('./meetHelpers');
const { ageForReg } = require('./meetHelpers');

// ── Relay template defaults ───────────────────────────────────────────────────
const RELAY_TEMPLATE_ROWS = [
  { type: '3 Person', age: 'Juvenile', ageRange: '9 & Under', distance: '900m', notes: '1 lap × 3 times each' },
  { type: '3 Person', age: 'Freshman', ageRange: '10-13', distance: '900m', notes: '1 lap × 3 times each' },
  { type: '3 Person', age: 'Senior', ageRange: '14 & Older', distance: '900m', notes: '1 lap × 3 times each' },
  { type: '3 Person', age: 'Master', ageRange: '35 & Older', distance: '900m', notes: '1 lap × 3 times each' },
  { type: '2 Person', age: 'Juvenile', ageRange: '9 & Under', distance: '1200m', notes: '2 laps × 3 times each' },
  { type: '2 Person', age: 'Freshman', ageRange: '10-13', distance: '1200m', notes: '2 laps × 3 times each' },
  { type: '2 Person', age: 'Senior', ageRange: '14 & Older', distance: '1200m', notes: '2 laps × 3 times each' },
  { type: '2 Person', age: 'Master', ageRange: '35 & Older', distance: '1200m', notes: '2 laps × 3 times each' },
  { type: '4 Person', age: 'Juvenile', ageRange: '9 & Under', distance: '1200m', notes: '3 laps × 1 time each' },
  { type: '4 Person', age: 'Freshman', ageRange: '10-13', distance: '2000m', notes: '5 laps × 1 time each' },
  { type: '4 Person', age: 'Senior', ageRange: '14 & Older', distance: '2000m', notes: '5 laps × 1 time each' },
  { type: '4 Person', age: 'Master', ageRange: '35 & Older', distance: '2000m', notes: '5 laps × 1 time each' },
];

// ── Normalizers ───────────────────────────────────────────────────────────────
function normalizeRelayEligibleGroupIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(v => String(v || '').trim()).filter(Boolean)));
}

function normalizeRelayAgeRange(value) {
  return String(value || '').trim();
}

function normalizeRelayTemplates(saved) {
  const existing = Array.isArray(saved) ? saved : [];
  return RELAY_TEMPLATE_ROWS.map((def, idx) => {
    const row = existing[idx] || {};
    return {
      enabled: !!row.enabled,
      type: String(row.type || def.type),
      age: String(row.age || def.age),
      ageRange: normalizeRelayAgeRange(row.ageRange || row.ages || def.ageRange || def.ages),
      distance: String(row.distance || def.distance),
      notes: String(row.notes || def.notes),
    };
  });
}

// ── Race factory ──────────────────────────────────────────────────────────────
function makeRelayRace({ name, distance, notes, relayType='', ageGroup='', ageRange='' }) {
  const raceToken = crypto.randomBytes(6).toString('hex');
  return {
    id: 'r'+raceToken,
    orderHint: 9800,
    groupId: 'relay_'+crypto.randomBytes(4).toString('hex'),
    groupLabel: String(name||'Relay Race').trim(),
    ages: String(ageRange || ageGroup || '').trim(),
    division: 'relay',
    distanceLabel: String(distance||'').trim(),
    dayIndex: 1,
    cost: 0,
    stage: 'final',
    heatNumber: 0,
    parentRaceKey: 'relay_'+raceToken,
    startType: 'standing',
    countsForOverall: false,
    laneEntries: [],
    resultsMode: 'places',
    status: 'open',
    notes: String(notes||'').trim(),
    isFinal: true,
    closedAt: '',
    isOpenRace: false,
    isQuadRace: false,
    isTimeTrial: false,
    isRelayRace: true,
    relayType: String(relayType||'').trim(),
    relayAgeGroup: String(ageGroup||'').trim(),
    relayAgeRange: normalizeRelayAgeRange(ageRange),
  };
}

function relayRaceExists(meet, name, distance) {
  const keyName = String(name||'').trim().toLowerCase();
  const keyDist = String(distance||'').trim().toLowerCase();
  return (meet.races||[]).some(r =>
    r.isRelayRace &&
    String(r.groupLabel||'').trim().toLowerCase() === keyName &&
    String(r.distanceLabel||'').trim().toLowerCase() === keyDist
  );
}

// ── Race-day relay helpers ────────────────────────────────────────────────────
function relayOptionKeyForRace(race) {
  const text = [race?.relayType, race?.groupLabel, race?.division, race?.distanceLabel]
    .map(x => String(x || '').toLowerCase())
    .join(' ');
  if (text.includes('4 person') || text.includes('4-person') || text.includes('4person')) return 'relay4Person';
  if (text.includes('2 person') || text.includes('2-person') || text.includes('2person')) return 'relay2Person';
  if (text.includes('3 person') || text.includes('3-person') || text.includes('3person')) return 'relay3Person';
  return 'relays';
}

function relayAgeRangeForRace(meet, race) {
  const direct = normalizeRelayAgeRange(race?.relayAgeRange || race?.ageRange || '');
  if (direct) return direct;
  const templates = normalizeRelayTemplates(meet?.relayTemplates || []);
  const match = templates.find(t =>
    String(t.type||'').trim().toLowerCase() === String(race?.relayType||'').trim().toLowerCase() &&
    String(t.age||'').trim().toLowerCase() === String(race?.relayAgeGroup||'').trim().toLowerCase() &&
    String(t.distance||'').trim().toLowerCase() === String(race?.distanceLabel||'').trim().toLowerCase()
  );
  return normalizeRelayAgeRange(match?.ageRange || match?.ages || race?.ages || race?.relayAgeGroup || '');
}

function registrationMatchesRelayAgeRange(reg, meet, ageRange) {
  const range = normalizeRelayAgeRange(ageRange);
  if (!range) return true;
  const age = ageForReg(reg, meet);
  return ageMatch(range, age);
}

function relayEligibleRegistrationsForRace(meet, race) {
  if (!race || !race.isRelayRace) return [];
  const optionKey = relayOptionKeyForRace(race);
  const ageRange = relayAgeRangeForRace(meet, race);
  const relayRegs = (meet.registrations || []).filter(reg => {
    const opts = reg.options || {};
    const relayOptionOk = optionKey === 'relays'
      ? !!(opts.relays || opts.relay2Person || opts.relay3Person || opts.relay4Person)
      : !!opts[optionKey];
    if (!relayOptionOk) return false;
    return registrationMatchesRelayAgeRange(reg, meet, ageRange);
  });
  return relayRegs.sort((a, b) => {
    const byTeam = String(a.team||'').localeCompare(String(b.team||''));
    if (byTeam) return byTeam;
    return String(a.name||'').localeCompare(String(b.name||''));
  });
}

function renderRelayEligibleSkatersHtml(meet, race) {
  if (!race || !race.isRelayRace) return '';
  const regs = relayEligibleRegistrationsForRace(meet, race);
  const optionKey = relayOptionKeyForRace(race);
  const relayLabel = optionKey === 'relay2Person' ? '2 Person Relay'
    : optionKey === 'relay3Person' ? '3 Person Relay'
    : optionKey === 'relay4Person' ? '4 Person Relay'
    : 'Relay';

  const grouped = new Map();
  for (const reg of regs) {
    const team = String(reg.team || 'Independent').trim() || 'Independent';
    if (!grouped.has(team)) grouped.set(team, []);
    grouped.get(team).push(reg);
  }

  const groupsHtml = Array.from(grouped.entries()).map(([team, rows]) => `
    <div class="relay-team-card">
      <div class="relay-team-head">
        <strong>${esc(team)}</strong>
        <span class="chip">${rows.length}</span>
      </div>
      <div class="relay-skater-list">
        ${rows.map(reg => `
          <div class="relay-skater-row">
            <span>${esc(reg.name || '')}</span>
            <small>${esc(team)}</small>
          </div>`).join('')}
      </div>
    </div>`).join('');

  return `
    <div class="card relay-eligible-card" style="margin-top:16px">
      <div class="row between center" style="margin-bottom:12px">
        <div>
          <h2 style="margin:0">Relay Eligible Skaters</h2>
          <div class="note">${esc(relayLabel)} entries that match this relay's age range.</div>
        </div>
        <span class="chip chip-sky">${regs.length} eligible</span>
      </div>
      ${regs.length ? `<div class="relay-team-grid">${groupsHtml}</div>` : `<div class="muted">No skaters found for this relay option yet.</div>`}
    </div>
    <style>
      .relay-team-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}
      .relay-team-card{background:#f8fafc;border:1px solid rgba(15,31,61,.10);border-radius:14px;padding:12px;}
      .relay-team-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;color:var(--navy);}
      .relay-skater-list{display:flex;flex-direction:column;gap:6px;}
      .relay-skater-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid rgba(15,31,61,.08);padding-top:6px;font-weight:750;}
      .relay-skater-row:first-child{border-top:0;padding-top:0;}
      .relay-skater-row small{color:var(--muted);font-weight:650;text-align:right;}
    </style>`;
}

module.exports = {
  RELAY_TEMPLATE_ROWS,
  normalizeRelayEligibleGroupIds,
  normalizeRelayAgeRange,
  normalizeRelayTemplates,
  makeRelayRace,
  relayRaceExists,
  relayOptionKeyForRace,
  relayAgeRangeForRace,
  registrationMatchesRelayAgeRange,
  relayEligibleRegistrationsForRace,
  renderRelayEligibleSkatersHtml,
};
