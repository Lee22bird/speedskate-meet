function hasRole(user, role) {
  return Array.isArray(user.roles) && user.roles.includes(role);
}

function isSuperAdmin(user) {
  return hasRole(user, 'super_admin');
}

function canEditMeet(user, meet) {
  if (hasRole(user, 'super_admin')) return true;
  if (hasRole(user, 'coach') && !hasRole(user, 'meet_director')) return false;
  if (hasRole(user, 'judge') && !hasRole(user, 'meet_director')) return false;
  if (hasRole(user, 'announcer') && !hasRole(user, 'meet_director')) return false;

  return Number(meet.createdByUserId) === Number(user.id);
}

module.exports = {
  hasRole,
  isSuperAdmin,
  canEditMeet,
};