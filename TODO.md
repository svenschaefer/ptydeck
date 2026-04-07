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
   Validate `feature/h62-multi-device-control-foundation` from at least one second LAN client under the real hostnames (`https://ptydeck.local.secos.rocks` and `https://api.ptydeck.local.secos.rocks`), including frontend boot, browser-local startup-backup creation and verification, trusted-local device identity persistence, REST bearer auth, WebSocket ticket flow, and deterministic controller reclaim between two attached clients.
2. `MDT-017` Owner `BE`
   Replace the current owner-gated and release-first trusted-local takeover behavior with deterministic single-user operator lease handoff semantics so any active non-spectator trusted-local device can take or reclaim control without a prior release, and repeated take or reclaim requests converge idempotently instead of requiring multiple clicks.
3. `MDT-018` Owner `BE`
   Add scope-aware trusted-local control claim operations for `all sessions`, `current deck`, and `current session`, with attach-aware retry and conflict-safe sequencing so startup takeover and cross-device handoff do not depend on fragile per-session client timing.
4. `MDT-019` Owner `FE`
   Add a subtle trusted-local startup takeover prompt plus an anytime trigger that can take control for `all sessions`, `current deck`, or `current session` without inflating the UI, and make blocked write paths offer immediate `Take Control and retry` actions instead of passive read-only failures.
5. `MDT-020` Owner `FE`
   Add automatic device-local layout and terminal-size recall on successful take or reclaim control, including first-use baseline capture for previously unseen devices, while keeping layout state local to the claiming device and avoiding cross-device layout fights.
6. `MDT-021` Owner `QA`
   Add repeated two-device trusted-local handoff regression coverage without prior release, including startup takeover confirmation, all-session and deck-scoped takeover, blocked-write retry, automatic device-local layout recall, and reclaim stability across rapid desktop-to-notebook switching.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
