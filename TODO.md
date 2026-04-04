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

1. `UX-024A` Owner `FE`  
   Add a per-session send-history data model for the command-composer/send surface, capturing the actual payloads sent to each terminal session after guard confirmation, storing bounded history entries with metadata (`sessionId`, timestamp, payload length, normalized preview), and persisting the bounded history in frontend-local storage so it survives reload without requiring backend session-model changes.
2. `UX-024B` Owner `FE`  
   Add a `History` entry point in the control-pane meta strip next to `Manage` / position / hide, and implement a per-session send-history browser that supports search, truncated list rows for long payloads, explicit full-entry expansion for oversized texts, and restoring a selected history entry back into the command input box without sending it automatically.
3. `UX-024C` Owner `FE`  
   Harden the send-history UX for large payloads and large histories by enforcing bounded retention, keeping list rendering summary-only by default, avoiding eager full-text DOM rendering, and keeping search/restore interactions responsive even when individual history entries are very long.
4. `UX-024D` Owner `QA`  
   Add regression coverage for the send-history feature, including per-session capture semantics, persistence across reload, search behavior, truncated-versus-expanded long-entry rendering, restore-to-input behavior, and bounded-history/performance guardrails.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
