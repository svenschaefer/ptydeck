# Codex Restart Resend Analysis

## Purpose

This note captures the currently observed restart-resend behavior on the narrow Codex Telegram outbound path and turns it into concrete product constraints for a future fix.

## Current Product Status

As of `v0.4.0-H109`, the first narrow product fix from this analysis is shipped:

- only `codex_separator_summary_sentence` is restart-gated
- Codex sessions created before runtime readiness enter per-session recovery mode
- that summary family is suppressed before `runtime.ready`
- it also stays suppressed through a bounded post-ready quiet window
- it stays suppressed until the first fresh post-restart input for the same session
- delivered summary candidates are persisted in a resend ledger keyed by normalized summary content plus session/thread context

The stronger analysis conclusions below still matter because they explain why this gate is deliberately narrow and why `codex_separator_info` / `codex_separator_section` remain outside the recovery layer until there is equally strong evidence for those families too.

The focus here is analytical only:

- what actually gets resent around backend restart
- why those messages are not just ordinary duplicates
- which suppression strategies are sufficient or insufficient
- what a clean product design for restart-resend prevention should look like

No runtime behavior is changed by this note.

## Evidence Base

The findings here are based on:

- live backend debug log: `/tmp/ptydeck-backend-debug.log`
- the analysis helper:
  - `scripts/analyze-restart-resends.mjs`
- secondary corroboration only when useful:
  - `/tmp/ptydeck-session-stream-analysis.jsonl`
  - `/ready`

The helper compares delivered Telegram events around recent `runtime.ready` markers against previously delivered events for the same session/thread/scope/text.

Example usage:

```bash
node scripts/analyze-restart-resends.mjs \
  --restart-count 3 \
  --startup-lookback-seconds 180 \
  --post-ready-seconds 120
```

## Source Reliability

The evidence base is strong enough for restart-resend design work, but the sources are not equally trustworthy for this specific problem.

- Primary source: `/tmp/ptydeck-backend-debug.log`
  - This is the authoritative source for restart-resend analysis because it contains `runtime.ready`, `messaging.event.trace`, delivery outcomes, scopes, thread ids, and stable timestamps in one place.
- Secondary source: `/tmp/ptydeck-session-stream-analysis.jsonl`
  - This remains useful for block and section semantics, but it rotates and does not retain enough long-horizon history to prove restart resend bursts by itself.
- Runtime health/readiness endpoints
  - These are useful for current process state and counters, but not as the historical causality record for restart-resend bursts.

The current restart-resend findings should therefore be treated as debug-log-driven, not raw-capture-driven.

## Current Measured Behavior

The latest measured restart window was:

- `readyAt`: `2026-04-12T08:53:42.414Z`
- analysis window:
  - `2026-04-12T08:50:42.414Z` to `2026-04-12T08:55:42.414Z`

Observed delivered allowlist events in that window:

- total delivered: `42`
- before `runtime.ready`: `40`
- after `runtime.ready`: `2`
- prior-history matches from the previous process window: `41`
- before the first new inbound operator input in the same session: `42`

Representative examples from that restart burst:

- `updated and aligned all markdown files to us english, with clear separation`
- `updated and synchronized the three files with current validated state.`
- `completed next unblocked cycle and pushed.`
- `completed. i finished all previously open short-term cycles (39.7, 39.8, 39.9)`
- `updated to describe the delivered manager surface rather than the planned one.`

Those texts had already been delivered roughly `0.1h` earlier in the previous process window, then reappeared again during the next restart burst.

The immediately previous analyzed restart window showed another important fact:

- `readyAt`: `2026-04-12T07:47:22.354Z`
- delivered in startup window: `49`
- before `runtime.ready`: `46`
- after `runtime.ready`: `3`
- prior-history matches: `0`

This matters because it proves that a persisted prior-history check alone is not sufficient. The first restart after a live wave can still flood old content even when there is no earlier allowlist-delivery history to match against.

The latest consistency check also narrowed the currently proven scope of the bug:

- the observed restart resend bursts are evidenced on `codex_separator_summary_sentence`
- they are not yet evidenced on `codex_separator_info`
- they are not yet evidenced on `codex_separator_section`

That matters because the first product fix should stay narrow and target only the summary-family path.

## What This Means

The problem is not just "duplicate messages".

It is specifically:

- a restored Codex session can emit old narrative/status history again during startup
- the current narrow allowlist families treat that replayed output as fresh message-worthy content
- some of those emissions happen before `runtime.ready`
- some continue briefly after `runtime.ready`
- the same texts can then reappear again on later restarts

So the real failure mode is:

- restart-time replay is crossing the delivery boundary as if it were fresh live progress

## Why Single-Point Fixes Are Not Enough

### Strategy A: Suppress Only Before `runtime.ready`

Measured against the latest restart:

- catches `40/42`
- misses `2/42`

Measured against the previous restart:

- catches `46/49`
- misses `3/49`

Conclusion:

- pre-ready suppression is necessary
- but not sufficient

### Strategy B: Prior-History Dedupe Only

Measured against the latest restart:

- catches `41/42`

Measured against the previous restart:

- catches `0/49`

Conclusion:

- history dedupe is useful on later restarts
- but it does nothing for the first restart burst after a feature starts delivering

### Strategy C: Require Prior Match and No New Input

Measured against the latest restart:

- catches `41/42`

Measured against the previous restart:

- catches `0/49`

Conclusion:

- gating on "before first new input" is directionally correct
- but still insufficient without an explicit startup quiet phase

## Clean Product Strategy

The fix should not be another ad hoc regex or per-family patch.

It should be a dedicated delivery-admission layer for restart recovery.

### 1. Add a Global Startup Quiet Phase

For the currently evidenced summary-family path:

- `codex_separator_summary_sentence`

do not deliver anything until:

- `runtime.ready + startupResendQuietMs`

The observed windows show that the quiet phase must extend past `runtime.ready`, not stop at it.

### 2. Add a Persisted Restart-Resend Ledger

Persist per delivered Telegram candidate:

- session id
- topic/thread id
- delivery scope
- stable normalized content hash
- delivered timestamp

This ledger must survive backend restart.

Purpose:

- if old Codex text is emitted again after restart, the delivery layer can recognize it as previously delivered content even though all in-memory dedupe state was lost

### 3. Treat Restart Recovery as a Separate Session State

Each mapped session/topic should enter a bounded restart-recovery mode after backend restart.

That mode should end only when there is evidence of fresh live progress, for example:

- the startup quiet phase has ended
- and either:
  - a new operator input for that session/topic arrived
  - or a candidate is genuinely novel against the persisted resend ledger

Until then:

- old matching candidates should be suppressed as `restart_resend`

### 4. Use Stable Restart-Resend Keys

Current raw block keys such as sequence-based anchors are not stable across restarts.

For restart-resend prevention, the stable key should be based on:

- scope
- mapped session/topic identity
- normalized content hash

That key should be independent of per-process chunk/anchor sequence numbers.

### 5. Keep Candidate Generation and Delivery Admission Separate

The current narrow evaluators are still useful.

The clean model is:

1. generate candidate
2. apply normal allowlist policy
3. apply restart-recovery admission guard
4. only then deliver

This prevents restart-specific logic from contaminating the content-evaluator rules themselves.

## Recommended Fix Order

1. global startup quiet-phase guard for `codex_separator_summary_sentence`
2. persisted resend ledger with stable content-based keys
3. per-session restart-recovery admission state
4. regression replay against real restart windows from the debug log

## Decision

The evidence supports a combined strategy, not a single heuristic:

- startup quiet phase
- plus persisted resend ledger
- plus per-session restart-recovery gating

Anything weaker will either:

- miss the first restart burst
- or miss later replays after process memory resets

The first implementation should stay narrow:

- target only `codex_separator_summary_sentence`
- leave `codex_separator_info` untouched until there is equally strong evidence that restart-time replay crosses its delivery boundary
- leave `codex_separator_section` untouched until there is equally strong evidence that restart-time replay crosses its delivery boundary
