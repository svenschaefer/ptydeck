# DONE - ptydeck

Completed and verified topics belong here.

## 2026-03-22

- [x] Initial `README.md` drafted with architecture, protocol, and operational concepts.
- [x] Initial planning set created: `TODO.md`, `ROADMAP.md`, `DONE.md`, `OUTLOOK-TODO.md`.
- [x] Documentation normalized to US English and ownership model defined.
- [x] `CODEX_CONTEXT.md` created to persist project context for future Codex runs.
- [x] `DOC-001` completed: `CODEX_CONTEXT.md` synchronized with current architecture, ownership model, and process rules.
- [x] `DOC-002` completed: planning docs (`TODO.md`, `ROADMAP.md`, `DONE.md`, `OUTLOOK-TODO.md`) aligned and kept consistent.
- [x] Git repository initialized in `/home/wsl/workspace/code/ptydeck`.
- [x] `v0.1.0` baseline delivery completed: `BE-001`, `BE-002`, `FE-001`, `INT-001`, `INT-002`, `INT-009` implemented.
- [x] CI baseline implemented (`INT-003`) with lint, test, and build jobs for backend and frontend.
- [x] Local validation completed for current changes: `npm run lint`, `npm run test`, and `npm run test:coverage` all pass.
- [x] `v0.2.0` backend core delivery completed: `BE-003`, `BE-004`, `BE-005`, `BE-006`, `BE-007`, `BE-008`, `BE-009`, `BE-010`, `BE-011`, `BE-019`.
- [x] Added `SessionManager` with PTY lifecycle integration and REST control endpoints under `/api/v1/sessions`.
- [x] Added runtime request/response validation and centralized API error mapping for backend routes.
- [x] Added backend unit tests for `SessionManager`, `validation`, and `errors` modules.
- [x] Backend coverage raised to `93.61%` total lines in local `npm run test:coverage`.

## Maintenance Rules

- Move tasks to `DONE.md` only after implementation and verification.
- Keep entries factual and traceable to commits.
- Keep chronological order by date.
