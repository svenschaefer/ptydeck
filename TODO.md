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

1. `UX-023A` Owner `FE`
   Replace manual SSH trust-entry editing in the `Workspace Library` with a guided first-connect verify/trust flow that can fetch, present, confirm, and persist host-key trust without requiring operators to type `keyType` and raw public key fields by hand before launching a new SSH connection.
2. `UX-023B` Owner `FE`
   Add progressive disclosure to the session settings and connection/workspace management dialogs so the default view surfaces only the primary end-user fields and actions, while low-level launch, input-safety, and expert transport settings move behind clear `Advanced` sections instead of filling the primary v1 surface.
3. `UX-023C` Owner `FE`
   Rework workspace-preset and deck-group detail messaging so the UI explains user effect instead of storage mechanics, including clearer persisted-vs-local wording, clearer apply/save semantics, and more user-oriented summaries of what a preset or group will change.
4. `UX-023D` Owner `QA`
   Add regression coverage for the guided SSH trust flow and progressive-disclosure settings UX, including first-connect trust semantics, basic-versus-advanced visibility rules, and the updated preset/group messaging.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
