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

- Active release waves:
  - `v0.4.0-H128`
- Active scoped tasks:
  - `MSG-083`
  - `MSG-084` after `MSG-083`
  - `MSG-085` after `MSG-083` and `MSG-084`
  - `MSG-086` after `MSG-083`, `MSG-084`, and `MSG-085`
  - `MSG-087` after `MSG-084`, `MSG-085`, and `MSG-086`
  - `MSG-088` after `MSG-083`, `MSG-084`, `MSG-085`, `MSG-086`, and `MSG-087`
- Queued next waves:
  - none currently

## Queued Wave Order
- `v0.4.0-H128`

## Wave Dependencies

- `v0.4.0-H128`
  - `MSG-083`
  - `MSG-084` after `MSG-083`
  - `MSG-085` after `MSG-083` and `MSG-084`
  - `MSG-086` after `MSG-083`, `MSG-084`, and `MSG-085`
  - `MSG-087` after `MSG-084`, `MSG-085`, and `MSG-086`
  - `MSG-088` after `MSG-083`, `MSG-084`, `MSG-085`, `MSG-086`, and `MSG-087`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
