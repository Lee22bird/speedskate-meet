const { esc } = require('../utils/html');

function staffRoleOptions(selectedRoles = []) {
  const selected = new Set((selectedRoles || []).map(String));
  const roles = [
    ['meet_director', 'Meet Director'],
    ['judge', 'Judge'],
    ['announcer', 'Announcer'],
    ['coach', 'Coach'],
  ];

  return roles.map(([value, label]) =>
    `<label class="toggle-wrap"><input type="checkbox" name="roles" value="${esc(value)}" class="toggle-input" ${selected.has(value) ? 'checked' : ''}><span class="toggle-track"><span class="toggle-thumb"></span></span><span class="toggle-label">${esc(label)}</span></label>`
  ).join('');
}

function roleLabel(value) {
  const labels = {
    meet_director: 'Meet Director',
    judge: 'Judge / Tabulator',
    announcer: 'Announcer',
    coach: 'Coach',
  };
  return labels[String(value || '').trim()] || '';
}

function renderStaffAccountsView({ users = [], teamList = [] }) {
  const rows = users.map(u => {
    const roles = Array.isArray(u.roles) ? u.roles : [];
    const status = u.active === false ? 'Off' : (roles.length ? 'On' : 'Pending Role');
    const requestedRole = roleLabel(u.requestedRole);
    const requestedRoleText = requestedRole || (roles.length ? '' : 'Not specified');
    const requestedAt = u.requestedRoleAt ? new Date(u.requestedRoleAt).toLocaleDateString() : '';

    return `
    <tr>
      <td><strong>${esc(u.displayName || u.username)}</strong><div class="muted" style="font-size:12px">${esc(u.email || '')}</div></td>
      <td>${esc(u.username || '')}</td>
      <td>
        <form method="POST" action="/portal/users/${esc(u.id)}/update" class="stack" style="gap:8px;margin:0">
          <div class="row" style="gap:10px;flex-wrap:wrap">${staffRoleOptions(roles)}</div>
          <div class="form-grid cols-2">
            <div><label style="font-size:11px">Team</label><input name="team" list="teams-users" value="${esc(u.team || '')}" /></div>
            <div><label style="font-size:11px">Active</label><select name="active"><option value="true" ${u.active !== false ? 'selected' : ''}>On</option><option value="false" ${u.active === false ? 'selected' : ''}>Off</option></select></div>
          </div>
          <button class="btn2 btn-sm" type="submit">Save</button>
        </form>
      </td>
      <td>
        <span class="chip ${roles.length ? 'chip-green' : 'chip-orange'}">${esc(status)}</span>
        ${requestedRoleText ? `<div class="muted" style="font-size:12px;margin-top:6px">Requested: ${esc(requestedRoleText)}${requestedAt ? ` • ${esc(requestedAt)}` : ''}</div>` : ''}
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="page-header"><h1>Users</h1><div class="sub">SSM staff accounts only: Meet Directors, Judges, Announcers, and Coaches.</div></div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between center" style="gap:12px;align-items:flex-start">
        <div>
          <h2 style="margin:0">SSL User Mirror Sync</h2>
          <div class="muted" style="font-size:13px;margin-top:4px">Push existing SSM staff users into SSL identity migration search.</div>
        </div>
        <button class="btn2" type="button" id="sync-ssl-user-mirrors-btn">Sync SSM Users To SSL</button>
      </div>
      <div id="sync-ssl-user-mirrors-result" class="muted" style="font-size:13px;margin-top:10px;white-space:pre-wrap;overflow-wrap:anywhere"></div>
    </div>
    <div class="card">
      <form method="POST" action="/portal/users/new" class="stack">
        <h2 style="margin-top:0">Add Staff User</h2>
        <div class="form-grid cols-4">
          <div><label>Name</label><input name="displayName" required /></div>
          <div><label>Email</label><input type="email" name="email" required /></div>
          <div><label>Password / PIN</label><input name="password" required /></div>
          <div><label>Team</label><input name="team" list="teams-users" value="Midwest Racing" /></div>
        </div>
        <datalist id="teams-users">${teamList.map(t => `<option value="${esc(t)}"></option>`).join('')}</datalist>
        <div class="row">${staffRoleOptions([])}</div>
        <div><button class="btn" type="submit">Add User</button></div>
      </form>
      <div class="hr"></div>
      <table class="table">
        <thead><tr><th>Name / Email</th><th>Login</th><th>Roles / Team</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <script>
      (function(){
        var btn = document.getElementById('sync-ssl-user-mirrors-btn');
        var out = document.getElementById('sync-ssl-user-mirrors-result');
        if (!btn || !out) return;
        btn.addEventListener('click', async function(){
          btn.disabled = true;
          out.textContent = 'Syncing...';
          try {
            var res = await fetch('/admin/tools/sync-ssl-user-mirrors', { method: 'POST', headers: { accept: 'application/json' } });
            var body = await res.json().catch(function(){ return {}; });
            if (!res.ok && !body.failures) throw new Error(body.error || 'Sync failed.');
            out.textContent =
              'Total users: ' + (body.total_users || 0) + '\\n' +
              'Synced: ' + (body.synced_count || 0) + '\\n' +
              'Skipped: ' + (body.skipped_count || 0) + '\\n' +
              'Failed: ' + (body.failed_count || 0) +
              (body.failures && body.failures.length ? '\\n\\nFailures:\\n' + JSON.stringify(body.failures, null, 2) : '');
          } catch (err) {
            out.textContent = err.message || 'Sync failed.';
          } finally {
            btn.disabled = false;
          }
        });
      })();
    </script>`;
}

module.exports = {
  renderStaffAccountsView,
};
