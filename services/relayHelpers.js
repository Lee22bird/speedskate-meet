const crypto = require('crypto');
const { esc } = require('../utils/html');
const { ageMatch } = require('./meetHelpers');
const { ageForReg } = require('./meetHelpers');
const { NATIONAL_RELAY_DIVISIONS, relayDivisionsForRuleset } = require('./relayDivisions');

// Relay build scope sentinel. A coach builds relays scoped to ONE club (the
// per-club USARS model). This reserved "club" value instead means "no club —
// draw from every skater in the meet", used for league scratch relays where a
// single team rarely has enough same-age skaters and directors mix across clubs.
// Shared by server.js (routing) and coachRelaysView.js (the picker option) so
// the value never drifts. It is not a real team name (double-underscored), so it
// can't collide with a club and never appears in meetTeamNames().
const MIXED_RELAY_SCOPE = '__mixed__';

// ── Relay template rows ───────────────────────────────────────────────────────
// The full USARS relay division set (services/relayDivisions.js) — one row per
// division, so the Relay Builder lists EVERY division with its correct gender
// split, age bracket, and rulebook distance (single source of truth shared with
// the coach relay form + relay generator). `age` = the division label minus the
// size token, gender kept: "Primary 2 Boys" -> "Primary Boys", "Juvenile 3 Person"
// -> "Juvenile". Includes both inline and quad divisions; `discipline` tags each
// so the builder can render/route them separately.
function rowsForDivisions(divisions) { return divisions.map(d => ({
  type: `${d.size} Person`,
  age: d.label.replace(/ \d+ /, ' ').replace(/ Person$/, '').trim(),
  ageRange: d.ageRange,
  distance: d.distance,
  notes: d.notes || '',
  divisionId: d.id,
  gender: d.gender,
  discipline: d.discipline || 'inline',
})); }

const RELAY_TEMPLATE_ROWS = rowsForDivisions(NATIONAL_RELAY_DIVISIONS);
function relayTemplateRowsForRuleset(ruleset) {
  return rowsForDivisions(relayDivisionsForRuleset(ruleset));
}

// ── Normalizers ───────────────────────────────────────────────────────────────
function normalizeRelayEligibleGroupIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(v => String(v || '').trim()).filter(Boolean)));
}

function normalizeRelayAgeRange(value) {
  return String(value || '').trim();
}

function normalizeRelayTemplates(saved, ruleset = 'usars') {
  const existing = Array.isArray(saved) ? saved : [];
  const defaults = relayTemplateRowsForRuleset(ruleset);
  // Fast path: a saved set that already matches the current division count aligns
  // by index (preserves any per-row edits). Otherwise (e.g. a legacy 12-row save
  // meeting the expanded USARS set) match saved rows to divisions by divisionId or
  // type+age so previously-enabled relays carry over without scrambling the list.
  const alignedByIndex = existing.length === defaults.length && existing.every((row, idx) => !row?.divisionId || row.divisionId === defaults[idx].divisionId);
  const byKey = new Map();
  if (!alignedByIndex) {
    existing.forEach(row => {
      if (!row) return;
      if (row.divisionId) byKey.set('id:' + row.divisionId, row);
      const key = `${String(row.type || '').toLowerCase().trim()}|${String(row.age || '').toLowerCase().trim()}`;
      if (!byKey.has(key)) byKey.set(key, row);
    });
  }
  return defaults.map((def, idx) => {
    const row = alignedByIndex
      ? (existing[idx] || {})
      : (byKey.get('id:' + def.divisionId) || byKey.get(`${def.type.toLowerCase()}|${def.age.toLowerCase()}`) || {});
    return {
      enabled: !!row.enabled,
      type: String(row.type || def.type),
      age: String(row.age || def.age),
      ageRange: normalizeRelayAgeRange(row.ageRange || row.ages || def.ageRange || def.ages),
      distance: String(row.distance || def.distance),
      notes: String(row.notes || def.notes || ''),
      divisionId: def.divisionId,
      gender: def.gender,
      discipline: def.discipline || 'inline',
    };
  });
}

// ── Race factory ──────────────────────────────────────────────────────────────
function makeRelayRace({ name, distance, notes, relayType='', ageGroup='', ageRange='', quad=false }) {
  const raceToken = crypto.randomBytes(6).toString('hex');
  const isQuad = !!quad;
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
    // A quad relay is still a relay (placement-only, never scores an overall);
    // isQuadRace only marks the discipline so it's not confused with inline.
    isQuadRace: isQuad,
    isTimeTrial: false,
    isRelayRace: true,
    relayType: String(relayType||'').trim(),
    relayAgeGroup: String(ageGroup||'').trim(),
    relayAgeRange: normalizeRelayAgeRange(ageRange),
  };
}

// Materialize one relay race per ENABLED template row — find-or-create keyed by
// relayDivisionId (with the same name+distance fallback the Relay Builder's
// add-template save uses, so the two can never double-create a division's race).
// Used by the USARS preset: enabling 75 relay toggles is not enough — the Block
// Builder can only schedule races that EXIST, and relay races were otherwise only
// created when someone clicked Save Relay Builder. Returns how many were created.
function ensureRelayRacesForEnabledTemplates(meet) {
  const templates = Array.isArray(meet.relayTemplates) ? meet.relayTemplates : [];
  meet.races = Array.isArray(meet.races) ? meet.races : [];
  let added = 0;
  for (const row of templates) {
    if (!row || !row.enabled || !row.divisionId) continue;
    const isQuad = (row.discipline || 'inline') === 'quad';
    const name = (isQuad ? 'Quad ' : '') + [row.age, row.type, 'Relay'].filter(Boolean).join(' ');
    let race = meet.races.find(r => r.isRelayRace && r.relayDivisionId === row.divisionId)
      || meet.races.find(r => r.isRelayRace &&
          String(r.groupLabel || '').trim().toLowerCase() === name.trim().toLowerCase() &&
          String(r.distanceLabel || '').trim().toLowerCase() === String(row.distance || '').trim().toLowerCase());
    if (race) {
      if (!race.relayDivisionId) race.relayDivisionId = row.divisionId;
      continue;
    }
    if (!name.trim() || !String(row.distance || '').trim()) continue;
    race = makeRelayRace({
      name,
      distance: row.distance,
      notes: row.notes,
      relayType: row.type,
      ageGroup: row.age,
      ageRange: row.ageRange,
      quad: isQuad,
    });
    race.relayDivisionId = row.divisionId;
    race.orderHint = 9800 + meet.races.filter(r => r.isRelayRace).length;
    meet.races.push(race);
    added += 1;
  }
  return added;
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
  // Quad relays draw from their own registration option so inline-relay entrants
  // aren't offered for a quad team (and vice-versa). Quad divisions are 2- or 3-person.
  const q = race?.isQuadRace ? 'quad' : '';
  const key = (n) => q ? `quadRelay${n}Person` : `relay${n}Person`;
  if (text.includes('4 person') || text.includes('4-person') || text.includes('4person')) return key(4);
  if (text.includes('2 person') || text.includes('2-person') || text.includes('2person')) return key(2);
  if (text.includes('3 person') || text.includes('3-person') || text.includes('3person')) return key(3);
  return q ? 'quadRelays' : 'relays';
}

function relayAgeRangeForRace(meet, race) {
  const direct = normalizeRelayAgeRange(race?.relayAgeRange || race?.ageRange || '');
  if (direct) return direct;
  const templates = normalizeRelayTemplates(meet?.relayTemplates || [], meet?.relayRuleset || (meet?.divisionScheme === 'mssl' ? 'mssl' : 'usars'));
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
      : optionKey === 'quadRelays'
        ? !!(opts.quadRelay2Person || opts.quadRelay3Person)
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
  MIXED_RELAY_SCOPE,
  RELAY_TEMPLATE_ROWS,
  relayTemplateRowsForRuleset,
  normalizeRelayEligibleGroupIds,
  normalizeRelayAgeRange,
  normalizeRelayTemplates,
  makeRelayRace,
  ensureRelayRacesForEnabledTemplates,
  relayRaceExists,
  relayOptionKeyForRace,
  relayAgeRangeForRace,
  registrationMatchesRelayAgeRange,
  relayEligibleRegistrationsForRace,
  renderRelayEligibleSkatersHtml,
};
