function calcRegistrationCost(meet, options = {}) {

  const base = Number(meet.baseEntryFee || 0);

  let total = base;

  if (options.novice) {

    total += Number(meet.noviceEventFee || 0);

  }

  if (options.elite) {

    total += Number(meet.eliteEventFee || 0);

  }

  if (options.open) {

    total += Number(meet.openEventFee || 0);

  }

  if (options.quad) {

    total += Number(meet.quadEventFee || 0);

  }

  if (options.relays) {

    total += Number(meet.relayEventFee || 0);

  }

  if (options.timeTrials) {

    total += Number(meet.timeTrialEventFee || 0);

  }

  if (options.skateability) {

    total += Number(meet.additionalRaceFee || 0);

  }

  const cap = Number(meet.maxRegistrationFee || 0);

  if (cap > 0) {

    total = Math.min(total, cap);

  }

  return total;

}

function calculateRegistrationTotal(meet, reg = {}) {

  return calcRegistrationCost(meet, reg.options || {});

}

module.exports = {

  calcRegistrationCost,

  calculateRegistrationTotal,

};