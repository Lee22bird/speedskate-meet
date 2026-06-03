const { esc, cap } = require('./html');
const { raceDisplayStage } = require('../services/raceDay');

// ── Sponsor line ─────────────────────────────────────────────────────────────
function sponsorLineHtml(sponsor) {
  const s=String(sponsor||'').trim(); if(!s) return '';
  return `<div class="sponsor-line">Sponsored by ${esc(s)}</div>`;
}

// ── CSS toggle switch helper ─────────────────────────────────────────────────
function toggleSwitch(name, checked, label='', value='on') {
  return `
    <label class="toggle-wrap">
      <input type="checkbox" name="${esc(name)}" value="${esc(value)}" class="toggle-input" ${checked?'checked':''} />
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      ${label?`<span class="toggle-label">${esc(label)}</span>`:''}
    </label>`;
}

// ── Announcer box ────────────────────────────────────────────────────────────
function announcerBoxHtml(current,lanes) {
  if(!current) return `<div class="muted">No race selected.</div>`;
  const laneLines=lanes.filter(l=>l.skaterName).map(l=>`
    <div class="announcer-lane">
      <div class="announcer-lane-name">LANE ${esc(l.lane)} — ${l.helmetNumber?'#'+esc(l.helmetNumber)+' ':''}${esc(l.skaterName)}</div>
      <div class="announcer-lane-team">${esc(l.team||'')}</div>
      ${l.sponsor?`<div class="announcer-lane-sponsor">Sponsored by ${esc(l.sponsor)}</div>`:''
    }</div>`).join('');
  return `
    <div class="announcer-box">
      <div class="announcer-label">Now Racing</div>
      <div class="announcer-group">${esc(current.groupLabel)}</div>
      <div class="announcer-meta">${esc(cap(current.division))} • ${esc(current.distanceLabel)} • ${esc(raceDisplayStage(current))}</div>
      <div class="announcer-start">${esc(cap(current.startType))} Start</div>
      <div class="announcer-divider"></div>
      <div class="announcer-lanes-label">Lanes</div>
      ${laneLines||`<div class="announcer-empty">No skaters entered yet.</div>`}
    </div>`;
}

// ── Nav & Tabs ────────────────────────────────────────────────────────────────
function navHtml(user) {
  return `
    <nav class="topnav">
      <div class="nav-inner">
        <a class="nav-brand" href="/">
          <img src="/public/images/branding/ssm-logo.png" alt="SpeedSkateMeet" class="nav-logo" />
        </a>
        <div class="nav-links">
          <a class="nav-link" href="/">Home</a>
          <a class="nav-link" href="/meets">Find a Meet</a>
          <a class="nav-link" href="/about">About</a>
          <a class="nav-link" href="/help">Help</a>
          <a class="nav-link" href="/submit-meet">Submit a Meet</a>
          <a class="nav-link" href="/submit-rink">Submit a Rink</a>
          <a class="nav-link" href="/rinks">Rinks</a>
          <a class="nav-link" href="/live">Live</a>
          ${user
            ? `<a class="nav-link nav-cta" href="/portal">Portal</a><a class="nav-link nav-ghost" href="/admin/logout">Logout</a>`
            : `<a class="nav-link nav-cta" href="/admin/login">Login</a>`}
        </div>
      </div>
    </nav>`;
}

function meetTabs(meet, active) {
  if(!meet) return '';
  const tabs=[
    ['builder','Meet Builder',`/portal/meet/${meet.id}/builder`],
    ['open-builder','Open Builder',`/portal/meet/${meet.id}/open-builder`],
    ['quad-builder','Quad Builder',`/portal/meet/${meet.id}/quad-builder`],
    ['relay-builder','Relay Builder',`/portal/meet/${meet.id}/relay-builder`],
    ['blocks','Block Builder',`/portal/meet/${meet.id}/blocks`],
    ['registered','Registered',`/portal/meet/${meet.id}/registered`],
    ['checkin','Check-In',`/portal/meet/${meet.id}/checkin`],
    ['race-day','Race Day',`/portal/meet/${meet.id}/race-day/director`],
    ['results','Results',`/portal/meet/${meet.id}/results`],
  ];
  return `<div class="meet-tabs">${tabs.map(([key,label,href])=>`<a class="meet-tab${active===key?' active':''}" href="${href}">${label}</a>`).join('')}</div>`;
}

function raceDaySubTabs(meet,active) {
  return `<div class="sub-tabs">${[
    ['director','Director',`/portal/meet/${meet.id}/race-day/director`],
    ['judges','Judges',`/portal/meet/${meet.id}/race-day/judges`],
    ['announcer','Announcer',`/portal/meet/${meet.id}/race-day/announcer`],
    ['live','Live View',`/portal/meet/${meet.id}/race-day/live`],
  ].map(([k,label,href])=>`<a class="sub-tab ${active===k?'active':''}" href="${href}">${label}</a>`).join('')}</div>`;
}

module.exports = {
  sponsorLineHtml,
  toggleSwitch,
  announcerBoxHtml,
  navHtml,
  meetTabs,
  raceDaySubTabs,
};
