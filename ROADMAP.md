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
   - `QLT-235` Owner `BE`: backend runtime monolith reduction plus direct seam coverage.
   - `QLT-236` Owner `BE`: backend startup/trust/PTY-write reliability coverage hardening.
   - `QLT-237` Owner `BE`: retained transport-only messaging/identity coverage hardening.
   - `QLT-238` Owner `FE`: frontend runtime-composition seam extraction and direct tests.
   - `QLT-239` Owner `FE`: frontend utility/debug/search controller coverage hardening.
   - `QLT-240` Owner `FE`: frontend composer/workflow/settings/preset coverage hardening.

## Wave Dependencies

- `QLT-235` should land before `QLT-236` so follow-on backend reliability tests target the reduced runtime seam instead of a larger moving monolith.
- `QLT-237` depends on the `QLT-235` runtime seam remaining stable but is otherwise independent of the startup/trust slice in `QLT-236`.
- `QLT-238` should land before `QLT-239` and `QLT-240` so the remaining frontend operator-path coverage work lands against a smaller, more explicit runtime-composition boundary.

## Wave Exit Criteria

- Root-tooling coverage still clears the enforced threshold while the remaining repo-owned helper hotspots gain direct deterministic regressions.
- The promoted backend runtime, startup/trust/write, and retained transport/identity hotspot files gain direct coverage and, where needed, smaller extracted seams.
- The promoted frontend runtime-composition, utility/debug/search, and composer/workflow/settings/preset hotspot files gain direct deterministic coverage.
- Promoted tasks leave `TODO.md` with open work only and `ROADMAP.md` with active or queued sequencing only.
- Generated handbook/reference artifacts stay synchronized with their markdown/code sources.
- `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check` pass on the closeout tree.

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
