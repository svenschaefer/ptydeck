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

- `MSG-020` Owner `BE`: Fix Telegram attention recurrence semantics so exact or near-exact repeated failure lines can alert again after the bounded churn window expires, while still suppressing short-term duplicate attention flooding and preserving the existing in-place follow-up edit behavior for richer detail on the same recent failure.
- `MSG-021` Owner `BE`: Make prompt-boundary handling chunk-position-aware so meaningful summary or attention content that arrives in the same PTY chunk as a prompt marker is classified and flushed in the correct order instead of being hidden behind an early `Prompt ready.` update.
- `MSG-022` Owner `BE`: Refine coding-agent tail trimming so low-value `/review`, model/budget, diff-marker, and trailing breadcrumb noise is still removed without truncating actionable error context such as file paths, source locations, or other path-bearing diagnostics that belong to the actual failure line.
- `MSG-023` Owner `QA`: Add closeout validation for `v0.4.0-H83`, covering exact-repeat attention recurrence outside the bounded churn window, mixed chunk prompt-boundary plus summary ordering, preservation of actionable path-bearing error text after coding-agent tail trimming, and a deterministic local quality-gate rerun for the Telegram messaging path.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
