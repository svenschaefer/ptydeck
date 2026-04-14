# Terminal Messaging Core Architecture

Last updated: 2026-04-14

## Purpose

This note records the delivered neutral core, terminal projection, runtime orchestration, projection-backed semantic extraction, semantic-adapter extraction, second semantic-adapter baseline, Telegram delivery-adapter cutover, and shadow-mode migration surface for the `v0.4.0-H128` stream-to-message refactor plus its first post-baseline follow-ups.

The goal is to stop treating Telegram- and Codex-specific heuristics as the primary runtime model for terminal messaging. Instead, ptydeck now has an explicit neutral contract layer that can later support multiple delivery adapters and multiple terminal apps without rebuilding the parser and delivery seams per integration.

## Delivered Contract Boundaries

The backend now defines the following explicit neutral contracts in `backend/src/terminal-messaging-core.js`:

- `TerminalProjection`
  - normalized representation of terminal-derived state or candidate source material
- `Turn`
  - bounded output window associated with a submit-bearing input
- `OutputEpisode`
  - bounded autonomous output window not owned by a submit-bearing input
- `MessageIntent`
  - adapter-neutral semantic outbound payload derived from a turn or output episode
- `DeliveryAdapter`
  - normalized outbound-channel descriptor
- `AppSemanticAdapter`
  - normalized app-specific interpretation descriptor

These contracts are deliberately transport-neutral and app-neutral.

They are intended to be reusable for:

- delivery adapters such as Telegram, Discord, Slack, and future channels
- terminal apps such as Codex, Claude Code CLI, Gemini Code CLI, and future producers

## What Is Shipped Today

`MSG-083` through `MSG-088` are now delivered and form the shipped `H128` baseline. `MSG-089` through `MSG-094` are now also delivered as the first post-`H128` baseline-extension steps.

They introduce the neutral core, route the currently shipped narrow Codex allowlist path through it, add a backend terminal-projection layer that runs in parallel with the existing chunk-first heuristics, move the first real `Turn` / `OutputEpisode` runtime state onto that projection seam, make the shipped primary narrow allowlist reply extraction consume projection-backed turn/output-episode runtime snapshots, add a shipped shadow-mode plus cutover-readiness surface so the legacy and projection pipelines can be compared explicitly, move the shipped Codex semantic interpretation behind a real `AppSemanticAdapter` registry seam instead of leaving it embedded in the runtime core, move Telegram delivery behind the real `DeliveryAdapter` seam so thread-policy and formatting decisions are no longer runtime-owned Telegram shortcuts, and then prove the same semantic registry against a second generic coding-agent baseline that covers Claude-/Gemini-style transcript differences without changing the core.

Current bridge behavior:

1. the existing legacy Codex allowlist still decides when a candidate is worth delivering
2. that candidate is now first converted into a neutral `MessageIntent`
3. Telegram delivery now consumes that `MessageIntent` directly through `handleMessageIntent(...)`
4. runtime-owned event bridging remains only as compatibility/tracing support around adapter results, not as the primary Telegram delivery seam

Current semantic extraction behavior:

1. submit-bearing turns now derive their primary reply candidate from projection transcript-delta plus stable diff state instead of the legacy first-hit line path
2. short but correct replies no longer depend on the former minimum-length/minimum-word gates before they can become `MessageIntent` text
3. autonomous coding-agent output can now fall back to one projection-backed multiline `OutputEpisode` intent when quiet completion occurs without a legacy separator-family delivery already claiming the episode

Current terminal projection behavior:

1. the backend now feeds the observed PTY byte stream into `@xterm/headless`
2. the runtime keeps one bounded projection tracker per active session stream
3. the tracker exposes deterministic snapshot, baseline, bounded transcript-delta, and snapshot-diff primitives
4. the current `MessageIntent` bridge now derives its `TerminalProjection` descriptor from the live projection snapshot instead of from a purely synthetic legacy candidate stub

This means the runtime now has a first-class semantic seam between:

- terminal-derived candidate interpretation
- adapter-facing outbound delivery

and a first-class terminal-state seam between:

- raw PTY bytes
- stable terminal projection state
- later semantic extraction work

without discarding the ability to compare the old and new pipelines while the runtime remains feature-flagged.

## Current Bridge Shape

The current bridge in `backend/src/messaging-runtime.js` models:

- reply-family candidates as:
  - `TerminalProjection` + `Turn` + `MessageIntent`
- autonomous allowlist candidates as:
  - `TerminalProjection` + `OutputEpisode` + `MessageIntent`

The first shipped semantic bridge now resolves through a real semantic-adapter registry:

- `legacy-codex-allowlist`
- semantic adapter id: `codex-semantic-adapter`
- semantic adapter id: `generic-coding-agent-semantic-adapter`

The first shipped delivery descriptor is:

- `telegram`

This is intentional. `MSG-083` introduced the neutral boundaries, `MSG-084` introduced the first live projection seam, `MSG-085` introduced live turn/output-episode orchestration on top of that seam, `MSG-086` moved the first shipped semantic extraction onto those boundaries, `MSG-087` plus `MSG-088` complete the migration/cutover surface by adding shadow-mode comparison and explicit parity validation, `MSG-089` plus `MSG-090` move the shipped Codex semantic logic behind the first real `AppSemanticAdapter` registry seam, `MSG-091` plus `MSG-092` move the shipped Telegram delivery behavior behind the first real `DeliveryAdapter` seam, and `MSG-093` plus `MSG-094` now prove the same semantic registry with a second generic coding-agent baseline for non-Codex coding-agent sessions.

## Shadow Mode and Cutover Status

The runtime now exposes a shipped migration surface instead of relying on one irreversible cutover:

- `MESSAGING_TERMINAL_SEMANTIC_PRIMARY_MODE`
  - `projection` or `legacy`
- `MESSAGING_TERMINAL_SEMANTIC_SHADOW_MODE_ENABLED`
- `MESSAGING_TERMINAL_SEMANTIC_CUTOVER_MIN_COMPARISONS`
- `MESSAGING_TERMINAL_SEMANTIC_CUTOVER_MAX_MISMATCH_RATE`

Current shipped behavior:

1. turn replies can build comparable legacy and projection candidates side by side
2. only the configured primary mode dispatches by default
3. the other candidate is recorded as shadow evidence when shadow mode is enabled
4. runtime traces now include bounded `terminal.semantic.compare` entries
5. `buildStatusSummary().terminalMessagingCore.semanticExtraction` now reports:
   - primary mode
   - shadow target mode
   - comparison totals
   - mismatch rate
   - cutover readiness
6. `buildStatusSummary().terminalMessagingCore.semanticAdapterIds` now reports the currently registered semantic-adapter ids

## Why This Matters

Before this slice, `dispatchCodexAllowlistCandidate(...)` effectively jumped straight from a Codex-specific legacy candidate to an adapter-facing event.

After these slices, the runtime has:

- an explicit adapter-neutral semantic object in the middle
- a backend-owned terminal projection seam
- a runtime-owned `Turn` / `OutputEpisode` orchestration seam on top of that projection

That is the minimum necessary step before later multi-app and multi-transport follow-ups can safely move toward:

- backend terminal projection
- semantic extraction from real turns
- semantic extraction from real output episodes
- stable diff plus bounded transcript extraction
- shadow-mode dual-run comparison

## What This Architecture Does Not Claim

This architecture does not claim that the stream-to-message problem is solved for every future adapter or terminal app.

It does not yet:

- eliminate every remaining legacy separator-family dependency for autonomous narrow allowlist delivery
- provide one app-semantic adapter per future terminal app beyond the shipped Codex adapter
- provide one delivery adapter per future channel beyond the shipped Telegram adapter

Those are future extension points on top of the shipped `H128` baseline, not missing prerequisites for the core architecture itself.

## Projection Baseline Now Shipped

The shipped projection seam lives in `backend/src/terminal-projection.js`.

It currently provides:

- bounded geometry, scrollback, transcript, and diff resource limits
- `TerminalProjectionSnapshot`
- `TerminalProjectionBaseline`
- `TerminalProjectionTranscriptDelta`
- `TerminalProjectionDiff`

The runtime currently exposes those primitives through:

- `captureTerminalProjectionSnapshot(sessionId)`
- `createTerminalProjectionBaseline(sessionId, label)`
- `getTerminalProjectionTranscriptDelta(sessionId, sinceRevision)`
- `diffTerminalProjectionBaseline(sessionId, baseline, options)`

This is the stable backend-owned state seam that the shipped `Turn` and `OutputEpisode` orchestration now builds on.

## Runtime Orchestration Now Shipped

`backend/src/messaging-runtime.js` now also owns explicit runtime orchestration state on top of the projection:

- submit-bearing input opens a bounded `Turn`
- the turn captures a pre-turn projection baseline
- autonomous visible output without an active turn opens a bounded `OutputEpisode`
- both keep bounded transcript-delta and snapshot-diff context through the live projection seam
- both settle only once the runtime reaches `session.activity.completed` and the corresponding quiet-window callback path

The runtime currently exposes that orchestration seam through:

- `captureTerminalOrchestrationState(sessionId)`
- `buildStatusSummary().terminalMessagingCore.activeTurnSessionCount`
- `buildStatusSummary().terminalMessagingCore.completedTurnSessionCount`
- `buildStatusSummary().terminalMessagingCore.activeOutputEpisodeSessionCount`
- `buildStatusSummary().terminalMessagingCore.completedOutputEpisodeSessionCount`

## Projection-Backed Semantic Extraction Now Shipped

`backend/src/messaging-runtime.js` now uses the projection/orchestration seam as the primary source for narrow allowlist turn replies:

- turn replies derive their semantic text from bounded transcript-delta plus stable diff state
- working overlays, prompt/footer tails, input echo, separator-only fragments, commentary-like lines, and stale baseline residue are filtered before a `MessageIntent` is emitted
- short but correct replies such as `Ok, verstanden` can now survive the semantic extractor without the former minimum-length/minimum-word gate blocking them
- autonomous coding-agent multiline output can now fall back to one projection-backed `codex_separator_section` or `codex_separator_info` intent if the episode reaches quiet completion without a legacy separator-family delivery having already claimed it

This means the most failure-prone reply path is no longer driven primarily by first-hit PTY line/chunk heuristics, and the migration path away from the legacy reply model is now observable rather than blind.

## Resulting Baseline

After `MSG-083` through `MSG-088`, ptydeck now has:

1. a neutral transport/app-independent messaging core
2. a shipped backend terminal-state projection
3. explicit turn and autonomous-output orchestration
4. projection-backed semantic extraction for the narrow shipped path
5. a real semantic-adapter registry with the first shipped Codex adapter
6. a real Telegram `DeliveryAdapter` seam that consumes adapter-neutral `MessageIntent` objects directly
7. a shadow-mode and cutover-readiness surface for migration control

That is the stable architectural baseline future adapter and app-specific follow-ups should extend, with both a concrete Codex semantic adapter and a second generic coding-agent adapter already proving that the registry can grow without reopening the core.
