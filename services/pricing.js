function moneyNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function countSelectedEventCategories(options = {}) {
  const opts = options || {};
  let count = 0;

  if (opts.novice) count += 1;
  if (opts.elite) count += 1;
  if (opts.open) count += 1;
  if (opts.quad) count += 1;
  if (opts.timeTrials) count += 1;
  if (opts.skateability || opts.additionalRace) count += 1;

  if (opts.relay2Person) count += 1;
  if (opts.relay3Person) count += 1;
  if (opts.relay4Person) count += 1;

  // Backward compatibility for older registrations that only had a generic relays flag.
  if (opts.relays && !opts.relay2Person && !opts.relay3Person && !opts.relay4Person) {
    count += 1;
  }

  return count;
}

function calcRegistrationCost(meet = {}, options = {}) {
  const baseFee = moneyNumber(meet.baseEntryFee);
  const additionalFee = moneyNumber(meet.additionalRaceFee);
  const selectedCount = countSelectedEventCategories(options);

  let total = baseFee;

  if (selectedCount > 1) {
    total += (selectedCount - 1) * additionalFee;
  }

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
};
