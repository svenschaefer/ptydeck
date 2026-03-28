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
- `QLT-153` Owner `FE`: Standardize single-session slash-command targeting on explicit `@target /command ...` routing so historical selector arguments behind commands like `/note`, `/rename`, `/replay`, `/settings`, and similar active-session overrides are replaced by one canonical session-targeting model, while concise active-target forms like `/note test` remain supported.
- `QLT-154` Owner `FE`: Resolve the current `@` namespace conflict between session-target routing and custom-command scope tokens (`@global`, `@project`, `@session:<selector>`) so the command grammar, help, and autocomplete remain unambiguous under the new canonical `@target` model.
- `QLT-155` Owner `FE`: Rationalize `>` quick-switch semantics so it stays session-first navigation by default, with any remaining deck-targeting or cross-deck targeting forms made explicit and consistent instead of sharing an overloaded mental model with plain session switching.
- `QLT-156` Owner `FE`: Rewrite command help, usage strings, autocomplete hints, examples, and command-palette descriptions so `@`, `>`, and `/` present one coherent mental model and no longer advertise deprecated selector-after-slash forms such as `/note 3 test` or `/note active test`.
- `QLT-157` Owner `QA`: Add regression coverage for the unified `@` / `>` / `/` grammar, including parser conflicts, deprecated-form rejection or migration behavior, help/autocomplete alignment, and direct-routing versus active-target shorthand semantics.
- `QLT-158` Owner `BE`: Extend the persisted session-note contract so notes can store deterministic multiline text instead of being collapsed to one whitespace-normalized line, while preserving explicit empty-note clearing semantics and restart persistence.
- `QLT-159` Owner `FE`: Rework the session-settings dialog into organized tabs, add a dedicated note-editing tab that supports multiline note editing, and render the session-header note as first-line-only with ellipsis truncation plus a tooltip containing the full note text.
- `QLT-160` Owner `QA`: Add regression coverage for multiline session-note persistence, tabbed session-settings behavior, note editing/apply flows, and first-line truncation plus full-tooltip rendering in the session header.
- `QLT-161` Owner `FE`: Intercept terminal-surface `Ctrl-C` locally and prompt whether the operator intended `Copy` or `Cancel`, then perform clipboard copy or pass the terminal cancel/interrupt action through according to the explicit choice instead of guessing silently.
- `QLT-162` Owner `QA`: Add regression coverage for terminal `Ctrl-C` disambiguation, including copy-versus-cancel choice handling, clipboard integration, and no-regression behavior when no ambiguity prompt should appear.

## Active Ownership Role

- `CODY` ownership role (active): maintain documentation/task-governance consistency and keep `TODO.md`, `ROADMAP.md`, `DONE.md`, `TODO-OUTLOOK.md`, and `CODEX_CONTEXT.md` synchronized.
