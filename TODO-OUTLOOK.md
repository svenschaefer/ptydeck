# TODO-OUTLOOK - Mid and Long Term

Items in this file are intentionally not part of near-term delivery in `TODO.md`.

## Product and UX

- [ ] Add session grouping and workspace presets.
- [ ] Add persistent layout profiles.
- [ ] Add a command palette and keyboard-first navigation.
- [ ] Add output-focused reading mode for long-running logs.
- [ ] Add split-based layout model (horizontal/vertical) with drag/resize behavior.
- [ ] Add explicit control-plane and execution-plane panes for advanced operator workflows.

## Security and Multi-Tenancy

- [ ] Add complete authentication and authorization model with role scopes.
- [ ] Add tenant isolation model.
- [ ] Add auditable action logs for API and session operations.
- [ ] Add managed secrets strategy for production runtime.

Deferred from `TODO.md` scope (explicit backlog items):

- [ ] `ENT-002` Owner `BE`: Add tenant-aware session scoping model (tenantId propagation, API filtering, WS event isolation by tenant).
- [ ] `ENT-003` Owner `BE`: Add structured audit logging for security-relevant actions (session create/delete/input/resize, auth failures) with actor identity and outcome.
- [ ] `ENT-010` Owner `QA`: Add security-focused integration tests (authz boundary checks, tenant isolation checks, rate-limit enforcement checks).
- [ ] `ENT-025` Owner `BE`: Add production OIDC/JWKS auth provider integration (issuer/audience/JWKS validation) and keep `AUTH_MODE=dev` as local-only fallback.

## Scale and Runtime Isolation

- [ ] Add horizontal scaling strategy with session affinity.
- [ ] Add isolated worker runtime mode for PTY execution.
- [ ] Add container-per-session runtime option.
- [ ] Add load and soak testing for high concurrent session counts.
- [ ] Add tmux-backed runtime option for true process/session persistence across backend restarts.

## Developer Productivity

- [ ] Add ADR process for architecture decisions.
- [ ] Add templates for new endpoints and UI modules.

## Technical Alternatives and Stack Evolution

- [ ] `ALT-001` Owner `BE`: Evaluate and, if adoption triggers are met, migrate the backend HTTP/runtime shell from the current raw Node.js router to a structured framework baseline (Fastify preferred, Express fallback) while preserving the existing OpenAPI contract, WebSocket behavior, and test suite.
- [ ] `ALT-002` Owner `BE`: Evaluate a structured WebSocket protocol layer on top of `ws` for multiplexing, multi-client coordination, and shared-session scenarios, including compatibility constraints, migration sequencing, and reasons to keep the current raw event model.
- [ ] `ALT-003` Owner `BE`: Add a relational persistence option (SQLite first, PostgreSQL-ready abstraction second) with an explicit migration path from JSON persistence for future multi-user, query-heavy, or session-history requirements.
- [ ] `ALT-004` Owner `FE`: Evaluate a frontend framework migration path (React + Vite or Svelte) for the terminal workspace UI, including component-boundary mapping, xterm integration risks, and rollback criteria if vanilla runtime maintenance remains preferable.
- [ ] `ALT-005` Owner `FE`: Evaluate adoption of an external frontend state-management layer (for example Zustand or Redux Toolkit) after the near-term reducer/store extraction baseline is in place and only if the custom reducer-first runtime model proves insufficient.
- [ ] `ALT-006` Owner `PLAT`: Evaluate build/workspace modernization (`Vite` for frontend dev/build, `pnpm`-based workspace/monorepo structure) when package count, service count, or contributor count outgrow the current npm-only layout.

## Observability

- Promoted to active delivery (`v0.4.0-H1` in `TODO.md` / `ROADMAP.md`):
  - `OBS-001`, `OBS-002`, `OBS-003`, `OBS-004`
- [ ] Add distributed tracing across REST, WS, and PTY pathways.

## Extensibility

- [ ] Add optional controlled mouse forwarding.
- [ ] Add plugin interface for project-specific automations.
- [ ] Add session replay/export capabilities.
- [ ] `ARC-001` Owner `FE`: Introduce a frontend stream-interpretation/plugin layer for semantic PTY output classification and extensible automation hooks.
- [ ] `ARC-002` Owner `FE`: Generalize WebSocket-as-single-source-of-truth state handling beyond the near-term session/deck/custom-command reducer baseline to future plugin artifacts, richer derived state, and later protocol evolution.
- [ ] Add command-language namespaces and scriptability (for example `/session.new`, `/system.restart`).
- [ ] Add parameterized custom commands (for example `/deploy <env>`) with explicit placeholder rules.
- [ ] Add template variables for command expansion (for example `$session`, `$cwd`) with strict opt-in behavior.
- [ ] Add scoped custom-command sets (global, project, session scopes) with deterministic precedence.
- [ ] Add fuzzy/personalized slash-command suggestions with deterministic fallback order.
- [ ] Add broadcast input modes for explicit session groups.

Deferred from `docs/Codebase Review*.md` and `docs/Technical Alternatives Evaluation for Current Stack.md`:

- [ ] `DRV-001` Owner `BE`: Add shell-adapter abstraction for CWD tracking beyond bash (`PROMPT_COMMAND` baseline), with explicit per-shell capability matrix and deterministic fallback behavior when shell-specific tracking is unavailable.
- [ ] `DRV-002` Owner `BE`: Add configurable terminal replay/scrollback retention policy (memory and optional persisted snapshot depth limits) with explicit product-level constraints for partial vs extended history recovery.
- [ ] `DRV-005` Owner `QA`: Add compatibility regression matrix for shell/runtime combinations (bash/zsh/fish where supported) covering CWD tracking, prompt detection, and replay/snapshot behavior under differing shell semantics.

Deferred from `docs/Slash Workflow Chains.md` (mid/long-term, not in current near-term scope):

- [ ] `SWF-001` Owner `FE`: Define a strict line-oriented slash-workflow DSL grammar and AST schema (no loops/variables/scripting features), including explicit parse errors for invalid regex, missing timeout, unknown workflow directives, and malformed block payload boundaries.
- [ ] `SWF-002` Owner `FE`: Implement a deterministic workflow execution engine (`ready -> running -> waiting -> succeeded|failed|stopped|cancelled`) with sequential step evaluation and explicit failure/time-out abort semantics.
- [ ] `SWF-003` Owner `FE`: Add abortable wait-step primitives (`wait delay`, `wait idle`, `wait until <source> <pattern> timeout`) using `AbortController`-style cancellation so each in-flight step can be interrupted immediately.
- [ ] `SWF-004` Owner `FE`: Add workflow data-source adapters (`line`, `visible-line`, `status`, `summary`, `exit-code`, `session-state`) over the existing stream/interpretation layer with deterministic source contracts and no hidden heuristic side effects in the execution layer.
- [ ] `SWF-005` Owner `BE`: Add explicit PTY control endpoints for runtime interruption/escalation (`POST /api/v1/sessions/{sessionId}/interrupt`, `.../terminate`, `.../kill`) with OpenAPI/runtime validation, authz checks, and deterministic error contracts for already-exited sessions.
- [ ] `SWF-006` Owner `FE`: Add independent workflow control-plane UI/actions (`Stop Workflow`, `Interrupt`, `Kill Session`) that remain available while workflows are running/waiting and are not encoded as ordinary DSL steps.
- [ ] `SWF-007` Owner `BE`: Define and enforce workflow safety guardrails (max workflow steps, max wait timeout, max capture size, and explicit cancellation cleanup of listeners/subscriptions) to prevent runaway client/runtime behavior.
- [ ] `SWF-008` Owner `QA`: Add regression coverage for workflow determinism and control-plane safety (cancel while waiting, ignored `SIGINT` escalation path, PTY exit during wait, timeout behavior, and exact-once cancel/stop semantics).

Deferred from external terminal/SSH tool survey (kept out of `TODO.md` current scope):

- Inspiration source: [`withfig/autocomplete`](https://github.com/withfig/autocomplete) for declarative completion specs, generator-backed contextual suggestions, and richer completion metadata.
- [ ] `REM-001` Owner `BE`: Add remote session kind support (`local`, `ssh`) with persisted non-secret connection metadata and deterministic launch/reconnect semantics.
- [ ] `REM-002` Owner `BE`: Add SSH authentication matrix for remote sessions (password, private key, keyboard-interactive) with secure secret handling and explicit forwarding/proxy guardrails.
- [ ] `REM-003` Owner `BE`: Add SSH host-key trust-store workflow (`known_hosts` semantics, first-connect trust contract, changed-host-key rejection path).
- [ ] `REM-004` Owner `FE`: Add saved connection profiles and reusable launch presets for local shells and SSH targets (`host`, `port`, `username`, `shell`, `cwd`, `env`, `tags`, `deck`, `theme`).
- [ ] `REM-005` Owner `BE`: Add remote-session disconnect/reconnect contract for SSH-backed sessions, including explicit degraded/offline state, retry policy, and deterministic user-visible recovery semantics.
- [ ] `REM-006` Owner `BE`: Add controlled session file-transfer support with explicit upload/download permission model, progress reporting, and large-transfer guardrails.
- [ ] `REM-007` Owner `FE`: Add session/deck sharing UX with explicit read-only spectator mode and visible control/write-permission state.
- [ ] `REM-008` Owner `FE`: Add terminal theme import/export compatibility for external theme catalogs/formats (for example iTerm2, Windows Terminal, or Xresources-style payloads) with deterministic mapping and validation.
- [ ] `REM-009` Owner `QA`: Add integration/security coverage for remote-session auth, host-key verification, transfer guardrails, and read-only sharing semantics.
