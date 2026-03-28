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

- `REM-006A` Owner `BE`: Add a backend session file-transfer contract for bounded upload and download operations against normalized session-scoped paths, with deterministic size/path guardrails, explicit transfer-capability checks, and stable API error semantics instead of ad hoc shell-mediated file copies.
- `REM-006B` Owner `FE`: Add frontend slash-command workflows for session file upload and download on top of the backend transfer contract, with explicit operator feedback for transfer target, rejection reason, and completion state instead of silent terminal-side assumptions.
- `REM-006C` Owner `QA`: Add regression coverage for session file-transfer allow/deny behavior, path normalization, size guardrails, upload/download success paths, and end-to-end frontend/backend contract parity.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
