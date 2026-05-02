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

- Latest completed wave in this segment:
  - `v0.4.0-H161` Session Quick Send Favorites
- Active wave:
  - `v0.4.0-H162` Repo-Wide Quality and Coverage Follow-Up
- Delivered in the active wave:
  - `QLT-255` Owner `BE`: Extract accepted WebSocket connection lifecycle handling from `backend/src/runtime.js` into `backend/src/runtime-ws-connection.js` and close that seam with direct deterministic coverage.
  - `QLT-256` Owner `BE`: Harden `backend/src/session-manager.js` restart/replay/persistence/error-path coverage with new direct lifecycle regressions.
- Queued next waves:
  - none currently

## Active Wave Order

1. `QLT-257` Owner `FE`: Extract the next command-dispatch seam from `frontend/src/public/command-executor.js`.
2. `QLT-258` Owner `FE`: Harden shared runtime-state plus quick-send/session-terminal coverage and reduce another small frontend wiring seam if needed.
3. `QLT-259` Owner `FE`: Harden operator layout/profile coverage across split-layout and connection-profile controllers.

## Queued Wave Order

- none currently

## Wave Dependencies

- `QLT-257` -> `QLT-258`
- `QLT-259` depends only on the active wave sequencing and may proceed after `QLT-258` if no tighter coupling is discovered during implementation.

## Wave Exit Criteria

- `v0.4.0-H162` closes only when `QLT-257` through `QLT-259` are implemented, validated, documented, and moved out of `TODO.md`.

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
