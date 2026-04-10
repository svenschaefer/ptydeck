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

- `APP-001` Owner `BE`: Add a provider-neutral backend terminal-app-identity foundation for the single-user runtime, including a normalized per-session identity contract with `family`, `label`, `source`, `confidence`, `details`, and `updatedAt`, plus explicit lifecycle/update hooks so later messaging, paste, replay, and UI consumers do not each invent their own incompatible app-detection state.
- `APP-002` Owner `BE`: Add local-first foreground-process identification for PTY-backed sessions by resolving the terminal's foreground process group and then inspecting process metadata such as executable name, `cmdline`, `comm`, ancestry, and controlling-session relationships, with deterministic fallback when the foreground process resolves only to shell wrappers, `tmux`, `screen`, or other multiplexers.
- `APP-003` Owner `BE`: Add structured terminal-signal ingestion for shell- and app-aware identity hints, covering prompt/command boundary markers from FinalTerm-style `OSC 133`, VS Code shell-integration `OSC 633`, iTerm2 shell-integration metadata such as current-directory reporting, and alternate-screen transitions as a bounded TUI-family signal, without making those optional markers a hard prerequisite for generic session handling.
- `APP-004` Owner `BE`: Add confidence-based identity arbitration and fallback heuristics that combine explicit launch hints, local foreground-process inspection, shell-integration markers, alternate-screen usage, and bounded output-pattern hints into one deterministic active-app decision path, while degrading safely to broad families such as `shell`, `coding-agent`, `build-test`, `editor`, `pager`, `tui`, or `unknown` when confidence is insufficient for a concrete app label.
- `APP-005` Owner `FE`: Add a subtle operator-visible active-app surface that can expose the current detected app family/label/source/confidence for a session without bloating the main UI, and wire the normalized identity state into existing runtime consumers that benefit immediately from higher-confidence app awareness rather than duplicating detection logic in frontend-only heuristics.
- `APP-006` Owner `QA`: Add closeout validation for `v0.4.0-H79`, including direct backend identity-contract tests, local foreground-process detection coverage, shell-marker and alternate-screen signal handling regression depth, low-confidence fallback behavior, frontend visibility smoke coverage, and a deterministic full local quality-gate rerun.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
