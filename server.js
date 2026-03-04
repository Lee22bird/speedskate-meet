// ============================================================
// SpeedSkateMeet – CLEAN REBUILD v10.1 (single-file server.js)
// Node.js + Express • JSON persistence (ssm_db.json)
//
// IMPORTANT NOTES (Render persistence):
// - If a persistent disk is mounted at /data, we will store DB at /data/ssm_db.json
// - Otherwise we fall back to ./ssm_db.json (ephemeral on some hosts)
//
// INCLUDED / FIXED:
// ✅ Admin login restored: Lbird22 / Redline22
// ✅ Sessions survive restarts (stateless signed cookie)
// ✅ Roller City is the ONLY default rink
// ✅ Auto-remove/replace "Wichita Skate Center" if present
// ✅ Rinks Admin (add/edit) restored
// ✅ Portal shows ZERO meets until created
// ✅ Full USARS-style divisions list (includes Senior+, Masters/Classic categories)
// ✅ Meet Builder: Date picker + Start Time + Registration Close
// ✅ Meet Builder: D1–D4 plain inputs; Save at TOP + BOTTOM; Save generates Race List
// ✅ Registration: Teams autocomplete (opens on focus), includes Independent + provided list
// ✅ Auto Meet Number assigned on registration submit (check-in + skater number)
// ✅ Block Builder: Unassigned races right; blocks left; drag/drop reorder; persists
// ✅ Block Builder: Block Day dropdown + optional Label text (distance/session notes)
// ✅ Print Race Program (race list) based on block order
// ✅ Basic Coach Portal concept: roster + now racing/on deck (team-focused)
// ✅ Basic Race Day + Judge Entry screens (time-trial time entry OR place entry)
// ✅ Directors can Unlock/Relock races to correct mistakes
// ✅ Multi-role access model foundation (Admin/Director/Judge/Coach via staff/PIN)
//
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

const DATA_VERSION = 101;

// Prefer /data if it exists (Render persistent disk); else local file
const DEFAULT_DATA_FILE = fs.existsSync("/data") ? "/data/ssm_db.json" : path.join(__dirname, "ssm_db.json");
const DATA_FILE = process.env.SSM_DATA_FILE || DEFAULT_DATA_FILE;

// -------------------------
// DB helpers
// -------------------------
function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, obj) {
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
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
    meta: {
      // cookie signing secret persisted in DB so logins survive restarts even without env var
      cookieSecret: crypto.randomBytes(32).toString("hex"),
    },
    users: [
      // Super Admin
      { id: "u_admin", username: "Lbird22", password: "Redline22", role: "superadmin", createdAt: nowIso() },
    ],
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
    meets: [],
    // Global coach directory (permanent PINs)
    coaches: [
      // { id, name, team, pin6, phone, email, notes, createdAt }
    ],
  };
}

function normalizeDb(db) {
  if (!db || typeof db !== "object") db = defaultDb();
  if (!db.version) db.version = DATA_VERSION;
  if (!db.meta) db.meta = {};
  if (!db.meta.cookieSecret) db.meta.cookieSecret = crypto.randomBytes(32).toString("hex");
  if (!Array.isArray(db.users)) db.users = defaultDb().users;
  if (!Array.isArray(db.meets)) db.meets = [];
  if (!Array.isArray(db.rinks)) db.rinks = defaultDb().rinks;
  if (!Array.isArray(db.coaches)) db.coaches = [];

  // --- Rink cleanup / migration ---
  // Remove fake Wichita Skate Center; ensure Roller City exists (single default).
  const hasRollerCity = db.rinks.some(r => String(r.name || "").toLowerCase().includes("roller city"));
  db.rinks = db.rinks.filter(r => String(r.name || "").trim().toLowerCase() !== "wichita skate center");
  if (!hasRollerCity) {
    db.rinks.unshift(defaultDb().rinks[0]);
  }
  // De-duplicate Roller City by name
  const seen = new Set();
  db.rinks = db.rinks.filter(r => {
    const key = String(r.name || "").trim().toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Bump version
  db.version = DATA_VERSION;
  return db;
}

function loadDb() {
  const raw = safeReadJson(DATA_FILE);
  if (!raw) {
    const fresh = normalizeDb(defaultDb());
    writeJsonAtomic(DATA_FILE, fresh);
    return fresh;
  }
  const db = normalizeDb(raw);
  // write back after migration/normalization to keep it clean
  writeJsonAtomic(DATA_FILE, db);
  return db;
}

function saveDb(db) {
  db.version = DATA_VERSION;
  db.updatedAt = nowIso();
  writeJsonAtomic(DATA_FILE, db);
}

function nextNumericId(arr) {
  let max = 0;
  for (const x of arr) max = Math.max(max, Number(x.id) || 0);
  return max + 1;
}

function nextShortId(prefix) {
  return prefix + crypto.randomBytes(6).toString("hex");
}

// -------------------------
// Cookie auth (stateless signed cookie)
// -------------------------
const SESS_COOKIE = "ssm_auth";

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").map(s => s.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf("=");
    if (idx > -1) out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
  });
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [];
  parts.push(`${name}=${encodeURIComponent(value)}`);
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (opts.maxAgeSec) parts.push(`Max-Age=${opts.maxAgeSec}`);
  // If you're behind HTTPS (Render), Secure is good; if local http, it can break cookies.
  if (opts.secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlDecode(str) {
  str = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function signToken(secretHex, payloadObj) {
  const payload = b64urlEncode(JSON.stringify(payloadObj));
  const h = crypto.createHmac("sha256", Buffer.from(secretHex, "hex")).update(payload).digest();
  const sig = b64urlEncode(h);
  return `${payload}.${sig}`;
}

function verifyToken(secretHex, token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = b64urlEncode(
    crypto.createHmac("sha256", Buffer.from(secretHex, "hex")).update(payload).digest()
  );
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const obj = JSON.parse(b64urlDecode(payload).toString("utf8"));
    return obj;
  } catch {
    return null;
  }
}

function getAuth(req) {
  const db = loadDb();
  const secret = db.meta.cookieSecret;
  const cookies = parseCookies(req);
  const tok = cookies[SESS_COOKIE];
  const payload = verifyToken(secret, tok);
  if (!payload) return null;

  // payload: { t, kind, username, role, team, coachId, meetId? }
  // Optional expiry (30 days default)
  const ageMs = Date.now() - Number(payload.t || 0);
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) return null;

  return payload;
}

function requireAdmin(req, res, next) {
  const auth = getAuth(req);
  if (!auth || auth.kind !== "admin") return res.redirect("/admin/login");
  req.auth = auth;
  next();
}

function requireAdminOrJudge(req, res, next) {
  const auth = getAuth(req);
  if (!auth) return res.redirect("/access");
  if (auth.kind === "admin" || auth.kind === "judge") {
    req.auth = auth;
    return next();
  }
  return res.status(403).send("Forbidden");
}

function requireCoach(req, res, next) {
  const auth = getAuth(req);
  if (!auth || auth.kind !== "coach") return res.redirect("/coach/login");
  req.auth = auth;
  next();
}

function isSecure(req) {
  // Render: usually behind proxy; allow forcing secure cookie by env
  if (process.env.SSM_COOKIE_SECURE === "1") return true;
  // best-effort
  return req.secure || (req.headers["x-forwarded-proto"] === "https");
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

function fmtDate(d) {
  return String(d || "").trim();
}

function fmtTime(t) {
  return String(t || "").trim();
}

function pageShell({ title, bodyHtml, auth, meet }) {
  const who =
    auth?.kind === "admin"
      ? `Admin: ${esc(auth.username)}`
      : auth?.kind === "coach"
        ? `Coach: ${esc(auth.team || "")}`
        : auth?.kind === "judge"
          ? `Judge`
          : "";

  const topNav = `
  <div class="topbar">
    <div class="brand">
      <a href="/" style="color:inherit; text-decoration:none;">SpeedSkateMeet</a>
    </div>
    <div class="nav">
      <a class="pill" href="/meets">Find a Meet</a>
      <a class="pill" href="/rinks">Find a Rink</a>
      <a class="pill" href="/live">Live Race Day</a>
      ${
        auth?.kind === "admin"
          ? `<a class="pill solid" href="/portal">Portal</a><a class="pill" href="/admin/logout">Logout</a>`
          : auth?.kind === "coach"
            ? `<a class="pill solid" href="/coach">Coach</a><a class="pill" href="/coach/logout">Logout</a>`
            : auth?.kind === "judge"
              ? `<a class="pill solid" href="/judge">Judge</a><a class="pill" href="/judge/logout">Logout</a>`
              : `<a class="pill solid" href="/admin/login">Admin Login</a>`
      }
    </div>
  </div>`;

  const meetTabs = meet
    ? `
    <div class="tabs">
      <a class="tab ${title.includes("Meet Builder") ? "active" : ""}" href="/portal/meet/${encodeURIComponent(meet.id)}/builder">Meet Builder</a>
      <a class="tab ${title.includes("Block Builder") ? "active" : ""}" href="/portal/meet/${encodeURIComponent(meet.id)}/blocks">Block Builder</a>
      <a class="tab ${title.includes("Registrations") ? "active" : ""}" href="/portal/meet/${encodeURIComponent(meet.id)}/registrations">Registrations</a>
      <a class="tab ${title.includes("Race Day") ? "active" : ""}" href="/portal/meet/${encodeURIComponent(meet.id)}/raceday">Race Day</a>
      <a class="tab ${title.includes("Staff") ? "active" : ""}" href="/portal/meet/${encodeURIComponent(meet.id)}/staff">Staff</a>
      <div class="tabRight">${who ? `<span class="chip small">${who}</span>` : ""}</div>
    </div>
  `
    : "";

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
        }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color: var(--text); background: radial-gradient(1200px 600px at 30% 0%, #eef3ff, var(--bg)); }
        a { color: var(--blue); text-decoration: none; }
        .wrap { max-width: 1100px; margin: 18px auto 64px; padding: 0 18px; }
        .topbar { max-width: 1100px; margin: 16px auto 0; padding: 0 18px; display:flex; align-items:center; justify-content:space-between; gap: 12px; }
        .brand { font-weight: 900; font-size: 18px; letter-spacing: .2px; }
        .nav { display:flex; gap: 10px; flex-wrap: wrap; align-items:center; justify-content:flex-end; }
        .pill { border: 2px solid #c7d2fe; padding: 10px 14px; border-radius: 999px; background: rgba(255,255,255,.75); font-weight: 800; color: #1e3a8a; }
        .pill:hover { border-color: #93c5fd; }
        .pill.solid { background: var(--blue); border-color: var(--blue); color: white; }
        .pill.solid:hover { background: var(--blue2); border-color: var(--blue2); }
        h1 { margin: 16px 0 10px; font-size: 42px; letter-spacing: -.8px; }
        h2 { margin: 0 0 8px; font-size: 26px; letter-spacing: -.3px; }
        h3 { margin: 0 0 8px; font-size: 18px; letter-spacing: -.2px; }
        .muted { color: var(--muted); }
        .card { background: var(--card); border: 1px solid rgba(148,163,184,.25); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px; }
        .row { display:flex; gap: 14px; flex-wrap: wrap; }
        .spacer { height: 14px; }
        .btn { display:inline-block; border: 0; cursor:pointer; background: var(--blue); color: white; font-weight: 900; padding: 12px 16px; border-radius: 12px; }
        .btn:hover { background: var(--blue2); }
        .btn2 { display:inline-block; border: 2px solid #c7d2fe; background: white; color: #1e3a8a; font-weight: 900; padding: 10px 14px; border-radius: 12px; cursor:pointer; }
        .btn2:hover { border-color:#93c5fd; }
        .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .grid3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        @media (max-width: 900px){ .grid2, .grid3{ grid-template-columns: 1fr; } }
        label { font-weight: 800; font-size: 13px; color: #0f172a; display:block; margin-bottom: 6px; }
        input, select, textarea { width: 100%; padding: 12px 12px; border-radius: 12px; border: 1px solid var(--line); outline: none; font-size: 15px; }
        input:focus, textarea:focus, select:focus { border-color: #93c5fd; box-shadow: 0 0 0 4px rgba(147,197,253,.35); }
        textarea { min-height: 90px; resize: vertical; }
        .kpi { display:flex; gap: 10px; align-items:center; flex-wrap: wrap; }
        .chip { display:inline-flex; align-items:center; gap: 8px; border: 1px solid var(--line); border-radius: 999px; padding: 8px 10px; background: rgba(255,255,255,.8); font-weight: 800; }
        .small { font-size: 12px; }
        .hr { height:1px; background: rgba(148,163,184,.25); margin: 14px 0; }
        .note { font-size: 13px; color: var(--muted); }
        .danger { color: #b91c1c; font-weight: 900; }
        .ok { color: #0f766e; font-weight: 900; }
        .tabs { margin: 12px 0 0; display:flex; gap: 8px; flex-wrap: wrap; align-items:center; }
        .tab { border: 2px solid #c7d2fe; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,.7); font-weight: 900; color: #1e3a8a; }
        .tab:hover { border-color:#93c5fd; }
        .tab.active { background: var(--blue); border-color: var(--blue); color:white; }
        .tabRight { margin-left:auto; display:flex; gap: 8px; align-items:center; }

        /* Block builder layout */
        .bb { display:grid; grid-template-columns: 1.2fr .8fr; gap: 14px; }
        @media (max-width: 1000px){ .bb{ grid-template-columns: 1fr; } }
        .block { border: 1px solid rgba(148,163,184,.25); border-radius: 16px; padding: 14px; background: rgba(255,255,255,.92); }
        .blockHead { display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
        .raceItem { border: 1px solid rgba(148,163,184,.25); background: white; border-radius: 14px; padding: 10px 10px; margin: 8px 0; cursor: grab; display:flex; flex-direction: column; gap: 6px; }
        .raceItem:active { cursor: grabbing; }
        .raceMeta { font-size: 12px; color: var(--muted); }
        .dropZone { min-height: 40px; padding: 6px; border-radius: 14px; border: 2px dashed rgba(148,163,184,.35); background: rgba(248,250,252,.7); }
        .dropZone.over { border-color: #93c5fd; background: rgba(219,234,254,.6); }
        .rightCol { position: sticky; top: 18px; align-self: start; }

        /* Autocomplete */
        .acWrap { position: relative; }
        .acList {
          position: absolute; z-index: 50; left: 0; right: 0; top: calc(100% + 6px);
          background: white; border: 1px solid rgba(148,163,184,.35);
          border-radius: 14px; box-shadow: var(--shadow);
          max-height: 260px; overflow:auto; padding: 6px;
          display:none;
        }
        .acItem { padding: 10px 10px; border-radius: 12px; cursor:pointer; font-weight: 800; }
        .acItem:hover { background: rgba(219,234,254,.7); }
        .acHint { font-size: 12px; color: var(--muted); margin-top: 6px; }

        /* Print */
        @media print {
          body { background: white; }
          .topbar, .tabs, .pill, .btn, .btn2, .note.small { display:none !important; }
          .wrap { max-width: none; margin: 0; padding: 0; }
          .card { box-shadow:none; border:0; }
        }
      </style>
    </head>
    <body>
      ${topNav}
      <div class="wrap">
        ${meetTabs}
        ${bodyHtml}
        <div class="spacer"></div>
        <div class="note small">Data file: ${esc(DATA_FILE)}</div>
      </div>
    </body>
  </html>`;
}

// -------------------------
// Domain: divisions / groups
// -------------------------
function baseGroupsFullUSARS() {
  // “USARS-style” list extended beyond Senior; includes Masters/Classic style buckets.
  // You can tweak labels later, but this covers the full range requested.
  const groups = [
    { id: "tiny_tot_girls", label: "Tiny Tot Girls", ages: "0–5" },
    { id: "tiny_tot_boys", label: "Tiny Tot Boys", ages: "0–5" },

    { id: "mini_girls", label: "Mini Girls", ages: "6–7" },
    { id: "mini_boys", label: "Mini Boys", ages: "6–7" },

    { id: "primary_girls", label: "Primary Girls", ages: "8–9" },
    { id: "primary_boys", label: "Primary Boys", ages: "8–9" },

    { id: "juvenile_girls", label: "Juvenile Girls", ages: "10–11" },
    { id: "juvenile_boys", label: "Juvenile Boys", ages: "10–11" },

    { id: "elementary_girls", label: "Elementary Girls", ages: "12–13" },
    { id: "elementary_boys", label: "Elementary Boys", ages: "12–13" },

    { id: "freshman_girls", label: "Freshman Girls", ages: "14–15" },
    { id: "freshman_boys", label: "Freshman Boys", ages: "14–15" },

    { id: "sophomore_girls", label: "Sophomore Girls", ages: "16–17" },
    { id: "sophomore_boys", label: "Sophomore Boys", ages: "16–17" },

    { id: "junior_women", label: "Junior Women", ages: "18–19" },
    { id: "junior_men", label: "Junior Men", ages: "18–19" },

    { id: "senior_women", label: "Senior Women", ages: "20–29" },
    { id: "senior_men", label: "Senior Men", ages: "20–29" },

    { id: "masters_30_women", label: "Masters Women 30–39", ages: "30–39" },
    { id: "masters_30_men", label: "Masters Men 30–39", ages: "30–39" },

    { id: "masters_40_women", label: "Masters Women 40–49", ages: "40–49" },
    { id: "masters_40_men", label: "Masters Men 40–49", ages: "40–49" },

    { id: "masters_50_women", label: "Masters Women 50–59", ages: "50–59" },
    { id: "masters_50_men", label: "Masters Men 50–59", ages: "50–59" },

    { id: "masters_60_women", label: "Masters Women 60+", ages: "60+" },
    { id: "masters_60_men", label: "Masters Men 60+", ages: "60+" },

    // Classic / Special
    { id: "classic_women", label: "Classic Women", ages: "Classic" },
    { id: "classic_men", label: "Classic Men", ages: "Classic" },
  ];

  return groups.map(g => ({
    ...g,
    divisions: {
      novice: { enabled: false, cost: 0, distances: ["", "", "", ""] },
      elite: { enabled: false, cost: 0, distances: ["", "", "", ""] },
      open: { enabled: false, cost: 0, distances: ["", "", "", ""] },
    },
  }));
}

function createMeet(ownerUsername) {
  return {
    id: null,
    owner: ownerUsername || "Lbird22",
    directors: [], // invited additional directors usernames
    meetName: "New Meet",
    date: "",
    startTime: "",
    registrationClose: "", // datetime-local string
    trackLength: 100,
    lanes: 4,
    timeTrialsEnabled: false,
    timeTrialsNotes: "",
    judgesPanelRequired: true,
    relayEnabled: false,
    relayNotes: "",
    notes: "",
    groups: baseGroupsFullUSARS(),
    races: [],
    blocks: [],
    registrations: [], // {id, meetNo, name, age, team, opts:{...}, createdAt}
    raceDay: {
      currentRaceId: "",
      statusByRaceId: {}, // raceId -> { locked:boolean, mode:"time"|"place", results:[...] }
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeDistances(arr4) {
  const out = [0, 1, 2, 3].map(i => String(arr4?.[i] ?? "").trim());
  return out;
}

function generateRacesForMeet(meet) {
  const races = [];
  let n = 1;

  for (const g of meet.groups || []) {
    for (const divKey of ["novice", "elite", "open"]) {
      const div = g.divisions?.[divKey];
      if (!div || !div.enabled) continue;
      const dists = normalizeDistances(div.distances);
      for (let i = 0; i < 4; i++) {
        const dist = dists[i];
        if (!dist) continue;

        const id = "r" + crypto.randomBytes(6).toString("hex");
        races.push({
          id,
          orderHint: n++,
          groupId: g.id,
          groupLabel: g.label,
          ages: g.ages,
          division: divKey,
          distanceLabel: dist,
          dayIndex: i + 1, // D1..D4
          // Simple inference for judge mode later:
          // If distanceLabel includes "TT" or "Time Trial" => time entry, else place entry by default.
          defaultMode: /(^|\b)(tt|time\s*trial)(\b|$)/i.test(dist) ? "time" : "place",
        });
      }
    }
  }

  const raceIds = new Set(races.map(r => r.id));
  for (const b of meet.blocks || []) {
    b.raceIds = (b.raceIds || []).filter(id => raceIds.has(id));
  }

  // Keep currentRaceId valid
  if (meet.raceDay?.currentRaceId && !raceIds.has(meet.raceDay.currentRaceId)) {
    meet.raceDay.currentRaceId = "";
  }

  meet.races = races;
  meet.updatedAt = nowIso();
  return meet;
}

function ensureAtLeastOneBlock(meet) {
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (meet.blocks.length === 0) {
    meet.blocks.push({ id: "b1", name: "Block 1", day: 1, label: "", raceIds: [] });
  }
}

function isMeetEditableBy(auth, meet) {
  if (!auth) return false;
  if (auth.kind === "admin") {
    if (auth.role === "superadmin") return true;
    // directors: can edit if owner or invited
    return meet.owner === auth.username || (meet.directors || []).includes(auth.username);
  }
  return false;
}

// -------------------------
// Teams list (alphabetical; Independent first)
// -------------------------
const TEAM_LIST = [
  "Independent",
  "Ashland Speedskating of Virginia",
  "Astro Speed",
  "Aurora Speed Club",
  "Badger State Racing",
  "Bell’s Speed Skating Team",
  "Carolina Gold Rush",
  "Capital City Racing",
  "CCN Inline",
  "CC Speed",
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
  "Rocket City Speed",
  "Rollaire Speed Team",
  "Roller King Speed",
  "Simmons Racing / Simmons Rana",
  "SobeRollers",
  "SOS Racing",
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
].slice().sort((a, b) => (a === "Independent" ? -1 : b === "Independent" ? 1 : a.localeCompare(b)));

// -------------------------
// Routes: public
// -------------------------
app.get("/", (req, res) => {
  const auth = getAuth(req);
  const body = `
    <div class="card">
      <h1 style="margin:0 0 6px;">SpeedSkateMeet</h1>
      <div class="muted" style="font-weight:800; font-size:16px;">Built for real rink race days</div>
      <div class="spacer"></div>
      <div class="muted">Meet Builder → generate races → Block Builder drag/drop → Race Day.</div>
      <div class="spacer"></div>
      <div class="row">
        <a class="btn" href="/meets">Find a Meet</a>
        <a class="btn2" href="/rinks">Find a Rink</a>
        <a class="btn2" href="/live">Live Race Day</a>
        ${auth?.kind === "admin" ? `<a class="btn2" href="/portal">Director Portal</a>` : `<a class="btn2" href="/admin/login">Director Login</a>`}
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Home", bodyHtml: body, auth, meet: null }));
});

app.get("/meets", (req, res) => {
  const auth = getAuth(req);
  const db = loadDb();
  const cards = db.meets.map(m => `
    <div class="card">
      <div class="row" style="align-items:center; justify-content:space-between;">
        <div>
          <h2 style="margin:0;">${esc(m.meetName || "Meet")}</h2>
          <div class="muted small">${esc(m.date || "")} ${m.startTime ? `• ${esc(m.startTime)}` : ""}</div>
        </div>
        <div class="kpi">
          <span class="chip">Meet ID: ${esc(m.id)}</span>
          <span class="chip">Races: ${esc((m.races || []).length)}</span>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="row">
        <a class="btn2" href="/meet/${encodeURIComponent(m.id)}/register">Register</a>
        <a class="btn2" href="/meet/${encodeURIComponent(m.id)}/program" target="_blank">Print Program</a>
      </div>
    </div>
  `).join("<div class='spacer'></div>");

  res.send(pageShell({
    title: "Find a Meet",
    auth,
    meet: null,
    bodyHtml: `<h1>Meets</h1>${cards || `<div class="card"><div class="muted">No meets yet.</div></div>`}`,
  }));
});

app.get("/rinks", (req, res) => {
  const auth = getAuth(req);
  const db = loadDb();
  const cards = db.rinks.map(r => `
    <div class="card">
      <h2>${esc(r.name)}</h2>
      <div><b>Phone:</b> ${esc(r.phone || "")}</div>
      <div><b>Address:</b> ${esc(r.address || "")}</div>
      <div><b>City/State:</b> ${esc(r.city || "")}, ${esc(r.state || "")}</div>
      ${r.website ? `<div><b>Website:</b> <a href="https://${esc(r.website)}" target="_blank" rel="noreferrer">${esc(r.website)}</a></div>` : ""}
      ${
        auth?.kind === "admin"
          ? `<div class="spacer"></div><a class="btn2" href="/portal/rinks">Edit/Add Rinks</a>`
          : ""
      }
    </div>
  `).join("<div class='spacer'></div>");

  res.send(pageShell({
    title: "Rinks",
    auth,
    meet: null,
    bodyHtml: `<h1>Rinks</h1>${cards || `<div class="card"><div class="muted">No rinks yet.</div></div>`}`,
  }));
});

app.get("/live", (req, res) => {
  const auth = getAuth(req);
  const body = `
    <h1>Live Race Day</h1>
    <div class="card">
      <div class="muted">Public live board placeholder. Once Race Day is running, this will show “Now Racing / On Deck / Results”.</div>
    </div>
  `;
  res.send(pageShell({ title: "Live", bodyHtml: body, auth, meet: null }));
});

// -------------------------
// Admin login/logout
// -------------------------
app.get("/admin/login", (req, res) => {
  const auth = getAuth(req);
  if (auth?.kind === "admin") return res.redirect("/portal");

  const body = `
    <h1>Admin Login</h1>
    <div class="card">
      <form method="POST" action="/admin/login">
        <div class="grid2">
          <div>
            <label>Username</label>
            <input name="username" autocomplete="username" required/>
          </div>
          <div>
            <label>Password</label>
            <input name="password" type="password" autocomplete="current-password" required/>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Login</button>
        <div class="spacer"></div>
        <div class="note">Director login restored. (No terminal needed.)</div>
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Admin Login", bodyHtml: body, auth: null, meet: null }));
});

app.post("/admin/login", (req, res) => {
  const db = loadDb();
  const u = String(req.body.username || "").trim();
  const p = String(req.body.password || "").trim();
  const user = db.users.find(x => x.username === u && x.password === p);
  if (!user) {
    return res.send(pageShell({
      title: "Login",
      auth: null,
      meet: null,
      bodyHtml: `<h1>Admin Login</h1><div class="card"><div class="danger">Invalid login.</div><div class="spacer"></div><a class="btn2" href="/admin/login">Try again</a></div>`,
    }));
  }

  const secret = db.meta.cookieSecret;
  const payload = { t: Date.now(), kind: "admin", username: user.username, role: user.role || "director" };
  const tok = signToken(secret, payload);
  setCookie(res, SESS_COOKIE, tok, { maxAgeSec: 30 * 24 * 60 * 60, secure: isSecure(req) });
  res.redirect("/portal");
});

app.get("/admin/logout", (req, res) => {
  clearCookie(res, SESS_COOKIE);
  res.redirect("/");
});

// -------------------------
// Portal: director dashboard
// -------------------------
app.get("/portal", requireAdmin, (req, res) => {
  const db = loadDb();

  // Only show meets you can edit unless you're superadmin
  const visibleMeets =
    req.auth.role === "superadmin"
      ? db.meets
      : db.meets.filter(m => m.owner === req.auth.username || (m.directors || []).includes(req.auth.username));

  const meetCards = visibleMeets.map(m => `
    <div class="card">
      <div class="row" style="align-items:center; justify-content:space-between;">
        <div>
          <h2 style="margin:0;">${esc(m.meetName || "Meet")}</h2>
          <div class="muted small">Meet ID: ${esc(m.id)} • Owner: ${esc(m.owner || "")}</div>
          <div class="muted small">${esc(m.date || "")} ${m.startTime ? `• ${esc(m.startTime)}` : ""}</div>
        </div>
        <div class="kpi">
          <span class="chip">Races: ${esc((m.races || []).length)}</span>
          <span class="chip">Blocks: ${esc((m.blocks || []).length)}</span>
          <span class="chip">Regs: ${esc((m.registrations || []).length)}</span>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="row">
        <a class="btn" href="/portal/meet/${encodeURIComponent(m.id)}/builder">Meet Builder</a>
        <a class="btn2" href="/portal/meet/${encodeURIComponent(m.id)}/blocks">Block Builder</a>
        <a class="btn2" href="/portal/meet/${encodeURIComponent(m.id)}/registrations">Registrations</a>
        <a class="btn2" href="/portal/meet/${encodeURIComponent(m.id)}/raceday">Race Day</a>
        <a class="btn2" href="/portal/meet/${encodeURIComponent(m.id)}/staff">Staff</a>
      </div>
    </div>
  `).join("<div class='spacer'></div>");

  const body = `
    <h1>Director Portal</h1>
    <div class="muted">Nothing appears until you build a meet.</div>
    <div class="spacer"></div>

    <div class="card">
      <form method="POST" action="/portal/create-meet">
        <button class="btn" type="submit">Build New Meet</button>
        <a class="btn2" style="margin-left:8px;" href="/portal/rinks">Rinks Admin</a>
      </form>
      <div class="spacer"></div>
      <div class="note">Meets are owned by the director who creates them. Other directors can’t edit unless invited (Staff tab).</div>
    </div>

    <div class="spacer"></div>
    ${meetCards || `<div class="card"><div class="muted">No meets yet. Click “Build New Meet”.</div></div>`}
  `;
  res.send(pageShell({ title: "Portal", bodyHtml: body, auth: req.auth, meet: null }));
});

app.post("/portal/create-meet", requireAdmin, (req, res) => {
  const db = loadDb();
  const m = createMeet(req.auth.username);
  m.id = nextNumericId(db.meets);
  m.races = [];
  m.blocks = [];
  m.registrations = [];
  db.meets.push(m);
  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(m.id)}/builder`);
});

// -------------------------
// Rinks admin
// -------------------------
app.get("/portal/rinks", requireAdmin, (req, res) => {
  const db = loadDb();
  const rows = db.rinks.map(r => `
    <tr>
      <td style="font-weight:900;">${esc(r.name)}</td>
      <td>${esc(r.city)}, ${esc(r.state)}</td>
      <td>${esc(r.phone || "")}</td>
      <td>
        <a class="btn2 small" href="/portal/rinks/${encodeURIComponent(r.id)}">Edit</a>
      </td>
    </tr>
  `).join("");

  const body = `
    <h1>Rinks Admin</h1>
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="muted">Add/Edit rink listings. Default is Roller City only.</div>
        <div class="row">
          <a class="btn2" href="/portal">Back to Portal</a>
          <a class="btn" href="/portal/rinks/new">Add Rink</a>
        </div>
      </div>
      <div class="hr"></div>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="text-align:left; color:#334155; font-weight:900;">
            <th style="padding:10px 6px;">Rink</th>
            <th style="padding:10px 6px;">City</th>
            <th style="padding:10px 6px;">Phone</th>
            <th style="padding:10px 6px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4" class="muted" style="padding:12px 6px;">No rinks.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  res.send(pageShell({ title: "Rinks Admin", bodyHtml: body, auth: req.auth, meet: null }));
});

function rinkForm(r = {}) {
  return `
    <div class="grid2">
      <div><label>Name</label><input name="name" value="${esc(r.name || "")}" required/></div>
      <div><label>Website</label><input name="website" value="${esc(r.website || "")}" placeholder="rollercitywichitaks.com"/></div>
      <div><label>City</label><input name="city" value="${esc(r.city || "")}"/></div>
      <div><label>State</label><input name="state" value="${esc(r.state || "")}"/></div>
      <div><label>Phone</label><input name="phone" value="${esc(r.phone || "")}"/></div>
      <div><label>Team</label><input name="team" value="${esc(r.team || "")}"/></div>
    </div>
    <div class="spacer"></div>
    <label>Address</label>
    <input name="address" value="${esc(r.address || "")}"/>
    <div class="spacer"></div>
    <label>Notes</label>
    <textarea name="notes">${esc(r.notes || "")}</textarea>
  `;
}

app.get("/portal/rinks/new", requireAdmin, (req, res) => {
  const body = `
    <h1>Add Rink</h1>
    <div class="card">
      <form method="POST" action="/portal/rinks/new">
        ${rinkForm({})}
        <div class="spacer"></div>
        <button class="btn" type="submit">Save Rink</button>
        <a class="btn2" style="margin-left:8px;" href="/portal/rinks">Cancel</a>
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Add Rink", bodyHtml: body, auth: req.auth, meet: null }));
});

app.post("/portal/rinks/new", requireAdmin, (req, res) => {
  const db = loadDb();
  const r = {
    id: nextNumericId(db.rinks),
    name: String(req.body.name || "").trim(),
    website: String(req.body.website || "").trim(),
    city: String(req.body.city || "").trim(),
    state: String(req.body.state || "").trim(),
    phone: String(req.body.phone || "").trim(),
    team: String(req.body.team || "").trim(),
    address: String(req.body.address || "").trim(),
    notes: String(req.body.notes || "").trim(),
  };
  db.rinks.push(r);
  // cleanup again (keeps Roller City, removes fake)
  normalizeDb(db);
  saveDb(db);
  res.redirect("/portal/rinks");
});

app.get("/portal/rinks/:rinkId", requireAdmin, (req, res) => {
  const db = loadDb();
  const id = Number(req.params.rinkId);
  const r = db.rinks.find(x => Number(x.id) === id);
  if (!r) return res.redirect("/portal/rinks");

  const body = `
    <h1>Edit Rink</h1>
    <div class="card">
      <form method="POST" action="/portal/rinks/${encodeURIComponent(r.id)}">
        ${rinkForm(r)}
        <div class="spacer"></div>
        <button class="btn" type="submit">Save</button>
        <a class="btn2" style="margin-left:8px;" href="/portal/rinks">Back</a>
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Edit Rink", bodyHtml: body, auth: req.auth, meet: null }));
});

app.post("/portal/rinks/:rinkId", requireAdmin, (req, res) => {
  const db = loadDb();
  const id = Number(req.params.rinkId);
  const r = db.rinks.find(x => Number(x.id) === id);
  if (!r) return res.redirect("/portal/rinks");

  Object.assign(r, {
    name: String(req.body.name || "").trim(),
    website: String(req.body.website || "").trim(),
    city: String(req.body.city || "").trim(),
    state: String(req.body.state || "").trim(),
    phone: String(req.body.phone || "").trim(),
    team: String(req.body.team || "").trim(),
    address: String(req.body.address || "").trim(),
    notes: String(req.body.notes || "").trim(),
  });

  normalizeDb(db);
  saveDb(db);
  res.redirect("/portal/rinks");
});

// -------------------------
// Helpers: fetch meet + permission checks
// -------------------------
function getMeetOrRedirect(db, meetIdNum, res) {
  const meet = db.meets.find(m => Number(m.id) === meetIdNum);
  if (!meet) {
    res.redirect("/portal");
    return null;
  }
  return meet;
}

// -------------------------
// Meet Builder
// -------------------------
app.get("/portal/meet/:meetId/builder", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = getMeetOrRedirect(db, meetId, res);
  if (!meet) return;

  if (!isMeetEditableBy(req.auth, meet)) {
    return res.send(pageShell({
      title: "Meet Builder",
      auth: req.auth,
      meet,
      bodyHtml: `<h1>Meet Builder</h1><div class="card"><div class="danger">You don’t have edit access to this meet.</div></div>`,
    }));
  }

  const groupCards = (meet.groups || []).map((g, gi) => {
    const divRows = ["novice", "elite", "open"].map(divKey => {
      const div = g.divisions?.[divKey] || { enabled: false, cost: 0, distances: ["", "", "", ""] };
      return `
        <div class="card" style="border-radius:16px; box-shadow:none; border:1px solid rgba(148,163,184,.25);">
          <div class="row" style="align-items:center; justify-content:space-between;">
            <div class="kpi">
              <label style="margin:0;">
                <input type="checkbox" name="g_${gi}_${divKey}_enabled" ${div.enabled ? "checked" : ""} style="width:auto; margin-right:10px; transform:scale(1.1);"/>
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
          <div class="note small">Plain inputs (no dropdowns).</div>
        </div>
      `;
    }).join("<div class='spacer'></div>");

    return `
      <div class="card">
        <div class="row" style="align-items:center; justify-content:space-between;">
          <div>
            <h2 style="margin:0;">${esc(g.label)}</h2>
            <div class="muted">${esc(g.ages)}</div>
          </div>
        </div>
        <div class="hr"></div>
        ${divRows}
      </div>
    `;
  }).join("<div class='spacer'></div>");

  const topButtons = `
    <div class="row">
      <button class="btn" type="submit">Save Meet & Generate Race List</button>
      <a class="btn2" href="/portal">Back to Portal</a>
      <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/blocks">Go to Block Builder</a>
    </div>
    <div class="spacer"></div>
    <div class="note">Saving generates the “Unassigned Races” list used in Block Builder.</div>
  `;

  const bottomButtons = `
    <div class="card">
      <div class="row">
        <button class="btn" type="submit">Save Meet & Generate Race List</button>
        <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/blocks">Go to Block Builder</a>
        <a class="btn2" href="/portal">Portal</a>
      </div>
      <div class="spacer"></div>
      <div class="note">Tip: Date picker is enabled; Start Time + Registration Close are in Meet Info.</div>
    </div>
  `;

  const body = `
    <h1>Meet Builder</h1>

    <div class="card">
      <form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/builder/save">
        ${topButtons}
        <div class="hr"></div>

        <h3>Meet Info</h3>
        <div class="grid2">
          <div>
            <label>Meet Name</label>
            <input name="meetName" value="${esc(meet.meetName)}"/>
          </div>
          <div>
            <label>Date</label>
            <input type="date" name="date" value="${esc(meet.date)}"/>
          </div>
          <div>
            <label>Start Time</label>
            <input type="time" name="startTime" value="${esc(meet.startTime || "")}"/>
          </div>
          <div>
            <label>Registration Close</label>
            <input type="datetime-local" name="registrationClose" value="${esc(meet.registrationClose || "")}"/>
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
        <div class="row" style="justify-content:space-between; align-items:center;">
          <label style="margin:0;">
            <input type="checkbox" name="judgesPanelRequired" ${meet.judgesPanelRequired ? "checked" : ""} style="width:auto; margin-right:10px; transform:scale(1.1);"/>
            Judges panel required
          </label>
        </div>

        <div class="spacer"></div>
        <label>Meet Notes</label>
        <textarea name="notes">${esc(meet.notes || "")}</textarea>

        <div class="hr"></div>

        <h3>Time Trials</h3>
        <label style="margin:0;">
          <input type="checkbox" name="timeTrialsEnabled" ${meet.timeTrialsEnabled ? "checked" : ""} style="width:auto; margin-right:10px; transform:scale(1.1);"/>
          Enable Time Trials (meet-wide)
        </label>
        <div class="spacer"></div>
        <label>Time Trials Notes</label>
        <textarea name="timeTrialsNotes">${esc(meet.timeTrialsNotes || "")}</textarea>

        <div class="hr"></div>

        <h3>Relays</h3>
        <label style="margin:0;">
          <input type="checkbox" name="relayEnabled" ${meet.relayEnabled ? "checked" : ""} style="width:auto; margin-right:10px; transform:scale(1.1);"/>
          Enable Relays
        </label>
        <div class="spacer"></div>
        <label>Relay Notes</label>
        <textarea name="relayNotes">${esc(meet.relayNotes || "")}</textarea>

        <div class="spacer"></div>

        ${groupCards}

        <div class="spacer"></div>
        ${bottomButtons}
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Meet Builder", bodyHtml: body, auth: req.auth, meet }));
});

app.post("/portal/meet/:meetId/builder/save", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = getMeetOrRedirect(db, meetId, res);
  if (!meet) return;

  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  meet.meetName = String(req.body.meetName || "New Meet");
  meet.date = String(req.body.date || "");
  meet.startTime = String(req.body.startTime || "");
  meet.registrationClose = String(req.body.registrationClose || "");
  meet.trackLength = Number(req.body.trackLength || 100);
  meet.lanes = Number(req.body.lanes || 4);

  meet.timeTrialsEnabled = !!req.body.timeTrialsEnabled;
  meet.timeTrialsNotes = String(req.body.timeTrialsNotes || "");
  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;
  meet.relayEnabled = !!req.body.relayEnabled;
  meet.notes = String(req.body.notes || "");
  meet.relayNotes = String(req.body.relayNotes || "");

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
      g.divisions[divKey].distances = [d1, d2, d3, d4].map(x => String(x ?? "").trim());
    }
  });

  generateRacesForMeet(meet);
  ensureAtLeastOneBlock(meet);

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/blocks`);
});

// -------------------------
// Registration (public)
// -------------------------
app.get("/meet/:meetId/register", (req, res) => {
  const auth = getAuth(req);
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/meets");

  const closed = meet.registrationClose ? (new Date(meet.registrationClose).getTime() < Date.now()) : false;

  const body = `
    <h1>Register</h1>
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h2 style="margin:0;">${esc(meet.meetName)}</h2>
          <div class="muted small">${esc(meet.date || "")}</div>
          ${meet.registrationClose ? `<div class="note">Registration closes: <b>${esc(meet.registrationClose)}</b></div>` : ""}
        </div>
        <div class="chip">Meet ID: ${esc(meet.id)}</div>
      </div>
      <div class="hr"></div>

      ${
        closed
          ? `<div class="danger">Registration is closed.</div>`
          : `
      <form method="POST" action="/meet/${encodeURIComponent(meet.id)}/register">
        <div class="grid2">
          <div>
            <label>Skater Name</label>
            <input name="name" placeholder="First + Last" required/>
          </div>
          <div>
            <label>Age</label>
            <input name="age" placeholder="Age" required/>
          </div>
        </div>

        <div class="spacer"></div>

        <label>Team</label>
        <div class="acWrap">
          <input id="teamInput" name="team" placeholder="Start typing… (ex: Independent, National Speed Skating Circuit)" autocomplete="off" required/>
          <div id="teamList" class="acList"></div>
        </div>
        <div class="acHint">Click the box to open the list, or type to filter.</div>

        <div class="hr"></div>

        <label>Options</label>
        <div class="row">
          ${["Challenge Up","Novice","Elite","Open","Time Trials","Relays"].map((x,i)=>`
            <label class="chip" style="cursor:pointer;">
              <input type="checkbox" name="opt_${i}" style="width:auto; margin-right:8px; transform:scale(1.1);"/>
              ${esc(x)}
            </label>
          `).join("")}
        </div>

        <div class="spacer"></div>
        <button class="btn" type="submit">Submit Registration</button>
        <div class="spacer"></div>
        <div class="note">A meet number is assigned automatically at submit (check-in + skater number).</div>
      </form>
      `
      }

    </div>

    <div class="spacer"></div>
    <div class="card">
      <a class="btn2" href="/meets">Back to Meets</a>
    </div>

    <script>
      const teams = ${JSON.stringify(TEAM_LIST)};
      const input = document.getElementById("teamInput");
      const list = document.getElementById("teamList");

      function render(filter){
        const q = (filter||"").toLowerCase().trim();
        const items = teams.filter(t => !q || t.toLowerCase().includes(q)).slice(0, 80);
        list.innerHTML = items.map(t => '<div class="acItem" data-v="'+t.replaceAll('"','&quot;')+'">'+t+'</div>').join("") || '<div class="note" style="padding:10px;">No matches.</div>';
        list.style.display = "block";
        list.querySelectorAll(".acItem").forEach(el=>{
          el.addEventListener("click", ()=>{
            input.value = el.getAttribute("data-v");
            list.style.display = "none";
          });
        });
      }

      input.addEventListener("focus", ()=> render(input.value));
      input.addEventListener("input", ()=> render(input.value));

      document.addEventListener("click", (e)=>{
        if (!e.target.closest(".acWrap")) list.style.display = "none";
      });
    </script>
  `;

  res.send(pageShell({ title: "Register", bodyHtml: body, auth, meet: null }));
});

app.post("/meet/:meetId/register", (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/meets");

  const closed = meet.registrationClose ? (new Date(meet.registrationClose).getTime() < Date.now()) : false;
  if (closed) return res.redirect(`/meet/${encodeURIComponent(meet.id)}/register`);

  const name = String(req.body.name || "").trim();
  const age = Number(String(req.body.age || "").trim() || 0);
  const team = String(req.body.team || "").trim() || "Independent";

  const opts = {
    challengeUp: !!req.body.opt_0,
    novice: !!req.body.opt_1,
    elite: !!req.body.opt_2,
    open: !!req.body.opt_3,
    timeTrials: !!req.body.opt_4,
    relays: !!req.body.opt_5,
  };

  if (!Array.isArray(meet.registrations)) meet.registrations = [];
  const nextNo = meet.registrations.reduce((m, r) => Math.max(m, Number(r.meetNo) || 0), 0) + 1;

  meet.registrations.push({
    id: nextShortId("reg_"),
    meetNo: nextNo,
    name,
    age,
    team,
    opts,
    createdAt: nowIso(),
  });

  meet.updatedAt = nowIso();
  saveDb(db);

  res.redirect(`/meet/${encodeURIComponent(meet.id)}/register`);
});

// -------------------------
// Block Builder
// -------------------------
app.get("/portal/meet/:meetId/blocks", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = getMeetOrRedirect(db, meetId, res);
  if (!meet) return;

  if (!isMeetEditableBy(req.auth, meet)) {
    return res.send(pageShell({
      title: "Block Builder",
      auth: req.auth,
      meet,
      bodyHtml: `<h1>Block Builder</h1><div class="card"><div class="danger">You don’t have edit access to this meet.</div></div>`,
    }));
  }

  ensureAtLeastOneBlock(meet);

  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const assigned = new Set();
  for (const b of meet.blocks || []) {
    for (const rid of (b.raceIds || [])) assigned.add(rid);
  }
  const unassigned = (meet.races || []).filter(r => !assigned.has(r.id));

  const blocksHtml = (meet.blocks || []).map(b => {
    const items = (b.raceIds || []).map(rid => {
      const r = raceById.get(rid);
      if (!r) return "";
      return `
        <div class="raceItem" draggable="true" data-race-id="${esc(r.id)}">
          <div style="font-weight:900;">${esc(r.groupLabel)} • ${esc(String(r.division).toUpperCase())}</div>
          <div class="raceMeta">${esc(r.distanceLabel)} • D${esc(r.dayIndex)} • ${esc(r.ages)}</div>
        </div>
      `;
    }).join("");

    const day = Number(b.day || 1);

    return `
      <div class="block" data-block-id="${esc(b.id)}">
        <div class="blockHead">
          <div style="font-weight:900; font-size:18px;">${esc(b.name)}</div>

          <div class="row" style="align-items:center;">
            <div style="width:130px;">
              <label style="margin:0 0 4px;">Day</label>
              <select onchange="setBlockMeta('${esc(b.id)}', {day: this.value})">
                ${[1,2,3,4].map(n=>`<option value="${n}" ${n===day?"selected":""}>Day ${n}</option>`).join("")}
              </select>
            </div>

            <div style="width:220px;">
              <label style="margin:0 0 4px;">Label (optional)</label>
              <input value="${esc(b.label || "")}" placeholder="ex: 200m races" onblur="setBlockMeta('${esc(b.id)}', {label: this.value})"/>
            </div>

            <button class="btn2 small" type="button" onclick="renameBlock('${esc(b.id)}')">Rename</button>
          </div>
        </div>
        <div class="dropZone" data-drop-block="${esc(b.id)}">
          ${items || `<div class="note">Drop races here…</div>`}
        </div>
      </div>
    `;
  }).join("<div class='spacer'></div>");

  const unassignedHtml = unassigned.map(r => `
    <div class="raceItem" draggable="true" data-race-id="${esc(r.id)}">
      <div style="font-weight:900;">${esc(r.groupLabel)} • ${esc(String(r.division).toUpperCase())}</div>
      <div class="raceMeta">${esc(r.distanceLabel)} • D${esc(r.dayIndex)} • ${esc(r.ages)}</div>
    </div>
  `).join("");

  const body = `
    <h1>Block Builder</h1>
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h2 style="margin:0;">${esc(meet.meetName)}</h2>
          <div class="muted small">Drag races from the right into blocks. Reorder inside a block. Move between blocks.</div>
        </div>
        <div class="row">
          <button class="btn2" type="button" onclick="addBlock()">Add Block</button>
          <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/builder">Back to Meet Builder</a>
          <a class="btn2" href="/portal">Portal</a>
          <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/print/program" target="_blank">Print Program</a>
        </div>
      </div>
      <div class="hr"></div>
      <div class="kpi">
        <span class="chip">Races: ${esc((meet.races || []).length)}</span>
        <span class="chip">Unassigned: ${esc(unassigned.length)}</span>
        <span class="chip">Blocks: ${esc((meet.blocks || []).length)}</span>
      </div>
      <div class="note small">If Unassigned is empty, go back to Meet Builder and click “Save Meet & Generate Race List”.</div>
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
        if (!res.ok) return alert("Move failed");
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

      async function setBlockMeta(blockId, patch){
        const res = await fetch("/api/meet/" + meetId + "/blocks/meta", {
          method:"POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ blockId, patch })
        });
        if (!res.ok) return alert("Update failed");
      }

      attachDnD();
    </script>
  `;

  meet.updatedAt = nowIso();
  saveDb(db); // persist block meta if it was missing
  res.send(pageShell({ title: "Block Builder", bodyHtml: body, auth: req.auth, meet }));
});

// Block APIs
app.post("/api/meet/:meetId/blocks/add", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("forbidden");

  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  const n = meet.blocks.length + 1;
  meet.blocks.push({ id: "b" + n, name: "Block " + n, day: 1, label: "", raceIds: [] });
  meet.updatedAt = nowIso();
  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/meet/:meetId/blocks/rename", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("forbidden");

  const blockId = String(req.body.blockId || "");
  const name = String(req.body.name || "").trim();
  const b = (meet.blocks || []).find(x => x.id === blockId);
  if (!b) return res.status(404).send("block not found");
  if (!name) return res.status(400).send("name required");

  b.name = name;
  meet.updatedAt = nowIso();
  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/meet/:meetId/blocks/meta", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("forbidden");

  const blockId = String(req.body.blockId || "");
  const patch = req.body.patch || {};
  const b = (meet.blocks || []).find(x => x.id === blockId);
  if (!b) return res.status(404).send("block not found");

  if (patch.day != null) b.day = Math.max(1, Math.min(4, Number(patch.day) || 1));
  if (patch.label != null) b.label = String(patch.label || "").slice(0, 40);
  meet.updatedAt = nowIso();
  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/meet/:meetId/blocks/move-race", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("forbidden");

  const raceId = String(req.body.raceId || "");
  const destBlockId = String(req.body.destBlockId || "");
  const insertIndex = Number.isFinite(req.body.insertIndex) ? Number(req.body.insertIndex) : 999999;

  for (const b of meet.blocks || []) {
    b.raceIds = (b.raceIds || []).filter(id => id !== raceId);
  }

  if (destBlockId !== "__unassigned__") {
    const dest = (meet.blocks || []).find(b => b.id === destBlockId);
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
// Registrations (director view)
// -------------------------
app.get("/portal/meet/:meetId/registrations", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = getMeetOrRedirect(db, meetId, res);
  if (!meet) return;

  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  const rows = (meet.registrations || []).slice().sort((a,b)=> (a.meetNo||0)-(b.meetNo||0)).map(r => `
    <tr>
      <td style="padding:10px 6px; font-weight:900;">${esc(r.meetNo)}</td>
      <td style="padding:10px 6px;">${esc(r.name)}</td>
      <td style="padding:10px 6px;">${esc(r.age)}</td>
      <td style="padding:10px 6px;">${esc(r.team)}</td>
      <td style="padding:10px 6px;" class="muted small">
        ${r.opts?.challengeUp ? "Challenge Up • " : ""}
        ${r.opts?.novice ? "Novice • " : ""}
        ${r.opts?.elite ? "Elite • " : ""}
        ${r.opts?.open ? "Open • " : ""}
        ${r.opts?.timeTrials ? "Time Trials • " : ""}
        ${r.opts?.relays ? "Relays" : ""}
      </td>
    </tr>
  `).join("");

  const body = `
    <h1>Registrations</h1>
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h2 style="margin:0;">${esc(meet.meetName)}</h2>
          <div class="muted small">Total skaters: ${esc((meet.registrations || []).length)}</div>
        </div>
        <div class="row">
          <a class="btn2" href="/meet/${encodeURIComponent(meet.id)}/register" target="_blank">Open Public Registration</a>
          <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/print/checkin" target="_blank">Print Check-in List</a>
        </div>
      </div>
      <div class="hr"></div>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="text-align:left; color:#334155; font-weight:900;">
            <th style="padding:10px 6px;">#</th>
            <th style="padding:10px 6px;">Skater</th>
            <th style="padding:10px 6px;">Age</th>
            <th style="padding:10px 6px;">Team</th>
            <th style="padding:10px 6px;">Options</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5" class="muted" style="padding:12px 6px;">No registrations yet.</td></tr>`}
        </tbody>
      </table>
      <div class="spacer"></div>
      <div class="note">Next step: Race Day will show “Now Racing / On Deck” as races are run. (Heats builder comes next.)</div>
    </div>
  `;
  res.send(pageShell({ title: "Registrations", bodyHtml: body, auth: req.auth, meet }));
});

// -------------------------
// Print Center (program / check-in)
// -------------------------
function flattenProgram(meet) {
  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const blocks = (meet.blocks || []).slice().sort((a,b)=> (a.day||1)-(b.day||1) || String(a.id).localeCompare(String(b.id)));
  const out = [];
  for (const b of blocks) {
    const list = (b.raceIds || []).map(id => raceById.get(id)).filter(Boolean);
    out.push({ block: b, races: list });
  }
  return out;
}

app.get("/meet/:meetId/program", (req, res) => {
  const auth = getAuth(req);
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/meets");

  const program = flattenProgram(meet);
  const body = `
    <div class="card">
      <h1 style="margin:0 0 6px;">${esc(meet.meetName)}</h1>
      <div class="muted">${esc(meet.date || "")} ${meet.startTime ? `• ${esc(meet.startTime)}` : ""}</div>
      <div class="spacer"></div>
      <div class="note">Printable race program (based on Block Builder order).</div>
      <div class="spacer"></div>
      <button class="btn2" onclick="window.print()">Print</button>
    </div>

    <div class="spacer"></div>

    ${program.map(({block, races}) => `
      <div class="card">
        <h2 style="margin:0;">${esc(block.name)} ${block.day ? `• Day ${esc(block.day)}` : ""} ${block.label ? `• ${esc(block.label)}` : ""}</h2>
        <div class="hr"></div>
        ${races.length ? `
          <div style="display:grid; grid-template-columns: 1fr; gap:8px;">
            ${races.map((r, idx)=>`
              <div style="padding:8px 0; border-bottom:1px solid rgba(148,163,184,.18);">
                <div style="font-weight:900;">Race ${esc(r.orderHint)} – ${esc(r.groupLabel)} • ${esc(String(r.division).toUpperCase())}</div>
                <div class="muted small">${esc(r.distanceLabel)} • D${esc(r.dayIndex)} • ${esc(r.ages)}</div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="muted">No races in this block yet.</div>`}
      </div>
      <div class="spacer"></div>
    `).join("")}
  `;
  res.send(pageShell({ title: "Program", bodyHtml: body, auth, meet: null }));
});

app.get("/portal/meet/:meetId/print/program", requireAdmin, (req, res) => {
  res.redirect(`/meet/${encodeURIComponent(req.params.meetId)}/program`);
});

app.get("/portal/meet/:meetId/print/checkin", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  const rows = (meet.registrations || []).slice().sort((a,b)=> (a.meetNo||0)-(b.meetNo||0)).map(r => `
    <tr>
      <td style="padding:8px 6px; font-weight:900;">${esc(r.meetNo)}</td>
      <td style="padding:8px 6px;">${esc(r.name)}</td>
      <td style="padding:8px 6px;">${esc(r.team)}</td>
      <td style="padding:8px 6px;" class="muted">${esc(r.age)}</td>
    </tr>
  `).join("");

  const body = `
    <div class="card">
      <h1 style="margin:0 0 6px;">Check-in List</h1>
      <h2 style="margin:0 0 6px;">${esc(meet.meetName)}</h2>
      <div class="muted">${esc(meet.date || "")}</div>
      <div class="spacer"></div>
      <button class="btn2" onclick="window.print()">Print</button>
    </div>
    <div class="spacer"></div>
    <div class="card">
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="text-align:left; color:#334155; font-weight:900;">
            <th style="padding:10px 6px;">#</th>
            <th style="padding:10px 6px;">Skater</th>
            <th style="padding:10px 6px;">Team</th>
            <th style="padding:10px 6px;">Age</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4" class="muted" style="padding:12px 6px;">No registrations yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  res.send(pageShell({ title: "Print Check-in", bodyHtml: body, auth: req.auth, meet: null }));
});

// -------------------------
// Staff (concept foundation)
// - Coaches: permanent PINs stored in db.coaches
// - Judges: meet-specific PINs stored in meet.staff[]
// - Directors: invited usernames stored in meet.directors[]
// -------------------------
function ensureStaff(meet) {
  if (!Array.isArray(meet.staff)) meet.staff = []; // {id,name,team,roles:{director,judge,coach}, pin, enabled, createdAt}
}

function genPin6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

app.get("/portal/meet/:meetId/staff", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = getMeetOrRedirect(db, meetId, res);
  if (!meet) return;
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  ensureStaff(meet);

  const rows = (meet.staff || []).map(p => `
    <tr>
      <td style="padding:10px 6px; font-weight:900;">${esc(p.name)}</td>
      <td style="padding:10px 6px;">${esc(p.team || "")}</td>
      <td style="padding:10px 6px;">
        <span class="chip small">${p.roles?.director ? "Director" : ""}</span>
        <span class="chip small">${p.roles?.judge ? "Judge" : ""}</span>
        <span class="chip small">${p.roles?.coach ? "Coach" : ""}</span>
      </td>
      <td style="padding:10px 6px;" class="muted">${esc(p.pin || "")}</td>
      <td style="padding:10px 6px;">${p.enabled ? `<span class="ok">Enabled</span>` : `<span class="danger">Disabled</span>`}</td>
    </tr>
  `).join("");

  const body = `
    <h1>Staff</h1>
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h2 style="margin:0;">${esc(meet.meetName)}</h2>
          <div class="muted small">Owner: ${esc(meet.owner || "")} • Meet ID: ${esc(meet.id)}</div>
        </div>
        <div class="row">
          <a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/staff/add">+ Add Person</a>
          <a class="btn2" href="/judge/login?meet=${encodeURIComponent(meet.id)}">Judge Login Link</a>
          <a class="btn2" href="/coach/login">Coach Login</a>
        </div>
      </div>

      <div class="hr"></div>

      <div class="note">
        Multi-roles are allowed. Directors can unlock races and fix mistakes. Judges use meet PIN. Coaches can use permanent PIN (global) or meet staff PIN.
      </div>

      <div class="spacer"></div>
      <h3>Meet Directors</h3>
      <div class="row">
        <span class="chip">Owner: ${esc(meet.owner || "")}</span>
        ${(meet.directors || []).map(u => `<span class="chip">${esc(u)}</span>`).join("") || `<span class="muted small">(No additional directors invited)</span>`}
      </div>

      <div class="spacer"></div>
      <h3>People with Meet Access (PIN)</h3>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="text-align:left; color:#334155; font-weight:900;">
            <th style="padding:10px 6px;">Name</th>
            <th style="padding:10px 6px;">Team</th>
            <th style="padding:10px 6px;">Roles</th>
            <th style="padding:10px 6px;">PIN</th>
            <th style="padding:10px 6px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5" class="muted" style="padding:12px 6px;">No staff added yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  meet.updatedAt = nowIso();
  saveDb(db);
  res.send(pageShell({ title: "Staff", bodyHtml: body, auth: req.auth, meet }));
});

app.get("/portal/meet/:meetId/staff/add", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = getMeetOrRedirect(db, meetId, res);
  if (!meet) return;
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  const body = `
    <h1>Add Person</h1>
    <div class="card">
      <form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/staff/add">
        <div class="grid2">
          <div>
            <label>Name</label>
            <input name="name" required/>
          </div>
          <div>
            <label>Team (optional)</label>
            <input name="team" placeholder="Independent / Team Velocity / etc"/>
          </div>
        </div>

        <div class="spacer"></div>
        <h3>Permissions</h3>
        <div class="row">
          <label class="chip" style="cursor:pointer;"><input type="checkbox" name="role_director" style="width:auto; margin-right:8px; transform:scale(1.1);"/>Director</label>
          <label class="chip" style="cursor:pointer;"><input type="checkbox" name="role_judge" style="width:auto; margin-right:8px; transform:scale(1.1);"/>Judge</label>
          <label class="chip" style="cursor:pointer;"><input type="checkbox" name="role_coach" style="width:auto; margin-right:8px; transform:scale(1.1);"/>Coach</label>
        </div>

        <div class="spacer"></div>
        <div class="grid2">
          <div>
            <label>PIN (auto if blank)</label>
            <input name="pin" placeholder="6-digit PIN"/>
          </div>
          <div>
            <label>Enabled</label>
            <select name="enabled">
              <option value="1" selected>Enabled</option>
              <option value="0">Disabled</option>
            </select>
          </div>
        </div>

        <div class="spacer"></div>
        <button class="btn" type="submit">Save Person</button>
        <a class="btn2" style="margin-left:8px;" href="/portal/meet/${encodeURIComponent(meet.id)}/staff">Cancel</a>
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Staff", bodyHtml: body, auth: req.auth, meet }));
});

app.post("/portal/meet/:meetId/staff/add", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  ensureStaff(meet);

  const name = String(req.body.name || "").trim();
  const team = String(req.body.team || "").trim();
  const roles = {
    director: !!req.body.role_director,
    judge: !!req.body.role_judge,
    coach: !!req.body.role_coach,
  };
  const pin = String(req.body.pin || "").trim() || genPin6();
  const enabled = String(req.body.enabled || "1") === "1";

  meet.staff.push({
    id: nextShortId("staff_"),
    name,
    team,
    roles,
    pin,
    enabled,
    createdAt: nowIso(),
  });

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/staff`);
});

// -------------------------
// Judge login + dashboard (meet PIN)
// -------------------------
app.get("/judge/login", (req, res) => {
  const auth = getAuth(req);
  if (auth?.kind === "judge") return res.redirect("/judge");

  const meetHint = String(req.query.meet || "").trim();
  const body = `
    <h1>Judge Login</h1>
    <div class="card">
      <form method="POST" action="/judge/login">
        <div class="grid2">
          <div>
            <label>Meet ID</label>
            <input name="meetId" value="${esc(meetHint)}" required/>
          </div>
          <div>
            <label>PIN</label>
            <input name="pin" required/>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Enter Judge Panel</button>
      </form>
      <div class="spacer"></div>
      <div class="note">Judges use a meet-specific PIN (given by director in Staff tab).</div>
    </div>
  `;
  res.send(pageShell({ title: "Judge Login", bodyHtml: body, auth: null, meet: null }));
});

app.post("/judge/login", (req, res) => {
  const db = loadDb();
  const meetId = Number(req.body.meetId || 0);
  const pin = String(req.body.pin || "").trim();
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/judge/login");

  ensureStaff(meet);
  const person = (meet.staff || []).find(p => p.enabled && p.roles?.judge && String(p.pin) === pin);
  if (!person) return res.redirect("/judge/login");

  const secret = db.meta.cookieSecret;
  const payload = { t: Date.now(), kind: "judge", meetId: meet.id, pin };
  const tok = signToken(secret, payload);
  setCookie(res, SESS_COOKIE, tok, { maxAgeSec: 7 * 24 * 60 * 60, secure: isSecure(req) });
  res.redirect("/judge");
});

app.get("/judge/logout", (req, res) => {
  clearCookie(res, SESS_COOKIE);
  res.redirect("/");
});

app.get("/judge", requireAdminOrJudge, (req, res) => {
  const auth = req.auth;
  if (auth.kind === "admin") return res.redirect("/portal");
  const db = loadDb();
  const meet = db.meets.find(m => Number(m.id) === Number(auth.meetId));
  if (!meet) return res.redirect("/judge/login");

  const body = `
    <h1>Judge Panel</h1>
    <div class="card">
      <h2 style="margin:0;">${esc(meet.meetName)}</h2>
      <div class="muted small">Meet ID: ${esc(meet.id)}</div>
      <div class="spacer"></div>
      <a class="btn" href="/portal/meet/${encodeURIComponent(meet.id)}/raceday">Open Race Day</a>
      <div class="spacer"></div>
      <div class="note">Judges enter results from Race Day → click a race.</div>
    </div>
  `;
  res.send(pageShell({ title: "Judge", bodyHtml: body, auth, meet: null }));
});

// -------------------------
// Coach login + portal (permanent PIN)
// -------------------------
app.get("/coach/login", (req, res) => {
  const auth = getAuth(req);
  if (auth?.kind === "coach") return res.redirect("/coach");

  const body = `
    <h1>Coach Login</h1>
    <div class="card">
      <form method="POST" action="/coach/login">
        <div class="grid2">
          <div>
            <label>Team</label>
            <div class="acWrap">
              <input id="coachTeam" name="team" placeholder="Start typing… (Team Velocity / Independent)" autocomplete="off" required/>
              <div id="coachTeamList" class="acList"></div>
            </div>
            <div class="acHint">Click the box to open the list, or type to filter.</div>
          </div>
          <div>
            <label>Permanent PIN</label>
            <input name="pin" placeholder="6-digit PIN" required/>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Enter Coach Portal</button>
      </form>
      <div class="spacer"></div>
      <div class="note">Coaches use a permanent team PIN. (Director can manage later.)</div>
    </div>

    <script>
      const teams = ${JSON.stringify(TEAM_LIST)};
      const input = document.getElementById("coachTeam");
      const list = document.getElementById("coachTeamList");

      function render(filter){
        const q = (filter||"").toLowerCase().trim();
        const items = teams.filter(t => !q || t.toLowerCase().includes(q)).slice(0, 80);
        list.innerHTML = items.map(t => '<div class="acItem" data-v="'+t.replaceAll('"','&quot;')+'">'+t+'</div>').join("") || '<div class="note" style="padding:10px;">No matches.</div>';
        list.style.display = "block";
        list.querySelectorAll(".acItem").forEach(el=>{
          el.addEventListener("click", ()=>{
            input.value = el.getAttribute("data-v");
            list.style.display = "none";
          });
        });
      }
      input.addEventListener("focus", ()=> render(input.value));
      input.addEventListener("input", ()=> render(input.value));
      document.addEventListener("click", (e)=>{ if (!e.target.closest(".acWrap")) list.style.display = "none"; });
    </script>
  `;
  res.send(pageShell({ title: "Coach Login", bodyHtml: body, auth: null, meet: null }));
});

app.post("/coach/login", (req, res) => {
  const db = loadDb();
  const team = String(req.body.team || "").trim();
  const pin = String(req.body.pin || "").trim();

  // If coach record exists, allow. If not, allow “first-time coach” creation via meet director later.
  // For now: require existing coach in db.coaches (permanent pins are controlled).
  const coach = db.coaches.find(c => String(c.team) === team && String(c.pin6) === pin);
  if (!coach) return res.redirect("/coach/login");

  const secret = db.meta.cookieSecret;
  const payload = { t: Date.now(), kind: "coach", team, coachId: coach.id };
  const tok = signToken(secret, payload);
  setCookie(res, SESS_COOKIE, tok, { maxAgeSec: 90 * 24 * 60 * 60, secure: isSecure(req) });
  res.redirect("/coach");
});

app.get("/coach/logout", (req, res) => {
  clearCookie(res, SESS_COOKIE);
  res.redirect("/");
});

app.get("/coach", requireCoach, (req, res) => {
  const db = loadDb();
  const team = req.auth.team;
  // Coach sees meets where their team has registrations
  const meets = db.meets.filter(m => (m.registrations || []).some(r => String(r.team) === team));

  const cards = meets.map(m => {
    // Determine now racing/on deck based on meet.raceDay.currentRaceId and program order
    const raceById = new Map((m.races || []).map(r => [r.id, r]));
    const order = [];
    for (const b of (m.blocks || [])) for (const rid of (b.raceIds || [])) order.push(rid);
    const curIdx = m.raceDay?.currentRaceId ? order.indexOf(m.raceDay.currentRaceId) : -1;
    const curRace = curIdx >= 0 ? raceById.get(order[curIdx]) : null;
    const nextRace = curIdx >= 0 && curIdx + 1 < order.length ? raceById.get(order[curIdx + 1]) : null;

    // Basic team roster
    const roster = (m.registrations || []).filter(r => String(r.team) === team).slice().sort((a,b)=> (a.meetNo||0)-(b.meetNo||0));

    return `
      <div class="card">
        <div class="row" style="justify-content:space-between; align-items:center;">
          <div>
            <h2 style="margin:0;">${esc(m.meetName)}</h2>
            <div class="muted small">${esc(m.date || "")} ${m.startTime ? `• ${esc(m.startTime)}` : ""}</div>
          </div>
          <div class="chip">Meet ID: ${esc(m.id)}</div>
        </div>
        <div class="hr"></div>

        <div class="kpi">
          <span class="chip">Team: ${esc(team)}</span>
          <span class="chip">Registered Skaters: ${esc(roster.length)}</span>
        </div>

        <div class="spacer"></div>
        <div class="grid2">
          <div class="card" style="box-shadow:none;">
            <h3>Now Racing</h3>
            ${
              curRace
                ? `<div style="font-weight:900;">Race ${esc(curRace.orderHint)} – ${esc(curRace.groupLabel)} • ${esc(String(curRace.division).toUpperCase())}</div>
                   <div class="muted small">${esc(curRace.distanceLabel)} • D${esc(curRace.dayIndex)}</div>`
                : `<div class="muted">Not started yet.</div>`
            }
          </div>
          <div class="card" style="box-shadow:none;">
            <h3>On Deck</h3>
            ${
              nextRace
                ? `<div style="font-weight:900;">Race ${esc(nextRace.orderHint)} – ${esc(nextRace.groupLabel)} • ${esc(String(nextRace.division).toUpperCase())}</div>
                   <div class="muted small">${esc(nextRace.distanceLabel)} • D${esc(nextRace.dayIndex)}</div>`
                : `<div class="muted">No next race.</div>`
            }
          </div>
        </div>

        <div class="spacer"></div>
        <h3>Team Roster</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="text-align:left; color:#334155; font-weight:900;">
              <th style="padding:10px 6px;">#</th>
              <th style="padding:10px 6px;">Skater</th>
              <th style="padding:10px 6px;">Age</th>
              <th style="padding:10px 6px;">Options</th>
            </tr>
          </thead>
          <tbody>
            ${
              roster.map(r => `
                <tr>
                  <td style="padding:10px 6px; font-weight:900;">${esc(r.meetNo)}</td>
                  <td style="padding:10px 6px;">${esc(r.name)}</td>
                  <td style="padding:10px 6px;">${esc(r.age)}</td>
                  <td style="padding:10px 6px;" class="muted small">
                    ${r.opts?.challengeUp ? "Challenge Up • " : ""}
                    ${r.opts?.novice ? "Novice • " : ""}
                    ${r.opts?.elite ? "Elite • " : ""}
                    ${r.opts?.open ? "Open • " : ""}
                    ${r.opts?.timeTrials ? "Time Trials • " : ""}
                    ${r.opts?.relays ? "Relays" : ""}
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="4" class="muted" style="padding:12px 6px;">No team registrations found.</td></tr>`
            }
          </tbody>
        </table>

        <div class="spacer"></div>
        <div class="row">
          <a class="btn2" href="/meet/${encodeURIComponent(m.id)}/register" target="_blank">Register More Skaters</a>
          <a class="btn2" href="/meet/${encodeURIComponent(m.id)}/program" target="_blank">Print Program</a>
        </div>
      </div>
    `;
  }).join("<div class='spacer'></div>");

  const body = `
    <h1>Coach Portal</h1>
    <div class="muted">You’ll see meets where your team has registered skaters.</div>
    <div class="spacer"></div>
    ${cards || `<div class="card"><div class="muted">No meets found for team <b>${esc(team)}</b> yet.</div></div>`}
  `;

  res.send(pageShell({ title: "Coach", bodyHtml: body, auth: req.auth, meet: null }));
});

// -------------------------
// Race Day (director)
// -------------------------
function programOrder(meet) {
  const order = [];
  for (const b of (meet.blocks || [])) for (const rid of (b.raceIds || [])) order.push(rid);
  return order;
}

app.get("/portal/meet/:meetId/raceday", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = getMeetOrRedirect(db, meetId, res);
  if (!meet) return;
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  ensureAtLeastOneBlock(meet);

  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const order = programOrder(meet);
  const curId = meet.raceDay?.currentRaceId || "";
  const curIdx = curId ? order.indexOf(curId) : -1;
  const curRace = curIdx >= 0 ? raceById.get(order[curIdx]) : null;
  const nextRace = curIdx >= 0 && curIdx + 1 < order.length ? raceById.get(order[curIdx + 1]) : null;

  const listHtml = order.map((rid, i) => {
    const r = raceById.get(rid);
    if (!r) return "";
    const isNow = rid === curId;
    const status = meet.raceDay?.statusByRaceId?.[rid];
    const done = status?.locked ? "✓" : "";
    return `
      <div class="raceItem" style="cursor:default;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div style="font-weight:900;">${isNow ? "▶ " : ""}${done} Race ${esc(r.orderHint)} – ${esc(r.groupLabel)} • ${esc(String(r.division).toUpperCase())}</div>
          <div class="muted small">${esc(r.distanceLabel)} • D${esc(r.dayIndex)}</div>
        </div>
        <div class="row" style="margin-top:8px;">
          <a class="btn2 small" href="/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(r.id)}/judge">Open Judge Entry</a>
          ${status?.locked ? `<a class="btn2 small" href="/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(r.id)}/unlock">Unlock</a>` : `<a class="btn2 small" href="/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(r.id)}/lock">Lock</a>`}
          <button class="btn2 small" onclick="setCurrent('${esc(r.id)}')">Set Now Racing</button>
        </div>
      </div>
    `;
  }).join("");

  const body = `
    <h1>Race Day</h1>

    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h2 style="margin:0;">${esc(meet.meetName)}</h2>
          <div class="muted small">Director control center. Set “Now Racing”, open judge entry, lock/unlock results.</div>
        </div>
        <div class="row">
          <a class="btn2" href="/meet/${encodeURIComponent(meet.id)}/program" target="_blank">Print Program</a>
          <a class="btn2" href="/portal">Portal</a>
        </div>
      </div>
      <div class="hr"></div>

      <div class="grid2">
        <div class="card" style="box-shadow:none;">
          <h3>NOW RACING</h3>
          ${
            curRace
              ? `<div style="font-weight:900;">Race ${esc(curRace.orderHint)} – ${esc(curRace.groupLabel)} • ${esc(String(curRace.division).toUpperCase())}</div>
                 <div class="muted small">${esc(curRace.distanceLabel)} • D${esc(curRace.dayIndex)} • ${esc(curRace.ages)}</div>
                 <div class="spacer"></div>
                 <div class="row">
                   <a class="btn" href="/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(curRace.id)}/judge">Enter Results</a>
                   <button class="btn2" onclick="nextRace()">Next Race</button>
                 </div>`
              : `<div class="muted">Not started yet. Click “Set Now Racing” on a race below.</div>`
          }
        </div>

        <div class="card" style="box-shadow:none;">
          <h3>ON DECK</h3>
          ${
            nextRace
              ? `<div style="font-weight:900;">Race ${esc(nextRace.orderHint)} – ${esc(nextRace.groupLabel)} • ${esc(String(nextRace.division).toUpperCase())}</div>
                 <div class="muted small">${esc(nextRace.distanceLabel)} • D${esc(nextRace.dayIndex)} • ${esc(nextRace.ages)}</div>`
              : `<div class="muted">No next race.</div>`
          }
          <div class="spacer"></div>
          <div class="note">This becomes extremely powerful once heats are generated from registrations (next phase).</div>
        </div>
      </div>
    </div>

    <div class="spacer"></div>

    <div class="card">
      <h3>Program Order</h3>
      <div class="muted small">Based on Block Builder order. Lock results to finalize. Directors can unlock to correct mistakes.</div>
      <div class="spacer"></div>
      ${listHtml || `<div class="muted">No races in blocks yet.</div>`}
    </div>

    <script>
      const meetId = ${JSON.stringify(meet.id)};
      const order = ${JSON.stringify(order)};
      const current = ${JSON.stringify(curId)};

      async function setCurrent(raceId){
        const res = await fetch("/api/meet/" + meetId + "/raceday/set-current", {
          method:"POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ raceId })
        });
        if (!res.ok) return alert("Failed");
        location.reload();
      }

      async function nextRace(){
        const idx = current ? order.indexOf(current) : -1;
        const nextId = (idx >= 0 && idx + 1 < order.length) ? order[idx + 1] : (order[0] || "");
        if (!nextId) return;
        await setCurrent(nextId);
      }
    </script>
  `;

  saveDb(db);
  res.send(pageShell({ title: "Race Day", bodyHtml: body, auth: req.auth, meet }));
});

app.post("/api/meet/:meetId/raceday/set-current", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("forbidden");

  const raceId = String(req.body.raceId || "");
  const exists = (meet.races || []).some(r => r.id === raceId);
  if (!exists) return res.status(400).send("bad raceId");

  if (!meet.raceDay) meet.raceDay = { currentRaceId: "", statusByRaceId: {} };
  meet.raceDay.currentRaceId = raceId;
  meet.updatedAt = nowIso();
  saveDb(db);
  res.json({ ok: true });
});

// Lock / unlock race
app.get("/portal/meet/:meetId/race/:raceId/lock", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const raceId = String(req.params.raceId || "");
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  if (!meet.raceDay) meet.raceDay = { currentRaceId: "", statusByRaceId: {} };
  if (!meet.raceDay.statusByRaceId) meet.raceDay.statusByRaceId = {};
  if (!meet.raceDay.statusByRaceId[raceId]) meet.raceDay.statusByRaceId[raceId] = { locked: false, mode: "", results: [] };
  meet.raceDay.statusByRaceId[raceId].locked = true;

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/raceday`);
});

app.get("/portal/meet/:meetId/race/:raceId/unlock", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const raceId = String(req.params.raceId || "");
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  if (!meet.raceDay) meet.raceDay = { currentRaceId: "", statusByRaceId: {} };
  if (!meet.raceDay.statusByRaceId) meet.raceDay.statusByRaceId = {};
  if (!meet.raceDay.statusByRaceId[raceId]) meet.raceDay.statusByRaceId[raceId] = { locked: false, mode: "", results: [] };
  meet.raceDay.statusByRaceId[raceId].locked = false;

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/raceday`);
});

// -------------------------
// Judge Entry (time trial OR place)
// -------------------------
function getRaceStatus(meet, raceId, defaultMode) {
  if (!meet.raceDay) meet.raceDay = { currentRaceId: "", statusByRaceId: {} };
  if (!meet.raceDay.statusByRaceId) meet.raceDay.statusByRaceId = {};
  if (!meet.raceDay.statusByRaceId[raceId]) {
    meet.raceDay.statusByRaceId[raceId] = { locked: false, mode: defaultMode || "place", results: [] };
  }
  const st = meet.raceDay.statusByRaceId[raceId];
  if (!st.mode) st.mode = defaultMode || "place";
  if (!Array.isArray(st.results)) st.results = [];
  return st;
}

app.get("/portal/meet/:meetId/race/:raceId/judge", requireAdminOrJudge, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const raceId = String(req.params.raceId || "");
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect(req.auth.kind === "judge" ? "/judge/login" : "/portal");

  // Judge must match meetId from token; admin must have edit access
  if (req.auth.kind === "judge" && Number(req.auth.meetId) !== Number(meet.id)) return res.status(403).send("Forbidden");
  if (req.auth.kind === "admin" && !isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  const race = (meet.races || []).find(r => r.id === raceId);
  if (!race) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/raceday`);

  const st = getRaceStatus(meet, raceId, race.defaultMode);

  // We don’t have heats/lanes assignment yet; this is a “result entry shell”.
  // For now, show registrations (all) as input rows IF time trial mode,
  // otherwise show a simple “place entry” list for the first N regs.
  const regs = (meet.registrations || []).slice().sort((a,b)=> (a.meetNo||0)-(b.meetNo||0));
  const sample = regs.slice(0, Math.max(4, Math.min(12, regs.length)));

  // Map existing results
  const byRegId = new Map((st.results || []).map(x => [x.regId, x]));

  const rows = sample.map(r => {
    const existing = byRegId.get(r.id) || {};
    return `
      <tr>
        <td style="padding:10px 6px; font-weight:900;">${esc(r.meetNo)}</td>
        <td style="padding:10px 6px;">${esc(r.name)}</td>
        <td style="padding:10px 6px;">
          ${
            st.mode === "time"
              ? `<input name="time_${esc(r.id)}" value="${esc(existing.time || "")}" placeholder="MM:SS.mmm or SS.mmm" ${st.locked ? "disabled" : ""}/>`
              : `<input name="place_${esc(r.id)}" value="${esc(existing.place || "")}" placeholder="1" ${st.locked ? "disabled" : ""}/>`
          }
        </td>
      </tr>
    `;
  }).join("");

  const body = `
    <h1>Judge Entry</h1>
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div>
          <h2 style="margin:0;">Race ${esc(race.orderHint)} – ${esc(race.groupLabel)} • ${esc(String(race.division).toUpperCase())}</h2>
          <div class="muted small">${esc(race.distanceLabel)} • D${esc(race.dayIndex)} • ${esc(race.ages)}</div>
        </div>
        <div class="kpi">
          <span class="chip">${st.mode === "time" ? "TIME TRIAL" : "PLACE"}</span>
          ${st.locked ? `<span class="chip danger">LOCKED</span>` : `<span class="chip ok">UNLOCKED</span>`}
        </div>
      </div>
      <div class="hr"></div>

      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="note">This is the entry screen shell. Heats/lanes + auto-advancement comes next phase.</div>
        ${
          req.auth.kind === "admin"
            ? `<div class="row">
                <form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(race.id)}/mode" style="margin:0;">
                  <input type="hidden" name="mode" value="${st.mode === "time" ? "place" : "time"}"/>
                  <button class="btn2" type="submit">Switch to ${st.mode === "time" ? "Place" : "Time"} Mode</button>
                </form>
                ${st.locked ? `<a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(race.id)}/unlock">Unlock</a>` : `<a class="btn2" href="/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(race.id)}/lock">Lock</a>`}
              </div>`
            : ""
        }
      </div>

      <div class="spacer"></div>

      <form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(race.id)}/judge/save">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="text-align:left; color:#334155; font-weight:900;">
              <th style="padding:10px 6px;">Check-in #</th>
              <th style="padding:10px 6px;">Skater</th>
              <th style="padding:10px 6px;">${st.mode === "time" ? "Time" : "Place"}</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="3" class="muted" style="padding:12px 6px;">No registrations yet.</td></tr>`}</tbody>
        </table>

        <div class="spacer"></div>
        <button class="btn" type="submit" ${st.locked ? "disabled" : ""}>Save Results</button>
        <a class="btn2" style="margin-left:8px;" href="/portal/meet/${encodeURIComponent(meet.id)}/raceday">Back to Race Day</a>
      </form>
    </div>
  `;

  saveDb(db);
  res.send(pageShell({ title: "Race Day", bodyHtml: body, auth: req.auth, meet: null }));
});

app.post("/portal/meet/:meetId/race/:raceId/mode", requireAdmin, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const raceId = String(req.params.raceId || "");
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");
  if (!isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  const race = (meet.races || []).find(r => r.id === raceId);
  if (!race) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/raceday`);

  const st = getRaceStatus(meet, raceId, race.defaultMode);
  const mode = String(req.body.mode || "").trim();
  if (mode === "time" || mode === "place") st.mode = mode;

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(race.id)}/judge`);
});

app.post("/portal/meet/:meetId/race/:raceId/judge/save", requireAdminOrJudge, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const raceId = String(req.params.raceId || "");
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect(req.auth.kind === "judge" ? "/judge/login" : "/portal");

  if (req.auth.kind === "judge" && Number(req.auth.meetId) !== Number(meet.id)) return res.status(403).send("Forbidden");
  if (req.auth.kind === "admin" && !isMeetEditableBy(req.auth, meet)) return res.status(403).send("Forbidden");

  const race = (meet.races || []).find(r => r.id === raceId);
  if (!race) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/raceday`);

  const st = getRaceStatus(meet, raceId, race.defaultMode);
  if (st.locked) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(race.id)}/judge`);

  const regs = (meet.registrations || []).slice().sort((a,b)=> (a.meetNo||0)-(b.meetNo||0));
  const sample = regs.slice(0, Math.max(4, Math.min(12, regs.length)));

  const results = [];
  for (const r of sample) {
    if (st.mode === "time") {
      const t = String(req.body[`time_${r.id}`] || "").trim();
      if (t) results.push({ regId: r.id, meetNo: r.meetNo, name: r.name, time: t });
    } else {
      const p = String(req.body[`place_${r.id}`] || "").trim();
      if (p) results.push({ regId: r.id, meetNo: r.meetNo, name: r.name, place: p });
    }
  }

  // For time mode: auto-sort by parsed seconds if possible
  if (st.mode === "time") {
    function parseTimeToMs(s) {
      s = String(s || "").trim();
      // Accept "SS.mmm" or "MM:SS.mmm"
      if (!s) return Infinity;
      if (s.includes(":")) {
        const [mm, rest] = s.split(":");
        const sec = Number(rest);
        const min = Number(mm);
        if (!Number.isFinite(min) || !Number.isFinite(sec)) return Infinity;
        return Math.round((min * 60 + sec) * 1000);
      } else {
        const sec = Number(s);
        if (!Number.isFinite(sec)) return Infinity;
        return Math.round(sec * 1000);
      }
    }
    results.sort((a,b)=> parseTimeToMs(a.time) - parseTimeToMs(b.time));
    results.forEach((x, i)=> x.place = i + 1);
  } else {
    results.sort((a,b)=> Number(a.place||999) - Number(b.place||999));
  }

  st.results = results;
  meet.updatedAt = nowIso();
  saveDb(db);

  res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race/${encodeURIComponent(race.id)}/judge`);
});

// -------------------------
// Coach admin (superadmin only for now): create permanent coach PINs
// -------------------------
app.get("/portal/coaches", requireAdmin, (req, res) => {
  if (req.auth.role !== "superadmin") return res.status(403).send("Forbidden");
  const db = loadDb();

  const rows = db.coaches.map(c => `
    <tr>
      <td style="padding:10px 6px; font-weight:900;">${esc(c.name || "")}</td>
      <td style="padding:10px 6px;">${esc(c.team || "")}</td>
      <td style="padding:10px 6px;" class="muted">${esc(c.pin6 || "")}</td>
    </tr>
  `).join("");

  const body = `
    <h1>Coaches Admin</h1>
    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="muted">Permanent coach PINs (global). Coaches can login anytime.</div>
        <div class="row">
          <a class="btn2" href="/portal">Portal</a>
          <a class="btn" href="/portal/coaches/new">Add Coach</a>
        </div>
      </div>
      <div class="hr"></div>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="text-align:left; color:#334155; font-weight:900;">
            <th style="padding:10px 6px;">Coach</th>
            <th style="padding:10px 6px;">Team</th>
            <th style="padding:10px 6px;">PIN</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="3" class="muted" style="padding:12px 6px;">No coaches yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  res.send(pageShell({ title: "Coaches Admin", bodyHtml: body, auth: req.auth, meet: null }));
});

app.get("/portal/coaches/new", requireAdmin, (req, res) => {
  if (req.auth.role !== "superadmin") return res.status(403).send("Forbidden");
  const body = `
    <h1>Add Coach</h1>
    <div class="card">
      <form method="POST" action="/portal/coaches/new">
        <div class="grid2">
          <div><label>Coach Name</label><input name="name" required/></div>
          <div><label>Team</label><input name="team" required placeholder="Team Velocity / Independent"/></div>
        </div>
        <div class="spacer"></div>
        <div class="grid2">
          <div><label>Permanent PIN (auto if blank)</label><input name="pin" placeholder="6-digit PIN"/></div>
          <div><label>Notes</label><input name="notes" placeholder="optional"/></div>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Save Coach</button>
        <a class="btn2" style="margin-left:8px;" href="/portal/coaches">Cancel</a>
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Coaches Admin", bodyHtml: body, auth: req.auth, meet: null }));
});

app.post("/portal/coaches/new", requireAdmin, (req, res) => {
  if (req.auth.role !== "superadmin") return res.status(403).send("Forbidden");
  const db = loadDb();
  const name = String(req.body.name || "").trim();
  const team = String(req.body.team || "").trim();
  const pin6 = String(req.body.pin || "").trim() || genPin6();
  const notes = String(req.body.notes || "").trim();

  db.coaches.push({
    id: nextShortId("coach_"),
    name,
    team,
    pin6,
    notes,
    createdAt: nowIso(),
  });

  saveDb(db);
  res.redirect("/portal/coaches");
});

// -------------------------
// Simple access landing
// -------------------------
app.get("/access", (req, res) => {
  const body = `
    <h1>Access</h1>
    <div class="card">
      <div class="row">
        <a class="btn2" href="/admin/login">Director Login</a>
        <a class="btn2" href="/judge/login">Judge Login</a>
        <a class="btn2" href="/coach/login">Coach Login</a>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Access", bodyHtml: body, auth: null, meet: null }));
});

// -------------------------
// Start
// -------------------------
app.listen(PORT, HOST, () => {
  const db = loadDb(); // ensure DB exists & migration runs
  console.log(
    `
SpeedSkateMeet | CLEAN REBUILD v10.1 (DATA ${DATA_VERSION})
Data: ${DATA_FILE}

Default rink:
- Roller City (Wichita, KS)
Auto-cleanup:
- Removes Wichita Skate Center if present

Login:
- Lbird22 / Redline22

Listening on ${HOST}:${PORT}
`.trim()
  );
});