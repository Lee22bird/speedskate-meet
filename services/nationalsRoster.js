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

function buildNationalsDevRoster() {
  const byLabel = new Map(baseGroupsUSARS().map(g => [g.label.toLowerCase(), g]));
  const rows = [];
  for (const r of NATIONALS_ROSTER) {
    const g = byLabel.get(String(r.division || '').trim().toLowerCase());
    if (!g) continue; // division outside the USARS set — skip
    // Options carry the skater's real IDN 2026 entries, exactly as raced:
    //   - elite (inline individual) ONLY if this helmet raced an inline event —
    //     quad-only helmets (inline:false) must not inflate inline fields/heats;
    //   - each inline relay size they raced (relay2/3/4Person);
    //   - quad ONLY for real quad INDIVIDUAL entrants (a quad-relay-only skater
    //     must not be entered in quad individual races they never skated);
    //   - each quad relay size they raced (quadRelay2/3Person — quad-relay
    //     eligibility keys on these, not on `quad`).
    const options = [];
    if (r.inline !== false) options.push('elite');
    for (const n of (r.relays || [])) options.push(`relay${n}Person`);
    if (r.quad) options.push('quad');
    for (const n of (r.quadRelays || [])) options.push(`quadRelay${n}Person`);
    rows.push({
      // Real Nationals helmet number — the importer uses it as the skater's
      // meet/helmet number so the dev meet cross-references the printed heat
      // sheets and answer key (#37 in SSM = #37 on the official sheets).
      helmet: String(r.helmet || '').trim(),
      name: r.name,
      team: r.team || 'Independent',
      age: representativeAge(g.ages),
      // 'boys'/'girls' — the importer's testRosterGenderForAge() promotes these
      // to men/women for 16+ automatically.
      gender: (g.gender === 'boys' || g.gender === 'men') ? 'boys' : 'girls',
      options,
      quadRelays: r.quadRelays || [],
    });
  }
  return rows;
}

module.exports = { buildNationalsDevRoster };
