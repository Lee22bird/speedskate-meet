// Full USARS indoor relay divisions (rulebook SR110/SR114/SR115). Each is one
// relay event: size (2/3/4), gender ('boys'=male, 'girls'=female, 'mixed'/'open'
// = any), age range, and distance. Coaches form teams from their club's
// age/gender-eligible skaters for each of these.
const { ageMatch, normalizeSkaterGender } = require('./meetHelpers');

const RELAY_DIVISIONS = [
  // ── 2-person ──
  { id: 'r2_primary_boys',    size: 2, label: 'Primary 2 Boys',      ageRange: '7 & under',  gender: 'boys',  distance: '1200m' },
  { id: 'r2_primary_girls',   size: 2, label: 'Primary 2 Girls',     ageRange: '7 & under',  gender: 'girls', distance: '1200m' },
  { id: 'r2_primary_mixed',   size: 2, label: 'Primary 2 Mixed',     ageRange: '7 & under',  gender: 'mixed', distance: '1200m' },
  { id: 'r2_elem_boys',       size: 2, label: 'Elementary 2 Boys',   ageRange: '8-11',       gender: 'boys',  distance: '2000m' },
  { id: 'r2_elem_girls',      size: 2, label: 'Elementary 2 Girls',  ageRange: '8-11',       gender: 'girls', distance: '2000m' },
  { id: 'r2_elem_mixed',      size: 2, label: 'Elementary 2 Mixed',  ageRange: '8-11',       gender: 'mixed', distance: '2000m' },
  { id: 'r2_soph_men',        size: 2, label: 'Sophomore 2 Men',     ageRange: '12-15',      gender: 'boys',  distance: '3000m' },
  { id: 'r2_soph_ladies',     size: 2, label: 'Sophomore 2 Ladies',  ageRange: '12-15',      gender: 'girls', distance: '2000m' },
  { id: 'r2_soph_mixed',      size: 2, label: 'Sophomore 2 Mixed',   ageRange: '12-15',      gender: 'mixed', distance: '3000m' },
  { id: 'r2_senior_men',      size: 2, label: 'Senior 2 Men',        ageRange: '16 & older', gender: 'boys',  distance: '5000m' },
  { id: 'r2_senior_ladies',   size: 2, label: 'Senior 2 Ladies',     ageRange: '16 & older', gender: 'girls', distance: '3000m' },
  { id: 'r2_senior_mixed',    size: 2, label: 'Senior 2 Mixed',      ageRange: '16 & older', gender: 'mixed', distance: '3000m' },
  { id: 'r2_classic_men',     size: 2, label: 'Classic 2 Men',       ageRange: '25 & older', gender: 'boys',  distance: '3000m' },
  { id: 'r2_classic_ladies',  size: 2, label: 'Classic 2 Ladies',    ageRange: '25 & older', gender: 'girls', distance: '2000m' },
  { id: 'r2_classic_mixed',   size: 2, label: 'Classic 2 Mixed',     ageRange: '25 & older', gender: 'mixed', distance: '2000m' },
  { id: 'r2_master_men',      size: 2, label: 'Master 2 Men',        ageRange: '35 & older', gender: 'boys',  distance: '2000m' },
  { id: 'r2_master_ladies',   size: 2, label: 'Master 2 Ladies',     ageRange: '35 & older', gender: 'girls', distance: '2000m' },
  { id: 'r2_master_mixed',    size: 2, label: 'Master 2 Mixed',      ageRange: '35 & older', gender: 'mixed', distance: '2000m' },
  { id: 'r2_veteran_men',     size: 2, label: 'Veteran 2 Men',       ageRange: '45 & older', gender: 'boys',  distance: '2000m' },
  { id: 'r2_veteran_ladies',  size: 2, label: 'Veteran 2 Ladies',    ageRange: '45 & older', gender: 'girls', distance: '2000m' },
  { id: 'r2_veteran_mixed',   size: 2, label: 'Veteran 2 Mixed',     ageRange: '45 & older', gender: 'mixed', distance: '2000m' },
  { id: 'r2_esquire_men',     size: 2, label: 'Esquire 2 Men',       ageRange: '55 & older', gender: 'boys',  distance: '2000m' },
  { id: 'r2_esquire_ladies',  size: 2, label: 'Esquire 2 Ladies',    ageRange: '55 & older', gender: 'girls', distance: '2000m' },
  { id: 'r2_esquire_mixed',   size: 2, label: 'Esquire 2 Mixed',     ageRange: '55 & older', gender: 'mixed', distance: '2000m' },
  // ── 3-person ──
  { id: 'r3_juvenile',        size: 3, label: 'Juvenile 3 Person',   ageRange: '9 & under',  gender: 'open',  distance: '1200m' },
  { id: 'r3_freshman_boys',   size: 3, label: 'Freshman 3 Boys',     ageRange: '10-13',      gender: 'boys',  distance: '2100m' },
  { id: 'r3_freshman_girls',  size: 3, label: 'Freshman 3 Girls',    ageRange: '10-13',      gender: 'girls', distance: '2100m' },
  { id: 'r3_freshman_mixed',  size: 3, label: 'Freshman 3 Mixed',    ageRange: '10-13',      gender: 'mixed', distance: '2100m' },
  { id: 'r3_senior_men',      size: 3, label: 'Senior 3 Men',        ageRange: '14 & older', gender: 'boys',  distance: '4500m' },
  { id: 'r3_senior_ladies',   size: 3, label: 'Senior 3 Ladies',     ageRange: '14 & older', gender: 'girls', distance: '3000m' },
  { id: 'r3_senior_mixed',    size: 3, label: 'Senior 3 Mixed',      ageRange: '14 & older', gender: 'mixed', distance: '3000m' },
  { id: 'r3_master_men',      size: 3, label: 'Master 3 Men',        ageRange: '25 & older', gender: 'boys',  distance: '3000m' },
  { id: 'r3_master_ladies',   size: 3, label: 'Master 3 Ladies',     ageRange: '25 & older', gender: 'girls', distance: '3000m' },
  { id: 'r3_master_mixed',    size: 3, label: 'Master 3 Mixed',      ageRange: '25 & older', gender: 'mixed', distance: '3000m' },
  { id: 'r3_veteran_men',     size: 3, label: 'Veteran 3 Men',       ageRange: '45 & older', gender: 'boys',  distance: '2100m' },
  { id: 'r3_veteran_ladies',  size: 3, label: 'Veteran 3 Ladies',    ageRange: '45 & older', gender: 'girls', distance: '2100m' },
  { id: 'r3_veteran_mixed',   size: 3, label: 'Veteran 3 Mixed',     ageRange: '45 & older', gender: 'mixed', distance: '2100m' },
  // ── 4-person ──
  { id: 'r4_juvenile_boys',   size: 4, label: 'Juvenile 4 Boys',     ageRange: '9 & under',  gender: 'boys',  distance: '1200m' },
  { id: 'r4_juvenile_girls',  size: 4, label: 'Juvenile 4 Girls',    ageRange: '9 & under',  gender: 'girls', distance: '1200m' },
  { id: 'r4_juvenile_mixed',  size: 4, label: 'Juvenile 4 Mixed',    ageRange: '9 & under',  gender: 'mixed', distance: '1200m' },
  { id: 'r4_freshman_boys',   size: 4, label: 'Freshman 4 Boys',     ageRange: '10-13',      gender: 'boys',  distance: '2000m' },
  { id: 'r4_freshman_girls',  size: 4, label: 'Freshman 4 Girls',    ageRange: '10-13',      gender: 'girls', distance: '2000m' },
  { id: 'r4_freshman_mixed',  size: 4, label: 'Freshman 4 Mixed',    ageRange: '10-13',      gender: 'mixed', distance: '2000m' },
  { id: 'r4_senior_men',      size: 4, label: 'Senior 4 Men',        ageRange: '14 & older', gender: 'boys',  distance: '4000m' },
  { id: 'r4_senior_ladies',   size: 4, label: 'Senior 4 Ladies',     ageRange: '14 & older', gender: 'girls', distance: '4000m' },
  { id: 'r4_senior_mixed',    size: 4, label: 'Senior 4 Mixed',      ageRange: '14 & older', gender: 'mixed', distance: '4000m' },
  { id: 'r4_master_men',      size: 4, label: 'Master 4 Men',        ageRange: '35 & older', gender: 'boys',  distance: '2000m' },
  { id: 'r4_master_ladies',   size: 4, label: 'Master 4 Ladies',     ageRange: '35 & older', gender: 'girls', distance: '2000m' },
  { id: 'r4_master_mixed',    size: 4, label: 'Master 4 Mixed',      ageRange: '35 & older', gender: 'mixed', distance: '2000m' },
];

// ── QUAD relays (nationals / regionals — leagues don't run these) ─────────────
// Seeded from the 26 quad-relay divisions in the official 2026 Indoor Nationals
// data (division names + distances are authoritative). Age ranges MIRROR the
// inline USARS relay brackets for the same division+size — verify against the
// quad relay rulebook if it diverges. Quad relays are placement-only and never
// score toward any overall (same as inline relays).
const QUAD_RELAY_DIVISIONS = [
  // ── 2-person ──
  { id: 'q2_juvenile_girls', size: 2, label: 'Juvenile 2 Girls', ageRange: '9 & under',  gender: 'girls', distance: '1200m' },
  { id: 'q2_juvenile_mixed', size: 2, label: 'Juvenile 2 Mixed', ageRange: '9 & under',  gender: 'mixed', distance: '1200m' },
  { id: 'q2_freshman_girls', size: 2, label: 'Freshman 2 Girls', ageRange: '10-13',      gender: 'girls', distance: '2000m' },
  { id: 'q2_freshman_boys',  size: 2, label: 'Freshman 2 Boys',  ageRange: '10-13',      gender: 'boys',  distance: '2000m' },
  { id: 'q2_freshman_mixed', size: 2, label: 'Freshman 2 Mixed', ageRange: '10-13',      gender: 'mixed', distance: '2000m' },
  { id: 'q2_senior_ladies',  size: 2, label: 'Senior 2 Ladies',  ageRange: '16 & older', gender: 'girls', distance: '3000m' },
  { id: 'q2_senior_men',     size: 2, label: 'Senior 2 Men',     ageRange: '16 & older', gender: 'boys',  distance: '5000m' },
  { id: 'q2_senior_mixed',   size: 2, label: 'Senior 2 Mixed',   ageRange: '16 & older', gender: 'mixed', distance: '3000m' },
  { id: 'q2_masters_ladies', size: 2, label: 'Masters 2 Ladies', ageRange: '35 & older', gender: 'girls', distance: '2000m' },
  { id: 'q2_masters_men',    size: 2, label: 'Masters 2 Men',    ageRange: '35 & older', gender: 'boys',  distance: '2000m' },
  { id: 'q2_masters_mixed',  size: 2, label: 'Masters 2 Mixed',  ageRange: '35 & older', gender: 'mixed', distance: '2000m' },
  { id: 'q2_veteran_ladies', size: 2, label: 'Veteran 2 Ladies', ageRange: '45 & older', gender: 'girls', distance: '2000m' },
  { id: 'q2_veteran_men',    size: 2, label: 'Veteran 2 Men',    ageRange: '45 & older', gender: 'boys',  distance: '2000m' },
  { id: 'q2_veteran_mixed',  size: 2, label: 'Veteran 2 Mixed',  ageRange: '45 & older', gender: 'mixed', distance: '2000m' },
  { id: 'q2_esquire_ladies', size: 2, label: 'Esquire 2 Ladies', ageRange: '55 & older', gender: 'girls', distance: '2000m' },
  { id: 'q2_esquire_men',    size: 2, label: 'Esquire 2 Men',    ageRange: '55 & older', gender: 'boys',  distance: '2000m' },
  { id: 'q2_esquire_mixed',  size: 2, label: 'Esquire 2 Mixed',  ageRange: '55 & older', gender: 'mixed', distance: '2000m' },
  // ── 3-person ──
  { id: 'q3_freshman_girls', size: 3, label: 'Freshman 3 Girls', ageRange: '10-13',      gender: 'girls', distance: '1200m' },
  { id: 'q3_freshman_boys',  size: 3, label: 'Freshman 3 Boys',  ageRange: '10-13',      gender: 'boys',  distance: '1200m' },
  { id: 'q3_freshman_mixed', size: 3, label: 'Freshman 3 Mixed', ageRange: '10-13',      gender: 'mixed', distance: '1200m' },
  { id: 'q3_senior_ladies',  size: 3, label: 'Senior 3 Ladies',  ageRange: '14 & older', gender: 'girls', distance: '3000m' },
  { id: 'q3_senior_men',     size: 3, label: 'Senior 3 Men',     ageRange: '14 & older', gender: 'boys',  distance: '3000m' },
  { id: 'q3_senior_mixed',   size: 3, label: 'Senior 3 Mixed',   ageRange: '14 & older', gender: 'mixed', distance: '3000m' },
  { id: 'q3_masters_ladies', size: 3, label: 'Masters 3 Ladies', ageRange: '25 & older', gender: 'girls', distance: '1500m' },
  { id: 'q3_masters_men',    size: 3, label: 'Masters 3 Men',    ageRange: '25 & older', gender: 'boys',  distance: '1500m' },
  { id: 'q3_masters_mixed',  size: 3, label: 'Masters 3 Mixed',  ageRange: '25 & older', gender: 'mixed', distance: '1500m' },
];

// Tag discipline so a division always self-describes. RELAY_DIVISIONS keeps its
// meaning of "inline relay divisions" — existing consumers (the inline relay
// builder) are unchanged; quad divisions live in their own list until the
// Builder UI is discipline-aware.
for (const d of RELAY_DIVISIONS) d.discipline = 'inline';
for (const d of QUAD_RELAY_DIVISIONS) d.discipline = 'quad';

const ALL_RELAY_DIVISIONS = [...RELAY_DIVISIONS, ...QUAD_RELAY_DIVISIONS];

// Divisions for a discipline ('inline' | 'quad'); defaults to inline.
function relayDivisionsForDiscipline(discipline) {
  const want = String(discipline || 'inline').toLowerCase() === 'quad' ? 'quad' : 'inline';
  return ALL_RELAY_DIVISIONS.filter(d => d.discipline === want);
}

const RELAY_DIVISION_BY_ID = new Map(ALL_RELAY_DIVISIONS.map(d => [d.id, d]));

function relayGenderOk(divGender, skaterGender) {
  if (divGender === 'mixed' || divGender === 'open') return true;
  const g = normalizeSkaterGender(skaterGender);
  if (divGender === 'boys' || divGender === 'men') return g === 'male';
  if (divGender === 'girls' || divGender === 'ladies') return g === 'female';
  return true;
}

// Skaters (registration rows) eligible for a relay division: age in range + gender match.
function eligibleForRelayDivision(div, skaters) {
  if (!div) return [];
  return (skaters || []).filter(s => ageMatch(div.ageRange, Number(s.age)) && relayGenderOk(div.gender, s.gender));
}

module.exports = { RELAY_DIVISIONS, QUAD_RELAY_DIVISIONS, ALL_RELAY_DIVISIONS, RELAY_DIVISION_BY_ID, relayGenderOk, eligibleForRelayDivision, relayDivisionsForDiscipline };
