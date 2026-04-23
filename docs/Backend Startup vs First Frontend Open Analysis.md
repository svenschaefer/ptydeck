# Backend Startup vs First Frontend Open Analysis

Historical note: this document records a 2026-04-14 field investigation and is retained for startup/restart learnings only. It is not a current implementation-status document; current runtime behavior is defined by code, `CODEX_CONTEXT.md`, and the active runbook.

## Scope

This note documents the real 2026-04-14 field case where the backend was restarted well before 14:00 CEST and the frontend at `https://ptydeck.local.secos.rocks` was only opened around 14:27 CEST.

Question under review:

- what startup and restore work already completed before any frontend was attached
- what activity only happened once the first frontend bootstrap connected
- whether the observed late terminal churn was a backend-startup gap or frontend-triggered behavior

## Primary Sources

- `/tmp/ptydeck-backend-debug.log`
- `backend/src/runtime.js`
- `frontend/src/public/app-lifecycle-controller.js`
- `frontend/src/public/startup-warmup-controller.js`
- `frontend/src/public/ws-runtime-controller.js`
- `frontend/src/public/runtime-event-controller.js`
- `frontend/src/public/session-runtime-controller.js`
- `frontend/src/public/ui/session-terminal-runtime-controller.js`
- `frontend/src/public/ui/session-terminal-resize-controller.js`
- `scripts/analyze-startup-timeline.mjs`

## Reconstructed Timeline

### Before the First Frontend Open

The backend did complete its restore and startup sequence without any frontend being present.

Observed in the debug log:

- `2026-04-14T08:36:20.700Z` `runtime.restore.start`
- `2026-04-14T08:36:20.887Z` `runtime.restore.done`
- `2026-04-14T08:40:03.242Z` `runtime.ready`

Important facts from those events:

- `runtime.restore.done` reports `restoredSessionCount = 16`
- `runtime.ready` reports `sessionCount = 16`
- startup warmup was active before readiness and quieted before `runtime.ready`

Relevant backend code:

- [runtime.js](/home/wsl/workspace/code/ptydeck/backend/src/runtime.js)
  - restore path around `runtime.restore.start` / `runtime.restore.done`
  - readiness and startup-warmup handling around `runtime.ready`
  - WebSocket snapshot send path around `ws.snapshot.sent`

Conclusion for this phase:

- the backend does **not** wait for the frontend before restoring sessions
- the backend does **not** postpone `runtime.ready` until a frontend opens
- the persisted sessions were already restored before the later frontend visit

### At the First Frontend Open

The first confirmed frontend attach after that backend-ready point happened around `2026-04-14T12:26:30Z`.

Observed in the debug log:

- `2026-04-14T12:26:30.222Z` `GET /ready`
- `2026-04-14T12:26:30.319Z` `ws.upgrade.accepted`
- `2026-04-14T12:26:30.328Z` `ws.snapshot.sent`

The snapshot proves the backend already had state ready before the frontend appeared:

- `sessionCount = 16`
- `outputCount = 16`
- `customCommandCount = 13`

Additional frontend bootstrap requests immediately followed:

- `POST /api/v1/auth/dev-token`
- `POST /api/v1/auth/ws-ticket`
- `GET /api/v1/layout-profiles`
- `GET /api/v1/connection-profiles`
- `GET /api/v1/ssh-trust-entries`
- `GET /api/v1/workspace-presets`

## What the Frontend Clearly Triggers

### 1. Snapshot Replay and Terminal Stabilization

The frontend runtime bootstrap is explicit in code:

- [app-lifecycle-controller.js](/home/wsl/workspace/code/ptydeck/frontend/src/public/app-lifecycle-controller.js)
  - waits for `/ready`
  - bootstraps auth
  - starts the WebSocket runtime
- [ws-runtime-controller.js](/home/wsl/workspace/code/ptydeck/frontend/src/public/ws-runtime-controller.js)
  - consumes the snapshot
- [runtime-event-controller.js](/home/wsl/workspace/code/ptydeck/frontend/src/public/runtime-event-controller.js)
  - applies the snapshot and replays outputs
- [session-runtime-controller.js](/home/wsl/workspace/code/ptydeck/frontend/src/public/session-runtime-controller.js)
  - replays snapshot outputs into local terminals
  - schedules terminal stabilization passes

This explains why the terminals visibly "wake up" when the frontend opens even though the backend was already ready.

### 2. Remote Resize Traffic

The frontend also clearly triggers remote resize calls after terminals mount:

- [session-terminal-runtime-controller.js](/home/wsl/workspace/code/ptydeck/frontend/src/public/ui/session-terminal-runtime-controller.js)
  - mounts terminals and runs repeated stabilization passes
- [session-terminal-resize-controller.js](/home/wsl/workspace/code/ptydeck/frontend/src/public/ui/session-terminal-resize-controller.js)
  - schedules deferred remote `/resize` calls unless `skipRemote` is set

This part is intentional and fully explained by the code.

### 3. Browser-Originated Session Input Writes

The important unexpected finding is that the first frontend-open window also contains **real browser-originated `/input` writes** to restored sessions.

Observed in the debug log during the first frontend bootstrap window:

- multiple `POST /api/v1/sessions/{id}/input`
- matching `session.input.write phase=ok`
- matching `session.activity.started`

In the immediate first-open window, these writes were not backend-internal events:

- they were `traceSource = "rest"`
- they came from the browser client IP
- they occurred only after the frontend attached

The new helper currently reconstructs the live 2026-04-14 window as:

- `9` POST `/input` requests with matching `session.input.write phase=ok`
- `18` POST `/resize` requests
- the earliest `/input` cluster starts at `2026-04-14T12:26:31.324Z`
- several restored sessions first receive exactly `6` bytes, while later writes in the same bounded bootstrap window include additional `1`-, `3`-, and `7`-byte writes

This means the visible terminal churn after the frontend opens is **not just** output replay and resize activity. The frontend bootstrap path currently also causes real session input traffic.

## What Is Proven vs. What Is Not

### Proven

- backend restore completed before the first frontend attached
- `runtime.ready` completed before the first frontend attached
- the frontend bootstrap replays snapshot output into terminals
- the frontend bootstrap triggers remote resize traffic
- the frontend bootstrap window also produced real browser-originated `/input` writes to restored sessions

### Not Yet Proven

The exact static frontend code path for those automatic `/input` writes is **not yet isolated**.

Static inspection did **not** reveal a single explicit, obvious "send input during bootstrap" function that cleanly explains those writes. The code clearly explains:

- `/ready` polling
- auth bootstrap
- WebSocket snapshot bootstrap
- snapshot replay
- resize stabilization

But the exact frontend-side trigger for the observed startup `/input` requests remains unresolved from static code inspection alone.

That unresolved detail does **not** change the main product conclusion.

## Delivered Follow-Up

The product-side correction for this bootstrap side effect is now delivered across `v0.4.0-H125` and `v0.4.0-H127`.

The practical fix does **not** depend on proving the exact historical browser sub-trigger byte-for-byte. Instead, the terminal mount path now enforces the intended contract directly:

- passive frontend bootstrap may replay output and run local/remote resize stabilization
- passive frontend bootstrap may **not** forward browser-side terminal `onData(...)` into backend session input
- browser-side terminal input forwarding is armed only after explicit local operator interaction

In the shipped code, `frontend/src/public/ui/session-terminal-runtime-controller.js` now suppresses terminal-originated `onData(...)` while a mounted terminal is still in the passive bootstrap state and only begins forwarding after explicit write-intent interaction such as:

- keyboard interaction
- paste handling
- middle-click paste
- mouse interaction when the session is explicitly in application mouse-forwarding mode

The earlier broader arming rules from `H125` were intentionally tightened in `H127` after the 2026-04-14 follow-up live repro proved that plain focus/click behavior could still arm forwarding too early. Plain left-click focus and focus-button interaction now focus the terminal surface without arming forwarding by themselves.

This means the backend-only restart contract now remains what the original analysis proved:

- backend restore completes without the frontend
- the first frontend open can still cause visible replay/resizing churn
- but passive bootstrap should no longer create unintended session `/input` writes before the operator actually interacts with a terminal

## Product Interpretation

The current runtime contract is therefore:

- backend startup and session restore are frontend-independent
- first frontend open is **not** required to finish restore
- first frontend open **does** trigger additional terminal-surface bootstrap work
- part of that bootstrap work is expected and local/visual
- passive frontend bootstrap should no longer include real browser-originated session input writes before explicit operator interaction

So the observed late activity was **not** evidence that backend startup was still waiting for the frontend. It was evidence that frontend bootstrap previously had meaningful side effects beyond passive viewing, and the shipped `H125`/`H127` corrections now narrow that bootstrap contract back to passive replay plus stabilization until the operator actually interacts.

## Practical Outcome

For future investigation or correction work, the product should distinguish at least three phases:

1. backend restore complete
2. backend startup gate released (`runtime.ready`)
3. first frontend attached and terminal surfaces bootstrapped

At the moment, phase `3` can still produce visible replay/resizing churn, but it should no longer generate backend session input before explicit operator interaction.

## Reproduction Helper

Use:

```bash
node scripts/analyze-startup-timeline.mjs --log /tmp/ptydeck-backend-debug.log --format json
```

Optional:

```bash
node scripts/analyze-startup-timeline.mjs \
  --log /tmp/ptydeck-backend-debug.log \
  --sessions backend/data/sessions.json \
  --window-seconds 90
```

The helper reports:

- latest restore/ready timestamps
- delay from backend-ready to first frontend WebSocket attach
- first frontend bootstrap request mix
- browser-originated `/input` writes during the bootstrap window
- resize activity during the same window
