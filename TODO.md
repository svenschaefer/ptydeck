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

1. `STAB-502` Owner `FE`: stabilize the frontend-only refresh and reconnect path so attached-session control recovers deterministically after browser refreshes without falling back into stale `reconnecting` / `active attached session client` loops.
2. `STAB-503` Owner `BE`: harden the session lifecycle contract for fast-exiting processes and stale cards across create/start/exit/delete transitions, including deterministic backend semantics for cards that outlive their live PTY/runtime record.
3. `STAB-504` Owner `QA`: eliminate the known frontend broad-lane open-handle stall so `npm run test` and `npm run test:coverage:check` become trustworthy full-suite gates again.
4. `STAB-505` Owner `QA`: add focused acceptance coverage for the recent lifecycle cluster, including create into the active deck, immediate process exit, stale/exited delete behavior, stopped-state restore persistence, and frontend-only refresh/reconnect control recovery.

## Queued Open Tasks (Next Wave)

1. `None.`

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is currently active for `STAB-502`.
- `QA` ownership role is currently active for `STAB-504` and `STAB-505`.
- `BE` ownership role is currently active for `STAB-503`.
- `PLAT` ownership role is currently inactive.
