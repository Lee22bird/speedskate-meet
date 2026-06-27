const DEV_TEST_COHORTS = [
  { key: 'tiny_girls_6', count: 6, age: 5, gender: 'girls', division: 'novice' },
  { key: 'primary_boys_7', count: 7, age: 7, gender: 'boys', division: 'elite' },
  { key: 'juvenile_girls_8', count: 8, age: 9, gender: 'girls', division: 'novice' },
  { key: 'elementary_boys_12', count: 12, age: 11, gender: 'boys', division: 'elite' },
  { key: 'freshman_girls_14', count: 14, age: 13, gender: 'girls', division: 'novice' },
  { key: 'junior_men_7', count: 7, age: 16, gender: 'boys', division: 'elite' },
];

const FIRST_NAMES = [
  'Avery', 'Blake', 'Cameron', 'Dakota', 'Emerson', 'Finley',
  'Harper', 'Jordan', 'Kai', 'Logan', 'Morgan', 'Parker',
  'Quinn', 'Reese', 'Riley', 'Rowan', 'Sawyer', 'Taylor',
];

const LAST_NAMES = [
  'Adams', 'Bennett', 'Carter', 'Diaz', 'Ellis', 'Foster',
  'Garcia', 'Hayes', 'Irwin', 'Johnson', 'Kim', 'Lewis',
  'Miller', 'Nelson', 'Owens', 'Price', 'Reed', 'Sullivan',
];

const TEAMS = [
  'Midwest Racing',
  'Team United',
  'Texas Speed Club',
  'Great Skate Wolverines',
  'DFW Speed',
  'Central Florida Speed Team',
  'Badger State Racing',
  'Independent',
];

function buildDevelopmentTestRoster() {
  let index = 0;
  return DEV_TEST_COHORTS.flatMap(cohort => Array.from({ length: cohort.count }, (_, cohortIndex) => {
    const current = index++;
    return {
      name: `${FIRST_NAMES[current % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(current / FIRST_NAMES.length) % LAST_NAMES.length]}`,
      age: cohort.age,
      gender: cohort.gender,
      team: TEAMS[(cohortIndex + current) % TEAMS.length],
      helmetNumber: 101 + current,
      options: [cohort.division],
      testCohort: cohort.key,
    };
  }));
}

module.exports = {
  DEV_TEST_COHORTS,
  buildDevelopmentTestRoster,
};
