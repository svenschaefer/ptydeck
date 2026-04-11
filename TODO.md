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

- `MSG-034` Owner `BE`: Implement the first post-hard-break outbound Telegram reactivation as one narrow Codex-only candidate family, `codex_separator_info`, sourced from entry-level stream analysis rather than line-by-line terminal text: only when app label `codex` is active, a major separator survives as its own stream entry, and the next non-noise substantial bullet inside a short bounded horizon is a clean `info` block with at most one immediate indented continuation line merged.
- `MSG-035` Owner `BE`: Add the remaining guards needed so that `MSG-034` cannot regress into flooding: keep generic window-level restart/remount and overlay-churn suppression in place for all other outbound paths, reject separator-anchored candidates when inline contamination from anti-pattern bullets, prompt markers, footer ribbons, or interrupt overlays is present, and deliver the resulting Codex candidate only as a deterministic thread update/reuse path instead of reopening broad new-message churn.
- `MSG-036` Owner `QA`: Add closeout validation for `v0.4.0-H99`, including persisted raw-stream-capture replay coverage for `codex_separator_info`, explicit no-send regressions for `Ran`, `Explored`, `Waited`, `Context compacted`, footer/status-ribbon, and redraw/overlay fragments, plus the full local quality gate rerun on the final tree.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
