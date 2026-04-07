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

1. `MDT-006` Owner `BE`
   Replace the current ephemeral multi-device client identity with a stable trusted-local operator attachment model so the same single user can reload, reconnect, and reopen ptydeck from multiple devices or tabs without losing deterministic session-control identity when the WebSocket connection id changes.
2. `MDT-007` Owner `BE`
   Harden controller handoff and reattach behavior for the trusted local single-user multi-device case by adding deterministic stale-client expiry, reconnect reassignment, reclaim-after-reload semantics, and conflict-safe single-writer arbitration without introducing additional product-level role management beyond the technically necessary controller-versus-read-only distinction.
3. `MDT-008` Owner `FE`
   Add a frontend multi-device attachment and handoff UX for the trusted local single-user flow that makes the current device identity, attached device list, controller state, reconnect/reclaim state, and explicit take/reclaim actions understandable without surfacing unnecessary role-management concepts to the operator.
4. `MDT-009` Owner `QA`
   Add regression coverage for the H63 trusted-local multi-device hardening wave, including reload, reconnect, multi-tab attachment, stale-client cleanup, deterministic controller reclaim/handoff, and preservation of the existing read-only spectator-sharing baseline.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
