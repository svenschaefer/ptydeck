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

- `UX-020A` Owner `FE`
  Add a dedicated secondary management surface outside the left sidebar for non-primary workspace artifacts, with explicit entry points, a clear shell/dialog structure, and deterministic tabbing between `Connections` and `Workspace Presets` instead of reintroducing sidebar overload.

- `UX-020B` Owner `FE`
  Implement full saved connection-profile management inside the new secondary management surface, including list/create/launch/rename/duplicate/delete flows and parity with the existing slash-command/runtime capabilities that were removed from the sidebar during the 2026-03-30 cleanup.

- `UX-020C` Owner `FE`
  Implement workspace-preset and deck-group management inside the same secondary management surface, including list/save current/apply/rename/delete flows plus clear visibility of linked layout-profile state and deck-local group state without relying on the removed sidebar panels.

- `UX-020D` Owner `QA`
  Add regression coverage for the new secondary management surface, including entry-point visibility, tab switching, connection-profile and workspace-preset CRUD/apply flows, and parity with the existing slash-command/runtime behavior after the sidebar cleanup.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
