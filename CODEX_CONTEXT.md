# CODEX CONTEXT - ptydeck

Last updated: 2026-04-18 (post-repo-wide quality/coverage review and queued `H149`-`H151` hardening waves)

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

- `TODO.md`: active explicit quality/coverage hardening tasks are queued for `v0.4.0-H149` through `v0.4.0-H151`
- `ROADMAP.md`: `v0.4.0-H149` is now active, with `v0.4.0-H150` and `v0.4.0-H151` queued behind it
- the future third messaging attempt is deferred to `TODO-OUTLOOK.md`
- no active near-term messaging rebuild is in progress

## Repository Quality Review (2026-04-18)

The repo-wide quality gates still pass at the top line. `v0.4.0-H146` repaired the coverage-report contract so later hardening work is based on trustworthy numbers instead of partially hidden or duplicated reports, `v0.4.0-H147` then closed the first promoted backend transport/validation blind spots on top of that repaired contract, and `v0.4.0-H148` completed the promoted frontend controller/command-path hardening wave:

- Backend coverage still runs through the same deterministic workspace file selection contract as the backend default test suite, excluding only `nonfunctional.load.test.js` from the coverage lane. The previously hidden `contract-conformance.test.js`, `runtime.request-seams.test.js`, `runtime.integration.test.js`, and `ws.integration.test.js` surfaces remain visible in the reported backend coverage gate.
- Frontend coverage still emits a normalized one-row-per-source-file report even when the Node test runner produces duplicate file rows. The normalization remains explicit in the emitted report so duplicate-row repair is auditable instead of silent.
- The corrected local coverage-check contract now reports backend line coverage at `92.16%` and frontend line coverage at `94.58%` on the full gate. The delivered backend hardening raised the promoted backend hotspots to `95.52%` line / `51.11%` branch for `backend/src/delivery-adapter-utils.js`, `92.08%` line / `54.90%` branch for `backend/src/discord-adapter.js`, `87.86%` line / `78.85%` branch for `backend/src/messaging-custom-command-utils.js`, `85.24%` line / `67.28%` branch for `backend/src/messaging-runtime.js`, `90.05%` line / `77.63%` branch for `backend/src/telegram-command-surface.js`, and `81.42%` line / `80.08%` branch for `backend/src/validation.js`.
- `v0.4.0-H148` then reduced `frontend/src/public/app-runtime-composition-controller.js` from `2623` to `2328` lines by extracting `frontend/src/public/session-control-runtime-state.js` (`428` lines) and by adding direct seam tests for trusted-local handoff/control ownership behavior instead of testing only through the larger composition controller.
- Focused frontend hardening in `H148` also covered the promoted failure-path gaps in `frontend/src/public/app-lifecycle-controller.js`, `frontend/src/public/api-client.js`, and `frontend/src/public/command-executor.js`. The focused seam snapshot reached `92.12%` line / `77.22%` branch / `94.20%` function coverage for `frontend/src/public/api-client.js`, `95.62%` line / `95.00%` branch / `45.16%` function coverage for `frontend/src/public/app-lifecycle-controller.js`, `85.05%` line / `64.84%` branch / `22.80%` function coverage for `frontend/src/public/app-runtime-composition-controller.js`, and `74.07%` line / `58.62%` branch / `97.56%` function coverage for `frontend/src/public/session-control-runtime-state.js`.
- A follow-up repo-wide review on the validated current tree promoted three remaining quality waves because the repaired coverage report now makes the residual risks unambiguous instead of anecdotal:
  - `backend/src/runtime.js` remains the largest backend hotspot at `7938` lines with `82.78%` line and `76.53%` branch coverage, so the next promoted backend wave targets runtime-core seam extraction and direct branch coverage there instead of spreading effort across smaller backend files first.
  - `frontend/src/public/app-runtime-composition-controller.js` remains the largest frontend hotspot even after `H148`, still at `2328` lines with only `71.31%` line / `64.13%` branch / `14.58%` function coverage; the extracted `frontend/src/public/session-control-runtime-state.js` seam improved testability but still sits at `76.87%` line / `62.87%` branch coverage, so the next frontend wave continues decomposition and branch closure around bootstrap/auth/handoff/reconnect flows.
  - The remaining high-fan-out frontend command/workspace stack is now the next clear maintainability cluster after the composition controller: `frontend/src/public/command-executor.js` sits at `2432` lines with `49.61%` function coverage, `frontend/src/public/connection-profile-runtime-controller.js` sits at `1984` lines with `69.23%` branch coverage, and `frontend/src/public/workspace-preset-runtime-controller.js` sits at `1557` lines with `73.81%` branch coverage. Those files were therefore promoted together into a later frontend wave rather than leaving them as untracked known debt.
- Smaller low-coverage utilities and UI controllers still exist, but they were not promoted in this review because they are either already bounded, substantially better covered than the newly promoted monoliths, or lower risk than the backend runtime and frontend composition/command/workspace surfaces now queued in `TODO.md`.
