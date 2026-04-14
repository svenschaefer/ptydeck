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

- `MSG-083` Owner `BE`
  Define and introduce a transport-neutral and app-neutral terminal messaging core so stream-to-message semantics are no longer modeled as Telegram/Codex-specific heuristics. The core contract must explicitly define `TerminalProjection`, `Turn`, `OutputEpisode`, `MessageIntent`, `DeliveryAdapter`, and `AppSemanticAdapter` boundaries so the same runtime can support Telegram, Discord, Slack, and future adapters as delivery surfaces, and Codex, Claude Code CLI, Gemini Code CLI, and future terminal apps as semantic producers without rebuilding the architecture per integration.
- `MSG-084` Owner `BE`
  Replace the current chunk-first terminal interpretation path with a backend terminal-state projection built on `@xterm/headless` or a documented technically superior equivalent only if implementation evidence proves it is the better fit. Feed the full PTY byte stream into a stable emulated screen/buffer model, expose deterministic baseline, snapshot, bounded scrollback/transcript delta, and diff primitives, and define explicit resource/retention constraints for memory ceiling, scrollback depth, inactive-session handling, and restart persistence so the new core remains predictable under multi-session load.
- `MSG-085` Owner `BE`
  Introduce turn-first and episode-first orchestration on top of the terminal-state projection so submit-bearing input opens a bounded `Turn` with a pre-turn baseline snapshot, stable completion on `session.activity.completed` plus a quiet window, and exactly one primary reply candidate by default, while autonomous output is modeled explicitly as `OutputEpisode` instead of being left to legacy separator heuristics. Message extraction must consume both turn-final stable screen diffs and bounded transcript/scrollback deltas so transient but relevant output is not lost, and input echo, prompt/footer chrome, working overlays, redraw churn, and stale pre-turn residue are treated as transport noise rather than direct message candidates.
- `MSG-086` Owner `BE`
  Refactor outbound semantic extraction to emit adapter-neutral `MessageIntent` objects from turns and autonomous episodes instead of Telegram/Codex-specific first-hit chunk or line heuristics. The first shipped semantic adapter may target Codex, but the architecture must make app-specific interpretation pluggable for Claude Code CLI, Gemini Code CLI, and future terminal apps, while delivery adapters map the same intents into Telegram, Discord, Slack, and future outbound channels. Preserve existing restart-recovery, duplicate suppression, and delivery-policy guarantees while removing the current dependency on minimum-length/minimum-word heuristics for short but correct replies.
- `MSG-087` Owner `PLAT`
  Introduce a shadow-mode and feature-flagged migration path for the `H128` architecture. The legacy and new stream-to-message pipelines must be able to run side by side on the same recorded traces and live runtime windows, emit comparable diagnostics, and gate primary cutover on explicit parity criteria so the refactor can be deployed safely without losing the ability to compare new `MessageIntent` output against the shipped narrow allowlist behavior.
- `MSG-088` Owner `QA`
  Validate the `v0.4.0-H128` stream-to-message architecture refactor end to end against the known field failures and the new neutrality requirements: the 2026-04-14 `18:07` trivial three-message Telegram test, stale-tail false starts such as `- worktree clean`, overlay/working pollution such as `Summarize recent commits • Working (0s • esc to interrupt)`, missing short correct replies such as `Ok, ebenfalls verstanden`, later input hijacking after a pending reply state remains open, autonomous multiline Codex section delivery, and dual-run parity during shadow mode. Prove that the new core emits one correct primary reply per turn, preserves formatting, keeps autonomous outputs bounded and stable, and is shaped so future delivery adapters and app semantic adapters can be added without reopening the transport/parser core.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
