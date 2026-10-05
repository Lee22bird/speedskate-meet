const test = require('node:test');
const assert = require('node:assert/strict');
const { makeMsslGroupsTemplate, migrateMeet } = require('../services/meetHelpers');
const { parseMsslSnapshot, planMsslSync, applyMsslSync } = require('../services/msslSheetSync');
const createMsslSheetSyncRoutes = require('../routes/msslSheetSyncRoutes');

const snapshot = [
  '\t\t\t\t\t\t\t\t\t\t\t\tOctober - Wichita',
  'Helmet #\tNAME\tDOB\tCurrent Age\tRace Age\tGender\tSkated LESS THAN 2 Years\tQuads\tNovice\tElite Division\tElite Challenge Up\tOpen\tAttendance Yes=1 No=0',
  '638B\tSkater One\t2015-01-01\t11\t11\tGirls\tTRUE\t\tYes\tYes\tYes\t\t1',
  '700\tSkater Two\t2014-01-01\t12\t12\tFemale\tFALSE\t1\t\t1\t\t\t0',
].join('\n');

function meetFixture() {
  return {
    id: 123, divisionScheme: 'mssl', groups: makeMsslGroupsTemplate(), quadGroups: [],
    registrations: [], baseEntryFee: 0, additionalRaceFee: 0,
  };
}

test('parses only attending rows and excludes personal columns from parsed output', () => {
  const parsed = parseMsslSnapshot(snapshot);
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.attendanceLabel, 'October - Wichita');
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0], {
    sourceRow: 3, helmetNumber: '638B', name: 'Skater One', age: 11, gender: 'female',
    quad: false, novice: true, elite: true, challengeUp: true, open: false,
  });
  assert.equal(JSON.stringify(parsed).includes('2015-01-01'), false);
});

test('requires selection when a sheet snapshot contains multiple meet attendance columns', () => {
  const twoMeetSnapshot = snapshot.replace('Attendance Yes=1 No=0', 'Attendance Yes=1 No=0\tAttendance Yes=1 No=0')
    .replace('October - Wichita', 'October - Wichita\tNovember - Union')
    .replace('\t1\n', '\t1\t1\n');
  const parsed = parseMsslSnapshot(twoMeetSnapshot);
  assert.equal(parsed.needsAttendanceChoice, true);
  assert.equal(parsed.attendanceColumns.length, 2);
  const selected = parseMsslSnapshot(twoMeetSnapshot, 12);
  assert.equal(selected.attendanceLabel, 'October - Wichita');
  const confirmed = parseMsslSnapshot(selected.safeSnapshot, selected.safeSelectedAttendance);
  assert.equal(confirmed.rows.length, 1);
  assert.equal(confirmed.attendanceLabel, 'October - Wichita');
  assert.equal(confirmed.safeSnapshot.includes('2015-01-01'), false);
});

test('duplicate-safe planning adds new skaters, updates exact identities, and blocks conflicts', () => {
  const meet = meetFixture();
  meet.registrations.push({ id: 1, name: 'Skater One', helmetNumber: '638B', age: 11, gender: 'female', team: 'Old Team',
    originalDivisionGroupId: 'elementary_girls', divisionGroupId: 'elementary_girls', options: { novice: false, elite: true },
    paid: true, checkedIn: true, email: 'private@example.test', birthdate: '2015-01-01', sponsor: 'Keep', meetNumber: 1 });
  const rows = parseMsslSnapshot(snapshot).rows;
  const plans = planMsslSync(rows, meet, 'Team United - Wichita');
  assert.equal(plans[0].status, 'UPDATE');
  const result = applyMsslSync(plans, meet);
  assert.deepEqual(result, { added: 0, updated: 1 });
  assert.equal(meet.registrations[0].team, 'Team United - Wichita');
  assert.equal(meet.registrations[0].options.challengeUp, false);
  assert.equal(meet.registrations[0].paid, true);
  assert.equal(meet.registrations[0].checkedIn, true);
  assert.equal(meet.registrations[0].email, 'private@example.test');
  assert.equal(meet.registrations[0].birthdate, '2015-01-01');
  assert.equal(meet.registrations[0].sponsor, 'Keep');
  assert.equal(meet.registrations[0].helmetNumber, '638B');
  assert.match(plans[0].notes.join(' '), /not eligible for Challenge Up/);

  const conflict = planMsslSync([{ ...rows[0], name: 'Another Skater' }], meet, 'Team United - Wichita');
  assert.equal(conflict[0].status, 'REVIEW');
  assert.match(conflict[0].reason, /different registered name/);
});

test('new registrations never retain DOB and alphanumeric helmets survive meet migration', () => {
  const meet = meetFixture();
  const plans = planMsslSync(parseMsslSnapshot(snapshot).rows, meet, 'Team United - Wichita');
  const result = applyMsslSync(plans, meet);
  assert.deepEqual(result, { added: 1, updated: 0 });
  assert.equal(meet.registrations[0].birthdate, '');
  assert.equal(meet.registrations[0].email, '');
  migrateMeet(meet);
  assert.equal(meet.registrations[0].helmetNumber, '638B');
  const { ensureRegistrationTotalsAndNumbers } = require('../services/meetHelpers');
  ensureRegistrationTotalsAndNumbers(meet);
  assert.equal(meet.registrations[0].helmetNumber, '638B');
});

test('preview route strips DOB before returning the confirmation page', () => {
  const meet = meetFixture();
  const router = createMsslSheetSyncRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: ({ bodyHtml }) => bodyHtml,
    saveDb: () => {},
  });
  const layer = router.stack.find(item => item.route?.path === '/portal/meet/:meetId/mssl-sheet-sync/preview');
  const handler = layer.route.stack.at(-1).handle;
  const req = {
    params: { meetId: meet.id }, body: { team: 'Team United', snapshot },
    db: { meets: [meet] }, user: { roles: ['super_admin'] },
  };
  const res = {
    send(html) { this.html = html; return this; },
    redirect(location) { this.location = location; return this; },
    status(code) { this.statusCode = code; return this; },
  };
  handler(req, res);
  assert.match(res.html, /MSSL Sheet Import Preview/);
  assert.match(res.html, /638B/);
  assert.equal(res.html.includes('2015-01-01'), false);
});
