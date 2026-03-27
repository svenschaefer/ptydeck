# TODO - ptydeck

This file defines concrete, open implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.
Completed work belongs in `DONE.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)

- `REP-001` Owner `BE`: Add a backend session replay export contract that returns the currently retained replay tail for a session with deterministic truncation metadata, explicit content-type/format behavior, and stable authz/validation semantics.
- `REP-002` Owner `FE`: Add a frontend replay-export workflow for terminal sessions (slash command plus discoverable session action) that downloads or copies the exported retained replay tail and surfaces truncation metadata clearly to the operator.
- `REP-003` Owner `QA`: Add regression coverage for replay export semantics across reconnect snapshots, restart-restored replay tails, truncation boundaries, and unsupported/empty-session edge cases.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
