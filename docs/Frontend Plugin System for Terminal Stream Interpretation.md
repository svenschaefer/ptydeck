# Frontend Plugin System for Terminal Stream Interpretation

## 1. Objective

Define a **frontend-only plugin architecture** that interprets terminal streams (PTY over WebSocket) and derives higher-level semantics such as:

- activity state (busy / idle)
- status messages
- summaries / artifacts

The system must remain:

- deterministic at the action layer
- heuristic at the interpretation layer
- non-invasive (no backend dependency)

---

## 2. Core Principle

> The terminal is an unstructured byte stream.  
> Meaning is derived via interpretation, not provided explicitly.

Therefore:

- plugins observe the stream
- plugins infer state
- plugins emit declarative actions
- the system executes actions in a controlled way

---

## 3. Architecture Overview

```text
WebSocket → Stream Adapter → Plugin Engine → Action Dispatcher → UI State
````

### Components

#### 3.1 Stream Adapter

* reconstructs lines from chunks
* tracks activity timestamps
* optionally strips ANSI

Emits:

* `onData(sessionId, chunk)`
* `onLine(sessionId, line)`
* `onIdle(sessionId)`

---

#### 3.2 Plugin Engine

* runs all registered plugins
* collects emitted actions
* resolves conflicts (priority / last-wins)

---

#### 3.3 Action Dispatcher

* executes allowed actions only
* updates UI state or triggers side effects

---

#### 3.4 UI State Layer

* session status
* badges / titles
* artifacts
* notifications

---

## 4. Plugin Model

### Interface (conceptual)

```js
plugin = {
  id: "string",

  onLine(session, line) => Action[] | null,
  onData(session, chunk) => Action[] | null,
  onIdle(session) => Action[] | null
}
```

### Constraints

* no direct DOM access
* no side-effects outside actions
* idempotent behavior
* isolated per session

---

## 5. Action Model

### Allowed Actions

#### Status / State

* `setSessionState(busy | idle | error | streaming)`
* `setSessionStatus(text)`

#### Title / Label

* `setSessionTitle(text)`
* `setSessionSubtitle(text)`

#### Visual

* `setSessionBadge(icon | color)`
* `markSessionAttention()`

#### Artifacts

* `storeArtifact(name, text)`
* `copyToClipboard(text)`

#### Notifications

* `notify(message, severity)`

#### Metadata

* `setSessionMeta(key, value)`
* `setSessionTags([...])`

---

## 6. Codex Use Case 1: "Working …" Detection

### Problem

Codex emits a continuously updating line:

```
Working (4m 32s • esc to interrupt)
```

This line:

* is updated in-place (via `\r`)
* represents active processing
* contains a time counter

---

### Detection Strategy

#### Pattern

```regex
^Working \(\d+m \d+s .*?\)$
```

#### Behavior

* match against **last visible line**
* tolerate missing newline
* handle overwrite via carriage return

---

### State Model

| Condition               | State |
| ----------------------- | ----- |
| pattern matches         | busy  |
| no match + prompt found | idle  |

---

### Actions

```js
[
  setSessionState("busy"),
  setSessionStatus(line),
  setSessionTitle(`[${line}] ${session.name}`)
]
```

---

### Optional Enhancements

* extract elapsed time → numeric value
* animate UI independently (not from stream)
* show progress indicator

---

### Exit Condition

* pattern disappears OR
* prompt detected OR
* idle timeout

---

## 7. Codex Use Case 2: Summary Extraction via Delimiter

### Problem

Codex emits a delimiter line:

```
────────────────────────────
```

followed by a summary block.

Goal:

* extract this block
* make it available as structured output

---

### Detection Strategy

#### Start Trigger

```js
line.startsWith("──") && line.length > threshold
```

---

### Capture Phase

* start buffering lines after delimiter
* include multiline output

---

### End Condition

Combination of:

* idle timeout (e.g. 1000 ms without output)
* optional prompt detection

---

### Extraction

* join buffered lines
* trim whitespace
* optionally strip ANSI

---

### Actions

```js
[
  storeArtifact("summary", text),
  copyToClipboard(text),
  notify("Summary ready", "info"),
  setSessionBadge("summary-available")
]
```

---

### UX Options

* icon on session card
* one-click copy
* expandable summary view

---

## 8. Generalization Potential

The same pattern applies broadly.

---

### 8.1 Activity Detection

Generic:

* output frequency
* known patterns (spinners, progress)

Derived states:

* busy
* idle
* streaming

---

### 8.2 Progress Extraction

Examples:

* `Receiving objects: 42%`
* `[ 73%] Building`

→ extract numeric progress

---

### 8.3 Error Detection

Patterns:

* `ERROR`
* `FAIL`
* exit codes

Actions:

* `setSessionState("error")`
* `markSessionAttention()`

---

### 8.4 Tool-Specific Plugins

Examples:

#### git

* detect branch
* detect clean/dirty state

#### docker

* build steps
* image success

#### npm

* install success / vulnerabilities

---

### 8.5 Streaming Mode Detection

Tools like:

* `tail -f`
* `journalctl -f`

→ classify as:

* `streaming` (no completion expected)

---

### 8.6 Command Correlation

Track:

* last command
* resulting output

→ enables:

* command-result mapping
* retry suggestions

---

### 8.7 Automation Hooks (optional)

* suggest commands
* pre-fill input
* trigger follow-ups (with safeguards)

---

### 8.8 External Integration

* send summaries to API
* webhook triggers
* AI post-processing

---

## 9. Design Constraints

### 9.1 Heuristic Nature

* no guaranteed correctness
* depends on output format
* must fail safely

---

### 9.2 ANSI Complexity

* cursor movement
* overwritten lines

Mitigation:

* basic ANSI stripping
* or use terminal buffer abstraction

---

### 9.3 Chunking

* data not line-aligned
* requires buffering

---

## 10. Recommended Implementation Phases

### Phase 1

* Stream adapter
* plugin engine
* working detector
* summary extractor

---

### Phase 2

* generic activity detection
* error detection
* artifact storage UI

---

### Phase 3

* tool-specific plugins
* progress extraction
* notifications

---

### Phase 4 (optional)

* backend signals (structured events)
* shared plugin registry
* persistence / replay

---

## 11. Final Assessment

The plugin system transforms the terminal from:

> passive output viewer

into:

> interpreted execution environment

Key property:

* **interpretation remains flexible**
* **actions remain deterministic**

This preserves system control while enabling rich, context-aware UX without backend changes.