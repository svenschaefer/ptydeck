# TODO - ptydeck

This file defines concrete implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
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

- [x] `DOC-001` Owner: `CODY` Task: Keep `CODEX_CONTEXT.md` synchronized with architecture, conventions, and decision history.
- [x] `DOC-002` Owner: `CODY` Task: Keep `TODO.md`, `ROADMAP.md`, `DONE.md`, and `OUTLOOK-TODO.md` consistent after each planning change.

## Quality and Coverage Hardening (v0.3.0 continuation)

- [x] `QLT-001` Owner: `FE` Task: Handle non-2xx REST responses explicitly in `frontend/src/public/api-client.js` (check `response.ok`, parse and surface backend `ErrorResponse`).
- [x] `QLT-002` Owner: `FE` Task: Add unit tests for `frontend/src/public/ws-client.js` covering reconnect transitions and close behavior.
- [x] `QLT-003` Owner: `FE` Task: Add UI behavior tests for `frontend/src/public/app.js` critical paths (create/delete session errors, disconnected state rendering, command send failure).
- [x] `QLT-004` Owner: `BE` Task: Add backend tests for `runtime.js` negative/error routes (invalid JSON body, unknown route, invalid payload schema, unknown session on input/resize/delete).
- [x] `QLT-005` Owner: `PLAT` Task: Enforce minimum coverage thresholds in CI for backend and frontend test runs (fail pipeline when below threshold).
- [x] `QLT-006` Owner: `PLAT` Task: Split CORS defaults by environment (dev wildcard, explicit production allowlist) and document secure production setup in `DEPLOYMENT.md`.
- [x] `QLT-007` Owner: `BE` Task: Add request body size guard in backend runtime (reject oversized JSON payloads with explicit 413 response).
- [x] `QLT-008` Owner: `BE` Task: Persist and restore `createdAt`/`updatedAt` metadata deterministically instead of resetting timestamps on restart.
- [x] `QLT-009` Owner: `BE` Task: Make JSON persistence writes atomic (temp file + rename) and add crash-safety tests for partial-write scenarios.
- [x] `QLT-010` Owner: `FE` Task: Add frontend integration tests for DOM behavior in `app.js` (terminal card lifecycle, active state switching, empty/error status messaging).
- [x] `QLT-011` Owner: `FE` Task: Add WebSocket `error` event handling and bounded reconnect backoff with jitter in `ws-client.js`.
- [x] `QLT-012` Owner: `PLAT` Task: Add CI smoke step that boots backend+frontend and verifies `/health`, `/ready`, and initial frontend HTML response before merge.
- [x] `QLT-013` Owner: `FE` Task: Harden `frontend/src/dev-server.js` against path traversal (`..`) and add tests for safe static file resolution.
- [x] `QLT-014` Owner: `BE` Task: Add runtime tests for readiness state transitions (`starting` -> `ready`) and idempotent graceful shutdown behavior.
- [x] `QLT-015` Owner: `BE` Task: Add contract conformance test that verifies implemented runtime routes/status codes against `backend/openapi/openapi.yaml`.
- [x] `QLT-016` Owner: `FE` Task: Add runtime-config override support (API/WS ports/hosts via injected config object) and tests for fallback precedence.
- [x] `QLT-017` Owner: `PLAT` Task: Add CI matrix run for Node `18` and latest LTS to detect engine/runtime drift early.
- [x] `QLT-018` Owner: `FE` Task: Switch frontend default UI to tmux-like dark console style and increase terminal display size to about 125% of current baseline.
- [x] `QLT-019` Owner: `FE` Task: Correct dark-theme background gradient and enforce terminal-grid minimum column width before opening a new column.
- [x] `QLT-020` Owner: `BE` Task: Support session naming (`PATCH /sessions/{sessionId}` + FE rename UI) and default new-session cwd to user home when no persisted cwd exists.
- [x] `QLT-021` Owner: `FE` Task: Move command input area to page bottom, support multiline input cleanly, and set default command input height to 10 rows.

## Command Interface and Control Plane (v0.3.0 continuation)

- [x] `QLT-022` Owner: `FE` Task: Add command interpreter in command composer that routes `/...` inputs to control-plane actions and forwards non-slash input unchanged to active session.
- [x] `QLT-023` Owner: `FE` Task: Implement control commands `/new [shell]`, `/close [id]`, `/switch <id>`, `/next`, `/prev`, `/list`, `/rename <name>`, `/help` in the frontend command interpreter.
- [x] `QLT-024` Owner: `FE` Task: Add explicit command execution feedback area (success/error/help output) separated from PTY output stream.
- [x] `QLT-025` Owner: `BE` Task: Add session restart endpoint (`POST /api/v1/sessions/{sessionId}/restart`) to support `/restart` command semantics without restarting backend process.
- [x] `QLT-026` Owner: `QA` Task: Add integration tests for command-plane behavior (slash-command parsing, unknown-command handling, pass-through for non-slash input, command side effects).
- [x] `QLT-027` Owner: `FE` Task: Add frontend performance guardrails for session bootstrap and event handling (avoid redundant session list roundtrips, measure render latency for multi-session startup, and add regression test coverage for slow-load scenarios).
- [x] `QLT-028` Owner: `FE` Task: Stabilize terminal startup sizing with deferred resize passes and prevent repeated deferred scheduling on unrelated rerenders.
- [x] `QLT-029` Owner: `BE` Task: Strip CWD control markers from terminal output stream (including split marker chunks) while preserving CWD metadata updates.
- [x] `QLT-030` Owner: `FE` Task: Replace heuristic terminal size math with `xterm-addon-fit` and synchronize rows/cols from actual rendered terminal dimensions.
- [x] `QLT-031` Owner: `FE` Task: Switch shell layout to sidebar-first workspace and keep command send action horizontally aligned with command composer.
- [x] `QLT-032` Owner: `BE` Task: Remove persistence flushes for high-frequency `input`/`resize` operations to avoid interactive I/O overhead.
- [x] `QLT-033` Owner: `BE` Task: Include buffered terminal output in WebSocket snapshot payload so reconnecting clients can restore prompt/output context immediately.
- [x] `QLT-034` Owner: `FE` Task: Prevent terminal-grid stretch from inflating card height and causing large unused visual terminal areas.
- [x] `QLT-035` Owner: `FE` Task: Add sidebar settings for terminal geometry (fixed-size toggle and configurable cols/rows such as `80x20`) with persistent user preferences and immediate resize apply.
- [x] `QLT-036` Owner: `FE` Task: Add terminal quick IDs (`1..9`, `A..Z`) displayed next to session names for compact reference and future command-alias usage.

## Enterprise Readiness Backlog (v0.3.0 continuation)

- [x] `ENT-001` Owner: `BE` Task: Implement authentication and authorization middleware baseline for REST and WebSocket (JWT dev-mode token validation, route scope checks, `401`/`403` responses).
- [x] `ENT-004` Owner: `PLAT` Task: Add production logging standards (JSON logs, correlation IDs, PII redaction rules, log retention policy) and document in `DEPLOYMENT.md`.
- [x] `ENT-005` Owner: `PLAT` Task: Integrate secrets management strategy (no plaintext secrets in repo, runtime secret injection pattern, secret rotation procedure).
- [ ] `ENT-006` Owner: `BE` Task: Add configurable rate limiting and abuse controls for REST and WebSocket connection creation.
- [ ] `ENT-007` Owner: `PLAT` Task: Add dependency and image security scanning in CI (SCA + vulnerability gate) and generate SBOM artifact per release.
- [ ] `ENT-008` Owner: `PLAT` Task: Define SLOs/SLIs and alerting baseline for API availability, WS disconnect rate, and error-rate thresholds.
- [ ] `ENT-009` Owner: `PLAT` Task: Add backup/restore automation for persistence data and include periodic restore verification procedure.
- [ ] `ENT-011` Owner: `PLAT` Task: Enforce TLS-only ingress in production (HTTPS/WSS), document certificate lifecycle, and add automated expiry checks.
- [ ] `ENT-012` Owner: `BE` Task: Add encryption-at-rest option for persistence data (key-provider abstraction + key rotation support) and tests for decrypt/rotate paths.
- [ ] `ENT-013` Owner: `PLAT` Task: Define and implement least-privilege runtime profile (container/user permissions, filesystem write scope, network egress policy).
- [ ] `ENT-014` Owner: `PLAT` Task: Add disaster-recovery runbook with RTO/RPO targets and automate periodic restore drill verification in CI/non-prod.
- [ ] `ENT-015` Owner: `PLAT` Task: Add release evidence bundle generation (test results, SBOM, vulnerability scan output, commit provenance) for audit/compliance.
- [ ] `ENT-016` Owner: `BE` Task: Add security response headers and origin policy hardening for HTTP responses (CSP, X-Content-Type-Options, Referrer-Policy, HSTS via proxy docs).
- [x] `ENT-018` Owner: `PLAT` Task: Add reverse-proxy reference setup for local HTTPS/WSS host routing (provider-agnostic) in `DEPLOYMENT.md`.
- [ ] `ENT-019` Owner: `BE` Task: Add trusted-proxy configuration and safe `X-Forwarded-*` handling to avoid spoofed client/protocol metadata behind ingress.
- [ ] `ENT-020` Owner: `BE` Task: Add session lifecycle guardrails (max concurrent sessions, idle timeout, max session lifetime) with configurable limits and explicit API errors.
- [x] `ENT-021` Owner: `PLAT` Task: Add metrics baseline (request latency/error counters, active session gauge, WS connection gauge) and expose scrape endpoint for monitoring.
- [ ] `ENT-022` Owner: `QA` Task: Add non-functional load tests for concurrent session create/input/close and WS fanout stability with documented pass/fail thresholds.
- [x] `ENT-023` Owner: `PLAT` Task: Add configuration schema validation on startup (fail-fast on invalid/missing critical env values) for backend and frontend runtime configs.
- [ ] `ENT-024` Owner: `PLAT` Task: Define and document data retention/purge policy for persisted session metadata and audit/security logs, including automated cleanup cadence.
