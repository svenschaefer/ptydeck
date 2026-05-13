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

1. `CMP-409` Owner `FE`: Implement the XML repair engine with strict parser-backed validation and a conservative candidate set for wrapped text and attribute-value continuation so ambiguous markup remains unchanged.
2. `CMP-410` Owner `QA`: Add focused regression and acceptance coverage for the composer `Repair` flow, including preview/apply behavior, ambiguity fail-closed behavior, original-draft preservation, and syntax-family repair corpora for shell-family, JSON, and XML examples.

## Queued Open Tasks (Next Wave)

1. `None.`

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role (active): own the remaining active composer repair delivery slice `CMP-409`.
- `QA` ownership role (active): own the active composer repair regression and acceptance slice `CMP-410`.
- `BE` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
