# CODEX CONTEXT - ptydeck

Last updated: 2026-04-29 (fresh repo-wide quality/coverage review, promoted H158 gap follow-up wave, production auth baseline, historical-review markers, FE handbook messaging cleanup, and current runtime baseline synced after latest review)

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

- `TODO.md`: `QLT-234` through `QLT-240` are now promoted as the active repo-wide quality/coverage follow-up tasks.
- `ROADMAP.md`: `v0.4.0-H158` is now the active release wave for those quality/coverage tasks.
- The future third messaging attempt is deferred to `TODO-OUTLOOK.md`.
- No active near-term messaging rebuild is in progress.
- Future semantic stream-interpretation plugins are deferred until they are promoted as explicit tasks with acceptance tests.

## Repository Quality Review (2026-04-29)

The 2026-04-29 review refreshed the repo-wide evidence instead of relying on the earlier `H156` baseline alone.

Current validated top-line coverage remains above threshold:

- root tooling: `91.13%` line / `72.90%` branch
- backend: `93.94%` line / `87.00%` branch
- frontend: `95.48%` line / `87.17%` branch

The new review promoted only the still-relevant gaps into `TODO.md`:

- Root tooling:
  - `scripts/lib/coverage-report.mjs` remains the most relevant repo-owned quality-helper hotspot at `84.98%` line / `71.58%` branch coverage.
  - `scripts/scaffold-ui-module.mjs` remains the other still-relevant product-tooling hotspot at `87.64%` line / `61.54%` branch coverage.
  - The lower historical analysis scripts `scripts/analyze-pty-write-eintr.mjs` and `scripts/analyze-startup-timeline.mjs` remain below that level, but they were not promoted into the near-term wave because they are retained diagnostics rather than active product/runtime authority paths.
- Backend:
  - `backend/src/runtime.js` remains the largest backend monolith at `7552` lines and `82.15%` line / `75.77%` branch coverage.
  - `backend/src/startup-backup.js`, `backend/src/key-provider.js`, `backend/src/ssh-host-key-probe.js`, and `backend/src/node-pty-write-retry.js` still carry relevant reliability branches in the `85%` to `87%` line-coverage range.
  - The retained transport-only messaging/identity baseline still has direct branch blind spots in `backend/src/messaging-runtime.js`, `backend/src/messaging-custom-command-utils.js`, `backend/src/telegram-adapter.js`, `backend/src/terminal-messaging-core.js`, and `backend/src/terminal-app-identity.js`.
- Frontend:
  - `frontend/src/public/app-runtime-composition-controller.js` remains the largest behavior-heavy frontend monolith at `1894` lines and `86.33%` line / `62.22%` branch coverage.
  - The next still-relevant lower-covered utility/operator seams are `command-send-safety-controller.js`, `stream-debug-trace-controller.js`, `trace-debug-controller.js`, `ui/terminal-search-controller.js`, `trusted-local-client-runtime-controller.js`, and `terminal-ctrl-c-runtime-controller.js`.
  - The next still-relevant lower-covered composer/workflow/settings/preset seams are `command-composer-autocomplete-controller.js`, `slash-workflow-parser.js`, `theme-io.js`, `workspace-preset-runtime-actions.js`, `command-engine.js`, and `ui/session-settings-dialog-controller.js`.
  - The large static `theme-library.js` file was not promoted as an active quality task because it is primarily data inventory rather than an uncovered behavior-heavy runtime seam.

The promoted follow-up wave is therefore:

- `QLT-234` through `QLT-240` under `v0.4.0-H158`

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

## Session Control Runtime Behavior

The extracted session-control runtime remains the authoritative seam for trusted-local attachment state, control gating, and reconnect-aware operator messaging.

Current contract:

- `frontend/src/public/session-control-runtime-state.js` owns the read/write gating, summaries, badges, and `Take Control` versus `Reclaim Control` label decision.
- `Reclaim Control` is only valid when a real current controller exists but is reconnect-reserved or inactive.
- `Take Control` remains the correct operator label when no current controller is attached, even if the local device is already attached to session metadata.
- `frontend/src/public/session-control-runtime-controller.js` mirrors that distinction in button titles and post-action feedback so unattached-controller states are not mislabeled as reconnect reclaim events.

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

The latest closeout validation on 2026-04-28 for `QLT-233` passed `npm run docs:check`, `npm run lint`, `npm run test`, `npm run test:coverage:check`, and `git diff --check`. The validated line coverage totals are root tooling `91.13%`, backend `93.94%`, and frontend `95.48%`.
