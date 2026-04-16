# Terminal Messaging Core Architecture

Last updated: 2026-04-16

## Purpose

This note records the delivered neutral core, terminal projection, runtime orchestration, projection-backed semantic extraction, semantic-adapter extraction, second semantic-adapter baseline, Telegram delivery-adapter cutover, Discord reference delivery-adapter follow-up, shadow-mode migration surface, overlapping-output turn-ownership correction, the first neutral allowlist-delivery-signal bridge, the first projection-parity stabilization wave, the shipped signal-first narrow outbound identity follow-up, the later projection-shadow safety suppression, the widened restart-resend protection, the outbound text-integrity correction, and the first runtime-shell cleanup wave for the `v0.4.0-H128` stream-to-message refactor plus its post-baseline follow-ups.

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

`MSG-083` through `MSG-088` are now delivered and form the shipped `H128` baseline. `MSG-089` through `MSG-096` are now also delivered as the first post-`H128` baseline-extension steps, `MSG-097` through `MSG-099` are now delivered as the first overlapping-output ownership correction on top of that baseline, `v0.4.0-H135 / MSG-029` now ships the first signal-first outbound follow-up on top of the same neutral `MessageIntent` seam, `v0.4.0-H137 / MSG-102` through `MSG-105` now stabilize the migration surface around parity evidence, restart quarantine, deferred turn admission, and quiet-boundary settlement safety, `v0.4.0-H138 / MSG-106` through `MSG-107` now make the remaining shipped narrow outbound identity signal-first in policy, trace, and summary restart-ledger handling, `v0.4.0-H139 / MSG-108` through `MSG-110` now suppress the latest live projection-shadow false-delivery classes while `legacy` remains the shipped semantic primary mode, `v0.4.0-H140 / MSG-111` through `MSG-112` now widen restart-resend protection across the full shipped narrow outbound family set, `v0.4.0-H141 / MSG-113` through `MSG-114` now restore outbound text continuity by rejecting numeric fragment tails and using bounded tail truncation for structured narrow outbound text, and `v0.4.0-H142 / MSG-115` through `MSG-118` now reduce the remaining runtime-owned legacy shell by extracting the Codex compatibility bridge and commentary/attention classifier seams out of `backend/src/messaging-runtime.js`.

They introduce the neutral core, route the currently shipped narrow Codex allowlist path through it, add a backend terminal-projection layer that runs in parallel with the existing chunk-first heuristics, move the first real `Turn` / `OutputEpisode` runtime state onto that projection seam, make the shipped primary narrow allowlist reply extraction consume projection-backed turn/output-episode runtime snapshots, add a shipped shadow-mode plus cutover-readiness surface so the legacy and projection pipelines can be compared explicitly, move the shipped Codex semantic interpretation behind a real `AppSemanticAdapter` registry seam instead of leaving it embedded in the runtime core, move Telegram delivery behind the real `DeliveryAdapter` seam so thread-policy and formatting decisions are no longer runtime-owned Telegram shortcuts, prove the same semantic registry against a second generic coding-agent baseline that covers Claude-/Gemini-style transcript differences without changing the core, prove the delivery seam itself across both Telegram and a Discord-style reference adapter, and now harden the runtime against overlapping-output ownership leaks by introducing immediate turn-ownership barriers plus delayed quiet-boundary settlement.

Current bridge behavior:

1. the existing legacy Codex allowlist still decides when a candidate is worth delivering
2. that candidate is now first converted into a neutral `MessageIntent`
3. Telegram and Discord delivery now consume that `MessageIntent` directly through `handleMessageIntent(...)`
4. runtime-owned event bridging remains only as compatibility/tracing support around adapter results, not as the primary delivery seam for either adapter
5. narrow allowlist gating is no longer modeled only through legacy `codex_*` scope names; the runtime now also carries neutral delivery signals (`turn-primary-reply`, `output-episode-info`, `output-episode-section`, `output-episode-summary`) alongside legacy scopes so adapters and delivery policy can operate on transport-neutral intent categories without losing compatibility with the shipped trace surface
6. the shipped narrow path now also prefers those neutral delivery signals for policy reasons, runtime trace identity, and restart-resend ledger keys, while the old `codex_*` scope names remain as compatibility metadata for historical analysis and restart-ledger continuity
7. while `legacy` remains the configured semantic primary mode, projection now stays genuinely non-authoritative in shipped runtime delivery, and the semantic-adapter layer explicitly rejects vertically fragmented transcript/diff leftovers, footer metric chrome, and standalone numeric fragment tails before those artifacts can become live `MessageIntent` text
8. restart-resend recovery now guards all shipped narrow outbound families instead of only `output-episode-summary`, and structured narrow outbound truncation now preserves a continuous prefix plus ellipsis instead of deleting an arbitrary middle block to keep the tail visible

Current semantic extraction behavior:

1. submit-bearing turns now derive their primary reply candidate from projection transcript-delta plus stable diff state instead of the legacy first-hit line path
2. short but correct replies no longer depend on the former minimum-length/minimum-word gates before they can become `MessageIntent` text
3. autonomous coding-agent output can now fall back to one projection-backed multiline `OutputEpisode` intent when quiet completion occurs without a legacy separator-family delivery already claiming the episode

Current terminal projection behavior:

1. the backend now feeds the observed PTY byte stream into `@xterm/headless`
2. the runtime keeps one bounded projection tracker per active session stream
3. the tracker exposes deterministic snapshot, baseline, bounded transcript-delta, and snapshot-diff primitives
4. the current `MessageIntent` bridge now derives its `TerminalProjection` descriptor from the live projection snapshot instead of from a purely synthetic legacy candidate stub

Current overlapping-output ownership behavior:

1. a submit-bearing input now opens an explicit ownership barrier if an earlier turn or autonomous episode is still active
2. the barrier closes the earlier ownership range immediately and opens the new turn from a fresh projection baseline
3. stale pre-turn pending/recent lines are carried into the new turn snapshot only for filtering, not for semantic ownership
4. quiet-boundary completion now settles through a bounded grace window and is cancelled if fresh activity resumes before the boundary is semantically stable

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

The currently shipped delivery descriptors are:

- `telegram`
- `discord`

The currently shipped narrow allowlist delivery signals are:

- `turn-primary-reply`
- `output-episode-info`
- `output-episode-section`
- `output-episode-summary`

This is intentional. `MSG-083` introduced the neutral boundaries, `MSG-084` introduced the first live projection seam, `MSG-085` introduced live turn/output-episode orchestration on top of that seam, `MSG-086` moved the first shipped semantic extraction onto those boundaries, `MSG-087` plus `MSG-088` complete the migration/cutover surface by adding shadow-mode comparison and explicit parity validation, `MSG-089` plus `MSG-090` move the shipped Codex semantic logic behind the first real `AppSemanticAdapter` registry seam, `MSG-091` plus `MSG-092` move the shipped Telegram delivery behavior behind the first real `DeliveryAdapter` seam, `MSG-093` plus `MSG-094` prove the same semantic registry with a second generic coding-agent baseline for non-Codex coding-agent sessions, `MSG-095` plus `MSG-096` prove the same delivery seam with a second concrete transport adapter without changing the runtime core, `H135` begins moving the shipped narrow allowlist itself from legacy family-name gating toward neutral signal-first delivery categories, `H138` continues that same path by making policy reasons, trace identity, and summary restart-ledger keys signal-first while retaining legacy scope compatibility metadata, and `H142` removes the remaining runtime-owned legacy helper/control shell from the core by moving compatibility translation and commentary/attention classification behind explicit seams.

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
3. after `H136`, the shipped default is intentionally `legacy` primary with projection kept in shadow until parity is field-proven
4. the other candidate is recorded as shadow evidence when shadow mode is enabled
5. runtime traces now include bounded `terminal.semantic.compare` entries
6. `buildStatusSummary().terminalMessagingCore.semanticExtraction` now reports:
   - primary mode
   - shadow target mode
   - comparison totals
   - comparison-class counts by overall, `mismatched`, `primary_only`, and `shadow_only`
   - mismatch rate
   - cutover readiness
7. `buildStatusSummary().terminalMessagingCore.semanticAdapterIds` now reports the currently registered semantic-adapter ids

The runtime now also ships explicit comparison classes for parity triage:

- `restart_remount_noise`
- `overlay_working_noise`
- `overlapping_turn_ownership`
- `premature_quiet_boundary`
- `semantic_adapter_divergence`

The companion helper `scripts/analyze-terminal-semantic-shadow.mjs` can cluster those classes from shipped `messaging.semantic.shadow` debug events and `terminal.semantic.compare` trace entries so projection follow-up work can be driven from stable evidence instead of ad hoc live-log reading.

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
- provide one delivery adapter per future channel beyond the shipped Telegram and Discord adapters
- remove every remaining legacy Codex compatibility concern from the product; `codex_*` scope metadata and the bounded `legacy-codex-allowlist` bridge still exist for shipped compatibility, restart-ledger continuity, and historical trace interpretation even though the runtime core no longer owns those helper flows directly

Those are future extension points on top of the shipped `H128` baseline, not missing prerequisites for the core architecture itself.

The latest 2026-04-16 hardening pass and `H142` cleanup moved the remaining coding-agent commentary/attention ballast behind an explicit classifier seam. Ordinary operational coding-agent status blocks are no longer suppressed merely because they mention debug logs, current runtime/code state, or explanatory `failed` wording inside structured bullets. That confirms the core direction is sound, but it also confirms the end-state is not yet "no legacy ballast at all"; the product still keeps a bounded compatibility bridge and legacy scope metadata while the shipped narrow path remains backward-compatible.

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
- overlapping-output cases now install an ownership barrier so a newly submitted turn cannot inherit already-running output from the prior turn or episode
- quiet-boundary completion now waits through a bounded settlement window and is cancelled if `session.activity.started` resumes before the boundary is semantically final

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

After `MSG-083` through `MSG-088` plus the shipped post-baseline follow-ups through `H142`, ptydeck now has:

1. a neutral transport/app-independent messaging core
2. a shipped backend terminal-state projection
3. explicit turn and autonomous-output orchestration
4. projection-backed semantic extraction for the narrow shipped path
5. a real semantic-adapter registry with the first shipped Codex adapter
6. real Telegram and Discord `DeliveryAdapter` seams that consume adapter-neutral `MessageIntent` objects directly
7. cross-adapter parity proof that the same `MessageIntent` output can drive more than one transport
8. a shadow-mode and cutover-readiness surface for migration control
9. explicit turn-ownership barriers and boundary-settlement semantics for overlapping-output cases
10. explicit compatibility seams for the remaining legacy Codex allowlist bridge and coding-agent runtime classification instead of leaving those concerns embedded in the runtime core

The same baseline now also exposes neutral allowlist delivery signals through runtime and adapter status (`allowlistDeliverySignals`) in addition to the historic compatibility scopes (`allowlistDeliveryScopes`). After `H138`, the shipped runtime also prefers those neutral signals inside policy reasons, trace identity, and summary restart-ledger keys rather than only surfacing them as side-channel metadata.

That is the stable architectural baseline future adapter and app-specific follow-ups should extend, with both a concrete Codex semantic adapter and a second generic coding-agent adapter already proving that the registry can grow without reopening the core.
