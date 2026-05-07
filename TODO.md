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

- [ ] `QLT-315` Owner `BE`: Extract the next retained startup/ready/catalog authority seam from `backend/src/runtime.js` and close it with direct deterministic regressions.
- [ ] `QLT-316` Owner `BE`: Harden retained normalization and control-authority coverage across `backend/src/runtime-library-normalization.js` and `backend/src/runtime-session-control-authority.js`.
- [ ] `QLT-317` Owner `BE`: Isolate the next launch/reconnect/restore helper seam from `backend/src/session-manager.js` and close the remaining branch gaps across `backend/src/session-manager.js`, `backend/src/session-manager-lifecycle.js`, and `backend/src/session-manager-app-identity-runtime.js`.
- [ ] `QLT-318` Owner `FE`: Extract the next initialization/reclaim/operator helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- [ ] `QLT-319` Owner `FE`: Isolate the next layout/workspace orchestration seam across `frontend/src/public/split-layout-runtime-controller.js` and `frontend/src/public/layout-profile-runtime-controller.js`.
- [ ] `QLT-320` Owner `FE`: Harden retained runtime/operator-interaction coverage across `frontend/src/public/workspace-preset-runtime-state.js`, `frontend/src/public/ui/session-terminal-runtime-controller.js`, and `frontend/src/public/stream-interpretation-plugin-engine.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role (active): own `QLT-318` through `QLT-320`.
- `BE` ownership role (active): own `QLT-315` through `QLT-317`.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
