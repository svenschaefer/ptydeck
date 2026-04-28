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
  - `v0.4.0-H156` Repo-Wide Quality and Coverage Hardening
  - Remaining open tasks:
    - `QLT-229`
    - `QLT-230`
    - `QLT-231`
    - `QLT-232`
    - `QLT-233`
- Latest completed wave in this segment:
  - `v0.4.0-H155` Production Auth Provider
- Queued next waves:
  - none currently

## Queued Wave Order

1. `v0.4.0-H156` Repo-Wide Quality and Coverage Hardening
   - `QLT-229` backend auth-provider coverage hardening
   - `QLT-230` backend runtime/session lifecycle coverage hardening
   - `QLT-231` frontend bootstrap/control coverage hardening
   - `QLT-232` frontend command/workflow coverage hardening
   - `QLT-233` frontend session-control / terminal-interaction coverage hardening

## Wave Dependencies

- `QLT-228` is completed; the root-tooling coverage lane is now part of `npm run test:coverage` and `npm run test:coverage:check`.
- `QLT-229` precedes `QLT-230` because the remaining runtime-admission edge coverage depends on the now-expanded auth-provider seam.
- `QLT-231` precedes `QLT-232` and `QLT-233` because the runtime bootstrap/control surface is the higher-risk frontend authority boundary for later command and session-control tests.
- `v0.4.0-H155` is now completed and no longer active. See `CHANGELOG.md` for closure criteria and evidence.

## Wave Exit Criteria

- The local quality gate reports backend, frontend, and root-tooling coverage deterministically.
- The promoted backend and frontend hotspot files gain direct regression coverage for the branches listed in `TODO.md`.
- `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check` pass on the closeout tree.

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
