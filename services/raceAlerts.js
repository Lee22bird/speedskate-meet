const { sendSms } = require('./sms');
const {
  STANDARD_POINTS,
  computeMeetStandings,
} = require('./standings');
const { cap } = require('../utils/html');

// Fire alerts when race advances — check 2-away and on-deck subscriptions.
async function fireRaceAlerts(meet, newIdx, ordered) {
  const subs = meet.textAlerts || [];
  if (!subs.length) return;

  // On deck (delta=1) and 2 away (delta=2)
  for (const delta of [1, 2]) {
    const targetRace = ordered[newIdx + delta];
    if (!targetRace) continue;

    for (const entry of targetRace.laneEntries || []) {
      const regId = String(entry.registrationId || '');
      const matched = subs.filter(s => String(s.registrationId || '') === regId);

      for (const sub of matched) {
        const laneInfo = targetRace.isOpenRace || targetRace.isTimeTrial
          ? ''
          : (entry.lane
            ? `\nLane ${entry.lane} • Helmet #${entry.helmetNumber || '?'}`
            : `\nLane TBD • Helmet #${entry.helmetNumber || '?'}`);

        const msg = delta === 1
          ? `⚡ ${entry.skaterName} is IN STAGING\n${targetRace.groupLabel} • ${cap(targetRace.division)} • ${targetRace.distanceLabel}${laneInfo}\n${meet.meetName}`
          : `🏁 Heads up! ${entry.skaterName} races in 2\n${targetRace.groupLabel} • ${cap(targetRace.division)} • ${targetRace.distanceLabel}${laneInfo}\n${meet.meetName}`;

        sendSms(sub.phone, msg);
      }
    }
  }
}

// Fire result alerts when a race closes.
async function fireResultAlerts(meet, race) {
  const subs = meet.textAlerts || [];
  if (!subs.length) return;

  const standings = computeMeetStandings(meet);
  const bucketKey = `${race.groupId}|${race.division}`;
  const section = standings.find(s => s.key === bucketKey);

  for (const entry of race.laneEntries || []) {
    if (!entry.place || !entry.registrationId) continue;

    const regId = String(entry.registrationId || '');
    const matched = subs.filter(s => String(s.registrationId || '') === regId);
    if (!matched.length) continue;

    const place = Number(entry.place);
    const placeEmoji = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}th`;
    const pts = STANDARD_POINTS[place];
    const skaterRow = section?.standings.find(r => String(r.registrationId || '') === regId);
    const totalPts = skaterRow?.totalPoints;

    let msg;
    if (race.isTimeTrial) {
      const sorted = [...(race.laneEntries || [])].sort(
        (a, b) => parseFloat(a.time || '999') - parseFloat(b.time || '999')
      );
      const ttPlace = sorted.findIndex(e => String(e.registrationId || '') === regId) + 1;
      msg = `⏱ ${entry.skaterName} — ${entry.time}\n${race.groupLabel}\nCurrent standing: ${ttPlace === 1 ? '🥇' : ttPlace === 2 ? '🥈' : ttPlace === 3 ? '🥉' : ttPlace + 'th'} place\n${meet.meetName}`;
    } else if (race.isOpenRace || race.countsForOverall === false) {
      msg = `✅ ${entry.skaterName} — ${placeEmoji} place!\n${race.groupLabel} • ${cap(race.division)} • ${race.distanceLabel}\nPlacement only\n${meet.meetName} 🏁`;
    } else if (pts) {
      msg = `✅ ${entry.skaterName} — ${placeEmoji} place!\n${race.groupLabel} • ${cap(race.division)} • ${race.distanceLabel}\n${pts} pts earned${totalPts != null ? ' | ' + totalPts + ' pts total' : ''}\n${meet.meetName} 🏁`;
    } else {
      msg = `✅ ${entry.skaterName} — ${placeEmoji} place!\n${race.groupLabel} • ${cap(race.division)} • ${race.distanceLabel}\n${meet.meetName} 🏁`;
    }

    for (const sub of matched) sendSms(sub.phone, msg);
  }
}

module.exports = {
  fireRaceAlerts,
  fireResultAlerts,
};
