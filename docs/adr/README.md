# ADR Process

Architecture Decision Records (ADRs) capture durable technical decisions that affect repository structure,
runtime contracts, operating constraints, or delivery governance.

## When To Write An ADR

Create an ADR when a change does at least one of the following:

- introduces or replaces a major technical boundary
- changes a durable contract between backend, frontend, or operations
- changes repository-wide development workflow or governance
- carries meaningful tradeoffs that should stay explainable after the implementation lands

Minor refactors, isolated bug fixes, and routine dependency updates do not need an ADR.

## Decision Authority

- `SAS` remains the final decision authority for major architecture changes.
- ADRs document the decision and rationale; they do not bypass change control in `AGENTS.md`.

## File Naming And Numbering

Store ADRs in this directory.

- Template: `docs/adr/0000-template.md`
- Real ADRs: `docs/adr/NNNN-short-kebab-title.md`
- Numbering is monotonically increasing and zero-padded to 4 digits.

Examples:

- `docs/adr/0001-local-validation-is-authoritative.md`
- `docs/adr/0002-session-replay-export-contract.md`

## Required Sections

Every ADR must contain at least:

- `# ADR-NNNN: Title`
- `- Status:`
- `- Date:`
- `## Context`
- `## Decision`
- `## Consequences`

Optional but recommended sections:

- `## Alternatives Considered`
- `## Validation`

## Status Values

Use one of these statuses:

- `Proposed`
- `Accepted`
- `Rejected`
- `Superseded`
- `Deprecated`

If an ADR is superseded, keep the old ADR file and link both records explicitly.

## Workflow

1. Create the next ADR from the template:
   - `./scripts/new-adr.sh "Short decision title"`
2. Fill in the context, decision, and consequences before or alongside implementation.
3. Mark the final accepted/rejected state once the decision is settled.
4. If a later ADR replaces it, update `Superseded by` / `Supersedes` references instead of deleting history.

## Validation

Repository lint includes `./scripts/check-adr-process.sh`.
The checker enforces the required ADR file structure so the process stays mechanically consistent.
