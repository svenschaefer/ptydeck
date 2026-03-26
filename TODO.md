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

- `QLT-135` Owner `BE`: add a persisted per-session note field to the backend session contract so each terminal session can store exactly one optional text note, with empty-note writes deleting the stored note deterministically.
- `QLT-136` Owner `FE`: add `/note` session-note management in the frontend command plane and render the persisted note in the terminal-session header using a compact small-font presentation; each session supports exactly one note or none, and submitting an empty note clears any existing note.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
