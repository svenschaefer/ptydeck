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
  - `v0.4.0-H167` Repo-Wide Quality and Coverage Follow-Up
- Queued next waves:
  - none

## Active Wave Order

- `QLT-266` Owner `BE`
- `QLT-267` Owner `BE`
- `QLT-268` Owner `FE`
- `QLT-269` Owner `FE`
- `QLT-270` Owner `FE`
- `QLT-271` Owner `FE`

## Wave Dependencies

- `QLT-268 -> QLT-271`

## Wave Exit Criteria

- the next backend authority seam is extracted from `backend/src/runtime.js` and covered with direct deterministic regressions
- `backend/src/session-manager.js` restart/reconnect/persistence/error-path coverage is tightened and one remaining lifecycle helper seam is isolated
- the next frontend runtime-composition and command-dispatch seams are extracted from `frontend/src/public/app-runtime-composition-controller.js` and `frontend/src/public/command-executor.js`
- the remaining SSH operator lifecycle branch gaps in `frontend/src/public/connection-profile-runtime-controller.js` are closed with direct regressions
- shared runtime-state and session-terminal interaction coverage is tightened across `frontend/src/public/store.js`, `frontend/src/public/session-runtime-controller.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
