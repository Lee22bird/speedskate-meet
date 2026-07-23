// Pure IR -> SSM meet core, shared by every importer front-end.
//
// Adapters (nationalsAdapter, later sheetAdapter for the tabulator's Google
// Sheet) convert their source into the neutral IR below; this module is the ONE
// place that turns an IR into a real SSM meet. Keeping it pure (no db, no fs,
// no globals) is what makes the Nationals golden-master test possible and what
// lets the live sheet path reuse the exact same, already-proven code.
//
// IR shape
//   meet:    { name, dates?, tiebreaker?, lanes?, trackLength? }
//   skaters: [ { helmet, name, team, division, class? } ]
//   races:   [ { division, class?, distanceLabel, dayIndex, stage, heatNumber?,
//                groupId?, groupLabel?, isQuad?, isRelay?, isOpen?,
//                isAdditional?, status?,
//                entries: [ { helmet, lane?, place?, status?, time? } ] } ]
//
// stage: 'heat' | 'semi' | 'final' | 'race'   ('race' == straight-to-final)
//
// IMPORTANT (see services/usarsScoring.js raceCountsForUsarsStandardOverall):
// a race only reaches the overall standings when it is isFinal + countsForOverall
// + status 'closed', and only places 1-4 score. Heats/semis are imported for
// fidelity but deliberately do NOT count toward the overall.

const FINAL_STAGES = new Set(['final', 'race']);

function str(v) {
  return v == null ? '' : String(v).trim();
}

function helmetKey(v) {
  return str(v);
}

/** Stage -> the flags SSM's scoring gates on. */
function stageFlags(stage) {
  const s = str(stage).toLowerCase() || 'final';
  const isFinal = FINAL_STAGES.has(s);
  return {
    stage: s === 'race' ? 'final' : s,
    isFinal,
    // Only a final feeds the overall. Heats/semis are real races in the meet but
    // must never contribute points, or every skater would be scored 2-3x.
    countsForOverall: isFinal,
  };
}

/**
 * Build an SSM meet object from an IR.
 *
 * Returns { meet, warnings, stats }. Warnings are never thrown — an import must
 * stay inspectable, so anything suspicious (unknown helmet, duplicate helmet in
 * a race, a place we couldn't read) is reported rather than silently dropped.
 */
function buildMeetFromIR(ir, opts = {}) {
  const warnings = [];
  const meetIn = ir.meet || {};
  const syntheticLanes = opts.syntheticLanes !== false;

  // ---- registrations (helmet is the stable join key) ----------------------
  const regByHelmet = new Map();
  const registrations = [];
  let nextRegId = 1;

  for (const s of ir.skaters || []) {
    const helmet = helmetKey(s.helmet);
    if (!helmet) {
      warnings.push({ type: 'skater_without_helmet', name: str(s.name) });
      continue;
    }
    const existing = regByHelmet.get(helmet);
    if (existing) {
      // Same helmet twice. Keep the first, but surface it: at a real meet a
      // helmet is unique, so a collision means the source conflated two skaters.
      if (str(existing.division) !== str(s.division) || str(existing.skaterName) !== str(s.name)) {
        warnings.push({
          type: 'duplicate_helmet',
          helmet,
          kept: { name: existing.skaterName, division: existing.division },
          ignored: { name: str(s.name), division: str(s.division) },
        });
      }
      continue;
    }
    const reg = {
      id: nextRegId++,
      helmetNumber: helmet,
      skaterName: str(s.name),
      name: str(s.name),
      team: str(s.team),
      division: str(s.division),
      class: str(s.class),
    };
    regByHelmet.set(helmet, reg);
    registrations.push(reg);
  }

  // ---- races --------------------------------------------------------------
  const races = [];
  let nextRaceId = 1;

  for (const r of ir.races || []) {
    const flags = stageFlags(r.stage);
    const division = str(r.division);
    const groupId = str(r.groupId) || (r.isQuad ? 'quad' : r.isRelay ? 'relay' : 'usars');
    const race = {
      id: nextRaceId++,
      groupId,
      groupLabel: str(r.groupLabel) || groupId,
      division,
      class: str(r.class),
      distanceLabel: str(r.distanceLabel),
      dayIndex: Number(r.dayIndex || 0),
      stage: flags.stage,
      heatNumber: flags.isFinal ? 0 : Number(r.heatNumber || 0),
      isFinal: flags.isFinal,
      // countsForOverall means "counts toward ITS overall", not just the USARS
      // individual one:
      //   - individual: raceCountsForUsarsStandardOverall() already excludes
      //     quad/open/time-trial, so quads must KEEP this true or
      //     computeQuadStandings() (which requires it) yields nothing.
      //   - relays: usarsScoring does NOT exclude them and their laneEntries are
      //     TEAMS, so they must stay false or they'd corrupt individual standings.
      countsForOverall: flags.countsForOverall && !r.isOpen && !r.isRelay,
      isQuadRace: !!r.isQuad,
      isRelayRace: !!r.isRelay,
      isOpenRace: !!r.isOpen,
      isAdditional: !!r.isAdditional,
      // Scoring requires 'closed'. An imported meet is a finished meet.
      status: str(r.status) || 'closed',
      resultsMode: r.isRelay ? 'places' : undefined,
      laneEntries: [],
    };

    const seen = new Set();
    let lane = 0;
    for (const e of r.entries || []) {
      lane += 1;
      const helmet = helmetKey(e.helmet);
      const reg = helmet ? regByHelmet.get(helmet) : null;

      if (helmet && !reg) {
        warnings.push({
          type: 'entry_helmet_not_registered',
          helmet, division, distance: race.distanceLabel, stage: race.stage,
        });
      }
      if (helmet && seen.has(helmet)) {
        warnings.push({
          type: 'duplicate_helmet_in_race',
          helmet, division, distance: race.distanceLabel, stage: race.stage,
        });
      }
      if (helmet) seen.add(helmet);

      race.laneEntries.push({
        // Lane is positional, NOT the real draw. Heats/semis lane assignment does
        // not affect scoring (standings read .place only), so we synthesize it to
        // keep the model complete; real lane data can replace it later.
        lane: e.lane != null ? Number(e.lane) : (syntheticLanes ? lane : null),
        laneIsSynthetic: e.lane == null && syntheticLanes,
        helmetNumber: helmet,
        registrationId: reg ? reg.id : null,
        skaterName: reg ? reg.skaterName : str(e.name),
        team: reg ? reg.team : str(e.team),
        // SSM stores place as a STRING ("1","2"…); '' means no result.
        place: str(e.place),
        status: str(e.status),
        time: str(e.time),
      });
    }

    races.push(race);
  }

  const meet = {
    id: meetIn.id || 'imported',
    meetName: str(meetIn.name) || 'Imported Meet',
    dates: meetIn.dates || '',
    tiebreaker: meetIn.tiebreaker || 'sr832',
    lanes: Number(meetIn.lanes || 0) || undefined,
    trackLength: meetIn.trackLength || undefined,
    registrations,
    races,
    blocks: [],
    timeTrialEvents: [],
    imported: true,
  };

  const stats = {
    skaters: registrations.length,
    races: races.length,
    finals: races.filter(r => r.isFinal).length,
    heats: races.filter(r => r.stage === 'heat').length,
    semis: races.filter(r => r.stage === 'semi').length,
    quadRaces: races.filter(r => r.isQuadRace).length,
    relayRaces: races.filter(r => r.isRelayRace).length,
    scoringRaces: races.filter(r => r.isFinal && r.countsForOverall && !r.isQuadRace && !r.isOpenRace).length,
    placedEntries: races.reduce((n, r) => n + r.laneEntries.filter(e => e.place).length, 0),
  };

  return { meet, warnings, stats };
}

module.exports = { buildMeetFromIR, stageFlags };
