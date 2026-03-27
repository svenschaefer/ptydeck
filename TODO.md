# TODO - ptydeck

This file defines concrete, open implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.
Completed work belongs in `DONE.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)

- `UX-005` Owner `BE`: add a persisted workspace-preset contract that stores a named preset with deterministic `activeDeckId`, optional linked `layoutProfileId`, and explicit per-deck session-group definitions as ordered `sessionId` lists plus one optional active-group marker, with normalization, validation, and restart persistence.
- `UX-006` Owner `FE`: add session-group and workspace-preset workflows in the frontend so operators can create, rename, delete, and apply persisted workspace presets, switch deck-local active groups, and reuse the linked layout-profile/deck state from the backend contract.
- `UX-007` Owner `QA`: add regression coverage for workspace-preset persistence, session-group normalization, invalid payload handling, deleted-session cleanup, apply behavior, and restart consistency.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
