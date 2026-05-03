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

- `QLT-261` Owner `BE`: harden the shipped transport-only messaging baseline across `backend/src/messaging-runtime.js`, `backend/src/telegram-adapter.js`, `backend/src/discord-adapter.js`, `backend/src/telegram-command-surface.js`, `backend/src/delivery-adapter-utils.js`, and `backend/src/terminal-messaging-core.js`.
- `QLT-262` Owner `BE`: harden SSH/foreground/runtime reliability coverage across `backend/src/ssh-host-key-probe.js`, `backend/src/terminal-foreground-process.js`, and the retained runtime config/error-path helpers that gate them.
- `QLT-263` Owner `FE`: extract the next bootstrap/runtime-composition seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-265` Owner `FE`: harden terminal/stream/operator-interaction coverage across `frontend/src/public/terminal-stream.js`, `frontend/src/public/ui/session-terminal-runtime-controller.js`, `frontend/src/public/slash-workflow-runtime-controller.js`, and `frontend/src/public/session-quick-send-runtime-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role (active): deliver `QLT-261` and `QLT-262`.
- `FE` ownership role (active): deliver `QLT-263` and `QLT-265`.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
