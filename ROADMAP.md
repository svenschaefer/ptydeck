# ROADMAP - ptydeck

This file defines active and queued execution order, release versions, and dependencies for tasks listed in `TODO.md`.
`TODO.md` remains the source of task definitions.
Completed and validated release history lives in `CHANGELOG.md`.

## Ownership and Release Control

- Roadmap owner: `CODY`
- Release execution owners: `BE`, `FE`, `PLAT`, `QA`
- Final decision authority: `SAS` (Sven A. Schaefer, `svenschaefer`, `sven.schaefer@gmail.com`)
- Versioning scheme: compressed pre-1.0 milestones and wave-based follow-up releases through the active `v0.4.x` series

## Current Execution Status

- Active wave:
  - `v0.4.0-H156` Repo-Wide Quality and Coverage Hardening
  - Remaining open tasks:
    - `QLT-232`
    - `QLT-233`
- Latest completed wave in this segment:
  - `v0.4.0-H155` Production Auth Provider
- Queued next waves:
  - none currently

## Queued Wave Order

1. `v0.4.0-H156` Repo-Wide Quality and Coverage Hardening
   - `QLT-232` frontend command/workflow coverage hardening
   - `QLT-233` frontend session-control / terminal-interaction coverage hardening

## Wave Dependencies

- `QLT-228` is completed; the root-tooling coverage lane is now part of `npm run test:coverage` and `npm run test:coverage:check`.
- `QLT-229` is completed; `backend/src/auth.js` now has direct regressions for OIDC discovery/JWKS refresh, malformed JOSE, scope normalization, provider-failure surfaces, and internal HS256 fallback behavior in `AUTH_MODE=prod`.
- `QLT-230` is completed; `backend/src/runtime.js` and `backend/src/session-manager.js` now have direct regressions for restore-all-fallbacks-fail behavior, dev-auth WS-ticket denial without `ws:connect`, concurrent stop/startup release behavior, startup fallback guard cleanup, and SSH reconnect fail-closed behavior.
- `QLT-231` is completed; `frontend/src/public/app-runtime-composition-controller.js` and `frontend/src/public/app-runtime-state-controller.js` now have direct regressions for auth-recovery fallback, debug-trace API retry behavior, stream quiet-idle activity clearing, command-feedback action normalization, and bootstrap-fallback suppression after runtime readiness.
- `QLT-232` is now the next slice because the remaining promoted frontend risk has shifted from bootstrap/control seams to the operator command/workflow path.
- `QLT-232` precedes `QLT-233` because command/workflow mutations still fan into session-control behavior and should be hardened before the terminal interaction edge cases close.
- `v0.4.0-H155` is now completed and no longer active. See `CHANGELOG.md` for closure criteria and evidence.

## Wave Exit Criteria

- The local quality gate reports backend, frontend, and root-tooling coverage deterministically.
- The promoted backend and frontend hotspot files gain direct regression coverage for the branches listed in `TODO.md`.
- `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check` pass on the closeout tree.

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
