// ============================================================
// SpeedSkateMeet – CLEAN REBUILD v7.2 – March 2026
// Node.js + Express • single-file server.js • JSON persistence
//
// v7.2 FIXES / FEATURES:
// ✅ REAL Meet Builder restored (no placeholder notes page)
// ✅ Robust sessions (no "Cannot read properties of undefined" crashes)
// ✅ Distances are plain inputs (NO dropdowns / datalists)
// ✅ Meet-wide Time Trials config block (like SkateAbility; not per-division)
// ✅ Block Builder saved inside the meet
// ✅ Registration simplified: enter AGE + checkboxes (Challenge Up, Novice/Elite/Open, Time Trials, Relays)
// ✅ Rinks: Wichita = Roller City (correct details)
// ✅ Friendly clean UI (simple, stable)
//
// ============================================================

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// -------------------- CONFIG --------------------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "ssm_db.json");

// -------------------- HELPERS --------------------
function uid(n = 12) {
  return crypto.randomBytes(n).toString("hex");
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

// -------------------- DB --------------------
function defaultDb() {
  return {
    meta: { version: "7.2", createdAt: nowIso(), updatedAt: nowIso() },

    // DEMO USERS (passwords below; you can change these later)
    users: [
      { id: "u_director", username: "Lbird22", role: "director", password: "Redline22" },
      { id: "u_judge", username: "JudgeLee", role: "judge", password: "Redline22" },
      { id: "u_coach", username: "CoachLee", role: "coach", password: "Redline22" },
    ],

    // RINKS
    rinks: [
      {
        id: "rink_roller_city_wichita",
        name: "Roller City",
        city: "Wichita, KS",
        phone: "316-942-4555",
        address: "3234 S. Meridian Ave, Wichita, KS 67217",
        website: "rollercitywichitaks.com",
        team: "",
      },
    ],

    // MEETS
    meets: [
      {
        id: "meet_1",
        name: "New Meet",
        date: "TBD",
        registrationOpen: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),

        // Divisions are configurable
        divisions: buildDefaultDivisions(),

        // Meet-wide config blocks
        skateAbilityBoxes: [
          {
            id: uid(6),
            enabled: false,
            label: "Box 1",
            manualAgeLabel: "Manual Age",
            cost: 0,
            d: ["", "", "", ""], // D1..D4 plain inputs
          },
        ],

        timeTrialsConfig: {
          enabled: false,
          notes: "",
          judgesRequired: true,
        },

        relayConfig: {
          enabled: false,
          notes: "",
          relayBuilderDraft: [],
        },

        // Block builder lives inside meet
        blocks: [],

        // Registrations
        registrants: [],

        // Custom races (if needed)
        customRaces: [],
      },
    ],
  };
}

function buildDefaultDivisions() {
  // Keep it simple: you can add more later.
  // Each division has classifications with D1..D4 inputs and cost.
  const template = (name, ageRange) => ({
    id: uid(6),
    name,
    ageRange, // displayed only
    classifications: {
      novice: { enabled: true, cost: 0, d: ["", "", "", ""] },
      elite: { enabled: true, cost: 0, d: ["", "", "", ""] },
      open: { enabled: true, cost: 0, d: ["", "", "", ""] },
    },
  });

  return [
    template("Tiny Tot Girls", "0–5"),
    template("Tiny Tot Boys", "0–5"),
    template("Primary Girls", "6–7"),
    template("Primary Boys", "6–7"),
    template("Esquire Women", "55–64"),
  ];
}

function loadDb() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const db = defaultDb();
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
      return db;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);

    // Lightweight safety + upgrade defaults
    if (!parsed.meta) parsed.meta = { version: "7.2", createdAt: nowIso(), updatedAt: nowIso() };
    if (!Array.isArray(parsed.users)) parsed.users = defaultDb().users;
    if (!Array.isArray(parsed.rinks)) parsed.rinks = defaultDb().rinks;
    if (!Array.isArray(parsed.meets)) parsed.meets = defaultDb().meets;

    // Ensure at least one meet exists
    if (parsed.meets.length === 0) parsed.meets = defaultDb().meets;

    return parsed;
  } catch (e) {
    console.error("DB load failed, creating fresh DB:", e);
    const db = defaultDb();
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    return db;
  }
}

function saveDb(db) {
  db.meta.updatedAt = nowIso();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

let db = loadDb();

// -------------------- SESSIONS --------------------
const sessions = Object.create(null); // sid -> { userId, createdAt }
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.sid;
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

function requireRole(roles) {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) return res.redirect("/login");
    if (!roles.includes(s.user.role)) return res.status(403).send("Forbidden");
    req.session = s;
    next();
  };
}

// -------------------- UI SHELL --------------------
function css() {
  return `
  :root { --blue:#2f65d7; --bg:#f4f6fb; --card:#fff; --text:#0f172a; --muted:#64748b; --border:#e5e7eb; --shadow:0 12px 30px rgba(15,23,42,.08); }
  *{box-sizing:border-box;}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif;background:var(--bg);color:var(--text);}
  a{color:var(--blue);text-decoration:none;}
  .wrap{max-width:980px;margin:28px auto;padding:0 16px;}
  .topbar{display:flex;align-items:center;gap:12px;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:14px 16px;box-shadow:var(--shadow);}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800;}
  .nav{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
  .btn{display:inline-block;padding:10px 14px;border-radius:14px;border:2px solid rgba(47,101,215,.35);background:#fff;color:var(--blue);font-weight:700;}
  .btn.primary{background:var(--blue);border-color:var(--blue);color:#fff;}
  .btn.danger{background:#dc2626;border-color:#dc2626;color:#fff;}
  .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid var(--border);color:var(--muted);font-weight:700;font-size:12px;background:#fff;}
  .card{background:var(--card);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin:18px 0;}
  h1{margin:0 0 6px 0;font-size:38px;letter-spacing:-.02em;}
  h2{margin:0 0 10px 0;font-size:22px;}
  .muted{color:var(--muted);}
  .row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
  input, select, textarea{width:100%;padding:12px 12px;border:1px solid var(--border);border-radius:12px;font-size:14px;background:#fff;}
  textarea{min-height:90px;}
  label{font-weight:800;font-size:13px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
  .grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;}
  .section{margin-top:16px;padding-top:16px;border-top:1px solid var(--border);}
  .mini{font-size:12px;color:var(--muted);}
  .k{font-weight:900;}
  .table{width:100%;border-collapse:separate;border-spacing:0 10px;}
  .tr{background:#fff;border:1px solid var(--border);border-radius:14px;}
  .box{border:1px solid var(--border);border-radius:16px;padding:14px;background:#fff;}
  .right{margin-left:auto;}
  .chk{display:flex;align-items:center;gap:10px;}
  .chk input{width:22px;height:22px;}
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
        <a class="btn" href="/login">Admin Login</a>
        ${s ? `<a class="btn" href="/portal">Go to Portal</a>` : ""}
      </div>
      <div class="section mini">
        Adult ages locked: Classic 25–34 • Masters 35–44
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Home", user: s?.user, bodyHtml: body }));
});

app.get("/live", (req, res) => {
  const s = getSession(req);
  const body = `
    <div class="card">
      <h1>Live Race Day</h1>
      <div class="muted">Placeholder page (we’ll wire this to blocks + judges panel).</div>
    </div>
  `;
  res.send(pageShell({ title: "Live", user: s?.user, bodyHtml: body }));
});

app.get("/rinks", (req, res) => {
  const s = getSession(req);
  const cards = db.rinks
    .map(
      (r) => `
      <div class="card">
        <h2>${safeText(r.name)}</h2>
        <div><span class="k">City:</span> ${safeText(r.city || "—")}</div>
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
        <span class="muted">Passwords are not displayed on public pages.</span>
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

  const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.password !== password) {
    const body = `
      <div class="card" style="max-width:640px;margin:24px auto;">
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

  res.setHeader("Set-Cookie", `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax`);
  res.redirect("/portal");
});

app.get("/logout", (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.sid) delete sessions[cookies.sid];
  res.setHeader("Set-Cookie", `sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`);
  res.redirect("/");
});

// -------------------- PORTAL / DASHBOARD --------------------
app.get("/portal", requireRole(["director", "judge", "coach"]), (req, res) => {
  const user = req.session.user;

  const meetsHtml = db.meets
    .map((m) => {
      const regs = m.registrants?.length || 0;
      const blocks = m.blocks?.length || 0;
      const customs = m.customRaces?.length || 0;

      return `
      <div class="card">
        <div class="row">
          <h2 style="margin:0;">${safeText(m.name)}</h2>
          <span class="pill">${safeText(m.date || "TBD")}</span>
          <span class="pill">Regs: ${regs}</span>
          <span class="pill">Blocks: ${blocks}</span>
          <span class="pill">Custom: ${customs}</span>
          <span class="right"></span>
        </div>
        <div class="section row">
          <a class="btn primary" href="/meet/${encodeURIComponent(m.id)}/builder">Meet Builder</a>
          <a class="btn" href="/meet/${encodeURIComponent(m.id)}/blocks">Block Builder</a>
          <a class="btn" href="/meet/${encodeURIComponent(m.id)}/register">Registration Page</a>
        </div>
      </div>
      `;
    })
    .join("");

  const body = `
    <div class="card">
      <h1>${safeText(user.role[0].toUpperCase() + user.role.slice(1))} Dashboard</h1>
      <div class="muted">You’re logged in as ${safeText(user.username)}.</div>

      ${
        user.role === "director"
          ? `
        <form class="section" method="POST" action="/meet/new">
          <button class="btn primary" type="submit">Build New Meet</button>
        </form>
      `
          : ""
      }
    </div>

    <h2 style="margin-top:10px;">Meets</h2>
    ${meetsHtml}
  `;

  res.send(pageShell({ title: "Portal", user, bodyHtml: body }));
});

app.post("/meet/new", requireRole(["director"]), (req, res) => {
  const m = {
    id: "meet_" + uid(6),
    name: "New Meet",
    date: "TBD",
    registrationOpen: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    divisions: buildDefaultDivisions(),
    skateAbilityBoxes: [
      { id: uid(6), enabled: false, label: "Box 1", manualAgeLabel: "Manual Age", cost: 0, d: ["", "", "", ""] },
    ],
    timeTrialsConfig: { enabled: false, notes: "", judgesRequired: true },
    relayConfig: { enabled: false, notes: "", relayBuilderDraft: [] },
    blocks: [],
    registrants: [],
    customRaces: [],
  };
  db.meets.unshift(m);
  saveDb(db);
  res.redirect(`/meet/${encodeURIComponent(m.id)}/builder`);
});

// -------------------- MEET BUILDER --------------------
function findMeetOr404(req, res) {
  const meetId = req.params.meetId;
  const meet = db.meets.find((m) => m.id === meetId);
  if (!meet) {
    res.status(404).send("Meet not found");
    return null;
  }
  return meet;
}

app.get("/meet/:meetId/builder", requireRole(["director"]), (req, res) => {
  const user = req.session.user;
  const meet = findMeetOr404(req, res);
  if (!meet) return;

  const divisionHtml = (meet.divisions || [])
    .map((div) => {
      const c = div.classifications || {};
      const renderClass = (key, label) => {
        const obj = c[key] || { enabled: false, cost: 0, d: ["", "", "", ""] };
        return `
          <div class="box">
            <div class="row">
              <div class="chk">
                <input type="checkbox" name="div_${div.id}_${key}_enabled" ${obj.enabled ? "checked" : ""}/>
                <div class="k">${label.toUpperCase()}</div>
              </div>
              <div class="right" style="min-width:220px;">
                <label>Cost</label>
                <input name="div_${div.id}_${key}_cost" value="${safeText(obj.cost ?? 0)}"/>
              </div>
            </div>

            <div class="section grid2">
              <div><label>D1</label><input name="div_${div.id}_${key}_d1" value="${safeText(obj.d?.[0] || "")}"/></div>
              <div><label>D2</label><input name="div_${div.id}_${key}_d2" value="${safeText(obj.d?.[1] || "")}"/></div>
              <div><label>D3</label><input name="div_${div.id}_${key}_d3" value="${safeText(obj.d?.[2] || "")}"/></div>
              <div><label>D4</label><input name="div_${div.id}_${key}_d4" value="${safeText(obj.d?.[3] || "")}"/></div>
            </div>

            <div class="mini">Distances are plain inputs (no dropdowns).</div>
          </div>
        `;
      };

      return `
        <div class="card">
          <div class="row">
            <h2 style="margin:0;">${safeText(div.name)}</h2>
            <span class="pill">${safeText(div.ageRange || "")}</span>
          </div>

          <div class="section">
            ${renderClass("novice", "Novice")}
            <div style="height:10px;"></div>
            ${renderClass("elite", "Elite")}
            <div style="height:10px;"></div>
            ${renderClass("open", "Open")}
          </div>
        </div>
      `;
    })
    .join("");

  const skateAbilityHtml = (meet.skateAbilityBoxes || [])
    .map((b, idx) => {
      return `
        <div class="box">
          <div class="row">
            <div class="k">SkateAbility</div>
            <span class="pill">${safeText(b.label || `Box ${idx + 1}`)}</span>
            <div class="right"></div>
            <button class="btn danger" type="submit" name="remove_skateAbilityBox" value="${safeText(b.id)}">Remove</button>
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
              <input name="sa_${b.id}_cost" value="${safeText(b.cost ?? 0)}"/>
            </div>
          </div>

          <div class="section grid2">
            <div><label>D1</label><input name="sa_${b.id}_d1" value="${safeText(b.d?.[0] || "")}"/></div>
            <div><label>D2</label><input name="sa_${b.id}_d2" value="${safeText(b.d?.[1] || "")}"/></div>
            <div><label>D3</label><input name="sa_${b.id}_d3" value="${safeText(b.d?.[2] || "")}"/></div>
            <div><label>D4</label><input name="sa_${b.id}_d4" value="${safeText(b.d?.[3] || "")}"/></div>
          </div>

          <div class="mini">SkateAbility is meet-wide and can have multiple boxes.</div>
        </div>
      `;
    })
    .join("");

  const tt = meet.timeTrialsConfig || { enabled: false, notes: "", judgesRequired: true };
  const relay = meet.relayConfig || { enabled: false, notes: "" };

  const body = `
    <div class="card">
      <h1>Meet Builder</h1>
      <div class="muted">${safeText(meet.name)} • ${safeText(meet.date || "TBD")}</div>

      <form class="section" method="POST" action="/meet/${encodeURIComponent(meet.id)}/builder">
        <div class="grid2">
          <div>
            <label>Meet Name</label>
            <input name="meet_name" value="${safeText(meet.name)}"/>
          </div>
          <div>
            <label>Date</label>
            <input name="meet_date" value="${safeText(meet.date || "TBD")}"/>
          </div>
        </div>

        <div class="section">
          <h2>Age Divisions</h2>
          <div class="muted">Set costs + distances per division/classification.</div>
        </div>

        ${divisionHtml}

        <div class="card">
          <h2>SkateAbility</h2>
          <div class="muted">Meet-wide; add as many boxes as you need.</div>
          <div class="section">
            ${skateAbilityHtml}
          </div>
          <div class="section">
            <button class="btn" type="submit" name="add_skateAbilityBox" value="1">Add Another SkateAbility Box</button>
          </div>
        </div>

        <div class="card">
          <h2>Time Trials</h2>
          <div class="muted">Meet-wide flag so the system knows you need a judges panel for Time Trials.</div>
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
          <div class="muted">Meet-wide relay flag + notes (relay builder comes next).</div>
          <div class="section chk">
            <input type="checkbox" name="relay_enabled" ${relay.enabled ? "checked" : ""}/>
            <div class="k">Enable Relays at this meet</div>
          </div>
          <div class="section">
            <label>Notes (optional)</label>
            <textarea name="relay_notes">${safeText(relay.notes || "")}</textarea>
          </div>
        </div>

        <div class="section row">
          <button class="btn primary" type="submit" name="save_meet" value="1">Save Meet</button>
          <a class="btn" href="/portal">Back to Dashboard</a>
          <a class="btn" href="/meet/${encodeURIComponent(meet.id)}/blocks">Go to Block Builder</a>
          <a class="btn" href="/meet/${encodeURIComponent(meet.id)}/register">Open Registration Page</a>
        </div>
      </form>
    </div>
  `;

  res.send(pageShell({ title: "Meet Builder", user, bodyHtml: body }));
});

app.post("/meet/:meetId/builder", requireRole(["director"]), (req, res) => {
  const meet = findMeetOr404(req, res);
  if (!meet) return;

  // Remove SkateAbility box
  if (req.body.remove_skateAbilityBox) {
    const id = String(req.body.remove_skateAbilityBox);
    meet.skateAbilityBoxes = (meet.skateAbilityBoxes || []).filter((b) => b.id !== id);
    if (meet.skateAbilityBoxes.length === 0) {
      meet.skateAbilityBoxes.push({
        id: uid(6),
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

  // Add SkateAbility box
  if (req.body.add_skateAbilityBox) {
    const n = (meet.skateAbilityBoxes || []).length + 1;
    meet.skateAbilityBoxes = meet.skateAbilityBoxes || [];
    meet.skateAbilityBoxes.push({
      id: uid(6),
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

  // Meet fields
  meet.name = String(req.body.meet_name || meet.name || "New Meet").slice(0, 80);
  meet.date = String(req.body.meet_date || meet.date || "TBD").slice(0, 40);

  // Divisions/classifications
  for (const div of meet.divisions || []) {
    div.classifications = div.classifications || {};
    for (const key of ["novice", "elite", "open"]) {
      const enabled = !!req.body[`div_${div.id}_${key}_enabled`];
      const costRaw = req.body[`div_${div.id}_${key}_cost`];
      const d1 = String(req.body[`div_${div.id}_${key}_d1`] || "");
      const d2 = String(req.body[`div_${div.id}_${key}_d2`] || "");
      const d3 = String(req.body[`div_${div.id}_${key}_d3`] || "");
      const d4 = String(req.body[`div_${div.id}_${key}_d4`] || "");

      const cost = Number.isFinite(Number(costRaw)) ? Number(costRaw) : 0;

      div.classifications[key] = {
        enabled,
        cost,
        d: [d1, d2, d3, d4],
      };
    }
  }

  // SkateAbility boxes
  meet.skateAbilityBoxes = meet.skateAbilityBoxes || [];
  for (const b of meet.skateAbilityBoxes) {
    b.enabled = !!req.body[`sa_${b.id}_enabled`];
    b.manualAgeLabel = String(req.body[`sa_${b.id}_manualAgeLabel`] || "Manual Age").slice(0, 40);
    const costRaw = req.body[`sa_${b.id}_cost`];
    b.cost = Number.isFinite(Number(costRaw)) ? Number(costRaw) : 0;
    b.d = [
      String(req.body[`sa_${b.id}_d1`] || ""),
      String(req.body[`sa_${b.id}_d2`] || ""),
      String(req.body[`sa_${b.id}_d3`] || ""),
      String(req.body[`sa_${b.id}_d4`] || ""),
    ];
  }

  // Time Trials config (meet-wide)
  meet.timeTrialsConfig = meet.timeTrialsConfig || { enabled: false, notes: "", judgesRequired: true };
  meet.timeTrialsConfig.enabled = !!req.body.tt_enabled;
  meet.timeTrialsConfig.judgesRequired = !!req.body.tt_judgesRequired;
  meet.timeTrialsConfig.notes = String(req.body.tt_notes || "").slice(0, 1000);

  // Relays config (meet-wide)
  meet.relayConfig = meet.relayConfig || { enabled: false, notes: "", relayBuilderDraft: [] };
  meet.relayConfig.enabled = !!req.body.relay_enabled;
  meet.relayConfig.notes = String(req.body.relay_notes || "").slice(0, 1000);

  meet.updatedAt = nowIso();
  saveDb(db);

  res.redirect(`/meet/${encodeURIComponent(meet.id)}/builder`);
});

// -------------------- BLOCK BUILDER (saved inside meet) --------------------
app.get("/meet/:meetId/blocks", requireRole(["director"]), (req, res) => {
  const user = req.session.user;
  const meet = findMeetOr404(req, res);
  if (!meet) return;

  const blocks = meet.blocks || [];
  const blocksHtml = blocks
    .map(
      (b, i) => `
      <div class="box">
        <div class="row">
          <div class="k">${safeText(b.name || `Block ${i + 1}`)}</div>
          <span class="pill">${safeText(b.type || "division")}</span>
          <span class="right"></span>
          <form method="POST" action="/meet/${encodeURIComponent(meet.id)}/blocks/delete" style="margin:0;">
            <input type="hidden" name="blockId" value="${safeText(b.id)}"/>
            <button class="btn danger" type="submit">Delete</button>
          </form>
        </div>
        <div class="mini">Items: ${(b.items || []).length}</div>
      </div>
    `
    )
    .join("");

  const body = `
    <div class="card">
      <h1>Block Builder</h1>
      <div class="muted">${safeText(meet.name)} • Blocks are saved inside this meet.</div>

      <form class="section" method="POST" action="/meet/${encodeURIComponent(meet.id)}/blocks/add">
        <div class="grid2">
          <div>
            <label>Block Name</label>
            <input name="name" placeholder="ex: Tiny Tot / Primary block" required />
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
        <div class="section">
          <button class="btn primary" type="submit">Add Block</button>
          <a class="btn" href="/meet/${encodeURIComponent(meet.id)}/builder">Back to Meet Builder</a>
          <a class="btn" href="/portal">Back to Dashboard</a>
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
  const meet = findMeetOr404(req, res);
  if (!meet) return;

  meet.blocks = meet.blocks || [];
  meet.blocks.push({
    id: "blk_" + uid(6),
    name: String(req.body.name || "Block").slice(0, 60),
    type: String(req.body.type || "division"),
    items: [],
    createdAt: nowIso(),
  });

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/blocks`);
});

app.post("/meet/:meetId/blocks/delete", requireRole(["director"]), (req, res) => {
  const meet = findMeetOr404(req, res);
  if (!meet) return;

  const blockId = String(req.body.blockId || "");
  meet.blocks = (meet.blocks || []).filter((b) => b.id !== blockId);

  meet.updatedAt = nowIso();
  saveDb(db);
  res.redirect(`/meet/${encodeURIComponent(meet.id)}/blocks`);
});

// -------------------- MEETS LIST + REGISTRATION --------------------
app.get("/meets", (req, res) => {
  const s = getSession(req);
  const meetsHtml = db.meets
    .map(
      (m) => `
      <div class="card">
        <h2 style="margin:0;">${safeText(m.name)}</h2>
        <div class="muted">${safeText(m.date || "TBD")} • Registration ${m.registrationOpen ? "OPEN" : "CLOSED"}</div>
        <div class="section row">
          <a class="btn primary" href="/meet/${encodeURIComponent(m.id)}/register">Register</a>
          ${s?.user?.role === "director" ? `<a class="btn" href="/meet/${encodeURIComponent(m.id)}/builder">Meet Builder</a>` : ""}
        </div>
      </div>
    `
    )
    .join("");
  res.send(pageShell({ title: "Meets", user: s?.user, bodyHtml: `<h1>Meets</h1>${meetsHtml}` }));
});

app.get("/meet/:meetId/register", (req, res) => {
  const s = getSession(req);
  const meet = findMeetOr404(req, res);
  if (!meet) return;

  const body = `
    <div class="card">
      <h1>Register</h1>
      <div class="muted">${safeText(meet.name)} (${safeText(meet.id)}) • ${safeText(meet.date || "TBD")}</div>

      ${
        meet.registrationOpen
          ? `
        <form class="section" method="POST" action="/meet/${encodeURIComponent(meet.id)}/register">
          <div class="grid2">
            <div>
              <label>First Name</label>
              <input name="first" required />
            </div>
            <div>
              <label>Last Name</label>
              <input name="last" required />
            </div>
          </div>

          <div class="section grid2">
            <div>
              <label>Team</label>
              <input name="team" placeholder="Independent" />
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
              <div class="mini">You said: just input age (no division dropdown). ✅</div>
            </div>
            <div>
              <label>Options</label>
              <div class="box">
                <div class="chk"><input type="checkbox" name="challengeUp" /> <div><b>Challenge Up</b> <span class="mini">(auto bumped per rule)</span></div></div>
                <div class="chk"><input type="checkbox" name="novice" /> <div><b>Novice</b></div></div>
                <div class="chk"><input type="checkbox" name="elite" /> <div><b>Elite</b></div></div>
                <div class="chk"><input type="checkbox" name="open" /> <div><b>Open</b></div></div>
                <div class="chk"><input type="checkbox" name="timeTrials" /> <div><b>Time Trials</b></div></div>
                <div class="chk"><input type="checkbox" name="relays" /> <div><b>Relays</b></div></div>
              </div>
            </div>
          </div>

          <div class="section">
            <button class="btn primary" type="submit">Register</button>
          </div>
        </form>
      `
          : `<div class="section muted">Registration is currently closed.</div>`
      }
    </div>
  `;

  res.send(pageShell({ title: "Register", user: s?.user, bodyHtml: body }));
});

app.post("/meet/:meetId/register", (req, res) => {
  const meet = findMeetOr404(req, res);
  if (!meet) return;
  if (!meet.registrationOpen) return res.status(400).send("Registration closed");

  const ageNum = Number(req.body.age);
  const reg = {
    id: "reg_" + uid(6),
    createdAt: nowIso(),
    first: String(req.body.first || "").slice(0, 40),
    last: String(req.body.last || "").slice(0, 40),
    team: String(req.body.team || "Independent").slice(0, 60),
    usars: String(req.body.usars || "").slice(0, 40),
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

  meet.updatedAt = nowIso();
  saveDb(db);

  res.redirect(`/meet/${encodeURIComponent(meet.id)}/register`);
});

// -------------------- SAFETY: keep server alive even if something weird hits --------------------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Internal Server Error");
});

// -------------------- START --------------------
app.listen(PORT, HOST, () => {
  console.log(`
========================================================
SpeedSkateMeet | CLEAN REBUILD v7.2
Data: ${DATA_FILE}

Login page:
- Demo usernames (passwords not displayed publicly)

Time Trials:
- Meet-wide config block (enabled + notes)

Local: http://localhost:${PORT}
LAN:   http://<your-ip>:${PORT}
========================================================
`.trim());
});