# TODO - ptydeck

This file defines concrete, open implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.
Completed work belongs in `CHANGELOG.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)

- `UX-021A` Owner `FE`
  Expand the `Workspace Library` connections tab into a full connection-profile editor so operators can create and edit saved connection profiles directly in the UI, inspect the full normalized launch payload, and stop relying on `Save From Active` plus one-line summaries as the only non-slash workflow.

- `UX-021B` Owner `FE`
  Expand the `Workspace Library` workspace-presets tab with richer preset detail visibility and a duplicate flow, so saved workspace presets are no longer limited to list/apply/rename/delete plus a compressed one-line summary.

- `UX-021C` Owner `FE`
  Make deck-group management in the `Workspace Library` explicit and consistent by surfacing whether edits are local-only versus persisted into the selected preset, clarifying `Save Visible` / `Apply` / `Clear` semantics in the UI, and adding slash-command parity for workspace-group CRUD/apply/clear flows instead of leaving groups primarily dialog-only.

- `UX-021D` Owner `QA`
  Add regression coverage for the `Workspace Library` follow-up UX, including direct connection-profile create/edit flows, preset duplication, richer preset detail rendering, workspace-group persistence semantics, and parity between the dialog workflows and the slash-command surface.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
