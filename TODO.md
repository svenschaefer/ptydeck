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

1. `QLT-365` Owner `BE`: stabilize the remaining repeated backend coverage drift across `backend/src/runtime.js`, `backend/src/runtime-session-control-authority.js`, `backend/src/runtime-session-event-authority.js`, and adjacent WebSocket/session-control runtime seams so back-to-back `npm --prefix backend run test:coverage` runs produce stable branch evidence instead of shifting file totals between passes.
2. `QLT-372` Owner `BE`: harden retained exited-session lifecycle and restore coverage across `backend/src/session-manager-launch-runtime.js`, `backend/src/session-manager-lifecycle.js`, `backend/src/session-manager-session-runtime.js`, and `backend/src/runtime-startup-restore.js`, including unexpected PTY exit persistence, replay/metric shaping, and explicit restartability after restore.
3. `QLT-366` Owner `BE`: extract the next retained startup/session-dispatch authority seam from `backend/src/runtime.js` and close it with direct deterministic regressions.
4. `QLT-367` Owner `BE`: harden retained normalization/operator-composer coverage across `backend/src/runtime-library-normalization.js` and `backend/src/runtime-operator-composer-authority.js`.
5. `QLT-368` Owner `FE`: extract the next initialization/reclaim/operator helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close branch/function gaps with direct deterministic regressions.
6. `QLT-369` Owner `FE`: isolate the next layout/workspace orchestration seam across `frontend/src/public/split-layout-runtime-controller.js` and `frontend/src/public/layout-profile-runtime-controller.js`.
7. `QLT-370` Owner `FE`: harden retained terminal/control-surface coverage across `frontend/src/public/ui/session-terminal-runtime-controller.js` and adjacent session interaction paths.
8. `QLT-371` Owner `QA`: revalidate and document repeated backend/frontend/root full-lane evidence after `QLT-365`, `QLT-372`, and `QLT-366` through `QLT-370`, including back-to-back `npm --prefix backend run test:coverage` runs to prove the remaining backend coverage drift is gone.

## Queued Open Tasks (Next Wave)

1. `PREF-411` Owner `BE`: add a server-persisted operator UI preferences authority with a typed top-level envelope plus bounded dynamic namespace storage so FE-only presentation settings can evolve without widening backend domain contracts for every new key.
2. `PREF-412` Owner `FE`: route the current overlay-only presentation settings through the new operator UI preferences channel, starting with active-overlay dock position (`top` / `bottom`) and visibility state (`normal` / `minimized`) while keeping composer mode, pins, and drafts on the existing typed composer-placement authority.
3. `PREF-413` Owner `QA`: add regression coverage for operator UI preferences persistence, fail-closed decoding of malformed or unknown values, and restore behavior across frontend reloads and backend restart for the initial overlay dock/visibility settings.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `QLT-368` through `QLT-370`.
- `QA` ownership role is active for `QLT-371`.
- `BE` ownership role is active for `QLT-365` through `QLT-367` and `QLT-372`.
- `PLAT` ownership role is currently inactive.
