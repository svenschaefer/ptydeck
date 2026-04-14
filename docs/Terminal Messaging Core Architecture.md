# Terminal Messaging Core Architecture

Last updated: 2026-04-14

## Purpose

This note records the first delivered neutral core for the `v0.4.0-H128` stream-to-message refactor.

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

`MSG-083` does not yet replace the old stream parser.

It introduces the neutral core and routes the currently shipped narrow Codex allowlist path through it.

Current bridge behavior:

1. the existing legacy Codex allowlist still decides when a candidate is worth delivering
2. that candidate is now first converted into a neutral `MessageIntent`
3. only then is it bridged into the existing messaging event and delivery-policy path

This means the runtime now has a first-class semantic seam between:

- terminal-derived candidate interpretation
- adapter-facing outbound delivery

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

This is intentional. `MSG-083` introduces the neutral boundaries first, while `MSG-084` through `MSG-086` will move more of the runtime onto those boundaries.

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
- introduce `@xterm/headless`
- provide stable screen diff extraction
- provide bounded transcript delta extraction
- replace the current primary Codex allowlist heuristics

Those remain the next steps in `H128`.

## Next Steps

The next implementation slices are:

1. `MSG-084`
   - backend terminal projection with explicit retention/resource rules
2. `MSG-085`
   - turn-first and output-episode orchestration on top of that projection
3. `MSG-086`
   - adapter-neutral semantic extraction from turns and episodes
4. `MSG-087`
   - shadow mode and feature-flagged cutover
5. `MSG-088`
   - full end-to-end validation against known field failures
