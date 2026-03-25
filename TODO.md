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

- `QLT-126` Owner `BE`: Introduce a backend startup warmup status for restart recovery so the server reports "starting sessions" until no session has held the active state for one full second after boot, while keeping the runtime recovery path observable to clients.
- `QLT-127` Owner `FE`: Gate normal frontend bootstrap behind the backend startup warmup status, render an explicit wait/skip affordance during "server is starting sessions", and continue startup automatically when the backend warmup state clears or immediately when the user chooses to skip waiting.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
