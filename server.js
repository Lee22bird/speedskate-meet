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

const STANDARD_DIVISION_KEYS = ['novice', 'elite'];
const SPECIAL_DIVISION_KEYS = ['open', 'quad'];

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

const MEET_POINTS_TABLE = {
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
    if (idx > -1) out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
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
    if (Number(age) >= 14) return g === 'girls' ? 'women' : 'men';
    return g;
  }
  if (g === 'women' || g === 'men') {
    if (Number(age) <= 13) return g === 'women' ? 'girls' : 'boys';
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
    },
  }));
}

function buildSpecialGroupSet() {
  return OPEN_TT_GROUPS.map(group => ({
    id: group.id,
    label: group.label,
    gender: group.gender,
    minAge: group.minAge,
    maxAge: group.maxAge,
    distances: ['', '', '', ''],
    cost: 0,
    enabled: false,
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
    openBuilder: buildSpecialGroupSet(),
    quadBuilder: buildSpecialGroupSet(),
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

  const hasRollerCity = db.rinks.some(r => String(r.name || '').trim().toLowerCase() === 'roller city');

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

function normalizeSpecialBuilderRows(rows) {
  const base = buildSpecialGroupSet();
  const byId = new Map((rows || []).map(r => [r.id, r]));
  return base.map(group => {
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
}function migrateMeet(meet, fallbackOwnerId) {
  if (!meet.createdByUserId) meet.createdByUserId = fallbackOwnerId;
  if (!Array.isArray(meet.groups) || meet.groups.length === 0) meet.groups = baseGroups();
  if (!Array.isArray(meet.registrations)) meet.registrations = [];
  if (!Array.isArray(meet.races)) meet.races = [];
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (!Array.isArray(meet.scheduleItems)) meet.scheduleItems = [];
  if (!meet.results || typeof meet.results !== 'object') meet.results = {};
  if (!Array.isArray(meet.results.timeTrialsByOpenGroup)) meet.results.timeTrialsByOpenGroup = [];
  if (!Array.isArray(meet.results.inlineStandings)) meet.results.inlineStandings = [];
  if (!Array.isArray(meet.results.quadStandings)) meet.results.quadStandings = [];
  if (!Array.isArray(meet.results.openResults)) meet.results.openResults = [];
  if (!meet.assignments || typeof meet.assignments !== 'object') meet.assignments = {};

  if (!Array.isArray(meet.assignments.judges)) meet.assignments.judges = [];
  if (!Array.isArray(meet.assignments.announcers)) meet.assignments.announcers = [];
  if (!Array.isArray(meet.assignments.coaches)) meet.assignments.coaches = [];
  if (!Array.isArray(meet.assignments.checkin)) meet.assignments.checkin = [];

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
      },
    };
  });

  meet.openBuilder = normalizeSpecialBuilderRows(meet.openBuilder);
  meet.quadBuilder = normalizeSpecialBuilderRows(meet.quadBuilder);

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
    scoringBucket: race.scoringBucket || 'inline',
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
    type: String(block.type || 'race'),
    notes: String(block.notes || ''),
    raceIds: Array.isArray(block.raceIds) ? block.raceIds : [],
  }));

  meet.scheduleItems = meet.scheduleItems.map((item, idx) => ({
    id: item.id || `sched_${idx + 1}_${crypto.randomBytes(3).toString('hex')}`,
    label: String(item.label || 'Schedule Item'),
    day: String(item.day || 'Day 1'),
    type: String(item.type || 'break'),
    notes: String(item.notes || ''),
    orderHint: Number(item.orderHint || idx + 1),
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
  if (!db.users.some(u => u.username === ADMIN_USERNAME)) db.users.unshift(defaultDb().users[0]);

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
  if (sess) sess.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
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

function getCompetitionDivisionGroup(meet, birthdate, gender) {
  const ref = getAgeReferenceDate(meet);
  const age = getAgeOnDate(birthdate, ref);
  const compGender = ageToCompetitionGender(gender, age);

  const group = (meet.groups || []).find(g =>
    Number(age) >= Number(g.minAge) &&
    Number(age) <= Number(g.maxAge) &&
    normalizeGender(g.gender) === compGender
  );

  return { age, group: group || null };
}

function getOpenTtGroup(age, gender) {
  const compGender = ageToCompetitionGender(gender, age);

  let candidates = OPEN_TT_GROUPS.filter(group =>
    Number(age) >= Number(group.minAge) &&
    Number(age) <= Number(group.maxAge)
  );

  if (Number(age) >= 35 && (compGender === 'women' || compGender === 'men')) {
    candidates = candidates.filter(g => g.label.toLowerCase().includes('masters'));
  } else if (Number(age) >= 14 && (compGender === 'women' || compGender === 'men')) {
    candidates = candidates.filter(g => g.label.toLowerCase().includes('senior'));
  } else {
    candidates = candidates.filter(g => !g.label.toLowerCase().includes('masters') && !g.label.toLowerCase().includes('senior'));
  }

  return candidates.find(group => normalizeGender(group.gender) === compGender) || null;
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

function getSpecialBuilderConfig(rows, groupId) {
  return (rows || []).find(r => r.id === groupId) || null;
}

function getMeetDistances(meet, groupId, divisionKey) {
  const cfg = getDivisionConfig(meet, groupId, divisionKey);
  if (!cfg?.enabled) return [];
  return (cfg.distances || []).map(x => String(x || '').trim()).filter(Boolean);
}

function getSpecialDistances(rows, groupId) {
  const cfg = getSpecialBuilderConfig(rows, groupId);
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

function getRoleVisibleRaceDayTabs(user, meet) {
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

  return tabs;
}

function userAssignedToMeet(user, meet, bucketName) {
  const ids = meet.assignments?.[bucketName] || [];
  return ids.includes(Number(user.id));
}

function getRoleVisibleMeets(db, user) {
  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) {
    return (db.meets || []).filter(meet => canEditMeet(user, meet));
  }

  return (db.meets || []).filter(meet =>
    (hasRole(user, USER_ROLES.JUDGE) && userAssignedToMeet(user, meet, 'judges')) ||
    (hasRole(user, USER_ROLES.ANNOUNCER) && userAssignedToMeet(user, meet, 'announcers')) ||
    (hasRole(user, USER_ROLES.COACH) && userAssignedToMeet(user, meet, 'coaches')) ||
    (hasRole(user, USER_ROLES.CHECKIN) && userAssignedToMeet(user, meet, 'checkin'))
  );
}

function getRoleHomePath(user, db) {
  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) return '/portal';
  if (hasRole(user, USER_ROLES.JUDGE)) return '/judge';
  if (hasRole(user, USER_ROLES.ANNOUNCER)) return '/announcer';
  if (hasRole(user, USER_ROLES.COACH)) return '/coach';
  if (hasRole(user, USER_ROLES.CHECKIN)) return '/checkin';
  return '/portal';
}

function getMeetRoleLandingPath(user, meet) {
  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) {
    return `/portal/meet/${meet.id}`;
  }
  if (hasRole(user, USER_ROLES.JUDGE)) return `/portal/meet/${meet.id}/race-day/judges`;
  if (hasRole(user, USER_ROLES.ANNOUNCER)) return `/portal/meet/${meet.id}/race-day/announcer`;
  if (hasRole(user, USER_ROLES.COACH)) return `/portal/meet/${meet.id}/race-day/coach`;
  if (hasRole(user, USER_ROLES.CHECKIN)) return `/portal/meet/${meet.id}/check-in`;
  return `/portal/meet/${meet.id}`;
}function buildRaceEntriesForRace(meet, race) {
  const regs = (meet.registrations || []).filter(reg => {
    if (race.type === 'time_trial') {
      return !!reg.options?.timeTrials && reg.ttOpenGroupId === race.groupId;
    }

    if (race.type === 'open_pack') {
      return !!reg.options?.open && reg.calculatedAge >= Number(race.minAge || 0) &&
        reg.calculatedAge <= Number(race.maxAge || 999) &&
        ageToCompetitionGender(reg.gender, reg.calculatedAge) === normalizeGender(race.gender || reg.gender);
    }

    if (race.type === 'quad') {
      return !!reg.options?.quad && reg.calculatedAge >= Number(race.minAge || 0) &&
        reg.calculatedAge <= Number(race.maxAge || 999) &&
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

  if (race.type === 'open_pack') {
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

  if (race.type === 'quad') {
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
    for (const divisionKey of STANDARD_DIVISION_KEYS) {
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
    for (const group of meet.openBuilder || []) {
      if (!group.enabled) continue;
      const distances = getSpecialDistances(meet.openBuilder, group.id);

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
        };

        race.scoringBucket = 'open';
        race.groupId = group.id;
        race.groupLabel = group.label;
        race.divisionKey = 'open';
        race.distanceLabel = distanceLabel;
        race.gender = group.gender;
        race.minAge = group.minAge;
        race.maxAge = group.maxAge;
        race.orderHint = orderCounter++;
        buildRaceEntriesForRace(meet, race);
        newRaces.push(race);
      });
    }
  }

  if (meet.quadEnabled) {
    for (const group of meet.quadBuilder || []) {
      if (!group.enabled) continue;
      const distances = getSpecialDistances(meet.quadBuilder, group.id);

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
        };

        race.scoringBucket = 'quad';
        race.groupId = group.id;
        race.groupLabel = group.label;
        race.divisionKey = 'quad';
        race.distanceLabel = distanceLabel;
        race.gender = group.gender;
        race.minAge = group.minAge;
        race.maxAge = group.maxAge;
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
      };

      race.scoringBucket = 'time_trial';
      race.groupId = group.id;
      race.groupLabel = group.label;
      race.divisionKey = 'time_trial';
      race.label = 'Time Trial';
      race.distanceLabel = '';
      race.gender = group.gender;
      race.minAge = group.minAge;
      race.maxAge = group.maxAge;
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
  ensureDefaultBlock(meet);
  rebuildRaceAssignments(meet);
  rebuildAllResults(meet);
}

function getUnassignedRaces(meet) {
  return (meet.races || []).filter(r => !r.blockId);
}

function ensureDefaultBlock(meet) {
  if (!Array.isArray(meet.blocks) || meet.blocks.length === 0) {
    meet.blocks = [{
      id: `block_${crypto.randomBytes(4).toString('hex')}`,
      name: 'Block 1',
      day: 'Day 1',
      type: 'race',
      notes: '',
      raceIds: [],
    }];
  }
}

function assignRaceToBlock(meet, raceId, blockId) {
  const race = (meet.races || []).find(r => r.id === raceId);
  const block = (meet.blocks || []).find(b => b.id === blockId);
  if (!race || !block) return false;

  if (race.blockId) {
    const oldBlock = (meet.blocks || []).find(b => b.id === race.blockId);
    if (oldBlock) oldBlock.raceIds = (oldBlock.raceIds || []).filter(id => id !== race.id);
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

function rebuildRaceAssignments(meet) {
  const blockMap = new Map((meet.blocks || []).map(b => [b.id, b]));
  for (const block of meet.blocks || []) block.raceIds = (block.raceIds || []).filter(id => (meet.races || []).some(r => r.id === id));

  for (const race of meet.races || []) {
    if (!race.blockId) continue;
    const block = blockMap.get(race.blockId);
    if (!block) {
      race.blockId = '';
      continue;
    }
    if (!(block.raceIds || []).includes(race.id)) block.raceIds.push(race.id);
  }
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

function getOrderedScheduleItems(meet) {
  return [...(meet.scheduleItems || [])].sort((a, b) => {
    if (String(a.day || '') !== String(b.day || '')) return String(a.day || '').localeCompare(String(b.day || ''));
    return Number(a.orderHint || 0) - Number(b.orderHint || 0);
  });
}

function scorePlaceToPoints(place) {
  return Number(MEET_POINTS_TABLE[Number(place)] || 0);
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
      if (!reg || !reg.ttOpenGroupId) continue;

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

  meet.results.timeTrialsByOpenGroup = Object.values(grouped)
    .map(group => ({
      ...group,
      rows: sortTimeRows(group.rows).map((row, idx) => ({
        ...row,
        place: idx + 1,
      })),
    }))
    .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
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

  if (idx < 0) idx = Number.isFinite(meet.currentRaceIndex) ? meet.currentRaceIndex : -1;
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

function getBackLabelForUser(user) {
  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) {
    return '← Meet Dashboard';
  }
  return '← Back to My Meets';
}

function getBackHrefForUser(user, meet) {
  if (hasRole(user, USER_ROLES.SUPER_ADMIN) || hasRole(user, USER_ROLES.MEET_DIRECTOR)) {
    return `/portal/meet/${meet.id}`;
  }
  if (hasRole(user, USER_ROLES.JUDGE)) return '/judge';
  if (hasRole(user, USER_ROLES.ANNOUNCER)) return '/announcer';
  if (hasRole(user, USER_ROLES.COACH)) return '/coach';
  if (hasRole(user, USER_ROLES.CHECKIN)) return '/checkin';
  return '/portal';
}

function roleBadge(role) {
  const labels = {
    [USER_ROLES.SUPER_ADMIN]: 'Super Admin',
    [USER_ROLES.MEET_DIRECTOR]: 'Meet Director',
    [USER_ROLES.JUDGE]: 'Judge',
    [USER_ROLES.ANNOUNCER]: 'Announcer',
    [USER_ROLES.COACH]: 'Coach',
    [USER_ROLES.CHECKIN]: 'Check-In',
  };
  return `<span class="pill">${esc(labels[role] || role)}</span>`;
}

function raceDayTabs(user, meet, currentTab) {
  const items = getRoleVisibleRaceDayTabs(user, meet);

  return `
    <div class="actions" style="margin-bottom:18px;">
      ${items.map(item => `
        <a class="btn ${currentTab === item.key ? 'btn-primary' : 'btn-ghost'}" href="${item.href}">
          ${esc(item.label)}
        </a>
      `).join('')}
    </div>
  `;
}

function selectedRinkOptions(db, meet) {
  return (db.rinks || []).map(rink =>
    `<option value="${rink.id}" ${selected(meet.rinkId, rink.id)}>${esc(rink.name)} (${esc(rink.city)}, ${esc(rink.state)})</option>`
  ).join('');
}

function builderTopActions(meet, backHref, backLabel) {
  return `
    <div class="actions">
      <button class="btn btn-primary" type="submit">Save Meet</button>
      <a class="btn btn-ghost" href="${backHref}">${esc(backLabel)}</a>
    </div>
  `;
}

function builderTabs(meet, active) {
  return `
    <div class="actions" style="margin-bottom:18px;">
      <a class="btn ${active === 'main' ? 'btn-primary' : 'btn-ghost'}" href="/portal/meet/${meet.id}/builder">Meet Builder</a>
      <a class="btn ${active === 'open' ? 'btn-primary' : 'btn-ghost'}" href="/portal/meet/${meet.id}/builder/open">Open Builder</a>
      <a class="btn ${active === 'quad' ? 'btn-primary' : 'btn-ghost'}" href="/portal/meet/${meet.id}/builder/quad">Quad Builder</a>
      <a class="btn ${active === 'blocks' ? 'btn-primary' : 'btn-ghost'}" href="/portal/meet/${meet.id}/blocks">Block Builder</a>
    </div>
  `;
}function shell(title, body, user, opts = {}) {
  const pageTitle = `${title} • SpeedSkateMeet`;
  const accent = opts.accent || '#6d5efc';

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(pageTitle)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root{
      --bg:#0b0d12;
      --panel:#121722;
      --panel-2:#171d2b;
      --line:#242c3d;
      --text:#eef3ff;
      --muted:#9eabc7;
      --accent:${accent};
      --accent-2:#8f84ff;
      --good:#27c07d;
      --warn:#f2b84b;
      --danger:#ef5f72;
      --radius:22px;
      --radius-sm:16px;
      --shadow:0 18px 50px rgba(0,0,0,.35);
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      background:
        radial-gradient(circle at top left, rgba(109,94,252,.18), transparent 26%),
        radial-gradient(circle at top right, rgba(39,192,125,.08), transparent 22%),
        linear-gradient(180deg,#090b10 0%, #0d1017 100%);
      color:var(--text);
      min-height:100vh;
    }
    a{color:inherit;text-decoration:none}
    .wrap{max-width:1320px;margin:0 auto;padding:26px 18px 80px}
    .topbar{
      position:sticky;top:0;z-index:50;
      backdrop-filter:blur(14px);
      background:rgba(11,13,18,.72);
      border-bottom:1px solid rgba(255,255,255,.06);
    }
    .topbar-inner{
      max-width:1320px;margin:0 auto;padding:14px 18px;
      display:flex;align-items:center;justify-content:space-between;gap:14px;
    }
    .brand{
      display:flex;align-items:center;gap:16px;font-weight:900;letter-spacing:.02em;
    }
    .brand-logo{
      width:58px;height:58px;border-radius:18px;object-fit:contain;background:#0f1420;
      border:1px solid rgba(255,255,255,.08);padding:8px;box-shadow:var(--shadow);
    }
    .brand-stack{display:flex;flex-direction:column;line-height:1.05}
    .brand-stack small{color:var(--muted);font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
    .brand-stack strong{font-size:1.18rem}
    .top-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .hero{
      margin:18px 0 24px;
      display:grid;grid-template-columns:1.2fr .8fr;gap:18px;
    }
    .card{
      background:linear-gradient(180deg,var(--panel),var(--panel-2));
      border:1px solid rgba(255,255,255,.06);
      border-radius:var(--radius);
      box-shadow:var(--shadow);
      padding:22px;
    }
    .hero-main{
      display:flex;align-items:center;justify-content:space-between;gap:18px;
      min-height:168px;
    }
    .hero-logo{
      width:min(260px,42vw);
      max-width:320px;
      height:auto;
      object-fit:contain;
      filter:drop-shadow(0 10px 30px rgba(0,0,0,.35));
    }
    .hero-copy h1{
      margin:0 0 8px;font-size:clamp(2rem,4vw,3.2rem);line-height:.96;
      letter-spacing:-.03em;
    }
    .hero-copy p{margin:0;color:var(--muted);font-size:1rem;max-width:56ch}
    .hero-side{
      display:flex;flex-direction:column;justify-content:space-between;gap:12px;
    }
    .hero-side .stat{
      display:flex;justify-content:space-between;align-items:center;
      padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.05);
    }
    .hero-side .stat strong{font-size:1.4rem}
    .grid{display:grid;gap:18px}
    .grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
    .grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
    .grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}
    .section-title{
      display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;
    }
    .section-title h2,.section-title h3{
      margin:0;font-size:1.2rem;letter-spacing:-.02em;
    }
    .muted{color:var(--muted)}
    .pill{
      display:inline-flex;align-items:center;gap:6px;
      padding:8px 12px;border-radius:999px;
      background:rgba(109,94,252,.16);
      border:1px solid rgba(109,94,252,.24);
      color:#e8e3ff;font-size:.84rem;font-weight:800;
    }
    .btn{
      display:inline-flex;align-items:center;justify-content:center;gap:10px;
      min-height:46px;padding:0 16px;border-radius:18px;
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.04);
      color:var(--text);font-weight:800;cursor:pointer;
      transition:.18s ease;box-shadow:none;
    }
    .btn:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.16)}
    .btn-primary{
      background:linear-gradient(135deg,var(--accent),var(--accent-2));
      border-color:transparent;color:white;
      box-shadow:0 12px 30px rgba(109,94,252,.28);
    }
    .btn-danger{
      background:linear-gradient(135deg,#e45469,#ef5f72);
      border-color:transparent;color:white;
    }
    .btn-good{
      background:linear-gradient(135deg,#1fa96d,#27c07d);
      border-color:transparent;color:white;
    }
    .btn-ghost{background:rgba(255,255,255,.03)}
    .actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .stack{display:flex;flex-direction:column;gap:14px}
    .field{display:flex;flex-direction:column;gap:8px}
    .field label{font-size:.9rem;font-weight:800;color:#d7e1fb}
    input,select,textarea{
      width:100%;background:#0e1420;color:var(--text);
      border:1px solid var(--line);border-radius:18px;
      min-height:48px;padding:12px 14px;font:inherit;outline:none;
    }
    textarea{min-height:120px;resize:vertical}
    input:focus,select:focus,textarea:focus{
      border-color:rgba(109,94,252,.7);
      box-shadow:0 0 0 4px rgba(109,94,252,.12);
    }
    .inline{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .table-wrap{
      overflow:auto;border:1px solid rgba(255,255,255,.06);
      border-radius:20px;background:rgba(255,255,255,.02);
    }
    table{width:100%;border-collapse:collapse;min-width:760px}
    th,td{padding:14px 14px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left}
    th{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#c7d3ef}
    tr:last-child td{border-bottom:none}
    .mini{font-size:.88rem}
    .tiny{font-size:.78rem}
    .kpi{
      padding:18px;border-radius:22px;background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.06);
    }
    .kpi strong{display:block;font-size:2rem;line-height:1;margin-top:6px}
    .empty{
      padding:26px;border-radius:22px;border:1px dashed rgba(255,255,255,.14);
      color:var(--muted);text-align:center;background:rgba(255,255,255,.02);
    }
    .toggle-row{
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      padding:16px 18px;border-radius:22px;background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.06);
    }
    .toggle-copy{display:flex;flex-direction:column;gap:4px}
    .toggle-copy strong{font-size:1rem}
    .switch{position:relative;display:inline-block;width:66px;height:38px;flex:0 0 auto}
    .switch input{opacity:0;width:0;height:0;position:absolute}
    .slider{
      position:absolute;inset:0;border-radius:999px;background:#2a3246;
      border:1px solid rgba(255,255,255,.08);transition:.18s ease;
    }
    .slider:before{
      content:"";position:absolute;height:28px;width:28px;left:4px;top:4px;
      background:white;border-radius:50%;transition:.18s ease;
      box-shadow:0 8px 20px rgba(0,0,0,.25);
    }
    .switch input:checked + .slider{
      background:linear-gradient(135deg,var(--accent),var(--accent-2));
    }
    .switch input:checked + .slider:before{transform:translateX(28px)}
    .sticky-save{
      position:sticky;top:88px;z-index:20;margin-bottom:18px;
    }
    .subtle{
      color:var(--muted);font-size:.9rem;
    }
    .race-card,.block-card,.user-card,.meet-card{
      border-radius:24px;padding:18px;background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.06);
    }
    .race-card h4,.block-card h4,.user-card h4,.meet-card h4{
      margin:0 0 8px;font-size:1.02rem;
    }
    .divider{height:1px;background:rgba(255,255,255,.07);margin:16px 0}
    .center{text-align:center}
    .right{text-align:right}
    .danger{color:#ff98a6}
    .good{color:#7ae6b0}
    .warn{color:#ffd27c}
    .logo-center{
      display:flex;align-items:center;justify-content:center;
      margin:4px 0 14px;
    }
    .logo-center img{
      width:min(300px,65vw);max-width:340px;height:auto;object-fit:contain;
      filter:drop-shadow(0 10px 30px rgba(0,0,0,.35));
    }
    @media (max-width: 980px){
      .hero{grid-template-columns:1fr}
      .grid-4,.grid-3,.grid-2{grid-template-columns:1fr}
      .hero-main{flex-direction:column;align-items:flex-start}
      .hero-logo{width:min(240px,72vw)}
      .topbar-inner{flex-direction:column;align-items:flex-start}
      .sticky-save{top:76px}
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <img class="brand-logo" src="/logo.png" alt="SpeedSkateMeet" onerror="this.style.display='none'">
        <div class="brand-stack">
          <small>Race Day Software</small>
          <strong>SpeedSkateMeet</strong>
        </div>
      </div>
      <div class="top-actions">
        ${user ? `<span class="pill">${esc(user.displayName || user.username)}</span>` : ''}
        ${user ? `<a class="btn btn-ghost" href="${esc(getRoleHomePath(user, loadDb()))}">Home</a>` : ''}
        ${user ? `<a class="btn btn-ghost" href="/logout">Logout</a>` : ''}
      </div>
    </div>
  </div>
  <div class="wrap">
    <div class="logo-center">
      <img src="/logo.png" alt="SpeedSkateMeet" onerror="this.style.display='none'">
    </div>
    ${body}
  </div>
</body>
</html>
  `;
}

app.get('/', (req, res) => {
  const data = getSessionUser(req);
  if (data?.user) return res.redirect(getRoleHomePath(data.user, data.db));
  return res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
  const data = getSessionUser(req);
  if (data?.user) return res.redirect(getRoleHomePath(data.user, data.db));

  const body = `
    <div class="hero">
      <div class="card hero-main">
        <div class="hero-copy">
          <span class="pill">Meet Day Ready</span>
          <h1>Run your entire meet without the chaos.</h1>
          <p>
            Registrations, race builds, blocks, judges, announcers, coaches, live race flow,
            results, and meet-day control — all in one place.
          </p>
        </div>
        <img class="hero-logo" src="/logo.png" alt="SpeedSkateMeet" onerror="this.style.display='none'">
      </div>
      <div class="card hero-side">
        <div class="stat"><span class="muted">Built for</span><strong>Inline + Quad</strong></div>
        <div class="stat"><span class="muted">Handles</span><strong>Open + TT + Divisions</strong></div>
        <div class="stat"><span class="muted">Designed for</span><strong>Real Meet Day</strong></div>
      </div>
    </div>

    <div class="card" style="max-width:560px;margin:0 auto;">
      <div class="section-title">
        <h2>Portal Login</h2>
        <span class="pill">Officials • Coaches • Admin</span>
      </div>
      <form method="post" action="/admin/login" class="stack">
        <div class="field">
          <label>Username</label>
          <input name="username" autocomplete="username" required />
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" name="password" autocomplete="current-password" required />
        </div>
        <button class="btn btn-primary" type="submit">Login</button>
      </form>
    </div>
  `;

  res.send(shell('Login', body, null));
});

app.post('/admin/login', (req, res) => {
  const db = loadDb();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const user = db.users.find(u =>
    String(u.username || '').toLowerCase() === username.toLowerCase() &&
    String(u.password || '') === password &&
    u.active !== false
  );

  if (!user) return res.redirect('/admin/login');

  const token = crypto.randomBytes(24).toString('hex');
  db.sessions = db.sessions.filter(s => s.userId !== user.id);
  db.sessions.push({
    token,
    userId: user.id,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  saveDb(db);
  setCookie(res, SESSION_COOKIE, token, Math.floor(SESSION_TTL_MS / 1000));

  return res.redirect(getRoleHomePath(user, db));
});

app.get('/logout', (req, res) => {
  const db = loadDb();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    db.sessions = db.sessions.filter(s => s.token !== token);
    saveDb(db);
  }
  clearCookie(res, SESSION_COOKIE);
  res.redirect('/admin/login');
});

app.get('/portal', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const myMeets = getRoleVisibleMeets(req.db, req.user);
  const upcoming = myMeets.filter(m => m.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const totalRegistrations = myMeets.reduce((sum, meet) => sum + (meet.registrations || []).length, 0);

  const body = `
    <div class="hero">
      <div class="card hero-main">
        <div class="hero-copy">
          <span class="pill">Meet Director Portal</span>
          <h1>Run cleaner meets with less scrambling.</h1>
          <p>
            Build your meet, manage registrations, assign officials, control race day,
            and keep live results moving.
          </p>
        </div>
        <img class="hero-logo" src="/logo.png" alt="SpeedSkateMeet" onerror="this.style.display='none'">
      </div>
      <div class="card hero-side">
        <div class="stat"><span class="muted">My Meets</span><strong>${myMeets.length}</strong></div>
        <div class="stat"><span class="muted">Registrations</span><strong>${totalRegistrations}</strong></div>
        <div class="stat"><span class="muted">Rinks Saved</span><strong>${(req.db.rinks || []).length}</strong></div>
      </div>
    </div>

    <div class="actions" style="margin-bottom:18px;">
      <a class="btn btn-primary" href="/portal/meet/new">+ New Meet</a>
      <a class="btn btn-ghost" href="/portal/rinks">Find a Rink</a>
      <a class="btn btn-ghost" href="/portal/users">User Access</a>
    </div>

    <div class="grid grid-3" style="margin-bottom:18px;">
      <div class="kpi"><span class="muted">Upcoming Meets</span><strong>${upcoming.length}</strong></div>
      <div class="kpi"><span class="muted">Race Blocks Built</span><strong>${myMeets.reduce((s,m)=>s+(m.blocks||[]).length,0)}</strong></div>
      <div class="kpi"><span class="muted">Races Generated</span><strong>${myMeets.reduce((s,m)=>s+(m.races||[]).length,0)}</strong></div>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>My Meets</h2>
        <span class="pill">${myMeets.length} total</span>
      </div>
      ${myMeets.length ? `
        <div class="grid grid-3">
          ${myMeets.map(meet => `
            <div class="meet-card">
              <h4>${esc(meet.meetName || 'Untitled Meet')}</h4>
              <div class="stack mini">
                <div><span class="muted">Date:</span> ${esc(formatDateHuman(meet.date))}</div>
                <div><span class="muted">Status:</span> ${esc(meet.status || 'Draft')}</div>
                <div><span class="muted">Registrations:</span> ${(meet.registrations || []).length}</div>
              </div>
              <div class="actions" style="margin-top:14px;">
                <a class="btn btn-primary" href="/portal/meet/${meet.id}">Open Meet</a>
                <a class="btn btn-ghost" href="/portal/meet/${meet.id}/builder">Builder</a>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<div class="empty">No meets yet. Start one and build a banger.</div>`}
    </div>
  `;

  res.send(shell('Portal', body, req.user));
});app.get('/judge', requireRole(USER_ROLES.JUDGE, USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meets = getRoleVisibleMeets(req.db, req.user).filter(meet =>
    hasRole(req.user, USER_ROLES.SUPER_ADMIN) ||
    hasRole(req.user, USER_ROLES.MEET_DIRECTOR) ||
    userAssignedToMeet(req.user, meet, 'judges')
  );

  const body = `
    <div class="hero">
      <div class="card hero-main">
        <div class="hero-copy">
          <span class="pill">Judge Portal</span>
          <h1>Pick the meet and score the race.</h1>
          <p>No clutter. No buried tabs. Just the meets you’re judging.</p>
        </div>
        <img class="hero-logo" src="/logo.png" alt="SpeedSkateMeet" onerror="this.style.display='none'">
      </div>
      <div class="card hero-side">
        <div class="stat"><span class="muted">Assigned Meets</span><strong>${meets.length}</strong></div>
        <div class="stat"><span class="muted">Role</span><strong>Judge</strong></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>My Meets</h2>
      </div>
      ${
        meets.length
          ? `<div class="grid grid-3">
              ${meets.map(meet => `
                <div class="meet-card">
                  <h4>${esc(meet.meetName || 'Untitled Meet')}</h4>
                  <div class="stack mini">
                    <div><span class="muted">Date:</span> ${esc(formatDateHuman(meet.date))}</div>
                    <div><span class="muted">Current Race:</span> ${esc((getCurrentRaceBundle(meet).current && getRaceDisplayTitle(getCurrentRaceBundle(meet).current)) || 'Not set')}</div>
                  </div>
                  <div class="actions" style="margin-top:14px;">
                    <a class="btn btn-primary" href="/portal/meet/${meet.id}/race-day/judges">Open Judges</a>
                    <a class="btn btn-ghost" href="/portal/meet/${meet.id}/race-day/live">Live</a>
                  </div>
                </div>
              `).join('')}
            </div>`
          : `<div class="empty">No judge meets assigned yet.</div>`
      }
    </div>
  `;

  res.send(shell('Judge Portal', body, req.user));
});

app.get('/announcer', requireRole(USER_ROLES.ANNOUNCER, USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meets = getRoleVisibleMeets(req.db, req.user).filter(meet =>
    hasRole(req.user, USER_ROLES.SUPER_ADMIN) ||
    hasRole(req.user, USER_ROLES.MEET_DIRECTOR) ||
    userAssignedToMeet(req.user, meet, 'announcers')
  );

  const body = `
    <div class="hero">
      <div class="card hero-main">
        <div class="hero-copy">
          <span class="pill">Announcer Portal</span>
          <h1>Open your meet and call the race.</h1>
          <p>Current race. On deck. Clean announcer view. Nothing extra.</p>
        </div>
        <img class="hero-logo" src="/logo.png" alt="SpeedSkateMeet" onerror="this.style.display='none'">
      </div>
      <div class="card hero-side">
        <div class="stat"><span class="muted">Assigned Meets</span><strong>${meets.length}</strong></div>
        <div class="stat"><span class="muted">Role</span><strong>Announcer</strong></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>My Meets</h2>
      </div>
      ${
        meets.length
          ? `<div class="grid grid-3">
              ${meets.map(meet => `
                <div class="meet-card">
                  <h4>${esc(meet.meetName || 'Untitled Meet')}</h4>
                  <div class="stack mini">
                    <div><span class="muted">Date:</span> ${esc(formatDateHuman(meet.date))}</div>
                    <div><span class="muted">Status:</span> ${esc(meet.status || 'Draft')}</div>
                  </div>
                  <div class="actions" style="margin-top:14px;">
                    <a class="btn btn-primary" href="/portal/meet/${meet.id}/race-day/announcer">Open Announcer</a>
                    <a class="btn btn-ghost" href="/portal/meet/${meet.id}/race-day/live">Live</a>
                  </div>
                </div>
              `).join('')}
            </div>`
          : `<div class="empty">No announcer meets assigned yet.</div>`
      }
    </div>
  `;

  res.send(shell('Announcer Portal', body, req.user));
});

app.get('/coach', requireRole(USER_ROLES.COACH, USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meets = getRoleVisibleMeets(req.db, req.user).filter(meet =>
    hasRole(req.user, USER_ROLES.SUPER_ADMIN) ||
    hasRole(req.user, USER_ROLES.MEET_DIRECTOR) ||
    userAssignedToMeet(req.user, meet, 'coaches')
  );

  const body = `
    <div class="hero">
      <div class="card hero-main">
        <div class="hero-copy">
          <span class="pill">Coach Portal</span>
          <h1>See your meets and keep your skaters ready.</h1>
          <p>Current race, on deck, team info, and live meet flow without admin junk.</p>
        </div>
        <img class="hero-logo" src="/logo.png" alt="SpeedSkateMeet" onerror="this.style.display='none'">
      </div>
      <div class="card hero-side">
        <div class="stat"><span class="muted">Assigned Meets</span><strong>${meets.length}</strong></div>
        <div class="stat"><span class="muted">Role</span><strong>Coach</strong></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>My Meets</h2>
      </div>
      ${
        meets.length
          ? `<div class="grid grid-3">
              ${meets.map(meet => `
                <div class="meet-card">
                  <h4>${esc(meet.meetName || 'Untitled Meet')}</h4>
                  <div class="stack mini">
                    <div><span class="muted">Date:</span> ${esc(formatDateHuman(meet.date))}</div>
                    <div><span class="muted">My Team:</span> ${esc(req.user.team || 'Independent')}</div>
                  </div>
                  <div class="actions" style="margin-top:14px;">
                    <a class="btn btn-primary" href="/portal/meet/${meet.id}/race-day/coach">Open Coach View</a>
                    <a class="btn btn-ghost" href="/portal/meet/${meet.id}/race-day/live">Live</a>
                  </div>
                </div>
              `).join('')}
            </div>`
          : `<div class="empty">No coach meets assigned yet.</div>`
      }
    </div>
  `;

  res.send(shell('Coach Portal', body, req.user));
});

app.get('/checkin', requireRole(USER_ROLES.CHECKIN, USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meets = getRoleVisibleMeets(req.db, req.user).filter(meet =>
    hasRole(req.user, USER_ROLES.SUPER_ADMIN) ||
    hasRole(req.user, USER_ROLES.MEET_DIRECTOR) ||
    userAssignedToMeet(req.user, meet, 'checkin')
  );

  const body = `
    <div class="hero">
      <div class="card hero-main">
        <div class="hero-copy">
          <span class="pill">Check-In Portal</span>
          <h1>Find the meet and get skaters checked in fast.</h1>
          <p>Minimal workflow. Just the assigned meet list and check-in screen.</p>
        </div>
        <img class="hero-logo" src="/logo.png" alt="SpeedSkateMeet" onerror="this.style.display='none'">
      </div>
      <div class="card hero-side">
        <div class="stat"><span class="muted">Assigned Meets</span><strong>${meets.length}</strong></div>
        <div class="stat"><span class="muted">Role</span><strong>Check-In</strong></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>My Meets</h2>
      </div>
      ${
        meets.length
          ? `<div class="grid grid-3">
              ${meets.map(meet => `
                <div class="meet-card">
                  <h4>${esc(meet.meetName || 'Untitled Meet')}</h4>
                  <div class="stack mini">
                    <div><span class="muted">Date:</span> ${esc(formatDateHuman(meet.date))}</div>
                    <div><span class="muted">Registrations:</span> ${(meet.registrations || []).length}</div>
                  </div>
                  <div class="actions" style="margin-top:14px;">
                    <a class="btn btn-primary" href="/portal/meet/${meet.id}/check-in">Open Check-In</a>
                  </div>
                </div>
              `).join('')}
            </div>`
          : `<div class="empty">No check-in meets assigned yet.</div>`
      }
    </div>
  `;

  res.send(shell('Check-In Portal', body, req.user));
});

app.get('/portal/meet/new', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = defaultMeet(req.user.id);
  meet.id = nextId(req.db.meets);
  req.db.meets.push(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder`);
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
  if (!meet) return res.redirect(getRoleHomePath(req.user, req.db));

  if (!canEditMeet(req.user, meet)) {
    return res.redirect(getMeetRoleLandingPath(req.user, meet));
  }

  const regCount = meet.registrations?.length || 0;
  const raceCount = meet.races?.length || 0;
  const blockCount = meet.blocks?.length || 0;
  const checkedInCount = (meet.registrations || []).filter(r => r.checkIn?.checkedIn).length;

  const body = `
    <div class="hero">
      <div class="card hero-main">
        <div class="hero-copy">
          <span class="pill">${esc(meet.status || 'Draft')}</span>
          <h1>${esc(meet.meetName || 'Untitled Meet')}</h1>
          <p>${esc(formatDateHuman(meet.date))} • ${esc(meet.startTime || 'No start time')} • ${esc(meet.ageRule || AGE_RULES.USARS)}</p>
        </div>
        <img class="hero-logo" src="/logo.png" alt="SpeedSkateMeet" onerror="this.style.display='none'">
      </div>
      <div class="card hero-side">
        <div class="stat"><span class="muted">Registrations</span><strong>${regCount}</strong></div>
        <div class="stat"><span class="muted">Races</span><strong>${raceCount}</strong></div>
        <div class="stat"><span class="muted">Blocks</span><strong>${blockCount}</strong></div>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:18px;">
      <div class="kpi"><span class="muted">Checked In</span><strong>${checkedInCount}</strong></div>
      <div class="kpi"><span class="muted">Judges Assigned</span><strong>${(meet.assignments?.judges || []).length}</strong></div>
      <div class="kpi"><span class="muted">Announcers Assigned</span><strong>${(meet.assignments?.announcers || []).length}</strong></div>
      <div class="kpi"><span class="muted">Coaches Assigned</span><strong>${(meet.assignments?.coaches || []).length}</strong></div>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>Meet Tools</h2>
      </div>
      <div class="grid grid-3">
        <a class="meet-card" href="/portal/meet/${meet.id}/builder"><h4>Meet Builder</h4><div class="subtle">Core meet setup, divisions, event info, rules, and builder tabs.</div></a>
        <a class="meet-card" href="/portal/meet/${meet.id}/builder/open"><h4>Open Builder</h4><div class="subtle">Separate open groups and distances.</div></a>
        <a class="meet-card" href="/portal/meet/${meet.id}/builder/quad"><h4>Quad Builder</h4><div class="subtle">Separate quad groups and distances.</div></a>
        <a class="meet-card" href="/portal/meet/${meet.id}/blocks"><h4>Block Builder</h4><div class="subtle">Old block workflow restored with the new look.</div></a>
        <a class="meet-card" href="/portal/meet/${meet.id}/registered"><h4>Registered</h4><div class="subtle">Manage registrations, walk-ins, edit racers, and import later.</div></a>
        <a class="meet-card" href="/portal/meet/${meet.id}/check-in"><h4>Check-In</h4><div class="subtle">Fast meet-day check-in flow.</div></a>
        <a class="meet-card" href="/portal/meet/${meet.id}/race-day/director"><h4>Race Day</h4><div class="subtle">Director control, judges, announcer, coach, and live views.</div></a>
        <a class="meet-card" href="/results/${meet.id}" target="_blank"><h4>Results</h4><div class="subtle">Public-facing standings and results.</div></a>
        <a class="meet-card" href="/live/${meet.id}" target="_blank"><h4>Public Live</h4><div class="subtle">Current race and on deck for the TV / live display.</div></a>
      </div>
    </div>
  `;

  res.send(shell('Meet Dashboard', body, req.user));
});app.get('/portal/meet/:meetId/builder', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const backHref = getBackHrefForUser(req.user, meet);
  const backLabel = getBackLabelForUser(req.user);

  const ageRuleOptions = Object.values(AGE_RULES).map(rule =>
    `<option value="${esc(rule)}" ${selected(meet.ageRule, rule)}>${esc(rule)}</option>`
  ).join('');

  const body = `
    <div class="sticky-save">
      <form method="post" action="/portal/meet/${meet.id}/builder/save">
        ${builderTopActions(meet, backHref, backLabel)}
      </form>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>Meet Builder</h2>
        <span class="pill">Locked UI Style</span>
      </div>
      ${builderTabs(meet, 'main')}
      <form method="post" action="/portal/meet/${meet.id}/builder/save" class="stack">
        <div class="grid grid-3">
          <div class="field">
            <label>Meet Name</label>
            <input name="meetName" value="${esc(meet.meetName || '')}" required />
          </div>
          <div class="field">
            <label>Meet Date</label>
            <input type="date" name="date" value="${esc(meet.date || '')}" />
          </div>
          <div class="field">
            <label>Start Time</label>
            <input type="time" name="startTime" value="${esc(meet.startTime || '')}" />
          </div>
        </div>

        <div class="grid grid-3">
          <div class="field">
            <label>Registration Close Date</label>
            <input type="date" name="registrationCloseDate" value="${esc(meet.registrationCloseDate || '')}" />
          </div>
          <div class="field">
            <label>Registration Close Time</label>
            <input type="time" name="registrationCloseTime" value="${esc(meet.registrationCloseTime || '')}" />
          </div>
          <div class="field">
            <label>Status</label>
            <select name="status">
              <option value="Draft" ${selected(meet.status, 'Draft')}>Draft</option>
              <option value="Published" ${selected(meet.status, 'Published')}>Published</option>
            </select>
          </div>
        </div>

        <div class="grid grid-3">
          <div class="field">
            <label>Age Rule</label>
            <select name="ageRule" onchange="document.getElementById('custom-age-wrap').style.display=this.value==='${esc(AGE_RULES.CUSTOM)}'?'block':'none'">
              ${ageRuleOptions}
            </select>
          </div>
          <div class="field" id="custom-age-wrap" style="${meet.ageRule === AGE_RULES.CUSTOM ? '' : 'display:none;'}">
            <label>Custom Age Cutoff Date</label>
            <input type="date" name="customAgeCutoffDate" value="${esc(meet.customAgeCutoffDate || '')}" />
          </div>
          <div class="field">
            <label>Rink</label>
            <select name="rinkId">${selectedRinkOptions(req.db, meet)}</select>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="field">
            <label>Track Length</label>
            <input name="trackLength" value="${esc(meet.trackLength || 100)}" />
          </div>
          <div class="field">
            <label>Lane Count</label>
            <input name="lanes" value="${esc(meet.lanes || 4)}" />
          </div>
        </div>

        <div class="grid grid-2">
          <div class="toggle-row">
            <div class="toggle-copy">
              <strong>Time Trials</strong>
              <span class="subtle">Use time-based placement and open time-trial group results.</span>
            </div>
            <label class="switch">
              <input type="checkbox" name="timeTrialsEnabled" ${checked(meet.timeTrialsEnabled)}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="toggle-copy">
              <strong>Open Enabled</strong>
              <span class="subtle">Use the separate Open Builder instead of mixing into inline divisions.</span>
            </div>
            <label class="switch">
              <input type="checkbox" name="openEnabled" ${checked(meet.openEnabled)}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="toggle-copy">
              <strong>Quad Enabled</strong>
              <span class="subtle">Keep quad fully separate from inline logic and standings.</span>
            </div>
            <label class="switch">
              <input type="checkbox" name="quadEnabled" ${checked(meet.quadEnabled)}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="toggle-copy">
              <strong>Relays Enabled</strong>
              <span class="subtle">Allow relay registrations for this meet.</span>
            </div>
            <label class="switch">
              <input type="checkbox" name="relaysEnabled" ${checked(meet.relaysEnabled)}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="toggle-copy">
              <strong>Allow Day-Of Registration</strong>
              <span class="subtle">Walk-ins can be added from the Registered screen after prereg closes.</span>
            </div>
            <label class="switch">
              <input type="checkbox" name="allowDayOfRegistration" ${checked(meet.allowDayOfRegistration)}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="toggle-copy">
              <strong>Judges Panel Required</strong>
              <span class="subtle">Keep scoring and race progression tools active.</span>
            </div>
            <label class="switch">
              <input type="checkbox" name="judgesPanelRequired" ${checked(meet.judgesPanelRequired)}>
              <span class="slider"></span>
            </label>
          </div>

          <div class="toggle-row">
            <div class="toggle-copy">
              <strong>Show on Find a Meet</strong>
              <span class="subtle">Publish the meet publicly.</span>
            </div>
            <label class="switch">
              <input type="checkbox" name="showOnFindAMeet" ${checked(meet.showOnFindAMeet)}>
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="field">
          <label>Meet Notes</label>
          <textarea name="meetNotes">${esc(meet.meetNotes || '')}</textarea>
        </div>

        <div class="divider"></div>
        <div class="section-title">
          <h3>Inline Standard Divisions</h3>
          <span class="pill">Open + Quad stay separate</span>
        </div>

        <div class="stack">
          ${(meet.groups || []).map((group, idx) => `
            <div class="card">
              <div class="section-title">
                <div>
                  <h3>${esc(group.label)}</h3>
                  <div class="subtle">${esc(group.ages)}</div>
                </div>
              </div>
              <div class="grid grid-2">
                ${STANDARD_DIVISION_KEYS.map(key => {
                  const div = group.divisions?.[key] || buildDivisionTemplate();
                  return `
                    <div class="card">
                      <div class="toggle-row">
                        <div class="toggle-copy">
                          <strong>${esc(raceDivisionPretty(key))}</strong>
                          <span class="subtle">Configure distances and cost for this standard inline division.</span>
                        </div>
                        <label class="switch">
                          <input type="checkbox" name="g_${idx}_${key}_enabled" ${checked(div.enabled)}>
                          <span class="slider"></span>
                        </label>
                      </div>
                      <div class="grid grid-2" style="margin-top:14px;">
                        <div class="field">
                          <label>Cost</label>
                          <input name="g_${idx}_${key}_cost" value="${esc(div.cost || 0)}" />
                        </div>
                      </div>
                      <div class="grid grid-2">
                        <div class="field"><label>Short</label><input name="g_${idx}_${key}_d1" value="${esc(div.distances?.[0] || '')}" /></div>
                        <div class="field"><label>Medium</label><input name="g_${idx}_${key}_d2" value="${esc(div.distances?.[1] || '')}" /></div>
                        <div class="field"><label>Long</label><input name="g_${idx}_${key}_d3" value="${esc(div.distances?.[2] || '')}" /></div>
                        <div class="field"><label>Extra</label><input name="g_${idx}_${key}_d4" value="${esc(div.distances?.[3] || '')}" /></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        ${builderTopActions(meet, backHref, backLabel)}
      </form>
    </div>
  `;

  res.send(shell('Meet Builder', body, req.user));
});

app.get('/portal/meet/:meetId/builder/open', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const backHref = getBackHrefForUser(req.user, meet);
  const backLabel = getBackLabelForUser(req.user);

  const body = `
    <div class="sticky-save">
      <form method="post" action="/portal/meet/${meet.id}/builder/open/save">
        ${builderTopActions(meet, backHref, backLabel)}
      </form>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>Open Builder</h2>
        <span class="pill">Separate from Inline</span>
      </div>
      ${builderTabs(meet, 'open')}
      <form method="post" action="/portal/meet/${meet.id}/builder/open/save" class="stack">
        ${(meet.openBuilder || []).map((group, idx) => `
          <div class="card">
            <div class="section-title">
              <div>
                <h3>${esc(group.label)}</h3>
                <div class="subtle">${esc(group.gender)} • ${group.minAge}-${group.maxAge}</div>
              </div>
            </div>
            <div class="toggle-row">
              <div class="toggle-copy">
                <strong>Enable ${esc(group.label)}</strong>
                <span class="subtle">Open races stay race-by-race and do not mix into inline standings.</span>
              </div>
              <label class="switch">
                <input type="checkbox" name="open_${idx}_enabled" ${checked(group.enabled)}>
                <span class="slider"></span>
              </label>
            </div>
            <div class="grid grid-2" style="margin-top:14px;">
              <div class="field"><label>Cost</label><input name="open_${idx}_cost" value="${esc(group.cost || 0)}" /></div>
            </div>
            <div class="grid grid-2">
              <div class="field"><label>Distance 1</label><input name="open_${idx}_d1" value="${esc(group.distances?.[0] || '')}" /></div>
              <div class="field"><label>Distance 2</label><input name="open_${idx}_d2" value="${esc(group.distances?.[1] || '')}" /></div>
              <div class="field"><label>Distance 3</label><input name="open_${idx}_d3" value="${esc(group.distances?.[2] || '')}" /></div>
              <div class="field"><label>Distance 4</label><input name="open_${idx}_d4" value="${esc(group.distances?.[3] || '')}" /></div>
            </div>
          </div>
        `).join('')}
        ${builderTopActions(meet, backHref, backLabel)}
      </form>
    </div>
  `;

  res.send(shell('Open Builder', body, req.user));
});

app.get('/portal/meet/:meetId/builder/quad', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const backHref = getBackHrefForUser(req.user, meet);
  const backLabel = getBackLabelForUser(req.user);

  const body = `
    <div class="sticky-save">
      <form method="post" action="/portal/meet/${meet.id}/builder/quad/save">
        ${builderTopActions(meet, backHref, backLabel)}
      </form>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>Quad Builder</h2>
        <span class="pill">Separate from Inline</span>
      </div>
      ${builderTabs(meet, 'quad')}
      <form method="post" action="/portal/meet/${meet.id}/builder/quad/save" class="stack">
        ${(meet.quadBuilder || []).map((group, idx) => `
          <div class="card">
            <div class="section-title">
              <div>
                <h3>${esc(group.label)}</h3>
                <div class="subtle">${esc(group.gender)} • ${group.minAge}-${group.maxAge}</div>
              </div>
            </div>
            <div class="toggle-row">
              <div class="toggle-copy">
                <strong>Enable ${esc(group.label)}</strong>
                <span class="subtle">Quad uses its own point system and standings bucket.</span>
              </div>
              <label class="switch">
                <input type="checkbox" name="quad_${idx}_enabled" ${checked(group.enabled)}>
                <span class="slider"></span>
              </label>
            </div>
            <div class="grid grid-2" style="margin-top:14px;">
              <div class="field"><label>Cost</label><input name="quad_${idx}_cost" value="${esc(group.cost || 0)}" /></div>
            </div>
            <div class="grid grid-2">
              <div class="field"><label>Distance 1</label><input name="quad_${idx}_d1" value="${esc(group.distances?.[0] || '')}" /></div>
              <div class="field"><label>Distance 2</label><input name="quad_${idx}_d2" value="${esc(group.distances?.[1] || '')}" /></div>
              <div class="field"><label>Distance 3</label><input name="quad_${idx}_d3" value="${esc(group.distances?.[2] || '')}" /></div>
              <div class="field"><label>Distance 4</label><input name="quad_${idx}_d4" value="${esc(group.distances?.[3] || '')}" /></div>
            </div>
          </div>
        `).join('')}
        ${builderTopActions(meet, backHref, backLabel)}
      </form>
    </div>
  `;

  res.send(shell('Quad Builder', body, req.user));
});app.get('/portal/meet/:meetId/blocks', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  ensureDefaultBlock(meet);
  rebuildRaceAssignments(meet);

  const backHref = getBackHrefForUser(req.user, meet);
  const backLabel = getBackLabelForUser(req.user);
  const unassigned = getUnassignedRaces(meet).sort((a, b) => (a.orderHint || 0) - (b.orderHint || 0));
  const scheduleItems = getOrderedScheduleItems(meet);

  const body = `
    <div class="sticky-save">
      <div class="actions">
        <a class="btn btn-primary" href="/portal/meet/${meet.id}/builder">Save Meet</a>
        <a class="btn btn-ghost" href="${backHref}">${esc(backLabel)}</a>
      </div>
    </div>

    <div class="card">
      <div class="section-title">
        <h2>Block Builder</h2>
        <span class="pill">Old Workflow Restored</span>
      </div>

      ${builderTabs(meet, 'blocks')}

      <div class="actions" style="margin-bottom:18px;">
        <form method="post" action="/portal/meet/${meet.id}/blocks/new">
          <button class="btn btn-primary" type="submit">+ Add Block</button>
        </form>
      </div>

      <div class="grid grid-2">
        <div class="stack">
          ${(meet.blocks || []).map(block => {
            const races = (block.raceIds || [])
              .map(id => (meet.races || []).find(r => r.id === id))
              .filter(Boolean)
              .sort((a, b) => (a.orderHint || 0) - (b.orderHint || 0));

            return `
              <div class="block-card">
                <div class="section-title">
                  <div>
                    <h4>${esc(block.name)}</h4>
                    <div class="subtle">${esc(block.day || 'Day 1')} • ${esc(block.type || 'race')}</div>
                  </div>
                  <form method="post" action="/portal/meet/${meet.id}/block/${block.id}/delete" onsubmit="return confirm('Delete this block and return races to Unassigned?');">
                    <button class="btn btn-danger" type="submit">Delete</button>
                  </form>
                </div>

                <form method="post" action="/portal/meet/${meet.id}/block/${block.id}/meta" class="stack">
                  <div class="grid grid-2">
                    <div class="field">
                      <label>Block Name</label>
                      <input name="name" value="${esc(block.name)}" />
                    </div>
                    <div class="field">
                      <label>Day</label>
                      <select name="day">
                        <option value="Day 1" ${selected(block.day, 'Day 1')}>Day 1</option>
                        <option value="Day 2" ${selected(block.day, 'Day 2')}>Day 2</option>
                        <option value="Day 3" ${selected(block.day, 'Day 3')}>Day 3</option>
                      </select>
                    </div>
                  </div>
                  <div class="field">
                    <label>Block Notes</label>
                    <input name="notes" value="${esc(block.notes || '')}" />
                  </div>
                  <button class="btn btn-ghost" type="submit">Save Block Info</button>
                </form>

                <div class="divider"></div>

                ${
                  races.length
                    ? races.map(race => `
                        <div class="race-card" style="margin-bottom:12px;">
                          <div class="section-title">
                            <div>
                              <h4>${esc(getRaceDisplayTitle(race))}</h4>
                              <div class="subtle">${esc(raceTypeLabel(race))}</div>
                            </div>
                            <form method="post" action="/portal/meet/${meet.id}/race/${race.id}/unassign">
                              <button class="btn btn-ghost" type="submit">Unassign</button>
                            </form>
                          </div>
                        </div>
                      `).join('')
                    : `<div class="empty">No races in this block yet.</div>`
                }
              </div>
            `;
          }).join('')}
        </div>

        <div class="stack">
          <div class="card">
            <div class="section-title">
              <h3>Unassigned Races</h3>
            </div>
            ${
              unassigned.length
                ? unassigned.map(race => `
                    <div class="race-card" style="margin-bottom:12px;">
                      <div class="section-title">
                        <div>
                          <h4>${esc(getRaceDisplayTitle(race))}</h4>
                          <div class="subtle">${esc(raceTypeLabel(race))}</div>
                        </div>
                      </div>
                      <form method="post" action="/portal/meet/${meet.id}/race/${race.id}/assign" class="inline">
                        <select name="blockId" style="max-width:220px;">
                          ${(meet.blocks || []).map(block => `<option value="${block.id}">${esc(block.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-primary" type="submit">Assign</button>
                      </form>
                    </div>
                  `).join('')
                : `<div class="empty">No unassigned races.</div>`
            }
          </div>

          <div class="card">
            <div class="section-title">
              <h3>Schedule Items</h3>
              <span class="pill">Not Blocks</span>
            </div>

            <form method="post" action="/portal/meet/${meet.id}/schedule/new" class="stack" style="margin-bottom:18px;">
              <div class="grid grid-2">
                <div class="field">
                  <label>Label</label>
                  <input name="label" placeholder="Lunch / Practice / Awards / Warm-Up" required />
                </div>
                <div class="field">
                  <label>Day</label>
                  <select name="day">
                    <option value="Day 1">Day 1</option>
                    <option value="Day 2">Day 2</option>
                    <option value="Day 3">Day 3</option>
                  </select>
                </div>
              </div>
              <div class="grid grid-2">
                <div class="field">
                  <label>Type</label>
                  <select name="type">
                    <option value="break">Break</option>
                    <option value="practice">Practice</option>
                    <option value="lunch">Lunch</option>
                    <option value="ceremony">Ceremony</option>
                    <option value="awards">Awards</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="field">
                  <label>Order Hint</label>
                  <input name="orderHint" value="${scheduleItems.length + 1}" />
                </div>
              </div>
              <div class="field">
                <label>Notes</label>
                <input name="notes" />
              </div>
              <button class="btn btn-primary" type="submit">Add Schedule Item</button>
            </form>

            ${
              scheduleItems.length
                ? scheduleItems.map(item => `
                    <div class="race-card" style="margin-bottom:12px;">
                      <div class="section-title">
                        <div>
                          <h4>${esc(item.label)}</h4>
                          <div class="subtle">${esc(item.day)} • ${esc(item.type)}</div>
                        </div>
                        <form method="post" action="/portal/meet/${meet.id}/schedule/${item.id}/delete" onsubmit="return confirm('Delete this schedule item?');">
                          <button class="btn btn-danger" type="submit">Delete</button>
                        </form>
                      </div>
                      <div class="subtle">${esc(item.notes || '')}</div>
                    </div>
                  `).join('')
                : `<div class="empty">No schedule items yet.</div>`
            }
          </div>
        </div>
      </div>
    </div>
  `;

  saveDb(req.db);
  res.send(shell('Block Builder', body, req.user));
});

app.post('/portal/meet/:meetId/blocks/new', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.blocks.push({
    id: `block_${crypto.randomBytes(4).toString('hex')}`,
    name: `Block ${(meet.blocks || []).length + 1}`,
    day: 'Day 1',
    type: 'race',
    notes: '',
    raceIds: [],
  });

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
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
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/block/:blockId/delete', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  deleteBlockAndReturnRaces(meet, req.params.blockId);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/race/:raceId/assign', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  assignRaceToBlock(meet, req.params.raceId, req.body.blockId);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/race/:raceId/unassign', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  unassignRaceFromBlock(meet, req.params.raceId);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/schedule/new', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.scheduleItems = meet.scheduleItems || [];
  meet.scheduleItems.push({
    id: `sched_${crypto.randomBytes(4).toString('hex')}`,
    label: String(req.body.label || 'Schedule Item').trim(),
    day: String(req.body.day || 'Day 1').trim(),
    type: String(req.body.type || 'break').trim(),
    notes: String(req.body.notes || '').trim(),
    orderHint: parseNumber(req.body.orderHint, (meet.scheduleItems || []).length + 1),
  });

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/schedule/:itemId/delete', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  meet.scheduleItems = (meet.scheduleItems || []).filter(item => item.id !== req.params.itemId);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
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
  meet.ageRule = String(req.body.ageRule || AGE_RULES.USARS);
  meet.customAgeCutoffDate = String(req.body.customAgeCutoffDate || '').trim();
  meet.rinkId = parseNumber(req.body.rinkId, 1);
  meet.trackLength = parseNumber(req.body.trackLength, 100);
  meet.lanes = parseNumber(req.body.lanes, 4);
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
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.post('/portal/meet/:meetId/builder/open/save', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  (meet.openBuilder || []).forEach((group, idx) => {
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
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder/open`);
});

app.post('/portal/meet/:meetId/builder/quad/save', requireRole(USER_ROLES.SUPER_ADMIN, USER_ROLES.MEET_DIRECTOR), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  (meet.quadBuilder || []).forEach((group, idx) => {
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
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder/quad`);
});

app.listen(PORT, () => {
  console.log(`SpeedSkateMeet running on ${HOST}:${PORT}`);
});