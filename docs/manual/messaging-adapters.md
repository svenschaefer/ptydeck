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
- when a later line adds meaningful detail to the same recent failure, the adapter now edits the existing attention post instead of sending a second alert
- low-value agentic CLI chatter such as `Ran ...`, `Edited ...`, inline diff/update summaries, and separator-only fragments is filtered before it becomes a user-facing Telegram message
- coding-agent planning chatter such as `next active block ...`, version bullets, and `/review on my current changes` echoes is now treated as low-value noise rather than operator-facing Telegram status
- coding-agent and generic-shell sessions now aggregate bounded progress blocks on prompt boundaries and quiet windows instead of flushing every classified line independently
- structural follow-up lines such as trailing `}` or other punctuation-only tails are no longer treated as fresh alerts just because the previous line contained an error keyword
- status summaries no longer inherit generic completion keywords into unrelated follow-up lines, so prompt echoes, file lists, and similar tails do not become accidental Telegram updates just because a previous line contained `done` or `updated`
- coding-agent breadcrumb headers dominated by model/path/budget context are now trimmed when a later segment carries the real progress signal, partial terminal-control residue such as `38;5;2m` or `9;1H` is stripped before classification, and repeated `Session idle.` updates are damped instead of churning the status thread
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

For persisted local analysis, enable the existing backend debug log:

```env
BACKEND_DEBUG_LOGS=1
BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log
```

Then inspect structured `messaging.event.trace` lines in that log file.

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

Each mapping entry must include at least one of:

- `sessionId`
- `quickIdToken`
- `sessionName`

Practical guidance:

- use `sessionId` when you want the narrowest exact mapping
- use `quickIdToken` when you work from stable quick IDs in the UI
- use `sessionName` only when names are intentionally unique enough for that role

If the same Telegram chat/thread maps ambiguously to multiple sessions, bounded inbound actions are rejected until the mapping is narrowed.

### 5. Configure the Backend

You can either place values directly in `backend/.env` or load them from files.

Direct example:

```env
MESSAGING_TELEGRAM_BOT_TOKEN=123456:replace_with_real_token
MESSAGING_TELEGRAM_TARGETS=[
  {
    "sessionName": "codex",
    "chatId": "123456789",
    "profile": "coding-agent"
  },
  {
    "quickIdToken": "4",
    "chatId": "-1001234567890",
    "messageThreadId": 12,
    "profile": "build-test"
  }
]
MESSAGING_TELEGRAM_INBOUND_ENABLED=1
MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS=3
```

File-backed example:

```env
MESSAGING_TELEGRAM_BOT_TOKEN_FILE=/secure/ptydeck/telegram-bot-token.txt
MESSAGING_TELEGRAM_TARGETS_FILE=/secure/ptydeck/telegram-targets.json
MESSAGING_TELEGRAM_INBOUND_ENABLED=1
MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS=3
```

Example `telegram-targets.json`:

```json
[
  {
    "sessionName": "codex",
    "chatId": "123456789",
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

### 8. Run a Minimal Telegram Smoke Test

Outbound:

1. Start or use a mapped session.
2. Produce some real activity in that session.
3. Confirm a compact Telegram update appears in the mapped chat/thread.

Inbound:

Try:

```text
/status
/replay
/replay l:20
/stop
/retry
```

Or use the inline buttons:

- `Status`
- `Replay`
- `Stop`
- `Retry`

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
- `reply`/`edit` behavior is deterministic: status-style updates reuse the adapter thread when possible, the first attention post still creates an alert message, and a richer follow-up for that same bounded attention thread now edits the original alert instead of creating another near-duplicate Telegram message.

## Related Docs

- [DEPLOYMENT.md](../../DEPLOYMENT.md)
- [Messaging adapter concept](../ptydeck_messaging_adapter_framework_final_concept.md)
