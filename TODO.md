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

- `MSG-095` Owner `PLAT`
  Add a Discord-style reference delivery adapter on top of the delivered `MessageIntent` core so the post-`H128` architecture is proven outside Telegram. The adapter must preserve the same ptydeck authority boundaries, bounded action vocabulary, and thread/channel mapping rules while consuming the existing adapter-neutral message intents instead of any Telegram-specific runtime shortcut.
- `MSG-096` Owner `QA`
  Validate cross-adapter parity once the Discord reference adapter lands: prove Telegram and Discord consume the same `MessageIntent` outputs with transport-specific formatting only, while keeping restart recovery, duplicate suppression, update-versus-new semantics, and bounded autonomous delivery consistent across both adapters.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
