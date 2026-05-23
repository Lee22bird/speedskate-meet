function feeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function calcRegistrationCost(meet = {}, options = {}) {
  const opts = options || {};
  let total = feeNumber(meet.baseEntryFee);

  if (opts.skateability) total += feeNumber(meet.additionalRaceFee);
  if (opts.relay2Person) total += feeNumber(meet.relay2PersonFee);
  if (opts.relay3Person) total += feeNumber(meet.relay3PersonFee);
  if (opts.relay4Person) total += feeNumber(meet.relay4PersonFee);

  // Legacy compatibility: old registrations may only have `relays: true`.
  // If no specific relay type is selected, fall back to the old relayEventFee if present.
  if (opts.relays && !opts.relay2Person && !opts.relay3Person && !opts.relay4Person) {
    total += feeNumber(meet.relayEventFee);
  }

  const maxFee = feeNumber(meet.maxRegistrationFee);
  if (maxFee > 0) total = Math.min(total, maxFee);

  return total;
}

function calculateRegistrationTotal(meet = {}, reg = {}) {
  return calcRegistrationCost(meet, reg.options || {});
}

module.exports = {
  calcRegistrationCost,
  calculateRegistrationTotal,
};
