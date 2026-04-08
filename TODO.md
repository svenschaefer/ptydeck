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
2. `QLT-197` Owner `FE`
   Add direct coverage and quality hardening for the device-local layout and terminal core on `feature/h62-multi-device-control-foundation`, specifically `frontend/src/public/layout-profile-runtime-controller.js`, `frontend/src/public/split-layout-runtime-controller.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js`, covering first-use device-layout capture, per-device layout reapply, pane-weight normalization and removal edge cases, late-mount redraw or refresh branches, and guarded paste/scroll/drag behavior that is still carried mainly by broad app tests.
3. `QLT-198` Owner `FE`
   Add focused direct coverage and long-tail state hardening for the large management controllers `frontend/src/public/connection-profile-runtime-controller.js` and `frontend/src/public/workspace-preset-runtime-controller.js`, including guided local and SSH draft transitions, failed save/launch and SSH trust/probe branches, stale preset or group references, duplication/rename/delete conflict paths, and malformed stored-state handling.
4. `QLT-199` Owner `QA`
   Add closeout regression coverage and deterministic full-gate verification for `v0.4.0-H68`, ensuring the targeted backend persistence/validation, trusted-local identity/state, device-local layout/terminal core, and management-controller hotspots above are covered directly and the local `lint`/`test`/`test:coverage:check` gate stays stable on the feature branch.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
