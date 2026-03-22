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
- Frontend: `FRONTEND_PORT`

Optional frontend overrides:

- `API_BASE_URL`, `WS_URL` (leave unset to auto-derive from browser host)

Secrets policy baseline:

- Never commit real secrets to git (`.env` files stay local/untracked).
- Keep local machine-specific secrets only in gitignored paths.
- In shared/prod environments inject secrets at runtime from secret stores or orchestrator secret primitives.

Optional for troubleshooting:

- Backend: `BACKEND_DEBUG_LOGS=1` for request/session/ws lifecycle logs
- Backend: `BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log` for persistent local debug traces
- Frontend: `FRONTEND_DEBUG_LOGS=1` (dev-server injected runtime config) and/or `?debug=1` in URL for browser-side REST/WS/render/resize logs

Optional local auth baseline (development only):

- Backend: `AUTH_DEV_MODE=1`
- Backend (optional override): `AUTH_DEV_SECRET`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_DEV_TOKEN_TTL_SECONDS`
- Frontend will automatically call `POST /api/v1/auth/dev-token` and attach the returned bearer token to REST/WS requests.

## 4.1 Secrets Management Strategy (ENT-005 Baseline)

Runtime secret injection pattern:

- Development:
  - Use local `.env` files only on the developer machine.
  - Keep sensitive local values out of tracked files.
- CI:
  - Provide secrets via CI secret store and inject as environment variables at runtime.
  - Do not print secrets in logs or test output.
- Production:
  - Use managed secret storage (for example platform-native secrets manager) as source of truth.
  - Inject secrets into process env at deploy/start time.
  - Avoid baking secrets into container images or repository artifacts.

Minimum secret inventory (current baseline):

- `AUTH_DEV_SECRET` (when `AUTH_DEV_MODE=1`)
- Future production auth credentials/keys (OIDC/JWKS-related values)
- Any future encryption-at-rest keys

Rotation procedure baseline:

1. Create new secret version in secret store.
2. Deploy runtime with new secret version and validate health/smoke checks.
3. Revoke old secret version after successful cutover window.
4. Record rotation event (who/when/what) in ops change log.

Operational guardrails:

- Never return secrets in API responses.
- Redact known secret fields from logs (`authorization`, `token`, `secret`, `password`, `cookie`).
- Keep secret access limited to least-privilege runtime identities.

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
curl -s http://127.0.0.1:18080/health
curl -s http://127.0.0.1:18080/ready
curl -s http://127.0.0.1:18080/metrics | head -n 20
```

Session API:

```bash
curl -s -X POST http://127.0.0.1:18080/api/v1/sessions -H 'content-type: application/json' -d '{}'
curl -s http://127.0.0.1:18080/api/v1/sessions
```

Frontend:

- Open `http://127.0.0.1:18081`
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
- `production` without `CORS_ORIGIN`: startup fails fast (`CORS_ORIGIN` is required).
- `AUTH_ENABLED=true` without `AUTH_DEV_MODE=1`: startup fails (only dev-mode auth provider is implemented in current baseline).
Keep provider-specific local proxy configuration files outside tracked docs/code in a gitignored local path.

### 7.1 Provider-Agnostic HTTPS/WSS Reverse-Proxy Contract

Use this routing contract independent of ingress provider:

- Frontend host routes to frontend service port `18081`.
- API host routes path prefix `/api/v1` to backend service port `18080`.
- API host routes path `/ws` to backend service port `18080` with WebSocket upgrade pass-through.
- Preserve `Host`, `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-For` headers.
- Enforce TLS at ingress and use `https://` + `wss://` URLs in frontend runtime config.

Minimal abstract route map:

```text
https://app.example.com                  -> http://backend-frontend:18081
https://api.example.com/api/v1/*         -> http://backend-api:18080/api/v1/*
wss://api.example.com/ws                 -> ws://backend-api:18080/ws
```

WebSocket requirements:

- HTTP/1.1 upgrade support must be enabled.
- `Connection: upgrade` and `Upgrade: websocket` headers must be forwarded.
- Idle timeouts must be long enough for interactive terminal sessions.

## 8. Rollback

1. Checkout previous stable commit/tag.
2. Restart backend and frontend.
3. Re-run smoke checks above.

## 9. Production Logging Standard

Use the following production logging contract for backend and frontend serving processes:

- Log format:
  - JSON line logs in production (`one JSON object per line`).
  - Plain text logs are allowed only for local development troubleshooting.
- Required base fields:
  - `ts` (ISO-8601 timestamp)
  - `level` (`debug|info|warn|error`)
  - `service` (`ptydeck-backend` or `ptydeck-frontend`)
  - `event` (stable event name)
  - `requestId` (when request-scoped)
- Correlation and request tracing:
  - Accept inbound `X-Request-Id` if present.
  - Generate one if missing.
  - Propagate `X-Request-Id` to downstream logs/events for the same request.
- PII and secret redaction rules:
  - Never log bearer tokens, cookies, passwords, secret keys, session command payloads, or full terminal output bodies.
  - Redact sensitive headers/fields at source (`authorization`, `cookie`, `set-cookie`, `access_token`, `refresh_token`, `password`, `secret`, `token`).
  - For troubleshooting, log metadata only (lengths, IDs, status, timing), not sensitive values.
- Retention policy baseline:
  - Keep hot logs for `14` days in non-prod and `30` days in prod.
  - Archive storage may keep compressed logs longer per compliance policy, but runtime logs must have enforced TTL.
  - Document and automate purge cadence in operations tooling.
- Access control:
  - Restrict production log access to least-privilege operator roles.
  - Keep audit trail for log access in managed logging platform.

Recommended runtime env pattern:

- `NODE_ENV=production`
- `LOG_FORMAT=json`
- `LOG_RETENTION_DAYS=30`
- `LOG_REDACT_FIELDS=authorization,cookie,set-cookie,access_token,refresh_token,password,secret,token`

## 10. Release Checklist

- [ ] `main` branch is up to date
- [ ] Quality gate passed
- [ ] `TODO.md`, `ROADMAP.md`, and `DONE.md` updated
- [ ] `CODEX_CONTEXT.md` updated if architecture/process changed
- [ ] Deployment smoke checks passed
