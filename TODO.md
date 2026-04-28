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

- [ ] `QLT-234` Owner `PLAT`: Harden root-tooling coverage for the repo-owned quality helpers. Add direct regression coverage for `scripts/lib/coverage-report.mjs` aggregation/omission/error branches and `scripts/scaffold-ui-module.mjs` overwrite/failure/template-resolution branches; do not spend this wave on the lower-priority historical analysis scripts unless they become active product tooling.
- [ ] `QLT-235` Owner `BE`: Reduce the remaining `backend/src/runtime.js` monolith and close its lowest still-relevant lifecycle/admission blind spots with direct seam tests instead of relying only on broad integration traversal.
- [ ] `QLT-236` Owner `BE`: Add direct deterministic reliability coverage for `backend/src/startup-backup.js`, `backend/src/key-provider.js`, `backend/src/ssh-host-key-probe.js`, and `backend/src/node-pty-write-retry.js`, focusing on fail-closed restore, malformed key/trust inputs, and async PTY retry exhaustion branches.
- [ ] `QLT-237` Owner `BE`: Harden the retained transport-only messaging and identity baseline with direct regression coverage for `backend/src/messaging-runtime.js`, `backend/src/messaging-custom-command-utils.js`, `backend/src/telegram-adapter.js`, `backend/src/terminal-messaging-core.js`, and `backend/src/terminal-app-identity.js`.
- [ ] `QLT-238` Owner `FE`: Extract another cohesive seam from `frontend/src/public/app-runtime-composition-controller.js` and add direct deterministic tests for the moved contract so the remaining composition monolith stops carrying broad branch risk by incidental traversal alone.
- [ ] `QLT-239` Owner `FE`: Add direct operator-path coverage for the lower-covered utility/debug/search controllers: `frontend/src/public/command-send-safety-controller.js`, `frontend/src/public/stream-debug-trace-controller.js`, `frontend/src/public/trace-debug-controller.js`, `frontend/src/public/ui/terminal-search-controller.js`, `frontend/src/public/trusted-local-client-runtime-controller.js`, and `frontend/src/public/terminal-ctrl-c-runtime-controller.js`.
- [ ] `QLT-240` Owner `FE`: Add direct coverage for the remaining lower-covered composer/workflow/settings/preset surfaces: `frontend/src/public/command-composer-autocomplete-controller.js`, `frontend/src/public/slash-workflow-parser.js`, `frontend/src/public/theme-io.js`, `frontend/src/public/workspace-preset-runtime-actions.js`, `frontend/src/public/command-engine.js`, and `frontend/src/public/ui/session-settings-dialog-controller.js`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `PLAT` ownership role (active): deliver `QLT-234`.
- `BE` ownership role (active): deliver `QLT-235`, `QLT-236`, and `QLT-237`.
- `FE` ownership role (active): deliver `QLT-238`, `QLT-239`, and `QLT-240`.
- `QA` ownership role is currently inactive.
