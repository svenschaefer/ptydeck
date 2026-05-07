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

- `QLT-340` Owner `BE`: harden retained normalization/state authority coverage across `backend/src/runtime-library-normalization.js`, `backend/src/runtime-session-resource-authority.js`, and adjacent runtime-library/session-state branches.
- `QLT-342` Owner `FE`: extract the next initialization/reclaim/operator helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-343` Owner `FE`: isolate the next layout/workspace orchestration seam across `frontend/src/public/split-layout-runtime-controller.js`, `frontend/src/public/layout-profile-runtime-controller.js`, and `frontend/src/public/layout-runtime-state.js`.
- `QLT-344` Owner `FE`: harden retained runtime/operator-interaction coverage across `frontend/src/public/connection-profile-draft-state.js`, `frontend/src/public/ui/session-terminal-runtime-controller.js`, and `frontend/src/public/layout-workspace-runtime-state.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role (active): own `QLT-342` through `QLT-344` and the corresponding frontend implementation and regression coverage.
- `BE` ownership role (active): own `QLT-340` and the corresponding backend implementation and regression coverage.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
