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
  - `v0.4.0-H187` Repo-Wide Quality and Coverage Follow-Up
- Queued next waves:
  - `v0.4.0-H188` Operator UI Preferences Foundation

## Active Wave Order

1. `QLT-365` Owner `BE`
2. `QLT-366` Owner `BE`
3. `QLT-367` Owner `BE`
4. `QLT-368` Owner `FE`
5. `QLT-369` Owner `FE`
6. `QLT-370` Owner `FE`
7. `QLT-371` Owner `QA`

## Wave Dependencies

- `QLT-365 -> QLT-371`
- `QLT-366 -> QLT-367`
- `QLT-366 -> QLT-371`
- `QLT-367 -> QLT-371`
- `QLT-368 -> QLT-369`
- `QLT-368 -> QLT-370`
- `QLT-368 -> QLT-371`
- `QLT-369 -> QLT-371`
- `QLT-370 -> QLT-371`

## Queued Wave Order

1. `PREF-411` Owner `BE`
2. `PREF-412` Owner `FE`
3. `PREF-413` Owner `QA`

## Queued Wave Dependencies

- `PREF-411 -> PREF-412`
- `PREF-411 -> PREF-413`
- `PREF-412 -> PREF-413`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
