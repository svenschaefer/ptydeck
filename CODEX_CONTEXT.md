# CODEX CONTEXT - ptydeck

Last updated: 2026-04-03 (H55 slash-command parity delivered; H56 quality hardening delivered; H57 guided management/settings UX closeout delivered; post-H57 prompt-free Workspace Library management flows delivered; session-settings dismiss semantics unified; terminal-local paste now relies on native helper-textarea paste events after shortcut interception; guarded terminal paste auto-reveals the confirmation UI; xterm viewport scrollbar dragging is protected from render-layer pointer interception; restored terminals now get explicit refresh plus fonts-ready reflow stabilization; `CHANGELOG.md` owns completed release history.)

Documentation sync status: repository markdown files are aligned on 2026-04-03. `TODO.md` contains open concrete tasks only, `ROADMAP.md` contains only active and queued execution order plus dependencies, `CHANGELOG.md` contains completed and validated release history, and `TODO-OUTLOOK.md` contains only future epics plus deferred explicit backlog.

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
- The next queued release wave is `v0.4.0-H58` (`UX-023A` through `UX-023D`).
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
- Terminal-local paste handling must remain explicit and per-terminal: do not rely only on the browser `paste` event. The delivered baseline now intercepts `Ctrl/Cmd+V`, `Shift+Insert`, `beforeinput` `insertFromPaste`, and clipboard/middle-click paste at both the mounted terminal and the xterm helper textarea/input layer, routes them through the same guarded `onTerminalPaste` path, suppresses duplicate follow-up clipboard events, and also uses the xterm custom key-event hook to stop one terminal from falling back to leaking raw `^V` when the browser-level paste path is bypassed.
- Terminal-local keyboard paste must not immediately force `navigator.clipboard.readText()` from the shortcut key event itself: the current delivered fix uses the xterm custom key hook only to intercept `Ctrl/Cmd+V` / `Shift+Insert`, records a short-lived pending paste source, and then relies on the subsequent native helper-textarea `beforeinput` / `paste` event to carry the actual payload. This avoids the browser's paste overlay / permission path that could appear in some terminals while still yielding no terminal input.
- Guarded terminal paste must reveal the confirmation surface before staging a pending send. The control-pane body can be hidden, so any send-safety path that stores a pending terminal paste must also call the control-pane `show()` path; otherwise the operator can click paste and see nothing happen even though the paste is waiting for confirmation.
- Terminal scrollbar dragging must preserve xterm's native viewport contract: keep `.terminal-mount .xterm-viewport` on `overflow-y: scroll` with a stable scrollbar gutter instead of switching it to `auto`, because the auto-scroll override can leave the gutter visually present but not reliably draggable while wheel scrolling still works.
- The xterm render layer must not shadow the native scrollbar gutter. The current delivered contract keeps `.terminal-mount .xterm-viewport` as the pointer target and disables pointer events on `.xterm-screen` and its canvases so native scrollbar dragging can hit the real viewport instead of the render layer above it.
- The frontend mouse-forwarding-off output sanitizer must remain chunk-safe: incomplete trailing `ESC[` / CSI fragments are buffered per terminal before mouse-tracking private-mode stripping so split PTY output cannot leak raw cursor-position fragments such as `40;2H` into the rendered terminal.
- Authoritative runtime snapshots must trigger local-only terminal stabilization passes after replay so restored sessions come up visually stable after restart/reconnect: force resize plus viewport refresh must run without emitting backend resize traffic, and hidden terminals must be marked for deferred viewport sync on next reveal.
- Snapshot stabilization now also needs an explicit xterm `refresh(...)` plus one forced resize pass after `document.fonts.ready`; the earlier local-only resize/scroll sync improved restart rendering but still left some terminals partially scrambled until later interaction when late font metrics were involved.
- Session-settings tabs must keep a stable dialog height across `Startup`, `Note`, and `Theme`; the delivered baseline uses one shared grid-stacked layout with active/inactive panel states so the browser preserves the tallest-panel height instead of depending only on hidden-panel remeasurement during tab switches.
- The left sidebar is intentionally reduced to connection state, deck/session navigation, `New Deck` / `New Session`, `Find`, `Settings`, and `Layouts`; saved connection-profile and workspace-preset/group management now live in a dedicated secondary management surface outside the sidebar, reachable through the `Manage` entry point in the control-pane meta strip.
- The delivered management surface is a `Workspace Library` dialog with explicit `Connections` and `Workspace Presets` tabs, keeping the sidebar focused on navigation while preserving parity with the existing runtime and slash-command capabilities.
- The delivered H54 follow-up expanded that surface so connection profiles can now be created and edited directly in the dialog with a visible normalized launch payload, workspace presets now expose richer detail and duplication, and deck-group management now makes local-only versus persisted state explicit while matching the slash-command surface through `/workspace group ...`.
- The delivered H55 closeout now keeps the slash-command surface in parity with those delivered management flows:
  - `/connection ...` now supports blank profile creation, active-session draft loading, edited-draft mutation and save, detail inspection, and duplication through explicit slash subcommands.
  - `/workspace ...` now supports saved-preset detail inspection and duplication in addition to the earlier list/save/apply/rename/delete surface.
  - Operator-facing `/settings ...` is now typed and explicit across startup, note, theme, input safety, and mouse forwarding instead of relying on raw JSON mutation payloads as the documented primary path.
- The delivered H57 UX closeout makes the `Workspace Library` and related settings surfaces usable as a guided v1 instead of internal operator tooling:
  - the `Connections` tab now exposes explicit `New Local` and `New SSH` flows, a structured normalized launch form, `Save Profile` and `Save and Launch` actions, and an advanced raw launch JSON preview that is no longer the primary editing path;
  - guided SSH profile creation now keeps host, port, username, auth-method choice, runtime-secret expectations, private-key path input, and SSH host-key trust management in one visible interaction model backed by the existing backend SSH trust-entry contract;
  - the `Workspace Presets` and deck-group areas now explain saved-state semantics more clearly, while the fixed terminal `Terminal Size` / `Saved Layouts` controls and deck/session settings wording now use more self-explanatory primary action labels and inline guidance.
- The post-H57 UX hardening slice further tightened those management/settings flows:
  - primary `Workspace Library` CRUD flows for saved connection profiles, workspace presets, and deck groups no longer rely on browser `prompt()` / `confirm()` dialogs; they now use inline name inputs, inline runtime-secret entry, and inline two-step delete confirmation in the dialog itself;
  - `Save and Launch` for SSH connection-profile drafts must preserve the entered runtime secret across the intermediate save/rerender step before launching the saved profile;
  - session-settings close semantics are now intentionally unified: `Cancel`, dialog dismiss, and `Escape` all discard the draft and resync controls from persisted session state before closing.
- The remaining end-user-friendly management/settings gaps are now explicitly queued in `v0.4.0-H58`:
  - replace manual SSH trust-entry editing with a first-connect verify/trust flow;
  - add `Basic` / `Advanced` progressive disclosure for session settings and management dialogs;
  - replace the remaining preset/group storage-centric wording with clearer effect-centric summaries.
- Help, usage, and autocomplete should continue to be treated as part of the command surface itself so the documented slash plane stays in parity with delivered behavior.
- The H56 quality hardening closeout on 2026-04-02 delivered the identified near-term risk reductions:
  - backend session normalizers (`session-input-safety-profile.js`, `session-mouse-forwarding.js`) now have direct unit coverage for strict versus non-strict normalization and default fallback behavior;
  - frontend helper modules for share-access parsing, mouse-forwarding sequence filtering, and command-suggestion state now have dedicated direct tests instead of only indirect app/runtime coverage;
  - `connection-profile-runtime-controller.js` and `workspace-preset-runtime-controller.js` now have additional direct coverage for update, cancellation, normalization, and local-only edge paths;
  - the generated `theme-library.js` catalog now has dedicated integrity coverage for unique IDs, required color keys, and normalized hex payload shape;
  - `app-runtime-composition-controller.js` now uses an extracted DOM-ref collection seam (`app-runtime-dom-refs.js`) with direct contract coverage instead of keeping that selector contract buried only inside broad app tests.

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
