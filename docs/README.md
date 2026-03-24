# Docs Review Index

This directory currently contains architecture-review and strategy notes.
These documents are useful inputs, but they are not the authoritative source of implementation status.

Authoritative repository documents remain:

- `TODO.md` for explicit implementation tasks
- `ROADMAP.md` for ordering, versions, and dependencies
- `DONE.md` for completed work
- `TODO-OUTLOOK.md` for deferred mid/long-term items
- `CODEX_CONTEXT.md` for persistent project context

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
  - Status: implemented in current baseline and still useful as a reference for later lifecycle cleanup
  - Backlog landing:
    - `QLT-095`
    - `QLT-096`

### 4. Plugin / Stream Interpretation

- `Codebase Review - Frontend Plugin & Stream Interpretation Layer.md`
- `Frontend Plugin System for Terminal Stream Interpretation.md`
  - Role: overlapping plugin-system and stream-interpretation proposals
  - Consolidation note:
    - both documents describe the same architectural direction
    - `Frontend Plugin System for Terminal Stream Interpretation.md` is the more complete implementation-oriented version
    - `Codebase Review - Frontend Plugin & Stream Interpretation Layer.md` is still useful as review framing, but not the canonical detailed proposal
  - Status: mid/long-term relevant, not current-scope delivery
  - Backlog landing:
    - `ARC-001`
    - `ARC-002`

### 5. Security Hardening

- `Codebase Review - Security Foundation Hardening.md`
  - Role: explicit production-security hardening plan
  - Status: relevant, but mostly outside current local/dev-focused scope
  - Backlog landing:
    - `ENT-026`
    - `ENT-027`

### 6. WebSocket as Single Source of Truth

- `Codebase Review - WebSocket as Single Source of Truth.md`
  - Role: state-flow simplification plan
  - Still relevant:
    - broader WS-first state layering is still not complete
  - Backlog landing:
    - `QLT-116`
    - `QLT-117`
    - `QLT-118`
    - `ARC-002`

### 7. Technical Alternatives

- `Technical Alternatives Evaluation for Current Stack.md`
  - Role: decision-support note for possible stack migrations or upgrades
  - Status: reference only; no immediate implementation commitment
  - Current interpretation:
    - keep current stack unless scalability, security isolation, or team-size pressure creates a concrete need

## Consolidation Outcome

The imported review notes reduce to these actionable themes:

### Current Scope

- None currently derived from the imported review notes.

### Deferred / Outlook

- Replace WebSocket query-string token transport and harden token logging.
- Split auth behavior into explicit dev/prod modes.
- Introduce stream interpretation and plugin architecture.
- Generalize WebSocket-first state handling beyond current domains.

## Duplication Guidance

If these review notes are expanded later:

- use `Frontend Plugin System for Terminal Stream Interpretation.md` as the canonical plugin-design source
- use `Codebase Review.md` as the canonical high-level review source
- treat the remaining review files as deep-dive companions, not separate implementation status documents
