// Desktop-only, ADDITIVE. Pulls coach-filed protests from the ONLINE copy of an
// imported meet into the local desktop meet, so officials running a meet on the
// SSM Desktop app see protests coaches file from their phones.
//
// v1 is one-way (pull) and best-effort:
//   • Rulings / fees entered on the desktop stay LOCAL — never pushed online.
//   • Silently no-ops when offline; it NEVER blocks the offline meet.
//
// Protest ids collide across copies (nextProtestId is just "P-00N" per meet,
// minted independently online and locally), so we dedupe on a NATURAL key
// (filer + race + createdAt + category), tag pulled rows source:'online', keep
// the original id as hostedProtestId, and re-mint a fresh, unique local P-00N.

const DEFAULT_INTERVAL_MS = 25000;

// A single active session — a desktop runs one meet at a time.
let session = null;
// { baseUrl, cookie, hostedMeetId, localMeetId, loadDb, saveDb, connectedAt,
//   lastSyncAt, lastError, lastPulledCount, totalPulled, timer }

function naturalKey(p) {
  return [
    String(p.filedByUserId || ''),
    String(p.raceId || ''),
    String(p.createdAt || ''),
    String(p.category || ''),
  ].join('|');
}

function mintLocalProtestId(meet) {
  const existing = new Set((meet.protests || []).map(p => String(p.id)));
  let n = (meet.protests || []).length + 1;
  let id = 'P-' + String(n).padStart(3, '0');
  while (existing.has(id)) { n += 1; id = 'P-' + String(n).padStart(3, '0'); }
  return id;
}

// Merge online protests into the local meet. Pull-only-new: an online protest
// whose natural key already exists locally is skipped, so re-syncing never
// duplicates and never clobbers a local ruling. Returns the count newly added.
function mergeProtests(meet, onlineProtests) {
  if (!Array.isArray(meet.protests)) meet.protests = [];
  const seen = new Set(meet.protests.map(naturalKey));
  let added = 0;
  for (const p of (onlineProtests || [])) {
    const key = naturalKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    meet.protests.push({
      ...p,
      id: mintLocalProtestId(meet),
      source: 'online',
      hostedProtestId: String(p.id || ''),
      pulledAt: new Date().toISOString(),
    });
    added += 1;
  }
  return added;
}

function statusFor(localMeetId) {
  if (!session || String(session.localMeetId) !== String(localMeetId)) return { connected: false };
  return {
    connected: true,
    baseUrl: session.baseUrl,
    hostedMeetId: session.hostedMeetId,
    connectedAt: session.connectedAt,
    lastSyncAt: session.lastSyncAt || null,
    lastError: session.lastError || null,
    totalPulled: session.totalPulled || 0,
    lastPulledCount: session.lastPulledCount || 0,
  };
}

async function syncNow() {
  if (!session) return { ok: false, error: 'Not connected.' };
  const { baseUrl, cookie, hostedMeetId, localMeetId, loadDb, saveDb } = session;
  try {
    const res = await fetch(`${baseUrl}/portal/meet/${encodeURIComponent(hostedMeetId)}/protests.json`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
      redirect: 'manual', // a redirect to /admin/login means the session lapsed
    });
    if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
      session.lastError = 'Online session expired — reconnect to keep syncing.';
      stopTimer();
      return { ok: false, error: session.lastError, expired: true };
    }
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload || !payload.ok || !Array.isArray(payload.protests)) {
      session.lastError = (payload && payload.error) || 'Could not read protests from online.';
      return { ok: false, error: session.lastError };
    }
    const db = loadDb();
    const meet = (db.meets || []).find(m => String(m.id) === String(localMeetId));
    if (!meet) { session.lastError = 'Local meet not found.'; return { ok: false, error: session.lastError }; }
    const added = mergeProtests(meet, payload.protests);
    if (added > 0) { meet.updatedAt = new Date().toISOString(); saveDb(db); }
    session.lastSyncAt = new Date().toISOString();
    session.lastError = null;
    session.lastPulledCount = added;
    session.totalPulled = (session.totalPulled || 0) + added;
    return { ok: true, added };
  } catch (err) {
    // Offline / unreachable — keep the session and try again on the next tick.
    session.lastError = 'Offline — could not reach the online site. Will retry.';
    return { ok: false, error: session.lastError, offline: true };
  }
}

function stopTimer() {
  if (session && session.timer) { clearInterval(session.timer); session.timer = null; }
}

function startTimer(intervalMs) {
  stopTimer();
  if (!session) return;
  session.timer = setInterval(() => { syncNow().catch(() => {}); }, intervalMs || DEFAULT_INTERVAL_MS);
  if (session.timer && session.timer.unref) session.timer.unref();
}

async function connect({ baseUrl, cookie, hostedMeetId, localMeetId, loadDb, saveDb, intervalMs }) {
  disconnect();
  session = {
    baseUrl, cookie,
    hostedMeetId: String(hostedMeetId), localMeetId: String(localMeetId),
    loadDb, saveDb,
    connectedAt: new Date().toISOString(),
    lastSyncAt: null, lastError: null, lastPulledCount: 0, totalPulled: 0, timer: null,
  };
  const first = await syncNow();
  startTimer(intervalMs);
  return first;
}

function disconnect() {
  stopTimer();
  session = null;
}

module.exports = {
  connect, disconnect, syncNow, statusFor,
  mergeProtests, naturalKey, mintLocalProtestId,
  DEFAULT_INTERVAL_MS,
};
