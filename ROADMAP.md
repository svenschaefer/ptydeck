# ROADMAP - ptydeck

This file defines active and queued execution order, release versions, and dependencies for tasks listed in `TODO.md`.
`TODO.md` remains the source of task definitions.
Completed and validated release history lives in `CHANGELOG.md`.

## Ownership and Release Control

- Roadmap owner: `CODY`
- Release execution owners: `BE`, `FE`, `PLAT`, `QA`
- Final decision authority: `SAS` (Sven A. Schaefer, `svenschaefer`, `sven.schaefer@gmail.com`)
- Versioning scheme: compressed pre-1.0 milestones and wave-based follow-up releases through the active `v0.4.x` series

## Current Execution Status

- Latest completed wave in this segment:
  - `v0.4.0-H164` Server-Authoritative Session Quick-Send Favorites
- Active wave:
  - `v0.4.0-H163` Repo-Wide Quality and Coverage Follow-Up
- Queued next waves:
  - none

## Active Wave Order

1. `QLT-260` Owner `BE`: extract the next startup/request/session-authority seam from `backend/src/runtime.js` and close it with direct deterministic regressions.
2. `QLT-262` Owner `BE`: harden SSH/foreground/runtime reliability coverage across `backend/src/ssh-host-key-probe.js`, `backend/src/terminal-foreground-process.js`, and their retained runtime config/error-path helpers.
3. `QLT-263` Owner `FE`: extract the next bootstrap/runtime-composition seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
4. `QLT-264` Owner `FE`: harden operator command-entry coverage across `frontend/src/public/command-executor.js`, `frontend/src/public/command-composer-runtime-controller.js`, `frontend/src/public/command-completion.js`, and the retained command handler seams.
5. `QLT-265` Owner `FE`: harden terminal/stream/operator-interaction coverage across `frontend/src/public/terminal-stream.js`, `frontend/src/public/ui/session-terminal-runtime-controller.js`, `frontend/src/public/slash-workflow-runtime-controller.js`, and `frontend/src/public/session-quick-send-runtime-controller.js`.
6. `QLT-261` Owner `BE`: harden the shipped transport-only messaging baseline across `backend/src/messaging-runtime.js`, `backend/src/telegram-adapter.js`, `backend/src/discord-adapter.js`, `backend/src/telegram-command-surface.js`, `backend/src/delivery-adapter-utils.js`, and `backend/src/terminal-messaging-core.js`.

## Wave Dependencies

- `QLT-260 -> QLT-262` so the next backend runtime seam extraction lands before narrower reliability follow-up coverage touches adjacent authority paths.
- `QLT-260 -> QLT-261` so the retained backend runtime shape settles before the transport-only messaging baseline is hardened again.
- `QLT-263 -> QLT-264` so the next frontend runtime-composition seam extraction lands before command-entry hardening stacks more coverage on the remaining monoliths.
- `QLT-264 -> QLT-265` so terminal/stream/operator-interaction follow-up runs after the adjacent command-entry surfaces are stabilized.

## Wave Exit Criteria

- all `QLT-260` through `QLT-265` tasks are implemented and validated
- the next backend runtime seam extraction lands before narrower reliability and transport-only messaging hardening stack additional coverage on adjacent authority paths
- the next frontend runtime-composition seam extraction lands before additional command-entry and operator-interaction hardening stack on the remaining monoliths
- validated root, backend, and frontend coverage lanes still pass `npm run test:coverage:check`
- `TODO.md` and `ROADMAP.md` continue to reflect the explicit split between open tasks and sequencing state

## Sequencing Rules

- Promote only explicit, concrete tasks from `TODO-OUTLOOK.md` into `TODO.md` before implementation.
- Keep only active and queued waves in this document.
- Move completed wave history to `CHANGELOG.md`.
- Update order and dependencies here whenever active or queued sequencing changes.
