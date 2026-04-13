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
- [ ] `MSG-068` Owner `BE`: Introduce a Codex pre-classification block-assembly state machine ahead of the current outbound families so large relevant stream blocks no longer live or die on the first chunk. The new path must open a provisional block from substantial Codex output even when the first chunk is contaminated by inline prompt/footer chrome, assemble across a short bounded multi-chunk window, strip or isolate redraw/prompt/working noise during assembly, and keep the block alive across short transient non-content fragments instead of rejecting it immediately.
- [ ] `MSG-069` Owner `BE`: Rewire Codex outbound family classification to consume assembled blocks instead of first-line/first-chunk fragments. Add soft-end semantics so prompt boundaries, inline chrome, transient `attention_required`/`status_update` side signals, and short overlay noise do not prematurely terminate a still-coherent block, while separator anchors remain strong hints rather than the only viable start condition for a relevant Codex message block.
- [ ] `MSG-070` Owner `QA`: Validate the `v0.4.0-H119` block-assembly wave end to end against the observed post-13:00 `ptydeck` `H118 is delivered and pushed.` case and adjacent live captures, proving large multiline Codex closing comments survive contaminated starts and transient noise as one bounded relevant block, while no-regression coverage keeps low-value chatter, restart-resend protections, and the existing narrow allowlist families under control.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
