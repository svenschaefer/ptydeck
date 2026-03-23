# Refactoring Plan: WebSocket as Single Source of Truth

## 1. Objective

Establish the WebSocket layer as the **single authoritative source of runtime state** in the frontend.

Goals:

- eliminate duplicated data flows (WS + REST)
- ensure consistent session and command state
- enable real-time, event-driven architecture
- prepare the system for plugin-based interpretation

---

## 2. Current Problem

The system currently uses a **hybrid data model**:

- WebSocket:
  - session lifecycle events
  - terminal output
- REST:
  - custom commands (`listCustomCommands`)
  - possibly other state queries

### Result

- multiple sources of truth
- potential race conditions
- redundant network calls
- unclear data ownership

---

## 3. Core Principle

> All live state MUST originate from the WebSocket stream.

REST is only used for:

- initial state hydration
- explicit user-triggered actions (mutations)

---

## 4. Target Data Flow

```text
Backend → WebSocket → Stream Layer → State Layer → UI
````

### Rules

* WebSocket events = authoritative updates
* REST responses = initial snapshot or mutation confirmation only
* frontend never polls for state

---

## 5. State Domains to Unify

### 5.1 Sessions

Already partially WS-driven:

* `session.created`
* `session.data`
* `session.closed`
* (missing: `session.exit` handling)

**Action**

* treat WS events as the only session state source
* snapshot used only at connect

---

### 5.2 Custom Commands

Current issue:

* backend emits WS events:

  * `custom-command.created`
  * `custom-command.updated`
  * `custom-command.deleted`
* frontend ignores them and calls REST repeatedly

**Action**

* maintain in-memory command registry
* update via WS events
* REST only for initial load

---

### 5.3 Runtime Status

Future domains (important for plugins):

* session activity
* status messages
* artifacts (summaries)
* errors

→ must be derived and stored centrally, not ad-hoc in UI

---

## 6. State Model (Unified)

```js id="m4r9du"
{
  sessions: {
    [sessionId]: {
      id,
      state,
      statusText,
      lastActivityAt,
      cwd,
      tags,
      artifacts,
      meta
    }
  },

  commands: {
    [commandId]: {
      id,
      name,
      description,
      body
    }
  }
}
```

---

## 7. WebSocket Event Model

### Requirements

All state-relevant changes must be represented as WS events.

---

### 7.1 Session Events

```json id="q8o2iv"
{ "type": "session.created", "session": {...} }
{ "type": "session.updated", "session": {...} }
{ "type": "session.data", "sessionId": "...", "data": "..." }
{ "type": "session.exit", "sessionId": "...", "code": 0 }
{ "type": "session.closed", "sessionId": "..." }
```

---

### 7.2 Command Events

```json id="z3r8fl"
{ "type": "custom-command.created", "command": {...} }
{ "type": "custom-command.updated", "command": {...} }
{ "type": "custom-command.deleted", "id": "..." }
```

---

### 7.3 Snapshot Event

```json id="e2b4zp"
{
  "type": "snapshot",
  "sessions": [...],
  "commands": [...]
}
```

Used only:

* on initial connect
* after reconnect

---

## 8. Frontend Responsibilities

### 8.1 Stream Layer

* receives WS events
* normalizes payloads
* forwards to state layer

---

### 8.2 State Layer

* applies WS events as reducers
* maintains canonical state

Example:

```js id="c8w7yt"
function reducer(state, event) {
  switch (event.type) {
    case "custom-command.created":
      state.commands[event.command.id] = event.command
      break

    case "custom-command.deleted":
      delete state.commands[event.id]
      break
  }
}
```

---

### 8.3 UI Layer

* consumes state only
* no direct WS or REST calls for state

---

## 9. REST Usage After Refactor

REST remains for:

### 9.1 Initial Load

* optional bootstrap before WS connects

### 9.2 Mutations

Examples:

* create session
* update command
* delete session

### Rule

> REST responses are NOT used as authoritative state.

Instead:

* backend emits WS event after mutation
* frontend updates state via WS

---

## 10. Benefits

### 10.1 Consistency

* single source of truth
* no divergence between WS and REST

---

### 10.2 Real-Time Reactivity

* instant UI updates
* no polling

---

### 10.3 Simpler Mental Model

* “state flows from WS”
* easier reasoning

---

### 10.4 Enables Plugin System

Plugins depend on:

* consistent stream of events
* unified state

Without this:

* plugin behavior becomes unpredictable

---

## 11. Refactoring Strategy

### Phase 1: Identify All REST Reads

* locate all `GET` calls used for state
* especially:

  * custom commands
  * session lists

---

### Phase 2: Introduce State Store

* central store (existing `store.js` can evolve)
* all updates go through reducers

---

### Phase 3: Wire WS Events to Store

* implement reducer handlers for:

  * sessions
  * commands

---

### Phase 4: Remove Redundant REST Reads

* replace with store access
* ensure WS events cover all cases

---

### Phase 5: Add Snapshot Handling

* on connect:

  * replace full state from snapshot
* ensure idempotency

---

## 12. Edge Cases

### 12.1 Reconnect

* snapshot must fully restore state
* incremental events must be idempotent

---

### 12.2 Event Ordering

* WS guarantees order per connection
* reducers must tolerate duplicates

---

### 12.3 Partial State

* UI must handle:

  * session exists but no data yet
  * command exists but not loaded yet

---

## 13. Anti-Patterns to Avoid

* polling REST for live state
* mixing WS updates with local mutations
* updating UI directly from WS handlers
* bypassing state layer

---

## 14. Final Assessment

This refactor establishes:

> WebSocket = single runtime truth
> State layer = deterministic representation
> UI = pure projection

This is a foundational step for:

* plugin-based interpretation
* consistent multi-session behavior
* scalable frontend architecture