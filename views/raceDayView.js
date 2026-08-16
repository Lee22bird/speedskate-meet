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

  // Finish-order tray: one chip per lane that has a skater.
  const trayChips = currentLanes.filter(l => l.skaterName).map(l => `
    <button type="button" class="rd-chip" data-lane="${esc(l.lane)}">
      <span class="rd-chip-ord"></span>
      <span class="rd-chip-helmet">${esc(l.helmetNumber || '—')}</span>
      <span class="rd-chip-name">${esc(String(l.skaterName).split(' ')[0])}</span>
    </button>`).join('');

  const laneRows = currentLanes.map(l => {
    const reg = regMap.get(Number(l.registrationId));
    return `
      <div class="rd-row" data-lane="${esc(l.lane)}">
        <div class="rd-lane">${esc(l.lane)}</div>
        <div class="rd-helmet">${esc(l.helmetNumber || '—')}</div>
        <div class="rd-skater">
          ${skaterAvatarHtml ? skaterAvatarHtml(l, reg, 'small') : ''}
          <div class="rd-skater-fields">
            <input name="skaterName_${esc(l.lane)}" value="${esc(l.skaterName)}" autocomplete="off" />
            ${reg?.sponsor ? `<div class="rd-sponsor">Sponsor: ${esc(reg.sponsor)}</div>` : ''}
          </div>
        </div>
        <div><input name="team_${esc(l.lane)}" value="${esc(l.team)}" autocomplete="off" /></div>
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
            <span class="rd-tray-title">Tap in finish order</span>
            <span class="rd-tray-count" id="rdTrayCount"></span>
            <button type="button" class="rd-tray-clear" id="rdTrayClear">Clear order</button>
          </div>
          <div class="rd-tray">${trayChips}</div>
        </div>` : ''}

        <div class="rd-table">
          <div class="rd-thead">
            <div>Lane</div><div>Helm</div><div>Skater</div><div>Team</div>
            <div>Place</div><div>Time</div><div>Rec</div><div>Status / DQ</div>
          </div>
          ${laneRows}
        </div>

        <div class="rd-notes">
          <label for="rdNotes">Race notes</label>
          <textarea id="rdNotes" name="notes" rows="2" placeholder="Optional">${esc(current.notes || '')}</textarea>
        </div>

        <div class="rd-actions">
          <span class="rd-actions-note">Save posts in place and does not advance the meet. Close Race does.</span>
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

module.exports = {
  renderJudgeBoard,
};
