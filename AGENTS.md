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
- `ROADMAP.md`: active and queued ordering, versions, and dependencies
- `CHANGELOG.md`: completed and validated release history only
- `TODO-OUTLOOK.md`: future epics and deferred explicit backlog only
- `CODEX_CONTEXT.md`: persistent project context and governance
- `DEPLOYMENT.md`: production/deployment runbook

## 4. Collaboration Rules

- Keep markdown content in US English.
- Do not mark tasks as done before implementation + validation.
- Keep strict planning-document separation:
  - `TODO.md` must contain open tasks only.
  - `CHANGELOG.md` must contain completed and validated release history only.
- Update `ROADMAP.md` when task sequencing/dependencies change.
- Update `CODEX_CONTEXT.md` for architecture/process/governance changes.
- Keep ownership explicit on all tasks in `TODO.md`.
- Escalate unresolved decision points to `SAS`.

## 5. Execution Hygiene (Mandatory)

- Do not leave orphan background terminals/processes.
- If a validation command hangs or stalls, stop it immediately, clean up processes, and continue with a deterministic fallback.
- Before every commit, verify there are no leftover background validation processes.
- Prefer deterministic, non-interactive validation commands and avoid stacking multiple long-running full-suite commands in parallel.

## 6. Development Workflow

1. Pick next scoped task(s) from `TODO.md` according to `ROADMAP.md`.
2. Implement in smallest safe increments.
3. Run focused validation for changed scope first (targeted tests).
4. Run required quality gates for completion:
   - `npm run lint`
   - `npm run test`
   - `npm run test:coverage:check` (or documented equivalent for the current scope)
5. Fix issues until validation is green.
6. Confirm no hanging/background validation processes remain.
7. Update docs (`TODO.md`, `CHANGELOG.md`, `ROADMAP.md`, `TODO-OUTLOOK.md`, `CODEX_CONTEXT.md`, and others as needed).
8. Commit with clear message and push.

## 7. Runtime Notes

- Default Node version: see `.nvmrc`.
- In WSL + Windows browser scenarios, frontend resolves API/WS host from browser host.
- Backend default CORS origin is `*` for local development compatibility.

## 8. Definition of Done

A task is done when all apply:
- Code implemented and integrated.
- Relevant tests added/updated.
- Local lint/test/coverage gates pass for the agreed scope.
- No orphan validation/background processes remain.
- Task status/documentation updated.
- Changes committed and pushed.

## 9. Change Control

- Major architecture changes require explicit confirmation by `SAS`.
- If uncertain between options with meaningful tradeoffs, document options and request `SAS` decision.
