# CODEX_CONTEXT - ptydeck

Last updated: 2026-03-22 (QLT-001/002/004/007/008/009/013/014/015/016/017 delivered, coverage baseline updated)
Owner: `CODY`
Documentation sync status: all repository markdown files reviewed and aligned on 2026-03-22.

## Project Purpose

`ptydeck` is a web-based multi-terminal controller that runs PTY-backed shell sessions in parallel.
The system separates backend execution concerns from frontend rendering concerns.

## Current Documentation Contract

- `TODO.md`: explicit implementation tasks only.
- `ROADMAP.md`: execution order, versions, and dependencies only.
- `DONE.md`: completed and verified topics only.
- `OUTLOOK-TODO.md`: mid/long-term items only.
- `README.md`: architecture and product behavior reference.
- `AGENTS.md`: agent roles, collaboration rules, and change control.

## Ownership Model

- `CODY`: Documentation consistency, roadmap governance, context persistence
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: CI/CD, runtime, and operational owner
- `QA`: Automated test owner
- Decision authority (`SAS`): Sven A. Schaefer (`svenschaefer`, `sven.schaefer@gmail.com`) is the final decision maker when a product or implementation decision is required.

## Core Technical Decisions (Current)

- Backend is Node.js with PTY runtime via `node-pty`.
- API contract is OpenAPI-first and versioned under `/api/v1`.
- Realtime channel uses WebSocket multiplexed by `sessionId`.
- Frontend is a classic Node.js stack with `xterm.js`.
- Session persistence currently targets metadata restoration (`cwd`, shell, timestamps), not running process restoration.

## Implemented Baseline (Current)

- Monorepo structure exists with `backend/` and `frontend/`.
- Root scripts exist for `dev`, `build`, `lint`, `test`, and `test:coverage`.
- Node version policy defined in `.nvmrc` and package `engines`.
- Backend bootstrap includes config loader, minimal HTTP server, and OpenAPI contract at `backend/openapi/openapi.yaml`.
- Frontend bootstrap includes config loader and minimal development HTTP page.
- CI workflow exists in `.github/workflows/ci.yml` for backend/frontend lint, test, and build.
- Environment templates exist in `backend/.env.example` and `frontend/.env.example`.
- Backend core REST lifecycle is implemented for session list/create/get/delete/input/resize.
- Backend includes centralized API errors (`ApiError` + mapper) and runtime request/response validation.
- Backend now includes WebSocket event streaming (`/ws`) with heartbeat handling.
- Backend now persists session metadata to JSON and restores sessions at startup.
- Backend includes graceful shutdown with PTY cleanup and persistence flush.
- Frontend now includes a real multi-session xterm UI, session actions, and central command input.
- Frontend now consumes backend snapshots/events via WebSocket reconnect flow.
- Frontend now performs per-session debounced resize calls to backend.
- Frontend resolves backend API/WS endpoints from the browser host at runtime (WSL IP friendly).
- Backend default CORS origin is `*` for local development compatibility across WSL/Windows boundary.
- Local reverse-proxy and local-domain configuration must remain provider-agnostic in repo docs and be stored only in ignored local configuration paths.
- Frontend API client now enforces explicit non-2xx handling and surfaces backend error payload fields.
- Frontend WebSocket client behavior now has dedicated unit test coverage for reconnect and close paths.
- Backend runtime negative/error REST paths are covered by integration tests.
- Backend runtime now enforces configurable max request body size and returns `413` for oversized payloads.
- Backend persistence now writes atomically with temp-file rename semantics and cleanup on failure.
- Backend restart restore now preserves persisted `createdAt`/`updatedAt` session metadata deterministically.
- Runtime shutdown persistence now saves a consistent session snapshot before PTY cleanup.
- Runtime now supports explicit readiness transition testing (`starting` -> `ready`) via startup gate hook.
- Runtime stop path is idempotent and safe for repeated shutdown calls.
- Backend now includes OpenAPI contract conformance testing for route/method surface and status-code compatibility.
- Frontend now supports injected runtime config override object with deterministic precedence for host/port and explicit URL values.
- CI quality workflow now executes on Node `18` and latest LTS matrix to catch runtime drift.
- Frontend dev static file resolution now blocks traversal paths and malformed encoded paths.
- `v0.3.0` status: completed.
- Includes previous frontend, quality gate, and deployment-baseline content under the compressed v0.3.0 milestone.
- Active next cycle A: `v0.3.0-H1` quality/coverage hardening backlog (`QLT-001` ... `QLT-017`).
- Active next cycle B: `v0.3.0-H2` enterprise readiness backlog (`ENT-001` ... `ENT-024`).
  - Completed in cycle A: `QLT-001`, `QLT-002`, `QLT-004`, `QLT-007`, `QLT-008`, `QLT-009`, `QLT-013`, `QLT-014`, `QLT-015`, `QLT-016`, `QLT-017`.

## Session Behavior Notes

- One active session at a time for central command input.
- Interactive apps (`vim`, `nano`, `top`, `less`) require direct PTY input forwarding.
- Resize events must be forwarded to backend PTY.
- Mouse forwarding is intentionally disabled in current baseline design.

## Known Constraints

- PTY behavior depends on host OS and shell.
- CWD tracking requires shell marker parsing (`__CWD__...__`).
- High-output streams require careful WS buffering and FE rendering behavior.

## Process Rules for Future Updates

- Keep all markdown files in US English.
- Update `CODEX_CONTEXT.md` whenever architecture, ownership, or planning contracts change.
- When adding/removing TODO items, also update `ROADMAP.md` if sequencing or dependencies are impacted.
- Move items from TODO to DONE only after implementation is verified.
- If the repository is missing `.git`, initialize it with `git init` before normal commit flow.
