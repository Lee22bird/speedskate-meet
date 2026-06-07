const { esc, cap } = require('../utils/html');

function sponsorLineHtml(sponsor) {
  const s = String(sponsor || '').trim();
  if (!s) return '';
  return `<div class="sponsor-line">Sponsored by ${esc(s)}</div>`;
}

function entryLabelForRegistration(reg) {
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
    .filter(k => reg.options?.[k])
    .map(k => {
      if (k === 'challengeUp') return 'CU';
      if (k === 'additional') return 'Additional';
      if (k === 'relay2Person') return '2 Person Relay';
      if (k === 'relay3Person') return '3 Person Relay';
      if (k === 'relay4Person') return '4 Person Relay';
      return cap(k);
    })
    .join(', ') || '—';
}

function renderRegisteredView({ meet, isSuperAdmin = false }) {
  const registrations = meet.registrations || [];
  const divisionOptions = Array.from(new Set(
    registrations
      .map(r => String(r.divisionGroupLabel || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  const rows = registrations.map(r => {
    const entryLabel = entryLabelForRegistration(r);

    return `
    <tr class="registered-row"
      data-name="${esc(String(r.name || '').toLowerCase())}"
      data-team="${esc(String(r.team || '').toLowerCase())}"
      data-division="${esc(String(r.divisionGroupLabel || '').toLowerCase())}"
      data-paid="${r.paid ? 'paid' : 'unpaid'}"
      data-checkin="${r.checkedIn ? 'checked' : 'not-checked'}">
      <td>${esc(r.meetNumber)}</td><td>${esc(r.helmetNumber)}</td>
      <td><strong>${esc(r.name)}</strong>${sponsorLineHtml(r.sponsor || '')}</td>
      <td>${esc(r.age)}</td><td>${esc(r.team)}</td>
      <td>${esc(r.divisionGroupLabel || '')}${r.options?.challengeUp ? `<div class="note">Challenge: ${esc(r.options?.novice ? 'Elite in own division' : (r.challengeDivisionGroupLabel || '—'))}</div>` : ''}</td>
      <td>${esc(entryLabel)}</td>
      <td>$${esc(r.totalCost)}</td>
      <td>${r.paid ? `<span class="good">✔</span>` : '—'}</td>
      <td>${r.checkedIn ? `<span class="good">✔</span>` : '—'}</td>
      <td>
        <div class="action-row">
          <a class="btn2 btn-sm" href="/portal/meet/${meet.id}/registered/${r.id}/edit">Edit</a>
          <a class="btn-danger btn-sm" href="/portal/meet/${meet.id}/registered/${r.id}/delete">Del</a>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="page-header"><h1>Registered</h1><div class="sub">${esc(meet.meetName)} • <span id="registeredVisibleCount">${registrations.length}</span> of ${registrations.length} skaters</div></div>
    <div class="card">
      <div class="row between" style="margin-bottom:18px">
        <div class="note">Registration close: ${meet.registrationCloseAt ? esc(meet.registrationCloseAt.replace('T', ' ')) : 'Not set'}</div>
        <div class="action-row">
          <form method="POST" action="/portal/meet/${meet.id}/assign-races" onsubmit="return confirm('Rebuild will re-split heats and reassign lanes.\n\nYour block structure will be preserved but lane assignments will change.\n\nContinue?')"><button class="btn2" type="submit">Rebuild Assignments</button></form>
          <a class="btn-orange" href="/meet/${meet.id}/register" target="_blank">Public Registration</a>
          ${isSuperAdmin ? `<a class="btn2" href="/portal/meet/${meet.id}/dev/import-spring-fling">Dev Import</a>` : ''}
          <a class="btn2" href="/portal/meet/${meet.id}/registered/print-race-list" target="_blank">Print Race List</a>
        </div>
      </div>

      <div class="form-grid cols-5" style="margin-bottom:16px">
        <div>
          <label>Search Name</label>
          <input id="registeredNameSearch" type="text" placeholder="skater name..." autocomplete="off" />
        </div>
        <div>
          <label>Team</label>
          <input id="registeredTeamSearch" type="text" placeholder="team..." autocomplete="off" />
        </div>
        <div>
          <label>Division</label>
          <select id="registeredDivisionFilter">
            <option value="">All</option>
            ${divisionOptions.map(d => `<option value="${esc(d.toLowerCase())}">${esc(d)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Payment</label>
          <select id="registeredPaidFilter">
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
        <div>
          <label>Check-In</label>
          <select id="registeredCheckinFilter">
            <option value="">All</option>
            <option value="checked">Checked In</option>
            <option value="not-checked">Not Checked In</option>
          </select>
        </div>
      </div>

      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>#</th><th>Helmet</th><th>Name</th><th>Age</th><th>Team</th><th>Division</th><th>Entries</th><th>Total</th><th>Paid</th><th>In</th><th></th></tr></thead>
          <tbody id="registeredTableBody">${rows || `<tr><td colspan="11" class="muted">No registrations yet.</td></tr>`}</tbody>
        </table>
        <div id="registeredNoMatches" class="muted" style="display:none;padding:14px 0">No registrations match those filters.</div>
      </div>
    </div>
    <script>
      (function(){
        var nameInput = document.getElementById('registeredNameSearch');
        var teamInput = document.getElementById('registeredTeamSearch');
        var divisionFilter = document.getElementById('registeredDivisionFilter');
        var paidFilter = document.getElementById('registeredPaidFilter');
        var checkinFilter = document.getElementById('registeredCheckinFilter');
        var countEl = document.getElementById('registeredVisibleCount');
        var noMatches = document.getElementById('registeredNoMatches');

        function val(el){ return String((el && el.value) || '').trim().toLowerCase(); }

        function applyRegisteredFilters(){
          var nameQ = val(nameInput);
          var teamQ = val(teamInput);
          var divisionQ = val(divisionFilter);
          var paidQ = val(paidFilter);
          var checkinQ = val(checkinFilter);
          var rows = Array.from(document.querySelectorAll('.registered-row'));
          var visible = 0;

          rows.forEach(function(row){
            var ok = true;
            if(nameQ && !String(row.dataset.name || '').includes(nameQ)) ok = false;
            if(teamQ && !String(row.dataset.team || '').includes(teamQ)) ok = false;
            if(divisionQ && String(row.dataset.division || '') !== divisionQ) ok = false;
            if(paidQ && String(row.dataset.paid || '') !== paidQ) ok = false;
            if(checkinQ && String(row.dataset.checkin || '') !== checkinQ) ok = false;

            row.style.display = ok ? '' : 'none';
            if(ok) visible += 1;
          });

          if(countEl) countEl.textContent = visible;
          if(noMatches) noMatches.style.display = rows.length && !visible ? '' : 'none';
        }

        [nameInput, teamInput, divisionFilter, paidFilter, checkinFilter].forEach(function(el){
          if(!el) return;
          el.addEventListener('input', applyRegisteredFilters);
          el.addEventListener('change', applyRegisteredFilters);
        });

        applyRegisteredFilters();
      })();
    </script>`;
}

module.exports = {
  renderRegisteredView,
};
