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

- `QLT-330` Owner `FE`: extract the next initialization/reclaim/operator helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-331` Owner `FE`: isolate the next workspace/layout orchestration seam across `frontend/src/public/workspace-preset-runtime-state.js`, `frontend/src/public/split-layout-runtime-controller.js`, and `frontend/src/public/layout-profile-runtime-controller.js`.
- `QLT-332` Owner `FE`: harden retained runtime/operator-interaction coverage across `frontend/src/public/ui/session-terminal-runtime-controller.js`, `frontend/src/public/connection-profile-draft-state.js`, and `frontend/src/public/ws-runtime-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role (active): own `QLT-330` through `QLT-332` and the corresponding frontend implementation and regression coverage.
- `BE` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
