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
  - `v0.4.0-H182` Repo-Wide Quality and Coverage Follow-Up
- Queued next waves:
  - `v0.4.0-H183` Operator Input Composer Placement Modes

## Active Wave Order

1. `QLT-357` Owner `BE`
2. `QLT-358` Owner `BE`
3. `QLT-359` Owner `BE`
4. `QLT-360` Owner `FE`
5. `QLT-361` Owner `FE`
6. `QLT-362` Owner `FE`

## Wave Dependencies

- `QLT-357 -> QLT-358`
- `QLT-357 -> QLT-359`
- `QLT-360 -> QLT-361`
- `QLT-360 -> QLT-362`

## Queued Wave Order

### `v0.4.0-H183` Operator Input Composer Placement Modes

1. `CMP-401` Owner `BE`
2. `CMP-402` Owner `FE`
3. `CMP-403` Owner `FE`
4. `CMP-404` Owner `QA`

## Queued Wave Dependencies

- `CMP-401 -> CMP-402`
- `CMP-401 -> CMP-403`
- `CMP-401 -> CMP-404`
- `CMP-402 -> CMP-403`
- `CMP-402 -> CMP-404`
- `CMP-403 -> CMP-404`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
