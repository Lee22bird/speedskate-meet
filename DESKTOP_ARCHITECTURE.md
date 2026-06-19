# SpeedSkateMeet Desktop Architecture Foundation

This document records the future Desktop Edition direction without changing current SSM web behavior.

## Product Boundary

SpeedSkateLeague remains cloud/web only.

SSL owns:

- Identity
- Profiles
- SSL IDs
- Teams
- Leagues
- Rankings
- Results history
- Staff history
- SSO
- Licensing

SpeedSkateMeet Desktop is planned as a local-first race-day application.

SSM Desktop will eventually own:

- Local meet operations
- Offline race-day state
- Time Trial operations
- Timing hardware hosting
- Local exports and backups

## Desktop Runtime

Electron is recommended initially because it can package the existing web experience while adding local storage, file access, and hardware bridges over time.

No Electron dependency is installed yet.

The placeholder entry points are:

- `desktop/main.js`
- `desktop/preload.js`

## Local Storage

SQLite is recommended for the Desktop Edition.

Reasons:

- Reliable local-first storage
- Strong transactional behavior
- Portable files
- Good fit for race-day audit and recovery
- Works well inside exportable meet packages

The current web JSON storage remains unchanged.

## Meet Package Design

Future `.ssmmeet` packages should be portable folders or archives with:

```text
manifest.json
meet.sqlite
exports/
attachments/
audit/
checksums.json
```

The package should be safe to back up, transfer, and later sync with SSL.

## Sync Architecture

Before Meet: SSL to SSM

- Registrations
- SSL identity snapshots
- Approved staff snapshots
- Teams and league context
- Licensing state

After Meet: SSM to SSL

- Official results
- Time Trial results
- Staff participation records
- Export artifacts
- Audit package

The future sync layer should support:

- Offline queue
- Retries
- Conflict handling
- Duplicate prevention
- Idempotent uploads

## Licensing Architecture

SSL should remain the licensing authority.

Future SSM Desktop licensing should:

- Pull license state from SSL before the meet.
- Cache enough license state for offline race-day use.
- Avoid requiring internet during active racing.
- Revalidate when back online.

## Hardware Extension Architecture

Hardware integrations should be adapter-based.

Potential adapters:

- Photo Finish
- GoPro Timing
- Speed Gates
- Timing Sensors
- External Timing Systems

Adapters should normalize device output into candidate timing events. SSM should preserve manual review and auditability before results become official.

## Current Foundation Status

This foundation only adds directories and documentation. It does not:

- Change race generation
- Change Time Trial behavior
- Change registration
- Change Race Day
- Change SSL integration
- Change SSO
- Install Electron
- Install SQLite
- Implement sync
- Implement hardware adapters
