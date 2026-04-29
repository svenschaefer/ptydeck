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
   - `QLT-242` Owner `FE`: command-composer autocomplete and command-engine coverage hardening.
   - `QLT-243` Owner `FE`: slash-workflow/theme/settings-dialog coverage hardening.

## Wave Dependencies

- The remaining `v0.4.0-H158` FE slices have no hard technical dependency edges; the execution order is driven by the current hotspot severity (`QLT-242` first, then `QLT-243`).

## Wave Exit Criteria

- Root-tooling coverage still clears the enforced threshold while the remaining repo-owned helper hotspots gain direct deterministic regressions.
- The promoted frontend runtime-composition, utility/debug/search, and workspace-preset hotspot files stay closed while the remaining command-composer/parser/settings/theme hotspot files gain direct deterministic coverage.
- Promoted tasks leave `TODO.md` with open work only and `ROADMAP.md` with active or queued sequencing only.
- Generated handbook/reference artifacts stay synchronized with their markdown/code sources.
- `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check` pass on the closeout tree.

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
