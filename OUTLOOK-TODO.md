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
- [ ] Add SLO definitions and alert thresholds.

## Extensibility

- [ ] Add safe file transfer option per session.
- [ ] Add optional controlled mouse forwarding.
- [ ] Add plugin interface for project-specific automations.
- [ ] Add session replay/export capabilities.
- [ ] Add command-language namespaces and scriptability (for example `/session.new`, `/system.restart`).
- [ ] Add remote execution adapters (SSH sessions and multi-host routing).
- [ ] Add multi-client shared sessions with separate view/control permissions.
- [ ] Add broadcast input modes for explicit session groups.
