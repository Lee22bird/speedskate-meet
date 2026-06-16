function hasRole(user, role) {
  return Array.isArray(user.roles) && user.roles.includes(role);
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
  if (!hasRole(user, 'meet_director')) return false;
  return isMeetOwner(user, meet);
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
  ensureMeetOwnership,
  isMeetOwner,
  canEditMeet,
  canDeleteMeet,
  canArchiveMeet,
  canManageMeetSettings,
};
