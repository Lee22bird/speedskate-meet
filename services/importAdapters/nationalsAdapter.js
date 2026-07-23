// nationalsAdapter — data/nationals_heats.js -> import IR.
//
// This is the acceptance harness for the importer: it reconstructs the REAL
// 2026 Indoor Nationals bracket exactly as it happened (the actual skaters who
// appeared in each heat/semi/final, carrying their real finishing places), so
// the meet can be scored by SSM and reconciled against the OFFICIAL champions
// in data/nationals_champions.js.
//
// It intentionally does NOT decide who *should* have advanced — advancement
// comes straight from the sheets. Validating SSM's own advancement logic is a
// separate exercise.

// A day is quad or inline as a whole — this mirrors exactly how
// tools/nationals/gen_heats_data.py keyed its lookups (`"quad" in day`), so the
// discipline we infer here is consistent with how the data was built.
function dayIsQuad(day) {
  return JSON.stringify(day).toLowerCase().includes('quad');
}

function stageFromLabel(label) {
  const l = String(label || '').toLowerCase();
  if (l.startsWith('heat')) return 'heat';
  if (l.startsWith('semi')) return 'semi';
  // "^final" not "final" — "Semifinal" contains the substring "final".
  if (/^final/.test(l)) return 'final';
  return 'final';
}

function heatNumberFromLabel(label) {
  const m = String(label || '').match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function meters(distance) {
  const m = String(distance || '').match(/(\d+)/);
  return m ? m[1] : '';
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * @param {object} nationals  data/nationals_heats.js module export
 * @returns {{ir: object, stats: object}}
 */
function nationalsToIR(nationals) {
  const skaters = new Map();   // helmet -> { helmet, name, team, division }
  const races = [];

  // dayIndex = the ordinal in which the division actually RACED its distances,
  // not shortest-to-longest. The SR832 tiebreaker weights races positionally
  // after sorting by dayIndex, and USARS applies those weights in race order:
  // Masters Men raced 1500/500/1000, and the official totals only reproduce
  // under that order (e.g. #206 all-4ths = 16+18+20.125 = 54.125 exactly).
  // Re-sorting by distance length breaks real divisions — verified: it drops
  // champions 50/50 -> 49/50 and ranks 200 -> 185.
  const distanceOrdinal = new Map(); // division -> Map(meters -> ordinal)

  for (const day of nationals.days || []) {
    const isQuad = dayIsQuad(day);

    for (const session of day.sessions || []) {
      for (const event of session.events || []) {
        const rounds = event.rounds || [];
        if (!rounds.length) continue;

        const isRelay = rounds.some(r => r.relay);
        // Prefix quad divisions so they line up with nationals_champions.js,
        // which stores them as "Quad Freshman Girls" etc.
        const division = (isQuad ? 'Quad ' : '') + String(event.division || '').trim();
        const distanceLabel = String(event.distance || '').trim();

        if (!distanceOrdinal.has(division)) distanceOrdinal.set(division, new Map());
        const ord = distanceOrdinal.get(division);
        const mk = meters(distanceLabel);
        if (mk && !ord.has(mk)) ord.set(mk, ord.size + 1);
        const dayIndex = mk ? ord.get(mk) : 0;

        for (const round of rounds) {
          const stage = stageFromLabel(round.label);
          const entries = [];

          for (const s of round.skaters || []) {
            const helmet = String(s.helmet == null ? '' : s.helmet).trim();
            if (!helmet) continue;

            // Relay "skaters" are TEAMS (name = club, team = member list); they
            // are not individual registrations, but we still register them so the
            // relay race has resolvable entries.
            if (!skaters.has(helmet)) {
              skaters.set(helmet, {
                helmet,
                name: String(s.name || '').trim(),
                team: String(s.team || '').trim(),
                division,
              });
            }

            entries.push({
              helmet,
              place: String(s.place || '').trim(),
              time: String(s.time || '').trim(),
              // The sheets mark a scratch; SSM treats status separately from place.
              status: s.scratched ? 'SC' : '',
            });
          }

          if (!entries.length) continue;

          races.push({
            division,
            distanceLabel,
            dayIndex,
            stage,
            heatNumber: stage === 'final' ? 0 : heatNumberFromLabel(round.label),
            // computeQuadStandings() buckets by groupId ALONE (unlike individual
            // standings, which bucket by groupId|division), so each quad division
            // needs its own groupId — exactly like SSM's own quad groups
            // (quad_fresh_girls, …). A shared 'quad' id collapses all 17 quad
            // divisions into one bogus table.
            groupId: isQuad ? `quad_${slug(division)}` : isRelay ? `relay_${slug(division)}` : 'usars',
            groupLabel: isQuad || isRelay ? division : 'USARS',
            isQuad,
            isRelay,
            isOpen: false,
            entries,
          });
        }
      }
    }
  }

  const ir = {
    meet: {
      id: 'idn2026',
      name: '2026 Indoor Nationals (imported)',
      dates: nationals.subtitle || '',
      // Nationals breaks ties with USARS SR832 (weighted short/middle/long
      // points), NOT the 'd2' default — verified against the official totals,
      // e.g. Masters Men #206 = 16+18+20.125 = 54.125 exactly. With 'd2', a
      // genuine 70-70 tie resolves to the wrong champion.
      tiebreaker: 'sr832',
    },
    skaters: Array.from(skaters.values()),
    races,
  };

  return {
    ir,
    stats: {
      skaters: ir.skaters.length,
      races: races.length,
      finals: races.filter(r => r.stage === 'final').length,
      heats: races.filter(r => r.stage === 'heat').length,
      semis: races.filter(r => r.stage === 'semi').length,
      quad: races.filter(r => r.isQuad).length,
      relay: races.filter(r => r.isRelay).length,
      withPlaces: races.filter(r => r.entries.some(e => e.place)).length,
    },
  };
}

module.exports = { nationalsToIR, dayIsQuad, stageFromLabel };
