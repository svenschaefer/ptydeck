# AGENTS - ptydeck

This file documents the active roles, responsibilities, and collaboration rules for this repository.

## 1. Purpose

`ptydeck` is a web-based multi-terminal system with:
- Backend: PTY-backed session runtime + REST + WebSocket
- Frontend: browser UI with multi-session terminal rendering

## 2. Agent Roles

- `SAS` (Final Decision Authority)
  - Sven A. Schaefer (`svenschaefer`, `sven.schaefer@gmail.com`)
  - Makes final product and implementation decisions when tradeoffs exist.

- `CODY` (Documentation and Coordination)
  - Maintains planning/documentation consistency.
  - Keeps roadmap/task status synchronized.
  - Ensures persistent context is captured in `CODEX_CONTEXT.md`.

- `BE` (Backend Owner)
  - Owns backend runtime, session lifecycle, REST, WebSocket, persistence, and backend tests.

- `FE` (Frontend Owner)
  - Owns terminal UI, session interactions, FE state, API/WS integration, and frontend tests.

- `PLAT` (Platform Owner)
  - Owns CI/CD, scripts, runtime configuration, deployment runbooks.

- `QA` (Quality Owner)
  - Owns test strategy and automation coverage across unit/integration/E2E paths.

## 3. Source-of-Truth Documents

- `TODO.md`: explicit, concrete tasks only (what to build)
- `ROADMAP.md`: ordering, versions, dependencies, release flow
- `DONE.md`: completed and verified work only
- `OUTLOOK-TODO.md`: mid/long-term items only
- `CODEX_CONTEXT.md`: persistent project context and governance
- `DEPLOYMENT.md`: production/deployment runbook

## 4. Collaboration Rules

- Keep markdown content in US English.
- Do not mark tasks as done before implementation + validation.
- Update `ROADMAP.md` when task sequencing/dependencies change.
- Update `CODEX_CONTEXT.md` for architecture/process/governance changes.
- Keep ownership explicit on all tasks in `TODO.md`.
- Escalate unresolved decision points to `SAS`.

## 5. Development Workflow

1. Pick next scoped task(s) from `TODO.md` according to `ROADMAP.md`.
2. Implement in smallest safe increments.
3. Run validation:
   - `npm run lint`
   - `npm run test`
   - `npm run test:coverage`
4. Fix issues until validation is green.
5. Update docs (`TODO.md`, `DONE.md`, `ROADMAP.md`, `CODEX_CONTEXT.md`, and others as needed).
6. Commit with clear message and push.

## 6. Runtime Notes

- Default Node version: see `.nvmrc`.
- In WSL + Windows browser scenarios, frontend resolves API/WS host from browser host.
- Backend default CORS origin is `*` for local development compatibility.

## 7. Definition of Done

A task is done when all apply:
- Code implemented and integrated.
- Relevant tests added/updated.
- Local lint/test/coverage pass.
- Task status/documentation updated.
- Changes committed and pushed.

## 8. Change Control

- Major architecture changes require explicit confirmation by `SAS`.
- If uncertain between options with meaningful tradeoffs, document options and request `SAS` decision.
