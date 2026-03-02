// ============================================================
// SpeedSkateMeet – CLEAN REBUILD v7 – March 2026
// Single-file Node.js + Express • JSON persistence
//
// v7 CHANGES (from our notes):
// ✅ Remove distance dropdowns (D1–D4 are plain inputs)
// ✅ Time Trials is a checkbox per division+classification
// ✅ Add Meet-wide Time Trials config box (distances/format/timing)
// ✅ Registration: input Age + checkboxes (challenge up, novice/elite/open, TT, relays)
// ✅ Saved Meets (Templates): Save Meet As + Load Saved Meet (auto-populate)
// ✅ Block Builder saves inside meet object
// ✅ Fix Rinks: use Roller City Wichita (no fake Wichita Skate Center)
//
// ============================================================

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// -------------------- CONFIG --------------------
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "ssm_db.json");

// -------------------- UTIL --------------------
function uid(prefix = "") {
  return prefix + crypto.randomBytes(8).toString("hex");
}

function safeText(x) {
  return String(x ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

function parseIntSafe(v, fallback = null) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function nowISO() {
  return new Date().toISOString();
}

// -------------------- DB --------------------
function defaultDb() {
  return {
    version: 7,
    users: [
      { id: "u_director", username: "Lbird22", password: "Redline22", role: "director" },
      { id: "u_judge", username: "JudgeLee", password: "Redline22", role: "judge" },
      { id: "u_coach", username: "CoachLee", password: "Redline22", role: "coach" },
    ],
    sessions: {},

    // Rinks (fixed Wichita rink)
    rinks: [
      {
        id: "rink_roller_city_wichita",
        name: "Roller City",
        city: "Wichita, KS",
        phone: "316-942-4555",
        address: "3234 S. Meridian Ave Wichita, KS 67217",
        website: "rollercitywichitaks.com",
        team: "",
      },
    ],

    meets: [], // active meets
    meetTemplates: [], // saved meets (templates)
  };
}

function loadDb() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const db = defaultDb();
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
      return db;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const db = JSON.parse(raw);

    // Minimal migration safety
    if (!db.version || db.version < 7) {
      db.version = 7;
      db.meetTemplates = db.meetTemplates || [];
      db.rinks = Array.isArray(db.rinks) ? db.rinks : [];
      if (!db.rinks.find((r) => (r.name || "").toLowerCase().includes("roller city"))) {
        db.rinks.push({
          id: "rink_roller_city_wichita",
          name: "Roller City",
          city: "Wichita, KS",
          phone: "316-942-4555",
          address: "3234 S. Meridian Ave Wichita, KS 67217",
          website: "rollercitywichitaks.com",
          team: "",
        });
      }
      // Remove fake Wichita Skate Center if present
      db.rinks = db.rinks.filter((r) => (r.name || "").toLowerCase() !== "wichita skate center");
      saveDb(db);
    }
    return db;
  } catch (e) {
    console.error("DB load error:", e);
    const db = defaultDb();
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch {}
    return db;
  }
}

function saveDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

let db = loadDb();

// -------------------- AUTH --------------------
function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  db.sessions[token] = { userId, createdAt: nowISO() };
  saveDb(db);
  return token;
}

function getSession(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/ssm_session=([a-f0-9]+)/);
  if (!m) return null;
  const token = m[1];
  const sess = db.sessions[token];
  if (!sess) return null;
  const user = db.users.find((u) => u.id === sess.userId);
  if (!user) return null;
  return { token, user };
}

function requireRole(role) {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) return res.redirect("/login");
    if (role && s.user.role !== role) return res.status(403).send("Forbidden");
    req.session = s;
    next();
  };
}

// -------------------- UI SHELL --------------------
function css() {
  return `
:root{
  --bg:#f6f7fb; --card:#fff; --ink:#111827; --muted:#6b7280;
  --line:#e5e7eb; --blue:#2563eb; --blue2:#1d4ed8; --green:#16a34a; --red:#dc2626;
  --radius:18px;
}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; background:var(--bg); color:var(--ink);}
a{color:inherit;text-decoration:none}
.container{max-width:1100px;margin:0 auto;padding:22px;}
.topbar{
  position:sticky; top:0; z-index:10;
  background:rgba(246,247,251,.85); backdrop-filter:saturate(1.2) blur(10px);
  border-bottom:1px solid var(--line);
}
.brand{
  display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 0;
}
.brand img{height:56px; max-width:92vw; object-fit:contain;}
.brand h1{font-size:34px; margin:0; letter-spacing:-.02em;}
.nav{
  display:flex; gap:10px; flex-wrap:wrap; justify-content:center; padding-bottom:14px;
}
.btn{
  display:inline-flex; align-items:center; justify-content:center;
  padding:10px 14px; border-radius:14px; border:2px solid var(--blue);
  font-weight:700; background:#fff; color:var(--blue);
}
.btn.primary{background:var(--blue); color:#fff;}
.btn.green{border-color:var(--green); color:#fff; background:var(--green);}
.btn.red{border-color:var(--red); color:#fff; background:var(--red);}
.card{
  background:var(--card); border:1px solid var(--line); border-radius:var(--radius);
  padding:18px; box-shadow:0 10px 30px rgba(17,24,39,.06);
}
.grid{display:grid; gap:16px;}
.grid.two{grid-template-columns:repeat(2,minmax(0,1fr));}
@media (max-width:900px){.grid.two{grid-template-columns:1fr;}}
h2{margin:0 0 10px 0; font-size:26px; letter-spacing:-.02em;}
h3{margin:18px 0 10px 0; font-size:20px;}
label{display:block; font-weight:700; margin:10px 0 6px;}
input[type="text"], input[type="number"], select, textarea{
  width:100%; padding:10px 12px; border-radius:12px; border:1px solid var(--line);
  outline:none; font-size:15px; background:#fff;
}
.row{display:flex; gap:12px; flex-wrap:wrap;}
.row > *{flex:1 1 220px;}
.muted{color:var(--muted); font-size:14px; line-height:1.4;}
.pill{
  display:inline-flex; align-items:center; gap:8px;
  padding:6px 10px; border-radius:999px; background:#eef2ff; color:#1e3a8a;
  font-weight:800; font-size:13px;
}
.hr{height:1px;background:var(--line); margin:14px 0;}
.kbd{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;background:#111827;color:#fff;border-radius:10px;padding:2px 8px;font-size:12px;}
.checkbox{display:flex; align-items:center; gap:10px; padding:10px 0;}
.checkbox input{width:22px;height:22px;}
.small{font-size:12px;color:var(--muted);}
.table{width:100%; border-collapse:collapse;}
.table td,.table th{padding:10px;border-bottom:1px solid var(--line);text-align:left;}
.right{display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap;}
.notice{background:#fef9c3;border:1px solid #fde68a;color:#92400e;border-radius:14px;padding:12px;font-weight:700;}
  `;
}

function pageShell({ title, user, bodyHtml }) {
  const logoDataUri = ""; // If you want the logo embedded, we can do it next. For now: add a /public route or use a hosted image.
  const nav = `
    <div class="topbar">
      <div class="container">
        <div class="brand">
          ${logoDataUri ? `<img src="${logoDataUri}" alt="SpeedSkateMeet logo">` : `<h1>SpeedSkateMeet</h1>`}
        </div>
        <div class="nav">
          <a class="btn" href="/">Home</a>
          <a class="btn" href="/meets">Find a Meet</a>
          <a class="btn" href="/rinks">Find a Rink</a>
          <a class="btn" href="/live">Live Race Day</a>
          ${user ? `<a class="btn primary" href="/portal">Portal</a><a class="btn" href="/logout">Logout</a>` : `<a class="btn primary" href="/login">Admin Login</a>`}
        </div>
      </div>
    </div>
  `;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeText(title)}</title>
  <style>${css()}</style>
</head>
<body>
${nav}
<div class="container">
  ${bodyHtml}
</div>
</body>
</html>`;
}

// -------------------- DOMAIN HELPERS --------------------
function defaultAgeDivisions() {
  // Keep it simple; you can edit these in meet builder later if desired.
  return [
    { key: "tiny_tot_girls", label: "Tiny Tot Girls", minAge: 0, maxAge: 5, gender: "girls" },
    { key: "tiny_tot_boys", label: "Tiny Tot Boys", minAge: 0, maxAge: 5, gender: "boys" },
    { key: "primary_girls", label: "Primary Girls", minAge: 6, maxAge: 7, gender: "girls" },
    { key: "primary_boys", label: "Primary Boys", minAge: 6, maxAge: 7, gender: "boys" },
    { key: "juvenile_girls", label: "Juvenile Girls", minAge: 8, maxAge: 9, gender: "girls" },
    { key: "juvenile_boys", label: "Juvenile Boys", minAge: 8, maxAge: 9, gender: "boys" },
    { key: "junior_girls", label: "Junior Girls", minAge: 10, maxAge: 11, gender: "girls" },
    { key: "junior_boys", label: "Junior Boys", minAge: 10, maxAge: 11, gender: "boys" },
    { key: "cadet_girls", label: "Cadet Girls", minAge: 12, maxAge: 13, gender: "girls" },
    { key: "cadet_boys", label: "Cadet Boys", minAge: 12, maxAge: 13, gender: "boys" },
    { key: "youth_women", label: "Youth Women", minAge: 14, maxAge: 18, gender: "women" },
    { key: "youth_men", label: "Youth Men", minAge: 14, maxAge: 18, gender: "men" },

    // Adults
    { key: "adult_women", label: "Adult Women", minAge: 19, maxAge: 24, gender: "women" },
    { key: "adult_men", label: "Adult Men", minAge: 19, maxAge: 24, gender: "men" },

    // Locked ages per your rules
    { key: "classic_women", label: "Classic Women", minAge: 25, maxAge: 34, gender: "women", locked: true },
    { key: "classic_men", label: "Classic Men", minAge: 25, maxAge: 34, gender: "men", locked: true },
    { key: "masters_women", label: "Masters Women", minAge: 35, maxAge: 44, gender: "women", locked: true },
    { key: "masters_men", label: "Masters Men", minAge: 35, maxAge: 44, gender: "men", locked: true },

    // 45+ buckets (editable later)
    { key: "esquire_women", label: "Esquire Women", minAge: 45, maxAge: 64, gender: "women" },
    { key: "esquire_men", label: "Esquire Men", minAge: 45, maxAge: 64, gender: "men" },
    { key: "senior_women", label: "Senior Women", minAge: 65, maxAge: 120, gender: "women" },
    { key: "senior_men", label: "Senior Men", minAge: 65, maxAge: 120, gender: "men" },
  ];
}

function newMeet() {
  return {
    id: uid("meet_"),
    name: "New Meet",
    date: "TBD",
    status: "registration_open", // registration_open | locked
    createdAt: nowISO(),
    updatedAt: nowISO(),

    // Meet Builder config:
    ageDivisions: defaultAgeDivisions(),

    classifications: [
      { key: "novice", label: "Novice" },
      { key: "elite", label: "Elite" },
      { key: "open", label: "Open" },
    ],

    // Distances per division+classification (plain inputs D1–D4)
    // structure: distances[divisionKey][classKey] = { enabled, cost, d1,d2,d3,d4, timeTrials }
    distances: {},

    // Meet-wide Time Trials config:
    timeTrials: {
      enabled: false, // if meet has any TT checked, we also flip this on
      distancesCsv: "1 lap, 2 laps, 3 laps",
      format: "solo", // solo | paired
      timing: "manual", // manual | electronic
      notes: "",
    },

    // Relays meet-wide config (light placeholder):
    relays: {
      enabled: false,
      notes: "",
    },

    // Block Builder saved as part of meet:
    blocks: [],

    // Registrants:
    registrants: [],

    // Custom races placeholder:
    customRaces: [],
  };
}

function ensureMeetDistanceRow(meet, divisionKey, classKey) {
  if (!meet.distances[divisionKey]) meet.distances[divisionKey] = {};
  if (!meet.distances[divisionKey][classKey]) {
    meet.distances[divisionKey][classKey] = {
      enabled: false,
      cost: 0,
      d1: "",
      d2: "",
      d3: "",
      d4: "",
      timeTrials: false,
    };
  }
  return meet.distances[divisionKey][classKey];
}

function findDivisionForAge(meet, age) {
  if (!Number.isFinite(age)) return null;
  return meet.ageDivisions.find((d) => age >= d.minAge && age <= d.maxAge) || null;
}

// -------------------- ROUTES --------------------
app.get("/", (req, res) => {
  const s = getSession(req);
  const body = `
    <div class="card">
      <h2>SpeedSkateMeet</h2>
      <p class="muted">
        Built by the speed skating community, for the speed skating community.
        USARS-style inline meet software • web-based • works on any device
      </p>
      <div class="hr"></div>
      <div class="right">
        <a class="btn" href="/meets">Find a Meet</a>
        <a class="btn" href="/rinks">Find a Rink</a>
        <a class="btn green" href="/live">Live Race Day</a>
        ${s ? `<a class="btn primary" href="/portal">Portal</a>` : `<a class="btn primary" href="/login">Admin Login</a>`}
      </div>
      <div class="hr"></div>
      <div class="muted">
        <div>Data persists to <span class="kbd">${safeText(DATA_FILE)}</span></div>
        <div>Adult ages locked: <b>Classic 25–34</b> • <b>Masters 35–44</b></div>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Home", user: s?.user, bodyHtml: body }));
});

app.get("/login", (req, res) => {
  const body = `
    <div class="grid two">
      <div class="card">
        <h2>Admin Login</h2>
        <form method="POST" action="/login">
          <label>Username</label>
          <input name="username" type="text" autocomplete="username" required>
          <label>Password</label>
          <input name="password" type="password" autocomplete="current-password" required>
          <div class="hr"></div>
          <button class="btn primary" type="submit">Login</button>
        </form>
        <div class="hr"></div>
        <div class="muted">
          <b>Demo usernames:</b><br>
          Director: Lbird22<br>
          Judge: JudgeLee<br>
          Coach: CoachLee<br>
          <span class="small">Passwords are never displayed on public pages.</span>
        </div>
      </div>
      <div class="card">
        <h2>What’s inside</h2>
        <ul class="muted">
          <li>Meet Builder with Time Trials per division/classification</li>
          <li>Registration: age + checkboxes (challenge up, classifications, TT, relays)</li>
          <li>Saved Meet Templates: save/load and auto-populate</li>
          <li>Blocks saved within the meet</li>
        </ul>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Login", user: null, bodyHtml: body }));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = db.users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.send(pageShell({
      title: "Login",
      user: null,
      bodyHtml: `<div class="card"><h2>Login failed</h2><p class="muted">Wrong username or password.</p><a class="btn" href="/login">Try again</a></div>`
    }));
  }
  const token = createSession(user.id);
  res.setHeader("Set-Cookie", `ssm_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
  res.redirect("/portal");
});

app.get("/logout", (req, res) => {
  const s = getSession(req);
  if (s) {
    delete db.sessions[s.token];
    saveDb(db);
  }
  res.setHeader("Set-Cookie", `ssm_session=; Path=/; Max-Age=0`);
  res.redirect("/");
});

app.get("/portal", requireRole(null), (req, res) => {
  const u = req.session.user;

  // Create meet button for director only
  const canCreate = u.role === "director";

  const meetCards = db.meets
    .map((m) => {
      const regs = m.registrants?.length || 0;
      const blocks = m.blocks?.length || 0;
      const ttEnabled = Object.values(m.distances || {}).some((div) =>
        Object.values(div || {}).some((row) => row?.timeTrials)
      );
      return `
        <div class="card">
          <div class="row">
            <div>
              <div class="pill">${safeText(m.name)} <span class="small">(${safeText(m.id)})</span></div>
              <div class="muted" style="margin-top:8px;">
                Date: <b>${safeText(m.date)}</b> • Regs: <b>${regs}</b> • Blocks: <b>${blocks}</b> • Time Trials: <b>${ttEnabled ? "Yes" : "No"}</b>
              </div>
            </div>
            <div class="right">
              <a class="btn primary" href="/meet/${m.id}/builder">Meet Builder</a>
              <a class="btn" href="/meet/${m.id}/blocks">Block Builder</a>
              <a class="btn" href="/meet/${m.id}/register">Registration</a>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const body = `
    <div class="card">
      <h2>Director Dashboard</h2>
      <div class="muted">Logged in as <b>${safeText(u.username)}</b> (${safeText(u.role)})</div>
      <div class="hr"></div>
      ${canCreate ? `
        <form method="POST" action="/meets/create" class="right">
          <button class="btn primary" type="submit">Build New Meet</button>
        </form>
        <div class="hr"></div>
      ` : `<div class="notice">Your role is <b>${safeText(u.role)}</b>. Only directors can create meets.</div><div class="hr"></div>`}
      <div class="grid" style="gap:14px;">
        ${meetCards || `<div class="muted">No meets yet.</div>`}
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Portal", user: u, bodyHtml: body }));
});

app.get("/meets", (req, res) => {
  const items = db.meets.map((m) => `
    <tr>
      <td><b>${safeText(m.name)}</b></td>
      <td>${safeText(m.date)}</td>
      <td><a class="btn" href="/meet/${m.id}/register">Register</a></td>
    </tr>
  `).join("");

  const body = `
    <div class="card">
      <h2>Meets</h2>
      <table class="table">
        <thead><tr><th>Meet</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${items || `<tr><td colspan="3" class="muted">No meets published yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  res.send(pageShell({ title: "Find a Meet", user: getSession(req)?.user, bodyHtml: body }));
});

app.post("/meets/create", requireRole("director"), (req, res) => {
  const meet = newMeet();
  db.meets.unshift(meet);
  saveDb(db);
  res.redirect(`/meet/${meet.id}/builder`);
});

// -------------------- MEET BUILDER --------------------
app.get("/meet/:meetId/builder", requireRole(null), (req, res) => {
  const { meetId } = req.params;
  const meet = db.meets.find((m) => m.id === meetId);
  if (!meet) return res.status(404).send("Meet not found");

  // Saved templates dropdown
  const tplOptions = db.meetTemplates
    .map((t) => `<option value="${safeText(t.id)}">${safeText(t.templateName)} (from ${safeText(t.name)})</option>`)
    .join("");

  // Build division cards
  const divisionCards = meet.ageDivisions.map((d) => {
    const rows = meet.classifications.map((c) => {
      const row = ensureMeetDistanceRow(meet, d.key, c.key);
      return `
        <div class="card" style="border-radius:14px; box-shadow:none;">
          <div class="row">
            <div style="flex:1 1 180px;">
              <div class="checkbox">
                <input type="checkbox" name="dist_${d.key}_${c.key}_enabled" ${row.enabled ? "checked" : ""}>
                <div><b>${safeText(c.label)}</b></div>
              </div>
              <div class="checkbox" style="margin-top:-8px;">
                <input type="checkbox" name="dist_${d.key}_${c.key}_tt" ${row.timeTrials ? "checked" : ""}>
                <div><b>Time Trials</b> <span class="small">(opt-in for this classification)</span></div>
              </div>
            </div>
            <div style="flex:1 1 180px;">
              <label>Cost</label>
              <input type="number" name="dist_${d.key}_${c.key}_cost" value="${safeText(row.cost ?? 0)}" min="0" step="1">
            </div>
          </div>

          <div class="row">
            <div>
              <label>D1</label>
              <input type="text" name="dist_${d.key}_${c.key}_d1" value="${safeText(row.d1)}" placeholder="ex: 1 lap / 500m / 2k points">
            </div>
            <div>
              <label>D2</label>
              <input type="text" name="dist_${d.key}_${c.key}_d2" value="${safeText(row.d2)}" placeholder="(optional)">
            </div>
            <div>
              <label>D3</label>
              <input type="text" name="dist_${d.key}_${c.key}_d3" value="${safeText(row.d3)}" placeholder="(optional)">
            </div>
            <div>
              <label>D4</label>
              <input type="text" name="dist_${d.key}_${c.key}_d4" value="${safeText(row.d4)}" placeholder="(optional)">
            </div>
          </div>
          <div class="muted">Plain inputs (no dropdowns) — avoids the Safari/scrollbar glitch.</div>
        </div>
      `;
    }).join("");

    return `
      <div class="card">
        <div class="row">
          <div>
            <h3 style="margin:0;">${safeText(d.label)} <span class="pill">${safeText(d.minAge)}–${safeText(d.maxAge)}</span></h3>
            <div class="muted">Division key: <span class="kbd">${safeText(d.key)}</span>${d.locked ? ` • <b>locked ages</b>` : ""}</div>
          </div>
        </div>
        <div class="hr"></div>
        <div class="grid" style="gap:12px;">
          ${rows}
        </div>
      </div>
    `;
  }).join("");

  const body = `
    <div class="card">
      <h2>Meet Builder</h2>
      <div class="muted">${safeText(meet.name)} • ${safeText(meet.date)} • ${safeText(meet.id)}</div>
      <div class="hr"></div>

      <div class="grid two">
        <div class="card" style="box-shadow:none;">
          <h3 style="margin-top:0;">Load Saved Meet (Template)</h3>
          <form method="POST" action="/meet/${safeText(meet.id)}/load-template">
            <label>Saved meets</label>
            <select name="templateId">
              <option value="">— Select a saved meet —</option>
              ${tplOptions}
            </select>
            <div class="hr"></div>
            <button class="btn primary" type="submit">Load & Replace This Meet’s Setup</button>
            <div class="muted" style="margin-top:8px;">This replaces divisions/distances/time trials/relays/blocks config (registrants are kept).</div>
          </form>
        </div>

        <div class="card" style="box-shadow:none;">
          <h3 style="margin-top:0;">Meet Basics</h3>
          <form method="POST" action="/meet/${safeText(meet.id)}/basics">
            <div class="row">
              <div>
                <label>Meet Name</label>
                <input name="name" type="text" value="${safeText(meet.name)}">
              </div>
              <div>
                <label>Date</label>
                <input name="date" type="text" value="${safeText(meet.date)}" placeholder="TBD or Mar 20, 2026">
              </div>
            </div>
            <div class="hr"></div>
            <button class="btn primary" type="submit">Save Basics</button>
          </form>
        </div>
      </div>

      <div class="hr"></div>

      <div class="card" style="box-shadow:none;">
        <h3 style="margin-top:0;">Meet-wide Time Trials</h3>
        <form method="POST" action="/meet/${safeText(meet.id)}/time-trials">
          <div class="checkbox">
            <input type="checkbox" name="enabled" ${meet.timeTrials?.enabled ? "checked" : ""}>
            <div><b>Time Trials at this meet</b> <span class="small">(enables TT config; you still pick who is eligible via per-division TT checkboxes)</span></div>
          </div>
          <div class="row">
            <div>
              <label>Distances (comma-separated)</label>
              <input type="text" name="distancesCsv" value="${safeText(meet.timeTrials?.distancesCsv || "")}" placeholder="1 lap, 2 laps, 3 laps">
            </div>
            <div>
              <label>Format</label>
              <select name="format">
                <option value="solo" ${meet.timeTrials?.format === "solo" ? "selected" : ""}>Solo</option>
                <option value="paired" ${meet.timeTrials?.format === "paired" ? "selected" : ""}>Paired</option>
              </select>
            </div>
            <div>
              <label>Timing</label>
              <select name="timing">
                <option value="manual" ${meet.timeTrials?.timing === "manual" ? "selected" : ""}>Manual</option>
                <option value="electronic" ${meet.timeTrials?.timing === "electronic" ? "selected" : ""}>Electronic</option>
              </select>
            </div>
          </div>
          <label>Notes</label>
          <textarea name="notes" rows="2" placeholder="Optional">${safeText(meet.timeTrials?.notes || "")}</textarea>
          <div class="hr"></div>
          <button class="btn primary" type="submit">Save Time Trials Settings</button>
        </form>
      </div>

      <div class="hr"></div>

      <h3>Divisions & Classifications</h3>
      <div class="muted">Enable divisions/classifications, set costs, and enter D1–D4 as plain text. Time Trials is a simple checkbox per classification.</div>
      <div class="hr"></div>

      <form method="POST" action="/meet/${safeText(meet.id)}/distances">
        <div class="grid" style="gap:16px;">
          ${divisionCards}
        </div>
        <div class="hr"></div>
        <div class="right">
          <button class="btn primary" type="submit">Save Meet Builder</button>
          <a class="btn" href="/portal">Back</a>
        </div>
      </form>

      <div class="hr"></div>

      <div class="card" style="box-shadow:none;">
        <h3 style="margin-top:0;">Save Meet As (Template)</h3>
        <form method="POST" action="/meet/${safeText(meet.id)}/save-template">
          <label>Template name</label>
          <input type="text" name="templateName" placeholder="ex: Kansas State Indoor Template" required>
          <div class="hr"></div>
          <button class="btn primary" type="submit">Save Template</button>
          <div class="muted" style="margin-top:8px;">Saves builder setup + blocks. Does not include registrants.</div>
        </form>
      </div>
    </div>
  `;

  // Ensure rows exist before saving
  saveDb(db);

  res.send(pageShell({ title: "Meet Builder", user: req.session.user, bodyHtml: body }));
});

app.post("/meet/:meetId/basics", requireRole(null), (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");
  meet.name = String(req.body.name || meet.name);
  meet.date = String(req.body.date || meet.date);
  meet.updatedAt = nowISO();
  saveDb(db);
  res.redirect(`/meet/${meet.id}/builder`);
});

app.post("/meet/:meetId/time-trials", requireRole(null), (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  meet.timeTrials = meet.timeTrials || {};
  meet.timeTrials.enabled = !!req.body.enabled;
  meet.timeTrials.distancesCsv = String(req.body.distancesCsv || "");
  meet.timeTrials.format = req.body.format === "paired" ? "paired" : "solo";
  meet.timeTrials.timing = req.body.timing === "electronic" ? "electronic" : "manual";
  meet.timeTrials.notes = String(req.body.notes || "");
  meet.updatedAt = nowISO();

  saveDb(db);
  res.redirect(`/meet/${meet.id}/builder`);
});

app.post("/meet/:meetId/distances", requireRole(null), (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  // Loop all divisions/classes and persist
  for (const div of meet.ageDivisions) {
    for (const cls of meet.classifications) {
      const row = ensureMeetDistanceRow(meet, div.key, cls.key);
      row.enabled = !!req.body[`dist_${div.key}_${cls.key}_enabled`];
      row.timeTrials = !!req.body[`dist_${div.key}_${cls.key}_tt`];
      row.cost = parseIntSafe(req.body[`dist_${div.key}_${cls.key}_cost`], 0);
      row.d1 = String(req.body[`dist_${div.key}_${cls.key}_d1`] || "");
      row.d2 = String(req.body[`dist_${div.key}_${cls.key}_d2`] || "");
      row.d3 = String(req.body[`dist_${div.key}_${cls.key}_d3`] || "");
      row.d4 = String(req.body[`dist_${div.key}_${cls.key}_d4`] || "");
    }
  }

  // Auto-enable meet timeTrials if any TT checkbox used
  const anyTT = Object.values(meet.distances || {}).some((div) =>
    Object.values(div || {}).some((row) => row?.timeTrials)
  );
  if (anyTT) meet.timeTrials = { ...(meet.timeTrials || {}), enabled: true };

  meet.updatedAt = nowISO();
  saveDb(db);
  res.redirect(`/meet/${meet.id}/builder`);
});

app.post("/meet/:meetId/save-template", requireRole(null), (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const templateName = String(req.body.templateName || "").trim();
  if (!templateName) return res.redirect(`/meet/${meet.id}/builder`);

  // Copy only builder config (no registrants)
  const copy = JSON.parse(JSON.stringify(meet));
  copy.templateId = uid("tpl_");
  copy.templateName = templateName;
  delete copy.registrants;
  copy.registrants = [];
  copy.savedAt = nowISO();

  db.meetTemplates.unshift(copy);
  saveDb(db);
  res.redirect(`/meet/${meet.id}/builder`);
});

app.post("/meet/:meetId/load-template", requireRole(null), (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const templateId = String(req.body.templateId || "");
  const tpl = db.meetTemplates.find((t) => t.templateId === templateId || t.id === templateId);
  if (!tpl) return res.redirect(`/meet/${meet.id}/builder`);

  const keepRegistrants = meet.registrants || [];

  // Replace config
  meet.ageDivisions = JSON.parse(JSON.stringify(tpl.ageDivisions || defaultAgeDivisions()));
  meet.classifications = JSON.parse(JSON.stringify(tpl.classifications || meet.classifications));
  meet.distances = JSON.parse(JSON.stringify(tpl.distances || {}));
  meet.timeTrials = JSON.parse(JSON.stringify(tpl.timeTrials || meet.timeTrials));
  meet.relays = JSON.parse(JSON.stringify(tpl.relays || meet.relays));
  meet.blocks = JSON.parse(JSON.stringify(tpl.blocks || []));

  // Keep registrants
  meet.registrants = keepRegistrants;

  meet.updatedAt = nowISO();
  saveDb(db);
  res.redirect(`/meet/${meet.id}/builder`);
});

// -------------------- BLOCK BUILDER (saved in meet) --------------------
app.get("/meet/:meetId/blocks", requireRole(null), (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const blocks = (meet.blocks || []).map((b) => `
    <tr>
      <td><b>${safeText(b.name)}</b></td>
      <td class="muted">${safeText(b.itemsCsv || "")}</td>
      <td><form method="POST" action="/meet/${safeText(meet.id)}/blocks/delete" style="margin:0;">
        <input type="hidden" name="blockId" value="${safeText(b.id)}">
        <button class="btn red" type="submit">Delete</button>
      </form></td>
    </tr>
  `).join("");

  const body = `
    <div class="card">
      <h2>Block Builder</h2>
      <div class="muted">${safeText(meet.name)} • ${safeText(meet.id)}</div>
      <div class="hr"></div>

      <div class="grid two">
        <div class="card" style="box-shadow:none;">
          <h3 style="margin-top:0;">Add Block</h3>
          <form method="POST" action="/meet/${safeText(meet.id)}/blocks/add">
            <label>Block name</label>
            <input type="text" name="name" placeholder="ex: Morning Sprints" required>
            <label>Items (CSV)</label>
            <input type="text" name="itemsCsv" placeholder="ex: Primary Girls, Primary Boys, TT, Relays">
            <div class="hr"></div>
            <button class="btn primary" type="submit">Add Block</button>
          </form>
          <div class="muted" style="margin-top:10px;">Blocks are saved as part of the meet (and saved into templates too).</div>
        </div>

        <div class="card" style="box-shadow:none;">
          <h3 style="margin-top:0;">Current Blocks</h3>
          <table class="table">
            <thead><tr><th>Name</th><th>Items</th><th></th></tr></thead>
            <tbody>${blocks || `<tr><td colspan="3" class="muted">No blocks yet.</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div class="hr"></div>
      <div class="right">
        <a class="btn" href="/meet/${safeText(meet.id)}/builder">Back to Meet Builder</a>
        <a class="btn" href="/portal">Portal</a>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Block Builder", user: req.session.user, bodyHtml: body }));
});

app.post("/meet/:meetId/blocks/add", requireRole(null), (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");
  meet.blocks = meet.blocks || [];
  meet.blocks.push({ id: uid("blk_"), name: String(req.body.name || "Block"), itemsCsv: String(req.body.itemsCsv || "") });
  meet.updatedAt = nowISO();
  saveDb(db);
  res.redirect(`/meet/${meet.id}/blocks`);
});

app.post("/meet/:meetId/blocks/delete", requireRole(null), (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");
  const blockId = String(req.body.blockId || "");
  meet.blocks = (meet.blocks || []).filter((b) => b.id !== blockId);
  meet.updatedAt = nowISO();
  saveDb(db);
  res.redirect(`/meet/${meet.id}/blocks`);
});

// -------------------- REGISTRATION --------------------
app.get("/meet/:meetId/register", (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const body = `
    <div class="card">
      <h2>Register</h2>
      <div class="muted"><b>${safeText(meet.name)}</b> • ${safeText(meet.date)} • Registration ${meet.status === "locked" ? "<b>CLOSED</b>" : "<b>OPEN</b>"}</div>
      <div class="hr"></div>

      ${meet.status === "locked" ? `<div class="notice">Registration is closed for this meet.</div>` : `
      <form method="POST" action="/meet/${safeText(meet.id)}/register">
        <div class="row">
          <div>
            <label>First Name *</label>
            <input type="text" name="firstName" required>
          </div>
          <div>
            <label>Last Name *</label>
            <input type="text" name="lastName" required>
          </div>
        </div>

        <label>Team *</label>
        <input type="text" name="team" value="Independent" required>

        <label>USARS Number (optional)</label>
        <input type="text" name="usarsNumber" placeholder="Optional">

        <div class="hr"></div>

        <div class="row">
          <div>
            <label>Age *</label>
            <input type="number" name="age" min="0" max="120" required>
            <div class="muted">Division is assigned automatically from age.</div>
          </div>
          <div>
            <label>Gender (optional)</label>
            <select name="gender">
              <option value="">—</option>
              <option value="girls">Girls</option>
              <option value="boys">Boys</option>
              <option value="women">Women</option>
              <option value="men">Men</option>
            </select>
            <div class="muted">Used only if you later want gender-aware division rules.</div>
          </div>
        </div>

        <div class="hr"></div>

        <div class="checkbox">
          <input type="checkbox" name="challengeUp">
          <div>
            <b>Challenge Up</b> <span class="small">(auto bumped per USARS rule)</span><br>
            <span class="muted">This is a registration flag (does not add meet-builder clutter).</span>
          </div>
        </div>

        <h3>Select Classifications</h3>
        <div class="muted">Check one or multiple: Novice + Elite, etc.</div>

        <div class="row">
          <div class="card" style="box-shadow:none;">
            <div class="checkbox"><input type="checkbox" name="class_novice"><div><b>Novice</b></div></div>
            <div class="checkbox"><input type="checkbox" name="class_elite"><div><b>Elite</b></div></div>
            <div class="checkbox"><input type="checkbox" name="class_open"><div><b>Open</b></div></div>

            <div class="hr"></div>

            <div class="checkbox"><input type="checkbox" name="timeTrials"><div><b>Time Trials</b></div></div>
            <div class="checkbox"><input type="checkbox" name="relays"><div><b>Relays</b></div></div>
          </div>

          <div class="card" style="box-shadow:none;">
            <h3 style="margin-top:0;">How it works</h3>
            <ul class="muted">
              <li>We assign your <b>division</b> from your age.</li>
              <li>Your checked classifications determine which groups you race.</li>
              <li>Time Trials/Relays are opt-in flags.</li>
            </ul>
          </div>
        </div>

        <div class="hr"></div>
        <button class="btn primary" type="submit">Register</button>
      </form>
      `}
    </div>
  `;
  res.send(pageShell({ title: "Register", user: getSession(req)?.user, bodyHtml: body }));
});

app.post("/meet/:meetId/register", (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");
  if (meet.status === "locked") return res.status(400).send("Registration closed");

  const age = parseIntSafe(req.body.age, NaN);
  const division = findDivisionForAge(meet, age);

  const classes = [];
  if (req.body.class_novice) classes.push("novice");
  if (req.body.class_elite) classes.push("elite");
  if (req.body.class_open) classes.push("open");

  if (classes.length === 0) {
    return res.send(pageShell({
      title: "Register",
      user: getSession(req)?.user,
      bodyHtml: `<div class="card"><h2>Registration error</h2><p class="muted">Pick at least one classification (Novice/Elite/Open).</p><a class="btn" href="/meet/${safeText(meet.id)}/register">Back</a></div>`
    }));
  }

  if (!division) {
    return res.send(pageShell({
      title: "Register",
      user: getSession(req)?.user,
      bodyHtml: `<div class="card"><h2>Registration error</h2><p class="muted">Could not assign a division for age <b>${safeText(age)}</b>.</p><a class="btn" href="/meet/${safeText(meet.id)}/register">Back</a></div>`
    }));
  }

  // If user checked timeTrials, ensure their division/classification actually offers TT (optional enforcement).
  // For now: store flag; judges/admin can filter later.
  const registrant = {
    id: uid("sk_"),
    firstName: String(req.body.firstName || "").trim(),
    lastName: String(req.body.lastName || "").trim(),
    team: String(req.body.team || "Independent").trim(),
    usarsNumber: String(req.body.usarsNumber || "").trim(),
    age,
    gender: String(req.body.gender || ""),
    divisionKey: division.key,
    divisionLabel: division.label,
    classifications: classes,
    challengeUp: !!req.body.challengeUp,
    timeTrials: !!req.body.timeTrials,
    relays: !!req.body.relays,
    createdAt: nowISO(),
  };

  meet.registrants = meet.registrants || [];
  meet.registrants.push(registrant);
  meet.updatedAt = nowISO();
  saveDb(db);

  res.send(pageShell({
    title: "Registered",
    user: getSession(req)?.user,
    bodyHtml: `
      <div class="card">
        <h2>Registered ✅</h2>
        <div class="muted">
          ${safeText(registrant.firstName)} ${safeText(registrant.lastName)}<br>
          Age: <b>${safeText(registrant.age)}</b> → Division: <b>${safeText(registrant.divisionLabel)}</b><br>
          Classes: <b>${safeText(registrant.classifications.join(", "))}</b><br>
          Time Trials: <b>${registrant.timeTrials ? "Yes" : "No"}</b> • Relays: <b>${registrant.relays ? "Yes" : "No"}</b>
        </div>
        <div class="hr"></div>
        <div class="right">
          <a class="btn primary" href="/meet/${safeText(meet.id)}/register">Register Another</a>
          <a class="btn" href="/meets">Back to Meets</a>
        </div>
      </div>
    `
  }));
});

// -------------------- RINKS --------------------
app.get("/rinks", (req, res) => {
  const cards = (db.rinks || []).map((r) => `
    <div class="card">
      <h2 style="margin-bottom:8px;">${safeText(r.name)}</h2>
      <div class="muted">
        <div><b>City:</b> ${safeText(r.city || "—")}</div>
        <div><b>Phone:</b> ${safeText(r.phone || "—")}</div>
        <div><b>Address:</b> ${safeText(r.address || "—")}</div>
        <div><b>Website:</b> ${safeText(r.website || "—")}</div>
      </div>
    </div>
  `).join("");

  const body = `
    <div class="card">
      <h2>Rinks</h2>
      <div class="muted">Community rink directory.</div>
      <div class="hr"></div>
      <div class="grid" style="gap:16px;">
        ${cards || `<div class="muted">No rinks yet.</div>`}
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Find a Rink", user: getSession(req)?.user, bodyHtml: body }));
});

// -------------------- LIVE (placeholder) --------------------
app.get("/live", (req, res) => {
  const body = `
    <div class="card">
      <h2>Live Race Day</h2>
      <div class="muted">Placeholder page (we’ll wire this to blocks, judges panel, and results next).</div>
    </div>
  `;
  res.send(pageShell({ title: "Live Race Day", user: getSession(req)?.user, bodyHtml: body }));
});

// -------------------- START SERVER --------------------
app.listen(PORT, HOST, () => {
  console.log(
    `
============================================================
SpeedSkateMeet | CLEAN REBUILD v7
Data: ${DATA_FILE}

Login page:
- Demo usernames (passwords not displayed publicly)

Time Trials:
- Per division+classification checkbox
- Meet-wide Time Trials config

Local: http://localhost:${PORT}
LAN:   http://<your-ip>:${PORT}
============================================================
`.trim()
  );
});