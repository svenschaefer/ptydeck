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

- `CMD-007` Owner `BE`: Extend the persisted custom-command contract so commands can be scoped as `global`, `project`, or `session`, with deterministic normalization, optional `sessionId` binding for session-scoped commands, backward-compatible migration for existing unscoped commands, and explicit precedence metadata that the frontend can consume without inventing a local-only override model.
- `CMD-008` Owner `FE`: Add scoped custom-command workflows in the frontend so operators can create, list, show, remove, autocomplete, preview, and execute global/project/session-scoped commands with deterministic precedence and clear scope visibility in slash help, autocomplete, and command-palette surfaces.
- `CMD-009` Owner `QA`: Add regression coverage for scoped custom-command normalization, backward-compatible restore/migration, precedence resolution, session-scoped visibility, and deterministic no-ambiguity behavior across REST, autocomplete, command-palette, preview, and execution flows.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
