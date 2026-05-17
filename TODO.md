# TODO - ptydeck

This file defines concrete, open implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.
Completed work belongs in `CHANGELOG.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)

1. `QLT-368` Owner `FE`: extract the next initialization/reclaim/operator helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close branch/function gaps with direct deterministic regressions.
2. `QLT-369` Owner `FE`: isolate the next layout/workspace orchestration seam across `frontend/src/public/split-layout-runtime-controller.js` and `frontend/src/public/layout-profile-runtime-controller.js`.
3. `QLT-370` Owner `FE`: harden retained terminal/control-surface coverage across `frontend/src/public/ui/session-terminal-runtime-controller.js` and adjacent session interaction paths.
4. `QLT-373` Owner `PLAT`: stabilize the remaining normalized branch-summary reporter noise in repeated coverage outputs across `scripts/lib/coverage-report.mjs`, `backend/src/runtime.js`, and `backend/test/session-manager.test.js` so back-to-back `npm --prefix backend run test:coverage` runs stop shifting per-file branch percentages when the underlying raw V8 zero/nonzero range sets and aggregate totals are already stable.
5. `QLT-371` Owner `QA`: revalidate and document repeated backend/frontend/root full-lane evidence after `QLT-368` through `QLT-370` and `QLT-373`, including repeated `npm --prefix backend run test:coverage` runs to confirm the backend coverage lane is deterministic on the stabilized tree.

## Queued Open Tasks (Next Wave)

1. `PREF-411` Owner `BE`: add a server-persisted operator UI preferences authority with a typed top-level envelope plus bounded dynamic namespace storage so FE-only presentation settings can evolve without widening backend domain contracts for every new key.
2. `PREF-412` Owner `FE`: route the current overlay-only presentation settings through the new operator UI preferences channel, starting with active-overlay dock position (`top` / `bottom`) and visibility state (`normal` / `minimized`) while keeping composer mode, pins, and drafts on the existing typed composer-placement authority.
3. `PREF-413` Owner `QA`: add regression coverage for operator UI preferences persistence, fail-closed decoding of malformed or unknown values, and restore behavior across frontend reloads and backend restart for the initial overlay dock/visibility settings.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `QLT-368` through `QLT-370`.
- `PLAT` ownership role is active for `QLT-373`.
- `QA` ownership role is active for `QLT-371`.
- `BE` ownership role is currently inactive for the active wave and next re-enters on queued `PREF-411`.
