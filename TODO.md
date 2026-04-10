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

- [ ] `QLT-218` Owner `BE`: Add direct request-contract coverage plus targeted hardening for `backend/src/validation.js`, focusing on the least-covered schema branches for connection profiles, workspace presets, SSH trust/probe payloads, share/control payload variants, replay/file-transfer edge cases, and malformed mixed request shapes so those paths no longer depend primarily on broad integration coverage.
- [ ] `QLT-219` Owner `FE`: Add direct management-surface coverage and targeted hardening for `frontend/src/public/connection-profile-runtime-controller.js`, `frontend/src/public/workspace-preset-runtime-controller.js`, and `frontend/src/public/workspace-manager-runtime-controller.js`, covering local-versus-SSH draft transitions, runtime-secret/trust-state reset paths, stale preset/group references, prompt-free rename/delete/duplicate conflict handling, and dialog recovery from malformed runtime or stored state.
- [ ] `QLT-220` Owner `FE`: Add direct terminal/layout/settings core coverage and targeted hardening for `frontend/src/public/ui/session-terminal-runtime-controller.js`, `frontend/src/public/split-layout-runtime-controller.js`, `frontend/src/public/layout-profile-runtime-controller.js`, and `frontend/src/public/ui/session-settings-state-controller.js`, covering mount/teardown timing, clipboard and paste fallback edges, split-tree mutation and weight-normalization corner cases, first-use layout capture/reapply behavior, and clean-versus-dirty settings reset semantics.
- [ ] `QLT-221` Owner `FE`: Add direct operator-workflow controller coverage and targeted hardening for `frontend/src/public/send-history-runtime-controller.js`, `frontend/src/public/paste-observation-runtime-controller.js`, and `frontend/src/public/slash-workflow-runtime-controller.js`, covering session-pinned history switching, malformed stored-state hydration, bounded continue/auto-continue edge cases, workflow cancel/no-op/wait branches, and command-feedback consistency across replay/send-safety flows.
- [ ] `QLT-222` Owner `QA`: Add closeout regression coverage and deterministic full-gate validation for `v0.4.0-H76`, ensuring the new direct backend/frontend suites plus `npm run lint`, `npm run test`, and `npm run test:coverage:check` all pass on the final tree.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
