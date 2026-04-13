# Deployment Runbook - ptydeck

## 1. Prerequisites

- Node.js `18` (see `.nvmrc`)
- `npm` available in PATH
- Linux host with shell support for backend PTY sessions

## 2. Quality Gate (must pass before release, local-only)

Remote GitHub-hosted runner execution is intentionally disabled.
Use the local gate defined in `LOCAL_QUALITY_GATE.md`.

```bash
npm run lint
npm run test
npm run test:coverage:check
./scripts/ci-smoke.sh
npm run security:sca
npm run security:sbom
npm run backup:verify
PURGE_DRY_RUN=1 npm run retention:purge
npm run release:evidence
```

## 3. Build

The project uses runtime JavaScript, so build here means syntax and type-surface checks plus API type generation.

```bash
npm run build
```

## 4. Environment Configuration

Backend:

```bash
cp backend/.env.example backend/.env
```

Frontend:

```bash
cp frontend/.env.example frontend/.env
```

Set at least:

- Backend: `NODE_ENV`, `PORT`, `SHELL`, `DATA_PATH`, `CORS_ORIGIN`, `MAX_BODY_BYTES`, `TRUST_PROXY`, `ENFORCE_TLS_INGRESS`
- Frontend: `FRONTEND_PORT`

Optional frontend overrides:

- `API_BASE_URL`, `WS_URL` (leave unset to auto-derive from browser host)

Secrets policy baseline:

- Never commit real secrets to git (`.env` files stay local/untracked).
- Keep local machine-specific secrets only in gitignored paths.
- In shared/prod environments inject secrets at runtime from secret stores or orchestrator secret primitives.

Optional for troubleshooting:

- Backend: `BACKEND_DEBUG_LOGS=1` for request/session/ws lifecycle logs
- Backend: `BACKEND_DEBUG_LOG_FILE=/tmp/ptydeck-backend-debug.log` for persistent local debug traces
- When `BACKEND_DEBUG_LOG_FILE` is set, backend debug traces are written to that file instead of flooding the interactive backend stdout/stderr stream
- Backend: `SESSION_STREAM_ANALYSIS_CAPTURE_FILE=/tmp/ptydeck-session-stream-analysis.jsonl` for persisted raw PTY chunk capture during analysis-only restart and Codex stream investigations
- Backend (optional filter, comma-separated): `SESSION_STREAM_ANALYSIS_CAPTURE_APP_LABELS=codex`
- Backend (optional bounded file size): `SESSION_STREAM_ANALYSIS_CAPTURE_MAX_BYTES=33554432`
- Frontend: `FRONTEND_DEBUG_LOGS=1` (dev-server injected runtime config) and/or `?debug=1` in URL for browser-side REST/WS/render/resize logs
- Messaging-specific note: the delivered Telegram baseline now emits structured `messaging.event.trace` debug lines when backend debug logs are enabled, which makes outbound candidate, suppression, and rate-limit behavior inspectable across real noisy CLI sessions
- Messaging-specific note: Telegram inbound discovery now also emits structured `messaging.inbound.update` debug lines before ptydeck command filtering, so raw group/topic messages such as bot mentions can be inspected with `chatId`, `messageThreadId`, chat type/title, and parse outcome even when they are not supported commands
- Messaging-specific note: forum-target validation and topic provisioning now also emit structured `messaging.target.update` debug lines, so forum mismatch errors, validated supergroup metadata, and topic create/reuse/rename outcomes are inspectable during the same restart cycle
- Stream-analysis note: the new session-stream capture is analysis-only and independent of Telegram delivery. It writes bounded JSONL entries with raw PTY chunks, cleaned chunks, prompt-boundary offsets, terminal-signal kinds, session metadata, and app-identity metadata so Codex block rules can be evaluated after a restart without depending on the short replay tail or the metadata-only backend debug log
- Local dev startup note: `npm run dev` and `npm --prefix backend run dev` now auto-source the gitignored repo-local file `local-config/ptydeck/backend.env.local` when it exists, so machine-specific debug and analysis settings can survive restarts without manually prefixing every dev command

Optional local auth baseline (development only):

- Backend: `AUTH_MODE=dev`
- Backend (optional override): `AUTH_DEV_SECRET`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_DEV_TOKEN_TTL_SECONDS`
- Frontend will automatically call `POST /api/v1/auth/dev-token` and attach the returned bearer token to REST/WS requests.

Optional single-user Telegram messaging adapter baseline:

- Backend: `MESSAGING_TELEGRAM_BOT_TOKEN` or `MESSAGING_TELEGRAM_BOT_TOKEN_FILE`
- Backend: `MESSAGING_TELEGRAM_TARGETS` or `MESSAGING_TELEGRAM_TARGETS_FILE`
- Backend (optional override): `MESSAGING_TELEGRAM_API_BASE_URL`
- Backend (optional bounded inbound long-poll timeout): `MESSAGING_TELEGRAM_POLL_TIMEOUT_SECONDS`

Target mapping payload format:

```json
[
  {
    "chatId": "-1001234567890",
    "topicMode": "deck-session",
    "profile": "coding-agent"
  },
  {
    "sessionName": "codex",
    "chatId": "123456789",
    "profile": "coding-agent"
  },
  {
    "quickIdToken": "4",
    "chatId": "123456789",
    "messageThreadId": 12,
    "profile": "build-test"
  }
]
```

Notes:

- Static mappings require at least one of `sessionId`, `quickIdToken`, or `sessionName` per entry.
- A selectorless target is now allowed only for `topicMode: "deck-session"` and means: route every live session dynamically into that forum-enabled supergroup, provisioning one topic per terminal/session in real time.
- Messaging remains optional; if no bot token or no targets are configured, the runtime stays healthy and messaging remains disabled.
- Hard-break baseline: generic Telegram outbound delivery remains hard-disabled in the shipped product path while the forum topology and later allowlist-/signal-first rebuild are being established. There is intentionally no environment-variable re-enable switch at this stage.
- Delivered `H99`/`H103`/`H104`/`H105`/`H106`/`H107`/`H109`/`H112`/`H115`/`H116`/`H117`/`H119`/`H120` exception: four narrow internal allowlist families, `codex_input_reply`, `codex_separator_info`, `codex_separator_section`, and `codex_separator_summary_sentence`, may now be delivered for Codex sessions even while generic outbound remains hard-disabled. `codex_input_reply` is the bounded submitted-input reply path: it opens a short per-session reply window only on submit-bearing input events, assembles the next substantial Codex answer block directly from the PTY line stream, strips observed inline prompt chrome such as `›Explain this codebase ...` from the first captured answer line, rejects pure input echo, strips pre-submit carryover when the first visible reply line still starts with stale PTY residue, and drops prompt-echo tails such as `› ok, was machen wir dann jetzt da Find and fix a bug in @filename` so delayed-submit local or REST flows promote from genuinely fresh Codex output instead of from leftover terminal state. Telegram-origin input still sets the reply-preferred hint, but the same reply-block family is now also eligible after REST or frontend submit paths. The first separator path stays the narrow paragraph case and still tolerates only tiny redraw-tail contamination on an otherwise clean separator entry plus a slightly wider bounded anchor-to-info gap; after `H115`, that narrow `info` path is also held back while the same separator/headline pair is still owned by an active `codex_separator_section` candidate, so a growing multi-line closing comment is emitted only once as a section instead of first escaping as a short paragraph. After `H119`, the section path no longer lives or dies on a perfect first chunk: prompt/footer/background-terminal chrome is stripped or isolated during assembly, a substantial implicit `•` headline can open a provisional section candidate even when no clean separator entry survived the raw stream, short transient non-content fragments no longer kill the block immediately, and line-local `attention_required` / `status_update` side signals are deferred while the coherent multiline section is still assembling. The summary family still admits only separator-hint sentence summaries with strict no-fragment/no-colon/no-prompt contamination guards. All four paths open a new Telegram post for each new block identity and reserve edits only for the same block identity instead of reopening broad line-by-line Telegram status delivery, the summary family keeps stable content-based retry identity so Telegram `retry after` backoff does not later release many duplicate posts for the same sentence, and that same summary family is now restart-gated before `runtime.ready`, across a bounded post-ready quiet window, and until the first fresh post-restart input observed after that quiet window for the same session so Codex startup-history replay does not resend old Telegram summary posts after backend restart. Startup `coding-agent` restore sessions are covered by that gate even when their initial restore hint still looks like a wrapper launch such as `cody` instead of explicit `codex`.
- Inbound observation/command handling is always enabled whenever a bot token and target mappings are configured; there is intentionally no separate environment toggle for that path.
- Mapped Telegram text that carries a submit terminator now always uses delayed-submit semantics on the backend messaging-input path, so submit behavior no longer depends on the runtime still recognizing the target session as `codex` at that exact moment.
- The shipped trigger profiles are `generic-shell`, `coding-agent`, and `build-test`.
- The Telegram bot command list is now published from the canonical ptydeck command surface through Telegram `setMyCommands`:
  - eligible custom commands are published automatically with deterministic Telegram-safe names derived from the canonical ptydeck custom-command name
  - invalid, conflicting, or overflow commands are skipped deterministically instead of silently drifting into a second Telegram-only list
  - concrete command names such as `/docu` or `/go` are examples only; the real Telegram bot-command surface is derived from the custom commands configured in ptydeck at runtime
- Telegram inbound command handling now follows the published command catalog instead of a handwritten adapter-local parser:
  - published custom commands execute through the same custom-command resolution and shell-input path as the primary ptydeck command surface
  - Telegram custom commands cannot redirect to another target; the mapped chat/topic remains the only allowed target authority
  - unpublished slash-prefixed text is not intercepted and falls through to normal mapped terminal input
- No new adapter-owned built-in Telegram action buttons are published; older legacy callback buttons can still be answered while old posts remain visible.
- Mapped plain Telegram text now follows the same backend session-input path as frontend `Send`, with one final `\r` terminator; the runtime keeps owner boundaries and `lastInput` tracking, but it no longer requires an attached browser controller client header for Telegram-originated input.
- Exact slash-prefixed literal terminal input for a published Telegram custom command can be forced with `//...` (for example `//docu` -> `/docu`).
- Recommended live topology: use one forum-enabled Telegram supergroup for ptydeck and create one topic per mapped terminal/session. In that shape, all mappings share the same `chatId` and differ by `messageThreadId`. The direct 1:1 bot chat is useful only for bootstrap, smoke tests, and initial `chatId` discovery.
- A Telegram channel is not sufficient for that layout. Forum topics require a forum-enabled supergroup, not a broadcast channel.
- The currently referenced invite target `https://t.me/+J4MInwk9nSg1MWJi` presently resolves to a Telegram channel, so it cannot host the per-terminal forum topics that `topicMode: "deck-session"` requires.
- Automatic per-terminal topic provisioning is now available through `topicMode: "deck-session"`. When that mode is configured for a forum target, the adapter validates that the target chat is a forum-enabled supergroup, then creates or reuses one Telegram forum topic per terminal/session and persists the resulting `messageThreadId` binding. This provisioning path still runs while outbound delivery remains disabled.
- Delivered topic naming convention for that forum layout: `<deck name> + <terminal name>`.
- To discover `chatId` and optional `messageThreadId`, send at least one message in the destination chat/topic and inspect:

```bash
curl -s "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates" | jq
```

Use:

- `message.chat.id` -> `chatId`
- `message.message_thread_id` -> `messageThreadId`

- With `topicMode: "deck-session"`, `ptydeck` provisions the per-terminal `messageThreadId` automatically once the target `chatId` points at a forum-enabled supergroup. The recommended live config is now one selectorless `deck-session` target per Telegram forum supergroup, so session-to-topic mapping follows the live ptydeck session set dynamically instead of depending on a hard-coded `sessionName` list. Manual `messageThreadId` discovery is still useful for validating an existing forum layout or for non-provisioned static mappings.

- The handbook guide [docs/manual/messaging-adapters.md](docs/manual/messaging-adapters.md) now includes the full operator setup and first-smoke sequence.

## 4.1 Secrets Management Strategy (ENT-005 Baseline)

Runtime secret injection pattern:

- Development:
  - Use local `.env` files only on the developer machine.
  - Keep sensitive local values out of tracked files.
- CI:
  - Provide secrets via CI secret store and inject as environment variables at runtime.
  - Do not print secrets in logs or test output.
- Production:
  - Use managed secret storage (for example platform-native secrets manager) as source of truth.
  - Inject secrets into process env at deploy/start time.
  - Avoid baking secrets into container images or repository artifacts.

Minimum secret inventory (current baseline):

- `AUTH_DEV_SECRET` (when `AUTH_MODE=dev`)
- Future production auth credentials/keys (OIDC/JWKS-related values)
- Any future encryption-at-rest keys

Rotation procedure baseline:

1. Create new secret version in secret store.
2. Deploy runtime with new secret version and validate health/smoke checks.
3. Revoke old secret version after successful cutover window.
4. Record rotation event (who/when/what) in ops change log.

Operational guardrails:

- Never return secrets in API responses.
- Redact known secret fields from logs (`authorization`, `token`, `secret`, `password`, `cookie`).
- Keep secret access limited to least-privilege runtime identities.

## 5. Start in Production Mode

Terminal 1:

```bash
npm --prefix backend run dev
```

Terminal 2:

```bash
npm --prefix frontend run dev
```

## 6. Post-Deploy Smoke Checks

Backend health:

```bash
curl -s http://127.0.0.1:18080/health
curl -s http://127.0.0.1:18080/ready
curl -s http://127.0.0.1:18080/metrics | head -n 20
```

When Telegram messaging is configured, verify additionally:

- `/health` returns a top-level `messaging` summary with `enabled: true`
- `/health.messaging.deliveryEnabled` shows whether generic outbound Telegram delivery is currently allowed
- `/health.messaging.allowlistDeliveryActive` and `/health.messaging.allowlistDeliveryScopes` expose whether narrow internal outbound allowlist paths such as `codex_input_reply`, `codex_separator_info`, `codex_separator_section`, and `codex_separator_summary_sentence` are active even while generic `deliveryEnabled` remains false
- `/health.messaging.codexTelegramReplyCorrelation` exposes the bounded Codex reply-block promotion state under its historical field name, including the reply-window duration and the number of sessions currently waiting for the first correlated Codex answer block after an eligible submitted input
- `/health.messaging.codexSummaryRestartRecovery` exposes the narrow summary-family restart-recovery state, including the configured quiet period, remaining post-ready quiet time, active recovering-session count, and persisted resend-ledger size
- `/ready` returns the same `messaging` summary
- `/health.messaging.trace` and `/ready.messaging.trace` expose a bounded recent trace ring for candidate, suppression, and delivery analysis
- `/health.messaging.adapters[0].inboundTrace` exposes a bounded recent Telegram inbound observation ring with raw `chatId`, `messageThreadId`, chat metadata, preview text, and parse outcome, including accepted `input_text` entries plus unsupported or non-text payloads that never become ptydeck actions
- `/health.messaging.adapters[0].targetTrace` exposes a bounded recent Telegram target-validation and topic-provisioning ring with `chatId`, topic mode, session/topic identity, forum-validation outcome, and provisioning errors or reuse/create/rename results
- `/health.messaging.adapters[0]` exposes Telegram backoff fields such as `backoffActive`, `backoffUntil`, and `backoffRemainingMs` after Bot API `retry after` responses
- `/health.messaging.adapters[0]` also exposes `allowlistDeliveryActive` and `allowlistDeliveryScopes`, so the narrow `H99`/`H105`/`H106` Codex-only outbound exceptions can be distinguished from generic delivery state without digging through traces
- `/health.messaging.adapters[0]` now also exposes Telegram command-publication state such as `publishedCommandCount`, `commandCatalogSize`, `commandSyncSkippedCount`, `lastCommandSyncAt`, and `lastCommandSyncError`
- When `topicMode: "deck-session"` is configured, `/health.messaging.adapters[0]` also exposes Telegram topic-provisioning counters, target-validation errors, delivery-enable state, and the active topic-binding count so forum-topic creation or rename failures are visible without digging through raw logs
- After the initial `deck-session` topic binding is persisted, mapping remains keyed by `chatId + messageThreadId`; a manual Telegram topic rename therefore keeps routing intact and is no longer automatically snapped back by the normal reuse path
- `/health.streamAnalysisCapture` and `/ready.streamAnalysisCapture` expose the current raw-stream analysis capture status, including whether capture is enabled, the bounded file path, configured app-label filters, captured/skipped/rotated counts, and the last capture error
- `/metrics` exposes `ptydeck_messaging_*` lines alongside the existing runtime metrics
- `/metrics` now also exposes `ptydeck_messaging_inbound_total{adapter="telegram",outcome="observed"}` for raw inbound observations seen before command filtering
- If bounded inbound is enabled, `/health` / `/ready` show the adapter's inbound status fields and `/metrics` includes `ptydeck_messaging_inbound_*` lines
- If bounded inbound is enabled, transient Telegram polling failures during startup backlog drain and later live polling should now increment the inbound failure counters while the adapter retries instead of leaving inbound permanently inactive after one startup transport error
- A mapped Telegram chat now issues published ptydeck custom commands through the Telegram bot-command catalog, and all other plain text, including unpublished slash-prefixed text, reaches the mapped PTY through the existing session-input path with the normal controller/access checks still enforced
- The shipped post-hard-break outbound path is still intentionally narrow: only `codex_input_reply`, `codex_separator_info`, `codex_separator_section`, and `codex_separator_summary_sentence` are allowed through the internal allowlist, where `codex_input_reply` covers the first bounded substantial Codex answer after an eligible submitted Codex input regardless of whether the originating path was Telegram, REST, or frontend `Send`, `codex_separator_info` covers simple separator-anchored `• info` blocks with at most one immediate continuation line once the same anchor has been proven too shallow for section ownership, `codex_separator_section` now covers assembled chrome-stripped narrative sections that can survive contaminated starts, implicit substantial `•` headlines, subsection labels, list items, and otherwise still-growing multiline closing comments before they are classified, and `codex_separator_summary_sentence` covers strict separator-hint sentence summaries that remain too small for the section family but too meaningful for generic hard-break suppression
- Repeated low-value agentic CLI chatter such as `Ran ...`, `Edited ...`, diff/update summaries, and separator-only fragments should now stay suppressed or coalesced into one evolving status thread instead of spraying many near-duplicate Telegram messages
- Coding-agent planning chatter such as `next active block ...`, version bullets, `/review on my current changes` echoes, low-value `Updated Plan`-style summaries, and hash-prefixed commit or plan lines such as `- 961f98a ...` should now stay suppressed instead of surfacing as Telegram status
- Coding-agent summary detection should now favor explicit result lines instead of any line that merely contains broad nouns such as `coverage`, so wrapped roadmap or planning fragments like `coverage hardening` or `host-window smoke coverage ...` should no longer escape as Telegram status updates
- Repeated attention churn from one logical failure should no longer fan out into many nearly identical alerts, structural tail lines such as trailing `}` should not appear as standalone Telegram attention messages, and the same exact failure should be able to alert again after the bounded churn window expires
- If a later line adds meaningful detail to that same recent failure, the existing Telegram attention post should now be edited in place instead of spawning another alert message
- Status updates should no longer inherit `done`/`updated` from a previous line into unrelated prompt echoes, Markdown file lists, or similar follow-up tails, same-chunk prompt markers should not hide meaningful status text behind an early `Prompt ready.`, and repeated `Session idle.` updates should not keep bumping the same Telegram thread without an intervening meaningful status change or merely because recent low-value or otherwise unclassified coding-agent chatter was suppressed
- Telegram-visible failure lines should now shed appended coding-agent breadcrumb tails and partial terminal-control residue such as `38;5;2m` or `9;1H`, zero-count issue lines such as `0 Error(s)` should stay suppressed, short snippet follow-ons after a stronger failure line should not emerge as their own Telegram alerts, and actionable file or URL diagnostics should remain visible when they belong to the real failure line
- Short low-context OS-error fragments such as `falsch. (os error 123)` should now stay suppressed instead of becoming standalone Telegram alerts

Session API:

```bash
curl -s -X POST http://127.0.0.1:18080/api/v1/sessions -H 'content-type: application/json' -d '{}'
curl -s http://127.0.0.1:18080/api/v1/sessions
```

Frontend:

- Open `http://127.0.0.1:18081`
- Create session
- Send command (for example `pwd`)
- Confirm output appears in the corresponding terminal panel

## 7. Local Reverse Proxy Note

If local TLS/domain routing is used, route frontend and backend with explicit hosts, for example:

- Frontend host: `https://app.local.example`
- Backend API host: `https://api.local.example/api/v1`
- Backend WS host: `wss://api.local.example/ws`

When this mode is enabled, `CORS_ORIGIN` and WebSocket origin checks should use explicit allowlists instead of wildcard values.
Recommended production setup:

- `NODE_ENV=production`
- `CORS_ORIGIN=https://app.example.com,https://ops.example.com`
- Do not use `CORS_ORIGIN=*` in production.

Behavior summary:

- `development` without `CORS_ORIGIN`: wildcard CORS (`*`) for local dev convenience.
- `production` without `CORS_ORIGIN`: startup fails fast (`CORS_ORIGIN` is required).
- `production` with `CORS_ORIGIN=*`: startup fails fast (wildcard is blocked in production).
- `AUTH_MODE=prod`: startup fails currently (production provider is not implemented in current baseline).
Keep provider-specific local proxy configuration files outside tracked docs/code in a gitignored local path.

### 7.1 Provider-Agnostic HTTPS/WSS Reverse-Proxy Contract

Use this routing contract independent of ingress provider:

- Frontend host routes to frontend service port `18081`.
- API host routes path prefix `/api/v1` to backend service port `18080`.
- API host routes path `/ws` to backend service port `18080` with WebSocket upgrade pass-through.
- Preserve `Host`, `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-For` headers.
- Enforce TLS at ingress and use `https://` + `wss://` URLs in frontend runtime config.

Minimal abstract route map:

```text
https://app.example.com                  -> http://backend-frontend:18081
https://api.example.com/api/v1/*         -> http://backend-api:18080/api/v1/*
wss://api.example.com/ws                 -> ws://backend-api:18080/ws
```

WebSocket requirements:

- HTTP/1.1 upgrade support must be enabled.
- `Connection: upgrade` and `Upgrade: websocket` headers must be forwarded.
- Idle timeouts must be long enough for interactive terminal sessions.

## 8. Rollback

1. Checkout previous stable commit/tag.
2. Restart backend and frontend.
3. Re-run smoke checks above.

### 8.1 H62/H64 Trusted-Local Multi-Device Rollback

When rolling back from `feature/h62-multi-device-control-foundation` to `main`, do not rely on the one-time startup backup alone. Restore both backend and browser-local state before switching branches.

Backend runtime state:

```bash
npm run h62:rollback:restore
```

Browser-local state:

1. Keep the feature-branch frontend available long enough to serve `/rollback-restore.html`.
2. Open `http://127.0.0.1:18081/rollback-restore.html` in the same browser profile that ran the feature branch.
3. Run `Restore Browser State`.

Then complete the branch rollback:

1. Checkout `main` (or the target stable commit/tag).
2. Restart backend and frontend.
3. Re-run the smoke checks above in the restored browser profile.

### 8.2 H65 Trusted-Local Second-Client LAN Smoke

Use this checklist to validate `feature/h62-multi-device-control-foundation` from at least one second LAN client under the real hostnames.

For a sign-off-oriented execution sheet, use [docs/MDT-014 Trusted-Local LAN Acceptance.md](docs/MDT-014%20Trusted-Local%20LAN%20Acceptance.md) together with this runbook section.

Preconditions:

1. The active branch is `feature/h62-multi-device-control-foundation`.
2. The backend and frontend are running on the primary host.
3. LAN DNS resolves both hostnames to the primary host:
   - `ptydeck.local.secos.rocks`
   - `api.ptydeck.local.secos.rocks`
4. The second LAN client uses a normal browser profile with `localStorage` enabled.
5. The second LAN client is not the same browser instance/profile as the primary host browser already attached to the session.

Expected baseline responses before UI interaction:

1. `https://ptydeck.local.secos.rocks/` returns `200`.
2. `https://api.ptydeck.local.secos.rocks/api/v1/sessions` returns `401 Missing bearer token` before auth bootstrap.
3. `https://api.ptydeck.local.secos.rocks/ws` with WebSocket upgrade headers returns `401 Missing WebSocket ticket` before ticket creation.

Second-client smoke procedure:

1. Open `https://ptydeck.local.secos.rocks/` on the second LAN client.
2. Confirm the frontend boots without a startup-gate failure screen.
3. Confirm the browser creates or reuses the H62 rollback backup in local storage:
   - storage key: `ptydeck.backup.pre-h62.v1`
4. Confirm the browser creates or reuses the trusted-local client identity in local storage:
   - storage key: `ptydeck.trusted-local-client.v1`
5. Confirm the frontend reaches a usable runtime state under the real hostnames:
   - the session list loads
   - no persistent REST auth failure remains visible
   - the runtime transitions into connected state
6. Confirm WebSocket boot succeeds under the real hostnames:
   - the browser obtains a WS ticket
   - the ticket payload includes the trusted-local `clientId` and `label`
   - the WS connection reaches the normal connected state
7. With one primary client already attached to a session, attach the second LAN client to the same session and verify:
   - both clients see the same session output
   - the second client appears in the attached-device list
   - trusted-local labels distinguish `This device` from `Other device`
8. Verify the subtle startup takeover flow on the second client:
   - the UI offers the trusted-local startup takeover prompt when the second client is not already the effective controller
   - declining the prompt keeps the second client attached without silently taking control
   - accepting the prompt can take control without a prior release from the first client
9. Verify controller reclaim and scope-aware takeover behavior between the two clients:
   - a blocked write on the non-controller client exposes `Take Control` or `Reclaim Control`
   - taking or reclaiming control succeeds deterministically without requiring multiple retries
   - the compact `Control` flow can claim `All Sessions`, `This Deck`, and `This Session`
   - the controller indicator updates on both clients
   - subsequent write attempts on the controller client succeed
10. Verify device-local layout recall on successful takeover:
   - a known device reapplies its own local layout and terminal-size preferences after takeover
   - an unseen device captures a first-use baseline instead of forcing another device's layout
   - layout application stays local to the claiming device and does not disturb the other attached client
11. Verify stale-device cleanup:
   - disconnect or close one attached client
   - wait for the branch's stale/offline handling to settle
   - confirm a stale device can be forgotten explicitly when the UI offers it

Fail the LAN smoke if any of the following occur:

- The second client cannot boot because the startup backup or trusted-local identity cannot be created or verified.
- REST auth or WS ticket bootstrap succeeds only on loopback/dev URLs but fails on the real hostnames.
- The attached-device list diverges between clients.
- Blocked writes remain passive and do not offer reclaim.
- Control state becomes ambiguous or both clients can write concurrently.

Record the result with:

- second-client device/browser used
- date/time
- hostnames tested
- pass/fail per step
- any remaining follow-up defects

### 8.3 H65 Merge-Readiness Acceptance Checklist

`feature/h62-multi-device-control-foundation` is merge-ready only when all items below are explicitly marked pass.

Trusted-local LAN validation:

- [ ] A second LAN client booted successfully under `https://ptydeck.local.secos.rocks/`.
- [ ] The second LAN client created or verified `ptydeck.backup.pre-h62.v1`.
- [ ] The second LAN client created or verified `ptydeck.trusted-local-client.v1`.
- [ ] REST auth bootstrap worked under `https://api.ptydeck.local.secos.rocks`.
- [ ] WebSocket ticket bootstrap worked under `https://api.ptydeck.local.secos.rocks/ws`.
- [ ] The WS ticket flow carried the trusted-local `clientId` and `label`.

Multi-device control behavior:

- [ ] Two attached clients can observe the same session output under the real hostnames.
- [ ] Only one client can control input/PTY-authoritative resize at a time.
- [ ] The second client shows the trusted-local startup takeover prompt when appropriate.
- [ ] Startup takeover can claim control without a prior release from the current controller.
- [ ] A blocked non-controller write offers `Take Control` or `Reclaim Control`.
- [ ] Scope-aware takeover works for `All Sessions`, `This Deck`, and `This Session`.
- [ ] Control reclaim updates attached clients deterministically.
- [ ] Successful takeover reapplies or first-captures device-local layout and terminal-size preferences without cross-device layout fights.
- [ ] Stale or offline attached devices can be forgotten without corrupting active control state.

Rollback and restore:

- [ ] Backend rollback restore succeeds with `npm run h62:rollback:restore`.
- [ ] Browser rollback restore succeeds through `/rollback-restore.html` in the same browser profile.
- [ ] After restoring and switching back to `main`, the restored browser profile boots without branch-specific state breakage.

Documentation and branch hygiene:

- [ ] `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, and `CODEX_CONTEXT.md` reflect the final branch state.
- [ ] The feature branch worktree is clean after validation.
- [ ] No leftover validation or smoke-test processes remain.

If any checklist item is not pass, do not merge the branch. Keep the branch open, record the failing item, and queue the concrete remediation task before attempting merge again.

## 9. Production Logging Standard

Use the following production logging contract for backend and frontend serving processes:

- Log format:
  - JSON line logs in production (`one JSON object per line`).
  - Plain text logs are allowed only for local development troubleshooting.
- Required base fields:
  - `ts` (ISO-8601 timestamp)
  - `level` (`debug|info|warn|error`)
  - `service` (`ptydeck-backend` or `ptydeck-frontend`)
  - `event` (stable event name)
  - `requestId` (when request-scoped)
- Correlation and request tracing:
  - Accept inbound `X-Request-Id` if present.
  - Generate one if missing.
  - Propagate `X-Request-Id` to downstream logs/events for the same request.
- PII and secret redaction rules:
  - Never log bearer tokens, cookies, passwords, secret keys, session command payloads, or full terminal output bodies.
  - Redact sensitive headers/fields at source (`authorization`, `cookie`, `set-cookie`, `access_token`, `refresh_token`, `password`, `secret`, `token`).
  - For troubleshooting, log metadata only (lengths, IDs, status, timing), not sensitive values.
- Retention policy baseline:
  - Keep hot logs for `14` days in non-prod and `30` days in prod.
  - Archive storage may keep compressed logs longer per compliance policy, but runtime logs must have enforced TTL.
  - Document and automate purge cadence in operations tooling.
- Access control:
  - Restrict production log access to least-privilege operator roles.
  - Keep audit trail for log access in managed logging platform.

Recommended runtime env pattern:

- `NODE_ENV=production`
- `LOG_FORMAT=json`
- `LOG_RETENTION_DAYS=30`
- `LOG_REDACT_FIELDS=authorization,cookie,set-cookie,access_token,refresh_token,password,secret,token`

## 9.1 SLO/SLI and Alerting Baseline (ENT-008)

### 9.1.0 Local Observability Wiring Baseline (OBS-003)

Scrape targets (local):

- Backend operational endpoint: `http://127.0.0.1:18080/metrics`
- Recommended scrape interval: `15s`
- Recommended scrape timeout: `5s`

Minimal dashboard panels (required baseline):

- API request volume and error ratio:
  - `ptydeck_http_requests_total`
  - `ptydeck_http_errors_total`
  - `ptydeck_http_requests_by_status_total`
- API latency:
  - `ptydeck_http_request_duration_ms_sum`
  - `ptydeck_http_request_duration_ms_count`
  - `ptydeck_http_request_duration_ms_bucket`
- Session lifecycle:
  - `ptydeck_sessions_active`
  - `ptydeck_sessions_active_by_lifecycle`
  - `ptydeck_sessions_created_total`
  - `ptydeck_sessions_started_total`
  - `ptydeck_sessions_exited_total`
  - `ptydeck_sessions_unrestored_total`
- WebSocket quality:
  - `ptydeck_ws_connections_active`
  - `ptydeck_ws_connections_opened_total`
  - `ptydeck_ws_connections_closed_total`
  - `ptydeck_ws_reconnects_total`
  - `ptydeck_ws_reconnects_by_reason_total`
  - `ptydeck_ws_disconnects_by_reason_total`
  - `ptydeck_ws_errors_total`
  - `ptydeck_ws_errors_by_reason_total`

Recommended local alert thresholds:

- Warning:
  - `ptydeck_sessions_unrestored_total > 0` for `5m`.
  - `rate(ptydeck_ws_disconnects_by_reason_total[5m]) > 0` sustained for `15m`.
  - `rate(ptydeck_ws_errors_total[5m]) > 0` sustained for `15m`.
- Critical:
  - `increase(ptydeck_ws_disconnects_by_reason_total{reason="heartbeat_timeout"}[5m]) > 0`.
  - API 5xx ratio over 5 minutes greater than `5%` (as defined in `9.1`).

Baseline SLI signals:

- API availability:
  - Definition: ratio of successful API responses (`2xx`/`3xx`) over total API requests.
  - Source: `ptydeck_http_requests_total`, `ptydeck_http_requests_by_status_total`.
- API error rate:
  - Definition: ratio of `5xx` responses over total API requests.
  - Source: `ptydeck_http_requests_by_status_total`.
- WS disconnect quality:
  - Definition: disconnect/open ratio over rolling window.
  - Source: `ptydeck_ws_connections_opened_total`, `ptydeck_ws_connections_closed_total`.
- Request latency:
  - Definition: average request latency from `duration_sum / duration_count`.
  - Source: `ptydeck_http_request_duration_ms_sum`, `ptydeck_http_request_duration_ms_count`.

Initial SLO targets (baseline, tune after real traffic):

- API availability monthly target: `>= 99.5%`
- API 5xx error ratio monthly target: `<= 1.0%`
- WS disconnect/open ratio 15m target: `<= 10%`
- Average API latency target: `<= 250ms` (rolling 15m)

Initial alert thresholds:

- Critical:
  - API availability `< 99.0%` over 15 minutes.
  - API 5xx ratio `> 5%` over 5 minutes.
- Warning:
  - API availability `< 99.5%` over 30 minutes.
  - API 5xx ratio `> 2%` over 15 minutes.
  - WS disconnect/open ratio `> 20%` over 15 minutes.
  - Average API latency `> 500ms` over 15 minutes.

Alert routing baseline:

- Warning alerts to team channel/on-call dashboard.
- Critical alerts to pager/on-call escalation path.
- Every critical alert requires a post-incident note with timestamp, impact, root-cause hypothesis, and follow-up actions.

## 9.2 Security Response Headers Baseline (ENT-016)

Backend runtime response hardening:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`

Scope:

- Applied to API and operational endpoints (`/api/v1/*`, `/health`, `/ready`, `/metrics`).
- This baseline is intentionally strict because backend serves API payloads and metrics, not browser-rendered documents.

HSTS policy (ingress/proxy responsibility):

- Set `Strict-Transport-Security` at TLS ingress/reverse proxy layer, not directly in backend runtime.
- Recommended baseline:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - Add `preload` only when domain ownership and rollout policy are validated for all subdomains.

## 9.3 Trusted Proxy Handling Baseline (ENT-019)

Backend runtime now supports explicit trusted-proxy configuration for safe `X-Forwarded-*` handling:

- Environment variable: `TRUST_PROXY`
- Allowed values:
  - `off` (default): ignore `X-Forwarded-*`, use direct socket metadata only.
  - `loopback`: trust forwarded headers only when request comes from loopback proxy (`127.0.0.1` / `::1`).
  - `all`: trust forwarded headers from any upstream (not recommended except controlled environments).
  - Comma-separated proxy IP allowlist (for example `10.0.0.2,10.0.0.3`).

Security behavior:

- If upstream is not trusted, backend ignores `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host`.
- If upstream is trusted, backend accepts sanitized first-hop values from these headers.
- Invalid `TRUST_PROXY` values fail fast at startup.

Recommended production baseline:

- Run with explicit proxy IP allowlist, not `all`.
- Keep ingress and backend in a fixed network topology so trusted proxy source IPs are deterministic.

## 9.4 Abuse-Control Rate Limiting Baseline (ENT-006)

Backend runtime applies fixed-window limits per resolved client IP:

- REST create-session endpoint: `POST /api/v1/sessions`
- WebSocket connection creation endpoint: `/ws`

Configuration:

- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_REST_CREATE_MAX` (default `60`, `0` disables REST create limiter)
- `RATE_LIMIT_WS_CONNECT_MAX` (default `60`, `0` disables WS connect limiter)

Behavior:

- Exceeded REST create limit returns `429` with `RateLimitExceeded` error payload.
- Exceeded WS connect limit returns HTTP `429` during upgrade with `Retry-After` header.
- Client identity for limits uses trusted-proxy-aware request context (`TRUST_PROXY`).

## 9.5 Session Lifecycle Guardrails Baseline (ENT-020)

Backend runtime enforces optional lifecycle guardrails for PTY sessions:

- Max concurrent sessions:
  - Config: `SESSION_MAX_CONCURRENT` (`0` disables).
  - Behavior: `POST /api/v1/sessions` returns `409 SessionLimitExceeded` when cap is reached.
- Idle timeout:
  - Config: `SESSION_IDLE_TIMEOUT_MS` (`0` disables).
  - Behavior: session is auto-closed when idle threshold is reached.
- Max lifetime:
  - Config: `SESSION_MAX_LIFETIME_MS` (`0` disables).
  - Behavior: session is auto-closed when lifetime threshold is reached.
- Sweep interval:
  - Config: `SESSION_GUARDRAIL_SWEEP_MS` (default `1000` ms).
  - Behavior: periodic enforcement loop for idle/lifetime policies.

Operational guidance:

- Start with conservative non-zero values in production-like environments.
- Keep `SESSION_MAX_CONCURRENT` aligned with host capacity and PTY process limits.
- Tune idle/lifetime thresholds to expected operator workflows to avoid premature termination.

## 9.5A Replay and Scrollback Retention Baseline (DRV-002)

Backend replay recovery is explicitly tail-based and configurable:

- In-memory reconnect replay tail:
  - Config: `SESSION_REPLAY_MEMORY_MAX_CHARS`
  - Default: `16384`
  - `0` disables replay output in reconnect snapshots.
- Persisted restart replay tail:
  - Config: `SESSION_REPLAY_PERSIST_MAX_CHARS`
  - Default: `0` (disabled)
  - When enabled, backend persists the configured tail and seeds it back into snapshot replay after restart.

Operational/product constraints:

- `SESSION_REPLAY_PERSIST_MAX_CHARS` must be less than or equal to `SESSION_REPLAY_MEMORY_MAX_CHARS`.
- Recovery is partial by design; this preserves recent operator context only.
- Full terminal state, job control state, editor state, and full shell history are still out of scope.

## 9.6 Persistence Encryption-at-Rest Baseline (ENT-012)

Persistence encryption is optional and uses AES-256-GCM envelope format:

- `DATA_ENCRYPTION_KEYS`: comma-separated `keyId:base64Key` entries.
- `DATA_ENCRYPTION_ACTIVE_KEY_ID`: active key id used for new writes.

Behavior:

- If encryption settings are not provided, persistence remains plaintext JSON.
- If encryption is configured, writes are encrypted with active key id.
- Reads resolve key by stored `keyId`, enabling key rotation windows with old+new keys loaded.
- Invalid encryption configuration fails fast at startup.

Rotation baseline:

1. Add new key to `DATA_ENCRYPTION_KEYS` and set `DATA_ENCRYPTION_ACTIVE_KEY_ID` to new key id.
2. Restart service and allow next persistence save cycle to rewrite payload with new key id.
3. Verify persisted payload now references new key id.
4. Remove retired key id from `DATA_ENCRYPTION_KEYS` after successful cutover.

## 9.7 TLS-Only Ingress and Certificate Lifecycle Baseline (ENT-011)

Runtime TLS ingress enforcement:

- Config: `ENFORCE_TLS_INGRESS`
  - Defaults: `0` in development, `1` in production.
- Requirement: `TRUST_PROXY` must be configured (`loopback`, `all`, or explicit IP allowlist) when TLS ingress enforcement is enabled.
- Behavior:
  - REST/API requests using non-HTTPS request context are rejected with `426 TlsRequired`.
  - WS upgrades using non-HTTPS request context are rejected with HTTP `426`.
- Startup guardrails:
  - Production mode requires explicit `CORS_ORIGIN` allowlist (already enforced).
  - Production mode rejects `CORS_ORIGIN=*`.
  - With TLS ingress enforcement enabled, every configured CORS origin must be `https://...`.

Certificate lifecycle baseline:

- Keep a renewal window of at least `30` days before expiration.
- Monitor all ingress host certificates continuously.
- Validate post-renewal by checking served certificate expiry and end-to-end HTTPS/WSS reachability.

Automated expiry check:

- Script: `./scripts/check-cert-expiry.sh`
- Inputs:
  - `TLS_EXPIRY_CHECK_HOSTS` as comma/space-separated host list (`host` or `host:port`)
  - `TLS_EXPIRY_THRESHOLD_DAYS` (default `30`)
- CI integration:
  - Workflow step `TLS certificate expiry check` runs on Node `18`.
  - Uses repository variables `TLS_EXPIRY_CHECK_HOSTS` / `TLS_EXPIRY_THRESHOLD_DAYS`.
  - If host list is empty, the check is skipped with explicit log output.

## 9.8 Security Scanning and SBOM Baseline (ENT-007)

Dependency vulnerability gate:

- Script: `./scripts/security-scan.sh`
- Default threshold: `SCA_AUDIT_LEVEL=high` (allowed values: `low|moderate|high|critical`)
- Current behavior:
  - Runs `npm audit` for backend and frontend dependency trees.
  - Exits non-zero when vulnerabilities at or above configured threshold are found.

SBOM generation:

- Script: `./scripts/generate-sbom.sh`
- Output directory: `artifacts/security/sbom`
- Generated files (format depends on generator availability):
  - SPDX via `npm sbom`: `root.spdx.json`, `backend.spdx.json`, `frontend.spdx.json`
  - CycloneDX fallback: `root.cdx.json`, `backend.cdx.json`, `frontend.cdx.json`

CI integration:

- CI `security` job runs:
  - dependency vulnerability gate (`scripts/security-scan.sh`)
  - SBOM generation (`scripts/generate-sbom.sh`)
  - SBOM upload as workflow artifact (`sbom-spdx`)
- Optional image scan:
  - If repository variable `SECURITY_IMAGE_REF` is set, CI runs Trivy image scan and fails on `HIGH`/`CRITICAL`.

Suggested CI variables:

- `SCA_AUDIT_LEVEL` (optional, defaults to `high`)
- `SECURITY_IMAGE_REF` (optional, enables image scan when set)

## 9.9 Persistence Backup/Restore Baseline (ENT-009)

Backup creation:

- Script: `./scripts/backup-sessions.sh`
- Inputs:
  - `DATA_PATH` (default `./backend/data/sessions.json`)
  - `BACKUP_DIR` (default `./backups/sessions`)
- Output:
  - Gzip-compressed backup file: `sessions-<UTC_TIMESTAMP>.json.gz`

Restore:

- Script: `./scripts/restore-sessions.sh`
- Inputs:
  - `TARGET_DATA_PATH` (default `./backend/data/sessions.json`)
  - `BACKUP_DIR` (default `./backups/sessions`)
  - `BACKUP_FILE` (optional explicit file; if omitted, latest backup in `BACKUP_DIR` is used)

Roundtrip verification (non-prod/CI):

- Script: `./scripts/verify-backup-restore.sh`
- Behavior:
  - Creates deterministic sample persistence payload.
  - Executes backup and restore scripts.
  - Fails if restored payload does not byte-match source payload.

CI integration:

- Security job runs `./scripts/verify-backup-restore.sh` after SBOM generation.
- This provides periodic restore verification as part of non-production automation.

## 9.10 Data Retention/Purge Baseline (ENT-024)

Retention policy targets:

- Session backup files (`./backups/sessions`): retain `14` days.
- Backend operational logs (`./backend/logs`): retain `30` days.
- Security artifacts (`./artifacts/security`): retain `30` days.

Purge automation:

- Script: `./scripts/purge-retention.sh`
- Defaults:
  - `PURGE_DRY_RUN=1` (safe mode; reports candidates without deleting)
  - `SESSION_BACKUP_RETENTION_DAYS=14`
  - `BACKEND_LOG_RETENTION_DAYS=30`
  - `SECURITY_ARTIFACT_RETENTION_DAYS=30`

Configurable paths:

- `SESSION_BACKUP_DIR` (default `./backups/sessions`)
- `BACKEND_LOG_DIR` (default `./backend/logs`)
- `SECURITY_ARTIFACT_DIR` (default `./artifacts/security`)

Operational cadence:

- CI non-prod checks run the purge script in dry-run mode to continuously validate retention rules and path wiring.
- Production/non-prod runtime cleanup should execute the same script on a daily scheduler with `PURGE_DRY_RUN=0`.

Example (actual deletion run):

```bash
PURGE_DRY_RUN=0 npm run retention:purge
```

## 9.11 Release Evidence Bundle Baseline (ENT-015)

Release evidence generation:

- Script: `./scripts/generate-release-evidence.sh`
- Root shortcut: `npm run release:evidence`
- Output: `artifacts/release-evidence/release-evidence-<UTC_TIMESTAMP>.tar.gz`

Evidence bundle contents:

- quality evidence logs:
  - `quality/backend-test.log`
  - `quality/frontend-test.log`
  - `quality/coverage-check.log`
- security evidence logs:
  - `security/sca.log`
  - `security/sbom.log`
  - `security/backup-verify.log`
  - `security/retention-purge.log`
- SBOM payloads:
  - `security/sbom/*.json`
- provenance and integrity:
  - `manifest.json` with CI provenance (`GITHUB_SHA`, `GITHUB_REF`, workflow/run metadata)
  - `checksums.sha256` for included evidence files

CI integration:

- Security workflow captures test/security logs, generates SBOM, and invokes release evidence generation.
- CI uploads the `release-evidence` artifact for audit/compliance traceability.

## 9.12 Non-Functional Load and Fanout Baseline (ENT-022)

Load/fanout verification command:

```bash
npm run test:load
```

Current automated scenario (`backend/test/nonfunctional.load.test.js`):

- Creates a concurrent session batch and validates REST `POST /api/v1/sessions` latency.
- Sends concurrent `POST /api/v1/sessions/{sessionId}/input` requests and validates latency.
- Deletes sessions concurrently and validates `DELETE /api/v1/sessions/{sessionId}` latency.
- Opens multiple WebSocket clients and verifies that `session.created` / `session.closed` events fan out to every client without instability.

Default pass/fail thresholds (overridable with env vars):

- `LOAD_CREATE_P95_MAX_MS=400`
- `LOAD_INPUT_P95_MAX_MS=250`
- `LOAD_DELETE_P95_MAX_MS=300`
- `LOAD_WAIT_TIMEOUT_MS=5000` for fanout completion checks

Scenario size controls (optional):

- `LOAD_SESSION_BATCH_SIZE` (default `12`)
- `LOAD_INPUT_BATCH_SIZE` (default `4` per session)
- `LOAD_WS_CLIENT_COUNT` (default `8`)
- `LOAD_FANOUT_SESSION_COUNT` (default `6`)

Operational guidance:

- Run this suite in non-prod CI or dedicated perf environments; keep thresholds stable and adjust only with documented baseline updates.
- Re-tune thresholds only after measuring repeated baseline runs on target hardware profile.

## 9.13 Disaster Recovery Runbook and Drill Baseline (ENT-014)

Recovery objectives (baseline):

- `RTO` target: `120` seconds for backup-restore drill completion.
- `RPO` target: `60` seconds maximum tolerated data-loss window.

Runbook (non-prod and production-aligned):

1. Trigger incident mode and stop write traffic to the affected runtime.
2. Identify recovery source (latest valid backup artifact).
3. Execute restore into target data path.
4. Validate restored payload integrity and service readiness (`/health`, `/ready`).
5. Re-enable traffic and monitor metrics/error rates.
6. Record drill/incident evidence (timestamps, RTO/RPO result, operator notes).

Automated periodic drill:

- Script: `./scripts/dr-restore-drill.sh`
- Root shortcut: `npm run dr:drill`
- Behavior:
  - Executes deterministic backup/restore roundtrip verification.
  - Measures elapsed restore drill duration (`measuredRtoSeconds`).
  - Enforces configurable targets:
    - `DR_RTO_TARGET_SECONDS` (default `120`)
    - `DR_RPO_TARGET_SECONDS` (default `60`)
  - Emits drill report: `artifacts/security/dr-drill.json`

CI/non-prod automation:

- CI `security` job executes the restore drill and stores `artifacts/security/dr-drill.log`.
- Suggested repository variables:
  - `DR_RTO_TARGET_SECONDS`
  - `DR_RPO_TARGET_SECONDS`
- On threshold breach, CI fails fast and blocks merge/release.

## 9.14 Least-Privilege Runtime Profile Baseline (ENT-013)

Baseline profile artifact:

- `security/runtime-profile.json`
- Defines:
  - non-root runtime requirement
  - allowed writable filesystem roots
  - read-only source/config roots
  - non-privileged ingress ports
  - deny-by-default egress policy baseline

Automated profile check:

- Script: `./scripts/check-runtime-profile.sh`
- Root shortcut: `npm run runtime:profile:check`
- Validates:
  - runtime process is not root
  - backend/frontend ports are non-privileged (`1024..65535`)
  - `DATA_PATH` stays within configured write roots
  - egress policy mode stays `deny-by-default`

CI/non-prod enforcement:

- CI `security` job executes runtime profile check and stores `artifacts/security/runtime-profile.log`.
- Profile violations fail CI and block merge/release.

## 10. Release Checklist

- [ ] `main` branch is up to date
- [ ] Quality gate passed
- [ ] `TODO.md`, `ROADMAP.md`, and `CHANGELOG.md` updated
- [ ] `CODEX_CONTEXT.md` updated if architecture/process changed
- [ ] Deployment smoke checks passed
