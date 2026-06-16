function hasRole(user, role) {
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
  if (!user || !meet) return false;
  ensureMeetOwnership(meet, user);

  const ownerUserId = meet.meet_owner_user_id;
  if (ownerUserId != null && ownerUserId !== '' && Number(ownerUserId) === Number(user.id)) return true;

  const ownerSslId = String(meet.meet_owner_ssl_id || '').trim();
  const sslId = userSslId(user);
  return !!ownerSslId && !!sslId && ownerSslId === sslId;
}

function canEditMeet(user, meet) {
  if (isSuperAdmin(user)) return true;
  if (isLeagueDirectorForMeet(user, meet)) return true;
  if (!hasRole(user, 'meet_director')) return false;
  return isMeetOwner(user, meet);
}

function canJudgeMeet(user, meet) {
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
  isSuperAdmin,
  userSslId,
  userLeague,
  meetLeague,
  ensureMeetOwnership,
  isMeetOwner,
  isLeagueDirectorForMeet,
  canEditMeet,
  canJudgeMeet,
  canDeleteMeet,
  canArchiveMeet,
  canManageMeetSettings,
};
