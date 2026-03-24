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
- [ ] `ENT-017` Owner `BE`: Enforce WebSocket `Origin` allowlist checks on upgrade requests and return explicit unauthorized-origin errors.
- [ ] `ENT-025` Owner `BE`: Add production OIDC/JWKS auth provider integration (issuer/audience/JWKS validation) and keep `AUTH_DEV_MODE` as local-only fallback.
- [ ] `ENT-026` Owner `BE`: Replace WebSocket query-string token transport with header-based or one-time handshake token auth and ensure token-bearing URLs are never logged.
- [ ] `ENT-027` Owner `BE`: Split auth behavior into explicit `AUTH_MODE=dev|prod`, disable `/api/v1/auth/dev-token` outside local/dev mode, and fail fast on insecure production auth configuration.

## Scale and Runtime Isolation

- [ ] Add horizontal scaling strategy with session affinity.
- [ ] Add isolated worker runtime mode for PTY execution.
- [ ] Add container-per-session runtime option.
- [ ] Add load and soak testing for high concurrent session counts.
- [ ] Add tmux-backed runtime option for true process/session persistence across backend restarts.

## Developer Productivity

- [ ] Add ADR process for architecture decisions.
- [ ] Add automated FE/BE contract tests.
- [ ] Add templates for new endpoints and UI modules.

## Observability

- [ ] Add metrics for session lifecycle and connection quality.
- [ ] Add distributed tracing across REST, WS, and PTY pathways.

## Extensibility

- [ ] Add optional controlled mouse forwarding.
- [ ] Add plugin interface for project-specific automations.
- [ ] Add session replay/export capabilities.
- [ ] `ARC-001` Owner `FE`: Introduce a frontend stream-interpretation/plugin layer for semantic PTY output classification and extensible automation hooks.
- [ ] `ARC-002` Owner `FE`: Generalize WebSocket-as-single-source-of-truth state handling beyond custom commands to additional frontend domains (session lifecycle, derived state, future plugin artifacts).
- [ ] Add command-language namespaces and scriptability (for example `/session.new`, `/system.restart`).
- [ ] Add parameterized custom commands (for example `/deploy <env>`) with explicit placeholder rules.
- [ ] Add template variables for command expansion (for example `$session`, `$cwd`) with strict opt-in behavior.
- [ ] Add scoped custom-command sets (global, project, session scopes) with deterministic precedence.
- [ ] Add fuzzy/personalized slash-command suggestions with deterministic fallback order.
- [ ] Add broadcast input modes for explicit session groups.

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
