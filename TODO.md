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

- `QLT-266` Owner `BE`: extract the next HTTP/WS/session-authority seam from `backend/src/runtime.js` and close it with direct deterministic regressions.
- `QLT-267` Owner `BE`: harden `backend/src/session-manager.js` restart/reconnect/persistence/error-path coverage and isolate one remaining lifecycle helper seam from the 2k-line manager.
- `QLT-268` Owner `FE`: extract the next bootstrap/handoff/runtime-composition seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-269` Owner `FE`: extract the next command-dispatch seam from `frontend/src/public/command-executor.js` and add direct deterministic regressions for the extracted operator path.
- `QLT-270` Owner `FE`: isolate SSH launch/trust operator lifecycle branches from `frontend/src/public/connection-profile-runtime-controller.js` and close the remaining branch gaps with direct regressions.
- `QLT-271` Owner `FE`: harden shared runtime-state and terminal-interaction coverage across `frontend/src/public/store.js`, `frontend/src/public/session-runtime-controller.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role is active for `QLT-266` and `QLT-267`.
- `FE` ownership role is active for `QLT-268` through `QLT-271`.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
