# ptydeck

`ptydeck` is a web-based multi-terminal workspace for running, organizing, and controlling multiple PTY-backed sessions from the browser.

It combines a PTY/runtime backend with a browser frontend built around `xterm.js`, persistent session metadata, deck/workspace organization, and an explicit command plane for terminal operations.

## Highlights

- Multiple PTY-backed terminal sessions in one browser workspace
- Browser UI with `xterm.js`, session cards, deck switching, and split layouts
- Persistent session metadata, notes, layout profiles, and workspace presets
- Local and SSH-backed sessions through one shared session model
- Slash-command control plane with direct session routing via `@<sessionSelector> /...`
- Quick switching via `>` and backend-persisted quick-ID ordering via `/swap`
- Session replay/export, file transfer, read-only sharing, and saved connection profiles
- Per-session safety controls, dual theme slots, multiline notes, and controlled mouse forwarding
- REST + WebSocket backend with restart-safe persistence and deterministic contracts

## Architecture

### Backend

- Node.js runtime
- PTY lifecycle and session management via `node-pty`
- REST API and WebSocket event stream
- JSON-backed persistence for restart-safe workspace/session state
- Shared session contract for local and SSH sessions

### Frontend

- Browser UI with `xterm.js`
- Multi-session workspace rendering
- Central command/composer flow plus slash-command plane
- Decks, workspace presets, layout profiles, and split-layout support
- Runtime/debug helpers for traceability and troubleshooting

## Quick Start

Prerequisites:

- Node.js `18` or newer (see [.nvmrc](./.nvmrc))
- `npm`
- Linux/WSL environment with PTY support for the backend

Install dependencies:

```bash
npm install
```

Start backend and frontend together:

```bash
npm run dev
```

Useful validation commands:

```bash
npm run lint
npm run test
npm run test:coverage:check
```

## Common Commands

Root workspace:

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:coverage
npm run test:coverage:check
```

Backend only:

```bash
npm --prefix backend run dev
npm --prefix backend run test
```

Frontend only:

```bash
npm --prefix frontend run dev
npm --prefix frontend run test
```

## Command Surface Examples

Quick switch the active session:

```text
> 4
```

Route a slash command to another session without changing the active one:

```text
@4 /note rollout host checks
```

Save or apply workspace state:

```text
/workspace save dev
/workspace apply dev
```

Transfer a file from a session:

```text
/transfer download /tmp/app.log
```

## Repository Layout

```text
backend/   PTY runtime, REST API, WebSocket, persistence, tests
frontend/  Browser UI, xterm integration, runtime controllers, tests
docs/      ADRs and imported review/reference material
scripts/   Validation, backup, release, and utility scripts
templates/ Repository templates and scaffolds
test/      Root-level repository tests
```

## Key Project Documents

- [DEPLOYMENT.md](./DEPLOYMENT.md): deployment and production runbook
- [LOCAL_QUALITY_GATE.md](./LOCAL_QUALITY_GATE.md): local validation baseline
- [CHANGELOG.md](./CHANGELOG.md): completed and validated release history
- [TODO.md](./TODO.md): current near-term tasks
- [ROADMAP.md](./ROADMAP.md): active and queued sequencing
- [TODO-OUTLOOK.md](./TODO-OUTLOOK.md): future epics and deferred backlog
- [CODEX_CONTEXT.md](./CODEX_CONTEXT.md): persistent architecture and governance context
- [docs/adr/README.md](./docs/adr/README.md): ADR process and ADR inventory

## Development Helpers

Create a new ADR:

```bash
./scripts/new-adr.sh "Short decision title"
```

Check ADR structure:

```bash
./scripts/check-adr-process.sh
```

Scaffold a frontend UI controller/test pair:

```bash
node ./scripts/scaffold-ui-module.mjs example-widget-controller
```

## Debugging Notes

Enable backend debug logging:

```bash
BACKEND_DEBUG_LOGS=1 BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log npm run dev
```

Frontend/browser debug notes:

- add `?debug=1` to the app URL for browser-side debug logging
- set `FRONTEND_DEBUG_LOGS=1` for dev-server injected frontend debug logging
- use `window.__PTYDECK_TRACE_DEBUG__` in the browser for bounded REST/WS trace inspection

## WSL / Local Host Resolution

When the frontend runs in a Windows browser against services hosted in WSL, the frontend auto-derives backend REST and WebSocket URLs from the browser host.

For `ptydeck.*` hosts, the frontend resolves the API host as `api.<current-host>` automatically.
Explicit `API_BASE_URL` and `WS_URL` overrides remain available when needed.

## Status

Near-term implementation status is intentionally tracked in the repository planning documents instead of being duplicated here:

- current open work: [TODO.md](./TODO.md)
- sequencing and active waves: [ROADMAP.md](./ROADMAP.md)
- completed history: [CHANGELOG.md](./CHANGELOG.md)

## License

See [LICENSE](./LICENSE).
