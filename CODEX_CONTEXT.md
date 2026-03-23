# CODEX_CONTEXT - ptydeck

Last updated: 2026-03-23 (custom-command persistence/CRUD + guardrails + deterministic backend name normalization/sort policy + WS custom-command sync events + `/custom` management/execution + strict slash-mode boundary + preview panel + command-name/argument autocomplete + suggestion list + slash history/repeat + direct target routing + block-delimiter edge-case handling + preview-safety hardening completed in `QLT-037` ... `QLT-045`, `QLT-047`, `QLT-048`, `QLT-049`, `QLT-050`, `QLT-052`, `QLT-053`, `QLT-054`, and `QLT-056`; per-terminal settings icon/dialog migration, action relocation, startup-settings form, and lifecycle QA coverage completed in `QLT-058`, `QLT-059`, `QLT-062`, `QLT-064`, and `QLT-065`; per-session color-set personalization completed in `QLT-063`; backend startup-settings contract/apply and full theme-profile contract/persistence completed in `QLT-060`, `QLT-061`, and `QLT-066`; advanced per-terminal theme editor with full-palette apply behavior completed in `QLT-067`, including complete iTerm2 dark/light preset catalog integration (generated from `mbadolato/iTerm2-Color-Schemes`) and settings-dialog redesign; settings interaction model now uses one dialog-level apply/cancel flow with dirty-state feedback and draft-safe sync behavior; per-session destructive action wording now uses `Delete` with explicit confirmation; slash autocomplete rendering stabilized in the composer with inline hint font/offset alignment; composer status/feedback was relocated from workspace top into a compact composer meta block, send-button sizing was constrained to the textarea row, custom preview was converted to inline payload-only rendering, custom payload apostrophe handling was hardened, command submit terminator handling is now deterministic for shell/TUI workloads with one final submit signal and user-configurable modes (`auto`/`CRLF`/`LF`/`CR`) scoped per session settings, and backend CORS preflight now includes `PUT` and `authorization` for custom-command REST updates; `QLT-070` regression coverage completed for submit-mode matrix on routed and custom-command target sends; `QLT-057` regression coverage completed for non-slash and multiline-non-slash autocomplete disablement; `QLT-055` regression coverage completed for normalization/sort, suggestion keyboard behavior, and delimiter edge cases; remaining per-terminal settings/theme backlog `QLT-068`)
Owner: `CODY`
Documentation sync status: all repository markdown files reviewed and aligned on 2026-03-23 (including TODO/ROADMAP separation and explicit open-task ownership review).

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
- Frontend session lifecycle updates now avoid redundant `listSessions` roundtrips by applying local upsert/remove updates on create/rename/delete and WS lifecycle events.
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
- Backend custom-command naming policy now normalizes names via trim+lowercase for deterministic identity, mixed-case conflict handling, and stable REST list ordering.
- Backend WebSocket snapshot/stream now includes custom-command synchronization payloads (`customCommands` snapshot field plus `custom-command.created|updated|deleted` events).
- Backend session model now includes startup settings (`startCwd`, `startCommand`, `env`) with deterministic create/patch/restart persistence/apply behavior.
- Backend session model now includes full `themeProfile` contract/persistence (background, foreground, cursor, ANSI 16-color palette) with deterministic normalization/defaulting on create/patch/restore.
- Frontend terminal settings now include startup-settings form controls with explicit save workflow and client-side validation feedback for `startCwd`, `startCommand`, and `env`.
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
- Frontend now renders slash autocomplete directly in the command-composer area, with deterministic keyboard cycling (`Tab`, `Shift+Tab`, arrows, `Enter`) and no implicit command execution.
- Slash autocomplete now uses inline hinting (ghost suffix at the composer input) instead of a visible suggestion menu.
- Inline hint positioning is now measured using composer font metrics so hinting remains visually aligned with the typed text.
- Command status and feedback messaging now render directly in the composer area (not in a separate top workspace strip) for a single, localized command UX region.
- Composer layout now separates metadata and entry rows so the send button height follows the textarea row only.
- Custom-command preview now renders inline as payload-only helper text inside the composer input area, without target/newline metadata.
- Custom-command execution now escapes unbalanced apostrophes per line before send to avoid open-quote shell states on multiline payload text.
- Frontend command send path now appends exactly one final terminator selected in settings (`CRLF`, `LF`, or `CR`) across direct input, routed input, and custom-command execution.
- Backend CORS preflight headers now include `PUT` in allowed methods and `authorization` in allowed headers so `/api/v1/custom-commands/{name}` updates work cross-origin in browser clients.
- Frontend now supports non-slash direct target routing via `@<target> <text>` that reuses deterministic session-token resolution and does not switch active-session focus.
- Frontend `/custom` block parser now supports escaped delimiter payload lines (`\---` -> literal `---`) and returns explicit guidance for unescaped delimiter edge cases.
- Frontend terminal output append path now forces explicit post-write repaint to avoid delayed visual updates on non-focused sessions.
- Frontend now exposes per-terminal settings entry points on terminal cards, with session-scoped settings panel shell/toggle behavior.
- Frontend per-terminal settings now open as a true modal dialog (`<dialog>`) from a gear-icon button, replacing inline panel rendering.
- Frontend `Rename` and `Delete` actions now live inside the per-session settings dialog instead of the direct terminal toolbar.
- Frontend session deletion now requires explicit user confirmation before removing the terminal/session.
- Frontend per-session settings now include terminal color-set controls with persisted preset/custom palette state and deterministic xterm theme application per session.
- Frontend advanced per-terminal theme editor now supports full `themeProfile` fields (background, foreground, cursor, ANSI 16-color palette), extended preset selection, deterministic preset detection, and backend-persisted per-session apply behavior.
- Frontend theme preset catalog now includes complete upstream iTerm2 dark/light theme sets (484 entries) generated into `frontend/src/public/theme-library.js` via `scripts/generate-iterm2-theme-library.mjs`.
- Session settings dialog now uses a structured multi-section layout (`Startup`, `Theme`, `Session Actions`) with theme-category selection and text filtering for large preset catalogs.
- Session settings persistence UX now uses one dialog-level `Apply Changes` action with explicit `Cancel` and dirty/saved status feedback instead of fragmented per-section save buttons.
- Session settings form synchronization now preserves unsaved drafts while dirty and only resyncs controls automatically when no local draft is active.
- Session settings now include per-session submit terminator configuration (`auto`/`CRLF`/`LF`/`CR`), and terminal input/custom-command submission uses the target session mode instead of a global setting.
- Frontend settings lifecycle regression coverage now verifies settings icon/panel access, rename/delete relocation into settings, startup-settings save payload and env validation behavior, and per-session theme persistence across session delete/recreate.
- Planning baseline now includes per-terminal settings/theming tasks (`QLT-058` ... `QLT-068`) covering settings-icon entry, rename/delete relocation into settings, startup config fields (`Working Directory`, `Start Command Line`, `Environment Variables`), proper settings-dialog UX, and advanced per-session theme profiles.
- Planning baseline now includes command-submit semantics hardening tasks (`QLT-069`, `QLT-070`) to close shell vs TUI submit behavior gaps.
- `v0.3.0` status: completed.
- Includes previous frontend, quality gate, and deployment-baseline content under the compressed v0.3.0 milestone.
- Cycle A status: `v0.3.0-H1` quality/coverage hardening backlog completed (`QLT-001` ... `QLT-036`).
- Active next cycles: `v0.3.0-H1C` command extensibility/UX hardening, `v0.3.0-H1D` per-terminal settings/theme personalization, and `v0.3.0-H2` enterprise readiness backlog (current-scope subset in `TODO.md`; deferred auth/tenant items in `OUTLOOK-TODO.md`).
  - Completed in cycle A: `QLT-001`, `QLT-002`, `QLT-003`, `QLT-004`, `QLT-007`, `QLT-008`, `QLT-009`, `QLT-010`, `QLT-011`, `QLT-012`, `QLT-013`, `QLT-014`, `QLT-015`, `QLT-016`, `QLT-017`, `QLT-018`, `QLT-019`, `QLT-020`, `QLT-021`, `QLT-022`, `QLT-023`, `QLT-024`, `QLT-025`, `QLT-028`, `QLT-029`, `QLT-030`, `QLT-031`, `QLT-032`, `QLT-033`, `QLT-034`, `QLT-035`, `QLT-036`.
  - Completed in cycle B: `ENT-001`, `ENT-004`, `ENT-005`, `ENT-006`, `ENT-007`, `ENT-008`, `ENT-009`, `ENT-011`, `ENT-012`, `ENT-015`, `ENT-016`, `ENT-018`, `ENT-019`, `ENT-020`, `ENT-021`, `ENT-023`, `ENT-024`.
  - Planned next in cycle B: remaining enterprise hardening tasks from `TODO.md` (`ENT-013`, `ENT-014`, `ENT-022`).
  - Completed in cycle C: `QLT-042`, `QLT-043`, `QLT-044`, `QLT-045`, `QLT-049`, `QLT-050`, `QLT-053`, `QLT-054`, `QLT-055`, `QLT-056`, `QLT-057`, `QLT-070`.
  - Planned next in cycle C (`v0.3.0-H1C`): remaining custom slash-command and command-UX tasks from `TODO.md` (`QLT-046`, `QLT-051`).
  - Planned next in cycle D (`v0.3.0-H1D`): remaining per-terminal settings/theme tasks from `TODO.md` (`QLT-068`).

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
