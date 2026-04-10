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
  - none currently
- Active scoped tasks:
  - none currently
- Queued next waves:
  - `v0.4.0-H77`
  - `v0.4.0-H78`

## Active Wave Order

- `v0.4.0-H77`
  1. `MSG-001`
  2. `MSG-002` after `MSG-001`
  3. `MSG-003` after `MSG-001` and `MSG-002`
  4. `MSG-004` after `MSG-001`, `MSG-002`, and `MSG-003`
- `v0.4.0-H78`
  1. `MSG-005` after `MSG-004`
  2. `MSG-006` after `MSG-005`
  3. `MSG-007` after `MSG-005` and `MSG-006`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
