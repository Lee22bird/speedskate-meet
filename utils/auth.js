// ── Meet-PIN identities ──────────────────────────────────────────────────────
// A staff PIN produces a user with NO platform roles (services/meetStaffPins.js).
// Every permission it has is decided here, and only ever for the ONE meet the
// PIN belongs to — so a PIN can never reach another meet, and can never satisfy
// a global role check.
function isMeetPinUser(user) {
  return !!(user && user.meetPinMeetId && user.meetPinRole);
}

// The role this PIN grants ON THIS MEET, or null when the user isn't a PIN user
// or the meet isn't the one the PIN was issued for.
function meetPinRoleFor(user, meet) {
  if (!isMeetPinUser(user)) return null;
  if (!meet || String(meet.id) !== String(user.meetPinMeetId)) return null;
  return String(user.meetPinRole);
}

function hasRole(user, role) {
  // PIN identities never satisfy a global role check — permissions come only
  // from the meet-scoped helpers below.
  if (isMeetPinUser(user)) return false;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (roles.includes(role)) return true;
  if (roles.includes('league_director') && ['meet_director', 'judge', 'coach'].includes(role)) return true;
  return false;
}

function isSuperAdmin(user) {
  return hasRole(user, 'super_admin');
}

function userSslId(user) {
  return String(
    user?.sslId ||
    user?.ssl_id ||
    user?.sslProfileId ||
    user?.ssl_profile_id ||
    user?.profile?.sslId ||
    user?.profile?.ssl_id ||
    ''
  ).trim();
}

function userDisplayName(user) {
  return String(user?.displayName || user?.name || user?.username || user?.email || '').trim();
}

function normalizeLeague(value) {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase();
  const aliases = {
    mssl: 'MSSL',
    'mid south speed league': 'MSSL',
    'mid-south speed league': 'MSSL',
    'mid-south-speed-league': 'MSSL',
    'mid south': 'MSSL',
    mwps: 'MWPS',
    'midwest point series': 'MWPS',
    glsl: 'GLSL',
    'great lakes speed league': 'GLSL',
    swpisl: 'SWPISL',
    'southwest pacific inline speed league': 'SWPISL',
  };
  return aliases[lower] || raw;
}

function userLeague(user) {
  return normalizeLeague(
    user?.league ||
    user?.leagueScope ||
    user?.league_code ||
    user?.profile?.league ||
    user?.profile?.pending_league ||
    ''
  );
}

function meetLeague(meet) {
  return normalizeLeague(meet?.leagueAssociation || meet?.league || meet?.league_code || '');
}

function isLeagueDirectorForMeet(user, meet) {
  if (isMeetPinUser(user)) return false;   // a PIN is never a league director
  if (!user || !meet) return false;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (!roles.includes('league_director')) return false;
  const left = userLeague(user);
  const right = meetLeague(meet);
  return !!left && !!right && left === right;
}

function ensureMeetOwnership(meet, user = null) {
  if (!meet) return meet;
  let migrated = false;

  if (meet.meet_owner_user_id == null || meet.meet_owner_user_id === '') {
    if (meet.createdByUserId != null && meet.createdByUserId !== '') {
      meet.meet_owner_user_id = meet.createdByUserId;
      migrated = true;
    }
  }

  if (!String(meet.meet_owner_name || '').trim()) {
    const legacyName = String(meet.createdBy || meet.createdByName || '').trim();
    if (legacyName) {
      meet.meet_owner_name = legacyName;
      migrated = true;
    } else if (
      user &&
      meet.meet_owner_user_id != null &&
      Number(meet.meet_owner_user_id) === Number(user.id) &&
      userDisplayName(user)
    ) {
      meet.meet_owner_name = userDisplayName(user);
      migrated = true;
    }
  }

  if (!String(meet.meet_owner_ssl_id || '').trim()) {
    const legacySslId = String(meet.ownerSslId || meet.owner_ssl_id || meet.createdBySslId || meet.created_by_ssl_id || '').trim();
    if (legacySslId) {
      meet.meet_owner_ssl_id = legacySslId;
      migrated = true;
    }
  }

  if (meet.ownership_locked == null && (meet.meet_owner_user_id != null || String(meet.meet_owner_ssl_id || '').trim())) {
    meet.ownership_locked = true;
    migrated = true;
  }

  if (migrated && !meet.ownershipMigratedAt) {
    meet.ownershipMigratedAt = new Date().toISOString();
  }

  return meet;
}

function isMeetOwner(user, meet) {
  if (isMeetPinUser(user)) return false;   // a PIN never owns a meet
  if (!user || !meet) return false;
  ensureMeetOwnership(meet, user);

  const ownerUserId = meet.meet_owner_user_id;
  if (ownerUserId != null && ownerUserId !== '' && Number(ownerUserId) === Number(user.id)) return true;

  const ownerSslId = String(meet.meet_owner_ssl_id || '').trim();
  const sslId = userSslId(user);
  return !!ownerSslId && !!sslId && ownerSslId === sslId;
}

// Tabulators get meet-director-level access on a meet only if they created/own
// it, or were specifically assigned as the tabulator for that meet — never
// system-wide across every meet in the database.
function isAssignedTabulatorForMeet(user, meet) {
  if (!user || !meet) return false;
  if (isMeetPinUser(user)) return meetPinRoleFor(user, meet) === 'tabulator';
  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (!roles.includes('judge')) return false;

  const rows = Array.isArray(meet.meet_staff_assignments)
    ? meet.meet_staff_assignments
    : (Array.isArray(meet.staffAssignments) ? meet.staffAssignments : []);
  // A meet can have MULTIPLE assigned tabulators — any of them qualifies (the
  // old single-row .find() silently locked out every tabulator after the first).
  const userId = user.id == null ? '' : String(user.id);
  const sslId = userSslId(user);
  return rows.some(row => {
    if (String(row?.staff_role || '') !== 'tabulator') return false;
    if (userId && String(row.staff_user_id || '') === userId) return true;
    if (sslId && String(row.staff_ssl_id || '') === sslId) return true;
    return false;
  });
}

function canEditMeet(user, meet) {
  // A meet-director PIN edits ONLY its own meet; every other PIN role, and every
  // other meet, is refused outright (no fall-through to the checks below).
  // NOTE: a TABULATOR pin deliberately does NOT get edit rights, even though an
  // assigned tabulator with a real account does. canEditMeet also gates deleting
  // and archiving the meet, and six digits handed across a scoring table should
  // not unlock that. PIN tabulators can still tabulate, rule protests, and print.
  if (isMeetPinUser(user)) return meetPinRoleFor(user, meet) === 'meet_director';
  if (isSuperAdmin(user)) return true;
  if (isLeagueDirectorForMeet(user, meet)) return true;
  // A tabulator who created this meet, or who was assigned as the tabulator
  // for this specific meet, gets the same access a meet director would have
  // on it — scoped to that one meet, not every meet in the system.
  if (isMeetOwner(user, meet) && hasRole(user, 'judge')) return true;
  if (isAssignedTabulatorForMeet(user, meet)) return true;
  if (!hasRole(user, 'meet_director')) return false;
  return isMeetOwner(user, meet);
}

function canJudgeMeet(user, meet) {
  // Tabulator/referee PINs judge their own meet; meet-director PINs do too.
  if (isMeetPinUser(user)) {
    const role = meetPinRoleFor(user, meet);
    return role === 'meet_director' || role === 'tabulator' || role === 'referee';
  }
  if (isSuperAdmin(user)) return true;
  if (isLeagueDirectorForMeet(user, meet)) return true;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('league_director') && !roles.includes('judge') && !roles.includes('meet_director')) return false;
  return hasRole(user, 'judge') || canEditMeet(user, meet);
}

function canDeleteMeet(user, meet) {
  return canEditMeet(user, meet);
}

function canArchiveMeet(user, meet) {
  return canEditMeet(user, meet);
}

function canManageMeetSettings(user, meet) {
  return canEditMeet(user, meet);
}

module.exports = {
  hasRole,
  isMeetPinUser,
  meetPinRoleFor,
  isSuperAdmin,
  userSslId,
  userLeague,
  meetLeague,
  ensureMeetOwnership,
  isMeetOwner,
  isLeagueDirectorForMeet,
  isAssignedTabulatorForMeet,
  canEditMeet,
  canJudgeMeet,
  canDeleteMeet,
  canArchiveMeet,
  canManageMeetSettings,
};
