# API Reference

Generated from `backend/openapi/openapi.yaml`.

The operator API is served under `/api/v1`, REST calls use bearer auth, and WebSocket upgrades use the short-lived ticket minted by `/auth/ws-ticket`.

## Authentication

### `/auth/dev-token`

- **POST** Create development bearer token (available only in auth dev mode).
  Operation ID: `createDevToken`
  Request body: optional or none
  Auth note: Development bootstrap route. Available only when auth dev mode is enabled.
  Responses: `200` Token created; `400` Invalid request; `404` Auth dev mode is disabled; `426` TLS required

### `/auth/ws-ticket`

- **POST** Create a short-lived one-time WebSocket handshake ticket from an authenticated bearer session.
  Operation ID: `createWsTicket`
  Request body: optional or none
  Auth note: Bearer-authenticated route that returns a one-time WebSocket ticket for the browser client.
  Responses: `200` WebSocket ticket created; `400` Invalid request; `401` Missing or invalid bearer token; `403` Missing ws:connect scope; `426` TLS required

## Connection Profiles

### `/connection-profiles`

- **GET** List persisted connection profiles.
  Operation ID: `listConnectionProfiles`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Connection profile list; `426` TLS required
- **POST** Create a persisted connection profile.
  Operation ID: `createConnectionProfile`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `201` Connection profile created; `400` Invalid request; `409` Connection profile id already exists; `426` TLS required

### `/connection-profiles/{profileId}`

- **GET** Get connection profile by id.
  Operation ID: `getConnectionProfile`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Connection profile found; `404` Connection profile not found; `426` TLS required
- **PATCH** Update persisted connection profile metadata/launch settings.
  Operation ID: `updateConnectionProfile`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Connection profile updated; `400` Invalid request; `404` Connection profile not found; `426` TLS required
- **DELETE** Delete persisted connection profile by id.
  Operation ID: `deleteConnectionProfile`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Connection profile deleted; `404` Connection profile not found; `426` TLS required

## Custom Commands

### `/custom-commands`

- **GET** List persisted custom commands.
  Operation ID: `listCustomCommands`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Custom command list; `426` TLS required

### `/custom-commands/{commandName}`

- **GET** Get custom command by name.
  Operation ID: `getCustomCommand`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Custom command found; `404` Custom command not found; `409` Custom command name resolves to multiple scoped commands; `426` TLS required
- **PUT** Create or overwrite custom command by name.
  Operation ID: `upsertCustomCommand`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Custom command upserted; `400` Invalid request; `409` Custom command name conflict or limit exceeded; `426` TLS required
- **DELETE** Delete custom command by name.
  Operation ID: `deleteCustomCommand`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Custom command deleted; `404` Custom command not found; `409` Custom command name resolves to multiple scoped commands; `426` TLS required

## Decks

### `/decks`

- **GET** List decks.
  Operation ID: `listDecks`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Deck list; `426` TLS required
- **POST** Create deck.
  Operation ID: `createDeck`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `201` Deck created; `400` Invalid request; `409` Deck id already exists; `426` TLS required

### `/decks/{deckId}`

- **GET** Get deck by id.
  Operation ID: `getDeck`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Deck found; `404` Deck not found; `426` TLS required
- **PATCH** Update deck metadata/settings.
  Operation ID: `updateDeck`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Deck updated; `400` Invalid request; `404` Deck not found; `426` TLS required
- **DELETE** Delete deck by id.
  Operation ID: `deleteDeck`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Deck deleted; `400` Invalid query parameter; `404` Deck not found; `409` Deck delete conflict; `426` TLS required

### `/decks/{deckId}/sessions/{sessionId}:move`

- **POST** Move session to deck.
  Operation ID: `moveSessionToDeck`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Move accepted; `404` Deck or session not found; `426` TLS required

## Layout Profiles

### `/layout-profiles`

- **GET** List persisted layout profiles.
  Operation ID: `listLayoutProfiles`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Layout profile list; `426` TLS required
- **POST** Create a persisted layout profile.
  Operation ID: `createLayoutProfile`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `201` Layout profile created; `400` Invalid request; `409` Layout profile id already exists; `426` TLS required

### `/layout-profiles/{profileId}`

- **GET** Get layout profile by id.
  Operation ID: `getLayoutProfile`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Layout profile found; `404` Layout profile not found; `426` TLS required
- **PATCH** Update persisted layout profile metadata/layout.
  Operation ID: `updateLayoutProfile`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Layout profile updated; `400` Invalid request; `404` Layout profile not found; `426` TLS required
- **DELETE** Delete persisted layout profile by id.
  Operation ID: `deleteLayoutProfile`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Layout profile deleted; `404` Layout profile not found; `426` TLS required

## Sessions

### `/sessions`

- **GET** List sessions
  Operation ID: `listSessions`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Session list; `426` TLS required
- **POST** Create session
  Operation ID: `createSession`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `201` Session created; `400` Invalid request; `409` Session concurrency limit exceeded; `429` Rate limit exceeded; `426` TLS required

### `/sessions/{sessionId}`

- **GET** Get session
  Operation ID: `getSession`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Session found; `404` Session not found; `426` TLS required
- **DELETE** Delete session
  Operation ID: `deleteSession`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Session deleted; `404` Session not found; `426` TLS required
- **PATCH** Update session metadata
  Operation ID: `updateSession`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Session updated; `400` Invalid request; `404` Session not found; `426` TLS required

### `/sessions/{sessionId}/control/forget-client`

- **POST** Forget a stale offline trusted-local device attachment for the current session.
  Operation ID: `forgetSessionControlClient`
  Request body: required
  Auth note: Bearer-authenticated operator route with explicit auth/scope failures in the contract.
  Responses: `200` Stale device forgotten; `403` Control denied; `409` Target client is still active or not attached; `426` TLS required

### `/sessions/{sessionId}/control/release`

- **POST** Release active control of a session for the current controller.
  Operation ID: `releaseSessionControl`
  Request body: optional or none
  Auth note: Bearer-authenticated operator route with explicit auth/scope failures in the contract.
  Responses: `200` Session control released; `403` Control denied; `409` No active attached client or no current controller; `426` TLS required

### `/sessions/{sessionId}/control/rename-client`

- **POST** Rename the current trusted-local attached client for reconnect and handoff flows.
  Operation ID: `renameSessionControlClient`
  Request body: required
  Auth note: Bearer-authenticated operator route with explicit auth/scope failures in the contract.
  Responses: `200` Trusted-local client renamed; `403` Control denied; `409` No active attached client is available for rename; `426` TLS required

### `/sessions/{sessionId}/control/take`

- **POST** Take active control of a session for the current attached client.
  Operation ID: `takeSessionControl`
  Request body: optional or none
  Auth note: Bearer-authenticated operator route with explicit auth/scope failures in the contract.
  Responses: `200` Session control transferred to the requesting client; `403` Control denied; `409` No active attached client or another controller still owns the session; `426` TLS required

### `/sessions/{sessionId}/control/transfer`

- **POST** Transfer active control to another attached client.
  Operation ID: `transferSessionControl`
  Request body: required
  Auth note: Bearer-authenticated operator route with explicit auth/scope failures in the contract.
  Responses: `200` Session control transferred to the target client; `403` Control denied; `409` Target client is not actively attached; `426` TLS required

### `/sessions/{sessionId}/file-transfer/download`

- **POST** Download a bounded file payload relative to the current local session root.
  Operation ID: `downloadSessionFile`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` File payload downloaded; `400` Invalid request; `404` Session or file not found; `409` Transfer unsupported or unavailable; `413` File exceeds transfer size limit; `426` TLS required

### `/sessions/{sessionId}/file-transfer/upload`

- **POST** Upload a bounded file payload relative to the current local session root.
  Operation ID: `uploadSessionFile`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` File payload uploaded; `400` Invalid request; `404` Session not found; `409` Transfer unsupported or unavailable; `413` File exceeds transfer size limit; `426` TLS required

### `/sessions/{sessionId}/input`

- **POST** Send input bytes to a session PTY.
  Operation ID: `sendInput`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Input accepted; `404` Session not found; `426` TLS required

### `/sessions/{sessionId}/interrupt`

- **POST** Send SIGINT to the session PTY process.
  Operation ID: `interruptSession`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Interrupt accepted; `404` Session not found; `426` TLS required

### `/sessions/{sessionId}/kill`

- **POST** Send SIGKILL to the session PTY process.
  Operation ID: `killSession`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Kill accepted; `404` Session not found; `426` TLS required

### `/sessions/{sessionId}/replay-excerpt`

- **GET** Extract a normalized visible-text replay excerpt for a session.
  Operation ID: `getSessionReplayExcerpt`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Replay excerpt payload; `400` Invalid replay excerpt selector; `404` Session not found; `409` Requested replay excerpt mode is unavailable for the session; `426` TLS required

### `/sessions/{sessionId}/replay-export`

- **GET** Export the currently retained replay tail for a session.
  Operation ID: `getSessionReplayExport`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Replay export payload; `404` Session not found; `426` TLS required

### `/sessions/{sessionId}/resize`

- **POST** Resize session terminal dimensions.
  Operation ID: `resizeSession`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Resize accepted; `404` Session not found; `426` TLS required

### `/sessions/{sessionId}/restart`

- **POST** Restart session process while preserving session identity.
  Operation ID: `restartSession`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Session restarted; `404` Session not found; `426` TLS required

### `/sessions/{sessionId}/swap-quick-id`

- **POST** Swap persisted quick-id tokens between two sessions.
  Operation ID: `swapSessionQuickId`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Quick-id tokens swapped; `400` Invalid request; `404` Session not found; `426` TLS required

### `/sessions/{sessionId}/terminate`

- **POST** Send SIGTERM to the session PTY process.
  Operation ID: `terminateSession`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Terminate accepted; `404` Session not found; `426` TLS required

## Shares

### `/shares`

- **GET** List persisted read-only share links.
  Operation ID: `listShares`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Share link list; `426` TLS required
- **POST** Create a read-only spectator share link for a session or deck.
  Operation ID: `createShareLink`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `201` Share link created; `400` Invalid request; `404` Target not found; `426` TLS required

### `/shares/{shareId}`

- **GET** Get share link metadata by id.
  Operation ID: `getShareLink`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Share link found; `404` Share link not found; `426` TLS required

### `/shares/{shareId}/revoke`

- **POST** Revoke a read-only spectator share link.
  Operation ID: `revokeShareLink`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Share link revoked; `404` Share link not found; `426` TLS required

## ssh host key probe

### `/ssh-host-key-probe`

- **POST** Probe SSH host keys for a target before trusting one.
  Operation ID: `probeSshHostKeys`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Probed SSH host keys for the requested target; `400` Invalid request; `502` SSH host-key probe failed; `503` SSH host-key probe unavailable; `504` SSH host-key probe timed out; `426` TLS required

## SSH Trust

### `/ssh-trust-entries`

- **GET** List persisted SSH host-key trust entries.
  Operation ID: `listSshTrustEntries`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` SSH trust entry list; `426` TLS required
- **POST** Create or reuse a persisted SSH host-key trust entry.
  Operation ID: `createSshTrustEntry`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Existing trust entry reused; `201` Trust entry created; `400` Invalid request; `409` Trust entry conflicts with an existing host/key-type mapping; `426` TLS required

### `/ssh-trust-entries/{entryId}`

- **DELETE** Delete a persisted SSH host-key trust entry.
  Operation ID: `deleteSshTrustEntry`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Trust entry deleted; `404` Trust entry not found; `426` TLS required

## Workspace Presets

### `/workspace-presets`

- **GET** List persisted workspace presets.
  Operation ID: `listWorkspacePresets`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Workspace preset list; `426` TLS required
- **POST** Create a persisted workspace preset.
  Operation ID: `createWorkspacePreset`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `201` Workspace preset created; `400` Invalid request; `409` Workspace preset id already exists; `426` TLS required

### `/workspace-presets/{presetId}`

- **GET** Get workspace preset by id.
  Operation ID: `getWorkspacePreset`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Workspace preset found; `404` Workspace preset not found; `426` TLS required
- **PATCH** Update persisted workspace preset metadata/workspace.
  Operation ID: `updateWorkspacePreset`
  Request body: required
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `200` Workspace preset updated; `400` Invalid request; `404` Workspace preset not found; `426` TLS required
- **DELETE** Delete persisted workspace preset by id.
  Operation ID: `deleteWorkspacePreset`
  Request body: optional or none
  Auth note: Operator route under `/api/v1`; share spectators use share URLs instead of this route family.
  Responses: `204` Workspace preset deleted; `404` Workspace preset not found; `426` TLS required

