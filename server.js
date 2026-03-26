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

const DATA_VERSION = 15;
const SESSION_COOKIE = 'ssm_sess';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const ADMIN_USERNAME = 'Lbird22';
const ADMIN_PASSWORD = 'Redline22';

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
    meetNotes: '',
    ageRule: AGE_RULES.USARS,
    customAgeCutoffDate: '',
    groups: baseGroups(),
    registrations: [],
    races: [],
    blocks: [],
    currentRaceId: '',
    currentRaceIndex: -1,
    raceDayPaused: false,
    results: {
      timeTrialsByOpenGroup: [],
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
        roles: ['super_admin', 'meet_director', 'judge', 'coach'],
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

function migrateMeet(meet, fallbackOwnerId) {
  if (!meet.createdByUserId) meet.createdByUserId = fallbackOwnerId;
  if (!Array.isArray(meet.groups) || meet.groups.length === 0) meet.groups = baseGroups();
  if (!Array.isArray(meet.registrations)) meet.registrations = [];
  if (!Array.isArray(meet.races)) meet.races = [];
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (!meet.results || typeof meet.results !== 'object') meet.results = {};
  if (!Array.isArray(meet.results.timeTrialsByOpenGroup)) meet.results.timeTrialsByOpenGroup = [];

  meet.ageRule = meet.ageRule || AGE_RULES.USARS;
  meet.customAgeCutoffDate = meet.customAgeCutoffDate || '';
  meet.quadEnabled = !!meet.quadEnabled;
  meet.openEnabled = !!meet.openEnabled;
  meet.timeTrialsEnabled = !!meet.timeTrialsEnabled;
  meet.relaysEnabled = !!meet.relaysEnabled;
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

  meet.registrations = meet.registrations.map(reg => ({
    id: reg.id || crypto.randomBytes(6).toString('hex'),
    createdAt: reg.createdAt || nowIso(),
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

    if (hasRole(data.user, 'super_admin') || roles.some(role => hasRole(data.user, role))) {
      return next();
    }

    return res.status(403).send('Forbidden');
  };
}

function getMeetOr404(db, meetId) {
  return db.meets.find(m => Number(m.id) === Number(meetId));
}

function canEditMeet(user, meet) {
  return hasRole(user, 'super_admin') || Number(meet.createdByUserId) === Number(user.id);
}function formatDateForInput(value) {
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

function getMeetDistances(meet, groupId, divisionKey) {
  const cfg = getDivisionConfig(meet, groupId, divisionKey);
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

function buildRaceEntriesForRace(meet, race) {
  const regs = (meet.registrations || []).filter(reg => {
    if (race.type === 'time_trial') {
      return !!reg.options?.timeTrials && reg.divisionGroupId === race.groupId;
    }

    if (race.type === 'open_pack') {
      return !!reg.options?.open && reg.divisionGroupId === race.groupId;
    }

    if (race.type === 'quad') {
      return !!reg.options?.quad && reg.divisionGroupId === race.groupId;
    }

    return !!reg.options?.[race.divisionKey] && reg.divisionGroupId === race.groupId;
  });

  if (race.type === 'time_trial') {
    const ordered = [...regs].sort(compareBirthdateYoungestFirst);
    race.laneEntries = ordered.map((reg, idx) => ({
      lane: idx + 1,
      registrationId: reg.id,
      skaterName: reg.name,
      birthdate: reg.birthdate,
      team: reg.team,
      resultTime: '',
      place: '',
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
      skaterName: reg.name,
      birthdate: reg.birthdate,
      team: reg.team,
      place: '',
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
    skaterName: reg.name,
    birthdate: reg.birthdate,
    team: reg.team,
    resultTime: '',
    place: '',
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
    for (const divisionKey of ['novice', 'elite']) {
      const cfg = group.divisions?.[divisionKey];
      if (!cfg?.enabled) continue;

      const distances = getMeetDistances(meet, group.id, divisionKey);
      distances.forEach((distanceLabel, i) => {
        const key = `standard|${group.id}|${divisionKey}|${distanceLabel}|`;
        const existing = oldByKey.get(key);

        const race = existing ? { ...existing } : {
          id: `race_${crypto.randomBytes(5).toString('hex')}`,
          type: 'standard',
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

        race.groupId = group.id;
        race.groupLabel = group.label;
        race.divisionKey = divisionKey;
        race.distanceLabel = distanceLabel;
        race.orderHint = orderCounter++;
        buildRaceEntriesForRace(meet, race);
        newRaces.push(race);
      });
    }

    if (meet.quadEnabled && group.divisions?.quad?.enabled) {
      const distances = getMeetDistances(meet, group.id, 'quad');
      distances.forEach(distanceLabel => {
        const key = `quad|${group.id}|quad|${distanceLabel}|`;
        const existing = oldByKey.get(key);

        const race = existing ? { ...existing } : {
          id: `race_${crypto.randomBytes(5).toString('hex')}`,
          type: 'quad',
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

        race.groupId = group.id;
        race.groupLabel = group.label;
        race.divisionKey = 'quad';
        race.distanceLabel = distanceLabel;
        race.orderHint = orderCounter++;
        buildRaceEntriesForRace(meet, race);
        newRaces.push(race);
      });
    }

    if (meet.openEnabled && group.divisions?.open?.enabled) {
      const distances = getMeetDistances(meet, group.id, 'open');
      distances.forEach(distanceLabel => {
        const key = `open_pack|${group.id}|open|${distanceLabel}|`;
        const existing = oldByKey.get(key);

        const race = existing ? { ...existing } : {
          id: `race_${crypto.randomBytes(5).toString('hex')}`,
          type: 'open_pack',
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

        race.groupId = group.id;
        race.groupLabel = group.label;
        race.divisionKey = 'open';
        race.distanceLabel = distanceLabel;
        race.orderHint = orderCounter++;
        buildRaceEntriesForRace(meet, race);
        newRaces.push(race);
      });
    }
  }

  if (meet.timeTrialsEnabled) {
    const ttGroups = [...(meet.groups || [])].sort((a, b) => {
      if (a.minAge !== b.minAge) return a.minAge - b.minAge;
      return a.label.localeCompare(b.label);
    });

    ttGroups.forEach(group => {
      const key = `time_trial|${group.id}|time_trial||Time Trial`;
      const existing = oldByKey.get(key);

      const race = existing ? { ...existing } : {
        id: `race_${crypto.randomBytes(5).toString('hex')}`,
        type: 'time_trial',
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

      race.groupId = group.id;
      race.groupLabel = group.label;
      race.divisionKey = 'time_trial';
      race.label = 'Time Trial';
      race.distanceLabel = '';
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
      if (!block || !(block.raceIds || []).includes(race.id)) {
        race.blockId = '';
      }
    }
  }

  meet.races = newRaces;
  rebuildTimeTrialOpenResults(meet);
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
    if (oldBlock) {
      oldBlock.raceIds = (oldBlock.raceIds || []).filter(id => id !== race.id);
    }
  }

  race.blockId = block.id;
  if (!(block.raceIds || []).includes(race.id)) {
    block.raceIds.push(race.id);
  }

  return true;
}

function unassignRaceFromBlock(meet, raceId) {
  const race = (meet.races || []).find(r => r.id === raceId);
  if (!race) return false;

  if (race.blockId) {
    const block = (meet.blocks || []).find(b => b.id === race.blockId);
    if (block) {
      block.raceIds = (block.raceIds || []).filter(id => id !== race.id);
    }
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
    .sort((a, b) => a.label.localeCompare(b.label));

  meet.results.timeTrialsByOpenGroup = orderedGroups;
}

function selected(value, expected) {
  return String(value || '') === String(expected) ? 'selected' : '';
}

function checked(value) {
  return value ? 'checked' : '';
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
      --max: 1280px;
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: radial-gradient(circle at top, #10234a 0%, #07111f 40%, #050b16 100%); color: var(--text); }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }
    .wrap { width: min(var(--max), calc(100% - 28px)); margin: 0 auto; }

    .topbar {
      position: sticky; top: 0; z-index: 100;
      backdrop-filter: blur(18px);
      background: rgba(5,11,22,0.7);
      border-bottom: 1px solid var(--line);
    }

    .topbar-inner {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; min-height: 76px;
    }

    .brand {
      display: flex; align-items: center; gap: 14px; font-weight: 800; letter-spacing: 0.02em;
    }

    .brand img {
      width: 48px; height: 48px; object-fit: contain;
      filter: drop-shadow(0 10px 20px rgba(77,163,255,0.28));
    }

    .nav {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }

    .nav a, .btn, button {
      border: 0; cursor: pointer;
      padding: 12px 16px; border-radius: 999px;
      background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05));
      color: var(--text); font-weight: 700; box-shadow: var(--shadow);
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

    .page {
      padding: 28px 0 54px;
    }

    .hero {
      position: relative;
      min-height: 360px;
      border-radius: 32px;
      overflow: hidden;
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      background:
        linear-gradient(180deg, rgba(7,17,31,0.28), rgba(7,17,31,0.78)),
        url('/images/home/hero-banner.jpg') center/cover no-repeat,
        linear-gradient(135deg, #0f234d, #081426);
      display: grid;
      place-items: center;
      text-align: center;
      padding: 44px 26px;
      margin-bottom: 28px;
    }

    .hero h1 {
      font-size: clamp(2.2rem, 5vw, 4rem);
      margin: 0 0 12px;
      line-height: 1.02;
    }

    .hero p {
      max-width: 860px;
      margin: 0 auto;
      color: #d9e7ff;
      font-size: 1.08rem;
      line-height: 1.6;
    }

    .hero-actions {
      margin-top: 24px;
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .grid {
      display: grid;
      gap: 18px;
    }

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
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(5,11,22,0.08), rgba(5,11,22,0.82));
    }

    .feature-card .inner {
      position: relative; z-index: 2;
      width: 100%;
      padding: 22px;
      display: flex; flex-direction: column; gap: 10px;
    }

    .feature-card .icon-wrap {
      width: 72px; height: 72px;
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
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 999px;
      background: rgba(255,255,255,0.08);
      border: 1px solid var(--line);
      color: var(--text); font-size: 0.92rem; font-weight: 700;
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
      min-width: 900px;
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
      display: flex; flex-wrap: wrap; gap: 10px;
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

    .right { text-align: right; }
    .center { text-align: center; }

    @media (max-width: 980px) {
      .grid-4, .grid-3, .grid-2, .row-4, .row-3, .row-2 {
        grid-template-columns: 1fr;
      }

      .topbar-inner {
        flex-direction: column;
        align-items: stretch;
        padding: 14px 0;
      }

      .nav {
        justify-content: center;
      }

      .hero {
        min-height: 300px;
      }
    }

    @media print {
      .topbar, .hero-actions, .actions, .no-print { display: none !important; }
      body { background: white; color: black; }
      .card, .table-wrap, .feature-card, .stat {
        box-shadow: none !important;
        border: 1px solid #ddd !important;
        background: white !important;
        color: black !important;
      }
      th, td { color: black !important; }
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
}

function loginPage(error = '') {
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
            <img src="/images/home/icon-map-pin.png" alt="Find a Rink" onerror="this.style.display='none'">
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
        <a class="btn btn-primary" href="/portal/new-meet">+ New Meet</a>
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
}function meetDashboardPage(user, meet) {
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
        <p class="muted">Director, judges, announcer, and live views.</p>
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
}

function meetBuilderPage(user, meet) {
  const rinkOptions = (loadDb().rinks || []).map(rink =>
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
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

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
          <h2>Divisions</h2>
          <div class="muted">Configure which divisions run and what distances apply.</div>
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

          <div class="grid grid-4">
            ${['novice', 'elite', 'open', 'quad'].map(key => {
              const div = group.divisions?.[key] || buildDivisionTemplate();
              const title = raceDivisionPretty(key);
              const isVisible =
                key === 'novice' ||
                key === 'elite' ||
                (key === 'open' && meet.openEnabled) ||
                (key === 'quad' && meet.quadEnabled);

              if (!isVisible) return '';

              return `
                <div class="subtle">
                  <div class="actions" style="justify-content:space-between;">
                    <strong>${title}</strong>
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

function blockBuilderPage(user, meet) {
  ensureDefaultBlock(meet);

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

  return layout(`Block Builder — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Block Builder</h2>
        <div class="muted">Add TT, open, quad, and standard races into blocks.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
        <form class="inline" method="post" action="/portal/meet/${meet.id}/blocks/new">
          <button class="btn btn-primary" type="submit">+ Add Block</button>
        </form>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="grid">
        ${blocksHtml}
      </div>

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
    </div>
  `, { user });
}

function registeredPage(user, meet) {
  const rows = (meet.registrations || [])
    .sort((a, b) => (a.meetNumber || 0) - (b.meetNumber || 0))
    .map(reg => `
      <tr>
        <td>${reg.meetNumber || ''}</td>
        <td>${esc(reg.name)}</td>
        <td>${esc(formatDateHuman(reg.birthdate))}</td>
        <td>${esc(reg.calculatedAge ?? '')}</td>
        <td>${esc(reg.gender)}</td>
        <td>${esc(reg.team)}</td>
        <td>${esc(reg.divisionGroupLabel || '')}</td>
        <td>${esc(reg.ttOpenGroupLabel || '')}</td>
        <td>${[
          reg.options?.novice ? 'Novice' : '',
          reg.options?.elite ? 'Elite' : '',
          reg.options?.open ? 'Open' : '',
          reg.options?.quad ? 'Quad' : '',
          reg.options?.timeTrials ? 'TT' : '',
          reg.options?.relays ? 'Relays' : '',
        ].filter(Boolean).join(', ')}</td>
        <td>
          <div class="actions">
            <a class="btn btn-ghost" href="/portal/meet/${meet.id}/registered/${reg.id}/edit">Edit</a>
            <form class="inline" method="post" action="/portal/meet/${meet.id}/registered/${reg.id}/delete" onsubmit="return confirm('Delete this racer?');">
              <button class="btn btn-danger" type="submit">Delete</button>
            </form>
          </div>
        </td>
      </tr>
    `).join('');

  return layout(`Registered — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Registered</h2>
        <div class="muted">Edit, manage, and print your registrations.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
        <a class="btn btn-ghost" href="/meet/${meet.id}/register" target="_blank">Open Public Registration</a>
        <a class="btn btn-primary" href="/portal/meet/${meet.id}/print/race-list" target="_blank">Print Race List</a>
      </div>
    </div>

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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="10" class="center muted">No registrations yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `, { user });
}

function registrationEditPage(user, meet, reg) {
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

        <div class="divider"></div>

        <div class="actions">
          <label class="pill"><input type="checkbox" name="novice" ${checked(reg.options?.novice)}> Novice</label>
          <label class="pill"><input type="checkbox" name="elite" ${checked(reg.options?.elite)}> Elite</label>
          <label class="pill"><input type="checkbox" name="open" ${checked(reg.options?.open)}> Open</label>
          <label class="pill"><input type="checkbox" name="quad" ${checked(reg.options?.quad)}> Quad</label>
          <label class="pill"><input type="checkbox" name="timeTrials" ${checked(reg.options?.timeTrials)}> Time Trials</label>
          <label class="pill"><input type="checkbox" name="relays" ${checked(reg.options?.relays)}> Relays</label>
        </div>

        <div class="divider"></div>

        <div class="subtle">
          <div><strong>Current Calculated Age:</strong> ${esc(reg.calculatedAge ?? '—')}</div>
          <div><strong>Current Division:</strong> ${esc(reg.divisionGroupLabel || '—')}</div>
          <div><strong>Current TT Open Group:</strong> ${esc(reg.ttOpenGroupLabel || '—')}</div>
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
        return (a.meetNumber || 0) - (b.meetNumber || 0);
      }
      return a.checkIn?.checkedIn ? 1 : -1;
    })
    .map(reg => `
      <tr>
        <td>${reg.meetNumber || ''}</td>
        <td>${esc(reg.name)}</td>
        <td>${esc(reg.team)}</td>
        <td>${esc(reg.divisionGroupLabel || '')}</td>
        <td>${reg.checkIn?.checkedIn ? `<span class="pill ok">Checked In</span>` : `<span class="pill warn">Waiting</span>`}</td>
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
}function getCurrentRaceBundle(meet) {
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

function raceDayTabs(meet, currentTab) {
  const items = [
    { key: 'director', label: 'Director', href: `/portal/meet/${meet.id}/race-day/director` },
    { key: 'judges', label: 'Judges', href: `/portal/meet/${meet.id}/race-day/judges` },
    { key: 'announcer', label: 'Announcer', href: `/portal/meet/${meet.id}/race-day/announcer` },
    { key: 'live', label: 'Live', href: `/portal/meet/${meet.id}/race-day/live` },
  ];

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

function raceDayDirectorPage(user, meet) {
  const bundle = getCurrentRaceBundle(meet);
  const current = bundle.current;
  const next = bundle.next;

  const currentBlock = current?.blockId
    ? (meet.blocks || []).find(b => b.id === current.blockId)
    : null;

  return layout(`Race Day Director — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Race Day</h2>
        <div class="muted">Director view for live meet control.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${raceDayTabs(meet, 'director')}

    <div class="grid grid-3">
      <div class="card card-pad">
        <div class="mini">Current Race</div>
        <h3 style="margin:8px 0 6px;">${current ? esc(getRaceDisplayTitle(current)) : 'No race selected'}</h3>
        <div class="muted">${currentBlock ? `Block: ${esc(currentBlock.name)}` : 'Unassigned'}</div>
      </div>

      <div class="card card-pad">
        <div class="mini">On Deck</div>
        <h3 style="margin:8px 0 6px;">${next ? esc(getRaceDisplayTitle(next)) : '—'}</h3>
        <div class="muted">${next ? esc(raceTypeLabel(next)) : 'No next race yet'}</div>
      </div>

      <div class="card card-pad">
        <div class="mini">Progress</div>
        <h3 style="margin:8px 0 6px;">${bundle.current ? `${bundle.idx + 1} / ${bundle.ordered.length}` : `0 / ${bundle.ordered.length}`}</h3>
        <div class="muted">${meet.raceDayPaused ? 'Meet paused' : 'Meet running'}</div>
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
        ${current ? `
          <form class="inline" method="post" action="/portal/meet/${meet.id}/race-day/${current.id}/unlock">
            <button class="btn btn-ghost" type="submit">Unlock Race</button>
          </form>
        ` : ''}
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <h3 style="margin-top:0;">Set Current Race</h3>
      <form class="stack" method="post" action="/portal/meet/${meet.id}/race-day/set-current">
        <div>
          <label>Race</label>
          <select name="raceId">
            ${bundle.ordered.map(r => `
              <option value="${r.id}" ${selected(meet.currentRaceId, r.id)}>
                ${esc(getRaceDisplayTitle(r))}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit">Set Current Race</button>
        </div>
      </form>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <h3 style="margin-top:0;">Upcoming</h3>
      <div class="grid">
        ${bundle.upcoming.length === 0 ? `<div class="muted">No upcoming races queued.</div>` : bundle.upcoming.map(r => `
          <div class="subtle">
            <strong>${esc(getRaceDisplayTitle(r))}</strong>
            <div class="mini">${esc(raceTypeLabel(r))}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `, { user });
}

function raceDayJudgesPage(user, meet) {
  const bundle = getCurrentRaceBundle(meet);
  const current = bundle.current;

  if (!current) {
    return layout(`Judges — ${meet.meetName}`, `
      <div class="section-title">
        <div>
          <h2>Judges Panel</h2>
          <div class="muted">No current race selected yet.</div>
        </div>
        <div class="actions">
          <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
        </div>
      </div>
      ${raceDayTabs(meet, 'judges')}
      <div class="card card-pad">
        <p class="muted">Set a current race from Director view first.</p>
      </div>
    `, { user });
  }

  const laneRows = (current.laneEntries || []).length ? current.laneEntries : [];
  const packRows = (current.packEntries || []).length ? current.packEntries : [];

  const isTimeTrial = current.type === 'time_trial';
  const isOpenPack = current.type === 'open_pack';

  return layout(`Judges — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Judges Panel</h2>
        <div class="muted">${esc(getRaceDisplayTitle(current))}</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${raceDayTabs(meet, 'judges')}

    <form class="stack" method="post" action="/portal/meet/${meet.id}/race-day/${current.id}/judges-save">
      <div class="card card-pad">
        <div class="mini">Race Type</div>
        <h3 style="margin:8px 0 6px;">${esc(raceTypeLabel(current))}</h3>
        <div class="muted">${isTimeTrial ? 'Enter times.' : isOpenPack ? 'Enter pack placements.' : 'Enter places or times if needed.'}</div>
      </div>

      ${isOpenPack ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Skater</th>
                <th>Team</th>
                <th>Place</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${packRows.map((row, i) => `
                <tr>
                  <td>${i + 1}<input type="hidden" name="entry_id_${i}" value="${esc(row.registrationId)}"></td>
                  <td>${esc(row.skaterName)}</td>
                  <td>${esc(row.team || '')}</td>
                  <td><input name="place_${i}" value="${esc(row.place || '')}" /></td>
                  <td>
                    <select name="status_${i}">
                      <option value="" ${selected(row.status, '')}>—</option>
                      <option value="OK" ${selected(row.status, 'OK')}>OK</option>
                      <option value="DQ" ${selected(row.status, 'DQ')}>DQ</option>
                      <option value="DNS" ${selected(row.status, 'DNS')}>DNS</option>
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lane</th>
                <th>Skater</th>
                <th>Team</th>
                ${isTimeTrial ? '<th>Time</th>' : '<th>Place</th>'}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${laneRows.map((row, i) => `
                <tr>
                  <td>${row.lane}<input type="hidden" name="entry_id_${i}" value="${esc(row.registrationId)}"></td>
                  <td>${esc(row.skaterName)}</td>
                  <td>${esc(row.team || '')}</td>
                  ${
                    isTimeTrial
                      ? `<td><input name="time_${i}" value="${esc(row.resultTime || '')}" placeholder="18.42" /></td>`
                      : `<td><input name="place_${i}" value="${esc(row.place || '')}" /></td>`
                  }
                  <td>
                    <select name="status_${i}">
                      <option value="" ${selected(row.status, '')}>—</option>
                      <option value="OK" ${selected(row.status, 'OK')}>OK</option>
                      <option value="DQ" ${selected(row.status, 'DQ')}>DQ</option>
                      <option value="DNS" ${selected(row.status, 'DNS')}>DNS</option>
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}

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
  const current = bundle.current;

  return layout(`Announcer — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Announcer View</h2>
        <div class="muted">Big clean current race view.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${raceDayTabs(meet, 'announcer')}

    <div class="hero" style="min-height:320px;">
      <div>
        <div class="pill">${current ? esc(raceTypeLabel(current)) : 'No race selected'}</div>
        <h1 style="margin-top:14px;">${current ? esc(getRaceDisplayTitle(current)) : 'Waiting for Race Selection'}</h1>
        <p>
          ${current ? `Now racing ${esc(current.groupLabel)}.` : 'Set the current race from Director view.'}
        </p>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card card-pad">
        <h3 style="margin-top:0;">Current Entries</h3>
        ${
          !current ? `<div class="muted">No current race.</div>` :
          current.type === 'open_pack'
            ? `
              <div class="grid">
                ${(current.packEntries || []).map((row, idx) => `
                  <div class="subtle">${idx + 1}. <strong>${esc(row.skaterName)}</strong> <span class="mini">— ${esc(row.team || '')}</span></div>
                `).join('') || '<div class="muted">No open racers yet.</div>'}
              </div>
            `
            : `
              <div class="grid">
                ${(current.laneEntries || []).map(row => `
                  <div class="subtle">Lane ${row.lane}: <strong>${esc(row.skaterName)}</strong> <span class="mini">— ${esc(row.team || '')}</span></div>
                `).join('') || '<div class="muted">No racers in this race yet.</div>'}
              </div>
            `
        }
      </div>

      <div class="card card-pad">
        <h3 style="margin-top:0;">On Deck</h3>
        ${
          bundle.next
            ? `<div class="subtle"><strong>${esc(getRaceDisplayTitle(bundle.next))}</strong><div class="mini">${esc(raceTypeLabel(bundle.next))}</div></div>`
            : `<div class="muted">Nothing on deck yet.</div>`
        }
      </div>
    </div>
  `, { user });
}

function raceDayLivePage(user, meet) {
  const bundle = getCurrentRaceBundle(meet);
  const current = bundle.current;

  return layout(`Race Day Live — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>Race Day Live</h2>
        <div class="muted">Internal live control view.</div>
      </div>
      <div class="actions">
        <a class="btn btn-ghost" href="/portal/meet/${meet.id}">← Meet Dashboard</a>
      </div>
    </div>

    ${raceDayTabs(meet, 'live')}

    <div class="grid grid-3">
      <div class="stat">
        <div class="k">Current</div>
        <div class="v" style="font-size:1.3rem;">${current ? esc(getRaceDisplayTitle(current)) : '—'}</div>
      </div>
      <div class="stat">
        <div class="k">On Deck</div>
        <div class="v" style="font-size:1.3rem;">${bundle.next ? esc(getRaceDisplayTitle(bundle.next)) : '—'}</div>
      </div>
      <div class="stat">
        <div class="k">Status</div>
        <div class="v" style="font-size:1.3rem;">${meet.raceDayPaused ? 'Paused' : 'Running'}</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <h3 style="margin-top:0;">Upcoming</h3>
      <div class="grid">
        ${bundle.upcoming.map(r => `
          <div class="subtle">
            <strong>${esc(getRaceDisplayTitle(r))}</strong>
            <div class="mini">${esc(raceTypeLabel(r))}</div>
          </div>
        `).join('') || '<div class="muted">No upcoming races.</div>'}
      </div>
    </div>
  `, { user });
}

function publicRegistrationPage(meet) {
  const closed = (() => {
    if (!meet.registrationCloseDate) return false;
    const dt = new Date(`${meet.registrationCloseDate}T${meet.registrationCloseTime || '23:59'}:00`);
    return Date.now() > dt.getTime();
  })();

  return layout(`Register — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>${esc(meet.meetName)}</h2>
        <div class="muted">Public Registration</div>
      </div>
    </div>

    <div class="card card-pad">
      <div class="mini">Meet Date</div>
      <div style="font-weight:800; margin-top:6px;">${meet.date ? esc(formatDateHuman(meet.date)) : 'TBD'}</div>
      <div class="mini" style="margin-top:10px;">Age Rule: ${esc(meet.ageRule || AGE_RULES.USARS)}</div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      ${closed ? `
        <div class="pill bad">Registration is closed.</div>
      ` : `
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
            <input list="teamListPublic" name="team" value="Midwest Racing" />
            <datalist id="teamListPublic">
              ${TEAM_LIST.map(team => `<option value="${esc(team)}">`).join('')}
            </datalist>
          </div>

          <div class="actions">
            <label class="pill"><input type="checkbox" name="novice"> Novice</label>
            <label class="pill"><input type="checkbox" name="elite"> Elite</label>
            ${meet.openEnabled ? `<label class="pill"><input type="checkbox" name="open"> Open</label>` : ''}
            ${meet.quadEnabled ? `<label class="pill"><input type="checkbox" name="quad"> Quad</label>` : ''}
            ${meet.timeTrialsEnabled ? `<label class="pill"><input type="checkbox" name="timeTrials"> Time Trials</label>` : ''}
            ${meet.relaysEnabled ? `<label class="pill"><input type="checkbox" name="relays"> Relays</label>` : ''}
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="submit">Submit Registration</button>
          </div>
        </form>
      `}
    </div>
  `, { hideNav: false });
}

function publicLivePage(meet) {
  const bundle = getCurrentRaceBundle(meet);
  const current = bundle.current;

  return layout(`Live — ${meet.meetName}`, `
    <div class="hero" style="min-height:280px;">
      <div>
        <div class="pill">Live Race Day</div>
        <h1 style="margin-top:14px;">${esc(meet.meetName)}</h1>
        <p>${current ? `Now Racing: ${esc(getRaceDisplayTitle(current))}` : 'Waiting for the first race.'}</p>
      </div>
    </div>

    <div class="grid grid-3">
      <div class="stat">
        <div class="k">Current Race</div>
        <div class="v" style="font-size:1.3rem;">${current ? esc(getRaceDisplayTitle(current)) : '—'}</div>
      </div>
      <div class="stat">
        <div class="k">On Deck</div>
        <div class="v" style="font-size:1.3rem;">${bundle.next ? esc(getRaceDisplayTitle(bundle.next)) : '—'}</div>
      </div>
      <div class="stat">
        <div class="k">Progress</div>
        <div class="v" style="font-size:1.3rem;">${bundle.current ? `${bundle.idx + 1}/${bundle.ordered.length}` : `0/${bundle.ordered.length}`}</div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <h3 style="margin-top:0;">Current Entries</h3>
      ${
        !current ? `<div class="muted">No current race yet.</div>` :
        current.type === 'open_pack'
          ? `
            <div class="grid">
              ${(current.packEntries || []).map((row, idx) => `
                <div class="subtle">${idx + 1}. <strong>${esc(row.skaterName)}</strong> <span class="mini">— ${esc(row.team || '')}</span></div>
              `).join('') || '<div class="muted">No pack entries.</div>'}
            </div>
          `
          : `
            <div class="grid">
              ${(current.laneEntries || []).map(row => `
                <div class="subtle">Lane ${row.lane}: <strong>${esc(row.skaterName)}</strong> <span class="mini">— ${esc(row.team || '')}</span></div>
              `).join('') || '<div class="muted">No lane entries.</div>'}
            </div>
          `
      }
    </div>
  `, { hideNav: false });
}

function publicResultsPage(meet) {
  const ttGroups = meet.results?.timeTrialsByOpenGroup || [];

  return layout(`Results — ${meet.meetName}`, `
    <div class="section-title">
      <div>
        <h2>${esc(meet.meetName)} Results</h2>
        <div class="muted">Live public results and time trial standings.</div>
      </div>
    </div>

    <div class="card card-pad">
      <h3 style="margin-top:0;">Time Trial Results by Open Group</h3>
      ${
        ttGroups.length === 0
          ? `<div class="muted">No time trial results posted yet.</div>`
          : ttGroups.map(group => `
              <div class="card card-pad" style="margin-top:14px;">
                <h3 style="margin-top:0;">${esc(group.label)}</h3>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Place</th>
                        <th>Skater</th>
                        <th>Team</th>
                        <th>Age</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${group.rows.map(row => `
                        <tr>
                          <td>${row.place}</td>
                          <td>${esc(row.skaterName)}</td>
                          <td>${esc(row.team || '')}</td>
                          <td>${esc(row.age ?? '')}</td>
                          <td>${esc(row.resultTime || '')}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `).join('')
      }
    </div>
  `, { hideNav: false });
}/* ----------------------------- Public Routes ----------------------------- */

app.get('/', (req, res) => {
  const session = getSessionUser(req);
  res.send(homePage(session?.user || null));
});

app.get('/find-a-meet', (req, res) => {
  const db = loadDb();
  const user = getSessionUser(req)?.user || null;

  const meets = (db.meets || [])
    .filter(meet => meet.showOnFindAMeet)
    .sort((a, b) => {
      const aTime = a.date ? new Date(`${a.date}T12:00:00`).getTime() : 0;
      const bTime = b.date ? new Date(`${b.date}T12:00:00`).getTime() : 0;
      return aTime - bTime;
    });

  res.send(layout('Find a Meet', `
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
  `, { user }));
});

app.get('/meet/:meetId/register', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.status(404).send('Meet not found');
  res.send(publicRegistrationPage(meet));
});

app.post('/meet/:meetId/register', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.status(404).send('Meet not found');

  const registration = {
    id: crypto.randomBytes(8).toString('hex'),
    createdAt: nowIso(),
    name: String(req.body.name || '').trim(),
    birthdate: String(req.body.birthdate || '').trim(),
    gender: normalizeGender(req.body.gender),
    team: String(req.body.team || 'Independent').trim() || 'Independent',
    calculatedAge: null,
    divisionGroupId: '',
    divisionGroupLabel: '',
    ttOpenGroupId: '',
    ttOpenGroupLabel: '',
    meetNumber: nextId(meet.registrations),
    options: {
      novice: !!req.body.novice,
      elite: !!req.body.elite,
      open: !!req.body.open,
      quad: !!req.body.quad,
      timeTrials: !!req.body.timeTrials,
      relays: !!req.body.relays,
    },
    checkIn: {
      checkedIn: false,
      checkedInAt: '',
    },
  };

  refreshRegistrationDerivedFields(meet, registration);
  meet.registrations.push(registration);

  regenerateRaces(meet);
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  saveDb(db);

  res.redirect(`/meet/${meet.id}/register?ok=1`);
});

app.get('/live/:meetId', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.status(404).send('Meet not found');
  res.send(publicLivePage(meet));
});

app.get('/results/:meetId', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.status(404).send('Meet not found');
  res.send(publicResultsPage(meet));
});

/* ------------------------------ Auth Routes ------------------------------ */

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
  res.redirect('/portal');
});

app.get('/admin/logout', (req, res) => {
  const db = loadDb();
  const token = parseCookies(req)[SESSION_COOKIE];
  db.sessions = (db.sessions || []).filter(s => s.token !== token);
  saveDb(db);
  clearCookie(res, SESSION_COOKIE);
  res.redirect('/');
});

/* ----------------------------- Portal Routes ----------------------------- */

app.get('/portal', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  res.send(portalPage(req.user, req.db));
});

app.get('/portal/new-meet', requireRole('meet_director'), (req, res) => {
  const meet = defaultMeet(req.user.id);
  meet.id = nextId(req.db.meets);
  req.db.meets.push(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.get('/portal/meet/:meetId', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet) && !hasRole(req.user, 'judge') && !hasRole(req.user, 'coach')) {
    return res.status(403).send('Forbidden');
  }
  res.send(meetDashboardPage(req.user, meet));
});

app.post('/portal/meet/:meetId/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  req.db.meets = (req.db.meets || []).filter(m => Number(m.id) !== Number(meet.id));
  saveDb(req.db);
  res.redirect('/portal');
});

app.post('/portal/meet/:meetId/publish-toggle', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.showOnFindAMeet = !meet.showOnFindAMeet;
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}`);
});

/* --------------------------- Meet Builder Routes -------------------------- */

app.get('/portal/meet/:meetId/builder', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  res.send(meetBuilderPage(req.user, meet));
});

app.post('/portal/meet/:meetId/builder/save', requireRole('meet_director'), (req, res) => {
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
  meet.rinkId = parseNumber(req.body.rinkId, 1);

  meet.timeTrialsEnabled = !!req.body.timeTrialsEnabled;
  meet.openEnabled = !!req.body.openEnabled;
  meet.quadEnabled = !!req.body.quadEnabled;
  meet.relaysEnabled = !!req.body.relaysEnabled;
  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;
  meet.showOnFindAMeet = !!req.body.showOnFindAMeet;

  (meet.groups || []).forEach((group, idx) => {
    ['novice', 'elite', 'open', 'quad'].forEach(key => {
      const existing = group.divisions?.[key] || buildDivisionTemplate();
      existing.enabled = !!req.body[`g_${idx}_${key}_enabled`];
      existing.cost = parseNumber(req.body[`g_${idx}_${key}_cost`], 0);
      existing.distances = [
        String(req.body[`g_${idx}_${key}_d1`] || '').trim(),
        String(req.body[`g_${idx}_${key}_d2`] || '').trim(),
        String(req.body[`g_${idx}_${key}_d3`] || '').trim(),
        String(req.body[`g_${idx}_${key}_d4`] || '').trim(),
      ];
      group.divisions[key] = existing;
    });
  });

  rebuildAllRegistrationDerivedFields(meet);
  regenerateRaces(meet);
  ensureDefaultBlock(meet);
  ensureCurrentRace(meet);

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}`);
});

/* --------------------------- Block Builder Routes ------------------------- */

app.get('/portal/meet/:meetId/blocks', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  ensureDefaultBlock(meet);
  saveDb(req.db);
  res.send(blockBuilderPage(req.user, meet));
});

app.post('/portal/meet/:meetId/blocks/new', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.blocks.push({
    id: `block_${crypto.randomBytes(4).toString('hex')}`,
    name: `Block ${meet.blocks.length + 1}`,
    day: 'Day 1',
    notes: '',
    raceIds: [],
  });

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/block/:blockId/meta', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const block = (meet.blocks || []).find(b => b.id === req.params.blockId);
  if (!block) return res.redirect(`/portal/meet/${meet.id}/blocks`);

  block.name = String(req.body.name || '').trim() || block.name;
  block.day = String(req.body.day || '').trim() || block.day;
  block.notes = String(req.body.notes || '').trim();

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/block/:blockId/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  deleteBlockAndReturnRaces(meet, req.params.blockId);
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/race/:raceId/assign', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  assignRaceToBlock(meet, req.params.raceId, String(req.body.blockId || ''));
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/race/:raceId/unassign', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  unassignRaceFromBlock(meet, req.params.raceId);
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

/* --------------------------- Registered / Check In ------------------------ */

app.get('/portal/meet/:meetId/registered', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  res.send(registeredPage(req.user, meet));
});

app.get('/portal/meet/:meetId/registered/:regId/edit', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => String(r.id) === String(req.params.regId));
  if (!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);

  res.send(registrationEditPage(req.user, meet, reg));
});

app.post('/portal/meet/:meetId/registered/:regId/edit', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => String(r.id) === String(req.params.regId));
  if (!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);

  reg.name = String(req.body.name || '').trim();
  reg.birthdate = String(req.body.birthdate || '').trim();
  reg.gender = normalizeGender(req.body.gender);
  reg.team = String(req.body.team || 'Independent').trim() || 'Independent';
  reg.meetNumber = parseNumber(req.body.meetNumber, reg.meetNumber || 0);

  reg.options = {
    novice: !!req.body.novice,
    elite: !!req.body.elite,
    open: !!req.body.open,
    quad: !!req.body.quad,
    timeTrials: !!req.body.timeTrials,
    relays: !!req.body.relays,
  };

  refreshRegistrationDerivedFields(meet, reg);
  regenerateRaces(meet);
  ensureCurrentRace(meet);

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.post('/portal/meet/:meetId/registered/:regId/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.registrations = (meet.registrations || []).filter(r => String(r.id) !== String(req.params.regId));
  regenerateRaces(meet);
  ensureCurrentRace(meet);

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.get('/portal/meet/:meetId/check-in', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  res.send(checkInPage(req.user, meet));
});

app.post('/portal/meet/:meetId/check-in/:regId/toggle', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => String(r.id) === String(req.params.regId));
  if (!reg) return res.redirect(`/portal/meet/${meet.id}/check-in`);

  reg.checkIn = reg.checkIn || { checkedIn: false, checkedInAt: '' };
  reg.checkIn.checkedIn = !reg.checkIn.checkedIn;
  reg.checkIn.checkedInAt = reg.checkIn.checkedIn ? nowIso() : '';

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/check-in`);
});/* ----------------------------- Race Day Routes ---------------------------- */

app.get('/portal/meet/:meetId/race-day/director', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  ensureCurrentRace(meet);
  saveDb(req.db);
  res.send(raceDayDirectorPage(req.user, meet));
});

app.get('/portal/meet/:meetId/race-day/judges', requireRole('meet_director', 'judge'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  ensureCurrentRace(meet);
  saveDb(req.db);
  res.send(raceDayJudgesPage(req.user, meet));
});

app.get('/portal/meet/:meetId/race-day/announcer', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  ensureCurrentRace(meet);
  saveDb(req.db);
  res.send(raceDayAnnouncerPage(req.user, meet));
});

app.get('/portal/meet/:meetId/race-day/live', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  ensureCurrentRace(meet);
  saveDb(req.db);
  res.send(raceDayLivePage(req.user, meet));
});

app.post('/portal/meet/:meetId/race-day/set-current', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const race = (meet.races || []).find(r => r.id === String(req.body.raceId || ''));
  if (race) {
    meet.currentRaceId = race.id;
    meet.currentRaceIndex = getOrderedRaceDayRaces(meet).findIndex(r => r.id === race.id);
    meet.updatedAt = nowIso();
    saveDb(req.db);
  }

  res.redirect(`/portal/meet/${meet.id}/race-day/director`);
});

app.post('/portal/meet/:meetId/race-day/next', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const ordered = getOrderedRaceDayRaces(meet);
  const currentIdx = ordered.findIndex(r => r.id === meet.currentRaceId);
  const nextIdx = Math.min(currentIdx + 1, ordered.length - 1);

  if (ordered[nextIdx]) {
    meet.currentRaceId = ordered[nextIdx].id;
    meet.currentRaceIndex = nextIdx;
  }

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/race-day/director`);
});

app.post('/portal/meet/:meetId/race-day/previous', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const ordered = getOrderedRaceDayRaces(meet);
  const currentIdx = ordered.findIndex(r => r.id === meet.currentRaceId);
  const prevIdx = Math.max(currentIdx - 1, 0);

  if (ordered[prevIdx]) {
    meet.currentRaceId = ordered[prevIdx].id;
    meet.currentRaceIndex = prevIdx;
  }

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/race-day/director`);
});

app.post('/portal/meet/:meetId/race-day/pause-toggle', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.raceDayPaused = !meet.raceDayPaused;
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/race-day/director`);
});

app.post('/portal/meet/:meetId/race-day/:raceId/unlock', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const race = (meet.races || []).find(r => r.id === req.params.raceId);
  if (race) {
    race.status = 'open';
    race.closedAt = '';
    meet.currentRaceId = race.id;
    meet.currentRaceIndex = getOrderedRaceDayRaces(meet).findIndex(r => r.id === race.id);
    meet.updatedAt = nowIso();
    saveDb(req.db);
  }

  res.redirect(`/portal/meet/${meet.id}/race-day/director`);
});

app.post('/portal/meet/:meetId/race-day/:raceId/judges-save', requireRole('meet_director', 'judge'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const race = (meet.races || []).find(r => r.id === req.params.raceId);
  if (!race) return res.redirect(`/portal/meet/${meet.id}/race-day/judges`);

  race.notes = String(req.body.notes || '').trim();

  if (race.type === 'open_pack') {
    race.packEntries = (race.packEntries || []).map((entry, i) => ({
      ...entry,
      place: String(req.body[`place_${i}`] || '').trim(),
      status: String(req.body[`status_${i}`] || '').trim(),
    }));
  } else if (race.type === 'time_trial') {
    race.laneEntries = (race.laneEntries || []).map((entry, i) => ({
      ...entry,
      resultTime: String(req.body[`time_${i}`] || '').trim(),
      status: String(req.body[`status_${i}`] || '').trim(),
    }));
    rebuildTimeTrialOpenResults(meet);
  } else {
    race.laneEntries = (race.laneEntries || []).map((entry, i) => ({
      ...entry,
      place: String(req.body[`place_${i}`] || '').trim(),
      status: String(req.body[`status_${i}`] || '').trim(),
    }));
  }

  if (String(req.body.action || '') === 'close') {
    race.status = 'closed';
    race.closedAt = nowIso();

    const ordered = getOrderedRaceDayRaces(meet);
    const idx = ordered.findIndex(r => r.id === race.id);
    const nextRace = ordered[idx + 1];
    if (nextRace) {
      meet.currentRaceId = nextRace.id;
      meet.currentRaceIndex = idx + 1;
    }
  } else {
    race.status = 'open';
  }

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
});

/* ------------------------------- Print Route ----------------------------- */

app.get('/portal/meet/:meetId/print/race-list', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const ordered = getOrderedRaceDayRaces(meet);

  const rows = ordered.map((race, idx) => {
    const block = race.blockId ? (meet.blocks || []).find(b => b.id === race.blockId) : null;
    const racerCount = race.type === 'open_pack'
      ? (race.packEntries?.length || 0)
      : (race.laneEntries?.length || 0);

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${esc(getRaceDisplayTitle(race))}</td>
        <td>${esc(raceTypeLabel(race))}</td>
        <td>${esc(block?.name || 'Unassigned')}</td>
        <td>${esc(block?.day || '—')}</td>
        <td>${racerCount}</td>
      </tr>
    `;
  }).join('');

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(meet.meetName)} — Race List</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
    h1 { margin: 0 0 6px; }
    .meta { color: #555; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #ddd; text-align: left; font-size: 13px; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${esc(meet.meetName)}</h1>
  <div class="meta">
    ${meet.date ? esc(formatDateHuman(meet.date)) : 'No date set'} ·
    ${esc(meet.startTime || 'No start time')}
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Race</th>
        <th>Type</th>
        <th>Block</th>
        <th>Day</th>
        <th>Racers</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="6">No races yet.</td></tr>`}
    </tbody>
  </table>

  <script>window.onload = () => window.print();</script>
</body>
</html>`);
});

/* ---------------------------- Fallback / Server -------------------------- */

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