# Restart Streaming Analysis

## Purpose

This note captures the observed restart-time streaming behavior of the current `ptydeck` runtime so later messaging work can start from an accurate model instead of another round of symptom-driven tuning.

The focus here is analytical only:

- what a backend restart looks like from the perspective of restored PTY sessions
- which backend and frontend paths are active before `runtime.ready`
- which restart-time signals are structural and which are session- or browser-specific
- why the restart phase is flood-prone even when outbound delivery is hard-disabled
- where the current messaging path already loses semantics that matter for later allowlist-style delivery

## Evidence Base

The findings in this document are based on:

- live backend debug log: `/tmp/ptydeck-backend-debug.log`
- live raw-stream analysis capture: `/tmp/ptydeck-session-stream-analysis.jsonl`
- live `/health` messaging summary and trace rings
- authenticated session replay exports from `/api/v1/sessions/{sessionId}/replay-export`
- source inspection of:
  - `backend/src/runtime.js`
  - `backend/src/session-manager.js`
  - `backend/src/messaging-runtime.js`
  - `backend/src/shell-adapter.js`
  - `backend/src/terminal-output-signals.js`
  - `frontend/src/public/startup-warmup-controller.js`
  - `frontend/src/public/app-lifecycle-controller.js`
  - `frontend/src/public/ws-client.js`
  - `frontend/src/public/ui/session-terminal-runtime-controller.js`
  - `frontend/src/public/ui/session-terminal-resize-controller.js`
  - `frontend/src/public/session-runtime-controller.js`

This note compares three concrete restart-related windows from `2026-04-11`:

- `2026-04-11T19:55:20.000Z` to `2026-04-11T19:55:37.000Z`
- `2026-04-11T20:08:00.000Z` to `2026-04-11T20:08:09.500Z`
- `2026-04-11T20:22:29.000Z` to `2026-04-11T20:22:46.999Z`

## Helper Script

To keep the analysis reproducible, the repository includes:

- `scripts/analyze-restart-streaming.mjs`

Example usage:

```bash
node scripts/analyze-restart-streaming.mjs \
  --start 2026-04-11T20:22:29.000Z \
  --end 2026-04-11T20:22:46.999Z
```

For Codex-oriented block analysis against the raw captured stream, the repository also includes:

- `scripts/analyze-codex-stream-blocks.mjs`

Example usage:

```bash
node scripts/analyze-codex-stream-blocks.mjs \
  --capture-file /tmp/ptydeck-session-stream-analysis.jsonl \
  --session-name ptydeck
```

The script parses the debug log, filters one window, and summarizes:

- HTTP request volume
- session event volume
- messaging event volume
- decision reasons
- per-session timelines
- target validation and topic reuse churn

## Executive Summary

A restart is not one thing. In the current system it can be dominated by at least three different mechanisms:

1. cold browser bootstrap traffic
2. already-open browser reconnect and terminal remount traffic
3. restored PTY output bursts from sessions that never stopped producing output

Those mechanisms can happen independently or overlap.

The most important architectural fact is this:

- the backend starts accepting HTTP and WebSocket traffic before `runtime.ready`
- startup warmup only delays `runtime.ready`
- startup warmup does not suppress session classification or messaging classification

That means restart-time streaming already contains enough structure to generate message-worthy events before the system is considered ready.

A second important fact is this:

- the messaging path mostly operates on normalized visible text
- ANSI formatting, color, bold emphasis, and other visual terminal cues are largely discarded before classification
- for coding-agent CLIs such as Codex, that means the current classifier loses part of the semantic structure that operators actually see on screen

## Evidence Layers and What They Are Good For

The repository now has three different evidence layers for restart and streaming analysis. They are not interchangeable.

### 1. Backend Debug Log

`BACKEND_DEBUG_LOG_FILE` captures structured lifecycle and adapter metadata such as:

- `http.request.*`
- `runtime.ready`
- `session.event`
- `messaging.event.trace`
- `messaging.inbound.update`
- `messaging.target.update`

Use it for:

- restart sequencing
- browser reconnect/remount timing
- messaging classification and suppression reasons
- Telegram target validation and topic provisioning

Do not use it as the primary source for Codex block grammar. It does not retain the operator-visible block text.

### 2. Session Replay Export

`/api/v1/sessions/{sessionId}/replay-export` is the live raw stream source for one retained session tail. It preserves ANSI/CSI data and therefore still carries formatting and terminal-control semantics.

Use it for:

- proving that formatting still exists in the retained stream
- validating that a visible dump really originated from terminal output
- spot checks on one currently retained session tail

Do not treat it as a durable dataset on its own. The default in-memory tail is small and non-persistent, so older restart-time blocks fall out of retention quickly.

### 3. Session Stream Analysis Capture

`SESSION_STREAM_ANALYSIS_CAPTURE_FILE` writes a bounded JSONL stream directly from the PTY `onData` path with both raw and cleaned chunk views plus prompt-boundary offsets and terminal-signal kinds.

Use it for:

- post-restart Codex chunk analysis
- block-grammar experiments against real stream chunks
- validating future allowlist-/signal-first message rules offline without re-enabling Telegram delivery

This capture is the correct persisted source when the question is: "Which raw chunk and cleaned visible text produced this operator-visible Codex block?"

## Core Architecture Fact: `server.listen()` Happens Before `runtime.ready`

The current backend startup order matters more than any individual noise rule.

In `backend/src/runtime.js`:

1. persisted state is restored
2. `server.listen(config.port, ...)` starts accepting traffic
3. `messagingRuntime.start()` runs
4. session targets are ensured for restored sessions
5. startup warmup gate is released
6. `reconcileStartupWarmup()` runs
7. only after the warmup quiet period is satisfied does `runtime.ready` fire

So `runtime.ready` is not the point at which the process starts handling traffic. It is a later milestone.

This explains why restart windows already contain:

- REST requests
- WebSocket reconnects
- session activity transitions
- messaging target revalidation
- message classification

before `runtime.ready` appears in the log.

## The Three Restart Regimes

### 1. Cold Browser Bootstrap Regime

Observed in the `19:55` window.

The frontend startup path is:

1. `waitForStartupWarmup()`
2. `bootstrapDevAuthToken()`
3. `startWsRuntime()`

That is implemented in `frontend/src/public/app-lifecycle-controller.js`.

`waitForStartupWarmup()` in `frontend/src/public/startup-warmup-controller.js` polls `/ready` every `250ms` until the backend reports `status: ready` or the operator skips the wait.

That produces a restart window with characteristics like:

- many `GET /ready`
- optional `OPTIONS /ready`
- no terminal remount traffic yet
- auth and WS setup only after `runtime.ready`

Measured in the `19:55` window:

- `70` `http.request.start`
- `70` `http.request.done`
- `114` `GET /ready`
- `6` `OPTIONS /ready`
- `1` `runtime.ready`
- `1` `ws.upgrade.accepted`
- `1` `ws.snapshot.sent`
- only `1` `session.event`
- but still `15` `messaging.event.trace`

Interpretation:

- even a mostly bootstrap-oriented restart can overlap a noisy restored PTY session
- cold bootstrap reduces browser remount churn, but it does not protect against restored PTY flooding

### 2. Already-Open Browser Reconnect / Remount Regime

Observed clearly in the `20:22` window.

This path is different from cold bootstrap. An already-open browser does not need to go back through the warmup page flow in the same way. `frontend/src/public/ws-client.js` reconnects automatically as soon as the backend accepts connections.

Because the backend is already listening before `runtime.ready`, the browser can reconnect during startup warmup.

Once the frontend remounts terminals, it immediately stimulates the runtime.

The relevant frontend behavior is:

- `frontend/src/public/ui/session-terminal-runtime-controller.js`
  - on mount, immediately calls `applyResizeForSession(session.id)`
  - then runs local stabilization passes at `120ms`, `400ms`, and `900ms`
  - also attaches a `ResizeObserver` that can trigger more resize activity
- `frontend/src/public/ui/session-terminal-resize-controller.js`
  - local resize happens immediately
  - remote resize is posted after `180ms`
  - additional deferred resize passes run at `250ms`, `700ms`, and `1400ms`
  - `document.fonts.ready` can trigger another forced resize pass
- `frontend/src/public/session-runtime-controller.js`
  - snapshot replay stabilization also runs at `0ms`, `120ms`, `400ms`, and `900ms`, but with `skipRemote: true`

The result is a restart-time remount pattern with multiple resize waves.

Measured in the `20:22` window:

- `43` `http.request.start`
- `43` `http.request.done`
- six distinct `/resize` POST routes repeated multiple times
- three distinct `/input` POST routes
- `18` `session.event`
- `12` `messaging.event.trace`
- `12` `runtime.startup_warmup.active`
- `1` `runtime.ready`

Per session, the common sequence was:

1. `session.activity.started`
2. `session.updated`
3. `session.control.changed -> new`
4. `session.activity.completed`
5. `session.activity.idle -> new`

That means remount traffic alone can create message-worthy status churn even before meaningful terminal output is considered.

### 3. Restored PTY Output Burst Regime

Observed very clearly in the `20:08` window.

This regime is important because it proves that restart flooding is not only a browser problem.

Measured in the `20:08` window:

- `1972` `messaging.target.update`
- `987` `messaging.event.trace`
- `0` HTTP request events in the analyzed window
- `1` `session.event`
- `1` `runtime.ready`

Within that same window:

- `911` `session.attention.required`
- `75` `session.output.summary`
- `1` `session.activity.idle`
- `986` `target_validated_cached`
- `986` `topic_reused`

All of that belonged to one topic-mapped session:

- `infra + infra-gcp`

Interpretation:

- the restart phase can be dominated by a single restored PTY stream
- the browser does not need to contribute anything for the runtime to become flood-prone
- repeated topic resolution and repeated classification amplify the cost of that burst

## Restart-Time Sequence in Concrete Code Paths

### Backend PTY Data Path

In `backend/src/session-manager.js`, `attachPtyProcess(...).ptyProcess.onData(...)` is the first important streaming seam.

For each chunk, the current order is effectively:

1. observe terminal signals
2. let the shell adapter consume output and produce `cleaned` plus `promptBoundaries`
3. run output heuristics and app-identity updates on `cleaned`
4. if cleaned output exists:
   - mark remote connected if needed
   - update `lastActivityAt`
   - emit `session.activity.started` if the session was idle
   - emit `session.updated` if metadata changed
   - append replay output
   - schedule activity completion
   - emit `session.data`
   - schedule foreground-process identity refresh

This is why one PTY burst can generate both lifecycle events and message classification work.

### Runtime Event Wiring

In `backend/src/runtime.js`:

- `session.activity.started`:
  - logs `session.event`
  - calls `reconcileStartupWarmup()`
  - schedules persistence
- `session.activity.completed`:
  - logs `session.event`
  - calls `reconcileStartupWarmup()`
  - persists immediately
  - calls `messagingRuntime.observeSessionIdle(...)`
- `session.created`, `session.started`, `session.updated`, `session.data`, `session.exit`, `session.closed` are all wired through the same runtime event bridge

So restart-time streaming is already flowing into messaging before anything like a product-level restart mode exists.

### Messaging Lifecycle Path

In `backend/src/messaging-runtime.js`:

- `session.updated` is not treated as a generic lifecycle event
- it directly runs `observeControlChange()`
- `observeControlChange()` compares a control signature and can emit `session.control.changed`

That is why reconnect/remount churn can produce status-thread movement even if no operator-meaningful terminal milestone occurred.

### Messaging Data Path

Also in `backend/src/messaging-runtime.js`, `observeSessionDataInternal(...)`:

- splits chunks by `promptBoundaries`
- classifies completed lines into:
  - `session.attention.required`
  - `session.output.summary`
  - or nothing
- queues summaries into `pendingSummaryBlock`
- flushes summary blocks:
  - on separator hints
  - on prompt boundaries
  - on quiet windows during idle
- emits `session.prompt.ready` after a prompt-boundary flush

This is why restart-time `prompt ready`, summary, and idle can all appear in the same warmup window.

## Why `session.activity.idle` Is Structurally Dangerous During Restart

`session.activity.completed` calls `observeSessionIdle(...)` immediately after persistence. That means restart-time bursts naturally culminate in `session.activity.idle` candidates.

The `20:22` window showed this pattern clearly:

- `7` idle classifications
- several of them were `new:status_update`
- only some were suppressed as post-chatter noise

This matters because idle is not currently treated as a restart-specific concept. It is treated as a normal meaningful state transition unless nearby heuristics suppress it.

So even if later allowlist delivery is introduced, idle will remain dangerous unless restart-time semantics are modeled explicitly.

## Repeated Target Validation Is Amplification, Not the Root Cause

The restart windows repeatedly showed:

- `target_validated_cached`
- `topic_reused`

This churn is real, but it is amplification rather than the original source of relevance.

The duplication comes from multiple layers:

- `runtime.start()` eagerly ensures targets for restored sessions
- `messaging-runtime.observeSessionLifecycleInternal()` ensures targets again
- `telegram-adapter.handleEvent()` resolves effective targets again for delivery
- `telegram-adapter.ensureTarget()` also resolves forum targets and topic bindings

So once a session starts generating restart-time events, target resolution work is repeated around those events.

That repetition matters for diagnostics and cost, but it is not the root semantic problem. The root problem is that restart-time events are already being treated as message candidates.

## Formatting Matters: The Current Messaging Path Is Mostly Text-Only

This is especially relevant for coding-agent CLIs such as Codex.

Today, the messaging path does not work on a faithful visual model of the terminal. It works mostly on normalized text.

The relevant points are:

- `backend/src/shell-adapter.js`
  - the shell adapter only removes injected cwd markers and exposes prompt boundaries
  - it does not preserve a richer styling model for messaging
- `backend/src/replay-excerpt.js`
  - `normalizeVisibleReplayText()` strips ANSI escape sequences and control codes
- `backend/src/messaging-runtime.js`
  - `truncateSummary()` calls `normalizeVisibleReplayText()`
  - `sanitizeMessageCandidate()` then applies additional normalization and low-value-tail trimming
- `backend/src/terminal-output-signals.js`
  - only a small subset of escape-sequence semantics is preserved today:
    - prompt/command markers
    - current-directory metadata
    - alternate-screen transitions

That means the current messaging classifier mostly loses:

- color
- bold emphasis
- many cursor / region / style distinctions
- the difference between visually dominant headers and visually secondary fragments

For Codex-style output this matters because operator significance often depends on more than the literal words. Long separators, colored emphasis, and structurally distinct headings can mean:

- a new block has started
- the previous block is complete
- this line is a heading rather than body text
- this fragment is visually subordinate and should not be sent alone

The current system only preserves a thin slice of that information.

So any later allowlist-style redesign should not assume that plain text alone is a sufficient basis for Codex-quality message extraction.

## Operator-View Evidence from Codex Terminal Dumps

Two local Codex terminal dump examples captured on `2026-04-11` add an operator-view perspective that the backend debug log does not show on its own.

Those captures are not raw PTY byte streams. They are already rendered terminal transcripts. That distinction matters.

Measured with `scripts/analyze-terminal-dump-visuals.mjs`:

- the shorter `22:41` capture contains `127` visible lines, `21` top-level bullets, `15` separator-delimited blocks, `13` subordinate `└` tails, and `1` footer ribbon, with no ESC bytes remaining
- the longer `23:30` capture contains `509` visible lines, `80` top-level bullets, `51` separator-delimited blocks, `37` subordinate `└` tails, `2` worked-for banners, and `1` footer ribbon, again with no ESC bytes remaining

What they still preserve well:

- prompt lines beginning with `›`
- action-category bullets such as `• Updated Plan`, `• Explored`, `• Ran`, `• Waited for background terminal`, and `• Context compacted`
- subordinate result tails beginning with `└`
- checklist items marked with `□`
- heavy separator bars made of `─`
- elapsed-time banners such as `─ Worked for 1m 47s ─`
- footer-style status lines with model, cwd, token budget, and usage metadata separated by `·`
- visible wrap behavior and indentation, including command-output blocks prefixed by `│`

What they do not preserve:

- raw ESC bytes
- actual ANSI color/style spans
- cursor motion and screen-region updates
- alternate-screen transitions as raw control sequences

In other words, the dump examples preserve the operator-visible block grammar, but not the low-level styling stream.

That difference is crucial for later clean delivery work.

The examples show that Codex output meaning is expressed through a layered visual grammar, not just through literal line text:

- `• Updated Plan` starts a planning block that should not be confused with ordinary terminal output
- `• Explored` and `• Ran` introduce action/result sections with subordinate `└` payloads
- long `─` bars separate thought units and activity phases
- `─ Worked for ... ─` signals elapsed work summaries rather than ordinary output
- the footer line acts like a persistent status ribbon, not a new semantic event
- indentation and wrap structure show whether a line is primary content or only the continuation of a command/result block

This matters because the current messaging path strips down to normalized visible text, then classifies line by line. The operator-view dumps show that a meaningful unit is often a whole visual block:

- heading line
- subordinate explanation/result lines
- separator or elapsed-work banner
- footer/status ribbon that should almost never be forwarded as a message

So the semantic gap is now clearer:

1. raw PTY analysis is needed if future delivery wants actual color/style semantics
2. rendered-transcript analysis is needed if future delivery wants operator-visible block roles
3. the current pipeline preserves only a thin slice of either model

The practical implication is that a future allowlist-/signal-first delivery path should not choose between "raw text" and "raw ANSI". It will likely need both:

- a bounded structural model from the rendered stream
- plus selected low-level terminal signals where styling or mode changes carry meaning

To keep that analysis reproducible, the repository now also includes:

- `scripts/analyze-terminal-dump-visuals.mjs`

That helper summarizes prompt/bullet/separator/footer structure, confirms whether ESC bytes are still present, and provides a repeatable operator-view grammar summary for local terminal transcript examples.

## What the Current Analysis Explains About Flooding

The restart-phase flooding problem is not one bug. It is the superposition of several independent effects:

1. server accepts traffic before `runtime.ready`
2. already-open browsers can reconnect during startup warmup
3. terminal mounts generate immediate remote resize traffic
4. remount traffic can create control-change churn through `session.updated`
5. activity completion naturally generates idle candidates
6. restored PTY output can flood the classifier with no browser traffic at all
7. target validation and topic reuse repeat around each classified event
8. the classifier mostly operates on normalized text and therefore misses some structural visual cues that would help separate meaning from chatter

## What Is Still Not Fully Understood

One observed restart-time behavior still needs caution in interpretation:

- `/input` requests clearly appear in restart windows
- the logs prove that they happen
- the current code inspection proves several deterministic mount-time resize paths
- but it does not yet prove one single purely mount-driven code path that fully explains every restart-time `/input` request

So the correct current statement is:

- restart-time `/input` traffic is real and relevant
- it participates in restart churn
- but its full frontend origin is not yet narrowed to one single deterministic source

That uncertainty should remain explicit in future analysis rather than being hand-waved into certainty.

## Implications for the Next Messaging Direction

The post-hard-break redesign should not resume from "filter more lines".

This analysis supports a different direction:

1. treat restart as an explicit runtime mode, not just ordinary session activity
2. separate cold bootstrap, browser remount churn, and restored PTY burst behavior
3. classify message-worthiness from a smaller set of explicit state transitions
4. use replayable trace windows as the evaluation surface
5. preserve more structural stream information for coding-agent sessions than plain normalized text alone

A later allowlist- or signal-first delivery path should therefore start from:

- explicit restart-aware suppression or quarantine rules
- explicit session-state transitions that are allowed to surface externally
- app-specific block boundaries that can use prompt markers, separator hints, and retained visual structure together
- edit/update reuse as the default for evolving session state, not new-message fanout

## Comparison Snapshot of the Three Windows

### `19:55` Window

Dominant shape:

- cold browser bootstrap
- `/ready` polling before WebSocket
- still overlapped by one noisy restored PTY session

Measured highlights:

- `114` `GET /ready`
- `15` messaging events
- `14` attention alerts
- `1` summary update
- only `1` session event

### `20:08` Window

Dominant shape:

- restored PTY burst only
- essentially no browser traffic in the measured window

Measured highlights:

- `911` attention alerts
- `75` summaries
- `986` cached target validations
- `986` topic reuses
- `0` HTTP events in the window

### `20:22` Window

Dominant shape:

- reconnect / remount churn during startup warmup
- multi-session resize and input traffic before `runtime.ready`

Measured highlights:

- `43` HTTP requests started
- `18` session events
- `12` messaging events
- `7` idle classifications
- `3` control-change classifications
- `2` prompt-ready classifications

## Practical Reading of a Real Restart

When reading future restart logs, the most useful first question is not:

- "Which line classifier misbehaved?"

It is:

- "Which restart regime am I looking at?"

Use this order:

1. Is the window dominated by `/ready` polling and later auth/WS startup?
   - cold bootstrap regime
2. Is the window dominated by `resize` and `input` traffic across several sessions during warmup?
   - reconnect/remount regime
3. Is the window dominated by one session generating hundreds of `attention` or `summary` events with little or no HTTP traffic?
   - restored PTY burst regime

Only after that distinction does it make sense to reason about message forwarding policy.

## Conclusion

The restart phase is currently flood-prone by architecture, not just by bad regexes.

The most important analytical conclusions are:

- startup warmup delays `runtime.ready` but does not isolate the runtime from restart traffic
- frontend remount and restored PTY output are independent flood sources
- `session.updated -> session.control.changed` and `session.activity.completed -> session.activity.idle` are structural restart-noise transitions
- repeated target validation is amplification around those transitions
- the current classifier operates on normalized text and therefore already discards some formatting semantics that matter for coding-agent output

Any later messaging rebuild that wants clean, targeted delivery must start from this model rather than from more ad hoc noise filters.
