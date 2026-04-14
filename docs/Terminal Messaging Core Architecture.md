# Terminal Messaging Core Architecture

Last updated: 2026-04-14

## Purpose

This note records the delivered neutral core, terminal projection, runtime orchestration, and first projection-backed semantic extraction for the `v0.4.0-H128` stream-to-message refactor.

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

`MSG-083` through `MSG-086` still do not complete the full migration, but they now replace the most failure-prone primary reply seam.

They introduce the neutral core, route the currently shipped narrow Codex allowlist path through it, add a backend terminal-projection layer that runs in parallel with the existing chunk-first heuristics, move the first real `Turn` / `OutputEpisode` runtime state onto that projection seam, and make the shipped primary narrow allowlist reply extraction consume projection-backed turn/output-episode runtime snapshots.

Current bridge behavior:

1. the existing legacy Codex allowlist still decides when a candidate is worth delivering
2. that candidate is now first converted into a neutral `MessageIntent`
3. only then is it bridged into the existing messaging event and delivery-policy path

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

This is intentional. `MSG-083` introduced the neutral boundaries, `MSG-084` introduced the first live projection seam, `MSG-085` introduced live turn/output-episode orchestration on top of that seam, and `MSG-086` has now moved the first shipped semantic extraction onto those boundaries while `MSG-087` remains the migration/cutover slice.

## Why This Matters

Before this slice, `dispatchCodexAllowlistCandidate(...)` effectively jumped straight from a Codex-specific legacy candidate to an adapter-facing event.

After these slices, the runtime has:

- an explicit adapter-neutral semantic object in the middle
- a backend-owned terminal projection seam
- a runtime-owned `Turn` / `OutputEpisode` orchestration seam on top of that projection

That is the minimum necessary step before the larger refactor can safely move toward:

- backend terminal projection
- semantic extraction from real turns
- semantic extraction from real output episodes
- stable diff plus bounded transcript extraction
- shadow-mode dual-run comparison

## What This Slice Does Not Claim

This slice does not yet solve the central stream-to-message correctness problem.

It does not yet:

- remove the remaining legacy separator-family evaluator from autonomous narrow allowlist delivery
- run the legacy and projection-first pipelines in shipped shadow mode side by side
- replace current delivery policy cutover with a feature-flagged migration path

Those remain the next steps in `H128`.

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

This means the most failure-prone reply path is no longer driven primarily by first-hit PTY line/chunk heuristics, even though the full `H128` migration is not complete yet.

## Next Steps

The next implementation slices are now:

1. `MSG-087`
   - shadow mode and feature-flagged cutover
2. `MSG-088`
   - full end-to-end validation against known field failures and dual-run parity
