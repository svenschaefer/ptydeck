# DONE - ptydeck

Completed and verified topics belong here.

## 2026-03-22

- [x] Initial `README.md` drafted with architecture, protocol, and operational concepts.
- [x] Initial planning set created: `TODO.md`, `ROADMAP.md`, `DONE.md`, `OUTLOOK-TODO.md`.
- [x] Documentation normalized to US English and ownership model defined.
- [x] `CODEX_CONTEXT.md` created to persist project context for future Codex runs.
- [x] `DOC-001` completed: `CODEX_CONTEXT.md` synchronized with current architecture, ownership model, and process rules.
- [x] `DOC-002` completed: planning docs (`TODO.md`, `ROADMAP.md`, `DONE.md`, `OUTLOOK-TODO.md`) aligned and kept consistent.
- [x] Git repository initialized in `/home/wsl/workspace/code/ptydeck`.
- [x] `v0.1.0` baseline delivery completed: `BE-001`, `BE-002`, `FE-001`, `INT-001`, `INT-002`, `INT-009` implemented.
- [x] CI baseline implemented (`INT-003`) with lint, test, and build jobs for backend and frontend.
- [x] Local validation completed for current changes: `npm run lint`, `npm run test`, and `npm run test:coverage` all pass.
- [x] `v0.2.0` backend core delivery completed: `BE-003`, `BE-004`, `BE-005`, `BE-006`, `BE-007`, `BE-008`, `BE-009`, `BE-010`, `BE-011`, `BE-019`.
- [x] Added `SessionManager` with PTY lifecycle integration and REST control endpoints under `/api/v1/sessions`.
- [x] Added runtime request/response validation and centralized API error mapping for backend routes.
- [x] Added backend unit tests for `SessionManager`, `validation`, and `errors` modules.
- [x] Backend coverage raised to `93.61%` total lines in local `npm run test:coverage`.
- [x] `v0.3.0` backend realtime/persistence delivery completed: `BE-012`, `BE-013`, `BE-014`, `BE-015`, `BE-016`, `BE-017`, `BE-018`.
- [x] Added WebSocket endpoint `/ws` with heartbeat and live `session.*` event broadcasting.
- [x] Added JSON persistence adapter and startup restore from persisted metadata (`id`, `cwd`, `shell`, timestamps).
- [x] Added CWD marker extraction (`__CWD__...__`) from PTY output into session metadata.
- [x] Added graceful shutdown flow with PTY cleanup and persistence flush.
- [x] Backend coverage after `v0.3.0` changes: `93.89%` total lines.
- [x] `v0.4.0` frontend progress delivered: `FE-002`, `FE-003`, `FE-004`, `FE-005`, `FE-006`, `FE-008`, `FE-009`, `FE-010`, `FE-011`, `FE-012`, `FE-014`.
- [x] Added browser UI with xterm terminals, active-session control, and central command input.
- [x] Added WS reconnect/status handling and per-session output routing.
- [x] Added frontend tests for API client and state store (`INT-007`).
- [x] `FE-007` completed with generated frontend API types from `backend/openapi/openapi.yaml`.
- [x] `FE-013` completed with explicit loading, empty, error, and disconnected UI states.
- [x] `v0.4.0` milestone completed.
- [x] `v0.5.0` quality gate completed: `INT-004`, `INT-005`, `INT-006`, `INT-008`.
- [x] Added backend REST integration test covering session lifecycle endpoints.
- [x] Added backend WS integration test covering event flow and reconnect snapshot behavior.
- [x] Added runtime-based backend E2E core flow coverage in automated tests.

## Maintenance Rules

- Move tasks to `DONE.md` only after implementation and verification.
- Keep entries factual and traceable to commits.
- Keep chronological order by date.
