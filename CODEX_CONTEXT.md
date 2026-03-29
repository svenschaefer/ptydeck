# CODEX CONTEXT - ptydeck

Last updated: 2026-03-29 (documentation governance refactor completed; `CHANGELOG.md` now owns completed release history; there is currently no active delivery wave in `TODO.md` / `ROADMAP.md`.)

Documentation sync status: repository markdown files are aligned on 2026-03-29. `TODO.md` contains open concrete tasks only, `ROADMAP.md` contains only active and queued execution order plus dependencies, `CHANGELOG.md` contains completed and validated release history, and `TODO-OUTLOOK.md` contains only future epics plus deferred explicit backlog.

## Current Documentation Contract

- `TODO.md`: open concrete tasks only.
- `ROADMAP.md`: active and queued waves only; ordering, versions, and dependencies.
- `CHANGELOG.md`: completed and validated release history.
- `TODO-OUTLOOK.md`: future epics and deferred explicit backlog only.
- `CODEX_CONTEXT.md`: persistent architecture, process, and governance context only.

## Ownership Model

- `SAS`: final decision authority.
- `CODY`: documentation and coordination owner.
- `BE`: backend implementation owner.
- `FE`: frontend implementation owner.
- `PLAT`: platform/runtime owner.
- `QA`: quality and test owner.

## Current Delivery State

- There is no active release wave currently.
- New near-term work must be promoted from `TODO-OUTLOOK.md` into `TODO.md` and `ROADMAP.md` before implementation.
- Completed wave history is intentionally no longer duplicated across planning documents; it lives in `CHANGELOG.md`.

## Architecture Baselines To Preserve

- Frontend runtime no longer uses the old stream-scanning/plugin/notification path for normal activity handling; keep raw terminal streaming plus visible-output-based active/inactive detection only.
- Command surface model is intentionally consistent: `>` for quick switching, `@<sessionSelector>` for explicit direct-target slash routing, and `/` for the slash-command plane.
- Session notes are persisted and multiline; the session header shows a first-line preview with truncation and tooltip access to the full note.
- Quick-ID swap ordering is backend-persisted and shared across reload, reconnect, and restart restore.
- Send safety is configured through explicit per-session `inputSafetyProfile` option fields, not presets.
- Session settings are tabbed; terminal-surface `Ctrl-C` ambiguity is resolved through a local copy-versus-cancel prompt.
- Remote session baseline exists for `local` and `ssh`, including remote auth metadata, SSH host-key trust persistence, reconnect metadata, and saved connection profiles.
- Read-only sharing exists for session/deck spectator access.
- Session-scoped file transfer exists through the bounded backend contract and `/transfer` workflows.
- Controlled mouse forwarding exists as per-session `mouseForwardingMode` (`off|application`), defaulting to `off`.

## Quality and Operational Rules

- Keep markdown content in US English.
- Do not mark work as done before implementation, validation, and documentation sync are complete.
- Close implementation tasks with the local quality gate unless a narrower documented equivalent is explicitly agreed for the scope: `npm run lint`, `npm run test`, `npm run test:coverage:check`.
- Do not leave orphan validation or background processes behind.
- Major architecture changes require explicit confirmation by `SAS`.

## Deferred Theme Clusters

- Security and multi-tenancy
- Scale and runtime isolation
- Extensibility
- Technical alternatives and stack evolution
- Remote / external theme compatibility (`REM-008A`, `REM-008B`, `REM-008C`)
