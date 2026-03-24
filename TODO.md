# TODO - ptydeck

This file defines concrete implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)

- [ ] `QLT-112` Owner: `FE` Task: Introduce a declarative completion-spec model for the ptydeck command plane (`/`, `>`, and settings-related arguments) so command names, argument definitions, descriptions, and insertion behavior are data-driven instead of hardcoded across the frontend runtime.
- [ ] `QLT-113` Owner: `FE` Task: Add generator-backed contextual suggestion providers for command arguments (for example decks, sessions, tags, custom commands, paths, env keys, and themes) with deterministic caching, bounded latency, and explicit no-side-effect guarantees while typing.
- [ ] `QLT-114` Owner: `FE` Task: Add richer autocomplete presentation metadata (descriptions, examples, completion kinds, and insert previews) while preserving the existing inline composer UX, deterministic keyboard-first behavior, and fallback order.
- [ ] `QLT-115` Owner: `QA` Task: Add regression coverage for declarative and generator-backed autocomplete behavior, including deterministic ranking, timeout/fallback behavior, generator error isolation, and no unintended side effects during suggestion resolution.

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
- [x] `PLAT-011` Owner: `PLAT` Task: Align local-only quality-gate workflow across repo docs and disable remote GitHub-runner execution assumptions in the active CI baseline.

## Documentation Tasks (Codex Ownership)

- [x] `DOC-001` Owner: `CODY` Task: Keep `CODEX_CONTEXT.md` synchronized with architecture, conventions, and decision history.
- [x] `DOC-002` Owner: `CODY` Task: Keep `TODO.md`, `ROADMAP.md`, `DONE.md`, and `TODO-OUTLOOK.md` consistent after each planning change.

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
- [x] `QLT-037` Owner: `BE` Task: Add global custom-command persistence and OpenAPI REST CRUD (`GET /api/v1/custom-commands`, `PUT /api/v1/custom-commands/{name}`, `GET /api/v1/custom-commands/{name}`, `DELETE /api/v1/custom-commands/{name}`) with deterministic overwrite semantics.
- [x] `QLT-038` Owner: `BE` Task: Enforce custom-command naming/size guardrails (reserved system-command name collision rejection, regex validation, max name length, max content length, max command count) with explicit API errors.
- [x] `QLT-039` Owner: `FE` Task: Implement `/custom` management command parser with inline (`/custom <name> <text>`) and block mode (`/custom <name>` + `---` multiline + `---`) including stable validation errors for malformed blocks.
- [x] `QLT-040` Owner: `FE` Task: Implement custom-command execution (`/<customName>` and `/<customName> <target>`) that resolves target by session ID, quick ID, exact name, or unique ID-prefix and sends content 1:1 to PTY with auto-trailing newline when missing.
- [x] `QLT-041` Owner: `FE` Task: Enforce strict slash-command mode boundary: command mode only when first character of first line is `/`; any leading whitespace or later-line slash remains plain terminal input.
- [x] `QLT-042` Owner: `FE` Task: Add non-blocking custom-command preview panel for `/<customName>` before execution (shows exact payload, target resolution, and newline append indicator).
- [x] `QLT-043` Owner: `FE` Task: Add TAB/SHIFT+TAB autocomplete for slash command names with deterministic cycling, system-command precedence over custom-command aliases, and no-op on zero matches.
- [x] `QLT-044` Owner: `FE` Task: Add context-sensitive argument autocomplete for slash commands (`/switch`, `/close`, `/custom remove`, `/custom show`, `/<customName> <target>`) with session/custom-command candidate cycling.
- [x] `QLT-045` Owner: `FE` Task: Add slash-command history navigation (`ArrowUp`/`ArrowDown`) scoped to slash-mode only, preserving existing multiline composer behavior for non-slash input.
- [x] `QLT-046` Owner: `QA` Task: Add integration tests for custom-command lifecycle and edge cases (reserved name collision, malformed/missing block delimiters, ambiguous target token, no active session, multiline payload fidelity, large payload rejection, autocomplete cycle stability, history behavior).
- [x] `QLT-047` Owner: `FE` Task: Implement `/custom list`, `/custom show <name>`, and `/custom remove <name>` command execution with deterministic command-feedback output and explicit not-found handling.
- [x] `QLT-048` Owner: `BE` Task: Add custom-command change events (`custom-command.created`, `custom-command.updated`, `custom-command.deleted`) to WebSocket snapshots/streams so multiple connected clients stay in sync without manual reload.
- [x] `QLT-049` Owner: `FE` Task: Add optional direct target prefix routing (`@<target> <text>`) for non-slash composer input to send text to a resolved target session without switching active session.
- [x] `QLT-050` Owner: `FE` Task: Add slash-command repeat shortcut (`Ctrl/Cmd+Enter` on recalled slash command) with guardrails preventing accidental repeat when composer content differs from recalled history item.
- [x] `QLT-051` Owner: `QA` Task: Add integration tests for `/custom` management commands, multi-client custom-command sync events, `@<target>` routing ambiguity handling, and repeat-shortcut guardrail behavior.
- [x] `QLT-052` Owner: `BE` Task: Define deterministic custom-command naming normalization and listing order (case policy, duplicate-name conflict rules, stable sort in REST responses) and enforce it in validation/storage.
- [x] `QLT-053` Owner: `FE` Task: Add slash-mode suggestion list UI (non-blocking) with keyboard selection (`TAB`, `Shift+TAB`, arrow keys, `Enter`) and explicit no-auto-execute behavior.
- [x] `QLT-054` Owner: `FE` Task: Define and implement block-delimiter edge-case behavior for `/custom` multiline definitions when payload contains standalone `---` lines (deterministic escape or explicit validation error with guidance).
- [x] `QLT-055` Owner: `QA` Task: Add regression tests for custom-command normalization/sort order, suggestion-list keyboard behavior, and multiline delimiter edge-case handling.
- [x] `QLT-056` Owner: `FE` Task: Render custom-command preview as strict text-only output (escaped/no HTML interpretation) with deterministic truncation rules for very large payloads.
- [x] `QLT-057` Owner: `QA` Task: Add regression tests that autocomplete/suggestion logic remains disabled for non-slash input and for multiline input where `/` is not first character of line 1.
- [x] `QLT-058` Owner: `FE` Task: Add per-terminal settings entry via dedicated settings icon on each terminal card (gear icon) opening a per-session settings panel.
- [x] `QLT-059` Owner: `FE` Task: Move terminal-card `Rename` and `Delete` actions into per-session settings panel and remove direct toolbar buttons.
- [x] `QLT-060` Owner: `BE` Task: Extend OpenAPI/runtime session model and REST payloads for per-session startup config (`startCwd`, `startCommand`, `env`) with persistence and validation guardrails.
- [x] `QLT-061` Owner: `BE` Task: Apply persisted per-session startup config deterministically on session (re)spawn (`startCwd` as initial working directory, `startCommand` execution after PTY ready, `env` injection).
- [x] `QLT-062` Owner: `FE` Task: Implement per-session settings form for startup config fields (`Working Directory`, `Start Command Line`, `Environment Variables`) with stable client-side validation and explicit save feedback.
- [x] `QLT-063` Owner: `FE` Task: Implement per-session terminal color-set selection and editing (custom palette fields applied to xterm theme) with deterministic persistence in frontend settings storage.
- [x] `QLT-064` Owner: `QA` Task: Add integration/regression tests for per-session settings lifecycle (icon/panel access, rename/delete relocation, startup config persistence/apply behavior, env validation, color-set apply persistence).
- [x] `QLT-065` Owner: `FE` Task: Replace inline session settings panel with a proper per-terminal settings dialog (modal semantics, focus trap, Escape close, explicit save/cancel) opened via the terminal settings icon.
- [x] `QLT-066` Owner: `BE` Task: Extend per-session settings contract/persistence for full terminal theme profiles (background, foreground, cursor, and ANSI 16-color palette) with validation and deterministic storage shape.
- [x] `QLT-067` Owner: `FE` Task: Implement advanced per-terminal theme editor with full palette fields, deterministic preset selection beyond the current minimal set, and per-session apply/preview behavior.
- [x] `QLT-068` Owner: `QA` Task: Add integration/regression coverage for settings-dialog UX and full-palette theme lifecycle (open/close semantics, validation, persistence, reload consistency, and rendering apply behavior).
- [x] `QLT-069` Owner: `FE` Task: Rework command submit terminator handling so regular input and multiline custom-command payloads execute deterministically across shell and TUI apps (including Codex-like prompts) without requiring an extra manual Enter.
- [x] `QLT-070` Owner: `QA` Task: Add regression coverage for command submit semantics (`LF`/`CR`/`CRLF` modes, multiline payloads, routed targets) to ensure exactly one final submit signal is emitted and no duplicate/omitted execution occurs.
- [x] `QLT-071` Owner: `FE` Task: Move command submit terminator configuration from global sidebar settings into per-terminal session settings so each terminal can use its own deterministic submit mode (`auto`/`CRLF`/`LF`/`CR`), including target-resolved routing behavior.
- [x] `QLT-072` Owner: `BE` Task: Extend session contract/persistence with per-session `tags` (`string[]`) including validation/normalization and OpenAPI/runtime support in create/patch/list/get flows.
- [x] `QLT-073` Owner: `FE` Task: Add terminal-tag management in per-session settings dialog (add/remove/list tags) with explicit save feedback and deterministic rendering on terminal cards.
- [x] `QLT-074` Owner: `FE` Task: Extend target resolution for multi-session control actions to include tags and multi-target selectors (IDs, quick IDs, names, tags simultaneously), executing each matched session at most once (dedupe by session ID) even when selectors overlap.
- [x] `QLT-075` Owner: `QA` Task: Add regression/integration coverage for tag-based targeting semantics including overlap dedupe (`tag` and `id` both matching same session), no tag-vs-ID conflict rejection, and deterministic multi-target execution results.
- [x] `QLT-076` Owner: `FE` Task: Add slash-command settings parity so every per-terminal setting available in the settings dialog can be managed via slash commands as well (startup fields, environment variables, tags, theme profile, submit mode).
- [x] `QLT-077` Owner: `QA` Task: Add parity regression coverage proving dialog settings and slash-command settings stay functionally equivalent (same validation, persistence, and rendered/runtime effects).
- [x] `QLT-078` Owner: `FE` Task: Extend slash rename parity to support explicit target selector syntax (`/rename <selector> <name>`) while preserving active-session shorthand (`/rename <name>`).
- [x] `QLT-079` Owner: `QA` Task: Add regression coverage for rename selector behavior (active shorthand, selector-based rename, help text/autocomplete compatibility, and deterministic feedback).
- [x] `QLT-080` Owner: `BE` Task: Expose deterministic session `state` metadata (`active` or `unrestored`) in REST session responses and keep OpenAPI/runtime schemas aligned.
- [x] `QLT-081` Owner: `FE` Task: Render unrestored sessions with explicit UI state and recovery guidance while blocking invalid interactive actions against unrestored sessions.
- [x] `QLT-082` Owner: `QA` Task: Add regression coverage for unrestored-session durability and REST visibility across repeated restart cycles.
- [x] `QLT-083` Owner: `CODY` Task: Record the deck domain contract as the authoritative planning baseline for isolation rules, active-deck semantics, and conflict handling.
- [x] `QLT-084` Owner: `BE` Task: Extend persistence/runtime model with deck entities and per-session `deckId`, including deterministic legacy migration to the default deck.
- [x] `QLT-085` Owner: `BE` Task: Implement backend deck lifecycle and move APIs (`GET/POST/PATCH/DELETE /decks`, `POST /decks/{deckId}/sessions/{sessionId}:move`) with deterministic validation and error semantics.
- [x] `QLT-086` Owner: `BE` Task: Make session APIs deck-aware by exposing `deckId` in `Session` payloads and supporting optional deck-scoped session listing.
- [x] `QLT-087` Owner: `BE` Task: Harden deck conflict behavior so non-empty deck deletion requires explicit force semantics and same-source moves are idempotent no-ops.
- [x] `QLT-088` Owner: `FE` Task: Implement frontend deck create/rename/switch/delete flows with persisted active-deck selection and deck-scoped session creation behavior.
- [x] `QLT-089` Owner: `FE` Task: Scope terminal-grid rendering strictly to the active deck while keeping background-deck sessions running and active-session fallback deterministic.
- [x] `QLT-090` Owner: `FE` Task: Add deck control-plane slash commands (`/deck ...`) and explicit session move command (`/move <sessionSelector> <deckSelector>`) with deterministic feedback and autocomplete support.
- [x] `QLT-091` Owner: `FE` Task: Enforce deck-aware selector isolation for `/switch`, `/next`, `/prev`, `/filter`, and `@target`, with explicit cross-deck addressing syntax when needed.
- [x] `QLT-092` Owner: `FE` Task: Extend selector resolution with deck selectors and wildcard support while guaranteeing overlap dedupe by session ID.
- [x] `QLT-093` Owner: `QA` Task: Add frontend regression matrix for deck migration, conflict handling, deck-scoped rendering, selector isolation, and overlap-dedupe behavior.
- [x] `QLT-094` Owner: `QA` Task: Stabilize restore-fallback integration coverage with deterministic PTY/runtime injection so restart-durability tests are environment-independent.
- [x] `QLT-095` Owner: `FE` Task: Handle backend `session.exit` events in frontend runtime/store with explicit exited-session state, visible UI state, and deterministic post-exit interaction guardrails.
- [x] `QLT-096` Owner: `QA` Task: Add regression coverage for exited-session lifecycle behavior (`session.exit`, reconnect visibility, restart/delete semantics, and blocked invalid interactions).
- [x] `QLT-097` Owner: `FE` Task: Make frontend custom-command state WebSocket-first by treating snapshot + `custom-command.*` events as authoritative state and removing steady-state REST refresh loops.
- [x] `QLT-098` Owner: `QA` Task: Add regression coverage for WebSocket-first custom-command synchronization across reconnect, multi-client mutation, and command-management flows.
- [x] `QLT-099` Owner: `FE` Task: Isolate xterm private/internal rendering and geometry access behind a dedicated compatibility adapter instead of using internals directly throughout `app.js`.
- [x] `QLT-100` Owner: `FE` Task: Decompose `frontend/src/public/app.js` into layered modules (`terminal-stream`, `session-view-model`, `command-engine`, `ui/components`) without behavior regressions.
- [x] `QLT-101` Owner: `FE` Task: Add `>selector` quick-switch commands to the composer so `>4`, `>A`, `>name`, or other existing single-session selectors activate that session directly and switch decks automatically when the target lives outside the active deck.
- [x] `QLT-102` Owner: `FE` Task: Add per-deck terminal buttons beneath the deck controls in the sidebar, with slight visual indentation and visible quick IDs next to terminal names so users can click to focus and see the matching `>...` shortcut at a glance.
- [x] `QLT-103` Owner: `QA` Task: Add regression coverage for quick-switch and sidebar-terminal navigation behavior, including deck auto-switch, quick-ID rendering, active-terminal highlighting, and selector parity between `>...` commands and sidebar buttons.
- [x] `QLT-104` Owner: `FE` Task: Extend `>...` quick-switching so deck selectors are supported as direct targets as well, including autocomplete for deck names/IDs and deterministic deck activation when the `>` target resolves to a deck instead of a terminal.
- [x] `QLT-105` Owner: `FE` Task: Broaden autocomplete coverage across both `/...` and `>...` input flows so terminal selectors, deck selectors, and related navigation targets are suggested consistently wherever deterministic completion is possible.
- [x] `QLT-106` Owner: `FE` Task: Make `>...` quick-switching reuse the same selector grammar as `/switch`, including explicit `deckSelector::sessionSelector` cross-deck targeting, deterministic single-target ambiguity handling, and consistent resolution across ID, quick ID, name, and unique ID-prefix selectors.
- [x] `QLT-107` Owner: `FE` Task: Add inline `>...` target preview and pre-submit resolution feedback so quick-switch input shows the resolved deck/session target, clear ambiguity or no-match states, and deterministic no-op behavior when the requested target is already active.
- [x] `QLT-108` Owner: `FE` Task: Fix hidden-session scroll recovery so terminals that receive new output while invisible rebuild a correct scrollable viewport when shown again, including access to newly appended bottom content.
- [x] `QLT-109` Owner: `QA` Task: Add regression coverage for hidden-session output growth while invisible, verifying post-show scroll range, bottom-content reachability, and no stale viewport clipping.
- [x] `QLT-110` Owner: `FE` Task: Add in-terminal output search/find UX with deterministic match navigation (`next`/`previous`), visible no-match feedback, and active-terminal focus semantics that survive deck/session switching.
- [x] `QLT-111` Owner: `QA` Task: Add regression coverage for terminal search/find behavior (match navigation, no-match state, buffer growth, and deck/session visibility transitions).
- [ ] `QLT-112` Owner: `FE` Task: Introduce a declarative completion-spec model for the ptydeck command plane (`/`, `>`, and settings-related arguments) so command names, argument definitions, descriptions, and insertion behavior are data-driven instead of hardcoded across the frontend runtime.
- [ ] `QLT-113` Owner: `FE` Task: Add generator-backed contextual suggestion providers for command arguments (for example decks, sessions, tags, custom commands, paths, env keys, and themes) with deterministic caching, bounded latency, and explicit no-side-effect guarantees while typing.
- [ ] `QLT-114` Owner: `FE` Task: Add richer autocomplete presentation metadata (descriptions, examples, completion kinds, and insert previews) while preserving the existing inline composer UX, deterministic keyboard-first behavior, and fallback order.
- [ ] `QLT-115` Owner: `QA` Task: Add regression coverage for declarative and generator-backed autocomplete behavior, including deterministic ranking, timeout/fallback behavior, generator error isolation, and no unintended side effects during suggestion resolution.

## Enterprise Readiness Backlog (v0.3.0 continuation)

- [x] `ENT-001` Owner: `BE` Task: Implement authentication and authorization middleware baseline for REST and WebSocket (JWT dev-mode token validation, route scope checks, `401`/`403` responses).
- [x] `ENT-004` Owner: `PLAT` Task: Add production logging standards (JSON logs, correlation IDs, PII redaction rules, log retention policy) and document in `DEPLOYMENT.md`.
- [x] `ENT-005` Owner: `PLAT` Task: Integrate secrets management strategy (no plaintext secrets in repo, runtime secret injection pattern, secret rotation procedure).
- [x] `ENT-006` Owner: `BE` Task: Add configurable rate limiting and abuse controls for REST and WebSocket connection creation.
- [x] `ENT-007` Owner: `PLAT` Task: Add dependency and image security scanning in CI (SCA + vulnerability gate) and generate SBOM artifact per release.
- [x] `ENT-008` Owner: `PLAT` Task: Define SLOs/SLIs and alerting baseline for API availability, WS disconnect rate, and error-rate thresholds.
- [x] `ENT-009` Owner: `PLAT` Task: Add backup/restore automation for persistence data and include periodic restore verification procedure.
- [x] `ENT-011` Owner: `PLAT` Task: Enforce TLS-only ingress in production (HTTPS/WSS), document certificate lifecycle, and add automated expiry checks.
- [x] `ENT-012` Owner: `BE` Task: Add encryption-at-rest option for persistence data (key-provider abstraction + key rotation support) and tests for decrypt/rotate paths.
- [x] `ENT-013` Owner: `PLAT` Task: Define and implement least-privilege runtime profile (container/user permissions, filesystem write scope, network egress policy).
- [x] `ENT-014` Owner: `PLAT` Task: Add disaster-recovery runbook with RTO/RPO targets and automate periodic restore drill verification in CI/non-prod.
- [x] `ENT-015` Owner: `PLAT` Task: Add release evidence bundle generation (test results, SBOM, vulnerability scan output, commit provenance) for audit/compliance.
- [x] `ENT-016` Owner: `BE` Task: Add security response headers and origin policy hardening for HTTP responses (CSP, X-Content-Type-Options, Referrer-Policy, HSTS via proxy docs).
- [x] `ENT-018` Owner: `PLAT` Task: Add reverse-proxy reference setup for local HTTPS/WSS host routing (provider-agnostic) in `DEPLOYMENT.md`.
- [x] `ENT-019` Owner: `BE` Task: Add trusted-proxy configuration and safe `X-Forwarded-*` handling to avoid spoofed client/protocol metadata behind ingress.
- [x] `ENT-020` Owner: `BE` Task: Add session lifecycle guardrails (max concurrent sessions, idle timeout, max session lifetime) with configurable limits and explicit API errors.
- [x] `ENT-021` Owner: `PLAT` Task: Add metrics baseline (request latency/error counters, active session gauge, WS connection gauge) and expose scrape endpoint for monitoring.
- [x] `ENT-022` Owner: `QA` Task: Add non-functional load tests for concurrent session create/input/close and WS fanout stability with documented pass/fail thresholds.
- [x] `ENT-023` Owner: `PLAT` Task: Add configuration schema validation on startup (fail-fast on invalid/missing critical env values) for backend and frontend runtime configs.
- [x] `ENT-024` Owner: `PLAT` Task: Define and document data retention/purge policy for persisted session metadata and audit/security logs, including automated cleanup cadence.
