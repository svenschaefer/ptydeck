# Codex Outbound Stream Processing Concept

Last updated: 2026-04-14

## Current Status Note

The transport-neutral/app-neutral contract layer planned for `v0.4.0-H128` is now partially delivered through `backend/src/terminal-messaging-core.js`, the first `MessageIntent` bridge in `backend/src/messaging-runtime.js`, the first shipped backend terminal projection in `backend/src/terminal-projection.js`, the first live turn/output-episode orchestration layer in `backend/src/messaging-runtime.js`, and the first projection-backed semantic extraction path for narrow allowlist replies and autonomous coding-agent episodes.

That means this concept note is no longer the place to define the neutral core contracts themselves. Its remaining value is the Codex-specific problem framing that explains why the old chunk-first model had to be replaced step by step by a real terminal projection, real turn/output-episode orchestration, and stable semantic extraction.

For the shipped neutral core boundary layer, use `docs/Terminal Messaging Core Architecture.md` as the canonical repository-native reference.

## Purpose

This concept explains what must change in ptydeck so Codex terminal output can later be forwarded to messaging adapters in a logically stable way.

The driving example is a separator-anchored Codex section like:

- a major separator line
- a top-level `•` info line
- one or more indented subsection labels
- one or more indented list items
- optional blank lines between those groups

This example currently fails even though it is operator-visible and semantically coherent.

## The Real Problem

The current `codex_separator_info` path is too close to raw chunk boundaries.

That specific gap is now partially closed in the shipped `v0.4.0-H105` and `v0.4.0-H106` follow-ups: the product now also includes the narrow `codex_separator_section` and `codex_separator_summary_sentence` families, which add chrome-stripped separator-anchored section assembly and strict separator-hint sentence-summary delivery before broader outbound activation. The remaining value of this concept document is the broader architectural direction beyond those shipped narrow Codex families.

It assumes:

1. one major separator entry
2. followed by one clean `• info` entry
3. followed by at most one immediate indented continuation line

That model is too narrow for real Codex output because the operator-visible section is not the same thing as one raw stream entry.

## Fundamental Failure Modes

### 1. Semantic units do not align with raw chunk boundaries

The terminal emits transport chunks, not semantic blocks.

A human sees:

- separator
- section headline
- subsection heading
- bullet list

The raw stream often stores those as:

- partial redraws
- prompt/footer overlap in the same entry
- list items split across separate entries
- section headings and list items detached from the opening bullet

As a result, a valid operator-visible section is rejected before it even becomes a candidate.

### 2. Terminal chrome and content are currently mixed too early

Codex output contains content plus terminal chrome such as:

- prompt lines (`› ...`)
- model/budget/status ribbons
- background-terminal overlays
- interrupt hints
- redraw fragments

The current evaluator can see those markers, but it still reasons on entries where content and chrome already share the same unit.

That is why a valid text like `• Der Restart ist sauber.` can be rejected as `inline_contamination` when the same entry also contains prompt/footer material.

### 3. The current candidate family is too small

`codex_separator_info` currently models only the simplest case:

- separator
- one narrative bullet
- optional one-line continuation

The real Codex output also produces another stable family:

- separator
- one narrative bullet
- indented subsection labels
- indented list items

That is not noise and should not be forced into the single-bullet model.

### 4. The system decides too early

The current evaluator makes candidate decisions at entry level.

For the example section, that is too early.

The correct abstraction is not `entry`, but `assembled section`.

### 5. Delivery policy is downstream of the wrong abstraction

Even when delivery policy is correct, it can only work with the candidates it receives.

If the upstream parser never reconstructs the section, downstream delivery has nothing meaningful to send.

### 6. Operator-visible reality is not the same as retained raw evidence

A user can visually copy a coherent section from the terminal even when the retained raw stream later looks fragmented or contaminated.

That means the system currently lacks a stable intermediate representation of what the operator actually saw.

## Required Architecture Change

The fix is not another regex pass. The fix is a layered stream interpretation pipeline.

## Proposed Processing Layers

### Layer 1. Raw capture

Keep the existing raw capture.

Purpose:

- preserve ANSI/control-sequence evidence
- preserve chunk timing
- preserve prompt-boundary timing

This remains the forensic source, not the message source.

### Layer 2. Chrome scrubber

Introduce a Codex-specific preprocessing layer that separates content from terminal chrome.

It must detect and strip or isolate:

- prompt lines
- model/budget/status ribbons
- background-terminal overlays
- interrupt hints
- tiny redraw fragments
- footer-only status material

Important:

- this layer must not delete content
- it must classify and separate chrome from content before semantic parsing begins

Output of this layer:

- content fragments
- chrome fragments
- uncertainty markers when separation is ambiguous

### Layer 3. Section assembler

After chrome separation, assemble short-lived Codex sections rather than judging single entries.

A section should begin at a major separator and collect bounded content until a section boundary occurs.

Allowed section members:

- first top-level `• info` line
- indented plain-text subsection labels
- indented list items such as `- ...`
- optional blank lines
- optional one-line continuation semantics where appropriate

Section boundary conditions:

- next major separator
- next top-level anti-pattern block (`• Ran`, `• Waited`, `• Explored`, `• Context compacted`, `• Updated Plan`)
- prompt-ready after stable silence
- diff/patch region start
- explicit chrome re-entry after a settled section

The important shift is:

- boundary should close a good section
- not retroactively poison it

### Layer 4. Section classifier

Once a section is assembled, classify its semantic family.

At minimum the model should distinguish:

- `codex_separator_info`
  - one narrative bullet with optional short continuation
- `codex_separator_section`
  - one narrative bullet plus subsection labels and list items
- `codex_tool_block`
  - `Ran`, `Explored`, `Waited`, `Context compacted`, worked-for banners, or command output
- `codex_diff_or_patch`
- `codex_prompt_or_footer`
- `codex_ambiguous`

Only selected families become outbound candidates.

### Layer 5. Candidate normalization

For message-worthy section families, normalize the section into operator-readable text.

Requirements:

- merge soft wraps
- preserve real structure
- preserve subsection labels
- preserve list item grouping
- remove terminal chrome completely
- keep final text bounded and deterministic

For the motivating example, the normalized result should be a structured section, not a single flattened sentence and not raw chunk text.

### Layer 6. Delivery policy

Only after section assembly and classification should delivery policy run.

Delivery policy should reason about:

- section family
- block identity
- whether the new section is a continuation of the same semantic block or a new block
- whether window state is stable enough to allow outbound delivery

This policy should not need to reason about raw prompt contamination anymore.

## Window-State Contract

A separate window-state model still matters.

The outbound path should know whether the current stream is in:

- `restart_remount`
- `overlay_churn`
- `stable_section`
- `background_terminal_overlay`

Rules:

- raw separator-based families should require `stable_section`
- section assembly may run during noisier states, but outbound delivery should stay conservative
- a good completed section may survive noisy transport if its assembled structure is clean enough

## Generic Design Principles

### 1. Stop parsing messages directly from entries

Entries are transport artifacts, not semantic truth.

### 2. Separate chrome from content before content parsing

Prompt/footer contamination is currently treated as content failure. That is the wrong layer.

### 3. Assemble first, classify second, deliver third

The current flow is too close to:

- see entry
- decide candidate or reject

The required flow is:

- collect
- assemble
- classify
- normalize
- deliver

### 4. Add explicit section families

The system must not force all valid Codex output into one narrow family.

### 5. Preserve operator-visible structure

Meaning is carried not just by text, but by:

- separator boundaries
- top-level bullets
- indentation
- subsection labels
- list items
- blank-line grouping

A correct parser must preserve that structure.

### 6. Treat anti-patterns as section boundaries, not universal poison

`Ran`, `Waited`, `Explored`, footer ribbons, and similar patterns should often end a section instead of invalidating earlier good content.

## Consequences for the Current Example

For the motivating example to work, ptydeck must be able to do all of the following:

1. recognize the major separator as section start
2. isolate `• Der Restart ist sauber.` from adjacent prompt/footer material
3. keep `Live-Zustand` as a subsection label
4. keep the following `- ...` lines as list items
5. keep `Wichtig` as another subsection label
6. keep its following `- ...` lines as list items
7. close the section before later chrome or unrelated blocks contaminate it
8. emit one normalized outbound candidate from the assembled section

The current evaluator does only step 1 and part of step 2. That is why this example fails.

## Minimum Product Changes Needed

### Near-term

- keep raw capture
- introduce a chrome/content separation layer for Codex
- introduce a section assembler
- introduce at least one new outbound family: `codex_separator_section`
- keep `codex_separator_info` for the narrow simple case
- keep the hard-break posture for everything outside explicit allowlist families

### Validation

The new pipeline must be validated against:

- real captured Codex restart windows
- real stable work windows
- operator-visible visual dumps
- explicit no-send regressions for `Ran`, `Waited`, `Explored`, prompt/footer, diff/patch, and overlay fragments

## Non-Goals

This concept does not imply:

- enabling broad generic outbound again
- forwarding all Codex summaries
- weakening the hard-break posture
- using Telegram as the source of truth for stream parsing

## Summary

The fundamental problem is structural:

- the system currently decides on the wrong unit

The correct unit is not a raw chunk or even a single cleaned entry.

The correct unit for this class of Codex output is a short-lived, chrome-free, separator-anchored section.

Only after reconstructing that section can ptydeck safely decide whether the content is message-worthy and how it should be delivered.
