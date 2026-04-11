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

- `QLT-226` Owner `FE`: Add direct coverage and targeted hardening for the management and workflow controllers with remaining large branch gaps: `frontend/src/public/connection-profile-runtime-controller.js`, `frontend/src/public/workspace-preset-runtime-controller.js`, `frontend/src/public/send-history-runtime-controller.js`, `frontend/src/public/paste-observation-runtime-controller.js`, `frontend/src/public/slash-workflow-runtime-controller.js`, and `frontend/src/public/slash-workflow-source-adapter.js`, especially around malformed stored state, recovery paths, retry/cancel branches, and cross-controller edge-case coordination.
- `QLT-227` Owner `QA`: Add closeout validation for `v0.4.0-H84`, including focused regression coverage for the backend/frontend hotspot files promoted in `QLT-225` and `QLT-226` plus a deterministic full local `lint`, `test`, and `test:coverage:check` rerun on the final tree.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
