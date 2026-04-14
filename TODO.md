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

- `MSG-093` Owner `BE`
  Introduce a second semantic-adapter baseline on top of the new `AppSemanticAdapter` registry so the post-`H128` core is proven to support more than Codex. Ship a generic coding-agent adapter contract plus representative replay-backed adapter coverage for Codex-shaped versus Claude Code CLI / Gemini Code CLI-style transcript differences, keeping the core unchanged while proving future app adapters can plug in through the same semantic boundary.
- `MSG-094` Owner `QA`
  Validate the multi-app semantic-adapter path with replay fixtures and runtime-level tests that prove Codex, generic coding-agent, and representative Claude/Gemini-style transcripts can be classified through the registry without reopening transport parsing, turn orchestration, or delivery-policy code.
- `MSG-095` Owner `PLAT`
  Add a Discord-style reference delivery adapter on top of the delivered `MessageIntent` core so the post-`H128` architecture is proven outside Telegram. The adapter must preserve the same ptydeck authority boundaries, bounded action vocabulary, and thread/channel mapping rules while consuming the existing adapter-neutral message intents instead of any Telegram-specific runtime shortcut.
- `MSG-096` Owner `QA`
  Validate cross-adapter parity once the Discord reference adapter lands: prove Telegram and Discord consume the same `MessageIntent` outputs with transport-specific formatting only, while keeping restart recovery, duplicate suppression, update-versus-new semantics, and bounded autonomous delivery consistent across both adapters.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
