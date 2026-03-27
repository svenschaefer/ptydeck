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

- `CMD-010` Owner `FE`: Add deterministic command namespaces so the slash-command plane supports explicit domain-prefixed aliases such as `/session.new`, `/session.close`, `/deck.switch`, `/custom.show`, `/layout.apply`, `/workspace.apply`, and `/replay.export`, while keeping the existing short command names fully backward-compatible.
- `CMD-011` Owner `FE`: Add a scriptable command-plane execution mode for deterministic sequential slash-command runs from one composer submission, using newline-separated slash commands or an explicit `/run` block, with stop-on-failure behavior, concise aggregated feedback, and no loops, variables, or PTY-stream interpretation side effects.
- `CMD-012` Owner `QA`: Add regression coverage for namespaced command resolution, help/autocomplete/command-palette visibility, backward compatibility with existing short command names, and deterministic multi-command script execution plus failure-short-circuit behavior.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
