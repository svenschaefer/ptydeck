# CODEX CONTEXT - ptydeck

Last updated: 2026-04-23 (theme import/export compatibility baseline)

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

- `TODO.md`: no active explicit tasks remain
- `ROADMAP.md`: no active or queued release wave remains
- the future third messaging attempt is deferred to `TODO-OUTLOOK.md`
- no active near-term messaging rebuild is in progress

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

## Latest Validated Coverage

The latest closeout validation on 2026-04-23 for `v0.4.0-H152` passed `npm run lint`, `npm run test`, `npm run test:coverage:check`, `npm run docs:generate`, and the generated-doc checks. The validated repo-wide line coverage totals are backend `93.69%` and frontend `95.01%`.
