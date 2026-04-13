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

- `MSG-064` Owner `BE`
  Add a Telegram-input-correlated Codex reply delivery path so mapped free-text questions such as `Wie geht’s weiter?` can produce one bounded Telegram-visible reply even when the returning Codex answer is not separator-anchored; correlate the next substantial Codex answer block to the triggering Telegram input, prioritize that reply candidate ahead of later meta/workflow chatter, and keep generic outbound hard-disabled.
- `MSG-065` Owner `QA`
  Validate the Telegram reply-correlation wave end to end, including the observed `Wie geht’s weiter?` style free-question case, no-regression coverage proving reply correlation does not publish low-value workflow chatter before the first real answer, and no-regression coverage proving the existing separator-based families (`codex_separator_info`, `codex_separator_section`, `codex_separator_summary_sentence`) keep their current bounded behavior outside the reply window.
- `MSG-062` Owner `BE`
  Refine Codex outbound message-boundary ownership so larger separator-anchored closing comments are not prematurely emitted through the narrow `codex_separator_info` family when the same anchored block is still growing toward a stable section boundary; keep `codex_separator_info` for truly short paragraph bullets, keep `codex_separator_summary_sentence` sentence-like, and promote qualifying multi-line closing-comment blocks onto the `codex_separator_section` path instead.
- `MSG-063` Owner `QA`
  Validate the Codex message-boundary refinement wave end to end, including transcript-fixture regressions for multi-line closing comments, no-regression coverage for short `codex_separator_info` bullets, no-regression coverage proving `codex_separator_summary_sentence` stays sentence-like, and fresh live-log analysis after restart to confirm the richer closing-comment blocks are grouped and closed by the intended top-level boundaries.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
