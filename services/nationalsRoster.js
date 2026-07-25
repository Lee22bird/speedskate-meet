// Dev roster built from the real 2026 Indoor Nationals skaters (name, team,
// division). The source sheets have no birthdates, but the division IS the age
// group — so each skater gets a representative age from their division's USARS
// age range. Used by the "Import Nationals roster" dev button to stress-test
// race generation with real, national-sized fields.
const NATIONALS_ROSTER = require('../data/nationalsRoster');
const { baseGroupsUSARS } = require('./meetHelpers');

// Representative age from a division's "ages" string ("8-9", "5 & under", "65+").
function representativeAge(ages) {
  const a = String(ages || '');
  if (/&\s*under/i.test(a)) return Number((a.match(/\d+/) || [6])[0]);
  if (/\+/.test(a)) return Number((a.match(/\d+/) || [65])[0]) + 3;
  const nums = (a.match(/\d+/g) || []).map(Number);
  if (nums.length >= 2) return Math.floor((nums[0] + nums[1]) / 2);
  return nums[0] || 10;
}

// mergeDisciplines: false (default) -> ONE ROW PER (person × discipline), the
// Nationals-faithful model (per-discipline helmets + age groups; matches the
// printed sheets and answer key 1:1 — use this to validate scoring).
// true -> ONE PROFILE PER SKATER, the way a real SSM meet registers people:
// a dual-discipline skater's inline + quad + relays combine onto a single
// registration under their INLINE number. Built for demos (check-in, coach
// walkthroughs) where duplicate names read as a bug; the trade-off is that
// quad age-group assignment then follows the skater's inline age instead of
// the (sometimes differently named) quad division they raced at Nationals.
function buildNationalsDevRoster({ mergeDisciplines = false } = {}) {
  const byLabel = new Map(baseGroupsUSARS().map(g => [g.label.toLowerCase(), g]));
  const rows = [];
  for (const r of NATIONALS_ROSTER) {
    const g = byLabel.get(String(r.division || '').trim().toLowerCase());
    if (!g) continue; // division outside the USARS set — skip
    // ONE ROW PER (person × discipline) — the owner-confirmed identity model,
    // verified against the answer key: each discipline is its own registration
    // with its OWN helmet number and its OWN age-division label (Lilliann is #64
    // inline "Freshman Girls" AND #129 quad; Towne is inline "Juvenile Boys" but
    // quad "Elementary Boys"). The row's division drives the row's AGE, so an
    // inline row lands in the inline age group as raced and a quad row lands in
    // the quad age group as raced — never collapse them into one registration.
    const isQuad = r.discipline === 'quad';
    const options = [];
    if (isQuad) {
      options.push('quad');
    } else {
      options.push('elite');
    }
    // Relay sizes attach to the row the generator chose (inline relays on the
    // inline row, quad relays on the quad row, falling back to whichever row the
    // person has — eligibility keys on the option + age/gender, not discipline).
    for (const n of (r.relays || [])) options.push(`relay${n}Person`);
    for (const n of (r.quadRelays || [])) options.push(`quadRelay${n}Person`);
    rows.push({
      // Real per-discipline Nationals helmet number — the importer uses it as
      // the skater's meet/helmet number so the dev meet cross-references the
      // printed heat sheets and answer key (#129 in SSM = #129 on the quad
      // sheets). Dual-discipline skaters legitimately import twice, once per
      // discipline, sometimes under the same number (Towne #497 in both).
      helmet: String(r.helmet || '').trim(),
      name: r.name,
      team: r.team || 'Independent',
      age: representativeAge(g.ages),
      // 'boys'/'girls' — the importer's testRosterGenderForAge() promotes these
      // to men/women for 16+ automatically.
      gender: (g.gender === 'boys' || g.gender === 'men') ? 'boys' : 'girls',
      options,
      discipline: isQuad ? 'quad' : 'inline',
      // The division label AS RACED in this discipline (source of this row's
      // age) — kept for display/debugging and answer-key cross-referencing.
      division: String(r.division || '').trim(),
      quadRelays: r.quadRelays || [],
    });
  }
  if (!mergeDisciplines) return rows;

  // ONE PROFILE PER SKATER (demo mode): fold each person's per-discipline rows
  // together. The inline row is the base — its helmet, age, and division are
  // what check-in displays — with quad participation and every relay option
  // unioned on top. Quad-only skaters keep their quad row as the base.
  const byPerson = new Map();
  const order = [];
  for (const row of rows) {
    const k = row.name.trim().toLowerCase();
    if (!byPerson.has(k)) { byPerson.set(k, []); order.push(k); }
    byPerson.get(k).push(row);
  }
  return order.map(k => {
    const group = byPerson.get(k);
    const base = group.find(r => r.discipline === 'inline') || group[0];
    const options = Array.from(new Set(group.flatMap(r => r.options)));
    const quadRelays = Array.from(new Set(group.flatMap(r => r.quadRelays || []))).sort((a, b) => a - b);
    return { ...base, options, quadRelays, discipline: 'merged' };
  });
}

module.exports = { buildNationalsDevRoster };
