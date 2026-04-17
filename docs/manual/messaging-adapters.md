# Messaging Adapters

`ptydeck` currently ships a transport-only messaging-adapter baseline.

That baseline keeps:

- Telegram inbound polling and command/input handling
- Telegram forum-topic provisioning and persisted topic bindings
- explicit `MessageIntent` delivery support through Telegram and Discord adapters
- adapter health, metrics, target traces, and inbound traces

It does not currently ship automatic PTY-output-to-message delivery.

## Current Product Model

The messaging runtime is now intentionally `transport_only`.

That means:

- the backend may receive operator input from a mapped Telegram target
- the backend may publish Telegram custom commands from the canonical ptydeck custom-command model
- the backend may provision Telegram forum topics for `topicMode: "deck-session"`
- the adapters may deliver explicit `MessageIntent` objects if another runtime seam creates them deliberately
- the runtime does not automatically interpret terminal output into outbound Telegram or Discord messages

## Telegram Command Surface

The Telegram bot command list is derived from the operator-relevant ptydeck custom-command surface.

That means:

- eligible custom commands are published automatically to Telegram with deterministic Telegram-safe names
- scoped custom-command variants sharing the same canonical name collapse into one published Telegram command name
- invalid, conflicting, or overflow commands are skipped deterministically
- unpublished slash-prefixed text is not treated as a Telegram adapter action and instead falls through to normal mapped terminal input
- exact literal slash-prefixed terminal input for a published Telegram custom command remains available through the existing `//...` escape

Telegram-safe command naming follows this encoding:

- lowercase letters and digits remain unchanged
- `_` becomes `__`
- `-` becomes `_d`
- names that would start with a digit gain the prefix `c_`

Examples:

- ptydeck `/doc-u` -> Telegram `/doc_du`
- ptydeck `/doc_u` -> Telegram `/doc__u`
- ptydeck `/7zip` -> Telegram `/c_7zip`

## Session Mapping

A Telegram target maps either:

- one explicitly selected ptydeck session to one chat destination
- or, for selectorless `topicMode: "deck-session"` targets, one forum-enabled supergroup to the live ptydeck session set, with one topic per terminal/session

Recommended operator layout:

- one forum-enabled Telegram supergroup for ptydeck
- one topic per mapped terminal/session

In that shape, every mapped session shares the same `chatId` and gets its own `messageThreadId`.

## What Transport-Only Still Delivers

The current runtime can still send adapter-visible messages in bounded explicit cases:

- Telegram callback responses
- Telegram inbound action confirmations or errors
- explicit `MessageIntent` objects passed to the adapters by other runtime code

The adapters still apply per-thread message policy and transport-specific formatting to those explicit deliveries.

## What It No Longer Does Automatically

The current runtime does not:

- mirror raw PTY output to Telegram or Discord
- summarize terminal output automatically
- run automatic reply/section/summary extraction from PTY data
- keep projection/legacy dual semantic authority in production
- run restart-resend suppression, semantic shadow mode, or Codex-specific automatic outbound families in the live path

Those earlier experiments are now retained as historical markdown learnings only.

## Health and Diagnostics

When messaging is configured, `/health` and `/ready` expose:

- `messaging.mode = "transport_only"`
- `messaging.boundaryContracts = ["DeliveryAdapter", "MessageIntent"]`
- `messaging.adapters[*]` with adapter-specific configuration and counters
- `messaging.trace` for transport/runtime trace entries

Telegram status additionally exposes:

- command publication counters
- topic-provisioning counters and last errors
- `targetTrace`
- `inboundTrace`

Discord status exposes:

- transport configuration state
- `targetTrace`

## Future Direction

The next automatic outbound attempt is intentionally deferred.

See:

- `docs/Messaging Reset and Third Attempt Notes.md`
- `TODO-OUTLOOK.md` (`MSG-201` through `MSG-205`)

The current adapter framework is being kept precisely so a third attempt can reuse the transport and intent seams without inheriting the old live semantic ballast.
