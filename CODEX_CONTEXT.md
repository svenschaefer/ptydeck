# CODEX CONTEXT - ptydeck

Last updated: 2026-04-17 (post-`v0.4.0-H145` repository quality and coverage review queued follow-up hardening waves)

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

- `TODO.md`: active explicit quality and coverage hardening tasks queued for `v0.4.0-H146` through `v0.4.0-H148`
- `ROADMAP.md`: active and queued quality/coverage waves `v0.4.0-H146` through `v0.4.0-H148`
- the future third messaging attempt is deferred to `TODO-OUTLOOK.md`
- no active near-term messaging rebuild is in progress

## Repository Quality Review (2026-04-17)

The repo-wide quality gates still pass at the top line, but the 2026-04-17 review surfaced several concrete gaps worth promoting into active work:

- Backend reported line coverage is `92.16%`, but the backend coverage runner currently excludes `contract-conformance.test.js`, `nonfunctional.load.test.js`, `runtime.request-seams.test.js`, `runtime.integration.test.js`, and `ws.integration.test.js` from the reported gate. That makes the top-line number less trustworthy than it should be for runtime and request/WS seams.
- Frontend reported line coverage is `93.91%`, but the frontend coverage output currently lists `frontend/src/public/app-runtime-composition-controller.js` twice with conflicting metrics (`85.67/68.22/60.20` and `62.64/61.70/13.82`), so the current report is not a clean one-file-to-one-row artifact.
- The retained transport-only messaging baseline still has low direct coverage in `backend/src/messaging-runtime.js` (`67.77` line / `60.78` branch), `backend/src/discord-adapter.js` (`74.75` line / `39.73` branch), `backend/src/delivery-adapter-utils.js` (`41.46` branch), and `backend/src/telegram-command-surface.js` (`85.07` line / `68.25` branch).
- Backend maintainability risk remains concentrated in `backend/src/validation.js` (`1610` lines, `76.34` line coverage) and `backend/src/messaging-custom-command-utils.js` (`81.20` line / `70.55` branch), where high branch fan-out makes the current coverage less convincing than the global total suggests.
- Frontend maintainability risk remains concentrated in `frontend/src/public/app-runtime-composition-controller.js` (`2623` lines), `frontend/src/public/command-executor.js` (`2432` lines, `84.83` line / `49.61` function coverage), `frontend/src/public/app-lifecycle-controller.js` (`32.79` function coverage), and `frontend/src/public/api-client.js` (`77.92` branch coverage).

The queued quality waves therefore prioritize coverage-report integrity first, then backend transport/validation hardening, then frontend controller and command-path hardening. The intent is to improve the trustworthiness of the current coverage contract and reduce monolith risk, not to chase top-line percentages blindly.
