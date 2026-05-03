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

- Latest completed wave in this segment:
  - `v0.4.0-H163` Repo-Wide Quality and Coverage Follow-Up
  - `v0.4.0-H164` Server-Authoritative Session Quick-Send Favorites
  - `v0.4.0-H165` Direct SSH Launch and Trust Consistency
- Active wave:
  - `v0.4.0-H166` SSH Operator Experience Polish
- Queued next waves:
  - none

## Active Wave Order

1. `SSH-310` Owner `FE`: dedicated masked runtime-secret launch flow for saved-profile and one-shot secret-backed SSH launches
2. `SSH-311` Owner `FE`: slash-command SSH host-key lifecycle management and missing-trust command-plane recovery
3. `SSH-312` Owner `FE`: first-connect and host-key-rotation UX polish in `Connections`
4. `SSH-313` Owner `FE`: one-shot `/ssh ...` launch parity and shipped doc/help alignment
5. `SSH-314` Owner `QA`: regression coverage for the promoted SSH operator-experience contract

## Wave Dependencies

- `SSH-311 -> SSH-312`
- `SSH-310 -> SSH-314`
- `SSH-311 -> SSH-314`
- `SSH-312 -> SSH-314`
- `SSH-313 -> SSH-314`

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
