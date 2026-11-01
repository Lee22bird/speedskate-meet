function moneyNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function uniqueSelectedValues(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(
    values
      .map(v => String(v || '').trim())
      .filter(Boolean)
  ));
}

function countSelectedEventCategories(options = {}) {
  const opts = options || {};
  let count = 0;
  const relayEventIds = uniqueSelectedValues(opts.relayEventIds || opts.relayDivisionIds);
  const quadRelayEventIds = uniqueSelectedValues(opts.quadRelayEventIds || opts.quadRelayDivisionIds);

  if (opts.novice) count += 1;
  if (opts.elite) count += 1;
  // Challenge Up is an additional entered division, not a standalone class.
  // Count it once so a base division plus Challenge Up receives the same
  // additional-event fee as any other extra entry.
  if (opts.challengeUp) count += 1;
  if (opts.open) count += 1;
  if (opts.quad) count += 1;
  if (opts.timeTrials) count += 1;
  // These are compatibility aliases for the same single event category.
  if (opts.additional || opts.skateability || opts.additionalRace) count += 1;
  if (Array.isArray(opts.specialRaceIds)) count += opts.specialRaceIds.length;

  const inlineRelaySizes = new Set();
  if (opts.relay2Person) inlineRelaySizes.add(2);
  if (opts.relay3Person) inlineRelaySizes.add(3);
  if (opts.relay4Person) inlineRelaySizes.add(4);
  count += relayEventIds.length || inlineRelaySizes.size;

  const quadRelaySizes = new Set();
  if (opts.quadRelay2Person) quadRelaySizes.add(2);
  if (opts.quadRelay3Person) quadRelaySizes.add(3);
  count += quadRelayEventIds.length || quadRelaySizes.size;

  // Backward compatibility for older registrations that only had a generic relays flag.
  if (opts.relays && !relayEventIds.length && !inlineRelaySizes.size &&
      !quadRelayEventIds.length && !quadRelaySizes.size) {
    count += 1;
  }

  return count;
}

function calcRegistrationCost(meet = {}, options = {}) {
  const baseFee = moneyNumber(meet.baseEntryFee);
  const additionalFee = moneyNumber(meet.additionalRaceFee);
  const selectedCount = countSelectedEventCategories(options);

  // The base registration covers exactly one selected event category. Every
  // category after that is charged once at the additional-event rate.
  const additionalEventCount = Math.max(0, selectedCount - 1);
  let total = baseFee + (additionalEventCount * additionalFee);

  const maxFee = moneyNumber(meet.maxRegistrationFee);
  if (maxFee > 0) total = Math.min(total, maxFee);

  return total;
}

function calculateRegistrationTotal(meet = {}, reg = {}) {
  return calcRegistrationCost(meet, reg.options || {});
}

module.exports = {
  calcRegistrationCost,
  calculateRegistrationTotal,
  countSelectedEventCategories,
  uniqueSelectedValues,
};
