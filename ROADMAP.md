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
  - `QLT-245` Owner `BE`: session-manager launch/replay lifecycle seam hardening
  - `QLT-246` Owner `FE`: runtime-state and stream-authority seam extraction
  - `QLT-247` Owner `FE`: operator layout/profile/settings coverage hardening
  - `QLT-248` Owner `FE`: operator command/workflow coverage hardening
  - `QLT-249` Owner `FE`: retained send-history and session-UI glue coverage hardening

## Wave Dependencies

- `QLT-245`: active next backend slice in `v0.4.0-H159`; it follows the completed route-table/request-dispatch extraction so the next lifecycle hardening can reuse the now-isolated runtime HTTP seams and keep backend monolith reduction ordered.
- `QLT-246`: no dependency; this is the highest-risk frontend runtime-state/stream authority cut in `v0.4.0-H159`.
- `QLT-247`: follows `QLT-246` because the layout/profile/settings operator surfaces depend on the same runtime-state and deck/profile authority contracts.
- `QLT-248`: follows `QLT-246` because command-palette and slash-workflow paths depend on the same runtime-state/session metadata authority.
- `QLT-249`: follows `QLT-247` and `QLT-248` so the remaining session-UI glue is tightened only after the underlying operator domains are stabilized.

## Wave Exit Criteria

- `QLT-244` through `QLT-249` completed with direct deterministic coverage for the promoted seams.
- Validated top-line coverage remains above threshold across the root, backend, and frontend lanes.
- No new catch-all residual quality task remains for the `H159` segment.

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
