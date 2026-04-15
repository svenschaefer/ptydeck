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

- `MSG-102` Owner `PLAT`
  Build a deterministic projection-shadow parity triage surface on top of the shipped `messaging.semantic.shadow` and `terminal.semantic.compare` traces so post-`H136` migration work can be driven by evidence instead of ad hoc live inspection. The tooling and runtime-facing summaries must cluster `primary_only`, `mismatched`, and `shadow_only` outcomes into explicit failure classes such as restart/remount noise, overlay/working noise, overlapping turn ownership, premature quiet-boundary settlement, and semantic-adapter divergence, using both recorded trace replay and bounded live-window analysis.
- `MSG-103` Owner `BE`
  Harden projection admission and restart/remount quarantine so the shipped projection pipeline cannot open reply or autonomous-episode candidates from startup/resume/snapshot noise and cannot let a newly submitted turn inherit already-running semantic output from a previous turn or autonomous episode. New turns must either wait for a quiescent ownership boundary or open behind an explicit barrier that cleanly separates pre-turn output from post-turn output.
- `MSG-104` Owner `BE`
  Tighten projection settlement and dispatch safety while `legacy` remains the shipped primary mode. Quiet-boundary completion must not finalize a projection-backed primary reply if the same correlation immediately resumes activity, and projection-produced primary candidates that remain `mismatched` or problematic `primary_only` cases in shadow comparison must stay non-authoritative until they have a defensible final ownership range or an explicit safe fallback to the legacy result.
- `MSG-105` Owner `QA`
  Validate the `v0.4.0-H137` projection-parity stabilization wave end to end against the known post-restart and trivial-turn failures: restart/remount noise after backend boot, overlay/working contamination, overlapping-output turn inheritance, premature quiet-boundary finalization, and short correct replies such as `Ok, verstanden` or `ja`. Prove that the shipped runtime keeps `legacy` as the authoritative primary path while projection shadow evidence becomes materially cleaner, with stable clustering metrics and no regression to restart recovery, duplicate suppression, Telegram delivery, or the delivered Discord adapter seam.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
