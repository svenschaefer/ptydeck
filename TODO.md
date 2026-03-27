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

- `UX-012` Owner `FE`: Implement the split-based terminal layout runtime with horizontal/vertical pane rendering, drag/resize handles, session-to-pane assignment flows, and backend-backed apply/save behavior against the persisted split-layout contract.
- `UX-013` Owner `QA`: Add regression coverage for split-layout normalization, resize behavior, deleted-session cleanup, layout-profile/workspace-preset apply behavior, and restart consistency.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
