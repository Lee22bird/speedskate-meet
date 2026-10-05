const { findAgeGroup, challengeAdjustedGroup, normalizeSkaterGender } = require('./meetHelpers');
const { calcRegistrationCost } = require('./pricing');

const MAX_ROWS = 500;

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseTsv(text) {
  return String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.split('\t'));
}

function findHeaderIndex(row, choices) {
  const normalizedChoices = choices.map(normalizeHeader);
  return row.findIndex(value => normalizedChoices.includes(normalizeHeader(value)));
}

function parseMsslSnapshot(text, attendanceColumnIndex = '') {
  const rows = parseTsv(text);
  const headerRowIndex = rows.findIndex(row =>
    findHeaderIndex(row, ['helmet #', 'helmet number']) >= 0 &&
    findHeaderIndex(row, ['name', 'skater name']) >= 0
  );
  if (headerRowIndex < 0) return { error: 'Could not find the Helmet # and NAME header row.' };
  const headers = rows[headerRowIndex];
  const header = {
    helmet: findHeaderIndex(headers, ['helmet #', 'helmet number']),
    name: findHeaderIndex(headers, ['name', 'skater name']),
    age: findHeaderIndex(headers, ['race age']),
    gender: findHeaderIndex(headers, ['gender']),
    quad: findHeaderIndex(headers, ['quads', 'quad']),
    novice: findHeaderIndex(headers, ['novice']),
    elite: findHeaderIndex(headers, ['elite division', 'elite']),
    challengeUp: findHeaderIndex(headers, ['elite challenge up', 'challenge up']),
    open: findHeaderIndex(headers, ['open', 'open division']),
  };
  const missing = Object.entries(header).filter(([key, index]) => index < 0 && key !== 'challengeUp').map(([key]) => key);
  if (missing.length) return { error: `Missing required columns: ${missing.join(', ')}.` };

  const attendanceColumns = headers.map((value, index) =>
    /attendance\s+yes\s*=\s*1\s+no\s*=\s*0/i.test(clean(value)) ? {
      index,
      label: clean(rows[0]?.[index]) || `Attendance column ${index + 1}`,
    } : null
  ).filter(Boolean);
  if (!attendanceColumns.length) return { error: 'No "Attendance Yes=1 No=0" column found.' };

  const safeHeaders = ['Helmet #', 'NAME', 'Race Age', 'Gender', 'Quads', 'Novice', 'Elite Division', 'Elite Challenge Up', 'Open', ...attendanceColumns.map(() => 'Attendance Yes=1 No=0')];
  const safeFirstRow = Array(safeHeaders.length).fill('');
  attendanceColumns.forEach((column, index) => { safeFirstRow[9 + index] = column.label; });
  const safeRows = [safeFirstRow, safeHeaders];
  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some(value => clean(value))) continue;
    safeRows.push([
      clean(row[header.helmet]), clean(row[header.name]), clean(row[header.age]), clean(row[header.gender]),
      clean(row[header.quad]), clean(row[header.novice]), clean(row[header.elite]),
      header.challengeUp < 0 ? '' : clean(row[header.challengeUp]), clean(row[header.open]),
      ...attendanceColumns.map(column => clean(row[column.index])),
    ]);
  }
  const safeSnapshot = safeRows.map(row => row.join('\t')).join('\n');

  const selectedAttendance = attendanceColumnIndex === '' || attendanceColumnIndex == null
    ? (attendanceColumns.length === 1 ? attendanceColumns[0].index : null)
    : Number(attendanceColumnIndex);
  if (!Number.isInteger(selectedAttendance) || !attendanceColumns.some(column => column.index === selectedAttendance)) {
    return { attendanceColumns: attendanceColumns.map((column, index) => ({ ...column, safeIndex: 9 + index })), safeSnapshot, needsAttendanceChoice: true };
  }

  const isSelected = value => {
    const flag = clean(value).toLowerCase();
    return !!flag && !/^(0|no|n|false|off|-)$/i.test(flag);
  };
  const output = [];
  const invalidRows = [];
  const lastRelevantIndex = Math.max(...Object.values(header), selectedAttendance);
  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.slice(0, lastRelevantIndex + 1).some(value => clean(value))) continue;
    if (!isSelected(row[selectedAttendance])) continue;
    const record = {
      sourceRow: index + 1,
      helmetNumber: clean(row[header.helmet]),
      name: clean(row[header.name]),
      age: Number(clean(row[header.age])),
      gender: normalizeSkaterGender(row[header.gender]),
      quad: isSelected(row[header.quad]),
      novice: isSelected(row[header.novice]),
      elite: isSelected(row[header.elite]),
      challengeUp: header.challengeUp < 0 ? false : isSelected(row[header.challengeUp]),
      open: isSelected(row[header.open]),
    };
    if (!record.helmetNumber || !record.name || !Number.isInteger(record.age) || record.age < 1 || !record.gender) {
      invalidRows.push({ sourceRow: index + 1, reason: 'Missing helmet, name, valid Race Age, or gender.' });
      continue;
    }
    output.push(record);
    if (output.length > MAX_ROWS) return { error: `A single import is limited to ${MAX_ROWS} attending skaters.` };
  }
  return {
    rows: output,
    invalidRows,
    attendanceColumns,
    selectedAttendance,
    safeSelectedAttendance: 9 + attendanceColumns.findIndex(column => column.index === selectedAttendance),
    safeSnapshot,
    attendanceLabel: attendanceColumns.find(column => column.index === selectedAttendance)?.label || '',
    headerRow: headerRowIndex + 1,
  };
}

function normalizeHelmet(value) {
  return clean(value).toLowerCase().replace(/\s+/g, '');
}

function normalizeName(value) {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

function flagOptions(row) {
  const novice = !!row.novice;
  return {
    quad: !!row.quad,
    novice,
    elite: !!row.elite,
    challengeUp: !novice && !!row.challengeUp,
    open: !!row.open,
  };
}

function planMsslSync(rows, meet, team) {
  const source = Array.isArray(rows) ? rows : [];
  const existing = Array.isArray(meet?.registrations) ? meet.registrations : [];
  const seenHelmets = new Set();
  const seenNames = new Set();
  const plans = [];
  for (const row of source) {
    const helmetKey = normalizeHelmet(row.helmetNumber);
    const nameKey = normalizeName(row.name);
    const notes = [];
    let status = 'NEW';
    let reason = '';
    if (seenHelmets.has(helmetKey) || seenNames.has(nameKey)) {
      status = 'REVIEW';
      reason = 'Duplicate helmet or name in the pasted MSSL rows.';
    }
    seenHelmets.add(helmetKey);
    seenNames.add(nameKey);

    const helmetMatches = existing.filter(reg => normalizeHelmet(reg.helmetNumber) === helmetKey);
    const nameMatches = existing.filter(reg => normalizeName(reg.name) === nameKey);
    let target = null;
    if (!reason && helmetMatches.length > 1) {
      status = 'REVIEW'; reason = 'This helmet number already belongs to multiple SSM registrations.';
    } else if (!reason && helmetMatches.length === 1) {
      if (normalizeName(helmetMatches[0].name) !== nameKey) {
        status = 'REVIEW'; reason = 'Helmet number matches a different registered name.';
      } else {
        target = helmetMatches[0];
        status = 'UPDATE';
      }
    } else if (!reason && nameMatches.length) {
      status = 'REVIEW'; reason = 'Name already exists with a different helmet number.';
    }

    const baseGroup = findAgeGroup(meet.groups || [], row.age, row.gender);
    if (!reason && !baseGroup) {
      status = 'REVIEW'; reason = 'Race Age and gender do not map to a division in this meet.';
    }
    const options = flagOptions(row);
    if (row.novice && row.challengeUp) notes.push('Challenge Up cleared: novice skaters are not eligible for Challenge Up.');
    if (!reason && !Object.values(options).some(Boolean)) {
      status = 'REVIEW'; reason = 'No race category is selected for this attendee.';
    }
    const challengeGroup = challengeAdjustedGroup(meet, baseGroup, options.challengeUp);
    const candidate = {
      name: clean(row.name),
      helmetNumber: clean(row.helmetNumber),
      age: Number(row.age),
      gender: normalizeSkaterGender(row.gender),
      team: clean(team),
      originalDivisionGroupId: baseGroup?.id || '',
      originalDivisionGroupLabel: baseGroup?.label || '',
      divisionGroupId: challengeGroup?.id || baseGroup?.id || '',
      divisionGroupLabel: challengeGroup?.label || baseGroup?.label || 'Unassigned',
      options,
    };
    if (!reason && target) {
      const same = target.name === candidate.name && String(target.helmetNumber) === candidate.helmetNumber &&
        Number(target.age) === candidate.age && normalizeSkaterGender(target.gender) === candidate.gender &&
        clean(target.team) === candidate.team &&
        ['quad', 'novice', 'elite', 'challengeUp', 'open'].every(key => !!target.options?.[key] === !!options[key]);
      if (same) status = 'UNCHANGED';
    }
    plans.push({ sourceRow: row.sourceRow, status, reason, notes, targetId: target?.id ?? null, candidate });
  }
  return plans;
}

function applyMsslSync(plans, meet) {
  if (!Array.isArray(meet.registrations)) meet.registrations = [];
  let nextRegistrationId = meet.registrations.reduce((max, reg) => Math.max(max, Number(reg.id) || 0), 0) + 1;
  let nextMeetNumber = meet.registrations.reduce((max, reg) => Math.max(max, Number(reg.meetNumber) || 0), 0) + 1;
  let added = 0;
  let updated = 0;
  for (const plan of plans) {
    if (!['NEW', 'UPDATE'].includes(plan.status)) continue;
    const candidate = plan.candidate;
    const target = plan.status === 'UPDATE'
      ? meet.registrations.find(reg => String(reg.id) === String(plan.targetId))
      : null;
    if (target) {
      target.name = candidate.name;
      target.helmetNumber = candidate.helmetNumber;
      target.age = candidate.age;
      target.gender = candidate.gender;
      target.team = candidate.team;
      target.originalDivisionGroupId = candidate.originalDivisionGroupId;
      target.originalDivisionGroupLabel = candidate.originalDivisionGroupLabel;
      target.divisionGroupId = candidate.divisionGroupId;
      target.divisionGroupLabel = candidate.divisionGroupLabel;
      target.options = { ...(target.options || {}), ...candidate.options };
      target.totalCost = calcRegistrationCost(meet, target.options);
      target.importSource = 'mssl_sheet';
      updated += 1;
    } else {
      const reg = {
        id: nextRegistrationId++, createdAt: new Date().toISOString(),
        importSource: 'mssl_sheet', name: candidate.name, helmetNumber: candidate.helmetNumber,
        age: candidate.age, gender: candidate.gender, team: candidate.team, sponsor: '', email: '', birthdate: '',
        divisionGroupId: candidate.divisionGroupId, divisionGroupLabel: candidate.divisionGroupLabel,
        originalDivisionGroupId: candidate.originalDivisionGroupId,
        originalDivisionGroupLabel: candidate.originalDivisionGroupLabel,
        meetNumber: nextMeetNumber++, paid: false, checkedIn: false,
        options: { ...candidate.options },
      };
      reg.totalCost = calcRegistrationCost(meet, reg.options);
      meet.registrations.push(reg);
      added += 1;
    }
  }
  meet.updatedAt = new Date().toISOString();
  return { added, updated };
}

module.exports = { parseMsslSnapshot, planMsslSync, applyMsslSync, normalizeHelmet, normalizeName };
