const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = process.env.SSM_DATA_FILE || path.join(DATA_DIR, 'ssm_db.json');
const DATA_VERSION = 14;
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

function nowIso() {
  return new Date().toISOString();
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

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
  res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`);
}

function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function baseDivisions() {
  const makeDivs = () => ({
    novice: { enabled: false, cost: 0, distances: ['', '', '', ''] },
    elite: { enabled: false, cost: 0, distances: ['', '', '', ''] },
    open: { enabled: false, cost: 0, distances: ['', '', '', ''] },
  });

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
  ].map((g) => ({ ...g, divisions: makeDivs() }));
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

function createMeet(ownerUserId) {
  return {
    id: null,
    createdByUserId: ownerUserId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    meetName: 'New Meet',
    date: '',
    startTime: '',
    registrationCloseAt: '',
    trackLength: 100,
    lanes: 4,
    rinkId: 1,
    timeTrialsEnabled: false,
    judgesPanelRequired: true,
    relayEnabled: false,
    notes: '',
    relayNotes: '',
    groups: baseDivisions(),
    races: [],
    blocks: [],
    registrations: [],
    currentRaceId: '',
    currentRaceIndex: -1,
    raceDayPaused: false,
  };
}

function sanitizeRinks(db) {
  db.rinks = (db.rinks || []).filter(r => !String(r.name || '').toLowerCase().includes('wichita skate center'));
  const hasRollerCity = (db.rinks || []).some(r => String(r.name || '').trim().toLowerCase() === 'roller city');
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
          state: 'KS'
        };
      }
      return r;
    });
  }
}

function migrateMeet(meet, fallbackOwnerId) {
  if (!Array.isArray(meet.groups) || meet.groups.length === 0) meet.groups = baseDivisions();
  if (!Array.isArray(meet.races)) meet.races = [];
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (!Array.isArray(meet.registrations)) meet.registrations = [];
  if (!meet.createdByUserId) meet.createdByUserId = fallbackOwnerId;
  if (typeof meet.startTime !== 'string') meet.startTime = '';
  if (typeof meet.registrationCloseAt !== 'string') meet.registrationCloseAt = '';
  if (typeof meet.currentRaceId !== 'string') meet.currentRaceId = '';
  if (typeof meet.currentRaceIndex !== 'number') meet.currentRaceIndex = -1;
  if (typeof meet.raceDayPaused !== 'boolean') meet.raceDayPaused = false;

  const ageMap = Object.fromEntries(baseDivisions().map(g => [g.id, { label: g.label, ages: g.ages }]));
  meet.groups = meet.groups.map(g => {
    const mapped = ageMap[g.id];
    const divs = g.divisions || {};
    for (const dk of ['novice', 'elite', 'open']) {
      if (!divs[dk]) divs[dk] = { enabled: false, cost: 0, distances: ['', '', '', ''] };
      if (!Array.isArray(divs[dk].distances)) divs[dk].distances = ['', '', '', ''];
      divs[dk].distances = [0, 1, 2, 3].map(i => String(divs[dk].distances[i] || '').trim());
      if (typeof divs[dk].enabled !== 'boolean') divs[dk].enabled = !!divs[dk].enabled;
      divs[dk].cost = Number(divs[dk].cost || 0);
    }
    return {
      ...g,
      label: mapped ? mapped.label : g.label,
      ages: mapped ? mapped.ages : g.ages,
      divisions: divs,
    };
  });

  meet.blocks = meet.blocks.map((b, idx) => ({
    id: b.id || `b${idx + 1}`,
    name: b.name || `Block ${idx + 1}`,
    day: b.day || 'Day 1',
    notes: String(b.notes || ''),
    raceIds: Array.isArray(b.raceIds) ? b.raceIds : [],
  }));

  meet.races = meet.races.map((r, idx) => ({
    id: r.id || crypto.randomBytes(6).toString('hex'),
    orderHint: Number(r.orderHint || idx + 1),
    groupId: r.groupId || '',
    groupLabel: r.groupLabel || '',
    ages: r.ages || '',
    division: r.division || 'elite',
    distanceLabel: String(r.distanceLabel || ''),
    dayIndex: Number(r.dayIndex || 1),
    laneEntries: Array.isArray(r.laneEntries) ? r.laneEntries : [],
    resultsMode: r.resultsMode || 'places',
    status: r.status || 'open',
    notes: String(r.notes || ''),
    isFinal: typeof r.isFinal === 'boolean' ? r.isFinal : true,
    closedAt: r.closedAt || '',
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
  db.meets.forEach(m => migrateMeet(m, fallbackOwner));
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
  return { db, token, session: sess, user };
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
    if (hasRole(data.user, 'super_admin') || roles.some(r => hasRole(data.user, r))) return next();
    return res.status(403).send(pageShell({
      title: 'Forbidden',
      user: data.user,
      bodyHtml: `<h1>Forbidden</h1><div class="card"><div class="danger">You do not have access to this page.</div></div>`
    }));
  };
}

function getMeetOr404(db, meetId) {
  return db.meets.find(m => Number(m.id) === Number(meetId));
}

function canEditMeet(user, meet) {
  return hasRole(user, 'super_admin') || Number(meet.createdByUserId) === Number(user.id);
}

function normalizeDistances(arr4) {
  return [0, 1, 2, 3].map(i => String(arr4?.[i] ?? '').trim());
}

function ensureAtLeastOneBlock(meet) {
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (meet.blocks.length === 0) {
    meet.blocks.push({ id: 'b1', name: 'Block 1', day: 'Day 1', notes: '', raceIds: [] });
  }
}

function generateRacesForMeet(meet) {
  const races = [];
  let n = 1;
  const oldMap = new Map((meet.races || []).map(r => [`${r.groupId}|${r.division}|${r.dayIndex}|${r.distanceLabel}`, r]));
  for (const g of meet.groups || []) {
    for (const divKey of ['novice', 'elite', 'open']) {
      const div = g.divisions?.[divKey];
      if (!div || !div.enabled) continue;
      const dists = normalizeDistances(div.distances);
      for (let i = 0; i < 4; i++) {
        const dist = dists[i];
        if (!dist) continue;
        const key = `${g.id}|${divKey}|${i + 1}|${dist}`;
        const old = oldMap.get(key);
        races.push({
          id: old?.id || ('r' + crypto.randomBytes(6).toString('hex')),
          orderHint: n++,
          groupId: g.id,
          groupLabel: g.label,
          ages: g.ages,
          division: divKey,
          distanceLabel: dist,
          dayIndex: i + 1,
          laneEntries: Array.isArray(old?.laneEntries) ? old.laneEntries : [],
          resultsMode: old?.resultsMode || 'places',
          status: old?.status || 'open',
          notes: String(old?.notes || ''),
          isFinal: typeof old?.isFinal === 'boolean' ? old.isFinal : true,
          closedAt: old?.closedAt || '',
        });
      }
    }
  }
  const validIds = new Set(races.map(r => r.id));
  meet.blocks = (meet.blocks || []).map(b => ({
    ...b,
    raceIds: (b.raceIds || []).filter(id => validIds.has(id)),
  }));
  meet.races = races;
  if (!validIds.has(meet.currentRaceId)) {
    meet.currentRaceId = '';
    meet.currentRaceIndex = -1;
  }
  meet.updatedAt = nowIso();
}

function orderedRaces(meet) {
  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const out = [];
  for (const b of meet.blocks || []) {
    for (const rid of b.raceIds || []) {
      const r = raceById.get(rid);
      if (r) out.push({ ...r, blockId: b.id, blockName: b.name, blockDay: b.day, blockNotes: b.notes || '' });
    }
  }
  const assigned = new Set(out.map(r => r.id));
  for (const r of meet.races || []) {
    if (!assigned.has(r.id)) out.push({ ...r, blockId: '', blockName: 'Unassigned', blockDay: '', blockNotes: '' });
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

function isRegistrationClosed(meet) {
  if (!meet.registrationCloseAt) return false;
  const t = new Date(meet.registrationCloseAt).getTime();
  return Number.isFinite(t) && Date.now() > t;
}

function combineDateTime(date, time) {
  const d = String(date || '').trim();
  const t = String(time || '').trim();
  if (!d) return '';
  if (!t) return `${d}T00:00:00`;
  return `${d}T${t}:00`;
}

function findAgeGroup(groups, age, genderGuess) {
  const n = Number(age);
  if (!Number.isFinite(n)) return null;
  const normalizedGender = String(genderGuess || '').toLowerCase();
  const candidates = groups.filter(g => {
    const ages = String(g.ages || '');
    if (ages.includes('& under')) return n <= Number(ages.match(/\d+/)?.[0] || 0);
    if (ages.includes('+')) return n >= Number(ages.match(/\d+/)?.[0] || 999);
    const nums = ages.match(/\d+/g) || [];
    if (nums.length >= 2) return n >= Number(nums[0]) && n <= Number(nums[1]);
    return false;
  });
  if (!candidates.length) return null;
  const byGender = candidates.find(g => normalizedGender && g.gender === normalizedGender);
  return byGender || candidates[0];
}

function divisionEnabledForRegistration(reg, division) {
  return !!reg.options?.[division];
}

function rebuildRaceAssignments(meet) {
  const regs = meet.registrations || [];
  const lanesPerRace = Math.max(1, Number(meet.lanes) || 4);

  for (const race of meet.races || []) {
    race.laneEntries = [];
  }

  for (const race of meet.races || []) {
    const matches = regs.filter(reg =>
      String(reg.divisionGroupId || '') === String(race.groupId || '') &&
      divisionEnabledForRegistration(reg, race.division)
    );

    race.laneEntries = matches.slice(0, lanesPerRace).map((reg, idx) => ({
      lane: idx + 1,
      registrationId: reg.id,
      skaterName: reg.name,
      team: reg.team,
      place: '',
      time: '',
      status: '',
    }));
  }

  meet.updatedAt = nowIso();
}

function laneRowsForRace(race, meet) {
  const lanes = [];
  const maxLanes = Math.max(1, Number(meet.lanes) || 4);
  for (let i = 1; i <= maxLanes; i++) {
    const existing = (race.laneEntries || []).find(x => Number(x.lane) === i) || {};
    lanes.push({
      lane: i,
      skaterName: existing.skaterName || '',
      team: existing.team || '',
      place: existing.place || '',
      time: existing.time || '',
      status: existing.status || '',
    });
  }
  return lanes;
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
        ${user ? `<a class="pill solid" href="/portal">Portal</a><a class="pill" href="/admin/logout">Logout</a>` : `<a class="pill solid" href="/admin/login">Admin Login</a>`}
      </div>
    </div>
  `;
}

function meetTabs(meet, active) {
  if (!meet) return '';
  const items = [
    ['builder', 'Meet Builder', `/portal/meet/${meet.id}/builder`],
    ['blocks', 'Block Builder', `/portal/meet/${meet.id}/blocks`],
    ['registered', 'Registered', `/portal/meet/${meet.id}/registered`],
    ['race-day', 'Race Day', `/portal/meet/${meet.id}/race-day/director`],
  ];
  return `<div class="meetTabs">${items.map(([key, label, href]) => `<a class="meetTab ${active === key ? 'active' : ''}" href="${href}">${label}</a>`).join('')}</div>`;
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
          --blue:#145af2;
          --green:#12b76a;
          --yellow:#f5b301;
          --red:#d92d20;
          --shadow:0 14px 34px rgba(15,23,42,.10);
          --radius:18px;
        }
        *{box-sizing:border-box}
        body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:var(--text);background:linear-gradient(180deg,var(--bg),var(--bg2));}
        a{text-decoration:none;color:var(--blue)}
        .topbar{max-width:1280px;margin:18px auto 0;padding:0 18px;display:flex;align-items:center;justify-content:space-between;gap:18px}
        .brandWrap{display:flex;align-items:center;gap:12px}
        .brandMark{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#0b1f3a,#1560f2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;letter-spacing:.6px;box-shadow:var(--shadow)}
        .brandText{font-weight:900;font-size:22px;letter-spacing:-.5px}
        .nav{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
        .pill{border:1px solid #c7d2fe;padding:10px 14px;border-radius:999px;background:rgba(255,255,255,.8);font-weight:800;color:#1d4ed8}
        .pill.solid{background:var(--blue);color:#fff;border-color:var(--blue)}
        .wrap{max-width:1280px;margin:22px auto 64px;padding:0 18px}
        .meetTabs{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 18px}
        .meetTab{padding:11px 14px;border-radius:14px;background:rgba(255,255,255,.8);border:1px solid var(--line);font-weight:900;color:#1e293b}
        .meetTab.active{background:var(--blue);border-color:var(--blue);color:#fff}
        h1{margin:14px 0 10px;font-size:42px;letter-spacing:-1px}
        h2{margin:0 0 8px;font-size:28px;letter-spacing:-.5px}
        h3{margin:0 0 8px;font-size:20px}
        .card{background:var(--card);border:1px solid rgba(148,163,184,.24);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px}
        .spacer{height:14px}
        .muted{color:var(--muted)}
        .danger{color:var(--red);font-weight:900}
        .good{color:var(--green);font-weight:900}
        .row{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
        .between{justify-content:space-between}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        @media(max-width:1000px){.grid4,.grid3{grid-template-columns:1fr 1fr}}
        @media(max-width:860px){.grid2,.grid3,.grid4{grid-template-columns:1fr} .topbar{display:block}.nav{margin-top:12px}}
        label{display:block;font-size:13px;font-weight:900;margin-bottom:6px;color:#0f172a}
        input,select,textarea{width:100%;padding:12px 12px;border-radius:12px;border:1px solid var(--line);font-size:15px;outline:none;background:#fff}
        input:focus,select:focus,textarea:focus{border-color:#93c5fd;box-shadow:0 0 0 4px rgba(147,197,253,.28)}
        textarea{min-height:100px;resize:vertical}
        input[type=checkbox],input[type=radio]{width:auto;transform:scale(1.05)}
        .btn,.btn2,.btnDanger{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;padding:12px 16px;font-weight:900;cursor:pointer}
        .btn{background:var(--blue);color:#fff}
        .btn2{background:#fff;color:#1e40af;border:2px solid #c7d2fe}
        .btnDanger{background:#fff;color:#b42318;border:2px solid #fecaca}
        .hr{height:1px;background:rgba(148,163,184,.25);margin:14px 0}
        .chip{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:999px;background:#f8fbff;border:1px solid var(--line);font-weight:900}
        .small{font-size:12px}
        .groupCard{padding:16px;border-radius:16px;border:1px solid rgba(148,163,184,.25);background:#fff}
        .bb{display:grid;grid-template-columns:1.25fr .85fr;gap:16px}
        @media(max-width:1040px){.bb{grid-template-columns:1fr}}
        .block{border:1px solid rgba(148,163,184,.25);background:#fff;border-radius:16px;padding:14px}
        .blockHead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .dropZone{min-height:42px;padding:8px;border-radius:14px;border:2px dashed rgba(148,163,184,.35);background:#f8fbff}
        .dropZone.over{border-color:#7cb3ff;background:#eaf3ff}
        .raceItem{border:1px solid rgba(148,163,184,.25);background:#fff;border-radius:14px;padding:10px;margin:8px 0;cursor:grab}
        .raceItem.activeCurrent{border-color:#12b76a;box-shadow:0 0 0 3px rgba(18,183,106,.13)}
        .raceMeta{font-size:12px;color:var(--muted);margin-top:3px}
        .rightCol{position:sticky;top:12px;align-self:start}
        .table{width:100%;border-collapse:collapse}
        .table th,.table td{padding:11px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
        .table th{font-size:12px;text-transform:uppercase;color:#475569;letter-spacing:.05em}
        .subTabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
        .subTab{padding:11px 14px;border-radius:12px;background:#fff;border:1px solid var(--line);font-weight:900;color:#0f172a}
        .subTab.active{background:var(--blue);color:#fff;border-color:var(--blue)}
        .statusCard{border-radius:18px;padding:16px;color:#fff;box-shadow:var(--shadow)}
        .statusCard.green{background:linear-gradient(135deg,#0ea765,#18c77a)}
        .statusCard.yellow{background:linear-gradient(135deg,#d29600,#f7ba10)}
        .statusCard.blue{background:linear-gradient(135deg,#0f4cd3,#3a82ff)}
        .statusCard.gray{background:linear-gradient(135deg,#475467,#667085)}
        .statusLabel{font-size:12px;opacity:.9;text-transform:uppercase;letter-spacing:.08em;font-weight:900}
        .statusTitle{font-size:24px;font-weight:900;margin-top:5px;line-height:1.1}
        .note{font-size:13px;color:var(--muted)}
        .codeBox{background:#0b1220;color:#dbeafe;padding:12px;border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;overflow:auto}
        .stackForm{display:flex;flex-direction:column;gap:14px}
        .actionRow{display:flex;gap:8px;flex-wrap:wrap}
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

/* Public */
app.get('/', (req, res) => {
  const data = getSessionUser(req);
  const body = `
    <h1>SpeedSkateMeet</h1>
    <div class="grid2">
      <div class="card">
        <h2>Built for real rink race days</h2>
        <div class="muted">Meet Builder → Block Builder → Registered → Race Day.</div>
        <div class="spacer"></div>
        <div class="row">
          <a class="btn" href="/meets">Find a Meet</a>
          <a class="btn2" href="/rinks">Find a Rink</a>
          <a class="btn2" href="/live">Live Race Day</a>
        </div>
      </div>
      <div class="card">
        <h2>Why it works</h2>
        <div class="note">Simple meet setup. Clean race-day controls. Judges and directors on the same page. No fake default meets. Roller City is the only default rink.</div>
        <div class="spacer"></div>
        ${data ? `<a class="btn" href="/portal">Go to Portal</a>` : `<a class="btn" href="/admin/login">Admin Login</a>`}
      </div>
    </div>`;
  res.send(pageShell({ title: 'Home', user: data?.user || null, bodyHtml: body }));
});

app.get('/meets', (req, res) => {
  const db = loadDb();
  const data = getSessionUser(req);
  res.send(pageShell({
    title: 'Find a Meet',
    user: data?.user || null,
    bodyHtml: `<h1>Find a Meet</h1>${publicMeetCards(db) || `<div class="card"><div class="muted">No meets yet.</div></div>`}`
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
          ${r.website ? `<div><b>Website:</b> <a href="https://${esc(r.website)}" target="_blank" rel="noreferrer">${esc(r.website)}</a></div>` : ''}
        </div>
        ${data?.user && (hasRole(data.user, 'super_admin') || hasRole(data.user, 'meet_director')) ? `<a class="btn2" href="/portal/rinks">Edit Rinks</a>` : ''}
      </div>
    </div>`).join('<div class="spacer"></div>');
  res.send(pageShell({ title: 'Rinks', user: data?.user || null, bodyHtml: `<h1>Rinks</h1>${cards}` }));
});

app.get('/live', (req, res) => {
  const db = loadDb();
  const data = getSessionUser(req);
  const cards = db.meets.map(m => `
    <div class="card">
      <h2>${esc(m.meetName)}</h2>
      <div class="muted">Public live page for this meet.</div>
      <div class="spacer"></div>
      <a class="btn" href="/meet/${m.id}/live">Open Live Board</a>
    </div>`).join('<div class="spacer"></div>');
  res.send(pageShell({
    title: 'Live Race Day',
    user: data?.user || null,
    bodyHtml: `<h1>Live Race Day</h1>${cards || `<div class="card"><div class="muted">No live meets yet.</div></div>`}`
  }));
});

app.get('/meet/:meetId/register', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  const data = getSessionUser(req);
  if (!meet) return res.redirect('/meets');
  const closed = isRegistrationClosed(meet);

  const body = `
    <h1>Register</h1>
    <div class="card">
      <h2>${esc(meet.meetName)}</h2>
      <div class="muted">${esc(meet.date || '')} ${meet.startTime ? `• ${esc(meet.startTime)}` : ''}</div>
      <div class="spacer"></div>
      ${closed ? `<div class="danger">Registration Closed</div>` : `
      <form method="POST" action="/meet/${meet.id}/register">
        <div class="grid3">
          <div><label>Skater Name</label><input name="name" required /></div>
          <div><label>Age</label><input name="age" required /></div>
          <div><label>Gender</label>
            <select name="gender">
              <option value="boys">Boy</option>
              <option value="girls">Girl</option>
              <option value="men">Man</option>
              <option value="women">Woman</option>
            </select>
          </div>
          <div><label>Team</label><input name="team" list="teams-register" value="Midwest Racing" /></div>
        </div>
        <datalist id="teams-register">${TEAM_LIST.map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>
        <div class="spacer"></div>
        <div class="row">
          <label><input type="checkbox" name="challengeUp" /> Challenge Up</label>
          <label><input type="checkbox" name="novice" /> Novice</label>
          <label><input type="checkbox" name="elite" /> Elite</label>
          <label><input type="checkbox" name="open" /> Open</label>
          <label><input type="checkbox" name="timeTrials" /> Time Trials</label>
          <label><input type="checkbox" name="relays" /> Relays</label>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Register Skater</button>
      </form>`}
    </div>`;
  res.send(pageShell({ title: 'Register', user: data?.user || null, bodyHtml: body }));
});

app.post('/meet/:meetId/register', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  if (!meet) return res.redirect('/meets');
  if (isRegistrationClosed(meet)) return res.redirect(`/meet/${meet.id}/register`);

  const gender = String(req.body.gender || '').trim() || 'boys';
  const group = findAgeGroup(meet.groups, req.body.age, gender);
  const meetNumber = (meet.registrations.reduce((max, r) => Math.max(max, Number(r.meetNumber) || 0), 0) + 1);

  meet.registrations.push({
    id: nextId(meet.registrations),
    createdAt: nowIso(),
    name: String(req.body.name || '').trim(),
    age: Number(req.body.age || 0),
    gender,
    team: String(req.body.team || 'Midwest Racing').trim() || 'Midwest Racing',
    divisionGroupId: group?.id || '',
    divisionGroupLabel: group?.label || 'Unassigned',
    meetNumber,
    options: {
      challengeUp: !!req.body.challengeUp,
      novice: !!req.body.novice,
      elite: !!req.body.elite,
      open: !!req.body.open,
      timeTrials: !!req.body.timeTrials,
      relays: !!req.body.relays,
    },
  });

  rebuildRaceAssignments(meet);
  ensureCurrentRace(meet);
  saveDb(db);
  res.redirect(`/meet/${meet.id}/register?ok=1`);
});

app.get('/meet/:meetId/live', (req, res) => {
  const db = loadDb();
  const meet = getMeetOr404(db, req.params.meetId);
  const data = getSessionUser(req);
  if (!meet) return res.redirect('/meets');

  const info = currentRaceInfo(meet);
  const current = info.current;
  const lanes = current ? laneRowsForRace(current, meet) : [];

  const body = `
    <h1>${esc(meet.meetName)}</h1>
    <div class="grid3">
      <div class="statusCard green"><div class="statusLabel">Current Race</div><div class="statusTitle">${current ? esc(current.groupLabel) : '—'}</div><div>${current ? `${esc(current.distanceLabel)} • Race ${Math.max(info.idx + 1, 1)} of ${info.ordered.length}` : ''}</div></div>
      <div class="statusCard yellow"><div class="statusLabel">On Deck</div><div class="statusTitle">${info.next ? esc(info.next.groupLabel) : '—'}</div><div>${info.next ? esc(info.next.distanceLabel) : ''}</div></div>
      <div class="statusCard blue"><div class="statusLabel">Coming Up</div><div class="statusTitle">${info.coming[0] ? esc(info.coming[0].groupLabel) : '—'}</div><div>${info.coming[0] ? esc(info.coming[0].distanceLabel) : ''}</div></div>
    </div>
    <div class="spacer"></div>
    <div class="card">${current ? `<h2>${esc(current.groupLabel)} — ${esc(current.distanceLabel)}</h2><table class="table"><thead><tr><th>Lane</th><th>Skater</th><th>Team</th><th>${current.resultsMode === 'times' ? 'Time' : 'Place'}</th><th>Status</th></tr></thead><tbody>${lanes.map(l => `<tr><td>${l.lane}</td><td>${esc(l.skaterName)}</td><td>${esc(l.team)}</td><td>${esc(current.resultsMode === 'times' ? l.time : l.place)}</td><td>${esc(l.status)}</td></tr>`).join('')}</tbody></table>` : `<div class="muted">No race selected.</div>`}</div>
    <div class="spacer"></div>
    <div class="card"><div class="muted">Refresh this page during the meet to follow what race is happening.</div></div>`;
  res.send(pageShell({ title: 'Live', user: data?.user || null, bodyHtml: body }));
});

/* Login */
app.get('/admin/login', (req, res) => {
  const body = `
    <h1>Admin Login</h1>
    <div class="card">
      <form method="POST" action="/admin/login">
        <div class="grid2">
          <div><label>Username</label><input name="username" autocomplete="username" required /></div>
          <div><label>Password</label><input name="password" type="password" autocomplete="current-password" required /></div>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Login</button>
      </form>
    </div>`;
  res.send(pageShell({ title: 'Admin Login', user: null, bodyHtml: body }));
});

app.post('/admin/login', (req, res) => {
  const db = loadDb();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  const user = db.users.find(u => u.username === username && u.password === password && u.active !== false);
  if (!user) {
    return res.send(pageShell({
      title: 'Admin Login',
      user: null,
      bodyHtml: `<h1>Admin Login</h1><div class="card"><div class="danger">Invalid login.</div><div class="spacer"></div><a class="btn2" href="/admin/login">Try again</a></div>`
    }));
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions = db.sessions.filter(s => s.userId !== user.id);
  db.sessions.push({ token, userId: user.id, createdAt: nowIso(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
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

/* Portal */
app.get('/portal', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const visibleMeets = hasRole(req.user, 'super_admin') ? req.db.meets : req.db.meets.filter(m => m.createdByUserId === req.user.id);
  const cards = visibleMeets.map(m => `
    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(m.meetName)}</h2>
          <div class="muted small">Meet ID: ${esc(m.id)} • Owner: ${Number(m.createdByUserId) === Number(req.user.id) || hasRole(req.user, 'super_admin') ? 'You' : 'Another director'}</div>
        </div>
        <div class="row">
          <span class="chip">Races: ${esc((m.races || []).length)}</span>
          <span class="chip">Regs: ${esc((m.registrations || []).length)}</span>
          <span class="chip">Blocks: ${esc((m.blocks || []).length)}</span>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="row">
        ${canEditMeet(req.user, m) ? `<a class="btn" href="/portal/meet/${m.id}/builder">Open Meet</a>` : `<a class="btn2" href="/portal/meet/${m.id}/race-day/director">View Race Day</a>`}
        <a class="btn2" href="/meet/${m.id}/live">Public Live</a>
        ${canEditMeet(req.user, m) ? `<a class="btnDanger" href="/portal/meet/${m.id}/delete-confirm">Delete Meet</a>` : ``}
      </div>
    </div>`).join('<div class="spacer"></div>');

  const body = `
    <h1>Director Portal</h1>
    <div class="muted">Nothing appears until you build a meet.</div>
    <div class="spacer"></div>
    <div class="row">
      ${(hasRole(req.user, 'super_admin') || hasRole(req.user, 'meet_director')) ? `<form method="POST" action="/portal/create-meet"><button class="btn" type="submit">Build New Meet</button></form>` : ''}
      ${(hasRole(req.user, 'super_admin') || hasRole(req.user, 'meet_director')) ? `<a class="btn2" href="/portal/rinks">Add / Edit Rinks</a>` : ''}
      ${hasRole(req.user, 'super_admin') ? `<a class="btn2" href="/portal/users">Users</a>` : ''}
    </div>
    <div class="spacer"></div>
    ${cards || `<div class="card"><div class="muted">No meets yet. Click “Build New Meet”.</div></div>`}`;
  res.send(pageShell({ title: 'Portal', user: req.user, bodyHtml: body }));
});

app.post('/portal/create-meet', requireRole('meet_director'), (req, res) => {
  const meet = createMeet(req.user.id);
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
      <div class="danger">This will permanently delete this meet and all of its races, blocks, and registrations.</div>
      <div class="spacer"></div>
      <h2>${esc(meet.meetName)}</h2>
      <div class="muted">Meet ID: ${esc(meet.id)}</div>
      <div class="spacer"></div>
      <form method="POST" action="/portal/meet/${meet.id}/delete">
        <button class="btnDanger" type="submit">Delete Meet Permanently</button>
        <a class="btn2" href="/portal">Cancel</a>
      </form>
    </div>`;
  res.send(pageShell({ title: 'Delete Meet', user: req.user, bodyHtml: body }));
});

app.post('/portal/meet/:meetId/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  req.db.meets = req.db.meets.filter(m => Number(m.id) !== Number(req.params.meetId));
  saveDb(req.db);
  res.redirect('/portal');
});

/* Rinks */
app.get('/portal/rinks', requireRole('meet_director'), (req, res) => {
  const rows = req.db.rinks.map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td>${esc(r.city || '')}, ${esc(r.state || '')}</td>
      <td>${esc(r.phone || '')}</td>
      <td><a class="btn2 small" href="/portal/rinks/${r.id}/edit">Edit</a></td>
    </tr>`).join('');
  const body = `
    <h1>Rink Admin</h1>
    <div class="card">
      <div class="row between"><h2 style="margin:0">Rinks</h2><a class="btn" href="/portal/rinks/new">Add Rink</a></div>
      <div class="spacer"></div>
      <table class="table"><thead><tr><th>Name</th><th>City/State</th><th>Phone</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  res.send(pageShell({ title: 'Rink Admin', user: req.user, bodyHtml: body }));
});

function rinkForm(rink, action, title) {
  return `
    <h1>${esc(title)}</h1>
    <div class="card">
      <form method="POST" action="${action}">
        <div class="grid2">
          <div><label>Name</label><input name="name" value="${esc(rink.name || '')}" required /></div>
          <div><label>Phone</label><input name="phone" value="${esc(rink.phone || '')}" /></div>
          <div><label>Address</label><input name="address" value="${esc(rink.address || '')}" /></div>
          <div><label>Website</label><input name="website" value="${esc(rink.website || '')}" /></div>
          <div><label>City</label><input name="city" value="${esc(rink.city || '')}" /></div>
          <div><label>State</label><input name="state" value="${esc(rink.state || '')}" /></div>
          <div><label>Team</label><input name="team" value="${esc(rink.team || '')}" /></div>
        </div>
        <div class="spacer"></div>
        <label>Notes</label>
        <textarea name="notes">${esc(rink.notes || '')}</textarea>
        <div class="spacer"></div>
        <button class="btn" type="submit">Save Rink</button>
        <a class="btn2" href="/portal/rinks">Back</a>
      </form>
    </div>`;
}

app.get('/portal/rinks/new', requireRole('meet_director'), (req, res) => {
  res.send(pageShell({ title: 'Add Rink', user: req.user, bodyHtml: rinkForm({}, '/portal/rinks/new', 'Add Rink') }));
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
  res.send(pageShell({ title: 'Edit Rink', user: req.user, bodyHtml: rinkForm(rink, `/portal/rinks/${rink.id}/edit`, 'Edit Rink') }));
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
    team: String(req.body.team || '').trim(),
    notes: String(req.body.notes || '').trim(),
  });
  sanitizeRinks(req.db);
  saveDb(req.db);
  res.redirect('/portal/rinks');
});

/* Users */
app.get('/portal/users', requireRole('super_admin'), (req, res) => {
  const rows = req.db.users.map(u => `
    <tr>
      <td>${esc(u.displayName || u.username)}</td>
      <td>${esc(u.username)}</td>
      <td>${esc((u.roles || []).join(', '))}</td>
      <td>${esc(u.team || '')}</td>
      <td>${u.active === false ? 'Off' : 'On'}</td>
    </tr>`).join('');
  const body = `
    <h1>Users</h1>
    <div class="card">
      <form method="POST" action="/portal/users/new">
        <div class="grid4">
          <div><label>Name</label><input name="displayName" required /></div>
          <div><label>Username</label><input name="username" required /></div>
          <div><label>Password / PIN</label><input name="password" required /></div>
          <div><label>Team</label><input name="team" list="teams-users" value="Midwest Racing" /></div>
        </div>
        <datalist id="teams-users">${TEAM_LIST.map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>
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
      <table class="table"><thead><tr><th>Name</th><th>Username</th><th>Roles</th><th>Team</th><th>Active</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  res.send(pageShell({ title: 'Users', user: req.user, bodyHtml: body }));
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

/* Meet Builder */
app.get('/portal/meet/:meetId/builder', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) {
    return res.status(403).send(pageShell({
      title: 'Forbidden',
      user: req.user,
      bodyHtml: `<h1>Forbidden</h1><div class="card"><div class="danger">Only the meet owner can edit this meet.</div></div>`
    }));
  }

  const rinkOptions = req.db.rinks.map(r => `<option value="${r.id}" ${Number(meet.rinkId) === Number(r.id) ? 'selected' : ''}>${esc(r.name)} (${esc(r.city || '')}, ${esc(r.state || '')})</option>`).join('');

  const groupsHtml = meet.groups.map((g, gi) => {
    const rows = ['novice', 'elite', 'open'].map(divKey => {
      const div = g.divisions[divKey];
      return `
        <div class="groupCard">
          <div class="row between">
            <label style="margin:0"><input type="checkbox" name="g_${gi}_${divKey}_enabled" ${div.enabled ? 'checked' : ''}/> ${divKey.toUpperCase()}</label>
            <div style="min-width:140px"><label>Cost</label><input name="g_${gi}_${divKey}_cost" value="${esc(div.cost)}" /></div>
          </div>
          <div class="spacer"></div>
          <div class="grid4">
            <div><label>D1</label><input name="g_${gi}_${divKey}_d1" value="${esc(div.distances[0] || '')}" /></div>
            <div><label>D2</label><input name="g_${gi}_${divKey}_d2" value="${esc(div.distances[1] || '')}" /></div>
            <div><label>D3</label><input name="g_${gi}_${divKey}_d3" value="${esc(div.distances[2] || '')}" /></div>
            <div><label>D4</label><input name="g_${gi}_${divKey}_d4" value="${esc(div.distances[3] || '')}" /></div>
          </div>
        </div>`;
    }).join('<div class="spacer"></div>');
    return `
      <div class="card">
        <div class="row between"><div><h3>${esc(g.label)}</h3><div class="muted">${esc(g.ages)}</div></div></div>
        <div class="hr"></div>
        ${rows}
      </div>`;
  }).join('<div class="spacer"></div>');

  const body = `
    <h1>Meet Builder</h1>
    <form method="POST" action="/portal/meet/${meet.id}/builder/save" class="stackForm">
      <div class="card">
        <div class="row between">
          <h2 style="margin:0">Meet Setup</h2>
          <button class="btn" type="submit">Save Meet & Generate Race List</button>
        </div>
        <div class="spacer"></div>
        <div class="grid3">
          <div><label>Meet Name</label><input name="meetName" value="${esc(meet.meetName)}" required /></div>
          <div><label>Date</label><input type="date" name="date" value="${esc(meet.date)}" /></div>
          <div><label>Start Time</label><input type="time" name="startTime" value="${esc(meet.startTime)}" /></div>
          <div><label>Registration Close Date</label><input type="date" name="registrationCloseDate" value="${esc(meet.registrationCloseAt ? meet.registrationCloseAt.slice(0, 10) : '')}" /></div>
          <div><label>Registration Close Time</label><input type="time" name="registrationCloseTime" value="${esc(meet.registrationCloseAt ? meet.registrationCloseAt.slice(11, 16) : '')}" /></div>
          <div><label>Rink</label><select name="rinkId">${rinkOptions}</select></div>
          <div><label>Track Length</label><input name="trackLength" value="${esc(meet.trackLength)}" /></div>
          <div><label>Lanes</label><input name="lanes" value="${esc(meet.lanes)}" /></div>
        </div>
        <div class="hr"></div>
        <div class="row">
          <label><input type="checkbox" name="timeTrialsEnabled" ${meet.timeTrialsEnabled ? 'checked' : ''}/> Time Trials</label>
          <label><input type="checkbox" name="relayEnabled" ${meet.relayEnabled ? 'checked' : ''}/> Relays</label>
          <label><input type="checkbox" name="judgesPanelRequired" ${meet.judgesPanelRequired ? 'checked' : ''}/> Judges Panel Required</label>
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
          <div class="muted">Saving now keeps divisions, distances, and race generation together.</div>
          <button class="btn" type="submit">Save Meet & Generate Race List</button>
        </div>
      </div>
    </form>`;
  res.send(pageShell({ title: 'Meet Builder', user: req.user, meet, activeTab: 'builder', bodyHtml: body }));
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
  meet.trackLength = Number(req.body.trackLength || 100);
  meet.lanes = Number(req.body.lanes || 4);
  meet.timeTrialsEnabled = !!req.body.timeTrialsEnabled;
  meet.relayEnabled = !!req.body.relayEnabled;
  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;
  meet.notes = String(req.body.notes || '');
  meet.relayNotes = String(req.body.relayNotes || '');

  meet.groups.forEach((g, gi) => {
    for (const divKey of ['novice', 'elite', 'open']) {
      const enabled = !!req.body[`g_${gi}_${divKey}_enabled`];
      const cost = Number(String(req.body[`g_${gi}_${divKey}_cost`] || '0').trim() || 0);
      const d1 = String(req.body[`g_${gi}_${divKey}_d1`] || '').trim();
      const d2 = String(req.body[`g_${gi}_${divKey}_d2`] || '').trim();
      const d3 = String(req.body[`g_${gi}_${divKey}_d3`] || '').trim();
      const d4 = String(req.body[`g_${gi}_${divKey}_d4`] || '').trim();
      g.divisions[divKey] = { enabled, cost, distances: [d1, d2, d3, d4] };
    }
  });

  generateRacesForMeet(meet);
  rebuildRaceAssignments(meet);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

/* Blocks */
app.get('/portal/meet/:meetId/blocks', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) {
    return res.status(403).send(pageShell({
      title: 'Forbidden',
      user: req.user,
      bodyHtml: `<h1>Forbidden</h1><div class="card"><div class="danger">Only the meet owner can edit this meet.</div></div>`
    }));
  }

  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  saveDb(req.db);

  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const assigned = new Set();
  for (const b of meet.blocks || []) for (const rid of b.raceIds || []) assigned.add(rid);
  const unassigned = (meet.races || []).filter(r => !assigned.has(r.id));

  const blocksHtml = meet.blocks.map(b => `
    <div class="block">
      <div class="blockHead">
        <div>
          <div style="font-weight:900;font-size:18px">${esc(b.name)}</div>
          <div class="muted small">${esc(b.day || 'Day 1')}</div>
        </div>
        <div class="row">
          <button class="btn2 small" type="button" onclick="renameBlock('${esc(b.id)}')">Rename</button>
          <button class="btnDanger small" type="button" onclick="deleteBlock('${esc(b.id)}')">Delete</button>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="grid2">
        <div>
          <label>Day</label>
          <select onchange="setBlockDay('${esc(b.id)}', this.value)">
            ${['Day 1', 'Day 2', 'Day 3'].map(day => `<option value="${day}" ${b.day === day ? 'selected' : ''}>${day}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Block Notes</label>
          <input value="${esc(b.notes || '')}" onblur="setBlockNotes('${esc(b.id)}', this.value)" placeholder="200m block / short break / practice" />
        </div>
      </div>
      <div class="spacer"></div>
      <div class="dropZone" data-drop-block="${esc(b.id)}">
        ${(b.raceIds || []).map(rid => {
          const r = raceById.get(rid);
          if (!r) return '';
          const isCurrent = meet.currentRaceId === r.id;
          return `<div class="raceItem ${isCurrent ? 'activeCurrent' : ''}" draggable="true" data-race-id="${esc(r.id)}"><div style="font-weight:900">${esc(r.groupLabel)} • ${esc(r.division.toUpperCase())}</div><div class="raceMeta">${esc(r.distanceLabel)} • D${esc(r.dayIndex)} • ${esc(r.ages)}</div></div>`;
        }).join('') || `<div class="note">Drop races here…</div>`}
      </div>
    </div>`).join('<div class="spacer"></div>');

  const unassignedHtml = unassigned.map(r => `<div class="raceItem ${meet.currentRaceId === r.id ? 'activeCurrent' : ''}" draggable="true" data-race-id="${esc(r.id)}"><div style="font-weight:900">${esc(r.groupLabel)} • ${esc(r.division.toUpperCase())}</div><div class="raceMeta">${esc(r.distanceLabel)} • D${esc(r.dayIndex)} • ${esc(r.ages)}</div></div>`).join('');

  const body = `
    <h1>Block Builder</h1>
    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="muted small">Right side = unassigned races. Left side = your blocks. Drag, drop, reorder, and save automatically.</div>
        </div>
        <div class="row">
          <button class="btn2" type="button" onclick="addBlock()">Add Block</button>
          <form method="POST" action="/portal/meet/${meet.id}/assign-races"><button class="btn2" type="submit">Build Race Assignments</button></form>
          <a class="btn" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="row">
        <span class="chip">Races: ${(meet.races || []).length}</span>
        <span class="chip">Unassigned: ${unassigned.length}</span>
        <span class="chip">Blocks: ${(meet.blocks || []).length}</span>
      </div>
    </div>
    <div class="spacer"></div>
    <div class="bb">
      <div>${blocksHtml}</div>
      <div class="rightCol">
        <div class="card">
          <h2 style="margin:0">Unassigned Races</h2>
          <div class="muted small">These show up here right after you save Meet Builder.</div>
          <div class="hr"></div>
          <div class="dropZone" data-drop-block="__unassigned__">${unassignedHtml || `<div class="note">No unassigned races.</div>`}</div>
        </div>
      </div>
    </div>
    <script>
      let dragRaceId = null;
      const meetId = ${JSON.stringify(meet.id)};
      function attachDnD(){
        document.querySelectorAll('.raceItem').forEach(el => {
          el.addEventListener('dragstart', e => {
            dragRaceId = el.getAttribute('data-race-id');
            e.dataTransfer.setData('text/plain', dragRaceId);
          });
        });
        document.querySelectorAll('.dropZone').forEach(zone => {
          zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
          zone.addEventListener('dragleave', () => zone.classList.remove('over'));
          zone.addEventListener('drop', async e => {
            e.preventDefault();
            zone.classList.remove('over');
            const raceId = e.dataTransfer.getData('text/plain') || dragRaceId;
            const destBlockId = zone.getAttribute('data-drop-block');
            const res = await fetch('/api/meet/' + meetId + '/blocks/move-race', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ raceId, destBlockId })
            });
            if (res.ok) location.reload(); else alert('Move failed');
          });
        });
      }
      async function addBlock(){
        const res = await fetch('/api/meet/' + meetId + '/blocks/add', { method:'POST' });
        if (res.ok) location.reload(); else alert('Add block failed');
      }
      async function renameBlock(id){
        const name = prompt('Block name:');
        if (!name) return;
        const res = await fetch('/api/meet/' + meetId + '/blocks/update-meta', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ blockId:id, name })
        });
        if (res.ok) location.reload(); else alert('Rename failed');
      }
      async function deleteBlock(id){
        if (!confirm('Delete this block? Its races will move back to Unassigned.')) return;
        const res = await fetch('/api/meet/' + meetId + '/blocks/delete', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ blockId:id })
        });
        if (res.ok) location.reload(); else alert('Delete block failed');
      }
      async function setBlockDay(id, day){
        await fetch('/api/meet/' + meetId + '/blocks/update-meta', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ blockId:id, day })
        });
      }
      async function setBlockNotes(id, notes){
        await fetch('/api/meet/' + meetId + '/blocks/update-meta', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ blockId:id, notes })
        });
      }
      attachDnD();
    </script>`;
  res.send(pageShell({ title: 'Block Builder', user: req.user, meet, activeTab: 'blocks', bodyHtml: body }));
});

app.post('/api/meet/:meetId/blocks/add', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');
  const n = meet.blocks.length + 1;
  meet.blocks.push({ id: 'b' + n, name: 'Block ' + n, day: 'Day 1', notes: '', raceIds: [] });
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.json({ ok: true });
});

app.post('/api/meet/:meetId/blocks/update-meta', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');
  const block = meet.blocks.find(b => b.id === String(req.body.blockId || ''));
  if (!block) return res.status(404).send('Not found');
  if (typeof req.body.name === 'string' && req.body.name.trim()) block.name = String(req.body.name).trim();
  if (typeof req.body.day === 'string' && req.body.day.trim()) block.day = String(req.body.day).trim();
  if (typeof req.body.notes === 'string') block.notes = String(req.body.notes);
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.json({ ok: true });
});

app.post('/api/meet/:meetId/blocks/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');
  const blockId = String(req.body.blockId || '');
  const block = meet.blocks.find(b => b.id === blockId);
  if (!block) return res.status(404).send('Block not found');
  meet.blocks = meet.blocks.filter(b => b.id !== blockId);
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
  for (const b of meet.blocks) b.raceIds = (b.raceIds || []).filter(id => id !== raceId);
  if (destBlockId !== '__unassigned__') {
    const block = meet.blocks.find(b => b.id === destBlockId);
    if (!block) return res.status(404).send('Block not found');
    block.raceIds.push(raceId);
  }
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.json({ ok: true });
});

app.post('/portal/meet/:meetId/assign-races', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  rebuildRaceAssignments(meet);
  ensureCurrentRace(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/registered`);
});

/* Registered */
app.get('/portal/meet/:meetId/registered', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const rows = (meet.registrations || []).map(r => `
    <tr>
      <td>${esc(r.meetNumber)}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.age)}</td>
      <td>${esc(r.team)}</td>
      <td>${esc(r.divisionGroupLabel || '')}</td>
      <td>${['challengeUp','novice','elite','open','timeTrials','relays'].filter(k => r.options?.[k]).join(', ') || '-'}</td>
      <td>
        <div class="actionRow">
          <a class="btn2 small" href="/portal/meet/${meet.id}/registered/${r.id}/edit">Edit</a>
          <a class="btnDanger small" href="/portal/meet/${meet.id}/registered/${r.id}/delete">Delete</a>
        </div>
      </td>
    </tr>`).join('');

  const body = `
    <h1>Registered</h1>
    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="muted small">Registration close: ${meet.registrationCloseAt ? esc(meet.registrationCloseAt.replace('T', ' ')) : 'Not set'}</div>
        </div>
        <div class="row">
          <form method="POST" action="/portal/meet/${meet.id}/assign-races"><button class="btn2" type="submit">Build Race Assignments</button></form>
          <a class="btn" href="/meet/${meet.id}/register" target="_blank">Open Public Registration</a>
          <a class="btn2" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>
      <div class="spacer"></div>
      <table class="table">
        <thead><tr><th>#</th><th>Name</th><th>Age</th><th>Team</th><th>Division</th><th>Options</th><th>Actions</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">No registrations yet.</td></tr>`}</tbody>
      </table>
    </div>`;
  res.send(pageShell({ title: 'Registered', user: req.user, meet, activeTab: 'registered', bodyHtml: body }));
});

function registrationForm(meet, reg, action, title) {
  const gender = reg.gender || 'boys';
  return `
    <h1>${esc(title)}</h1>
    <div class="card">
      <form method="POST" action="${action}">
        <div class="grid3">
          <div><label>Skater Name</label><input name="name" value="${esc(reg.name || '')}" required /></div>
          <div><label>Age</label><input name="age" value="${esc(reg.age || '')}" required /></div>
          <div><label>Gender</label>
            <select name="gender">
              <option value="boys" ${gender === 'boys' ? 'selected' : ''}>Boy</option>
              <option value="girls" ${gender === 'girls' ? 'selected' : ''}>Girl</option>
              <option value="men" ${gender === 'men' ? 'selected' : ''}>Man</option>
              <option value="women" ${gender === 'women' ? 'selected' : ''}>Woman</option>
            </select>
          </div>
          <div><label>Team</label><input name="team" list="teams-edit" value="${esc(reg.team || 'Midwest Racing')}" /></div>
        </div>
        <datalist id="teams-edit">${TEAM_LIST.map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>
        <div class="spacer"></div>
        <div class="row">
          <label><input type="checkbox" name="challengeUp" ${reg.options?.challengeUp ? 'checked' : ''}/> Challenge Up</label>
          <label><input type="checkbox" name="novice" ${reg.options?.novice ? 'checked' : ''}/> Novice</label>
          <label><input type="checkbox" name="elite" ${reg.options?.elite ? 'checked' : ''}/> Elite</label>
          <label><input type="checkbox" name="open" ${reg.options?.open ? 'checked' : ''}/> Open</label>
          <label><input type="checkbox" name="timeTrials" ${reg.options?.timeTrials ? 'checked' : ''}/> Time Trials</label>
          <label><input type="checkbox" name="relays" ${reg.options?.relays ? 'checked' : ''}/> Relays</label>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Save Racer</button>
        <a class="btn2" href="/portal/meet/${meet.id}/registered">Back</a>
      </form>
    </div>`;
}

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
    bodyHtml: registrationForm(meet, reg, `/portal/meet/${meet.id}/registered/${reg.id}/edit`, 'Edit Racer')
  }));
});

app.post('/portal/meet/:meetId/registered/:regId/edit', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  const reg = (meet.registrations || []).find(r => Number(r.id) === Number(req.params.regId));
  if (!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);

  const gender = String(req.body.gender || '').trim() || 'boys';
  const group = findAgeGroup(meet.groups, req.body.age, gender);

  reg.name = String(req.body.name || '').trim();
  reg.age = Number(req.body.age || 0);
  reg.gender = gender;
  reg.team = String(req.body.team || 'Midwest Racing').trim() || 'Midwest Racing';
  reg.divisionGroupId = group?.id || '';
  reg.divisionGroupLabel = group?.label || 'Unassigned';
  reg.options = {
    challengeUp: !!req.body.challengeUp,
    novice: !!req.body.novice,
    elite: !!req.body.elite,
    open: !!req.body.open,
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
      <div class="danger">This will remove ${esc(reg.name)} from registrations and race assignments.</div>
      <div class="spacer"></div>
      <form method="POST" action="/portal/meet/${meet.id}/registered/${reg.id}/delete">
        <button class="btnDanger" type="submit">Delete Racer</button>
        <a class="btn2" href="/portal/meet/${meet.id}/registered">Cancel</a>
      </form>
    </div>`;
  res.send(pageShell({ title: 'Delete Racer', user: req.user, meet, activeTab: 'registered', bodyHtml: body }));
});

app.post('/portal/meet/:meetId/registered/:regId/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');
  meet.registrations = (meet.registrations || []).filter(r => Number(r.id) !== Number(req.params.regId));
  rebuildRaceAssignments(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/registered`);
});

app.get('/portal/meet/:meetId/registered/print-race-list', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  const ordered = orderedRaces(meet);
  let raceNo = 1;
  const rows = ordered.map(r => `
    <tr>
      <td>${raceNo++}</td>
      <td>${esc(r.blockName || 'Unassigned')}</td>
      <td>${esc(r.blockDay || '')}</td>
      <td>${esc(r.groupLabel)}</td>
      <td>${esc(r.distanceLabel)}</td>
      <td>${esc(r.division.toUpperCase())}</td>
    </tr>`).join('');

  const body = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>Race List</title>
      <style>
        body{font-family:Arial,sans-serif;padding:18px;color:#111;font-size:12px}
        h1,h2{margin:0}
        .meta{margin:4px 0 14px;color:#444}
        table{width:100%;border-collapse:collapse}
        th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
        th{font-size:11px;text-transform:uppercase;color:#555;letter-spacing:.05em}
      </style>
    </head>
    <body>
      <h1>${esc(meet.meetName)}</h1>
      <div class="meta">${esc(meet.date || '')} ${meet.startTime ? `• ${esc(meet.startTime)}` : ''}</div>
      <table>
        <thead><tr><th>Race</th><th>Block</th><th>Day</th><th>Division</th><th>Distance</th><th>Class</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6">No races yet.</td></tr>`}</tbody>
      </table>
    </body>
  </html>`;
  res.send(body);
});

/* Race Day */
function raceDaySubTabs(meet, active) {
  const subs = [
    ['director', 'Director', `/portal/meet/${meet.id}/race-day/director`],
    ['judges', 'Judges', `/portal/meet/${meet.id}/race-day/judges`],
    ['announcer', 'Announcer', `/portal/meet/${meet.id}/race-day/announcer`],
    ['live', 'Live', `/portal/meet/${meet.id}/race-day/live`],
  ];
  return `<div class="subTabs">${subs.map(([k, label, href]) => `<a class="subTab ${active === k ? 'active' : ''}" href="${href}">${label}</a>`).join('')}</div>`;
}

app.get('/portal/meet/:meetId/race-day/:mode', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  const mode = String(req.params.mode || 'director');
  const info = currentRaceInfo(meet);
  const current = info.current;
  const currentLanes = current ? laneRowsForRace(current, meet) : [];
  let body = `<h1>Race Day</h1>${raceDaySubTabs(meet, mode)}`;

  if (mode === 'director') {
    const ordered = info.ordered;
    const raceOptions = ordered.map((r, idx) => `<option value="${r.id}" ${r.id === meet.currentRaceId ? 'selected' : ''}>${idx + 1}. ${esc(r.groupLabel)} – ${esc(r.distanceLabel)} – ${esc(r.division.toUpperCase())}</option>`).join('');
    body += `
      <div class="grid3">
        <div class="statusCard green"><div class="statusLabel">Current Race</div><div class="statusTitle">${current ? esc(current.groupLabel) : 'No race selected'}</div><div>${current ? `${esc(current.distanceLabel)} • ${esc(current.division.toUpperCase())}` : ''}</div></div>
        <div class="statusCard yellow"><div class="statusLabel">On Deck</div><div class="statusTitle">${info.next ? esc(info.next.groupLabel) : '—'}</div><div>${info.next ? `${esc(info.next.distanceLabel)} • ${esc(info.next.division.toUpperCase())}` : ''}</div></div>
        <div class="statusCard blue"><div class="statusLabel">Meet Progress</div><div class="statusTitle">${Math.max(info.idx + 1, 0)} of ${info.ordered.length}</div><div>${meet.raceDayPaused ? 'Paused' : 'Running'}</div></div>
      </div>
      <div class="spacer"></div>
      <div class="card">
        <div class="grid3">
          <div><label>Set Current Race</label><select onchange="setCurrentRace(this.value)">${raceOptions}</select></div>
          <div class="row" style="align-items:end"><button class="btn2" type="button" onclick="moveCurrent(-1)">Previous Race</button><button class="btn" type="button" onclick="moveCurrent(1)">Next Race</button></div>
          <div class="row" style="align-items:end"><button class="btn2" type="button" onclick="pauseMeet()">${meet.raceDayPaused ? 'Resume Meet' : 'Pause Meet'}</button>${current && current.status === 'closed' ? `<button class="btnDanger" type="button" onclick="unlockRace('${current.id}')">Unlock Race</button>` : ''}</div>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="grid2">
        <div class="card">
          <h2>Current Race Details</h2>
          ${current ? `<div class="row"><span class="chip">${esc(current.blockName || 'Unassigned')}</span><span class="chip">${esc(current.blockDay || '')}</span><span class="chip">Status: ${esc(current.status)}</span>${current.isFinal ? `<span class="chip">Final</span>` : `<span class="chip">Heat</span>`}</div><div class="spacer"></div><table class="table"><thead><tr><th>Lane</th><th>Skater</th><th>Team</th><th>Place/Time</th><th>Status</th></tr></thead><tbody>${currentLanes.map(l => `<tr><td>${l.lane}</td><td>${esc(l.skaterName || '')}</td><td>${esc(l.team || '')}</td><td>${esc(current.resultsMode === 'times' ? l.time : l.place)}</td><td>${esc(l.status || '')}</td></tr>`).join('')}</tbody></table><div class="spacer"></div><div class="note">Race Notes: ${esc(current.notes || 'None')}</div>` : `<div class="muted">No race selected yet.</div>`}
        </div>
        <div class="card">
          <h2>Coming Up</h2>
          <table class="table"><thead><tr><th>Race</th><th>Division</th><th>Distance</th><th>Block</th></tr></thead><tbody>${info.coming.map((r, i) => `<tr><td>${info.idx + i + 3}</td><td>${esc(r.groupLabel)}</td><td>${esc(r.distanceLabel)}</td><td>${esc(r.blockName || 'Unassigned')}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">Nothing queued.</td></tr>`}</tbody></table>
        </div>
      </div>
      <script>
        async function setCurrentRace(raceId){ const res = await fetch('/api/meet/${meet.id}/race-day/set-current', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({raceId})}); if(res.ok) location.reload(); }
        async function moveCurrent(dir){ const res = await fetch('/api/meet/${meet.id}/race-day/step', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({direction:dir})}); if(res.ok) location.reload(); }
        async function pauseMeet(){ const res = await fetch('/api/meet/${meet.id}/race-day/toggle-pause', {method:'POST'}); if(res.ok) location.reload(); }
        async function unlockRace(raceId){ const res = await fetch('/api/meet/${meet.id}/race-day/unlock-race', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({raceId})}); if(res.ok) location.reload(); }
      </script>`;
  } else if (mode === 'judges') {
    body += `
      <div class="card">
        <h2>${current ? `Race ${Math.max(info.idx + 1, 1)} — ${esc(current.groupLabel)} — ${esc(current.distanceLabel)}` : 'No race selected'}</h2>
        <div class="muted">Judges always land on the current race. Save, then close race when done.</div>
      </div>
      <div class="spacer"></div>
      ${current ? `<div class="card"><form method="POST" action="/portal/meet/${meet.id}/race-day/judges/save"><input type="hidden" name="raceId" value="${esc(current.id)}" /><div class="row"><label><input type="radio" name="resultsMode" value="places" ${current.resultsMode !== 'times' ? 'checked' : ''}/> Places</label><label><input type="radio" name="resultsMode" value="times" ${current.resultsMode === 'times' ? 'checked' : ''}/> Times</label><label><input type="checkbox" name="isFinal" ${current.isFinal ? 'checked' : ''}/> Final race</label></div><div class="spacer"></div><table class="table"><thead><tr><th>Lane</th><th>Skater</th><th>Team</th><th>Place</th><th>Time</th><th>Status</th></tr></thead><tbody>${currentLanes.map(l => `<tr><td>${l.lane}</td><td><input name="skaterName_${l.lane}" value="${esc(l.skaterName)}" /></td><td><input name="team_${l.lane}" value="${esc(l.team)}" /></td><td><input name="place_${l.lane}" value="${esc(l.place)}" /></td><td><input name="time_${l.lane}" value="${esc(l.time)}" /></td><td><select name="status_${l.lane}"><option value="" ${!l.status ? 'selected' : ''}>—</option><option value="DNS" ${l.status === 'DNS' ? 'selected' : ''}>DNS</option><option value="DQ" ${l.status === 'DQ' ? 'selected' : ''}>DQ</option><option value="Scratch" ${l.status === 'Scratch' ? 'selected' : ''}>Scratch</option></select></td></tr>`).join('')}</tbody></table><div class="spacer"></div><label>Race Notes / Officials Report</label><textarea name="notes">${esc(current.notes || '')}</textarea><div class="spacer"></div><div class="row"><button class="btn2" type="submit" name="action" value="save">Save</button><button class="btn" type="submit" name="action" value="close">Close Race</button></div></form></div>` : `<div class="card"><div class="muted">No race selected yet.</div></div>`}`;
  } else if (mode === 'announcer') {
    body += `
      <div class="grid3">
        <div class="statusCard green"><div class="statusLabel">Current Race</div><div class="statusTitle">${current ? esc(current.groupLabel) : '—'}</div><div>${current ? `${esc(current.distanceLabel)} • ${esc(current.division.toUpperCase())}` : ''}</div></div>
        <div class="statusCard yellow"><div class="statusLabel">On Deck</div><div class="statusTitle">${info.next ? esc(info.next.groupLabel) : '—'}</div><div>${info.next ? `${esc(info.next.distanceLabel)}` : ''}</div></div>
        <div class="statusCard blue"><div class="statusLabel">Coming Up</div><div class="statusTitle">${info.coming[0] ? esc(info.coming[0].groupLabel) : '—'}</div><div>${info.coming[0] ? esc(info.coming[0].distanceLabel) : ''}</div></div>
      </div>
      <div class="spacer"></div>
      <div class="card"><h2>Read This</h2>${current ? `<div class="codeBox">Now racing: ${esc(current.groupLabel)}, ${esc(current.division.toUpperCase())}, ${esc(current.distanceLabel)}.${currentLanes.map(l => l.skaterName ? `\nLane ${l.lane}: ${esc(l.skaterName)}${l.team ? ` — ${esc(l.team)}` : ''}` : '').join('')}</div>` : `<div class="muted">No race selected.</div>`}</div>`;
  } else {
    body += `
      <div class="grid3">
        <div class="statusCard green"><div class="statusLabel">Current Race</div><div class="statusTitle">${current ? esc(current.groupLabel) : '—'}</div><div>${current ? `${esc(current.distanceLabel)} • Race ${Math.max(info.idx + 1, 1)} of ${info.ordered.length}` : ''}</div></div>
        <div class="statusCard yellow"><div class="statusLabel">On Deck</div><div class="statusTitle">${info.next ? esc(info.next.groupLabel) : '—'}</div><div>${info.next ? esc(info.next.distanceLabel) : ''}</div></div>
        <div class="statusCard gray"><div class="statusLabel">Recent Result</div><div class="statusTitle">${current && current.status === 'closed' ? 'Results Posted' : 'Waiting'}</div><div>${current && current.status === 'closed' ? esc(current.groupLabel) : ''}</div></div>
      </div>
      <div class="spacer"></div>
      <div class="card">${current ? `<h2>${esc(current.groupLabel)} — ${esc(current.distanceLabel)}</h2><table class="table"><thead><tr><th>Lane</th><th>Skater</th><th>Team</th><th>${current.resultsMode === 'times' ? 'Time' : 'Place'}</th><th>Status</th></tr></thead><tbody>${currentLanes.map(l => `<tr><td>${l.lane}</td><td>${esc(l.skaterName)}</td><td>${esc(l.team)}</td><td>${esc(current.resultsMode === 'times' ? l.time : l.place)}</td><td>${esc(l.status)}</td></tr>`).join('')}</tbody></table>` : `<div class="muted">No live race selected.</div>`}</div>`;
  }
  res.send(pageShell({ title: 'Race Day', user: req.user, meet, activeTab: 'race-day', bodyHtml: body }));
});

app.post('/portal/meet/:meetId/race-day/judges/save', requireRole('judge', 'meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  const race = (meet.races || []).find(r => r.id === String(req.body.raceId || ''));
  if (!race) return res.redirect(`/portal/meet/${meet.id}/race-day/judges`);

  const lanes = Math.max(1, Number(meet.lanes) || 4);
  const laneEntries = [];
  for (let i = 1; i <= lanes; i++) {
    laneEntries.push({
      lane: i,
      skaterName: String(req.body[`skaterName_${i}`] || '').trim(),
      team: String(req.body[`team_${i}`] || '').trim(),
      place: String(req.body[`place_${i}`] || '').trim(),
      time: String(req.body[`time_${i}`] || '').trim(),
      status: String(req.body[`status_${i}`] || '').trim(),
    });
  }

  race.laneEntries = laneEntries;
  race.resultsMode = String(req.body.resultsMode || 'places') === 'times' ? 'times' : 'places';
  race.isFinal = !!req.body.isFinal;
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
});

/* Coach */
app.get('/portal/meet/:meetId/coach', requireRole('coach', 'meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  const myTeam = hasRole(req.user, 'super_admin') ? '' : String(req.user.team || '').trim();
  const regs = (meet.registrations || []).filter(r => !myTeam || String(r.team || '').trim() === myTeam);
  const info = currentRaceInfo(meet);
  const currentIds = new Set([info.current?.id].filter(Boolean));
  const nextIds = new Set([info.next?.id].filter(Boolean));

  const cardHtml = regs.map(r => {
    const upcoming = info.ordered.filter(or =>
      or.groupId === r.divisionGroupId &&
      ((r.options?.elite && or.division === 'elite') || (r.options?.novice && or.division === 'novice') || (r.options?.open && or.division === 'open'))
    ).slice(0, 3);

    const status = upcoming.length && currentIds.has(upcoming[0].id)
      ? 'NOW RACING'
      : (upcoming.length && nextIds.has(upcoming[0].id) ? 'UP NEXT' : 'LATER TODAY');

    return `<div class="card"><h3>${esc(r.name)}</h3><div class="muted">${esc(r.team)} • ${esc(r.divisionGroupLabel)}</div><div class="spacer"></div><span class="chip">${status}</span><div class="spacer"></div>${upcoming.map(u => `<div>${esc(u.groupLabel)} • ${esc(u.distanceLabel)} • ${esc(u.blockName)}</div>`).join('') || `<div class="muted">No generated races linked yet.</div>`}</div>`;
  }).join('<div class="spacer"></div>');

  const body = `<h1>Coach Panel</h1><div class="muted">Simple coach view: my skaters, race status, and what is coming up.</div><div class="spacer"></div>${cardHtml || `<div class="card"><div class="muted">No skaters on your team yet.</div></div>`}`;
  res.send(pageShell({ title: 'Coach Panel', user: req.user, meet, activeTab: 'race-day', bodyHtml: body }));
});

app.listen(PORT, HOST, () => {
  console.log(`SpeedSkateMeet v${DATA_VERSION} listening on ${HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
