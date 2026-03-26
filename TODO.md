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

- `QLT-138` Owner `BE`: add a persisted per-session input-safety profile contract to session settings so each terminal can configure which send-guard mechanisms are active, including explicit profile fields for `requireValidShellSyntax`, `confirmOnIncompleteShellConstruct`, `confirmOnNaturalLanguageInput`, `confirmOnDangerousShellCommand`, `confirmOnMultilineInput`, `confirmOnRecentTargetSwitch`, and supporting timing/size thresholds used by the frontend guardrails.
- `QLT-139` Owner `FE`: implement the first per-session send-safety mechanisms on top of the persisted profile, including a clear active-target surface near the composer, parser-backed valid-shell-syntax gating for opted-in shell sessions, explicit confirmation reasons for incomplete shell constructs, likely natural-language shell input, dangerous shell commands, multiline/oversized input, and recent target switches, plus preset mappings for at least `off`, `shell_syntax_gated`, `shell_balanced`, `shell_strict`, and `agent`.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
