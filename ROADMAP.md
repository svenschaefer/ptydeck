# ROADMAP - ptydeck

This file defines execution order, release versions, and dependencies for tasks listed in `TODO.md`.
`TODO.md` remains the source of task definitions.

## Ownership and Release Control

- Roadmap owner: `CODX`
- Release execution owners: `BE`, `FE`, `PLAT`, `QA`
- Versioning scheme: `v0.x` pre-production milestones, `v1.0.0` first production-ready baseline

## Dependency Rules

- `BE-002` is a hard dependency for `BE-003` through `BE-010` and `FE-007`.
- `BE-011` is a hard dependency for `BE-004`, `BE-006`, `BE-012`, `BE-015`, and `INT-004`.
- `BE-012` and `BE-013` are hard dependencies for `FE-009` and `FE-010`.
- `FE-002` is a hard dependency for `FE-003`, `FE-006`, `FE-010`, and `FE-014`.
- `INT-003` should run after `INT-002` and before any release tag.

## Version Plan

### v0.1.0 - Foundation and Contracts

- `INT-002`, `INT-001`, `BE-001`, `FE-001`, `BE-002`, `INT-009`, `DOC-001`, `DOC-002`

Exit criteria:

- Backend and frontend workspaces exist and build.
- OpenAPI contract exists and is the single API source.
- Local development and environment setup are documented.

### v0.2.0 - Backend Core Runtime

- `BE-011`, `BE-003`, `BE-004`, `BE-005`, `BE-006`, `BE-007`, `BE-008`, `BE-009`, `BE-010`, `BE-019`

Exit criteria:

- Core REST lifecycle for session creation/control works against PTY runtime.
- API requests and responses are validated and errors are normalized.

### v0.3.0 - Realtime and Persistence

- `BE-012`, `BE-013`, `BE-014`, `BE-015`, `BE-016`, `BE-017`, `BE-018`

Exit criteria:

- WebSocket stream is stable and multiplexed by `sessionId`.
- Session metadata persistence and restart restore work.
- Health and readiness are available.

### v0.4.0 - Frontend Functional UI

- `FE-007`, `FE-008`, `FE-002`, `FE-003`, `FE-004`, `FE-005`, `FE-006`, `FE-009`, `FE-010`, `FE-012`, `FE-013`, `FE-014`, `FE-011`

Exit criteria:

- Multi-session terminal UI is usable end to end.
- Active-session command input and realtime output routing are stable.

### v0.5.0 - Quality Gate

- `INT-003`, `INT-004`, `INT-005`, `INT-006`, `INT-007`, `INT-008`

Exit criteria:

- CI executes lint/build/tests for both apps.
- Unit, integration, and E2E coverage exists for critical paths.

### v1.0.0 - Production Baseline

- `INT-010` plus all unresolved defects from prior milestones

Exit criteria:

- Repeatable production build and deployment instructions are complete.
- The core use case is validated: create session, run command, read output, close session.

## Current Status

- Latest completed milestone: none
- Next milestone in progress: `v0.1.0`
- Blockers: none recorded

### Completed Items in Current Milestone

- `DOC-001` completed on 2026-03-22.
- `DOC-002` completed on 2026-03-22.
