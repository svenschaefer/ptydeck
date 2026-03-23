# Refactoring Plan: Frontend Plugin & Stream Interpretation Layer

## 1. Objective

Introduce a **formal plugin-based interpretation layer** that:

- observes terminal streams (WebSocket)
- derives semantic meaning from raw output
- emits structured, deterministic actions
- enables extensibility without modifying core UI logic

This transforms ptydeck from:

> terminal viewer

into:

> interpreted execution workspace

---

## 2. Problem Statement

Currently:

- terminal output is rendered directly in UI
- interpretation (if any) is implicit and scattered
- new features (status, summaries, detection) would be implemented ad-hoc

### Result

- logic would accumulate inside `app.js`
- no reuse of interpretation logic
- no consistent mechanism for higher-level features

---

## 3. Core Principle

> Interpretation is separate from rendering.

- raw stream = transport
- plugins = meaning
- actions = effect
- UI = projection

---

## 4. Target Architecture

```text
WebSocket → Stream Adapter → Plugin Engine → Action Dispatcher → State → UI
````

---

## 5. Plugin System Overview

### Role of Plugins

Plugins:

* observe stream events
* detect patterns or conditions
* emit actions (never mutate state directly)

---

### Plugin Characteristics

* session-scoped
* isolated
* deterministic outputs
* no direct DOM access
* no direct side effects

---

## 6. Plugin Interface

### Conceptual API

```js id="z9h2kt"
plugin = {
  id: "string",

  onData(session, chunk) => Action[] | null,
  onLine(session, line) => Action[] | null,
  onIdle(session) => Action[] | null,
  onCommand(session, command) => Action[] | null
}
```

---

### Session Context

```js id="4v9j0x"
{
  id,
  state,
  lastActivityAt,
  meta,
  tags
}
```

---

## 7. Action Model

### Allowed Actions

#### State

```js id="y3a7cr"
setSessionState("busy" | "idle" | "error" | "streaming")
setSessionStatus(text)
```

---

#### UI Metadata

```js id="o6b2np"
setSessionTitle(text)
setSessionSubtitle(text)
setSessionBadge(icon)
markSessionAttention()
```

---

#### Artifacts

```js id="7n1w6z"
storeArtifact(name, value)
copyToClipboard(value)
```

---

#### Notifications

```js id="j4s9kd"
notify(message, severity)
```

---

#### Metadata

```js id="q2l7mf"
setSessionMeta(key, value)
setSessionTags([...])
```

---

## 8. Plugin Engine

### Responsibilities

* register plugins
* invoke plugins on events
* collect emitted actions
* resolve conflicts (priority, last-wins)
* forward actions to dispatcher

---

### Execution Flow

```text
stream event → plugins → actions → dispatcher → state update
```

---

### Conflict Handling

* deterministic ordering
* optional plugin priority
* last-wins for same action type

---

## 9. Built-in Plugin Examples

---

## 9.1 Working Detector (Codex)

### Pattern

```regex id="z6p3vb"
^Working \(\d+m \d+s .*?\)$
```

### Behavior

* detect active processing
* extract elapsed time

### Actions

```js id="2t7qkl"
[
  setSessionState("busy"),
  setSessionStatus(line),
  setSessionTitle(`[${line}] ${session.name}`)
]
```

---

## 9.2 Summary Extractor (Delimiter-Based)

### Trigger

```text id="p3k1mx"
────────────────────────────
```

### Behavior

* start capture after delimiter
* collect lines
* stop on idle

### Actions

```js id="c1v9op"
[
  storeArtifact("summary", text),
  copyToClipboard(text),
  notify("Summary ready", "info")
]
```

---

## 9.3 Activity Detector (Generic)

### Behavior

* track output frequency
* determine busy vs idle

### Actions

```js id="w8e4rz"
setSessionState("busy")
setSessionState("idle")
```

---

## 9.4 Error Detector

### Patterns

* `ERROR`
* `FAIL`
* exit code ≠ 0

### Actions

```js id="k2f5dx"
[
  setSessionState("error"),
  markSessionAttention()
]
```

---

## 9.5 Progress Parser

### Patterns

* `42%`
* `[ 73%]`

### Actions

```js id="r9h6wu"
setSessionMeta("progress", 42)
```

---

## 10. Stream Adapter Requirements

### Responsibilities

* reconstruct lines from chunks
* handle carriage return (`\r`)
* optional ANSI stripping
* track activity timestamps

---

### Output

```js id="x7n4qb"
onLine(sessionId, line)
onData(sessionId, chunk)
onIdle(sessionId)
```

---

## 11. State Integration

### Flow

```text
Plugin → Action → Reducer → New State
```

### Example

```js id="b8m2cn"
case "setSessionStatus":
  session.statusText = action.value
```

---

## 12. UI Integration

UI must:

* consume state only
* not interpret stream directly

---

### Example

```js id="e4k1ra"
if (session.state === "busy") {
  showSpinner()
}
```

---

## 13. Plugin Categories

### 13.1 Generic Plugins

* activity detection
* idle detection
* error detection

---

### 13.2 Tool-Specific Plugins

* git
* npm
* docker
* kubectl

---

### 13.3 Semantic Plugins

* summary extraction
* status parsing
* command-result mapping

---

### 13.4 Automation Plugins (optional)

* suggest next command
* prefill input
* trigger workflows

---

## 14. Design Constraints

### 14.1 Heuristic Nature

* terminal output is not structured
* all interpretation is best-effort

---

### 14.2 Deterministic Effects

* actions must be predictable
* no hidden side effects

---

### 14.3 Isolation

* plugins must not interfere directly
* communication only via actions

---

## 15. Refactoring Strategy

### Phase 1

* introduce plugin engine skeleton
* implement working detector

---

### Phase 2

* implement summary extractor
* integrate with state layer

---

### Phase 3

* add generic activity/error plugins

---

### Phase 4

* enable plugin registration system
* optional user-defined plugins

---

## 16. Benefits

### 16.1 Extensibility

* new features = new plugins
* no core modifications required

---

### 16.2 Maintainability

* logic isolated and reusable

---

### 16.3 Feature Velocity

* faster iteration on heuristics

---

### 16.4 Foundation for Automation

* structured outputs
* event-driven system

---

## 17. Risks if Not Implemented

* interpretation logic spreads across UI
* increasing coupling
* difficult to extend system
* fragile feature implementations

---

## 18. Final Assessment

The plugin layer is:

> the key abstraction that unlocks the next stage of ptydeck.

It enables:

* semantic understanding of terminal output
* structured UI behavior
* future automation capabilities

Without it:

* the system remains a viewer

With it:

* the system becomes an intelligent execution environment