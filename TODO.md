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

- [ ] `ARC-010` Owner: `FE` Task: Complete UI-layer decomposition by extracting session-card/grid/settings rendering controllers into dedicated UI modules and reducing `app.js` to runtime bootstrap/composition only.
- [ ] `ARC-011` Owner: `FE` Task: Enforce explicit cross-layer contracts (stream -> interpretation -> state -> UI) in code boundaries so UI modules no longer reach stream/runtime internals directly.
- [ ] `ARC-012` Owner: `QA` Task: Add architecture regression coverage for layered FE boundaries (module-level contract tests plus integration assertions preventing cross-layer shortcut regressions).

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
