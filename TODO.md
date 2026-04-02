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

- [ ] `UX-022A` Owner `FE`: Replace the current `Workspace Library` connections tab as a primarily JSON-driven editor with a guided connection-profile flow that exposes explicit `New Local Connection` and `New SSH Connection` entry points, a structured form for the normalized launch fields (`name`, `kind`, `deck`, `shell`, `startCwd`, `startCommand`, `env`, `tags`, theme slots), and keeps raw launch JSON only as an advanced expert section instead of the primary path.
- [ ] `UX-022B` Owner `FE`: Add a complete guided SSH creation and launch path inside the `Workspace Library` connections tab, including explicit `host` / `port` / `username` / auth-method inputs, method-specific fields for `password`, `privateKey`, and `keyboardInteractive`, visible runtime-secret semantics, and a usable host-key trust workflow on top of the existing backend SSH trust-entry contract so creating a new SSH session is understandable without editing raw JSON.
- [ ] `UX-022C` Owner `FE`: Close the remaining usability gaps across the other settings surfaces so they read as a usable v1 instead of internal operator tooling: clarify `Workspace Presets` and deck-group persistence/apply semantics in the workspace-manager dialog, improve the fixed-terminal `Settings` / `Layouts` information architecture and inline guidance, and tighten deck/session settings wording and primary-action labeling so each settings surface has a self-explanatory create/edit/apply/cancel model.
- [ ] `UX-022D` Owner `QA`: Add regression coverage for the guided management/settings closeout, including guided local/SSH connection-profile creation, SSH trust/auth branching, workspace-preset and deck-group semantics, and the updated settings-surface labeling and action flows.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
