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
  - `v0.4.0-H132`
  - `v0.4.0-H133`
- Active scoped tasks:
  - `MSG-093`
  - `MSG-094` after `MSG-093`
  - `MSG-095`
  - `MSG-096` after `MSG-095`
- Queued next waves:
  - none currently

## Queued Wave Order
- `v0.4.0-H132`
- `v0.4.0-H133`

## Wave Dependencies

- `v0.4.0-H132`
  - `MSG-093`
  - `MSG-094` after `MSG-093`
- `v0.4.0-H133`
  - `MSG-095`
  - `MSG-096` after `MSG-095`
  - should execute after `v0.4.0-H132` so the second transport proof lands on top of the already-proven multi-app semantic seam

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
