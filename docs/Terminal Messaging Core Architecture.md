# Terminal Messaging Core Architecture

Last updated: 2026-04-17 (`v0.4.0-H145`)

## Purpose

This note records the current messaging-adapter architecture after the 2026-04-16 live-path reset.

The important distinction is:

- the repository still keeps a reusable messaging-adapter framework
- the live product path no longer performs automatic terminal-output-to-message interpretation

## Current Live Runtime

The shipped runtime in `backend/src/messaging-runtime.js` is `transport_only`.

Its live responsibilities are:

- adapter startup and shutdown
- Telegram command publication sync
- Telegram inbound polling and action execution
- target normalization
- Telegram forum-topic provisioning and persisted topic-binding reuse
- transport-level trace capture
- transport-level health and metrics
- explicit `MessageIntent` handoff to delivery adapters when another runtime seam constructs one deliberately

Its live responsibilities do not include:

- PTY chunk interpretation
- projection/shadow semantic comparison
- restart resend ledgers
- automatic reply extraction
- automatic section/summary extraction
- legacy/projection dual control flow
- app-specific trigger-profile inference for routing

## Retained Framework Pieces

The retained framework consists of:

- `backend/src/terminal-messaging-core.js`
  - descriptor factories for `DeliveryAdapter` and `MessageIntent`
- `backend/src/delivery-adapter-utils.js`
  - shared delivery shaping utilities
- `backend/src/messaging-custom-command-utils.js`
  - backend-local custom-command parsing, rendering, ordering, and shell-payload normalization used by the transport runtime and Telegram command surface without pulling frontend helper modules into the backend boundary
- `backend/src/telegram-adapter.js`
  - Telegram transport adapter
- `backend/src/discord-adapter.js`
  - Discord reference adapter
- `backend/src/telegram-command-surface.js`
  - canonical Telegram command publication/parsing seam

## Boundary Contracts Used By The Live Runtime

The live runtime now reports only these active boundary contracts:

- `DeliveryAdapter`
- `MessageIntent`

No projection-, turn-, output-episode-, or semantic-adapter descriptor contract remains in the shipped retained framework.

## Telegram Adapter Responsibilities

The Telegram adapter currently owns:

- command publication through `setMyCommands`
- inbound update polling
- Telegram callback handling
- mapped custom-command execution routing
- mapped plain-text-to-session-input forwarding
- forum-target validation
- per-session forum-topic provisioning and reuse
- explicit message send/edit behavior for adapter-visible events or explicit `MessageIntent` delivery
- adapter-local counters, backoff state, inbound trace, and target trace

## Discord Adapter Responsibilities

The Discord adapter is a reference delivery adapter.

It currently owns:

- normalized webhook/thread delivery for explicit `MessageIntent` objects
- adapter-local counters and target trace
- the same transport-neutral delivery-policy seam used by Telegram

The live runtime does not currently create automatic outbound intents for Discord either.

## Health and Metrics Surface

The runtime exposes:

- `messaging.mode = "transport_only"`
- `messaging.boundaryContracts = ["DeliveryAdapter", "MessageIntent"]`
- `messaging.adapters`
- `messaging.trace`
- adapter metric lines through `/metrics`

This is the authoritative current architecture surface.

Older semantic-primary, shadow-mode, projection, parity, and restart-ledger status fields are historical and no longer describe the shipped system.

## Why This Reset Happened

The earlier stream-to-message refactor produced a growing live-path mixture of:

- legacy compatibility behavior
- projection/shadow experimentation
- restart gating
- narrow allowlist exceptions
- classifier heuristics

That mixture became too difficult to reason about operationally.

The reset therefore removed automatic outbound semantics from the live path and kept only the transport foundation that still made architectural sense.

## What Future Work Must Respect

Any future third attempt must:

1. define one single authoritative live delivery pipeline
2. avoid production-time dual semantic authorities
3. keep experiments and replay work out of the live product path
4. prove behavior on an offline corpus before reactivation
5. reuse the retained adapter framework instead of rebuilding transport concerns again

See `docs/Messaging Reset and Third Attempt Notes.md` for the postmortem and the explicit constraints.
