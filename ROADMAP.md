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
  - `v0.4.0-H142`
- Active scoped tasks:
  - `MSG-115`
  - `MSG-116`
  - `MSG-117`
  - `MSG-118`
- Queued next waves:
  - none currently

## Queued Wave Order
- `v0.4.0-H142`
  - `MSG-115`
  - `MSG-116` after `MSG-115`
  - `MSG-117` after `MSG-115`
  - `MSG-118` after `MSG-115`, `MSG-116`, and `MSG-117`

## Wave Dependencies
- `v0.4.0-H142`
  - `MSG-116` depends on `MSG-115`
  - `MSG-117` depends on `MSG-115`
  - `MSG-118` depends on `MSG-115`, `MSG-116`, and `MSG-117`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
