# TODO - ptydeck

This file defines concrete, open implementation tasks only.
Ordering, versions, and dependency sequencing live in `ROADMAP.md`.
Completed work belongs in `DONE.md`.

## Ownership Model

- `CODY`: Codex documentation and delivery owner
- `BE`: Backend implementation owner
- `FE`: Frontend implementation owner
- `PLAT`: Tooling, CI/CD, and runtime owner
- `QA`: Test automation owner

## Active Open Tasks (Current)

- `QLT-150` Owner `BE`: Add a persisted quick-ID ordering contract so manual `/swap` operations are stored in backend state, restored across backend restarts, and exposed deterministically alongside sessions/decks instead of remaining browser-local only.
- `QLT-151` Owner `FE`: Rewire `/swap` and the frontend session-ordering/runtime surfaces to use the backend-backed persisted quick-ID ordering model so swapped IDs survive reloads, reconnects, and cross-browser/operator views consistently.
- `QLT-152` Owner `QA`: Add regression coverage for persisted quick-ID swap behavior across reload, reconnect, restart restore, deck ordering, and conflict/normalization edge cases.
- `QLT-153` Owner `FE`: Standardize slash-command targeting on explicit `@target` routing in command input so selector arguments behind slash commands are deprecated in favor of forms like `@3 /note test`, while keeping concise active-target forms like `/note test` and removing `/note active ...` style redundancy from help and guidance.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
