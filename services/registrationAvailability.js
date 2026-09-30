function enabledAdditionalGroups(meet = {}) {
  const groups = meet.additionalGroups || meet.additionalRaceGroups || meet.additionalRaces || meet.skateabilityGroups || [];
  return (Array.isArray(groups) ? groups : []).filter(group => group && group.enabled);
}

function registrationAvailability(meet = {}) {
  const groups = Array.isArray(meet.groups) ? meet.groups : [];
  const novice = groups.some(group => group?.divisions?.novice?.enabled);
  const elite = groups.some(group => group?.divisions?.elite?.enabled);

  return {
    challengeUp: !!meet.allowChallengeUp && (novice || elite),
    novice,
    elite,
    open: (meet.openGroups || []).some(group => group && group.enabled),
    quad: (meet.quadGroups || []).some(group => group && group.enabled),
    additionalGroups: enabledAdditionalGroups(meet),
  };
}

module.exports = {
  enabledAdditionalGroups,
  registrationAvailability,
};
