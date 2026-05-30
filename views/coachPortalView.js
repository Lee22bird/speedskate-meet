const { esc, cap } = require('../utils/html');

function racingSoonLabel(delta) {
  if (delta <= 0) return 'NOW';
  if (delta === 1) return 'IN STAGING';
  if (delta === 2) return '2 RACES AWAY';
  if (delta === 3) return '3 RACES AWAY';
  return `${delta} RACES AWAY`;
}

function renderCoachPortalView({ user, meetCards = [] }) {
  const cards = meetCards.map(({ meet, upcoming = [], regs = [] }) => `
      <div class="card" style="margin-bottom:14px">
        <div class="row between" style="margin-bottom:12px">
          <div>
            <h2 style="margin:0">${esc(meet.meetName)}</h2>
            <div class="muted">${esc(user.team || '')} • ${esc(meet.date || '')}</div>
          </div>
          <div class="row"><span class="chip">Skaters: ${regs.length}</span><span class="chip chip-orange">Racing Soon: ${upcoming.length}</span></div>
        </div>
        <div class="action-row" style="margin-bottom:${upcoming.length ? '12px' : '0'}">
          <a class="btn" href="/portal/meet/${meet.id}/coach">Coach Panel</a>
          <a class="btn2" href="/meet/${meet.id}/live">Live</a>
          <a class="btn2" href="/meet/${meet.id}/results">Results</a>
        </div>
        ${upcoming.length ? `<div class="hr"></div><h3>Racing Soon</h3><div class="stack">${upcoming.slice(0, 2).map(item => `
          <div class="group-card">
            <div class="bold">${item.skaters.map(s => esc(s.skaterName)).join(', ')}</div>
            <div class="muted">${esc(item.race.groupLabel)} • ${esc(cap(item.race.division))} • ${esc(item.race.distanceLabel)}</div>
            <div class="good">${esc(racingSoonLabel(item.delta))}</div>
          </div>`).join('')}</div>` : ''}
      </div>`).join('');

  return `
    <div class="page-header"><h1>Coach Portal</h1><div class="sub">${esc(user.team || 'Your Team')}</div></div>
    <div class="action-row" style="margin-bottom:16px">
      <a class="btn-orange" href="/portal/coach/roster">👥 Team Roster</a>
      <a class="btn2" href="/admin/logout">Logout</a>
    </div>
    ${cards || `<div class="card"><div class="muted">No meets found for ${esc(user.team || 'your team')}.</div></div>`}`;
}

module.exports = {
  renderCoachPortalView,
};
