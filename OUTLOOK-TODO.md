# OUTLOOK TODO - Mid and Long Term

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

- [ ] Add safe file transfer option per session.
- [ ] Add optional controlled mouse forwarding.
- [ ] Add plugin interface for project-specific automations.
- [ ] Add session replay/export capabilities.
- [ ] Add command-language namespaces and scriptability (for example `/session.new`, `/system.restart`).
- [ ] Add remote execution adapters (SSH sessions and multi-host routing).
- [ ] Add multi-client shared sessions with separate view/control permissions.
- [ ] Add broadcast input modes for explicit session groups.
