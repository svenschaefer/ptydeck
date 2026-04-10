# Messaging Adapters

`ptydeck` now ships a single-user Telegram reference adapter on top of the provider-independent messaging contract.

Use it when you want:

- concise external session status updates
- bounded remote follow-up from a mapped Telegram chat
- a stable session-to-chat mapping without opening a second terminal UI

The adapter is intentionally not a remote shell.

## What It Can Do

The Telegram reference adapter can:

- send normalized outbound status, summary, idle, attention, control, and share updates for mapped sessions
- keep those updates compact through the shipped trigger profiles
- accept only the bounded inbound action set:
  - `/status`
  - `/stop`
  - `/retry`
  - `/replay`
  - `/replay l:N`
  - `/replay c:N`
  - `/replay sp:N`
- expose the same bounded actions through Telegram buttons on adapter-owned messages

## What It Cannot Do

The adapter does not:

- execute arbitrary shell input from Telegram
- bypass controller, read-only, share, or send-safety rules
- parse open-ended free-text intent
- mirror raw PTY chunks as a second terminal stream

If you need the exact command or settings contract, use the generated reference pages instead of repeating them here:

- [Slash command reference](../reference/commands.md)
- [API reference](../reference/api.md)

## Session Mapping

A Telegram target maps one ptydeck session to one chat destination.

Each mapping entry needs:

- `chatId`
- at least one selector:
  - `sessionId`
  - `quickIdToken`
  - `sessionName`

Optional fields:

- `messageThreadId`
- `profile`

The shipped trigger profiles are:

- `generic-shell`
- `coding-agent`
- `build-test`

## Bounded Inbound Semantics

### `status`

Returns a compact session status summary for the mapped session.

### `stop`

Requests a bounded stop against the mapped session.

Behavior:

- if the session is still active, `ptydeck` issues the normal stop path
- if the session is already gone, the command resolves idempotently as already stopped

### `retry`

Starts the mapped session again through the existing ptydeck restart/create path.

Behavior:

- if the session is still running, retry is rejected
- if the session already exited, the adapter retries from the last known bounded session snapshot instead of inventing a second runtime model

### `replay`

Returns a visible-text replay excerpt from the mapped session.

Defaults and bounds:

- `/replay` defaults to `l:40`
- `l:N` is bounded to a safe maximum
- `c:N` is bounded to a safe maximum
- `sp:N` is bounded and only works where shell-block tracking is actually available

## Operational Notes

- Telegram inbound is opt-in through backend config.
- Telegram outages must not make the ptydeck runtime unhealthy.
- `/health`, `/ready`, and `/metrics` expose adapter status and inbound polling counters.
- Because the system stays single-user, the adapter remains subordinate to the existing ptydeck runtime instead of introducing a separate authorization plane.

## Related Docs

- [DEPLOYMENT.md](../../DEPLOYMENT.md)
- [Messaging adapter concept](../ptydeck_messaging_adapter_framework_final_concept.md)
