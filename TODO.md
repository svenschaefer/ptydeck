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

- [ ] `QLT-252` Owner `FE`: extract another command-dispatch seam out of `frontend/src/public/command-executor.js` (`2047` lines, `86.81%` line / `76.28%` branch) and add direct deterministic coverage for selection resolution, side-effect gating, and operator feedback/failure branches that still live inline in the executor.
- [ ] `QLT-253` Owner `FE`: harden operator command/export/observation controllers in `frontend/src/public/command-palette-runtime-controller.js` (`613` lines, `90.21%` line / `70.35%` branch), `frontend/src/public/slash-workflow-runtime-controller.js` (`412` lines, `89.56%` line / `74.17%` branch), `frontend/src/public/paste-observation-runtime-controller.js` (`455` lines, `90.33%` line / `74.67%` branch), and `frontend/src/public/replay-export-runtime-controller.js` (`190` lines, `91.58%` line / `71.67%` branch) with direct coverage for fallback, cancel/error, and malformed-input branches still reached mainly through larger operator flows.
- [ ] `QLT-254` Owner `FE`: harden workspace/view-model/search surfaces in `frontend/src/public/workspace-preset-runtime-controller.js` (`1135` lines, `91.63%` line / `80.00%` branch), `frontend/src/public/workspace-manager-runtime-controller.js` (`180` lines, `92.78%` line / `66.67%` branch), `frontend/src/public/session-view-model.js` (`302` lines, `90.73%` line / `81.90%` branch), `frontend/src/public/terminal-search.js` (`100` lines, `92.00%` line / `69.23%` branch), and `frontend/src/public/ui/layout-settings-controller.js` (`180` lines, `97.78%` line / `55.56%` branch) with direct coverage for preset fallback, workspace load/save guards, derived-session label edge cases, terminal search failure handling, and layout-settings guard branches.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `BE` ownership role is currently inactive.
- `FE` ownership role (active): deliver `QLT-252` through `QLT-254`.
- `PLAT` ownership role is currently inactive.
- `QA` ownership role is currently inactive.
