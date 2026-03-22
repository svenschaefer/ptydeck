# Deployment Runbook - ptydeck

## 1. Prerequisites

- Node.js `18` (see `.nvmrc`)
- `npm` available in PATH
- Linux host with shell support for backend PTY sessions

## 2. Quality Gate (must pass before release)

```bash
npm run lint
npm run test
npm run test:coverage
```

## 3. Build

The project uses runtime JavaScript, so build here means syntax and type-surface checks plus API type generation.

```bash
npm run build
```

## 4. Environment Configuration

Backend:

```bash
cp backend/.env.example backend/.env
```

Frontend:

```bash
cp frontend/.env.example frontend/.env
```

Set at least:

- Backend: `NODE_ENV`, `PORT`, `SHELL`, `DATA_PATH`, `CORS_ORIGIN`, `MAX_BODY_BYTES`
- Frontend: `FRONTEND_PORT`, `API_BASE_URL`, `WS_URL`

Optional for troubleshooting:

- Backend: `BACKEND_DEBUG_LOGS=1` for request/session/ws lifecycle logs
- Backend: `BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log` for persistent local debug traces
- Frontend: `FRONTEND_DEBUG_LOGS=1` (dev-server injected runtime config) and/or `?debug=1` in URL for browser-side REST/WS/render/resize logs

## 5. Start in Production Mode

Terminal 1:

```bash
npm --prefix backend run dev
```

Terminal 2:

```bash
npm --prefix frontend run dev
```

## 6. Post-Deploy Smoke Checks

Backend health:

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8080/ready
```

Session API:

```bash
curl -s -X POST http://127.0.0.1:8080/api/v1/sessions -H 'content-type: application/json' -d '{}'
curl -s http://127.0.0.1:8080/api/v1/sessions
```

Frontend:

- Open `http://127.0.0.1:5173`
- Create session
- Send command (for example `pwd`)
- Confirm output appears in the corresponding terminal panel

## 7. Local Reverse Proxy Note

If local TLS/domain routing is used, route frontend and backend with explicit hosts, for example:

- Frontend host: `https://app.local.example`
- Backend API host: `https://api.local.example/api/v1`
- Backend WS host: `wss://api.local.example/ws`

When this mode is enabled, `CORS_ORIGIN` and WebSocket origin checks should use explicit allowlists instead of wildcard values.
Recommended production setup:

- `NODE_ENV=production`
- `CORS_ORIGIN=https://app.example.com,https://ops.example.com`
- Do not use `CORS_ORIGIN=*` in production.

Behavior summary:

- `development` without `CORS_ORIGIN`: wildcard CORS (`*`) for local dev convenience.
- `production` without `CORS_ORIGIN`: no cross-origin allow header is emitted (explicit allowlist required).
Keep provider-specific local proxy configuration files outside tracked docs/code in a gitignored local path.

## 8. Rollback

1. Checkout previous stable commit/tag.
2. Restart backend and frontend.
3. Re-run smoke checks above.

## 9. Release Checklist

- [ ] `main` branch is up to date
- [ ] Quality gate passed
- [ ] `TODO.md`, `ROADMAP.md`, and `DONE.md` updated
- [ ] `CODEX_CONTEXT.md` updated if architecture/process changed
- [ ] Deployment smoke checks passed
