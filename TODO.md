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
- [ ] `MSG-058` Owner `BE`: Simplify the Telegram slash-command surface so the published bot-command catalog is driven only by the canonical ptydeck slash/custom-command surface that operators actually use, removing the current Telegram-only built-in command publication (`status`, `stop`, `retry`, `replay`) unless an explicit canonical ptydeck command definition still justifies publishing them.
- [ ] `MSG-059` Owner `QA`: Validate the Telegram command-surface simplification end to end, including bot-command publication, `/docu` and `/go` execution through the mapped-session custom-command runtime path, removal of the old built-in Telegram command surface, and updated operator-facing documentation.
- [ ] `MSG-060` Owner `BE`: Preserve manual Telegram forum-topic renames where technically possible: detect externally renamed topics or otherwise avoid silently snapping them back to the canonical `<deck> + <terminal>` default in any path that can still issue `editForumTopic`, while keeping `chatId` / `messageThreadId` mapping stable and explicitly documenting any unavoidable limits.
- [ ] `MSG-061` Owner `QA`: Validate the manual-topic-rename preservation wave end to end, including restart/reload behavior, topic-binding persistence, no-regression mapping after a manual rename, and explicit coverage for any remaining rename-back paths that must stay intentional.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
