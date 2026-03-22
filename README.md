# ptydeck

A lightweight web-based multi-terminal system for managing and interacting with multiple PTY-backed sessions in parallel.

## Repository Status

Current state: compressed roadmap complete: `v0.1.0` to `v0.3.0`.

- Monorepo structure with `backend/` and `frontend/`
- OpenAPI contract scaffold in `backend/openapi/openapi.yaml`
- Backend session lifecycle endpoints implemented (`GET/POST /api/v1/sessions`, `GET/DELETE /api/v1/sessions/{sessionId}`, `POST /input`, `POST /resize`)
- WebSocket endpoint `/ws` implemented with `session.created`, `session.data`, `session.exit`, and `session.closed` events
- Session metadata persistence and startup restore implemented (JSON adapter)
- Frontend runtime UI implemented with `xterm.js`, multi-session cards, command input, and WS reconnect
- Root scripts for local dev, lint, test, and coverage
- CI workflow for backend/frontend lint, test, and build
- Environment templates for backend and frontend

## Quick Start

Prerequisite: Node.js `18` (see `.nvmrc`).

```bash
npm run lint
npm run test
npm run test:coverage
```

## Deployment

See `DEPLOYMENT.md` for production build, runtime configuration, smoke checks, and rollback steps.

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
- Quick-ID labels per terminal (`1..9`, `A..Z`) shown next to session names
- Central command input targeting the active session
- Command-plane controls via slash commands: `/new [shell]`, `/close [id]`, `/switch <id>`, `/next`, `/prev`, `/list`, `/rename <name>`, `/restart [id]`, `/help`
- Dedicated command feedback area for command-plane output (success/help/errors), separated from terminal PTY streams
- Startup performance guardrails: deduplicated bootstrap request path plus startup latency telemetry available through `window.__PTYDECK_PERF__` and debug logs
- Fail-fast startup config validation for critical env fields (port bounds, URL protocol checks, production CORS requirement)
- Optional local auth baseline via `AUTH_DEV_MODE=1` with automatic frontend dev-token acquisition (`/api/v1/auth/dev-token`)
- Production logging standard documented in `DEPLOYMENT.md` (JSON format, correlation IDs, redaction, retention baseline)
- Monitoring baseline via `GET /metrics` (Prometheus-style counters/gauges for requests, sessions, and WebSocket connections)
- Secrets-management strategy baseline documented in `DEPLOYMENT.md` (runtime injection and rotation guidance)
- Full PTY support (interactive applications like `vim`, `nano`, `top`)
- Session persistence (restores working directory after restart)
- Clean multiplexing over a single WebSocket connection
- Minimal and predictable architecture

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

## Working Directory Tracking

PTY does not expose the current working directory directly.

Recommended approach:

```bash
PROMPT_COMMAND='echo "__CWD__$(pwd)__"'
```

Backend extracts:

```text
__CWD__/home/user/project__
```

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
