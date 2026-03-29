# ptydeck

A lightweight web-based multi-terminal system for managing and interacting with multiple PTY-backed sessions in parallel.

## Repository Status

Current state: compressed roadmap complete: `v0.1.0` to `v0.3.0`.

- Monorepo structure with `backend/` and `frontend/`
- OpenAPI contract scaffold in `backend/openapi/openapi.yaml`
- Backend session lifecycle endpoints implemented (`GET/POST /api/v1/sessions`, `GET/DELETE /api/v1/sessions/{sessionId}`, `POST /input`, `POST /resize`)
- Backend custom-command REST endpoints implemented (`GET /api/v1/custom-commands`, `PUT/GET/DELETE /api/v1/custom-commands/{commandName}`)
- Backend custom-command guardrails implemented (reserved-name rejection, name/size limits, and explicit API errors)
- Backend custom-command naming policy is deterministic (`trim + lowercase` normalization, stable list ordering, and case-insensitive lookup semantics across REST paths)
- Backend custom-command scope contract is implemented (`global`, `project`, `session`) with deterministic precedence metadata, optional `sessionId` binding for session-scoped commands, and backward-compatible migration of legacy unscoped commands to `project`
- Backend WebSocket sync now includes custom-command lifecycle events and snapshot payload synchronization (`custom-command.created`, `custom-command.updated`, `custom-command.deleted`, and `snapshot.customCommands`)
- Frontend supports scoped `/custom` definition and management flows in inline, multiline block, and explicit `template` modes, including `scope:global`, `scope:project`, and `scope:session:<selector>` scope tokens plus deterministic malformed-block and placeholder-validation feedback
- Frontend supports non-blocking preview for both `/<customName>` execution and `/custom preview [@scope] <name> ...`, including template substitution against explicit `key=value` parameters plus allowlisted built-in session/deck variables, deterministic precedence resolution, and deterministic truncation for large payloads
- WebSocket endpoint `/ws` implemented with `session.created`, `session.data`, `session.exit`, and `session.closed` events
- Session metadata persistence and startup restore implemented (JSON adapter)
- Frontend runtime UI implemented with `xterm.js`, multi-session cards, command input, and WS reconnect
- Root scripts for local dev, lint, test, and coverage
- Local-only quality gate (remote CI runner execution is disabled)
- Environment templates for backend and frontend

## Quick Start

Prerequisite: Node.js `18` (see `.nvmrc`).

```bash
npm run lint
npm run test
npm run test:coverage
```

## Delivery Helpers

- Create the next ADR from the repository template:
  - `./scripts/new-adr.sh "Short decision title"`
- Validate ADR structure locally:
  - `./scripts/check-adr-process.sh`
- Scaffold a new frontend UI controller/test pair:
  - `node ./scripts/scaffold-ui-module.mjs example-widget-controller`
- Reusable repository templates live in:
  - `docs/adr/`
  - `templates/`

## Deployment

See `DEPLOYMENT.md` for production build, runtime configuration, smoke checks, and rollback steps.
See `LOCAL_QUALITY_GATE.md` for the required local validation workflow.

## WSL Local Testing Note

When testing from a Windows browser against services running in WSL, frontend runtime auto-derives backend REST and WebSocket endpoints from the browser host.
For `ptydeck.*` hosts, frontend uses `api.<current-host>` automatically.
`API_BASE_URL` and `WS_URL` remain optional explicit overrides.

## Debug Logging (Troubleshooting)

To trace session-loading problems end to end:

1. Start backend with logs enabled:

```bash
BACKEND_DEBUG_LOGS=1 BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log npm run dev
```

2. Open frontend with debug query parameter:

```text
http://127.0.0.1:18081/?debug=1
```

Browser console will print `ptydeck` events for REST calls, WebSocket state/messages, render cycles, and terminal resize actions.
Backend lifecycle/request logs are also written to `/tmp/ptydeck-backend-debug.log`.
For dev-server injected runtime config, you can also set `FRONTEND_DEBUG_LOGS=1` before `npm run dev`.
In debug mode, the browser also exposes `window.__PTYDECK_TRACE_DEBUG__` with bounded persisted REST/WS trace records, including `listEntries()`, `findByCorrelationId(correlationId)`, and `clear()` for end-to-end correlation checks.

## Overview

`ptydeck` provides a browser UI for running and controlling multiple terminal sessions side by side.
It is designed for deterministic, controlled interaction with shell processes, with a clear separation between execution (backend) and rendering (frontend).

## Features

- Multiple terminal sessions displayed side by side
- Sidebar settings for fixed terminal geometry (`cols`/`rows`, e.g. `80x20`) with persisted browser preferences
- Persisted named layout profiles for active deck, sidebar visibility, session filter text, and per-deck terminal geometry, available through the sidebar controls and backend-backed restart-safe storage
- Persisted workspace presets with backend-backed active-deck, linked-layout, and per-deck session-group state, available through sidebar controls and `/workspace ...` commands
- Split-based execution layouts per deck, with persisted `row` / `column` pane trees, drag-resize handles, session-to-pane assignment, and restart-safe apply/save behavior through layout profiles and workspace presets
- Explicit control-plane and execution-plane separation, with a dedicated operator pane for composer/search/workspace controls, persisted pane visibility/position/size, responsive position fallback, and drag-resize behavior restored through layout profiles and workspace presets
- Workspace-group broadcast mode for ordinary composer sends, controlled through `/broadcast status`, `/broadcast off`, and `/broadcast group [group]`, while explicit `@target ...` direct routing still bypasses broadcast mode
- Per-session settings include configurable command submit terminator with deterministic modes: `auto` (default, `CR`), `crlf`, `lf`, `cr`
- Quick-ID labels per terminal (`1..9`, `A..Z`) shown next to session names
- `/swap <selectorA> <selectorB>` swaps backend-persisted quick IDs, immediately reorders session surfaces by quick-ID order, and survives reloads, reconnects, backend restart/restore, and cross-browser/operator views through the shared backend session contract
- The sidebar now places `New Deck` and `New Session` side by side at the top instead of splitting deck creation into a separate lower button stack
- The active deck now exposes deck-local settings through a gear icon inside the selected deck tab, with rename/delete actions and a visible deck-local session-order list that can swap adjacent persisted quick-ID positions without relying only on `/swap`
- Per-terminal settings entry on each terminal card (gear icon) with a tabbed session-scoped settings dialog (`Startup`, `Note`, `Theme`)
- Terminal `Rename` and `Delete` actions are available inside each session settings dialog (removed from direct toolbar); delete requires explicit user confirmation
- Per-session startup settings form in terminal settings (`Working Directory`, `Start Command Line`, `Environment Variables`) with unified dialog-level `Apply Changes`/`Cancel`, dirty-state indicator, and explicit save feedback
- Backend session contract now supports both `local` and `ssh` session kinds through one persisted model, with normalized non-secret `remoteConnection` metadata (`host`, `port`, optional `username`), normalized non-secret `remoteAuth` metadata (`password`, `privateKey`, `keyboardInteractive`, plus optional `privateKeyPath`), restart-safe restore semantics, and write-only `remoteSecret` handling that never persists in session storage/API responses
- Saved connection profiles and reusable launch presets are now backend-backed for both local and SSH sessions, available through the sidebar and `/connection list|save|show|apply|rename|delete`, with password and keyboard-interactive SSH profiles prompting for a runtime-only secret instead of persisting it
- Backend now manages SSH host-key trust through persisted trust entries and a generated `ssh_known_hosts` file beside the runtime data path; SSH launches enforce `StrictHostKeyChecking=yes`, use only that managed trust store, and reject conflicting replacement host keys until the existing trust entry is deleted explicitly
- Per-session terminal theme editor in session settings with complete iTerm2 dark/light theme catalog integration (from `mbadolato/iTerm2-Color-Schemes`), category/search filtering, and full custom palette editing (`background`, `foreground`, `cursor`, ANSI 16 colors) persisted through two independently selectable backend theme slots: `activeThemeProfile` and `inactiveThemeProfile`
- Backend session startup settings via REST (`startCwd`, `startCommand`, `env`) with deterministic apply on create/restart
- Backend per-session dual-theme contract via REST (`activeThemeProfile`, `inactiveThemeProfile`, plus legacy `themeProfile` compatibility) with full palette fields (`background`, `foreground`, `cursor`, ANSI 16 colors) and deterministic normalization/defaulting
- Central command input targeting the active session
- Global command palette via `Ctrl/Cmd+K`, with deterministic fuzzy search across slash commands, saved custom commands, sessions, and decks, exact-prefix priority, browser-local recency personalization for otherwise-comparable matches, and keyboard-only selection (`ArrowUp`, `ArrowDown`, `Enter`, `Esc`)
- Command-plane controls via slash commands: `/new [shell]`, `/size <cols> <rows>` or `/size c<cols>` or `/size r<rows>`, `/filter [id/tag[,id/tag...]]`, `/close [selector[,selector...]]`, `/switch <sessionSelector>`, `/swap <selectorA> <selectorB>`, `/next`, `/prev`, `/list`, `/rename <name>` (active session) or `@<sessionSelector> /rename <name>`, `/restart [selector[,selector...]]`, `/note [text...]` (active session) or `@<sessionSelector> /note [text...]`, `/connection list`, `/connection save <name>` (active session) or `@<sessionSelector> /connection save <name>`, `/connection show <profile>`, `/connection apply <profile>`, `/connection rename <profile> <name>`, `/connection delete <profile>`, `/layout list`, `/layout save <name>`, `/layout apply <profile>`, `/layout rename <profile> <name>`, `/layout delete <profile>`, `/workspace list`, `/workspace save <name>`, `/workspace apply <preset>`, `/workspace rename <preset> <name>`, `/workspace delete <preset>`, `/broadcast status`, `/broadcast off`, `/broadcast group [group]`, `/replay view`, `/replay export`, `/replay copy`, `/transfer upload [path]`, `/transfer download <path>`, `/share list`, `/share session`, `/share deck [deckSelector]`, `/share revoke <shareId>`, `/settings show`, `/settings apply <json>`, `/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name> <text>`, `/custom [plain|template] [scope:global|scope:project|scope:session:<selector>] <name>` block mode, `/custom list`, `/custom show [scope:global|scope:project|scope:session:<selector>] <name>`, `/custom preview [scope:global|scope:project|scope:session:<selector>] <name> [key=value ...] [-- <targetSelector>]`, `/custom remove [scope:global|scope:project|scope:session:<selector>] <name>`, `/run`, `/help`, `/help <topic>`, `/help <topic> <subcommand>`, equivalent namespaced aliases such as `/session.new`, `/deck.switch`, `/replay.export`, `/custom.show`, and `/connection.apply`, and custom execution via `/<customName> [target]` for plain commands or `/<customName> [key=value ...] [-- <targetSelector>]` for template commands, with target-session precedence `session > project > global`
- `@<sessionSelector> /<command> ...` is the canonical way to route a single-session slash command to a non-active session; `>` remains the quick-switch shortcut for changing the active session.
- Sessions support one optional persisted multiline note; `/note` clears the active-session note, `@<sessionSelector> /note` clears another session's note, the session settings dialog exposes a dedicated multiline note editor, and a non-empty note is rendered as a first-line compact preview inside the session header with a tooltip for the full note text
- Sessions now expose one explicit per-session `Mouse Forwarding` setting with deterministic modes `off` (default) and `application`; default-off strips terminal mouse-tracking enable/disable control sequences locally so selection, copy, and middle-click paste stay intact, while `application` disables local middle-click interception so mouse-aware terminal applications can receive their normal mouse input path
- Sessions also support one persisted per-terminal input-safety profile with explicit validation and confirmation options; shell-oriented sessions can opt into syntax gating, natural-language checks, dangerous-command confirmation, multiline paste confirmation, and recent-target-switch confirmation before risky sends or risky paste-triggered terminal input
- Operators can create bounded read-only spectator share links for the active session or active/selected deck via `/share session`, `/share deck [deckSelector]`, `/share list`, and `/share revoke <shareId>`; spectators bootstrap from `?share_token=...`, see only the shared target scope, and have write actions disabled throughout the UI instead of failing silently
- Terminal-surface `Ctrl-C` now prompts only in the ambiguous copy-versus-cancel case: when a live terminal selection exists and clipboard write is available, the UI asks `Copy` or `Cancel`; otherwise `Ctrl-C` stays on the normal terminal path
- `/custom` block mode supports escaped delimiter payload lines (`\---`) for literal `---` content and returns explicit guidance for unescaped delimiter edge cases
- Template custom commands support deterministic placeholder expansion using explicit `{{param:name}}` parameters plus allowlisted built-in `{{var:session.*}}` / `{{var:deck.*}}` variables, while missing or unknown template inputs fail loudly instead of sending unresolved placeholders
- Non-blocking custom-command inline preview before execution (`/<customName>`) and explicit `/custom preview` inspection: exact rendered payload text only, semi-transparent helper rendering, and deterministic truncation feedback for very large payloads
- Slash-command name autocomplete via `Tab`/`Shift+Tab` with deterministic fuzzy ranking, exact-prefix priority, browser-local recency personalization for otherwise-comparable matches, deterministic cycling, and system-command precedence
- Namespaced slash-command aliases now exist for the main command families, for example `/session.new`, `/deck.switch`, `/layout.apply`, `/workspace.apply`, `/replay.export`, and `/custom.show`, while the existing short command names remain canonical and fully backward-compatible
- One composer submission can now execute a deterministic sequential slash-command script through newline-separated slash lines or an explicit `/run` block, with concise aggregated feedback and stop-on-failure behavior that remains separate from PTY input semantics
- Context-sensitive slash-argument autocomplete via `Tab`/`Shift+Tab` with the same deterministic fuzzy/exact-prefix baseline for `/switch`, `/close`, `/custom show`, `/custom preview`, `/custom remove`, and `/<customName> <target>`
- Non-blocking slash suggestion list with keyboard selection (`Tab`, `Shift+Tab`, `ArrowUp`, `ArrowDown`, `Enter`) and no implicit command execution
- Slash-command history recall via `ArrowUp`/`ArrowDown` (slash mode only; non-slash multiline input remains unaffected)
- Re-run recalled slash command via `Ctrl/Cmd+Enter` with guardrail feedback when recalled content was modified
- Direct target routing for terminal-plane input via `@<target> <text>` without switching active session
- Dedicated command feedback area for command-plane output (success/help/errors), separated from terminal PTY streams
- Composer target summary and guarded-send banner keep the active target visible and explain why a send needs confirmation (`invalid/incomplete shell syntax`, `likely natural-language shell input`, `dangerous shell command`, `multiline or oversized input`, `recent target switch`)
- Startup performance guardrails: deduplicated bootstrap request path plus startup latency telemetry available through `window.__PTYDECK_PERF__` and debug logs
- Fail-fast startup config validation for critical env fields (port bounds, URL protocol checks, production CORS requirement)
- Optional local auth baseline via `AUTH_MODE=dev` with automatic frontend dev-token acquisition (`/api/v1/auth/dev-token`)
- Production logging standard documented in `DEPLOYMENT.md` (JSON format, correlation IDs, redaction, retention baseline)
- Monitoring baseline via `GET /metrics` (Prometheus-style counters/gauges for requests, sessions, and WebSocket connections)
- Secrets-management strategy baseline documented in `DEPLOYMENT.md` (runtime injection and rotation guidance)
- Full PTY support (interactive applications like `vim`, `nano`, `top`)
- Session persistence (restores working directory after restart)
- Clean multiplexing over a single WebSocket connection
- Minimal and predictable architecture

## Planned Deck Model (H6 Contract)

The next architecture cycle introduces `Decks` as an isolation boundary above sessions:

- one active deck at a time (tab-based workspace switching),
- sessions are owned by exactly one deck,
- active operations default to active-deck scope,
- non-active-deck sessions remain running but hidden,
- deck settings are scoped per deck (initially terminal geometry).

Authoritative planning contract: `CODEX_CONTEXT.md` (Deck Domain Contract) + `ROADMAP.md` (`v0.3.0-H6`).

## Architecture

### Backend (Node.js)

- `node-pty`
  - Creates real terminal sessions (PTY)
- `WebSocket (ws)`
  - Transports input/output between frontend and backend
- `Session Manager`
  - Manages session lifecycle
  - Persists metadata (for example `cwd`)

### Frontend (Browser)

- `xterm.js`
  - Terminal rendering engine
- Multi-terminal layout
  - Sessions displayed in parallel (grid/flex)
- Central command input
  - Sends commands to the active session

## System Overview

```text
Browser (FE)
|
|-- Terminal 1 (xterm)
|-- Terminal 2 (xterm)
|-- Terminal N (xterm)
|
`-- Command Input (central)
    |
    v
WebSocket
    |
    v
Backend (Node.js)
|
|-- Session Manager (Map<sessionId, session>)
|-- PTY Layer (node-pty)
`-- Persistence (SQLite / JSON)
```

## Core Concepts

### Session

A session represents a PTY-backed process:

- Identified by `sessionId`
- Runs its own shell (for example `bash`)
- Maintains its own working directory (`cwd`)

Example persisted state:

```json
{
  "id": "uuid",
  "kind": "local",
  "cwd": "/home/user/project",
  "shell": "bash",
  "createdAt": 1710000000000,
  "updatedAt": 1710000100000
}
```

Remote-session example:

```json
{
  "id": "uuid",
  "kind": "ssh",
  "cwd": "~/workspace",
  "shell": "ssh",
  "remoteConnection": {
    "host": "example.internal",
    "port": 2222,
    "username": "ops"
  },
  "remoteAuth": {
    "method": "privateKey",
    "privateKeyPath": "/home/ops/.ssh/id_ed25519"
  }
}
```

Create/patch requests for password and keyboard-interactive SSH auth can include a write-only `remoteSecret` field.
That secret is injected into the live SSH launch path through `SSH_ASKPASS` wiring and is never returned by the API or persisted to disk.

SSH host keys are trusted explicitly through the backend trust-store API:

- `GET /api/v1/ssh-trust-entries`
- `POST /api/v1/ssh-trust-entries`
- `DELETE /api/v1/ssh-trust-entries/{entryId}`

Trusted entries persist normalized host, port, key type, public key, and SHA-256 fingerprint metadata.
The runtime renders those entries into one managed `ssh_known_hosts` file and forces SSH launches to use it with strict host-key checking, so first-connect trust and changed-host-key handling stay deterministic and backend-owned.

### Multiplexing

All sessions run concurrently over a single WebSocket connection.

Input:

```json
{
  "type": "input",
  "sessionId": "...",
  "data": "ls\n"
}
```

Output:

```json
{
  "type": "data",
  "sessionId": "...",
  "data": "output..."
}
```

### Active Session

- Exactly one session is active at a time
- Clicking a terminal sets `activeSessionId`
- The command input targets only the active session

## Interaction Model

### Input Modes

1. Central command input
   - Sends complete commands (`value + "\n"`)
2. Direct terminal input
   - Required for interactive applications
   - Key events forwarded directly to the PTY

### Output

- Each session streams output independently
- Frontend routes output based on `sessionId`

## Fullscreen Applications

Supported out of the box:

- `nano`
- `vim`
- `top`
- `less`

Requirements:

- Real PTY (`node-pty`)
- Correct forwarding of `stdin`, `stdout`, and terminal resize

## Resize Handling

Frontend must report terminal dimensions:

```json
{
  "type": "resize",
  "sessionId": "...",
  "cols": 120,
  "rows": 40
}
```

## Persistence

Goal after backend restart:

- Sessions are recreated
- Shells start in the last known working directory

Implementation:

```js
pty.spawn(shell, [], {
  cwd: persisted.cwd
});
```

### Replay and Scrollback Retention

Replay recovery is intentionally tail-based, not full-history.

- Live reconnect snapshots use an in-memory replay tail.
  - Config: `SESSION_REPLAY_MEMORY_MAX_CHARS`
  - Default: `16384`
  - `0` disables replay output in reconnect snapshots.
- Restart recovery can optionally persist a smaller replay tail to disk.
  - Config: `SESSION_REPLAY_PERSIST_MAX_CHARS`
  - Default: `0` (disabled)
  - When enabled, the persisted replay tail is restored into the session snapshot after backend restart.

Product constraint:

- Persisted replay depth must be less than or equal to the in-memory replay depth.
- Recovery remains partial by design; `ptydeck` does not attempt full shell history or TUI state reconstruction.

### Replay Export Contract

The backend now exposes a deterministic replay-export contract for the currently retained tail:

- Route: `GET /api/v1/sessions/{sessionId}/replay-export`
- Response format: JSON metadata plus text payload
- Export scope: `retained_replay_tail`
- Export format marker: `text`
- Content-type marker: `text/plain; charset=utf-8`

The payload includes:

- `data`: the currently retained replay tail
- `retainedChars`: current retained tail size
- `retentionLimitChars`: retention cap relevant to the exported tail
- `truncated`: whether older replay content has been dropped before export

This export does not imply full shell-state recovery. It is an explicit operator-facing view of the bounded replay tail only.

Frontend operator workflow:

- The replay viewer exposes `Refresh`, `Download`, and `Copy` actions without implying a second replay source beyond the retained-tail export contract.
- Slash commands now support view, download, and copy flows:
  - `/replay view`
  - `/replay export`
  - `/replay copy`
  - `@<sessionSelector> /replay view|export|copy`
- Frontend feedback surfaces retained-size and truncation state explicitly, for example `18/32 chars retained, truncated`.

### Session File Transfer Contract

The backend now exposes a bounded file-transfer baseline for session-scoped files:

- Routes:
  - `POST /api/v1/sessions/{sessionId}/file-transfer/upload`
  - `POST /api/v1/sessions/{sessionId}/file-transfer/download`
- Scope: normalized relative paths under the session root only
- Guardrails:
  - absolute paths are rejected
  - traversal attempts are rejected
  - directory-like targets are rejected
  - transfer size is bounded by `SESSION_FILE_TRANSFER_MAX_BYTES`
- Current baseline capability:
  - local sessions are supported
  - SSH sessions fail closed with an explicit unsupported-transfer error until a later remote-transfer slice lands

Upload request payload:

- `path`
- `contentBase64`

Download request payload:

- `path`

Frontend operator workflow:

- Slash commands now support:
  - `/transfer upload [path]`
  - `/transfer download <path>`
  - `@<sessionSelector> /transfer upload [path]`
  - `@<sessionSelector> /transfer download <path>`
- Upload opens the local file picker and sends one bounded base64 payload to the backend contract.
- Download writes a browser file download from the returned bounded payload.
- Feedback is explicit about target session, path, and transferred size.

### Read-Only Sharing

`ptydeck` can issue bounded spectator links for one session or one deck:

- `/share session`
- `/share deck [deckSelector]`
- `/share list`
- `/share revoke <shareId>`

Behavior:

- Share links are backend-persisted and survive restart/restore until revoked or expired.
- A share token only exposes the shared session or the shared deck plus its visible sessions.
- Spectators are explicitly read-only: direct terminal input, composer send/paste, create/delete/update actions, and share management are blocked in the UI and rejected by the backend.
- REST snapshots and WebSocket events are filtered to the shared scope only.

## Slash Workflows

- Multiline slash workflows entered through the central composer now run through the explicit frontend workflow runtime rather than falling back to ad hoc sequential command handling.
- The control pane shows the current workflow state, bound terminal target, step progress, detail, and final result while a workflow is running.
- Workflow control actions are explicit and separate:
  - `Stop Workflow`
  - `Interrupt`
  - `Kill Session`
- Live workflow waits remain intentionally constrained to deterministic runtime signals that do not reintroduce the removed stream-interpretation layer.
- Supported workflow wait sources now map to one explicit adapter layer:
  - `status`, `summary`, `exit-code`, and `session-state` read store-backed session state and artifacts.
  - `line` and `visible-line` read the mounted xterm buffer directly.
  - Terminal-backed sources fail explicitly when no mounted terminal buffer is available instead of falling back to heuristic stream scanning.
- The workflow runtime now enforces deterministic guardrails for workflow step count, maximum wait duration, and bounded captured source text instead of allowing unbounded waits or oversized observed values.

## Working Directory Tracking

PTY does not expose the current working directory directly.

Current capability matrix:

```bash
bash -> PROMPT_COMMAND marker injection
zsh  -> no live cwd tracking yet; retain last known cwd
fish -> no live cwd tracking yet; retain last known cwd
sh/dash/ash/busybox -> no live cwd tracking yet; retain last known cwd
```

Current bash marker implementation:

```bash
PROMPT_COMMAND='printf "__CWD__%s__\n" "$PWD"'
```

Backend extracts live cwd updates from bash marker output:

```text
__CWD__/home/user/project__
```

Deterministic fallback for unsupported shells:

- Session startup and restart still use the persisted or configured `cwd`.
- If the shell family does not support the current adapter hook, backend keeps that last known cwd unchanged until an explicit future shell adapter adds live tracking support.

## Mouse Behavior

- Mouse input is ignored
- No forwarding to PTY
- Simplifies implementation

Consequences:

- No mouse scrolling
- No clicking in interactive programs

## Copy and Paste

### Copy

Two approaches:

- Browser selection
  - Simple, DOM-based
  - Suitable for logs and basic output
- xterm selection
  - Terminal-buffer aware
  - Correct for wrapped lines and fullscreen apps

### Paste

- Handled via browser clipboard
- Injected as input into active session

```json
{
  "type": "input",
  "sessionId": "...",
  "data": "pasted text"
}
```

## Limitations

- No restoration of running processes
- No recovery of editor state (`vim`, `nano`) or shell job stacks
- Only working directory is restored

## Optional Extensions

- Multi-client attach
- Broadcast input to multiple sessions
- Session grouping
- Logging and replay
- Authentication and multi-tenant support

## Alternatives

- `tmux` integration
  - True session persistence
  - More complex integration
- Container per session
  - Strong isolation
  - Higher operational overhead

## Conclusion

`ptydeck` provides:

- Real PTY-based terminal sessions
- A browser-native multi-session UI
- Deterministic, minimal system design

It is well suited for orchestrated workflows, multi-session control, and controlled execution environments.
