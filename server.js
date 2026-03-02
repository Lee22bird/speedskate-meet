// ============================================================
// SpeedSkateMeet – CLEAN REBUILD v6 – March 1, 2026
// Node.js + Express • single-file server.js • JSON persistence
//
// v6 FIXES:
// ✅ Login page no longer shows passwords (only demo usernames; safe in prod)
// ✅ Meet Builder headings are unified ("Primary Girls" once) — no split groups
// ✅ Startup DB migration:
//    - Rebuilds old split groups (primary_girls_novice/elite/open) into unified groups
//    - Removes deprecated/ghost groups (challenge_up, novice_elite_combo, time_trials_open, etc.)
//    - Locks Classic/Masters ages correctly
// ✅ Safari datalist popup offset FIX:
//    - Replaces native <datalist> with an anchored custom suggestions dropdown UI
// ✅ SkateAbility rebuilt:
//    - NO novice/elite/open
//    - Manual age label per SkateAbility box
//    - Add multiple SkateAbility boxes
// ✅ Time Trials:
//    - ONLY exist as Custom Races (raceType=time_trial). No “Time Trials Open” group.
// ✅ Challenge Up:
//    - Removed from Meet Builder.
//    - Registration checkbox auto-adds the next class up (novice→elite, elite→open).
// ✅ “Novice & Elite Combo” removed:
//    - Registration can choose multiple classes; system places skater in both.
//
// ============================================================

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ============================================================
// JSON PERSISTENCE
// ============================================================

const DATA_FILE = process.env.SSM_DATA_FILE || path.join(process.cwd(), "ssm_db.json");
const DATA_VERSION = 6;

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

function nowIso() {
  return new Date().toISOString();
}

// ============================================================
// GLOBAL REFERENCE DATA – TEAMS + DIVISIONS
// ============================================================

const globalTeams = [
  { name: "Independent", region: "Any", city: "", state: "" },
  { name: "Midwest Racing", region: "Midwest / North Central", city: "Wichita", state: "KS" },
  { name: "Infinity Racing", region: "Midwest / North Central", city: "Springfield", state: "MO" },
  { name: "Team Velocity", region: "Midwest / North Central", city: "Jefferson City", state: "MO" },
  { name: "Star Skate Speed", region: "Midwest / North Central", city: "Midwest City", state: "OK" },
  { name: "Tulsa Surge Speed Skating", region: "Midwest / North Central", city: "Sand Springs", state: "OK" },
  { name: "Bell's Speed Skating Team", region: "Midwest / North Central", city: "Ft Wayne", state: "IN" },
  { name: "Badger State Racing", region: "Midwest / North Central", city: "Grand Chute", state: "WI" },
  { name: "Rollaire Speed Team", region: "Midwest / North Central", city: "Manitowoc", state: "WI" },
  { name: "Aurora Speed Club", region: "Midwest / North Central", city: "Aurora", state: "IL" },
  { name: "Capital City Racing", region: "Midwest / North Central", city: "Springfield", state: "IL" },
  { name: "Astro Speed", region: "South / Southeast", city: "Orlando", state: "FL" },
  { name: "Central Florida Speed Team", region: "South / Southeast", city: "Leesburg", state: "FL" }
];

// ✅ CLEAN DIVISION LIST
// 🔒 Adult flow is HARD-CORRECT:
// Senior 18–24, Classic 25–34, Masters 35–44, Veteran 45–54, Esquire 55–64, Grand Veteran 65+
const ALL_DIVISIONS = [
  // Tiny Tot (0–5)
  { id: "tiny_tot_girls", label: "Tiny Tot Girls", ages: "0–5" },
  { id: "tiny_tot_boys", label: "Tiny Tot Boys", ages: "0–5" },

  // Primary (6–7)
  { id: "primary_girls", label: "Primary Girls", ages: "6–7" },
  { id: "primary_boys", label: "Primary Boys", ages: "6–7" },

  // Juvenile (8–9)
  { id: "juvenile_girls", label: "Juvenile Girls", ages: "8–9" },
  { id: "juvenile_boys", label: "Juvenile Boys", ages: "8–9" },

  // Elementary (10–11)
  { id: "elementary_girls", label: "Elementary Girls", ages: "10–11" },
  { id: "elementary_boys", label: "Elementary Boys", ages: "10–11" },

  // Freshman (12–13)
  { id: "freshman_girls", label: "Freshman Girls", ages: "12–13" },
  { id: "freshman_boys", label: "Freshman Boys", ages: "12–13" },

  // Sophomore (14–15)
  { id: "sophomore_girls", label: "Sophomore Girls", ages: "14–15" },
  { id: "sophomore_boys", label: "Sophomore Boys", ages: "14–15" },

  // Junior (16–17)
  { id: "junior_women", label: "Junior Women", ages: "16–17" },
  { id: "junior_men", label: "Junior Men", ages: "16–17" },

  // Adult chain (ORDER MATTERS) — DO NOT CHANGE
  { id: "senior_women", label: "Senior Women", ages: "18–24 (or 18+ per meet)" },
  { id: "senior_men", label: "Senior Men", ages: "18–24 (or 18+ per meet)" },

  { id: "classic_women", label: "Classic Women", ages: "25–34" },
  { id: "classic_men", label: "Classic Men", ages: "25–34" },

  { id: "masters_women", label: "Masters Women", ages: "35–44" },
  { id: "masters_men", label: "Masters Men", ages: "35–44" },

  { id: "veteran_women", label: "Veteran Women", ages: "45–54" },
  { id: "veteran_men", label: "Veteran Men", ages: "45–54" },

  { id: "esquire_women", label: "Esquire Women", ages: "55–64" },
  { id: "esquire_men", label: "Esquire Men", ages: "55–64" },

  { id: "grand_veteran_women", label: "Grand Veteran Women", ages: "65+" },
  { id: "grand_veteran_men", label: "Grand Veteran Men", ages: "65+" }
];

const DIV_KEYS = ["novice", "elite", "open"];
function emptyDivisions() {
  return {
    novice: { enabled: false, cost: 0, distances: ["", "", "", ""] },
    elite: { enabled: false, cost: 0, distances: ["", "", "", ""] },
    open: { enabled: false, cost: 0, distances: ["", "", "", ""] }
  };
}

function buildMeetGroups() {
  return ALL_DIVISIONS.map(div => ({
    type: "age",
    id: div.id,
    label: div.label,
    ages: div.ages,
    divisions: emptyDivisions()
  }));
}

function buildDefaultSkateAbilityBox() {
  return {
    id: 1,
    label: "SkateAbility",
    agesLabel: "Manual Age",
    enabled: false,
    cost: 0,
    distances: ["", "", "", ""]
  };
}

// ============================================================
// DB STATE
// ============================================================

function defaultDb() {
  return {
    version: DATA_VERSION,
    createdAt: nowIso(),
    meets: [],
    rinks: [
      { id: 1, name: "Wichita Skate Center", city: "Wichita", state: "KS", team: "Midwest Racing", address: "", phone: "", notes: "" }
    ],
    pendingRinks: [],
    coachRosters: [],
    pendingBulkRegs: []
  };
}

let db = readJsonIfExists(DATA_FILE) || defaultDb();

function saveDb() {
  atomicWriteJson(DATA_FILE, db);
}

function nextMeetId() {
  return db.meets.length ? Math.max(...db.meets.map(m => m.id)) + 1 : 1;
}
function nextRinkId() {
  return db.rinks.length ? Math.max(...db.rinks.map(r => r.id)) + 1 : 1;
}
function nextPendingRinkId() {
  return db.pendingRinks.length ? Math.max(...db.pendingRinks.map(r => r.id)) + 1 : 1;
}
function nextCustomRaceId(meet) {
  return meet.customRaces?.length ? Math.max(...meet.customRaces.map(r => r.id)) + 1 : 1;
}
function nextPendingBulkId() {
  return db.pendingBulkRegs.length ? Math.max(...db.pendingBulkRegs.map(x => x.id)) + 1 : 1;
}

function createNewMeet() {
  return {
    id: nextMeetId(),
    meetName: "New Meet",
    date: "",
    trackLength: 100,
    lanes: 4,

    raceDayStartTimes: { "Day 1": "08:00", "Day 2": "08:00", "Day 3": "08:00" },

    registrationOpen: true,
    registrationClosedAt: null,
    requireUsarsNumber: false,

    scheduleConfig: {
      warmupMinutes: 20,
      minutesPerRace: 2,
      blockTransitionMinutes: 5,
      lunchMinutes: 30,
      lunchAfterMinutesFromStart: 240
    },
    generatedSchedule: null,

    // unified age divisions
    groups: buildMeetGroups(),

    // special category: SkateAbility boxes
    skateAbilityBoxes: [buildDefaultSkateAbilityBox()],

    customRaces: [],

    blocks: [],

    races: [],
    raceOrderGeneratedAt: null,

    results: {},

    // registrations include division selections
    registrations: [],
    nextCheckInNumber: 1,

    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

// ============================================================
// 🔧 MIGRATIONS
// ============================================================

// Fix Classic/Masters labels/ages
function migrateMeetAdultAges(meet) {
  if (!meet || !Array.isArray(meet.groups)) return false;

  const find = (id) => meet.groups.find(g => g.id === id) || null;

  const cw = find("classic_women");
  const cm = find("classic_men");
  const mw = find("masters_women");
  const mm = find("masters_men");

  let changed = false;

  if (cw && cw.label !== "Classic Women") { cw.label = "Classic Women"; changed = true; }
  if (cm && cm.label !== "Classic Men")   { cm.label = "Classic Men"; changed = true; }
  if (mw && mw.label !== "Masters Women") { mw.label = "Masters Women"; changed = true; }
  if (mm && mm.label !== "Masters Men")   { mm.label = "Masters Men"; changed = true; }

  const TARGET_CLASSIC = "25–34";
  const TARGET_MASTERS = "35–44";

  if (cw && cw.ages !== TARGET_CLASSIC) { cw.ages = TARGET_CLASSIC; changed = true; }
  if (cm && cm.ages !== TARGET_CLASSIC) { cm.ages = TARGET_CLASSIC; changed = true; }
  if (mw && mw.ages !== TARGET_MASTERS) { mw.ages = TARGET_MASTERS; changed = true; }
  if (mm && mm.ages !== TARGET_MASTERS) { mm.ages = TARGET_MASTERS; changed = true; }

  return changed;
}

// Convert old “split group ids” into unified base group model.
// Example: primary_girls_novice -> primary_girls with divisions.novice enabled/cost/distances merged.
function migrateSplitGroupsToUnified(meet) {
  if (!meet || !Array.isArray(meet.groups)) return false;

  const isSplit = (id) => /_(novice|elite|open)$/.test(String(id || ""));
  const baseOf = (id) => String(id).replace(/_(novice|elite|open)$/, "");
  const keyOf = (id) => String(id).match(/_(novice|elite|open)$/)?.[1] || null;

  const split = meet.groups.filter(g => isSplit(g.id));
  if (!split.length) return false;

  let changed = false;

  // Build a map of base groups (starting from a clean canonical list)
  const canonical = buildMeetGroups();
  const map = new Map(canonical.map(g => [g.id, g]));

  for (const sg of split) {
    const baseId = baseOf(sg.id);
    const dk = keyOf(sg.id);
    const target = map.get(baseId);
    if (!target || !dk) continue;

    // try to carry distances/cost/enabled from old split group
    const oldDiv = sg.divisions?.[dk] || sg.divisions?.open || sg.divisions?.novice || sg.divisions?.elite || null;
    if (oldDiv) {
      target.divisions[dk].enabled = !!oldDiv.enabled;
      target.divisions[dk].cost = Number(oldDiv.cost ?? 0);
      target.divisions[dk].distances = Array.isArray(oldDiv.distances) ? oldDiv.distances.slice(0, 4) : ["", "", "", ""];
      changed = true;
    } else {
      // sometimes split group stored as “distances/cost” directly
      if (Array.isArray(sg.distances)) {
        target.divisions[dk].distances = sg.distances.slice(0, 4);
        changed = true;
      }
      if (sg.cost != null) {
        target.divisions[dk].cost = Number(sg.cost ?? 0);
        changed = true;
      }
      if (sg.enabled != null) {
        target.divisions[dk].enabled = !!sg.enabled;
        changed = true;
      }
    }
  }

  // Also merge any already-unified groups that exist (keep their settings)
  for (const g of meet.groups) {
    if (g && !isSplit(g.id) && map.has(g.id) && g.divisions) {
      const target = map.get(g.id);
      for (const k of DIV_KEYS) {
        if (g.divisions?.[k]) {
          target.divisions[k].enabled = !!g.divisions[k].enabled;
          target.divisions[k].cost = Number(g.divisions[k].cost ?? 0);
          target.divisions[k].distances = (g.divisions[k].distances || ["", "", "", ""]).slice(0, 4);
          changed = true;
        }
      }
    }
  }

  // Replace meet.groups with canonical unified list only
  meet.groups = canonical.map(g => map.get(g.id) || g);
  changed = true;

  return changed;
}

// Remove deprecated groups that should never exist in v6
function pruneDeprecatedGroups(meet) {
  if (!meet || !Array.isArray(meet.groups)) return false;

  const badIds = new Set([
    "challenge_up",
    "novice_elite_combo",
    "time_trials_open",
    "time_trials",
    "skateability", // we store SkateAbility separately now
    "skate_ability",
  ]);

  const before = meet.groups.length;

  meet.groups = meet.groups.filter(g => {
    if (!g) return false;
    if (badIds.has(g.id)) return false;
    if (/_novice$|_elite$|_open$/.test(String(g.id || ""))) return false; // any split leftovers
    return true;
  });

  // ensure canonical order + completeness (we want ALL divisions always present)
  const canonical = buildMeetGroups();
  const byId = new Map(meet.groups.map(g => [g.id, g]));
  meet.groups = canonical.map(c => {
    const existing = byId.get(c.id);
    if (!existing) return c;

    existing.type = "age";
    existing.label = c.label;
    existing.ages = c.ages;

    // ensure divisions exist
    existing.divisions = existing.divisions || emptyDivisions();
    for (const k of DIV_KEYS) {
      if (!existing.divisions[k]) existing.divisions[k] = { enabled: false, cost: 0, distances: ["", "", "", ""] };
      existing.divisions[k].enabled = !!existing.divisions[k].enabled;
      existing.divisions[k].cost = Number(existing.divisions[k].cost ?? 0);
      existing.divisions[k].distances = (existing.divisions[k].distances || ["", "", "", ""]).slice(0, 4);
    }
    return existing;
  });

  return before !== meet.groups.length;
}

function ensureSkateAbility(meet) {
  if (!meet) return false;
  if (!Array.isArray(meet.skateAbilityBoxes)) {
    meet.skateAbilityBoxes = [buildDefaultSkateAbilityBox()];
    return true;
  }
  if (!meet.skateAbilityBoxes.length) {
    meet.skateAbilityBoxes = [buildDefaultSkateAbilityBox()];
    return true;
  }
  // normalize
  let changed = false;
  meet.skateAbilityBoxes = meet.skateAbilityBoxes.map((b, idx) => {
    const out = {
      id: Number(b?.id || (idx + 1)),
      label: String(b?.label || "SkateAbility"),
      agesLabel: String(b?.agesLabel || "Manual Age"),
      enabled: !!b?.enabled,
      cost: Number(b?.cost ?? 0),
      distances: (b?.distances || ["", "", "", ""]).slice(0, 4)
    };
    // fix missing fields
    if (!b || b.id !== out.id) changed = true;
    return out;
  });
  return changed;
}

function migrateDb() {
  let changed = false;

  if (!db.version || db.version < DATA_VERSION) {
    db.version = DATA_VERSION;
    changed = true;
  }

  for (const meet of (db.meets || [])) {
    let meetChanged = false;

    // unify groups if old split model exists
    meetChanged = migrateSplitGroupsToUnified(meet) || meetChanged;

    // remove deprecated groups and force canonical list
    meetChanged = pruneDeprecatedGroups(meet) || meetChanged;

    // lock adult ages/labels
    meetChanged = migrateMeetAdultAges(meet) || meetChanged;

    // ensure skateability exists
    meetChanged = ensureSkateAbility(meet) || meetChanged;

    if (meetChanged) {
      meet.updatedAt = nowIso();
      changed = true;
    }
  }

  if (changed) {
    saveDb();
    console.log("✅ DB migration applied (v6).");
  } else {
    console.log("✅ DB migration check: no changes needed.");
  }
}

migrateDb();

// ============================================================
// AUTH / ROLES (multi-role + role selection)
// ============================================================

const SSM_SALT = crypto.createHash("sha256").update("ssm_salt_wichita").digest("hex");
function passHash(password) {
  return crypto.pbkdf2Sync(password, SSM_SALT, 100000, 32, "sha256").toString("hex");
}

const users = [
  { username: "Lbird22", hash: passHash("@Redline22"), roles: ["director", "judge", "coach"] },
  { username: "JudgeLee", hash: passHash("Redline22"), roles: ["judge"] },
  { username: "CoachLee", hash: passHash("Redline22"), roles: ["coach"] }
];

const sessions = new Map();
const SESSION_COOKIE = "ssm_session";
const SESSION_TTL = 1000 * 60 * 60 * 12;

function createSession(username, roles) {
  const sid = crypto.randomBytes(24).toString("hex");
  sessions.set(sid, { username, roles, activeRole: null, exp: Date.now() + SESSION_TTL });
  return sid;
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(p => {
    const [k, v] = p.trim().split("=");
    if (k) out[k] = decodeURIComponent(v || "");
  });
  return out;
}

function setSessionCookie(res, sid) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=${sid}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL / 1000)}`,
    ...(isProd ? ["Secure"] : [])
  ];
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`);
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies[SESSION_COOKIE];
  const s = sessions.get(sid);
  if (!s) return null;
  if (s.exp < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  s.exp = Date.now() + SESSION_TTL;
  sessions.set(sid, s);
  return { sid, ...s };
}

function requireAuth() {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) return res.redirect("/login");
    req.user = s;
    next();
  };
}

function requireMode(allowedRoles) {
  return (req, res, next) => {
    const s = getSession(req);
    if (!s) return res.redirect("/login");
    req.user = s;

    if (!s.activeRole) return res.redirect("/select-role");
    if (!s.roles?.includes(s.activeRole)) return res.redirect("/select-role");
    if (!allowedRoles.includes(s.activeRole)) return res.status(403).send("Access Denied (mode)");

    next();
  };
}

// ============================================================
// UI HELPERS
// ============================================================

function safeText(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageShell({ title = "SpeedSkateMeet", user = null, bodyHtml = "", extraScript = "" }) {
  const header = user
    ? `<h2>SpeedSkateMeet • ${safeText(user.username)} ${user.activeRole ? `(<span class="mono">${safeText(user.activeRole.toUpperCase())} MODE</span>)` : ""}</h2>`
    : `<h2>SpeedSkateMeet</h2>`;

  const roleSwitch = user?.username
    ? `<a class="btn ghost" href="/select-role">Switch Role</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeText(title)}</title>
<style>
  body { font-family: Arial, sans-serif; margin:20px; background:#f8f9fa; line-height:1.6; }
  h1, h2, h3 { color:#222; }
  .btn { padding:10px 16px; background:#007bff; color:white; border:none; border-radius:10px; cursor:pointer; margin:4px; display:inline-block; text-decoration:none; }
  .btn.ghost { background:transparent; border:1px solid #007bff; color:#007bff; }
  .btn.danger { background:#dc3545; border:1px solid #dc3545; }
  .btn.good { background:#28a745; border:1px solid #28a745; }
  .section { background:white; padding:16px; border-radius:14px; box-shadow:0 2px 12px rgba(0,0,0,0.08); margin:16px 0; }
  .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:16px; }
  input, select, textarea { padding:8px; border-radius:10px; border:1px solid #ccc; width: min(520px, 95%); }
  .row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
  small.hint { color:#666; }
  .tag { display:inline-block; padding:2px 10px; border:1px solid #ddd; border-radius:999px; font-size:12px; margin-left:8px; color:#444; }
  hr { border:none; border-top:1px solid #e7e7e7; margin:16px 0; }
  ul { margin-top:8px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .card { border:1px solid #e8e8e8; border-radius:16px; padding:16px; }
  .pill { display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px; background:#f1f3f5; }
  .subtle { color:#666; font-size:13px; }

  /* Suggestions dropdown (replaces <datalist>) */
  .ssm-suggest {
    position: absolute;
    z-index: 99999;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 12px;
    box-shadow: 0 10px 24px rgba(0,0,0,0.12);
    padding: 6px;
    max-height: 220px;
    overflow: auto;
    min-width: 240px;
    display: none;
  }
  .ssm-suggest button {
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    padding: 8px 10px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 14px;
  }
  .ssm-suggest button:hover { background: #f3f6ff; }
  .ssm-suggest .muted { color:#666; font-size:12px; padding: 4px 10px 6px; }
</style>
</head>
<body>
<header style="text-align:center; margin-bottom:20px;">
  ${header}
  <div style="margin-top:10px;">
    <a class="btn ghost" href="/">Home</a>
    <a class="btn ghost" href="/meets">Find a Meet</a>
    <a class="btn ghost" href="/rinks">Find a Rink</a>
    <a class="btn ghost" href="/live">Live Race Day</a>
    ${user ? `<a class="btn" href="/portal">Portal</a> ${roleSwitch} <a class="btn ghost" href="/logout">Logout</a>` : `<a class="btn" href="/login">Admin Login</a>`}
  </div>
</header>
${bodyHtml}
<div id="ssmSuggest" class="ssm-suggest"></div>
<script>${extraScript}</script>
</body>
</html>`;
}

function fmtCheckIn(n) {
  return String(n).padStart(3, "0");
}

function swap(arr, i, j) {
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
}

function dayRank(day) {
  return ({ "Day 1": 1, "Day 2": 2, "Day 3": 3 }[day] || 99);
}

// ============================================================
// DISTANCE SUGGESTIONS (custom dropdown + manual entry)
// ============================================================

function buildDistanceSuggestions(trackLength) {
  const tl = Number(trackLength || 100);
  const out = [];

  out.push(`${tl}m (1 lap)`);
  out.push(`${tl * 2}m (2 laps)`);
  out.push(`${tl * 3}m (3 laps)`);
  out.push(`200m`);
  out.push(`300m`);
  out.push(`500m`);
  out.push(`1000m`);

  for (let laps = 1; laps <= 100; laps++) {
    out.push(`${tl * laps}m (${laps} lap${laps === 1 ? "" : "s"})`);
  }

  return Array.from(new Set(out));
}

// ============================================================
// RACE ORDER GENERATION (STRICT BY BLOCKS + CUSTOM RACES)
// ============================================================

function getDistanceList(meet, groupId, divisionKey) {
  // age groups
  const g = meet.groups.find(x => x.id === groupId);
  if (g) {
    const d = g.divisions?.[divisionKey];
    if (!d) return [];
    return (d.distances || []).map(s => String(s || "").trim()).filter(Boolean);
  }

  // skateability special boxes
  if (String(groupId || "").startsWith("skateability::")) {
    const boxId = Number(String(groupId).split("::")[1]);
    const box = (meet.skateAbilityBoxes || []).find(b => Number(b.id) === boxId);
    if (!box) return [];
    return (box.distances || []).map(s => String(s || "").trim()).filter(Boolean);
  }

  return [];
}

function labelFor(meet, groupId, divisionKey) {
  const g = meet.groups.find(x => x.id === groupId);
  if (g) return `${g.label} – ${String(divisionKey).toUpperCase()}`;

  if (String(groupId || "").startsWith("skateability::")) {
    const boxId = Number(String(groupId).split("::")[1]);
    const box = (meet.skateAbilityBoxes || []).find(b => Number(b.id) === boxId);
    if (!box) return `SkateAbility`;
    return `${box.label} (${box.agesLabel})`;
  }

  return groupId;
}

function findCustomRace(meet, customRaceId) {
  return (meet.customRaces || []).find(r => r.id == customRaceId) || null;
}

function generateRaceOrderStrict(meet) {
  const blocks = (meet.blocks || [])
    .slice()
    .sort((a, b) => dayRank(a.day) - dayRank(b.day) || a.order - b.order);

  const races = [];
  let seq = 1;

  for (const block of blocks) {
    const items = (block.items || []).slice(); // do not sort
    for (const it of items) {
      if (it.type === "division") {
        const dists = getDistanceList(meet, it.groupId, it.divisionKey);
        for (let i = 0; i < dists.length; i++) {
          races.push({
            id: seq,
            seq,
            day: block.day,
            blockId: block.id,
            blockOrder: block.order,
            blockName: block.name,
            raceType: "normal",
            sourceType: "division",
            groupId: it.groupId,
            divisionKey: it.divisionKey,
            distanceIndex: i,
            distance: dists[i],
            label: labelFor(meet, it.groupId, it.divisionKey),
            status: "pending"
          });
          seq++;
        }
      } else if (it.type === "custom") {
        const cr = findCustomRace(meet, it.customRaceId);
        if (!cr) continue;

        const dist = String(cr.distance || "").trim();
        races.push({
          id: seq,
          seq,
          day: block.day,
          blockId: block.id,
          blockOrder: block.order,
          blockName: block.name,
          raceType: cr.raceType || "normal",
          sourceType: "custom",
          customRaceId: cr.id,
          distanceIndex: 0,
          distance: dist,
          label: cr.name || `Custom Race #${cr.id}`,
          status: "pending"
        });
        seq++;
      }
    }
  }

  meet.races = races;
  meet.raceOrderGeneratedAt = nowIso();
}

// ============================================================
// SCHEDULE GENERATION (ESTIMATE FROM RACE COUNT)
// ============================================================

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fromMinutes(total) {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function generateScheduleForMeet(meet) {
  generateRaceOrderStrict(meet);

  const cfg = meet.scheduleConfig || {};
  const warmupMin = Number(cfg.warmupMinutes ?? 20);
  const perRace = Number(cfg.minutesPerRace ?? 2);
  const transMin = Number(cfg.blockTransitionMinutes ?? 5);
  const lunchMin = Number(cfg.lunchMinutes ?? 30);
  const lunchAfter = Number(cfg.lunchAfterMinutesFromStart ?? 240);

  const blocks = (meet.blocks || [])
    .slice()
    .sort((a, b) => dayRank(a.day) - dayRank(b.day) || a.order - b.order);

  const racesByBlock = {};
  for (const r of (meet.races || [])) {
    racesByBlock[r.blockId] = racesByBlock[r.blockId] || [];
    racesByBlock[r.blockId].push(r);
  }

  const byDay = {};
  for (const b of blocks) {
    byDay[b.day] = byDay[b.day] || [];
    byDay[b.day].push(b);
  }

  const out = {};
  for (const day of Object.keys(byDay)) {
    const start = toMinutes(meet.raceDayStartTimes?.[day] || "08:00");
    let t = start;

    const timeline = [];
    timeline.push({ label: "Warmup", start: fromMinutes(t), end: fromMinutes(t + warmupMin) });
    t += warmupMin;
    const dayStart = t;
    let lunchTaken = false;

    for (const block of byDay[day]) {
      if (!lunchTaken && (t - dayStart) >= lunchAfter) {
        timeline.push({ label: "Lunch", start: fromMinutes(t), end: fromMinutes(t + lunchMin) });
        t += lunchMin;
        lunchTaken = true;
      }

      const raceCount = (racesByBlock[block.id] || []).length;
      const blockMinutes = raceCount * perRace;

      const label = `${block.name} (est. ${raceCount} races)`;
      const s = t;
      const e = t + blockMinutes;
      timeline.push({ label, start: fromMinutes(s), end: fromMinutes(e) });

      t = e + transMin;
    }

    out[day] = { day, startTime: meet.raceDayStartTimes?.[day] || "08:00", timeline };
  }

  meet.generatedSchedule = out;
  return out;
}

// ============================================================
// ROUTE HELPERS
// ============================================================

function findMeet(meetId) {
  return db.meets.find(m => m.id == meetId);
}

function findMeetAndBlock(meetId, blockId) {
  const meet = findMeet(meetId);
  if (!meet) return { meet: null, block: null };
  const block = (meet.blocks || []).find(b => b.id == blockId);
  return { meet, block };
}

function normalizeBlockOrder(meet) {
  (meet.blocks || [])
    .slice()
    .sort((a, b) => dayRank(a.day) - dayRank(b.day) || a.order - b.order)
    .forEach((b, idx) => (b.order = idx + 1));
}

function nextBlockId(meet) {
  return meet.blocks?.length ? Math.max(...meet.blocks.map(b => b.id)) + 1 : 1;
}

function nextSkateAbilityId(meet) {
  const max = (meet.skateAbilityBoxes || []).reduce((m, b) => Math.max(m, Number(b.id || 0)), 0);
  return max + 1;
}

// Challenge Up mapping: novice → elite, elite → open
function nextClassUp(k) {
  if (k === "novice") return "elite";
  if (k === "elite") return "open";
  return null;
}

// ============================================================
// MAIN PAGES
// ============================================================

app.get("/", (req, res) => {
  const s = getSession(req);
  res.send(
    pageShell({
      title: "SpeedSkateMeet",
      user: s,
      bodyHtml: `
        <div class="section" style="text-align:center; padding:22px;">
          <h1>SpeedSkateMeet</h1>
          <p class="pill">Built by the speed skating community, for the speed skating community</p>
          <p>USARS-style inline meet software • web-based • works on any device</p>
          <div class="row" style="justify-content:center;">
            <a href="/meets" class="btn">Find a Meet</a>
            <a href="/rinks" class="btn">Find a Rink</a>
            <a href="/live" class="btn good">Live Race Day</a>
            <a href="/login" class="btn ghost">Admin Login</a>
          </div>
          <small class="hint">Data persists to <span class="mono">${safeText(DATA_FILE)}</span></small>
          <div style="margin-top:10px;">
            <small class="hint"><b>Adult ages locked:</b> Classic 25–34 • Masters 35–44</small>
          </div>
        </div>
      `
    })
  );
});

// ============================================================
// AUTH UI
// ============================================================

app.get("/login", (req, res) => {
  const s = getSession(req);
  const isProd = process.env.NODE_ENV === "production";
  res.send(
    pageShell({
      title: "Login",
      user: s,
      bodyHtml: `
        <div class="section" style="max-width:520px; margin: 0 auto;">
          <h1>Admin Login</h1>
          <form method="POST" action="/login">
            <div>Username</div>
            <input name="username" required><br><br>
            <div>Password</div>
            <input name="password" type="password" required><br><br>
            <button class="btn" type="submit">Login</button>
          </form>
          <hr>
          <small class="hint">
            <b>Demo usernames:</b><br>
            Director: Lbird22<br>
            Judge: JudgeLee<br>
            Coach: CoachLee<br>
            <span class="subtle">${isProd ? "Passwords are never displayed on public pages." : "Dev note: passwords intentionally not shown."}</span>
          </small>
        </div>
      `
    })
  );
});

app.post("/login", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = (req.body.password || "").trim();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (user && passHash(password) === user.hash) {
    const sid = createSession(user.username, user.roles);
    setSessionCookie(res, sid);

    const s = sessions.get(sid);
    if (user.roles.length === 1) {
      s.activeRole = user.roles[0];
      sessions.set(sid, s);
      return res.redirect("/portal");
    }
    return res.redirect("/select-role");
  }
  return res.redirect("/login");
});

app.get("/select-role", requireAuth(), (req, res) => {
  const roles = req.user.roles || [];
  const cards = [
    { role: "director", title: "Meet Director", desc: "Build meets, blocks, custom races, override anything.", color: "#2563eb" },
    { role: "judge", title: "Judge", desc: "Enter results and times. Saves update live.", color: "#7c3aed" },
    { role: "coach", title: "Coach", desc: "Team roster, bulk registration, meet planning.", color: "#16a34a" }
  ].filter(x => roles.includes(x.role));

  const html = cards.map(c => `
    <div class="card" style="border-left:8px solid ${c.color};">
      <h2 style="margin:0 0 6px 0;">${safeText(c.title)}</h2>
      <p style="margin:0 0 10px 0; color:#555;">${safeText(c.desc)}</p>
      <form method="POST" action="/select-role">
        <input type="hidden" name="role" value="${safeText(c.role)}">
        <button class="btn" type="submit">Enter ${safeText(c.title)} Mode</button>
      </form>
    </div>
  `).join("");

  res.send(pageShell({
    title: "Select Role",
    user: req.user,
    bodyHtml: `
      <div class="section" style="max-width:920px; margin:0 auto;">
        <h1>Choose how you want to enter SpeedSkateMeet today</h1>
        <div class="grid" style="margin-top:14px;">${html}</div>
        <div class="row" style="justify-content:center; margin-top:10px;">
          <a class="btn ghost" href="/logout">Logout</a>
        </div>
      </div>
    `
  }));
});

app.post("/select-role", requireAuth(), (req, res) => {
  const role = (req.body.role || "").trim();
  const s = sessions.get(req.user.sid);
  if (!s) return res.redirect("/login");
  if (!s.roles?.includes(role)) return res.redirect("/select-role");
  s.activeRole = role;
  sessions.set(req.user.sid, s);
  res.redirect("/portal");
});

app.get("/logout", (req, res) => {
  const cookies = parseCookies(req);
  const sid = cookies[SESSION_COOKIE];
  if (sid) sessions.delete(sid);
  clearSessionCookie(res);
  res.redirect("/");
});

// ============================================================
// PORTAL (role-based home)
// ============================================================

app.get("/portal", requireAuth(), (req, res) => {
  const s = req.user;
  if (!s.activeRole) return res.redirect("/select-role");

  const cards = [];

  if (s.activeRole === "director") {
    cards.push(`
      <div class="section">
        <h2>Director Tools</h2>
        <div class="row">
          <a class="btn" href="/admin">Director Dashboard</a>
          <a class="btn ghost" href="/live">Live</a>
        </div>
        <small class="hint">Full access. You can switch roles any time.</small>
      </div>
    `);
  }

  if (s.activeRole === "judge") {
    cards.push(`
      <div class="section">
        <h2>Judge Tools</h2>
        <div class="row">
          <a class="btn" href="/judge">Judge Panel</a>
          <a class="btn ghost" href="/live">Live</a>
        </div>
        <small class="hint">Saving results updates the live page.</small>
      </div>
    `);
  }

  if (s.activeRole === "coach") {
    cards.push(`
      <div class="section">
        <h2>Coach Tools</h2>
        <div class="row">
          <a class="btn" href="/coach">Coach Dashboard</a>
          <a class="btn ghost" href="/live">Live</a>
        </div>
        <small class="hint">Roster + bulk registration will live here (v1 stub).</small>
      </div>
    `);
  }

  res.send(pageShell({
    title: "Portal",
    user: s,
    bodyHtml: `<div class="section"><h1>Portal</h1><p>Select tools for your current role mode.</p></div>${cards.join("")}`
  }));
});

// ============================================================
// MEETS – PUBLIC LIST + REGISTER (with class selections)
// ============================================================

app.get("/meets", (req, res) => {
  const s = getSession(req);
  const cards =
    db.meets
      .slice()
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .map(m => `
        <div class="section">
          <h3>${safeText(m.meetName)} <span class="tag">Meet #${m.id}</span></h3>
          <p><b>Date:</b> ${safeText(m.date || "TBD")}<br>
             <b>Track:</b> ${safeText(String(m.trackLength))}m • <b>Lanes:</b> ${safeText(String(m.lanes))}
          </p>
          <div class="row">
            <a href="/register/${m.id}" class="btn">Register</a>
            <a href="/live/${m.id}" class="btn ghost">Live View</a>
          </div>
        </div>
      `).join("") || `<div class="section"><p>No meets yet. Directors can build one in the dashboard.</p></div>`;

  res.send(pageShell({ title: "Find a Meet", user: s, bodyHtml: `<h1>Available Meets</h1><div class="grid">${cards}</div>` }));
});

app.get("/register/:meetId", (req, res) => {
  const s = getSession(req);
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const teamsOptions = globalTeams.map(t => `<option value="${safeText(t.name)}">${safeText(t.name)}</option>`).join("");

  const regStatus = meet.registrationOpen
    ? `<span class="tag">Registration OPEN</span>`
    : `<span class="tag" style="border-color:#dc3545;color:#dc3545;">Registration CLOSED</span>`;

  const divisionOptions = (meet.groups || []).map(g => `<option value="${safeText(g.id)}">${safeText(g.label)} (${safeText(g.ages)})</option>`).join("");

  res.send(pageShell({
    title: "Register",
    user: s,
    bodyHtml: `
      <div class="section">
        <h1>Register ${regStatus}</h1>
        <p><b>${safeText(meet.meetName)}</b> (Meet #${meet.id}) • ${safeText(meet.date || "TBD")}</p>

        ${meet.registrationOpen ? `
        <form method="POST" action="/register/${meet.id}/submit">
          <div class="row">
            <div><div>First Name *</div><input name="firstName" required></div>
            <div><div>Last Name *</div><input name="lastName" required></div>
          </div>

          <div style="margin-top:10px;">
            <div>Team *</div>
            <select name="team" required>${teamsOptions}</select>
          </div>

          ${meet.requireUsarsNumber ? `
            <div style="margin-top:10px;">
              <div>USARS Number *</div>
              <input name="usarsNumber" required placeholder="Required for this meet">
            </div>
          ` : `
            <div style="margin-top:10px;">
              <div>USARS Number (optional)</div>
              <input name="usarsNumber" placeholder="Optional">
            </div>
          `}

          <hr>

          <div style="margin-top:10px;">
            <div>Age Division *</div>
            <select name="groupId" required>
              <option value="">Select your age division…</option>
              ${divisionOptions}
            </select>
          </div>

          <div style="margin-top:10px;">
            <div>Classifications *</div>
            <label style="display:inline-flex; gap:8px; align-items:center; margin-right:14px;">
              <input type="checkbox" name="class_novice" value="on"> Novice
            </label>
            <label style="display:inline-flex; gap:8px; align-items:center; margin-right:14px;">
              <input type="checkbox" name="class_elite" value="on"> Elite
            </label>
            <label style="display:inline-flex; gap:8px; align-items:center;">
              <input type="checkbox" name="class_open" value="on"> Open
            </label>
            <div class="subtle">You can pick one, or multiple (ex: Novice + Elite).</div>
          </div>

          <div style="margin-top:10px;">
            <label style="display:inline-flex; gap:8px; align-items:center;">
              <input type="checkbox" name="challengeUp" value="on"> Challenge Up
            </label>
            <div class="subtle">If checked, we automatically add the next class up (Novice→Elite, Elite→Open).</div>
          </div>

          <div style="margin-top:14px;">
            <button class="btn" type="submit">Register</button>
            <a class="btn ghost" href="/meets">Back</a>
          </div>
          <small class="hint">This assigns your check-in / skater number.</small>
        </form>
        ` : `
          <p><b>This meet is no longer accepting registrations.</b></p>
          <a class="btn" href="/meets">Back to Meets</a>
        `}
      </div>
    `
  }));
});

app.post("/register/:meetId/submit", (req, res) => {
  const s = getSession(req);
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!meet.registrationOpen) return res.status(403).send("Registration closed");

  const firstName = (req.body.firstName || "").trim();
  const lastName = (req.body.lastName || "").trim();
  const team = (req.body.team || "").trim();
  const usarsNumber = (req.body.usarsNumber || "").trim();
  const groupId = (req.body.groupId || "").trim();

  if (!firstName || !lastName || !team || !groupId) return res.status(400).send("Missing fields");
  if (meet.requireUsarsNumber && !usarsNumber) return res.status(400).send("USARS number required");

  const chosen = [];
  if (req.body.class_novice === "on") chosen.push("novice");
  if (req.body.class_elite === "on") chosen.push("elite");
  if (req.body.class_open === "on") chosen.push("open");
  if (!chosen.length) return res.status(400).send("Pick at least one classification");

  const challengeUp = req.body.challengeUp === "on";
  const finalClasses = new Set(chosen);

  if (challengeUp) {
    for (const k of chosen) {
      const up = nextClassUp(k);
      if (up) finalClasses.add(up);
    }
  }

  const checkInNumber = meet.nextCheckInNumber++;
  meet.registrations.push({
    checkInNumber,
    firstName,
    lastName,
    team,
    usarsNumber,
    groupId,
    classes: Array.from(finalClasses),
    challengeUp,
    timestamp: nowIso()
  });
  meet.updatedAt = nowIso();

  generateRaceOrderStrict(meet);
  saveDb();

  const group = (meet.groups || []).find(g => g.id === groupId);
  const groupLabel = group ? `${group.label} (${group.ages})` : groupId;

  res.send(pageShell({
    title: "Registered!",
    user: s,
    bodyHtml: `
      <div class="section">
        <h1>Registered!</h1>
        <p>Your Check-In / Skater Number:</p>
        <h2 style="margin-top:-6px;">#${fmtCheckIn(checkInNumber)}</h2>
        <p><b>Name:</b> ${safeText(firstName)} ${safeText(lastName)}<br>
           <b>Team:</b> ${safeText(team)}<br>
           <b>USARS:</b> ${safeText(usarsNumber || "—")}<br>
           <b>Division:</b> ${safeText(groupLabel)}<br>
           <b>Classes:</b> ${safeText(Array.from(finalClasses).map(x => x.toUpperCase()).join(", "))} ${challengeUp ? `<span class="tag">Challenge Up</span>` : ``}
        </p>
        <a class="btn" href="/meets">Back to Meets</a>
        <a class="btn ghost" href="/live/${meet.id}">Live View</a>
      </div>
    `
  }));
});

// ============================================================
// DIRECTOR DASHBOARD + MEET BUILDER
// ============================================================

app.get("/admin", requireMode(["director"]), (req, res) => {
  const meetCards =
    db.meets
      .slice()
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .map(m => `
        <div class="section">
          <h3>${safeText(m.meetName)} <span class="tag">Meet #${m.id}</span></h3>
          <p>
            <b>Date:</b> ${safeText(m.date || "TBD")} •
            <b>Regs:</b> ${m.registrations.length} •
            <b>Blocks:</b> ${(m.blocks || []).length} •
            <b>Custom:</b> ${(m.customRaces || []).length} •
            <b>Races:</b> ${(m.races || []).length}
          </p>
          <div class="row">
            <a class="btn" href="/admin/meet/${m.id}">Meet Builder</a>
            <a class="btn ghost" href="/admin/custom-races/${m.id}">Custom Races</a>
            <a class="btn ghost" href="/admin/blocks/${m.id}">Block Builder</a>
            <a class="btn ghost" href="/live/${m.id}">Live</a>
          </div>
        </div>
      `).join("") || `<div class="section"><p>No meets yet.</p></div>`;

  res.send(pageShell({
    title: "Director Dashboard",
    user: req.user,
    bodyHtml: `
      <h1>Director Dashboard</h1>
      <div class="row">
        <a class="btn" href="/admin/meet/new">Build New Meet</a>
      </div>
      <h2 style="margin-top:18px;">Meets</h2>
      <div class="grid">${meetCards}</div>
    `
  }));
});

app.get("/admin/meet/new", requireMode(["director"]), (req, res) => {
  const m = createNewMeet();
  db.meets.push(m);
  saveDb();
  res.redirect(`/admin/meet/${m.id}`);
});

app.get("/admin/meet/:id", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.id);
  if (!meet) return res.status(404).send("Meet not found");

  // safety: enforce canonical + locks
  let changed = false;
  changed = migrateSplitGroupsToUnified(meet) || changed;
  changed = pruneDeprecatedGroups(meet) || changed;
  changed = migrateMeetAdultAges(meet) || changed;
  changed = ensureSkateAbility(meet) || changed;
  if (changed) saveDb();

  const distSuggestions = buildDistanceSuggestions(meet.trackLength);

  // Age groups (unified headings)
  const groupsHtml = (meet.groups || []).map(g => {
    const entries = Object.entries(g.divisions).map(([k, d]) => `
      <div style="border:1px solid #e6e6e6; padding:10px; border-radius:14px; margin:10px 0;">
        <div class="row" style="justify-content:space-between;">
          <label style="display:flex; gap:8px; align-items:center;">
            <input type="checkbox" name="${g.id}.${k}.enabled" ${d.enabled ? "checked" : ""}>
            <b>${safeText(k.toUpperCase())}</b>
          </label>
          <div>Cost: <input name="${g.id}.${k}.cost" value="${safeText(String(d.cost ?? 0))}" style="width:110px;"></div>
        </div>
        <div class="row" style="margin-top:8px;">
          ${(d.distances || []).map((v, i) =>
            `D${i + 1}: <input data-suggest="distance" name="${g.id}.${k}.d${i}" value="${safeText(v || "")}" style="width:180px;">`
          ).join(" ")}
        </div>
        <small class="hint">Pick a suggested distance or type your own.</small>
      </div>
    `).join("");

    return `
      <div class="section">
        <h3>${safeText(g.label)} <span class="tag">${safeText(g.ages)}</span></h3>
        <div class="subtle">Choose which classifications you want to offer for this division.</div>
        ${entries}
      </div>
    `;
  }).join("");

  // SkateAbility boxes
  const saHtml = (meet.skateAbilityBoxes || []).map(b => `
    <div style="border:1px solid #e6e6e6; padding:12px; border-radius:14px; margin:10px 0;">
      <div class="row" style="justify-content:space-between;">
        <div>
          <b>${safeText(b.label)}</b> <span class="tag">${safeText(b.agesLabel)}</span>
        </div>
        <form method="POST" action="/admin/meet/${meet.id}/skateability/delete/${b.id}">
          <button class="btn danger" type="submit">Delete</button>
        </form>
      </div>

      <div class="row" style="margin-top:10px;">
        <label style="display:flex; gap:8px; align-items:center;">
          <input type="checkbox" name="skateability.${b.id}.enabled" ${b.enabled ? "checked" : ""}>
          <b>Enabled</b>
        </label>
        <div>Label: <input name="skateability.${b.id}.label" value="${safeText(b.label)}" style="width:220px;"></div>
        <div>Age Label: <input name="skateability.${b.id}.agesLabel" value="${safeText(b.agesLabel)}" style="width:220px;"></div>
        <div>Cost: <input name="skateability.${b.id}.cost" value="${safeText(String(b.cost ?? 0))}" style="width:110px;"></div>
      </div>

      <div class="row" style="margin-top:10px;">
        ${(b.distances || []).map((v, i) =>
          `D${i + 1}: <input data-suggest="distance" name="skateability.${b.id}.d${i}" value="${safeText(v || "")}" style="width:180px;">`
        ).join(" ")}
      </div>
      <small class="hint">SkateAbility has no novice/elite/open. Add multiple boxes if needed.</small>
      <div class="subtle">To schedule SkateAbility, add it to Blocks (it appears as “SkateAbility (Age Label)”).</div>
    </div>
  `).join("");

  res.send(pageShell({
    title: `Meet Builder #${meet.id}`,
    user: req.user,
    bodyHtml: `
      <h1>Meet Builder • Meet #${meet.id}</h1>

      <div class="section">
        <form method="POST" action="/admin/meet/${meet.id}/save">
          <div>Meet Name</div>
          <input name="meetName" value="${safeText(meet.meetName)}"><br><br>

          <div>Date</div>
          <input type="date" name="date" value="${safeText(meet.date || "")}"><br><br>

          <div class="row">
            <div>
              <div>Track Length (m)</div>
              <input name="trackLength" value="${safeText(String(meet.trackLength))}" style="width:160px;">
            </div>
            <div>
              <div>Lanes per Heat</div>
              <input name="lanes" value="${safeText(String(meet.lanes))}" style="width:160px;">
            </div>
          </div>

          <hr>

          <label style="display:flex; gap:8px; align-items:center;">
            <input type="checkbox" name="requireUsarsNumber" ${meet.requireUsarsNumber ? "checked" : ""}>
            Require USARS Number for registration
          </label>

          <hr>

          <h3>Race Day Start Times</h3>
          <div class="row">
            <div><div>Day 1</div><input type="time" name="day1Start" value="${safeText(meet.raceDayStartTimes?.["Day 1"] || "08:00")}" style="width:160px;"></div>
            <div><div>Day 2</div><input type="time" name="day2Start" value="${safeText(meet.raceDayStartTimes?.["Day 2"] || "08:00")}" style="width:160px;"></div>
            <div><div>Day 3</div><input type="time" name="day3Start" value="${safeText(meet.raceDayStartTimes?.["Day 3"] || "08:00")}" style="width:160px;"></div>
          </div>

          <hr>

          <h3>Schedule Assumptions</h3>
          <div class="row">
            <div><div>Warmup (min)</div><input name="warmupMinutes" value="${safeText(String(meet.scheduleConfig?.warmupMinutes ?? 20))}" style="width:160px;"></div>
            <div><div>Minutes per Race</div><input name="minutesPerRace" value="${safeText(String(meet.scheduleConfig?.minutesPerRace ?? 2))}" style="width:160px;"></div>
            <div><div>Block Transition (min)</div><input name="blockTransitionMinutes" value="${safeText(String(meet.scheduleConfig?.blockTransitionMinutes ?? 5))}" style="width:160px;"></div>
          </div>
          <div class="row" style="margin-top:10px;">
            <div><div>Lunch (min)</div><input name="lunchMinutes" value="${safeText(String(meet.scheduleConfig?.lunchMinutes ?? 30))}" style="width:160px;"></div>
            <div><div>Lunch after minutes</div><input name="lunchAfterMinutesFromStart" value="${safeText(String(meet.scheduleConfig?.lunchAfterMinutesFromStart ?? 240))}" style="width:200px;"></div>
          </div>

          <hr>

          <div class="row">
            <button class="btn" type="submit">Save Meet</button>
            <a class="btn ghost" href="/admin/custom-races/${meet.id}">Custom Races</a>
            <a class="btn ghost" href="/admin/blocks/${meet.id}">Block Builder</a>
            <a class="btn ghost" href="/live/${meet.id}">Live</a>
          </div>
        </form>

        <hr>

        <div class="row">
          <form method="POST" action="/admin/meet/${meet.id}/complete-registration">
            <button class="btn good" type="submit">Complete Registration + Generate Schedule</button>
          </form>
          <form method="POST" action="/admin/meet/${meet.id}/reopen-registration">
            <button class="btn danger" type="submit">Re-Open Registration</button>
          </form>
        </div>

        <small class="hint">
          Complete Registration locks signups, regenerates race order from blocks, and generates day timelines.
        </small>
      </div>

      <h2>SkateAbility</h2>
      <div class="section">
        <div class="subtle">SkateAbility is customizable per meet. Add as many boxes as you need. Manual age label.</div>
        <form method="POST" action="/admin/meet/${meet.id}/skateability/add">
          <button class="btn" type="submit">+ Add SkateAbility Box</button>
        </form>
        <hr>
        <form method="POST" action="/admin/meet/${meet.id}/save">
          ${saHtml}
          <div class="row" style="margin-top:10px;">
            <button class="btn" type="submit">Save Meet</button>
          </div>
        </form>
      </div>

      <h2>Age Divisions</h2>
      ${groupsHtml}
    `,
    extraScript: buildSuggestionsScript(distSuggestions)
  }));
});

function buildSuggestionsScript(distSuggestions) {
  // Custom anchored suggestions dropdown to avoid Safari <datalist> offset bug.
  // Uses single floating panel (#ssmSuggest) and anchors it to focused input.
  const suggestionsJson = JSON.stringify(distSuggestions || []);
  return `
  (function(){
    const SUGGESTIONS = ${suggestionsJson};

    const panel = document.getElementById('ssmSuggest');
    let activeInput = null;

    function closePanel(){
      panel.style.display = 'none';
      panel.innerHTML = '';
      activeInput = null;
    }

    function placePanelFor(input){
      const r = input.getBoundingClientRect();
      panel.style.left = (window.scrollX + r.left) + 'px';
      panel.style.top  = (window.scrollY + r.bottom + 6) + 'px';
      panel.style.minWidth = Math.max(240, r.width) + 'px';
    }

    function filterList(q){
      const s = String(q||'').trim().toLowerCase();
      if (!s) return SUGGESTIONS.slice(0, 10);
      const starts = [];
      const contains = [];
      for (const item of SUGGESTIONS){
        const low = String(item).toLowerCase();
        if (low.startsWith(s)) starts.push(item);
        else if (low.includes(s)) contains.push(item);
        if (starts.length + contains.length >= 12) break;
      }
      return starts.concat(contains).slice(0, 12);
    }

    function openFor(input){
      activeInput = input;
      placePanelFor(input);

      const q = input.value || '';
      const items = filterList(q);

      panel.innerHTML = '';
      const hint = document.createElement('div');
      hint.className = 'muted';
      hint.textContent = 'Suggestions (click to fill)';
      panel.appendChild(hint);

      for (const v of items){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = v;
        btn.addEventListener('mousedown', (e) => {
          // mousedown so it fires before input blur
          e.preventDefault();
          input.value = v;
          input.dispatchEvent(new Event('input', {bubbles:true}));
          closePanel();
          input.focus();
        });
        panel.appendChild(btn);
      }

      if (!items.length){
        const none = document.createElement('div');
        none.className = 'muted';
        none.textContent = 'No matches';
        panel.appendChild(none);
      }

      panel.style.display = 'block';
    }

    function attach(input){
      input.addEventListener('focus', () => openFor(input));
      input.addEventListener('input', () => {
        if (activeInput !== input) return;
        openFor(input);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePanel();
      });
      input.addEventListener('blur', () => {
        // allow click selection
        setTimeout(() => {
          if (document.activeElement !== input) closePanel();
        }, 120);
      });
    }

    function hookAll(){
      document.querySelectorAll('input[data-suggest="distance"]').forEach(attach);
    }

    window.addEventListener('scroll', () => {
      if (activeInput) placePanelFor(activeInput);
    }, true);
    window.addEventListener('resize', () => {
      if (activeInput) placePanelFor(activeInput);
    });

    document.addEventListener('click', (e) => {
      if (!activeInput) return;
      if (e.target === panel || panel.contains(e.target)) return;
      if (e.target === activeInput) return;
      closePanel();
    });

    hookAll();
  })();
  `;
}

app.post("/admin/meet/:id/skateability/add", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.id);
  if (!meet) return res.status(404).send("Meet not found");

  ensureSkateAbility(meet);
  meet.skateAbilityBoxes.push({
    id: nextSkateAbilityId(meet),
    label: "SkateAbility",
    agesLabel: "Manual Age",
    enabled: false,
    cost: 0,
    distances: ["", "", "", ""]
  });

  meet.updatedAt = nowIso();
  saveDb();
  res.redirect(`/admin/meet/${meet.id}`);
});

app.post("/admin/meet/:id/skateability/delete/:boxId", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.id);
  if (!meet) return res.status(404).send("Meet not found");

  const boxId = Number(req.params.boxId);
  meet.skateAbilityBoxes = (meet.skateAbilityBoxes || []).filter(b => Number(b.id) !== boxId);

  // Also remove from blocks
  (meet.blocks || []).forEach(b => {
    b.items = (b.items || []).filter(it => !(it.type === "division" && String(it.groupId) === `skateability::${boxId}`));
  });

  meet.updatedAt = nowIso();
  generateRaceOrderStrict(meet);
  saveDb();
  res.redirect(`/admin/meet/${meet.id}`);
});

app.post("/admin/meet/:id/save", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.id);
  if (!meet) return res.status(404).send("Meet not found");

  meet.meetName = (req.body.meetName || meet.meetName).trim() || meet.meetName;
  meet.date = (req.body.date || meet.date || "").trim();
  meet.trackLength = Number(req.body.trackLength || meet.trackLength || 100);
  meet.lanes = Number(req.body.lanes || meet.lanes || 4);

  meet.requireUsarsNumber = req.body.requireUsarsNumber === "on";

  meet.raceDayStartTimes = {
    "Day 1": (req.body.day1Start || meet.raceDayStartTimes?.["Day 1"] || "08:00").trim(),
    "Day 2": (req.body.day2Start || meet.raceDayStartTimes?.["Day 2"] || "08:00").trim(),
    "Day 3": (req.body.day3Start || meet.raceDayStartTimes?.["Day 3"] || "08:00").trim()
  };

  meet.scheduleConfig = {
    warmupMinutes: Number(req.body.warmupMinutes ?? meet.scheduleConfig?.warmupMinutes ?? 20),
    minutesPerRace: Number(req.body.minutesPerRace ?? meet.scheduleConfig?.minutesPerRace ?? 2),
    blockTransitionMinutes: Number(req.body.blockTransitionMinutes ?? meet.scheduleConfig?.blockTransitionMinutes ?? 5),
    lunchMinutes: Number(req.body.lunchMinutes ?? meet.scheduleConfig?.lunchMinutes ?? 30),
    lunchAfterMinutesFromStart: Number(req.body.lunchAfterMinutesFromStart ?? meet.scheduleConfig?.lunchAfterMinutesFromStart ?? 240)
  };

  // Ensure canonical groups exist
  pruneDeprecatedGroups(meet);

  // Save age groups divisions
  meet.groups.forEach(g => {
    Object.keys(g.divisions).forEach(k => {
      const d = g.divisions[k];
      d.enabled = req.body[`${g.id}.${k}.enabled`] === "on";
      d.cost = Number(req.body[`${g.id}.${k}.cost`] || 0);
      d.distances = (d.distances || ["", "", "", ""]).map((_, i) => (req.body[`${g.id}.${k}.d${i}`] || "").trim());
    });
  });

  // Save SkateAbility boxes
  ensureSkateAbility(meet);
  meet.skateAbilityBoxes = (meet.skateAbilityBoxes || []).map(b => {
    const id = Number(b.id);
    const enabled = req.body[`skateability.${id}.enabled`] === "on";
    const label = (req.body[`skateability.${id}.label`] || b.label || "SkateAbility").trim();
    const agesLabel = (req.body[`skateability.${id}.agesLabel`] || b.agesLabel || "Manual Age").trim();
    const cost = Number(req.body[`skateability.${id}.cost`] || 0);
    const distances = ["", "", "", ""].map((_, i) => (req.body[`skateability.${id}.d${i}`] || "").trim());
    return { id, enabled, label, agesLabel, cost, distances };
  });

  // lock adult ages every save (so it can’t regress)
  migrateMeetAdultAges(meet);

  meet.updatedAt = nowIso();
  generateRaceOrderStrict(meet);
  saveDb();
  res.redirect(`/admin/meet/${meet.id}`);
});

app.post("/admin/meet/:id/complete-registration", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.id);
  if (!meet) return res.status(404).send("Meet not found");

  meet.registrationOpen = false;
  meet.registrationClosedAt = nowIso();

  generateScheduleForMeet(meet);
  meet.updatedAt = nowIso();
  saveDb();

  res.redirect(`/admin/meet/${meet.id}`);
});

app.post("/admin/meet/:id/reopen-registration", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.id);
  if (!meet) return res.status(404).send("Meet not found");

  meet.registrationOpen = true;
  meet.registrationClosedAt = null;
  meet.updatedAt = nowIso();
  saveDb();

  res.redirect(`/admin/meet/${meet.id}`);
});

// ============================================================
// CUSTOM RACES (Director) — includes Time Trials
// ============================================================

app.get("/admin/custom-races/:meetId", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const distSuggestions = buildDistanceSuggestions(meet.trackLength);

  const list = (meet.customRaces || []).map(r => `
    <div class="section">
      <h3>${safeText(r.name)} <span class="tag">#${r.id}</span> ${r.raceType === "time_trial" ? `<span class="tag">TIME TRIAL</span>` : ``}</h3>
      <p><b>Distance:</b> ${safeText(r.distance || "—")}</p>
      <div class="row">
        <form method="POST" action="/admin/custom-races/${meet.id}/delete/${r.id}">
          <button class="btn danger" type="submit">Delete</button>
        </form>
      </div>
      <small class="hint">Add this to Blocks to schedule it anywhere.</small>
    </div>
  `).join("") || `<div class="section"><p><i>No custom races yet.</i></p></div>`;

  res.send(pageShell({
    title: "Custom Races",
    user: req.user,
    bodyHtml: `
      <h1>Custom Races</h1>
      <div class="section">
        <p><b>${safeText(meet.meetName)}</b> (Meet #${meet.id})</p>
        <div class="row">
          <a class="btn ghost" href="/admin/meet/${meet.id}">Back to Meet</a>
          <a class="btn ghost" href="/admin/blocks/${meet.id}">Block Builder</a>
          <a class="btn ghost" href="/live/${meet.id}">Live</a>
        </div>
      </div>

      <div class="section">
        <h2>Add Custom Race</h2>
        <form method="POST" action="/admin/custom-races/${meet.id}/add">
          <div>Race Name</div>
          <input name="name" required placeholder="Example: 200m Time Trial"><br><br>

          <div>Race Type</div>
          <select name="raceType">
            <option value="normal">Normal</option>
            <option value="time_trial">Time Trial</option>
          </select><br><br>

          <div>Distance</div>
          <input data-suggest="distance" name="distance" placeholder="Pick or type: 200m / 100m (1 lap) / etc"><br><br>

          <button class="btn" type="submit">Add Custom Race</button>
        </form>
        <small class="hint">Time Trials exist ONLY as Custom Races in v6.</small>
      </div>

      <h2>Existing Custom Races</h2>
      ${list}
    `,
    extraScript: buildSuggestionsScript(distSuggestions)
  }));
});

app.post("/admin/custom-races/:meetId/add", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const name = (req.body.name || "").trim();
  const raceType = (req.body.raceType || "normal").trim();
  const distance = (req.body.distance || "").trim();

  meet.customRaces = meet.customRaces || [];
  meet.customRaces.push({
    id: nextCustomRaceId(meet),
    name,
    raceType: (raceType === "time_trial" ? "time_trial" : "normal"),
    distance,
    createdAt: nowIso()
  });

  meet.updatedAt = nowIso();
  generateRaceOrderStrict(meet);
  saveDb();

  res.redirect(`/admin/custom-races/${meet.id}`);
});

app.post("/admin/custom-races/:meetId/delete/:raceId", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const raceId = Number(req.params.raceId);
  meet.customRaces = (meet.customRaces || []).filter(r => r.id !== raceId);

  (meet.blocks || []).forEach(b => {
    b.items = (b.items || []).filter(it => !(it.type === "custom" && Number(it.customRaceId) === raceId));
  });

  meet.updatedAt = nowIso();
  generateRaceOrderStrict(meet);
  saveDb();

  res.redirect(`/admin/custom-races/${meet.id}`);
});

// ============================================================
// BLOCK BUILDER (Director) — division items + custom race items
// ============================================================

app.get("/admin/blocks/:meetId", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const blocks = (meet.blocks || [])
    .slice()
    .sort((a, b) => dayRank(a.day) - dayRank(b.day) || a.order - b.order);

  const blocksHtml =
    blocks.map(b => {
      const items = (b.items || []).map(it => {
        if (it.type === "division") {
          // skateability item
          if (String(it.groupId || "").startsWith("skateability::")) {
            return labelFor(meet, it.groupId, it.divisionKey);
          }
          return labelFor(meet, it.groupId, it.divisionKey);
        }
        if (it.type === "custom") {
          const cr = findCustomRace(meet, it.customRaceId);
          return cr ? `[Custom] ${cr.name}` : `[Custom] #${it.customRaceId}`;
        }
        return "Unknown";
      });

      return `
        <div class="section">
          <h3>${safeText(b.day)} • ${safeText(b.name)} <span class="tag">Block #${b.id}</span></h3>
          <p><b>Items:</b> ${items.length ? safeText(items.join(" | ")) : "<i>None yet</i>"}</p>
          <div class="row">
            <a class="btn" href="/admin/blocks/${meet.id}/edit/${b.id}">Edit Block Contents</a>
            <form method="POST" action="/admin/blocks/${meet.id}/moveup/${b.id}">
              <button class="btn ghost" type="submit">↑ Block Up</button>
            </form>
            <form method="POST" action="/admin/blocks/${meet.id}/movedown/${b.id}">
              <button class="btn ghost" type="submit">↓ Block Down</button>
            </form>
            <form method="POST" action="/admin/blocks/${meet.id}/delete/${b.id}">
              <button class="btn danger" type="submit">Delete Block</button>
            </form>
          </div>
        </div>
      `;
    }).join("") || `<div class="section"><p>No blocks yet. Add your first block below.</p></div>`;

  res.send(pageShell({
    title: `Block Builder – Meet #${meet.id}`,
    user: req.user,
    bodyHtml: `
      <h1>Block Builder</h1>
      <div class="section">
        <p><b>${safeText(meet.meetName)}</b> (Meet #${meet.id})</p>
        <div class="row">
          <a class="btn ghost" href="/admin/meet/${meet.id}">Back to Meet</a>
          <a class="btn ghost" href="/admin/custom-races/${meet.id}">Custom Races</a>
          <a class="btn ghost" href="/live/${meet.id}">Live</a>
        </div>
        <small class="hint">Blocks control race day flow. Add Age Divisions, SkateAbility boxes, or Custom Races (Time Trials).</small>
      </div>

      <div class="section">
        <h2>Add Block</h2>
        <form method="POST" action="/admin/blocks/${meet.id}/add">
          <div class="row">
            <div>
              <div>Day</div>
              <select name="day">
                <option value="Day 1">Day 1</option>
                <option value="Day 2">Day 2</option>
                <option value="Day 3">Day 3</option>
              </select>
            </div>
            <div>
              <div>Block Name</div>
              <input name="name" placeholder="Example: Tiny Tots + Seniors" required>
            </div>
          </div>
          <br>
          <button class="btn" type="submit">Add Block</button>
        </form>
      </div>

      <h2>Blocks (Ordered)</h2>
      ${blocksHtml}
    `
  }));
});

app.post("/admin/blocks/:meetId/add", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const day = (req.body.day || "Day 1").trim();
  const name = (req.body.name || "Block").trim();

  const blocksSorted = (meet.blocks || []).slice().sort((a, b) => dayRank(a.day) - dayRank(b.day) || a.order - b.order);
  const maxOrder = blocksSorted.length ? Math.max(...blocksSorted.map(b => b.order)) : 0;

  meet.blocks.push({
    id: nextBlockId(meet),
    day,
    name,
    items: [],
    order: maxOrder + 1,
    createdAt: nowIso()
  });

  normalizeBlockOrder(meet);
  meet.updatedAt = nowIso();
  generateRaceOrderStrict(meet);
  saveDb();
  res.redirect(`/admin/blocks/${meet.id}`);
});

app.post("/admin/blocks/:meetId/moveup/:blockId", requireMode(["director"]), (req, res) => {
  const { meet, block } = findMeetAndBlock(req.params.meetId, req.params.blockId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!block) return res.status(404).send("Block not found");

  const blocks = (meet.blocks || []).slice().sort((a, b) => dayRank(a.day) - dayRank(b.day) || a.order - b.order);
  const idx = blocks.findIndex(b => b.id === block.id);
  if (idx > 0) {
    swap(blocks, idx, idx - 1);
    blocks.forEach((b, i) => (b.order = i + 1));
    meet.blocks = blocks;
    meet.updatedAt = nowIso();
    generateRaceOrderStrict(meet);
    saveDb();
  }
  res.redirect(`/admin/blocks/${meet.id}`);
});

app.post("/admin/blocks/:meetId/movedown/:blockId", requireMode(["director"]), (req, res) => {
  const { meet, block } = findMeetAndBlock(req.params.meetId, req.params.blockId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!block) return res.status(404).send("Block not found");

  const blocks = (meet.blocks || []).slice().sort((a, b) => dayRank(a.day) - dayRank(b.day) || a.order - b.order);
  const idx = blocks.findIndex(b => b.id === block.id);
  if (idx >= 0 && idx < blocks.length - 1) {
    swap(blocks, idx, idx + 1);
    blocks.forEach((b, i) => (b.order = i + 1));
    meet.blocks = blocks;
    meet.updatedAt = nowIso();
    generateRaceOrderStrict(meet);
    saveDb();
  }
  res.redirect(`/admin/blocks/${meet.id}`);
});

app.post("/admin/blocks/:meetId/delete/:blockId", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  meet.blocks = (meet.blocks || []).filter(b => b.id != req.params.blockId);
  normalizeBlockOrder(meet);
  meet.updatedAt = nowIso();
  generateRaceOrderStrict(meet);
  saveDb();

  res.redirect(`/admin/blocks/${meet.id}`);
});

app.get("/admin/blocks/:meetId/edit/:blockId", requireMode(["director"]), (req, res) => {
  const { meet, block } = findMeetAndBlock(req.params.meetId, req.params.blockId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!block) return res.status(404).send("Block not found");

  const divisionOptions = (meet.groups || []).flatMap(g => {
    return Object.keys(g.divisions).map(k => ({
      value: `division::${g.id}::${k}`,
      label: `${g.label} – ${k.toUpperCase()}`
    }));
  });

  const skateAbilityOptions = (meet.skateAbilityBoxes || []).map(b => ({
    value: `division::skateability::${b.id}::single`,
    label: `${b.label} (${b.agesLabel})`
  }));

  const customOptions = (meet.customRaces || []).map(r => ({
    value: `custom::${r.id}`,
    label: `[Custom] ${r.name} ${r.raceType === "time_trial" ? "(Time Trial)" : ""}`
  }));

  const options = [...divisionOptions, ...skateAbilityOptions, ...customOptions]
    .map(o => `<option value="${safeText(o.value)}">${safeText(o.label)}</option>`)
    .join("");

  const items = block.items || [];
  const itemsHtml = items.map((it, idx) => {
    let label = "Unknown";
    if (it.type === "division") label = labelFor(meet, it.groupId, it.divisionKey);
    if (it.type === "custom") {
      const cr = findCustomRace(meet, it.customRaceId);
      label = cr ? `[Custom] ${cr.name}` : `[Custom] #${it.customRaceId}`;
    }

    return `
      <div class="section" style="margin:10px 0;">
        <div class="row" style="justify-content:space-between;">
          <div><b>${safeText(label)}</b></div>
          <div class="row">
            <form method="POST" action="/admin/blocks/${meet.id}/item/moveup/${block.id}/${idx}">
              <button class="btn ghost" type="submit">↑</button>
            </form>
            <form method="POST" action="/admin/blocks/${meet.id}/item/movedown/${block.id}/${idx}">
              <button class="btn ghost" type="submit">↓</button>
            </form>
            <form method="POST" action="/admin/blocks/${meet.id}/item/delete/${block.id}/${idx}">
              <button class="btn danger" type="submit">Remove</button>
            </form>
          </div>
        </div>
      </div>
    `;
  }).join("") || `<div class="section"><p><i>No items in this block yet.</i></p></div>`;

  res.send(pageShell({
    title: `Edit Block #${block.id}`,
    user: req.user,
    bodyHtml: `
      <h1>Edit Block Contents</h1>
      <div class="section">
        <h2>${safeText(block.day)} • ${safeText(block.name)} <span class="tag">Block #${block.id}</span></h2>
        <div class="row">
          <a class="btn ghost" href="/admin/blocks/${meet.id}">Back to Blocks</a>
          <a class="btn ghost" href="/admin/custom-races/${meet.id}">Custom Races</a>
          <a class="btn ghost" href="/admin/meet/${meet.id}">Meet Builder</a>
          <a class="btn ghost" href="/live/${meet.id}">Live</a>
        </div>
        <small class="hint">Order here directly controls race order preview.</small>
      </div>

      <div class="section">
        <h3>Add an Item</h3>
        <form method="POST" action="/admin/blocks/${meet.id}/item/add/${block.id}">
          <select name="item" required>
            <option value="">Select division / SkateAbility / custom race…</option>
            ${options}
          </select>
          <button class="btn" type="submit">Add</button>
        </form>
      </div>

      <h2>Items in This Block (Ordered)</h2>
      ${itemsHtml}
    `
  }));
});

app.post("/admin/blocks/:meetId/item/add/:blockId", requireMode(["director"]), (req, res) => {
  const { meet, block } = findMeetAndBlock(req.params.meetId, req.params.blockId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!block) return res.status(404).send("Block not found");

  const raw = String(req.body.item || "");
  const parts = raw.split("::");

  block.items = block.items || [];

  if (parts[0] === "division") {
    // age division: division::<groupId>::<divisionKey>
    // skateability: division::skateability::<boxId>::single
    if (parts[1] === "skateability" && parts.length === 4) {
      const boxId = Number(parts[2]);
      block.items.push({ type: "division", groupId: `skateability::${boxId}`, divisionKey: "single" });
    } else if (parts.length === 3) {
      const groupId = parts[1];
      const divisionKey = parts[2];
      block.items.push({ type: "division", groupId, divisionKey });
    }
  } else if (parts[0] === "custom" && parts.length === 2) {
    const customRaceId = Number(parts[1]);
    block.items.push({ type: "custom", customRaceId });
  }

  meet.updatedAt = nowIso();
  generateRaceOrderStrict(meet);
  saveDb();

  res.redirect(`/admin/blocks/${meet.id}/edit/${block.id}`);
});

app.post("/admin/blocks/:meetId/item/moveup/:blockId/:idx", requireMode(["director"]), (req, res) => {
  const { meet, block } = findMeetAndBlock(req.params.meetId, req.params.blockId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!block) return res.status(404).send("Block not found");

  const idx = Number(req.params.idx);
  block.items = block.items || [];
  if (idx > 0 && idx < block.items.length) {
    swap(block.items, idx, idx - 1);
    meet.updatedAt = nowIso();
    generateRaceOrderStrict(meet);
    saveDb();
  }
  res.redirect(`/admin/blocks/${meet.id}/edit/${block.id}`);
});

app.post("/admin/blocks/:meetId/item/movedown/:blockId/:idx", requireMode(["director"]), (req, res) => {
  const { meet, block } = findMeetAndBlock(req.params.meetId, req.params.blockId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!block) return res.status(404).send("Block not found");

  const idx = Number(req.params.idx);
  block.items = block.items || [];
  if (idx >= 0 && idx < block.items.length - 1) {
    swap(block.items, idx, idx + 1);
    meet.updatedAt = nowIso();
    generateRaceOrderStrict(meet);
    saveDb();
  }
  res.redirect(`/admin/blocks/${meet.id}/edit/${block.id}`);
});

app.post("/admin/blocks/:meetId/item/delete/:blockId/:idx", requireMode(["director"]), (req, res) => {
  const { meet, block } = findMeetAndBlock(req.params.meetId, req.params.blockId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!block) return res.status(404).send("Block not found");

  const idx = Number(req.params.idx);
  block.items = block.items || [];
  if (idx >= 0 && idx < block.items.length) {
    block.items.splice(idx, 1);
    meet.updatedAt = nowIso();
    generateRaceOrderStrict(meet);
    saveDb();
  }
  res.redirect(`/admin/blocks/${meet.id}/edit/${block.id}`);
});

// ============================================================
// JUDGE PANEL (stub v1) — list meets + TT entry hooks
// ============================================================

app.get("/judge", requireMode(["judge"]), (req, res) => {
  const cards =
    db.meets
      .slice()
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .map(m => `
        <div class="section">
          <h3>${safeText(m.meetName)} <span class="tag">Meet #${m.id}</span></h3>
          <p><b>Date:</b> ${safeText(m.date || "TBD")} • <b>Races:</b> ${(m.races || []).length}</p>
          <a class="btn" href="/judge/${m.id}">Open Judge Panel</a>
        </div>
      `).join("") || `<div class="section"><p>No meets yet.</p></div>`;

  res.send(pageShell({ title: "Judge Panel", user: req.user, bodyHtml: `<h1>Judge Panel</h1><div class="grid">${cards}</div>` }));
});

app.get("/judge/:meetId", requireMode(["judge"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  generateRaceOrderStrict(meet);

  const rows = (meet.races || []).slice(0, 150).map(r => `
    <tr>
      <td class="mono">#${safeText(String(r.seq))}</td>
      <td>${safeText(r.day)}</td>
      <td>${safeText(r.blockName)}</td>
      <td>${safeText(r.label)}</td>
      <td class="mono">${safeText(r.distance || "")}</td>
      <td>${r.raceType === "time_trial" ? `<span class="tag">TT</span>` : `<span class="tag">Normal</span>`}</td>
      <td><a class="btn ghost" href="/judge/${meet.id}/race/${r.id}">Open</a></td>
    </tr>
  `).join("");

  res.send(pageShell({
    title: `Judge – Meet #${meet.id}`,
    user: req.user,
    bodyHtml: `
      <h1>Judge Panel • Meet #${meet.id}</h1>
      <div class="section">
        <p><b>${safeText(meet.meetName)}</b></p>
        <div class="row">
          <a class="btn ghost" href="/portal">Back to Portal</a>
          <a class="btn ghost" href="/live/${meet.id}">Live</a>
        </div>
      </div>

      <div class="section">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="text-align:left; border-bottom:1px solid #eee;">
              <th>Seq</th><th>Day</th><th>Block</th><th>Race</th><th>Dist</th><th>Type</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <small class="hint">Normal race scoring UI later. Time Trial entry lives here first.</small>
      </div>
    `
  }));
});

app.get("/judge/:meetId/race/:raceId", requireMode(["judge"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const race = (meet.races || []).find(r => r.id == req.params.raceId);
  if (!race) return res.status(404).send("Race not found");

  const existing = meet.results?.[race.id]?.data?.rows || [];

  const rowsHtml = existing.map((x, i) => `
    <tr>
      <td>${safeText(x.checkIn || "")}</td>
      <td>${safeText(x.name || "")}</td>
      <td class="mono">${safeText(x.time || "")}</td>
      <td><button class="btn danger" type="submit" name="deleteIdx" value="${i}">Remove</button></td>
    </tr>
  `).join("");

  res.send(pageShell({
    title: `Judge Race #${race.seq}`,
    user: req.user,
    bodyHtml: `
      <h1>Race #${safeText(String(race.seq))} ${race.raceType === "time_trial" ? `<span class="tag">TIME TRIAL</span>` : ""}</h1>
      <div class="section">
        <p><b>${safeText(race.label)}</b><br>
           <b>Distance:</b> ${safeText(race.distance || "")}<br>
           <b>Block:</b> ${safeText(race.blockName)} • <b>${safeText(race.day)}</b></p>
        <div class="row">
          <a class="btn ghost" href="/judge/${meet.id}">Back</a>
          <a class="btn ghost" href="/live/${meet.id}">Live</a>
        </div>
      </div>

      <div class="section">
        <h3>Enter Result (v1)</h3>

        <form method="POST" action="/judge/${meet.id}/race/${race.id}/save">
          ${race.raceType === "time_trial" ? `
            <div class="row">
              <div><div>Check-In #</div><input name="checkIn" placeholder="001"></div>
              <div><div>Name</div><input name="name" placeholder="Skater name"></div>
              <div><div>Time</div><input name="time" placeholder="00:19.542"></div>
            </div>
            <button class="btn good" type="submit" name="action" value="add">Add Time</button>
          ` : `
            <p><i>Normal race scoring UI will go here (lanes/places).</i></p>
          `}
          <hr>
          <button class="btn" type="submit" name="action" value="finish">Save Race (publishes to Live)</button>
        </form>

        <hr>
        <h3>Current Entries</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="text-align:left; border-bottom:1px solid #eee;">
              <th>Check-In</th><th>Name</th><th>Time</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="4"><i>No entries yet.</i></td></tr>`}
          </tbody>
        </table>
      </div>
    `
  }));
});

app.post("/judge/:meetId/race/:raceId/save", requireMode(["judge"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const race = (meet.races || []).find(r => r.id == req.params.raceId);
  if (!race) return res.status(404).send("Race not found");

  meet.results = meet.results || {};
  const existing = meet.results[race.id]?.data?.rows || [];
  const action = (req.body.action || "").trim();

  if (action === "add") {
    existing.push({
      checkIn: (req.body.checkIn || "").trim(),
      name: (req.body.name || "").trim(),
      time: (req.body.time || "").trim()
    });
    meet.results[race.id] = { savedAt: nowIso(), type: race.raceType, data: { rows: existing }, status: "in_progress" };
  }

  if (action === "finish") {
    meet.results[race.id] = meet.results[race.id] || { savedAt: nowIso(), type: race.raceType, data: { rows: existing } };
    meet.results[race.id].status = "completed";
    meet.results[race.id].savedAt = nowIso();
    race.status = "completed";
  }

  meet.updatedAt = nowIso();
  saveDb();
  res.redirect(`/judge/${meet.id}/race/${race.id}`);
});

// ============================================================
// COACH DASHBOARD (v1 stub)
// ============================================================

app.get("/coach", requireMode(["coach"]), (req, res) => {
  res.send(pageShell({
    title: "Coach Dashboard",
    user: req.user,
    bodyHtml: `
      <h1>Coach Dashboard (v1 stub)</h1>
      <div class="section">
        <p>This is where roster + bulk registration will live.</p>
        <ul>
          <li>Store skaters as: name, gender, USARS # (no birthdays stored)</li>
          <li>Bulk register per-meet with “age as of meet date”</li>
          <li>Director approves pending bulk registrations</li>
        </ul>
        <small class="hint">We’ll build this next once judge + live loop is locked.</small>
      </div>
    `
  }));
});

// ============================================================
// LIVE PAGES
// ============================================================

app.get("/live", (req, res) => {
  const s = getSession(req);
  const cards =
    db.meets
      .slice()
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .map(m => `
        <div class="section">
          <h3>${safeText(m.meetName)} <span class="tag">Meet #${m.id}</span></h3>
          <p><b>Date:</b> ${safeText(m.date || "TBD")} • <b>Blocks:</b> ${(m.blocks || []).length} • <b>Regs:</b> ${m.registrations.length} • <b>Races:</b> ${(m.races || []).length}</p>
          <a class="btn" href="/live/${m.id}">Open Live</a>
        </div>
      `).join("") || `<div class="section"><p>No meets yet.</p></div>`;

  res.send(pageShell({ title: "Live Race Day", user: s, bodyHtml: `<h1>Live Race Day</h1><div class="grid">${cards}</div>` }));
});

app.get("/live/:meetId", (req, res) => {
  const s = getSession(req);
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  generateRaceOrderStrict(meet);

  const schedule = meet.generatedSchedule || null;

  const scheduleHtml = schedule
    ? Object.keys(schedule).sort((a, b) => dayRank(a) - dayRank(b))
      .map(day => {
        const d = schedule[day];
        const rows = (d.timeline || []).map(x => `<li><b>${safeText(x.start)}–${safeText(x.end)}</b> — ${safeText(x.label)}</li>`).join("");
        return `<div class="section"><h2>${safeText(day)} <span class="tag">Start ${safeText(d.startTime)}</span></h2><ul>${rows}</ul></div>`;
      }).join("")
    : `<div class="section"><p><i>No schedule generated yet.</i> Director: “Complete Registration + Generate Schedule”.</p></div>`;

  const races = (meet.races || []).slice().sort((a, b) =>
    dayRank(a.day) - dayRank(b.day) ||
    a.blockOrder - b.blockOrder ||
    a.seq - b.seq
  );

  const raceRows = races.slice(0, 120).map(r => {
    const result = meet.results?.[r.id] || null;
    const badge = r.raceType === "time_trial" ? `<span class="tag">TT</span>` : ``;
    const status = (result?.status === "completed" || r.status === "completed")
      ? `<span class="tag" style="border-color:#16a34a;color:#16a34a;">COMPLETED</span>`
      : `<span class="tag">PENDING</span>`;

    return `
      <tr>
        <td class="mono">#${safeText(String(r.seq))}</td>
        <td>${safeText(r.day)}</td>
        <td>${safeText(r.blockName)}</td>
        <td>${safeText(r.label)} ${badge}</td>
        <td class="mono">${safeText(r.distance || "")}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join("");

  const regsPreview = meet.registrations
    .slice()
    .sort((a, b) => a.checkInNumber - b.checkInNumber)
    .slice(0, 30)
    .map(r => {
      const g = (meet.groups || []).find(x => x.id === r.groupId);
      const div = g ? g.label : r.groupId;
      return `<li>#${fmtCheckIn(r.checkInNumber)} — ${safeText(r.firstName)} ${safeText(r.lastName)} (${safeText(r.team)}) • ${safeText(div)} • ${safeText((r.classes||[]).map(x=>x.toUpperCase()).join(","))}${r.challengeUp ? " • Challenge Up" : ""}</li>`;
    })
    .join("");

  res.send(pageShell({
    title: `Live – Meet #${meet.id}`,
    user: s,
    bodyHtml: `
      <h1>Live View</h1>

      <div class="section">
        <h2>${safeText(meet.meetName)} <span class="tag">Meet #${meet.id}</span></h2>
        <p>
          <b>Date:</b> ${safeText(meet.date || "TBD")} •
          <b>Track:</b> ${safeText(String(meet.trackLength))}m •
          <b>Lanes:</b> ${safeText(String(meet.lanes))} •
          <b>Regs:</b> ${meet.registrations.length} •
          <b>Blocks:</b> ${(meet.blocks || []).length} •
          <b>Races:</b> ${(meet.races || []).length}
          ${meet.registrationOpen ? `<span class="tag">Reg OPEN</span>` : `<span class="tag" style="border-color:#dc3545;color:#dc3545;">Reg CLOSED</span>`}
        </p>

        <div class="row">
          <a class="btn ghost" href="/register/${meet.id}">Registration</a>
          ${s?.activeRole === "director" ? `<a class="btn ghost" href="/admin/blocks/${meet.id}">Block Builder</a>` : ""}
          ${s?.activeRole === "director" ? `<a class="btn ghost" href="/admin/custom-races/${meet.id}">Custom Races</a>` : ""}
          ${s?.activeRole === "director" ? `<a class="btn ghost" href="/admin/meet/${meet.id}">Meet Builder</a>` : ""}
        </div>

        <small class="hint">
          Race order is generated strictly from blocks + item order + distances.
        </small>
      </div>

      <h2>Schedule (Estimated)</h2>
      ${scheduleHtml}

      <h2>Race Order (first 120)</h2>
      <div class="section">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="text-align:left; border-bottom:1px solid #eee;">
              <th>Seq</th><th>Day</th><th>Block</th><th>Race</th><th>Distance</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${raceRows || `<tr><td colspan="6"><i>No races yet. Build blocks + distances in Meet Builder.</i></td></tr>`}
          </tbody>
        </table>
        ${races.length > 120 ? `<p><small class="hint">Showing 120 of ${races.length} races.</small></p>` : ``}
      </div>

      <h2>Registrations (preview)</h2>
      <div class="section">
        <p><b>Total:</b> ${meet.registrations.length}</p>
        <ul>${regsPreview || "<li><i>No registrations yet.</i></li>"}</ul>
      </div>
    `
  }));
});

// ============================================================
// (Simple) Rinks pages (unchanged minimal stubs)
// ============================================================

app.get("/rinks", (req, res) => {
  const s = getSession(req);
  const cards = (db.rinks || []).map(r => `
    <div class="section">
      <h3>${safeText(r.name)}</h3>
      <p>${safeText(r.city)}, ${safeText(r.state)} • Team: ${safeText(r.team || "—")}</p>
    </div>
  `).join("") || `<div class="section"><p>No rinks yet.</p></div>`;

  res.send(pageShell({ title: "Find a Rink", user: s, bodyHtml: `<h1>Rinks</h1><div class="grid">${cards}</div>` }));
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, HOST, () => {
  console.log(`
==========================================
SpeedSkateMeet – CLEAN REBUILD v6
Data: ${DATA_FILE}

Adult ages locked:
- Classic: 25–34
- Masters: 35–44

Login page:
- No passwords displayed

Time Trials:
- Custom races only (raceType=time_trial)

SkateAbility:
- Multiple boxes, manual age label, no novice/elite/open

Local:  http://localhost:${PORT}
LAN:    http://<your-ip>:${PORT}
==========================================
  `.trim());
});