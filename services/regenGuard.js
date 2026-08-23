// Guard for race-regenerating actions (division-scheme switch, Rebuild
// Assignments, builder regens). Once a meet has started racing — any race closed,
// or any place/time entered — regenerating rebuilds the race set and would wipe
// those entered results. These routes take a desktop backup first (recoverable)
// AND, when racing has started, refuse to regenerate silently: the director must
// re-submit with confirmRegen=1 (the builder renders a one-click "regenerate
// anyway" affordance). Pure helpers — no I/O.

function meetHasStartedRacing(meet) {
  const races = Array.isArray(meet && meet.races) ? meet.races : [];
  return races.some(r =>
    String(r.status || '') === 'closed' ||
    (Array.isArray(r.laneEntries) && r.laneEntries.some(l =>
      String(l.place || '').trim() || String(l.time || '').trim())));
}

// Small summary for the warning banner.
function startedRacingSummary(meet) {
  const races = Array.isArray(meet && meet.races) ? meet.races : [];
  const closed = races.filter(r => String(r.status || '') === 'closed').length;
  const scored = races.filter(r => Array.isArray(r.laneEntries)
    && r.laneEntries.some(l => String(l.place || '').trim() || String(l.time || '').trim())).length;
  return { closed, scored };
}

// True when the request explicitly confirmed a regenerate-after-racing.
function regenConfirmed(req) {
  return String((req.body && req.body.confirmRegen) || (req.query && req.query.confirmRegen) || '') === '1';
}

module.exports = { meetHasStartedRacing, startedRacingSummary, regenConfirmed };
