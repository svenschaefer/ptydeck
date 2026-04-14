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

- `MSG-079` Owner `BE`
  Investigate the recurring backend `Unhandled pty write error [Error: EINTR: interrupted system call, write]` field reports seen during local `npm run dev` startup and subsequent runtime activity. Reconstruct from logs and code which PTY write paths are emitting these unhandled `EINTR` errors, whether they are transient retryable interruptions versus genuine data-loss conditions, what observable runtime impact they currently have on session input/output behavior, and which concrete corrective strategies are technically appropriate.
- `MSG-080` Owner `QA`
  Reproduce and validate the PTY `EINTR` write-error path end to end in development mode: prove under which startup/runtime conditions the repeated unhandled write errors occur, whether PTY writes are silently retried or effectively lost today, and whether the current operator-visible behavior matches the intended runtime contract or requires a later corrective implementation wave.
- `MSG-081` Owner `FE`
  Eliminate the remaining browser-originated session `/input` writes that still fire on first frontend attach after a backend-only restart despite `H125`. Use the live 2026-04-14 field case where `ws.snapshot.sent` at `2026-04-14T15:59:46.833Z` was followed by repeated browser `POST /api/v1/sessions/.../input` writes on session `b24c99aa-5152-41cc-8f69-32cfe8caa5ad` (`bytes=62` then `bytes=1` at `2026-04-14T16:00:06Z`, then the same pair again at `2026-04-14T16:00:21Z`). Isolate the exact remaining frontend bootstrap path that still emits those writes and ensure first frontend open stays passive until explicit operator interaction.
- `MSG-082` Owner `QA`
  Reproduce and validate the residual frontend-bootstrap input-write regression after `H125`: prove that first frontend open after a backend-only restart still produces snapshot and resize behavior as intended, but no unintended session `/input` writes, reply-window arming, or PTY activity occur before explicit operator interaction once the corrective follow-up lands.
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
