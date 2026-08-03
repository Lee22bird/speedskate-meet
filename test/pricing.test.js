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

test('registration preview includes all server-side toggle categories and explicit arithmetic', () => {
  const html = buildCostWidget(40, 10, 0);
  assert.match(html, /quadRelay2Person/);
  assert.match(html, /quadRelay3Person/);
  assert.match(html, /base \+ /);
  assert.match(html, /additional = /);
});
