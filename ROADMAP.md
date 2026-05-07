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
  - `v0.4.0-H178` Repo-Wide Quality and Coverage Follow-Up
- Queued next waves:
  - none

## Active Wave Order

1. `QLT-333` Owner `BE`
2. `QLT-334` Owner `BE`
3. `QLT-335` Owner `BE`
4. `QLT-336` Owner `FE`
5. `QLT-337` Owner `FE`
6. `QLT-338` Owner `FE`

## Wave Dependencies

- `QLT-333 -> QLT-334`
- `QLT-333 -> QLT-335`
- `QLT-336 -> QLT-337`
- `QLT-336 -> QLT-338`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
