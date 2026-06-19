# Core Business Logic Foundation

This directory is reserved for future shared business logic used by both SSM Web and SSM Desktop.

Do not move existing code here until a dedicated migration is planned.

Future migration targets:

- Race generation
- Time trials
- Scoring
- Standings
- Exports

Guiding rules:

- Keep behavior identical during any migration.
- Move one bounded domain at a time.
- Add tests before moving shared logic.
- Keep web route handlers thin only after the core logic has stable coverage.
- Do not mix desktop storage, sync, or hardware concerns into core business rules.
