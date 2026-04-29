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
  - `v0.4.0-H160` Repo-Wide Quality and Coverage Gap Follow-Up After H159
- Latest completed wave in this segment:
  - `v0.4.0-H159` Repo-Wide Quality and Coverage Gap Follow-Up After H158
- Queued next waves:
  - none currently

## Queued Wave Order

- `v0.4.0-H160`
  - `QLT-253` Owner `FE`: operator command/export/observation coverage hardening
  - `QLT-254` Owner `FE`: workspace/view-model/search coverage hardening

## Wave Dependencies

- `QLT-253`: follows completed `QLT-252` because command-palette, slash-workflow, replay-export, and paste-observation behavior depend on the same executor and operator feedback boundaries.
- `QLT-254`: follows completed `QLT-252` because workspace preset, workspace manager, session-view-model, terminal-search, and layout-settings behavior depend on the same retained command-selection and workspace authority contracts.

## Wave Exit Criteria

- `QLT-253` through `QLT-254` completed with direct deterministic coverage for the promoted seams.
- Validated top-line coverage remains above threshold across the root, backend, and frontend lanes.
- No new catch-all residual quality task remains for the `H160` segment.

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
