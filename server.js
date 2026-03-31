const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = process.env.SSM_DATA_FILE || path.join(DATA_DIR, 'ssm_db.json');

const DATA_VERSION = 16;
const SESSION_COOKIE = 'ssm_sess';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const ADMIN_USERNAME = 'Lbird22';
const ADMIN_PASSWORD = 'Redline22';

const AGE_RULES = {
  USARS: 'USARS Rule',
  MEET_DATE: 'Age on Meet Date',
  CUSTOM: 'Custom Date',
};

const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  MEET_DIRECTOR: 'meet_director',
  JUDGE: 'judge',
  ANNOUNCER: 'announcer',
  COACH: 'coach',
  CHECKIN: 'checkin',
};

const STANDARD_DIVISION_KEYS = ['novice', 'elite'];
const SPECIAL_DIVISION_KEYS = ['open', 'quad'];

const USARS_POINTS_TABLE = {
  1: 100,
  2: 90,
  3: 80,
  4: 70,
  5: 60,
  6: 50,
  7: 40,
  8: 30,
  9: 20,
  10: 10,
};

const TEAM_LIST = [
  'Independent',
  'Aurora Speed Club',
  'Astro Speed',
  'Ashland Speedskating of Virginia',
  'Badger State Racing',
  'Bell’s Speed Skating Team',
  'Capital City Racing',
  'Carolina Gold Rush',
  'CC Speed',
  'CCN Inline',
  'Central Florida Speed Team',
  'Champions Speed Skating Team',
  'Classic Speed Skate Club',
  'Cobras Speed Skating',
  'CW SpeedTeam',
  'Dairy Ashford Speed Team',
  'DFW Speed',
  'Diamond State Racing',
  'FAST Speed Team',
  'Fast Forward Racing',
  'Front Range Speed Team',
  'Frenchtown Speed Team',
  'Good Vibes Skate Company',
  'GT Speed',
  'High Point Speed Skating',
  'Infinity Racing',
  'Inside Edge Racing',
  'JKL Racing',
  'Kentucky Speed',
  'Mach Racing',
  'Mean Girls Racing',
  'Middlesex Racing Team',
  'Midland Rockets',
  'Midwest Racing',
  'National Speed Skating Circuit',
  'North Coast Inline Racing',
  'North Idaho Elite',
  'Ocala Speed Inline Racing Team',
  'Olympic Speed',
  'Omni Speed',
  'Pac West Inline Racing',
  'Phantom Racing',
  'Precision Inline',
  'Precision Racing',
  'Rocket City Speed',
  'Rollaire Speed Team',
  'Roller King Speed',
  'Simmons Racing / Simmons Rana',
  'SobeRollers',
  'SOS Racing',
  'Stallions Racing',
  'Star Skate Speed',
  'Stardust Inline Speed Skating Team',
  'Synergy Speed Skating',
  'TCK Skate Supply',
  'Team Oaks',
  'Team Velocity',
  'Team Xtreme',
  'Tennessee Speed',
  'Triad Racing',
  'Tulsa Surge Speed Skating',
  'Warrior Racing',
  'Weber’s Racing',
  'Weber’s Skateway',
  'West Michigan Wolverines Speed Team'
].sort((a, b) => a.localeCompare(b));

const OPEN_TT_GROUPS = [
  { id: 'juvenile_girls_open_tt', label: 'Juvenile Girls', gender: 'girls', minAge: 0, maxAge: 9 },
  { id: 'juvenile_boys_open_tt', label: 'Juvenile Boys', gender: 'boys', minAge: 0, maxAge: 9 },
  { id: 'freshman_girls_open_tt', label: 'Freshman Girls', gender: 'girls', minAge: 10, maxAge: 13 },
  { id: 'freshman_boys_open_tt', label: 'Freshman Boys', gender: 'boys', minAge: 10, maxAge: 13 },
  { id: 'senior_ladies_open_tt', label: 'Senior Ladies', gender: 'women', minAge: 14, maxAge: 120 },
  { id: 'senior_men_open_tt', label: 'Senior Men', gender: 'men', minAge: 14, maxAge: 120 },
  { id: 'masters_ladies_open_tt', label: 'Masters Ladies', gender: 'women', minAge: 35, maxAge: 120 },
  { id: 'masters_men_open_tt', label: 'Masters Men', gender: 'men', minAge: 35, maxAge: 120 },
];

const OPEN_BUILDER_DEFAULTS = [
  { id: 'juvenile_girls_open', label: 'Juvenile Girls Open', gender: 'girls', minAge: 0, maxAge: 9, enabled: false, distances: ['', '', '', ''] },
  { id: 'juvenile_boys_open', label: 'Juvenile Boys Open', gender: 'boys', minAge: 0, maxAge: 9, enabled: false, distances: ['', '', '', ''] },
  { id: 'freshman_girls_open', label: 'Freshman Girls Open', gender: 'girls', minAge: 10, maxAge: 13, enabled: false, distances: ['', '', '', ''] },
  { id: 'freshman_boys_open', label: 'Freshman Boys Open', gender: 'boys', minAge: 10, maxAge: 13, enabled: false, distances: ['', '', '', ''] },
  { id: 'senior_ladies_open', label: 'Senior Ladies Open', gender: 'women', minAge: 14, maxAge: 120, enabled: false, distances: ['', '', '', ''] },
  { id: 'senior_men_open', label: 'Senior Men Open', gender: 'men', minAge: 14, maxAge: 120, enabled: false, distances: ['', '', '', ''] },
  { id: 'masters_ladies_open', label: 'Masters Ladies Open', gender: 'women', minAge: 35, maxAge: 120, enabled: false, distances: ['', '', '', ''] },
  { id: 'masters_men_open', label: 'Masters Men Open', gender: 'men', minAge: 35, maxAge: 120, enabled: false, distances: ['', '', '', ''] },
];

const QUAD_BUILDER_DEFAULTS = [
  { id: 'quad_juvenile_girls', label: 'Quad Juvenile Girls', gender: 'girls', minAge: 0, maxAge: 9, enabled: false, distances: ['', '', '', ''] },
  { id: 'quad_juvenile_boys', label: 'Quad Juvenile Boys', gender: 'boys', minAge: 0, maxAge: 9, enabled: false, distances: ['', '', '', ''] },
  { id: 'quad_freshman_girls', label: 'Quad Freshman Girls', gender: 'girls', minAge: 10, maxAge: 13, enabled: false, distances: ['', '', '', ''] },
  { id: 'quad_freshman_boys', label: 'Quad Freshman Boys', gender: 'boys', minAge: 10, maxAge: 13, enabled: false, distances: ['', '', '', ''] },
  { id: 'quad_senior_ladies', label: 'Quad Senior Ladies', gender: 'women', minAge: 14, maxAge: 120, enabled: false, distances: ['', '', '', ''] },
  { id: 'quad_senior_men', label: 'Quad Senior Men', gender: 'men', minAge: 14, maxAge: 120, enabled: false, distances: ['', '', '', ''] },
];

function nowIso() {
  return new Date().toISOString();
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function nextId(arr) {
  let max = 0;
  for (const item of arr || []) max = Math.max(max, Number(item.id) || 0);
  return max + 1;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').map(s => s.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    }
  });
  return out;
}

function setCookie(res, name, value, maxAgeSec) {
  res.setHeader(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`
  );
}

function clearCookie(res, name) {
  res.setHeader(
    'Set-Cookie',
    `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function parseNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatDateHuman(value) {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function formatDateTimeHuman(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function selected(value, expected) {
  return String(value || '') === String(expected) ? 'selected' : '';
}

function checked(value) {
  return value ? 'checked' : '';
}

function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function normalizeGender(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['girl', 'girls', 'female', 'f'].includes(raw)) return 'girls';
  if (['boy', 'boys', 'male', 'm'].includes(raw)) return 'boys';
  if (['woman', 'women', 'lady', 'ladies'].includes(raw)) return 'women';
  if (['man', 'men'].includes(raw)) return 'men';
  return 'boys';
}

function ageToCompetitionGender(gender, age) {
  const g = normalizeGender(gender);
  if (g === 'girls' || g === 'boys') {
    if (Number(age) >= 14) return g === 'girls' ? 'women' : 'men';
    return g;
  }
  if (g === 'women' || g === 'men') {
    if (Number(age) <= 13) return g === 'women' ? 'girls' : 'boys';
    return g;
  }
  return g;
}

function compareBirthdateYoungestFirst(a, b) {
  const aDate = new Date(`${a.birthdate}T12:00:00`).getTime();
  const bDate = new Date(`${b.birthdate}T12:00:00`).getTime();
  return bDate - aDate;
}

function getUsarsReferenceDate(meet) {
  if (meet?.date) {
    const meetDate = new Date(`${meet.date}T12:00:00`);
    if (!Number.isNaN(meetDate.getTime())) {
      return new Date(`${meetDate.getFullYear()}-12-31T12:00:00`);
    }
  }
  const now = new Date();
  return new Date(`${now.getFullYear()}-12-31T12:00:00`);
}

function getAgeReferenceDate(meet) {
  const rule = meet?.ageRule || AGE_RULES.USARS;

  if (rule === AGE_RULES.MEET_DATE && meet?.date) {
    return new Date(`${meet.date}T12:00:00`);
  }

  if (rule === AGE_RULES.CUSTOM && meet?.customAgeCutoffDate) {
    return new Date(`${meet.customAgeCutoffDate}T12:00:00`);
  }

  return getUsarsReferenceDate(meet);
}

function getAgeOnDate(birthdate, referenceDate) {
  if (!birthdate || !referenceDate) return null;
  const dob = new Date(`${birthdate}T12:00:00`);
  const ref = new Date(referenceDate);

  if (Number.isNaN(dob.getTime()) || Number.isNaN(ref.getTime())) return null;

  let age = ref.getFullYear() - dob.getFullYear();

  const hadBirthday =
    ref.getMonth() > dob.getMonth() ||
    (ref.getMonth() === dob.getMonth() && ref.getDate() >= dob.getDate());

  if (!hadBirthday) age--;

  return age;
}

function buildDivisionTemplate() {
  return {
    enabled: false,
    cost: 0,
    distances: ['', '', '', ''],
  };
}

function buildStandardGroups() {
  const groups = [
    { id: 'tiny_tot_girls', label: 'Tiny Tot Girls', ages: '5 & under', gender: 'girls', minAge: 0, maxAge: 5 },
    { id: 'tiny_tot_boys', label: 'Tiny Tot Boys', ages: '5 & under', gender: 'boys', minAge: 0, maxAge: 5 },
    { id: 'primary_girls', label: 'Primary Girls', ages: '6-7', gender: 'girls', minAge: 6, maxAge: 7 },
    { id: 'primary_boys', label: 'Primary Boys', ages: '6-7', gender: 'boys', minAge: 6, maxAge: 7 },
    { id: 'juvenile_girls', label: 'Juvenile Girls', ages: '8-9', gender: 'girls', minAge: 8, maxAge: 9 },
    { id: 'juvenile_boys', label: 'Juvenile Boys', ages: '8-9', gender: 'boys', minAge: 8, maxAge: 9 },
    { id: 'elementary_girls', label: 'Elementary Girls', ages: '10-11', gender: 'girls', minAge: 10, maxAge: 11 },
    { id: 'elementary_boys', label: 'Elementary Boys', ages: '10-11', gender: 'boys', minAge: 10, maxAge: 11 },
    { id: 'freshman_girls', label: 'Freshman Girls', ages: '12-13', gender: 'girls', minAge: 12, maxAge: 13 },
    { id: 'freshman_boys', label: 'Freshman Boys', ages: '12-13', gender: 'boys', minAge: 12, maxAge: 13 },
    { id: 'sophomore_women', label: 'Sophomore Women', ages: '14-15', gender: 'women', minAge: 14, maxAge: 15 },
    { id: 'sophomore_men', label: 'Sophomore Men', ages: '14-15', gender: 'men', minAge: 14, maxAge: 15 },
    { id: 'junior_women', label: 'Junior Women', ages: '16-17', gender: 'women', minAge: 16, maxAge: 17 },
    { id: 'junior_men', label: 'Junior Men', ages: '16-17', gender: 'men', minAge: 16, maxAge: 17 },
    { id: 'senior_women', label: 'Senior Women', ages: '18-24', gender: 'women', minAge: 18, maxAge: 24 },
    { id: 'senior_men', label: 'Senior Men', ages: '18-24', gender: 'men', minAge: 18, maxAge: 24 },
    { id: 'classic_women', label: 'Classic Women', ages: '25-34', gender: 'women', minAge: 25, maxAge: 34 },
    { id: 'classic_men', label: 'Classic Men', ages: '25-34', gender: 'men', minAge: 25, maxAge: 34 },
    { id: 'masters_women', label: 'Masters Women', ages: '35-44', gender: 'women', minAge: 35, maxAge: 44 },
    { id: 'masters_men', label: 'Masters Men', ages: '35-44', gender: 'men', minAge: 35, maxAge: 44 },
    { id: 'veteran_women', label: 'Veteran Women', ages: '45-54', gender: 'women', minAge: 45, maxAge: 54 },
    { id: 'veteran_men', label: 'Veteran Men', ages: '45-54', gender: 'men', minAge: 45, maxAge: 54 },
    { id: 'esquire_women', label: 'Esquire Women', ages: '55-64', gender: 'women', minAge: 55, maxAge: 64 },
    { id: 'esquire_men', label: 'Esquire Men', ages: '55-64', gender: 'men', minAge: 55, maxAge: 64 },
    { id: 'premier_women', label: 'Premier Women', ages: '65 & older', gender: 'women', minAge: 65, maxAge: 120 },
    { id: 'premier_men', label: 'Premier Men', ages: '65 & older', gender: 'men', minAge: 65, maxAge: 120 },
  ];

  return groups.map(group => ({
    ...group,
    divisions: {
      novice: buildDivisionTemplate(),
      elite: buildDivisionTemplate(),
    },
  }));
}

function buildOpenBuilderDefaults() {
  return cloneDeep(OPEN_BUILDER_DEFAULTS);
}

function buildQuadBuilderDefaults() {
  return cloneDeep(QUAD_BUILDER_DEFAULTS);
}

function defaultMeet(ownerUserId) {
  return {
    id: null,
    createdByUserId: ownerUserId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    meetName: 'New Meet',
    date: '',
    startTime: '',
    registrationCloseDate: '',
    registrationCloseTime: '',
    status: 'Draft',
    trackLength: 100,
    lanes: 4,
    rinkMode: 'saved',
    rinkId: 1,
    customRinkName: '',
    customCity: '',
    customState: '',
    quadEnabled: false,
    openEnabled: false,
    timeTrialsEnabled: false,
    relaysEnabled: false,
    judgesPanelRequired: true,
    showOnFindAMeet: true,
    allowDayOfRegistration: false,
    meetNotes: '',
    ageRule: AGE_RULES.USARS,
    customAgeCutoffDate: '',
    groups: buildStandardGroups(),
    openBuilder: buildOpenBuilderDefaults(),
    quadBuilder: buildQuadBuilderDefaults(),
    registrations: [],
    races: [],
    blocks: [],
    currentRaceId: '',
    currentRaceIndex: -1,
    raceDayPaused: false,
    textSubscribers: [],
    scoringRules: {
      pointsTable: cloneDeep(USARS_POINTS_TABLE),
      tieBreakerMode: 'usars_basic',
    },
    results: {
      timeTrialsByOpenGroup: [],
      standingsByDivision: [],
      standingsByOpenGroup: [],
    },
  };
}

function defaultDb() {
  return {
    version: DATA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sessions: [],
    users: [
      {
        id: 1,
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        displayName: 'Lee Bird',
        roles: [
          USER_ROLES.SUPER_ADMIN,
          USER_ROLES.MEET_DIRECTOR,
          USER_ROLES.JUDGE,
          USER_ROLES.ANNOUNCER,
          USER_ROLES.COACH,
          USER_ROLES.CHECKIN,
        ],
        team: 'Midwest Racing',
        active: true,
        createdAt: nowIso(),
      },
    ],
    rinks: [
      {
        id: 1,
        name: 'Roller City',
        city: 'Wichita',
        state: 'KS',
        team: '',
        address: '3234 S. Meridian Ave, Wichita, KS 67217',
        phone: '316-942-4555',
        website: 'rollercitywichitaks.com',
        notes: '',
      },
    ],
    meets: [],
  };
}

function sanitizeRinks(db) {
  if (!Array.isArray(db.rinks)) db.rinks = [];
  db.rinks = db.rinks.filter(r => !String(r.name || '').toLowerCase().includes('wichita skate center'));

  const hasRollerCity = db.rinks.some(
    r => String(r.name || '').trim().toLowerCase() === 'roller city'
  );

  if (!hasRollerCity) {
    db.rinks.unshift(defaultDb().rinks[0]);
  } else {
    db.rinks = db.rinks.map(r => {
      if (String(r.name || '').trim().toLowerCase() === 'roller city') {
        return {
          ...r,
          address: '3234 S. Meridian Ave, Wichita, KS 67217',
          phone: '316-942-4555',
          website: 'rollercitywichitaks.com',
          city: 'Wichita',
          state: 'KS',
        };
      }
      return r;
    });
  }
}

function normalizeDivisionBlock(div) {
  const safe = div || {};
  return {
    enabled: !!safe.enabled,
    cost: Number(safe.cost || 0),
    distances: Array.isArray(safe.distances)
      ? [0, 1, 2, 3].map(i => String(safe.distances[i] || '').trim())
      : ['', '', '', ''],
  };
}

function normalizeBuilderGroup(group, template) {
  const safe = group || {};
  return {
    ...template,
    ...safe,
    enabled: !!safe.enabled,
    distances: Array.isArray(safe.distances)
      ? [0, 1, 2, 3].map(i => String(safe.distances[i] || '').trim())
      : ['', '', '', ''],
  };
}

function migrateMeet(meet, fallbackOwnerId) {
  if (!meet.createdByUserId) meet.createdByUserId = fallbackOwnerId;
  if (!Array.isArray(meet.groups) || meet.groups.length === 0) meet.groups = buildStandardGroups();
  if (!Array.isArray(meet.openBuilder)) meet.openBuilder = buildOpenBuilderDefaults();
  if (!Array.isArray(meet.quadBuilder)) meet.quadBuilder = buildQuadBuilderDefaults();
  if (!Array.isArray(meet.registrations)) meet.registrations = [];
  if (!Array.isArray(meet.races)) meet.races = [];
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (!Array.isArray(meet.textSubscribers)) meet.textSubscribers = [];
  if (!meet.results || typeof meet.results !== 'object') meet.results = {};
  if (!Array.isArray(meet.results.timeTrialsByOpenGroup)) meet.results.timeTrialsByOpenGroup = [];
  if (!Array.isArray(meet.results.standingsByDivision)) meet.results.standingsByDivision = [];
  if (!Array.isArray(meet.results.standingsByOpenGroup)) meet.results.standingsByOpenGroup = [];
  if (!meet.scoringRules || typeof meet.scoringRules !== 'object') meet.scoringRules = {};

  meet.ageRule = meet.ageRule || AGE_RULES.USARS;
  meet.customAgeCutoffDate = meet.customAgeCutoffDate || '';
  meet.quadEnabled = !!meet.quadEnabled;
  meet.openEnabled = !!meet.openEnabled;
  meet.timeTrialsEnabled = !!meet.timeTrialsEnabled;
  meet.relaysEnabled = !!meet.relaysEnabled;
  meet.allowDayOfRegistration = !!meet.allowDayOfRegistration;
  meet.judgesPanelRequired = meet.judgesPanelRequired !== false;
  meet.showOnFindAMeet = meet.showOnFindAMeet !== false;
  meet.status = meet.status || 'Draft';
  meet.rinkMode = meet.rinkMode || 'saved';
  meet.currentRaceId = meet.currentRaceId || '';
  meet.currentRaceIndex = Number.isFinite(meet.currentRaceIndex) ? meet.currentRaceIndex : -1;
  meet.raceDayPaused = !!meet.raceDayPaused;

  meet.scoringRules.pointsTable = meet.scoringRules.pointsTable || cloneDeep(USARS_POINTS_TABLE);
  meet.scoringRules.tieBreakerMode = meet.scoringRules.tieBreakerMode || 'usars_basic';

  const freshGroups = buildStandardGroups();
  const byId = new Map((meet.groups || []).map(g => [g.id, g]));

  meet.groups = freshGroups.map(group => {
    const existing = byId.get(group.id) || {};
    return {
      ...group,
      divisions: {
        novice: normalizeDivisionBlock(existing.divisions?.novice),
        elite: normalizeDivisionBlock(existing.divisions?.elite),
      },
    };
  });

  const openTemplate = buildOpenBuilderDefaults();
  const openMap = new Map((meet.openBuilder || []).map(g => [g.id, g]));
  meet.openBuilder = openTemplate.map(template => normalizeBuilderGroup(openMap.get(template.id), template));

  const quadTemplate = buildQuadBuilderDefaults();
  const quadMap = new Map((meet.quadBuilder || []).map(g => [g.id, g]));
  meet.quadBuilder = quadTemplate.map(template => normalizeBuilderGroup(quadMap.get(template.id), template));

  meet.registrations = meet.registrations.map(reg => ({
    id: reg.id || crypto.randomBytes(6).toString('hex'),
    createdAt: reg.createdAt || nowIso(),
    walkIn: !!reg.walkIn,
    name: String(reg.name || ''),
    birthdate: String(reg.birthdate || ''),
    gender: normalizeGender(reg.gender),
    team: String(reg.team || 'Independent'),
    calculatedAge: reg.calculatedAge ?? null,
    divisionGroupId: String(reg.divisionGroupId || ''),
    divisionGroupLabel: String(reg.divisionGroupLabel || ''),
    ttOpenGroupId: String(reg.ttOpenGroupId || ''),
    ttOpenGroupLabel: String(reg.ttOpenGroupLabel || ''),
    meetNumber: Number(reg.meetNumber || 0),
    options: {
      novice: !!reg.options?.novice,
      elite: !!reg.options?.elite,
      open: !!reg.options?.open,
      quad: !!reg.options?.quad,
      timeTrials: !!reg.options?.timeTrials,
      relays: !!reg.options?.relays,
    },
    checkIn: {
      checkedIn: !!reg.checkIn?.checkedIn,
      checkedInAt: reg.checkIn?.checkedInAt || '',
    },
  }));

  meet.races = meet.races.map((race, idx) => ({
    id: race.id || `race_${idx + 1}_${crypto.randomBytes(4).toString('hex')}`,
    type: race.type || 'standard',
    roundType: race.roundType || 'final',
    scoringBucketType: race.scoringBucketType || 'division',
    scoringBucketId: String(race.scoringBucketId || ''),
    scoringBucketLabel: String(race.scoringBucketLabel || ''),
    orderHint: Number(race.orderHint || idx + 1),
    label: String(race.label || ''),
    groupId: String(race.groupId || ''),
    groupLabel: String(race.groupLabel || ''),
    divisionKey: String(race.divisionKey || ''),
    dayIndex: Number(race.dayIndex || 1),
    distanceLabel: String(race.distanceLabel || ''),
    blockId: String(race.blockId || ''),
    laneEntries: Array.isArray(race.laneEntries) ? race.laneEntries : [],
    packEntries: Array.isArray(race.packEntries) ? race.packEntries : [],
    resultsMode: race.resultsMode || 'places',
    status: race.status || 'open',
    notes: String(race.notes || ''),
    isFinal: race.isFinal !== false,
    closedAt: String(race.closedAt || ''),
  }));

  meet.blocks = meet.blocks.map((block, idx) => ({
    id: block.id || `block_${idx + 1}`,
    name: String(block.name || `Block ${idx + 1}`),
    day: String(block.day || 'Day 1'),
    notes: String(block.notes || ''),
    raceIds: Array.isArray(block.raceIds) ? block.raceIds : [],
  }));
}

function loadDb() {
  let db = safeReadJson(DATA_FILE);
  if (!db) {
    db = defaultDb();
    writeJsonAtomic(DATA_FILE, db);
    return db;
  }

  if (!Array.isArray(db.users) || db.users.length === 0) db.users = defaultDb().users;
  if (!db.users.some(u => u.username === ADMIN_USERNAME)) {
    db.users.unshift(defaultDb().users[0]);
  }

  if (!Array.isArray(db.rinks)) db.rinks = defaultDb().rinks;
  if (!Array.isArray(db.meets)) db.meets = [];
  if (!Array.isArray(db.sessions)) db.sessions = [];

  sanitizeRinks(db);

  const fallbackOwner = (db.users[0] && db.users[0].id) || 1;
  db.meets.forEach(meet => migrateMeet(meet, fallbackOwner));

  db.sessions = db.sessions.filter(s => {
    return s.expiresAt && new Date(s.expiresAt).getTime() > Date.now();
  });

  db.version = DATA_VERSION;
  return db;
}

function saveDb(db) {
  db.version = DATA_VERSION;
  db.updatedAt = nowIso();
  writeJsonAtomic(DATA_FILE, db);
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const db = loadDb();
  const sess = db.sessions.find(s => s.token === token);
  if (!sess) return null;
  if (new Date(sess.expiresAt).getTime() <= Date.now()) return null;

  const user = db.users.find(u => u.id === sess.userId && u.active !== false);
  if (!user) return null;

  return { db, user, session: sess, token };
}

function extendSession(db, token) {
  const sess = db.sessions.find(s => s.token === token);
  if (sess) {
    sess.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  }
}

function hasRole(user, role) {
  return Array.isArray(user.roles) && user.roles.includes(role);
}

function requireRole(...roles) {
  return (req, res, next) => {
    const data = getSessionUser(req);
    if (!data) return res.redirect('/admin/login');

    extendSession(data.db, data.token);
    saveDb(data.db);

    req.db = data.db;
    req.user = data.user;
    req.sessionToken = data.token;

    if (hasRole(data.user, USER_ROLES.SUPER_ADMIN) || roles.some(role => hasRole(data.user, role))) {
      return next();
    }

    return res.status(403).send('Forbidden');
  };
}

function getMeetOr404(db, meetId) {
  return db.meets.find(m => Number(m.id) === Number(meetId));
}

function canEditMeet(user, meet) {
  return hasRole(user, USER_ROLES.SUPER_ADMIN) || Number(meet.createdByUserId) === Number(user.id);
}function inferDivisionGroup(meet, birthdate, gender) {
  const age = getAgeOnDate(birthdate, getAgeReferenceDate(meet));
  const compGender = ageToCompetitionGender(gender, age);

  const match = (meet.groups || []).find(group => {
    return compGender === group.gender && age >= group.minAge && age <= group.maxAge;
  });

  return {
    age,
    groupId: match?.id || '',
    groupLabel: match?.label || '',
  };
}

function inferOpenTtGroup(meet, birthdate, gender) {
  const age = getAgeOnDate(birthdate, getAgeReferenceDate(meet));
  const compGender = ageToCompetitionGender(gender, age);

  const groups = OPEN_TT_GROUPS.filter(group => {
    return compGender === group.gender && age >= group.minAge && age <= group.maxAge;
  });

  const preferredMasters = groups.find(g => g.label.toLowerCase().includes('masters') && age >= 35);
  const match = preferredMasters || groups[0] || null;

  return {
    age,
    groupId: match?.id || '',
    groupLabel: match?.label || '',
  };
}

function getNextMeetNumber(meet) {
  const nums = (meet.registrations || []).map(r => Number(r.meetNumber) || 0);
  return (Math.max(0, ...nums) || 0) + 1;
}

function findPotentialDuplicate(meet, payload, ignoreRegistrationId = null) {
  const nameNorm = String(payload.name || '').trim().toLowerCase();
  const birthNorm = String(payload.birthdate || '').trim();
  const teamNorm = String(payload.team || '').trim().toLowerCase();

  return (meet.registrations || []).find(reg => {
    if (ignoreRegistrationId && String(reg.id) === String(ignoreRegistrationId)) return false;
    const regName = String(reg.name || '').trim().toLowerCase();
    const regBirth = String(reg.birthdate || '').trim();
    const regTeam = String(reg.team || '').trim().toLowerCase();

    return regName === nameNorm && regBirth === birthNorm && regTeam === teamNorm;
  });
}

function buildRegistrationFromBody(meet, body, opts = {}) {
  const walkIn = !!opts.walkIn;
  const inferred = inferDivisionGroup(meet, body.birthdate, body.gender);
  const tt = inferOpenTtGroup(meet, body.birthdate, body.gender);

  return {
    id: opts.id || crypto.randomBytes(6).toString('hex'),
    createdAt: opts.createdAt || nowIso(),
    walkIn,
    name: String(body.name || '').trim(),
    birthdate: String(body.birthdate || '').trim(),
    gender: normalizeGender(body.gender),
    team: String(body.team || 'Independent').trim() || 'Independent',
    calculatedAge: inferred.age,
    divisionGroupId: inferred.groupId,
    divisionGroupLabel: inferred.groupLabel,
    ttOpenGroupId: tt.groupId,
    ttOpenGroupLabel: tt.groupLabel,
    meetNumber: Number(opts.meetNumber || getNextMeetNumber(meet)),
    options: {
      novice: body.opt_novice === 'on',
      elite: body.opt_elite === 'on',
      open: body.opt_open === 'on',
      quad: body.opt_quad === 'on',
      timeTrials: body.opt_timeTrials === 'on',
      relays: body.opt_relays === 'on',
    },
    checkIn: {
      checkedIn: !!opts.checkedIn,
      checkedInAt: opts.checkedInAt || '',
    },
  };
}

function getDivisionGroupById(meet, groupId) {
  return (meet.groups || []).find(g => g.id === groupId);
}

function getOpenBuilderGroupById(meet, groupId) {
  return (meet.openBuilder || []).find(g => g.id === groupId);
}

function getQuadBuilderGroupById(meet, groupId) {
  return (meet.quadBuilder || []).find(g => g.id === groupId);
}

function getRaceById(meet, raceId) {
  return (meet.races || []).find(r => String(r.id) === String(raceId));
}

function getBlockById(meet, blockId) {
  return (meet.blocks || []).find(b => String(b.id) === String(blockId));
}

function raceSortKey(race) {
  return [
    Number(race.dayIndex || 1),
    Number(race.orderHint || 0),
    String(race.label || ''),
  ];
}

function compareRaceSort(a, b) {
  const ak = raceSortKey(a);
  const bk = raceSortKey(b);
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] < bk[i]) return -1;
    if (ak[i] > bk[i]) return 1;
  }
  return 0;
}

function getSortedRaces(meet) {
  return [...(meet.races || [])].sort(compareRaceSort);
}

function rebuildMeetNumbers(meet) {
  meet.registrations = (meet.registrations || [])
    .sort((a, b) => {
      const aWalk = a.walkIn ? 1 : 0;
      const bWalk = b.walkIn ? 1 : 0;
      if (aWalk !== bWalk) return aWalk - bWalk;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })
    .map((reg, idx) => ({
      ...reg,
      meetNumber: idx + 1,
    }));
}

function getSelectedSavedRink(db, meet) {
  return (db.rinks || []).find(r => Number(r.id) === Number(meet.rinkId)) || null;
}

function getDisplayRinkText(db, meet) {
  if (meet.rinkMode === 'custom') {
    const bits = [meet.customRinkName, meet.customCity, meet.customState].filter(Boolean);
    return bits.join(' · ') || 'Custom rink';
  }
  const rink = getSelectedSavedRink(db, meet);
  return rink ? `${rink.name}${rink.city ? ` · ${rink.city}, ${rink.state}` : ''}` : 'No rink selected';
}

function getRegistrationFeeSummary(meet, reg) {
  let total = 0;
  const parts = [];

  const divisionGroup = getDivisionGroupById(meet, reg.divisionGroupId);

  if (reg.options.novice && divisionGroup?.divisions?.novice?.enabled) {
    const fee = Number(divisionGroup.divisions.novice.cost || 0);
    total += fee;
    parts.push(`Novice $${fee}`);
  }

  if (reg.options.elite && divisionGroup?.divisions?.elite?.enabled) {
    const fee = Number(divisionGroup.divisions.elite.cost || 0);
    total += fee;
    parts.push(`Elite $${fee}`);
  }

  if (reg.options.open) {
    const openGroup = (meet.openBuilder || []).find(g => g.enabled && reg.calculatedAge >= g.minAge && reg.calculatedAge <= g.maxAge && normalizeGender(reg.gender) === g.gender);
    if (openGroup) {
      total += 0;
      parts.push('Open');
    }
  }

  if (reg.options.quad) {
    total += 0;
    parts.push('Quad');
  }

  if (reg.options.timeTrials) {
    total += 0;
    parts.push('Time Trials');
  }

  if (reg.options.relays) {
    total += 0;
    parts.push('Relays');
  }

  return {
    total,
    label: parts.join(' · ') || '—',
  };
}

function divisionOptionsBadgeList(reg) {
  const out = [];
  if (reg.options?.novice) out.push('Novice');
  if (reg.options?.elite) out.push('Elite');
  if (reg.options?.open) out.push('Open');
  if (reg.options?.quad) out.push('Quad');
  if (reg.options?.timeTrials) out.push('Time Trials');
  if (reg.options?.relays) out.push('Relays');
  return out;
}

function scorePlaceToPoints(meet, place) {
  return Number(meet.scoringRules?.pointsTable?.[place] || 0);
}

function summarizePlacements(entries) {
  const places = entries
    .filter(e => Number(e.place) > 0)
    .map(e => Number(e.place))
    .sort((a, b) => a - b);

  const counts = {};
  for (const p of places) counts[p] = (counts[p] || 0) + 1;
  return counts;
}

function applyUsarsTieBreaker(a, b) {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;

  const aPlaces = a.placeCounts || {};
  const bPlaces = b.placeCounts || {};

  for (let place = 1; place <= 10; place++) {
    const av = Number(aPlaces[place] || 0);
    const bv = Number(bPlaces[place] || 0);
    if (bv !== av) return bv - av;
  }

  const aBestLast = Math.min(...Object.keys(aPlaces).map(Number).filter(Boolean), 999);
  const bBestLast = Math.min(...Object.keys(bPlaces).map(Number).filter(Boolean), 999);
  if (aBestLast !== bBestLast) return aBestLast - bBestLast;

  return String(a.name || '').localeCompare(String(b.name || ''));
}

function recomputeStandings(meet) {
  const completedFinals = (meet.races || []).filter(r => r.status === 'closed' && r.isFinal !== false);

  const divisionBuckets = new Map();
  const openBuckets = new Map();
  const ttBuckets = new Map();

  for (const race of completedFinals) {
    const entries = Array.isArray(race.packEntries) && race.packEntries.length
      ? race.packEntries
      : Array.isArray(race.laneEntries)
        ? race.laneEntries
        : [];

    const normalized = entries
      .filter(e => e.registrationId)
      .map(e => ({
        registrationId: String(e.registrationId),
        place: Number(e.place || 0),
        points: Number(e.points || 0),
      }))
      .filter(e => e.place > 0);

    if (!normalized.length) continue;

    let targetMap = divisionBuckets;
    if (race.scoringBucketType === 'open') targetMap = openBuckets;
    if (race.scoringBucketType === 'time_trial_open') targetMap = ttBuckets;

    if (!targetMap.has(race.scoringBucketId)) {
      targetMap.set(race.scoringBucketId, {
        id: race.scoringBucketId,
        label: race.scoringBucketLabel || race.groupLabel || 'Standings',
        rows: [],
      });
    }

    const bucket = targetMap.get(race.scoringBucketId);
    const rowMap = new Map(bucket.rows.map(row => [row.registrationId, row]));

    for (const result of normalized) {
      const reg = (meet.registrations || []).find(r => String(r.id) === result.registrationId);
      if (!reg) continue;

      const existing = rowMap.get(result.registrationId) || {
        registrationId: result.registrationId,
        name: reg.name,
        team: reg.team,
        meetNumber: reg.meetNumber,
        totalPoints: 0,
        raceCount: 0,
        placeCounts: {},
      };

      existing.totalPoints += result.points;
      existing.raceCount += 1;
      existing.placeCounts[result.place] = (existing.placeCounts[result.place] || 0) + 1;

      rowMap.set(result.registrationId, existing);
    }

    bucket.rows = [...rowMap.values()].sort(applyUsarsTieBreaker).map((row, idx) => ({
      ...row,
      rank: idx + 1,
    }));
  }

  meet.results.standingsByDivision = [...divisionBuckets.values()];
  meet.results.standingsByOpenGroup = [...openBuckets.values()];
  meet.results.timeTrialsByOpenGroup = [...ttBuckets.values()];
}

function ensureRaceProgressPointer(meet) {
  const sorted = getSortedRaces(meet);
  if (!sorted.length) {
    meet.currentRaceId = '';
    meet.currentRaceIndex = -1;
    return;
  }

  const idx = sorted.findIndex(r => String(r.id) === String(meet.currentRaceId));
  if (idx >= 0) {
    meet.currentRaceIndex = idx;
    return;
  }

  const firstOpen = sorted.findIndex(r => r.status !== 'closed');
  meet.currentRaceIndex = firstOpen >= 0 ? firstOpen : 0;
  meet.currentRaceId = sorted[meet.currentRaceIndex]?.id || '';
}

function getCurrentRaceBundle(meet) {
  const sorted = getSortedRaces(meet);
  ensureRaceProgressPointer(meet);

  const idx = Number(meet.currentRaceIndex || 0);
  return {
    races: sorted,
    currentIndex: idx,
    currentRace: sorted[idx] || null,
    nextRace: sorted[idx + 1] || null,
    onDeckRace: sorted[idx + 2] || null,
  };
}

function buildRaceLabel(groupLabel, divisionLabel, distanceLabel, roundType = 'final') {
  const parts = [groupLabel, divisionLabel, distanceLabel].filter(Boolean);
  const suffix = roundType && roundType !== 'final'
    ? ` (${roundType.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())})`
    : '';
  return `${parts.join(' · ')}${suffix}`;
}

function parseDistances(rawArray) {
  return (rawArray || [])
    .map(v => String(v || '').trim())
    .filter(Boolean);
}

function rebuildRacesForMeet(meet) {
  const existingResultsByRace = new Map((meet.races || []).map(r => [r.id, r]));
  const newRaces = [];
  const newBlocks = [];
  let orderHint = 1;

  const regs = [...(meet.registrations || [])];

  for (const group of meet.groups || []) {
    const eligibleRegs = regs.filter(reg => String(reg.divisionGroupId) === String(group.id));

    for (const divisionKey of STANDARD_DIVISION_KEYS) {
      const div = group.divisions?.[divisionKey];
      if (!div?.enabled) continue;

      const divisionRegs = eligibleRegs.filter(reg => !!reg.options?.[divisionKey]);
      const distances = parseDistances(div.distances);
      if (!divisionRegs.length || !distances.length) continue;

      const blockId = `block_${group.id}_${divisionKey}`;
      const blockName = `${group.label} · ${divisionKey === 'novice' ? 'Novice' : 'Elite'}`;

      newBlocks.push({
        id: blockId,
        name: blockName,
        day: 'Day 1',
        notes: '',
        raceIds: [],
      });

      for (const distance of distances) {
        const raceId = `race_${group.id}_${divisionKey}_${distance.replace(/\s+/g, '_').toLowerCase()}`;
        const existing = existingResultsByRace.get(raceId);

        const laneEntries = divisionRegs.map((reg, idx) => ({
          registrationId: reg.id,
          meetNumber: reg.meetNumber,
          name: reg.name,
          team: reg.team,
          lane: idx + 1,
          place: existing?.laneEntries?.find(e => e.registrationId === reg.id)?.place || '',
          points: existing?.laneEntries?.find(e => e.registrationId === reg.id)?.points || 0,
        }));

        const race = {
          id: raceId,
          type: 'standard',
          roundType: 'final',
          scoringBucketType: 'division',
          scoringBucketId: group.id,
          scoringBucketLabel: group.label,
          orderHint: orderHint++,
          label: buildRaceLabel(group.label, divisionKey === 'novice' ? 'Novice' : 'Elite', distance, 'final'),
          groupId: group.id,
          groupLabel: group.label,
          divisionKey,
          dayIndex: 1,
          distanceLabel: distance,
          blockId,
          laneEntries,
          packEntries: [],
          resultsMode: 'places',
          status: existing?.status || 'open',
          notes: existing?.notes || '',
          isFinal: true,
          closedAt: existing?.closedAt || '',
        };

        newRaces.push(race);
        newBlocks[newBlocks.length - 1].raceIds.push(race.id);
      }
    }
  }

  if (meet.openEnabled) {
    for (const group of meet.openBuilder || []) {
      if (!group.enabled) continue;

      const eligibleRegs = regs.filter(reg => {
        return !!reg.options?.open &&
          reg.calculatedAge >= group.minAge &&
          reg.calculatedAge <= group.maxAge &&
          normalizeGender(reg.gender) === group.gender;
      });

      const distances = parseDistances(group.distances);
      if (!eligibleRegs.length || !distances.length) continue;

      const blockId = `block_open_${group.id}`;
      newBlocks.push({
        id: blockId,
        name: `${group.label}`,
        day: 'Day 1',
        notes: '',
        raceIds: [],
      });

      for (const distance of distances) {
        const raceId = `race_open_${group.id}_${distance.replace(/\s+/g, '_').toLowerCase()}`;
        const existing = existingResultsByRace.get(raceId);

        const packEntries = eligibleRegs.map(reg => ({
          registrationId: reg.id,
          meetNumber: reg.meetNumber,
          name: reg.name,
          team: reg.team,
          place: existing?.packEntries?.find(e => e.registrationId === reg.id)?.place || '',
          points: existing?.packEntries?.find(e => e.registrationId === reg.id)?.points || 0,
        }));

        const race = {
          id: raceId,
          type: 'open',
          roundType: 'final',
          scoringBucketType: 'open',
          scoringBucketId: group.id,
          scoringBucketLabel: group.label,
          orderHint: orderHint++,
          label: buildRaceLabel(group.label, 'Open', distance, 'final'),
          groupId: group.id,
          groupLabel: group.label,
          divisionKey: 'open',
          dayIndex: 1,
          distanceLabel: distance,
          blockId,
          laneEntries: [],
          packEntries,
          resultsMode: 'places',
          status: existing?.status || 'open',
          notes: existing?.notes || '',
          isFinal: true,
          closedAt: existing?.closedAt || '',
        };

        newRaces.push(race);
        newBlocks[newBlocks.length - 1].raceIds.push(race.id);
      }
    }
  }

  if (meet.quadEnabled) {
    for (const group of meet.quadBuilder || []) {
      if (!group.enabled) continue;

      const eligibleRegs = regs.filter(reg => {
        return !!reg.options?.quad &&
          reg.calculatedAge >= group.minAge &&
          reg.calculatedAge <= group.maxAge &&
          normalizeGender(reg.gender) === group.gender;
      });

      const distances = parseDistances(group.distances);
      if (!eligibleRegs.length || !distances.length) continue;

      const blockId = `block_quad_${group.id}`;
      newBlocks.push({
        id: blockId,
        name: `${group.label}`,
        day: 'Day 1',
        notes: '',
        raceIds: [],
      });

      for (const distance of distances) {
        const raceId = `race_quad_${group.id}_${distance.replace(/\s+/g, '_').toLowerCase()}`;
        const existing = existingResultsByRace.get(raceId);

        const packEntries = eligibleRegs.map(reg => ({
          registrationId: reg.id,
          meetNumber: reg.meetNumber,
          name: reg.name,
          team: reg.team,
          place: existing?.packEntries?.find(e => e.registrationId === reg.id)?.place || '',
          points: existing?.packEntries?.find(e => e.registrationId === reg.id)?.points || 0,
        }));

        const race = {
          id: raceId,
          type: 'quad',
          roundType: 'final',
          scoringBucketType: 'open',
          scoringBucketId: group.id,
          scoringBucketLabel: group.label,
          orderHint: orderHint++,
          label: buildRaceLabel(group.label, 'Quad', distance, 'final'),
          groupId: group.id,
          groupLabel: group.label,
          divisionKey: 'quad',
          dayIndex: 1,
          distanceLabel: distance,
          blockId,
          laneEntries: [],
          packEntries,
          resultsMode: 'places',
          status: existing?.status || 'open',
          notes: existing?.notes || '',
          isFinal: true,
          closedAt: existing?.closedAt || '',
        };

        newRaces.push(race);
        newBlocks[newBlocks.length - 1].raceIds.push(race.id);
      }
    }
  }

  if (meet.timeTrialsEnabled) {
    const ttRegs = regs.filter(reg => !!reg.options?.timeTrials).sort(compareBirthdateYoungestFirst);

    if (ttRegs.length) {
      const blockId = 'block_time_trials';
      newBlocks.push({
        id: blockId,
        name: 'Time Trials',
        day: 'Day 1',
        notes: 'Youngest to oldest by birthdate',
        raceIds: [],
      });

      ttRegs.forEach((reg, idx) => {
        const raceId = `race_tt_${reg.id}`;
        const existing = existingResultsByRace.get(raceId);

        const race = {
          id: raceId,
          type: 'time_trial',
          roundType: 'final',
          scoringBucketType: 'time_trial_open',
          scoringBucketId: reg.ttOpenGroupId || 'tt_misc',
          scoringBucketLabel: reg.ttOpenGroupLabel || 'Time Trial Open',
          orderHint: orderHint++,
          label: `Time Trial · ${reg.name} · 1 Lap`,
          groupId: reg.ttOpenGroupId || '',
          groupLabel: reg.ttOpenGroupLabel || '',
          divisionKey: 'time_trial',
          dayIndex: 1,
          distanceLabel: '1 Lap',
          blockId,
          laneEntries: [
            {
              registrationId: reg.id,
              meetNumber: reg.meetNumber,
              name: reg.name,
              team: reg.team,
              lane: 1,
              place: existing?.laneEntries?.[0]?.place || '',
              points: existing?.laneEntries?.[0]?.points || 0,
              timeMs: existing?.laneEntries?.[0]?.timeMs || '',
            },
          ],
          packEntries: [],
          resultsMode: 'time',
          status: existing?.status || 'open',
          notes: existing?.notes || '',
          isFinal: true,
          closedAt: existing?.closedAt || '',
        };

        newRaces.push(race);
        newBlocks[newBlocks.length - 1].raceIds.push(race.id);
      });
    }
  }

  meet.races = newRaces;
  meet.blocks = newBlocks;
  ensureRaceProgressPointer(meet);
  recomputeStandings(meet);
}

function badge(text, cls = '') {
  return `<span class="pill ${cls}">${esc(text)}</span>`;
}

function roleBadge(role) {
  const map = {
    [USER_ROLES.SUPER_ADMIN]: 'Super Admin',
    [USER_ROLES.MEET_DIRECTOR]: 'Meet Director',
    [USER_ROLES.JUDGE]: 'Judge',
    [USER_ROLES.ANNOUNCER]: 'Announcer',
    [USER_ROLES.COACH]: 'Coach',
    [USER_ROLES.CHECKIN]: 'Check-In',
  };
  return badge(map[role] || role);
}

function roleTabsNav(meet, active) {
  const tabs = [
    { key: 'director', label: 'Director' },
    { key: 'judges', label: 'Judges' },
    { key: 'announcer', label: 'Announcer' },
    { key: 'coach', label: 'Coach' },
    { key: 'live', label: 'Live' },
  ];

  return `
    <div class="tabbar" style="margin-bottom:18px;">
      ${tabs.map(tab => `
        <a class="tab ${active === tab.key ? 'active' : ''}" href="/portal/meet/${meet.id}/race-day/${tab.key}">
          ${esc(tab.label)}
        </a>
      `).join('')}
    </div>
  `;
}

function meetBuilderTabs(meet, active) {
  const tabs = [
    { key: 'main', label: 'Meet Builder', href: `/portal/meet/${meet.id}/builder` },
    { key: 'open', label: 'Open Builder', href: `/portal/meet/${meet.id}/builder/open` },
    { key: 'quad', label: 'Quad Builder', href: `/portal/meet/${meet.id}/builder/quad` },
    { key: 'blocks', label: 'Block Builder', href: `/portal/meet/${meet.id}/builder/blocks` },
  ];

  return `
    <div class="tabbar" style="margin-bottom:18px;">
      ${tabs.map(tab => `
        <a class="tab ${active === tab.key ? 'active' : ''}" href="${tab.href}">
          ${esc(tab.label)}
        </a>
      `).join('')}
    </div>
  `;
}

function layout(title, body, opts = {}) {
  const user = opts.user || null;
  const hideNav = opts.hideNav || false;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — SpeedSkateMeet</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg: #07111f;
      --bg2: #0b1730;
      --card: rgba(255,255,255,0.08);
      --card-strong: rgba(255,255,255,0.12);
      --line: rgba(255,255,255,0.14);
      --text: #eaf2ff;
      --muted: #9db3d6;
      --blue: #4da3ff;
      --blue2: #7dc6ff;
      --gold: #f6c25a;
      --danger: #ff6b6b;
      --ok: #3ddc97;
      --shadow: 0 18px 48px rgba(0,0,0,0.35);
      --radius: 22px;
      --radius-sm: 14px;
      --max: 1320px;
    }

    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: radial-gradient(circle at top, #10234a 0%, #07111f 40%, #050b16 100%);
      color: var(--text);
    }

    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }

    .wrap {
      width: min(var(--max), calc(100% - 28px));
      margin: 0 auto;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(18px);
      background: rgba(5,11,22,0.7);
      border-bottom: 1px solid var(--line);
    }

    .topbar-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 76px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    .brand img {
      width: 52px;
      height: 52px;
      object-fit: contain;
      filter: drop-shadow(0 10px 20px rgba(77,163,255,0.28));
    }

    .nav {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .nav a, .btn, button {
      border: 0;
      cursor: pointer;
      padding: 12px 16px;
      border-radius: 999px;
      background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05));
      color: var(--text);
      font-weight: 700;
      box-shadow: var(--shadow);
      transition: transform 0.15s ease, opacity 0.15s ease;
    }

    .nav a:hover, .btn:hover, button:hover {
      transform: translateY(-1px);
      opacity: 0.98;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--blue), #1e6fff);
      color: white;
    }

    .btn-gold {
      background: linear-gradient(135deg, #f5ca6a, #c8901d);
      color: #1a1306;
    }

    .btn-danger {
      background: linear-gradient(135deg, #ff8585, #ff4d4d);
      color: white;
    }

    .btn-ghost {
      background: rgba(255,255,255,0.06);
      box-shadow: none;
      border: 1px solid var(--line);
    }

    .page { padding: 28px 0 54px; }

    .hero {
      position: relative;
      min-height: 470px;
      border-radius: 32px;
      overflow: hidden;
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      background:
        linear-gradient(180deg, rgba(7,17,31,0.20), rgba(7,17,31,0.84)),
        url('/images/home/hero-banner.jpg') center/cover no-repeat,
        linear-gradient(135deg, #0f234d, #081426);
      display: grid;
      place-items: center;
      text-align: center;
      padding: 48px 26px;
      margin-bottom: 28px;
    }

    .hero-brand-wrap {
      display: flex;
      justify-content: center;
      margin-bottom: 16px;
    }

    .hero-brand-logo {
      width: min(480px, 74vw);
      max-width: 100%;
      height: auto;
      display: block;
      filter: drop-shadow(0 16px 34px rgba(0,0,0,0.34));
    }

    .hero-kicker {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      border: 1px solid var(--line);
      color: var(--text);
      font-size: 0.92rem;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .hero h1 {
      font-size: clamp(2.5rem, 5.4vw, 4.4rem);
      margin: 0 0 12px;
      line-height: 1.02;
      letter-spacing: -0.02em;
      font-weight: 900;
    }

    .hero-subtext {
      max-width: 860px;
      margin: 0 auto;
      color: #d9e7ff;
      font-size: 1.08rem;
      line-height: 1.65;
    }

    .hero-actions {
      margin-top: 24px;
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .grid { display: grid; gap: 18px; }
    .grid-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .grid-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .grid-4 { grid-template-columns: repeat(4, minmax(0,1fr)); }

    .card {
      background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06));
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .card-pad { padding: 20px; }

    .feature-card {
      position: relative;
      min-height: 250px;
      display: flex;
      align-items: flex-end;
      overflow: hidden;
      border-radius: 28px;
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      background-size: cover;
      background-position: center;
    }

    .feature-card::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(5,11,22,0.08), rgba(5,11,22,0.82));
    }

    .feature-card .inner {
      position: relative;
      z-index: 2;
      width: 100%;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .feature-card .icon-wrap {
      width: 72px;
      height: 72px;
      padding: 10px;
      border-radius: 22px;
      background: rgba(255,255,255,0.14);
      border: 1px solid rgba(255,255,255,0.18);
      backdrop-filter: blur(10px);
      box-shadow: var(--shadow);
      margin-bottom: 10px;
    }

    .feature-card h3 {
      margin: 0;
      font-size: 1.35rem;
    }

    .feature-card p {
      margin: 0;
      color: #d9e7ff;
      line-height: 1.6;
    }

    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 30px 0 16px;
    }

    .section-title h2 {
      margin: 0;
      font-size: 1.6rem;
    }

    .muted { color: var(--muted); }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      border: 1px solid var(--line);
      color: var(--text);
      font-size: 0.92rem;
      font-weight: 700;
    }

    .pill.ok { background: rgba(61,220,151,0.16); border-color: rgba(61,220,151,0.32); color: #b7ffe0; }
    .pill.warn { background: rgba(246,194,90,0.16); border-color: rgba(246,194,90,0.32); color: #ffe6a8; }
    .pill.bad { background: rgba(255,107,107,0.16); border-color: rgba(255,107,107,0.32); color: #ffd0d0; }

    .stat {
      padding: 18px;
      border-radius: 22px;
      background: rgba(255,255,255,0.07);
      border: 1px solid var(--line);
    }

    .stat .k {
      font-size: 0.92rem;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .stat .v {
      font-size: 2rem;
      font-weight: 900;
    }

    form.inline { display: inline; }
    form.stack { display: grid; gap: 14px; }

    label {
      display: block;
      font-weight: 700;
      margin-bottom: 8px;
    }

    input, select, textarea {
      width: 100%;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.06);
      color: var(--text);
      border-radius: 16px;
      padding: 14px 16px;
      font: inherit;
      outline: none;
    }

    input::placeholder, textarea::placeholder { color: #9fb1cb; }
    textarea { min-height: 110px; resize: vertical; }

    .row { display: grid; gap: 14px; }
    .row-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .row-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .row-4 { grid-template-columns: repeat(4, minmax(0,1fr)); }

    .table-wrap {
      overflow: auto;
      border-radius: 22px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.05);
      box-shadow: var(--shadow);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 960px;
    }

    th, td {
      padding: 14px 16px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      vertical-align: top;
    }

    th {
      background: rgba(255,255,255,0.06);
      font-size: 0.92rem;
      color: #dbe8ff;
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .subtle {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      padding: 14px 16px;
    }

    .divider {
      height: 1px;
      background: rgba(255,255,255,0.08);
      margin: 18px 0;
    }

    .mini {
      font-size: 0.9rem;
      color: var(--muted);
    }

    .hub-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(3, minmax(0,1fr));
    }

    .hub-card {
      display: block;
      min-height: 164px;
    }

    .hub-card h3 {
      margin: 0 0 12px;
      font-size: 1.2rem;
    }

    .hub-card p {
      margin: 0;
      color: #d9e7ff;
      line-height: 1.6;
    }

    .tabbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .tab {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 16px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.06);
      font-weight: 800;
      box-shadow: var(--shadow);
    }

    .tab.active {
      background: linear-gradient(135deg, var(--blue), #1e6fff);
      color: white;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.05);
      min-height: 68px;
    }

    .toggle-row .left {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .toggle-row .left .title {
      font-weight: 800;
      font-size: 1rem;
    }

    .toggle-row .left .sub {
      font-size: 0.88rem;
      color: var(--muted);
      line-height: 1.4;
    }

    .switch {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      font-weight: 800;
    }

    .switch input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
      width: 0;
      height: 0;
    }

    .switch-ui {
      width: 56px;
      height: 32px;
      border-radius: 999px;
      background: rgba(255,255,255,0.16);
      border: 1px solid rgba(255,255,255,0.18);
      position: relative;
      transition: all 0.2s ease;
    }

    .switch-ui::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 4px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: white;
      transition: all 0.2s ease;
      box-shadow: 0 4px 10px rgba(0,0,0,0.2);
    }

    .switch input:checked + .switch-ui {
      background: linear-gradient(135deg, var(--blue), #1e6fff);
    }

    .switch input:checked + .switch-ui::after {
      transform: translateX(24px);
    }

    .switch-label {
      font-size: 0.92rem;
      color: #dce9ff;
      white-space: nowrap;
    }

    .division-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(2, minmax(0,1fr));
    }

    .division-card {
      padding: 20px;
      border-radius: 24px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,0.05);
      box-shadow: var(--shadow);
    }

    .division-card h3 {
      margin: 0 0 6px;
      font-size: 1.18rem;
    }

    .division-card .mini {
      margin-bottom: 16px;
    }

    .division-opts {
      display: grid;
      gap: 14px;
      margin-top: 14px;
    }

    .division-subcard {
      padding: 16px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
    }

    .division-subcard h4 {
      margin: 0 0 10px;
      font-size: 1rem;
    }

    .checkbox-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .checkbox-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.05);
      font-weight: 800;
      min-height: 48px;
    }

    .checkbox-pill input {
      width: auto;
      margin: 0;
      accent-color: #4da3ff;
      transform: scale(1.15);
    }

    .callout {
      padding: 18px;
      border-radius: 22px;
      background: rgba(77,163,255,0.10);
      border: 1px solid rgba(77,163,255,0.24);
      color: #d9ebff;
    }

    .right { text-align: right; }
    .center { text-align: center; }

    @media (max-width: 1100px) {
      .grid-4, .grid-3, .grid-2, .row-4, .row-3, .row-2, .hub-grid, .division-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 980px) {
      .topbar-inner {
        flex-direction: column;
        align-items: stretch;
        padding: 14px 0;
      }

      .nav {
        justify-content: center;
      }

      .hero {
        min-height: 380px;
      }

      .toggle-row {
        flex-direction: column;
        align-items: stretch;
      }

      .switch {
        justify-content: space-between;
      }
    }

    @media print {
      .topbar, .hero-actions, .actions, .no-print, .tabbar, .btn, button { display: none !important; }
      body { background: white; color: black; }
      .card, .table-wrap, .feature-card, .stat, .division-card, .division-subcard {
        box-shadow: none !important;
        border: 1px solid #ddd !important;
        background: white !important;
        color: black !important;
      }
      th, td, h1, h2, h3, h4, p, div, span, label { color: black !important; }
      .page { padding: 0; }
      .wrap { width: 100%; }
      .table-wrap { overflow: visible; }
      table { min-width: 0; }
      tr, td, th { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${hideNav ? '' : `
  <div class="topbar">
    <div class="wrap topbar-inner">
      <a class="brand" href="/">
        <img src="/images/branding/speedskatemeet-logo.png" alt="SpeedSkateMeet Logo" onerror="this.style.display='none'">
        <div>
          <div style="font-size:1.08rem;">SpeedSkateMeet</div>
          <div class="mini">Build. Register. Race.</div>
        </div>
      </a>
      <div class="nav">
        <a href="/">Home</a>
        <a href="/find-a-meet">Find a Meet</a>
        <a href="/find-a-rink">Find a Rink</a>
        ${user ? `<a href="/portal">Portal</a>` : `<a href="/admin/login">Portal</a>`}
        ${user ? `<a href="/admin/logout" class="btn-ghost">Logout</a>` : `<a href="/admin/login" class="btn-primary">Login</a>`}
      </div>
    </div>
  </div>
  `}
  <div class="page">
    <div class="wrap">
      ${body}
    </div>
  </div>
</body>
</html>`;
}function homePage(user) {
  return layout('Home', `
    <div class="hero">
      <div>
        <div class="hero-brand-wrap">
          <img src="/images/branding/speedskatemeet-logo.png" alt="SpeedSkateMeet" class="hero-brand-logo" onerror="this.style.display='none'">
        </div>
        <div class="hero-kicker">Meet management for real race day chaos</div>
        <h1>Build. Register. Race.</h1>
        <p class="hero-subtext">
          SpeedSkateMeet helps you build meets, manage registration, check in skaters,
          run race day, score the meet, and publish live results without the clipboard circus.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="${user ? '/portal' : '/admin/login'}">${user ? 'Open Portal' : 'Portal Login'}</a>
          <a class="btn btn-ghost" href="/find-a-meet">Find a Meet</a>
        </div>
      </div>
    </div>

    <div class="grid grid-3">
      <div class="feature-card" style="background-image:url('/images/home/feature-card-dark.jpg');">
        <div class="inner">
          <div class="icon-wrap">
            <img src="/images/home/icon-clipboard.png" alt="Build a Meet" onerror="this.style.display='none'">
          </div>
          <h3>Build a Meet</h3>
          <p>Create divisions, blocks, race-day flow, and meet settings in one place.</p>
          <div class="actions">
            <a class="btn btn-primary" href="${user ? '/portal' : '/admin/login'}">Open Portal</a>
          </div>
        </div>
      </div>

      <div class="feature-card" style="background-image:url('/images/home/feature-card-light.jpg');">
        <div class="inner">
          <div class="icon-wrap">
            <img src="/images/home/icon-map-pin.png" alt="Find a Meet" onerror="this.style.display='none'">
          </div>
          <h3>Find a Meet</h3>
          <p>Share your meet publicly and make it easy for skaters to register fast.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/find-a-meet">Browse Meets</a>
          </div>
        </div>
      </div>

      <div class="feature-card" style="background-image:url('/images/home/feature-card-gold.jpg');">
        <div class="inner">
          <div class="icon-wrap">
            <img src="/images/home/icon-trophy.png" alt="Live Results" onerror="this.style.display='none'">
          </div>
          <h3>Live Results</h3>
          <p>Keep judges, announcers, coaches, and parents synced with what’s happening now.</p>
          <div class="actions">
            <a class="btn btn-primary" href="/find-a-meet">View Public Results</a>
          </div>
        </div>
      </div>
    </div>
  `, { user });
}

function loginPage(error = '') {
  return layout('Login', `
    <div class="grid grid-2" style="align-items:center;">
      <div class="hero" style="min-height:520px;">
        <div>
          <div class="hero-brand-wrap">
            <img src="/images/branding/speedskatemeet-logo.png" alt="SpeedSkateMeet" class="hero-brand-logo" onerror="this.style.display='none'">
          </div>
          <h1>Run your meet like you mean it.</h1>
          <p class="hero-subtext">
            Registration, builders, walk-ins, check-in, race day control, judges, live results,
            and standings — all in one place.
          </p>
        </div>
      </div>

      <div class="card card-pad">
        <h2 style="margin-top:0;">Portal Login</h2>
        <p class="muted">Sign in to access your meet tools.</p>
        ${error ? `<div class="pill bad" style="margin-bottom:16px;">${esc(error)}</div>` : ''}
        <form class="stack" method="post" action="/admin/login">
          <div>
            <label>Username</label>
            <input name="username" autocomplete="username" required />
          </div>
          <div>
            <label>Password</label>
            <input type="password" name="password" autocomplete="current-password" required />
          </div>
          <button class="btn-primary" type="submit">Login</button>
        </form>
      </div>
    </div>
  `);
}

function findAMeetPage(user, db) {
  const meets = (db.meets || [])
    .filter(meet => meet.showOnFindAMeet)
    .sort((a, b) => {
      const aTime = a.date ? new Date(`${a.date}T12:00:00`).getTime() : 0;
      const bTime = b.date ? new Date(`${b.date}T12:00:00`).getTime() : 0;
      return aTime - bTime;
    });

  return layout('Find a Meet', `
    <div class="section-title">
      <div>
        <h2>Find a Meet</h2>
        <div class="muted">Public meets that are open for viewing and registration.</div>
      </div>
    </div>

    <div class="grid">
      ${meets.length === 0 ? `
        <div class="card card-pad">
          <h3 style="margin-top:0;">No public meets yet</h3>
          <p class="muted">Nothing published right now.</p>
        </div>
      ` : meets.map(meet => `
        <div class="card card-pad">
          <div class="grid grid-4" style="align-items:center;">
            <div>
              <div class="pill ${meet.status === 'Published' ? 'ok' : 'warn'}">${esc(meet.status || 'Draft')}</div>
              <h3 style="margin:12px 0 6px;">${esc(meet.meetName)}</h3>
              <div class="mini">${meet.date ? esc(formatDateHuman(meet.date)) : 'Date TBD'} · ${esc(meet.startTime || 'Time TBD')}</div>
            </div>
            <div class="subtle">
              <div class="mini">Registrations</div>
              <div style="font-size:1.5rem;font-weight:900;">${meet.registrations?.length || 0}</div>
            </div>
            <div class="subtle">
              <div class="mini">Races</div>
              <div style="font-size:1.5rem;font-weight:900;">${meet.races?.length || 0}</div>
            </div>
            <div class="actions" style="justify-content:flex-end;">
              <a class="btn btn-primary" href="/meet/${meet.id}/register">Register</a>
              <a class="btn btn-ghost" href="/live/${meet.id}">Live</a>
              <a class="btn btn-ghost" href="/results/${meet.id}">Results</a>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `, { user });
}

function findARinkPage(user, db) {
  const rinks = (db.rinks || []).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''))
  );

  return layout('Find a Rink', `
    <div class="section-title">
      <div>
        <h2>Find a Rink</h2>
        <div class="muted">Browse roller speed skating rinks and training locations.</div>
      </div>
    </div>

    <div class="grid">
      ${rinks.length === 0 ? `
        <div class="card card-pad">
          <h3 style="margin-top:0;">No rinks yet</h3>
          <p class="muted">No rink listings have been added yet.</p>
        </div>
      ` : rinks.map(rink => `
        <div class="card card-pad">
          <h3 style="margin-top:0;">${esc(rink.name || 'Unnamed Rink')}</h3>
          <div class="mini">
            ${esc(rink.city || '')}${rink.city && rink.state ? ', ' : ''}${esc(rink.state || '')}
          </div>

          <div style="margin-top:12px;" class="muted">
            ${rink.address ? `${esc(rink.address)}<br>` : ''}
            ${rink.phone ? `Phone: ${esc(rink.phone)}<br>` : ''}
            ${rink.website ? `Website: ${esc(rink.website)}<br>` : ''}
            ${rink.notes ? esc(rink.notes) : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `, { user });
}

function portalPage(user, db) {
  const myMeets = (db.meets || [])
    .filter(meet => canEditMeet(user, meet))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return layout('Portal', `
    <div class="section-title">
      <div>
        <h2>Portal</h2>
        <div class="muted">Choose a meet to manage.</div>
      </div>
      <div class="actions">
        ${(hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) ? `<a class="btn btn-primary" href="/portal/new-meet">+ New Meet</a>` : ''}
        ${(hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) ? `<a class="btn btn-ghost" href="/portal/users">Users</a>` : ''}
      </div>
    </div>

    <div class="grid grid-4">
      <div class="stat"><div class="k">Your Meets</div><div class="v">${myMeets.length}</div></div>
      <div class="stat"><div class="k">Published</div><div class="v">${myMeets.filter(m => m.showOnFindAMeet).length}</div></div>
      <div class="stat"><div class="k">Drafts</div><div class="v">${myMeets.filter(m => m.status === 'Draft').length}</div></div>
      <div class="stat"><div class="k">Total Registrations</div><div class="v">${myMeets.reduce((sum, m) => sum + (m.registrations?.length || 0), 0)}</div></div>
    </div>

    <div class="section-title">
      <h2>Your Meets</h2>
      <div class="muted">Open a meet first, then choose where you want to work.</div>
    </div>

    <div class="grid">
      ${myMeets.length === 0 ? `
        <div class="card card-pad">
          <h3 style="margin-top:0;">No meets yet</h3>
          <p class="muted">Create your first meet to get rolling.</p>
          ${(hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) ? `<a class="btn btn-primary" href="/portal/new-meet">Create Meet</a>` : ''}
        </div>
      ` : myMeets.map(meet => `
        <div class="card card-pad">
          <div class="grid grid-4" style="align-items:center;">
            <div>
              <div class="pill ${meet.status === 'Published' ? 'ok' : 'warn'}">${esc(meet.status || 'Draft')}</div>
              <h3 style="margin:12px 0 6px;">${esc(meet.meetName || 'Untitled Meet')}</h3>
              <div class="mini">${meet.date ? esc(formatDateHuman(meet.date)) : 'No date set'} · ${esc(meet.startTime || 'No start time')}</div>
            </div>
            <div class="subtle">
              <div class="mini">Registrations</div>
              <div style="font-size:1.5rem;font-weight:900;">${meet.registrations?.length || 0}</div>
            </div>
            <div class="subtle">
              <div class="mini">Races</div>
              <div style="font-size:1.5rem;font-weight:900;">${meet.races?.length || 0}</div>
            </div>
            <div class="actions" style="justify-content:flex-end;">
              <a class="btn btn-primary" href="/portal/meet/${meet.id}">Open Meet</a>
              <a class="btn btn-ghost" href="/results/${meet.id}" target="_blank">Results</a>
              <a class="btn btn-ghost" href="/live/${meet.id}" target="_blank">Public Live</a>
              ${(hasRole(user, USER_ROLES.SUPER_ADMIN) || canEditMeet(user, meet)) ? `
                <form class="inline" method="post" action="/portal/meet/${meet.id}/delete" onsubmit="return confirm('Delete this meet? This cannot be undone.');">
                  <button class="btn btn-danger" type="submit">Delete Meet</button>
                </form>
              ` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `, { user });
}

function meetDashboardPage(user, meet, db) {
  const regCount = meet.registrations?.length || 0;
  const raceCount = meet.races?.length || 0;
  const blockCount = meet.blocks?.length || 0;
  const checkedInCount = (meet.registrations || []).filter(r => r.checkIn?.checkedIn).length;

  return layout(`Open Meet — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <div class="pill ${meet.status === 'Published' ? 'ok' : 'warn'}">${esc(meet.status || 'Draft')}</div>
        <h2 style="margin-top:12px;">${esc(meet.meetName || 'Untitled Meet')}</h2>
        <div class="muted">
          ${meet.date ? esc(formatDateHuman(meet.date)) : 'No date set'} ·
          ${esc(meet.startTime || 'No start time')} ·
          ${esc(getDisplayRinkText(db, meet))}
        </div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal">← Back to Portal</a>
        <a class="btn btn-ghost" href="/live/${meet.id}" target="_blank">Public Live</a>
        <a class="btn btn-ghost" href="/results/${meet.id}" target="_blank">Results</a>
      </div>
    </div>

    <div class="grid grid-4">
      <div class="stat"><div class="k">Registrations</div><div class="v">${regCount}</div></div>
      <div class="stat"><div class="k">Checked In</div><div class="v">${checkedInCount}</div></div>
      <div class="stat"><div class="k">Races</div><div class="v">${raceCount}</div></div>
      <div class="stat"><div class="k">Blocks</div><div class="v">${blockCount}</div></div>
    </div>

    <div class="section-title">
      <h2>Meet Tools</h2>
      <div class="muted">Open a section to work inside this meet.</div>
    </div>

    <div class="hub-grid">
      <a class="card card-pad hub-card" href="/portal/meet/${meet.id}/builder">
        <h3>Meet Builder</h3>
        <p>Meet setup, standard divisions, and builder tabs for open, quad, and block schedule.</p>
      </a>

      <a class="card card-pad hub-card" href="/portal/meet/${meet.id}/registered">
        <h3>Registered</h3>
        <p>View registrations, edit racers, print lists, handle walk-ins, and catch duplicates.</p>
      </a>

      <a class="card card-pad hub-card" href="/portal/meet/${meet.id}/check-in">
        <h3>Check In</h3>
        <p>Run fast meet-day check in without digging through extra screens.</p>
      </a>

      <a class="card card-pad hub-card" href="/portal/meet/${meet.id}/race-day/director">
        <h3>Race Day</h3>
        <p>Director, judges, announcer, coach, and live race-day control views.</p>
      </a>

      <a class="card card-pad hub-card" href="/results/${meet.id}" target="_blank">
        <h3>Results</h3>
        <p>Public standings, time trial results, and meet-facing scoring output.</p>
      </a>

      <a class="card card-pad hub-card" href="/live/${meet.id}" target="_blank">
        <h3>Public Live</h3>
        <p>Current race, on deck, and public-facing live display screens.</p>
      </a>

      <div class="card card-pad hub-card">
        <h3>Meet Actions</h3>
        <p style="margin-bottom:16px;">Publish visibility and handle final meet-level actions.</p>
        <div class="actions">
          ${(hasRole(user, USER_ROLES.SUPER_ADMIN) || canEditMeet(user, meet)) ? `
            <form class="inline" method="post" action="/portal/meet/${meet.id}/publish-toggle">
              <button class="btn ${meet.showOnFindAMeet ? 'btn-gold' : 'btn-primary'}" type="submit">
                ${meet.showOnFindAMeet ? 'Hide from Find a Meet' : 'Publish to Find a Meet'}
              </button>
            </form>
            <form class="inline" method="post" action="/portal/meet/${meet.id}/delete" onsubmit="return confirm('Delete this meet? This cannot be undone.');">
              <button class="btn btn-danger" type="submit">Delete Meet</button>
            </form>
          ` : ''}
        </div>
      </div>
    </div>
  `, { user });
}

function usersPage(user, db) {
  const rows = (db.users || []).sort((a, b) => Number(a.id) - Number(b.id)).map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${esc(u.displayName || '')}</td>
      <td>${esc(u.username || '')}</td>
      <td>${esc(u.team || '')}</td>
      <td>${(u.roles || []).map(roleBadge).join(' ')}</td>
      <td>${u.active === false ? badge('Inactive', 'bad') : badge('Active', 'ok')}</td>
      <td>
        <div class="actions">
          <a class="btn btn-ghost" href="/portal/users/${u.id}/edit">Edit</a>
          ${Number(u.id) !== 1 ? `
            <form class="inline" method="post" action="/portal/users/${u.id}/toggle-active">
              <button class="btn ${u.active === false ? 'btn-primary' : 'btn-gold'}" type="submit">
                ${u.active === false ? 'Activate' : 'Deactivate'}
              </button>
            </form>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  return layout('Users', `
    <div class="section-title">
      <div>
        <h2>Users</h2>
        <div class="muted">Create and manage user permissions.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal">← Portal</a>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card card-pad">
        <h3 style="margin-top:0;">Add User</h3>
        <form class="stack" method="post" action="/portal/users/create">
          <div class="row row-2">
            <div>
              <label>Display Name</label>
              <input name="displayName" required />
            </div>
            <div>
              <label>Username</label>
              <input name="username" required />
            </div>
          </div>

          <div class="row row-2">
            <div>
              <label>Password</label>
              <input name="password" required />
            </div>
            <div>
              <label>Team</label>
              <input list="teamListUsers" name="team" value="Independent" />
              <datalist id="teamListUsers">
                ${TEAM_LIST.map(team => `<option value="${esc(team)}">`).join('')}
              </datalist>
            </div>
          </div>

          <div>
            <label>Permissions</label>
            <div class="checkbox-pills">
              <label class="checkbox-pill"><input type="checkbox" name="role_meet_director"> Meet Director</label>
              <label class="checkbox-pill"><input type="checkbox" name="role_judge"> Judge</label>
              <label class="checkbox-pill"><input type="checkbox" name="role_announcer"> Announcer</label>
              <label class="checkbox-pill"><input type="checkbox" name="role_coach"> Coach</label>
              <label class="checkbox-pill"><input type="checkbox" name="role_checkin"> Check-In</label>
            </div>
          </div>

          <button class="btn btn-primary" type="submit">Create User</button>
        </form>
      </div>

      <div class="card card-pad">
        <h3 style="margin-top:0;">Current Users</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Username</th>
                <th>Team</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="7" class="center muted">No users yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `, { user });
}

function editUserPage(user, targetUser) {
  return layout(`Edit User — ${targetUser.displayName}`, `
    <div class="section-title">
      <div>
        <h2>Edit User</h2>
        <div class="muted">${esc(targetUser.displayName || '')}</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/users">← Users</a>
      </div>
    </div>

    <div class="card card-pad">
      <form class="stack" method="post" action="/portal/users/${targetUser.id}/edit">
        <div class="row row-2">
          <div>
            <label>Display Name</label>
            <input name="displayName" value="${esc(targetUser.displayName || '')}" required />
          </div>
          <div>
            <label>Username</label>
            <input name="username" value="${esc(targetUser.username || '')}" required />
          </div>
        </div>

        <div class="row row-2">
          <div>
            <label>Password</label>
            <input name="password" value="${esc(targetUser.password || '')}" required />
          </div>
          <div>
            <label>Team</label>
            <input list="teamListUsersEdit" name="team" value="${esc(targetUser.team || '')}" />
            <datalist id="teamListUsersEdit">
              ${TEAM_LIST.map(team => `<option value="${esc(team)}">`).join('')}
            </datalist>
          </div>
        </div>

        <div>
          <label>Permissions</label>
          <div class="checkbox-pills">
            <label class="checkbox-pill"><input type="checkbox" name="role_meet_director" ${checked(hasRole(targetUser, USER_ROLES.MEET_DIRECTOR))}> Meet Director</label>
            <label class="checkbox-pill"><input type="checkbox" name="role_judge" ${checked(hasRole(targetUser, USER_ROLES.JUDGE))}> Judge</label>
            <label class="checkbox-pill"><input type="checkbox" name="role_announcer" ${checked(hasRole(targetUser, USER_ROLES.ANNOUNCER))}> Announcer</label>
            <label class="checkbox-pill"><input type="checkbox" name="role_coach" ${checked(hasRole(targetUser, USER_ROLES.COACH))}> Coach</label>
            <label class="checkbox-pill"><input type="checkbox" name="role_checkin" ${checked(hasRole(targetUser, USER_ROLES.CHECKIN))}> Check-In</label>
          </div>
        </div>

        <button class="btn btn-primary" type="submit">Save User</button>
      </form>
    </div>
  `, { user });
}function meetBuilderPage(user, meet, db) {
  const rinkOptions = (db.rinks || []).map(rink =>
    `<option value="${rink.id}" ${selected(meet.rinkId, rink.id)}>${esc(rink.name)} (${esc(rink.city)}, ${esc(rink.state)})</option>`
  ).join('');

  return layout(`Meet Builder — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Meet Builder</h2>
        <div class="muted">Core meet setup, standard divisions, and registration rules.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${meetBuilderTabs(meet, 'main')}

    <form class="stack" method="post" action="/portal/meet/${meet.id}/builder/save">
      <div class="card card-pad">
        <h3 style="margin-top:0;">Event Info</h3>
        <div class="row row-3">
          <div>
            <label>Meet Name</label>
            <input name="meetName" value="${esc(meet.meetName || '')}" required />
          </div>
          <div>
            <label>Meet Date</label>
            <input type="date" name="date" value="${esc(meet.date || '')}" />
          </div>
          <div>
            <label>Start Time</label>
            <input type="time" name="startTime" value="${esc(meet.startTime || '')}" />
          </div>
        </div>

        <div class="row row-2" style="margin-top:14px;">
          <div>
            <label>Registration Close Date</label>
            <input type="date" name="registrationCloseDate" value="${esc(meet.registrationCloseDate || '')}" />
          </div>
          <div>
            <label>Registration Close Time</label>
            <input type="time" name="registrationCloseTime" value="${esc(meet.registrationCloseTime || '')}" />
          </div>
        </div>
      </div>

      <div class="card card-pad">
        <h3 style="margin-top:0;">Track Setup</h3>

        <div class="row row-3">
          <div>
            <label>Track Length</label>
            <input name="trackLength" value="${esc(meet.trackLength || 100)}" />
          </div>
          <div>
            <label>Lane Count</label>
            <input name="lanes" value="${esc(meet.lanes || 4)}" />
          </div>
          <div>
            <label>Rink Source</label>
            <select name="rinkMode" onchange="toggleRinkMode(this.value)">
              <option value="saved" ${selected(meet.rinkMode, 'saved')}>Saved Rink</option>
              <option value="custom" ${selected(meet.rinkMode, 'custom')}>Custom Rink</option>
            </select>
          </div>
        </div>

        <div id="savedRinkWrap" style="${meet.rinkMode === 'custom' ? 'display:none;' : ''}; margin-top:14px;">
          <label>Saved Rink</label>
          <select name="rinkId">
            ${rinkOptions}
          </select>
        </div>

        <div id="customRinkWrap" style="${meet.rinkMode === 'custom' ? '' : 'display:none;'}; margin-top:14px;">
          <div class="row row-3">
            <div>
              <label>Custom Rink Name</label>
              <input name="customRinkName" value="${esc(meet.customRinkName || '')}" />
            </div>
            <div>
              <label>City</label>
              <input name="customCity" value="${esc(meet.customCity || '')}" />
            </div>
            <div>
              <label>State</label>
              <input name="customState" value="${esc(meet.customState || '')}" />
            </div>
          </div>
        </div>
      </div>

      <div class="card card-pad">
        <h3 style="margin-top:0;">Registration + Rules</h3>

        <div class="row row-3">
          <div>
            <label>Age Rule</label>
            <select name="ageRule" onchange="toggleCustomAgeRule(this.value)">
              <option value="${AGE_RULES.USARS}" ${selected(meet.ageRule, AGE_RULES.USARS)}>USARS Rule</option>
              <option value="${AGE_RULES.MEET_DATE}" ${selected(meet.ageRule, AGE_RULES.MEET_DATE)}>Age on Meet Date</option>
              <option value="${AGE_RULES.CUSTOM}" ${selected(meet.ageRule, AGE_RULES.CUSTOM)}>Custom Date</option>
            </select>
          </div>

          <div id="customAgeRuleWrap" style="${meet.ageRule === AGE_RULES.CUSTOM ? '' : 'display:none;'}">
            <label>Custom Age Cutoff Date</label>
            <input type="date" name="customAgeCutoffDate" value="${esc(meet.customAgeCutoffDate || '')}" />
          </div>

          <div>
            <label>Status</label>
            <select name="status">
              <option value="Draft" ${selected(meet.status, 'Draft')}>Draft</option>
              <option value="Published" ${selected(meet.status, 'Published')}>Published</option>
            </select>
          </div>
        </div>

        <div class="grid grid-2" style="margin-top:18px;">
          <div class="toggle-row">
            <div class="left">
              <div class="title">Time Trials</div>
              <div class="sub">Enable one-lap time trials and sort racers youngest to oldest by birthdate.</div>
            </div>
            <label class="switch">
              <input type="checkbox" name="timeTrialsEnabled" ${checked(meet.timeTrialsEnabled)}>
              <span class="switch-ui"></span>
              <span class="switch-label">Enabled</span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="left">
              <div class="title">Open Enabled</div>
              <div class="sub">Turn on the separate Open Builder and allow open race registration.</div>
            </div>
            <label class="switch">
              <input type="checkbox" name="openEnabled" ${checked(meet.openEnabled)}>
              <span class="switch-ui"></span>
              <span class="switch-label">Enabled</span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="left">
              <div class="title">Quad Enabled</div>
              <div class="sub">Turn on the separate Quad Builder and allow quad race registration.</div>
            </div>
            <label class="switch">
              <input type="checkbox" name="quadEnabled" ${checked(meet.quadEnabled)}>
              <span class="switch-ui"></span>
              <span class="switch-label">Enabled</span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="left">
              <div class="title">Relays Enabled</div>
              <div class="sub">Allow relays to be selected during registration.</div>
            </div>
            <label class="switch">
              <input type="checkbox" name="relaysEnabled" ${checked(meet.relaysEnabled)}>
              <span class="switch-ui"></span>
              <span class="switch-label">Enabled</span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="left">
              <div class="title">Allow Day-Of Registration</div>
              <div class="sub">Allow walk-ins to be added from Registered page after prereg closes.</div>
            </div>
            <label class="switch">
              <input type="checkbox" name="allowDayOfRegistration" ${checked(meet.allowDayOfRegistration)}>
              <span class="switch-ui"></span>
              <span class="switch-label">Enabled</span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="left">
              <div class="title">Judges Panel Required</div>
              <div class="sub">Keep judges tools active for scoring and race-day progression.</div>
            </div>
            <label class="switch">
              <input type="checkbox" name="judgesPanelRequired" ${checked(meet.judgesPanelRequired)}>
              <span class="switch-ui"></span>
              <span class="switch-label">Enabled</span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="left">
              <div class="title">Show on Find a Meet</div>
              <div class="sub">Publish this meet publicly so racers can find it and register.</div>
            </div>
            <label class="switch">
              <input type="checkbox" name="showOnFindAMeet" ${checked(meet.showOnFindAMeet)}>
              <span class="switch-ui"></span>
              <span class="switch-label">Enabled</span>
            </label>
          </div>
        </div>

        <div style="margin-top:16px;">
          <label>Meet Notes</label>
          <textarea name="meetNotes">${esc(meet.meetNotes || '')}</textarea>
        </div>
      </div>

      <div class="section-title">
        <div>
          <h2>Standard Divisions</h2>
          <div class="muted">Keep Open and Quad out of these cards. Standard divisions only.</div>
        </div>
      </div>

      <div class="division-grid">
        ${(meet.groups || []).map((group, idx) => `
          <div class="division-card">
            <h3>${esc(group.label)}</h3>
            <div class="mini">${esc(group.ages)}</div>

            <div class="division-opts">
              ${STANDARD_DIVISION_KEYS.map(key => {
                const div = group.divisions?.[key] || buildDivisionTemplate();
                const title = key === 'novice' ? 'Novice' : 'Elite';

                return `
                  <div class="division-subcard">
                    <div class="toggle-row">
                      <div class="left">
                        <div class="title">${title}</div>
                        <div class="sub">Enable this standard division and set race distances.</div>
                      </div>
                      <label class="switch">
                        <input type="checkbox" name="g_${idx}_${key}_enabled" ${checked(div.enabled)}>
                        <span class="switch-ui"></span>
                        <span class="switch-label">Enabled</span>
                      </label>
                    </div>

                    <div style="margin-top:14px;">
                      <label>Cost</label>
                      <input name="g_${idx}_${key}_cost" value="${esc(div.cost || 0)}" />
                    </div>

                    <div class="row row-2" style="margin-top:14px;">
                      <div>
                        <label>Distance 1</label>
                        <input name="g_${idx}_${key}_d1" value="${esc(div.distances?.[0] || '')}" />
                      </div>
                      <div>
                        <label>Distance 2</label>
                        <input name="g_${idx}_${key}_d2" value="${esc(div.distances?.[1] || '')}" />
                      </div>
                    </div>

                    <div class="row row-2" style="margin-top:14px;">
                      <div>
                        <label>Distance 3</label>
                        <input name="g_${idx}_${key}_d3" value="${esc(div.distances?.[2] || '')}" />
                      </div>
                      <div>
                        <label>Distance 4</label>
                        <input name="g_${idx}_${key}_d4" value="${esc(div.distances?.[3] || '')}" />
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="actions" style="margin-top:20px;">
        <button class="btn btn-primary" type="submit">Save Meet Builder</button>
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}/builder/open">Open Builder</a>
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}/builder/quad">Quad Builder</a>
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}/builder/blocks">Block Builder</a>
      </div>
    </form>

    <script>
      function toggleCustomAgeRule(value) {
        const wrap = document.getElementById('customAgeRuleWrap');
        if (!wrap) return;
        wrap.style.display = value === ${JSON.stringify(AGE_RULES.CUSTOM)} ? '' : 'none';
      }

      function toggleRinkMode(value) {
        const savedWrap = document.getElementById('savedRinkWrap');
        const customWrap = document.getElementById('customRinkWrap');
        if (savedWrap) savedWrap.style.display = value === 'saved' ? '' : 'none';
        if (customWrap) customWrap.style.display = value === 'custom' ? '' : 'none';
      }
    </script>
  `, { user });
}

function openBuilderPage(user, meet) {
  return layout(`Open Builder — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Open Builder</h2>
        <div class="muted">Separate open age groups and distances. No lane count cap here.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${meetBuilderTabs(meet, 'open')}

    <form class="stack" method="post" action="/portal/meet/${meet.id}/builder/open/save">
      <div class="callout">
        Open is separate from standard divisions. That keeps normal inline groups cleaner and avoids mixing age structures.
      </div>

      <div class="division-grid">
        ${(meet.openBuilder || []).map((group, idx) => `
          <div class="division-card">
            <h3>${esc(group.label)}</h3>
            <div class="mini">${group.minAge} - ${group.maxAge} · ${esc(group.gender)}</div>

            <div class="toggle-row" style="margin-top:14px;">
              <div class="left">
                <div class="title">Enable ${esc(group.label)}</div>
                <div class="sub">Turn this open group on and define distances for it.</div>
              </div>
              <label class="switch">
                <input type="checkbox" name="open_${idx}_enabled" ${checked(group.enabled)}>
                <span class="switch-ui"></span>
                <span class="switch-label">Enabled</span>
              </label>
            </div>

            <div class="row row-2" style="margin-top:14px;">
              <div>
                <label>Distance 1</label>
                <input name="open_${idx}_d1" value="${esc(group.distances?.[0] || '')}" />
              </div>
              <div>
                <label>Distance 2</label>
                <input name="open_${idx}_d2" value="${esc(group.distances?.[1] || '')}" />
              </div>
            </div>

            <div class="row row-2" style="margin-top:14px;">
              <div>
                <label>Distance 3</label>
                <input name="open_${idx}_d3" value="${esc(group.distances?.[2] || '')}" />
              </div>
              <div>
                <label>Distance 4</label>
                <input name="open_${idx}_d4" value="${esc(group.distances?.[3] || '')}" />
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="actions" style="margin-top:20px;">
        <button class="btn btn-primary" type="submit">Save Open Builder</button>
      </div>
    </form>
  `, { user });
}

function quadBuilderPage(user, meet) {
  return layout(`Quad Builder — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Quad Builder</h2>
        <div class="muted">Separate quad age groups and distances without cluttering standard divisions.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${meetBuilderTabs(meet, 'quad')}

    <form class="stack" method="post" action="/portal/meet/${meet.id}/builder/quad/save">
      <div class="callout">
        Quad lives here on purpose so it stays separate from normal inline standard division setup.
      </div>

      <div class="division-grid">
        ${(meet.quadBuilder || []).map((group, idx) => `
          <div class="division-card">
            <h3>${esc(group.label)}</h3>
            <div class="mini">${group.minAge} - ${group.maxAge} · ${esc(group.gender)}</div>

            <div class="toggle-row" style="margin-top:14px;">
              <div class="left">
                <div class="title">Enable ${esc(group.label)}</div>
                <div class="sub">Turn this quad group on and define distances for it.</div>
              </div>
              <label class="switch">
                <input type="checkbox" name="quad_${idx}_enabled" ${checked(group.enabled)}>
                <span class="switch-ui"></span>
                <span class="switch-label">Enabled</span>
              </label>
            </div>

            <div class="row row-2" style="margin-top:14px;">
              <div>
                <label>Distance 1</label>
                <input name="quad_${idx}_d1" value="${esc(group.distances?.[0] || '')}" />
              </div>
              <div>
                <label>Distance 2</label>
                <input name="quad_${idx}_d2" value="${esc(group.distances?.[1] || '')}" />
              </div>
            </div>

            <div class="row row-2" style="margin-top:14px;">
              <div>
                <label>Distance 3</label>
                <input name="quad_${idx}_d3" value="${esc(group.distances?.[2] || '')}" />
              </div>
              <div>
                <label>Distance 4</label>
                <input name="quad_${idx}_d4" value="${esc(group.distances?.[3] || '')}" />
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="actions" style="margin-top:20px;">
        <button class="btn btn-primary" type="submit">Save Quad Builder</button>
      </div>
    </form>
  `, { user });
}

function blockBuilderPage(user, meet) {
  const blocks = meet.blocks || [];

  return layout(`Block Builder — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Block Builder</h2>
        <div class="muted">This stays inside Meet Builder flow and controls race order / race day schedule.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${meetBuilderTabs(meet, 'blocks')}

    <div class="grid">
      ${blocks.length === 0 ? `
        <div class="card card-pad">
          <h3 style="margin-top:0;">No race blocks yet</h3>
          <p class="muted">Save your builders first and the race blocks will generate here.</p>
        </div>
      ` : blocks.map(block => {
        const races = (block.raceIds || []).map(id => getRaceById(meet, id)).filter(Boolean);
        return `
          <div class="card card-pad">
            <h3 style="margin-top:0;">${esc(block.name)}</h3>
            <div class="mini">${esc(block.day || 'Day 1')}</div>

            <div class="grid" style="margin-top:14px;">
              ${races.length === 0 ? `<div class="muted">No races assigned.</div>` : races.map(race => `
                <div class="subtle">
                  <strong>${esc(race.label)}</strong>
                  <div class="mini">${esc(race.type)} · ${esc(race.distanceLabel || '')}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `, { user });
}function registrationFormOptions(meet, reg = null) {
  const opts = reg?.options || {};
  return `
    <div class="checkbox-pills">
      <label class="checkbox-pill"><input type="checkbox" name="opt_novice" ${checked(opts.novice)}> Novice</label>
      <label class="checkbox-pill"><input type="checkbox" name="opt_elite" ${checked(opts.elite)}> Elite</label>
      ${meet.openEnabled ? `<label class="checkbox-pill"><input type="checkbox" name="opt_open" ${checked(opts.open)}> Open</label>` : ''}
      ${meet.quadEnabled ? `<label class="checkbox-pill"><input type="checkbox" name="opt_quad" ${checked(opts.quad)}> Quad</label>` : ''}
      ${meet.timeTrialsEnabled ? `<label class="checkbox-pill"><input type="checkbox" name="opt_timeTrials" ${checked(opts.timeTrials)}> Time Trials</label>` : ''}
      ${meet.relaysEnabled ? `<label class="checkbox-pill"><input type="checkbox" name="opt_relays" ${checked(opts.relays)}> Relays</label>` : ''}
    </div>
  `;
}

function publicRegistrationPage(meet, db, query = {}) {
  const closeTs = meet.registrationCloseDate
    ? new Date(`${meet.registrationCloseDate}T${meet.registrationCloseTime || '23:59'}:00`).getTime()
    : 0;
  const closed = closeTs ? Date.now() > closeTs : false;
  const canStillWalkIn = meet.allowDayOfRegistration;

  return layout(`Register — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>${esc(meet.meetName)}</h2>
        <div class="muted">
          ${meet.date ? esc(formatDateHuman(meet.date)) : 'Date TBD'} ·
          ${esc(meet.startTime || 'Time TBD')} ·
          ${esc(getDisplayRinkText(db, meet))}
        </div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/find-a-meet">← Find a Meet</a>
      </div>
    </div>

    ${query.ok ? `<div class="pill ok" style="margin-bottom:16px;">Registration submitted</div>` : ''}
    ${query.duplicate ? `<div class="pill warn" style="margin-bottom:16px;">Possible duplicate found. Please see meet staff if this was intentional.</div>` : ''}

    <div class="card card-pad">
      <div class="mini">Age Rule</div>
      <div style="font-weight:900;margin-top:6px;">${esc(meet.ageRule || AGE_RULES.USARS)}</div>
      <div class="mini" style="margin-top:10px;">Online preregistration uses birthdate. No age field needed.</div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      ${closed ? `
        <div class="pill bad" style="margin-bottom:16px;">Online registration is closed.</div>
        ${canStillWalkIn ? `<div class="callout">Day-of registration is available at the meet.</div>` : `<div class="muted">Please contact the meet director if you think this is an error.</div>`}
      ` : `
        <h3 style="margin-top:0;">Public Registration</h3>
        <form class="stack" method="post" action="/meet/${meet.id}/register">
          <div class="row row-3">
            <div>
              <label>Skater Name</label>
              <input name="name" required />
            </div>
            <div>
              <label>Birthdate</label>
              <input type="date" name="birthdate" required />
            </div>
            <div>
              <label>Gender</label>
              <select name="gender">
                <option value="girls">Girls</option>
                <option value="boys">Boys</option>
                <option value="women">Women</option>
                <option value="men">Men</option>
              </select>
            </div>
          </div>

          <div>
            <label>Team</label>
            <input list="teamListPublic" name="team" value="Independent" />
            <datalist id="teamListPublic">
              ${TEAM_LIST.map(team => `<option value="${esc(team)}">`).join('')}
            </datalist>
          </div>

          <div>
            <label>Options</label>
            ${registrationFormOptions(meet)}
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="submit">Submit Registration</button>
          </div>
        </form>
      `}
    </div>
  `, { hideNav: false });
}

function registeredPage(user, meet, query = {}) {
  const regs = [...(meet.registrations || [])].sort((a, b) => Number(a.meetNumber) - Number(b.meetNumber));
  const rows = regs.map(reg => {
    const fee = getRegistrationFeeSummary(meet, reg);
    return `
      <tr>
        <td>${reg.meetNumber || ''}</td>
        <td>
          <strong>${esc(reg.name)}</strong>
          ${reg.walkIn ? `<div class="mini">Walk-In</div>` : ''}
        </td>
        <td>${esc(formatDateHuman(reg.birthdate))}</td>
        <td>${esc(reg.calculatedAge ?? '')}</td>
        <td>${esc(reg.gender)}</td>
        <td>${esc(reg.team)}</td>
        <td>${esc(reg.divisionGroupLabel || '—')}</td>
        <td>${esc(reg.ttOpenGroupLabel || '—')}</td>
        <td>${divisionOptionsBadgeList(reg).map(v => badge(v)).join(' ') || '—'}</td>
        <td>${esc(fee.label)}</td>
        <td>
          <div class="actions">
            <a class="btn btn-ghost" href="/portal/meet/${meet.id}/registered/${reg.id}/edit">Edit</a>
            <form class="inline" method="post" action="/portal/meet/${meet.id}/registered/${reg.id}/delete" onsubmit="return confirm('Delete this racer?');">
              <button class="btn btn-danger" type="submit">Delete</button>
            </form>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return layout(`Registered — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Registered</h2>
        <div class="muted">Edit, manage, print, and handle walk-ins from here.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
        <a class="btn btn-ghost" href="/meet/${meet.id}/register" target="_blank">Open Public Registration</a>
        <a class="btn btn-primary" href="/portal/meet/${meet.id}/print/race-list" target="_blank">Print Race List</a>
      </div>
    </div>

    ${query.duplicate ? `
      <div class="pill warn" style="margin-bottom:16px;">
        Possible duplicate detected: ${esc(query.duplicate)}
      </div>
    ` : ''}

    ${meet.allowDayOfRegistration ? `
      <div class="card card-pad" style="margin-bottom:18px;">
        <h3 style="margin-top:0;">Add Walk-In Skater</h3>
        <form class="stack" method="post" action="/portal/meet/${meet.id}/registered/walk-in">
          <div class="row row-3">
            <div>
              <label>Skater Name</label>
              <input name="name" required />
            </div>
            <div>
              <label>Birthdate</label>
              <input type="date" name="birthdate" required />
            </div>
            <div>
              <label>Gender</label>
              <select name="gender">
                <option value="girls">Girls</option>
                <option value="boys">Boys</option>
                <option value="women">Women</option>
                <option value="men">Men</option>
              </select>
            </div>
          </div>

          <div class="row row-2">
            <div>
              <label>Team</label>
              <input list="teamListWalkIn" name="team" value="Independent" />
              <datalist id="teamListWalkIn">
                ${TEAM_LIST.map(team => `<option value="${esc(team)}">`).join('')}
              </datalist>
            </div>
            <div class="callout">
              Walk-ins register without late fees. They do not auto-force heats logic beyond whatever race rebuild naturally creates.
            </div>
          </div>

          <div>
            <label>Options</label>
            ${registrationFormOptions(meet)}
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="submit">Add Walk-In Skater</button>
          </div>
        </form>
      </div>
    ` : ''}

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Birthdate</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Team</th>
            <th>Division</th>
            <th>TT Open Group</th>
            <th>Options</th>
            <th>Fee Summary</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="11" class="center muted">No registrations yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `, { user });
}

function registrationEditPage(user, meet, reg, query = {}) {
  return layout(`Edit Racer — ${reg.name}`, `
    <div class="section-title">
      <div>
        <h2>Edit Racer</h2>
        <div class="muted">${esc(reg.name)}</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}/registered">← Registered</a>
      </div>
    </div>

    ${query.duplicate ? `<div class="pill warn" style="margin-bottom:16px;">Possible duplicate detected: ${esc(query.duplicate)}</div>` : ''}

    <form class="stack" method="post" action="/portal/meet/${meet.id}/registered/${reg.id}/edit">
      <div class="card card-pad">
        <div class="row row-3">
          <div>
            <label>Skater Name</label>
            <input name="name" value="${esc(reg.name || '')}" required />
          </div>
          <div>
            <label>Birthdate</label>
            <input type="date" name="birthdate" value="${esc(reg.birthdate || '')}" required />
          </div>
          <div>
            <label>Gender</label>
            <select name="gender">
              <option value="girls" ${selected(reg.gender, 'girls')}>Girls</option>
              <option value="boys" ${selected(reg.gender, 'boys')}>Boys</option>
              <option value="women" ${selected(reg.gender, 'women')}>Women</option>
              <option value="men" ${selected(reg.gender, 'men')}>Men</option>
            </select>
          </div>
        </div>

        <div class="row row-2" style="margin-top:14px;">
          <div>
            <label>Team</label>
            <input list="teamList" name="team" value="${esc(reg.team || '')}" />
            <datalist id="teamList">
              ${TEAM_LIST.map(team => `<option value="${esc(team)}">`).join('')}
            </datalist>
          </div>
          <div>
            <label>Meet Number</label>
            <input name="meetNumber" value="${esc(reg.meetNumber || '')}" />
          </div>
        </div>

        <div style="margin-top:14px;">
          <label>Options</label>
          ${registrationFormOptions(meet, reg)}
        </div>

        <div class="divider"></div>

        <div class="subtle">
          <div><strong>Calculated Age:</strong> ${esc(reg.calculatedAge ?? '—')}</div>
          <div><strong>Division:</strong> ${esc(reg.divisionGroupLabel || '—')}</div>
          <div><strong>TT Open Group:</strong> ${esc(reg.ttOpenGroupLabel || '—')}</div>
          <div><strong>Walk-In:</strong> ${reg.walkIn ? 'Yes' : 'No'}</div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" type="submit">Save Racer</button>
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}/registered">Cancel</a>
      </div>
    </form>
  `, { user });
}

function checkInPage(user, meet) {
  const rows = (meet.registrations || [])
    .sort((a, b) => {
      if (!!a.checkIn?.checkedIn === !!b.checkIn?.checkedIn) {
        return Number(a.meetNumber || 0) - Number(b.meetNumber || 0);
      }
      return a.checkIn?.checkedIn ? 1 : -1;
    })
    .map(reg => `
      <tr>
        <td>${reg.meetNumber || ''}</td>
        <td>${esc(reg.name)}</td>
        <td>${esc(reg.team)}</td>
        <td>${esc(reg.divisionGroupLabel || '')}</td>
        <td>${reg.checkIn?.checkedIn ? badge('Checked In', 'ok') : badge('Waiting', 'warn')}</td>
        <td>${reg.checkIn?.checkedInAt ? esc(formatDateTimeHuman(reg.checkIn.checkedInAt)) : '—'}</td>
        <td>
          <form class="inline" method="post" action="/portal/meet/${meet.id}/check-in/${reg.id}/toggle">
            <button class="btn ${reg.checkIn?.checkedIn ? 'btn-ghost' : 'btn-primary'}" type="submit">
              ${reg.checkIn?.checkedIn ? 'Undo Check In' : 'Check In'}
            </button>
          </form>
        </td>
      </tr>
    `).join('');

  return layout(`Check In — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Check In</h2>
        <div class="muted">Quick meet-day skater check in.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Skater</th>
            <th>Team</th>
            <th>Division</th>
            <th>Status</th>
            <th>Checked In At</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" class="center muted">No registrations yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `, { user });
}

function duplicateDecisionPage(meet, existingReg, incomingPayload, postAction, hiddenFields = {}) {
  return layout('Possible Duplicate Found', `
    <div class="section-title">
      <div>
        <h2>Possible Duplicate Found</h2>
        <div class="muted">This skater may already be registered.</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card card-pad">
        <h3 style="margin-top:0;">Existing Registration</h3>
        <div><strong>Name:</strong> ${esc(existingReg.name)}</div>
        <div><strong>Birthdate:</strong> ${esc(formatDateHuman(existingReg.birthdate))}</div>
        <div><strong>Team:</strong> ${esc(existingReg.team)}</div>
        <div><strong>Meet #:</strong> ${esc(existingReg.meetNumber)}</div>
        <div style="margin-top:10px;">${divisionOptionsBadgeList(existingReg).map(v => badge(v)).join(' ') || '—'}</div>
      </div>

      <div class="card card-pad">
        <h3 style="margin-top:0;">Incoming Registration</h3>
        <div><strong>Name:</strong> ${esc(incomingPayload.name)}</div>
        <div><strong>Birthdate:</strong> ${esc(formatDateHuman(incomingPayload.birthdate))}</div>
        <div><strong>Team:</strong> ${esc(incomingPayload.team)}</div>
        <div style="margin-top:10px;">${[
          hiddenFields.opt_novice === 'on' ? badge('Novice') : '',
          hiddenFields.opt_elite === 'on' ? badge('Elite') : '',
          hiddenFields.opt_open === 'on' ? badge('Open') : '',
          hiddenFields.opt_quad === 'on' ? badge('Quad') : '',
          hiddenFields.opt_timeTrials === 'on' ? badge('Time Trials') : '',
          hiddenFields.opt_relays === 'on' ? badge('Relays') : '',
        ].filter(Boolean).join(' ') || '—'}</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <form class="stack" method="post" action="${postAction}">
        ${Object.entries(hiddenFields).map(([k, v]) => `
          <input type="hidden" name="${esc(k)}" value="${esc(v)}" />
        `).join('')}
        <input type="hidden" name="forceDuplicateSave" value="yes" />

        <div class="actions">
          <button class="btn btn-primary" type="submit">Save Anyway</button>
          <a class="btn btn-ghost" href="/portal/meet/${meet.id}/registered">Cancel</a>
        </div>
      </form>
    </div>
  `);
}function applyRaceScoring(meet, race) {
  if (!race) return;

  const entries = Array.isArray(race.packEntries) && race.packEntries.length
    ? race.packEntries
    : Array.isArray(race.laneEntries)
      ? race.laneEntries
      : [];

  if (race.resultsMode === 'time') {
    const ranked = [...entries]
      .filter(e => Number(e.timeMs) > 0)
      .sort((a, b) => Number(a.timeMs) - Number(b.timeMs));

    ranked.forEach((entry, idx) => {
      entry.place = idx + 1;
      entry.points = scorePlaceToPoints(meet, idx + 1);
    });
    return;
  }

  entries.forEach(entry => {
    const place = Number(entry.place || 0);
    entry.points = place > 0 ? scorePlaceToPoints(meet, place) : 0;
  });
}

function advanceRacePointer(meet) {
  const bundle = getCurrentRaceBundle(meet);
  const nextIndex = Math.min(bundle.currentIndex + 1, Math.max(bundle.races.length - 1, 0));
  meet.currentRaceIndex = nextIndex;
  meet.currentRaceId = bundle.races[nextIndex]?.id || '';
}

function raceDayDirectorPage(user, meet) {
  const bundle = getCurrentRaceBundle(meet);
  const current = bundle.currentRace;
  const next = bundle.nextRace;
  const onDeck = bundle.onDeckRace;

  return layout(`Race Day Director — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Race Day</h2>
        <div class="muted">Director view for live race-day control.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${roleTabsNav(meet, 'director')}

    <div class="grid grid-3">
      <div class="card card-pad">
        <div class="mini">Current Race</div>
        <h3 style="margin:8px 0 6px;">${current ? esc(current.label) : 'No race selected'}</h3>
        <div class="muted">${current ? esc(current.type) : '—'}</div>
      </div>

      <div class="card card-pad">
        <div class="mini">Next Race</div>
        <h3 style="margin:8px 0 6px;">${next ? esc(next.label) : '—'}</h3>
        <div class="muted">${next ? esc(next.type) : 'No next race yet'}</div>
      </div>

      <div class="card card-pad">
        <div class="mini">On Deck</div>
        <h3 style="margin:8px 0 6px;">${onDeck ? esc(onDeck.label) : '—'}</h3>
        <div class="muted">${onDeck ? esc(onDeck.type) : 'No on-deck race yet'}</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <div class="actions">
        <form class="inline" method="post" action="/portal/meet/${meet.id}/race-day/previous">
          <button class="btn btn-ghost" type="submit">Previous Race</button>
        </form>
        <form class="inline" method="post" action="/portal/meet/${meet.id}/race-day/next">
          <button class="btn btn-primary" type="submit">Next Race</button>
        </form>
        <form class="inline" method="post" action="/portal/meet/${meet.id}/race-day/pause-toggle">
          <button class="btn ${meet.raceDayPaused ? 'btn-primary' : 'btn-gold'}" type="submit">
            ${meet.raceDayPaused ? 'Resume Meet' : 'Pause Meet'}
          </button>
        </form>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <h3 style="margin-top:0;">Set Current Race</h3>
      <form class="stack" method="post" action="/portal/meet/${meet.id}/race-day/set-current">
        <div>
          <label>Race</label>
          <select name="raceId">
            ${(bundle.races || []).map(r => `
              <option value="${esc(r.id)}" ${selected(meet.currentRaceId, r.id)}>${esc(r.label)}</option>
            `).join('')}
          </select>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit">Set Current Race</button>
        </div>
      </form>
    </div>
  `, { user });
}

function raceDayJudgesPage(user, meet) {
  const bundle = getCurrentRaceBundle(meet);
  const current = bundle.currentRace;

  if (!current) {
    return layout(`Judges — ${meet.meetName}`, `
      <div class="section-title">
        <div>
          <h2>Judges</h2>
          <div class="muted">No current race selected yet.</div>
        </div>
      </div>
      ${roleTabsNav(meet, 'judges')}
      <div class="card card-pad"><p class="muted">Set a current race from Director view first.</p></div>
    `, { user });
  }

  const isTime = current.resultsMode === 'time';
  const entries = current.packEntries?.length ? current.packEntries : current.laneEntries || [];

  return layout(`Judges — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Judges</h2>
        <div class="muted">${esc(current.label)}</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${roleTabsNav(meet, 'judges')}

    <form class="stack" method="post" action="/portal/meet/${meet.id}/race-day/${current.id}/judges-save">
      <div class="card card-pad">
        <div class="mini">Race Type</div>
        <h3 style="margin:8px 0 6px;">${esc(current.type)}</h3>
        <div class="muted">
          ${isTime ? 'Enter time in milliseconds or decimal milliseconds equivalent for ranking.' : 'Enter finish places for meet scoring.'}
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Meet #</th>
              <th>Skater</th>
              <th>Team</th>
              ${isTime ? '<th>Time (ms)</th><th>Place</th>' : '<th>Place</th><th>Points</th>'}
            </tr>
          </thead>
          <tbody>
            ${entries.map((entry, idx) => `
              <tr>
                <td>${current.packEntries?.length ? idx + 1 : esc(entry.lane || idx + 1)}</td>
                <td>${esc(entry.meetNumber || '')}</td>
                <td>${esc(entry.name || '')}</td>
                <td>${esc(entry.team || '')}</td>
                ${
                  isTime
                    ? `
                      <td><input name="timeMs_${idx}" value="${esc(entry.timeMs || '')}" /></td>
                      <td>${esc(entry.place || '')}</td>
                    `
                    : `
                      <td><input name="place_${idx}" value="${esc(entry.place || '')}" /></td>
                      <td>${esc(entry.points || 0)}</td>
                    `
                }
                <input type="hidden" name="entryId_${idx}" value="${esc(entry.registrationId || '')}" />
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="card card-pad">
        <label>Race Notes</label>
        <textarea name="notes">${esc(current.notes || '')}</textarea>
        <div class="actions" style="margin-top:14px;">
          <button class="btn btn-ghost" type="submit" name="action" value="save">Save</button>
          <button class="btn btn-primary" type="submit" name="action" value="close">Close Race</button>
        </div>
      </div>
    </form>
  `, { user });
}

function raceDayAnnouncerPage(user, meet) {
  const bundle = getCurrentRaceBundle(meet);
  const current = bundle.currentRace;
  const next = bundle.nextRace;

  return layout(`Announcer — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Announcer</h2>
        <div class="muted">Call current and upcoming races clearly from one screen.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${roleTabsNav(meet, 'announcer')}

    <div class="hero" style="min-height:320px;">
      <div>
        <div class="hero-kicker">${esc(meet.meetName)}</div>
        <h1>${current ? esc(current.label) : 'Waiting for Race Selection'}</h1>
        <p class="hero-subtext">${current ? 'Now Racing' : 'Set the current race from Director view.'}</p>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card card-pad">
        <h3 style="margin-top:0;">Current Race Entries</h3>
        ${
          current
            ? `
              <div class="grid">
                ${(current.packEntries?.length ? current.packEntries : current.laneEntries || []).map(entry => `
                  <div class="subtle">
                    <strong>${esc(entry.name || '')}</strong>
                    <div class="mini">#${esc(entry.meetNumber || '')} · ${esc(entry.team || '')}</div>
                  </div>
                `).join('') || '<div class="muted">No entries.</div>'}
              </div>
            `
            : '<div class="muted">No current race.</div>'
        }
      </div>

      <div class="card card-pad">
        <h3 style="margin-top:0;">Next Up</h3>
        ${next ? `
          <div class="subtle">
            <strong>${esc(next.label)}</strong>
            <div class="mini">${esc(next.type)}</div>
          </div>
        ` : `<div class="muted">No next race yet.</div>`}
      </div>
    </div>
  `, { user });
}

function raceDayCoachPage(user, meet) {
  const bundle = getCurrentRaceBundle(meet);
  const team = user.team || '';
  const current = bundle.currentRace;
  const next = bundle.nextRace;

  const teamRegs = (meet.registrations || []).filter(reg => String(reg.team || '') === String(team || ''));
  const currentEntries = current
    ? (current.packEntries?.length ? current.packEntries : current.laneEntries || []).filter(entry => teamRegs.some(reg => String(reg.id) === String(entry.registrationId)))
    : [];
  const nextEntries = next
    ? (next.packEntries?.length ? next.packEntries : next.laneEntries || []).filter(entry => teamRegs.some(reg => String(reg.id) === String(entry.registrationId)))
    : [];

  return layout(`Coach — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Coach</h2>
        <div class="muted">${esc(team || 'No team assigned')}</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${roleTabsNav(meet, 'coach')}

    <div class="grid grid-2">
      <div class="card card-pad">
        <h3 style="margin-top:0;">Your Skaters in Current Race</h3>
        ${
          currentEntries.length
            ? currentEntries.map(entry => `
                <div class="subtle" style="margin-bottom:10px;">
                  <strong>${esc(entry.name || '')}</strong>
                  <div class="mini">#${esc(entry.meetNumber || '')}</div>
                </div>
              `).join('')
            : `<div class="muted">No skaters from your team in the current race.</div>`
        }
      </div>

      <div class="card card-pad">
        <h3 style="margin-top:0;">Your Skaters Next Up</h3>
        ${
          nextEntries.length
            ? nextEntries.map(entry => `
                <div class="subtle" style="margin-bottom:10px;">
                  <strong>${esc(entry.name || '')}</strong>
                  <div class="mini">#${esc(entry.meetNumber || '')}</div>
                </div>
              `).join('')
            : `<div class="muted">No skaters from your team next up.</div>`
        }
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <h3 style="margin-top:0;">Your Team Registrations</h3>
      <div class="grid">
        ${teamRegs.length ? teamRegs.map(reg => `
          <div class="subtle">
            <strong>${esc(reg.name)}</strong>
            <div class="mini">#${esc(reg.meetNumber)} · ${esc(reg.divisionGroupLabel || '—')}</div>
          </div>
        `).join('') : '<div class="muted">No team skaters found.</div>'}
      </div>
    </div>
  `, { user });
}

function raceDayLivePage(user, meet) {
  const bundle = getCurrentRaceBundle(meet);
  const current = bundle.currentRace;
  const next = bundle.nextRace;
  const onDeck = bundle.onDeckRace;

  return layout(`Live — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Live</h2>
        <div class="muted">Clean live booth / rink-facing display.</div>
      </div>
      ${user ? `<div class="actions"><a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a></div>` : ''}
    </div>

    ${user ? roleTabsNav(meet, 'live') : ''}

    <div class="hero" style="min-height:340px;">
      <div>
        <div class="hero-kicker">${esc(meet.meetName)}</div>
        <h1>${current ? esc(current.label) : 'Waiting for Race Selection'}</h1>
        <p class="hero-subtext">${current ? 'Now Racing' : 'No current race selected yet.'}</p>
      </div>
    </div>

    <div class="grid grid-3">
      <div class="card card-pad">
        <div class="mini">Current</div>
        <h3 style="margin:8px 0 6px;">${current ? esc(current.label) : '—'}</h3>
      </div>
      <div class="card card-pad">
        <div class="mini">Next</div>
        <h3 style="margin:8px 0 6px;">${next ? esc(next.label) : '—'}</h3>
      </div>
      <div class="card card-pad">
        <div class="mini">On Deck</div>
        <h3 style="margin:8px 0 6px;">${onDeck ? esc(onDeck.label) : '—'}</h3>
      </div>
    </div>
  `, { user });
}

function resultsPage(meet, query = {}) {
  const divisionStandings = meet.results?.standingsByDivision || [];
  const openStandings = meet.results?.standingsByOpenGroup || [];
  const ttStandings = meet.results?.timeTrialsByOpenGroup || [];

  return layout(`Results — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>${esc(meet.meetName)} Results</h2>
        <div class="muted">Live public results, meet standings, and time trial group output.</div>
      </div>
    </div>

    ${query.smsok ? `<div class="pill ok" style="margin-bottom:16px;">Text alert signup saved</div>` : ''}
    ${query.smsbad ? `<div class="pill warn" style="margin-bottom:16px;">Unable to save that text signup</div>` : ''}

    <div class="card card-pad" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">Get Text Alerts</h3>
      <div class="mini" style="margin-bottom:14px;">Enter your racer’s race day number and your phone number for meet-specific alerts.</div>
      <form class="stack" method="post" action="/results/${meet.id}/text-alerts">
        <div class="row row-2">
          <div>
            <label>Race Day Number</label>
            <input name="meetNumber" required />
          </div>
          <div>
            <label>Phone Number</label>
            <input name="phone" required />
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit">Save Text Alerts</button>
        </div>
      </form>
    </div>

    <div class="grid">
      ${divisionStandings.map(bucket => `
        <div class="card card-pad">
          <h3 style="margin-top:0;">${esc(bucket.label)}</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>#</th>
                  <th>Skater</th>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Races</th>
                </tr>
              </thead>
              <tbody>
                ${bucket.rows.map(row => `
                  <tr>
                    <td>${esc(row.rank)}</td>
                    <td>${esc(row.meetNumber)}</td>
                    <td>${esc(row.name)}</td>
                    <td>${esc(row.team)}</td>
                    <td>${esc(row.totalPoints)}</td>
                    <td>${esc(row.raceCount)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="6" class="center muted">No standings yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}

      ${openStandings.map(bucket => `
        <div class="card card-pad">
          <h3 style="margin-top:0;">${esc(bucket.label)} Open Standings</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>#</th>
                  <th>Skater</th>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Races</th>
                </tr>
              </thead>
              <tbody>
                ${bucket.rows.map(row => `
                  <tr>
                    <td>${esc(row.rank)}</td>
                    <td>${esc(row.meetNumber)}</td>
                    <td>${esc(row.name)}</td>
                    <td>${esc(row.team)}</td>
                    <td>${esc(row.totalPoints)}</td>
                    <td>${esc(row.raceCount)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="6" class="center muted">No standings yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}

      ${ttStandings.map(bucket => `
        <div class="card card-pad">
          <h3 style="margin-top:0;">${esc(bucket.label)} Time Trial Standings</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>#</th>
                  <th>Skater</th>
                  <th>Team</th>
                  <th>Points</th>
                  <th>Races</th>
                </tr>
              </thead>
              <tbody>
                ${bucket.rows.map(row => `
                  <tr>
                    <td>${esc(row.rank)}</td>
                    <td>${esc(row.meetNumber)}</td>
                    <td>${esc(row.name)}</td>
                    <td>${esc(row.team)}</td>
                    <td>${esc(row.totalPoints)}</td>
                    <td>${esc(row.raceCount)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="6" class="center muted">No standings yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}

      ${(divisionStandings.length + openStandings.length + ttStandings.length) === 0 ? `
        <div class="card card-pad">
          <h3 style="margin-top:0;">No results yet</h3>
          <p class="muted">Race results and standings will appear here once judges start closing races.</p>
        </div>
      ` : ''}
    </div>
  `, { hideNav: false });
}

function printRaceListPage(meet) {
  const rows = getSortedRaces(meet).map((race, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(race.label)}</td>
      <td>${esc(race.type)}</td>
      <td>${esc(race.distanceLabel || '')}</td>
      <td>${esc(getBlockById(meet, race.blockId)?.name || '—')}</td>
      <td>${esc((race.packEntries?.length || race.laneEntries?.length || 0))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(meet.meetName)} — Race List</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
    h1 { margin: 0 0 8px; }
    .meta { color: #555; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #ddd; text-align: left; font-size: 13px; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${esc(meet.meetName)}</h1>
  <div class="meta">${meet.date ? esc(formatDateHuman(meet.date)) : 'No date set'} · ${esc(meet.startTime || 'No start time')}</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Race</th>
        <th>Type</th>
        <th>Distance</th>
        <th>Block</th>
        <th>Entries</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="6">No races yet.</td></tr>`}
    </tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}function getRoleRedirectForUser(user, db) {
  const meets = (db.meets || [])
    .filter(meet => canEditMeet(user, meet) || hasRole(user, USER_ROLES.JUDGE) || hasRole(user, USER_ROLES.ANNOUNCER) || hasRole(user, USER_ROLES.COACH) || hasRole(user, USER_ROLES.CHECKIN))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const firstMeet = meets[0];
  if (!firstMeet) return '/portal';

  if (hasRole(user, USER_ROLES.MEET_DIRECTOR) || hasRole(user, USER_ROLES.SUPER_ADMIN)) {
    return '/portal';
  }
  if (hasRole(user, USER_ROLES.JUDGE)) {
    return `/portal/meet/${firstMeet.id}/race-day/judges`;
  }
  if (hasRole(user, USER_ROLES.ANNOUNCER)) {
    return `/portal/meet/${firstMeet.id}/race-day/announcer`;
  }
  if (hasRole(user, USER_ROLES.COACH)) {
    return `/portal/meet/${firstMeet.id}/race-day/coach`;
  }
  if (hasRole(user, USER_ROLES.CHECKIN)) {
    return `/portal/meet/${firstMeet.id}/check-in`;
  }

  return '/portal';
}

app.get('/', (req, res) => {
  const session = getSessionUser(req);
  res.send(homePage(session?.user || null));
});

app.get('/find-a-meet', (req, res) => {
  const db = loadDb();
  const user = getSessionUser(req)?.user || null;
  res.send(findAMeetPage(user, db));
});

app.get('/find-a-rink', (req, res) => {
  const db = loadDb();
  const user = getSessionUser(req)?.user || null;
  res.send(findARinkPage(user, db));
});

app.get('/admin/login', (req, res) => {
  res.send(loginPage());
});

app.post('/admin/login', (req, res) => {
  const db = loadDb();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  const user = (db.users || []).find(u =>
    u.username === username &&
    u.password === password &&
    u.active !== false
  );

  if (!user) {
    return res.send(loginPage('Invalid username or password.'));
  }

  const token = crypto.randomBytes(24).toString('hex');
  db.sessions = (db.sessions || []).filter(s => s.userId !== user.id);
  db.sessions.push({
    token,
    userId: user.id,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  saveDb(db);
  setCookie(res, SESSION_COOKIE, token, Math.floor(SESSION_TTL_MS / 1000));
  res.redirect(getRoleRedirectForUser(user, db));
});

app.get('/admin/logout', (req, res) => {
  const db = loadDb();
  const token = parseCookies(req)[SESSION_COOKIE];
  db.sessions = (db.sessions || []).filter(s => s.token !== token);
  saveDb(db);
  clearCookie(res, SESSION_COOKIE);
  res.redirect('/');
});

app.get('/portal', requireRole(
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.MEET_DIRECTOR,
  USER_ROLES.JUDGE,
  USER_ROLES.ANNOUNCER,
  USER_ROLES.COACH,
  USER_ROLES.CHECKIN
), (req, res) => {
  if (!(hasRole(req.user, USER_ROLES.SUPER_ADMIN) || hasRole(req.user, USER_ROLES.MEET_DIRECTOR))) {
    return res.redirect(getRoleRedirectForUser(req.user, req.db));
  }
  res.send(portalPage(req.user, req.db));
});

app.get('/portal/new-meet', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = defaultMeet(req.user.id);
  meet.id = nextId(req.db.meets);
  req.db.meets.push(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.get('/portal/users', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  if (!hasRole(req.user, USER_ROLES.SUPER_ADMIN) && !hasRole(req.user, USER_ROLES.MEET_DIRECTOR)) {
    return res.status(403).send('Forbidden');
  }
  res.send(usersPage(req.user, req.db));
});

app.post('/portal/users/create', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!username) return res.redirect('/portal/users');

  const exists = (req.db.users || []).some(u => String(u.username).toLowerCase() === username.toLowerCase());
  if (exists) return res.redirect('/portal/users');

  const roles = [];
  if (req.body.role_meet_director === 'on') roles.push(USER_ROLES.MEET_DIRECTOR);
  if (req.body.role_judge === 'on') roles.push(USER_ROLES.JUDGE);
  if (req.body.role_announcer === 'on') roles.push(USER_ROLES.ANNOUNCER);
  if (req.body.role_coach === 'on') roles.push(USER_ROLES.COACH);
  if (req.body.role_checkin === 'on') roles.push(USER_ROLES.CHECKIN);

  req.db.users.push({
    id: nextId(req.db.users),
    username,
    password: String(req.body.password || '').trim(),
    displayName: String(req.body.displayName || '').trim(),
    roles,
    team: String(req.body.team || 'Independent').trim() || 'Independent',
    active: true,
    createdAt: nowIso(),
  });

  saveDb(req.db);
  res.redirect('/portal/users');
});

app.get('/portal/users/:userId/edit', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const targetUser = (req.db.users || []).find(u => Number(u.id) === Number(req.params.userId));
  if (!targetUser) return res.redirect('/portal/users');
  res.send(editUserPage(req.user, targetUser));
});

app.post('/portal/users/:userId/edit', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const targetUser = (req.db.users || []).find(u => Number(u.id) === Number(req.params.userId));
  if (!targetUser) return res.redirect('/portal/users');

  const roles = [];
  if (req.body.role_meet_director === 'on') roles.push(USER_ROLES.MEET_DIRECTOR);
  if (req.body.role_judge === 'on') roles.push(USER_ROLES.JUDGE);
  if (req.body.role_announcer === 'on') roles.push(USER_ROLES.ANNOUNCER);
  if (req.body.role_coach === 'on') roles.push(USER_ROLES.COACH);
  if (req.body.role_checkin === 'on') roles.push(USER_ROLES.CHECKIN);
  if (hasRole(targetUser, USER_ROLES.SUPER_ADMIN)) roles.unshift(USER_ROLES.SUPER_ADMIN);

  targetUser.displayName = String(req.body.displayName || '').trim();
  targetUser.username = String(req.body.username || '').trim();
  targetUser.password = String(req.body.password || '').trim();
  targetUser.team = String(req.body.team || 'Independent').trim() || 'Independent';
  targetUser.roles = [...new Set(roles)];

  saveDb(req.db);
  res.redirect('/portal/users');
});

app.post('/portal/users/:userId/toggle-active', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const targetUser = (req.db.users || []).find(u => Number(u.id) === Number(req.params.userId));
  if (!targetUser || Number(targetUser.id) === 1) return res.redirect('/portal/users');

  targetUser.active = targetUser.active === false;
  saveDb(req.db);
  res.redirect('/portal/users');
});

app.get('/portal/meet/:meetId', requireRole(
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.MEET_DIRECTOR,
  USER_ROLES.JUDGE,
  USER_ROLES.ANNOUNCER,
  USER_ROLES.COACH,
  USER_ROLES.CHECKIN
), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  res.send(meetDashboardPage(req.user, meet, req.db));
});

app.post('/portal/meet/:meetId/delete', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  req.db.meets = (req.db.meets || []).filter(m => Number(m.id) !== Number(meet.id));
  saveDb(req.db);
  res.redirect('/portal');
});

app.post('/portal/meet/:meetId/publish-toggle', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.showOnFindAMeet = !meet.showOnFindAMeet;
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}`);
});

app.get('/portal/meet/:meetId/builder', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  res.send(meetBuilderPage(req.user, meet, req.db));
});

app.post('/portal/meet/:meetId/builder/save', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.meetName = String(req.body.meetName || '').trim() || 'Untitled Meet';
  meet.date = String(req.body.date || '').trim();
  meet.startTime = String(req.body.startTime || '').trim();
  meet.registrationCloseDate = String(req.body.registrationCloseDate || '').trim();
  meet.registrationCloseTime = String(req.body.registrationCloseTime || '').trim();
  meet.meetNotes = String(req.body.meetNotes || '').trim();
  meet.status = String(req.body.status || 'Draft').trim() || 'Draft';

  meet.ageRule = String(req.body.ageRule || AGE_RULES.USARS);
  meet.customAgeCutoffDate = String(req.body.customAgeCutoffDate || '').trim();

  meet.trackLength = parseNumber(req.body.trackLength, 100);
  meet.lanes = parseNumber(req.body.lanes, 4);
  meet.rinkMode = String(req.body.rinkMode || 'saved');
  meet.rinkId = parseNumber(req.body.rinkId, 1);
  meet.customRinkName = String(req.body.customRinkName || '').trim();
  meet.customCity = String(req.body.customCity || '').trim();
  meet.customState = String(req.body.customState || '').trim();

  meet.timeTrialsEnabled = !!req.body.timeTrialsEnabled;
  meet.openEnabled = !!req.body.openEnabled;
  meet.quadEnabled = !!req.body.quadEnabled;
  meet.relaysEnabled = !!req.body.relaysEnabled;
  meet.allowDayOfRegistration = !!req.body.allowDayOfRegistration;
  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;
  meet.showOnFindAMeet = !!req.body.showOnFindAMeet;

  (meet.groups || []).forEach((group, idx) => {
    STANDARD_DIVISION_KEYS.forEach(key => {
      const div = group.divisions?.[key] || buildDivisionTemplate();
      div.enabled = !!req.body[`g_${idx}_${key}_enabled`];
      div.cost = parseNumber(req.body[`g_${idx}_${key}_cost`], 0);
      div.distances = [
        String(req.body[`g_${idx}_${key}_d1`] || '').trim(),
        String(req.body[`g_${idx}_${key}_d2`] || '').trim(),
        String(req.body[`g_${idx}_${key}_d3`] || '').trim(),
        String(req.body[`g_${idx}_${key}_d4`] || '').trim(),
      ];
      group.divisions[key] = div;
    });
  });

  rebuildRacesForMeet(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.get('/portal/meet/:meetId/builder/open', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  res.send(openBuilderPage(req.user, meet));
});

app.post('/portal/meet/:meetId/builder/open/save', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  (meet.openBuilder || []).forEach((group, idx) => {
    group.enabled = !!req.body[`open_${idx}_enabled`];
    group.distances = [
      String(req.body[`open_${idx}_d1`] || '').trim(),
      String(req.body[`open_${idx}_d2`] || '').trim(),
      String(req.body[`open_${idx}_d3`] || '').trim(),
      String(req.body[`open_${idx}_d4`] || '').trim(),
    ];
  });

  rebuildRacesForMeet(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder/open`);
});

app.get('/portal/meet/:meetId/builder/quad', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  res.send(quadBuilderPage(req.user, meet));
});

app.post('/portal/meet/:meetId/builder/quad/save', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  (meet.quadBuilder || []).forEach((group, idx) => {
    group.enabled = !!req.body[`quad_${idx}_enabled`];
    group.distances = [
      String(req.body[`quad_${idx}_d1`] || '').trim(),
      String(req.body[`quad_${idx}_d2`] || '').trim(),
      String(req.body[`quad_${idx}_d3`] || '').trim(),
      String(req.body[`quad_${idx}_d4`] || '').trim(),
    ];
  });

  rebuildRacesForMeet(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder/quad`);
});

app.get('/portal/meet/:meetId/builder/blocks', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  res.send(blockBuilderPage(req.user, meet));
});

app.get('/meet/:meetId/register', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.status(404).send('Meet not found');
  res.send(publicRegistrationPage(meet, db, req.query || {}));
});

app.post('/meet/:meetId/register', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.status(404).send('Meet not found');

  const closeTs = meet.registrationCloseDate
    ? new Date(`${meet.registrationCloseDate}T${meet.registrationCloseTime || '23:59'}:00`).getTime()
    : 0;
  const closed = closeTs ? Date.now() > closeTs : false;
  if (closed) return res.redirect(`/meet/${meet.id}/register`);

  const payload = {
    name: req.body.name,
    birthdate: req.body.birthdate,
    gender: req.body.gender,
    team: req.body.team,
  };

  const duplicate = findPotentialDuplicate(meet, payload);
  if (duplicate && req.body.forceDuplicateSave !== 'yes') {
    return res.redirect(`/meet/${meet.id}/register?duplicate=1`);
  }

  const reg = buildRegistrationFromBody(meet, req.body, { walkIn: false });
  meet.registrations.push(reg);
  rebuildMeetNumbers(meet);
  rebuildRacesForMeet(meet);
  saveDb(db);

  res.redirect(`/meet/${meet.id}/register?ok=1`);
});

app.get('/portal/meet/:meetId/registered', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  res.send(registeredPage(req.user, meet, req.query || {}));
});

app.post('/portal/meet/:meetId/registered/walk-in', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  if (!meet.allowDayOfRegistration) return res.redirect(`/portal/meet/${meet.id}/registered`);

  const payload = {
    name: req.body.name,
    birthdate: req.body.birthdate,
    gender: req.body.gender,
    team: req.body.team,
  };

  const duplicate = findPotentialDuplicate(meet, payload);
  if (duplicate && req.body.forceDuplicateSave !== 'yes') {
    return res.send(duplicateDecisionPage(
      meet,
      duplicate,
      payload,
      `/portal/meet/${meet.id}/registered/walk-in`,
      {
        name: String(req.body.name || ''),
        birthdate: String(req.body.birthdate || ''),
        gender: String(req.body.gender || ''),
        team: String(req.body.team || ''),
        opt_novice: req.body.opt_novice === 'on' ? 'on' : '',
        opt_elite: req.body.opt_elite === 'on' ? 'on' : '',
        opt_open: req.body.opt_open === 'on' ? 'on' : '',
        opt_quad: req.body.opt_quad === 'on' ? 'on' : '',
        opt_timeTrials: req.body.opt_timeTrials === 'on' ? 'on' : '',
        opt_relays: req.body.opt_relays === 'on' ? 'on' : '',
      }
    ));
  }

  const reg = buildRegistrationFromBody(meet, req.body, { walkIn: true });
  meet.registrations.push(reg);
  rebuildMeetNumbers(meet);
  rebuildRacesForMeet(meet);
  saveDb(req.db);

  res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.get('/portal/meet/:meetId/registered/:regId/edit', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => String(r.id) === String(req.params.regId));
  if (!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);

  res.send(registrationEditPage(req.user, meet, reg, req.query || {}));
});

app.post('/portal/meet/:meetId/registered/:regId/edit', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const regIndex = (meet.registrations || []).findIndex(r => String(r.id) === String(req.params.regId));
  if (regIndex < 0) return res.redirect(`/portal/meet/${meet.id}/registered`);

  const existing = meet.registrations[regIndex];
  const payload = {
    name: req.body.name,
    birthdate: req.body.birthdate,
    gender: req.body.gender,
    team: req.body.team,
  };

  const duplicate = findPotentialDuplicate(meet, payload, existing.id);
  if (duplicate && req.body.forceDuplicateSave !== 'yes') {
    return res.send(duplicateDecisionPage(
      meet,
      duplicate,
      payload,
      `/portal/meet/${meet.id}/registered/${existing.id}/edit`,
      {
        name: String(req.body.name || ''),
        birthdate: String(req.body.birthdate || ''),
        gender: String(req.body.gender || ''),
        team: String(req.body.team || ''),
        meetNumber: String(req.body.meetNumber || ''),
        opt_novice: req.body.opt_novice === 'on' ? 'on' : '',
        opt_elite: req.body.opt_elite === 'on' ? 'on' : '',
        opt_open: req.body.opt_open === 'on' ? 'on' : '',
        opt_quad: req.body.opt_quad === 'on' ? 'on' : '',
        opt_timeTrials: req.body.opt_timeTrials === 'on' ? 'on' : '',
        opt_relays: req.body.opt_relays === 'on' ? 'on' : '',
      }
    ));
  }

  const rebuilt = buildRegistrationFromBody(meet, req.body, {
    id: existing.id,
    createdAt: existing.createdAt,
    walkIn: existing.walkIn,
    meetNumber: parseNumber(req.body.meetNumber, existing.meetNumber),
    checkedIn: existing.checkIn?.checkedIn,
    checkedInAt: existing.checkIn?.checkedInAt || '',
  });

  meet.registrations[regIndex] = rebuilt;
  rebuildRacesForMeet(meet);
  saveDb(req.db);

  res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.post('/portal/meet/:meetId/registered/:regId/delete', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.registrations = (meet.registrations || []).filter(r => String(r.id) !== String(req.params.regId));
  rebuildMeetNumbers(meet);
  rebuildRacesForMeet(meet);
  saveDb(req.db);

  res.redirect(`/portal/meet/${meet.id}/registered`);
});app.get('/portal/meet/:meetId/check-in', requireRole(
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.MEET_DIRECTOR,
  USER_ROLES.CHECKIN,
  USER_ROLES.JUDGE
), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  res.send(checkInPage(req.user, meet));
});

app.post('/portal/meet/:meetId/check-in/:regId/toggle', requireRole(
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.MEET_DIRECTOR,
  USER_ROLES.CHECKIN,
  USER_ROLES.JUDGE
), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => String(r.id) === String(req.params.regId));
  if (!reg) return res.redirect(`/portal/meet/${meet.id}/check-in`);

  reg.checkIn = reg.checkIn || { checkedIn: false, checkedInAt: '' };
  reg.checkIn.checkedIn = !reg.checkIn.checkedIn;
  reg.checkIn.checkedInAt = reg.checkIn.checkedIn ? nowIso() : '';

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/check-in`);
});

app.get('/portal/meet/:meetId/race-day/director', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  ensureRaceProgressPointer(meet);
  saveDb(req.db);
  res.send(raceDayDirectorPage(req.user, meet));
});

app.get('/portal/meet/:meetId/race-day/judges', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR, USER_ROLES.JUDGE), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  ensureRaceProgressPointer(meet);
  saveDb(req.db);
  res.send(raceDayJudgesPage(req.user, meet));
});

app.get('/portal/meet/:meetId/race-day/announcer', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR, USER_ROLES.ANNOUNCER), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  ensureRaceProgressPointer(meet);
  saveDb(req.db);
  res.send(raceDayAnnouncerPage(req.user, meet));
});

app.get('/portal/meet/:meetId/race-day/coach', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR, USER_ROLES.COACH), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  ensureRaceProgressPointer(meet);
  saveDb(req.db);
  res.send(raceDayCoachPage(req.user, meet));
});

app.get('/portal/meet/:meetId/race-day/live', requireRole(
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.MEET_DIRECTOR,
  USER_ROLES.JUDGE,
  USER_ROLES.ANNOUNCER,
  USER_ROLES.COACH
), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  ensureRaceProgressPointer(meet);
  saveDb(req.db);
  res.send(raceDayLivePage(req.user, meet));
});

app.post('/portal/meet/:meetId/race-day/set-current', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const bundle = getCurrentRaceBundle(meet);
  const idx = (bundle.races || []).findIndex(r => String(r.id) === String(req.body.raceId || ''));
  if (idx >= 0) {
    meet.currentRaceIndex = idx;
    meet.currentRaceId = bundle.races[idx].id;
    saveDb(req.db);
  }

  res.redirect(`/portal/meet/${meet.id}/race-day/director`);
});

app.post('/portal/meet/:meetId/race-day/next', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const bundle = getCurrentRaceBundle(meet);
  const nextIndex = Math.min(bundle.currentIndex + 1, Math.max((bundle.races || []).length - 1, 0));
  meet.currentRaceIndex = nextIndex;
  meet.currentRaceId = bundle.races[nextIndex]?.id || '';
  saveDb(req.db);

  res.redirect(`/portal/meet/${meet.id}/race-day/director`);
});

app.post('/portal/meet/:meetId/race-day/previous', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const bundle = getCurrentRaceBundle(meet);
  const prevIndex = Math.max(bundle.currentIndex - 1, 0);
  meet.currentRaceIndex = prevIndex;
  meet.currentRaceId = bundle.races[prevIndex]?.id || '';
  saveDb(req.db);

  res.redirect(`/portal/meet/${meet.id}/race-day/director`);
});

app.post('/portal/meet/:meetId/race-day/pause-toggle', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.raceDayPaused = !meet.raceDayPaused;
  saveDb(req.db);

  res.redirect(`/portal/meet/${meet.id}/race-day/director`);
});

app.post('/portal/meet/:meetId/race-day/:raceId/judges-save', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR, USER_ROLES.JUDGE), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const race = getRaceById(meet, req.params.raceId);
  if (!race) return res.redirect(`/portal/meet/${meet.id}/race-day/judges`);

  race.notes = String(req.body.notes || '').trim();

  if (race.resultsMode === 'time') {
    race.laneEntries = (race.laneEntries || []).map((entry, idx) => ({
      ...entry,
      timeMs: parseNumber(req.body[`timeMs_${idx}`], ''),
    }));
  } else if (race.packEntries?.length) {
    race.packEntries = (race.packEntries || []).map((entry, idx) => ({
      ...entry,
      place: parseNumber(req.body[`place_${idx}`], ''),
    }));
  } else {
    race.laneEntries = (race.laneEntries || []).map((entry, idx) => ({
      ...entry,
      place: parseNumber(req.body[`place_${idx}`], ''),
    }));
  }

  applyRaceScoring(meet, race);

  if (String(req.body.action || '') === 'close') {
    race.status = 'closed';
    race.closedAt = nowIso();
    recomputeStandings(meet);
    advanceRacePointer(meet);
  } else {
    race.status = 'open';
    recomputeStandings(meet);
  }

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
});

app.get('/live/:meetId', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.status(404).send('Meet not found');
  ensureRaceProgressPointer(meet);
  res.send(raceDayLivePage(null, meet));
});

app.get('/results/:meetId', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.status(404).send('Meet not found');
  recomputeStandings(meet);
  saveDb(db);
  res.send(resultsPage(meet, req.query || {}));
});

app.post('/results/:meetId/text-alerts', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.redirect('/find-a-meet');

  const meetNumber = parseNumber(req.body.meetNumber, 0);
  const phone = String(req.body.phone || '').trim();

  const reg = (meet.registrations || []).find(r => Number(r.meetNumber) === Number(meetNumber));
  if (!reg || !phone) {
    return res.redirect(`/results/${meet.id}?smsbad=1`);
  }

  const existing = (meet.textSubscribers || []).find(sub =>
    Number(sub.meetNumber) === Number(meetNumber) &&
    String(sub.phone || '') === phone
  );

  if (!existing) {
    meet.textSubscribers.push({
      id: crypto.randomBytes(6).toString('hex'),
      meetNumber,
      registrationId: reg.id,
      phone,
      createdAt: nowIso(),
    });
    saveDb(db);
  }

  res.redirect(`/results/${meet.id}?smsok=1`);
});

app.get('/portal/meet/:meetId/print/race-list', requireRole(
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.MEET_DIRECTOR,
  USER_ROLES.JUDGE,
  USER_ROLES.CHECKIN,
  USER_ROLES.COACH
), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  res.send(printRaceListPage(meet));
});

app.use((req, res) => {
  res.status(404).send(layout('Not Found', `
    <div class="card card-pad">
      <h2 style="margin-top:0;">Page not found</h2>
      <p class="muted">The page you were looking for does not exist.</p>
      <div class="actions">
        <a class="btn btn-primary" href="/">Go Home</a>
      </div>
    </div>
  `));
});

app.listen(PORT, HOST, () => {
  console.log(`SpeedSkateMeet v${DATA_VERSION} listening on ${HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});