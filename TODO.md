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

- `SWF-004` Owner `FE`: Add workflow data-source adapters (`line`, `visible-line`, `status`, `summary`, `exit-code`, `session-state`) over the existing workflow/runtime surfaces with deterministic source contracts, explicit missing-data behavior, and no hidden stream-scanning heuristics leaking back into the execution layer.
- `QLT-168` Owner `FE`: Remove send-safety presets from the session-settings UX and replace them with explicit per-session input-safety option controls for the existing `inputSafetyProfile` fields, including the numeric threshold fields, so operators configure the real guard flags directly instead of selecting bundled preset labels.
- `QLT-169` Owner `FE`: Remove preset terminology and preset-only command-surface affordances from help, `/settings apply`, composer/status surfaces, and related frontend messaging so input safety is described and edited only through explicit option fields instead of `off` / `shell_balanced` / `shell_strict` preset names.
- `QLT-170` Owner `QA`: Add regression coverage for explicit input-safety option editing, persisted per-session roundtrip behavior, removal of preset-based UI/help flows, and deterministic handling of direct flag edits versus historical preset-derived profiles.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
