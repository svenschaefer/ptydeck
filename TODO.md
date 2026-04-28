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

- [ ] `QLT-228` Owner `PLAT`: Add a deterministic root-tooling coverage lane for `test/*.test.js` plus the owned `scripts/lib/*.mjs` helpers, wire it into `npm run test:coverage:check` / `LOCAL_QUALITY_GATE.md`, and keep incidental frontend/backend imports from silently distorting that root tooling report.
- [ ] `QLT-229` Owner `BE`: Close the remaining production-auth coverage blind spots in `backend/src/auth.js` with direct regressions for OIDC discovery override resolution, JWKS cache expiry/refresh, malformed JOSE headers/signatures, scope normalization, and internal-token fallback behavior in `AUTH_MODE=prod`.
- [ ] `QLT-230` Owner `BE`: Close the highest-risk remaining runtime/session lifecycle blind spots in `backend/src/runtime.js` and `backend/src/session-manager.js` with focused request/lifecycle regressions for startup-restore failure, auth-denied admission, WebSocket bootstrap/ticket error paths, and PTY/session fallback branches that are still covered only indirectly.
- [ ] `QLT-231` Owner `FE`: Close the bootstrap/control blind spots in `frontend/src/public/app-runtime-composition-controller.js` and `frontend/src/public/app-runtime-state-controller.js` with direct regressions for canonical-origin handoff, reclaim/retry flows, startup-backup failure handling, auth-recovery fallback, and trace/debug side paths.
- [ ] `QLT-232` Owner `FE`: Close the command/workflow blind spots in `frontend/src/public/command-executor.js`, `frontend/src/public/command-executor-domain-handlers.js`, and `frontend/src/public/connection-profile-runtime-actions.js` with direct regressions for malformed operator input, fallback/error flows, connection-profile mutations, and workflow-side side-effect suppression.
- [ ] `QLT-233` Owner `FE`: Close the session-control / terminal-interaction blind spots in `frontend/src/public/session-control-runtime-controller.js`, `frontend/src/public/session-control-runtime-state.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js` with direct regressions for blocked-write, reconnect-reserved, terminal-mount fallback, and missing-API branches.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
- `PLAT` ownership role (active): deliver `QLT-228`.
- `BE` ownership role (active): deliver `QLT-229` and `QLT-230`.
- `FE` ownership role (active): deliver `QLT-231`, `QLT-232`, and `QLT-233`.
- `QA` ownership role is currently inactive.
