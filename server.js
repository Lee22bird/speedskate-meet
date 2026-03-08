// ============================================================
// SpeedSkateMeet v15 - FULL SINGLE FILE REBUILD
// Node.js + Express + JSON persistence
// Hosted on Render
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'ssm_db.json');

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// ------------------------------------------------------------
// BASIC MIDDLEWARE / STATIC
// ------------------------------------------------------------
app.use('/static', express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------
// DEFAULT DB
// ------------------------------------------------------------
const DEFAULT_DB = {
  meta: {
    version: 15,
    name: 'SpeedSkateMeet',
    lastUpdated: new Date().toISOString()
  },
  users: [
    {
      id: 'u_admin',
      username: 'Lbird22',
      password: 'Redline22',
      role: 'admin',
      displayName: 'Lee Bird'
    }
  ],
  rinks: [
    {
      id: 'rink_default_roller_city',
      name: 'Roller City',
      city: 'Wichita',
      state: 'KS',
      address: '',
      notes: '',
      trackType: 'Banked',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  meets: []
};

// ------------------------------------------------------------
// DB HELPERS
// ------------------------------------------------------------
function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(DEFAULT_DB));
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    if (!raw || !raw.trim()) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(DEFAULT_DB));
    }
    const parsed = JSON.parse(raw);
    return normalizeDb(parsed);
  } catch (err) {
    console.error('DB read error:', err);
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function writeDb(db) {
  db.meta = db.meta || {};
  db.meta.version = 15;
  db.meta.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function normalizeDb(db) {
  db = db || {};
  db.meta = db.meta || { version: 15, name: 'SpeedSkateMeet' };
  db.users = Array.isArray(db.users) ? db.users : JSON.parse(JSON.stringify(DEFAULT_DB.users));
  db.rinks = Array.isArray(db.rinks) && db.rinks.length ? db.rinks : JSON.parse(JSON.stringify(DEFAULT_DB.rinks));
  db.meets = Array.isArray(db.meets) ? db.meets : [];

  db.meets = db.meets.map(normalizeMeet);
  return db;
}

function normalizeMeet(meet) {
  meet = meet || {};
  meet.id = meet.id || uid('meet');
  meet.name = meet.name || '';
  meet.date = meet.date || '';
  meet.endDate = meet.endDate || '';
  meet.city = meet.city || '';
  meet.state = meet.state || '';
  meet.address = meet.address || '';
  meet.rinkId = meet.rinkId || '';
  meet.notes = meet.notes || '';
  meet.isPublic = !!meet.isPublic;
  meet.slug = meet.slug || slugify(meet.name || meet.id);
  meet.status = meet.status || 'draft';
  meet.createdAt = meet.createdAt || new Date().toISOString();
  meet.updatedAt = meet.updatedAt || new Date().toISOString();

  meet.settings = meet.settings || {};
  meet.settings.currency = meet.settings.currency || 'USD';
  meet.settings.entryFee = safeNumber(meet.settings.entryFee, 0);
  meet.settings.lateFee = safeNumber(meet.settings.lateFee, 0);
  meet.settings.otherFee = safeNumber(meet.settings.otherFee, 0);
  meet.settings.trackType = meet.settings.trackType || 'Inline';
  meet.settings.lanesPerBlock = Math.max(1, safeInt(meet.settings.lanesPerBlock, 8));
  meet.settings.autoHelmetStart = Math.max(1, safeInt(meet.settings.autoHelmetStart, 1));
  meet.settings.allowNovice = meet.settings.allowNovice !== false;
  meet.settings.allowElite = meet.settings.allowElite !== false;

  meet.divisions = normalizeDivisions(meet.divisions);
  meet.distanceConfig = normalizeDistanceConfig(meet.distanceConfig);

  meet.racers = Array.isArray(meet.racers) ? meet.racers.map(normalizeRacer) : [];
  meet.races = Array.isArray(meet.races) ? meet.races.map(normalizeRace) : [];
  meet.blocks = Array.isArray(meet.blocks) ? meet.blocks.map(normalizeBlock) : [];

  return meet;
}

function normalizeDivisions(divisions) {
  const defaults = [
    'Tiny Tot',
    'Pee Wee',
    'Elementary',
    'Junior',
    'Senior',
    'Masters'
  ];
  if (!Array.isArray(divisions) || !divisions.length) {
    return defaults.map(name => ({ name, enabled: true }));
  }

  return defaults.map(name => {
    const existing = divisions.find(d => (d.name || '').toLowerCase() === name.toLowerCase());
    return {
      name,
      enabled: existing ? !!existing.enabled : true
    };
  });
}

function normalizeDistanceConfig(distanceConfig) {
  const defaults = {
    D1: { label: 'D1', enabled: true, novice: true, elite: true },
    D2: { label: 'D2', enabled: true, novice: true, elite: true },
    D3: { label: 'D3', enabled: true, novice: true, elite: true },
    D4: { label: 'D4', enabled: true, novice: true, elite: true }
  };
  distanceConfig = distanceConfig || {};
  for (const key of ['D1', 'D2', 'D3', 'D4']) {
    const incoming = distanceConfig[key] || {};
    defaults[key] = {
      label: incoming.label || key,
      enabled: incoming.enabled !== false,
      novice: incoming.novice !== false,
      elite: incoming.elite !== false
    };
  }
  return defaults;
}

function normalizeRacer(r) {
  r = r || {};
  r.id = r.id || uid('racer');
  r.firstName = r.firstName || '';
  r.lastName = r.lastName || '';
  r.fullName = `${r.firstName || ''} ${r.lastName || ''}`.trim();
  r.gender = r.gender || '';
  r.age = safeInt(r.age, 0);
  r.birthYear = r.birthYear || '';
  r.division = r.division || '';
  r.classType = r.classType || 'Novice';
  r.team = r.team || '';
  r.state = r.state || '';
  r.helmetNumber = r.helmetNumber !== undefined && r.helmetNumber !== null ? String(r.helmetNumber) : '';
  r.checkedIn = !!r.checkedIn;
  r.paid = !!r.paid;
  r.notes = r.notes || '';
  r.createdAt = r.createdAt || new Date().toISOString();
  r.updatedAt = r.updatedAt || new Date().toISOString();

  r.distances = r.distances || {};
  r.distances = {
    D1: !!r.distances.D1,
    D2: !!r.distances.D2,
    D3: !!r.distances.D3,
    D4: !!r.distances.D4
  };

  r.fees = r.fees || {};
  r.fees.entry = safeNumber(r.fees.entry, 0);
  r.fees.late = safeNumber(r.fees.late, 0);
  r.fees.other = safeNumber(r.fees.other, 0);

  return r;
}

function normalizeRace(race) {
  race = race || {};
  race.id = race.id || uid('race');
  race.racerId = race.racerId || '';
  race.racerName = race.racerName || '';
  race.division = race.division || '';
  race.gender = race.gender || '';
  race.classType = race.classType || 'Novice';
  race.distanceKey = race.distanceKey || 'D1';
  race.distanceLabel = race.distanceLabel || race.distanceKey;
  race.blockId = race.blockId || null;
  race.lane = race.lane !== undefined && race.lane !== null && race.lane !== '' ? safeInt(race.lane, null) : null;
  race.status = race.status || 'unassigned';
  race.createdAt = race.createdAt || new Date().toISOString();
  race.updatedAt = race.updatedAt || new Date().toISOString();
  return race;
}

function normalizeBlock(block) {
  block = block || {};
  block.id = block.id || uid('block');
  block.name = block.name || 'Block';
  block.order = safeInt(block.order, 9999);
  block.notes = block.notes || '';
  block.createdAt = block.createdAt || new Date().toISOString();
  block.updatedAt = block.updatedAt || new Date().toISOString();
  return block;
}

function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || uid('slug');
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeInt(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function money(n) {
  const value = safeNumber(n, 0);
  return `$${value.toFixed(2)}`;
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return escapeHtml(dateStr);
}

function sortByName(arr) {
  return [...arr].sort((a, b) => {
    const an = `${a.lastName || ''} ${a.firstName || ''}`.toLowerCase();
    const bn = `${b.lastName || ''} ${b.firstName || ''}`.toLowerCase();
    return an.localeCompare(bn);
  });
}

function getDivisionNames(meet) {
  return (meet.divisions || []).filter(d => d.enabled).map(d => d.name);
}

function getEnabledDistanceKeys(meet) {
  return ['D1', 'D2', 'D3', 'D4'].filter(key => meet.distanceConfig?.[key]?.enabled);
}

function getMeet(db, meetId) {
  return db.meets.find(m => m.id === meetId);
}

function getRink(db, rinkId) {
  return db.rinks.find(r => r.id === rinkId);
}

function getRacer(meet, racerId) {
  return (meet.racers || []).find(r => r.id === racerId);
}

function getBlock(meet, blockId) {
  return (meet.blocks || []).find(b => b.id === blockId);
}

function nextHelmetNumber(meet) {
  const used = (meet.racers || [])
    .map(r => safeInt(r.helmetNumber, 0))
    .filter(n => n > 0);

  const start = Math.max(1, safeInt(meet.settings?.autoHelmetStart, 1));
  if (!used.length) return String(start);
  return String(Math.max(...used) + 1);
}

function calculateRacerTotal(racer) {
  const entry = safeNumber(racer?.fees?.entry, 0);
  const late = safeNumber(racer?.fees?.late, 0);
  const other = safeNumber(racer?.fees?.other, 0);
  return entry + late + other;
}

function calculateMeetTotals(meet) {
  const totals = {
    racers: 0,
    checkedIn: 0,
    paid: 0,
    amount: 0
  };
  for (const racer of meet.racers || []) {
    totals.racers += 1;
    if (racer.checkedIn) totals.checkedIn += 1;
    if (racer.paid) totals.paid += 1;
    totals.amount += calculateRacerTotal(racer);
  }
  return totals;
}

// ------------------------------------------------------------
// RACE REBUILD LOGIC
// ------------------------------------------------------------
function rebuildMeetRaces(meet) {
  const previousRaces = Array.isArray(meet.races) ? meet.races : [];
  const previousByKey = new Map();

  for (const race of previousRaces) {
    const key = `${race.racerId}__${race.distanceKey}`;
    previousByKey.set(key, race);
  }

  const nextRaces = [];

  for (const racer of meet.racers || []) {
    for (const distanceKey of ['D1', 'D2', 'D3', 'D4']) {
      if (!racer.distances?.[distanceKey]) continue;
      if (!meet.distanceConfig?.[distanceKey]?.enabled) continue;

      const keepKey = `${racer.id}__${distanceKey}`;
      const oldRace = previousByKey.get(keepKey);

      nextRaces.push(normalizeRace({
        id: oldRace?.id || uid('race'),
        racerId: racer.id,
        racerName: `${racer.firstName} ${racer.lastName}`.trim(),
        division: racer.division,
        gender: racer.gender,
        classType: racer.classType,
        distanceKey,
        distanceLabel: meet.distanceConfig?.[distanceKey]?.label || distanceKey,
        blockId: oldRace?.blockId || null,
        lane: oldRace?.lane ?? null,
        status: oldRace?.blockId ? 'assigned' : 'unassigned',
        createdAt: oldRace?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));
    }
  }

  const validBlockIds = new Set((meet.blocks || []).map(b => b.id));

  for (const race of nextRaces) {
    if (race.blockId && !validBlockIds.has(race.blockId)) {
      race.blockId = null;
      race.lane = null;
      race.status = 'unassigned';
    }
  }

  meet.races = nextRaces;
  cleanupDuplicateLanes(meet);
}

function cleanupDuplicateLanes(meet) {
  const byBlock = new Map();
  for (const race of meet.races || []) {
    if (!race.blockId) continue;
    if (!byBlock.has(race.blockId)) byBlock.set(race.blockId, []);
    byBlock.get(race.blockId).push(race);
  }

  for (const [blockId, races] of byBlock.entries()) {
    const seen = new Set();
    for (const race of races.sort((a, b) => {
      const aa = (a.racerName || '').toLowerCase();
      const bb = (b.racerName || '').toLowerCase();
      return aa.localeCompare(bb);
    })) {
      if (race.lane == null || race.lane === '') continue;
      const lane = safeInt(race.lane, null);
      if (lane == null || lane < 1) {
        race.lane = null;
        continue;
      }
      if (seen.has(lane)) {
        race.lane = null;
      } else {
        seen.add(lane);
      }
    }
  }
}

function autoAssignLanesForBlock(meet, blockId) {
  const blockRaces = (meet.races || [])
    .filter(r => r.blockId === blockId)
    .sort((a, b) => {
      const aKey = `${a.division}|${a.classType}|${a.distanceKey}|${a.racerName}`.toLowerCase();
      const bKey = `${b.division}|${b.classType}|${b.distanceKey}|${b.racerName}`.toLowerCase();
      return aKey.localeCompare(bKey);
    });

  const maxLanes = Math.max(1, safeInt(meet.settings?.lanesPerBlock, 8));
  let lane = 1;

  for (const race of blockRaces) {
    race.lane = lane;
    race.status = 'assigned';
    race.updatedAt = new Date().toISOString();
    lane += 1;
    if (lane > maxLanes) lane = 1;
  }

  cleanupDuplicateLanes(meet);
}

function clearLanesForBlock(meet, blockId) {
  for (const race of meet.races || []) {
    if (race.blockId === blockId) {
      race.lane = null;
      race.status = 'assigned';
      race.updatedAt = new Date().toISOString();
    }
  }
}

function assignRaceToBlock(meet, raceId, blockId) {
  const race = (meet.races || []).find(r => r.id === raceId);
  const block = (meet.blocks || []).find(b => b.id === blockId);
  if (!race || !block) return false;

  race.blockId = blockId;
  race.lane = null;
  race.status = 'assigned';
  race.updatedAt = new Date().toISOString();
  return true;
}

function unassignRaceFromBlock(meet, raceId) {
  const race = (meet.races || []).find(r => r.id === raceId);
  if (!race) return false;
  race.blockId = null;
  race.lane = null;
  race.status = 'unassigned';
  race.updatedAt = new Date().toISOString();
  return true;
}

function buildFindMeetRows(db) {
  return (db.meets || [])
    .filter(m => m.isPublic)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(meet => {
      const rink = getRink(db, meet.rinkId);
      const location = [meet.city, meet.state].filter(Boolean).join(', ');
      return `
        <tr>
          <td>${escapeHtml(meet.name || 'Untitled Meet')}</td>
          <td>${fmtDate(meet.date)}</td>
          <td>${escapeHtml(location || '')}</td>
          <td>${escapeHtml(rink?.name || '')}</td>
          <td><a class="btn btn-sm" href="/find-a-meet/${encodeURIComponent(meet.id)}">Open</a></td>
        </tr>
      `;
    }).join('');
}

// ------------------------------------------------------------
// UI HELPERS
// ------------------------------------------------------------
function layout(title, body, opts = {}) {
  const message = opts.message ? `
    <div class="flash ${escapeHtml(opts.messageType || 'ok')}">
      ${escapeHtml(opts.message)}
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} - SpeedSkateMeet</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: #f5f7fb;
      color: #1f2937;
    }
    a { color: #0f4c81; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .topbar {
      background: #111827;
      color: white;
      padding: 14px 20px;
    }
    .topbar h1 {
      margin: 0;
      font-size: 22px;
    }
    .topnav {
      margin-top: 8px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .topnav a {
      color: #dbeafe;
      font-size: 14px;
      background: rgba(255,255,255,0.08);
      padding: 8px 10px;
      border-radius: 8px;
      text-decoration: none;
    }
    .container {
      max-width: 1500px;
      margin: 0 auto;
      padding: 18px;
    }
    .page-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .page-title h2 {
      margin: 0;
      font-size: 28px;
    }
    .grid {
      display: grid;
      gap: 16px;
    }
    .grid-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
    .grid-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .grid-4 { grid-template-columns: repeat(4, minmax(0,1fr)); }
    @media (max-width: 1100px) {
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    }
    .card {
      background: white;
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
      border: 1px solid #e5e7eb;
    }
    .card h3 {
      margin: 0 0 12px;
      font-size: 20px;
    }
    .muted {
      color: #6b7280;
      font-size: 13px;
    }
    .flash {
      padding: 12px 14px;
      border-radius: 10px;
      margin-bottom: 16px;
      font-weight: 700;
    }
    .flash.ok { background: #dcfce7; color: #166534; }
    .flash.err { background: #fee2e2; color: #991b1b; }
    .flash.warn { background: #fef3c7; color: #92400e; }
    form.inline { display: inline; }
    label {
      display: block;
      font-weight: 700;
      margin-bottom: 6px;
      font-size: 14px;
    }
    input[type="text"], input[type="date"], input[type="number"], select, textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      font-size: 14px;
      background: white;
    }
    textarea {
      min-height: 90px;
      resize: vertical;
    }
    .row {
      display: grid;
      grid-template-columns: repeat(12, minmax(0,1fr));
      gap: 12px;
      margin-bottom: 12px;
    }
    .col-12 { grid-column: span 12; }
    .col-9 { grid-column: span 9; }
    .col-8 { grid-column: span 8; }
    .col-6 { grid-column: span 6; }
    .col-4 { grid-column: span 4; }
    .col-3 { grid-column: span 3; }
    .col-2 { grid-column: span 2; }
    @media (max-width: 900px) {
      .col-9, .col-8, .col-6, .col-4, .col-3, .col-2 { grid-column: span 12; }
    }
    .btn {
      display: inline-block;
      padding: 10px 14px;
      border-radius: 10px;
      border: none;
      background: #111827;
      color: white;
      cursor: pointer;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
    }
    .btn:hover { opacity: 0.95; text-decoration: none; }
    .btn-secondary { background: #475569; }
    .btn-danger { background: #b91c1c; }
    .btn-green { background: #166534; }
    .btn-orange { background: #c2410c; }
    .btn-sm { padding: 7px 10px; font-size: 12px; }
    .btn-light {
      background: #e5e7eb;
      color: #111827;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
      margin-bottom: 14px;
    }
    .pill {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      font-size: 12px;
      font-weight: 700;
    }
    .pill.gray {
      background: #f3f4f6;
      border-color: #d1d5db;
      color: #374151;
    }
    .pill.green {
      background: #dcfce7;
      border-color: #bbf7d0;
      color: #166534;
    }
    .pill.red {
      background: #fee2e2;
      border-color: #fecaca;
      color: #991b1b;
    }
    .pill.orange {
      background: #ffedd5;
      border-color: #fed7aa;
      color: #9a3412;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 10px 8px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f8fafc;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #475569;
    }
    .stats {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(4, minmax(0,1fr));
      margin-bottom: 16px;
    }
    @media (max-width: 900px) {
      .stats { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 600px) {
      .stats { grid-template-columns: 1fr; }
    }
    .stat {
      background: white;
      border-radius: 14px;
      padding: 16px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    .stat .label {
      font-size: 13px;
      color: #6b7280;
      font-weight: 700;
      text-transform: uppercase;
    }
    .stat .value {
      font-size: 28px;
      margin-top: 6px;
      font-weight: 800;
    }
    .helper {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    .note {
      background: #eff6ff;
      color: #1e3a8a;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
      border: 1px solid #bfdbfe;
      margin-bottom: 12px;
    }
    .warning-note {
      background: #fff7ed;
      color: #9a3412;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
      border: 1px solid #fed7aa;
      margin-bottom: 12px;
    }
    .split {
      display: grid;
      grid-template-columns: 340px 1fr;
      gap: 16px;
    }
    @media (max-width: 1150px) {
      .split { grid-template-columns: 1fr; }
    }
    .race-card {
      border: 1px solid #dbeafe;
      background: #f8fbff;
      border-radius: 12px;
      padding: 10px;
      margin-bottom: 8px;
    }
    .block-box {
      border: 1px solid #d1d5db;
      background: #ffffff;
      border-radius: 14px;
      padding: 12px;
      margin-bottom: 14px;
    }
    .lane-box {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .lane {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: #f9fafb;
      padding: 10px;
      min-height: 90px;
    }
    .lane h4 {
      margin: 0 0 8px;
      font-size: 14px;
    }
    .check-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0,1fr));
      gap: 8px;
    }
    @media (max-width: 700px) {
      .check-grid { grid-template-columns: 1fr; }
    }
    .footer-space {
      height: 24px;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>SpeedSkateMeet</h1>
    <div class="topnav">
      <a href="/">Dashboard</a>
      <a href="/meets">Meets</a>
      <a href="/rinks">Rinks</a>
      <a href="/find-a-meet">Find a Meet</a>
    </div>
  </div>

  <div class="container">
    ${message}
    ${body}
    <div class="footer-space"></div>
  </div>
</body>
</html>
  `;
}

function meetTabs(meet, current = '') {
  const id = encodeURIComponent(meet.id);
  const tabs = [
    ['Overview', `/meets/${id}`],
    ['Meet Builder', `/meets/${id}/builder`],
    ['Registration', `/meets/${id}/registration`],
    ['Check-In', `/meets/${id}/checkin`],
    ['Block Builder', `/meets/${id}/blocks`],
    ['Race Day', `/meets/${id}/race-day`],
    ['Print Race List', `/meets/${id}/print/race-list`]
  ];

  return `
    <div class="toolbar">
      ${tabs.map(([label, href]) => {
        const active = current === label;
        return `<a class="btn ${active ? '' : 'btn-light'}" href="${href}">${escapeHtml(label)}</a>`;
      }).join('')}
    </div>
  `;
}

function parseCheckbox(body, key) {
  return body[key] === 'on' || body[key] === 'true' || body[key] === true || body[key] === '1' || body[key] === 1;
}

function redirectWithMessage(res, url, msg) {
  const sep = url.includes('?') ? '&' : '?';
  res.redirect(`${url}${sep}msg=${encodeURIComponent(msg)}`);
}

function reqMessage(req) {
  return req.query.msg ? String(req.query.msg) : '';
}// ------------------------------------------------------------
// DASHBOARD / HOME
// ------------------------------------------------------------
app.get('/', (req, res) => {
  const db = readDb();
  const meets = [...db.meets].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const totals = {
    meets: meets.length,
    rinks: db.rinks.length,
    publicMeets: meets.filter(m => m.isPublic).length,
    racers: meets.reduce((sum, m) => sum + (m.racers?.length || 0), 0)
  };

  const recentRows = meets.slice(0, 12).map(meet => {
    const rink = getRink(db, meet.rinkId);
    const loc = [meet.city, meet.state].filter(Boolean).join(', ');
    return `
      <tr>
        <td><a href="/meets/${encodeURIComponent(meet.id)}">${escapeHtml(meet.name)}</a></td>
        <td>${fmtDate(meet.date)}</td>
        <td>${escapeHtml(loc)}</td>
        <td>${escapeHtml(rink?.name || '')}</td>
        <td>${escapeHtml(meet.status || '')}</td>
      </tr>
    `;
  }).join('');

  const body = `
    <div class="page-title">
      <h2>Dashboard</h2>
      <div class="toolbar">
        <a class="btn" href="/meets/new">Create Meet</a>
        <a class="btn btn-secondary" href="/rinks">Manage Rinks</a>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="label">Meets</div><div class="value">${totals.meets}</div></div>
      <div class="stat"><div class="label">Public Meets</div><div class="value">${totals.publicMeets}</div></div>
      <div class="stat"><div class="label">Rinks</div><div class="value">${totals.rinks}</div></div>
      <div class="stat"><div class="label">Total Racers</div><div class="value">${totals.racers}</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3>Quick Start</h3>
        <div class="toolbar">
          <a class="btn" href="/meets/new">New Meet</a>
          <a class="btn btn-light" href="/find-a-meet">Find a Meet</a>
        </div>
        <p class="muted">
          Build meets, register skaters, drag races into blocks, handle check-in, assign lanes, and print race lists.
        </p>
      </div>

      <div class="card">
        <h3>Default Login</h3>
        <p class="muted">Username: <strong>Lbird22</strong><br>Password: <strong>Redline22</strong></p>
        <p class="muted">This rebuild keeps the login in the JSON data so it does not disappear.</p>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h3>Recent Meets</h3>
      <table>
        <thead>
          <tr>
            <th>Meet</th>
            <th>Date</th>
            <th>Location</th>
            <th>Rink</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${recentRows || `<tr><td colspan="5" class="muted">No meets yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  res.send(layout('Dashboard', body, { message: reqMessage(req) }));
});

// ------------------------------------------------------------
// RINK MANAGEMENT
// ------------------------------------------------------------
app.get('/rinks', (req, res) => {
  const db = readDb();
  const rows = [...db.rinks].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(rink => `
    <tr>
      <td>${escapeHtml(rink.name)}</td>
      <td>${escapeHtml(rink.city || '')}</td>
      <td>${escapeHtml(rink.state || '')}</td>
      <td>${escapeHtml(rink.trackType || '')}</td>
      <td>
        <a class="btn btn-sm" href="/rinks/${encodeURIComponent(rink.id)}/edit">Edit</a>
        <form class="inline" method="POST" action="/rinks/${encodeURIComponent(rink.id)}/delete" onsubmit="return confirm('Delete this rink?');">
          <button class="btn btn-sm btn-danger" type="submit">Delete</button>
        </form>
      </td>
    </tr>
  `).join('');

  const body = `
    <div class="page-title">
      <h2>Rinks</h2>
      <a class="btn" href="/rinks/new">Add Rink</a>
    </div>

    <div class="card">
      <h3>All Rinks</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>City</th>
            <th>State</th>
            <th>Track Type</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5" class="muted">No rinks found.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  res.send(layout('Rinks', body, { message: reqMessage(req) }));
});

app.get('/rinks/new', (req, res) => {
  const body = `
    <div class="page-title">
      <h2>New Rink</h2>
      <a class="btn btn-light" href="/rinks">Back</a>
    </div>

    <div class="card">
      <form method="POST" action="/rinks/new">
        <div class="row">
          <div class="col-6">
            <label>Rink Name</label>
            <input type="text" name="name" required />
          </div>
          <div class="col-3">
            <label>City</label>
            <input type="text" name="city" />
          </div>
          <div class="col-3">
            <label>State</label>
            <input type="text" name="state" />
          </div>
          <div class="col-12">
            <label>Address</label>
            <input type="text" name="address" />
          </div>
          <div class="col-4">
            <label>Track Type</label>
            <select name="trackType">
              <option value="Inline">Inline</option>
              <option value="Banked">Banked</option>
              <option value="Flat">Flat</option>
              <option value="Outdoor">Outdoor</option>
            </select>
          </div>
          <div class="col-12">
            <label>Notes</label>
            <textarea name="notes"></textarea>
          </div>
        </div>
        <button class="btn" type="submit">Save Rink</button>
      </form>
    </div>
  `;
  res.send(layout('New Rink', body));
});

app.post('/rinks/new', (req, res) => {
  const db = readDb();
  db.rinks.push({
    id: uid('rink'),
    name: req.body.name || '',
    city: req.body.city || '',
    state: req.body.state || '',
    address: req.body.address || '',
    notes: req.body.notes || '',
    trackType: req.body.trackType || 'Inline',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  writeDb(db);
  redirectWithMessage(res, '/rinks', 'Rink created.');
});

app.get('/rinks/:rinkId/edit', (req, res) => {
  const db = readDb();
  const rink = getRink(db, req.params.rinkId);
  if (!rink) return res.status(404).send(layout('Not Found', '<div class="card"><h3>Rink not found.</h3></div>'));

  const body = `
    <div class="page-title">
      <h2>Edit Rink</h2>
      <a class="btn btn-light" href="/rinks">Back</a>
    </div>

    <div class="card">
      <form method="POST" action="/rinks/${encodeURIComponent(rink.id)}/edit">
        <div class="row">
          <div class="col-6">
            <label>Rink Name</label>
            <input type="text" name="name" value="${escapeHtml(rink.name)}" required />
          </div>
          <div class="col-3">
            <label>City</label>
            <input type="text" name="city" value="${escapeHtml(rink.city || '')}" />
          </div>
          <div class="col-3">
            <label>State</label>
            <input type="text" name="state" value="${escapeHtml(rink.state || '')}" />
          </div>
          <div class="col-12">
            <label>Address</label>
            <input type="text" name="address" value="${escapeHtml(rink.address || '')}" />
          </div>
          <div class="col-4">
            <label>Track Type</label>
            <select name="trackType">
              <option value="Inline" ${rink.trackType === 'Inline' ? 'selected' : ''}>Inline</option>
              <option value="Banked" ${rink.trackType === 'Banked' ? 'selected' : ''}>Banked</option>
              <option value="Flat" ${rink.trackType === 'Flat' ? 'selected' : ''}>Flat</option>
              <option value="Outdoor" ${rink.trackType === 'Outdoor' ? 'selected' : ''}>Outdoor</option>
            </select>
          </div>
          <div class="col-12">
            <label>Notes</label>
            <textarea name="notes">${escapeHtml(rink.notes || '')}</textarea>
          </div>
        </div>
        <button class="btn" type="submit">Update Rink</button>
      </form>
    </div>
  `;
  res.send(layout('Edit Rink', body));
});

app.post('/rinks/:rinkId/edit', (req, res) => {
  const db = readDb();
  const rink = getRink(db, req.params.rinkId);
  if (!rink) return redirectWithMessage(res, '/rinks', 'Rink not found.');

  rink.name = req.body.name || '';
  rink.city = req.body.city || '';
  rink.state = req.body.state || '';
  rink.address = req.body.address || '';
  rink.notes = req.body.notes || '';
  rink.trackType = req.body.trackType || 'Inline';
  rink.updatedAt = new Date().toISOString();

  writeDb(db);
  redirectWithMessage(res, '/rinks', 'Rink updated.');
});

app.post('/rinks/:rinkId/delete', (req, res) => {
  const db = readDb();
  const rink = getRink(db, req.params.rinkId);
  if (!rink) return redirectWithMessage(res, '/rinks', 'Rink not found.');

  const inUse = db.meets.some(meet => meet.rinkId === rink.id);
  if (inUse) {
    return redirectWithMessage(res, '/rinks', 'Cannot delete rink because a meet is using it.');
  }

  db.rinks = db.rinks.filter(r => r.id !== rink.id);
  writeDb(db);
  redirectWithMessage(res, '/rinks', 'Rink deleted.');
});

// ------------------------------------------------------------
// MEETS LIST / CREATE / DELETE / OVERVIEW
// ------------------------------------------------------------
app.get('/meets', (req, res) => {
  const db = readDb();
  const meets = [...db.meets].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const rows = meets.map(meet => {
    const rink = getRink(db, meet.rinkId);
    const totals = calculateMeetTotals(meet);
    return `
      <tr>
        <td><a href="/meets/${encodeURIComponent(meet.id)}">${escapeHtml(meet.name || 'Untitled')}</a></td>
        <td>${fmtDate(meet.date)}</td>
        <td>${escapeHtml([meet.city, meet.state].filter(Boolean).join(', '))}</td>
        <td>${escapeHtml(rink?.name || '')}</td>
        <td>${totals.racers}</td>
        <td>${meet.isPublic ? `<span class="pill green">Public</span>` : `<span class="pill gray">Private</span>`}</td>
        <td>
          <a class="btn btn-sm" href="/meets/${encodeURIComponent(meet.id)}">Open</a>
          <a class="btn btn-sm btn-secondary" href="/meets/${encodeURIComponent(meet.id)}/builder">Edit</a>
          <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/delete" onsubmit="return confirm('Delete this meet and all racer/block data?');">
            <button class="btn btn-sm btn-danger" type="submit">Delete</button>
          </form>
        </td>
      </tr>
    `;
  }).join('');

  const body = `
    <div class="page-title">
      <h2>Meets</h2>
      <a class="btn" href="/meets/new">Create Meet</a>
    </div>

    <div class="card">
      <h3>All Meets</h3>
      <table>
        <thead>
          <tr>
            <th>Meet</th>
            <th>Date</th>
            <th>Location</th>
            <th>Rink</th>
            <th>Racers</th>
            <th>Visibility</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" class="muted">No meets created yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  res.send(layout('Meets', body, { message: reqMessage(req) }));
});

app.get('/meets/new', (req, res) => {
  const db = readDb();
  const rinkOptions = db.rinks.map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)} (${escapeHtml(r.city || '')}${r.city && r.state ? ', ' : ''}${escapeHtml(r.state || '')})</option>`).join('');

  const body = `
    <div class="page-title">
      <h2>Create Meet</h2>
      <a class="btn btn-light" href="/meets">Back</a>
    </div>

    <div class="card">
      <h3>Meet Builder</h3>
      <div class="warning-note">Gender helper note: <strong>Starting at Junior, use Men/Women</strong>.</div>

      <form method="POST" action="/meets/new">
        <div class="row">
          <div class="col-6">
            <label>Meet Name</label>
            <input type="text" name="name" required />
          </div>
          <div class="col-3">
            <label>Meet Date</label>
            <input type="date" name="date" />
          </div>
          <div class="col-3">
            <label>End Date</label>
            <input type="date" name="endDate" />
          </div>

          <div class="col-4">
            <label>City</label>
            <input type="text" name="city" />
          </div>
          <div class="col-2">
            <label>State</label>
            <input type="text" name="state" />
          </div>
          <div class="col-6">
            <label>Rink</label>
            <select name="rinkId">
              <option value="">-- Select Rink --</option>
              ${rinkOptions}
            </select>
          </div>

          <div class="col-12">
            <label>Address</label>
            <input type="text" name="address" />
          </div>

          <div class="col-3">
            <label>Entry Fee</label>
            <input type="number" step="0.01" name="entryFee" value="0" />
          </div>
          <div class="col-3">
            <label>Late Fee</label>
            <input type="number" step="0.01" name="lateFee" value="0" />
          </div>
          <div class="col-3">
            <label>Other Fee</label>
            <input type="number" step="0.01" name="otherFee" value="0" />
          </div>
          <div class="col-3">
            <label>Auto Helmet Start</label>
            <input type="number" name="autoHelmetStart" value="1" />
          </div>

          <div class="col-3">
            <label>Lanes Per Block</label>
            <input type="number" name="lanesPerBlock" value="8" min="1" />
          </div>
          <div class="col-3">
            <label>Status</label>
            <select name="status">
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="race-day">Race Day</option>
            </select>
          </div>
          <div class="col-3">
            <label>Public Meet</label>
            <div class="check-grid">
              <label><input type="checkbox" name="isPublic" /> Show on Find-a-Meet</label>
            </div>
          </div>
          <div class="col-3">
            <label>Classes</label>
            <div class="check-grid">
              <label><input type="checkbox" name="allowNovice" checked /> Novice</label>
              <label><input type="checkbox" name="allowElite" checked /> Elite</label>
            </div>
          </div>

          <div class="col-6">
            <label>Divisions</label>
            <div class="check-grid">
              <label><input type="checkbox" name="div_Tiny Tot" checked /> Tiny Tot</label>
              <label><input type="checkbox" name="div_Pee Wee" checked /> Pee Wee</label>
              <label><input type="checkbox" name="div_Elementary" checked /> Elementary</label>
              <label><input type="checkbox" name="div_Junior" checked /> Junior</label>
              <label><input type="checkbox" name="div_Senior" checked /> Senior</label>
              <label><input type="checkbox" name="div_Masters" checked /> Masters</label>
            </div>
          </div>

          <div class="col-6">
            <label>Distances</label>
            <div class="check-grid">
              <label><input type="checkbox" name="dist_D1" checked /> D1</label>
              <label><input type="checkbox" name="dist_D2" checked /> D2</label>
              <label><input type="checkbox" name="dist_D3" checked /> D3</label>
              <label><input type="checkbox" name="dist_D4" checked /> D4</label>
            </div>
          </div>

          <div class="col-12">
            <label>Notes</label>
            <textarea name="notes"></textarea>
          </div>
        </div>

        <button class="btn" type="submit">Create Meet</button>
      </form>
    </div>
  `;

  res.send(layout('Create Meet', body));
});

app.post('/meets/new', (req, res) => {
  const db = readDb();

  const divisions = ['Tiny Tot', 'Pee Wee', 'Elementary', 'Junior', 'Senior', 'Masters']
    .map(name => ({ name, enabled: parseCheckbox(req.body, `div_${name}`) }));

  const distanceConfig = {
    D1: { label: 'D1', enabled: parseCheckbox(req.body, 'dist_D1'), novice: true, elite: true },
    D2: { label: 'D2', enabled: parseCheckbox(req.body, 'dist_D2'), novice: true, elite: true },
    D3: { label: 'D3', enabled: parseCheckbox(req.body, 'dist_D3'), novice: true, elite: true },
    D4: { label: 'D4', enabled: parseCheckbox(req.body, 'dist_D4'), novice: true, elite: true }
  };

  const meet = normalizeMeet({
    id: uid('meet'),
    name: req.body.name || '',
    date: req.body.date || '',
    endDate: req.body.endDate || '',
    city: req.body.city || '',
    state: req.body.state || '',
    address: req.body.address || '',
    rinkId: req.body.rinkId || '',
    notes: req.body.notes || '',
    isPublic: parseCheckbox(req.body, 'isPublic'),
    slug: slugify(req.body.name || ''),
    status: req.body.status || 'draft',
    settings: {
      currency: 'USD',
      entryFee: safeNumber(req.body.entryFee, 0),
      lateFee: safeNumber(req.body.lateFee, 0),
      otherFee: safeNumber(req.body.otherFee, 0),
      trackType: 'Inline',
      lanesPerBlock: safeInt(req.body.lanesPerBlock, 8),
      autoHelmetStart: safeInt(req.body.autoHelmetStart, 1),
      allowNovice: parseCheckbox(req.body, 'allowNovice'),
      allowElite: parseCheckbox(req.body, 'allowElite')
    },
    divisions,
    distanceConfig,
    racers: [],
    races: [],
    blocks: []
  });

  db.meets.push(meet);
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}`, 'Meet created.');
});

app.post('/meets/:meetId/delete', (req, res) => {
  const db = readDb();
  const before = db.meets.length;
  db.meets = db.meets.filter(m => m.id !== req.params.meetId);
  if (db.meets.length === before) {
    return redirectWithMessage(res, '/meets', 'Meet not found.');
  }
  writeDb(db);
  redirectWithMessage(res, '/meets', 'Meet deleted.');
});

app.get('/meets/:meetId', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).send(layout('Not Found', '<div class="card"><h3>Meet not found.</h3></div>'));

  const rink = getRink(db, meet.rinkId);
  const totals = calculateMeetTotals(meet);

  const body = `
    <div class="page-title">
      <h2>${escapeHtml(meet.name || 'Meet')}</h2>
      <div class="toolbar">
        <a class="btn" href="/meets/${encodeURIComponent(meet.id)}/builder">Edit Meet</a>
        <a class="btn btn-secondary" href="/meets/${encodeURIComponent(meet.id)}/registration">Registration</a>
      </div>
    </div>

    ${meetTabs(meet, 'Overview')}

    <div class="stats">
      <div class="stat"><div class="label">Racers</div><div class="value">${totals.racers}</div></div>
      <div class="stat"><div class="label">Checked In</div><div class="value">${totals.checkedIn}</div></div>
      <div class="stat"><div class="label">Paid</div><div class="value">${totals.paid}</div></div>
      <div class="stat"><div class="label">Fees Total</div><div class="value">${money(totals.amount)}</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3>Meet Info</h3>
        <p><strong>Date:</strong> ${fmtDate(meet.date)} ${meet.endDate ? ` - ${fmtDate(meet.endDate)}` : ''}</p>
        <p><strong>Location:</strong> ${escapeHtml([meet.city, meet.state].filter(Boolean).join(', '))}</p>
        <p><strong>Address:</strong> ${escapeHtml(meet.address || '')}</p>
        <p><strong>Rink:</strong> ${escapeHtml(rink?.name || '')}</p>
        <p><strong>Status:</strong> ${escapeHtml(meet.status || '')}</p>
        <p><strong>Visibility:</strong> ${meet.isPublic ? 'Public' : 'Private'}</p>
        <p><strong>Notes:</strong><br>${escapeHtml(meet.notes || '')}</p>
      </div>

      <div class="card">
        <h3>Builder Settings</h3>
        <p><strong>Entry Fee:</strong> ${money(meet.settings?.entryFee || 0)}</p>
        <p><strong>Late Fee:</strong> ${money(meet.settings?.lateFee || 0)}</p>
        <p><strong>Other Fee:</strong> ${money(meet.settings?.otherFee || 0)}</p>
        <p><strong>Lanes Per Block:</strong> ${safeInt(meet.settings?.lanesPerBlock, 8)}</p>
        <p><strong>Auto Helmet Start:</strong> ${safeInt(meet.settings?.autoHelmetStart, 1)}</p>
        <p><strong>Classes:</strong> ${(meet.settings?.allowNovice ? 'Novice ' : '')}${(meet.settings?.allowElite ? 'Elite' : '')}</p>
        <p><strong>Enabled Divisions:</strong> ${getDivisionNames(meet).map(escapeHtml).join(', ')}</p>
        <p><strong>Enabled Distances:</strong> ${getEnabledDistanceKeys(meet).join(', ')}</p>
      </div>
    </div>
  `;

  res.send(layout(meet.name || 'Meet', body, { message: reqMessage(req) }));
});

// ------------------------------------------------------------
// MEET BUILDER
// ------------------------------------------------------------
app.get('/meets/:meetId/builder', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).send(layout('Not Found', '<div class="card"><h3>Meet not found.</h3></div>'));

  const rinkOptions = db.rinks.map(r => `
    <option value="${escapeHtml(r.id)}" ${meet.rinkId === r.id ? 'selected' : ''}>
      ${escapeHtml(r.name)} (${escapeHtml(r.city || '')}${r.city && r.state ? ', ' : ''}${escapeHtml(r.state || '')})
    </option>
  `).join('');

  const divisionChecked = name => meet.divisions.find(d => d.name === name)?.enabled ? 'checked' : '';
  const distChecked = key => meet.distanceConfig?.[key]?.enabled ? 'checked' : '';

  const body = `
    <div class="page-title">
      <h2>Meet Builder - ${escapeHtml(meet.name)}</h2>
      <a class="btn btn-light" href="/meets/${encodeURIComponent(meet.id)}">Back</a>
    </div>

    ${meetTabs(meet, 'Meet Builder')}

    <div class="card">
      <h3>Edit Meet</h3>
      <div class="warning-note">Gender helper note: <strong>Starting at Junior, use Men/Women</strong>.</div>

      <form method="POST" action="/meets/${encodeURIComponent(meet.id)}/builder">
        <div class="row">
          <div class="col-6">
            <label>Meet Name</label>
            <input type="text" name="name" value="${escapeHtml(meet.name)}" required />
          </div>
          <div class="col-3">
            <label>Meet Date</label>
            <input type="date" name="date" value="${escapeHtml(meet.date || '')}" />
          </div>
          <div class="col-3">
            <label>End Date</label>
            <input type="date" name="endDate" value="${escapeHtml(meet.endDate || '')}" />
          </div>

          <div class="col-4">
            <label>City</label>
            <input type="text" name="city" value="${escapeHtml(meet.city || '')}" />
          </div>
          <div class="col-2">
            <label>State</label>
            <input type="text" name="state" value="${escapeHtml(meet.state || '')}" />
          </div>
          <div class="col-6">
            <label>Rink</label>
            <select name="rinkId">
              <option value="">-- Select Rink --</option>
              ${rinkOptions}
            </select>
          </div>

          <div class="col-12">
            <label>Address</label>
            <input type="text" name="address" value="${escapeHtml(meet.address || '')}" />
          </div>

          <div class="col-3">
            <label>Entry Fee</label>
            <input type="number" step="0.01" name="entryFee" value="${safeNumber(meet.settings?.entryFee, 0)}" />
          </div>
          <div class="col-3">
            <label>Late Fee</label>
            <input type="number" step="0.01" name="lateFee" value="${safeNumber(meet.settings?.lateFee, 0)}" />
          </div>
          <div class="col-3">
            <label>Other Fee</label>
            <input type="number" step="0.01" name="otherFee" value="${safeNumber(meet.settings?.otherFee, 0)}" />
          </div>
          <div class="col-3">
            <label>Auto Helmet Start</label>
            <input type="number" name="autoHelmetStart" value="${safeInt(meet.settings?.autoHelmetStart, 1)}" />
          </div>

          <div class="col-3">
            <label>Lanes Per Block</label>
            <input type="number" name="lanesPerBlock" min="1" value="${safeInt(meet.settings?.lanesPerBlock, 8)}" />
          </div>
          <div class="col-3">
            <label>Status</label>
            <select name="status">
              <option value="draft" ${meet.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="open" ${meet.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="closed" ${meet.status === 'closed' ? 'selected' : ''}>Closed</option>
              <option value="race-day" ${meet.status === 'race-day' ? 'selected' : ''}>Race Day</option>
            </select>
          </div>
          <div class="col-3">
            <label>Public Meet</label>
            <div class="check-grid">
              <label><input type="checkbox" name="isPublic" ${meet.isPublic ? 'checked' : ''} /> Show on Find-a-Meet</label>
            </div>
          </div>
          <div class="col-3">
            <label>Classes</label>
            <div class="check-grid">
              <label><input type="checkbox" name="allowNovice" ${meet.settings?.allowNovice ? 'checked' : ''} /> Novice</label>
              <label><input type="checkbox" name="allowElite" ${meet.settings?.allowElite ? 'checked' : ''} /> Elite</label>
            </div>
          </div>

          <div class="col-6">
            <label>Divisions</label>
            <div class="check-grid">
              <label><input type="checkbox" name="div_Tiny Tot" ${divisionChecked('Tiny Tot')} /> Tiny Tot</label>
              <label><input type="checkbox" name="div_Pee Wee" ${divisionChecked('Pee Wee')} /> Pee Wee</label>
              <label><input type="checkbox" name="div_Elementary" ${divisionChecked('Elementary')} /> Elementary</label>
              <label><input type="checkbox" name="div_Junior" ${divisionChecked('Junior')} /> Junior</label>
              <label><input type="checkbox" name="div_Senior" ${divisionChecked('Senior')} /> Senior</label>
              <label><input type="checkbox" name="div_Masters" ${divisionChecked('Masters')} /> Masters</label>
            </div>
          </div>

          <div class="col-6">
            <label>Distances</label>
            <div class="check-grid">
              <label><input type="checkbox" name="dist_D1" ${distChecked('D1')} /> D1</label>
              <label><input type="checkbox" name="dist_D2" ${distChecked('D2')} /> D2</label>
              <label><input type="checkbox" name="dist_D3" ${distChecked('D3')} /> D3</label>
              <label><input type="checkbox" name="dist_D4" ${distChecked('D4')} /> D4</label>
            </div>
          </div>

          <div class="col-12">
            <label>Notes</label>
            <textarea name="notes">${escapeHtml(meet.notes || '')}</textarea>
          </div>
        </div>

        <div class="toolbar">
          <button class="btn" type="submit">Save Meet</button>
          <button class="btn btn-secondary" type="submit">Save Meet</button>
        </div>
      </form>
    </div>
  `;

  res.send(layout('Meet Builder', body, { message: reqMessage(req) }));
});

app.post('/meets/:meetId/builder', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  meet.name = req.body.name || '';
  meet.date = req.body.date || '';
  meet.endDate = req.body.endDate || '';
  meet.city = req.body.city || '';
  meet.state = req.body.state || '';
  meet.address = req.body.address || '';
  meet.rinkId = req.body.rinkId || '';
  meet.notes = req.body.notes || '';
  meet.isPublic = parseCheckbox(req.body, 'isPublic');
  meet.slug = slugify(meet.name || meet.slug);
  meet.status = req.body.status || 'draft';
  meet.updatedAt = new Date().toISOString();

  meet.settings = meet.settings || {};
  meet.settings.entryFee = safeNumber(req.body.entryFee, 0);
  meet.settings.lateFee = safeNumber(req.body.lateFee, 0);
  meet.settings.otherFee = safeNumber(req.body.otherFee, 0);
  meet.settings.autoHelmetStart = safeInt(req.body.autoHelmetStart, 1);
  meet.settings.lanesPerBlock = Math.max(1, safeInt(req.body.lanesPerBlock, 8));
  meet.settings.allowNovice = parseCheckbox(req.body, 'allowNovice');
  meet.settings.allowElite = parseCheckbox(req.body, 'allowElite');

  meet.divisions = ['Tiny Tot', 'Pee Wee', 'Elementary', 'Junior', 'Senior', 'Masters']
    .map(name => ({ name, enabled: parseCheckbox(req.body, `div_${name}`) }));

  meet.distanceConfig = {
    D1: { label: 'D1', enabled: parseCheckbox(req.body, 'dist_D1'), novice: true, elite: true },
    D2: { label: 'D2', enabled: parseCheckbox(req.body, 'dist_D2'), novice: true, elite: true },
    D3: { label: 'D3', enabled: parseCheckbox(req.body, 'dist_D3'), novice: true, elite: true },
    D4: { label: 'D4', enabled: parseCheckbox(req.body, 'dist_D4'), novice: true, elite: true }
  };

  rebuildMeetRaces(meet);
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/builder`, 'Meet saved.');
});// ------------------------------------------------------------
// REGISTRATION
// ------------------------------------------------------------
app.get('/meets/:meetId/registration', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).send(layout('Not Found', '<div class="card"><h3>Meet not found.</h3></div>'));

  const racers = sortByName(meet.racers || []);
  const totals = calculateMeetTotals(meet);

  const rows = racers.map(racer => {
    const total = calculateRacerTotal(racer);
    const distances = ['D1', 'D2', 'D3', 'D4'].filter(d => racer.distances?.[d]).join(', ');
    return `
      <tr>
        <td>${escapeHtml(racer.lastName)}, ${escapeHtml(racer.firstName)}</td>
        <td>${escapeHtml(racer.division || '')}</td>
        <td>${escapeHtml(racer.classType || '')}</td>
        <td>${escapeHtml(racer.gender || '')}</td>
        <td>${escapeHtml(racer.helmetNumber || '')}</td>
        <td>${escapeHtml(distances)}</td>
        <td>${money(total)}</td>
        <td>${racer.paid ? '<span class="pill green">Paid</span>' : '<span class="pill red">Unpaid</span>'}</td>
        <td>${racer.checkedIn ? '<span class="pill green">Checked In</span>' : '<span class="pill orange">Not In</span>'}</td>
        <td>
          <a class="btn btn-sm" href="/meets/${encodeURIComponent(meet.id)}/registration/${encodeURIComponent(racer.id)}/edit">Edit</a>
          <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/racers/${encodeURIComponent(racer.id)}/toggle-paid">
            <button class="btn btn-sm btn-secondary" type="submit">${racer.paid ? 'Unpay' : 'Pay'}</button>
          </form>
          <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/racers/${encodeURIComponent(racer.id)}/toggle-checkin">
            <button class="btn btn-sm btn-green" type="submit">${racer.checkedIn ? 'Undo Check-In' : 'Check-In'}</button>
          </form>
          <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/racers/${encodeURIComponent(racer.id)}/delete" onsubmit="return confirm('Delete this racer?');">
            <button class="btn btn-sm btn-danger" type="submit">Delete</button>
          </form>
        </td>
      </tr>
    `;
  }).join('');

  const divOptions = getDivisionNames(meet).map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');

  const classOptions = []
    .concat(meet.settings?.allowNovice ? [`<option value="Novice">Novice</option>`] : [])
    .concat(meet.settings?.allowElite ? [`<option value="Elite">Elite</option>`] : [])
    .join('');

  const body = `
    <div class="page-title">
      <h2>Registration - ${escapeHtml(meet.name)}</h2>
      <a class="btn btn-light" href="/meets/${encodeURIComponent(meet.id)}">Back</a>
    </div>

    ${meetTabs(meet, 'Registration')}

    <div class="stats">
      <div class="stat"><div class="label">Racers</div><div class="value">${totals.racers}</div></div>
      <div class="stat"><div class="label">Paid</div><div class="value">${totals.paid}</div></div>
      <div class="stat"><div class="label">Checked In</div><div class="value">${totals.checkedIn}</div></div>
      <div class="stat"><div class="label">Entry Total</div><div class="value">${money(totals.amount)}</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3>Add Racer</h3>
        <div class="note">Helmet number will auto-assign on registration, and can still be edited later.</div>
        <form method="POST" action="/meets/${encodeURIComponent(meet.id)}/registration/new">
          <div class="row">
            <div class="col-6">
              <label>First Name</label>
              <input type="text" name="firstName" required />
            </div>
            <div class="col-6">
              <label>Last Name</label>
              <input type="text" name="lastName" required />
            </div>

            <div class="col-3">
              <label>Age</label>
              <input type="number" name="age" />
            </div>
            <div class="col-3">
              <label>Birth Year</label>
              <input type="text" name="birthYear" />
            </div>
            <div class="col-3">
              <label>Gender</label>
              <select name="gender">
                <option value="">-- Select --</option>
                <option value="Boy">Boy</option>
                <option value="Girl">Girl</option>
                <option value="Men">Men</option>
                <option value="Women">Women</option>
              </select>
              <div class="helper">Starting at Junior, use Men/Women.</div>
            </div>
            <div class="col-3">
              <label>Division</label>
              <select name="division">
                <option value="">-- Select --</option>
                ${divOptions}
              </select>
            </div>

            <div class="col-3">
              <label>Class</label>
              <select name="classType">
                ${classOptions}
              </select>
            </div>
            <div class="col-3">
              <label>Team</label>
              <input type="text" name="team" />
            </div>
            <div class="col-3">
              <label>State</label>
              <input type="text" name="state" />
            </div>
            <div class="col-3">
              <label>Helmet Number</label>
              <input type="text" value="${escapeHtml(nextHelmetNumber(meet))}" disabled />
              <div class="helper">Auto-assigned at save.</div>
            </div>

            <div class="col-4">
              <label>Entry Fee</label>
              <input type="number" step="0.01" name="feeEntry" value="${safeNumber(meet.settings?.entryFee, 0)}" />
            </div>
            <div class="col-4">
              <label>Late Fee</label>
              <input type="number" step="0.01" name="feeLate" value="${safeNumber(meet.settings?.lateFee, 0)}" />
            </div>
            <div class="col-4">
              <label>Other Fee</label>
              <input type="number" step="0.01" name="feeOther" value="${safeNumber(meet.settings?.otherFee, 0)}" />
            </div>

            <div class="col-6">
              <label>Distances</label>
              <div class="check-grid">
                ${['D1', 'D2', 'D3', 'D4'].map(key => `
                  <label>
                    <input type="checkbox" name="dist_${key}" ${meet.distanceConfig?.[key]?.enabled ? '' : 'disabled'} />
                    ${key}
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="col-3">
              <label>Payment</label>
              <div class="check-grid">
                <label><input type="checkbox" name="paid" /> Paid</label>
              </div>
            </div>

            <div class="col-3">
              <label>Check-In</label>
              <div class="check-grid">
                <label><input type="checkbox" name="checkedIn" /> Checked In</label>
              </div>
            </div>

            <div class="col-12">
              <label>Notes</label>
              <textarea name="notes"></textarea>
            </div>
          </div>

          <button class="btn" type="submit">Register Racer</button>
        </form>
      </div>

      <div class="card">
        <h3>Registered Racers</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Division</th>
              <th>Class</th>
              <th>Gender</th>
              <th>Helmet</th>
              <th>Distances</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Check-In</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="10" class="muted">No racers yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  res.send(layout('Registration', body, { message: reqMessage(req) }));
});

app.post('/meets/:meetId/registration/new', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  const racer = normalizeRacer({
    id: uid('racer'),
    firstName: req.body.firstName || '',
    lastName: req.body.lastName || '',
    age: safeInt(req.body.age, 0),
    birthYear: req.body.birthYear || '',
    gender: req.body.gender || '',
    division: req.body.division || '',
    classType: req.body.classType || 'Novice',
    team: req.body.team || '',
    state: req.body.state || '',
    helmetNumber: nextHelmetNumber(meet),
    paid: parseCheckbox(req.body, 'paid'),
    checkedIn: parseCheckbox(req.body, 'checkedIn'),
    notes: req.body.notes || '',
    distances: {
      D1: parseCheckbox(req.body, 'dist_D1'),
      D2: parseCheckbox(req.body, 'dist_D2'),
      D3: parseCheckbox(req.body, 'dist_D3'),
      D4: parseCheckbox(req.body, 'dist_D4')
    },
    fees: {
      entry: safeNumber(req.body.feeEntry, meet.settings?.entryFee || 0),
      late: safeNumber(req.body.feeLate, meet.settings?.lateFee || 0),
      other: safeNumber(req.body.feeOther, meet.settings?.otherFee || 0)
    }
  });

  meet.racers.push(racer);
  rebuildMeetRaces(meet);
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/registration`, 'Racer registered.');
});

app.get('/meets/:meetId/registration/:racerId/edit', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).send(layout('Not Found', '<div class="card"><h3>Meet not found.</h3></div>'));

  const racer = getRacer(meet, req.params.racerId);
  if (!racer) return res.status(404).send(layout('Not Found', '<div class="card"><h3>Racer not found.</h3></div>'));

  const divOptions = getDivisionNames(meet).map(name => `<option value="${escapeHtml(name)}" ${racer.division === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
  const classOptions = []
    .concat(meet.settings?.allowNovice ? [`<option value="Novice" ${racer.classType === 'Novice' ? 'selected' : ''}>Novice</option>`] : [])
    .concat(meet.settings?.allowElite ? [`<option value="Elite" ${racer.classType === 'Elite' ? 'selected' : ''}>Elite</option>`] : [])
    .join('');

  const body = `
    <div class="page-title">
      <h2>Edit Racer - ${escapeHtml(racer.firstName)} ${escapeHtml(racer.lastName)}</h2>
      <a class="btn btn-light" href="/meets/${encodeURIComponent(meet.id)}/registration">Back</a>
    </div>

    ${meetTabs(meet, 'Registration')}

    <div class="card">
      <form method="POST" action="/meets/${encodeURIComponent(meet.id)}/registration/${encodeURIComponent(racer.id)}/edit">
        <div class="row">
          <div class="col-6">
            <label>First Name</label>
            <input type="text" name="firstName" value="${escapeHtml(racer.firstName)}" required />
          </div>
          <div class="col-6">
            <label>Last Name</label>
            <input type="text" name="lastName" value="${escapeHtml(racer.lastName)}" required />
          </div>

          <div class="col-3">
            <label>Age</label>
            <input type="number" name="age" value="${safeInt(racer.age, 0) || ''}" />
          </div>
          <div class="col-3">
            <label>Birth Year</label>
            <input type="text" name="birthYear" value="${escapeHtml(racer.birthYear || '')}" />
          </div>
          <div class="col-3">
            <label>Gender</label>
            <select name="gender">
              <option value="">-- Select --</option>
              <option value="Boy" ${racer.gender === 'Boy' ? 'selected' : ''}>Boy</option>
              <option value="Girl" ${racer.gender === 'Girl' ? 'selected' : ''}>Girl</option>
              <option value="Men" ${racer.gender === 'Men' ? 'selected' : ''}>Men</option>
              <option value="Women" ${racer.gender === 'Women' ? 'selected' : ''}>Women</option>
            </select>
            <div class="helper">Starting at Junior, use Men/Women.</div>
          </div>
          <div class="col-3">
            <label>Division</label>
            <select name="division">
              <option value="">-- Select --</option>
              ${divOptions}
            </select>
          </div>

          <div class="col-3">
            <label>Class</label>
            <select name="classType">${classOptions}</select>
          </div>
          <div class="col-3">
            <label>Team</label>
            <input type="text" name="team" value="${escapeHtml(racer.team || '')}" />
          </div>
          <div class="col-3">
            <label>State</label>
            <input type="text" name="state" value="${escapeHtml(racer.state || '')}" />
          </div>
          <div class="col-3">
            <label>Helmet Number</label>
            <input type="text" name="helmetNumber" value="${escapeHtml(racer.helmetNumber || '')}" />
          </div>

          <div class="col-4">
            <label>Entry Fee</label>
            <input type="number" step="0.01" name="feeEntry" value="${safeNumber(racer.fees?.entry, 0)}" />
          </div>
          <div class="col-4">
            <label>Late Fee</label>
            <input type="number" step="0.01" name="feeLate" value="${safeNumber(racer.fees?.late, 0)}" />
          </div>
          <div class="col-4">
            <label>Other Fee</label>
            <input type="number" step="0.01" name="feeOther" value="${safeNumber(racer.fees?.other, 0)}" />
          </div>

          <div class="col-6">
            <label>Distances</label>
            <div class="check-grid">
              ${['D1', 'D2', 'D3', 'D4'].map(key => `
                <label>
                  <input type="checkbox" name="dist_${key}" ${racer.distances?.[key] ? 'checked' : ''} ${meet.distanceConfig?.[key]?.enabled ? '' : 'disabled'} />
                  ${key}
                </label>
              `).join('')}
            </div>
          </div>

          <div class="col-3">
            <label>Payment</label>
            <div class="check-grid">
              <label><input type="checkbox" name="paid" ${racer.paid ? 'checked' : ''} /> Paid</label>
            </div>
          </div>

          <div class="col-3">
            <label>Check-In</label>
            <div class="check-grid">
              <label><input type="checkbox" name="checkedIn" ${racer.checkedIn ? 'checked' : ''} /> Checked In</label>
            </div>
          </div>

          <div class="col-12">
            <label>Notes</label>
            <textarea name="notes">${escapeHtml(racer.notes || '')}</textarea>
          </div>
        </div>

        <button class="btn" type="submit">Save Racer</button>
      </form>
    </div>
  `;

  res.send(layout('Edit Racer', body, { message: reqMessage(req) }));
});

app.post('/meets/:meetId/registration/:racerId/edit', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');
  const racer = getRacer(meet, req.params.racerId);
  if (!racer) return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/registration`, 'Racer not found.');

  racer.firstName = req.body.firstName || '';
  racer.lastName = req.body.lastName || '';
  racer.fullName = `${racer.firstName} ${racer.lastName}`.trim();
  racer.age = safeInt(req.body.age, 0);
  racer.birthYear = req.body.birthYear || '';
  racer.gender = req.body.gender || '';
  racer.division = req.body.division || '';
  racer.classType = req.body.classType || 'Novice';
  racer.team = req.body.team || '';
  racer.state = req.body.state || '';
  racer.helmetNumber = String(req.body.helmetNumber || '');
  racer.paid = parseCheckbox(req.body, 'paid');
  racer.checkedIn = parseCheckbox(req.body, 'checkedIn');
  racer.notes = req.body.notes || '';
  racer.distances = {
    D1: parseCheckbox(req.body, 'dist_D1'),
    D2: parseCheckbox(req.body, 'dist_D2'),
    D3: parseCheckbox(req.body, 'dist_D3'),
    D4: parseCheckbox(req.body, 'dist_D4')
  };
  racer.fees = {
    entry: safeNumber(req.body.feeEntry, 0),
    late: safeNumber(req.body.feeLate, 0),
    other: safeNumber(req.body.feeOther, 0)
  };
  racer.updatedAt = new Date().toISOString();

  rebuildMeetRaces(meet);
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/registration`, 'Racer updated.');
});

app.post('/meets/:meetId/racers/:racerId/delete', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  const before = meet.racers.length;
  meet.racers = meet.racers.filter(r => r.id !== req.params.racerId);
  if (before === meet.racers.length) {
    return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/registration`, 'Racer not found.');
  }

  rebuildMeetRaces(meet);
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/registration`, 'Racer deleted.');
});

app.post('/meets/:meetId/racers/:racerId/toggle-paid', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');
  const racer = getRacer(meet, req.params.racerId);
  if (!racer) return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/registration`, 'Racer not found.');

  racer.paid = !racer.paid;
  racer.updatedAt = new Date().toISOString();
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/registration`, 'Paid status updated.');
});

app.post('/meets/:meetId/racers/:racerId/toggle-checkin', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');
  const racer = getRacer(meet, req.params.racerId);
  if (!racer) return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/registration`, 'Racer not found.');

  racer.checkedIn = !racer.checkedIn;
  racer.updatedAt = new Date().toISOString();
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/registration`, 'Check-in status updated.');
});

// ------------------------------------------------------------
// CHECK-IN TAB
// ------------------------------------------------------------
app.get('/meets/:meetId/checkin', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).send(layout('Not Found', '<div class="card"><h3>Meet not found.</h3></div>'));

  const q = String(req.query.q || '').trim().toLowerCase();
  let racers = sortByName(meet.racers || []);
  if (q) {
    racers = racers.filter(r =>
      `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
      `${r.lastName}, ${r.firstName}`.toLowerCase().includes(q) ||
      String(r.helmetNumber || '').toLowerCase().includes(q)
    );
  }

  const rows = racers.map(racer => `
    <tr>
      <td>${escapeHtml(racer.lastName)}, ${escapeHtml(racer.firstName)}</td>
      <td>${escapeHtml(racer.division || '')}</td>
      <td>${escapeHtml(racer.classType || '')}</td>
      <td>
        <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/checkin/${encodeURIComponent(racer.id)}/helmet">
          <input type="text" name="helmetNumber" value="${escapeHtml(racer.helmetNumber || '')}" style="width:90px;padding:6px 8px;border:1px solid #d1d5db;border-radius:8px;" />
          <button class="btn btn-sm" type="submit">Save</button>
        </form>
      </td>
      <td>
        <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/racers/${encodeURIComponent(racer.id)}/toggle-paid">
          <button class="btn btn-sm ${racer.paid ? 'btn-green' : 'btn-secondary'}" type="submit">${racer.paid ? 'Paid' : 'Unpaid'}</button>
        </form>
      </td>
      <td>
        <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/racers/${encodeURIComponent(racer.id)}/toggle-checkin">
          <button class="btn btn-sm ${racer.checkedIn ? 'btn-green' : 'btn-orange'}" type="submit">${racer.checkedIn ? 'Checked In' : 'Not In'}</button>
        </form>
      </td>
      <td>${money(calculateRacerTotal(racer))}</td>
      <td>${escapeHtml(['D1','D2','D3','D4'].filter(d => racer.distances?.[d]).join(', '))}</td>
    </tr>
  `).join('');

  const totals = calculateMeetTotals(meet);

  const body = `
    <div class="page-title">
      <h2>Check-In - ${escapeHtml(meet.name)}</h2>
      <a class="btn btn-light" href="/meets/${encodeURIComponent(meet.id)}">Back</a>
    </div>

    ${meetTabs(meet, 'Check-In')}

    <div class="stats">
      <div class="stat"><div class="label">Total Racers</div><div class="value">${totals.racers}</div></div>
      <div class="stat"><div class="label">Checked In</div><div class="value">${totals.checkedIn}</div></div>
      <div class="stat"><div class="label">Paid</div><div class="value">${totals.paid}</div></div>
      <div class="stat"><div class="label">Fees</div><div class="value">${money(totals.amount)}</div></div>
    </div>

    <div class="card">
      <h3>Check-In Control</h3>
      <form method="GET" action="/meets/${encodeURIComponent(meet.id)}/checkin" class="toolbar">
        <input type="text" name="q" placeholder="Search name or helmet #" value="${escapeHtml(req.query.q || '')}" style="max-width:260px;" />
        <button class="btn" type="submit">Search</button>
        <a class="btn btn-light" href="/meets/${encodeURIComponent(meet.id)}/checkin">Clear</a>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Division</th>
            <th>Class</th>
            <th>Helmet</th>
            <th>Paid</th>
            <th>Check-In</th>
            <th>Total</th>
            <th>Distances</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" class="muted">No racers found.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  res.send(layout('Check-In', body, { message: reqMessage(req) }));
});

app.post('/meets/:meetId/checkin/:racerId/helmet', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');
  const racer = getRacer(meet, req.params.racerId);
  if (!racer) return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/checkin`, 'Racer not found.');

  racer.helmetNumber = String(req.body.helmetNumber || '').trim();
  racer.updatedAt = new Date().toISOString();
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/checkin`, 'Helmet number updated.');
});

// ------------------------------------------------------------
// BLOCK BUILDER
// ------------------------------------------------------------
app.get('/meets/:meetId/blocks', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).send(layout('Not Found', '<div class="card"><h3>Meet not found.</h3></div>'));

  rebuildMeetRaces(meet);
  writeDb(db);

  const q = String(req.query.q || '').trim().toLowerCase();
  const classFilter = String(req.query.classType || '');
  const distanceFilter = String(req.query.distanceKey || '');

  const matches = race => {
    const text = `${race.racerName} ${race.division} ${race.gender} ${race.classType} ${race.distanceKey} ${race.distanceLabel}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (classFilter && race.classType !== classFilter) return false;
    if (distanceFilter && race.distanceKey !== distanceFilter) return false;
    return true;
  };

  const unassigned = (meet.races || []).filter(r => !r.blockId).filter(matches);

  const unassignedHtml = unassigned.map(race => `
    <div class="race-card">
      <div><strong>${escapeHtml(race.racerName)}</strong></div>
      <div class="muted">${escapeHtml(race.division)} • ${escapeHtml(race.classType)} • ${escapeHtml(race.gender)} • ${escapeHtml(race.distanceLabel)}</div>
      <div class="toolbar" style="margin-top:8px;">
        ${meet.blocks.map(block => `
          <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/blocks/${encodeURIComponent(block.id)}/assign-race">
            <input type="hidden" name="raceId" value="${escapeHtml(race.id)}" />
            <button class="btn btn-sm" type="submit">To ${escapeHtml(block.name)}</button>
          </form>
        `).join('') || '<span class="muted">Create a block first.</span>'}
      </div>
    </div>
  `).join('');

  const blockHtml = [...meet.blocks]
    .sort((a, b) => safeInt(a.order, 9999) - safeInt(b.order, 9999))
    .map(block => {
      const blockRaces = (meet.races || []).filter(r => r.blockId === block.id).sort((a, b) => {
        const laneA = a.lane == null ? 9999 : safeInt(a.lane, 9999);
        const laneB = b.lane == null ? 9999 : safeInt(b.lane, 9999);
        if (laneA !== laneB) return laneA - laneB;
        return (a.racerName || '').localeCompare(b.racerName || '');
      });

      return `
        <div class="block-box">
          <div class="page-title" style="margin-bottom:10px;">
            <h3 style="margin:0;">${escapeHtml(block.name)}</h3>
            <div class="toolbar">
              <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/blocks/${encodeURIComponent(block.id)}/lanes/auto">
                <button class="btn btn-sm btn-secondary" type="submit">Auto Lanes</button>
              </form>
              <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/blocks/${encodeURIComponent(block.id)}/lanes/clear">
                <button class="btn btn-sm btn-light" type="submit">Clear Lanes</button>
              </form>
              <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/blocks/${encodeURIComponent(block.id)}/delete" onsubmit="return confirm('Delete this block? Races will be unassigned.');">
                <button class="btn btn-sm btn-danger" type="submit">Delete Block</button>
              </form>
            </div>
          </div>

          <div class="muted" style="margin-bottom:8px;">Order: ${safeInt(block.order, 0)} • ${blockRaces.length} races</div>

          <table>
            <thead>
              <tr>
                <th>Lane</th>
                <th>Racer</th>
                <th>Division</th>
                <th>Class</th>
                <th>Distance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${blockRaces.map(race => `
                <tr>
                  <td>
                    <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/blocks/${encodeURIComponent(block.id)}/lanes/set">
                      <input type="hidden" name="raceId" value="${escapeHtml(race.id)}" />
                      <input type="number" min="1" name="lane" value="${race.lane ?? ''}" style="width:70px;padding:6px 8px;border:1px solid #d1d5db;border-radius:8px;" />
                      <button class="btn btn-sm" type="submit">Save</button>
                    </form>
                  </td>
                  <td>${escapeHtml(race.racerName)}</td>
                  <td>${escapeHtml(race.division)}</td>
                  <td>${escapeHtml(race.classType)}</td>
                  <td>${escapeHtml(race.distanceLabel)}</td>
                  <td>
                    <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/blocks/unassign-race">
                      <input type="hidden" name="raceId" value="${escapeHtml(race.id)}" />
                      <button class="btn btn-sm btn-orange" type="submit">Unassign</button>
                    </form>
                  </td>
                </tr>
              `).join('') || `<tr><td colspan="6" class="muted">No races in this block.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

  const body = `
    <div class="page-title">
      <h2>Block Builder - ${escapeHtml(meet.name)}</h2>
      <a class="btn btn-light" href="/meets/${encodeURIComponent(meet.id)}">Back</a>
    </div>

    ${meetTabs(meet, 'Block Builder')}

    <div class="grid grid-2">
      <div class="card">
        <h3>Create Block</h3>
        <form method="POST" action="/meets/${encodeURIComponent(meet.id)}/blocks/new">
          <div class="row">
            <div class="col-8">
              <label>Block Name</label>
              <input type="text" name="name" placeholder="Block 1" required />
            </div>
            <div class="col-4">
              <label>Order</label>
              <input type="number" name="order" value="${(meet.blocks?.length || 0) + 1}" />
            </div>
            <div class="col-12">
              <label>Notes</label>
              <textarea name="notes"></textarea>
            </div>
          </div>
          <button class="btn" type="submit">Add Block</button>
        </form>
      </div>

      <div class="card">
        <h3>Filters</h3>
        <form method="GET" action="/meets/${encodeURIComponent(meet.id)}/blocks">
          <div class="row">
            <div class="col-6">
              <label>Search</label>
              <input type="text" name="q" value="${escapeHtml(req.query.q || '')}" placeholder="Name, division, gender..." />
            </div>
            <div class="col-3">
              <label>Class</label>
              <select name="classType">
                <option value="">All</option>
                <option value="Novice" ${classFilter === 'Novice' ? 'selected' : ''}>Novice</option>
                <option value="Elite" ${classFilter === 'Elite' ? 'selected' : ''}>Elite</option>
              </select>
            </div>
            <div class="col-3">
              <label>Distance</label>
              <select name="distanceKey">
                <option value="">All</option>
                <option value="D1" ${distanceFilter === 'D1' ? 'selected' : ''}>D1</option>
                <option value="D2" ${distanceFilter === 'D2' ? 'selected' : ''}>D2</option>
                <option value="D3" ${distanceFilter === 'D3' ? 'selected' : ''}>D3</option>
                <option value="D4" ${distanceFilter === 'D4' ? 'selected' : ''}>D4</option>
              </select>
            </div>
          </div>
          <div class="toolbar">
            <button class="btn" type="submit">Apply Filters</button>
            <a class="btn btn-light" href="/meets/${encodeURIComponent(meet.id)}/blocks">Clear</a>
          </div>
        </form>
      </div>
    </div>

    <div class="split" style="margin-top:16px;">
      <div class="card">
        <h3>Unassigned Races (${unassigned.length})</h3>
        ${unassignedHtml || `<div class="muted">No unassigned races match the current filters.</div>`}
      </div>

      <div>
        ${blockHtml || `<div class="card"><h3>No Blocks Yet</h3><p class="muted">Create a block to start assigning races.</p></div>`}
      </div>
    </div>
  `;

  res.send(layout('Block Builder', body, { message: reqMessage(req) }));
});

app.post('/meets/:meetId/blocks/new', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  meet.blocks.push(normalizeBlock({
    id: uid('block'),
    name: req.body.name || `Block ${(meet.blocks?.length || 0) + 1}`,
    order: safeInt(req.body.order, (meet.blocks?.length || 0) + 1),
    notes: req.body.notes || ''
  }));

  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Block created.');
});

app.post('/meets/:meetId/blocks/:blockId/delete', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  const block = getBlock(meet, req.params.blockId);
  if (!block) return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Block not found.');

  for (const race of meet.races || []) {
    if (race.blockId === block.id) {
      race.blockId = null;
      race.lane = null;
      race.status = 'unassigned';
      race.updatedAt = new Date().toISOString();
    }
  }

  meet.blocks = meet.blocks.filter(b => b.id !== block.id);
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Block deleted and races unassigned.');
});

app.post('/meets/:meetId/blocks/:blockId/assign-race', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  const ok = assignRaceToBlock(meet, req.body.raceId, req.params.blockId);
  if (!ok) return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Race or block not found.');

  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Race assigned to block.');
});

app.post('/meets/:meetId/blocks/unassign-race', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  const ok = unassignRaceFromBlock(meet, req.body.raceId);
  if (!ok) return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Race not found.');

  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Race unassigned.');
});

app.post('/meets/:meetId/blocks/:blockId/lanes/auto', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  autoAssignLanesForBlock(meet, req.params.blockId);
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Lanes auto-assigned.');
});

app.post('/meets/:meetId/blocks/:blockId/lanes/clear', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  clearLanesForBlock(meet, req.params.blockId);
  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Lanes cleared.');
});

app.post('/meets/:meetId/blocks/:blockId/lanes/set', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return redirectWithMessage(res, '/meets', 'Meet not found.');

  const race = (meet.races || []).find(r => r.id === req.body.raceId && r.blockId === req.params.blockId);
  if (!race) return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Race not found in block.');

  const lane = safeInt(req.body.lane, 0);
  if (lane < 1) {
    race.lane = null;
  } else {
    const conflict = (meet.races || []).find(r =>
      r.id !== race.id &&
      r.blockId === req.params.blockId &&
      safeInt(r.lane, 0) === lane
    );
    if (conflict) {
      return redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, `Lane ${lane} is already assigned in this block.`);
    }
    race.lane = lane;
  }
  race.status = 'assigned';
  race.updatedAt = new Date().toISOString();

  writeDb(db);
  redirectWithMessage(res, `/meets/${encodeURIComponent(meet.id)}/blocks`, 'Lane updated.');
});// ------------------------------------------------------------
// RACE DAY
// ------------------------------------------------------------
app.get('/meets/:meetId/race-day', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).send(layout('Not Found', '<div class="card"><h3>Meet not found.</h3></div>'));

  const blocks = [...(meet.blocks || [])].sort((a, b) => safeInt(a.order, 9999) - safeInt(b.order, 9999));
  const bodyBlocks = blocks.map(block => {
    const maxLanes = Math.max(1, safeInt(meet.settings?.lanesPerBlock, 8));
    const blockRaces = (meet.races || []).filter(r => r.blockId === block.id);
    const laneHtml = Array.from({ length: maxLanes }, (_, i) => {
      const laneNum = i + 1;
      const race = blockRaces.find(r => safeInt(r.lane, 0) === laneNum);
      return `
        <div class="lane">
          <h4>Lane ${laneNum}</h4>
          ${race ? `
            <div><strong>${escapeHtml(race.racerName)}</strong></div>
            <div class="muted">${escapeHtml(race.division)} • ${escapeHtml(race.classType)}</div>
            <div class="muted">${escapeHtml(race.distanceLabel)} • ${escapeHtml(race.gender)}</div>
          ` : `<div class="muted">Open</div>`}
        </div>
      `;
    }).join('');

    return `
      <div class="card" style="margin-bottom:16px;">
        <div class="page-title" style="margin-bottom:12px;">
          <h3 style="margin:0;">${escapeHtml(block.name)}</h3>
          <div class="toolbar">
            <form class="inline" method="POST" action="/meets/${encodeURIComponent(meet.id)}/blocks/${encodeURIComponent(block.id)}/lanes/auto">
              <button class="btn btn-sm btn-secondary" type="submit">Auto Lanes</button>
            </form>
            <a class="btn btn-sm btn-light" href="/meets/${encodeURIComponent(meet.id)}/blocks">Edit Block</a>
          </div>
        </div>
        <div class="lane-box">${laneHtml}</div>
      </div>
    `;
  }).join('');

  const body = `
    <div class="page-title">
      <h2>Race Day - ${escapeHtml(meet.name)}</h2>
      <a class="btn btn-light" href="/meets/${encodeURIComponent(meet.id)}">Back</a>
    </div>

    ${meetTabs(meet, 'Race Day')}

    ${bodyBlocks || `
      <div class="card">
        <h3>No blocks ready</h3>
        <p class="muted">Build blocks first, then assign lanes.</p>
      </div>
    `}
  `;

  res.send(layout('Race Day', body, { message: reqMessage(req) }));
});

// ------------------------------------------------------------
// PRINT RACE LIST
// ------------------------------------------------------------
app.get('/meets/:meetId/print/race-list', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).send('Meet not found.');

  const blocks = [...(meet.blocks || [])].sort((a, b) => safeInt(a.order, 9999) - safeInt(b.order, 9999));

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Race List - ${escapeHtml(meet.name)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 20px; }
    h1, h2, h3 { margin-bottom: 8px; }
    .muted { color: #666; }
    .block { margin-bottom: 24px; page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border-bottom: 1px solid #ccc; padding: 8px 6px; text-align: left; }
    th { background: #f1f5f9; }
    @media print { .no-print { display:none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px;">
    <button onclick="window.print()">Print</button>
  </div>
  <h1>${escapeHtml(meet.name)}</h1>
  <div class="muted">${fmtDate(meet.date)} ${meet.endDate ? ` - ${fmtDate(meet.endDate)}` : ''}</div>
  <div class="muted">${escapeHtml([meet.city, meet.state].filter(Boolean).join(', '))}</div>

  ${blocks.map(block => {
    const races = (meet.races || []).filter(r => r.blockId === block.id).sort((a, b) => {
      const laneA = a.lane == null ? 9999 : safeInt(a.lane, 9999);
      const laneB = b.lane == null ? 9999 : safeInt(b.lane, 9999);
      if (laneA !== laneB) return laneA - laneB;
      return (a.racerName || '').localeCompare(b.racerName || '');
    });

    return `
      <div class="block">
        <h2>${escapeHtml(block.name)}</h2>
        <table>
          <thead>
            <tr>
              <th>Lane</th>
              <th>Racer</th>
              <th>Division</th>
              <th>Class</th>
              <th>Gender</th>
              <th>Distance</th>
            </tr>
          </thead>
          <tbody>
            ${races.map(race => `
              <tr>
                <td>${race.lane ?? ''}</td>
                <td>${escapeHtml(race.racerName)}</td>
                <td>${escapeHtml(race.division)}</td>
                <td>${escapeHtml(race.classType)}</td>
                <td>${escapeHtml(race.gender)}</td>
                <td>${escapeHtml(race.distanceLabel)}</td>
              </tr>
            `).join('') || `<tr><td colspan="6">No races assigned.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }).join('')}

  <div class="block">
    <h2>Unassigned Races</h2>
    <table>
      <thead>
        <tr>
          <th>Racer</th>
          <th>Division</th>
          <th>Class</th>
          <th>Gender</th>
          <th>Distance</th>
        </tr>
      </thead>
      <tbody>
        ${(meet.races || []).filter(r => !r.blockId).map(race => `
          <tr>
            <td>${escapeHtml(race.racerName)}</td>
            <td>${escapeHtml(race.division)}</td>
            <td>${escapeHtml(race.classType)}</td>
            <td>${escapeHtml(race.gender)}</td>
            <td>${escapeHtml(race.distanceLabel)}</td>
          </tr>
        `).join('') || `<tr><td colspan="5">No unassigned races.</td></tr>`}
      </tbody>
    </table>
  </div>
</body>
</html>
  `;
  res.send(html);
});

// ------------------------------------------------------------
// FIND-A-MEET
// ------------------------------------------------------------
app.get('/find-a-meet', (req, res) => {
  const db = readDb();
  const rows = buildFindMeetRows(db);

  const body = `
    <div class="page-title">
      <h2>Find a Meet</h2>
      <a class="btn btn-light" href="/">Back</a>
    </div>

    <div class="card">
      <h3>Public Meets</h3>
      <table>
        <thead>
          <tr>
            <th>Meet</th>
            <th>Date</th>
            <th>Location</th>
            <th>Rink</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5" class="muted">No public meets available.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  res.send(layout('Find a Meet', body, { message: reqMessage(req) }));
});

app.get('/find-a-meet/:meetId', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet || !meet.isPublic) {
    return res.status(404).send(layout('Not Found', '<div class="card"><h3>Meet not found.</h3></div>'));
  }

  const rink = getRink(db, meet.rinkId);
  const totals = calculateMeetTotals(meet);

  const body = `
    <div class="page-title">
      <h2>${escapeHtml(meet.name || 'Meet')}</h2>
      <a class="btn btn-light" href="/find-a-meet">Back</a>
    </div>

    <div class="stats">
      <div class="stat"><div class="label">Date</div><div class="value" style="font-size:18px;">${fmtDate(meet.date) || 'TBD'}</div></div>
      <div class="stat"><div class="label">Location</div><div class="value" style="font-size:18px;">${escapeHtml([meet.city, meet.state].filter(Boolean).join(', ') || 'TBD')}</div></div>
      <div class="stat"><div class="label">Rink</div><div class="value" style="font-size:18px;">${escapeHtml(rink?.name || 'TBD')}</div></div>
      <div class="stat"><div class="label">Registered</div><div class="value">${totals.racers}</div></div>
    </div>

    <div class="card">
      <h3>Meet Info</h3>
      <p><strong>Address:</strong> ${escapeHtml(meet.address || '')}</p>
      <p><strong>Status:</strong> ${escapeHtml(meet.status || '')}</p>
      <p><strong>Notes:</strong><br>${escapeHtml(meet.notes || '')}</p>
    </div>
  `;

  res.send(layout(`Find a Meet - ${meet.name}`, body));
});

// ------------------------------------------------------------
// JSON API QUICK HELPERS (OPTIONAL)
// ------------------------------------------------------------
app.get('/api/meets/:meetId', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).json({ error: 'Meet not found' });
  res.json(meet);
});

app.get('/api/meets/:meetId/racers', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).json({ error: 'Meet not found' });
  res.json(sortByName(meet.racers || []));
});

app.get('/api/meets/:meetId/blocks', (req, res) => {
  const db = readDb();
  const meet = getMeet(db, req.params.meetId);
  if (!meet) return res.status(404).json({ error: 'Meet not found' });
  res.json((meet.blocks || []).sort((a, b) => safeInt(a.order, 9999) - safeInt(b.order, 9999)));
});

// ------------------------------------------------------------
// HEALTH / DEBUG
// ------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: 'SpeedSkateMeet',
    version: 15,
    time: new Date().toISOString()
  });
});

// ------------------------------------------------------------
// 404
// ------------------------------------------------------------
app.use((req, res) => {
  res.status(404).send(layout('Not Found', `
    <div class="card">
      <h3>404 - Page not found</h3>
      <p class="muted">That route does not exist.</p>
      <a class="btn" href="/">Go Home</a>
    </div>
  `));
});

// ------------------------------------------------------------
// STARTUP
// ------------------------------------------------------------
(function bootstrap() {
  const db = readDb();

  // make sure each meet is normalized and races are rebuilt safely
  for (const meet of db.meets) {
    normalizeMeet(meet);
    rebuildMeetRaces(meet);
  }

  writeDb(db);

  app.listen(PORT, () => {
    console.log(`SpeedSkateMeet v15 running on port ${PORT}`);
    console.log(`DB file: ${DB_FILE}`);
  });
})();