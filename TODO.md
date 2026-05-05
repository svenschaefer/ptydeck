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

- `QLT-280` Owner `FE`: extract the next initialization/recovery/runtime-composition seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-281` Owner `FE`: extract the next retained operator command/router seam from `frontend/src/public/command-executor.js` and add direct deterministic regressions for the extracted path.
- `QLT-282` Owner `FE`: isolate the next SSH/profile/workspace operator seam from `frontend/src/public/connection-profile-runtime-controller.js` and close the remaining branch gaps with direct regressions.
- `QLT-283` Owner `FE`: harden retained runtime-state and terminal-interaction coverage across `frontend/src/public/store.js` and `frontend/src/public/ui/session-terminal-runtime-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `QLT-280` through `QLT-283`.
- `BE` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
