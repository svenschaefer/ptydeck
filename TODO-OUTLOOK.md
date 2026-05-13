# TODO-OUTLOOK - Mid and Long Term

Items in this file are intentionally not part of near-term delivery in `TODO.md`.
Completed release and promotion history lives in `CHANGELOG.md`.

This file is structured into:

- Future epics: larger themes that are not yet cut into near-term tasks
- Deferred explicit backlog: concrete tasks with IDs that remain intentionally out of current delivery

## Future Epics

### Security

- [ ] Add complete authentication and authorization model with role scopes.
- [ ] Add auditable action logs for API and session operations.
- [ ] Add managed secrets strategy for production runtime.

### Scale and Runtime Isolation

- [ ] Add horizontal scaling strategy with session affinity.
- [ ] Add isolated worker runtime mode for PTY execution.
- [ ] Add container-per-session runtime option.
- [ ] Add load and soak testing for high concurrent session counts.
- [ ] Add tmux-backed runtime option for true process/session persistence across backend restarts.

### Extensibility

- [ ] Add concrete project-specific automation plugins on top of the frontend plugin infrastructure.

### Messaging Third Attempt

- [ ] Rebuild automatic outbound messaging only from a clean-slate semantic design with an offline-first acceptance corpus.
- [ ] Keep the current transport-only adapter framework as the baseline until that third attempt exists and is proven.

## Deferred Explicit Backlog

### Security

- No deferred explicit security items currently remain.

Notes:

- External terminal and SSH command-surface inspiration continues to include [`withfig/autocomplete`](https://github.com/withfig/autocomplete) for declarative completion specs, generator-backed contextual suggestions, and richer completion metadata.

### Messaging Adapters

- The 2026-04-16 reset removed automatic terminal-output-to-message delivery from the live product path.
- The current shipped baseline is transport-only: adapter lifecycle, topic provisioning, inbound command/input handling, explicit `MessageIntent` delivery support, and transport health/metrics remain in place.
- The retained framework has since also been reduced to a cleaner contract surface: `DeliveryAdapter`, `MessageIntent`, transport shaping helpers, adapter implementations, command publication, and backend-local custom-command helpers remain; projection-/turn-/allowlist-specific coupling no longer remains in that kept baseline.
- Historical stream-to-message experiments, projection/shadow migration, restart-resend heuristics, and narrow Codex allowlists are now archived as markdown learnings rather than active product behavior.

- [ ] `MSG-201` Owner `SAS`: Define the single authoritative live delivery contract for a third messaging attempt. The design must state exactly which outputs are message-worthy, which outputs are never message-worthy, how restart behavior works, and what the acceptance corpus must prove before any automatic outbound is re-enabled.
- [ ] `MSG-202` Owner `PLAT`: Build an offline corpus/replay harness from archived PTY captures, debug logs, and operator-visible transcript fixtures so future messaging semantics can be evaluated without running inside the live delivery path.
- [ ] `MSG-203` Owner `BE`: Design a clean-slate semantic extraction pipeline that has one live authority only, no production shadow mode, no concurrent legacy/projection branches, and no hidden allowlist exceptions. The design may reuse the retained adapter framework, but it must not depend on the removed `codex_*` live control flow.
- [ ] `MSG-204` Owner `QA`: Define and automate the golden-case acceptance suite for the third attempt, including restart behavior, short replies, multiline structured replies, duplicate prevention, and known historical failure cases before any code is allowed back into the live product path.
- [ ] `MSG-205` Owner `BE`: Reintroduce automatic outbound delivery only after `MSG-201` through `MSG-204` are complete, with explicit `SAS` sign-off and a transport-only fallback still available during rollout.
- [ ] `MSG-009` Owner `PLAT`: After a new automatic outbound baseline exists again, add an interaction-oriented Discord adapter path that preserves the same single-user ptydeck authority boundaries while validating a richer button- or workflow-driven remote interaction surface instead of only plain outbound message parity.
- [ ] `MSG-010` Owner `PLAT`: After the third attempt is proven on at least one live outbound path plus Discord, add a Slack-style workflow-oriented adapter focused on concise summaries, handoff context, and approval/status-style workflows rather than stream mirroring.
- [ ] `MSG-011` Owner `QA`: After a second concrete post-reset outbound adapter lands, add cross-adapter parity and contract validation ensuring provider-specific adapters still honor the same normalized event model, bounded action vocabulary, and ptydeck authority rules.

### Composer Input Repair

- [ ] `CMP-405` Owner `FE`: Add an opt-in structure-aware composer repair action on top of the conservative `Normalize` action. The feature must fail closed unless it can confidently recognize a specific format such as shell command blocks, JSON, or XML, and it must never silently rewrite ambiguous multiline input.

Notes:

- The retained design frame for this deferred feature now lives in `docs/Composer Input Repair Design.md`.
- The current product terminology is intentionally split into `Normalize` (already shipped conservative whitespace cleanup), future `Repair` (opt-in syntax-aware reconstruction), and optional later `Format` (canonical formatting only after valid syntax exists).
