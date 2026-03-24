// ============================================================
// SpeedSkateMeet – REBUILD v1 (Part 1/4)
// Core Engine + Data Model + Safe Rebuild System
// ============================================================

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

// ============================================================
// 🔥 NEW CORE FLAGS (future ready)
// ============================================================

const RACE_TYPES = {
  STANDARD: 'standard',
  QUAD: 'quad',
  OPEN: 'open',
  TIME_TRIAL: 'time_trial'
};

// ============================================================
// 🔧 UTIL
// ============================================================

function nowIso() {
  return new Date().toISOString();
}

function nextId(arr) {
  let max = 0;
  for (const item of arr || []) {
    max = Math.max(max, Number(item.id) || 0);
  }
  return max + 1;
}

// ============================================================
// 🔥 NEW: SAFE SCHEDULE DETECTION
// ============================================================

function hasExistingSchedule(meet) {
  return (meet.blocks || []).some(b => (b.raceIds || []).length > 0);
}

// ============================================================
// 🔥 NEW: BLOCK TYPE SYSTEM
// ============================================================

function createBlock(name, type = 'race', day = 'Day 1') {
  return {
    id: 'b' + crypto.randomBytes(4).toString('hex'),
    name,
    type, // race | practice | lunch | break | awards
    day,
    raceIds: [],
    notes: ''
  };
}

// ============================================================
// 🔥 UPDATED DEFAULT MEET (future ready)
// ============================================================

function defaultMeet(ownerUserId) {
  return {
    id: null,
    createdByUserId: ownerUserId,
    createdAt: nowIso(),
    updatedAt: nowIso(),

    meetName: 'New Meet',
    date: '',
    startTime: '',

    rinkId: 1,
    trackLength: 100,
    lanes: 4,

    // 🔥 NEW FLAGS
    quadEnabled: false,
    openEnabled: false,
    timeTrialsEnabled: false,

    groups: [],
    quadGroups: [],
    openGroups: [],

    races: [],
    blocks: [],

    registrations: [],

    currentRaceId: '',
    currentRaceIndex: -1
  };
}

// ============================================================
// 🔥 DB DEFAULT
// ============================================================

function defaultDb() {
  return {
    version: 20,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sessions: [],
    users: [
      {
        id: 1,
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
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
      },
    ],
    meets: [],
  };
}

// ============================================================
// 🔥 MIGRATION (SAFE)
// ============================================================

function migrateMeet(meet, fallbackOwnerId) {

  if (!meet.createdByUserId) meet.createdByUserId = fallbackOwnerId;
  if (!meet.createdAt) meet.createdAt = nowIso();
  if (!meet.updatedAt) meet.updatedAt = nowIso();

  if (!Array.isArray(meet.blocks)) meet.blocks = [];

  // 🔥 ADD NEW FLAGS SAFELY
  if (typeof meet.quadEnabled !== 'boolean') meet.quadEnabled = false;
  if (typeof meet.openEnabled !== 'boolean') meet.openEnabled = false;
  if (typeof meet.timeTrialsEnabled !== 'boolean') meet.timeTrialsEnabled = false;

  if (!Array.isArray(meet.quadGroups)) meet.quadGroups = [];
  if (!Array.isArray(meet.openGroups)) meet.openGroups = [];

  if (!Array.isArray(meet.races)) meet.races = [];
  if (!Array.isArray(meet.registrations)) meet.registrations = [];

  // 🔥 BLOCK TYPE SAFETY
  meet.blocks = meet.blocks.map((b, i) => ({
    id: b.id || ('b' + (i + 1)),
    name: b.name || `Block ${i + 1}`,
    type: b.type || 'race',
    day: b.day || 'Day 1',
    raceIds: Array.isArray(b.raceIds) ? b.raceIds : [],
    notes: b.notes || ''
  }));
}

// ============================================================
// 🔥 LOAD DB
// ============================================================

function loadDb() {
  let db = null;

  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.error('DB load failed:', e);
    }
  }

  if (!db) {
    db = defaultDb();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  }

  if (!Array.isArray(db.meets)) db.meets = [];

  const fallbackOwnerId = db.users[0]?.id || 1;
  db.meets.forEach(m => migrateMeet(m, fallbackOwnerId));

  return db;
}

// ============================================================
// 🔥 SAVE DB
// ============================================================

function saveDb(db) {
  db.updatedAt = nowIso();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// ============================================================
// 🔥 SAFE RACE GENERATION (CORE)
// ============================================================

function generateBaseRacesForMeet(meet) {

  const races = [];
  let order = 1;

  // STANDARD
  for (const group of meet.groups || []) {
    for (const div of ['novice', 'elite']) {

      if (!group.divisions?.[div]?.enabled) continue;

      for (const dist of group.divisions[div].distances || []) {
        if (!dist) continue;

        races.push({
          id: 'r' + crypto.randomBytes(6).toString('hex'),
          raceType: RACE_TYPES.STANDARD,
          groupId: group.id,
          groupLabel: group.label,
          division: div,
          distanceLabel: dist,
          orderHint: order++,
          stage: 'race',
          isFinal: false
        });
      }
    }
  }

  // 🔥 QUAD
  if (meet.quadEnabled) {
    for (const q of meet.quadGroups || []) {
      for (const dist of q.distances || []) {
        races.push({
          id: 'r' + crypto.randomBytes(6).toString('hex'),
          raceType: RACE_TYPES.QUAD,
          groupId: q.id,
          groupLabel: q.label,
          division: 'quad',
          distanceLabel: dist,
          orderHint: order++,
          stage: 'race',
          isFinal: false
        });
      }
    }
  }

  // 🔥 OPEN
  if (meet.openEnabled) {
    for (const o of meet.openGroups || []) {
      races.push({
        id: 'r' + crypto.randomBytes(6).toString('hex'),
        raceType: RACE_TYPES.OPEN,
        groupId: o.id,
        groupLabel: o.label,
        division: 'open',
        distanceLabel: o.distance,
        orderHint: order++,
        stage: 'final',
        isFinal: true
      });
    }
  }

  meet.races = races;
}

// ============================================================
// 🔥 SAFE REBUILD (NO MORE NUKES)
// ============================================================

function rebuildRaceAssignments(meet) {

  const hadSchedule = hasExistingSchedule(meet);

  if (hadSchedule) {
    // wipe assignments ONLY (not blocks)
    meet.blocks = meet.blocks.map(b => ({
      ...b,
      raceIds: []
    }));
  }

  generateBaseRacesForMeet(meet);

  meet.updatedAt = nowIso();
}

// ============================================================
// END PART 1
// ============================================================// ============================================================
// SpeedSkateMeet – REBUILD v18 (Part 2/4)
// Auth + Helpers + UI Shell + Portal + Meet/Quad/Open Builders
// ============================================================

// ============================================================
// SESSION / AUTH
// ============================================================

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

function hasRole(user, role) {
  return Array.isArray(user.roles) && user.roles.includes(role);
}

function getSessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;

  const db = loadDb();
  const sess = (db.sessions || []).find(s => s.token === token);
  if (!sess) return null;
  if (new Date(sess.expiresAt).getTime() <= Date.now()) return null;

  const user = (db.users || []).find(u => u.id === sess.userId && u.active !== false);
  if (!user) return null;

  return { db, session: sess, token, user };
}

function extendSession(db, token) {
  const sess = (db.sessions || []).find(s => s.token === token);
  if (sess) sess.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
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
  return (db.meets || []).find(m => Number(m.id) === Number(meetId));
}

function canEditMeet(user, meet) {
  return hasRole(user, 'super_admin') || Number(meet.createdByUserId) === Number(user.id);
}

function coachVisibleMeets(db, user) {
  if (hasRole(user, 'super_admin')) return db.meets || [];
  if (hasRole(user, 'meet_director')) {
    return (db.meets || []).filter(m => Number(m.createdByUserId) === Number(user.id));
  }
  if (hasRole(user, 'coach')) {
    return (db.meets || []).filter(m =>
      (m.registrations || []).some(r =>
        String(r.team || '').trim().toLowerCase() === String(user.team || '').trim().toLowerCase()
      )
    );
  }
  return [];
}

// ============================================================
// DISPLAY HELPERS
// ============================================================

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

function sponsorLineHtml(sponsor) {
  const s = String(sponsor || '').trim();
  if (!s) return '';
  return `<div class="note"><b>Sponsor:</b> ${esc(s)}</div>`;
}

function buildEntryTypeList(reg) {
  const out = [];
  if (reg?.options?.challengeUp) out.push('Challenge Up');
  if (reg?.options?.novice) out.push('Novice');
  if (reg?.options?.elite) out.push('Elite');
  if (reg?.options?.open) out.push('Open');
  if (reg?.options?.timeTrials) out.push('TT');
  if (reg?.options?.relays) out.push('Relay');
  if (reg?.options?.quad) out.push('Quad');
  return out;
}

function entrySummaryHtml(reg) {
  const list = buildEntryTypeList(reg);
  if (!list.length) return '';
  return `<div class="note">${list.map(esc).join(' • ')}</div>`;
}

function getNextRaceBlockNumberForDay(blocks, day) {
  return (blocks || []).filter(
    b => String(b.day || 'Day 1') === String(day || 'Day 1') && String(b.type || 'race') === 'race'
  ).length + 1;
}

function makeBlockNameForType(meet, day, type) {
  if (String(type) !== 'race') {
    if (type === 'practice') return 'Practice';
    if (type === 'lunch') return 'Lunch';
    if (type === 'break') return 'Break';
    if (type === 'awards') return 'Awards';
    return cap(type);
  }
  return `Block ${getNextRaceBlockNumberForDay(meet.blocks || [], day)}`;
}

// ============================================================
// PAGE SHELL / NAV
// ============================================================

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

      .stackForm { display:flex; flex-direction:column; gap:14px; }

      .builderSection {
        border:1px solid rgba(148,163,184,.22);
        border-radius:16px;
        background:#fff;
        padding:16px;
      }

      .builderHeader {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:14px;
        flex-wrap:wrap;
      }

      .toggleRow {
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      .togglePill {
        display:inline-flex;
        gap:8px;
        align-items:center;
        padding:10px 14px;
        border:1px solid var(--line);
        border-radius:999px;
        background:#f8fbff;
        font-weight:900;
      }

      .hidden { display:none !important; }
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

// ============================================================
// PUBLIC PAGES
// ============================================================

function publicMeetCards(db) {
  const publicMeets = (db.meets || []).filter(m => m.isPublic);

  return publicMeets.map(m => {
    const rink = (db.rinks || []).find(r => Number(r.id) === Number(m.rinkId));
    const location = m.useCustomRink
      ? [m.customRinkName, m.customRinkCity, m.customRinkState].filter(Boolean).join(' • ')
      : (rink ? `${rink.name} • ${rink.city}, ${rink.state}` : '');

    return `
      <div class="card">
        <div class="row between">
          <div>
            <h2>${esc(m.meetName || 'Meet')}</h2>
            <div class="muted">${esc(m.date || 'Date TBD')}${m.startTime ? ` • ${esc(m.startTime)}` : ''}</div>
            <div class="note">${esc(location)}</div>
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
          Live results, heats, finals, quad races, open events, block scheduling, coach tools, sponsor support, and automatic standings.
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

  const cards = (db.rinks || []).map(r => `
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
        ${data?.user && (hasRole(data.user, 'super_admin') || hasRole(data.user, 'meet_director'))
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
  const cards = publicMeets.map(m => `
    <div class="card">
      <h2>${esc(m.meetName)}</h2>
      <div class="spacer"></div>
      <div class="row">
        <a class="btn" href="/meet/${m.id}/live">Open Live Board</a>
        <a class="btn2" href="/meet/${m.id}/results">Results</a>
      </div>
    </div>
  `).join('<div class="spacer"></div>');

  res.send(pageShell({
    title: 'Live Race Day',
    user: data?.user || null,
    bodyHtml: `<h1>Live Race Day</h1>${cards || `<div class="card"><div class="muted">No live meets yet.</div></div>`}`,
  }));
});

// ============================================================
// LOGIN / LOGOUT
// ============================================================

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

  const user = (db.users || []).find(
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

// ============================================================
// PORTAL HOME
// ============================================================

app.get('/portal', requireRole('meet_director', 'judge', 'coach'), (req, res) => {
  const visibleMeets = coachVisibleMeets(req.db, req.user);

  const cards = visibleMeets.map(meet => `
    <div class="card">
      <div class="row between">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="note">Meet ID: ${esc(meet.id)}</div>
        </div>
        <div class="row">
          <span class="chip">Races: ${esc((meet.races || []).length)}</span>
          <span class="chip">Regs: ${esc((meet.registrations || []).length)}</span>
          <span class="chip">Blocks: ${esc((meet.blocks || []).length)}</span>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="row">
        ${canEditMeet(req.user, meet)
          ? `<a class="btn" href="/portal/meet/${meet.id}/builder">Open Meet</a>`
          : `<a class="btn2" href="/portal/meet/${meet.id}/registered">View Meet</a>`
        }
        <a class="btn2" href="/meet/${meet.id}/live">Public Live</a>
        <a class="btn2" href="/portal/meet/${meet.id}/results">Results</a>
      </div>
    </div>
  `).join('<div class="spacer"></div>');

  const body = `
    <h1>Director Portal</h1>
    <div class="muted">Nothing appears until you build a meet.</div>
    <div class="spacer"></div>
    <div class="row">
      ${(hasRole(req.user, 'super_admin') || hasRole(req.user, 'meet_director'))
        ? `<form method="POST" action="/portal/create-meet"><button class="btn" type="submit">Build New Meet</button></form>`
        : ''
      }
      ${(hasRole(req.user, 'super_admin') || hasRole(req.user, 'meet_director'))
        ? `<a class="btn2" href="/portal/rinks">Add / Edit Rinks</a>`
        : ''
      }
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

app.post('/portal/create-meet', requireRole('meet_director'), (req, res) => {
  const meet = defaultMeet(req.user.id);
  meet.id = nextId(req.db.meets);
  req.db.meets.push(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder`);
});

// ============================================================
// MEET BUILDER
// ============================================================

function meetBuilderFormHtml(meet, db) {
  const rinkOptions = (db.rinks || []).map(r =>
    `<option value="${r.id}" ${Number(meet.rinkId) === Number(r.id) ? 'selected' : ''}>${esc(r.name)} (${esc(r.city)}, ${esc(r.state)})</option>`
  ).join('');

  const groupCards = (meet.groups || []).map(group => {
    const novice = group.divisions?.novice || { enabled: false, cost: 0, distances: ['', '', '', ''] };
    const elite = group.divisions?.elite || { enabled: false, cost: 0, distances: ['', '', '', ''] };

    return `
      <div class="groupCard">
        <div class="builderHeader">
          <div>
            <h3 style="margin:0">${esc(group.label)}</h3>
            <div class="note">${esc(group.ages)}</div>
          </div>
        </div>

        <div class="spacer"></div>

        <div class="grid2">
          <div class="builderSection">
            <label class="togglePill"><input type="checkbox" name="div_${group.id}_novice_enabled" ${novice.enabled ? 'checked' : ''} /> Novice</label>
            <div class="spacer"></div>
            <label>Novice Cost</label>
            <input type="number" step="1" name="div_${group.id}_novice_cost" value="${esc(novice.cost)}" />
            <div class="spacer"></div>
            <div class="grid4">
              ${normalizeDistances(novice.distances, 4).map((d, i) => `
                <div>
                  <label>D${i + 1}</label>
                  <input name="div_${group.id}_novice_d${i + 1}" value="${esc(d)}" />
                </div>
              `).join('')}
            </div>
          </div>

          <div class="builderSection">
            <label class="togglePill"><input type="checkbox" name="div_${group.id}_elite_enabled" ${elite.enabled ? 'checked' : ''} /> Elite</label>
            <div class="spacer"></div>
            <label>Elite Cost</label>
            <input type="number" step="1" name="div_${group.id}_elite_cost" value="${esc(elite.cost)}" />
            <div class="spacer"></div>
            <div class="grid4">
              ${normalizeDistances(elite.distances, 4).map((d, i) => `
                <div>
                  <label>D${i + 1}</label>
                  <input name="div_${group.id}_elite_d${i + 1}" value="${esc(d)}" />
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('<div class="spacer"></div>');

  return `
    <h1>Meet Builder</h1>

    <form method="POST" action="/portal/meet/${meet.id}/builder/save" class="stackForm">
      <div class="builderSection">
        <div class="builderHeader">
          <div>
            <h2 style="margin:0">Event Info</h2>
            <div class="muted">Main meet details.</div>
          </div>
          <div class="actionRow">
            <button class="btn" type="submit">Save Meet</button>
            <button class="btnDanger" type="submit" formaction="/portal/meet/${meet.id}/builder/rebuild" onclick="return confirmRebuild(${hasExistingSchedule(meet) ? 'true' : 'false'})">Rebuild Race List</button>
          </div>
        </div>

        <div class="spacer"></div>

        <div class="grid2">
          <div>
            <label>Meet Name</label>
            <input name="meetName" value="${esc(meet.meetName || '')}" />
          </div>
          <div>
            <label>Status</label>
            <select name="status">
              <option value="draft" ${meet.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="open" ${meet.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="live" ${meet.status === 'live' ? 'selected' : ''}>Live</option>
              <option value="closed" ${meet.status === 'closed' ? 'selected' : ''}>Closed</option>
            </select>
          </div>
          <div>
            <label>Date</label>
            <input type="date" name="date" value="${esc(meet.date || '')}" />
          </div>
          <div>
            <label>Start Time</label>
            <input type="time" name="startTime" value="${esc(meet.startTime || '')}" />
          </div>
        </div>
      </div>

      <div class="builderSection">
        <h2 style="margin:0">Track Setup</h2>
        <div class="spacer"></div>
        <div class="grid2">
          <div>
            <label>Track Length</label>
            <input type="number" step="1" name="trackLength" value="${esc(meet.trackLength || 100)}" />
          </div>
          <div>
            <label>Lanes</label>
            <input type="number" step="1" name="lanes" value="${esc(meet.lanes || 4)}" />
          </div>
        </div>

        <div class="spacer"></div>

        <div class="toggleRow">
          <label class="togglePill"><input type="checkbox" name="quadEnabled" ${meet.quadEnabled ? 'checked' : ''} /> Quad</label>
          <label class="togglePill"><input type="checkbox" name="openEnabled" ${meet.openEnabled ? 'checked' : ''} /> Open</label>
          <label class="togglePill"><input type="checkbox" name="timeTrialsEnabled" ${meet.timeTrialsEnabled ? 'checked' : ''} /> Time Trials</label>
          <label class="togglePill"><input type="checkbox" name="relayEnabled" ${meet.relayEnabled ? 'checked' : ''} /> Relays</label>
          <label class="togglePill"><input type="checkbox" name="judgesPanelRequired" ${meet.judgesPanelRequired ? 'checked' : ''} /> Judges Panel</label>
        </div>
      </div>

      <div class="builderSection">
        <h2 style="margin:0">Registration</h2>
        <div class="spacer"></div>
        <div class="grid2">
          <div>
            <label>Registration Close</label>
            <input type="datetime-local" name="registrationCloseAt" value="${esc(String(meet.registrationCloseAt || '').slice(0, 16))}" />
          </div>
          <div>
            <label>Public Meet</label>
            <select name="isPublic">
              <option value="0" ${!meet.isPublic ? 'selected' : ''}>No</option>
              <option value="1" ${meet.isPublic ? 'selected' : ''}>Yes</option>
            </select>
          </div>
        </div>
      </div>

      <div class="builderSection">
        <h2 style="margin:0">Rink</h2>
        <div class="spacer"></div>
        <div class="toggleRow">
          <label class="togglePill"><input type="radio" name="useCustomRink" value="0" ${!meet.useCustomRink ? 'checked' : ''} /> Registered Rink</label>
          <label class="togglePill"><input type="radio" name="useCustomRink" value="1" ${meet.useCustomRink ? 'checked' : ''} /> Enter Custom Rink</label>
        </div>
        <div class="spacer"></div>
        <div class="grid2">
          <div>
            <label>Registered Rink</label>
            <select name="rinkId">${rinkOptions}</select>
          </div>
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

      <div class="builderSection">
        <h2 style="margin:0">Notes</h2>
        <div class="spacer"></div>
        <div class="grid2">
          <div>
            <label>Meet Notes</label>
            <textarea name="notes">${esc(meet.notes || '')}</textarea>
          </div>
          <div>
            <label>Relay Notes</label>
            <textarea name="relayNotes">${esc(meet.relayNotes || '')}</textarea>
          </div>
        </div>
      </div>

      <div class="builderSection">
        <h2 style="margin:0">Standard Divisions</h2>
        <div class="spacer"></div>
        ${groupCards}
      </div>

      <div class="builderSection">
        <div class="actionRow">
          <button class="btn" type="submit">Save Meet</button>
          <button class="btnDanger" type="submit" formaction="/portal/meet/${meet.id}/builder/rebuild" onclick="return confirmRebuild(${hasExistingSchedule(meet) ? 'true' : 'false'})">Rebuild Race List</button>
        </div>
      </div>
    </form>

    <script>
      function confirmRebuild(hasSchedule) {
        if (!hasSchedule) return true;
        return confirm(
          "⚠️ Rebuild Race List?\\n\\n" +
          "This will:\\n" +
          "• Remove all block assignments\\n" +
          "• Reset race order\\n" +
          "• Recreate races from divisions\\n\\n" +
          "This cannot be undone."
        );
      }
    </script>
  `;
}

app.get('/portal/meet/:meetId/builder', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  res.send(pageShell({
    title: 'Meet Builder',
    user: req.user,
    meet,
    activeTab: 'builder',
    bodyHtml: meetBuilderFormHtml(meet, req.db),
  }));
});

app.post('/portal/meet/:meetId/builder/save', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.meetName = String(req.body.meetName || '').trim();
  meet.date = String(req.body.date || '').trim();
  meet.startTime = String(req.body.startTime || '').trim();
  meet.registrationCloseAt = String(req.body.registrationCloseAt || '').trim();
  meet.status = String(req.body.status || 'draft').trim();

  meet.rinkId = Number(req.body.rinkId || 1);
  meet.trackLength = Number(req.body.trackLength || 100);
  meet.lanes = Number(req.body.lanes || 4);

  meet.useCustomRink = String(req.body.useCustomRink || '0') === '1';
  meet.customRinkName = String(req.body.customRinkName || '').trim();
  meet.customRinkCity = String(req.body.customRinkCity || '').trim();
  meet.customRinkState = String(req.body.customRinkState || '').trim();

  meet.quadEnabled = !!req.body.quadEnabled;
  meet.openEnabled = !!req.body.openEnabled;
  meet.timeTrialsEnabled = !!req.body.timeTrialsEnabled;
  meet.relayEnabled = !!req.body.relayEnabled;
  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;
  meet.isPublic = String(req.body.isPublic || '0') === '1';

  meet.notes = String(req.body.notes || '').trim();
  meet.relayNotes = String(req.body.relayNotes || '').trim();

  for (const group of meet.groups || []) {
    group.divisions = group.divisions || {};

    for (const divKey of ['novice', 'elite']) {
      if (!group.divisions[divKey]) group.divisions[divKey] = { enabled: false, cost: 0, distances: ['', '', '', ''] };
      group.divisions[divKey].enabled = !!req.body[`div_${group.id}_${divKey}_enabled`];
      group.divisions[divKey].cost = Number(req.body[`div_${group.id}_${divKey}_cost`] || 0);
      group.divisions[divKey].distances = [1,2,3,4].map(i => String(req.body[`div_${group.id}_${divKey}_d${i}`] || '').trim());
    }
  }

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder`);
});

app.post('/portal/meet/:meetId/builder/rebuild', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  meet.blocks = (meet.blocks || []).map(b => ({ ...b, raceIds: [] }));
  rebuildRaceAssignments(meet);
  meet.updatedAt = nowIso();
  saveDb(req.db);

  res.redirect(`/portal/meet/${meet.id}/builder`);
});

// ============================================================
// QUAD BUILDER
// ============================================================

function quadBuilderHtml(meet) {
  const cards = (meet.quadGroups || []).map(g => `
    <div class="groupCard">
      <label class="togglePill"><input type="checkbox" name="quad_${g.id}_enabled" ${g.enabled ? 'checked' : ''} /> ${esc(g.label)}</label>
      <div class="spacer"></div>
      <div class="note">${esc(g.ages)}</div>
      <div class="spacer"></div>
      <div class="row">
        ${normalizeDistances(g.distances, 2).map(d => `<span class="chip">${esc(d)}m</span>`).join('')}
      </div>
    </div>
  `).join('<div class="spacer"></div>');

  return `
    <h1>Quad Builder</h1>
    <div class="muted">Turn on the quad divisions you want for this meet. Distances are fixed from the rules sheet.</div>
    <div class="spacer"></div>
    <form method="POST" action="/portal/meet/${meet.id}/quad-builder/save" class="stackForm">
      ${cards}
      <div class="actionRow">
        <button class="btn" type="submit">Save Quad Builder</button>
        <button class="btnDanger" type="submit" formaction="/portal/meet/${meet.id}/quad-builder/rebuild" onclick="return confirm('Rebuild quad race list now?')">Save + Rebuild</button>
      </div>
    </form>
  `;
}

app.get('/portal/meet/:meetId/quad-builder', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  res.send(pageShell({
    title: 'Quad Builder',
    user: req.user,
    meet,
    activeTab: 'quad-builder',
    bodyHtml: quadBuilderHtml(meet),
  }));
});

app.post('/portal/meet/:meetId/quad-builder/save', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  for (const g of meet.quadGroups || []) {
    g.enabled = !!req.body[`quad_${g.id}_enabled`];
  }

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/quad-builder`);
});

app.post('/portal/meet/:meetId/quad-builder/rebuild', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  for (const g of meet.quadGroups || []) {
    g.enabled = !!req.body[`quad_${g.id}_enabled`];
  }

  meet.blocks = (meet.blocks || []).map(b => ({ ...b, raceIds: [] }));
  rebuildRaceAssignments(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/quad-builder`);
});

// ============================================================
// OPEN BUILDER
// ============================================================

function openBuilderHtml(meet) {
  const cards = (meet.openGroups || []).map(g => `
    <div class="groupCard">
      <label class="togglePill"><input type="checkbox" name="open_${g.id}_enabled" ${g.enabled ? 'checked' : ''} /> ${esc(g.label)}</label>
      <div class="spacer"></div>
      <div class="note">${esc(g.ages)}</div>
      <div class="spacer"></div>
      <div class="grid2">
        <div>
          <label>Distance 1</label>
          <input name="open_${g.id}_d1" value="${esc((g.distances || [])[0] || '')}" />
        </div>
        <div>
          <label>Distance 2</label>
          <input name="open_${g.id}_d2" value="${esc((g.distances || [])[1] || '')}" />
        </div>
      </div>
    </div>
  `).join('<div class="spacer"></div>');

  return `
    <h1>Open Builder</h1>
    <div class="muted">Open races are separate from normal divisions and do not follow normal lane-limited class logic.</div>
    <div class="spacer"></div>
    <form method="POST" action="/portal/meet/${meet.id}/open-builder/save" class="stackForm">
      ${cards}
      <div class="actionRow">
        <button class="btn" type="submit">Save Open Builder</button>
        <button class="btnDanger" type="submit" formaction="/portal/meet/${meet.id}/open-builder/rebuild" onclick="return confirm('Rebuild open race list now?')">Save + Rebuild</button>
      </div>
    </form>
  `;
}

app.get('/portal/meet/:meetId/open-builder', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  res.send(pageShell({
    title: 'Open Builder',
    user: req.user,
    meet,
    activeTab: 'open-builder',
    bodyHtml: openBuilderHtml(meet),
  }));
});

app.post('/portal/meet/:meetId/open-builder/save', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  for (const g of meet.openGroups || []) {
    g.enabled = !!req.body[`open_${g.id}_enabled`];
    g.distances = [
      String(req.body[`open_${g.id}_d1`] || '').trim(),
      String(req.body[`open_${g.id}_d2`] || '').trim(),
    ];
  }

  meet.updatedAt = nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/open-builder`);
});

app.post('/portal/meet/:meetId/open-builder/rebuild', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet || !canEditMeet(req.user, meet)) return res.redirect('/portal');

  for (const g of meet.openGroups || []) {
    g.enabled = !!req.body[`open_${g.id}_enabled`];
    g.distances = [
      String(req.body[`open_${g.id}_d1`] || '').trim(),
      String(req.body[`open_${g.id}_d2`] || '').trim(),
    ];
  }

  meet.blocks = (meet.blocks || []).map(b => ({ ...b, raceIds: [] }));
  rebuildRaceAssignments(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/open-builder`);
});// ============================================================
// SpeedSkateMeet – REBUILD v18 (Part 3/4)
// Block Builder + Registered + Check-In + Race Day Director
// ============================================================

// ============================================================
// BLOCK BUILDER
// ============================================================

function groupBlocksByDay(blocks) {
  const days = {};
  for (const b of blocks || []) {
    const d = b.day || 'Day 1';
    if (!days[d]) days[d] = [];
    days[d].push(b);
  }
  return days;
}

function blockBuilderHtml(meet) {
  const days = groupBlocksByDay(meet.blocks || []);

  const daySections = Object.keys(days).map(day => {
    const blocks = days[day];

    return `
      <div class="card">
        <div class="row between center">
          <h2 style="margin:0">${esc(day)}</h2>
          <form method="POST" action="/portal/meet/${meet.id}/blocks/add">
            <input type="hidden" name="day" value="${esc(day)}"/>
            <button class="btn2">+ Add Block</button>
          </form>
        </div>

        <div class="spacer"></div>

        ${blocks.map((b, i) => `
          <div class="groupCard">
            <div class="row between center">
              <div>
                <b>${esc(b.name)}</b>
                <div class="note">${esc(b.type)}</div>
              </div>
              <div class="row">
                <form method="POST" action="/portal/meet/${meet.id}/blocks/delete">
                  <input type="hidden" name="blockId" value="${b.id}"/>
                  <button class="btnDanger">Delete</button>
                </form>
              </div>
            </div>

            ${b.type === 'race' ? `
              <div class="spacer"></div>
              <div class="note">${b.raceIds.length} races assigned</div>
            ` : ''}
          </div>
        `).join('<div class="spacer"></div>')}
      </div>
    `;
  }).join('<div class="spacer"></div>');

  return `
    <h1>Block Builder</h1>

    <div class="row">
      <form method="POST" action="/portal/meet/${meet.id}/blocks/add-day">
        <button class="btn">+ Add Day</button>
      </form>

      <form method="POST" action="/portal/meet/${meet.id}/blocks/add-special">
        <input type="hidden" name="type" value="practice"/>
        <button class="btn2">+ Practice</button>
      </form>

      <form method="POST" action="/portal/meet/${meet.id}/blocks/add-special">
        <input type="hidden" name="type" value="lunch"/>
        <button class="btn2">+ Lunch</button>
      </form>

      <form method="POST" action="/portal/meet/${meet.id}/blocks/add-special">
        <input type="hidden" name="type" value="break"/>
        <button class="btn2">+ Break</button>
      </form>

      <form method="POST" action="/portal/meet/${meet.id}/blocks/add-special">
        <input type="hidden" name="type" value="awards"/>
        <button class="btn2">+ Awards</button>
      </form>
    </div>

    <div class="spacer"></div>

    ${daySections || `<div class="card"><div class="muted">No blocks yet.</div></div>`}
  `;
}

app.get('/portal/meet/:meetId/blocks', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');

  res.send(pageShell({
    title: 'Block Builder',
    user: req.user,
    meet,
    activeTab: 'blocks',
    bodyHtml: blockBuilderHtml(meet),
  }));
});

app.post('/portal/meet/:meetId/blocks/add-day', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  const dayNum = Object.keys(groupBlocksByDay(meet.blocks || {})).length + 1;
  const day = `Day ${dayNum}`;
  meet.blocks.push(createBlock('Block 1', 'race', day));
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/blocks/add', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  const day = req.body.day || 'Day 1';
  const name = makeBlockNameForType(meet, day, 'race');
  meet.blocks.push(createBlock(name, 'race', day));
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/blocks/add-special', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  const type = req.body.type;
  const day = 'Day 1';
  const name = makeBlockNameForType(meet, day, type);
  meet.blocks.push(createBlock(name, type, day));
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

app.post('/portal/meet/:meetId/blocks/delete', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  meet.blocks = meet.blocks.filter(b => b.id !== req.body.blockId);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/blocks`);
});

// ============================================================
// REGISTERED PAGE (WITH SEARCH 🔥)
// ============================================================

function registeredPageHtml(meet, query) {
  const q = String(query || '').toLowerCase();

  const regs = (meet.registrations || []).filter(r => {
    if (!q) return true;
    return (
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.team || '').toLowerCase().includes(q) ||
      String(r.number || '').includes(q)
    );
  });

  return `
    <h1>Registered Skaters</h1>

    <form method="GET">
      <input name="q" placeholder="Search name, team, or #" value="${esc(query || '')}" />
    </form>

    <div class="spacer"></div>

    <table class="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Team</th>
          <th>Division</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${regs.map(r => `
          <tr>
            <td>${esc(r.number)}</td>
            <td>${esc(r.name)}</td>
            <td>${esc(r.team)}</td>
            <td>${esc(r.division)}</td>
            <td>${r.checkedIn ? '✅' : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

app.get('/portal/meet/:meetId/registered', requireRole('coach','meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  res.send(pageShell({
    title: 'Registered',
    user: req.user,
    meet,
    activeTab: 'registered',
    bodyHtml: registeredPageHtml(meet, req.query.q),
  }));
});

// ============================================================
// CHECK-IN
// ============================================================

app.get('/portal/meet/:meetId/checkin', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);

  res.send(pageShell({
    title: 'Check-In',
    user: req.user,
    meet,
    activeTab: 'checkin',
    bodyHtml: `
      <h1>Check-In</h1>
      <table class="table">
        ${meet.registrations.map(r => `
          <tr>
            <td>${esc(r.number)}</td>
            <td>${esc(r.name)}</td>
            <td>
              <form method="POST">
                <input type="hidden" name="id" value="${r.id}"/>
                <button class="btn">${r.checkedIn ? 'Undo' : 'Check In'}</button>
              </form>
            </td>
          </tr>
        `).join('')}
      </table>
    `,
  }));
});

app.post('/portal/meet/:meetId/checkin', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  const r = meet.registrations.find(x => x.id == req.body.id);
  if (r) r.checkedIn = !r.checkedIn;
  saveDb(req.db);
  res.redirect('back');
});

// ============================================================
// RACE DAY DIRECTOR VIEW 🔥
// ============================================================

function raceDayHtml(meet) {
  const current = meet.races.find(r => r.id === meet.currentRaceId);

  return `
    <h1>Race Day</h1>

    <div class="grid2">

      <div class="card">
        <h2>Current Race</h2>
        ${current ? `
          <div><b>${esc(current.groupLabel)}</b></div>
          <div>${esc(current.distanceLabel)}</div>
        ` : `<div class="muted">No race selected</div>`}

        <div class="spacer"></div>

        <form method="POST" action="/portal/meet/${meet.id}/race-day/next">
          <button class="btn">Next Race</button>
        </form>
      </div>

      <div class="card">
        <h2>Up Next</h2>
        <div class="note">
          ${(meet.races || []).slice(meet.currentRaceIndex + 1, meet.currentRaceIndex + 4).map(r =>
            `<div>${esc(r.groupLabel)} - ${esc(r.distanceLabel)}</div>`
          ).join('') || '—'}
        </div>
      </div>

    </div>
  `;
}

app.get('/portal/meet/:meetId/race-day/director', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);

  res.send(pageShell({
    title: 'Race Day',
    user: req.user,
    meet,
    activeTab: 'race-day',
    bodyHtml: raceDayHtml(meet),
  }));
});

app.post('/portal/meet/:meetId/race-day/next', requireRole('meet_director'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);

  meet.currentRaceIndex++;
  const next = meet.races[meet.currentRaceIndex];
  if (next) meet.currentRaceId = next.id;

  saveDb(req.db);
  res.redirect('back');
});// ============================================================
// SpeedSkateMeet – REBUILD v1 (Part 1/4)
// Core Engine + Data Model + Safe Rebuild System
// ============================================================

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

// ============================================================
// 🔥 NEW CORE FLAGS (future ready)
// ============================================================

const RACE_TYPES = {
  STANDARD: 'standard',
  QUAD: 'quad',
  OPEN: 'open',
  TIME_TRIAL: 'time_trial'
};

// ============================================================
// 🔧 UTIL
// ============================================================

function nowIso() {
  return new Date().toISOString();
}

function nextId(arr) {
  let max = 0;
  for (const item of arr || []) {
    max = Math.max(max, Number(item.id) || 0);
  }
  return max + 1;
}

// ============================================================
// 🔥 NEW: SAFE SCHEDULE DETECTION
// ============================================================

function hasExistingSchedule(meet) {
  return (meet.blocks || []).some(b => (b.raceIds || []).length > 0);
}

// ============================================================
// 🔥 NEW: BLOCK TYPE SYSTEM
// ============================================================

function createBlock(name, type = 'race', day = 'Day 1') {
  return {
    id: 'b' + crypto.randomBytes(4).toString('hex'),
    name,
    type, // race | practice | lunch | break | awards
    day,
    raceIds: [],
    notes: ''
  };
}

// ============================================================
// 🔥 UPDATED DEFAULT MEET (future ready)
// ============================================================

function defaultMeet(ownerUserId) {
  return {
    id: null,
    createdByUserId: ownerUserId,
    createdAt: nowIso(),
    updatedAt: nowIso(),

    meetName: 'New Meet',
    date: '',
    startTime: '',

    rinkId: 1,
    trackLength: 100,
    lanes: 4,

    // 🔥 NEW FLAGS
    quadEnabled: false,
    openEnabled: false,
    timeTrialsEnabled: false,

    groups: [],
    quadGroups: [],
    openGroups: [],

    races: [],
    blocks: [],

    registrations: [],

    currentRaceId: '',
    currentRaceIndex: -1
  };
}

// ============================================================
// 🔥 DB DEFAULT
// ============================================================

function defaultDb() {
  return {
    version: 20,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sessions: [],
    users: [
      {
        id: 1,
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
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
      },
    ],
    meets: [],
  };
}

// ============================================================
// 🔥 MIGRATION (SAFE)
// ============================================================

function migrateMeet(meet, fallbackOwnerId) {

  if (!meet.createdByUserId) meet.createdByUserId = fallbackOwnerId;
  if (!meet.createdAt) meet.createdAt = nowIso();
  if (!meet.updatedAt) meet.updatedAt = nowIso();

  if (!Array.isArray(meet.blocks)) meet.blocks = [];

  // 🔥 ADD NEW FLAGS SAFELY
  if (typeof meet.quadEnabled !== 'boolean') meet.quadEnabled = false;
  if (typeof meet.openEnabled !== 'boolean') meet.openEnabled = false;
  if (typeof meet.timeTrialsEnabled !== 'boolean') meet.timeTrialsEnabled = false;

  if (!Array.isArray(meet.quadGroups)) meet.quadGroups = [];
  if (!Array.isArray(meet.openGroups)) meet.openGroups = [];

  if (!Array.isArray(meet.races)) meet.races = [];
  if (!Array.isArray(meet.registrations)) meet.registrations = [];

  // 🔥 BLOCK TYPE SAFETY
  meet.blocks = meet.blocks.map((b, i) => ({
    id: b.id || ('b' + (i + 1)),
    name: b.name || `Block ${i + 1}`,
    type: b.type || 'race',
    day: b.day || 'Day 1',
    raceIds: Array.isArray(b.raceIds) ? b.raceIds : [],
    notes: b.notes || ''
  }));
}

// ============================================================
// 🔥 LOAD DB
// ============================================================

function loadDb() {
  let db = null;

  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.error('DB load failed:', e);
    }
  }

  if (!db) {
    db = defaultDb();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  }

  if (!Array.isArray(db.meets)) db.meets = [];

  const fallbackOwnerId = db.users[0]?.id || 1;
  db.meets.forEach(m => migrateMeet(m, fallbackOwnerId));

  return db;
}

// ============================================================
// 🔥 SAVE DB
// ============================================================

function saveDb(db) {
  db.updatedAt = nowIso();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// ============================================================
// 🔥 SAFE RACE GENERATION (CORE)
// ============================================================

function generateBaseRacesForMeet(meet) {

  const races = [];
  let order = 1;

  // STANDARD
  for (const group of meet.groups || []) {
    for (const div of ['novice', 'elite']) {

      if (!group.divisions?.[div]?.enabled) continue;

      for (const dist of group.divisions[div].distances || []) {
        if (!dist) continue;

        races.push({
          id: 'r' + crypto.randomBytes(6).toString('hex'),
          raceType: RACE_TYPES.STANDARD,
          groupId: group.id,
          groupLabel: group.label,
          division: div,
          distanceLabel: dist,
          orderHint: order++,
          stage: 'race',
          isFinal: false
        });
      }
    }
  }

  // 🔥 QUAD
  if (meet.quadEnabled) {
    for (const q of meet.quadGroups || []) {
      for (const dist of q.distances || []) {
        races.push({
          id: 'r' + crypto.randomBytes(6).toString('hex'),
          raceType: RACE_TYPES.QUAD,
          groupId: q.id,
          groupLabel: q.label,
          division: 'quad',
          distanceLabel: dist,
          orderHint: order++,
          stage: 'race',
          isFinal: false
        });
      }
    }
  }

  // 🔥 OPEN
  if (meet.openEnabled) {
    for (const o of meet.openGroups || []) {
      races.push({
        id: 'r' + crypto.randomBytes(6).toString('hex'),
        raceType: RACE_TYPES.OPEN,
        groupId: o.id,
        groupLabel: o.label,
        division: 'open',
        distanceLabel: o.distance,
        orderHint: order++,
        stage: 'final',
        isFinal: true
      });
    }
  }

  meet.races = races;
}

// ============================================================
// 🔥 SAFE REBUILD (NO MORE NUKES)
// ============================================================

function rebuildRaceAssignments(meet) {

  const hadSchedule = hasExistingSchedule(meet);

  if (hadSchedule) {
    // wipe assignments ONLY (not blocks)
    meet.blocks = meet.blocks.map(b => ({
      ...b,
      raceIds: []
    }));
  }

  generateBaseRacesForMeet(meet);

  meet.updatedAt = nowIso();
}

// ============================================================
// END PART 1
// ============================================================