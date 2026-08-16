const express = require('express');
const crypto = require('crypto');
const { esc, cap } = require('../utils/html');
const { nowIso } = require('../utils/date');
const { canEditMeet, canJudgeMeet, hasRole } = require('../utils/auth');
const { raceDaySubTabs, meetTabs: _mt, announcerBoxHtml: _abh } = require('../utils/pageShell');
const {
  getMeetOr404, meetRinkLabel, meetDateLabel, nextId,
  isArchivedMeet, orderedRaces: _ord, ensureAtLeastOneBlock,
  tryAdvanceTopThreeFromTwoHeats, advanceRaceProgression, isAdvancementRace, isOpenDivision,
  numericPlace, computeMeetStandings: _cms, sponsorLineHtml, raceStatusResultsHtml,
} = require('../services/meetHelpers');
const {
  orderedRaces, currentRaceInfo, ensureCurrentRace,
  laneRowsForRace, raceDisplayStage,
  raceDayProgress,
} = require('../services/raceDay');
const { fireRaceAlerts, fireResultAlerts } = require('../services/raceAlerts');
const { skaterAvatarHtml } = require('../services/avatarDisplay');
const { renderJudgeBoard } = require('../views/raceDayView');
const {
  STANDARD_POINTS, computeMeetStandings, computeQuadStandings, computeOpenResults,
} = require('../services/standings');
const {
  relayOptionKeyForRace, renderRelayEligibleSkatersHtml,
} = require('../services/relayHelpers');
const { advanceRelayProgression } = require('../services/relayGenerator');
const ttHelpers = require('../services/ttHelpers');
const {
  genderBucket, openGroupForTimeTrialReg, timeTrialRaceForMeet,
  timeTrialEntriesForMeet, timeTrialLeaderboards,
  rebuildRaceAssignmentsSafe, reRandomizeRaceLanes,
} = ttHelpers;
const { completedTimeTrialEvents, ensureTimeTrialEvent, timeTrialEventTitle } = require('../services/timeTrialEvents');
const { renderTimeTrialFinalResultsHtml } = require('../services/timeTrialResultsView');
const { generateScheduleBlocks } = require('../services/scheduleGenerator');
const { createBackup: createDesktopBackup } = require('../services/desktopBackupService');
const { streamScoreSheetsPdf } = require('../services/scoreSheetPdf');
const { invalidLaneStatus, sendIfInvalid } = require('../utils/validate');
const {
  RACE_STATUS_OPTIONS,
  dqStatusOptions,
  isDisqualification,
  raceStatusLabel,
} = require('../services/raceStatus');

function invalidLaneStatusFields(body) {
  const problems = [];
  for (const key of Object.keys(body || {})) {
    if (key.startsWith('status_') && invalidLaneStatus(body[key])) {
      problems.push(`${key} contains an unsupported race status.`);
    }
  }
  return problems;
}

function raceStatusOptionsHtml(currentStatus) {
  const current = String(currentStatus || '').trim();
  const legacyOption = current === 'DQ'
    ? '<option value="DQ" selected>DQ – Other</option>'
    : '';
  return RACE_STATUS_OPTIONS.map(option =>
    `<option value="${esc(option.value)}" ${current === option.value ? 'selected' : ''}>${esc(option.label)}</option>`
  ).join('') + legacyOption;
}

function dqMetadataFields(entry, lane) {
  return `
    <input type="hidden" id="dqCategory_${esc(lane)}" name="dqCategory_${esc(lane)}" value="${esc(entry.dqCategory || '')}" />
    <input type="hidden" id="dqRuleReference_${esc(lane)}" name="dqRuleReference_${esc(lane)}" value="${esc(entry.dqRuleReference || '')}" />
    <input type="hidden" id="dqOfficialNotes_${esc(lane)}" name="dqOfficialNotes_${esc(lane)}" value="${esc(entry.dqOfficialNotes || '')}" />
    <input type="hidden" id="dqTimestamp_${esc(lane)}" name="dqTimestamp_${esc(lane)}" value="${esc(entry.dqTimestamp || '')}" />
    ${isDisqualification(entry.status) ? `<button type="button" class="btn2 btn-sm dq-edit-button" data-lane="${esc(lane)}" style="margin-top:6px">Edit DQ Details</button>` : ''}`;
}

function dqDialogHtml(user) {
  const recordedBy = user?.displayName || user?.username || 'Current official';
  return `
    <dialog id="dqDetailsDialog" class="dq-dialog">
      <form method="dialog" class="dq-dialog-card" onsubmit="return false">
        <div class="row between center"><div><div class="dq-kicker">Race Status</div><h2 style="margin:2px 0 0">Record Disqualification</h2></div><button type="button" class="btn2 btn-sm" id="dqDialogClose" aria-label="Close">Close</button></div>
        <div class="form-grid cols-2" style="margin-top:16px">
          <div><label>DQ Category</label><select id="dqDialogCategory">${dqStatusOptions().map(option => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join('')}</select></div>
          <div><label>Optional Rule Reference</label><input id="dqDialogRule" maxlength="200" placeholder="Example: SR 7.3" /></div>
        </div>
        <div style="margin-top:14px"><label>Optional Official Notes</label><textarea id="dqDialogNotes" maxlength="2000" placeholder="Internal officials-only notes. These will not appear publicly."></textarea></div>
        <div class="dq-audit-grid">
          <div><span>Timestamp</span><strong id="dqDialogTimestamp">Recorded when saved</strong></div>
          <div><span>Recorded By</span><strong>${esc(recordedBy)}</strong></div>
        </div>
        <div class="action-row" style="margin-top:16px"><button type="button" class="btn-orange" id="dqDialogSave">Save DQ</button><button type="button" class="btn2" id="dqDialogCancel">Cancel</button></div>
      </form>
    </dialog>
    <style>
      .dq-dialog{border:0;padding:0;border-radius:8px;width:min(680px,calc(100vw - 28px));box-shadow:0 24px 80px rgba(15,31,61,.35);color:var(--text)}
      .dq-dialog::backdrop{background:rgba(15,31,61,.72);backdrop-filter:blur(3px)}
      .dq-dialog-card{padding:22px;background:#fff}
      .dq-kicker{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--orange)}
      .dq-audit-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
      .dq-audit-grid>div{border:1px solid var(--border);background:#f8fafc;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:3px}
      .dq-audit-grid span{font-size:10px;font-weight:900;text-transform:uppercase;color:var(--muted)}
      @media(max-width:620px){.dq-audit-grid{grid-template-columns:1fr}.dq-dialog-card{padding:17px}}
    </style>
    <script>
      (function(){
        var dialog=document.getElementById('dqDetailsDialog');
        if(!dialog) return;
        var activeSelect=null;
        var activeLane='';
        var category=document.getElementById('dqDialogCategory');
        var rule=document.getElementById('dqDialogRule');
        var notes=document.getElementById('dqDialogNotes');
        var timestamp=document.getElementById('dqDialogTimestamp');
        function isDQ(value){return value==='DQ'||String(value||'').indexOf('DQ_')===0;}
        function field(prefix){return document.getElementById(prefix+'_'+activeLane);}
        function closeDialog(restore){
          if(restore&&activeSelect) activeSelect.value=activeSelect.dataset.previousStatus||'';
          if(dialog.open) dialog.close(); else dialog.removeAttribute('open');
          activeSelect=null;activeLane='';
        }
        document.querySelectorAll('.race-status-select').forEach(function(select){
          select.dataset.previousStatus=select.value||'';
          select.addEventListener('focus',function(){this.dataset.previousStatus=this.value||'';});
          select.addEventListener('change',function(){
            if(!isDQ(this.value)){
              ['dqCategory','dqRuleReference','dqOfficialNotes','dqTimestamp'].forEach(function(prefix){var el=document.getElementById(prefix+'_'+select.dataset.lane);if(el)el.value='';});
              this.dataset.previousStatus=this.value||'';
              return;
            }
            activeSelect=this;activeLane=this.dataset.lane;
            var savedCategory=field('dqCategory');
            category.value=(this.value==='DQ'?'DQ_OTHER':this.value)||(savedCategory&&savedCategory.value)||'DQ_OTHER';
            rule.value=(field('dqRuleReference')&&field('dqRuleReference').value)||'';
            notes.value=(field('dqOfficialNotes')&&field('dqOfficialNotes').value)||'';
            var savedTime=(field('dqTimestamp')&&field('dqTimestamp').value)||new Date().toISOString();
            timestamp.textContent=new Date(savedTime).toLocaleString();
            dialog.dataset.pendingTimestamp=savedTime;
            if(typeof dialog.showModal==='function') dialog.showModal(); else dialog.setAttribute('open','');
          });
        });
        document.querySelectorAll('.dq-edit-button').forEach(function(button){
          button.addEventListener('click',function(){
            var select=document.querySelector('.race-status-select[data-lane="'+this.dataset.lane+'"]');
            if(!select) return;
            select.dataset.previousStatus=select.value||'';
            select.dispatchEvent(new Event('change'));
          });
        });
        document.getElementById('dqDialogSave').addEventListener('click',function(){
          if(!activeSelect) return closeDialog(false);
          activeSelect.value=category.value;
          activeSelect.dataset.previousStatus=category.value;
          field('dqCategory').value=category.value;
          field('dqRuleReference').value=rule.value.trim();
          field('dqOfficialNotes').value=notes.value.trim();
          field('dqTimestamp').value=dialog.dataset.pendingTimestamp||new Date().toISOString();
          closeDialog(false);
        });
        document.getElementById('dqDialogCancel').addEventListener('click',function(){closeDialog(true);});
        document.getElementById('dqDialogClose').addEventListener('click',function(){closeDialog(true);});
        dialog.addEventListener('cancel',function(event){event.preventDefault();closeDialog(true);});
      })();
    </script>`;
}

function laneResultFromBody(existing, lane, body, user) {
  const status = String(body[`status_${lane}`] ?? existing.status ?? '').trim();
  const result = {
    lane,
    registrationId: existing.registrationId || '',
    helmetNumber: existing.helmetNumber || '',
    skaterName: String(body[`skaterName_${lane}`] ?? existing.skaterName ?? '').trim(),
    team: String(body[`team_${lane}`] ?? existing.team ?? '').trim(),
    place: String(body[`place_${lane}`] ?? existing.place ?? '').trim(),
    time: String(body[`time_${lane}`] ?? existing.time ?? '').trim(),
    status,
  };
  // 🏅 New-record flag. A checkbox only POSTs when checked, so distinguish
  // "unchecked" from "this lane wasn't in the submitted form": if the lane's text
  // inputs are present (a rendered lane always submits skaterName/place/time),
  // read the checkbox; otherwise keep whatever was stored.
  const laneRendered = body[`time_${lane}`] != null || body[`place_${lane}`] != null || body[`skaterName_${lane}`] != null;
  result.record = laneRendered ? (body[`record_${lane}`] != null) : !!existing.record;
  // Preserve relay-team identity on generated relay entries (this editor otherwise
  // rebuilds entries from a fixed field list and would drop these).
  if (existing.relayTeamId != null) result.relayTeamId = existing.relayTeamId;
  if (Array.isArray(existing.relayMemberRegIds)) result.relayMemberRegIds = existing.relayMemberRegIds;
  if (existing.color) result.color = existing.color;
  if (!isDisqualification(status)) return result;
  result.dqCategory = status === 'DQ' ? (existing.dqCategory || 'DQ_OTHER') : status;
  result.dqRuleReference = String(body[`dqRuleReference_${lane}`] ?? existing.dqRuleReference ?? '').trim().slice(0, 200);
  result.dqOfficialNotes = String(body[`dqOfficialNotes_${lane}`] ?? existing.dqOfficialNotes ?? '').trim().slice(0, 2000);
  result.dqTimestamp = String(body[`dqTimestamp_${lane}`] || existing.dqTimestamp || nowIso());
  result.dqRecordedBy = user?.displayName || user?.username || existing.dqRecordedBy || 'Official';
  result.dqRecordedByUserId = user?.id || existing.dqRecordedByUserId || '';
  return result;
}

function createDesktopBackupIfActive(db, reason, meetId = '') {
  if (process.env.SSM_DESKTOP !== '1') return;
  try { createDesktopBackup({ db, reason, meetId }); }
  catch (err) { console.warn(`Desktop backup skipped (${reason}):`, err.message); }
}

// Shared lane-assignment card list — used on the Referee tab so a back judge
// can read lane numbers to skaters before a race starts (no result/status yet).
function laneAssignmentListHtml(lanes, regMap) {
  const entered = (lanes || []).filter(l => l.skaterName);
  if (!entered.length) return '<div class="muted">No skaters assigned yet.</div>';
  return `<div class="live-lane-list">${entered.map(l => {
    const reg = regMap.get(Number(l.registrationId));
    const detail = [l.helmetNumber ? '#' + esc(l.helmetNumber) : '', esc(l.team || '')].filter(Boolean).join(' · ');
    return `<div class="live-lane-card">
      <div class="live-lane-number">${esc(l.lane)}</div>
      <div class="live-lane-info">
        <div class="live-lane-name">${esc(l.skaterName)}</div>
        ${detail ? `<div class="live-lane-detail">${detail}</div>` : ''}
        ${sponsorLineHtml(reg?.sponsor || '').replace('sponsor-line', 'live-lane-sponsor')}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function raceDayItemLabel(item) {
  if (!item) return '—';
  if (item.type === 'time_trial') return item.groupLabel || 'Time Trial Event';
  return `${item.groupLabel} — ${cap(item.division)} — ${item.distanceLabel} — ${raceDisplayStage(item)}`;
}

function raceDayItemSub(item) {
  if (!item) return '';
  if (item.type === 'time_trial') return `${item.distanceLabel || '100m'} • Time Trial Event`;
  return `${cap(item.division)} • ${item.distanceLabel} • ${raceDisplayStage(item)}`;
}

function isTimeTrialItem(item) {
  return item?.type === 'time_trial';
}

// ── Merged-race race-day display helpers ─────────────────────────────────────
// A merged pair (e.g. Elite Veteran & Esquire Men) lines up and STARTS together
// as one pack, but stays two race objects scored within their own division.
// These build the combined lane sheet for the DISPLAY surfaces (director +
// announcer + TV). Result ENTRY stays per-division on the judge screen, so the
// validated scoring/advancement is untouched.
function mergeGroupMembers(meet, race) {
  if (!race || !race.mergeGroupId) return null;
  const members = (meet.races || []).filter(r => r && r.mergeGroupId === race.mergeGroupId)
    .sort((a, b) => (a.mergeLead ? 0 : 1) - (b.mergeLead ? 0 : 1));
  return members.length > 1 ? members : null;
}
function mergedPackLanes(meet, race) {
  const members = mergeGroupMembers(meet, race);
  if (!members) return laneRowsForRace(race, meet);
  let pos = 0;
  const rows = [];
  for (const m of members) {
    for (const ln of laneRowsForRace(m, meet)) { pos += 1; rows.push({ ...ln, lane: pos, _div: m.groupLabel || '' }); }
  }
  return rows;
}
function mergePackLabel(meet, race) {
  const members = mergeGroupMembers(meet, race);
  if (!members) return race?.groupLabel || '';
  return members.map(m => m.groupLabel || '').filter(Boolean).join(' & ');
}

function rebuildTimeTrialRaceSafe(meet) {
  const freshTtHelpers = require('../services/ttHelpers');
  const fn = freshTtHelpers && freshTtHelpers.rebuildTimeTrialRace;
  if (typeof fn !== 'function') return null;
  return fn(meet);
}

function blockPrintHref(meetId, options = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return `/portal/meet/${esc(meetId)}/blocks/print${query ? '?' + esc(query) : ''}`;
}

function printableTimeTrialRows(event) {
  const rows = Array.isArray(event?.participants) ? event.participants : [];
  return rows.map((row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${esc(row.skaterName || row.skater || row.name || '')}</td>
      <td>${esc(row.team || '')}</td>
      <td>${esc(row.gender || '')}</td>
      <td>${esc(row.time || '')}</td>
    </tr>`).join('') || '<tr><td colspan="5">No registered Time Trial skaters.</td></tr>';
}

function renderBlockSchedulePrintPage({ req, meet, showNotes, pageBreaks, showEmpty, layout }) {
  const raceById = new Map((meet.races || []).map(race => [String(race.id), race]));
  const timeTrialById = new Map((meet.timeTrialEvents || []).map(event => [String(event.id), event]));
  const breakTypes = new Set(['break', 'lunch', 'awards', 'practice']);
  const printLayout = ['compact', 'standard', 'official'].includes(layout) ? layout : 'compact';
  let scheduleNo = 0;

  const controlsBase = {
    layout: printLayout,
    notes: showNotes ? '1' : '0',
    breaks: pageBreaks ? '1' : '0',
    empty: showEmpty ? '1' : '0',
  };

  function printableRaceLanes(race) {
    const rawRows = laneRowsForRace(race, meet);
    return (showEmpty ? rawRows : rawRows.filter(row =>
      String(row.skaterName || '').trim() ||
      String(row.team || '').trim() ||
      String(row.helmetNumber || '').trim()
    ));
  }

  function raceLaneRowsHtml(lanes) {
    return (lanes.length ? lanes : [{ lane: '', helmetNumber: '', skaterName: '', team: '' }]).map(lane => `
      <div class="lane-line">
        <span class="lane-num">Lane ${esc(lane.lane || '')}</span>
        <span class="lane-skater">${lane.helmetNumber ? '#' + esc(lane.helmetNumber) + ' ' : ''}${esc(lane.skaterName || '')}</span>
        <span class="lane-team">${esc(lane.team || '')}</span>
      </div>`).join('');
  }

  function raceTableHtml(race, lanes, raceNo) {
    const rows = (lanes.length ? lanes : [{ lane: '', helmetNumber: '', skaterName: '', team: '' }]).map((lane, idx) => `
      <tr>
        <td>${idx === 0 ? raceNo : ''}</td>
        <td>${esc(race.groupLabel || '')}</td>
        <td>${esc(cap(race.division || ''))}</td>
        <td>${esc(race.distanceLabel || '')}</td>
        <td>${esc(raceDisplayStage(race))}</td>
        <td>${esc(lane.lane || '')}</td>
        <td>${lane.helmetNumber ? '#' + esc(lane.helmetNumber) : ''}</td>
        <td>${esc(lane.skaterName || '')}</td>
        <td>${esc(lane.team || '')}</td>
      </tr>`).join('');
    return `
      <table>
        <thead><tr><th>Race</th><th>Division</th><th>Class</th><th>Distance</th><th>Heat</th><th>Lane</th><th>Helmet</th><th>Skater</th><th>Team</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function raceCardHtml(race, lanes, raceNo) {
    if (printLayout === 'standard') {
      return `<article class="race-card">${raceTableHtml(race, lanes, raceNo)}</article>`;
    }
    return `
      <article class="race-card">
        <div class="race-card-head">
          <div class="race-number">Race ${raceNo}</div>
          <div>
            <div class="race-title">${esc(race.groupLabel || '')}</div>
            <div class="race-sub">${esc(cap(race.division || ''))} • ${esc(race.distanceLabel || '')} • ${esc(raceDisplayStage(race))}</div>
          </div>
        </div>
        <div class="lane-list">${raceLaneRowsHtml(lanes)}</div>
        ${printLayout === 'official' ? '<div class="official-notes">Official notes</div>' : ''}
      </article>`;
  }

  // A merged pair prints as ONE card — the pack starts together — but each lane
  // is tagged with its home division so the tabulator still scores separately.
  // Positions are renumbered 1..N across the combined field for the start line.
  function mergedRaceCardHtml(memberRaces, raceNo) {
    const title = memberRaces.map(r => r.groupLabel || '').filter(Boolean).join(' & ');
    const first = memberRaces[0] || {};
    let pos = 0;
    const lanes = [];
    for (const r of memberRaces) {
      for (const ln of printableRaceLanes(r)) { pos += 1; lanes.push({ ...ln, lane: pos, _div: r.groupLabel || '' }); }
    }
    const mergeNote = '🔗 Raced together — scored separately';
    if (printLayout === 'standard') {
      const rows = (lanes.length ? lanes : [{ lane: '', helmetNumber: '', skaterName: '', team: '', _div: '' }]).map((lane, idx) => `
        <tr>
          <td>${idx === 0 ? raceNo : ''}</td>
          <td>${esc(title)}</td>
          <td>${esc(cap(first.division || ''))}</td>
          <td>${esc(first.distanceLabel || '')}</td>
          <td>${esc(raceDisplayStage(first))}</td>
          <td>${esc(lane.lane || '')}</td>
          <td>${lane.helmetNumber ? '#' + esc(lane.helmetNumber) : ''}</td>
          <td>${esc(lane.skaterName || '')}</td>
          <td>${esc(lane._div || '')} ${lane.team ? '• ' + esc(lane.team) : ''}</td>
        </tr>`).join('');
      return `<article class="race-card"><div class="merge-print-note">${mergeNote}</div>
        <table><thead><tr><th>Race</th><th>Division</th><th>Class</th><th>Distance</th><th>Heat</th><th>Lane</th><th>Helmet</th><th>Skater</th><th>Division • Team</th></tr></thead>
        <tbody>${rows}</tbody></table></article>`;
    }
    const laneRows = (lanes.length ? lanes : [{ lane: '', helmetNumber: '', skaterName: '', team: '', _div: '' }]).map(lane => `
      <div class="lane-line">
        <span class="lane-num">Lane ${esc(lane.lane || '')}</span>
        <span class="lane-skater">${lane.helmetNumber ? '#' + esc(lane.helmetNumber) + ' ' : ''}${esc(lane.skaterName || '')}</span>
        <span class="lane-team">${esc(lane._div || '')}${lane.team ? ' • ' + esc(lane.team) : ''}</span>
      </div>`).join('');
    return `
      <article class="race-card merge-print-card">
        <div class="race-card-head">
          <div class="race-number">Race ${raceNo}</div>
          <div>
            <div class="race-title">${esc(title)}</div>
            <div class="race-sub">${esc(cap(first.division || ''))} • ${esc(first.distanceLabel || '')} • ${esc(raceDisplayStage(first))}</div>
            <div class="merge-print-note">${mergeNote}</div>
          </div>
        </div>
        <div class="lane-list">${laneRows}</div>
        ${printLayout === 'official' ? '<div class="official-notes">Official notes</div>' : ''}
      </article>`;
  }

  function timeTrialCardHtml(event, eventNo) {
    return `
      <article class="race-card time-trial-card">
        <div class="race-card-head">
          <div class="race-number">Event ${eventNo}</div>
          <div>
            <div class="race-title">${esc(timeTrialEventTitle(event))}</div>
            <div class="race-sub">Time Trial Event • Distance: ${esc(event.distance || '100m')}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>Order</th><th>Skater</th><th>Team</th><th>Gender</th><th>Time</th></tr></thead>
          <tbody>${printableTimeTrialRows(event)}</tbody>
        </table>
        ${printLayout === 'official' ? '<div class="official-notes">Official notes</div>' : ''}
      </article>`;
  }

  const blocksHtml = (meet.blocks || []).map((block, blockIdx) => {
    const isDivider = breakTypes.has(String(block.type || ''));
    const blockTitle = block.name || (isDivider ? cap(block.type || 'Break') : `Block ${blockIdx + 1}`);
    const header = `
      <div class="block-heading">
        <div>
          <h2>${esc(blockTitle)}</h2>
          <div class="meta-line">${esc(block.day || 'Day 1')}${block.notes ? ' • ' + esc(block.notes) : ''}</div>
        </div>
      </div>`;

    if (isDivider) {
      return `
        <section class="block-section ${pageBreaks ? 'page-break' : ''}">
          ${header}
          ${showNotes ? '<div class="notes-box">Notes</div>' : ''}
        </section>`;
    }

    const timeTrialSections = (block.timeTrialEventIds || []).map(eventId => {
      const event = timeTrialById.get(String(eventId));
      if (!event) return '';
      scheduleNo += 1;
      return timeTrialCardHtml(event, scheduleNo);
    }).join('');

    const renderedMerges = new Set();
    const raceSections = (block.raceIds || []).map(raceId => {
      const race = raceById.get(String(raceId));
      if (!race) return '';
      // Merged pair: render once (on any member) as a single combined card.
      if (race.mergeGroupId) {
        if (renderedMerges.has(race.mergeGroupId)) return '';
        renderedMerges.add(race.mergeGroupId);
        const members = (meet.races || []).filter(r => r.mergeGroupId === race.mergeGroupId)
          .sort((a, b) => (a.mergeLead ? 0 : 1) - (b.mergeLead ? 0 : 1));
        const anyLanes = members.some(r => printableRaceLanes(r).length);
        if (!showEmpty && !anyLanes) return '';
        scheduleNo += 1;
        return mergedRaceCardHtml(members, scheduleNo);
      }
      const lanes = printableRaceLanes(race);
      if (!showEmpty && !lanes.length) return '';
      scheduleNo += 1;
      return raceCardHtml(race, lanes, scheduleNo);
    }).join('');

    const content = `${timeTrialSections}${raceSections}` || '<div class="empty-line">No scheduled races in this block.</div>';
    return `
      <section class="block-section ${pageBreaks ? 'page-break' : ''}">
        ${header}
        <div class="race-print-grid">${content}</div>
        ${showNotes ? '<div class="notes-box">Notes</div>' : ''}
      </section>`;
  }).join('') || '<section class="block-section"><div class="empty-line">No blocks have been created.</div></section>';

  const location = meetRinkLabel(req.db, meet);
  const dateLine = meetDateLabel(meet);

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="default">
      <meta name="apple-mobile-web-app-title" content="SpeedSkateMeet">
      <meta name="theme-color" content="#12284b">
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
      <link rel="icon" href="/icons/apple-touch-icon.png">
      <link rel="manifest" href="/manifest.json">
      <title>Block Schedule - ${esc(meet.meetName || 'Meet')}</title>
      <style>
        *{box-sizing:border-box}
        body{margin:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.25}
        body.layout-official{font-size:12px}
        .page{padding:16px;max-width:1120px;margin:0 auto}
        .print-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding:10px;border:1px solid #ddd;background:#f8fafc}
        .print-controls a,.print-controls button{border:1px solid #bbb;background:#fff;color:#111;border-radius:4px;padding:6px 9px;text-decoration:none;font-size:12px;cursor:pointer}
        .print-controls a.active{background:#111;color:#fff;border-color:#111}
        h1{font-size:22px;margin:0 0 3px}
        h2{font-size:15px;margin:0}
        h3{font-size:12px;margin:8px 0 4px}
        .meet-meta,.meta-line{color:#444}
        .meet-header{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}
        .block-section{break-inside:avoid;margin-bottom:14px}
        .block-heading{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #999;padding-bottom:4px;margin-bottom:5px}
        .race-print-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}
        body.layout-standard .race-print-grid,body.layout-official .race-print-grid{grid-template-columns:1fr}
        .race-card{border:1px solid #999;padding:6px;break-inside:avoid;page-break-inside:avoid;background:#fff}
        .merge-print-card{border-left:3px solid #7c3aed}
        .merge-print-note{font-size:10px;font-weight:700;color:#6d28d9;margin-top:2px}
        .time-trial-card{grid-column:1/-1}
        .race-card-head{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:start;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:4px}
        .race-number{font-weight:800;border:1px solid #111;padding:2px 5px;white-space:nowrap}
        .race-title{font-weight:800;font-size:12px}
        .race-sub{color:#444;font-size:10px}
        .lane-list{display:grid;gap:2px}
        .lane-line{display:grid;grid-template-columns:52px 1fr 1fr;gap:5px;align-items:baseline;border-bottom:1px dotted #ddd;padding:2px 0}
        .lane-line:last-child{border-bottom:0}
        .lane-num{font-weight:700;color:#333}
        .lane-skater{font-weight:700}
        .lane-team{color:#444}
        .official-notes{height:56px;margin-top:7px;border:1px dashed #999;color:#777;padding:5px}
        body.layout-official .race-card{padding:10px;margin-bottom:3px}
        body.layout-official .official-notes{height:90px}
        table{width:100%;border-collapse:collapse;margin-top:4px}
        th,td{border:1px solid #ccc;padding:3px 5px;text-align:left;vertical-align:top}
        th{background:#f1f5f9;color:#111;font-size:9px;text-transform:uppercase;letter-spacing:.03em}
        .notes-box{height:32px;margin-top:6px;border:1px dashed #999;color:#777;padding:5px}
        .empty-line{border:1px solid #ddd;padding:8px;color:#555}
        @media print{
          @page{size:auto;margin:.35in}
          body{font-size:10px}
          body.layout-official{font-size:11px}
          .page{padding:0;max-width:none}
          .no-print{display:none!important}
          .block-section.page-break{break-before:page}
          .block-section:first-of-type{break-before:auto}
          th,td{padding:2px 4px}
          h1{font-size:18px}
          h2{font-size:13px}
          h3{font-size:11px}
        }
      </style>
    </head>
    <body class="layout-${esc(printLayout)}">
      <main class="page">
        <div class="print-controls no-print">
          <button type="button" onclick="window.print()">Print</button>
          <a class="${printLayout === 'compact' ? 'active' : ''}" href="${blockPrintHref(meet.id, { ...controlsBase, layout: 'compact' })}">Compact Two-Column</a>
          <a class="${printLayout === 'standard' ? 'active' : ''}" href="${blockPrintHref(meet.id, { ...controlsBase, layout: 'standard' })}">Standard Layout</a>
          <a class="${printLayout === 'official' ? 'active' : ''}" href="${blockPrintHref(meet.id, { ...controlsBase, layout: 'official' })}">Official Packet</a>
          <a href="${blockPrintHref(meet.id, { ...controlsBase, notes: showNotes ? '0' : '1' })}">${showNotes ? 'Hide Notes Space' : 'Show Notes Space'}</a>
          <a href="${blockPrintHref(meet.id, { ...controlsBase, breaks: pageBreaks ? '0' : '1' })}">${pageBreaks ? 'No Page Breaks' : 'Page Break By Block'}</a>
          <a href="${blockPrintHref(meet.id, { ...controlsBase, empty: showEmpty ? '0' : '1' })}">${showEmpty ? 'Hide Empty Lanes' : 'Show Empty Lanes'}</a>
          <span class="meet-meta">${printLayout === 'compact' ? 'Compact two-column on' : printLayout === 'official' ? 'Official packet layout' : 'Standard layout'}</span>
        </div>
        <header class="meet-header">
          <h1>${esc(meet.meetName || 'Meet')} - Block Schedule</h1>
          <div class="meet-meta">${esc(dateLine || '')}${location ? ' • ' + esc(location) : ''}</div>
        </header>
        ${blocksHtml}
      </main>
    </body>
  </html>`;
}

// ── Race Score Sheets (printable paper worksheets) ───────────────────────────
// Display/print only — this never reads or writes places, points, or status.
// It exists so officials have a paper backup for manual scoring during a meet.

function scoreSheetRaceTypeLabel(race) {
  if (race.type === 'time_trial' || race.isTimeTrial) return 'Time Trial';
  if (race.isRelayRace) return 'Relay';
  if (race.isOpenRace) return 'Open';
  if (race.isQuadRace) return 'Quad';
  if (race.isAdditionalRace || String(race.division || '').toLowerCase() === 'additional') return 'Additional';
  return cap(race.division || 'Standard');
}

function scoreSheetLaneRows(item, meet) {
  // orderedRaces() represents time-trial events as a placeholder with no
  // laneEntries — resolve the real race object so the sheet shows actual entries.
  let actualRace = item;
  if (item.type === 'time_trial' || item.isTimeTrial) {
    actualRace = (meet.races || []).find(r => r.isTimeTrial && String(r.id) === String(item.id)) || item;
  }
  return laneRowsForRace(actualRace, meet);
}

function scoreSheetPageHtml(item, meet, raceNumber) {
  const lanes = scoreSheetLaneRows(item, meet);
  const laneRowsHtml = lanes.map(l => `
    <tr>
      <td class="ss-lane-num">${esc(l.lane)}</td>
      <td>${l.helmetNumber ? '#' + esc(l.helmetNumber) : ''}</td>
      <td>${esc(l.skaterName || '')}</td>
      <td>${esc(l.team || '')}</td>
      <td class="ss-blank"></td>
      <td class="ss-blank"></td>
      <td class="ss-blank"></td>
      <td class="ss-blank ss-notes"></td>
    </tr>`).join('');

  return `
    <section class="ss-page">
      <div class="ss-header">
        <div class="ss-header-main">
          <div class="ss-meet-name">${esc(meet.meetName || 'Meet')}</div>
          <div class="ss-field-grid">
            <div><span class="ss-field-label">Date</span><span class="ss-field-value">${esc(meet.date || '')}</span></div>
            <div><span class="ss-field-label">Race #</span><span class="ss-field-value">${esc(raceNumber)}</span></div>
            <div><span class="ss-field-label">Division</span><span class="ss-field-value">${esc(item.groupLabel || '')}</span></div>
            <div><span class="ss-field-label">Distance</span><span class="ss-field-value">${esc(item.distanceLabel || '')}</span></div>
            <div><span class="ss-field-label">Heat / Final</span><span class="ss-field-value">${esc(raceDisplayStage(item))}</span></div>
            <div><span class="ss-field-label">Race Type</span><span class="ss-field-value">${esc(scoreSheetRaceTypeLabel(item))}</span></div>
            <div><span class="ss-field-label">Start</span><span class="ss-field-value">${esc(cap(item.startType || ''))}</span></div>
          </div>
        </div>
        <div class="ss-qr" title="Reserved for a future race QR/barcode"></div>
      </div>

      <table class="ss-lane-table">
        <thead><tr><th>Lane</th><th>Helmet</th><th>Skater Name</th><th>Team</th><th>Place</th><th>Status</th><th>Points</th><th>Notes</th></tr></thead>
        <tbody>${laneRowsHtml || `<tr><td colspan="8" class="ss-empty">No skaters assigned yet.</td></tr>`}</tbody>
      </table>

      <div class="ss-status-key">
        <strong>Status key:</strong> DNS = Did Not Start &nbsp;•&nbsp; DNF = Did Not Finish &nbsp;•&nbsp; Scratch &nbsp;•&nbsp; DQ = Disqualified
      </div>

      <div class="ss-checkboxes">
        <span class="ss-checkbox">☐ Photo Finish Used</span>
        <span class="ss-checkbox">☐ Protest Filed</span>
        <span class="ss-checkbox">☐ Rerace</span>
        <span class="ss-checkbox">☐ Official Review</span>
      </div>

      <div class="ss-signatures">
        <div class="ss-sig"><span class="ss-sig-line"></span><span class="ss-sig-label">Chief Referee Signature</span></div>
        <div class="ss-sig"><span class="ss-sig-line"></span><span class="ss-sig-label">Assistant Referee</span></div>
        <div class="ss-sig"><span class="ss-sig-line"></span><span class="ss-sig-label">Starter</span></div>
        <div class="ss-sig ss-sig-time"><span class="ss-sig-line"></span><span class="ss-sig-label">Time</span></div>
      </div>
    </section>`;
}

function groupScoreSheetItems(items, meet, layout) {
  const groups = [];
  const fitsCompactHalfPage = item => scoreSheetLaneRows(item, meet).length <= 8;

  for (let index = 0; index < items.length;) {
    const item = items[index];
    if (layout === 'standard' || !fitsCompactHalfPage(item)) {
      groups.push({ items: [item], compact: false });
      index += 1;
      continue;
    }

    const next = items[index + 1];
    if (next && fitsCompactHalfPage(next)) {
      groups.push({ items: [item, next], compact: true });
      index += 2;
    } else {
      groups.push({ items: [item], compact: true });
      index += 1;
    }
  }

  return groups;
}

function renderScoreSheetsPrintPage({ req, meet, items, scopeLabel, layout = 'compact' }) {
  const location = meetRinkLabel(req.db, meet);
  const orderedAll = orderedRaces(meet);
  const numberById = new Map(orderedAll.map((r, idx) => [String(r.id), idx + 1]));
  const printGroups = groupScoreSheetItems(items, meet, layout);
  const pagesHtml = printGroups.map(group => {
    const sheets = group.items.map(item => scoreSheetPageHtml(item, meet, numberById.get(String(item.id)) || '')).join('');
    const pairClass = group.compact && group.items.length === 2 ? ' ss-print-page--pair' : '';
    return `<div class="ss-print-page${group.compact ? ' ss-print-page--compact' : ' ss-print-page--standard'}${pairClass}">${sheets}</div>`;
  }).join('');

  const layoutQuery = new URLSearchParams();
  const scope = String(req.query.scope || 'meet');
  layoutQuery.set('scope', scope);
  if (scope === 'race' && req.query.raceId) layoutQuery.set('raceId', String(req.query.raceId));
  if (scope === 'block' && req.query.blockId) layoutQuery.set('blockId', String(req.query.blockId));
  const layoutHref = nextLayout => {
    const query = new URLSearchParams(layoutQuery);
    query.set('layout', nextLayout);
    return `/portal/meet/${encodeURIComponent(String(meet.id))}/score-sheets/print?${query.toString()}`;
  };
  const pdfQuery = new URLSearchParams(layoutQuery);
  pdfQuery.set('layout', layout);
  pdfQuery.set('format', 'pdf');
  const pdfHref = `/portal/meet/${encodeURIComponent(String(meet.id))}/score-sheets/print?${pdfQuery.toString()}`;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Score Sheets - ${esc(meet.meetName || 'Meet')}</title>
      <style>
        *{box-sizing:border-box}
        body{margin:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3}
        .page{padding:18px;max-width:980px;margin:0 auto}
        .print-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:10px;border:1px solid #ddd;background:#f8fafc}
        .print-controls a,.print-controls button{border:1px solid #999;background:#fff;color:#111;border-radius:4px;padding:7px 12px;text-decoration:none;font-size:13px;cursor:pointer}
        .print-controls a.active{background:#111;color:#fff;border-color:#111}
        .ss-page{border:2px solid #111;padding:18px;margin-bottom:22px;break-inside:avoid}
        .ss-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
        .ss-meet-name{font-size:20px;font-weight:700;margin-bottom:8px}
        .ss-field-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 16px}
        .ss-field-label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#555}
        .ss-field-value{display:block;font-size:14px;font-weight:700;border-bottom:1px solid #999;min-height:20px}
        .ss-qr{flex:0 0 auto;width:84px;height:84px;border:1px dashed #999;display:flex;align-items:center;justify-content:center}
        .ss-lane-table{width:100%;border-collapse:collapse;margin-bottom:12px}
        .ss-lane-table th,.ss-lane-table td{border:1px solid #111;padding:8px 6px;text-align:left;vertical-align:top}
        .ss-lane-table th{background:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
        .ss-lane-table td{height:34px;font-size:13px}
        .ss-lane-num{font-weight:700;text-align:center;width:36px}
        .ss-blank{min-width:54px}
        .ss-notes{min-width:120px}
        .ss-empty{text-align:center;color:#666;padding:14px}
        .ss-status-key{font-size:11px;color:#333;margin-bottom:10px}
        .ss-checkboxes{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;margin-bottom:18px}
        .ss-signatures{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px}
        .ss-sig{flex:1 1 160px;display:flex;flex-direction:column;gap:4px}
        .ss-sig-time{flex:0 0 110px}
        .ss-sig-line{border-bottom:1px solid #111;height:30px}
        .ss-sig-label{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#555}
        @media print{
          @page{size:letter portrait;margin:.35in}
          .no-print{display:none!important}
          .page{padding:0;max-width:none}
          .ss-print-page{display:block;break-after:page;page-break-after:always;break-inside:auto;page-break-inside:auto}
          .ss-print-page:last-child{break-after:auto;page-break-after:auto}
          .ss-page{display:block;border:1.5px solid #111;margin:0;break-inside:avoid;page-break-inside:avoid}
          .ss-print-page--pair .ss-page + .ss-page{margin-top:.1in}
          .ss-print-page--pair .ss-page{padding:8px;min-height:0}
          .ss-print-page--pair .ss-header{gap:10px;padding-bottom:5px;margin-bottom:6px}
          .ss-print-page--pair .ss-meet-name{font-size:16px;margin-bottom:4px}
          .ss-print-page--pair .ss-field-grid{gap:3px 12px}
          .ss-print-page--pair .ss-field-label{font-size:7px}
          .ss-print-page--pair .ss-field-value{font-size:11px;min-height:15px}
          .ss-print-page--pair .ss-qr{width:56px;height:56px}
          .ss-print-page--pair .ss-lane-table{margin-bottom:5px}
          .ss-print-page--pair .ss-lane-table th,.ss-print-page--pair .ss-lane-table td{padding:3px 4px}
          .ss-print-page--pair .ss-lane-table th{font-size:8px}
          .ss-print-page--pair .ss-lane-table td{height:23px;font-size:10.5px}
          .ss-print-page--pair .ss-lane-num{width:28px}
          .ss-print-page--pair .ss-blank{min-width:42px}
          .ss-print-page--pair .ss-notes{min-width:80px}
          .ss-print-page--pair .ss-status-key{font-size:8px;margin-bottom:4px}
          .ss-print-page--pair .ss-checkboxes{gap:10px;font-size:9px;margin-bottom:4px}
          .ss-print-page--pair .ss-signatures{gap:10px;margin-top:2px}
          .ss-print-page--pair .ss-sig{gap:2px}
          .ss-print-page--pair .ss-sig-line{height:14px}
          .ss-print-page--pair .ss-sig-label{font-size:7px}
        }
      </style>
    </head>
    <body>
      <main class="page">
        <div class="print-controls no-print">
          <button type="button" onclick="window.print()">Print</button>
          <a href="${esc(pdfHref)}">Open Reliable PDF</a>
          <a href="/portal/meet/${esc(meet.id)}/blocks">Back to Block Builder</a>
          <a class="${layout === 'compact' ? 'active' : ''}" href="${esc(layoutHref('compact'))}">Compact · 2 per page</a>
          <a class="${layout === 'standard' ? 'active' : ''}" href="${esc(layoutHref('standard'))}">Standard · 1 per page</a>
          <span>${esc(scopeLabel)} • ${items.length} score sheet${items.length===1?'':'s'} • ${printGroups.length} printed page${printGroups.length===1?'':'s'}</span>
        </div>
        ${pagesHtml || '<div class="ss-empty">No races to print for this selection.</div>'}
      </main>
    </body>
  </html>`;
}

module.exports = function createRaceDayRoutes(deps = {}) {
  const router = express.Router();
  const { requireRole, pageShell, saveDb,
          renderBlockBuilderView, resultsSectionHtml, quadResultsSectionHtml,
          announcerBoxHtml, meetTabs } = deps;

// ── Block race-flow auto-arranger ────────────────────────────────────────────
// Real meet flow for blocks with heats, per the MSSL league director (Jon):
// "all heats at the start of the block, finals at the final time. If there are
//  semis they run at the final time and then that race's final is at the END of
//  the block." So a HEATS-ONLY division runs its final in normal age order; only
//  a division that runs SEMIS defers its final to the block end (its semis take
//  the age-order slot). This MUST match services/scheduleGenerator.js
//  orderBlockRaces — the schedule generator and this optimizer are two paths to
//  the same rule, so keep them in lock-step.
// 1) heats first, youngest→oldest
// 2) the "final time" sweep, youngest→oldest: each division's final — except a
//    semis division shows its SEMIS here instead
// 3) finals of semis divisions last, youngest→oldest (the rest break)
// This only reorders raceIds already inside each block. It does not rebuild races,
// delete races, move races between blocks, or touch lane entries.
function isStandardScheduleRace(race) {
  const div = String(race?.division || '').toLowerCase();
  if (!race) return false;

  // Auto Flow should handle normal division races AND quad races.
  // It should still leave opens, relays, time trials, and additionals alone.
  if (race.isOpenRace || race.isRelayRace || race.isTimeTrial || race.isAdditionalRace || race.isSkateabilityRace) return false;
  if (['open', 'relay', 'additional', 'skateability'].includes(div)) return false;

  if (race.isQuadRace || div === 'quad') return true;
  return ['novice', 'elite'].includes(div);
}

function raceFlowSignature(race) {
  const parent = String(race?.parentRaceKey || '').trim();
  if (parent) return parent;
  return [
    String(race?.groupId || ''),
    String(race?.division || ''),
    String(race?.dayIndex || ''),
    String(race?.distanceLabel || ''),
  ].join('|');
}

function raceGroupOrderIndex(meet, race) {
  const groups = Array.isArray(meet?.groups) ? meet.groups : [];
  const gid = String(race?.groupId || '');
  const label = String(race?.groupLabel || '').trim().toLowerCase();
  let idx = groups.findIndex(g => String(g.id || '') === gid);
  if (idx >= 0) return idx;
  idx = groups.findIndex(g => String(g.label || '').trim().toLowerCase() === label);
  if (idx >= 0) return idx;

  // Known fallback order when labels/groups have older saved IDs.
  const fallback = [
    'diaper dash','skate ability','skatability','additional','tiny tot girls','tiny tot boys',
    'primary girls','primary boys','juvenile girls','juvenile boys','elementary girls','elementary boys',
    'freshman girls','freshman boys','sophomore girls','sophomore boys','junior women','junior men',
    'senior women','senior men','classic women','classic men','master women','master men',
    'veteran women','veteran men','esquire women','esquire men'
  ];
  idx = fallback.findIndex(x => label.includes(x));
  return idx >= 0 ? idx : 9999;
}

function raceDivisionOrderIndex(race) {
  const div = String(race?.division || '').toLowerCase();
  if (div === 'novice') return 0;
  if (div === 'elite') return 1;
  if (div === 'open') return 2;
  if (div === 'quad') return 3;
  if (div === 'additional') return 4;
  if (div === 'relay') return 5;
  return 9;
}

function raceFlowSortKey(meet, race, originalIndex) {
  return [
    raceGroupOrderIndex(meet, race),
    Number(race?.dayIndex || 0),
    raceDivisionOrderIndex(race),
    String(race?.distanceLabel || ''),
    Number(race?.heatNumber || 0),
    originalIndex,
  ];
}

function compareRaceFlowKeys(a, b) {
  const ka = a.key;
  const kb = b.key;
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const av = ka[i];
    const bv = kb[i];
    if (typeof av === 'number' && typeof bv === 'number') {
      if (av !== bv) return av - bv;
    } else {
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      if (cmp) return cmp;
    }
  }
  return 0;
}

function arrangeBlockHeatFinalFlow(meet, block) {
  if (!block || String(block.type || 'race') !== 'race') return false;
  const raceIds = Array.isArray(block.raceIds) ? block.raceIds.map(String) : [];
  if (raceIds.length < 2) return false;

  const raceById = new Map((meet.races || []).map(r => [String(r.id), r]));
  const rows = raceIds.map((id, idx) => ({ id, race: raceById.get(id), originalIndex: idx }));

  // A division that runs SEMIS defers its final to the block end; a heats-only
  // division does NOT (its final stays in the age sweep). Track the two sets
  // separately so we only push semis-division finals to the tail.
  const signaturesWithQualifier = new Set(); // heat OR semi -> is a qualifier division
  const signaturesWithSemis = new Set();     // has a semi -> final goes to block end
  for (const row of rows) {
    if (!isStandardScheduleRace(row.race)) continue;
    const stage = String(row.race?.stage || '').toLowerCase();
    if (stage === 'semi') { signaturesWithSemis.add(raceFlowSignature(row.race)); signaturesWithQualifier.add(raceFlowSignature(row.race)); }
    else if (stage === 'heat' || stage === 'quarter') signaturesWithQualifier.add(raceFlowSignature(row.race));
  }

  // Blocks with no heats/semis are usually already deliberate/manual. Leave alone.
  if (!signaturesWithQualifier.size) return false;

  const heatRows = [];
  const directFinalRows = [];
  const heatedFinalRows = [];
  const unknownRows = [];

  for (const row of rows) {
    const race = row.race;
    if (!race) {
      unknownRows.push({ ...row, key: [row.originalIndex] });
      continue;
    }

    const standard = isStandardScheduleRace(race);
    const signature = raceFlowSignature(race);
    const stage = String(race?.stage || '').toLowerCase();
    const isHeat = stage === 'heat' || stage === 'quarter';
    const isSemi = stage === 'semi';

    if (standard && isHeat) {
      // (1) heats ride the very top of the block.
      heatRows.push({ ...row, key: raceFlowSortKey(meet, race, row.originalIndex) });
    } else if (standard && isSemi) {
      // (2) semis run in the age-order sweep — the division's "final time" slot.
      directFinalRows.push({ ...row, key: raceFlowSortKey(meet, race, row.originalIndex) });
    } else if (standard && signaturesWithSemis.has(signature)) {
      // (3) only a semis division's FINAL is deferred to the block end.
      heatedFinalRows.push({ ...row, key: raceFlowSortKey(meet, race, row.originalIndex) });
    } else if (standard) {
      directFinalRows.push({ ...row, key: raceFlowSortKey(meet, race, row.originalIndex) });
    } else if (race.isAdditionalRace || String(race.division || '').toLowerCase() === 'additional') {
      // Additionals usually behave like straight finals, and directors often want them
      // near the start of the direct-final section.
      directFinalRows.push({ ...row, key: [-100, Number(race.dayIndex || 0), row.originalIndex] });
    } else {
      // Relays/open/quad/time-trials keep their original relative order if they happen
      // to be inside a normal block, but they stay out of the heat/final split.
      directFinalRows.push({ ...row, key: [10000, row.originalIndex] });
    }
  }

  heatRows.sort(compareRaceFlowKeys);
  directFinalRows.sort(compareRaceFlowKeys);
  heatedFinalRows.sort(compareRaceFlowKeys);

  const nextIds = [...heatRows, ...directFinalRows, ...heatedFinalRows, ...unknownRows].map(row => row.id);
  const changed = nextIds.join('|') !== raceIds.join('|');
  if (changed) block.raceIds = nextIds;
  return changed;
}

function autoArrangeMeetHeatFinalFlow(meet) {
  let changedBlocks = 0;
  ensureAtLeastOneBlock(meet);
  for (const block of meet.blocks || []) {
    if (arrangeBlockHeatFinalFlow(meet, block)) changedBlocks += 1;
  }
  if (changedBlocks) meet.updatedAt = nowIso();
  return changedBlocks;
}


function raceListNumber(meet, race) {
  const ordered = orderedRaces(meet);
  const idx = ordered.findIndex(r => String(r.id) === String(race?.id || ''));
  return idx >= 0 ? idx + 1 : '';
}

function correctionRaceLabel(meet, race) {
  const raceNo = raceListNumber(meet, race);
  return [
    raceNo ? `Race ${raceNo}` : 'Race',
    race?.groupLabel || 'Division',
    cap(race?.division || ''),
    race?.distanceLabel || '',
    raceDisplayStage(race),
  ].filter(Boolean).join(' — ');
}

function laneEntrySnapshot(entry) {
  return {
    lane: Number(entry?.lane || 0) || '',
    registrationId: String(entry?.registrationId || ''),
    helmetNumber: String(entry?.helmetNumber || ''),
    skaterName: String(entry?.skaterName || ''),
    team: String(entry?.team || ''),
    place: String(entry?.place || ''),
    time: String(entry?.time || ''),
    status: String(entry?.status || ''),
    dqCategory: String(entry?.dqCategory || ''),
    dqRuleReference: String(entry?.dqRuleReference || ''),
    dqOfficialNotes: String(entry?.dqOfficialNotes || ''),
    dqTimestamp: String(entry?.dqTimestamp || ''),
    dqRecordedBy: String(entry?.dqRecordedBy || ''),
    dqRecordedByUserId: String(entry?.dqRecordedByUserId || ''),
  };
}

function raceCorrectionSnapshot(race) {
  return {
    raceId: String(race?.id || ''),
    status: String(race?.status || ''),
    resultsMode: String(race?.resultsMode || 'places'),
    notes: String(race?.notes || ''),
    laneEntries: (Array.isArray(race?.laneEntries) ? race.laneEntries : []).map(laneEntrySnapshot),
  };
}

function laneCountForCorrection(meet, race, existingLaneEntries) {
  if (race?.isTimeTrial) return Math.max(existingLaneEntries.length, 1);
  if (race?.isOpenRace || isOpenDivision(race?.division) || race?.isRelayRace) return Math.max(existingLaneEntries.length, 1);
  return Math.max(existingLaneEntries.length, Number(meet?.lanes || 0), 1);
}

function applyRaceCorrectionFromBody(meet, race, body, user) {
  const existingLaneEntries = Array.isArray(race.laneEntries) ? [...race.laneEntries] : [];
  const laneCount = laneCountForCorrection(meet, race, existingLaneEntries);
  const nextLaneEntries = [];

  for (let i = 1; i <= laneCount; i++) {
    const existing = existingLaneEntries.find(x => Number(x.lane) === i) || {};
    nextLaneEntries.push(laneResultFromBody(existing, i, body, user));
  }

  race.laneEntries = nextLaneEntries;
  race.resultsMode = String(body.resultsMode || race.resultsMode || 'places') === 'times' ? 'times' : 'places';
  race.notes = String(body.notes ?? race.notes ?? '');
  race.status = 'closed';
  race.closedAt = race.closedAt || nowIso();
  race.correctedAt = nowIso();
}

function correctionAuditReason(value) {
  return String(value || '').trim().slice(0, 500);
}

function recordRaceCorrection(meet, race, user, before, after, reason) {
  if (!Array.isArray(meet.raceCorrections)) meet.raceCorrections = [];
  meet.raceCorrections.unshift({
    id: `corr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    raceId: String(race?.id || ''),
    raceLabel: correctionRaceLabel(meet, race),
    correctedAt: nowIso(),
    correctedByUserId: user?.id || '',
    correctedBy: user?.displayName || user?.username || 'Meet Director',
    reason,
    before,
    after,
  });
  meet.raceCorrections = meet.raceCorrections.slice(0, 200);
}

function correctionWarningHtml(race) {
  const isAdvancement = isAdvancementRace(race);
  return `
    <div class="card" style="border-left:5px solid var(--orange);margin-bottom:16px;background:#fff7ed">
      <h2 style="margin:0 0 8px;color:#9a3412">⚠ Correction Mode</h2>
      <div style="font-weight:800;color:#9a3412;line-height:1.45">
        You are editing a completed race. This does not rewind the meet, does not change the current race, and does not rebuild later races.
        ${isAdvancement ? '<br>This race may affect advancement. Review downstream races manually after saving.' : ''}
      </div>
    </div>`;
}

function renderCorrectionRaceForm(meet, race, regMap, user, error = '', ok = '') {
  const lanes = laneRowsForRace(race, meet);
  const raceNo = raceListNumber(meet, race);
  const correctionHistory = (Array.isArray(meet.raceCorrections) ? meet.raceCorrections : [])
    .filter(row => String(row.raceId || '') === String(race.id || ''))
    .slice(0, 5);

  return `
    <div class="page-header"><h1>Race Correction</h1><div class="sub">${esc(meet.meetName)}${raceNo ? ' • Race ' + esc(raceNo) : ''}</div></div>
    ${raceDaySubTabs(meet, 'director')}
    <div class="action-row" style="margin-bottom:14px"><a class="btn2" href="/portal/meet/${esc(meet.id)}/race-day/director">← Back to Race Day</a></div>
    ${error ? `<div class="bad" style="margin-bottom:16px">${esc(error)}</div>` : ''}
    ${ok ? `<div class="good" style="margin-bottom:16px">${esc(ok)}</div>` : ''}
    ${correctionWarningHtml(race)}
    <div class="card">
      <div class="row between center" style="margin-bottom:14px">
        <div>
          <h2 style="margin:0">${esc(correctionRaceLabel(meet, race))}</h2>
          <div class="note">Current race remains unchanged. Use this only for result disputes or scoring corrections.</div>
        </div>
        <span class="chip chip-${race.status === 'closed' ? 'green' : 'sky'}">${esc(race.status || 'open')}</span>
      </div>
      <form method="POST" action="/portal/meet/${esc(meet.id)}/race-day/correction/save" onsubmit="return confirm('Save this correction? This updates this race only and will not rebuild later races.');">
        <input type="hidden" name="raceId" value="${esc(race.id)}" />
        <div class="action-row" style="margin-bottom:14px">
          <label class="toggle-wrap"><input type="radio" name="resultsMode" value="places" ${race.resultsMode !== 'times' ? 'checked' : ''} style="width:auto" /> <span style="font-size:14px;font-weight:600">Places</span></label>
          <label class="toggle-wrap"><input type="radio" name="resultsMode" value="times" ${race.resultsMode === 'times' ? 'checked' : ''} style="width:auto" /> <span style="font-size:14px;font-weight:600">Times</span></label>
        </div>
        <div style="overflow-x:auto">
          <table class="table">
            <thead><tr><th>Lane</th><th>Helmet</th><th>Skater</th><th>Team</th><th>Place</th><th>Time</th><th>🏅 Rec</th><th>Status</th></tr></thead>
            <tbody>${lanes.map(l => { const reg = regMap.get(Number(l.registrationId)); return `<tr>
              <td>${esc(l.lane)}</td>
              <td>${l.helmetNumber ? '#' + esc(l.helmetNumber) : ''}</td>
              <td><div style="display:flex;align-items:center;gap:10px">${skaterAvatarHtml(l, reg, 'small')}<div style="flex:1"><input name="skaterName_${esc(l.lane)}" value="${esc(l.skaterName)}" />${reg?.sponsor ? `<div class="sponsor-line">Sponsor: ${esc(reg.sponsor)}</div>` : ''}</div></div></td>
              <td><input name="team_${esc(l.lane)}" value="${esc(l.team)}" /></td>
              <td><input name="place_${esc(l.lane)}" value="${esc(l.place)}" /></td>
              <td><input name="time_${esc(l.lane)}" value="${esc(l.time)}" /></td>
              <td style="text-align:center"><input type="checkbox" name="record_${esc(l.lane)}" ${l.record ? 'checked' : ''} title="New record set in this race" /></td>
              <td><select class="race-status-select" data-lane="${esc(l.lane)}" name="status_${esc(l.lane)}">${raceStatusOptionsHtml(l.status)}</select>${dqMetadataFields(l, l.lane)}</td>
            </tr>`; }).join('')}</tbody>
          </table>
        </div>
        <div style="margin-top:14px"><label>Race Notes</label><textarea name="notes">${esc(race.notes || '')}</textarea></div>
        <div style="margin-top:14px"><label>Correction Reason</label><textarea name="reason" placeholder="Example: Judge review corrected finishing order after protest." required></textarea></div>
        <div class="action-row" style="margin-top:14px">
          <button class="btn-orange" type="submit">Save Correction</button>
          <a class="btn2" href="/portal/meet/${esc(meet.id)}/race-day/director">Cancel</a>
        </div>
      </form>
      ${dqDialogHtml(user)}
    </div>
    ${correctionHistory.length ? `<div class="card" style="margin-top:16px"><h2>Recent Corrections for This Race</h2><table class="table"><thead><tr><th>Time</th><th>By</th><th>Reason</th></tr></thead><tbody>${correctionHistory.map(row => `<tr><td>${esc(new Date(row.correctedAt || '').toLocaleString())}</td><td>${esc(row.correctedBy || '')}</td><td>${esc(row.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}


// Race Actions was folded into Block Builder's "Race Day Prep" flow (Rebuild →
// Generate → Optimize → Race Day) to end the two-tabs-for-one-job confusion.
// Redirect keeps old links/bookmarks working.
router.get('/portal/meet/:meetId/race-actions', requireRole('meet_director'), (req, res) => {
  return res.redirect(301, `/portal/meet/${req.params.meetId}/blocks`);
});

router.get('/portal/meet/:meetId/blocks', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send(pageShell({title:'Forbidden',user:req.user,bodyHtml:`<div class="page-header"><h1>Forbidden</h1></div><div class="card"><div class="danger">Only the meet owner can edit this meet.</div></div>`}));
  const initializedCurrentRace = ensureCurrentRace(meet);
  if(initializedCurrentRace) saveDb(req.db);

  res.send(pageShell({
    title:'Block Builder',
    user:req.user,
    meet,
    activeTab:'blocks',
    bodyHtml:renderBlockBuilderView({ meet }),
  }));
});

router.get('/portal/meet/:meetId/blocks/print', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  ensureAtLeastOneBlock(meet);

  const showNotes = String(req.query.notes || '1') !== '0';
  const pageBreaks = String(req.query.breaks || '') === '1';
  const showEmpty = String(req.query.empty || '') === '1';
  const layout = String(req.query.layout || 'compact');

  res.send(renderBlockSchedulePrintPage({ req, meet, showNotes, pageBreaks, showEmpty, layout }));
});

router.get('/portal/meet/:meetId/score-sheets/print', requireRole('meet_director','judge','super_admin'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  ensureAtLeastOneBlock(meet);

  const scope=String(req.query.scope||'meet');
  const layout=String(req.query.layout||'compact')==='standard'?'standard':'compact';
  const ordered=orderedRaces(meet);
  let items=[];
  let scopeLabel='Entire Meet';

  if(scope==='race') {
    const raceId=String(req.query.raceId||'');
    items=ordered.filter(r=>String(r.id)===raceId);
    scopeLabel=items[0]?`${items[0].groupLabel} — ${items[0].distanceLabel}`:'Selected Race';
  } else if(scope==='block') {
    const blockId=String(req.query.blockId||'');
    const block=(meet.blocks||[]).find(b=>String(b.id)===blockId);
    items=ordered.filter(r=>String(r.blockId||'')===blockId);
    scopeLabel=block?`Block: ${block.name||'Block'}`:'Selected Block';
  } else {
    items=ordered;
  }

  if(String(req.query.format||'').toLowerCase()==='pdf') {
    const numberById=new Map(ordered.map((race,index)=>[String(race.id),index+1]));
    const groups=groupScoreSheetItems(items,meet,layout).map(group=>({
      compact:group.compact,
      sheets:group.items.map(item=>({
        meetName:meet.meetName||'Meet',
        date:meet.date||'',
        raceNumber:numberById.get(String(item.id))||'',
        division:item.groupLabel||'',
        distance:item.distanceLabel||'',
        stage:raceDisplayStage(item),
        raceType:scoreSheetRaceTypeLabel(item),
        startType:cap(item.startType||''),
        lanes:scoreSheetLaneRows(item,meet),
      })),
    }));
    return streamScoreSheetsPdf(res,{meetName:meet.meetName||'Meet',groups});
  }

  res.send(renderScoreSheetsPrintPage({ req, meet, items, scopeLabel, layout }));
});

router.post('/api/meet/:meetId/blocks/add', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  const n=(meet.blocks||[]).length+1;
  const block={id:'b'+crypto.randomBytes(4).toString('hex'),name:'Block '+n,day:'Day 1',type:'race',notes:'',raceIds:[]};
  meet.blocks.push(block);
  meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true,blockId:block.id});
});

router.post('/api/meet/:meetId/blocks/add-divider', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  const type=String(req.body.type||'break');
  const name=String(req.body.name||'Break').trim();
  // R8: optional day + insert position. Back-compat: with neither, this appends
  // a Day 1 divider exactly as before (what the manual Break/Lunch buttons send).
  const day=(typeof req.body.day==='string'&&req.body.day.trim())?String(req.body.day).trim():'Day 1';
  const block={id:'b'+crypto.randomBytes(4).toString('hex'),name,day,type,notes:'',raceIds:[]};
  const afterId=String(req.body.afterBlockId||'').trim();
  if(afterId==='__start__'){
    meet.blocks.unshift(block);
  }else{
    const at=afterId?(meet.blocks||[]).findIndex(b=>b.id===afterId):-1;
    if(at>=0) meet.blocks.splice(at+1,0,block); else meet.blocks.push(block);
  }
  meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true,blockId:block.id});
});

router.post('/api/meet/:meetId/blocks/update-meta', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const block=(meet.blocks||[]).find(b=>b.id===String(req.body.blockId||''));
  if(!block) return res.status(404).send('Not found');
  if(typeof req.body.name==='string'&&req.body.name.trim()) block.name=String(req.body.name).trim();
  if(typeof req.body.day==='string'&&req.body.day.trim()) block.day=String(req.body.day).trim();
  if(typeof req.body.type==='string'&&req.body.type.trim()) block.type=String(req.body.type).trim();
  if(typeof req.body.notes==='string') block.notes=String(req.body.notes);
  // R5: optional per-block duration override in minutes (0/empty = automatic)
  if(req.body.durationMin!==undefined){
    const v=Number(req.body.durationMin);
    block.durationMin=isFinite(v)&&v>0?Math.min(1440,Math.round(v)):0;
  }
  meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

router.post('/api/meet/:meetId/blocks/delete', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const blockId=String(req.body.blockId||'');
  if(!(meet.blocks||[]).find(b=>b.id===blockId)) return res.status(404).send('Block not found');
  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  meet.blocks=(meet.blocks||[]).filter(b=>b.id!==blockId);
  ensureAtLeastOneBlock(meet); ensureCurrentRace(meet); meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

router.post('/api/meet/:meetId/blocks/move', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const blockId=String(req.body.blockId||'');
  const dir=String(req.body.dir||'').toLowerCase();
  const blocks = meet.blocks || [];
  const idx = blocks.findIndex(b=>b.id===blockId);
  if(idx===-1) return res.status(404).send('Block not found');
  let swapIdx = null;
  if(dir==='up') swapIdx = idx-1;
  else if(dir==='down') swapIdx = idx+1;
  if(swapIdx===null || swapIdx<0 || swapIdx>=blocks.length) return res.json({ok:false});
  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  // swap blocks
  const tmp = blocks[swapIdx]; blocks[swapIdx] = blocks[idx]; blocks[idx] = tmp;
  meet.blocks = blocks;
  meet.updatedAt = nowIso(); saveDb(req.db);
  res.json({ok:true});
});

// R4: drag-to-reorder. Accepts the full block order (each existing block id
// exactly once) so a drop is one idempotent request. /blocks/move stays as the
// keyboard-accessible one-slot fallback.
router.post('/api/meet/:meetId/blocks/reorder', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const order=Array.isArray(req.body.order)?req.body.order.map(String):null;
  if(!order||!order.length) return res.status(400).send('Order missing');
  const blocks=meet.blocks||[];
  const byId=new Map(blocks.map(b=>[String(b.id),b]));
  if(order.length!==blocks.length||new Set(order).size!==order.length||!order.every(id=>byId.has(id)))
    return res.status(400).send('Order must contain each existing block exactly once');
  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  meet.blocks=order.map(id=>byId.get(id));
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.json({ok:true});
});

// R11: reorder races WITHIN a block. `order` must be a permutation of the block's
// current raceIds (same validation shape as /blocks/reorder for whole blocks).
router.post('/api/meet/:meetId/blocks/reorder-races', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const block=(meet.blocks||[]).find(b=>String(b.id)===String(req.body.blockId||''));
  if(!block) return res.status(404).send('Block not found');
  if((block.type||'race')!=='race') return res.status(400).send('Not a race block');
  const order=Array.isArray(req.body.order)?req.body.order.map(String):null;
  const current=(block.raceIds||[]).map(String);
  if(!order||order.length!==current.length||new Set(order).size!==order.length||!order.every(id=>current.includes(id)))
    return res.status(400).send('Order must contain each of the block\'s races exactly once');
  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  block.raceIds=order;
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.json({ok:true});
});

// ── Day-of race MERGE ────────────────────────────────────────────────────────
// Two small divisions line up and START together as one pack, but stay SEPARATE
// race objects so each is still scored WITHIN ITS OWN DIVISION (winner of each
// gets the full 30 pts). The merge is purely a running/display link — the
// scoring engine (standings.js buckets by groupId|division) is untouched.
// A merge is only allowed between two same-distance, same-stage division races.
function raceCanMerge(race) {
  if (!race) return false;
  if (race.isRelayRace || race.isTimeTrial || race.isAdditionalRace || race.isSkateabilityRace) return false;
  return true;
}
function describeRaceForMerge(meet, race) {
  return [race?.groupLabel || 'Division', race?.distanceLabel || '', raceDisplayStage(race)].filter(Boolean).join(' ');
}
// Returns { ok, reason } — the guardrails that keep a merge sane.
function validateRaceMerge(a, b) {
  if (!a || !b) return { ok: false, reason: 'One or both races were not found.' };
  if (String(a.id) === String(b.id)) return { ok: false, reason: 'Pick two different races.' };
  if (!raceCanMerge(a) || !raceCanMerge(b)) return { ok: false, reason: 'Relays, time trials, and additional races can\'t be merged.' };
  if (a.mergeGroupId || b.mergeGroupId) return { ok: false, reason: 'One of those races is already merged — unmerge it first.' };
  const stageA = (a.stage === 'final' || a.isFinal) ? 'final' : String(a.stage || '');
  const stageB = (b.stage === 'final' || b.isFinal) ? 'final' : String(b.stage || '');
  if (stageA !== stageB) return { ok: false, reason: 'Both races must be at the same stage (e.g. both Finals).' };
  if (String(a.distanceLabel || '') !== String(b.distanceLabel || ''))
    return { ok: false, reason: 'Both races must be the same distance — they start together.' };
  return { ok: true };
}

router.post('/api/meet/:meetId/blocks/merge-races', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const idA=String(req.body.raceIdA||''), idB=String(req.body.raceIdB||'');
  const raceById=new Map((meet.races||[]).map(r=>[String(r.id),r]));
  const a=raceById.get(idA), b=raceById.get(idB);
  const check=validateRaceMerge(a,b);
  if(!check.ok) return res.status(400).json({ok:false,error:check.reason});
  // Lead = whichever runs first in its block, so the combined line stays in place.
  const block=(meet.blocks||[]).find(bl=>(bl.raceIds||[]).map(String).includes(idA) && (bl.raceIds||[]).map(String).includes(idB));
  let lead=a, follow=b;
  if(block){
    const ids=block.raceIds.map(String);
    if(ids.indexOf(idB) < ids.indexOf(idA)){ lead=b; follow=a; }
  }
  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  const groupId='mrg_'+crypto.randomBytes(4).toString('hex');
  lead.mergeGroupId=groupId; lead.mergeLead=true;
  follow.mergeGroupId=groupId; follow.mergeLead=false;
  // Tuck the follower directly after the lead so they read as one combined line.
  if(block){
    const ids=block.raceIds.map(String).filter(x=>x!==String(follow.id));
    const at=ids.indexOf(String(lead.id));
    ids.splice(at+1,0,String(follow.id));
    block.raceIds=ids;
  }
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.json({ok:true, groupId, lead:String(lead.id), label:describeRaceForMerge(meet,lead)});
});

router.post('/api/meet/:meetId/blocks/unmerge-races', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  // Accept either a race id (any member of the group) or the groupId itself.
  const raceId=String(req.body.raceId||''); const groupIdIn=String(req.body.groupId||'');
  const raceById=new Map((meet.races||[]).map(r=>[String(r.id),r]));
  const groupId=groupIdIn || (raceById.get(raceId)?.mergeGroupId||'');
  if(!groupId) return res.status(400).json({ok:false,error:'That race is not merged.'});
  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  let cleared=0;
  for(const r of meet.races||[]){ if(String(r.mergeGroupId||'')===groupId){ r.mergeGroupId=''; r.mergeLead=false; cleared++; } }
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.json({ok:true, cleared});
});


router.post('/portal/meet/:meetId/blocks/auto-flow', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');

  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  const changedBlocks = autoArrangeMeetHeatFinalFlow(meet);
  if (changedBlocks) saveDb(req.db);
  else saveDb(req.db);

  const dest = String(req.query.returnTo || '') === 'race-actions' ? 'race-actions' : 'blocks';
  res.redirect(`/portal/meet/${meet.id}/${dest}?autoFlow=${changedBlocks}`);
});

router.post('/api/meet/:meetId/blocks/move-race', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const raceId=String(req.body.raceId||'').trim();
  const destBlockId=String(req.body.destBlockId||'').trim();
  if(!raceId) return res.status(400).send('Race missing');

  // Do NOT rebuild configured races while dragging. Rebuilding here can regenerate/filter
  // race IDs and wipe an already-scheduled Additional race from a block when another
  // unassigned race is dropped into that same block. The Block Builder page is already
  // rendered from the current saved race list, so the dragged raceId should exist as-is.
  ensureAtLeastOneBlock(meet);

  const ttEvent = ensureTimeTrialEvent(meet);
  if (ttEvent && String(ttEvent.id) === raceId) {
    createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
    for (const block of meet.blocks || []) {
      block.timeTrialEventIds = (block.timeTrialEventIds || []).map(String).filter(id => id !== raceId);
    }
    if (destBlockId !== '__unassigned__') {
      const block = (meet.blocks || []).find(b => String(b.id) === destBlockId);
      if (!block) return res.status(404).send('Block not found');
      if ((block.type || 'race') !== 'race') return res.status(400).send('Cannot drop time trial events into non-race blocks');
      if (!(block.timeTrialEventIds || []).map(String).includes(raceId)) block.timeTrialEventIds.push(raceId);
    }
    meet.updatedAt = nowIso();
    saveDb(req.db);
    return res.json({ ok: true });
  }

  const race=(meet.races||[]).find(r=>String(r.id)===raceId);
  if(!race) return res.status(404).send('Race not found');

  createDesktopBackupIfActive(req.db, 'before_block_generation', meet.id);
  for(const block of meet.blocks||[]) {
    block.raceIds=(block.raceIds||[]).map(String).filter(id=>id!==raceId);
  }

  if(destBlockId!=='__unassigned__') {
    const block=(meet.blocks||[]).find(b=>String(b.id)===destBlockId);
    if(!block) return res.status(404).send('Block not found');
    if((block.type||'race')!=='race') return res.status(400).send('Cannot drop races into non-race blocks');
    block.raceIds=(block.raceIds||[]).map(String);
    if(!block.raceIds.includes(raceId)){
      // R11: optional drop-at-position — insert before beforeRaceId, else append (back-compat).
      const beforeId=String(req.body.beforeRaceId||'').trim();
      const at=beforeId?block.raceIds.indexOf(beforeId):-1;
      if(at>=0) block.raceIds.splice(at,0,raceId); else block.raceIds.push(raceId);
    }
  }

  ensureCurrentRace(meet);
  meet.updatedAt=nowIso();
  saveDb(req.db);
  res.json({ok:true});
});

// R3: bulk assignment — move many races (and/or the time-trial event) in one
// request. Mirrors /blocks/move-race semantics per id; unknown ids are skipped
// and reported so a stale client can resync instead of hard-failing.
router.post('/api/meet/:meetId/blocks/move-races', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const raceIds=Array.isArray(req.body.raceIds)?req.body.raceIds.map(String).map(s=>s.trim()).filter(Boolean):[];
  const destBlockId=String(req.body.destBlockId||'').trim();
  if(!raceIds.length) return res.status(400).send('Races missing');
  ensureAtLeastOneBlock(meet);
  let destBlock=null;
  if(destBlockId!=='__unassigned__'){
    destBlock=(meet.blocks||[]).find(b=>String(b.id)===destBlockId);
    if(!destBlock) return res.status(404).send('Block not found');
    if((destBlock.type||'race')!=='race') return res.status(400).send('Cannot drop races into non-race blocks');
  }
  const ttEvent=ensureTimeTrialEvent(meet);
  const raceById=new Map((meet.races||[]).map(r=>[String(r.id),r]));
  const known=raceIds.filter(id=>raceById.has(id)||(ttEvent&&String(ttEvent.id)===id));
  if(!known.length) return res.status(404).send('No matching races');
  createDesktopBackupIfActive(req.db,'before_block_generation',meet.id);
  for(const raceId of known){
    const isTT=ttEvent&&String(ttEvent.id)===raceId;
    for(const block of meet.blocks||[]){
      if(isTT) block.timeTrialEventIds=(block.timeTrialEventIds||[]).map(String).filter(id=>id!==raceId);
      else block.raceIds=(block.raceIds||[]).map(String).filter(id=>id!==raceId);
    }
    if(destBlock){
      if(isTT){
        destBlock.timeTrialEventIds=destBlock.timeTrialEventIds||[];
        if(!destBlock.timeTrialEventIds.map(String).includes(raceId)) destBlock.timeTrialEventIds.push(raceId);
      }else{
        destBlock.raceIds=destBlock.raceIds||[];
        if(!destBlock.raceIds.map(String).includes(raceId)) destBlock.raceIds.push(raceId);
      }
    }
  }
  ensureCurrentRace(meet);
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.json({ok:true,moved:known.length,skipped:raceIds.length-known.length});
});

// R1: Generate Schedule — builds blocks by day -> distance -> round (heats/
// semis/finals), divisions youngest to oldest, relays then quad on their own
// days (services/scheduleGenerator.js). NEVER overwrites an existing schedule
// without explicit confirmation: replace mode with any assigned races returns
// 409 {needsConfirm} unless confirmReplace===true. Append mode only places
// unassigned races into new blocks. Manual editing is untouched either way.
router.post('/api/meet/:meetId/blocks/generate-schedule', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const mode=String(req.body.mode||'replace')==='append'?'append':'replace';
  // League (MSSL house style) is the default; championship is the Nationals
  // per-distance Heats→Semis→Finals layout. Director picks — league meets DO
  // have heats, so we never auto-flip on "has heats".
  const style=String(req.body.style||'league')==='championship'?'championship':'league';
  const assignedCount=(meet.blocks||[]).reduce((n,b)=>n+((b.raceIds||[]).length)+((b.timeTrialEventIds||[]).length),0);
  if(mode==='replace'&&assignedCount>0&&req.body.confirmReplace!==true)
    return res.status(409).json({ok:false,needsConfirm:true,assignedCount});
  const {blocks,placed}=generateScheduleBlocks(meet,{mode,style});
  if(!placed) return res.status(400).send(mode==='append'?'All races are already assigned':'No races to schedule');
  createDesktopBackupIfActive(req.db,'before_block_generation',meet.id);
  if(mode==='replace') meet.blocks=blocks;
  else meet.blocks=[...(meet.blocks||[]),...blocks];
  ensureAtLeastOneBlock(meet);
  ensureCurrentRace(meet);
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.json({ok:true,mode,blocks:blocks.length,placed});
});

router.post('/portal/meet/:meetId/blocks/generate', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');

  // Generate Blocks was intentionally retired because race-day block schedules
  // need director-controlled ordering. Rebuild handles race structure only.
  return res.redirect(`/portal/meet/${meet.id}/blocks?generateDisabled=1`);
});

// ── Race Day ──────────────────────────────────────────────────────────────────




router.get('/portal/meet/:meetId/race-day/:mode', requireRole('meet_director','judge','announcer','coach'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  rebuildTimeTrialRaceSafe(meet); saveDb(req.db);
  const mode=String(req.params.mode||'director');
  const info=currentRaceInfo(meet); const current=info.current;
  const returningFromTimeTrial = String(req.query.fromTimeTrial || '') === '1';
  if (isTimeTrialItem(current) && (mode === 'judges' || mode === 'announcer') && !returningFromTimeTrial) {
    return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/time-trials/${encodeURIComponent(current.id)}?mode=${encodeURIComponent(mode)}`);
  }
  const progress = raceDayProgress(meet);
  const currentLanes=current && !isTimeTrialItem(current) ? laneRowsForRace(current,meet):[];
  const nextLanes=info.next && !isTimeTrialItem(info.next) ? laneRowsForRace(info.next,meet):[];
  // Combined pack lane sheet for DISPLAY (director/announcer). Entry stays on the
  // per-division `currentLanes`, so scoring is unaffected.
  const currentPackLanes=current && !isTimeTrialItem(current) ? mergedPackLanes(meet,current):currentLanes;
  const nextPackLanes=info.next && !isTimeTrialItem(info.next) ? mergedPackLanes(meet,info.next):nextLanes;
  const currentMerged=!!(current && !isTimeTrialItem(current) && mergeGroupMembers(meet,current));
  const currentPackLabel=current?mergePackLabel(meet,current):'—';
  const nextPackLabel=info.next?mergePackLabel(meet,info.next):'—';
  const regMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));

  let body=`<style>
    .merge-live-banner{background:#f5f3ff;border:1px solid #ddd6fe;border-left:4px solid #7c3aed;color:#5b21b6;border-radius:8px;padding:8px 12px;font-size:13px;line-height:1.35;margin-bottom:10px}
    .merge-div-tag{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#6d28d9;background:#ede9fe;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle}
  </style><div class="page-header"><h1>Race Day</h1><div class="sub">${esc(meet.meetName)}</div></div>${raceDaySubTabs(meet,mode)}`;

  // Redirect judges/announcers away from director tab
  if(mode==='director'&&!hasRole(req.user,'meet_director')&&!hasRole(req.user,'super_admin')) {
    return res.redirect(`/portal/meet/${meet.id}/race-day/${hasRole(req.user,'judge')?'judges':'announcer'}`);
  }
  if(mode==='judges'&&!hasRole(req.user,'judge')&&!hasRole(req.user,'meet_director')&&!hasRole(req.user,'super_admin')) {
    return res.redirect(`/portal/meet/${meet.id}/race-day/announcer`);
  }
  if(mode==='director') {
    const raceOptions=info.ordered.map((r,idx)=>`<option value="${r.id}" ${r.id===meet.currentRaceId?'selected':''}>${idx+1}. ${esc(raceDayItemLabel(r))}</option>`).join('');
    body+=`
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card orange"><div class="stat-label">Current Event</div><div class="stat-value">${current?esc(currentPackLabel):'—'}${currentMerged?' <span class="chip chip-purple" style="font-size:11px;vertical-align:middle">🔗 together</span>':''}</div><div class="stat-sub">${current?esc(raceDayItemSub(current)):''}</div></div>
        <div class="stat-card yellow"><div class="stat-label">In Staging</div><div class="stat-value">${info.next?esc(nextPackLabel):'—'}</div><div class="stat-sub">${info.next?esc(raceDayItemSub(info.next)):''}</div></div>
        <div class="stat-card navy"><div class="stat-label">Progress</div><div class="stat-value">${progress.completed} <span style="font-size:18px;opacity:.6">/ ${progress.total}</span></div><div class="stat-sub">${meet.raceDayPaused?'⏸ Paused':'▶ Running'}</div></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="form-grid cols-3">
          <div><label>Set Current Race</label><select onchange="setCurrentRace(this.value)">${raceOptions}</select></div>
          <div class="action-row" style="align-self:flex-end">
            <button class="btn2" onclick="moveCurrent(-1)">← Previous</button>
            <button class="btn-orange" onclick="moveCurrent(1)">Next →</button>
          </div>
          <div class="action-row" style="align-self:flex-end">
            <button class="btn2" onclick="pauseMeet()">${meet.raceDayPaused?'▶ Resume':'⏸ Pause'}</button>
            <a class="btn-sky" href="/meet/${meet.id}/tv" target="_blank">📺 TV Display</a>
            ${current&&!isTimeTrialItem(current)&&current.status==='closed'?`<button class="btn-danger" onclick="unlockRace('${current.id}')">Unlock Race</button>`:''}
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;border-left:5px solid var(--orange)">
        <div class="row between center">
          <div>
            <h2 style="margin:0">Correction Mode</h2>
            <div class="note">Fix a completed race without rewinding the meet, advancing racers, or rebuilding later races.</div>
          </div>
          <form method="GET" action="/portal/meet/${meet.id}/race-day/correction" class="action-row" style="margin:0">
            <select name="raceId" required>
              <option value="">Select completed race…</option>
              ${info.ordered.filter(r=>!isTimeTrialItem(r)&&String(r.status||'')==='closed').map((r,idx)=>`<option value="${esc(r.id)}">Race ${info.ordered.findIndex(x=>String(x.id)===String(r.id))+1} — ${esc(r.groupLabel)} — ${esc(cap(r.division))} — ${esc(r.distanceLabel)} — ${esc(raceDisplayStage(r))}</option>`).join('')}
            </select>
            <button class="btn-orange" type="submit">Open Correction</button>
          </form>
        </div>
        <div class="note" style="margin-top:10px">Judges remain locked to the live current race. Corrections are director-only in Phase 1.</div>
      </div>
      ${req.query.lanesRandomized ? `<div class="good" style="margin-bottom:16px">🎲 Lanes re-randomized for that race. Heats, race order, and blocks were not changed.</div>` : ''}
      ${req.query.error ? `<div class="bad" style="margin-bottom:16px">${esc(req.query.error)}</div>` : ''}
      <div class="card" style="margin-bottom:16px;border-left:5px solid var(--sky)">
        <div class="row between center">
          <div>
            <h2 style="margin:0">🎲 Re-Randomize Lanes</h2>
            <div class="note">Redraw lane assignments for one race only. Heats, race order, and block placement are untouched.</div>
          </div>
          <form method="POST" action="/portal/meet/${meet.id}/race-day/re-randomize-lanes" class="action-row" style="margin:0" onsubmit="return confirm('Re-randomize lanes for this race? This only changes lane numbers — heats, order, and blocks stay the same.');">
            <select name="raceId" required>
              <option value="">Select race…</option>
              ${info.ordered.filter(r=>!isTimeTrialItem(r)&&!r.isRelayRace).map((r,idx)=>`<option value="${esc(r.id)}">Race ${idx+1} — ${esc(r.groupLabel)} — ${esc(cap(r.division))} — ${esc(r.distanceLabel)} — ${esc(raceDisplayStage(r))}</option>`).join('')}
            </select>
            <button class="btn-sky" type="submit">🎲 Re-Randomize Lanes</button>
          </form>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;border-left:5px solid var(--navy)">
        <div class="row between center">
          <div>
            <h2 style="margin:0">🖨 Race Score Sheets</h2>
            <div class="note">Printable paper worksheets for judges, referees, and tabulators — blank Place/Status/Points/Notes for manual scoring.</div>
          </div>
          <form method="GET" action="/portal/meet/${meet.id}/score-sheets/print" target="_blank" class="action-row" style="margin:0">
            <select name="raceId">
              <option value="">Select race…</option>
              ${info.ordered.map((r,idx)=>`<option value="${esc(r.id)}">Race ${idx+1} — ${esc(r.groupLabel)} — ${esc(cap(r.division))} — ${esc(r.distanceLabel)} — ${esc(raceDisplayStage(r))}</option>`).join('')}
            </select>
            <input type="hidden" name="scope" value="race" />
            <button class="btn2" type="submit">Print Selected Race</button>
          </form>
        </div>
        <div class="action-row" style="margin-top:10px">
          <a class="btn2" href="/portal/meet/${meet.id}/score-sheets/print?scope=meet&amp;format=pdf" target="_blank">Print Entire Meet PDF</a>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <h2>Current Event</h2>
          ${isTimeTrialItem(current)?`
            <div class="action-row" style="margin-bottom:12px">
              <span class="chip">${esc(current.blockName||'Unassigned')}</span>
              <span class="chip chip-sky">⏱ Time Trial</span>
              <span class="chip">${esc(current.distanceLabel || '100m')}</span>
            </div>
            <p class="note">This is a standalone queue event with manual time entry and live leaderboards.</p>
            <a class="btn-orange" href="/portal/meet/${esc(meet.id)}/time-trials/${esc(current.id)}?mode=director">Open Time Trial Event</a>
          `:current?`
            <div class="action-row" style="margin-bottom:12px">
              <span class="chip">${esc(current.blockName||'Unassigned')}</span>
              <span class="chip">${esc(cap(current.division))}</span>
              <span class="chip">${esc(raceDisplayStage(current))}</span>
              <span class="chip">${esc(cap(current.startType))} Start</span>
              <span class="chip chip-${current.status==='closed'?'green':'sky'}">${esc(current.status)}</span>
              ${current.isOpenRace?`<span class="chip chip-orange">🏁 Open</span>`:''}
              ${current.isQuadRace?`<span class="chip chip-purple">🛼 Quad</span>`:''}
            </div>
            ${currentMerged?`<div class="merge-live-banner">🔗 Racing together as one pack — <b>${esc(currentPackLabel)}</b>. Each division is scored separately; enter places on each race in the judges tab.</div>`:''}
            <div class="live-lane-list">
              ${currentPackLanes.map(l=>{
                const reg=regMap.get(Number(l.registrationId));
                const result=esc(current.resultsMode==='times'?l.time:l.place);
                const statusText=l.status?esc(raceStatusLabel(l.status)):'';
                const detail=[l.helmetNumber?'#'+esc(l.helmetNumber):'',esc(l.team||'')].filter(Boolean).join(' · ');
                return `<div class="live-lane-card">
                  <div class="live-lane-number">${esc(l.lane)}</div>
                  <div class="live-lane-info">
                    <div class="live-lane-name">${esc(l.skaterName||'')}${l._div?` <span class="merge-div-tag">${esc(l._div)}</span>`:''}</div>
                    ${detail?`<div class="live-lane-detail">${detail}</div>`:''}
                    ${sponsorLineHtml(reg?.sponsor||'').replace('sponsor-line','live-lane-sponsor')}
                  </div>
                  ${statusText?`<div class="live-lane-status">${statusText}</div>`:(result?`<div class="live-lane-result">${result}</div>`:'')}
                </div>`;
              }).join('') || '<div class="muted">No skaters entered yet.</div>'}
            </div>`:
          `<div class="muted">No race selected yet.</div>`}
        </div>
        <div class="card">
          <h2>Coming Up</h2>
          <div class="queue-list">
            ${info.coming.map((r,i)=>`<div class="queue-row">
              <div class="queue-num">${info.idx+i+3}</div>
              <div class="queue-info">
                <div class="queue-title">${esc(r.groupLabel)}</div>
                <div class="queue-meta">${isTimeTrialItem(r)?'Time Trial':esc(cap(r.division))} • ${esc(r.distanceLabel)}</div>
              </div>
            </div>`).join('') || '<div class="muted">Nothing queued.</div>'}
          </div>
        </div>
      </div>
      <script>
        async function setCurrentRace(raceId){const r=await fetch('/api/meet/${meet.id}/race-day/set-current',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId})});if(r.ok) location.reload();}
        async function moveCurrent(dir){const r=await fetch('/api/meet/${meet.id}/race-day/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({direction:dir})});if(r.ok) location.reload();}
        async function pauseMeet(){const r=await fetch('/api/meet/${meet.id}/race-day/toggle-pause',{method:'POST'});if(r.ok) location.reload();}
        async function unlockRace(raceId){const r=await fetch('/api/meet/${meet.id}/race-day/unlock-race',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId})});if(r.ok) location.reload();}
      </script>`;

  } else if(mode==='judges') {
    body+=`
      <div class="card" style="margin-bottom:14px">
        <h2 style="margin:0">${current?`Race ${Math.max(info.idx+1,1)} — ${current.isTimeTrial?'Time Trial Session':esc(current.groupLabel)} — ${current.isTimeTrial?'100m':esc(cap(current.division))+' — '+esc(current.distanceLabel)}`:'No race selected'}</h2>
        <div class="note">Judges always land on the current race. Save, then close race when done.</div>
      </div>
      ${current?(isTimeTrialItem(current)?`
        <div class="card">
          <div class="action-row" style="margin-bottom:12px">
            <span class="chip">${esc(current.blockName||'Unassigned')}</span>
            <span class="chip chip-sky">⏱ Time Trial</span>
            <span class="chip">${esc(current.distanceLabel || '100m')}</span>
          </div>
          <h2 style="margin-top:0">Time Trial Event</h2>
          <p class="note">This standalone event uses the dedicated Time Trial screen for time entry, queue, and leaderboards.</p>
          <a class="btn-orange" href="/portal/meet/${esc(meet.id)}/time-trials/${esc(current.id)}?mode=judges">Open Time Trial Event</a>
        </div>
      `:current.isTimeTrial?(()=>{
        const ttEntries=timeTrialEntriesForMeet(meet);
        const waiting=ttEntries.filter(e=>!String(e.time||'').trim());
        const posted=ttEntries.filter(e=>String(e.time||'').trim()).sort((a,b)=>parseFloat(a.time||'999')-parseFloat(b.time||'999'));
        const nextUp=waiting[0];
        return `
        <div class="card" style="margin-bottom:14px">
          <div class="row between center">
            <div>
              <h2 style="margin-bottom:4px">⏱ Time Trial Session — 100m / 1 Lap</h2>
              <div class="note">One rolling queue. Click the next skater on the left, enter time, Save Time. Saved skaters leave the waiting list.</div>
            </div>
            <form method="POST" action="/portal/meet/${meet.id}/race-day/judges/save" onsubmit="return confirm('Close this Time Trial Session and advance to the next race?')">
              <input type="hidden" name="raceId" value="${esc(current.id)}" />
              <button class="btn-orange" type="submit" name="action" value="close">Close Time Trial</button>
            </form>
          </div>
        </div>

        <div class="grid-2" style="align-items:start">
          <div class="card">
            <div class="row between center" style="margin-bottom:12px">
              <div>
                <h2 style="margin:0">Waiting Queue</h2>
                <div class="note">Youngest to oldest • ${waiting.length} remaining</div>
              </div>
              ${nextUp?`<span class="chip chip-sky">Next: #${esc(nextUp.helmetNumber||'')} ${esc(nextUp.skaterName||'')}</span>`:''}
            </div>
            <div style="max-height:560px;overflow:auto;padding-right:4px">
              ${waiting.map((e,idx)=>`
                <button type="button" class="tt-queue-row" data-reg="${esc(e.registrationId)}" data-name="${esc(e.skaterName)}" data-helmet="${esc(e.helmetNumber||'')}" data-group="${esc(e.groupLabel||'')}" onclick="selectTTSkater(this)">
                  <span class="tt-queue-num">${idx+1}</span>
                  <span class="tt-queue-main"><strong>${e.helmetNumber?'#'+esc(e.helmetNumber)+' — ':''}${esc(e.skaterName||'')}</strong><small>${esc(e.groupLabel||'')} • Age ${esc(e.age||'')} • ${esc(e.team||'')}</small></span>
                </button>`).join('')||`<div class="muted">All time trial skaters have posted times.</div>`}
            </div>
          </div>

          <div>
            <div class="card" style="margin-bottom:14px">
              <form method="POST" action="/portal/meet/${meet.id}/race-day/judges/tt-post">
                <input type="hidden" name="raceId" value="${esc(current.id)}" />
                <input type="hidden" id="ttSelectedReg" name="registrationId" value="${nextUp?esc(nextUp.registrationId):''}" />
                <div class="note">Selected Skater</div>
                <div id="ttSelectedName" style="font-family:Barlow Condensed,sans-serif;font-size:34px;font-weight:900;color:var(--navy);line-height:1.05;margin:4px 0">${nextUp?`${nextUp.helmetNumber?'#'+esc(nextUp.helmetNumber)+' — ':''}${esc(nextUp.skaterName)}`:'Select a skater'}</div>
                <div id="ttSelectedMeta" class="note" style="margin-bottom:14px">${nextUp?`${esc(nextUp.groupLabel||'')} • Age ${esc(nextUp.age||'')} • ${esc(nextUp.team||'')}`:'Click a skater from the waiting queue.'}</div>
                <div class="form-grid cols-2">
                  <div>
                    <label>Time</label>
                    <input id="ttTimeInput" name="time" placeholder="ex: 11.42" required autocomplete="off" />
                  </div>
                  <div style="display:flex;align-items:end">
                    <button class="btn-orange" type="submit" name="action" value="save">Save Time</button>
                  </div>
                </div>
              </form>
            </div>

            <div class="card">
              <h2 style="margin:0 0 4px">Posted Times</h2>
              <div class="note" style="margin-bottom:12px">${posted.length} posted • sorted fastest first</div>
              <div style="overflow-x:auto;max-height:430px">
                <table class="table">
                  <thead><tr><th>Place</th><th>Helmet</th><th>Skater</th><th>Group</th><th>Time</th><th></th></tr></thead>
                  <tbody>${posted.map(e=>`<tr>
                    <td>${esc(e.place||'')}</td>
                    <td>${e.helmetNumber?'#'+esc(e.helmetNumber):''}</td>
                    <td><strong>${esc(e.skaterName||'')}</strong><div class="note">${esc(e.team||'')}</div></td>
                    <td>${esc(e.groupLabel||'')}</td>
                    <td><strong>${esc(e.time||'')}</strong></td>
                    <td>
                      <form method="POST" action="/portal/meet/${meet.id}/race-day/judges/tt-remove" onsubmit="return confirm('Remove this posted time?')">
                        <input type="hidden" name="raceId" value="${esc(current.id)}" />
                        <input type="hidden" name="registrationId" value="${esc(e.registrationId||'')}" />
                        <button class="btn-danger btn-sm" type="submit">Remove</button>
                      </form>
                    </td>
                  </tr>`).join('')||`<tr><td colspan="6" class="muted">No times posted yet.</td></tr>`}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <style>
          .tt-queue-row{width:100%;display:flex;gap:12px;align-items:center;text-align:left;background:#f8fafc;border:1px solid rgba(19,33,58,.10);border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer;color:var(--text);box-shadow:var(--shadow-sm)}
          .tt-queue-row:hover,.tt-queue-row.active{border-color:var(--sky2);background:#eef8ff}
          .tt-queue-num{width:28px;height:28px;border-radius:999px;background:#e0f2fe;color:var(--sky2);display:flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0}
          .tt-queue-main{display:flex;flex-direction:column;line-height:1.2}
          .tt-queue-main small{color:var(--muted);font-weight:600;margin-top:3px}
        </style>
        <script>
          function selectTTSkater(btn){
            document.querySelectorAll('.tt-queue-row').forEach(x=>x.classList.remove('active'));
            btn.classList.add('active');
            var reg=btn.dataset.reg||'';
            var name=btn.dataset.name||'';
            var helmet=btn.dataset.helmet||'';
            var group=btn.dataset.group||'';
            document.getElementById('ttSelectedReg').value=reg;
            document.getElementById('ttSelectedName').textContent=(helmet?'#'+helmet+' — ':'')+name;
            document.getElementById('ttSelectedMeta').textContent=group;
            var input=document.getElementById('ttTimeInput');
            if(input){ input.value=''; input.focus(); }
          }
        </script>`;
      })():renderJudgeBoard({
  meet, current, currentLanes, currentMerged, regMap, user: req.user,
  raceStatusOptionsHtml, dqMetadataFields, dqDialogHtml,
  skaterAvatarHtml, mergeGroupMembers, renderRelayEligibleSkatersHtml,
})):`<div class="card"><div class="muted">No race selected yet.</div></div>`}`;

  } else if(mode==='announcer') {
    body+=`
      <div class="announcer-view">
        <div class="announcer-deck">
          <div class="announcer-deck-card is-current"><div class="announcer-deck-label">Current Race</div><div class="announcer-deck-title">${current?esc(current.groupLabel):'—'}</div><div class="announcer-deck-meta">${current?`${esc(cap(current.division))} • ${esc(current.distanceLabel)}`:''}</div></div>
          <div class="announcer-deck-card is-next"><div class="announcer-deck-label">In Staging</div><div class="announcer-deck-title">${info.next?esc(info.next.groupLabel):'—'}</div><div class="announcer-deck-meta">${info.next?`${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}`:''}</div></div>
          <div class="announcer-deck-card is-after"><div class="announcer-deck-label">After That</div><div class="announcer-deck-title">${info.coming[0]?esc(info.coming[0].groupLabel):'—'}</div><div class="announcer-deck-meta">${info.coming[0]?`${esc(cap(info.coming[0].division))} • ${esc(info.coming[0].distanceLabel)}`:''}</div></div>
        </div>
        ${currentMerged?`<div class="merge-live-banner">🔗 One pack — ${esc(currentPackLabel)} (scored separately)</div>`:''}
        ${announcerBoxHtml(current,currentPackLanes.map(l=>{const reg=regMap.get(Number(l.registrationId));return{...l,sponsor:reg?.sponsor||''};}))}
      </div>`;
  } else {
    body+=`
      <div class="stat-grid" style="margin-bottom:16px;grid-template-columns:repeat(2,1fr)">
        <div class="stat-card orange"><div class="stat-label">Current Race</div><div class="stat-value">${current?esc(current.groupLabel):'—'}</div><div class="stat-sub">${current?`${esc(cap(current.division))} • Race ${Math.max(info.idx+1,1)} of ${info.ordered.length}`:''}</div></div>
        <div class="stat-card yellow"><div class="stat-label">In Staging</div><div class="stat-value">${info.next?esc(info.next.groupLabel):'—'}</div><div class="stat-sub">${info.next?`${esc(cap(info.next.division))} • ${esc(info.next.distanceLabel)}`:''}</div></div>
      </div>
      <div class="grid-2">
        <div class="live-board-card">
          <h2>Current Race — Lane Assignments</h2>
          ${current && !isTimeTrialItem(current) ? laneAssignmentListHtml(currentPackLanes, regMap) : `<div class="muted">${isTimeTrialItem(current)?'Time trial — no lane assignments.':'No race selected yet.'}</div>`}
        </div>
        <div class="live-board-card">
          <h2>In Staging — Lane Assignments</h2>
          ${info.next && !isTimeTrialItem(info.next) ? laneAssignmentListHtml(nextPackLanes, regMap) : `<div class="muted">${info.next&&isTimeTrialItem(info.next)?'Time trial — no lane assignments.':'Nothing staged yet.'}</div>`}
        </div>
      </div>`;
  }
  res.send(pageShell({title:'Race Day',user:req.user,meet,activeTab:'race-day', bodyHtml:body}));
});


router.get('/portal/meet/:meetId/race-day/correction', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send(pageShell({title:'Forbidden',user:req.user,bodyHtml:`<div class="page-header"><h1>Forbidden</h1></div><div class="card"><div class="danger">Only the meet owner can correct race results.</div></div>`}));

  const ordered=orderedRaces(meet);
  const closed=ordered.filter(r=>String(r.status||'')==='closed');
  const raceId=String(req.query.raceId||'');
  const race=closed.find(r=>String(r.id)===raceId);
  const regMap=new Map((meet.registrations||[]).map(r=>[Number(r.id),r]));

  if(race) {
    return res.send(pageShell({
      title:'Race Correction',
      user:req.user,
      meet,
      activeTab:'race-day',
      bodyHtml:renderCorrectionRaceForm(meet,race,regMap,req.user,req.query.error||'',req.query.ok||''),
    }));
  }

  const options=closed.map(r=>`<option value="${esc(r.id)}">${esc(correctionRaceLabel(meet,r))}</option>`).join('');
  return res.send(pageShell({title:'Race Correction',user:req.user,meet,activeTab:'race-day',bodyHtml:`
    <div class="page-header"><h1>Race Correction</h1><div class="sub">${esc(meet.meetName)}</div></div>
    ${raceDaySubTabs(meet,'director')}
    <div class="action-row" style="margin-bottom:14px"><a class="btn2" href="/portal/meet/${esc(meet.id)}/race-day/director">← Back to Race Day</a></div>
    <div class="card" style="border-left:5px solid var(--orange)">
      <h2>Open Completed Race Correction</h2>
      <div class="note" style="margin-bottom:12px">This does not change the current race and will not rebuild later races.</div>
      ${closed.length ? `<form method="GET" action="/portal/meet/${esc(meet.id)}/race-day/correction" class="form-grid cols-2"><div><label>Completed Race</label><select name="raceId" required><option value="">Select race…</option>${options}</select></div><div class="action-row" style="align-self:flex-end"><button class="btn-orange" type="submit">Open Correction</button></div></form>` : `<div class="muted">No completed races are available for correction yet.</div>`}
    </div>`}));
});

router.post('/portal/meet/:meetId/race-day/correction/save', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send(pageShell({title:'Forbidden',user:req.user,bodyHtml:`<div class="page-header"><h1>Forbidden</h1></div><div class="card"><div class="danger">Only the meet owner can correct race results.</div></div>`}));

  const race=(meet.races||[]).find(r=>String(r.id)===String(req.body.raceId||''));
  if(!race) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race-day/correction?error=${encodeURIComponent('Race not found.')}`);
  if(String(race.status||'')!=='closed') return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race-day/correction?error=${encodeURIComponent('Only completed/closed races can be corrected from Correction Mode.')}`);

  const reason=correctionAuditReason(req.body.reason);
  if(!reason) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race-day/correction?raceId=${encodeURIComponent(race.id)}&error=${encodeURIComponent('Correction reason is required.')}`);

  const statusProblems = invalidLaneStatusFields(req.body);
  if (sendIfInvalid(req, res, statusProblems, `/portal/meet/${encodeURIComponent(meet.id)}/race-day/correction?raceId=${encodeURIComponent(race.id)}`)) return;

  const before=raceCorrectionSnapshot(race);
  applyRaceCorrectionFromBody(meet,race,req.body||{},req.user);
  const after=raceCorrectionSnapshot(race);
  recordRaceCorrection(meet,race,req.user,before,after,reason);

  // Important race-day integrity rule:
  // Correction Mode updates this race only. It must not call heat advancement,
  // must not set currentRaceId, and must not rebuild any later race entries.
  meet.updatedAt=nowIso();
  saveDb(req.db);

  return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race-day/correction?raceId=${encodeURIComponent(race.id)}&ok=${encodeURIComponent('Race correction saved. Later races were not rebuilt and current race was not changed.')}`);
});

router.post('/portal/meet/:meetId/race-day/judges/save', requireRole('judge','meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canJudgeMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const wantsJson = String(req.get('accept') || '').includes('application/json') || String(req.body.ajax || '') === '1';
  const judgeUrl = `/portal/meet/${meet.id}/race-day/judges`;
  const race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||''));
  if(!race) return wantsJson ? res.status(404).json({ ok:false, error:'Race not found' }) : res.redirect(judgeUrl);

  const statusProblems = invalidLaneStatusFields(req.body);
  if (sendIfInvalid(req, res, statusProblems, judgeUrl)) return;

  // Time Trials use the dedicated tt-post / tt-remove flow.
  // Never rebuild laneEntries here, or one saved TT result can wipe earlier posted times.
  if(race.isTimeTrial) {
    race.resultsMode = 'times';
    race.status = req.body.action === 'close' ? 'closed' : 'open';
    if(req.body.action === 'close') {
      race.closedAt = nowIso();
      race.isFinal = true;
      const info=currentRaceInfo(meet);
      if(info.current&&info.current.id===race.id) {
        const next=info.ordered[info.idx+1];
        if(next){meet.currentRaceId=next.id;meet.currentRaceIndex=info.idx+1;}
      }
    }
    meet.updatedAt=nowIso();
    saveDb(req.db);
    return wantsJson ? res.json({ ok:true, action:req.body.action||'save', raceId:race.id }) : res.redirect(judgeUrl);
  }

  const existingLaneEntries = Array.isArray(race.laneEntries) ? [...race.laneEntries] : [];
  const laneCount=(race.isOpenRace||isOpenDivision(race.division)||race.isRelayRace)?Math.max(existingLaneEntries.length,1):Math.max(existingLaneEntries.length,Number(meet.lanes)||4,1);
  race.laneEntries=[];
  for(let i=1;i<=laneCount;i++) {
    const existing=existingLaneEntries.find(x=>Number(x.lane)===i)||{};
    race.laneEntries.push(laneResultFromBody(existing, i, req.body, req.user));
  }
  race.resultsMode=String(req.body.resultsMode||'places')==='times'?'times':'places';
  race.notes=String(req.body.notes||''); race.status=req.body.action==='close'?'closed':'open';
  race.closedAt=req.body.action==='close'?nowIso():race.closedAt;

  // Heat/semi advancement. 2-heat fields: top 3 each → final (unchanged). USARS
  // meets with 3-4 heats: heats → 2 semis → final per SR505.4 (semis created
  // lazily). Semis closing seeds the final. Non-USARS meets keep the 2-heat MVP.
  // Relays (2- & 4-person) use the parallel place-based relay engine; 3-person
  // relays advance by times (SR505.9) and are left manual for now.
  if(req.body.action==='close') {
    if(race.isRelayRace) advanceRelayProgression(meet, race);
    else advanceRaceProgression(meet, race);
  }

  meet.updatedAt=nowIso();
  if(req.body.action==='close') {
    const info=currentRaceInfo(meet);
    if(info.current&&info.current.id===race.id) { const next=info.ordered[info.idx+1]; if(next){meet.currentRaceId=next.id;meet.currentRaceIndex=info.idx+1;} }
  }
  saveDb(req.db);
  return wantsJson ? res.json({ ok:true, action:req.body.action||'save', raceId:race.id, status:race.status }) : res.redirect(judgeUrl);
});

router.post('/portal/meet/:meetId/race-day/judges/tt-post', requireRole('judge','meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canJudgeMeet(req.user,meet)) return res.status(403).send('Forbidden');
  let race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||'')&&r.isTimeTrial) || timeTrialRaceForMeet(meet);
  if(!race) race = rebuildTimeTrialRaceSafe(meet);
  if(!race) return res.redirect(`/portal/meet/${req.params.meetId}/race-day/judges`);

  const time=String(req.body.time||'').trim();
  const regId=String(req.body.registrationId||'').trim();
  if(!time || !regId) return res.redirect(`/portal/meet/${meet.id}/race-day/judges`);

  const reg=(meet.registrations||[]).find(r=>String(r.id)===regId);
  const skaterName=String(reg?.name || req.body.skaterName || '').trim();
  const helmetNumber=String(reg?.helmetNumber || req.body.helmetNumber || '').trim();
  const team=String(reg?.team || req.body.team || '').trim();

  // Preserve all previous TT results and only replace this skater's posted time.
  const previousEntries = Array.isArray(race.laneEntries) ? race.laneEntries : [];
  race.laneEntries = previousEntries.filter(e=>String(e.registrationId||'')!==regId);

  const previousOrder = previousEntries.find(e=>String(e.registrationId||'')===regId)?.lane;
  const nextLane = previousOrder || (race.laneEntries.length + 1);

  race.laneEntries.push({
    lane: nextLane,
    registrationId: regId,
    helmetNumber,
    skaterName,
    team,
    time,
    place: '',
    status: ''
  });

  // Keep posting order stable, then assign places by fastest time.
  race.laneEntries = race.laneEntries
    .sort((a,b)=>Number(a.lane||999)-Number(b.lane||999))
    .map((entry,idx)=>({...entry,lane:idx+1}));

  const sorted=[...race.laneEntries].sort((a,b)=>parseFloat(a.time||'999')-parseFloat(b.time||'999'));
  sorted.forEach((e,i)=>{
    const orig=race.laneEntries.find(x=>String(x.registrationId||'')===String(e.registrationId||''));
    if(orig) orig.place=String(i+1);
  });

  race.resultsMode='times';
  race.distanceLabel='100m';
  race.countsForOverall=false;

  if(req.body.action==='close') {
    race.status='closed';
    race.closedAt=nowIso();
    race.isFinal=true;
  }

  meet.updatedAt=nowIso();
  saveDb(req.db);

  if(regId) {
    const entry=race.laneEntries.find(e=>String(e.registrationId||'')===regId);
    if(entry) fireResultAlerts(meet, race);
  }

  res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
});

router.post('/portal/meet/:meetId/race-day/judges/tt-remove', requireRole('judge','meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canJudgeMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||'')&&r.isTimeTrial) || timeTrialRaceForMeet(meet);
  if(!race) return res.redirect(`/portal/meet/${req.params.meetId}/race-day/judges`);
  const regId=String(req.body.registrationId||'');
  race.laneEntries=(race.laneEntries||[]).filter(e=>String(e.registrationId||'')!==regId);
  // Re-number lanes and re-assign places
  race.laneEntries.forEach((e,i)=>e.lane=i+1);
  const sorted=[...race.laneEntries].sort((a,b)=>parseFloat(a.time||'999')-parseFloat(b.time||'999'));
  sorted.forEach((e,i)=>{ const orig=race.laneEntries.find(x=>x.lane===e.lane); if(orig) orig.place=String(i+1); });
  meet.updatedAt=nowIso(); saveDb(req.db);
  res.redirect(`/portal/meet/${meet.id}/race-day/judges`);
});

router.post('/api/meet/:meetId/race-day/set-current', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const ordered=orderedRaces(meet); const idx=ordered.findIndex(r=>r.id===String(req.body.raceId||''));
  if(idx<0) return res.status(404).send('Race not found');
  meet.currentRaceId=ordered[idx].id; meet.currentRaceIndex=idx; meet.updatedAt=nowIso(); saveDb(req.db); res.json({ok:true});
});

router.post('/api/meet/:meetId/race-day/step', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const info=currentRaceInfo(meet); const dir=Number(req.body.direction||1);
  const idx=Math.max(0,Math.min(info.ordered.length-1,info.idx+(dir>=0?1:-1)));
  if(info.ordered[idx]){meet.currentRaceId=info.ordered[idx].id;meet.currentRaceIndex=idx;}
  meet.updatedAt=nowIso(); saveDb(req.db);
  fireRaceAlerts(meet, idx, info.ordered);
  res.json({ok:true});
});

router.post('/api/meet/:meetId/race-day/toggle-pause', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  if (meet.raceDayPaused) createDesktopBackupIfActive(req.db, 'before_meet_start', meet.id);
  meet.raceDayPaused=!meet.raceDayPaused; saveDb(req.db); res.json({ok:true});
});

router.post('/api/meet/:meetId/race-day/unlock-race', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.status(403).send('Forbidden');
  const race=(meet.races||[]).find(r=>r.id===String(req.body.raceId||''));
  if(!race) return res.status(404).send('Race not found');
  race.status='open'; race.closedAt='';
  // Unlocking a race should not rewind the live race pointer. Use Set Current Race
  // deliberately if the director is truly moving race-day operations.
  meet.updatedAt=nowIso();
  saveDb(req.db); res.json({ok:true});
});

router.post('/portal/meet/:meetId/race-day/re-randomize-lanes', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  if(!canEditMeet(req.user,meet)) return res.status(403).send(pageShell({title:'Forbidden',user:req.user,bodyHtml:`<div class="page-header"><h1>Forbidden</h1></div><div class="card"><div class="danger">Only the meet owner can re-randomize lanes.</div></div>`}));
  const raceId=String(req.body.raceId||'');
  // Only shuffles laneEntries for this one race — does not rebuild heats,
  // change race order, move races between blocks, or touch scheduling.
  const result=reRandomizeRaceLanes(meet,raceId);
  if(!result.ok) return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race-day/director?error=${encodeURIComponent(result.error)}`);
  saveDb(req.db);
  return res.redirect(`/portal/meet/${encodeURIComponent(meet.id)}/race-day/director?lanesRandomized=${encodeURIComponent(raceId)}`);
});

// ── Results ───────────────────────────────────────────────────────────────────

router.get('/portal/meet/:meetId/results', requireRole('meet_director','judge','coach'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet) return res.redirect('/portal');
  const sections=computeMeetStandings(meet);
  const openSections=computeOpenResults(meet);
  const quadSections=computeQuadStandings(meet);
  const ttEvents=completedTimeTrialEvents(meet);
  const ttResultsHtml=renderTimeTrialFinalResultsHtml(ttEvents);
  const okMsg = req.query.ok ? String(req.query.ok) : '';
  const errorMsg = req.query.error ? String(req.query.error) : '';
  const canManageResults = hasRole(req.user,'super_admin') || canEditMeet(req.user,meet);
  const canViewOfficialReport = canManageResults || hasRole(req.user,'judge');

  // Champions board: every scored division's winner as a jump-link card, so a
  // 50-division meet is scannable at a glance instead of one endless scroll.
  const helmetForRow = (row) => {
    const reg = (meet.registrations||[]).find(r => Number(r.id) === Number(row.registrationId));
    if (!reg) return '';
    const h = reg.helmetNumber===''||reg.helmetNumber==null ? (reg.meetNumber||'') : reg.helmetNumber;
    return h===''||h==null ? '' : String(h);
  };
  const capd = s => { s=String(s||''); return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; };
  const champCard = (s, anchor, icon) => {
    const w = s.standings && s.standings[0];
    if (!w) return '';
    const h = helmetForRow(w);
    const divName = `${s.groupLabel}${s.division && s.division!=='quad' ? ' · '+capd(s.division) : ''}`;
    return `<a class="rb-champ" href="#${anchor}" data-division="${esc((s.groupLabel+' '+s.division).toLowerCase())}">`
      + `<span class="rb-champ-medal">${icon}</span>`
      + `<span class="rb-champ-body"><span class="rb-champ-div">${esc(divName)}</span>`
      + `<span class="rb-champ-name">${h?('#'+esc(h)+' '):''}${esc(w.skaterName||'—')}</span>`
      + `<span class="rb-champ-meta">${esc(w.team||'')}${w.team?' · ':''}${Number(w.totalPoints||0)} pts</span></span></a>`;
  };
  const champCards = [
    ...sections.map((s,i)=>champCard(s,`sec-i${i}`,'🥇')),
    ...quadSections.map((s,i)=>champCard(s,`sec-q${i}`,'🛼')),
  ].filter(Boolean);
  const champBoardHtml = champCards.length ? `
    <div class="card rb-results-toolbar">
      <div class="row between center" style="flex-wrap:wrap;gap:12px;margin-bottom:14px">
        <div><h2 style="margin:0">🏆 Champions</h2><div class="note">${champCards.length} division${champCards.length===1?'':'s'} scored — tap a champion to jump to full standings</div></div>
        <div class="action-row" style="flex-wrap:wrap;gap:8px">
          <input id="resultsFilter" type="search" placeholder="Filter divisions…" aria-label="Filter divisions" autocomplete="off">
          <button class="btn2 btn-sm" type="button" onclick="resultsExpandAll(true)">Expand all</button>
          <button class="btn2 btn-sm" type="button" onclick="resultsExpandAll(false)">Collapse all</button>
        </div>
      </div>
      <div class="rb-champ-grid">${champCards.join('')}</div>
    </div>` : '';

  res.send(pageShell({title:'Results',user:req.user,meet,activeTab:'results', bodyHtml:`
    <style>
      .rb-champ-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;}
      .rb-champ{display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--border,rgba(15,31,61,.12));border-radius:12px;background:var(--card,#fff);text-decoration:none;color:inherit;transition:border-color .15s ease,transform .15s ease;}
      .rb-champ:hover{border-color:var(--orange,#f97316);transform:translateY(-1px);}
      .rb-champ-medal{font-size:22px;line-height:1;}
      .rb-champ-body{display:flex;flex-direction:column;min-width:0;}
      .rb-champ-div{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#64748b);}
      .rb-champ-name{font-weight:800;color:var(--navy,#0f1f3d);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .rb-champ-meta{font-size:12px;color:var(--muted,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #resultsFilter{padding:9px 12px;border:1px solid var(--border2,#cbd5e1);border-radius:8px;min-width:190px;font-size:14px;}
      details.result-section{scroll-margin-top:14px;}
    </style>
    <div class="page-header"><h1>Results</h1><div class="sub">${esc(meet.meetName)}</div></div>
    ${okMsg ? `<div class="good" style="margin-bottom:16px">${esc(okMsg)}</div>` : ''}
    ${errorMsg ? `<div class="bad" style="margin-bottom:16px">${esc(errorMsg)}</div>` : ''}
    <div class="card" style="margin-bottom:16px">
      <div class="row between center">
        <div class="action-row">
          <span class="chip chip-${meet.status==='complete'?'green':meet.status==='live'?'orange':'sky'}">${esc(meet.status||'draft')}</span>
          ${meet.lastSslResultsSentAt ? `<span class="chip chip-green">Sent to SSL</span>` : ''}
        </div>
        <div class="action-row">
          ${canManageResults ? (meet.status==='complete'?`<form method="POST" action="/portal/meet/${meet.id}/reopen"><button class="btn2" type="submit">Reopen Meet</button></form><a class="btn2" href="/portal/meet/${meet.id}/clone-confirm">Clone Setup</a><a class="btn-orange" href="/portal/meet/${meet.id}/archive-confirm">Archive Meet</a>`:meet.status==='archived'?`<form method="POST" action="/portal/meet/${meet.id}/unarchive"><button class="btn2" type="submit">Unarchive Meet</button></form>`:`<form method="POST" action="/portal/meet/${meet.id}/finalize"><button class="btn-orange" type="submit">Finalize Meet</button></form>`):''}
          ${canManageResults ? `<form method="POST" action="/portal/meet/${meet.id}/results/send-to-ssl" onsubmit="return confirm('Send official results from this SSM meet to SSL career profiles?');"><button class="btn2" type="submit">Send Results to SSL</button></form>` : ''}
          ${canViewOfficialReport ? `<a class="btn2" href="/portal/meet/${meet.id}/results/dq-report" target="_blank">Print Officials DQ Report</a>` : ''}
          <a class="btn2" href="/portal/meet/${meet.id}/results/print" target="_blank">Print Final Results</a>
        </div>
      </div>
      ${meet.lastSslResultsSentAt ? `<div class="note" style="margin-top:10px">Last sent to SSL: ${esc(new Date(meet.lastSslResultsSentAt).toLocaleString())}</div>` : ''}
    </div>
    ${champBoardHtml}
    ${sections.length?`<h2 style="margin:18px 0 10px">Inline Standings</h2>`:''}
    ${sections.map((s,i)=>resultsSectionHtml(s,meet,{collapsed:true,anchorId:`sec-i${i}`})).join('<div class="spacer"></div>') || (!ttResultsHtml ? `<div class="card"><div class="muted">No inline standings yet.</div></div>` : '')}
    ${openSections.length?`
      <div class="spacer"></div>
      <h2 style="color:var(--orange)">🏁 Open Race Results</h2>
      ${openSections.map(s=>`
        <div class="card" data-division="${esc((s.race.groupLabel+' open').toLowerCase())}" style="border-left:4px solid var(--orange);margin-bottom:14px">
          <div class="row between" style="margin-bottom:12px">
            <div><h2 style="margin:0">${esc(s.race.groupLabel)} — Open</h2><div class="note">${esc(s.race.distanceLabel)} • Rolling Start</div></div>
            ${s.rows[0]?`<div class="chip chip-orange">🏁 ${esc(s.rows[0].skaterName)}</div>`:''}
          </div>
          <table class="table">
            <thead><tr><th>Place</th><th>Skater</th><th>Team</th></tr></thead>
            <tbody>${s.rows.map(r=>`<tr><td><strong>${esc(r.place)}</strong></td><td>${esc(r.skaterName||'')}${sponsorLineHtml((meet.registrations||[]).find(reg=>Number(reg.id)===Number(r.registrationId))?.sponsor||'')}</td><td>${esc(r.team||'')}</td></tr>`).join('')||`<tr><td colspan="3" class="muted">No results yet.</td></tr>`}</tbody>
          </table>
        </div>`).join('')}`:``}
    ${quadSections.length?`
      <div class="spacer"></div>
      <h2 style="color:var(--purple)">🛼 Quad Results</h2>
      ${quadSections.map((s,i)=>quadResultsSectionHtml(s,meet,{collapsed:true,anchorId:`sec-q${i}`})).join('<div class="spacer"></div>')}`:``}
    ${raceStatusResultsHtml(meet)}
    ${ttResultsHtml}
    <script>
    (function(){
      var box=document.getElementById('resultsFilter');
      function apply(){
        var q=(box.value||'').trim().toLowerCase();
        document.querySelectorAll('[data-division]').forEach(function(el){
          el.style.display=(!q||el.getAttribute('data-division').indexOf(q)!==-1)?'':'none';
        });
      }
      if(box) box.addEventListener('input',apply);
      window.resultsExpandAll=function(o){
        document.querySelectorAll('details.result-section').forEach(function(d){ d.open=o; });
      };
    })();
    </script>`}));
});

router.post('/portal/meet/:meetId/finalize', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  meet.status='complete'; meet.updatedAt=nowIso(); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/results`);
});

router.post('/portal/meet/:meetId/reopen', requireRole('meet_director'), (req, res) => {
  const meet=getMeetOr404(req.db,req.params.meetId);
  if(!meet||!canEditMeet(req.user,meet)) return res.redirect('/portal');
  meet.status='live'; meet.updatedAt=nowIso(); saveDb(req.db); res.redirect(`/portal/meet/${meet.id}/results`);
});

  return router;
};
