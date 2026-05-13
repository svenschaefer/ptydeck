# ptydeck

`ptydeck` is a web-based multi-terminal workspace for running, organizing, and controlling multiple PTY-backed sessions from the browser.

It combines a PTY/runtime backend with a browser frontend built around `xterm.js`, persistent session metadata, deck/workspace organization, and an explicit command plane for terminal operations.

## Highlights

- Multiple PTY-backed terminal sessions in one browser workspace
- Browser UI with `xterm.js`, session cards, deck switching, and split layouts
- Persistent session metadata, notes, layout profiles, and workspace presets
- Local and SSH-backed sessions through one shared session model
- Slash-command control plane with direct session routing via `@<sessionSelector> /...`, plus one-shot SSH launches through `/ssh ...`
- Quick switching via `>` and backend-persisted quick-ID ordering via `/swap`
- Server-persisted operator-client composer placement modes with a shared footer, active-terminal overlay placement, and per-terminal pinned overlays
- Conservative composer `Normalize` actions for the shared footer and pinned overlays before `Send`
- Opt-in composer `Repair` previews with explicit apply/cancel flow, plus shipped shell-family and JSON repair candidates that fail closed when confidence or validation is insufficient
- Session-card hover quick actions with per-session top custom-command favorites plus direct `Clipboard` send
- Session replay/export, replay-excerpt clipboard relay via `/replay ...` and `/ccp`, file transfer, read-only sharing, and saved connection profiles
- Multi-device terminal-control foundation with visible control metadata, take/release/transfer control actions, trusted-local scope takeover (`all sessions`, `this deck`, `this session`), and automatic device-local layout recall on successful takeover
- Dedicated `Workspace Library` manager for guided local/SSH connection profiles, first-connect SSH trust verification, workspace presets, and deck-group management outside the sidebar
- Per-session safety controls, dual theme slots, multiline notes, and controlled mouse forwarding
- REST + WebSocket backend with restart-safe persistence and deterministic contracts

## Architecture

### Backend

- Node.js runtime
- PTY lifecycle and session management via `node-pty`
- REST API and WebSocket event stream
- JSON-backed persistence for restart-safe workspace/session state
- Shared session contract for local and SSH sessions
- Optional transport-only messaging runtime for adapter lifecycle, mapped Telegram inbound control/input handling, and explicit `MessageIntent` delivery only; automatic terminal-output mirroring is intentionally not part of the current product
- Multi-device control metadata, stable trusted-local client identity, and controller-only PTY write/resize arbitration in the mainline single-user runtime

### Frontend

- Browser UI with `xterm.js`
- Multi-session workspace rendering
- Central command/composer flow plus slash-command plane, including server-persisted shared-footer versus active-overlay placement and pinned per-session overlay composers
- Decks, layout profiles, split-layout support, and a dedicated `Workspace Library` surface for guided connection setup with `Advanced` disclosure, SSH trust verification, workspace presets, and deck-group management
- Session-level control badges/actions, trusted-local device identity/handoff states, subtle startup/anytime takeover prompts, blocked-write `Take Control and Retry` recovery, and browser-side write blocking for non-controller clients in the mainline single-user runtime
- Server-persisted per-session quick-send ranking for custom commands, including direct hover-triggered clipboard relay through the existing guarded paste path
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
npm run dev:env
```

`npm run dev` is now the normal lightweight local path. The gitignored local file `local-config/ptydeck/backend.env.local` is only loaded when you opt in through `npm run dev:env` or `PTYDECK_BACKEND_LOAD_LOCAL_ENV=1`. That file is the intended place for machine-specific local analysis and debug settings such as:

```env
BACKEND_DEBUG_LOGS=1
BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log
SESSION_STREAM_ANALYSIS_CAPTURE_FILE=/tmp/ptydeck-session-stream-analysis.jsonl
SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS=codex
SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES=33554432
```

Those settings are intentionally diagnostic, not part of the normal lightweight dev baseline. On busy multi-session runs they can add substantial backend write, capture, and messaging overhead. Use `npm run dev` for ordinary interactive work, and only use `npm run dev:env` when you intentionally want that backend-local diagnostic env file loaded.

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
npm run dev:light
npm run dev:env
npm run build
npm run lint
npm run test
npm run test:coverage
npm run test:coverage:check
```

`npm run test:coverage` and `npm run test:coverage:check` now include a dedicated root-tooling coverage lane for `test/` plus repo-owned `scripts/` modules. Incidental frontend/backend imports used by root tooling tests are reported explicitly as omitted from that root summary instead of silently distorting it.

Backend only:

```bash
npm --prefix backend run dev
npm --prefix backend run dev:light
npm --prefix backend run dev:env
npm --prefix backend run test
```

`npm --prefix backend run dev` now uses the same lightweight default as the root `npm run dev` path, and `npm --prefix backend run dev:env` explicitly opts into loading `local-config/ptydeck/backend.env.local`. `npm --prefix backend run dev:light` remains as a compatibility alias for the same lightweight backend runtime.

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

Start a direct local Windows PowerShell session from WSL-backed installs:

```text
/new powershell
/new ps
/new pwsh
```

Route a slash command to another session without changing the active one:

```text
@4 /note rollout host checks
```

Save or apply workspace state:

```text
/workspace save dev
/workspace show dev
/workspace apply dev
```

Manage active-deck workspace groups:

```text
/workspace group list
/workspace group save triage
/workspace group apply triage
```

Work with connection-profile drafts from the command plane:

```text
/connection draft active
/connection draft set {"startCwd":"/srv/app","tags":["ops"]}
/connection draft save ops-shell
```

Start a one-shot SSH session without first saving a profile:

```text
/ssh ixpqtwnk@carpo.uberspace.de --key ~/.ssh/id_ed25519
/ssh ixpqtwnk@carpo.uberspace.de --deck infra --cwd /srv/app --command "tmux a || tmux" --key ~/.ssh/id_ed25519
```

The first launch for a new SSH target still requires a trusted host key. You can manage it either through `/ssh hostkey ...` or in `Manage -> Connections`.
You can now manage that trust lifecycle directly in the command plane:

```text
/ssh hostkey probe carpo.uberspace.de:22
/ssh hostkey trust carpo.uberspace.de:22 ssh-ed25519
/ssh hostkey list carpo.uberspace.de:22
```

The `Connections` UI now keeps the SSH trust section visible for SSH drafts, shows first-connect guidance inline, and offers an explicit rotation review with old/new fingerprint comparison plus `Replace Trusted Key` when a fetched key conflicts with an existing trusted entry.

When you use `/ssh ... --password` or `/ssh ... --keyboard-interactive`, ptydeck now asks for the runtime secret in one masked launch dialog right before start instead of relying on an inline Connections form field.

Edit session settings through typed slash commands:

```text
@4 /settings note set rollout host checks
@4 /settings theme preset active night
@4 /settings mouse-forwarding set application
```

Transfer a file from a session:

```text
/transfer download /tmp/app.log
```

Preview or relay normalized replay excerpts between sessions:

```text
/replay preview 4 l:80
/replay copy 4 c:500
/ccp 4 3 sp:2
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

The scaffold fails closed when target files already exist; add `--force` only when an explicit overwrite is intended.

## Debugging Notes

Enable backend debug logging:

```bash
BACKEND_DEBUG_LOGS=1 BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log PTYDECK_BACKEND_LOAD_LOCAL_ENV=1 npm run dev
```

For focused repeated analysis, prefer storing those values in the gitignored `local-config/ptydeck/backend.env.local` file instead of prefixing every `npm run dev` command manually, then start that env-backed runtime with `npm run dev:env` or `npm --prefix backend run dev:env`. Do not leave high-volume debug or session-stream capture settings enabled for ordinary interactive work; `npm run dev` and `npm --prefix backend run dev` now keep those backend-local overrides disabled by default.

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
