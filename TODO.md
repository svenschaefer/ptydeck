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

- `QLT-305` Owner `FE`: Isolate the next SSH/profile operator seam from `frontend/src/public/connection-profile-runtime-controller.js` and close the remaining branch gaps around selection, trust/draft presentation, and guarded action fallbacks.
- `QLT-306` Owner `FE`: Isolate workspace snapshot/group/layout orchestration from `frontend/src/public/workspace-preset-runtime-controller.js` and close the remaining deterministic branch gaps.
- `QLT-307` Owner `FE`: Harden retained operator-interaction coverage across `frontend/src/public/command-palette-runtime-controller.js`, `frontend/src/public/slash-workflow-runtime-controller.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role (active): deliver `QLT-305` through `QLT-307`.
- `QA` ownership role is currently inactive.
- `BE` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
