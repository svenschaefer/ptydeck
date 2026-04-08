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
2. `QLT-191` Owner `FE`
   Raise direct branch and function coverage for `frontend/src/public/trusted-local-handoff-runtime-controller.js`, `frontend/src/public/trusted-local-layout-runtime-controller.js`, `frontend/src/public/ws-client.js`, and `frontend/src/public/startup-backup-runtime-controller.js`, covering declined startup takeover, failed scope-claim or reclaim-and-retry flows, malformed runtime metadata, reconnect fallback behavior, and browser-local backup failure branches that remain weak after the trusted-local multi-device waves.
3. `QLT-192` Owner `FE`
   Add focused direct coverage and quality hardening for under-covered UI controllers `frontend/src/public/ui/action-dialog-controller.js`, `frontend/src/public/ui/deck-actions-controller.js`, and `frontend/src/public/ui/session-card-interactions-controller.js`, including cancel and dismiss behavior, no-UI fallback adapters, forced deck delete branches, stale-device session-control actions, and error or feedback handling paths that currently sit below the repo’s stronger controller-quality baseline.
4. `QLT-193` Owner `FE`
   Add branch coverage and state-normalization hardening for `frontend/src/public/file-transfer-runtime-controller.js`, `frontend/src/public/custom-command-model.js`, `frontend/src/public/split-layout-runtime-controller.js`, `frontend/src/public/layout-profile-runtime-controller.js`, and `frontend/src/public/workspace-preset-runtime-controller.js`, especially cancellation paths, ambiguous token or profile resolution, pane-weight normalization and removal edge cases, stale preset or group references, and other long-tail state mutations highlighted by the latest coverage run.
5. `QLT-194` Owner `QA`
   Add closeout regression coverage and deterministic full-gate verification for `v0.4.0-H67`, ensuring the targeted backend and frontend hotspots above are covered directly, the trusted-local branch behavior stays stable while those tests are added, and the local `lint`/`test`/`test:coverage:check` gate remains deterministic after the additional quality hardening.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
