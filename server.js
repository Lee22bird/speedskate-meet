const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = process.env.SSM_DATA_FILE || path.join(DATA_DIR, 'ssm_db.json');

const SESSION_COOKIE = 'ssm_sess';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const ADMIN_USERNAME = 'Lbird22';
const ADMIN_PASSWORD = 'Redline22';

const TEAM_LIST = [
  'Independent',
  'Aurora Speed Club',
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
  'West Michigan Wolverines Speed Team',
].sort((a, b) => a.localeCompare(b));

const STANDARD_POINTS = {
  1: 30,
  2: 20,
  3: 10,
  4: 5,
};

const BLOCK_TYPES = ['race', 'break', 'lunch', 'awards', 'practice'];

function nowIso() {
  return new Date().toISOString();
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cap(s) {
  const str = String(s || '');
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function nextId(arr) {
  let max = 0;
  for (const item of arr || []) {
    max = Math.max(max, Number(item.id) || 0);
  }
  return max + 1;
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').map(s => s.trim()).filter(Boolean).forEach(pair => {
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

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('Failed reading JSON DB:', err);
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

function makeDivisionsTemplate() {
  return {
    novice: { enabled: false, cost: 0, distances: ['', '', '', ''] },
    elite: { enabled: false, cost: 0, distances: ['', '', '', ''] },
    open: { enabled: false, cost: 0, distances: ['', '', '', ''] },
  };
}

function makeQuadGroupsTemplate() {
  return [
    { id: 'quad_juvenile_boys', label: 'Quad Juvenile Boys', ages: '9 & under', gender: 'boys', distances: ['200', '500'], enabled: false, cost: 0 },
    { id: 'quad_juvenile_girls', label: 'Quad Juvenile Girls', ages: '9 & under', gender: 'girls', distances: ['200', '500'], enabled: false, cost: 0 },

    { id: 'quad_freshman_boys', label: 'Quad Freshman Boys', ages: '10-13', gender: 'boys', distances: ['300', '700'], enabled: false, cost: 0 },
    { id: 'quad_freshman_girls', label: 'Quad Freshman Girls', ages: '10-13', gender: 'girls', distances: ['300', '700'], enabled: false, cost: 0 },

    { id: 'quad_senior_men', label: 'Quad Senior Men', ages: '14+', gender: 'men', distances: ['300', '1000'], enabled: false, cost: 0 },
    { id: 'quad_senior_ladies', label: 'Quad Senior Ladies', ages: '14+', gender: 'women', distances: ['300', '1000'], enabled: false, cost: 0 },

    { id: 'quad_masters_men', label: 'Quad Masters Men', ages: '35+', gender: 'men', distances: ['300', '1000'], enabled: false, cost: 0 },
    { id: 'quad_masters_ladies', label: 'Quad Masters Ladies', ages: '35+', gender: 'women', distances: ['300', '1000'], enabled: false, cost: 0 },
  ];
}

function makeOpenGroupsTemplate() {
  return [
    { id: 'open_juvenile_boys', label: 'Open Juvenile Boys', ages: '9 & under', gender: 'boys', distances: ['1500', ''], enabled: false, cost: 0 },
    { id: 'open_juvenile_girls', label: 'Open Juvenile Girls', ages: '9 & under', gender: 'girls', distances: ['1500', ''], enabled: false, cost: 0 },

    { id: 'open_freshman_boys', label: 'Open Freshman Boys', ages: '10-13', gender: 'boys', distances: ['2000', ''], enabled: false, cost: 0 },
    { id: 'open_freshman_girls', label: 'Open Freshman Girls', ages: '10-13', gender: 'girls', distances: ['2000', ''], enabled: false, cost: 0 },

    { id: 'open_senior_men', label: 'Open Senior Men', ages: '14+', gender: 'men', distances: ['3000', '5000'], enabled: false, cost: 0 },
    { id: 'open_senior_women', label: 'Open Senior Women', ages: '14+', gender: 'women', distances: ['1500', '3000'], enabled: false, cost: 0 },

    { id: 'open_masters_men', label: 'Open Masters Men', ages: '35+', gender: 'men', distances: ['1500', '2000'], enabled: false, cost: 0 },
    { id: 'open_masters_women', label: 'Open Masters Women', ages: '35+', gender: 'women', distances: ['1500', '2000'], enabled: false, cost: 0 },
  ];
}

function baseGroups() {
  return [
    { id: 'tiny_tot_girls', label: 'Tiny Tot Girls', ages: '5 & under', gender: 'girls' },
    { id: 'tiny_tot_boys', label: 'Tiny Tot Boys', ages: '5 & under', gender: 'boys' },

    { id: 'primary_girls', label: 'Primary Girls', ages: '6-7', gender: 'girls' },
    { id: 'primary_boys', label: 'Primary Boys', ages: '6-7', gender: 'boys' },

    { id: 'juvenile_girls', label: 'Juvenile Girls', ages: '8-9', gender: 'girls' },
    { id: 'juvenile_boys', label: 'Juvenile Boys', ages: '8-9', gender: 'boys' },

    { id: 'elementary_girls', label: 'Elementary Girls', ages: '10-11', gender: 'girls' },
    { id: 'elementary_boys', label: 'Elementary Boys', ages: '10-11', gender: 'boys' },

    { id: 'freshman_girls', label: 'Freshman Girls', ages: '12-13', gender: 'girls' },
    { id: 'freshman_boys', label: 'Freshman Boys', ages: '12-13', gender: 'boys' },

    { id: 'sophomore_girls', label: 'Sophomore Girls', ages: '14-15', gender: 'girls' },
    { id: 'sophomore_boys', label: 'Sophomore Boys', ages: '14-15', gender: 'boys' },

    { id: 'junior_women', label: 'Junior Women', ages: '16-17', gender: 'women' },
    { id: 'junior_men', label: 'Junior Men', ages: '16-17', gender: 'men' },

    { id: 'senior_women', label: 'Senior Women', ages: '18-24', gender: 'women' },
    { id: 'senior_men', label: 'Senior Men', ages: '18-24', gender: 'men' },

    { id: 'classic_women', label: 'Classic Women', ages: '25-34', gender: 'women' },
    { id: 'classic_men', label: 'Classic Men', ages: '25-34', gender: 'men' },

    { id: 'master_women', label: 'Master Women', ages: '35-44', gender: 'women' },
    { id: 'master_men', label: 'Master Men', ages: '35-44', gender: 'men' },

    { id: 'veteran_women', label: 'Veteran Women', ages: '45-54', gender: 'women' },
    { id: 'veteran_men', label: 'Veteran Men', ages: '45-54', gender: 'men' },

    { id: 'esquire_women', label: 'Esquire Women', ages: '55+', gender: 'women' },
    { id: 'esquire_men', label: 'Esquire Men', ages: '55+', gender: 'men' },
  ].map(g => ({
    ...g,
    divisions: makeDivisionsTemplate(),
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
    registrationCloseAt: '',

    rinkId: 1,
    useCustomRink: false,
    customRinkName: '',
    customRinkCity: '',
    customRinkState: '',

    trackLength: 100,
    lanes: 4,

    quadEnabled: false,
    openEnabled: false,
    timeTrialsEnabled: false,
    relayEnabled: false,
    judgesPanelRequired: true,

    notes: '',
    relayNotes: '',

    isPublic: false,
    status: 'draft',

    groups: baseGroups(),
    quadGroups: makeQuadGroupsTemplate(),
    openGroups: makeOpenGroupsTemplate(),

    races: [],
    blocks: [],
    registrations: [],

    currentRaceId: '',
    currentRaceIndex: -1,
    raceDayPaused: false,
  };
}

function defaultDb() {
  return {
    version: 18,
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
        zip: '',
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
  db.rinks = (db.rinks || []).filter(r => {
    const name = String(r.name || '').trim().toLowerCase();
    return name !== 'wichita skate center';
  });

  const rollerCity = (db.rinks || []).find(r => String(r.name || '').trim().toLowerCase() === 'roller city');

  if (!rollerCity) {
    db.rinks.unshift(defaultDb().rinks[0]);
  } else {
    rollerCity.city = 'Wichita';
    rollerCity.state = 'KS';
    rollerCity.zip = String(rollerCity.zip || '');
    rollerCity.address = '3234 S. Meridian Ave, Wichita, KS 67217';
    rollerCity.phone = '316-942-4555';
    rollerCity.website = 'rollercitywichitaks.com';
  }
}

function normalizeDivisionSet(divs) {
  const out = divs || {};
  for (const key of ['novice', 'elite', 'open']) {
    if (!out[key]) out[key] = { enabled: false, cost: 0, distances: ['', '', '', ''] };
    out[key].enabled = !!out[key].enabled;
    out[key].cost = Number(out[key].cost || 0);
    if (!Array.isArray(out[key].distances)) out[key].distances = ['', '', '', ''];
    out[key].distances = [0, 1, 2, 3].map(i => String(out[key].distances[i] || '').trim());
  }
  return out;
}

function normalizeQuadGroups(groups) {
  const base = makeQuadGroupsTemplate();
  const byId = new Map((groups || []).map(g => [String(g.id), g]));
  return base.map(item => {
    const existing = byId.get(String(item.id));
    return {
      ...item,
      enabled: !!existing?.enabled,
      cost: Number(existing?.cost || 0),
      distances: [...item.distances],
    };
  });
}

function normalizeOpenGroups(groups, standardGroups) {
  const base = makeOpenGroupsTemplate();
  const byId = new Map((groups || []).map(g => [String(g.id), g]));

  return base.map(item => {
    const existing = byId.get(String(item.id));
    let distances = item.distances;

    if (!existing && Array.isArray(standardGroups)) {
      const fallbackFromStandard = standardGroups.find(g =>
        String(g.label || '').toLowerCase() === String(item.label || '').replace(/^open\s+/i, '').toLowerCase()
      );
      const oldOpen = fallbackFromStandard?.divisions?.open;
      if (oldOpen?.enabled) {
        distances = [String(oldOpen.distances?.[0] || '').trim(), String(oldOpen.distances?.[1] || '').trim()];
      }
    }

    return {
      ...item,
      enabled: !!existing?.enabled,
      cost: Number(existing?.cost || 0),
      distances: existing
        ? [String(existing.distances?.[0] || '').trim(), String(existing.distances?.[1] || '').trim()]
        : distances,
    };
  });
}

function migrateMeet(meet, fallbackOwnerId) {
  if (!meet.createdByUserId) meet.createdByUserId = fallbackOwnerId;
  if (!meet.createdAt) meet.createdAt = nowIso();
  if (!meet.updatedAt) meet.updatedAt = nowIso();

  if (typeof meet.meetName !== 'string') meet.meetName = 'New Meet';
  if (typeof meet.date !== 'string') meet.date = '';
  if (typeof meet.startTime !== 'string') meet.startTime = '';
  if (typeof meet.registrationCloseAt !== 'string') meet.registrationCloseAt = '';

  if (typeof meet.rinkId !== 'number') meet.rinkId = 1;
  if (typeof meet.useCustomRink !== 'boolean') meet.useCustomRink = false;
  if (typeof meet.customRinkName !== 'string') meet.customRinkName = '';
  if (typeof meet.customRinkCity !== 'string') meet.customRinkCity = '';
  if (typeof meet.customRinkState !== 'string') meet.customRinkState = '';

  if (!Number.isFinite(Number(meet.trackLength))) meet.trackLength = 100;
  if (!Number.isFinite(Number(meet.lanes))) meet.lanes = 4;

  if (typeof meet.quadEnabled !== 'boolean') meet.quadEnabled = false;
  if (typeof meet.openEnabled !== 'boolean') meet.openEnabled = false;
  if (typeof meet.timeTrialsEnabled !== 'boolean') meet.timeTrialsEnabled = false;
  if (typeof meet.relayEnabled !== 'boolean') meet.relayEnabled = false;
  if (typeof meet.judgesPanelRequired !== 'boolean') meet.judgesPanelRequired = true;

  if (typeof meet.notes !== 'string') meet.notes = '';
  if (typeof meet.relayNotes !== 'string') meet.relayNotes = '';

  if (typeof meet.isPublic !== 'boolean') meet.isPublic = false;
  if (typeof meet.status !== 'string') meet.status = 'draft';

  if (!Array.isArray(meet.groups) || meet.groups.length === 0) {
    meet.groups = baseGroups();
  } else {
    const baseMap = new Map(baseGroups().map(g => [g.id, g]));
    meet.groups = meet.groups.map(g => {
      const base = baseMap.get(g.id);
      return {
        id: g.id || base?.id || crypto.randomBytes(4).toString('hex'),
        label: base?.label || g.label || 'Division Group',
        ages: base?.ages || g.ages || '',
        gender: base?.gender || g.gender || '',
        divisions: normalizeDivisionSet(g.divisions),
      };
    });
  }

  meet.quadGroups = normalizeQuadGroups(meet.quadGroups);
  meet.openGroups = normalizeOpenGroups(meet.openGroups, meet.groups);

  if (!Array.isArray(meet.races)) meet.races = [];
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (!Array.isArray(meet.registrations)) meet.registrations = [];

  if (typeof meet.currentRaceId !== 'string') meet.currentRaceId = '';
  if (typeof meet.currentRaceIndex !== 'number') meet.currentRaceIndex = -1;
  if (typeof meet.raceDayPaused !== 'boolean') meet.raceDayPaused = false;

  meet.races = meet.races.map((r, idx) => ({
    id: r.id || ('r' + crypto.randomBytes(6).toString('hex')),
    orderHint: Number(r.orderHint || idx + 1),
    groupId: String(r.groupId || ''),
    groupLabel: String(r.groupLabel || ''),
    ages: String(r.ages || ''),
    division: String(r.division || 'elite'),
    distanceLabel: String(r.distanceLabel || ''),
    dayIndex: Number(r.dayIndex || 1),
    cost: Number(r.cost || 0),

    raceType: String(r.raceType || (String(r.division || '').toLowerCase() === 'open' ? 'open' : 'standard')),
    stage: String(r.stage || 'race'),
    heatNumber: Number(r.heatNumber || 0),
    parentRaceKey: String(r.parentRaceKey || ''),
    startType: String(r.startType || 'standing'),
    countsForOverall: typeof r.countsForOverall === 'boolean' ? r.countsForOverall : (String(r.division || '') !== 'open'),

    laneEntries: Array.isArray(r.laneEntries) ? r.laneEntries : [],
    resultsMode: String(r.resultsMode || 'places'),
    status: String(r.status || 'open'),
    notes: String(r.notes || ''),
    isFinal: !!r.isFinal,
    closedAt: String(r.closedAt || ''),
  }));

  meet.blocks = meet.blocks.map((b, idx) => ({
    id: String(b.id || ('b' + (idx + 1))),
    name: String(b.name || `Block ${idx + 1}`),
    day: String(b.day || 'Day 1'),
    type: BLOCK_TYPES.includes(String(b.type || 'race')) ? String(b.type || 'race') : 'race',
    notes: String(b.notes || ''),
    raceIds: Array.isArray(b.raceIds) ? b.raceIds.map(String) : [],
  }));

  meet.registrations = meet.registrations.map((reg, idx) => ({
    id: Number(reg.id || idx + 1),
    createdAt: String(reg.createdAt || nowIso()),
    name: String(reg.name || ''),
    age: Number(reg.age || 0),
    gender: String(reg.gender || 'boys'),
    team: String(reg.team || 'Independent'),
    sponsor: String(reg.sponsor || ''),

    divisionGroupId: String(reg.divisionGroupId || ''),
    divisionGroupLabel: String(reg.divisionGroupLabel || ''),

    originalDivisionGroupId: String(reg.originalDivisionGroupId || reg.divisionGroupId || ''),
    originalDivisionGroupLabel: String(reg.originalDivisionGroupLabel || reg.divisionGroupLabel || ''),

    quadGroupId: String(reg.quadGroupId || ''),
    quadGroupLabel: String(reg.quadGroupLabel || ''),

    openGroupId: String(reg.openGroupId || ''),
    openGroupLabel: String(reg.openGroupLabel || ''),

    meetNumber: Number(reg.meetNumber || idx + 1),
    helmetNumber: reg.helmetNumber === '' || reg.helmetNumber == null ? '' : Number(reg.helmetNumber),

    paid: !!reg.paid,
    checkedIn: !!reg.checkedIn,
    totalCost: Number(reg.totalCost || 0),

    options: {
      challengeUp: !!reg.options?.challengeUp,
      novice: !!reg.options?.novice,
      elite: !!reg.options?.elite,
      open: !!reg.options?.open,
      timeTrials: !!reg.options?.timeTrials,
      relays: !!reg.options?.relays,
      quad: !!reg.options?.quad,
    },
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

  const fallbackOwnerId = (db.users[0] && db.users[0].id) || 1;
  db.meets.forEach(m => migrateMeet(m, fallbackOwnerId));

  db.sessions = db.sessions.filter(s => s.expiresAt && new Date(s.expiresAt).getTime() > Date.now());

  db.version = 18;
  db.updatedAt = nowIso();
  return db;
}

function saveDb(db) {
  db.version = 18;
  db.updatedAt = nowIso();
  writeJsonAtomic(DATA_FILE, db);
}

function getSessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;

  const db = loadDb();
  const sess = db.sessions.find(s => s.token === token);
  if (!sess) return null;
  if (new Date(sess.expiresAt).getTime() <= Date.now()) return null;

  const user = db.users.find(u => u.id === sess.userId && u.active !== false);
  if (!user) return null;

  return { db, session: sess, token, user };
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

    if (hasRole(data.user, 'super_admin') || roles.some(role => hasRole(data.user, role))) {
      return next();
    }

    return res.status(403).send(pageShell({
      title: 'Forbidden',
      user: data.user,
      bodyHtml: `
        <h1>Forbidden</h1>
        <div class="card">
          <div class="danger">You do not have access to this page.</div>
        </div>
      `,
    }));
  };
}

function getMeetOr404(db, meetId) {
  return db.meets.find(m => Number(m.id) === Number(meetId));
}

function canEditMeet(user, meet) {
  return hasRole(user, 'super_admin') || Number(meet.createdByUserId) === Number(user.id);
}

function ensureAtLeastOneBlock(meet) {
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (meet.blocks.length === 0) {
    meet.blocks.push({
      id: 'b1',
      name: 'Block 1',
      day: 'Day 1',
      type: 'race',
      notes: '',
      raceIds: [],
    });
  }
}

function combineDateTime(date, time) {
  const d = String(date || '').trim();
  const t = String(time || '').trim();
  if (!d) return '';
  if (!t) return `${d}T00:00:00`;
  return `${d}T${t}:00`;
}

function isRegistrationClosed(meet) {
  if (!meet.registrationCloseAt) return false;
  const ts = new Date(meet.registrationCloseAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() > ts;
}

function groupAgeMatch(group, age) {
  const n = Number(age);
  const ages = String(group.ages || '');

  if (ages.includes('& under')) {
    const limit = Number((ages.match(/\d+/) || [0])[0]);
    return n <= limit;
  }
  if (ages.includes('+')) {
    const min = Number((ages.match(/\d+/) || [999])[0]);
    return n >= min;
  }
  const nums = ages.match(/\d+/g) || [];
  if (nums.length >= 2) {
    return n >= Number(nums[0]) && n <= Number(nums[1]);
  }
  return false;
}

function findAgeGroup(groups, age, genderGuess) {
  const n = Number(age);
  if (!Number.isFinite(n)) return null;

  const normalizedGender = String(genderGuess || '').toLowerCase();
  const candidates = groups.filter(g => groupAgeMatch(g, n));

  if (!candidates.length) return null;
  return candidates.find(g => g.gender === normalizedGender) || candidates[0];
}

function findChallengeUpGroup(groups, currentGroupId) {
  const idx = groups.findIndex(g => String(g.id) === String(currentGroupId));
  if (idx < 0) return null;
  return groups[idx + 1] || null;
}

function challengeAdjustedGroup(meet, baseGroup, challengeUp) {
  if (!baseGroup) return null;
  if (!challengeUp) return baseGroup;
  return findChallengeUpGroup(meet.groups || [], baseGroup.id) || baseGroup;
}

function findQuadGroup(meet, age, genderGuess) {
  const enabled = (meet.quadGroups || []).filter(g => g.enabled);
  return findAgeGroup(enabled.length ? enabled : (meet.quadGroups || []), age, genderGuess);
}

function findOpenGroup(meet, age, genderGuess) {
  const enabled = (meet.openGroups || []).filter(g => g.enabled);
  return findAgeGroup(enabled.length ? enabled : (meet.openGroups || []), age, genderGuess);
}

function divisionEnabledForRegistration(reg, division) {
  return !!reg.options?.[division];
}

function nextHelmetNumber(meet) {
  const used = new Set(
    (meet.registrations || [])
      .map(r => Number(r.helmetNumber))
      .filter(n => Number.isFinite(n) && n > 0)
  );

  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

function calculateRegistrationTotal(meet, reg) {
  let total = 0;
  for (const race of meet.races || []) {
    const usesStandardGroup =
      String(race.raceType || 'standard') === 'standard' &&
      String(race.groupId) === String(reg.divisionGroupId) &&
      divisionEnabledForRegistration(reg, race.division);

    const usesQuadGroup =
      String(race.raceType || '') === 'quad' &&
      reg.options?.quad &&
      String(race.groupId) === String(reg.quadGroupId);

    const usesOpenGroup =
      String(race.raceType || '') === 'open' &&
      reg.options?.open &&
      String(race.groupId) === String(reg.openGroupId);

    if (usesStandardGroup || usesQuadGroup || usesOpenGroup) {
      total += Number(race.cost || 0);
    }
  }
  return total;
}

function ensureRegistrationTotalsAndNumbers(meet) {
  for (const reg of meet.registrations || []) {
    reg.totalCost = calculateRegistrationTotal(meet, reg);
    if (!Number.isFinite(Number(reg.helmetNumber)) || Number(reg.helmetNumber) <= 0) {
      reg.helmetNumber = nextHelmetNumber(meet);
    }
  }
}

function sponsorLineHtml(sponsor) {
  const s = String(sponsor || '').trim();
  if (!s) return '';
  return `<div class="note"><b>Sponsor:</b> ${esc(s)}</div>`;
}

function normalizeDistances(arr4) {
  return [0, 1, 2, 3].map(i => String(arr4?.[i] ?? '').trim());
}

function normalizeTwoDistances(arr2) {
  return [0, 1].map(i => String(arr2?.[i] ?? '').trim());
}

function baseRaceKey(groupId, division, dayIndex, distanceLabel, raceType = 'standard') {
  return `${raceType}|${groupId}|${division}|${dayIndex}|${distanceLabel}`;
}

function isOpenDivision(div) {
  return String(div || '').toLowerCase() === 'open';
}

function hasExistingSchedule(meet) {
  return (meet.blocks || []).some(block => (block.raceIds || []).length > 0);
}

function buildEntryTypeList(reg) {
  const out = [];
  if (reg.options?.challengeUp) out.push('Challenge Up');
  if (reg.options?.novice) out.push('Novice');
  if (reg.options?.elite) out.push('Elite');
  if (reg.options?.open) out.push('Open');
  if (reg.options?.timeTrials) out.push('Time Trials');
  if (reg.options?.relays) out.push('Relays');
  if (reg.options?.quad) out.push('Quad');
  return out;
}

function raceDisplayStage(race) {
  if (race.stage === 'heat') return `Heat ${race.heatNumber}`;
  if (race.stage === 'semi') return `Semi ${race.heatNumber}`;
  if (race.stage === 'final') return 'Final';
  return 'Race';
}

function normalizePlaceValue(place) {
  const n = Number(String(place || '').trim());
  return Number.isFinite(n) ? n : null;
}

function scoreRaceByStandardPoints(race) {
  const results = [];

  for (const entry of race.laneEntries || []) {
    const place = normalizePlaceValue(entry.place);
    if (place == null || place > 4) continue;
    results.push({
      registrationId: entry.registrationId,
      skaterName: entry.skaterName,
      team: entry.team,
      place,
    });
  }

  const grouped = new Map();
  for (const item of results) {
    if (!grouped.has(item.place)) grouped.set(item.place, []);
    grouped.get(item.place).push(item);
  }

  const scored = [];
  const occupiedPlaces = Array.from(grouped.keys()).sort((a, b) => a - b);

  for (const place of occupiedPlaces) {
    const tied = grouped.get(place) || [];
    if (!tied.length) continue;

    let pointPool = 0;
    for (let i = 0; i < tied.length; i++) {
      const effectivePlace = place + i;
      pointPool += Number(STANDARD_POINTS[effectivePlace] || 0);
    }

    const each = tied.length ? (pointPool / tied.length) : 0;

    for (const skater of tied) {
      scored.push({
        ...skater,
        points: each,
      });
    }
  }

  return scored;
}

function computeMeetStandings(meet) {
  const standings = {};
  const divisions = {};
  const regMap = new Map((meet.registrations || []).map(r => [Number(r.id), r]));

  for (const race of meet.races || []) {
    if (!race.isFinal) continue;
    if (!race.countsForOverall) continue;
    if (String(race.status || '') !== 'closed') continue;

    const bucketKey = `${race.raceType || 'standard'}|${race.groupId}|${race.division}`;
    if (!divisions[bucketKey]) {
      divisions[bucketKey] = {
        groupId: race.groupId,
        groupLabel: race.groupLabel,
        division: race.division,
        raceType: race.raceType || 'standard',
        races: [],
      };
    }
    divisions[bucketKey].races.push(race);

    const scored = scoreRaceByStandardPoints(race);
    if (!standings[bucketKey]) standings[bucketKey] = {};

    for (const row of scored) {
      const regKey = String(row.registrationId || row.skaterName || crypto.randomBytes(3).toString('hex'));
      const reg = regMap.get(Number(row.registrationId));

      if (!standings[bucketKey][regKey]) {
        standings[bucketKey][regKey] = {
          registrationId: row.registrationId,
          skaterName: row.skaterName,
          team: row.team,
          sponsor: reg?.sponsor || '',
          totalPoints: 0,
          raceScores: [],
        };
      }

      standings[bucketKey][regKey].totalPoints += Number(row.points || 0);
      standings[bucketKey][regKey].raceScores.push({
        raceId: race.id,
        distanceLabel: race.distanceLabel,
        place: row.place,
        points: row.points,
      });
    }
  }

  const output = Object.keys(divisions).map(key => {
    const rows = Object.values(standings[key] || {})
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
        return String(a.skaterName || '').localeCompare(String(b.skaterName || ''));
      })
      .map((row, idx) => ({
        ...row,
        overallPlace: idx + 1,
      }));

    return {
      key,
      groupId: divisions[key].groupId,
      groupLabel: divisions[key].groupLabel,
      division: divisions[key].division,
      raceType: divisions[key].raceType,
      races: divisions[key].races.sort((a, b) => Number(a.dayIndex || 0) - Number(b.dayIndex || 0)),
      standings: rows,
    };
  }).sort((a, b) => {
    const byType = String(a.raceType || '').localeCompare(String(b.raceType || ''));
    if (byType !== 0) return byType;
    const byGroup = String(a.groupLabel).localeCompare(String(b.groupLabel));
    if (byGroup !== 0) return byGroup;
    return String(a.division).localeCompare(String(b.division));
  });

  return output;
}

function computeOpenResults(meet) {
  return (meet.races || [])
    .filter(r => (isOpenDivision(r.division) || String(r.raceType || '') === 'open') && r.isFinal && String(r.status || '') === 'closed')
    .sort((a, b) => {
      const byGroup = String(a.groupLabel || '').localeCompare(String(b.groupLabel || ''));
      if (byGroup !== 0) return byGroup;
      return Number(a.dayIndex || 0) - Number(b.dayIndex || 0);
    })
    .map(race => ({
      race,
      rows: (race.laneEntries || [])
        .filter(x => String(x.place || '').trim())
        .sort((a, b) => Number(a.place || 999) - Number(b.place || 999)),
    }));
}

function recentClosedRaces(meet, count = 5) {
  return (meet.races || [])
    .filter(r => String(r.status || '') === 'closed')
    .sort((a, b) => new Date(b.closedAt || 0).getTime() - new Date(a.closedAt || 0).getTime())
    .slice(0, count);
}

function orderedRaces(meet) {
  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const out = [];

  for (const block of meet.blocks || []) {
    if (String(block.type || 'race') !== 'race') continue;
    for (const raceId of block.raceIds || []) {
      const race = raceById.get(raceId);
      if (race) {
        out.push({
          ...race,
          blockId: block.id,
          blockName: block.name,
          blockDay: block.day,
          blockType: block.type || 'race',
          blockNotes: block.notes || '',
        });
      }
    }
  }

  const assigned = new Set(out.map(r => r.id));
  for (const race of meet.races || []) {
    if (!assigned.has(race.id)) {
      out.push({
        ...race,
        blockId: '',
        blockName: 'Unassigned',
        blockDay: '',
        blockType: 'race',
        blockNotes: '',
      });
    }
  }

  return out;
}

function currentRaceInfo(meet) {
  const ordered = orderedRaces(meet);
  let idx = ordered.findIndex(r => r.id === meet.currentRaceId);
  if (idx < 0) idx = Number.isFinite(meet.currentRaceIndex) ? meet.currentRaceIndex : -1;
  if (idx < 0 && ordered.length) idx = 0;

  return {
    ordered,
    idx,
    current: idx >= 0 ? ordered[idx] : null,
    next: idx >= 0 && ordered[idx + 1] ? ordered[idx + 1] : null,
    coming: idx >= 0 ? ordered.slice(idx + 2, idx + 5) : ordered.slice(0, 3),
  };
}

function ensureCurrentRace(meet) {
  const info = currentRaceInfo(meet);
  if (info.current && meet.currentRaceId !== info.current.id) {
    meet.currentRaceId = info.current.id;
    meet.currentRaceIndex = info.idx;
  }
}

function laneRowsForRace(race, meet) {
  const out = [];
  const maxLanes = String(race.division || '') === 'open'
    ? Math.max((race.laneEntries || []).length, 1)
    : Math.max(1, Number(meet.lanes) || 4);

  for (let lane = 1; lane <= maxLanes; lane++) {
    const existing = (race.laneEntries || []).find(x => Number(x.lane) === lane) || {};
    out.push({
      lane,
      registrationId: existing.registrationId || '',
      helmetNumber: existing.helmetNumber || '',
      skaterName: existing.skaterName || '',
      team: existing.team || '',
      place: existing.place || '',
      time: existing.time || '',
      status: existing.status || '',
    });
  }

  return out;
}

function registrationSortKey(reg) {
  return [
    String(reg.team || ''),
    String(reg.name || ''),
    Number(reg.age || 0),
    Number(reg.id || 0),
  ].join('|');
}

function distributeByTeam(entries, heatCount) {
  const buckets = Array.from({ length: heatCount }, () => []);
  const teamMap = new Map();

  for (const entry of entries) {
    const team = String(entry.team || 'Independent');
    if (!teamMap.has(team)) teamMap.set(team, []);
    teamMap.get(team).push(entry);
  }

  const teamGroups = Array.from(teamMap.values()).sort((a, b) => b.length - a.length);

  for (const group of teamGroups) {
    for (const skater of group) {
      let bestIdx = 0;
      let bestScore = Infinity;

      for (let i = 0; i < buckets.length; i++) {
        const bucket = buckets[i];
        const sameTeamCount = bucket.filter(x => String(x.team || 'Independent') === String(skater.team || 'Independent')).length;
        const sizeScore = bucket.length;
        const score = sameTeamCount * 100 + sizeScore;

        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      buckets[bestIdx].push(skater);
    }
  }

  return buckets;
}

function buildHeatRaceShell(baseRace, stage, heatNumber, suffixOrder) {
  return {
    ...baseRace,
    id: 'r' + crypto.randomBytes(6).toString('hex'),
    orderHint: Number(baseRace.orderHint || 0) + suffixOrder / 100,
    stage,
    heatNumber: stage === 'final' ? 0 : heatNumber,
    isFinal: stage === 'final',
    laneEntries: [],
    status: 'open',
    closedAt: '',
  };
}

function shouldSplitIntoHeats(baseRace, entryCount, laneCount) {
  if (isOpenDivision(baseRace.division)) return false;
  return entryCount > laneCount;
}

function buildRaceSetForEntries(baseRace, regs, laneCount) {
  const sorted = [...regs].sort((a, b) => registrationSortKey(a).localeCompare(registrationSortKey(b)));

  if (isOpenDivision(baseRace.division)) {
    return [{
      ...baseRace,
      stage: 'final',
      heatNumber: 0,
      isFinal: true,
      startType: 'rolling',
      countsForOverall: false,
      laneEntries: sorted.map((reg, idx) => ({
        lane: idx + 1,
        registrationId: reg.id,
        helmetNumber: reg.helmetNumber,
        skaterName: reg.name,
        team: reg.team,
        place: '',
        time: '',
        status: '',
      })),
    }];
  }

  if (!shouldSplitIntoHeats(baseRace, sorted.length, laneCount)) {
    return [{
      ...baseRace,
      stage: 'final',
      heatNumber: 0,
      isFinal: true,
      startType: 'standing',
      countsForOverall: true,
      laneEntries: sorted.slice(0, laneCount).map((reg, idx) => ({
        lane: idx + 1,
        registrationId: reg.id,
        helmetNumber: reg.helmetNumber,
        skaterName: reg.name,
        team: reg.team,
        place: '',
        time: '',
        status: '',
      })),
    }];
  }

  const heatCount = Math.ceil(sorted.length / laneCount);
  const buckets = distributeByTeam(sorted, heatCount).map(bucket => bucket.slice(0, laneCount));

  const raceSet = [];

  buckets.forEach((bucket, idx) => {
    const heatRace = buildHeatRaceShell(baseRace, 'heat', idx + 1, idx + 1);
    heatRace.startType = 'standing';
    heatRace.countsForOverall = false;
    heatRace.laneEntries = bucket.map((reg, laneIdx) => ({
      lane: laneIdx + 1,
      registrationId: reg.id,
      helmetNumber: reg.helmetNumber,
      skaterName: reg.name,
      team: reg.team,
      place: '',
      time: '',
      status: '',
    }));
    raceSet.push(heatRace);
  });

  const finalRace = buildHeatRaceShell(baseRace, 'final', 0, 99);
  finalRace.startType = 'standing';
  finalRace.countsForOverall = true;
  finalRace.laneEntries = [];
  raceSet.push(finalRace);

  return raceSet;
}

function generateBaseRacesForMeet(meet) {
  const oldMap = new Map(
    (meet.races || [])
      .filter(r => !['heat', 'final', 'semi'].includes(String(r.stage || '')))
      .map(r => [baseRaceKey(r.groupId, r.division, r.dayIndex, r.distanceLabel, r.raceType || 'standard'), r])
  );

  const races = [];
  let orderHint = 1;

  for (const group of meet.groups || []) {
    for (const divKey of ['novice', 'elite']) {
      const div = group.divisions?.[divKey];
      if (!div || !div.enabled) continue;

      const distances = normalizeDistances(div.distances);
      for (let i = 0; i < 4; i++) {
        const distance = distances[i];
        if (!distance) continue;

        const key = baseRaceKey(group.id, divKey, i + 1, distance, 'standard');
        const old = oldMap.get(key);

        races.push({
          id: old?.id || ('r' + crypto.randomBytes(6).toString('hex')),
          orderHint: orderHint++,

          groupId: group.id,
          groupLabel: group.label,
          ages: group.ages,
          division: divKey,
          distanceLabel: distance,
          dayIndex: i + 1,
          cost: Number(div.cost || 0),

          raceType: 'standard',
          stage: old?.stage || 'race',
          heatNumber: Number(old?.heatNumber || 0),
          parentRaceKey: old?.parentRaceKey || key,
          startType: old?.startType || 'standing',
          countsForOverall: typeof old?.countsForOverall === 'boolean' ? old.countsForOverall : true,

          laneEntries: Array.isArray(old?.laneEntries) ? old.laneEntries : [],
          resultsMode: old?.resultsMode || 'places',
          status: old?.status || 'open',
          notes: String(old?.notes || ''),
          isFinal: !!old?.isFinal,
          closedAt: old?.closedAt || '',
        });
      }
    }
  }

  if (meet.quadEnabled) {
    for (const group of meet.quadGroups || []) {
      if (!group.enabled) continue;
      const distances = normalizeTwoDistances(group.distances);
      for (let i = 0; i < distances.length; i++) {
        const distance = distances[i];
        if (!distance) continue;

        const key = baseRaceKey(group.id, 'quad', i + 1, distance, 'quad');
        const old = oldMap.get(key);

        races.push({
          id: old?.id || ('r' + crypto.randomBytes(6).toString('hex')),
          orderHint: orderHint++,

          groupId: group.id,
          groupLabel: group.label,
          ages: group.ages,
          division: 'quad',
          distanceLabel: distance,
          dayIndex: i + 1,
          cost: Number(group.cost || 0),

          raceType: 'quad',
          stage: old?.stage || 'race',
          heatNumber: Number(old?.heatNumber || 0),
          parentRaceKey: old?.parentRaceKey || key,
          startType: old?.startType || 'standing',
          countsForOverall: typeof old?.countsForOverall === 'boolean' ? old.countsForOverall : true,

          laneEntries: Array.isArray(old?.laneEntries) ? old.laneEntries : [],
          resultsMode: old?.resultsMode || 'places',
          status: old?.status || 'open',
          notes: String(old?.notes || ''),
          isFinal: !!old?.isFinal,
          closedAt: old?.closedAt || '',
        });
      }
    }
  }

  if (meet.openEnabled) {
    for (const group of meet.openGroups || []) {
      if (!group.enabled) continue;
      const distances = normalizeTwoDistances(group.distances);
      for (let i = 0; i < distances.length; i++) {
        const distance = distances[i];
        if (!distance) continue;

        const key = baseRaceKey(group.id, 'open', i + 1, distance, 'open');
        const old = oldMap.get(key);

        races.push({
          id: old?.id || ('r' + crypto.randomBytes(6).toString('hex')),
          orderHint: orderHint++,

          groupId: group.id,
          groupLabel: group.label,
          ages: group.ages,
          division: 'open',
          distanceLabel: distance,
          dayIndex: i + 1,
          cost: Number(group.cost || 0),

          raceType: 'open',
          stage: 'final',
          heatNumber: 0,
          parentRaceKey: old?.parentRaceKey || key,
          startType: 'rolling',
          countsForOverall: false,

          laneEntries: Array.isArray(old?.laneEntries) ? old.laneEntries : [],
          resultsMode: old?.resultsMode || 'places',
          status: old?.status || 'open',
          notes: String(old?.notes || ''),
          isFinal: true,
          closedAt: old?.closedAt || '',
        });
      }
    }
  }

  const validIds = new Set(races.map(r => r.id));

  meet.blocks = (meet.blocks || []).map(block => ({
    ...block,
    raceIds: (block.raceIds || []).filter(rid => validIds.has(rid)),
  }));

  meet.races = races;
  if (!validIds.has(meet.currentRaceId)) {
    meet.currentRaceId = '';
    meet.currentRaceIndex = -1;
  }
  meet.updatedAt = nowIso();
}

function rebuildRaceAssignments(meet) {
  ensureRegistrationTotalsAndNumbers(meet);

  const laneCount = Math.max(1, Number(meet.lanes) || 4);
  const originalBlocks = (meet.blocks || []).map(block => ({
    ...block,
    raceIds: [...(block.raceIds || [])],
  }));

  const baseRaces = (meet.races || []).filter(r => !['heat', 'semi'].includes(String(r.stage || '')));

  const newRaces = [];

  for (const baseRace of baseRaces) {
    const matchingRegs = (meet.registrations || []).filter(reg => {
      if (String(baseRace.raceType || 'standard') === 'quad') {
        return reg.options?.quad && String(reg.quadGroupId || '') === String(baseRace.groupId || '');
      }
      if (String(baseRace.raceType || 'standard') === 'open') {
        return reg.options?.open && String(reg.openGroupId || '') === String(baseRace.groupId || '');
      }
      return (
        String(reg.divisionGroupId || '') === String(baseRace.groupId || '') &&
        divisionEnabledForRegistration(reg, baseRace.division)
      );
    });

    const raceSet = buildRaceSetForEntries(baseRace, matchingRegs, laneCount);
    newRaces.push(...raceSet);
  }

  const mappedBlocks = originalBlocks.map(block => {
    const nextRaceIds = [];

    for (const oldRid of block.raceIds || []) {
      const oldRace = (meet.races || []).find(r => r.id === oldRid);
      if (!oldRace) continue;

      const parentKey = oldRace.parentRaceKey || baseRaceKey(
        oldRace.groupId,
        oldRace.division,
        oldRace.dayIndex,
        oldRace.distanceLabel,
        oldRace.raceType || 'standard'
      );

      const replacements = newRaces.filter(r => (r.parentRaceKey || '') === parentKey);

      for (const rep of replacements) {
        if (!nextRaceIds.includes(rep.id)) nextRaceIds.push(rep.id);
      }
    }

    return { ...block, raceIds: nextRaceIds };
  });

  meet.races = newRaces;
  meet.blocks = mappedBlocks;
  meet.updatedAt = nowIso();
  ensureCurrentRace(meet);
}

function racingSoonLabel(delta) {
  if (delta <= 0) return 'NOW';
  if (delta === 1) return 'ON DECK';
  if (delta === 2) return '2 RACES AWAY';
  if (delta === 3) return '3 RACES AWAY';
  return `${delta} RACES AWAY`;
}

function coachVisibleMeets(db, user) {
  if (hasRole(user, 'super_admin')) return db.meets;
  if (hasRole(user, 'meet_director')) {
    return db.meets.filter(m => Number(m.createdByUserId) === Number(user.id));
  }
  if (hasRole(user, 'coach')) {
    return db.meets.filter(m =>
      (m.registrations || []).some(r => String(r.team || '').trim().toLowerCase() === String(user.team || '').trim().toLowerCase())
    );
  }
  return [];
}

function coachTeamRegistrations(meet, coachTeam) {
  const teamKey = String(coachTeam || '').trim().toLowerCase();
  return (meet.registrations || []).filter(r => String(r.team || '').trim().toLowerCase() === teamKey);
}

function coachUpcomingForMeet(meet, coachTeam) {
  const regs = coachTeamRegistrations(meet, coachTeam);
  const regIds = new Set(regs.map(r => Number(r.id)));
  const info = currentRaceInfo(meet);

  return info.ordered
    .map((race, idx) => {
      const matched = (race.laneEntries || []).filter(le => regIds.has(Number(le.registrationId)));
      if (!matched.length) return null;

      return {
        race,
        raceIndex: idx,
        delta: idx - info.idx,
        skaters: matched.map(m => ({
          registrationId: m.registrationId,
          skaterName: m.skaterName,
          helmetNumber: m.helmetNumber,
          team: m.team,
        })),
      };
    })
    .filter(Boolean)
    .filter(x => x.delta >= 0)
    .slice(0, 12);
}

function coachRecentResultsForMeet(meet, coachTeam) {
  const regs = coachTeamRegistrations(meet, coachTeam);
  const regIds = new Set(regs.map(r => Number(r.id)));

  return recentClosedRaces(meet, 12)
    .map(race => {
      const matched = (race.laneEntries || []).filter(le => regIds.has(Number(le.registrationId)));
      if (!matched.length) return null;
      return { race, skaters: matched };
    })
    .filter(Boolean);
}

function coachStandingsForMeet(meet, coachTeam) {
  const standings = computeMeetStandings(meet);
  const teamKey = String(coachTeam || '').trim().toLowerCase();

  return standings
    .map(section => ({
      ...section,
      standings: (section.standings || []).filter(
        row => String(row.team || '').trim().toLowerCase() === teamKey
      ),
    }))
    .filter(section => (section.standings || []).length > 0);
}function buildEntrySummaryHtml(reg) {
  const items = buildEntryTypeList(reg);
  if (!items.length) return '';
  return `<div class="note">${items.map(esc).join(' • ')}</div>`;
}

function announcerBoxHtml(current, lanes) {
  if (!current) return `<div class="muted">No race selected.</div>`;

  const laneLines = lanes
    .filter(l => l.skaterName)
    .map(l => `
      <div style="padding:10px 0;border-top:1px solid rgba(255,255,255,.14)">
        <div style="font-size:20px;font-weight:900;line-height:1.15">
          LANE ${esc(l.lane)} — ${l.helmetNumber ? '#' + esc(l.helmetNumber) + ' ' : ''}${esc(l.skaterName)}
        </div>
        <div style="font-size:16px;opacity:.95">${esc(l.team || '')}</div>
        ${l.sponsor ? `<div style="font-size:14px;opacity:.85">Sponsored by ${esc(l.sponsor)}</div>` : ''}
      </div>
    `).join('');

  return `
    <div class="codeBox" style="font-size:18px;line-height:1.45;padding:18px">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;font-weight:900">Now Racing</div>
      <div style="font-size:34px;line-height:1.02;font-weight:900;margin-top:6px">${esc(current.groupLabel)}</div>
      <div style="font-size:21px;margin-top:8px">${esc(cap(current.division))} • ${esc(current.distanceLabel)} • ${esc(raceDisplayStage(current))}</div>
      <div style="font-size:15px;opacity:.9;margin-top:6px">${esc(cap(current.startType))} Start</div>
      <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,.18)"></div>
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;font-weight:900;margin-top:12px">Lanes</div>
      ${laneLines || `<div style="padding-top:10px;font-size:16px">No skaters entered yet.</div>`}
    </div>
  `;
}

function navHtml(user) {
  return `
    <div class="topbar">
      <div class="brandWrap">
        <div class="brandMark">SSM</div>
        <div class="brandText">SpeedSkateMeet</div>
      </div>
      <div class="nav">
        <a class="pill" href="/">Home</a>
        <a class="pill" href="/meets">Find a Meet</a>
        <a class="pill" href="/rinks">Find a Rink</a>
        <a class="pill" href="/live">Live Race Day</a>
        ${user
          ? `<a class="pill solid" href="/portal">Portal</a><a class="pill" href="/admin/logout">Logout</a>`
          : `<a class="pill solid" href="/admin/login">Admin Login</a>`
        }
      </div>
    </div>
  `;
}

function meetTabs(meet, active) {
  if (!meet) return '';
  const tabs = [
    ['builder', 'Meet Builder', `/portal/meet/${meet.id}/builder`],
    ['quad-builder', 'Quad Builder', `/portal/meet/${meet.id}/quad-builder`],
    ['open-builder', 'Open Builder', `/portal/meet/${meet.id}/open-builder`],
    ['blocks', 'Block Builder', `/portal/meet/${meet.id}/blocks`],
    ['registered', 'Registered', `/portal/meet/${meet.id}/registered`],
    ['checkin', 'Check-In', `/portal/meet/${meet.id}/checkin`],
    ['race-day', 'Race Day', `/portal/meet/${meet.id}/race-day/director`],
    ['results', 'Results', `/portal/meet/${meet.id}/results`],
  ];

  return `
    <div class="meetTabs">
      ${tabs.map(([key, label, href]) => `
        <a class="meetTab ${active === key ? 'active' : ''}" href="${href}">${label}</a>
      `).join('')}
    </div>
  `;
}

function pageShell({ title, bodyHtml, user, meet, activeTab }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <style>
      :root {
        --bg:#eef4ff;
        --bg2:#f7f9fc;
        --card:#ffffff;
        --text:#0f172a;
        --muted:#64748b;
        --line:#dbe3ee;
        --blue:#2563EB;
        --orange:#F97316;
        --green:#12b76a;
        --yellow:#f5b301;
        --red:#d92d20;
        --dark:#0F172A;
        --shadow:0 14px 34px rgba(15,23,42,.10);
        --radius:18px;
      }
      * { box-sizing:border-box; }
      body {
        margin:0;
        font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;
        color:var(--text);
        background:linear-gradient(180deg,var(--bg),var(--bg2));
      }
      a { text-decoration:none; color:var(--blue); }
      .topbar {
        max-width:1280px;
        margin:18px auto 0;
        padding:0 18px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:18px;
      }
      .brandWrap { display:flex; align-items:center; gap:12px; }
      .brandMark {
        width:44px; height:44px; border-radius:14px;
        background:linear-gradient(135deg,var(--dark),var(--blue));
        display:flex; align-items:center; justify-content:center;
        color:#fff; font-weight:900; letter-spacing:.6px;
        box-shadow:var(--shadow);
      }
      .brandText { font-weight:900; font-size:22px; letter-spacing:-.5px; }
      .nav { display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end; }
      .pill {
        border:1px solid #c7d2fe;
        padding:10px 14px;
        border-radius:999px;
        background:rgba(255,255,255,.8);
        font-weight:800;
        color:#1d4ed8;
      }
      .pill.solid {
        background:var(--dark);
        color:#fff;
        border-color:var(--dark);
      }
      .wrap {
        max-width:1280px;
        margin:22px auto 64px;
        padding:0 18px;
      }
      .meetTabs {
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        margin:12px 0 18px;
      }
      .meetTab {
        padding:11px 14px;
        border-radius:14px;
        background:rgba(255,255,255,.8);
        border:1px solid var(--line);
        font-weight:900;
        color:#1e293b;
      }
      .meetTab.active {
        background:var(--blue);
        border-color:var(--blue);
        color:#fff;
      }
      h1 { margin:14px 0 10px; font-size:42px; letter-spacing:-1px; }
      h2 { margin:0 0 8px; font-size:28px; letter-spacing:-.5px; }
      h3 { margin:0 0 8px; font-size:20px; }
      .card {
        background:var(--card);
        border:1px solid rgba(148,163,184,.24);
        border-radius:var(--radius);
        box-shadow:var(--shadow);
        padding:18px;
      }
      .spacer { height:14px; }
      .muted { color:var(--muted); }
      .danger { color:var(--red); font-weight:900; }
      .good { color:var(--green); font-weight:900; }
      .note { font-size:13px; color:var(--muted); }
      .small { font-size:12px; }

      .row { display:flex; gap:14px; flex-wrap:wrap; align-items:flex-start; }
      .between { justify-content:space-between; }
      .center { align-items:center; }

      .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
      .grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
      @media(max-width:1000px) { .grid4,.grid3 { grid-template-columns:1fr 1fr; } }
      @media(max-width:860px) {
        .grid2,.grid3,.grid4 { grid-template-columns:1fr; }
        .topbar { display:block; }
        .nav { margin-top:12px; }
      }

      label {
        display:block;
        font-size:13px;
        font-weight:900;
        margin-bottom:6px;
        color:#0f172a;
      }
      input, select, textarea {
        width:100%;
        padding:12px 12px;
        border-radius:12px;
        border:1px solid var(--line);
        font-size:15px;
        outline:none;
        background:#fff;
      }
      input:focus, select:focus, textarea:focus {
        border-color:#93c5fd;
        box-shadow:0 0 0 4px rgba(147,197,253,.28);
      }
      textarea { min-height:100px; resize:vertical; }
      input[type=checkbox], input[type=radio] {
        width:auto;
        transform:scale(1.05);
      }

      .btn, .btn2, .btnDanger, .btnGood {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        border:0;
        border-radius:12px;
        padding:12px 16px;
        font-weight:900;
        cursor:pointer;
      }
      .btn { background:var(--blue); color:#fff; }
      .btn2 { background:#fff; color:#1e40af; border:2px solid #c7d2fe; }
      .btnDanger { background:#fff; color:#b42318; border:2px solid #fecaca; }
      .btnGood { background:#fff; color:#067647; border:2px solid #a6f4c5; }

      .hr { height:1px; background:rgba(148,163,184,.25); margin:14px 0; }

      .chip {
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:8px 11px;
        border-radius:999px;
        background:#f8fbff;
        border:1px solid var(--line);
        font-weight:900;
      }

      .table { width:100%; border-collapse:collapse; }
      .table th, .table td {
        padding:11px 10px;
        border-bottom:1px solid var(--line);
        text-align:left;
        vertical-align:top;
      }
      .table th {
        font-size:12px;
        text-transform:uppercase;
        color:#475569;
        letter-spacing:.05em;
      }

      .groupCard {
        padding:16px;
        border-radius:16px;
        border:1px solid rgba(148,163,184,.25);
        background:#fff;
      }

      .builderSection {
        background:#fff;
        border:1px solid rgba(148,163,184,.25);
        border-radius:16px;
        padding:16px;
      }

      .bb { display:grid; grid-template-columns:1.25fr .85fr; gap:16px; }
      @media(max-width:1040px) { .bb { grid-template-columns:1fr; } }

      .block {
        border:1px solid rgba(148,163,184,.25);
        background:#fff;
        border-radius:16px;
        padding:14px;
      }
      .blockHead {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }

      .dropZone {
        min-height:42px;
        padding:8px;
        border-radius:14px;
        border:2px dashed rgba(148,163,184,.35);
        background:#f8fbff;
      }
      .dropZone.over {
        border-color:#7cb3ff;
        background:#eaf3ff;
      }

      .raceItem {
        border:1px solid rgba(148,163,184,.25);
        background:#fff;
        border-radius:14px;
        padding:10px;
        margin:8px 0;
        cursor:grab;
      }
      .raceItem.activeCurrent {
        border-color:var(--orange);
        box-shadow:0 0 0 3px rgba(249,115,22,.15);
      }
      .raceMeta {
        font-size:12px;
        color:var(--muted);
        margin-top:3px;
      }

      .rightCol { position:sticky; top:12px; align-self:start; }

      .subTabs {
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        margin-bottom:14px;
      }
      .subTab {
        padding:11px 14px;
        border-radius:12px;
        background:#fff;
        border:1px solid var(--line);
        font-weight:900;
        color:#0f172a;
      }
      .subTab.active {
        background:var(--blue);
        color:#fff;
        border-color:var(--blue);
      }

      .statusCard {
        border-radius:18px;
        padding:16px;
        color:#fff;
        box-shadow:var(--shadow);
      }
      .statusCard.green { background:linear-gradient(135deg,#0ea765,#18c77a); }
      .statusCard.yellow { background:linear-gradient(135deg,#d29600,#f7ba10); }
      .statusCard.blue { background:linear-gradient(135deg,#0f4cd3,#3a82ff); }
      .statusCard.orange { background:linear-gradient(135deg,#ea580c,#fb923c); }
      .statusCard.gray { background:linear-gradient(135deg,#475467,#667085); }

      .statusLabel {
        font-size:12px;
        opacity:.9;
        text-transform:uppercase;
        letter-spacing:.08em;
        font-weight:900;
      }
      .statusTitle {
        font-size:24px;
        font-weight:900;
        margin-top:5px;
        line-height:1.1;
      }

      .filters {
        display:grid;
        grid-template-columns:1.2fr .8fr .8fr;
        gap:10px;
      }
      @media(max-width:860px) { .filters { grid-template-columns:1fr; } }

      .hidden { display:none !important; }
      .actionRow { display:flex; gap:8px; flex-wrap:wrap; }
      .stackForm { display:flex; flex-direction:column; gap:14px; }
      .codeBox {
        background:#0b1220;
        color:#dbeafe;
        padding:12px;
        border-radius:12px;
        font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;
        overflow:auto;
        white-space:normal;
      }
      .resultsPodium {
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:12px;
      }
      @media(max-width:860px) { .resultsPodium { grid-template-columns:1fr; } }
      .podiumCard {
        border:1px solid var(--line);
        border-radius:16px;
        padding:14px;
        background:#fff;
      }
    </style>
  </head>
  <body>
    ${navHtml(user)}
    <div class="wrap">
      ${meetTabs(meet, activeTab)}
      ${bodyHtml}
      <div class="spacer"></div>
      <div class="note small">Data file: ${esc(DATA_FILE)}</div>
    </div>
  </body>
</html>`;
}

function publicMeetCards(db) {
  const publicMeets = (db.meets || []).filter(m => m.isPublic);

  return publicMeets.map(m => {
    const rink = (db.rinks || []).find(r => Number(r.id) === Number(m.rinkId));
    const rinkLine = m.useCustomRink
      ? [m.customRinkName, m.customRinkCity, m.customRinkState].filter(Boolean).join(' • ')
      : (rink ? `${rink.name} • ${rink.city}, ${rink.state}` : '');

    return `
      <div class="card">
        <div class="row between">
          <div>
            <h2>${esc(m.meetName || 'Meet')}</h2>
            <div class="muted">
              ${esc(m.date || 'Date TBD')}
              ${m.startTime ? ` • ${esc(m.startTime)}` : ''}
            </div>
            <div class="note">${esc(rinkLine)}</div>
          </div>
          <div class="row">
            <span class="chip">Races: ${esc((m.races || []).length)}</span>
            <span class="chip">Blocks: ${esc((m.blocks || []).length)}</span>
          </div>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <a class="btn2" href="/meet/${m.id}/register">Register</a>
          <a class="btn2" href="/meet/${m.id}/live">View Live</a>
          <a class="btn2" href="/meet/${m.id}/results">Results</a>
        </div>
      </div>
    `;
  }).join('<div class="spacer"></div>');
}

function resultsSectionHtml(section) {
  const podium = section.standings.slice(0, 3).map(row => `
    <div class="podiumCard">
      <div class="muted small">#${row.overallPlace}</div>
      <h3>${esc(row.skaterName || 'Unknown')}</h3>
      <div>${esc(row.team || '')}</div>
      ${sponsorLineHtml(row.sponsor)}
      <div class="good">${Number(row.totalPoints || 0)} pts</div>
    </div>
  `).join('');

  const raceRows = section.races.map(race => `
    <tr>
      <td>${esc(race.distanceLabel)}</td>
      <td>${esc(cap(race.division))}</td>
      <td>${esc(raceDisplayStage(race))}</td>
      <td>${esc(cap(race.startType))}</td>
      <td>${esc(race.status)}</td>
    </tr>
  `).join('');

  const standingsRows = section.standings.map(row => `
    <tr>
      <td>${row.overallPlace}</td>
      <td>
        ${esc(row.skaterName || '')}
        ${sponsorLineHtml(row.sponsor)}
      </td>
      <td>${esc(row.team || '')}</td>
      <td>${Number(row.totalPoints || 0)}</td>
    </tr>
  `).join('');

  return `
    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(section.groupLabel)} — ${esc(cap(section.division))}</h2>
          <div class="muted small">Finals-only scoring • 30 / 20 / 10 / 5</div>
        </div>
        <div class="chip">Champion: ${section.standings[0] ? esc(section.standings[0].skaterName) : '—'}</div>
      </div>

      <div class="spacer"></div>

      <div class="resultsPodium">
        ${podium || `<div class="muted">No scored finals yet.</div>`}
      </div>

      <div class="hr"></div>

      <div class="grid2">
        <div>
          <h3>Final Distances</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Distance</th>
                <th>Class</th>
                <th>Stage</th>
                <th>Start</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${raceRows || `<tr><td colspan="5" class="muted">No final races yet.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div>
          <h3>Standings</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Skater</th>
                <th>Team</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              ${standingsRows || `<tr><td colspan="4" class="muted">No standings yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

app.get('/', (req, res) => {
  const data = getSessionUser(req);

  const body = `
    <h1>SpeedSkateMeet</h1>
    <div class="grid2">
      <div class="card">
        <h2>Built for real rink race days</h2>
        <div class="muted">Meet Builder → Quad Builder → Open Builder → Block Builder → Registered → Check-In → Race Day → Results.</div>
        <div class="spacer"></div>
        <div class="row">
          <a class="btn" href="/meets">Find a Meet</a>
          <a class="btn2" href="/rinks">Find a Rink</a>
          <a class="btn2" href="/live">Live Race Day</a>
        </div>
      </div>
      <div class="card">
        <h2>Modern inline meet management</h2>
        <div class="note">
          Live results, heats, finals, quad races, open races, block scheduling, coach tools, sponsor support, QR-ready public pages, and automatic standings.
        </div>
        <div class="spacer"></div>
        ${data ? `<a class="btn" href="/portal">Go to Portal</a>` : `<a class="btn" href="/admin/login">Admin Login</a>`}
      </div>
    </div>
  `;

  res.send(pageShell({
    title: 'Home',
    user: data?.user || null,
    bodyHtml: body,
  }));
});

app.get('/meets', (req, res) => {
  const db = loadDb();
  const data = getSessionUser(req);

  res.send(pageShell({
    title: 'Find a Meet',
    user: data?.user || null,
    bodyHtml: `
      <h1>Find a Meet</h1>
      ${publicMeetCards(db) || `<div class="card"><div class="muted">No meets yet.</div></div>`}
    `,
  }));
});

app.get('/rinks', (req, res) => {
  const db = loadDb();
  const data = getSessionUser(req);

  const cards = db.rinks.map(r => `
    <div class="card">
      <div class="row between">
        <div>
          <h2>${esc(r.name)}</h2>
          <div><b>Address:</b> ${esc(r.address || '')}</div>
          <div><b>Phone:</b> ${esc(r.phone || '')}</div>
          <div><b>City/State:</b> ${esc(r.city || '')}, ${esc(r.state || '')}</div>
          <div><b>ZIP:</b> ${esc(r.zip || '')}</div>
          ${r.website ? `<div><b>Website:</b> <a href="https://${esc(r.website)}" target="_blank" rel="noreferrer">${esc(r.website)}</a></div>` : ''}
        </div>
        ${
          data?.user && (hasRole(data.user, 'super_admin') || hasRole(data.user, 'meet_director'))
            ? `<a class="btn2" href="/portal/rinks">Edit Rinks</a>`
            : ''
        }
      </div>
    </div>
  `).join('<div class="spacer"></div>');

  res.send(pageShell({
    title: 'Rinks',
    user: data?.user || null,
    bodyHtml: `<h1>Rinks</h1>${cards}`,
  }));
});

app.get('/live', (req, res) => {
  const db = loadDb();
  const data = getSessionUser(req);

  const publicMeets = (db.meets || []).filter(m => m.isPublic);
  const cards = publicMeets.map(m => {
    const rink = db.rinks.find(r => Number(r.id) === Number(m.rinkId));
    const location = m.useCustomRink
      ? [m.customRinkCity, m.customRinkState].filter(Boolean).join(', ')
      : (rink ? `${rink.city}, ${rink.state}` : '');

    return `
      <div class="card">
        <h2>${esc(m.meetName)}</h2>
        <div class="muted">${esc(location)}</div>
        <div class="spacer"></div>
        <div class="row">
          <a class="btn" href="/meet/${m.id}/live">Open Live Board</a>
          <a class="btn2" href="/meet/${m.id}/results">Results</a>
        </div>
      </div>
    `;
  }).join('<div class="spacer"></div>');

  res.send(pageShell({
    title: 'Live Race Day',
    user: data?.user || null,
    bodyHtml: `<h1>Live Race Day</h1>${cards || `<div class="card"><div class="muted">No live meets yet.</div></div>`}`,
  }));
});

app.get('/admin/login', (req, res) => {
  const body = `
    <h1>Admin Login</h1>
    <div class="card">
      <form method="POST" action="/admin/login">
        <div class="grid2">
          <div>
            <label>Username</label>
            <input name="username" autocomplete="username" required />
          </div>
          <div>
            <label>Password</label>
            <input name="password" type="password" autocomplete="current-password" required />
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Login</button>
      </form>
    </div>
  `;
  res.send(pageShell({ title: 'Admin Login', user: null, bodyHtml: body }));
});

app.post('/admin/login', (req, res) => {
  const db = loadDb();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  const user = db.users.find(
    u => u.username === username && u.password === password && u.active !== false
  );

  if (!user) {
    return res.send(pageShell({
      title: 'Admin Login',
      user: null,
      bodyHtml: `
        <h1>Admin Login</h1>
        <div class="card">
          <div class="danger">Invalid login.</div>
          <div class="spacer"></div>
          <a class="btn2" href="/admin/login">Try again</a>
        </div>
      `,
    }));
  }

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
  res.redirect('/portal');
});

app.get('/admin/logout', (req, res) => {
  const db = loadDb();
  const token = parseCookies(req)[SESSION_COOKIE];
  db.sessions = db.sessions.filter(s => s.token !== token);
  saveDb(db);
  clearCookie(res, SESSION_COOKIE);
  res.redirect('/');
});

app.get('/portal', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const visibleMeets = coachVisibleMeets(req.db, req.user);

  const cards = visibleMeets.map(meet => {
    const rink = req.db.rinks.find(r => Number(r.id) === Number(meet.rinkId));
    const standings = computeMeetStandings(meet);
    const location = meet.useCustomRink
      ? [meet.customRinkCity, meet.customRinkState].filter(Boolean).join(', ')
      : (rink ? `${rink.city}, ${rink.state}` : '');

    return `
      <div class="card">
        <div class="row between">
          <div>
            <h2 style="margin:0">${esc(meet.meetName)}</h2>
            <div class="muted small">
              ${esc(location)} • Meet ID: ${esc(meet.id)}
            </div>
            <div class="note">
              ${meet.isPublic ? 'Public meet' : 'Private meet'} • Status: ${esc(meet.status || 'draft')}
            </div>
          </div>
          <div class="row">
            <span class="chip">Races: ${esc((meet.races || []).length)}</span>
            <span class="chip">Regs: ${esc((meet.registrations || []).length)}</span>
            <span class="chip">Blocks: ${esc((meet.blocks || []).length)}</span>
            <span class="chip">Standings: ${esc(standings.length)}</span>
          </div>
        </div>
        <div class="spacer"></div>
        <div class="row">
          ${
            canEditMeet(req.user, meet)
              ? `<a class="btn" href="/portal/meet/${meet.id}/builder">Open Meet</a>`
              : `<a class="btn2" href="/portal/meet/${meet.id}/coach">Open Coach Panel</a>`
          }
          <a class="btn2" href="/meet/${meet.id}/live">Public Live</a>
          <a class="btn2" href="/portal/meet/${meet.id}/results">Results</a>
          ${
            canEditMeet(req.user, meet)
              ? `<a class="btnDanger" href="/portal/meet/${meet.id}/delete-confirm">Delete Meet</a>`
              : ''
          }
        </div>
      </div>
    `;
  }).join('<div class="spacer"></div>');

  const body = `
    <h1>Director Portal</h1>
    <div class="muted">Nothing appears until you build a meet.</div>
    <div class="spacer"></div>
    <div class="row">
      ${
        hasRole(req.user, 'super_admin') || hasRole(req.user, 'meet_director')
          ? `<form method="POST" action="/portal/create-meet"><button class="btn" type="submit">Build New Meet</button></form>`
          : ''
      }
      ${
        hasRole(req.user, 'super_admin') || hasRole(req.user, 'meet_director')
          ? `<a class="btn2" href="/portal/rinks">Add / Edit Rinks</a>`
          : ''
      }
      ${(hasRole(req.user, 'coach') || hasRole(req.user, 'super_admin') || hasRole(req.user, 'meet_director')) ? `<a class="btn2" href="/portal/coach">Coach Portal</a>` : ''}
      ${hasRole(req.user, 'super_admin') ? `<a class="btn2" href="/portal/users">Users</a>` : ''}
    </div>
    <div class="spacer"></div>
    ${cards || `<div class="card"><div class="muted">No meets yet. Click “Build New Meet”.</div></div>`}
  `;

  res.send(pageShell({
    title: 'Portal',
    user: req.user,
    bodyHtml: body,
  }));
});

app.get('/portal/coach', requireRole('coach', 'meet_director', 'super_admin'), (req, res) => {
  const meets = coachVisibleMeets(req.db, req.user);

  const cards = meets.map(meet => {
    const upcoming = coachUpcomingForMeet(meet, req.user.team);
    const recent = coachRecentResultsForMeet(meet, req.user.team);
    const regs = coachTeamRegistrations(meet, req.user.team);

    return `
      <div class="card">
        <div class="row between">
          <div>
            <h2 style="margin:0">${esc(meet.meetName)}</h2>
            <div class="muted small">${esc(req.user.team || '')}</div>
            <div class="note">${esc(meet.date || '')} ${meet.startTime ? `• ${esc(meet.startTime)}` : ''}</div>
          </div>
          <div class="row">
            <span class="chip">My Skaters: ${regs.length}</span>
            <span class="chip">Racing Soon: ${upcoming.length}</span>
          </div>
        </div>

        <div class="spacer"></div>

        <div class="row">
          <a class="btn" href="/portal/meet/${meet.id}/coach">Open Coach Panel</a>
          <a class="btn2" href="/meet/${meet.id}/live">Public Live</a>
          <a class="btn2" href="/meet/${meet.id}/results">Public Results</a>
        </div>

        ${
          upcoming.length
            ? `
              <div class="hr"></div>
              <h3>Racing Soon</h3>
              ${upcoming.slice(0, 3).map(item => `
                <div class="groupCard">
                  <div style="font-weight:900">${item.skaters.map(s => esc(s.skaterName)).join(', ')}</div>
                  <div class="muted">${esc(item.race.groupLabel)} • ${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)} • ${esc(raceDisplayStage(item.race))}</div>
                  <div class="good">${esc(racingSoonLabel(item.delta))}</div>
                </div>
              `).join('<div class="spacer"></div>')}
            `
            : `
              <div class="hr"></div>
              <div class="muted">No team races queued right now.</div>
            `
        }

        ${
          recent.length
            ? `
              <div class="hr"></div>
              <h3>Recent Team Results</h3>
              ${recent.slice(0, 2).map(item => `
                <div class="groupCard">
                  <div style="font-weight:900">${esc(item.race.groupLabel)} • ${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)}</div>
                  ${item.skaters.map(sk => `
                    <div class="note">
                      ${esc(sk.skaterName || '')} ${sk.place ? `• Place ${esc(sk.place)}` : ''} ${sk.time ? `• ${esc(sk.time)}` : ''}
                    </div>
                  `).join('')}
                </div>
              `).join('<div class="spacer"></div>')}
            `
            : ''
        }
      </div>
    `;
  }).join('<div class="spacer"></div>');

  res.send(pageShell({
    title: 'Coach Portal',
    user: req.user,
    bodyHtml: `
      <h1>Coach Portal</h1>
      <div class="muted">Track your team, see who is racing soon, and follow results without digging through the full meet.</div>
      <div class="spacer"></div>
      ${cards || `<div class="card"><div class="muted">No meets found yet for ${esc(req.user.team || 'your team')}.</div></div>`}
    `,
  }));
});

app.get('/portal/meet/:meetId/coach', requireRole('coach', 'meet_director', 'super_admin'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const team = String(req.user.team || '').trim();
  const regs = coachTeamRegistrations(meet, team);
  const upcoming = coachUpcomingForMeet(meet, team);
  const recent = coachRecentResultsForMeet(meet, team);
  const standings = coachStandingsForMeet(meet, team);

  const info = currentRaceInfo(meet);

  const rosterRows = regs.map(reg => {
    const assignedRaces = orderedRaces(meet).filter(r =>
      (r.laneEntries || []).some(le => Number(le.registrationId) === Number(reg.id))
    );

    return `
      <tr>
        <td>
          ${esc(reg.name)}
          ${sponsorLineHtml(reg.sponsor || '')}
          ${buildEntrySummaryHtml(reg)}
        </td>
        <td>${esc(reg.divisionGroupLabel || '')}</td>
        <td>${buildEntryTypeList(reg).join(', ') || '—'}</td>
        <td>${reg.helmetNumber ? '#' + esc(reg.helmetNumber) : ''}</td>
        <td>${reg.checkedIn ? '✔' : '—'}</td>
        <td>${reg.paid ? '✔' : '—'}</td>
        <td>
          ${assignedRaces.slice(0, 3).map(r => `
            <div class="note">${esc(cap(r.division))} • ${esc(r.distanceLabel)} • ${esc(raceDisplayStage(r))}</div>
          `).join('') || `<span class="muted">None</span>`}
        </td>
      </tr>
    `;
  }).join('');

  const upcomingCards = upcoming.map(item => `
    <div class="groupCard">
      <div class="row between">
        <div>
          <div style="font-weight:900">${esc(item.race.groupLabel)} • ${esc(cap(item.race.division))}</div>
          <div class="muted">${esc(item.race.distanceLabel)} • ${esc(raceDisplayStage(item.race))}</div>
          <div class="note">${esc(item.race.blockName || 'Unassigned')} ${item.race.blockDay ? `• ${esc(item.race.blockDay)}` : ''}</div>
        </div>
        <div class="chip">${esc(racingSoonLabel(item.delta))}</div>
      </div>

      <div class="spacer"></div>

      ${item.skaters.map(sk => {
        const reg = regs.find(r => Number(r.id) === Number(sk.registrationId));
        return `
          <div style="padding:8px 0;border-top:1px solid var(--line)">
            <div style="font-weight:900">${sk.helmetNumber ? '#' + esc(sk.helmetNumber) + ' ' : ''}${esc(sk.skaterName)}</div>
            <div class="muted">${esc(sk.team || '')}</div>
            ${sponsorLineHtml(reg?.sponsor || '')}
            ${buildEntrySummaryHtml(reg || {})}
          </div>
        `;
      }).join('')}
    </div>
  `).join('<div class="spacer"></div>');

  const recentCards = recent.map(item => `
    <div class="groupCard">
      <div style="font-weight:900">${esc(item.race.groupLabel)} • ${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)} • ${esc(raceDisplayStage(item.race))}</div>
      <div class="note">${esc(item.race.closedAt || '')}</div>
      <div class="spacer"></div>
      ${item.skaters
        .sort((a, b) => Number(a.place || 999) - Number(b.place || 999))
        .map(sk => {
          const reg = regs.find(r => Number(r.id) === Number(sk.registrationId));
          return `
            <div style="padding:8px 0;border-top:1px solid var(--line)">
              <div style="font-weight:900">
                ${sk.place ? esc(sk.place) + '. ' : ''}${esc(sk.skaterName || '')}
              </div>
              <div class="muted">${esc(sk.team || '')}${sk.time ? ` • ${esc(sk.time)}` : ''}</div>
              ${sponsorLineHtml(reg?.sponsor || '')}
            </div>
          `;
        }).join('')}
    </div>
  `).join('<div class="spacer"></div>');

  const standingsCards = standings.map(section => `
    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(section.groupLabel)} — ${esc(cap(section.division))}</h2>
          <div class="muted small">Your team standings only</div>
        </div>
      </div>

      <div class="spacer"></div>

      <table class="table">
        <thead>
          <tr>
            <th>Place</th>
            <th>Skater</th>
            <th>Team</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          ${section.standings.map(row => `
            <tr>
              <td>${row.overallPlace}</td>
              <td>
                ${esc(row.skaterName || '')}
                ${sponsorLineHtml(row.sponsor || '')}
              </td>
              <td>${esc(row.team || '')}</td>
              <td>${Number(row.totalPoints || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('<div class="spacer"></div>');

  const body = `
    <h1>Coach Panel</h1>
    <div class="row between">
      <div>
        <div class="muted">${esc(meet.meetName)}</div>
        <h2 style="margin:6px 0 0">${esc(team || 'Coach Team')}</h2>
      </div>
      <div class="row">
        <span class="chip">Current Race: ${info.current ? esc(info.current.groupLabel) + ' • ' + esc(cap(info.current.division)) : '—'}</span>
        <a class="btn2" href="/portal/coach">Back to Coach Portal</a>
      </div>
    </div>

    <div class="spacer"></div>

    <div class="grid2">
      <div class="card">
        <h2>My Skaters Racing Soon</h2>
        <div class="muted">The fastest way to know when your skaters need to be ready.</div>
        <div class="spacer"></div>
        ${upcomingCards || `<div class="muted">No upcoming races for ${esc(team)} right now.</div>`}
      </div>

      <div class="card">
        <h2>Recent Team Results</h2>
        <div class="muted">Closed races involving your skaters.</div>
        <div class="spacer"></div>
        ${recentCards || `<div class="muted">No closed races yet for ${esc(team)}.</div>`}
      </div>
    </div>

    <div class="spacer"></div>

    <div class="card">
      <h2>Team Roster</h2>
      <div class="muted">Skaters, classes, sponsor, helmet, and assigned races.</div>
      <div class="spacer"></div>
      <table class="table">
        <thead>
          <tr>
            <th>Skater</th>
            <th>Division</th>
            <th>Classes</th>
            <th>Helmet</th>
            <th>Checked In</th>
            <th>Paid</th>
            <th>Assigned Races</th>
          </tr>
        </thead>
        <tbody>
          ${rosterRows || `<tr><td colspan="7" class="muted">No team skaters found.</td></tr>`}
        </tbody>
      </table>
    </div>

    ${standingsCards ? `<div class="spacer"></div><h1 style="font-size:30px">My Team Standings</h1>${standingsCards}` : ''}
  `;

  res.send(pageShell({
    title: 'Coach Panel',
    user: req.user,
    meet,
    bodyHtml: body,
  }));
});

app.post('/portal/create-meet', requireRole('meet_director'), (req, res) => {
  const meet = defaultMeet(req.user.id);
  meet.id = nextId(req.db.meets);
  req.db.meets.push(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.get('/portal/meet/:meetId/delete-confirm', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const body = `
    <h1>Delete Meet</h1>
    <div class="card">
      <div class="danger">
        This will permanently delete this meet and all of its races, blocks, and registrations.
      </div>
      <div class="spacer"></div>
      <h2>${esc(meet.meetName)}</h2>
      <div class="spacer"></div>
      <form method="POST" action="/portal/meet/${meet.id}/delete">
        <button class="btnDanger" type="submit">Delete Meet Permanently</button>
        <a class="btn2" href="/portal">Cancel</a>
      </form>
    </div>
  `;

  res.send(pageShell({
    title: 'Delete Meet',
    user: req.user,
    bodyHtml: body,
  }));
});

app.post('/portal/meet/:meetId/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  req.db.meets = req.db.meets.filter(m => Number(m.id) !== Number(req.params.meetId));
  saveDb(req.db);
  res.redirect('/portal');
});

app.get('/portal/users', requireRole('super_admin'), (req, res) => {
  const rows = req.db.users.map(u => `
    <tr>
      <td>${esc(u.displayName || u.username)}</td>
      <td>${esc(u.username)}</td>
      <td>${esc((u.roles || []).join(', '))}</td>
      <td>${esc(u.team || '')}</td>
      <td>${u.active === false ? 'Off' : 'On'}</td>
    </tr>
  `).join('');

  const body = `
    <h1>Users</h1>
    <div class="card">
      <form method="POST" action="/portal/users/new">
        <div class="grid4">
          <div>
            <label>Name</label>
            <input name="displayName" required />
          </div>
          <div>
            <label>Username</label>
            <input name="username" required />
          </div>
          <div>
            <label>Password / PIN</label>
            <input name="password" required />
          </div>
          <div>
            <label>Team</label>
            <input name="team" list="teams-users" value="Midwest Racing" />
          </div>
        </div>

        <datalist id="teams-users">
          ${TEAM_LIST.map(t => `<option value="${esc(t)}"></option>`).join('')}
        </datalist>

        <div class="spacer"></div>
        <div class="row">
          <label><input type="checkbox" name="roles" value="meet_director" /> Meet Director</label>
          <label><input type="checkbox" name="roles" value="judge" /> Judge</label>
          <label><input type="checkbox" name="roles" value="coach" /> Coach</label>
        </div>

        <div class="spacer"></div>
        <button class="btn" type="submit">Add User</button>
      </form>

      <div class="hr"></div>

      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Roles</th>
            <th>Team</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  res.send(pageShell({
    title: 'Users',
    user: req.user,
    bodyHtml: body,
  }));
});

app.post('/portal/users/new', requireRole('super_admin'), (req, res) => {
  const rolesRaw = req.body.roles;
  const roles = Array.isArray(rolesRaw) ? rolesRaw : (rolesRaw ? [rolesRaw] : []);

  req.db.users.push({
    id: nextId(req.db.users),
    displayName: String(req.body.displayName || '').trim(),
    username: String(req.body.username || '').trim(),
    password: String(req.body.password || '').trim(),
    team: String(req.body.team || 'Midwest Racing').trim(),
    roles,
    active: true,
    createdAt: nowIso(),
  });

  saveDb(req.db);
  res.redirect('/portal/users');
});

function rinkForm(rink, action, title) {
  return `
    <h1>${esc(title)}</h1>
    <div class="card">
      <form method="POST" action="${action}">
        <div class="grid2">
          <div>
            <label>Name</label>
            <input name="name" value="${esc(rink.name || '')}" required />
          </div>
          <div>
            <label>Phone</label>
            <input name="phone" value="${esc(rink.phone || '')}" />
          </div>
          <div>
            <label>Address</label>
            <input name="address" value="${esc(rink.address || '')}" />
          </div>
          <div>
            <label>Website</label>
            <input name="website" value="${esc(rink.website || '')}" />
          </div>
          <div>
            <label>City</label>
            <input name="city" value="${esc(rink.city || '')}" />
          </div>
          <div>
            <label>State</label>
            <input name="state" value="${esc(rink.state || '')}" />
          </div>
          <div>
            <label>ZIP (optional)</label>
            <input name="zip" value="${esc(rink.zip || '')}" />
          </div>
          <div>
            <label>Team</label>
            <input name="team" value="${esc(rink.team || '')}" />
          </div>
        </div>

        <div class="spacer"></div>

        <label>Notes</label>
        <textarea name="notes">${esc(rink.notes || '')}</textarea>

        <div class="spacer"></div>

        <button class="btn" type="submit">Save Rink</button>
        <a class="btn2" href="/portal/rinks">Back</a>
      </form>
    </div>
  `;
}

app.get('/portal/rinks', requireRole('meet_director'), (req, res) => {
  const rows = req.db.rinks.map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.city || '')}, ${esc(r.state || '')}</td>
      <td>${esc(r.zip || '')}</td>
      <td>${esc(r.phone || '')}</td>
      <td><a class="btn2 small" href="/portal/rinks/${r.id}/edit">Edit</a></td>
    </tr>
  `).join('');

  const body = `
    <h1>Rink Admin</h1>
    <div class="card">
      <div class="row between">
        <h2 style="margin:0">Rinks</h2>
        <a class="btn" href="/portal/rinks/new">Add Rink</a>
      </div>

      <div class="spacer"></div>

      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>City/State</th>
            <th>ZIP</th>
            <th>Phone</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  res.send(pageShell({
    title: 'Rink Admin',
    user: req.user,
    bodyHtml: body,
  }));
});

app.get('/portal/rinks/new', requireRole('meet_director'), (req, res) => {
  res.send(pageShell({
    title: 'Add Rink',
    user: req.user,
    bodyHtml: rinkForm({}, '/portal/rinks/new', 'Add Rink'),
  }));
});

app.post('/portal/rinks/new', requireRole('meet_director'), (req, res) => {
  req.db.rinks.push({
    id: nextId(req.db.rinks),
    name: String(req.body.name || '').trim(),
    phone: String(req.body.phone || '').trim(),
    address: String(req.body.address || '').trim(),
    website: String(req.body.website || '').trim(),
    city: String(req.body.city || '').trim(),
    state: String(req.body.state || '').trim(),
    zip: String(req.body.zip || '').trim(),
    team: String(req.body.team || '').trim(),
    notes: String(req.body.notes || '').trim(),
  });

  sanitizeRinks(req.db);
  saveDb(req.db);
  res.redirect('/portal/rinks');
});

app.get('/portal/rinks/:id/edit', requireRole('meet_director'), (req, res) => {
  const rink = req.db.rinks.find(r => Number(r.id) === Number(req.params.id));
  if (!rink) return res.redirect('/portal/rinks');

  res.send(pageShell({
    title: 'Edit Rink',
    user: req.user,
    bodyHtml: rinkForm(rink, `/portal/rinks/${rink.id}/edit`, 'Edit Rink'),
  }));
});

app.post('/portal/rinks/:id/edit', requireRole('meet_director'), (req, res) => {
  const rink = req.db.rinks.find(r => Number(r.id) === Number(req.params.id));
  if (!rink) return res.redirect('/portal/rinks');

  Object.assign(rink, {
    name: String(req.body.name || '').trim(),
    phone: String(req.body.phone || '').trim(),
    address: String(req.body.address || '').trim(),
    website: String(req.body.website || '').trim(),
    city: String(req.body.city || '').trim(),
    state: String(req.body.state || '').trim(),
    zip: String(req.body.zip || '').trim(),
    team: String(req.body.team || '').trim(),
    notes: String(req.body.notes || '').trim(),
  });

  sanitizeRinks(req.db);
  saveDb(req.db);
  res.redirect('/portal/rinks');
});function quadBuilderCardsHtml(meet) {
  return (meet.quadGroups || []).map((group, gi) => `
    <div class="card">
      <div class="row between">
        <div>
          <h3>${esc(group.label)}</h3>
          <div class="muted">${esc(group.ages)}</div>
        </div>
        <label style="margin:0">
          <input type="checkbox" name="q_${gi}_enabled" ${group.enabled ? 'checked' : ''} />
          Enabled
        </label>
      </div>

      <div class="spacer"></div>

      <div class="grid3">
        <div>
          <label>Cost</label>
          <input name="q_${gi}_cost" value="${esc(group.cost || 0)}" />
        </div>
        <div>
          <label>Distance 1</label>
          <input name="q_${gi}_d1" value="${esc(group.distances?.[0] || '')}" />
        </div>
        <div>
          <label>Distance 2</label>
          <input name="q_${gi}_d2" value="${esc(group.distances?.[1] || '')}" />
        </div>
      </div>

      <div class="spacer"></div>
      <div class="note">Quad builder is separate from standard divisions and registration uses its own quad checkbox.</div>
    </div>
  `).join('<div class="spacer"></div>');
}

function openBuilderCardsHtml(meet) {
  return (meet.openGroups || []).map((group, gi) => `
    <div class="card">
      <div class="row between">
        <div>
          <h3>${esc(group.label)}</h3>
          <div class="muted">${esc(group.ages)}</div>
        </div>
        <label style="margin:0">
          <input type="checkbox" name="o_${gi}_enabled" ${group.enabled ? 'checked' : ''} />
          Enabled
        </label>
      </div>

      <div class="spacer"></div>

      <div class="grid3">
        <div>
          <label>Cost</label>
          <input name="o_${gi}_cost" value="${esc(group.cost || 0)}" />
        </div>
        <div>
          <label>Distance 1</label>
          <input name="o_${gi}_d1" value="${esc(group.distances?.[0] || '')}" />
        </div>
        <div>
          <label>Distance 2</label>
          <input name="o_${gi}_d2" value="${esc(group.distances?.[1] || '')}" />
        </div>
      </div>

      <div class="spacer"></div>
      <div class="note">Open runs separate from standard divisions and does not live in the standard division cards anymore.</div>
    </div>
  `).join('<div class="spacer"></div>');
}

app.get('/portal/meet/:meetId/builder', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  if (!canEditMeet(req.user, meet)) {
    return res.status(403).send(pageShell({
      title: 'Forbidden',
      user: req.user,
      bodyHtml: `
        <h1>Forbidden</h1>
        <div class="card">
          <div class="danger">Only the meet owner can edit this meet.</div>
        </div>
      `,
    }));
  }

  const rinkOptions = req.db.rinks.map(r => `
    <option value="${r.id}" ${Number(meet.rinkId) === Number(r.id) ? 'selected' : ''}>
      ${esc(r.name)} (${esc(r.city || '')}, ${esc(r.state || '')})
    </option>
  `).join('');

  const groupsHtml = meet.groups.map((group, gi) => {
    const divCards = ['novice', 'elite'].map(divKey => {
      const div = group.divisions[divKey];
      return `
        <div class="groupCard">
          <div class="row between">
            <label style="margin:0">
              <input type="checkbox" name="g_${gi}_${divKey}_enabled" ${div.enabled ? 'checked' : ''} />
              ${divKey.toUpperCase()}
            </label>
            <div style="min-width:140px">
              <label>Cost</label>
              <input name="g_${gi}_${divKey}_cost" value="${esc(div.cost)}" />
            </div>
          </div>

          <div class="spacer"></div>

          <div class="grid4">
            <div>
              <label>D1</label>
              <input name="g_${gi}_${divKey}_d1" value="${esc(div.distances[0] || '')}" />
            </div>
            <div>
              <label>D2</label>
              <input name="g_${gi}_${divKey}_d2" value="${esc(div.distances[1] || '')}" />
            </div>
            <div>
              <label>D3</label>
              <input name="g_${gi}_${divKey}_d3" value="${esc(div.distances[2] || '')}" />
            </div>
            <div>
              <label>D4</label>
              <input name="g_${gi}_${divKey}_d4" value="${esc(div.distances[3] || '')}" />
            </div>
          </div>
        </div>
      `;
    }).join('<div class="spacer"></div>');

    return `
      <div class="card">
        <div class="row between">
          <div>
            <h3>${esc(group.label)}</h3>
            <div class="muted">${esc(group.ages)}</div>
          </div>
        </div>
        <div class="hr"></div>
        ${divCards}
      </div>
    `;
  }).join('<div class="spacer"></div>');

  const body = `
    <h1>Meet Builder</h1>
    <form method="POST" action="/portal/meet/${meet.id}/builder/save" class="stackForm">
      <div class="card">
        <div class="row between">
          <h2 style="margin:0">Meet Setup</h2>
          <div class="actionRow">
            <button class="btn" type="submit">Save Meet</button>
            <button class="btnDanger" type="submit" formaction="/portal/meet/${meet.id}/builder/rebuild" onclick="return confirmRebuild(${hasExistingSchedule(meet) ? 'true' : 'false'})">Rebuild Race List</button>
          </div>
        </div>

        <div class="spacer"></div>

        <div class="grid3">
          <div>
            <label>Meet Name</label>
            <input name="meetName" value="${esc(meet.meetName)}" required />
          </div>

          <div>
            <label>Date</label>
            <input type="date" name="date" value="${esc(meet.date)}" />
          </div>

          <div>
            <label>Start Time</label>
            <input type="time" name="startTime" value="${esc(meet.startTime)}" />
          </div>

          <div>
            <label>Registration Close Date</label>
            <input type="date" name="registrationCloseDate" value="${esc(meet.registrationCloseAt ? meet.registrationCloseAt.slice(0, 10) : '')}" />
          </div>

          <div>
            <label>Registration Close Time</label>
            <input type="time" name="registrationCloseTime" value="${esc(meet.registrationCloseAt ? meet.registrationCloseAt.slice(11, 16) : '')}" />
          </div>

          <div>
            <label>Status</label>
            <select name="status">
              <option value="draft" ${meet.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="published" ${meet.status === 'published' ? 'selected' : ''}>Published</option>
              <option value="live" ${meet.status === 'live' ? 'selected' : ''}>Live</option>
              <option value="complete" ${meet.status === 'complete' ? 'selected' : ''}>Complete</option>
            </select>
          </div>

          <div>
            <label>Track Length</label>
            <input name="trackLength" value="${esc(meet.trackLength)}" />
          </div>

          <div>
            <label>Lanes</label>
            <input name="lanes" value="${esc(meet.lanes)}" />
          </div>
        </div>

        <div class="hr"></div>

        <div class="grid2">
          <div class="builderSection">
            <label style="margin:0">
              <input type="radio" name="rinkMode" value="saved" ${!meet.useCustomRink ? 'checked' : ''} />
              Use Saved Rink
            </label>
            <div class="spacer"></div>
            <label>Rink</label>
            <select name="rinkId">${rinkOptions}</select>
          </div>

          <div class="builderSection">
            <label style="margin:0">
              <input type="radio" name="rinkMode" value="custom" ${meet.useCustomRink ? 'checked' : ''} />
              Use Custom Rink
            </label>
            <div class="spacer"></div>
            <div class="grid3">
              <div>
                <label>Custom Rink Name</label>
                <input name="customRinkName" value="${esc(meet.customRinkName || '')}" />
              </div>
              <div>
                <label>Custom City</label>
                <input name="customRinkCity" value="${esc(meet.customRinkCity || '')}" />
              </div>
              <div>
                <label>Custom State</label>
                <input name="customRinkState" value="${esc(meet.customRinkState || '')}" />
              </div>
            </div>
          </div>
        </div>

        <div class="hr"></div>

        <div class="row">
          <label><input type="checkbox" name="quadEnabled" ${meet.quadEnabled ? 'checked' : ''} /> Quad</label>
          <label><input type="checkbox" name="openEnabled" ${meet.openEnabled ? 'checked' : ''} /> Open</label>
          <label><input type="checkbox" name="timeTrialsEnabled" ${meet.timeTrialsEnabled ? 'checked' : ''} /> Time Trials</label>
          <label><input type="checkbox" name="relayEnabled" ${meet.relayEnabled ? 'checked' : ''} /> Relays</label>
          <label><input type="checkbox" name="judgesPanelRequired" ${meet.judgesPanelRequired ? 'checked' : ''} /> Judges Panel Required</label>
          <label><input type="checkbox" name="isPublic" ${meet.isPublic ? 'checked' : ''} /> Show on Find a Meet</label>
        </div>

        <div class="spacer"></div>

        <label>Meet Notes</label>
        <textarea name="notes">${esc(meet.notes || '')}</textarea>

        <div class="spacer"></div>

        <label>Relay Notes</label>
        <textarea name="relayNotes">${esc(meet.relayNotes || '')}</textarea>
      </div>

      ${groupsHtml}

      <div class="card">
        <div class="row between">
          <div class="muted">
            Standard divisions now contain Novice and Elite only. Open and Quad are managed from their own builder tabs.
          </div>
          <div class="actionRow">
            <button class="btn" type="submit">Save Meet</button>
            <button class="btnDanger" type="submit" formaction="/portal/meet/${meet.id}/builder/rebuild" onclick="return confirmRebuild(${hasExistingSchedule(meet) ? 'true' : 'false'})">Rebuild Race List</button>
          </div>
        </div>
      </div>
    </form>

    <script>
      function confirmRebuild(hasSchedule) {
        if (!hasSchedule) return confirm('Rebuild race list now?');
        return confirm(
          'Rebuild Race List?\\n\\n' +
          'This will clear block race assignments and rebuild race sets from the current meet setup and registrations.\\n\\n' +
          'Use Save Meet when you only want to save settings without wiping schedule work.'
        );
      }
    </script>
  `;

  res.send(pageShell({
    title: 'Meet Builder',
    user: req.user,
    meet,
    activeTab: 'builder',
    bodyHtml: body,
  }));
});

app.post('/portal/meet/:meetId/builder/save', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  meet.meetName = String(req.body.meetName || 'New Meet').trim();
  meet.date = String(req.body.date || '').trim();
  meet.startTime = String(req.body.startTime || '').trim();
  meet.registrationCloseAt = combineDateTime(req.body.registrationCloseDate, req.body.registrationCloseTime);

  meet.rinkId = Number(req.body.rinkId || 1);
  meet.useCustomRink = String(req.body.rinkMode || 'saved') === 'custom';
  meet.customRinkName = String(req.body.customRinkName || '').trim();
  meet.customRinkCity = String(req.body.customRinkCity || '').trim();
  meet.customRinkState = String(req.body.customRinkState || '').trim();

  meet.trackLength = Number(req.body.trackLength || 100);
  meet.lanes = Number(req.body.lanes || 4);

  meet.quadEnabled = !!req.body.quadEnabled;
  meet.openEnabled = !!req.body.openEnabled;
  meet.timeTrialsEnabled = !!req.body.timeTrialsEnabled;
  meet.relayEnabled = !!req.body.relayEnabled;
  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;

  meet.isPublic = !!req.body.isPublic;
  meet.status = String(req.body.status || 'draft');

  meet.notes = String(req.body.notes || '');
  meet.relayNotes = String(req.body.relayNotes || '');

  meet.groups.forEach((group, gi) => {
    for (const divKey of ['novice', 'elite']) {
      const enabled = !!req.body[`g_${gi}_${divKey}_enabled`];
      const cost = Number(String(req.body[`g_${gi}_${divKey}_cost`] || '0').trim() || 0);
      const d1 = String(req.body[`g_${gi}_${divKey}_d1`] || '').trim();
      const d2 = String(req.body[`g_${gi}_${divKey}_d2`] || '').trim();
      const d3 = String(req.body[`g_${gi}_${divKey}_d3`] || '').trim();
      const d4 = String(req.body[`g_${gi}_${divKey}_d4`] || '').trim();

      group.divisions[divKey] = {
        enabled,
        cost,
        distances: [d1, d2, d3, d4],
      };
    }

    group.divisions.open = {
      enabled: false,
      cost: 0,
      distances: ['', '', '', ''],
    };
  });

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.post('/portal/meet/:meetId/builder/rebuild', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  meet.meetName = String(req.body.meetName || 'New Meet').trim();
  meet.date = String(req.body.date || '').trim();
  meet.startTime = String(req.body.startTime || '').trim();
  meet.registrationCloseAt = combineDateTime(req.body.registrationCloseDate, req.body.registrationCloseTime);

  meet.rinkId = Number(req.body.rinkId || 1);
  meet.useCustomRink = String(req.body.rinkMode || 'saved') === 'custom';
  meet.customRinkName = String(req.body.customRinkName || '').trim();
  meet.customRinkCity = String(req.body.customRinkCity || '').trim();
  meet.customRinkState = String(req.body.customRinkState || '').trim();

  meet.trackLength = Number(req.body.trackLength || 100);
  meet.lanes = Number(req.body.lanes || 4);

  meet.quadEnabled = !!req.body.quadEnabled;
  meet.openEnabled = !!req.body.openEnabled;
  meet.timeTrialsEnabled = !!req.body.timeTrialsEnabled;
  meet.relayEnabled = !!req.body.relayEnabled;
  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;

  meet.isPublic = !!req.body.isPublic;
  meet.status = String(req.body.status || 'draft');

  meet.notes = String(req.body.notes || '');
  meet.relayNotes = String(req.body.relayNotes || '');

  meet.groups.forEach((group, gi) => {
    for (const divKey of ['novice', 'elite']) {
      const enabled = !!req.body[`g_${gi}_${divKey}_enabled`];
      const cost = Number(String(req.body[`g_${gi}_${divKey}_cost`] || '0').trim() || 0);
      const d1 = String(req.body[`g_${gi}_${divKey}_d1`] || '').trim();
      const d2 = String(req.body[`g_${gi}_${divKey}_d2`] || '').trim();
      const d3 = String(req.body[`g_${gi}_${divKey}_d3`] || '').trim();
      const d4 = String(req.body[`g_${gi}_${divKey}_d4`] || '').trim();

      group.divisions[divKey] = {
        enabled,
        cost,
        distances: [d1, d2, d3, d4],
      };
    }

    group.divisions.open = {
      enabled: false,
      cost: 0,
      distances: ['', '', '', ''],
    };
  });

  generateBaseRacesForMeet(meet);
  rebuildRaceAssignments(meet);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.get('/portal/meet/:meetId/quad-builder', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  if (!canEditMeet(req.user, meet)) {
    return res.status(403).send(pageShell({
      title: 'Forbidden',
      user: req.user,
      bodyHtml: `
        <h1>Forbidden</h1>
        <div class="card">
          <div class="danger">Only the meet owner can edit this meet.</div>
        </div>
      `,
    }));
  }

  const body = `
    <h1>Quad Builder</h1>
    <form method="POST" action="/portal/meet/${meet.id}/quad-builder/save" class="stackForm">
      <div class="card">
        <div class="row between">
          <h2 style="margin:0">Quad Setup</h2>
          <div class="actionRow">
            <button class="btn" type="submit">Save Quad Builder</button>
            <button class="btnDanger" type="submit" formaction="/portal/meet/${meet.id}/quad-builder/rebuild" onclick="return confirmRebuild(${hasExistingSchedule(meet) ? 'true' : 'false'})">Save & Rebuild</button>
          </div>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <label><input type="checkbox" name="quadEnabled" ${meet.quadEnabled ? 'checked' : ''} /> Enable Quad Races For This Meet</label>
        </div>
      </div>

      ${quadBuilderCardsHtml(meet)}

      <script>
        function confirmRebuild(hasSchedule) {
          if (!hasSchedule) return confirm('Save and rebuild quad races now?');
          return confirm('Save and rebuild race list? This clears block race assignments and rebuilds from current setup.');
        }
      </script>
    </form>
  `;

  res.send(pageShell({
    title: 'Quad Builder',
    user: req.user,
    meet,
    activeTab: 'quad-builder',
    bodyHtml: body,
  }));
});

app.post('/portal/meet/:meetId/quad-builder/save', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  meet.quadEnabled = !!req.body.quadEnabled;

  (meet.quadGroups || []).forEach((group, gi) => {
    group.enabled = !!req.body[`q_${gi}_enabled`];
    group.cost = Number(String(req.body[`q_${gi}_cost`] || '0').trim() || 0);
    group.distances = [
      String(req.body[`q_${gi}_d1`] || '').trim(),
      String(req.body[`q_${gi}_d2`] || '').trim(),
    ];
  });

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/quad-builder`);
});

app.post('/portal/meet/:meetId/quad-builder/rebuild', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  meet.quadEnabled = !!req.body.quadEnabled;

  (meet.quadGroups || []).forEach((group, gi) => {
    group.enabled = !!req.body[`q_${gi}_enabled`];
    group.cost = Number(String(req.body[`q_${gi}_cost`] || '0').trim() || 0);
    group.distances = [
      String(req.body[`q_${gi}_d1`] || '').trim(),
      String(req.body[`q_${gi}_d2`] || '').trim(),
    ];
  });

  generateBaseRacesForMeet(meet);
  rebuildRaceAssignments(meet);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.get('/portal/meet/:meetId/open-builder', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  if (!canEditMeet(req.user, meet)) {
    return res.status(403).send(pageShell({
      title: 'Forbidden',
      user: req.user,
      bodyHtml: `
        <h1>Forbidden</h1>
        <div class="card">
          <div class="danger">Only the meet owner can edit this meet.</div>
        </div>
      `,
    }));
  }

  const body = `
    <h1>Open Builder</h1>
    <form method="POST" action="/portal/meet/${meet.id}/open-builder/save" class="stackForm">
      <div class="card">
        <div class="row between">
          <h2 style="margin:0">Open Setup</h2>
          <div class="actionRow">
            <button class="btn" type="submit">Save Open Builder</button>
            <button class="btnDanger" type="submit" formaction="/portal/meet/${meet.id}/open-builder/rebuild" onclick="return confirmRebuild(${hasExistingSchedule(meet) ? 'true' : 'false'})">Save & Rebuild</button>
          </div>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <label><input type="checkbox" name="openEnabled" ${meet.openEnabled ? 'checked' : ''} /> Enable Open Races For This Meet</label>
        </div>
      </div>

      ${openBuilderCardsHtml(meet)}

      <script>
        function confirmRebuild(hasSchedule) {
          if (!hasSchedule) return confirm('Save and rebuild open races now?');
          return confirm('Save and rebuild race list? This clears block race assignments and rebuilds from current setup.');
        }
      </script>
    </form>
  `;

  res.send(pageShell({
    title: 'Open Builder',
    user: req.user,
    meet,
    activeTab: 'open-builder',
    bodyHtml: body,
  }));
});

app.post('/portal/meet/:meetId/open-builder/save', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  meet.openEnabled = !!req.body.openEnabled;

  (meet.openGroups || []).forEach((group, gi) => {
    group.enabled = !!req.body[`o_${gi}_enabled`];
    group.cost = Number(String(req.body[`o_${gi}_cost`] || '0').trim() || 0);
    group.distances = [
      String(req.body[`o_${gi}_d1`] || '').trim(),
      String(req.body[`o_${gi}_d2`] || '').trim(),
    ];
  });

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/open-builder`);
});

app.post('/portal/meet/:meetId/open-builder/rebuild', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  meet.openEnabled = !!req.body.openEnabled;

  (meet.openGroups || []).forEach((group, gi) => {
    group.enabled = !!req.body[`o_${gi}_enabled`];
    group.cost = Number(String(req.body[`o_${gi}_cost`] || '0').trim() || 0);
    group.distances = [
      String(req.body[`o_${gi}_d1`] || '').trim(),
      String(req.body[`o_${gi}_d2`] || '').trim(),
    ];
  });

  generateBaseRacesForMeet(meet);
  rebuildRaceAssignments(meet);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.get('/meet/:meetId/register', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  const data = getSessionUser(req);

  if (!meet) return res.redirect('/meets');
  if (!meet.isPublic) return res.redirect('/meets');

  const closed = isRegistrationClosed(meet);

  const body = `
    <h1>Register</h1>
    <div class="card">
      <h2>${esc(meet.meetName)}</h2>
      <div class="muted">${esc(meet.date || '')} ${meet.startTime ? `• ${esc(meet.startTime)}` : ''}</div>
      <div class="spacer"></div>

      ${
        closed
          ? `<div class="danger">Registration Closed</div>`
          : `
            <form method="POST" action="/meet/${meet.id}/register">
              <div class="grid3">
                <div>
                  <label>Skater Name</label>
                  <input name="name" required />
                </div>
                <div>
                  <label>Age</label>
                  <input name="age" required />
                </div>
                <div>
                  <label>Gender</label>
                  <select name="gender">
                    <option value="boys">Boy</option>
                    <option value="girls">Girl</option>
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                  </select>
                  <div class="note">Note: Ages 16+ are listed as Men/Women divisions.</div>
                </div>
                <div>
                  <label>Team</label>
                  <input name="team" list="teams-register" value="Midwest Racing" />
                </div>
                <div>
                  <label>Sponsor (optional)</label>
                  <input name="sponsor" placeholder="Bones Bearings" />
                </div>
              </div>

              <datalist id="teams-register">
                ${TEAM_LIST.map(t => `<option value="${esc(t)}"></option>`).join('')}
              </datalist>

              <div class="spacer"></div>

              <div class="row">
                <label><input type="checkbox" name="challengeUp" /> Challenge Up</label>
                <label><input type="checkbox" name="novice" /> Novice</label>
                <label><input type="checkbox" name="elite" /> Elite</label>
                <label><input type="checkbox" name="open" /> Open</label>
                <label><input type="checkbox" name="quad" /> Quad</label>
                <label><input type="checkbox" name="timeTrials" /> Time Trials</label>
                <label><input type="checkbox" name="relays" /> Relays</label>
              </div>

              <div class="spacer"></div>

              <button class="btn" type="submit">Register Skater</button>
            </form>
          `
      }
    </div>
  `;

  res.send(pageShell({
    title: 'Register',
    user: data?.user || null,
    bodyHtml: body,
  }));
});

app.post('/meet/:meetId/register', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);

  if (!meet) return res.redirect('/meets');
  if (!meet.isPublic) return res.redirect('/meets');
  if (isRegistrationClosed(meet)) return res.redirect(`/meet/${meet.id}/register`);

  const gender = String(req.body.gender || '').trim() || 'boys';
  const baseGroup = findAgeGroup(meet.groups, req.body.age, gender);
  const finalGroup = challengeAdjustedGroup(meet, baseGroup, !!req.body.challengeUp);
  const quadGroup = !!req.body.quad ? findQuadGroup(meet, req.body.age, gender) : null;
  const openGroup = !!req.body.open ? findOpenGroup(meet, req.body.age, gender) : null;

  const meetNumber =
    (meet.registrations || []).reduce((max, r) => Math.max(max, Number(r.meetNumber) || 0), 0) + 1;

  const reg = {
    id: nextId(meet.registrations),
    createdAt: nowIso(),

    name: String(req.body.name || '').trim(),
    age: Number(req.body.age || 0),
    gender,
    team: String(req.body.team || 'Midwest Racing').trim() || 'Midwest Racing',
    sponsor: String(req.body.sponsor || '').trim(),

    divisionGroupId: finalGroup?.id || '',
    divisionGroupLabel: finalGroup?.label || 'Unassigned',

    originalDivisionGroupId: baseGroup?.id || '',
    originalDivisionGroupLabel: baseGroup?.label || '',

    quadGroupId: quadGroup?.id || '',
    quadGroupLabel: quadGroup?.label || '',

    openGroupId: openGroup?.id || '',
    openGroupLabel: openGroup?.label || '',

    meetNumber,
    helmetNumber: nextHelmetNumber(meet),

    paid: false,
    checkedIn: false,
    totalCost: 0,

    options: {
      challengeUp: !!req.body.challengeUp,
      novice: !!req.body.novice,
      elite: !!req.body.elite,
      open: !!req.body.open,
      quad: !!req.body.quad,
      timeTrials: !!req.body.timeTrials,
      relays: !!req.body.relays,
    },
  };

  meet.registrations.push(reg);
  rebuildRaceAssignments(meet);
  ensureCurrentRace(meet);
  saveDb(db);

  res.redirect(`/meet/${meet.id}/register?ok=1`);
});

function registrationForm(meet, reg, action, title) {
  const gender = reg.gender || 'boys';

  return `
    <h1>${esc(title)}</h1>
    <div class="card">
      <form method="POST" action="${action}">
        <div class="grid3">
          <div>
            <label>Skater Name</label>
            <input name="name" value="${esc(reg.name || '')}" required />
          </div>
          <div>
            <label>Age</label>
            <input name="age" value="${esc(reg.age || '')}" required />
          </div>
          <div>
            <label>Gender</label>
            <select name="gender">
              <option value="boys" ${gender === 'boys' ? 'selected' : ''}>Boy</option>
              <option value="girls" ${gender === 'girls' ? 'selected' : ''}>Girl</option>
              <option value="men" ${gender === 'men' ? 'selected' : ''}>Men</option>
              <option value="women" ${gender === 'women' ? 'selected' : ''}>Women</option>
            </select>
            <div class="note">Note: Ages 16+ are listed as Men/Women divisions.</div>
          </div>
          <div>
            <label>Team</label>
            <input name="team" list="teams-edit" value="${esc(reg.team || 'Midwest Racing')}" />
          </div>
          <div>
            <label>Sponsor (optional)</label>
            <input name="sponsor" value="${esc(reg.sponsor || '')}" />
          </div>
        </div>

        <datalist id="teams-edit">
          ${TEAM_LIST.map(t => `<option value="${esc(t)}"></option>`).join('')}
        </datalist>

        <div class="spacer"></div>

        <div class="row">
          <label><input type="checkbox" name="challengeUp" ${reg.options?.challengeUp ? 'checked' : ''} /> Challenge Up</label>
          <label><input type="checkbox" name="novice" ${reg.options?.novice ? 'checked' : ''} /> Novice</label>
          <label><input type="checkbox" name="elite" ${reg.options?.elite ? 'checked' : ''} /> Elite</label>
          <label><input type="checkbox" name="open" ${reg.options?.open ? 'checked' : ''} /> Open</label>
          <label><input type="checkbox" name="quad" ${reg.options?.quad ? 'checked' : ''} /> Quad</label>
          <label><input type="checkbox" name="timeTrials" ${reg.options?.timeTrials ? 'checked' : ''} /> Time Trials</label>
          <label><input type="checkbox" name="relays" ${reg.options?.relays ? 'checked' : ''} /> Relays</label>
        </div>

        <div class="spacer"></div>

        <button class="btn" type="submit">Save Racer</button>
        <a class="btn2" href="/portal/meet/${meet.id}/registered">Back</a>
      </form>
    </div>
  `;
}app.get('/portal/meet/:meetId/registered', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  ensureRegistrationTotalsAndNumbers(meet);
  saveDb(req.db);

  const q = String(req.query.q || '').trim().toLowerCase();

  const filteredRegs = (meet.registrations || []).filter(r => {
    if (!q) return true;
    return (
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.team || '').toLowerCase().includes(q) ||
      String(r.helmetNumber || '').includes(q) ||
      String(r.meetNumber || '').includes(q)
    );
  });

  const rows = filteredRegs.map(r => `
    <tr>
      <td>${esc(r.meetNumber)}</td>
      <td>${esc(r.helmetNumber)}</td>
      <td>
        ${esc(r.name)}
        ${sponsorLineHtml(r.sponsor || '')}
      </td>
      <td>${esc(r.age)}</td>
      <td>${esc(r.team)}</td>
      <td>
        ${esc(r.divisionGroupLabel || '')}
        ${r.options?.challengeUp ? `<div class="note">Challenge Up from ${esc(r.originalDivisionGroupLabel || '')}</div>` : ``}
        ${r.options?.quad && r.quadGroupLabel ? `<div class="note">Quad: ${esc(r.quadGroupLabel)}</div>` : ``}
        ${r.options?.open && r.openGroupLabel ? `<div class="note">Open: ${esc(r.openGroupLabel)}</div>` : ``}
      </td>
      <td>${buildEntryTypeList(r).join(', ') || '-'}</td>
      <td>$${esc(r.totalCost)}</td>
      <td>${r.paid ? '✔' : '—'}</td>
      <td>${r.checkedIn ? '✔' : '—'}</td>
      <td>
        <div class="actionRow">
          <a class="btn2 small" href="/portal/meet/${meet.id}/registered/${r.id}/edit">Edit</a>
          <a class="btnDanger small" href="/portal/meet/${meet.id}/registered/${r.id}/delete">Delete</a>
        </div>
      </td>
    </tr>
  `).join('');

  const body = `
    <h1>Registered</h1>
    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="muted small">
            Registration close: ${meet.registrationCloseAt ? esc(meet.registrationCloseAt.replace('T', ' ')) : 'Not set'}
          </div>
        </div>
        <div class="row">
          <form method="POST" action="/portal/meet/${meet.id}/assign-races">
            <button class="btn2" type="submit">Build Race Assignments</button>
          </form>
          <a class="btn" href="/meet/${meet.id}/register" target="_blank">Open Public Registration</a>
          <a class="btn2" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="grid3">
        <div>
          <label>Search Skater</label>
          <input value="${esc(req.query.q || '')}" placeholder="name, team, helmet #, meet #" oninput="filterRegistered(this.value)" />
        </div>
        <div></div>
        <div class="row" style="align-items:end; justify-content:flex-end">
          <span class="chip">Showing: ${filteredRegs.length}</span>
          <span class="chip">Total: ${(meet.registrations || []).length}</span>
        </div>
      </div>

      <div class="spacer"></div>

      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Helmet</th>
            <th>Name</th>
            <th>Age</th>
            <th>Team</th>
            <th>Division</th>
            <th>Entries</th>
            <th>Total</th>
            <th>Paid</th>
            <th>Checked In</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="11" class="muted">No registrations yet.</td></tr>`}
        </tbody>
      </table>
    </div>

    <script>
      function filterRegistered(value) {
        const url = new URL(window.location.href);
        if (value && value.trim()) url.searchParams.set('q', value.trim());
        else url.searchParams.delete('q');
        window.location.href = url.toString();
      }
    </script>
  `;

  res.send(pageShell({
    title: 'Registered',
    user: req.user,
    meet,
    activeTab: 'registered',
    bodyHtml: body,
  }));
});

app.get('/portal/meet/:meetId/registered/:regId/edit', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => Number(r.id) === Number(req.params.regId));
  if (!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);

  res.send(pageShell({
    title: 'Edit Racer',
    user: req.user,
    meet,
    activeTab: 'registered',
    bodyHtml: registrationForm(meet, reg, `/portal/meet/${meet.id}/registered/${reg.id}/edit`, 'Edit Racer'),
  }));
});

app.post('/portal/meet/:meetId/registered/:regId/edit', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => Number(r.id) === Number(req.params.regId));
  if (!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);

  const gender = String(req.body.gender || '').trim() || 'boys';
  const baseGroup = findAgeGroup(meet.groups, req.body.age, gender);
  const finalGroup = challengeAdjustedGroup(meet, baseGroup, !!req.body.challengeUp);
  const quadGroup = !!req.body.quad ? findQuadGroup(meet, req.body.age, gender) : null;
  const openGroup = !!req.body.open ? findOpenGroup(meet, req.body.age, gender) : null;

  reg.name = String(req.body.name || '').trim();
  reg.age = Number(req.body.age || 0);
  reg.gender = gender;
  reg.team = String(req.body.team || 'Midwest Racing').trim() || 'Midwest Racing';
  reg.sponsor = String(req.body.sponsor || '').trim();

  reg.originalDivisionGroupId = baseGroup?.id || '';
  reg.originalDivisionGroupLabel = baseGroup?.label || '';
  reg.divisionGroupId = finalGroup?.id || '';
  reg.divisionGroupLabel = finalGroup?.label || 'Unassigned';

  reg.quadGroupId = quadGroup?.id || '';
  reg.quadGroupLabel = quadGroup?.label || '';

  reg.openGroupId = openGroup?.id || '';
  reg.openGroupLabel = openGroup?.label || '';

  reg.options = {
    challengeUp: !!req.body.challengeUp,
    novice: !!req.body.novice,
    elite: !!req.body.elite,
    open: !!req.body.open,
    quad: !!req.body.quad,
    timeTrials: !!req.body.timeTrials,
    relays: !!req.body.relays,
  };

  rebuildRaceAssignments(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.get('/portal/meet/:meetId/registered/:regId/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => Number(r.id) === Number(req.params.regId));
  if (!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);

  const body = `
    <h1>Delete Racer</h1>
    <div class="card">
      <div class="danger">
        This will remove ${esc(reg.name)} from registrations and race assignments.
      </div>
      <div class="spacer"></div>
      <form method="POST" action="/portal/meet/${meet.id}/registered/${reg.id}/delete">
        <button class="btnDanger" type="submit">Delete Racer</button>
        <a class="btn2" href="/portal/meet/${meet.id}/registered">Cancel</a>
      </form>
    </div>
  `;

  res.send(pageShell({
    title: 'Delete Racer',
    user: req.user,
    meet,
    activeTab: 'registered',
    bodyHtml: body,
  }));
});

app.post('/portal/meet/:meetId/registered/:regId/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.registrations = (meet.registrations || []).filter(r => Number(r.id) !== Number(req.params.regId));
  rebuildRaceAssignments(meet);
  saveDb(req.db);

  res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.post('/portal/meet/:meetId/assign-races', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  rebuildRaceAssignments(meet);
  ensureCurrentRace(meet);
  saveDb(req.db);

  res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.get('/portal/meet/:meetId/checkin', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  ensureRegistrationTotalsAndNumbers(meet);
  saveDb(req.db);

  const totalOwed = (meet.registrations || []).reduce((sum, r) => sum + Number(r.totalCost || 0), 0);
  const totalPaid = (meet.registrations || []).filter(r => r.paid).reduce((sum, r) => sum + Number(r.totalCost || 0), 0);

  const rows = (meet.registrations || []).map(r => `
    <tr class="checkin-row" data-name="${esc(String(r.name || '').toLowerCase())}" data-team="${esc(String(r.team || '').toLowerCase())}">
      <td>${esc(r.meetNumber)}</td>
      <td>
        ${esc(r.name)}
        ${sponsorLineHtml(r.sponsor || '')}
        ${buildEntrySummaryHtml(r)}
      </td>
      <td>${esc(r.team)}</td>
      <td>
        ${esc(r.divisionGroupLabel || '')}
        ${r.options?.quad && r.quadGroupLabel ? `<div class="note">Quad: ${esc(r.quadGroupLabel)}</div>` : ''}
        ${r.options?.open && r.openGroupLabel ? `<div class="note">Open: ${esc(r.openGroupLabel)}</div>` : ''}
      </td>
      <td>
        <form method="POST" action="/portal/meet/${meet.id}/checkin/helmet/${r.id}" class="checkin-form row center">
          <input style="max-width:90px" name="helmetNumber" value="${esc(r.helmetNumber)}" />
          <button class="btn2 small" type="submit">Save</button>
        </form>
      </td>
      <td>$${esc(r.totalCost)}</td>
      <td>
        <form method="POST" action="/portal/meet/${meet.id}/checkin/toggle-paid/${r.id}" class="checkin-form">
          <button class="${r.paid ? 'btnGood' : 'btn2'} small" type="submit">
            ${r.paid ? 'Paid' : 'Mark Paid'}
          </button>
        </form>
      </td>
      <td>
        <form method="POST" action="/portal/meet/${meet.id}/checkin/toggle-checkin/${r.id}" class="checkin-form">
          <button class="${r.checkedIn ? 'btnGood' : 'btn2'} small" type="submit">
            ${r.checkedIn ? 'Checked In' : 'Check In'}
          </button>
        </form>
      </td>
    </tr>
  `).join('');

  const body = `
    <h1>Check-In</h1>
    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="muted">Money, helmet numbers, sponsor visibility, entry summary, and meet check-in all in one place.</div>
        </div>
        <div class="row">
          <form method="POST" action="/portal/meet/${meet.id}/checkin/reassign-helmets">
            <button class="btn2" type="submit">Reassign Helmet Numbers</button>
          </form>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="row">
        <span class="chip">Registrations: ${(meet.registrations || []).length}</span>
        <span class="chip">Total Owed: $${totalOwed}</span>
        <span class="chip">Paid: $${totalPaid}</span>
        <span class="chip">Checked In: ${(meet.registrations || []).filter(r => r.checkedIn).length}</span>
      </div>

      <div class="spacer"></div>

      <div class="grid3">
        <div>
          <label>Search skater</label>
          <input id="checkinSearch" placeholder="jan / nash / dale" oninput="applyCheckinFilters()" />
        </div>
        <div>
          <label>Team filter</label>
          <input id="checkinTeam" placeholder="midwest / infinity" oninput="applyCheckinFilters()" />
        </div>
        <div>
          <label>Status</label>
          <select id="checkinStatus" onchange="applyCheckinFilters()">
            <option value="all">All</option>
            <option value="not_paid">Not Paid</option>
            <option value="not_checked">Not Checked In</option>
            <option value="checked">Checked In</option>
          </select>
        </div>
      </div>

      <div class="spacer"></div>

      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Team</th>
            <th>Division</th>
            <th>Helmet #</th>
            <th>Total</th>
            <th>Paid</th>
            <th>Checked In</th>
          </tr>
        </thead>
        <tbody id="checkinTableBody">
          ${rows || `<tr><td colspan="8" class="muted">No registrations yet.</td></tr>`}
        </tbody>
      </table>
    </div>

    <script>
      const savedScrollY = sessionStorage.getItem('checkinScrollY');
      if (savedScrollY !== null) {
        window.scrollTo(0, parseInt(savedScrollY, 10));
        sessionStorage.removeItem('checkinScrollY');
      }

      document.querySelectorAll('.checkin-form').forEach(form => {
        form.addEventListener('submit', () => {
          sessionStorage.setItem('checkinScrollY', String(window.scrollY));
        });
      });

      function applyCheckinFilters() {
        const nameQ = (document.getElementById('checkinSearch').value || '').toLowerCase().trim();
        const teamQ = (document.getElementById('checkinTeam').value || '').toLowerCase().trim();
        const status = document.getElementById('checkinStatus').value;

        document.querySelectorAll('.checkin-row').forEach(row => {
          const name = row.getAttribute('data-name') || '';
          const team = row.getAttribute('data-team') || '';
          const paidText = row.children[6]?.innerText || '';
          const checkedText = row.children[7]?.innerText || '';

          const matchesName = !nameQ || name.includes(nameQ);
          const matchesTeam = !teamQ || team.includes(teamQ);

          let matchesStatus = true;
          if (status === 'not_paid') matchesStatus = !/paid/i.test(paidText);
          if (status === 'not_checked') matchesStatus = !/checked in/i.test(checkedText);
          if (status === 'checked') matchesStatus = /checked in/i.test(checkedText);

          row.classList.toggle('hidden', !(matchesName && matchesTeam && matchesStatus));
        });
      }
    </script>
  `;

  res.send(pageShell({
    title: 'Check-In',
    user: req.user,
    meet,
    activeTab: 'checkin',
    bodyHtml: body,
  }));
});

app.post('/portal/meet/:meetId/checkin/toggle-paid/:regId', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => Number(r.id) === Number(req.params.regId));
  if (reg) reg.paid = !reg.paid;

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/checkin`);
});

app.post('/portal/meet/:meetId/checkin/toggle-checkin/:regId', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => Number(r.id) === Number(req.params.regId));
  if (reg) reg.checkedIn = !reg.checkedIn;

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/checkin`);
});

app.post('/portal/meet/:meetId/checkin/helmet/:regId', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  const reg = (meet.registrations || []).find(r => Number(r.id) === Number(req.params.regId));
  if (reg) reg.helmetNumber = Number(req.body.helmetNumber || '') || '';

  rebuildRaceAssignments(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/checkin`);
});

app.post('/portal/meet/:meetId/checkin/reassign-helmets', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  let n = 1;
  for (const reg of meet.registrations || []) {
    reg.helmetNumber = n++;
  }

  rebuildRaceAssignments(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/checkin`);
});function nextRaceBlockNumberForDay(meet, day) {
  return (meet.blocks || []).filter(b => String(b.day || 'Day 1') === String(day || 'Day 1') && String(b.type || 'race') === 'race').length + 1;
}

function defaultBlockNameForType(meet, day, type) {
  if (String(type) === 'race') return `Block ${nextRaceBlockNumberForDay(meet, day)}`;
  if (String(type) === 'practice') return 'Practice';
  if (String(type) === 'lunch') return 'Lunch';
  if (String(type) === 'break') return 'Break';
  if (String(type) === 'awards') return 'Awards';
  return 'Block';
}

app.get('/portal/meet/:meetId/blocks', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  if (!canEditMeet(req.user, meet)) {
    return res.status(403).send(pageShell({
      title: 'Forbidden',
      user: req.user,
      bodyHtml: `
        <h1>Forbidden</h1>
        <div class="card">
          <div class="danger">Only the meet owner can edit this meet.</div>
        </div>
      `,
    }));
  }

  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  saveDb(req.db);

  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const assigned = new Set();

  for (const block of meet.blocks || []) {
    for (const rid of block.raceIds || []) assigned.add(rid);
  }

  const unassigned = (meet.races || []).filter(r => !assigned.has(r.id));

  const blocksHtml = (meet.blocks || []).map(block => `
    <div class="block">
      <div class="blockHead">
        <div>
          <div style="font-weight:900;font-size:18px">${esc(block.name)}</div>
          <div class="muted small">${esc(block.day || 'Day 1')} • ${esc((block.type || 'race').toUpperCase())}</div>
        </div>
        <div class="row">
          <button class="btn2 small" type="button" onclick="renameBlock('${esc(block.id)}')">Rename</button>
          <button class="btnDanger small" type="button" onclick="deleteBlock('${esc(block.id)}')">Delete</button>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="grid3">
        <div>
          <label>Day</label>
          <select onchange="setBlockDay('${esc(block.id)}', this.value)">
            ${['Day 1', 'Day 2', 'Day 3'].map(day => `
              <option value="${day}" ${block.day === day ? 'selected' : ''}>${day}</option>
            `).join('')}
          </select>
        </div>

        <div>
          <label>Block Type</label>
          <select onchange="setBlockType('${esc(block.id)}', this.value)">
            ${BLOCK_TYPES.map(type => `
              <option value="${type}" ${(block.type || 'race') === type ? 'selected' : ''}>${type}</option>
            `).join('')}
          </select>
        </div>

        <div>
          <label>Block Notes</label>
          <input
            value="${esc(block.notes || '')}"
            onblur="setBlockNotes('${esc(block.id)}', this.value)"
            placeholder="short novice / lunch / awards"
          />
        </div>
      </div>

      <div class="spacer"></div>

      <div class="dropZone" data-drop-block="${esc(block.id)}">
        ${
          (block.raceIds || []).map(rid => {
            const race = raceById.get(rid);
            if (!race) return '';

            const isCurrent = meet.currentRaceId === race.id;
            return `
              <div
                class="raceItem ${isCurrent ? 'activeCurrent' : ''}"
                draggable="${(block.type || 'race') === 'race' ? 'true' : 'false'}"
                data-race-id="${esc(race.id)}"
              >
                <div style="font-weight:900">
                  ${esc(race.groupLabel)} • ${esc(cap(race.division))}
                </div>
                <div class="raceMeta">
                  ${esc(race.distanceLabel)} • D${esc(race.dayIndex)} • ${esc(raceDisplayStage(race))} • ${esc(cap(race.startType))} Start
                </div>
              </div>
            `;
          }).join('') || `<div class="note">${(block.type || 'race') === 'race' ? 'Drop races here…' : 'Non-race block.'}</div>`
        }
      </div>
    </div>
  `).join('<div class="spacer"></div>');

  const unassignedHtml = unassigned.map(race => `
    <div
      class="raceItem ${meet.currentRaceId === race.id ? 'activeCurrent' : ''}"
      draggable="true"
      data-race-id="${esc(race.id)}"
      data-group-label="${esc(String(race.groupLabel || '').toLowerCase())}"
      data-division="${esc(race.division)}"
      data-day-index="${esc(race.dayIndex)}"
    >
      <div style="font-weight:900">${esc(race.groupLabel)} • ${esc(cap(race.division))}</div>
      <div class="raceMeta">
        ${esc(race.distanceLabel)} • D${esc(race.dayIndex)} • ${esc(raceDisplayStage(race))} • ${esc(cap(race.startType))} Start
      </div>
    </div>
  `).join('');

  const body = `
    <h1>Block Builder</h1>

    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="muted small">
            Drag and drop races into blocks. Filters stay remembered now.
          </div>
        </div>
        <div class="row">
          <button class="btn2" type="button" onclick="addBlock('race')">Add Block</button>
          <button class="btn2" type="button" onclick="addBlock('practice')">Add Practice</button>
          <button class="btn2" type="button" onclick="addBlock('lunch')">Add Lunch</button>
          <button class="btn2" type="button" onclick="addBlock('break')">Add Break</button>
          <button class="btn2" type="button" onclick="addBlock('awards')">Add Awards</button>
          <form method="POST" action="/portal/meet/${meet.id}/assign-races">
            <button class="btn2" type="submit">Rebuild Race Assignments</button>
          </form>
          <a class="btn" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="row">
        <span class="chip">Races: ${(meet.races || []).length}</span>
        <span class="chip" id="unassignedCountChip">Unassigned: ${unassigned.length}</span>
        <span class="chip">Blocks: ${(meet.blocks || []).length}</span>
      </div>
    </div>

    <div class="spacer"></div>

    <div class="bb">
      <div>${blocksHtml}</div>

      <div class="rightCol">
        <div class="card">
          <h2 style="margin:0">Unassigned Races</h2>
          <div class="spacer"></div>

          <div class="filters">
            <div>
              <label>Search division</label>
              <input id="raceSearch" placeholder="elementary / freshman / girls" oninput="applyRaceFilters()" />
            </div>

            <div>
              <label>Class</label>
              <select id="classFilter" onchange="applyRaceFilters()">
                <option value="all">All</option>
                <option value="novice">Novice</option>
                <option value="elite">Elite</option>
                <option value="open">Open</option>
                <option value="quad">Quad</option>
              </select>
            </div>

            <div>
              <label>Distance</label>
              <select id="distanceFilter" onchange="applyRaceFilters()">
                <option value="all">All</option>
                <option value="1">D1</option>
                <option value="2">D2</option>
                <option value="3">D3</option>
                <option value="4">D4</option>
              </select>
            </div>
          </div>

          <div class="hr"></div>

          <div class="dropZone" data-drop-block="__unassigned__" id="unassignedZone">
            ${unassignedHtml || `<div class="note">No unassigned races.</div>`}
          </div>
        </div>
      </div>
    </div>

    <script>
      let dragRaceId = null;
      const meetId = ${JSON.stringify(meet.id)};

      function saveBlockFilters() {
        localStorage.setItem('ssm_block_search', document.getElementById('raceSearch').value || '');
        localStorage.setItem('ssm_block_class', document.getElementById('classFilter').value || 'all');
        localStorage.setItem('ssm_block_distance', document.getElementById('distanceFilter').value || 'all');
      }

      function restoreBlockFilters() {
        document.getElementById('raceSearch').value = localStorage.getItem('ssm_block_search') || '';
        document.getElementById('classFilter').value = localStorage.getItem('ssm_block_class') || 'all';
        document.getElementById('distanceFilter').value = localStorage.getItem('ssm_block_distance') || 'all';
      }

      function attachDnD() {
        document.querySelectorAll('.raceItem').forEach(el => {
          if (el.getAttribute('draggable') !== 'true') return;

          el.addEventListener('dragstart', e => {
            dragRaceId = el.getAttribute('data-race-id');
            e.dataTransfer.setData('text/plain', dragRaceId);
            saveBlockFilters();
          });
        });

        document.querySelectorAll('.dropZone').forEach(zone => {
          zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('over');
          });

          zone.addEventListener('dragleave', () => {
            zone.classList.remove('over');
          });

          zone.addEventListener('drop', async e => {
            e.preventDefault();
            zone.classList.remove('over');

            const raceId = e.dataTransfer.getData('text/plain') || dragRaceId;
            const destBlockId = zone.getAttribute('data-drop-block');

            saveBlockFilters();

            const res = await fetch('/api/meet/' + meetId + '/blocks/move-race', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ raceId, destBlockId }),
            });

            if (res.ok) location.reload();
            else alert('Move failed');
          });
        });
      }

      async function addBlock(type) {
        saveBlockFilters();
        const res = await fetch('/api/meet/' + meetId + '/blocks/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type })
        });
        if (res.ok) location.reload();
      }

      async function renameBlock(id) {
        const name = prompt('Block name:');
        if (!name) return;
        saveBlockFilters();

        const res = await fetch('/api/meet/' + meetId + '/blocks/update-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockId: id, name }),
        });

        if (res.ok) location.reload();
      }

      async function deleteBlock(id) {
        if (!confirm('Delete this block? Its races will move back to Unassigned.')) return;
        saveBlockFilters();

        const res = await fetch('/api/meet/' + meetId + '/blocks/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockId: id }),
        });

        if (res.ok) location.reload();
      }

      async function setBlockDay(id, day) {
        saveBlockFilters();
        await fetch('/api/meet/' + meetId + '/blocks/update-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockId: id, day }),
        });
      }

      async function setBlockType(id, type) {
        saveBlockFilters();
        await fetch('/api/meet/' + meetId + '/blocks/update-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockId: id, type }),
        });
        location.reload();
      }

      async function setBlockNotes(id, notes) {
        saveBlockFilters();
        await fetch('/api/meet/' + meetId + '/blocks/update-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockId: id, notes }),
        });
      }

      function applyRaceFilters() {
        saveBlockFilters();

        const q = (document.getElementById('raceSearch').value || '').toLowerCase().trim();
        const klass = document.getElementById('classFilter').value;
        const dist = document.getElementById('distanceFilter').value;

        const items = Array.from(document.querySelectorAll('#unassignedZone .raceItem'));
        let visible = 0;

        for (const item of items) {
          const matchesSearch = !q || (item.getAttribute('data-group-label') || '').includes(q);
          const matchesClass = klass === 'all' || item.getAttribute('data-division') === klass;
          const matchesDist = dist === 'all' || item.getAttribute('data-day-index') === dist;

          const show = matchesSearch && matchesClass && matchesDist;
          item.classList.toggle('hidden', !show);
          if (show) visible += 1;
        }

        document.getElementById('unassignedCountChip').textContent = 'Unassigned: ' + visible;
      }

      restoreBlockFilters();
      attachDnD();
      applyRaceFilters();
    </script>
  `;

  res.send(pageShell({
    title: 'Block Builder',
    user: req.user,
    meet,
    activeTab: 'blocks',
    bodyHtml: body,
  }));
});

app.post('/api/meet/:meetId/blocks/add', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const type = BLOCK_TYPES.includes(String(req.body.type || 'race')) ? String(req.body.type || 'race') : 'race';
  const day = 'Day 1';

  meet.blocks.push({
    id: 'b' + crypto.randomBytes(4).toString('hex'),
    name: defaultBlockNameForType(meet, day, type),
    day,
    type,
    notes: '',
    raceIds: [],
  });

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.json({ ok: true });
});

app.post('/api/meet/:meetId/blocks/update-meta', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const block = (meet.blocks || []).find(b => b.id === String(req.body.blockId || ''));
  if (!block) return res.status(404).send('Not found');

  const oldDay = block.day || 'Day 1';
  const oldType = block.type || 'race';

  if (typeof req.body.day === 'string' && req.body.day.trim()) block.day = String(req.body.day).trim();
  if (typeof req.body.type === 'string' && BLOCK_TYPES.includes(String(req.body.type).trim())) block.type = String(req.body.type).trim();

  if (typeof req.body.name === 'string' && req.body.name.trim()) {
    block.name = String(req.body.name).trim();
  } else if (
    (oldDay !== block.day || oldType !== block.type) &&
    (/^Block \d+$/i.test(String(block.name || '')) || ['Practice', 'Lunch', 'Break', 'Awards'].includes(String(block.name || '')))
  ) {
    block.name = defaultBlockNameForType(meet, block.day, block.type);
  }

  if (typeof req.body.notes === 'string') block.notes = String(req.body.notes);

  if (String(block.type || 'race') !== 'race') {
    block.raceIds = [];
  }

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.json({ ok: true });
});

app.post('/api/meet/:meetId/blocks/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const blockId = String(req.body.blockId || '');
  const block = (meet.blocks || []).find(b => b.id === blockId);
  if (!block) return res.status(404).send('Block not found');

  meet.blocks = (meet.blocks || []).filter(b => b.id !== blockId);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();

  saveDb(req.db);
  res.json({ ok: true });
});

app.post('/api/meet/:meetId/blocks/move-race', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const raceId = String(req.body.raceId || '');
  const destBlockId = String(req.body.destBlockId || '');

  for (const block of meet.blocks || []) {
    block.raceIds = (block.raceIds || []).filter(id => id !== raceId);
  }

  if (destBlockId !== '__unassigned__') {
    const block = (meet.blocks || []).find(b => b.id === destBlockId);
    if (!block) return res.status(404).send('Block not found');
    if ((block.type || 'race') !== 'race') return res.status(400).send('Cannot drop races into non-race blocks');
    block.raceIds.push(raceId);
  }

  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  saveDb(req.db);

  res.json({ ok: true });
});

function raceDaySubTabs(meet, active) {
  const subs = [
    ['director', 'Director', `/portal/meet/${meet.id}/race-day/director`],
    ['judges', 'Judges', `/portal/meet/${meet.id}/race-day/judges`],
    ['announcer', 'Announcer', `/portal/meet/${meet.id}/race-day/announcer`],
    ['live', 'Live', `/portal/meet/${meet.id}/race-day/live`],
    ['schedule', 'Schedule', `/portal/meet/${meet.id}/race-day/schedule`],
  ];

  return `
    <div class="subTabs">
      ${subs.map(([k, label, href]) => `
        <a class="subTab ${active === k ? 'active' : ''}" href="${href}">${label}</a>
      `).join('')}
    </div>
  `;
}

app.get('/portal/meet/:meetId/race-day/:mode', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const mode = String(req.params.mode || 'director');
  const info = currentRaceInfo(meet);
  const current = info.current;
  const currentLanes = current ? laneRowsForRace(current, meet) : [];
  const recent = recentClosedRaces(meet, 5);
  const regMap = new Map((meet.registrations || []).map(r => [Number(r.id), r]));

  let body = `<h1>Race Day</h1>${raceDaySubTabs(meet, mode)}`;

  if (mode === 'director') {
    const raceOptions = info.ordered.map((r, idx) => `
      <option value="${r.id}" ${r.id === meet.currentRaceId ? 'selected' : ''}>
        ${idx + 1}. ${r.groupLabel} — ${cap(r.division)} — ${r.distanceLabel} — ${raceDisplayStage(r)}
      </option>
    `).join('');

    body += `
      <div class="grid3">
        <div class="statusCard orange">
          <div class="statusLabel">Current Race</div>
          <div class="statusTitle">${current ? esc(current.groupLabel) : 'No race selected'}</div>
          <div>${current ? `${esc(cap(current.division))} • ${esc(current.distanceLabel)} • ${esc(raceDisplayStage(current))}` : ''}</div>
        </div>

        <div class="statusCard yellow">
          <div class="statusLabel">On Deck</div>
          <div class="statusTitle">${info.next ? esc(info.next.groupLabel) : '—'}</div>
          <div>${info.next ? `${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}` : ''}</div>
        </div>

        <div class="statusCard blue">
          <div class="statusLabel">Meet Progress</div>
          <div class="statusTitle">${Math.max(info.idx + 1, 0)} of ${info.ordered.length}</div>
          <div>${meet.raceDayPaused ? 'Paused' : 'Running'}</div>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="card">
        <div class="grid3">
          <div>
            <label>Set Current Race</label>
            <select onchange="setCurrentRace(this.value)">${raceOptions}</select>
          </div>

          <div class="row" style="align-items:end">
            <button class="btn2" type="button" onclick="moveCurrent(-1)">Previous Race</button>
            <button class="btn" type="button" onclick="moveCurrent(1)">Next Race</button>
          </div>

          <div class="row" style="align-items:end">
            <button class="btn2" type="button" onclick="pauseMeet()">${meet.raceDayPaused ? 'Resume Meet' : 'Pause Meet'}</button>
            ${
              current && current.status === 'closed'
                ? `<button class="btnDanger" type="button" onclick="unlockRace('${current.id}')">Unlock Race</button>`
                : ''
            }
          </div>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="grid2">
        <div class="card">
          <h2>Current Race Details</h2>
          ${
            current
              ? `
                <div class="row">
                  <span class="chip">${esc(current.blockName || 'Unassigned')}</span>
                  <span class="chip">${esc(current.blockDay || '')}</span>
                  <span class="chip">${esc(cap(current.division))}</span>
                  <span class="chip">${esc(raceDisplayStage(current))}</span>
                  <span class="chip">${esc(cap(current.startType))} Start</span>
                  <span class="chip">Status: ${esc(current.status)}</span>
                </div>

                <div class="spacer"></div>

                <table class="table">
                  <thead>
                    <tr>
                      <th>Lane</th>
                      <th>Helmet</th>
                      <th>Skater</th>
                      <th>Team</th>
                      <th>Place/Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${currentLanes.map(l => {
                      const reg = regMap.get(Number(l.registrationId));
                      return `
                        <tr>
                          <td>${l.lane}</td>
                          <td>${l.helmetNumber ? '#' + esc(l.helmetNumber) : ''}</td>
                          <td>
                            ${esc(l.skaterName || '')}
                            ${sponsorLineHtml(reg?.sponsor || '')}
                          </td>
                          <td>${esc(l.team || '')}</td>
                          <td>${esc(current.resultsMode === 'times' ? l.time : l.place)}</td>
                          <td>${esc(l.status || '')}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              `
              : `<div class="muted">No race selected yet.</div>`
          }
        </div>

        <div class="card">
          <h2>Coming Up</h2>
          <table class="table">
            <thead>
              <tr>
                <th>Race</th>
                <th>Division</th>
                <th>Class</th>
                <th>Distance</th>
                <th>Block</th>
              </tr>
            </thead>
            <tbody>
              ${
                info.coming.map((r, i) => `
                  <tr>
                    <td>${info.idx + i + 3}</td>
                    <td>${esc(r.groupLabel)}</td>
                    <td>${esc(cap(r.division))}</td>
                    <td>${esc(r.distanceLabel)}</td>
                    <td>${esc(r.blockName || 'Unassigned')}</td>
                  </tr>
                `).join('') || `<tr><td colspan="5" class="muted">Nothing queued.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="card">
        <h2>Recent Results</h2>
        ${
          recent.map(r => `
            <div style="margin-bottom:12px">
              <div style="font-weight:900">${esc(r.groupLabel)} — ${esc(cap(r.division))} — ${esc(r.distanceLabel)} — ${esc(raceDisplayStage(r))}</div>
              <div class="note">${esc(r.closedAt || '')}</div>
            </div>
          `).join('') || `<div class="muted">No recent closed races yet.</div>`
        }
      </div>

      <script>
        async function setCurrentRace(raceId) {
          const res = await fetch('/api/meet/${meet.id}/race-day/set-current', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raceId }),
          });
          if (res.ok) location.reload();
        }

        async function moveCurrent(dir) {
          const res = await fetch('/api/meet/${meet.id}/race-day/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction: dir }),
          });
          if (res.ok) location.reload();
        }

        async function pauseMeet() {
          const res = await fetch('/api/meet/${meet.id}/race-day/toggle-pause', { method: 'POST' });
          if (res.ok) location.reload();
        }

        async function unlockRace(raceId) {
          const res = await fetch('/api/meet/${meet.id}/race-day/unlock-race', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raceId }),
          });
          if (res.ok) location.reload();
        }
      </script>
    `;
  } else if (mode === 'judges') {
    body += `
      <div class="card">
        <h2>
          ${
            current
              ? `Race ${Math.max(info.idx + 1, 1)} — ${esc(current.groupLabel)} — ${esc(cap(current.division))} — ${esc(current.distanceLabel)}`
              : 'No race selected'
          }
        </h2>
        <div class="muted">Judges always land on the current race. Save keeps you here and preserves scroll. Close race moves on when done.</div>
      </div>

      <div class="spacer"></div>

      ${
        current
          ? `
            <div class="card">
              <form method="POST" action="/portal/meet/${meet.id}/race-day/judges/save" class="judgesForm">
                <input type="hidden" name="raceId" value="${esc(current.id)}" />

                <div class="row">
                  <label><input type="radio" name="resultsMode" value="places" ${current.resultsMode !== 'times' ? 'checked' : ''} /> Places</label>
                  <label><input type="radio" name="resultsMode" value="times" ${current.resultsMode === 'times' ? 'checked' : ''} /> Times</label>
                </div>

                <div class="spacer"></div>

                <table class="table">
                  <thead>
                    <tr>
                      <th>Lane</th>
                      <th>Helmet</th>
                      <th>Skater</th>
                      <th>Team</th>
                      <th>Place</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${currentLanes.map(l => {
                      const reg = regMap.get(Number(l.registrationId));
                      return `
                        <tr>
                          <td>${l.lane}</td>
                          <td>${l.helmetNumber ? '#' + esc(l.helmetNumber) : ''}</td>
                          <td>
                            <input name="skaterName_${l.lane}" value="${esc(l.skaterName)}" />
                            ${reg?.sponsor ? `<div class="note">Sponsor: ${esc(reg.sponsor)}</div>` : ''}
                          </td>
                          <td><input name="team_${l.lane}" value="${esc(l.team)}" /></td>
                          <td><input name="place_${l.lane}" value="${esc(l.place)}" /></td>
                          <td><input name="time_${l.lane}" value="${esc(l.time)}" /></td>
                          <td>
                            <select name="status_${l.lane}">
                              <option value="" ${!l.status ? 'selected' : ''}>—</option>
                              <option value="DNS" ${l.status === 'DNS' ? 'selected' : ''}>DNS</option>
                              <option value="DQ" ${l.status === 'DQ' ? 'selected' : ''}>DQ</option>
                              <option value="Scratch" ${l.status === 'Scratch' ? 'selected' : ''}>Scratch</option>
                            </select>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>

                <div class="spacer"></div>

                <label>Race Notes / Officials Report</label>
                <textarea name="notes">${esc(current.notes || '')}</textarea>

                <div class="spacer"></div>

                <div class="row">
                  <button class="btn2" type="submit" name="action" value="save">Save</button>
                  <button class="btn" type="submit" name="action" value="close">Close Race</button>
                </div>
              </form>
            </div>

            <script>
              const savedJudgesScrollY = sessionStorage.getItem('judgesScrollY');
              if (savedJudgesScrollY !== null) {
                window.scrollTo(0, parseInt(savedJudgesScrollY, 10));
                sessionStorage.removeItem('judgesScrollY');
              }

              document.querySelectorAll('.judgesForm').forEach(form => {
                form.addEventListener('submit', () => {
                  if (document.activeElement && document.activeElement.value === 'save') {
                    sessionStorage.setItem('judgesScrollY', String(window.scrollY));
                  }
                });
              });
            </script>
          `
          : `<div class="card"><div class="muted">No race selected yet.</div></div>`
      }
    `;
  } else if (mode === 'announcer') {
    body += `
      <div class="grid3">
        <div class="statusCard orange">
          <div class="statusLabel">Current Race</div>
          <div class="statusTitle">${current ? esc(current.groupLabel) : '—'}</div>
          <div>${current ? `${esc(cap(current.division))} • ${esc(current.distanceLabel)}` : ''}</div>
        </div>

        <div class="statusCard yellow">
          <div class="statusLabel">On Deck</div>
          <div class="statusTitle">${info.next ? esc(info.next.groupLabel) : '—'}</div>
          <div>${info.next ? `${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}` : ''}</div>
        </div>

        <div class="statusCard blue">
          <div class="statusLabel">Coming Up</div>
          <div class="statusTitle">${info.coming[0] ? esc(info.coming[0].groupLabel) : '—'}</div>
          <div>${info.coming[0] ? `${esc(cap(info.coming[0].division))} • ${esc(info.coming[0].distanceLabel)}` : ''}</div>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="card">
        <h2>Announcer Read Box</h2>
        ${announcerBoxHtml(current, currentLanes.map(l => {
          const reg = regMap.get(Number(l.registrationId));
          return { ...l, sponsor: reg?.sponsor || '' };
        }))}
      </div>
    `;
  } else if (mode === 'schedule') {
    const days = {};
    for (const block of meet.blocks || []) {
      const day = block.day || 'Day 1';
      if (!days[day]) days[day] = [];
      days[day].push(block);
    }

    body += `
      <div class="card">
        <h2>Race Day Schedule</h2>
        <div class="muted">This is the schedule view that can later pair with text alerts.</div>
      </div>

      <div class="spacer"></div>

      ${Object.keys(days).sort().map(day => `
        <div class="card">
          <h2>${esc(day)}</h2>
          ${(days[day] || []).map(block => `
            <div class="groupCard">
              <div class="row between">
                <div>
                  <div style="font-weight:900">${esc(block.name)}</div>
                  <div class="muted">${esc(cap(block.type || 'race'))}</div>
                  ${block.notes ? `<div class="note">${esc(block.notes)}</div>` : ''}
                </div>
                <div class="chip">${(block.raceIds || []).length} races</div>
              </div>
            </div>
          `).join('<div class="spacer"></div>')}
        </div>
      `).join('<div class="spacer"></div>') || `<div class="card"><div class="muted">No blocks yet.</div></div>`}
    `;
  } else {
    body += `
      <div class="grid3">
        <div class="statusCard orange">
          <div class="statusLabel">Current Race</div>
          <div class="statusTitle">${current ? esc(current.groupLabel) : '—'}</div>
          <div>${current ? `${esc(cap(current.division))} • ${esc(current.distanceLabel)} • Race ${Math.max(info.idx + 1, 1)} of ${info.ordered.length}` : ''}</div>
        </div>

        <div class="statusCard yellow">
          <div class="statusLabel">On Deck</div>
          <div class="statusTitle">${info.next ? esc(info.next.groupLabel) : '—'}</div>
          <div>${info.next ? `${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}` : ''}</div>
        </div>

        <div class="statusCard blue">
          <div class="statusLabel">Recent Result</div>
          <div class="statusTitle">${recent[0] ? esc(recent[0].groupLabel) : 'Waiting'}</div>
          <div>${recent[0] ? `${esc(cap(recent[0].division))} • ${esc(recent[0].distanceLabel)}` : ''}</div>
        </div>
      </div>

      <div class="spacer"></div>

      <div class="card">
        ${
          current
            ? `
              <h2>${esc(current.groupLabel)} — ${esc(cap(current.division))} — ${esc(current.distanceLabel)}</h2>
              <table class="table">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Helmet</th>
                    <th>Skater</th>
                    <th>Team</th>
                    <th>${current.resultsMode === 'times' ? 'Time' : 'Place'}</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${currentLanes.map(l => {
                    const reg = regMap.get(Number(l.registrationId));
                    return `
                      <tr>
                        <td>${l.lane}</td>
                        <td>${l.helmetNumber ? '#' + esc(l.helmetNumber) : ''}</td>
                        <td>
                          ${esc(l.skaterName)}
                          ${sponsorLineHtml(reg?.sponsor || '')}
                        </td>
                        <td>${esc(l.team)}</td>
                        <td>${esc(current.resultsMode === 'times' ? l.time : l.place)}</td>
                        <td>${esc(l.status)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            `
            : `<div class="muted">No live race selected.</div>`
        }
      </div>
    `;
  }

  res.send(pageShell({
    title: 'Race Day',
    user: req.user,
    meet,
    activeTab: 'race-day',
    bodyHtml: body,
  }));
});

app.post('/portal/meet/:meetId/race-day/judges/save', requireRole('judge', 'meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const race = (meet.races || []).find(r => r.id === String(req.body.raceId || ''));
  if (!race) return res.redirect(`/portal/meet/${meet.id}/race-day/judges`);

  const laneCount = isOpenDivision(race.division)
    ? Math.max((race.laneEntries || []).length, 1)
    : Math.max(1, Number(meet.lanes) || 4);

  const laneEntries = [];

  for (let i = 1; i <= laneCount; i++) {
    const existing = (race.laneEntries || []).find(x => Number(x.lane) === i) || {};
    laneEntries.push({
      lane: i,
      registrationId: existing.registrationId || '',
      helmetNumber: existing.helmetNumber || '',
      skaterName: String(req.body[`skaterName_${i}`] || '').trim(),
      team: String(req.body[`team_${i}`] || '').trim(),
      place: String(req.body[`place_${i}`] || '').trim(),
      time: String(req.body[`time_${i}`] || '').trim(),
      status: String(req.body[`status_${i}`] || '').trim(),
    });
  }

  race.laneEntries = laneEntries;
  race.resultsMode = String(req.body.resultsMode || 'places') === 'times' ? 'times' : 'places';
  race.notes = String(req.body.notes || '');
  race.status = req.body.action === 'close' ? 'closed' : 'open';
  race.closedAt = req.body.action === 'close' ? nowIso() : race.closedAt;

  meet.updatedAt = nowIso();

  if (req.body.action === 'close') {
    const info = currentRaceInfo(meet);
    if (info.current && info.current.id === race.id) {
      const next = info.ordered[info.idx + 1];
      if (next) {
        meet.currentRaceId = next.id;
        meet.currentRaceIndex = info.idx + 1;
      }
    }
  }

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
});

app.post('/api/meet/:meetId/race-day/set-current', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const ordered = orderedRaces(meet);
  const idx = ordered.findIndex(r => r.id === String(req.body.raceId || ''));
  if (idx < 0) return res.status(404).send('Race not found');

  meet.currentRaceId = ordered[idx].id;
  meet.currentRaceIndex = idx;
  meet.updatedAt = nowIso();

  saveDb(req.db);
  res.json({ ok: true });
});

app.post('/api/meet/:meetId/race-day/step', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const info = currentRaceInfo(meet);
  let idx = info.idx;
  const dir = Number(req.body.direction || 1);

  idx = Math.max(0, Math.min(info.ordered.length - 1, idx + (dir >= 0 ? 1 : -1)));
  if (info.ordered[idx]) {
    meet.currentRaceId = info.ordered[idx].id;
    meet.currentRaceIndex = idx;
  }

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.json({ ok: true });
});

app.post('/api/meet/:meetId/race-day/toggle-pause', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  meet.raceDayPaused = !meet.raceDayPaused;
  saveDb(req.db);
  res.json({ ok: true });
});

app.post('/api/meet/:meetId/race-day/unlock-race', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const race = (meet.races || []).find(r => r.id === String(req.body.raceId || ''));
  if (!race) return res.status(404).send('Race not found');

  race.status = 'open';
  race.closedAt = '';

  meet.currentRaceId = race.id;
  meet.currentRaceIndex = orderedRaces(meet).findIndex(r => r.id === race.id);

  saveDb(req.db);
  res.json({ ok: true });
});app.get('/portal/meet/:meetId/results', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const sections = computeMeetStandings(meet);
  const openSections = computeOpenResults(meet);

  const body = `
    <h1>Results</h1>

    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="muted small">Meet status: ${esc(cap(meet.status || 'draft'))}</div>
        </div>
        <div class="row">
          ${
            hasRole(req.user, 'super_admin') || canEditMeet(req.user, meet)
              ? (
                  meet.status === 'complete'
                    ? `<form method="POST" action="/portal/meet/${meet.id}/reopen"><button class="btn2" type="submit">Reopen Meet</button></form>`
                    : `<form method="POST" action="/portal/meet/${meet.id}/finalize"><button class="btn" type="submit">Finalize Meet</button></form>`
                )
              : ''
          }
          <a class="btn2" href="/portal/meet/${meet.id}/results/print" target="_blank">Print Closed-Meet Results</a>
        </div>
      </div>
    </div>

    <div class="spacer"></div>

    ${sections.map(resultsSectionHtml).join('<div class="spacer"></div>') || `
      <div class="card">
        <div class="muted">No final standings yet. Close final races to generate points.</div>
      </div>
    `}

    ${
      openSections.length
        ? `
          <div class="spacer"></div>
          <h1 style="font-size:30px">Open Results</h1>
          ${openSections.map(section => `
            <div class="card">
              <div class="row between">
                <div>
                  <h2 style="margin:0">${esc(section.race.groupLabel)} — Open</h2>
                  <div class="muted small">${esc(section.race.distanceLabel)} • ${esc(cap(section.race.startType))} Start</div>
                </div>
                <div class="chip">Winner: ${section.rows[0] ? esc(section.rows[0].skaterName) : '—'}</div>
              </div>

              <div class="spacer"></div>

              <table class="table">
                <thead>
                  <tr>
                    <th>Place</th>
                    <th>Skater</th>
                    <th>Team</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    section.rows.map(row => {
                      const reg = (meet.registrations || []).find(r => Number(r.id) === Number(row.registrationId));
                      return `
                        <tr>
                          <td>${esc(row.place)}</td>
                          <td>
                            ${esc(row.skaterName || '')}
                            ${sponsorLineHtml(reg?.sponsor || '')}
                          </td>
                          <td>${esc(row.team || '')}</td>
                          <td>${esc(row.time || '')}</td>
                        </tr>
                      `;
                    }).join('') || `<tr><td colspan="4" class="muted">No open results yet.</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          `).join('<div class="spacer"></div>')}
        `
        : ''
    }
  `;

  res.send(pageShell({
    title: 'Results',
    user: req.user,
    meet,
    activeTab: 'results',
    bodyHtml: body,
  }));
});

app.post('/portal/meet/:meetId/finalize', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.status = 'complete';
  meet.updatedAt = nowIso();

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/results`);
});

app.post('/portal/meet/:meetId/reopen', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.status = 'live';
  meet.updatedAt = nowIso();

  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/results`);
});

app.get('/meet/:meetId/results', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  const data = getSessionUser(req);

  if (!meet) return res.redirect('/meets');
  if (!meet.isPublic) return res.redirect('/meets');

  const sections = computeMeetStandings(meet);
  const openSections = computeOpenResults(meet);

  const body = `
    <h1>${esc(meet.meetName)} Results</h1>
    ${sections.map(resultsSectionHtml).join('<div class="spacer"></div>') || `
      <div class="card">
        <div class="muted">No final standings yet. Results will appear as final races close.</div>
      </div>
    `}
    ${
      openSections.length
        ? `
          <div class="spacer"></div>
          <h1 style="font-size:30px">Open Results</h1>
          ${openSections.map(section => `
            <div class="card">
              <div class="row between">
                <div>
                  <h2 style="margin:0">${esc(section.race.groupLabel)} — Open</h2>
                  <div class="muted small">${esc(section.race.distanceLabel)} • ${esc(cap(section.race.startType))} Start</div>
                </div>
                <div class="chip">Winner: ${section.rows[0] ? esc(section.rows[0].skaterName) : '—'}</div>
              </div>

              <div class="spacer"></div>

              <table class="table">
                <thead>
                  <tr>
                    <th>Place</th>
                    <th>Skater</th>
                    <th>Team</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    section.rows.map(row => {
                      const reg = (meet.registrations || []).find(r => Number(r.id) === Number(row.registrationId));
                      return `
                        <tr>
                          <td>${esc(row.place)}</td>
                          <td>
                            ${esc(row.skaterName || '')}
                            ${sponsorLineHtml(reg?.sponsor || '')}
                          </td>
                          <td>${esc(row.team || '')}</td>
                          <td>${esc(row.time || '')}</td>
                        </tr>
                      `;
                    }).join('') || `<tr><td colspan="4" class="muted">No open results yet.</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          `).join('<div class="spacer"></div>')}
        `
        : ''
    }
  `;

  res.send(pageShell({
    title: 'Results',
    user: data?.user || null,
    bodyHtml: body,
  }));
});

app.get('/portal/meet/:meetId/results/print', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const sections = computeMeetStandings(meet);
  const openSections = computeOpenResults(meet);

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Closed Meet Results</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 18px; color: #111; font-size: 12px; }
      h1, h2, h3 { margin: 0 0 8px 0; }
      .meta { margin: 4px 0 10px; color: #444; }
      .section { margin-bottom: 28px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
      th { font-size: 11px; text-transform: uppercase; color: #555; letter-spacing: .05em; }
      .note { font-size: 11px; color: #666; margin-top: 2px; }
    </style>
  </head>
  <body>
    <h1>${esc(meet.meetName)} — Closed Meet Results</h1>
    <div class="meta">${esc(meet.date || '')} ${meet.startTime ? `• ${esc(meet.startTime)}` : ''}</div>

    ${
      sections.map(section => `
        <div class="section">
          <h2>${esc(section.groupLabel)} — ${esc(cap(section.division))}</h2>
          <div class="meta">Champion: ${section.standings[0] ? esc(section.standings[0].skaterName) : '—'}</div>
          <table>
            <thead>
              <tr>
                <th>Place</th>
                <th>Skater</th>
                <th>Team</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              ${
                section.standings.map(row => `
                  <tr>
                    <td>${row.overallPlace}</td>
                    <td>
                      ${esc(row.skaterName || '')}
                      ${row.sponsor ? `<div class="note">Sponsor: ${esc(row.sponsor)}</div>` : ''}
                    </td>
                    <td>${esc(row.team || '')}</td>
                    <td>${Number(row.totalPoints || 0)}</td>
                  </tr>
                `).join('') || `<tr><td colspan="4">No standings yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      `).join('')
    }

    ${
      openSections.length
        ? `
          <h1 style="font-size:22px">Open Results</h1>
          ${openSections.map(section => `
            <div class="section">
              <h2>${esc(section.race.groupLabel)} — Open</h2>
              <div class="meta">${esc(section.race.distanceLabel)} • ${esc(cap(section.race.startType))} Start</div>
              <table>
                <thead>
                  <tr>
                    <th>Place</th>
                    <th>Skater</th>
                    <th>Team</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    section.rows.map(row => {
                      const reg = (meet.registrations || []).find(r => Number(r.id) === Number(row.registrationId));
                      return `
                        <tr>
                          <td>${esc(row.place)}</td>
                          <td>
                            ${esc(row.skaterName || '')}
                            ${reg?.sponsor ? `<div class="note">Sponsor: ${esc(reg.sponsor)}</div>` : ''}
                          </td>
                          <td>${esc(row.team || '')}</td>
                          <td>${esc(row.time || '')}</td>
                        </tr>
                      `;
                    }).join('') || `<tr><td colspan="4">No open results yet.</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          `).join('')}
        `
        : ''
    }
  </body>
</html>`;

  res.send(html);
});

app.get('/meet/:meetId/live', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  const data = getSessionUser(req);

  if (!meet) return res.redirect('/meets');
  if (!meet.isPublic) return res.redirect('/meets');

  const info = currentRaceInfo(meet);
  const current = info.current;
  const lanes = current ? laneRowsForRace(current, meet) : [];
  const recent = recentClosedRaces(meet, 5);
  const regMap = new Map((meet.registrations || []).map(r => [Number(r.id), r]));

  const body = `
    <h1>${esc(meet.meetName)}</h1>

    <div class="subTabs">
      <a class="subTab active" href="/meet/${meet.id}/live">Live</a>
      <a class="subTab" href="/meet/${meet.id}/schedule">Schedule</a>
      <a class="subTab" href="/meet/${meet.id}/results">Results</a>
    </div>

    <div class="grid3">
      <div class="statusCard orange">
        <div class="statusLabel">Current Race</div>
        <div class="statusTitle">${current ? esc(current.groupLabel) : '—'}</div>
        <div>${current ? `${esc(cap(current.division))} • ${esc(current.distanceLabel)} • Race ${Math.max(info.idx + 1, 1)} of ${info.ordered.length}` : ''}</div>
      </div>

      <div class="statusCard yellow">
        <div class="statusLabel">On Deck</div>
        <div class="statusTitle">${info.next ? esc(info.next.groupLabel) : '—'}</div>
        <div>${info.next ? `${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}` : ''}</div>
      </div>

      <div class="statusCard blue">
        <div class="statusLabel">Coming Up</div>
        <div class="statusTitle">${info.coming[0] ? esc(info.coming[0].groupLabel) : '—'}</div>
        <div>${info.coming[0] ? `${esc(cap(info.coming[0].division))} • ${esc(info.coming[0].distanceLabel)}` : ''}</div>
      </div>
    </div>

    <div class="spacer"></div>

    <div class="card">
      ${
        current
          ? `
            <h2>${esc(current.groupLabel)} — ${esc(cap(current.division))} — ${esc(current.distanceLabel)}</h2>
            <table class="table">
              <thead>
                <tr>
                  <th>Lane</th>
                  <th>Helmet</th>
                  <th>Skater</th>
                  <th>Team</th>
                  <th>${current.resultsMode === 'times' ? 'Time' : 'Place'}</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${lanes.map(l => {
                  const reg = regMap.get(Number(l.registrationId));
                  return `
                    <tr>
                      <td>${l.lane}</td>
                      <td>${l.helmetNumber ? '#' + esc(l.helmetNumber) : ''}</td>
                      <td>
                        ${esc(l.skaterName)}
                        ${sponsorLineHtml(reg?.sponsor || '')}
                      </td>
                      <td>${esc(l.team)}</td>
                      <td>${esc(current.resultsMode === 'times' ? l.time : l.place)}</td>
                      <td>${esc(l.status)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `
          : `<div class="muted">No race selected.</div>`
      }
    </div>

    <div class="spacer"></div>

    <div class="card">
      <h2>Recent Results</h2>
      ${
        recent.map(r => `
          <div style="margin-bottom:14px">
            <div style="font-weight:900">${esc(r.groupLabel)} — ${esc(cap(r.division))} — ${esc(r.distanceLabel)} — ${esc(raceDisplayStage(r))}</div>
            <table class="table">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Skater</th>
                  <th>Team</th>
                </tr>
              </thead>
              <tbody>
                ${
                  (r.laneEntries || [])
                    .filter(x => String(x.place || '').trim())
                    .sort((a, b) => Number(a.place || 999) - Number(b.place || 999))
                    .slice(0, 4)
                    .map(x => {
                      const reg = regMap.get(Number(x.registrationId));
                      return `
                        <tr>
                          <td>${esc(x.place)}</td>
                          <td>
                            ${esc(x.skaterName || '')}
                            ${sponsorLineHtml(reg?.sponsor || '')}
                          </td>
                          <td>${esc(x.team || '')}</td>
                        </tr>
                      `;
                    }).join('') || `<tr><td colspan="3" class="muted">No results entered.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        `).join('') || `<div class="muted">No recent results yet.</div>`
      }
    </div>

    <div class="spacer"></div>

    <div class="card">
      <div class="muted">This page updates automatically during the meet.</div>
    </div>

    <script>
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    </script>
  `;

  res.send(pageShell({
    title: 'Live',
    user: data?.user || null,
    bodyHtml: body,
  }));
});

app.get('/meet/:meetId/schedule', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  const data = getSessionUser(req);

  if (!meet) return res.redirect('/meets');
  if (!meet.isPublic) return res.redirect('/meets');

  const days = {};
  for (const block of meet.blocks || []) {
    const day = block.day || 'Day 1';
    if (!days[day]) days[day] = [];
    days[day].push(block);
  }

  const body = `
    <h1>${esc(meet.meetName)} Schedule</h1>

    <div class="subTabs">
      <a class="subTab" href="/meet/${meet.id}/live">Live</a>
      <a class="subTab active" href="/meet/${meet.id}/schedule">Schedule</a>
      <a class="subTab" href="/meet/${meet.id}/results">Results</a>
    </div>

    ${Object.keys(days).sort().map(day => `
      <div class="card">
        <h2>${esc(day)}</h2>
        ${(days[day] || []).map(block => `
          <div class="groupCard">
            <div class="row between">
              <div>
                <div style="font-weight:900">${esc(block.name)}</div>
                <div class="muted">${esc(cap(block.type || 'race'))}</div>
                ${block.notes ? `<div class="note">${esc(block.notes)}</div>` : ''}
              </div>
              <div class="chip">${(block.raceIds || []).length} races</div>
            </div>
          </div>
        `).join('<div class="spacer"></div>')}
      </div>
    `).join('<div class="spacer"></div>') || `<div class="card"><div class="muted">No schedule posted yet.</div></div>`}
  `;

  res.send(pageShell({
    title: 'Schedule',
    user: data?.user || null,
    bodyHtml: body,
  }));
});

app.get('/portal/meet/:meetId/registered/print-race-list', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  const blocksByDay = {};
  for (const block of meet.blocks || []) {
    const day = block.day || 'Day 1';
    if (!blocksByDay[day]) blocksByDay[day] = [];
    blocksByDay[day].push(block);
  }

  let raceNo = 1;
  const daySections = Object.keys(blocksByDay).sort().map(day => {
    const blockSections = blocksByDay[day].map(block => {
      const raceRows = (block.raceIds || []).map(rid => {
        const race = (meet.races || []).find(r => r.id === rid);
        if (!race) return '';

        return `
          <tr>
            <td>${raceNo++}</td>
            <td>${esc(race.groupLabel)}</td>
            <td>${esc(race.distanceLabel)}</td>
            <td>${esc(cap(race.division))}</td>
            <td>${esc(raceDisplayStage(race))}</td>
            <td>${esc(cap(race.startType))}</td>
            <td>$${esc(race.cost)}</td>
          </tr>
        `;
      }).join('');

      return `
        <div class="blockWrap">
          <h3>${esc(block.name)} <span class="muted">(${esc((block.type || 'race').toUpperCase())})</span></h3>
          ${block.notes ? `<div class="meta">${esc(block.notes)}</div>` : ''}
          ${
            (block.type || 'race') !== 'race'
              ? `<div class="meta">Non-race block</div>`
              : `
                <table>
                  <thead>
                    <tr>
                      <th>Race</th>
                      <th>Division</th>
                      <th>Distance</th>
                      <th>Class</th>
                      <th>Stage</th>
                      <th>Start</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${raceRows || `<tr><td colspan="7">No races in this block.</td></tr>`}
                  </tbody>
                </table>
              `
          }
        </div>
      `;
    }).join('');

    return `
      <div class="daySection">
        <h2>${esc(day)}</h2>
        ${blockSections}
      </div>
    `;
  }).join('');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Race List</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 18px; color: #111; font-size: 12px; }
      h1, h2, h3 { margin: 0 0 8px 0; }
      .meta { margin: 4px 0 10px; color: #444; }
      .daySection { margin-bottom: 28px; }
      .blockWrap { margin-bottom: 22px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
      th { font-size: 11px; text-transform: uppercase; color: #555; letter-spacing: .05em; }
    </style>
  </head>
  <body>
    <h1>${esc(meet.meetName)}</h1>
    <div class="meta">${esc(meet.date || '')} ${meet.startTime ? `• ${esc(meet.startTime)}` : ''}</div>
    ${daySections || '<div>No blocks yet.</div>'}
  </body>
</html>`;

  res.send(html);
});

app.listen(PORT, HOST, () => {
  console.log(`SpeedSkateMeet v18 listening on ${HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});