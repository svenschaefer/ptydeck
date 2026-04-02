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

1. `CMD-001` Owner `FE`
   Expand `/connection ...` into a full saved-connection command surface with parity to the current `Workspace Library` connections editor, including direct blank profile creation, loading the active session into a draft, saving edited draft payloads, showing normalized detail, and duplicating saved profiles instead of limiting slash workflows to list/save/apply/rename/delete.
2. `CMD-002` Owner `FE`
   Expand `/workspace ...` so saved workspace presets have slash-command parity for richer detail inspection and duplication, instead of limiting the current surface to list/save/apply/rename/delete while the `Workspace Library` exposes more capability than slash help advertises.
3. `CMD-003` Owner `FE`
   Replace the raw `/settings apply <json>` mutation path with explicit typed slash subcommands for the session-settings surface, covering startup, note, theme, input-safety, and mouse-forwarding changes without forcing operators to hand-author opaque JSON patches.
4. `CMD-004` Owner `FE`
   Update slash help, autocomplete, usage strings, and examples so the expanded `/connection`, `/workspace`, and `/settings` surfaces are discoverable and no longer present the reduced command model as if it were complete.
5. `CMD-005` Owner `QA`
   Add regression coverage for the expanded slash-command surface, including connection-profile draft flows, workspace-preset duplicate/detail flows, typed session-settings mutations, and help/autocomplete parity.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
