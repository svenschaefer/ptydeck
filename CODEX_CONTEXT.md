# CODEX_CONTEXT - ptydeck

Last updated: 2026-03-22 (custom-command persistence/CRUD + guardrails + `/custom` management/execution + strict slash-mode boundary + preview panel + command-name/argument autocomplete + slash history/repeat + direct target routing + preview-safety hardening completed in `QLT-037` ... `QLT-045`, `QLT-047`, `QLT-049`, `QLT-050`, and `QLT-056`; per-terminal settings/theme backlog added as `QLT-058` ... `QLT-064`)
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
- Root scripts exist for `dev`, `build`, `lint`, `test`, `test:coverage`, and `test:coverage:check`.
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
- Backend CORS defaults are environment-split: development falls back to wildcard `*`, production requires explicit allowlist values.
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
- Frontend default visual baseline is now dark console/tmux-like, with increased terminal readability and larger default terminal viewport.
- Dark-mode background gradient and terminal-grid minimum column width behavior were adjusted for predictable multi-column layout.
- Sessions now support explicit naming via API/UI, and new sessions default cwd to user home when no prior history exists.
- Command composer is bottom-docked, multiline by default (10 rows), and supports explicit submit via `Ctrl/Cmd+Enter`.
- Frontend terminal initialization/resize path now guards against invalid pre-layout dimensions and duplicate resize calls to prevent session load stalls.
- Frontend debug mode (`?debug=1`) now logs API, WebSocket, render, and resize flow events for browser-side troubleshooting.
- Backend debug mode now supports optional persistent debug file output via `BACKEND_DEBUG_LOG_FILE`.
- Frontend dev server now injects runtime API/WS/debug values into `window.__PTYDECK_CONFIG__` for deterministic runtime endpoint/debug wiring.
- Frontend session lifecycle updates now avoid redundant `listSessions` roundtrips by applying local upsert/remove updates on create/rename/close and WS lifecycle events.
- Frontend layout is now sidebar-first and terminal card stretching is constrained so visual height does not inflate with unused area.
- Frontend terminal geometry now uses `xterm-addon-fit` with mount resize observation to keep effective rows/cols aligned with rendered terminal size.
- Backend now strips CWD marker control output from terminal streams and keeps marker parsing only for metadata updates.
- Backend no longer flushes persistence on every `input`/`resize`, reducing interactive I/O overhead during typing and resize activity.
- Backend WebSocket snapshots now include buffered session output; frontend replays snapshot output after reconnect to restore prompt context.
- Frontend dev static file resolution now blocks traversal paths and malformed encoded paths.
- Frontend app behavior tests now cover create-session failure, delete-session failure, command-send failure, and reconnecting/disconnected status rendering.
- Frontend app integration tests now cover terminal card lifecycle updates, active-session focus switching, and empty-state rendering.
- Frontend sidebar now includes terminal geometry settings via user-configurable `cols`/`rows` (default `80x20`) persisted via `localStorage`; the previous fixed-size toggle was removed and geometry now consistently follows configured values.
- Frontend fixed-size terminal rendering now derives card width and mount height deterministically from configured `cols`/`rows`, with uniform per-card sizing so row packing depends only on viewport width.
- Frontend terminal workspace now hardens horizontal overflow behavior via fixed-size grid column constraints, card shrink guards, toolbar text truncation, and root `overflow-x` containment.
- Frontend terminal cards now display compact quick IDs (`1..9`, `A..Z`) next to session names for concise reference and future command alias support.
- Frontend WebSocket client now reports explicit `error` connection state and reconnects with bounded exponential backoff plus jitter.
- CI quality workflow now installs workspace dependencies and runs smoke boot validation (`scripts/ci-smoke.sh`) for backend and frontend startup readiness.
- CI now enforces backend/frontend line-coverage thresholds (`scripts/check-coverage.sh`) before merge on Node `18`.
- Frontend composer input now routes slash-prefixed commands to control-plane handling via `command-interpreter.js` and forwards non-slash input unchanged to terminal execution.
- Frontend command plane now executes `/new [shell]`, `/close [id]`, `/switch <id>`, `/next`, `/prev`, `/list`, `/rename <name>`, `/restart [id]`, and `/help`, with session token resolution via full ID, quick ID, name, or unique ID prefix.
- Frontend now renders command-plane results in a dedicated feedback panel (`command-feedback`) separated from loading/connection/error status and PTY terminal output stream.
- Backend now provides `POST /api/v1/sessions/{sessionId}/restart` to restart PTY processes without changing session identity, with OpenAPI/validation/contract-test coverage.
- Frontend integration coverage now validates command-plane slash behavior end-to-end in app runtime (`unknown command`, non-slash pass-through to terminal input, `/restart` side-effect path).
- Frontend startup path now includes bootstrap de-duplication and startup performance telemetry (`window.__PTYDECK_PERF__`) to track bootstrap readiness and initial terminal render latency.
- Frontend app integration coverage now includes delayed-bootstrap regression behavior to ensure deterministic loading state and single list-bootstrap request under slow-load conditions.
- Backend and frontend startup config loaders now enforce fail-fast validation for critical runtime env fields (port bounds, URL protocol checks, production CORS requirement, and positive numeric limits).
- Deployment runbook now includes a provider-agnostic reverse-proxy routing contract for local HTTPS/WSS host routing, including `/api/v1` and `/ws` mapping expectations and WebSocket upgrade requirements.
- Deployment runbook now includes a production logging standard (JSON log contract, correlation ID handling, PII redaction rules, retention policy baseline).
- Backend now exposes `GET /metrics` with Prometheus-style baseline metrics for HTTP traffic, request durations, active sessions, and active WebSocket connections.
- Deployment runbook now includes secrets-management baseline guidance (runtime injection, no plaintext in repo, and rotation procedure).
- Deployment runbook now includes SLO/SLI definitions with initial alert thresholds and escalation baseline tied to runtime metrics.
- Backend runtime now emits security response headers baseline (`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`) across API and operational routes.
- Deployment runbook now defines HSTS as an ingress/proxy concern with explicit baseline policy values.
- Backend runtime now supports trusted-proxy configuration (`TRUST_PROXY`) and only accepts sanitized `X-Forwarded-*` metadata when request source matches trusted proxy policy.
- Backend runtime now enforces configurable fixed-window abuse controls for REST session creation and WS connection creation (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_REST_CREATE_MAX`, `RATE_LIMIT_WS_CONNECT_MAX`).
- Backend runtime now enforces configurable session lifecycle guardrails for concurrent-session cap, idle timeout, and max lifetime with periodic enforcement sweep.
- Backend persistence now supports optional AES-256-GCM encryption-at-rest with key-provider abstraction and key-id based rotation workflow.
- Backend now supports TLS-only ingress enforcement mode (`ENFORCE_TLS_INGRESS`) with trusted-proxy protocol checks across REST and WebSocket upgrade paths.
- CI now includes automated certificate expiry checks via `scripts/check-cert-expiry.sh` with repository-configurable host and threshold inputs.
- CI now includes dependency vulnerability gating (`scripts/security-scan.sh`) and SBOM generation (`scripts/generate-sbom.sh`) with uploaded JSON artifacts (SPDX when available, CycloneDX fallback).
- CI supports optional Trivy image vulnerability scanning when `SECURITY_IMAGE_REF` is configured as a repository variable.
- Backup/restore automation now exists via `scripts/backup-sessions.sh` and `scripts/restore-sessions.sh`, with deterministic roundtrip verification in CI/non-prod via `scripts/verify-backup-restore.sh`.
- Retention/purge automation now exists via `scripts/purge-retention.sh` with configurable retention windows for backups/logs/security artifacts and CI dry-run validation cadence.
- Release evidence bundle automation now exists via `scripts/generate-release-evidence.sh`, producing manifest/checksum tracked artifacts that include test logs, coverage gate output, SCA output, SBOM files, and CI commit provenance metadata.
- Backend auth/authz middleware baseline now supports JWT validation in `AUTH_DEV_MODE=1`, scope-based route guards for REST/WS, and explicit `401`/`403` API responses.
- Backend now exposes `/api/v1/auth/dev-token` when auth dev mode is enabled; frontend automatically acquires this token and applies it to REST and WebSocket connections.
- Auth/tenant hardening items beyond current baseline (`ENT-002`, `ENT-003`, `ENT-010`, `ENT-017`, `ENT-025`) are intentionally deferred to `OUTLOOK-TODO.md`.
- Default local runtime ports are now backend `18080` and frontend `18081` to reduce conflicts with common project/dynamic port ranges.
- Frontend runtime config now supports no-parameter domain operation: `ptydeck.*` browser hosts auto-target `api.<current-host>` for REST/WS, while localhost/IP hosts retain `18080` fallback for development.
- Backend now persists global custom commands and exposes OpenAPI-backed CRUD endpoints at `/api/v1/custom-commands` and `/api/v1/custom-commands/{commandName}`.
- Persistence format now supports runtime state object storage (`sessions` + `customCommands`) with backward-compatible restore from legacy session-array snapshots.
- Backend custom-command guardrails now enforce reserved system-command collision rejection, name regex, max name length, max content length, and max command count with explicit API errors.
- Frontend command plane now supports `/custom` definition parsing for inline and multiline block syntax with deterministic validation feedback for malformed block payloads.
- Frontend API client now supports custom-command upsert calls used by `/custom` definition flows.
- Frontend command plane now supports `/custom list`, `/custom show <name>`, and `/custom remove <name>` management flows.
- Frontend now executes custom commands via `/<customName> [target]` with existing session-token resolver semantics and auto-newline append when missing.
- Slash mode boundary is strict: control-plane parsing activates only when `/` is the first character of input; leading spaces or later-line slashes remain terminal input.
- Frontend now renders a non-blocking preview panel for `/<customName>` showing exact payload, target resolution, and newline-append behavior before send.
- Preview rendering is text-only and applies deterministic truncation for large payloads, including explicit omitted-character feedback.
- Frontend slash-command name autocomplete now supports deterministic `Tab`/`Shift+Tab` cycling with system-command precedence before custom-command aliases.
- Frontend slash-command argument autocomplete now supports context-sensitive candidate cycling for `/switch`, `/close`, `/custom show`, `/custom remove`, and `/<customName> <target>`.
- Frontend now supports slash-command history recall (`ArrowUp`/`ArrowDown`) in slash-mode input while leaving non-slash multiline composer behavior unchanged.
- Frontend now supports slash-repeat shortcut for recalled commands (`Ctrl/Cmd+Enter`) with guardrail feedback when recalled content was modified.
- Frontend now supports non-slash direct target routing via `@<target> <text>` that reuses deterministic session-token resolution and does not switch active-session focus.
- Planning baseline now includes per-terminal settings/theming tasks (`QLT-058` ... `QLT-064`) covering settings-icon entry, rename/close relocation into settings, startup config fields (`Working Directory`, `Start Command Line`, `Environment Variables`), and per-session color sets.
- `v0.3.0` status: completed.
- Includes previous frontend, quality gate, and deployment-baseline content under the compressed v0.3.0 milestone.
- Cycle A status: `v0.3.0-H1` quality/coverage hardening backlog completed (`QLT-001` ... `QLT-036`).
- Active next cycles: `v0.3.0-H1C` command extensibility/UX hardening, `v0.3.0-H1D` per-terminal settings/theme personalization, and `v0.3.0-H2` enterprise readiness backlog (current-scope subset in `TODO.md`; deferred auth/tenant items in `OUTLOOK-TODO.md`).
  - Completed in cycle A: `QLT-001`, `QLT-002`, `QLT-003`, `QLT-004`, `QLT-007`, `QLT-008`, `QLT-009`, `QLT-010`, `QLT-011`, `QLT-012`, `QLT-013`, `QLT-014`, `QLT-015`, `QLT-016`, `QLT-017`, `QLT-018`, `QLT-019`, `QLT-020`, `QLT-021`, `QLT-022`, `QLT-023`, `QLT-024`, `QLT-025`, `QLT-028`, `QLT-029`, `QLT-030`, `QLT-031`, `QLT-032`, `QLT-033`, `QLT-034`, `QLT-035`, `QLT-036`.
  - Completed in cycle B: `ENT-001`, `ENT-004`, `ENT-005`, `ENT-006`, `ENT-007`, `ENT-008`, `ENT-009`, `ENT-011`, `ENT-012`, `ENT-015`, `ENT-016`, `ENT-018`, `ENT-019`, `ENT-020`, `ENT-021`, `ENT-023`, `ENT-024`.
  - Planned next in cycle B: remaining enterprise hardening tasks from `TODO.md` (`ENT-013`, `ENT-014`, `ENT-022`).
  - Completed in cycle C: `QLT-042`, `QLT-043`, `QLT-044`, `QLT-045`, `QLT-049`, `QLT-050`, `QLT-056`.
  - Planned next in cycle C (`v0.3.0-H1C`): remaining custom slash-command and command-UX tasks from `TODO.md` (`QLT-046`, `QLT-048`, `QLT-051` ... `QLT-055`, `QLT-057`).
  - Planned next in cycle D (`v0.3.0-H1D`): per-terminal settings/theme tasks from `TODO.md` (`QLT-058` ... `QLT-064`).

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
