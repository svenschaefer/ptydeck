# Docs Review Index

This directory now contains four document classes:

- imported architecture-review and strategy notes
- repository-native ADR process material under `docs/adr/`
- repository-native operational acceptance notes for branch-specific validation/sign-off
- repository-native handbook source under `docs/manual/` plus generated reference output under `docs/reference/`

The imported review notes are useful inputs, but they are not the authoritative source of implementation status.

Authoritative repository documents remain:

- `TODO.md` for explicit implementation tasks
- `ROADMAP.md` for active and queued ordering, versions, and dependencies
- `CHANGELOG.md` for completed and validated release history
- `TODO-OUTLOOK.md` for future epics and deferred explicit backlog
- `CODEX_CONTEXT.md` for persistent project context
- `docs/adr/` for durable architecture/development decisions that require ADR treatment

## Inventory and Current Relevance

### 1. High-Level Review

- `Codebase Review.md`
  - Role: overall review of strengths, architectural risks, and strategic priorities
  - Still relevant:
    - WebSocket query-string token transport is still used
  - Partially outdated:
    - terminal output search/find UX now exists in current scope
    - explicit frontend `session.exit` handling now exists
    - frontend custom-command state is now WebSocket-first in steady state
    - xterm private internals are now isolated behind `terminal-compat`
    - `app.js` has been decomposed into layered helper modules
    - some runtime/auth/custom-command capabilities described as missing now exist in baseline form

### 2. Frontend Architecture Refactoring

- `Codebase Review - Decomposing app js into a Layered Frontend Architecture.md`
  - Role: concrete refactoring plan for breaking `app.js` into layered modules
  - Status: implemented as the current FE baseline; still useful as a cleanup/reference document
  - Backlog landing:
    - `QLT-099`
    - `QLT-100`

### 3. Explicit Session Lifecycle Modeling

- `Codebase Review - Explicit Session Lifecycle Modeling.md`
  - Role: explicit session-state-machine proposal with `session.exit` focus
  - Status: implemented in the current baseline; backend startup/running lifecycle signaling, stable exit metadata, FE lifecycle-state modeling, derived `busy` / `idle`, and lifecycle regression coverage now exist
  - Backlog landing:
    - `QLT-095`
    - `QLT-096`
    - `LIF-001`
    - `LIF-002`
    - `LIF-003`
    - `LIF-004`
    - `LIF-005`
    - `LIF-006`

### 4. Plugin / Stream Interpretation

- `Codebase Review - Frontend Plugin & Stream Interpretation Layer.md`
- `Frontend Plugin System for Terminal Stream Interpretation.md`
  - Role: overlapping plugin-system and stream-interpretation proposals
  - Consolidation note:
    - both documents describe the same architectural direction
    - `Frontend Plugin System for Terminal Stream Interpretation.md` is the more complete implementation-oriented version
    - `Codebase Review - Frontend Plugin & Stream Interpretation Layer.md` is still useful as review framing, but not the canonical detailed proposal
  - Status: the near-term stream-interpretation foundation is now implemented in the current baseline; `ARC-003` through `ARC-008` are completed, while broader plugin-architecture expansion remains deferred
  - Backlog landing:
    - `ARC-001`
    - `ARC-003`
    - `ARC-004`
    - `ARC-005`
    - `ARC-006`
    - `ARC-007`
    - `ARC-008`
    - `ARC-002`

### 5. Security Hardening

- `Codebase Review - Security Foundation Hardening.md`
  - Role: explicit production-security hardening plan
  - Status: near-term auth transport/mode hardening is implemented in the current baseline; broader production-security themes still remain deferred
  - Backlog landing:
    - `ENT-026`
    - `ENT-027`

### 6. WebSocket as Single Source of Truth

- `Codebase Review - WebSocket as Single Source of Truth.md`
  - Role: state-flow simplification plan
  - Still relevant:
    - broader WS-first protocol/state evolution beyond the current runtime metadata baseline is still not complete
  - Backlog landing:
    - `QLT-119`
    - `QLT-120`
    - `QLT-121`
    - `QLT-122`
    - `ARC-002`

### 7. Technical Alternatives

- `Technical Alternatives Evaluation for Current Stack.md`
  - Role: decision-support note for possible stack migrations or upgrades
  - Status: reference only; no immediate implementation commitment
  - Backlog landing:
    - `ALT-001`
    - `ALT-002`
    - `ALT-003`
    - `ALT-004`
    - `ALT-005`
    - `ALT-006`
  - Current interpretation:
    - keep current stack unless scalability, security isolation, or team-size pressure creates a concrete need

### 8. Operational Acceptance

- `MDT-014 Trusted-Local LAN Acceptance.md`
  - Role: executable acceptance/sign-off sheet for the real second-LAN-client validation on `feature/h62-multi-device-control-foundation`
  - Status: retained as the historical acceptance/sign-off sheet for the trusted-local branch-close wave
  - Canonical companions:
    - `DEPLOYMENT.md` section `8.2`
    - `DEPLOYMENT.md` section `8.3`

### 9. Handbook System

- `manual/`
- `reference/`
  - Role: handbook source and generated reference material for the in-app documentation surface served under `/handbook/...`
  - Status: repository-native source of truth for operator guides and generated reference pages
  - Current interpretation:
    - `docs/manual/` stays curated and workflow-oriented
    - `docs/reference/` stays generated from code/contracts through `npm run docs:generate`
    - `frontend/src/public/handbook/` is generated output, not a hand-edited documentation source

### 10. Messaging Adapter Concept

- `ptydeck_messaging_adapter_framework_final_concept.md`
  - Role: non-technical product concept for the messaging-adapter framework now delivered on `main` as the first reference baseline
  - Status:
    - the outbound-first Telegram reference wave and the bounded inbound reference wave are now delivered on `main`
    - the concept document remains useful for product boundaries and later adapter families, but it is not the implementation-status source of truth
  - Current interpretation:
    - adapters must remain subordinate to existing ptydeck session, share, and control contracts
    - the primary mapping model is session-first, with deck-level rollups only as later extensions
    - inbound chat actions are bounded extensions of the ptydeck control/slash model rather than a parallel terminal authority

### 11. Terminal App Identity Design

- `Terminal App Identity Foundation Design.md`
  - Role: repository-native implementation design for the queued `v0.4.0-H79` terminal-app-identity foundation
  - Status:
    - planning/design source for the upcoming runtime identity layer
    - not an implementation-status source of truth
  - Current interpretation:
    - use it as the canonical design source for normalized app identity, source priority, confidence arbitration, and the first consumer integration seams
    - keep final delivery status in `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, and `CODEX_CONTEXT.md`

### 12. Restart Streaming Analysis

- `Restart Streaming Analysis.md`
  - Role: repository-native analysis note for how restored sessions, frontend remount traffic, startup warmup, and messaging classification interact during a backend restart
  - Status:
    - active analytical reference for the post-hard-break Telegram redesign
    - not a delivery-status document and not a substitute for `TODO.md` / `ROADMAP.md`
  - Current interpretation:
    - use it when reasoning about restart-phase flooding, control-change chatter, idle churn, prompt-ready timing, repeated target/topic validation during startup, and the difference between cold bootstrap, reconnect/remount, and restored-PTY-burst restart regimes
    - use the companion helper script `scripts/analyze-restart-streaming.mjs` to reproduce the same restart-window summaries from `/tmp/ptydeck-backend-debug.log`
    - use the companion helper script `scripts/analyze-terminal-dump-visuals.mjs` when reasoning about operator-visible Codex transcript structure such as prompts, action bullets, separator bars, worked-for banners, nested tails, and footer ribbons
    - use the companion helper script `scripts/analyze-codex-stream-blocks.mjs` when reasoning about raw captured Codex chunk streams or when comparing the operator-visible block grammar against persisted JSONL stream capture data from `SESSION_STREAM_ANALYSIS_CAPTURE_FILE`
    - use the companion helper script `scripts/experiment-codex-candidates.mjs` when testing conservative allowlist-style Codex message rules offline against real capture windows and visual transcript examples before any broader Telegram outbound path is reconsidered
    - use the companion helper script `scripts/experiment-codex-window-states.mjs` when classifying whether a real Codex capture tail is still `restart_remount`, only `overlay_churn`, already a `stable_section`, or in a mixed transition between those states
    - use the companion helper script `scripts/experiment-codex-first-use-case.mjs` when validating or refining the delivered `H99` narrow Codex-only separator-anchored outbound candidate rule directly against persisted entry-level raw-stream capture; after `H100`, that script now replays capture through the same shared evaluator the runtime uses for `codex_separator_info`

## Consolidation Outcome

The imported review notes reduce to these actionable themes:

### Current Scope

- The explicit session lifecycle formalization slice is now completed in the baseline (`LIF-001` ... `LIF-006`).
- The imported-doc-derived near-term stream-interpretation block `v0.3.0-H13` is now completed (`ARC-003` ... `ARC-008`).

### Deferred / Outlook

- Replace WebSocket query-string token transport and harden token logging.
- Split auth behavior into explicit dev/prod modes.
- Introduce stream interpretation and plugin architecture.
- Continue WebSocket-first state handling beyond the near-term H11 reducer/store baseline.

## Duplication Guidance

If these review notes are expanded later:

- use `Frontend Plugin System for Terminal Stream Interpretation.md` as the canonical plugin-design source
- use `Codebase Review.md` as the canonical high-level review source
- treat the remaining review files as deep-dive companions, not separate implementation status documents
