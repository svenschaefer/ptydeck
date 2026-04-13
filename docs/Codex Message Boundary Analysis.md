# Codex Message Boundary Analysis

This note analyzes the end criteria that decide how Codex stream fragments become Telegram messages.
The concrete trigger for this analysis was the observation that many delivered Telegram messages appear to contain only the first line or first short paragraph of a larger Codex closing comment, even when the operator-visible terminal block clearly spans multiple visual lines.

The original analysis in this note led directly to delivered `v0.4.0-H115`.
The historical evidence and option comparison remain relevant because they explain why the shipped fix uses ownership handoff between `codex_separator_info` and `codex_separator_section` instead of widening the narrow `info` family again.
The later 2026-04-13 architecture review also showed that message-boundary refinement alone is not the full answer for free-form replies: the original `codex_input_reply` path still gated eligibility on Telegram origin, while the observed noon `ptydeck` case showed that relevant new reply blocks can also arise from REST or frontend input and should still be promotable as Telegram-visible messages once they are recognized as relevant stream content.

## Scope

This is analysis only.
It does not change product behavior.

The evidence base in this note comes from three sources:

- the shipped evaluator code in `backend/src/codex-outbound-evaluator.js`
- current runtime dispatch in `backend/src/messaging-runtime.js`
- operator-view transcript fixtures in `docs/examples/codex-terminal-dump-2026-04-11-22-41.txt` and `docs/examples/codex-terminal-dump-2026-04-11-23-30.txt`

## Current Families and Their Real End Criteria

### 1. `codex_separator_info`

This is the narrowest family.
It starts only after a major separator and then looks for a single `• info` bullet.

Current behavior from `backend/src/codex-outbound-evaluator.js`:

- only one immediate indented continuation line is allowed
- any second extra content line in the same entry becomes `multi_line_contamination`
- any tail line, prompt, separator, diff/output, worked-for banner, or another bullet becomes contamination
- after the info bullet is accepted, the candidate stays open only for one possible continuation step
- the candidate then closes by one of these conditions:
  - immediate inline continuation already consumed
  - next substantial non-continuation entry
  - continuation gap elapsed (`500ms`)
  - flush at stream end

Relevant implementation points:

- single continuation only: `backend/src/codex-outbound-evaluator.js:266-285`
- continuation analysis: `backend/src/codex-outbound-evaluator.js:307-325`
- candidate finalization rules: `backend/src/codex-outbound-evaluator.js:758-823`
- main info-state machine: `backend/src/codex-outbound-evaluator.js:834-953`

Practical consequence:

- this family is structurally biased toward one short paragraph
- it is not a true section assembler
- it closes before a larger multi-line closing comment can fully accumulate unless that comment still fits into the one-headline-plus-one-continuation shape

### 2. `codex_separator_section`

This is the richer structural family.
It also starts after a major separator, but it assembles a bounded section instead of stopping at one short bullet.

Current behavior from `backend/src/codex-outbound-evaluator.js`:

- prompt/footer/background chrome is scrubbed before section assembly
- one narrative `• info` headline starts the section
- the section may then include:
  - plain continuation text
  - subsection labels
  - list items
- the section ends when a structural boundary is seen:
  - next separator
  - next anti-bullet such as `Ran`, `Explored`, `Waited`, `Context compacted`, `Updated Plan`
  - next info bullet
  - diff/output marker
  - prompt/chrome marker
  - explicit flush
  - gap timeout / lookahead exhaustion

Relevant implementation points:

- section line classification: `backend/src/codex-outbound-evaluator.js:327-386`
- stable-section gating: `backend/src/codex-outbound-evaluator.js:465-527`
- section assembly and closure: `backend/src/codex-outbound-evaluator.js:546-704`

Important detail:

- the section family requires more than a trivial shape
- if there is no subsection, no list item, and fewer than two continuation text lines, it is rejected as `section_too_shallow`

Practical consequence:

- this family is the only current product path that can faithfully represent a larger multi-line Codex closing comment as one message-sized unit
- it is already much closer to the operator-visible transcript grammar

### 3. `codex_separator_summary_sentence`

This family is intentionally different.
It does not preserve multi-line structure.
It turns a separator-hint summary flush into one sentence-like message.

Relevant implementation points:

- summary evaluation: `backend/src/codex-outbound-evaluator.js:187-235`
- runtime summary upgrade path: `backend/src/messaging-runtime.js:1820-1830`

Practical consequence:

- this family is appropriate for condensed status summaries
- it is not appropriate for preserving larger multi-line Codex closing comments

## Runtime Selection Order

The runtime dispatches `section` and `info` candidate evaluation on every stream entry:

- `backend/src/messaging-runtime.js:1833-1848`

The order is:

- `advanceCodexSeparatorSectionState(...)`
- `advanceCodexSeparatorInfoState(...)`

Summary-family promotion is separate and happens only on aggregated summary flushes:

- `backend/src/messaging-runtime.js:1820-1830`
- `backend/src/messaging-runtime.js:1852-1865`

This means the message-end problem is not just “which family exists”, but also “which family dominates in actual live traffic”.

## Live Evidence: `ptydeck` Currently Delivers Mostly the Narrow Family

From the current live process window, the last 120 minutes of delivered `ptydeck` Telegram messages are all:

- `codex_separator_info`: `15`
- `codex_separator_section`: `0`
- `codex_separator_summary_sentence`: `0`

This was measured from `/tmp/ptydeck-backend-debug.log` with `scripts/analyze-live-messaging-runtime.mjs`.

That is the key practical mismatch:

- the product already has a richer `section` family
- but current `ptydeck` live output is still dominated by `info`
- so the actual user-visible Telegram feed remains biased toward short paragraph closure

Representative current delivered `ptydeck` messages are therefore short paragraphs such as:

- `Der Slice ist sauber. Ich committe jetzt H113<path> und pushe direkt danach.`
- `Die Coverage-Prüfung läuft noch im Frontend-Teil, bislang sauber. Ich warte den finalen Abschluss weiter ab, damit der Commit auf vollständigen Gates basiert.`

These are coherent, but they are still the narrow family.
They are not assembled as larger final comment sections.

## Operator-View Evidence from Transcript Fixtures

The helper `scripts/analyze-codex-message-boundaries.mjs` was added to analyze separator-anchored blocks in the tracked transcript fixtures.

Measured against the two fixtures:

### `codex-terminal-dump-2026-04-11-22-41.txt`

- total separator-anchored blocks: `6`
- multiline blocks: `5`
- deep blocks (`>= 3` lines): `2`
- blocks that fit current `info`: `4`
- blocks that fit current `section`: `1`
- closure by next anti-bullet: `5`
- closure by next separator: `1`

### `codex-terminal-dump-2026-04-11-23-30.txt`

- total separator-anchored blocks: `20`
- multiline blocks: `19`
- deep blocks (`>= 3` lines): `9`
- blocks that fit current `info`: `11`
- blocks that fit current `section`: `7`
- closure by next anti-bullet: `17`
- closure by next info bullet: `1`
- closure by next separator: `1`
- closure by prompt: `1`

The important part is not the raw count difference.
It is the closure pattern:

- operator-visible Codex blocks usually end at the next top-level structural marker
- not at the first wrapped line
- the dominant end markers in the transcript are:
  - next anti-bullet
  - next info bullet
  - next separator
  - prompt

That is exactly the section-style boundary model.

## Concrete Synthetic Proof for the Restart-Status Example

The motivating restart-status example behaves like this under the current shipped evaluator:

- `codex_separator_info` rejects it with `multi_line_contamination`
- `codex_separator_section` accepts it and closes it on the next anti-bullet

In other words:

- the current product already knows how to represent that example correctly
- but only through the `section` family, not through the narrow `info` family

## What This Means

The current system does **not** simply “take only the first line”.
That would be too crude.

The more accurate diagnosis is:

1. `info` is intentionally a small message unit
- one bullet headline
- at most one immediate continuation
- very early closure

2. `section` is the real multi-line message unit
- it already uses the right kind of structural end criteria
- but it is not the dominant live family for current `ptydeck` traffic

3. `summary_sentence` is intentionally lossy
- it should stay sentence-like
- it is not the correct place to preserve larger closing comments

So the user-visible problem is not “there is no end criterion”.
The problem is:

- the currently dominant live family for many `ptydeck` messages is still the narrow one
- while the operator-visible terminal grammar for Codex closing comments often wants the richer section boundary model

There is also a separate architectural issue above pure boundaries:

- the free-form reply path currently treats Telegram origin as an eligibility condition
- but the correct long-term model is stream-first and content-first
- origin should only influence routing or reply-thread preference after a relevant block already exists

## Option Comparison

### Option A: Widen `codex_separator_info`

Example direction:

- allow more than one continuation line
- delay closure longer

Pros:

- smallest code delta

Cons:

- wrong semantic level
- still weak for subsection/list structures
- pushes a narrow family into becoming a half-section assembler
- likely increases ambiguity and contamination risk

Assessment:

- not the cleanest path

### Option B: Let `summary_sentence` carry more content

Example direction:

- allow multi-line or multi-fragment summary flushes

Pros:

- easy to route because summaries already exist

Cons:

- wrong source layer
- loses transcript structure by design
- risks reintroducing resend/duplicate complexity on the summary family

Assessment:

- not the right family for this problem

### Option C: Promote more separator-anchored closing comments onto the `section` path

Example direction:

- preserve the current narrow `info` family for genuinely short paragraph bullets
- when the same separator-anchored block clearly keeps accumulating stable continuation text, subsection labels, or list items before the next top-level marker, let the section family own the full block

Pros:

- matches operator-visible transcript structure
- matches the observed end markers from the fixtures
- keeps summary-family semantics clean
- keeps short simple bullet messages on the existing `info` path

Cons:

- requires careful promotion/ownership rules so the `info` path does not emit too early

Assessment:

- best fit with the current evidence

### Option D: Add a completely new “closing comment” family

Pros:

- very explicit

Cons:

- another family boundary to maintain
- premature unless `section` promotion still proves insufficient

Assessment:

- only justified if a `section`-first refinement still cannot carry the real closing-comment shapes

## Recommended Generic Concept

The clean generic direction is:

1. Keep `codex_separator_summary_sentence` as a compact sentence family.
2. Keep `codex_separator_info` as the short paragraph family.
3. Treat `codex_separator_section` as the authoritative family for larger separator-anchored closing comments.
4. Refine the family-selection and finalization logic so multi-line closing comments are not prematurely emitted by the `info` path when the same anchored block is still visibly growing toward a stable section boundary.

That is now the shipped behavior after `H115`:

- `codex_separator_info` is deferred while the same separator/headline pair is still owned by an active section candidate
- `codex_separator_section` wins when the block keeps growing into a stable multi-line closing comment
- short paragraph bullets still fall back to `codex_separator_info` after an explicit shallow-section rejection

In practical terms, the correct end criteria for the larger message unit are:

- next top-level bullet
- next anti-bullet
- next separator
- prompt/chrome boundary
- explicit flush

## 2026-04-13 Follow-up: Boundary Rules Are Not Sufficient for Telegram Replies

The later live Telegram case `Wie geht’s weiter?` proved that message-boundary refinement alone is not enough.

What happened in that window:

- Telegram input was received correctly in the mapped `ptydeck + ptydeck` topic
- the message was accepted and written into the mapped session
- Codex emitted a meaningful answer sentence into the PTY stream
- that answer still did not become a Telegram message

The reason was not a failed boundary close on a separator-anchored block.
The reason was that the answer was not separator-anchored at all.
It appeared inside ongoing plan/list output, so it matched none of the currently shipped narrow families:

- not `codex_separator_info`
- not `codex_separator_section`
- not `codex_separator_summary_sentence`

This means the product currently has two distinct outbound problems:

1. separator-anchored multi-line closing comments need better ownership between `info` and `section`
2. Telegram free-text questions need a bounded reply-correlated outbound path that does not depend on separator anchoring

That gap was first narrowed by delivered `H116` and then completed by delivered `H117`:

1. `H116` added a bounded reply-block path for free-text questions even when the answer is not separator-anchored
2. `H117` moved that reply-block path to a stream-first, source-agnostic promotion model so the same relevant answer block can be promoted after Telegram, REST, or frontend submit input instead of only after Telegram-origin input
3. the remaining boundary-refinement work identified here was then closed by delivered `H115`

After `H115`, `H116`, and `H117`, the product has both:

- reply-block promotion for non-separator Codex question/answer cases without requiring Telegram as the eligibility gate
- ownership handoff from `info` to `section` for separator-anchored multi-line closing comments

That is the message boundary model that best matches the current transcript evidence.

## 2026-04-13 Follow-up: Remaining Gap Is Block Assembly, Not More Family Tuning

The later post-13:00 CEST `H118 is delivered and pushed.` field case showed that the remaining gap is now earlier than family selection.

What happened in that window:

- the large closing block was visibly structured in the terminal
- the first chunk already contained inline prompt/footer chrome
- the following lines then fragmented into transient `attention_required` and degraded `status_update` traces
- no stable assembled block survived long enough for `codex_separator_info`, `codex_separator_section`, or `codex_separator_summary_sentence` to promote it as one message

This means the current outbound model is still too dependent on:

- a clean first chunk
- a perfect separator start
- line-local termination rules

The next architectural step is therefore not another narrow family tweak.
It is a pre-classification block-assembly layer with:

- provisional start instead of first-chunk gating
- bounded multi-chunk assembly before classification
- soft end instead of immediate prompt/boundary termination
- block-level classification after assembly instead of line-local classification during assembly

That is the explicit focus of queued `H119`.

## Analysis Artifacts

- `scripts/analyze-codex-message-boundaries.mjs`
- `test/analyze-codex-message-boundaries.test.js`
- `scripts/analyze-live-messaging-runtime.mjs`
- `docs/examples/codex-terminal-dump-2026-04-11-22-41.txt`
- `docs/examples/codex-terminal-dump-2026-04-11-23-30.txt`
