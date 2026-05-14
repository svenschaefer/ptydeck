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

1. `QLT-363` Owner `FE`: isolate and eliminate the non-terminating frontend broad-lane path rooted in `frontend/test/app-runtime-composition-controller.test.js` so `npm --prefix frontend run test` exits cleanly without external timeout and without leaving open-handle residue.
2. `QLT-364` Owner `QA`: revalidate and document full-lane frontend/root evidence after `QLT-363`, including `npm --prefix frontend run test`, `npm --prefix frontend run test:coverage`, `npm run test`, and `npm run test:coverage:check`.

## Queued Open Tasks (Next Wave)

1. `None.`

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency, keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized, and record the current quality-review evidence.
- `FE` ownership role is active for `QLT-363`.
- `QA` ownership role is active for `QLT-364`.
- `BE` ownership role is currently inactive.
- `PLAT` ownership role is currently inactive.
