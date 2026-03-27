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

- `CMD-004` Owner `FE`: Add deterministic fuzzy slash-suggestion ranking across slash commands, saved custom commands, sessions, and decks while preserving exact-prefix priority and stable fallback ordering when fuzzy scores tie.
- `CMD-005` Owner `FE`: Add browser-local recency personalization for slash suggestions and command-palette results with explicit deterministic fallback behavior when no history exists or fuzzy matches tie.
- `CMD-006` Owner `QA`: Add regression coverage for exact-prefix priority, fuzzy-match ordering, recency-based personalization, and stable no-history fallback behavior across composer autocomplete and command-palette flows.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
