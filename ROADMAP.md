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
  - `v0.4.0-H181` - Repo-Wide Quality and Coverage Follow-Up
- Queued next waves:
  - none

## Active Wave Order

1. `QLT-351` Owner `BE`
2. `QLT-352` Owner `BE`
3. `QLT-353` Owner `BE`
4. `QLT-354` Owner `FE`
5. `QLT-355` Owner `FE`
6. `QLT-356` Owner `FE`

## Wave Dependencies

- `QLT-351 -> QLT-352`
- `QLT-351 -> QLT-353`
- `QLT-354 -> QLT-355`
- `QLT-354 -> QLT-356`
- `QLT-355 -> QLT-356`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
