const { test } = require('node:test');
const assert = require('node:assert');

const {
  calcRegistrationCost,
  countSelectedEventCategories,
} = require('../services/pricing');
const { buildCostWidget } = require('../services/pricingUi');

test('$40 base plus novice, elite, and quad at $10 each totals $60', () => {
  const meet = {
    baseEntryFee: 40,
    additionalRaceFee: 10,
    maxRegistrationFee: 0,
  };
  const options = { novice: true, elite: true, quad: true };

  assert.strictEqual(countSelectedEventCategories(options), 3);
  assert.strictEqual(calcRegistrationCost(meet, options), 60);
});

test('base covers only the first event and every later category is charged', () => {
  const meet = { baseEntryFee: 40, additionalRaceFee: 10 };

  assert.strictEqual(calcRegistrationCost(meet, { novice: true }), 40);
  assert.strictEqual(calcRegistrationCost(meet, { novice: true, elite: true }), 50);
  assert.strictEqual(calcRegistrationCost(meet, { novice: true, elite: true, quad: true }), 60);
  assert.strictEqual(calcRegistrationCost(meet, { novice: true, elite: true, quad: true, open: true }), 70);
});

test('maximum registration cap is the only setting that can reduce the uncapped total', () => {
  const meet = { baseEntryFee: 40, additionalRaceFee: 10, maxRegistrationFee: 50 };
  assert.strictEqual(calcRegistrationCost(meet, { novice: true, elite: true, quad: true }), 50);
});

test('additional-race aliases count once and quad relay categories are charged', () => {
  assert.strictEqual(countSelectedEventCategories({ additional: true, skateability: true }), 1);
  assert.strictEqual(countSelectedEventCategories({ quadRelay2Person: true, quadRelay3Person: true }), 2);
});

test('challenge up is charged as one additional event category', () => {
  const meet = { baseEntryFee: 40, additionalRaceFee: 10 };
  assert.strictEqual(calcRegistrationCost(meet, { elite: true, challengeUp: true }), 50);
});

test('specific relay event ids count every selected relay division', () => {
  const meet = { baseEntryFee: 40, additionalRaceFee: 10 };
  const options = {
    relayEventIds: ['r2_freshman_boys', 'r2_freshman_mixed'],
  };

  assert.strictEqual(countSelectedEventCategories(options), 2);
  assert.strictEqual(calcRegistrationCost(meet, options), 50);
});

test('specific relay event ids do not double-count broad compatibility flags', () => {
  const options = {
    relayEventIds: ['r2_freshman_boys', 'r2_freshman_mixed'],
    relay2Person: true,
    relays: true,
  };

  assert.strictEqual(countSelectedEventCategories(options), 2);
});

test('specific quad relay event ids count every selected quad relay division', () => {
  const options = {
    quadRelayEventIds: ['q2_freshman_boys', 'q2_freshman_mixed'],
    quadRelay2Person: true,
  };

  assert.strictEqual(countSelectedEventCategories(options), 2);
});

test('registration preview includes all server-side toggle categories and explicit arithmetic', () => {
  const html = buildCostWidget(40, 10, 0);
  assert.match(html, /quadRelay2Person/);
  assert.match(html, /quadRelay3Person/);
  assert.match(html, /base \+ /);
  assert.match(html, /additional = /);
});
