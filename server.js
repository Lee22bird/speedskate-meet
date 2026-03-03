// ============================================================
// SpeedSkateMeet – CLEAN REBUILD v9 (single-file server.js)
// Node.js + Express • JSON persistence
//
// FIXES INCLUDED:
// ✅ No default meets shown until user creates one
// ✅ Rinks default: Roller City (Wichita, KS) only (no fake Wichita Skate Center)
// ✅ Meet Builder generates Race List (unassigned races) from enabled divisions + D1–D4 distances
// ✅ Block Builder restored:
//    - Right side: Unassigned Races
//    - Left side: Blocks (Block 1..N)
//    - Drag/drop races into blocks, reorder inside blocks, move between blocks
//    - Add Block button
//    - Everything persists in ssm_db.json
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

const DATA_FILE = process.env.SSM_DATA_FILE || path.join(__dirname, "ssm_db.json");
const DATA_VERSION = 9;

// -------------------------
// DB helpers
// -------------------------
function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, obj) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function defaultDb() {
  return {
    version: DATA_VERSION,
    createdAt: new Date().toISOString(),
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
  };
}

function loadDb() {
  const db = safeReadJson(DATA_FILE);
  if (!db) {
    const fresh = defaultDb();
    writeJsonAtomic(DATA_FILE, fresh);
    return fresh;
  }
  // Minimal migration guard
  if (!db.version) db.version = DATA_VERSION;
  if (!Array.isArray(db.meets)) db.meets = [];
  if (!Array.isArray(db.rinks)) db.rinks = defaultDb().rinks;
  return db;
}

function saveDb(db) {
  db.version = DATA_VERSION;
  db.updatedAt = new Date().toISOString();
  writeJsonAtomic(DATA_FILE, db);
}

function nextId(arr) {
  let max = 0;
  for (const x of arr) max = Math.max(max, Number(x.id) || 0);
  return max + 1;
}

// -------------------------
// Simple session (cookie token)
// -------------------------
const SESS_COOKIE = "ssm_sess";
const sessions = new Map(); // token -> { user, createdAt }

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").map(s => s.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf("=");
    if (idx > -1) out[pair.slice(0, idx)] = decodeURIComponent(pair.slice(idx + 1));
  });
  return out;
}

function setCookie(res, name, value) {
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function requireDirector(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[SESS_COOKIE];
  const sess = token ? sessions.get(token) : null;
  if (!sess) return res.redirect("/admin/login");
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
        }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color: var(--text); background: radial-gradient(1200px 600px at 30% 0%, #eef3ff, var(--bg)); }
        a { color: var(--blue); text-decoration: none; }
        .wrap { max-width: 1100px; margin: 24px auto 64px; padding: 0 18px; }
        .topbar { max-width: 1100px; margin: 18px auto 0; padding: 0 18px; display:flex; align-items:center; justify-content:space-between; }
        .brand { font-weight: 900; font-size: 20px; letter-spacing: .2px; }
        .nav { display:flex; gap: 10px; flex-wrap: wrap; align-items:center; justify-content:flex-end; }
        .pill { border: 2px solid #c7d2fe; padding: 10px 14px; border-radius: 999px; background: rgba(255,255,255,.6); font-weight: 700; color: #1e3a8a; }
        .pill:hover { border-color: #93c5fd; }
        .pill.solid { background: var(--blue); border-color: var(--blue); color: white; }
        .pill.solid:hover { background: var(--blue2); border-color: var(--blue2); }
        h1 { margin: 20px 0 10px; font-size: 44px; letter-spacing: -.8px; }
        h2 { margin: 0 0 8px; font-size: 28px; letter-spacing: -.3px; }
        .muted { color: var(--muted); }
        .card { background: var(--card); border: 1px solid rgba(148,163,184,.25); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px; }
        .row { display:flex; gap: 14px; flex-wrap: wrap; }
        .spacer { height: 14px; }
        .btn { display:inline-block; border: 0; cursor:pointer; background: var(--blue); color: white; font-weight: 900; padding: 12px 16px; border-radius: 12px; }
        .btn:hover { background: var(--blue2); }
        .btn2 { display:inline-block; border: 2px solid #c7d2fe; background: white; color: #1e3a8a; font-weight: 900; padding: 10px 14px; border-radius: 12px; cursor:pointer; }
        .btn2:hover { border-color:#93c5fd; }
        .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 900px){ .grid2{ grid-template-columns: 1fr; } }
        label { font-weight: 800; font-size: 13px; color: #0f172a; display:block; margin-bottom: 6px; }
        input, select, textarea { width: 100%; padding: 12px 12px; border-radius: 12px; border: 1px solid var(--line); outline: none; font-size: 15px; }
        input:focus, textarea:focus { border-color: #93c5fd; box-shadow: 0 0 0 4px rgba(147,197,253,.35); }
        textarea { min-height: 90px; resize: vertical; }
        .kpi { display:flex; gap: 10px; align-items:center; flex-wrap: wrap; }
        .chip { display:inline-flex; align-items:center; gap: 8px; border: 1px solid var(--line); border-radius: 999px; padding: 8px 10px; background: rgba(255,255,255,.7); font-weight: 800; }
        .small { font-size: 12px; }
        .hr { height:1px; background: rgba(148,163,184,.25); margin: 14px 0; }
        .note { font-size: 13px; color: var(--muted); }
        .danger { color: #b91c1c; font-weight: 900; }
        /* Block builder layout */
        .bb { display:grid; grid-template-columns: 1.2fr .8fr; gap: 14px; }
        @media (max-width: 1000px){ .bb{ grid-template-columns: 1fr; } }
        .block { border: 1px solid rgba(148,163,184,.25); border-radius: 16px; padding: 14px; background: rgba(255,255,255,.9); }
        .blockHead { display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-bottom: 10px; }
        .raceItem { border: 1px solid rgba(148,163,184,.25); background: white; border-radius: 14px; padding: 10px 10px; margin: 8px 0; cursor: grab; display:flex; gap: 10px; align-items:flex-start; }
        .raceItem:active { cursor: grabbing; }
        .raceMeta { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .dropZone { min-height: 40px; padding: 6px; border-radius: 14px; border: 2px dashed rgba(148,163,184,.35); background: rgba(248,250,252,.7); }
        .dropZone.over { border-color: #93c5fd; background: rgba(219,234,254,.6); }
        .rightCol { position: sticky; top: 18px; align-self: start; }
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
  // Keep it lean: group + divisions; you can expand later.
  return [
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
    { id: "senior_women", label: "Senior Women", ages: "18+" },
    { id: "senior_men", label: "Senior Men", ages: "18+" },
  ].map(g => ({
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
    timeTrialsEnabled: false,
    judgesPanelRequired: true,
    relayEnabled: false,
    notes: "",
    relayNotes: "",
    groups: baseGroups(),
    races: [], // generated from groups/divisions/distances
    blocks: [], // {id, name, raceIds:[]}
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDistances(arr4) {
  const out = [0, 1, 2, 3].map(i => String(arr4?.[i] ?? "").trim());
  return out;
}

function generateRacesForMeet(meet) {
  // Build a flat race list from enabled divisions + D1..D4 distances
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

        races.push({
          id: "r" + crypto.randomBytes(6).toString("hex"),
          orderHint: n++,
          groupId: g.id,
          groupLabel: g.label,
          ages: g.ages,
          division: divKey,
          distanceLabel: dist,
          dayIndex: i + 1, // D1..D4 concept
        });
      }
    }
  }

  // Keep blocks but remove references to races that no longer exist
  const raceIds = new Set(races.map(r => r.id));
  for (const b of meet.blocks || []) {
    b.raceIds = (b.raceIds || []).filter(id => raceIds.has(id));
  }

  meet.races = races;
  meet.updatedAt = new Date().toISOString();
  return meet;
}

function ensureAtLeastOneBlock(meet) {
  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  if (meet.blocks.length === 0) {
    meet.blocks.push({ id: "b1", name: "Block 1", raceIds: [] });
  }
}

// -------------------------
// Routes
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
  const cards = db.meets.map(m => `
    <div class="card">
      <h2>${esc(m.meetName || "Meet")}</h2>
      <div class="kpi">
        <span class="chip">ID: ${esc(m.id)}</span>
        <span class="chip">Races: ${esc((m.races || []).length)}</span>
        <span class="chip">Blocks: ${esc((m.blocks || []).length)}</span>
      </div>
      <div class="spacer"></div>
      <a class="btn2" href="/portal/meet/${encodeURIComponent(m.id)}/builder">View Meet Builder (director)</a>
    </div>
  `).join("<div class='spacer'></div>");

  res.send(pageShell({
    title: "Find a Meet",
    user: null,
    bodyHtml: `<h1>Meets</h1>${cards || `<div class="card"><div class="muted">No meets yet.</div></div>`}`,
  }));
});

app.get("/rinks", (req, res) => {
  const db = loadDb();
  const cards = db.rinks.map(r => `
    <div class="card">
      <h2>${esc(r.name)}</h2>
      <div><b>Phone:</b> ${esc(r.phone || "")}</div>
      <div><b>Address:</b> ${esc(r.address || "")}</div>
      <div><b>City/State:</b> ${esc(r.city || "")}, ${esc(r.state || "")}</div>
      ${r.website ? `<div><b>Website:</b> <a href="https://${esc(r.website)}" target="_blank" rel="noreferrer">${esc(r.website)}</a></div>` : ""}
    </div>
  `).join("<div class='spacer'></div>");

  res.send(pageShell({
    title: "Rinks",
    user: null,
    bodyHtml: `<h1>Rinks</h1>${cards || `<div class="card"><div class="muted">No rinks yet.</div></div>`}`,
  }));
});

app.get("/live", (req, res) => {
  const body = `
    <h1>Live Race Day</h1>
    <div class="card">
      <div class="muted">Concept placeholder. This will show “Now Racing / On Deck / Results” when you wire timing in.</div>
    </div>
  `;
  res.send(pageShell({ title: "Live", bodyHtml: body, user: null }));
});

// --- Admin login (simple demo) ---
app.get("/admin/login", (req, res) => {
  const body = `
    <h1>Admin Login</h1>
    <div class="card">
      <form method="POST" action="/admin/login">
        <div class="grid2">
          <div>
            <label>Username</label>
            <input name="username" placeholder="director" autocomplete="username" required/>
          </div>
          <div>
            <label>Password</label>
            <input name="password" type="password" placeholder="(set in env or use demo)" autocomplete="current-password" required/>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn" type="submit">Login</button>
        <div class="spacer"></div>
        <div class="note">Demo: username <b>director</b> password <b>letmein</b> (change later)</div>
      </form>
    </div>
  `;
  res.send(pageShell({ title: "Admin Login", bodyHtml: body, user: null }));
});

app.post("/admin/login", (req, res) => {
  const u = String(req.body.username || "").trim();
  const p = String(req.body.password || "").trim();
  const ok = (u === "director" && p === "letmein");
  if (!ok) {
    return res.send(pageShell({
      title: "Login",
      user: null,
      bodyHtml: `<h1>Admin Login</h1><div class="card"><div class="danger">Invalid login.</div><div class="spacer"></div><a class="btn2" href="/admin/login">Try again</a></div>`,
    }));
  }
  const token = crypto.randomBytes(18).toString("hex");
  sessions.set(token, { user: { username: u, role: "director" }, createdAt: Date.now() });
  setCookie(res, SESS_COOKIE, token);
  res.redirect("/portal");
});

app.get("/admin/logout", (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[SESS_COOKIE];
  if (token) sessions.delete(token);
  clearCookie(res, SESS_COOKIE);
  res.redirect("/");
});

// --- Director Portal ---
app.get("/portal", requireDirector, (req, res) => {
  const db = loadDb();
  const meetCards = db.meets.map(m => `
    <div class="card">
      <div class="row" style="align-items:center; justify-content:space-between;">
        <div>
          <h2 style="margin:0;">${esc(m.meetName || "Meet")}</h2>
          <div class="muted small">Meet ID: ${esc(m.id)}</div>
        </div>
        <div class="kpi">
          <span class="chip">Races: ${esc((m.races || []).length)}</span>
          <span class="chip">Blocks: ${esc((m.blocks || []).length)}</span>
        </div>
      </div>
      <div class="spacer"></div>
      <div class="row">
        <a class="btn" href="/portal/meet/${encodeURIComponent(m.id)}/builder">Meet Builder</a>
        <a class="btn2" href="/portal/meet/${encodeURIComponent(m.id)}/blocks">Block Builder</a>
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
      </form>
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
  // IMPORTANT: do NOT auto-generate races/blocks until they save config (keeps everything clean)
  m.races = [];
  m.blocks = [];
  db.meets.push(m);
  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(m.id)}/builder`);
});

// --- Meet Builder ---
app.get("/portal/meet/:meetId/builder", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");

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

  const body = `
    <h1>Meet Builder</h1>
    <div class="card">
      <form method="POST" action="/portal/meet/${encodeURIComponent(meet.id)}/builder/save">
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

        <div class="hr"></div>

        <div class="row" style="justify-content:space-between; align-items:center;">
          <label style="margin:0;">
            <input type="checkbox" name="timeTrialsEnabled" ${meet.timeTrialsEnabled ? "checked" : ""} style="width:auto; margin-right:10px; transform:scale(1.1);"/>
            Enable Time Trials
          </label>

          <label style="margin:0;">
            <input type="checkbox" name="judgesPanelRequired" ${meet.judgesPanelRequired ? "checked" : ""} style="width:auto; margin-right:10px; transform:scale(1.1);"/>
            Judges panel required
          </label>
        </div>

        <div class="spacer"></div>
        <label>Notes</label>
        <textarea name="notes">${esc(meet.notes || "")}</textarea>

        <div class="hr"></div>

        <div class="row" style="justify-content:space-between; align-items:center;">
          <label style="margin:0;">
            <input type="checkbox" name="relayEnabled" ${meet.relayEnabled ? "checked" : ""} style="width:auto; margin-right:10px; transform:scale(1.1);"/>
            Enable Relays
          </label>
        </div>

        <div class="spacer"></div>
        <label>Relay Notes</label>
        <textarea name="relayNotes">${esc(meet.relayNotes || "")}</textarea>

        <div class="spacer"></div>
        <button class="btn" type="submit">Save Meet & Generate Race List</button>
        <div class="spacer"></div>
        <div class="note">
          Saving will generate the “Unassigned Races” list used in Block Builder.
        </div>
      </form>
    </div>

    <div class="spacer"></div>
    ${groupCards}

    <div class="spacer"></div>
    <div class="card">
      <div class="row">
        <a class="btn2" href="/portal">Back to Portal</a>
        <a class="btn" href="/portal/meet/${encodeURIComponent(meet.id)}/blocks">Go to Block Builder</a>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Meet Builder", bodyHtml: body, user: req.user }));
});

app.post("/portal/meet/:meetId/builder/save", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");

  meet.meetName = String(req.body.meetName || "New Meet");
  meet.date = String(req.body.date || "");
  meet.trackLength = Number(req.body.trackLength || 100);
  meet.lanes = Number(req.body.lanes || 4);

  meet.timeTrialsEnabled = !!req.body.timeTrialsEnabled;
  meet.judgesPanelRequired = !!req.body.judgesPanelRequired;
  meet.relayEnabled = !!req.body.relayEnabled;
  meet.notes = String(req.body.notes || "");
  meet.relayNotes = String(req.body.relayNotes || "");

  // Update groups/divisions
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

  // Generate races NOW so Block Builder has something to show
  generateRacesForMeet(meet);

  saveDb(db);
  res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/blocks`);
});

// --- Block Builder ---
app.get("/portal/meet/:meetId/blocks", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.redirect("/portal");

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
          <div style="font-weight:900;">${esc(r.groupLabel)} • ${esc(r.division.toUpperCase())}</div>
          <div class="raceMeta">${esc(r.distanceLabel)} • D${esc(r.dayIndex)} • ${esc(r.ages)}</div>
        </div>
      `;
    }).join("");

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
  }).join("<div class='spacer'></div>");

  const unassignedHtml = unassigned.map(r => `
    <div class="raceItem" draggable="true" data-race-id="${esc(r.id)}">
      <div style="font-weight:900;">${esc(r.groupLabel)} • ${esc(r.division.toUpperCase())}</div>
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
        </div>
      </div>
      <div class="hr"></div>
      <div class="kpi">
        <span class="chip">Races: ${esc((meet.races || []).length)}</span>
        <span class="chip">Unassigned: ${esc(unassigned.length)}</span>
        <span class="chip">Blocks: ${esc((meet.blocks || []).length)}</span>
      </div>
      <div class="note small">If this is empty, go back to Meet Builder and click “Save Meet & Generate Race List”.</div>
    </div>

    <div class="spacer"></div>

    <div class="bb">
      <div>
        ${blocksHtml}
      </div>

      <div class="rightCol">
        <div class="card">
          <h2 style="margin:0;">Unassigned Races</h2>
          <div class="muted small">These are the generated races not placed into a block yet.</div>
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
        // Find closest insertion point among items
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
  saveDb(db); // ensure block exists persisted
  res.send(pageShell({ title: "Block Builder", bodyHtml: body, user: req.user }));
});

// --- Block APIs ---
app.post("/api/meet/:meetId/blocks/add", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");

  if (!Array.isArray(meet.blocks)) meet.blocks = [];
  const n = meet.blocks.length + 1;
  meet.blocks.push({ id: "b" + n, name: "Block " + n, raceIds: [] });
  meet.updatedAt = new Date().toISOString();

  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/meet/:meetId/blocks/rename", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");

  const blockId = String(req.body.blockId || "");
  const name = String(req.body.name || "").trim();
  const b = (meet.blocks || []).find(x => x.id === blockId);
  if (!b) return res.status(404).send("block not found");
  if (!name) return res.status(400).send("name required");

  b.name = name;
  meet.updatedAt = new Date().toISOString();
  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/meet/:meetId/blocks/move-race", requireDirector, (req, res) => {
  const db = loadDb();
  const meetId = Number(req.params.meetId);
  const meet = db.meets.find(m => Number(m.id) === meetId);
  if (!meet) return res.status(404).send("meet not found");

  const raceId = String(req.body.raceId || "");
  const destBlockId = String(req.body.destBlockId || "");
  const insertIndex = Number.isFinite(req.body.insertIndex) ? Number(req.body.insertIndex) : 999999;

  // Remove race from any block
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

  meet.updatedAt = new Date().toISOString();
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

Rinks default:
- Roller City (Wichita, KS)

Meets:
- No default meet created. Build from Portal (Director).

Listening on ${HOST}:${PORT}
`.trim()
  );
});