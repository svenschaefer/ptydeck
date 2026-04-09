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

- [ ] `DOC-001` Owner `PLAT`: Add a repo-native handbook toolchain with deterministic `docs:generate` and `docs:check` entry points, a stable generated-output layout under `docs/reference/`, and failure-on-drift behavior so generated reference pages can be refreshed locally and enforced in normal quality-gate workflows instead of living as ad hoc hand-edited markdown.
- [ ] `DOC-002` Owner `FE`: Generate the slash-command handbook reference from `frontend/src/public/command-schema.js`, including canonical commands, aliases, subcommands, arguments, and concise help text so operator-facing command documentation no longer depends on separately maintained manual lists.
- [ ] `DOC-003` Owner `BE`: Generate the backend/API handbook reference from `backend/openapi/openapi.yaml`, including route grouping, request/response/auth notes, and stable markdown output so the handbook’s transport and contract reference stays aligned with the implemented API surface.
- [ ] `DOC-004` Owner `FE`: Generate a session-settings and input-behavior reference from the delivered UI/runtime contract, covering the `Startup`, `Input`, `Note`, and `Theme` tabs, send terminators, mouse forwarding, and input-safety options/defaults so the handbook can document those controls without manually duplicating field-level truth.
- [ ] `DOC-005` Owner `CODY`: Add the initial handbook skeleton under `docs/manual/` with a durable index plus the first high-value operator guides for startup/session creation, session settings, paste/send safety, replay copy/paste, workspace library flows, and trusted-local multi-device control, explicitly linking to generated reference pages instead of re-documenting the same facts inline.
- [ ] `DOC-006` Owner `QA`: Add handbook drift checks and closeout validation for the first documentation wave, including generated-doc freshness enforcement, command/reference contract tests against current code, and example-command verification for the documented slash-command flows.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
