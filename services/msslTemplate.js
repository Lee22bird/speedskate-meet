// Mid South Speed League office race template.
// Source: "MSSL Info" league-office schedule supplied August 2026.
// Keep this separate from the full USARS/Nationals tables: MSSL intentionally
// combines age bands and genders that Nationals keeps separate.

const MSSL_TEMPLATE_VERSION = 1;

const MSSL_INLINE_CONFIG = {
  primary_girls: {
    elite: { ages: '6-7', distances: ['200m', '300m', '400m'] },
  },
  primary_boys: {
    elite: { ages: '6-7', distances: ['200m', '300m', '400m'] },
  },
  juvenile_girls: {
    novice: { ages: '9 & under', raceLabel: 'Juvenile (9 and under) Girls', distances: ['200m', '300m'] },
    elite: { ages: '8-9', distances: ['200m', '300m', '500m'] },
  },
  juvenile_boys: {
    novice: { ages: '9 & under', raceLabel: 'Juvenile (9 and under) Boys', distances: ['200m', '300m'] },
    elite: { ages: '8-9', distances: ['200m', '300m', '500m'] },
  },
  elementary_girls: {
    novice: { ages: '10-11', distances: ['300m', '500m'] },
    elite: { ages: '10-11', distances: ['300m', '500m', '700m'] },
  },
  elementary_boys: {
    novice: { ages: '10-11', distances: ['300m', '500m'] },
    elite: { ages: '10-11', distances: ['300m', '500m', '700m'] },
  },
  freshman_girls: {
    novice: { ages: '12-13', distances: ['300m', '500m'] },
    elite: { ages: '12-13', distances: ['300m', '500m', '1000m'] },
  },
  freshman_boys: {
    novice: { ages: '12-13', distances: ['300m', '500m'] },
    elite: { ages: '12-13', distances: ['300m', '500m', '1000m'] },
  },
  sophomore_girls: {
    novice: { ages: '14-15', raceLabel: 'Sophomore (14-15) Ladies', distances: ['500m', '1000m'] },
    elite: { ages: '14-15', raceLabel: 'Sophomore Ladies', distances: ['500m', '1000m', '1500m'] },
  },
  sophomore_boys: {
    novice: { ages: '14-17', raceLabel: 'Sophomore (14-15) & Junior Men', distances: ['500m', '1000m'] },
    elite: { ages: '14-15', raceLabel: 'Sophomore Men', distances: ['500m', '1000m', '1500m'] },
  },
  junior_women: {
    novice: { ages: '16-24', raceLabel: 'Junior (16-17) & Senior Ladies', distances: ['500m', '1000m'] },
    elite: { ages: '16-17', raceLabel: 'Junior Ladies', distances: ['500m', '1000m', '1500m'] },
  },
  junior_men: {
    elite: { ages: '16-17', distances: ['500m', '1000m', '2000m'] },
  },
  senior_women: {
    elite: { ages: '18-24', raceLabel: 'Senior Ladies', distances: ['500m', '1000m', '2000m'] },
  },
  senior_men: {
    elite: { ages: '18-24', distances: ['500m', '1500m', '3000m'] },
  },
  classic_women: {
    elite: { ages: '25-34', raceLabel: 'Classic Ladies', distances: ['500m', '1000m', '1500m'] },
  },
  classic_men: {
    elite: { ages: '25-34', distances: ['500m', '1000m', '2000m'] },
  },
  master_women: {
    elite: { ages: '35-44', distances: ['500m', '700m', '1000m'] },
  },
  master_men: {
    novice: { ages: '35 & older', raceLabel: 'Master Men (35 and up)', distances: ['500m', '1000m'] },
    elite: { ages: '35-44', distances: ['500m', '1000m', '1500m'] },
  },
  veteran_women: {
    elite: { ages: '45-54', distances: ['500m', '700m', '1000m'] },
  },
  veteran_men: {
    elite: { ages: '45-54', distances: ['500m', '700m', '1000m'] },
  },
  esquire_men: {
    elite: { ages: '55 & older', distances: ['500m', '700m', '1000m'] },
  },
};

const MSSL_QUAD_GROUPS = [
  { id: 'mssl_quad_juvenile_girls', label: 'Quad Juvenile Girls', ages: '9 & under', gender: 'girls', distances: ['200m', '500m'] },
  { id: 'mssl_quad_juvenile_boys', label: 'Quad Juvenile Boys', ages: '9 & under', gender: 'boys', distances: ['200m', '500m'] },
  { id: 'mssl_quad_freshman_girls', label: 'Quad Freshman Girls', ages: '10-13', gender: 'girls', distances: ['300m', '500m'] },
  { id: 'mssl_quad_freshman_boys', label: 'Quad Freshman Boys', ages: '10-13', gender: 'boys', distances: ['300m', '500m'] },
  { id: 'mssl_quad_senior_ladies', label: 'Quad Senior Ladies', ages: '14-34', gender: 'women', distances: ['500m', '1000m'] },
  { id: 'mssl_quad_senior_men', label: 'Quad Senior Men', ages: '14-34', gender: 'men', distances: ['500m', '1000m'] },
  { id: 'mssl_quad_master_ladies', label: 'Quad Master Ladies', ages: '35 & older', gender: 'women', distances: ['500m', '700m'] },
  { id: 'mssl_quad_master_men', label: 'Quad Master Men', ages: '35 & older', gender: 'men', distances: ['500m', '700m'] },
];

const MSSL_OPEN_GROUPS = [
  { id: 'open_juv_girls', label: 'Juvenile Girls', ages: '9 & under', gender: 'girls', distance: '1500m' },
  { id: 'open_juv_boys', label: 'Juvenile Boys', ages: '9 & under', gender: 'boys', distance: '1500m' },
  { id: 'open_fresh_girls', label: 'Freshman Girls', ages: '10-13', gender: 'girls', distance: '2000m' },
  { id: 'open_fresh_boys', label: 'Freshman Boys', ages: '10-13', gender: 'boys', distance: '2000m' },
  { id: 'open_sr_ladies', label: 'Senior Ladies', ages: '14-34', gender: 'women', distance: '3000m' },
  { id: 'open_sr_men', label: 'Senior Men', ages: '14-34', gender: 'men', distance: '5000m' },
  { id: 'open_mast_ladies', label: 'Master Ladies', ages: '35 & older', gender: 'women', distance: '1500m' },
  { id: 'open_mast_men', label: 'Master Men', ages: '35 & older', gender: 'men', distance: '2000m' },
];

const MSSL_RELAY_DIVISIONS = [
  { id: 'mssl_r3_juvenile', size: 3, label: 'Juvenile 3 Person', ageRange: '9 & under', gender: 'open', distance: '900m', notes: '1 lap 3 times each' },
  { id: 'mssl_r3_freshman', size: 3, label: 'Freshman 3 Person', ageRange: '10-13', gender: 'open', distance: '900m', notes: '1 lap 3 times each' },
  { id: 'mssl_r3_senior', size: 3, label: 'Senior 3 Person', ageRange: '14-34', gender: 'open', distance: '900m', notes: '1 lap 3 times each' },
  { id: 'mssl_r3_master', size: 3, label: 'Master 3 Person', ageRange: '35 & older', gender: 'open', distance: '900m', notes: '1 lap 3 times each' },
  { id: 'mssl_r2_juvenile', size: 2, label: 'Juvenile 2 Person', ageRange: '9 & under', gender: 'open', distance: '1200m', notes: '2 laps 3 times each' },
  { id: 'mssl_r2_freshman', size: 2, label: 'Freshman 2 Person', ageRange: '10-13', gender: 'open', distance: '1200m', notes: '2 laps 3 times each' },
  { id: 'mssl_r2_senior', size: 2, label: 'Senior 2 Person', ageRange: '14-34', gender: 'open', distance: '1200m', notes: '2 laps 3 times each' },
  { id: 'mssl_r2_master', size: 2, label: 'Master 2 Person', ageRange: '35 & older', gender: 'open', distance: '1200m', notes: '2 laps 3 times each' },
  { id: 'mssl_r4_juvenile', size: 4, label: 'Juvenile 4 Person', ageRange: '9 & under', gender: 'open', distance: '1200m', notes: '3 laps 1 time each' },
  { id: 'mssl_r4_freshman', size: 4, label: 'Freshman 4 Person', ageRange: '10-13', gender: 'open', distance: '2000m', notes: '5 laps 1 time each' },
  { id: 'mssl_r4_senior', size: 4, label: 'Senior 4 Person', ageRange: '14-34', gender: 'open', distance: '2000m', notes: '5 laps 1 time each' },
  { id: 'mssl_r4_master', size: 4, label: 'Master 4 Person', ageRange: '35 & older', gender: 'open', distance: '2000m', notes: '5 laps 1 time each' },
].map(row => ({ ...row, discipline: 'inline', ruleset: 'mssl' }));

const MSSL_FIRST_ELITE_GROUPS = new Set([
  'primary_girls', 'primary_boys',
  'elementary_girls', 'elementary_boys',
  'sophomore_girls', 'sophomore_boys',
  'senior_women', 'senior_men',
  'master_women', 'master_men',
]);

function isMsslPresetName(value) {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return key.startsWith('mssl') || key.startsWith('midsouthspeedleague') || key.startsWith('midsouthleague');
}

module.exports = {
  MSSL_TEMPLATE_VERSION,
  MSSL_INLINE_CONFIG,
  MSSL_QUAD_GROUPS,
  MSSL_OPEN_GROUPS,
  MSSL_RELAY_DIVISIONS,
  MSSL_FIRST_ELITE_GROUPS,
  isMsslPresetName,
};
