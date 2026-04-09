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
2. `QLT-204` Owner `BE`
   Raise direct orchestration coverage and targeted hardening for `backend/src/runtime.js` plus the remaining high-risk request/response seams that still terminate there, especially trusted-local control claim routing, replay/share/transfer error mapping, WebSocket ticket and attach failure branches, snapshot/restore fallback behavior, and deterministic rejection paths that still rely more on broad integration coverage than on focused direct assertions.
3. `QLT-205` Owner `FE`
   Raise direct terminal-core and session-settings coverage for `frontend/src/public/ui/session-terminal-runtime-controller.js`, `frontend/src/public/terminal-stream.js`, and `frontend/src/public/ui/session-settings-state-controller.js`, covering hidden/deferred terminal mounts, local redraw and refresh fallbacks, guarded paste/send terminator edge cases, and session-settings draft normalization, resync, and tab-state branches that remain large and central after the current quality waves.
4. `QLT-206` Owner `FE`
   Raise direct trusted-local startup/runtime coverage and targeted hardening for `frontend/src/public/trusted-local-client-runtime-controller.js`, `frontend/src/public/app-bootstrap-composition-controller.js`, and `frontend/src/public/ws-runtime-controller.js`, especially browser-storage edge cases, startup identity/bootstrap ordering, reconnect/no-op state transitions, and local-device metadata paths that remain central to the feature branch but still sit partly behind broader app-level tests.
5. `QLT-207` Owner `QA`
   Add regression coverage and closeout validation for `v0.4.0-H72`, including deterministic focused suites for the backend runtime hotspot and the frontend terminal-core plus trusted-local bootstrap hotspots, followed by a fresh full local quality gate rerun and coverage check on the final tree.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
