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
- Backend WebSocket sync now includes custom-command lifecycle events and snapshot payload synchronization (`custom-command.created`, `custom-command.updated`, `custom-command.deleted`, and `snapshot.customCommands`)
- Frontend supports `/custom` definition command in inline, multiline block, and explicit `template` modes with deterministic malformed-block and placeholder-validation feedback
- Frontend supports non-blocking preview for both `/<customName>` execution and `/custom preview <name> ...`, including template substitution against explicit `key=value` parameters plus allowlisted built-in session/deck variables, with deterministic truncation for large payloads
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
- `/swap <selectorA> <selectorB>` swaps frontend-local quick IDs, immediately reorders session surfaces by quick-ID order, and survives browser reloads in the same browser storage context without becoming a backend-persisted setting
- Per-terminal settings entry on each terminal card (gear icon) with session-scoped settings dialog
- Terminal `Rename` and `Delete` actions are available inside each session settings dialog (removed from direct toolbar); delete requires explicit user confirmation
- Per-session startup settings form in terminal settings (`Working Directory`, `Start Command Line`, `Environment Variables`) with unified dialog-level `Apply Changes`/`Cancel`, dirty-state indicator, and explicit save feedback
- Per-session terminal theme editor in session settings with complete iTerm2 dark/light theme catalog integration (from `mbadolato/iTerm2-Color-Schemes`), category/search filtering, and full custom palette editing (`background`, `foreground`, `cursor`, ANSI 16 colors) persisted through two independently selectable backend theme slots: `activeThemeProfile` and `inactiveThemeProfile`
- Backend session startup settings via REST (`startCwd`, `startCommand`, `env`) with deterministic apply on create/restart
- Backend per-session dual-theme contract via REST (`activeThemeProfile`, `inactiveThemeProfile`, plus legacy `themeProfile` compatibility) with full palette fields (`background`, `foreground`, `cursor`, ANSI 16 colors) and deterministic normalization/defaulting
- Central command input targeting the active session
- Global command palette via `Ctrl/Cmd+K`, with deterministic search across slash commands, saved custom commands, sessions, and decks plus keyboard-only selection (`ArrowUp`, `ArrowDown`, `Enter`, `Esc`)
- Command-plane controls via slash commands: `/new [shell]`, `/size <cols> <rows>` or `/size c<cols>` or `/size r<rows>`, `/filter [id/tag[,id/tag...]]`, `/close [selector[,selector...]]`, `/switch <id>`, `/swap <selectorA> <selectorB>`, `/next`, `/prev`, `/list`, `/rename <name>` (active) or `/rename <selector> <name>`, `/restart [selector[,selector...]]`, `/note <selector|active> [text...]`, `/layout list`, `/layout save <name>`, `/layout apply <profile>`, `/layout rename <profile> <name>`, `/layout delete <profile>`, `/workspace list`, `/workspace save <name>`, `/workspace apply <preset>`, `/workspace rename <preset> <name>`, `/workspace delete <preset>`, `/broadcast status`, `/broadcast off`, `/broadcast group [group]`, `/replay view [selector|active]`, `/replay export [selector|active]`, `/replay copy [selector|active]`, `/settings show [selector]`, `/settings apply <selector|active> <json>`, `/custom <name> <text>`, `/custom template <name> <text>`, `/custom <name>` block mode, `/custom template <name>` block mode, `/custom list`, `/custom show <name>`, `/custom preview <name> [key=value ...] [-- <targetSelector>]`, `/custom remove <name>`, `/help`, `/help <topic>`, `/help <topic> <subcommand>`, and custom execution via `/<customName> [target]` for plain commands or `/<customName> [key=value ...] [-- <targetSelector>]` for template commands
- Sessions support one optional persisted note; `/note <selector|active>` clears the note, and a non-empty note is rendered in compact form inside the session header
- Sessions also support one persisted per-terminal input-safety preset/profile; shell-oriented sessions can opt into syntax-gated or stricter guarded-send behavior with inline confirmation before risky sends and risky paste-triggered terminal input
- `/custom` block mode supports escaped delimiter payload lines (`\---`) for literal `---` content and returns explicit guidance for unescaped delimiter edge cases
- Template custom commands support deterministic placeholder expansion using explicit `{{param:name}}` parameters plus allowlisted built-in `{{var:session.*}}` / `{{var:deck.*}}` variables, while missing or unknown template inputs fail loudly instead of sending unresolved placeholders
- Non-blocking custom-command inline preview before execution (`/<customName>`) and explicit `/custom preview` inspection: exact rendered payload text only, semi-transparent helper rendering, and deterministic truncation feedback for very large payloads
- Slash-command name autocomplete via `Tab`/`Shift+Tab` with deterministic cycling and system-command precedence
- Context-sensitive slash-argument autocomplete via `Tab`/`Shift+Tab` for `/switch`, `/close`, `/custom show`, `/custom preview`, `/custom remove`, and `/<customName> <target>`
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
  "cwd": "/home/user/project",
  "shell": "bash",
  "createdAt": 1710000000000,
  "updatedAt": 1710000100000
}
```

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
  - `/replay view [selector|active]`
  - `/replay export [selector|active]`
  - `/replay copy [selector|active]`
- Frontend feedback surfaces retained-size and truncation state explicitly, for example `18/32 chars retained, truncated`.

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
