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

### v0.3.0-H2 - Enterprise Readiness Backlog

- `ENT-001`, `ENT-002`, `ENT-003`, `ENT-004`, `ENT-005`, `ENT-006`, `ENT-007`, `ENT-008`, `ENT-009`, `ENT-010`, `ENT-011`, `ENT-012`, `ENT-013`, `ENT-014`, `ENT-015`, `ENT-016`, `ENT-017`, `ENT-018`, `ENT-019`, `ENT-020`, `ENT-021`, `ENT-022`, `ENT-023`, `ENT-024`

Dependencies:

- `ENT-001` should run after `QLT-015` to build on stable API contract behavior.
- `ENT-002` depends on `ENT-001` identity model and token claims.
- `ENT-003` depends on `ENT-001` to include authenticated actor identity in audit records.
- `ENT-006` depends on `QLT-007` request-size guard and should be validated by `ENT-010`.
- `ENT-010` depends on completion of `ENT-001`, `ENT-002`, and `ENT-006`.
- `ENT-008` should run after observability-producing changes in `ENT-003` and `ENT-004`.
- `ENT-009` should run after `QLT-009` atomic persistence write hardening.
- `ENT-011` should run before any production deployment cutover.
- `ENT-012` depends on `ENT-005` secrets/key management strategy.
- `ENT-013` should run before `ENT-015` to include hardened runtime evidence in release bundles.
- `ENT-014` depends on `ENT-009` backup/restore mechanics.
- `ENT-015` depends on `ENT-007` security scanning artifacts.
- `ENT-016` should run with `ENT-011` to align transport and header-level security posture.
- `ENT-017` depends on `ENT-001` auth model and should align with `QLT-006` CORS policy split.
- `ENT-018` should run with `ENT-011` to keep HTTPS/WSS ingress and certificate handling aligned.
- `ENT-019` depends on `ENT-018` ingress topology and should be validated together with `ENT-003` audit context fields.
- `ENT-020` depends on `ENT-006` abuse-control baseline and should be validated by `ENT-022`.
- `ENT-021` should run before `ENT-008` alerting implementation to provide metric signals.
- `ENT-022` depends on `ENT-020` and should run after `ENT-021` metric instrumentation for measurable thresholds.
- `ENT-023` should run before production hardening tasks to prevent invalid runtime config drift.
- `ENT-024` depends on `ENT-003`, `ENT-004`, and `ENT-009` to align session and log retention behavior.

Exit criteria:

- AuthN/AuthZ and tenant isolation are enforced on REST and WS paths.
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
- WebSocket origin checks are enforced alongside REST origin policy.
- Reverse-proxy deployment guidance exists for provider-agnostic HTTPS/WSS host routing.
- Trusted proxy handling is explicitly configured and validated.
- Session guardrail policies (concurrency/idle/lifetime) are enforced and tested.
- Monitoring metrics are exposed and consumed by alerting baselines.
- Load and fanout non-functional thresholds are automated and tracked.
- Runtime configuration fails fast on invalid critical env values.
- Data retention and purge policies are automated and documented.

## Current Status

- Latest completed milestone: `v0.3.0`
- Next milestone in progress: `v0.3.0-H1`
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
- `QLT-028`, `QLT-029`, `QLT-030`, `QLT-031`, `QLT-032`, `QLT-033`, `QLT-034`
- `QLT-035`
- `QLT-036`
