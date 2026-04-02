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

1. `QLT-171` Owner `BE`
   Add direct unit coverage for backend session-normalization helpers in `backend/src/session-input-safety-profile.js` and `backend/src/session-mouse-forwarding.js`, covering strict versus non-strict normalization, default fallback behavior, integer boundary enforcement, and unsupported-field rejection instead of relying only on indirect validation/runtime tests.
2. `QLT-172` Owner `FE`
   Add direct unit coverage for frontend pure helper modules `frontend/src/public/share-access-state.js`, `frontend/src/public/session-mouse-forwarding.js`, and `frontend/src/public/ui/components.js`, covering share-token parsing fallback behavior, mouse-tracking sequence stripping/reset semantics, and command-suggestion controller state transitions that are currently only exercised indirectly.
3. `QLT-173` Owner `FE`
   Expand direct regression coverage for `frontend/src/public/connection-profile-runtime-controller.js` and `frontend/src/public/workspace-preset-runtime-controller.js`, focusing on under-covered draft-edit error paths, duplicate/save/apply failure handling, stale-reference cleanup branches, and local-versus-persisted group-state edge cases in those large central runtime modules.
4. `QLT-174` Owner `FE`
   Add deterministic integrity coverage for the generated terminal theme catalog in `frontend/src/public/theme-library.js`, validating unique IDs, required terminal color keys, and normalized hex payload shape so the large generated artifact is not effectively unverified.
5. `QLT-175` Owner `FE`
   Reduce central runtime-assembly risk in `frontend/src/public/app-runtime-composition-controller.js` by extracting smaller testable composition helpers and adding dedicated composition-contract coverage for the extracted selectors and controller wiring instead of relying primarily on broad end-to-end app tests for a 1.3k-line composition root.
6. `QLT-176` Owner `QA`
   Close the H56 quality hardening wave with focused regression coverage and final gate validation across the new backend normalizer tests, frontend helper/runtime coverage expansions, theme-catalog integrity checks, and composition-root contract tests.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
