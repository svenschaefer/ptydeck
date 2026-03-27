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

- `SWF-001` Owner `FE`: Define a strict line-oriented slash-workflow DSL grammar and AST schema (no loops, variables, or general scripting features), including explicit parse errors for invalid regex, missing timeout, unknown workflow directives, and malformed block-payload boundaries.
- `SWF-002` Owner `FE`: Implement a deterministic workflow execution engine (`ready -> running -> waiting -> succeeded|failed|stopped|cancelled`) with sequential step evaluation, explicit failure/time-out abort semantics, and no second slash-command dispatch path beside the existing command registry/executor.
- `SWF-003` Owner `FE`: Add abortable wait-step primitives (`wait delay`, `wait idle`, `wait until <source> <pattern> timeout`) using `AbortController`-style cancellation so each in-flight workflow step can be interrupted immediately without leaking listeners or timers.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
