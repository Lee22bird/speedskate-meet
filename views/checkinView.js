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
    const totalCost = Number(r.totalCost || 0);
    const paidLabel = r.paid ? '✓ Paid' : (totalCost > 0 ? `Owes $${money(totalCost)}` : 'Not Paid');
    const paidClass = r.paid ? 'ci-pill ci-pill-good' : 'ci-pill ci-pill-owe';
    const checkinLabel = r.checkedIn ? '✓ Checked In' : 'Not Checked In';
    const checkinClass = r.checkedIn ? 'ci-pill ci-pill-good' : 'ci-pill ci-pill-muted';
    const helmetDisplay = r.helmetNumber || '—';

    return `
      <div class="checkin-card"
        data-name="${esc(String(r.name || '').toLowerCase())}"
        data-team="${esc(String(r.team || '').toLowerCase())}"
        data-meet-number="${esc(String(r.meetNumber || '').toLowerCase())}"
        data-helmet="${esc(String(r.helmetNumber || '').toLowerCase())}"
        data-paid="${r.paid ? 'paid' : 'unpaid'}"
        data-checkin="${r.checkedIn ? 'checked' : 'not-checked'}">
        <div class="checkin-topline">
          <div class="checkin-person">
            <div class="checkin-name-row">
              <div>
                <div class="checkin-name">${esc(r.name)}</div>
                ${sponsorLineHtml(r.sponsor || '')}
              </div>
              <div class="checkin-helmet-badge">Helmet #${esc(helmetDisplay)}</div>
            </div>
            <div class="checkin-meta">
              <span>Reg #${esc(r.meetNumber || '—')}</span>
              <span>${esc(r.team || 'Independent')}</span>
              <span>${esc(r.divisionGroupLabel || 'Unassigned')}</span>
            </div>
            <div class="checkin-meta checkin-entry-line">
              <span>${esc(entryLabel)}</span>
              <span>$${esc(money(r.totalCost))} total</span>
            </div>
          </div>

          <div class="checkin-side">
            <form method="POST" action="/portal/meet/${esc(meet.id)}/checkin/helmet/${esc(r.id)}?returnTo=checkin" class="checkin-form helmet-form">
              <label>Helmet #</label>
              <div class="helmet-row">
                <input name="helmetNumber" value="${esc(r.helmetNumber || '')}" inputmode="numeric" />
                <button class="btn2 btn-sm" type="submit">Save</button>
              </div>
            </form>
            <a class="btn2 btn-sm ci-edit-btn" href="/portal/meet/${esc(meet.id)}/registered/${esc(r.id)}/edit">Edit</a>
          </div>
        </div>

        <div class="checkin-status-row">
          <form method="POST" action="/portal/meet/${esc(meet.id)}/checkin/toggle-paid/${esc(r.id)}?returnTo=checkin" class="checkin-form">
            <button class="${paidClass}" type="submit">${paidLabel}</button>
          </form>
          <form method="POST" action="/portal/meet/${esc(meet.id)}/checkin/toggle-checkin/${esc(r.id)}?returnTo=checkin" class="checkin-form">
            <button class="${checkinClass}" type="submit">${checkinLabel}</button>
          </form>
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

      #ciCards{max-width:1120px;margin:0 auto;}
      .checkin-card{
        border:1px solid var(--border);
        border-radius:18px;
        padding:16px 18px;
        margin:0 auto 12px;
        background:white;
        box-shadow:0 1px 2px rgba(15,31,61,.04);
      }
      .checkin-card.is-hidden{display:none;}

      .checkin-topline{
        display:grid;
        grid-template-columns:minmax(0,1fr) 235px;
        gap:18px;
        align-items:start;
      }
      .checkin-name-row{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:14px;
      }
      .checkin-name{
        font-size:23px;
        font-weight:900;
        color:var(--navy);
        line-height:1.12;
        letter-spacing:-.02em;
      }
      .checkin-helmet-badge{
        background:#fff7ed;
        border:1px solid #fed7aa;
        color:var(--orange);
        border-radius:999px;
        padding:7px 12px;
        font-size:15px;
        font-weight:900;
        white-space:nowrap;
        line-height:1;
      }
      .checkin-meta{
        display:flex;
        align-items:center;
        flex-wrap:wrap;
        gap:6px 10px;
        margin-top:6px;
        color:var(--muted);
        font-size:14px;
        font-weight:650;
      }
      .checkin-meta span:not(:last-child)::after{
        content:"•";
        color:#cbd5e1;
        margin-left:10px;
      }
      .checkin-entry-line{
        margin-top:4px;
        color:#334155;
      }

      .checkin-side{
        display:flex;
        flex-direction:column;
        gap:8px;
        align-items:stretch;
      }
      .helmet-form label{
        margin-bottom:4px;
      }
      .helmet-row{
        display:flex;
        gap:6px;
      }
      .helmet-row input{
        max-width:94px;
        text-align:center;
        font-size:18px;
        font-weight:900;
      }
      .helmet-row button{
        min-width:70px;
      }
      .ci-edit-btn{
        width:100%;
        min-height:36px;
      }

      .checkin-status-row{
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
        margin-top:12px;
        padding-top:12px;
        border-top:1px solid rgba(15,31,61,.08);
      }
      .checkin-status-row .checkin-form{
        margin:0;
      }
      .ci-pill{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:6px;
        border-radius:999px;
        padding:8px 13px;
        min-height:36px;
        border:1px solid transparent;
        font-size:13px;
        font-weight:850;
        cursor:pointer;
        white-space:nowrap;
      }
      .ci-pill-good{
        background:#ecfdf5;
        border-color:#6ee7b7;
        color:#047857;
      }
      .ci-pill-owe{
        background:#fff7ed;
        border-color:#fed7aa;
        color:#c2410c;
      }
      .ci-pill-muted{
        background:#f8fafc;
        border-color:#cbd5e1;
        color:#475569;
      }

      .tiny-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);}
      .no-ci-results{display:none;padding:16px;color:var(--muted);max-width:1120px;margin:0 auto;}

      @media(max-width:860px){
        .ci-stat-grid{grid-template-columns:1fr;}
        #ciCards{max-width:none;}
        .checkin-topline{grid-template-columns:1fr;}
        .checkin-name-row{flex-direction:column;align-items:flex-start;}
        .checkin-helmet-badge{font-size:14px;}
        .checkin-side{max-width:260px;}
        .checkin-name{font-size:21px;}
      }
      @media(max-width:560px){
        .checkin-card{padding:14px;}
        .checkin-side{max-width:none;}
        .helmet-row input{max-width:none;flex:1;}
        .checkin-status-row{display:grid;grid-template-columns:1fr;align-items:stretch;}
        .ci-pill{width:100%;}
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
          <label>Search Name / Reg # / Helmet #</label>
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
