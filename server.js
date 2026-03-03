// ============================================================
// SpeedSkateMeet – CLEAN REBUILD v8.0 – March 2026
// Node.js + Express • single-file server.js • JSON persistence
//
// FIXES / FEATURES:
// ✅ No “default meet” created automatically (nothing appears until you build one)
// ✅ Full USARS-style division list restored (Tiny Tot -> Grand Veteran, correct order)
// ✅ Rinks default: Roller City (Wichita Skate Center removed forever)
// ✅ Director-only Add/Edit/Delete rinks restored
// ✅ Registration: Age + checkboxes + Teams dropdown (team list restored, alphabetical)
// ✅ Plain distance inputs (no datalist dropdown glitches)
// ✅ Meet-wide SkateAbility boxes + Time Trials config + Relays config (meet-wide flags)
// ✅ Robust sessions (no undefined crashes)
//
// ============================================================

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// -------------------- DEPLOY --------------------
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

// -------------------- DATA --------------------
const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "ssm_db.json");

// -------------------- HELPERS --------------------
function nowIso() {
  return new Date().toISOString();
}
function uid(n = 12) {
  return crypto.randomBytes(n).toString("hex");
}
function safeText(x) {
  return String(x ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#039;";
      default: return c;
    }
  });
}
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}
function atomicWriteJson(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}
function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error("❌ Failed to parse JSON DB:", e);
    return null;
  }
}

// -------------------- TEAMS (alphabetical) --------------------
const TEAM_LIST = [
  "Independent",
  "CCN Inline",
  "Good Vibes Skate Company",
  "JKL Racing",
  "Mean Girls Racing",
  "National Speed Skating Circuit",
  "Precision Inline",
  "Simmons Racing / Simmons Rana",
  "TCK Skate Supply",
  "Weber's Racing",
  "Weber's Skateway",
  "Midwest Racing",
  "Infinity Racing",
  "Team Velocity",
  "Star Skate Speed",
  "Tulsa Surge Speed Skating",
  "Bell's Speed Skating Team",
  "Badger State Racing",
  "Rollaire Speed Team",
  "Aurora Speed Club",
  "Capital City Racing",
  "Astro Speed",
  "Central Florida Speed Team",
  "FAST Speed Team",
  "Ocala Speed Inline Racing Team",
  "Stardust Inline Speed Skating Team",
  "SobeRollers",
  "Carolina Gold Rush",
  "High Point Speed Skating",
  "Rocket City Speed",
  "Champions Speed Skating Team",
  "CC Speed",
  "Dairy Ashford Speed Team",
  "DFW Speed",
  "Inside Edge Racing",
  "Classic Speed Skate Club",
  "North Idaho Elite",
  "Stallions Racing",
  "Synergy Speed Skating",
  "Team Oaks",
  "Team Xtreme",
  "North Coast Inline Racing",
  "Pac West Inline Racing",
  "Roller King Speed",
  "Triad Racing",
  "Ashland Speedskating of Virginia",
  "CW SpeedTeam",
  "Fast Forward Racing",
  "Frenchtown Speed Team",
  "Middlesex Racing Team",
  "Olympic Speed",
  "Omni Speed",
  "Phantom Racing",
  "SOS Racing",
  "Warrior Racing",
  "West Michigan Wolverines Speed Team",
  "Midland Rockets",
  "Diamond State Racing",
  "GT Speed",
  "Mach Racing",
  "Precision Racing",
  "Kentucky Speed",
  "Cobras Speed Skating",
  "Front Range Speed Team",
  "Tennessee Speed",
].slice().sort((a, b) => a.localeCompare(b));

// -------------------- DIVISIONS (full list, correct order) --------------------
const ALL_DIVISIONS = [
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

  // Adult chain (fixed)
  { id: "senior_women", label: "Senior Women", ages: "18–24" },
  { id: "senior_men", label: "Senior Men", ages: "18–24" },

  { id: "classic_women", label: "Classic Women", ages: "25–34" },
  { id: "classic_men", label: "Classic Men", ages: "25–34" },

  { id: "masters_women", label: "Masters Women", ages: "35–44" },
  { id: "masters_men", label: "Masters Men", ages: "35–44" },

  { id: "veteran_women", label: "Veteran Women", ages: "45–54" },
  { id: "veteran_men", label: "Veteran Men", ages: "45–54" },

  { id: "esquire_women", label: "Esquire Women", ages: "55–64" },
  { id: "esquire_men", label: "Esquire Men", ages: "55–64" },

  { id: "grand_veteran_women", label: "Grand Veteran Women", ages: "65+" },
  { id: "grand_veteran_men", label: "Grand Veteran Men", ages: "65+" },
];

function buildMeetGroups() {
  return ALL_DIVISIONS.map((div) => ({
    id: div.id,
    label: div.label,
    ages: div.ages,
    divisions: {
      novice: { enabled: false, cost: 0, distances: ["", "", "", ""] },
      elite: { enabled: false, cost: 0, distances: ["", "", "", ""] },
      open: { enabled: false, cost: 0, distances: ["", "", "", ""] },
    },
  }));
}

// -------------------- DB --------------------
const DATA_VERSION = "8.0";

function defaultDb() {
  // IMPORTANT: no default meets created here.
  return {
    meta: { version: DATA_VERSION, createdAt: nowIso(), updatedAt: nowIso() },

    // Demo users (hashed)
    users: [
      { id: "u_director", username: "Lbird22", role: "director", passHash: "" },
      { id: "u_judge", username: "JudgeLee", role: "judge", passHash: "" },
      { id: "u_coach", username: "CoachLee", role: "coach", passHash: "" },
    ],

    rinks: [
      {
        id: "rink_roller_city_wichita",
        name: "Roller City",
        city: "Wichita",
        state: "KS",
        phone: "316-942-4555",
        address: "3234 S. Meridian Ave, Wichita, KS 67217",
        website: "rollercitywichitaks.com",
        notes: "",
      },
    ],

    meets: [],

    // keep for later expansion
    teamList: TEAM_LIST,
  };
}

let db = readJsonIfExists(DATA_FILE) || defaultDb();

function saveDb() {
  db.meta = db.meta || {};
  db.meta.version = DATA_VERSION;
  db.meta.updatedAt = nowIso();
  atomicWriteJson(DATA_FILE, db);
}

// -------------------- PASSWORD HASHING (no plaintext) --------------------
const SSM_SALT = crypto.createHash("sha256").update("ssm_salt_speedskatemeet").digest("hex");
function passHash(password) {
  return crypto.pbkdf2Sync(String(password || ""), SSM_SALT, 120000, 32, "sha256").toString("hex");
}
function ensureUserHashes() {
  // If db came from older versions that stored plaintext "password", convert once.
  for (const u of (db.users || [])) {
    if (u.passHash && typeof u.passHash === "string" && u.passHash.length > 20) continue;

    if (u.password) {
      u.passHash = passHash(u.password);
      delete u.password;
    }
  }

  // Ensure demo passwords exist (Redline22 by default)
  const defaults = { Lbird22: "Redline22", JudgeLee: "Redline22", CoachLee: "Redline22" };
  for (const u of (db.users || [])) {
    if (!u.passHash || u.passHash.length < 20) {
      u.passHash = passHash(defaults[u.username] || "Redline22");
    }
  }
}
ensureUserHashes();
saveDb();

// -------------------- SESSIONS --------------------
const sessions = new Map(); // sid -> { userId, exp }
const SESSION_TTL = 1000 * 60 * 60 * 12; // 12 hours
const SESSION_COOKIE = "ssm_sid";

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;

  const s = sessions.get(sid);
  if (!s) return null;
  if (Date.now() > s.exp) {
    sessions.delete(sid);
    return null;
  }

  const user = (db.users || []).find((u) => u.id === s.userId);
  if (!user) return null;

  // sliding TTL
  s.exp = Date.now() + SESSION_TTL;
  sessions.set(sid, s);

  return { sid, user };
}

function setSessionCookie(res, sid) {
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sid)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL / 1000)}`,
    ...(isProd ? ["Secure"] : []),
  ];
  res.setHeader("Set-Cookie", parts.join("; "));
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`);
}

function requireRole(roles) {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) return res.redirect("/login");
    if (!roles.includes(s.user.role)) return res.status(403).send("Forbidden");
    req.session = s;
    next();
  };
}

// -------------------- UI --------------------
function css() {
  return `
    :root{
      --blue:#2f65d7;
      --bg:#f4f6fb;
      --card:#ffffff;
      --text:#0f172a;
      --muted:#64748b;
      --border:#e5e7eb;
      --shadow:0 12px 30px rgba(15,23,42,.08);
    }
    *{box-sizing:border-box;}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif;background:var(--bg);color:var(--text);}
    a{color:var(--blue);text-decoration:none;}
    .wrap{max-width:1000px;margin:28px auto;padding:0 16px;}
    .topbar{display:flex;align-items:center;gap:12px;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:14px 16px;box-shadow:var(--shadow);}
    .brand{display:flex;align-items:center;gap:10px;font-weight:900;}
    .nav{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
    .btn{display:inline-block;padding:10px 14px;border-radius:14px;border:2px solid rgba(47,101,215,.35);background:#fff;color:var(--blue);font-weight:800;}
    .btn.primary{background:var(--blue);border-color:var(--blue);color:#fff;}
    .btn.danger{background:#dc2626;border-color:#dc2626;color:#fff;}
    .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid var(--border);color:var(--muted);font-weight:800;font-size:12px;background:#fff;}
    .card{background:var(--card);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin:18px 0;}
    h1{margin:0 0 6px 0;font-size:38px;letter-spacing:-.02em;}
    h2{margin:0 0 10px 0;font-size:22px;}
    .muted{color:var(--muted);}
    .row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
    .right{margin-left:auto;}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
    .grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;}
    .section{margin-top:16px;padding-top:16px;border-top:1px solid var(--border);}
    .mini{font-size:12px;color:var(--muted);}
    .k{font-weight:900;}
    input, select, textarea{width:100%;padding:12px 12px;border:1px solid var(--border);border-radius:12px;font-size:14px;background:#fff;}
    textarea{min-height:90px;}
    label{font-weight:900;font-size:13px;}
    .box{border:1px solid var(--border);border-radius:16px;padding:14px;background:#fff;}
    .chk{display:flex;align-items:center;gap:10px;}
    .chk input{width:22px;height:22px;}
    .hr{height:1px;background:var(--border);margin:16px 0;}
  `;
}

function pageShell({ title, user, bodyHtml }) {
  const loggedIn = !!user;
  const rolePill = loggedIn ? `<span class="pill">${safeText(user.username)} • ${safeText(user.role)}</span>` : "";

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>${safeText(title)} • SpeedSkateMeet</title>
      <style>${css()}</style>
    </head>
    <body>
      <div class="wrap">
        <div class="topbar">
          <div class="brand">
            <div style="font-size:20px;">SpeedSkateMeet</div>
          </div>

          <div class="nav">
            <a class="btn" href="/">Home</a>
            <a class="btn" href="/meets">Find a Meet</a>
            <a class="btn" href="/rinks">Find a Rink</a>
            <a class="btn" href="/live">Live Race Day</a>
            ${
              loggedIn
                ? `<a class="btn primary" href="/portal">Portal</a><a class="btn" href="/logout">Logout</a>`
                : `<a class="btn primary" href="/login">Admin Login</a>`
            }
          </div>

          ${rolePill}
        </div>

        ${bodyHtml}

        <div class="mini" style="margin-top:18px;">
          Data file: ${safeText(DATA_FILE)}
        </div>
      </div>
    </body>
  </html>`;
}

// -------------------- MEET MODEL --------------------
function newMeet() {
  return {
    id: "meet_" + uid(6),
    meetName: "New Meet",
    date: "",
    trackLength: 100,
    lanes: 4,

    registrationOpen: true,
    registrationClosedAt: null,

    groups: buildMeetGroups(),

    skateAbilityBoxes: [
      { id: uid(6), enabled: false, label: "Box 1", manualAgeLabel: "Manual Age", cost: 0, distances: ["", "", "", ""] },
    ],

    timeTrialsConfig: { enabled: false, notes: "", judgesRequired: true },
    relayConfig: { enabled: false, notes: "" },

    blocks: [],

    registrants: [],
    nextCheckInNumber: 1,

    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function findMeet(meetId) {
  return (db.meets || []).find((m) => m.id === meetId) || null;
}
function fmtCheckIn(n) {
  return String(n).padStart(3, "0");
}

// -------------------- ROUTES --------------------
app.get("/", (req, res) => {
  const s = getSession(req);
  const body = `
    <div class="card">
      <h1>SpeedSkateMeet</h1>
      <div class="muted">USARS-style inline meet software • web-based • works on any device</div>

      <div class="section row">
        <a class="btn primary" href="/meets">Find a Meet</a>
        <a class="btn primary" href="/rinks">Find a Rink</a>
        <a class="btn" href="/live">Live Race Day</a>
        ${s ? `<a class="btn" href="/portal">Go to Portal</a>` : `<a class="btn" href="/login">Admin Login</a>`}
      </div>

      <div class="section mini">
        Adult ages locked: Classic 25–34 • Masters 35–44
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Home", user: s?.user, bodyHtml: body }));
});

// -------------------- LIVE (placeholder concept page) --------------------
app.get("/live", (req, res) => {
  const s = getSession(req);
  const body = `
    <div class="card">
      <h1>Live Race Day</h1>
      <div class="muted">This page will display “current race” and “on deck” once blocks + judges loop is wired.</div>
      <div class="section mini">TV idea: load this page on Apple TV / AirPlay for rink display. ✅</div>
    </div>
  `;
  res.send(pageShell({ title: "Live", user: s?.user, bodyHtml: body }));
});

// -------------------- RINKS (public list + director edit tools) --------------------
app.get("/rinks", (req, res) => {
  const s = getSession(req);
  const rinks = (db.rinks || []).slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const cards = rinks.map((r) => {
    const site = r.website
      ? `<a href="https://${safeText(r.website)}" target="_blank" rel="noreferrer">${safeText(r.website)}</a>`
      : "—";

    const directorTools = (s?.user?.role === "director")
      ? `
        <div class="section">
          <form method="POST" action="/rinks/update" class="grid2" style="margin:0;">
            <input type="hidden" name="id" value="${safeText(r.id)}"/>
            <div>
              <label>Name</label>
              <input name="name" value="${safeText(r.name || "")}"/>
            </div>
            <div>
              <label>Phone</label>
              <input name="phone" value="${safeText(r.phone || "")}"/>
            </div>
            <div>
              <label>City</label>
              <input name="city" value="${safeText(r.city || "")}"/>
            </div>
            <div>
              <label>State</label>
              <input name="state" value="${safeText(r.state || "")}"/>
            </div>
            <div>
              <label>Address</label>
              <input name="address" value="${safeText(r.address || "")}"/>
            </div>
            <div>
              <label>Website</label>
              <input name="website" value="${safeText(r.website || "")}"/>
            </div>
            <div style="grid-column:1/-1;">
              <label>Notes</label>
              <input name="notes" value="${safeText(r.notes || "")}"/>
            </div>
            <div class="row" style="grid-column:1/-1;">
              <button class="btn primary" type="submit">Save</button>
            </div>
          </form>

          <form method="POST" action="/rinks/delete" style="margin-top:10px;">
            <input type="hidden" name="id" value="${safeText(r.id)}"/>
            <button class="btn danger" type="submit">Delete Rink</button>
          </form>
        </div>
      `
      : "";

    return `
      <div class="card">
        <h2>${safeText(r.name)}</h2>
        <div><span class="k">Phone:</span> ${safeText(r.phone || "—")}</div>
        <div><span class="k">Address:</span> ${safeText(r.address || "—")}</div>
        <div><span class="k">City/State:</span> ${safeText(r.city || "—")}, ${safeText(r.state || "—")}</div>
        <div><span class="k">Website:</span> ${site}</div>
        ${directorTools}
      </div>
    `;
  }).join("");

  const addBox = (s?.user?.role === "director")
    ? `
      <div class="card">
        <h2>Add Rink</h2>
        <form method="POST" action="/rinks/add" class="grid2">
          <div><label>Name</label><input name="name" required></div>
          <div><label>Phone</label><input name="phone"></div>
          <div><label>City</label><input name="city"></div>
          <div><label>State</label><input name="state"></div>
          <div style="grid-column:1/-1;"><label>Address</label><input name="address"></div>
          <div style="grid-column:1/-1;"><label>Website</label><input name="website"></div>
          <div style="grid-column:1/-1;"><label>Notes</label><input name="notes"></div>
          <div class="row" style="grid-column:1/-1;">
            <button class="btn primary" type="submit">Add Rink</button>
          </div>
        </form>
      </div>
    `
    : "";

  res.send(pageShell({
    title: "Rinks",
    user: s?.user,
    bodyHtml: `<h1>Rinks</h1>${addBox}${cards || `<div class="card"><div class="muted">No rinks yet.</div></div>`}`,
  }));
});

app.post("/rinks/add", requireRole(["director"]), (req, res) => {
  db.rinks = db.rinks || [];
  db.rinks.push({
    id: "rink_" + uid(6),
    name: String(req.body.name || "").trim(),
    phone: String(req.body.phone || "").trim(),
    city: String(req.body.city || "").trim(),
    state: String(req.body.state || "").trim(),
    address: String(req.body.address || "").trim(),
    website: String(req.body.website || "").trim().replace(/^https?:\/\//, ""),
    notes: String(req.body.notes || "").trim(),
  });
  saveDb();
  res.redirect("/rinks");
});

app.post("/rinks/update", requireRole(["director"]), (req, res) => {
  const id = String(req.body.id || "");
  const r = (db.rinks || []).find((x) => x.id === id);
  if (!r) return res.redirect("/rinks");

  r.name = String(req.body.name || "").trim();
  r.phone = String(req.body.phone || "").trim();
  r.city = String(req.body.city || "").trim();
  r.state = String(req.body.state || "").trim();
  r.address = String(req.body.address || "").trim();
  r.website = String(req.body.website || "").trim().replace(/^https?:\/\//, "");
  r.notes = String(req.body.notes || "").trim();

  saveDb();
  res.redirect("/rinks");
});

app.post("/rinks/delete", requireRole(["director"]), (req, res) => {
  const id = String(req.body.id || "");
  db.rinks = (db.rinks || []).filter((x) => x.id !== id);
  saveDb();
  res.redirect("/rinks");
});

// -------------------- AUTH --------------------
app.get("/login", (req, res) => {
  const body = `
    <div class="card" style="max-width:640px;margin:24px auto;">
      <h1>Admin Login</h1>
      <div class="muted">Demo usernames:</div>
      <div class="mini" style="margin-top:8px;">
        Director: <b>Lbird22</b><br/>
        Judge: <b>JudgeLee</b><br/>
        Coach: <b>CoachLee</b><br/>
      </div>

      <form class="section" method="POST" action="/login">
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
        <div class="section">
          <button class="btn primary" type="submit">Login</button>
        </div>
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Login", user: null, bodyHtml: body }));
});

app.post("/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();

  const user = (db.users || []).find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.passHash !== passHash(password)) {
    const body = `
      <div class="card" style="max-width:640px;margin:24px auto;">
        <h1>Login failed</h1>
        <div class="muted">Incorrect username or password.</div>
        <div class="section"><a class="btn primary" href="/login">Try again</a></div>
      </div>
    `;
    return res.send(pageShell({ title: "Login failed", user: null, bodyHtml: body }));
  }

  const sid = uid(18);
  sessions.set(sid, { userId: user.id, exp: Date.now() + SESSION_TTL });
  setSessionCookie(res, sid);
  res.redirect("/portal");
});

app.get("/logout", (req, res) => {
  const cookies = parseCookies(req);
  const sid = cookies[SESSION_COOKIE];
  if (sid) sessions.delete(sid);
  clearSessionCookie(res);
  res.redirect("/");
});

// -------------------- MEETS LIST --------------------
app.get("/meets", (req, res) => {
  const s = getSession(req);
  const meets = (db.meets || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const cards = meets.map((m) => `
    <div class="card">
      <div class="row">
        <h2 style="margin:0;">${safeText(m.meetName)}</h2>
        <span class="pill">${safeText(m.date || "TBD")}</span>
        <span class="pill">Reg: ${m.registrationOpen ? "OPEN" : "CLOSED"}</span>
        <span class="right"></span>
      </div>
      <div class="section row">
        <a class="btn primary" href="/register/${encodeURIComponent(m.id)}">Register</a>
        <a class="btn" href="/live">Live</a>
        ${
          s?.user?.role === "director"
            ? `<a class="btn" href="/admin/meet/${encodeURIComponent(m.id)}">Meet Builder</a>
               <a class="btn" href="/admin/blocks/${encodeURIComponent(m.id)}">Block Builder</a>`
            : ""
        }
      </div>
    </div>
  `).join("");

  res.send(pageShell({
    title: "Meets",
    user: s?.user,
    bodyHtml: `
      <h1>Meets</h1>
      ${cards || `<div class="card"><div class="muted">No meets yet.</div></div>`}
    `
  }));
});

// -------------------- PORTAL --------------------
app.get("/portal", requireRole(["director", "judge", "coach"]), (req, res) => {
  const user = req.session.user;
  const meets = (db.meets || []).slice();

  const meetCards = meets.map((m) => `
    <div class="card">
      <div class="row">
        <h2 style="margin:0;">${safeText(m.meetName)}</h2>
        <span class="pill">${safeText(m.date || "TBD")}</span>
        <span class="pill">Regs: ${safeText(String((m.registrants || []).length))}</span>
        <span class="right"></span>
      </div>
      <div class="section row">
        <a class="btn primary" href="/admin/meet/${encodeURIComponent(m.id)}">Meet Builder</a>
        <a class="btn" href="/admin/blocks/${encodeURIComponent(m.id)}">Block Builder</a>
        <a class="btn" href="/register/${encodeURIComponent(m.id)}">Registration Page</a>
      </div>
    </div>
  `).join("");

  const buildButton = (user.role === "director")
    ? `
      <form class="section" method="POST" action="/admin/meet/new">
        <button class="btn primary" type="submit">Build New Meet</button>
      </form>
    `
    : "";

  res.send(pageShell({
    title: "Portal",
    user,
    bodyHtml: `
      <div class="card">
        <h1>${safeText(user.role[0].toUpperCase() + user.role.slice(1))} Portal</h1>
        <div class="muted">Logged in as ${safeText(user.username)}.</div>
        ${buildButton}
      </div>

      <h2 style="margin-top:10px;">Meets</h2>
      ${meetCards || `<div class="card"><div class="muted">No meets yet — build one first.</div></div>`}
    `
  }));
});

app.post("/admin/meet/new", requireRole(["director"]), (req, res) => {
  db.meets = db.meets || [];
  const m = newMeet();
  db.meets.unshift(m);
  saveDb();
  res.redirect(`/admin/meet/${encodeURIComponent(m.id)}`);
});

// -------------------- MEET BUILDER --------------------
app.get("/admin/meet/:meetId", requireRole(["director"]), (req, res) => {
  const user = req.session.user;
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  // render groups (full list)
  const groupsHtml = (meet.groups || []).map((g) => {
    const divKeys = ["novice", "elite", "open"];
    const entries = divKeys.map((k) => {
      const d = g.divisions?.[k] || { enabled: false, cost: 0, distances: ["", "", "", ""] };

      return `
        <div class="box" style="margin:10px 0;">
          <div class="row">
            <div class="chk">
              <input type="checkbox" name="${g.id}.${k}.enabled" ${d.enabled ? "checked" : ""}/>
              <div class="k">${safeText(k.toUpperCase())}</div>
            </div>
            <div class="right" style="min-width:220px;">
              <label>Cost</label>
              <input name="${g.id}.${k}.cost" value="${safeText(String(d.cost ?? 0))}"/>
            </div>
          </div>

          <div class="section grid4">
            <div><label>D1</label><input name="${g.id}.${k}.d1" value="${safeText(d.distances?.[0] || "")}"/></div>
            <div><label>D2</label><input name="${g.id}.${k}.d2" value="${safeText(d.distances?.[1] || "")}"/></div>
            <div><label>D3</label><input name="${g.id}.${k}.d3" value="${safeText(d.distances?.[2] || "")}"/></div>
            <div><label>D4</label><input name="${g.id}.${k}.d4" value="${safeText(d.distances?.[3] || "")}"/></div>
          </div>

          <div class="mini">Plain inputs (no dropdowns).</div>
        </div>
      `;
    }).join("");

    return `
      <div class="card">
        <div class="row">
          <h2 style="margin:0;">${safeText(g.label)}</h2>
          <span class="pill">${safeText(g.ages)}</span>
        </div>
        <div class="section">${entries}</div>
      </div>
    `;
  }).join("");

  const saBoxes = (meet.skateAbilityBoxes || []).map((b, idx) => `
    <div class="box" style="margin:10px 0;">
      <div class="row">
        <div class="k">SkateAbility</div>
        <span class="pill">${safeText(b.label || `Box ${idx + 1}`)}</span>
        <span class="right"></span>
        <button class="btn danger" type="submit" name="remove_sa" value="${safeText(b.id)}">Remove</button>
      </div>

      <div class="section grid3">
        <div class="chk">
          <input type="checkbox" name="sa_${b.id}_enabled" ${b.enabled ? "checked" : ""}/>
          <div class="k">Enable</div>
        </div>
        <div>
          <label>Manual Age Label</label>
          <input name="sa_${b.id}_manualAgeLabel" value="${safeText(b.manualAgeLabel || "Manual Age")}"/>
        </div>
        <div>
          <label>Cost</label>
          <input name="sa_${b.id}_cost" value="${safeText(String(b.cost ?? 0))}"/>
        </div>
      </div>

      <div class="section grid4">
        <div><label>D1</label><input name="sa_${b.id}_d1" value="${safeText(b.distances?.[0] || "")}"/></div>
        <div><label>D2</label><input name="sa_${b.id}_d2" value="${safeText(b.distances?.[1] || "")}"/></div>
        <div><label>D3</label><input name="sa_${b.id}_d3" value="${safeText(b.distances?.[2] || "")}"/></div>
        <div><label>D4</label><input name="sa_${b.id}_d4" value="${safeText(b.distances?.[3] || "")}"/></div>
      </div>
    </div>
  `).join("");

  const tt = meet.timeTrialsConfig || { enabled: false, judgesRequired: true, notes: "" };
  const relay = meet.relayConfig || { enabled: false, notes: "" };

  res.send(pageShell({
    title: "Meet Builder",
    user,
    bodyHtml: `
      <div class="card">
        <h1>Meet Builder</h1>
        <div class="muted">${safeText(meet.meetName)} • Meet #${safeText(meet.id)}</div>

        <form class="section" method="POST" action="/admin/meet/${encodeURIComponent(meet.id)}/save">
          <div class="grid2">
            <div>
              <label>Meet Name</label>
              <input name="meetName" value="${safeText(meet.meetName)}"/>
            </div>
            <div>
              <label>Date</label>
              <input type="date" name="date" value="${safeText(meet.date || "")}"/>
            </div>
          </div>

          <div class="section grid2">
            <div>
              <label>Track Length (m)</label>
              <input name="trackLength" value="${safeText(String(meet.trackLength || 100))}"/>
            </div>
            <div>
              <label>Lanes per Heat</label>
              <input name="lanes" value="${safeText(String(meet.lanes || 4))}"/>
            </div>
          </div>

          <div class="section">
            <h2>SkateAbility</h2>
            <div class="muted">Meet-wide. No novice/elite/open. Manual age label. Add multiple boxes.</div>
            ${saBoxes}
            <div class="section">
              <button class="btn" type="submit" name="add_sa" value="1">Add another SkateAbility box</button>
            </div>
          </div>

          <div class="section">
            <h2>Time Trials</h2>
            <div class="muted">Meet-wide flag (not per-division).</div>
            <div class="grid2">
              <div class="chk">
                <input type="checkbox" name="tt_enabled" ${tt.enabled ? "checked" : ""}/>
                <div class="k">Enable Time Trials</div>
              </div>
              <div class="chk">
                <input type="checkbox" name="tt_judgesRequired" ${tt.judgesRequired ? "checked" : ""}/>
                <div class="k">Judges panel required</div>
              </div>
            </div>
            <div class="section">
              <label>Notes</label>
              <textarea name="tt_notes">${safeText(tt.notes || "")}</textarea>
            </div>
          </div>

          <div class="section">
            <h2>Relays</h2>
            <div class="muted">Meet-wide relay flag + notes (relay builder UI comes next).</div>
            <div class="chk">
              <input type="checkbox" name="relay_enabled" ${relay.enabled ? "checked" : ""}/>
              <div class="k">Enable Relays</div>
            </div>
            <div class="section">
              <label>Notes</label>
              <textarea name="relay_notes">${safeText(relay.notes || "")}</textarea>
            </div>
          </div>

          <div class="section">
            <h2>Age Divisions</h2>
            <div class="muted">Costs + D1–D4 per classification.</div>
          </div>

          ${groupsHtml}

          <div class="section row">
            <button class="btn primary" type="submit" name="save" value="1">Save Meet</button>
            <a class="btn" href="/admin/blocks/${encodeURIComponent(meet.id)}">Block Builder</a>
            <a class="btn" href="/register/${encodeURIComponent(meet.id)}">Registration Page</a>
            <a class="btn" href="/portal">Back to Portal</a>
          </div>
        </form>
      </div>
    `
  }));
});

app.post("/admin/meet/:meetId/save", requireRole(["director"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  // SkateAbility remove/add actions first
  if (req.body.remove_sa) {
    const id = String(req.body.remove_sa);
    meet.skateAbilityBoxes = (meet.skateAbilityBoxes || []).filter((b) => b.id !== id);
    if (meet.skateAbilityBoxes.length === 0) {
      meet.skateAbilityBoxes.push({ id: uid(6), enabled: false, label: "Box 1", manualAgeLabel: "Manual Age", cost: 0, distances: ["", "", "", ""] });
    }
    meet.updatedAt = nowIso();
    saveDb();
    return res.redirect(`/admin/meet/${encodeURIComponent(meet.id)}`);
  }
  if (req.body.add_sa) {
    const n = (meet.skateAbilityBoxes || []).length + 1;
    meet.skateAbilityBoxes = meet.skateAbilityBoxes || [];
    meet.skateAbilityBoxes.push({ id: uid(6), enabled: false, label: `Box ${n}`, manualAgeLabel: "Manual Age", cost: 0, distances: ["", "", "", ""] });
    meet.updatedAt = nowIso();
    saveDb();
    return res.redirect(`/admin/meet/${encodeURIComponent(meet.id)}`);
  }

  meet.meetName = String(req.body.meetName || meet.meetName || "New Meet").trim().slice(0, 90);
  meet.date = String(req.body.date || "").trim();
  meet.trackLength = Number(req.body.trackLength || meet.trackLength || 100);
  meet.lanes = Number(req.body.lanes || meet.lanes || 4);

  // divisions
  for (const g of (meet.groups || [])) {
    g.divisions = g.divisions || {};
    for (const key of ["novice", "elite", "open"]) {
      const enabled = req.body[`${g.id}.${key}.enabled`] === "on";
      const costRaw = req.body[`${g.id}.${key}.cost`];
      const cost = Number.isFinite(Number(costRaw)) ? Number(costRaw) : 0;
      const d1 = String(req.body[`${g.id}.${key}.d1`] || "");
      const d2 = String(req.body[`${g.id}.${key}.d2`] || "");
      const d3 = String(req.body[`${g.id}.${key}.d3`] || "");
      const d4 = String(req.body[`${g.id}.${key}.d4`] || "");
      g.divisions[key] = { enabled, cost, distances: [d1, d2, d3, d4] };
    }
  }

  // SkateAbility boxes
  meet.skateAbilityBoxes = meet.skateAbilityBoxes || [];
  for (const b of meet.skateAbilityBoxes) {
    b.enabled = req.body[`sa_${b.id}_enabled`] === "on";
    b.manualAgeLabel = String(req.body[`sa_${b.id}_manualAgeLabel`] || "Manual Age").slice(0, 60);
    const costRaw = req.body[`sa_${b.id}_cost`];
    b.cost = Number.isFinite(Number(costRaw)) ? Number(costRaw) : 0;
    b.distances = [
      String(req.body[`sa_${b.id}_d1`] || ""),
      String(req.body[`sa_${b.id}_d2`] || ""),
      String(req.body[`sa_${b.id}_d3`] || ""),
      String(req.body[`sa_${b.id}_d4`] || ""),
    ];
  }

  // Time Trials config
  meet.timeTrialsConfig = meet.timeTrialsConfig || { enabled: false, notes: "", judgesRequired: true };
  meet.timeTrialsConfig.enabled = req.body.tt_enabled === "on";
  meet.timeTrialsConfig.judgesRequired = req.body.tt_judgesRequired === "on";
  meet.timeTrialsConfig.notes = String(req.body.tt_notes || "").slice(0, 2000);

  // Relays config
  meet.relayConfig = meet.relayConfig || { enabled: false, notes: "" };
  meet.relayConfig.enabled = req.body.relay_enabled === "on";
  meet.relayConfig.notes = String(req.body.relay_notes || "").slice(0, 2000);

  meet.updatedAt = nowIso();
  saveDb();
  res.redirect(`/admin/meet/${encodeURIComponent(meet.id)}`);
});

// -------------------- BLOCK BUILDER (saved in meet) --------------------
app.get("/admin/blocks/:meetId", requireRole(["director"]), (req, res) => {
  const user = req.session.user;
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const blocks = (meet.blocks || []).slice();

  const blocksHtml = blocks.map((b) => `
    <div class="box" style="margin:10px 0;">
      <div class="row">
        <div class="k">${safeText(b.name)}</div>
        <span class="pill">${safeText(b.day || "Day 1")}</span>
        <span class="pill">Items: ${safeText(String((b.items || []).length))}</span>
        <span class="right"></span>
        <form method="POST" action="/admin/blocks/${encodeURIComponent(meet.id)}/delete" style="margin:0;">
          <input type="hidden" name="blockId" value="${safeText(b.id)}"/>
          <button class="btn danger" type="submit">Delete</button>
        </form>
      </div>
    </div>
  `).join("");

  res.send(pageShell({
    title: "Block Builder",
    user,
    bodyHtml: `
      <div class="card">
        <h1>Block Builder</h1>
        <div class="muted">${safeText(meet.meetName)} • Blocks are saved inside this meet</div>

        <form class="section" method="POST" action="/admin/blocks/${encodeURIComponent(meet.id)}/add">
          <div class="grid2">
            <div>
              <label>Day</label>
              <select name="day">
                <option>Day 1</option>
                <option>Day 2</option>
                <option>Day 3</option>
              </select>
            </div>
            <div>
              <label>Block Name</label>
              <input name="name" placeholder="Example: Tiny Tot / Primary" required />
            </div>
          </div>
          <div class="section row">
            <button class="btn primary" type="submit">Add Block</button>
            <a class="btn" href="/admin/meet/${encodeURIComponent(meet.id)}">Back to Meet Builder</a>
            <a class="btn" href="/portal">Back to Portal</a>
          </div>
        </form>

        <div class="section">
          ${blocksHtml || `<div class="muted">No blocks yet.</div>`}
        </div>
      </div>
    `
  }));
});

app.post("/admin/blocks/:meetId/add", requireRole(["director"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  meet.blocks = meet.blocks || [];
  meet.blocks.push({
    id: "blk_" + uid(6),
    day: String(req.body.day || "Day 1"),
    name: String(req.body.name || "Block").slice(0, 70),
    items: [],
    createdAt: nowIso(),
  });
  meet.updatedAt = nowIso();
  saveDb();
  res.redirect(`/admin/blocks/${encodeURIComponent(meet.id)}`);
});

app.post("/admin/blocks/:meetId/delete", requireRole(["director"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const blockId = String(req.body.blockId || "");
  meet.blocks = (meet.blocks || []).filter((b) => b.id !== blockId);
  meet.updatedAt = nowIso();
  saveDb();
  res.redirect(`/admin/blocks/${encodeURIComponent(meet.id)}`);
});

// -------------------- REGISTRATION (public) --------------------
app.get("/register/:meetId", (req, res) => {
  const s = getSession(req);
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const teamOptions = (db.teamList || TEAM_LIST).map((t) => `<option value="${safeText(t)}">${safeText(t)}</option>`).join("");

  const body = `
    <div class="card">
      <h1>Register</h1>
      <div class="muted">${safeText(meet.meetName)} • ${safeText(meet.date || "TBD")}</div>

      ${meet.registrationOpen ? `
      <form class="section" method="POST" action="/register/${encodeURIComponent(meet.id)}/submit">
        <div class="grid2">
          <div><label>First Name</label><input name="first" required /></div>
          <div><label>Last Name</label><input name="last" required /></div>
        </div>

        <div class="section grid2">
          <div>
            <label>Team</label>
            <select name="team" required>
              ${teamOptions}
            </select>
          </div>
          <div>
            <label>USARS Number (optional)</label>
            <input name="usars" />
          </div>
        </div>

        <div class="section grid2">
          <div>
            <label>Age</label>
            <input name="age" placeholder="ex: 12" required />
          </div>
          <div>
            <label>Options</label>
            <div class="box">
              <div class="chk"><input type="checkbox" name="challengeUp" /> <div><b>Challenge Up</b></div></div>
              <div class="chk"><input type="checkbox" name="novice" /> <div><b>Novice</b></div></div>
              <div class="chk"><input type="checkbox" name="elite" /> <div><b>Elite</b></div></div>
              <div class="chk"><input type="checkbox" name="open" /> <div><b>Open</b></div></div>
              <div class="chk"><input type="checkbox" name="timeTrials" /> <div><b>Time Trials</b></div></div>
              <div class="chk"><input type="checkbox" name="relays" /> <div><b>Relays</b></div></div>
            </div>
          </div>
        </div>

        <div class="section row">
          <button class="btn primary" type="submit">Register</button>
          <a class="btn" href="/meets">Back to Meets</a>
        </div>

        <div class="mini section">This assigns your check-in / skater number.</div>
      </form>
      ` : `
        <div class="section muted">Registration is currently closed.</div>
      `}
    </div>
  `;
  res.send(pageShell({ title: "Register", user: s?.user, bodyHtml: body }));
});

app.post("/register/:meetId/submit", (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!meet.registrationOpen) return res.status(403).send("Registration closed");

  const ageNum = Number(req.body.age);
  const age = Number.isFinite(ageNum) ? ageNum : null;

  const checkInNumber = meet.nextCheckInNumber || 1;
  meet.nextCheckInNumber = checkInNumber + 1;

  meet.registrants = meet.registrants || [];
  meet.registrants.push({
    id: "reg_" + uid(6),
    checkInNumber,
    createdAt: nowIso(),
    first: String(req.body.first || "").trim().slice(0, 40),
    last: String(req.body.last || "").trim().slice(0, 40),
    team: String(req.body.team || "Independent").trim().slice(0, 80),
    usars: String(req.body.usars || "").trim().slice(0, 40),
    age,
    flags: {
      challengeUp: req.body.challengeUp === "on",
      novice: req.body.novice === "on",
      elite: req.body.elite === "on",
      open: req.body.open === "on",
      timeTrials: req.body.timeTrials === "on",
      relays: req.body.relays === "on",
    },
  });

  meet.updatedAt = nowIso();
  saveDb();

  // simple confirmation
  const body = `
    <div class="card">
      <h1>Registered!</h1>
      <div class="muted">${safeText(meet.meetName)}</div>
      <div class="section">
        <div class="k">Your Check-In / Skater Number:</div>
        <div style="font-size:42px;font-weight:900;margin-top:6px;">#${safeText(fmtCheckIn(checkInNumber))}</div>
      </div>
      <div class="section row">
        <a class="btn primary" href="/register/${encodeURIComponent(meet.id)}">Register another</a>
        <a class="btn" href="/meets">Back to Meets</a>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Registered", user: null, bodyHtml: body }));
});

// -------------------- SAFETY ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Internal Server Error");
});

// -------------------- START --------------------
app.listen(PORT, HOST, () => {
  console.log(`
========================================================
SpeedSkateMeet | CLEAN REBUILD v${DATA_VERSION}
Data: ${DATA_FILE}

Rinks default:
- Roller City (Wichita, KS)

Meets:
- No default meet created. Build from Portal (Director).

Listening on ${HOST}:${PORT}
========================================================
`.trim());
});