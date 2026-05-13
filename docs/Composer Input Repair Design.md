# Composer Input Repair Design

Status note: this document is a retained design note for deferred future work. It does not create active implementation scope unless a concrete owned task is promoted into `TODO.md`.

## Goal

Define a browser-native, syntax-aware repair path for damaged multiline technical input pasted into the `ptydeck` composer.

The target problem is not formatting already valid syntax. The target problem is reconstructing likely valid syntax from text that was damaged by:

- hard wrapping
- whitespace corruption
- markdown or chat rendering
- PDF extraction
- copy/paste line splitting

## Product Terms

The shipped and future composer actions must stay conceptually separate:

1. `Normalize`
   - conservative whitespace cleanup only
   - currently shipped
   - must stay safe, small, and deterministic

2. `Repair`
   - syntax-aware reconstruction of probably damaged technical input
   - future opt-in action
   - must remain fail-closed on ambiguity

3. `Format`
   - canonical formatting of already valid syntax
   - optional later phase only
   - must never be the authority for repair

`Lint` is intentionally not the primary product term here. Traditional linting assumes parseable syntax and reports rule violations. The future feature is fundamentally a repair system, not a linting system.

## Non-Goals

The repair path must not attempt:

- arbitrary natural-language cleanup
- hidden semantic rewriting
- guaranteed lossless reconstruction
- silent "best guess" mutation on ambiguous input
- IDE-style refactoring

## User-Facing Contract

The future feature should be exposed as an explicit `Repair` action alongside the already shipped `Normalize` action.

The baseline UX rules are:

- `Normalize` stays conservative and always available.
- `Repair` must be opt-in, not automatic on paste.
- The original draft must remain recoverable until the operator explicitly accepts the repaired result.
- The system must not silently send repaired content without operator confirmation.
- Ambiguous input must fail closed instead of guessing.

## Initial Scope

The future rollout should be staged instead of language-generic from day one.

Phase 1 syntax families:

- shell command blocks
  - POSIX shell / bash
  - PowerShell
  - CMD
- JSON
- XML

Deferred until later evidence exists:

- YAML
- JavaScript / TypeScript
- Markdown code blocks with nested language repair
- generic prose-adjacent text

## Architecture

The repair system should follow a strict staged pipeline:

1. input normalization
2. language-family detection
3. syntax-family-specific repair candidates
4. syntax validation
5. confidence scoring
6. operator-facing explanation or diff
7. explicit apply

That means the real authority chain is:

```text
damaged input
-> normalize
-> detect family
-> generate bounded repair candidates
-> validate candidates
-> score confidence
-> show candidate
-> operator applies or rejects
```

## Normalization Layer

This layer must stay intentionally conservative and language-agnostic.

Allowed baseline operations:

- normalize CRLF to LF
- strip trailing horizontal whitespace
- trim outer whitespace
- preserve meaningful internal indentation
- preserve line order

This is already the shipped `Normalize` contract and must remain a separate deterministic stage even after `Repair` exists.

## Detection Layer

The detection layer should combine:

- explicit operator choice when available
- heuristic token analysis
- structural hints from the text
- optional parser probing

Detection must return one of:

- recognized family with strong confidence
- multiple plausible families with weak confidence
- unknown

Only the first case may proceed into automatic candidate generation.

## Repair Layer

Repair must be modular per syntax family. The system should not use one generic newline-merging heuristic across every language.

### Shell / PowerShell / CMD

Candidate operations may include:

- wrapped token continuation
  - `Ubuntu-` + `24.04` -> `Ubuntu-24.04`
- quote continuation
- path continuation
- URL continuation
- shell line-continuation reconstruction
  - `\`
  - `` ` ``
  - `^`
- argument-join heuristics for obviously damaged wraps

This family is the highest-value first target because `ptydeck` is terminal-centric and the user harm from broken command snippets is immediate.

### JSON

Candidate operations may include:

- wrapped string token joins
- safe newline removal inside obviously broken string continuations
- guarded outer-structure preservation

Authority:

- `JSON.parse`

If the repaired result still does not parse cleanly, the feature must fail closed.

### XML

Candidate operations may include:

- wrapped text or attribute-value joins
- guarded tag/attribute continuation joins

Authority:

- XML parse validity

XML should stay conservative because false positives are expensive and "looks plausible" is not enough.

## Validation Layer

Validation, not heuristics, must choose whether a candidate is acceptable.

The candidate selector should prefer:

1. syntactically valid candidates
2. fewer repair operations
3. stronger token/path/quote continuity evidence
4. family-specific structural confidence

If no candidate reaches the minimum confidence bar, the feature must return:

- no repair applied
- reason or uncertainty summary

## Confidence Model

The repair result should be explicit, not magical.

Recommended result shape:

```json
{
  "repaired": true,
  "languageFamily": "powershell",
  "confidence": 0.92,
  "operations": [
    "joined wrapped path token",
    "removed hard-wrap line break inside quoted argument"
  ]
}
```

The exact object shape does not need to be this JSON contract, but the product must preserve these concepts:

- whether a repair happened
- which family was assumed
- how confident the system is
- which operations were applied

## Browser Implementation Direction

The browser stack should stay validator-driven and modular.

Most plausible future candidates:

- `web-tree-sitter` for multi-language probing and syntax error recovery
- `prettier/standalone` only after valid JS/TS/JSON exists
- a browser-safe shell parser or bounded shell-specific heuristics before any future shell formatter step
- DOM diff rendering for before/after preview

Important boundary:

- formatting libraries are optional downstream helpers
- they are not the repair authority

## ptydeck Integration Direction

The feature should integrate at the composer layer, not at send transport time.

That means:

- shared footer composer and pinned overlay composers should both expose the same future `Repair` action
- the repair action should operate on the current local draft
- the operator should be able to inspect and accept the repaired text before send
- accepted repairs should persist through the same server-authoritative composer draft channels already used for `Normalize`

The system should not:

- mutate drafts automatically on paste
- repair on every keystroke
- make the backend the primary low-latency repair engine for ordinary local typing

## Failure Model

The feature must fail closed in these cases:

- language family not recognized confidently
- multiple families remain plausible
- validation still fails after candidate generation
- confidence stays below threshold
- repair would require broad natural-language guessing

Fail-closed behavior should keep the current draft unchanged and explain why no repair was applied.

## Suggested MVP Order

1. add an explicit `Repair` action and diff/preview shell with no language logic yet
2. add shell-family repair with bounded hard-wrap, quote, path, URL, and continuation heuristics
3. add JSON repair with strict `JSON.parse` authority
4. add XML repair with strict parser authority
5. only then consider optional post-repair formatting for families that validate cleanly

## SAS Decision Boundaries

Future implementation will still require `SAS` confirmation on at least these product boundaries:

- whether `Repair` should expose a one-click apply or a mandatory diff-review step
- whether ambiguous repairs may ever be presented as ranked suggestions instead of a single candidate
- which syntax families belong in the first promoted delivery wave
- whether any future paste-hook automation is acceptable beyond the explicit button path
