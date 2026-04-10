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

- `MSG-012` Owner `BE`: Add bounded messaging-runtime trace capture and analysis logging for the current single-user adapter path, recording raw outbound candidate events, normalized message-policy decisions (`new`, `update`, `alert`, `suppress`), correlation keys, target thread metadata, suppression reasons, and rate-limit/backoff outcomes so noisy sessions can be diagnosed from persisted evidence instead of only from observed Telegram spam.
- `MSG-013` Owner `BE`: Add outbound noise classification and duplicate suppression for the current Telegram reference baseline, covering near-identical status churn, repeated progress snapshots, separator-only fragments, path/model/token-budget tails, and other high-frequency low-information updates from agentic CLIs so one logical status thread is updated instead of spraying many near-duplicate messages.
- `MSG-014` Owner `BE`: Add app-aware outbound block aggregation on top of the delivered `H79` app-identity layer, using prompt boundaries, quiet windows, and bounded separator-aware heuristics for Codex-, Gemini-, and generic-shell-style sessions so messaging flushes meaningful progress blocks and summaries instead of line-level terminal noise.
- `MSG-015` Owner `QA`: Add closeout validation for `v0.4.0-H80`, including mocked Telegram duplicate/noise regression coverage, trace-log contract tests, app-aware aggregation validation for coding-agent and generic-shell sessions, and a deterministic full local quality-gate rerun.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
