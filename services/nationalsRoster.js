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
    // Options carry the skater's real IDN 2026 entries: the elite individual event,
    // each inline relay size they raced (relay2/3/4Person), and quad if they entered
    // any quad event (individual or quad relay). quadRelays are kept on the row for
    // the future quad-relay divisions (no distinct registration option yet).
    const options = ['elite'];
    for (const n of (r.relays || [])) options.push(`relay${n}Person`);
    if (r.quad || (r.quadRelays || []).length) options.push('quad');
    rows.push({
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
