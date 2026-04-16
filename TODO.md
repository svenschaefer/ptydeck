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

1. `MSG-111` Owner `BE`
   Generalize restart-resend protection beyond the current summary-only path so backend restarts do not re-deliver previously shipped or trivially rewritten narrow outbound messages through `codex_input_reply`, `codex_separator_info`, or `codex_separator_section`. The new restart-admission layer must preserve the existing summary-family safeguards, add family-aware restart quarantine plus resend memory for the other shipped narrow outbound families, and distinguish genuinely fresh post-restart output from replayed or near-duplicate history instead of relying only on exact summary-text matches.
2. `MSG-112` Owner `QA`
   Validate the widened restart-resend protection end to end against real restart windows and replay helpers. Prove that already-delivered or near-duplicate narrow outbound content is suppressed after restart until a defensible fresh post-restart boundary exists, while legitimate new post-input replies and sections still ship once with the current formatting and duplicate-suppression guarantees intact.
3. `MSG-113` Owner `BE`
   Fix Telegram outbound text-integrity corruption in the narrow shipped path where delivered messages can lose middle segments or gain trailing numeric fragments such as `55` or `46`. Use the live 2026-04-16 cases where projection-backed delivery emitted `because the backend side is currently behaving correctly. 46` and where the block between `3. session-/family-übergreifende Restart-Admission für alle schmalen outbound families` and `anschließend um.` was split so only the head and tail survived. The fix must isolate whether the corruption comes from terminal projection snapshots, transcript/diff assembly, newline/whitespace normalization, or Telegram-visible truncation, and then restore exact text continuity in delivered messages.
4. `MSG-114` Owner `QA`
   Validate the outbound text-integrity correction against the known trailing-number and mid-message-hole cases, proving that shipped Telegram delivery preserves complete structured text without extra numeric tails, missing middle blocks, or new regressions to multiline formatting, bounded truncation, or adapter parity.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
