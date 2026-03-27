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

- `REM-008A` Owner `FE`: Add a deterministic terminal theme import/export compatibility layer that can parse and emit normalized theme payloads for the existing per-session `activeThemeProfile` / `inactiveThemeProfile` model, starting with explicit adapters for iTerm2 JSON, Windows Terminal JSON fragments, and Xresources-style key/value payloads.
- `REM-008B` Owner `FE`: Add frontend operator workflows for theme import/export, including slash-command entry points plus session-settings UI for importing a supported external theme payload into the active or inactive theme slot and exporting the current slot in a selected external format with explicit validation feedback.
- `REM-008C` Owner `QA`: Add regression coverage for theme import/export parsing, invalid payload rejection, deterministic slot mapping, and roundtrip fidelity across the supported external theme formats.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
