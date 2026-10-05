const express = require('express');
const { nowIso } = require('../utils/date');
const { esc, cap } = require('../utils/html');
const { canEditMeet, hasRole } = require('../utils/auth');
const { sendEmail, emailHtmlWrap } = require('../services/email');
const {
  getMeetOr404, meetRinkLabel, meetDateLabel,
  usarsAge, ageForReg, ageMatch, normalizeSkaterGender, displayGenderLabel, findAgeGroup, challengeAdjustedGroup, findChallengeUpGroup,
  nextId, nextHelmetNumber, ensureRegistrationTotalsAndNumbers,
  isRegistrationClosed, isPublicMeet,
  generateAdditionalRacesForMeet, generateConfiguredRacesForMeet, ensureAtLeastOneBlock,
  buildRegistrationPricingPreview,
  hasRelayEvents,
  baseGroupsUSARS, makeQuadGroupsTemplate, applyDivisionScheme,
} = require('../services/meetHelpers');
const { calcRegistrationCost, uniqueSelectedValues } = require('../services/pricing');
const { registrationAvailability } = require('../services/registrationAvailability');
const {
  normalizeRelayTemplates,
  relayRaceExists,
  makeRelayRace,
} = require('../services/relayHelpers');
const { RELAY_DIVISION_BY_ID } = require('../services/relayDivisions');
const { buildNationalsDevRoster } = require('../services/nationalsRoster');
const october26Roster = require('../data/october26Roster');
const { MSSL_SEASON_OPENER_HEAT_GROUP_IDS } = require('../services/msslHeatPolicy');
const OCTOBER_26_ROSTER_SOURCE = 'october_26_2026_roster';
const OCTOBER_26_GROUP_CODES = [
  ['TT', 'Tiny Tot'], ['PR', 'Primary'], ['JV', 'Juvenile'], ['EL', 'Elementary'],
  ['FR', 'Freshman'], ['SO', 'Sophomore'], ['JR', 'Junior'], ['SR', 'Senior'],
  ['CL', 'Classic'], ['MA', 'Master'], ['VT', 'Veteran'], ['ES', 'Esquire'],
];
const OCTOBER_26_ELITE_SCHEDULE = {
  elementary_girls: {
    heats: [
      ['Carlie Lentz', 'Rylee Washam', 'Rosalyn Reid', 'Jabree Scott', 'Maisey Hughes-Reece'],
      ['McKinley Nigh', 'Koralyne Hick', 'Rozlyn Maness', 'Gabrielle Chesny'],
    ],
  },
  sophomore_girls: {
    heats: [
      ['Skyler Kirkhart', 'Laney Stevens', 'Aubreigh Sommer', 'Alexandria Chesny'],
      ['Stokley Shrewsbury', 'Journie Warkentin', 'Scarlett Neely', 'Anastasia Chesny'],
    ],
  },
  senior_men: {
    heats: [
      ['Carlo Balderrama', 'Casey Chavez', 'Mason Shore', 'Noah Rumfelt'],
      ['Richie Cabrera', 'Michael Coultis', 'Trenton Kramer', 'Shaun Speidel'],
    ],
  },
  freshman_girls: {
    heats: [
      ['McKinley Nigh', 'Koralyne Hick', 'Skyler Kirkhart', 'Karlee Meier', 'Alexandria Chesny'],
      ['Jabree Scott', 'Journie Warkentin', 'Anastasia Chesny', 'Maisey Hughes-Reece'],
    ],
  },
  senior_women: {
    final: ['Autumn Graves', 'Skylor Peck', 'Jaden Ramirez', 'Jaswanth Pidikidi', 'Shaylee Slawson', 'Secret Smith'],
  },
};

function october26ScheduledGroups(name) {
  const skater = String(name || '').trim().toLowerCase();
  const groups = {};
  for (const [groupId, schedule] of Object.entries(OCTOBER_26_ELITE_SCHEDULE)) {
    const heat = schedule.heats?.findIndex(names => names.some(candidate => candidate.toLowerCase() === skater));
    if (heat >= 0) groups[groupId] = heat + 1;
    else if (schedule.final?.some(candidate => candidate.toLowerCase() === skater)) groups[groupId] = 0;
  }
  return groups;
}

function applyOctober26ScheduleHeats(meet) {
  const scheduledHeatGroups = new Set(Object.entries(OCTOBER_26_ELITE_SCHEDULE)
    .filter(([, schedule]) => schedule.heats)
    .map(([groupId]) => groupId));

  // The generic generator may split a scheduled field differently from the
  // published schedule. Pool entrants across those generated heats first.
  for (const [groupId, schedule] of Object.entries(OCTOBER_26_ELITE_SCHEDULE)) {
    if (!schedule.heats) continue;
    const races = (meet.races || []).filter(race =>
      String(race.groupId) === groupId && race.division === 'elite' && race.stage === 'heat'
    );
    const entries = new Map(races.flatMap(race => race.laneEntries || []).map(entry => [
      String(entry.skaterName || '').trim().toLowerCase(), entry,
    ]));
    for (const race of races) {
      const names = schedule.heats[Number(race.heatNumber) - 1] || [];
      race.laneEntries = names.map((name, index) => {
        const entry = entries.get(name.toLowerCase());
        return entry ? { ...entry, lane: index + 1 } : null;
      }).filter(Boolean);
    }
  }

  // This meet's published schedule only has heats in the four explicitly
  // listed elite divisions. Keep any other generated fields as direct finals.
  const unscheduledFamilies = new Map();
  for (const race of meet.races || []) {
    if (race.isOpenRace || race.isQuadRace || race.isRelayRace || race.isTimeTrial ||
        !['heat', 'semi'].includes(String(race.stage || '')) || scheduledHeatGroups.has(String(race.groupId))) continue;
    const key = `${race.groupId}|${race.division}|${race.dayIndex}|${race.distanceLabel}`;
    if (!unscheduledFamilies.has(key)) unscheduledFamilies.set(key, []);
    unscheduledFamilies.get(key).push(race);
  }
  for (const [key, generated] of unscheduledFamilies) {
    const [groupId, division, dayIndex, distanceLabel] = key.split('|');
    const family = (meet.races || []).filter(race =>
      String(race.groupId) === groupId && String(race.division) === division &&
      String(race.dayIndex) === dayIndex && String(race.distanceLabel) === distanceLabel
    );
    const final = family.find(race => race.stage === 'final');
    if (!final) continue;
    const entries = generated.flatMap(race => race.laneEntries || []);
    final.laneEntries = entries.map((entry, index) => ({ ...entry, lane: index + 1 }));
    meet.races = meet.races.filter(race => !generated.includes(race));
  }
}

function october26EntryForGroup(label) {
  const text = String(label || '').toLowerCase();
  return OCTOBER_26_GROUP_CODES.find(([, name]) => text.includes(name.toLowerCase()))?.[0] || '';
}

function october26GroupForEntry(groups, code, gender, age) {
  const candidates = (groups || []).filter(group =>
    october26EntryForGroup(group.label) === code &&
    normalizeSkaterGender(group.gender) === normalizeSkaterGender(gender)
  );
  return candidates.find(group => ageMatch(group.ages, age)) || candidates[0] || null;
}

function october26ChallengeOptions(row, sourceOptions, baseGroup, meet) {
  const entries = (row.entries || []).slice(1).map(value => {
    const match = String(value || '').trim().toUpperCase().match(/^(NOV\s+)?([A-Z]{2})$/);
    return match ? { novice: !!match[1], code: match[2] } : null;
  }).filter(Boolean);
  const age = Number(row.age || 0);
  const baseGroupCode = october26EntryForGroup(baseGroup?.label);
  const isNovice = !!sourceOptions.novice || entries.some(entry => entry.novice);
  const noviceGroupIds = [...new Set(entries.filter(entry => entry.novice && entry.code === baseGroupCode)
    .map(entry => october26GroupForEntry(meet.groups, entry.code, row.gender, age)?.id).filter(Boolean).map(String))];
  const eliteEntries = entries.filter(entry => !entry.novice).filter(entry =>
    !isNovice || entry.code === baseGroupCode
  );
  const eliteGroupIds = [...new Set(eliteEntries
    .map(entry => october26GroupForEntry(meet.groups, entry.code, row.gender, age)?.id).filter(Boolean).map(String))];
  const scheduledGroups = october26ScheduledGroups(row.name);
  const baseGroupId = String(baseGroup?.id || '');
  if (isNovice) {
    for (const groupId of Object.keys(scheduledGroups)) {
      if (groupId !== baseGroupId) delete scheduledGroups[groupId];
    }
  }
  const scheduledGroupIds = new Set(Object.keys(OCTOBER_26_ELITE_SCHEDULE));
  const exactEliteGroupIds = eliteGroupIds.filter(groupId => !scheduledGroupIds.has(groupId));
  for (const groupId of Object.keys(scheduledGroups)) exactEliteGroupIds.push(groupId);
  const hasEliteEntry = eliteEntries.length > 0 || Object.keys(scheduledGroups).length > 0;
  const challengesUpByAge = !isNovice && exactEliteGroupIds.some(groupId => groupId !== baseGroupId);
  const quadEntry = String((row.entries || [])[0] || '').trim().toUpperCase().match(/^([A-Z]{2})$/);
  const quadGroup = quadEntry
    ? october26GroupForEntry(meet.quadGroups, quadEntry[1], row.gender, age)
    : null;

  return {
    novice: isNovice,
    elite: !!sourceOptions.elite || hasEliteEntry,
    challengeUp: !isNovice && (!!sourceOptions.challengeUp || challengesUpByAge),
    importedNoviceGroupIds: noviceGroupIds,
    importedEliteGroupIds: [...new Set(exactEliteGroupIds)],
    importedHeatByGroup: scheduledGroups,
    importedQuadGroupId: quadGroup?.id ? String(quadGroup.id) : '',
  };
}

const {
  rebuildRaceAssignmentsSafe, restoreBlockAssignmentsBySignature,
  raceImportSignature, raceFamilySignature, raceStageRankForRestore,
  addRaceIdsUnique, raceGenderBucketFromLabelOrGender,
  raceMatchesRegAgeGender, assignSequentialLaneEntries,
  rebuildTimeTrialRace,
} = require('../services/ttHelpers');
const { ensureCurrentRace } = require('../services/raceDay');
const { renderMeetStaffList } = require('../services/staffAssignments');
const { createBackup: createDesktopBackup } = require('../services/desktopBackupService');
const { meetHasStartedRacing, startedRacingSummary, regenConfirmed, wantsJsonAnswer } = require('../services/regenGuard');
const { renderRegenConfirm } = require('../views/regenGuardView');
const {
  ensureTimeTrialEvent,
  timeTrialEventAvailable,
  timeTrialEventTitle,
  registrationSelectedForTimeTrial,
} = require('../services/timeTrialEvents');
const {
  missingRequiredFields,
  invalidGender,
  invalidBirthdate,
  sendIfInvalid,
} = require('../utils/validate');

function timeTrialLabelForMeet(meet) {
  const event = ensureTimeTrialEvent(meet);
  return event ? timeTrialEventTitle(event) : 'Time Trials';
}

function registrationTimeTrialSelection(meet, body = {}) {
  if (!timeTrialEventAvailable(meet) || !body.timeTrials) {
    return { selected: false, eventIds: [] };
  }
  const event = ensureTimeTrialEvent(meet);
  return event ? { selected: true, eventIds: [event.id] } : { selected: false, eventIds: [] };
}

function relayRulesetForMeet(meet = {}) {
  const ruleset = String(meet.relayRuleset || meet.divisionScheme || '').toLowerCase();
  return ruleset === 'mssl' ? 'mssl' : 'usars';
}

function relayTemplateDiscipline(row = {}) {
  const div = RELAY_DIVISION_BY_ID.get(String(row.divisionId || ''));
  return String(row.discipline || div?.discipline || 'inline').toLowerCase() === 'quad' ? 'quad' : 'inline';
}

function relayTemplateSize(row = {}) {
  const div = RELAY_DIVISION_BY_ID.get(String(row.divisionId || ''));
  const n = Number(row.size || div?.size || String(row.type || '').match(/\d/)?.[0] || 0);
  return Number.isFinite(n) ? n : 0;
}

function relayTemplateLabel(row = {}) {
  const div = RELAY_DIVISION_BY_ID.get(String(row.divisionId || ''));
  const label = String(div?.label || row.label || [row.age, row.type].filter(Boolean).join(' ') || '').trim();
  const distance = String(row.distance || div?.distance || '').trim();
  return [label, distance].filter(Boolean).join(' · ');
}

function registrationRelayTemplates(meet = {}) {
  return normalizeRelayTemplates(meet.relayTemplates || [], relayRulesetForMeet(meet))
    .filter(row => row && row.enabled !== false && String(row.divisionId || '').trim())
    .map(row => ({
      ...row,
      id: String(row.divisionId || '').trim(),
      discipline: relayTemplateDiscipline(row),
      size: relayTemplateSize(row),
      displayLabel: relayTemplateLabel(row),
    }));
}

function renderRelayEventControls(meet, selectedOptions = {}, toggleSwitch) {
  const rows = registrationRelayTemplates(meet);
  const selectedIds = new Set([
    ...uniqueSelectedValues(selectedOptions.relayEventIds || selectedOptions.relayDivisionIds),
    ...uniqueSelectedValues(selectedOptions.quadRelayEventIds || selectedOptions.quadRelayDivisionIds),
  ]);
  const options = [2, 3, 4].map(size => {
    const enabledRows = rows.filter(row => row.size === size);
    if (!enabledRows.length) return '';
    const legacySelected = size === 2
      ? selectedOptions.relay2Person || selectedOptions.quadRelay2Person
      : size === 3
        ? selectedOptions.relay3Person || selectedOptions.quadRelay3Person
        : selectedOptions.relay4Person;
    const checked = legacySelected || enabledRows.some(row => selectedIds.has(row.id));
    return `<div class="toggle-row"><div><div class="toggle-row-label">${size} Person Relay</div></div>${toggleSwitch(`relay${size}Person`, checked)}</div>`;
  }).join('');
  return options ? `<div class="toggle-row" style="flex-direction:column;align-items:stretch;gap:8px"><div class="toggle-row-label">Relay Events</div>${options}</div>` : '';
}

function registrationOptionLabels(meet, opts = {}) {
  const labels = [];
  if (opts.challengeUp) labels.push('Challenge Up');
  if (opts.novice) labels.push('Novice');
  if (opts.elite) labels.push('Elite');
  if (opts.open) labels.push('Open');
  if (opts.quad) labels.push('Quad');
  if (opts.additional || opts.skateability) labels.push('Additional Races');
  if (opts.timeTrials) labels.push(timeTrialLabelForMeet(meet));
  if (opts.relay2Person || opts.quadRelay2Person) labels.push('2 Person Relay');
  if (opts.relay3Person || opts.quadRelay3Person) labels.push('3 Person Relay');
  if (opts.relay4Person) labels.push('4 Person Relay');
  return labels;
}

function registrationOptionsFromBody(meet, body = {}) {
  const available = registrationAvailability(meet);
  const tt = registrationTimeTrialSelection(meet, body);
  const relayRows = registrationRelayTemplates(meet);
  const inlineById = new Map(relayRows.filter(row => row.discipline === 'inline').map(row => [row.id, row]));
  const quadById = new Map(relayRows.filter(row => row.discipline === 'quad').map(row => [row.id, row]));
  const relay2Person = !!body.relay2Person;
  const relay3Person = !!body.relay3Person;
  const relay4Person = !!body.relay4Person;
  const selectedSizes = new Set([
    ...(relay2Person ? [2] : []),
    ...(relay3Person ? [3] : []),
    ...(relay4Person ? [4] : []),
  ]);
  const relayEventIds = relayRows.filter(row => row.discipline === 'inline' && selectedSizes.has(row.size)).map(row => row.id);
  const quadRelayEventIds = relayRows.filter(row => row.discipline === 'quad' && selectedSizes.has(row.size)).map(row => row.id);
  const inlineSelected = relayEventIds.map(id => inlineById.get(id)).filter(Boolean);
  const quadSelected = quadRelayEventIds.map(id => quadById.get(id)).filter(Boolean);
  const additionalGroupId = String(body.additionalGroupId || body.skateabilityGroupId || '');
  const additional = !!(body.additional || body.skateability) && available.additionalGroups.some(group => String(group.id || '') === additionalGroupId);
  return {
    challengeUp: available.challengeUp && !!body.challengeUp,
    novice: available.novice && !!body.novice,
    elite: available.elite && !!body.elite,
    open: available.open && !!body.open,
    quad: available.quad && !!body.quad,
    additional,
    additionalGroupId: additional ? additionalGroupId : '',
    skateability: additional,
    skateabilityGroupId: additional ? additionalGroupId : '',
    timeTrials: tt.selected,
    timeTrialEventIds: tt.eventIds,
    relayEventIds,
    relayDivisionIds: relayEventIds,
    relayEventLabels: [...new Set(inlineSelected.map(row => `${row.size} Person Relay`))],
    relay2Person: relay2Person && (inlineSelected.some(row => row.size === 2) || quadSelected.some(row => row.size === 2)),
    relay3Person: relay3Person && (inlineSelected.some(row => row.size === 3) || quadSelected.some(row => row.size === 3)),
    relay4Person: relay4Person && (inlineSelected.some(row => row.size === 4) || quadSelected.some(row => row.size === 4)),
    relays: !!(relay2Person || relay3Person || relay4Person),
    quadRelayEventIds,
    quadRelayDivisionIds: quadRelayEventIds,
    quadRelayEventLabels: [...new Set(quadSelected.map(row => `${row.size} Person Relay`))],
    quadRelay2Person: quadSelected.some(row => row.size === 2) && relay2Person,
    quadRelay3Person: quadSelected.some(row => row.size === 3) && relay3Person,
  };
}

function syncTimeTrialQueueIfEnabled(meet) {
  if (timeTrialEventAvailable(meet)) ensureTimeTrialEvent(meet);
}

module.exports = function createRegistrationRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, pageShell, saveDb, loadDb, getSessionUser, TEAM_LIST, toggleSwitch,
          renderCheckinView, renderRegisteredView } = deps;

function createDesktopBackupIfActive(db, reason, meetId = '') {
  if (process.env.SSM_DESKTOP !== '1') return;
  try { createDesktopBackup({ db, reason, meetId }); }
  catch (err) { console.warn(`Desktop backup skipped (${reason}):`, err.message); }
}

router.get('/meet/:meetId/register', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId); const data=getSessionUser(req);
  if(!isPublicMeet(meet)) return res.redirect('/meets');
  const closed=isRegistrationClosed(meet);
  const costWidget=buildRegistrationPricingPreview(meet);
  const today = new Date().toISOString().split('T')[0];
  const staffList = renderMeetStaffList(meet, { compact: true });
  const timeTrialAvailable = timeTrialEventAvailable(meet);
  const timeTrialLabel = timeTrialAvailable ? timeTrialLabelForMeet(meet) : '';
  const relayEventsAvailable = hasRelayEvents(meet);
  const available = registrationAvailability(meet);
  const relayEventControls = relayEventsAvailable ? renderRelayEventControls(meet, {}, toggleSwitch) : '';
  const singleAdditionalGroup = available.additionalGroups.length === 1 ? available.additionalGroups[0] : null;
  res.send(pageShell({title:'Register',user:data?.user||null, bodyHtml:`
    <div class="page-header"><h1>Register</h1><div class="sub">${esc(meet.meetName)}${meet.date?` • ${esc(meet.date)}`:''}</div></div>
    <div class="card">
      ${staffList}
      ${staffList ? '<div class="hr"></div>' : ''}
      ${closed?`<div class="danger" style="font-size:18px">Registration is closed.</div>`:`
        <form method="POST" action="/meet/${meet.id}/register" class="stack">
          <div class="form-grid cols-3">
            <div><label>Skater Name</label><input name="name" required /></div>
            <div><label>Date of Birth</label><input type="date" name="birthdate" min="1900-01-01" max="${today}" required /><div class="note">Used for USARS division placement (age as of Jan 1)</div></div>
            <div>
              <label>Gender</label>
              <select name="gender" required>
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <div class="note">SSM will place the skater into the correct USARS boy/girl/men/women division from birthdate.</div>
            </div>
            <div><label>Team</label><input name="team" list="teams-reg" value="Midwest Racing" /></div>
            <div><label>Email (for confirmation)</label><input type="email" name="email" placeholder="parent@email.com" /></div>
            <div><label>Sponsor (optional)</label><input name="sponsor" placeholder="Bones Bearings" /></div>
          </div>
          <datalist id="teams-reg">${TEAM_LIST.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>
          <div class="toggle-group">
            ${available.challengeUp?`<div class="toggle-row"><div><div class="toggle-row-label">Challenge Up</div></div>${toggleSwitch('challengeUp',false)}</div>`:''}
            ${available.novice?`<div class="toggle-row"><div><div class="toggle-row-label">Novice</div></div>${toggleSwitch('novice',false)}</div>`:''}
            ${available.elite?`<div class="toggle-row"><div><div class="toggle-row-label">Elite</div></div>${toggleSwitch('elite',false)}</div>`:''}
            ${available.open?`<div class="toggle-row"><div><div class="toggle-row-label">Open</div></div>${toggleSwitch('open',false)}</div>`:''}
            ${available.quad?`<div class="toggle-row"><div><div class="toggle-row-label">Quad</div></div>${toggleSwitch('quad',false)}</div>`:''}
            ${timeTrialAvailable?`<div class="toggle-row"><div><div class="toggle-row-label">${esc(timeTrialLabel)}</div></div>${toggleSwitch('timeTrials',false)}</div>`:''}
            ${relayEventControls}
            ${singleAdditionalGroup?`
              <input type="hidden" name="additionalGroupId" value="${esc(singleAdditionalGroup.id)}" />
              <div class="toggle-row"><div><div class="toggle-row-label">${esc(singleAdditionalGroup.ageGroupLabel||'Additional Race')}</div>${singleAdditionalGroup.ages?`<div class="toggle-row-desc">${esc(singleAdditionalGroup.ages)}</div>`:''}</div>${toggleSwitch('additional',false)}</div>
            `:available.additionalGroups.length?`
              <div class="toggle-row"><div><div class="toggle-row-label">Additional Races</div><div class="toggle-row-desc">Extra race division — select your group below if enabled</div></div>${toggleSwitch('additional',false)}</div>
              <div id="additional-group-row" style="display:none">
                <div class="toggle-row" style="flex-direction:column;align-items:flex-start;gap:8px">
                  <div class="toggle-row-label">Additional Race Group</div>
                  <select name="additionalGroupId" style="width:100%">
                    <option value="">— Select group —</option>
                    ${available.additionalGroups.map(sg=>`<option value="${esc(sg.id)}">${esc(sg.ageGroupLabel||'Additional Race')}${sg.ages?' ('+esc(sg.ages)+')':''}</option>`).join('')}
                  </select>
                </div>
              </div>
              <script>
                var skToggle = document.querySelector('input[name="additional"]');
                if(skToggle) skToggle.addEventListener('change', function() {
                  document.getElementById('additional-group-row').style.display = this.checked ? '' : 'none';
                });
              </script>`:''}
          </div>
          ${costWidget}
          <div><button class="btn-orange" type="submit">Register Skater</button></div>
        </form>`}
    </div>`}));
});

router.post('/meet/:meetId/register', (req, res) => {
  const db=loadDb(); const meet=getMeetOr404(db,req.params.meetId);
  if(!isPublicMeet(meet)||isRegistrationClosed(meet)) return res.redirect(`/meet/${req.params.meetId}/register`);

  const problems = [
    ...missingRequiredFields(req.body, ['name', 'birthdate', 'gender']),
  ];
  if (invalidGender(req.body.gender)) problems.push('gender must be male or female.');
  if (invalidBirthdate(req.body.birthdate)) problems.push('birthdate must be a valid past date (YYYY-MM-DD).');
  if (sendIfInvalid(req, res, problems, `/meet/${req.params.meetId}/register`)) return;

  const gender=normalizeSkaterGender(req.body.gender)||'male';
  const birthdate=String(req.body.birthdate||'').trim();
  const compAge=usarsAge(birthdate,meet.date)||Number(req.body.age||0);
  const baseGroup=findAgeGroup(meet.groups,compAge,gender);
  const regOpts=registrationOptionsFromBody(meet, req.body);
  const finalGroup=challengeAdjustedGroup(meet,baseGroup,regOpts.challengeUp);
  const meetNumber=(meet.registrations||[]).reduce((max,r)=>Math.max(max,Number(r.meetNumber)||0),0)+1;
  const regEmail=String(req.body.email||'').trim();
  const totalCost=calcRegistrationCost(meet,regOpts);
  const reg = {
    id:nextId(meet.registrations),createdAt:nowIso(),
    name:String(req.body.name||'').trim(),birthdate,age:compAge,gender,email:regEmail,
    team:String(req.body.team||'Midwest Racing').trim()||'Midwest Racing',
    sponsor:String(req.body.sponsor||'').trim(),
    divisionGroupId:finalGroup?.id||'',divisionGroupLabel:finalGroup?.label||'Unassigned',
    originalDivisionGroupId:baseGroup?.id||'',originalDivisionGroupLabel:baseGroup?.label||'',
    meetNumber,helmetNumber:nextHelmetNumber(meet),
    paid:false,checkedIn:false,totalCost,
    timeTrials:regOpts.timeTrials,
    timeTrialEventIds:regOpts.timeTrialEventIds,
    options:regOpts,
  };
  meet.registrations.push(reg);
  syncTimeTrialQueueIfEnabled(meet);
  generateAdditionalRacesForMeet(meet); rebuildRaceAssignmentsSafe(meet); ensureCurrentRace(meet); saveDb(db);
  // Send confirmation email to registrant
  if(regEmail) {
    const rink=db.rinks.find(r=>Number(r.id)===Number(meet.rinkId));
    const selectedEvents = registrationOptionLabels(meet, regOpts).join(', ') || 'None selected';
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">Registration Confirmed! 🏁</h2>
      <p>Hi ${esc(String(req.body.name||'').trim())},</p>
      <p>You're registered for <strong>${esc(meet.meetName)}</strong>!</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Date</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${esc(meet.date||'TBD')}</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Venue</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${esc(meetRinkLabel(db,meet)||'TBD')}</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Division</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${esc(finalGroup?.label||'TBD')}</strong></td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b">Selected Events</td><td style="padding:8px;border-bottom:1px solid #e2e8f0"><strong>${esc(selectedEvents)}</strong></td></tr>
        ${meet.startTime?'<tr><td style="padding:8px;color:#64748b">Start Time</td><td style="padding:8px"><strong>'+esc(meet.startTime)+'</strong></td></tr>':''}
      </table>
      <p>Follow live results on race day at <a href="https://speedskatemeet.com/meet/${meet.id}/live" style="color:#F97316">speedskatemeet.com</a></p>
      <p>Sign up for text alerts at <a href="https://speedskatemeet.com/meet/${meet.id}/alerts" style="color:#F97316">speedskatemeet.com/meet/${meet.id}/alerts</a></p>
    `);
    sendEmail(regEmail, `Registration Confirmed — ${meet.meetName}`, html, `You're registered for ${meet.meetName} on ${meet.date||'TBD'}. Selected events: ${selectedEvents}. Follow live at speedskatemeet.com`);
  }
  // Notify meet director
  const director=db.users.find(u=>Number(u.id)===Number(meet.meet_owner_user_id || meet.createdByUserId));
  if(director&&director.email) {
    const html=emailHtmlWrap(`
      <h2 style="color:#0F1F3D">New Registration 🏁</h2>
      <p><strong>${esc(String(req.body.name||'').trim())}</strong> just registered for <strong>${esc(meet.meetName)}</strong>.</p>
      <p>Total registrations: <strong>${meet.registrations.length}</strong></p>
      <p><a href="https://speedskatemeet.com/portal/meet/${meet.id}/registered" style="background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:8px">View Registrations</a></p>
    `);
    sendEmail(director.email, `New Registration — ${meet.meetName}`, html, `${String(req.body.name||'').trim()} just registered for ${meet.meetName}. Total: ${meet.registrations.length}`);
  }
  res.redirect(`/meet/${meet.id}/register?ok=1`);
});

function registrationForm(meet,reg,action,title) {
  const gender=normalizeSkaterGender(reg.gender)||'male';
  const isAdd = String(title || '').toLowerCase().includes('add');
  const today = new Date().toISOString().split('T')[0];
  const timeTrialAvailable = timeTrialEventAvailable(meet);
  const timeTrialLabel = timeTrialAvailable ? timeTrialLabelForMeet(meet) : '';
  const timeTrialSelected = timeTrialAvailable && registrationSelectedForTimeTrial(reg, ensureTimeTrialEvent(meet));
  const relayEventsAvailable = hasRelayEvents(meet);
  const available = registrationAvailability(meet);
  const relayEventControls = relayEventsAvailable ? renderRelayEventControls(meet, reg.options || {}, toggleSwitch) : '';
  const singleAdditionalGroup = available.additionalGroups.length === 1 ? available.additionalGroups[0] : null;
  return `
    <div style="max-width:760px">
      <div class="page-header"><h1>${esc(title)}</h1><div class="sub">${isAdd ? 'Manual late-entry / race-day add' : 'Update racer details and event selections'}</div></div>
      <div class="card">
        <form method="POST" action="${action}" class="stack">
          <div class="form-grid cols-3">
            <div><label>Skater Name</label><input name="name" value="${esc(reg.name||'')}" required /></div>
            <div><label>Date of Birth</label><input type="date" name="birthdate" value="${esc(reg.birthdate||'')}" min="1900-01-01" max="${today}" /><div class="note">USARS age as of Jan 1 — ${reg.birthdate?'Age '+ageForReg(reg,meet):'enter birthdate for auto age'}</div></div>
            <div><label>Gender</label>
              <select name="gender" required>
                <option value="male" ${gender==='male'?'selected':''}>Male</option>
                <option value="female" ${gender==='female'?'selected':''}>Female</option>
              </select>
              <div class="note">Division is auto-calculated from birthdate and gender.</div>
            </div>
            <div><label>Team</label><input name="team" list="teams-edit" value="${esc(reg.team||'Midwest Racing')}" /></div>
            <div><label>Sponsor (optional)</label><input name="sponsor" value="${esc(reg.sponsor||'')}" /></div>
            <div><label>Email (optional)</label><input type="email" name="email" value="${esc(reg.email||'')}" /></div>
          </div>
          <datalist id="teams-edit">${TEAM_LIST.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>

          <div class="card" style="background:#f8fafc;border:1px solid var(--border);padding:14px">
            <div class="row between center" style="gap:12px;flex-wrap:wrap">
              <div>
                <div style="font-weight:800;color:var(--navy)">${isAdd ? 'Race-Day Defaults' : 'Race-Day Status'}</div>
                <div class="note">Helmet can be left blank to auto-assign the next available number.</div>
              </div>
              <div class="form-grid cols-3" style="flex:1;min-width:320px">
                <div><label>Helmet #</label><input name="helmetNumber" value="${esc(reg.helmetNumber||'')}" inputmode="numeric" placeholder="auto" /></div>
                <div class="toggle-row" style="margin:0"><div><div class="toggle-row-label">Paid</div></div>${toggleSwitch('paid',!!reg.paid)}</div>
                <div class="toggle-row" style="margin:0"><div><div class="toggle-row-label">Checked In</div></div>${toggleSwitch('checkedIn',!!reg.checkedIn)}</div>
              </div>
            </div>
          </div>

          <div class="toggle-group">
            ${available.challengeUp?`<div class="toggle-row"><div><div class="toggle-row-label">Challenge Up</div></div>${toggleSwitch('challengeUp',!!reg.options?.challengeUp)}</div>`:''}
            ${available.novice?`<div class="toggle-row"><div><div class="toggle-row-label">Novice</div></div>${toggleSwitch('novice',!!reg.options?.novice)}</div>`:''}
            ${available.elite?`<div class="toggle-row"><div><div class="toggle-row-label">Elite</div></div>${toggleSwitch('elite',!!reg.options?.elite)}</div>`:''}
            ${available.open?`<div class="toggle-row"><div><div class="toggle-row-label">Open</div></div>${toggleSwitch('open',!!reg.options?.open)}</div>`:''}
            ${available.quad?`<div class="toggle-row"><div><div class="toggle-row-label">Quad</div></div>${toggleSwitch('quad',!!reg.options?.quad)}</div>`:''}
            ${timeTrialAvailable?`<div class="toggle-row"><div><div class="toggle-row-label">${esc(timeTrialLabel)}</div></div>${toggleSwitch('timeTrials',timeTrialSelected)}</div>`:''}
            ${relayEventControls}
            ${singleAdditionalGroup?`
              <input type="hidden" name="additionalGroupId" value="${esc(singleAdditionalGroup.id)}" />
              <div class="toggle-row"><div><div class="toggle-row-label">${esc(singleAdditionalGroup.ageGroupLabel||'Additional Race')}</div>${singleAdditionalGroup.ages?`<div class="toggle-row-desc">${esc(singleAdditionalGroup.ages)}</div>`:''}</div>${toggleSwitch('additional',!!(reg.options?.additional||reg.options?.skateability))}</div>
            `:available.additionalGroups.length?`
              <div class="toggle-row"><div><div class="toggle-row-label">Additional Races</div><div class="toggle-row-desc">Extra race division</div></div>${toggleSwitch('additional',!!(reg.options?.additional||reg.options?.skateability))}</div>
              <div id="edit-additional-group-row" style="${(reg.options?.additional||reg.options?.skateability)?'':'display:none'}">
                <div class="toggle-row" style="flex-direction:column;align-items:flex-start;gap:8px">
                  <div class="toggle-row-label">Additional Race Group</div>
                  <select name="additionalGroupId" style="width:100%">
                    <option value="">— Select group —</option>
                    ${available.additionalGroups.map(sg=>`<option value="${esc(sg.id)}" ${String((reg.options?.additionalGroupId||reg.options?.skateabilityGroupId)||'')===String(sg.id)?'selected':''}>${esc(sg.ageGroupLabel||'Additional Race')}${sg.ages?' ('+esc(sg.ages)+')':''}</option>`).join('')}
                  </select>
                </div>
              </div>
              <script>
                var editSkToggle = document.querySelector('input[name="additional"]');
                if(editSkToggle) editSkToggle.addEventListener('change', function() {
                  document.getElementById('edit-additional-group-row').style.display = this.checked ? '' : 'none';
                });
              </script>`:''}
          </div>
          ${buildRegistrationPricingPreview(meet)}
          <div class="action-row">
            <button class="btn" type="submit">${isAdd ? 'Add Racer' : 'Save Racer'}</button>
            <a class="btn2" href="/portal/meet/${meet.id}/registered">Back</a>
          </div>
        </form>
      </div>
    </div>`;
}

// ── Registered ────────────────────────────────────────────────────────────────




// ── Dev Import: deterministic race-sizing stress-test roster ────────────────
// Super-admin only. This is intentionally server-side so production users never see it.
function testRosterGenderForAge(row) {
  const age = Number(row.age || 0);
  const g = String(row.gender || '').toLowerCase();
  if (age >= 16) {
    if (g === 'boys' || g === 'men' || g === 'male') return 'men';
    if (g === 'girls' || g === 'women' || g === 'female') return 'women';
  }
  if (g === 'men' || g === 'boys' || g === 'male') return 'boys';
  if (g === 'women' || g === 'girls' || g === 'female') return 'girls';
  return g || 'boys';
}

function springFlingOptionObject(row, meet) {
  const opts = new Set((row.options || []).map(x => String(x || '').trim()).filter(Boolean));
  const firstAdditional = (meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups || []).find(g => g && g.enabled);
  return {
    challengeUp: false,
    novice: opts.has('novice'),
    elite: opts.has('elite'),
    open: opts.has('open'),
    quad: opts.has('quad'),
    timeTrials: opts.has('open') || opts.has('timeTrials'),
    relay2Person: opts.has('relay2Person'),
    relay3Person: opts.has('relay3Person'),
    relay4Person: opts.has('relay4Person'),
    relays: opts.has('relay2Person') || opts.has('relay3Person') || opts.has('relay4Person'),
    quadRelay2Person: opts.has('quadRelay2Person'),
    quadRelay3Person: opts.has('quadRelay3Person'),
    additional: opts.has('additional'),
    additionalGroupId: opts.has('additional') && firstAdditional ? String(firstAdditional.id || '') : '',
    // temporary compatibility aliases for older screens/calculators
    skateability: opts.has('additional'),
    skateabilityGroupId: opts.has('additional') && firstAdditional ? String(firstAdditional.id || '') : '',
  };
}


// Real 2026 Indoor Nationals field: 347 skaters (name-merged — official sheets
// list some people under two numbers), national-sized age groups (Elementary
// Girls 29, Senior Men 21, …) for stress-testing race generation against the
// actual bracket paths (direct final / heats / heats+semis). Each skater imports
// under their REAL Nationals helmet number with their real event participation.
function importNationalsRoster(meet, { replace = true, checkedIn = true, paid = true, mergeDisciplines = false } = {}) {
  const previousBlocks = JSON.parse(JSON.stringify(meet.blocks || []));
  const previousRaces = JSON.parse(JSON.stringify(meet.races || []));

  if (replace) {
    meet.registrations = [];
  } else {
    meet.registrations = (meet.registrations || []).filter(r => r.importSource !== 'nationals_2026_roster');
  }

  let nextRegId = nextId(meet.registrations || []);
  let nextMeetNumber = (meet.registrations || []).reduce((max, r) => Math.max(max, Number(r.meetNumber) || 0), 0) + 1;

  for (const row of buildNationalsDevRoster({ mergeDisciplines })) {
    const gender = testRosterGenderForAge(row);
    const age = Number(row.age || 0);
    const baseGroup = findAgeGroup(meet.groups || [], age, gender);
    const options = springFlingOptionObject(row, meet);
    // Keep the skater's REAL Nationals helmet number as both meet number and
    // helmet number, so the dev meet lines up 1:1 with the printed heat sheets
    // and answer key (#37 in SSM = #37 on the official sheets). Helmets are
    // unique in the source data; fall back to sequential only if absent.
    const realHelmet = Number(String(row.helmet || '').trim());
    const skaterNumber = Number.isFinite(realHelmet) && realHelmet > 0 ? realHelmet : nextMeetNumber++;
    const reg = {
      id: nextRegId++,
      createdAt: nowIso(),
      importSource: 'nationals_2026_roster',
      name: String(row.name || '').trim(),
      age,
      gender,
      team: String(row.team || 'Independent').trim() || 'Independent',
      sponsor: '',
      divisionGroupId: baseGroup?.id || '',
      divisionGroupLabel: baseGroup?.label || 'Unassigned',
      originalDivisionGroupId: baseGroup?.id || '',
      originalDivisionGroupLabel: baseGroup?.label || '',
      meetNumber: skaterNumber,
      birthdate: '',
      email: '',
      helmetNumber: skaterNumber,
      paid: !!paid,
      checkedIn: !!checkedIn,
      totalCost: 0,
      options,
    };
    reg.totalCost = calcRegistrationCost(meet, reg.options);
    meet.registrations.push(reg);
  }

  generateConfiguredRacesForMeet(meet);
  rebuildRaceAssignmentsSafe(meet);
  restoreBlockAssignmentsBySignature(meet, previousBlocks, previousRaces);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  return meet.registrations.filter(r => r.importSource === 'nationals_2026_roster').length;
}


function importOctober26Roster(meet, { replace = true, checkedIn = false, paid = false } = {}) {
  meet.automaticHeatGroupIds = [...MSSL_SEASON_OPENER_HEAT_GROUP_IDS];
  const previousBlocks = JSON.parse(JSON.stringify(meet.blocks || []));
  const previousRaces = JSON.parse(JSON.stringify(meet.races || []));
  if (replace) meet.registrations = [];
  else meet.registrations = (meet.registrations || []).filter(r => r.importSource !== OCTOBER_26_ROSTER_SOURCE);

  let nextRegId = nextId(meet.registrations || []);
  let nextMeetNumber = (meet.registrations || []).reduce((max, r) => Math.max(max, Number(r.meetNumber) || 0), 0) + 1;
  for (const row of october26Roster) {
    const age = Number(row.age || 0);
    const gender = testRosterGenderForAge({ age, gender: row.gender });
    const baseGroup = findAgeGroup(meet.groups || [], age, gender);
    const source = row.options || {};
    const eventOptions = october26ChallengeOptions(row, source, baseGroup, meet);
    const options = {
      novice: eventOptions.novice,
      elite: eventOptions.elite,
      challengeUp: eventOptions.challengeUp,
      importedNoviceGroupIds: eventOptions.importedNoviceGroupIds,
      importedEliteGroupIds: eventOptions.importedEliteGroupIds,
      importedQuadGroupId: eventOptions.importedQuadGroupId,
      importedHeatByGroup: eventOptions.importedHeatByGroup,
      open: !!source.open,
      quad: !!source.quad,
      timeTrials: false,
      // Relays are built manually in Relay Builder from age-eligible skaters.
      // Do not auto-create relay races or charge relay entries in this dev import.
      relay2Person: false,
      relay3Person: false,
      relay4Person: false,
      relays: false,
    };
    const numericHelmet = Number(row.helmetNumber);
    const meetNumber = Number.isFinite(numericHelmet) && numericHelmet > 0 ? numericHelmet : nextMeetNumber++;
    const helmet = String(row.helmetNumber || '').trim() || meetNumber;
    const reg = {
      id: nextRegId++, createdAt: nowIso(), importSource: OCTOBER_26_ROSTER_SOURCE,
      name: String(row.name || '').trim(), age, gender,
      team: String(row.team || 'Independent').trim() || 'Independent', sponsor: '',
      divisionGroupId: baseGroup?.id || '', divisionGroupLabel: baseGroup?.label || 'Unassigned',
      originalDivisionGroupId: baseGroup?.id || '', originalDivisionGroupLabel: baseGroup?.label || '',
      meetNumber, birthdate: String(row.birthdate || ''), email: '', helmetNumber: helmet,
      paid: !!paid, checkedIn: !!checkedIn, totalCost: 0,
      notes: `October entries: ${(row.entries || []).filter(Boolean).join(' / ')}`,
      options,
    };
    reg.totalCost = calcRegistrationCost(meet, reg.options);
    meet.registrations.push(reg);
  }
  generateConfiguredRacesForMeet(meet);
  // Relay teams are selected later in Relay Builder; keep this import focused on
  // individual/quad/open races and remove any template-generated relay races.
  meet.races = (meet.races || []).filter(race => !race.isRelayRace);
  rebuildRaceAssignmentsSafe(meet);
  applyOctober26ScheduleHeats(meet);
  restoreBlockAssignmentsBySignature(meet, previousBlocks, previousRaces);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  meet.updatedAt = nowIso();
  return meet.registrations.filter(r => r.importSource === OCTOBER_26_ROSTER_SOURCE).length;
}

router.get('/portal/meet/:meetId/dev/import-spring-fling', requireRole('super_admin'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');
  res.send(pageShell({ title: 'Dev Import', user: req.user, meet, activeTab: 'registered', bodyHtml: `
    <div class="page-header"><h1>Dev Import Mode</h1><div class="sub">${esc(meet.meetName)} • Training and race-generation rosters</div></div>
    ${req.query.usarsSetup ? `<div class="card" style="border-left:5px solid #16a34a;background:rgba(22,163,74,.07);margin-bottom:18px"><strong>✓ Full USARS meet set up.</strong> All ${baseGroupsUSARS().length} age divisions and ${makeQuadGroupsTemplate().length} quad divisions are enabled with the SR832 tiebreaker. Import the 2026 Nationals roster below, then generate races.</div>` : ''}
    <div class="card" style="border-left:5px solid var(--orange)">
      <div class="chip chip-orange" style="margin-bottom:8px">Step 1 · One-click setup</div>
      <h2 style="margin:0">Set up a full USARS meet</h2>
      <p class="note" style="margin-top:10px">Turns this meet into a complete USARS national setup in one click: all <strong>age divisions</strong> (Tiny Tot → Premier, elite), all <strong>quad divisions</strong>, and relays enabled — the tiebreaker set to USARS SR832. Then use <strong>Import 2026 Nationals Roster</strong> below and generate races.</p>
      <div class="stat-grid" style="margin:16px 0">
        <div class="stat-card navy"><div class="stat-label">Age divisions</div><div class="stat-value">${baseGroupsUSARS().length}</div></div>
        <div class="stat-card sky"><div class="stat-label">Quad divisions</div><div class="stat-value">${makeQuadGroupsTemplate().length}</div></div>
        <div class="stat-card orange"><div class="stat-label">Currently enabled</div><div class="stat-value">${(meet.groups||[]).filter(g=>g.divisions&&(g.divisions.elite?.enabled||g.divisions.novice?.enabled)).length}</div></div>
      </div>
      <p class="note" style="color:var(--muted)">Note: individual + quad races generate automatically from the imported roster. <strong>Inline and quad relays</strong> are built in the Relay Builder (teams are assigned by hand).</p>
      <form method="POST" action="/portal/meet/${meet.id}/dev/setup-usars" class="stack" onsubmit="return confirm('Set up a full USARS meet? This enables every age + quad division and relays on this meet, and sets the SR832 tiebreaker. It does not touch registrations.');">
        <div class="action-row">
          <button class="btn-orange" type="submit">Set Up Full USARS Meet</button>
          <a class="btn2" href="/portal/meet/${meet.id}/builder">Open Meet Builder</a>
        </div>
      </form>
    </div>
    <div class="card card-accent" style="margin-top:18px">
      <h2 style="margin-top:24px">2026 Nationals Roster (${buildNationalsDevRoster().length} skaters)</h2>
      <div class="note">Real 2026 Indoor Nationals field — every skater under their REAL helmet number with their real event entries (inline, quad, relays, quad relays), national-sized age groups (Elementary Girls 29, Senior Men 21, …) for stress-testing race generation across every bracket path. Flip <strong>USARS National divisions</strong> on in Meet Builder first so the full division set is available.</div>
      <form method="POST" action="/portal/meet/${meet.id}/dev/import-nationals" class="stack" onsubmit="return confirm('Import the 2026 Nationals roster (${buildNationalsDevRoster().length} skaters)? This can replace current registrations, but it will preserve your block layout.');">
        <div class="toggle-group">
          <div class="toggle-row"><div><div class="toggle-row-label">Replace current registrations</div><div class="toggle-row-desc">Recommended when testing the full national meet workflow.</div></div>${toggleSwitch('replace', true)}</div>
          <div class="toggle-row"><div><div class="toggle-row-label">Mark skaters paid</div></div>${toggleSwitch('paid', true)}</div>
          <div class="toggle-row"><div><div class="toggle-row-label">Mark skaters checked in</div></div>${toggleSwitch('checkedIn', true)}</div>
          <div class="toggle-row"><div><div class="toggle-row-label">One profile per skater (demo mode)</div><div class="toggle-row-desc">Combines a dual-discipline skater's inline + quad + relays onto ONE registration under their inline number — no duplicate names at check-in (how real SSM registrations look). Leave OFF for Nationals-faithful per-discipline entries that match the printed sheets and answer key by helmet.</div></div>${toggleSwitch('mergeProfiles', false)}</div>
        </div>
        <div class="action-row">
          <button class="btn-orange" type="submit" name="action" value="import">Import 2026 Nationals Roster</button>
          <button class="btn-danger" type="submit" name="action" value="clear" onclick="return confirm('Clear only the Nationals roster registrations?')">Clear Nationals Rows</button>
          <a class="btn2" href="/portal/meet/${meet.id}/registered">Back to Registered</a>
        </div>
      </form>

      <h2 style="margin-top:24px">October 26 Race Import (${october26Roster.length} skaters)</h2>
      <div class="note">Roster exported from the October Wichita workbook: names, DOBs, teams, helmet numbers, and the October event columns. Entries are loaded with novice/elite, open, quad, relay, and Challenge Up flags.</div>
      <form method="POST" action="/portal/meet/${meet.id}/dev/import-october-26" class="stack" onsubmit="return confirm('Import the October 26 roster (${october26Roster.length} skaters)?');">
        <div class="toggle-group">
          <div class="toggle-row"><div><div class="toggle-row-label">Replace current registrations</div><div class="toggle-row-desc">Recommended for loading the October roster into a clean dev meet.</div></div>${toggleSwitch('replace', true)}</div>
          <div class="toggle-row"><div><div class="toggle-row-label">Mark skaters paid</div></div>${toggleSwitch('paid', false)}</div>
          <div class="toggle-row"><div><div class="toggle-row-label">Mark skaters checked in</div></div>${toggleSwitch('checkedIn', false)}</div>
        </div>
        <div class="action-row">
          <button class="btn-orange" type="submit" name="action" value="import">Import October 26 Race Roster</button>
          <button class="btn-danger" type="submit" name="action" value="clear" onclick="return confirm('Clear only the October 26 roster registrations?')">Clear October Rows</button>
          <a class="btn2" href="/portal/meet/${meet.id}/registered">Back to Registered</a>
        </div>
      </form>

    </div>` }));
});

// One-click full USARS national setup: every age division (elite) + every quad
// division, relays enabled, SR832 tiebreaker. Individual + quad races then
// generate from the imported roster; inline and quad relays are built in the
// Relay Builder (teams assigned by hand). Does not touch registrations.
router.post('/portal/meet/:meetId/dev/setup-usars', requireRole('super_admin'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');
  createDesktopBackupIfActive(req.db, 'before_usars_setup', meet.id);
  // Same single source of truth as the Meet Builder "USARS National" button
  // (applyDivisionScheme): full 34 elite-enabled age divisions, all quads, relays,
  // SR832, usarsDivisions flag. They drifted once — the builder button set only
  // the age groups, producing incomplete "USARS" meets — never let them diverge.
  applyDivisionScheme(meet, true);
  ensureAtLeastOneBlock(meet);
  meet.updatedAt = nowIso();
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/dev/import-spring-fling?usarsSetup=1`);
});

router.post('/portal/meet/:meetId/dev/import-nationals', requireRole('super_admin'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const previousBlocks = JSON.parse(JSON.stringify(meet.blocks || []));
  const previousRaces = JSON.parse(JSON.stringify(meet.races || []));

  if (String(req.body.action || '') === 'clear') {
    createDesktopBackupIfActive(req.db, 'before_import_clear', meet.id);
    meet.registrations = (meet.registrations || []).filter(reg => reg.importSource !== 'nationals_2026_roster');
    createDesktopBackupIfActive(req.db, 'before_race_generation', meet.id);
    generateConfiguredRacesForMeet(meet);
    rebuildRaceAssignmentsSafe(meet);
    restoreBlockAssignmentsBySignature(meet, previousBlocks, previousRaces);
    ensureAtLeastOneBlock(meet);
    ensureCurrentRace(meet);
    saveDb(req.db);
    return res.redirect(`/portal/meet/${meet.id}/registered?devCleared=1`);
  }

  createDesktopBackupIfActive(req.db, 'before_import', meet.id);
  createDesktopBackupIfActive(req.db, 'before_race_generation', meet.id);
  const count = importNationalsRoster(meet, {
    replace: !!req.body.replace,
    checkedIn: !!req.body.checkedIn,
    paid: !!req.body.paid,
    mergeDisciplines: !!req.body.mergeProfiles,
  });
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/registered?devImported=${count}`);
});



router.post('/portal/meet/:meetId/dev/import-october-26', requireRole('super_admin'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');
  const previousBlocks = JSON.parse(JSON.stringify(meet.blocks || []));
  const previousRaces = JSON.parse(JSON.stringify(meet.races || []));
  if (String(req.body.action || '') === 'clear') {
    meet.registrations = (meet.registrations || []).filter(r => r.importSource !== OCTOBER_26_ROSTER_SOURCE);
    generateConfiguredRacesForMeet(meet);
    rebuildRaceAssignmentsSafe(meet);
    restoreBlockAssignmentsBySignature(meet, previousBlocks, previousRaces);
    ensureAtLeastOneBlock(meet); ensureCurrentRace(meet); saveDb(req.db);
    return res.redirect(`/portal/meet/${meet.id}/registered?devCleared=1`);
  }
  const count = importOctober26Roster(meet, {
    replace: !!req.body.replace, checkedIn: !!req.body.checkedIn, paid: !!req.body.paid,
  });
  saveDb(req.db);
  return res.redirect(`/portal/meet/${meet.id}/registered?devImported=${count}`);
});


function normalizePackageMeetId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/^ssm[-_:]/i, '');
}

function packageTargetsMeet(pkg, meet) {
  const payload = pkg && pkg.payload ? pkg.payload : {};
  const pMeet = payload.meet || {};
  const meetId = normalizePackageMeetId(meet && meet.id);
  const candidateIds = [
    pMeet.ssm_meet_id,
    pMeet.ssmMeetId,
    pMeet.meet_id,
    pMeet.meetId,
    pMeet.ssl_meet_id,
    pMeet.id,
  ].map(normalizePackageMeetId).filter(Boolean);

  if (meetId && candidateIds.includes(meetId)) return true;

  const urlText = [
    pMeet.registration_url,
    pMeet.ssm_url,
    pMeet.url,
  ].map(v => String(v || '')).join(' ');
  if (meetId && new RegExp('/meet/' + meetId + '(/|$)').test(urlText)) return true;

  const title = String(pMeet.title || pMeet.meet_title || '').trim().toLowerCase();
  const meetTitle = String(meet && meet.meetName || '').trim().toLowerCase();
  const date = String(pMeet.date || pMeet.meet_date || pMeet.event_date || '').slice(0, 10);
  const meetDate = String(meet && meet.date || '').slice(0, 10);
  const league = String(pMeet.league || pMeet.leagueAssociation || '').trim().toLowerCase();
  const meetLeague = String(meet && (meet.leagueAssociation || meet.league) || '').trim().toLowerCase();

  return !!title && title === meetTitle && (!date || !meetDate || date === meetDate) && (!league || !meetLeague || league === meetLeague);
}

function sslSubmissionSummaryForMeet(db, meet) {
  const packages = Array.isArray(db.sslRegistrationPackages) ? db.sslRegistrationPackages : [];
  const matching = packages.filter(pkg =>
    String(pkg.status || '').toLowerCase() !== 'deleted' &&
    packageTargetsMeet(pkg, meet)
  );
  const pending = matching.filter(pkg => String(pkg.status || 'pending').toLowerCase() === 'pending');
  const applied = matching.filter(pkg => String(pkg.status || '').toLowerCase() === 'applied');
  const latest = matching.slice().sort((a, b) => String(b.lastReceivedAt || b.updatedAt || b.createdAt || '').localeCompare(String(a.lastReceivedAt || a.updatedAt || a.createdAt || '')))[0] || null;
  return {
    total: matching.length,
    pending: pending.length,
    applied: applied.length,
    latestTeam: String(latest?.payload?.team || '').trim(),
    latestAt: latest?.lastReceivedAt || latest?.updatedAt || latest?.createdAt || '',
  };
}

router.get('/portal/meet/:meetId/registered', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  ensureRegistrationTotalsAndNumbers(meet); saveDb(req.db);

  res.send(pageShell({
    title:'Registered',
    user:req.user,
    meet,
    activeTab:'registered',
    bodyHtml:renderRegisteredView({ meet, isSuperAdmin: hasRole(req.user,'super_admin'), query:req.query || {}, sslSubmissionSummary: sslSubmissionSummaryForMeet(req.db, meet) })
  }));
});



router.get('/portal/meet/:meetId/registered/add', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const nextMeetNumber=(meet.registrations||[]).reduce((max,r)=>Math.max(max,Number(r.meetNumber)||0),0)+1;
  const blankReg={
    id:'', name:'', birthdate:'', age:'', gender:'male', team:'Midwest Racing', sponsor:'', email:'',
    meetNumber:nextMeetNumber, helmetNumber:'', paid:false, checkedIn:false,
    options:{elite:true},
  };
  res.send(pageShell({
    title:'Add Racer',
    user:req.user,
    meet,
    activeTab:'registered',
    bodyHtml:registrationForm(meet,blankReg,`/portal/meet/${meet.id}/registered/add`,'Add Racer')
  }));
});

router.post('/portal/meet/:meetId/registered/add', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');

  const problems = [...missingRequiredFields(req.body, ['name'])];
  if (invalidGender(req.body.gender)) problems.push('gender must be male or female.');
  if (invalidBirthdate(req.body.birthdate)) problems.push('birthdate must be a valid past date (YYYY-MM-DD).');
  if (sendIfInvalid(req, res, problems, `/portal/meet/${meet.id}/registered/add`)) return;

  const gender=normalizeSkaterGender(req.body.gender)||'male';
  const birthdate=String(req.body.birthdate||'').trim();
  const compAge=usarsAge(birthdate,meet.date)||Number(req.body.age||0);
  const baseGroup=findAgeGroup(meet.groups,compAge,gender);
  const regOpts=registrationOptionsFromBody(meet, req.body);
  const finalGroup=challengeAdjustedGroup(meet,baseGroup,regOpts.challengeUp);
  const meetNumber=(meet.registrations||[]).reduce((max,r)=>Math.max(max,Number(r.meetNumber)||0),0)+1;
  const requestedHelmet=Number(req.body.helmetNumber || 0);
  const helmetNumber=Number.isFinite(requestedHelmet)&&requestedHelmet>0 ? requestedHelmet : nextHelmetNumber(meet);
  const totalCost=calcRegistrationCost(meet,regOpts);
  const reg={
    id:nextId(meet.registrations),
    createdAt:nowIso(),
    name:String(req.body.name||'').trim(),
    birthdate,
    age:compAge,
    gender,
    email:String(req.body.email||'').trim(),
    team:String(req.body.team||'Midwest Racing').trim()||'Midwest Racing',
    sponsor:String(req.body.sponsor||'').trim(),
    originalDivisionGroupId:baseGroup?.id||'',
    originalDivisionGroupLabel:baseGroup?.label||'',
    divisionGroupId:finalGroup?.id||'',
    divisionGroupLabel:finalGroup?.label||'Unassigned',
    meetNumber,
    helmetNumber,
    paid:!!req.body.paid,
    checkedIn:!!req.body.checkedIn,
    totalCost,
    timeTrials:regOpts.timeTrials,
    timeTrialEventIds:regOpts.timeTrialEventIds,
    options:regOpts,
    addedByStaff:true,
    addedAt:nowIso(),
  };
  meet.registrations.push(reg);
  syncTimeTrialQueueIfEnabled(meet);
  generateAdditionalRacesForMeet(meet);
  rebuildRaceAssignmentsSafe(meet);
  ensureCurrentRace(meet);
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/registered?added=${encodeURIComponent(reg.name || '1')}`);
});

router.get('/portal/meet/:meetId/registered/:regId/edit', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);
  res.send(pageShell({title:'Edit Racer',user:req.user,meet,activeTab:'registered', bodyHtml:registrationForm(meet,reg,`/portal/meet/${meet.id}/registered/${reg.id}/edit`,'Edit Racer')}));
});

router.post('/portal/meet/:meetId/registered/:regId/edit', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);

  const problems = [...missingRequiredFields(req.body, ['name'])];
  if (invalidGender(req.body.gender)) problems.push('gender must be male or female.');
  if (invalidBirthdate(req.body.birthdate)) problems.push('birthdate must be a valid past date (YYYY-MM-DD).');
  if (sendIfInvalid(req, res, problems, `/portal/meet/${meet.id}/registered/${reg.id}/edit`)) return;

  const gender=normalizeSkaterGender(req.body.gender)||'male';
  const birthdate=String(req.body.birthdate||'').trim()||reg.birthdate||'';
  const compAge=usarsAge(birthdate,meet.date)||Number(reg.age||0);
  const baseGroup=findAgeGroup(meet.groups,compAge,gender);
  const regOpts=registrationOptionsFromBody(meet, req.body);
  const finalGroup=challengeAdjustedGroup(meet,baseGroup,regOpts.challengeUp);
  const requestedHelmet=Number(req.body.helmetNumber || 0);
  Object.assign(reg,{name:String(req.body.name||'').trim(),birthdate,age:compAge,gender,email:String(req.body.email||'').trim(),team:String(req.body.team||'Midwest Racing').trim()||'Midwest Racing',sponsor:String(req.body.sponsor||'').trim(),originalDivisionGroupId:baseGroup?.id||'',originalDivisionGroupLabel:baseGroup?.label||'',divisionGroupId:finalGroup?.id||'',divisionGroupLabel:finalGroup?.label||'Unassigned',helmetNumber:Number.isFinite(requestedHelmet)&&requestedHelmet>0 ? requestedHelmet : reg.helmetNumber,paid:!!req.body.paid,checkedIn:!!req.body.checkedIn,timeTrials:regOpts.timeTrials,timeTrialEventIds:regOpts.timeTrialEventIds,options:regOpts,totalCost:calcRegistrationCost(meet,regOpts)});
  syncTimeTrialQueueIfEnabled(meet);
  generateAdditionalRacesForMeet(meet); rebuildRaceAssignmentsSafe(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/registered`);
});

router.get('/portal/meet/:meetId/registered/:regId/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(!reg) return res.redirect(`/portal/meet/${meet.id}/registered`);
  res.send(pageShell({title:'Delete Racer',user:req.user,meet,activeTab:'registered', bodyHtml:`
    <div style="max-width:500px;margin:40px auto">
      <div class="page-header"><h1>Delete Racer</h1></div>
      <div class="card">
        <div class="danger" style="margin-bottom:12px">Remove ${esc(reg.name)} from all race assignments?</div>
        <form method="POST" action="/portal/meet/${meet.id}/registered/${reg.id}/delete" class="action-row">
          <button class="btn-danger" type="submit">Delete Racer</button>
          <a class="btn2" href="/portal/meet/${meet.id}/registered">Cancel</a>
        </form>
      </div>
    </div>`}));
});

router.post('/portal/meet/:meetId/registered/:regId/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  meet.registrations=(meet.registrations||[]).filter(r=>Number(r.id)!==Number(req.params.regId));
  syncTimeTrialQueueIfEnabled(meet);
  rebuildRaceAssignmentsSafe(meet); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/registered`);
});

function registrationOpsRedirect(meet, req, extra = '') {
  const returnTo = String(req.query.returnTo || req.body.returnTo || '').trim();
  const suffix = extra ? (extra.startsWith('?') ? extra : '?' + extra) : '';
  if (returnTo === 'checkin') return `/portal/meet/${meet.id}/checkin${suffix}`;
  return `/portal/meet/${meet.id}/registered${suffix}`;
}

router.post('/portal/meet/:meetId/assign-races', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  // Rebuild Assignments rebuilds the race set with fresh lane entries — after
  // racing has started that wipes entered places/times. Confirm before wiping,
  // and back up first so it's recoverable.
  const returnTo = String(req.query.returnTo || '');
  if (meetHasStartedRacing(meet) && !regenConfirmed(req)) {
    // The iPad's Block Builder / front-desk Rebuild buttons post here with
    // Accept: application/json and can't render the HTML confirm page — give
    // them a clean 409 instead of an interstitial.
    if (wantsJsonAnswer(req)) {
      const s = startedRacingSummary(meet);
      return res.status(409).json({
        ok: false,
        error: `Races have already been scored (${s.closed} closed) — rebuilding assignments would erase those results, so it's locked from the app. To rebuild anyway, use the website's Registered page, which asks for an explicit confirmation.`,
      });
    }
    return res.send(pageShell({
      title: 'Confirm Rebuild', user: req.user, meet, activeTab: 'registered',
      bodyHtml: renderRegenConfirm({
        meet,
        actionUrl: `/portal/meet/${meet.id}/assign-races${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`,
        actionLabel: 'Rebuilding assignments',
        cancelUrl: registrationOpsRedirect(meet, req, ''),
        summary: startedRacingSummary(meet),
      }),
    }));
  }
  createDesktopBackupIfActive(req.db, 'before_race_generation', meet.id);
  rebuildRaceAssignmentsSafe(meet);
  ensureCurrentRace(meet);
  saveDb(req.db);

  if (String(req.query.returnTo || '') === 'race-actions') {
    return res.redirect(`/portal/meet/${meet.id}/race-actions?rebuilt=1`);
  }
  if (String(req.query.returnTo || '') === 'blocks') {
    return res.redirect(`/portal/meet/${meet.id}/blocks?rebuilt=1`);
  }

  res.redirect(registrationOpsRedirect(meet, req, 'rebuilt=1'));
});

// ── Check-In ──────────────────────────────────────────────────────────────────

router.get('/portal/meet/:meetId/checkin', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  ensureRegistrationTotalsAndNumbers(meet); saveDb(req.db);

  res.send(pageShell({
    title:'Check-In',
    user:req.user,
    meet,
    activeTab:'checkin',
    bodyHtml:renderCheckinView({ meet, query:req.query || {} })
  }));
});

// Optional absolute setter for the two check-in toggles. When the POST body
// carries paid/checkedIn, assign that value instead of inverting, so a
// stale client's tap becomes an idempotent no-op rather than a reversal
// (two front-desk stations can otherwise undo each other). Website forms
// post no body field and keep today's toggle behavior unchanged.
function requestedToggleValue(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'boolean') return raw;
  return ['1', 'true', 'on', 'yes'].includes(String(raw).trim().toLowerCase());
}

router.post('/portal/meet/:meetId/checkin/toggle-paid/:regId', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(reg){
    const wanted = requestedToggleValue(req.body && req.body.paid);
    reg.paid = wanted === null ? !reg.paid : wanted;
  }
  saveDb(req.db);
  res.redirect(registrationOpsRedirect(meet, req, 'paid=1'));
});

router.post('/portal/meet/:meetId/checkin/bulk-mark-paid', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  let count = 0;
  for(const reg of meet.registrations || []) {
    if(!reg.paid) count += 1;
    reg.paid = true;
  }
  saveDb(req.db);
  res.redirect(registrationOpsRedirect(meet, req, `paid=${count}`));
});

router.post('/portal/meet/:meetId/checkin/toggle-checkin/:regId', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(reg){
    const wanted = requestedToggleValue(req.body && req.body.checkedIn);
    reg.checkedIn = wanted === null ? !reg.checkedIn : wanted;
  }
  saveDb(req.db);
  res.redirect(registrationOpsRedirect(meet, req, 'checkedIn=1'));
});

router.post('/portal/meet/:meetId/checkin/helmet/:regId', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(reg) reg.helmetNumber=Number(req.body.helmetNumber||'')||'';
  rebuildRaceAssignmentsSafe(meet);
  saveDb(req.db);
  res.redirect(registrationOpsRedirect(meet, req, 'helmetUpdated=1'));
});

router.post('/portal/meet/:meetId/checkin/reassign-helmets', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  let n = Math.max(1, Number(req.body.startHelmet || 1) || 1);
  const start = n;
  const sorted = [...(meet.registrations || [])].sort((a, b) => {
    const byMeetNumber = Number(a.meetNumber || 0) - Number(b.meetNumber || 0);
    if (byMeetNumber !== 0) return byMeetNumber;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  for(const reg of sorted) reg.helmetNumber = n++;
  rebuildRaceAssignmentsSafe(meet);
  saveDb(req.db);
  res.redirect(registrationOpsRedirect(meet, req, `helmetsAssigned=${start}`));
});


// ── Time Trial Builder removed: Time Trials are controlled from Meet Builder ─────
router.get('/portal/meet/:meetId/time-trials', requireRole('meet_director'), (req, res) => {
  res.redirect(`/portal/meet/${req.params.meetId}/builder#time-trials`);
});

router.post('/portal/meet/:meetId/time-trials/save', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  meet.timeTrialsEnabled=!!req.body.timeTrialsEnabled;
  if(meet.openGroups) {
    meet.openGroups=normalizeOpenGroups(meet.openGroups).map(g=>({...g,timeTrial:!!meet.timeTrialsEnabled,ttDistance:'100m'}));
  }
  rebuildTimeTrialRace(meet);
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  meet.updatedAt=nowIso();
  saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/builder?saved=1#time-trials`);
});

  return router;
};
