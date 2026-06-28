const { esc, cap } = require('../utils/html');
const { raceDisplayStage } = require('../services/raceDay');
const { ensureTimeTrialEvent, timeTrialEventTitle } = require('../services/timeTrialEvents');

function renderBlockBuilderView({ meet }) {
  const timeTrialEvent = ensureTimeTrialEvent(meet);
  const timeTrialEventById = new Map((meet.timeTrialEvents || []).filter(e => e.enabled).map(e => [e.id, e]));
  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const assigned = new Set();
  const assignedTimeTrialEvents = new Set();
  for (const block of meet.blocks || []) {
    for (const rid of block.raceIds || []) assigned.add(rid);
    for (const eid of block.timeTrialEventIds || []) assignedTimeTrialEvents.add(eid);
  }

  const unassigned = (meet.races || []).filter(r => !assigned.has(r.id));
  const unassignedTimeTrialEvents = timeTrialEvent ? [timeTrialEvent].filter(e => !assignedTimeTrialEvents.has(e.id)) : [];
  const inlineRaceCount = (meet.races || []).filter(r => !r.isOpenRace && !r.isQuadRace && !r.isTimeTrial && !r.isRelayRace).length;
  const openRaceCount = (meet.races || []).filter(r => r.isOpenRace).length;
  const quadRaceCount = (meet.races || []).filter(r => r.isQuadRace).length;
  const timeTrialRaceCount = (timeTrialEvent ? 1 : 0);
  const relayRaceCount = (meet.races || []).filter(r => r.isRelayRace).length;
  const additionalRaceCount = (meet.races || []).filter(r => r.isAdditionalRace || String(r.division || '').toLowerCase() === 'additional').length;
  const breakTypes = ['break', 'lunch', 'awards', 'practice'];
  const breakIcons = { break: '☕', lunch: '🍽️', awards: '🏆', practice: '🛼' };

  function raceItemHtml(race, isCurrent, draggable = true) {
    const tag = race.isTimeTrial ? '⏱ ' : race.isRelayRace ? '🔄 ' : race.isOpenRace ? '🏁 ' : race.isQuadRace ? '🛼 ' : (race.isAdditionalRace ? '➕ ' : '');
    const cls = race.isTimeTrial ? 'tt-item' : race.isRelayRace ? 'relay-item' : race.isOpenRace ? 'open-item' : race.isQuadRace ? 'quad-item' : (race.isAdditionalRace ? 'additional-item' : '');
    return `
      <div class="race-item ${isCurrent ? 'active-now' : ''} ${cls}" draggable="${draggable}"
        data-race-id="${esc(race.id)}"
        data-group-label="${esc(String(race.groupLabel || '').toLowerCase())}"
        data-division="${esc(race.division)}"
        data-day-index="${esc(race.dayIndex)}">
        <div class="race-label">${tag}${esc(race.groupLabel)} <span style="opacity:.6">•</span> ${esc(cap(race.division))}</div>
        <div class="race-meta">${esc(race.distanceLabel)} • D${esc(race.dayIndex)} • ${esc(raceDisplayStage(race))} • ${esc(cap(race.startType))}</div>
      </div>`;
  }

  function timeTrialItemHtml(event, draggable = true) {
    const total = Array.isArray(event.participants) ? event.participants.length : 0;
    const completed = (event.participants || []).filter(row => String(row.time || '').trim()).length;
    return `
      <div class="race-item tt-item" draggable="${draggable}"
        data-race-id="${esc(event.id)}"
        data-item-type="time-trial-event"
        data-group-label="${esc(String(timeTrialEventTitle(event)).toLowerCase())}"
        data-division="time_trial"
        data-day-index="tt">
        <div class="race-label">⏱ ${esc(timeTrialEventTitle(event))}</div>
        <div class="race-meta">Queue event • ${completed}/${total} complete • Counts overall: ${event.countsForOverall ? 'Yes' : 'No'}</div>
        <div style="margin-top:6px"><a class="btn2 btn-sm" href="/portal/meet/${esc(meet.id)}/time-trials/${esc(event.id)}">Open Time Trial</a></div>
      </div>`;
  }

  let raceCount = 0;
  const blockNumber = {};
  for (const block of meet.blocks || []) {
    const isBreak = breakTypes.includes(block.type || '');
    if (isBreak) blockNumber[block.id] = null;
    else blockNumber[block.id] = ++raceCount;
  }

  const blocksHtml = (meet.blocks || []).map(block => {
    const isBreak = breakTypes.includes(block.type || '');
    if (isBreak) {
      const icon = breakIcons[block.type] || '📌';
      return `
        <div class="divider-card" id="block-${esc(block.id)}">
          <div class="divider-card-inner">
            <div class="divider-icon">${icon}</div>
            <div class="divider-info">
              <div class="divider-name">${esc(block.name)}</div>
              <div class="note">${esc(block.day || 'Day 1')}${block.notes ? ' • ' + esc(block.notes) : ''}</div>
            </div>
            <div class="action-row">
              <select class="divider-day-sel" onchange="setBlockDay('${esc(block.id)}',this.value)">
                ${['Day 1', 'Day 2', 'Day 3'].map(d => `<option value="${d}" ${block.day === d ? 'selected' : ''}>${d}</option>`).join('')}
              </select>
              <input class="divider-notes-inp" value="${esc(block.notes || '')}" placeholder="notes..." onblur="setBlockNotes('${esc(block.id)}',this.value)" style="max-width:140px" />
              <button class="btn2 btn-sm" onclick="renameBlock('${esc(block.id)}')">Rename</button>
              <button class="btn-danger btn-sm" onclick="deleteBlock('${esc(block.id)}')">Remove</button>
            </div>
          </div>
        </div>`;
    }

    const displayNum = blockNumber[block.id] || '';
    return `
      <div class="block-card" id="block-${esc(block.id)}">
        <div class="block-head" style="margin-bottom:12px">
          <div>
            <div style="font-weight:700;font-size:17px;color:var(--navy)">Block ${displayNum}</div>
            <div class="note">${esc(block.day || 'Day 1')}</div>
          </div>
          <div class="action-row">
            <button class="btn2 btn-sm" onclick="moveBlockUp('${esc(block.id)}')">↑ Move Up</button>
            <button class="btn2 btn-sm" onclick="moveBlockDown('${esc(block.id)}')">↓ Move Down</button>
            <button class="btn2 btn-sm" onclick="renameBlock('${esc(block.id)}')">Rename</button>
            <button class="btn-danger btn-sm" onclick="deleteBlock('${esc(block.id)}')">Delete</button>
          </div>
        </div>
        <div class="form-grid cols-2" style="margin-bottom:12px">
          <div><label>Day</label>
            <select onchange="setBlockDay('${esc(block.id)}',this.value)">
              ${['Day 1', 'Day 2', 'Day 3'].map(d => `<option value="${d}" ${block.day === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div><label>Notes</label><input value="${esc(block.notes || '')}" onblur="setBlockNotes('${esc(block.id)}',this.value)" placeholder="notes..." /></div>
        </div>
        <div class="drop-zone" data-drop-block="${esc(block.id)}">
          ${(block.timeTrialEventIds || []).map(eid => {
            const event = timeTrialEventById.get(eid);
            return event ? timeTrialItemHtml(event, true) : '';
          }).join('')}
          ${(block.raceIds || []).map(rid => {
            const race = raceById.get(rid);
            if (!race) return '';
            return raceItemHtml(race, meet.currentRaceId === race.id, true);
          }).join('') || `<div class="note" style="padding:8px">Drop races here…</div>`}
        </div>
      </div>`;
  }).join('') || `
    <div class="block-schedule-empty">
      <div class="block-empty-icon">＋</div>
      <h2>Your schedule is empty.</h2>
      <p>Start by creating a race block, then drag races into it.</p>
      <div class="block-tool-buttons block-empty-action">
        <button class="btn-orange" type="button" onclick="addBlock(this)">Create First Race Block</button>
      </div>
    </div>`;

  return `
    <div class="page-header block-builder-hero">
      <div>
        <div class="builder-sticky-label">Block Builder</div>
        <h1>Race Day Schedule</h1>
        <div class="sub">${esc(meet.meetName)} • ${esc(cap(meet.status || 'draft'))} • ${inlineRaceCount} Inline • ${openRaceCount} Open • ${quadRaceCount} Quad</div>
      </div>
      <div class="action-row">
        <a class="btn2" href="/portal/meet/${meet.id}/blocks/print" target="_blank">Print Block Schedule</a>
        <a class="btn2" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
      </div>
    </div>

    <div class="card block-builder-control-card" style="margin-bottom:18px">
      <div class="block-control-head">
        <div>
          <h2 style="margin:0">Schedule Control Center</h2>
          <div class="note">Build blocks, add breaks, rebuild race assignments, and keep race day flowing.</div>
        </div>
        <span class="chip chip-orange">Unassigned: <strong id="unassignedChip">${unassigned.length}</strong></span>
      </div>

      <div class="block-how-it-works">
        <strong>How it works:</strong>
        <span>1) Add a race block</span>
        <span>2) Drag races into the block</span>
        <span>3) Add breaks, lunch, awards, or practice as needed.</span>
      </div>

      <div class="block-control-grid">
        <section class="setup-mini-card block-control-mini">
          <div class="setup-mini-title">Race Summary</div>
          <div class="block-summary-grid">
            <div><span>Inline</span><strong>${inlineRaceCount}</strong></div>
            <div><span>Open</span><strong>${openRaceCount}</strong></div>
            <div><span>Quad</span><strong>${quadRaceCount}</strong></div>
            <div><span>Time Trials</span><strong>${timeTrialRaceCount}</strong></div>
            <div><span>Relays</span><strong>${relayRaceCount}</strong></div>
            <div><span>Additional</span><strong>${additionalRaceCount}</strong></div>
          </div>
        </section>

        <section class="setup-mini-card block-control-mini block-add-schedule-panel">
          <div class="setup-mini-title">Add To Schedule</div>
          <p class="note block-add-helper">Build your race day by adding blocks, breaks, lunch, awards, or practice sessions.</p>
          <div class="block-tool-buttons schedule-add-grid">
            <button class="schedule-add-card schedule-add-primary" type="button" onclick="addBlock(this)">
              <span class="schedule-add-icon">＋</span><span><strong>+ New Race Block</strong><small>Create a block for a group of races.</small></span>
            </button>
            <button class="schedule-add-card" type="button" onclick="addDivider(this,'break','☕ Break')">
              <span class="schedule-add-icon">☕</span><span><strong>Break</strong><small>Insert a short intermission.</small></span>
            </button>
            <button class="schedule-add-card" type="button" onclick="addDivider(this,'lunch','🍽 Lunch')">
              <span class="schedule-add-icon">🍽</span><span><strong>Lunch</strong><small>Insert a meal break.</small></span>
            </button>
            <button class="schedule-add-card" type="button" onclick="addDivider(this,'awards','🏆 Awards')">
              <span class="schedule-add-icon">🏆</span><span><strong>Awards</strong><small>Add an awards presentation.</small></span>
            </button>
            <button class="schedule-add-card" type="button" onclick="addDivider(this,'practice','🛼 Practice')">
              <span class="schedule-add-icon">🛼</span><span><strong>Practice</strong><small>Add warm-up or practice time.</small></span>
            </button>
          </div>
        </section>

        <section class="setup-mini-card block-control-mini block-danger-zone">
          <div class="setup-mini-title">Race Actions</div>
          <div class="block-action-stack">
            <form method="POST" action="/portal/meet/${meet.id}/assign-races?returnTo=blocks" onsubmit="return confirm('Rebuild recalculates heats, finals, race assignments, and lanes.

Your manual block schedule is preserved.

Use this after late registrations, scratches, division changes, challenge-up changes, or lane count changes.

Continue?')">
              <button class="btn2" type="submit">🔄 Rebuild Races</button>
            </form>
            <div class="note">Use after registrations, scratches, division changes, or lane updates.</div>
            <form method="POST" action="/portal/meet/${meet.id}/blocks/auto-flow" onsubmit="return confirm('Optimize Race Flow only reorders races already assigned inside each block.

It does NOT rebuild races, delete races, or move races between blocks.

Moves heats earlier and finals later while balancing races within their assigned blocks.

Continue?')">
              <button class="btn-good" type="submit">Optimize Race Flow</button>
            </form>
            <div class="note">Moves heats earlier and finals later while balancing races inside their assigned blocks.</div>
          </div>
        </section>
      </div>
    </div>

    <style>
      .block-builder-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;}
      .block-builder-control-card{padding:28px;border-radius:22px;}
      .block-control-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border);}
      .block-how-it-works{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:-2px 0 18px;padding:12px 14px;border:1px solid #bae6fd;border-radius:14px;background:#f0f9ff;color:#334155;font-size:13px;}
      .block-how-it-works strong{color:var(--navy);}
      .block-how-it-works span{display:inline-flex;align-items:center;gap:5px;}
      .block-how-it-works span+span:before{content:'›';color:#0ea5e9;font-weight:900;margin-right:5px;}
      .block-control-grid{display:grid;grid-template-columns:.9fr 1.4fr .95fr;gap:16px;align-items:stretch;}
      .block-control-mini{margin:0;min-height:100%;}
      .block-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
      .block-summary-grid div{background:#fff;border:1px solid var(--border);border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;}
      .block-summary-grid span{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
      .block-summary-grid strong{font-size:20px;color:var(--navy);}
      .block-add-helper{margin:6px 0 14px;line-height:1.5;}
      .block-tool-buttons{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
      .schedule-add-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:stretch;}
      .schedule-add-card{appearance:none;width:100%;min-height:78px;border:1px solid #cbd5e1;border-radius:15px;background:#fff;color:var(--navy);padding:13px;text-align:left;display:flex;align-items:center;gap:11px;cursor:pointer;box-shadow:0 3px 9px rgba(15,23,42,.06);transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;}
      .schedule-add-card:hover{transform:translateY(-1px);border-color:#7dd3fc;box-shadow:0 7px 16px rgba(15,23,42,.10);}
      .schedule-add-card strong{display:block;font-size:14px;line-height:1.2;}
      .schedule-add-card small{display:block;margin-top:4px;color:var(--muted);font-size:11px;line-height:1.3;font-weight:650;}
      .schedule-add-icon{width:36px;height:36px;flex:0 0 36px;display:grid;place-items:center;border-radius:11px;background:#f1f5f9;font-size:19px;}
      .schedule-add-primary{grid-column:1/-1;min-height:88px;border-color:#fb923c;background:linear-gradient(135deg,#fff7ed,#ffedd5);box-shadow:0 8px 18px rgba(249,115,22,.14);}
      .schedule-add-primary strong{font-size:16px;color:#c2410c;}
      .schedule-add-primary .schedule-add-icon{background:#f97316;color:#fff;font-size:24px;}
      .block-tool-buttons button:disabled{opacity:.62;cursor:wait;transform:none;}
      .block-schedule-empty{min-height:310px;padding:42px 24px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border:2px dashed #bae6fd;border-radius:22px;background:linear-gradient(180deg,#f8fcff,#eff8ff);}
      .block-schedule-empty h2{margin:12px 0 6px;color:var(--navy);}
      .block-schedule-empty p{margin:0 0 18px;color:var(--muted);font-weight:650;}
      .block-empty-icon{width:58px;height:58px;display:grid;place-items:center;border-radius:18px;background:#e0f2fe;color:#0284c7;font-size:34px;font-weight:800;}
      .block-empty-action{justify-content:center;}
      .block-card:target,.divider-card:target{outline:3px solid rgba(56,189,248,.75);box-shadow:0 0 0 7px rgba(56,189,248,.14),var(--shadow-lg);animation:block-created-pulse .8s ease-out;}
      @keyframes block-created-pulse{from{transform:scale(.985);background:#e0f2fe}to{transform:scale(1)}}
      .block-action-stack{display:grid;gap:8px;}
      .block-danger-zone{border-color:rgba(249,115,22,.22);background:linear-gradient(180deg,#fff,#fff7ed);}
      @media(max-width:1000px){.block-control-grid{grid-template-columns:1fr}.block-builder-hero{align-items:flex-start}.block-builder-control-card{padding:18px}.block-control-head{flex-direction:column}.block-summary-grid{grid-template-columns:1fr 1fr}}
      @media(max-width:640px){.block-summary-grid,.schedule-add-grid{grid-template-columns:1fr}.schedule-add-primary{grid-column:auto}.block-how-it-works{align-items:flex-start;flex-direction:column}.block-how-it-works span+span:before{content:'↓';margin-right:5px}.block-tool-buttons .btn2,.block-tool-buttons .btn-sm,.block-action-stack .btn2,.block-action-stack .btn-good{width:100%;justify-content:center}}
    </style>
    <div class="bb-grid">
      <div class="bb-left">${blocksHtml}</div>
      <div class="bb-right">
        <div class="bb-sticky">
          <div class="card">
            <h2 style="margin-bottom:12px">Unassigned Races</h2>
            <div class="unassigned-panel">
              <div class="filters-row">
                <div><label>Search</label><input id="raceSearch" placeholder="division..." oninput="applyFilters()" /></div>
                <div><label>Class</label>
                  <select id="classFilter" onchange="applyFilters()">
                    <option value="all">All</option><option value="novice">Novice</option>
                    <option value="elite">Elite</option><option value="open">Open</option><option value="quad">Quad</option><option value="additional">Additional</option>
                  </select>
                </div>
                <div><label>Distance</label>
                  <select id="distFilter" onchange="applyFilters()">
                    <option value="all">All</option><option value="1">D1</option><option value="2">D2</option>
                    <option value="3">D3</option><option value="4">D4</option>
                  </select>
                </div>
              </div>
              <div class="unassigned-list drop-zone" data-drop-block="__unassigned__" id="unassignedZone">
                ${unassignedTimeTrialEvents.map(event => timeTrialItemHtml(event)).join('')}
                ${unassigned.map(race => raceItemHtml(race, meet.currentRaceId === race.id)).join('') || (!unassignedTimeTrialEvents.length ? `<div class="note" style="padding:8px">All races assigned.</div>` : '')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <script>
      let dragRaceId=null; const meetId=${JSON.stringify(meet.id)};
      function scrollStorageKey(){return 'ssm_block_scroll_'+meetId;}
      function unassignedScrollStorageKey(){return 'ssm_block_unassigned_scroll_'+meetId;}
      function saveBuilderScroll(){
        const left=document.querySelector('.bb-left');
        if(left) sessionStorage.setItem(scrollStorageKey(), String(left.scrollTop));
        const unassigned=document.querySelector('.unassigned-list');
        if(unassigned) sessionStorage.setItem(unassignedScrollStorageKey(), String(unassigned.scrollTop));
      }
      function restoreBuilderScroll(){
        const left=document.querySelector('.bb-left');
        if(left){
          const target=location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
          if(target){
            target.scrollIntoView({block:'center'});
          }else{
            const val=sessionStorage.getItem(scrollStorageKey());
            if(val!==null) left.scrollTop=parseInt(val,10)||0;
          }
        }
        const unassigned=document.querySelector('.unassigned-list');
        if(unassigned){
          const val=sessionStorage.getItem(unassignedScrollStorageKey());
          if(val!==null) unassigned.scrollTop=parseInt(val,10)||0;
        }
      }
      function saveFilters(){
        localStorage.setItem('ssm_s',document.getElementById('raceSearch').value||'');
        localStorage.setItem('ssm_c',document.getElementById('classFilter').value||'all');
        localStorage.setItem('ssm_d',document.getElementById('distFilter').value||'all');
        saveBuilderScroll();
      }
      function restoreFilters(){
        document.getElementById('raceSearch').value=localStorage.getItem('ssm_s')||'';
        document.getElementById('classFilter').value=localStorage.getItem('ssm_c')||'all';
        document.getElementById('distFilter').value=localStorage.getItem('ssm_d')||'all';
      }
      function attachDnD(){
        document.querySelectorAll('.race-item').forEach(el=>{
          if(el.getAttribute('draggable')!=='true') return;
          el.addEventListener('dragstart',e=>{dragRaceId=el.getAttribute('data-race-id');e.dataTransfer.setData('text/plain',dragRaceId);saveFilters();});
        });
        document.querySelectorAll('.drop-zone').forEach(zone=>{
          zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('over');});
          zone.addEventListener('dragleave',()=>zone.classList.remove('over'));
          zone.addEventListener('drop',async e=>{
            e.preventDefault();zone.classList.remove('over');
            const raceId=e.dataTransfer.getData('text/plain')||dragRaceId;
            const destBlockId=zone.getAttribute('data-drop-block');
            saveFilters();
            const res=await fetch('/api/meet/'+meetId+'/blocks/move-race',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId,destBlockId})});
            if(res.ok) location.reload(); else alert('Move failed');
          });
        });
      }
      let blockCreatePending=false;
      function setBlockToolBusy(busy,activeButton){
        document.querySelectorAll('.block-tool-buttons button').forEach(toolButton=>{
          toolButton.disabled=busy;
          if(!busy&&toolButton.dataset.originalHtml){
            toolButton.innerHTML=toolButton.dataset.originalHtml;
          }
        });
      }
      async function createBlock(button,url,options){
        if(blockCreatePending) return;
        blockCreatePending=true;
        saveFilters();
        const original=button.innerHTML;
        button.dataset.originalHtml=original;
        setBlockToolBusy(true,button);
        button.innerHTML='<span class="schedule-adding-label">Adding…</span>';
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),15000);
        try{
          const response=await fetch(url,{...options,signal:controller.signal});
          if(!response.ok){
            const message=(await response.text()).trim();
            throw new Error(message||('Request failed ('+response.status+')'));
          }
          const result=await response.json();
          if(!result||!result.blockId) throw new Error('The block was created but its location was not returned.');
          const createdId=encodeURIComponent(result.blockId);
          location.replace('/portal/meet/'+encodeURIComponent(meetId)+'/blocks?created='+createdId+'#block-'+createdId);
        }catch(err){
          console.error(err);
          const message=err&&err.name==='AbortError'
            ? 'The server took too long to respond. No second request was sent. Please refresh and try once more.'
            : (err&&err.message?err.message:'Please try again.');
          alert('Could not add this block. '+message);
          blockCreatePending=false;
          setBlockToolBusy(false,button);
          button.innerHTML=original;
        }finally{
          clearTimeout(timeout);
        }
      }
      function addBlock(button){
        return createBlock(button,'/api/meet/'+meetId+'/blocks/add',{method:'POST'});
      }
      function addDivider(button,type,name){
        return createBlock(button,'/api/meet/'+meetId+'/blocks/add-divider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,name})});
      }
      async function renameBlock(id){const name=prompt('Name:');if(!name) return;saveFilters();const r=await fetch('/api/meet/'+meetId+'/blocks/update-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,name})});if(r.ok) location.reload();}
      async function deleteBlock(id){if(!confirm('Remove this?')) return;saveFilters();const r=await fetch('/api/meet/'+meetId+'/blocks/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id})});if(r.ok) location.reload();}
      async function moveBlock(id,dir){
        saveFilters();
        try{
          const r=await fetch('/api/meet/'+meetId+'/blocks/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,dir})});
          if(r.ok){
            const j=await r.json();
            if(j&&j.ok) location.reload(); else if(j&&j.ok===false) location.reload(); else alert('Move failed');
          } else {
            alert('Move failed');
          }
        }catch(err){console.error(err);alert('Move failed');}
      }
      function moveBlockUp(id){ return moveBlock(id,'up'); }
      function moveBlockDown(id){ return moveBlock(id,'down'); }
      async function setBlockDay(id,day){saveFilters();await fetch('/api/meet/'+meetId+'/blocks/update-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,day})});}
      async function setBlockNotes(id,notes){saveFilters();await fetch('/api/meet/'+meetId+'/blocks/update-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,notes})});}
      function applyFilters(){
        saveFilters();
        const q=(document.getElementById('raceSearch').value||'').toLowerCase().trim();
        const klass=document.getElementById('classFilter').value;
        const dist=document.getElementById('distFilter').value;
        const items=Array.from(document.querySelectorAll('#unassignedZone .race-item'));
        let v=0;
        for(const item of items){
          const mS=!q||(item.getAttribute('data-group-label')||'').includes(q);
          const mC=klass==='all'||item.getAttribute('data-division')===klass;
          const mD=dist==='all'||item.getAttribute('data-day-index')===dist;
          const show=mS&&mC&&mD; item.classList.toggle('hidden',!show); if(show) v++;
        }
        document.getElementById('unassignedChip').textContent=String(v);
      }
      restoreFilters(); restoreBuilderScroll(); attachDnD(); applyFilters();
    </script>`;
}

module.exports = {
  renderBlockBuilderView,
};
