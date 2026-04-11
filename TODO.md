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

- `MSG-020` Owner `BE`: Fix Telegram attention recurrence semantics so exact or near-exact repeated failure lines can alert again after the bounded churn window expires, while still suppressing short-term duplicate attention flooding and preserving the existing in-place follow-up edit behavior for richer detail on the same recent failure.
- `MSG-021` Owner `BE`: Make prompt-boundary handling chunk-position-aware so meaningful summary or attention content that arrives in the same PTY chunk as a prompt marker is classified and flushed in the correct order instead of being hidden behind an early `Prompt ready.` update.
- `MSG-022` Owner `BE`: Refine coding-agent tail trimming so low-value `/review`, model/budget, diff-marker, and trailing breadcrumb noise is still removed without truncating actionable error context such as file paths, source locations, or other path-bearing diagnostics that belong to the actual failure line.
- `MSG-023` Owner `QA`: Add closeout validation for `v0.4.0-H83`, covering exact-repeat attention recurrence outside the bounded churn window, mixed chunk prompt-boundary plus summary ordering, preservation of actionable path-bearing error text after coding-agent tail trimming, and a deterministic local quality-gate rerun for the Telegram messaging path.
- `QLT-223` Owner `BE`: Add direct request/response schema coverage plus targeted hardening for the remaining least-covered branches in `backend/src/validation.js`, especially the newer deck, session settings, share/control, workspace preset, file-transfer, and custom-command payload variants that still rely heavily on broad integration behavior instead of direct contract tests.
- `QLT-224` Owner `BE`: Add deeper direct runtime branch coverage and targeted hardening for `backend/src/messaging-runtime.js`, `backend/src/telegram-adapter.js`, `backend/src/terminal-app-identity.js`, and `backend/src/terminal-foreground-process.js`, covering distinct-path attention events, exact-repeat alerts outside suppression windows, inbound ambiguity/recovery, polling failure and backlog transitions, weaker app-identity arbitration fallbacks, and local process-inspection edge paths that remain below the repo’s current quality bar.
- `QLT-225` Owner `FE`: Add direct coverage and quality hardening for the lower-covered terminal and layout runtime core in `frontend/src/public/split-layout-runtime-controller.js`, `frontend/src/public/layout-runtime-controller.js`, `frontend/src/public/ui/session-terminal-runtime-controller.js`, and `frontend/src/public/replay-viewer-runtime-controller.js`, focusing on pane-tree mutation corner cases, terminal refresh/mount sequencing, replay viewer fallback states, and layout persistence edge handling.
- `QLT-226` Owner `FE`: Add direct coverage and targeted hardening for the management and workflow controllers with remaining large branch gaps: `frontend/src/public/connection-profile-runtime-controller.js`, `frontend/src/public/workspace-preset-runtime-controller.js`, `frontend/src/public/send-history-runtime-controller.js`, `frontend/src/public/paste-observation-runtime-controller.js`, `frontend/src/public/slash-workflow-runtime-controller.js`, and `frontend/src/public/slash-workflow-source-adapter.js`, especially around malformed stored state, recovery paths, retry/cancel branches, and cross-controller edge-case coordination.
- `QLT-227` Owner `QA`: Add closeout validation for `v0.4.0-H84`, including focused regression coverage for the backend/frontend hotspot files promoted in `QLT-223` through `QLT-226` plus a deterministic full local `lint`, `test`, and `test:coverage:check` rerun on the final tree.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
