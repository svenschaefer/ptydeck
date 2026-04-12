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

- `MSG-053` Owner `FE`
  Add focused direct coverage for the frontend command/runtime orchestration hotspots from the 2026-04-12 repo-wide audit: `frontend/src/public/app-runtime-composition-controller.js`, `command-executor.js`, `command-engine.js`, `command-composer-runtime-controller.js`, and `command-send-safety-controller.js`, with emphasis on cross-controller command execution branches, guarded-send edge matrices, and runtime composition fallback paths that still sit in the low/mid-70s for branch coverage.
- `MSG-054` Owner `FE`
  Add focused direct coverage for the frontend stateful runtime and persistence hotspots from the same audit: `connection-profile-runtime-controller.js`, `workspace-preset-runtime-controller.js`, `store.js`, `ui/session-terminal-runtime-controller.js`, and `split-layout-runtime-controller.js`, covering persistence failure paths, preset/profile mutation edge cases, terminal stabilization/recovery branches, and layout-state fallback handling.
- `MSG-055` Owner `QA`
  Close out the frontend quality-hardening wave with targeted regression confirmation plus the full local quality gate rerun, and verify that the audited hotspot cluster improves without regressing existing handbook, runtime-controller, and command-surface contract coverage.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
