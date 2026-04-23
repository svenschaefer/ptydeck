# WebSocket as Single Source of Truth

## Status

Current baseline after `v0.4.0-H153`.

The frontend runtime state model is reducer-first and WebSocket-driven for live runtime changes. REST remains available for bootstrap and explicit user-triggered mutations, but live session/deck/custom-command and session-interpretation changes are expected to converge through runtime events and store actions.

## Source-of-Truth Rule

Live runtime state must enter the frontend through one of these paths:

- WebSocket snapshot or runtime event
- explicit local runtime event produced from a confirmed user-triggered mutation
- initial REST bootstrap state before WebSocket readiness

UI code must not mutate session/deck/custom-command/interpretation state directly. It must use the store or a runtime event controller seam.

## Current Runtime Event Domains

### Snapshot

```json
{
  "type": "snapshot",
  "sessions": [],
  "decks": [],
  "customCommands": [],
  "outputs": []
}
```

The snapshot hydrates the reducer-first store, replays buffered terminal output, marks WebSocket bootstrap readiness, and schedules terminal stabilization.

### Sessions

Supported live events:

```json
{ "type": "session.created", "session": {} }
{ "type": "session.updated", "session": {} }
{ "type": "session.exit", "sessionId": "s1" }
{ "type": "session.activity.completed", "sessionId": "s1" }
{ "type": "session.closed", "sessionId": "s1" }
{ "type": "session.data", "sessionId": "s1", "data": "..." }
```

`session.data` is handled specially by the WebSocket runtime controller:

1. session-output observers run first
2. stream interpretation runs and may emit session interpretation actions
3. mounted terminal chunks are written
4. when no terminal is mounted, the event also falls through to generic runtime-event handling

### Decks

Supported live events:

```json
{ "type": "deck.created", "deck": {} }
{ "type": "deck.updated", "deck": {} }
{ "type": "deck.deleted", "deckId": "deck-a" }
```

### Custom Commands

Supported live events:

```json
{ "type": "custom-command.created", "command": {} }
{ "type": "custom-command.updated", "command": {} }
{ "type": "custom-command.deleted", "command": {} }
```

### Session Interpretation

`v0.4.0-H153` adds an explicit source-of-truth bridge for derived session state:

```json
{
  "type": "session.interpretation.apply",
  "sessionId": "s1",
  "actions": [
    { "type": "setSessionStatus", "value": "Ready" }
  ]
}
```

This event flows through `runtime-event-controller` into `store.applySessionInterpretationActions`. The same sink is used by the frontend stream-interpretation plugin engine.

## Store-Owned Interpretation State

The store owns these derived per-session fields:

- `interpretationState`
- `statusText`
- `attentionActive`
- `pluginBadges`
- `meta`
- `tags`
- `artifacts`
- `notifications`
- `commandCorrelations`

Allowed action types are listed in `docs/Frontend Plugin System for Terminal Stream Interpretation.md`.

## Frontend Seams

- `frontend/src/public/runtime-event-controller.js`
  - maps canonical runtime events to store/facade operations
- `frontend/src/public/ws-runtime-controller.js`
  - owns WebSocket message ordering, trace logging, stream interpretation invocation, and terminal data routing
- `frontend/src/public/stream-interpretation-plugin-engine.js`
  - owns plugin execution and normalized session interpretation action batches
- `frontend/src/public/store.js`
  - owns reducer state, normalization, limits, and command-correlation derivation

## Current Non-Goals

The current source-of-truth baseline does not add:

- semantic PTY interpretation plugins
- automatic outbound messaging

It also does not introduce any stack-replacement work. Future work should extend the current runtime shape in place unless `SAS` explicitly changes that direction.

## Validation Baseline

Regression coverage for the H153 source-of-truth extension lives in:

- `frontend/test/runtime-event-controller.test.js`
- `frontend/test/ws-runtime-controller.test.js`
- `frontend/test/stream-interpretation-plugin-engine.test.js`
- `frontend/test/store.test.js`
