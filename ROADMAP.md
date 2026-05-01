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
  - `v0.4.0-H161` Session Quick Send Favorites
- Latest completed wave in this segment:
  - `v0.4.0-H160` Repo-Wide Quality and Coverage Gap Follow-Up After H159
- Queued next waves:
  - none currently

## Active Wave Order

- `v0.4.0-H161` Session Quick Send Favorites
  - `CMD-301` Owner `FE`
  - `CMD-302` Owner `FE`
  - `CMD-303` Owner `QA`

## Queued Wave Order

- none currently

## Wave Dependencies

- `CMD-301` -> `CMD-302` -> `CMD-303`

## Wave Exit Criteria

- `v0.4.0-H161` is complete only when:
  - per-session quick-send usage is persisted browser-locally and pruned deterministically
  - each session card can expose at most five direct custom-command quick actions plus one `Send Clipboard` action without widening the current backend contract
  - blocked, empty, stale-command, and clipboard-unavailable states are covered by direct regression tests

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
