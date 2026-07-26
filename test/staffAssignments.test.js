// Multi-person meet staff: a meet can carry MULTIPLE meet directors, tabulators,
// referees (and announcers). The old model kept ONE person per role — and
// normalizeMeetStaffAssignments runs on EVERY load, so extra staff would have
// been silently deleted on reload (the §10 bug class, in staff form). These
// tests pin the multi model end to end, including the migrateMeet round-trip
// and the access-control helper that gates race-day entry.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMeetStaffAssignments,
  staffAssignmentsForMeet,
  upsertMeetStaffAssignment,
  clearMeetStaffAssignment,
  renderMeetStaffManager,
  renderMeetStaffList,
} = require('../services/staffAssignments');
const { migrateMeet } = require('../services/meetHelpers');
const { isAssignedTabulatorForMeet } = require('../utils/auth');

const person = (id, name, ssl) => ({ staff_user_id: id, staff_name: name, staff_ssl_id: ssl });

function meetWithStaff() {
  const meet = { id: 42, meetName: 'Staffed Meet', races: [], registrations: [], blocks: [], meet_staff_assignments: [] };
  upsertMeetStaffAssignment(meet, 'meet_director', person('u1', 'Lee Bird', 'SSL-000002'), 'u1');
  upsertMeetStaffAssignment(meet, 'meet_director', person('u2', 'Second Director', 'SSL-000009'), 'u1');
  upsertMeetStaffAssignment(meet, 'tabulator', person('u3', 'Jessica Tab', 'SSL-000010'), 'u1');
  upsertMeetStaffAssignment(meet, 'tabulator', person('u4', 'Backup Tab', 'SSL-000011'), 'u1');
  upsertMeetStaffAssignment(meet, 'referee', person('u5', 'Ref One', 'SSL-000012'), 'u1');
  upsertMeetStaffAssignment(meet, 'referee', person('u6', 'Ref Two', 'SSL-000013'), 'u1');
  return meet;
}

test('multiple people per role are kept, grouped, and role-ordered', () => {
  const meet = meetWithStaff();
  const rows = staffAssignmentsForMeet(meet);
  const byKey = new Map(rows.map(r => [r.key, r.assignments]));
  assert.equal(byKey.get('meet_director').length, 2);
  assert.equal(byKey.get('tabulator').length, 2);
  assert.equal(byKey.get('referee').length, 2);
  assert.equal(byKey.get('announcer').length, 0);
  // Same person re-assigned to the same role collapses (no duplicates)...
  upsertMeetStaffAssignment(meet, 'meet_director', person('u1', 'Lee Bird', 'SSL-000002'), 'u1');
  assert.equal(staffAssignmentsForMeet(meet).find(r => r.key === 'meet_director').assignments.length, 2);
  // ...but the same person CAN hold two different roles.
  upsertMeetStaffAssignment(meet, 'announcer', person('u1', 'Lee Bird', 'SSL-000002'), 'u1');
  assert.equal(staffAssignmentsForMeet(meet).find(r => r.key === 'announcer').assignments.length, 1);
});

test('multi-person staff survives a migrateMeet reload round-trip (§10 guard)', () => {
  const meet = meetWithStaff();
  const reloaded = JSON.parse(JSON.stringify(meet));
  migrateMeet(reloaded, 'owner');
  const rows = staffAssignmentsForMeet(reloaded);
  assert.equal(rows.find(r => r.key === 'meet_director').assignments.length, 2, 'reload dropped a meet director');
  assert.equal(rows.find(r => r.key === 'tabulator').assignments.length, 2, 'reload dropped a tabulator');
  assert.equal(rows.find(r => r.key === 'referee').assignments.length, 2, 'reload dropped a referee');
  const names = reloaded.meet_staff_assignments.map(a => a.staff_name);
  for (const n of ['Lee Bird', 'Second Director', 'Jessica Tab', 'Backup Tab', 'Ref One', 'Ref Two']) {
    assert.ok(names.includes(n), `${n} lost on reload`);
  }
});

test('remove targets ONE assignment by id; role-only removal clears the role (legacy)', () => {
  const meet = meetWithStaff();
  const directors = staffAssignmentsForMeet(meet).find(r => r.key === 'meet_director').assignments;
  clearMeetStaffAssignment(meet, 'meet_director', directors.find(a => a.staff_name === 'Second Director').id);
  const after = staffAssignmentsForMeet(meet).find(r => r.key === 'meet_director').assignments;
  assert.equal(after.length, 1);
  assert.equal(after[0].staff_name, 'Lee Bird', 'removed the wrong director');
  // Legacy no-id removal clears the whole role.
  clearMeetStaffAssignment(meet, 'tabulator');
  assert.equal(staffAssignmentsForMeet(meet).find(r => r.key === 'tabulator').assignments.length, 0);
});

test('EVERY assigned tabulator gets race-day access (not just the first row)', () => {
  const meet = meetWithStaff();
  const asUser = (id, ssl) => ({ id, ssl_skater_id: ssl, roles: ['judge'] });
  assert.equal(isAssignedTabulatorForMeet(asUser('u3', 'SSL-000010'), meet), true, 'first tabulator');
  assert.equal(isAssignedTabulatorForMeet(asUser('u4', 'SSL-000011'), meet), true, 'SECOND tabulator (old .find() locked them out)');
  assert.equal(isAssignedTabulatorForMeet(asUser('u9', 'SSL-000099'), meet), false, 'unassigned judge stays out');
  // Directors/referees don't get tabulator access through this helper.
  assert.equal(isAssignedTabulatorForMeet(asUser('u5', 'SSL-000012'), meet), false);
});

test('staff manager renders every person with a per-person Remove, and an add-search per role', () => {
  const meet = meetWithStaff();
  const html = renderMeetStaffManager({ meet, canManage: true });
  for (const n of ['Lee Bird', 'Second Director', 'Jessica Tab', 'Backup Tab', 'Ref One', 'Ref Two']) {
    assert.ok(html.includes(n), `manager missing ${n}`);
  }
  const removeForms = (html.match(/name="staff_assignment_id"/g) || []).length;
  assert.equal(removeForms, 6, 'one targeted Remove per assigned person');
  assert.ok(html.includes('Add another Meet Director'), 'add-another affordance present');
  // Read-only list shows everyone too.
  const list = renderMeetStaffList(meet);
  for (const n of ['Second Director', 'Backup Tab', 'Ref Two']) assert.ok(list.includes(n), `list missing ${n}`);
});
