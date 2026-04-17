# Messaging Reset and Third Attempt Notes

Last updated: 2026-04-17

## Purpose

This note records why the 2026-04-16 messaging reset happened, what was intentionally removed, what was intentionally kept, and what a third attempt must do differently.

## What Was Wrong With The Removed Live Path

The removed live path accumulated too many simultaneously active concerns:

- legacy compatibility logic
- projection/shadow migration logic
- restart-recovery gates
- narrow allowlist exceptions
- commentary/noise classifier heuristics
- transport delivery policy

That made the product path operationally opaque. In practice it became too hard to answer a simple question like:

- why was this message sent?
- why was this message not sent?

A system that cannot answer that cleanly is not a stable messaging base.

## What Was Removed

The live runtime no longer performs:

- automatic reply extraction from PTY output
- automatic section/summary extraction from PTY output
- projection/shadow semantic comparison in production
- restart resend suppression in production
- Codex-specific allowlist families in production
- runtime-owned semantic classifier ballast in production

The related code was removed from the repo as code, tests, and analysis tooling.

## What Was Kept

The transport-level adapter framework was worth keeping.

That retained foundation is:

- `backend/src/terminal-messaging-core.js`
- `backend/src/messaging-custom-command-utils.js`
- `backend/src/delivery-adapter-utils.js`
- `backend/src/telegram-adapter.js`
- `backend/src/discord-adapter.js`
- `backend/src/telegram-command-surface.js`
- `backend/src/messaging-runtime.js` as a transport-only runtime facade

On 2026-04-17 that retained foundation was reduced one step further:

- the kept contract layer now exposes only `DeliveryAdapter` and `MessageIntent`
- retained adapters no longer carry allowlist-based delivery gates
- the kept framework no longer requires projection-, turn-, output-episode-, or semantic-adapter descriptors just to represent an explicit outbound message
- the transport-only runtime no longer infers app-specific trigger profiles for target selection

This means the future rebuild does not need to rediscover:

- adapter transport boundaries
- target normalization
- topic provisioning
- command publication
- mapped inbound input handling
- adapter metrics and trace plumbing

## Hard Learnings

The next attempt must respect these constraints:

1. One live authority only.
   - No `legacy` vs `projection` live competition.

2. No experiments in the product path.
   - Replay, corpus evaluation, and design experiments stay offline.

3. Explicit delivery contract first.
   - Before code, define exactly what is message-worthy and what is not.

4. Restart behavior is not an edge case.
   - Restart, restore, and remount are core acceptance cases, not afterthoughts.

5. No hidden exceptions.
   - If a class of message may be sent, it must be part of the explicit contract.

6. Transport and semantics stay separate.
   - The adapter framework remains transport-focused.
   - Future semantics must plug into it cleanly or not at all.

## Recommended Third-Attempt Sequence

1. Define the live delivery contract.
2. Build the offline corpus and replay harness.
3. Freeze golden cases and historical failure cases.
4. Design a single semantic pipeline against that corpus.
5. Reintroduce automatic outbound only after the corpus passes and `SAS` approves.

## Planning Link

The deferred third-attempt tasks live in `TODO-OUTLOOK.md`:

- `MSG-201`
- `MSG-202`
- `MSG-203`
- `MSG-204`
- `MSG-205`
