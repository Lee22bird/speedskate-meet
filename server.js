// ============================================================
// SpeedSkateMeet – CLEAN REBUILD v6 – March 2, 2026
// Node.js + Express • single-file server.js • JSON persistence
//
// FIXES / CHANGES IN v6:
// ✅ /login shows demo usernames only (NO passwords shown anywhere)
// ✅ Safari/iOS dropdown offset fixed via anchored custom suggestions UI
// ✅ Meet Builder headings: "Primary Girls" (no extra suffix)
// ✅ Startup DB migration:
//    - Rebuild old split groups (primary_girls_novice style) into unified group model
//    - Locks Classic/Masters ages correctly
// ✅ SkateAbility rebuilt:
//    - No novice/elite/open
//    - Manual age
//    - Can add multiple SkateAbility boxes
// ✅ Time Trials are Custom Races only (no TT Open/Novice/Elite divisions)
// ✅ Challenge Up is ONLY a registration checkbox (no meet builder clutter)
// ✅ Novice + Elite combo removed (checking both = both divisions)
// ✅ Rinks: adds Roller City Wichita entry (per your screenshot)
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

function buildMeetGroups() {
  return ALL_DIVISIONS.map(div => ({
    id: div.id,
    label: div.label,
    ages: div.ages,
    divisions: {
      novice: { enabled: false, cost: 0, distances: ["", "", "", ""] },
      elite: { enabled: false, cost: 0, distances: ["", "", "", ""] },
      open: { enabled: false, cost: 0, distances: ["", "", "", ""] }
    }
  }));
}

// ============================================================
// SKATEABILITY MODEL (SPECIAL)
// ============================================================

function defaultSkateAbilityBox() {
  return {
    id: crypto.randomBytes(6).toString("hex"),
    label: "SkateAbility",
    enabled: true,
    cost: 0,
    manualAge: "",               // manual age input (string)
    distances: ["", "", "", ""]  // distance slots
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
      // Your requested Roller City default entry:
      {
        id: 1,
        name: "Roller City",
        city: "Wichita",
        state: "KS",
        team: "Independent",
        address: "3234 S. Meridian Ave, Wichita, KS 67217",
        phone: "316-942-4555",
        website: "rollercitywichitaks.com",
        notes: ""
      }
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
function nextCustomRaceId(meet) {
  return meet.customRaces?.length ? Math.max(...meet.customRaces.map(r => r.id)) + 1 : 1;
}
function nextBlockId(meet) {
  return meet.blocks?.length ? Math.max(...meet.blocks.map(b => b.id)) + 1 : 1;
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

    groups: buildMeetGroups(),

    // ✅ SkateAbility boxes (multiple)
    skateAbility: [defaultSkateAbilityBox()],

    // ✅ Time trials via custom races only
    customRaces: [],

    blocks: [],
    races: [],
    raceOrderGeneratedAt: null,
    results: {},

    registrations: [],
    nextCheckInNumber: 1,

    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

// ============================================================
// 🔧 MIGRATIONS
// ============================================================

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

// rebuild old “split group” ids like primary_girls_novice into primary_girls with divisions
function migrateSplitGroupModel(meet) {
  if (!meet || !Array.isArray(meet.groups)) return false;

  const known = new Set(ALL_DIVISIONS.map(d => d.id));
  const isSplit = (id) => /_(novice|elite|open)$/.test(id);

  let changed = false;

  // If already using clean model, skip
  const hasAnySplit = meet.groups.some(g => isSplit(g.id) && !known.has(g.id));
  if (!hasAnySplit) return false;

  // Create a clean baseline
  const cleanGroups = buildMeetGroups();

  // Helper: map split to base + div key
  const splitToBase = (id) => {
    const m = id.match(/^(.*)_(novice|elite|open)$/);
    if (!m) return null;
    return { baseId: m[1], divKey: m[2] };
  };

  for (const g of meet.groups) {
    const info = splitToBase(g.id);
    if (!info) continue;

    const base = cleanGroups.find(x => x.id === info.baseId);
    if (!base) continue;

    // carry over enabled/cost/distances from old split group if present
    const oldDiv = g.divisions?.[info.divKey];
    // old split groups sometimes stored distances directly; try to keep what exists
    if (oldDiv) {
      base.divisions[info.divKey] = {
        enabled: !!oldDiv.enabled,
        cost: Number(oldDiv.cost || 0),
        distances: Array.isArray(oldDiv.distances) ? oldDiv.distances.slice(0, 4) : ["", "", "", ""]
      };
    } else {
      // fallback if split group had distances at top-level
      const dists = Array.isArray(g.distances) ? g.distances.slice(0, 4) : ["", "", "", ""];
      base.divisions[info.divKey].distances = dists;
      base.divisions[info.divKey].enabled = true;
    }
    changed = true;
  }

  if (changed) {
    meet.groups = cleanGroups;
  }
  return changed;
}

function migrateSkateAbility(meet) {
  if (!meet) return false;
  let changed = false;

  // if it was missing
  if (!Array.isArray(meet.skateAbility)) {
    meet.skateAbility = [defaultSkateAbilityBox()];
    changed = true;
  }

  // ensure fields
  meet.skateAbility.forEach(box => {
    if (!box.id) { box.id = crypto.randomBytes(6).toString("hex"); changed = true; }
    if (!("manualAge" in box)) { box.manualAge = ""; changed = true; }
    if (!Array.isArray(box.distances)) { box.distances = ["", "", "", ""]; changed = true; }
    if (!("cost" in box)) { box.cost = 0; changed = true; }
    if (!("enabled" in box)) { box.enabled = true; changed = true; }
    if (!box.label) { box.label = "SkateAbility"; changed = true; }
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
    const a = migrateMeetAdultAges(meet);
    const b = migrateSplitGroupModel(meet);
    const c = migrateSkateAbility(meet);
    if (a || b || c) {
      meet.updatedAt = nowIso();
      changed = true;
    }
  }

  if (changed) {
    saveDb();
    console.log("✅ DB migration applied.");
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

// NOTE: These are real demo users for dev only.
// ✅ /login will NOT display passwords.
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
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin:20px; background:#f8f9fa; line-height:1.6; }
  h1, h2, h3 { color:#222; }
  .btn { padding:10px 16px; background:#2563eb; color:white; border:none; border-radius:12px; cursor:pointer; margin:4px; display:inline-block; text-decoration:none; }
  .btn.ghost { background:transparent; border:1px solid #2563eb; color:#2563eb; }
  .btn.danger { background:#dc3545; border:1px solid #dc3545; }
  .btn.good { background:#16a34a; border:1px solid #16a34a; }
  .section { background:white; padding:16px; border-radius:16px; box-shadow:0 2px 12px rgba(0,0,0,0.08); margin:16px 0; }
  .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:16px; }
  input, select, textarea { padding:10px; border-radius:12px; border:1px solid #ccc; width: min(520px, 95%); }
  .row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
  small.hint { color:#666; }
  .tag { display:inline-block; padding:2px 10px; border:1px solid #ddd; border-radius:999px; font-size:12px; margin-left:8px; color:#444; background:#fff; }
  hr { border:none; border-top:1px solid #e7e7e7; margin:16px 0; }
  ul { margin-top:8px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .card { border:1px solid #e8e8e8; border-radius:18px; padding:16px; }
  .pill { display:inline-block; padding:4px 12px; border-radius:999px; font-size:12px; background:#f1f3f5; }
  .soft { background:#f8fafc; border:1px solid #e5e7eb; border-radius:16px; padding:12px; }
  .anchorWrap { position:relative; display:inline-block; width:min(520px,95%); }
  .suggestBox { position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,0.12); margin-top:6px; z-index:9999; max-height:240px; overflow:auto; display:none; }
  .suggestItem { padding:10px 12px; cursor:pointer; }
  .suggestItem:hover { background:#f1f5f9; }
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
// DISTANCE SUGGESTIONS (anchored suggestions dropdown)
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

function anchoredSuggestScript() {
  // Finds inputs with data-suggest="dist" and attaches anchored suggestion dropdown.
  return `
(function(){
  function attach(input){
    if(!input || input.__ssmAttached) return;
    input.__ssmAttached = true;

    const wrap = document.createElement('div');
    wrap.className = 'anchorWrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const box = document.createElement('div');
    box.className = 'suggestBox';
    wrap.appendChild(box);

    const all = (input.getAttribute('data-suggest-list') || '').split('|').filter(Boolean);

    function render(filter){
      box.innerHTML = '';
      const f = (filter||'').toLowerCase();
      const items = all.filter(x => x.toLowerCase().includes(f)).slice(0, 40);
      if(!items.length){ box.style.display='none'; return; }
      items.forEach(val=>{
        const div = document.createElement('div');
        div.className='suggestItem';
        div.textContent = val;
        div.addEventListener('mousedown', function(e){
          e.preventDefault();
          input.value = val;
          box.style.display='none';
          input.dispatchEvent(new Event('change', {bubbles:true}));
        });
        box.appendChild(div);
      });
      box.style.display='block';
    }

    input.addEventListener('focus', ()=>render(input.value));
    input.addEventListener('input', ()=>render(input.value));
    input.addEventListener('blur', ()=>setTimeout(()=>box.style.display='none', 150));
    document.addEventListener('scroll', ()=>{ box.style.display='none'; }, true);
  }

  function scan(){
    document.querySelectorAll('input[data-suggest="dist"]').forEach(attach);
  }
  scan();
  const obs = new MutationObserver(scan);
  obs.observe(document.body, {childList:true, subtree:true});
})();
`;
}

// ============================================================
// RACE ORDER GENERATION (STRICT BY BLOCKS + CUSTOM RACES)
// ============================================================

function getDistanceList(meet, groupId, divisionKey) {
  const g = meet.groups.find(x => x.id === groupId);
  if (!g) return [];
  const d = g.divisions?.[divisionKey];
  if (!d) return [];
  return (d.distances || []).map(s => String(s || "").trim()).filter(Boolean);
}

function labelFor(meet, groupId) {
  const g = meet.groups.find(x => x.id === groupId);
  return g ? g.label : groupId;
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
            label: `${labelFor(meet, it.groupId)} – ${String(it.divisionKey).toUpperCase()}`,
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
          raceType: cr.raceType || "normal", // includes time_trial
          sourceType: "custom",
          customRaceId: cr.id,
          distanceIndex: 0,
          distance: dist,
          label: cr.name || `Custom Race #${cr.id}`,
          status: "pending"
        });
        seq++;
      } else if (it.type === "skateability") {
        // SkateAbility items could optionally be placed in blocks later;
        // for now, we do NOT auto-generate races from skateability here
        // because meets vary heavily. This is a placeholder.
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
  const demoUsernames = users.map(u => `<li><span class="mono">${safeText(u.username)}</span></li>`).join("");

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
            <b>Demo Usernames:</b>
            <ul>${demoUsernames}</ul>
            <div class="soft"><b>Security:</b> Passwords are never displayed on-screen.</div>
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
// MEETS – PUBLIC LIST + REGISTER
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

  // Division selection UI:
  // ✅ No "novice & elite combo" option.
  // ✅ If they check novice+elite, they will be placed in BOTH.
  const divisionBlocks = meet.groups.map(g => {
    const d = g.divisions || {};
    return `
      <div class="soft" style="margin:10px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <b>${safeText(g.label)}</b> <span class="tag">${safeText(g.ages)}</span>
        </div>
        <div class="row" style="margin-top:10px;">
          <label><input type="checkbox" name="div_${g.id}_novice"> Novice</label>
          <label><input type="checkbox" name="div_${g.id}_elite"> Elite</label>
          <label><input type="checkbox" name="div_${g.id}_open"> Open</label>
        </div>
        <small class="hint">Check one, or multiple (example: Novice + Elite = both).</small>
      </div>
    `;
  }).join("");

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

          <div style="margin-top:10px;">
            <label style="display:flex; gap:8px; align-items:center;">
              <input type="checkbox" name="challengeUp">
              Challenge Up (auto bumped per USARS rule)
            </label>
            <small class="hint">This does not add meet-builder clutter. It’s a registration flag.</small>
          </div>

          <hr>
          <h3>Select Divisions</h3>
          ${divisionBlocks}

          <div style="margin-top:14px;">
            <button class="btn" type="submit">Register</button>
            <a class="btn ghost" href="/meets">Back</a>
          </div>
          <small class="hint">No payments in-app yet. This assigns your check-in / skater number.</small>
        </form>
        ` : `
          <p><b>This meet is no longer accepting registrations.</b></p>
          <a class="btn" href="/meets">Back to Meets</a>
        `}
      </div>
    `
  }));
});

function parseDivisionSelectionsFromBody(meet, body) {
  const selections = [];
  for (const g of (meet.groups || [])) {
    for (const k of ["novice", "elite", "open"]) {
      const key = `div_${g.id}_${k}`;
      if (body[key] === "on") {
        selections.push({ groupId: g.id, divisionKey: k });
      }
    }
  }
  return selections;
}

app.post("/register/:meetId/submit", (req, res) => {
  const s = getSession(req);
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");
  if (!meet.registrationOpen) return res.status(403).send("Registration closed");

  const firstName = (req.body.firstName || "").trim();
  const lastName = (req.body.lastName || "").trim();
  const team = (req.body.team || "").trim();
  const usarsNumber = (req.body.usarsNumber || "").trim();
  const challengeUp = req.body.challengeUp === "on";

  if (!firstName || !lastName || !team) return res.status(400).send("Missing fields");
  if (meet.requireUsarsNumber && !usarsNumber) return res.status(400).send("USARS number required");

  const divisionsSelected = parseDivisionSelectionsFromBody(meet, req.body);
  if (!divisionsSelected.length) return res.status(400).send("Please select at least one division.");

  const checkInNumber = meet.nextCheckInNumber++;
  meet.registrations.push({
    checkInNumber,
    firstName,
    lastName,
    team,
    usarsNumber,
    challengeUp,
    divisionsSelected,
    timestamp: nowIso()
  });
  meet.updatedAt = nowIso();

  generateRaceOrderStrict(meet);
  saveDb();

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
           <b>Challenge Up:</b> ${challengeUp ? "Yes" : "No"}</p>
        <p><b>Divisions:</b> ${safeText(divisionsSelected.map(x => `${labelFor(meet, x.groupId)} (${x.divisionKey.toUpperCase()})`).join(" • "))}</p>
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

function distListString(trackLength) {
  return buildDistanceSuggestions(trackLength).map(x => x.replace(/\|/g, "/")).join("|");
}

function buildDistInput(name, value, suggestList) {
  // anchored suggestions input (fixes Safari dropdown offset)
  return `
    <input data-suggest="dist" data-suggest-list="${safeText(suggestList)}" name="${safeText(name)}" value="${safeText(value || "")}" style="width:180px;">
  `;
}

app.get("/admin/meet/:id", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.id);
  if (!meet) return res.status(404).send("Meet not found");

  if (migrateMeetAdultAges(meet)) saveDb();
  migrateSkateAbility(meet);

  const suggestList = distListString(meet.trackLength);

  const groupsHtml = meet.groups.map(g => {
    const entries = Object.entries(g.divisions).map(([k, d]) => `
      <div style="border:1px solid #e6e6e6; padding:10px; border-radius:16px; margin:10px 0;">
        <div class="row" style="justify-content:space-between;">
          <label style="display:flex; gap:8px; align-items:center;">
            <input type="checkbox" name="${g.id}.${k}.enabled" ${d.enabled ? "checked" : ""}>
            <b>${safeText(k.toUpperCase())}</b>
          </label>
          <div>Cost: <input name="${g.id}.${k}.cost" value="${safeText(String(d.cost ?? 0))}" style="width:110px;"></div>
        </div>
        <div class="row" style="margin-top:8px;">
          ${(d.distances || []).map((v, i) =>
            `D${i + 1}: ${buildDistInput(`${g.id}.${k}.d${i}`, v, suggestList)}`
          ).join(" ")}
        </div>
        <small class="hint">Pick a suggested distance or type your own.</small>
      </div>
    `).join("");

    return `
      <div class="section">
        <h3>${safeText(g.label)} <span class="tag">${safeText(g.ages)}</span></h3>
        ${entries}
      </div>
    `;
  }).join("");

  const skateHtml = (meet.skateAbility || []).map((box, idx) => {
    return `
      <div class="soft" style="margin:10px 0;">
        <div class="row" style="justify-content:space-between;">
          <div><b>SkateAbility</b> <span class="tag">Box ${idx + 1}</span></div>
          <div class="row">
            <form method="POST" action="/admin/meet/${meet.id}/skateability/remove/${box.id}">
              <button class="btn danger" type="submit">Remove</button>
            </form>
          </div>
        </div>

        <div class="row" style="margin-top:10px;">
          <label style="display:flex; gap:8px; align-items:center;">
            <input type="checkbox" name="skate.${box.id}.enabled" ${box.enabled ? "checked" : ""}>
            Enabled
          </label>

          <div>Cost: <input name="skate.${box.id}.cost" value="${safeText(String(box.cost ?? 0))}" style="width:110px;"></div>

          <div>Manual Age:
            <input name="skate.${box.id}.manualAge" value="${safeText(String(box.manualAge || ""))}" style="width:120px;" placeholder="ex: 12">
          </div>
        </div>

        <div class="row" style="margin-top:10px;">
          D1: ${buildDistInput(`skate.${box.id}.d0`, box.distances?.[0] || "", suggestList)}
          D2: ${buildDistInput(`skate.${box.id}.d1`, box.distances?.[1] || "", suggestList)}
          D3: ${buildDistInput(`skate.${box.id}.d2`, box.distances?.[2] || "", suggestList)}
          D4: ${buildDistInput(`skate.${box.id}.d3`, box.distances?.[3] || "", suggestList)}
        </div>

        <small class="hint">SkateAbility has no Novice/Elite/Open. Age is manual. Add multiple boxes if needed.</small>
      </div>
    `;
  }).join("");

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

        <small class="hint">Complete Registration locks signups, regenerates race order from blocks, and generates day timelines.</small>
      </div>

      <h2>Divisions</h2>
      ${groupsHtml}

      <h2>SkateAbility</h2>
      <div class="section">
        ${skateHtml}
        <form method="POST" action="/admin/meet/${meet.id}/skateability/add">
          <button class="btn" type="submit">Add Another SkateAbility Box</button>
        </form>
      </div>
    `,
    extraScript: anchoredSuggestScript()
  }));
});

app.post("/admin/meet/:id/skateability/add", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.id);
  if (!meet) return res.status(404).send("Meet not found");

  meet.skateAbility = meet.skateAbility || [];
  meet.skateAbility.push(defaultSkateAbilityBox());
  meet.updatedAt = nowIso();
  saveDb();
  res.redirect(`/admin/meet/${meet.id}`);
});

app.post("/admin/meet/:id/skateability/remove/:boxId", requireMode(["director"]), (req, res) => {
  const meet = findMeet(req.params.id);
  if (!meet) return res.status(404).send("Meet not found");

  meet.skateAbility = (meet.skateAbility || []).filter(b => b.id !== req.params.boxId);
  if (!meet.skateAbility.length) meet.skateAbility = [defaultSkateAbilityBox()];

  meet.updatedAt = nowIso();
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

  meet.groups.forEach(g => {
    Object.keys(g.divisions).forEach(k => {
      const d = g.divisions[k];
      d.enabled = req.body[`${g.id}.${k}.enabled`] === "on";
      d.cost = Number(req.body[`${g.id}.${k}.cost`] || 0);
      d.distances = (d.distances || ["", "", "", ""]).map((_, i) => (req.body[`${g.id}.${k}.d${i}`] || "").trim());
    });
  });

  // SkateAbility save
  meet.skateAbility = meet.skateAbility || [];
  meet.skateAbility.forEach(box => {
    box.enabled = req.body[`skate.${box.id}.enabled`] === "on";
    box.cost = Number(req.body[`skate.${box.id}.cost`] || 0);
    box.manualAge = String(req.body[`skate.${box.id}.manualAge`] || "").trim();
    box.distances = (box.distances || ["", "", "", ""]).map((_, i) => String(req.body[`skate.${box.id}.d${i}`] || "").trim());
  });

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

  const suggestList = distListString(meet.trackLength);

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
          <input data-suggest="dist" data-suggest-list="${safeText(suggestList)}" name="distance" placeholder="Pick or type: 200m / 100m (1 lap) / etc"><br><br>

          <button class="btn" type="submit">Add Custom Race</button>
        </form>
        <small class="hint">Time Trials should be created here (NOT as TT Open/Elite/Novice).</small>
      </div>

      <h2>Existing Custom Races</h2>
      ${list}
    `,
    extraScript: anchoredSuggestScript()
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
        if (it.type === "division") return `${labelFor(meet, it.groupId)} – ${String(it.divisionKey).toUpperCase()}`;
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
        <small class="hint">Blocks control the race day flow. Items can be Divisions or Custom Races.</small>
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

  const divisionOptions = meet.groups.flatMap(g => {
    return Object.keys(g.divisions).map(k => ({
      value: `division::${g.id}::${k}`,
      label: `${g.label} – ${k.toUpperCase()}`
    }));
  });

  const customOptions = (meet.customRaces || []).map(r => ({
    value: `custom::${r.id}`,
    label: `[Custom] ${r.name} ${r.raceType === "time_trial" ? "(Time Trial)" : ""}`
  }));

  const options = [...divisionOptions, ...customOptions]
    .map(o => `<option value="${safeText(o.value)}">${safeText(o.label)}</option>`)
    .join("");

  const items = block.items || [];
  const itemsHtml = items.map((it, idx) => {
    let label = "Unknown";
    if (it.type === "division") label = `${labelFor(meet, it.groupId)} – ${String(it.divisionKey).toUpperCase()}`;
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
          <a class="btn ghost" href="/live/${meet.id}">Live</a>
        </div>
        <small class="hint">Order here directly controls race order preview.</small>
      </div>

      <div class="section">
        <h3>Add an Item</h3>
        <form method="POST" action="/admin/blocks/${meet.id}/item/add/${block.id}">
          <select name="item" required>
            <option value="">Select division or custom race…</option>
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

  if (parts[0] === "division" && parts.length === 3) {
    const groupId = parts[1];
    const divisionKey = parts[2];
    block.items.push({ type: "division", groupId, divisionKey });
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
// RINKS (PUBLIC)
// ============================================================

app.get("/rinks", (req, res) => {
  const s = getSession(req);
  const cards = (db.rinks || []).slice().sort((a,b)=> (a.state||"").localeCompare(b.state||"") || (a.city||"").localeCompare(b.city||""))
    .map(r => `
      <div class="section">
        <h3>${safeText(r.name)}</h3>
        <p>
          <b>City:</b> ${safeText(r.city)}, ${safeText(r.state)}<br>
          <b>Phone:</b> ${safeText(r.phone || "—")}<br>
          <b>Address:</b> ${safeText(r.address || "—")}<br>
          <b>Website:</b> ${r.website ? `<span class="mono">${safeText(r.website)}</span>` : "—"}
        </p>
      </div>
    `).join("") || `<div class="section"><p>No rinks yet.</p></div>`;

  res.send(pageShell({
    title: "Find a Rink",
    user: s,
    bodyHtml: `<h1>Rinks</h1><div class="grid">${cards}</div>`
  }));
});

// ============================================================
// JUDGE PANEL (v1) — TT entry
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

  const rows = (meet.races || []).slice(0, 200).map(r => `
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
        <small class="hint">Time Trial entry lives here first.</small>
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
      <td>
        <form method="POST" action="/judge/${meet.id}/race/${race.id}/delete">
          <button class="btn danger" type="submit" name="idx" value="${i}">Remove</button>
        </form>
      </td>
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
            <p><i>Normal race scoring UI will go here later.</i></p>
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

app.post("/judge/:meetId/race/:raceId/delete", requireMode(["judge"]), (req, res) => {
  const meet = findMeet(req.params.meetId);
  if (!meet) return res.status(404).send("Meet not found");

  const race = (meet.races || []).find(r => r.id == req.params.raceId);
  if (!race) return res.status(404).send("Race not found");

  const idx = Number(req.body.idx);
  const existing = meet.results?.[race.id]?.data?.rows || [];
  if (!Number.isNaN(idx) && idx >= 0 && idx < existing.length) {
    existing.splice(idx, 1);
    meet.results[race.id] = meet.results[race.id] || { savedAt: nowIso(), type: race.raceType, data: { rows: [] } };
    meet.results[race.id].data.rows = existing;
    meet.results[race.id].savedAt = nowIso();
    meet.updatedAt = nowIso();
    saveDb();
  }
  res.redirect(`/judge/${meet.id}/race/${race.id}`);
});

// ============================================================
// COACH DASHBOARD (stub)
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

  const raceRows = races.slice(0, 160).map(r => {
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
    .slice(0, 40)
    .map(r => `<li>#${fmtCheckIn(r.checkInNumber)} — ${safeText(r.firstName)} ${safeText(r.lastName)} (${safeText(r.team)})</li>`)
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

        <small class="hint">Race order is generated strictly from blocks + item order + distances.</small>
      </div>

      <h2>Schedule (Estimated)</h2>
      ${scheduleHtml}

      <h2>Race Order (first 160)</h2>
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
        ${races.length > 160 ? `<p><small class="hint">Showing 160 of ${races.length} races.</small></p>` : ``}
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

Login demo usernames are shown on /login (passwords never displayed).

Local:  http://localhost:${PORT}
LAN:    http://<your-ip>:${PORT}
==========================================
  `.trim());
});