# CODEX_CONTEXT - ptydeck

Last updated: 2026-03-24 (H15 completed; docs/task-governance sync revalidated)
Owner: `CODY`
Documentation sync status: all repository markdown files reviewed and aligned on 2026-03-24, including `docs/` review-note consolidation, TODO/ROADMAP separation validation, explicit open-task ownership sync, completion sync for `QLT-095`/`QLT-096`, `QLT-097`/`QLT-098`, `QLT-099`, `QLT-100`, `QLT-101`/`QLT-104`/`QLT-105`/`QLT-106`/`QLT-107`, hidden-scroll recovery closure for `QLT-108`/`QLT-109`, `QLT-110`/`QLT-111` terminal search completion, completion sync for the declarative autocomplete milestone (`QLT-112` ... `QLT-115`), completion sync for runtime metadata event consistency (`QLT-116` ... `QLT-118`), closure of the runtime store and contract hardening block (`QLT-119` ... `QLT-122`), completion of the explicit lifecycle-state-model block (`LIF-001` ... `LIF-006`), promotion of the stream-interpretation/plugin follow-up into `TODO.md` / `ROADMAP.md` as `v0.3.0-H13`, completion of `ARC-003` stream-adapter foundation, completion of `ARC-004` deterministic plugin-engine registry foundation, completion of `ARC-005` interpretation-action contract plus dispatcher integration, completion of `ARC-006` built-in stream-interpreter baseline, completion of `ARC-007` artifact-oriented interpretation and session-surface rendering, completion of `ARC-008` regression hardening for the full stream-interpretation foundation, promotion and completion sync for the browser-notification follow-up `v0.3.0-H14` (`LIF-007` ... `LIF-009`), completion of the auth hardening follow-up `v0.3.0-H15` (`ENT-026` ... `ENT-028`) including one-time WS handshake tickets and explicit `AUTH_MODE`, send-body newline normalization hardening so only the configured final terminator emits control-submit sequences, explicit decomposition of deferred plugin/stream-interpretation architecture into implementable `ARC-003` ... `ARC-008` subtasks, the `TODO-OUTLOOK.md` filename correction, docs-derived deferred stack-evolution capture in `TODO-OUTLOOK.md` (`ALT-001` ... `ALT-006`) alongside deferred `REM-001` ... `REM-009`, and an explicit no-open-task sync (`TODO.md` active-open = none, `ROADMAP.md` active release wave = none), revalidated in a dedicated markdown governance pass.

## Project Purpose

`ptydeck` is a web-based multi-terminal controller that runs PTY-backed shell sessions in parallel.
The system separates backend execution concerns from frontend rendering concerns.

## Current Documentation Contract

- `TODO.md`: explicit implementation tasks only.
- `ROADMAP.md`: execution order, versions, and dependencies only.
- `DONE.md`: completed and verified topics only.
- `TODO-OUTLOOK.md`: mid/long-term items only.
- `README.md`: architecture and product behavior reference.
- `AGENTS.md`: agent roles, collaboration rules, and change control.
- `LOCAL_QUALITY_GATE.md`: required local validation workflow (authoritative quality-gate commands).
- `docs/README.md`: index for imported architecture-review notes in `docs/`; useful for backlog derivation but not authoritative implementation status.

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

## Deck Domain Contract (Implemented, Authoritative)

The deck model is a strict isolation boundary above sessions.

- Deck identity:
  - Every session belongs to exactly one deck (`deckId`).
  - A default deck exists for legacy migration paths.
- Active deck semantics:
  - Exactly one deck is active in the UI.
  - Terminal-grid rendering is scoped to the active deck only.
  - Non-visible sessions in other decks remain running; only visibility is scoped.
- Isolation:
  - Session-level control actions default to active-deck scope unless an explicit cross-deck selector is provided.
  - No implicit cross-deck mutation is allowed.
- Settings scope:
  - Deck-level settings are independent per deck (initial baseline: terminal `cols`/`rows`).
  - Session settings remain per-session and do not become global across decks.
- Move semantics:
  - Moving a session between decks is explicit and deterministic.
  - Same-source/target moves are idempotent no-ops.
- Conflict handling:
  - Deck deletion of non-empty decks is rejected unless force semantics are explicitly requested.
  - Selector overlap across ID/quick-ID/tag/deck resolves per session ID with exactly-once execution.

## Implemented Baseline (Current)

- Monorepo structure exists with `backend/` and `frontend/`.
- Root scripts exist for `dev`, `build`, `lint`, `test`, `test:coverage`, and `test:coverage:check`.
- Backend default test execution now excludes `backend/test/nonfunctional.load.test.js`; the load harness remains opt-in via `npm --prefix backend run test:load`.
- Backend coverage execution now excludes `contract-conformance`, `nonfunctional.load`, `runtime.integration`, and `ws.integration` from the instrumented line-coverage run so `test:coverage` remains deterministic while those broader harnesses still execute in the normal validation path.
- Node version policy defined in `.nvmrc` and package `engines`.
- Backend bootstrap includes config loader, minimal HTTP server, and OpenAPI contract at `backend/openapi/openapi.yaml`.
- Frontend bootstrap includes config loader and minimal development HTTP page.
- CI workflow file exists in `.github/workflows/ci.yml` as an intentionally disabled stub (`if: false`) to avoid GitHub-hosted runner usage.
- Quality gates are expected via local execution (`npm run lint`, `npm run test`, `npm run test:coverage:check`, and selected smoke/security scripts).
- Local quality-gate latency can be heavily skewed by orphaned background `node --test`/`npm run test*` processes from interrupted runs; clean process state before timing/perf conclusions.
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
- Historical CI matrix logic exists in repository history, but active remote execution is currently disabled in favor of local-only validation flow.
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
- Backend persistence now stores deck entities (`decks`) alongside sessions/custom commands and persists per-session `deckId` (internal at runtime, API exposure planned in `QLT-086`).
- Backend restore path now migrates legacy persisted sessions into the `default` deck deterministically and keeps a persisted default deck catalog baseline.
- Backend now exposes deck lifecycle/assignment APIs (`/api/v1/decks`, `/api/v1/decks/{deckId}`, `/api/v1/decks/{deckId}/sessions/{sessionId}:move`) with deterministic validation and error mapping.
- Backend deck API baseline includes deterministic deck-id generation/validation, deck metadata/settings updates, explicit not-found handling, and non-empty/default deck delete guardrails with explicit `force=true` semantics.
- Backend session API contract is now deck-aware: all `Session` payloads include `deckId`, and `GET /api/v1/sessions` supports optional `deckId` query filtering without implicit cross-deck mutation.
- Deck conflict handling is now explicit at runtime: deleting non-empty decks requires `force=true` (with deterministic reassignment to `default`), same-source/target move is idempotent, and unknown deck move targets fail with explicit not-found errors.
- Frontend dev static file resolution now blocks traversal paths and malformed encoded paths.
- Frontend app behavior tests now cover create-session failure, delete-session failure, command-send failure, and reconnecting/disconnected status rendering.
- Frontend app integration tests now cover terminal card lifecycle updates, active-session focus switching, and empty-state rendering.
- Frontend sidebar now includes terminal geometry settings via user-configurable `cols`/`rows` (default `80x20`) persisted via `localStorage`; the previous fixed-size toggle was removed and geometry now consistently follows configured values.
- Active-terminal search now lives in the left sidebar instead of the bottom workspace command strip, preserving vertical terminal space in the main workspace.
- Sidebar overflow now belongs to the whole sidebar container rather than a deck-only inner scroll region, so deck navigation is no longer independently height-capped.
- Frontend fixed-size terminal rendering now derives card width and mount height deterministically from configured `cols`/`rows`, with uniform per-card sizing so row packing depends only on viewport width.
- Frontend fixed-size terminal rendering width chrome was fine-tuned by an additional 2px reduction after initial geometry correction.
- Frontend terminal workspace now hardens horizontal overflow behavior via fixed-size grid column constraints, card shrink guards, toolbar text truncation, and root `overflow-x` containment.
- Frontend terminal cards now display compact quick IDs (`1..9`, `A..Z`) next to session names for concise reference and future command alias support.
- Frontend deck navigation now lives in the left sidebar (no dedicated top header row), with deterministic deck create/rename/switch/delete flows and persisted active-deck selection.
- Frontend terminal geometry controls now map to active deck settings (`settings.terminal.cols/rows`) so `/size` and sidebar apply are deck-scoped (not global).
- Frontend new-session flow now moves newly created sessions into the active deck when the active deck is not default.
- Frontend terminal-grid visibility is now scoped strictly to the active deck, while non-active-deck sessions remain running and unchanged in runtime state.
- Frontend deck switching now applies render visibility before forced geometry updates and scopes resize propagation to the active deck, preventing transient cross-deck resize artifacts when deck terminal sizes differ.
- Frontend now tracks hidden-session viewport sync state: output received while hidden triggers forced resize/refresh recovery passes on re-show, with follow-to-bottom behavior restored when appropriate.
- Frontend regression coverage now includes hidden-deck background-output recovery so deck-switch viewport drift is exercised explicitly in app-level tests.
- Frontend terminal resize/mount geometry is now session-deck-derived rather than active-deck-derived, so hidden sessions keep their own deck `cols/rows` even while another deck is active.
- Deferred resize passes caused by deck switching are now active-deck-scoped, preventing delayed cross-deck terminal width/height bleed.
- Imported architecture review notes in `docs/` are now indexed in `docs/README.md`, with explicit separation between current-scope action items and deferred themes.
- The docs-review-confirmed current-scope frontend gap for terminal output search/find (`QLT-110`, `QLT-111`) is now closed.
- Frontend now handles backend `session.exit` as an explicit local `exited` session tombstone state with visible badge/hint UI, guarded post-exit interactions, local delete semantics, and reconnect snapshot cleanup.
- The explicit session lifecycle formalization block (`LIF-001` ... `LIF-006`) is now completed, including backend startup/running signaling, FE lifecycle-state modeling, derived `busy` / `idle`, explicit `closed` reducer semantics, and lifecycle regression coverage.
- Backend session lifecycle signaling now exposes explicit `starting` -> `running` startup transitions via `session.created`, `session.started`, and `session.updated`, and API/runtime payloads now carry stable `startedAt` / exit metadata instead of collapsing everything to a generic active state.
- Frontend runtime store now derives a dedicated per-session `lifecycleState` (`starting`, `running`, `busy`, `idle`, `exited`, `closed`) from backend state plus normalized activity signals, rather than collapsing all non-exited sessions into one generic active state.
- Frontend session-state UI now exposes an explicit `STARTING` badge/hint while preserving existing `UNRESTORED` and `EXITED` guardrail behavior.
- Frontend sidebar deck/session buttons now surface subtle runtime activity indicators: animated live output while activity is happening, then a sticky unseen marker until the session becomes active.
- Sidebar activity handling no longer republishes redundant store updates for every background-output chunk once a session is already in live-activity state, reducing unnecessary sidebar rerenders and improving sidebar click responsiveness under output churn.
- `ARC-003` is now completed: PTY chunk handling passes through a dedicated session-scoped stream adapter that emits deterministic `onData`, `onLine`, and `onIdle` callbacks with carriage-return overwrite handling, chunk-boundary line reconstruction, and optional ANSI stripping for line consumers.
- `ARC-004` is now completed: frontend stream interpretation has a dedicated plugin-engine registry with deterministic priority/registration ordering, frozen session-context snapshots, session lifecycle hooks, error isolation, and last-wins action conflict resolution at the registry boundary.
- `ARC-005` is now completed: declarative plugin output is normalized through `stream-action-dispatcher.js` into reducer-backed session interpretation state (`statusText`, attention, badges, artifacts, notifications, merged meta, normalized tags) instead of remaining a debug-only callback.
- `ARC-006` is now completed: built-in stream interpreters detect active-processing lines, prompt/idle recovery, and error/attention conditions, driving session status/badge/attention state through the declarative dispatcher.
- `ARC-007` is now completed: summary/result/next-step artifacts are extracted into session-scoped artifact records and rendered in dedicated card UI sections without altering raw terminal output.
- Multiline send-path normalization now preserves plain `LF` line breaks inside payload bodies for all submit modes; only the final configured terminator (`CR`, `CRLF`, `CR2`, or delayed `CR`) is emitted as a submit control sequence, which avoids mid-payload fragmentation in Codex/TUI sessions.
- `v0.3.0-H13` is now completed: the stream-adapter, plugin-registry, action-dispatch, built-in plugin, artifact-extraction, and regression-hardening slices are all delivered in the baseline.
- Planned next-step navigation UX now includes `>selector` quick-switch commands that auto-switch decks when needed, direct `>` deck targeting with autocomplete, broader `/...` and `>...` autocomplete coverage, unified `>` selector grammar with `/switch`, and sidebar terminal-entry buttons under each deck section with visible quick IDs.
- Frontend quick-switch baseline is now implemented: `>selector` activates sessions across decks, `>deckSelector` activates decks directly, `>deckSelector::sessionSelector` performs explicit cross-deck session targeting, and inline preview/ambiguity feedback is rendered in the composer before submit.
- Hidden-session output recovery is now hardened: when invisible terminals receive background output, show-time recovery explicitly resynchronizes xterm scroll area plus repaint/resize passes so bottom content remains reachable without manual interaction.
- Frontend app runtime has now been split across explicit helper layers: `frontend/src/public/terminal-stream.js`, `frontend/src/public/session-view-model.js`, `frontend/src/public/command-engine.js`, and `frontend/src/public/ui/components.js`, with `app.js` acting as orchestration glue instead of owning those concerns inline.
- Security/auth hardening from the docs review is now completed for the near-term block `v0.3.0-H15` (`ENT-026` ... `ENT-028`): WebSocket auth now uses one-time handshake tickets over `Sec-WebSocket-Protocol`, observable URLs no longer carry bearer tokens, and auth mode is explicitly gated via `AUTH_MODE`.
- Broader stream/plugin architecture remains deferred in `TODO-OUTLOOK.md` as `ARC-001` and `ARC-002`, while the near-term implementation slice that had been promoted into `v0.3.0-H13` is now fully completed (`ARC-003` ... `ARC-008`).
- External terminal/SSH tool survey follow-up remains intentionally deferred to `TODO-OUTLOOK.md` as explicit medium-term backlog (`REM-001` ... `REM-009`) covering SSH session kinds, auth/trust, saved connection profiles, remote-session reconnect semantics, controlled file transfer, sharing/read-only mode, and theme import/export compatibility.
- Terminal search/find was the only survey-derived feature kept in near-term scope; it is now implemented via `QLT-110`/`QLT-111` on top of the `QLT-100` FE modularization baseline.
- The `withfig/autocomplete`-inspired declarative command-completion architecture is now implemented through `frontend/src/public/command-completion.js`, declarative slash-command specs, cached contextual providers, and richer inline suggestion metadata (`QLT-112` ... `QLT-115`).
- Imported docs identified broader WebSocket-first runtime-state consistency as a real near-term structural gap beyond custom commands; that gap is now closed via `v0.3.0-H10` (`QLT-116` ... `QLT-118`).
- Imported technical-alternatives notes now also land explicitly in `TODO-OUTLOOK.md` as deferred stack-evolution items (`ALT-001` ... `ALT-006`) covering backend framework adoption, structured WS protocol layering, relational persistence options, frontend framework migration, stronger state-management approaches, and build/workspace modernization.
- Frontend active-session selection now falls back deterministically when switching decks: if current focus is outside active deck, focus moves to first session in deck (or clears when deck has no sessions).
- Frontend slash command plane now includes deck operations (`/deck list|new|rename|switch|delete`) and session-to-deck move (`/move <sessionSelector> <deckSelector>`) with explicit deterministic feedback.
- Slash autocomplete now includes deck subcommand and selector contexts for `/deck ...` and `/move ...` argument positions.
- Frontend selector routing for `/switch`, `/next`, `/prev`, `/filter`, and `@target` is now active-deck scoped by default, preventing implicit cross-deck resolution.
- Explicit cross-deck addressing for deck-scoped selector paths is now available via `deckSelector::sessionSelector`.
- Multi-selector command resolution now supports deck selectors (`deck:<deckSelector>`) and wildcard (`*`) with conflict-safe dedupe by session ID across overlap matches.
- Frontend WebSocket client now reports explicit `error` connection state and reconnects with bounded exponential backoff plus jitter.
- CI quality workflow now installs workspace dependencies and runs smoke boot validation (`scripts/ci-smoke.sh`) for backend and frontend startup readiness.
- CI now enforces backend/frontend line-coverage thresholds (`scripts/check-coverage.sh`) before merge on Node `18`.
- Frontend composer input now routes slash-prefixed commands to control-plane handling via `command-interpreter.js` and forwards non-slash input unchanged to terminal execution.
- Frontend command plane now executes `/new [shell]`, `/close [selector[,selector...]]`, `/switch <id>`, `/next`, `/prev`, `/list`, `/rename <name>` (active) or `/rename <selector> <name>`, `/restart [selector[,selector...]]`, and `/help`, with session token resolution via full ID, quick ID, name, or unique ID prefix.
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
- Backend mutating REST operations now persist state synchronously before success response to reduce restart-loss windows for newly created or updated sessions.
- Backend restore now applies deterministic shell/cwd fallback attempts and retains unrestorable persisted sessions in persistence snapshots instead of dropping them.
- CI now includes automated certificate expiry checks via `scripts/check-cert-expiry.sh` with repository-configurable host and threshold inputs.
- CI now includes dependency vulnerability gating (`scripts/security-scan.sh`) and SBOM generation (`scripts/generate-sbom.sh`) with uploaded JSON artifacts (SPDX when available, CycloneDX fallback).
- CI supports optional Trivy image vulnerability scanning when `SECURITY_IMAGE_REF` is configured as a repository variable.
- Backup/restore automation now exists via `scripts/backup-sessions.sh` and `scripts/restore-sessions.sh`, with deterministic roundtrip verification in CI/non-prod via `scripts/verify-backup-restore.sh`.
- Retention/purge automation now exists via `scripts/purge-retention.sh` with configurable retention windows for backups/logs/security artifacts and CI dry-run validation cadence.
- Release evidence bundle automation now exists via `scripts/generate-release-evidence.sh`, producing manifest/checksum tracked artifacts that include test logs, coverage gate output, SCA output, SBOM files, and CI commit provenance metadata.
- Backend auth/authz middleware baseline now supports JWT validation in `AUTH_MODE=dev`, scope-based route guards for REST/WS, and explicit `401`/`403` API responses.
- Backend now exposes `/api/v1/auth/dev-token` when auth dev mode is enabled; frontend automatically acquires this token and applies it to REST and WebSocket connections.
- Backend server startup now loads local `backend/.env` / `backend/.env.local` files before configuration resolution (without overriding already exported shell env vars), so local `AUTH_MODE=dev` can be activated through repo-local env files.
- Auth/tenant hardening items beyond current baseline (`ENT-002`, `ENT-003`, `ENT-010`, `ENT-017`, `ENT-025`) are intentionally deferred to `TODO-OUTLOOK.md`.
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
- Frontend command send path now appends exactly one final terminator selected in settings (`CRLF`, `LF`, `CR`, `CR2`, `CR_DELAY`) across direct input, routed input, and custom-command execution.
- Frontend API client now treats deck move (`POST /api/v1/decks/{deckId}/sessions/{sessionId}:move`) as `204 No Content` and follows with `GET /api/v1/sessions/{sessionId}` to avoid empty-body JSON parse failures.
- Backend WebSocket payloads now normalize session objects to API shape with `deckId` for both `snapshot.sessions` and `session.created`, preventing FE reload/deck-view drift caused by deck-less WS session payloads.
- Backend CORS preflight headers now include `PUT` in allowed methods and `authorization` in allowed headers so `/api/v1/custom-commands/{name}` updates work cross-origin in browser clients.
- Frontend now supports non-slash direct target routing via `@<target> <text>` that reuses deterministic session-token resolution and does not switch active-session focus.
- Frontend `/custom` block parser now supports escaped delimiter payload lines (`\---` -> literal `---`) and returns explicit guidance for unescaped delimiter edge cases.
- Frontend terminal output append path now forces explicit post-write repaint to avoid delayed visual updates on non-focused sessions.
- Stream-plugin status extraction now keeps compact activity phrases (for example `Working(...)`) instead of full long source lines, and session status is rendered inline in the existing terminal header metadata area rather than as a dedicated extra row.
- Snapshot output replay now appends directly to terminal buffers (without passing through live stream-interpretation hooks), reducing startup/reconnect churn from historical output replay.
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
- Session settings now include per-session submit terminator configuration (`auto`/`CRLF`/`LF`/`CR`/`CR2`/`CR_DELAY`), and terminal input/custom-command submission uses the target session mode instead of a global setting.
- Frontend `/filter` selector text is persisted in local storage and restored on startup; when active session is outside current filter, focus switches deterministically to the first visible filtered session.
- Backend session contract now includes per-session `tags` with deterministic validation/normalization and persistence across create/patch/list/get/restore flows.
- Frontend session settings now include tag management with validation and deterministic terminal-card tag rendering.
- Frontend command routing now supports multi-target selectors including tags for `@...`, `/close`, `/restart`, and custom-command execution with dedupe-by-session-ID semantics.
- Frontend slash settings now support parity with dialog-managed session settings via `/settings show` and `/settings apply`, including startup fields, env map, tags, theme profile, and submit mode.
- Frontend settings lifecycle regression coverage now verifies settings icon/panel access, rename/delete relocation into settings, startup-settings save payload and env validation behavior, and per-session theme persistence across session delete/recreate.
- Planning baseline now includes per-terminal settings/theming tasks (`QLT-058` ... `QLT-068`) covering settings-icon entry, rename/delete relocation into settings, startup config fields (`Working Directory`, `Start Command Line`, `Environment Variables`), proper settings-dialog UX, and advanced per-session theme profiles.
- Planning baseline now includes command-submit semantics hardening tasks (`QLT-069`, `QLT-070`) to close shell vs TUI submit behavior gaps.
- `v0.3.0` status: completed.
- Includes previous frontend, quality gate, and deployment-baseline content under the compressed v0.3.0 milestone.
- Cycle A status: `v0.3.0-H1` quality/coverage hardening backlog completed (`QLT-001` ... `QLT-036`).
- Active next cycles: none currently.
  - Completed in cycle A: `QLT-001`, `QLT-002`, `QLT-003`, `QLT-004`, `QLT-007`, `QLT-008`, `QLT-009`, `QLT-010`, `QLT-011`, `QLT-012`, `QLT-013`, `QLT-014`, `QLT-015`, `QLT-016`, `QLT-017`, `QLT-018`, `QLT-019`, `QLT-020`, `QLT-021`, `QLT-022`, `QLT-023`, `QLT-024`, `QLT-025`, `QLT-028`, `QLT-029`, `QLT-030`, `QLT-031`, `QLT-032`, `QLT-033`, `QLT-034`, `QLT-035`, `QLT-036`.
  - Completed in cycle B: `ENT-001`, `ENT-004`, `ENT-005`, `ENT-006`, `ENT-007`, `ENT-008`, `ENT-009`, `ENT-011`, `ENT-012`, `ENT-015`, `ENT-016`, `ENT-018`, `ENT-019`, `ENT-020`, `ENT-021`, `ENT-023`, `ENT-024`.
  - Planned next in cycle B: none (current-scope enterprise tasks complete).
  - Completed in cycle C: `QLT-042`, `QLT-043`, `QLT-044`, `QLT-045`, `QLT-046`, `QLT-049`, `QLT-050`, `QLT-051`, `QLT-053`, `QLT-054`, `QLT-055`, `QLT-056`, `QLT-057`, `QLT-070`.
  - Planned next in cycle C (`v0.3.0-H1C`): none (cycle C scope completed).
  - Completed in cycle D: `QLT-068`.
  - Completed in cycle E: `QLT-072`, `QLT-073`, `QLT-074`, `QLT-075`, `QLT-076`, `QLT-077`.
  - Planned next in cycle E (`v0.3.0-H3`): none.
  - Completed in cycle F: `QLT-078`, `QLT-079`.
  - Planned next in cycle F (`v0.3.0-H4`): none.
  - Completed in cycle G: `QLT-080`, `QLT-081`, `QLT-082`, `QLT-094`, `PLAT-011`.
  - Planned next in cycle G (`v0.3.0-H5`): none.
  - Completed in cycle H (`v0.3.0-H6`): `QLT-083`, `QLT-084`, `QLT-085`, `QLT-086`, `QLT-087`, `QLT-088`, `QLT-089`, `QLT-090`, `QLT-091`, `QLT-092`, `QLT-093`.
  - Planned next in cycle H (`v0.3.0-H6`): none.
  - Completed in cycle I (`v0.3.0-H7`): `QLT-095`, `QLT-096`, `QLT-097`, `QLT-098`, `QLT-099`, `QLT-100`, `QLT-101`, `QLT-102`, `QLT-103`, `QLT-104`, `QLT-105`, `QLT-106`, `QLT-107`, `QLT-108`, `QLT-109`.
  - Completed in cycle J (`v0.3.0-H8`): `QLT-110`, `QLT-111`.
  - Planned next in cycle J (`v0.3.0-H8`): none.
  - Completed in cycle K (`v0.3.0-H9`): `QLT-112`, `QLT-113`, `QLT-114`, `QLT-115`.
  - Planned next in cycle K (`v0.3.0-H9`): none.
  - Completed in cycle L (`v0.3.0-H10`): `QLT-116`, `QLT-117`, `QLT-118`.
  - Planned next in cycle L (`v0.3.0-H10`): none.
  - Completed in cycle M (`v0.3.0-H11`): `QLT-119`, `QLT-120`, `QLT-121`, `QLT-122`.
  - Planned next in cycle M (`v0.3.0-H11`): none.
  - Completed in cycle N so far (`v0.3.0-H12`): `LIF-001`, `LIF-005`, `LIF-006`.
  - Completed in cycle N (`v0.3.0-H12`): `LIF-001`, `LIF-002`, `LIF-003`, `LIF-004`, `LIF-005`, `LIF-006`.
  - Completed in cycle O (`v0.3.0-H13`): `ARC-003`, `ARC-004`, `ARC-005`, `ARC-006`, `ARC-007`, `ARC-008`.
  - Planned next in cycle O (`v0.3.0-H13`): none.

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
