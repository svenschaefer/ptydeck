# TODO-OUTLOOK - Mid and Long Term

Items in this file are intentionally not part of near-term delivery in `TODO.md`.
Completed release and promotion history lives in `CHANGELOG.md`.

This file is structured into:

- Future epics: larger themes that are not yet cut into near-term tasks
- Deferred explicit backlog: concrete tasks with IDs that remain intentionally out of current delivery

## Future Epics

### Product and UX

- none currently

### Security and Multi-Tenancy

- [ ] Add complete authentication and authorization model with role scopes.
- [ ] Add tenant isolation model.
- [ ] Add auditable action logs for API and session operations.
- [ ] Add managed secrets strategy for production runtime.

### Scale and Runtime Isolation

- [ ] Add horizontal scaling strategy with session affinity.
- [ ] Add isolated worker runtime mode for PTY execution.
- [ ] Add container-per-session runtime option.
- [ ] Add load and soak testing for high concurrent session counts.
- [ ] Add tmux-backed runtime option for true process/session persistence across backend restarts.

### Extensibility

- [ ] Add plugin interface for project-specific automations.

## Deferred Explicit Backlog

### Security and Multi-Tenancy

- [ ] `ENT-002` Owner `BE`: Add tenant-aware session scoping model (tenantId propagation, API filtering, WS event isolation by tenant).
- [ ] `ENT-003` Owner `BE`: Add structured audit logging for security-relevant actions (session create/delete/input/resize, auth failures) with actor identity and outcome.
- [ ] `ENT-010` Owner `QA`: Add security-focused integration tests (authz boundary checks, tenant isolation checks, rate-limit enforcement checks).
- [ ] `ENT-025` Owner `BE`: Add production OIDC/JWKS auth provider integration (issuer/audience/JWKS validation) and keep `AUTH_MODE=dev` as local-only fallback.

### Technical Alternatives and Stack Evolution

- [ ] `ALT-001` Owner `BE`: Evaluate and, if adoption triggers are met, migrate the backend HTTP/runtime shell from the current raw Node.js router to a structured framework baseline (Fastify preferred, Express fallback) while preserving the existing OpenAPI contract, WebSocket behavior, and test suite.
- [ ] `ALT-002` Owner `BE`: Evaluate a structured WebSocket protocol layer on top of `ws` for multiplexing, multi-client coordination, and shared-session scenarios, including compatibility constraints, migration sequencing, and reasons to keep the current raw event model.
- [ ] `ALT-003` Owner `BE`: Add a relational persistence option (SQLite first, PostgreSQL-ready abstraction second) with an explicit migration path from JSON persistence for future multi-user, query-heavy, or session-history requirements.
- [ ] `ALT-004` Owner `FE`: Evaluate a frontend framework migration path (React + Vite or Svelte) for the terminal workspace UI, including component-boundary mapping, xterm integration risks, and rollback criteria if vanilla runtime maintenance remains preferable.
- [ ] `ALT-005` Owner `FE`: Evaluate adoption of an external frontend state-management layer (for example Zustand or Redux Toolkit) after the near-term reducer/store extraction baseline is in place and only if the custom reducer-first runtime model proves insufficient.
- [ ] `ALT-006` Owner `PLAT`: Evaluate build/workspace modernization (`Vite` for frontend dev/build, `pnpm`-based workspace/monorepo structure) when package count, service count, or contributor count outgrow the current npm-only layout.

### Extensibility

- [ ] `ARC-001` Owner `FE`: Introduce a frontend stream-interpretation/plugin layer for semantic PTY output classification and extensible automation hooks.
- [ ] `ARC-002` Owner `FE`: Generalize WebSocket-as-single-source-of-truth state handling beyond the near-term session/deck/custom-command reducer baseline to future plugin artifacts, richer derived state, and later protocol evolution.

### Remote / External Theme Compatibility

- [ ] `REM-008A` Owner `FE`: Add a deterministic terminal theme import/export compatibility layer that can parse and emit normalized theme payloads for the existing per-session `activeThemeProfile` / `inactiveThemeProfile` model, starting with explicit adapters for iTerm2 JSON, Windows Terminal JSON fragments, and Xresources-style key/value payloads.
- [ ] `REM-008B` Owner `FE`: Add frontend operator workflows for theme import/export, including slash-command entry points plus session-settings UI for importing a supported external theme payload into the active or inactive theme slot and exporting the current slot in a selected external format with explicit validation feedback.
- [ ] `REM-008C` Owner `QA`: Add regression coverage for theme import/export parsing, invalid payload rejection, deterministic slot mapping, and roundtrip fidelity across the supported external theme formats.

Notes:

- The `REM-008*` block was deliberately moved back out of near-term delivery after `v0.4.0-H40`.
- External terminal and SSH command-surface inspiration continues to include [`withfig/autocomplete`](https://github.com/withfig/autocomplete) for declarative completion specs, generator-backed contextual suggestions, and richer completion metadata.
