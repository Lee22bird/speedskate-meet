// Quad relay foundation: division data + makeRelayRace quad support.
// Quad relays are a nationals/regionals discipline (leagues don't run them).
// They are placement-only, exactly like inline relays — never scoring an overall.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RELAY_DIVISIONS,
  QUAD_RELAY_DIVISIONS,
  ALL_RELAY_DIVISIONS,
  RELAY_DIVISION_BY_ID,
  relayDivisionsForDiscipline,
} = require('../services/relayDivisions');
const { makeRelayRace } = require('../services/relayHelpers');

test('quad relay divisions: 26 seeded from the Nationals data, all tagged quad', () => {
  assert.equal(QUAD_RELAY_DIVISIONS.length, 26);
  assert.ok(QUAD_RELAY_DIVISIONS.every(d => d.discipline === 'quad'));
  // sizes present: 2-person and 3-person only (no 4-person quad relays at Nationals)
  assert.deepEqual([...new Set(QUAD_RELAY_DIVISIONS.map(d => d.size))].sort(), [2, 3]);
});

test('inline relay divisions stay inline-tagged with no quad leakage', () => {
  assert.ok(RELAY_DIVISIONS.length > 0);
  assert.ok(RELAY_DIVISIONS.every(d => d.discipline === 'inline'));
  assert.ok(RELAY_DIVISIONS.every(d => !d.id.startsWith('q')));
  assert.ok(!RELAY_DIVISIONS.some(d => QUAD_RELAY_DIVISIONS.includes(d)), 'no quad division leaked into the inline list');
});

test('specific quad divisions match the official distances', () => {
  const byId = RELAY_DIVISION_BY_ID;
  assert.equal(byId.get('q2_senior_men').distance, '5000m');
  assert.equal(byId.get('q2_senior_men').gender, 'boys');
  assert.equal(byId.get('q2_juvenile_girls').distance, '1200m');
  assert.equal(byId.get('q3_masters_ladies').distance, '1500m');
  assert.equal(byId.get('q3_senior_mixed').gender, 'mixed');
});

test('relayDivisionsForDiscipline splits inline vs quad; defaults to inline', () => {
  assert.equal(relayDivisionsForDiscipline('quad').length, 26);
  assert.equal(relayDivisionsForDiscipline('inline').length, RELAY_DIVISIONS.length);
  assert.equal(relayDivisionsForDiscipline().length, RELAY_DIVISIONS.length);
  assert.equal(ALL_RELAY_DIVISIONS.length, RELAY_DIVISIONS.length + QUAD_RELAY_DIVISIONS.length);
});

test('makeRelayRace(quad) marks the discipline but stays a placement-only relay', () => {
  const q = makeRelayRace({ name: 'Senior 2 Men', distance: '5000m', quad: true });
  assert.equal(q.isQuadRace, true);
  assert.equal(q.isRelayRace, true);
  assert.equal(q.countsForOverall, false, 'quad relays never score an overall');
  assert.equal(q.resultsMode, 'places');
  assert.equal(q.isFinal, true);
});

test('makeRelayRace default stays inline (back-compat)', () => {
  const inline = makeRelayRace({ name: 'Senior 2 Men', distance: '5000m' });
  assert.equal(inline.isQuadRace, false);
  assert.equal(inline.isRelayRace, true);
});
