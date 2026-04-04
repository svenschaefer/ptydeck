# CODEX CONTEXT - ptydeck

Last updated: 2026-04-04 (H55 slash-command parity delivered; H56 quality hardening delivered; H57 guided management/settings UX closeout delivered; H58 guided SSH trust and progressive-disclosure settings closeout delivered; a new queued H59 quality follow-up now tracks the next repo-wide hardening gaps after the latest aggregate coverage review; Workspace Library panels now stay scrollable inside the dialog shell; `local` connection drafts hide SSH-only controls; guided SSH trust now uses backend SSH host-key probing plus fetch/review/trust flow instead of manual raw key entry; session and management dialogs now use `Advanced` disclosure for low-level fields; non-open dialogs are now explicitly forced back to `display:none` so dialog layout classes cannot leave closed dialogs visible; terminal-local paste now uses a native-helper paste path with a timed clipboard fallback for xterm instances that never emit the follow-up paste event; guarded terminal paste auto-reveals the confirmation UI and now also surfaces the guard summary immediately when strict per-session send-safety holds the paste for confirmation; xterm viewport scrollbar dragging now has a terminal-local drag bridge on the real scrollbar gutter so drag still works when native gutter targeting is unreliable under xterm render layers; the left sidebar `Find`, `Terminal Size`, and `Saved Layouts` sections are now independently collapsible and persist their collapsed state through the existing local layout settings store; restored terminals now get explicit refresh plus fonts-ready reflow stabilization; visible terminals now also run a local mount-stabilization pass after hard reload so the first screen draw does not wait for later interaction; late snapshot-replay retries now trigger the same per-session stabilization pass for terminals that only receive replayed output after a delayed mount; `CHANGELOG.md` owns completed release history.)

Documentation sync status: repository markdown files are aligned on 2026-04-04. `TODO.md` contains open concrete tasks only, `ROADMAP.md` contains only active and queued execution order plus dependencies, `CHANGELOG.md` contains completed and validated release history, and `TODO-OUTLOOK.md` contains only future epics plus deferred explicit backlog.

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
- The next queued release wave is `v0.4.0-H59`.
- Completed wave history is intentionally no longer duplicated across planning documents; it lives in `CHANGELOG.md`.

## Current Queued Follow-up

- `v0.4.0-H59` captures the next repo-wide quality and coverage hardening slice after the latest successful full-gate review on 2026-04-04.
- The concrete near-term hotspots identified in that review were:
  - backend `validation.js` and `ssh-host-key-probe.js`, which still have materially weak direct branch coverage and untested failure-path behavior relative to the rest of the backend surface;
  - the known flaky SSH reconnect and retry integration path, which still occasionally forces isolated reruns even when the aggregate test gate ultimately passes;
  - frontend `file-transfer-runtime-controller.js` and `replay-viewer-runtime-controller.js`, where user-visible failure handling and empty-state behavior are still under-covered;
  - the remaining browser `prompt()` and `confirm()` flows in deck actions, saved layouts, and one session-settings confirmation path, which are inconsistent with the newer in-UI management flows;
  - the branch-heavy frontend runtime hotspots in `split-layout-runtime-controller.js` and `command-send-safety-controller.js`, which remain materially below the aggregate frontend coverage line and still carry non-trivial behavioral complexity.

## Architecture Baselines To Preserve

- Frontend runtime no longer uses the old stream-scanning/plugin/notification path for normal activity handling; keep raw terminal streaming plus visible-output-based active/inactive detection only.
- Command surface model is intentionally consistent: `>` for quick switching, `@<sessionSelector>` for explicit direct-target slash routing, and `/` for the slash-command plane.
- Session notes are persisted and multiline; the session header shows a first-line preview with truncation and tooltip access to the full note.
- Quick-ID swap ordering is backend-persisted and shared across reload, reconnect, and restart restore.
- Send safety is configured through explicit per-session `inputSafetyProfile` option fields, not presets.
- Session settings are tabbed; terminal-surface `Ctrl-C` ambiguity is resolved through a local copy-versus-cancel prompt.
- Remote session baseline exists for `local` and `ssh`, including remote auth metadata, SSH host-key trust persistence, backend SSH host-key probing, reconnect metadata, and saved connection profiles.
- Read-only sharing exists for session/deck spectator access.
- Session-scoped file transfer exists through the bounded backend contract and `/transfer` workflows.
- Controlled mouse forwarding exists as per-session `mouseForwardingMode` (`off|application`), defaulting to `off`.
- Terminal-local paste handling must remain explicit and per-terminal: do not rely only on the browser `paste` event. The delivered baseline now intercepts `Ctrl/Cmd+V`, `Shift+Insert`, `beforeinput` `insertFromPaste`, and clipboard/middle-click paste at both the mounted terminal and the xterm helper textarea/input layer, routes them through the same guarded `onTerminalPaste` path, suppresses duplicate follow-up clipboard events, and also uses the xterm custom key-event hook to stop one terminal from falling back to leaking raw `^V` when the browser-level paste path is bypassed.
- Terminal-local keyboard paste must remain native-first but not native-only: the current delivered fix uses the xterm custom key hook to intercept `Ctrl/Cmd+V` / `Shift+Insert`, records a short-lived pending paste source, prefers the subsequent helper-textarea `beforeinput` / `paste` event for the real payload, and falls back to explicit `readClipboardText()` only if that follow-up event never arrives for the mounted terminal. This preserves the browser-native paste path when available while still covering the broken-terminal case where shortcut interception would otherwise yield raw `^V` or no paste at all.
- Guarded terminal paste must reveal the confirmation surface before staging a pending send. The control-pane body can be hidden, so any send-safety path that stores a pending terminal paste must also call the control-pane `show()` path; otherwise the operator can click paste and see nothing happen even though the paste is waiting for confirmation.
- Session-local paste behavior is intentionally allowed to differ by `inputSafetyProfile`, because strict sessions can hold multiline or recent-target-switch input for confirmation while permissive sessions send it directly. That difference must never be silent: terminal-local guarded paste must surface the returned guard summary immediately so a strict session reads as "confirmation required" rather than "paste is broken".
- Terminal scrollbar dragging must preserve xterm's native viewport contract: keep `.terminal-mount .xterm-viewport` on `overflow-y: scroll` with a stable scrollbar gutter instead of switching it to `auto`, because the auto-scroll override can leave the gutter visually present but not reliably draggable while wheel scrolling still works.
- Native gutter targeting under xterm render layers is not sufficiently reliable on its own. The current baseline therefore supplements the CSS contract with a frontend drag bridge in `frontend/src/public/ui/session-terminal-runtime-controller.js`: left-button drags that start inside the real viewport scrollbar gutter are translated back into `scrollTop` updates until mouseup, so drag remains usable without regressing terminal focus, paste, or middle-click behavior.
- The frontend mouse-forwarding-off output sanitizer must remain chunk-safe: incomplete trailing `ESC[` / CSI fragments are buffered per terminal before mouse-tracking private-mode stripping so split PTY output cannot leak raw cursor-position fragments such as `40;2H` into the rendered terminal.
- Authoritative runtime snapshots must trigger local-only terminal stabilization passes after replay so restored sessions come up visually stable after restart/reconnect: force resize plus viewport refresh must run without emitting backend resize traffic, and hidden terminals must be marked for deferred viewport sync on next reveal.
- Snapshot stabilization now also needs an explicit xterm `refresh(...)` plus one forced resize pass after `document.fonts.ready`; the earlier local-only resize/scroll sync improved restart rendering but still left some terminals partially scrambled until later interaction when late font metrics were involved.
- Hard reload / first-mount rendering also needs a per-terminal local stabilization pass, not only the global snapshot pass: visible terminals now run local-only force resize plus viewport refresh/scroll sync immediately after mount and again on the delayed mount timers so the first clean screen draw does not depend on a later click, focus, or scroll interaction.
- Snapshot replay retries for late-mounted terminals must not skip that stabilization. If a terminal receives replayed output only on a deferred retry, the retry pass must schedule the same local-only post-replay stabilization for that specific session; otherwise the first render can still stay scrambled until some later interaction even though the earlier global snapshot pass already ran.
- Session-settings tabs must keep a stable dialog height across `Startup`, `Note`, and `Theme`; the delivered baseline uses one shared grid-stacked layout with active/inactive panel states so the browser preserves the tallest-panel height instead of depending only on hidden-panel remeasurement during tab switches.
- Custom dialog layout styling must not override the native hidden-state contract for `<dialog>` elements. The current baseline relies on an explicit author-side `dialog:not([open]) { display: none !important; }` rule because `.session-settings-dialog` and `.workspace-manager-dialog` intentionally set custom layout display modes (`grid`) that would otherwise make closed dialogs visible.
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
- The delivered H58 closeout finished the remaining management/settings usability gaps:
  - `frontend/src/public/index.html` and `frontend/src/public/styles.css` now keep the `Workspace Library` body and panels scrollable inside the dialog shell instead of letting the connections surface exceed the viewport without an internal scroll path;
  - `frontend/src/public/connection-profile-runtime-controller.js` now hides SSH-only controls for `local` drafts, keeps auth-specific SSH fields conditional, and uses backend-backed host-key probing plus a fetch/review/trust workflow instead of asking operators to type raw `keyType` and public key values by hand;
  - session settings and management surfaces now keep primary end-user actions visible by default while low-level launch, theme, input-safety, and expert transport controls live behind explicit `Advanced` disclosure sections;
  - workspace preset and deck-group summaries now describe user effect rather than storage mechanics.
- The reduced left sidebar is no longer fully static: `Find`, `Terminal Size`, and `Saved Layouts` each have a header-level disclosure toggle with a persistent collapsed state stored inside `ptydeck.settings.v1`. That disclosure state is global UI preference, not part of saved layout profiles.
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
