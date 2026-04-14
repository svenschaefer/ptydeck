# PTY EINTR Write Error Analysis

Date: 2026-04-14
Scope: `v0.4.0-H126`

## Question

Repeated backend console messages were observed during local `npm run dev` operation:

```text
Unhandled pty write error [Error: EINTR: interrupted system call, write]
```

The goal of this analysis was to determine:

- where those errors originate
- whether they are already visible through ptydeck's structured runtime traces
- whether they are transient retryable interruptions or effective input-loss conditions
- what corrective strategy is technically appropriate

## Primary Finding

The observed `Unhandled pty write error ... EINTR` messages do **not** come from ptydeck runtime code.
They come directly from the currently installed `node-pty` asynchronous Unix write queue implementation.

Current local dependency:

- `node-pty` version: `1.1.0`

Source of the console message:

- `backend/node_modules/node-pty/src/unixTerminal.ts`
- compiled twin: `backend/node_modules/node-pty/lib/unixTerminal.js`

Current behavior in that dependency:

- `EAGAIN` is retried asynchronously
- `EINTR` is **not** retried explicitly
- unexpected async write errors clear the remaining write queue
- the dependency then logs `Unhandled pty write error` to stderr

That means the current local behavior is **not** just noisy logging. Under `EINTR`, queued PTY writes can currently be dropped without ptydeck receiving a structured synchronous failure.

## Code Evidence

### ptydeck runtime write path

Synchronous PTY write entry point:

- `backend/src/session-manager.js:1793`

The ptydeck session manager emits structured write events around `session.ptyProcess.write(data)`:

- `session.input.write` phase `attempt`
- `session.input.write` phase `ok`
- `session.input.write` phase `failed`

Those events only cover the synchronous call boundary.

### node-pty async write queue

Current dependency code:

- `backend/node_modules/node-pty/src/unixTerminal.ts:357`
- `backend/node_modules/node-pty/src/unixTerminal.ts:359`
- `backend/node_modules/node-pty/src/unixTerminal.ts:365`
- `backend/node_modules/node-pty/src/unixTerminal.ts:366`

Behavior there:

- `fs.write(...)` runs asynchronously inside the dependency write queue
- on `EAGAIN`, the queue is retried later
- on any other error, the queue is cleared and `Unhandled pty write error` is logged

Because this happens after `session.ptyProcess.write(data)` already returned, ptydeck's own `sendInput(...)` path cannot currently see that async error through the existing structured `phase=failed` event.

## Structured Runtime Evidence

The helper script `scripts/analyze-pty-write-eintr.mjs` was run against the current live debug log:

```json
{
  "nodePty": {
    "version": "1.1.0",
    "behavior": {
      "retriesEagain": true,
      "retriesEintr": false,
      "clearsQueueOnUnexpectedError": true,
      "logsUnhandledWriteError": true,
      "usesAsyncFsWriteQueue": true
    }
  },
  "logSummary": {
    "totalStructuredWriteEvents": 360,
    "sessionInputWrite": {
      "attemptCount": 180,
      "okCount": 180,
      "failedCount": 0
    },
    "messagingInputWriteFailedCount": 0,
    "rawUnhandledPtyWriteErrorLines": 0,
    "rawEintrMentions": 0
  },
  "assessment": {
    "structuredFailuresObserved": false,
    "asyncGapExists": true,
    "silentQueueDropRiskOnEintr": true,
    "currentRuntimeContractMatch": false
  }
}
```

What this proves:

- ptydeck's structured runtime trace currently shows only successful synchronous write submission
- the debug log file does not contain the console `Unhandled pty write error` lines
- therefore the current `EINTR` path sits outside the existing structured write-failure contract
- the combination of `phase=ok` in ptydeck and queue clearing in `node-pty` creates a real blind spot for silent write loss

## Runtime Impact Assessment

Current best assessment:

- `EINTR` should be treated as a retryable asynchronous interruption
- the current dependency implementation does not do that
- the current dependency instead clears the remaining queue on that path
- therefore the current operator-visible contract is unsafe

What is proven:

- the current implementation can drop queued PTY writes on the inspected async error path
- ptydeck does not currently surface that loss as a structured runtime failure

What is **not** yet proven from the current structured logs alone:

- the exact count of real user-visible dropped writes in every observed console incident

That remaining uncertainty exists only because the dependency logs to stderr outside the structured debug log file.
It does **not** weaken the architectural conclusion that the current `EINTR` path is unsafe.

## Corrective Strategy

The correct follow-up is a bounded runtime correction, not more logging alone.

Recommended corrective strategy:

1. treat `EINTR` like a retryable async PTY write interruption
2. keep the queued write intact instead of clearing the queue immediately
3. add bounded retry/backoff behavior for retryable async write errors
4. surface a structured runtime failure only after retry exhaustion
5. make async PTY write failure observable through ptydeck's own runtime events instead of only dependency stderr

## Deliverables Added In This Analysis Wave

- `scripts/analyze-pty-write-eintr.mjs`
- `test/analyze-pty-write-eintr.test.js`
- this analysis note

## Result

`v0.4.0-H126` closes as analysis-complete.

The conclusion is explicit:

- the current `EINTR` PTY write path is not merely noisy
- it is currently a retryable interruption that `node-pty` treats as an unexpected fatal async write error
- the remaining write queue can therefore be dropped silently from ptydeck's perspective
- a corrective implementation follow-up is required
