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

- `UX-018` Owner `FE`: Add controlled xterm mouse-forwarding behavior plus session-settings controls so sessions can opt into mouse forwarding while preserving the existing selection/copy/middle-click paste UX when forwarding is disabled.
- `UX-019` Owner `QA`: Add regression coverage for mouse-forwarding persistence, enabled-versus-disabled terminal behavior, selection/copy non-regression, and restart/reload consistency.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
