# TODO - ptydeck

This file defines concrete implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.

## Ownership Model

- `CODX`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Backend Tasks (OpenAPI-based REST)

- [x] `BE-001` Owner: `BE` Task: Create backend workspace in `backend/` with TypeScript build, lint, and test scripts.
- [x] `BE-002` Owner: `BE` Task: Add `backend/openapi/openapi.yaml` with `/api/v1` and schemas (`Session`, `CreateSessionRequest`, `ErrorResponse`).
- [x] `BE-003` Owner: `BE` Task: Implement `GET /api/v1/sessions` returning all persisted/live sessions.
- [x] `BE-004` Owner: `BE` Task: Implement `POST /api/v1/sessions` to create a PTY session and return session metadata.
- [x] `BE-005` Owner: `BE` Task: Implement `GET /api/v1/sessions/{sessionId}` with 404 for missing sessions.
- [x] `BE-006` Owner: `BE` Task: Implement `DELETE /api/v1/sessions/{sessionId}` to terminate PTY and remove state.
- [x] `BE-007` Owner: `BE` Task: Implement `POST /api/v1/sessions/{sessionId}/input` to write stdin bytes to PTY.
- [x] `BE-008` Owner: `BE` Task: Implement `POST /api/v1/sessions/{sessionId}/resize` and map to `pty.resize(cols, rows)`.
- [x] `BE-009` Owner: `BE` Task: Add runtime OpenAPI request and response validation middleware.
- [x] `BE-010` Owner: `BE` Task: Add centralized API error mapper with stable JSON payloads and HTTP status codes.
- [x] `BE-011` Owner: `BE` Task: Build `SessionManager` with lifecycle hooks (create, exit, close, cleanup).
- [x] `BE-012` Owner: `BE` Task: Add WebSocket endpoint `/ws` with events `session.created`, `session.data`, `session.exit`, `session.closed`, `error`.
- [x] `BE-013` Owner: `BE` Task: Implement WS routing by `sessionId` and heartbeat ping/pong timeout handling.
- [x] `BE-014` Owner: `BE` Task: Add persistence adapter (`json` initial) with load/save for `id`, `cwd`, `shell`, timestamps.
- [x] `BE-015` Owner: `BE` Task: Recreate sessions on backend boot using persisted `cwd`.
- [x] `BE-016` Owner: `BE` Task: Implement cwd marker parsing (`__CWD__...__`) and persist updates.
- [x] `BE-017` Owner: `BE` Task: Add graceful shutdown handler that closes all PTYs and flushes persistence.
- [x] `BE-018` Owner: `BE` Task: Add `/health` and `/ready` endpoints.
- [x] `BE-019` Owner: `BE` Task: Add CORS configuration for frontend origin and configurable allowed origins.

## Frontend Tasks (Classic Node.js FE stack)

- [x] `FE-001` Owner: `FE` Task: Create frontend workspace in `frontend/` with TypeScript build, lint, and test scripts.
- [x] `FE-002` Owner: `FE` Task: Integrate `xterm.js` terminal component with one instance per session.
- [x] `FE-003` Owner: `FE` Task: Build multi-terminal grid layout with explicit active-session highlight.
- [x] `FE-004` Owner: `FE` Task: Build session list/actions UI for create, focus, and close.
- [x] `FE-005` Owner: `FE` Task: Build central command input that sends `value + "\\n"` to active session.
- [x] `FE-006` Owner: `FE` Task: Forward direct keyboard input from active terminal to REST input endpoint.
- [x] `FE-007` Owner: `FE` Task: Generate typed API client from `backend/openapi/openapi.yaml`.
- [x] `FE-008` Owner: `FE` Task: Implement REST bootstrap flow to fetch sessions on app load.
- [x] `FE-009` Owner: `FE` Task: Implement WebSocket client with reconnect strategy and connection status indicator.
- [x] `FE-010` Owner: `FE` Task: Route WS events to terminals by `sessionId` and append terminal output efficiently.
- [x] `FE-011` Owner: `FE` Task: Implement terminal resize detection with debounced call to resize endpoint.
- [x] `FE-012` Owner: `FE` Task: Implement client state store (`sessions`, `activeSessionId`, `connectionState`).
- [x] `FE-013` Owner: `FE` Task: Add explicit UI states for loading, empty, error, and disconnected WS.
- [x] `FE-014` Owner: `FE` Task: Add cleanup of event listeners and terminal instances to prevent memory leaks.

## Integration, Quality, and Delivery Tasks

- [x] `INT-001` Owner: `PLAT` Task: Create root scripts for parallel BE/FE local dev (`npm run dev`).
- [x] `INT-002` Owner: `PLAT` Task: Add root `.nvmrc` and align Node.js engine versions in all package manifests.
- [x] `INT-003` Owner: `PLAT` Task: Add CI workflow for lint, build, and test in backend and frontend.
- [x] `INT-004` Owner: `QA` Task: Add backend unit tests for session manager and persistence adapter.
- [x] `INT-005` Owner: `QA` Task: Add backend integration tests for all REST endpoints in OpenAPI.
- [x] `INT-006` Owner: `QA` Task: Add backend WS integration tests for event ordering and reconnect behavior.
- [x] `INT-007` Owner: `QA` Task: Add frontend unit/component tests for store and terminal UI behaviors.
- [x] `INT-008` Owner: `QA` Task: Add E2E tests for core flow (create session, run command, see output, close session).
- [x] `INT-009` Owner: `PLAT` Task: Add `.env.example` files for backend and frontend runtime configuration.
- [x] `INT-010` Owner: `PLAT` Task: Document production build and deployment steps for both apps.

## Documentation Tasks (Codex Ownership)

- [x] `DOC-001` Owner: `CODX` Task: Keep `CODEX_CONTEXT.md` synchronized with architecture, conventions, and decision history.
- [x] `DOC-002` Owner: `CODX` Task: Keep `TODO.md`, `ROADMAP.md`, `DONE.md`, and `OUTLOOK-TODO.md` consistent after each planning change.
