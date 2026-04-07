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
   Validate `feature/h62-multi-device-control-foundation` from at least one second LAN client under the real hostnames (`https://ptydeck.local.secos.rocks` and `https://api.ptydeck.local.secos.rocks`), including frontend boot, browser-local startup-backup creation and verification, trusted-local device identity persistence, REST bearer auth, WebSocket ticket flow, and deterministic controller reclaim between two attached clients.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
