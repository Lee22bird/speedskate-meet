const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const { saveMeetIdentityFields } = require(path.join(ROOT, 'services', 'meetIdentityFields'));

test('preset loading retains unsaved meet-specific form fields', () => {
  const meet = {
    meetName: 'Old Name',
    rinkId: 1,
    status: 'draft',
    trackLength: 100,
    lanes: 4,
  };
  const db = {
    rinks: [
      { id: 7, name: 'Derby Public Skating Rink', city: 'Derby', state: 'KS' },
    ],
  };

  saveMeetIdentityFields(meet, {
    meetName: 'Friday Night League Meet',
    leagueAssociation: 'Mid South Speed League',
    date: '2026-09-11',
    endDate: '2026-09-12',
    startTime: '18:30',
    registrationCloseDate: '2026-09-09',
    registrationCloseTime: '23:59',
    rinkSearch: 'Derby Public Skating Rink (Derby, KS)',
    rinkId: '7',
    status: 'published',
    notes: 'Meet details',
    scheduleNotes: 'Doors open at 5:00 PM',
    relayNotes: 'Relay instructions',
    relayDeadline: 'Friday at noon',
  }, db);

  assert.strictEqual(meet.meetName, 'Friday Night League Meet');
  assert.strictEqual(meet.leagueAssociation, 'Mid South Speed League');
  assert.strictEqual(meet.league, 'Mid South Speed League');
  assert.strictEqual(meet.date, '2026-09-11');
  assert.strictEqual(meet.endDate, '2026-09-12');
  assert.strictEqual(meet.startTime, '18:30');
  assert.strictEqual(meet.registrationCloseAt, '2026-09-09T23:59:00');
  assert.strictEqual(meet.rinkId, 7);
  assert.strictEqual(meet.customRinkName, '');
  assert.strictEqual(meet.status, 'published');
  assert.strictEqual(meet.isPublic, true);
  assert.strictEqual(meet.notes, 'Meet details');
  assert.strictEqual(meet.scheduleNotes, 'Doors open at 5:00 PM');
  assert.strictEqual(meet.relayNotes, 'Relay instructions');
  assert.strictEqual(meet.relayDeadline, 'Friday at noon');

  // These belong to the reusable setup and must remain available for the
  // selected preset to replace after the identity fields are saved.
  assert.strictEqual(meet.trackLength, 100);
  assert.strictEqual(meet.lanes, 4);
});
