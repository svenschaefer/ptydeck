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

- [ ] `QLT-255` Owner `BE`: Extract the next startup/request/connection seam from `backend/src/runtime.js` and add direct deterministic coverage for the extracted live authority path.
- [ ] `QLT-256` Owner `BE`: Harden `backend/src/session-manager.js` restart/replay/persistence/error-path coverage for the still-inline lifecycle branches that remain below target branch confidence.
- [ ] `QLT-257` Owner `FE`: Extract the next command-dispatch seam from `frontend/src/public/command-executor.js` and add direct regression coverage for the extracted send/selection path.
- [ ] `QLT-258` Owner `FE`: Harden frontend runtime-state and quick-send/session-terminal coverage across `frontend/src/public/store.js`, `frontend/src/public/session-quick-send-runtime-controller.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js`, and cut another small wiring seam if needed to keep the composition surface shrinking.
- [ ] `QLT-259` Owner `FE`: Harden operator layout/profile coverage across `frontend/src/public/split-layout-runtime-controller.js` and `frontend/src/public/connection-profile-runtime-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role (active): own `QLT-255` and `QLT-256`.
- `FE` ownership role (active): own `QLT-257`, `QLT-258`, and `QLT-259`.
- `PLAT` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
