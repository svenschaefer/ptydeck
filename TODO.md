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

- `DRV-002` Owner `BE`: Add configurable terminal replay/scrollback retention policy (memory and optional persisted snapshot depth limits) with explicit product-level constraints for partial vs extended history recovery.
- `DRV-005` Owner `QA`: Add compatibility regression matrix for shell/runtime combinations (bash/zsh/fish where supported) covering CWD tracking, prompt detection, and replay/snapshot behavior under differing shell semantics.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
