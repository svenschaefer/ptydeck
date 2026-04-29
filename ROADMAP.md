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
  - `v0.4.0-H159` Repo-Wide Quality and Coverage Gap Follow-Up After H158
- Latest completed wave in this segment:
  - `v0.4.0-H158` Repo-Wide Quality and Coverage Gap Follow-Up
- Queued next waves:
  - none currently

## Queued Wave Order

- `v0.4.0-H159`
  - `QLT-248` Owner `FE`: operator command/workflow coverage hardening
  - `QLT-249` Owner `FE`: retained send-history and session-UI glue coverage hardening

## Wave Dependencies

- `QLT-248`: active next slice in `v0.4.0-H159`; it now lands on top of the hardened runtime-state plus operator layout/profile/settings baseline delivered by `QLT-246` and `QLT-247`.
- `QLT-249`: follows `QLT-248` so the remaining session-UI glue is tightened only after the underlying operator command/workflow surfaces are stabilized.

## Wave Exit Criteria

- `QLT-244` through `QLT-249` completed with direct deterministic coverage for the promoted seams.
- Validated top-line coverage remains above threshold across the root, backend, and frontend lanes.
- No new catch-all residual quality task remains for the `H159` segment.

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
