# Terminal Messaging Core Architecture

Last updated: 2026-04-14

## Purpose

This note records the delivered neutral-core and terminal-projection foundation for the `v0.4.0-H128` stream-to-message refactor.

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

`MSG-083` and `MSG-084` still do not replace the old stream parser.

They introduce the neutral core, route the currently shipped narrow Codex allowlist path through it, and add a backend terminal-projection layer that runs in parallel with the existing chunk-first heuristics.

Current bridge behavior:

1. the existing legacy Codex allowlist still decides when a candidate is worth delivering
2. that candidate is now first converted into a neutral `MessageIntent`
3. only then is it bridged into the existing messaging event and delivery-policy path

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

without changing the shipped delivery policy behavior in the same slice.

## Current Bridge Shape

The current bridge in `backend/src/messaging-runtime.js` models:

- reply-family candidates as:
  - `TerminalProjection` + `Turn` + `MessageIntent`
- autonomous allowlist candidates as:
  - `TerminalProjection` + `OutputEpisode` + `MessageIntent`

The first shipped semantic bridge still uses a Codex-specific strategy label:

- `legacy-codex-allowlist`

The first shipped delivery descriptor is:

- `telegram`

This is intentional. `MSG-083` introduced the neutral boundaries, `MSG-084` introduced the first live projection seam, and `MSG-085` through `MSG-086` will move more of the runtime onto those boundaries.

## Why This Matters

Before this slice, `dispatchCodexAllowlistCandidate(...)` effectively jumped straight from a Codex-specific legacy candidate to an adapter-facing event.

After this slice, the runtime has an explicit adapter-neutral semantic object in the middle.

That is the minimum necessary step before the larger refactor can safely move toward:

- backend terminal projection
- turn-first orchestration
- output-episode modeling
- stable diff plus bounded transcript extraction
- shadow-mode dual-run comparison

## What This Slice Does Not Claim

This slice does not yet solve the central stream-to-message correctness problem.

It does not yet:

- replace chunk-first interpretation
- make turn replies or autonomous output depend on the projection
- replace current delivery decisions with projection-derived semantics
- replace the current primary Codex allowlist heuristics

Those remain the next steps in `H128`.

## Next Steps

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

This is the stable backend-owned state seam that later `Turn` and `OutputEpisode` orchestration can build on.

## Next Steps

The next implementation slices are now:

1. `MSG-085`
   - turn-first and output-episode orchestration on top of that projection
2. `MSG-086`
   - adapter-neutral semantic extraction from turns and episodes
3. `MSG-087`
   - shadow mode and feature-flagged cutover
4. `MSG-088`
   - full end-to-end validation against known field failures
