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

1. `MDT-014` Owner `QA`
   Validate `feature/h62-multi-device-control-foundation` from at least one second LAN client under the real hostnames (`https://ptydeck.local.secos.rocks` and `https://api.ptydeck.local.secos.rocks`), including frontend boot, browser-local startup-backup creation and verification, trusted-local device identity persistence, REST bearer auth, WebSocket ticket flow, subtle startup takeover prompting, scope-aware trusted-local control claim (`all sessions`, `current deck`, `current session`), automatic device-local layout recall on successful takeover, and deterministic controller reclaim between two attached clients without prior release.
2. `QLT-201` Owner `FE`
   Raise direct orchestration coverage and targeted hardening for `frontend/src/public/app-runtime-composition-controller.js`, especially the runtime glue around websocket/session-data wiring, command-feedback actions, reclaim-and-retry control flow, paste-observation integration, share/access transitions, and fallback/no-op branches that currently sit mostly behind broad `app.test.js` coverage.
3. `QLT-202` Owner `FE`
   Raise direct command-surface coverage and hardening for `frontend/src/public/command-engine.js`, `frontend/src/public/command-executor.js`, `frontend/src/public/command-completion.js`, `frontend/src/public/command-send-safety-controller.js`, and `frontend/src/public/slash-workflow-source-adapter.js`, covering declarative-provider failure handling, alias/direct-target ambiguity, typed help/usage edge cases, grouped send-risk branches, replay/paste/share command interactions, and workflow-source error paths that still rely too heavily on app-level tests.
4. `QLT-203` Owner `QA`
   Add regression coverage and closeout validation for `v0.4.0-H71`, including deterministic focused suites for the backend contract/session-manager hotspots and the frontend runtime/command-surface hotspots, followed by a full local gate rerun and coverage check on the final tree.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
