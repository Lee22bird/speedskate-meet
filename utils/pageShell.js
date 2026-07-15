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
// Redesigned for continuous reading during a live meet: the race title is the
// single most prominent thing on screen, and each lane is its own spaced-out
// card rather than a dense line of text. See utils/pageShell.js CSS above
// (".announcer-*" rules) for the typography/spacing this renders into.
function announcerBoxHtml(current,lanes) {
  if(!current) return `<div class="announcer-empty-state">No race selected.</div>`;

  const laneCards = lanes.filter(l=>l.skaterName).map(l=>{
    const details = [
      l.helmetNumber ? `Helmet #${esc(l.helmetNumber)}` : '',
      l.team ? esc(l.team) : '',
    ].filter(Boolean).join(' · ');
    return `
      <div class="announcer-lane-card">
        <div class="announcer-lane-number">${esc(l.lane)}</div>
        <div class="announcer-lane-info">
          <div class="announcer-lane-name">${esc(l.skaterName)}</div>
          ${details ? `<div class="announcer-lane-detail">${details}</div>` : ''}
          ${l.sponsor ? `<div class="announcer-lane-sponsor">Sponsored by ${esc(l.sponsor)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="announcer-hero">
      <div class="announcer-hero-label">Now Racing</div>
      <div class="announcer-hero-title">${esc(current.groupLabel)}</div>
      <div class="announcer-hero-meta">${esc(cap(current.division))} &nbsp;•&nbsp; ${esc(current.distanceLabel)} &nbsp;•&nbsp; ${esc(raceDisplayStage(current))}</div>
      <div class="announcer-hero-start">${esc(cap(current.startType))} Start</div>
    </div>
    <div class="announcer-lanes">
      <div class="announcer-lanes-heading">Lanes</div>
      <div class="announcer-lane-list">
        ${laneCards || `<div class="announcer-empty-state">No skaters entered yet.</div>`}
      </div>
    </div>`;
}

// ── Nav & Tabs ────────────────────────────────────────────────────────────────
function navHtml(user) {
  const accountLinks = user
    ? `<a class="nav-link nav-cta" href="/portal">Portal</a><a class="nav-link nav-ghost" href="/admin/logout">Logout</a>`
    : `<a class="nav-link nav-cta" href="/admin/login">Login</a>`;

  const mobileAccount = user
    ? `<a class="mobile-menu-primary" href="/portal">Portal</a><a href="/admin/logout">Logout</a>`
    : `<a class="mobile-menu-primary" href="/admin/login">Login</a>`;

  // Desktop app uses the square SSM app icon in the nav; the website keeps the wordmark.
  const navLogo = process.env.SSM_DESKTOP === '1' ? 'ssm-icon.png' : 'ssm-logo.png';

  return `
    <nav class="topnav">
      <div class="nav-inner">
        <button class="mobile-menu-toggle" type="button" aria-label="Open menu" aria-controls="mobileMenu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
        <a class="nav-brand" href="/">
          <img src="/public/images/branding/${navLogo}" alt="SpeedSkateMeet" class="nav-logo" />
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
          <a class="nav-link nav-download" href="/download">⬇ Download</a>
          ${accountLinks}
        </div>
        <div class="nav-mobile-account">${user ? `<a class="nav-mobile-portal" href="/portal">Portal</a>` : `<a class="nav-mobile-portal" href="/admin/login">Login</a>`}</div>
      </div>
      <div class="mobile-menu-panel" id="mobileMenu" aria-hidden="true">
        <div class="mobile-menu-section">
          <a href="/meets">Find a Meet</a>
          <a href="/live">Live Race Day</a>
          <a href="/rinks">Rinks</a>
          <a href="/help">Help</a>
          <a href="/about">About</a>
          <a href="/download">⬇ Download</a>
        </div>
        <div class="mobile-menu-divider"></div>
        <div class="mobile-menu-section">
          <a href="/submit-meet">Submit a Meet</a>
          <a href="/submit-rink">Submit a Rink</a>
        </div>
        <div class="mobile-menu-divider"></div>
        <div class="mobile-menu-section">
          ${mobileAccount}
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
    ['race-actions','Race Actions',`/portal/meet/${meet.id}/race-actions`],
    ['race-day','Race Day',`/portal/meet/${meet.id}/race-day/director`],
    ['results','Results',`/portal/meet/${meet.id}/results`],
  ];
  return `<div class="meet-tabs">${tabs.map(([key,label,href])=>`<a class="meet-tab${active===key?' active':''}" href="${href}">${label}</a>`).join('')}</div>`;
}

function raceDaySubTabs(meet,active) {
  return `<div class="sub-tabs">${[
    ['director','Director',`/portal/meet/${meet.id}/race-day/director`],
    ['judges','Tabulator',`/portal/meet/${meet.id}/race-day/judges`],
    ['announcer','Announcer',`/portal/meet/${meet.id}/race-day/announcer`],
    ['live','Referee',`/portal/meet/${meet.id}/race-day/live`],
  ].map(([k,label,href])=>`<a class="sub-tab ${active===k?'active':''}" href="${href}">${label}</a>`).join('')}</div>`;
}

function pageShell({ title, bodyHtml, user, meet, activeTab, description }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="SpeedSkateMeet" />
  <meta name="theme-color" content="#12284b" />
  <title>${esc(title)} — SpeedSkateMeet</title>
  <meta name="description" content="${esc(description||'SpeedSkateMeet — The all-in-one platform for inline speed skating meets. Registration, heat assignments, live scoring, text alerts, and results.')}" />
  <meta name="keywords" content="inline speed skating, speed skating meet, inline skating competition, race management, heat assignments, skating results" />
  <meta property="og:title" content="${esc(title)} — SpeedSkateMeet" />
  <meta property="og:description" content="${esc(description||'SpeedSkateMeet — The all-in-one platform for inline speed skating meets.')}" />
  <meta property="og:url" content="https://speedskatemeet.com" />
  <meta property="og:type" content="website" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="icon" href="/icons/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet" />
  <style>
    /* ── Design Tokens ────────────────────────────────────────────── */
    :root {
      --navy:    #13213a;
      --navy2:   #1b2c4a;
      --navy3:   #263c61;
      --orange:  #F97316;
      --orange2: #ea580c;
      --sky:     #38BDF8;
      --sky2:    #0ea5e9;
      --white:   #ffffff;
      --page:    #e8edf3;
      --off:     #eef2f6;
      --panel:   #f3f6f9;
      --card:    #f8fafc;
      --input:   #ffffff;
      --border:  rgba(19,33,58,.10);
      --border2: rgba(19,33,58,.16);
      --text:    #24324a;
      --muted:   #667085;
      --green:   #10b981;
      --red:     #ef4444;
      --yellow:  #f59e0b;
      --purple:  #7c3aed;
      --shadow-sm: 0 1px 2px rgba(19,33,58,.05), 0 1px 1px rgba(19,33,58,.04);
      --shadow:    0 4px 14px rgba(19,33,58,.07), 0 2px 4px rgba(19,33,58,.04);
      --shadow-lg: 0 10px 30px rgba(19,33,58,.10), 0 4px 10px rgba(19,33,58,.06);
      --radius-sm: 8px;
      --radius:    14px;
      --radius-lg: 20px;
    }

    /* ── Reset ────────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
      font-size: 15px; line-height: 1.65; color: var(--text);
      background: var(--page);
      min-height: 100vh;
    }
    a { color: var(--sky2); text-decoration: none; }
    a:hover { color: var(--orange); }

    /* ── Nav ──────────────────────────────────────────────────────── */
    .topnav {
      background: rgba(15,31,61,.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(249,115,22,.35);
      position: sticky; top: 0; z-index: 100;
      box-shadow: 0 2px 20px rgba(15,31,61,.30);
    }
    .nav-inner {
      max-width: 1340px; margin: 0 auto; padding: 0 20px;
      display: flex; align-items: center; justify-content: space-between; gap: 20px;
      height: 64px;
    }
    .nav-brand { display: flex; align-items: center; }
    .nav-logo { height: 44px; width: auto; display: block; }
    .nav-links { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
    .nav-link {
      padding: 8px 16px; border-radius: 999px; font-weight: 600; font-size: 14px;
      color: rgba(255,255,255,.80); transition: color .15s, background .15s;
      letter-spacing: .01em;
    }
    .nav-link:hover { color: #fff; background: rgba(255,255,255,.10); }
    .nav-cta {
      background: var(--orange); color: #fff; font-weight: 700;
      box-shadow: 0 2px 8px rgba(249,115,22,.40);
    }
    .nav-cta:hover { background: var(--orange2); color: #fff; }
    .nav-ghost { border: 1px solid rgba(255,255,255,.25); color: rgba(255,255,255,.70); border-radius: 999px; }
    .nav-ghost:hover { border-color: rgba(255,255,255,.50); color: #fff; background: rgba(255,255,255,.06); }
    .nav-download { border: 1px solid var(--orange); color: var(--orange) !important; border-radius: 999px; font-weight: 700; }
    .nav-download:hover { background: var(--orange); color: #fff !important; }

    .mobile-menu-toggle,
    .nav-mobile-account,
    .mobile-menu-panel { display: none; }
    .mobile-menu-toggle {
      width: 42px; height: 42px; border: 1px solid rgba(255,255,255,.22);
      border-radius: 12px; background: rgba(255,255,255,.08); cursor: pointer;
      align-items: center; justify-content: center; flex-direction: column; gap: 5px;
    }
    .mobile-menu-toggle span { width: 19px; height: 2px; border-radius: 999px; background: #fff; display: block; transition: transform .18s, opacity .18s; }
    .mobile-menu-toggle.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
    .mobile-menu-toggle.open span:nth-child(2) { opacity: 0; }
    .mobile-menu-toggle.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
    .nav-mobile-portal {
      display: inline-flex; align-items: center; justify-content: center; min-height: 38px;
      padding: 0 14px; border-radius: 999px; background: var(--orange); color: #fff;
      font-size: 13px; font-weight: 900; box-shadow: 0 2px 8px rgba(249,115,22,.35);
    }
    .nav-mobile-portal:hover { color: #fff; background: var(--orange2); }
    .mobile-menu-panel {
      border-top: 1px solid rgba(255,255,255,.10); background: rgba(15,31,61,.98);
      box-shadow: 0 18px 30px rgba(15,31,61,.32); padding: 12px 16px 16px;
    }
    .mobile-menu-panel.open { display: block; }
    .mobile-menu-section { display: grid; gap: 6px; }
    .mobile-menu-section a {
      display: flex; align-items: center; justify-content: space-between; min-height: 46px;
      padding: 0 14px; border-radius: 14px; color: rgba(255,255,255,.90); font-weight: 850;
      background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.075);
    }
    .mobile-menu-section a:hover { color: #fff; background: rgba(255,255,255,.11); }
    .mobile-menu-section a::after { content: '›'; opacity: .55; font-size: 18px; }
    .mobile-menu-section .mobile-menu-primary { background: var(--orange); border-color: rgba(249,115,22,.35); color: #fff; }
    .mobile-menu-divider { height: 1px; margin: 10px 2px; background: rgba(255,255,255,.12); }


    /* ── Layout ───────────────────────────────────────────────────── */
    .wrap { max-width: 1340px; margin: 0 auto; padding: 36px 20px 80px; }
    .page-header { margin-bottom: 28px; }
    .page-header h1 { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 42px; font-weight: 800; letter-spacing: -.04em; line-height: 1.08; color: var(--navy); }
    .page-header .sub { font-size: 16px; color: var(--muted); margin-top: 4px; }
    h1 { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 34px; font-weight: 800; letter-spacing: -.035em; color: var(--navy); margin-bottom: 8px; }
    h2 { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 24px; font-weight: 800; letter-spacing: -.03em; color: var(--navy); margin-bottom: 8px; }
    h3 { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 18px; font-weight: 750; color: var(--navy); margin-bottom: 6px; }
    p { margin-bottom: 12px; }

    /* ── Cards ────────────────────────────────────────────────────── */
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 28px;
    }
    .card-sm { padding: 14px; border-radius: var(--radius); }
    .card-accent { border-left: 4px solid var(--orange); }
    .card-sky   { border-left: 4px solid var(--sky); }
    .card-navy  { background: var(--navy); color: #fff; }
    .card-navy h2, .card-navy h3 { color: #fff; }

    /* ── Status cards ─────────────────────────────────────────────── */
    .stat-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
    @media(max-width:800px){.stat-grid{grid-template-columns:1fr;}}
    .stat-card {
      border-radius: var(--radius-lg); padding: 20px 22px; color: #fff;
      box-shadow: var(--shadow);
    }
    .stat-card.orange { background: linear-gradient(135deg, var(--orange2), var(--orange)); }
    .stat-card.sky    { background: linear-gradient(135deg, var(--sky2), var(--sky)); }
    .stat-card.navy   { background: linear-gradient(135deg, var(--navy2), var(--navy3)); }
    .stat-card.green  { background: linear-gradient(135deg, #059669, var(--green)); }
    .stat-card.yellow { background: linear-gradient(135deg, #d97706, var(--yellow)); }
    .stat-card.purple { background: linear-gradient(135deg, #6d28d9, var(--purple)); }
    .stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; opacity: .85; }
    .stat-value { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 28px; font-weight: 800; line-height: 1.1; margin-top: 4px; }
    .stat-sub   { font-size: 13px; opacity: .85; margin-top: 2px; }

    /* ── Buttons ──────────────────────────────────────────────────── */
    .btn, .btn2, .btn-danger, .btn-good, .btn-orange, .btn-purple, .btn-sky {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      border: 0; border-radius: var(--radius-sm); padding: 10px 18px;
      font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-weight: 700; font-size: 14px;
      cursor: pointer; transition: all .15s; white-space: nowrap; text-decoration: none;
    }
    .btn        { background: var(--navy);   color: #fff; box-shadow: var(--shadow-sm); }
    .btn:hover  { background: var(--navy2);  color: #fff; box-shadow: var(--shadow); transform: translateY(-1px); }
    .btn2       { background: var(--input); color: var(--navy); border: 1.5px solid var(--border2); box-shadow: var(--shadow-sm); }
    .btn2:hover { background: var(--off); color: var(--navy); box-shadow: var(--shadow); transform: translateY(-1px); }
    .btn-danger       { background: var(--input); color: var(--red); border: 1.5px solid #fca5a5; }
    .btn-danger:hover { background: #fef2f2; color: var(--red); }
    .btn-good         { background: var(--input); color: var(--green); border: 1.5px solid #6ee7b7; }
    .btn-good:hover   { background: #ecfdf5; color: var(--green); }
    .btn-orange       { background: var(--orange); color: #fff; box-shadow: 0 2px 8px rgba(249,115,22,.35); }
    .btn-orange:hover { background: var(--orange2); color: #fff; transform: translateY(-1px); }
    .btn-purple       { background: var(--purple); color: #fff; box-shadow: 0 2px 8px rgba(124,58,237,.35); }
    .btn-purple:hover { background: #6d28d9; color: #fff; transform: translateY(-1px); }
    .btn-sky          { background: var(--sky2); color: #fff; box-shadow: 0 2px 8px rgba(14,165,233,.35); }
    .btn-sky:hover    { background: var(--sky); color: #fff; transform: translateY(-1px); }
    .btn-sm { padding: 6px 11px; font-size: 13px; border-radius: 6px; }
    .action-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

    /* ── Meet Tabs ────────────────────────────────────────────────── */
    .meet-tabs {
      display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px;
      background: var(--navy); border-radius: var(--radius-lg);
      padding: 8px; box-shadow: var(--shadow);
    }
    .meet-tab {
      padding: 10px 16px; border-radius: var(--radius-sm);
      font-weight: 700; font-size: 13px; color: rgba(255,255,255,.65);
      transition: all .15s; white-space: nowrap;
    }
    .meet-tab:hover { color: #fff; background: rgba(255,255,255,.10); }
    .meet-tab.active { background: var(--orange); color: #fff; box-shadow: 0 2px 8px rgba(249,115,22,.40); }

    /* ── Sub-tabs ─────────────────────────────────────────────────── */
    .sub-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    .sub-tab { padding: 9px 16px; border-radius: var(--radius-sm); border: 1.5px solid var(--border2); font-weight: 700; font-size: 13px; color: var(--navy); background: #fff; }
    .sub-tab.active { background: var(--navy); color: #fff; border-color: var(--navy); }

    /* ── Forms ────────────────────────────────────────────────────── */
    label { display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin-bottom: 5px; }
    input[type=text], input[type=date], input[type=time], input[type=number], input[type=email], input[type=password], input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), select, textarea {
      width: 100%; padding: 10px 12px; border-radius: var(--radius-sm);
      border: 1.5px solid var(--border2); font-family: 'Barlow', sans-serif; font-size: 14px;
      color: var(--text); background: #fff; outline: none; transition: border-color .15s, box-shadow .15s;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--sky2); box-shadow: 0 0 0 3px rgba(56,189,248,.20); }
    textarea { min-height: 90px; resize: vertical; }
    .form-grid  { display: grid; gap: 14px; }
    .cols-2 { grid-template-columns: 1fr 1fr; }
    .cols-3 { grid-template-columns: 1fr 1fr 1fr; }
    .cols-4 { grid-template-columns: repeat(4,1fr); }
    .cols-5 { grid-template-columns: 1.25fr 1.25fr 1fr .85fr .85fr; }
    @media(max-width:1000px){ .cols-5,.cols-4,.cols-3 { grid-template-columns: 1fr 1fr; } }
    @media(max-width:700px) { .cols-2,.cols-3,.cols-4,.cols-5 { grid-template-columns: 1fr; } }
    .stack { display: flex; flex-direction: column; gap: 14px; }
    .row   { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .row.center  { align-items: center; }
    .row.between { justify-content: space-between; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    @media(max-width:860px) { .grid-2,.grid-3 { grid-template-columns: 1fr; } }

    /* ── Toggle Switches ──────────────────────────────────────────── */
    .toggle-wrap { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
    .toggle-input { position: absolute; opacity: 0; width: 0; height: 0; }
    .toggle-track {
      position: relative; width: 44px; height: 24px; border-radius: 999px;
      background: #cbd5e1; transition: background .2s; flex-shrink: 0;
    }
    .toggle-input:checked + .toggle-track { background: var(--orange); }
    .toggle-thumb {
      position: absolute; top: 3px; left: 3px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.20);
      transition: transform .2s;
    }
    .toggle-input:checked + .toggle-track .toggle-thumb { transform: translateX(20px); }
    .toggle-label { font-size: 14px; font-weight: 600; color: var(--text); text-transform: none; letter-spacing: 0; }
    .toggle-group { display: flex; flex-direction: column; gap: 6px; }
    .toggle-row   { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--off); border: 1px solid var(--border); }
    .toggle-row-label { font-weight: 700; font-size: 14px; color: var(--navy); }
    .toggle-row-desc  { font-size: 12px; color: var(--muted); margin-top: 1px; }

    /* ── Table ────────────────────────────────────────────────────── */
    .table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .table th { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 700; padding: 12px 14px; border-bottom: 1px solid rgba(15,31,61,.08); text-align: left; }
    .table td { padding: 13px 14px; border-bottom: 1px solid rgba(15,31,61,.05); vertical-align: top; }
    .table tr:last-child td { border-bottom: 0; }
    .table tr:hover td { background: rgba(15,31,61,.02); }

    /* ── Chips / Badges ───────────────────────────────────────────── */
    .chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; border: 1px solid rgba(15,31,61,.12); background: var(--input); color: var(--navy); white-space: nowrap; box-shadow: 0 1px 2px rgba(15,31,61,.05); letter-spacing:.01em; }
    .chip-orange { background: #fff7ed; border-color: #fed7aa; color: var(--orange2); }
    .chip-purple { background: #faf5ff; border-color: #d8b4fe; color: var(--purple); }
    .chip-sky    { background: #f0f9ff; border-color: #bae6fd; color: var(--sky2); }
    .chip-green  { background: #ecfdf5; border-color: #6ee7b7; color: #059669; }

    /* ── Builder Banners ──────────────────────────────────────────── */
    .builder-banner { border-radius: var(--radius-lg); padding: 20px 24px; margin-bottom: 18px; color: #fff; }
    .builder-banner.orange { background: linear-gradient(135deg, var(--orange2) 0%, var(--orange) 60%, #fb923c 100%); }
    .builder-banner.purple { background: linear-gradient(135deg, #6d28d9 0%, var(--purple) 60%, #8b5cf6 100%); }
    .builder-banner h2 { color: #fff; margin-bottom: 4px; }
    .builder-banner .sub { color: rgba(255,255,255,.85); font-size: 14px; }

    /* ── Group Cards ──────────────────────────────────────────────── */
    .group-card      { padding: 18px; border-radius: var(--radius); border: 1.5px solid var(--border2); background: #fff; }
    .open-group-card { padding: 18px; border-radius: var(--radius); border: 1.5px solid #fed7aa; background: #fffaf5; }
    .quad-group-card { padding: 18px; border-radius: var(--radius); border: 1.5px solid #d8b4fe; background: #faf5ff; }
    .group-pair-row  { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 8px; }
    @media(max-width: 900px) { .group-pair-row { grid-template-columns: 1fr; } }
    .group-pair-col  { background: #fff; border: 1.5px solid var(--border2); border-radius: var(--radius-lg); padding: 16px; }
    .group-pair-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid var(--border); }
    .group-pair-name { font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 700; color: var(--navy); }
    .group-pair-age  { font-size: 12px; color: var(--muted); font-weight: 600; }
    .group-div-card  { border: 1.5px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 8px; background: var(--off); }
    .group-div-card:last-child { margin-bottom: 0; }

    /* ── Block Builder ────────────────────────────────────────────── */
    .bb-grid { display: grid; grid-template-columns: 1.3fr .85fr; gap: 18px; align-items: start; }
    @media(max-width:1040px) { .bb-grid { grid-template-columns: 1fr; } }
    .bb-left { max-height: calc(100vh - 220px); overflow-y: auto; padding-right: 2px; }
    .bb-right { position: sticky; top: 90px; align-self: start; max-height: calc(100vh - 90px); }
    .bb-right .card { display: flex; flex-direction: column; min-height: 0; }
    .unassigned-panel { display: flex; flex-direction: column; min-height: 0; }
    .unassigned-list { overflow-y: auto; min-height: 0; max-height: calc(100vh - 240px); padding-right: 2px; }
    .bb-right .filters-row { position: sticky; top: 0; z-index: 1; background: #fff; margin-bottom: 8px; }
    .block-card { border: 1.5px solid var(--border2); background: #fff; border-radius: var(--radius-lg); padding: 16px; margin-bottom: 8px; }
    .block-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .divider-card { margin-bottom: 8px; }
    .divider-card-inner { display: flex; align-items: center; gap: 12px; background: var(--off); border: 1.5px dashed var(--border2); border-radius: var(--radius); padding: 12px 16px; flex-wrap: wrap; }
    .divider-icon { font-size: 22px; flex-shrink: 0; }
    .divider-info { flex: 1; min-width: 120px; }
    .divider-name { font-weight: 700; font-size: 15px; color: var(--muted); }
    .divider-day-sel { max-width: 100px; padding: 6px 8px; font-size: 13px; }
    .divider-notes-inp { padding: 6px 8px; font-size: 13px; border-radius: 6px; border: 1.5px solid var(--border2); }
    .divider-add-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 10px; background: var(--off); border-radius: var(--radius-sm); border: 1px solid var(--border); }
    .drop-zone { min-height: 48px; padding: 8px; border-radius: var(--radius); border: 2px dashed #cbd5e1; background: var(--off); transition: all .15s; }
    .drop-zone.over { border-color: var(--sky2); background: #f0f9ff; }
    .race-item { border: 1.5px solid var(--border); background: #fff; border-radius: var(--radius-sm); padding: 11px 13px; margin: 6px 0; cursor: grab; transition: box-shadow .15s, transform .15s; }
    .race-item:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
    .race-item.open-item  { border-color: #fed7aa; background: #fffaf5; }
    .race-item.tt-item    { border-color: #bae6fd; background: #f0f9ff; }
    .race-item.relay-item { border-color: #93c5fd; background: #eff6ff; }
    .race-item.quad-item  { border-color: #d8b4fe; background: #faf5ff; }
    .race-item.active-now { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(249,115,22,.15); }
    .race-label { font-weight: 700; font-size: 14px; color: var(--navy); }
    .race-meta  { font-size: 12px; color: var(--muted); margin-top: 2px; }

    /* ── Results ──────────────────────────────────────────────────── */
    .podium-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
    @media(max-width:700px){.podium-grid{grid-template-columns:1fr;}}
    .podium-card { border: 1.5px solid var(--border); border-radius: var(--radius); padding: 16px; background: #fff; }
    .podium-place { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 36px; font-weight: 800; color: var(--orange); line-height: 1; }
    .podium-name  { font-weight: 700; font-size: 17px; margin-top: 4px; color: var(--navy); }
    .podium-team  { font-size: 13px; color: var(--muted); }
    .podium-pts   { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 21px; font-weight: 700; color: var(--green); margin-top: 6px; }

    /* ── Scoring Audit (collapsible per-race breakdown on Results pages) ── */
    .audit-card { padding: 0; overflow: hidden; }
    .audit-card > summary {
      list-style: none; cursor: pointer; padding: 20px 24px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    }
    .audit-card > summary::-webkit-details-marker { display: none; }
    .audit-card > summary::before {
      content: '▶'; display: inline-block; margin-right: 10px; font-size: 12px; color: var(--muted);
      transition: transform .15s ease;
    }
    .audit-card[open] > summary::before { transform: rotate(90deg); }
    .audit-summary-title { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 22px; font-weight: 800; letter-spacing: -.02em; color: var(--navy); }
    .audit-body { padding: 0 24px 24px; }
    .audit-race { margin-bottom: 18px; }
    .audit-race:last-child { margin-bottom: 0; }
    .audit-race-title { font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 6px; }
    .audit-overall { margin-top: 6px; padding-top: 18px; border-top: 2px solid var(--border); }
    .audit-overall .audit-race-title { font-size: 18px; }
    .audit-heat { opacity: .85; }
    .audit-heat .audit-race-title { font-size: 14px; font-weight: 600; }
    .audit-heat-note { font-size: 12px; font-weight: 500; font-style: italic; color: var(--muted); text-transform: none; letter-spacing: 0; margin-left: 6px; }

    /* ── Announcer ────────────────────────────────────────────────────────
       Redesigned for continuous reading during an 8+ hour live meet: large
       Inter type throughout (no condensed/all-caps body text), generous
       spacing, and a wider stage on big announcer-table monitors. ────────── */
    .wrap:has(.announcer-view) { max-width: 1600px; }

    .announcer-view { display: flex; flex-direction: column; gap: 22px; }

    /* Current / In Staging / After That deck */
    .announcer-deck { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
    @media(max-width:900px){ .announcer-deck{ grid-template-columns:1fr; } }
    .announcer-deck-card {
      border-radius: var(--radius-lg); padding: 22px 24px; color: #fff;
      box-shadow: var(--shadow-lg);
    }
    .announcer-deck-card.is-current { background: linear-gradient(135deg, var(--orange2), var(--orange)); }
    .announcer-deck-card.is-next    { background: linear-gradient(135deg, #d97706, var(--yellow)); }
    .announcer-deck-card.is-after   { background: linear-gradient(135deg, var(--sky2), var(--sky)); }
    .announcer-deck-label {
      font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
      opacity: .92;
    }
    .announcer-deck-title {
      font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
      font-size: 26px; font-weight: 800; letter-spacing: -.01em; line-height: 1.25;
      margin-top: 8px; word-break: break-word;
    }
    .announcer-deck-meta { font-size: 15px; font-weight: 500; opacity: .92; margin-top: 6px; line-height: 1.4; }

    /* Now Racing hero — the most important thing on the screen */
    .announcer-hero {
      background: var(--navy); color: #fff; border-radius: var(--radius-lg);
      padding: 40px 44px; box-shadow: var(--shadow-lg);
    }
    .announcer-hero-label {
      font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em;
      color: var(--orange);
    }
    .announcer-hero-title {
      font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
      font-size: 56px; font-weight: 800; letter-spacing: -.02em; line-height: 1.12;
      margin-top: 10px;
    }
    .announcer-hero-meta {
      font-size: 24px; font-weight: 500; color: rgba(255,255,255,.88);
      margin-top: 12px; line-height: 1.5;
    }
    .announcer-hero-start {
      display: inline-flex; align-items: center; margin-top: 16px;
      font-size: 16px; font-weight: 700; color: var(--navy);
      background: var(--sky); border-radius: 999px; padding: 7px 18px;
    }

    /* Lane list */
    .announcer-lanes { display: flex; flex-direction: column; gap: 4px; }
    .announcer-lanes-heading {
      font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;
      color: var(--muted); margin: 4px 2px 4px;
    }
    .announcer-lane-list { display: flex; flex-direction: column; gap: 10px; }
    .announcer-lane-card {
      display: flex; align-items: flex-start; gap: 18px;
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 18px 22px;
      box-shadow: var(--shadow-sm);
    }
    .announcer-lane-card:nth-child(even) { background: var(--panel); }
    .announcer-lane-number {
      flex: 0 0 auto; width: 48px; height: 48px; border-radius: 50%;
      background: var(--navy); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 800; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
    }
    .announcer-lane-info { flex: 1 1 auto; min-width: 0; }
    .announcer-lane-name {
      font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
      font-size: 26px; font-weight: 700; letter-spacing: -.01em; color: var(--navy);
      line-height: 1.3;
    }
    .announcer-lane-detail { font-size: 17px; font-weight: 500; color: var(--muted); margin-top: 4px; }
    .announcer-lane-sponsor { font-size: 15px; font-weight: 600; color: var(--sky2); margin-top: 6px; }
    .announcer-empty-state {
      font-size: 17px; color: var(--muted); padding: 20px 4px;
    }

    /* Legacy class names kept so older saved/cached pages still render sanely. */
    .announcer-box { background: var(--navy); color: #fff; border-radius: var(--radius-lg); padding: 24px; }
    .announcer-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: var(--orange); }
    .announcer-group { font-size: 40px; font-weight: 800; line-height: 1.15; margin-top: 6px; }
    .announcer-meta  { font-size: 20px; opacity: .9; margin-top: 6px; }
    .announcer-start { font-size: 14px; opacity: .70; margin-top: 4px; }
    .announcer-divider { height: 1px; background: rgba(255,255,255,.15); margin: 16px 0; }
    .announcer-lanes-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--sky); margin-bottom: 8px; }
    .announcer-lane { padding: 10px 0; border-top: 1px solid rgba(255,255,255,.10); }
    .announcer-lane-team   { font-size: 14px; opacity: .85; }
    .announcer-empty { font-size: 15px; opacity: .6; padding-top: 10px; }

    /* ── Live board ──────────────────────────────────────────────────────
       Public page, mostly viewed on phones — mobile-first sizing, Inter
       instead of condensed type, and card rows instead of dense tables. ── */
    .live-hero { background: linear-gradient(135deg, var(--navy) 0%, var(--navy2) 100%); border-radius: var(--radius-lg); padding: 28px 26px; margin-bottom: 20px; color: #fff; box-shadow: 0 4px 20px rgba(15,31,61,.25); }
    .live-meet-name { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 30px; font-weight: 800; letter-spacing: -.015em; line-height: 1.15; }
    .live-hero-races { display: flex; gap: 20px; margin-top: 18px; flex-wrap: wrap; }
    @media(max-width:640px){ .live-hero-races{ flex-direction: column; gap: 16px; } .live-hero-divider{ display:none; } }
    .live-hero-divider { width: 1px; background: rgba(255,255,255,.15); }
    .live-race-label{ font-size: 13px; font-weight: 700; opacity: .75; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
    .live-race-name { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; }
    .live-race-meta { opacity: .8; font-size: 14px; font-weight: 500; margin-top: 4px; }

    .live-board-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 22px; }
    .live-board-card h2 { font-size: 21px; }

    .live-lane-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
    .live-lane-card {
      display: flex; align-items: center; gap: 14px;
      background: var(--panel); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 14px 16px;
    }
    .live-lane-card:nth-child(even) { background: var(--card); }
    .live-lane-number {
      flex: 0 0 auto; width: 38px; height: 38px; border-radius: 50%;
      background: var(--navy); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
    }
    .live-lane-info { flex: 1 1 auto; min-width: 0; }
    .live-lane-name { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 19px; font-weight: 700; color: var(--navy); line-height: 1.3; }
    .live-lane-detail { font-size: 14px; color: var(--muted); margin-top: 2px; }
    .live-lane-sponsor { font-size: 13px; font-weight: 600; color: var(--sky2); margin-top: 4px; }
    .live-lane-result { flex: 0 0 auto; text-align: right; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-size: 20px; font-weight: 700; color: var(--navy); }
    .live-lane-status { flex: 0 0 auto; font-size: 13px; font-weight: 700; color: var(--red); text-transform: uppercase; letter-spacing: .04em; }

    .live-results-race { margin-bottom: 18px; }
    .live-results-race-title { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-weight: 700; font-size: 16px; color: var(--navy); }
    .live-results-race-meta { font-size: 13px; color: var(--muted); margin-top: 1px; margin-bottom: 8px; }
    .live-results-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); }
    .live-results-row:last-child { border-bottom: 0; }
    .live-results-place { flex: 0 0 auto; width: 28px; font-weight: 700; color: var(--navy); font-size: 15px; }
    .live-results-name { flex: 1 1 auto; min-width: 0; font-weight: 600; font-size: 15px; color: var(--navy); }
    .live-results-team { flex: 0 0 auto; font-size: 13px; color: var(--muted); }

    /* Queue rows — "Coming Up" style lists, e.g. director race day */
    .queue-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
    .queue-row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); }
    .queue-row:nth-child(even) { background: var(--card); }
    .queue-num { flex: 0 0 auto; width: 30px; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-weight: 700; color: var(--muted); font-size: 15px; }
    .queue-info { flex: 1 1 auto; min-width: 0; }
    .queue-title { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; font-weight: 700; font-size: 17px; color: var(--navy); }
    .queue-meta { font-size: 14px; color: var(--muted); margin-top: 2px; }

    /* ── Homepage hero ────────────────────────────────────────────── */
    /* ── Home Hero ────────────────────────────────────────────────── */
    .home-hero {
      position: relative;
      overflow: hidden;
      border-radius: 28px;
      min-height: 295px;
      margin-bottom: 28px;
      background:
        radial-gradient(circle at 50% 0%, rgba(56,189,248,.12), transparent 35%),
        linear-gradient(135deg, var(--navy) 0%, var(--navy2) 54%, var(--navy) 100%);
      box-shadow: var(--shadow-lg);
      border: 1px solid rgba(255,255,255,.10);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .home-hero::after {
      content: "";
      position: absolute;
      left: 34px;
      right: 34px;
      bottom: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, var(--orange), var(--sky), transparent);
      opacity: .75;
    }
    .home-hero-bg,
    .home-hero-wash {
      display: none;
    }
    .home-hero-inner {
      position: relative;
      z-index: 1;
      width: min(1040px, 92%);
      text-align: center;
      padding: 18px 22px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .home-hero-logo {
      width: min(700px, 88vw);
      height: auto;
      display: block;
      margin: 0 auto 4px;
      filter: drop-shadow(0 14px 34px rgba(0,0,0,.55));
    }
    .home-hero-kicker {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,.20);
      background: rgba(255,255,255,.07);
      color: rgba(255,255,255,.82);
      border-radius: 999px;
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .12em;
      margin-bottom: 8px;
      backdrop-filter: blur(8px);
    }
    .home-hero-title {
      color: #fff;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: clamp(38px, 4.8vw, 62px);
      font-weight: 900;
      line-height: .96;
      letter-spacing: -.03em;
      margin: 0;
      text-shadow: 0 8px 24px rgba(0,0,0,.35);
    }
    .home-hero-copy {
      color: rgba(255,255,255,.82);
      font-size: clamp(15px, 1.6vw, 18px);
      line-height: 1.55;
      max-width: 780px;
      margin: 8px auto 0;
    }
    .home-hero-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-top: 14px;
    }
    .home-hero-actions .btn-orange,
    .home-hero-actions .btn2 {
      padding: 11px 21px;
      font-size: 15px;
      border-radius: 12px;
    }
    .home-hero-primary {
      box-shadow: 0 10px 28px rgba(249,115,22,.34);
    }
    .home-hero-pills {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-top: 12px;
    }
    .home-hero-pills span {
      color: rgba(255,255,255,.78);
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 999px;
      padding: 6px 11px;
      font-size: 12px;
      font-weight: 750;
    }
    @media(max-width:700px) {
      .home-hero { min-height: 330px; border-radius: 22px; }
      .home-hero-logo { width: min(560px, 92vw); }
      .home-hero-title { font-size: 38px; }
    }

    /* Legacy hero classes retained for older internal pages if referenced. */
    .hero {
      position: relative; border-radius: var(--radius-lg); overflow: hidden;
      min-height: 360px; display: flex; align-items: flex-end;
      background: var(--navy); margin-bottom: 28px; box-shadow: var(--shadow-lg);
    }
    .hero.hero-centered { min-height: 360px; height: 44vh; max-height: 460px; align-items: center; justify-content: center; padding: 0; }
    .hero-centered { align-items: center; justify-content: center; padding: 18px 20px !important; }
    .hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 35%; opacity: .40; }
    .hero-gradient { position: absolute; inset: 0; background: linear-gradient(to top, rgba(15,31,61,.95) 25%, rgba(15,31,61,.20) 100%); }
    .hero-content { position: relative; z-index: 1; padding: 36px; }
    .hero-content-centered { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 18px 20px 20px; text-align: center; width: 100%; }
    .hero-logo { height: 175px; width: auto; max-width: 78vw; object-fit: contain; display: block; filter: drop-shadow(0 8px 34px rgba(0,0,0,.65)); flex-shrink: 0; }
    .hero-eyebrow { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .15em; color: var(--orange); margin-bottom: 8px; }
    .hero-title { font-family: 'Barlow Condensed',sans-serif; font-size: 64px; font-weight: 900; line-height: .95; letter-spacing: -1px; color: #fff; }
    .hero-title span { color: var(--orange); }
    .hero-sub { font-size: 17px; color: rgba(255,255,255,.80); margin-top: 12px; max-width: 520px; }
    .hero-actions { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
    .hero-actions-centered { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; justify-content: center; }
    .btn-white { background: rgba(255,255,255,.15) !important; color: #fff !important; border-color: rgba(255,255,255,.35) !important; backdrop-filter: blur(4px); }
    .btn-white:hover { background: rgba(255,255,255,.25) !important; }

    /* ── Feature cards ────────────────────────────────────────────── */
    .feature-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 28px; }
    @media(max-width:900px){.feature-grid{grid-template-columns:1fr;}}
    .feature-card {
      border-radius: var(--radius-lg);
      overflow: hidden;
      position: relative;
      min-height: 240px;
      display: flex;
      align-items: flex-end;
      box-shadow: var(--shadow);
      background:
        radial-gradient(circle at 30% 0%, rgba(56,189,248,.13), transparent 38%),
        linear-gradient(135deg, var(--navy) 0%, var(--navy2) 58%, var(--navy) 100%);
      border: 1px solid rgba(255,255,255,.10);
    }
    .feature-card:nth-child(2) {
      background:
        radial-gradient(circle at 54% 0%, rgba(249,115,22,.14), transparent 34%),
        linear-gradient(135deg, var(--navy) 0%, var(--navy2) 58%, var(--navy) 100%);
    }
    .feature-card:nth-child(3) {
      background:
        radial-gradient(circle at 70% 0%, rgba(255,255,255,.13), transparent 34%),
        linear-gradient(135deg, var(--navy2) 0%, var(--navy) 62%, #0b1730 100%);
    }
    .feature-card::after {
      content: "";
      position: absolute;
      left: 18px;
      right: 18px;
      bottom: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--orange), var(--sky), transparent);
      opacity: .55;
    }
    .feature-card-link { display: flex; text-decoration: none; cursor: pointer; transition: transform .2s, box-shadow .2s, border-color .2s; }
    .feature-card-link:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); border-color: rgba(249,115,22,.28); }
    .feature-card-bg { display: none; }
    .feature-card-overlay {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 88% 16%, rgba(255,255,255,.08), transparent 26%),
        linear-gradient(180deg, rgba(255,255,255,.03), rgba(8,21,43,.22));
      transition: opacity .2s;
    }
    .feature-card-link:hover .feature-card-overlay { opacity: .72; }
    .feature-card-content { position: relative; z-index: 1; padding: 24px; color: #fff; width: 100%; }
    .feature-icon { width: 36px; height: 36px; margin-bottom: 8px; }
    .feature-icon-emoji { font-size: 32px; margin-bottom: 8px; line-height: 1; }
    .feature-title { font-family: 'Barlow Condensed',sans-serif; font-size: 24px; font-weight: 700; }
    .feature-desc  { font-size: 14px; opacity: .85; margin-top: 6px; line-height: 1.5; }
    .feature-cta   { font-size: 13px; font-weight: 700; color: var(--orange); margin-top: 12px; letter-spacing: .04em; }


    /* ── Meet setup cleanup ──────────────────────────────────────── */
    .builder-sticky-save { position: sticky; top: 64px; z-index: 90; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: -14px 0 18px; padding: 12px 16px; border: 1px solid rgba(15,31,61,.10); border-radius: var(--radius-lg); background: rgba(255,255,255,.94); box-shadow: var(--shadow); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
    .builder-sticky-info { min-width: 0; }
    .builder-sticky-label { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .10em; color: var(--muted); line-height: 1; }
    .builder-sticky-title { margin-top: 4px; color: var(--navy); font-size: 17px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .builder-sticky-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .builder-status-badge { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 12px; border-radius: 999px; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; border: 1px solid transparent; white-space: nowrap; }
    .builder-status-badge::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    .builder-status-badge.published { background: #ecfdf5; border-color: #6ee7b7; color: #059669; }
    .builder-status-badge.draft { background: #fff7ed; border-color: #fed7aa; color: var(--orange2); }
    .builder-publish-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--off); }
    .builder-publish-title { font-size: 14px; font-weight: 900; color: var(--navy); }
    .builder-publish-desc { margin-top: 2px; color: var(--muted); font-size: 12px; line-height: 1.45; max-width: 520px; }
    .builder-publish-toggle { margin-bottom: 0; }
    .setup-card { padding: 0; overflow: hidden; }
    .setup-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 24px; background: rgba(255,255,255,.96); border-bottom: 1px solid var(--border); }
    .setup-title { margin: 0; font-family: 'Barlow Condensed',sans-serif; font-size: 34px; font-weight: 900; color: var(--navy); line-height: 1; }
    .setup-sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
    .setup-body { padding: 22px 24px 24px; }
    .setup-sections { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
    .setup-section { border: 1.5px solid var(--border); border-radius: var(--radius-lg); background: #fff; padding: 18px; box-shadow: 0 1px 0 rgba(15,31,61,.03); }
    .setup-section-wide { grid-column: 1 / -1; }
    .setup-section-title { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-family: 'Barlow Condensed',sans-serif; font-size: 26px; font-weight: 900; color: var(--navy); }
    .setup-section-title small { font-family: inherit; font-size: 13px; font-weight: 700; color: var(--muted); letter-spacing: 0; }
    .setup-section-intro { color: var(--muted); font-size: 13px; line-height: 1.5; margin: 0 0 14px; max-width: 720px; }
    .setup-mini-card { border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--off); padding: 14px; margin-top: 12px; }
    .setup-mini-card:first-of-type { margin-top: 0; }
    .setup-mini-card-primary { background: #fff; border-color: var(--border2); }
    .setup-mini-title { margin: 0 0 10px; color: var(--navy); font-size: 14px; font-weight: 900; letter-spacing: .02em; }
    .setup-help-note { margin-top: 10px; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .setup-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
    .setup-fields.cols-3 { grid-template-columns: repeat(3,minmax(0,1fr)); }
    .setup-fields.cols-1 { grid-template-columns: 1fr; }
    .setup-field-full { grid-column: 1 / -1; }
    .date-clear-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: end; }
    .date-clear-btn { height: 44px; padding: 0 14px; border-radius: 12px; border: 1.5px solid var(--border); background: #f8fafc; color: var(--navy); font-weight: 800; cursor: pointer; }
    .date-clear-btn:hover { background: #fff7ed; border-color: rgba(249,115,22,.35); color: var(--orange); }
    .preset-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: end; }
    .preset-manage-row { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 8px; align-items: center; }
    .preset-manage-row select { min-width: 0; width: 100%; }
    .setup-warning-note { margin-top: 10px; padding: 10px 12px; border: 1px solid #fed7aa; border-radius: var(--radius-sm); background: #fff7ed; color: #9a3412; font-size: 12px; line-height: 1.45; font-weight: 650; }
    .meet-options-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; }
    .setup-notes-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-top: 12px; }
    .setup-card .toggle-row { border-radius: var(--radius-sm); padding: 13px 14px; }
    @media(max-width:1000px){
      .setup-sections { grid-template-columns: 1fr; }
      .meet-options-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
    }
    @media(max-width:700px){
      .builder-sticky-save { top: 64px; align-items: flex-start; flex-direction: column; margin-top: -22px; padding: 12px; border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
      .builder-sticky-actions { width: 100%; justify-content: space-between; }
      .builder-publish-card { align-items: flex-start; flex-direction: column; }
      .setup-head { align-items: flex-start; flex-direction: column; padding: 18px; }
      .setup-body { padding: 16px; }
      .setup-section { padding: 14px; }
      .setup-title { font-size: 30px; }
      .setup-section-title { font-size: 24px; }
      .setup-fields, .setup-fields.cols-3, .setup-notes-grid, .meet-options-grid { grid-template-columns: 1fr; }
      .preset-row, .preset-manage-row, .date-clear-row { grid-template-columns: 1fr; }
      .date-clear-btn { width: 100%; }
    }

    /* ── Misc helpers ─────────────────────────────────────────────── */
    .spacer    { height: 16px; }
    .spacer-sm { height: 8px; }
    .hr        { height: 1px; background: var(--border); margin: 16px 0; }
    .muted     { color: var(--muted); }
    .danger    { color: var(--red); font-weight: 700; }
    .good      { color: var(--green); font-weight: 700; }
    .note      { font-size: 12px; color: var(--muted); }
    .small     { font-size: 12px; }
    .sponsor-line { font-size: 12px; color: var(--sky2); margin-top: 2px; }
    .tb-badge { display:inline-block; font-size:10px; font-weight:700; padding:2px 6px; border-radius:999px; background:#fef9c3; color:#92400e; border:1px solid #fde68a; margin-left:5px; vertical-align:middle; }
    .tb-badge.tb-runoff { background:#fee2e2; color:#991b1b; border-color:#fca5a5; }
    .runoff-row td { background:#fff7ed; }
    .hidden    { display: none !important; }
    .text-orange { color: var(--orange); }
    .text-sky    { color: var(--sky2); }
    .text-navy   { color: var(--navy); }
    .bold { font-weight: 700; }
    .checkin-row {}
    .filters-row { display: grid; grid-template-columns: 1.2fr .8fr .8fr; gap: 10px; }
    @media(max-width:700px){.filters-row{grid-template-columns:1fr;}}
    .footer-note { font-size: 11px; color: var(--muted); margin-top: 60px; padding-top: 20px; border-top: 1px solid rgba(15,31,61,.08); text-align:center; letter-spacing:.03em; }
    .live-tabs { display:flex; gap:8px; margin-bottom:24px; flex-wrap:wrap; }
    .live-tab { padding:10px 22px; border-radius:999px; font-weight:700; font-size:14px; border:1.5px solid rgba(15,31,61,.15); color:var(--navy); background:#fff; text-decoration:none; letter-spacing:.01em; transition:all .15s; box-shadow:0 1px 3px rgba(15,31,61,.06); }
    .live-tab:hover { background:var(--off); color:var(--navy); transform:translateY(-1px); box-shadow:0 3px 8px rgba(15,31,61,.10); }
    .live-tab.active { background:var(--navy); color:#fff; border-color:var(--navy); box-shadow:0 2px 10px rgba(15,31,61,.25); }

    /* ── Calm operations theme overrides ───────────────────────────── */
    .wrap { background: transparent; }
    .page-header .sub, .note, .muted { color: var(--muted); }
    .subtle-section, .panel, .soft-panel { background: var(--panel); }
    input, select, textarea {
      background: var(--input);
      color: var(--text);
      border-color: var(--border2);
      box-shadow: inset 0 1px 1px rgba(19,33,58,.03);
    }
    input:focus, select:focus, textarea:focus {
      border-color: rgba(249,115,22,.55);
      box-shadow: 0 0 0 3px rgba(249,115,22,.12);
      outline: none;
    }
    label { color: #5c6880; font-weight: 700; }
    .toggle-row, .race-row, .registered-row, .result-row, .block-row {
      background: var(--panel);
      border-color: var(--border);
    }
    .meet-staff-list { display: grid; gap: 10px; margin-top: 10px; }
    .staff-assignment-grid { display: grid; gap: 12px; }
    .staff-assignment-row {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) minmax(260px, 1fr);
      gap: 12px;
      align-items: start;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel);
    }
    .staff-person { display: flex; gap: 10px; align-items: center; min-width: 0; }
    .staff-person.compact { margin-top: 8px; }
    .staff-person-body { min-width: 0; }
    .staff-name { font-weight: 850; color: var(--navy); overflow-wrap: anywhere; }
    .staff-meta { color: var(--muted); font-size: 12px; display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
    .staff-avatar {
      width: 46px;
      height: 46px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      overflow: hidden;
      background: linear-gradient(135deg, #0F1F3D, #0EA5E9);
      color: #fff;
      font-weight: 900;
      font-size: 14px;
    }
    .staff-avatar.small { width: 34px; height: 34px; font-size: 12px; }
    .staff-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .staff-role-badge {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(14,165,233,.1);
      color: var(--sky2);
      font-size: 11px;
      font-weight: 850;
    }
    .staff-picker { display: grid; gap: 8px; }
    .staff-search-results { display: grid; gap: 6px; }
    .staff-result-row { margin: 0; }
    .staff-result-button {
      width: 100%;
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #fff;
      color: var(--text);
      box-shadow: none;
      text-align: left;
    }
    .staff-result-button span { display: grid; min-width: 0; }
    .staff-result-button small { color: var(--muted); overflow-wrap: anywhere; }
    .staff-result-empty {
      padding: 10px 12px;
      border: 1px dashed var(--border);
      border-radius: 12px;
      color: var(--muted);
      background: rgba(255,255,255,.72);
      font-size: 13px;
    }
    .card .card, .inner-card { background: var(--panel); }
    table { background: var(--card); }
    th { background: var(--off); color: #5c6880; }
    td { border-color: var(--border); }

    /* ── Mobile app cleanup ───────────────────────────────────────── */
    @media(max-width: 760px) {
      body { font-size: 14px; line-height: 1.55; }
      .topnav { position: sticky; }
      .nav-inner { height: 58px; padding: 0 12px; gap: 10px; display: grid; grid-template-columns: 44px minmax(0,1fr) auto; }
      .mobile-menu-toggle { display: flex; }
      .nav-brand { justify-content: center; min-width: 0; }
      .nav-logo { height: 38px; max-width: 100%; object-fit: contain; }
      .nav-links { display: none; }
      .nav-mobile-account { display: block; }
      .wrap { padding: 18px 12px 54px; }
      .page-header { margin-bottom: 16px; }
      .page-header h1, h1 { font-size: 30px; line-height: 1.04; letter-spacing: -.045em; }
      .page-header .sub { font-size: 14px; line-height: 1.45; }
      h2 { font-size: 21px; }
      h3 { font-size: 16px; }
      .card { padding: 16px; border-radius: 18px; }
      .card-sm { padding: 12px; }
      .row { gap: 8px; }
      .row.between { align-items: flex-start; }
      .action-row { display: grid !important; grid-template-columns: 1fr; gap: 9px; width: 100%; }
      .action-row > * { width: 100%; justify-content: center; text-align: center; }
      .btn, .btn2, .btn-orange, .btn-danger, .btn-purple, .btn-sky, button, input[type="submit"] { min-height: 44px; width: 100%; justify-content: center; }
      .chip { white-space: normal; text-align: center; }
      .meet-tabs { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; padding: 8px; margin: -2px 0 16px; border-radius: 18px; background: rgba(255,255,255,.74); border: 1px solid var(--border); box-shadow: var(--shadow-sm); }
      .meet-tab { margin: 0; min-height: 42px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 8px 10px; border-radius: 12px; font-size: 12px; }
      .sub-tabs, .live-tabs { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
      .sub-tab, .live-tab { width: 100%; text-align: center; justify-content: center; }
      .home-hero { min-height: auto; padding: 22px 14px; border-radius: 20px; margin-bottom: 16px; }
      .home-hero-logo { width: min(340px, 88vw); margin-bottom: 6px; }
      .home-hero-title { font-size: 32px; line-height: 1.02; }
      .home-hero-sub { font-size: 14px; max-width: 320px; }
      .home-hero-actions { display: grid; grid-template-columns: 1fr; width: 100%; max-width: 320px; margin-left: auto; margin-right: auto; gap: 10px; }
      .home-hero-actions .btn-orange, .home-hero-actions .btn2 { width: 100%; min-height: 46px; display: flex; justify-content: center; }
      .home-hero-pills { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; max-width: 330px; margin-left: auto; margin-right: auto; }
      .home-hero-pills span { text-align: center; border-radius: 12px; padding: 8px 7px; }
      .feature-grid { grid-template-columns: 1fr; gap: 12px; }
      .feature-card { min-height: 170px; border-radius: 18px; }
      .feature-card-content { padding: 18px; }
      .feature-title { font-size: 22px; }
      .feature-desc { font-size: 13px; }
      .portal-meet-card .portal-card-head { display: grid; grid-template-columns: 1fr; gap: 10px; }
      .portal-meet-card .portal-chip-row { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; }
      .portal-meet-card .portal-mini-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
      .portal-meet-card .portal-mini-card { padding: 12px !important; }
      .staff-assignment-row { grid-template-columns: 1fr; }
      .staff-result-button { min-height: 54px; }
      table { display: block; overflow-x: auto; white-space: nowrap; }
      input, select, textarea { font-size: 16px; }
    }


  </style>
</head>
<body>
  ${navHtml(user)}
  <div class="wrap">
    ${meetTabs(meet, activeTab)}
    ${bodyHtml}
  </div>
  <script>
    (function(){
      var btn = document.querySelector('.mobile-menu-toggle');
      var panel = document.getElementById('mobileMenu');
      if(!btn || !panel) return;
      function closeMenu(){
        btn.classList.remove('open');
        panel.classList.remove('open');
        btn.setAttribute('aria-expanded','false');
        panel.setAttribute('aria-hidden','true');
      }
      btn.addEventListener('click', function(){
        var open = !panel.classList.contains('open');
        btn.classList.toggle('open', open);
        panel.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      });
      panel.addEventListener('click', function(e){ if(e.target && e.target.tagName === 'A') closeMenu(); });
      window.addEventListener('resize', function(){ if(window.innerWidth > 760) closeMenu(); });
      document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeMenu(); });
    })();
  </script>
</body>
</html>`;
}


module.exports = {
  pageShell,
  sponsorLineHtml,
  toggleSwitch,
  announcerBoxHtml,
  navHtml,
  meetTabs,
  raceDaySubTabs,
};
