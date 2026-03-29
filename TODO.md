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

- `OBS-005A` Owner `BE`: Add a backend distributed-tracing baseline that issues deterministic trace and correlation IDs across REST requests, WebSocket connection/session event flows, and PTY/session lifecycle logging, with explicit log field names and stable linkage between request, connection, session, and deck context.
- `OBS-005B` Owner `FE`: Thread backend trace and correlation metadata through the frontend REST/WS runtime and debug surfaces so operator-visible diagnostics can correlate one session/action path across request, websocket, and terminal-runtime events without reintroducing stream-scanning heuristics.
- `OBS-005C` Owner `QA`: Add regression coverage for distributed trace propagation across REST, WS, and PTY paths, including request/connection correlation continuity, missing-trace fallback behavior, and no-regression validation for shared/spectator flows.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
