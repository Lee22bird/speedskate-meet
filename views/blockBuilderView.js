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
  const breakIcons = { break: '☕', lunch: '🍽️', awards: '🏆', practice: '⛸️' };

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
  }).join('');

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

        <section class="setup-mini-card block-control-mini">
          <div class="setup-mini-title">Block Tools</div>
          <p class="note" style="margin-bottom:12px">Add race blocks or divider blocks, then drag races into the schedule.</p>
          <div class="block-tool-buttons">
            <button class="btn2" type="button" onclick="addBlock(this)">+ Race Block</button>
            <button class="btn2 btn-sm" type="button" onclick="addDivider(this,'break','☕ Break')">☕ Break</button>
            <button class="btn2 btn-sm" type="button" onclick="addDivider(this,'lunch','🍽️ Lunch')">🍽️ Lunch</button>
            <button class="btn2 btn-sm" type="button" onclick="addDivider(this,'awards','🏆 Awards')">🏆 Awards</button>
            <button class="btn2 btn-sm" type="button" onclick="addDivider(this,'practice','⛸️ Practice')">⛸️ Practice</button>
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
      .block-control-grid{display:grid;grid-template-columns:1fr 1.1fr 1fr;gap:16px;align-items:stretch;}
      .block-control-mini{margin:0;min-height:100%;}
      .block-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
      .block-summary-grid div{background:#fff;border:1px solid var(--border);border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;}
      .block-summary-grid span{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
      .block-summary-grid strong{font-size:20px;color:var(--navy);}
      .block-tool-buttons{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
      .block-tool-buttons button:disabled{opacity:.62;cursor:wait;transform:none;}
      .block-card:target,.divider-card:target{outline:3px solid rgba(56,189,248,.75);box-shadow:0 0 0 7px rgba(56,189,248,.14),var(--shadow-lg);animation:block-created-pulse .8s ease-out;}
      @keyframes block-created-pulse{from{transform:scale(.985);background:#e0f2fe}to{transform:scale(1)}}
      .block-action-stack{display:grid;gap:8px;}
      .block-danger-zone{border-color:rgba(249,115,22,.22);background:linear-gradient(180deg,#fff,#fff7ed);}
      @media(max-width:1000px){.block-control-grid{grid-template-columns:1fr}.block-builder-hero{align-items:flex-start}.block-builder-control-card{padding:18px}.block-control-head{flex-direction:column}.block-summary-grid{grid-template-columns:1fr 1fr}}
      @media(max-width:640px){.block-summary-grid{grid-template-columns:1fr}.block-tool-buttons .btn2,.block-tool-buttons .btn-sm,.block-action-stack .btn2,.block-action-stack .btn-good{width:100%;justify-content:center}}
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
      async function createBlock(button,url,options){
        saveFilters();
        const original=button.textContent;
        button.disabled=true;
        button.textContent='Adding…';
        try{
          const response=await fetch(url,options);
          if(!response.ok){
            const message=(await response.text()).trim();
            throw new Error(message||('Request failed ('+response.status+')'));
          }
          const result=await response.json();
          if(!result||!result.blockId) throw new Error('The block was created but its location was not returned.');
          location.assign('/portal/meet/'+encodeURIComponent(meetId)+'/blocks#block-'+encodeURIComponent(result.blockId));
        }catch(err){
          console.error(err);
          alert('Could not add this block. '+(err&&err.message?err.message:'Please try again.'));
          button.disabled=false;
          button.textContent=original;
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
