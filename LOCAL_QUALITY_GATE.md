# Local Quality Gate - ptydeck

This repository uses a local-only quality gate.
Remote GitHub-hosted runner execution is intentionally disabled in `.github/workflows/ci.yml`.

## Required Local Validation

Run these checks before merge/release:

```bash
npm run lint
npm run test
npm run test:coverage:check
./scripts/ci-smoke.sh
npm run security:sca
npm run security:sbom
```

Notes:

- `npm run lint` now includes the ADR-process structure check (`./scripts/check-adr-process.sh`) in addition to the existing script-log and workspace lint gates.
- `npm run test` now includes root-level tooling regression checks for the ADR generator/checker and frontend UI scaffold generator before the backend/frontend workspace suites.

## Optional Extended Local Validation

Use these checks when changing backup/retention/runtime-profile areas:

```bash
npm run backup:verify
PURGE_DRY_RUN=1 npm run retention:purge
npm run runtime:profile:check
npm run dr:drill
```

## Observability Contract Check (OBS-003/OBS-004)

When backend metrics or lifecycle/websocket runtime behavior changes, run this local contract check after `npm run dev`:

```bash
curl -fsS http://127.0.0.1:18080/metrics > /tmp/ptydeck.metrics.txt
rg "ptydeck_http_request_duration_ms_bucket|ptydeck_sessions_active_by_lifecycle|ptydeck_sessions_unrestored_total|ptydeck_ws_disconnects_by_reason_total|ptydeck_ws_reconnects_by_reason_total|ptydeck_ws_errors_by_reason_total" /tmp/ptydeck.metrics.txt
```

Expected outcome:

- Metrics endpoint is reachable and non-empty.
- Required observability contract metric names are present.
- No local parsing/runtime errors occur while scraping.

## Policy

- Do not rely on remote runner results.
- Treat local quality-gate output as release evidence input.
- Keep this document aligned with `DEPLOYMENT.md`, `TODO.md`, and `ROADMAP.md`.
