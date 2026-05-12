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

1. `CMP-402` Owner `FE`: add a global composer-placement mode switch that toggles between the existing shared footer and a non-resizing active-terminal overlay, and route the shared composer block to the active terminal only when the active terminal is not pinned.
2. `CMP-403` Owner `FE`: add per-terminal pin and unpin controls for `active-overlay`, render multiple pinned overlay composer blocks concurrently, and keep pinned drafts isolated from the shared active-overlay draft.
3. `CMP-404` Owner `QA`: add focused regression coverage for server-side operator-client persistence, mode switching, active-terminal overlay migration, pin lifecycle, draft isolation, and send-target correctness across shared-footer, shared active-overlay, and pinned-overlay paths.

## Queued Open Tasks (Next Wave)

1. `None.`

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `CMP-402` and `CMP-403`.
- `QA` ownership role is active for `CMP-404`.
- `BE` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
