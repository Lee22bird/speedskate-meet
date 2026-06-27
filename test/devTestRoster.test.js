const test = require('node:test');
const assert = require('node:assert/strict');
const { DEV_TEST_COHORTS, buildDevelopmentTestRoster } = require('../services/devTestRoster');

test('development roster includes race-sizing foundation cohorts', () => {
  const roster = buildDevelopmentTestRoster();
  const expectedCount = DEV_TEST_COHORTS.reduce((sum, cohort) => sum + cohort.count, 0);
  assert.equal(roster.length, expectedCount);
  assert.deepEqual(DEV_TEST_COHORTS.map(cohort =>
    roster.filter(row => row.testCohort === cohort.key).length
  ), [6, 7, 8, 12, 14, 7]);
});

test('development roster has unique identities and valid race entries', () => {
  const roster = buildDevelopmentTestRoster();
  assert.equal(new Set(roster.map(row => row.name)).size, roster.length);
  assert.equal(new Set(roster.map(row => row.helmetNumber)).size, roster.length);
  assert.ok(roster.every(row => row.name && row.team && row.age > 0));
  assert.ok(roster.every(row => row.options.length === 1 && ['novice', 'elite'].includes(row.options[0])));
});
