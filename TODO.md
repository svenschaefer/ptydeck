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

1. `QLT-357` Owner `BE`: extract the next retained startup/session-dispatch authority seam from `backend/src/runtime.js` and close it with direct deterministic regressions.
2. `QLT-358` Owner `BE`: harden retained normalization/state authority coverage across `backend/src/runtime-library-normalization.js`, `backend/src/runtime-session-messaging-authority.js`, and adjacent runtime-library/session-state branches.
3. `QLT-359` Owner `BE`: isolate the next retained launch/reconnect/app-identity lifecycle seam from `backend/src/session-manager.js` and harden the remaining manager branch gaps.
4. `QLT-360` Owner `FE`: extract the next initialization/reclaim/operator helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
5. `QLT-361` Owner `FE`: isolate the next layout/workspace orchestration seam across `frontend/src/public/split-layout-runtime-controller.js` and `frontend/src/public/layout-profile-runtime-controller.js`.
6. `QLT-362` Owner `FE`: harden retained runtime/operator-interaction coverage across `frontend/src/public/ui/session-terminal-runtime-controller.js`, `frontend/src/public/app-runtime-startup-helper-assembly.js`, and `frontend/src/public/layout-workspace-runtime-state.js`.

## Queued Open Tasks (Next Wave)

1. `CMP-401` Owner `BE`: add an operator-client-scoped server-side composer-placement authority that persists the global mode (`shared-footer` or `active-overlay`), pinned session ids, the shared active-overlay draft, and pinned per-session drafts through backend restart/restore plus explicit REST/WS update surfaces.
2. `CMP-402` Owner `FE`: add a global composer-placement mode switch that toggles between the existing shared footer and a non-resizing active-terminal overlay, and route the shared composer block to the active terminal only when the active terminal is not pinned.
3. `CMP-403` Owner `FE`: add per-terminal pin and unpin controls for `active-overlay`, render multiple pinned overlay composer blocks concurrently, and keep pinned drafts isolated from the shared active-overlay draft.
4. `CMP-404` Owner `QA`: add focused regression coverage for server-side operator-client persistence, mode switching, active-terminal overlay migration, pin lifecycle, draft isolation, and send-target correctness across shared-footer, shared active-overlay, and pinned-overlay paths.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `QLT-360` through `QLT-362`.
- `BE` ownership role is active for `QLT-357` through `QLT-359`.
- `BE` ownership role is assigned next for `CMP-401`.
- `FE` ownership role is assigned next for `CMP-402` and `CMP-403`.
- `QA` ownership role is assigned next for `CMP-404`.
- `QA` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
