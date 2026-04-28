# Docs Review Index

This directory contains three document classes:

- active repository-native architecture and operational notes
- historical analysis notes kept for learnings after the 2026-04-16 messaging reset
- historical branch-acceptance notes kept as evidence only
- handbook source under `docs/manual/` plus generated reference output under `docs/reference/`

Authoritative repository documents remain:

- `TODO.md` for explicit active implementation tasks
- `ROADMAP.md` for active and queued ordering, versions, and dependencies
- `CHANGELOG.md` for completed and validated release history
- `TODO-OUTLOOK.md` for deferred future work
- `CODEX_CONTEXT.md` for persistent project context
- `DEPLOYMENT.md` for the current runbook

## Inventory and Current Relevance

### Active Architecture and Runbook Documents

- `Terminal Messaging Core Architecture.md`
  - role: current transport-only messaging-adapter architecture note with the reduced `DeliveryAdapter` / `MessageIntent` contract baseline
  - status: active
- `Messaging Reset and Third Attempt Notes.md`
  - role: postmortem and design constraints for the future third messaging attempt
  - status: active
- `Terminal App Identity Foundation Design.md`
  - role: terminal app identity design reference
  - status: active design note
- `PTY EINTR Write Error Analysis.md`
  - role: PTY async write retry analysis
  - status: active analysis note
- `DEPLOYMENT.md`
  - role: current operational runbook
  - status: active

### Historical Messaging Analysis Notes

The following documents are retained for learnings only. They describe removed live messaging implementations and should not be treated as the current product behavior:

- `Codex Outbound Stream Processing Concept.md`
- `Codex Restart Resend Analysis.md`
- `Codex Latest Restart Delivery Review.md`
- `Codex Message Boundary Analysis.md`
- `Restart Streaming Analysis.md`
- `Backend Startup vs First Frontend Open Analysis.md`
- `ptydeck_messaging_adapter_framework_final_concept.md`

### Historical Branch Acceptance Notes

- `MDT-014 Trusted-Local LAN Acceptance.md`

This document records the closed trusted-local second-client LAN acceptance process. It is not part of the current deployment runbook and should not be treated as an active branch gate.

### Other Architecture / Review Notes

- `Codebase Review.md`
- `Codebase Review - Decomposing app js into a Layered Frontend Architecture.md`
- `Codebase Review - Explicit Session Lifecycle Modeling.md`
- `Codebase Review - Frontend Plugin & Stream Interpretation Layer.md`
- `Codebase Review - Security Foundation Hardening.md`
- `Codebase Review - WebSocket as Single Source of Truth.md`
- `Frontend Plugin System for Terminal Stream Interpretation.md`
- `Multi-Device Terminal Control Requirements.md`
- `Slash Workflow Chains.md`

These remain useful as review or design references, but not as implementation-status documents.
They may contain superseded terminology or review-time observations; when they differ from current behavior, `CODEX_CONTEXT.md`, `DEPLOYMENT.md`, `TODO.md`, `ROADMAP.md`, and `CHANGELOG.md` are authoritative.

Obsolete stack-replacement evaluations and branch-specific deployment gates are intentionally not retained in the active docs index. Current task authority remains limited to `TODO.md`, `ROADMAP.md`, and `TODO-OUTLOOK.md`.

### Handbook System

- `manual/`
- `reference/`

Current interpretation:

- `docs/manual/` stays curated and workflow-oriented
- deferred or non-final operator flows are intentionally kept out of `docs/manual/`; messaging adapter background remains in architecture/context documents until a future messaging attempt is explicitly promoted again
- `docs/reference/` stays generated from code/contracts through `npm run docs:generate`
- `frontend/src/public/handbook/` is generated output, not a hand-edited documentation source
