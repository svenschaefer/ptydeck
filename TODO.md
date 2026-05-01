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

- [ ] `CMD-301` Owner `FE`: Add a browser-local per-session quick-send usage store for custom commands. Persist counts and recency by `sessionId` plus custom-command `lookupKey`, cap/prune stale entries deterministically, and expose a `top 5` query that ignores commands no longer visible for the session.
- [ ] `CMD-302` Owner `FE`: Add a subtle session-card hover quick-action surface that shows the per-session top 5 custom commands plus a `Send Clipboard` action. Reuse the existing send/terminator and clipboard runtime seams, and fail closed for exited, unrestored, read-only, or clipboard-unavailable cases.
- [ ] `CMD-303` Owner `QA`: Add regression coverage for quick-send ranking, stale-entry pruning, hover-surface rendering, direct custom-command dispatch, clipboard-send dispatch, and blocked/empty-state behavior.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role is currently inactive.
- `FE` ownership role (active): deliver `CMD-301` and `CMD-302` for per-session quick-send favorites and session-card quick actions.
- `PLAT` ownership role is currently inactive.
- `QA` ownership role (active): deliver `CMD-303` regression coverage for the quick-send favorites feature.
