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

- `QLT-291` Owner `FE`: extract the next initialization/recovery/runtime-composition seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-292` Owner `BE`: extract the next startup/session-authority helper cluster from `backend/src/runtime.js` and close it with direct deterministic regressions.
- `QLT-293` Owner `BE`: isolate one more launch/reconnect/persistence lifecycle helper seam from `backend/src/session-manager.js` and close the remaining manager branch gaps with direct regressions.
- `QLT-294` Owner `FE`: extract the next retained command/reporting seam from `frontend/src/public/command-executor.js` and close it with direct deterministic regressions.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `QLT-291` and `QLT-294`.
- `BE` ownership role is active for `QLT-292` and `QLT-293`.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
