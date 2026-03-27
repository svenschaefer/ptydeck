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

- `REM-002` Owner `BE`: Add the SSH authentication matrix for remote sessions (`password`, private key, keyboard-interactive) with secure secret-handling boundaries, deterministic validation, and explicit forwarding/proxy guardrails on top of the remote-session contract.
- `REM-003` Owner `BE`: Add the SSH host-key trust-store workflow (`known_hosts`-style trust persistence, first-connect trust contract, and changed-host-key rejection behavior) so SSH sessions fail safely and predictably.
- `REM-009` Owner `QA`: Add integration and security coverage for remote-session authentication, host-key verification, launch/reconnect guardrails, and trust-failure paths across the new SSH-backed runtime contract.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
