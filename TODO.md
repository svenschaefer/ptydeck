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

1. `QLT-365` Owner `BE`: stabilize the nondeterministic WebSocket trace/correlation continuity integration path across `backend/test/ws.integration.test.js`, `backend/src/runtime-ws-connection.js`, `backend/src/runtime-ws-upgrade.js`, and `backend/src/runtime.js` so repeated `npm --prefix backend run test:coverage` runs stay deterministic.
2. `QLT-366` Owner `BE`: extract the next retained startup/session-dispatch authority seam from `backend/src/runtime.js` and close it with direct deterministic regressions.
3. `QLT-367` Owner `BE`: harden retained normalization/operator-composer coverage across `backend/src/runtime-library-normalization.js` and `backend/src/runtime-operator-composer-authority.js`.
4. `QLT-368` Owner `FE`: extract the next initialization/reclaim/operator helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close branch/function gaps with direct deterministic regressions.
5. `QLT-369` Owner `FE`: isolate the next layout/workspace orchestration seam across `frontend/src/public/split-layout-runtime-controller.js` and `frontend/src/public/layout-profile-runtime-controller.js`.
6. `QLT-370` Owner `FE`: harden retained terminal/control-surface coverage across `frontend/src/public/ui/session-terminal-runtime-controller.js` and adjacent session interaction paths.
7. `QLT-371` Owner `QA`: revalidate and document repeated backend/frontend/root full-lane evidence after `QLT-365` through `QLT-370`, including repeated `npm --prefix backend run test:coverage` runs to prove the WebSocket integration lane is deterministic again.

## Queued Open Tasks (Next Wave)

1. `None.`

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `QLT-368` through `QLT-370`.
- `QA` ownership role is active for `QLT-371`.
- `BE` ownership role is active for `QLT-365` through `QLT-367`.
- `PLAT` ownership role is currently inactive.
