# TODO - ptydeck

This file defines concrete, open implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.
Completed work belongs in `DONE.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)

- `QLT-163` Owner `FE`: Remove the standalone left-sidebar `Rename Deck` and `Delete Deck` buttons, and expose those deck-management actions through a settings icon rendered inside the currently selected deck button so deck-local actions live with the active deck affordance instead of in a separate global button stack.
- `QLT-164` Owner `FE`: Rework the top sidebar action row so `New Deck` and `New Session` are displayed side by side, replacing the current vertically separated layout while keeping deck creation and session creation equally discoverable.
- `QLT-165` Owner `QA`: Add regression coverage for the consolidated deck-action UX, including active-deck settings-icon visibility, rename/delete access through deck settings, and the simplified top action-row layout.
- `QLT-166` Owner `FE`: Expose the persisted quick-ID swap/order state inside the new deck-settings surface and add a deck-settings workflow for performing swap/reorder operations there, so future persisted swap management is visible and operable without relying only on `/swap`.
- `QLT-167` Owner `QA`: Add regression coverage for deck-settings swap visibility and management, including persisted ordering display, swap/apply behavior from the deck-settings UI, and parity with the slash-command swap contract.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
