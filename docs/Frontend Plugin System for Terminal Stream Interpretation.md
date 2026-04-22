# Frontend Plugin System for Terminal Stream Interpretation

## Status

Implemented baseline: `v0.4.0-H153`.

The frontend now has a small, deterministic stream-interpretation/plugin seam. It is intentionally infrastructure only. No semantic default plugin is active in production, and no automatic messaging behavior is reintroduced by this layer.

## Goal

Provide a clean extension point for future frontend-only interpretation of PTY/WebSocket runtime events while keeping UI state mutations centralized in the existing reducer-first store.

The layer is allowed to:

- observe WebSocket runtime events
- derive declarative session interpretation actions
- attach plugin attribution to badges, artifacts, and notifications
- isolate plugin failures from terminal rendering and runtime state updates

The layer is not allowed to:

- mutate DOM directly
- call backend APIs directly
- bypass the store
- send remote messages
- reintroduce historical Codex stream-to-message behavior

## Current Data Flow

```text
WebSocket event
  -> ws-runtime-controller
  -> stream-interpretation-plugin-engine
  -> session interpretation action batches
  -> store.applySessionInterpretationActions(sessionId, actions)
  -> session UI state
```

For explicit runtime events from backend or other frontend seams, the same store sink is available through:

```text
{ "type": "session.interpretation.apply", "sessionId": "...", "actions": [...] }
```

## Implemented Files

- `frontend/src/public/stream-interpretation-plugin-engine.js`
  - owns plugin registration, deterministic execution order, action filtering, plugin attribution, and error isolation
- `frontend/src/public/ws-runtime-controller.js`
  - invokes interpretation for `session.data` before terminal write and for other WebSocket runtime events after normal runtime-event application
- `frontend/src/public/runtime-event-controller.js`
  - handles explicit `session.interpretation.apply` events and forwards them to the store sink
- `frontend/src/public/store.js`
  - remains the single owner of normalized session interpretation state

`createAppRuntimeCompositionController` accepts an optional `streamInterpretationPlugins` array for wiring plugins into the runtime. The default production configuration keeps this array empty.

## Plugin Contract

A plugin is a plain object:

```js
{
  id: "example-plugin",
  priority: 10,
  eventTypes: ["session.data"],
  interpret(context) {
    return [
      { type: "setSessionStatus", value: "Ready" }
    ];
  }
}
```

Fields:

- `id`: required non-empty plugin identifier
- `priority`: optional numeric ordering key, lower values run first
- `eventTypes`: optional array of WebSocket/runtime event type names; omitted or empty means all event types
- `interpret(context)`: required function returning actions, a batch, or batches

Context fields:

- `type`: normalized event type
- `event`: original event object
- `sessionId`: normalized session id when available
- `session`: current session record when resolvable
- `data`: string data only for `session.data`
- `timestamp`: interpretation timestamp

## Return Shapes

A plugin may return an action array for the current session:

```js
[
  { type: "setSessionStatus", value: "Running" }
]
```

A plugin may return an explicit batch:

```js
{
  sessionId: "s1",
  actions: [
    { type: "markSessionAttention", active: true }
  ]
}
```

A plugin may return multiple batches:

```js
{
  batches: [
    { sessionId: "s1", actions: [...] },
    { sessionId: "s2", actions: [...] }
  ]
}
```

Invalid actions and empty batches are ignored. Plugin exceptions are returned as non-fatal interpretation errors and logged by the WebSocket runtime controller.

## Allowed Action Vocabulary

The engine only forwards actions that match the store-owned session interpretation vocabulary:

- `setSessionState`
- `setSessionStatus`
- `markSessionAttention`
- `setSessionBadges`
- `mergeSessionMeta`
- `setSessionTags`
- `upsertSessionArtifact`
- `removeSessionArtifact`
- `pushSessionNotification`

The store owns normalization, limits, deduplication, and derived command-correlation updates for those actions.

## Attribution

The plugin engine attaches the plugin id to nested records when the plugin did not provide one:

- badges in `setSessionBadges`
- artifacts in `upsertSessionArtifact`
- notifications in `pushSessionNotification`

This keeps later UI and debugging surfaces able to identify which plugin produced visible derived state.

## Failure Semantics

Plugin failures must not break terminal rendering or runtime state application.

Current behavior:

- exceptions are caught per plugin
- valid actions from other plugins still apply
- errors are logged as `ws.interpretation.error`
- terminal chunks continue to be written after interpretation failure

## Non-Goals

The H153 baseline deliberately does not implement:

- Codex-specific working-line detection
- summary extraction
- idle detection
- outbound messaging
- remote adapter actions
- DOM-side effects
- clipboard actions
- backend protocol changes beyond recognizing `session.interpretation.apply` on the frontend runtime-event controller

Any future semantic plugin must be introduced as an explicit task with corpus-backed tests if it affects user-visible automation.

## Test Coverage

Regression coverage lives in:

- `frontend/test/stream-interpretation-plugin-engine.test.js`
- `frontend/test/ws-runtime-controller.test.js`
- `frontend/test/runtime-event-controller.test.js`
- `frontend/test/store.test.js`

The focused H153 test scope proves:

- plugin ordering
- action filtering
- plugin id attribution
- explicit multi-session batches
- plugin failure isolation
- `session.data` interpretation before terminal write
- `session.interpretation.apply` dispatch into the store sink
