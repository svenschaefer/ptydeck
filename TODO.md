# TODO - ptydeck

This file defines concrete, open implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.
Completed work belongs in `CHANGELOG.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)

### `v0.4.0-H156` Repo-Wide Quality and Coverage Hardening

- [ ] `QLT-233` Owner `FE`: Close the session-control / terminal-interaction blind spots in `frontend/src/public/session-control-runtime-controller.js`, `frontend/src/public/session-control-runtime-state.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js` with direct regressions for blocked-write, reconnect-reserved, terminal-mount fallback, and missing-API branches.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
- `PLAT` ownership role is currently inactive.
- `BE` ownership role is currently inactive.
- `FE` ownership role (active): deliver `QLT-233`.
- `QA` ownership role is currently inactive.
