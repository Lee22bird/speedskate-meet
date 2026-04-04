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

const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  MEET_DIRECTOR: 'meet_director',
  JUDGE: 'judge',
  ANNOUNCER: 'announcer',
  COACH: 'coach',
  CHECKIN: 'checkin',
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

const AGE_RULES = {
  USARS: 'USARS Rule',
  MEET_DATE: 'Age on Meet Date',
  CUSTOM: 'Custom Date',
};

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

const STANDARD_DIVISION_KEYS = ['novice', 'elite'];

const INLINE_POINTS_TABLE = {
  1: 13,
  2: 8,
  3: 5,
  4: 3,
  5: 2,
  6: 1,
};

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

function normalizeGender(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['girl', 'girls', 'lady', 'ladies', 'woman', 'women', 'female', 'f'].includes(raw)) {
    return raw.includes('girl') ? 'girls' : 'women';
  }
  if (['boy', 'boys', 'man', 'men', 'male', 'm'].includes(raw)) {
    return raw.includes('boy') ? 'boys' : 'men';
  }
  return 'boys';
}

function ageToCompetitionGender(gender, age) {
  const g = normalizeGender(gender);
  if (g === 'girls' || g === 'boys') {
    if (Number(age) >= 14) {
      return g === 'girls' ? 'women' : 'men';
    }
    return g;
  }
  if (g === 'women' || g === 'men') {
    if (Number(age) <= 13) {
      return g === 'women' ? 'girls' : 'boys';
    }
    return g;
  }
  return g;
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

function compareBirthdateYoungestFirst(a, b) {
  const aDate = new Date(`${a.birthdate}T12:00:00`).getTime();
  const bDate = new Date(`${b.birthdate}T12:00:00`).getTime();
  return bDate - aDate;
}

function formatDateForInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
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

function toMoney(v) {
  const n = Number(v || 0);
  return `$${n.toFixed(2)}`;
}

function parseNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function selected(value, expected) {
  return String(value || '') === String(expected) ? 'selected' : '';
}

function checked(value) {
  return value ? 'checked' : '';
}

function buildDivisionTemplate() {
  return {
    enabled: false,
    cost: 0,
    distances: ['', '', '', ''],
  };
}

function baseGroups() {
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
      open: buildDivisionTemplate(),
      quad: buildDivisionTemplate(),
    },
  }));
}function buildSpecialGroups() {
  return OPEN_TT_GROUPS.map(group => ({
    id: group.id,
    label: group.label,
    gender: group.gender,
    minAge: group.minAge,
    maxAge: group.maxAge,
    enabled: false,
    cost: 0,
    distances: ['', '', '', ''],
  }));
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
    allowDayOfRegistration: false,
    judgesPanelRequired: true,
    showOnFindAMeet: true,
    meetNotes: '',
    ageRule: AGE_RULES.USARS,
    customAgeCutoffDate: '',
    groups: baseGroups(),
    openGroups: buildSpecialGroups(),
    quadGroups: buildSpecialGroups(),
    registrations: [],
    races: [],
    blocks: [],
    scheduleItems: [],
    assignments: {
      judges: [],
      announcers: [],
      coaches: [],
      checkin: [],
    },
    currentRaceId: '',
    currentRaceIndex: -1,
    raceDayPaused: false,
    results: {
      timeTrialsByOpenGroup: [],
      inlineStandings: [],
      quadStandings: [],
      openResults: [],
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
        roles: [USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR, USER_ROLES.JUDGE, USER_ROLES.COACH],
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

function normalizeSpecialGroups(groups) {
  const defaults = buildSpecialGroups();
  const byId = new Map((groups || []).map(g => [g.id, g]));
  return defaults.map(group => {
    const existing = byId.get(group.id) || {};
    return {
      ...group,
      enabled: !!existing.enabled,
      cost: Number(existing.cost || 0),
      distances: Array.isArray(existing.distances)
        ? [0, 1, 2, 3].map(i => String(existing.distances[i] || '').trim())
        : ['', '', '', ''],
    };
  });
}

function migrateMeet(meet, fallbackOwnerId) {
  if (!meet.createdByUserId) meet.createdByUserId = fallbackOwnerId;
  if (!Array.isArray(meet.groups) || meet.groups.length === 0) meet.groups = baseGroups();
  if (!Array.isArray(meet.openGroups)) meet.openGroups = buildSpecialGroups();
  if (!Array.isArray(meet.quadGroups)) meet.quadGroups = buildSpecialGroups();
  if (!Array.isArray(meet.registrations)) meet.registrations = [];
  if (!Array.isArray(meet.races)) meet.races = [];
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (!Array.isArray(meet.scheduleItems)) meet.scheduleItems = [];
  if (!meet.assignments || typeof meet.assignments !== 'object') meet.assignments = {};
  if (!Array.isArray(meet.assignments.judges)) meet.assignments.judges = [];
  if (!Array.isArray(meet.assignments.announcers)) meet.assignments.announcers = [];
  if (!Array.isArray(meet.assignments.coaches)) meet.assignments.coaches = [];
  if (!Array.isArray(meet.assignments.checkin)) meet.assignments.checkin = [];
  if (!meet.results || typeof meet.results !== 'object') meet.results = {};
  if (!Array.isArray(meet.results.timeTrialsByOpenGroup)) meet.results.timeTrialsByOpenGroup = [];
  if (!Array.isArray(meet.results.inlineStandings)) meet.results.inlineStandings = [];
  if (!Array.isArray(meet.results.quadStandings)) meet.results.quadStandings = [];
  if (!Array.isArray(meet.results.openResults)) meet.results.openResults = [];

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

  const freshGroups = baseGroups();
  const byId = new Map((meet.groups || []).map(g => [g.id, g]));

  meet.groups = freshGroups.map(group => {
    const existing = byId.get(group.id) || {};
    return {
      ...group,
      divisions: {
        novice: normalizeDivisionBlock(existing.divisions?.novice),
        elite: normalizeDivisionBlock(existing.divisions?.elite),
        open: normalizeDivisionBlock(existing.divisions?.open),
        quad: normalizeDivisionBlock(existing.divisions?.quad),
      },
    };
  });

  meet.openGroups = normalizeSpecialGroups(meet.openGroups);
  meet.quadGroups = normalizeSpecialGroups(meet.quadGroups);

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
    scoringBucket: String(race.scoringBucket || ''),
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
    minAge: Number(race.minAge || 0),
    maxAge: Number(race.maxAge || 999),
    gender: String(race.gender || ''),
  }));

  meet.blocks = meet.blocks.map((block, idx) => ({
    id: block.id || `block_${idx + 1}`,
    name: String(block.name || `Block ${idx + 1}`),
    day: String(block.day || 'Day 1'),
    notes: String(block.notes || ''),
    raceIds: Array.isArray(block.raceIds) ? block.raceIds : [],
  }));

  meet.scheduleItems = meet.scheduleItems.map((item, idx) => ({
    id: item.id || `schedule_${idx + 1}`,
    label: String(item.label || 'Schedule Item'),
    kind: String(item.kind || 'break'),
    day: String(item.day || 'Day 1'),
    notes: String(item.notes || ''),
    order: Number(item.order || idx + 1),
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

  db.sessions = db.sessions.filter(s => s.expiresAt && new Date(s.expiresAt).getTime() > Date.now());
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
}function roleHomePath(user) {
  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) return '/portal';
  if (hasRole(user, USER_ROLES.JUDGE)) return '/judge';
  if (hasRole(user, USER_ROLES.ANNOUNCER)) return '/announcer';
  if (hasRole(user, USER_ROLES.COACH)) return '/coach';
  if (hasRole(user, USER_ROLES.CHECKIN)) return '/checkin';
  return '/portal';
}

function roleBackLabel(user) {
  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) {
    return '← Meet Dashboard';
  }
  return '← Back to My Meets';
}

function roleBackHref(user, meet) {
  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) {
    return `/portal/meet/${meet.id}`;
  }
  if (hasRole(user, USER_ROLES.JUDGE)) return '/judge';
  if (hasRole(user, USER_ROLES.ANNOUNCER)) return '/announcer';
  if (hasRole(user, USER_ROLES.COACH)) return '/coach';
  if (hasRole(user, USER_ROLES.CHECKIN)) return '/checkin';
  return '/portal';
}

function getAssignedMeetsForUser(db, user) {
  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) {
    return (db.meets || []).filter(meet => canEditMeet(user, meet));
  }

  return (db.meets || []).filter(meet => {
    const a = meet.assignments || {};
    return (
      (hasRole(user, USER_ROLES.JUDGE) && (a.judges || []).includes(user.id)) ||
      (hasRole(user, USER_ROLES.ANNOUNCER) && (a.announcers || []).includes(user.id)) ||
      (hasRole(user, USER_ROLES.COACH) && (a.coaches || []).includes(user.id)) ||
      (hasRole(user, USER_ROLES.CHECKIN) && (a.checkin || []).includes(user.id))
    );
  });
}

function getCompetitionDivisionGroup(meet, birthdate, gender) {
  const ref = getAgeReferenceDate(meet);
  const age = getAgeOnDate(birthdate, ref);
  const compGender = ageToCompetitionGender(gender, age);

  const group = (meet.groups || []).find(g => {
    return Number(age) >= Number(g.minAge) &&
      Number(age) <= Number(g.maxAge) &&
      normalizeGender(g.gender) === compGender;
  });

  return {
    age,
    group: group || null,
  };
}

function getOpenTtGroup(age, gender) {
  const compGender = ageToCompetitionGender(gender, age);

  let candidates = OPEN_TT_GROUPS.filter(group => {
    return Number(age) >= Number(group.minAge) &&
      Number(age) <= Number(group.maxAge);
  });

  if (Number(age) >= 35 && (compGender === 'women' || compGender === 'men')) {
    candidates = candidates.filter(g => g.label.toLowerCase().includes('masters'));
  } else if (Number(age) >= 14 && (compGender === 'women' || compGender === 'men')) {
    candidates = candidates.filter(g => g.label.toLowerCase().includes('senior'));
  } else {
    candidates = candidates.filter(g => !g.label.toLowerCase().includes('masters') && !g.label.toLowerCase().includes('senior'));
  }

  const exact = candidates.find(group => normalizeGender(group.gender) === compGender);
  return exact || null;
}

function refreshRegistrationDerivedFields(meet, reg) {
  const div = getCompetitionDivisionGroup(meet, reg.birthdate, reg.gender);
  reg.calculatedAge = div.age ?? null;
  reg.divisionGroupId = div.group?.id || '';
  reg.divisionGroupLabel = div.group?.label || '';

  const openGroup = getOpenTtGroup(reg.calculatedAge, reg.gender);
  reg.ttOpenGroupId = openGroup?.id || '';
  reg.ttOpenGroupLabel = openGroup?.label || '';

  return reg;
}

function rebuildAllRegistrationDerivedFields(meet) {
  meet.registrations = (meet.registrations || []).map(reg => refreshRegistrationDerivedFields(meet, reg));
}

function getDivisionConfig(meet, groupId, divisionKey) {
  const group = (meet.groups || []).find(g => g.id === groupId);
  if (!group) return null;
  return group.divisions?.[divisionKey] || null;
}

function getSpecialGroupConfig(groups, groupId) {
  return (groups || []).find(g => g.id === groupId) || null;
}

function getMeetDistances(meet, groupId, divisionKey) {
  const cfg = getDivisionConfig(meet, groupId, divisionKey);
  if (!cfg?.enabled) return [];
  return (cfg.distances || []).map(x => String(x || '').trim()).filter(Boolean);
}

function getSpecialDistances(groups, groupId) {
  const cfg = getSpecialGroupConfig(groups, groupId);
  if (!cfg?.enabled) return [];
  return (cfg.distances || []).map(x => String(x || '').trim()).filter(Boolean);
}

function raceTypeLabel(race) {
  if (race.type === 'time_trial') return 'Time Trial';
  if (race.type === 'open_pack') return 'Open';
  if (race.type === 'quad') return 'Quad';
  return 'Race';
}

function raceDivisionPretty(key) {
  if (key === 'novice') return 'Novice';
  if (key === 'elite') return 'Elite';
  if (key === 'open') return 'Open';
  if (key === 'quad') return 'Quad';
  return key || '';
}

function getRaceDisplayTitle(race) {
  const parts = [];
  if (race.groupLabel) parts.push(race.groupLabel);
  if (race.divisionKey && race.type !== 'time_trial') parts.push(raceDivisionPretty(race.divisionKey));
  if (race.type === 'time_trial') parts.push('Time Trial');
  if (race.distanceLabel && race.type !== 'time_trial') parts.push(race.distanceLabel);
  return parts.join(' — ');
}

function scorePlaceToPoints(place) {
  return Number(INLINE_POINTS_TABLE[Number(place)] || 0);
}

function findPotentialDuplicate(meet, payload, excludeRegId = '') {
  const targetName = String(payload.name || '').trim().toLowerCase();
  const targetBirthdate = String(payload.birthdate || '').trim();
  const targetTeam = String(payload.team || '').trim().toLowerCase();

  return (meet.registrations || []).find(reg => {
    if (excludeRegId && String(reg.id) === String(excludeRegId)) return false;

    const sameName = String(reg.name || '').trim().toLowerCase() === targetName;
    const sameBirthdate = String(reg.birthdate || '').trim() === targetBirthdate;
    const sameTeam = String(reg.team || '').trim().toLowerCase() === targetTeam;

    return (sameName && sameBirthdate) || (sameName && sameTeam && !!targetName);
  }) || null;
}

function rebuildMeetNumbers(meet) {
  const regs = [...(meet.registrations || [])].sort((a, b) => {
    const aNum = Number(a.meetNumber || 0);
    const bNum = Number(b.meetNumber || 0);
    if (aNum && bNum) return aNum - bNum;
    if (aNum) return -1;
    if (bNum) return 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  let next = 1;
  for (const reg of regs) {
    if (Number(reg.meetNumber || 0) > 0) {
      next = Math.max(next, Number(reg.meetNumber) + 1);
      continue;
    }
    reg.meetNumber = next++;
  }
}

function buildRegistrationFromBody(meet, body, opts = {}) {
  const reg = {
    id: opts.id || crypto.randomBytes(6).toString('hex'),
    createdAt: opts.createdAt || nowIso(),
    walkIn: !!opts.walkIn,
    name: String(body.name || '').trim(),
    birthdate: String(body.birthdate || '').trim(),
    gender: normalizeGender(body.gender),
    team: String(body.team || 'Independent').trim() || 'Independent',
    calculatedAge: null,
    divisionGroupId: '',
    divisionGroupLabel: '',
    ttOpenGroupId: '',
    ttOpenGroupLabel: '',
    meetNumber: Number(opts.meetNumber || 0),
    options: {
      novice: !!body.opt_novice || !!body.novice,
      elite: !!body.opt_elite || !!body.elite,
      open: !!body.opt_open || !!body.open,
      quad: !!body.opt_quad || !!body.quad,
      timeTrials: !!body.opt_timeTrials || !!body.timeTrials,
      relays: !!body.opt_relays || !!body.relays,
    },
    checkIn: {
      checkedIn: !!opts.checkedIn,
      checkedInAt: opts.checkedInAt || '',
    },
  };

  return refreshRegistrationDerivedFields(meet, reg);
}function buildRaceEntriesForRace(meet, race) {
  const regs = (meet.registrations || []).filter(reg => {
    if (race.type === 'time_trial') {
      return !!reg.options?.timeTrials && reg.ttOpenGroupId === race.groupId;
    }

    if (race.type === 'open_pack') {
      return !!reg.options?.open &&
        Number(reg.calculatedAge || -1) >= Number(race.minAge || 0) &&
        Number(reg.calculatedAge || -1) <= Number(race.maxAge || 999) &&
        ageToCompetitionGender(reg.gender, reg.calculatedAge) === normalizeGender(race.gender || reg.gender);
    }

    if (race.type === 'quad') {
      return !!reg.options?.quad &&
        Number(reg.calculatedAge || -1) >= Number(race.minAge || 0) &&
        Number(reg.calculatedAge || -1) <= Number(race.maxAge || 999) &&
        ageToCompetitionGender(reg.gender, reg.calculatedAge) === normalizeGender(race.gender || reg.gender);
    }

    return !!reg.options?.[race.divisionKey] && reg.divisionGroupId === race.groupId;
  });

  if (race.type === 'time_trial') {
    const ordered = [...regs].sort(compareBirthdateYoungestFirst);
    race.laneEntries = ordered.map((reg, idx) => ({
      lane: idx + 1,
      registrationId: reg.id,
      meetNumber: reg.meetNumber,
      skaterName: reg.name,
      birthdate: reg.birthdate,
      team: reg.team,
      resultTime: '',
      place: '',
      points: 0,
      status: '',
    }));
    race.packEntries = [];
    race.resultsMode = 'time';
    return;
  }

  if (race.type === 'open_pack' || race.type === 'quad') {
    const ordered = [...regs].sort((a, b) => a.name.localeCompare(b.name));
    race.packEntries = ordered.map((reg, idx) => ({
      order: idx + 1,
      registrationId: reg.id,
      meetNumber: reg.meetNumber,
      skaterName: reg.name,
      birthdate: reg.birthdate,
      team: reg.team,
      place: '',
      points: 0,
      status: '',
    }));
    race.laneEntries = [];
    race.resultsMode = 'places';
    return;
  }

  const laneCap = Number(meet.lanes || 4);
  const ordered = [...regs].sort((a, b) => a.name.localeCompare(b.name));
  race.laneEntries = ordered.slice(0, laneCap).map((reg, idx) => ({
    lane: idx + 1,
    registrationId: reg.id,
    meetNumber: reg.meetNumber,
    skaterName: reg.name,
    birthdate: reg.birthdate,
    team: reg.team,
    resultTime: '',
    place: '',
    points: 0,
    status: '',
  }));
  race.packEntries = [];
  race.resultsMode = 'places';
}

function regenerateRaces(meet) {
  const oldByKey = new Map(
    (meet.races || []).map(r => [
      `${r.type}|${r.groupId}|${r.divisionKey}|${r.distanceLabel}|${r.label}`,
      r
    ])
  );

  const newRaces = [];
  let orderCounter = 1;

  for (const group of meet.groups || []) {
    for (const divisionKey of STANDARD_KEYS) {
      const cfg = group.divisions?.[divisionKey];
      if (!cfg?.enabled) continue;

      const distances = getMeetDistances(meet, group.id, divisionKey);
      distances.forEach(distanceLabel => {
        const key = `standard|${group.id}|${divisionKey}|${distanceLabel}|`;
        const existing = oldByKey.get(key);

        const race = existing ? { ...existing } : {
          id: `race_${crypto.randomBytes(5).toString('hex')}`,
          type: 'standard',
          scoringBucket: 'inline',
          label: '',
          groupId: group.id,
          groupLabel: group.label,
          divisionKey,
          distanceLabel,
          dayIndex: 1,
          blockId: '',
          laneEntries: [],
          packEntries: [],
          resultsMode: 'places',
          status: 'open',
          notes: '',
          isFinal: true,
          closedAt: '',
          minAge: group.minAge,
          maxAge: group.maxAge,
          gender: group.gender,
        };

        race.scoringBucket = 'inline';
        race.groupId = group.id;
        race.groupLabel = group.label;
        race.divisionKey = divisionKey;
        race.distanceLabel = distanceLabel;
        race.orderHint = orderCounter++;
        buildRaceEntriesForRace(meet, race);
        newRaces.push(race);
      });
    }
  }

  if (meet.openEnabled) {
    for (const group of meet.openGroups || []) {
      if (!group.enabled) continue;

      const distances = getSpecialDistances(meet.openGroups, group.id);
      distances.forEach(distanceLabel => {
        const key = `open_pack|${group.id}|open|${distanceLabel}|`;
        const existing = oldByKey.get(key);

        const race = existing ? { ...existing } : {
          id: `race_${crypto.randomBytes(5).toString('hex')}`,
          type: 'open_pack',
          scoringBucket: 'open',
          label: '',
          groupId: group.id,
          groupLabel: group.label,
          divisionKey: 'open',
          distanceLabel,
          dayIndex: 1,
          blockId: '',
          laneEntries: [],
          packEntries: [],
          resultsMode: 'places',
          status: 'open',
          notes: '',
          isFinal: true,
          closedAt: '',
          minAge: group.minAge,
          maxAge: group.maxAge,
          gender: group.gender,
        };

        race.scoringBucket = 'open';
        race.groupId = group.id;
        race.groupLabel = group.label;
        race.divisionKey = 'open';
        race.distanceLabel = distanceLabel;
        race.minAge = group.minAge;
        race.maxAge = group.maxAge;
        race.gender = group.gender;
        race.orderHint = orderCounter++;
        buildRaceEntriesForRace(meet, race);
        newRaces.push(race);
      });
    }
  }

  if (meet.quadEnabled) {
    for (const group of meet.quadGroups || []) {
      if (!group.enabled) continue;

      const distances = getSpecialDistances(meet.quadGroups, group.id);
      distances.forEach(distanceLabel => {
        const key = `quad|${group.id}|quad|${distanceLabel}|`;
        const existing = oldByKey.get(key);

        const race = existing ? { ...existing } : {
          id: `race_${crypto.randomBytes(5).toString('hex')}`,
          type: 'quad',
          scoringBucket: 'quad',
          label: '',
          groupId: group.id,
          groupLabel: group.label,
          divisionKey: 'quad',
          distanceLabel,
          dayIndex: 1,
          blockId: '',
          laneEntries: [],
          packEntries: [],
          resultsMode: 'places',
          status: 'open',
          notes: '',
          isFinal: true,
          closedAt: '',
          minAge: group.minAge,
          maxAge: group.maxAge,
          gender: group.gender,
        };

        race.scoringBucket = 'quad';
        race.groupId = group.id;
        race.groupLabel = group.label;
        race.divisionKey = 'quad';
        race.distanceLabel = distanceLabel;
        race.minAge = group.minAge;
        race.maxAge = group.maxAge;
        race.gender = group.gender;
        race.orderHint = orderCounter++;
        buildRaceEntriesForRace(meet, race);
        newRaces.push(race);
      });
    }
  }

  if (meet.timeTrialsEnabled) {
    const ttGroups = [...OPEN_TT_GROUPS].sort((a, b) => {
      if (a.minAge !== b.minAge) return a.minAge - b.minAge;
      return a.label.localeCompare(b.label);
    });

    ttGroups.forEach(group => {
      const key = `time_trial|${group.id}|time_trial||Time Trial`;
      const existing = oldByKey.get(key);

      const race = existing ? { ...existing } : {
        id: `race_${crypto.randomBytes(5).toString('hex')}`,
        type: 'time_trial',
        scoringBucket: 'time_trial',
        label: 'Time Trial',
        groupId: group.id,
        groupLabel: group.label,
        divisionKey: 'time_trial',
        distanceLabel: '',
        dayIndex: 1,
        blockId: '',
        laneEntries: [],
        packEntries: [],
        resultsMode: 'time',
        status: 'open',
        notes: '',
        isFinal: true,
        closedAt: '',
        minAge: group.minAge,
        maxAge: group.maxAge,
        gender: group.gender,
      };

      race.scoringBucket = 'time_trial';
      race.groupId = group.id;
      race.groupLabel = group.label;
      race.divisionKey = 'time_trial';
      race.label = 'Time Trial';
      race.distanceLabel = '';
      race.minAge = group.minAge;
      race.maxAge = group.maxAge;
      race.gender = group.gender;
      race.orderHint = orderCounter++;
      buildRaceEntriesForRace(meet, race);
      newRaces.push(race);
    });
  }

  const validRaceIds = new Set(newRaces.map(r => r.id));
  meet.blocks = (meet.blocks || []).map(block => ({
    ...block,
    raceIds: (block.raceIds || []).filter(id => validRaceIds.has(id)),
  }));

  for (const race of newRaces) {
    if (race.blockId) {
      const block = (meet.blocks || []).find(b => b.id === race.blockId);
      if (!block || !(block.raceIds || []).includes(race.id)) race.blockId = '';
    }
  }

  meet.races = newRaces;
}

function ensureDefaultBlock(meet) {
  if (!Array.isArray(meet.blocks) || meet.blocks.length === 0) {
    meet.blocks = [{
      id: `block_${crypto.randomBytes(4).toString('hex')}`,
      name: 'Block 1',
      day: 'Day 1',
      notes: '',
      raceIds: [],
    }];
  }
}

function rebuildRaceAssignments(meet) {
  const validRaceIds = new Set((meet.races || []).map(r => r.id));
  for (const block of meet.blocks || []) {
    block.raceIds = (block.raceIds || []).filter(id => validRaceIds.has(id));
  }

  for (const race of meet.races || []) {
    if (!race.blockId) continue;
    const block = (meet.blocks || []).find(b => b.id === race.blockId);
    if (!block) {
      race.blockId = '';
      continue;
    }
    if (!(block.raceIds || []).includes(race.id)) block.raceIds.push(race.id);
  }
}

function getUnassignedRaces(meet) {
  return (meet.races || []).filter(r => !r.blockId);
}

function assignRaceToBlock(meet, raceId, blockId) {
  const race = (meet.races || []).find(r => r.id === raceId);
  const block = (meet.blocks || []).find(b => b.id === blockId);
  if (!race || !block) return false;

  if (race.blockId) {
    const oldBlock = (meet.blocks || []).find(b => b.id === race.blockId);
    if (oldBlock) {
      oldBlock.raceIds = (oldBlock.raceIds || []).filter(id => id !== race.id);
    }
  }

  race.blockId = block.id;
  if (!(block.raceIds || []).includes(race.id)) block.raceIds.push(race.id);
  return true;
}

function unassignRaceFromBlock(meet, raceId) {
  const race = (meet.races || []).find(r => r.id === raceId);
  if (!race) return false;

  if (race.blockId) {
    const block = (meet.blocks || []).find(b => b.id === race.blockId);
    if (block) block.raceIds = (block.raceIds || []).filter(id => id !== race.id);
  }

  race.blockId = '';
  return true;
}

function deleteBlockAndReturnRaces(meet, blockId) {
  const block = (meet.blocks || []).find(b => b.id === blockId);
  if (!block) return false;

  for (const raceId of block.raceIds || []) {
    const race = (meet.races || []).find(r => r.id === raceId);
    if (race) race.blockId = '';
  }

  meet.blocks = (meet.blocks || []).filter(b => b.id !== blockId);
  ensureDefaultBlock(meet);
  return true;
}

function getOrderedRaceDayRaces(meet) {
  const ordered = [];

  for (const block of meet.blocks || []) {
    const races = (block.raceIds || [])
      .map(id => (meet.races || []).find(r => r.id === id))
      .filter(Boolean)
      .sort((a, b) => (a.orderHint || 0) - (b.orderHint || 0));
    ordered.push(...races);
  }

  const assignedIds = new Set(ordered.map(r => r.id));
  const leftovers = (meet.races || [])
    .filter(r => !assignedIds.has(r.id))
    .sort((a, b) => (a.orderHint || 0) - (b.orderHint || 0));

  ordered.push(...leftovers);
  return ordered;
}

function sortTimeRows(rows) {
  return [...rows].sort((a, b) => {
    const aNum = Number(a.resultTime || 999999);
    const bNum = Number(b.resultTime || 999999);
    return aNum - bNum;
  });
}function applyRacePoints(race) {
  if (race.type === 'time_trial') {
    const ranked = sortTimeRows(
      (race.laneEntries || []).filter(entry => String(entry.resultTime || '').trim())
    );

    ranked.forEach((entry, idx) => {
      entry.place = idx + 1;
      entry.points = 0;
    });
    return;
  }

  if (race.type === 'open_pack') {
    (race.packEntries || []).forEach(entry => {
      entry.points = 0;
    });
    return;
  }

  if (race.type === 'quad') {
    (race.packEntries || []).forEach(entry => {
      const place = Number(entry.place || 0);
      entry.points = place > 0 ? scorePlaceToPoints(place) : 0;
    });
    return;
  }

  (race.laneEntries || []).forEach(entry => {
    const place = Number(entry.place || 0);
    entry.points = place > 0 ? scorePlaceToPoints(place) : 0;
  });
}

function buildInlineStandings(meet) {
  const closed = (meet.races || []).filter(r =>
    r.type === 'standard' &&
    r.isFinal !== false &&
    String(r.status || '') === 'closed'
  );

  const grouped = {};

  for (const race of closed) {
    const bucketKey = `${race.groupId}|${race.divisionKey}`;
    if (!grouped[bucketKey]) {
      grouped[bucketKey] = {
        key: bucketKey,
        groupId: race.groupId,
        groupLabel: race.groupLabel,
        divisionKey: race.divisionKey,
        rows: {},
      };
    }

    for (const entry of race.laneEntries || []) {
      if (!entry.registrationId) continue;
      const reg = (meet.registrations || []).find(r => r.id === entry.registrationId);
      if (!reg) continue;

      if (!grouped[bucketKey].rows[entry.registrationId]) {
        grouped[bucketKey].rows[entry.registrationId] = {
          registrationId: entry.registrationId,
          meetNumber: reg.meetNumber,
          skaterName: reg.name,
          team: reg.team,
          totalPoints: 0,
          racePlaces: [],
        };
      }

      grouped[bucketKey].rows[entry.registrationId].totalPoints += Number(entry.points || 0);
      grouped[bucketKey].rows[entry.registrationId].racePlaces.push(Number(entry.place || 999));
    }
  }

  return Object.values(grouped).map(section => {
    const rows = Object.values(section.rows)
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;

        const aBest = Math.min(...a.racePlaces, 999);
        const bBest = Math.min(...b.racePlaces, 999);
        if (aBest !== bBest) return aBest - bBest;

        const aWins = a.racePlaces.filter(p => p === 1).length;
        const bWins = b.racePlaces.filter(p => p === 1).length;
        if (bWins !== aWins) return bWins - aWins;

        return String(a.skaterName || '').localeCompare(String(b.skaterName || ''));
      })
      .map((row, idx) => ({
        ...row,
        overallPlace: idx + 1,
      }));

    return {
      groupId: section.groupId,
      groupLabel: section.groupLabel,
      divisionKey: section.divisionKey,
      rows,
    };
  }).sort((a, b) => {
    const g = String(a.groupLabel || '').localeCompare(String(b.groupLabel || ''));
    if (g !== 0) return g;
    return String(a.divisionKey || '').localeCompare(String(b.divisionKey || ''));
  });
}

function buildQuadStandings(meet) {
  const closed = (meet.races || []).filter(r =>
    r.type === 'quad' &&
    r.isFinal !== false &&
    String(r.status || '') === 'closed'
  );

  const grouped = {};

  for (const race of closed) {
    const bucketKey = race.groupId;
    if (!grouped[bucketKey]) {
      grouped[bucketKey] = {
        key: bucketKey,
        groupId: race.groupId,
        groupLabel: race.groupLabel,
        rows: {},
      };
    }

    for (const entry of race.packEntries || []) {
      if (!entry.registrationId) continue;
      const reg = (meet.registrations || []).find(r => r.id === entry.registrationId);
      if (!reg) continue;

      if (!grouped[bucketKey].rows[entry.registrationId]) {
        grouped[bucketKey].rows[entry.registrationId] = {
          registrationId: entry.registrationId,
          meetNumber: reg.meetNumber,
          skaterName: reg.name,
          team: reg.team,
          totalPoints: 0,
          racePlaces: [],
        };
      }

      grouped[bucketKey].rows[entry.registrationId].totalPoints += Number(entry.points || 0);
      grouped[bucketKey].rows[entry.registrationId].racePlaces.push(Number(entry.place || 999));
    }
  }

  return Object.values(grouped).map(section => {
    const rows = Object.values(section.rows)
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;

        const aBest = Math.min(...a.racePlaces, 999);
        const bBest = Math.min(...b.racePlaces, 999);
        if (aBest !== bBest) return aBest - bBest;

        const aWins = a.racePlaces.filter(p => p === 1).length;
        const bWins = b.racePlaces.filter(p => p === 1).length;
        if (bWins !== aWins) return bWins - aWins;

        return String(a.skaterName || '').localeCompare(String(b.skaterName || ''));
      })
      .map((row, idx) => ({
        ...row,
        overallPlace: idx + 1,
      }));

    return {
      groupId: section.groupId,
      groupLabel: section.groupLabel,
      rows,
    };
  }).sort((a, b) => String(a.groupLabel || '').localeCompare(String(b.groupLabel || '')));
}

function buildOpenResults(meet) {
  return (meet.races || [])
    .filter(r => r.type === 'open_pack' && String(r.status || '') === 'closed')
    .sort((a, b) => (a.orderHint || 0) - (b.orderHint || 0))
    .map(race => ({
      raceId: race.id,
      title: getRaceDisplayTitle(race),
      rows: [...(race.packEntries || [])]
        .filter(entry => Number(entry.place || 0) > 0)
        .sort((a, b) => Number(a.place || 999) - Number(b.place || 999)),
    }));
}

function rebuildTimeTrialOpenResults(meet) {
  const ttRaces = (meet.races || []).filter(r => r.type === 'time_trial');
  const rows = [];

  for (const race of ttRaces) {
    for (const entry of race.laneEntries || []) {
      if (!entry.registrationId) continue;
      if (!String(entry.resultTime || '').trim()) continue;

      const reg = (meet.registrations || []).find(r => r.id === entry.registrationId);
      if (!reg) continue;
      if (!reg.ttOpenGroupId) continue;

      rows.push({
        registrationId: reg.id,
        meetNumber: reg.meetNumber,
        skaterName: reg.name,
        team: reg.team,
        birthdate: reg.birthdate,
        age: reg.calculatedAge,
        openGroupId: reg.ttOpenGroupId,
        openGroupLabel: reg.ttOpenGroupLabel,
        resultTime: String(entry.resultTime || '').trim(),
        sourceRaceId: race.id,
        sourceRaceLabel: getRaceDisplayTitle(race),
      });
    }
  }

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.openGroupId]) {
      grouped[row.openGroupId] = {
        id: row.openGroupId,
        label: row.openGroupLabel,
        rows: [],
      };
    }
    grouped[row.openGroupId].rows.push(row);
  }

  const orderedGroups = Object.values(grouped)
    .map(group => ({
      ...group,
      rows: sortTimeRows(group.rows).map((row, idx) => ({
        ...row,
        place: idx + 1,
      })),
    }))
    .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));

  meet.results.timeTrialsByOpenGroup = orderedGroups;
}

function rebuildAllResults(meet) {
  for (const race of meet.races || []) applyRacePoints(race);
  meet.results.inlineStandings = buildInlineStandings(meet);
  meet.results.quadStandings = buildQuadStandings(meet);
  meet.results.openResults = buildOpenResults(meet);
  rebuildTimeTrialOpenResults(meet);
}

function getCurrentRaceBundle(meet) {
  const ordered = getOrderedRaceDayRaces(meet);
  let idx = ordered.findIndex(r => r.id === meet.currentRaceId);

  if (idx < 0) {
    idx = Number.isFinite(meet.currentRaceIndex) ? meet.currentRaceIndex : -1;
  }

  if (idx < 0 && ordered.length > 0) idx = 0;

  const current = idx >= 0 ? ordered[idx] : null;
  const next = idx >= 0 ? ordered[idx + 1] || null : null;
  const upcoming = idx >= 0 ? ordered.slice(idx + 2, idx + 7) : ordered.slice(0, 5);

  return { ordered, idx, current, next, upcoming };
}

function ensureCurrentRace(meet) {
  const bundle = getCurrentRaceBundle(meet);
  if (bundle.current) {
    meet.currentRaceId = bundle.current.id;
    meet.currentRaceIndex = bundle.idx;
  } else {
    meet.currentRaceId = '';
    meet.currentRaceIndex = -1;
  }
}

function getVisibleRaceDayTabs(user, meet) {
  const tabs = [];

  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) {
    tabs.push({ key: 'director', label: 'Director', href: `/portal/meet/${meet.id}/race-day/director` });
    tabs.push({ key: 'judges', label: 'Judges', href: `/portal/meet/${meet.id}/race-day/judges` });
    tabs.push({ key: 'announcer', label: 'Announcer', href: `/portal/meet/${meet.id}/race-day/announcer` });
    tabs.push({ key: 'coach', label: 'Coach', href: `/portal/meet/${meet.id}/race-day/coach` });
    tabs.push({ key: 'live', label: 'Live', href: `/portal/meet/${meet.id}/race-day/live` });
    return tabs;
  }

  if (hasRole(user, USER_ROLES.JUDGE)) {
    tabs.push({ key: 'judges', label: 'Judges', href: `/portal/meet/${meet.id}/race-day/judges` });
    tabs.push({ key: 'live', label: 'Live', href: `/portal/meet/${meet.id}/race-day/live` });
  }

  if (hasRole(user, USER_ROLES.ANNOUNCER)) {
    tabs.push({ key: 'announcer', label: 'Announcer', href: `/portal/meet/${meet.id}/race-day/announcer` });
    tabs.push({ key: 'live', label: 'Live', href: `/portal/meet/${meet.id}/race-day/live` });
  }

  if (hasRole(user, USER_ROLES.COACH)) {
    tabs.push({ key: 'coach', label: 'Coach', href: `/portal/meet/${meet.id}/race-day/coach` });
    tabs.push({ key: 'live', label: 'Live', href: `/portal/meet/${meet.id}/race-day/live` });
  }

  if (hasRole(user, USER_ROLES.CHECKIN)) {
    tabs.push({ key: 'live', label: 'Live', href: `/portal/meet/${meet.id}/race-day/live` });
  }

  return tabs;
}

function raceDayTabs(user, meet, currentTab) {
  const items = getVisibleRaceDayTabs(user, meet);
  return `
    <div class="actions" style="margin-bottom:18px;">
      ${items.map(item => `
        <a class="btn ${currentTab === item.key ? 'btn-primary' : 'btn-ghost'}" href="${item.href}">
          ${esc(item.label)}
        </a>
      `).join('')}
    </div>
  `;
}function loginPage(error = '') {
  return layout('Login', `
    <div class="grid grid-2" style="align-items:center;">
      <div class="hero" style="min-height:520px;">
        <div>
          <h1>Run your meet like you mean it.</h1>
          <p>
            Registration, blocks, check-in, race day control, judges, live results, and clean printouts —
            all in one place.
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
  `, { hideNav: false });
}

function homePage(user) {
  return layout('Home', `
    <div class="hero">
      <div>
        <div class="pill" style="margin-bottom:16px;">Meet management for real race day chaos</div>
        <h1>Build. Register. Race.</h1>
        <p>
          SpeedSkateMeet helps you build meets, manage registration, check in skaters,
          control race day, and publish live results without the clipboard circus.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="${user ? roleHomePath(user) : '/admin/login'}">${user ? 'Open Portal' : 'Portal Login'}</a>
          <a class="btn btn-ghost" href="/find-a-meet">Find a Meet</a>
        </div>
      </div>
    </div>

    <div class="grid grid-3">
      <div class="card card-pad">
        <h3 style="margin-top:0;">Build a Meet</h3>
        <p class="muted">Create divisions, blocks, race-day flow, and meet settings in one place.</p>
        <div class="actions">
          <a class="btn btn-primary" href="${user ? roleHomePath(user) : '/admin/login'}">Open Portal</a>
        </div>
      </div>

      <div class="card card-pad">
        <h3 style="margin-top:0;">Find a Meet</h3>
        <p class="muted">Share your meet publicly and make it easy for skaters to register fast.</p>
        <div class="actions">
          <a class="btn btn-primary" href="/find-a-meet">Browse Meets</a>
        </div>
      </div>

      <div class="card card-pad">
        <h3 style="margin-top:0;">Live Results</h3>
        <p class="muted">Keep judges, announcers, coaches, and parents synced with what’s happening now.</p>
        <div class="actions">
          <a class="btn btn-primary" href="/find-a-meet">View Public Results</a>
        </div>
      </div>
    </div>
  `, { user });
}

function portalPage(user, db) {
  const myMeets = getAssignedMeetsForUser(db, user)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return layout('Portal', `
    <div class="section-title">
      <div>
        <h2>Portal</h2>
        <div class="muted">Choose a meet to manage.</div>
      </div>
      <div class="actions">
        <a class="btn btn-primary" href="/portal/new-meet">+ New Meet</a>
        <a class="btn btn-ghost" href="/portal/users">Users</a>
        <a class="btn btn-ghost" href="/portal/rinks">Rinks</a>
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
          <a class="btn btn-primary" href="/portal/new-meet">Create Meet</a>
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
              <form class="inline" method="post" action="/portal/meet/${meet.id}/delete" onsubmit="return confirm('Delete this meet? This cannot be undone.');">
                <button class="btn btn-danger" type="submit">Delete Meet</button>
              </form>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `, { user });
}

function rolePortalPage(user, db, roleName, roleKey, openPath) {
  const meets = getAssignedMeetsForUser(db, user)
    .filter(meet => {
      if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) return true;
      return (meet.assignments?.[roleKey] || []).includes(user.id);
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return layout(`${roleName} Portal`, `
    <div class="section-title">
      <div>
        <h2>${esc(roleName)} Portal</h2>
        <div class="muted">Choose the meet you need.</div>
      </div>
    </div>

    <div class="grid">
      ${meets.length === 0 ? `
        <div class="card card-pad">
          <h3 style="margin-top:0;">No assigned meets</h3>
          <p class="muted">You do not have any meets assigned yet.</p>
        </div>
      ` : meets.map(meet => `
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
              <div class="mini">Current Race</div>
              <div style="font-size:1rem;font-weight:800;">${esc(getCurrentRaceBundle(meet).current ? getRaceDisplayTitle(getCurrentRaceBundle(meet).current) : 'Not set')}</div>
            </div>
            <div class="actions" style="justify-content:flex-end;">
              <a class="btn btn-primary" href="${openPath(meet)}">Open</a>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `, { user });
}

function meetDashboardPage(user, meet) {
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
          Age Rule: ${esc(meet.ageRule || AGE_RULES.USARS)}
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
      <div class="muted">Open the section you want instead of jumping straight into the build tabs.</div>
    </div>

    <div class="grid grid-4">
      <a class="card card-pad" href="/portal/meet/${meet.id}/builder">
        <h3 style="margin-top:0;">Meet Builder</h3>
        <p class="muted">Meet settings, age rule, divisions, costs, TT toggle, open, quad, and more.</p>
      </a>

      <a class="card card-pad" href="/portal/meet/${meet.id}/builder/open">
        <h3 style="margin-top:0;">Open Builder</h3>
        <p class="muted">Separate open setup from inline divisions.</p>
      </a>

      <a class="card card-pad" href="/portal/meet/${meet.id}/builder/quad">
        <h3 style="margin-top:0;">Quad Builder</h3>
        <p class="muted">Separate quad setup from inline divisions.</p>
      </a>

      <a class="card card-pad" href="/portal/meet/${meet.id}/blocks">
        <h3 style="margin-top:0;">Block Builder</h3>
        <p class="muted">Assign races to blocks and shape race-day flow.</p>
      </a>

      <a class="card card-pad" href="/portal/meet/${meet.id}/registered">
        <h3 style="margin-top:0;">Registered</h3>
        <p class="muted">View, edit, delete, and print racer registration info.</p>
      </a>

      <a class="card card-pad" href="/portal/meet/${meet.id}/check-in">
        <h3 style="margin-top:0;">Check In</h3>
        <p class="muted">Check skaters in quickly on meet day.</p>
      </a>

      <a class="card card-pad" href="/portal/meet/${meet.id}/race-day/director">
        <h3 style="margin-top:0;">Race Day</h3>
        <p class="muted">Director, judges, announcer, coach, and live views.</p>
      </a>

      <a class="card card-pad" href="/results/${meet.id}" target="_blank">
        <h3 style="margin-top:0;">Results</h3>
        <p class="muted">Public-facing standings and time trial open-group results.</p>
      </a>

      <a class="card card-pad" href="/live/${meet.id}" target="_blank">
        <h3 style="margin-top:0;">Public Live</h3>
        <p class="muted">Show current race, on deck, and live action publicly.</p>
      </a>

      <div class="card card-pad">
        <h3 style="margin-top:0;">Meet Actions</h3>
        <div class="actions">
          <form class="inline" method="post" action="/portal/meet/${meet.id}/publish-toggle">
            <button class="btn ${meet.showOnFindAMeet ? 'btn-gold' : 'btn-primary'}" type="submit">
              ${meet.showOnFindAMeet ? 'Hide from Find a Meet' : 'Publish to Find a Meet'}
            </button>
          </form>
          <form class="inline" method="post" action="/portal/meet/${meet.id}/delete" onsubmit="return confirm('Delete this meet? This cannot be undone.');">
            <button class="btn btn-danger" type="submit">Delete Meet</button>
          </form>
        </div>
      </div>
    </div>
  `, { user });
}function meetBuilderTabs(meet, active) {
  const items = [
    { key: 'main', label: 'Meet Builder', href: `/portal/meet/${meet.id}/builder` },
    { key: 'open', label: 'Open Builder', href: `/portal/meet/${meet.id}/builder/open` },
    { key: 'quad', label: 'Quad Builder', href: `/portal/meet/${meet.id}/builder/quad` },
    { key: 'blocks', label: 'Block Builder', href: `/portal/meet/${meet.id}/blocks` },
  ];

  return `
    <div class="actions" style="margin-bottom:18px;">
      ${items.map(item => `
        <a class="btn ${active === item.key ? 'btn-primary' : 'btn-ghost'}" href="${item.href}">
          ${esc(item.label)}
        </a>
      `).join('')}
    </div>
  `;
}

function stickySaveBar(meet, saveLabel = 'Save Meet', backHref = '', backLabel = '') {
  return `
    <div class="sticky-save">
      <button class="btn btn-primary" type="submit">${esc(saveLabel)}</button>
      ${backHref ? `<a class="btn btn-ghost" href="${backHref}">${esc(backLabel || 'Back')}</a>` : ''}
    </div>
  `;
}

function meetBuilderPage(user, meet, db) {
  const rinkOptions = (db.rinks || []).map(rink =>
    `<option value="${rink.id}" ${selected(meet.rinkId, rink.id)}>${esc(rink.name)} (${esc(rink.city)}, ${esc(rink.state)})</option>`
  ).join('');

  const ageRuleOptions = Object.values(AGE_RULES).map(rule =>
    `<option value="${esc(rule)}" ${selected(meet.ageRule, rule)}>${esc(rule)}</option>`
  ).join('');

  return layout(`Meet Builder — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Meet Builder</h2>
        <div class="muted">Main setup for the whole meet.</div>
      </div>
    </div>

    ${meetBuilderTabs(meet, 'main')}

    <form class="stack" method="post" action="/portal/meet/${meet.id}/builder/save">
      ${stickySaveBar(meet, 'Save Meet', roleBackHref(user, meet), roleBackLabel(user))}

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
        <h3 style="margin-top:0;">Competition Rules</h3>
        <div class="row row-3">
          <div>
            <label>Age Rule</label>
            <select name="ageRule" onchange="toggleCustomAgeRule(this.value)">
              ${ageRuleOptions}
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

        <div class="row row-3" style="margin-top:14px;">
          <div>
            <label>Track Length</label>
            <input name="trackLength" value="${esc(meet.trackLength || 100)}" />
          </div>
          <div>
            <label>Lane Count</label>
            <input name="lanes" value="${esc(meet.lanes || 4)}" />
          </div>
          <div>
            <label>Rink</label>
            <select name="rinkId">
              ${rinkOptions}
            </select>
          </div>
        </div>

        <div class="divider"></div>

        <div class="actions">
          <label class="pill"><input type="checkbox" name="timeTrialsEnabled" ${checked(meet.timeTrialsEnabled)}> Time Trials</label>
          <label class="pill"><input type="checkbox" name="openEnabled" ${checked(meet.openEnabled)}> Open</label>
          <label class="pill"><input type="checkbox" name="quadEnabled" ${checked(meet.quadEnabled)}> Quad</label>
          <label class="pill"><input type="checkbox" name="relaysEnabled" ${checked(meet.relaysEnabled)}> Relays</label>
          <label class="pill"><input type="checkbox" name="allowDayOfRegistration" ${checked(meet.allowDayOfRegistration)}> Day Of Registration</label>
          <label class="pill"><input type="checkbox" name="judgesPanelRequired" ${checked(meet.judgesPanelRequired)}> Judges Panel</label>
          <label class="pill"><input type="checkbox" name="showOnFindAMeet" ${checked(meet.showOnFindAMeet)}> Show on Find a Meet</label>
        </div>

        <div style="margin-top:14px;">
          <label>Meet Notes</label>
          <textarea name="meetNotes">${esc(meet.meetNotes || '')}</textarea>
        </div>
      </div>

      <div class="section-title">
        <div>
          <h2>Inline Divisions</h2>
          <div class="muted">Keep this look exactly the same.</div>
        </div>
      </div>

      ${(meet.groups || []).map((group, idx) => `
        <div class="card card-pad">
          <div class="section-title" style="margin:0 0 16px;">
            <div>
              <h3 style="margin:0;">${esc(group.label)}</h3>
              <div class="mini">${esc(group.ages)}</div>
            </div>
          </div>

          <div class="grid grid-2">
            ${STANDARD_DIVISION_KEYS.map(key => {
              const div = group.divisions?.[key] || buildDivisionTemplate();
              return `
                <div class="subtle">
                  <div class="actions" style="justify-content:space-between;">
                    <strong>${raceDivisionPretty(key)}</strong>
                    <label class="pill"><input type="checkbox" name="g_${idx}_${key}_enabled" ${checked(div.enabled)}> Enabled</label>
                  </div>

                  <div style="margin-top:12px;">
                    <label>Cost</label>
                    <input name="g_${idx}_${key}_cost" value="${esc(div.cost || 0)}" />
                  </div>

                  <div style="margin-top:12px;">
                    <label>Distance 1</label>
                    <input name="g_${idx}_${key}_d1" value="${esc(div.distances?.[0] || '')}" />
                  </div>

                  <div style="margin-top:12px;">
                    <label>Distance 2</label>
                    <input name="g_${idx}_${key}_d2" value="${esc(div.distances?.[1] || '')}" />
                  </div>

                  <div style="margin-top:12px;">
                    <label>Distance 3</label>
                    <input name="g_${idx}_${key}_d3" value="${esc(div.distances?.[2] || '')}" />
                  </div>

                  <div style="margin-top:12px;">
                    <label>Distance 4</label>
                    <input name="g_${idx}_${key}_d4" value="${esc(div.distances?.[3] || '')}" />
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}

      <div class="actions">
        <button class="btn btn-primary" type="submit">Save Meet Builder</button>
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}/blocks">Go to Block Builder</a>
      </div>
    </form>

    <script>
      function toggleCustomAgeRule(value) {
        const wrap = document.getElementById('customAgeRuleWrap');
        if (!wrap) return;
        wrap.style.display = value === ${JSON.stringify(AGE_RULES.CUSTOM)} ? '' : 'none';
      }
    </script>
  `, { user });
}

function specialBuilderPage(user, meet, groups, kind) {
  const title = kind === 'open' ? 'Open Builder' : 'Quad Builder';
  const savePath = kind === 'open'
    ? `/portal/meet/${meet.id}/builder/open/save`
    : `/portal/meet/${meet.id}/builder/quad/save`;

  return layout(`${title} — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>${title}</h2>
        <div class="muted">${kind === 'open' ? 'Separate open setup from inline divisions.' : 'Separate quad setup from inline divisions.'}</div>
      </div>
    </div>

    ${meetBuilderTabs(meet, kind)}

    <form class="stack" method="post" action="${savePath}">
      ${stickySaveBar(meet, `Save ${title}`, roleBackHref(user, meet), roleBackLabel(user))}

      ${(groups || []).map((group, idx) => `
        <div class="card card-pad">
          <div class="section-title" style="margin:0 0 16px;">
            <div>
              <h3 style="margin:0;">${esc(group.label)}</h3>
              <div class="mini">${esc(group.gender)} · ${group.minAge}-${group.maxAge}</div>
            </div>
          </div>

          <div class="subtle">
            <div class="actions" style="justify-content:space-between;">
              <strong>${esc(group.label)}</strong>
              <label class="pill"><input type="checkbox" name="${kind}_${idx}_enabled" ${checked(group.enabled)}> Enabled</label>
            </div>

            <div style="margin-top:12px;">
              <label>Cost</label>
              <input name="${kind}_${idx}_cost" value="${esc(group.cost || 0)}" />
            </div>

            <div style="margin-top:12px;">
              <label>Distance 1</label>
              <input name="${kind}_${idx}_d1" value="${esc(group.distances?.[0] || '')}" />
            </div>

            <div style="margin-top:12px;">
              <label>Distance 2</label>
              <input name="${kind}_${idx}_d2" value="${esc(group.distances?.[1] || '')}" />
            </div>

            <div style="margin-top:12px;">
              <label>Distance 3</label>
              <input name="${kind}_${idx}_d3" value="${esc(group.distances?.[2] || '')}" />
            </div>

            <div style="margin-top:12px;">
              <label>Distance 4</label>
              <input name="${kind}_${idx}_d4" value="${esc(group.distances?.[3] || '')}" />
            </div>
          </div>
        </div>
      `).join('')}

      <div class="actions">
        <button class="btn btn-primary" type="submit">Save ${title}</button>
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}/blocks">Go to Block Builder</a>
      </div>
    </form>
  `, { user });
}

function blockBuilderPage(user, meet) {
  ensureDefaultBlock(meet);
  rebuildRaceAssignments(meet);

  const blocksHtml = (meet.blocks || []).map(block => {
    const races = (block.raceIds || [])
      .map(id => (meet.races || []).find(r => r.id === id))
      .filter(Boolean)
      .sort((a, b) => (a.orderHint || 0) - (b.orderHint || 0));

    return `
      <div class="card card-pad">
        <div class="section-title" style="margin:0 0 14px;">
          <div>
            <h3 style="margin:0;">${esc(block.name)}</h3>
            <div class="mini">${esc(block.day || 'Day 1')}</div>
          </div>
          <div class="actions">
            <form class="inline" method="post" action="/portal/meet/${meet.id}/block/${block.id}/delete" onsubmit="return confirm('Delete this block and return its races to Unassigned?');">
              <button class="btn btn-danger" type="submit">Delete Block</button>
            </form>
          </div>
        </div>

        <form class="stack" method="post" action="/portal/meet/${meet.id}/block/${block.id}/meta">
          <div class="row row-2">
            <div>
              <label>Block Name</label>
              <input name="name" value="${esc(block.name)}" />
            </div>
            <div>
              <label>Day</label>
              <select name="day">
                <option value="Day 1" ${selected(block.day, 'Day 1')}>Day 1</option>
                <option value="Day 2" ${selected(block.day, 'Day 2')}>Day 2</option>
                <option value="Day 3" ${selected(block.day, 'Day 3')}>Day 3</option>
              </select>
            </div>
          </div>
          <div>
            <label>Block Notes</label>
            <input name="notes" value="${esc(block.notes || '')}" />
          </div>
          <button class="btn btn-ghost" type="submit">Save Block Info</button>
        </form>

        <div class="divider"></div>

        <div class="grid">
          ${races.length === 0 ? `<div class="mini">No races in this block yet.</div>` : races.map(race => `
            <div class="subtle">
              <div class="actions" style="justify-content:space-between;">
                <div>
                  <strong>${esc(getRaceDisplayTitle(race))}</strong>
                  <div class="mini">${esc(raceTypeLabel(race))}</div>
                </div>
                <form class="inline" method="post" action="/portal/meet/${meet.id}/race/${race.id}/unassign">
                  <button class="btn btn-ghost" type="submit">Unassign</button>
                </form>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  const unassigned = getUnassignedRaces(meet)
    .sort((a, b) => (a.orderHint || 0) - (b.orderHint || 0));

  const scheduleItems = [...(meet.scheduleItems || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  return layout(`Block Builder — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Block Builder</h2>
        <div class="muted">Use the old block workflow with the current look.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">${roleBackLabel(user)}</a>
        <form class="inline" method="post" action="/portal/meet/${meet.id}/blocks/new">
          <button class="btn btn-primary" type="submit">+ Add Block</button>
        </form>
      </div>
    </div>

    ${meetBuilderTabs(meet, 'blocks')}

    <div class="sticky-save">
      <a class="btn btn-primary" href="/portal/meet/${meet.id}/builder">Save Meet</a>
      <a class="btn btn-ghost" href="/portal/meet/${meet.id}">${roleBackLabel(user)}</a>
    </div>

    <div class="grid grid-2">
      <div class="grid">
        ${blocksHtml}
      </div>

      <div class="grid">
        <div class="card card-pad">
          <h3 style="margin-top:0;">Unassigned Races</h3>
          <p class="muted">Assign races into blocks below.</p>

          ${unassigned.length === 0 ? `<div class="mini">No unassigned races.</div>` : unassigned.map(race => `
            <div class="subtle" style="margin-bottom:12px;">
              <div class="actions" style="justify-content:space-between; align-items:center;">
                <div>
                  <strong>${esc(getRaceDisplayTitle(race))}</strong>
                  <div class="mini">${esc(raceTypeLabel(race))}</div>
                </div>
                <form class="inline" method="post" action="/portal/meet/${meet.id}/race/${race.id}/assign">
                  <select name="blockId" style="width:auto; min-width:140px; display:inline-block;">
                    ${(meet.blocks || []).map(block => `<option value="${block.id}">${esc(block.name)}</option>`).join('')}
                  </select>
                  <button class="btn btn-primary" type="submit">Assign</button>
                </form>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="card card-pad">
          <h3 style="margin-top:0;">Schedule Items</h3>
          <p class="muted">Lunch, practice, awards, and breaks live here. They do not create blocks.</p>

          <form class="stack" method="post" action="/portal/meet/${meet.id}/schedule-item/new">
            <div class="row row-2">
              <div>
                <label>Label</label>
                <input name="label" placeholder="Lunch / Practice / Awards" required />
              </div>
              <div>
                <label>Day</label>
                <select name="day">
                  <option value="Day 1">Day 1</option>
                  <option value="Day 2">Day 2</option>
                  <option value="Day 3">Day 3</option>
                </select>
              </div>
            </div>

            <div class="row row-2">
              <div>
                <label>Type</label>
                <select name="kind">
                  <option value="break">Break</option>
                  <option value="practice">Practice</option>
                  <option value="lunch">Lunch</option>
                  <option value="awards">Awards</option>
                  <option value="warmup">Warmup</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label>Order</label>
                <input name="order" value="${scheduleItems.length + 1}" />
              </div>
            </div>

            <div>
              <label>Notes</label>
              <input name="notes" />
            </div>

            <button class="btn btn-primary" type="submit">Add Schedule Item</button>
          </form>

          <div class="divider"></div>

          ${scheduleItems.length === 0 ? `<div class="mini">No schedule items yet.</div>` : scheduleItems.map(item => `
            <div class="subtle" style="margin-bottom:12px;">
              <div class="actions" style="justify-content:space-between;">
                <div>
                  <strong>${esc(item.label)}</strong>
                  <div class="mini">${esc(item.day)} · ${esc(item.kind)}</div>
                </div>
                <form class="inline" method="post" action="/portal/meet/${meet.id}/schedule-item/${item.id}/delete" onsubmit="return confirm('Delete this schedule item?');">
                  <button class="btn btn-danger" type="submit">Delete</button>
                </form>
              </div>
              ${item.notes ? `<div class="mini" style="margin-top:8px;">${esc(item.notes)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `, { user });
}app.get('/', (req, res) => {
  const data = getSessionUser(req);
  if (data?.user) return res.redirect(roleHomePath(data.user));
  return res.send(homePage(null));
});

app.get('/admin/login', (req, res) => {
  const data = getSessionUser(req);
  if (data?.user) return res.redirect(roleHomePath(data.user));
  return res.send(loginPage(''));
});

app.post('/admin/login', (req, res) => {
  const db = loadDb();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const user = db.users.find(u =>
    String(u.username || '').trim() === username &&
    String(u.password || '') === password &&
    u.active !== false
  );

  if (!user) return res.send(loginPage('Invalid username or password.'));

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
  return res.redirect(roleHomePath(user));
});

app.get('/admin/logout', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  const db = loadDb();
  db.sessions = (db.sessions || []).filter(s => s.token !== token);
  saveDb(db);
  clearCookie(res, SESSION_COOKIE);
  return res.redirect('/admin/login');
});

app.get('/portal', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  res.send(portalPage(req.user, req.db));
});

app.get('/judge', requireRole(USER_ROLES.JUDGE, USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  res.send(rolePortalPage(req.user, req.db, 'Judge', 'judges', meet => `/portal/meet/${meet.id}/race-day/judges`));
});

app.get('/announcer', requireRole(USER_ROLES.ANNOUNCER, USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  res.send(rolePortalPage(req.user, req.db, 'Announcer', 'announcers', meet => `/portal/meet/${meet.id}/race-day/announcer`));
});

app.get('/coach', requireRole(USER_ROLES.COACH, USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  res.send(rolePortalPage(req.user, req.db, 'Coach', 'coaches', meet => `/portal/meet/${meet.id}/race-day/coach`));
});

app.get('/checkin', requireRole(USER_ROLES.CHECKIN, USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  res.send(rolePortalPage(req.user, req.db, 'Check-In', 'checkin', meet => `/portal/meet/${meet.id}/check-in`));
});

app.get('/portal/new-meet', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = defaultMeet(req.user.id);
  meet.id = nextId(req.db.meets || []);
  req.db.meets.push(meet);
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.get('/portal/meet/:meetId', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  return res.send(meetDashboardPage(req.user, meet));
});

app.get('/portal/meet/:meetId/builder', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  return res.send(meetBuilderPage(req.user, meet, req.db));
});

app.get('/portal/meet/:meetId/builder/open', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  return res.send(specialBuilderPage(req.user, meet, meet.openGroups || [], 'open'));
});

app.get('/portal/meet/:meetId/builder/quad', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  return res.send(specialBuilderPage(req.user, meet, meet.quadGroups || [], 'quad'));
});

app.get('/portal/meet/:meetId/blocks', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  return res.send(blockBuilderPage(req.user, meet));
});

app.post('/portal/meet/:meetId/builder/save', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.meetName = String(req.body.meetName || '').trim() || 'New Meet';
  meet.date = String(req.body.date || '').trim();
  meet.startTime = String(req.body.startTime || '').trim();
  meet.registrationCloseDate = String(req.body.registrationCloseDate || '').trim();
  meet.registrationCloseTime = String(req.body.registrationCloseTime || '').trim();
  meet.status = String(req.body.status || 'Draft').trim();
  meet.trackLength = parseNumber(req.body.trackLength, 100);
  meet.lanes = parseNumber(req.body.lanes, 4);
  meet.rinkId = parseNumber(req.body.rinkId, 1);
  meet.ageRule = String(req.body.ageRule || AGE_RULES.USARS);
  meet.customAgeCutoffDate = String(req.body.customAgeCutoffDate || '').trim();
  meet.timeTrialsEnabled = !!req.body.timeTrialsEnabled;
  meet.openEnabled = !!req.body.openEnabled;
  meet.quadEnabled = !!req.body.quadEnabled;
  meet.relaysEnabled = !!req.body.relaysEnabled;
  meet.allowDayOfRegistration = !!req.body.allowDayOfRegistration;
  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;
  meet.showOnFindAMeet = !!req.body.showOnFindAMeet;
  meet.meetNotes = String(req.body.meetNotes || '').trim();

  (meet.groups || []).forEach((group, idx) => {
    STANDARD_DIVISION_KEYS.forEach(key => {
      group.divisions[key].enabled = !!req.body[`g_${idx}_${key}_enabled`];
      group.divisions[key].cost = parseNumber(req.body[`g_${idx}_${key}_cost`], 0);
      group.divisions[key].distances = [
        String(req.body[`g_${idx}_${key}_d1`] || '').trim(),
        String(req.body[`g_${idx}_${key}_d2`] || '').trim(),
        String(req.body[`g_${idx}_${key}_d3`] || '').trim(),
        String(req.body[`g_${idx}_${key}_d4`] || '').trim(),
      ];
    });
  });

  rebuildAllRegistrationDerivedFields(meet);
  regenerateRaces(meet);
  rebuildRaceAssignments(meet);
  rebuildAllResults(meet);
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.post('/portal/meet/:meetId/builder/open/save', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  (meet.openGroups || []).forEach((group, idx) => {
    group.enabled = !!req.body[`open_${idx}_enabled`];
    group.cost = parseNumber(req.body[`open_${idx}_cost`], 0);
    group.distances = [
      String(req.body[`open_${idx}_d1`] || '').trim(),
      String(req.body[`open_${idx}_d2`] || '').trim(),
      String(req.body[`open_${idx}_d3`] || '').trim(),
      String(req.body[`open_${idx}_d4`] || '').trim(),
    ];
  });

  regenerateRaces(meet);
  rebuildRaceAssignments(meet);
  rebuildAllResults(meet);
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/builder/open`);
});

app.post('/portal/meet/:meetId/builder/quad/save', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  (meet.quadGroups || []).forEach((group, idx) => {
    group.enabled = !!req.body[`quad_${idx}_enabled`];
    group.cost = parseNumber(req.body[`quad_${idx}_cost`], 0);
    group.distances = [
      String(req.body[`quad_${idx}_d1`] || '').trim(),
      String(req.body[`quad_${idx}_d2`] || '').trim(),
      String(req.body[`quad_${idx}_d3`] || '').trim(),
      String(req.body[`quad_${idx}_d4`] || '').trim(),
    ];
  });

  regenerateRaces(meet);
  rebuildRaceAssignments(meet);
  rebuildAllResults(meet);
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/builder/quad`);
});

app.post('/portal/meet/:meetId/blocks/new', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.blocks.push({
    id: `block_${crypto.randomBytes(4).toString('hex')}`,
    name: `Block ${(meet.blocks || []).length + 1}`,
    day: 'Day 1',
    notes: '',
    raceIds: [],
  });

  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/block/:blockId/meta', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const block = (meet.blocks || []).find(b => b.id === req.params.blockId);
  if (block) {
    block.name = String(req.body.name || block.name).trim() || block.name;
    block.day = String(req.body.day || block.day).trim() || 'Day 1';
    block.notes = String(req.body.notes || '').trim();
  }

  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/block/:blockId/delete', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  deleteBlockAndReturnRaces(meet, req.params.blockId);
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/race/:raceId/assign', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  assignRaceToBlock(meet, req.params.raceId, req.body.blockId);
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/race/:raceId/unassign', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  unassignRaceFromBlock(meet, req.params.raceId);
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/schedule-item/new', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.scheduleItems.push({
    id: `schedule_${crypto.randomBytes(4).toString('hex')}`,
    label: String(req.body.label || '').trim() || 'Schedule Item',
    kind: String(req.body.kind || 'break').trim(),
    day: String(req.body.day || 'Day 1').trim(),
    notes: String(req.body.notes || '').trim(),
    order: parseNumber(req.body.order, (meet.scheduleItems || []).length + 1),
  });

  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/schedule-item/:itemId/delete', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  meet.scheduleItems = (meet.scheduleItems || []).filter(item => item.id !== req.params.itemId);
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.listen(PORT, HOST, () => {
  console.log(`SpeedSkateMeet running on http://${HOST}:${PORT}`);
});