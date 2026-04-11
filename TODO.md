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

- `MSG-030` Owner `BE`: Route plain Telegram topic text for a mapped session/topic to the same backend session-input path used by the frontend send flow, so non-command inbound text can reach the PTY as terminal input instead of being observed only as `unsupported_text`.
- `MSG-031` Owner `BE`: Define and implement bounded Telegram-to-terminal input semantics for the new topic-text path, including command-versus-raw-text disambiguation, default terminator behavior, multiline payload handling, and deterministic treatment of empty or whitespace-only topic messages.
- `MSG-032` Owner `BE`: Apply the existing session-control, authorization, and tracing model to Telegram-sourced terminal input so topic text obeys the same write authority and audit/trace expectations as browser-side `Send` input.
- `MSG-033` Owner `QA`: Add closeout validation for `v0.4.0-H98`, covering topic-text-to-session-input delivery, command-path preservation (`/status`, `/stop`, `/retry`, `/replay`), multiline and terminator semantics, and controller-denied or unmapped-topic rejection behavior.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
