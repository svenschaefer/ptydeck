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
npm run security:sca
npm run security:sbom
npm run backup:verify
PURGE_DRY_RUN=1 npm run retention:purge
npm run release:evidence
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

- Backend: `NODE_ENV`, `PORT`, `SHELL`, `DATA_PATH`, `CORS_ORIGIN`, `MAX_BODY_BYTES`, `TRUST_PROXY`, `ENFORCE_TLS_INGRESS`
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
- `production` with `CORS_ORIGIN=*`: startup fails fast (wildcard is blocked in production).
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

## 9.1 SLO/SLI and Alerting Baseline (ENT-008)

Baseline SLI signals:

- API availability:
  - Definition: ratio of successful API responses (`2xx`/`3xx`) over total API requests.
  - Source: `ptydeck_http_requests_total`, `ptydeck_http_requests_by_status_total`.
- API error rate:
  - Definition: ratio of `5xx` responses over total API requests.
  - Source: `ptydeck_http_requests_by_status_total`.
- WS disconnect quality:
  - Definition: disconnect/open ratio over rolling window.
  - Source: `ptydeck_ws_connections_opened_total`, `ptydeck_ws_connections_closed_total`.
- Request latency:
  - Definition: average request latency from `duration_sum / duration_count`.
  - Source: `ptydeck_http_request_duration_ms_sum`, `ptydeck_http_request_duration_ms_count`.

Initial SLO targets (baseline, tune after real traffic):

- API availability monthly target: `>= 99.5%`
- API 5xx error ratio monthly target: `<= 1.0%`
- WS disconnect/open ratio 15m target: `<= 10%`
- Average API latency target: `<= 250ms` (rolling 15m)

Initial alert thresholds:

- Critical:
  - API availability `< 99.0%` over 15 minutes.
  - API 5xx ratio `> 5%` over 5 minutes.
- Warning:
  - API availability `< 99.5%` over 30 minutes.
  - API 5xx ratio `> 2%` over 15 minutes.
  - WS disconnect/open ratio `> 20%` over 15 minutes.
  - Average API latency `> 500ms` over 15 minutes.

Alert routing baseline:

- Warning alerts to team channel/on-call dashboard.
- Critical alerts to pager/on-call escalation path.
- Every critical alert requires a post-incident note with timestamp, impact, root-cause hypothesis, and follow-up actions.

## 9.2 Security Response Headers Baseline (ENT-016)

Backend runtime response hardening:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`

Scope:

- Applied to API and operational endpoints (`/api/v1/*`, `/health`, `/ready`, `/metrics`).
- This baseline is intentionally strict because backend serves API payloads and metrics, not browser-rendered documents.

HSTS policy (ingress/proxy responsibility):

- Set `Strict-Transport-Security` at TLS ingress/reverse proxy layer, not directly in backend runtime.
- Recommended baseline:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - Add `preload` only when domain ownership and rollout policy are validated for all subdomains.

## 9.3 Trusted Proxy Handling Baseline (ENT-019)

Backend runtime now supports explicit trusted-proxy configuration for safe `X-Forwarded-*` handling:

- Environment variable: `TRUST_PROXY`
- Allowed values:
  - `off` (default): ignore `X-Forwarded-*`, use direct socket metadata only.
  - `loopback`: trust forwarded headers only when request comes from loopback proxy (`127.0.0.1` / `::1`).
  - `all`: trust forwarded headers from any upstream (not recommended except controlled environments).
  - Comma-separated proxy IP allowlist (for example `10.0.0.2,10.0.0.3`).

Security behavior:

- If upstream is not trusted, backend ignores `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host`.
- If upstream is trusted, backend accepts sanitized first-hop values from these headers.
- Invalid `TRUST_PROXY` values fail fast at startup.

Recommended production baseline:

- Run with explicit proxy IP allowlist, not `all`.
- Keep ingress and backend in a fixed network topology so trusted proxy source IPs are deterministic.

## 9.4 Abuse-Control Rate Limiting Baseline (ENT-006)

Backend runtime applies fixed-window limits per resolved client IP:

- REST create-session endpoint: `POST /api/v1/sessions`
- WebSocket connection creation endpoint: `/ws`

Configuration:

- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_REST_CREATE_MAX` (default `60`, `0` disables REST create limiter)
- `RATE_LIMIT_WS_CONNECT_MAX` (default `60`, `0` disables WS connect limiter)

Behavior:

- Exceeded REST create limit returns `429` with `RateLimitExceeded` error payload.
- Exceeded WS connect limit returns HTTP `429` during upgrade with `Retry-After` header.
- Client identity for limits uses trusted-proxy-aware request context (`TRUST_PROXY`).

## 9.5 Session Lifecycle Guardrails Baseline (ENT-020)

Backend runtime enforces optional lifecycle guardrails for PTY sessions:

- Max concurrent sessions:
  - Config: `SESSION_MAX_CONCURRENT` (`0` disables).
  - Behavior: `POST /api/v1/sessions` returns `409 SessionLimitExceeded` when cap is reached.
- Idle timeout:
  - Config: `SESSION_IDLE_TIMEOUT_MS` (`0` disables).
  - Behavior: session is auto-closed when idle threshold is reached.
- Max lifetime:
  - Config: `SESSION_MAX_LIFETIME_MS` (`0` disables).
  - Behavior: session is auto-closed when lifetime threshold is reached.
- Sweep interval:
  - Config: `SESSION_GUARDRAIL_SWEEP_MS` (default `1000` ms).
  - Behavior: periodic enforcement loop for idle/lifetime policies.

Operational guidance:

- Start with conservative non-zero values in production-like environments.
- Keep `SESSION_MAX_CONCURRENT` aligned with host capacity and PTY process limits.
- Tune idle/lifetime thresholds to expected operator workflows to avoid premature termination.

## 9.6 Persistence Encryption-at-Rest Baseline (ENT-012)

Persistence encryption is optional and uses AES-256-GCM envelope format:

- `DATA_ENCRYPTION_KEYS`: comma-separated `keyId:base64Key` entries.
- `DATA_ENCRYPTION_ACTIVE_KEY_ID`: active key id used for new writes.

Behavior:

- If encryption settings are not provided, persistence remains plaintext JSON.
- If encryption is configured, writes are encrypted with active key id.
- Reads resolve key by stored `keyId`, enabling key rotation windows with old+new keys loaded.
- Invalid encryption configuration fails fast at startup.

Rotation baseline:

1. Add new key to `DATA_ENCRYPTION_KEYS` and set `DATA_ENCRYPTION_ACTIVE_KEY_ID` to new key id.
2. Restart service and allow next persistence save cycle to rewrite payload with new key id.
3. Verify persisted payload now references new key id.
4. Remove retired key id from `DATA_ENCRYPTION_KEYS` after successful cutover.

## 9.7 TLS-Only Ingress and Certificate Lifecycle Baseline (ENT-011)

Runtime TLS ingress enforcement:

- Config: `ENFORCE_TLS_INGRESS`
  - Defaults: `0` in development, `1` in production.
- Requirement: `TRUST_PROXY` must be configured (`loopback`, `all`, or explicit IP allowlist) when TLS ingress enforcement is enabled.
- Behavior:
  - REST/API requests using non-HTTPS request context are rejected with `426 TlsRequired`.
  - WS upgrades using non-HTTPS request context are rejected with HTTP `426`.
- Startup guardrails:
  - Production mode requires explicit `CORS_ORIGIN` allowlist (already enforced).
  - Production mode rejects `CORS_ORIGIN=*`.
  - With TLS ingress enforcement enabled, every configured CORS origin must be `https://...`.

Certificate lifecycle baseline:

- Keep a renewal window of at least `30` days before expiration.
- Monitor all ingress host certificates continuously.
- Validate post-renewal by checking served certificate expiry and end-to-end HTTPS/WSS reachability.

Automated expiry check:

- Script: `./scripts/check-cert-expiry.sh`
- Inputs:
  - `TLS_EXPIRY_CHECK_HOSTS` as comma/space-separated host list (`host` or `host:port`)
  - `TLS_EXPIRY_THRESHOLD_DAYS` (default `30`)
- CI integration:
  - Workflow step `TLS certificate expiry check` runs on Node `18`.
  - Uses repository variables `TLS_EXPIRY_CHECK_HOSTS` / `TLS_EXPIRY_THRESHOLD_DAYS`.
  - If host list is empty, the check is skipped with explicit log output.

## 9.8 Security Scanning and SBOM Baseline (ENT-007)

Dependency vulnerability gate:

- Script: `./scripts/security-scan.sh`
- Default threshold: `SCA_AUDIT_LEVEL=high` (allowed values: `low|moderate|high|critical`)
- Current behavior:
  - Runs `npm audit` for backend and frontend dependency trees.
  - Exits non-zero when vulnerabilities at or above configured threshold are found.

SBOM generation:

- Script: `./scripts/generate-sbom.sh`
- Output directory: `artifacts/security/sbom`
- Generated files (format depends on generator availability):
  - SPDX via `npm sbom`: `root.spdx.json`, `backend.spdx.json`, `frontend.spdx.json`
  - CycloneDX fallback: `root.cdx.json`, `backend.cdx.json`, `frontend.cdx.json`

CI integration:

- CI `security` job runs:
  - dependency vulnerability gate (`scripts/security-scan.sh`)
  - SBOM generation (`scripts/generate-sbom.sh`)
  - SBOM upload as workflow artifact (`sbom-spdx`)
- Optional image scan:
  - If repository variable `SECURITY_IMAGE_REF` is set, CI runs Trivy image scan and fails on `HIGH`/`CRITICAL`.

Suggested CI variables:

- `SCA_AUDIT_LEVEL` (optional, defaults to `high`)
- `SECURITY_IMAGE_REF` (optional, enables image scan when set)

## 9.9 Persistence Backup/Restore Baseline (ENT-009)

Backup creation:

- Script: `./scripts/backup-sessions.sh`
- Inputs:
  - `DATA_PATH` (default `./backend/data/sessions.json`)
  - `BACKUP_DIR` (default `./backups/sessions`)
- Output:
  - Gzip-compressed backup file: `sessions-<UTC_TIMESTAMP>.json.gz`

Restore:

- Script: `./scripts/restore-sessions.sh`
- Inputs:
  - `TARGET_DATA_PATH` (default `./backend/data/sessions.json`)
  - `BACKUP_DIR` (default `./backups/sessions`)
  - `BACKUP_FILE` (optional explicit file; if omitted, latest backup in `BACKUP_DIR` is used)

Roundtrip verification (non-prod/CI):

- Script: `./scripts/verify-backup-restore.sh`
- Behavior:
  - Creates deterministic sample persistence payload.
  - Executes backup and restore scripts.
  - Fails if restored payload does not byte-match source payload.

CI integration:

- Security job runs `./scripts/verify-backup-restore.sh` after SBOM generation.
- This provides periodic restore verification as part of non-production automation.

## 9.10 Data Retention/Purge Baseline (ENT-024)

Retention policy targets:

- Session backup files (`./backups/sessions`): retain `14` days.
- Backend operational logs (`./backend/logs`): retain `30` days.
- Security artifacts (`./artifacts/security`): retain `30` days.

Purge automation:

- Script: `./scripts/purge-retention.sh`
- Defaults:
  - `PURGE_DRY_RUN=1` (safe mode; reports candidates without deleting)
  - `SESSION_BACKUP_RETENTION_DAYS=14`
  - `BACKEND_LOG_RETENTION_DAYS=30`
  - `SECURITY_ARTIFACT_RETENTION_DAYS=30`

Configurable paths:

- `SESSION_BACKUP_DIR` (default `./backups/sessions`)
- `BACKEND_LOG_DIR` (default `./backend/logs`)
- `SECURITY_ARTIFACT_DIR` (default `./artifacts/security`)

Operational cadence:

- CI non-prod checks run the purge script in dry-run mode to continuously validate retention rules and path wiring.
- Production/non-prod runtime cleanup should execute the same script on a daily scheduler with `PURGE_DRY_RUN=0`.

Example (actual deletion run):

```bash
PURGE_DRY_RUN=0 npm run retention:purge
```

## 9.11 Release Evidence Bundle Baseline (ENT-015)

Release evidence generation:

- Script: `./scripts/generate-release-evidence.sh`
- Root shortcut: `npm run release:evidence`
- Output: `artifacts/release-evidence/release-evidence-<UTC_TIMESTAMP>.tar.gz`

Evidence bundle contents:

- quality evidence logs:
  - `quality/backend-test.log`
  - `quality/frontend-test.log`
  - `quality/coverage-check.log`
- security evidence logs:
  - `security/sca.log`
  - `security/sbom.log`
  - `security/backup-verify.log`
  - `security/retention-purge.log`
- SBOM payloads:
  - `security/sbom/*.json`
- provenance and integrity:
  - `manifest.json` with CI provenance (`GITHUB_SHA`, `GITHUB_REF`, workflow/run metadata)
  - `checksums.sha256` for included evidence files

CI integration:

- Security workflow captures test/security logs, generates SBOM, and invokes release evidence generation.
- CI uploads the `release-evidence` artifact for audit/compliance traceability.

## 10. Release Checklist

- [ ] `main` branch is up to date
- [ ] Quality gate passed
- [ ] `TODO.md`, `ROADMAP.md`, and `DONE.md` updated
- [ ] `CODEX_CONTEXT.md` updated if architecture/process changed
- [ ] Deployment smoke checks passed
