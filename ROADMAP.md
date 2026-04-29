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
  - `v0.4.0-H158` Repo-Wide Quality and Coverage Gap Follow-Up
- Latest completed wave in this segment:
  - `v0.4.0-H157` FE Handbook Surface Simplification
- Queued next waves:
  - none currently

## Queued Wave Order

1. `v0.4.0-H158` Repo-Wide Quality and Coverage Gap Follow-Up
   - `QLT-240` Owner `FE`: frontend composer/workflow/settings/preset coverage hardening.

## Wave Dependencies

- none within the remaining `v0.4.0-H158` slice after `QLT-239` landed.

## Wave Exit Criteria

- Root-tooling coverage still clears the enforced threshold while the remaining repo-owned helper hotspots gain direct deterministic regressions.
- The promoted frontend runtime-composition, utility/debug/search, and composer/workflow/settings/preset hotspot files gain direct deterministic coverage.
- Promoted tasks leave `TODO.md` with open work only and `ROADMAP.md` with active or queued sequencing only.
- Generated handbook/reference artifacts stay synchronized with their markdown/code sources.
- `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check` pass on the closeout tree.

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
