const express = require('express');
const crypto = require('crypto');
const { esc } = require('../utils/html');
const { canEditMeet } = require('../utils/auth');
const { nowIso } = require('../utils/date');
const {
  nextId,
  nextHelmetNumber,
  usarsAge,
  findAgeGroup,
  challengeAdjustedGroup,
  generateAdditionalRacesForMeet,
} = require('../services/meetHelpers');
const { calcRegistrationCost } = require('../services/pricing');
const { rebuildRaceAssignmentsSafe } = require('../services/ttHelpers');
const { ensureCurrentRace } = require('../services/raceDay');

function ensurePackageStore(db) {
  if (!Array.isArray(db.sslRegistrationPackages)) db.sslRegistrationPackages = [];
  return db.sslRegistrationPackages;
}

function safePackageId() {
  return 'ssl_pkg_' + crypto.randomBytes(6).toString('hex');
}

function configuredSslPackageApiKey() {
  return String(
    process.env.SSL_SHARED_API_KEY ||
    process.env.SSM_SSL_API_KEY ||
    process.env.SSM_PACKAGE_API_KEY ||
    process.env.SSO_SHARED_SECRET ||
    'ssl-ssm-local-dev-package-key'
  ).trim();
}

function bearerToken(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : raw;
}

function verifySslPackageApiKey(req) {
  const expected = configuredSslPackageApiKey();
  const provided = String(
    req.get('x-ssl-api-key') ||
    req.get('x-ssm-api-key') ||
    bearerToken(req.get('authorization')) ||
    ''
  ).trim();

  if (!expected || !provided || provided !== expected) {
    const err = new Error('Unauthorized SSL package submission.');
    err.statusCode = 401;
    throw err;
  }
}

function packageSchemaVersion(payload) {
  const raw = payload?.schemaVersion ?? payload?.schema_version ?? payload?.version;
  const n = Number(raw || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isValidSslSkaterId(value) {
  return /^SSL-\d{6,}$/i.test(String(value || '').trim());
}

function normalizePackageGender(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['male', 'm', 'boy', 'boys', 'man', 'men'].includes(raw)) return 'male';
  if (['female', 'f', 'girl', 'girls', 'woman', 'women', 'ladies'].includes(raw)) return 'female';
  return raw;
}

function validatePackageSchemaV1(payload) {
  if (payload.package_type !== 'ssl_team_registration_package') {
    throw new Error('This does not look like an SSL team registration package.');
  }
  if (packageSchemaVersion(payload) !== 1) throw new Error('Unsupported SSL package schema. Expected schemaVersion 1.');
  if (!compactId(payload.package_id)) throw new Error('Package is missing package_id.');
  if (!compactId(payload.team)) throw new Error('Package is missing team name.');
  if (!payload.meet || typeof payload.meet !== 'object') throw new Error('Package is missing meet details.');
  if (!compactId(payload.meet.ssl_meet_id)) throw new Error('Package meet is missing ssl_meet_id.');
  if (!compactId(payload.meet.title)) throw new Error('Package meet is missing title.');
  if (!Array.isArray(payload.skaters)) throw new Error('Package is missing the skaters array.');

  payload.skaters.forEach((row, index) => {
    const label = `Skater row ${index + 1}`;
    if (!isValidSslSkaterId(row?.ssl_skater_id)) throw new Error(`${label} is missing a valid ssl_skater_id.`);
    if (!compactId(row.full_name)) throw new Error(`${label} is missing full_name.`);
    if (!compactId(row.birthdate)) throw new Error(`${label} is missing birthdate.`);
    const gender = normalizePackageGender(row.gender);
    if (!['male', 'female'].includes(gender)) throw new Error(`${label} must have gender male or female.`);
    if (compactId(row.attendance_status || 'attending') !== 'attending') throw new Error(`${label} is not marked attending.`);
    if (!row.selected_events || typeof row.selected_events !== 'object' || Array.isArray(row.selected_events)) {
      throw new Error(`${label} is missing selected_events.`);
    }
  });

  return payload;
}

function parsePackage(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Paste an SSL registration package JSON export first.');

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error('That is not valid JSON. Export the package from SSL again and paste the full file contents.');
  }

  return validatePackageSchemaV1(payload);
}

function parseDirectPackageBody(body) {
  const payload = body && typeof body === 'object' && !Array.isArray(body) && body.package
    ? body.package
    : body;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Missing SSL registration package payload.');
  }

  return validatePackageSchemaV1(payload);
}

function compactId(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function eventList(row) {
  const names = Array.isArray(row?.selected_event_names) ? row.selected_event_names : [];
  return names.length ? names.join(', ') : 'No events selected';
}

function selectedEventSet(row) {
  const out = new Set();
  const selected = row?.selected_events;
  const add = key => out.add(String(key || '').trim().toLowerCase());

  if (Array.isArray(selected)) selected.forEach(add);
  if (selected && typeof selected === 'object' && !Array.isArray(selected)) {
    Object.entries(selected).forEach(([key, value]) => {
      if (value) add(key);
    });
  }
  (Array.isArray(row?.selected_event_names) ? row.selected_event_names : []).forEach(name => {
    const s = String(name || '').trim().toLowerCase();
    if (!s) return;
    if (s.includes('challenge')) add('challengeUp');
    else if (s.includes('novice')) add('novice');
    else if (s.includes('elite')) add('elite');
    else if (s.includes('open')) add('open');
    else if (s.includes('quad')) add('quad');
    else if (s.includes('relay')) add('relays');
    else if (s.includes('time')) add('timeTrials');
    else if (s.includes('skateability') || s.includes('additional') || s.includes('diaper')) add('additional');
  });

  return out;
}

function regOptionsFromSslRow(row, meet) {
  const opts = selectedEventSet(row);
  const firstAdditional = (meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups || []).find(g => g && g.enabled);
  const wantsRelays = opts.has('relays') || opts.has('relay') || opts.has('relay2person') || opts.has('relay3person') || opts.has('relay4person');
  const wantsAdditional = opts.has('additional') || opts.has('skateability') || opts.has('diaperdash') || opts.has('diaper_dash');

  return {
    challengeUp: opts.has('challengeup') || opts.has('challenge_up'),
    novice: opts.has('novice'),
    elite: opts.has('elite') || (!opts.has('novice') && !opts.has('open') && !opts.has('quad') && !wantsAdditional),
    open: opts.has('open'),
    quad: opts.has('quad'),
    timeTrials: opts.has('timetrials') || opts.has('time_trials') || opts.has('time trial'),
    relay2Person: opts.has('relay2person') || opts.has('relay_2_person') || wantsRelays,
    relay3Person: opts.has('relay3person') || opts.has('relay_3_person'),
    relay4Person: opts.has('relay4person') || opts.has('relay_4_person'),
    relays: wantsRelays,
    additional: wantsAdditional,
    additionalGroupId: wantsAdditional && firstAdditional ? String(firstAdditional.id || '') : '',
    skateability: wantsAdditional,
    skateabilityGroupId: wantsAdditional && firstAdditional ? String(firstAdditional.id || '') : '',
  };
}

function genderFromRow(row) {
  const raw = normalizePackageGender(row.gender || row.sex || '');
  if (raw === 'male' || raw === 'female') return raw;

  const group = String(row.age_group || '').toLowerCase();
  if (group.includes('men') || group.includes('male') || group.includes('boys')) return 'male';
  if (group.includes('women') || group.includes('ladies') || group.includes('female') || group.includes('girls')) return 'female';
  return 'male';
}

function activeMeetsForUser(db, user) {
  return (db.pendingMeets || [])
    .filter(meet => meet && !meet.archivedAt && canEditMeet(user, meet))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.meetName || '').localeCompare(String(b.meetName || '')));
}

function findPackageById(db, pkgId) {
  return ensurePackageStore(db).find(p => String(p.id) === String(pkgId));
}

function packageAppliedToMeet(pkg, meetId) {
  return (pkg.appliedToMeets || []).find(row => String(row.meetId) === String(meetId));
}

function sslSkaterIdFromRow(row) {
  return compactId(
    row?.ssl_skater_id ||
    row?.sslSkaterId ||
    row?.ssl_skater_id_public ||
    row?.public_skater_id ||
    row?.skater_public_id ||
    ''
  );
}

function legacySslUserIdFromRow(row) {
  const raw = compactId(
    row?.ssl_user_id ||
    row?.sslUserId ||
    row?.ssl_profile_id ||
    row?.profile_id ||
    row?.user_id ||
    ''
  );

  if (raw) return raw;

  const skaterId = compactId(row?.skater_id);
  if (skaterId && !/^SSL-\d+$/i.test(skaterId)) return skaterId;
  return '';
}

function importSkaterIdFromRow(row) {
  return sslSkaterIdFromRow(row) || compactId(row?.skater_id) || legacySslUserIdFromRow(row);
}

function duplicateRegistration(meet, payload, row) {
  const sslSkaterId = sslSkaterIdFromRow(row);
  const legacySslUserId = legacySslUserIdFromRow(row);
  const importSkaterId = importSkaterIdFromRow(row);
  const pkgId = compactId(payload.package_id);
  const name = normalizeName(row.full_name);
  const team = normalizeName(row.team || payload.team);

  return (meet.registrations || []).find(reg => {
    if (sslSkaterId && String(reg.sslSkaterId || '') === sslSkaterId) return true;
    if (sslSkaterId && String(reg.importSource || '') === 'ssl' && String(reg.importSourceSkaterId || '') === sslSkaterId) return true;
    if (legacySslUserId && String(reg.sslUserId || '') === legacySslUserId) return true;
    if (legacySslUserId && String(reg.importSource || '') === 'ssl' && String(reg.importSourceLegacyUserId || '') === legacySslUserId) return true;
    if (importSkaterId && String(reg.importSource || '') === 'ssl' && String(reg.importSourceSkaterId || '') === importSkaterId) return true;
    if (pkgId && String(reg.importPackageId || '') === pkgId && name && normalizeName(reg.name) === name) return true;
    return name && team && normalizeName(reg.name) === name && normalizeName(reg.team) === team;
  });
}

function makeRegistrationFromSslRow(meet, payload, row) {
  const gender = genderFromRow(row);
  const birthdate = compactId(row.birthdate || row.date_of_birth || row.dob);
  const age = usarsAge(birthdate, meet.date) || Number(row.age || 0) || '';
  const baseGroup = findAgeGroup(meet.groups || [], age, gender);
  const opts = regOptionsFromSslRow(row, meet);
  const sslSkaterId = sslSkaterIdFromRow(row);
  const legacySslUserId = legacySslUserIdFromRow(row);
  const importSkaterId = importSkaterIdFromRow(row);
  const finalGroup = challengeAdjustedGroup(meet, baseGroup, !!opts.challengeUp);
  const requestedHelmet = Number(row.helmet_number || 0);
  const helmetNumber = Number.isFinite(requestedHelmet) && requestedHelmet > 0 ? requestedHelmet : nextHelmetNumber(meet);
  const meetNumber = (meet.registrations || []).reduce((max, reg) => Math.max(max, Number(reg.meetNumber) || 0), 0) + 1;

  return {
    id: nextId(meet.registrations || []),
    createdAt: nowIso(),
    name: compactId(row.full_name) || 'SSL Skater',
    birthdate,
    age,
    gender,
    email: compactId(row.email || ''),
    team: compactId(row.team || payload.team) || payload.team || '',
    sponsor: compactId(row.sponsor || ''),
    originalDivisionGroupId: baseGroup?.id || '',
    originalDivisionGroupLabel: baseGroup?.label || '',
    divisionGroupId: finalGroup?.id || '',
    divisionGroupLabel: finalGroup?.label || row.age_group || 'Unassigned',
    meetNumber,
    helmetNumber,
    paid: false,
    checkedIn: false,
    totalCost: calcRegistrationCost(meet, opts),
    options: opts,
    importSource: 'ssl',
    importSourceName: 'SpeedSkateLeague',
    importPackageId: compactId(payload.package_id),
    importPackageMeetId: compactId(payload.meet?.ssl_meet_id),
    importSourceSkaterId: importSkaterId,
    importSourceLegacyUserId: legacySslUserId,
    sslSkaterId,
    sslUserId: legacySslUserId,
    importedAt: nowIso(),
    attendanceUpdatedAt: row.attendance_updated_at || null,
  };
}

function applyPackageToMeet({ db, pkg, meet, user }) {
  if (!meet) throw new Error('Select a valid meet before applying this package.');
  if (packageAppliedToMeet(pkg, meet.id)) throw new Error('This SSL package has already been applied to that meet.');

  const payload = pkg.payload || {};
  const rows = Array.isArray(payload.skaters) ? payload.skaters : [];
  meet.registrations = Array.isArray(meet.registrations) ? meet.registrations : [];

  const created = [];
  const skipped = [];

  for (const row of rows) {
    if (!compactId(row.full_name)) {
      skipped.push({ row, reason: 'missing name' });
      continue;
    }
    const duplicate = duplicateRegistration(meet, payload, row);
    if (duplicate) {
      skipped.push({ row, reason: 'duplicate registration' });
      continue;
    }
    const reg = makeRegistrationFromSslRow(meet, payload, row);
    meet.registrations.push(reg);
    created.push(reg);
  }

  if (created.length) {
    generateAdditionalRacesForMeet(meet);
    rebuildRaceAssignmentsSafe(meet);
    ensureCurrentRace(meet);
  }

  pkg.status = 'applied';
  pkg.updatedAt = nowIso();
  pkg.updatedByUserId = user.id;
  pkg.appliedToMeets = Array.isArray(pkg.appliedToMeets) ? pkg.appliedToMeets : [];
  pkg.appliedToMeets.push({
    meetId: meet.id,
    meetName: meet.meetName || '',
    createdCount: created.length,
    skippedCount: skipped.length,
    appliedAt: nowIso(),
    appliedByUserId: user.id,
    appliedBy: user.displayName || user.username || 'SSM User',
  });

  return { created, skipped };
}

function upsertImportedPackage({ db, payload, user, source }) {
  const packages = ensurePackageStore(db);
  const existing = packages.find(p =>
    String(p.payload?.package_id || '') === String(payload.package_id || '') &&
    String(p.payload?.team || '') === String(payload.team || '')
  );

  const actorId = user?.id || null;
  const actorName = user?.displayName || user?.username || source?.name || 'SpeedSkateLeague';

  if (existing) {
    existing.payload = payload;
    existing.updatedAt = nowIso();
    existing.updatedByUserId = actorId;
    existing.updatedBy = actorName;
    existing.receivedVia = source?.via || existing.receivedVia || 'manual';
    existing.lastReceivedAt = nowIso();
    existing.status = existing.status || 'pending';
    return { pkg: existing, created: false };
  }

  const row = {
    id: safePackageId(),
    status: 'pending',
    createdAt: nowIso(),
    createdByUserId: actorId,
    createdBy: actorName,
    receivedVia: source?.via || 'manual',
    lastReceivedAt: nowIso(),
    payload,
  };
  packages.unshift(row);
  return { pkg: row, created: true };
}


function publicBaseUrl(req) {
  const configured = String(process.env.SSM_PUBLIC_BASE_URL || process.env.SSM_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`.replace(/\/+$/, '');
}

function isPublishedMeet(meet) {
  return !!meet && !meet.archivedAt && !!meet.isPublic && String(meet.status || '').toLowerCase() === 'published';
}

function meetLocationLabel(db, meet) {
  const rink = (db.rinks || []).find(r => String(r.id) === String(meet.rinkId));
  if (meet.customRinkName) return meet.customRinkName;
  if (rink) return [rink.name, rink.city, rink.state].filter(Boolean).join(' · ');
  return [meet.city, meet.state].filter(Boolean).join(', ');
}

function publicMeetPayload(req, db, meet) {
  const base = publicBaseUrl(req);
  const league = compactId(meet.leagueAssociation || meet.league || '');
  const registerPath = `/meet/${encodeURIComponent(meet.id)}/register`;
  return {
    source: 'SpeedSkateMeet',
    meet_id: `ssm-${meet.id}`,
    ssm_meet_id: String(meet.id),
    title: meet.meetName || 'Meet',
    meet_title: meet.meetName || 'Meet',
    date: meet.date || '',
    event_date: meet.date || '',
    meet_date: meet.date || '',
    end_date: meet.endDate || '',
    start_time: meet.startTime || '',
    location: meetLocationLabel(db, meet),
    venue: meetLocationLabel(db, meet),
    meet_location: meetLocationLabel(db, meet),
    league,
    leagueAssociation: league,
    status: meet.status || '',
    registration_close_at: meet.registrationCloseAt || '',
    registration_url: `${base}${registerPath}`,
    ssm_url: `${base}${registerPath}`,
    results_url: `${base}/meet/${encodeURIComponent(meet.id)}/results`,
    updated_at: meet.updatedAt || meet.createdAt || '',
  };
}

function renderPackageCard(pkg, selectedId) {
  const payload = pkg.payload || {};
  const meet = payload.meet || {};
  const counts = payload.counts || {};
  const appliedCount = Array.isArray(pkg.appliedToMeets) ? pkg.appliedToMeets.length : 0;
  const isSelected = String(pkg.id) === String(selectedId || '');
  return `
    <a class="ssl-package-row${isSelected ? ' active' : ''}" href="/portal/ssl-packages?id=${esc(pkg.id)}">
      <div>
        <div class="ssl-package-title">${esc(meet.title || 'SSL Registration Package')}</div>
        <div class="ssl-package-meta">${esc(payload.team || 'Team')} • ${esc(meet.date || 'Date TBD')} ${meet.location ? '• ' + esc(meet.location) : ''}</div>
      </div>
      <div class="ssl-package-count">${appliedCount ? esc(appliedCount + ' applied') : esc((counts.ready ?? (payload.skaters || []).length) + ' ready')}</div>
    </a>`;
}

function renderApplyForm({ pkg, db, user }) {
  if (!pkg) return '';
  const meets = activeMeetsForUser(db, user);
  if (!meets.length) {
    return `<div class="ssl-warning"><b>No editable active meets found.</b> Create or unarchive a meet before applying this package.</div>`;
  }

  return `
    <form method="POST" action="/portal/ssl-packages/${esc(pkg.id)}/apply" class="ssl-apply-form" onsubmit="return confirm('Create SSM registrations from this SSL package? Existing duplicates will be skipped.');">
      <div>
        <label>Apply package to SSM meet</label>
        <select name="meetId" required>
          <option value="">— Select meet —</option>
          ${meets.map(meet => `<option value="${esc(meet.id)}">${esc(meet.meetName || 'Meet')} ${meet.date ? '— ' + esc(meet.date) : ''}</option>`).join('')}
        </select>
      </div>
      <button class="btn-orange" type="submit">Create Registrations</button>
    </form>`;
}

function renderAppliedHistory(pkg) {
  const rows = Array.isArray(pkg?.appliedToMeets) ? pkg.appliedToMeets : [];
  if (!rows.length) return '';
  return `
    <div class="good" style="margin-bottom:14px">
      Applied history: ${rows.map(row => `${esc(row.meetName || 'Meet')} — ${esc(row.createdCount || 0)} created, ${esc(row.skippedCount || 0)} skipped`).join(' · ')}
    </div>`;
}

function renderPackagePreview(pkg, db, user) {
  if (!pkg) {
    return `<div class="card ssl-import-empty"><h2>No package selected</h2><p class="muted">Import an SSL package or select one from the list.</p></div>`;
  }

  const payload = pkg.payload || {};
  const meet = payload.meet || {};
  const counts = payload.counts || {};
  const warnings = payload.warnings || {};
  const skaters = Array.isArray(payload.skaters) ? payload.skaters : [];
  const missingEvents = Array.isArray(warnings.missing_events) ? warnings.missing_events : [];
  const noResponse = Array.isArray(warnings.no_response) ? warnings.no_response : [];

  const rows = skaters.map(row => `
    <tr>
      <td><b>${esc(row.full_name || 'Skater')}</b><div class="muted small">SSL ID: ${esc(sslSkaterIdFromRow(row) || compactId(row.skater_id) || legacySslUserIdFromRow(row) || '—')}</div></td>
      <td>${esc(row.helmet_number || '—')}</td>
      <td>${esc(row.age_group || '—')}</td>
      <td>${esc(eventList(row))}</td>
    </tr>`).join('');

  const warningHtml = [
    missingEvents.length ? `<div class="ssl-warning"><b>Missing events:</b> ${missingEvents.map(r => esc(r.full_name || 'Skater')).join(', ')}</div>` : '',
    noResponse.length ? `<div class="ssl-warning"><b>No response:</b> ${noResponse.slice(0, 8).map(r => esc(r.full_name || 'Skater')).join(', ')}${noResponse.length > 8 ? ' +' + esc(noResponse.length - 8) + ' more' : ''}</div>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="card ssl-package-preview">
      <div class="row between center" style="margin-bottom:14px">
        <div>
          <div class="muted small">SSL Registration Package</div>
          <h2 style="margin:0">${esc(meet.title || 'Meet')}</h2>
          <div class="muted">${esc(payload.team || 'Team')} • ${esc(meet.date || 'Date TBD')} ${meet.location ? '• ' + esc(meet.location) : ''}</div>
        </div>
        <span class="chip ${pkg.status === 'applied' ? 'chip-green' : 'chip-sky'}">${pkg.status === 'applied' ? 'Applied' : 'Pending Review'}</span>
      </div>

      <div class="ssl-import-stats">
        <div><b>${esc(counts.ready ?? skaters.length)}</b><span>Ready</span></div>
        <div><b>${esc(counts.missing_events || 0)}</b><span>Missing Events</span></div>
        <div><b>${esc(counts.no_response || 0)}</b><span>No Response</span></div>
        <div><b>${esc(payload.package_id || pkg.id)}</b><span>Package ID</span></div>
      </div>

      ${renderAppliedHistory(pkg)}
      ${warningHtml || `<div class="good" style="margin-bottom:14px">No package warnings found.</div>`}
      ${renderApplyForm({ pkg, db, user })}

      <table class="table">
        <thead><tr><th>Skater</th><th>Helmet</th><th>Division</th><th>Events</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">No ready skaters in this package.</td></tr>`}</tbody>
      </table>

      <div class="hr"></div>
      <div class="muted small">Imported ${esc(pkg.createdAt || '')} by ${esc(pkg.createdBy || 'SSM user')}. Applying a package creates SSM registrations, skips duplicates, and rebuilds race assignments.</div>
    </div>`;
}

function renderSslPackagePage({ db, user, selectedId, error, ok }) {
  const packages = ensurePackageStore(db).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const selected = packages.find(p => String(p.id) === String(selectedId || '')) || packages[0] || null;

  return `
    <style>
      .ssl-import-grid{display:grid;grid-template-columns:390px minmax(0,1fr);gap:16px;align-items:start;}
      .ssl-package-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid var(--border);border-radius:14px;background:#fff;color:inherit;text-decoration:none;margin-bottom:8px;}
      .ssl-package-row:hover,.ssl-package-row.active{border-color:var(--sky2);box-shadow:var(--shadow-sm);}
      .ssl-package-title{font-weight:850;color:var(--navy);line-height:1.15;}
      .ssl-package-meta{font-size:12px;color:var(--muted);margin-top:3px;}
      .ssl-package-count{font-size:12px;font-weight:900;color:var(--sky2);white-space:nowrap;}
      .ssl-import-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px;}
      .ssl-import-stats div{border:1px solid var(--border);border-radius:14px;background:#f8fafc;padding:12px;}
      .ssl-import-stats b{display:block;font-size:20px;color:var(--navy);line-height:1.1;word-break:break-word;}
      .ssl-import-stats span{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:var(--muted);}
      .ssl-warning{border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:14px;padding:11px 13px;margin-bottom:10px;font-weight:700;}
      .ssl-import-empty{text-align:center;padding:40px;}
      .ssl-apply-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;border:1px solid var(--border);background:#f8fafc;border-radius:14px;padding:12px;margin-bottom:14px;}
      .ssl-apply-form label{display:block;font-size:12px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;}
      @media(max-width:920px){.ssl-import-grid{grid-template-columns:1fr}.ssl-import-stats{grid-template-columns:1fr 1fr;}.ssl-apply-form{grid-template-columns:1fr;}}
    </style>
    <div class="page-header"><h1>SSL Registration Packages</h1><div class="sub">Review team registration packages sent or exported from SpeedSkateLeague and create SSM registrations.</div></div>
    ${error ? `<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">${esc(error)}</div></div>` : ''}
    ${ok ? `<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">${esc(ok)}</div></div>` : ''}
    <div class="ssl-import-grid">
      <div class="stack">
        <div class="card">
          <h2>Import Package JSON</h2>
          <p class="muted">From SSL, use <b>Register to SSM</b> when available. You can still paste an exported JSON package here as a fallback.</p>
          <form method="POST" action="/portal/ssl-packages/import">
            <textarea name="packageJson" rows="10" placeholder='{"package_type":"ssl_team_registration_package",...}'></textarea>
            <div class="action-row" style="margin-top:10px"><button class="btn-orange" type="submit">Import Package</button></div>
          </form>
        </div>
        <div class="card">
          <h2>Incoming Packages</h2>
          ${packages.length ? packages.map(p => renderPackageCard(p, selected?.id)).join('') : `<div class="muted">No SSL packages imported yet.</div>`}
        </div>
      </div>
      ${renderPackagePreview(selected, db, user)}
    </div>`;
}

module.exports = function createSslImportRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, pageShell, saveDb } = deps;


  router.get('/api/ssl/meets', (req, res) => {
    try {
      const today = String(req.query.from || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const league = compactId(req.query.league || '');
      const includeIndependent = String(req.query.includeIndependent || req.query.include_independent || 'true').toLowerCase() !== 'false';
      const meets = (req.db.meets || [])
        .filter(isPublishedMeet)
        .filter(meet => !meet.date || String(meet.date).slice(0, 10) >= today)
        .filter(meet => {
          const meetLeague = compactId(meet.leagueAssociation || meet.league || '');
          if (!league) return true;
          return meetLeague === league || (includeIndependent && !meetLeague);
        })
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.meetName || '').localeCompare(String(b.meetName || '')))
        .map(meet => publicMeetPayload(req, req.db, meet));

      return res.json({ schemaVersion: 1, source: 'SpeedSkateMeet', generated_at: nowIso(), meets });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.get('/portal/ssl-packages', requireRole('meet_director'), (req, res) => {
    res.send(pageShell({
      title: 'SSL Registration Packages',
      user: req.user,
      bodyHtml: renderSslPackagePage({
        db: req.db,
        user: req.user,
        selectedId: req.query.id,
        error: req.query.error,
        ok: req.query.ok,
      }),
    }));
  });

  router.post('/portal/ssl-packages/import', requireRole('meet_director'), (req, res) => {
    try {
      const payload = parsePackage(req.body.packageJson);
      const result = upsertImportedPackage({
        db: req.db,
        payload,
        user: req.user,
        source: { via: 'manual', name: req.user.displayName || req.user.username || 'SSM User' },
      });
      saveDb(req.db);
      return res.redirect('/portal/ssl-packages?id=' + encodeURIComponent(result.pkg.id) + '&ok=' + encodeURIComponent(result.created ? 'SSL package imported for review.' : 'Existing SSL package updated.'));
    } catch (err) {
      return res.redirect('/portal/ssl-packages?error=' + encodeURIComponent(err.message));
    }
  });

  router.post('/api/ssl/packages', (req, res) => {
    try {
      verifySslPackageApiKey(req);
      const payload = parseDirectPackageBody(req.body || {});
      const result = upsertImportedPackage({
        db: req.db,
        payload,
        user: null,
        source: { via: 'api', name: 'SpeedSkateLeague Direct Submit' },
      });
      saveDb(req.db);
      return res.json({
        ok: true,
        created: result.created,
        packageId: result.pkg.id,
        sslPackageId: payload.package_id,
        status: result.pkg.status || 'pending',
        message: result.created ? 'SSL package received for SSM review.' : 'Existing SSL package updated for SSM review.',
        reviewUrl: '/portal/ssl-packages?id=' + encodeURIComponent(result.pkg.id),
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ ok: false, error: err.message });
    }
  });

  router.post('/portal/ssl-packages/:pkgId/apply', requireRole('meet_director'), (req, res) => {
    const pkgId = req.params.pkgId;
    try {
      const pkg = findPackageById(req.db, pkgId);
      if (!pkg) throw new Error('SSL package not found.');

      const meetId = String(req.body.meetId || '').trim();
      const meet = (req.db.pendingMeets || []).find(m => String(m.id) === meetId);
      if (!meet || !canEditMeet(req.user, meet)) throw new Error('You do not have permission to apply this package to that meet.');

      const result = applyPackageToMeet({ db: req.db, pkg, meet, user: req.user });
      saveDb(req.db);
      return res.redirect('/portal/ssl-packages?id=' + encodeURIComponent(pkg.id) + '&ok=' + encodeURIComponent(`Created ${result.created.length} registration${result.created.length === 1 ? '' : 's'} from SSL. Skipped ${result.skipped.length} duplicate${result.skipped.length === 1 ? '' : 's'}.`));
    } catch (err) {
      return res.redirect('/portal/ssl-packages?id=' + encodeURIComponent(pkgId) + '&error=' + encodeURIComponent(err.message));
    }
  });

  return router;
};
