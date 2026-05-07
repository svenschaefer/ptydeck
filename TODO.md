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

- [ ] `QLT-322` Owner `BE`: harden retained normalization and control-authority coverage across `backend/src/runtime-library-normalization.js` and `backend/src/runtime-session-control-authority.js`.
- [ ] `QLT-323` Owner `BE`: isolate the next launch/reconnect/restore helper seam from `backend/src/session-manager.js` and harden the remaining lifecycle branch gaps.
- [ ] `QLT-324` Owner `FE`: extract the next initialization/reclaim/operator helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- [ ] `QLT-325` Owner `FE`: isolate the next layout/workspace orchestration seam across `frontend/src/public/split-layout-runtime-controller.js` and `frontend/src/public/layout-profile-runtime-controller.js`.
- [ ] `QLT-326` Owner `FE`: harden retained runtime/operator-interaction coverage across `frontend/src/public/workspace-preset-runtime-state.js`, `frontend/src/public/ui/session-terminal-runtime-controller.js`, and `frontend/src/public/stream-interpretation-plugin-engine.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role (active): deliver `QLT-324` through `QLT-326`.
- `BE` ownership role (active): deliver `QLT-322` and `QLT-323`.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
