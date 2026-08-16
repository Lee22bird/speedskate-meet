// ── Protests ─────────────────────────────────────────────────────────────────
// Coach-filed written complaints, ruled by officials (judge / meet_director —
// there is no `referee` role in this app; USARS SR961.11). Stored on
// meet.protests[]. Per USARS SR503.2 a DQ / placement / foul CALL cannot be
// protested — that gating lives in the filing view's copy and category list, not
// here. This module is pure data helpers so it stays unit-testable.

// USARS glossary categories (a written complaint concerning one of these six).
const PROTEST_CATEGORIES = ['Competition', 'Eligibility', 'Status', 'Conduct', 'Officials', 'Membership'];
// Only these three are tied to a specific race; the others are meet-wide, so the
// filing form hides the race picker for them.
const RACE_SPECIFIC_CATEGORIES = ['Competition', 'Eligibility', 'Conduct'];
const PROTEST_STATES = ['new', 'review', 'upheld', 'denied'];

function isRaceSpecific(category) {
  return RACE_SPECIFIC_CATEGORIES.includes(String(category || ''));
}

// Next sequential display id for a meet, e.g. P-003. Based on the count of
// existing protests so ids stay stable and human-readable per meet.
function nextProtestId(meet) {
  const n = (Array.isArray(meet && meet.protests) ? meet.protests.length : 0) + 1;
  return 'P-' + String(n).padStart(3, '0');
}

function protestsForMeet(meet) {
  return Array.isArray(meet && meet.protests) ? meet.protests : [];
}

// A coach only ever sees protests they filed — same containment rule as DQ notes.
function protestsForCoach(meet, userId) {
  const uid = String(userId || '');
  if (!uid) return [];
  return protestsForMeet(meet).filter(p => String(p.filedByUserId || '') === uid);
}

// Any UNRESOLVED protest against a race → the score sheet ticks "Protest Filed".
function raceHasProtest(meet, raceId) {
  const rid = String(raceId || '');
  if (!rid) return false;
  return protestsForMeet(meet).some(p => String(p.raceId || '') === rid);
}

function findProtest(meet, protestId) {
  return protestsForMeet(meet).find(p => String(p.id) === String(protestId)) || null;
}

// Normalize a stored protest so the views never crash on a partial record.
function normalizeProtest(p) {
  return {
    id: String(p.id || ''),
    createdAt: String(p.createdAt || ''),
    category: String(p.category || ''),
    raceId: String(p.raceId || ''),
    raceLabel: String(p.raceLabel || ''),
    registrationId: String(p.registrationId || ''),
    filedByUserId: String(p.filedByUserId || ''),
    filedByName: String(p.filedByName || ''),
    team: String(p.team || ''),
    statement: String(p.statement || ''),
    state: PROTEST_STATES.includes(p.state) ? p.state : 'new',
    ruling: String(p.ruling || ''),
    ruledByUserId: String(p.ruledByUserId || ''),
    ruledByName: String(p.ruledByName || ''),
    ruledAt: String(p.ruledAt || ''),
    correctionRaceId: String(p.correctionRaceId || ''),
  };
}

// Validate + create. Returns { ok, error?, protest? }. Does not persist.
function buildProtest(meet, input, nowIso) {
  const category = String(input.category || '').trim();
  const statement = String(input.statement || '').trim();
  if (!PROTEST_CATEGORIES.includes(category)) return { ok: false, error: 'Choose a valid protest category.' };
  if (!statement) return { ok: false, error: 'A written statement is required.' };
  if (statement.length > 2000) return { ok: false, error: 'Statement is too long (2000 character max).' };
  const raceId = isRaceSpecific(category) ? String(input.raceId || '') : '';
  return {
    ok: true,
    protest: normalizeProtest({
      id: nextProtestId(meet),
      createdAt: nowIso,
      category,
      raceId,
      raceLabel: String(input.raceLabel || ''),
      registrationId: String(input.registrationId || ''),
      filedByUserId: String(input.filedByUserId || ''),
      filedByName: String(input.filedByName || ''),
      team: String(input.team || ''),
      statement,
      state: 'new',
    }),
  };
}

module.exports = {
  PROTEST_CATEGORIES, RACE_SPECIFIC_CATEGORIES, PROTEST_STATES,
  isRaceSpecific, nextProtestId, protestsForMeet, protestsForCoach,
  raceHasProtest, findProtest, normalizeProtest, buildProtest,
};
