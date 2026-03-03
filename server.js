// ============================================================
// SpeedSkateMeet – CLEAN REBUILD v8.0 – March 2026
// Node.js + Express • single-file server.js • JSON persistence
//
// v8.0 GUARANTEES / FIXES:
// ✅ RINKS: forces Wichita to REAL rink: Roller City (no "Wichita Skate Center" ever)
// ✅ Stable sessions + safe rendering (prevents common 500s)
// ✅ Meet Builder FULL division list (Tiny Tot -> Grand Veteran) in correct order
// ✅ Distances are plain inputs (NO datalist / dropdown glitches)
// ✅ Meet-wide Time Trials + Relays + SkateAbility (SkateAbility supports multiple boxes)
// ✅ No passwords shown on public pages (login page shows usernames only)
//
// ============================================================

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// -------------------- APP CONFIG --------------------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = Number(process.env.PORT || 10000);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "ssm_db.json");

// -------------------- HELPERS --------------------
function uid(bytes = 12) {
  return crypto.randomBytes(bytes).toString("hex");
}
function nowIso() {
  return new Date().toISOString();
}
function safeText(x) {
  return String(x ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return c;
    }
  });
}
function atomicWrite(filePath, content) {
  const tmp = `${filePath}.${uid(6)}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
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
    out[k] = decodeURIComponent(v || "");
  });
  return out;
}
function clampStr(s, max = 200) {
  return String(s ?? "").slice(0, max);
}
function nOr0(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// -------------------- CANONICAL RINKS (FORCED) --------------------
function canonicalRinks() {
  // This is the ONLY Wichita rink we keep.
  return [
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
  ];
}

// -------------------- DIVISIONS (FULL LIST) --------------------
function buildDefaultDivisions() {
  const mk = (id, label, ages) => ({
    id,
    label,
    ages,
    classes: {
      novice: { enabled: false, cost: 0, d: ["", "", "", ""] },
      elite: { enabled: false, cost: 0, d: ["", "", "", ""] },
      open: { enabled: false, cost: 0, d: ["", "", "", ""] },
    },
  });

  // USARS-style order (as you’ve been using)
  return [
    mk("tiny_tot_girls", "Tiny Tot Girls", "0–5"),
    mk("tiny_tot_boys", "Tiny Tot Boys", "0–5"),

    mk("primary_girls", "Primary Girls", "6–7"),
    mk("primary_boys", "Primary Boys", "6–7"),

    mk("juvenile_girls", "Juvenile Girls", "8–9"),
    mk("juvenile_boys", "Juvenile Boys", "8–9"),

    mk("elementary_girls", "Elementary Girls", "10–11"),
    mk("elementary_boys", "Elementary Boys", "10–11"),

    mk("freshman_girls", "Freshman Girls", "12–13"),
    mk("freshman_boys", "Freshman Boys", "12–13"),

    mk("sophomore_girls", "Sophomore Girls", "14–15"),
    mk("sophomore_boys", "Sophomore Boys", "14–15"),

    mk("junior_women", "Junior Women", "16–17"),
    mk("junior_men", "Junior Men", "16–17"),

    // Adult chain (locked order)
    mk("senior_women", "Senior Women", "18–24 (or 18+ per meet)"),
    mk("senior_men", "Senior Men", "18–24 (or 18+ per meet)"),

    mk("classic_women", "Classic Women", "25–34"),
    mk("classic_men", "Classic Men", "25–34"),

    mk("masters_women", "Masters Women", "35–44"),
    mk("masters_men", "Masters Men", "35–44"),

    mk("veteran_women", "Veteran Women", "45–54"),
    mk("veteran_men", "Veteran Men", "45–54"),

    mk("esquire_women", "Esquire Women", "55–64"),
    mk("esquire_men", "Esquire Men", "55–64"),

    mk("grand_veteran_women", "Grand Veteran Women", "65+"),
    mk("grand_veteran_men", "Grand Veteran Men", "65+"),
  ];
}

// -------------------- DB DEFAULTS --------------------
function defaultMeet() {
  return {
    id: "meet_" + uid(6),
    name: "New Meet",
    date: "",
    registrationOpen: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),

    divisions: buildDefaultDivisions(),

    skateAbilityBoxes: [
      {
        id: "sa_" + uid(6),
        enabled: false,
        label: "Box 1",
        manualAgeLabel: "Manual Age",
        cost: 0,
        d: ["", "", "", ""],
      },
    ],

    timeTrials: {
      enabled: false,
      notes: "",
      judgesRequired: true,
    },

    relays: {
      enabled: false,
      notes: "",
    },

    // Block builder stored in meet
    blocks: [],

    // Registrations
    registrants: [],
    nextCheckIn: 1,
  };
}

function defaultDb() {
  return {
    meta: { version: "8.0", createdAt: nowIso(), updatedAt: nowIso() },

    // DEMO USERS (passwords stored, but NEVER displayed on public pages)
    // Change these later. Keep simple for now.
    users: [
      { id: "u_director", username: "Lbird22", role: "director", password: "Redline22" },
      { id: "u_judge", username: "JudgeLee", role: "judge", password: "Redline22" },
      { id: "u_coach", username: "CoachLee", role: "coach", password: "Redline22" },
    ],

    rinks: canonicalRinks(),
    meets: [defaultMeet()],
  };
}

function loadDb() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const db = defaultDb();
      atomicWrite(DATA_FILE, JSON.stringify(db, null, 2));
      return db;
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    // harden shape
    if (!parsed.meta) parsed.meta = { version: "8.0", createdAt: nowIso(), updatedAt: nowIso() };
    if (!Array.isArray(parsed.users)) parsed.users = defaultDb().users;
    if (!Array.isArray(parsed.meets)) parsed.meets = [];
    if (!Array.isArray(parsed.rinks)) parsed.rinks = [];

    // FORCE rink truth: remove any fake / old rinks and apply canonical list
    parsed.rinks = canonicalRinks();

    // ensure at least one meet
    if (parsed.meets.length === 0) parsed.meets.push(defaultMeet());

    // ensure each meet has required fields (light migration)
    for (const m of parsed.meets) {
      if (!m.id) m.id = "meet_" + uid(6);
      if (!m.name) m.name = "New Meet";
      if (!Array.isArray(m.divisions) || m.divisions.length < 10) m.divisions = buildDefaultDivisions();
      if (!Array.isArray(m.skateAbilityBoxes) || m.skateAbilityBoxes.length === 0) {
        m.skateAbilityBoxes = [
          { id: "sa_" + uid(6), enabled: false, label: "Box 1", manualAgeLabel: "Manual Age", cost: 0, d: ["", "", "", ""] },
        ];
      }
      if (!m.timeTrials) m.timeTrials = { enabled: false, notes: "", judgesRequired: true };
      if (!m.relays) m.relays = { enabled: false, notes: "" };
      if (!Array.isArray(m.blocks)) m.blocks = [];
      if (!Array.isArray(m.registrants)) m.registrants = [];
      if (!Number.isFinite(Number(m.nextCheckIn))) m.nextCheckIn = 1;
      if (!m.createdAt) m.createdAt = nowIso();
      m.updatedAt = nowIso();
    }

    atomicWrite(DATA_FILE, JSON.stringify(parsed, null, 2));
    return parsed;
  } catch (e) {
    console.error("DB load failed. Rebuilding DB:", e);
    const db = defaultDb();
    atomicWrite(DATA_FILE, JSON.stringify(db, null, 2));
    return db;
  }
}

function saveDb(db) {
  db.meta.updatedAt = nowIso();
  atomicWrite(DATA_FILE, JSON.stringify(db, null, 2));
}

let db = loadDb();

// -------------------- SESSIONS (IN-MEMORY) --------------------
const sessions = Object.create(null); // sid -> { userId, createdAt }
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const COOKIE_NAME = "sid";

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies[COOKIE_NAME];
  if (!sid) return null;
  const s = sessions[sid];
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    delete sessions[sid];
    return null;
  }
  const user = db.users.find((u) => u.id === s.userId);
  if (!user) return null;
  return { sid, user };
}
function setSessionCookie(res, sid) {
  // NOTE: add Secure automatically in production platforms using HTTPS termination
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(sid)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ...(isProd ? ["Secure"] : []),
  ];
  res.setHeader("Set-Cookie", parts.join("; "));
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`);
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
:root{--blue:#2563eb;--bg:#f5f7ff;--card:#fff;--text:#0f172a;--muted:#64748b;--border:#e5e7eb;--shadow:0 10px 30px rgba(15,23,42,.08);}
*{box-sizing:border-box;}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif;background:var(--bg);color:var(--text);}
.wrap{max-width:1080px;margin:26px auto;padding:0 16px;}
.topbar{display:flex;gap:12px;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:14px 16px;box-shadow:var(--shadow);}
.brand{font-weight:900;letter-spacing:-.02em;display:flex;gap:10px;align-items:center;}
.nav{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;}
.btn{display:inline-block;padding:10px 14px;border-radius:14px;border:2px solid rgba(37,99,235,.25);background:#fff;color:var(--blue);font-weight:800;text-decoration:none;}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff;}
.btn.danger{background:#dc2626;border-color:#dc2626;color:#fff;}
.pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid var(--border);color:var(--muted);font-weight:800;font-size:12px;background:#fff;}
.card{background:var(--card);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin:18px 0;}
h1{margin:0 0 6px 0;font-size:34px;letter-spacing:-.02em;}
h2{margin:0 0 10px 0;font-size:20px;}
.muted{color:var(--muted);}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
input,select,textarea{width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;font-size:14px;background:#fff;}
textarea{min-height:90px;}
label{font-weight:900;font-size:12px;}
.section{margin-top:16px;padding-top:16px;border-top:1px solid var(--border);}
.box{border:1px solid var(--border);border-radius:16px;padding:14px;background:#fff;}
.chk{display:flex;align-items:center;gap:10px;}
.chk input{width:22px;height:22px;}
.right{margin-left:auto;}
.k{font-weight:900;}
.small{font-size:12px;color:var(--muted);}
hr{border:none;border-top:1px solid var(--border);margin:16px 0;}
`;
}
function pageShell({ title, user, bodyHtml }) {
  const loggedIn = !!user;
  const rolePill = loggedIn ? `<span class="pill">${safeText(user.username)} • ${safeText(user.role)}</span>` : "";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>${safeText(title)} • SpeedSkateMeet</title>
    <style>${css()}</style>
  </head>
  <body>
    <div class="wrap">
      <div class="topbar">
        <div class="brand">SpeedSkateMeet</div>
        <div class="nav">
          <a class="btn" href="/">Home</a>
          <a class="btn" href="/meets">Find a Meet</a>
          <a class="btn" href="/rinks">Find a Rink</a>
          <a class="btn" href="/live">Live Race Day</a>
          ${loggedIn ? `<a class="btn primary" href="/portal">Portal</a><a class="btn" href="/logout">Logout</a>` : `<a class="btn primary" href="/login">Admin Login</a>`}
        </div>
        ${rolePill}
      </div>

      ${bodyHtml}

      <div class="small" style="margin-top:18px;">Data file: ${safeText(DATA_FILE)}</div>
    </div>
  </body>
</html>`;
}

// -------------------- FINDERS --------------------
function findMeet(meetId) {
  return db.meets.find((m) => m.id === meetId) || null;
}
function meetOr404(req, res) {
  const m = findMeet(req.params.meetId);
  if (!m) {
    res.status(404).send("Meet not found");
    return null;
  }
  return m;
}
function fmtCheckIn(n) {
  return String(n).padStart(3, "0");
}

// -------------------- ROUTES: PUBLIC --------------------
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
      <div class="section small">
        Adult ages locked: Classic 25–34 • Masters 35–44
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Home", user: s?.user, bodyHtml: body }));
});

app.get("/rinks", (req, res) => {
  const s = getSession(req);
  // rinks are forced canonical on load; still safe here:
  const rinks = Array.isArray(db.rinks) ? db.rinks : canonicalRinks();
  const cards = rinks
    .map(
      (r) => `
      <div class="card">
        <h2>${safeText(r.name)}</h2>
        <div><span class="k">City:</span> ${safeText(r.city)}, ${safeText(r.state)}</div>
        <div><span class="k">Phone:</span> ${safeText(r.phone || "—")}</div>
        <div><span class="k">Address:</span> ${safeText(r.address || "—")}</div>
        <div><span class="k">Website:</span> ${
          r.website ? `<a href="https://${safeText(r.website)}" target="_blank" rel="noreferrer">${safeText(r.website)}</a>` : "—"
        }</div>
      </div>
    `
    )
    .join("");
  res.send(pageShell({ title: "Rinks", user: s?.user, bodyHtml: `<h1>Rinks</h1>${cards}` }));
});

app.get("/meets", (req, res) => {
  const s = getSession(req);
  const meetsHtml = (db.meets || [])
    .map((m) => {
      return `
        <div class="card">
          <div class="row">
            <h2 style="margin:0;">${safeText(m.name)}</h2>
            <span class="pill">${safeText(m.date || "TBD")}</span>
            <span class="pill">Reg ${m.registrationOpen ? "OPEN" : "CLOSED"}</span>
            <span class="right"></span>
          </div>
          <div class="section row">
            <a class="btn primary" href="/meet/${encodeURIComponent(m.id)}/register">Register</a>
            ${s?.user?.role === "director" ? `<a class="btn" href="/meet/${encodeURIComponent(m.id)}/builder">Meet Builder</a>` : ``}
            ${s?.user?.role === "director" ? `<a class="btn" href="/meet/${encodeURIComponent(m.id)}/blocks">Block Builder</a>` : ``}
          </div>
        </div>
      `;
    })
    .join("");
  res.send(pageShell({ title: "Meets", user: s?.user, bodyHtml: `<h1>Meets</h1>${meetsHtml || `<div class="card"><div class="muted">No meets yet.</div></div>`}` }));
});

app.get("/live", (req, res) => {
  const s = getSession(req);
  const body = `
    <div class="card">
      <h1>Live Race Day</h1>
      <div class="muted">Live view wiring comes next (blocks → race order → judge entry → standings).</div>
    </div>
  `;
  res.send(pageShell({ title: "Live", user: s?.user, bodyHtml: body }));
});

// -------------------- AUTH --------------------
app.get("/login", (req, res) => {
  const body = `
    <div class="card" style="max-width:720px;margin:24px auto;">
      <h1>Admin Login</h1>
      <div class="muted">Demo usernames (passwords are never shown on public pages):</div>
      <div class="section small">
        <div><b>Director:</b> Lbird22</div>
        <div><b>Judge:</b> JudgeLee</div>
        <div><b>Coach:</b> CoachLee</div>
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
  const username = clampStr(req.body.username, 80).trim();
  const password = clampStr(req.body.password, 120);

  const user = (db.users || []).find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.password !== password) {
    const body = `
      <div class="card" style="max-width:720px;margin:24px auto;">
        <h1>Login failed</h1>
        <div class="muted">Incorrect username or password.</div>
        <div class="section">
          <a class="btn primary" href="/login">Try again</a>
        </div>
      </div>
    `;
    return res.send(pageShell({ title: "Login failed", user: null, bodyHtml: body }));
  }

  const sid = uid(18);
  sessions[sid] = { userId: user.id, createdAt: Date.now() };
  setSessionCookie(res, sid);
  res.redirect("/portal");
});

app.get("/logout", (req, res) => {
  const cookies = parseCookies(req);
  const sid = cookies[COOKIE_NAME];
  if (sid) delete sessions[sid];
  clearSessionCookie(res);
  res.redirect("/");
});

// -------------------- PORTAL --------------------
app.get("/portal", requireRole(["director", "judge", "coach"]), (req, res) => {
  const user = req.session.user;

  const meetsHtml = (db.meets || [])
    .map((m) => {
      const regs = (m.registrants || []).length;
      const blocks = (m.blocks || []).length;
      return `
        <div class="card">
          <div class="row">
            <h2 style="margin:0;">${safeText(m.name)}</h2>
            <span class="pill">${safeText(m.date || "TBD")}</span>
            <span class="pill">Regs: ${regs}</span>
            <span class="pill">Blocks: ${blocks}</span>
            <span class="right"></span>
          </div>
          <div class="section row">
            ${user.role === "director" ? `<a class="btn primary" href="/meet/${encodeURIComponent(m.id)}/builder">Meet Builder</a>` : ""}
            ${user.role === "director" ? `<a class="btn" href="/meet/${encodeURIComponent(m.id)}/blocks">Block Builder</a>` : ""}
            <a class="btn" href="/meet/${encodeURIComponent(m.id)}/register">Registration Page</a>
          </div>
        </div>
      `;
    })
    .join("");

  const body = `
    <div class="card">
      <h1>${safeText(user.role[0].toUpperCase() + user.role.slice(1))} Portal</h1>
      <div class="muted">Logged in as ${safeText(user.username)}</div>

      ${
        user.role === "director"
          ? `<form class="section" method="POST" action="/meet/new">
               <button class="btn primary" type="submit">Build New Meet</button>
             </form>`
          : ""
      }
    </div>

    <h2>Meets</h2>
    ${meetsHtml || `<div class="card"><div class="muted">No meets yet.</div></div>`}
  `;
  res.send(pageShell({ title: "Portal", user, bodyHtml: body }));
});

app.post("/meet/new", requireRole(["director"]), (req, res) => {
  const m = defaultMeet();
  db.meets = db.meets || [];
  db.meets.unshift(m);
  saveDb(db);
  res.redirect(`/meet/${encodeURIComponent(m.id)}/builder`);
});

// -------------------- MEET BUILDER --------------------
app.get("/meet/:meetId/builder", requireRole(["director"]), (req, res) => {
  const user = req.session.user;
  const meet = meetOr404(req, res);
  if (!meet) return;

  const divisionsHtml = (meet.divisions || [])
    .map((div) => {
      const c = div.classes || {};
      const renderClass = (key, label) => {
        const obj = c[key] || { enabled: false, cost: 0, d: ["", "", "", ""] };
        return `
          <div class="box">
            <div class="row">
              <div class="chk">
                <input type="checkbox" name="${div.id}__${key}__enabled" ${obj.enabled ? "checked" : ""}/>
                <div class="k">${safeText(label)}</div>
              </div>
              <div class="right" style="min-width:220px;">
                <label>Cost</label>
                <input name="${div.id}__${key}__cost" value="${safeText(obj.cost ?? 0)}"/>
              </div>
            </div>

            <div class="section grid2">
              <div><label>D1</label><input name="${div.id}__${key}__d1" value="${safeText(obj.d?.[0] || "")}"/></div>
              <div><label>D2</label><input name="${div.id}__${key}__d2" value="${safeText(obj.d?.[1] || "")}"/></div>
              <div><label>D3</label><input name="${div.id}__${key}__d3" value="${safeText(obj.d?.[2] || "")}"/></div>
              <div><label>D4</label><input name="${div.id}__${key}__d4" value="${safeText(obj.d?.[3] || "")}"/></div>
            </div>

            <div class="small">Plain inputs (no dropdowns).</div>
          </div>
        `;
      };

      return `
        <div class="card">
          <div class="row">
            <h2 style="margin:0;">${safeText(div.label)}</h2>
            <span class="pill">${safeText(div.ages)}</span>
          </div>
          <div class="section">
            ${renderClass("novice", "NOVICE")}
            <div style="height:10px;"></div>
            ${renderClass("elite", "ELITE")}
            <div style="height:10px;"></div>
            ${renderClass("open", "OPEN")}
          </div>
        </div>
      `;
    })
    .join("");

  const saBoxesHtml = (meet.skateAbilityBoxes || [])
    .map((b, idx) => {
      return `
        <div class="box">
          <div class="row">
            <div class="k">SkateAbility</div>
            <span class="pill">${safeText(b.label || `Box ${idx + 1}`)}</span>
            <span class="right"></span>
            <button class="btn danger" type="submit" name="sa_remove" value="${safeText(b.id)}">Remove</button>
          </div>

          <div class="section grid3">
            <div class="chk">
              <input type="checkbox" name="sa_${b.id}__enabled" ${b.enabled ? "checked" : ""}/>
              <div class="k">Enable</div>
            </div>
            <div>
              <label>Manual Age Label</label>
              <input name="sa_${b.id}__manualAgeLabel" value="${safeText(b.manualAgeLabel || "Manual Age")}"/>
            </div>
            <div>
              <label>Cost</label>
              <input name="sa_${b.id}__cost" value="${safeText(b.cost ?? 0)}"/>
            </div>
          </div>

          <div class="section grid2">
            <div><label>D1</label><input name="sa_${b.id}__d1" value="${safeText(b.d?.[0] || "")}"/></div>
            <div><label>D2</label><input name="sa_${b.id}__d2" value="${safeText(b.d?.[1] || "")}"/></div>
            <div><label>D3</label><input name="sa_${b.id}__d3" value="${safeText(b.d?.[2] || "")}"/></div>
            <div><label>D4</label><input name="sa_${b.id}__d4" value="${safeText(b.d?.[3] || "")}"/></div>
          </div>
        </div>
      `;
    })
    .join("");

  const tt = meet.timeTrials || { enabled: false, notes: "", judgesRequired: true };
  const rel = meet.relays || { enabled: false, notes: "" };

  const body = `
    <div class="card">
      <h1>Meet Builder</h1>
      <div class="muted">${safeText(meet.name)} ${meet.date ? `• ${safeText(meet.date)}` : ""}</div>

      <form class="section" method="POST" action="/meet/${encodeURIComponent(meet.id)}/builder">
        <div class="grid2">
          <div>
            <label>Meet Name</label>
            <input name="meet_name" value="${safeText(meet.name)}"/>
          </div>
          <div>
            <label>Date</label>
            <input name="meet_date" value="${safeText(meet.date || "")}" placeholder="YYYY-MM-DD"/>
          </div>
        </div>

        <div class="section">
          <h2>Age Divisions</h2>
          <div class="muted">Enable classes + set costs + distances (D1–D4).</div>
        </div>

        ${divisionsHtml}

        <div class="card">
          <h2>SkateAbility</h2>
          <div class="muted">Meet-wide; add multiple boxes. No novice/elite/open here.</div>
          <div class="section">${saBoxesHtml}</div>
          <div class="section">
            <button class="btn" type="submit" name="sa_add" value="1">Add Another SkateAbility Box</button>
          </div>
        </div>

        <div class="card">
          <h2>Time Trials</h2>
          <div class="muted">Meet-wide flag so the system knows you need Time Trial judge tools.</div>
          <div class="section grid2">
            <div class="chk">
              <input type="checkbox" name="tt_enabled" ${tt.enabled ? "checked" : ""}/>
              <div class="k">Enable Time Trials at this meet</div>
            </div>
            <div class="chk">
              <input type="checkbox" name="tt_judgesRequired" ${tt.judgesRequired ? "checked" : ""}/>
              <div class="k">Judges panel required</div>
            </div>
          </div>
          <div class="section">
            <label>Notes (optional)</label>
            <textarea name="tt_notes">${safeText(tt.notes || "")}</textarea>
          </div>
        </div>

        <div class="card">
          <h2>Relays</h2>
          <div class="muted">Meet-wide relay flag + notes (relay builder UI comes next).</div>
          <div class="section chk">
            <input type="checkbox" name="rel_enabled" ${rel.enabled ? "checked" : ""}/>
            <div class="k">Enable Relays at this meet</div>
          </div>
          <div class="section">
            <label>Notes (optional)</label>
            <textarea name="rel_notes">${safeText(rel.notes || "")}</textarea>
          </div>
        </div>

        <div class="section row">
          <button class="btn primary" type="submit" name="save_meet" value="1">Save Meet</button>
          <a class="btn" href="/portal">Back to Portal</a>
          <a class="btn" href="/meet/${encodeURIComponent(meet.id)}/blocks">Block Builder</a>
          <a class="btn" href="/meet/${encodeURIComponent(meet.id)}/register">Registration Page</a>
        </div>
      </form>
    </div>
  `;

  res.send(pageShell({ title: "Meet Builder", user, bodyHtml: body }));
});

app.post("/meet/:meetId/builder", requireRole(["director"]), (req, res) => {
  const meet = meetOr404(req, res);
  if (!meet) return;

  // SkateAbility remove
  if (req.body.sa_remove) {
    const id = String(req.body.sa_remove);
    meet.skateAbilityBoxes = (meet.skateAbilityBoxes || []).filter((b) => b.id !== id);
    if (meet.skateAbilityBoxes.length === 0) {
      meet.skateAbilityBoxes.push({
        id: "sa_" + uid(6),
        enabled: false,
        label: "Box 1",
        manualAgeLabel: "Manual Age",
        cost: 0,
        d: ["", "", "", ""],
      });
    }
    meet.updatedAt = nowIso();
    saveDb(db);
    return res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
  }

  // SkateAbility add
  if (req.body.sa_add) {
    const n = (meet.skateAbilityBoxes || []).length + 1;
    meet.skateAbilityBoxes = meet.skateAbilityBoxes || [];
    meet.skateAbilityBoxes.push({
      id: "sa_" + uid(6),
      enabled: false,
      label: `Box ${n}`,
      manualAgeLabel: "Manual Age",
      cost: 0,
      d: ["", "", "", ""],
    });
    meet.updatedAt = nowIso();
    saveDb(db);
    return res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
  }

  // Meet basics
  meet.name = clampStr(req.body.meet_name, 80).trim() || "New Meet";
  meet.date = clampStr(req.body.meet_date, 40).trim();

  // Divisions/classes
  for (const div of meet.divisions || []) {
    div.classes = div.classes || {};
    for (const key of ["novice", "elite", "open"]) {
      const enabled = !!req.body[`${div.id}__${key}__enabled`];
      const cost = nOr0(req.body[`${div.id}__${key}__cost`]);
      const d1 = clampStr(req.body[`${div.id}__${key}__d1`], 40);
      const d2 = clampStr(req.body[`${div.id}__${key}__d2`], 40);
      const d3 = clampStr(req.body[`${div.id}__${key}__d3`], 40);
      const d4 = clampStr(req.body[`${div.id}__${key}__d4`], 40);
      div.classes[key] = { enabled, cost, d: [d1, d2, d3, d4] };
    }
  }

  // SkateAbility boxes
  meet.skateAbilityBoxes = meet.skateAbilityBoxes || [];
  for (const b of meet.skateAbilityBoxes) {
    b.enabled = !!req.body[`sa_${b.id}__enabled`];
    b.manualAgeLabel = clampStr(req.body[`sa_${b.id}__manualAgeLabel`], 40) || "Manual Age";
    b.cost = nOr0(req.body[`sa_${b.id}__cost`]);
    b.d = [
      clampStr(req.body[`sa_${b.id}__d1`], 40),
      clampStr(req.body[`sa_${b.id}__d2`], 40),
      clampStr(req.body[`sa_${b.id}__d3`], 40),
      clampStr(req.body[`sa_${b.id}__d4`], 40),
    ];
  }

  // Time Trials (meet-wide)
  meet.timeTrials = meet.timeTrials || { enabled: false, notes: "", judgesRequired: true };
  meet.timeTrials.enabled = !!req.body.tt_enabled;
  meet.timeTrials.judgesRequired = !!req.body.tt_judgesRequired;
  meet.timeTrials.notes = clampStr(req.body.tt_notes, 2000);

  // Relays (meet-wide)
  meet.relays = meet.relays || { enabled: false, notes: "" };
  meet.relays.enabled = !!req.body.rel_enabled;
  meet.relays.notes = clampStr(req.body.rel_notes, 2000);

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
});

// -------------------- BLOCK BUILDER (saved in meet) --------------------
app.get("/meet/:meetId/blocks", requireRole(["director"]), (req, res) => {
  const user = req.session.user;
  const meet = meetOr404(req, res);
  if (!meet) return;

  const blocks = meet.blocks || [];
  const blocksHtml = blocks
    .map((b) => {
      return `
        <div class="box">
          <div class="row">
            <div class="k">${safeText(b.name)}</div>
            <span class="pill">${safeText(b.day || "Day 1")}</span>
            <span class="pill">${safeText(b.type || "division")}</span>
            <span class="right"></span>
            <form method="POST" action="/meet/${encodeURIComponent(meet.id)}/blocks/delete" style="margin:0;">
              <input type="hidden" name="blockId" value="${safeText(b.id)}"/>
              <button class="btn danger" type="submit">Delete</button>
            </form>
          </div>
          <div class="small">Items: ${(b.items || []).length}</div>
        </div>
      `;
    })
    .join("");

  const body = `
    <div class="card">
      <h1>Block Builder</h1>
      <div class="muted">${safeText(meet.name)} • blocks are saved inside this meet</div>

      <form class="section" method="POST" action="/meet/${encodeURIComponent(meet.id)}/blocks/add">
        <div class="grid3">
          <div>
            <label>Day</label>
            <select name="day">
              <option value="Day 1">Day 1</option>
              <option value="Day 2">Day 2</option>
              <option value="Day 3">Day 3</option>
            </select>
          </div>
          <div>
            <label>Block Name</label>
            <input name="name" placeholder="ex: Tiny Tot / Primary" required />
          </div>
          <div>
            <label>Type</label>
            <select name="type">
              <option value="division">Division block</option>
              <option value="time_trials">Time Trials block</option>
              <option value="relays">Relays block</option>
              <option value="skateability">SkateAbility block</option>
              <option value="custom">Custom block</option>
            </select>
          </div>
        </div>

        <div class="section row">
          <button class="btn primary" type="submit">Add Block</button>
          <a class="btn" href="/meet/${encodeURIComponent(meet.id)}/builder">Back to Meet Builder</a>
          <a class="btn" href="/portal">Back to Portal</a>
        </div>
      </form>

      <div class="section">
        ${blocksHtml || `<div class="muted">No blocks yet.</div>`}
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Block Builder", user, bodyHtml: body }));
});

app.post("/meet/:meetId/blocks/add", requireRole(["director"]), (req, res) => {
  const meet = meetOr404(req, res);
  if (!meet) return;

  meet.blocks = meet.blocks || [];
  meet.blocks.push({
    id: "blk_" + uid(6),
    day: clampStr(req.body.day, 10) || "Day 1",
    name: clampStr(req.body.name, 60) || "Block",
    type: clampStr(req.body.type, 20) || "division",
    items: [],
    createdAt: nowIso(),
  });

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/blocks`);
});

app.post("/meet/:meetId/blocks/delete", requireRole(["director"]), (req, res) => {
  const meet = meetOr404(req, res);
  if (!meet) return;

  const blockId = String(req.body.blockId || "");
  meet.blocks = (meet.blocks || []).filter((b) => b.id !== blockId);
  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/blocks`);
});

// -------------------- REGISTRATION (simple: age + checkboxes) --------------------
app.get("/meet/:meetId/register", (req, res) => {
  const s = getSession(req);
  const meet = meetOr404(req, res);
  if (!meet) return;

  const body = `
    <div class="card">
      <h1>Register</h1>
      <div class="muted">${safeText(meet.name)} • ${safeText(meet.date || "TBD")}</div>

      ${
        meet.registrationOpen
          ? `
        <form class="section" method="POST" action="/meet/${encodeURIComponent(meet.id)}/register">
          <div class="grid2">
            <div><label>First Name</label><input name="first" required /></div>
            <div><label>Last Name</label><input name="last" required /></div>
          </div>

          <div class="section grid2">
            <div><label>Team</label><input name="team" placeholder="Independent" /></div>
            <div><label>USARS # (optional)</label><input name="usars" /></div>
          </div>

          <div class="section grid2">
            <div>
              <label>Age</label>
              <input name="age" placeholder="ex: 12" required />
              <div class="small">Only age + checkboxes (no division dropdown).</div>
            </div>
            <div>
              <label>Options</label>
              <div class="box">
                <div class="chk"><input type="checkbox" name="challengeUp" /> <div><b>Challenge Up</b> <span class="small">(auto bumped later)</span></div></div>
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
            <a class="btn" href="/meets">Back</a>
          </div>
        </form>
      `
          : `<div class="section muted">Registration is currently closed.</div>`
      }

      <div class="section">
        <h2>Registrations</h2>
        <div class="small">Total: ${(meet.registrants || []).length}</div>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Register", user: s?.user, bodyHtml: body }));
});

app.post("/meet/:meetId/register", (req, res) => {
  const meet = meetOr404(req, res);
  if (!meet) return;
  if (!meet.registrationOpen) return res.status(400).send("Registration closed");

  const ageNum = Number(req.body.age);
  const reg = {
    id: "reg_" + uid(6),
    checkIn: meet.nextCheckIn,
    createdAt: nowIso(),
    first: clampStr(req.body.first, 40),
    last: clampStr(req.body.last, 40),
    team: clampStr(req.body.team || "Independent", 80),
    usars: clampStr(req.body.usars, 40),
    age: Number.isFinite(ageNum) ? ageNum : null,
    flags: {
      challengeUp: !!req.body.challengeUp,
      novice: !!req.body.novice,
      elite: !!req.body.elite,
      open: !!req.body.open,
      timeTrials: !!req.body.timeTrials,
      relays: !!req.body.relays,
    },
  };

  meet.registrants = meet.registrants || [];
  meet.registrants.push(reg);
  meet.nextCheckIn = Number(meet.nextCheckIn || 1) + 1;

  meet.updatedAt = nowIso();
  saveDb(db);

  // simple confirmation page
  const s = getSession(req);
  const body = `
    <div class="card" style="max-width:820px;margin:24px auto;">
      <h1>Registered!</h1>
      <div class="muted">Check-In / Skater #</div>
      <div style="font-size:44px;font-weight:900;margin-top:6px;">#${fmtCheckIn(reg.checkIn)}</div>
      <div class="section">
        <div><span class="k">Name:</span> ${safeText(reg.first)} ${safeText(reg.last)}</div>
        <div><span class="k">Team:</span> ${safeText(reg.team)}</div>
        <div><span class="k">Age:</span> ${safeText(reg.age ?? "—")}</div>
      </div>
      <div class="section row">
        <a class="btn primary" href="/meet/${encodeURIComponent(meet.id)}/register">Back to Registration</a>
        <a class="btn" href="/meets">All Meets</a>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Registered", user: s?.user, bodyHtml: body }));
});

// -------------------- ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Internal Server Error");
});

// -------------------- START --------------------
app.listen(PORT, HOST, () => {
  console.log(`
========================================================
SpeedSkateMeet | CLEAN REBUILD v8.0
Data: ${DATA_FILE}

Rinks are FORCED to Roller City (Wichita, KS).
No fake Wichita Skate Center will ever appear.

Local: http://localhost:${PORT}
========================================================
`.trim());
});