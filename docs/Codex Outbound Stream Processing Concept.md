# Codex Outbound Stream Processing Concept

Historical note: this document describes a removed stream-to-message direction. It is kept only as design history and failure context after the 2026-04-16 messaging live-path reset.

## Status

This concept is not the current product architecture.

The current live runtime is transport-only and no longer performs automatic Codex or PTY-stream outbound extraction.

## Why This Note Still Exists

It captures useful learnings from the earlier attempts:

- separator-anchored extraction was too brittle as a primary live model
- chunk-first and line-first heuristics were not stable enough
- restart behavior and replayed history are first-class failure modes
- production shadow/legacy duality is too hard to reason about once it starts affecting live delivery

## How To Read This Document Now

Use it only as historical design input for a future clean-slate third attempt.

Do not use it as:

- implementation status
- current runtime description
- deployment guidance
- operator expectation documentation

## Current Successor Documents

For the current shipped system, use instead:

- `docs/Terminal Messaging Core Architecture.md`
- `docs/Messaging Reset and Third Attempt Notes.md`
- `CODEX_CONTEXT.md`
- `DEPLOYMENT.md`
