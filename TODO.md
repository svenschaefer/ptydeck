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

- `QLT-144` Owner `BE`: extend the persisted session theme contract so each terminal session can store two independently selectable normalized theme profiles, `activeThemeProfile` and `inactiveThemeProfile`, with deterministic fallback/defaulting and restart/restore preservation alongside the existing session settings payload.
- `QLT-145` Owner `FE`: apply the dual active/inactive terminal color-scheme model in the frontend, switch between the two user-selected schemes deterministically on active-session changes, and expose both selectable scheme slots in the per-session settings workflow.
- `QLT-146` Owner `FE`: remove the per-session header `View` and `DL` replay actions from terminal cards so replay access is command-driven (`/replay ...`) instead of consuming terminal-header action space.
- `QLT-147` Owner `FE`: apply the existing per-session send-safety preset/profile to paste-triggered input flows as well as explicit send actions, so guarded shell sessions warn or require confirmation before risky paste operations too.
- `QLT-148` Owner `FE`: collapse the composer metadata strip above the input box to one line with ` · ` separators, remove the `Send Safety Preset` label/value from that strip, and keep target plus transient feedback readable in the single-line layout.
- `QLT-149` Owner `FE`: split slash-command help into a main overview (`/help`) plus command/topic-specific sub-help (`/help <topic>` such as `/help deck`), with deterministic command grouping and concise per-command usage output.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
