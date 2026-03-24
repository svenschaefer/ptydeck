# Concept: Slash Workflow Chains for ptydeck (including Execution Control & Abort Model)

---

## 1. Objective

Define a **deterministic, line-oriented slash workflow DSL** for ptydeck that allows users to express small terminal-aware automations directly inside the existing multiline command input.

The system is intended to support controlled sequences such as:

- wait for a recognizable terminal pattern
- wait until output becomes idle
- trigger a follow-up action
- capture output blocks
- copy or surface extracted results

Additionally, the system must support:

- **safe interruption of workflows**
- **hard termination of terminal processes**
- **clear separation between DSL execution and runtime control**

This should remain:

- frontend-first
- deterministic at the execution layer
- heuristic only at the terminal interpretation layer
- small and focused, not a general scripting language

---

## 2. Motivation

ptydeck already has:

- a multiline command input
- terminal stream visibility in the frontend
- a growing need for terminal-aware follow-up actions

Typical use cases include:

- wait until a Codex summary block appears, then trigger `/docu`
- wait for terminal quietness, then trigger `/go`
- capture a final summary and copy it
- react to known terminal patterns such as:
  - `Working (7m 04s • esc to interrupt)`
  - `Completed files 0/1 | 94.5MiB/279.5MiB | 6.8MiB/s`
  - delimiter lines such as `────────────`

These are not shell commands in the normal sense. They are **workflow steps over terminal state and terminal output**.

At the same time, real-world terminal interaction requires:

- interrupting stuck processes
- cancelling long waits
- killing sessions when necessary

---

## 3. Design Position

The proposed model is **not**:

- a shell replacement
- a macro language for arbitrary programming
- a general scripting runtime
- a backend automation engine

The proposed model **is**:

- a small workflow DSL
- evaluated sequentially
- operating over terminal-observable events and derived session state
- paired with a **separate execution control layer**

---

## 4. Core Principle

> One line equals one workflow step.

```text
/wait until line /^─{10,}$/ timeout 60s
/wait idle 10s
/docu
```

Additionally:

> DSL execution and runtime control are strictly separated.

---

## 5. Execution Model

A slash workflow is evaluated as a **sequential list of steps**.

Each step:

* reads terminal/session context
* succeeds, fails, or times out
* may emit effects
* may update workflow-local state

Default rule:

> Execution proceeds only on success.

Failure:

* aborts workflow
* surfaces error in UI

---

## 6. Command Categories

### Conditions

```text
/if line /^─{10,}$/
/unless status /Working/
```

### Wait

```text
/wait delay 10s
/wait idle 10s
/wait until line /^─{10,}$/ timeout 60s
```

### Actions

```text
/docu
/go
/copy summary
/status "Summary detected"
```

### Capture

```text
/capture summary from delimiter /^─{10,}$/
```

### Control

```text
/stop
/else
```

---

## 7. Data Sources

Explicit sources only:

* `line`
* `visible-line`
* `status`
* `summary`
* `exit-code`
* `session-state`

---

## 8. `/if` vs `/wait`

### `/if`

* immediate
* synchronous
* no waiting

### `/wait until`

* temporal
* event-driven
* requires timeout

> `/if` ≠ `/wait until`

---

## 9. Text Blocks (`--- ---`)

```text
---
...
---
```

Defines:

> explicit opaque text

Properties:

* not parsed
* no DSL interpretation
* used only as payload

Valid:

```text
/docu
---
Some text
---
```

Invalid:

```text
---
/wait ...
---
```

---

## 10. Codex Use Cases

### Summary → `/docu`

```text
/wait until line /^─{10,}$/ timeout 60s
/wait idle 10s
/docu
```

### Summary → `/go`

```text
/wait until line /^─{10,}$/ timeout 60s
/wait idle 10s
/go
```

---

## 11. Parsing Model

Strict AST:

```json
[
  { "type": "wait", "mode": "until" },
  { "type": "wait", "mode": "idle" },
  { "type": "action", "name": "docu" }
]
```

Reject:

* invalid regex
* missing timeout
* unknown commands

---

## 12. Execution Engine

States:

```text
ready → running → waiting → succeeded / failed / stopped
```

Sequential, deterministic.

---

# 13. Execution Control & Abort Model

## 13.1 Core Principle

> Workflow execution must be interruptible at any time, independently of the DSL.

This introduces a second control layer:

* **DSL flow** (deterministic)
* **control plane** (asynchronous, user-driven)

---

## 13.2 Why DSL is insufficient

A DSL command like:

```text
/stop
```

cannot:

* interrupt a running `/wait`
* interrupt a blocked `/docu`
* kill a PTY process

Because it depends on execution progress.

---

## 13.3 Control Layers

### A. Workflow Control

* cancel workflow
* abort current step

### B. Step Control

* abort wait
* cancel async operation

### C. PTY Control

* interrupt process (SIGINT)
* terminate (SIGTERM)
* kill (SIGKILL)

---

## 13.4 Workflow Cancellation

State model:

```text
ready → running → waiting → cancelled → failed / succeeded
```

API:

```js
workflow.cancel()
```

Behavior:

* abort current step immediately
* unsubscribe listeners
* stop execution

---

## 13.5 Abortable Steps

Each step must support cancellation:

```js
waitUntil(condition, { signal })
```

Using AbortController semantics.

---

## 13.6 PTY Control

### Soft Interrupt

```text
SIGINT (Ctrl+C)
```

### Terminate

```text
SIGTERM
```

### Hard Kill

```text
SIGKILL
```

---

## 13.7 Backend Interface

Required endpoints:

```text
POST /sessions/:id/interrupt
POST /sessions/:id/terminate
POST /sessions/:id/kill
```

---

## 13.8 UI / UX Controls

Must be exposed independently of DSL.

### Required controls

* Stop Workflow
* Interrupt (Ctrl+C)
* Kill Session

### Example UI State

```text
Waiting for line /^─{10,}$/ (timeout 60s)
```

Controls:

* [Stop Workflow]
* [Ctrl+C]
* [Kill]

---

## 13.9 Control Flow Architecture

```text
UI
↓
Workflow Controller (cancel)
↓
Step (abortable)
↓
PTY Control (interrupt / kill)
```

Two independent flows:

* DSL execution
* user control

---

## 13.10 Edge Cases

### Hanging `/wait`

→ cancel workflow

### Infinite loop process

→ SIGKILL

### Ignored SIGINT

→ escalate to SIGTERM / SIGKILL

### PTY exited

→ workflow must detect and fail

---

## 13.11 Optional DSL Extensions (future)

```text
/timeout 30s
/on-timeout /stop
```

These **do not replace** control plane.

---

## 14. Integration Layer

```text
WebSocket
→ stream adapter
→ interpretation/plugins
→ workflow engine
→ control plane
→ UI
```

---

## 15. Boundaries

Do not include:

* loops
* variables
* scripting language features
* backend orchestration

---

## 16. Future Extensions

* retry
* notifications
* event hooks
* richer capture semantics

---

## 17. Final Recommendation

System consists of two parts:

### 1. Workflow DSL

* deterministic
* line-based
* terminal-aware

### 2. Execution Control Plane

* asynchronous
* user-driven
* able to interrupt anything

---

## 18. Summary

ptydeck evolves into:

* terminal-aware workflow system
* deterministic DSL layer
* explicit control plane for safety and UX

Key guarantees:

* no hidden behavior
* full user control at all times
* clear separation of concerns
* extensibility without complexity explosion
