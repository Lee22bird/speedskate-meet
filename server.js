// ============================================================
// SpeedSkateMeet — CLEAN REBUILD v8 (single-file server.js)
// Node.js + Express • JSON persistence • safe sessions (no crash)
// ============================================================

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// --------------------------
// CONFIG
// --------------------------
const PORT = process.env.PORT || 10000;
const HOST = "0.0.0.0";

// Render disk path: /opt/render/project/src
const DATA_FILE =
  process.env.SSM_DATA_FILE ||
  path.join(process.cwd(), "ssm_db.json");

// --------------------------
// DB (JSON persistence)
// --------------------------
function safeReadJSON(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function safeWriteJSON(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function newDB() {
  return {
    version: 8,
    users: {
      // Demo users — passwords are NOT displayed publicly
      Lbird22: { username: "Lbird22", role: "director", password: "Redline22" },
      JudgeLee: { username: "JudgeLee", role: "judge", password: "Redline22" },
      CoachLee: { username: "CoachLee", role: "coach", password: "Redline22" },
    },
    sessions: {},
    meets: [],
    meetTemplates: [], // saved meets/templates
    rinks: [
      {
        id: "roller_city_wichita",
        name: "Roller City",
        city: "Wichita, KS",
        phone: "316-942-4555",
        address: "3234 S. Meridian Ave Wichita, KS 67217",
        website: "rollercitywichitaks.com",
        team: "Midwest Racing",
      },
    ],
  };
}

let db = safeReadJSON(DATA_FILE) || newDB();

// Ensure required keys exist (prevents crashes on old/blank DB)
db.users = db.users || {};
db.sessions = db.sessions || {};
db.meets = db.meets || [];
db.meetTemplates = db.meetTemplates || [];
db.rinks = db.rinks || [];
db.version = db.version || 8;

function saveDB() {
  safeWriteJSON(DATA_FILE, db);
}

// --------------------------
// UTIL
// --------------------------
function id(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSession(req) {
  try {
    const sid = req.cookies?.ssm_session || null;
    if (!sid) return null;
    const sessions = db.sessions || {};
    return sessions[sid] || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const s = getSession(req);
  if (!s || !s.user) return res.redirect("/login");
  const u = db.users?.[s.user];
  if (!u) return res.redirect("/login");
  req.user = u;
  req.session = s;
  next();
}

function nav(user) {
  const isAuthed = !!user;
  const right = isAuthed
    ? `<div class="right">Signed in as <b>${escapeHtml(user.username)}</b> (${escapeHtml(
        user.role
      )}) · <a href="/portal">Portal</a> · <a href="/logout">Logout</a></div>`
    : `<div class="right"><a href="/login">Admin Login</a></div>`;

  return `
  <div class="topbar">
    <div class="brand">
      <div class="logo">SpeedSkateMeet</div>
    </div>
    <div class="links">
      <a class="pill" href="/">Home</a>
      <a class="pill" href="/meets">Find a Meet</a>
      <a class="pill" href="/rinks">Find a Rink</a>
      <a class="pill" href="/live">Live Race Day</a>
    </div>
    ${right}
  </div>
  `;
}

function pageShell({ title, user, body }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title || "SpeedSkateMeet")}</title>
  <style>
    :root{
      --bg:#f5f7fb;
      --card:#ffffff;
      --text:#111827;
      --muted:#6b7280;
      --blue:#2563eb;
      --blue2:#1d4ed8;
      --border:#e5e7eb;
      --shadow: 0 10px 30px rgba(0,0,0,.07);
      --radius: 18px;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      background: linear-gradient(#f7f8fc, #f2f4fb);
      color:var(--text);
    }
    a{color:var(--blue);text-decoration:none}
    a:hover{text-decoration:underline}

    .wrap{max-width:1100px;margin:0 auto;padding:18px}
    .topbar{
      display:flex;gap:14px;align-items:center;justify-content:space-between;
      background:#fff;border:1px solid var(--border);border-radius:22px;
      padding:14px 16px;box-shadow: var(--shadow);
      position:sticky;top:10px;z-index:10;
    }
    .brand{display:flex;align-items:center;gap:12px}
    .logo{font-weight:900;letter-spacing:.2px}
    .links{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
    .pill{
      display:inline-block;
      padding:10px 14px;
      border:2px solid rgba(37,99,235,.35);
      border-radius:18px;
      background:#fff;
      color:var(--blue2);
      font-weight:700;
    }
    .pill.primary{
      background:var(--blue);
      border-color:var(--blue);
      color:#fff;
    }
    .right{color:var(--muted);font-size:14px;white-space:nowrap}
    .grid{display:grid;grid-template-columns:1fr;gap:16px;margin-top:16px}
    @media(min-width:900px){ .grid.two{grid-template-columns:1fr 1fr} }

    .card{
      background:var(--card);
      border:1px solid var(--border);
      border-radius:var(--radius);
      box-shadow: var(--shadow);
      padding:18px;
    }
    h1{margin:8px 0 12px;font-size:40px}
    h2{margin:0 0 10px;font-size:26px}
    h3{margin:14px 0 8px;font-size:18px}
    p{margin:8px 0;color:var(--muted);line-height:1.35}
    .btn{
      display:inline-block;
      padding:10px 14px;
      border-radius:14px;
      border:1px solid var(--border);
      background:#fff;
      font-weight:800;
      cursor:pointer;
    }
    .btn.primary{
      background:var(--blue);
      border-color:var(--blue);
      color:#fff;
    }
    .btn.danger{
      background:#ef4444;
      border-color:#ef4444;
      color:#fff;
    }
    .btn:disabled{opacity:.55;cursor:not-allowed}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .field{display:flex;flex-direction:column;gap:6px;min-width:200px;flex:1}
    label{font-size:13px;color:var(--muted);font-weight:700}
    input, select, textarea{
      width:100%;
      padding:11px 12px;
      border:1px solid var(--border);
      border-radius:14px;
      font-size:15px;
      outline:none;
      background:#fff;
    }
    textarea{min-height:80px}
    .small{font-size:13px;color:var(--muted)}
    .divider{height:1px;background:var(--border);margin:14px 0}
    .badge{
      display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid var(--border);
      color:var(--muted);font-weight:800;font-size:12px;background:#fff;
    }
    .sectionTitle{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .muted{color:var(--muted)}
    .k{font-weight:900}
    .table{width:100%;border-collapse:separate;border-spacing:0 10px}
    .table td{padding:10px 12px;background:#fff;border:1px solid var(--border)}
    .table tr td:first-child{border-top-left-radius:14px;border-bottom-left-radius:14px}
    .table tr td:last-child{border-top-right-radius:14px;border-bottom-right-radius:14px}
    .checkRow{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
    .checkRow label{display:flex;gap:8px;align-items:center;color:var(--text);font-weight:800}
    .checkRow input{width:auto}
  </style>
</head>
<body>
  <div class="wrap">
    ${nav(user)}
    <div class="grid">
      ${body}
    </div>
    <div style="height:18px"></div>
    <div class="small muted">Data persists to: <code>${escapeHtml(DATA_FILE)}</code></div>
  </div>
</body>
</html>`;
}

// --------------------------
// HOME
// --------------------------
app.get("/", (req, res) => {
  const user = getSession(req)?.user ? db.users?.[getSession(req).user] : null;

  const body = `
    <div class="card" style="text-align:center">
      <div style="display:flex;justify-content:center;margin-top:6px">
        <div style="font-size:40px;font-weight:1000;letter-spacing:.3px">SpeedSkateMeet</div>
      </div>
      <p style="max-width:720px;margin:10px auto 0">
        Meet software built for inline speed skating. Simple, mobile-friendly, and designed around how clubs actually run race day.
      </p>

      <div class="divider"></div>

      <div class="row" style="justify-content:center">
        <a class="btn primary" href="/meets">Find a Meet</a>
        <a class="btn primary" href="/rinks">Find a Rink</a>
        <a class="btn" href="/live">Live Race Day</a>
        <a class="btn" href="/login">Admin Login</a>
      </div>

      <div class="divider"></div>

      <div class="small muted">
        Adult ages locked: <b>Classic 25–34</b> · <b>Masters 35–44</b>
      </div>
    </div>
  `;

  res.send(pageShell({ title: "Home", user, body }));
});

// --------------------------
// LOGIN / LOGOUT
// --------------------------
app.get("/login", (req, res) => {
  const body = `
    <div class="card" style="max-width:520px;margin:0 auto">
      <h2>Admin Login</h2>
      <form method="POST" action="/login">
        <div class="field">
          <label>Username</label>
          <input name="username" autocomplete="username" />
        </div>
        <div style="height:10px"></div>
        <div class="field">
          <label>Password</label>
          <input name="password" type="password" autocomplete="current-password" />
        </div>
        <div style="height:14px"></div>
        <button class="btn primary" type="submit">Login</button>

        <div class="divider"></div>
        <div class="small muted">
          Demo usernames:<br/>
          Director: <b>Lbird22</b><br/>
          Judge: <b>JudgeLee</b><br/>
          Coach: <b>CoachLee</b><br/>
          <br/>
          Passwords are never displayed on public pages.
        </div>
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Login", user: null, body }));
});

app.post("/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();
  const u = db.users?.[username];
  if (!u || u.password !== password) {
    return res.send(
      pageShell({
        title: "Login",
        user: null,
        body: `<div class="card" style="max-width:520px;margin:0 auto">
          <h2>Admin Login</h2>
          <p style="color:#ef4444;font-weight:900">Invalid username or password.</p>
          <a class="btn" href="/login">Try again</a>
        </div>`,
      })
    );
  }

  const sid = id("sess");
  db.sessions[sid] = {
    id: sid,
    user: u.username,
    role: u.role,
    createdAt: Date.now(),
  };
  saveDB();

  res.cookie("ssm_session", sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: !!process.env.RENDER, // ok on Render
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });

  res.redirect("/portal");
});

app.get("/logout", (req, res) => {
  const sid = req.cookies?.ssm_session;
  if (sid && db.sessions?.[sid]) {
    delete db.sessions[sid];
    saveDB();
  }
  res.clearCookie("ssm_session");
  res.redirect("/");
});

// --------------------------
// PORTAL / DIRECTOR DASHBOARD
// --------------------------
app.get("/portal", requireAuth, (req, res) => {
  const user = req.user;

  const meetsList = db.meets
    .slice()
    .reverse()
    .map((m) => {
      return `
        <div class="card">
          <div class="sectionTitle">
            <div>
              <div style="font-size:18px;font-weight:1000">${escapeHtml(
                m.name || "New Meet"
              )} <span class="badge">${escapeHtml(m.id)}</span></div>
              <div class="small muted">
                Date: ${escapeHtml(m.date || "TBD")} · Regs: ${m.registrations?.length || 0}
              </div>
            </div>
            <div class="row">
              <a class="btn primary" href="/meet/${encodeURIComponent(m.id)}/builder">Meet Builder</a>
              <a class="btn" href="/meet/${encodeURIComponent(m.id)}/register">Registration</a>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const body = `
    <div class="card">
      <div class="sectionTitle">
        <div>
          <h2 style="margin:0">Director Dashboard</h2>
          <p>Build meets, open registration, and manage meet settings.</p>
        </div>
        <form method="POST" action="/meet/new">
          <button class="btn primary" type="submit">Build New Meet</button>
        </form>
      </div>
    </div>

    ${meetsList || `<div class="card"><p>No meets yet. Click <b>Build New Meet</b>.</p></div>`}
  `;

  res.send(pageShell({ title: "Portal", user, body }));
});

app.post("/meet/new", requireAuth, (req, res) => {
  const meet = {
    id: id("meet"),
    name: `New Meet`,
    date: "TBD",
    createdAt: Date.now(),
    updatedAt: Date.now(),

    // Meet Builder config
    divisions: defaultDivisions(),
    timeTrials: {
      enabled: false,
      notes: "",
      needJudgesPanel: true,
    },
    relays: {
      enabled: false,
      notes: "",
    },

    registrations: [],
  };
  db.meets.push(meet);
  saveDB();
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
});

// --------------------------
// DEFAULT DIVISIONS (simple + adjustable later)
// --------------------------
function defaultDivisions() {
  // Keep it simple for now. You can edit these later in code or add UI.
  // Ages are informational labels for now (registration is age input based).
  return [
    { key: "tiny_tot_girls", label: "Tiny Tot Girls", age: "0–5" },
    { key: "tiny_tot_boys", label: "Tiny Tot Boys", age: "0–5" },
    { key: "primary_girls", label: "Primary Girls", age: "6–7" },
    { key: "primary_boys", label: "Primary Boys", age: "6–7" },
    { key: "juvenile_girls", label: "Juvenile Girls", age: "8–9" },
    { key: "juvenile_boys", label: "Juvenile Boys", age: "8–9" },
    { key: "junior_girls", label: "Junior Girls", age: "10–11" },
    { key: "junior_boys", label: "Junior Boys", age: "10–11" },
    { key: "cadet_girls", label: "Cadet Girls", age: "12–13" },
    { key: "cadet_boys", label: "Cadet Boys", age: "12–13" },
    { key: "youth_women", label: "Youth Women", age: "14–15" },
    { key: "youth_men", label: "Youth Men", age: "14–15" },
    { key: "junior_women", label: "Junior Women", age: "16–17" },
    { key: "junior_men", label: "Junior Men", age: "16–17" },
    { key: "senior_women", label: "Senior Women", age: "18–24" },
    { key: "senior_men", label: "Senior Men", age: "18–24" },
    { key: "classic_women", label: "Classic Women", age: "25–34 (locked)" },
    { key: "classic_men", label: "Classic Men", age: "25–34 (locked)" },
    { key: "masters_women", label: "Masters Women", age: "35–44 (locked)" },
    { key: "masters_men", label: "Masters Men", age: "35–44 (locked)" },
    { key: "esquire_women", label: "Esquire Women", age: "55–64" },
  ].map((d) => ({
    ...d,
    // per-division config:
    novice: { enabled: true, cost: 0, d1: "", d2: "", d3: "", d4: "" },
    elite: { enabled: true, cost: 0, d1: "", d2: "", d3: "", d4: "" },
    open: { enabled: true, cost: 0, d1: "", d2: "", d3: "", d4: "" },
  }));
}

// --------------------------
// MEET BUILDER
// --------------------------
app.get("/meet/:meetId/builder", requireAuth, (req, res) => {
  const user = req.user;
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const templates = db.meetTemplates
    .slice()
    .reverse()
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
    .join("");

  const divisionCards = (meet.divisions || [])
    .map((d) => {
      return `
      <div class="card">
        <div class="sectionTitle">
          <div>
            <div style="font-size:22px;font-weight:1000">${escapeHtml(d.label)} <span class="badge">${escapeHtml(d.age)}</span></div>
            <div class="small muted">Configure distances + costs (no dropdowns — just type).</div>
          </div>
        </div>

        ${classBox(meet.id, d.key, "novice", d.novice)}
        ${classBox(meet.id, d.key, "elite", d.elite)}
        ${classBox(meet.id, d.key, "open", d.open)}
      </div>
      `;
    })
    .join("");

  const body = `
    <div class="card">
      <div class="sectionTitle">
        <div>
          <h2 style="margin:0">Meet Builder</h2>
          <p class="muted"><span class="k">${escapeHtml(meet.name)}</span> · ${escapeHtml(meet.date)}</p>
        </div>
        <div class="row">
          <a class="btn" href="/portal">Back to Portal</a>
          <a class="btn primary" href="/meet/${escapeHtml(meet.id)}/register">Open Registration</a>
        </div>
      </div>

      <div class="divider"></div>

      <form method="POST" action="/meet/${escapeHtml(meet.id)}/meta">
        <div class="row">
          <div class="field">
            <label>Meet Name</label>
            <input name="name" value="${escapeHtml(meet.name)}"/>
          </div>
          <div class="field">
            <label>Meet Date</label>
            <input name="date" value="${escapeHtml(meet.date)}" placeholder="TBD or 2026-05-10"/>
          </div>
        </div>
        <div style="height:10px"></div>
        <button class="btn primary" type="submit">Save Meet</button>
      </form>

      <div class="divider"></div>

      <h3>Saved Meets (Templates)</h3>
      <div class="row">
        <form method="POST" action="/meet/${escapeHtml(meet.id)}/save-template" class="row" style="width:100%">
          <div class="field">
            <label>Save meet as (template name)</label>
            <input name="templateName" placeholder="Example: USARS Indoor Standard"/>
          </div>
          <div style="align-self:flex-end">
            <button class="btn" type="submit">Save Template</button>
          </div>
        </form>
      </div>
      <div style="height:10px"></div>
      <form method="POST" action="/meet/${escapeHtml(meet.id)}/load-template" class="row">
        <div class="field">
          <label>Load template (overwrites distances/costs/time trials/relays)</label>
          <select name="templateId">
            <option value="">Select a template…</option>
            ${templates}
          </select>
        </div>
        <div style="align-self:flex-end">
          <button class="btn danger" type="submit">Load Template</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h3>Time Trials (Meet-wide)</h3>
      <p class="muted">This tells the system your meet includes Time Trials so you can plan staffing (judges panel). Not per-division clutter.</p>

      <form method="POST" action="/meet/${escapeHtml(meet.id)}/time-trials">
        <div class="checkRow">
          <label><input type="checkbox" name="enabled" ${meet.timeTrials?.enabled ? "checked" : ""}/> Enable Time Trials at this meet</label>
          <label><input type="checkbox" name="needJudgesPanel" ${meet.timeTrials?.needJudgesPanel ? "checked" : ""}/> Need judges panel</label>
        </div>
        <div style="height:10px"></div>
        <div class="field">
          <label>Notes (optional)</label>
          <textarea name="notes" placeholder="Example: run TT before racing, 1 lap + 3 lap…">${escapeHtml(meet.timeTrials?.notes || "")}</textarea>
        </div>
        <div style="height:10px"></div>
        <button class="btn primary" type="submit">Save Time Trials</button>
      </form>
    </div>

    <div class="card">
      <h3>Relays (Meet-wide)</h3>
      <p class="muted">Simple toggle for now. We can build the full Relay Builder next.</p>

      <form method="POST" action="/meet/${escapeHtml(meet.id)}/relays">
        <div class="checkRow">
          <label><input type="checkbox" name="enabled" ${meet.relays?.enabled ? "checked" : ""}/> Enable Relays at this meet</label>
        </div>
        <div style="height:10px"></div>
        <div class="field">
          <label>Notes (optional)</label>
          <textarea name="notes" placeholder="Example: 2 divisions per relay, 4 skaters per team…">${escapeHtml(meet.relays?.notes || "")}</textarea>
        </div>
        <div style="height:10px"></div>
        <button class="btn primary" type="submit">Save Relays</button>
      </form>
    </div>

    ${divisionCards}
  `;

  res.send(pageShell({ title: "Meet Builder", user, body }));
});

function classBox(meetId, divisionKey, classKey, cfg) {
  const c = cfg || { enabled: true, cost: 0, d1: "", d2: "", d3: "", d4: "" };
  const label = classKey.toUpperCase();

  return `
    <div class="card" style="margin-top:14px;background:#fbfcff">
      <form method="POST" action="/meet/${escapeHtml(meetId)}/division/${escapeHtml(
        divisionKey
      )}/${escapeHtml(classKey)}">
        <div class="sectionTitle">
          <div class="checkRow">
            <label><input type="checkbox" name="enabled" ${c.enabled ? "checked" : ""}/> ${escapeHtml(label)}</label>
          </div>
          <div style="min-width:220px" class="field">
            <label>Cost</label>
            <input name="cost" value="${escapeHtml(c.cost)}" />
          </div>
        </div>

        <div style="height:10px"></div>

        <div class="row">
          <div class="field"><label>D1</label><input name="d1" value="${escapeHtml(c.d1)}" placeholder="ex: 1 lap / 500m" /></div>
          <div class="field"><label>D2</label><input name="d2" value="${escapeHtml(c.d2)}" placeholder="ex: 2 lap / 1000m" /></div>
          <div class="field"><label>D3</label><input name="d3" value="${escapeHtml(c.d3)}" placeholder="ex: 3 lap / 1500m" /></div>
          <div class="field"><label>D4</label><input name="d4" value="${escapeHtml(c.d4)}" placeholder="ex: 5 lap / 2500m" /></div>
        </div>

        <div style="height:10px"></div>
        <button class="btn primary" type="submit">Save ${escapeHtml(label)}</button>
      </form>
    </div>
  `;
}

app.post("/meet/:meetId/meta", requireAuth, (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  meet.name = String(req.body.name || "New Meet").trim() || "New Meet";
  meet.date = String(req.body.date || "TBD").trim() || "TBD";
  meet.updatedAt = Date.now();
  saveDB();
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
});

app.post("/meet/:meetId/division/:divKey/:classKey", requireAuth, (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const div = (meet.divisions || []).find((d) => d.key === req.params.divKey);
  if (!div) return res.status(404).send("Division not found");

  const ck = req.params.classKey;
  if (!["novice", "elite", "open"].includes(ck)) return res.status(400).send("Bad classKey");

  div[ck] = {
    enabled: !!req.body.enabled,
    cost: Number(req.body.cost || 0) || 0,
    d1: String(req.body.d1 || "").trim(),
    d2: String(req.body.d2 || "").trim(),
    d3: String(req.body.d3 || "").trim(),
    d4: String(req.body.d4 || "").trim(),
  };

  meet.updatedAt = Date.now();
  saveDB();
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
});

app.post("/meet/:meetId/time-trials", requireAuth, (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  meet.timeTrials = {
    enabled: !!req.body.enabled,
    needJudgesPanel: !!req.body.needJudgesPanel,
    notes: String(req.body.notes || "").trim(),
  };

  meet.updatedAt = Date.now();
  saveDB();
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
});

app.post("/meet/:meetId/relays", requireAuth, (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  meet.relays = {
    enabled: !!req.body.enabled,
    notes: String(req.body.notes || "").trim(),
  };

  meet.updatedAt = Date.now();
  saveDB();
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
});

app.post("/meet/:meetId/save-template", requireAuth, (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const templateName = String(req.body.templateName || "").trim() || "Saved Template";
  const t = {
    id: id("tmpl"),
    name: templateName,
    createdAt: Date.now(),
    divisions: JSON.parse(JSON.stringify(meet.divisions || [])),
    timeTrials: JSON.parse(JSON.stringify(meet.timeTrials || {})),
    relays: JSON.parse(JSON.stringify(meet.relays || {})),
  };

  db.meetTemplates.push(t);
  saveDB();
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
});

app.post("/meet/:meetId/load-template", requireAuth, (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const templateId = String(req.body.templateId || "").trim();
  const t = db.meetTemplates.find((x) => x.id === templateId);
  if (!t) return res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);

  meet.divisions = JSON.parse(JSON.stringify(t.divisions || []));
  meet.timeTrials = JSON.parse(JSON.stringify(t.timeTrials || { enabled: false, notes: "", needJudgesPanel: true }));
  meet.relays = JSON.parse(JSON.stringify(t.relays || { enabled: false, notes: "" }));
  meet.updatedAt = Date.now();
  saveDB();
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
});

// --------------------------
// REGISTRATION (simplified like you asked)
// age + checkboxes (challenge up / novice / elite / open / time trials / relays)
// --------------------------
app.get("/meet/:meetId/register", (req, res) => {
  const user = getSession(req)?.user ? db.users?.[getSession(req).user] : null;
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const body = `
    <div class="card" style="max-width:760px;margin:0 auto">
      <h2>Register</h2>
      <p class="muted"><b>${escapeHtml(meet.name)}</b> · ${escapeHtml(meet.date)} · <span class="badge">Registration OPEN</span></p>

      <form method="POST" action="/meet/${escapeHtml(meet.id)}/register">
        <div class="row">
          <div class="field">
            <label>First Name *</label>
            <input name="firstName" required />
          </div>
          <div class="field">
            <label>Last Name *</label>
            <input name="lastName" required />
          </div>
        </div>

        <div style="height:10px"></div>

        <div class="row">
          <div class="field">
            <label>Team *</label>
            <input name="team" value="Independent" required />
          </div>
          <div class="field">
            <label>USARS Number (optional)</label>
            <input name="usars" placeholder="Optional" />
          </div>
        </div>

        <div style="height:10px"></div>

        <div class="row">
          <div class="field">
            <label>Age *</label>
            <input name="age" inputmode="numeric" placeholder="ex: 12" required />
          </div>
        </div>

        <div style="height:12px"></div>

        <div class="card" style="background:#fbfcff">
          <h3 style="margin:0 0 8px">Options</h3>
          <div class="checkRow">
            <label><input type="checkbox" name="challengeUp"/> Challenge Up (auto bumped per rule)</label>
          </div>

          <div class="divider"></div>

          <div class="checkRow">
            <label><input type="checkbox" name="novice"/> Novice</label>
            <label><input type="checkbox" name="elite"/> Elite</label>
            <label><input type="checkbox" name="open"/> Open</label>
          </div>

          <div style="height:8px"></div>

          <div class="checkRow">
            <label><input type="checkbox" name="timeTrials"/> Time Trials</label>
            <label><input type="checkbox" name="relays"/> Relays</label>
          </div>

          <div class="small muted" style="margin-top:10px">
            This assigns your check-in / skater number.
          </div>
        </div>

        <div style="height:14px"></div>
        <button class="btn primary" type="submit">Register</button>
        <a class="btn" href="/meets">Back</a>
      </form>
    </div>
  `;

  res.send(pageShell({ title: "Register", user, body }));
});

app.post("/meet/:meetId/register", (req, res) => {
  const meet = db.meets.find((m) => m.id === req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  meet.registrations = meet.registrations || [];

  const regNum = meet.registrations.length + 1; // meet number / check-in number
  const r = {
    id: id("reg"),
    regNum,
    firstName: String(req.body.firstName || "").trim(),
    lastName: String(req.body.lastName || "").trim(),
    team: String(req.body.team || "").trim(),
    usars: String(req.body.usars || "").trim(),
    age: Number(req.body.age || 0) || null,

    flags: {
      challengeUp: !!req.body.challengeUp,
      novice: !!req.body.novice,
      elite: !!req.body.elite,
      open: !!req.body.open,
      timeTrials: !!req.body.timeTrials,
      relays: !!req.body.relays,
    },

    createdAt: Date.now(),
  };

  meet.registrations.push(r);
  meet.updatedAt = Date.now();
  saveDB();

  res.send(
    pageShell({
      title: "Registered",
      user: null,
      body: `
        <div class="card" style="max-width:760px;margin:0 auto">
          <h2>Registered ✅</h2>
          <p class="muted"><b>${escapeHtml(meet.name)}</b></p>
          <div class="divider"></div>
          <div class="row">
            <div class="card" style="flex:1">
              <div class="small muted">Skater</div>
              <div style="font-size:22px;font-weight:1000">${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)}</div>
              <div class="small muted">Team: ${escapeHtml(r.team)}</div>
            </div>
            <div class="card" style="min-width:220px">
              <div class="small muted">Meet #</div>
              <div style="font-size:34px;font-weight:1000">${r.regNum}</div>
              <div class="small muted">Use for check-in + number</div>
            </div>
          </div>

          <div class="divider"></div>

          <a class="btn primary" href="/meet/${escapeHtml(meet.id)}/register">Register another</a>
          <a class="btn" href="/meets">Find a Meet</a>
        </div>
      `,
    })
  );
});

// --------------------------
// MEETS LIST (public)
// --------------------------
app.get("/meets", (req, res) => {
  const user = getSession(req)?.user ? db.users?.[getSession(req).user] : null;

  const rows =
    db.meets.length === 0
      ? `<div class="card"><p>No meets yet.</p></div>`
      : db.meets
          .slice()
          .reverse()
          .map((m) => {
            return `
            <div class="card">
              <div class="sectionTitle">
                <div>
                  <div style="font-size:20px;font-weight:1000">${escapeHtml(m.name)}</div>
                  <div class="small muted">Date: ${escapeHtml(m.date)} · Regs: ${m.registrations?.length || 0}</div>
                </div>
                <div class="row">
                  <a class="btn primary" href="/meet/${escapeHtml(m.id)}/register">Register</a>
                  ${user ? `<a class="btn" href="/meet/${escapeHtml(m.id)}/builder">Meet Builder</a>` : ""}
                </div>
              </div>
            </div>
          `;
          })
          .join("");

  res.send(
    pageShell({
      title: "Find a Meet",
      user,
      body: `
        <div class="card">
          <h2>Meets</h2>
          <p class="muted">Choose a meet to register.</p>
        </div>
        ${rows}
      `,
    })
  );
});

// --------------------------
// RINKS
// --------------------------
app.get("/rinks", (req, res) => {
  const user = getSession(req)?.user ? db.users?.[getSession(req).user] : null;

  const cards = (db.rinks || [])
    .map((r) => {
      return `
      <div class="card">
        <h2 style="margin:0 0 8px">${escapeHtml(r.name)}</h2>
        <div class="small muted">${escapeHtml(r.city)} · Team: ${escapeHtml(r.team || "—")}</div>
        <div class="divider"></div>
        <div><b>Phone:</b> ${escapeHtml(r.phone || "—")}</div>
        <div><b>Address:</b> ${escapeHtml(r.address || "—")}</div>
        <div><b>Website:</b> ${r.website ? `<a href="https://${escapeHtml(r.website)}" target="_blank" rel="noreferrer">${escapeHtml(r.website)}</a>` : "—"}</div>
      </div>
    `;
    })
    .join("");

  res.send(
    pageShell({
      title: "Find a Rink",
      user,
      body: `
        <div class="card">
          <h2>Rinks</h2>
          <p class="muted">Rinks and clubs.</p>
        </div>
        ${cards || `<div class="card"><p>No rinks yet.</p></div>`}
      `,
    })
  );
});

// --------------------------
// LIVE (placeholder)
// --------------------------
app.get("/live", (req, res) => {
  const user = getSession(req)?.user ? db.users?.[getSession(req).user] : null;
  res.send(
    pageShell({
      title: "Live Race Day",
      user,
      body: `
        <div class="card">
          <h2>Live Race Day</h2>
          <p class="muted">Placeholder page. Next: wire this to blocks + judges panels.</p>
        </div>
      `,
    })
  );
});

// --------------------------
// START SERVER
// --------------------------
app.listen(PORT, HOST, () => {
  console.log(`
============================================================
SpeedSkateMeet — CLEAN REBUILD v8
Data: ${DATA_FILE}

Login page:
- Demo usernames (passwords not displayed publicly)

Time Trials:
- Meet-wide config (no per-division clutter)
Relays:
- Meet-wide toggle + notes

Local: http://localhost:${PORT}
============================================================
`.trim());
});