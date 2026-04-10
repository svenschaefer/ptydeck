# TODO-OUTLOOK - Mid and Long Term

Items in this file are intentionally not part of near-term delivery in `TODO.md`.
Completed release and promotion history lives in `CHANGELOG.md`.

This file is structured into:

- Future epics: larger themes that are not yet cut into near-term tasks
- Deferred explicit backlog: concrete tasks with IDs that remain intentionally out of current delivery

## Future Epics

### Product and UX

- [ ] Add a messaging-adapter framework as the next larger mainline epic after the delivered `H76` quality follow-up, not as another `feature/h62-multi-device-control-foundation` branch-local continuation.

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
- [ ] Add a platform-independent messaging-adapter framework with outbound-first reference delivery before richer inbound remote-action phases.

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

### Messaging Adapters

- [ ] `MSG-001` Owner `BE`: Add a provider-independent messaging-event foundation that normalizes session lifecycle, replay-visible output signals, controller/share state changes, and attention-required conditions into a stable adapter-facing event model without coupling the core runtime to any single messaging product.
- [ ] `MSG-002` Owner `BE`: Add deterministic signal-extraction and trigger-profile support for the first messaging-adapter wave, including explicit shell, coding-agent, build/test, deploy, and transfer-oriented rule bundles plus message-eligibility policy so adapters consume normalized events instead of parsing raw PTY output ad hoc.
- [ ] `MSG-003` Owner `PLAT`: Add an outbound-only Telegram reference adapter that maps one ptydeck session to one conversation target, supports new-message/update/alert lifecycle behavior, and stays subordinate to existing ptydeck REST/WebSocket/share/control contracts rather than introducing provider-specific runtime authority.
- [ ] `MSG-004` Owner `BE`: Add a bounded inbound adapter-action contract that can map explicit remote actions such as `status`, `stop`, `retry`, replay excerpt requests, and bounded slash-command execution onto existing ptydeck control/share/send-safety decisions without introducing a second terminal-authority model.
- [ ] `MSG-005` Owner `QA`: Add closeout validation for the first messaging-adapter wave, including provider-independent event/trigger/message-policy coverage plus end-to-end verification of the Telegram outbound reference adapter and the bounded inbound action contract.

### Remote / External Theme Compatibility

- [ ] `REM-008A` Owner `FE`: Add a deterministic terminal theme import/export compatibility layer that can parse and emit normalized theme payloads for the existing per-session `activeThemeProfile` / `inactiveThemeProfile` model, starting with explicit adapters for iTerm2 JSON, Windows Terminal JSON fragments, and Xresources-style key/value payloads.
- [ ] `REM-008B` Owner `FE`: Add frontend operator workflows for theme import/export, including slash-command entry points plus session-settings UI for importing a supported external theme payload into the active or inactive theme slot and exporting the current slot in a selected external format with explicit validation feedback.
- [ ] `REM-008C` Owner `QA`: Add regression coverage for theme import/export parsing, invalid payload rejection, deterministic slot mapping, and roundtrip fidelity across the supported external theme formats.

Notes:

- The `REM-008*` block was deliberately moved back out of near-term delivery after `v0.4.0-H40`.
- External terminal and SSH command-surface inspiration continues to include [`withfig/autocomplete`](https://github.com/withfig/autocomplete) for declarative completion specs, generator-backed contextual suggestions, and richer completion metadata.
