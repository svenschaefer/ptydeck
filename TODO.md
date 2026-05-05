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

- `QLT-293` Owner `BE`: isolate one more launch/reconnect/persistence lifecycle helper seam from `backend/src/session-manager.js` and close the remaining manager branch gaps with direct regressions.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role is active for `QLT-293`.
- `FE` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
