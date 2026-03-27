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

- `CMD-002` Owner `FE`: Implement template-capable custom-command definition, preview, and execution flows in the frontend so `/custom` can save explicit template commands, `/<customName>` can accept deterministic parameter assignments, and missing/unknown placeholders return concise guidance instead of silently sending malformed payloads.
- `CMD-003` Owner `QA`: Add regression coverage for template-command validation, backward-compatible plain custom commands, parameter substitution, built-in variable expansion, preview rendering, and error handling for missing or unknown template inputs.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
