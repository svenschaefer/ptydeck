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
2. `UX-027A` Owner `BE`
   Add a replay-excerpt extraction foundation that can produce normalized visible-text slices from a single source session using explicit selectors `l:N`, `c:N`, and `sp:N`, where `sp:N` is only available when shell-block boundaries are known robustly enough to return complete prompt-plus-command-plus-output blocks instead of relying on ad-hoc visible-prompt regex guesses.
3. `UX-027B` Owner `FE`
   Add slash-command support for replay-based cross-session clipboard relay with `/replay preview <sourceSelector> <sliceSelector>`, `/replay copy <sourceSelector> <sliceSelector>`, and `/replay paste <sourceSelector> <targetSelector> <sliceSelector>`, plus a compact `/ccp <sourceSelector> <targetSelector> <sliceSelector>` alias for the paste form so the feature stays consistent with the existing slash-command plane instead of introducing a separate UI surface.
4. `UX-027C` Owner `FE`
   Route `/replay paste` and `/ccp` through the existing target-session paste/send path so target send terminators, send-safety rules, multi-device controller gating, reclaim-and-retry behavior, and future paste-observation handling remain identical to ordinary terminal-local paste, while command feedback reports exact selector resolution, truncation, unavailable `sp:N` support, and actual copied or pasted size.
5. `UX-027D` Owner `QA`
   Add regression coverage and closeout validation for replay-based clipboard relay, including `l:N`, `c:N`, and `sp:N` selector parsing, explicit failure when `sp:N` is unavailable, preview/copy/paste command behavior, `/ccp` alias parity, target-session guard/reclaim interaction, and no ANSI/control-sequence leakage into copied or pasted visible-text excerpts.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
