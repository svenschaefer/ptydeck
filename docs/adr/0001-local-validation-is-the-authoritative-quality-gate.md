# ADR-0001: Local validation is the authoritative quality gate

- Status: Accepted
- Date: 2026-03-27
- Owners: CODY, QA, PLAT
- Related tasks: DPR-001, DPR-002
- Supersedes: none
- Superseded by: none

## Context

`ptydeck` intentionally relies on local validation instead of GitHub-hosted CI runners.
That is already reflected in the disabled remote workflow, the repository runbooks, and the current delivery process,
but the decision was scattered across `AGENTS.md`, `LOCAL_QUALITY_GATE.md`, and historical closeout notes.

Without one durable record, the repository risks drifting back toward ambiguous quality-gate ownership or duplicated
"maybe local, maybe remote" validation expectations.

## Decision

Local validation is the authoritative quality gate for this repository.

That means:

- release/merge confidence is based on local execution of the documented repository gates
- remote GitHub-hosted CI remains intentionally disabled unless a later ADR changes that decision
- documentation and delivery automation should optimize for deterministic local execution first
- new repository-wide tooling should integrate into the local root scripts (`npm run lint`, `npm run test`, `npm run test:coverage:check`) where practical

## Consequences

Benefits:

- delivery expectations remain explicit and aligned with current infrastructure reality
- the repository can keep using local-only scripts as first-class delivery tooling instead of treating them as CI fallbacks
- contributors have one place to understand why local validation evidence matters

Costs and tradeoffs:

- maintainers must keep local tooling deterministic and well documented
- there is less automatic third-party execution evidence than in a hosted CI model
- future remote-runner adoption now requires an explicit superseding decision instead of creeping in implicitly

## Alternatives Considered

- Re-enable GitHub-hosted CI immediately:
  - rejected for now because the repository intentionally avoids remote-runner dependence and already has a local-only validation contract
- Keep the decision undocumented:
  - rejected because the policy already exists in practice and needs one durable source of rationale

## Validation

Supporting evidence already exists in the repository:

- `.github/workflows/ci.yml` is intentionally disabled
- `AGENTS.md` requires deterministic local validation
- `LOCAL_QUALITY_GATE.md` defines the authoritative local gate sequence
- root scripts now include ADR/tooling checks directly in the normal local workflow
