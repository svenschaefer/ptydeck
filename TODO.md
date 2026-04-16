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

1. `MSG-115` Owner `BE`
   Remove the remaining runtime-owned legacy narrow-outbound dispatch shell from `backend/src/messaging-runtime.js` by extracting the Codex-compatibility bridge behind an explicit seam. The runtime must stop directly owning legacy helpers such as `buildLegacyCodexMessageIntent(...)`, `resolveLegacyMessageIntentTurn(...)`, `resolveLegacyMessageIntentOutputEpisode(...)`, and `dispatchCodexAllowlistCandidate(...)` as its primary narrow-path control surface; instead, it should orchestrate neutral `Turn` / `OutputEpisode` state plus adapter dispatch while a bounded compatibility bridge owns the still-required legacy Codex-family translation. Preserve current shipped behavior, restart recovery, duplicate suppression, and trace observability while reducing direct legacy control flow in the runtime core.

2. `MSG-116` Owner `BE`
   Make neutral narrow-outbound identity authoritative end to end so `turn-primary-reply`, `output-episode-info`, `output-episode-section`, and `output-episode-summary` drive runtime policy, restart-resend recovery, and adapter dispatch without relying on `codex_*` scope names as the primary decision surface. Legacy `codex_input_reply`, `codex_separator_info`, `codex_separator_section`, and `codex_separator_summary_sentence` must remain available only as compatibility metadata for historical traces, restart-ledger continuity, and bounded external consumers while the runtime's live control flow and policy reasons become signal-first throughout.

3. `MSG-117` Owner `BE`
   Replace the remaining compatibility-era coding-agent commentary/attention classification ballast in `backend/src/messaging-runtime.js` with a bounded, explicit classifier seam that does not suppress ordinary operational status prose. The new seam must keep real internal-analysis chatter and genuine alert conditions classifiable, but it must no longer depend on broad mid-line keyword heuristics that can hide valid operator-visible blocks mentioning `/health`, debug logs, current runtime/code state, or explanatory `failed` wording inside structured bullets. The goal is to keep the runtime core free of historical catch-all filters while preserving the delivered narrow outbound guarantees.

4. `MSG-118` Owner `QA`
   Validate the `v0.4.0-H142` messaging-runtime legacy-shell reduction end to end. Prove that the refactored runtime still delivers operational status blocks, preserves restart-resend protection, stale-tail suppression, text continuity, Telegram/Discord adapter parity, and shipped narrow outbound behavior while reducing direct legacy Codex-family control flow and compatibility-era classifier false positives. Explicitly verify that `legacy` remains the shipped semantic primary mode until parity evidence says otherwise and that no new silent drops or false alerts are introduced by the cleanup.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
