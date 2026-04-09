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
  - `v0.4.0-H65`
- Active scoped tasks:
  - `MDT-014`
- Queued next waves:
  - `v0.4.0-H70`
  - `v0.4.0-H71`

Queued wave order and dependencies:

1. `UX-027A`
2. `UX-027B` after `UX-027A`
3. `UX-027C` after `UX-027A` and `UX-027B`
4. `UX-027D` after `UX-027A`, `UX-027B`, and `UX-027C`
5. `QLT-200` after `UX-027D`
6. `QLT-201` after `QLT-200`
7. `QLT-202` after `QLT-200` and `QLT-201`
8. `QLT-203` after `QLT-200`, `QLT-201`, and `QLT-202`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
