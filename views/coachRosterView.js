const { esc, cap } = require('../utils/html');

function renderCoachRosterView({ user, roster = [], ok = '', err = '' }) {
  const sortedRoster = [...roster].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const rows = sortedRoster.map(s => `
    <tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.birthdate || '—')}</td>
      <td>${esc(cap(s.gender || ''))}</td>
      <td>${esc(s.team || '')}</td>
      <td>
        <form method="POST" action="/portal/coach/roster/delete" style="display:inline">
          <input type="hidden" name="skaterId" value="${esc(s.id)}" />
          <button class="btn-danger btn-sm" type="submit" onclick="return confirm('Remove ${esc(s.name)} from roster?')">Remove</button>
        </form>
      </td>
    </tr>`).join('');

  const today = new Date().toISOString().split('T')[0];

  return `
    <div class="page-header"><h1>Team Roster</h1><div class="sub">${esc(user.team || '')} • ${roster.length} skaters</div></div>
    ${ok ? `<div class="card" style="border-left:4px solid var(--green);margin-bottom:12px"><div class="good">✅ ${esc(decodeURIComponent(ok))}</div></div>` : ''}
    ${err ? `<div class="card" style="border-left:4px solid var(--red);margin-bottom:12px"><div class="danger">❌ ${esc(decodeURIComponent(err))}</div></div>` : ''}
    <div class="grid-2" style="margin-bottom:16px">
      <div class="card">
        <h2 style="margin-bottom:14px">Add Skater</h2>
        <form method="POST" action="/portal/coach/roster/add" class="stack">
          <div class="form-grid cols-2">
            <div><label>Skater Name</label><input name="name" required placeholder="Jane Smith" /></div>
            <div><label>Date of Birth</label><input type="date" name="birthdate" min="1900-01-01" max="${today}" required /></div>
            <div><label>Gender</label>
              <select name="gender">
                <option value="girls">Girl</option>
                <option value="boys">Boy</option>
                <option value="women">Women</option>
                <option value="men">Men</option>
              </select>
            </div>
          </div>
          <div><button class="btn-orange" type="submit">+ Add to Roster</button></div>
        </form>
      </div>
      <div class="card">
        <h2 style="margin-bottom:8px">About the Roster</h2>
        <div class="stack" style="margin-top:8px">
          <div class="toggle-row"><div><div class="toggle-row-label">Year-round</div><div class="toggle-row-desc">Your roster persists across all meets — add once, use forever</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">No helmet numbers</div><div class="toggle-row-desc">Helmet numbers are meet-specific and assigned at check-in</div></div></div>
          <div class="toggle-row"><div><div class="toggle-row-label">Register from roster</div><div class="toggle-row-desc">Coming soon — register your whole team for a meet with checkboxes</div></div></div>
        </div>
      </div>
    </div>
    ${roster.length ? `
    <div class="card">
      <h2 style="margin-bottom:12px">Roster (${roster.length})</h2>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Name</th><th>Birthdate</th><th>Gender</th><th>Team</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>` : `<div class="card"><div class="muted">No skaters on your roster yet. Add some above!</div></div>`}
    <div style="margin-top:16px"><a class="btn2" href="/portal/coach">← Coach Portal</a></div>`;
}

module.exports = {
  renderCoachRosterView,
};
