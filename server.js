const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sendSms, normalizePhone } = require('./services/sms');
const { sendEmail, emailHtmlWrap } = require('./services/email');
const {
  generateBaseRacesForMeet,
  generateOpenRacesForMeet,
  generateQuadRacesForMeet,
  rebuildRaceAssignments,
} = require('./services/raceGenerator');

const {
  STANDARD_POINTS,
  computeMeetStandings,
  computeQuadStandings,
  computeOpenResults,
} = require('./services/standings');

const {
  orderedRaces,
  currentRaceInfo,
  ensureCurrentRace,
  laneRowsForRace,
  recentClosedRaces,
  raceDisplayStage,
} = require('./services/raceDay');

const {
  fireRaceAlerts,
  fireResultAlerts,
} = require('./services/raceAlerts');

const {
  calcRegistrationCost,
  calculateRegistrationTotal,
} = require('./services/pricing');
const {
  buildCostWidget,
} = require('./services/pricingUi');
const { skaterAvatarHtml } = require('./services/avatarDisplay');
const { completedTimeTrialEvents, timeTrialResults } = require('./services/timeTrialEvents');
const {
  renderTimeTrialFinalResultsHtml,
  renderTimeTrialFinalResultsPrintHtml,
} = require('./services/timeTrialResultsView');
const {
  defaultPricingFields,
  normalizeMeetPricingFields,
} = require('./services/pricingModel');

const { esc, cap } = require('./utils/html');
const {
  pageShell,
  sponsorLineHtml,
  toggleSwitch,
  announcerBoxHtml,
  navHtml,
  meetTabs,
  raceDaySubTabs,
} = require('./utils/pageShell');
const { nowIso } = require('./utils/date');
const {
  parseCookies,
  setCookie,
  clearCookie,
} = require('./utils/cookies');
const {
  safeReadJson,
  writeJsonAtomic,
} = require('./utils/db');
const logger = require('./utils/logger');
const { asyncHandler } = require('./utils/asyncHandler');

const {
  hasRole,
  canEditMeet,
} = require('./utils/auth');

const {
  usarsAge, ageForReg,
  makeOpenGroupsTemplate, makeQuadGroupsTemplate, makeAdditionalRaceSlots, makeManualExtraRaceSlots,
  nextId, makeDivisionsTemplate, baseGroups, defaultMeet,
  normalizeDivisionSet, normalizeOpenGroups, normalizeQuadGroups, migrateMeet,
  getMeetOr404, getMeetRink, meetRinkLabel, meetDateLabel, meetDayCount,
  nextSetupPresetId, makeSetupPresetFromMeet, presetRaceSignature, restorePresetBlocksIntoMeet,
  ensureAtLeastOneBlock, combineDateTime, isRegistrationClosed,
  ageMatch, groupAgeMatch, normalizeSkaterGender, findAgeGroup, findChallengeUpGroup, challengeAdjustedGroup,
  divisionEnabledForRegistration, nextHelmetNumber, ensureRegistrationTotalsAndNumbers,
  entryLabelForRegistration, normalizeDistances, baseRaceKey, isOpenDivision,
  registrationSortKey, distributeByTeam, buildHeatRaceShell, shouldSplitIntoHeats,
  buildRaceSetForEntries, generateAdditionalRacesForMeet,
  raceBlockRestoreKey, restoreBlockAssignmentsAfterRaceSync, generateConfiguredRacesForMeet,
  isAdvancementRace, advancementFamilyKey, numericPlace, tryAdvanceTopThreeFromTwoHeats,
  pricingFieldsFromMeet, buildRegistrationPricingPreview, racingSoonLabel,
  isArchivedMeet, activeMeets, archivedMeetsForUser, cloneMeetSetup,
  applyMeetOwner,
  coachVisibleMeets, coachTeamRegistrations, coachUpcomingForMeet,
  coachRecentResultsForMeet, coachStandingsForMeet, isPublicMeet, resultsSectionHtml, quadResultsSectionHtml, raceStatusResultsHtml,
} = require('./services/meetHelpers');
const { raceStatusLabel, statusRowsForMeet } = require('./services/raceStatus');

const {
  RELAY_TEMPLATE_ROWS,
  normalizeRelayEligibleGroupIds,
  normalizeRelayAgeRange,
  normalizeRelayTemplates,
  makeRelayRace,
  relayRaceExists,
  relayOptionKeyForRace,
  relayAgeRangeForRace,
  registrationMatchesRelayAgeRange,
  relayEligibleRegistrationsForRace,
  renderRelayEligibleSkatersHtml,
} = require('./services/relayHelpers');

const { renderPortalHome } = require('./views/portalView');
const { renderPendingRinksView } = require('./views/pendingRinksView');
const { renderPendingMeetsView } = require('./views/pendingMeetsView');
const { renderArchivedMeetsView } = require('./views/archivedMeetsView');
const { renderCoachRosterView } = require('./views/coachRosterView');
const { renderStaffAccountsView } = require('./views/staffAccountsView');
const { renderCoachPortalView } = require('./views/coachPortalView');
const { renderBlockBuilderView } = require('./views/blockBuilderView');
const { renderMeetBuilderView } = require('./views/meetBuilderView');
const { renderOpenBuilderView } = require('./views/openBuilderView');
const { renderQuadBuilderView } = require('./views/quadBuilderView');
const { renderRelayBuilderView } = require('./views/relayBuilderView');
const { renderRegisteredView } = require('./views/registeredView');
const { renderCheckinView } = require('./views/checkinView');

const createPublicRoutes = require('./routes/publicRoutes');
const createAdminRoutes = require('./routes/adminRoutes');
const createBuilderRoutes = require('./routes/builderRoutes');
const createRegistrationRoutes = require('./routes/registrationRoutes');
const createRaceDayRoutes = require('./routes/raceDayRoutes');
const createSslImportRoutes = require('./routes/sslImportRoutes');
const createMobileApiRoutes = require('./routes/mobileApiRoutes');
const createStaffRoutes = require('./routes/staffRoutes');
const createTimeTrialRoutes = require('./routes/timeTrialRoutes');
const createDesktopRoutes = require('./routes/desktopRoutes');
const { renderMeetStaffList } = require('./services/staffAssignments');
const { isDesktopMeetUnlocked } = require('./services/desktopMeetPinService');
const { createBackup: createDesktopBackup } = require('./services/desktopBackupService');
const { recordDesktopState } = require('./services/desktopCrashRecoveryService');
const {
  DEFAULT_SESSION_TTL_MS,
  nextUserId,
  verifySslSsoToken,
  mirrorSslUser,
  verifySslCredentials,
  createSsmSessionForUser,
  ssmRedirectForUser,
  postSsmUserMirrorToSsl,
} = require('./services/ssoService');

function rebuildTimeTrialRace(meet) {
  const ttHelpers = require('./services/ttHelpers');
  if (!ttHelpers || typeof ttHelpers.rebuildTimeTrialRace !== 'function') return null;
  return ttHelpers.rebuildTimeTrialRace(meet);
}

function isStandaloneTimeTrialItem(item) {
  return item && String(item.type || '') === 'time_trial';
}

function timeTrialLeaderboardCard(title, rows, { tv = false } = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const rowHtml = safeRows.map((row, index) => {
    const rank = row.rank || '';
    const name = row.skater || row.skaterName || row.name || '';
    const team = row.team || '';
    const time = row.time || '';
    const rankClass = index < 3 ? ` rank-top rank-${index + 1}` : '';
    if (tv) {
      return '<div class="tt-tv-row'+rankClass+'">' +
        '<div class="tt-tv-rank">'+esc(rank)+'</div>' +
        skaterAvatarHtml(row, {}, 'small') +
        '<div class="tt-tv-person"><div class="tt-tv-name">'+esc(name)+'</div><div class="tt-tv-team">'+esc(team)+'</div></div>' +
        '<div class="tt-tv-time">'+esc(time)+'</div>' +
      '</div>';
    }
    return '<div class="tt-live-row'+rankClass+'">' +
      '<div class="tt-live-rank">'+esc(rank)+'</div>' +
      skaterAvatarHtml(row, {}, 'small') +
      '<div class="tt-live-person"><div class="tt-live-name">'+esc(name)+'</div><div class="tt-live-team">'+esc(team)+'</div></div>' +
      '<div class="tt-live-time">'+esc(time)+'</div>' +
    '</div>';
  }).join('');

  if (tv) {
    return '<div class="tt-tv-card"><div class="tt-tv-heading">'+esc(title)+'</div>' +
      (rowHtml || '<div class="tt-tv-empty">Waiting for first time...</div>') +
    '</div>';
  }

  return '<section class="tt-live-card"><div class="tt-live-card-title">'+esc(title)+'</div>' +
    (rowHtml || '<div class="tt-live-empty">Waiting for first time...</div>') +
  '</section>';
}

function timeTrialLeaderboardColumns(event, opts = {}) {
  const sourceEvent = event?.timeTrialEvent || event;
  const results = timeTrialResults(sourceEvent);
  return [
    timeTrialLeaderboardCard('Fastest Male', results.male, opts),
    timeTrialLeaderboardCard('Fastest Female', results.female, opts),
    timeTrialLeaderboardCard('Overall', results.overall, opts),
  ].join('');
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/icons', express.static(path.join(__dirname, 'public/icons')));
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/manifest.json'));
});

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const DATA_FILE = process.env.SSM_DATA_FILE || path.join(DATA_DIR, 'ssm_db.json');

const SESSION_COOKIE = 'ssm_sess';
const ADMIN_PHONE = '+13166516013';

const SESSION_TTL_MS = DEFAULT_SESSION_TTL_MS;

const ADMIN_USERNAME = 'Lbird22';
const ADMIN_PASSWORD = 'Redline22';

function ensureLeeSuperAdmin(db) {
  if (!Array.isArray(db.users)) db.users = [];
  const wantedRoles = ['super_admin', 'meet_director', 'judge', 'announcer', 'coach'];
  const matches = (db.users || []).filter(u => {
    const username = String(u.username || '').trim().toLowerCase();
    const email = String(u.email || '').trim().toLowerCase();
    return username === 'lbird22' || email === 'thegoatbird@me.com';
  });
  if (!matches.length) {
    db.users.unshift({ id: nextUserId(db), username: 'Lbird22', password: ADMIN_PASSWORD, email: 'thegoatbird@me.com', displayName: 'Lee Bird', roles: wantedRoles, team: 'Midwest Racing', active: true, createdAt: nowIso(), updatedAt: nowIso() });
    return;
  }
  for (const user of matches) {
    user.active = true; user.displayName = user.displayName || 'Lee Bird'; user.team = user.team || 'Midwest Racing'; user.email = user.email || 'thegoatbird@me.com';
    user.roles = Array.from(new Set([...(Array.isArray(user.roles) ? user.roles : []), ...wantedRoles]));
    if (String(user.username || '').trim().toLowerCase() === 'lbird22' && !user.password) user.password = ADMIN_PASSWORD;
    user.updatedAt = nowIso();
  }
}

function defaultDb() {
  return { version:19, createdAt:nowIso(), updatedAt:nowIso(), sessions:[],
    users:[{ id:1, username:ADMIN_USERNAME, password:ADMIN_PASSWORD, displayName:'Lee Bird', roles:['super_admin','meet_director','judge','coach'], team:'Midwest Racing', active:true, createdAt:nowIso() }],
    rinks:[{ id:1, name:'Roller City', city:'Wichita', state:'KS', team:'', address:'3234 S. Meridian Ave, Wichita, KS 67217', phone:'316-942-4555', website:'rollercitywichitaks.com', notes:'' }],
    meets:[], rosters:[], setupPresets:[], desktopLicenses:[],
  };
}

function sanitizeRinks(db) {
  db.rinks=(db.rinks||[]).filter(r=>String(r.name||'').trim().toLowerCase()!=='wichita skate center');
  const rc=(db.rinks||[]).find(r=>String(r.name||'').trim().toLowerCase()==='roller city');
  if(!rc) { db.rinks.unshift(defaultDb().rinks[0]); }
  else { rc.city='Wichita';rc.state='KS';rc.address='3234 S. Meridian Ave, Wichita, KS 67217';rc.phone='316-942-4555';rc.website='rollercitywichitaks.com'; }
}

const TEAM_LIST = [
  'Independent','Aurora Speed Club','Ashland Speedskating of Virginia','Badger State Racing',
  "Bell's Speed Skating Team",'Capital City Racing','Carolina Gold Rush','CC Speed','CCN Inline',
  'Central Florida Speed Team','Champions Speed Skating Team','Classic Speed Skate Club',
  'Cobras Speed Skating','CW SpeedTeam','Dairy Ashford Speed Team','DFW Speed',
  'Diamond State Racing','FAST Speed Team','Fast Forward Racing','Front Range Speed Team',
  'Frenchtown Speed Team','Good Vibes Skate Company','GT Speed','High Point Speed Skating',
  'Infinity Racing','Inside Edge Racing','JKL Racing','Kentucky Speed','Mach Racing',
  'Mean Girls Racing','Middlesex Racing Team','Midland Rockets','Midwest Racing',
  'National Speed Skating Circuit','North Coast Inline Racing','North Idaho Elite',
  'Ocala Speed Inline Racing Team','Olympic Speed','Omni Speed','Pac West Inline Racing',
  'Phantom Racing','Precision Inline','Precision Racing','Rocket City Speed',
  'Rollaire Speed Team','Roller King Speed','Simmons Racing / Simmons Rana','SobeRollers',
  'SOS Racing','Stallions Racing','Star Skate Speed','Stardust Inline Speed Skating Team',
  'Synergy Speed Skating','TCK Skate Supply','Team Oaks','Team Velocity','Team Xtreme',
  'Tennessee Speed','Triad Racing','Tulsa Surge Speed Skating','Warrior Racing',
  "Weber's Racing","Weber's Skateway",'West Michigan Wolverines Speed Team',
].sort((a, b) => a.localeCompare(b));

let desktopMigrationBackupCreated = false;

function createDesktopBackupIfActive(db, reason) {
  if (process.env.SSM_DESKTOP !== '1') return null;
  try {
    return createDesktopBackup({ db, reason });
  } catch (err) {
    console.warn(`Desktop backup skipped (${reason}):`, err.message);
    return null;
  }
}

function loadDb() {
  try {
    let db=safeReadJson(DATA_FILE);
    if(!db) { db=defaultDb(); writeJsonAtomic(DATA_FILE,db); return db; }
    if(!Array.isArray(db.users)||db.users.length===0) db.users=defaultDb().users;
    if(!db.users.some(u=>u.username===ADMIN_USERNAME)) db.users.unshift(defaultDb().users[0]);
    if(!Array.isArray(db.rinks)) db.rinks=defaultDb().rinks;
    if(!Array.isArray(db.meets)) db.meets=[];
    if(!Array.isArray(db.sessions)) db.sessions=[];
    if(!Array.isArray(db.rosters)) db.rosters=[];
    if(!Array.isArray(db.setupPresets)) db.setupPresets=[];
    if(!Array.isArray(db.desktopLicenses)) db.desktopLicenses=[];
    ensureLeeSuperAdmin(db);
    sanitizeRinks(db);
    if (!desktopMigrationBackupCreated && process.env.SSM_DESKTOP === '1') {
      desktopMigrationBackupCreated = true;
      createDesktopBackupIfActive(db, 'before_migration');
    }
    const fallbackOwnerId=(db.users[0]&&db.users[0].id)||1;
    db.meets.forEach(m=>migrateMeet(m,fallbackOwnerId));
    db.sessions=db.sessions.filter(s=>s.expiresAt&&new Date(s.expiresAt).getTime()>Date.now());
    db.version=19; db.updatedAt=nowIso(); return db;
  } catch (err) {
    logger.error('Failed to load data file', DATA_FILE, err && err.message ? err.message : err);
    throw err;
  }
}

function saveDb(db) {
  try {
    if (Array.isArray(db.meets)) db.meets.forEach(m => migrateMeet(m));
    db.version=19; db.updatedAt=nowIso(); writeJsonAtomic(DATA_FILE,db);
    if (process.env.SSM_DESKTOP === '1') {
      try { recordDesktopState(db); }
      catch (err) { console.warn('Desktop crash recovery state skipped:', err.message); }
    }
  } catch (err) {
    logger.error('Failed to save data file', DATA_FILE, err && err.message ? err.message : err);
    throw err;
  }
}

function getSessionUser(req) {
  const token=parseCookies(req)[SESSION_COOKIE]; if(!token) return null;
  const db=loadDb(); const sess=db.sessions.find(s=>s.token===token); if(!sess) return null;
  if(new Date(sess.expiresAt).getTime()<=Date.now()) return null;
  const user=db.users.find(u=>u.id===sess.userId&&u.active!==false); if(!user) return null;
  return {db,session:sess,token,user};
}

function extendSession(db,token) {
  const sess=db.sessions.find(s=>s.token===token);
  if(!sess) return false;
  const expiresAt=new Date(sess.expiresAt||0).getTime();
  const renewAfterMs=Math.min(24*60*60*1000,Math.floor(SESSION_TTL_MS/4));
  if(Number.isFinite(expiresAt)&&expiresAt-Date.now()>renewAfterMs) return false;
  sess.expiresAt=new Date(Date.now()+SESSION_TTL_MS).toISOString();
  return true;
}

function findUserByLogin(db, login) {
  const value = String(login || '').trim().toLowerCase();
  if (!value) return null;
  return (db.users || []).find(u => {
    const username = String(u.username || '').trim().toLowerCase();
    const email = String(u.email || '').trim().toLowerCase();
    return (username && username === value) || (email && email === value);
  }) || null;
}

function staffRoleOptions(selectedRoles = []) {
  const selected = new Set((selectedRoles || []).map(String));
  const roles = [
    ['meet_director', 'Meet Director'],
    ['judge', 'Judge'],
    ['announcer', 'Announcer'],
    ['coach', 'Coach'],
  ];
  return roles.map(([value, label]) =>
    `<label class="toggle-wrap"><input type="checkbox" name="roles" value="${value}" class="toggle-input" ${selected.has(value) ? 'checked' : ''}><span class="toggle-track"><span class="toggle-thumb"></span></span><span class="toggle-label">${label}</span></label>`
  ).join('');
}


function requireRole(...roles) {
  return (req,res,next)=>{
    const data=getSessionUser(req);
    if(!data) {
      if (process.env.SSM_DESKTOP === '1' && req.params && req.params.meetId) {
        const db = loadDb();
        const meet = getMeetOr404(db, req.params.meetId);
        if (meet && isDesktopMeetUnlocked(req, meet)) {
          req.db = db;
          req.user = {
            id: 'desktop-pin',
            username: 'desktop-pin',
            displayName: 'Desktop Meet PIN',
            roles: ['judge', 'announcer', 'coach'],
            desktopMeetUnlocked: true,
            desktopPinMeetId: String(meet.id || ''),
          };
          req.sessionToken = '';
          if (roles.some(role => hasRole(req.user, role))) return next();
        }
      }
      return res.redirect('/admin/login');
    }
    if(extendSession(data.db,data.token)) saveDb(data.db);
    req.db=data.db; req.user=data.user; req.sessionToken=data.token;
    if(hasRole(data.user,'super_admin')||roles.some(role=>hasRole(data.user,role))) return next();
    // A tabulator (judge role) only gets meet_director-gated routes on a meet
    // they created or were specifically assigned to tabulate — never every
    // meet in the system. canEditMeet() enforces that per-meet scoping.
    if (roles.includes('meet_director') && hasRole(data.user,'judge') && req.params && req.params.meetId) {
      const meet = getMeetOr404(data.db, req.params.meetId);
      if (meet && canEditMeet(data.user, meet)) return next();
    }
    return res.status(403).send(pageShell({title:'Forbidden',user:data.user,
      bodyHtml:`<div class="page-header"><h1>Forbidden</h1></div><div class="card"><div class="danger">You do not have access to this page.</div></div>`}));
  };
}


// ── Public routes ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const data = getSessionUser(req);
  const portalLink = data ? '/portal' : '/admin/login';

  res.send(pageShell({
    title: 'Home',
    description: 'SpeedSkateMeet is the all-in-one platform for inline speed skating meets. Registration, race building, block scheduling, live scoring, and race-day operations.',
    user: data?.user || null,
    bodyHtml: `
    <section class="home-hero">
      <img class="home-hero-bg" src="/public/images/home/hero-banner.jpg" alt="" />
      <div class="home-hero-wash"></div>

      <div class="home-hero-inner">
        <img src="/public/images/branding/ssm-logo.png" alt="SpeedSkateMeet.com" class="home-hero-logo" />

        <div class="home-hero-kicker">Inline speed skating meet software</div>
        <h1 class="home-hero-title">Run meets. Build races. Go live.</h1>
        <p class="home-hero-copy">
          Registration, race builders, manual block scheduling, live results, check-in,
          standings, and race-day tools built specifically for inline speed skating.
        </p>

        <div class="home-hero-actions">
          <a class="btn-orange home-hero-primary" href="/meets">Find a Meet</a>
          <a class="btn2 btn-white" href="/live">Live Race Day</a>
          <a class="btn2 btn-white" href="${portalLink}">${data ? 'Open Portal' : 'Login'}</a>
        </div>

        <div class="home-hero-pills">
          <span>Meet Builder</span>
          <span>Race Day</span>
          <span>Live Results</span>
          <span>Text Alerts</span>
        </div>
      </div>
    </section>

    <div class="feature-grid">
      <a class="feature-card feature-card-link" href="/live">
        <img class="feature-card-bg" src="/public/images/home/feature-card-dark.jpg" alt="" />
        <div class="feature-card-overlay"></div>
        <div class="feature-card-content">
          <div class="feature-icon-emoji">🏆</div>
          <div class="feature-title">Live Results</div>
          <div class="feature-desc">Follow along in real time. Race-by-race results and standings updated the moment a race closes.</div>
          <div class="feature-cta">Watch Live →</div>
        </div>
      </a>
      <a class="feature-card feature-card-link" href="${portalLink}">
        <img class="feature-card-bg" src="/public/images/home/feature-card-gold.jpg" alt="" />
        <div class="feature-card-overlay"></div>
        <div class="feature-card-content">
          <div class="feature-icon-emoji">📋</div>
          <div class="feature-title">Meet Management</div>
          <div class="feature-desc">Build meets from scratch with registration, race builders, manual block scheduling, check-in, and standings.</div>
          <div class="feature-cta">Go to Portal →</div>
        </div>
      </a>
      <a class="feature-card feature-card-link" href="/rinks">
        <img class="feature-card-bg" src="/public/images/home/feature-card-light.jpg" alt="" />
        <div class="feature-card-overlay"></div>
        <div class="feature-card-content">
          <div class="feature-icon-emoji">📍</div>
          <div class="feature-title">Find a Rink</div>
          <div class="feature-desc">Discover inline speed skating venues and upcoming meets near you. Addresses, contact info, and schedules all in one place.</div>
          <div class="feature-cta">Browse Rinks →</div>
        </div>
      </a>
    </div>`
  }));
});

// ── Submit a Meet (public) ────────────────────────────────────────────────────
app.get('/submit-meet', (req, res) => {
  const data=getSessionUser(req);
  const ok=req.query.ok;
  res.send(pageShell({title:'Submit Your Meet', description:'List your inline speed skating meet on SpeedSkateMeet.com for free. No account required. Reach skaters and families across the country.', user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Submit Your Meet</h1><div class="sub">List your inline speed skating meet on SpeedSkateMeet.com — free, no account required.</div></div>
    ${ok?`<div class="card" style="border-left:4px solid var(--green);margin-bottom:16px"><div class="good">✅ Your meet has been submitted! Lee will review it and reach out to you shortly.</div></div>`:`
    <div class="card">
      <form method="POST" action="/submit-meet" class="stack">
        <div class="form-grid cols-2">
          <div><label>Meet Name *</label><input name="meetName" required placeholder="Wichita Spring Classic" /></div>
          <div><label>Date *</label><input type="date" name="date" required /></div>
          <div><label>City *</label><input name="city" required placeholder="Wichita" /></div>
          <div><label>State *</label><input name="state" required placeholder="KS" maxlength="2" /></div>
          <div><label>Your Name *</label><input name="contactName" required placeholder="Bob Jones" /></div>
          <div><label>Your Email *</label><input type="email" name="contactEmail" required placeholder="bob@team.com" /></div>
          <div><label>Your Phone</label><input type="tel" name="contactPhone" placeholder="(316) 555-1234" /></div>
          <div><label>External Registration URL</label><input name="registrationUrl" placeholder="https://forms.google.com/..." /></div>
        </div>
        <div><label>Description</label><textarea name="description" placeholder="Tell skaters about your meet — venue, format, divisions, etc." rows="4"></textarea></div>
        <div><button class="btn-orange" type="submit">Submit My Meet →</button></div>
      </form>
    </div>`}`}));
});

app.post('/submit-meet', (req, res) => {
  const db=loadDb();
  const pending={
    id:'pm'+crypto.randomBytes(6).toString('hex'),
    meetName:String(req.body.meetName||'').trim(),
    date:String(req.body.date||'').trim(),
    city:String(req.body.city||'').trim(),
    state:String(req.body.state||'').trim(),
    contactName:String(req.body.contactName||'').trim(),
    contactEmail:String(req.body.contactEmail||'').trim(),
    contactPhone:String(req.body.contactPhone||'').trim(),
    registrationUrl:String(req.body.registrationUrl||'').trim(),
    description:String(req.body.description||'').trim(),
    submittedAt:nowIso(), status:'pending',
  };
  if(!pending.meetName||!pending.date||!pending.city||!pending.contactName||!pending.contactEmail)
    return res.redirect('/submit-meet');
  if(!Array.isArray(db.pendingMeets)) db.pendingMeets=[];
  if(!Array.isArray(db.pendingRinks)) db.pendingRinks=[];
  db.pendingMeets.push(pending);
  saveDb(db);
  // Text Lee
  sendSms(ADMIN_PHONE, `🏁 New meet submission!\n${pending.meetName}\n${pending.city}, ${pending.state} • ${pending.date}\n${pending.contactName} • ${pending.contactEmail}\nReview: speedskatemeet.com/portal/pending-meets`);
  res.redirect('/submit-meet?ok=1');
});

// ── Pending Meets (super admin only) ──────────────────────────────────────────
app.get('/portal/pending-meets', requireRole('super_admin'), (req, res) => {
  const pending = (req.db.pendingMeets || []).filter(p => p.status === 'pending');
  const approved = (req.db.pendingMeets || []).filter(p => p.status === 'approved').slice(-10);
  const rejected = (req.db.pendingMeets || []).filter(p => p.status === 'rejected').slice(-10);

  res.send(pageShell({
    title: 'Pending Meets',
    user: req.user,
    bodyHtml: renderPendingMeetsView({ pending, approved, rejected }),
  }));
});

app.post('/portal/pending-meets/approve', requireRole('super_admin'), (req, res) => {
  const db=req.db;
  const p=(db.pendingMeets||[]).find(x=>x.id===String(req.body.id||''));
  if(!p) return res.redirect('/portal/pending-meets');
  p.status='approved'; p.approvedAt=nowIso();
  // Create a lite meet in the meets array
  const rink=db.rinks.find(r=>String(r.city||'').toLowerCase()===p.city.toLowerCase())||db.rinks[0];
  const liteMeet={
    id:nextId(db.meets), meetName:p.meetName, leagueAssociation:p.leagueAssociation||'', league:p.leagueAssociation||'', date:p.date, isPublic:true,
    status:'published', isLiteMeet:true,
    city:p.city, state:p.state,
    rinkId:rink?rink.id:1,
    registrationUrl:p.registrationUrl||'',
    description:p.description||'',
    contactName:p.contactName, contactEmail:p.contactEmail,
    createdByUserId:1, createdAt:nowIso(), updatedAt:nowIso(),
    races:[], blocks:[], registrations:[], groups:[], textAlerts:[],
  };
  applyMeetOwner(liteMeet, db.users.find(u => Number(u.id) === 1) || 1);
  db.meets.push(liteMeet);
  saveDb(db);
  // Email submitter
  if(p.contactEmail) {
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Your Meet is Live! 🏁</h2>
      <p>Hi ${esc(p.contactName)},</p>
      <p>Your meet <strong>${esc(p.meetName)}</strong> has been approved and is now listed on SpeedSkateMeet.com!</p>
      <p><a href="https://speedskatemeet.com/meets" style="background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">View on SpeedSkateMeet →</a></p>
      <p style="margin-top:16px">Interested in full race management — heat assignments, live scoring, text alerts, TV display? Reply to this email and we'll get you set up.</p>
    `);
    sendEmail(p.contactEmail, `Your Meet is Live — ${p.meetName}`, html, `Your meet ${p.meetName} is now live on SpeedSkateMeet.com!`);
  }
  res.redirect('/portal/pending-meets');
});

app.post('/portal/pending-meets/reject', requireRole('super_admin'), (req, res) => {
  const db=req.db;
  const p=(db.pendingMeets||[]).find(x=>x.id===String(req.body.id||''));
  if(!p) return res.redirect('/portal/pending-meets');
  p.status='rejected'; p.rejectedAt=nowIso(); p.rejectReason=String(req.body.reason||'').trim();
  saveDb(db);
  if(p.contactEmail) {
    const reason=p.rejectReason||'It did not meet our listing requirements at this time.';
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Meet Submission Update</h2>
      <p>Hi ${esc(p.contactName)},</p>
      <p>Thank you for submitting <strong>${esc(p.meetName)}</strong> to SpeedSkateMeet.com.</p>
      <p>Unfortunately we were unable to approve this listing at this time: <em>${esc(reason)}</em></p>
      <p>If you have questions, reply to this email.</p>
    `);
    sendEmail(p.contactEmail, `Meet Submission Update — ${p.meetName}`, html, `Update regarding your meet submission ${p.meetName}.`);
  }
  res.redirect('/portal/pending-meets');
});



app.get('/meets', (req, res) => {
  const db=loadDb(); const data=getSessionUser(req);
  const cards=(db.meets||[]).filter(m=>isPublicMeet(m)).map(m=>{
    const rink=db.rinks.find(r=>Number(r.id)===Number(m.rinkId));
    return `
      <div class="card" style="margin-bottom:14px">
        <div class="row between">
          <div>
            <h2 style="margin:0">${esc(m.meetName)}</h2>
            <div class="muted">${esc(m.date||'Date TBD')}${m.startTime?` • ${esc(m.startTime)}`:''}</div>
            ${meetRinkLabel(db,m)?`<div class="note">${esc(meetRinkLabel(db,m))}</div>`:''}
          </div>
          <div class="row">
            <span class="chip">${(m.races||[]).length} Races</span>
            <span class="chip chip-green">${esc(m.status||'draft')}</span>
          </div>
        </div>
        ${renderMeetStaffList(m, { compact: true })}
        <div class="hr"></div>
        <div class="action-row">
          <a class="btn-orange" href="/meet/${m.id}/register">Register</a>
          <a class="btn2" href="/meet/${m.id}/live">Live</a>
          <a class="btn2" href="/meet/${m.id}/results">Results</a>
        </div>
      </div>`;
  }).join('');
  res.send(pageShell({title:'Find a Meet', description:'Find upcoming inline speed skating meets near you. View schedules, register online, and follow live results on race day.', user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Find a Meet</h1><div class="sub">Upcoming inline speed skating meets open for registration.</div></div>
    ${nationalsFeatureCardHtml()}
    <div style="margin-bottom:16px"><a class="btn2" href="/submit-meet">+ Submit Your Meet</a></div>
    ${cards||`<div class="card"><div class="muted">No public meets yet.</div></div>`}`}));
});

// ── 2026 Indoor Nationals schedule (public, read-only) ────────────────────────
const NATIONALS = require('./data/nationals2026.js');
const NATIONALS_HEATS = require('./data/nationals_heats.js');

// Featured banner shown on /meets (and the app's Meets tab) linking to the
// full schedule. Kept as a helper so it can be dropped onto other pages too.
function nationalsFeatureCardHtml() {
  return `
    <a href="/nationals" class="nats-feature">
      <div class="nats-feature-glow"></div>
      <div class="nats-feature-body">
        <div class="nats-feature-badge">🏆 National Championship</div>
        <div class="nats-feature-title">${esc(NATIONALS.title)}</div>
        <div class="nats-feature-meta">${esc(NATIONALS.location)} &nbsp;•&nbsp; ${esc(NATIONALS.dateRange)}</div>
      </div>
      <div class="nats-feature-cta">View Schedule →</div>
    </a>
    <style>
      .nats-feature{position:relative;display:flex;align-items:center;gap:16px;flex-wrap:wrap;
        text-decoration:none;color:var(--white);margin-bottom:18px;padding:20px 22px;overflow:hidden;
        background:linear-gradient(120deg,var(--navy) 0%,var(--navy3) 60%,#2f4c78 100%);
        border:1px solid rgba(56,189,248,.25);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);
        transition:transform .15s ease,box-shadow .15s ease}
      .nats-feature:hover{transform:translateY(-2px)}
      .nats-feature-glow{position:absolute;top:-40%;right:-10%;width:280px;height:280px;pointer-events:none;
        background:radial-gradient(circle,rgba(249,115,22,.35),transparent 70%)}
      .nats-feature-body{position:relative;flex:1;min-width:220px}
      .nats-feature-badge{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.08em;
        text-transform:uppercase;color:var(--sky);background:rgba(56,189,248,.12);
        border:1px solid rgba(56,189,248,.3);padding:4px 10px;border-radius:999px;margin-bottom:10px}
      .nats-feature-title{font-family:'Barlow Condensed','Inter',sans-serif;font-weight:700;
        font-size:24px;line-height:1.1;letter-spacing:.01em}
      .nats-feature-meta{color:#c7d6ea;font-size:14px;font-weight:500;margin-top:6px}
      .nats-feature-cta{position:relative;font-weight:800;font-size:15px;color:var(--navy);
        background:linear-gradient(180deg,#ffa94d,var(--orange));padding:12px 20px;border-radius:999px;
        box-shadow:0 6px 16px rgba(249,115,22,.4);white-space:nowrap}
      @media(max-width:560px){.nats-feature-cta{width:100%;text-align:center}}
    </style>`;
}

app.get('/nationals', (req, res) => {
  // ?embed=1 → bare schedule (no site nav/footer) for embedding inside the
  // native SSM app's WebView. Otherwise the full branded website page.
  const embed = !!req.query.embed;
  if (embed) {
    return res.send(nationalsEmbedShell(renderNationalsSchedule(true)));
  }
  const data = getSessionUser(req);
  res.send(pageShell({
    title: NATIONALS.title,
    description: `${NATIONALS.title} — full tentative event schedule. ${NATIONALS.location}, ${NATIONALS.dateRange}.`,
    user: data?.user || null,
    bodyHtml: renderNationalsSchedule(false),
  }));
});

app.get('/nationals/heats', (req, res) => {
  const embed = !!req.query.embed;
  if (embed) {
    return res.send(nationalsEmbedShell(renderNationalsHeats(true)));
  }
  const data = getSessionUser(req);
  res.send(pageShell({
    title: NATIONALS_HEATS.title,
    description: `${NATIONALS.title} — heat sheets and start lists by division. Search for a skater to find their heat.`,
    user: data?.user || null,
    bodyHtml: renderNationalsHeats(false),
  }));
});

// ── One-off meet import (password-protected) ───────────────────────────────
// Loads a fully-formed meet object (e.g. the reconstructed Nationals meet) into
// the live DB without shell access. Set SSM_MEET_IMPORT_KEY in the environment
// and send it as the "x-import-key" header. Fails closed if the key is unset.
app.post('/api/admin/import-meet', (req, res) => {
  const expected = String(process.env.SSM_MEET_IMPORT_KEY || '').trim();
  if (!expected) return res.status(503).json({ ok: false, error: 'Import disabled: SSM_MEET_IMPORT_KEY not set.' });
  const provided = String(req.get('x-import-key') || '').trim();
  const a = Buffer.from(provided), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized.' });
  }
  // Either import the bundled Nationals meet ({"source":"nationals"}) or a full
  // meet object posted in the body ({meet:{...}} or the raw object).
  let meet;
  if (req.body && req.body.source === 'nationals') {
    try {
      meet = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'nationals_meet.json'), 'utf8'));
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Bundled nationals meet not found.' });
    }
  } else {
    meet = (req.body && req.body.meet && typeof req.body.meet === 'object') ? req.body.meet : req.body;
  }
  if (!meet || typeof meet !== 'object' || Array.isArray(meet) || !meet.id || !meet.meetName) {
    return res.status(400).json({ ok: false, error: 'Body must be {"source":"nationals"} or a meet object with id and meetName.' });
  }
  try {
    const db = loadDb();
    db.meets = (db.meets || []).filter(m => Number(m.id) !== Number(meet.id));
    try { if (typeof migrateMeet === 'function') migrateMeet(meet, 'system'); } catch (e) { /* best effort */ }
    db.meets.push(meet);
    saveDb(db);
    return res.json({
      ok: true, id: meet.id, meetName: meet.meetName,
      races: Array.isArray(meet.races) ? meet.races.length : 0,
      registrations: Array.isArray(meet.registrations) ? meet.registrations.length : 0,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Tab bar linking the two nationals pages; preserves ?embed=1 so navigation
// stays inside the app's WebView.
function nationalsTabs(active, embed) {
  const q = embed ? '?embed=1' : '';
  const tab = (key, label, href) =>
    `<a class="nats-tab${active === key ? ' active' : ''}" href="${href}${q}">${label}</a>`;
  return `
    <div class="nats-tabs">
      ${tab('schedule', 'Schedule', '/nationals')}
      ${tab('heats', 'Heat Sheets', '/nationals/heats')}
    </div>
    <style>
      .nats-tabs{display:flex;gap:8px;margin-bottom:16px}
      .nats-tab{flex:1;text-align:center;font-weight:800;font-size:14px;text-decoration:none;
        color:var(--text);background:var(--card);border:1px solid var(--border2);
        padding:11px 12px;border-radius:999px;transition:all .12s}
      .nats-tab.active{background:var(--navy);color:var(--white);border-color:var(--navy)}
    </style>`;
}

// Minimal standalone shell (no website chrome) so the schedule can be embedded
// inside the native app's WebView. Redefines the same design tokens the
// schedule CSS relies on (normally provided by pageShell's :root).
function nationalsEmbedShell(inner) {
  return `<!doctype html><html lang="en"><head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet"/>
  <style>
    :root{--navy:#13213a;--navy2:#1b2c4a;--navy3:#263c61;--orange:#F97316;--orange2:#ea580c;
      --green:#10b981;
      --sky:#38BDF8;--sky2:#0ea5e9;--white:#ffffff;--page:#e8edf3;--panel:#f3f6f9;--card:#f8fafc;
      --border:rgba(19,33,58,.10);--border2:rgba(19,33,58,.16);--text:#24324a;--muted:#667085;
      --shadow-sm:0 1px 2px rgba(19,33,58,.05);--shadow:0 4px 14px rgba(19,33,58,.07);
      --shadow-lg:0 10px 30px rgba(19,33,58,.10);--radius-sm:8px;--radius:14px;--radius-lg:20px}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:'Inter',ui-sans-serif,system-ui,sans-serif;background:var(--page);color:var(--text);
      padding:14px;padding-top:max(14px,env(safe-area-inset-top));
      padding-bottom:max(24px,env(safe-area-inset-bottom))}
    /* In embed mode the sticky day-nav should stick to the top of the webview. */
    .ns-daynav{top:0}
  </style></head><body>${inner}</body></html>`;
}

function renderNationalsSchedule(embed = false) {
  const dayId = i => `day-${i}`;
  const dayShort = date => {
    const m = String(date).match(/^(\w+)\s+([\d/]+)/);
    return m ? `${m[1].slice(0,3)} ${m[2].replace(/\/26$/,'')}` : esc(date);
  };

  const dayNav = NATIONALS.days.map((d,i)=>
    `<a class="ns-pill" href="#${dayId(i)}">${esc(dayShort(d.date))}</a>`).join('');

  const daysHtml = NATIONALS.days.map((d,i)=>{
    // Walk items, buffering consecutive events into one table.
    let out = '';
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      out += `
        <div class="ns-table-wrap">
          <table class="ns-table">
            <thead><tr><th>#</th><th>Division</th><th>Distance</th><th>Format</th><th>To Qualify</th></tr></thead>
            <tbody>${buf.map(e=>`
              <tr>
                <td class="ns-num">${esc(e.num)||'—'}</td>
                <td class="ns-div">${esc(e.division)}</td>
                <td>${esc(e.distance)}</td>
                <td class="ns-muted">${esc(e.format)||'—'}</td>
                <td>${e.qualify?`<span class="ns-qual">${esc(e.qualify)}</span>`:'—'}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>`;
      buf = [];
    };
    d.items.forEach(it=>{
      if (it.t==='event'){ buf.push(it); return; }
      flush();
      if (it.t==='head') out += `<div class="ns-head">${esc(it.text)}</div>`;
      else if (it.t==='time') out += `<div class="ns-agenda"><span class="ns-time">${esc(it.time)}</span><span class="ns-agenda-text">${esc(it.text)}</span></div>`;
      else if (it.t==='note') out += `<div class="ns-note">${esc(it.text)}</div>`;
    });
    flush();
    return `
      <section class="ns-day" id="${dayId(i)}">
        <div class="ns-day-header"><span class="ns-day-date">${esc(d.date)}</span></div>
        <div class="ns-day-body">${out}</div>
      </section>`;
  }).join('');

  return `
    <div class="ns-hero">
      <div class="ns-hero-org">${esc(NATIONALS.org)}</div>
      <h1 class="ns-hero-title">${esc(NATIONALS.title)}</h1>
      <div class="ns-hero-meta">${esc(NATIONALS.location)} &nbsp;•&nbsp; ${esc(NATIONALS.dateRange)}</div>
      ${NATIONALS.tentative?`<div class="ns-tentative">⚠︎ Tentative schedule — subject to change based on final entries</div>`:''}
    </div>
    ${nationalsTabs('schedule', embed)}
    <div class="ns-daynav">${dayNav}</div>
    ${daysHtml}
    <div class="ns-footer">Schedule provided by ${esc(NATIONALS.org)}. Times are approximate and subject to change.</div>
    <style>
      .ns-hero{background:linear-gradient(135deg,var(--navy),var(--navy3));color:var(--white);
        border-radius:var(--radius-lg);padding:28px 24px;text-align:center;box-shadow:var(--shadow-lg);margin-bottom:18px}
      .ns-hero-org{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--sky);margin-bottom:8px}
      .ns-hero-title{font-family:'Barlow Condensed','Inter',sans-serif;font-weight:700;font-size:32px;line-height:1.08;margin:0;color:var(--white)}
      .ns-hero-meta{color:#c7d6ea;font-size:15px;font-weight:500;margin-top:8px}
      .ns-tentative{display:inline-block;margin-top:14px;font-size:12.5px;font-weight:700;color:#ffd9a8;
        background:rgba(249,115,22,.14);border:1px solid rgba(249,115,22,.35);padding:6px 14px;border-radius:999px}
      .ns-daynav{position:sticky;top:0;z-index:20;display:flex;gap:8px;overflow-x:auto;padding:12px 2px;
        margin-bottom:14px;background:var(--page);-webkit-overflow-scrolling:touch}
      .ns-pill{flex:0 0 auto;font-size:13px;font-weight:700;color:var(--text);text-decoration:none;
        background:var(--card);border:1px solid var(--border2);padding:8px 14px;border-radius:999px;white-space:nowrap;transition:all .12s}
      .ns-pill:hover{background:var(--navy);color:var(--white);border-color:var(--navy)}
      .ns-day{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
        box-shadow:var(--shadow-sm);margin-bottom:18px;overflow:hidden;scroll-margin-top:64px}
      .ns-day-header{background:linear-gradient(90deg,var(--navy),var(--navy2));padding:14px 20px}
      .ns-day-date{font-family:'Barlow Condensed','Inter',sans-serif;font-weight:700;font-size:22px;color:var(--white);letter-spacing:.02em}
      .ns-day-body{padding:16px 18px}
      .ns-head{font-weight:800;font-size:15px;color:var(--navy);margin:18px 0 8px;padding-left:12px;
        border-left:4px solid var(--orange);line-height:1.3}
      .ns-head:first-child{margin-top:0}
      .ns-agenda{display:flex;gap:12px;align-items:baseline;padding:5px 0;border-bottom:1px dashed var(--border)}
      .ns-time{flex:0 0 78px;font-weight:800;font-size:13px;color:var(--sky2);font-variant-numeric:tabular-nums}
      .ns-agenda-text{color:var(--text);font-size:14px}
      .ns-note{color:var(--muted);font-size:13px;font-style:italic;padding:4px 0}
      .ns-table-wrap{overflow-x:auto;margin:8px 0 6px;border:1px solid var(--border);border-radius:var(--radius-sm)}
      .ns-table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:520px}
      .ns-table th{background:var(--panel);color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;
        letter-spacing:.04em;text-align:left;padding:9px 12px;border-bottom:1px solid var(--border2)}
      .ns-table td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
      .ns-table tr:last-child td{border-bottom:none}
      .ns-table tbody tr:hover{background:rgba(56,189,248,.06)}
      .ns-num{font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums;white-space:nowrap}
      .ns-div{font-weight:700;color:var(--text)}
      .ns-muted{color:var(--muted)}
      .ns-qual{display:inline-block;font-size:12px;font-weight:700;color:var(--navy);
        background:rgba(56,189,248,.14);border:1px solid rgba(56,189,248,.3);padding:2px 9px;border-radius:999px;white-space:nowrap}
      .ns-footer{text-align:center;color:var(--muted);font-size:12.5px;margin:8px 0 24px}
      @media(max-width:560px){.ns-hero-title{font-size:26px}.ns-time{flex-basis:66px}}
    </style>`;
}

function renderNationalsHeats(embed = false) {
  const daysHtml = (NATIONALS_HEATS.days || []).map(day => `
    <section class="hs-day">
      <div class="hs-day-head">${esc(day.date)}</div>
      ${(day.sessions || []).map(sess => `
        <div class="hs-session">
          ${sess.label ? `<div class="hs-session-label">${esc(sess.label)}</div>` : ''}
          ${(sess.events || []).map(ev => {
            const posted = (ev.rounds || []).length > 0;
            return `
            <div class="hs-event"${posted ? '' : ' data-empty="1"'}>
              <div class="hs-event-head">
                ${ev.num ? `<span class="hs-num">#${esc(ev.num)}</span>` : ''}
                <span class="hs-ev-div">${esc(ev.division)}</span>
                <span class="hs-ev-dist">${esc(ev.distance)}</span>
                ${ev.format ? `<span class="hs-ev-fmt">${esc(ev.format)}</span>` : ''}
              </div>
              <div class="hs-event-body">
                ${posted ? ev.rounds.map(rd => `
                  <div class="hs-round${rd.results ? ' hs-round-results' : ''}">
                    <div class="hs-round-label">${esc(rd.label)}${rd.results ? ` · <span class="hs-final-badge">✓ Final Results</span>` : ''}${rd.toQualify ? ` · <span class="hs-qual">${esc(rd.toQualify)} to qualify</span>` : ''}</div>
                    ${(rd.skaters || []).map(s => `
                      <div class="hs-skater${s.scratched ? ' hs-scratched' : ''}${s.place ? ' hs-placed' : ''}${s.place === '1' ? ' hs-win' : ''}" data-s="${esc((s.name + ' ' + s.team + ' ' + s.helmet).toLowerCase())}">
                        ${rd.results ? `<span class="hs-place">${s.place ? esc(s.place) : '–'}</span>` : ''}
                        <span class="hs-helmet">#${esc(s.helmet)}</span>
                        <span class="hs-name">${esc(s.name)}</span>
                        <span class="hs-team">${esc(s.team)}</span>
                        ${s.time ? `<span class="hs-time">${esc(s.time)}</span>` : ''}
                      </div>`).join('')}
                  </div>`).join('') : `<div class="hs-notposted">Lineups not posted yet</div>`}
              </div>
            </div>`;
          }).join('')}
        </div>`).join('')}
    </section>`).join('');

  return `
    <div class="nh-hero">
      <div class="nh-hero-eyebrow">2026 INDOOR NATIONALS</div>
      <h1 class="nh-hero-title">Heat Sheets</h1>
      <div class="nh-hero-meta">${esc(NATIONALS_HEATS.subtitle || '')}</div>
      ${NATIONALS_HEATS.tentative ? `<div class="nh-tentative">⚠︎ Tentative — subject to change based on final entries</div>` : ''}
    </div>
    ${nationalsTabs('heats', embed)}
    <input id="nh-search" class="nh-search" type="search" autocomplete="off" placeholder="🔍  Search your name to find your heat…" />
    <div id="nh-empty" class="nh-empty" hidden>No skaters match “<span></span>”.</div>
    ${daysHtml}
    <div class="nh-footer">Heat assignments from the official USARS sheets, in running order. Tentative and subject to change.</div>
    <style>
      .nh-hero{background:linear-gradient(135deg,var(--navy),var(--navy3));color:var(--white);
        border-radius:var(--radius-lg);padding:24px 22px;text-align:center;box-shadow:var(--shadow-lg);margin-bottom:16px}
      .nh-hero-eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;color:var(--sky);margin-bottom:6px}
      .nh-hero-title{font-family:'Barlow Condensed','Inter',sans-serif;font-weight:700;font-size:30px;line-height:1.05;color:var(--white)}
      .nh-hero-meta{color:#c7d6ea;font-size:14px;font-weight:500;margin-top:6px}
      .nh-tentative{display:inline-block;margin-top:12px;font-size:12px;font-weight:700;color:#ffd9a8;
        background:rgba(249,115,22,.14);border:1px solid rgba(249,115,22,.35);padding:5px 12px;border-radius:999px}
      .nh-search{width:100%;font-size:16px;font-weight:600;color:var(--text);background:var(--card);
        border:1px solid var(--border2);border-radius:999px;padding:13px 18px;margin-bottom:16px;
        position:sticky;top:0;z-index:30;box-shadow:var(--shadow-sm);-webkit-appearance:none}
      .nh-search:focus{outline:none;border-color:var(--sky)}
      .nh-empty{text-align:center;color:var(--muted);font-weight:600;padding:22px 0}
      .nh-footer{text-align:center;color:var(--muted);font-size:12.5px;margin:16px 0 24px}
      .hs-day{margin-bottom:20px}
      .hs-day-head{position:sticky;top:56px;z-index:15;font-family:'Barlow Condensed','Inter',sans-serif;
        font-weight:700;font-size:22px;color:#fff;background:linear-gradient(90deg,var(--navy),var(--navy2));
        padding:12px 18px;border-radius:var(--radius);box-shadow:var(--shadow-sm);margin-bottom:12px}
      .hs-session-label{font-weight:800;font-size:14px;color:var(--navy);padding-left:12px;
        border-left:4px solid var(--orange);margin:16px 0 10px}
      .hs-event{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
        box-shadow:var(--shadow-sm);padding:12px 14px;margin-bottom:10px}
      .hs-event-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin-bottom:2px}
      .hs-num{font-weight:800;color:var(--sky2);font-size:12px;font-variant-numeric:tabular-nums;
        background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.3);padding:2px 8px;border-radius:999px}
      .hs-ev-div{font-weight:800;color:var(--navy);font-size:16px}
      .hs-ev-dist{color:var(--text);font-weight:600;font-size:14px}
      .hs-ev-fmt{color:var(--muted);font-size:12px;font-weight:600}
      .hs-round{margin:8px 0 6px}
      .hs-round-label{font-weight:700;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}
      .hs-qual{color:var(--sky2);text-transform:none;letter-spacing:0}
      .hs-skater{display:flex;gap:10px;align-items:baseline;padding:3px 0}
      .hs-helmet{flex:0 0 46px;font-weight:800;color:var(--navy);font-size:13px;font-variant-numeric:tabular-nums}
      .hs-name{font-weight:700;color:var(--text);font-size:14px}
      .hs-team{color:var(--muted);font-size:13px}
      .hs-scratched{opacity:.5}.hs-scratched .hs-name{text-decoration:line-through}
      .hs-notposted{color:var(--muted);font-style:italic;font-size:13px;padding:2px 0}
      /* Final results (green) */
      .hs-round-results .hs-round-label{color:var(--green)}
      .hs-final-badge{color:var(--green);font-weight:800;text-transform:none;letter-spacing:0}
      .hs-place{flex:0 0 24px;text-align:center;font-weight:800;font-size:12px;color:var(--green);
        background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.34);border-radius:6px;
        padding:1px 0;font-variant-numeric:tabular-nums}
      .hs-time{margin-left:auto;flex:0 0 auto;font-weight:700;font-size:13px;color:var(--green);
        font-variant-numeric:tabular-nums;padding-left:8px}
      .hs-win .hs-place{background:var(--green);color:#fff;border-color:var(--green)}
      .hs-win .hs-name{color:var(--green);font-weight:800}
    </style>
    <script>
      (function(){
        var q=document.getElementById('nh-search'), empty=document.getElementById('nh-empty');
        if(!q) return;
        function apply(){
          var term=q.value.trim().toLowerCase(), any=false;
          document.querySelectorAll('.hs-day').forEach(function(day){
            var dv=false;
            day.querySelectorAll('.hs-session').forEach(function(se){
              var sv=false;
              se.querySelectorAll('.hs-event').forEach(function(ev){
                var evVis=false;
                if(ev.getAttribute('data-empty')==='1'){
                  evVis=!term;
                } else {
                  ev.querySelectorAll('.hs-round').forEach(function(r){
                    var rv=false;
                    r.querySelectorAll('.hs-skater').forEach(function(s){
                      var m=!term||s.getAttribute('data-s').indexOf(term)!==-1;
                      s.hidden=!m; if(m) rv=true;
                    });
                    r.hidden=!rv; if(rv) evVis=true;
                  });
                }
                ev.hidden=!evVis; if(evVis) sv=true;
              });
              se.hidden=!sv; if(sv) dv=true;
            });
            day.hidden=!dv; if(dv) any=true;
          });
          if(empty){ empty.hidden=!(term&&!any); var sp=empty.querySelector('span'); if(sp) sp.textContent=q.value; }
        }
        q.addEventListener('input', apply);
      })();
    </script>`;
}


// ── Submit a Rink (public) ────────────────────────────────────────────────────
app.get('/submit-rink', (req, res) => {
  const data=getSessionUser(req);
  const ok=req.query.ok;
  res.send(pageShell({title:'Submit a Rink', description:'Add your inline speed skating rink or venue to the SpeedSkateMeet directory. Free listing, no account required.', user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Submit a Rink</h1><div class="sub">Add your inline speed skating venue to SpeedSkateMeet.com — free, no account required.</div></div>
    ${ok?`<div class="card" style="border-left:4px solid var(--green);margin-bottom:16px"><div class="good">✅ Your rink has been submitted! Lee will review it and add it to the directory shortly.</div></div>`:`
    <div class="card">
      <form method="POST" action="/submit-rink" class="stack">
        <div class="form-grid cols-2">
          <div><label>Rink Name *</label><input name="name" required placeholder="Roller King Skating Center" /></div>
          <div><label>Track Length</label><input name="trackLength" placeholder="e.g. 100m" /></div>
          <div><label>Address *</label><input name="address" required placeholder="123 Main St" /></div>
          <div><label>City *</label><input name="city" required placeholder="Wichita" /></div>
          <div><label>State *</label><input name="state" required placeholder="KS" maxlength="2" /></div>
          <div><label>Zip</label><input name="zip" placeholder="67201" /></div>
          <div><label>Phone</label><input type="tel" name="phone" placeholder="(316) 555-1234" /></div>
          <div><label>Website</label><input name="website" placeholder="rollerking.com" /></div>
          <div><label>Your Name *</label><input name="contactName" required placeholder="Bob Jones" /></div>
          <div><label>Your Email *</label><input type="email" name="contactEmail" required placeholder="bob@rink.com" /></div>
        </div>
        <div><label>Notes (surface type, parking, directions, etc.)</label><textarea name="notes" rows="3" placeholder="Smooth concrete floor, 200 car parking lot, exit 42 off I-35..."></textarea></div>
        <div><button class="btn-orange" type="submit">Submit Rink →</button></div>
      </form>
    </div>`}`}));
});

app.post('/submit-rink', (req, res) => {
  const db=loadDb();
  const pending={
    id:'pr'+crypto.randomBytes(6).toString('hex'),
    name:String(req.body.name||'').trim(),
    address:String(req.body.address||'').trim(),
    city:String(req.body.city||'').trim(),
    state:String(req.body.state||'').trim(),
    zip:String(req.body.zip||'').trim(),
    phone:String(req.body.phone||'').trim(),
    website:String(req.body.website||'').trim(),
    trackLength:String(req.body.trackLength||'').trim(),
    notes:String(req.body.notes||'').trim(),
    contactName:String(req.body.contactName||'').trim(),
    contactEmail:String(req.body.contactEmail||'').trim(),
    submittedAt:nowIso(), status:'pending',
  };
  if(!pending.name||!pending.address||!pending.city||!pending.contactName||!pending.contactEmail)
    return res.redirect('/submit-rink');
  if(!Array.isArray(db.pendingRinks)) db.pendingRinks=[];
  db.pendingRinks.push(pending);
  saveDb(db);
  sendSms(ADMIN_PHONE, `🏟️ New rink submission!\n${pending.name}\n${pending.city}, ${pending.state}\n${pending.contactName} • ${pending.contactEmail}\nReview: speedskatemeet.com/portal/pending-rinks`);
  res.redirect('/submit-rink?ok=1');
});

// ── Pending Rinks (super admin only) ─────────────────────────────────────────
app.get('/portal/pending-rinks', requireRole('super_admin'), (req, res) => {
  const db=req.db;
  const cutoff=Date.now() - (1000*60*60*24*3);

  // Rejected rink submissions are throwaway moderation junk. Approved submissions
  // stay visible for 3 days as confirmation, then disappear from this queue.
  db.pendingRinks=(db.pendingRinks||[]).filter(p=>{
    const status=String(p.status||'pending');
    if(status==='rejected') return false;
    if(status==='approved') {
      const t=new Date(p.approvedAt||p.createdAt||0).getTime();
      return Number.isFinite(t) && t>=cutoff;
    }
    return true;
  });
  saveDb(db);

  const pending=(db.pendingRinks||[]).filter(p=>p.status==='pending');
  const approved=(db.pendingRinks||[]).filter(p=>p.status==='approved').slice(-10);

  res.send(pageShell({
    title:'Pending Rinks',
    user:req.user,
    bodyHtml:renderPendingRinksView({ pending, approved }),
  }));
});

app.post('/portal/pending-rinks/approve', requireRole('super_admin'), (req, res) => {
  const db=req.db;
  const p=(db.pendingRinks||[]).find(x=>x.id===String(req.body.id||''));
  if(!p) return res.redirect('/portal/pending-rinks');
  p.status='approved'; p.approvedAt=nowIso();
  if(!Array.isArray(db.rinks)) db.rinks=[];
  db.rinks.push({
    id:nextId(db.rinks), name:p.name, address:p.address,
    city:p.city, state:p.state, zip:p.zip||'',
    phone:p.phone||'', website:p.website||'',
    trackLength:p.trackLength||'', notes:p.notes||'',
  });
  sanitizeRinks(db);
  saveDb(db);
  if(p.contactEmail) {
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Your Rink is Listed! 🏟️</h2>
      <p>Hi ${esc(p.contactName)},</p>
      <p><strong>${esc(p.name)}</strong> has been approved and is now listed in the SpeedSkateMeet rink directory!</p>
      <p><a href="https://speedskatemeet.com/rinks" style="background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">View on SpeedSkateMeet →</a></p>
    `);
    sendEmail(p.contactEmail, `Your Rink is Listed — ${p.name}`, html, `${p.name} is now listed on SpeedSkateMeet.com!`);
  }
  res.redirect('/portal/pending-rinks');
});

app.post('/portal/pending-rinks/reject', requireRole('super_admin'), (req, res) => {
  const db=req.db;
  const id=String(req.body.id||'');
  const p=(db.pendingRinks||[]).find(x=>x.id===id);
  if(!p) return res.redirect('/portal/pending-rinks');
  const rejectReason=String(req.body.reason||'').trim();
  if(p.contactEmail) {
    const reason=rejectReason||'It did not meet our listing requirements at this time.';
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Rink Submission Update</h2>
      <p>Hi ${esc(p.contactName)},</p>
      <p>Thank you for submitting <strong>${esc(p.name)}</strong> to SpeedSkateMeet.com.</p>
      <p>Unfortunately we were unable to approve this listing: <em>${esc(reason)}</em></p>
      <p>If you have questions, reply to this email.</p>
    `);
    sendEmail(p.contactEmail, `Rink Submission Update — ${p.name}`, html, `Update regarding your rink submission ${p.name}.`);
  }
  // Rejected rink submissions are deleted immediately so the moderation queue stays clean.
  db.pendingRinks=(db.pendingRinks||[]).filter(x=>x.id!==id);
  saveDb(db);
  res.redirect('/portal/pending-rinks');
});

app.get('/rinks', (req, res) => {
  const db=loadDb(); const data=getSessionUser(req);
  // Group rinks by state
  const sorted=[...db.rinks].sort((a,b)=>{
    const sc=String(a.state||'').localeCompare(String(b.state||''));
    if(sc!==0) return sc;
    return String(a.name||'').localeCompare(String(b.name||''));
  });
  const byState={};
  for(const r of sorted) {
    const s=String(r.state||'Other').toUpperCase();
    if(!byState[s]) byState[s]=[];
    byState[s].push(r);
  }
  const stateNames={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
  const stateLinks=Object.keys(byState).map(s=>`<a href="#state-${s}" style="text-decoration:none"><span class="chip" style="cursor:pointer">${s}</span></a>`).join('');
  const sections=Object.entries(byState).map(([state,rinks])=>`
    <div id="state-${state}" style="margin-bottom:28px">
      <h2 style="margin-bottom:12px;color:var(--navy);border-bottom:2px solid var(--border);padding-bottom:8px">
        ${esc(stateNames[state]||state)} <span style="font-size:16px;color:var(--muted);font-weight:400">(${rinks.length} rink${rinks.length!==1?'s':''})</span>
      </h2>
      ${rinks.map(r=>`
        <div class="card" style="margin-bottom:10px">
          <div class="row between">
            <div>
              <div style="font-weight:700;font-size:16px">📍 ${esc(r.name)}</div>
              <div class="muted" style="font-size:13px">${esc(r.address||'')} • ${esc(r.city||'')}, ${esc(r.state||'')}${r.zip?' '+esc(r.zip):''}</div>
              <div class="note">
                ${r.phone?esc(r.phone):''}
                ${r.phone&&r.website?' • ':''}
                ${r.website?`<a href="https://${esc(r.website)}" target="_blank" rel="noreferrer" style="color:var(--orange)">${esc(r.website)}</a>`:''}
                ${r.trackLength?`<span style="margin-left:8px" class="chip">${esc(r.trackLength)}</span>`:''}
              </div>
            </div>
            ${data?.user&&(hasRole(data.user,'super_admin')||hasRole(data.user,'meet_director'))?`<a class="btn2 btn-sm" href="/portal/rinks">Edit</a>`:''}
          </div>
        </div>`).join('')}
    </div>`).join('');
  res.send(pageShell({title:'Rinks', description:'Inline speed skating venues and rinks across the United States. Find a rink near you or submit your venue to the SpeedSkateMeet directory.', user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Rinks</h1><div class="sub">Inline speed skating venues across the country.</div></div>
    <div class="row between" style="margin-bottom:16px">
      <div class="row" style="flex-wrap:wrap;gap:6px">${stateLinks}</div>
      <a class="btn2" href="/submit-rink">+ Submit a Rink</a>
    </div>
    ${sections||'<div class="card"><div class="muted">No rinks listed yet. Be the first to submit one!</div></div>'}`}));
});

app.get('/live', (req, res) => {
  const db=loadDb(); const data=getSessionUser(req);
  const cards=(db.meets||[]).filter(m=>isPublicMeet(m)).map(m=>{
    const rink=db.rinks.find(r=>Number(r.id)===Number(m.rinkId));
    return `
      <div class="card" style="margin-bottom:14px">
        <h2>${esc(m.meetName)}</h2>
        <div class="muted">${esc(meetRinkLabel(db,m)||'')}</div>
        <div class="hr"></div>
        <div class="action-row">
          <a class="btn-orange" href="/meet/${m.id}/live">Open Live Board</a>
          <a class="btn2" href="/meet/${m.id}/results">Results</a>
        </div>
      </div>`;
  }).join('');
  res.send(pageShell({title:'Live Race Day',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Live Race Day</h1><div class="sub">Follow along in real-time.</div></div>
    ${cards||`<div class="card"><div class="muted">No live meets right now.</div></div>`}`}));
});

// ── Auth ──────────────────────────────────────────────────────────────────────


// ── Password Reset ────────────────────────────────────────────────────────────
app.get('/admin/forgot-password', (req, res) => {
  const sent=req.query.sent;
  res.send(pageShell({title:'Forgot Password',user:null, bodyHtml:`
    <div style="max-width:400px;margin:40px auto">
      <div class="page-header"><h1>Forgot Password</h1></div>
      <div class="card">
        ${sent?`<div class="good" style="margin-bottom:14px">✅ If that email is in our system, a reset link is on its way.</div><a class="btn2" href="/admin/login">Back to Login</a>`:`
        <form method="POST" action="/admin/forgot-password" class="stack">
          <div><label>Your Email Address</label><input type="email" name="email" required placeholder="LBird@speedskatemeet.com" /></div>
          <button class="btn" type="submit" style="width:100%">Send Reset Link</button>
          <a href="/admin/login" style="text-align:center;font-size:13px;color:var(--muted)">Back to login</a>
        </form>`}
      </div>
    </div>`}));
});

app.post('/admin/forgot-password', (req, res) => {
  const db=loadDb();
  const email=String(req.body.email||'').trim().toLowerCase();
  const user=db.users.find(u=>String(u.email||'').trim().toLowerCase()===email&&u.active!==false);
  if(user) {
    const token=crypto.randomBytes(24).toString('hex');
    const expires=new Date(Date.now()+1000*60*60).toISOString(); // 1 hour
    if(!db.passwordResets) db.passwordResets=[];
    db.passwordResets=db.passwordResets.filter(r=>r.userId!==user.id&&new Date(r.expires).getTime()>Date.now());
    db.passwordResets.push({token,userId:user.id,expires});
    saveDb(db);
    const resetUrl=`https://speedskatemeet.com/admin/reset-password?token=${token}`;
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Password Reset Request</h2>
      <p>Hi ${esc(user.displayName||user.username)},</p>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${resetUrl}" style="background:#F97316;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700">Reset My Password</a>
      </p>
      <p style="font-size:12px;color:#64748b">If you didn't request this, ignore this email. Your password won't change.</p>
    `);
    sendEmail(email, 'Password Reset — SpeedSkateMeet', html, `Reset your password: ${resetUrl}`);
  }
  res.redirect('/admin/forgot-password?sent=1');
});

app.get('/admin/reset-password', (req, res) => {
  const token=String(req.query.token||'');
  const db=loadDb();
  const reset=(db.passwordResets||[]).find(r=>r.token===token&&new Date(r.expires).getTime()>Date.now());
  if(!reset) return res.send(pageShell({title:'Reset Password',user:null, bodyHtml:`
    <div style="max-width:400px;margin:40px auto">
      <div class="page-header"><h1>Reset Password</h1></div>
      <div class="card"><div class="danger">This reset link has expired or is invalid. <a href="/admin/forgot-password">Request a new one</a>.</div></div>
    </div>`}));
  res.send(pageShell({title:'Reset Password',user:null, bodyHtml:`
    <div style="max-width:400px;margin:40px auto">
      <div class="page-header"><h1>Reset Password</h1></div>
      <div class="card">
        <form method="POST" action="/admin/reset-password" class="stack">
          <input type="hidden" name="token" value="${esc(token)}" />
          <div><label>New Password</label><input type="password" name="password" required minlength="6" /></div>
          <div><label>Confirm Password</label><input type="password" name="confirm" required minlength="6" /></div>
          <button class="btn" type="submit" style="width:100%">Set New Password</button>
        </form>
      </div>
    </div>`}));
});

app.post('/admin/reset-password', (req, res) => {
  const db=loadDb();
  const token=String(req.body.token||'');
  const password=String(req.body.password||'').trim();
  const confirm=String(req.body.confirm||'').trim();
  const reset=(db.passwordResets||[]).find(r=>r.token===token&&new Date(r.expires).getTime()>Date.now());
  if(!reset||password!==confirm||password.length<6) return res.redirect(`/admin/reset-password?token=${token}&err=1`);
  const user=db.users.find(u=>u.id===reset.userId);
  if(!user) return res.redirect('/admin/forgot-password');
  user.password=password;
  db.passwordResets=(db.passwordResets||[]).filter(r=>r.token!==token);
  saveDb(db);
  res.redirect('/admin/login?reset=1');
});


async function handleSslSsoCallback(req, res) {
  let payload;
  try {
    payload = verifySslSsoToken(req.query.token || '');
  } catch (err) {
    return res.status(403).send(pageShell({ title: 'SSO Login Failed', user: null, bodyHtml: `
      <div style="max-width:520px;margin:40px auto">
        <div class="page-header"><h1>SpeedSkateMeet Access</h1></div>
        <div class="card">
          <div class="danger" style="margin-bottom:14px">${esc(err.message || 'Could not verify SpeedSkateLeague login.')}</div>
          <a class="btn2" href="/admin/login">Go to SSM Login</a>
        </div>
      </div>` }));
  }

  const db = loadDb();
  const user = mirrorSslUser(db, payload);

  const sessionToken = createSsmSessionForUser(db, user);
  saveDb(db);
  try {
    const mirrorResult = await postSsmUserMirrorToSsl(user);
    if (mirrorResult?.skipped) {
      user.sslMirrorSyncStatus = 'skipped';
      user.sslMirrorSyncError = mirrorResult.reason || 'Skipped by SSL mirror receiver.';
      user.sslMirrorSyncResponse = { skipped: true, reason: mirrorResult.reason || '' };
    } else {
      user.sslMirrorSyncStatus = mirrorResult?.user?.ssl_user_id || mirrorResult?.user?.ssl_skater_id ? 'ok_linked' : 'ok_unlinked';
      user.sslMirrorSyncedAt = nowIso();
      user.sslMirrorSyncError = '';
      user.sslMirrorSyncResponse = mirrorResult?.user?.id ? { id: mirrorResult.user.id } : { ok: true };
    }
  } catch (err) {
    user.sslMirrorSyncStatus = 'failed';
    user.sslMirrorSyncAttemptedAt = nowIso();
    user.sslMirrorSyncError = String(err.message || err);
    console.warn('SSL user mirror sync failed:', err.message);
  }
  setCookie(res, SESSION_COOKIE, sessionToken, Math.floor(SESSION_TTL_MS / 1000));
  saveDb(db);
  return res.redirect(ssmRedirectForUser(user));
}

app.get('/sso/ssl/callback', asyncHandler(handleSslSsoCallback));
app.get('/ssl-sso', asyncHandler(handleSslSsoCallback));

async function syncSsmUserMirrorBestEffort(db, user, label) {
  try {
    const mirrorResult = await postSsmUserMirrorToSsl(user);
    if (mirrorResult?.skipped) {
      user.sslMirrorSyncStatus = 'skipped';
      user.sslMirrorSyncError = mirrorResult.reason || 'Skipped by SSL mirror receiver.';
      user.sslMirrorSyncResponse = { skipped: true, reason: mirrorResult.reason || '' };
    } else {
      user.sslMirrorSyncStatus = mirrorResult?.user?.ssl_user_id || mirrorResult?.user?.ssl_skater_id ? 'ok_linked' : 'ok_unlinked';
      user.sslMirrorSyncedAt = nowIso();
      user.sslMirrorSyncError = '';
      user.sslMirrorSyncResponse = mirrorResult?.user?.id ? { id: mirrorResult.user.id } : { ok: true };
    }
  } catch (err) {
    user.sslMirrorSyncStatus = 'failed';
    user.sslMirrorSyncAttemptedAt = nowIso();
    user.sslMirrorSyncError = String(err.message || err);
    console.warn(`SSL user mirror sync failed (${label}):`, err.message);
  }
  saveDb(db);
}

app.get('/account/pending', (req, res) => {
  const data=getSessionUser(req);
  res.send(pageShell({title:'Account Pending',user:data?.user||null, bodyHtml:`
    <div style="max-width:620px;margin:40px auto">
      <div class="page-header"><h1>Account Pending</h1><div class="sub">Your SpeedSkateMeet staff account was created.</div></div>
      <div class="card">
        <p style="line-height:1.7;margin-top:0">An admin still needs to assign your SSM role before you can access the portal.</p>
        <div class="muted">Available roles: Meet Director, Judge, Announcer, Coach.</div>
        <div class="hr"></div>
        <a class="btn2" href="/admin/logout">Logout</a>
      </div>
    </div>`}));
});

function sslAccountUrl() {
  const sslBaseUrl = String(process.env.SSL_BASE_URL || 'https://speedskateleague.com').replace(/\/+$/, '');
  return `${sslBaseUrl}/login?source=ssm`;
}

function ssmSignupExplanationCard() {
  return `
    <div class="card">
      <h2 style="margin-top:0">Create Your SpeedSkateLeague Account</h2>
      <p style="line-height:1.7;margin-top:0">
        SpeedSkateMeet now uses SpeedSkateLeague accounts for identity, roles, SSL IDs, teams, profile photos, and future results history.
      </p>
      <p style="line-height:1.7">
        You’ll create your SpeedSkateLeague profile first, then return to SpeedSkateMeet.
      </p>
      <a class="btn-orange" href="${esc(sslAccountUrl())}" style="display:block;text-align:center;text-decoration:none">Continue To SpeedSkateLeague Signup</a>
    </div>`;
}

app.get('/admin/login', (req, res) => {
  const reset=req.query.reset;
  res.send(pageShell({title:'Staff Login',user:null, bodyHtml:`
    <div style="max-width:860px;margin:40px auto">
      <div class="page-header"><h1>SpeedSkateMeet Staff Access</h1><div class="sub">For Meet Directors, Judges, Announcers, and Coaches.</div></div>
      ${reset?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Password updated! Sign in with your new password.</div></div>':''}
      <div class="form-grid cols-2">
        <div class="card">
          <h2 style="margin-top:0">Sign In</h2>
          <form method="POST" action="/admin/login" class="stack">
            <div><label>Email</label><input type="email" name="email" autocomplete="email" required /></div>
            <div><label>Password</label><input name="password" type="password" autocomplete="current-password" required /></div>
            <button class="btn" type="submit" style="width:100%">Sign In</button>
            <a href="/admin/forgot-password" style="text-align:center;font-size:13px;color:var(--muted);display:block;margin-top:8px">Forgot password?</a>
          </form>
        </div>
        ${ssmSignupExplanationCard()}
      </div>
    </div>`}));
});

app.get('/signup', (req, res) => {
  res.send(pageShell({title:'Create Account',user:null, bodyHtml:`
    <div style="max-width:620px;margin:40px auto">
      <div class="page-header"><h1>SpeedSkateMeet Signup</h1><div class="sub">Create your SpeedSkateLeague profile first.</div></div>
      ${ssmSignupExplanationCard()}
      <div style="margin-top:16px"><a class="btn2" href="/admin/login">Back to SSM Login</a></div>
    </div>`}));
});

app.post('/admin/login', asyncHandler(async (req, res) => {
  const db=loadDb();
  const email=String(req.body.email||req.body.username||'').trim();
  const password=String(req.body.password||'').trim();

  // SSL is the system of record for accounts now (signup already redirects
  // there). Try the SSL email/password first; if that account doesn't exist
  // or SSL is unreachable, fall back to a legacy local SSM account so
  // accounts that predate SSL (or were never linked) keep working.
  let user = null;
  const sslProfile = await verifySslCredentials(email, password);
  if (sslProfile) {
    user = mirrorSslUser(db, sslProfile);
  } else {
    const localUser = findUserByLogin(db, email);
    if (localUser && String(localUser.password||'')===password && localUser.active!==false) user = localUser;
  }

  if(!user) return res.send(pageShell({title:'Login',user:null, bodyHtml:`
    <div style="max-width:420px;margin:40px auto">
      <div class="page-header"><h1>Login</h1></div>
      <div class="card">
        <div class="danger" style="margin-bottom:14px">Invalid email or password.</div>
        <a class="btn2" href="/admin/login">Try again</a>
      </div>
    </div>`}));
  const token=createSsmSessionForUser(db,user);
  saveDb(db); setCookie(res,SESSION_COOKIE,token,Math.floor(SESSION_TTL_MS/1000));
  return res.redirect(ssmRedirectForUser(user));
}));

app.post('/admin/register', asyncHandler(async (req, res) => {
  res.status(403).send(pageShell({title:'Create Account',user:null, bodyHtml:`
    <div style="max-width:620px;margin:40px auto">
      <div class="page-header"><h1>Create Your SpeedSkateLeague Account</h1></div>
      ${ssmSignupExplanationCard()}
      <div class="card" style="border-left:4px solid var(--amber);margin-top:16px">
        <div class="danger">Direct SpeedSkateMeet account creation is closed. Please create your SpeedSkateLeague profile first.</div>
      </div>
    </div>`}));
}));

app.get('/admin/logout', (req, res) => {
  const db=loadDb(); const token=parseCookies(req)[SESSION_COOKIE];
  db.sessions=db.sessions.filter(s=>s.token!==token);
  saveDb(db); clearCookie(res,SESSION_COOKIE); res.redirect('/');
});


// ── Meet Picker (judges + announcers) ─────────────────────────────────────────
app.get('/portal/meet-picker', requireRole('judge','announcer','meet_director','super_admin'), (req, res) => {
  const db=loadDb();
  const isJudge=hasRole(req.user,'judge');
  const isAnnouncer=hasRole(req.user,'announcer');
  const role=isJudge?'judge':'announcer';
  const target=isJudge?'judges':'announcer';
  // Show published + live meets only
  const meets=activeMeets(db.meets).filter(m=>m.isPublic&&m.status!=='draft'&&m.status!=='complete');
  const cards=meets.map(meet=>{
    const rink=db.rinks.find(r=>Number(r.id)===Number(meet.rinkId));
    const info=currentRaceInfo(meet);
    const isLive=meet.status==='live'||(info.current&&info.current.status==='open');
    return `<div class="card" style="margin-bottom:14px;border-left:4px solid ${isLive?'var(--orange)':'var(--border2)'}">
      <div class="row between center">
        <div>
          <h2 style="margin:0">${esc(meet.meetName)}</h2>
          <div class="muted">${esc(meetRinkLabel(req.db,meet)||'')} • ${esc(meetDateLabel(meet)||'')}</div>
          ${isLive?'<span class="chip chip-orange" style="margin-top:6px">🔴 Live Now</span>':''}
        </div>
        <a class="btn-orange" href="/portal/meet/${meet.id}/race-day/${target}">Enter ${isJudge?'Judges Panel':'Announcer View'}</a>
      </div>
    </div>`;
  }).join('');
  res.send(pageShell({title:isJudge?'Judge — Select Meet':'Announcer — Select Meet',user:req.user, bodyHtml:`
    <div class="page-header">
      <h1>${isJudge?'⚖️ Judge Portal':'📢 Announcer Portal'}</h1>
      <div class="sub">Welcome, ${esc(req.user.displayName||req.user.username)}. Select your meet.</div>
    </div>
    ${meets.length?cards:`<div class="card"><div class="muted">No active meets right now.</div></div>`}
    <div style="margin-top:24px"><a class="btn2" href="/admin/logout">Logout</a></div>`}));
});

// ── Portal Home ───────────────────────────────────────────────────────────────

app.get('/portal', requireRole('meet_director','judge','coach'), (req, res) => {
  const visibleMeets = coachVisibleMeets(req.db, req.user);
  res.send(pageShell({
    title: 'Portal',
    user: req.user,
    bodyHtml: renderPortalHome({
      db: req.db,
      user: req.user,
      visibleMeets,
    }),
  }));
});

// ── Coach Portal ──────────────────────────────────────────────────────────────


// ── Coach Roster ──────────────────────────────────────────────────────────────
app.get('/portal/coach/roster', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const db = loadDb();
  const teamKey = String(req.user.team || '').trim().toLowerCase();
  const roster = (db.rosters || []).filter(r => String(r.team || '').trim().toLowerCase() === teamKey);

  res.send(pageShell({
    title: 'Team Roster',
    user: req.user,
    bodyHtml: renderCoachRosterView({
      user: req.user,
      roster,
      ok: req.query.ok || '',
      err: req.query.err || '',
    }),
  }));
});

app.post('/portal/coach/roster/add', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const db=loadDb();
  const name=String(req.body.name||'').trim();
  const birthdate=String(req.body.birthdate||'').trim();
  const gender=normalizeSkaterGender(req.body.gender)||'female';
  if(!name||!birthdate) return res.redirect('/portal/coach/roster?err='+encodeURIComponent('Name and birthdate required'));
  if(!Array.isArray(db.rosters)) db.rosters=[];
  db.rosters.push({
    id:'rs'+crypto.randomBytes(6).toString('hex'),
    name, birthdate, gender,
    team:String(req.user.team||'').trim(),
    createdByUserId:req.user.id,
    createdAt:nowIso(),
  });
  saveDb(db);
  res.redirect('/portal/coach/roster?ok='+encodeURIComponent(name+' added to roster'));
});

app.post('/portal/coach/roster/delete', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const db=loadDb();
  const skaterId=String(req.body.skaterId||'');
  const skater=(db.rosters||[]).find(r=>r.id===skaterId);
  if(!skater) return res.redirect('/portal/coach/roster');
  db.rosters=(db.rosters||[]).filter(r=>r.id!==skaterId);
  saveDb(db);
  res.redirect('/portal/coach/roster?ok='+encodeURIComponent(skater.name+' removed from roster'));
});

app.get('/portal/coach', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const meets = coachVisibleMeets(req.db, req.user);
  const meetCards = meets.map(meet => ({
    meet,
    upcoming: coachUpcomingForMeet(meet, req.user.team),
    regs: coachTeamRegistrations(meet, req.user.team),
  }));

  res.send(pageShell({
    title: 'Coach Portal',
    user: req.user,
    bodyHtml: renderCoachPortalView({ user: req.user, meetCards }),
  }));
});

app.get('/portal/meet/:meetId/coach', requireRole('coach','meet_director','super_admin'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const team=String(req.user.team||'').trim();
  const regs=coachTeamRegistrations(meet,team);
  const upcoming=coachUpcomingForMeet(meet,team);
  const recent=coachRecentResultsForMeet(meet,team);
  const standings=coachStandingsForMeet(meet,team);
  const info=currentRaceInfo(meet);

  // Build upcoming race cards with lane numbers
  const upcomingCards=upcoming.map(item=>{
    const delta=item.delta;
    const statusLabel=racingSoonLabel(delta);
    const statusColor=delta===0?'var(--orange)':delta===1?'var(--red)':delta===2?'var(--yellow)':'var(--muted)';
    const skaterLines=item.skaters.map(s=>{
      const laneStr=item.race.isOpenRace||item.race.isTimeTrial?'':(s.lane?`Lane ${esc(s.lane)}`:'Lane TBD');
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-weight:700;font-size:16px">${esc(s.skaterName)}</div>
        ${s.helmetNumber?`<span class="chip">#${esc(s.helmetNumber)}</span>`:''}
        ${laneStr?`<span class="chip chip-sky">${laneStr}</span>`:''}
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:10px;border-left:4px solid ${statusColor}">
      <div class="row between center" style="margin-bottom:8px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--navy)">${esc(item.race.groupLabel)}</div>
          <div class="note">${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)} • ${esc(raceDisplayStage(item.race))}</div>
        </div>
        <div style="font-family:Barlow Condensed,sans-serif;font-size:18px;font-weight:700;color:${statusColor}">${statusLabel}</div>
      </div>
      ${skaterLines}
    </div>`;
  }).join('');

  // Build recent results cards
  const recentCards=recent.map(item=>{
    const rows=item.skaters.filter(s=>s.place||s.status).sort((a,b)=>Number(a.place||99)-Number(b.place||99)).map(s=>{
      const place=Number(s.place); const pts=!s.status&&item.race.countsForOverall&&!item.race.isOpenRace&&!item.race.isTimeTrial?STANDARD_POINTS[place]:null;
      const medal=s.status?raceStatusLabel(s.status):(place===1?'🥇':place===2?'🥈':place===3?'🥉':`${place}th`);
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:22px">${medal}</div>
        <div style="font-weight:700;font-size:15px;flex:1">${esc(s.skaterName||'')}</div>
        ${s.time?`<div style="font-family:Barlow Condensed,sans-serif;font-size:18px;font-weight:700;color:var(--sky2)">${esc(s.time)}</div>`:''}
        ${pts?`<div class="chip chip-green">+${pts}pts</div>`:''}
      </div>`;
    }).join('');
    return `<div class="card" style="margin-bottom:10px;border-left:4px solid var(--green)">
      <div style="font-weight:700;font-size:15px;color:var(--navy)">${esc(item.race.groupLabel)} • ${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)}</div>
      ${rows||`<div class="muted note">No placed results yet.</div>`}
    </div>`;
  }).join('');

  // Roster table with lane info per race
  const rosterRows=regs.map(reg=>{
    const assignedRaces=orderedRaces(meet).filter(r=>(r.laneEntries||[]).some(le=>Number(le.registrationId)===Number(reg.id)));
    const age=ageForReg(reg,meet);
    const raceDetails=assignedRaces.slice(0,3).map(r=>{
      const entry=(r.laneEntries||[]).find(le=>Number(le.registrationId)===Number(reg.id));
      const laneStr=r.isOpenRace||r.isTimeTrial?'Open':(entry?.lane?`L${entry.lane}`:'TBD');
      return `<div class="note">${esc(cap(r.division))} ${esc(r.distanceLabel)} <span class="chip chip-sky" style="font-size:10px;padding:2px 6px">${laneStr}</span></div>`;
    }).join('');
    return `<tr>
      <td><strong>${esc(reg.name)}</strong>${sponsorLineHtml(reg.sponsor||'')}</td>
      <td>${esc(reg.divisionGroupLabel||'')}<div class="note">Age ${age}</div></td>
      <td>${reg.helmetNumber?`<strong>#${esc(reg.helmetNumber)}</strong>`:''}</td>
      <td>${reg.checkedIn?`<span class="good">✔ In</span>`:`<span class="muted">—</span>`}</td>
      <td>${raceDetails||`<span class="muted">None</span>`}</td>
    </tr>`;
  }).join('');

  res.send(pageShell({title:'Coach Panel',user:req.user,meet, bodyHtml:`
    <div class="page-header">
      <h1>Coach Panel</h1>
      <div class="sub">${esc(meet.meetName)} • ${esc(team)}</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between center">
        <div class="row">
          <span class="chip chip-${info.current?'orange':'sky'}">
            ${info.current?`▶ ${esc(info.current.groupLabel)} — ${esc(cap(info.current.division))}`:'No race running'}
          </span>
          ${info.next?`<span class="chip">Up next: ${esc(info.next.groupLabel)}</span>`:''}
        </div>
        <a class="btn2 btn-sm" href="/portal/coach">← Coach Portal</a>
      </div>
    </div>
    <div class="grid-2" style="margin-bottom:16px">
      <div>
        <h2 style="margin-bottom:12px">🏁 Your Team Racing Soon</h2>
        ${upcomingCards||`<div class="card"><div class="muted">No upcoming races for ${esc(team)} yet.</div></div>`}
      </div>
      <div>
        <h2 style="margin-bottom:12px">✅ Recent Results</h2>
        ${recentCards||`<div class="card"><div class="muted">No results yet.</div></div>`}
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <h2 style="margin-bottom:12px">Team Roster</h2>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Skater</th><th>Division</th><th>Helmet</th><th>Status</th><th>Races & Lanes</th></tr></thead>
          <tbody>${rosterRows||`<tr><td colspan="5" class="muted">No team skaters registered.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    ${standings.length?`<h2 style="margin-bottom:12px">📊 Team Standings</h2>${standings.map(section=>resultsSectionHtml(section,meet)).join('<div class="spacer"></div>')}
    `:''}
    <script>setTimeout(()=>location.reload(),8000);</script>`}));
});


// ── Archived Meets ────────────────────────────────────────────────────────────


// ── Meet Builder ──────────────────────────────────────────────────────────────

// ── Public Registration ───────────────────────────────────────────────────────






// ── TV Display ────────────────────────────────────────────────────────────────
app.get('/meet/:meetId/tv', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!meet) return res.redirect('/meets');
  rebuildTimeTrialRace(meet);
  const info=currentRaceInfo(meet);
  const current=info.current;
  const lanes=current?laneRowsForRace(current,meet):[];
  const tvRegMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));
  const recent=recentClosedRaces(meet,4);
  const lastRace=recent[0];
  const lastResults=lastRace?(lastRace.laneEntries||[]).filter(x=>x.place||x.status).sort((a,b)=>Number(a.place||999)-Number(b.place||999)).slice(0,4):[];
  const isStandaloneTT = isStandaloneTimeTrialItem(current);
  const isTT=!!(current&&current.isTimeTrial);
  const ttSorted=isTT?[...(current.laneEntries||[])].sort((a,b)=>parseFloat(a.time||'999')-parseFloat(b.time||'999')):[];

  const lanesHtml = lanes.filter(l=>l.skaterName).map(l=>{
    const reg=tvRegMap.get(Number(l.registrationId));
    return (
    '<div class="tv-lane">' +
    '<div class="tv-lane-num">'+l.lane+'</div>' +
    '<div class="tv-helmet">'+(l.helmetNumber?'#'+esc(l.helmetNumber):'')+'</div>' +
    skaterAvatarHtml(l, reg, 'small') +
    '<div style="flex:1"><div class="tv-skater-name">'+esc(l.skaterName)+'</div><div class="tv-team">'+esc(l.team||'')+'</div></div>' +
    '</div>');
  }).join('') || '<div style="opacity:.4;font-size:24px;margin-top:20px">No skaters entered yet</div>';

  const ttTop3Html = ttSorted.slice(0,3).map((e,i)=>
    '<div class="tv-podium-row" style="padding:10px 14px">' +
    '<div class="tv-podium-medal" style="font-size:28px">'+(['🥇','🥈','🥉'][i])+'</div>' +
    '<div style="flex:1"><div class="tv-next-name" style="font-size:26px">'+esc(e.skaterName)+'</div>' +
    '<div style="font-size:13px;color:rgba(255,255,255,.5)">'+esc(e.team||'')+'</div></div>' +
    '<div style="font-family:Inter,sans-serif;font-size:28px;font-weight:800;color:#38BDF8">'+esc(e.time)+'</div>' +
    '</div>'
  ).join('') || '<div style="opacity:.4;font-size:16px">No times yet</div>';

  const lastResultHtml = lastResults.map(e=>
    '<div class="tv-footer-place">' +
    '<span class="tv-footer-medal">'+(e.status?esc(raceStatusLabel(e.status)):(e.place==='1'?'🥇':e.place==='2'?'🥈':e.place==='3'?'🥉':esc(e.place)+'.'))+'</span>' +
    '<span class="tv-footer-name">'+esc(e.skaterName||'')+'</span>' +
    (e.time?'<span style="color:#38BDF8;font-weight:700">'+esc(e.time)+'</span>':'') +
    '</div>'
  ).join('');


  const recentResultsSidebarHtml = recent.length ?
    '<div class="tv-sidebar-section tv-recent-results-section">' +
    '<div class="tv-sidebar-label">Recent Results</div>' +
    recent.slice(0,3).map(race => {
      const podium = (race.laneEntries || [])
        .filter(x => x.place || x.status)
        .sort((a,b) => Number(a.place || 999) - Number(b.place || 999))
        .slice(0,3);
      const podiumHtml = podium.map(e =>
        '<div class="tv-recent-podium-row">' +
        '<span class="tv-recent-medal">'+(e.status?esc(raceStatusLabel(e.status)):(String(e.place)==='1'?'🥇':String(e.place)==='2'?'🥈':String(e.place)==='3'?'🥉':esc(e.place)+'.'))+'</span>' +
        '<span class="tv-recent-name">'+esc(e.skaterName || '')+'</span>' +
        '</div>'
      ).join('') || '<div class="tv-recent-empty">No places yet</div>';
      return '<div class="tv-recent-race">' +
        '<div class="tv-recent-race-title">'+esc(race.groupLabel || '')+'</div>' +
        '<div class="tv-recent-race-meta">'+esc(cap(race.division || ''))+' • '+esc(race.distanceLabel || '')+'</div>' +
        '<div class="tv-recent-podium">'+podiumHtml+'</div>' +
      '</div>';
    }).join('') +
    '</div>'
    : '';

  let ttBoards = { overallFemale: [], overallMale: [], byGroup: [], overall: [] };
  if(isTT) {
    try {
      ttBoards = timeTrialLeaderboards(meet, current) || ttBoards;
      ttBoards.overallFemale = Array.isArray(ttBoards.overallFemale) ? ttBoards.overallFemale : [];
      ttBoards.overallMale = Array.isArray(ttBoards.overallMale) ? ttBoards.overallMale : [];
      ttBoards.byGroup = Array.isArray(ttBoards.byGroup) ? ttBoards.byGroup : [];
      ttBoards.overall = Array.isArray(ttBoards.overall) ? ttBoards.overall : [];
    } catch (err) {
      console.error('TV time trial leaderboard error:', err);
    }
  }
  const ttBoardRowsHtml = rows => (Array.isArray(rows)?rows:[]).slice(0,3).map((e,i)=>
    '<div class="tv-podium-row" style="padding:8px 10px;gap:10px">' +
    '<div class="tv-podium-medal" style="font-size:22px">'+(['🥇','🥈','🥉'][i]||String(i+1))+'</div>' +
    '<div style="flex:1"><div class="tv-next-name" style="font-size:21px">'+esc(e.skaterName||'')+'</div>' +
    '<div style="font-size:12px;color:rgba(255,255,255,.5)">'+esc(e.team||'')+'</div></div>' +
    '<div style="font-family:Inter,sans-serif;font-size:22px;font-weight:800;color:#38BDF8">'+esc(e.time||'')+'</div>' +
    '</div>'
  ).join('') || '<div style="opacity:.4;font-size:14px">No times yet</div>';

  const ttGroupBoardsHtml = isTT ? ttBoards.byGroup.slice(0,4).map(section =>
    '<div class="tv-sidebar-section"><div class="tv-sidebar-label">'+esc(section?.group?.label || 'Group')+' Top 3</div><div class="tv-podium" style="gap:6px">'+ttBoardRowsHtml(section?.rows || [])+'</div></div>'
  ).join('') : '';

  const sidebarHtml = isTT ?
    '<div class="tv-sidebar-section"><div class="tv-sidebar-label">Overall Girls/Women</div><div class="tv-podium" style="gap:6px">'+ttBoardRowsHtml(ttBoards.overallFemale)+'</div></div>' +
    '<div class="tv-sidebar-section"><div class="tv-sidebar-label">Overall Boys/Men</div><div class="tv-podium" style="gap:6px">'+ttBoardRowsHtml(ttBoards.overallMale)+'</div></div>' +
    ttGroupBoardsHtml
    :
    (info.next ? '<div class="tv-sidebar-section"><div class="tv-sidebar-label">In Staging</div><div class="tv-next-name">'+esc(info.next.groupLabel)+'</div><div class="tv-next-meta">'+esc(cap(info.next.division))+' • '+esc(info.next.distanceLabel)+'</div></div>' : '') +
    (info.coming.length ? '<div class="tv-sidebar-section"><div class="tv-sidebar-label">Coming Up</div>' +
      info.coming.slice(0,4).map(r=>'<div class="tv-coming-item">'+esc(r.groupLabel)+' — '+esc(cap(r.division))+' • '+esc(r.distanceLabel)+'</div>').join('') +
      '</div>' : '') +
    recentResultsSidebarHtml;

  const currentLabel = isTT ? '⏱ TIME TRIAL — NOW RUNNING' : '▶ NOW RACING';
  const currentMeta = isTT ? '100m • 1 Lap • Youngest to Oldest' : esc(cap(current&&current.division||''))+' • '+esc(current&&current.distanceLabel||'')+' • '+(current?esc(cap(current.startType)):'')+ ' Start';

  let mainHtml = !current ?
    '<div class="tv-current" style="grid-column:1/-1;align-items:center;justify-content:center;display:flex;flex-direction:column;gap:16px;opacity:.4"><img src="/public/images/branding/ssm-logo.png" style="height:120px"/><div style="font-family:Inter,sans-serif;font-size:48px;font-weight:800;letter-spacing:2px">STAND BY</div></div>'
    :
    '<div class="tv-current">' +
      '<div><div class="tv-now-label">'+currentLabel+'</div>' +
      '<div class="tv-race-title">'+esc(current.groupLabel)+'</div>' +
      '<div class="tv-race-meta">'+currentMeta+'</div></div>' +
      '<div class="tv-lanes">' + (isTT ?
        (ttSorted.length===0 ? '<div style="font-size:28px;opacity:.5;margin-top:20px">Waiting for first time...</div>' : '') :
        lanesHtml) +
      '</div>' +
    '</div>' +
    '<div class="tv-sidebar">'+sidebarHtml+'</div>';

  if (isStandaloneTT && current) {
    const distanceLabel = current.distanceLabel || current.timeTrialEvent?.distance || '100m';
    mainHtml = '<div class="tt-tv-board">' +
      '<div class="tt-tv-event-header"><div><div class="tt-tv-kicker">Live Leaderboard</div><div class="tt-tv-event-title">Time Trials</div></div><div class="tt-tv-distance">Distance: '+esc(distanceLabel)+'</div></div>' +
      timeTrialLeaderboardColumns(current, { tv: true }) +
    '</div>';
  }

  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<meta name="apple-mobile-web-app-capable" content="yes"/>' +
    '<meta name="apple-mobile-web-app-status-bar-style" content="default"/>' +
    '<meta name="apple-mobile-web-app-title" content="SpeedSkateMeet"/>' +
    '<meta name="theme-color" content="#12284b"/>' +
    '<title>TV — '+esc(meet.meetName)+'</title>' +
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>' +
    '<link rel="icon" href="/icons/apple-touch-icon.png"/>' +
    '<link rel="manifest" href="/manifest.json"/>' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>' +
    '<style>' +
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}' +
    'html,body{width:100%;height:100%;overflow:hidden;background:#0F1F3D;color:#fff;font-family:Inter,sans-serif;}' +
    '.tv-wrap{display:grid;grid-template-rows:auto 1fr auto;height:100vh;}' +
    '.tv-header{background:#0a1628;border-bottom:3px solid #F97316;padding:12px 32px;display:flex;align-items:center;justify-content:space-between;}' +
    '.tv-logo{height:48px;width:auto;}' +
    '.tv-meet-name{font-family:Inter,sans-serif;font-size:28px;font-weight:700;color:#fff;}' +
    '.tv-progress{font-size:16px;color:rgba(255,255,255,.6);text-align:right;}' +
    '.tv-race-num{font-family:Inter,sans-serif;font-size:22px;font-weight:700;color:#F97316;}' +
    '.tv-main{display:grid;grid-template-columns:1.4fr .6fr;overflow:hidden;}' +
    '.tv-current{background:#162847;padding:32px 40px;display:flex;flex-direction:column;gap:16px;}' +
    '.tv-now-label{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#F97316;}' +
    '.tv-race-title{font-family:Inter,sans-serif;font-size:48px;font-weight:800;letter-spacing:-.01em;line-height:1.08;color:#fff;}' +
    '.tv-race-meta{font-size:22px;color:rgba(255,255,255,.75);font-weight:500;}' +
    '.tv-lanes{display:flex;flex-direction:column;gap:8px;margin-top:8px;flex:1;}' +
    '.tv-lane{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.07);border-radius:10px;padding:14px 20px;}' +
    '.tv-lane-num{font-family:Inter,sans-serif;font-size:24px;font-weight:700;color:#38BDF8;width:36px;text-align:center;flex-shrink:0;}' +
    '.tv-helmet{font-family:Inter,sans-serif;font-size:22px;font-weight:600;color:#F97316;width:64px;flex-shrink:0;}' +
    '.tv-skater-name{font-family:Inter,sans-serif;font-size:32px;font-weight:700;letter-spacing:-.005em;}' +
    '.tv-team{font-size:16px;color:rgba(255,255,255,.6);}' +
    '.tv-sidebar{background:#0a1628;padding:24px;display:flex;flex-direction:column;gap:16px;overflow:hidden;}' +
    '.tv-sidebar-section{background:rgba(255,255,255,.05);border-radius:12px;padding:16px;}' +
    '.tv-sidebar-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#38BDF8;margin-bottom:8px;}' +
    '.tv-next-name{font-family:Inter,sans-serif;font-size:25px;font-weight:700;line-height:1.2;}' +
    '.tv-next-meta{font-size:14px;color:rgba(255,255,255,.65);margin-top:4px;}' +
    '.tv-coming-item{font-size:15px;color:rgba(255,255,255,.75);padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08);}' +
    '.tv-coming-item:last-child{border:none;}' +
    '.tv-recent-results-section{flex:1;min-height:0;overflow:hidden;}' +
    '.tv-recent-race{padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);}' +
    '.tv-recent-race:last-child{border-bottom:none;padding-bottom:0;}' +
    '.tv-recent-race-title{font-family:Inter,sans-serif;font-size:22px;font-weight:700;line-height:1.2;color:#fff;}' +
    '.tv-recent-race-meta{font-size:13px;color:rgba(255,255,255,.58);margin-top:2px;margin-bottom:7px;}' +
    '.tv-recent-podium{display:flex;flex-direction:column;gap:5px;}' +
    '.tv-recent-podium-row{display:flex;align-items:center;gap:8px;font-size:17px;}' +
    '.tv-recent-medal{min-width:28px;width:auto;font-size:19px;white-space:nowrap;}' +
    '.tv-recent-name{font-weight:800;color:rgba(255,255,255,.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.tv-recent-empty{font-size:14px;opacity:.45;}' +
    '.tv-podium{display:flex;flex-direction:column;gap:8px;}' +
    '.tv-podium-row{display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.07);border-radius:10px;padding:12px 16px;}' +
    '.tv-footer{background:#0a1628;border-top:2px solid rgba(255,255,255,.10);padding:10px 32px;display:flex;align-items:center;gap:24px;}' +
    '.tv-footer-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.5);white-space:nowrap;}' +
    '.tv-footer-race{font-size:14px;font-weight:700;color:rgba(255,255,255,.75);white-space:nowrap;}' +
    '.tv-footer-results{display:flex;gap:20px;flex:1;flex-wrap:wrap;}' +
    '.tv-footer-place{display:flex;align-items:center;gap:8px;font-size:16px;}' +
    '.tv-footer-medal{font-size:20px;}' +
    '.tv-footer-name{font-weight:700;}' +
    '.staff-avatar{width:46px;height:46px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;background:#0f1f3d;color:#fff;border:2px solid rgba(255,255,255,.22);font-weight:900;font-size:16px;}' +
    '.staff-avatar.small{width:46px;height:46px;font-size:16px;}' +
    '.staff-avatar img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.tt-tv-board{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:auto 1fr;gap:22px;padding:26px 28px;background:#162847;overflow:hidden;}' +
    '.tt-tv-event-header{grid-column:1/-1;display:flex;align-items:end;justify-content:space-between;gap:24px;padding-bottom:2px;}' +
    '.tt-tv-kicker{font-size:15px;text-transform:uppercase;letter-spacing:.18em;font-weight:900;color:#7dd3fc;}' +
    '.tt-tv-event-title{font-family:Inter,sans-serif;font-size:54px;font-weight:800;letter-spacing:-.01em;line-height:1.05;color:#fff;}' +
    '.tt-tv-distance{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);border-radius:999px;padding:12px 18px;font-size:22px;font-weight:700;color:#fff;}' +
    '.tt-tv-card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:10px;min-width:0;box-shadow:0 18px 40px rgba(0,0,0,.18);}' +
    '.tt-tv-heading{font-family:Inter,sans-serif;font-size:38px;font-weight:800;color:#fff;border-bottom:3px solid rgba(56,189,248,.58);padding-bottom:9px;margin-bottom:4px;}' +
    '.tt-tv-row{display:grid;grid-template-columns:52px auto minmax(0,1fr) 112px;align-items:center;gap:14px;background:rgba(255,255,255,.075);border-radius:10px;padding:12px 14px;min-width:0;border:1px solid rgba(255,255,255,.06);}' +
    '.tt-tv-row.rank-top{background:rgba(255,255,255,.11);}' +
    '.tt-tv-row.rank-1{background:linear-gradient(90deg,rgba(249,115,22,.24),rgba(255,255,255,.09));border-color:rgba(249,115,22,.35);}' +
    '.tt-tv-rank{font-family:Inter,sans-serif;font-size:32px;font-weight:700;color:#38BDF8;text-align:center;}' +
    '.tt-tv-person{min-width:0;}' +
    '.tt-tv-name{font-family:Inter,sans-serif;font-size:30px;font-weight:700;line-height:1.2;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.tt-tv-team{font-size:16px;color:rgba(255,255,255,.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;}' +
    '.tt-tv-time{font-family:Inter,sans-serif;font-size:38px;font-weight:700;color:#38BDF8;text-align:right;}' +
    '.tt-tv-empty{font-size:28px;color:rgba(255,255,255,.52);padding:28px 0;font-weight:800;}' +
    '@media(max-width:1180px){.tt-tv-board{grid-template-columns:repeat(2,minmax(0,1fr));overflow:auto}.tt-tv-card:last-child{grid-column:1/-1}.tt-tv-event-title{font-size:52px}}' +
    '@media(max-width:760px){html,body{overflow:auto}.tt-tv-board{grid-template-columns:1fr}.tt-tv-card:last-child{grid-column:auto}.tt-tv-event-header{align-items:flex-start;flex-direction:column}.tt-tv-event-title{font-size:44px}.tt-tv-row{grid-template-columns:44px auto minmax(0,1fr)}.tt-tv-time{grid-column:3;font-size:36px;text-align:left}.tt-tv-name{font-size:30px}}' +
    '</style></head><body>' +
    '<div class="tv-wrap">' +
    '<div class="tv-header">' +
    '<img src="/public/images/branding/ssm-logo.png" class="tv-logo" alt="SSM"/>' +
    '<div class="tv-meet-name">'+esc(meet.meetName)+'</div>' +
    '<div class="tv-progress">' +
    (current?(isStandaloneTT?'<div class="tv-race-num">LIVE LEADERBOARD</div>':'<div class="tv-race-num">RACE '+Math.max(info.idx+1,1)+' OF '+info.ordered.length+'</div>'):'') +
    '<div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:2px">'+(meet.date||'')+'</div>' +
    '</div></div>' +
    '<div class="tv-main">'+mainHtml+'</div>' +
    (isStandaloneTT ? '' : '<div class="tv-footer">' +
    '<div class="tv-footer-label">Last Result</div>' +
    (lastRace ?
      '<div class="tv-footer-race">'+esc(lastRace.groupLabel)+' • '+esc(cap(lastRace.division))+' • '+esc(lastRace.distanceLabel)+'</div>' +
      '<div class="tv-footer-results">'+lastResultHtml+'</div>'
      : '<div style="opacity:.4">No results yet</div>') +
    '</div>') + '</div>' +
    '<script>setTimeout(()=>location.reload(),20000);</script>' +
    '</body></html>';

  res.send(html);
});

app.get('/meet/:meetId/results', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId); const data=getSessionUser(req);
  if(!isPublicMeet(meet)) return res.redirect('/meets');
  const sections=computeMeetStandings(meet); const openSections=computeOpenResults(meet); const quadSections=computeQuadStandings(meet);
  const ttResultsHtml=renderTimeTrialFinalResultsHtml(completedTimeTrialEvents(meet));
  res.send(pageShell({title:'Results',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>${esc(meet.meetName)}</h1><div class="sub">Results</div></div>
    <div class="live-tabs">
      <a class="live-tab" href="/meet/${meet.id}/live">Live Board</a>
      <a class="live-tab active" href="/meet/${meet.id}/results">Results</a>
      <a class="live-tab" href="/meet/${meet.id}/alerts">📲 Text Alerts</a>
    </div>
    ${sections.map(s=>resultsSectionHtml(s,meet)).join('<div class="spacer"></div>') || (!ttResultsHtml ? `<div class="card"><div class="muted">No standings yet.</div></div>` : '')}
    ${openSections.length?`<div class="spacer"></div><h2 style="color:var(--orange)">🏁 Open Results</h2>${openSections.map(s=>`<div class="card" style="border-left:4px solid var(--orange);margin-bottom:14px"><h2>${esc(s.race.groupLabel)} — ${esc(s.race.distanceLabel)}</h2><table class="table"><thead><tr><th>Place</th><th>Skater</th><th>Team</th></tr></thead><tbody>${s.rows.map(r=>`<tr><td><strong>${esc(r.place)}</strong></td><td>${esc(r.skaterName||'')}</td><td>${esc(r.team||'')}</td></tr>`).join('')}</tbody></table></div>`).join('')}`:``}
    ${quadSections.length?`<div class="spacer"></div><h2 style="color:var(--purple)">🛼 Quad Results</h2>${quadSections.map(s=>quadResultsSectionHtml(s,meet)).join('<div class="spacer"></div>')}`:``}
    ${raceStatusResultsHtml(meet)}
    ${ttResultsHtml}`}));
});

app.get('/portal/meet/:meetId/results/print', requireRole('meet_director','judge','coach'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId); if(!meet) return res.redirect('/portal');
  const sections=computeMeetStandings(meet); const openSections=computeOpenResults(meet); const quadSections=computeQuadStandings(meet);
  const ttPrintHtml=renderTimeTrialFinalResultsPrintHtml(completedTimeTrialEvents(meet));
  const location = meetRinkLabel(req.db, meet);
  const dateLine = meetDateLabel(meet);
  const hasAnyResults = sections.length || openSections.length || quadSections.length || statusRowsForMeet(meet).length || String(ttPrintHtml || '').trim();
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="SpeedSkateMeet"><meta name="theme-color" content="#12284b"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><link rel="icon" href="/icons/apple-touch-icon.png"><link rel="manifest" href="/manifest.json"><title>Results — ${esc(meet.meetName)}</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif;font-size:11px;line-height:1.25}.page{padding:16px;max-width:1040px;margin:0 auto}
    .print-controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding:10px;border:1px solid #ddd;background:#f8fafc}.print-controls button,.print-controls a{border:1px solid #bbb;background:#fff;color:#111;border-radius:4px;padding:6px 9px;text-decoration:none;font-size:12px;cursor:pointer}
    .meet-header{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}h1{font-size:22px;margin:0 0 3px}h2{font-size:14px;margin:0 0 5px}.meta{color:#444;margin-bottom:6px}.section{margin-bottom:18px;break-inside:avoid}
    .audit-race{margin-bottom:10px;break-inside:avoid}.audit-race-title{font-size:11px;font-weight:700;margin:0 0 3px;text-transform:uppercase;letter-spacing:.03em;color:#444}
    .audit-heat .audit-race-title{font-weight:600;color:#666}.audit-heat-note{font-style:italic;font-weight:400;text-transform:none;letter-spacing:0}
    table{width:100%;border-collapse:collapse;margin-top:5px}th,td{padding:3px 5px;border:1px solid #ccc;text-align:left;vertical-align:top}
    th{background:#f1f5f9;color:#111;font-size:9px;text-transform:uppercase;letter-spacing:.03em}.empty-line{border:1px solid #ddd;padding:8px;color:#555}
    .tt-print-event{break-inside:auto}.tt-print-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-items:start}.tt-print-column{break-inside:avoid}.tt-print-column h3{font-size:11px;margin:0 0 4px;padding-bottom:3px;border-bottom:1px solid #999}.tt-print-table{font-size:10px;margin-top:0}.tt-print-table th,.tt-print-table td{padding:2px 3px}.tt-print-table tr{break-inside:avoid}.tt-print-empty{border:1px solid #ddd;color:#555;padding:5px;font-size:10px}
    @media(max-width:760px){.tt-print-grid{grid-template-columns:1fr}}
    @media print{@page{size:auto;margin:.35in}.no-print{display:none!important}.page{padding:0;max-width:none}body{font-size:10px}h1{font-size:18px}h2{font-size:13px}th,td{padding:2px 4px}.tt-print-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.tt-print-table{font-size:9.5px}.tt-print-column h3{font-size:10px}}</style></head><body><main class="page">
    <div class="print-controls no-print"><button type="button" onclick="window.print()">Print</button><a href="/portal/meet/${esc(meet.id)}/results">Back To Results</a><span class="meta">Compact print view</span></div>
    <header class="meet-header"><h1>${esc(meet.meetName)} — Final Results</h1><div class="meta">${esc(dateLine||'')}${meet.startTime?` • ${esc(meet.startTime)}`:''}${location?` • ${esc(location)}`:''}</div></header>
    ${sections.map(s=>resultsSectionHtml(s,meet,{print:true})).join('')}
    ${openSections.length?`<h1>Open Results</h1>${openSections.map(s=>`<div class="section"><h2>${esc(s.race.groupLabel)} — ${esc(s.race.distanceLabel)}</h2>
      <table><thead><tr><th>Place</th><th>Skater</th><th>Team</th></tr></thead><tbody>
      ${s.rows.map(r=>`<tr><td>${esc(r.place)}</td><td>${esc(r.skaterName||'')}</td><td>${esc(r.team||'')}</td></tr>`).join('')||`<tr><td colspan="3">No results.</td></tr>`}
      </tbody></table></div>`).join('')}`:``}
    ${quadSections.length?`<h1>Quad Results</h1>${quadSections.map(s=>quadResultsSectionHtml(s,meet,{print:true})).join('')}`:``}
    ${raceStatusResultsHtml(meet,{print:true})}
    ${ttPrintHtml}
    ${!hasAnyResults ? '<div class="empty-line">No final results yet.</div>' : ''}
  </main></body></html>`);
});

// ── Public Live ───────────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/results/dq-report', requireRole('meet_director','judge'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  const rows = statusRowsForMeet(meet, { onlyDisqualifications: true });
  const location = meetRinkLabel(req.db, meet);
  const dateLine = meetDateLabel(meet);
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Officials DQ Report - ${esc(meet.meetName)}</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif;font-size:11px;line-height:1.35}.page{padding:18px;max-width:1100px;margin:0 auto}.controls{display:flex;gap:8px;margin-bottom:14px}.controls button,.controls a{border:1px solid #aaa;background:#fff;color:#111;border-radius:4px;padding:7px 10px;text-decoration:none;cursor:pointer}.header{border-bottom:2px solid #111;padding-bottom:9px;margin-bottom:14px}h1{font-size:22px;margin:0 0 4px}.meta{color:#444}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#f1f5f9;font-size:9px;text-transform:uppercase;letter-spacing:.04em}.notes{white-space:pre-wrap;min-width:180px}@media print{@page{margin:.4in}.controls{display:none}.page{padding:0}}</style></head><body><main class="page">
    <div class="controls"><button type="button" onclick="window.print()">Print</button><a href="/portal/meet/${esc(meet.id)}/results">Back To Results</a></div>
    <header class="header"><h1>${esc(meet.meetName)} - Officials Disqualification Report</h1><div class="meta">${esc(dateLine || '')}${location ? ` - ${esc(location)}` : ''}</div></header>
    <table><thead><tr><th>Race</th><th>Skater</th><th>Team</th><th>DQ Category</th><th>Rule Reference</th><th>Official Notes</th><th>Timestamp</th><th>Recorded By</th></tr></thead><tbody>
      ${rows.map(row => `<tr><td>${esc(row.raceLabel)}</td><td>${esc(row.skaterName)}</td><td>${esc(row.team)}</td><td><strong>${esc(row.statusLabel)}</strong></td><td>${esc(row.dqRuleReference)}</td><td class="notes">${esc(row.dqOfficialNotes)}</td><td>${esc(row.dqTimestamp ? new Date(row.dqTimestamp).toLocaleString() : '')}</td><td>${esc(row.dqRecordedBy)}</td></tr>`).join('') || '<tr><td colspan="8">No disqualifications recorded.</td></tr>'}
    </tbody></table>
  </main></body></html>`);
});

app.get('/meet/:meetId/alerts', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!isPublicMeet(meet)) return res.redirect('/meets');
  const data=getSessionUser(req);
  const regs=(meet.registrations||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  const ok=req.query.ok; const err=req.query.err;
  res.send(pageShell({title:'Text Alerts',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>📲 Text Alerts</h1><div class="sub">${esc(meet.meetName)}</div></div>
    <div class="live-tabs">
      <a class="live-tab" href="/meet/${meet.id}/live">Live Board</a>
      <a class="live-tab" href="/meet/${meet.id}/results">Results</a>
      <a class="live-tab active" href="/meet/${meet.id}/alerts">Text Alerts</a>
    </div>
    ${ok?`<div class="card" style="border-left:4px solid var(--green);margin-bottom:16px"><div class="good">✅ You're signed up! You'll get texts when ${esc(decodeURIComponent(ok))} is about to race and when results post.</div></div>`:''}
    ${err?`<div class="card" style="border-left:4px solid var(--red);margin-bottom:16px"><div class="danger">❌ ${esc(decodeURIComponent(err))}</div></div>`:''}
    <div class="card">
      <h2 style="margin-bottom:6px">Sign up for race alerts</h2>
      <div class="note" style="margin-bottom:16px">Get a text when your skater is 2 races away, in staging, and when their result posts. Reply STOP anytime to unsubscribe.</div>
      <form method="POST" action="/meet/${meet.id}/alerts/subscribe" class="stack">
        <div class="form-grid cols-2">
          <div>
            <label>Skater — type name to search</label>
            <input name="skaterSearch" id="skaterSearch" list="skaterList" placeholder="Type name..." autocomplete="off" oninput="fillReg(this.value)" required />
            <datalist id="skaterList">
              ${regs.map(r=>`<option value="${esc('#'+r.helmetNumber+' '+r.name)}">#${esc(r.helmetNumber||'?')} ${esc(r.name)} — ${esc(r.divisionGroupLabel||'')}</option>`).join('')}
            </datalist>
            <input type="hidden" name="registrationId" id="regIdInput" />
          </div>
          <div>
            <label>Your Cell Phone Number</label>
            <input name="phone" type="tel" placeholder="(316) 555-1234" required />
          </div>
        </div>
        <div><button class="btn-orange" type="submit">Sign Me Up →</button></div>
      </form>
      <script>
        const alertRegs=${JSON.stringify(regs.map(r=>({id:r.id,key:'#'+r.helmetNumber+' '+r.name})))};
        function fillReg(val){
          const match=alertRegs.find(r=>r.key===val||r.key.toLowerCase()===val.toLowerCase());
          document.getElementById('regIdInput').value=match?match.id:'';
        }
      </script>
    </div>
    <div class="card" style="margin-top:16px">
      <h3 style="margin-bottom:8px">What you'll receive</h3>
      <div class="stack">
        <div class="toggle-row"><div><div class="toggle-row-label">🏁 2 Races Away</div><div class="toggle-row-desc">"Heads up! Jane Smith races in 2 — Elementary Girls Elite 500m"</div></div></div>
        <div class="toggle-row"><div><div class="toggle-row-label">⚡ In Staging</div><div class="toggle-row-desc">"Jane Smith is IN STAGING — get to the line now!"</div></div></div>
        <div class="toggle-row"><div><div class="toggle-row-label">✅ Result Posted</div><div class="toggle-row-desc">"Jane Smith — 🥇 1st place! 30 pts earned | 50 pts total"</div></div></div>
      </div>
    </div>`}));
});

app.post('/meet/:meetId/alerts/subscribe', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!isPublicMeet(meet)) return res.redirect('/meets');
  const regId=String(req.body.registrationId||'').trim();
  const rawPhone=String(req.body.phone||'').trim();
  const phone=normalizePhone(rawPhone);
  if(!phone) return res.redirect(`/meet/${meet.id}/alerts?err=${encodeURIComponent('Invalid phone number. Use format: (316) 555-1234')}`);
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(regId));
  if(!reg) return res.redirect(`/meet/${meet.id}/alerts?err=${encodeURIComponent('Skater not found.')}`);
  if(!Array.isArray(meet.textAlerts)) meet.textAlerts=[];
  // Remove existing sub for same reg+phone combo to avoid duplicates
  meet.textAlerts=meet.textAlerts.filter(s=>!(String(s.registrationId||'')===regId&&s.phone===phone));
  meet.textAlerts.push({id:crypto.randomBytes(6).toString('hex'),registrationId:regId,skaterName:reg.name,phone,createdAt:nowIso()});
  meet.updatedAt=nowIso(); saveDb(db);
  // Send confirmation text
  sendSms(phone, `✅ You're signed up for alerts for ${reg.name}!\nYou'll get texts 2 races away, in staging, and when results post.\n${meet.meetName}\nReply STOP to unsubscribe.`);
  res.redirect(`/meet/${meet.id}/alerts?ok=${encodeURIComponent(reg.name)}`);
});

app.get('/meet/:meetId/live', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId); const data=getSessionUser(req);
  if(!isPublicMeet(meet)) return res.redirect('/meets');
  rebuildTimeTrialRace(meet);
  const info=currentRaceInfo(meet); const current=info.current;
  const lanes=current?laneRowsForRace(current,meet):[];
  const recent=recentClosedRaces(meet,5);
  const regMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));
  if (isStandaloneTimeTrialItem(current)) {
    const distanceLabel = current.distanceLabel || current.timeTrialEvent?.distance || '100m';
    return res.send(pageShell({title:'Live',user:data?.user||null, bodyHtml:`
      <style>
        .tt-live-header{background:linear-gradient(135deg,#0f1f3d,#172f55);border-radius:8px;padding:18px 20px;margin:0 0 16px;color:#fff;box-shadow:0 10px 26px rgba(15,31,61,.18)}
        .tt-live-kicker{font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:900;color:#7dd3fc}
        .tt-live-title{font-family:'Inter',ui-sans-serif,system-ui,sans-serif;font-size:38px;font-weight:800;letter-spacing:-.01em;line-height:1.1;margin-top:4px}
        .tt-live-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
        .tt-live-chip{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);border-radius:999px;padding:7px 10px;font-weight:700;font-size:13px}
        .tt-live-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
        .tt-live-card{background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 22px rgba(15,31,61,.08);overflow:hidden}
        .tt-live-card-title{font-family:'Inter',ui-sans-serif,system-ui,sans-serif;font-size:24px;font-weight:800;color:var(--navy);padding:14px 16px;border-bottom:3px solid var(--sky2);background:#f8fafc}
        .tt-live-row{display:grid;grid-template-columns:38px auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:14px;border-bottom:1px solid #e2e8f0}
        .tt-live-row:last-child{border-bottom:none}
        .tt-live-row.rank-top{background:linear-gradient(90deg,#f8fafc,#fff)}
        .tt-live-row.rank-1{background:linear-gradient(90deg,#fff7ed,#fff)}
        .tt-live-rank{font-family:'Inter',ui-sans-serif,system-ui,sans-serif;font-size:22px;font-weight:700;color:var(--navy);text-align:center}
        .tt-live-person{min-width:0}
        .tt-live-name{font-family:'Inter',ui-sans-serif,system-ui,sans-serif;font-size:21px;font-weight:700;color:var(--navy);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .tt-live-team{font-size:14px;color:#64748b;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .tt-live-time{font-family:'Inter',ui-sans-serif,system-ui,sans-serif;font-size:26px;font-weight:700;color:var(--sky2);text-align:right}
        .tt-live-empty{padding:28px 16px;color:#64748b;font-weight:700;text-align:center}
        @media(max-width:1100px){.tt-live-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tt-live-card:last-child{grid-column:1/-1}}
        @media(max-width:720px){.tt-live-grid{grid-template-columns:1fr}.tt-live-card:last-child{grid-column:auto}.tt-live-title{font-size:30px}.tt-live-row{grid-template-columns:34px auto minmax(0,1fr);}.tt-live-time{grid-column:3;text-align:left;font-size:24px}.tt-live-name{font-size:19px}}
      </style>
      <div class="live-tabs">
        <a class="live-tab active" href="/meet/${meet.id}/live">Live Board</a>
        <a class="live-tab" href="/meet/${meet.id}/results">Results</a>
        <a class="live-tab" href="/meet/${meet.id}/alerts">📲 Text Alerts</a>
      </div>
      <div class="tt-live-header">
        <div class="tt-live-kicker">Live Leaderboard</div>
        <div class="tt-live-title">Time Trials</div>
        <div class="tt-live-meta"><span class="tt-live-chip">Distance: ${esc(distanceLabel)}</span><span class="tt-live-chip">${esc(meet.meetName || '')}</span></div>
      </div>
      <div class="tt-live-grid">
        ${timeTrialLeaderboardColumns(current)}
      </div>
      <script>setTimeout(()=>location.reload(),20000);</script>`}));
  }
  res.send(pageShell({title:'Live',user:data?.user||null, bodyHtml:`
    <div class="live-tabs">
      <a class="live-tab active" href="/meet/${meet.id}/live">Live Board</a>
      <a class="live-tab" href="/meet/${meet.id}/results">Results</a>
      <a class="live-tab" href="/meet/${meet.id}/alerts">📲 Text Alerts</a>
    </div>
    <div class="live-hero">
      <div class="live-meet-name">${esc(meet.meetName)}</div>
      <div class="live-hero-races">
        <div><div class="live-race-label">Current Race</div><div class="live-race-name">${current?esc(current.groupLabel):'—'}</div>${current?`<div class="live-race-meta">${esc(cap(current.division))} • ${esc(current.distanceLabel)} • Race ${Math.max(info.idx+1,1)} of ${info.ordered.length}</div>`:''}</div>
        <div class="live-hero-divider"></div>
        <div><div class="live-race-label">In Staging</div><div class="live-race-name">${info.next?esc(info.next.groupLabel):'—'}</div>${info.next?`<div class="live-race-meta">${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}</div>`:''}</div>
      </div>
    </div>
    <div class="grid-2">
      <div class="live-board-card">
        ${current?`
          <h2>${esc(current.groupLabel)} — ${esc(cap(current.division))} — ${esc(current.distanceLabel)} — ${esc(raceDisplayStage(current))}</h2>
          <div class="live-lane-list">
            ${lanes.filter(l=>l.skaterName).map(l=>{
              const reg=regMap.get(Number(l.registrationId));
              const result=esc(current.resultsMode==='times'?l.time:l.place);
              const statusText=l.status?esc(raceStatusLabel(l.status)):'';
              const detail=[l.helmetNumber?'#'+esc(l.helmetNumber):'',esc(l.team||'')].filter(Boolean).join(' · ');
              return `<div class="live-lane-card">
                <div class="live-lane-number">${esc(l.lane)}</div>
                <div class="live-lane-info">
                  <div class="live-lane-name">${esc(l.skaterName)}</div>
                  ${detail?`<div class="live-lane-detail">${detail}</div>`:''}
                  ${sponsorLineHtml(reg?.sponsor||'').replace('sponsor-line','live-lane-sponsor')}
                </div>
                ${statusText?`<div class="live-lane-status">${statusText}</div>`:(result?`<div class="live-lane-result">${result}</div>`:'')}
              </div>`;
            }).join('') || '<div class="muted">No skaters entered yet.</div>'}
          </div>`:
        `<div class="muted">No race selected.</div>`}
      </div>
      <div class="live-board-card">
        <h2>Recent Results</h2>
        ${recent.map(r=>`
          <div class="live-results-race">
            <div class="live-results-race-title">${esc(r.groupLabel)} — ${esc(cap(r.division))}</div>
            <div class="live-results-race-meta">${esc(r.distanceLabel)}</div>
            ${(r.laneEntries||[]).filter(x=>String(x.place||x.status||'').trim()).sort((a,b)=>Number(a.place||999)-Number(b.place||999)).slice(0,4).map(x=>{
              return `<div class="live-results-row">
                <div class="live-results-place">${esc(x.status?raceStatusLabel(x.status):x.place)}</div>
                <div class="live-results-name">${esc(x.skaterName||'')}</div>
                <div class="live-results-team">${esc(x.team||'')}</div>
              </div>`;
            }).join('') || '<div class="muted">No results yet.</div>'}
          </div>`).join('')||`<div class="muted">No recent results yet.</div>`}
      </div>
    </div>
    ${current&&current.isTimeTrial?(()=>{
      let boards={overallFemale:[],overallMale:[],byGroup:[]};
      try { boards=timeTrialLeaderboards(meet,current)||boards; } catch(err) { console.error('Live TT leaderboard error:', err); }
      boards.overallFemale=Array.isArray(boards.overallFemale)?boards.overallFemale:[];
      boards.overallMale=Array.isArray(boards.overallMale)?boards.overallMale:[];
      boards.byGroup=Array.isArray(boards.byGroup)?boards.byGroup:[];
      const cardRows=(title,rows)=>`<div class="card"><h2>${title}</h2><div class="podium-grid">${(Array.isArray(rows)?rows:[]).slice(0,3).map((e,i)=>`
        <div class="podium-card">
          <div class="podium-place">${['🥇','🥈','🥉'][i]}</div>
          <div class="podium-name">${esc(e.skaterName||'')}</div>
          <div class="podium-team">${esc(e.team||'')}</div>
          <div style="font-family:'Inter',ui-sans-serif,system-ui,sans-serif;font-size:26px;font-weight:700;color:var(--sky2);margin-top:6px">${esc(e.time||'')}</div>
        </div>`).join('')||'<div class="muted">No times posted yet.</div>'}</div></div>`;
      return `<div class="spacer"></div>
        <div class="grid-2">
          ${cardRows('⏱ Overall Girls/Women', boards.overallFemale)}
          ${cardRows('⏱ Overall Boys/Men', boards.overallMale)}
        </div>
        ${boards.byGroup.length?`<div class="spacer"></div><div class="grid-2">${boards.byGroup.map(s=>cardRows('Top 3 — '+esc(s?.group?.label||'Group'), s?.rows||[])).join('')}</div>`:''}`;
    })():''}
    <script>setTimeout(()=>location.reload(),20000);</script>`}));
});

// ── Print Race List ───────────────────────────────────────────────────────────

app.get('/portal/meet/:meetId/registered/print-race-list', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId); if(!meet) return res.redirect('/portal');
  const blocksByDay={};
  for(const block of meet.blocks||[]) { const day=block.day||'Day 1'; if(!blocksByDay[day]) blocksByDay[day]=[]; blocksByDay[day].push(block); }
  const breakTypes=['break','lunch','awards','practice'];
  const breakIcons={break:'☕',lunch:'🍽️',awards:'🏆',practice:'⛸️'};
  let raceNo=1;
  const daySections=Object.keys(blocksByDay).sort().map(day=>{
    // compute per-day visible race block numbers based on current order
    let _cnt=0; const blockNumberDay = {};
    for(const b of (blocksByDay[day]||[])){
      if(breakTypes.includes(b.type||'')) blockNumberDay[b.id]=null;
      else blockNumberDay[b.id]=++_cnt;
    }
    const blockSections=blocksByDay[day].map(block=>{
      const isBreak=breakTypes.includes(block.type||'');
      if(isBreak) {
        const icon=breakIcons[block.type]||'📌';
        return `<div style="margin:14px 0;padding:10px 14px;background:#f8fafc;border-left:3px solid #cbd5e1;border-radius:4px;color:#64748b;font-weight:600">
          ${icon} ${esc(block.name)}${block.notes?' — '+esc(block.notes):''}
        </div>`;
      }
      const displayNum = blockNumberDay[block.id] || '';
      const raceRows=(block.raceIds||[]).map(rid=>{
        const race=(meet.races||[]).find(r=>r.id===rid); if(!race) return '';
        const tag=race.isOpenRace?'🏁 ':race.isQuadRace?'🛼 ':'';
        return `<tr><td>${raceNo++}</td><td>${tag}${esc(race.groupLabel)}</td><td>${esc(race.distanceLabel)}</td><td>${esc(cap(race.division))}</td><td>${esc(raceDisplayStage(race))}</td><td>${esc(cap(race.startType))}</td></tr>`;
      }).join('');
      return `<div style="margin-bottom:18px"><h3>Block ${displayNum}</h3>${block.notes?`<div style="color:#555;font-size:11px">${esc(block.notes)}</div>`:''}
        <table><thead><tr><th>Race</th><th>Division</th><th>Distance</th><th>Class</th><th>Stage</th><th>Start</th></tr></thead>
        <tbody>${raceRows||`<tr><td colspan="7">No races.</td></tr>`}</tbody></table></div>`;
    }).join('');
    return `<div style="margin-bottom:24px"><h2>${esc(day)}</h2>${blockSections}</div>`;
  }).join('');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="SpeedSkateMeet"><meta name="theme-color" content="#12284b"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><link rel="icon" href="/icons/apple-touch-icon.png"><link rel="manifest" href="/manifest.json"><title>Race List — ${esc(meet.meetName)}</title>
    <style>body{font-family:Arial,sans-serif;padding:18px;color:#111;font-size:12px}h1,h2,h3{margin:0 0 6px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
    th{font-size:11px;text-transform:uppercase;color:#666}</style></head><body>
    <h1>${esc(meet.meetName)} — Race List</h1>
    <div style="color:#555;margin-bottom:12px">${esc(meet.date||'')}${meet.startTime?` • ${esc(meet.startTime)}`:''}</div>
    ${daySections||'<div>No blocks yet.</div>'}
  </body></html>`);
});


app.use('/', createPublicRoutes({ getSessionUser, pageShell, hasRole }));
app.use('/', createDesktopRoutes({ getSessionUser, pageShell, loadDb, saveDb, requireRole, getMeetOr404, nextId }));

// ── Extracted route modules ────────────────────────────────────────────────────
const routeDeps = {
  requireRole, pageShell, saveDb, loadDb, getSessionUser, TEAM_LIST, toggleSwitch, ADMIN_PHONE,
  // views
  renderArchivedMeetsView, renderPendingMeetsView, renderPendingRinksView,
  renderStaffAccountsView, renderMeetBuilderView, renderOpenBuilderView,
  renderQuadBuilderView, renderRelayBuilderView, renderRegisteredView,
  renderCheckinView, renderBlockBuilderView,
  // shared render helpers
  resultsSectionHtml, quadResultsSectionHtml, announcerBoxHtml, meetTabs, raceDaySubTabs,
  // meet-lifecycle helpers
  archivedMeetsForUser, nextSetupPresetId, sanitizeRinks,
};
app.use('/', createAdminRoutes(routeDeps));
app.use('/', createBuilderRoutes(routeDeps));
app.use('/', createRegistrationRoutes(routeDeps));
app.use('/', createRaceDayRoutes(routeDeps));
app.use('/', createStaffRoutes(routeDeps));
app.use('/', createTimeTrialRoutes(routeDeps));
app.use('/', createSslImportRoutes(routeDeps));
app.use('/', createMobileApiRoutes(routeDeps));

// ── Global error handling ──────────────────────────────────────────────────────
// Catches synchronous throws from any route above (Express does this automatically)
// plus rejected promises from routes wrapped in asyncHandler. Stack traces are only
// ever written to the log, never sent to the client.
app.use((err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  const wantsJson = req.path.startsWith('/api/') || String(req.get('accept') || '').includes('application/json');
  if (wantsJson) {
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
  res.status(500).send(pageShell({
    title: 'Error',
    user: null,
    bodyHtml: `<div style="max-width:520px;margin:40px auto">
      <div class="page-header"><h1>Something went wrong</h1></div>
      <div class="card">
        <div class="danger" style="margin-bottom:14px">SpeedSkateMeet hit an unexpected error. Your data was not changed.</div>
        <a class="btn2" href="/">Back to Home</a>
      </div>
    </div>`,
  }));
});

process.on('uncaughtException', err => {
  logger.error('Uncaught exception:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', err => {
  logger.error('Unhandled promise rejection:', err && err.stack ? err.stack : err);
});

// ── Support & Privacy ─────────────────────────────────────────────────────────
app.get('/support', (req, res) => {
  res.send(pageShell({ title: 'Support – SpeedSkateMeet', user: null, bodyHtml: `
    <div style="max-width:720px;margin:0 auto;padding:48px 20px 80px;">
      <div style="text-align:center;padding-bottom:40px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:40px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3b82f6;margin-bottom:12px;">Help &amp; Support</div>
        <h1 style="font-size:clamp(26px,5vw,38px);font-weight:800;margin-bottom:10px;">SpeedSkateMeet Support</h1>
        <p style="color:#94a3b8;">Need help with the SpeedSkateMeet app or website?</p>
      </div>
      <div style="margin-bottom:36px;">
        <h2 style="font-size:18px;font-weight:700;margin-bottom:16px;">Contact Us</h2>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:22px 24px;">
          <p style="font-size:14px;color:#94a3b8;margin-bottom:12px;">Email us and we'll get back to you as soon as possible.</p>
          <a href="mailto:Lbird@speedskatemeet.com" style="display:inline-flex;align-items:center;gap:8px;background:#3b82f6;color:#fff;font-size:15px;font-weight:700;padding:13px 28px;border-radius:50px;text-decoration:none;">✉ Lbird@speedskatemeet.com</a>
        </div>
      </div>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:36px 0;">
      <div style="margin-bottom:36px;">
        <h2 style="font-size:18px;font-weight:700;margin-bottom:16px;">Common Questions</h2>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:22px 24px;margin-bottom:12px;">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;">I can't log in</h3>
          <p style="font-size:14px;color:#94a3b8;margin:0;">Make sure you're using the email associated with your SpeedSkateMeet account. Use "Forgot Password" on the login screen if needed.</p>
        </div>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:22px 24px;margin-bottom:12px;">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;">Meet results aren't showing</h3>
          <p style="font-size:14px;color:#94a3b8;margin:0;">Pull to refresh or reload the page. Results are posted by meet directors and may take a few minutes after an event ends.</p>
        </div>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:22px 24px;margin-bottom:12px;">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;">Found a bug?</h3>
          <p style="font-size:14px;color:#94a3b8;margin:0;">Email us at <a href="mailto:Lbird@speedskatemeet.com" style="color:#3b82f6;">Lbird@speedskatemeet.com</a> with your device model, iOS version, and a screenshot if possible.</p>
        </div>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:22px 24px;">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;">Feature request?</h3>
          <p style="font-size:14px;color:#94a3b8;margin:0;">We'd love to hear your ideas. Email us anytime.</p>
        </div>
      </div>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin:36px 0;">
      <div>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:16px;">Legal</h2>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:22px 24px;">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;">Privacy Policy</h3>
          <p style="font-size:14px;color:#94a3b8;margin:0;">View our <a href="/privacy" style="color:#3b82f6;">Privacy Policy</a> to learn how we handle your data.</p>
        </div>
      </div>
    </div>
  `}));
});

app.get('/privacy', (req, res) => {
  res.send(pageShell({ title: 'Privacy Policy – SpeedSkateMeet', user: null, bodyHtml: `
    <div style="max-width:760px;margin:0 auto;padding:48px 20px 80px;">
      <div style="text-align:center;padding-bottom:40px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:40px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3b82f6;margin-bottom:12px;">Legal</div>
        <h1 style="font-size:clamp(26px,5vw,38px);font-weight:800;margin-bottom:10px;">Privacy Policy</h1>
        <p style="font-size:14px;color:#94a3b8;">Last updated: July 2, 2026</p>
      </div>
      ${[
        ['1. Information We Collect', 'When you create an account and use SpeedSkateMeet, we collect your name, email address, and a unique user ID. Meet directors and officials may also enter skater names and race results as part of meet management.'],
        ['2. How We Use Your Information', 'All data is used solely to operate the platform: authenticate your account, display meet results, manage race-day operations, and provide customer support. We do not use your data for advertising or marketing.'],
        ['3. Data Sharing', 'We do not sell or share your personal information with third parties for advertising. Your data is processed by Render (cloud hosting) to operate the service.'],
        ['4. Data Retention', 'We retain your data for as long as your account is active. To request deletion, email <a href="mailto:Lbird@speedskatemeet.com" style="color:#3b82f6;">Lbird@speedskatemeet.com</a> and we will process it within 30 days.'],
        ['5. Children\'s Privacy', 'SpeedSkateMeet is not directed to children under 13. We do not knowingly collect personal information from children under 13.'],
        ['6. Security', 'All data is transmitted over HTTPS. We use industry-standard security practices to protect your information.'],
        ['7. Contact Us', 'Questions? Email us at <a href="mailto:Lbird@speedskatemeet.com" style="color:#3b82f6;">Lbird@speedskatemeet.com</a>.'],
      ].map(([h, p]) => `
        <div style="margin-bottom:32px;">
          <h2 style="font-size:18px;font-weight:700;margin-bottom:10px;">${h}</h2>
          <p style="font-size:14px;color:#94a3b8;line-height:1.75;margin:0;">${p}</p>
        </div>
      `).join('')}
    </div>
  `}));
});

// ── Start server ──────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  logger.info(`SpeedSkateMeet v19 listening on ${HOST}:${PORT}`);
  logger.info(`Data file: ${DATA_FILE}`);
});
