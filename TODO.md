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

- `REM-007A` Owner `BE`: Add a backend sharing contract for session- and deck-scoped spectator links with explicit read-only permission mode, normalized target references, bounded token lifecycle metadata, revocation support, and deterministic access-state exposure instead of ad hoc copy/paste URL sharing.
- `REM-007B` Owner `FE`: Add frontend sharing workflows for creating, joining, inspecting, and revoking read-only spectator access for sessions and decks, with visible permission-state rendering so spectators never appear to have control/write capability they do not actually have.
- `REM-007C` Owner `QA`: Add regression coverage for session/deck sharing create/join/revoke flows, read-only enforcement, visible permission-state behavior, and reload/reconnect consistency across the shared spectator path.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
