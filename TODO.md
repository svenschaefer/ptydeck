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

- `MSG-087` Owner `PLAT`
  Introduce a shadow-mode and feature-flagged migration path for the `H128` architecture. The legacy and new stream-to-message pipelines must be able to run side by side on the same recorded traces and live runtime windows, emit comparable diagnostics, and gate primary cutover on explicit parity criteria so the refactor can be deployed safely without losing the ability to compare new `MessageIntent` output against the shipped narrow allowlist behavior.
- `MSG-088` Owner `QA`
  Validate the `v0.4.0-H128` stream-to-message architecture refactor end to end against the known field failures and the new neutrality requirements: the 2026-04-14 `18:07` trivial three-message Telegram test, stale-tail false starts such as `- worktree clean`, overlay/working pollution such as `Summarize recent commits • Working (0s • esc to interrupt)`, missing short correct replies such as `Ok, ebenfalls verstanden`, later input hijacking after a pending reply state remains open, autonomous multiline Codex section delivery, and dual-run parity during shadow mode. Prove that the new core emits one correct primary reply per turn, preserves formatting, keeps autonomous outputs bounded and stable, and is shaped so future delivery adapters and app semantic adapters can be added without reopening the transport/parser core.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
