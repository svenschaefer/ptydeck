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

1. `MDT-001` Owner `BE`
   Add a backend multi-device session-control foundation that tracks attached authenticated clients per session, assigns the fixed `Owner` / `Controller` / `Spectator` roles from the new requirement baseline, persists the current control holder plus last-input metadata in runtime state, and emits deterministic REST/WebSocket session-control metadata updates without changing the single-host PTY execution model.
2. `MDT-002` Owner `BE`
   Implement backend control arbitration and enforcement for multi-device sessions so only the active `Controller` may send PTY input or PTY-authoritative resize events, the `Owner` can take or transfer control explicitly, non-controller input/resize attempts are rejected deterministically, and session reattachment continues to work with bounded replay/history semantics.
3. `MDT-003` Owner `FE`
   Add a frontend multi-device control surface that exposes connected-client presence, current role, current controller, last-input metadata, and explicit take/release/transfer control actions in the session UI while preserving the existing spectator/read-only baseline and keeping local layout/focus/filter state client-local.
4. `MDT-004` Owner `FE`
   Enforce the new multi-device control semantics in the browser UI so spectator or non-controller clients cannot send composer input, terminal-local paste/input, or PTY resize events, and so client-local interaction affordances clearly reflect when a session is observe-only versus controller-active.
5. `MDT-005` Owner `QA`
   Add regression coverage for the first multi-device control wave, including multi-client attach/reattach behavior, role assignment, controller-only input and resize enforcement, owner takeover/transfer flows, synchronized control metadata visibility, and spectator read-only guarantees.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
