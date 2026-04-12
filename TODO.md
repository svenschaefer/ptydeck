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

- `MSG-046` Owner `BE`
  Make ptydeck custom slash commands available as Telegram slash commands from the canonical command surface, including deterministic command publication/update for the Telegram bot and runtime dispatch that keeps Telegram command handling aligned with the delivered ptydeck slash-command definitions instead of a separate handwritten Telegram-only list.
- `MSG-047` Owner `QA`
  Validate the Telegram slash-command publication and dispatch wave end to end, including regression coverage for command-schema synchronization, Telegram-safe command filtering and naming, inbound command routing, and updated operator documentation for the published Telegram slash-command surface.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
