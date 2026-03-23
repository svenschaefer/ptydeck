# Refactoring Plan: Explicit Session Lifecycle Modeling

## 1. Objective

Introduce a **clear, explicit, and fully synchronized session lifecycle model** across backend and frontend.

Goals:

- eliminate inconsistent or stale session states
- properly handle PTY termination (`session.exit`)
- establish deterministic state transitions
- enable reliable higher-level features (plugins, status, automation)

---

## 2. Current Problem

### Observed Issues

- backend emits `session.exit` when PTY ends
- frontend does not explicitly handle this event
- sessions may remain visible as if still active

### Result

- “zombie sessions” in UI
- incorrect activity/status detection
- broken assumptions for plugins (e.g. “busy vs finished”)

---

## 3. Core Principle

> A session is a state machine, not just a container.

Every session must have:

- a well-defined lifecycle
- explicit transitions
- consistent representation across backend and frontend

---

## 4. Target Lifecycle Model

### States

```text
created → starting → running → busy → idle → exited → closed
````

---

### State Definitions

| State    | Meaning                                |
| -------- | -------------------------------------- |
| created  | session object exists, not yet started |
| starting | PTY process initializing               |
| running  | PTY active, ready for input/output     |
| busy     | actively producing output (derived)    |
| idle     | running but no recent activity         |
| exited   | PTY process has terminated             |
| closed   | session explicitly removed             |

---

### Key Distinction

* **exited ≠ closed**
* exited = process ended
* closed = session removed from system

---

## 5. Backend Responsibilities

### 5.1 Emit Lifecycle Events

Backend MUST emit:

```json id="m7g3tr"
{ "type": "session.created", "session": {...} }
{ "type": "session.started", "sessionId": "..." }
{ "type": "session.data", "sessionId": "...", "data": "..." }
{ "type": "session.exit", "sessionId": "...", "code": 0 }
{ "type": "session.closed", "sessionId": "..." }
```

---

### 5.2 Guarantee Event Ordering

* events for a session must be ordered
* no missing transitions

---

### 5.3 Preserve Exit Metadata

`session.exit` should include:

```json id="qz3l5b"
{
  "type": "session.exit",
  "sessionId": "...",
  "code": 0,
  "signal": null,
  "timestamp": 123456789
}
```

---

## 6. Frontend Responsibilities

### 6.1 State Machine Enforcement

Frontend must treat sessions as state machines.

Example reducer:

```js id="v4p8mj"
function sessionReducer(session, event) {
  switch (event.type) {
    case "session.created":
      return { ...session, state: "created" }

    case "session.started":
      return { ...session, state: "running" }

    case "session.exit":
      return {
        ...session,
        state: "exited",
        exitCode: event.code
      }

    case "session.closed":
      return null
  }
}
```

---

### 6.2 Derived States

Some states are computed:

* `busy` → based on activity
* `idle` → based on inactivity

These are not backend-driven, but:

```text
running + activity → busy  
running + no activity → idle
```

---

### 6.3 UI Behavior

#### running

* normal terminal interaction

#### busy

* show activity indicator

#### idle

* neutral state

#### exited

* terminal becomes read-only
* show exit code
* disable input

#### closed

* remove from UI

---

## 7. Handling `session.exit` (Critical Fix)

### Required Behavior

On receiving:

```json id="y7v4xn"
{ "type": "session.exit", "sessionId": "...", "code": 0 }
```

Frontend must:

* update state to `exited`
* stop sending input to PTY
* visually indicate termination
* optionally show exit code

---

### Anti-Pattern (Current Risk)

* ignoring `session.exit`
* leaving terminal interactive
* assuming session is still running

---

## 8. Integration with Stream Layer

### Interaction

* stream layer continues to receive data until exit
* after exit:

  * no more `session.data` events
  * idle detection must stop

---

### Rule

> `session.exit` is authoritative termination signal.

Do NOT rely on:

* lack of output
* timeout

---

## 9. Integration with Plugin System

Plugins depend on lifecycle correctness.

Examples:

### Working Detector

* must stop on `session.exit`

### Summary Extractor

* can finalize immediately on exit

### Error Detection

* can use exit code as signal

---

## 10. Edge Cases

### 10.1 Fast Exit

* session exits immediately after creation

→ must still transition correctly:

```text
created → starting → exited
```

---

### 10.2 Exit Without Output

* no data events

→ exit event still drives state

---

### 10.3 Reconnect Scenario

* snapshot must include exited sessions
* frontend must restore correct state

---

### 10.4 Double Events

* reducer must be idempotent

---

## 11. State Transition Rules

### Allowed Transitions

```text
created → starting  
starting → running  
running → busy  
busy → idle  
running → exited  
busy → exited  
idle → exited  
exited → closed
```

---

### Forbidden Transitions

* exited → running
* closed → any state

---

## 12. Refactoring Strategy

### Phase 1

* add `session.exit` handling in frontend
* update state model

---

### Phase 2

* introduce explicit `state` field in store
* remove implicit assumptions

---

### Phase 3

* integrate activity detection (busy/idle)

---

### Phase 4

* align backend event emission (if needed)

---

## 13. Benefits

### 13.1 Correctness

* no stale sessions
* accurate UI state

---

### 13.2 Predictability

* deterministic transitions
* easier debugging

---

### 13.3 Plugin Reliability

* plugins can trust lifecycle signals

---

### 13.4 UX Improvements

* clear session status
* better feedback (exit codes, errors)

---

## 14. Risks if Not Addressed

* inconsistent state across UI
* plugin system behaves unpredictably
* harder to reason about session state
* accumulation of hidden bugs

---

## 15. Final Assessment

This is not a minor fix.

> Explicit lifecycle modeling is a foundational requirement for a reliable terminal workspace.

Without it:

* higher-level features (plugins, automation, summaries)
  will be unreliable

With it:

* the system gains a stable, predictable execution model
