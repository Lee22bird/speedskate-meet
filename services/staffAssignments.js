const crypto = require('crypto');
const { esc } = require('../utils/html');
const { nowIso } = require('../utils/date');

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

function normalizeMeetStaffAssignments(meet) {
  if (!meet) return [];
  const raw = Array.isArray(meet.meet_staff_assignments)
    ? meet.meet_staff_assignments
    : (Array.isArray(meet.staffAssignments) ? meet.staffAssignments : []);
  const byRole = new Map();
  raw.forEach(item => {
    const normalized = normalizeStaffAssignment(item, meet.id);
    if (normalized) byRole.set(normalized.staff_role, normalized);
  });
  const rows = STAFF_ROLES.map(role => byRole.get(role.key)).filter(Boolean);
  meet.meet_staff_assignments = rows;
  meet.staffAssignments = rows.map(row => ({ ...row }));
  return rows;
}

function staffAssignmentsForMeet(meet) {
  const rows = normalizeMeetStaffAssignments(meet);
  const byRole = new Map(rows.map(row => [row.staff_role, row]));
  return STAFF_ROLES.map(role => ({ ...role, assignment: byRole.get(role.key) || null }));
}

function upsertMeetStaffAssignment(meet, roleKey, person, assignedByUserId) {
  if (!meet) throw new Error('Meet not found.');
  if (!STAFF_ROLE_KEYS.has(roleKey)) throw new Error('Unsupported staff role.');
  const identity = staffIdentityFromRaw(person);
  if (!identity.staff_ssl_id && !identity.staff_user_id) throw new Error('Choose a valid SSL profile.');
  if (!identity.staff_name) throw new Error('SSL profile name is required.');
  const rows = normalizeMeetStaffAssignments(meet).filter(row => row.staff_role !== roleKey);
  const now = nowIso();
  const existing = normalizeMeetStaffAssignments(meet).find(row => row.staff_role === roleKey);
  const assignment = {
    id: existing?.id || `staff_${roleKey}_${crypto.randomBytes(5).toString('hex')}`,
    meet_id: String(meet.id || ''),
    ...identity,
    staff_role: roleKey,
    assigned_by_user_id: assignedByUserId == null ? '' : String(assignedByUserId),
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  meet.meet_staff_assignments = [...rows, assignment];
  meet.staffAssignments = meet.meet_staff_assignments.map(row => ({ ...row }));
  meet.updatedAt = now;
  return assignment;
}

function clearMeetStaffAssignment(meet, roleKey) {
  if (!meet) throw new Error('Meet not found.');
  if (!STAFF_ROLE_KEYS.has(roleKey)) throw new Error('Unsupported staff role.');
  const rows = normalizeMeetStaffAssignments(meet).filter(row => row.staff_role !== roleKey);
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
  const rows = staffAssignmentsForMeet(meet).filter(row => row.assignment);
  if (!rows.length) {
    return options.emptyMessage ? `<div class="muted">${esc(options.emptyMessage)}</div>` : '';
  }
  return `
    <div class="meet-staff-list">
      ${rows.map(row => renderStaffPerson(row.assignment, row.label, !!options.compact)).join('')}
    </div>`;
}

function renderMeetStaffManager({ meet, canManage = false }) {
  const rows = staffAssignmentsForMeet(meet);
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
          const current = row.assignment;
          return `
            <div class="staff-assignment-row" data-staff-role="${esc(row.key)}">
              <div class="staff-assignment-current">
                ${current ? renderStaffPerson(current, row.label) : `
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
                  <input type="search" class="staff-search-input" placeholder="Search SSL name or ID" autocomplete="off" aria-label="Search SSL ${esc(row.label)}">
                  <div class="staff-search-results" aria-live="polite"></div>
                  ${current ? `<form method="POST" action="/portal/meet/${esc(meet.id)}/staff/remove" class="staff-remove-form"><input type="hidden" name="staff_role" value="${esc(row.key)}"><button class="btn2 btn-sm" type="submit">Remove</button></form>` : ''}
                </div>` : ''}
            </div>`;
        }).join('')}
      </div>
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
                        results.innerHTML = '<div class="staff-result-empty">No matching SSL staff found.</div>';
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
