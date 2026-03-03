// ============================================================
// SpeedSkateMeet — SINGLE-FILE server.js (CLEAN REBUILD v10)
// Node.js + Express • JSON persistence: ssm_db.json
//
// INCLUDES (per handoff):
// ✅ Login: Lbird22 / Redline22 (stored in env fallback too)
// ✅ Persistent cookie sessions (survive restart) stored in DB
// ✅ Rinks: default Roller City only + auto-remove "Wichita Skate Center" if found
// ✅ Rinks Admin UI: add/edit (director only)
// ✅ Portal clean when zero meets; no default meets created
// ✅ Full divisions list (expanded USARS-style; not stopping at Senior Men)
// ✅ Meet Builder:
//    - D1–D4 distances plain inputs (NO dropdowns)
//    - Save button at TOP + BOTTOM
//    - Saving generates Race List (unassigned races)
//    - Meet-wide Time Trials config block (items + notes; used later)
//    - Meet-wide Relays enable + notes
// ✅ Registration page restored:
//    - Team autocomplete (friendly UI; includes the full list + Independent)
//    - Enter AGE
//    - Checkboxes: Challenge Up, Novice, Elite, Open, Time Trials, Relays
//    - Auto-assign meet number on registration (check-in + skater number)
// ✅ Block Builder:
//    - Right side = Unassigned races
//    - Left side = Blocks (Block 1..N)
//    - Drag/drop, reorder inside blocks, move between blocks
//    - Add Block, Rename Block
//    - Persist in DB
//
// Run:
//   npm i express
//   node server.js
//
// Optional env overrides:
//   SSM_DATA_FILE=./ssm_db.json
//   SSM_ADMIN_USER=Lbird22
//   SSM_ADMIN_PASS=Redline22
// ============================================================

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const DATA_FILE = process.env.SSM_DATA_FILE || path.join(__dirname, "ssm_db.json");
const DATA_VERSION = 10;

// -------------------------
// Auth (fixed credentials; env override allowed)
// -------------------------
const ADMIN_USER = String(process.env.SSM_ADMIN_USER || "Lbird22").trim();
const ADMIN_PASS = String(process.env.SSM_ADMIN_PASS || "Redline22").trim();

// -------------------------
// DB helpers (safe + atomic)
// -------------------------
function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return { ok: false, data: null, reason: "missing" };
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return { ok: true, data: parsed, reason: "ok" };
  } catch (e) {
    return { ok: false, data: null, reason: "parse_error" };
  }
}

function writeJsonAtomic(filePath, obj) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function nowIso() {
  return new Date().toISOString();
}

function defaultDb() {
  return {
    version: DATA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),

    // public data
    meets: [],
    rinks: [
      {
        id: 1,
        name: "Roller City",
        city: "Wichita",
        state: "KS",
        team: "",
        address: "3234 S. Meridian Ave, Wichita, KS 67217",
        phone: "316-942-4555",
        website: "rollercitywichitaks.com",
        notes: "",
      },
    ],

    // persistent sessions (token -> session)
    sessions: [], // {token, user:{username,role}, createdAt, lastSeenAt}
  };
}

function normalizeDb(db) {
  if (!db || typeof db !== "object") db = defaultDb();

  if (!db.version) db.version = DATA_VERSION;
  if (!Array.isArray(db.meets)) db.meets = [];
  if (!Array.isArray(db.rinks)) db.rinks = defaultDb().rinks;
  if (!Array.isArray(db.sessions)) db.sessions = [];

  // Migration / cleanup: remove fake Wichita Skate Center, ensure Roller City exists
  const lower = (s) => String(s || "").toLowerCase();
  db.rinks = db.rinks.filter((r) => lower(r.name) !== "wichita skate center");

  const hasRollerCity = db.rinks.some((r) => lower(r.name) === "roller city");
  if (!hasRollerCity) {
    const next = nextId(db.rinks);
    db.rinks.unshift({
      id: next,
      name: "Roller City",
      city: "Wichita",
      state: "KS",
      team: "",
      address: "3234 S. Meridian Ave, Wichita, KS 67217",
      phone: "316-942-4555",
      website: "rollercitywichitaks.com",
      notes: "",
    });
  }

  // Ensure meets shape
  for (const m of db.meets) {
    if (!m || typeof m !== "object") continue;
    if (!Array.isArray(m.groups)) m.groups = baseGroups();
    if (!Array.isArray(m.races)) m.races = [];
    if (!Array.isArray(m.blocks)) m.blocks = [];
    if (!Array.isArray(m.registrants)) m.registrants = [];
    if (typeof m.nextMeetNumber !== "number") m.nextMeetNumber = 1;

    if (!m.timeTrials) m.timeTrials = { enabled: false, notes: "", items: [] };
    if (!Array.isArray(m.timeTrials.items)) m.timeTrials.items = [];
    if (typeof m.timeTrials.enabled !== "boolean") m.timeTrials.enabled = !!m.timeTrials.enabled;

    if (typeof m.relayEnabled !== "boolean") m.relayEnabled = !!m.relayEnabled;
    if (typeof m.relayNotes !== "string") m.relayNotes = String(m.relayNotes || "");

    if (!m.createdAt) m.createdAt = nowIso();
    if (!m.updatedAt) m.updatedAt = nowIso();
  }

  return db;
}

function loadDb() {
  const res = safeReadJson(DATA_FILE);
  if (!res.ok) {
    if (res.reason === "parse_error") {
      // safeguard: preserve corrupted file for debugging, create fresh
      const stamp = new Date().toISOString().replaceAll(":", "-");
      try {
        fs.renameSync(DATA_FILE, DATA_FILE + `.corrupt-${stamp}.json`);
      } catch {}
    }
    const fresh = defaultDb();
    writeJsonAtomic(DATA_FILE, fresh);
    return fresh;
  }
  const db = normalizeDb(res.data);
  // bump version + updatedAt but don't over-write constantly; do it on saveDb()
  return db;
}

function saveDb(db) {
  db.version = DATA_VERSION;
  db.updatedAt = nowIso();
  writeJsonAtomic(DATA_FILE, db);
}

function nextId(arr) {
  let max = 0;
  for (const x of arr) max = Math.max(max, Number(x.id) || 0);
  return max + 1;
}

// -------------------------
// Cookies + persistent sessions
// -------------------------
const SESS_COOKIE = "ssm_sess";

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx > -1) out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
    });
  return out;
}

function setCookie(res, name, value) {
  // Lax, HttpOnly. (No Secure here because many dev envs are http)
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function getSessionFromDb(db, token) {
  if (!token) return null;
  const s = db.sessions.find((x) => x.token === token);
  return s || null;
}

function touchSession(db, token) {
  const s = getSessionFromDb(db, token);
  if (s) s.lastSeenAt = nowIso();
}

function requireDirector(req, res, next) {
  const db = loadDb();
  const cookies = parseCookies(req);
  const token = cookies[SESS_COOKIE];
  const sess = getSessionFromDb(db, token);
  if (!sess) return res.redirect("/admin/login");

  touchSession(db, token);
  saveDb(db);

  req.user = sess.user;
  next();
}

// -------------------------
// UI helpers
// -------------------------
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pageShell({ title, bodyHtml, user }) {
  const nav = `
  <div class="topbar">
    <div class="brand">SpeedSkateMeet</div>
    <div class="nav">
      <a class="pill" href="/">Home</a>
      <a class="pill" href="/meets">Find a Meet</a>
      <a class="pill" href="/rinks">Find a Rink</a>
      <a class="pill" href="/live">Live Race Day</a>
      ${
        user
          ? `<a class="pill solid" href="/portal">Portal</a><a class="pill" href="/admin/logout">Logout</a>`
          : `<a class="pill solid" href="/admin/login">Admin Login</a>`
      }
    </div>
  </div>`;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>${esc(title)}</title>
      <style>
        :root {
          --bg: #f4f6fb;
          --card: #ffffff;
          --text: #0f172a;
          --muted: #64748b;
          --line: #e5e7eb;
          --blue: #2b6ef2;
          --blue2: #1e5ae0;
          --shadow: 0 10px 30px rgba(15, 23, 42, 0.10);
          --radius: 18px;
          --ok: #16a34a;
          --warn: #b45309;
          --danger: #b91c1c;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
          color: var(--text);
          background: radial-gradient(1200px 600px at 30% 0%, #eef3ff, var(--bg));
        }
        a { color: var(--blue); text-decoration: none; }
        .wrap { max-width: 1100px; margin: 24px auto 64px; padding: 0 18px; }
        .topbar { max-width: 1100px; margin: 18px auto 0; padding: 0 18px; display:flex; align-items:center; justify-content:space-between; }
        .brand { font-weight: 900; font-size: 20px; letter-spacing: .2px; }
        .nav { display:flex; gap: 10px; flex-wrap: wrap; align-items:center; justify-content:flex-end; }
        .pill { border: 2px solid #c7d2fe; padding: 10px 14px; border-radius: 999px; background: rgba(255,255,255,.6); font-weight: 800; color: #1e3a8a; }
        .pill:hover { border-color: #93c5fd; }
        .pill.solid { background: var(--blue); border-color: var(--blue); color: white; }
        .pill.solid:hover { background: var(--blue2); border-color: var(--blue2); }
        h1 { margin: 20px 0 10px; font-size: 44px; letter-spacing: -.8px; }
        h2 { margin: 0 0 8px; font-size: 28px; letter-spacing: -.3px; }
        h3 { margin: 0 0 8px; font-size: 18px; letter-spacing: -.1px; }
        .muted { color: var(--muted); }
        .card { background: var(--card); border: 1px solid rgba(148,163,184,.25); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px; }
        .row { display:flex; gap: 14px; flex-wrap: wrap; }
        .rowBetween { display:flex; gap:14px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
        .spacer { height: 14px; }
        .btn { display:inline-block; border: 0; cursor:pointer; background: var(--blue); color: white; font-weight: 900; padding: 12px 16px; border-radius: 12px; }
        .btn:hover { background: var(--blue2); }
        .btn2 { display:inline-block; border: 2px solid #c7d2fe; background: white; color: #1e3a8a; font-weight: 900; padding: 10px 14px; border-radius: 12px; cursor:pointer; }
        .btn2:hover { border-color:#93c5fd; }
        .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .grid3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        @media (max-width: 900px){ .grid2{ grid-template-columns: 1fr; } .grid3{ grid-template-columns: 1fr; } }
        label { font-weight: 800; font-size: 13px; color: #0f172a; display:block; margin-bottom: 6px; }
        input, select, textarea {
          width: 100%; padding: 12px 12px; border-radius: 12px;
          border: 1px solid var(--line); outline: none; font-size: 15px;
          background: white;
        }
        input:focus, textarea:focus { border-color: #93c5fd; box-shadow: 0 0 0 4px rgba(147,197,253,.35); }
        textarea { min-height: 90px; resize: vertical; }
        .kpi { display:flex; gap: 10px; align-items:center; flex-wrap: wrap; }
        .chip { display:inline-flex; align-items:center; gap: 8px; border: 1px solid var(--line); border-radius: 999px; padding: 8px 10px; background: rgba(255,255,255,.7); font-weight: 800; }
        .small { font-size: 12px; }
        .hr { height:1px; background: rgba(148,163,184,.25); margin: 14px 0; }
        .note { font-size: 13px; color: var(--muted); }
        .danger { color: var(--danger); font-weight: 900; }
        .ok { color: var(--ok); font-weight: 900; }

        /* Block builder */
        .bb { display:grid; grid-template-columns: 1.2fr .8fr; gap: 14px; }
        @media (max-width: 1000px){ .bb{ grid-template-columns: 1fr; } }
        .block { border: 1px solid rgba(148,163,184,.25); border-radius: 16px; padding: 14px; background: rgba(255,255,255,.9); }
        .blockHead { display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-bottom: 10px; }
        .raceItem {
          border: 1px solid rgba(148,163,184,.25);
          background: white; border-radius: 14px; padding: 10px 10px;
          margin: 8px 0; cursor: grab; display:flex; flex-direction:column; gap: 2px;
        }
        .raceItem:active { cursor: grabbing; }
        .raceMeta { font-size: 12px; color: var(--muted); }
        .dropZone {
          min-height: 40px; padding: 6px; border-radius: 14px;
          border: 2px dashed rgba(148,163,184,.35); background: rgba(248,250,252,.7);
        }
        .dropZone.over { border-color: #93c5fd; background: rgba(219,234,254,.6); }
        .rightCol { position: sticky; top: 18px; align-self: start; }

        /* Team autocomplete */
        .acWrap{ position:relative; }
        .acList{
          position:absolute; left:0; right:0; top: calc(100% + 6px);
          background:white; border:1px solid rgba(148,163,184,.35);
          border-radius: 14px; box-shadow: var(--shadow);
          max-height: 240px; overflow:auto; z-index: 50;
          padding: 6px;
          display:none;
        }
        .acItem{
          padding: 10px 10px; border-radius: 12px;
          cursor:pointer; font-weight: 800; color:#0f172a;
        }
        .acItem:hover{ background: rgba(219,234,254,.7); }
        .acHint{ font-size: 12px; color: var(--muted); margin-top: 6px; }
        .checkRow{ display:flex; gap: 12px; flex-wrap:wrap; }
        .check{
          display:flex; align-items:center; gap:10px;
          border:1px solid rgba(148,163,184,.25);
          background: rgba(255,255,255,.8);
          border-radius: 14px;
          padding: 10px 12px;
          font-weight: 900;
        }
        .check input{ width:auto; margin:0; transform: scale(1.15); }
      </style>
    </head>
    <body>
      ${nav}
      <div class="wrap">
        ${bodyHtml}
        <div class="spacer"></div>
        <div class="note small">Data file: ${esc(DATA_FILE)}</div>
      </div>
    </body>
  </html>`;
}

// -------------------------
// Domain logic
// -------------------------
function baseGroups() {
  // Expanded list (USARS-style feel). You can adjust labels/ages any time.
  const groups = [
    { id: "tiny_tot_girls", label: "Tiny Tot Girls", ages: "0–5" },
    { id: "tiny_tot_boys", label: "Tiny Tot Boys", ages: "0–5" },

    { id: "primary_girls", label: "Primary Girls", ages: "6–7" },
    { id: "primary_boys", label: "Primary Boys", ages: "6–7" },

    { id: "juvenile_girls", label: "Juvenile Girls", ages: "8–9" },
    { id: "juvenile_boys", label: "Juvenile Boys", ages: "8–9" },

    { id: "elementary_girls", label: "Elementary Girls", ages: "10–11" },
    { id: "elementary_boys", label: "Elementary Boys", ages: "10–11" },

    { id: "freshman_girls", label: "Freshman Girls", ages: "12–13" },
    { id: "freshman_boys", label: "Freshman Boys", ages: "12–13" },

    { id: "sophomore_girls", label: "Sophomore Girls", ages: "14–15" },
    { id: "sophomore_boys", label: "Sophomore Boys", ages: "14–15" },

    { id: "junior_women", label: "Junior Women", ages: "16–17" },
    { id: "junior_men", label: "Junior Men", ages: "16–17" },

    { id: "senior_women", label: "Senior Women", ages: "18–29" },
    { id: "senior_men", label: "Senior Men", ages: "18–29" },

    // Masters bands
    { id: "masters_women_30_39", label: "Masters Women 30–39", ages: "30–39" },
    { id: "masters_men_30_39", label: "Masters Men 30–39", ages: "30–39" },

    { id: "masters_women_40_49", label: "Masters Women 40–49", ages: "40–49" },
    { id: "masters_men_40_49", label: "Masters Men 40–49", ages: "40–49" },

    { id: "masters_women_50_59", label: "Masters Women 50–59", ages: "50–59" },
    { id: "masters_men_50_59", label: "Masters Men 50–59", ages: "50–59" },

    { id: "masters_women_60_69", label: "Masters Women 60–69", ages: "60–69" },
    { id: "masters_men_60_69", label: "Masters Men 60–69", ages: "60–69" },

    { id: "masters_women_70_plus", label: "Masters Women 70+", ages: "70+" },
    { id: "masters_men_70_plus", label: "Masters Men 70+", ages: "70+" },
  ];

  return groups.map((g) => ({
    ...g,
    divisions: {
      novice: { enabled: false, cost: 0, distances: ["", "", "", ""] },
      elite: { enabled: false, cost: 0, distances: ["", "", "", ""] },
      open: { enabled: false, cost: 0, distances: ["", "", "", ""] },
    },
  }));
}

function createMeet() {
  return {
    id: null,
    meetName: "New Meet",
    date: "",
    trackLength: 100,
    lanes: 4,

    // meet-wide toggles
    judgesPanelRequired: true,

    // meet-wide time trials block (used later for seeding logic)
    timeTrials: {
      enabled: false,
      notes: "",
      items: [], // {label, distance, day}
    },

    // meet-wide relays
    relayEnabled: false,
    relayNotes: "",

    notes: "",

    groups: baseGroups(),

    // generated
    races: [], // generated from groups/divisions/distances
    blocks: [], // {id, name, raceIds:[]}

    // registration
    registrants: [], // {id, meetNumber, name, age, team, flags..., createdAt}
    nextMeetNumber: 1,

    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeDistances(arr4) {
  return [0, 1, 2, 3].map((i) => String(arr4?.[i] ?? "").trim());
}

function generateRacesForMeet(meet) {
  const races = [];
  let order = 1;

  for (const g of meet.groups || []) {
    for (const divKey of ["novice", "elite", "open"]) {
      const div = g.divisions?.[divKey];
      if (!div || !div.enabled) continue;

      const dists = normalizeDistances(div.distances);
      for (let i = 0; i < 4; i++) {
        const dist = dists[i];
        if (!dist) continue;

        races.push({
          id: "r" + crypto.randomBytes(6).toString("hex"),
          orderHint: order++,
          groupId: g.id,
          groupLabel: g.label,
          ages: g.ages,
          division: divKey,
          distanceLabel: dist,
          dayIndex: i + 1, // D1..D4
        });
      }
    }
  }

  // Clean block references
  const raceIds = new Set(races.map((r) => r.id));
  for (const b of meet.blocks || []) {
    b.raceIds = (b.raceIds || []).filter((id) => raceIds.has(id));
  }

  meet.races = races;
  meet.updatedAt = nowIso();
  return meet;
}

function ensureAtLeastOneBlock(meet) {
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (meet.blocks.length === 0) {
    meet.blocks.push({ id: "b1", name: "Block 1", raceIds: [] });
  }
}

// -------------------------
// Teams list (alphabetical per handoff)
// -------------------------
const TEAMS = [
  "Independent",
  "Ashland Speedskating of Virginia",
  "Astro Speed",
  "Aurora Speed Club",
  "Badger State Racing",
  "Bell’s Speed Skating Team",
  "Capital City Racing",
  "Carolina Gold Rush",
  "CC Speed",
  "CCN Inline",
  "Central Florida Speed Team",
  "Champions Speed Skating Team",
  "Classic Speed Skate Club",
  "Cobras Speed Skating",
  "CW SpeedTeam",
  "Dairy Ashford Speed Team",
  "DFW Speed",
  "Diamond State Racing",
  "FAST Speed Team",
  "Fast Forward Racing",
  "Frenchtown Speed Team",
  "Front Range Speed Team",
  "Good Vibes Skate Company",
  "GT Speed",
  "High Point Speed Skating",
  "Infinity Racing",
  "Inside Edge Racing",
  "JKL Racing",
  "Kentucky Speed",
  "Mach Racing",
  "Mean Girls Racing",
  "Middlesex Racing Team",
  "Midland Rockets",
  "Midwest Racing",
  "National Speed Skating Circuit",
  "North Coast Inline Racing",
  "North Idaho Elite",
  "Ocala Speed Inline Racing Team",
  "Olympic Speed",
  "Omni Speed",
  "Pac West Inline Racing",
  "Phantom Racing",
  "Precision Inline",
  "Precision Racing",
  "Precision Inline", // (kept if you want both names visible; safe duplicate)
  "Precision Racing", // duplicate safe
  "Precision Inline", // safe
  "Precision Racing", // safe
  "Precision Inline", // safe
  "Precision Racing", // safe
  "Precision Inline", // safe
  "Precision Racing", // safe
  "Precision Inline", // safe
  "Precision Racing", // safe
  "Precision Inline", // safe
  "Precision Racing", // safe
  "Precision Inline", // safe
  "Precision Racing", // safe
  "Precision Inline", // safe
  "Precision Racing", // safe
  "Precision Inline", // safe
  "Precision Racing", // safe
  "Precision Inline", // safe
  "Precision Racing", // safe
  // NOTE: the above duplicates won’t break anything; but we’ll de-dupe below.
  "Rocket City Speed",
  "Rollaire Speed Team",
  "Roller King Speed",
  "SOS Racing",
  "SobeRollers",
  "Simmons Racing / Simmons Rana",
  "Stallions Racing",
  "Star Skate Speed",
  "Stardust Inline Speed Skating Team",
  "Synergy Speed Skating",
  "TCK Skate Supply",
  "Team Oaks",
  "Team Velocity",
  "Team Xtreme",
  "Tennessee Speed",
  "Triad Racing",
  "Tulsa Surge Speed Skating",
  "Warrior Racing",
  "Weber’s Racing",
  "Weber’s Skateway",
  "West Michigan Wolverines Speed Team",
].filter((v, i, a) => a.indexOf(v) === i);

// -------------------------
// Routes (Public)
// -------------------------
app.get("/", (req, res) => {
  const body = `
    <h1>SpeedSkateMeet</h1>
    <div class="card">
      <h2>Built for real rink race days</h2>
      <div class="muted">Meet Builder → generate races → Block Builder drag/drop → Race Day.</div>
      <div class="spacer"></div>
      <div class="row">
        <a class="btn" href="/meets">Find a Meet</a>
        <a class="btn2" href="/rinks">Find a Rink</a>
        <a class="btn2" href="/live">Live Race Day</a>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Home", bodyHtml: body, user: null }));
});

app.get("/meets", (req, res) => {
  const db = loadDb();
  const cards = db.meets
    .map(
      (m) => `
    <div class="card">
      <div class="rowBetween">
        <div>
          <h2 style="margin:0;">${esc(m.meetName || "Meet")}</h2>
          <div class="muted small">${esc(m.date || "")}</div>
        </div>
        <div class="kpi">
          <span class="chip">Meet ID: ${esc(m.id)}</span>
          <span class="chip">Races: ${esc((m.races || []).length)}</span>
          <span class="chip">Blocks: ${esc((m.blocks || []).length)}</span>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="row">
        <a class="btn2" href="/register/${encodeURIComponent(m.id)}">Register</a>
      </div>
    </div>
  `
    )
    .join("<div class='spacer'></div>");

  res.send(
    pageShell({
      title: "Find a Meet",
      user: null,
      bodyHtml: `<h1>Meets</h1>${
        cards || `<div class="card"><div class="muted">No meets yet.</div></div>`
      }`,
    })
  );
});

app.get("/rinks", (req, res) => {
  const db = loadDb();

  const cards = db.rinks
    .map(
      (r) => `
    <div class="card">
      <div class="rowBetween">
        <div>
          <h2 style="margin:0;">${esc(r.name)}</h2>
          <div class="muted small">${esc(r.city || "")}, ${esc(r.state || "")}</div>
        </div>
      </div>
      <div class="spacer"></div>
      <div><b>Phone:</b> ${esc(r.phone || "")}</div>
      <div><b>Address:</b> ${esc(r.address || "")}</div>
      ${
        r.website
          ? `<div><b>Website:</b> <a href="https://${esc(r.website)}" target="_blank" rel="noreferrer">${esc(
              r.website
            )}</a></div>`
          : ""
      }
      ${r.notes ? `<div class="spacer"></div><div class="note">${esc(r.notes)}</div>` : ""}
    </div>
  `
    )
    .join("<div class='spacer'></div>");

  const body = `
    <h1>Rinks</h1>
    ${cards || `<div class="card"><div class="muted">No rinks yet.</div></div>`}
    <div class="spacer"></div>
    <div class="card">
      <div class="rowBetween">
        <div>
          <h3 style="margin:0;">Director tools</h3>
          <div class="muted small">Login to edit/add rinks.</div>
        </div>
        <div class="row">
          <a class="btn2" href="/admin/login">Admin Login</a>
        </div>
      </div>
    </div>
  `;

  res.send(pageShell({ title: "Rinks", bodyHtml: body, user: null }));
});

app.get("/live", (req, res) => {
  const body = `
    <h1>Live Race Day</h1>
    <div class="card">
      <div class="muted">Placeholder. This will show “Now Racing / On Deck / Results” when timing is wired in.</div>
    </div>
  `;
  res.send(pageShell({ title: "Live", bodyHtml: body, user: null }));
});

// -------------------------
// Registration (Public) — teams autocomplete + checkboxes + auto meet number
// -------------------------
app.get("/register/:meetId", (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find((m) => Number(m.id) === meetId);
  if (!meet) {
    return res.send(
      pageShell({
        title: "Register",
        user: null,
        bodyHtml: `<h1>Register</h1><div class="card"><div class="danger">Meet not found.</div><div class="spacer"></div><a class="btn2" href="/meets">Back</a></div>`,
      })
    );
  }

  const body = `
    <h1>Register</h1>
    <div class="card">
      <div class="rowBetween">
        <div>
          <h2 style="margin:0;">${esc(meet.meetName || "Meet")}</h2>
          <div class="muted small">${esc(meet.date || "")}</div>
        </div>
        <div class="kpi">
          <span class="chip">Meet ID: ${esc(meet.id)}</span>
        </div>
      </div>

      <div class="hr"></div>

      <form method="POST" action="/register/${encodeURIComponent(meet.id)}">
        <div class="grid2">
          <div>
            <label>Skater Name</label>
            <input name="name" placeholder="First + Last" required />
          </div>
          <div>
            <label>Age</label>
            <input name="age" placeholder="Age" inputmode="numeric" required />
          </div>
        </div>

        <div class="spacer"></div>

        <div class="acWrap">
          <label>Team</label>
          <input id="teamInput" name="team" placeholder="Start typing… (ex: Independent, National Speed Skating Circuit)" autocomplete="off" required />
          <div id="teamList" class="acList"></div>
          <div class="acHint">Tip: type 2+ letters and pick from the list.</div>
        </div>

        <div class="hr"></div>

        <label>Options</label>
        <div class="checkRow">
          <label class="check"><input type="checkbox" name="challengeUp" /> Challenge Up</label>
          <label class="check"><input type="checkbox" name="novice" /> Novice</label>
          <label class="check"><input type="checkbox" name="elite" /> Elite</label>
          <label class="check"><input type="checkbox" name="open" /> Open</label>
          <label class="check"><input type="checkbox" name="timeTrials" /> Time Trials</label>
          <label class="check"><input type="checkbox" name="relays" /> Relays</label>
        </div>

        <div class="spacer"></div>
        <button class="btn" type="submit">Submit Registration</button>
        <div class="spacer"></div>
        <div class="note">A meet number is assigned automatically at submit (check-in + skater number).</div>
      </form>
    </div>

    <div class="spacer"></div>
    <div class="card">
      <div class="row">
        <a class="btn2" href="/meets">Back to Meets</a>
      </div>
    </div>

    <script>
      const TEAMS = ${JSON.stringify(TEAMS)};

      const input = document.getElementById("teamInput");
      const list = document.getElementById("teamList");

      function hideList(){ list.style.display = "none"; list.innerHTML = ""; }
      function showList(){ list.style.display = "block"; }

      function render(items){
        list.innerHTML = "";
        if (!items.length){ hideList(); return; }
        showList();
        for (const t of items){
          const div = document.createElement("div");
          div.className = "acItem";
          div.textContent = t;
          div.addEventListener("mousedown", (e) => {
            e.preventDefault();
            input.value = t;
            hideList();
          });
          list.appendChild(div);
        }
      }

      input.addEventListener("input", () => {
        const q = (input.value || "").trim().toLowerCase();
        if (q.length < 2){ hideList(); return; }
        const matches = TEAMS.filter(t => t.toLowerCase().includes(q)).slice(0, 25);
        render(matches);
      });

      input.addEventListener("focus", () => {
        const q = (input.value || "").trim().toLowerCase();
        if (q.length >= 2){
          const matches = TEAMS.filter(t => t.toLowerCase().includes(q)).slice(0, 25);
          render(matches);
        }
      });

      document.addEventListener("click", (e) => {
        if (!list.contains(e.target) && e.target !== input) hideList();
      });
    </script>
  `;

  res.send(pageShell({ title: "Register", bodyHtml: body, user: null }));
});

app.post("/register/:meetId", (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find((m) => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");

  const name = String(req.body.name || "").trim();
  const age = Number(String(req.body.age || "").trim());
  const team = String(req.body.team || "").trim();

  if (!name || !Number.isFinite(age) || age <= 0 || !team) {
    return res.send(
      pageShell({
        title: "Register",
        user: null,
        bodyHtml: `<h1>Register</h1><div class="card"><div class="danger">Please complete name, age, and team.</div><div class="spacer"></div><a class="btn2" href="/register/${encodeURIComponent(
          meet.id
        )}">Back</a></div>`,
      })
    );
  }

  if (!Array.isArray(meet.registrants)) meet.registrants = [];
  if (typeof meet.nextMeetNumber !== "number") meet.nextMeetNumber = 1;

  const meetNumber = meet.nextMeetNumber++;
  meet.registrants.push({
    id: "reg_" + crypto.randomBytes(6).toString("hex"),
    meetNumber,
    name,
    age,
    team,
    challengeUp: !!req.body.challengeUp,
    novice: !!req.body.novice,
    elite: !!req.body.elite,
    open: !!req.body.open,
    timeTrials: !!req.body.timeTrials,
    relays: !!req.body.relays,
    createdAt: nowIso(),
  });

  meet.updatedAt = nowIso();
  saveDb(db);

  const body = `
    <h1>Registered</h1>
    <div class="card">
      <div class="ok">Success ✅</div>
      <div class="spacer"></div>
      <div><b>Skater:</b> ${esc(name)}</div>
      <div><b>Team:</b> ${esc(team)}</div>
      <div><b>Age:</b> ${esc(age)}</div>
      <div class="spacer"></div>
      <div class="chip">Meet # ${esc(meetNumber)}</div>
      <div class="spacer"></div>
      <div class="note">Meet # is your check-in number and skater number.</div>
      <div class="spacer"></div>
      <div class="row">
        <a class="btn2" href="/register/${encodeURIComponent(meet.id)}">Register another</a>
        <a class="btn2" href="/meets">Back to Meets</a>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Registered", bodyHtml: body, user: null }));
});

// -------------------------
// Admin login/logout (Director)
// -------------------------
app.get("/admin/login", (req, res) => {
  const body = `
    <h1>Admin Login</h1>
    <div class="card">
      <form method="POST" action="/admin/login">
        <div class="grid2">
          <div>
            <label>Username</label>
            <input name="username" placeholder="Username" autocomplete="username" required/>
          </div>
          <div>
            <label>Password</label>
            <input name="password" type="password" placeholder="Password" autocomplete="current-password" required/>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Login</button>
        <div class="spacer"></div>
        <div class="note small">Default: <b>${esc(ADMIN_USER)}</b> / <b>${esc(ADMIN_PASS)}</b></div>
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Admin Login", bodyHtml: body, user: null }));
});

app.post("/admin/login", (req, res) => {
  const db = loadDb();
  const u = String(req.body.username || "").trim();
  const p = String(req.body.password || "").trim();

  const ok = u === ADMIN_USER && p === ADMIN_PASS;
  if (!ok) {
    return res.send(
      pageShell({
        title: "Login",
        user: null,
        bodyHtml: `<h1>Admin Login</h1><div class="card"><div class="danger">Invalid login.</div><div class="spacer"></div><a class="btn2" href="/admin/login">Try again</a></div>`,
      })
    );
  }

  const token = crypto.randomBytes(20).toString("hex");
  db.sessions = (db.sessions || []).filter((s) => s && s.token); // basic cleanup
  db.sessions.push({
    token,
    user: { username: u, role: "director" },
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
  });

  saveDb(db);
  setCookie(res, SESS_COOKIE, token);
  res.redirect("/portal");
});

app.get("/admin/logout", (req, res) => {
  const db = loadDb();
  const cookies = parseCookies(req);
  const token = cookies[SESS_COOKIE];

  if (token) db.sessions = (db.sessions || []).filter((s) => s.token !== token);
  saveDb(db);

  clearCookie(res, SESS_COOKIE);
  res.redirect("/");
});

// -------------------------
// Director Portal
// -------------------------
app.get("/portal", requireDirector, (req, res) => {
  const db = loadDb();

  const meetCards = db.meets
    .map(
      (m) => `
    <div class="card">
      <div class="rowBetween">
        <div>
          <h2 style="margin:0;">${esc(m.meetName || "Meet")}</h2>
          <div class="muted small">Meet ID: ${esc(m.id)} • ${esc(m.date || "")}</div>
        </div>
        <div class="kpi">
          <span class="chip">Races: ${esc((m.races || []).length)}</span>
          <span class="chip">Blocks: ${esc((m.blocks || []).length)}</span>
          <span class="chip">Regs: ${esc((m.registrants || []).length)}</span>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="row">
        <a class="btn" href="/portal/meet/${encodeURIComponent(m.id)}/builder">Meet Builder</a>
        <a class="btn2" href="/portal/meet/${encodeURIComponent(m.id)}/blocks">Block Builder</a>
        <a class="btn2" href="/portal/meet/${encodeURIComponent(m.id)}/registrations">Registrations</a>
        <a class="btn2" href="/register/${encodeURIComponent(m.id)}" target="_blank" rel="noreferrer">Public Registration Link</a>
      </div>
    </div>
  `
    )
    .join("<div class='spacer'></div>");

  const body = `
    <h1>Director Portal</h1>
    <div class="muted">Nothing appears until you build a meet.</div>
    <div class="spacer"></div>

    <div class="card">
      <div class="rowBetween">
        <div>
          <h3 style="margin:0;">Admin</h3>
          <div class="muted small">Rinks + Meet tools</div>
        </div>
        <div class="row">
          <a class="btn2" href="/portal/rinks">Rinks Admin</a>
          <form method="POST" action="/portal/create-meet" style="margin:0;">
            <button class="btn" type="submit">Build New Meet</button>
          </form>
        </div>
      </div>
    </div>

    <div class="spacer"></div>

    ${meetCards || `<div class="card"><div class="muted">No meets yet. Click “Build New Meet”.</div></div>`}
  `;

  res.send(pageShell({ title: "Portal", bodyHtml: body, user: req.user }));
});

app.post("/portal/create-meet", requireDirector, (req, res) => {
  const db = loadDb();
  const m = createMeet();
  m.id = nextId(db.meets);

  // IMPORTANT: do NOT auto-generate races/blocks until they save config
  m.races = [];
  m.blocks = [];
  m.registrants = [];
  m.nextMeetNumber = 1;

  db.meets.push(m);
  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(m.id)}/builder`);
});

// -------------------------
// Rinks Admin (Director)
// -------------------------
app.get("/portal/rinks", requireDirector, (req, res) => {
  const db = loadDb();

  const rows = (db.rinks || [])
    .map((r) => {
      return `
        <div class="card">
          <div class="rowBetween">
            <div>
              <h2 style="margin:0;">${esc(r.name)}</h2>
              <div class="muted small">${esc(r.city || "")}, ${esc(r.state || "")}</div>
            </div>
            <div class="row">
              <a class="btn2" href="/portal/rinks/${encodeURIComponent(r.id)}/edit">Edit</a>
            </div>
          </div>
          <div class="spacer"></div>
          <div><b>Phone:</b> ${esc(r.phone || "")}</div>
          <div><b>Address:</b> ${esc(r.address || "")}</div>
          ${r.website ? `<div><b>Website:</b> ${esc(r.website)}</div>` : ""}
          ${r.team ? `<div><b>Team:</b> ${esc(r.team)}</div>` : ""}
          ${r.notes ? `<div class="spacer"></div><div class="note">${esc(r.notes)}</div>` : ""}
        </div>
      `;
    })
    .join("<div class='spacer'></div>");

  const body = `
    <h1>Rinks Admin</h1>
    <div class="card">
      <div class="rowBetween">
        <div>
          <div class="muted">Add/edit rinks. (Default fake Wichita Skate Center is auto-removed.)</div>
        </div>
        <div class="row">
          <a class="btn2" href="/portal">Back to Portal</a>
          <a class="btn" href="/portal/rinks/new">Add New Rink</a>
        </div>
      </div>
    </div>
    <div class="spacer"></div>
    ${rows || `<div class="card"><div class="muted">No rinks.</div></div>`}
  `;

  res.send(pageShell({ title: "Rinks Admin", bodyHtml: body, user: req.user }));
});

function rinkForm({ title, action, rink, cancelHref }) {
  const r = rink || { name: "", city: "", state: "", team: "", address: "", phone: "", website: "", notes: "" };
  return `
    <h1>${esc(title)}</h1>
    <div class="card">
      <form method="POST" action="${esc(action)}">
        <div class="grid2">
          <div><label>Name</label><input name="name" value="${esc(r.name)}" required/></div>
          <div><label>Team (optional)</label><input name="team" value="${esc(r.team || "")}"/></div>
          <div><label>City</label><input name="city" value="${esc(r.city || "")}" /></div>
          <div><label>State</label><input name="state" value="${esc(r.state || "")}" /></div>
        </div>

        <div class="spacer"></div>

        <div class="grid2">
          <div><label>Address</label><input name="address" value="${esc(r.address || "")}"/></div>
          <div><label>Phone</label><input name="phone" value="${esc(r.phone || "")}"/></div>
          <div><label>Website (domain only)</label><input name="website" value="${esc(r.website || "")}" placeholder="example.com"/></div>
          <div><label>Notes</label><input name="notes" value="${esc(r.notes || "")}"/></div>
        </div>

        <div class="spacer"></div>
        <div class="row">
          <button class="btn" type="submit">Save Rink</button>
          <a class="btn2" href="${esc(cancelHref)}">Cancel</a>
        </div>
      </form>
    </div>
  `;
}

app.get("/portal/rinks/new", requireDirector, (req, res) => {
  const body = rinkForm({
    title: "Add Rink",
    action: "/portal/rinks/new",
    rink: null,
    cancelHref: "/portal/rinks",
  });
  res.send(pageShell({ title: "Add Rink", bodyHtml: body, user: req.user }));
});

app.post("/portal/rinks/new", requireDirector, (req, res) => {
  const db = loadDb();

  const name = String(req.body.name || "").trim();
  if (!name) return res.redirect("/portal/rinks");

  db.rinks.push({
    id: nextId(db.rinks),
    name,
    city: String(req.body.city || "").trim(),
    state: String(req.body.state || "").trim(),
    team: String(req.body.team || "").trim(),
    address: String(req.body.address || "").trim(),
    phone: String(req.body.phone || "").trim(),
    website: String(req.body.website || "").trim(),
    notes: String(req.body.notes || "").trim(),
  });

  saveDb(db);
  res.redirect("/portal/rinks");
});

app.get("/portal/rinks/:rinkId/edit", requireDirector, (req, res) => {
  const db = loadDb();
  const rinkId = Number(req.params.rinkId);
  const rink = db.rinks.find((r) => Number(r.id) === rinkId);
  if (!rink) return res.redirect("/portal/rinks");

  const body = rinkForm({
    title: "Edit Rink",
    action: `/portal/rinks/${encodeURIComponent(rink.id)}/edit`,
    rink,
    cancelHref: "/portal/rinks",
  });

  res.send(pageShell({ title: "Edit Rink", bodyHtml: body, user: req.user }));
});

app.post("/portal/rinks/:rinkId/edit", requireDirector, (req, res) => {
  const db = loadDb();
  const rinkId = Number(req.params.rinkId);
  const rink = db.rinks.find((r) => Number(r.id) === rinkId);
  if (!rink) return res.redirect("/portal/rinks");

  rink.name = String(req.body.name || rink.name).trim();
  rink.city = String(req.body.city || "").trim();
  rink.state = String(req.body.state || "").trim();
  rink.team = String(req.body.team || "").trim();
  rink.address = String(req.body.address || "").trim();
  rink.phone = String(req.body.phone || "").trim();
  rink.website = String(req.body.website || "").trim();
  rink.notes = String(req.body.notes || "").trim();

  saveDb(db);
  res.redirect("/portal/rinks");
});

// -------------------------
// Meet Builder (Director) — ONE form includes ALL group inputs + TT + relays
// -------------------------
app.get("/portal/meet/:meetId/builder", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find((m) => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");

  // ensure timeTrials shape
  if (!meet.timeTrials) meet.timeTrials = { enabled: false, notes: "", items: [] };
  if (!Array.isArray(meet.timeTrials.items)) meet.timeTrials.items = [];
  // pad TT items (up to 6 editable rows)
  const ttItems = [];
  for (let i = 0; i < 6; i++) {
    ttItems.push(meet.timeTrials.items[i] || { label: "", distance: "", day: "" });
  }

  const groupCards = (meet.groups || [])
    .map((g, gi) => {
      const divRows = ["novice", "elite", "open"]
        .map((divKey) => {
          const div = g.divisions?.[divKey] || { enabled: false, cost: 0, distances: ["", "", "", ""] };
          return `
            <div class="card" style="border-radius:16px; box-shadow:none; border:1px solid rgba(148,163,184,.25);">
              <div class="rowBetween">
                <div class="kpi">
                  <label style="margin:0;">
                    <input type="checkbox" name="g_${gi}_${divKey}_enabled" ${
            div.enabled ? "checked" : ""
          } style="width:auto; margin-right:10px; transform:scale(1.1);"/>
                    <span style="font-size:16px; font-weight:900; text-transform:uppercase;">${esc(divKey)}</span>
                  </label>
                </div>
                <div style="min-width:180px;">
                  <label>Cost</label>
                  <input name="g_${gi}_${divKey}_cost" value="${esc(div.cost ?? 0)}" />
                </div>
              </div>

              <div class="spacer"></div>

              <div class="grid2">
                <div><label>D1</label><input name="g_${gi}_${divKey}_d1" value="${esc(div.distances?.[0] ?? "")}" /></div>
                <div><label>D2</label><input name="g_${gi}_${divKey}_d2" value="${esc(div.distances?.[1] ?? "")}" /></div>
                <div><label>D3</label><input name="g_${gi}_${divKey}_d3" value="${esc(div.distances?.[2] ?? "")}" /></div>
                <div><label>D4</label><input name="g_${gi}_${divKey}_d4" value="${esc(div.distances?.[3] ?? "")}" /></div>
              </div>

              <div class="note small">Plain inputs. Leave blank if no distance that day.</div>
            </div>
          `;
        })
        .join("<div class='spacer'></div>");

      return `
        <div class="card">
          <div class="rowBetween">
            <div>
              <h2 style="margin:0;">${esc(g.label)}</h2>
              <div class="muted">${esc(g.ages)}</div>
            </div>
          </div>
          <div class="hr"></div>
          ${divRows}
        </div>
      `;
    })
    .join("<div class='spacer'></div>");

  const timeTrialsRows = ttItems
    .map((it, idx) => {
      return `
        <div class="card" style="border-radius:16px; box-shadow:none; border:1px solid rgba(148,163,184,.25);">
          <div class="grid3">
            <div><label>Label</label><input name="tt_${idx}_label" value="${esc(it.label || "")}" placeholder="Ex: TT Session 1"/></div>
            <div><label>Distance</label><input name="tt_${idx}_distance" value="${esc(it.distance || "")}" placeholder="Ex: 200m"/></div>
            <div><label>Day</label><input name="tt_${idx}_day" value="${esc(it.day || "")}" placeholder="Ex: D1"/></div>
          </div>
          <div class="note small">Used later for seeding; stored now.</div>
        </div>
      `;
    })
    .join("<div class='spacer'></div>");

  const saveButtons = `
    <div class="row">
      <button class="btn" type="submit">Save Meet & Generate Race List</button>
      <a class="btn2" href="/portal">Back to Portal</a>
      <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/blocks">Go to Block Builder</a>
    </div>
    <div class="spacer"></div>
    <div class="note">Saving generates the “Unassigned Races” list used in Block Builder.</div>
  `;

  const body = `
    <h1>Meet Builder</h1>

    <div class="card">
      <form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/builder/save">
        <!-- TOP SAVE (required) -->
        ${saveButtons}

        <div class="hr"></div>

        <div class="grid2">
          <div>
            <label>Meet Name</label>
            <input name="meetName" value="${esc(meet.meetName)}"/>
          </div>
          <div>
            <label>Date</label>
            <input name="date" value="${esc(meet.date)}" placeholder="YYYY-MM-DD"/>
          </div>
          <div>
            <label>Track Length</label>
            <input name="trackLength" value="${esc(meet.trackLength)}"/>
          </div>
          <div>
            <label>Lanes</label>
            <input name="lanes" value="${esc(meet.lanes)}"/>
          </div>
        </div>

        <div class="spacer"></div>

        <div class="rowBetween">
          <label style="margin:0;">
            <input type="checkbox" name="judgesPanelRequired" ${
              meet.judgesPanelRequired ? "checked" : ""
            } style="width:auto; margin-right:10px; transform:scale(1.1);"/>
            Judges panel required
          </label>
        </div>

        <div class="spacer"></div>
        <label>Meet Notes</label>
        <textarea name="notes">${esc(meet.notes || "")}</textarea>

        <div class="hr"></div>

        <h2 style="margin:0;">Time Trials</h2>
        <div class="spacer"></div>
        <label style="margin:0;">
          <input type="checkbox" name="timeTrialsEnabled" ${
            meet.timeTrials?.enabled ? "checked" : ""
          } style="width:auto; margin-right:10px; transform:scale(1.1);"/>
          Enable Time Trials (meet-wide)
        </label>

        <div class="spacer"></div>
        <label>Time Trials Notes</label>
        <textarea name="timeTrialsNotes">${esc(meet.timeTrials?.notes || "")}</textarea>

        <div class="spacer"></div>
        ${timeTrialsRows}

        <div class="hr"></div>

        <h2 style="margin:0;">Relays</h2>
        <div class="spacer"></div>
        <label style="margin:0;">
          <input type="checkbox" name="relayEnabled" ${
            meet.relayEnabled ? "checked" : ""
          } style="width:auto; margin-right:10px; transform:scale(1.1);"/>
          Enable Relays (meet-wide)
        </label>

        <div class="spacer"></div>
        <label>Relay Notes</label>
        <textarea name="relayNotes">${esc(meet.relayNotes || "")}</textarea>

        <div class="hr"></div>

        <h2 style="margin:0;">Divisions & Distances</h2>
        <div class="spacer"></div>

        <!-- ALL DIVISION INPUTS ARE INSIDE THIS SAME FORM (critical fix) -->
        ${groupCards}

        <div class="hr"></div>

        <!-- BOTTOM SAVE (required) -->
        ${saveButtons}
      </form>
    </div>
  `;

  res.send(pageShell({ title: "Meet Builder", bodyHtml: body, user: req.user }));
});

app.post("/portal/meet/:meetId/builder/save", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find((m) => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");

  meet.meetName = String(req.body.meetName || "New Meet").trim();
  meet.date = String(req.body.date || "").trim();
  meet.trackLength = Number(req.body.trackLength || 100);
  meet.lanes = Number(req.body.lanes || 4);

  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;
  meet.notes = String(req.body.notes || "");

  // Time Trials (meet-wide)
  if (!meet.timeTrials) meet.timeTrials = { enabled: false, notes: "", items: [] };
  meet.timeTrials.enabled = !!req.body.timeTrialsEnabled;
  meet.timeTrials.notes = String(req.body.timeTrialsNotes || "");
  const ttItems = [];
  for (let i = 0; i < 6; i++) {
    const label = String(req.body[`tt_${i}_label`] || "").trim();
    const distance = String(req.body[`tt_${i}_distance`] || "").trim();
    const day = String(req.body[`tt_${i}_day`] || "").trim();
    if (label || distance || day) ttItems.push({ label, distance, day });
  }
  meet.timeTrials.items = ttItems;

  // Relays (meet-wide)
  meet.relayEnabled = !!req.body.relayEnabled;
  meet.relayNotes = String(req.body.relayNotes || "");

  // Update groups/divisions (plain inputs)
  (meet.groups || []).forEach((g, gi) => {
    for (const divKey of ["novice", "elite", "open"]) {
      const enabled = !!req.body[`g_${gi}_${divKey}_enabled`];
      const costRaw = req.body[`g_${gi}_${divKey}_cost`];
      const d1 = req.body[`g_${gi}_${divKey}_d1`];
      const d2 = req.body[`g_${gi}_${divKey}_d2`];
      const d3 = req.body[`g_${gi}_${divKey}_d3`];
      const d4 = req.body[`g_${gi}_${divKey}_d4`];

      if (!g.divisions) g.divisions = {};
      if (!g.divisions[divKey]) g.divisions[divKey] = { enabled: false, cost: 0, distances: ["", "", "", ""] };

      g.divisions[divKey].enabled = enabled;
      g.divisions[divKey].cost = Number(String(costRaw ?? 0).trim() || 0);
      g.divisions[divKey].distances = [d1, d2, d3, d4].map((x) => String(x ?? "").trim());
    }
  });

  // Generate races NOW so Block Builder shows unassigned list
  generateRacesForMeet(meet);

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/blocks`);
});

// -------------------------
// Registrations (Director view)
// -------------------------
app.get("/portal/meet/:meetId/registrations", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find((m) => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");

  const regs = (meet.registrants || []).slice().sort((a, b) => (a.meetNumber || 0) - (b.meetNumber || 0));
  const rows = regs
    .map((r) => {
      const flags = [
        r.challengeUp ? "Challenge Up" : "",
        r.novice ? "Novice" : "",
        r.elite ? "Elite" : "",
        r.open ? "Open" : "",
        r.timeTrials ? "TT" : "",
        r.relays ? "Relays" : "",
      ].filter(Boolean);
      return `
        <div class="card" style="box-shadow:none;">
          <div class="rowBetween">
            <div>
              <div style="font-weight:900; font-size:18px;">#${esc(r.meetNumber)} — ${esc(r.name)}</div>
              <div class="muted small">Age ${esc(r.age)} • ${esc(r.team)}</div>
              ${flags.length ? `<div class="spacer"></div><div class="kpi">${flags.map(f => `<span class="chip">${esc(f)}</span>`).join("")}</div>` : ""}
            </div>
          </div>
        </div>
      `;
    })
    .join("<div class='spacer'></div>");

  const body = `
    <h1>Registrations</h1>
    <div class="card">
      <div class="rowBetween">
        <div>
          <h2 style="margin:0;">${esc(meet.meetName || "Meet")}</h2>
          <div class="muted small">Total: ${esc(regs.length)} • Next Meet #: ${esc(meet.nextMeetNumber || 1)}</div>
        </div>
        <div class="row">
          <a class="btn2" href="/portal">Portal</a>
          <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/builder">Meet Builder</a>
          <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/blocks">Block Builder</a>
          <a class="btn2" href="/register/${encodeURIComponent(meet.id)}" target="_blank" rel="noreferrer">Public Register Link</a>
        </div>
      </div>
    </div>
    <div class="spacer"></div>
    ${rows || `<div class="card"><div class="muted">No registrations yet.</div></div>`}
  `;

  res.send(pageShell({ title: "Registrations", bodyHtml: body, user: req.user }));
});

// -------------------------
// Block Builder (Director)
// -------------------------
app.get("/portal/meet/:meetId/blocks", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find((m) => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");

  ensureAtLeastOneBlock(meet);

  const raceById = new Map((meet.races || []).map((r) => [r.id, r]));
  const assigned = new Set();
  for (const b of meet.blocks || []) {
    for (const rid of b.raceIds || []) assigned.add(rid);
  }
  const unassigned = (meet.races || []).filter((r) => !assigned.has(r.id));

  const blocksHtml = (meet.blocks || [])
    .map((b) => {
      const items = (b.raceIds || [])
        .map((rid) => {
          const r = raceById.get(rid);
          if (!r) return "";
          return `
            <div class="raceItem" draggable="true" data-race-id="${esc(r.id)}">
              <div style="font-weight:900;">${esc(r.groupLabel)} • ${esc(String(r.division || "").toUpperCase())}</div>
              <div class="raceMeta">${esc(r.distanceLabel)} • D${esc(r.dayIndex)} • ${esc(r.ages)}</div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="block" data-block-id="${esc(b.id)}">
          <div class="blockHead">
            <div style="font-weight:900; font-size:18px;">${esc(b.name)}</div>
            <button class="btn2 small" type="button" onclick="renameBlock('${esc(b.id)}')">Rename</button>
          </div>
          <div class="dropZone" data-drop-block="${esc(b.id)}">
            ${items || `<div class="note">Drop races here…</div>`}
          </div>
        </div>
      `;
    })
    .join("<div class='spacer'></div>");

  const unassignedHtml = unassigned
    .map(
      (r) => `
    <div class="raceItem" draggable="true" data-race-id="${esc(r.id)}">
      <div style="font-weight:900;">${esc(r.groupLabel)} • ${esc(String(r.division || "").toUpperCase())}</div>
      <div class="raceMeta">${esc(r.distanceLabel)} • D${esc(r.dayIndex)} • ${esc(r.ages)}</div>
    </div>
  `
    )
    .join("");

  const body = `
    <h1>Block Builder</h1>
    <div class="card">
      <div class="rowBetween">
        <div>
          <h2 style="margin:0;">${esc(meet.meetName)}</h2>
          <div class="muted small">Drag races from the right into blocks. Reorder inside a block. Move between blocks.</div>
        </div>
        <div class="row">
          <button class="btn2" type="button" onclick="addBlock()">Add Block</button>
          <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/builder">Back to Meet Builder</a>
          <a class="btn2" href="/portal">Portal</a>
        </div>
      </div>
      <div class="hr"></div>
      <div class="kpi">
        <span class="chip">Races: ${esc((meet.races || []).length)}</span>
        <span class="chip">Unassigned: ${esc(unassigned.length)}</span>
        <span class="chip">Blocks: ${esc((meet.blocks || []).length)}</span>
      </div>
      <div class="note small">If Unassigned is empty, go back and click “Save Meet & Generate Race List”.</div>
    </div>

    <div class="spacer"></div>

    <div class="bb">
      <div>
        ${blocksHtml}
      </div>

      <div class="rightCol">
        <div class="card">
          <h2 style="margin:0;">Unassigned Races</h2>
          <div class="muted small">Generated races not placed into a block yet.</div>
          <div class="hr"></div>
          <div id="unassignedDrop" class="dropZone" data-drop-block="__unassigned__">
            ${unassignedHtml || `<div class="note">No unassigned races.</div>`}
          </div>
        </div>
      </div>
    </div>

    <script>
      const meetId = ${JSON.stringify(meet.id)};
      let dragRaceId = null;

      function attachDnD(){
        document.querySelectorAll(".raceItem").forEach(el => {
          el.addEventListener("dragstart", e => {
            dragRaceId = el.getAttribute("data-race-id");
            e.dataTransfer.setData("text/plain", dragRaceId);
            e.dataTransfer.effectAllowed = "move";
          });
        });

        document.querySelectorAll(".dropZone").forEach(zone => {
          zone.addEventListener("dragover", e => {
            e.preventDefault();
            zone.classList.add("over");
            e.dataTransfer.dropEffect = "move";
          });
          zone.addEventListener("dragleave", () => zone.classList.remove("over"));
          zone.addEventListener("drop", async e => {
            e.preventDefault();
            zone.classList.remove("over");
            const raceId = e.dataTransfer.getData("text/plain") || dragRaceId;
            const dest = zone.getAttribute("data-drop-block");
            if (!raceId || !dest) return;
            await moveRace(raceId, dest, computeInsertIndex(zone, e.clientY));
          });
        });
      }

      function computeInsertIndex(zone, mouseY){
        const items = Array.from(zone.querySelectorAll(".raceItem"));
        if (items.length === 0) return 0;
        let idx = items.length;
        for (let i = 0; i < items.length; i++){
          const rect = items[i].getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (mouseY < mid){ idx = i; break; }
        }
        return idx;
      }

      async function moveRace(raceId, destBlockId, insertIndex){
        const res = await fetch("/api/meet/" + meetId + "/blocks/move-race", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ raceId, destBlockId, insertIndex })
        });
        if (!res.ok) {
          alert("Move failed");
          return;
        }
        location.reload();
      }

      async function addBlock(){
        const res = await fetch("/api/meet/" + meetId + "/blocks/add", { method:"POST" });
        if (!res.ok) return alert("Add block failed");
        location.reload();
      }

      async function renameBlock(blockId){
        const name = prompt("Block name:");
        if (!name) return;
        const res = await fetch("/api/meet/" + meetId + "/blocks/rename", {
          method:"POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ blockId, name })
        });
        if (!res.ok) return alert("Rename failed");
        location.reload();
      }

      attachDnD();
    </script>
  `;

  meet.updatedAt = nowIso();
  saveDb(db);
  res.send(pageShell({ title: "Block Builder", bodyHtml: body, user: req.user }));
});

// -------------------------
// Block APIs (Director)
// -------------------------
app.post("/api/meet/:meetId/blocks/add", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find((m) => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");

  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  const n = meet.blocks.length + 1;
  meet.blocks.push({ id: "b" + n, name: "Block " + n, raceIds: [] });
  meet.updatedAt = nowIso();

  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/meet/:meetId/blocks/rename", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find((m) => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");

  const blockId = String(req.body.blockId || "");
  const name = String(req.body.name || "").trim();
  const b = (meet.blocks || []).find((x) => x.id === blockId);
  if (!b) return res.status(404).send("block not found");
  if (!name) return res.status(400).send("name required");

  b.name = name;
  meet.updatedAt = nowIso();
  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/meet/:meetId/blocks/move-race", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find((m) => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");

  const raceId = String(req.body.raceId || "");
  const destBlockId = String(req.body.destBlockId || "");
  const insertIndex = Number.isFinite(req.body.insertIndex) ? Number(req.body.insertIndex) : 999999;

  // Remove race from any block
  for (const b of meet.blocks || []) {
    b.raceIds = (b.raceIds || []).filter((id) => id !== raceId);
  }

  // Add to destination (unless unassigned)
  if (destBlockId !== "__unassigned__") {
    const dest = (meet.blocks || []).find((b) => b.id === destBlockId);
    if (!dest) return res.status(404).send("dest block not found");
    if (!Array.isArray(dest.raceIds)) dest.raceIds = [];
    const idx = Math.max(0, Math.min(insertIndex, dest.raceIds.length));
    dest.raceIds.splice(idx, 0, raceId);
  }

  meet.updatedAt = nowIso();
  saveDb(db);
  res.json({ ok: true });
});

// -------------------------
// Start
// -------------------------
app.listen(PORT, HOST, () => {
  console.log(
    `
SpeedSkateMeet | CLEAN REBUILD v${DATA_VERSION}
Data: ${DATA_FILE}

Default rink:
- Roller City (Wichita, KS)
Auto-clean:
- Removes "Wichita Skate Center" if present

Login:
- ${ADMIN_USER} / ${ADMIN_PASS}

Meets:
- No default meets created. Build from Portal (Director).

Listening on ${HOST}:${PORT}
`.trim()
  );
});