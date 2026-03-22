# CODEX_CONTEXT - ptydeck

Last updated: 2026-03-22 (docs sync + git init)
Owner: `CODX`

## Project Purpose

`ptydeck` is a web-based multi-terminal controller that runs PTY-backed shell sessions in parallel.
The system separates backend execution concerns from frontend rendering concerns.

## Current Documentation Contract

- `TODO.md`: explicit implementation tasks only.
- `ROADMAP.md`: execution order, versions, and dependencies only.
- `DONE.md`: completed and verified topics only.
- `OUTLOOK-TODO.md`: mid/long-term items only.
- `README.md`: architecture and product behavior reference.

## Ownership Model

- `CODX`: Documentation consistency, roadmap governance, context persistence
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: CI/CD, runtime, and operational owner
- `QA`: Automated test owner

## Core Technical Decisions (Current)

- Backend is Node.js with PTY runtime via `node-pty`.
- API contract is OpenAPI-first and versioned under `/api/v1`.
- Realtime channel uses WebSocket multiplexed by `sessionId`.
- Frontend is a classic Node.js stack with `xterm.js`.
- Session persistence currently targets metadata restoration (`cwd`, shell, timestamps), not running process restoration.

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
