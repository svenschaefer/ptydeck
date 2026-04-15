# TODO-OUTLOOK - Mid and Long Term

Items in this file are intentionally not part of near-term delivery in `TODO.md`.
Completed release and promotion history lives in `CHANGELOG.md`.

This file is structured into:

- Future epics: larger themes that are not yet cut into near-term tasks
- Deferred explicit backlog: concrete tasks with IDs that remain intentionally out of current delivery

## Future Epics

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

### Messaging Adapters

- The outbound-first messaging-adapter foundation (`v0.4.0-H77`) and the bounded inbound Telegram reference follow-up (`v0.4.0-H78`) are now both delivered on `main`; only post-reference follow-up work remains in this deferred section.
- Post-reference trigger auto-detection follow-ups in this section should build on the delivered `v0.4.0-H79` terminal-app-identity foundation instead of re-implementing app heuristics inside messaging-specific code.
- The delivered `v0.4.0-H80` follow-up now adds bounded messaging traces, duplicate/noise suppression, app-aware aggregation, and explicit low-value filter patterns for agentic CLI chatter; only post-reference adapter/profile expansion work remains in this deferred section.
- The delivered `v0.4.0-H128` follow-up now adds the transport-neutral/app-neutral `TerminalProjection` / `Turn` / `OutputEpisode` / `MessageIntent` / `DeliveryAdapter` / `AppSemanticAdapter` baseline together with the first shipped terminal projection, projection-backed semantics, and shadow-mode migration surface; any future adapter or app-expansion work in this deferred section must build on that baseline instead of reopening chunk-first parser heuristics.
- The delivered `v0.4.0-H133` follow-up now proves the neutral delivery seam with both Telegram and a Discord-style reference adapter; future Discord work in this deferred section should therefore target richer interaction or workflow semantics rather than re-proving basic message delivery on a second transport.
- The delivered `v0.4.0-H88` hard-break reset now pauses outbound Telegram delivery by default and shifts the next messaging direction toward allowlist-/signal-first delivery from a clean baseline instead of continuing line-by-line noise filtering as the primary strategy.
- The delivered `v0.4.0-H98` follow-up now routes mapped plain Telegram text into the same backend session-input path used by frontend send actions while keeping bot commands bounded and controller checks intact.
- The first codex-only outbound reactivation `v0.4.0-H99` is now delivered on `main`, the follow-up `v0.4.0-H100` extraction now keeps runtime delivery plus offline replay analysis on the same shared evaluator, the follow-up `v0.4.0-H103` correction now keeps new separator-anchored blocks from collapsing into one endlessly edited Telegram post, the follow-up `v0.4.0-H104` tolerance pass now accepts tiny redraw-tail separator contamination plus a slightly wider bounded gap for real `ai-playbooks`-style Codex timing, the follow-up `v0.4.0-H105` section pass now adds shared-evaluator chrome stripping plus the narrow `codex_separator_section` family for separator-anchored narrative sections with subsection labels and list items, the follow-up `v0.4.0-H106` summary pass now adds the strict `codex_separator_summary_sentence` family for separator-hint sentence summaries, the follow-up `v0.4.0-H107` correction now keeps repeated identical summary retries from fanning out into duplicate Telegram posts while making mapped Telegram submit behavior independent of transient app-detection state, the follow-up `v0.4.0-H108` parity wave now publishes the canonical ptydeck slash-command surface to Telegram and routes those published custom commands through the existing command runtime, the follow-up `v0.4.0-H109` restart-recovery wave now suppresses summary-family resend bursts during backend restart recovery, the follow-up `v0.4.0-H113` command-surface simplification now removes Telegram-local built-in bot commands from the published surface so Telegram follows configured ptydeck custom commands only, the follow-up `v0.4.0-H114` topic-title preservation wave now keeps manually renamed Telegram forum topics from being snapped back on the normal reuse path, the follow-up `v0.4.0-H121` formatting pass now preserves multiline section structure plus middle truncation for long Telegram-visible Codex messages, the follow-up `v0.4.0-H122` observability pass now adds stable inbound correlation plus body/submit/PTY-write debug breadcrumbs while restricting reply-window arming to the actual submit-bearing phase, the follow-up `v0.4.0-H123` reply-integrity pass now rejects stale repeated short tails such as `- worktree clean` before `codex_input_reply` can start while suppressing commentary/progress chatter from the narrow Codex outbound families, the follow-up `v0.4.0-H135` baseline-extension slice now exposes neutral allowlist delivery signals alongside those legacy narrow Codex family names, and the follow-up `v0.4.0-H138` identity slice now makes the shipped narrow path signal-first in policy reasons, runtime traces, and summary restart-ledger identity while preserving legacy scope metadata; only the broader allowlist-/signal-first outbound rebuild beyond those shipped narrow families remains deferred here.

- [ ] `MSG-008` Owner `BE`: Add richer post-reference trigger profiles and selection controls for deploy, transfer/sync, and long-running worker sessions, plus optional profile auto-detection heuristics, only after the outbound Telegram reference flow and the bounded inbound action contract are both stable.
- [ ] `MSG-009` Owner `PLAT`: Build the next Discord follow-up on top of the delivered reference delivery adapter by adding an interaction-oriented Discord adapter path that preserves the same single-user ptydeck authority boundaries while validating a richer button- or workflow-driven remote interaction surface instead of only plain outbound message parity.
- [ ] `MSG-010` Owner `PLAT`: Add a Slack-style workflow-oriented adapter focused on concise summaries, handoff context, and approval/status-style workflows rather than stream mirroring, only after the first two adapter styles prove the core framework boundaries.
- [ ] `MSG-011` Owner `QA`: Add cross-adapter parity and contract validation after a second concrete adapter lands, ensuring provider-specific adapters still honor the same normalized event model, bounded action vocabulary, and ptydeck authority rules.
- [ ] `MSG-029` Owner `BE`: After the delivered `v0.4.0-H99` narrow codex-only first-use-case path, the delivered `v0.4.0-H100` shared replay/runtime evaluator parity, the delivered `v0.4.0-H103` block-identity delivery correction, the delivered `v0.4.0-H104` separator-tolerance widening, the delivered `v0.4.0-H105` chrome-stripped `codex_separator_section` follow-up, the delivered `v0.4.0-H106` strict `codex_separator_summary_sentence` follow-up, the delivered `v0.4.0-H107` duplicate/backoff plus delayed-submit correction, the delivered `v0.4.0-H108` Telegram slash-command parity wave, the delivered `v0.4.0-H109` restart-recovery summary suppression, the delivered `v0.4.0-H113` custom-command-only Telegram surface simplification, the delivered `v0.4.0-H114` manual topic-title preservation, the delivered `v0.4.0-H117` stream-first submitted-input reply-block promotion, the delivered `v0.4.0-H118` replayable trace-to-message policy evaluation, the delivered `v0.4.0-H119` block-first Codex multiline assembly wave, the delivered `v0.4.0-H120` stale-carryover and input-echo reply hardening, the delivered `v0.4.0-H121` multiline-format and middle-truncation preservation, the delivered `v0.4.0-H122` messaging-input write-path observability plus submit-only reply-window arming, the delivered `v0.4.0-H123` reply-integrity correction for stale-tail rejection plus commentary suppression, the delivered `v0.4.0-H135` neutral allowlist delivery-signal bridging, and the delivered `v0.4.0-H138` signal-first narrow outbound identity slice have sufficient live-product evidence, continue the broader Telegram outbound rebuild toward an allowlist-/signal-first model with additional message-worthy state transitions, adapter-neutral signal categories, and deterministic block-aware new/update reuse before broader adapter/profile expansion resumes.

### Remote / External Theme Compatibility

- [ ] `REM-008A` Owner `FE`: Add a deterministic terminal theme import/export compatibility layer that can parse and emit normalized theme payloads for the existing per-session `activeThemeProfile` / `inactiveThemeProfile` model, starting with explicit adapters for iTerm2 JSON, Windows Terminal JSON fragments, and Xresources-style key/value payloads.
- [ ] `REM-008B` Owner `FE`: Add frontend operator workflows for theme import/export, including slash-command entry points plus session-settings UI for importing a supported external theme payload into the active or inactive theme slot and exporting the current slot in a selected external format with explicit validation feedback.
- [ ] `REM-008C` Owner `QA`: Add regression coverage for theme import/export parsing, invalid payload rejection, deterministic slot mapping, and roundtrip fidelity across the supported external theme formats.

Notes:

- The `REM-008*` block was deliberately moved back out of near-term delivery after `v0.4.0-H40`.
- External terminal and SSH command-surface inspiration continues to include [`withfig/autocomplete`](https://github.com/withfig/autocomplete) for declarative completion specs, generator-backed contextual suggestions, and richer completion metadata.
