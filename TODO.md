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

1. `MSG-214` Owner `BE`
   Reduce backend runtime monolith risk in `backend/src/runtime.js` (`7938` lines, `82.78%` line / `76.53%` branch / `92.12%` function coverage) by extracting smaller seams around request/auth context, runtime start/stop orchestration, session-control routing, and health/metrics/reporting branches, then add direct regression tests for the extracted paths. The goal is to keep the current transport-only messaging baseline and runtime contract intact while removing the single-file control surface that still dominates backend complexity and coverage debt.
2. `MSG-215` Owner `QA`
   Validate the `v0.4.0-H149` backend runtime-core hardening wave. Prove that the refactored `backend/src/runtime.js` preserves the shipped REST/WebSocket/session lifecycle behavior, transport-only messaging health/metrics contract, and startup/shutdown semantics while materially improving targeted runtime coverage on the promoted seams.
3. `MSG-216` Owner `FE`
   Continue decomposing `frontend/src/public/app-runtime-composition-controller.js` (`2328` lines, `71.31%` line / `64.13%` branch / `14.58%` function coverage) after the first `H148` seam extraction, and raise direct coverage around bootstrap/auth handoff, trusted-local restore/reconnect, and composition-level control orchestration. The new `frontend/src/public/session-control-runtime-state.js` seam (`428` lines, `76.87%` line / `62.87%` branch / `97.56%` function coverage) should also receive the missing branch coverage needed to stop the composition stack from remaining the largest untrusted frontend hotspot.
4. `MSG-217` Owner `QA`
   Validate the `v0.4.0-H150` frontend runtime-composition hardening wave. Prove that bootstrap, auth refresh, trusted-local handoff, reconnect/reclaim, restore, and control ownership behavior still work after the additional seam extraction and coverage-focused refactor.
5. `MSG-218` Owner `FE`
   Reduce the remaining frontend command/workspace monolith risk by extracting seams and adding direct tests for `frontend/src/public/command-executor.js` (`2432` lines, `86.02%` line / `76.50%` branch / `49.61%` function coverage), `frontend/src/public/connection-profile-runtime-controller.js` (`1984` lines, `87.25%` line / `69.23%` branch / `78.18%` function coverage), and `frontend/src/public/workspace-preset-runtime-controller.js` (`1557` lines, `87.67%` line / `73.81%` branch / `78.26%` function coverage). Focus on destructive-action/error branches, profile/preset cleanup paths, launch/rebind flows, and the high-fan-out orchestration logic that still concentrates too much behavior in a few large FE controllers.
6. `MSG-219` Owner `QA`
   Validate the `v0.4.0-H151` frontend command/workspace hardening wave. Prove that command execution, connection-profile management, workspace-preset lifecycle, and the related UI/runtime flows remain correct after the promoted seam extractions, and that repo-wide coverage stays stable on the corrected reporting contract.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
