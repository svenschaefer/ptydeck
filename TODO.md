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

- `MSG-048` Owner `BE`
  Add restart-recovery suppression for `codex_separator_summary_sentence` only: introduce a per-session startup recovery mode that combines a short post-ready quiet window, persisted resend-memory keyed by normalized summary content plus session/thread context, and suppression until the first fresh post-restart session input so Codex startup-history replays cannot resend old Telegram summary posts after backend restarts.
- `MSG-049` Owner `QA`
  Validate the restart-recovery summary suppression wave end to end, including regression coverage for pre-ready and immediate post-ready restart resends, the first-restart case with no prior-history match, persisted-history suppression on later restarts, and explicit no-regression coverage proving that `codex_separator_info` and `codex_separator_section` remain unaffected by the summary-family gating.
- `MSG-046` Owner `BE`
  Make ptydeck custom slash commands available as Telegram slash commands from the canonical command surface, including deterministic command publication/update for the Telegram bot and runtime dispatch that keeps Telegram command handling aligned with the delivered ptydeck slash-command definitions instead of a separate handwritten Telegram-only list.
- `MSG-047` Owner `QA`
  Validate the Telegram slash-command publication and dispatch wave end to end, including regression coverage for command-schema synchronization, Telegram-safe command filtering and naming, inbound command routing, and updated operator documentation for the published Telegram slash-command surface.
- `MSG-050` Owner `BE`
  Add focused backend regression coverage for the highest-risk branch hotspots from the 2026-04-12 repo-wide audit: `backend/src/messaging-runtime.js`, `backend/src/telegram-adapter.js`, `backend/src/codex-outbound-evaluator.js`, and `backend/src/session-stream-analysis-capture.js`, with direct tests for retry/backoff suppression, restart-recovery/state-reset edges, capture rotation/error handling, and the remaining allowlist-family rejection branches that are still only partially exercised.
- `MSG-051` Owner `BE`
  Add focused backend seam coverage for the remaining low-coverage core infrastructure modules from the same audit: `backend/src/validation.js`, `backend/src/terminal-foreground-process.js`, and the restore/reclaim-heavy paths in `backend/src/session-manager.js`, so malformed contract variants, foreground-process ambiguity, and restore lifecycle edge cases no longer rely mainly on broad integration behavior.
- `MSG-052` Owner `QA`
  Close out the backend quality-hardening wave with a documented coverage-delta review plus the full local quality gate rerun, proving that the backend hotspot cluster improves branch depth without regressing the shipped Telegram/Codex messaging behavior.
- `MSG-053` Owner `FE`
  Add focused direct coverage for the frontend command/runtime orchestration hotspots from the 2026-04-12 repo-wide audit: `frontend/src/public/app-runtime-composition-controller.js`, `command-executor.js`, `command-engine.js`, `command-composer-runtime-controller.js`, and `command-send-safety-controller.js`, with emphasis on cross-controller command execution branches, guarded-send edge matrices, and runtime composition fallback paths that still sit in the low/mid-70s for branch coverage.
- `MSG-054` Owner `FE`
  Add focused direct coverage for the frontend stateful runtime and persistence hotspots from the same audit: `connection-profile-runtime-controller.js`, `workspace-preset-runtime-controller.js`, `store.js`, `ui/session-terminal-runtime-controller.js`, and `split-layout-runtime-controller.js`, covering persistence failure paths, preset/profile mutation edge cases, terminal stabilization/recovery branches, and layout-state fallback handling.
- `MSG-055` Owner `QA`
  Close out the frontend quality-hardening wave with targeted regression confirmation plus the full local quality gate rerun, and verify that the audited hotspot cluster improves without regressing existing handbook, runtime-controller, and command-surface contract coverage.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
