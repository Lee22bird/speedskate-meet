const { esc, cap } = require('../utils/html');
const { currentRaceInfo, laneRowsForRace, raceDisplayStage } = require('../services/raceDay');
const { isPublicMeet, meetRinkLabel, meetDateLabel } = require('../services/meetHelpers');

// ── Is this meet actually running right now? ─────────────────────────────────
// currentRaceInfo() falls back to index 0, and a freshly built race's status is
// already 'open' — so `info.current.status === 'open'` alone marks every meet
// with races as live. The date gate is what keeps the hero honest: either the
// director explicitly set status 'live', or today falls inside the meet's own
// date range AND a race is open.
function todayIso() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function meetIsToday(meet) {
  const start = String(meet?.date || '').slice(0, 10);
  if (!start) return false;
  const end = String(meet?.endDate || '').slice(0, 10) || start;
  const t = todayIso();
  return t >= start && t <= end;
}

function liveMeetsFrom(db) {
  return (db.meets || [])
    .filter(isPublicMeet)
    .map(meet => {
      const info = currentRaceInfo(meet);
      const explicit = String(meet.status || '').toLowerCase() === 'live';
      const running = !!(info.current && String(info.current.status || '').toLowerCase() === 'open');
      if (!explicit && !(running && meetIsToday(meet))) return null;
      return { meet, info };
    })
    .filter(Boolean);
}

function upcomingMeetsFrom(db) {
  const t = todayIso();
  return (db.meets || [])
    .filter(isPublicMeet)
    .filter(m => String(m.date || '').slice(0, 10) >= t)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

function skaterCount(meet) {
  return (meet.registrations || []).length;
}

function teamCount(meet) {
  return new Set((meet.registrations || []).map(r => String(r.team || '').trim()).filter(Boolean)).size;
}

function raceHeadline(item) {
  if (!item) return '';
  const div = cap(String(item.division || '').replace(/_/g, ' '));
  return `${div} ${item.distanceLabel || ''}`.trim();
}

// ── Fragments ────────────────────────────────────────────────────────────────

function doorsHtml(portalLink) {
  const doors = [
    { href: '/meets', icon: '📍', label: 'Skaters &amp; families', sub: 'Find a meet, register, follow it live' },
    { href: '/portal', icon: '📋', label: 'Coaches', sub: 'Roster, relays, and what races next' },
    { href: portalLink, icon: '🏁', label: 'Meet directors', sub: 'Build races, run race day, post results' },
  ];
  return `<div class="hm-doors">${doors.map(d => `
    <a class="hm-door" href="${d.href}">
      <span class="hm-door-icon">${d.icon}</span>
      <span class="hm-door-text">
        <span class="hm-door-label">${d.label}</span>
        <span class="hm-door-sub">${d.sub}</span>
      </span>
    </a>`).join('')}</div>`;
}

function pitchHtml(upcoming, rinkCount) {
  const bits = [];
  if (upcoming.length) bits.push(`<span class="hm-fact"><b>${upcoming.length}</b> upcoming ${upcoming.length === 1 ? 'meet' : 'meets'} listed</span>`);
  if (rinkCount) bits.push(`<span class="hm-fact"><b>${rinkCount}</b> ${rinkCount === 1 ? 'rink' : 'rinks'} in the directory</span>`);
  return `
    <div class="hm-pitch">
      ${bits.length ? `<div class="hm-facts">${bits.join('')}</div>` : ''}
      <div class="hm-pitch-card">
        <div class="hm-pitch-copy">
          <div class="hm-pitch-title">Running a meet this season?</div>
          <div class="hm-pitch-sub">Registration, race builders, block scheduling, check-in, live results and standings — built for inline speed skating, and it runs offline at the rink.</div>
        </div>
        <a class="hm-btn hm-btn-orange" href="/submit-meet">Start a meet</a>
      </div>
    </div>`;
}

// One live meet — the meet is the hero.
function singleLiveHtml(db, { meet, info }) {
  const current = info.current;
  const lanes = current ? laneRowsForRace(current, meet).filter(l => l.skaterName).slice(0, 8) : [];
  const skaters = skaterCount(meet);
  const teams = teamCount(meet);
  return `
  <section class="hm-hero hm-hero-live">
    <div class="hm-live-main">
      <span class="hm-live-badge"><i></i>LIVE NOW</span>
      <div class="hm-live-meet">${esc([meet.meetName || '', meetRinkLabel(db, meet)].filter(Boolean).join(' · '))}</div>
      <h1 class="hm-live-race">${esc(raceHeadline(current) || meet.meetName || '')}${current && raceDisplayStage(current) ? `<span class="hm-live-stage">${esc(raceDisplayStage(current))}</span>` : ''}</h1>
      <div class="hm-live-meta">
        ${current ? `<b>Race ${Math.max(info.idx + 1, 1)} of ${info.ordered.length}</b>` : ''}
        ${skaters ? `<span>${skaters} skaters</span>` : ''}
        ${teams ? `<span>${teams} teams</span>` : ''}
      </div>
      <div class="hm-live-actions">
        <a class="hm-btn hm-btn-orange hm-btn-lg" href="/meet/${meet.id}/live">Watch this meet →</a>
        <a class="hm-btn hm-btn-ghost hm-btn-lg" href="/meets">Find a meet near me</a>
      </div>
    </div>
    <aside class="hm-track">
      <div class="hm-track-head"><span>On the track</span><em>updates live</em></div>
      ${lanes.length ? `<ol class="hm-lanes">${lanes.map(l => `
        <li class="hm-lane">
          <span class="hm-lane-n">L${l.lane}</span>
          ${l.helmetNumber ? `<span class="hm-helmet">${esc(String(l.helmetNumber))}</span>` : '<span class="hm-helmet hm-helmet-blank">—</span>'}
          <span class="hm-lane-who"><b>${esc(l.skaterName)}</b>${l.team ? `<em>${esc(l.team)}</em>` : ''}</span>
        </li>`).join('')}</ol>` : '<div class="hm-track-empty">Lanes post as the race is staged.</div>'}
      ${info.next ? `<div class="hm-next">Next up — ${esc(raceHeadline(info.next))}</div>` : ''}
    </aside>
  </section>`;
}

// Several live at once — stop making a parent guess which one is theirs.
function multiLiveHtml(db, live) {
  return `
  <section class="hm-multi">
    <div class="hm-multi-head">
      <span class="hm-live-badge"><i></i>${live.length} MEETS LIVE NOW</span>
      <span class="hm-multi-sub">Pick the meet your skater is at</span>
    </div>
    <div class="hm-multi-grid">
      ${live.map(({ meet, info }) => {
        const venue = meetRinkLabel(db, meet);
        return `
        <a class="hm-live-card" href="/meet/${meet.id}/live">
          <div class="hm-live-card-meet">${esc(meet.meetName || '')}</div>
          ${venue ? `<div class="hm-live-card-venue">${esc(venue)}</div>` : ''}
          <div class="hm-live-card-race">${esc(raceHeadline(info.current) || 'Between races')}</div>
          <div class="hm-live-card-row">
            ${info.current ? `<span class="hm-chip">${esc(raceDisplayStage(info.current))}</span>` : ''}
            ${info.current ? `<span class="hm-pos">Race ${Math.max(info.idx + 1, 1)} of ${info.ordered.length}</span>` : ''}
          </div>
          <div class="hm-live-card-count">${skaterCount(meet)} skaters · ${teamCount(meet)} teams</div>
          <span class="hm-live-card-cta">Watch →</span>
        </a>`;
      }).join('')}
    </div>
  </section>`;
}

// Nothing running — fall back to finding one.
function quietHtml(db, upcoming) {
  const next = upcoming[0];
  const venue = next ? meetRinkLabel(db, next) : '';
  return `
  <section class="hm-hero hm-hero-quiet">
    <div class="hm-quiet-kicker">Inline speed skating meet software</div>
    <h1 class="hm-quiet-title">Run meets. Build races. <span>Go live.</span></h1>
    <p class="hm-quiet-copy">Registration, race builders, block scheduling, check-in, live results and standings — built for one sport, and it runs offline at the rink.</p>
    <div class="hm-quiet-actions">
      <a class="hm-btn hm-btn-orange hm-btn-lg" href="/meets">Find a meet near me</a>
      <a class="hm-btn hm-btn-ghost hm-btn-lg" href="/live">Live race day</a>
    </div>
    ${next ? `
    <a class="hm-nextmeet" href="/meet/${next.id}/live">
      <span class="hm-nextmeet-icon">🏁</span>
      <span class="hm-nextmeet-text">
        <span class="hm-nextmeet-kicker">Next meet up</span>
        <span class="hm-nextmeet-name">${esc(next.meetName || '')}</span>
        <span class="hm-nextmeet-meta">${esc([venue, meetDateLabel(next)].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="hm-btn hm-btn-ghost">Details</span>
    </a>` : ''}
  </section>`;
}

function renderHomeView({ db, portalLink = '/admin/login' }) {
  const live = liveMeetsFrom(db);
  const upcoming = upcomingMeetsFrom(db);
  const rinkCount = (db.rinks || []).length;

  const hero = live.length === 1 ? singleLiveHtml(db, live[0])
    : live.length > 1 ? multiLiveHtml(db, live)
    : quietHtml(db, upcoming);

  return `
<style>
  .hm-wrap{--navy:#13213a;--orange:#F97316;--sky:#38BDF8;margin:0 0 28px;border-radius:28px;overflow:hidden;border:1px solid rgba(255,255,255,.10);box-shadow:var(--shadow-lg);background:radial-gradient(circle at 50% 0%,rgba(56,189,248,.10),transparent 38%),#0d1830;color:#fff}
  /* pageShell sets a{color:var(--sky2)} / a:hover{color:var(--orange)} globally —
     these keep link colour from bleeding into the dark panel and the buttons. */
  .hm-wrap a,.hm-wrap a:hover,.hm-pitch a,.hm-pitch a:hover{text-decoration:none;color:inherit}
  .hm-wrap a.hm-btn-orange,.hm-wrap a.hm-btn-orange:hover,.hm-pitch a.hm-btn-orange,.hm-pitch a.hm-btn-orange:hover{color:#fff;background:#F97316}
  .hm-wrap a.hm-btn-ghost,.hm-wrap a.hm-btn-ghost:hover{color:#fff}
  .hm-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border-radius:13px;font:800 14.5px 'Inter',ui-sans-serif,system-ui,sans-serif;white-space:nowrap}
  .hm-btn-lg{min-height:54px;padding:0 26px;border-radius:15px;font-size:16px}
  .hm-btn-orange{background:var(--orange);color:#fff;box-shadow:0 8px 24px rgba(249,115,22,.42)}
  .hm-btn-ghost{background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.22);color:#fff}
  .hm-live-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 13px;border-radius:999px;background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.5);font:800 11.5px 'Inter',sans-serif;letter-spacing:.1em;color:#FCA5A5}
  .hm-live-badge i{width:8px;height:8px;border-radius:50%;background:#ef4444;animation:hmPulse 1.6s ease-in-out infinite}
  @keyframes hmPulse{0%,100%{opacity:1}50%{opacity:.35}}

  .hm-hero-live{display:grid;grid-template-columns:1.15fr .85fr;gap:26px;padding:30px}
  .hm-live-meet{font:700 15px 'Inter',sans-serif;color:#7DD3FC;margin:16px 0 6px}
  .hm-live-race{margin:0;font:800 60px/1.02 'Inter',sans-serif;letter-spacing:-.02em;color:#fff}
  .hm-live-stage{display:block;font-size:34px;color:rgba(255,255,255,.7)}
  .hm-live-meta{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:14px;font:600 15px 'Inter',sans-serif;color:rgba(255,255,255,.68)}
  .hm-live-meta b{font:800 17px 'Inter',sans-serif;color:var(--orange)}
  .hm-live-actions{display:flex;gap:11px;flex-wrap:wrap;margin-top:22px}

  .hm-track{padding:18px;border-radius:22px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12)}
  .hm-track-head{display:flex;align-items:center;gap:9px;margin-bottom:12px;font:800 11.5px 'Inter',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--sky)}
  .hm-track-head em{margin-left:auto;font:600 12px 'Inter',sans-serif;font-style:normal;text-transform:none;letter-spacing:0;color:rgba(255,255,255,.62)}
  .hm-lanes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
  .hm-lane{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.05)}
  .hm-lane-n{font:700 12px 'Inter',sans-serif;color:rgba(255,255,255,.62)}
  .hm-helmet{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 7px;border-radius:9px;background:var(--sky);color:#08213a;font:800 14px 'Inter',sans-serif}
  .hm-helmet-blank{background:rgba(255,255,255,.10);color:rgba(255,255,255,.5)}
  .hm-lane-who{min-width:0;display:flex;flex-direction:column}
  .hm-lane-who b{font:750 14.5px 'Inter',sans-serif;color:#fff}
  .hm-lane-who em{font:500 11.5px 'Inter',sans-serif;font-style:normal;color:rgba(255,255,255,.62)}
  .hm-track-empty,.hm-next{font:600 12.5px 'Inter',sans-serif;color:rgba(255,255,255,.62)}
  .hm-track-empty{padding:18px 4px}
  .hm-next{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.10)}

  .hm-multi{padding:28px 30px 8px}
  .hm-multi-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}
  .hm-multi-sub{font:600 14px 'Inter',sans-serif;color:rgba(255,255,255,.68)}
  .hm-multi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
  .hm-live-card{display:flex;flex-direction:column;gap:7px;padding:17px 18px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.13)}
  .hm-live-card:hover{border-color:rgba(249,115,22,.55);background:rgba(255,255,255,.08)}
  .hm-live-card-meet{font:700 13.5px 'Inter',sans-serif;color:#7DD3FC}
  .hm-live-card-venue,.hm-live-card-count{font:500 12px 'Inter',sans-serif;color:rgba(255,255,255,.62)}
  .hm-live-card-race{font:800 24px/1.15 'Inter',sans-serif;letter-spacing:-.01em;color:#fff}
  .hm-live-card-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .hm-chip{padding:4px 10px;border-radius:999px;background:rgba(16,185,129,.16);border:1px solid rgba(16,185,129,.45);color:#6EE7B7;font:800 11.5px 'Inter',sans-serif}
  .hm-pos{font:650 12.5px 'Inter',sans-serif;color:var(--orange)}
  .hm-live-card-cta{margin-top:4px;font:800 13.5px 'Inter',sans-serif;color:var(--orange)}

  .hm-hero-quiet{padding:44px 30px 30px;text-align:center}
  .hm-quiet-kicker{font:700 13px 'Inter',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#7DD3FC;margin-bottom:14px}
  .hm-quiet-title{margin:0 auto;max-width:900px;font:800 66px/1.02 'Inter',sans-serif;letter-spacing:-.03em;color:#fff}
  .hm-quiet-title span{color:var(--orange)}
  .hm-quiet-copy{max-width:640px;margin:18px auto 0;font:500 16px/1.6 'Inter',sans-serif;color:rgba(255,255,255,.72)}
  .hm-quiet-actions{display:flex;gap:11px;justify-content:center;flex-wrap:wrap;margin-top:24px}
  .hm-nextmeet{display:flex;align-items:center;gap:16px;flex-wrap:wrap;text-align:left;margin:26px auto 0;max-width:820px;padding:18px 20px;border-radius:22px;background:rgba(56,189,248,.07);border:1px solid rgba(56,189,248,.28)}
  .hm-nextmeet-icon{display:flex;align-items:center;justify-content:center;width:46px;height:46px;flex:none;border-radius:14px;background:rgba(56,189,248,.16);border:1px solid rgba(56,189,248,.4);font-size:22px}
  .hm-nextmeet-text{flex:1;min-width:220px;display:flex;flex-direction:column;gap:3px}
  .hm-nextmeet-kicker{font:800 10.5px 'Inter',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#7DD3FC}
  .hm-nextmeet-name{font:800 21px 'Inter',sans-serif;letter-spacing:-.01em;color:#fff}
  .hm-nextmeet-meta{font:500 13.5px 'Inter',sans-serif;color:rgba(255,255,255,.68)}

  .hm-doors{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;padding:22px 30px 28px}
  .hm-door{display:flex;align-items:center;gap:13px;padding:15px 17px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12)}
  .hm-door:hover{border-color:rgba(249,115,22,.55);background:rgba(255,255,255,.08)}
  .hm-door-icon{font-size:22px;line-height:1}
  .hm-door-text{min-width:0;display:flex;flex-direction:column;gap:2px}
  .hm-door-label{font:800 15px 'Inter',sans-serif;color:#fff}
  .hm-door-sub{font:500 12.5px 'Inter',sans-serif;color:rgba(255,255,255,.62)}

  .hm-pitch{margin-bottom:8px}
  .hm-facts{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px}
  .hm-fact{padding:11px 16px;border-radius:14px;background:#fff;border:1px solid var(--border);box-shadow:var(--shadow-sm);font:600 13px 'Inter',sans-serif;color:var(--muted)}
  .hm-fact b{font:800 20px 'Inter',sans-serif;color:#13213a;margin-right:7px}
  .hm-pitch-card{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:20px 22px;border-radius:20px;background:#13213a;box-shadow:var(--shadow)}
  .hm-pitch-copy{flex:1;min-width:240px}
  .hm-pitch-title{font:800 19px 'Inter',sans-serif;letter-spacing:-.02em;color:#fff}
  .hm-pitch-sub{font:500 13.5px 'Inter',sans-serif;color:rgba(255,255,255,.68);margin-top:3px}

  @media(max-width:900px){
    .hm-hero-live{grid-template-columns:1fr;padding:22px 18px}
    .hm-live-race{font-size:44px}
    .hm-live-stage{font-size:26px}
    .hm-quiet-title{font-size:46px}
    .hm-hero-quiet{padding:34px 18px 24px}
    .hm-multi,.hm-doors{padding-left:18px;padding-right:18px}
    .hm-btn-lg{width:100%}
  }
</style>
<div class="hm-wrap">
  ${hero}
  ${doorsHtml(portalLink)}
</div>
${pitchHtml(upcoming, rinkCount)}
${live.length ? '<script>setTimeout(()=>location.reload(),45000);</script>' : ''}`;
}

module.exports = { renderHomeView, liveMeetsFrom };
