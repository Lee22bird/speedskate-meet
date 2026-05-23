const ACTIVE_PRICING_FIELDS = [
  'baseEntryFee',
  'additionalRaceFee',
  'maxRegistrationFee',
];

const LEGACY_PRICING_FIELDS = [
  'noviceEventFee',
  'eliteEventFee',
  'openEventFee',
  'quadEventFee',
  'relayEventFee',
  'timeTrialEventFee',
  'relay2PersonFee',
  'relay3PersonFee',
  'relay4PersonFee',
];

const GLOBAL_PRICING_FIELDS = [
  ...ACTIVE_PRICING_FIELDS,
  ...LEGACY_PRICING_FIELDS,
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
  ACTIVE_PRICING_FIELDS,
  LEGACY_PRICING_FIELDS,
  GLOBAL_PRICING_FIELDS,
  defaultPricingFields,
  normalizeMeetPricingFields,
  toMoneyNumber,
};
