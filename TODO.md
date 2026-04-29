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

- [ ] `QLT-249` Owner `FE`: harden retained operator-history and session-UI glue in `frontend/src/public/send-history-runtime-controller.js` (`88.48%` line / `76.51%` branch), `frontend/src/public/ui/session-ui-facade-controller.js` (`87.06%` line / `67.54%` branch), `frontend/src/public/ui/session-card-meta-controller.js` (`87.74%` line / `68.57%` branch), and `frontend/src/public/share-access-state.js` (`90.32%` line / `69.70%` branch).

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role (active): deliver `QLT-249`.
- `BE` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
