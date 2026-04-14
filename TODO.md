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
- `MSG-077` Owner `BE`
  Investigate the current startup timeline after a backend restart without any frontend attached, using the real 2026-04-14 field window where the backend was restarted well before 14:00 and `https://ptydeck.local.secos.rocks` was only opened around 14:27. Reconstruct from logs and code what session/runtime startup work actually completed before the first frontend visit and what session, replay, restore, or startup-completion activity only happened once the frontend connected between late 14:00 and 15:00, so the product can distinguish intentional lazy frontend-triggered behavior from a backend-startup gap.
- `MSG-078` Owner `QA`
  Reproduce and validate the backend-only restart versus first-frontend-open startup path end to end: prove which observable session/startup transitions happen with no frontend present, which additional transitions are triggered only by the first frontend bootstrap, and whether that current behavior matches the intended runtime contract or needs a later corrective follow-up.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
