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

1. `MDT-010` Owner `PLAT`
   Add an explicit rollback and restore runbook plus deterministic tooling for the pre-H62 startup backups so reverting from `feature/h62-multi-device-control-foundation` back to `main` can restore both backend runtime persistence and browser-local state instead of only relying on one-time backup creation.
2. `MDT-011` Owner `FE`
   Add trusted-local device-management UX for the single-user multi-device case, including renaming the current device, clearer `this device` versus `other attached device` labeling, and explicit stale-device cleanup or forget actions without introducing broader product-level user or role management.
3. `MDT-012` Owner `FE`
   Add blocked-write reclaim UX so a trusted-local non-controller `Send`, terminal paste/input, or PTY resize attempt can offer an immediate `Take Control` or `Reclaim Control` path instead of only surfacing a passive read-only block.
4. `MDT-013` Owner `QA`
   Add regression coverage for the trusted-local multi-device rollout-hardening wave, including rollback and restore behavior, stale-device cleanup, blocked-write reclaim flows, and reconnect or reclaim behavior across multiple local tabs or devices while preserving the existing read-only spectator baseline.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
