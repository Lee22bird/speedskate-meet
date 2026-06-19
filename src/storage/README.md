# Storage Foundation

This directory is reserved for future local-first storage work.

Current SSM behavior:

- The web app continues to use its existing JSON storage.
- No storage behavior is changed by this foundation.

Future Desktop recommendation:

- Use SQLite for local meet storage.
- Keep one local database per meet package or a clearly versioned local workspace database.
- Store timing, race day state, time trial results, audit events, and sync metadata locally.

Backup strategy:

- Support exportable `.ssmmeet` packages.
- Keep periodic local backups during race day.
- Prefer append-only audit records for critical race operations.
- Include checksums for package integrity.

Migration considerations:

- Version every schema.
- Use deterministic migrations.
- Keep rollback/export options for meet directors.
- Never replace the current web JSON storage until a separate storage migration is explicitly approved.
