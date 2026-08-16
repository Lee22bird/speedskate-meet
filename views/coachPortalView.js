const { esc, cap } = require('../utils/html');

function racingSoonLabel(delta) {
  if (delta <= 0) return 'NOW';
  if (delta === 1) return 'IN STAGING';
  if (delta === 2) return '2 RACES AWAY';
  if (delta === 3) return '3 RACES AWAY';
  return `${delta} RACES AWAY`;
}

// Tone per urgency — red for on the track, amber for staging, blue beyond that.
function soonTone(delta) {
  if (delta <= 0) return { bg: '#fef2f2', line: '#fca5a5', text: '#b42318' };
  if (delta === 1) return { bg: '#fff7ed', line: '#fed7aa', text: '#c2410c' };
  return { bg: '#f0f9ff', line: '#bae6fd', text: '#0369a1' };
}

// protests: optional [{ id, category, raceLabel, stateLabel, resolved }] for this
// coach. Passing nothing simply hides the panel, so this view is safe to ship
// before the protest feature exists.
function renderCoachPortalView({ user, meetCards = [], protests = [] }) {
  const teamName = user.team || 'Your Team';

  // Racing Soon is hoisted out of the meet cards — mid-meet it is the only thing
  // a coach is looking for, and it should not be buried under a card header.
  const soonRows = [];
  for (const { meet, upcoming = [] } of meetCards) {
    for (const item of upcoming.slice(0, 3)) {
      soonRows.push({ meet, item });
    }
  }

  const soonHtml = soonRows.length ? `
    <div class="cp-soon">
      <div class="cp-soon-head">
        <span class="cp-soon-dot"></span>
        <span class="cp-soon-title">Racing Soon</span>
        <span class="cp-soon-meta">${esc(soonRows[0].meet.meetName)}</span>
        <a class="cp-soon-link" href="/meet/${esc(soonRows[0].meet.id)}/live">Open live board →</a>
      </div>
      <div class="cp-soon-list">
        ${soonRows.map(({ item }) => {
          const t = soonTone(item.delta);
          return `
          <div class="cp-soon-row" style="border-left-color:${t.line}">
            <div class="cp-soon-who">
              <div class="cp-soon-names">${item.skaters.map(s => esc(s.skaterName)).join(', ')}</div>
              <div class="cp-soon-race">${esc(item.race.groupLabel)} • ${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)}</div>
            </div>
            <span class="cp-soon-pill" style="background:${t.bg};border-color:${t.line};color:${t.text}">${racingSoonLabel(item.delta)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const cards = meetCards.map(({ meet, upcoming = [], regs = [] }) => `
    <div class="cp-meet">
      <div class="cp-meet-head">
        <div>
          <div class="cp-meet-name">${esc(meet.meetName)}</div>
          <div class="cp-meet-meta">${esc(meet.date || '')}</div>
        </div>
        <div class="cp-meet-chips">
          <span class="chip">${regs.length} entered</span>
          ${upcoming.length ? `<span class="chip chip-orange">${upcoming.length} racing soon</span>` : ''}
        </div>
      </div>
      <div class="cp-meet-actions">
        <a class="cp-btn cp-btn-primary" href="/portal/meet/${esc(meet.id)}/coach">Coach Panel</a>
        <a class="cp-btn" href="/meet/${esc(meet.id)}/live">Live</a>
        <a class="cp-btn" href="/meet/${esc(meet.id)}/results">Results</a>
        <a class="cp-btn" href="/portal/meet/${esc(meet.id)}/coach/relays">Relay Teams</a>
        <a class="cp-btn cp-btn-protest" href="/portal/meet/${esc(meet.id)}/coach/protest">⚑ File a protest</a>
      </div>
    </div>`).join('');

  const protestHtml = protests.length ? `
    <div class="cp-card">
      <div class="cp-card-head">
        <span class="cp-card-title">My protests</span>
        <span class="cp-card-sub">Only you and the officials see these</span>
      </div>
      <div class="cp-protest-list">
        ${protests.map(p => `
          <div class="cp-protest">
            <span class="cp-protest-id">${esc(p.id)}</span>
            <span class="cp-protest-meta">${esc(p.category || '')}${p.raceLabel ? ' • ' + esc(p.raceLabel) : ''}</span>
            <span class="cp-protest-state ${p.resolved ? 'is-done' : 'is-wait'}">${esc(p.stateLabel || 'Awaiting review')}</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  return `
    <div class="page-header"><h1>Coach Portal</h1><div class="sub">${esc(teamName)}</div></div>

    ${soonHtml}
    ${cards || `<div class="card"><div class="muted">No meets found for ${esc(teamName)}.</div></div>`}

    <div class="cp-grid">
      ${protestHtml}
      <div class="cp-card">
        <div class="cp-card-head"><span class="cp-card-title">Team Roster</span></div>
        <div class="cp-card-body">
          <div class="cp-roster-note">Your roster carries across every meet. Helmet numbers are assigned at check-in, not here.</div>
          <a class="cp-btn cp-btn-orange" href="/portal/coach/roster">👥 Manage roster</a>
        </div>
      </div>
    </div>

    <div class="action-row" style="margin-top:16px">
      <a class="btn2" href="/admin/logout">Logout</a>
    </div>

    <style>
      /* ── Racing Soon ─────────────────────────────────────────────── */
      .cp-soon{
        background:linear-gradient(135deg,var(--navy,#13213a),var(--navy2,#1b2c4a));
        border-radius:22px; padding:18px 20px; margin-bottom:18px;
        box-shadow:0 10px 30px rgba(19,33,58,.16);
      }
      .cp-soon-head{ display:flex; align-items:center; gap:11px; flex-wrap:wrap; margin-bottom:14px; }
      .cp-soon-dot{ width:8px; height:8px; border-radius:50%; background:var(--orange,#F97316); }
      .cp-soon-title{
        font-size:12px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#fff;
      }
      .cp-soon-meta{ font-size:13px; font-weight:600; color:rgba(255,255,255,.68); }
      .cp-soon-link{
        margin-left:auto; font-size:12.5px; font-weight:800; color:var(--sky,#38BDF8); text-decoration:none;
      }
      .cp-soon-link:hover{ color:#fff; }
      .cp-soon-list{ display:flex; flex-direction:column; gap:9px; }
      .cp-soon-row{
        display:flex; align-items:center; gap:13px;
        padding:14px 16px; border-radius:16px;
        background:#fff; border:1px solid var(--border,rgba(19,33,58,.10));
        border-left:4px solid #bae6fd;
      }
      .cp-soon-who{ flex:1; min-width:0; }
      .cp-soon-names{ font-size:16px; font-weight:800; color:var(--navy,#13213a); }
      .cp-soon-race{ font-size:12.5px; font-weight:500; color:var(--muted,#667085); margin-top:2px; }
      .cp-soon-pill{
        flex:none; display:inline-flex; align-items:center;
        padding:6px 13px; border-radius:999px; border:1px solid;
        font-size:12px; font-weight:800; letter-spacing:.04em; white-space:nowrap;
      }

      /* ── Meet card ───────────────────────────────────────────────── */
      .cp-meet{
        background:#fff; border:1px solid var(--border,rgba(19,33,58,.10));
        border-radius:22px; box-shadow:var(--shadow-sm,0 1px 2px rgba(19,33,58,.05));
        overflow:hidden; margin-bottom:16px;
      }
      .cp-meet-head{
        display:flex; align-items:center; gap:12px; flex-wrap:wrap;
        padding:16px 20px; background:var(--card,#f8fafc);
        border-bottom:1px solid rgba(19,33,58,.08);
      }
      .cp-meet-name{ font-size:20px; font-weight:800; letter-spacing:-.02em; color:var(--navy,#13213a); }
      .cp-meet-meta{ font-size:12.5px; font-weight:500; color:#64748b; margin-top:2px; }
      .cp-meet-chips{ margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; }
      .cp-meet-actions{ padding:16px 20px; display:flex; gap:10px; flex-wrap:wrap; }

      .cp-btn{
        display:inline-flex; align-items:center; justify-content:center; gap:7px;
        min-height:48px; padding:0 18px; border-radius:13px;
        background:#fff; border:1.5px solid var(--border2,rgba(19,33,58,.16));
        color:var(--navy,#13213a); font-size:14px; font-weight:800;
        text-decoration:none; transition:all .15s;
      }
      .cp-btn:hover{ color:var(--navy,#13213a); background:var(--off,#eef2f6); transform:translateY(-1px); }
      .cp-btn-primary{ background:var(--navy,#13213a); border-color:var(--navy,#13213a); color:#fff; }
      .cp-btn-primary:hover{ background:var(--navy2,#1b2c4a); color:#fff; }
      .cp-btn-orange{
        background:var(--orange,#F97316); border-color:var(--orange,#F97316); color:#fff;
        box-shadow:0 4px 14px rgba(249,115,22,.32);
      }
      .cp-btn-orange:hover{ background:var(--orange2,#ea580c); color:#fff; }
      .cp-btn-protest{
        margin-left:auto;
        background:#fff7ed; border-color:#fdba74; color:#c2410c;
      }
      .cp-btn-protest:hover{ background:#ffedd5; color:#c2410c; }

      /* ── Lower grid ──────────────────────────────────────────────── */
      .cp-grid{ display:grid; grid-template-columns:1.25fr 1fr; gap:16px; }
      @media(max-width:860px){ .cp-grid{ grid-template-columns:1fr; } }
      .cp-card{
        background:#fff; border:1px solid var(--border,rgba(19,33,58,.10));
        border-radius:22px; padding:18px 20px;
      }
      .cp-card-head{ display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:13px; }
      .cp-card-title{ font-size:16px; font-weight:800; color:var(--navy,#13213a); }
      .cp-card-sub{ font-size:12.5px; font-weight:600; color:#64748b; }
      .cp-roster-note{ font-size:12.5px; line-height:1.5; color:#64748b; margin-bottom:14px; }

      .cp-protest-list{ display:flex; flex-direction:column; gap:9px; }
      .cp-protest{
        display:flex; align-items:center; gap:11px; flex-wrap:wrap;
        padding:12px 14px; border-radius:14px;
        background:#fff; border:1px solid var(--border,rgba(19,33,58,.10));
      }
      .cp-protest-id{ font-size:13.5px; font-weight:800; color:var(--navy,#13213a); }
      .cp-protest-meta{ font-size:12.5px; font-weight:600; color:#64748b; }
      .cp-protest-state{
        margin-left:auto; display:inline-flex; align-items:center;
        padding:5px 12px; border-radius:999px; font-size:12px; font-weight:800;
      }
      .cp-protest-state.is-wait{ background:#fff7ed; border:1px solid #fed7aa; color:#c2410c; }
      .cp-protest-state.is-done{ background:#f8fafc; border:1px solid #e2e8f0; color:#475569; }

      /* ── Phone ───────────────────────────────────────────────────── */
      @media(max-width:560px){
        .cp-soon{ padding:14px; border-radius:20px; }
        .cp-soon-row{ flex-direction:column; align-items:flex-start; gap:7px; }
        .cp-soon-pill{ order:-1; }
        .cp-meet-actions{ flex-direction:column; }
        .cp-meet-actions .cp-btn{ width:100%; min-height:52px; }
        .cp-btn-protest{ margin-left:0; }
      }
    </style>`;
}

module.exports = {
  renderCoachPortalView,
};
