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

1. `MDT-014` Owner `QA`
   Validate `feature/h62-multi-device-control-foundation` from at least one second LAN client under the real hostnames (`https://ptydeck.local.secos.rocks` and `https://api.ptydeck.local.secos.rocks`), including frontend boot, browser-local startup-backup creation and verification, trusted-local device identity persistence, REST bearer auth, WebSocket ticket flow, subtle startup takeover prompting, scope-aware trusted-local control claim (`all sessions`, `current deck`, `current session`), automatic device-local layout recall on successful takeover, and deterministic controller reclaim between two attached clients without prior release.
2. `QLT-213` Owner `BE`
   Add direct single-user runtime and request-contract coverage plus hardening for `backend/src/runtime.js` and the remaining high-risk request/response branches in `backend/src/validation.js`, focusing on malformed bodies and path parameters across local session, replay-excerpt, control/share, custom-command, settings, and file-transfer endpoints so those seams no longer depend mostly on broad runtime integration behavior.
3. `QLT-214` Owner `FE`
   Add direct orchestration coverage and targeted hardening for `frontend/src/public/app-runtime-composition-controller.js`, focusing on startup failure precedence, bootstrap fallback sequencing, restore and replay wiring, reclaim-and-retry coordination, and other single-user runtime-control flows that still sit too heavily behind broad `app.test.js` behavior.
4. `QLT-215` Owner `FE`
   Add direct coverage and quality hardening for the single-user terminal, layout, and settings core in `frontend/src/public/ui/session-terminal-runtime-controller.js`, `frontend/src/public/split-layout-runtime-controller.js`, `frontend/src/public/layout-profile-runtime-controller.js`, and `frontend/src/public/ui/session-settings-state-controller.js`, covering mount/hide/show redraw timing, terminal paste/clipboard fallback edges, first-use layout capture and reapply, pane-tree mutation corner cases, and clean-versus-dirty settings transitions.
5. `QLT-216` Owner `FE`
   Add direct command-surface and guarded-send coverage plus hardening for `frontend/src/public/command-executor.js`, `frontend/src/public/command-engine.js`, `frontend/src/public/command-send-safety-controller.js`, and `frontend/src/public/command-composer-autocomplete-controller.js`, including alias/help-topic completion edges, guarded confirm and retry flows, malformed selector/input handling, and replay/paste command result consistency.
6. `QLT-217` Owner `QA`
   Add closeout regression coverage and deterministic full-gate validation for `v0.4.0-H74`, ensuring the new direct backend/frontend suites plus `npm run lint`, `npm run test`, and `npm run test:coverage:check` all pass on the final single-user tree.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
