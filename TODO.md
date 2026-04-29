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

- [ ] `QLT-244` Owner `BE`: extract backend HTTP route-table and request-dispatch seams out of `backend/src/runtime.js` (`7432` lines, `82.08%` line / `76.04%` branch) and add direct deterministic coverage for share, custom-command, deck/profile/preset, and SSH-trust route handling.
- [ ] `QLT-245` Owner `BE`: harden session launch and replay lifecycle seams in `backend/src/session-manager.js` (`2333` lines, `94.34%` line / `78.77%` branch) and `backend/src/replay-excerpt.js` (`89.82%` line / `80.85%` branch) with direct coverage for local/SSH startup normalization, remote-auth/secret paths, replay slice edge cases, and launch-spec failure branches.
- [ ] `QLT-246` Owner `FE`: extract another runtime-state and stream-authority seam from `frontend/src/public/app-runtime-composition-controller.js` (`1873` lines, `88.04%` line / `62.22%` branch), `frontend/src/public/store.js` (`1331` lines, `92.19%` line / `79.40%` branch), and `frontend/src/public/terminal-stream.js` (`88.84%` line / `77.42%` branch), then add direct deterministic state and stream-transition coverage.
- [ ] `QLT-247` Owner `FE`: harden operator layout/profile/settings surfaces in `frontend/src/public/connection-profile-runtime-controller.js` (`91.38%` line / `70.33%` branch), `frontend/src/public/layout-profile-runtime-controller.js` (`87.16%` line / `75.97%` branch), `frontend/src/public/split-layout-runtime-controller.js` (`88.38%` line / `68.40%` branch), `frontend/src/public/ui/session-settings-state-controller.js` (`89.19%` line / `73.44%` branch), `frontend/src/public/deck-runtime-controller.js` (`89.22%` line / `65.96%` branch), and `frontend/src/public/file-transfer-runtime-controller.js` (`89.33%` line / `76.53%` branch).
- [ ] `QLT-248` Owner `FE`: harden operator command/workflow surfaces in `frontend/src/public/command-palette-runtime-controller.js` (`86.95%` line / `60.49%` branch), `frontend/src/public/custom-command-model.js` (`88.16%` line / `78.81%` branch), `frontend/src/public/slash-workflow-engine.js` (`86.82%` line / `83.58%` branch), `frontend/src/public/slash-workflow-runtime-controller.js` (`88.11%` line / `71.81%` branch), and `frontend/src/public/slash-workflow-source-adapter.js` (`86.40%` line / `61.54%` branch).
- [ ] `QLT-249` Owner `FE`: harden retained operator-history and session-UI glue in `frontend/src/public/send-history-runtime-controller.js` (`88.48%` line / `76.51%` branch), `frontend/src/public/ui/session-ui-facade-controller.js` (`87.06%` line / `67.54%` branch), `frontend/src/public/ui/session-card-meta-controller.js` (`87.74%` line / `68.57%` branch), and `frontend/src/public/share-access-state.js` (`90.32%` line / `69.70%` branch).

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role (active): deliver `QLT-244` and `QLT-245`.
- `FE` ownership role (active): deliver `QLT-246` through `QLT-249`.
- `PLAT` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
