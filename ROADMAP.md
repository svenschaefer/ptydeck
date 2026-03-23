# ROADMAP - ptydeck

This file defines execution order, release versions, and dependencies for tasks listed in `TODO.md`.
`TODO.md` remains the source of task definitions.

## Ownership and Release Control

- Roadmap owner: `CODY`
- Release execution owners: `BE`, `FE`, `PLAT`, `QA`
- Final decision authority: `SAS` (Sven A. Schaefer, `svenschaefer`, `sven.schaefer@gmail.com`)
- Versioning scheme: compressed pre-1.0 milestones up to `v0.3.0`

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
- CI enforces coverage minimums.
- CI performs runtime smoke checks before merge.
- CI validates runtime across supported Node versions.
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

## Current Status

- Latest completed milestone: `v0.3.0-H3`
- Next milestones in progress: none
- Blockers: none recorded

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
- `ENT-023`
- `ENT-018`
- `ENT-011`
- `ENT-007`
- `ENT-009`
- `ENT-024`
- `ENT-015`
- `ENT-001`
- `ENT-004`
- `ENT-021`
- `ENT-005`
- `ENT-008`
- `ENT-016`
- `ENT-019`
- `ENT-006`
- `ENT-020`
- `ENT-012`
- `ENT-022`
- `ENT-014`
- `ENT-013`
