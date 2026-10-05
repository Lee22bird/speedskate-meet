const test = require('node:test');
const assert = require('node:assert/strict');

const {
  usarsAge,
  ageForReg,
  competitiveYearCutoffYear,
  baseGroups,
  findAgeGroup,
} = require('../services/meetHelpers');

test('SSM competitive year cutoff advances on September 1', () => {
  assert.equal(competitiveYearCutoffYear('2026-08-31'), 2026);
  assert.equal(competitiveYearCutoffYear('2026-09-01'), 2027);
  assert.equal(competitiveYearCutoffYear('2026-10-04'), 2027);
  assert.equal(competitiveYearCutoffYear('2027-08-31'), 2027);
  assert.equal(competitiveYearCutoffYear('2027-09-01'), 2028);
});

test('SSM places a September birthday skater in Freshman for October meets', () => {
  const meet = { date: '2026-10-04', groups: baseGroups() };
  const age = ageForReg({ birthdate: '2014-09-11', age: 11 }, meet);
  const group = findAgeGroup(meet.groups, age, 'male');

  assert.equal(age, 12);
  assert.equal(group?.label, 'Freshman Boys');
});

test('SSM places the same skater in Elementary before the September rollover', () => {
  const meet = { date: '2026-08-31', groups: baseGroups() };
  const age = ageForReg({ birthdate: '2014-09-11', age: 12 }, meet);
  const group = findAgeGroup(meet.groups, age, 'male');

  assert.equal(age, 11);
  assert.equal(group?.label, 'Elementary Boys');
});

test('SSM January through August meets remain in the same competitive year', () => {
  assert.equal(usarsAge('2014-09-11', '2027-03-15'), 12);
});

test('SSM invalid birthdates fall back to stored age in ageForReg', () => {
  assert.equal(usarsAge('bad-date', '2026-10-04'), null);
  assert.equal(ageForReg({ birthdate: 'bad-date', age: 9 }, { date: '2026-10-04' }), 9);
});
