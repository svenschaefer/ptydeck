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

1. `UX-025A` Owner `FE`  
   Harden the per-session send-history feature with explicit data-hygiene controls and user-facing persistence semantics, including visible notice that full previously sent payloads are stored locally, clear/delete actions for session-local history, and deterministic handling for sensitive or whitespace-heavy entries so the feature does not silently retain potentially secret command content without an operator escape hatch.
2. `UX-025B` Owner `FE`  
   Protect the composer draft when restoring a send-history entry by adding an explicit replace/merge/cancel flow or equivalent deterministic guard, so `Use in Input` no longer silently overwrites already typed unsent input in the command composer.
3. `UX-025C` Owner `FE`  
   Refine the send-history browser UX so it behaves as a stable per-session inspection surface: keep the dialog pinned to the session it was opened for unless the operator explicitly changes context, keep summary rows compact and scannable even for long payloads, and avoid abrupt search/selection resets caused by unrelated active-session switching while the dialog is open.
4. `UX-025D` Owner `QA`  
   Add regression coverage for the send-history hardening follow-up, including local-persistence disclosure and clear/delete flows, draft-overwrite protection when restoring into a non-empty composer, pinned-session behavior while the dialog stays open, and compact long-entry rendering/search behavior for large histories.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
