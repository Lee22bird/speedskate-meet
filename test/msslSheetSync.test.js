const test = require('node:test');
const assert = require('node:assert/strict');
const { makeMsslGroupsTemplate, migrateMeet } = require('../services/meetHelpers');
const { parseMsslSnapshot, parseMeetAttendance, combineTeamAndAttendance, planMsslSync, applyMsslSync } = require('../services/msslSheetSync');
const createMsslSheetSyncRoutes = require('../routes/msslSheetSyncRoutes');
const googleSheets = require('../services/msslGoogleSheets');

const snapshot = [
  '\t\t\t\t\t\t\t\t\t\t\t\tOctober - Wichita',
  'Helmet #\tNAME\tDOB\tCurrent Age\tRace Age\tGender\tSkated LESS THAN 2 Years\tQuads\tNovice\tElite Division\tElite Challenge Up\tOpen\tAttendance Yes=1 No=0',
  '638B\tSkater One\t2015-01-01\t11\t11\tGirls\tTRUE\t\tYes\tYes\tYes\t\t1',
  '700\tSkater Two\t2014-01-01\t12\t12\tFemale\tFALSE\t1\t\t1\t\t\t0',
].join('\n');

function meetFixture() {
  return {
    id: 123, divisionScheme: 'mssl', groups: makeMsslGroupsTemplate(), quadGroups: [],
    registrations: [], baseEntryFee: 0, additionalRaceFee: 0, date: '2026-10-04', meetName: 'Season Opener',
  };
}

function pointsSnapshot(attendance) {
  return [
    'Helmet #\tNAME\tTEAM\tOctober - Wichita, KS',
    'Quad Juvenile Girls\t\t\tAttendance Yes=1 No=0',
    `638B\tSkater One\tTeam United\t${attendance}`,
    '700\tSkater Two\tTeam United\t0',
  ].join('\n');
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

test('joins team roster fields with attendance from the matching Total Points meet block', () => {
  const team = [
    'Helmet #\tNAME\tDOB\tCurrent Age\tRace Age\tGender\tSkated LESS THAN 2 Years\tQuads\tNovice\tElite Division\tElite Challenge Up\tOpen',
    '638B\tSkater One\t2015-01-01\t11\t11\tGirls\tTRUE\t\tYes\tYes\tYes\t',
    '700\tSkater Two\t2014-01-01\t12\t12\tFemale\tFALSE\t1\t\t1\t\t',
  ].join('\n');
  const points = Object.fromEntries(['Quad', 'Novice', 'Elite', 'Open'].map(category => [`${category} Total Points`, pointsSnapshot(category === 'Elite' ? '1' : '0')]));
  const combined = combineTeamAndAttendance(team, points, { ...meetFixture(), rinkLabel: 'Roller City • Wichita • KS' });
  assert.equal(combined.error, undefined);
  assert.match(combined.attendanceLabel, /October - Wichita/);
  const parsed = parseMsslSnapshot(combined.snapshot);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].name, 'Skater One');
  assert.equal(parsed.rows[0].elite, true);
  assert.equal(combined.snapshot.includes('2015-01-01'), false);
});

test('sets each race category only from its matching points-tab attendance', () => {
  const team = [
    'Helmet #\tNAME\tDOB\tCurrent Age\tRace Age\tGender\tSkated LESS THAN 2 Years\tQuads\tNovice\tElite Division\tElite Challenge Up\tOpen',
    '596\tSkater One\t2015-01-01\t11\t11\tGirls\tTRUE\tYes\tYes\tYes\tYes\tYes',
    '597\tSkater Two\t2014-01-01\t12\t12\tGirls\tFALSE\tYes\tYes\tYes\tYes\tYes',
  ].join('\n');
  const makeTab = (first, second) => [
    'Helmet #\tNAME\tTEAM\tOctober - Wichita, KS',
    'Division\t\t\tAttendance Yes=1 No=0',
    `596\tSkater One\tTeam United\t${first}`,
    `597\tSkater Two\tTeam United\t${second}`,
  ].join('\n');
  const points = {
    'Quad Total Points': makeTab('1', '0'),
    'Novice Total Points': makeTab('0', '1'),
    'Elite Total Points': makeTab('0', '0'),
    'Open Total Points': makeTab('0', '0'),
  };
  const combined = combineTeamAndAttendance(team, points, { ...meetFixture(), rinkLabel: 'Roller City • Wichita • KS' });
  const parsed = parseMsslSnapshot(combined.snapshot);
  assert.deepEqual(parsed.rows.map(row => ({
    name: row.name, quad: row.quad, novice: row.novice, elite: row.elite, open: row.open,
  })), [
    { name: 'Skater One', quad: true, novice: false, elite: false, open: false },
    { name: 'Skater Two', quad: false, novice: true, elite: false, open: false },
  ]);
});

test('accepts the Elite Total Points C$ helmet-number header', () => {
  const elite = [
    'C$\tNAME\tTEAM\tOctober - Wichita',
    'Tiny Tot Girls\t\t\tAttendance Yes=1 No=0',
    '638B\tSkater One\tTeam United\t1',
    '700\tSkater Two\tTeam United\t0',
  ].join('\n');
  const parsed = parseMeetAttendance(elite, {
    ...meetFixture(), rinkLabel: 'Roller City • Wichita • KS',
  }, 'Elite Total Points');
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.attending.has('638b\u0000skater one'), true);
  assert.equal(parsed.attending.has('700\u0000skater two'), false);
});

test('does not mistake a different meet attendance block for the current meet', () => {
  const team = snapshot.split('\n').slice(1, 3).map(line => line.split('\t').slice(0, 12).join('\t')).join('\n');
  const points = Object.fromEntries(['Quad', 'Novice', 'Elite', 'Open'].map(category => [`${category} Total Points`, pointsSnapshot('0').replace('October - Wichita, KS', 'November - Union, MO')]));
  const combined = combineTeamAndAttendance(team, points, { ...meetFixture(), rinkLabel: 'Roller City • Wichita • KS' });
  assert.match(combined.error, /Could not match/);
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

test('the same helmet number is allowed across different birth-age divisions', () => {
  const meet = meetFixture();
  meet.registrations.push({ id: 1, name: 'Greta Manchee', helmetNumber: '1172', age: 8, gender: 'female', options: { elite: true } });
  const row = parseMsslSnapshot(snapshot).rows[0];
  const mike = { ...row, helmetNumber: '1172', name: 'Mike Paeth', age: 47, gender: 'male' };
  const plans = planMsslSync([mike], meet, 'Team Velocity');
  assert.equal(plans[0].status, 'NEW');
  assert.match(plans[0].notes.join(' '), /used in another age division/);
});

test('source helmet duplicates are allowed across divisions but blocked within one division', () => {
  const meet = meetFixture();
  const row = parseMsslSnapshot(snapshot).rows[0];
  const older = { ...row, helmetNumber: '1170', name: 'James Ashley Rumfelt', age: 50, gender: 'male' };
  const younger = { ...row, helmetNumber: '1170', name: 'Arabella Smith', age: 8, gender: 'female' };
  const differentDivisions = planMsslSync([older, younger], meet, 'Team Velocity');
  assert.deepEqual(differentDivisions.map(plan => plan.status), ['NEW', 'NEW']);
  assert.match(differentDivisions[1].notes.join(' '), /used in another age division/);

  const sameDivision = planMsslSync([
    older,
    { ...older, name: 'Another Veteran' },
  ], meet, 'Team Velocity');
  assert.deepEqual(sameDivision.map(plan => plan.status), ['NEW', 'REVIEW']);
  assert.match(sameDivision[1].reason, /same age division/);
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

test('fetched-data preview strips DOB before returning the confirmation page', () => {
  const meet = meetFixture();
  const sanitized = parseMsslSnapshot(snapshot);
  const router = createMsslSheetSyncRoutes({
    requireRole: () => (req, res, next) => next(),
    pageShell: ({ bodyHtml }) => bodyHtml,
    saveDb: () => {},
  });
  const layer = router.stack.find(item => item.route?.path === '/portal/meet/:meetId/mssl-sheet-sync/review-fetched');
  const handler = layer.route.stack.at(-1).handle;
  const req = {
    params: { meetId: meet.id }, body: { team: 'Team United', tabTitle: 'Team United', snapshot: sanitized.safeSnapshot, attendanceColumnIndex: sanitized.safeSelectedAttendance },
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

test('a bad tab selection keeps the team-tab choices and explains the roster-tab requirement', async () => {
  const meet = meetFixture();
  const oldEnv = Object.fromEntries([
    'MSSL_SHEETS_CLIENT_ID', 'MSSL_SHEETS_CLIENT_SECRET', 'MSSL_SHEETS_TOKEN_ENCRYPTION_KEY',
    'MSSL_SHEETS_SPREADSHEET_ID', 'MSSL_SHEETS_REDIRECT_URI',
  ].map(key => [key, process.env[key]]));
  const original = {
    accessToken: googleSheets.accessToken,
    listTabs: googleSheets.listTabs,
    fetchTab: googleSheets.fetchTab,
  };
  try {
    process.env.MSSL_SHEETS_CLIENT_ID = 'client';
    process.env.MSSL_SHEETS_CLIENT_SECRET = 'secret';
    process.env.MSSL_SHEETS_TOKEN_ENCRYPTION_KEY = 'test-encryption-key';
    process.env.MSSL_SHEETS_SPREADSHEET_ID = 'spreadsheet';
    process.env.MSSL_SHEETS_REDIRECT_URI = 'https://example.test/callback';
    meet.msslSheetConnection = { encryptedRefreshToken: googleSheets.encryptToken('refresh', 'test-encryption-key') };
    googleSheets.accessToken = async () => 'bearer';
    googleSheets.listTabs = async () => [
      { title: 'Team United - Wichita' }, { title: 'OCT SCHEDULE' },
      ...['Quad', 'Novice', 'Elite', 'Open'].map(name => ({ title: `${name} Total Points` })),
    ];
    googleSheets.fetchTab = async (_id, title) => title === 'OCT SCHEDULE'
      ? 'Schedule\tData'
      : title === 'Team United - Wichita'
        ? 'Helmet #\tNAME\tRace Age\tGender\tQuads\tNovice\tElite Division\tOpen\n703\tKoralyne Hick\t12\tGirls\t\tYes\tYes\t'
        : pointsSnapshot('0');

    const router = createMsslSheetSyncRoutes({
      requireRole: () => (req, res, next) => next(),
      pageShell: ({ bodyHtml }) => bodyHtml,
      saveDb: () => {},
    });
    const layer = router.stack.find(item => item.route?.path === '/portal/meet/:meetId/mssl-sheet-sync/fetch-preview');
    const handler = layer.route.stack.at(-1).handle;
    const req = {
      params: { meetId: meet.id },
      body: { team: 'Team United - Wichita', tabTitle: 'OCT SCHEDULE' },
      db: { meets: [meet] },
      user: { roles: ['super_admin'] },
    };
    const res = {
      send(html) { this.html = html; return this; },
      status(code) { this.statusCode = code; return this; },
    };
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.html, /Could not find the Helmet # and NAME header row on the selected team tab/);
    assert.match(res.html, /option value="Team United - Wichita"/);
    assert.match(res.html, /name="team"[^>]*value="Team United - Wichita"/);
    assert.match(res.html, /value="OCT SCHEDULE" selected/);
    assert.match(res.html, /checks attendance in the Quad, Novice, Elite, and Open Total Points tabs/);
  } finally {
    Object.assign(googleSheets, original);
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
