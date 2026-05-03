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
  - none
- Queued next waves:
  - none

## Active Wave Order

- none

## Wave Dependencies

- none

## Wave Exit Criteria

- secret-backed SSH launches no longer depend on a hidden Connections-form field or `window.prompt`
- one-shot `/ssh ...` missing-trust handling is available through an explicit command-plane lifecycle instead of a UI-only stop point
- `Connections` exposes a deliberate first-connect and host-key-rotation flow with explicit trust/replace guidance
- one-shot `/ssh ...` help, docs, and runtime flags are aligned on the shipped contract
- focused regression coverage proves secret-backed launch, trust lifecycle, rotation conflict handling, and shipped slash-command contract behavior

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
