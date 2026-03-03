// ============================================================
// SpeedSkateMeet — CLEAN REBUILD v7.2 (stable baseline)
// Node.js + Express • single-file server.js • JSON persistence
//
// Goals:
// ✅ No more getSession() crashes (db.sessions always exists)
// ✅ Safe DB load + auto-heal missing keys
// ✅ Simple cookie session (no extra deps)
// ✅ Rinks list + add/edit (includes correct Roller City Wichita)
// ✅ Portal + basic Director Dashboard + Meet Builder shell
//
// Deploy notes (Render):
// - Start command: node server.js
// - Uses PORT from Render
// - Persists to DATA_FILE if set, else ./ssm_db.json
// ============================================================

"use strict";

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// -------------------- Config --------------------
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// Render best-practice: persist to a disk mount path via env var DATA_FILE.
// If not set, we fallback to local file in repo folder (works locally, not durable on Render).
const DATA_FILE =
  process.env.DATA_FILE ||
  process.env.SSM_DATA_FILE ||
  path.join(__dirname, "ssm_db.json");

// -------------------- DB --------------------
function defaultDb() {
  return {
    version: "7.2",
    users: {
      // Demo users (passwords not displayed)
      Lbird22: { role: "director", pass: "Redline22" },
      JudgeLee: { role: "judge", pass: "Redline22" },
      CoachLee: { role: "coach", pass: "Redline22" },
    },
    sessions: {}, // sid -> { username, role, createdAt }
    rinks: [],
    meets: [],
  };
}

function readDb() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const db = defaultDb();
      writeDb(db);
      return db;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    return healDb(parsed);
  } catch (e) {
    console.error("DB read failed; recreating DB:", e);
    const db = defaultDb();
    // Try writing a fresh DB; if disk perms fail on Render, you'll see it in logs.
    try {
      writeDb(db);
    } catch (e2) {
      console.error("DB write failed while recreating:", e2);
    }
    return db;
  }
}

function healDb(db) {
  const d = typeof db === "object" && db ? db : {};
  if (!d.version) d.version = "7.2";
  if (!d.users || typeof d.users !== "object") d.users = defaultDb().users;
  if (!d.sessions || typeof d.sessions !== "object") d.sessions = {};
  if (!Array.isArray(d.rinks)) d.rinks = [];
  if (!Array.isArray(d.meets)) d.meets = [];
  return d;
}

function writeDb(db) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

function withDb(fn) {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return result;
}

// Seed: ensure Roller City exists (and remove fake Wichita Skate Center)
withDb((db) => {
  // Remove fake / wrong entries
  db.rinks = db.rinks.filter(
    (r) => (r.name || "").toLowerCase() !== "wichita skate center"
  );

  const exists = db.rinks.some(
    (r) => (r.name || "").toLowerCase() === "roller city"
  );

  if (!exists) {
    db.rinks.push({
      id: crypto.randomUUID(),
      name: "Roller City",
      city: "Wichita, KS",
      phone: "316-942-4555",
      address: "3234 S. Meridian Ave, Wichita, KS 67217",
      website: "rollercitywichitaks.com",
      team: "",
    });
  }
});

// -------------------- Helpers --------------------
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const pieces = [`${name}=${encodeURIComponent(value)}`];
  pieces.push(`Path=/`);
  pieces.push(`HttpOnly`);
  // SameSite Lax helps a lot
  pieces.push(`SameSite=Lax`);
  if (opts.maxAgeSeconds) pieces.push(`Max-Age=${opts.maxAgeSeconds}`);
  // On Render you’ll usually be https, so Secure is safe there.
  if (opts.secure) pieces.push(`Secure`);
  res.setHeader("Set-Cookie", pieces.join("; "));
}

function clearCookie(res, name) {
  res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function createSession(username, role) {
  const sid = crypto.randomBytes(24).toString("hex");
  withDb((db) => {
    db.sessions[sid] = {
      username,
      role,
      createdAt: Date.now(),
    };
  });
  return sid;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.ssm_sid;
  if (!sid) return null;

  const db = readDb(); // read-only ok here
  if (!db.sessions || typeof db.sessions !== "object") return null;

  const sess = db.sessions[sid];
  if (!sess || !sess.username) return null;

  return sess;
}

function requireRole(role) {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) return res.redirect("/login");
    if (role && s.role !== role) {
      return res.status(403).send(pageShell({ title: "Forbidden", user: s, bodyHtml: `<h1>Forbidden</h1><p>You do not have access to this page.</p>` }));
    }
    req.session = s;
    next();
  };
}

function navHtml(user) {
  const loggedIn = !!user;
  const portalBtn = loggedIn
    ? `<a class="btn" href="/portal">Portal</a><a class="btn btn-ghost" href="/logout">Logout</a>`
    : `<a class="btn" href="/login">Admin Login</a>`;

  return `
    <div class="nav">
      <div class="brand">SpeedSkateMeet</div>
      <div class="navlinks">
        <a class="btn btn-ghost" href="/">Home</a>
        <a class="btn btn-ghost" href="/meets">Find a Meet</a>
        <a class="btn btn-ghost" href="/rinks">Find a Rink</a>
        <a class="btn btn-ghost" href="/live">Live Race Day</a>
        ${portalBtn}
      </div>
    </div>
  `;
}

function pageShell({ title, user, bodyHtml }) {
  const roleBadge = user ? `<span class="badge">${escapeHtml(user.username)} • ${escapeHtml(user.role)}</span>` : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} • SpeedSkateMeet</title>
  <style>
    :root {
      --bg:#f6f7fb;
      --card:#ffffff;
      --text:#111827;
      --muted:#6b7280;
      --line:#e5e7eb;
      --blue:#2563eb;
      --blue2:#1d4ed8;
      --shadow: 0 10px 30px rgba(0,0,0,.08);
      --radius:18px;
    }
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
    .wrap{max-width:1050px;margin:0 auto;padding:18px}
    .nav{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
    .brand{font-weight:900;font-size:22px;letter-spacing:.2px}
    .navlinks{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .badge{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:#fff;font-size:12px;color:var(--muted)}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border-radius:14px;border:1px solid var(--blue);color:#fff;background:var(--blue);text-decoration:none;font-weight:800}
    .btn:hover{background:var(--blue2)}
    .btn-ghost{background:#fff;color:var(--blue);border:1px solid rgba(37,99,235,.35)}
    .btn-ghost:hover{background:#f0f6ff}
    .grid{display:grid;gap:16px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px}
    h1{margin:14px 0 10px;font-size:34px;letter-spacing:-.4px}
    h2{margin:0 0 10px;font-size:22px}
    p{margin:8px 0;color:var(--muted);line-height:1.5}
    .row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    label{display:block;font-weight:800;font-size:13px;margin:10px 0 6px}
    input,select,textarea{width:100%;padding:12px 12px;border-radius:14px;border:1px solid var(--line);font-size:14px;background:#fff}
    textarea{min-height:90px}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    @media (max-width:720px){.two{grid-template-columns:1fr}}
    .muted{color:var(--muted)}
    .hr{height:1px;background:var(--line);margin:14px 0}
    .topline{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0}
  </style>
</head>
<body>
  <div class="wrap">
    ${navHtml(user)}
    <div class="topline">
      <div></div>
      <div>${roleBadge}</div>
    </div>
    ${bodyHtml}
    <div style="height:22px"></div>
    <div class="muted" style="font-size:12px">
      Data file: <code>${escapeHtml(DATA_FILE)}</code>
    </div>
  </div>
</body>
</html>`;
}

// -------------------- Routes --------------------
app.get("/", (req, res) => {
  const s = getSession(req);
  const body = `
    <div class="card">
      <h1>SpeedSkateMeet</h1>
      <p>Meet software for the inline speed skating community — simple, fast, and made by skaters.</p>
      <div class="row">
        <a class="btn" href="/meets">Find a Meet</a>
        <a class="btn btn-ghost" href="/rinks">Find a Rink</a>
        <a class="btn btn-ghost" href="/live">Live Race Day</a>
        ${s ? `<a class="btn btn-ghost" href="/portal">Portal</a>` : `<a class="btn btn-ghost" href="/login">Admin Login</a>`}
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Home", user: s, bodyHtml: body }));
});

app.get("/live", (req, res) => {
  const s = getSession(req);
  const body = `
    <div class="card">
      <h1>Live Race Day</h1>
      <p>Placeholder page. We’ll wire this into blocks + judges panel next.</p>
    </div>
  `;
  res.send(pageShell({ title: "Live", user: s, bodyHtml: body }));
});

app.get("/meets", (req, res) => {
  const s = getSession(req);
  const db = readDb();
  const rows = db.meets
    .map(
      (m) => `
      <div class="card">
        <h2>${escapeHtml(m.name || "Meet")}</h2>
        <p class="muted">${escapeHtml(m.date || "TBD")} • Regs: ${m.regCount || 0}</p>
      </div>
    `
    )
    .join("");
  res.send(
    pageShell({
      title: "Find a Meet",
      user: s,
      bodyHtml: `
        <div class="card">
          <h1>Meets</h1>
          <p>Public meet listings (placeholder).</p>
        </div>
        <div class="grid">${rows || `<div class="card"><p class="muted">No meets listed yet.</p></div>`}</div>
      `,
    })
  );
});

// ---- Auth ----
app.get("/login", (req, res) => {
  const s = getSession(req);
  if (s) return res.redirect("/portal");

  const body = `
    <div class="card" style="max-width:520px;margin:0 auto">
      <h1>Admin Login</h1>
      <form method="POST" action="/login">
        <label>Username</label>
        <input name="username" autocomplete="username" />
        <label>Password</label>
        <input name="password" type="password" autocomplete="current-password" />
        <div class="row" style="margin-top:14px">
          <button class="btn" type="submit">Login</button>
        </div>
      </form>
      <div class="hr"></div>
      <div class="muted" style="font-size:13px">
        Demo usernames (passwords not displayed publicly):
        <div style="margin-top:8px">
          Director: <b>Lbird22</b><br/>
          Judge: <b>JudgeLee</b><br/>
          Coach: <b>CoachLee</b>
        </div>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Login", user: null, bodyHtml: body }));
});

app.post("/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "").trim();

  const db = readDb();
  const u = db.users?.[username];

  if (!u || u.pass !== password) {
    return res.status(401).send(
      pageShell({
        title: "Login",
        user: null,
        bodyHtml: `
          <div class="card" style="max-width:520px;margin:0 auto">
            <h1>Login failed</h1>
            <p>Incorrect username or password.</p>
            <a class="btn" href="/login">Try again</a>
          </div>
        `,
      })
    );
  }

  const sid = createSession(username, u.role);
  setCookie(res, "ssm_sid", sid, { secure: true, maxAgeSeconds: 60 * 60 * 24 * 14 }); // 14 days
  res.redirect("/portal");
});

app.get("/logout", (req, res) => {
  const cookies = parseCookies(req);
  const sid = cookies.ssm_sid;

  if (sid) {
    withDb((db) => {
      if (db.sessions && db.sessions[sid]) delete db.sessions[sid];
    });
  }
  clearCookie(res, "ssm_sid");
  res.redirect("/");
});

app.get("/portal", (req, res) => {
  const s = getSession(req);
  if (!s) return res.redirect("/login");

  const role = s.role;
  const body = `
    <div class="card">
      <h1>Portal</h1>
      <p>Signed in as <b>${escapeHtml(s.username)}</b> (${escapeHtml(role)}).</p>
      <div class="row">
        ${role === "director" ? `<a class="btn" href="/director">Director Dashboard</a>` : ""}
        <a class="btn btn-ghost" href="/rinks">Rinks</a>
      </div>
    </div>
  `;
  res.send(pageShell({ title: "Portal", user: s, bodyHtml: body }));
});

// ---- Director ----
app.get("/director", requireRole("director"), (req, res) => {
  const s = req.session;
  const db = readDb();

  const meetCards = db.meets
    .map(
      (m) => `
      <div class="card">
        <h2>${escapeHtml(m.name || "New Meet")}</h2>
        <p class="muted">Date: ${escapeHtml(m.date || "TBD")} • Regs: ${m.regCount || 0}</p>
        <div class="row">
          <a class="btn btn-ghost" href="/meet/${encodeURIComponent(m.id)}/builder">Meet Builder</a>
        </div>
      </div>
    `
    )
    .join("");

  const body = `
    <div class="card">
      <h1>Director Dashboard</h1>
      <p>Create and manage meets.</p>
      <form method="POST" action="/director/new">
        <div class="two">
          <div>
            <label>Meet name</label>
            <input name="name" placeholder="New Meet" />
          </div>
          <div>
            <label>Date</label>
            <input name="date" placeholder="TBD" />
          </div>
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn" type="submit">Build New Meet</button>
        </div>
      </form>
    </div>
    <div class="grid">
      ${meetCards || `<div class="card"><p class="muted">No meets yet.</p></div>`}
    </div>
  `;

  res.send(pageShell({ title: "Director", user: s, bodyHtml: body }));
});

app.post("/director/new", requireRole("director"), (req, res) => {
  const name = String(req.body.name || "New Meet").trim() || "New Meet";
  const date = String(req.body.date || "TBD").trim() || "TBD";

  const id = crypto.randomUUID();
  withDb((db) => {
    db.meets.unshift({
      id,
      name,
      date,
      regCount: 0,
      builder: {
        // placeholder — we’ll expand this with your meet-builder rules next
      },
    });
  });

  res.redirect(`/meet/${encodeURIComponent(id)}/builder`);
});

// ---- Meet Builder (shell for now) ----
app.get("/meet/:id/builder", requireRole("director"), (req, res) => {
  const s = req.session;
  const id = req.params.id;

  const db = readDb();
  const meet = db.meets.find((m) => m.id === id);

  if (!meet) {
    return res.status(404).send(
      pageShell({
        title: "Not found",
        user: s,
        bodyHtml: `<div class="card"><h1>Meet not found</h1><a class="btn" href="/director">Back</a></div>`,
      })
    );
  }

  const body = `
    <div class="card">
      <h1>Meet Builder</h1>
      <p><b>${escapeHtml(meet.name)}</b> • ${escapeHtml(meet.date)}</p>

      <div class="hr"></div>

      <h2>Notes / Next steps (we discussed)</h2>
      <ul class="muted">
        <li>Remove D1/D2/D3 dropdowns (make them plain inputs)</li>
        <li>Time Trials: add meet-wide “Time Trials” config block (like SkateAbility)</li>
        <li>Saved Meets: “Save meet as…” + dropdown to load templates</li>
        <li>Block Builder should save inside meet</li>
        <li>Relays: relay builder (we already mocked this)</li>
      </ul>

      <div class="row" style="margin-top:14px">
        <a class="btn btn-ghost" href="/director">Back to Dashboard</a>
      </div>
    </div>
  `;

  res.send(pageShell({ title: "Meet Builder", user: s, bodyHtml: body }));
});

// ---- Rinks ----
app.get("/rinks", (req, res) => {
  const s = getSession(req);
  const db = readDb();

  const cards = db.rinks
    .map((r) => {
      const isDirector = s?.role === "director";
      return `
        <div class="card">
          <h2>${escapeHtml(r.name || "Rink")}</h2>
          <p><b>City:</b> ${escapeHtml(r.city || "-")}</p>
          <p><b>Phone:</b> ${escapeHtml(r.phone || "-")}</p>
          <p><b>Address:</b> ${escapeHtml(r.address || "-")}</p>
          <p><b>Website:</b> ${r.website ? `<a href="https://${escapeHtml(r.website)}" target="_blank" rel="noreferrer">${escapeHtml(r.website)}</a>` : "-"}</p>
          ${isDirector ? `<div class="row"><a class="btn btn-ghost" href="/rinks/${encodeURIComponent(r.id)}/edit">Edit</a></div>` : ""}
        </div>
      `;
    })
    .join("");

  const body = `
    <div class="card">
      <h1>Rinks</h1>
      <p>Rinks and contact info.</p>
      ${s?.role === "director" ? `<div class="row"><a class="btn" href="/rinks/new">Add a rink</a></div>` : ""}
    </div>
    <div class="grid">${cards || `<div class="card"><p class="muted">No rinks yet.</p></div>`}</div>
  `;

  res.send(pageShell({ title: "Rinks", user: s, bodyHtml: body }));
});

app.get("/rinks/new", requireRole("director"), (req, res) => {
  const s = req.session;
  res.send(
    pageShell({
      title: "Add Rink",
      user: s,
      bodyHtml: `
        <div class="card" style="max-width:720px;margin:0 auto">
          <h1>Add a rink</h1>
          <form method="POST" action="/rinks/new">
            <div class="two">
              <div>
                <label>Name</label>
                <input name="name" required />
              </div>
              <div>
                <label>City</label>
                <input name="city" placeholder="Wichita, KS" />
              </div>
            </div>
            <div class="two">
              <div>
                <label>Phone</label>
                <input name="phone" />
              </div>
              <div>
                <label>Website (domain only)</label>
                <input name="website" placeholder="rollercitywichitaks.com" />
              </div>
            </div>
            <label>Address</label>
            <input name="address" />
            <div class="row" style="margin-top:14px">
              <button class="btn" type="submit">Save</button>
              <a class="btn btn-ghost" href="/rinks">Cancel</a>
            </div>
          </form>
        </div>
      `,
    })
  );
});

app.post("/rinks/new", requireRole("director"), (req, res) => {
  const name = String(req.body.name || "").trim();
  const city = String(req.body.city || "").trim();
  const phone = String(req.body.phone || "").trim();
  const address = String(req.body.address || "").trim();
  const website = String(req.body.website || "").trim();

  if (!name) return res.redirect("/rinks/new");

  withDb((db) => {
    db.rinks.unshift({
      id: crypto.randomUUID(),
      name,
      city,
      phone,
      address,
      website,
      team: "",
    });
  });

  res.redirect("/rinks");
});

app.get("/rinks/:id/edit", requireRole("director"), (req, res) => {
  const s = req.session;
  const id = req.params.id;
  const db = readDb();
  const r = db.rinks.find((x) => x.id === id);
  if (!r) return res.redirect("/rinks");

  res.send(
    pageShell({
      title: "Edit Rink",
      user: s,
      bodyHtml: `
        <div class="card" style="max-width:720px;margin:0 auto">
          <h1>Edit rink</h1>
          <form method="POST" action="/rinks/${escapeHtml(id)}/edit">
            <div class="two">
              <div>
                <label>Name</label>
                <input name="name" value="${escapeHtml(r.name)}" />
              </div>
              <div>
                <label>City</label>
                <input name="city" value="${escapeHtml(r.city)}" />
              </div>
            </div>
            <div class="two">
              <div>
                <label>Phone</label>
                <input name="phone" value="${escapeHtml(r.phone)}" />
              </div>
              <div>
                <label>Website</label>
                <input name="website" value="${escapeHtml(r.website)}" />
              </div>
            </div>
            <label>Address</label>
            <input name="address" value="${escapeHtml(r.address)}" />
            <div class="row" style="margin-top:14px">
              <button class="btn" type="submit">Save</button>
              <a class="btn btn-ghost" href="/rinks">Cancel</a>
            </div>
          </form>

          <form method="POST" action="/rinks/${escapeHtml(id)}/delete" onsubmit="return confirm('Delete this rink?');">
            <div class="hr"></div>
            <button class="btn btn-ghost" type="submit" style="border-color:#ef4444;color:#ef4444">Delete</button>
          </form>
        </div>
      `,
    })
  );
});

app.post("/rinks/:id/edit", requireRole("director"), (req, res) => {
  const id = req.params.id;
  withDb((db) => {
    const r = db.rinks.find((x) => x.id === id);
    if (!r) return;
    r.name = String(req.body.name || "").trim();
    r.city = String(req.body.city || "").trim();
    r.phone = String(req.body.phone || "").trim();
    r.address = String(req.body.address || "").trim();
    r.website = String(req.body.website || "").trim();
  });
  res.redirect("/rinks");
});

app.post("/rinks/:id/delete", requireRole("director"), (req, res) => {
  const id = req.params.id;
  withDb((db) => {
    db.rinks = db.rinks.filter((x) => x.id !== id);
  });
  res.redirect("/rinks");
});

// -------------------- Start --------------------
app.listen(PORT, HOST, () => {
  console.log("============================================================");
  console.log("SpeedSkateMeet — CLEAN REBUILD v7.2");
  console.log("Data:", DATA_FILE);
  console.log("Local:", `http://localhost:${PORT}`);
  console.log("============================================================");
});