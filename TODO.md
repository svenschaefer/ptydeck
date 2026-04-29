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

- [ ] `QLT-240` Owner `FE`: Add direct coverage for the remaining lower-covered composer/workflow/settings/preset surfaces: `frontend/src/public/command-composer-autocomplete-controller.js`, `frontend/src/public/slash-workflow-parser.js`, `frontend/src/public/theme-io.js`, `frontend/src/public/workspace-preset-runtime-actions.js`, `frontend/src/public/command-engine.js`, and `frontend/src/public/ui/session-settings-dialog-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role is currently inactive.
- `FE` ownership role (active): deliver `QLT-240`.
- `PLAT` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
