# Restart Streaming Analysis

## Purpose

This note captures the observed restart-time streaming behavior of the current `ptydeck` runtime so later Telegram adapter work can start from an accurate model instead of another round of symptom-driven tuning.

The focus here is strictly analytical:

- what a backend restart looks like from the perspective of restored PTY sessions
- which runtime and frontend events are emitted during that phase
- when the messaging layer already classifies restart-time events as message-worthy
- why the restart phase is structurally flood-prone even when outbound delivery is hard-disabled

## Evidence Base

The findings in this document are based on:

- live backend debug log: `/tmp/ptydeck-backend-debug.log`
- live `/health` messaging summary and trace rings
- source inspection of:
  - `backend/src/runtime.js`
  - `backend/src/session-manager.js`
  - `backend/src/messaging-runtime.js`
  - `backend/src/telegram-adapter.js`

The concrete restart window analyzed here is:

- `2026-04-11T20:22:29.000Z` to `2026-04-11T20:22:46.999Z`

## Helper Script

To make the restart analysis reproducible, the repository now includes:

- `scripts/analyze-restart-streaming.mjs`

Example usage:

```bash
node scripts/analyze-restart-streaming.mjs \
  --start 2026-04-11T20:22:29.000Z \
  --end 2026-04-11T20:22:46.999Z
```

The script parses the debug log, filters one restart window, and summarizes:

- HTTP request volume
- session event volume
- messaging event volume
- per-session timelines
- target validation and topic reuse churn

## High-Level Restart Model

A restart is not a quiet boot followed by later session activity.

Instead, once the backend process comes back and the browser reconnects, the system immediately enters a mixed restore and remount phase with four concurrent layers:

1. runtime restore and startup warmup
2. browser remount traffic against existing sessions
3. session activity state transitions driven by restored PTY output
4. messaging target revalidation and message classification

That means the restart phase already contains enough structure to generate message-worthy events before `runtime.ready` is emitted.

## Measured Restart Window

Observed between `2026-04-11T20:22:29.160Z` and `2026-04-11T20:22:46.471Z`:

- `43` `http.request.start`
- `43` `http.request.done`
- `28` `messaging.target.update`
- `18` `session.event`
- `12` `messaging.event.trace`
- `12` `runtime.startup_warmup.active`
- `11` `persist.save.start`
- `11` `persist.save.ok`
- `5` `messaging.target.ensure`
- `1` `runtime.startup_warmup.quiet_wait`
- `1` `runtime.ready`

Timing from first observed restart-window event:

- `16.31s` until `runtime.startup_warmup.quiet_wait`
- `17.31s` until `runtime.ready`

## Sequence of What Actually Happens

### 1. The browser immediately remounts terminals

The first visible restart-window events are not Telegram-related. They are frontend-originated REST calls such as:

- `OPTIONS /api/v1/sessions/<id>/resize`
- `POST /api/v1/sessions/<id>/resize`
- later also `OPTIONS /api/v1/sessions/<id>/input`
- later also `POST /api/v1/sessions/<id>/input`

This means the restart phase is not only a backend concern. The browser remount itself actively stimulates session traffic.

### 2. Session activity starts almost immediately

As soon as restored PTY output arrives, `session-manager` marks sessions active:

- `session.activity.started`

This comes from `SessionManager.emitSessionActivityStarted()` and is triggered from the PTY data path when cleaned output is observed.

The startup warmup then tracks these active sessions in `runtime.reconcileStartupWarmup()`.

### 3. Session updates trigger messaging lifecycle observation

For restart-time sessions, `session.updated` follows quickly after the first activity burst.

In the analyzed window, the first `session.updated` events appeared within about `100-180ms` after the first `session.activity.started` events.

In `messaging-runtime`, `session.updated` does not produce a generic lifecycle message. It specifically runs `observeControlChange()`, which can produce:

- `session.control.changed`
- summary example: `Control became unclaimed (1 attached client).`

This is already a key restart-noise source because it is caused by session attachment state changes during browser remount, not by meaningful terminal progress.

### 4. Telegram target readiness is rechecked during restart traffic

During the same restart window, the adapter repeatedly logs:

- `target_validated_cached`
- `topic_reused`

The analyzed window contained:

- `14` `target_validated_cached`
- `14` `topic_reused`

For example, one session produced:

- `5` cached target validations
- `5` topic reuses

inside a single restart window.

This is not provisioning failure. It is repeated target resolution and topic reuse during normal restart-time event handling.

### 5. Message classification starts before runtime readiness

Even with Telegram outbound hard-disabled, the messaging layer still records what it would have treated as send-worthy.

In the analyzed window, the messaging layer classified:

- `7` `session.activity.idle`
- `3` `session.control.changed`
- `2` `session.prompt.ready`

Decision reasons were:

- `7` `new:status_update`
- `2` `new:prompt_ready`
- `2` `suppress:noise_idle_after_unclassified_chatter`
- `1` `suppress:noise_idle_after_low_value_chatter`

This is the most important restart insight:

- the restart phase already contains multiple status candidates before `runtime.ready`
- the flooding problem is therefore not only a terminal-output problem
- it is also a restart-state and remount-state classification problem

### 6. Idle events are a major restart-time flood source

A common restart-time sequence per session was:

1. `session.activity.started`
2. `session.updated`
3. `session.control.changed -> new`
4. `session.activity.completed`
5. `session.activity.idle -> new`

This means one restart can generate at least two message-worthy status updates per session before any meaningful operator-facing work has happened.

For some sessions, a later second burst then adds:

6. `session.activity.started`
7. `session.prompt.ready -> new`
8. `session.activity.completed`
9. `session.activity.idle -> suppress`

So even without terminal noise, the restart phase itself can generate:

- control-change chatter
- idle chatter
- prompt-ready chatter

## Per-Session Shape in the Analyzed Window

Observed session patterns:

### `ai-playbooks + playbooks (local runner)`

- `2` activity starts
- `2` updates
- `2` activity completions
- messaging:
  - `1` `session.control.changed -> new`
  - `1` `session.prompt.ready -> new`
  - `1` `session.activity.idle -> new`
  - `1` `session.activity.idle -> suppress`
- target churn:
  - `5` cached validations
  - `5` topic reuses

### `ai-playbooks + codex-runner`

- `1` activity start
- `1` update
- `1` completion
- messaging:
  - `1` `session.control.changed -> new`
  - `1` `session.activity.idle -> new`
- target churn:
  - `3` cached validations
  - `3` topic reuses

### `ai-playbooks + shields (local runner)`

- `2` activity starts
- `2` completions
- messaging:
  - `1` `session.activity.idle -> new`
  - `1` `session.prompt.ready -> new`
  - `1` `session.activity.idle -> suppress`
- target churn:
  - `2` cached validations
  - `2` topic reuses

### `ai-playbooks + ai-playbooks`

- `1` activity start
- `2` updates
- `1` completion
- messaging:
  - `1` `session.control.changed -> new`
  - `1` `session.activity.idle -> new`
- target churn:
  - `4` cached validations
  - `4` topic reuses

### `ptydeck + ptydeck`

Inside this specific restart window, the visible event was only the late completion side:

- `1` activity completion
- `1` idle suppression due to low-value chatter

That does not mean the session was quiet in general. It only means its restart-relevant activity fell later in the warmup window and did not emit the earlier control/prompt sequence seen on some other sessions.

## Why Restart Is Flood-Prone

### Structural reason 1: frontend remount generates traffic immediately

The browser starts resize and input calls against restored sessions almost immediately after backend restart.

That traffic is sufficient to stimulate PTY activity, session activity transitions, and updated session metadata before the runtime is considered ready.

### Structural reason 2: startup warmup does not suppress message classification

`runtime.startup_warmup` delays `runtime.ready`, but it does not itself prevent messaging classification.

So the runtime is still in a startup phase while the messaging layer is already deciding that some events are worth sending.

### Structural reason 3: `session.updated` is restart-sensitive

`session.updated` during remount currently maps to `observeControlChange()`.

That is a weak operator signal during restart because “control became unclaimed” is often just a byproduct of reconnect/reattach behavior.

### Structural reason 4: idle after restart is often not meaningful

`session.activity.completed` triggers `observeSessionIdle()`.

During restart, that often reflects the end of remount churn, not the end of a meaningful terminal work unit.

So restart-time idle can become message-worthy even though it does not represent a meaningful user-facing state transition.

### Structural reason 5: target resolution is duplicated across layers

Topic validation and reuse are repeated because target readiness is touched in more than one place:

- `runtime.start()` eagerly calls `messagingRuntime.ensureSessionTarget(...)` for all restored sessions
- `observeSessionLifecycleInternal(...)` also ensures the target for mapped lifecycle events
- `telegram-adapter.handleEvent(...)` resolves the effective target again before handling the event

This does not itself create outbound messages, but it contributes to restart-phase churn and makes the trace stream denser and harder to reason about.

## What the Hard Break Already Reveals

The hard break on Telegram outbound is useful because it exposes restart-time candidate messages without letting them escape to Telegram.

During the analyzed restart, the system still produced would-be deliveries such as:

- `session.control.changed -> new`
- `session.activity.idle -> new`
- `session.prompt.ready -> new`

That proves the current flooding risk is still present in classification logic even when transport is silent.

This is exactly the right analytical baseline for the later redesign.

## Working Restart Understanding

The current restart behavior can be summarized as:

1. restore sessions
2. rebind browser terminals
3. browser sends resize/input traffic
4. sessions enter temporary activity bursts
5. startup warmup tracks active sessions
6. messaging target readiness is repeatedly revalidated/reused
7. messaging classifies restart-time control, prompt, and idle events as message-worthy
8. only after a quiet period does runtime become ready

So from the perspective of streaming, restart is not a neutral prelude. It is an active phase with its own event grammar.

## Implications for Future Clean Delivery Logic

This document is analytical, not prescriptive, but the observations constrain the next implementation direction.

A clean future adapter path cannot be built on “watch all terminal output and filter noise later” alone.

It must account for restart as its own mode.

At minimum, later clean delivery logic will need to distinguish between:

- restart/remount stabilization
- genuine user-visible progress
- genuine failure/attention conditions
- prompt readiness that matters versus prompt readiness caused by restore/remount churn
- idle that marks the end of real work versus idle that only marks the end of startup turbulence

## Practical Conclusion

The restart-phase flooding risk is currently driven more by runtime/session/control sequencing than by raw terminal text.

That is the key analytical conclusion.

If later work starts from that understanding, the next step can be a clean “not forwarded by default, selectively forwarded when semantically meaningful” model instead of another round of output-pattern tuning.
