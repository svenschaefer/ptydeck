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

- [ ] `QLT-238` Owner `FE`: Extract another cohesive seam from `frontend/src/public/app-runtime-composition-controller.js` and add direct deterministic tests for the moved contract so the remaining composition monolith stops carrying broad branch risk by incidental traversal alone.
- [ ] `QLT-239` Owner `FE`: Add direct operator-path coverage for the lower-covered utility/debug/search controllers: `frontend/src/public/command-send-safety-controller.js`, `frontend/src/public/stream-debug-trace-controller.js`, `frontend/src/public/trace-debug-controller.js`, `frontend/src/public/ui/terminal-search-controller.js`, `frontend/src/public/trusted-local-client-runtime-controller.js`, and `frontend/src/public/terminal-ctrl-c-runtime-controller.js`.
- [ ] `QLT-240` Owner `FE`: Add direct coverage for the remaining lower-covered composer/workflow/settings/preset surfaces: `frontend/src/public/command-composer-autocomplete-controller.js`, `frontend/src/public/slash-workflow-parser.js`, `frontend/src/public/theme-io.js`, `frontend/src/public/workspace-preset-runtime-actions.js`, `frontend/src/public/command-engine.js`, and `frontend/src/public/ui/session-settings-dialog-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role is currently inactive.
- `FE` ownership role (active): deliver `QLT-238`, `QLT-239`, and `QLT-240`.
- `PLAT` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
