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

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
