const { esc, cap } = require('../utils/html');

function sponsorLineHtml(sponsor) {
  const s = String(sponsor || '').trim();
  if (!s) return '';
  return `<div class="sponsor-line">Sponsored by ${esc(s)}</div>`;
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(0) : '0';
}

function entryLabelForRegistration(reg) {
  const opts = reg?.options || {};
  return [
    'challengeUp',
    'novice',
    'elite',
    'open',
    'quad',
    'additional',
    'timeTrials',
    'relay2Person',
    'relay3Person',
    'relay4Person',
  ]
    .filter(k => opts[k])
    .map(k => {
      if (k === 'challengeUp') return 'CU';
      if (k === 'additional') return 'Additional';
      if (k === 'timeTrials') return 'Time Trials';
      if (k === 'relay2Person') return '2 Person Relay';
      if (k === 'relay3Person') return '3 Person Relay';
      if (k === 'relay4Person') return '4 Person Relay';
      return cap(k);
    })
    .join(', ') || '—';
}

function renderCheckinView({ meet, query = {} }) {
  const registrations = meet.registrations || [];
  const totalOwed = registrations.reduce((sum, r) => sum + Number(r.totalCost || 0), 0);
  const totalPaid = registrations.filter(r => r.paid).reduce((sum, r) => sum + Number(r.totalCost || 0), 0);
  const checkedInCount = registrations.filter(r => r.checkedIn).length;

  const flash = [
    query.checkedIn ? `✅ Checked in ${decodeURIComponent(query.checkedIn)} skater(s).` : '',
    query.paid ? `✅ Marked ${decodeURIComponent(query.paid)} skater(s) paid.` : '',
    query.helmetUpdated ? '✅ Helmet number updated.' : '',
  ].filter(Boolean).map(msg => `
    <div class="card" style="border-left:4px solid var(--green);margin-bottom:12px">
      <div class="good">${msg}</div>
    </div>`).join('');

  const rows = registrations.map(r => {
    const entryLabel = entryLabelForRegistration(r);
    return `
      <div class="checkin-card"
        data-name="${esc(String(r.name || '').toLowerCase())}"
        data-team="${esc(String(r.team || '').toLowerCase())}"
        data-meet-number="${esc(String(r.meetNumber || '').toLowerCase())}"
        data-helmet="${esc(String(r.helmetNumber || '').toLowerCase())}"
        data-paid="${r.paid ? 'paid' : 'unpaid'}"
        data-checkin="${r.checkedIn ? 'checked' : 'not-checked'}">
        <div class="checkin-main">
          <div class="checkin-num">
            <div class="tiny-label">Meet #</div>
            <div class="big-number">${esc(r.meetNumber || '—')}</div>
          </div>
          <div class="checkin-person">
            <div class="checkin-name">${esc(r.name)}</div>
            ${sponsorLineHtml(r.sponsor || '')}
            <div class="muted">${esc(r.team || 'Independent')} • ${esc(r.divisionGroupLabel || 'Unassigned')}</div>
            <div class="muted">${esc(entryLabel)} • $${esc(money(r.totalCost))}</div>
          </div>
          <div class="checkin-helmet">
            <div class="tiny-label">Helmet</div>
            <form method="POST" action="/portal/meet/${esc(meet.id)}/checkin/helmet/${esc(r.id)}?returnTo=checkin" class="checkin-form helmet-form">
              <input name="helmetNumber" value="${esc(r.helmetNumber || '')}" inputmode="numeric" />
              <button class="btn2 btn-sm" type="submit">Save</button>
            </form>
          </div>
        </div>
        <div class="checkin-actions">
          <form method="POST" action="/portal/meet/${esc(meet.id)}/checkin/toggle-paid/${esc(r.id)}?returnTo=checkin" class="checkin-form">
            <button class="${r.paid ? 'btn-good' : 'btn-orange'}" type="submit">${r.paid ? '✔ Paid' : 'Mark Paid'}</button>
          </form>
          <form method="POST" action="/portal/meet/${esc(meet.id)}/checkin/toggle-checkin/${esc(r.id)}?returnTo=checkin" class="checkin-form">
            <button class="${r.checkedIn ? 'btn-good' : 'btn'}" type="submit">${r.checkedIn ? '✔ Checked In' : 'Check In'}</button>
          </form>
          <a class="btn2" href="/portal/meet/${esc(meet.id)}/registered/${esc(r.id)}/edit">Edit</a>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="page-header"><h1>Volunteer Check-In</h1><div class="sub">${esc(meet.meetName)} • fast race-day mode</div></div>
    ${flash}
    <style>
      .ci-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px;}
      .ci-stat{background:#f8fafc;border:1px solid var(--border);border-radius:16px;padding:14px;}
      .ci-stat-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
      .ci-stat-value{font-size:26px;font-weight:850;color:var(--navy);margin-top:3px;}
      .checkin-toolbar{background:var(--bg);padding:8px 0 12px;margin-bottom:8px;}
      .checkin-card{border:1px solid var(--border);border-radius:18px;padding:14px;margin-bottom:12px;background:white;box-shadow:0 1px 2px rgba(15,31,61,.04);}
      .checkin-card.is-hidden{display:none;}
      .checkin-main{display:grid;grid-template-columns:90px 1fr 150px;gap:14px;align-items:center;}
      .tiny-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);}
      .big-number{font-size:36px;font-weight:900;color:var(--orange);line-height:1;}
      .checkin-name{font-size:22px;font-weight:850;color:var(--navy);line-height:1.15;}
      .helmet-form{display:flex;gap:6px;margin-top:3px;}
      .helmet-form input{max-width:76px;text-align:center;font-size:18px;font-weight:800;}
      .checkin-actions{display:grid;grid-template-columns:1fr 1.2fr auto;gap:8px;margin-top:12px;}
      .checkin-actions button,.checkin-actions a{width:100%;min-height:44px;display:flex;align-items:center;justify-content:center;}
      .no-ci-results{display:none;padding:16px;color:var(--muted);}
      @media(max-width:760px){
        .ci-stat-grid{grid-template-columns:1fr;}
        .checkin-main{grid-template-columns:72px 1fr;}
        .checkin-helmet{grid-column:1/-1;}
        .checkin-actions{grid-template-columns:1fr;}
        .checkin-name{font-size:20px;}
        .big-number{font-size:30px;}
      }
    </style>

    <div class="ci-stat-grid">
      <div class="ci-stat"><div class="ci-stat-label">Total Skaters</div><div class="ci-stat-value">${registrations.length}</div></div>
      <div class="ci-stat"><div class="ci-stat-label">Checked In</div><div class="ci-stat-value">${checkedInCount}</div></div>
      <div class="ci-stat"><div class="ci-stat-label">Revenue</div><div class="ci-stat-value">$${money(totalPaid)} <span style="font-size:15px;color:var(--muted)">/ $${money(totalOwed)}</span></div></div>
    </div>

    <div class="card checkin-toolbar">
      <div class="form-grid cols-4" style="align-items:end">
        <div>
          <label>Search Name / Meet # / Helmet #</label>
          <input id="ciSearch" placeholder="start typing..." autocomplete="off" autofocus />
        </div>
        <div>
          <label>Team</label>
          <input id="ciTeam" placeholder="team..." autocomplete="off" />
        </div>
        <div>
          <label>Filter</label>
          <select id="ciStatus">
            <option value="all">All</option>
            <option value="not_paid">Not Paid</option>
            <option value="not_in">Not Checked In</option>
            <option value="in">Checked In</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div class="action-row">
          <a class="btn2" href="/portal/meet/${esc(meet.id)}/registered">Registered</a>
        </div>
      </div>
    </div>

    <div id="ciCards">${rows || `<div class="card"><div class="muted">No registrations yet.</div></div>`}</div>
    <div id="ciNoResults" class="card no-ci-results">No registrations match those filters.</div>

    <script>
      (function(){
        var savedY = sessionStorage.getItem('ciY');
        if(savedY){ window.scrollTo(0, parseInt(savedY, 10)); sessionStorage.removeItem('ciY'); }
        document.querySelectorAll('.checkin-form').forEach(function(form){
          form.addEventListener('submit', function(){ sessionStorage.setItem('ciY', String(window.scrollY)); });
        });

        var q = document.getElementById('ciSearch');
        var team = document.getElementById('ciTeam');
        var status = document.getElementById('ciStatus');
        var noResults = document.getElementById('ciNoResults');

        function v(el){ return String((el && el.value) || '').trim().toLowerCase(); }
        function applyCI(){
          var search = v(q);
          var teamQ = v(team);
          var statusQ = v(status);
          var visible = 0;
          document.querySelectorAll('.checkin-card').forEach(function(card){
            var hay = [card.dataset.name, card.dataset.meetNumber, card.dataset.helmet].join(' ');
            var ok = true;
            if(search && !hay.includes(search)) ok = false;
            if(teamQ && !String(card.dataset.team || '').includes(teamQ)) ok = false;
            if(statusQ === 'not_paid' && card.dataset.paid !== 'unpaid') ok = false;
            if(statusQ === 'paid' && card.dataset.paid !== 'paid') ok = false;
            if(statusQ === 'not_in' && card.dataset.checkin !== 'not-checked') ok = false;
            if(statusQ === 'in' && card.dataset.checkin !== 'checked') ok = false;
            card.classList.toggle('is-hidden', !ok);
            if(ok) visible += 1;
          });
          if(noResults) noResults.style.display = visible ? 'none' : 'block';
        }
        [q, team, status].forEach(function(el){
          if(!el) return;
          el.addEventListener('input', applyCI);
          el.addEventListener('change', applyCI);
        });
        applyCI();
      })();
    </script>`;
}

module.exports = {
  renderCheckinView,
};
