# CODEX CONTEXT - ptydeck

Last updated: 2026-05-06 (the backend runtime now delegates session-control client/session authority into `backend/src/runtime-session-control-authority.js`, share/spectator request-access and metrics helpers into `backend/src/runtime-access-policy.js` and `backend/src/runtime-metrics.js`, deck/session-state shaping into `backend/src/runtime-session-state.js`, share/layout/connection/workspace authority into `backend/src/runtime-library-authority.js`, retained catalog/state normalization into `backend/src/runtime-library-normalization.js`, and SSH trust lifecycle handling into `backend/src/runtime-ssh-trust.js`; the backend session manager now delegates cleanup into `backend/src/session-manager-cleanup.js`, SSH remote-runtime state shaping into `backend/src/session-manager-remote-runtime.js`, startup/post-start input lifecycle into `backend/src/session-manager-startup-runtime.js`, app-identity refresh and output-heuristic arbitration into `backend/src/session-manager-app-identity-runtime.js`, and SSH launch/reconnect orchestration into `backend/src/session-manager-launch-runtime.js`; trusted-local handoff still resolves runtime client id through the session-control authority seam and fails closed on stale session takeover targets; SSH launches still pin `HostKeyAlgorithms` to the trusted host-key types for the selected target, pass an absolute managed `UserKnownHostsFile` path into spawned `ssh` processes, preserve canonical padded host-key base64 so the rendered managed `ssh_known_hosts` file stays parseable by OpenSSH, keep secret-backed auth on one masked action-dialog seam, expose slash-command host-key lifecycle management through `/ssh hostkey ...`, surface first-connect and rotation trust guidance directly in `Connections`, and extend one-shot `/ssh ...` parity with `--deck`, `--cwd`, and `--command`; multiline terminal sends now distinguish shell-family sessions from coding-agent/unknown sessions so the frontend can normalize internal line separators to the configured terminator for shell-targeted `Send`, custom-command, and quick-send flows instead of always forcing raw `LF` inside multiline payloads; the frontend runtime composition still delegates trusted-local handoff/layout, bootstrap wiring, runtime-event recovery, session-control plus quick-send access, operator-support assembly, and startup/workflow/palette/initialization composition out of `frontend/src/public/app-runtime-composition-controller.js`; `frontend/src/public/command-executor.js` now also delegates retained runtime/router helpers into `frontend/src/public/command-executor-runtime-router.js` after earlier extractions into settings, operator, reporting, custom-admin, and custom-command seams; `frontend/src/public/connection-profile-runtime-controller.js` still delegates SSH trust/launch lifecycle, draft/profile/workspace state shaping, computed draft/trust presentation, and operator UI binding/render work into its extracted seam modules; retained store and terminal-interaction regressions now explicitly cover no-op correlation branches, guarded Ctrl-C copy/cancel handling, duplicate clipboard-event suppression, and custom-key-handler restoration; `v0.4.0-H173` remains active with `QLT-303` through `QLT-307` still open in `TODO.md` / `ROADMAP.md`)

## Current Product Truth

The live messaging path is no longer a stream-to-message system.

On 2026-04-16 the messaging runtime was intentionally reset after the earlier projection/legacy/shadow migration accumulated too much behavioral overlap, too many gates, and too much historical compatibility ballast in the product path.

The shipped runtime now keeps only a transport-only messaging baseline:

- adapter lifecycle
- target normalization
- Telegram forum-topic provisioning and persisted topic bindings
- Telegram inbound command/input handling
- transport-level traces, health, and metrics
- adapter-neutral message policy helpers for explicit `MessageIntent` delivery

The live runtime no longer performs automatic PTY-stream or terminal-output interpretation into outbound Telegram/Discord messages.
The live runtime also no longer infers app-specific trigger profiles such as `coding-agent` or `build-test` for target routing.
The operator-facing frontend handbook no longer advertises messaging adapters as a current workflow surface while the third messaging attempt remains deferred.

Structured Audit Baseline (v0.4.0-H154):

- Backend HTTP entrypoints now emit structured audit events for security-relevant access and session operations.
- `backend/src/audit-log.js` owns normalized action/outcome classification and sensitive-field redaction.
- `backend/src/runtime.js` emits JSON-line events for:
  - `session.create`
  - `session.delete`
  - `session.input`
  - `session.resize`
  - `auth.failure` on authentication/authorization failures
- Configuration is controlled via:
  - `AUDIT_LOGS` (boolean enable switch)
  - `AUDIT_LOG_FILE` (optional destination path; if omitted, events go to stdout)
- Actor handling:
  - auth-disabled path records `local-operator`
  - denied/auth-failure paths record `anonymous`/`unknown` with route context
  - auth-enabled success paths include the resolved auth subject and scopes
- Redaction policy:
  - request bodies are normalized to metadata only where needed
  - terminal input payloads are never written (only byte counts are recorded)
- tokens, tenant-like values, and transport/header credential fields are not emitted

## Production Auth Baseline

`v0.4.0-H155` completed the production auth provider seam without changing the product into a multi-user runtime.

Current contract:

- `AUTH_MODE=off` keeps auth disabled.
- `AUTH_MODE=dev` remains local-only and exposes `POST /api/v1/auth/dev-token` for browser bootstrap.
- `AUTH_MODE=prod` validates external operator bearer tokens through OIDC discovery/JWKS using:
  - `AUTH_PROD_ISSUER`
  - `AUTH_PROD_AUDIENCE`
  - optional `AUTH_PROD_DISCOVERY_URL`
  - optional `AUTH_PROD_JWKS_URL`
  - optional `AUTH_PROD_JWKS_CACHE_TTL_SECONDS`
- The backend still keeps one internal HS256 bearer path, backed by `AUTH_DEV_SECRET`, `AUTH_ISSUER`, and `AUTH_AUDIENCE`, for:
  - dev-token bootstrap in `AUTH_MODE=dev`
  - read-only share-link tokens
  - short-lived WebSocket ticket admission after authenticated HTTP bootstrap
- Runtime startup now prewarms OIDC discovery/JWKS metadata in `AUTH_MODE=prod` and fails fast if provider metadata or signing keys cannot be loaded.
- REST and WebSocket admission both use the same auth verifier seam instead of separate dev-only verification branches.
- Runtime authority remains single-user:
  - authenticated operator tokens still act on one shared ptydeck runtime authority surface
  - no tenant partitioning or per-user data separation was added
  - when external tokens do not carry a tenant-style claim, the normalized runtime principal falls back to `tenantId: "default"` only as internal metadata compatibility, not as a multi-tenant boundary

## SSH Trust and Launch Baseline

- Persisted SSH trust entries remain the authority for host-key admission.
- Persisted SSH trust entries are now normalized to canonical padded base64 host-key blobs instead of the earlier unpadded form.
- `backend/src/runtime.js` now resolves the trusted host-key types for the selected SSH target and passes them into the session-launch seam.
- `backend/src/runtime.js` now also resolves the managed `ssh_known_hosts` path to an absolute filesystem path before handing it to the session-launch seam.
- `backend/src/session-launch-spec.js` now renders `-o HostKeyAlgorithms=...` whenever trusted host-key types are known for the target host/port.
- `backend/src/session-launch-spec.js` now always receives an absolute `-o UserKnownHostsFile=...` path, so the spawned `ssh` client no longer resolves the managed trust file relative to the session spawn cwd.
- This prevents OpenSSH from preferring an untrusted host-key algorithm, such as `ssh-ed25519`, over a different already-trusted key type, such as `ssh-rsa`, under strict host-key checking.
- This also closes the live dev/runtime bug where the backend trust store and rendered `backend/data/ssh_known_hosts` file were correct, but OpenSSH still failed strict host-key checking because a relative `data/ssh_known_hosts` path was being resolved in the wrong working directory.

## Session Manager Remote Runtime Baseline

`v0.4.0-H168 / QLT-273` extracted the SSH reconnect/availability state machine out of the `SessionManager` monolith into one direct helper seam without changing the shipped restart/reconnect contract.

Current contract:

- `backend/src/session-manager-remote-runtime.js` owns:
  - remote reconnect policy normalization
  - initial `remoteRuntime` metadata shaping for SSH sessions
  - degraded/offline reconnect scheduling decisions
  - reconnect-attempt state mutation
  - connected recovery state shaping
  - degraded-versus-offline operator error details
- `backend/src/session-manager.js` remains the orchestration authority for timers, PTY reattachment, and lifecycle events, but now delegates SSH remote-runtime state shaping into that helper seam instead of mutating all reconnect metadata inline.
- Existing integrated reconnect behavior remains unchanged:
  - unexpected SSH transport exits first degrade when bounded retries remain
  - reconnect attempts fail closed to offline once retries are exhausted or disabled
  - operator write/resize/signal helpers still distinguish degraded versus offline messaging through the same `409` contract
- Direct regression coverage for the extracted seam now lives in `backend/test/session-manager-remote-runtime.test.js`, while the retained orchestration contract stays covered through `backend/test/session-manager.test.js` and `backend/test/runtime.integration.test.js`.
- This also closes the follow-up live bug where OpenSSH was reading the managed file but rejected the rendered trusted RSA line with `parse error in hostkeys file` because the persisted host-key blob had been normalized to unpadded base64 instead of the canonical padded wire form.
- The command plane now exposes one-shot SSH launches through `/ssh <target>`, with optional `-l` / `--user`, `-p` / `--port`, `-i` / `--key`, `--password`, `--keyboard-interactive`, `--deck`, `--cwd`, and `--command` options.
- Saved-profile SSH launches and one-shot `/ssh ...` launches both reuse the same frontend trust/secret gates in the connection-profile runtime seam instead of maintaining separate SSH launch contracts.
- Secret-backed SSH launches now request their runtime secret only through the shared masked action dialog:
  - `frontend/src/public/ui/action-dialog-controller.js` now exposes `requestSecret(...)` with password-type input and no browser-prompt fallback for secrets.
  - `frontend/src/public/connection-profile-runtime-controller.js` now treats that dialog as the sole runtime-secret authority seam for saved-profile and one-shot `/ssh --password` / `/ssh --keyboard-interactive` launches.
  - The old hidden `Connections` runtime-secret field is no longer part of the operator-visible or launch-authoritative product path, and `frontend/src/public/connection-profile-runtime-actions.js` no longer preserves hidden inline secret state across `Save and Launch`.
- The command plane now also exposes target-based SSH host-key lifecycle management through `/ssh hostkey ...`:
  - `/ssh hostkey list [target]`
  - `/ssh hostkey probe <target>`
  - `/ssh hostkey trust <target> [keyType|fingerprint]`
  - `/ssh hostkey delete <target> [keyType|fingerprint]`
- When a one-shot `/ssh ...` launch hits a target with no trusted host key yet, the frontend now auto-probes the host keys, keeps the attempted SSH launch in the `Connections` draft for UI continuity, and fails with command-plane recovery guidance that points directly at `/ssh hostkey probe ...`, `/ssh hostkey trust ...`, and `/ssh hostkey list ...`.
- The `Connections` SSH trust section is now a surfaced part of the normal SSH draft flow instead of an advanced-only disclosure:
  - first-connect guidance is shown inline as soon as an SSH host/port is present
  - fetched and trusted keys stay visible side by side with the selected fingerprint/public-key preview
  - when a fetched key conflicts with an existing trusted key of the same type, the UI now renders explicit trusted-versus-fetched fingerprint comparison and a guided `Replace Trusted Key` action
  - the replace flow deletes the old trust entry only long enough to create the new one and restores the previous trust entry automatically if replacement creation fails
- README, the workspace-library manual, generated command help, and the generated handbook/reference artifacts are now aligned with the shipped `/ssh ...` contract, including the new `--deck`, `--cwd`, and `--command` flags plus the command-plane host-key lifecycle and surfaced rotation workflow.

## Multiline Shell Send Baseline

- Multiline terminal sends no longer assume that every session should receive internal `LF` separators with only the final terminator varying.
- `frontend/src/public/terminal-stream.js` now supports one session-aware multiline transport distinction:
  - `preserve-lf` for coding-agent and unknown-family sessions, keeping the previous payload shape
  - `configured` for shell-family sessions, rewriting internal multiline separators to the session's configured send terminator before the final submit is appended or delayed
- The shell-family `configured` transport mode is now used by:
  - `frontend/src/public/command-composer-runtime-controller.js` for normal composer `Send`
  - `frontend/src/public/command-executor-custom-handlers.js` for rendered custom-command dispatch
  - `frontend/src/public/session-quick-send-runtime-controller.js` for quick-send favorites
- The practical product intent is:
  - shell sessions should receive multiline programmatic sends in a form closer to repeated terminal submit semantics
  - coding-agent sessions such as Codex should keep their existing multiline `LF` behavior unless a future explicit product decision widens that contract

## Messaging Files Intentionally Kept

The retained messaging-adapter framework is:

- `backend/src/terminal-messaging-core.js`
  - transport-neutral descriptor factories for `DeliveryAdapter` and `MessageIntent` only
- `backend/src/delivery-adapter-utils.js`
  - shared transport-neutral shaping helpers
- `backend/src/messaging-custom-command-utils.js`
  - backend-local custom-command parsing, rendering, ordering, and shell-payload normalization helpers used by the transport-only transport/framework files so the backend no longer imports frontend helper modules
- `backend/src/telegram-adapter.js`
  - Telegram transport adapter with topic provisioning, inbound polling, command publication, and explicit delivery handling
- `backend/src/discord-adapter.js`
  - Discord reference transport adapter for explicit `MessageIntent` delivery
- `backend/src/telegram-command-surface.js`
  - canonical Telegram command publication and parsing surface
- `backend/src/messaging-runtime.js`
  - transport-only runtime facade over those adapters

## Messaging Files Intentionally Removed From Live Product Behavior

The following stream-to-message implementation layers were removed from the repo because they were no longer considered a clean or trustworthy live basis:

- `backend/src/app-semantic-adapters.js`
- `backend/src/codex-outbound-evaluator.js`
- `backend/src/coding-agent-runtime-classifier.js`
- `backend/src/legacy-codex-allowlist-bridge.js`
- `backend/src/terminal-projection.js`
- the related replay/experiment scripts and tests that depended on those modules

## Operational Messaging Contract

Current live messaging behavior is intentionally narrow and explicit:

- Telegram inbound is still supported when configured.
- Published Telegram custom commands still resolve through the existing ptydeck custom-command/runtime path.
- Plain Telegram text still maps into the normal backend session-input path for a mapped session.
- Telegram topic provisioning for `topicMode: "deck-session"` still works and remains persisted.
- The adapters can still deliver explicit `MessageIntent` objects when another runtime seam constructs them deliberately.
- There is no automatic terminal-output mirroring or automatic terminal-output summarization in the live product path.
- The retained adapter/runtime layer no longer carries semantic allowlists, shadow-mode remnants, or projection-era descriptor requirements.
- The retained transport runtime no longer applies app-derived routing profiles when matching targets.

## Delivery and Status Expectations

When messaging is configured, `/health` and `/ready` now describe a transport-only runtime:

- `messaging.mode = "transport_only"`
- `messaging.boundaryContracts = ["DeliveryAdapter", "MessageIntent"]`
- adapter summaries remain visible under `messaging.adapters`
- adapter inbound/target traces remain visible
- transport metrics remain available through `/metrics`

Older health/status fields related to semantic primary mode, projection shadow mode, restart resend ledgers, or stream-to-message cutover are no longer part of the current product truth.

## Documentation Contract

The source-of-truth documents now mean:

- `TODO.md`
  - active open implementation tasks only
- `ROADMAP.md`
  - active or queued execution order only
- `CHANGELOG.md`
  - completed and validated work only
- `TODO-OUTLOOK.md`
  - deferred future work, including the eventual third messaging attempt
- `CODEX_CONTEXT.md`
  - persistent architecture and governance context only
- `DEPLOYMENT.md`
  - operational runbook for the currently shipped system

Large stack-replacement evaluations are not part of the current or deferred project outlook. Future work should extend the existing runtime shape in place unless `SAS` explicitly reopens that direction.

## Session Quick Send Favorites Current Contract

`v0.4.0-H161` introduced the hover-local operator UX for per-session quick-send favorites on 2026-05-01. `v0.4.0-H164` then replaced the temporary browser-local authority with the intended backend-authoritative session model on 2026-05-03.

Current contract:

- The feature tracks custom-command usage per terminal session, keyed by the backend session id plus the existing custom-command `lookupKey`.
- Ranking remains highest total send count first, with recency only as the deterministic tie-breaker.
- The visible UI target is a subtle session-card hover surface, not a new persistent control pane or settings panel.
- The hover surface should still read as an intentional feature, not as an unlabeled raw button tray:
  - render a compact heading such as `Send to Session`
  - show target/session context inside the overlay itself
  - size the overlay from its actual content instead of forcing a fixed wide panel
- The hover surface must remain directly clickable after it appears:
  - reveal from the broader session-toolbar hover/focus surface, not only from a tiny right-side icon hotspot
  - keep a toolbar-to-overlay hover bridge so the pointer can move into the panel without dropping the hit area
  - keep the overlay in its own higher stacking context above the terminal viewport
  - keep the overlay visible on its own hover/focus state instead of tying clickability only to whole-card hover
- Each session card now exposes:
  - up to five direct custom-command quick actions
  - one `Send Clipboard` action
- `Send Clipboard` reuses the existing frontend clipboard and programmatic paste/send seams and fails closed when:
  - the browser clipboard cannot be read
  - the session is exited or unrestored
  - the runtime is in read-only mode
- Custom-command usage is recorded both from direct quick-send clicks and from normal slash-command custom-command execution, but only when the send goes through the existing authoritative `POST /api/v1/sessions/{sessionId}/input` path with `customCommandUsage.lookupKey`.
- The backend persists the resulting `quickSendUsage` array in normal session state, restores it across runtime restarts, and exposes it through the normal session REST/WS contract for authenticated controllers.
- Read-only share spectators must not receive quick-send ranking data; spectator-facing session payloads now sanitize `quickSendUsage` to `[]`.
- Browser-local quick-send persistence has been removed:
  - no `localStorage` authority
  - no startup-backup quick-send snapshot source
  - no origin-local quick-send divergence between domain-first and IP-first opens
- The delivered implementation reuses these existing seams:
  - `frontend/src/public/send-history-runtime-controller.js`
  - `frontend/src/public/command-discovery-ranking.js`
  - `frontend/src/public/ui/session-card-factory-controller.js`
  - `frontend/src/public/ui/session-card-interactions-controller.js`
  - `frontend/src/public/command-executor.js`
  - `frontend/src/public/terminal-stream.js`
  - `frontend/src/public/clipboard-runtime-controller.js`

## Repo-Wide Quality Review Follow-Up (`v0.4.0-H162`)

On 2026-05-02, the fresh repo-wide follow-up wave `H162` was fully completed and closed.

Validated top-line coverage on the `H162` closeout tree:

- root tooling: `92.77%` line / `76.81%` branch
- backend: `95.03%` line / `88.49%` branch
- frontend: `96.84%` line / `89.29%` branch

Delivered in `H162`:

- `QLT-255` extracted accepted WebSocket connection lifecycle handling from `backend/src/runtime.js` into `backend/src/runtime-ws-connection.js` and closed that seam with direct deterministic regressions.
- `QLT-256` hardened `backend/src/session-manager.js` restart/replay/persistence/error-path coverage with explicit lifecycle regressions.
- `QLT-257` extracted custom-command send/selection dispatch from `frontend/src/public/command-executor.js` into `frontend/src/public/command-executor-custom-handlers.js` and closed that seam with direct deterministic regressions.
- `QLT-258` extracted browser-local quick-send usage persistence/ranking helpers into `frontend/src/public/session-quick-send-usage.js`, then hardened the remaining `store`, quick-send, and session-terminal seams with direct regression coverage.
- `QLT-259` hardened the retained operator layout/profile seams with direct split-layout and connection-profile regressions without widening the shipped UI/runtime contract.

The validated `H162` closeout hotspot snapshot is:

- `backend/src/runtime-ws-connection.js`: `100.00%` line / `74.29%` branch
- `backend/src/runtime.js`: `80.30%` line / `71.60%` branch
- `backend/src/session-manager.js`: `96.12%` line / `78.16%` branch
- `frontend/src/public/command-executor-custom-handlers.js`: `98.41%` line / `56.25%` branch
- `frontend/src/public/command-executor.js`: `86.45%` line / `75.45%` branch
- `frontend/src/public/store.js`: `93.36%` line / `80.60%` branch
- `frontend/src/public/session-quick-send-runtime-controller.js`: `91.09%` line / `80.63%` branch
- `frontend/src/public/session-quick-send-usage.js`: `96.35%` line / `79.49%` branch
- `frontend/src/public/ui/session-terminal-runtime-controller.js`: `89.32%` line / `81.91%` branch
- `frontend/src/public/split-layout-runtime-controller.js`: `91.62%` line / `77.64%` branch
- `frontend/src/public/connection-profile-runtime-controller.js`: `93.55%` line / `75.46%` branch

`H162` conclusions:

- The root lane remains above threshold, and the retained low-coverage root diagnostics are still intentionally unpromoted because they are not live product/runtime authority paths.
- The backend quality risk remains concentrated in the retained runtime monolith, but the accepted WebSocket seam and session-manager lifecycle cluster now have direct deterministic regression coverage.
- The frontend command, quick-send, runtime-state, terminal, split-layout, and connection-profile surfaces now all have tighter direct coverage seams than the start of the wave.
- `frontend/src/public/command-executor.js` and `frontend/src/public/app-runtime-composition-controller.js` remain large authority surfaces, but no further follow-up was promoted after `H162`.
- Transport-only messaging remains intentionally unpromoted; the third messaging attempt is still deferred behind `MSG-201` through `MSG-205` in `TODO-OUTLOOK.md`.

## Repo-Wide Quality Review Follow-Up (`v0.4.0-H163` completed)

On 2026-05-02, a fresh repo-wide review was rerun after the session quick-send overlay UX refinement so the next quality wave was based on the current tree instead of only on the earlier `H162` closeout snapshot. On 2026-05-03, the last promoted backend messaging slice (`QLT-261`) was completed and `H163` was fully closed.

Validated top-line coverage on the `H163` closeout tree:

- root tooling: `92.82%` line / `77.09%` branch
- backend: `95.35%` line / `89.17%` branch
- frontend: `96.93%` line / `89.65%` branch

Most relevant hotspots that were promoted into `TODO.md` / `ROADMAP.md` for this wave:

- `backend/src/runtime.js`: `6444` lines, `80.49%` line / `71.72%` branch
- `backend/src/ssh-host-key-probe.js`: `247` lines, `89.88%` line / `89.01%` branch
- `backend/src/telegram-adapter.js`: `1423` lines, `91.22%` line / `79.45%` branch
- `backend/src/messaging-runtime.js`: `1030` lines, `91.75%` line / `80.00%` branch
- `backend/src/discord-adapter.js`: `404` lines, `92.08%` line / `54.90%` branch

`QLT-260` is now complete. `backend/src/runtime.js` delegates spectator/session visibility, filtered snapshot/event shaping, and read-only quick-send sanitization into the new `backend/src/runtime-session-authority.js` seam, which validates at `93.62%` line / `87.23%` branch coverage under direct tests in `backend/test/runtime-session-authority.test.js`.

`QLT-264` is now complete. The slash-command product contract is now aligned across executor behavior, declarative schema, generated reference/help, and handbook examples:

- `/settings apply <json>` and `/custom list` are now first-class schema/docs/help entries instead of executor-only behavior.
- The shipped bare shorthands `/deck`, `/connection`, `/layout`, `/workspace`, `/broadcast`, and `/share` are now explicitly documented as accepted product syntax.
- Free-text session commands such as `/rename`, `/note`, `/settings`, and `/transfer` are now treated as active-session commands by default, with direct-route `@<sessionSelector> /...` documented as the supported non-switch targeting form.
- Commands that intentionally accept positional selectors, such as `/restart` and selector-taking replay forms, keep that positional grammar documented as part of the authoritative command surface.
- The handbook no longer advertises the invalid positional `/rename 4 build-agent` form; it now documents the supported active-session and direct-route variants.

`QLT-262` is now complete. Backend reliability coverage around SSH host-key probing and Linux foreground-process inspection is now materially tighter without widening the shipped runtime contract:

- `backend/test/runtime.ssh-host-key-probe.test.js` now covers invalid object payloads, invalid key-type rejection, canonical base64 validation failures, strict target rejection, same-key-type fingerprint tiebreak sorting, timeout flooring, and the retained ssh-keyscan unavailable/timeout/empty/error mapping paths.
- `backend/test/terminal-foreground-process.test.js` now covers non-string and underspecified `/proc/<pid>/stat` payloads, missing optional proc files, non-Linux fail-closed behavior, invalid terminal metadata, proc scan fallback failure, missing-parent ancestry truncation, and malformed peer-process skipping.
- The focused hotspot snapshot after the task is:
  - `backend/src/ssh-host-key-probe.js`: `100.00%` line / `95.83%` branch
  - `backend/src/terminal-foreground-process.js`: `97.42%` line / `89.80%` branch
- The remaining uncovered lines in `backend/src/terminal-foreground-process.js` are internal null-guard clauses that are not externally reachable through the current exported helper contract.

`QLT-263` is now complete. The frontend runtime monolith now delegates shared bootstrap/foundation ownership into the new `frontend/src/public/app-runtime-foundation.js` seam instead of keeping those support-service constructors inline:

- `frontend/src/public/app-runtime-foundation.js` now owns runtime-config resolution, debug/no-debug trace controller creation, API client construction including unauthorized auth-refresh delegation, clipboard/controller bootstrap, command-discovery usage-store setup, startup-backup setup, trusted-local client bootstrap, replay-export/file-transfer controller construction, store creation, and stream-interpretation engine creation.
- `frontend/src/public/app-runtime-composition-controller.js` now keeps the operator-facing runtime composition and the raw session-stream authority path, while delegating the shared foundation block through `createAppRuntimeFoundation(...)`.
- `frontend/test/app-runtime-foundation.test.js` now locks the seam down directly, and `frontend/test/layered-architecture-boundaries.test.js` now treats the extracted foundation as the explicit home of `createStore()` while preserving the stream-authority boundary assertions on the composition controller.
- `frontend/package.json` now includes `src/public/app-runtime-foundation.js` in the explicit frontend `build` / `lint` `node --check` file lists so the extracted seam stays inside the deterministic syntax gate.

`QLT-265` is now complete. Retained terminal, quick-send, and workflow operator-interaction coverage is materially tighter without widening the shipped frontend runtime contract:

- `frontend/test/terminal-stream.test.js` now locks down escaped-quote preservation with trailing backslashes plus the no-idle ANSI-stripping pending-line path.
- `frontend/test/session-terminal-runtime-controller.test.js` now locks down duplicate clipboard-event suppression, the immediate middle-click follow-up guard when mouse forwarding is enabled, and focus-intent listener disposal during clipboard-binding cleanup.
- `frontend/test/slash-workflow-runtime-controller.test.js` now locks down `/run` header stripping in block mode, idle dispose behavior without redundant render requests, action-only workflows without a bound session, and fail-closed session-control actions.
- `frontend/test/session-quick-send-runtime-controller.test.js` now locks down stale hover-child pruning, duplicate session-scope label disambiguation, hidden empty/missing targets, blocked write targets, and explicit missing-clipboard reporting.
- The focused hotspot snapshot after the task is:
  - `frontend/src/public/terminal-stream.js`: `94.72%` line / `89.62%` branch
  - `frontend/src/public/ui/session-terminal-runtime-controller.js`: `90.66%` line / `83.57%` branch
  - `frontend/src/public/slash-workflow-runtime-controller.js`: `91.26%` line / `80.00%` branch
  - `frontend/src/public/session-quick-send-runtime-controller.js`: `93.84%` line / `84.09%` branch

Remaining promoted `H163` tasks:

- none; `H163` is fully closed.

`QLT-261` is now complete. The shipped transport-only messaging baseline has materially tighter direct regression coverage without widening the product surface:

- `backend/test/delivery-adapter-utils.test.js` now covers fallback session labels plus degenerate truncation and metadata fallback branches.
- `backend/test/terminal-messaging-core.test.js` now covers missing descriptor identities, malformed optional containers, and default intent-field fallback behavior.
- `backend/test/telegram-command-surface.test.js` now covers scoped template descriptions, digit-prefixed names, normalization trimming, and description truncation.
- `backend/test/discord-adapter.test.js` now covers fetch prerequisites, webhook normalization variants, status-only API fallbacks, and fail-closed disabled/invalid-intent/suppressed/unmapped branches.
- `backend/test/messaging-runtime.test.js` now covers empty payloads, invalid Discord targets, attention creation helpers, and fail-closed runtime behavior when no adapter mapping is configured.
- `backend/test/telegram-adapter.test.js` now covers optional payload normalization, default polling semantics, double-slash literal input routing, and ignored unsupported callback payloads.
- The focused hotspot snapshot after the task is:
  - `backend/src/delivery-adapter-utils.js`: `98.51%` line / `78.57%` branch
  - `backend/src/terminal-messaging-core.js`: `98.17%` line / `97.67%` branch
  - `backend/src/telegram-command-surface.js`: `93.03%` line / `84.00%` branch
  - `backend/src/discord-adapter.js`: `96.04%` line / `70.18%` branch
  - `backend/src/messaging-runtime.js`: `92.14%` line / `80.69%` branch
  - `backend/src/telegram-adapter.js`: `91.22%` line / `82.97%` branch

Not promoted from the fresh review:

- `scripts/analyze-pty-write-eintr.mjs` and `scripts/analyze-startup-timeline.mjs` remain intentionally unpromoted because they are retained diagnostics, not live product/runtime authority paths.
- `scripts/lib/coverage-report.mjs` remains above the current root threshold and was not promoted into a near-term wave.
- `frontend/src/public/app.js` remains intentionally unpromoted despite low function coverage because it is still the thin bootstrap-only entrypoint, while the real runtime authority remains in `frontend/src/public/app-runtime-composition-controller.js`.
- No third-attempt messaging semantics were promoted. `H163` only targets the currently shipped transport-only adapter baseline, while `MSG-201` through `MSG-205` in `TODO-OUTLOOK.md` remain the explicit gate for any future automatic outbound rebuild.

## Repo-Wide Quality Review Follow-Up (`v0.4.0-H167` completed)

On 2026-05-03, a fresh repo-wide quality and coverage review was rerun after the `H166` SSH operator-experience closeout so the next wave was based on the current tree instead of the older `H163` snapshot. Later the same day, `QLT-269` completed and fully closed `v0.4.0-H167`.

Validated top-line coverage on the review tree:

- root tooling: `92.82%` line / `77.09%` branch
- backend: `95.33%` line / `89.15%` branch
- frontend: `96.83%` line / `89.59%` branch

Relevant hotspots promoted into `TODO.md` / `ROADMAP.md`:

- `backend/src/runtime.js`: `6462` lines, `80.28%` line / `71.51%` branch
- `backend/src/session-manager.js`: `2055` lines, `96.16%` line / `78.28%` branch
- `frontend/src/public/app-runtime-composition-controller.js`: `1873` lines, `88.41%` line / `70.00%` branch
- `frontend/src/public/command-executor.js`: `1834` lines, `86.59%` line / `76.06%` branch
- `frontend/src/public/connection-profile-runtime-controller.js`: `2261` lines, `91.64%` line / `76.52%` branch
- `frontend/src/public/store.js`: `1193` lines, `93.38%` line / `80.65%` branch
- `frontend/src/public/ui/session-terminal-runtime-controller.js`: `824` lines, `90.66%` line / `83.57%` branch

Promoted `H167` tasks:

- `QLT-266` Owner `BE`: extract the next HTTP/WS/session-authority seam from `backend/src/runtime.js` and close it with direct deterministic regressions.
- `QLT-267` Owner `BE`: harden `backend/src/session-manager.js` restart/reconnect/persistence/error-path coverage and isolate one remaining lifecycle helper seam.
- `QLT-268` Owner `FE`: extract the next bootstrap/handoff/runtime-composition seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-269` Owner `FE`: extract the next command-dispatch seam from `frontend/src/public/command-executor.js` and add direct deterministic regressions for the extracted operator path.
- `QLT-270` Owner `FE`: isolate SSH launch/trust operator lifecycle branches from `frontend/src/public/connection-profile-runtime-controller.js` and close the remaining branch gaps with direct regressions.
- `QLT-271` Owner `FE`: harden shared runtime-state and terminal-interaction coverage across `frontend/src/public/store.js`, `frontend/src/public/session-runtime-controller.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js`.

Delivered `H167` slices on 2026-05-03:

- `QLT-266` is complete. `backend/src/runtime.js` now delegates the remaining session REST seam into `backend/src/runtime-session-dispatch.js`, reducing the runtime monolith from `6462` to `6136` lines without widening the REST contract. Direct deterministic seam coverage now lives in `backend/test/runtime-session-dispatch.test.js`, and the extracted module validates at `100.00%` line / `99.07%` branch coverage.
- `QLT-267` is complete. `backend/src/session-manager.js` now delegates restart payload shaping into `backend/src/session-manager-lifecycle.js`, reducing the manager from `2055` to `2037` lines. Direct lifecycle coverage now lives in `backend/test/session-manager-lifecycle.test.js`, and the extracted helper validates at `100.00%` line / `95.00%` branch coverage. `backend/test/session-manager.test.js` now also locks down the disabled-reconnect fail-closed branch plus degraded-versus-offline reconnect-unavailable errors.
- The validated backend hotspot snapshot after those two slices is `backend/src/runtime-session-dispatch.js` at `100.00%` line / `99.07%` branch, `backend/src/session-manager-lifecycle.js` at `100.00%` line / `95.00%` branch, `backend/src/session-manager.js` at `96.12%` line / `78.79%` branch, and the reduced `backend/src/runtime.js` at `79.45%` line / `69.97%` branch. Backend top-line coverage on the active tree is now `95.42%` line / `89.33%` branch.
- `QLT-268` is complete. `frontend/src/public/app-runtime-composition-controller.js` now delegates trusted-local handoff/layout composition into `frontend/src/public/app-runtime-trusted-local-composition.js`, reducing the FE runtime-composition monolith from `1873` to `1863` lines while preserving the existing trusted-local runtime contract. Direct deterministic seam coverage now lives in `frontend/test/app-runtime-trusted-local-composition.test.js`, and the extracted module validates at `100.00%` line / `73.08%` branch coverage. The remaining `frontend/src/public/app-runtime-composition-controller.js` hotspot stays at `88.89%` line / `70.00%` branch coverage on the active tree.
- `QLT-271` is complete. Shared runtime-state and terminal-interaction coverage is now tighter across `frontend/test/store.test.js`, `frontend/test/session-runtime-controller.test.js`, and `frontend/test/session-terminal-runtime-controller.test.js`. The updated hotspot snapshot is `frontend/src/public/session-runtime-controller.js` at `97.51%` line / `88.30%` branch, `frontend/src/public/store.js` at `93.38%` line / `80.85%` branch, and `frontend/src/public/ui/session-terminal-runtime-controller.js` at `90.66%` line / `83.57%` branch. Frontend top-line coverage on the active tree is now `96.86%` line / `89.64%` branch.
- `QLT-270` is complete. `frontend/src/public/connection-profile-runtime-controller.js` now delegates SSH trust and launch lifecycle authority into `frontend/src/public/connection-profile-ssh-lifecycle.js`, reducing the controller hotspot from `2261` to `1695` lines without widening the shipped SSH operator contract. Direct deterministic seam coverage now lives in `frontend/test/connection-profile-ssh-lifecycle.test.js`, and the extracted module validates at `95.13%` line / `85.30%` branch coverage while the reduced controller now validates at `95.16%` line / `76.10%` branch coverage. Repo totals on the active tree are root tooling `92.82%` line / `77.09%` branch, backend `95.42%` line / `89.33%` branch, and frontend `96.95%` line / `89.68%` branch.
- `QLT-269` is complete. `frontend/src/public/command-executor.js` now delegates the retained `/settings` command family into `frontend/src/public/command-executor-settings-handlers.js`, reducing the executor hotspot from `1834` to `1236` lines without widening the shipped slash-command contract. Direct deterministic seam coverage now lives in `frontend/test/command-executor-settings-handlers.test.js`, and the extracted module validates at `96.61%` line / `76.74%` branch coverage while the reduced executor now validates at `86.57%` line / `75.78%` branch coverage. Repo totals on the `H167` closeout tree are root tooling `92.82%` line / `77.09%` branch, backend `95.43%` line / `89.34%` branch, and frontend `97.02%` line / `89.60%` branch.

Not promoted from the fresh review:

- `scripts/analyze-pty-write-eintr.mjs` (`77.17%` line / `43.48%` branch) and `scripts/analyze-startup-timeline.mjs` (`80.77%` line / `49.09%` branch) remain intentionally unpromoted because they are retained diagnostics, not live product/runtime authority paths.
- `scripts/lib/coverage-report.mjs` (`91.69%` line / `85.22%` branch) and `scripts/scaffold-ui-module.mjs` (`97.66%` line / `84.38%` branch) remain above the current root threshold and were not promoted into a near-term tooling wave.
- The transport-only messaging baseline was not promoted again in this pass because its critical coverage hotspots were already addressed in `H163`, while the deferred third-attempt messaging chain remains parked in `TODO-OUTLOOK.md`.

## Repo-Wide Quality Review Follow-Up (`v0.4.0-H168` completed)

On 2026-05-03, a fresh repo-wide quality and coverage review was rerun after the `H167` closeout so the next wave is based on the current tree instead of the just-closed hotspot snapshot alone.

Validated top-line coverage on the review tree:

- root tooling: `92.82%` line / `77.09%` branch
- backend: `95.42%` line / `89.35%` branch
- frontend: `97.02%` line / `89.59%` branch

Relevant hotspots promoted into `TODO.md` / `ROADMAP.md`:

- `backend/src/runtime.js`: `6136` lines, `79.50%` line / `70.08%` branch
- `backend/src/session-manager.js`: `2037` lines, `96.12%` line / `79.08%` branch
- `frontend/src/public/app-runtime-composition-controller.js`: `1863` lines, `88.89%` line / `70.00%` branch
- `frontend/src/public/command-executor.js`: `1236` lines, `86.57%` line / `75.78%` branch
- `frontend/src/public/connection-profile-runtime-controller.js`: `1695` lines, `95.16%` line / `76.10%` branch
- `frontend/src/public/store.js`: `1193` lines, `93.38%` line / `80.85%` branch
- `frontend/src/public/ui/session-terminal-runtime-controller.js`: `824` lines, `90.66%` line / `83.57%` branch

Promoted `H168` tasks:

- `QLT-273` Owner `BE`: isolate one more restart/reconnect/persistence lifecycle helper seam from `backend/src/session-manager.js` and harden the remaining manager branch gaps.
- `QLT-274` Owner `FE`: extract the next bootstrap/handoff/runtime-composition seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-275` Owner `FE`: extract the next operator command/discovery seam from `frontend/src/public/command-executor.js` and add direct deterministic regressions for the extracted path.
- `QLT-276` Owner `FE`: isolate the next SSH/profile/workspace operator seam from `frontend/src/public/connection-profile-runtime-controller.js` and close the remaining branch gaps with direct regressions.
- `QLT-277` Owner `FE`: harden shared runtime-state and terminal-interaction coverage across `frontend/src/public/store.js` and `frontend/src/public/ui/session-terminal-runtime-controller.js`.

`QLT-272` is now complete. `backend/src/runtime.js` delegates the remaining HTTP request entry seam into `backend/src/runtime-http-request-handler.js`, reducing the runtime monolith from `6136` to `5925` lines without widening the shipped REST contract. Direct deterministic seam coverage now lives in `backend/test/runtime-http-request-handler.test.js`, and the extracted module validates at `95.59%` line / `90.16%` branch coverage.

The final validated hotspot snapshot after `QLT-272` now reports the reduced `backend/src/runtime.js` at `78.77%` line / `69.45%` branch coverage, `backend/src/runtime-http-request-handler.js` at `95.59%` line / `90.16%` branch coverage, and final validated repo totals at root tooling `92.82%` line / `77.09%` branch, backend `95.40%` line / `89.28%` branch, and frontend `97.02%` line / `89.60%` branch on the active tree.

`QLT-274` is now complete. `frontend/src/public/app-runtime-composition-controller.js` delegates runtime bootstrap-controller assembly into `frontend/src/public/app-runtime-bootstrap-assembly.js` instead of keeping that startup/runtime wiring inline inside the composition monolith. The extraction reduces `frontend/src/public/app-runtime-composition-controller.js` from `1863` to `1833` lines without widening the shipped runtime contract, and `frontend/test/app-runtime-bootstrap-assembly.test.js` now locks down the delegated bootstrap wiring, trace/paste observation hook-up, quick-send usage handoff, clipboard/trusted-local wrappers, replay/share/file-transfer delegation, workflow lifecycle pass-through, and safe optional fallbacks directly.

The focused frontend hotspot snapshot after `QLT-274` now reports `frontend/src/public/app-runtime-bootstrap-assembly.js` at `97.52%` line / `96.08%` branch coverage and the reduced `frontend/src/public/app-runtime-composition-controller.js` at `89.20%` line / `70.00%` branch coverage. The full repo quality gate then remained green with final validated totals at root tooling `92.82%` line / `77.09%` branch, backend `95.40%` line / `89.35%` branch, and frontend `97.04%` line / `89.63%` branch on the active tree.

`QLT-275` is now complete. `frontend/src/public/command-executor.js` now delegates operator/discovery slash-command handling into `frontend/src/public/command-executor-operator-handlers.js` instead of keeping `/help`, `/run`, `/deck`, `/move`, `/size`, `/filter`, `/list`, and `/new` dispatch inline inside the executor monolith. The extraction reduces `frontend/src/public/command-executor.js` from `1236` to `1007` lines without widening the shipped slash-command contract, and `frontend/test/command-executor-operator-handlers.test.js` now locks down direct deterministic regressions for that extracted operator path while `frontend/test/command-executor.test.js` remains green against the retained integrated executor.

`QLT-276` is now complete. `frontend/src/public/connection-profile-runtime-controller.js` now delegates draft/profile/workspace operator state shaping into `frontend/src/public/connection-profile-draft-state.js` instead of keeping launch normalization, summary/report formatting, draft mode messaging, theme/deck selection shaping, and persisted draft construction inline inside the SSH/profile controller monolith. The extraction reduces `frontend/src/public/connection-profile-runtime-controller.js` from `1695` to `1113` lines without widening the shipped SSH/profile operator contract, and `frontend/test/connection-profile-draft-state.test.js` now locks down the extracted normalization, selection, summary/report, and draft persistence helpers directly while `frontend/test/connection-profile-runtime-controller.test.js` stays green against the retained integrated controller.

`QLT-277` is now complete. `frontend/src/public/store.js` now drops the dead `upsertCustomCommand(...)` wrapper branch instead of carrying redundant pre/post-dispatch equality checks inline, and direct regressions in `frontend/test/store.test.js` now lock down custom-command replacement deduplication, no-op filter normalization, invalid normalized submissions, and fail-closed filter publication behavior. `frontend/test/session-terminal-runtime-controller.test.js` now also hardens retained terminal-interaction branches for local auxclick suppression, mouse-forwarding context-menu arming, active scrollbar-drag cleanup during disposal, and incomplete `ResizeObserver` instances without widening the shipped terminal runtime contract.

The final validated `H168` closeout totals are root tooling `92.82%` line / `77.09%` branch, backend `95.41%` line / `89.34%` branch, and frontend `97.14%` line / `89.64%` branch. The closeout gate passed with focused frontend seam regressions, `npm --prefix frontend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.

One app-level test contract was also tightened during the closeout:

- quick-id swap propagation in `frontend/test/app.test.js` remains asynchronous and is now allowed up to `1000ms` before fail-closed timeout instead of assuming a tighter `200ms` window
- hidden-deck terminal scroll state may already be synchronized before the later deck-visibility recovery assertions run, so the test now only requires the hidden scroll area to remain at or behind appended output until the authoritative recovery assertions execute

Not promoted from the fresh review:

- `scripts/analyze-pty-write-eintr.mjs` (`77.17%` line / `43.48%` branch) and `scripts/analyze-startup-timeline.mjs` (`80.77%` line / `49.09%` branch) remain intentionally unpromoted because they are retained diagnostics, not live product/runtime authority paths.
- `scripts/lib/coverage-report.mjs` (`91.69%` line / `85.22%` branch) and `scripts/scaffold-ui-module.mjs` (`97.66%` line / `84.38%` branch) remain above the current root threshold and were not promoted into a near-term tooling wave.
- The transport-only messaging baseline was not promoted again in this pass because the current quality pressure is concentrated in the backend and frontend monolith seams above, while the third-attempt messaging chain remains deferred in `TODO-OUTLOOK.md`.

## Documentation Cleanup Baseline

The 2026-04-23 documentation cleanup established these current rules:

- De-scoped access-partitioning and large stack-replacement planning no longer belong in `TODO-OUTLOOK.md`.
- The removed stack-evaluation document is no longer part of the docs index or active repository knowledge.
- `DEPLOYMENT.md` is reserved for the current runbook and no longer carries closed feature-branch rollback or merge-readiness gates.
- Closed branch-acceptance sheets may remain only when clearly marked as historical evidence, not as active deployment gates.
- Older codebase review notes are retained as review input only; they do not create active work unless a concrete owned task is promoted into `TODO.md` or `TODO-OUTLOOK.md`.
- When retained review/design notes still mention older auth or messaging terminology, `CODEX_CONTEXT.md`, `DEPLOYMENT.md`, `TODO.md`, `ROADMAP.md`, and `CHANGELOG.md` override them as the current product truth.

## Messaging Reset Learnings

The key learnings from the removed live messaging attempt are now captured as markdown, not as active runtime behavior.

See:

- `docs/Messaging Reset and Third Attempt Notes.md`
- `docs/Codex Outbound Stream Processing Concept.md`
- `docs/Codex Restart Resend Analysis.md`
- `docs/Codex Latest Restart Delivery Review.md`
- `docs/Codex Message Boundary Analysis.md`
- `docs/Restart Streaming Analysis.md`

Those documents are historical analysis references. They are no longer implementation-status documents.

## Required Constraints For Any Third Attempt

Any future automatic outbound rebuild must start from these constraints:

1. exactly one live delivery pipeline
2. no concurrent `legacy` vs `projection` authority in production
3. no hidden allowlist exceptions inside the live path
4. no restart-recovery or semantic-gating logic without explicit contract tests
5. offline corpus/replay acceptance before any live automatic outbound reactivation
6. explicit `SAS` approval before reintroducing automatic outbound stream interpretation
7. keep the retained transport foundation free of semantic compatibility ballast while the third attempt is deferred

## Current Planning State

- `TODO.md`: there are no active promoted tasks.
- `ROADMAP.md`: there is no active or queued wave currently promoted.
- `QLT-295` through `QLT-301` are complete as the delivered slices inside `v0.4.0-H172`.
- `QLT-290`, `QLT-291`, `QLT-292`, `QLT-293`, and `QLT-294` remain complete as the delivered slices inside `v0.4.0-H171`.
- The future third messaging attempt is deferred to `TODO-OUTLOOK.md`.
- No active near-term automatic-outbound messaging rebuild is in progress.
- Future semantic stream-interpretation plugins are deferred until they are promoted as explicit tasks with acceptance tests.

## Repo-Wide Quality Review Follow-Up (`v0.4.0-H172` completed)

On 2026-05-05, the next quality-follow-up wave was promoted from the validated `H171` closeout tree and later fully closed on the same day.

Promotion baseline:

- root tooling: `92.82%` line / `77.09%` branch
- backend: `95.68%` line / `89.29%` branch
- frontend: `97.38%` line / `89.90%` branch

Promoted hotspots:

- `backend/src/runtime.js`: `5284` lines, `78.69%` line / `69.73%` branch
- `backend/src/session-manager.js`: `1783` lines, `96.13%` line / `80.65%` branch
- `frontend/src/public/app-runtime-composition-controller.js`: `1765` lines, `90.03%` line / `74.65%` branch
- `frontend/src/public/command-executor.js`: `645` lines, `94.73%` line / `83.77%` branch
- `frontend/src/public/connection-profile-runtime-controller.js`: `916` lines, `98.91%` line / `70.46%` branch
- `frontend/src/public/store.js`: `1186` lines, `97.22%` line / `85.97%` branch
- `frontend/src/public/ui/session-terminal-runtime-controller.js`: `824` lines, `92.35%` line / `85.08%` branch

Delivered so far inside `H172`:

- `QLT-295` Owner `BE` is complete. `backend/src/runtime.js` now delegates SSH trust entry listing, trusted host-key type resolution, host-key probing, trust upsert/delete, conflict reuse detection, and managed `ssh_known_hosts` rendering into `backend/src/runtime-ssh-trust.js`, reducing the runtime monolith from `5284` to `5163` lines while the new seam lands at `178` lines and keeps the shipped SSH trust/runtime contract unchanged.
- Direct deterministic seam coverage now lives in `backend/test/runtime-ssh-trust.test.js`, while retained resource and integration behavior stays covered through `backend/test/runtime-resource-dispatch.test.js` and `backend/test/runtime.integration.test.js`.
- The validated `QLT-295` hotspot snapshot on the active tree reports `backend/src/runtime-ssh-trust.js` at `97.75%` line / `90.91%` branch coverage, the reduced `backend/src/runtime.js` at `78.69%` line / `69.73%` branch coverage, and the retained `backend/src/session-manager.js` at `96.13%` line / `80.34%` branch coverage.
- Focused and repo-wide validation for `QLT-295` passed with `node --check backend/src/runtime-ssh-trust.js backend/src/runtime.js backend/test/runtime-ssh-trust.test.js`, `node --test backend/test/runtime-ssh-trust.test.js backend/test/runtime.integration.test.js backend/test/runtime-resource-dispatch.test.js`, `npm --prefix backend run test:coverage`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.
- `QLT-296` Owner `BE` is complete. `backend/src/runtime.js` now delegates share-link, connection-profile, layout-profile, and workspace-preset authority into `backend/src/runtime-library-authority.js`, reducing the runtime monolith from `5163` to `4815` lines while the new seam lands at `524` lines and keeps the shipped REST/runtime contract unchanged.
- Direct deterministic seam coverage now lives in `backend/test/runtime-library-authority.test.js`, while retained resource and integration behavior stays covered through `backend/test/runtime-resource-dispatch.test.js` and `backend/test/runtime.integration.test.js`.
- The validated `QLT-296` hotspot snapshot on the active tree reports `backend/src/runtime-library-authority.js` at `92.37%` line / `69.88%` branch coverage, the reduced `backend/src/runtime.js` at `78.63%` line / `70.21%` branch coverage, and the retained `backend/src/session-manager.js` at `96.13%` line / `80.34%` branch coverage.
- Focused and repo-wide validation for `QLT-296` passed with `node --check backend/src/runtime-library-authority.js backend/src/runtime.js backend/test/runtime-library-authority.test.js`, `node --test backend/test/runtime-library-authority.test.js backend/test/runtime-resource-dispatch.test.js backend/test/runtime.integration.test.js`, `npm --prefix backend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.
- `QLT-297` Owner `BE` is complete. `backend/src/session-manager.js` now delegates app-identity refresh, terminal-signal observation, output-heuristic arbitration, and foreground-process refresh scheduling into `backend/src/session-manager-app-identity-runtime.js`, reducing the session-manager monolith from `1783` to `1558` lines while the new seam lands at `329` lines and keeps the shipped local-session identity/runtime contract unchanged.
- Direct deterministic seam coverage now lives in `backend/test/session-manager-app-identity-runtime.test.js`, while retained lifecycle and integration behavior stays covered through `backend/test/session-manager.test.js` and the full repo quality gate.
- The validated `QLT-297` hotspot snapshot on the active tree reports `backend/src/session-manager-app-identity-runtime.js` at `94.53%` line / `76.36%` branch coverage and the reduced `backend/src/session-manager.js` at `96.21%` line / `82.06%` branch coverage.
- Focused and repo-wide validation for `QLT-297` passed with `node --check backend/src/session-manager-app-identity-runtime.js backend/src/session-manager.js backend/test/session-manager-app-identity-runtime.test.js`, `node --test backend/test/session-manager-app-identity-runtime.test.js backend/test/session-manager.test.js`, `npm --prefix backend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.
- `QLT-298` Owner `FE` is complete. `frontend/src/public/app-runtime-composition-controller.js` now delegates startup/workflow/palette/initialization composition into `frontend/src/public/app-runtime-startup-composition.js`, reducing the FE composition monolith from `1765` to `1711` lines while the new seam lands at `305` lines and keeps the shipped runtime startup contract unchanged.
- Direct deterministic seam coverage now lives in `frontend/test/app-runtime-startup-composition.test.js`, while retained architecture and integration behavior stays covered through `frontend/test/app-architecture-closeout.test.js` and `frontend/test/app-runtime-composition-controller.test.js`.
- The focused `QLT-298` hotspot snapshot on the active tree reports `frontend/src/public/app-runtime-startup-composition.js` at `94.43%` line / `81.58%` branch coverage and the reduced `frontend/src/public/app-runtime-composition-controller.js` at `94.45%` line / `81.08%` branch coverage. Validated active-tree coverage is root tooling `92.82%` line / `77.09%` branch, backend `95.81%` line / `88.95%` branch, and frontend `97.37%` line / `89.86%` branch.
- Focused and repo-wide validation for `QLT-298` passed with `node --check frontend/src/public/app-runtime-startup-composition.js frontend/src/public/app-runtime-composition-controller.js frontend/test/app-runtime-startup-composition.test.js frontend/test/app-architecture-closeout.test.js`, `node --test frontend/test/app-runtime-startup-composition.test.js frontend/test/app-architecture-closeout.test.js frontend/test/app-runtime-composition-controller.test.js`, `node --test --experimental-test-coverage frontend/test/app-runtime-startup-composition.test.js frontend/test/app-architecture-closeout.test.js frontend/test/app-runtime-composition-controller.test.js`, `npm --prefix frontend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.
- `QLT-299` Owner `FE` is complete. `frontend/src/public/command-executor.js` now delegates retained slash-command runtime/router helpers into `frontend/src/public/command-executor-runtime-router.js`, reducing the executor from `645` to `489` lines while the new seam lands at `186` lines and keeps the shipped slash-command contract unchanged.
- Direct deterministic seam coverage now lives in `frontend/test/command-executor-runtime-router.test.js`, while retained integrated behavior stays covered through `frontend/test/command-executor.test.js`, `frontend/test/command-executor-domain-handlers.test.js`, and `frontend/test/command-executor-settings-handlers.test.js`.
- The validated `QLT-299` hotspot snapshot on the closeout tree reports `frontend/src/public/command-executor-runtime-router.js` at `100.00%` line / `74.19%` branch coverage and the reduced `frontend/src/public/command-executor.js` at `97.34%` line / `94.51%` branch coverage.
- `QLT-300` Owner `FE` is complete. `frontend/test/connection-profile-runtime-controller.test.js` now locks down the pre-seeded blank-draft synchronization branch so early SSH-form input and render calls deterministically fail closed into the canonical blank local draft before any explicit draft flow is started. The retained controller hotspot on the closeout tree validates at `98.91%` line / `70.46%` branch coverage without widening the shipped SSH/profile operator contract.
- `QLT-301` Owner `FE` is complete. `frontend/test/store.test.js` now locks down correlation edge-case no-op reducer branches and state-preservation semantics, while `frontend/test/session-terminal-runtime-controller.test.js` now locks down the guarded Ctrl-C copy/cancel seam plus duplicate clipboard-event suppression and custom-key-handler restoration during disposal without widening the shipped runtime contract.
- The validated `QLT-301` hotspot snapshot on the closeout tree reports `frontend/src/public/store.js` at `97.30%` line / `87.96%` branch coverage and `frontend/src/public/ui/session-terminal-runtime-controller.js` at `92.35%` line / `85.08%` branch coverage.
- Full closeout validation for `QLT-299`, `QLT-300`, `QLT-301`, and `v0.4.0-H172` passed with focused FE seam regressions, `npm --prefix frontend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`, producing validated repo totals of root tooling `92.82%` line / `77.09%` branch, backend `95.81%` line / `88.93%` branch, and frontend `97.40%` line / `89.96%` branch on the closeout tree.

## Repo-Wide Quality Review Follow-Up (`v0.4.0-H171` completed)

On 2026-05-05, the next quality-follow-up wave was promoted from the validated `H170` closeout tree and is now active.

Promotion baseline:

- root tooling: `92.82%` line / `77.09%` branch
- backend: `95.58%` line / `89.35%` branch
- frontend: `97.35%` line / `89.77%` branch

Promoted hotspots:

- `backend/src/runtime.js`: `5484` lines, `78.98%` line / `69.35%` branch
- `backend/src/session-manager.js`: `1938` lines, `95.51%` line / `79.74%` branch
- `frontend/src/public/app-runtime-composition-controller.js`: `1808` lines, `89.88%` line / `70.00%` branch
- `frontend/src/public/command-executor.js`: `769` lines, `92.98%` line / `77.23%` branch
- `frontend/src/public/connection-profile-runtime-controller.js`: `1017` lines, `98.43%` line / `71.04%` branch

Delivered so far inside `H171`:

- `QLT-290` Owner `FE` is complete. `frontend/src/public/connection-profile-runtime-controller.js` now delegates saved-profile select rendering plus draft/SSH-trust UI state application into `frontend/src/public/connection-profile-ui-render.js`, reducing the controller from `1017` to `916` lines while the new seam lands at `164` lines and keeps the shipped SSH/profile operator contract unchanged.
- Direct deterministic seam coverage now lives in `frontend/test/connection-profile-ui-render.test.js`, while retained integrated behavior stays covered through `frontend/test/connection-profile-runtime-controller.test.js`.
- The validated `QLT-290` hotspot snapshot on the active tree reports `frontend/src/public/connection-profile-runtime-controller.js` at `98.91%` line / `70.46%` branch coverage and `frontend/src/public/connection-profile-ui-render.js` at `98.78%` line / `74.51%` branch coverage.
- Focused and repo-wide validation for `QLT-290` passed with `node --check frontend/src/public/connection-profile-ui-render.js frontend/src/public/connection-profile-runtime-controller.js frontend/test/connection-profile-ui-render.test.js frontend/test/connection-profile-runtime-controller.test.js`, `node --test frontend/test/connection-profile-ui-render.test.js frontend/test/connection-profile-runtime-controller.test.js`, `node --test --experimental-test-coverage frontend/test/connection-profile-ui-render.test.js frontend/test/connection-profile-runtime-controller.test.js`, `npm --prefix frontend run test:coverage`, `npm --prefix backend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.
- `QLT-291` Owner `FE` is complete. `frontend/src/public/app-runtime-composition-controller.js` now delegates the workspace/send-history/trusted-local/paste-observation/broadcast-input operator-support cluster into `frontend/src/public/app-runtime-operator-support-assembly.js`, reducing the composition controller from `1808` to `1765` lines while the new seam lands at `222` lines and keeps the shipped runtime/operator contract unchanged.
- Direct deterministic seam coverage now lives in `frontend/test/app-runtime-operator-support-assembly.test.js`, while retained architecture and integration behavior stays covered through `frontend/test/app-architecture-closeout.test.js` and `frontend/test/app-runtime-composition-controller.test.js`.
- The validated `QLT-291` hotspot snapshot on the active tree reports `frontend/src/public/app-runtime-composition-controller.js` at `93.65%` line / `80.13%` branch coverage and `frontend/src/public/app-runtime-operator-support-assembly.js` at `99.10%` line / `82.83%` branch coverage. Validated active-tree coverage is root tooling `92.82%` line / `77.09%` branch, backend `95.58%` line / `89.37%` branch, and frontend `97.38%` line / `89.87%` branch.
- Focused and repo-wide validation for `QLT-291` passed with `node --check frontend/src/public/app-runtime-operator-support-assembly.js frontend/src/public/app-runtime-composition-controller.js frontend/test/app-runtime-operator-support-assembly.test.js frontend/test/app-architecture-closeout.test.js`, `node --test frontend/test/app-runtime-operator-support-assembly.test.js frontend/test/app-architecture-closeout.test.js frontend/test/app-runtime-composition-controller.test.js`, `node --test --experimental-test-coverage frontend/test/app-runtime-operator-support-assembly.test.js frontend/test/app-architecture-closeout.test.js frontend/test/app-runtime-composition-controller.test.js`, `npm --prefix frontend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.
- `QLT-294` Owner `FE` is complete. `frontend/src/public/command-executor.js` now delegates retained replay/transfer command reporting into `frontend/src/public/command-executor-reporting-handlers.js`, reducing the executor from `769` to `645` lines while the new seam lands at `208` lines and keeps the shipped slash-command/reporting contract unchanged. The executor now also imports `formatConnectionProfileReport` directly from `frontend/src/public/connection-profile-draft-state.js` instead of duplicating that report formatter locally.
- Direct deterministic seam coverage now lives in `frontend/test/command-executor-reporting-handlers.test.js`, while retained integrated behavior stays covered through `frontend/test/command-executor.test.js` and the full repo quality gate.
- The validated `QLT-294` hotspot snapshot on the active tree reports `frontend/src/public/command-executor-reporting-handlers.js` at `96.63%` line / `83.33%` branch coverage and the reduced `frontend/src/public/command-executor.js` at `94.73%` line / `83.77%` branch coverage. Validated active-tree coverage is root tooling `92.82%` line / `77.09%` branch, backend `95.59%` line / `89.35%` branch, and frontend `97.38%` line / `89.89%` branch.
- Focused and repo-wide validation for `QLT-294` passed with `node --check frontend/src/public/command-executor-reporting-handlers.js frontend/src/public/command-executor.js frontend/test/command-executor-reporting-handlers.test.js frontend/test/command-executor.test.js`, `node --test frontend/test/command-executor-reporting-handlers.test.js frontend/test/command-executor.test.js`, `node --test --experimental-test-coverage frontend/test/command-executor-reporting-handlers.test.js frontend/test/command-executor.test.js`, `npm --prefix frontend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.
- `QLT-292` Owner `BE` is complete. `backend/src/runtime.js` now delegates deck assignment, default deck creation, quick-id token lifecycle, unrestored-session lookup, and session-control model shaping into `backend/src/runtime-session-state.js`, reducing the runtime monolith from `5484` to `5284` lines while the new seam lands at `274` lines and keeps the shipped runtime/session contract unchanged.
- Direct deterministic seam coverage now lives in `backend/test/runtime-session-state.test.js`, while retained integrated behavior stays covered through `backend/test/runtime.integration.test.js` and the full repo quality gate.
- The validated `QLT-292` hotspot snapshot on the active tree reports `backend/src/runtime-session-state.js` at `93.43%` line / `78.64%` branch coverage and the reduced `backend/src/runtime.js` at `78.79%` line / `69.72%` branch coverage. Validated active-tree coverage is root tooling `92.82%` line / `77.09%` branch, backend `95.63%` line / `89.47%` branch, and frontend `97.38%` line / `89.90%` branch.
- Focused and repo-wide validation for `QLT-292` passed with `node --check backend/src/runtime-session-state.js backend/src/runtime.js backend/test/runtime-session-state.test.js`, `node --test backend/test/runtime-session-state.test.js backend/test/runtime.integration.test.js`, `npm --prefix backend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.
- `QLT-293` Owner `BE` is complete. `backend/src/session-manager.js` now delegates SSH launch bundle assembly, reconnect scheduling/attempts, remote connectivity transitions, and PTY-exit lifecycle handling into `backend/src/session-manager-launch-runtime.js`, reducing the session-manager monolith from `1938` to `1783` lines while the new seam lands at `299` lines and keeps the shipped launch/reconnect contract unchanged.
- Direct deterministic seam coverage now lives in `backend/test/session-manager-launch-runtime.test.js`, while retained lifecycle and integration behavior stays covered through `backend/test/session-manager.test.js`, `backend/test/session-manager-remote-runtime.test.js`, and `backend/test/runtime.integration.test.js`.
- The validated `QLT-293` hotspot snapshot on the closeout tree reports `backend/src/session-manager-launch-runtime.js` at `96.66%` line / `52.94%` branch coverage and the reduced `backend/src/session-manager.js` at `96.13%` line / `80.65%` branch coverage. Validated closeout coverage is root tooling `92.82%` line / `77.09%` branch, backend `95.68%` line / `89.29%` branch, and frontend `97.38%` line / `89.90%` branch.
- Focused and repo-wide validation for `QLT-293` and the `H171` closeout passed with `node --check backend/src/session-manager-launch-runtime.js backend/src/session-manager.js backend/test/session-manager-launch-runtime.test.js`, `node --test backend/test/session-manager-launch-runtime.test.js backend/test/session-manager.test.js backend/test/session-manager-remote-runtime.test.js`, `node --test backend/test/runtime.integration.test.js backend/test/session-manager-launch-runtime.test.js backend/test/session-manager.test.js`, `npm --prefix backend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.

## Repo-Wide Quality Review Follow-Up (`v0.4.0-H169` completed)

On 2026-05-04, the next quality-follow-up wave was promoted directly from the validated `H168` closeout tree rather than from stale pre-closeout hotspot snapshots.

Validated top-line coverage on the promotion tree:

- root tooling: `92.82%` line / `77.09%` branch
- backend: `95.41%` line / `89.34%` branch
- frontend: `97.14%` line / `89.64%` branch

Relevant hotspots promoted into `TODO.md` / `ROADMAP.md`:

- `backend/src/runtime.js`: `5925` lines, `78.77%` line / `69.34%` branch
- `backend/src/session-manager.js`: `2018` lines, `95.39%` line / `78.98%` branch
- `frontend/src/public/app-runtime-composition-controller.js`: `1833` lines, `89.20%` line / `70.00%` branch
- `frontend/src/public/command-executor.js`: `1007` lines, `89.77%` line / `76.53%` branch
- `frontend/src/public/connection-profile-runtime-controller.js`: `1113` lines, `96.05%` line / `78.67%` branch
- `frontend/src/public/store.js`: `1186` lines, `94.44%` line / `82.51%` branch
- `frontend/src/public/ui/session-terminal-runtime-controller.js`: `824` lines, `91.87%` line / `83.62%` branch

Delivered backend slices inside `H169`:

- `QLT-278` Owner `BE` is complete. `backend/src/runtime.js` now delegates share/spectator request-access and runtime-metrics helper logic into `backend/src/runtime-access-policy.js` (`94` lines, `100.00%` line / `97.50%` branch) and `backend/src/runtime-metrics.js` (`43` lines, `100.00%` line / `100.00%` branch), reducing `backend/src/runtime.js` from `5925` to `5834` lines while the reduced monolith now validates at `78.56%` line / `68.86%` branch coverage on the focused backend coverage tree.
- `QLT-279` Owner `BE` is complete. `backend/src/session-manager.js` now delegates timer/reconnect/pending-launch cleanup into `backend/src/session-manager-cleanup.js` (`70` lines, `100.00%` line / `100.00%` branch), reducing `backend/src/session-manager.js` from `2018` to `1994` lines while the reduced manager now validates at `95.54%` line / `79.20%` branch coverage on the focused backend coverage tree.
- Focused backend validation for the delivered `H169` backend slices passed with `node --check backend/src/runtime.js backend/src/runtime-access-policy.js backend/src/runtime-metrics.js backend/src/session-manager.js backend/src/session-manager-cleanup.js`, `node --test backend/test/runtime-access-policy.test.js backend/test/runtime-metrics.test.js backend/test/runtime-http-helpers.test.js backend/test/runtime-ws-upgrade.test.js backend/test/runtime-session-authority.test.js backend/test/session-manager-cleanup.test.js backend/test/session-manager-remote-runtime.test.js backend/test/session-manager.test.js`, and `npm --prefix backend run test:coverage`, producing backend totals of `95.46%` line / `89.44%` branch on the active tree.

Delivered frontend slices inside `H169`:

- `QLT-280` Owner `FE` is complete. `frontend/src/public/app-runtime-composition-controller.js` now delegates runtime-event recovery wiring into `frontend/src/public/app-runtime-recovery-composition.js` (`112` lines), covering snapshot session replacement, origin-handoff auto-repair scheduling, and terminal-input error payload normalization directly. The extraction reduces `frontend/src/public/app-runtime-composition-controller.js` from `1833` to `1825` lines while keeping the shipped runtime contract unchanged.
- Direct deterministic coverage for the extracted seam now lives in `frontend/test/app-runtime-recovery-composition.test.js`, while `frontend/test/app-architecture-closeout.test.js` now locks down that runtime-event recovery is owned by the new delegated composition module instead of the composition monolith itself.
- Full-FE validation for the delivered `H169` frontend slice passed with `node --check frontend/src/public/app-runtime-recovery-composition.js frontend/src/public/app-runtime-composition-controller.js frontend/test/app-runtime-recovery-composition.test.js frontend/test/app-architecture-closeout.test.js`, `node --test frontend/test/app-runtime-recovery-composition.test.js frontend/test/app-architecture-closeout.test.js frontend/test/app-runtime-composition-controller.test.js`, `node --test frontend/test/app.test.js`, and `npm --prefix frontend run test:coverage`, producing frontend totals of `97.16%` line / `89.67%` branch on the active tree.
- During that closeout, `frontend/test/app.test.js` was also hardened to wait deterministically for `/size` feedback/payload publication and to clear autocomplete state through the real input path before asserting the non-slash `ArrowUp` contract, eliminating the observed coverage-only flakes without relaxing runtime behavior.
- `QLT-281` Owner `FE` is complete. `frontend/src/public/command-executor.js` now delegates retained custom-command admin and discovery routing into `frontend/src/public/command-executor-custom-admin-handlers.js` (`325` lines), covering `/custom list`, `/custom show`, `/custom preview`, `/custom remove`, and scoped custom-command definition persistence directly. The extraction reduces `frontend/src/public/command-executor.js` from `1007` to `769` lines while keeping the shipped slash-command contract unchanged.
- Direct deterministic coverage for that extracted seam now lives in `frontend/test/command-executor-custom-admin-handlers.test.js`, while the retained integrated command plane stays covered through `frontend/test/command-executor-custom-handlers.test.js` and `frontend/test/command-executor.test.js`.
- Full-FE validation for `QLT-281` passed with `node --check frontend/src/public/command-executor.js frontend/src/public/command-executor-custom-admin-handlers.js frontend/test/command-executor-custom-admin-handlers.test.js`, `node --test frontend/test/command-executor-custom-admin-handlers.test.js frontend/test/command-executor-custom-handlers.test.js frontend/test/command-executor.test.js`, `npm --prefix frontend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`, producing validated repo totals of root tooling `92.82%` line / `77.09%` branch, backend `95.47%` line / `89.43%` branch, and frontend `97.18%` line / `89.58%` branch on the active tree.
- `QLT-282` Owner `FE` is complete. `frontend/src/public/connection-profile-runtime-controller.js` now delegates computed draft and SSH trust presentation into `frontend/src/public/connection-profile-runtime-view-state.js` (`172` lines), covering trust-option fallbacks, preview selection, rotation review, and action gating directly. The extraction reduces `frontend/src/public/connection-profile-runtime-controller.js` from `1113` to `1039` lines while keeping the shipped SSH/profile operator contract unchanged.
- Direct deterministic coverage for that extracted seam now lives in `frontend/test/connection-profile-runtime-view-state.test.js`, while the retained controller integration stays covered through `frontend/test/connection-profile-runtime-controller.test.js`. The validated hotspot snapshot on the active tree reports `frontend/src/public/connection-profile-runtime-view-state.js` at `98.84%` line / `94.00%` branch coverage and the reduced `frontend/src/public/connection-profile-runtime-controller.js` at `95.96%` line / `72.95%` branch coverage.
- `QLT-283` Owner `FE` is complete. `frontend/test/store.test.js` now locks down bounded command-correlation history, no-op interpretation action handling, and artifact/notification trimming semantics, while `frontend/test/session-terminal-runtime-controller.test.js` now covers `dataTransfer` paste payloads, document-level scrollbar drag fallback when `window` listeners are unavailable, and Ctrl-C prompt-guard reset after rejected intent requests. The validated retained hotspot snapshot on the active tree reports `frontend/src/public/store.js` at `97.22%` line / `85.97%` branch coverage and `frontend/src/public/ui/session-terminal-runtime-controller.js` at `92.23%` line / `85.08%` branch coverage.
- Full closeout validation for `QLT-282`, `QLT-283`, and `v0.4.0-H169` passed with `node --check frontend/src/public/connection-profile-runtime-view-state.js frontend/src/public/connection-profile-runtime-controller.js frontend/test/connection-profile-runtime-view-state.test.js`, `node --test frontend/test/connection-profile-runtime-view-state.test.js frontend/test/connection-profile-runtime-controller.test.js`, `node --test frontend/test/store.test.js frontend/test/session-terminal-runtime-controller.test.js`, `npm --prefix frontend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`, producing validated repo totals of root tooling `92.82%` line / `77.09%` branch, backend `95.47%` line / `89.43%` branch, and frontend `97.23%` line / `89.59%` branch on the closeout tree.

Not promoted from the same tree:

- retained root diagnostics such as `scripts/analyze-pty-write-eintr.mjs` and `scripts/analyze-startup-timeline.mjs`, because they remain non-authoritative diagnostics rather than shipped runtime paths
- the transport-only messaging baseline, because the remaining quality pressure is now concentrated in the larger backend/runtime and frontend/runtime monoliths above while the third-attempt messaging chain stays deferred in `TODO-OUTLOOK.md`

Current planning state:

- `TODO.md`: there are no active promoted tasks.
- `ROADMAP.md`: there is no active or queued wave currently promoted.

## Repo-Wide Quality Review Follow-Up (`v0.4.0-H170` closed)

On 2026-05-05, the next quality-follow-up wave was promoted directly from a fresh rerun on the validated `H169` closeout tree rather than from stale pre-closeout hotspot snapshots, and the same-day follow-up then closed cleanly after the last retained frontend operator-state slice validated green.

Validated top-line coverage on the `H170` closeout tree:

- root tooling: `92.82%` line / `77.09%` branch
- backend: `95.58%` line / `89.35%` branch
- frontend: `97.35%` line / `89.77%` branch

Relevant hotspots promoted into `TODO.md` / `ROADMAP.md`:

- `backend/src/runtime.js`: `5484` lines, `78.98%` line / `69.35%` branch
- `backend/src/session-manager.js`: `1938` lines, `95.51%` line / `79.74%` branch
- `frontend/src/public/app-runtime-composition-controller.js`: `1808` lines, `89.88%` line / `70.00%` branch
- `frontend/src/public/command-executor.js`: `769` lines, `92.98%` line / `77.23%` branch
- `frontend/src/public/connection-profile-runtime-controller.js`: `1017` lines, `98.43%` line / `71.04%` branch
- `frontend/src/public/workspace-manager-runtime-controller.js`: `94.44%` line / `72.15%` branch
- `frontend/src/public/ui/session-terminal-runtime-controller.js`: `92.23%` line / `85.08%` branch

Completed inside `H170`:

- `QLT-289` Owner `FE` is complete. `frontend/test/workspace-manager-runtime-controller.test.js` now locks down missing optional-ref no-op handling plus connection-tab rerouting back to `connections`. `frontend/test/session-settings-state-controller.test.js` now covers legacy `draft.profile` theme resolution, theme fallback ref lookup, fail-closed helper branches, and distinct startup/theme dirty-state paths. `frontend/test/session-terminal-runtime-controller.test.js` now covers `ResizeObserver` callback-driven resize reruns plus ignored empty middle-click clipboard reads without widening the shipped terminal runtime contract.
- The validated retained hotspot snapshot after `QLT-289` now reports `frontend/src/public/workspace-manager-runtime-controller.js` at `100.00%` line / `94.85%` branch coverage, `frontend/src/public/ui/session-settings-state-controller.js` at `97.20%` line / `86.72%` branch coverage, and `frontend/src/public/ui/session-terminal-runtime-controller.js` at `92.35%` line / `85.08%` branch coverage. Full closeout validation for `QLT-289` and `v0.4.0-H170` passed with `node --check frontend/test/workspace-manager-runtime-controller.test.js frontend/test/session-settings-state-controller.test.js frontend/test/session-terminal-runtime-controller.test.js`, `node --test frontend/test/workspace-manager-runtime-controller.test.js frontend/test/session-settings-state-controller.test.js frontend/test/session-terminal-runtime-controller.test.js`, `node --test --experimental-test-coverage frontend/test/workspace-manager-runtime-controller.test.js frontend/test/session-settings-state-controller.test.js frontend/test/session-terminal-runtime-controller.test.js`, `npm --prefix frontend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`.

- `QLT-284` Owner `BE` is complete. `backend/src/runtime.js` now delegates session-control client/session authority into `backend/src/runtime-session-control-authority.js` (`445` lines) instead of keeping attachment lookup, session-control state shaping, operator access checks, trusted-local controller transfer/rename/forget helpers, scoped claimable-session resolution, and control-state broadcast/update orchestration inline inside the backend runtime monolith. The extraction reduces `backend/src/runtime.js` from `5834` to `5484` lines while keeping the shipped REST and WebSocket session-control contract unchanged.
- Direct deterministic coverage for the extracted seam now lives in `backend/test/runtime-session-control-authority.test.js`, while retained integrated control behavior stays covered through `backend/test/runtime-session-control-dispatch.test.js`, `backend/test/runtime-session-authority.test.js`, `backend/test/runtime.integration.test.js`, and the full repo quality gate. The validated hotspot snapshot on the active tree reports `backend/src/runtime-session-control-authority.js` at `86.74%` line / `73.48%` branch coverage and the reduced `backend/src/runtime.js` at `78.98%` line / `69.35%` branch coverage.
- `QLT-285` Owner `BE` is complete. `backend/src/session-manager.js` now delegates startup/post-start input lifecycle authority into `backend/src/session-manager-startup-runtime.js` (`154` lines) instead of keeping post-start input dispatch, delayed launch-input scheduling, pending-input arming, prompt-boundary observation, and startup cursor-query fallback handling inline inside the backend session-manager monolith. The extraction reduces `backend/src/session-manager.js` from `1994` to `1938` lines while keeping the shipped launch/reconnect runtime contract unchanged.
- Direct deterministic coverage for the extracted seam now lives in `backend/test/session-manager-startup-runtime.test.js`, while retained integrated lifecycle behavior stays covered through `backend/test/session-manager.test.js` and the full repo quality gate. The validated hotspot snapshot on the active tree reports `backend/src/session-manager-startup-runtime.js` at `99.35%` line / `98.48%` branch coverage and the reduced `backend/src/session-manager.js` at `95.51%` line / `79.74%` branch coverage.
- `QLT-286` Owner `FE` is complete. `frontend/src/public/app-runtime-composition-controller.js` now delegates session-control and quick-send runtime assembly into `frontend/src/public/app-runtime-session-access-assembly.js` (`217` lines) instead of keeping session-access wiring, canonical-origin handoff helpers, quick-send access guards, and command-feedback session targeting inline inside the FE composition monolith. The extraction reduces `frontend/src/public/app-runtime-composition-controller.js` from `1825` to `1808` lines while keeping the shipped runtime and trusted-local control contract unchanged.
- Direct deterministic coverage for the extracted seam now lives in `frontend/test/app-runtime-session-access-assembly.test.js`, while retained architecture and integration behavior stays covered through `frontend/test/app-architecture-closeout.test.js`, `frontend/test/app-runtime-composition-controller.test.js`, and the full repo quality gate. The validated hotspot snapshot on the active tree reports `frontend/src/public/app-runtime-session-access-assembly.js` at `97.70%` line / `82.05%` branch coverage and the reduced `frontend/src/public/app-runtime-composition-controller.js` at `89.88%` line / `70.00%` branch coverage.
- `QLT-287` Owner `FE` is complete. Retained operator command/router coverage is now materially tighter without widening the shipped slash-command contract. `frontend/test/command-executor-operator-handlers.test.js` now locks down no-active-deck and unavailable-API fail-closed branches, `/help unknown` fallback behavior, `/deck new|switch|delete` usage and rejection branches, `/move` selector/error/plural-summary flows, `/size` parser failure, `/filter` clear/error handling, empty `/list`, and default `/new` session creation. `frontend/test/command-executor-session-handlers.test.js` now covers active/direct target-resolution fallbacks, no-active-session close/restart guards, live close success, persisted quick-id swap success, `/prev` wraparound when the active session is missing from the deck-scoped list, active-session rename success, and plural restart success. `frontend/test/command-executor.test.js` now covers replay preview/copy/paste usage failures, `/transfer download` usage gating, replay-excerpt load failure, empty excerpt fail-closed feedback, and the retained synthesized replay preview/copy summary paths.
- The validated retained hotspot snapshot after `QLT-287` now reports `frontend/src/public/command-executor-operator-handlers.js` at `96.78%` line / `76.92%` branch coverage, `frontend/src/public/command-executor-session-handlers.js` at `95.67%` line / `75.69%` branch coverage, and the retained `frontend/src/public/command-executor.js` at `94.80%` line / `80.13%` branch coverage. Validated repo totals on the active tree are now root tooling `92.82%` line / `77.09%` branch, backend `95.56%` line / `89.35%` branch, and frontend `97.27%` line / `89.64%` branch.
- `QLT-288` Owner `FE` is complete. `frontend/src/public/connection-profile-runtime-controller.js` now delegates operator button/select/input event binding into `frontend/src/public/connection-profile-ui-bindings.js` (`139` lines) instead of keeping profile selection, draft synchronization, and SSH trust action wiring inline inside the controller monolith. The extraction reduces `frontend/src/public/connection-profile-runtime-controller.js` from `1039` to `1017` lines while keeping the shipped SSH/profile/workspace operator contract unchanged.
- Direct deterministic coverage for the extracted seam now lives in `frontend/test/connection-profile-ui-bindings.test.js`, while retained controller integration is tightened in `frontend/test/connection-profile-runtime-controller.test.js`, including fail-closed empty-profile resolution and ad hoc SSH secret-prompt context labeling for one-shot launches. The validated hotspot snapshot on the active tree reports `frontend/src/public/connection-profile-runtime-controller.js` at `98.43%` line / `71.04%` branch coverage and `frontend/src/public/connection-profile-ui-bindings.js` at `96.40%` line / `96.91%` branch coverage. Validated repo totals on the active tree are now root tooling `92.82%` line / `77.09%` branch, backend `95.58%` line / `89.35%` branch, and frontend `97.30%` line / `89.65%` branch.

Not promoted from the same tree:

- retained root diagnostics such as `scripts/analyze-pty-write-eintr.mjs` and `scripts/analyze-startup-timeline.mjs`, because they remain non-authoritative diagnostics rather than shipped runtime paths
- the transport-only messaging baseline, because the remaining quality pressure is still concentrated in the larger backend/runtime and frontend/runtime/operator monoliths above while the third-attempt messaging chain stays deferred in `TODO-OUTLOOK.md`

## Repository Quality Review (2026-04-29)

The 2026-04-29 review refreshed the repo-wide evidence instead of relying on the earlier `H156` baseline alone, and `QLT-234` through `QLT-243` closed the root-tooling plus backend runtime/reliability/transport plus frontend runtime-composition, utility/debug/search, workspace-preset, command-composer/engine, and parser/settings/theme slices from that first pass. A same-day follow-up pass against fresh coverage evidence now promotes `v0.4.0-H159` for the still-relevant monolith and operator-surface gaps that remain after the H158 closeout.

Current validated top-line coverage remains above threshold:

- root tooling: `92.77%` line / `76.81%` branch
- backend: `94.93%` line / `88.35%` branch
- frontend: `96.82%` line / `89.29%` branch

The fresh post-H158 review promoted only the still-relevant gaps into `TODO.md`:

- Root tooling:
  - The root lane remains stable at `92.77%` line / `76.81%` branch coverage after `QLT-234`.
  - The remaining lower-covered root files are still `scripts/analyze-pty-write-eintr.mjs` (`77.17%` line / `43.48%` branch) and `scripts/analyze-startup-timeline.mjs` (`80.77%` line / `49.09%` branch), but they were not promoted into `H159` because they are retained diagnostics rather than active product/runtime authority paths.
- Backend:
  - `QLT-244` is now complete as the first delivered slice of `v0.4.0-H159`. `backend/src/runtime.js` now delegates HTTP route matching and metrics-path normalization into `backend/src/runtime-route-table.js`, and the share/custom-command/deck/profile/preset/SSH-trust REST resource block now lives in `backend/src/runtime-resource-dispatch.js` instead of staying inline inside the monolith. Direct deterministic seam coverage now lives in `backend/test/runtime-route-table.test.js` and `backend/test/runtime-resource-dispatch.test.js`, while `backend/test/runtime.request-seams.test.js` still proves the retained live REST call path against the integrated runtime.
  - The validated `QLT-244` hotspot snapshot now reports `backend/src/runtime-route-table.js` at `97.51%` line / `98.36%` branch coverage and `backend/src/runtime-resource-dispatch.js` at `100.00%` line / `100.00%` branch coverage. The extracted paths remove roughly `680` lines of inline route/dispatch logic from `backend/src/runtime.js` without widening the shipped REST contract.
  - `QLT-245` is now complete as the second delivered slice of `v0.4.0-H159`. `backend/src/session-manager.js` now delegates local/SSH launch normalization, remote-auth/secret shaping, shell quoting, and PTY launch-spec construction into `backend/src/session-launch-spec.js`, which now validates at `99.35%` line / `95.90%` branch coverage under direct tests. `backend/test/session-launch-spec.test.js` covers the extracted local and SSH launch variants directly, while `backend/test/replay-excerpt.test.js` now closes the empty-slice and invalid-shell-block edge cases that lift `backend/src/replay-excerpt.js` to `95.21%` line / `86.27%` branch coverage. The reduced `backend/src/session-manager.js` now validates at `94.40%` line / `77.00%` branch coverage without re-inlining the extracted launch logic.
  - `QLT-250` is now complete as the first delivered slice of `v0.4.0-H160`. `backend/src/runtime.js` now delegates WebSocket upgrade admission into `backend/src/runtime-ws-upgrade.js` and the REST session-control route fan-out into `backend/src/runtime-session-control-dispatch.js` instead of keeping those startup/auth/admission/control branches inline inside one backend monolith. The extraction reduces `backend/src/runtime.js` from `6820` to `6665` lines without widening the shipped REST/WS contract, and `backend/package.json` now includes the new seam files plus the previously unlisted backend seam/helper files in the explicit backend `build` / `lint` `node --check` lists so the extracted modules stay in the deterministic syntax gate.
  - Direct deterministic seam coverage for `QLT-250` now lives in `backend/test/runtime-ws-upgrade.test.js` and `backend/test/runtime-session-control-dispatch.test.js`, while `backend/test/runtime.request-seams.test.js`, `backend/test/runtime-status-reporting.test.js`, `backend/test/runtime-startup-warmup.test.js`, and `backend/test/ws.integration.test.js` still prove the retained integrated runtime. The validated hotspot snapshot now reports `backend/src/runtime-ws-upgrade.js` at `100.00%` line / `96.00%` branch coverage and `backend/src/runtime-session-control-dispatch.js` at `100.00%` line / `100.00%` branch coverage.
  - The retained transport-only messaging branch gaps in `backend/src/discord-adapter.js`, `backend/src/delivery-adapter-utils.js`, and related adapter helpers were not promoted into `H159` because automatic outbound messaging remains intentionally deferred behind the third-attempt contract in `TODO-OUTLOOK.md`.
- Frontend:
  - `QLT-246` is now complete as the first delivered frontend slice of `v0.4.0-H159`. `frontend/src/public/app-runtime-composition-controller.js` no longer wires stream authority inline; it now delegates that path into `frontend/src/public/session-stream-authority-controller.js`, while `frontend/src/public/store.js` now delegates activity bump/clear transitions and lifecycle derivation into `frontend/src/public/session-activity-state.js` instead of carrying the full activity-state reducer logic inline. Direct deterministic coverage now lives in `frontend/test/session-stream-authority-controller.test.js` and `frontend/test/session-activity-state.test.js`, while `frontend/test/app-runtime-composition-controller.test.js`, `frontend/test/app-architecture-closeout.test.js`, and `frontend/test/layered-architecture-boundaries.test.js` now lock down the retained composition and architecture boundary. The extracted seams validate at `100.00%` line / `92.31%` branch coverage for `session-stream-authority-controller.js` and `96.41%` line / `90.24%` branch coverage for `session-activity-state.js`, while the retained shared runtime-state/stream baseline now validates at `92.02%` line / `77.53%` branch for `store.js` and `88.84%` line / `77.42%` branch for `terminal-stream.js`.
  - `QLT-247` is now complete as the next operator layout/profile/settings slice. `frontend/test/connection-profile-runtime-controller.test.js`, `frontend/test/layout-profile-runtime-controller.test.js`, `frontend/test/split-layout-runtime-controller.test.js`, `frontend/test/session-settings-state-controller.test.js`, `frontend/test/deck-runtime-controller.test.js`, and `frontend/test/file-transfer-runtime-controller.test.js` now lock down the fail-closed draft/bootstrap, list-load, split-layout mutation, settings-theme fallback, deck-state persistence, and file-transfer browser-fallback branches that were previously reached only indirectly. The validated hotspot snapshot now reports `frontend/src/public/connection-profile-runtime-controller.js` at `92.81%` line / `73.86%` branch coverage, `frontend/src/public/layout-profile-runtime-controller.js` at `92.35%` line / `83.33%` branch coverage, `frontend/src/public/split-layout-runtime-controller.js` at `90.73%` line / `75.56%` branch coverage, `frontend/src/public/ui/session-settings-state-controller.js` at `93.00%` line / `78.59%` branch coverage, `frontend/src/public/deck-runtime-controller.js` at `95.69%` line / `82.73%` branch coverage, and `frontend/src/public/file-transfer-runtime-controller.js` at `96.84%` line / `81.31%` branch coverage.
  - `QLT-248` is now complete as the next operator command/workflow slice. `frontend/test/command-palette-runtime-controller.test.js`, `frontend/test/custom-command-model.test.js`, `frontend/test/slash-workflow-engine.test.js`, `frontend/test/slash-workflow-runtime-controller.test.js`, and `frontend/test/slash-workflow-source-adapter.test.js` now lock down fallback label normalization, malformed definition rejection, idle/cancel workflow finalization, raw action-payload preservation, malformed buffer handling, unchanged-value deduplication, and missing-session fail-closed behavior that were previously reached only indirectly. The validated hotspot snapshot now reports `frontend/src/public/command-palette-runtime-controller.js` at `90.21%` line / `70.35%` branch coverage, `frontend/src/public/custom-command-model.js` at `93.40%` line / `86.57%` branch coverage, `frontend/src/public/slash-workflow-engine.js` at `98.65%` line / `94.81%` branch coverage, `frontend/src/public/slash-workflow-runtime-controller.js` at `89.56%` line / `74.17%` branch coverage, and `frontend/src/public/slash-workflow-source-adapter.js` at `92.11%` line / `80.73%` branch coverage.
  - `QLT-249` is now complete as the final delivered slice of `v0.4.0-H159`. `frontend/test/send-history-runtime-controller.test.js`, `frontend/test/session-ui-facade-controller.test.js`, `frontend/test/session-card-meta-controller.test.js`, and `frontend/test/share-access-state.test.js` now lock down retained send-history persistence failure pruning, dialogless/event-driven guards, delegated theme/input-safety fallback contracts, missing UI-slot behavior, and share-token decode fallbacks that were previously only hit indirectly. The validated hotspot snapshot now reports `frontend/src/public/send-history-runtime-controller.js` at `97.22%` line / `86.85%` branch coverage, `frontend/src/public/ui/session-ui-facade-controller.js` at `100.00%` line / `98.42%` branch coverage, `frontend/src/public/ui/session-card-meta-controller.js` at `100.00%` line / `88.37%` branch coverage, and `frontend/src/public/share-access-state.js` at `100.00%` line / `82.86%` branch coverage.
  - The large static `theme-library.js` file still remains intentionally unpromoted because it is primarily data inventory rather than an uncovered behavior-heavy runtime seam.

The fresh post-`H159` review then promoted one more same-day follow-up wave, `v0.4.0-H160`, but kept the scope narrow to product-facing runtime/operator seams only:

- Root tooling:
  - Top-line root coverage remains `92.77%` line / `76.81%` branch after the fresh rerun of `npm run test:root:coverage`.
  - The remaining lower-covered root files are still `scripts/analyze-pty-write-eintr.mjs` (`77.17%` line / `43.48%` branch) and `scripts/analyze-startup-timeline.mjs` (`80.77%` line / `49.09%` branch), but they remain intentionally unpromoted because they are retained diagnostics rather than active product/runtime authority paths.
- Backend:
  - `QLT-250` is now complete as the first delivered backend slice in `v0.4.0-H160`. `backend/src/runtime.js` no longer keeps the WebSocket upgrade admission path or the REST session-control request fan-out inline; those now live in `backend/src/runtime-ws-upgrade.js` and `backend/src/runtime-session-control-dispatch.js` with direct deterministic seam tests. The runtime monolith drops from `6820` to `6665` lines through this cut while keeping the shipped REST/WS contract stable.
  - `QLT-251` is now complete as the second delivered backend slice in `v0.4.0-H160`. `backend/test/terminal-app-identity.test.js` now locks down helper fail-closed behavior, alternate-screen promotion, same-family continuity, replacement-delta arbitration, stale-history normalization, and unchanged-identity timestamp preservation across the retained `terminal-app-identity` seam. `backend/test/runtime-session-control-attachments.test.js` now locks down reconnect reuse, missing/empty attachment inputs, alias/label shaping, active-prune guards, timer clearing/rescheduling, detached-entry pruning, and no-op label updates across the retained control-attachment seam. The validated hotspot snapshot now reports `backend/src/terminal-app-identity.js` at `96.47%` line / `80.86%` branch coverage and `backend/src/runtime-session-control-attachments.js` at `100.00%` line / `87.80%` branch coverage.
  - The retained transport-only messaging branch gaps in `backend/src/discord-adapter.js`, `backend/src/delivery-adapter-utils.js`, `backend/src/messaging-runtime.js`, and related adapter helpers remain intentionally unpromoted because automatic outbound messaging is still deferred behind the third-attempt contract in `TODO-OUTLOOK.md`.
- Frontend:
  - `QLT-252` is now complete as the third delivered slice in `v0.4.0-H160`. `frontend/src/public/command-executor.js` now delegates the `close`, `switch`, `swap`, `next`, `prev`, `rename`, `restart`, and `note` command cluster into `frontend/src/public/command-executor-session-handlers.js`, which also centralizes the active/direct target-resolution helpers that were previously kept inline in the executor. The extraction reduces `frontend/src/public/command-executor.js` from `2047` to `1850` lines without widening the shipped command contract, and `frontend/package.json` now includes the new seam file in the explicit frontend `build` / `lint` `node --check` lists so the extracted module stays inside the deterministic syntax gate.
  - Direct deterministic seam coverage for `QLT-252` now lives in `frontend/test/command-executor-session-handlers.test.js`, while `frontend/test/command-executor.test.js` remains green against the retained integrated executor. The validated hotspot snapshot now reports `frontend/src/public/command-executor-session-handlers.js` at `92.48%` line / `70.76%` branch coverage and `frontend/src/public/command-executor.js` at `86.38%` line / `75.22%` branch coverage.
  - `QLT-253` is now complete as the fourth delivered slice in `v0.4.0-H160`. `frontend/test/command-palette-runtime-controller.test.js` now locks down malformed custom-command filtering, no-match commit guards, result-button click selection, shortcut-toggle close behavior, and DOM-light fallback rendering across the retained command-palette seam. `frontend/test/slash-workflow-runtime-controller.test.js` now locks down listener-thrown engine cleanup and retry recovery so the slash-workflow runtime proves fail-closed cleanup outside normal engine-produced `failed` states. `frontend/test/paste-observation-runtime-controller.test.js` now locks down full placeholder completion, overlapping continue suppression, invalid-input guards, and dispose cleanup. `frontend/test/replay-export-runtime-controller.test.js` now locks down document-element removal fallback, unavailable shell-block summaries, unsupported browser download paths, and API/session guard failures. The validated hotspot snapshot now reports `frontend/src/public/command-palette-runtime-controller.js` at `93.64%` line / `80.16%` branch coverage, `frontend/src/public/slash-workflow-runtime-controller.js` at `90.78%` line / `74.83%` branch coverage, `frontend/src/public/paste-observation-runtime-controller.js` at `92.97%` line / `82.63%` branch coverage, and `frontend/src/public/replay-export-runtime-controller.js` at `98.95%` line / `94.12%` branch coverage.
  - `QLT-254` is now complete as the fifth and final delivered slice in `v0.4.0-H160`. `frontend/test/workspace-preset-runtime-controller.test.js` now locks down exact-name/prefix selector resolution and `loadPresets()` fail-closed behavior when no preset API hook exists. `frontend/test/workspace-manager-runtime-controller.test.js` now locks down select-driven rerendering and repeated open/close cycles. `frontend/test/session-view-model.test.js` now locks down blocked-state messaging, environment/tag guardrails, and startup normalization. `frontend/test/terminal-search.test.js` now locks down case-sensitive matching, buffer fallbacks, and empty/wrapped status branches. `frontend/test/layout-settings-controller.test.js` now locks down invalid-value clamping and measurement/DOM fallback behavior. The validated hotspot snapshot now reports `frontend/src/public/workspace-preset-runtime-controller.js` at `92.60%` line / `81.36%` branch coverage, `frontend/src/public/workspace-manager-runtime-controller.js` at `94.44%` line / `72.15%` branch coverage, `frontend/src/public/session-view-model.js` at `95.36%` line / `84.68%` branch coverage, `frontend/src/public/terminal-search.js` at `96.00%` line / `88.46%` branch coverage, and `frontend/src/public/ui/layout-settings-controller.js` at `98.89%` line / `95.65%` branch coverage.
  - The large static `theme-library.js` file still remains intentionally unpromoted because it is primarily data inventory rather than an uncovered behavior-heavy runtime seam.

`v0.4.0-H160` is now fully closed on `main`; no root-diagnostic or messaging-specific near-term wave is promoted alongside it.

## Frontend Runtime-State and Plugin Baseline

`v0.4.0-H153` added the frontend source-of-truth and plugin infrastructure needed for future stream interpretation without reintroducing production heuristics or messaging behavior.

Current contract:

- `frontend/src/public/store.js` remains the single owner of normalized session interpretation state.
- `frontend/src/public/runtime-event-controller.js` accepts explicit `session.interpretation.apply` runtime events and forwards them to `store.applySessionInterpretationActions(...)`.
- `frontend/src/public/ws-runtime-controller.js` invokes stream interpretation for `session.data` before terminal writes and invokes it for other WebSocket runtime events after canonical runtime-event handling.
- `frontend/src/public/stream-interpretation-plugin-engine.js` owns plugin registration, deterministic priority order, event-type filtering, action-vocabulary filtering, plugin attribution for badges/artifacts/notifications, and per-plugin failure isolation.
- `createAppRuntimeCompositionController` accepts an optional `streamInterpretationPlugins` array, but the default production configuration keeps it empty.
- The allowed action vocabulary is intentionally bounded to the store-owned session interpretation actions: `setSessionState`, `setSessionStatus`, `markSessionAttention`, `setSessionBadges`, `mergeSessionMeta`, `setSessionTags`, `upsertSessionArtifact`, `removeSessionArtifact`, and `pushSessionNotification`.
- No Codex-specific working-line detection, summary extraction, outbound messaging, remote adapter action, DOM side effect, or clipboard action was added in this baseline.
- Large stack-replacement refactors are not part of the project outlook; the current custom reducer-first store and current runtime stack remain the planning baseline.
- Regression coverage lives in `frontend/test/stream-interpretation-plugin-engine.test.js`, `frontend/test/ws-runtime-controller.test.js`, `frontend/test/runtime-event-controller.test.js`, and the existing `frontend/test/store.test.js`.

Relevant docs:

- `docs/Frontend Plugin System for Terminal Stream Interpretation.md`
- `docs/Codebase Review - WebSocket as Single Source of Truth.md`

## Frontend Activity / Stream Authority Baseline

`v0.4.0-H159 / QLT-246` extracted the FE-side activity and idle authority into explicit non-DOM seams so the runtime-state baseline no longer depends on inline composition callbacks.

Current contract:

- `frontend/src/public/session-activity-state.js` owns lifecycle/activity derivation plus the pure `session.activity.bump` and `session.activity.clear` reducers used by the shared runtime store.
- `frontend/src/public/session-stream-authority-controller.js` owns raw stream trace recording, terminal append forwarding, and idle-driven activity clearing on top of `createSessionStreamAdapter(...)`.
- `frontend/src/public/app-runtime-composition-controller.js` now wires session stream authority through `createSessionStreamAuthorityController(...)` instead of holding that callback fan-out inline.
- `frontend/src/public/store.js` still keeps normalized command-correlation rewriting locally, but it now delegates the core activity-state transitions into the extracted reducer seam.
- Architecture regression coverage in `frontend/test/app-architecture-closeout.test.js` and `frontend/test/layered-architecture-boundaries.test.js` now enforces that raw stream delivery stays on the terminal path and idle completion stays on the store path through the delegated controller.

## Session Control Runtime Behavior

The extracted session-control runtime remains the authoritative seam for trusted-local attachment state, control gating, and reconnect-aware operator messaging.

Current contract:

- `frontend/src/public/session-control-runtime-state.js` owns the read/write gating, summaries, badges, and `Take Control` versus `Reclaim Control` label decision.
- `Reclaim Control` is only valid when a real current controller exists but is reconnect-reserved or inactive.
- `Take Control` remains the correct operator label when no current controller is attached, even if the local device is already attached to session metadata.
- `frontend/src/public/session-control-runtime-controller.js` mirrors that distinction in button titles and post-action feedback so unattached-controller states are not mislabeled as reconnect reclaim events.
- `frontend/src/public/app-runtime-composition-controller.js` must resolve trusted-local device-local layout replay through `sessionControlRuntimeController.getRuntimeClientId()` instead of reading an ad hoc composition-local variable.
- `frontend/src/public/trusted-local-handoff-runtime-controller.js` must fail closed on stale session takeover targets:
  - reject missing or no-longer-takeable session targets before calling the backend
  - normalize backend `SessionNotFound` failures into the stable operator-facing message `Trusted-local session takeover target is no longer available.`

## Theme Import/Export Baseline

`v0.4.0-H152` added a bounded frontend-only compatibility layer for terminal theme import/export without changing the backend session schema.

Current contract:

- `frontend/src/public/theme-io.js` is the single parser/serializer seam for external theme compatibility.
- Supported import formats are `auto`, `ptydeck`, `iterm2`, `windows-terminal`, and `xresources`.
- Supported export formats are `ptydeck`, `iterm2`, `windows-terminal`, and `xresources`.
- The compatibility layer normalizes external payloads into the existing `activeThemeProfile` / `inactiveThemeProfile` color-key model.
- Missing imported colors preserve the selected slot's current profile where possible, then fall back to the default terminal theme.
- Session Settings UI import writes the selected active/inactive slot as a draft; `Save Settings` persists the draft through the existing session update path.
- Slash-command import applies immediately through `/settings theme import <active|inactive> <format> <payload...>`.
- Slash-command export returns the serialized payload through `/settings theme export <active|inactive> <format>`.
- Regression coverage lives in `frontend/test/theme-io.test.js`, `frontend/test/command-executor.test.js`, `frontend/test/session-settings-state-controller.test.js`, and `frontend/test/session-card-interactions-controller.test.js`.

## Command Autocomplete Behavior

Command autocomplete ranking keeps deterministic discovery scoring, with one strict-prefix completion rule: when two exact-prefix matches differ only because one full candidate is a strict prefix of the other, the shorter candidate wins before usage recency. This keeps `/do` + Tab on `doc` ahead of `doc-en`, while preserving schema/stable ordering for unrelated exact-prefix aliases and preserving usage personalization for same-length ties.

Pending async suggestion-refresh timers are cancelled before explicit Tab-cycle autocomplete progression, so stale inline-hint refresh work cannot collapse the active completion ring while the operator is cycling forward or backward through slash-command candidates.

The 2026-04-22 closeout validation for this behavior passed `npm run lint`, `npm run test`, `npm run test:coverage:check`, `npm run docs:check`, and `git diff --check`.

## Repository Quality Review (2026-04-18)

The repo-wide quality gates still pass at the top line. `v0.4.0-H146` repaired the coverage-report contract so later hardening work is based on trustworthy numbers instead of partially hidden or duplicated reports, `v0.4.0-H147` then closed the first promoted backend transport/validation blind spots on top of that repaired contract, `v0.4.0-H148` completed the first frontend controller/command-path hardening wave, and `v0.4.0-H150` continued that decomposition around trusted-local control orchestration:

- Backend coverage still runs through the same deterministic workspace file selection contract as the backend default test suite, excluding only `nonfunctional.load.test.js` from the coverage lane. The previously hidden `contract-conformance.test.js`, `runtime.request-seams.test.js`, `runtime.integration.test.js`, and `ws.integration.test.js` surfaces remain visible in the reported backend coverage gate.
- Frontend coverage still emits a normalized one-row-per-source-file report even when the Node test runner produces duplicate file rows. The normalization remains explicit in the emitted report so duplicate-row repair is auditable instead of silent.
- At the 2026-04-18 review point, the corrected local coverage-check contract reported backend line coverage at `93.69%` and frontend line coverage at `94.58%`. The delivered backend hardening raised the promoted backend hotspots to `95.52%` line / `54.17%` branch for `backend/src/delivery-adapter-utils.js`, `92.08%` line / `54.90%` branch for `backend/src/discord-adapter.js`, `87.86%` line / `78.85%` branch for `backend/src/messaging-custom-command-utils.js`, `88.64%` line / `78.02%` branch for `backend/src/messaging-runtime.js`, `92.54%` line / `82.19%` branch for `backend/src/telegram-command-surface.js`, and `94.45%` line / `93.40%` branch for `backend/src/validation.js`.
- `v0.4.0-H149` then reduced `backend/src/runtime.js` from `7938` to `7485` lines by extracting three smaller backend seams with direct tests instead of keeping those branches inside one runtime file:
  - `backend/src/runtime-http-helpers.js` (`184` lines) now owns request-auth/CORS/security/TLS/JSON-response helpers and is covered at `100.00%` line / `98.18%` branch / `81.82%` function.
  - `backend/src/runtime-status-reporting.js` (`171` lines) now owns health/ready/metrics payload shaping and is covered at `100.00%` line / `96.43%` branch / `100.00%` function.
  - `backend/src/runtime-session-control-attachments.js` (`215` lines) now owns the attachment registry, prune scheduling, and label normalization/update behavior and is covered at `90.70%` line / `75.71%` branch / `94.44%` function.
  - The remaining `backend/src/runtime.js` file still sits at `82.08%` line / `75.60%` branch / `91.67%` function coverage, but the extracted seams materially reduced monolith risk and moved promoted helper branches into deterministic unit tests without changing the shipped transport-only runtime contract.
- `v0.4.0-H148` reduced `frontend/src/public/app-runtime-composition-controller.js` from `2623` to `2328` lines by extracting `frontend/src/public/session-control-runtime-state.js` (`428` lines) and by adding direct seam tests for trusted-local handoff/control ownership behavior instead of testing only through the larger composition controller.
- `v0.4.0-H150` then reduced `frontend/src/public/app-runtime-composition-controller.js` further from `2328` to `1878` lines by extracting `frontend/src/public/session-control-runtime-controller.js` (`594` lines), which now owns canonical-origin redirects, origin-handoff auto-repair, reclaim-and-retry feedback actions, trusted-local rename/forget flows, and rendered session-control UI state instead of leaving those branches buried inside one composition controller.
- `v0.4.0-H151` then closed the remaining promoted frontend command/workspace monolith wave by extracting three more directly tested seams from the highest-fan-out controller cluster:
  - `frontend/src/public/command-executor-domain-handlers.js` (`560` lines) now owns the main structured command-family dispatch, reducing `frontend/src/public/command-executor.js` from `2432` to `1984` lines.
  - `frontend/src/public/connection-profile-runtime-actions.js` (`411` lines) now owns profile lifecycle/action flows, reducing `frontend/src/public/connection-profile-runtime-controller.js` from `1984` to `1752` lines.
  - `frontend/src/public/workspace-preset-runtime-actions.js` (`605` lines) now owns preset/group lifecycle/action flows, reducing `frontend/src/public/workspace-preset-runtime-controller.js` from `1557` to `1135` lines.
- The validated post-`H151` frontend seam snapshot was:
  - `frontend/src/public/app-runtime-composition-controller.js`: `86.47%` line / `62.92%` branch / `14.29%` function
  - `frontend/src/public/session-control-runtime-controller.js`: `87.71%` line / `66.38%` branch / `68.97%` function
  - `frontend/src/public/session-control-runtime-state.js`: `85.98%` line / `75.65%` branch / `100.00%` function
  - `frontend/src/public/command-executor-domain-handlers.js`: `87.86%` line / `71.49%` branch / `22.39%` function
  - `frontend/src/public/command-executor.js`: `82.86%` line / `73.54%` branch / `47.58%` function
  - `frontend/src/public/connection-profile-runtime-actions.js`: `77.37%` line / `74.19%` branch / `26.79%` function
  - `frontend/src/public/connection-profile-runtime-controller.js`: `91.38%` line / `70.33%` branch / `79.87%` function
  - `frontend/src/public/workspace-preset-runtime-actions.js`: `85.62%` line / `67.43%` branch / `54.67%` function
  - `frontend/src/public/workspace-preset-runtime-controller.js`: `91.63%` line / `79.82%` branch / `76.56%` function
  - post-`H151` repo-wide validated coverage totals: backend `93.65%` line coverage, frontend `95.07%` line coverage
- The repo-wide review that promoted `v0.4.0-H151` is now closed: the command/workspace hotspot cluster has direct extracted seams plus focused tests, and no further active or queued quality wave remains in `TODO.md` or `ROADMAP.md`.
- Smaller low-coverage utilities and UI controllers still exist, but they were not promoted in this review because they are either already bounded, substantially better covered than the newly promoted monoliths, or lower risk than the backend runtime and frontend composition/command/workspace surfaces now queued in `TODO.md`.

## Repository Quality Review (2026-04-28)

The next whole-repo review kept the top-line gate green but found five still-relevant hotspots plus one repo-level tooling gap worth promoting into `v0.4.0-H156`:

- `QLT-228` is now completed. The local coverage gate now enforces a third root-tooling lane in addition to backend and frontend.
- `QLT-229` is now completed. `backend/src/auth.js` now has direct regression coverage for derived discovery resolution, explicit JWKS override bypass, JWKS cache expiry, forced refresh on missing `kid`, mixed scope-claim normalization, malformed JOSE rejection, provider availability failures, and internal HS256 fallback behavior in `AUTH_MODE=prod`.
- The validated post-`QLT-229` auth hotspot moved from `81.28%` line / `61.33%` branch to `94.45%` line / `90.73%` branch coverage.
- `QLT-230` is now completed. `backend/src/runtime.js` and `backend/src/session-manager.js` now have direct regressions for restore-all-fallbacks-fail behavior, dev-auth WS-ticket denial without `ws:connect`, concurrent stop/startup release behavior, startup fallback guard cleanup, and SSH reconnect fail-closed behavior.
- `QLT-231` is now completed. `frontend/src/public/app-runtime-composition-controller.js` and `frontend/src/public/app-runtime-state-controller.js` now have direct regressions for auth-recovery fallback, debug-trace API retry behavior, stream quiet-idle activity clearing, command-feedback action normalization, and bootstrap-fallback suppression after runtime readiness.
- `QLT-232` is now completed. `frontend/src/public/command-executor.js`, `frontend/src/public/command-executor-domain-handlers.js`, and `frontend/src/public/connection-profile-runtime-actions.js` now have direct regressions for malformed operator input, usage-only branches, connection-profile mutation/apply flows, side-effect suppression on invalid workflow inputs, theme/settings validation failures, and template custom preview failure paths. The same closeout also fixed a frontend autocomplete race by cancelling stale suggestion-refresh timers inside `frontend/src/public/command-composer-autocomplete-controller.js` before Tab-cycle progression.
- `QLT-233` is now completed. `frontend/src/public/session-control-runtime-state.js`, `frontend/src/public/session-control-runtime-controller.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js` now have direct regressions for blocked-write denial, reconnect-reserved control variants, terminal-mount fallback, and missing-API terminal interaction paths. The same closeout also fixed the control-label seam so unattached sessions use `Take Control` while only reconnect-reserved sessions use `Reclaim Control`.
- The root-tooling lane runs through `scripts/run-root-coverage-tests.mjs`, covers the root `test/` suite plus repo-owned `scripts/` modules, and filters the report to those owned roots only.
- Incidental frontend/backend imports used by root tooling tests are now reported explicitly as omitted from the root summary instead of silently distorting that lane.
- The root-tooling lane is enforced at `ROOT_MIN_LINES=90` through `scripts/check-coverage.sh`.
- A direct root-only experimental coverage run over `test/*.test.js` currently reports `87.58%` line coverage overall, with `scripts/lib/coverage-report.mjs` at `66.27%` line / `74.51%` branch, `scripts/analyze-pty-write-eintr.mjs` at `77.17%` line / `43.48%` branch, `scripts/analyze-startup-timeline.mjs` at `80.77%` line / `49.09%` branch, and `scripts/scaffold-ui-module.mjs` at `87.64%` line / `61.54%` branch.
- The backend's most relevant remaining hotspots are now the runtime/session lifecycle seams rather than the already-closed auth seam:
  - pre-`QLT-230` baseline: `backend/src/runtime.js` at `82.06%` line / `75.63%` branch and `backend/src/session-manager.js` at `93.61%` line / `76.70%` branch
  - validated post-`QLT-230` snapshot: `backend/src/runtime.js` at `81.98%` line / `75.66%` branch and `backend/src/session-manager.js` at `94.34%` line / `78.80%` branch
- The frontend's most relevant remaining hotspots are still the composition and operator-command seams rather than generated/static assets such as `theme-library.js`:
  - validated post-`QLT-231` `frontend/src/public/app-runtime-composition-controller.js`: `86.33%` line / `62.22%` branch
  - validated post-`QLT-231` `frontend/src/public/app-runtime-state-controller.js`: `99.31%` line / `83.67%` branch
  - validated post-`QLT-232` `frontend/src/public/command-executor-domain-handlers.js`: `91.43%` line / `78.31%` branch
  - validated post-`QLT-232` `frontend/src/public/command-executor.js`: `86.81%` line / `76.28%` branch
  - validated post-`QLT-232` `frontend/src/public/connection-profile-runtime-actions.js`: `96.35%` line / `92.94%` branch
  - validated post-`QLT-233` `frontend/src/public/session-control-runtime-controller.js`: `97.99%` line / `87.65%` branch
  - validated post-`QLT-233` `frontend/src/public/session-control-runtime-state.js`: `96.97%` line / `88.14%` branch
  - validated post-`QLT-233` `frontend/src/public/ui/session-terminal-runtime-controller.js`: `89.05%` line / `80.43%` branch
- `v0.4.0-H156` is now completed. The promoted root-tooling, auth, runtime/session, bootstrap/control, command/workflow, and session-control / terminal-interaction hotspots all have direct seam regressions, and no further active quality wave is promoted in `TODO.md` or `ROADMAP.md`.

## Latest Validated Coverage

The latest whole-repo validation on 2026-05-06 reran `npm --prefix backend run test:coverage`, `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check` on top of the `QLT-302` extraction tree. The validated coverage totals are root tooling `92.82%` line / `77.09%` branch, backend `96.24%` line / `89.41%` branch, and frontend `97.40%` line / `89.96%` branch.

## Repo-Wide Quality Review Follow-Up (`v0.4.0-H173`)

On 2026-05-06, a fresh whole-repo quality and coverage review was rerun after the multiline shell-send transport fix so the next quality wave is based on the current tree instead of the earlier `H172` closeout snapshot. `QLT-302` has since been completed as the first delivered slice inside `H173`.

Most relevant promoted hotspots on the current tree:

- Backend:
  - `backend/src/runtime.js`: `3280` lines, `85.76%` line / `77.86%` branch coverage after the `QLT-302` normalization extraction
  - `backend/src/runtime-library-normalization.js`: `1724` lines, `79.35%` line / `74.32%` branch coverage
  - `backend/src/session-manager.js`: `1558` lines, `96.21%` line / `81.72%` branch coverage
- Frontend:
  - `frontend/src/public/app-runtime-composition-controller.js`: `1711` lines and still the highest-risk retained FE composition monolith
  - `frontend/src/public/connection-profile-runtime-controller.js`: `916` lines, `98.91%` line / `70.46%` branch coverage
  - `frontend/src/public/workspace-preset-runtime-controller.js`: `1135` lines, `92.60%` line / `81.36%` branch coverage
  - `frontend/src/public/command-palette-runtime-controller.js`: `613` lines, `93.64%` line / `80.16%` branch coverage
  - `frontend/src/public/slash-workflow-runtime-controller.js`: `412` lines, `91.26%` line / `80.00%` branch coverage
  - `frontend/src/public/ui/session-terminal-runtime-controller.js`: `824` lines, `92.35%` line / `85.08%` branch coverage

Promoted `H173` tasks:

- `QLT-303` Owner `BE`: isolate the next restart/launch/persistence lifecycle helper seam from `backend/src/session-manager.js` and harden the remaining launch/restore/reconnect branch gaps.
- `QLT-304` Owner `FE`: extract the next initialization/error/reclaim helper seam from `frontend/src/public/app-runtime-composition-controller.js` and close it with direct deterministic regressions.
- `QLT-305` Owner `FE`: isolate the next SSH/profile operator seam from `frontend/src/public/connection-profile-runtime-controller.js` and close the remaining branch gaps around selection, trust/draft presentation, and guarded action fallbacks.
- `QLT-306` Owner `FE`: isolate workspace snapshot/group/layout orchestration from `frontend/src/public/workspace-preset-runtime-controller.js` and close the remaining deterministic branch gaps.
- `QLT-307` Owner `FE`: harden retained operator-interaction coverage across `frontend/src/public/command-palette-runtime-controller.js`, `frontend/src/public/slash-workflow-runtime-controller.js`, and `frontend/src/public/ui/session-terminal-runtime-controller.js`.

Delivered `H173` work so far:

- `QLT-302` Owner `BE`: `backend/src/runtime.js` now delegates retained custom-command, deck, connection-profile, layout-profile, workspace-preset, and share-link normalization into `backend/src/runtime-library-normalization.js`. Direct deterministic seam coverage now lives in `backend/test/runtime-library-normalization.test.js`, and the validated active-tree hotspot snapshot reports `backend/src/runtime-library-normalization.js` at `79.35%` line / `74.32%` branch coverage and the reduced `backend/src/runtime.js` at `85.76%` line / `77.86%` branch coverage.

Not promoted in `H173`:

- Root diagnostic scripts such as `scripts/analyze-pty-write-eintr.mjs` and `scripts/analyze-startup-timeline.mjs` remain intentionally unpromoted because they are retained diagnostics rather than live product/runtime authority paths.
- Smaller already-extracted backend helper seams such as `runtime-library-authority.js` and `runtime-session-control-authority.js` were not promoted ahead of the larger remaining backend monoliths.
