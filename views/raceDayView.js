const { esc, cap } = require('../utils/html');
const { raceDisplayStage } = require('../services/raceDay');

// ── Tabulator (judges) race board ────────────────────────────────────────────
// Renders the results-entry panel for a normal (non time-trial) race.
//
// Everything the existing route relied on is preserved verbatim:
//   form id  judgeRaceForm  → POST /portal/meet/:id/race-day/judges/save
//   fields   raceId, resultsMode, skaterName_{lane}, team_{lane}, place_{lane},
//            time_{lane}, record_{lane}, status_{lane} + dqMetadataFields hidden
//            inputs, notes, action=save|close
//   classes  .race-status-select[data-lane]  (bound by #dqDetailsDialog)
//            .dq-edit-button                 (rendered by dqMetadataFields)
//            #judgeSaveToast                 (async save confirmation)
//
// The only additions are presentational plus one optional client-side helper:
// a finish-order tray that writes into the existing place_{lane} inputs.
//
// Callers pass the helpers that live in routes/raceDayRoutes.js so this module
// stays free of route-local dependencies.
function renderJudgeBoard({
  meet,
  current,
  currentLanes = [],
  currentMerged = false,
  regMap = new Map(),
  user,
  raceStatusOptionsHtml,
  dqMetadataFields,
  dqDialogHtml,
  skaterAvatarHtml,
  mergeGroupMembers,
  renderRelayEligibleSkatersHtml,
}) {
  if (!current) {
    return `<div class="card"><div class="muted">No race selected yet.</div></div>`;
  }

  const isRelay = !!current.isRelayRace;
  const kind = isRelay ? 'RELAY'
    : String(current.stage || '') === 'final' ? 'FINAL'
    : 'QUALIFYING';

  const mergePartners = currentMerged
    ? (mergeGroupMembers(meet, current) || [])
        .filter(m => String(m.id) !== String(current.id))
        .map(m => m.groupLabel)
        .join(', ')
    : '';

  const mergeBanner = currentMerged ? `
    <div class="rd-merge">
      <div class="rd-merge-kicker">🔗 Merged pack</div>
      <div>This race starts together as one pack with <strong>${esc(mergePartners)}</strong>.
      Enter places for <strong>${esc(current.groupLabel)}</strong> only — each division is scored
      separately. The full pack lane sheet is on the Director and Announcer tabs.</div>
    </div>` : '';

  // Finish-order tray: one chip per lane that has an entry. A relay places TEAMS,
  // so the chip leads with the lane number and names the team — a helmet number
  // and a first name mean nothing when four skaters share the entry.
  const trayChips = currentLanes.filter(l => l.skaterName).map(l => `
    <button type="button" class="rd-chip" data-lane="${esc(l.lane)}">
      <span class="rd-chip-ord"></span>
      <span class="rd-chip-helmet">${isRelay ? esc(l.lane) : esc(l.helmetNumber || '—')}</span>
      <span class="rd-chip-name">${isRelay ? esc(l.team || l.skaterName) : esc(String(l.skaterName).split(' ')[0])}</span>
    </button>`).join('');

  const laneRows = currentLanes.map(l => {
    const reg = regMap.get(Number(l.registrationId));
    return `
      <div class="rd-row" data-lane="${esc(l.lane)}">
        <div class="rd-lane">${esc(l.lane)}</div>
        <div class="rd-helmet">${isRelay ? '<span class="rd-relay-dash">—</span>' : esc(l.helmetNumber || '—')}</div>
        <div class="rd-skater">
          ${!isRelay && skaterAvatarHtml ? skaterAvatarHtml(l, reg, 'small') : ''}
          <div class="rd-skater-fields">
            <input name="skaterName_${esc(l.lane)}" value="${esc(l.skaterName)}" autocomplete="off" placeholder="${isRelay ? 'Relay team' : ''}" />
            ${reg?.sponsor ? `<div class="rd-sponsor">Sponsor: ${esc(reg.sponsor)}</div>` : ''}
          </div>
        </div>
        <div><input name="team_${esc(l.lane)}" value="${esc(l.team)}" autocomplete="off" placeholder="${isRelay ? 'Club' : ''}" /></div>
        <div><input class="rd-place" name="place_${esc(l.lane)}" value="${esc(l.place)}" inputmode="numeric" autocomplete="off" /></div>
        <div><input class="rd-time" name="time_${esc(l.lane)}" value="${esc(l.time)}" inputmode="decimal" placeholder="—" autocomplete="off" /></div>
        <div class="rd-rec">
          <label class="rd-rec-box" title="New record set in this race">
            <input type="checkbox" name="record_${esc(l.lane)}" ${l.record ? 'checked' : ''} />
            <span>🏅</span>
          </label>
        </div>
        <div class="rd-status">
          <select class="race-status-select" data-lane="${esc(l.lane)}" name="status_${esc(l.lane)}">${raceStatusOptionsHtml(l.status)}</select>
          ${dqMetadataFields(l, l.lane)}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="rd-board">
      <div class="rd-head">
        <div class="rd-head-tags">
          <span class="rd-live"><i></i>ON TRACK NOW</span>
          <span class="rd-kind rd-kind-${kind.toLowerCase()}">${kind}</span>
          <span class="rd-block">${esc(current.blockName || 'Unassigned')} · ${currentLanes.length} lanes</span>
        </div>
        <div class="rd-title">${esc(current.groupLabel)} · ${esc(current.distanceLabel)}</div>
        <div class="rd-stage">${esc(raceDisplayStage(current))} · ${esc(cap(current.division))}</div>
      </div>

      ${mergeBanner}

      <form id="judgeRaceForm" method="POST" action="/portal/meet/${esc(meet.id)}/race-day/judges/save">
        <input type="hidden" name="raceId" value="${esc(current.id)}" />

        <div class="rd-mode">
          <span class="rd-mode-label">Results mode</span>
          <label class="rd-mode-btn"><input type="radio" name="resultsMode" value="places" ${current.resultsMode !== 'times' ? 'checked' : ''} /><span>Places</span></label>
          <label class="rd-mode-btn"><input type="radio" name="resultsMode" value="times" ${current.resultsMode === 'times' ? 'checked' : ''} /><span>Times</span></label>
          <span class="rd-mode-note"></span>
        </div>

        ${trayChips ? `
        <div class="rd-tray-wrap">
          <div class="rd-tray-head">
            <span class="rd-tray-title">${isRelay ? 'Tap teams in finish order' : 'Tap in finish order'}</span>
            <span class="rd-tray-count" id="rdTrayCount"></span>
            <button type="button" class="rd-tray-clear" id="rdTrayClear">Clear order</button>
          </div>
          <div class="rd-tray">${trayChips}</div>
        </div>` : ''}

        <div class="rd-table">
          <div class="rd-thead">
            <div>Lane</div><div>${isRelay ? '' : 'Helm'}</div><div>${isRelay ? 'Relay team' : 'Skater'}</div><div>${isRelay ? 'Club' : 'Team'}</div>
            <div>Place</div><div>Time</div><div>Rec</div><div>Status / DQ</div>
          </div>
          ${laneRows}
        </div>

        <div class="rd-notes">
          <label for="rdNotes">Race notes</label>
          <textarea id="rdNotes" name="notes" rows="2" placeholder="Optional">${esc(current.notes || '')}</textarea>
        </div>

        <div class="rd-actions">
          <span class="rd-actions-note">${isRelay ? 'Relays place by team — one row per team entry. Legs are listed below for reference. ' : ''}Save posts in place and does not advance the meet. Close Race does.</span>
          <button class="rd-btn rd-btn-save" type="submit" name="action" value="save">Save</button>
          <button class="rd-btn rd-btn-close" type="submit" name="action" value="close">Close race &amp; advance →</button>
        </div>
      </form>
    </div>

    ${dqDialogHtml(user)}
    <div id="judgeSaveToast" class="judge-save-toast" role="status" aria-live="polite">✓ Race Saved</div>

    <style>
      .rd-board{
        background:linear-gradient(160deg,#0d1830 0%,#13213a 55%,#16294a 100%);
        border-radius:26px; padding:22px 24px 24px; margin-bottom:16px;
        box-shadow:0 16px 44px rgba(13,24,48,.28); color:#fff;
      }
      .rd-head{padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.10);margin-bottom:16px;}
      .rd-head-tags{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:9px;}
      .rd-live{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;
        background:#F97316;color:#fff;font-size:11px;font-weight:800;letter-spacing:.08em;}
      .rd-live i{width:7px;height:7px;border-radius:50%;background:#fff;display:block;}
      .rd-kind{display:inline-flex;padding:4px 9px;border-radius:6px;font-size:10px;font-weight:800;letter-spacing:.1em;}
      .rd-kind-final{background:rgba(16,185,129,.18);color:#6EE7B7;}
      .rd-kind-qualifying{background:rgba(56,189,248,.18);color:#7DD3FC;}
      .rd-kind-relay{background:rgba(249,115,22,.18);color:#FDBA74;}
      .rd-block{font-size:12px;font-weight:700;color:rgba(255,255,255,.68);}
      .rd-title{font-size:38px;font-weight:800;letter-spacing:-.035em;line-height:1.05;}
      .rd-stage{font-size:16px;font-weight:700;color:#38BDF8;margin-top:5px;}

      .rd-merge{background:#f5f3ff;border:1px solid #ddd6fe;border-left:4px solid #7c3aed;
        color:#5b21b6;border-radius:12px;padding:13px 15px;font-size:13px;line-height:1.5;
        font-weight:600;margin-bottom:16px;}
      .rd-merge-kicker{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
        color:#6d28d9;margin-bottom:5px;}

      .rd-mode{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
      .rd-mode-label{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.68);}
      .rd-mode-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;
        padding:0 20px;border-radius:11px;cursor:pointer;margin:0;
        background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.18);}
      .rd-mode-btn input{position:absolute;opacity:0;width:0;height:0;}
      .rd-mode-btn span{font-size:13.5px;font-weight:800;color:#fff;text-transform:none;letter-spacing:0;}
      .rd-mode-btn:has(input:checked){background:#38BDF8;border-color:#38BDF8;}
      .rd-mode-btn:has(input:checked) span{color:#06283d;}
      .rd-mode-note{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.68);}

      .rd-tray-wrap{padding:16px 0 18px;border-top:1px solid rgba(255,255,255,.10);
        border-bottom:1px solid rgba(255,255,255,.10);margin-bottom:18px;}
      .rd-tray-head{display:flex;align-items:center;gap:11px;margin-bottom:13px;}
      .rd-tray-title{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#38BDF8;}
      .rd-tray-count{font-size:13px;font-weight:600;color:rgba(255,255,255,.68);}
      .rd-tray-clear{margin-left:auto;background:none;border:0;cursor:pointer;
        font-size:12.5px;font-weight:700;color:rgba(255,255,255,.68);}
      .rd-tray-clear:hover{color:#fff;}
      .rd-tray{display:flex;flex-wrap:wrap;gap:12px;}
      .rd-chip{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:2px;min-width:104px;min-height:84px;padding:10px;border-radius:16px;cursor:pointer;
        background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.14);}
      .rd-chip.is-placed{background:rgba(16,185,129,.14);border-color:#10b981;}
      .rd-chip-ord{position:absolute;top:-9px;right:-9px;display:none;align-items:center;justify-content:center;
        width:28px;height:28px;border-radius:50%;background:#F97316;color:#0d1830;
        font-size:14px;font-weight:800;border:3px solid #0d1830;}
      .rd-chip.is-placed .rd-chip-ord{display:flex;}
      .rd-chip-helmet{font-size:30px;font-weight:800;letter-spacing:-.03em;color:#fff;}
      .rd-chip.is-placed .rd-chip-helmet{color:#6EE7B7;}
      .rd-chip-name{font-size:11.5px;font-weight:600;color:rgba(255,255,255,.68);}

      .rd-table{display:flex;flex-direction:column;gap:8px;}
      .rd-thead,.rd-row{display:grid;
        grid-template-columns:44px 52px minmax(0,1.5fr) minmax(0,1.2fr) 84px 96px 62px 210px;
        gap:10px;align-items:center;}
      .rd-thead{padding:0 13px 4px;font-size:11px;font-weight:800;letter-spacing:.1em;
        text-transform:uppercase;color:rgba(255,255,255,.68);}
      .rd-row{padding:10px 13px;border-radius:13px;
        background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.09);}
      .rd-row.is-placed{background:rgba(16,185,129,.08);border-color:rgba(16,185,129,.30);}
      .rd-lane{display:flex;align-items:center;justify-content:center;width:34px;height:34px;
        border-radius:10px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.75);
        font-size:15px;font-weight:800;}
      .rd-helmet{display:flex;align-items:center;justify-content:center;width:46px;height:40px;
        border-radius:10px;background:#13213a;border:1px solid rgba(255,255,255,.16);
        color:#fff;font-size:19px;font-weight:800;}
      .rd-skater{display:flex;align-items:center;gap:10px;min-width:0;}
      .rd-skater-fields{flex:1;min-width:0;}
      .rd-sponsor{font-size:11px;font-weight:600;color:#7DD3FC;margin-top:3px;}
      .rd-relay-dash{color:rgba(255,255,255,.32);font-size:16px;}
      .rd-board input[type=text],.rd-board input:not([type]),.rd-board textarea{
        width:100%;box-sizing:border-box;min-height:44px;padding:0 12px;border-radius:10px;
        background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.14);
        font-family:inherit;font-size:14.5px;font-weight:650;color:#fff;}
      .rd-board input::placeholder{color:rgba(255,255,255,.42);}
      .rd-board input:focus,.rd-board textarea:focus{
        border-color:#38BDF8;box-shadow:0 0 0 3px rgba(56,189,248,.20);outline:none;}
      .rd-place{text-align:center;font-size:20px !important;font-weight:800 !important;}
      .rd-time{text-align:center;font-variant-numeric:tabular-nums;}
      form:has(input[name="resultsMode"][value="times"]:checked) .rd-time{
        background:rgba(56,189,248,.10);border-color:rgba(56,189,248,.5);}
      .rd-rec{display:flex;justify-content:center;}
      .rd-rec-box{display:flex;align-items:center;justify-content:center;width:44px;height:44px;
        border-radius:11px;cursor:pointer;margin:0;
        background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.14);}
      .rd-rec-box input{position:absolute;opacity:0;width:0;height:0;}
      .rd-rec-box span{font-size:18px;opacity:.28;}
      .rd-rec-box:has(input:checked){background:rgba(245,158,11,.18);border-color:rgba(245,158,11,.6);}
      .rd-rec-box:has(input:checked) span{opacity:1;}
      .rd-status select{width:100%;box-sizing:border-box;min-height:44px;padding:0 10px;
        border-radius:10px;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.14);
        font-family:inherit;font-size:13px;font-weight:600;color:#fff;}
      .rd-status select option{color:#13213a;}
      .rd-status .dq-edit-button{margin-top:6px;background:rgba(220,38,38,.14);
        border:1px solid rgba(220,38,38,.5);color:#FCA5A5;}

      .rd-notes{margin-top:16px;}
      .rd-notes label{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
        color:rgba(255,255,255,.68);margin-bottom:7px;}
      .rd-notes textarea{min-height:60px;line-height:1.5;resize:vertical;padding:12px 14px;}

      .rd-actions{display:flex;align-items:center;gap:12px;margin-top:16px;flex-wrap:wrap;}
      .rd-actions-note{flex:1;min-width:220px;font-size:12.5px;line-height:1.55;color:rgba(255,255,255,.68);}
      .rd-btn{display:inline-flex;align-items:center;justify-content:center;min-height:56px;
        padding:0 24px;border-radius:14px;font-family:inherit;font-size:15px;font-weight:800;
        cursor:pointer;border:0;}
      .rd-btn-save{background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.2);color:#fff;}
      .rd-btn-close{background:#10b981;color:#04291d;box-shadow:0 6px 20px rgba(16,185,129,.4);}

      .judge-save-toast{position:fixed;right:22px;bottom:22px;background:#10b981;color:#fff;
        font-weight:800;border-radius:999px;padding:12px 18px;box-shadow:0 10px 30px rgba(16,185,129,.35);
        opacity:0;transform:translateY(12px);pointer-events:none;
        transition:opacity .18s ease,transform .18s ease;z-index:9999;}
      .judge-save-toast.show{opacity:1;transform:translateY(0);}

      @media(max-width:1100px){
        .rd-thead{display:none;}
        .rd-row{grid-template-columns:44px 52px minmax(0,1fr);grid-auto-rows:min-content;row-gap:9px;}
        .rd-row > div:nth-child(4){grid-column:1 / -1;}
        .rd-row > div:nth-child(5),.rd-row > div:nth-child(6),
        .rd-row > div:nth-child(7){grid-column:span 1;}
        .rd-status{grid-column:1 / -1;}
        .rd-title{font-size:30px;}
      }
    </style>

    <script>
      (function(){
        // ── Finish-order tray → writes into the existing place_{lane} inputs ──
        var tray=document.querySelector('.rd-tray');
        if(tray){
          var order=[];
          var countEl=document.getElementById('rdTrayCount');
          var chips=Array.prototype.slice.call(tray.querySelectorAll('.rd-chip'));
          function placeInput(lane){ return document.querySelector('[name="place_'+lane+'"]'); }
          function row(lane){ return document.querySelector('.rd-row[data-lane="'+lane+'"]'); }
          function paint(){
            chips.forEach(function(chip){
              var lane=chip.dataset.lane;
              var idx=order.indexOf(lane);
              var placed=idx>=0;
              chip.classList.toggle('is-placed',placed);
              chip.querySelector('.rd-chip-ord').textContent=placed?String(idx+1):'';
              var r=row(lane); if(r) r.classList.toggle('is-placed',placed);
              var input=placeInput(lane);
              if(input && placed) input.value=String(idx+1);
            });
            if(countEl) countEl.textContent=order.length+' of '+chips.length+' placed';
          }
          chips.forEach(function(chip){
            chip.addEventListener('click',function(){
              var lane=chip.dataset.lane;
              var i=order.indexOf(lane);
              if(i>=0){
                order.splice(i,1);
                var input=placeInput(lane); if(input) input.value='';
              } else {
                order.push(lane);
              }
              paint();
            });
          });
          var clear=document.getElementById('rdTrayClear');
          if(clear) clear.addEventListener('click',function(){
            order.forEach(function(lane){ var input=placeInput(lane); if(input) input.value=''; });
            order=[]; paint();
          });
          // Seed from any places already saved on the server.
          chips.map(function(chip){
            var input=placeInput(chip.dataset.lane);
            return { lane:chip.dataset.lane, place:parseInt(input&&input.value,10) };
          }).filter(function(x){ return x.place>0; })
            .sort(function(a,b){ return a.place-b.place; })
            .forEach(function(x){ order.push(x.lane); });
          paint();
        }

        // ── Results-mode hint ──
        var noteEl=document.querySelector('.rd-mode-note');
        function syncNote(){
          var times=document.querySelector('input[name="resultsMode"][value="times"]');
          if(noteEl) noteEl.textContent=(times&&times.checked)
            ? 'Times drive the ranking for this race'
            : 'Places are authoritative; time is optional';
        }
        Array.prototype.forEach.call(document.querySelectorAll('input[name="resultsMode"]'),function(el){
          el.addEventListener('change',syncNote);
        });
        syncNote();

        // ── Async save + toast (unchanged behavior) ──
        var form=document.getElementById('judgeRaceForm');
        var toast=document.getElementById('judgeSaveToast');
        if(!form||!toast) return;
        var clickedAction='';
        form.querySelectorAll('button[type="submit"][name="action"]').forEach(function(btn){
          btn.addEventListener('click',function(){ clickedAction=this.value||''; });
        });
        function showToast(msg){
          toast.textContent=msg||'✓ Race Saved';
          toast.classList.add('show');
          clearTimeout(window.__judgeSaveToastTimer);
          window.__judgeSaveToastTimer=setTimeout(function(){toast.classList.remove('show');},2200);
        }
        form.addEventListener('submit',function(e){
          var action=clickedAction || (document.activeElement&&document.activeElement.value) || '';
          if(action!=='save') return;
          e.preventDefault();
          var submitter=form.querySelector('button[name="action"][value="save"]');
          var fd=new FormData(form);
          fd.set('action','save');
          var body=new URLSearchParams(fd);
          if(submitter) submitter.disabled=true;
          fetch(form.getAttribute('action'),{method:'POST',body:body,credentials:'same-origin',headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}})
            .then(function(r){ if(!r.ok) throw new Error('Save failed'); return r.json(); })
            .then(function(){ showToast('✓ Race Saved'); })
            .catch(function(){ showToast('⚠ Save failed'); })
            .finally(function(){ if(submitter) submitter.disabled=false; clickedAction=''; });
        });
      })();
    </script>
    ${renderRelayEligibleSkatersHtml ? renderRelayEligibleSkatersHtml(meet, current) : ''}`;
}

// ── Director control board ───────────────────────────────────────────────────
// Replaces the six stacked utility cards on the Director tab. The race pointer
// owns the screen; Correction / Re-Randomize / Score Sheets drop to a strip at
// the bottom. Under 1024px the whole thing becomes the trackside layout — same
// page, bigger targets, one Advance button.
//
// Every existing hook is preserved verbatim:
//   JSON APIs  /api/meet/:id/race-day/{set-current,step,toggle-pause,unlock-race}
//              via setCurrentRace() / moveCurrent(±1) / pauseMeet() / unlockRace()
//   GET        /portal/meet/:id/race-day/correction   (raceId, closed races only)
//   POST       /portal/meet/:id/race-day/re-randomize-lanes (raceId, confirm)
//   GET        /portal/meet/:id/score-sheets/print    (raceId + hidden scope=race)
//              and ?scope=meet&format=pdf
//   Links      /meet/:id/tv, /portal/meet/:id/time-trials/:id?mode=director
//   Flashes    ?lanesRandomized=  and  ?error=
function renderDirectorBoard({
  meet,
  info,
  current,
  currentPackLanes = [],
  currentPackLabel = '',
  nextPackLabel = '',
  currentMerged = false,
  progress = { completed: 0, total: 0 },
  regMap = new Map(),
  query = {},
  isTimeTrialItem,
  raceDayItemLabel,
  raceDayItemSub,
  raceStatusLabel,
  sponsorLineHtml,
}) {
  const total = Number(progress.total) || 0;
  const done = Number(progress.completed) || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const raceNo = Math.max((info.idx || 0) + 1, 1);
  const currentIsTT = !!(current && isTimeTrialItem(current));
  const nextLabel = info.next ? (nextPackLabel || info.next.groupLabel) : '';
  const nextSub = info.next ? raceDayItemSub(info.next) : '';

  const raceOptions = info.ordered
    .map((r, idx) => `<option value="${esc(r.id)}" ${r.id === meet.currentRaceId ? 'selected' : ''}>${idx + 1}. ${esc(raceDayItemLabel(r))}</option>`)
    .join('');

  const optionRow = (r, idx) =>
    `<option value="${esc(r.id)}">Race ${idx + 1} — ${esc(r.groupLabel)} — ${esc(cap(r.division))} — ${esc(r.distanceLabel)} — ${esc(raceDisplayStage(r))}</option>`;

  const closedOptions = info.ordered
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => !isTimeTrialItem(r) && String(r.status || '') === 'closed')
    .map(({ r, idx }) => optionRow(r, idx))
    .join('');

  const randomizeOptions = info.ordered
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => !isTimeTrialItem(r) && !r.isRelayRace)
    .map(({ r, idx }) => optionRow(r, idx))
    .join('');

  const sheetOptions = info.ordered.map((r, idx) => optionRow(r, idx)).join('');

  const chips = current && !currentIsTT ? [
    current.blockName || 'Unassigned',
    cap(current.division),
    raceDisplayStage(current),
    `${cap(current.startType)} Start`,
  ] : currentIsTT ? [
    current.blockName || 'Unassigned',
    '⏱ Time Trial',
    current.distanceLabel || '100m',
  ] : [];

  const laneSheet = currentIsTT ? `
    <div class="rdd-tt">
      <p class="rdd-tt-note">Standalone queue event — manual time entry and live leaderboards.</p>
      <a class="btn-orange" href="/portal/meet/${esc(meet.id)}/time-trials/${esc(current.id)}?mode=director">Open Time Trial Event</a>
    </div>` : current ? `
    ${currentMerged ? `<div class="rdd-merge">🔗 Racing together as one pack — <b>${esc(currentPackLabel)}</b>. Each division is scored separately; enter places on each race in the Tabulator tab.</div>` : ''}
    <div class="rdd-lane-list">
      ${currentPackLanes.map(l => {
        const reg = regMap.get(Number(l.registrationId));
        const result = esc(current.resultsMode === 'times' ? l.time : l.place);
        const statusText = l.status ? esc(raceStatusLabel(l.status)) : '';
        const sponsor = sponsorLineHtml(reg?.sponsor || '').replace('sponsor-line', 'rdd-lane-sponsor');
        return `<div class="rdd-lane">
          <span class="rdd-lane-n">L${esc(l.lane)}</span>
          <span class="rdd-helmet">${l.helmetNumber ? esc(l.helmetNumber) : '—'}</span>
          <span class="rdd-lane-who">
            <b>${esc(l.skaterName || '')}${l._div ? ` <span class="merge-div-tag">${esc(l._div)}</span>` : ''}</b>
            ${l.team ? `<em>${esc(l.team)}</em>` : ''}
            ${sponsor}
          </span>
          ${statusText ? `<span class="rdd-lane-status">${statusText}</span>` : (result ? `<span class="rdd-lane-result">${result}</span>` : '')}
        </div>`;
      }).join('') || '<div class="rdd-empty">No skaters entered yet.</div>'}
    </div>` : '<div class="rdd-empty">No race selected yet.</div>';

  return `
<style>
  .rdd{--o:#F97316;--n:#13213a}
  .rdd-flash{padding:12px 16px;border-radius:14px;font-weight:700;font-size:14px;margin-bottom:14px}
  .rdd-flash.ok{background:#ecfdf5;border:1px solid #6ee7b7;color:#047857}
  .rdd-flash.bad{background:#fef2f2;border:1px solid #fca5a5;color:#b42318}

  .rdd-cmd{border-radius:22px;background:var(--n);padding:22px 24px 18px;box-shadow:var(--shadow-lg);margin-bottom:16px;color:#fff}
  .rdd-cmd-top{display:flex;align-items:flex-start;gap:26px;flex-wrap:wrap}
  .rdd-now{flex:1;min-width:300px}
  .rdd-kickers{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:7px}
  .rdd-onair{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;background:rgba(239,68,68,.18);border:1px solid rgba(239,68,68,.45);font-weight:800;font-size:11px;letter-spacing:.09em;color:#FCA5A5}
  .rdd-onair i{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:rddPulse 1.6s ease-in-out infinite}
  @keyframes rddPulse{0%,100%{opacity:1}50%{opacity:.35}}
  .rdd-raceno{font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--o)}
  .rdd-title{font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1.05;color:#fff}
  .rdd-sub{font-size:15px;font-weight:600;color:rgba(255,255,255,.68);margin-top:4px}
  .rdd-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}
  .rdd-chip{padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.18);font-weight:700;font-size:12px;color:rgba(255,255,255,.88)}
  .rdd-chip.state{background:rgba(56,189,248,.16);border-color:rgba(56,189,248,.45);color:#7DD3FC}
  .rdd-chip.merged{background:rgba(124,58,237,.20);border-color:rgba(167,139,250,.5);color:#DDD6FE}

  .rdd-ctrl{display:flex;flex-direction:column;gap:10px;min-width:330px}
  .rdd-ctrl-row{display:flex;gap:10px;flex-wrap:wrap}
  .rdd-b{display:inline-flex;align-items:center;justify-content:center;border:0;cursor:pointer;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;white-space:nowrap;text-decoration:none}
  .rdd-b-prev{min-height:58px;padding:0 20px;border-radius:14px;background:rgba(255,255,255,.10);border:1.5px solid rgba(255,255,255,.22);color:#fff;font-weight:800;font-size:15px}
  .rdd-b-next{flex:1;min-height:58px;padding:0 26px;border-radius:14px;background:var(--o);color:#fff;font-weight:800;font-size:17px;box-shadow:0 8px 22px rgba(249,115,22,.40)}
  .rdd-b-next span{display:block;font-weight:600;font-size:12.5px;opacity:.85;margin-top:1px}
  .rdd-b-sm{flex:1;min-height:44px;padding:0 16px;border-radius:12px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.20);color:#fff;font-weight:700;font-size:13.5px}
  .rdd-b-tv{background:rgba(56,189,248,.16);border-color:rgba(56,189,248,.45);color:#7DD3FC}
  .rdd-b-unlock{background:rgba(239,68,68,.16);border-color:rgba(239,68,68,.45);color:#FCA5A5}
  .rdd-b:hover{filter:brightness(1.08)}

  .rdd-cmd-foot{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.12)}
  .rdd-prog{flex:1;min-width:240px}
  .rdd-bar{height:8px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden}
  .rdd-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#F97316,#fbbf24)}
  .rdd-prog-label{font-weight:600;font-size:12.5px;color:rgba(255,255,255,.62);margin-top:7px}
  .rdd-staging{padding:10px 16px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}
  .rdd-staging-k{font-weight:800;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#FCD34D}
  .rdd-staging-v{font-weight:750;font-size:15px;color:#fff;margin-top:2px}

  .rdd-grid{display:grid;grid-template-columns:1.4fr .6fr;gap:16px;align-items:start}
  .rdd-panel{border-radius:20px;background:var(--card);border:1px solid var(--border);box-shadow:var(--shadow-sm);overflow:hidden}
  .rdd-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 18px;border-bottom:1px solid var(--border)}
  .rdd-panel-title{font-size:21px;font-weight:800;letter-spacing:-.02em;color:var(--navy)}
  .rdd-panel-note{font-weight:600;font-size:13px;color:var(--muted)}
  .rdd-lane{display:grid;grid-template-columns:34px 46px 1fr auto;align-items:center;gap:14px;padding:13px 16px;border-bottom:1px solid var(--border);background:#fff}
  .rdd-lane:nth-child(even){background:var(--card)}
  .rdd-lane:last-child{border-bottom:0}
  .rdd-lane-n{font-weight:700;font-size:13px;color:var(--muted)}
  .rdd-helmet{display:flex;align-items:center;justify-content:center;height:36px;border-radius:9px;background:var(--navy);color:#fff;font-weight:800;font-size:17px}
  .rdd-lane-who{min-width:0;display:flex;flex-direction:column}
  .rdd-lane-who b{font-weight:700;font-size:17px;color:var(--navy);line-height:1.3}
  .rdd-lane-who em{font-style:normal;font-weight:500;font-size:13px;color:var(--muted)}
  .rdd-lane-sponsor{font-size:12.5px;font-weight:600;color:var(--sky2);margin-top:2px}
  .rdd-lane-result{font-size:20px;font-weight:800;color:var(--navy)}
  .rdd-lane-status{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--red)}
  .rdd-empty,.rdd-tt-note{padding:20px 18px;font-weight:600;color:var(--muted)}
  .rdd-tt{padding:18px}
  .rdd-tt-note{padding:0 0 14px}
  .rdd-merge{margin:14px 18px 0;padding:12px 14px;border-radius:12px;background:#faf5ff;border:1px solid #d8b4fe;font-size:13px;font-weight:600;color:#6d28d9}

  .rdd-side{display:flex;flex-direction:column;gap:14px}
  .rdd-card{padding:16px 18px;border-radius:20px;background:#fff;border:1px solid var(--border);box-shadow:var(--shadow-sm)}
  .rdd-card-k{font-weight:700;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
  .rdd-card-t{font-size:17px;font-weight:800;letter-spacing:-.02em;color:var(--navy);margin-bottom:11px}
  .rdd-note{font-weight:500;font-size:12.5px;line-height:1.5;color:var(--muted);margin-top:9px}
  .rdd-queue{display:flex;flex-direction:column;gap:8px}
  .rdd-q{display:grid;grid-template-columns:34px 1fr;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:var(--panel);border:1px solid var(--border)}
  .rdd-q-n{font-weight:800;font-size:15px;color:var(--muted);text-align:center}
  .rdd-q-t{font-weight:700;font-size:14.5px;color:var(--navy)}
  .rdd-q-m{font-weight:500;font-size:12.5px;color:var(--muted)}

  .rdd-tools{margin-top:18px}
  .rdd-tools>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;min-height:52px;padding:0 18px;border-radius:16px;background:#fff;border:1px solid var(--border);font-weight:800;font-size:14px;color:var(--navy)}
  .rdd-tools>summary::-webkit-details-marker{display:none}
  .rdd-tools>summary em{font-style:normal;font-weight:500;font-size:12.5px;color:var(--muted);flex:1}
  .rdd-tools-head{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
  .rdd-tools-head b{font-weight:700;font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
  .rdd-tools-head span{font-weight:500;font-size:12.5px;color:#94a3b8}
  .rdd-toolgrid{display:flex;gap:12px;flex-wrap:wrap}
  .rdd-tool{flex:1;min-width:250px;display:flex;flex-direction:column;gap:9px;padding:16px 18px;border-radius:16px;background:#fff;border:1px solid var(--border);border-top:3px solid var(--orange)}
  .rdd-tool.sky{border-top-color:var(--sky2)}
  .rdd-tool.navy{border-top-color:var(--navy)}
  .rdd-tool-t{font-weight:800;font-size:15px;color:var(--navy)}
  .rdd-tool-d{font-weight:500;font-size:12.5px;line-height:1.5;color:var(--muted)}
  .rdd-tool form{display:flex;flex-direction:column;gap:9px;margin:0}
  .rdd-meetpdf{margin-top:10px;font-weight:500;font-size:12.5px;color:#94a3b8}

  /* Desktop keeps the tools strip open — the summary is the mobile affordance. */
  @media(min-width:1025px){
    .rdd-tools>summary{display:none}
    .rdd-tools>.rdd-toolbody{display:block}
  }
  /* ── Trackside: tablet at the rail, one thumb ── */
  @media(max-width:1024px){
    .rdd-title{font-size:46px;letter-spacing:-.035em}
    .rdd-ctrl{min-width:0}
    .rdd-ctrl-row{flex-wrap:nowrap}
    .rdd-b-prev{min-height:72px;min-width:72px;padding:0 22px;border-radius:18px;font-size:22px}
    .rdd-b-next{min-height:72px;border-radius:18px;font-size:20px;flex-direction:column;gap:0}
    .rdd-b-sm{min-height:52px}
    .rdd-grid{grid-template-columns:1fr}
    .rdd-lane{grid-template-columns:44px 62px 1fr auto;gap:18px;padding:17px 20px}
    .rdd-helmet{height:46px;border-radius:11px;font-size:22px}
    .rdd-lane-who b{font-size:22px}
    .rdd-lane-who em{font-size:14px}
    .rdd-tools>.rdd-toolbody{padding-top:12px}
  }
  @media(max-width:700px){
    .rdd-cmd{padding:18px 16px 16px}
    .rdd-title{font-size:34px}
    .rdd-lane{grid-template-columns:34px 46px 1fr;gap:12px;padding:14px}
    .rdd-helmet{height:38px;font-size:18px}
    .rdd-lane-who b{font-size:18px}
    .rdd-lane-result,.rdd-lane-status{grid-column:3;text-align:left}
  }
</style>
<div class="rdd">
  ${query.lanesRandomized ? '<div class="rdd-flash ok">🎲 Lanes re-randomized for that race. Heats, race order, and blocks were not changed.</div>' : ''}
  ${query.error ? `<div class="rdd-flash bad">${esc(query.error)}</div>` : ''}

  <div class="rdd-cmd">
    <div class="rdd-cmd-top">
      <div class="rdd-now">
        <div class="rdd-kickers">
          <span class="rdd-onair"><i></i>ON THE TRACK</span>
          <span class="rdd-raceno">${current ? `Race ${raceNo} of ${info.ordered.length}` : 'No race selected'}</span>
        </div>
        <div class="rdd-title">${current ? esc(currentPackLabel || current.groupLabel) : '—'}</div>
        ${current ? `<div class="rdd-sub">${esc(raceDayItemSub(current))}</div>` : ''}
        <div class="rdd-chips">
          ${chips.map(c => `<span class="rdd-chip">${esc(c)}</span>`).join('')}
          ${current && !currentIsTT ? `<span class="rdd-chip state">${esc(current.status || '')}</span>` : ''}
          ${currentMerged ? '<span class="rdd-chip merged">🔗 together</span>' : ''}
          ${current && current.isOpenRace ? '<span class="rdd-chip">🏁 Open</span>' : ''}
          ${current && current.isQuadRace ? '<span class="rdd-chip">🛼 Quad</span>' : ''}
        </div>
      </div>
      <div class="rdd-ctrl">
        <div class="rdd-ctrl-row">
          <button class="rdd-b rdd-b-prev" type="button" onclick="moveCurrent(-1)">←<span class="rdd-prev-word"> Previous</span></button>
          <button class="rdd-b rdd-b-next" type="button" onclick="moveCurrent(1)">${info.next ? `Advance to race ${raceNo + 1} →` : 'Next race →'}${nextLabel ? `<span>${esc(nextLabel)}${nextSub ? ' · ' + esc(nextSub) : ''}</span>` : ''}</button>
        </div>
        <div class="rdd-ctrl-row">
          <button class="rdd-b rdd-b-sm" type="button" onclick="pauseMeet()">${meet.raceDayPaused ? '▶ Resume' : '⏸ Pause meet'}</button>
          <a class="rdd-b rdd-b-sm rdd-b-tv" href="/meet/${meet.id}/tv" target="_blank">📺 TV display</a>
          ${current && !currentIsTT && current.status === 'closed' ? `<button class="rdd-b rdd-b-sm rdd-b-unlock" type="button" onclick="unlockRace('${esc(current.id)}')">Unlock race</button>` : ''}
        </div>
      </div>
    </div>
    <div class="rdd-cmd-foot">
      <div class="rdd-prog">
        <div class="rdd-bar"><i style="width:${pct}%"></i></div>
        <div class="rdd-prog-label">${done} of ${total} races complete · ${meet.raceDayPaused ? '⏸ Paused' : '▶ Running'}</div>
      </div>
      ${info.next ? `<div class="rdd-staging"><div class="rdd-staging-k">In staging</div><div class="rdd-staging-v">${esc(nextLabel)}${nextSub ? ' · ' + esc(nextSub) : ''}</div></div>` : ''}
    </div>
  </div>

  <div class="rdd-grid">
    <div class="rdd-panel">
      <div class="rdd-panel-head">
        <div class="rdd-panel-title">${currentIsTT ? 'Time Trial event' : 'Lane sheet'}</div>
        ${currentIsTT ? '' : `<div class="rdd-panel-note">${currentPackLanes.filter(l => l.skaterName).length} skaters · results post from the Tabulator tab</div>`}
      </div>
      ${laneSheet}
    </div>

    <div class="rdd-side">
      <div class="rdd-card">
        <div class="rdd-card-k">Jump to race</div>
        <select onchange="setCurrentRace(this.value)">${raceOptions}</select>
        <div class="rdd-note">Judges stay locked to the live race. Jumping moves the whole meet pointer.</div>
      </div>
      <div class="rdd-card">
        <div class="rdd-card-t">Coming up</div>
        <div class="rdd-queue">
          ${info.coming.map((r, i) => `<div class="rdd-q">
            <span class="rdd-q-n">${info.idx + i + 3}</span>
            <div>
              <div class="rdd-q-t">${esc(r.groupLabel)}</div>
              <div class="rdd-q-m">${isTimeTrialItem(r) ? 'Time Trial' : esc(cap(r.division))} · ${esc(r.distanceLabel)}</div>
            </div>
          </div>`).join('') || '<div class="rdd-q-m">Nothing queued.</div>'}
        </div>
      </div>
    </div>
  </div>

  <details class="rdd-tools">
    <summary>Director tools <em>Correction · Re-randomize lanes · Score sheets</em> →</summary>
    <div class="rdd-toolbody">
      <div class="rdd-tools-head">
        <b>Director tools</b>
        <span>Occasional — they no longer outrank the race pointer</span>
      </div>
      <div class="rdd-toolgrid">
        <div class="rdd-tool">
          <div class="rdd-tool-t">✏️ Correction Mode</div>
          <div class="rdd-tool-d">Fix a closed race without rewinding the meet, advancing racers, or rebuilding later races.</div>
          <form method="GET" action="/portal/meet/${meet.id}/race-day/correction">
            <select name="raceId" required>
              <option value="">Select completed race…</option>
              ${closedOptions}
            </select>
            <button class="btn-orange" type="submit">Open correction</button>
          </form>
        </div>
        <div class="rdd-tool sky">
          <div class="rdd-tool-t">🎲 Re-Randomize Lanes</div>
          <div class="rdd-tool-d">Redraw lane assignments for one race only. Heats, race order, and block placement are untouched.</div>
          <form method="POST" action="/portal/meet/${meet.id}/race-day/re-randomize-lanes" onsubmit="return confirm('Re-randomize lanes for this race? This only changes lane numbers — heats, order, and blocks stay the same.');">
            <select name="raceId" required>
              <option value="">Select race…</option>
              ${randomizeOptions}
            </select>
            <button class="btn-sky" type="submit">🎲 Re-randomize lanes</button>
          </form>
        </div>
        <div class="rdd-tool navy">
          <div class="rdd-tool-t">🖨 Race Score Sheets</div>
          <div class="rdd-tool-d">Printable paper worksheets for judges, referees, and tabulators — blank Place/Status/Points/Notes.</div>
          <form method="GET" action="/portal/meet/${meet.id}/score-sheets/print" target="_blank">
            <select name="raceId">
              <option value="">Select race…</option>
              ${sheetOptions}
            </select>
            <input type="hidden" name="scope" value="race" />
            <button class="btn2" type="submit">Print selected race</button>
          </form>
        </div>
      </div>
      <div class="rdd-meetpdf"><a href="/portal/meet/${meet.id}/score-sheets/print?scope=meet&amp;format=pdf" target="_blank">Print entire meet PDF →</a></div>
    </div>
  </details>
</div>
<script>
  async function setCurrentRace(raceId){const r=await fetch('/api/meet/${meet.id}/race-day/set-current',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId})});if(r.ok) location.reload();}
  async function moveCurrent(dir){const r=await fetch('/api/meet/${meet.id}/race-day/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({direction:dir})});if(r.ok) location.reload();}
  async function pauseMeet(){const r=await fetch('/api/meet/${meet.id}/race-day/toggle-pause',{method:'POST'});if(r.ok) location.reload();}
  async function unlockRace(raceId){const r=await fetch('/api/meet/${meet.id}/race-day/unlock-race',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId})});if(r.ok) location.reload();}
</script>`;
}

module.exports = {
  renderJudgeBoard,
  renderDirectorBoard,
};
