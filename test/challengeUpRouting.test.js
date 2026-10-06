const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findChallengeUpGroup,
  registrationMatchesStandardRace,
} = require('../services/meetHelpers');

const standardGroups = [
  { id: 'junior_women', label: 'Junior Women', ages: '16-17', gender: 'women' },
  { id: 'senior_women', label: 'Senior Women', ages: '18-24', gender: 'women' },
];

const msslGroups = [
  { id: 'junior_ladies', label: 'Junior Ladies', ages: '16-17', gender: 'women' },
  { id: 'senior_ladies', label: 'Senior Ladies', ages: '18-24', gender: 'women' },
];

for (const [scheme, groups, juniorId, seniorId, division] of [
  ['standard', standardGroups, 'junior_women', 'senior_women', 'Senior Women'],
  ['mssl', msslGroups, 'junior_ladies', 'senior_ladies', 'Senior Ladies'],
]) {
  test(`elite Challenge Up routes ${scheme} junior women into the senior race`, () => {
    const registration = {
      age: 16,
      gender: 'female',
      originalDivisionGroupId: juniorId,
      divisionGroupId: juniorId,
      options: { elite: true, challengeUp: true },
    };
    const race = {
      groupId: seniorId,
      division: 'elite',
      gender: 'women',
      ages: '18-24',
    };

    assert.equal(findChallengeUpGroup(groups, juniorId)?.id, seniorId);
    assert.equal(registrationMatchesStandardRace(registration, race, {
      divisionScheme: scheme,
      groups,
      date: '2026-10-04',
    }), true);
  });
}

