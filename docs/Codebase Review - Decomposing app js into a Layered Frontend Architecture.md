# Refactoring Plan: Decomposing `app.js` into a Layered Frontend Architecture

## 1. Objective

Refactor the current `app.js` monolith into a **modular, layered frontend architecture** that:

- separates concerns cleanly
- enables a plugin/stream interpretation system
- improves maintainability and testability
- prevents further architectural erosion

---

## 2. Problem Statement

`app.js` currently combines multiple responsibilities:

- terminal lifecycle (xterm instances, attach/detach, resize)
- WebSocket event handling
- session state management
- UI rendering and DOM manipulation
- command parsing and execution
- autocomplete and suggestions
- settings dialogs (cwd, env, theme, tags)
- snapshot replay
- routing and filtering

### Resulting Issues

- tight coupling across unrelated concerns
- implicit shared state
- difficult reasoning about data flow
- high regression risk
- no clear extension point (e.g. plugins)

---

## 3. Target Architecture

### High-Level Layers

```text
WebSocket → Stream Layer → Interpretation Layer → State Layer → UI Layer
````

---

## 4. Layer Definitions

## 4.1 Stream Layer

### Responsibility

* handle raw WebSocket communication
* reconstruct terminal data streams
* normalize input/output events

### Responsibilities in Detail

* connect/reconnect WS
* map WS events to session-scoped streams
* reconstruct lines from chunks
* track activity timestamps
* detect idle (time-based)

### Output

Emits normalized events:

```js
onData(sessionId, chunk)
onLine(sessionId, line)
onIdle(sessionId)
onSessionEvent(event)
```

### Notes

* no UI logic
* no interpretation
* pure transport + normalization

---

## 4.2 Interpretation Layer (Plugin System)

### Responsibility

* interpret terminal streams
* detect patterns (working, summary, errors)
* emit semantic actions

### Design

* plugin-based
* stateless or explicitly stateful per session

### Input

```js
onLine(session, line)
onData(session, chunk)
onIdle(session)
onCommand(session, command)
```

### Output

Declarative actions:

```js
[
  { type: "setSessionState", value: "busy" },
  { type: "setSessionStatus", value: "Working (4m 32s)" },
  { type: "storeArtifact", name: "summary", value: "..." }
]
```

### Examples

* Working detector
* Summary extractor
* Error detector
* Progress parser

---

## 4.3 State Layer (View Model)

### Responsibility

* maintain canonical frontend state
* apply actions deterministically
* expose reactive state to UI

### State Model (example)

```js
{
  sessions: {
    [sessionId]: {
      id,
      name,
      state,        // running | busy | idle | exited
      statusText,
      title,
      tags,
      meta,
      artifacts,
      lastActivityAt
    }
  }
}
```

### Responsibilities

* merge WS events + plugin actions
* enforce state transitions
* maintain consistency

### Rules

* no direct WS access
* no DOM access
* pure state transitions

---

## 4.4 Command Layer

### Responsibility

* parse user input
* handle slash commands
* manage autocomplete and suggestions
* transform input into terminal writes

### Separation

Split into:

* `command-parser`
* `command-registry`
* `command-executor`

### Input

* user input (textarea)
* session context

### Output

* commands sent to backend
* suggestions / previews

---

## 4.5 UI Layer

### Responsibility

* render state
* handle user interaction
* display terminals and metadata

### Subcomponents

* terminal grid
* session card
* settings dialog
* command input
* status indicators

### Rules

* no business logic
* no stream parsing
* consumes state only

---

## 5. Module Breakdown

### Suggested File Structure

```text
frontend/
  stream/
    ws-client.js
    stream-adapter.js

  interpretation/
    plugin-engine.js
    plugins/
      working-detector.js
      summary-extractor.js

  state/
    store.js
    reducers.js

  commands/
    command-parser.js
    command-registry.js
    command-executor.js

  ui/
    components/
      terminal-card.js
      session-grid.js
      settings-dialog.js
    app-shell.js

  app.js (bootstrap only)
```

---

## 6. Refactoring Strategy

### Phase 1: Extract Stream Layer

* move WS logic out of `app.js`
* introduce `stream-adapter`
* emit normalized events

---

### Phase 2: Introduce State Layer

* central store (existing `store.js` can evolve)
* move session state updates out of UI

---

### Phase 3: Extract Command Layer

* isolate parsing and execution
* remove command logic from UI rendering

---

### Phase 4: Introduce Interpretation Layer

* implement plugin engine
* migrate:

  * working detection
  * summary extraction

---

### Phase 5: Simplify UI Layer

* convert UI to pure state consumer
* remove implicit logic

---

## 7. Design Principles

### 7.1 Single Responsibility

Each layer must have exactly one concern:

* stream = transport
* interpretation = meaning
* state = truth
* UI = rendering

---

### 7.2 Declarative Actions

Plugins do not mutate state directly:

```js
return [{ type: "setSessionStatus", value: "Working..." }]
```

---

### 7.3 Deterministic State

All state changes go through:

```text
Action → Reducer → New State
```

---

### 7.4 Isolation

* no cross-layer shortcuts
* no hidden dependencies

---

## 8. Benefits

### 8.1 Enables Plugin System

* clear insertion point (interpretation layer)
* no pollution of UI code

---

### 8.2 Improves Maintainability

* smaller modules
* easier reasoning
* localized changes

---

### 8.3 Reduces Risk

* fewer side effects
* predictable data flow

---

### 8.4 Enables Advanced Features

* terminal intelligence
* automation hooks
* tool-aware UX

---

## 9. Risks if Not Refactored

* `app.js` continues to grow
* plugin logic becomes entangled with UI
* increasing fragility
* blocked evolution toward intelligent terminal

---

## 10. Final Assessment

The current system is at a **critical architectural transition point**.

> Continuing feature development without refactoring will degrade system quality.

Refactoring `app.js` into a layered architecture is the **highest-leverage technical step** to:

* stabilize the system
* enable your planned features (status, summary, automation)
* prepare for long-term evolution
