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

- [ ] `MSG-056` Owner `BE`: Correct live restart-recovery enforcement for `codex_separator_summary_sentence` so summary-family deliveries that match prior restart history or arrive before the first fresh post-restart session input are actually suppressed in the live runtime, including the observed `2026-04-12T17:54:10.724Z` restart window across Telegram threads `7`, `8`, and `12`.
- [ ] `MSG-057` Owner `QA`: Validate the `v0.4.0-H112` restart-resend correction end to end against the latest `52`-message restart burst fixture, including no-send assertions for pre-ready and immediate post-ready summary resends plus explicit non-regression coverage proving that fresh post-input `codex_separator_summary_sentence` delivery still works.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
