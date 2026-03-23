# ptydeck Codebase Review

## 1. Executive Summary

ptydeck is already beyond a simple terminal wrapper. It represents a **multi-session terminal workspace with orchestration capabilities**, including:

- session lifecycle management
- centralized command input
- per-session configuration (cwd, env, theme, tags)
- persistence and recovery
- WebSocket-driven real-time interaction

The architecture shows clear intent and structure. However, the system has reached a point where **further feature development without structural refinement will increase complexity and risk**.

---

## 2. Key Strengths

### 2.1 Strong Product Concept

The system is not just a terminal UI, but a **workspace abstraction**:

- multiple concurrent sessions (grid-based)
- centralized command layer
- session metadata and configuration
- theme and environment control

This is a solid foundation for higher-level orchestration (e.g. plugins, automation).

---

### 2.2 Backend Modularity

Backend components are well separated:

- session management (PTY lifecycle)
- runtime (HTTP + WS orchestration)
- validation layer
- persistence (with atomic writes)
- authentication (even if dev-focused)

This separation is structurally sound.

---

### 2.3 Defensive Engineering

Notable quality aspects:

- strict input validation
- environment normalization
- safe persistence (temp file + rename)
- optional encryption (AES-GCM)
- “unrestored session” handling

These indicate deliberate robustness beyond typical prototypes.

---

### 2.4 Frontend Capability

The frontend supports:

- multi-session rendering
- dynamic resizing
- snapshot replay
- command interpretation and autocomplete
- advanced settings UI

This is already a complex UI system, not a thin client.

---

## 3. Major Architectural Issues

### 3.1 `app.js` as Central Monolith

The frontend has a clear structural problem:

> `app.js` currently acts as the main convergence point for multiple concerns.

It includes:

- UI rendering
- terminal lifecycle
- xterm integration
- command parsing and execution
- autocomplete logic
- session settings handling
- theme management
- snapshot replay
- routing logic

#### Impact

- high coupling
- difficult extensibility (especially for plugins)
- increased regression risk

#### Recommendation

Split into clear layers:

- `terminal-stream` (PTY + WS handling)
- `session-view-model` (state abstraction)
- `command-engine` (slash commands, parsing)
- `ui/components` (rendering + dialogs)

---

### 3.2 Missing Handling of `session.exit`

Backend emits:

```

session.exit

```

Frontend appears to handle:

- `session.created`
- `session.data`
- `session.closed`
- `snapshot`

But not `session.exit`.

#### Impact

- stale sessions remain visible
- inconsistent UI state after process termination

#### Recommendation

- explicitly handle `session.exit`
- update session state to `exited`
- optionally mark visually or remove

---

### 3.3 WebSocket vs REST Inconsistency (Custom Commands)

Backend emits:

- `custom-command.created`
- `custom-command.updated`
- `custom-command.deleted`

Frontend still relies on:

- repeated REST calls (`listCustomCommands()`)

#### Impact

- duplicated data flow
- potential inconsistencies
- unnecessary network overhead

#### Recommendation

- treat WS as primary state source
- maintain local cache
- REST only for initial load

---

## 4. Security Concerns

### 4.1 Token via Query Parameter

WebSocket uses:

```

?access_token=...

```

Additionally, debug logging prints the full URL.

#### Risks

- token leakage via logs
- exposure in browser history / proxies

#### Recommendation

- use headers or short-lived handshake tokens
- never log full URLs containing tokens

---

### 4.2 Dev Token Endpoint Exposure

Endpoint:

```

/api/v1/auth/dev-token

````

Appears callable without authentication.

#### Risks

- arbitrary token generation
- full system access if exposed

#### Recommendation

- restrict to localhost or dev mode explicitly
- enforce environment-based guards

---

### 4.3 Auth Model is Dev-Centric

Current model:

- `AUTH_ENABLED` tied to `AUTH_DEV_MODE`
- default secret fallback

#### Impact

- no clear production-grade auth path

#### Recommendation

- separate:
  - dev bootstrap auth
  - production auth (JWT/OIDC)

---

## 5. API Contract Drift

The provided API types:

```ts
type Session = {
  id: string;
  cwd: string;
  shell: string;
  name?: string;
  createdAt: number;
  updatedAt: number;
};
````

Actual runtime session includes more fields:

* `state`
* `startCwd`
* `startCommand`
* `env`
* `tags`
* `themeProfile`

#### Impact

* broken contract boundary
* unsafe for external consumers

#### Recommendation

* regenerate OpenAPI spec
* ensure full alignment with runtime model

---

## 6. Terminal / PTY Layer Observations

### 6.1 Shell-Specific CWD Tracking

* bash-specific (`PROMPT_COMMAND`)
* other shells not equally supported

#### Impact

* inconsistent behavior across shells

#### Recommendation

* either:

  * document limitation
  * or introduce shell adapters

---

### 6.2 Limited Replay Buffer

* only recent output stored
* snapshot replays partial history

#### Impact

* no full session recovery
* limited debugging capability

#### Recommendation

* explicitly define as product constraint
* or extend to configurable scrollback

---

### 6.3 xterm Internal API Usage

Frontend accesses:

* `_core._renderService` (private internals)

#### Risks

* fragile against library updates

#### Recommendation

* isolate in compatibility layer
* avoid direct reliance in core logic

---

## 7. Data Flow & State Observations

### 7.1 WebSocket as Source of Truth (Partially)

The system is already close to:

> WebSocket = real-time state backbone

But not fully consistent.

#### Recommendation

* unify state flow around WS
* avoid mixed paradigms (WS + REST polling)

---

### 7.2 Snapshot & Recovery Design

Positive:

* snapshot-based sync
* detection of “unrestored sessions”

Limitation:

* not a full state replay system

---

## 8. Codebase Consistency Issues

Some references suggest missing or mismatched files:

* `theme-library.js`
* `rate-limiter.js`
* `loadClientConfig` mismatch

#### Interpretation

* likely incomplete snapshot of repo
* or drift between modules

#### Recommendation

* ensure internal consistency
* validate imports during build

---

## 9. Frontend Quality Notes

### Positive

* avoids obvious XSS patterns (`textContent` usage)
* structured DOM handling
* advanced UI capabilities

### Risk Areas

* growing complexity in single file
* implicit state coupling
* difficult to test in isolation

---

## 10. Priority Recommendations

### Must Fix

1. Handle `session.exit` correctly
2. Remove token from query string + logging
3. Protect `/auth/dev-token` endpoint
4. Split `app.js` into structured modules

---

### Should Fix

5. Align WebSocket and REST data flows
6. Restore API contract correctness
7. Clarify authentication model (dev vs prod)
8. Isolate xterm internals

---

### Nice to Have

9. Improve scrollback/replay model
10. Add shell abstraction layer
11. Introduce plugin-ready architecture
12. Formalize state model (session lifecycle)

---

## 11. Strategic Assessment

ptydeck is transitioning from:

> terminal UI

to:

> interpreted execution workspace

This shift is already visible in:

* command layer
* session metadata
* persistence
* UI complexity

The next step is not more features, but:

> **structural consolidation and architectural clarity**

---

## 12. Final Conclusion

ptydeck is:

* technically solid
* conceptually strong
* already feature-rich

However:

> the system has reached the point where architecture matters more than functionality.

Addressing the identified issues will:

* enable plugin systems
* improve reliability
* reduce risk of regressions
* prepare the system for scaling (features and usage)