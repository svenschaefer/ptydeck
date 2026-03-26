# ROADMAP - ptydeck

This file defines execution order, release versions, and dependencies for tasks listed in `TODO.md`.
`TODO.md` remains the source of task definitions.

## Ownership and Release Control

- Roadmap owner: `CODY`
- Release execution owners: `BE`, `FE`, `PLAT`, `QA`
- Final decision authority: `SAS` (Sven A. Schaefer, `svenschaefer`, `sven.schaefer@gmail.com`)
- Versioning scheme: compressed pre-1.0 milestones and wave-based follow-up releases through the active `v0.4.x` series

## Current Execution Status

- Active release wave: none currently.
- Active scoped tasks: none currently.
- Latest completed wave: `v0.4.0-H17` (Frontend Stream Runtime Cleanup, `QLT-140`, `QLT-141`).
- Previous completed wave: `v0.4.0-H16` (Target Clarity and Send Safety, `QLT-137`, `QLT-138`, `QLT-139`).
- Previous completed wave: `v0.4.0-H15` (Persistent Session Notes, `QLT-135`, `QLT-136`).
- Previous completed wave: `v0.4.0-H14` (Frontend Quick-ID Swap Command, `QLT-134`).
- Previous completed wave before that: `v0.4.0-H13` (Attention Header Text Silence, `QLT-133`).
- Previous completed wave before that: `v0.4.0-H12` (Frontend Notification Silence by Default, `QLT-132`).
- Previous completed wave before that: `v0.4.0-H11` (Header Status Churn Suppression, `QLT-131`).
- Previous completed wave before that: `v0.4.0-H10` (Debug Query Override Hardening, `QLT-130`).
- Previous completed wave before that: `v0.4.0-H9` (Invisible Stream Activity Filtering Hardening, `QLT-129`).
- Previous completed wave before that: `v0.4.0-H8` (Script Execution Traceability, `QLT-128`).
- Previous completed wave before that: `v0.4.0-H7` (WebSocket Origin Allowlist Enforcement, `ENT-017`).
- Previous completed wave before that: `v0.4.0-H6` (Startup Warmup Gate and Bootstrap Deferral, `QLT-126`, `QLT-127`).
- Previous completed wave before that: `v0.4.0-H5` (Stream Activity Noise Filtering, `QLT-125`).
- Previous completed wave before that: `v0.4.0-H4` (Declarative Command Contract, `DRV-003A` ... `DRV-004`).
- Previous completed wave before that: `v0.4.0-H3` (Terminal Interaction Ergonomics, `QLT-123` and `QLT-124`).
- Previous completed wave before that: `v0.4.0-H2` (Layered Frontend Architecture Completion, `ARC-009` ... `ARC-012`).
- Earlier completed wave before that: `v0.4.0-H1` (Observability Expansion, `OBS-001` ... `OBS-004`).

## Dependency Rules

- `BE-002` is a hard dependency for `BE-003` through `BE-010` and `FE-007`.
- `BE-011` is a hard dependency for `BE-004`, `BE-006`, `BE-012`, `BE-015`, and `INT-004`.
- `BE-012` and `BE-013` are hard dependencies for `FE-009` and `FE-010`.
- `FE-002` is a hard dependency for `FE-003`, `FE-006`, `FE-010`, and `FE-014`.
- `INT-003` should run after `INT-002` and before final milestone close.

## Version Plan

### v0.1.0 - Foundation and Contracts

- `INT-002`, `INT-001`, `BE-001`, `FE-001`, `BE-002`, `INT-009`, `DOC-001`, `DOC-002`

Exit criteria:

- Backend and frontend workspaces exist and build.
- OpenAPI contract exists and is the single API source.
- Local development and environment setup are documented.

### v0.2.0 - Backend Runtime and Realtime

- `BE-011`, `BE-003`, `BE-004`, `BE-005`, `BE-006`, `BE-007`, `BE-008`, `BE-009`, `BE-010`, `BE-019`
- `BE-012`, `BE-013`, `BE-014`, `BE-015`, `BE-016`, `BE-017`, `BE-018`

Exit criteria:

- Core REST lifecycle for session creation/control works against PTY runtime.
- API requests and responses are validated and errors are normalized.
- WebSocket stream is stable and multiplexed by `sessionId`.
- Session metadata persistence and restart restore work.

### v0.3.0 - Frontend, Quality, and Production Baseline

- `FE-007`, `FE-008`, `FE-002`, `FE-003`, `FE-004`, `FE-005`, `FE-006`, `FE-009`, `FE-010`, `FE-012`, `FE-013`, `FE-014`, `FE-011`
- `INT-003`, `INT-004`, `INT-005`, `INT-006`, `INT-007`, `INT-008`, `INT-010`

Exit criteria:

- Multi-session terminal UI is usable end to end.
- Unit, integration, and E2E coverage exists for critical paths.
- Repeatable deployment runbook and smoke checks are documented.

### v0.3.0-H1 - Quality Hardening Backlog

- `QLT-001`, `QLT-002`, `QLT-003`, `QLT-004`, `QLT-005`, `QLT-006`, `QLT-007`, `QLT-008`, `QLT-009`, `QLT-010`, `QLT-011`, `QLT-012`, `QLT-013`, `QLT-014`, `QLT-015`, `QLT-016`, `QLT-017`, `QLT-018`, `QLT-019`, `QLT-020`, `QLT-021`, `QLT-022`, `QLT-023`, `QLT-024`, `QLT-025`, `QLT-026`, `QLT-027`, `QLT-028`, `QLT-029`, `QLT-030`, `QLT-031`, `QLT-032`, `QLT-033`, `QLT-034`, `QLT-035`, `QLT-036`

Dependencies:

- `QLT-003` depends on `QLT-001` and `QLT-002`.
- `QLT-010` depends on `QLT-001`.
- `QLT-005` depends on test additions from `QLT-002`, `QLT-003`, and `QLT-004`.
- `QLT-005` should also include thresholds for new tests from `QLT-010`.
- `QLT-006` should be completed before production deployment updates.
- `QLT-009` depends on `QLT-008` session metadata persistence behavior.
- `QLT-012` should run after runtime-hardening items `QLT-007` and `QLT-011`.
- `QLT-014` should run after `QLT-007` to validate shutdown behavior under guarded request handling.
- `QLT-015` depends on stable route/error behavior from `QLT-004`.
- `QLT-016` should run before `QLT-012` smoke checks to ensure runtime-config consistency.
- `QLT-023` depends on `QLT-022` command-routing foundation.
- `QLT-024` depends on `QLT-022` to ensure control-plane output does not mix with PTY stream.
- `QLT-025` should run before `/restart` command support is marked complete in `QLT-023`.
- `QLT-026` depends on completion of `QLT-022`, `QLT-023`, and `QLT-025`.
- `QLT-027` should run after `QLT-021` and alongside `QLT-010` to pair performance hardening with DOM behavior coverage.
- `QLT-030` depends on `QLT-028` to ensure startup resize scheduling is stable before switching to strict fit-based geometry.
- `QLT-033` depends on `QLT-029` marker-cleaned output semantics to avoid replaying control markers on reconnect snapshots.
- `QLT-034` should run with `QLT-030` so rendered terminal geometry matches visual card height constraints.
- `QLT-035` should run after `QLT-030` so sidebar-driven fixed geometry can be applied on top of stable fit-based baseline behavior.
- `QLT-036` should run after `QLT-020` session naming support so compact quick IDs can be displayed beside human-readable names.

Exit criteria:

- Frontend error-path behavior is covered by tests.
- Backend negative-path behavior is covered by tests.
- Frontend DOM integration behavior is covered by tests.
- Backend persistence and restart behavior are resilient under partial-write risk.
- Dev static-file serving is path-safe.
- Route behavior is continuously checked against OpenAPI contract.
- Local quality gate enforces coverage minimums.
- Local quality gate runs runtime smoke checks before merge/release.
- Local quality gate validates runtime compatibility expectations for supported Node versions.
- Deployment docs include secure production CORS guidance.
- Frontend default visual baseline is dark console style with improved terminal readability.
- Session rename flow and home-directory default behavior are available in baseline runtime.
- Command input supports multiline workflows in a bottom-docked composer area.
- Slash-command control plane is explicitly separated from terminal execution input.
- Core command set (`/new`, `/close`, `/switch`, `/next`, `/prev`, `/list`, `/rename`, `/restart`, `/help`) is implemented and integration-tested.
- Frontend startup and session event paths avoid redundant roundtrips and are validated against slow-load regression scenarios.
- Reconnect snapshots restore visible terminal prompt/output context without waiting for new PTY output.
- Rendered terminal card height and effective rows/cols stay visually consistent after layout updates.

### v0.3.0-H1C - Command Extensibility and UX Hardening

- `QLT-037`, `QLT-038`, `QLT-048`, `QLT-052`
- `QLT-039`, `QLT-041`, `QLT-054`
- `QLT-047`, `QLT-040`, `QLT-042`, `QLT-056`
- `QLT-043`, `QLT-053`, `QLT-044`, `QLT-045`, `QLT-050`, `QLT-049`
- `QLT-046`, `QLT-051`, `QLT-055`, `QLT-057`
- `QLT-069`, `QLT-070`

Dependencies:

- `QLT-038` depends on `QLT-037` so command guardrails are enforced on top of persisted command CRUD behavior.
- `QLT-048` depends on `QLT-037` because WS custom-command lifecycle events require a persisted custom-command source.
- `QLT-052` depends on `QLT-037` and should complete before `QLT-047` and `QLT-043` so FE list/autocomplete behavior is deterministic.
- `QLT-039` depends on `QLT-037` and `QLT-038` to ensure `/custom` definition paths align with backend validation and persistence.
- `QLT-041` should run before `QLT-043`, `QLT-045`, and `QLT-053` so slash mode entry is stable before keyboard UX logic.
- `QLT-054` depends on `QLT-039` to harden block-definition delimiter edge cases.
- `QLT-047` depends on `QLT-037`, `QLT-038`, and `QLT-052` for deterministic management command behavior.
- `QLT-040` depends on `QLT-039` and `QLT-047` so execution uses established definition/management behavior.
- `QLT-042` depends on `QLT-040`; `QLT-056` depends on `QLT-042` to harden preview rendering safety and truncation behavior.
- `QLT-043` depends on `QLT-047` and `QLT-052`; `QLT-053` depends on `QLT-043`.
- `QLT-044` depends on `QLT-040`, `QLT-047`, and `QLT-043` for context-aware argument completion.
- `QLT-045` depends on `QLT-041`; `QLT-050` depends on `QLT-045`.
- `QLT-049` should run after `QLT-040` and `QLT-044` so target resolution behavior is reused consistently.
- `QLT-046` depends on `QLT-037` through `QLT-045`; `QLT-051` depends on `QLT-047`, `QLT-048`, `QLT-049`, and `QLT-050`.
- `QLT-055` depends on `QLT-052`, `QLT-053`, and `QLT-054`; `QLT-057` depends on `QLT-041` and `QLT-053`.
- `QLT-069` depends on `QLT-040`, `QLT-049`, and existing command-submit normalization paths so direct input and custom-command execution share one deterministic terminator contract.
- `QLT-070` depends on `QLT-069` and extends regression coverage to submit-mode matrix behavior (`LF`/`CR`/`CRLF`) for shell and TUI command targets.

Exit criteria:

- Custom commands are persisted globally with deterministic naming, sorting, overwrite, and limit behavior.
- `/custom` management (`list`, `show`, `remove`, define inline/block) is implemented with stable command-feedback semantics.
- Custom command execution supports active-session and explicit target routing with deterministic resolver behavior.
- Slash mode boundaries are explicit and keyboard behavior is deterministic (`TAB`, `Shift+TAB`, arrows, `Enter`, repeat shortcut).
- Suggestion list and preview are non-blocking, text-safe, and do not auto-execute commands.
- Multi-client custom-command state synchronization works via WebSocket lifecycle events.
- Command submit semantics are deterministic across supported newline modes and do not require extra manual confirmation keystrokes in TUI workloads.
- Integration/regression coverage exists for all listed custom-command and slash UX edge cases.

### v0.3.0-H1D - Per-Terminal Settings and Theme Personalization

- `QLT-060`, `QLT-061`
- `QLT-058`, `QLT-062`, `QLT-059`
- `QLT-063`
- `QLT-064`
- `QLT-065`
- `QLT-066`
- `QLT-067`
- `QLT-068`
- `QLT-071`

Dependencies:

- `QLT-060` should run first to establish backend contract/persistence for per-session startup settings used by FE forms.
- `QLT-061` depends on `QLT-060` so startup settings are applied consistently during create/restart flows.
- `QLT-058` should run before `QLT-062` and `QLT-059` to establish a stable per-terminal settings entry point (gear icon + panel shell).
- `QLT-062` depends on `QLT-058` and `QLT-060` so FE forms map to finalized backend fields and validation semantics.
- `QLT-059` depends on `QLT-058` and should complete after `QLT-062` to keep rename/delete behavior discoverable inside the settings panel.
- `QLT-063` depends on `QLT-058`; it should run after panel shell exists so per-session color settings stay scoped and deterministic.
- `QLT-065` depends on `QLT-058` and should run before final QA hardening so settings UX behavior is stabilized behind a proper dialog contract.
- `QLT-066` depends on `QLT-060` so full theme profile persistence aligns with finalized per-session backend settings schema.
- `QLT-067` depends on `QLT-063`, `QLT-065`, and `QLT-066` so advanced theme editing lands on top of final dialog UX and persisted theme-profile contract.
- `QLT-064` depends on `QLT-058` through `QLT-063`.
- `QLT-068` depends on `QLT-065` through `QLT-067`.
- `QLT-071` depends on `QLT-069` and `QLT-060` so per-terminal submit-mode controls can reuse deterministic submit behavior and persist within session settings scope.

Exit criteria:

- Every terminal card exposes a dedicated settings icon that opens per-session settings.
- `Rename` and `Delete` actions are available in settings and removed from the direct card toolbar.
- Per-session startup settings (`Working Directory`, `Start Command Line`, `Environment Variables`) are persisted and applied deterministically.
- Per-session color sets are configurable and applied consistently after reload.
- Per-terminal settings use a proper dialog UX with deterministic open/close/save/cancel behavior.
- Full terminal theme profiles (cursor + ANSI palette) are configurable and persisted per session.
- Command submit terminator configuration can be scoped per terminal/session instead of globally.
- Integration/regression coverage exists for per-session settings lifecycle and startup/theme apply behavior.

### v0.3.0-H2 - Enterprise Readiness Backlog

- `ENT-001`, `ENT-004`, `ENT-005`, `ENT-006`, `ENT-007`, `ENT-008`, `ENT-009`, `ENT-011`, `ENT-012`, `ENT-013`, `ENT-014`, `ENT-015`, `ENT-016`, `ENT-018`, `ENT-019`, `ENT-020`, `ENT-021`, `ENT-022`, `ENT-023`, `ENT-024`

Dependencies:

- `ENT-001` should run after `QLT-015` to build on stable API contract behavior.
- `ENT-006` depends on `QLT-007` request-size guard and should be validated by non-functional and security regression coverage.
- `ENT-008` should run after observability-producing changes in `ENT-004` logging baseline.
- `ENT-009` should run after `QLT-009` atomic persistence write hardening.
- `ENT-011` should run before any production deployment cutover.
- `ENT-012` depends on `ENT-005` secrets/key management strategy.
- `ENT-013` should run before `ENT-015` to include hardened runtime evidence in release bundles.
- `ENT-014` depends on `ENT-009` backup/restore mechanics.
- `ENT-015` depends on `ENT-007` security scanning artifacts.
- `ENT-016` should run with `ENT-011` to align transport and header-level security posture.
- `ENT-018` should run with `ENT-011` to keep HTTPS/WSS ingress and certificate handling aligned.
- `ENT-019` depends on `ENT-018` ingress topology.
- `ENT-020` depends on `ENT-006` abuse-control baseline and should be validated by `ENT-022`.
- `ENT-021` should run before `ENT-008` alerting implementation to provide metric signals.
- `ENT-022` depends on `ENT-020` and should run after `ENT-021` metric instrumentation for measurable thresholds.
- `ENT-023` should run before production hardening tasks to prevent invalid runtime config drift.
- `ENT-024` depends on `ENT-004` and `ENT-009` to align session/log retention behavior.

Exit criteria:

- Audit logs and operational logs are structured, correlated, and retention-governed.
- Security scanning and SBOM generation are active in CI.
- SLOs and alerting are defined and documented.
- Backup/restore is automated and periodically verified.
- Security and isolation tests are automated and passing.
- TLS-only production ingress and certificate operations are enforced.
- At-rest encryption and key rotation are implemented for persistence data.
- Runtime least-privilege profile is implemented and documented.
- Disaster recovery drills are automated and measured against RTO/RPO.
- Release evidence bundle is generated for audit/compliance traceability.
- Reverse-proxy deployment guidance exists for provider-agnostic HTTPS/WSS host routing.
- Trusted proxy handling is explicitly configured and validated.
- Session guardrail policies (concurrency/idle/lifetime) are enforced and tested.
- Monitoring metrics are exposed and consumed by alerting baselines.
- Load and fanout non-functional thresholds are automated and tracked.
- Runtime configuration fails fast on invalid critical env values.
- Data retention and purge policies are automated and documented.

### v0.3.0-H3 - Tag-Based Multi-Target Control

- `QLT-072`
- `QLT-073`
- `QLT-074`
- `QLT-075`
- `QLT-076`
- `QLT-077`

Completed in this milestone:

- `QLT-072`, `QLT-073`, `QLT-074`, `QLT-075`, `QLT-076`, `QLT-077`

Remaining in this milestone:

- none

Dependencies:

- `QLT-073` depends on `QLT-072` so frontend tag editing maps to finalized backend session-tag contract and persistence behavior.
- `QLT-074` depends on `QLT-072` and `QLT-073` so multi-target command resolution can use persisted tags from backend and visible FE state.
- `QLT-076` depends on `QLT-072` and existing per-session settings contract so slash-command setting updates can reuse one canonical settings schema.
- `QLT-075` depends on `QLT-072` through `QLT-074` and validates overlap-dedupe plus tag/ID coexistence semantics end to end.
- `QLT-077` depends on `QLT-073`, `QLT-074`, and `QLT-076` to verify settings-dialog/slash parity and multi-target semantics together.

Exit criteria:

- Sessions support persisted tags via API/runtime model and frontend settings.
- Multi-target control actions can address sessions via IDs, quick IDs, names, and tags in one command flow.
- Overlapping selectors (for example tag + ID hitting the same session) execute once per session ID (no duplicate execution).
- No conflict rejection is performed for tag-vs-ID token collisions; both selector types remain valid identifiers.
- All per-terminal settings from the settings dialog are also available via slash commands with matching validation and persistence behavior.
- Regression coverage exists for dedupe and deterministic multi-target execution semantics.

### v0.3.0-H4 - Rename Targeting Parity

- `QLT-078`
- `QLT-079`

Completed in this milestone:

- `QLT-078`, `QLT-079`

Remaining in this milestone:

- none

Dependencies:

- `QLT-078` depends on existing selector resolution semantics from `QLT-074` and slash settings parity baseline from `QLT-076`.
- `QLT-079` depends on `QLT-078` and validates active shorthand compatibility plus selector-based rename execution behavior.

Exit criteria:

- Slash rename supports both `/rename <name>` (active session) and `/rename <selector> <name>` (explicit target).
- Rename selector semantics align with existing target resolution behavior and require exactly one resolved target session.
- Help text and autocomplete paths remain consistent with the updated rename syntax.
- Regression coverage exists for active/session-target rename behavior and deterministic command feedback.

### v0.3.0-H5 - Restart Durability and Local-Only Delivery Flow

- `QLT-080`
- `QLT-081`
- `QLT-082`
- `PLAT-011`

Completed in this milestone:

- `QLT-080`, `QLT-081`, `QLT-082`, `QLT-094`, `PLAT-011`

Remaining in this milestone:

- none

Dependencies:

- `QLT-081` depends on `QLT-080` so FE can render backend-provided unrestored-session state deterministically.
- `QLT-082` depends on `QLT-080` and `QLT-081` to validate runtime durability and FE visibility/behavior for unrestored sessions.
- `QLT-094` depends on `QLT-082` and stabilizes environment-dependent restore-fallback race behavior in backend integration tests.
- `PLAT-011` is independent of `QLT-080` ... `QLT-082` and can run in parallel, but must complete before enforcing local-only delivery policy in docs/process gates.

Exit criteria:

- Unrestored persisted sessions are visible via API and are not silently dropped from operator view.
- FE communicates unrestored state explicitly and prevents invalid interactive operations on unrestored sessions.
- Regression tests cover repeated restart durability for unrestored sessions and FE rendering semantics.
- Restore-fallback regression tests are deterministic across environments (no short-lived restored-session `404` race in integration assertions).
- Local-only quality gate flow is documented and aligns with disabled remote-runner CI configuration.

### v0.3.0-H6 - Deck Isolation and Multi-Deck Control Plane

- `QLT-083`
- `QLT-084`
- `QLT-085`
- `QLT-086`
- `QLT-087`
- `QLT-088`
- `QLT-089`
- `QLT-090`
- `QLT-091`
- `QLT-092`
- `QLT-093`

Completed in this milestone:

- `QLT-083`, `QLT-084`, `QLT-085`, `QLT-086`, `QLT-087`, `QLT-088`, `QLT-089`, `QLT-090`, `QLT-091`, `QLT-092`, `QLT-093`

Remaining in this milestone:

- none

Dependencies:

- `QLT-084` depends on `QLT-083` (deck domain contract).
- `QLT-085` depends on `QLT-083` and `QLT-084` (OpenAPI/REST must align with persisted deck model).
- `QLT-086` depends on `QLT-084` and `QLT-085` (deck-aware list/get semantics on top of deck model + routes).
- `QLT-087` depends on `QLT-085` (conflict-safe deck lifecycle and move semantics in backend routes).
- `QLT-088` depends on `QLT-085` (frontend tab/navigation against deck CRUD APIs).
- `QLT-089` depends on `QLT-086` and `QLT-088` (active-deck-scoped rendering and active-session fallback behavior).
- `QLT-090` depends on `QLT-085` and `QLT-088` (slash command control surface for deck operations).
- `QLT-091` depends on `QLT-089` and `QLT-090` (deck-aware selector/routing semantics).
- `QLT-092` depends on `QLT-091` (dedupe guarantees across overlapping selectors).
- `QLT-093` depends on `QLT-087`, `QLT-089`, `QLT-091`, and `QLT-092` (end-to-end regression matrix).

Exit criteria:

- Decks exist as isolated terminal groups with deterministic active-deck behavior.
- Session operations are deck-aware and do not perform implicit cross-deck mutations.
- Deck-level conflicts (delete/move/selector overlap) produce deterministic behavior and explicit errors.
- Per-deck settings baseline (terminal geometry) persists and applies independently.
- Deck and move slash commands behave consistently with UI actions.
- Regression coverage validates migration, isolation semantics, and multi-selector dedupe guarantees.

### v0.3.0-H7 - Frontend State Correctness and Architecture Consolidation

- `QLT-095`
- `QLT-096`
- `QLT-097`
- `QLT-098`
- `QLT-099`
- `QLT-100`
- `QLT-101`
- `QLT-102`
- `QLT-103`
- `QLT-104`
- `QLT-105`
- `QLT-106`
- `QLT-107`
- `QLT-108`
- `QLT-109`

Completed in this milestone:

- `QLT-095`, `QLT-096`, `QLT-097`, `QLT-098`, `QLT-099`, `QLT-100`, `QLT-101`, `QLT-102`, `QLT-103`, `QLT-104`, `QLT-105`, `QLT-106`, `QLT-107`, `QLT-108`, `QLT-109`

Remaining in this milestone:

- none

Dependencies:

- `QLT-096` depends on `QLT-095` so exit-state lifecycle assertions target finalized FE state behavior.
- `QLT-098` depends on `QLT-097` so regression coverage targets the WebSocket-first custom-command state model instead of the mixed REST/WS path.
- `QLT-099` should complete before `QLT-100` so xterm compatibility boundaries are defined before broader FE modularization.
- `QLT-100` depends on `QLT-095`, `QLT-097`, and `QLT-099` so module extraction lands on top of corrected lifecycle handling, corrected command-state flow, and isolated xterm internals.
- `QLT-101` depends on existing selector resolution semantics from H6 so `>selector` uses the same single-session token rules as active-session switching and can auto-switch decks deterministically.
- `QLT-102` depends on deck/sidebar navigation baseline from H6 and should reuse the same active-session/deck switching path as `QLT-101` rather than inventing a second focus model.
- `QLT-103` depends on `QLT-101` and `QLT-102` and validates that quick-switch commands and sidebar terminal buttons stay behaviorally aligned.
- `QLT-104` depends on `QLT-101` so deck-targeted `>...` semantics build on the same quick-switch parser and target-resolution path instead of forking a separate implementation.
- `QLT-105` depends on `QLT-101` and `QLT-104` so autocomplete breadth is designed against the final `>...` grammar and can stay aligned with existing `/...` completion behavior.
- `QLT-106` depends on `QLT-101` and `QLT-104` so `>...` selector semantics remain aligned with the final quick-switch grammar for both direct terminal and deck-scoped targets.
- `QLT-107` depends on `QLT-101`, `QLT-104`, `QLT-105`, and `QLT-106` so inline quick-switch preview/feedback is built on top of the finalized `>...` selector grammar, target types, and autocomplete behavior instead of duplicating early resolution logic.
- `QLT-108` depends on the existing hidden-deck viewport-recovery baseline from H6/H7 and should complete before related render-architecture cleanup so scroll-state repair is validated against current runtime behavior first.
- `QLT-109` depends on `QLT-108` so regression coverage targets the finalized hidden-session scroll-recovery behavior instead of current stale-viewport semantics.

Exit criteria:

- Frontend handles `session.exit` deterministically with explicit exited-session UX and post-exit guardrails.
- Custom-command runtime state is WebSocket-first in steady-state frontend flows.
- xterm private/internal access is isolated behind one compatibility boundary.
- `frontend/src/public/app.js` is decomposed into layered modules without behavior regression.
- Quick terminal switching supports `>selector` command syntax with deck auto-switch when needed.
- Sidebar deck sections expose clickable terminal entries with visible quick IDs and deterministic active-terminal focus behavior.
- `>...` quick-switching can resolve both terminals and decks, with deterministic deck-name autocomplete.
- Autocomplete coverage is consistent across `/...` and `>...` navigation-related flows where deterministic suggestions are possible.
- `>...` quick-switching reuses `/switch` selector semantics instead of introducing a second incompatible navigation grammar.
- `>...` quick-switching exposes inline resolved-target preview and explicit ambiguity/no-match/no-op feedback before activation.
- Hidden sessions that receive output while invisible recover a correct scrollable viewport when shown again, including bottom-content reachability after background growth.

### v0.3.0-H8 - Terminal Search UX

- `QLT-110`
- `QLT-111`

Dependencies:

- `QLT-110` depends on `QLT-100` so search/find UX lands on top of the decomposed FE command/state/view structure instead of deepening the current `app.js` monolith.
- `QLT-111` depends on `QLT-110` so regression coverage targets the finalized search/find interaction model rather than an intermediate UI contract.

Exit criteria:

- Active terminals support deterministic output search with explicit next/previous navigation.
- Search feedback distinguishes between match, wraparound, and no-match states without mutating PTY output.
- Search behavior remains correct across deck/session switching and buffer growth.

### v0.3.0-H9 - Declarative Command Autocomplete

- `QLT-112`
- `QLT-113`
- `QLT-114`
- `QLT-115`

Dependencies:

- `QLT-112` should land first so command completion behavior is defined from explicit specs instead of continuing to spread hardcoded parser metadata across the FE runtime.
- `QLT-113` depends on `QLT-112` so contextual suggestion providers plug into one declarative command/argument contract instead of introducing a second autocomplete model.
- `QLT-114` depends on `QLT-112` and `QLT-113` so richer suggestion metadata and inline presentation are designed against the finalized suggestion payload shape.
- `QLT-115` depends on `QLT-112`, `QLT-113`, and `QLT-114` so regression coverage targets the final declarative/generator-backed autocomplete behavior rather than an intermediate contract.

Exit criteria:

- Slash and quick-switch autocomplete are driven by declarative command and argument specs instead of scattered hardcoded runtime branches.
- Contextual argument suggestions can be generated from live FE state via bounded-latency providers without mutating runtime state during typing.
- Inline autocomplete feedback can expose richer metadata while preserving deterministic keyboard-first behavior and explicit fallback semantics.

### v0.3.0-H10 - Runtime Metadata Event Consistency

- `QLT-116`
- `QLT-117`
- `QLT-118`

Completed in this milestone:

- `QLT-116`, `QLT-117`, `QLT-118`

Remaining in this milestone:

- none

Dependencies:

- `QLT-116` should land first so the backend exposes authoritative WebSocket events for session and deck metadata changes instead of leaving connected clients dependent on local mutation responses only.
- `QLT-117` depends on `QLT-116` so the frontend reducer/event-application path can consume a complete runtime event surface rather than inventing client-only patch semantics for missing events.
- `QLT-117` should follow `QLT-112` ... `QLT-114` so command/autocomplete structural cleanup lands before broader runtime-state event consolidation touches the same frontend orchestration code.
- `QLT-118` depends on `QLT-116` and `QLT-117` so regression coverage targets the finalized backend event model and frontend reducer flow instead of intermediate partial behavior.

Exit criteria:

- Backend emits authoritative metadata events for live session/deck changes that matter to connected clients.
- Frontend applies runtime metadata updates through one explicit event/reducer path instead of scattered local mutation handlers.
- Multi-client runtime state stays consistent across session rename/settings updates, deck mutations, session moves, and reconnect snapshot replacement.

### v0.3.0-H11 - Runtime Store and Contract Hardening

- `QLT-119`
- `QLT-120`
- `QLT-121`
- `QLT-122`

Dependencies:

- `QLT-119` should land first so runtime state transitions for sessions, decks, custom commands, connection state, and related derived metadata move behind one pure reducer/store boundary instead of remaining partially embedded in `app.js`.
- `QLT-120` depends on `QLT-119` and `QLT-116` ... `QLT-118` so WebSocket-authoritative bootstrap/reconnect behavior builds on the now-complete metadata event surface plus an extracted reducer/store implementation.
- `QLT-121` depends on `QLT-119` and `QLT-120` so regression coverage targets the final reducer-backed WS-authoritative runtime flow instead of transitional mixed-state behavior.
- `QLT-122` should follow `QLT-120` so FE/BE contract regression checks are written against the finalized runtime payload expectations and OpenAPI-aligned FE surfaces.

Exit criteria:

- Frontend runtime state for sessions, decks, and custom commands is applied through a dedicated reducer/store module instead of scattered inline mutation logic.
- Bootstrap and reconnect hydration are WebSocket-authoritative for runtime domains already represented in snapshots/events.
- Regression coverage validates reducer-backed state consistency and mixed local/remote event ordering behavior.
- Automated FE/BE contract checks protect OpenAPI/runtime payload alignment for sessions, decks, and custom commands.

### v0.3.0-H12 - Explicit Session Lifecycle Modeling

- `LIF-001`
- `LIF-002`
- `LIF-003`
- `LIF-004`
- `LIF-005`
- `LIF-006`

Dependencies:

- `LIF-001` should land first so backend runtime events expose an explicit lifecycle contract for startup/running state instead of leaving frontend state to infer process liveness indirectly from partial output or reconnect timing.
- `LIF-002` depends on `LIF-001` and `QLT-119` ... `QLT-122` so the formal FE lifecycle model lands on top of the extracted reducer/store boundary plus the now-authoritative runtime bootstrap/event path.
- `LIF-003` depends on `LIF-002` so derived `busy` / `idle` semantics extend the explicit lifecycle model rather than introducing a parallel heuristic-only state system.
- `LIF-004` depends on `LIF-001`, `LIF-002`, and `LIF-003` so regression coverage targets the finalized ordered lifecycle transitions, reconnect replacement behavior, and post-exit guardrails.
- `LIF-005` depends on `LIF-001` so sidebar session buttons can expose a normalized runtime-activity baseline without waiting on the full FE state-machine formalization.
- `LIF-006` depends on `LIF-005` and should validate live-vs-unseen indicator transitions plus clear-on-activation semantics.

Exit criteria:

- Backend runtime events expose a deterministic startup/running lifecycle contract plus stable exit metadata.
- Frontend runtime state models ordered lifecycle transitions explicitly instead of relying on special-case `exited` handling only.
- Derived activity state (`busy` / `idle`) is computed on top of the formal lifecycle model without conflating UI heuristics and process liveness.
- Regression coverage protects ordered lifecycle transitions, reconnect semantics, and invalid post-exit interactions.
- Sidebar deck/session navigation exposes subtle live and unseen activity indicators so background terminal output is visible without opening each session.

### v0.3.0-H13 - Stream Interpretation Foundation

- `ARC-003`
- `ARC-004`
- `ARC-005`
- `ARC-006`
- `ARC-007`
- `ARC-008`

Completed in this milestone so far:

- `ARC-003`
- `ARC-004`
- `ARC-005`
- `ARC-006`
- `ARC-007`
- `ARC-008`

Remaining in this milestone:

- none

Dependencies:

- `ARC-003` depends on `QLT-100`, `QLT-119` ... `QLT-122`, and `LIF-002` ... `LIF-004` so stream normalization lands on top of the decomposed frontend runtime, reducer-backed state flow, and explicit lifecycle/activity semantics.
- `ARC-004` depends on `ARC-003` so plugins consume one deterministic normalized stream surface rather than raw PTY chunk heuristics.
- `ARC-005` depends on `ARC-004` and `QLT-117` so plugin output reuses declarative runtime-event/update paths instead of mutating UI state ad hoc.
- `ARC-006` depends on `ARC-003`, `ARC-004`, and `ARC-005` so built-in detectors are implemented on top of the final adapter and action-dispatch contract.
- `ARC-007` depends on `ARC-005` and `ARC-006` so extracted artifacts share the same declarative state/update model as status and attention signals.
- `ARC-008` depends on `ARC-003` ... `ARC-007` so regression coverage targets the finalized normalization, plugin, and artifact-dispatch behavior.

Exit criteria:

- Frontend PTY stream handling is normalized through an explicit session-scoped adapter boundary (`onData`, `onLine`, `onIdle`) instead of raw UI-time parsing.
- A deterministic plugin-engine registry exists with explicit lifecycle, ordering, and side-effect guardrails.
- Plugin output is constrained to a declarative interpretation-action contract routed through existing runtime/store update paths.
- Built-in stream interpreters cover active-processing detection, prompt/idle recovery, and explicit attention/error signaling.
- Artifact-oriented interpretation is available without polluting raw terminal output.
- Regression coverage protects normalization, plugin ordering/conflict handling, hidden-session behavior, and declarative action dispatch determinism.

### v0.3.0-H14 - Activity Completion Notifications

- `LIF-007`
- `LIF-008`
- `LIF-009`

Completed in this milestone so far:

- `LIF-007`
- `LIF-008`
- `LIF-009`

Remaining in this milestone:

- none

Dependencies:

- `LIF-007` depends on `LIF-001` ... `LIF-004` so backend-persisted activity-completion signaling builds on the formal lifecycle baseline instead of ad hoc UI-local transitions.
- `LIF-008` depends on `LIF-007` so browser notifications trigger only from authoritative post-persist activity-completion events, and should reuse the current session/deck runtime store path without duplicate local inference.
- `LIF-009` depends on `LIF-007` and `LIF-008` so regression coverage validates exactly-once semantics, aggregation, permission-denied no-op behavior, and reconnect/update churn on top of the final backend/FE contract.

Exit criteria:

- Backend exposes an authoritative persisted activity-completion signal for session transitions from active to inactive.
- Frontend emits standard browser notifications exactly once per persisted active-to-inactive transition without throwing when notifications are unsupported or denied.
- Multiple completions inside the configured aggregation window can be collapsed into one deterministic notification payload.
- Regression coverage protects no-duplicate semantics, aggregation behavior, and permission-safe failure handling.

## Current Status

- Latest completed milestone: `v0.4.0-H14` (Frontend Quick-ID Swap Command)
- Next milestone in progress: none currently
- Queued next milestone: none currently
- Blockers: none currently

### Active Open Tasks (Execution Queue)

- `QLT-139`

### v0.3.0-H15 - Auth Transport and Mode Hardening

- `ENT-026`
- `ENT-027`
- `ENT-028`

Completed in this milestone so far:

- `ENT-026`
- `ENT-027`
- `ENT-028`

Remaining in this milestone:

- none

Dependencies:

- `ENT-026` depends on the existing auth baseline so WebSocket authentication can move off query-string transport without regressing current REST/WS access behavior.
- `ENT-027` depends on the current `AUTH_MODE=dev` baseline and should land with explicit runtime validation so insecure production-like combinations fail fast instead of silently falling back.
- `ENT-028` depends on `ENT-026` and `ENT-027` so regression coverage validates the final handshake/auth-mode contract rather than a transient intermediate transport.

Exit criteria:

- WebSocket authentication no longer requires query-string token transport in steady state.
- Dev-token issuance is explicitly gated to development mode and unavailable in production mode.
- Runtime configuration rejects insecure production auth combinations deterministically.
- Regression coverage protects token-transport hardening, auth-mode gating, and token-leak prevention in observable client/runtime surfaces.

### v0.4.0-H1 - Observability Expansion

- `OBS-001`
- `OBS-002`
- `OBS-003`
- `OBS-004`

Completed in this milestone:

- `OBS-001`
- `OBS-002`
- `OBS-003`
- `OBS-004`

Remaining in this milestone:

- none

Dependencies:

- `OBS-002` depends on `OBS-001` so derived latency/quality aggregations are built on top of stable metric naming and lifecycle signal definitions.
- `OBS-003` depends on `OBS-001` and `OBS-002` so deployment guidance and dashboard/alert recommendations reflect actual emitted metric contracts.
- `OBS-004` depends on `OBS-001` and `OBS-002`, and should run alongside `OBS-003` to lock the documented metric surface to tested runtime behavior.

Exit criteria:

- Backend `/metrics` exposes explicit lifecycle and connection-quality signals with stable names.
- REST and WS quality signals include bounded latency/reconnect/error visibility suitable for local operations.
- Deployment/quality-gate docs define a concrete observability baseline for scrape, panel, and alert wiring.
- Regression coverage guards observability contract stability and runtime counter/gauge behavior.

### v0.4.0-H2 - Layered Frontend Architecture Completion

- `ARC-009`
- `ARC-010A`
- `ARC-010B`
- `ARC-010C`
- `ARC-010D`
- `ARC-011`
- `ARC-012`

Completed in this milestone so far:

- `ARC-009`
- `ARC-010A`
- `ARC-010B`
- `ARC-010C`
- `ARC-010D`
- `ARC-011`
- `ARC-012`

Remaining in this milestone:

- none

Dependencies:

- `ARC-010A` depends on `ARC-009` and is completed; the last app-level command/UI delegation glue is now extracted on top of stabilized command/runtime boundaries.
- `ARC-010B` depended on `ARC-010A` and is completed; startup/bootstrap composition wiring now lives in `frontend/src/public/app-bootstrap-composition-controller.js`, so `frontend/src/public/app.js` no longer owns the hidden runtime-assembly cluster.
- `ARC-010C` depended on `ARC-010A` and `ARC-010B` and is completed; `frontend/src/public/app.js` is now reduced to top-level startup/error-boundary code while the former inline runtime assembly lives in `frontend/src/public/app-runtime-composition-controller.js`.
- `ARC-010D` depended on `ARC-010A`, `ARC-010B`, and `ARC-010C` and is completed; explicit architecture closeout regression coverage now locks `frontend/src/public/app.js` to a bootstrap-only entrypoint and guards delegated runtime assembly in dedicated modules.
- `ARC-011` depends on `ARC-009` and completion of `ARC-010A` ... `ARC-010D` to enforce layer contracts after extraction points are final.
- `ARC-012` depends on `ARC-009`, completion of `ARC-010A` ... `ARC-010D`, and `ARC-011` so architecture-regression coverage validates the final boundary model.

Exit criteria:

- App-level command/UI delegation wrappers are extracted into explicit composition-facing controllers/facades.
- Remaining startup/bootstrap composition wiring is extracted so `app.js` no longer owns hidden orchestration clusters.
- Remaining inline/dead orchestration logic is removed from `app.js`, leaving it as a bootstrap/composition boundary only.
- Closeout regression coverage proves the final ARC-010 target shape instead of relying on informal interpretation.
- Cross-layer shortcut paths are removed so stream/interpretation/state/UI boundaries are explicit and enforceable.
- Regression coverage protects architectural boundaries against future monolith regressions.

### v0.4.0-H3 - Terminal Interaction Ergonomics

- `QLT-123`
- `QLT-124`

Completed in this milestone so far:

- `QLT-123`
- `QLT-124`

Remaining in this milestone:

- none

Dependencies:

- `QLT-123` ran after `ARC-010` so copy/paste interaction handling could be integrated on top of cleaner UI boundaries instead of deepening `app.js` coupling.
- `QLT-124` ran after `QLT-123` so terminal-header UX/layout improvements aligned with the finalized interaction model and avoided duplicate churn in session-card wiring.

Exit criteria:

- Terminal sessions and command-input box share a consistent system-clipboard-only copy/paste UX contract (left-drag + `Enter` copy, middle-click paste, right-click keeps default system context menu).
- No separate primary-selection clipboard model is introduced; behavior remains deterministic against system clipboard APIs.
- Terminal-session header implementation is structurally simplified and UX-optimized without removing current semantic header elements.
- Regression coverage protects copy/paste interaction behavior and header rendering/interaction stability.

### v0.4.0-H4 - Declarative Command Contract

- `DRV-003A`
- `DRV-003B`
- `DRV-003C`
- `DRV-004`

Completed in this milestone so far:

- `DRV-003A`
- `DRV-003B`
- `DRV-003C`
- `DRV-004`

Remaining in this milestone:

- none

Dependencies:

- `DRV-003A` should run first so command-definition metadata has one explicit source of truth before additional command-surface rewiring happens.
- `DRV-003B` depends on `DRV-003A` so autocomplete and command-engine parsing consume the same declarative command contract instead of duplicating definitions.
- `DRV-003C` depends on `DRV-003A` and `DRV-003B` so help text and validation-facing command surfaces can be proven to derive from the finalized schema/registry contract.
- `DRV-004` depends on completion of `DRV-003A` through `DRV-003C` so command-to-output correlation can attach to stable command identities and declarative metadata instead of transient parser-side strings.

Exit criteria:

- Slash-command metadata lives in one explicit declarative schema/registry contract instead of being split across completion/runtime modules.
- Command completion and command-engine parsing consume the shared schema contract for names, labels, subcommands, and argument-provider metadata.
- Help and validation-facing command surfaces derive from the same declarative contract and are protected by regression coverage.
- The follow-up command-to-output correlation task can build on stable command identities and metadata instead of duplicated ad-hoc command definitions.
- Command submissions now persist explicit per-session correlation records that are enriched by downstream output/activity/stream-interpretation actions for traceable operator context without re-coupling UI modules to stream internals.

### v0.4.0-H5 - Stream Activity Noise Filtering

- `QLT-125`

Completed in this milestone so far:

- `QLT-125`

Remaining in this milestone:

- none

Dependencies:

- `QLT-125` runs after `DRV-004` so the existing stream-interpretation and command-correlation surfaces are available while tightening activity semantics around empty/no-op stream chunks.

Exit criteria:

- Inactive sessions are not marked as newly active by empty, redraw-only, transport-only, or otherwise semantically no-op stream updates.
- Activity tracking continues to react to meaningful terminal output without regressing existing status/progress/plugin interpretation behavior.
- Regression coverage demonstrates the difference between meaningful output chunks and ignorable no-op stream noise.

### v0.4.0-H6 - Startup Warmup Gate and Bootstrap Deferral

- `QLT-126`
- `QLT-127`

Completed in this milestone so far:

- `QLT-126`
- `QLT-127`

Remaining in this milestone:

- none

Dependencies:

- `QLT-126` ran after `QLT-125` so backend startup readiness did not depend on semantically empty activity noise that should already be filtered out of session-activity semantics.
- `QLT-127` depended on `QLT-126` so frontend bootstrap deferral and the operator skip affordance consumed one explicit backend warmup-state contract instead of inferring readiness from ad-hoc startup timing heuristics.

Exit criteria:

- Backend exposes one explicit startup warmup state indicating that persisted sessions are still being brought back after server boot.
- The backend warmup state remains active until no session has been in the active state for one continuous second after startup.
- Frontend delays normal bootstrap while the backend warmup state is active and offers an explicit user-controlled skip path.
- Frontend starts automatically once the warmup state clears, without requiring a manual reload after the server finishes session startup.
- Regression coverage demonstrates backend warmup-state transitions, frontend wait/skip behavior, and automatic bootstrap handoff when startup settles.

### v0.4.0-H7 - WebSocket Origin Allowlist Enforcement

- `ENT-017`

Completed in this milestone so far:

- `ENT-017`

Remaining in this milestone:

- none

Dependencies:

- `ENT-017` runs after `v0.4.0-H6` so the restart-recovery bootstrap contract is already stable before tightening WebSocket browser-origin admission semantics on the upgrade path.

Exit criteria:

- WebSocket upgrade requests are checked against the configured origin allowlist before the connection is accepted.
- Missing or disallowed upgrade origins are rejected with an explicit unauthorized-origin error contract instead of silently proceeding.
- Explicitly allowed origins continue to connect successfully without regressing existing TLS, auth-ticket, or reconnect behavior.
- Regression coverage demonstrates allowed, missing, and disallowed WebSocket origin behavior on the upgrade path.

### v0.4.0-H8 - Script Execution Traceability

- `QLT-128`

Completed in this milestone so far:

- `QLT-128`

Remaining in this milestone:

- none

Dependencies:

- `QLT-128` runs after `v0.4.0-H7` so the recent platform/security hardening baseline is already stable before adding root-script execution logging and enforcement into the local quality gate.

Exit criteria:

- Every top-level executable under `scripts/` emits one standardized startup log line so future runtime usage can be observed without inspecting implementation details.
- One checker verifies that every top-level `scripts/*.sh` and `scripts/*.mjs` file declares that startup log line near the beginning of the file.
- The checker is wired into the normal local lint gate so missing script logging cannot drift back in silently.

### v0.4.0-H9 - Invisible Stream Activity Filtering Hardening

- `QLT-129`

Completed in this milestone so far:

- `QLT-129`

Remaining in this milestone:

- none

Dependencies:

- `QLT-129` runs after `v0.4.0-H8` so the script-traceability baseline remains intact while the frontend activity detector is hardened against invisible control-sequence noise.

Exit criteria:

- Invisible terminal-control-only or formatting-only stream updates no longer re-mark inactive sessions as active.
- Frontend activity filtering strips broader DEC/charset/DCS/OSC/C1/zero-width non-visible stream updates before emitting an activity bump.
- Regression coverage proves invisible redraw/control chunks still render safely but do not produce new activity markers.

### v0.4.0-H13 - Attention Header Text Silence

- `QLT-133`

Completed in this milestone so far:

- `QLT-133`

Remaining in this milestone:

- none

Dependencies:

- `QLT-133` runs after `v0.4.0-H12` so the existing suppression of high-frequency activity-status header churn and the default-silent notification baseline remain intact while the last remaining attention/error status writer is removed from the session-header text path.

Exit criteria:

- Error/attention interpretation still marks the session as `attention`.
- Browser notification behavior remains unchanged from `v0.4.0-H12` (default silent).
- Arbitrary attention/error source lines no longer populate `.session-status-text`.
- Regression coverage proves that attention styling survives while the session-header text remains empty for attention/error stream lines.

### v0.4.0-H14 - Frontend Quick-ID Swap Command

- `QLT-134`

Completed in this milestone so far:

- `QLT-134`

Remaining in this milestone:

- none

Dependencies:

- `QLT-134` runs after `v0.4.0-H13` so the session-header silence baseline is already stable before reintroducing any quick-ID-focused operator ergonomics in the frontend command plane.

Exit criteria:

- `/swap <selectorA> <selectorB>` is available in the frontend slash-command plane.
- Both selectors must resolve to exactly one session each using existing selector semantics.
- Quick-ID swaps remain frontend-local and are not persisted to the backend.
- Regression coverage proves runtime swap behavior, schema/help exposure, executor feedback, and live UI rerendering.

### v0.4.0-H15 - Persistent Session Notes

- `QLT-135`
- `QLT-136`

Completed in this milestone so far:

- `QLT-135`
- `QLT-136`

Remaining in this milestone:

- none

Dependencies:

- `QLT-135` runs first so the persisted session-note field exists in the backend REST/WS/session contract before any frontend note-management UX depends on it.
- `QLT-136` depends on `QLT-135` so `/note` command behavior and header rendering operate on an authoritative persisted note source instead of a frontend-local shadow state.

Exit criteria:

- Every session supports exactly one persisted note or none.
- Empty note writes clear an existing note deterministically.
- The frontend command plane exposes `/note` for session-note set/clear behavior using existing selector semantics.
- The terminal-session header renders the note in a compact small-font presentation without changing the existing one-note-per-session rule.
- Regression coverage proves backend persistence/transport behavior and frontend command/header rendering behavior.

### v0.4.0-H16 - Target Clarity and Send Safety

- `QLT-137`
- `QLT-138`
- `QLT-139`

Completed in this milestone so far:

- `QLT-137`
- `QLT-138`
- `QLT-139`

Remaining in this milestone:

- none

Dependencies:

- `QLT-137` runs first so active-target visibility and attention-state visibility stop competing for the same primary border signal before more send-safety UX depends on those cues.
- `QLT-138` runs after `QLT-137` and establishes the persisted per-session safety-profile contract that the frontend guardrails can rely on.
- `QLT-139` depends on `QLT-137` and `QLT-138` so composer-side send guardrails use both the clarified target visuals and the persisted per-session safety-profile source of truth.
- Parser-backed shell-syntax validation in `QLT-139` is scoped to opt-in shell profiles only; syntax validation is a send-gating signal, but not a replacement for separate dangerous-command or target-switch confirmation rules.

Exit criteria:

- Active target and attention/unread state are visually distinct and can be understood simultaneously on cards and in the deck list; the session-card border is reserved for active green only, and attention no longer claims its own orange border state.
- Each session can persist a per-terminal input-safety profile instead of relying on one global guard policy, with explicit fields for shell-syntax gating, incomplete-shell confirmation, natural-language confirmation, dangerous-command confirmation, multiline confirmation, recent-target-switch confirmation, and supporting timing/size thresholds.
- The frontend exposes at least the presets `off`, `shell_syntax_gated`, `shell_balanced`, `shell_strict`, and `agent`, with deterministic mappings onto the persisted profile fields.
- The first frontend safety mechanisms are configurable per terminal and include all of the following: parser-backed valid-shell-syntax gating for opted-in shell sessions, explicit confirmation for incomplete shell constructs, confirmation for likely natural-language input sent to shell sessions, confirmation for dangerous shell commands, confirmation for multiline or oversized pasted input, and confirmation after a recent target switch.
- Invalid or incomplete shell syntax does not hard-block input forever; the user can still send once after an explicit confirmation so interactive shell continuation workflows remain possible.
- Regression coverage proves the clarified target semantics and the first per-session send-safety flows.

### Completed Items

- `DOC-001`, `DOC-002`
- `BE-001` ... `BE-019`
- `FE-001` ... `FE-014`
- `INT-001` ... `INT-010`
- `QLT-001`, `QLT-002`, `QLT-004`
- `QLT-003`
- `QLT-010`
- `QLT-011`, `QLT-012`
- `QLT-013`
- `QLT-006`
- `QLT-005`
- `QLT-007`
- `QLT-008`, `QLT-009`
- `QLT-014`
- `QLT-015`
- `QLT-016`
- `QLT-017`
- `QLT-018`
- `QLT-019`, `QLT-020`
- `QLT-021`
- `QLT-022`
- `QLT-023`
- `QLT-024`
- `QLT-025`
- `QLT-026`
- `QLT-027`
- `QLT-028`, `QLT-029`, `QLT-030`, `QLT-031`, `QLT-032`, `QLT-033`, `QLT-034`
- `QLT-035`
- `QLT-036`
- `QLT-037`
- `QLT-038`
- `QLT-039`
- `QLT-040`
- `QLT-041`
- `QLT-042`
- `QLT-043`
- `QLT-044`
- `QLT-045`
- `QLT-050`
- `QLT-069`
- `QLT-047`
- `QLT-052`
- `QLT-048`
- `QLT-060`, `QLT-061`
- `QLT-062`
- `QLT-058`, `QLT-059`, `QLT-063`
- `QLT-064`
- `QLT-065`
- `QLT-066`
- `QLT-067`
- `QLT-071`
- `QLT-068`
- `QLT-046`
- `QLT-049`
- `QLT-051`
- `QLT-053`
- `QLT-054`
- `QLT-055`
- `QLT-056`
- `QLT-057`
- `QLT-070`
- `QLT-072`
- `QLT-073`
- `QLT-074`
- `QLT-075`
- `QLT-076`
- `QLT-077`
- `QLT-078`
- `QLT-079`
- `QLT-080`
- `QLT-081`
- `QLT-082`
- `QLT-094`
- `QLT-083`
- `QLT-084`
- `QLT-085`
- `QLT-086`
- `QLT-087`
- `QLT-088`
- `QLT-089`
- `QLT-090`
- `QLT-091`
- `QLT-092`
- `QLT-093`
- `QLT-095`
- `QLT-096`
- `QLT-128`
- `QLT-129`
- `QLT-130`
- `QLT-131`
- `QLT-132`
- `QLT-133`
- `QLT-134`
- `PLAT-011`
- `ENT-001`, `ENT-004`, `ENT-005`, `ENT-006`, `ENT-007`, `ENT-008`, `ENT-009`, `ENT-011`, `ENT-012`, `ENT-013`, `ENT-014`, `ENT-015`, `ENT-016`, `ENT-018`, `ENT-019`, `ENT-020`, `ENT-021`, `ENT-022`, `ENT-023`, `ENT-024`
