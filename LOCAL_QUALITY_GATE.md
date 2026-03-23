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

## Optional Extended Local Validation

Use these checks when changing backup/retention/runtime-profile areas:

```bash
npm run backup:verify
PURGE_DRY_RUN=1 npm run retention:purge
npm run runtime:profile:check
npm run dr:drill
```

## Policy

- Do not rely on remote runner results.
- Treat local quality-gate output as release evidence input.
- Keep this document aligned with `DEPLOYMENT.md`, `TODO.md`, and `ROADMAP.md`.
