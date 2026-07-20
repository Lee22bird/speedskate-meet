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

  // ── R6: derive the day list from the meet's start/end dates ──
  // block.day stays a "Day N" string (other views/print pages read it as-is);
  // we only derive HOW MANY days exist and add real-date labels for display.
  function parseIsoDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  function buildMeetDays() {
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const start = parseIsoDate(meet.date);
    let end = parseIsoDate(meet.endDate) || start;
    let count = 3; // legacy fallback when the meet has no dates yet
    let dates = null;
    if (start) {
      if (end < start) end = start;
      count = Math.min(31, Math.round((end - start) / 86400000) + 1);
      dates = [];
      for (let i = 0; i < count; i++) dates.push(new Date(start.getTime() + i * 86400000));
    }
    // never drop a day an existing block already references
    for (const b of meet.blocks || []) {
      const m = /^Day (\d+)$/.exec(String(b.day || '').trim());
      if (m) count = Math.max(count, +m[1]);
    }
    const days = [];
    for (let i = 0; i < count; i++) {
      const value = 'Day ' + (i + 1);
      const d = dates && dates[i];
      days.push({ value, label: d ? value + ' — ' + DOW[d.getUTCDay()] + ' ' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() : value });
    }
    return days;
  }
  const meetDays = buildMeetDays();
  const dayLabelByValue = new Map(meetDays.map(d => [d.value, d.label]));
  const dayLabel = day => { const v = String(day || 'Day 1'); return dayLabelByValue.get(v) || v; };
  function dayOptionsHtml(current) {
    const cur = String(current || 'Day 1');
    const opts = meetDays.map(d => `<option value="${esc(d.value)}" ${cur === d.value ? 'selected' : ''}>${esc(d.label)}</option>`);
    // custom/legacy day string on this block — keep it selectable so nothing is lost
    if (!dayLabelByValue.has(cur)) opts.push(`<option value="${esc(cur)}" selected>${esc(cur)}</option>`);
    return opts.join('');
  }

  function raceItemHtml(race, isCurrent, draggable = true) {
    const tag = race.isTimeTrial ? '⏱ ' : race.isRelayRace ? '🔄 ' : race.isOpenRace ? '🏁 ' : race.isQuadRace ? '🛼 ' : (race.isAdditionalRace ? '➕ ' : '');
    const cls = race.isTimeTrial ? 'tt-item' : race.isRelayRace ? 'relay-item' : race.isOpenRace ? 'open-item' : race.isQuadRace ? 'quad-item' : (race.isAdditionalRace ? 'additional-item' : '');
    return `
      <div class="race-item ${isCurrent ? 'active-now' : ''} ${cls}" draggable="${draggable}"
        data-race-id="${esc(race.id)}"
        data-group-label="${esc(String(race.groupLabel || '').toLowerCase())}"
        data-division="${esc(race.division)}"
        data-distance-index="${esc(race.dayIndex)}">
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
        data-distance-index="tt">
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

  let prevDayKey = null;
  const blocksHtml = (meet.blocks || []).map(block => {
    const dayKey = String(block.day || 'Day 1');
    const dayHeader = dayKey !== prevDayKey
      ? `<div class="bb-day-header" data-day="${esc(dayKey)}">${esc(dayLabel(dayKey))}</div>`
      : '';
    prevDayKey = dayKey;
    const isBreak = breakTypes.includes(block.type || '');
    if (isBreak) {
      const icon = breakIcons[block.type] || '📌';
      return dayHeader + `
        <div class="divider-card" id="block-${esc(block.id)}" data-block-day="${esc(dayKey)}">
          <div class="divider-card-inner">
            <span class="block-drag-handle" draggable="true" data-drag-block="${esc(block.id)}" title="Drag to reorder">⠿</span>
            <div class="divider-icon">${icon}</div>
            <div class="divider-info">
              <div class="divider-name" data-role="block-name">${esc(block.name)}</div>
              <div class="note" data-role="divider-sub">${esc(dayLabel(block.day))}${block.notes ? ' • ' + esc(block.notes) : ''}</div>
            </div>
            <div class="action-row">
              <select class="divider-day-sel" onchange="setBlockDay('${esc(block.id)}',this.value)">
                ${dayOptionsHtml(block.day)}
              </select>
              <input class="divider-notes-inp" value="${esc(block.notes || '')}" placeholder="notes..." onblur="setBlockNotes('${esc(block.id)}',this.value)" style="max-width:140px" />
              <button class="btn2 btn-sm" onclick="renameBlock('${esc(block.id)}')">Rename</button>
              <button class="btn-danger btn-sm" onclick="deleteBlock('${esc(block.id)}')">Remove</button>
            </div>
          </div>
        </div>`;
    }

    const displayNum = blockNumber[block.id] || '';
    return dayHeader + `
      <div class="block-card" id="block-${esc(block.id)}" data-block-day="${esc(dayKey)}">
        <div class="block-head" style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="block-drag-handle" draggable="true" data-drag-block="${esc(block.id)}" title="Drag to reorder">⠿</span>
            <div>
            <div style="font-weight:700;font-size:17px;color:var(--navy)" data-role="block-num">Block ${displayNum}</div>
            <div class="note" data-role="block-day">${esc(dayLabel(block.day))}</div>
            </div>
          </div>
          <div class="action-row">
            <a class="btn2 btn-sm" href="/portal/meet/${meet.id}/score-sheets/print?scope=block&blockId=${esc(block.id)}" target="_blank">🖨 Score Sheets</a>
            <button class="btn2 btn-sm" onclick="moveBlockUp('${esc(block.id)}')">↑ Move Up</button>
            <button class="btn2 btn-sm" onclick="moveBlockDown('${esc(block.id)}')">↓ Move Down</button>
            <button class="btn2 btn-sm" onclick="renameBlock('${esc(block.id)}')">Rename</button>
            <button class="btn-danger btn-sm" onclick="deleteBlock('${esc(block.id)}')">Delete</button>
          </div>
        </div>
        <div class="form-grid cols-2" style="margin-bottom:12px">
          <div><label>Day</label>
            <select onchange="setBlockDay('${esc(block.id)}',this.value)">
              ${dayOptionsHtml(block.day)}
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
        <a class="btn2" href="/portal/meet/${meet.id}/score-sheets/print?scope=meet" target="_blank">🖨 Print All Score Sheets</a>
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
            <button class="schedule-add-card schedule-add-generate" type="button" onclick="generateSchedule(this)">
              <span class="schedule-add-icon">⚡</span><span><strong>Generate Schedule</strong><small>Auto-build the meet: each distance on its own day (Heats → Semis → Finals, youngest first), then relays, then quad. You can edit everything after.</small></span>
            </button>
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

        <section class="setup-mini-card block-control-mini">
          <div class="setup-mini-title">Race Actions</div>
          <div class="block-action-stack">
            <div class="note" style="margin-top:0">Rebuild Races and Optimize Race Flow now have their own tab.</div>
            <a class="btn2" href="/portal/meet/${meet.id}/race-actions">Open Race Actions →</a>
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
      .schedule-add-generate{grid-column:1/-1;min-height:88px;border-color:#12335c;background:linear-gradient(135deg,#eff6ff,#dbeafe);box-shadow:0 8px 18px rgba(18,51,92,.14);}
      .schedule-add-generate strong{font-size:16px;color:#12335c;}
      .schedule-add-generate .schedule-add-icon{background:#12335c;color:#fff;font-size:22px;}
      .block-tool-buttons button:disabled{opacity:.62;cursor:wait;transform:none;}
      .block-schedule-empty{min-height:310px;padding:42px 24px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border:2px dashed #bae6fd;border-radius:22px;background:linear-gradient(180deg,#f8fcff,#eff8ff);}
      .block-schedule-empty h2{margin:12px 0 6px;color:var(--navy);}
      .block-schedule-empty p{margin:0 0 18px;color:var(--muted);font-weight:650;}
      .block-empty-icon{width:58px;height:58px;display:grid;place-items:center;border-radius:18px;background:#e0f2fe;color:#0284c7;font-size:34px;font-weight:800;}
      .block-empty-action{justify-content:center;}
      .block-card:target,.divider-card:target{outline:3px solid rgba(56,189,248,.75);box-shadow:0 0 0 7px rgba(56,189,248,.14),var(--shadow-lg);animation:block-created-pulse .8s ease-out;}
      @keyframes block-created-pulse{from{transform:scale(.985);background:#e0f2fe}to{transform:scale(1)}}
      .block-action-stack{display:grid;gap:8px;}
      .bb-day-header{margin:4px 0 12px;padding:9px 16px;border-radius:13px;background:var(--navy,#12335c);color:#fff;font-weight:800;font-size:13px;letter-spacing:.06em;text-transform:uppercase;display:flex;align-items:center;gap:9px;box-shadow:0 3px 10px rgba(15,23,42,.14);}
      .bb-day-header:before{content:'📅';font-size:15px;}
      .bb-day-header+.block-card,.bb-day-header+.divider-card{margin-top:0;}
      .block-drag-handle{cursor:grab;user-select:none;color:#94a3b8;font-size:18px;line-height:1;padding:6px 4px;border-radius:8px;flex:0 0 auto;}
      .block-drag-handle:hover{color:var(--navy);background:#f1f5f9;}
      .block-drag-handle:active{cursor:grabbing;}
      .dragging-block{opacity:.45;}
      .block-drop-line{height:4px;border-radius:2px;background:#f97316;margin:6px 2px;box-shadow:0 0 0 2px rgba(249,115,22,.18);}
      .race-item.selected{outline:2px solid #f97316;outline-offset:-2px;background:#fff7ed;}
      .race-item.selected .race-label:before{content:'✓ ';color:#ea580c;font-weight:900;}
      .bulk-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 10px;border:1px solid #fdba74;border-radius:12px;background:#fff7ed;}
      .bulk-count{font-weight:800;color:#c2410c;font-size:13px;white-space:nowrap;}
      .bulk-bar select{flex:1;min-width:0;}
      .bulk-hint{margin:0 0 8px;font-size:12px;}
      .bulk-hint a{color:#0284c7;font-weight:700;}
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
              <div class="bulk-bar" id="bulkBar" style="display:none">
                <span class="bulk-count" id="bulkCount">0 selected</span>
                <select id="bulkDest" onchange="if(this.value){bulkSendTo(this.value);this.value='';}">
                  <option value="">Send to block…</option>
                </select>
                <button class="btn2 btn-sm" type="button" onclick="clearSelection()">Clear</button>
              </div>
              <div class="bulk-hint note">Click to select • Shift-click for a range • or <a href="#" onclick="selectVisible();return false">select all shown</a></div>
              <div class="filters-row">
                <div><label>Search</label><input id="raceSearch" placeholder="division..." oninput="applyFilters()" /></div>
                <div><label>Class</label>
                  <select id="classFilter" onchange="applyFilters()">
                    <option value="all">All</option><option value="novice">Novice</option>
                    <option value="elite">Elite</option><option value="open">Open</option><option value="quad">Quad</option><option value="additional">Additional</option>
                  </select>
                </div>
                <div><label>Distance</label>
                  <!-- R10: race.dayIndex is the division's distance ordinal (Distance 1–4),
                       NOT a meet day — legacy field name. This filter matches that ordinal. -->
                  <select id="distFilter" onchange="applyFilters()">
                    <option value="all">All</option><option value="1">Distance 1</option><option value="2">Distance 2</option>
                    <option value="3">Distance 3</option><option value="4">Distance 4</option>
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
      let dragRaceId=null; let dragBlockId=null; const meetId=${JSON.stringify(meet.id)};
      const dayLabels=${JSON.stringify(Object.fromEntries(meetDays.map(d => [d.value, d.label])))};
      function dayLabelJs(v){ return dayLabels[v]||v; }
      function refreshDayHeaders(){
        const left=document.querySelector('.bb-left');
        if(!left) return;
        left.querySelectorAll(':scope > .bb-day-header').forEach(h=>h.remove());
        let prev=null;
        left.querySelectorAll(':scope > .block-card, :scope > .divider-card').forEach(card=>{
          const day=card.getAttribute('data-block-day')||'Day 1';
          if(day!==prev){
            const h=document.createElement('div');
            h.className='bb-day-header'; h.setAttribute('data-day',day);
            h.textContent=dayLabelJs(day);
            left.insertBefore(h,card);
          }
          prev=day;
        });
      }
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
      // ── Optimistic-update helpers (R2: no full-page reloads) ──
      function resync(msg){ if(msg) alert(msg); location.reload(); }
      function findItem(raceId){
        return document.querySelector('.race-item[data-race-id="'+String(raceId).replace(/"/g,'')+'"]');
      }
      function refreshZonePlaceholders(){
        document.querySelectorAll('.drop-zone').forEach(zone=>{
          const isUnassigned=zone.getAttribute('data-drop-block')==='__unassigned__';
          const hasItems=!!zone.querySelector('.race-item');
          let ph=zone.querySelector(':scope > .note');
          if(hasItems){ if(ph) ph.remove(); return; }
          if(!ph){
            ph=document.createElement('div');
            ph.className='note'; ph.style.padding='8px';
            zone.appendChild(ph);
          }
          ph.textContent=isUnassigned?'All races assigned.':'Drop races here…';
        });
      }
      function renumberBlocks(){
        let n=0;
        document.querySelectorAll('.bb-left .block-card').forEach(card=>{
          const el=card.querySelector('[data-role="block-num"]');
          if(el) el.textContent='Block '+(++n);
        });
      }
      function placeItem(zone,item){
        zone.appendChild(item);
        if(zone.id!=='unassignedZone') item.classList.remove('hidden');
        refreshZonePlaceholders(); applyFilters();
      }
      function restoreItem(item,prevParent,prevNext){
        if(prevParent) prevParent.insertBefore(item,prevNext);
        if(item.parentElement&&item.parentElement.id!=='unassignedZone') item.classList.remove('hidden');
        refreshZonePlaceholders(); applyFilters();
      }
      function updateDividerSub(id){
        const card=document.getElementById('block-'+id);
        if(!card) return;
        const sub=card.querySelector('[data-role="divider-sub"]');
        if(!sub) return;
        const sel=card.querySelector('.divider-day-sel');
        const inp=card.querySelector('.divider-notes-inp');
        const day=sel?sel.value:'Day 1';
        const notes=inp?inp.value.trim():'';
        sub.textContent=dayLabelJs(day)+(notes?' • '+notes:'');
      }
      // ── R3: multi-select + bulk assignment (Unassigned panel) ──
      let lastClickedIndex=null;
      function visibleUnassigned(){ return Array.from(document.querySelectorAll('#unassignedZone .race-item:not(.hidden)')); }
      function selectedItems(){ return Array.from(document.querySelectorAll('#unassignedZone .race-item.selected')); }
      function updateBulkBar(){
        const bar=document.getElementById('bulkBar');
        if(!bar) return;
        const n=selectedItems().length;
        bar.style.display=n?'flex':'none';
        document.getElementById('bulkCount').textContent=n+' selected';
        if(n) rebuildBulkDest();
      }
      function rebuildBulkDest(){
        const sel=document.getElementById('bulkDest');
        if(!sel) return;
        sel.innerHTML='<option value="">Send to block…</option>';
        document.querySelectorAll('.bb-left .block-card').forEach(card=>{
          const num=card.querySelector('[data-role="block-num"]');
          const day=card.getAttribute('data-block-day')||'';
          const o=document.createElement('option');
          o.value=card.id.replace(/^block-/,'');
          o.textContent=(num?num.textContent:'Block')+' — '+dayLabelJs(day);
          sel.appendChild(o);
        });
      }
      function clearSelection(){ selectedItems().forEach(i=>i.classList.remove('selected')); updateBulkBar(); }
      function selectVisible(){ visibleUnassigned().forEach(i=>i.classList.add('selected')); updateBulkBar(); }
      function toggleSelect(item,shiftKey){
        const vis=visibleUnassigned();
        const idx=vis.indexOf(item);
        if(shiftKey&&lastClickedIndex!==null&&idx!==-1){
          const a=Math.min(lastClickedIndex,idx), b=Math.max(lastClickedIndex,idx);
          for(let i=a;i<=b;i++) if(vis[i]) vis[i].classList.add('selected');
        }else{
          item.classList.toggle('selected');
        }
        if(idx!==-1) lastClickedIndex=idx;
        updateBulkBar();
      }
      function attachBulkSelect(){
        const uz=document.getElementById('unassignedZone');
        if(!uz) return;
        uz.addEventListener('click',e=>{
          if(e.target.closest('a,button')) return; // e.g. "Open Time Trial" link
          const item=e.target.closest('.race-item');
          if(!item||!uz.contains(item)) return;
          toggleSelect(item,e.shiftKey);
        });
      }
      async function bulkMove(items,zone,destBlockId){
        const ids=items.map(i=>i.getAttribute('data-race-id'));
        saveFilters();
        items.forEach(i=>{
          i.classList.remove('selected');
          zone.appendChild(i);
          if(zone.id!=='unassignedZone') i.classList.remove('hidden');
        });
        refreshZonePlaceholders(); applyFilters(); updateBulkBar();
        try{
          const r=await fetch('/api/meet/'+meetId+'/blocks/move-races',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceIds:ids,destBlockId})});
          const j=r.ok?await r.json():null;
          if(!j||j.ok!==true) return resync('Bulk move failed.');
          if(j.skipped) resync(); // stale ids server-side — refresh to the saved truth
        }catch(err){console.error(err);resync('Bulk move failed.');}
      }
      function bulkSendTo(destBlockId){
        const items=selectedItems();
        const zone=document.querySelector('[data-drop-block="'+String(destBlockId).replace(/"/g,'')+'"]');
        if(!items.length||!zone) return;
        bulkMove(items,zone,destBlockId);
      }
      function attachDnD(){
        document.querySelectorAll('.race-item').forEach(el=>{
          if(el.getAttribute('draggable')!=='true') return;
          el.addEventListener('dragstart',e=>{dragRaceId=el.getAttribute('data-race-id');e.dataTransfer.setData('text/plain',dragRaceId);saveFilters();});
        });
        document.querySelectorAll('.drop-zone').forEach(zone=>{
          zone.addEventListener('dragover',e=>{if(dragBlockId) return;e.preventDefault();zone.classList.add('over');});
          zone.addEventListener('dragleave',()=>zone.classList.remove('over'));
          zone.addEventListener('drop',async e=>{
            if(dragBlockId) return; // a BLOCK is being dragged — let the schedule column handle it
            e.preventDefault();zone.classList.remove('over');
            const raceId=e.dataTransfer.getData('text/plain')||dragRaceId;
            const destBlockId=zone.getAttribute('data-drop-block');
            if(!raceId) return;
            const item=findItem(raceId);
            if(!item) return;
            // dragging a selected item drags the whole selection
            if(item.classList.contains('selected')){
              const bulk=selectedItems();
              if(bulk.length>1){
                if(bulk.every(i=>zone.contains(i))) return;
                return bulkMove(bulk,zone,destBlockId);
              }
            }
            if(zone===item.parentElement){ item.classList.remove('selected'); updateBulkBar(); return; }
            saveFilters();
            item.classList.remove('selected'); updateBulkBar();
            const prevParent=item.parentElement, prevNext=item.nextSibling;
            placeItem(zone,item); // optimistic: move in the DOM immediately
            try{
              const res=await fetch('/api/meet/'+meetId+'/blocks/move-race',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raceId,destBlockId})});
              if(!res.ok){
                restoreItem(item,prevParent,prevNext);
                const msg=(await res.text()).trim();
                alert('Move failed'+(msg?' — '+msg:''));
              }
            }catch(err){
              console.error(err);
              restoreItem(item,prevParent,prevNext);
              alert('Move failed — network error. Please try again.');
            }
          });
        });
      }
      // ── R4: drag blocks to reorder ──
      let blockDropLine=null;
      function blockOrderIds(){
        return Array.from(document.querySelectorAll('.bb-left > .block-card, .bb-left > .divider-card')).map(c=>c.id.replace(/^block-/,''));
      }
      function blockAfterPointer(left,y){
        const cards=Array.from(left.querySelectorAll(':scope > .block-card, :scope > .divider-card')).filter(c=>!c.classList.contains('dragging-block'));
        for(const c of cards){ const r=c.getBoundingClientRect(); if(y < r.top + r.height/2) return c; }
        return null; // past the last card — append at end
      }
      function showBlockDropLine(left,before){
        if(!blockDropLine){ blockDropLine=document.createElement('div'); blockDropLine.className='block-drop-line'; }
        if(before) left.insertBefore(blockDropLine,before); else left.appendChild(blockDropLine);
      }
      function clearBlockDropLine(){ if(blockDropLine&&blockDropLine.parentElement) blockDropLine.parentElement.removeChild(blockDropLine); }
      function attachBlockDnD(){
        document.querySelectorAll('.block-drag-handle').forEach(h=>{
          h.addEventListener('dragstart',e=>{
            dragBlockId=h.getAttribute('data-drag-block');
            e.dataTransfer.setData('text/ssm-block',dragBlockId);
            e.dataTransfer.effectAllowed='move';
            const card=document.getElementById('block-'+dragBlockId);
            if(card){ try{e.dataTransfer.setDragImage(card,24,24);}catch(err){} card.classList.add('dragging-block'); }
          });
          h.addEventListener('dragend',()=>{
            const card=dragBlockId&&document.getElementById('block-'+dragBlockId);
            if(card) card.classList.remove('dragging-block');
            dragBlockId=null; clearBlockDropLine();
          });
        });
        const left=document.querySelector('.bb-left');
        if(!left) return;
        left.addEventListener('dragover',e=>{
          if(!dragBlockId) return;
          e.preventDefault();
          showBlockDropLine(left,blockAfterPointer(left,e.clientY));
        });
        left.addEventListener('drop',async e=>{
          if(!dragBlockId) return;
          e.preventDefault();
          const id=dragBlockId; dragBlockId=null;
          const card=document.getElementById('block-'+id);
          const before=blockAfterPointer(left,e.clientY);
          clearBlockDropLine();
          if(card) card.classList.remove('dragging-block');
          if(!card||before===card) return;
          const prevOrder=blockOrderIds();
          if(before) left.insertBefore(card,before); else left.appendChild(card);
          renumberBlocks(); refreshDayHeaders(); // optimistic
          const order=blockOrderIds();
          if(order.join()===prevOrder.join()) return; // dropped back where it was
          saveFilters();
          try{
            const r=await fetch('/api/meet/'+meetId+'/blocks/reorder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order})});
            const j=r.ok?await r.json():null;
            if(!j||j.ok!==true) resync('Reorder failed.');
          }catch(err){console.error(err);resync('Reorder failed.');}
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
      // R1: Generate Schedule. Replace requires explicit confirmation when any
      // races are already assigned (server enforces via 409 needsConfirm); the
      // fallback offer generates blocks for unassigned races only (append).
      async function generateSchedule(button){
        if(blockCreatePending) return;
        saveFilters();
        const post=body=>fetch('/api/meet/'+meetId+'/blocks/generate-schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        button.disabled=true;
        try{
          let r=await post({mode:'replace'});
          if(r.status===409){
            const j=await r.json().catch(()=>({}));
            const n=j&&j.assignedCount?j.assignedCount:'some';
            if(confirm('Your schedule already has '+n+' assigned race(s).\\n\\nOK — REPLACE the entire schedule with a freshly generated one.\\nCancel — keep your current schedule.')){
              r=await post({mode:'replace',confirmReplace:true});
            }else if(confirm('Keep your current schedule and generate blocks for the UNASSIGNED races only?')){
              r=await post({mode:'append'});
            }else{
              return;
            }
          }
          if(!r.ok){
            const msg=(await r.text()).trim();
            alert('Generate failed'+(msg?' — '+msg:'.'));
            return;
          }
          location.replace('/portal/meet/'+encodeURIComponent(meetId)+'/blocks?generated=1');
        }catch(err){
          console.error(err);
          alert('Generate failed — network error.');
        }finally{
          button.disabled=false;
        }
      }
      function addBlock(button){
        return createBlock(button,'/api/meet/'+meetId+'/blocks/add',{method:'POST'});
      }
      function addDivider(button,type,name){
        return createBlock(button,'/api/meet/'+meetId+'/blocks/add-divider',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,name})});
      }
      async function renameBlock(id){
        const name=prompt('Name:');if(!name) return;saveFilters();
        try{
          const r=await fetch('/api/meet/'+meetId+'/blocks/update-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,name})});
          if(!r.ok) return resync('Rename failed.');
          const card=document.getElementById('block-'+id);
          const el=card&&card.querySelector('[data-role="block-name"]');
          if(el) el.textContent=name;
        }catch(err){console.error(err);resync('Rename failed.');}
      }
      async function deleteBlock(id){
        if(!confirm('Remove this?')) return;saveFilters();
        try{
          const r=await fetch('/api/meet/'+meetId+'/blocks/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id})});
          if(!r.ok) return resync('Delete failed.');
          const card=document.getElementById('block-'+id);
          if(card){
            const uz=document.getElementById('unassignedZone');
            if(uz) card.querySelectorAll('.race-item').forEach(el=>uz.appendChild(el));
            card.remove();
          }
          // Server may auto-create a block (ensureAtLeastOneBlock) or we hit the
          // empty state — reload once to pick up the server-rendered result.
          if(!document.querySelector('.bb-left .block-card, .bb-left .divider-card')) return location.reload();
          renumberBlocks(); refreshDayHeaders(); refreshZonePlaceholders(); applyFilters();
        }catch(err){console.error(err);resync('Delete failed.');}
      }
      async function moveBlock(id,dir){
        saveFilters();
        const card=document.getElementById('block-'+id);
        if(!card) return;
        const parent=card.parentElement;
        // siblings are cards AND day headers — swap against cards only
        const cards=Array.from(parent.querySelectorAll(':scope > .block-card, :scope > .divider-card'));
        const i=cards.indexOf(card);
        const j=dir==='up'?i-1:i+1;
        if(i<0||j<0||j>=cards.length) return; // already at the edge — nothing to do
        const other=cards[j];
        if(dir==='up') parent.insertBefore(card,other); else parent.insertBefore(other,card);
        renumberBlocks(); refreshDayHeaders(); // optimistic: swap in the DOM immediately
        try{
          const r=await fetch('/api/meet/'+meetId+'/blocks/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,dir})});
          const j=r.ok?await r.json():null;
          if(!j||j.ok!==true) resync('Move failed.');
        }catch(err){console.error(err);resync('Move failed.');}
      }
      function moveBlockUp(id){ return moveBlock(id,'up'); }
      function moveBlockDown(id){ return moveBlock(id,'down'); }
      async function setBlockDay(id,day){
        saveFilters();
        const card=document.getElementById('block-'+id);
        if(card) card.setAttribute('data-block-day',day);
        const el=card&&card.querySelector('[data-role="block-day"]');
        if(el) el.textContent=dayLabelJs(day);
        updateDividerSub(id);
        refreshDayHeaders();
        try{
          const r=await fetch('/api/meet/'+meetId+'/blocks/update-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,day})});
          if(!r.ok) resync('Saving the day failed.');
        }catch(err){console.error(err);resync('Saving the day failed.');}
      }
      async function setBlockNotes(id,notes){
        saveFilters();
        updateDividerSub(id);
        try{
          const r=await fetch('/api/meet/'+meetId+'/blocks/update-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({blockId:id,notes})});
          if(!r.ok) resync('Saving notes failed.');
        }catch(err){console.error(err);resync('Saving notes failed.');}
      }
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
          const mD=dist==='all'||item.getAttribute('data-distance-index')===dist;
          const show=mS&&mC&&mD; item.classList.toggle('hidden',!show); if(show) v++;
        }
        document.getElementById('unassignedChip').textContent=String(v);
      }
      restoreFilters(); restoreBuilderScroll(); attachDnD(); attachBlockDnD(); attachBulkSelect(); applyFilters();
    </script>`;
}

module.exports = {
  renderBlockBuilderView,
};
