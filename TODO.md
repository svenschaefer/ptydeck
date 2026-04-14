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

- `MSG-097` Owner `BE`
  Introduce explicit turn-ownership and admission barriers on top of the delivered projection/turn core so a newly opened turn cannot inherit already-running assistant output from a previous turn or autonomous episode. When a submit-bearing input arrives while semantic output is still active, the runtime must either defer turn activation until a quiescent boundary exists or create an explicit ownership barrier that cleanly separates pre-turn output from post-turn output, instead of letting the next reply candidate absorb stale tail text from the still-running prior episode.
- `MSG-098` Owner `BE`
  Tighten turn-finalization semantics for overlapping-output cases so the runtime does not finalize and deliver a primary reply at the first quiet boundary if the same turn correlation resumes with fresh activity immediately afterward. The projection-backed turn pipeline must treat repeated post-boundary activity on the same correlation as evidence that the earlier quiet window was not the final semantic boundary, and it must keep reply delivery stable until the turn has a defensible final ownership range.
- `MSG-099` Owner `QA`
  Validate the overlapping-output turn-ownership correction end to end against the live post-restart failures: the first Telegram restart turn where projection preferred startup/working noise over `Der Restart ist live ...`, and the later short `ja` turn that delivered a prior analysis tail instead of a turn-owned reply. Prove that new turns no longer inherit already-running output, that reply finalization waits for a defensible terminal boundary, and that autonomous episodes still deliver independently without regressing restart recovery, duplicate suppression, or the shipped Telegram/Discord adapter seams.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
