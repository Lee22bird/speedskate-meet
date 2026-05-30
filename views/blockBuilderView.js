const { esc, cap } = require('../utils/html');
const { raceDisplayStage } = require('../services/raceDay');

function renderBlockBuilderView({ meet }) {
  const raceById = new Map((meet.races || []).map(r => [r.id, r]));
  const assigned = new Set();
  for (const block of meet.blocks || []) {
    for (const rid of block.raceIds || []) assigned.add(rid);
  }

  const unassigned = (meet.races || []).filter(r => !assigned.has(r.id));
  const inlineRaceCount = (meet.races || []).filter(r => !r.isOpenRace && !r.isQuadRace && !r.isTimeTrial && !r.isRelayRace).length;
  const openRaceCount = (meet.races || []).filter(r => r.isOpenRace).length;
  const quadRaceCount = (meet.races || []).filter(r => r.isQuadRace).length;
  const timeTrialRaceCount = (meet.races || []).filter(r => r.isTimeTrial).length;
  const relayRaceCount = (meet.races || []).filter(r => r.isRelayRace).length;
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
        <div class="divider-card">
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
      <div class="block-card">
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
          ${(block.raceIds || []).map(rid => {
            const race = raceById.get(rid);
            if (!race) return '';
            return raceItemHtml(race, meet.currentRaceId === race.id, true);
          }).join('') || `<div class="note" style="padding:8px">Drop races here…</div>`}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="page-header">
      <h1>Block Builder</h1>
      <div class="sub">${esc(meet.meetName)} • ${esc(cap(meet.status || 'draft'))} • ${inlineRaceCount} Inline • ${openRaceCount} Open • ${quadRaceCount} Quad</div>
    </div>

    <div class="form-grid cols-3" style="align-items:stretch;margin-bottom:16px">
      <div class="card" style="margin:0">
        <h3 style="margin-bottom:12px">Race Summary</h3>
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px 18px;font-size:14px">
          <span class="note">Inline</span><strong>${inlineRaceCount}</strong>
          <span class="note">Open</span><strong>${openRaceCount}</strong>
          <span class="note">Quad</span><strong>${quadRaceCount}</strong>
          <span class="note">Time Trials</span><strong>${timeTrialRaceCount}</strong>
          <span class="note">Relays</span><strong>${relayRaceCount}</strong>
          <span class="note">Unassigned</span><strong id="unassignedChip">${unassigned.length}</strong>
        </div>
      </div>

      <div class="card" style="margin:0">
        <h3 style="margin-bottom:10px">Block Tools</h3>
        <p class="note" style="margin-bottom:12px">Build the race-day schedule structure, then drag races into each block.</p>
        <div class="action-row">
          <button class="btn2" onclick="addBlock()">+ Race Block</button>
          <button class="btn2 btn-sm" onclick="addDivider('break','☕ Break')">☕ Break</button>
          <button class="btn2 btn-sm" onclick="addDivider('lunch','🍽️ Lunch')">🍽️ Lunch</button>
          <button class="btn2 btn-sm" onclick="addDivider('awards','🏆 Awards')">🏆 Awards</button>
          <button class="btn2 btn-sm" onclick="addDivider('practice','⛸️ Practice')">⛸️ Practice</button>
        </div>
      </div>

      <div class="card" style="margin:0">
        <h3 style="margin-bottom:10px">Race Actions</h3>
        <div style="display:grid;gap:12px">
          <div>
            <form method="POST" action="/portal/meet/${meet.id}/assign-races?returnTo=blocks" onsubmit="return confirm('Rebuild recalculates heats, finals, race assignments, and lanes.\n\nYour manual block schedule is preserved.\n\nUse this after late registrations, scratches, division changes, challenge-up changes, or lane count changes.\n\nContinue?')"><button class="btn2" type="submit">🔄 Rebuild Races</button></form>
            <div class="note" style="margin-top:6px">Use after registrations, scratches, division changes, or lane updates.</div>
          </div>
          <div>
            <form method="POST" action="/portal/meet/${meet.id}/blocks/auto-flow" onsubmit="return confirm('Optimize Race Flow only reorders races already assigned inside each block.\n\nIt does NOT rebuild races, delete races, or move races between blocks.\n\nMoves heats earlier and finals later while balancing races within their assigned blocks.\n\nContinue?')"><button class="btn-good" type="submit">Optimize Race Flow</button></form>
            <div class="note" style="margin-top:6px">Moves heats earlier and finals later while balancing races within their assigned blocks.</div>
          </div>
          <a class="btn-orange" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>
    </div>
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
                ${unassigned.map(race => raceItemHtml(race, meet.currentRaceId === race.id)).join('') || `<div class="note" style="padding:8px">All races assigned.</div>`}
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
          const val=sessionStorage.getItem(scrollStorageKey());
          if(val!==null) left.scrollTop=parseInt(val,10)||0;
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
      async function addBlock(){saveFilters();const r=await fetch('/api/meet/'+meetId+'/blocks/add',{method:'POST'});if(r.ok) location.reload();}
      async function addDivider(type,name){saveFilters();const r=await fetch('/api/meet/'+meetId+'/blocks/add-divider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,name})});if(r.ok) location.reload();}
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
        document.getElementById('unassignedChip').textContent='Unassigned: '+v;
      }
      restoreFilters(); restoreBuilderScroll(); attachDnD(); applyFilters();
    </script>`;
}

module.exports = {
  renderBlockBuilderView,
};
