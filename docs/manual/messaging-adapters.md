# Messaging Adapters

`ptydeck` now ships a single-user Telegram reference adapter on top of the provider-independent messaging contract.

Use it when you want:

- concise external session status updates
- bounded remote follow-up from a mapped Telegram chat
- a stable session-to-chat mapping without opening a second terminal UI

The adapter is intentionally not a remote shell.

## Noise Control and Diagnostics

The delivered Telegram baseline now favors one stable status thread over chatty line-by-line output.

That means:

- duplicate status churn is suppressed aggressively
- repeated attention churn from the same logical failure is now damped so one error does not fan out into many nearly identical Telegram alerts
- exact repeated failure lines can now alert again after the bounded churn window expires instead of being suppressed forever by older duplicate state
- when a later line adds meaningful detail to the same recent failure, the adapter now edits the existing attention post instead of sending a second alert
- low-value agentic CLI chatter such as `Ran ...`, `Edited ...`, inline diff/update summaries, and separator-only fragments is filtered before it becomes a user-facing Telegram message
- coding-agent planning chatter such as `next active block ...`, version bullets, and `/review on my current changes` echoes is now treated as low-value noise rather than operator-facing Telegram status
- low-value coding-agent planning summaries such as `Updated Plan` are now treated as chatter rather than operator-facing Telegram status when no stronger progress signal accompanies them
- hash-prefixed coding-agent commit or plan lines such as `- 961f98a ...` or `└ 961f98a ...` are now treated as low-value chatter rather than Telegram status
- coding-agent summary detection now favors explicit result lines instead of any line that merely contains broad nouns such as `coverage`, so wrapped roadmap or plan fragments like `coverage hardening` or `host-window smoke coverage ...` no longer escape as operator-facing Telegram updates
- coding-agent and generic-shell sessions now aggregate bounded progress blocks on prompt boundaries and quiet windows instead of flushing every classified line independently
- prompt-boundary handling is now chunk-position-aware, so summary or attention text that arrives in the same PTY chunk as a prompt marker is flushed before any later `Prompt ready.` update can be considered
- structural follow-up lines such as trailing `}` or other punctuation-only tails are no longer treated as fresh alerts just because the previous line contained an error keyword
- status summaries no longer inherit generic completion keywords into unrelated follow-up lines, so prompt echoes, file lists, and similar tails do not become accidental Telegram updates just because a previous line contained `done` or `updated`
- coding-agent breadcrumb headers dominated by model/path/budget context are now trimmed when a later segment carries the real progress signal, partial terminal-control residue such as `38;5;2m` or `9;1H` is stripped before classification, actionable path-bearing diagnostics are preserved when they are part of the real failure line, and repeated `Session idle.` updates are damped instead of churning the status thread
- coding-agent `Session idle.` follow-ons are now also suppressed after recent low-value chatter, after recent unclassified coding-agent chatter, or after a still-recent meaningful status update, so a filtered `Updated Plan`-style blip or wrapped planning fragment does not simply reappear as an idle-thread bump a few seconds later
- zero-count issue lines such as `0 Error(s)` are treated as low-value noise rather than user-facing status updates
- short coding-agent snippet follow-ons after a stronger failure line stay suppressed instead of becoming their own Telegram alert just because they still contain words like `Exception`
- short low-value OS-error fragments such as `falsch. (os error 123)` are suppressed when they arrive without enough standalone context to be useful as operator-facing alerts

When you need to inspect real adapter behavior, use both the runtime summary and the backend debug log path.

Health and readiness now expose a bounded recent messaging trace:

```bash
curl -s http://127.0.0.1:18080/health | jq '.messaging.trace'
curl -s http://127.0.0.1:18080/ready | jq '.messaging.trace'
```

That trace includes recent candidate summaries, policy decisions, suppression reasons, correlation keys, target chat/thread metadata, and delivery outcomes such as Telegram rate-limit backoff hints.

The Telegram adapter status now also surfaces active outbound backoff state after a Bot API `retry after` response, so repeated rate-limit failures can be distinguished from ordinary transport errors.

One practical implication of that trace model: if Telegram backoff skips delivery of a meaningful status update, a later `Session idle.` event should still stay suppressed. The trace will show the skipped status attempt plus the later `idle_after_status_attempt` suppression instead of silently bumping the thread with low-value idle churn.

For persisted lifecycle and adapter analysis, enable the existing backend debug log:

```env
BACKEND_DEBUG_LOGS=1
BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log
```

With `BACKEND_DEBUG_LOG_FILE` configured, those backend debug traces are written to the file instead of flooding the interactive backend console.

For persisted raw-stream analysis of coding-agent sessions such as Codex, enable the session-stream analysis capture as well:

```env
SESSION_STREAM_ANALYSIS_CAPTURE_FILE=/tmp/ptydeck-session-stream-analysis.jsonl
SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS=codex
SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES=33554432
```

That capture is analysis-only and independent of Telegram delivery. It records bounded JSONL entries with:

- raw PTY chunk bytes (base64)
- cleaned chunk bytes (base64)
- prompt-boundary offsets
- terminal-signal kinds
- session metadata
- app-identity metadata

Use it when the question is about rendered Codex block structure, restart-time chunk boundaries, or later allowlist-/signal-first message selection, because the backend debug log remains metadata-oriented and the short replay tail can fall out of memory too quickly during restart churn.

The Telegram adapter now also logs inbound discovery events before and during command/input handling through `messaging.inbound.update`, so group/topic messages such as `@ptydeck_bot ping`, plain text input, and still-unsupported non-text payloads all leave a diagnosable trail with:

- `chatId`
- `messageThreadId`
- chat type/title/username
- whether the chat is a forum
- preview text
- parse result such as `command`, `input_text`, `unsupported_text`, or `non_text_message`

This is specifically useful when the running backend is already consuming Telegram updates, because direct Bot API `getUpdates` inspection may then look empty while `inboundTrace` still shows what the live runtime actually observed.

Forum-target validation and topic provisioning now also leave a diagnosable trail through `messaging.target.update` and `targetTrace`, including:

- `chatId`
- `messageThreadId`
- `topicMode`
- `sessionId`
- `topicName`
- forum validation outcome
- create/reuse/rename phase
- provisioning or validation errors

Then inspect structured `messaging.event.trace`, `messaging.inbound.update`, and `messaging.target.update` lines in that debug log file.

For Codex-style block analysis against the captured raw stream, use:

```bash
node scripts/analyze-codex-stream-blocks.mjs \
  --capture-file /tmp/ptydeck-session-stream-analysis.jsonl \
  --session-name ptydeck
```

## What It Can Do

The Telegram reference adapter can:

- send one narrow Codex-only outbound family, `codex_separator_info`, through deterministic thread update/reuse while generic outbound delivery remains hard-disabled
- normalize outbound status, summary, idle, attention, control, and share events in the underlying adapter contract, even though the current shipped product path re-enables only the narrow `codex_separator_info` family
- keep the active outbound families compact through the shipped trigger profiles
- accept the bounded inbound bot command set:
  - `/status`
  - `/stop`
  - `/retry`
  - `/replay`
  - `/replay l:N`
  - `/replay c:N`
  - `/replay sp:N`
- route mapped plain Telegram text into the same backend session-input path used by frontend `Send`
- mirror the frontend-style delayed submit semantics for active `codex` sessions, so mapped Telegram text is written first and the final submit `\r` follows as a short delayed second write instead of stopping at prompt insertion
- preserve literal slash-prefixed terminal input through a `//...` escape (`//status` -> `/status`)
- expose the same bounded actions through Telegram buttons on adapter-owned messages

## What It Cannot Do

The adapter does not:

- broadly reactivate generic Telegram outbound delivery; outside the narrow `codex_separator_info` allowlist family, the product path still treats outbound delivery as hard-disabled
- bypass controller, read-only, share, or send-safety rules
- parse open-ended free-text intent beyond direct text-to-input forwarding
- execute Telegram text for unmapped chats/topics or for controller-denied sessions
- mirror raw PTY chunks as a second terminal stream

If you need the exact command or settings contract, use the generated reference pages instead of repeating them here:

- [Slash command reference](../reference/commands.md)
- [API reference](../reference/api.md)

## Session Mapping

A Telegram target maps either:

- one explicitly selected ptydeck session to one chat destination
- or, for selectorless `topicMode: "deck-session"` targets, one forum-enabled supergroup to the live ptydeck session set, with one topic per terminal/session

For the live operator model, the recommended destination is one forum-enabled Telegram supergroup for ptydeck with one topic per terminal/session. In that shape, every mapped session shares the same `chatId` and gets its own `messageThreadId`. The direct 1:1 bot chat remains the simplest bootstrap and smoke-test path, not the intended long-term operating layout.

A Telegram channel is not sufficient for that layout. Forum topics require a forum-enabled supergroup, not a broadcast channel.

The currently referenced invite target `https://t.me/+J4MInwk9nSg1MWJi` presently resolves to a Telegram channel, so it cannot host the per-terminal forum topics required by `topicMode: "deck-session"`.

Recommended topic naming convention:

- `<deck name> + <terminal name>`

Each mapping entry needs:

- `chatId`
- for static mappings, at least one selector:
  - `sessionId`
  - `quickIdToken`
  - `sessionName`

Optional fields:

- `messageThreadId`
- `topicMode`
- `profile`

When `topicMode` is set to `deck-session`, `ptydeck` provisions one Telegram forum topic per terminal/session automatically and persists the resulting `messageThreadId` binding for later reuse. In that mode, the configured `chatId` must point at a forum-enabled supergroup.

A selectorless target is now allowed only for `topicMode: "deck-session"`. That is the recommended live operator shape because the mapping then follows the current ptydeck session set dynamically in real time instead of depending on hard-coded `sessionName`, `quickIdToken`, or `sessionId` values.

## Delivery Hard Break

Generic Telegram outbound delivery is currently hard-disabled in the shipped product path.

That hard break is intentional:

- no broad Telegram chat mirroring or generic status delivery is sent while the operator topology is being rebuilt
- `topicMode: "deck-session"` can still validate the target chat and provision per-terminal forum topics
- there is intentionally no environment-variable re-enable switch at this stage
- inbound observation/command handling remains automatically on whenever Telegram is configured; there is intentionally no separate environment toggle for that path

The first post-hard-break exception is now delivered as `v0.4.0-H99`:

- one narrow internal allowlist family, `codex_separator_info`, can be delivered even while generic `deliveryEnabled` remains false
- that family is Codex-only and entry-level stream driven:
  - a major separator must survive as its own stream entry
  - the next bounded substantial `•` block must classify as clean `info`
  - at most one immediate indented continuation line is merged
  - prompt markers, footer ribbons, interrupt overlays, and anti-pattern bullets such as `Ran`, `Explored`, `Waited`, `Context compacted`, and `Updated Plan` reject the candidate
- delivered candidates reuse the existing Telegram thread via deterministic `update` behavior instead of reopening broad new-message churn

The shipped trigger profiles are:

- `generic-shell`
- `coding-agent`
- `build-test`

## Setup Checklist

Use this sequence for a first real Telegram setup.

### 1. Create the Bot

In Telegram, talk to `@BotFather` and create a new bot with `/newbot`.

Capture the issued bot token. `ptydeck` uses that token directly against the Telegram Bot API; there is no separate ptydeck-side Telegram login or OAuth flow.

### 2. Add the Bot to the Destination Chat

Choose the destination first:

- direct 1:1 chat with the bot
- group chat
- supergroup topic/thread

Then make sure the bot is present in that destination and can receive updates there.

### 3. Discover `chatId` and Optional `messageThreadId`

Send at least one message in the target chat or topic, then inspect Telegram updates for the bot.

Example:

```bash
curl -s "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates" | jq
```

Look for:

- `message.chat.id` -> `chatId`
- `message.message_thread_id` -> `messageThreadId` when using a topic/thread

Notes:

- group and supergroup chat IDs are often negative
- if you use topics, keep `chatId` stable and set the specific `messageThreadId`

### 4. Choose the ptydeck Session Selector

Each static mapping entry must include at least one of:

- `sessionId`
- `quickIdToken`
- `sessionName`

Practical guidance:

- use `sessionId` when you want the narrowest exact mapping
- use `quickIdToken` when you work from stable quick IDs in the UI
- use `sessionName` only when names are intentionally unique enough for that role
- use a selectorless `topicMode: "deck-session"` target when you want one forum-enabled supergroup to track all live sessions dynamically and create one topic per terminal/session automatically

If the same Telegram chat/thread maps ambiguously to multiple sessions, bounded inbound actions are rejected until the mapping is narrowed.

### 5. Configure the Backend

You can either place values directly in `backend/.env` or load them from files.

Direct example:

```env
MESSAGING_TELEGRAM_BOT_TOKEN=123456:replace_with_real_token
MESSAGING_TELEGRAM_TARGETS=[
  {
    "chatId": "-1001234567890",
    "topicMode": "deck-session",
    "profile": "coding-agent"
  }
]
MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS=3
```

File-backed example:

```env
MESSAGING_TELEGRAM_BOT_TOKEN_FILE=/secure/ptydeck/telegram-bot-token.txt
MESSAGING_TELEGRAM_TARGETS_FILE=/secure/ptydeck/telegram-targets.json
MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS=3
```

Example `telegram-targets.json`:

```json
[
  {
    "chatId": "-1001234567890",
    "topicMode": "deck-session",
    "profile": "coding-agent"
  }
]
```

### 6. Start ptydeck

Start the normal local runtime:

```bash
npm run dev
```

If the bot token and target mappings are both present, the messaging runtime becomes active automatically. If either side is missing, messaging stays disabled without making the core runtime unhealthy.

### 7. Verify Adapter Health

Check:

```bash
curl -s http://127.0.0.1:18080/health | jq
curl -s http://127.0.0.1:18080/ready | jq
curl -s http://127.0.0.1:18080/metrics | rg ptydeck_messaging
```

Expect:

- a top-level messaging summary in `/health`
- the same messaging summary in `/ready`
- `ptydeck_messaging_*` metric lines in `/metrics`
- when inbound is enabled, additional `ptydeck_messaging_inbound_*` counters
- a bounded `.messaging.trace.recent` ring for recent outbound candidate and suppression analysis
- transient inbound polling failures during backlog drain or later live polling should now surface in the inbound counters and last-error fields while the adapter retries instead of stopping inbound permanently after one startup transport error

### 8. Run a Minimal Telegram Smoke Test

Outbound:

1. Start or use a mapped session.
2. Produce some real activity in that session.
3. Confirm a compact Telegram update appears in the mapped chat/thread.

Inbound:

Try:

```text
echo TELEGRAM_OK
/status
/replay
/replay l:20
/stop
/retry
```

Literal slash-prefixed terminal input example:

`//status` -> `/status`

Or use the inline buttons:

- `Status`
- `Replay`
- `Stop`
- `Retry`

## Bounded Inbound Semantics

### plain text input

Mapped plain Telegram text now follows the same backend session-input path as frontend `Send`.
It keeps owner-boundary checks plus `lastInput` tracking, but it does not require an attached browser controller client header for Telegram-originated input.

Behavior:

- known bot commands (`/status`, `/stop`, `/retry`, `/replay`) still take priority as adapter commands
- other plain text is written to the mapped PTY as terminal input
- multiline payloads are normalized to one final `\r` terminator
- exact slash-prefixed literal terminal input can be forced with `//...`
- whitespace-only payloads are rejected instead of writing meaningless PTY input
- existing controller/access checks remain in force, so Telegram input does not bypass the normal single-writer control model

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

- Telegram inbound is enabled automatically whenever Telegram bot credentials and target mappings are configured.
- Telegram outages must not make the ptydeck runtime unhealthy.
- `/health`, `/ready`, and `/metrics` expose adapter status and inbound polling counters.
- `/health.messaging.adapters[0].inboundTrace` and `/ready.messaging.adapters[0].inboundTrace` expose a bounded recent Telegram inbound observation ring, including accepted `input_text` observations and unsupported/non-text messages that never become ptydeck actions.
- `/health.messaging.adapters[0].targetTrace` and `/ready.messaging.adapters[0].targetTrace` expose a bounded recent Telegram target-validation and topic-provisioning ring, including forum mismatch failures and topic create/reuse/rename outcomes.
- `/health.messaging.deliveryEnabled` shows whether generic outbound Telegram delivery is currently allowed.
- `/health.messaging.allowlistDeliveryActive` and `/ready.messaging.allowlistDeliveryActive` show whether a narrow internal outbound allowlist path such as `codex_separator_info` is active while generic `deliveryEnabled` remains false.
- `/health.messaging.allowlistDeliveryScopes` and `/ready.messaging.allowlistDeliveryScopes` enumerate those narrow delivered scopes.
- When `topicMode: "deck-session"` is active, adapter health also exposes topic-provisioning counters, target-validation errors, and active topic-binding totals.
- `/health.messaging.adapters[0]` and `/ready.messaging.adapters[0]` also expose `allowlistDeliveryActive` and `allowlistDeliveryScopes` for the Telegram adapter itself.
- Because the system stays single-user, the adapter remains subordinate to the existing ptydeck runtime instead of introducing a separate authorization plane.
- `reply`/`edit` behavior is deterministic: status-style updates reuse the adapter thread when possible, the first attention post still creates an alert message, and a richer follow-up for that same bounded attention thread now edits the original alert instead of creating another near-duplicate Telegram message.
- Forum-topic provisioning is also deterministic: for `topicMode: "deck-session"`, the adapter creates or reuses a topic named `<deck name> + <terminal name>` and persists that binding instead of relying on manual topic naming discipline.

## Related Docs

- [DEPLOYMENT.md](../../DEPLOYMENT.md)
- [Messaging adapter concept](../ptydeck_messaging_adapter_framework_final_concept.md)
