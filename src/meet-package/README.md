# Meet Package Foundation

This directory is reserved for future `.ssmmeet` package support.

A `.ssmmeet` package should be portable, auditable, and suitable for backup or handoff between machines.

Proposed package layout:

```text
example.ssmmeet/
  manifest.json
  meet.sqlite
  exports/
  attachments/
  audit/
  checksums.json
```

Example `manifest.json` schema:

```json
{
  "package_version": 1,
  "app": "SpeedSkateMeet",
  "meet_id": "ssm_123",
  "ssl_meet_id": "ssl_456",
  "meet_name": "Example Invitational",
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z",
  "schema_version": 1,
  "source": "ssm-desktop"
}
```

Future contents:

- `meet.sqlite` stores the local meet database.
- `exports/` stores CSV, PDF, JSON, and results files.
- `attachments/` stores optional imported files.
- `audit/` stores append-only audit records.
- `checksums.json` stores integrity hashes for package contents.

No package reader, writer, importer, or exporter is implemented yet.
