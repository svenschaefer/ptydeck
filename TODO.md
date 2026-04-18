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

1. `MSG-208` Owner `BE`
   Raise direct transport-only backend coverage for the retained messaging baseline. Add focused tests for `backend/src/messaging-runtime.js` (`67.77` line / `60.78` branch), `backend/src/discord-adapter.js` (`74.75` line / `39.73` branch), `backend/src/delivery-adapter-utils.js` (`41.46` branch), and `backend/src/telegram-command-surface.js` (`85.07` line / `68.25` branch) so explicit `MessageIntent` delivery, target normalization, topic binding reuse, inbound command parsing, and adapter failure/backoff paths are covered without reintroducing automatic stream semantics.
2. `MSG-209` Owner `BE`
   Reduce backend quality risk in `backend/src/validation.js` (`1610` lines, `76.34` line coverage) and `backend/src/messaging-custom-command-utils.js` (`81.20` line / `70.55` branch) by splitting the highest fan-out branches into smaller validators/helpers and adding direct tests for malformed payload variants and shell-payload normalization edges that are currently only partially exercised.
3. `MSG-210` Owner `QA`
   Validate the `v0.4.0-H147` backend quality and coverage hardening wave. Prove that the added transport-only messaging tests and validator/custom-command refactors lift the intended backend blind spots without regressing explicit delivery, Telegram command publication, Discord reference delivery, backend validation behavior, or the current coverage-check contract.
4. `MSG-211` Owner `FE`
   Refactor `frontend/src/public/app-runtime-composition-controller.js` (`2623` lines) into smaller seams and add direct tests for bootstrap, trusted-local handoff, reconnect, restore, and control-ownership branches. The current coverage report shows that controller twice with conflicting metrics, and even the better entry still leaves a large untested surface; the goal is a deterministic, testable runtime composition layer rather than one opaque monolith.
5. `MSG-212` Owner `FE`
   Add focused tests and, where needed, seam extractions for `frontend/src/public/command-executor.js` (`2432` lines, `84.83` line / `49.61` function coverage), `frontend/src/public/app-lifecycle-controller.js` (`32.79` function coverage), and `frontend/src/public/api-client.js` (`77.92` branch coverage). Cover the rare failure, abort, refresh/retry, destructive action, and command-dispatch branches that are currently weakly represented in the frontend suite.
6. `MSG-213` Owner `QA`
   Validate the `v0.4.0-H148` frontend quality and coverage hardening wave. Prove that the frontend coverage report is stable after the controller/seam changes, that runtime bootstrap/handoff/reconnect flows and command execution/error handling still behave correctly, and that the repo-wide coverage thresholds remain green with the corrected source attribution.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
