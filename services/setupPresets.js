// Applying a saved setup preset to a meet. Extracted from the Meet Builder's
// setup-presets/load route so the website and the app's additive endpoint share
// ONE implementation — the website wraps this with saveMeetIdentityFields (its
// form carries the whole builder), while the app calls it alone because its
// endpoints never send identity fields.
//
// This copies a preset's RACING SETUP only (divisions, opens, quads, additionals,
// relays, pricing, lanes/track, blocks). It never touches meet identity — name,
// dates, venue, status, notes — and never touches registrations.

const { nowIso } = require('../utils/date');
const {
  applyDivisionScheme, generateConfiguredRacesForMeet, restorePresetBlocksIntoMeet,
  makeAdditionalRaceSlots, ensureRegistrationTotalsAndNumbers,
} = require('./meetHelpers');
const { rebuildRaceAssignmentsSafe } = require('./ttHelpers');
const { generateScheduleBlocks } = require('./scheduleGenerator');
const { ensureCurrentRace } = require('./raceDay');
const { isMsslPresetName } = require('./msslTemplate');

/// Apply `preset` to `meet` in place. `onBeforeRegen` fires immediately before
/// races are regenerated (the callers use it to take a desktop backup).
function applySetupPresetToMeet(meet, preset, { onBeforeRegen } = {}) {
  if (!meet) throw new Error('Meet not found.');
  if (!preset) throw new Error('Setup preset not found.');
  const loadAsMssl = preset.divisionScheme === 'mssl' || isMsslPresetName(preset.name);
  meet.divisionScheme = loadAsMssl ? 'mssl' : (preset.divisionScheme || meet.divisionScheme || (meet.usarsDivisions ? 'usars' : 'standard'));
  meet.usarsDivisions = meet.divisionScheme === 'usars';
  meet.relayRuleset = loadAsMssl ? 'mssl' : (preset.relayRuleset || meet.relayRuleset || 'usars');

  // Copy only allowed fields from preset into meet
  meet.groups = JSON.parse(JSON.stringify(preset.groups || []));
  meet.openGroups = JSON.parse(JSON.stringify(preset.openGroups || []));
  meet.quadGroups = JSON.parse(JSON.stringify(preset.quadGroups || []));
  meet.additionalGroups = JSON.parse(JSON.stringify(preset.additionalGroups || preset.additionalRaceGroups || preset.additionalRaces || preset.skateabilityGroups || []));
  meet.additionalRaces = meet.additionalGroups.map(g => ({ ...g }));
  meet.additionalRaceGroups = meet.additionalGroups.map(g => ({ ...g }));
  meet.skateabilityGroups = meet.additionalGroups.map(g => ({ ...g }));
  meet.tiebreaker = preset.tiebreaker || meet.tiebreaker;
  meet.baseEntryFee = Number(preset.baseEntryFee || 0);
  // Load new global pricing fields with migration from old per-group costs
  if(preset.noviceEventFee !== undefined) {
    meet.noviceEventFee = Number(preset.noviceEventFee || 0);
  } else {
    // Migration: extract from first group with novice cost
    const oldCost = (preset.groups||[]).reduce((c,g)=>g.divisions?.novice?.cost||c,0);
    meet.noviceEventFee = Number(oldCost || 0);
  }
  if(preset.eliteEventFee !== undefined) {
    meet.eliteEventFee = Number(preset.eliteEventFee || 0);
  } else {
    // Migration: extract from first group with elite cost
    const oldCost = (preset.groups||[]).reduce((c,g)=>g.divisions?.elite?.cost||c,0);
    meet.eliteEventFee = Number(oldCost || 0);
  }
  meet.openEventFee = Number(preset.openEventFee || 0);
  meet.quadEventFee = Number(preset.quadEventFee || 0);
  meet.relayEventFee = Number(preset.relayEventFee || 0);
  meet.timeTrialEventFee = Number(preset.timeTrialEventFee || 0);
  meet.additionalRaceFee = Number(preset.additionalRaceFee || 0);
  meet.maxRegistrationFee = Number(preset.maxRegistrationFee || 0);
  meet.trackLength = preset.trackLength || meet.trackLength;
  const presetLaneCount = Number(preset.lanes);
  if (Number.isFinite(presetLaneCount) && presetLaneCount > 0) meet.lanes = presetLaneCount;
  const presetTrackLength = Number(preset.trackLength);
  if (Number.isFinite(presetTrackLength) && presetTrackLength > 0) meet.trackLength = presetTrackLength;
  meet.timeTrialsEnabled = !!preset.timeTrialsEnabled;
  meet.relayTemplates = JSON.parse(JSON.stringify(preset.relayTemplates || meet.relayTemplates || []));
  const presetRelayRaces = Array.isArray(preset.relayRaces) ? JSON.parse(JSON.stringify(preset.relayRaces)) : [];
  meet.relayEnabled = !!preset.relayEnabled || presetRelayRaces.length > 0;
  meet.judgesPanelRequired = !!preset.judgesPanelRequired;

  // Named legacy MSSL presets predate the dedicated ruleset and may contain
  // Nationals quad/relay rows. Refresh their racing structure from the exact
  // league-office template while retaining pricing and meet identity.
  if (loadAsMssl) applyDivisionScheme(meet, 'mssl');

  // Presets should restore the director's relay races too. Relay Builder creates
  // actual race shells, so saving only relayEnabled was not enough for templates.
  if (!loadAsMssl) {
    meet.races = (meet.races || []).filter(r => !r.isRelayRace);
    for (const relay of presetRelayRaces) {
      relay.isRelayRace = true;
      relay.division = relay.division || 'relay';
      relay.status = relay.status || 'open';
      relay.laneEntries = Array.isArray(relay.laneEntries) ? relay.laneEntries : [];
      meet.races.push(relay);
    }
  }

  // Presets should restore the director's block layout, not erase it.
  // Rebuild race structure from the preset settings using the configured generator,
  // then map saved block raceIds onto the current meet's race IDs wherever possible.
  if (typeof onBeforeRegen === 'function') onBeforeRegen();
  generateConfiguredRacesForMeet(meet);
  rebuildRaceAssignmentsSafe(meet);
  if (loadAsMssl) {
    meet.blocks = generateScheduleBlocks(meet, { mode: 'replace', style: 'league' }).blocks;
  } else {
    restorePresetBlocksIntoMeet(preset, meet);
  }

  // Mirror Additionals into compatibility aliases for existing saved data.
  meet.additionalGroups = makeAdditionalRaceSlots(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups);
  meet.additionalRaces = meet.additionalGroups.map(g => ({ ...g }));
  meet.additionalRaceGroups = meet.additionalGroups.map(g => ({ ...g }));
  meet.skateabilityGroups = meet.additionalGroups.map(g => ({ ...g }));
  // Preset pricing can change global fees, so refresh existing registration totals immediately.
  ensureRegistrationTotalsAndNumbers(meet);
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  return meet;
}

module.exports = { applySetupPresetToMeet };
