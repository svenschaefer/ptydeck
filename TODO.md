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

- `QLT-269` Owner `FE`: extract the next command-dispatch seam from `frontend/src/public/command-executor.js` and add direct deterministic regressions for the extracted operator path.
- `QLT-270` Owner `FE`: isolate SSH launch/trust operator lifecycle branches from `frontend/src/public/connection-profile-runtime-controller.js` and close the remaining branch gaps with direct regressions.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `QLT-269` and `QLT-270`.
- `BE` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
