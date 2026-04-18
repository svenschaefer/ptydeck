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

1. `MSG-216` Owner `FE`
   Continue decomposing `frontend/src/public/app-runtime-composition-controller.js` (`2328` lines, `71.31%` line / `64.13%` branch / `14.58%` function coverage) after the first `H148` seam extraction, and raise direct coverage around bootstrap/auth handoff, trusted-local restore/reconnect, and composition-level control orchestration. The new `frontend/src/public/session-control-runtime-state.js` seam (`428` lines, `76.87%` line / `62.87%` branch / `97.56%` function coverage) should also receive the missing branch coverage needed to stop the composition stack from remaining the largest untrusted frontend hotspot.
2. `MSG-217` Owner `QA`
   Validate the `v0.4.0-H150` frontend runtime-composition hardening wave. Prove that bootstrap, auth refresh, trusted-local handoff, reconnect/reclaim, restore, and control ownership behavior still work after the additional seam extraction and coverage-focused refactor.
3. `MSG-218` Owner `FE`
   Reduce the remaining frontend command/workspace monolith risk by extracting seams and adding direct tests for `frontend/src/public/command-executor.js` (`2432` lines, `86.02%` line / `76.50%` branch / `49.61%` function coverage), `frontend/src/public/connection-profile-runtime-controller.js` (`1984` lines, `87.25%` line / `69.23%` branch / `78.18%` function coverage), and `frontend/src/public/workspace-preset-runtime-controller.js` (`1557` lines, `87.67%` line / `73.81%` branch / `78.26%` function coverage). Focus on destructive-action/error branches, profile/preset cleanup paths, launch/rebind flows, and the high-fan-out orchestration logic that still concentrates too much behavior in a few large FE controllers.
4. `MSG-219` Owner `QA`
   Validate the `v0.4.0-H151` frontend command/workspace hardening wave. Prove that command execution, connection-profile management, workspace-preset lifecycle, and the related UI/runtime flows remain correct after the promoted seam extractions, and that repo-wide coverage stays stable on the corrected reporting contract.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
