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
- `MSG-066` Owner `BE`
  Replace the current Telegram-only `codex_input_reply` eligibility gate with a stream-first Codex reply-block promotion path: detect the next substantial new Codex answer block from the PTY stream regardless of whether it was triggered by Telegram, REST, frontend `Send`, or another local session-input path; keep content relevance as the promotion decision; and treat origin only as a delivery/threading hint so Telegram-correlated inputs can still prefer reply semantics without suppressing otherwise relevant new stream blocks.
- `MSG-067` Owner `QA`
  Validate the stream-first Codex reply-block promotion wave end to end, including the observed noon `ptydeck` REST-input case, Telegram-input free-question cases, no-regression coverage proving separator-based families keep their current bounded behavior, and no-regression coverage proving low-value meta/workflow chatter is still rejected even after reply promotion no longer depends on Telegram origin.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
