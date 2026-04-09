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
  - `v0.4.0-H75`

## Active Wave Order

- `v0.4.0-H75`
  1. `DOC-001`
  2. `DOC-002` after `DOC-001`
  3. `DOC-003` after `DOC-001`
  4. `DOC-004` after `DOC-001`
  5. `DOC-005` after `DOC-002`, `DOC-003`, and `DOC-004`
  6. `DOC-006` after `DOC-001`, `DOC-002`, `DOC-003`, `DOC-004`, and `DOC-005`

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
