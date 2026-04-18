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

1. `MSG-211` Owner `FE`
   Refactor `frontend/src/public/app-runtime-composition-controller.js` (`2623` lines) into smaller seams and add direct tests for bootstrap, trusted-local handoff, reconnect, restore, and control-ownership branches. The current coverage report shows that controller twice with conflicting metrics, and even the better entry still leaves a large untested surface; the goal is a deterministic, testable runtime composition layer rather than one opaque monolith.
2. `MSG-212` Owner `FE`
   Add focused tests and, where needed, seam extractions for `frontend/src/public/command-executor.js` (`2432` lines, `84.83` line / `49.61` function coverage), `frontend/src/public/app-lifecycle-controller.js` (`32.79` function coverage), and `frontend/src/public/api-client.js` (`77.92` branch coverage). Cover the rare failure, abort, refresh/retry, destructive action, and command-dispatch branches that are currently weakly represented in the frontend suite.
3. `MSG-213` Owner `QA`
   Validate the `v0.4.0-H148` frontend quality and coverage hardening wave. Prove that the frontend coverage report is stable after the controller/seam changes, that runtime bootstrap/handoff/reconnect flows and command execution/error handling still behave correctly, and that the repo-wide coverage thresholds remain green with the corrected source attribution.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
