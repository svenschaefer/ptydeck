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

1. `CMP-406` Owner `FE`: Add an explicit opt-in `Repair` action beside the shipped conservative `Normalize` action for the shared footer composer and pinned overlay composers, including a preview/diff shell that keeps the original draft recoverable until the operator explicitly applies the repaired result.
2. `CMP-407` Owner `FE`: Implement the first shell-family repair engine for Bash/POSIX shell, PowerShell, and CMD with bounded hard-wrap, quote-continuation, path/URL continuation, and line-continuation heuristics that fail closed unless validation and confidence checks succeed.
3. `CMP-408` Owner `FE`: Implement the JSON repair engine with strict parser-backed validation so only confidently reconstructed wrapped-string and structure-preserving candidates can be applied from the composer `Repair` flow.
4. `CMP-409` Owner `FE`: Implement the XML repair engine with strict parser-backed validation and a conservative candidate set for wrapped text and attribute-value continuation so ambiguous markup remains unchanged.
5. `CMP-410` Owner `QA`: Add focused regression and acceptance coverage for the composer `Repair` flow, including preview/apply behavior, ambiguity fail-closed behavior, original-draft preservation, and syntax-family repair corpora for shell-family, JSON, and XML examples.

## Queued Open Tasks (Next Wave)

1. `None.`

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role (active): own the active composer repair delivery slices `CMP-406` through `CMP-409`.
- `QA` ownership role (active): own the active composer repair regression and acceptance slice `CMP-410`.
- `BE` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
