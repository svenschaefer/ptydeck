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

- [ ] `MSG-043` Owner `BE`: Introduce a Codex-specific pre-delivery section-processing path ahead of the current raw-entry allowlist evaluator so separator-anchored outbound candidates are assembled from cleaned semantic sections instead of single retained entries: strip prompt/footer/background-terminal chrome out of mixed entries, preserve the current `codex_separator_info` family, and add a bounded separator-anchored section assembler that can retain one narrative `•` headline plus subsection labels and indented list items without widening generic Telegram outbound.
- [ ] `MSG-044` Owner `BE`: Add a second narrow Codex outbound allowlist family, `codex_separator_section`, on top of that section-processing path, including explicit section boundaries, window-state gating, and deterministic block-aware delivery semantics so anti-pattern bullets (`Ran`, `Waited`, `Explored`, `Context compacted`, `Updated Plan`), prompt markers, footer ribbons, and diff/output fragments close or reject sections without collapsing back into broad stream mirroring.
- [ ] `MSG-045` Owner `QA`: Add closeout validation for `v0.4.0-H105`, including replay/capture regressions for the motivating restart-status section shape, explicit no-send regressions for prompt/footer contamination and anti-pattern boundaries, and the full local quality gate rerun on the final tree.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
