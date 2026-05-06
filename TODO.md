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

- `QLT-309` Owner `BE`: Extract the next retained startup/ready/catalog/session-authority helper seam from `backend/src/runtime.js` and close it with direct deterministic regressions.
- `QLT-310` Owner `BE`: Harden retained catalog/state normalization coverage in `backend/src/runtime-library-normalization.js` and adjacent library-authority branches that still dominate backend uncovered lines.
- `QLT-311` Owner `BE`: Harden launch/reconnect and quick-send persistence branches across `backend/src/session-manager.js`, `backend/src/session-manager-launch-runtime.js`, and `backend/src/session-quick-send-usage.js`.
- `QLT-312` Owner `FE`: Extract the next initialization/error/reclaim helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions after the frontend integration baseline is green again.
- `QLT-313` Owner `FE`: Isolate the next SSH/profile guarded-action seam from `frontend/src/public/connection-profile-runtime-controller.js` and close the remaining selection, trust, and draft-presentation branch gaps.
- `QLT-314` Owner `FE`: Harden retained operator/workspace interaction coverage across `frontend/src/public/command-palette-runtime-controller.js`, `frontend/src/public/slash-workflow-runtime-controller.js`, `frontend/src/public/ui/session-terminal-runtime-controller.js`, and the thin `frontend/src/public/workspace-preset-runtime-controller.js` shell.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role (active): owns `QLT-312`, `QLT-313`, and `QLT-314`.
- `BE` ownership role (active): owns `QLT-309`, `QLT-310`, and `QLT-311`.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
