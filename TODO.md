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

- [ ] `ARC-012` Owner: `QA` Task: Add architecture regression coverage for layered FE boundaries (module-level contract tests plus integration assertions preventing cross-layer shortcut regressions).
- [ ] `QLT-123` Owner: `FE` Task: Implement consistent copy/paste handling for terminal sessions and the command input box using one system-clipboard-only UX pattern: left-drag selection plus `Enter` copies to system clipboard, middle-click pastes from system clipboard, right-click keeps default system context-menu behavior, and no separate primary-selection clipboard model is introduced.
- [ ] `QLT-124` Owner: `FE` Task: Refactor and optimize the terminal-session header layout/interaction implementation (keep existing semantic elements, but improve structure/usability/maintainability of the current historically grown header composition).

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
