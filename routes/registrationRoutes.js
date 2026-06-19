const express = require('express');
const { nowIso } = require('../utils/date');
const { esc, cap } = require('../utils/html');
const { canEditMeet, hasRole } = require('../utils/auth');
const { sendEmail, emailHtmlWrap } = require('../services/email');
const {
  getMeetOr404, meetRinkLabel, meetDateLabel,
  usarsAge, ageForReg, normalizeSkaterGender, displayGenderLabel, findAgeGroup, challengeAdjustedGroup, findChallengeUpGroup,
  nextId, nextHelmetNumber, ensureRegistrationTotalsAndNumbers,
  isRegistrationClosed, isPublicMeet,
  generateAdditionalRacesForMeet, ensureAtLeastOneBlock,
  buildRegistrationPricingPreview,
  hasRelayEvents,
} = require('../services/meetHelpers');
const { calcRegistrationCost } = require('../services/pricing');
const {
  normalizeRelayTemplates,
  relayRaceExists,
  makeRelayRace,
} = require('../services/relayHelpers');
const SPRING_FLING_TEST_ROSTER = require('../data/springFlingRoster.json');
const {
  rebuildRaceAssignmentsSafe, restoreBlockAssignmentsBySignature,
  raceImportSignature, raceFamilySignature, raceStageRankForRestore,
  addRaceIdsUnique, raceGenderBucketFromLabelOrGender,
  raceMatchesRegAgeGender, assignSequentialLaneEntries,
  rebuildTimeTrialRace,
} = require('../services/ttHelpers');
const { ensureCurrentRace } = require('../services/raceDay');
const { renderMeetStaffList } = require('../services/staffAssignments');
const {
  ensureTimeTrialEvent,
  timeTrialEventAvailable,
  timeTrialEventTitle,
  registrationSelectedForTimeTrial,
} = require('../services/timeTrialEvents');

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

function registrationOptionLabels(meet, opts = {}) {
  const labels = [];
  if (opts.challengeUp) labels.push('Challenge Up');
  if (opts.novice) labels.push('Novice');
  if (opts.elite) labels.push('Elite');
  if (opts.open) labels.push('Open');
  if (opts.quad) labels.push('Quad');
  if (opts.additional || opts.skateability) labels.push('Additional Races');
  if (opts.timeTrials) labels.push(timeTrialLabelForMeet(meet));
  if (opts.relay2Person) labels.push('2 Person Relay');
  if (opts.relay3Person) labels.push('3 Person Relay');
  if (opts.relay4Person) labels.push('4 Person Relay');
  return labels;
}

function registrationOptionsFromBody(meet, body = {}) {
  const tt = registrationTimeTrialSelection(meet, body);
  return {
    challengeUp: !!body.challengeUp,
    novice: !!body.novice,
    elite: !!body.elite,
    open: !!body.open,
    quad: !!body.quad,
    additional: !!(body.additional || body.skateability),
    additionalGroupId: String(body.additionalGroupId || body.skateabilityGroupId || ''),
    skateability: !!(body.additional || body.skateability),
    skateabilityGroupId: String(body.additionalGroupId || body.skateabilityGroupId || ''),
    timeTrials: tt.selected,
    timeTrialEventIds: tt.eventIds,
    relay2Person: !!body.relay2Person,
    relay3Person: !!body.relay3Person,
    relay4Person: !!body.relay4Person,
    relays: !!(body.relay2Person || body.relay3Person || body.relay4Person),
  };
}

function syncTimeTrialQueueIfEnabled(meet) {
  if (timeTrialEventAvailable(meet)) ensureTimeTrialEvent(meet);
}

module.exports = function createRegistrationRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, pageShell, saveDb, loadDb, getSessionUser, TEAM_LIST, toggleSwitch,
          renderCheckinView, renderRegisteredView } = deps;

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
            <div class="toggle-row"><div><div class="toggle-row-label">Challenge Up</div></div>${toggleSwitch('challengeUp',false)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Novice</div></div>${toggleSwitch('novice',false)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Elite</div></div>${toggleSwitch('elite',false)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Open</div></div>${toggleSwitch('open',false)}</div>
            ${(meet.quadGroups||[]).some(g=>g.enabled)?`<div class="toggle-row"><div><div class="toggle-row-label">Quad</div></div>${toggleSwitch('quad',false)}</div>`:''}
            ${timeTrialAvailable?`<div class="toggle-row"><div><div class="toggle-row-label">${esc(timeTrialLabel)}</div></div>${toggleSwitch('timeTrials',false)}</div>`:''}
            ${relayEventsAvailable?`<div class="toggle-row"><div><div class="toggle-row-label">2 Person Relay</div></div>${toggleSwitch('relay2Person',false)}</div><div class="toggle-row"><div><div class="toggle-row-label">3 Person Relay</div></div>${toggleSwitch('relay3Person',false)}</div><div class="toggle-row"><div><div class="toggle-row-label">4 Person Relay</div></div>${toggleSwitch('relay4Person',false)}</div>`:''}
            ${(meet.additionalGroups||meet.additionalRaceGroups||meet.additionalRaces||meet.skateabilityGroups||[]).length?`
              <div class="toggle-row"><div><div class="toggle-row-label">Additional Races</div><div class="toggle-row-desc">Extra race division — select your group below if enabled</div></div>${toggleSwitch('additional',false)}</div>
              <div id="additional-group-row" style="display:none">
                <div class="toggle-row" style="flex-direction:column;align-items:flex-start;gap:8px">
                  <div class="toggle-row-label">Additional Race Group</div>
                  <select name="additionalGroupId" style="width:100%">
                    <option value="">— Select group —</option>
                    ${(meet.additionalGroups||meet.additionalRaceGroups||meet.additionalRaces||meet.skateabilityGroups||[]).map(sg=>`<option value="${esc(sg.id)}">${esc(sg.ageGroupLabel||'Additional Race')}${sg.ages?' ('+esc(sg.ages)+')':''}</option>`).join('')}
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
  const gender=normalizeSkaterGender(req.body.gender)||'male';
  const birthdate=String(req.body.birthdate||'').trim();
  const compAge=usarsAge(birthdate,meet.date)||Number(req.body.age||0);
  const baseGroup=findAgeGroup(meet.groups,compAge,gender);
  const finalGroup=challengeAdjustedGroup(meet,baseGroup,!!req.body.challengeUp);
  const meetNumber=(meet.registrations||[]).reduce((max,r)=>Math.max(max,Number(r.meetNumber)||0),0)+1;
  const regEmail=String(req.body.email||'').trim();
  const regOpts=registrationOptionsFromBody(meet, req.body);
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
            <div class="toggle-row"><div><div class="toggle-row-label">Challenge Up</div></div>${toggleSwitch('challengeUp',!!reg.options?.challengeUp)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Novice</div></div>${toggleSwitch('novice',!!reg.options?.novice)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Elite</div></div>${toggleSwitch('elite',!!reg.options?.elite)}</div>
            <div class="toggle-row"><div><div class="toggle-row-label">Open</div></div>${toggleSwitch('open',!!reg.options?.open)}</div>
            ${(meet.quadGroups||[]).some(g=>g.enabled)?`<div class="toggle-row"><div><div class="toggle-row-label">Quad</div></div>${toggleSwitch('quad',!!reg.options?.quad)}</div>`:''}
            ${timeTrialAvailable?`<div class="toggle-row"><div><div class="toggle-row-label">${esc(timeTrialLabel)}</div></div>${toggleSwitch('timeTrials',timeTrialSelected)}</div>`:''}
            ${relayEventsAvailable?`<div class="toggle-row"><div><div class="toggle-row-label">2 Person Relay</div></div>${toggleSwitch('relay2Person',!!reg.options?.relay2Person)}</div><div class="toggle-row"><div><div class="toggle-row-label">3 Person Relay</div></div>${toggleSwitch('relay3Person',!!reg.options?.relay3Person)}</div><div class="toggle-row"><div><div class="toggle-row-label">4 Person Relay</div></div>${toggleSwitch('relay4Person',!!reg.options?.relay4Person)}</div>`:''}
            ${(meet.additionalGroups||meet.additionalRaceGroups||meet.additionalRaces||meet.skateabilityGroups||[]).length?`
              <div class="toggle-row"><div><div class="toggle-row-label">Additional Races</div><div class="toggle-row-desc">Extra race division</div></div>${toggleSwitch('additional',!!(reg.options?.additional||reg.options?.skateability))}</div>
              <div id="edit-additional-group-row" style="${(reg.options?.additional||reg.options?.skateability)?'':'display:none'}">
                <div class="toggle-row" style="flex-direction:column;align-items:flex-start;gap:8px">
                  <div class="toggle-row-label">Additional Race Group</div>
                  <select name="additionalGroupId" style="width:100%">
                    <option value="">— Select group —</option>
                    ${(meet.additionalGroups||meet.additionalRaceGroups||meet.additionalRaces||meet.skateabilityGroups||[]).map(sg=>`<option value="${esc(sg.id)}" ${String((reg.options?.additionalGroupId||reg.options?.skateabilityGroupId)||'')===String(sg.id)?'selected':''}>${esc(sg.ageGroupLabel||'Additional Race')}${sg.ages?' ('+esc(sg.ages)+')':''}</option>`).join('')}
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




// ── Dev Import: Wichita Spring Fling realistic stress-test roster ───────────
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
    additional: opts.has('additional'),
    additionalGroupId: opts.has('additional') && firstAdditional ? String(firstAdditional.id || '') : '',
    // temporary compatibility aliases for older screens/calculators
    skateability: opts.has('additional'),
    skateabilityGroupId: opts.has('additional') && firstAdditional ? String(firstAdditional.id || '') : '',
  };
}


function importSpringFlingTestRoster(meet, { replace = true, checkedIn = true, paid = true } = {}) {
  const previousBlocks = JSON.parse(JSON.stringify(meet.blocks || []));
  const previousRaces = JSON.parse(JSON.stringify(meet.races || []));

  if (replace) {
    meet.registrations = [];
  } else {
    meet.registrations = (meet.registrations || []).filter(r => r.importSource !== 'spring_fling_2026_test');
  }

  let nextRegId = nextId(meet.registrations || []);
  let nextMeetNumber = (meet.registrations || []).reduce((max, r) => Math.max(max, Number(r.meetNumber) || 0), 0) + 1;

  for (const row of SPRING_FLING_TEST_ROSTER) {
    const gender = testRosterGenderForAge(row);
    const age = Number(row.age || 0);
    const baseGroup = findAgeGroup(meet.groups || [], age, gender);
    const options = springFlingOptionObject(row, meet);
    const reg = {
      id: nextRegId++,
      createdAt: nowIso(),
      importSource: 'spring_fling_2026_test',
      name: String(row.name || '').trim(),
      age,
      gender,
      team: String(row.team || 'Independent').trim() || 'Independent',
      sponsor: '',
      divisionGroupId: baseGroup?.id || '',
      divisionGroupLabel: baseGroup?.label || 'Unassigned',
      originalDivisionGroupId: baseGroup?.id || '',
      originalDivisionGroupLabel: baseGroup?.label || '',
      meetNumber: nextMeetNumber++,
      birthdate: '',
      email: '',
      helmetNumber: Number(row.helmetNumber || 0) || '',
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
  return meet.registrations.filter(r => r.importSource === 'spring_fling_2026_test').length;
}

router.get('/portal/meet/:meetId/dev/import-spring-fling', requireRole('super_admin'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');
  const testCount = (meet.registrations || []).filter(r => r.importSource === 'spring_fling_2026_test').length;
  res.send(pageShell({ title: 'Dev Import', user: req.user, meet, activeTab: 'registered', bodyHtml: `
    <div class="page-header"><h1>Dev Import Mode</h1><div class="sub">${esc(meet.meetName)} • Wichita Spring Fling test roster</div></div>
    <div class="card card-accent">
      <h2>Load realistic test registrations</h2>
      <p class="note">Imports ${SPRING_FLING_TEST_ROSTER.length} skaters from the Spring Fling screenshots. This preserves your saved blocks/templates, then rebuilds race lane entries for testing.</p>
      <div class="stat-grid" style="margin:18px 0">
        <div class="stat-card navy"><div class="stat-label">Current registrations</div><div class="stat-value">${(meet.registrations || []).length}</div></div>
        <div class="stat-card sky"><div class="stat-label">Existing test rows</div><div class="stat-value">${testCount}</div></div>
        <div class="stat-card orange"><div class="stat-label">Import size</div><div class="stat-value">${SPRING_FLING_TEST_ROSTER.length}</div></div>
      </div>
      <form method="POST" action="/portal/meet/${meet.id}/dev/import-spring-fling" class="stack" onsubmit="return confirm('Import Spring Fling test roster? This can replace current registrations, but it will preserve your block layout.');">
        <div class="toggle-group">
          <div class="toggle-row"><div><div class="toggle-row-label">Replace current registrations</div><div class="toggle-row-desc">Recommended for a clean stress test. Blocks and races are preserved/remapped.</div></div>${toggleSwitch('replace', true)}</div>
          <div class="toggle-row"><div><div class="toggle-row-label">Mark skaters paid</div></div>${toggleSwitch('paid', true)}</div>
          <div class="toggle-row"><div><div class="toggle-row-label">Mark skaters checked in</div></div>${toggleSwitch('checkedIn', true)}</div>
        </div>
        <div class="action-row">
          <button class="btn-orange" type="submit" name="action" value="import">Import Test Roster</button>
          <button class="btn-danger" type="submit" name="action" value="clear" onclick="return confirm('Clear only Spring Fling test registrations?')">Clear Test Rows</button>
          <a class="btn2" href="/portal/meet/${meet.id}/registered">Back to Registered</a>
        </div>
      </form>
    </div>` }));
});

router.post('/portal/meet/:meetId/dev/import-spring-fling', requireRole('super_admin'), (req, res) => {
  const meet = getMeetOr404(req.db, req.params.meetId);
  if (!meet) return res.redirect('/portal');
  if (!canEditMeet(req.user, meet)) return res.status(403).send('Forbidden');

  const previousBlocks = JSON.parse(JSON.stringify(meet.blocks || []));
  const previousRaces = JSON.parse(JSON.stringify(meet.races || []));

  if (String(req.body.action || '') === 'clear') {
    meet.registrations = (meet.registrations || []).filter(r => r.importSource !== 'spring_fling_2026_test');
    generateConfiguredRacesForMeet(meet);
    rebuildRaceAssignmentsSafe(meet);
    restoreBlockAssignmentsBySignature(meet, previousBlocks, previousRaces);
    ensureAtLeastOneBlock(meet);
    ensureCurrentRace(meet);
    saveDb(req.db);
    return res.redirect(`/portal/meet/${meet.id}/registered?devCleared=1`);
  }

  const count = importSpringFlingTestRoster(meet, {
    replace: !!req.body.replace,
    checkedIn: !!req.body.checkedIn,
    paid: !!req.body.paid,
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
  const gender=normalizeSkaterGender(req.body.gender)||'male';
  const birthdate=String(req.body.birthdate||'').trim();
  const compAge=usarsAge(birthdate,meet.date)||Number(req.body.age||0);
  const baseGroup=findAgeGroup(meet.groups,compAge,gender);
  const finalGroup=challengeAdjustedGroup(meet,baseGroup,!!req.body.challengeUp);
  const meetNumber=(meet.registrations||[]).reduce((max,r)=>Math.max(max,Number(r.meetNumber)||0),0)+1;
  const requestedHelmet=Number(req.body.helmetNumber || 0);
  const helmetNumber=Number.isFinite(requestedHelmet)&&requestedHelmet>0 ? requestedHelmet : nextHelmetNumber(meet);
  const regOpts=registrationOptionsFromBody(meet, req.body);
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
  const gender=normalizeSkaterGender(req.body.gender)||'male';
  const birthdate=String(req.body.birthdate||'').trim()||reg.birthdate||'';
  const compAge=usarsAge(birthdate,meet.date)||Number(reg.age||0);
  const baseGroup=findAgeGroup(meet.groups,compAge,gender);
  const finalGroup=challengeAdjustedGroup(meet,baseGroup,!!req.body.challengeUp);
  const regOpts=registrationOptionsFromBody(meet, req.body);
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
  rebuildRaceAssignmentsSafe(meet);
  ensureCurrentRace(meet);
  saveDb(req.db);

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

router.post('/portal/meet/:meetId/checkin/toggle-paid/:regId', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  const reg=(meet.registrations||[]).find(r=>Number(r.id)===Number(req.params.regId));
  if(reg) reg.paid=!reg.paid;
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
  if(reg) reg.checkedIn=!reg.checkedIn;
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
