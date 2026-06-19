# Sync Foundation

This directory is reserved for future SSL and SSM synchronization logic.

SSL remains cloud/web only. SSM Desktop will eventually sync meet data around race-day operations.

Before Meet: SSL to SSM

- Meet listing and registration packages
- SSL identities and approved staff snapshots
- Teams, leagues, SSL IDs, profile photos, and role metadata
- Licensing state needed to unlock local meet operations

After Meet: SSM to SSL

- Official results
- Time trial results
- Staff participation history
- Meet audit package
- Export artifacts

Offline queue:

- Queue outbound changes while offline.
- Persist queue entries locally.
- Use idempotency keys for uploads.
- Keep a visible sync status for meet directors.

Retries:

- Retry transient network failures.
- Use backoff to avoid repeated rapid uploads.
- Preserve failed payloads for manual recovery.

Conflict handling:

- SSL owns identity, profiles, teams, leagues, rankings, results history, staff history, SSO, and licensing.
- SSM owns local race-day state during the meet.
- Prefer explicit review for conflicts that affect official results.

Duplicate prevention:

- Use stable meet IDs, registration IDs, SSL IDs, and result IDs.
- Include package checksums.
- Make uploads idempotent where possible.
- Never auto-merge identities without SSL admin approval.
