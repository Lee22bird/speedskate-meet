const crypto = require('crypto');
const { esc } = require('../utils/html');
const { nowIso } = require('../utils/date');
const { PIN_ROLES, PIN_ROLE_LABELS, staffPinsJson } = require('./meetStaffPins');

const STAFF_ROLES = [
  { key: 'meet_director', label: 'Meet Director', sslRole: 'meet_director' },
  { key: 'tabulator', label: 'Tabulator', sslRole: 'tabulator' },
  { key: 'referee', label: 'Referee', sslRole: 'referee' },
  { key: 'announcer', label: 'Announcer', sslRole: 'announcer' },
];

const STAFF_ROLE_KEYS = new Set(STAFF_ROLES.map(role => role.key));

function staffRoleLabel(roleKey) {
  return STAFF_ROLES.find(role => role.key === roleKey)?.label || 'Staff';
}

function staffInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SS';
  return parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
}

function staffIdentityFromRaw(raw = {}) {
  return {
    staff_ssl_id: String(raw.staff_ssl_id || raw.ssl_id || raw.sslId || raw.ssl_skater_id || '').trim(),
    staff_user_id: String(raw.staff_user_id || raw.user_id || raw.userId || raw.id || '').trim(),
    staff_name: String(raw.staff_name || raw.name || raw.full_name || raw.displayName || '').trim(),
    staff_avatar_url: String(raw.staff_avatar_url || raw.avatar_url || raw.profile_photo_url || raw.profile_photo || '').trim(),
  };
}

function normalizeStaffAssignment(raw = {}, fallbackMeetId = '') {
  const role = String(raw.staff_role || raw.role || '').trim();
  if (!STAFF_ROLE_KEYS.has(role)) return null;
  const identity = staffIdentityFromRaw(raw);
  if (!identity.staff_ssl_id && !identity.staff_user_id && !identity.staff_name) return null;
  const now = nowIso();
  return {
    id: String(raw.id || `staff_${role}_${crypto.randomBytes(5).toString('hex')}`),
    meet_id: String(raw.meet_id || raw.meetId || fallbackMeetId || ''),
    ...identity,
    staff_role: role,
    assigned_by_user_id: raw.assigned_by_user_id == null ? '' : String(raw.assigned_by_user_id),
    created_at: String(raw.created_at || raw.createdAt || now),
    updated_at: String(raw.updated_at || raw.updatedAt || now),
  };
}

// Identity key for "same person" within a role — user id first, then SSL id,
// then (last resort) normalized name.
function staffPersonKey(row = {}) {
  return String(row.staff_user_id || '').trim()
    || String(row.staff_ssl_id || '').trim().toUpperCase()
    || String(row.staff_name || '').trim().toLowerCase();
}

// A meet can have MULTIPLE people per staff role (two meet directors, a bench of
// tabulators, several referees…). Rows are kept in role order then assignment
// order; the same person listed twice for one role collapses to the newest row.
// This runs on EVERY load (migrateMeet), so it must preserve multiples — the old
// version kept ONE per role, which silently deleted extra staff on reload (the
// §10 whitelist bug class, in staff form).
function normalizeMeetStaffAssignments(meet) {
  if (!meet) return [];
  const raw = Array.isArray(meet.meet_staff_assignments)
    ? meet.meet_staff_assignments
    : (Array.isArray(meet.staffAssignments) ? meet.staffAssignments : []);
  const byRolePerson = new Map(); // `${role}|${personKey}` -> assignment (last wins)
  const order = [];
  raw.forEach(item => {
    const normalized = normalizeStaffAssignment(item, meet.id);
    if (!normalized) return;
    const key = `${normalized.staff_role}|${staffPersonKey(normalized)}`;
    if (!byRolePerson.has(key)) order.push(key);
    byRolePerson.set(key, normalized);
  });
  const roleOrder = new Map(STAFF_ROLES.map((role, i) => [role.key, i]));
  const rows = order.map(key => byRolePerson.get(key))
    .sort((a, b) => (roleOrder.get(a.staff_role) ?? 99) - (roleOrder.get(b.staff_role) ?? 99));
  meet.meet_staff_assignments = rows;
  meet.staffAssignments = rows.map(row => ({ ...row }));
  return rows;
}

function staffAssignmentsForMeet(meet) {
  const rows = normalizeMeetStaffAssignments(meet);
  return STAFF_ROLES.map(role => ({
    ...role,
    assignments: rows.filter(row => row.staff_role === role.key),
  }));
}

// ADD a person to a role (or refresh them if already assigned to it). Multiple
// people per role are the norm; only the same person twice collapses.
function upsertMeetStaffAssignment(meet, roleKey, person, assignedByUserId) {
  if (!meet) throw new Error('Meet not found.');
  if (!STAFF_ROLE_KEYS.has(roleKey)) throw new Error('Unsupported staff role.');
  const identity = staffIdentityFromRaw(person);
  if (!identity.staff_ssl_id && !identity.staff_user_id) throw new Error('Choose a valid SSL profile.');
  if (!identity.staff_name) throw new Error('SSL profile name is required.');
  const now = nowIso();
  const rows = normalizeMeetStaffAssignments(meet);
  const personKey = staffPersonKey(identity);
  const existing = rows.find(row => row.staff_role === roleKey && staffPersonKey(row) === personKey);
  const assignment = {
    id: existing?.id || `staff_${roleKey}_${crypto.randomBytes(5).toString('hex')}`,
    meet_id: String(meet.id || ''),
    ...identity,
    staff_role: roleKey,
    assigned_by_user_id: assignedByUserId == null ? '' : String(assignedByUserId),
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  meet.meet_staff_assignments = [
    ...rows.filter(row => !(row.staff_role === roleKey && staffPersonKey(row) === personKey)),
    assignment,
  ];
  meet.staffAssignments = meet.meet_staff_assignments.map(row => ({ ...row }));
  normalizeMeetStaffAssignments(meet); // re-sort into role order
  meet.updatedAt = now;
  return assignment;
}

// Remove ONE assignment by id (the per-person Remove button), or — when no id is
// given (legacy forms) — every assignment of the role.
function clearMeetStaffAssignment(meet, roleKey, assignmentId = '') {
  if (!meet) throw new Error('Meet not found.');
  if (!STAFF_ROLE_KEYS.has(roleKey)) throw new Error('Unsupported staff role.');
  const id = String(assignmentId || '').trim();
  const rows = normalizeMeetStaffAssignments(meet).filter(row => {
    if (row.staff_role !== roleKey) return true;
    return id ? String(row.id) !== id : false;
  });
  meet.meet_staff_assignments = rows;
  meet.staffAssignments = rows.map(row => ({ ...row }));
  meet.updatedAt = nowIso();
}

function staffAvatarHtml(person, sizeClass = '') {
  const url = String(person?.staff_avatar_url || person?.avatar_url || '').trim();
  const name = String(person?.staff_name || person?.name || '').trim();
  const cls = ['staff-avatar', sizeClass].filter(Boolean).join(' ');
  if (url) {
    return `<span class="${esc(cls)}"><img src="${esc(url)}" alt="${esc(name || 'Staff avatar')}" loading="lazy"></span>`;
  }
  return `<span class="${esc(cls)}">${esc(staffInitials(name))}</span>`;
}

function renderStaffPerson(assignment, roleLabel, compact = false) {
  const sslId = String(assignment?.staff_ssl_id || '').trim();
  const name = String(assignment?.staff_name || 'Unassigned').trim();
  return `
    <div class="${compact ? 'staff-person compact' : 'staff-person'}">
      ${staffAvatarHtml(assignment, compact ? 'small' : '')}
      <div class="staff-person-body">
        <div class="staff-name">${esc(name)}</div>
        <div class="staff-meta">${sslId ? esc(sslId) : 'SSL profile linked'} <span class="staff-role-badge">${esc(roleLabel)}</span></div>
      </div>
    </div>`;
}

function renderMeetStaffList(meet, options = {}) {
  const people = staffAssignmentsForMeet(meet)
    .flatMap(row => row.assignments.map(a => ({ assignment: a, label: row.label })));
  if (!people.length) {
    return options.emptyMessage ? `<div class="muted">${esc(options.emptyMessage)}</div>` : '';
  }
  return `
    <div class="meet-staff-list">
      ${people.map(p => renderStaffPerson(p.assignment, p.label, !!options.compact)).join('')}
    </div>`;
}

function renderMeetStaffManager({ meet, canManage = false }) {
  const rows = staffAssignmentsForMeet(meet);
  const pins = canManage ? staffPinsJson(meet) : [];
  return `
    <div class="card meet-staff-manager" style="margin-bottom:16px" data-meet-staff-manager data-meet-id="${esc(meet.id)}" data-can-manage="${canManage ? '1' : '0'}">
      <div class="row between center" style="gap:12px;margin-bottom:14px">
        <div>
          <h2 style="margin:0">Meet Staff</h2>
          <div class="note">${canManage ? 'Assign official SSL staff identities for this meet.' : 'Only the meet owner or Super Admin can change staff assignments.'}</div>
        </div>
      </div>
      <div class="staff-assignment-grid">
        ${rows.map(row => {
          const assigned = row.assignments || [];
          return `
            <div class="staff-assignment-row" data-staff-role="${esc(row.key)}">
              <div class="staff-assignment-current">
                ${assigned.length ? assigned.map(person => `
                  <div class="staff-person-line">
                    ${renderStaffPerson(person, row.label)}
                    ${canManage ? `<form method="POST" action="/portal/meet/${esc(meet.id)}/staff/remove" class="staff-remove-form"><input type="hidden" name="staff_role" value="${esc(row.key)}"><input type="hidden" name="staff_assignment_id" value="${esc(person.id)}"><button class="btn2 btn-sm" type="submit">Remove</button></form>` : ''}
                  </div>`).join('') : `
                  <div class="staff-person">
                    ${staffAvatarHtml({ staff_name: row.label })}
                    <div class="staff-person-body">
                      <div class="staff-name">Unassigned</div>
                      <div class="staff-meta"><span class="staff-role-badge">${esc(row.label)}</span></div>
                    </div>
                  </div>`}
              </div>
              ${canManage ? `
                <div class="staff-picker">
                  <input type="search" class="staff-search-input" placeholder="${assigned.length ? `Add another ${esc(row.label)} — search SSL name or ID` : 'Search SSL name or ID'}" autocomplete="off" aria-label="Search SSL ${esc(row.label)}">
                  <div class="staff-search-results" aria-live="polite"></div>
                </div>` : ''}
            </div>`;
        }).join('')}
      </div>

      ${canManage ? `
        <div class="meet-pin-manager" style="margin-top:18px;padding-top:16px;border-top:1px solid var(--border)">
          <div style="margin-bottom:10px">
            <h2 style="margin:0;font-size:18px">Meet PINs</h2>
            <div class="note">Account-free race-day sign-in — each person gets a 6-digit PIN for their role (no SSL login). They sign in at <strong>/meet-pin</strong>; DQs and rulings are recorded under their name. Works offline on SSM Desktop.</div>
          </div>
          <form method="POST" action="/portal/meet/${esc(meet.id)}/staff/pin/create" class="form-grid cols-3" style="margin-bottom:12px">
            <div><label>Name</label><input name="name" placeholder="Jane Smith" maxlength="80" required></div>
            <div><label>Role</label><select name="role">${PIN_ROLES.map(r => `<option value="${esc(r)}">${esc(PIN_ROLE_LABELS[r])}</option>`).join('')}</select></div>
            <div style="align-self:flex-end"><button class="btn-orange" type="submit">Generate PIN</button></div>
          </form>
          ${pins.length ? `<div class="staff-pin-list">${pins.map(p => `
            <div class="staff-person-line">
              <div class="staff-pin-who"><strong>${esc(p.name)}</strong> <span class="staff-role-badge">${esc(p.roleLabel)}</span>${p.revoked ? ' <span class="chip">revoked</span>' : (p.active ? '' : ' <span class="chip">expired</span>')}${p.lastUsedAt ? ` <span class="note" style="display:inline">· last used ${esc(new Date(p.lastUsedAt).toLocaleString())}</span>` : ''}</div>
              ${p.active ? `<div class="action-row" style="margin:0">
                <form method="POST" action="/portal/meet/${esc(meet.id)}/staff/pin/regenerate" style="margin:0"><input type="hidden" name="pinId" value="${esc(p.id)}"><button class="btn2 btn-sm" type="submit">New code</button></form>
                <form method="POST" action="/portal/meet/${esc(meet.id)}/staff/pin/revoke" style="margin:0" onsubmit="return confirm('Revoke this PIN? The holder is signed out immediately.')"><input type="hidden" name="pinId" value="${esc(p.id)}"><button class="btn-danger btn-sm" type="submit">Revoke</button></form>
              </div>` : ''}
            </div>`).join('')}</div>` : '<div class="note">No meet PINs yet.</div>'}
        </div>` : ''}

      <style>
        .staff-person-line{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:4px 0;}
        .staff-person-line .staff-remove-form{margin:0;}
      </style>
      ${canManage ? `
        <script>
          (function(){
            var root = document.querySelector('[data-meet-staff-manager][data-meet-id="${esc(meet.id)}"]');
            if(!root || root.dataset.staffBound === '1') return;
            root.dataset.staffBound = '1';
            function escHtml(value){
              return String(value == null ? '' : value).replace(/[&<>"]/g, function(ch){
                return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[ch];
              });
            }
            function initials(name){
              var parts = String(name || '').trim().split(/\\s+/).filter(Boolean);
              return (parts[0] ? parts[0].charAt(0) : 'S') + (parts[1] ? parts[1].charAt(0) : '');
            }
            root.querySelectorAll('[data-staff-role]').forEach(function(row){
              var input = row.querySelector('.staff-search-input');
              var results = row.querySelector('.staff-search-results');
              if(!input || !results) return;
              var role = row.getAttribute('data-staff-role');
              var timer = null;
              input.addEventListener('input', function(){
                clearTimeout(timer);
                var q = input.value.trim();
                if(q.length < 2){
                  results.innerHTML = '';
                  return;
                }
                results.innerHTML = '<div class="staff-result-empty">Searching...</div>';
                timer = setTimeout(function(){
                  fetch('/api/meet/${encodeURIComponent(String(meet.id))}/staff-search?role=' + encodeURIComponent(role) + '&q=' + encodeURIComponent(q), { headers: { accept: 'application/json' }})
                    .then(function(res){ return res.json().then(function(body){ if(!res.ok) throw new Error(body.error || 'Staff search failed.'); return body; }); })
                    .then(function(body){
                      var people = Array.isArray(body.people) ? body.people : [];
                      if(!people.length){
                        results.innerHTML = '<div class="staff-result-empty">No approved SSL users found for this staff role.</div>';
                        return;
                      }
                      results.innerHTML = people.map(function(person){
                        var avatar = person.staff_avatar_url
                          ? '<span class="staff-avatar small"><img src="' + escHtml(person.staff_avatar_url) + '" alt=""></span>'
                          : '<span class="staff-avatar small">' + escHtml(initials(person.staff_name)) + '</span>';
                        var roles = Array.isArray(person.roles) ? person.roles.join(', ') : '';
                        return '<form method="POST" action="/portal/meet/${esc(meet.id)}/staff/assign" class="staff-result-row">' +
                          '<input type="hidden" name="staff_role" value="' + escHtml(role) + '">' +
                          '<input type="hidden" name="staff_ssl_id" value="' + escHtml(person.staff_ssl_id || '') + '">' +
                          '<input type="hidden" name="staff_user_id" value="' + escHtml(person.staff_user_id || '') + '">' +
                          '<input type="hidden" name="staff_name" value="' + escHtml(person.staff_name || '') + '">' +
                          '<input type="hidden" name="staff_avatar_url" value="' + escHtml(person.staff_avatar_url || '') + '">' +
                          '<button class="staff-result-button" type="submit">' + avatar +
                            '<span><strong>' + escHtml(person.staff_name || 'SSL Profile') + '</strong><small>' + escHtml(person.staff_ssl_id || 'SSL ID pending') + (roles ? ' • ' + escHtml(roles) : '') + '</small></span>' +
                          '</button></form>';
                      }).join('');
                    })
                    .catch(function(err){
                      results.innerHTML = '<div class="staff-result-empty">' + escHtml(err.message || 'Staff search failed.') + '</div>';
                    });
                }, 250);
              });
            });
          })();
        </script>` : ''}
    </div>`;
}

module.exports = {
  STAFF_ROLES,
  STAFF_ROLE_KEYS,
  staffRoleLabel,
  staffInitials,
  staffIdentityFromRaw,
  normalizeMeetStaffAssignments,
  staffAssignmentsForMeet,
  upsertMeetStaffAssignment,
  clearMeetStaffAssignment,
  staffAvatarHtml,
  renderMeetStaffList,
  renderMeetStaffManager,
};
