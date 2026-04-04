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

- `QLT-177` Owner `BE`
  Add direct branch coverage and failure-path hardening for `backend/src/validation.js` and `backend/src/ssh-host-key-probe.js`, covering currently under-tested request/response schema rejection branches, SSH host-key probe failure and empty-output handling, and probe normalization edge cases that remain below acceptable direct coverage despite the aggregate backend threshold still passing.
- `QLT-178` Owner `BE`
  Stabilize the known flaky backend SSH reconnect and retry integration path so the full local quality gate no longer intermittently requires isolated reruns, by making the reconnect timeout and retry assertions deterministic in the relevant backend runtime and integration tests instead of depending on timing-sensitive behavior.
- `QLT-179` Owner `FE`
  Add direct controller and runtime coverage plus error-path hardening for `frontend/src/public/file-transfer-runtime-controller.js` and `frontend/src/public/replay-viewer-runtime-controller.js`, including picker cancellation, clipboard or download failure handling, backend rejection feedback, and empty-state UI behavior.
- `QLT-180` Owner `FE`
  Remove the remaining browser `prompt()` and `confirm()` flows from `frontend/src/public/ui/deck-actions-controller.js`, `frontend/src/public/layout-profile-runtime-controller.js`, and `frontend/src/public/ui/session-settings-dialog-controller.js`, replacing them with deterministic in-UI or dialog flows and adding direct coverage for the new create, rename, delete, and confirm paths.
- `QLT-181` Owner `FE`
  Refactor and add focused branch coverage for the high-complexity frontend runtime hotspots `frontend/src/public/split-layout-runtime-controller.js` and `frontend/src/public/command-send-safety-controller.js`, especially pane-weight normalization, pane assignment and removal edge cases, and grouped send-safety reason branches that remain well below the aggregate frontend coverage level.
- `QLT-182` Owner `QA`
  Add closeout regression coverage and gate verification for the `H59` quality hardening wave, including deterministic full-gate behavior for the previously flaky SSH reconnect path and parity checks for the new prompt-free frontend flows and newly covered error branches.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
