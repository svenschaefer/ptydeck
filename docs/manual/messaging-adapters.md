# Messaging Adapters

`ptydeck` now ships a single-user Telegram reference adapter on top of the provider-independent messaging contract.

Use it when you want:

- concise external session status updates
- bounded remote follow-up from a mapped Telegram chat
- a stable session-to-chat mapping without opening a second terminal UI

The adapter now also publishes its Telegram slash-command surface from the canonical ptydeck command model instead of a separate handwritten Telegram-only list.

The adapter is intentionally not a remote shell.

## Telegram Command Surface

The shipped Telegram bot command list is now derived from the operator-relevant ptydeck custom-command surface.

The concrete command names shown below, such as `/docu` or `/go`, are only examples. The actual Telegram bot-command surface is derived from the custom commands configured in ptydeck at runtime.

That means:

- eligible custom commands are published automatically to Telegram with deterministic Telegram-safe names
- scoped custom-command variants sharing the same canonical name collapse into one published Telegram command name; runtime resolution still picks the command that is valid for the mapped session
- invalid, conflicting, or overflow custom commands are skipped deterministically instead of drifting into an undocumented Telegram-only surface
- Telegram no longer publishes the earlier adapter-local built-in bot commands (`/status`, `/stop`, `/retry`, `/replay`) as part of the normal operator command surface

Telegram-safe custom command naming currently follows this deterministic encoding:

- lowercase letters and digits remain unchanged
- `_` becomes `__`
- `-` becomes `_d`
- names that would start with a digit gain the prefix `c_`

Examples:

- ptydeck `/doc-u` -> Telegram `/doc_du`
- ptydeck `/doc_u` -> Telegram `/doc__u`
- ptydeck `/7zip` -> Telegram `/c_7zip`

Runtime behavior follows the published catalog:

- a published Telegram custom command is resolved through the same custom-command model as the primary ptydeck slash-command surface
- Telegram custom commands cannot redirect to another target; the mapped chat/topic remains the authority
- unpublished slash-prefixed text is not intercepted as a Telegram adapter action and instead falls through to normal mapped terminal input
- exact literal slash-prefixed terminal input for a published Telegram custom command remains available through the existing `//...` escape
- no new adapter-owned built-in Telegram action buttons are attached to outbound messages; older legacy callback buttons may still be answered while old posts remain visible

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

The same adapter status payload now also exposes command-publication state:

- `publishedCommandCount`
- `commandCatalogSize`
- `commandSyncSkippedCount`
- `lastCommandSyncAt`
- `lastCommandSyncError`

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

- send four narrow Codex-only outbound families, `codex_input_reply`, `codex_separator_info`, `codex_separator_section`, and `codex_separator_summary_sentence`, while generic outbound delivery remains hard-disabled; new block identities create new posts, only the same block identity is eligible for an edit, the summary family now keeps a stable content-based block identity so Telegram backoff retries do not later fan out into duplicate new posts, larger Codex closing comments can now survive contaminated starts plus short transient noise long enough to emerge as one structured `codex_separator_section` message instead of fragmenting back into short `info` paragraphs or transient side signals, and submitted-input reply promotion now rejects stale PTY carryover plus echoed operator input before the first real Codex answer line is delivered
- normalize outbound status, summary, idle, attention, control, and share events in the underlying adapter contract, even though the current shipped product path re-enables only those narrow Codex allowlist families
- keep the active outbound families compact through the shipped trigger profiles
- publish eligible custom commands from the canonical ptydeck command surface to Telegram and execute those published commands through the same custom-command runtime path used inside ptydeck
- route mapped plain Telegram text into the same backend session-input path used by frontend `Send`
- mirror frontend-style delayed submit semantics whenever the normalized messaging input carries a submit terminator, so mapped Telegram text is written first and the final submit `\r` follows as a short delayed second write instead of stopping at prompt insertion merely because live app detection was stale
- preserve literal slash-prefixed terminal input through a `//...` escape for published Telegram custom commands (`//docu` -> `/docu`)

## What It Cannot Do

The adapter does not:

- broadly reactivate generic Telegram outbound delivery; outside the narrow `codex_input_reply` / `codex_separator_info` / `codex_separator_section` / `codex_separator_summary_sentence` allowlist families, the product path still treats outbound delivery as hard-disabled
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

The first post-hard-break exception is now delivered as `v0.4.0-H99` and refined through `v0.4.0-H119`:

- four narrow internal allowlist families, `codex_input_reply`, `codex_separator_info`, `codex_separator_section`, and `codex_separator_summary_sentence`, can be delivered even while generic `deliveryEnabled` remains false
- all four families are Codex-only and block-aware:
  - `codex_input_reply` covers the non-separator case:
    - submitted Codex session input can open this bounded reply window even when the originating input path was Telegram, REST, or frontend `Send`
    - the runtime assembles the next substantial Codex answer block directly from the PTY line stream instead of waiting for a separator anchor
    - structural planning/meta fragments such as `MSG-063 Owner QA` or `In ROADMAP.md:` are skipped until the first real answer appears
    - observed inline prompt chrome such as `›Explain this codebase ...` is stripped from the first captured answer line before delivery
    - stale pre-submit PTY carryover, pure input echo, and prompt-echo tails such as `› ok, was machen wir dann jetzt da Find and fix a bug in @filename` are now rejected before the reply block starts, so delayed-submit local or REST flows cannot consume leftover terminal residue as the first Telegram-visible reply
    - later separator-family chatter cannot jump ahead of that first reply while the reply window is still active
  - a major separator must survive as its own stream entry, or as an otherwise clean separator entry with only tiny redraw-tail contamination
  - `codex_separator_info` keeps the narrow simple case:
    - the next bounded substantial `•` block must classify as clean `info`
    - the separator-to-info horizon is still intentionally short, but now widened to roughly `4500ms` / `120` entries for real Codex timing
    - at most one immediate indented continuation line is merged
    - if the same separator/headline pair is still owned by an active section candidate, the runtime now defers this narrow `info` delivery until the section path either wins or explicitly rejects the block as too shallow
  - `codex_separator_section` now covers the next narrow structural case:
    - prompt/footer/background-terminal chrome is stripped from mixed entries before and during section assembly
    - the section path now opens provisionally across a short bounded multi-chunk window instead of living or dying on the first raw chunk
    - a substantial implicit `•` headline can now start the section candidate even when no clean separator entry survived the raw stream, so separators remain strong hints rather than the only viable start condition
    - the resulting assembled section can retain one narrative `•` headline plus subsection labels and indented list items
    - simple one-bullet cases stay on `codex_separator_info`; the section family is reserved for the richer narrative shape
    - multiline closing comments with still-growing continuation text now stay on this section path instead of being emitted first as `codex_separator_info` or being broken apart by transient line-local `attention_required` / `status_update` side signals
    - explicit section boundaries and window-state gating still reject anti-pattern bullets, prompt/footer markers, diff/output fragments, and overlay-churn windows
  - `codex_separator_summary_sentence` now covers the next narrow aggregated case:
    - separator-hint summary flushes may pass only when they collapse to one sentence-like Codex update
    - short stubs such as `committed.` and colon-headed fragments such as `validated target apps:` stay rejected
    - prompt/footer/background-terminal contamination and multi-fragment `|` summaries stay rejected
- that summary family now also runs behind a restart-recovery admission layer:
  - summary-family delivery is suppressed before `runtime.ready`
  - it remains suppressed through a bounded post-ready quiet window
  - it remains suppressed until the first fresh post-restart input observed after that quiet window for the same session
  - a persisted resend ledger keyed by normalized summary content plus session/thread context prevents old already-delivered summary posts from reappearing on later restarts
  - startup `coding-agent` restore sessions are covered even when their initial restore hint still looks like a wrapper launch such as `cody` instead of explicit `codex`
- delivered candidates stay in the existing Telegram topic/thread, but a new separator-anchored block now opens a new Telegram post and only the same block identity is eligible for deterministic `update`

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
/docu
/go
/status
```

Literal slash-prefixed terminal input example:

`//docu` -> `/docu`

## Inbound Semantics

### plain text input

Mapped plain Telegram text now follows the same backend session-input path as frontend `Send`.
It keeps owner-boundary checks plus `lastInput` tracking, but it does not require an attached browser controller client header for Telegram-originated input.

Behavior:

- published Telegram custom commands still take priority as adapter commands
- other plain text, including unpublished slash-prefixed text such as `/status`, is written to the mapped PTY as terminal input
- multiline payloads are normalized to one final `\r` terminator
- exact slash-prefixed literal terminal input for a published Telegram custom command can be forced with `//...`
- whitespace-only payloads are rejected instead of writing meaningless PTY input
- existing controller/access checks remain in force, so Telegram input does not bypass the normal single-writer control model

## Operational Notes

- Telegram inbound is enabled automatically whenever Telegram bot credentials and target mappings are configured.
- Telegram outages must not make the ptydeck runtime unhealthy.
- `/health`, `/ready`, and `/metrics` expose adapter status and inbound polling counters.
- `/health.messaging.adapters[0].inboundTrace` and `/ready.messaging.adapters[0].inboundTrace` expose a bounded recent Telegram inbound observation ring, including accepted `input_text` observations and unsupported/non-text messages that never become ptydeck actions.
- `/health.messaging.adapters[0].targetTrace` and `/ready.messaging.adapters[0].targetTrace` expose a bounded recent Telegram target-validation and topic-provisioning ring, including forum mismatch failures and topic create/reuse/rename outcomes.
- `/health.messaging.deliveryEnabled` shows whether generic outbound Telegram delivery is currently allowed.
- `/health.messaging.allowlistDeliveryActive` and `/ready.messaging.allowlistDeliveryActive` show whether narrow internal outbound allowlist paths such as `codex_input_reply`, `codex_separator_info`, `codex_separator_section`, and `codex_separator_summary_sentence` are active while generic `deliveryEnabled` remains false.
- `/health.messaging.codexTelegramReplyCorrelation` and `/ready.messaging.codexTelegramReplyCorrelation` show the bounded Codex reply-block promotion state under its historical field name, including the reply-window duration and the number of sessions currently waiting for the first correlated Codex answer block after an eligible submitted input.
- `/health.messaging.allowlistDeliveryScopes` and `/ready.messaging.allowlistDeliveryScopes` enumerate those narrow delivered scopes.
- `/health.messaging.codexSummaryRestartRecovery` and `/ready.messaging.codexSummaryRestartRecovery` expose the narrow summary-family restart-recovery state, including the configured quiet period, current post-ready quiet time remaining, active recovering-session count, and persisted resend-ledger size.
- When `topicMode: "deck-session"` is active, adapter health also exposes topic-provisioning counters, target-validation errors, and active topic-binding totals.
- `/health.messaging.adapters[0]` and `/ready.messaging.adapters[0]` also expose `allowlistDeliveryActive` and `allowlistDeliveryScopes` for the Telegram adapter itself.
- Because the system stays single-user, the adapter remains subordinate to the existing ptydeck runtime instead of introducing a separate authorization plane.
- `reply`/`edit` behavior is deterministic: status-style updates reuse the adapter thread when possible, the first attention post still creates an alert message, and a richer follow-up for that same bounded attention thread now edits the original alert instead of creating another near-duplicate Telegram message.
- Forum-topic provisioning is also deterministic: for `topicMode: "deck-session"`, the adapter creates or reuses a topic named `<deck name> + <terminal name>` for the initial binding and persists the resulting `messageThreadId`.
- After that first binding, routing continues by `chatId + messageThreadId`, not by topic title, so manual Telegram topic renames stay mapped correctly and are no longer snapped back automatically by the normal reuse path.

## Related Docs

- [DEPLOYMENT.md](../../DEPLOYMENT.md)
- [Messaging adapter concept](../ptydeck_messaging_adapter_framework_final_concept.md)
