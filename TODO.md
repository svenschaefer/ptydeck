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

- [ ] `QLT-242` Owner `FE`: Add direct coverage for the remaining command-composer discovery/runtime seams centered on `frontend/src/public/command-composer-autocomplete-controller.js` and `frontend/src/public/command-engine.js`, including the still-underexercised autocomplete/discovery branches they own directly.
- [ ] `QLT-243` Owner `FE`: Add direct coverage for the remaining parser/settings/theme seams in `frontend/src/public/slash-workflow-parser.js`, `frontend/src/public/theme-io.js`, and `frontend/src/public/ui/session-settings-dialog-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role is currently inactive.
- `FE` ownership role (active): deliver `QLT-242` and `QLT-243`.
- `PLAT` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
