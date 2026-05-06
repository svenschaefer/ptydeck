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
  - `v0.4.0-H174` Repo-wide quality and coverage follow-up
- Queued next waves:
  - none

## Active Wave Order

1. `QLT-308` Owner `FE`: restore a green frontend integration and coverage baseline around the current `app.test.js` regressions.
2. `QLT-309` Owner `BE`: extract the next retained startup/ready/catalog/session-authority seam from `backend/src/runtime.js`.
3. `QLT-310` Owner `BE`: harden retained catalog/state normalization coverage in `backend/src/runtime-library-normalization.js` and adjacent library-authority branches.
4. `QLT-311` Owner `BE`: harden launch/reconnect and quick-send persistence branches across the retained session-manager launch surfaces.
5. `QLT-312` Owner `FE`: extract the next initialization/error/reclaim seam from `frontend/src/public/app-runtime-composition-controller.js`.
6. `QLT-313` Owner `FE`: isolate the next SSH/profile guarded-action seam from `frontend/src/public/connection-profile-runtime-controller.js`.
7. `QLT-314` Owner `FE`: harden retained operator/workspace interaction coverage across command-palette, slash-workflow, session-terminal, and the workspace-preset controller shell.

## Wave Dependencies

- `QLT-308 -> QLT-312`
- `QLT-312 -> QLT-314`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
