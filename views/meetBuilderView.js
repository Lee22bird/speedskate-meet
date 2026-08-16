const { esc } = require('../utils/html');
const { hasRole, isSuperAdmin, isMeetOwner, canManageMeetSettings } = require('../utils/auth');
const { renderMeetStaffManager } = require('../services/staffAssignments');
const { meetBuilderThemeCss, builderHeaderHtml, sectionHeadHtml } = require('./meetBuilderTheme');

const LEAGUE_ASSOCIATION_OPTIONS = [
  { value: '', label: 'None / Independent' },
  { value: 'MSSL', label: 'MSSL — Mid South Speed League' },
  { value: 'Southern Speed League', label: 'Southern Speed League' },
  { value: 'All Star Speed League', label: 'All Star Speed League' },
  { value: 'MWPS', label: 'MWPS — Midwest Point Series' },
  { value: 'Florida Speed League', label: 'Florida Speed League' },
  { value: 'GLSL', label: 'GLSL — Great Lakes Speed League' },
  { value: 'South Central Speed Skating', label: 'South Central Speed Skating' },
  { value: 'SWPISL', label: 'SWPISL — Southwest Pacific Inline Speed League' },
  { value: 'TRIPOD_CUP', label: 'Tripod Cup Racing Series' },
  { value: 'TRIPLE_CROWN', label: 'Triple Crown' },
  { value: 'USARS', label: 'USA Roller Sports' },
];

function renderLeagueAssociationOptions(value) {
  const current = String(value || '').trim();
  const known = new Set(LEAGUE_ASSOCIATION_OPTIONS.map(row => row.value));
  const rows = known.has(current) ? LEAGUE_ASSOCIATION_OPTIONS : [
    ...LEAGUE_ASSOCIATION_OPTIONS,
    { value: current, label: current },
  ];
  return rows.map(row => `<option value="${esc(row.value)}" ${String(row.value) === current ? 'selected' : ''}>${esc(row.label)}</option>`).join('');
}

function toggleSwitch(name, checked, label='', value='on') {
  return `
    <label class="toggle-wrap">
      <input type="checkbox" name="${esc(name)}" value="${esc(value)}" class="toggle-input" ${checked?'checked':''} />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      ${label?`<span class="toggle-label">${esc(label)}</span>`:''}
    </label>`;
}

function makeAdditionalRaceSlots(raw) {
  const saved = Array.isArray(raw) ? raw : [];
  return [0,1,2,3].map(i => {
    const id = 'manual_extra_' + (i + 1);
    const match = saved.find(x => String(x.id || '') === id) || {};
    let label = String(match.ageGroupLabel || match.title || '').trim();

    if (!label || /^manual extra race/i.test(label)) {
      label = `Additional ${i + 1}`;
    }

    return {
      id,
      ageGroupId: '',
      ageGroupLabel: label,
      ages: String(match.ages || '').trim(),
      enabled: !!match.enabled,
      distances: Array.isArray(match.distances) ? [0,1,2].map(n => String(match.distances[n] || '').trim()) : ['', '', ''],
    };
  });
}

function dateTimeLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : raw;
}

function renderMeetBuilderView({ db, meet, user = null, query = {} }) {
  const rinkInputValue = String(meet.customRinkName || '').trim() || (() => { const r = db.rinks.find(x => Number(x.id) === Number(meet.rinkId)); return r ? `${r.name} (${r.city || ''}${r.city && r.state ? ', ' : ''}${r.state || ''})` : ''; })();
  const rinkDataList=db.rinks.map(r=>`<option value="${esc(r.name)} (${esc(r.city||'')}${r.city&&r.state?', ':''}${esc(r.state||'')})" data-id="${r.id}"></option>`).join('');
  const rinkLookupScript=JSON.stringify((db.rinks||[]).map(r=>({id:r.id,label:`${r.name} (${r.city||''}${r.city&&r.state?', ':''}${r.state||''})`,name:r.name})));
  const openEnabledCount=(meet.openGroups||[]).filter(g=>g.enabled).length;
  const quadEnabledCount=(meet.quadGroups||[]).filter(g=>g.enabled).length;
  const savedFlash=query.saved?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Meet saved successfully.</div></div>':'';
  const presetSavedFlash=query.presetSaved?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Meet setup preset saved for future use.</div></div>':'';
  const presetLoadedFlash=query.presetLoaded?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Meet setup preset loaded into this meet.</div></div>':'';
  const presetDeletedFlash=query.presetDeleted?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ Meet setup preset deleted.</div></div>':'';
  const ownershipFlash=query.ownership?'<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">Ownership updated.</div></div>':'';
  const errorFlash=query.error?`<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">${esc(query.error)}</div></div>`:'';
  const canDeleteSetupPresets = hasRole(user || {}, 'super_admin');
  const superOverride = isSuperAdmin(user || {}) && !isMeetOwner(user || {}, meet);
  const staffPanel = renderMeetStaffManager({ meet, canManage: canManageMeetSettings(user || {}, meet) });
  const desktopPinEnabled = !!String(meet.desktop_pin_hash || '').trim();
  const desktopPinPanel = `
    <div class="card" style="margin-bottom:16px;border-left:5px solid var(--orange)">
      <div class="row between center" style="gap:12px;flex-wrap:wrap;align-items:flex-start">
        <div>
          <h2 style="margin:0 0 4px">Open Meet on Desktop</h2>
          <div class="note">Generate a 6-digit meet-day PIN for SSM Desktop. The PIN unlocks this meet only and is shown once after reset.</div>
          <div class="note" style="margin-top:8px">
            Status: <strong>${desktopPinEnabled ? 'PIN set' : 'No PIN set'}</strong>
            ${desktopPinEnabled && meet.desktop_pin_expires_at ? ` • Expires ${esc(dateTimeLabel(meet.desktop_pin_expires_at))}` : ''}
          </div>
        </div>
        <div class="action-row" style="margin:0">
          <form method="POST" action="/portal/meet/${esc(meet.id)}/desktop-pin/generate" style="margin:0">
            <button class="btn-orange" type="submit">${desktopPinEnabled ? 'Reset PIN' : 'Generate PIN'}</button>
          </form>
          ${desktopPinEnabled ? `
            <a class="btn2" href="/desktop/meet/${esc(meet.id)}/unlock">Open</a>
            <form method="POST" action="/portal/meet/${esc(meet.id)}/desktop-pin/clear" style="margin:0" onsubmit="return confirm('Clear the desktop PIN for this meet? Existing desktop unlocks will stop working.');">
              <button class="btn-danger" type="submit">Clear PIN</button>
            </form>
          ` : ''}
        </div>
      </div>
    </div>`;
  const desktopImportPanel = process.env.SSM_DESKTOP === '1' ? '' : `
    <div class="card" style="margin-bottom:16px;border-left:5px solid var(--sky)">
      <h2 style="margin:0 0 4px">📥 Run This Meet Offline</h2>
      <div class="note" style="margin-bottom:10px">To run this entire meet without internet at the rink, download it into SpeedSkateMeet Desktop:</div>
      <ol style="line-height:1.8;color:var(--text);padding-left:20px;margin:0">
        <li>Open <strong>SpeedSkateMeet Desktop</strong> on your Mac.</li>
        <li>Go to <strong>Portal → Import Meet</strong>.</li>
        <li>Log in with this same account, then select <strong>${esc(meet.meetName || 'this meet')}</strong> to download it.</li>
      </ol>
      <div class="note" style="margin-top:10px">This is a one-time download — the desktop copy then works fully offline and is separate from this online meet.</div>
    </div>`;
  const ownerName = String(meet.meet_owner_name || meet.createdByName || meet.createdBy || '').trim() || 'Unassigned';
  const ownerOptions = (db.users || [])
    .filter(u => u.active !== false && Array.isArray(u.roles) && (u.roles.includes('meet_director') || u.roles.includes('super_admin')))
    .map(u => `<option value="${esc(String(u.id))}" ${Number(u.id) === Number(meet.meet_owner_user_id) ? 'selected' : ''}>${esc(u.displayName || u.username || u.email || ('User ' + u.id))}</option>`)
    .join('');
  const ownershipPanel = `
    <div class="card" style="margin-bottom:16px">
      <div class="row between center" style="gap:12px;flex-wrap:wrap">
        <div>
          <div class="bold">Owner: ${esc(ownerName)}</div>
          <div class="note">${superOverride ? 'Super Admin override active.' : 'Only the meet owner or Super Admin can change this meet.'}</div>
        </div>
        ${isSuperAdmin(user || {}) ? `
          <form method="POST" action="/portal/meet/${meet.id}/ownership" class="action-row">
            <select name="ownerUserId" required>${ownerOptions}</select>
            <button class="btn2" type="submit">Assign Owner</button>
          </form>` : ''}
      </div>
    </div>`;
  const setupPresetOptions = (db.setupPresets||[]).map(p=>`<option value="${esc(p.id)}">${esc(p.name||p.presetName||'Preset')}</option>`).join('');
  const presetSelectHtml = `${query.clearPreset?'<option value="" selected>Choose a preset</option>':''}${setupPresetOptions||'<option value="">(no presets)</option>'}`;
  const meetStatus = String(meet.status || 'draft').toLowerCase();
  const isPublished = meetStatus === 'published' || meetStatus === 'live' || meetStatus === 'complete' || meet.isPublic === true;
  const statusLabel = isPublished ? 'Published' : 'Draft';
  const statusBadgeClass = isPublished ? 'published' : 'draft';
  const ttEvent = meet.timeTrialEvent || {};

  function divCardHtml(group, gi, divKey) {
    const div=group.divisions[divKey];
    const colors={novice:'var(--sky2)',elite:'var(--navy)'};
    const ageRange = String(div.ages||'').trim() || String(group.ages||'').trim();
    return '<div class="group-div-card">' +
      '<div class="row between center" style="margin-bottom:10px">' +
        '<div style="font-weight:700;font-size:14px;color:'+colors[divKey]+'">'+divKey.toUpperCase()+'</div>' +
        toggleSwitch('g_'+gi+'_'+divKey+'_enabled', div.enabled) +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:10px">' +
        '<div style="flex:1"><label>Age Range</label><input name="g_'+gi+'_'+divKey+'_ages" value="'+esc(ageRange)+'" placeholder="10-11" /></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:flex-end">' +
        '<div style="flex:1"><label>D1</label><input name="g_'+gi+'_'+divKey+'_d1" value="'+esc(div.distances[0]||'')+'" placeholder="200m" /></div>' +
        '<div style="flex:1"><label>D2</label><input name="g_'+gi+'_'+divKey+'_d2" value="'+esc(div.distances[1]||'')+'" placeholder="500m" /></div>' +
        '<div style="flex:1"><label>D3</label><input name="g_'+gi+'_'+divKey+'_d3" value="'+esc(div.distances[2]||'')+'" placeholder="1000m" /></div>' +
        '<input type="hidden" name="g_'+gi+'_'+divKey+'_d4" value="'+esc(div.distances[3]||'')+'" />' +
      '</div>' +
    '</div>';
  }
  const groupsRows=[];
  for(let i=0;i<meet.groups.length;i+=2) {
    const L=meet.groups[i]; const R=meet.groups[i+1];
    const Lcards=['novice','elite'].map(d=>divCardHtml(L,i,d)).join('');
    const Rcards=R?['novice','elite'].map(d=>divCardHtml(R,i+1,d)).join(''):'';
    groupsRows.push(
      '<div class="group-pair-row">' +
        '<div class="group-pair-col">' +
          '<div class="group-pair-header"><span class="group-pair-name">'+esc(L.label)+'</span></div>' +
          Lcards +
        '</div>' +
        (R?'<div class="group-pair-col">' +
          '<div class="group-pair-header"><span class="group-pair-name">'+esc(R.label)+'</span></div>' +
          Rcards +
        '</div>':'') +
      '</div>'
    );
  }
  const groupsHtml=groupsRows.join('');

  // Header meta + fee explainer + light section completeness (theme, display only).
  const _base = Number(meet.baseEntryFee || 0), _add = Number(meet.additionalRaceFee || 0), _cap = Number(meet.maxRegistrationFee || 0);
  const _cost = (n) => { let c = _base + Math.max(0, n - 1) * _add; if (_cap > 0) c = Math.min(c, _cap); return c; };
  const _capHits5 = _cap > 0 && (_base + 4 * _add) > _cap;
  const feeExplainerHtml = `<div class="mb-fee-explain"><div class="mb-fee-explain-title">So a skater pays\u2026</div><div class="mb-fee-chips"><span class="mb-fee-chip"><strong>$${_cost(1)}</strong><span>for 1 event</span></span><span class="mb-fee-chip"><strong>$${_cost(3)}</strong><span>for 3</span></span><span class="mb-fee-chip${_capHits5 ? ' is-cap' : ''}"><strong>$${_cost(5)}</strong><span>for 5${_capHits5 ? ' \u2014 cap hits here' : ''}</span></span></div></div>`;
  const _metaParts = [ meet.date ? esc(String(meet.date)) : '', rinkInputValue || '', meet.registrationCloseAt ? ('reg closes ' + esc(meet.registrationCloseAt.slice(0,10))) : '' ].filter(Boolean);
  const builderMetaLine = _metaParts.join('  \u00b7  ');
  const _s1done = !!String(meet.meetName || '').trim();
  const _s2done = _base > 0 || !!meet.registrationCloseAt;
  const _s3done = Number(meet.trackLength || 0) > 0 && Number(meet.lanes || 0) > 0;
  const builderDoneCount = [_s1done, _s2done, _s3done].filter(Boolean).length;
  const builderEncouragement = builderDoneCount >= 3 ? 'The basics are set \u2014 divisions are next.' : 'A few basics left \u2014 you can save anytime.';


  return `
    <style>${meetBuilderThemeCss()}</style>
    <div class="page-header"><h1>Meet Builder</h1><div class="sub">${esc(meet.meetName)}</div></div>
    ${builderHeaderHtml({ meet, statusLabel, statusBadgeClass, doneCount: builderDoneCount, totalCount: 6, metaLine: builderMetaLine, encouragement: builderEncouragement })}
    ${savedFlash}
    ${presetSavedFlash}
    ${presetLoadedFlash}
    ${presetDeletedFlash}
    ${ownershipFlash}
    ${errorFlash}

    <form id="meetBuilderForm" method="POST" action="/portal/meet/${meet.id}/builder/save" class="stack">

      <div class="mb-section tone-sky">
        ${sectionHeadHtml({ n:1, icon:'🏟', tone:'sky', title:'What meet is this?', sub:'Name, dates, and venue', state:_s1done?'done':'todo' })}
        <div class="mb-body">
          <div class="setup-mini-card setup-mini-card-primary">
                <div class="setup-mini-title">Meet Identity</div>
                <div class="setup-fields">
                  <div class="setup-field-full"><label>Meet Name</label><input name="meetName" value="${esc(meet.meetName)}" required /></div>
                  <div class="setup-field-full"><label>League Association</label><select name="leagueAssociation">${renderLeagueAssociationOptions(meet.leagueAssociation || meet.league || '')}</select><div class="note">Optional. This tells SpeedSkateLeague which league schedule this meet belongs to. Teams from any SSL league can still register.</div></div>
                </div>
              </div>
              
          <div class="setup-mini-card">
                <div class="setup-mini-title">Event Schedule</div>
                <div class="setup-fields">
                  <div><label>Start Date</label><input type="date" name="date" value="${esc(meet.date)}" /></div>
                  <div>
                    <label>Optional End Date</label>
                    <div class="date-clear-row">
                      <input type="date" id="endDateInput" name="endDate" value="${esc(meet.endDate||'')}" />
                      <button class="date-clear-btn" type="button" onclick="document.getElementById('endDateInput').value=''">Clear</button>
                    </div>
                    <div class="note">Leave blank for a single-day meet.</div>
                  </div>
                  <div class="setup-field-full"><label>Start Time</label><input type="time" name="startTime" value="${esc(meet.startTime)}" /></div>
                </div>
              </div>
              
          <div class="setup-mini-card">
                <div class="setup-mini-title">Schedule Notes</div>
                <div class="setup-fields">
                  <div class="setup-field-full">
                    <label>Multi-Day Schedule Notes</label>
                    <textarea name="scheduleNotes" rows="5" placeholder="Friday: Doors open 5:00 PM, racing 6:00 PM&#10;Saturday: Warmups 7:30 AM, racing 8:30 AM&#10;Sunday: Finals and awards schedule...">${esc(meet.scheduleNotes||'')}</textarea>
                    <div class="note">Use this for day-by-day start times, warmups, doors-open times, awards, or schedule changes.</div>
                  </div>
                </div>
              </div>
            
          <div class="setup-mini-card setup-mini-card-primary">
                <div class="setup-mini-title">Rink Selection</div>
                <div class="setup-fields">
                  <div class="setup-field-full"><label>Rink</label>
                    <input name="rinkSearch" id="rinkSearch" list="rinkSuggestions" value="${esc(rinkInputValue)}" placeholder="Start typing rink name..." autocomplete="off" />
                    <input type="hidden" name="rinkId" id="rinkId" value="${esc(String(meet.rinkId||''))}" />
                    <datalist id="rinkSuggestions">${rinkDataList}</datalist>
                    <div class="note">Pick a saved rink when available. Typed names become custom for this meet only.</div>
                  </div>
                </div>
              </div>
              
        </div>
      </div>

      <div class="mb-section tone-green">
        ${sectionHeadHtml({ n:2, icon:'🎟', tone:'green', title:'Who can enter, and what does it cost?', sub:'Registration window and fees', state:_s2done?'done':'todo' })}
        <div class="mb-body">
          <div class="setup-mini-card">
                <div class="setup-mini-title">Registration Window</div>
                <div class="setup-fields">
                  <div><label>Close Date</label><input type="date" name="registrationCloseDate" value="${esc(meet.registrationCloseAt?meet.registrationCloseAt.slice(0,10):'')}" /></div>
                  <div><label>Close Time</label><input type="time" name="registrationCloseTime" value="${esc(meet.registrationCloseAt?meet.registrationCloseAt.slice(11,16):'')}" /></div>
                </div>
              </div>
              
          <div class="setup-mini-card">
                <div class="setup-mini-title">Pricing</div>
                <div class="setup-fields cols-3">
                  <div><label>Base Registration</label><input type="number" name="baseEntryFee" value="${esc(String(meet.baseEntryFee||0))}" min="0" /><div class="note">Covers the first selected event category.</div></div>
                  <div><label>Additional Event Fee</label><input type="number" name="additionalRaceFee" value="${esc(String(meet.additionalRaceFee||0))}" min="0" /><div class="note">Charged once for each selected event category after the first.</div></div>
                  <div><label>Max Registration Cap</label><input type="number" name="maxRegistrationFee" value="${esc(String(meet.maxRegistrationFee||0))}" min="0" /><div class="note">0 = no cap. Any other amount limits the final total even when the event calculation is higher.</div></div>
                </div>
                <div class="setup-help-note">Total cost = base fee + selected event fees. Max cap applies when greater than 0.</div>
                <div class="setup-fields cols-2" style="margin-top:14px">
                  <div><label>Protest Fee</label><input type="number" name="protestFee" value="${esc(String(meet.protestFee||0))}" min="0" /><div class="note">0 = no fee. Non-refundable, settled in person with the director when a coach files a protest.</div></div>
                  <div><label>Protest Window (minutes)</label><input type="number" name="protestDeadlineMinutes" value="${esc(String(meet.protestDeadlineMinutes||0))}" min="0" /><div class="note">0 = no limit. Minutes after a race closes that a coach can still file a protest online. A director can accept a late protest in person.</div></div>
                </div>
              </div>

          ${feeExplainerHtml}
          <div class="setup-mini-card setup-mini-card-primary">
                <div class="setup-mini-title">Publication</div>
                <div class="builder-publish-card">
                  <input type="hidden" id="meetStatusInput" name="status" value="${esc(meetStatus || 'draft')}" />
                  <div>
                    <div class="builder-publish-title">Published Meet</div>
                    <div class="builder-publish-desc">Show this meet publicly on Find a Meet and allow public registration when registration is open.</div>
                  </div>
                  <label class="toggle-wrap builder-publish-toggle">
                    <input type="checkbox" id="publishedToggle" value="published" class="toggle-input" ${isPublished?'checked':''} />
                    <span class="toggle-track"><span class="toggle-thumb"></span></span>
                    <span id="publishedToggleText" class="toggle-label">${isPublished?'Published':'Draft'}</span>
                  </label>
                </div>
              </div>
              <script>
                (function(){
                  var toggle = document.getElementById('publishedToggle');
                  var statusInput = document.getElementById('meetStatusInput');
                  var toggleText = document.getElementById('publishedToggleText');
                  var stickyBadge = document.getElementById('builderStatusBadge');
                  if(!toggle || !statusInput) return;
                  function syncStatus(){
                    var published = !!toggle.checked;
                    statusInput.value = published ? 'published' : 'draft';
                    if(toggleText) toggleText.textContent = published ? 'Published' : 'Draft';
                    if(stickyBadge){
                      stickyBadge.textContent = published ? 'Published' : 'Draft';
                      stickyBadge.className = 'builder-status-badge ' + (published ? 'published' : 'draft');
                    }
                  }
                  toggle.addEventListener('change', syncStatus);
                })();
              </script>
            
        </div>
      </div>

      <div class="mb-section tone-amber">
        ${sectionHeadHtml({ n:3, icon:'🏁', tone:'amber', title:'How does the racing work?', sub:'Track, lanes, and tiebreaker', state:_s3done?'done':'todo' })}
        <div class="mb-body">
          <div class="setup-mini-card">
                <div class="setup-mini-title">Track Configuration</div>
                <div class="setup-fields">
                  <div><label>Track Length (m)</label><input type="number" name="trackLength" value="${esc(meet.trackLength)}" min="1" step="1" /></div>
                  <div><label>Lanes</label><input type="number" name="lanes" value="${esc(meet.lanes)}" min="1" step="1" /></div>
                </div>
                <div class="setup-help-note">Changing lanes or track length may require rebuilding race assignments.</div>
              </div>
            
          <div class="setup-mini-card setup-mini-card-primary">
                <div class="setup-mini-title">Scoring Method</div>
                <div class="setup-fields cols-1">
                  <div>
                    <label>Tiebreaker Rule</label>
                    <select name="tiebreaker">
                      <option value="sr832" selected>USARS SR832 Formula</option>
                    </select>
                    <div class="setup-help-note">Ties are broken by the official USARS SR832 weighted formula across the division's races — the USARS rule, applied to every meet. (The old &ldquo;D2 middle race&rdquo; option was a legacy SSM setting, not a USARS rule, and has been removed.)</div>
                  </div>
                </div>
              </div>

              
        </div>
      </div>

      <div class="mb-section tone-violet">
        ${sectionHeadHtml({ n:4, icon:'👥', tone:'violet', title:'Which divisions are racing?', sub:'Enable classes and set distances', state:'current' })}
        <div class="mb-body">
          <div class="page-header">
        <h2>Division Groups</h2>
        <div class="sub">Enable classes and set distances for each age group.</div>
        <div class="action-row" style="margin-top:10px;align-items:center;gap:10px">
          <span class="note" style="margin:0">Division set:</span>
          <button type="submit" formaction="/portal/meet/${meet.id}/division-scheme" formmethod="post" name="scheme" value="standard"
            class="${(meet.divisionScheme || (meet.usarsDivisions ? 'usars' : 'standard')) === 'standard' ? 'btn-good' : 'btn2'}"
            onclick="return confirm('Switch to the Standard division set (24 age groups)?\\n\\nThis rebuilds the age-group list. Save any other settings changes first.');">Standard</button>
          <button type="submit" formaction="/portal/meet/${meet.id}/division-scheme" formmethod="post" name="scheme" value="usars"
            class="${(meet.divisionScheme || (meet.usarsDivisions ? 'usars' : 'standard')) === 'usars' ? 'btn-good' : 'btn2'}"
            onclick="return confirm('Set up the complete USARS National meet?\\n\\n• All 34 age divisions (incl. Grand + Premier), Elite enabled with official distances\\n• All quad divisions enabled\\n• All relay races created (inline + quad) — schedulable in Block Builder\\n• SR832 tiebreaker\\n\\nThis rebuilds the age-group list from the USARS template (custom per-group tweaks reset). Save any other settings changes first.');">USARS National</button>
          <button type="submit" formaction="/portal/meet/${meet.id}/division-scheme" formmethod="post" name="scheme" value="mssl"
            class="${meet.divisionScheme === 'mssl' ? 'btn-good' : 'btn2'}"
            onclick="return confirm('Load the official Mid South Speed League race template?\\n\\n• MSSL novice and elite race offerings in office order\\n• 8 league quad divisions and 8 open divisions\\n• 3-, 2-, then 4-person open-gender relays\\n• Skatability in Elite Middle Continued\\n\\nMeet name, dates, venue, notes, and pricing are preserved.');">MSSL League Office</button>
          <span class="note" style="margin:0">${meet.divisionScheme === 'mssl' ? 'MSSL office template' : meet.usarsDivisions ? '34 USARS divisions' : '24 standard divisions'}</span>
        </div>
      </div>
      
          ${groupsHtml}
        </div>
      </div>

      <div class="mb-section tone-sky">
        ${sectionHeadHtml({ n:5, icon:'✨', tone:'sky', title:'Anything special?', sub:'Open, Quad, relays, and time trials', state:'optional' })}
        <div class="mb-body">
          <div class="grid-2" style="margin-bottom:16px">
      <div class="card card-accent" style="border-left-color:var(--orange)">
        <div class="row between center">
          <div>
            <div class="bold">🏁 Open Builder ${openEnabledCount>0?`<span class="chip chip-orange">${openEnabledCount} active</span>`:''}</div>
            <div class="note">Rolling-start Open races, separate results.</div>
          </div>
          <a class="btn-orange btn-sm" href="/portal/meet/${meet.id}/open-builder">Configure →</a>
        </div>
      </div>
      <div class="card card-accent" style="border-left-color:var(--purple)">
        <div class="row between center">
          <div>
            <div class="bold">🛼 Quad Builder ${quadEnabledCount>0?`<span class="chip chip-purple">${quadEnabledCount} active</span>`:''}</div>
            <div class="note">Quad divisions, own standings bucket.</div>
          </div>
          <a class="btn-purple btn-sm" href="/portal/meet/${meet.id}/quad-builder">Configure →</a>
        </div>
      </div>
    </div>
    
          <div class="card" style="margin-bottom:16px;border-left:5px solid var(--sky2)">
        <div class="row between center" style="gap:12px;align-items:flex-start">
          <div>
            <h2 style="margin:0 0 4px">Time Trial Builder</h2>
            <div class="note">Standalone queue, manual times, and live leaderboard. Does not generate heats, finals, or brackets.</div>
          </div>
          ${toggleSwitch('timeTrialEventEnabled', !!ttEvent.enabled, 'Enable Time Trials')}
        </div>
        <div class="form-grid cols-3" style="margin-top:14px">
          <div><label>Distance</label><input name="timeTrialEventDistance" value="${esc(ttEvent.distance || '100m')}" placeholder="100m" /></div>
          <div><label>Run Order</label><input value="Youngest → Oldest" disabled /></div>
          <div><label>Counts For Overall</label><select name="timeTrialEventCountsForOverall"><option value="no" ${ttEvent.countsForOverall ? '' : 'selected'}>No</option><option value="yes" ${ttEvent.countsForOverall ? 'selected' : ''}>Yes</option></select></div>
        </div>
      </div>
      
          <div class="card" style="margin-top:8px">
        <div class="row between center" style="margin-bottom:14px">
          <div>
            <h2 style="margin:0">Special Events</h2>
            <div class="note">Optional event types that sit outside standard novice/elite/open/quad racing.</div>
          </div>
        </div>
        <div class="form-grid cols-2">
          <div class="group-pair-col" id="time-trials" style="margin-bottom:12px">
            <div class="group-pair-header">
              <span class="group-pair-name">Time Trials</span>
              ${toggleSwitch('timeTrialsEnabled', meet.timeTrialsEnabled, 'Enable Time Trials')}
            </div>
            <div class="note" style="margin-top:8px">
              Single <strong>100m / 1 Lap</strong> session. Runs youngest to oldest across all divisions. Uses Open division groups for TV/live leaderboards. No points awarded.
            </div>
            <div class="action-row" style="margin-top:10px">
              <span class="chip chip-sky">100m</span>
              <span class="chip">1 Lap</span>
              <span class="chip">Youngest → Oldest</span>
              <span class="chip chip-green">Records Only</span>
            </div>
          </div>

          ${(()=>{
            const saved = makeAdditionalRaceSlots(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups);
            const sg = saved.find(x => String(x.id || '') === 'manual_extra_1') || {};
            const distances = Array.isArray(sg.distances) ? [0,1,2].map(n=>String(sg.distances[n]||'')) : ['', '', ''];
            return `
              <div class="group-pair-col" style="margin-bottom:12px" id="sk-0">
                <div class="group-pair-header">
                  <span class="group-pair-name">Skateability</span>
                  ${toggleSwitch('sk_0_enabled', !!sg.enabled)}
                </div>
                <div class="note" style="margin-top:8px">Skateability setup. No novice/elite divisions and no overall points — just enable it and enter up to 3 distances.</div>
                <input type="hidden" name="sk_0_id" value="manual_extra_1" />
                <input type="hidden" name="sk_0_ageGroupId" value="" />
                <input type="hidden" name="sk_0_ages" value="" />
                <input type="hidden" name="sk_0_ageGroupLabel" value="Skateability" />
                <div style="display:flex;gap:8px;align-items:flex-end;margin-top:10px">
                  <div style="flex:1"><label>Distance 1</label><input name="sk_0_d1" value="${esc(distances[0])}" placeholder="100m" /></div>
                  <div style="flex:1"><label>Distance 2</label><input name="sk_0_d2" value="${esc(distances[1])}" placeholder="200m" /></div>
                  <div style="flex:1"><label>Distance 3</label><input name="sk_0_d3" value="${esc(distances[2])}" placeholder="300m" /></div>
                </div>
              </div>`;
          })()}
        </div>
        <input type="hidden" name="additional_count" id="additional_count" value="4" />
      </div>

      
          <div class="card" style="margin-top:8px">
        <div class="row between center" style="margin-bottom:14px">
          <div>
            <h2 style="margin:0">🏁 Special Races</h2>
            <div class="note">Flexible exhibition races like Race of Champions, Parents Race, Coach Race, or Dash for Cash.</div>
          </div>
          <span class="chip chip-sky">3 Slots</span>
        </div>
        ${(()=>{
          const saved = makeAdditionalRaceSlots(meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups);
          const rows = [1,2,3].map(si => {
            const id = 'manual_extra_' + (si + 1);
            const found = saved.find(x => String(x.id || '') === id) || {};
            return {
              idx: si,
              id,
              ageGroupLabel: String(found.ageGroupLabel || found.title || ''),
              ages: String(found.ages || ''),
              enabled: !!found.enabled,
              distances: Array.isArray(found.distances) ? [0,1,2].map(n=>String(found.distances[n]||'')) : ['', '', ''],
            };
          });
          return `<div class="form-grid cols-2">
            ${rows.map((sg,ri)=>`
              <div class="group-pair-col" style="margin-bottom:12px" id="sk-${sg.idx}">
                <div class="group-pair-header">
                  <span class="group-pair-name">Special Race ${ri+1}</span>
                  ${toggleSwitch('sk_'+sg.idx+'_enabled', sg.enabled)}
                </div>
                <input type="hidden" name="sk_${sg.idx}_id" value="${esc(sg.id)}" />
                <input type="hidden" name="sk_${sg.idx}_ageGroupId" value="" />
                <div class="form-grid cols-2" style="margin-top:10px">
                  <div><label>Race Title</label><input name="sk_${sg.idx}_ageGroupLabel" value="${esc(sg.ageGroupLabel)}" placeholder="Race of Champions / Parents Race" /></div>
                  <div><label>Age/Eligibility</label><input name="sk_${sg.idx}_ages" value="${esc(sg.ages)}" placeholder="Open / Champions / 35+" /></div>
                </div>
                <div style="display:flex;gap:8px;align-items:flex-end;margin-top:10px">
                  <div style="flex:1"><label>D1</label><input name="sk_${sg.idx}_d1" value="${esc(sg.distances?.[0]||'')}" placeholder="500m" /></div>
                  <div style="flex:1"><label>D2</label><input name="sk_${sg.idx}_d2" value="${esc(sg.distances?.[1]||'')}" placeholder="" /></div>
                  <div style="flex:1"><label>D3</label><input name="sk_${sg.idx}_d3" value="${esc(sg.distances?.[2]||'')}" placeholder="" /></div>
                </div>
              </div>`).join('')}
          </div>`;
        })()}
      </div>

      
          
              <div class="setup-section-title">📝 Meet Notes</div>
              <script>
                (function(){
                  var rinks = ${rinkLookupScript};
                  var input = document.getElementById('rinkSearch');
                  var hidden = document.getElementById('rinkId');
                  if(!input || !hidden) return;
                  function syncRink(){
                    var value = (input.value || '').trim().toLowerCase();
                    var match = rinks.find(function(r){
                      return String(r.label || '').trim().toLowerCase() === value || String(r.name || '').trim().toLowerCase() === value;
                    });
                    hidden.value = match ? String(match.id) : '';
                  }
                  input.addEventListener('input', syncRink);
                  input.addEventListener('change', syncRink);
                  syncRink();
                })();
              </script>
              <div class="setup-notes-grid">
                <div><label>Meet Notes</label><textarea name="notes">${esc(meet.notes||'')}</textarea></div>
                <div><label>Relay Notes</label><textarea name="relayNotes">${esc(meet.relayNotes||'')}</textarea></div>
              </div>
              <div style="margin-top:10px">
                <label>Relay Roster Deadline</label>
                <input type="datetime-local" name="relayDeadline" value="${esc(meet.relayDeadline||'')}" />
                <div class="hint" style="font-size:12px;color:var(--muted);margin-top:4px">Shown to coaches on the Build Relay Teams page. When this date/time passes, the coach relay form locks so no late teams can be added. Leave blank for no deadline.</div>
              </div>
            
        </div>
      </div>

      <div class="card">
        <div class="row between center">
          <div class="muted">Save Meet saves all settings and updates configured race titles while preserving block assignments.</div>
          <button class="btn2" type="submit" form="meetBuilderForm" formaction="/portal/meet/${meet.id}/builder/save-meet">Save Meet</button>
        </div>
      </div>
    
    </form>

    <div class="mb-section tone-slate">
      ${sectionHeadHtml({ n:6, icon:'💾', tone:'slate', title:'Save it for next time', sub:'Presets, ownership, staff, and desktop', state:'optional' })}
      <div class="mb-body">
        <div class="setup-mini-card">
                <div class="setup-mini-title">Save Current Setup</div>
                <div class="preset-row">
                  <input form="meetBuilderForm" name="presetName" value="${esc(meet.presetName||'')}" placeholder="Mid South Speed League" />
                  <button class="btn2 btn-sm" type="submit" form="meetBuilderForm" formaction="/portal/meet/${meet.id}/builder/save-preset">Save Setup</button>
                </div>
                <div class="setup-help-note">Saves divisions, distances, fees, tiebreaker, blocks, and race order so this setup can be reused later.</div>
              </div>

              
        <div class="setup-mini-card">
                <div class="setup-mini-title">Load or Delete Preset</div>
                <div class="preset-manage-row">
                  <select id="presetSelect" form="meetBuilderForm" name="presetId">${presetSelectHtml}</select>
                  <button id="loadPresetBtn" class="btn2 btn-sm" type="submit" form="meetBuilderForm" formaction="/portal/meet/${meet.id}/setup-presets/load" onclick="return confirm('Load this preset? Your meet name, dates, venue, publication status, and notes will be kept. Divisions, fees, track setup, blocks, and race structure will be replaced.')">Load</button>
                  ${canDeleteSetupPresets ? `
                    <input type="hidden" form="meetBuilderForm" name="deletePresetId" id="deletePresetId" value="" />
                    <button id="deletePresetBtn" class="btn-danger btn-sm" type="submit" form="meetBuilderForm" formaction="/portal/meet/${meet.id}/setup-presets/delete" onclick="return confirm('Delete selected setup preset? This cannot be undone.')">Delete</button>
                  ` : `
                    <span class="muted small">Only super admins can delete shared presets.</span>
                    <input type="hidden" form="meetBuilderForm" name="deletePresetId" id="deletePresetId" value="" />
                  `}
                </div>
                <div class="setup-warning-note">Your meet name, dates, venue, publication status, and notes are saved automatically when a preset loads. Divisions, fees, track setup, blocks, and race structure are replaced by the preset.</div>
                <script>
                  (function(){
                    var sel = document.getElementById('presetSelect');
                    var loadBtn = document.getElementById('loadPresetBtn');
                    var deleteBtn = document.getElementById('deletePresetBtn');
                    var deleteInput = document.getElementById('deletePresetId');
                    if(!sel || !loadBtn || !deleteBtn || !deleteInput) return;
                    function update(){
                      var selected = sel.value;
                      loadBtn.disabled = !selected;
                      deleteBtn.disabled = !selected;
                      deleteInput.value = selected || '';
                    }
                    sel.addEventListener('change', update);
                    update();
                  })();
                </script>
              </div>
            
        ${ownershipPanel}
        ${staffPanel}
        ${desktopPinPanel}
        ${desktopImportPanel}
      </div>
    </div>`;
}

module.exports = {
  renderMeetBuilderView,
};
