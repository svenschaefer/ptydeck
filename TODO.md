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

- `QLT-285` Owner `BE`: isolate one more reconnect/persistence/cleanup lifecycle helper seam from `backend/src/session-manager.js` and harden the remaining manager branch gaps.
- `QLT-286` Owner `FE`: extract the next initialization/handoff/runtime-composition seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-287` Owner `FE`: harden retained operator command/router coverage across `frontend/src/public/command-executor.js`, `frontend/src/public/command-executor-operator-handlers.js`, and `frontend/src/public/command-executor-session-handlers.js`.
- `QLT-288` Owner `FE`: isolate the next SSH/profile/workspace operator seam from `frontend/src/public/connection-profile-runtime-controller.js` and close the remaining branch gaps with direct regressions.
- `QLT-289` Owner `FE`: harden retained operator-state interaction coverage across `frontend/src/public/workspace-manager-runtime-controller.js`, `frontend/src/public/ui/session-settings-state-controller.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `QLT-286` through `QLT-289`.
- `BE` ownership role is active for `QLT-285`.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
