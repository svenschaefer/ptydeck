# TODO - ptydeck

This file defines concrete, open implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.
Completed work belongs in `CHANGELOG.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)

- [ ] `MSG-001` Owner `BE`: Add a provider-independent messaging-event foundation for the single-user ptydeck runtime that emits normalized adapter-facing events for session lifecycle, shell/prompt readiness, replay-visible activity summaries, attention-required conditions, controller/share-state changes, and explicit terminal idle/completion transitions without exposing raw PTY chunks as the public adapter contract.
- [ ] `MSG-002` Owner `BE`: Add deterministic v1 signal extraction and message-policy support for messaging adapters, including exactly three shipped trigger profiles (`generic-shell`, `coding-agent`, and `build-test`), bounded buffering for chunk/multiline carriers, stable event correlation keys, and explicit outbound decisions (`new`, `update`, `alert`, `suppress`) so the first adapter wave stays concise and does not mirror raw terminal noise.
- [ ] `MSG-003` Owner `PLAT`: Add the outbound-only Telegram reference adapter for the single-user deployment model, including bot/runtime configuration, secret loading, explicit session-to-conversation mapping, deterministic outbound delivery semantics for new-message/update/alert flows, and operator-visible diagnostics for adapter delivery failures without making adapter outages fatal to the core runtime.
- [ ] `MSG-004` Owner `QA`: Add closeout validation for `v0.4.0-H77`, including event-model contract tests, trigger-profile/message-policy regression coverage, mocked Telegram outbound adapter integration tests, and a deterministic full local quality-gate rerun.
- [ ] `MSG-005` Owner `BE`: Add a bounded inbound messaging-action contract for the single-user adapter model that exposes only `status`, `stop`, `retry`, and replay-excerpt requests in v1, maps them onto existing ptydeck-owned operations, and rejects any action that would bypass current share, controller, read-only, or send-safety decisions.
- [ ] `MSG-006` Owner `PLAT`: Extend the Telegram reference adapter with explicit bounded inbound interaction for the v1 action contract, using buttons and deterministic text-command fallbacks aligned with existing ptydeck terminology instead of free-text intent parsing or a second command language.
- [ ] `MSG-007` Owner `QA`: Add closeout validation for `v0.4.0-H78`, including inbound action authorization/gating coverage, adapter-to-core contract tests, idempotent `stop`/`retry` handling, replay-excerpt response validation, and end-to-end mocked Telegram interaction tests.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
