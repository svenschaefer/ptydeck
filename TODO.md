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
2. `QLT-208` Owner `BE`
   Raise direct single-user request/response validation coverage and targeted hardening for `backend/src/validation.js`, `backend/src/replay-excerpt.js`, and `backend/src/startup-backup.js`, especially the remaining malformed selector, restore-manifest, response-shape, and share/control/file-transfer edge cases that still sit partly behind broader integration coverage instead of focused direct assertions.
3. `QLT-209` Owner `FE`
   Reduce orchestration risk in `frontend/src/public/app-runtime-composition-controller.js` by extracting or directly covering the remaining high-centrality session-control, command-feedback, management-dialog, and runtime-bridge branches that still rely too heavily on broad app wiring instead of smaller deterministic contract tests.
4. `QLT-210` Owner `FE`
   Raise direct single-user command-plane coverage and targeted hardening for `frontend/src/public/command-send-safety-controller.js`, `frontend/src/public/command-engine.js`, `frontend/src/public/command-executor.js`, `frontend/src/public/command-composer-autocomplete-controller.js`, and `frontend/src/public/broadcast-input-runtime-controller.js`, covering ambiguous slash/send flows, broadcast guardrails, autocomplete fallback parity, and the remaining send-safety branch tails.
5. `QLT-211` Owner `FE`
   Raise direct single-user workspace and terminal interaction coverage for `frontend/src/public/split-layout-runtime-controller.js`, `frontend/src/public/layout-profile-runtime-controller.js`, `frontend/src/public/ui/session-terminal-runtime-controller.js`, and `frontend/src/public/ui/session-settings-state-controller.js`, focusing on layout-tree edge cases, deck/session layout restore behavior, terminal deferred-mount or clipboard or search branches, and settings draft resync/cancel/apply tails that remain large and central after the current hardening waves.
6. `QLT-212` Owner `QA`
   Add regression coverage and closeout validation for `v0.4.0-H73`, including deterministic focused suites for the promoted backend and frontend hotspots above, followed by a fresh full local quality gate rerun and coverage check on the final tree.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
