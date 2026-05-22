const GLOBAL_PRICING_FIELDS = [
  'baseEntryFee',
  'noviceEventFee',
  'eliteEventFee',
  'openEventFee',
  'quadEventFee',
  'relayEventFee',
  'timeTrialEventFee',
  'additionalRaceFee',
  'maxRegistrationFee',
];

function toMoneyNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function defaultPricingFields() {
  return GLOBAL_PRICING_FIELDS.reduce((out, field) => {
    out[field] = 0;
    return out;
  }, {});
}

function normalizeMeetPricingFields(meet) {
  if (!meet || typeof meet !== 'object') return meet;

  for (const field of GLOBAL_PRICING_FIELDS) {
    meet[field] = toMoneyNumber(meet[field]);
  }

  return meet;
}

module.exports = {
  GLOBAL_PRICING_FIELDS,
  defaultPricingFields,
  normalizeMeetPricingFields,
  toMoneyNumber,
};
