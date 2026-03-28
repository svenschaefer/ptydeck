# ROADMAP - ptydeck

This file defines execution order, release versions, and dependencies for tasks listed in `TODO.md`.
`TODO.md` remains the source of task definitions.

## Ownership and Release Control

- Roadmap owner: `CODY`
- Release execution owners: `BE`, `FE`, `PLAT`, `QA`
- Final decision authority: `SAS` (Sven A. Schaefer, `svenschaefer`, `sven.schaefer@gmail.com`)
- Versioning scheme: compressed pre-1.0 milestones and wave-based follow-up releases through the active `v0.4.x` series

## Current Execution Status

- Active release wave: `v0.4.0-H48` (Read-Only Sharing Baseline).
- Active scoped tasks: `REM-007A`, `REM-007B`, `REM-007C`.
- Latest completed wave: `v0.4.0-H47` (Session File Transfer Baseline, `REM-006A`, `REM-006B`, `REM-006C`).
- Previous completed wave: `v0.4.0-H46` (Deck Sidebar Action Consolidation, `QLT-163`, `QLT-164`, `QLT-165`, `QLT-166`, `QLT-167`).
- Previous completed wave: `v0.4.0-H45` (Terminal Ctrl-C Intent Prompt, `QLT-161`, `QLT-162`).
- Previous completed wave: `v0.4.0-H44` (Session Settings Tabs and Multiline Notes, `QLT-158`, `QLT-159`, `QLT-160`).
- Previous completed wave: `v0.4.0-H43` (Command Surface Consistency, `QLT-153`, `QLT-154`, `QLT-155`, `QLT-156`, `QLT-157`).
- Previous completed wave: `v0.4.0-H42` (Persisted Quick-ID Swap Ordering, `QLT-150`, `QLT-151`, `QLT-152`).
- Previous completed wave: `v0.4.0-H40` (Saved Connection Profiles, `REM-004A`, `REM-004B`, `REM-004C`).
- Previous completed wave: `v0.4.0-H39` (Remote Reconnect Contract, `REM-005`).
- Previous completed wave: `v0.4.0-H38` (Remote SSH Session Foundation, `REM-001`, `REM-002`, `REM-003`, `REM-009`).
- Previous completed wave: `v0.4.0-H37` (Workflow Safety Guardrails, `SWF-007`, `SWF-008`).
- Previous completed wave: `v0.4.0-H36` (Workflow Control-Plane Runtime, `SWF-006`).
- Previous completed wave: `v0.4.0-H35` (PTY Control Endpoints, `SWF-005`).
- Previous completed wave: `v0.4.0-H34` (Slash Workflow Foundation, `SWF-001`, `SWF-002`, `SWF-003`).
- Previous completed wave: `v0.4.0-H33` (Command Namespaces and Scriptability, `CMD-010`, `CMD-011`, `CMD-012`).
- Previous completed wave: `v0.4.0-H32` (Scoped Custom-Command Sets, `CMD-007`, `CMD-008`, `CMD-009`).
- Earlier completed wave: `v0.4.0-H31` (Fuzzy and Personalized Command Suggestions, `CMD-004`, `CMD-005`, `CMD-006`).
- Earlier completed wave: `v0.4.0-H30` (Parameterized Custom Command Templates, `CMD-001`, `CMD-002`, `CMD-003`).
- Earlier completed wave: `v0.4.0-H29` (Control-Plane and Execution-Plane Separation, `UX-014`, `UX-015`, `UX-016`).
- Previous completed wave: `v0.4.0-H28` (Split Layout Foundation, `UX-011`, `UX-012`, `UX-013`).
- Previous completed wave: `v0.4.0-H27` (Workspace Group Broadcast Input, `UX-008`, `UX-009`, `UX-010`).
- Previous completed wave: `v0.4.0-H26` (Session Grouping and Workspace Presets, `UX-005`, `UX-006`, `UX-007`).
- Previous completed wave: `v0.4.0-H25` (Session Theme Dual-Scheme and Composer/Help Simplification, `QLT-144`, `QLT-145`, `QLT-146`, `QLT-147`, `QLT-148`, `QLT-149`).
- Previous completed wave: `v0.4.0-H24` (Frontend Quick-ID Swap Consistency, `QLT-142`, `QLT-143`).
- Previous completed wave: `v0.4.0-H23` (Persistent Layout Profiles, `UX-002`, `UX-003`, `UX-004`).
- Previous completed wave: `v0.4.0-H22` (Command Palette and Keyboard Navigation, `UX-001`).
- Previous completed wave: `v0.4.0-H21` (Developer Productivity Templates and ADR Process, `DPR-001`, `DPR-002`).
- Previous completed wave: `v0.4.0-H20` (Replay Reading Mode, `REP-004`, `REP-005`).
- Previous completed wave: `v0.4.0-H19` (Session Replay Export Baseline, `REP-001`, `REP-002`, `REP-003`).
- Previous completed wave: `v0.4.0-H18` (Shell Runtime Compatibility Foundation, `DRV-001`, `DRV-002`, `DRV-005`).
- Previous completed wave: `v0.4.0-H17` (Frontend Stream Runtime Cleanup, `QLT-140`, `QLT-141`).
- Previous completed wave before that: `v0.4.0-H16` (Target Clarity and Send Safety, `QLT-137`, `QLT-138`, `QLT-139`).
- Previous completed wave before that: `v0.4.0-H15` (Persistent Session Notes, `QLT-135`, `QLT-136`).
- Previous completed wave before that: `v0.4.0-H14` (Frontend Quick-ID Swap Command, `QLT-134`).
- Previous completed wave before that: `v0.4.0-H13` (Attention Header Text Silence, `QLT-133`).
- Previous completed wave before that: `v0.4.0-H12` (Frontend Notification Silence by Default, `QLT-132`).
- Previous completed wave before that: `v0.4.0-H11` (Header Status Churn Suppression, `QLT-131`).
- Previous completed wave before that: `v0.4.0-H10` (Debug Query Override Hardening, `QLT-130`).
- Previous completed wave before that: `v0.4.0-H9` (Invisible Stream Activity Filtering Hardening, `QLT-129`).
- Previous completed wave before that: `v0.4.0-H8` (Script Execution Traceability, `QLT-128`).
- Previous completed wave before that: `v0.4.0-H7` (WebSocket Origin Allowlist Enforcement, `ENT-017`).
- Previous completed wave before that: `v0.4.0-H6` (Startup Warmup Gate and Bootstrap Deferral, `QLT-126`, `QLT-127`).
- Previous completed wave before that: `v0.4.0-H5` (Stream Activity Noise Filtering, `QLT-125`).
- Previous completed wave before that: `v0.4.0-H4` (Declarative Command Contract, `DRV-003A` ... `DRV-004`).
- Previous completed wave before that: `v0.4.0-H3` (Terminal Interaction Ergonomics, `QLT-123` and `QLT-124`).
- Previous completed wave before that: `v0.4.0-H2` (Layered Frontend Architecture Completion, `ARC-009` ... `ARC-012`).
- Earlier completed wave before that: `v0.4.0-H1` (Observability Expansion, `OBS-001` ... `OBS-004`).

## Active Wave

### v0.4.0-H48 - Read-Only Sharing Baseline (Active)

- Active scoped tasks: `REM-007A`, `REM-007B`, `REM-007C`

Dependencies:

- `REM-007A` lands first so the backend defines one authoritative sharing and spectator-permission contract before the frontend invents another local-only share model.
- `REM-007B` follows `REM-007A`, so sharing UI and spectator-state rendering bind to the final backend permission model instead of implying write control locally.
- `REM-007C` closes after `REM-007A` and `REM-007B`, so regression coverage locks read-only enforcement and share lifecycle behavior end to end.

Exit criteria:

- Backend exposes a deterministic session/deck sharing contract with explicit read-only spectator semantics and revocation support.
- Frontend exposes operator sharing workflows plus visible permission state so spectators are clearly separated from controlling operators.
- Regression coverage exists for share lifecycle behavior, read-only enforcement, and reconnect/reload consistency.

## Latest Completed Wave

### v0.4.0-H47 - Session File Transfer Baseline (Completed)

- Completed scoped tasks: `REM-006A`, `REM-006B`, `REM-006C`

Dependencies:

- `REM-006A` landed first so the backend now defines one authoritative upload/download contract, transfer capability policy, and path/size guardrail model before frontend workflows depend on it.
- `REM-006B` followed `REM-006A`, so slash-command and operator workflows now bind to the final backend transfer semantics instead of another local or shell-mediated path.
- `REM-006C` closed after `REM-006A` and `REM-006B`, so regression coverage now locks the actual backend/frontend file-transfer contract end to end.

Exit criteria:

- Backend now exposes bounded upload and download endpoints for session-scoped file transfer with deterministic normalization and rejection behavior.
- Frontend now exposes operator file-transfer workflows through slash commands with explicit status and rejection feedback.
- Regression coverage now exists for allowed/denied transfers, path normalization, size guardrails, and end-to-end success behavior.

## Previous Completed Wave

### v0.4.0-H46 - Deck Sidebar Action Consolidation (Completed)

- Completed scoped tasks: `QLT-163`, `QLT-164`, `QLT-165`, `QLT-166`, `QLT-167`

Dependencies:

- `QLT-163` landed first so deck rename/delete actions now live behind one active-deck-local settings affordance instead of a separate global button stack.
- `QLT-164` followed `QLT-163`, so the top-row `New Deck` plus `New Session` layout now reflects the final deck-action ownership model.
- `QLT-166` reused the completed `v0.4.0-H42` persisted quick-ID ordering contract inside the new deck-settings entrypoint instead of introducing another local-only swap surface.
- `QLT-165` and `QLT-167` now close the wave with regression coverage for the consolidated deck-action UX and the deck-settings swap management path.

Exit criteria:

- Standalone left-sidebar `Rename Deck` and `Delete Deck` buttons are removed.
- The currently selected deck button now exposes a settings affordance that reaches rename/delete deck actions.
- The top sidebar actions now present `New Deck` and `New Session` side by side.
- The deck-settings surface now exposes persisted quick-ID ordering and allows swap/reorder management there in addition to slash-command usage.
- Regression coverage now exists for deck-action access, active-deck affordances, top-row layout behavior, and deck-settings swap management.

## Previous Completed Wave

### v0.4.0-H45 - Terminal Ctrl-C Intent Prompt (Completed)

- Completed scoped tasks: `QLT-161`, `QLT-162`

Dependencies:

- `QLT-161` landed first so terminal-surface `Ctrl-C` intent disambiguation now has one authoritative FE behavior before the regression matrix locks it in.
- `QLT-162` closed after `QLT-161`, so regression coverage now asserts the actual copy-versus-cancel UX, clipboard behavior, and terminal pass-through semantics end to end.

Exit criteria:

- Pressing `Ctrl-C` on the terminal surface no longer silently guesses between clipboard copy and terminal cancel when the shortcut is ambiguous.
- The operator now gets an explicit `Copy` versus `Cancel` choice, and the chosen action is carried out deterministically.
- Regression coverage now exists for the prompt behavior and for non-regression of the terminal interrupt path.

### v0.4.0-H44 - Session Settings Tabs and Multiline Notes (Completed)

- Completed scoped tasks: `QLT-158`, `QLT-159`, `QLT-160`

Dependencies:

- `QLT-158` landed first because multiline note editing could not be delivered correctly while backend note normalization still collapsed line breaks away.
- `QLT-159` followed `QLT-158`, reusing the authoritative persisted multiline-note contract while reorganizing session settings into tabs and moving note editing into a dedicated tab.
- `QLT-160` closed after `QLT-158` and `QLT-159`, locking multiline persistence, tabbed settings UX, and first-line-only header rendering against the final contract.

Exit criteria:

- Session notes persist multiline text without collapsing line breaks away.
- Session settings are organized into tabs, including a dedicated note tab for editing multiline notes.
- Session headers show only the first note line with truncation and ellipsis behavior, while the full note remains available via tooltip.
- Regression coverage exists for persistence, settings UX, and header rendering behavior.

### v0.4.0-H43 - Command Surface Consistency (Completed)

- Completed scoped tasks: `QLT-153`, `QLT-154`, `QLT-155`, `QLT-156`, `QLT-157`

Dependencies:

- `QLT-153` followed `v0.4.0-H42` so persisted quick-ID ordering was in place first, then single-session slash-command targeting could consistently prefer `@target` forms against stable quick IDs.
- `QLT-154` followed `QLT-153`, resolving the `@` namespace collision with custom-command scope tokens after the canonical session-targeting form was defined.
- `QLT-155` followed `QLT-153` and `QLT-154`, rationalizing `>` quick-switch semantics against the final `@` and `/` targeting model instead of another intermediate grammar.
- `QLT-156` followed `QLT-153`, `QLT-154`, and `QLT-155`, so help, autocomplete, palette descriptions, and examples now document the final command surface rather than transitional syntax.
- `QLT-157` closed after `QLT-153` through `QLT-156`, so regression coverage now locks the unified grammar and help surfaces end to end.

Exit criteria:

- Single-session slash commands now consistently use explicit `@target /command ...` targeting instead of selector arguments after `/command`.
- The `@` grammar is now unambiguous despite the existing custom-command scope system.
- `>` remains a clear session-first switching shortcut, with deck-oriented variants explicit instead of implicit.
- Help, autocomplete, and command-palette surfaces now document the same model and stop advertising deprecated selector-after-slash forms.
- Regression coverage now exists for grammar, parser conflicts, help alignment, and shorthand/direct-target behavior.

### v0.4.0-H42 - Persisted Quick-ID Swap Ordering (Completed)

- Completed scoped tasks: `QLT-150`, `QLT-151`, `QLT-152`

Dependencies:

- `QLT-150` landed first so persisted quick-ID ordering and normalization now live in one backend-owned contract before the frontend stopped relying on browser-local swap persistence.
- `QLT-151` followed `QLT-150` and now reuses that persisted contract for `/swap`, deck/session ordering, and restored UI state instead of inventing a second frontend-only persistence path.
- `QLT-152` closed after `QLT-150` and `QLT-151`, so regression coverage now locks restart/reload/reconnect ordering behavior against the actual persisted model.

Exit criteria:

- Manual `/swap` operations now persist outside one browser storage context and survive backend restart/restore.
- Frontend deck/session ordering surfaces now consume the same persisted quick-ID contract consistently across reloads and reconnects.
- Regression coverage now exists for swap persistence, restore/reload behavior, and ordering normalization/conflict handling.

## Previous Completed Wave

### v0.4.0-H40 - Saved Connection Profiles (Completed)

- Completed scoped tasks: `REM-004A`, `REM-004B`, `REM-004C`

Dependencies:

- `REM-004A` established the persisted backend saved-connection-profile contract first so reusable launch presets for local shells and SSH targets now live in one backend-owned model instead of a frontend-only bookmark layer.
- `REM-004B` followed that contract and reused it for sidebar and slash-command workflows, with profile application still respecting the existing non-persisted `remoteSecret` boundary for password-style SSH auth.
- `REM-004C` closed after `REM-004A` and `REM-004B`, so regression coverage now spans profile validation, persistence/restore, deck-reference cleanup, slash-command help/usage surfaces, and frontend launch/apply flows end to end.

Exit criteria:

- Backend persists normalized saved connection profiles with non-secret launch metadata, deck-reference cleanup, and `connectionProfileId`-based session creation.
- Frontend exposes discoverable sidebar and `/connection ...` workflows for list/save/show/apply/rename/delete behavior against the backend contract.
- Password and keyboard-interactive SSH profiles never persist secrets; applying those profiles still prompts for a runtime-only secret when required.

## Previous Completed Wave

### v0.4.0-H39 - Remote Reconnect Contract (Completed)

- Completed scoped task: `REM-005`

Dependencies:

- `REM-005` followed the completed H38 remote-session foundation so reconnect semantics build on the existing unified `local|ssh` session contract, auth handling, and trust-store rules instead of inventing a second remote-runtime model.

Exit criteria:

- SSH-backed sessions expose an explicit degraded/offline lifecycle instead of looking identical to healthy local PTY sessions after disconnect or launch loss.
- Backend reconnect behavior is deterministic and bounded, with operator-visible retry metadata and no silent infinite retry loop.
- Restore/restart semantics preserve the new remote reconnect state without weakening the H38 secret/trust safety boundaries.

## Previous Completed Wave

### v0.4.0-H38 - Remote SSH Session Foundation (Completed)

- Completed scoped tasks: `REM-001`, `REM-002`, `REM-003`, `REM-009`

Dependencies:

- `REM-001` landed first so remote-session identity, persistence, and launch semantics now exist before any SSH credential or trust-path logic is layered on top.
- `REM-002` is now complete on top of `REM-001`, so the SSH authentication matrix, non-persisted secret boundary, askpass launch wiring, and forwarding/proxy guardrails now exist before host-key trust is layered on top.
- `REM-003` closed on top of the completed `REM-001` and `REM-002` contract, so host-key trust reuses one backend-owned SSH session/auth model instead of diverging into a parallel launch path.
- `REM-009` closed after `REM-001`, `REM-002`, and `REM-003`, so regression coverage now exercises the real remote-session runtime, authentication boundary, trust-store, and guardrail behavior end to end.

Exit criteria:

- Backend supports deterministic `local` and `ssh` session kinds through one persisted session contract with normalized non-secret remote metadata and reconnect-safe restore behavior.
- SSH-backed sessions support the initial authentication matrix and explicit host-key trust-store flow without storing secrets in plaintext persistence or bypassing changed-host-key rejection.
- Regression coverage exists for remote launch/auth/trust flows and the associated guardrail failures.

## Previous Completed Wave

### v0.4.0-H37 - Workflow Safety Guardrails (Completed)

- Completed scoped tasks: `SWF-007`, `SWF-008`

Dependencies:

- `SWF-007` followed the completed H36 control-plane delivery and hardened that same frontend workflow runtime with deterministic limits and exact-once cleanup rather than inventing a second backend-owned workflow safety path.
- `SWF-008` closed after `SWF-007`, so regression coverage exercises the actual guarded runtime behavior and workflow-control semantics end to end.

Exit criteria:

- The frontend workflow runtime enforces deterministic guardrails for workflow step count, maximum wait timeout, and bounded captured source text instead of allowing unbounded workflow payload growth.
- Guardrail failures are explicit and deterministic, and cancelling or stopping a waiting workflow leaves no orphan subscriptions or timers behind.
- Regression coverage exists for guardrail enforcement, timeout/cancel behavior, PTY-exit waits, and control-plane workflow safety semantics.

## Previous Completed Wave

### v0.4.0-H36 - Workflow Control-Plane Runtime (Completed)

- Completed scoped tasks: `SWF-006`

Dependencies:

- `SWF-006` builds directly on the completed H34 frontend workflow foundation and the completed H35 backend PTY control endpoints, so workflow execution and workflow control reuse existing parser/engine and backend signal contracts instead of inventing a second runtime path.

Exit criteria:

- The existing multiline slash-command composer can start deterministic slash workflows through the completed H34 parser/engine path instead of keeping that foundation disconnected from the operator surface.
- The control pane renders explicit workflow run state (`running`, `waiting`, terminal target, current step progress, and failure outcome) without reviving the removed stream-interpretation/notification runtime.
- Separate control-plane actions exist for `Stop Workflow`, `Interrupt`, and `Kill Session`, with the terminal signal actions reusing the completed H35 backend endpoints instead of being encoded as ordinary workflow DSL steps.
- Regression coverage exists for workflow start/stop behavior, explicit PTY control actions, and UI/control-plane state transitions in the frontend runtime.

## Previous Completed Wave

### v0.4.0-H35 - PTY Control Endpoints (Completed)

- Completed scoped tasks: `SWF-005`

Dependencies:

- `SWF-005` follows the completed H34 workflow foundation so terminal interruption/escalation is available through explicit backend runtime controls before any later frontend workflow-control surface is added.

Exit criteria:

- Backend exposes deterministic `POST /api/v1/sessions/{sessionId}/interrupt`, `/terminate`, and `/kill` endpoints with OpenAPI coverage, runtime routing, request validation, and `sessions:write` authz handling.
- PTY control endpoints dispatch explicit `SIGINT`, `SIGTERM`, and `SIGKILL` signals through one backend session-manager path instead of inventing one-off route-specific signal logic.
- Missing-session and already-removed-session paths fail with deterministic `404 SessionNotFound` behavior instead of hanging or silently succeeding.
- Regression coverage exists for route/contract conformance, request validation, and end-to-end runtime signal behavior.

## Previous Completed Wave

### v0.4.0-H34 - Slash Workflow Foundation (Completed)

- Completed scoped tasks: `SWF-001`, `SWF-002`, `SWF-003`

Dependencies:

- `SWF-001` landed first so workflow submissions have one strict grammar and AST contract before any runtime execution or wait semantics are layered on top.
- `SWF-002` followed `SWF-001` and reuses the finalized workflow AST plus the existing slash-command registry/executor instead of inventing a second command-dispatch path for workflow steps.
- `SWF-003` closed after `SWF-001` and `SWF-002`, so wait-step cancellation semantics are implemented against the real workflow state machine and can share one abort/cleanup contract across all in-flight step types.

Exit criteria:

- The frontend accepts one strict slash-workflow grammar with deterministic AST output and explicit parse errors for malformed directives, malformed regex, malformed block payloads, and missing required arguments.
- Workflow execution is modeled explicitly as `ready -> running -> waiting -> succeeded|failed|stopped|cancelled`, with sequential step evaluation and deterministic stop-on-failure/time-out behavior.
- Wait-step primitives exist for delay-based and observable-condition-based waits, and each in-flight wait can be cancelled immediately without leaving orphan timers or subscriptions behind.
- Regression coverage exists for workflow parsing, execution state transitions, and abortable wait semantics.

## Previous Completed Wave

### v0.4.0-H33 - Command Namespaces and Scriptability (Completed)

- Completed scoped tasks: `CMD-010`, `CMD-011`, `CMD-012`

Dependencies:

- `CMD-010` establishes deterministic namespaced aliases first so the command plane has one canonical registry of short names plus explicit domain-prefixed forms before any multi-command scripting is layered on top.
- `CMD-011` follows `CMD-010` and reuses that alias registry for sequential slash-command script execution, avoiding a second parser or executor path for scripted command-plane automation.
- `CMD-012` closes after `CMD-010` and `CMD-011`, so regression coverage spans alias resolution, help/autocomplete/palette surfacing, backward compatibility, and stop-on-failure multi-command execution behavior end to end.

Exit criteria:

- The slash-command plane supports explicit domain-prefixed aliases for the existing command families without breaking current short-form command usage.
- Help, autocomplete, and the command palette expose the new namespaced command forms deterministically while keeping short forms available.
- The frontend can execute a deterministic sequential command-plane script from one composer submission, short-circuiting on failure and reporting concise aggregated results without mixing slash-command scripting with PTY input semantics.
- Regression coverage exists for alias resolution, backward compatibility, and command-script execution behavior.

### v0.4.0-H32 - Scoped Custom-Command Sets (Completed)

- `CMD-007`, `CMD-008`, `CMD-009`

Dependencies:

- `CMD-007` established the persisted scoped-command contract first so command scope and precedence are stored in the backend custom-command model instead of becoming a second frontend-only overlay.
- `CMD-008` followed `CMD-007` and reused that contract for slash-command, preview, autocomplete, and command-palette behavior, while keeping backward-compatible unscoped commands deterministic under the new precedence rules.
- `CMD-009` closed after `CMD-007` and `CMD-008`, so regression coverage now spans migration, scope visibility, precedence ordering, session binding, and execution behavior end to end.

Exit criteria:

- Backend-exposed custom commands can persist explicit `global`, `project`, and `session` scopes with deterministic normalization, optional session binding, and backward-compatible handling of legacy commands.
- Frontend command surfaces can create, show, list, preview, autocomplete, and execute scoped custom commands while exposing scope clearly and resolving precedence deterministically.
- Regression coverage exists for migration/backward compatibility, scope visibility, precedence resolution, and execution-time behavior across REST and frontend command flows.

## Previous Completed Wave

### v0.4.0-H31 - Fuzzy and Personalized Command Suggestions (Completed)

- `CMD-004`, `CMD-005`, `CMD-006`

Dependencies:

- `CMD-004` established deterministic fuzzy ranking first so the suggestion surfaces gain broader recall without sacrificing exact-prefix predictability or stable ordering guarantees.
- `CMD-005` followed `CMD-004` and layered browser-local recency personalization on top of the deterministic fuzzy baseline instead of inventing a separate ranking path for the command palette and composer autocomplete.
- `CMD-006` closed after `CMD-004` and `CMD-005`, so regression coverage now spans exact-prefix priority, fuzzy fallback ordering, recency weighting, and stable no-history behavior end to end.

Exit criteria:

- Composer autocomplete and the command palette both support deterministic fuzzy matching across the existing command/session/deck/custom-command surfaces without regressing exact-prefix behavior.
- Browser-local recency can personalize ranking when multiple fuzzy matches are otherwise comparable, while deterministic fallback order still applies when history is absent or tied.
- Regression coverage exists for exact-prefix priority, fuzzy recall, personalized ranking, and no-history fallback behavior.

## Previous Completed Wave

### v0.4.0-H30 - Parameterized Custom Command Templates (Completed)

- `CMD-001`, `CMD-002`, `CMD-003`

Dependencies:

- `CMD-001` established the persisted backend contract first so template-capable custom commands reuse the existing custom-command storage and API surface instead of introducing a second frontend-only command-template model.
- `CMD-002` followed the completed `CMD-001` contract and reused it for `/custom` save/show/preview/execute flows, deterministic parameter parsing, preview substitution, and strict missing-placeholder feedback in the existing command plane.
- `CMD-003` closed after `CMD-001` and `CMD-002`, so regression coverage now spans REST validation, persistence/backward compatibility, frontend preview/execution behavior, and template error handling end to end.

Exit criteria:

- Backend-exposed custom commands can persist either plain content or an explicit template-command variant with deterministic placeholder validation and strict built-in template-variable allowlisting.
- Frontend `/custom` flows can save, preview, show, and execute template commands with deterministic parameter substitution while existing plain custom commands continue to work unchanged.
- Missing or unknown template inputs fail loudly with concise operator guidance instead of silently sending unresolved placeholders.
- Regression coverage exists for contract validation, backward compatibility, preview behavior, and execution-time template substitution.

## Previous Completed Wave

### v0.4.0-H29 - Control-Plane and Execution-Plane Separation (Completed)

- `UX-014`, `UX-015`, `UX-016`

Dependencies:

- `UX-014` establishes the persisted workspace-chrome contract first so control-plane pane state is stored alongside the already completed layout-profile and workspace-preset layout model instead of becoming a local-only frontend flag.
- `UX-015` follows `UX-014` and reuses that contract to separate operator controls from terminal execution surfaces without disturbing the completed split-layout execution pane model from `v0.4.0-H28`.
- `UX-016` closes after `UX-014` and `UX-015`, so regression coverage spans normalization, persistence, toggle/resize behavior, apply/restore consistency, and responsive fallback end to end.

Exit criteria:

- Backend-exposed layout profiles and workspace presets can persist explicit control-pane workspace chrome state with deterministic normalization and restart-safe restore behavior.
- Frontend renders a dedicated control-plane pane for operator controls and a separate execution plane for terminal sessions, with deterministic collapse/toggle/resize behavior.
- Applying a layout profile or workspace preset restores both split-layout execution panes and the new control-pane state consistently.
- Regression coverage exists for backend normalization plus frontend apply/toggle/resize/responsive behavior.

## Previous Completed Wave

### v0.4.0-H28 - Split Layout Foundation (Completed)

- `UX-011`, `UX-012`, `UX-013`

Dependencies:

- `UX-011` established the persisted split-layout contract first by extending the completed layout-profile and workspace-preset baseline, so split-pane state is not trapped in a frontend-only runtime.
- `UX-012` followed `UX-011` and reuses that contract for horizontal/vertical pane rendering, drag/resize behavior, pane-weight normalization, session-to-pane assignment, and backend-backed apply/save behavior instead of inventing a second local split-layout model next to profiles/presets.
- `UX-013` closed after `UX-011` and `UX-012`, so regression coverage now spans backend normalization, frontend pane rendering, resize behavior, quick-ID-aware pane ordering, deleted-session cleanup, and profile/preset apply/restore consistency end to end.

Exit criteria:

- Backend-exposed layout profiles and workspace presets can persist per-deck split-layout trees with deterministic normalization, pane-weight validation, and deleted-session fallback rules.
- Frontend can render horizontal/vertical split panes, resize them, assign sessions to panes, and save/apply those layouts through the persisted contract instead of a temporary client-only model.
- Applying a layout profile or workspace preset restores split-pane structure and assigned sessions consistently, and visible pane contents continue to follow current quick-ID ordering.
- Regression coverage exists for backend normalization plus frontend apply/resize/session-cleanup behavior.

## Previous Completed Wave

### v0.4.0-H27 - Workspace Group Broadcast Input (Completed)

- `UX-008`, `UX-009`, `UX-010`

Dependencies:

- `UX-008` reuses the completed `v0.4.0-H26` workspace-preset and session-group contract as the only authoritative source for group membership, so broadcast targeting does not introduce a second local-only grouping model.
- `UX-009` follows `UX-008` by exposing group broadcast control through `/broadcast status`, `/broadcast off`, and `/broadcast group [group]`, plus one-line composer target-summary integration, while keeping explicit `@target ...` direct routing authoritative for single-target overrides.
- `UX-010` closes after `UX-008` and `UX-009`, so regression coverage now spans broadcast-target resolution, composer send fan-out, direct-route bypass, and help-surface integration end to end.

Exit criteria:

- The frontend can route ordinary composer sends to the active or explicitly selected workspace group on the active deck without changing the persisted backend contract.
- Slash-command control exists for broadcast-mode status, activation, and disable flows.
- The one-line composer target summary reflects group broadcast mode clearly, while direct `@target ...` routing still bypasses broadcast mode deterministically.
- Regression coverage exists for broadcast-target resolution, command execution, composer send fan-out, and help/overview integration.

## Previous Completed Wave

### v0.4.0-H26 - Session Grouping and Workspace Presets (Completed)

- `UX-005`, `UX-006`, `UX-007`

Dependencies:

- `UX-005` established the persisted workspace-preset contract first so session-group and preset state now have one authoritative backend source instead of being split across ad hoc frontend storage and layout-profile side channels.
- `UX-006` followed `UX-005` and reuses that contract for session-group switching plus preset create/apply/rename/delete flows, while consuming the already completed layout-profile workflow instead of duplicating layout persistence.
- `UX-007` closed after `UX-005` and `UX-006`, so regression coverage now spans normalization, restart persistence, session-delete cleanup, invalid payload handling, and frontend apply behavior end to end.

Exit criteria:

- Backend exposes persisted workspace presets with deterministic `activeDeckId`, optional linked `layoutProfileId`, and explicit per-deck ordered session-group definitions.
- Frontend can create, rename, delete, list, and apply workspace presets, and can switch between persisted session groups inside the active deck without inventing a second local-only grouping model.
- Applying a workspace preset restores its linked deck/layout context and session-group state consistently from the persisted contract.
- Regression coverage exists for backend contract behavior, frontend preset/group flows, restart persistence, and deleted-session cleanup.

## Previous Completed Wave

### v0.4.0-H25 - Session Theme Dual-Scheme and Composer/Help Simplification (Completed)

- `QLT-144`, `QLT-145`, `QLT-146`, `QLT-147`, `QLT-148`, `QLT-149`

Dependencies:

- `QLT-144` established the persisted backend contract for two independently selectable per-session theme slots, `activeThemeProfile` and `inactiveThemeProfile`, so the frontend did not invent a local-only dual-theme model.
- `QLT-145` followed `QLT-144` and applies the two user-selected theme schemes in session settings plus runtime theme switching when active-session state changes.
- `QLT-146` closed in the same UX simplification wave by removing replay actions from the terminal header in favor of the existing slash-command path.
- `QLT-147` extended the already persisted input-safety profile to paste-triggered input flows without introducing a second safety profile model.
- `QLT-148` closed after the replay-action removal and guarded-input work so the one-line composer metadata strip reflects the final feedback shape without a visible preset label.
- `QLT-149` closed after the command-plane simplification work so `/help` and `/help <topic>` now reflect the final active slash-command surface consistently.

Exit criteria:

- Session settings and runtime support two explicit user-selectable theme schemes per terminal session, one used when the terminal is active and one used when it is inactive.
- Terminal cards no longer expose `View` and `DL` replay actions in the header; replay remains available through slash commands.
- Paste-triggered shell input is guarded by the same per-session input-safety preset/profile as explicit send actions.
- The composer metadata strip is reduced to one line with ` · ` separators and no preset label above the input box.
- Slash help supports both a main overview and command/topic-specific sub-help output.

## Previous Completed Wave

### v0.4.0-H24 - Frontend Quick-ID Swap Consistency (Completed)

- `QLT-142`, `QLT-143`

Dependencies:

- `QLT-142` keeps the existing frontend-local quick-ID model but makes quick-ID order authoritative for rendered session order in the deck sidebar, workspace grid, and selector-driven navigation so `/swap` changes become visible immediately instead of staying cosmetic.
- `QLT-143` follows `QLT-142` and persists the frontend-local quick-ID mapping in browser storage so manual swaps survive browser reloads without introducing backend persistence or changing the intentionally short-lived quick-ID contract.

Exit criteria:

- `/swap <selectorA> <selectorB>` immediately reorders visible session surfaces according to swapped quick IDs instead of only changing labels.
- Quick-ID-ordered behavior is consistent across sidebar rendering, terminal-card order, and selector-driven navigation paths such as `/list`, `/next`, and `/prev`.
- Frontend-local quick-ID swaps survive browser reloads within the same browser storage context while remaining intentionally non-backend-persisted.
- Regression coverage exists for quick-ID swap ordering, browser-storage restore, and app-level render behavior.

## Previous Completed Wave

### v0.4.0-H23 - Persistent Layout Profiles (Completed)

- `UX-002`, `UX-003`, `UX-004`

Dependencies:

- `UX-002` establishes the backend layout-profile contract first so one persisted source owns named layout profiles instead of splitting state across local-only storage and ad hoc frontend commands.
- `UX-003` follows `UX-002` and reuses that contract for discoverable UI plus slash-command create/apply/rename/delete flows without introducing a parallel client-only profile model.
- `UX-004` closes after `UX-002` and `UX-003` so regression coverage spans persistence, restart restore, apply semantics, and invalid-payload handling end to end.

Exit criteria:

- Backend exposes named layout profiles with deterministic normalization for active deck, sidebar visibility, session filter text, and per-deck terminal geometry settings.
- Frontend can create, apply, rename, delete, and list layout profiles through one shared workflow surface plus slash-command access.
- Applying a layout profile updates active deck, sidebar visibility, session filter text, and relevant deck terminal geometry consistently from the persisted contract.
- Regression coverage exists for backend contract behavior, frontend apply/save flows, and restart consistency.

## Previous Completed Wave

### v0.4.0-H22 - Command Palette and Keyboard Navigation (Completed)

- `UX-001`

Dependencies:

- `UX-001` reused the existing declarative slash-command schema, command composer, session-target runtime, and deck activation flows so keyboard-first navigation could be added without introducing a second command system or backend contract.

Exit criteria:

- The frontend exposes a global command palette reachable via `Ctrl/Cmd+K`.
- The palette searches deterministically across slash commands, saved custom commands, sessions, and decks.
- Keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Esc`) is supported end to end.
- Command selections prefill the central composer, while session and deck selections activate their target directly.
- Regression coverage exists for palette filtering, selection behavior, and app-level shortcut wiring.

### v0.4.0-H21 - Developer Productivity Templates and ADR Process (Completed)

- `DPR-001`, `DPR-002`

Dependencies:

- `DPR-001` established the ADR process, template, numbering rules, and repo-level structure checker first so subsequent durable decisions can be recorded consistently.
- `DPR-002` then added reusable repository templates and a frontend UI-module scaffold helper aligned with the current backend/runtime and frontend-controller patterns, while root tooling regression coverage verifies the new helpers mechanically.

Exit criteria:

- Durable repository decisions can be recorded through an explicit ADR workflow with template, creation helper, and structure check.
- Repository-local templates exist for backend endpoint work and frontend UI modules.
- Root validation includes regression coverage for the new ADR/scaffold tooling so the workflow does not silently drift.

### v0.4.0-H20 - Replay Reading Mode (Completed)

- `REP-004`, `REP-005`

Dependencies:

- `REP-004` reused the completed replay-export contract from `REP-001` through `REP-003` so the viewer reads only the deterministic retained replay tail and does not invent a second replay source.
- `REP-005` closed after `REP-004` so regression coverage now spans slash-command access, session-toolbar access, viewer refresh/download/copy controls, truncation messaging, and empty-tail behavior.

Exit criteria:

- Frontend exposes an explicit replay reading mode for the retained replay tail with refresh/download/copy controls.
- Slash commands and discoverable session actions both reach the same retained-tail viewer workflow.
- Regression coverage exists for the replay viewer across truncation, empty-tail, and command/session-action entry paths.

## Previous Completed Wave

### v0.4.0-H19 - Session Replay Export Baseline (Completed)

- `REP-001`, `REP-002`, `REP-003`

Dependencies:

- `REP-001` established the backend export contract first so frontend delivery and QA coverage could rely on one deterministic replay-export source.
- `REP-002` then reused the finalized export format, truncation metadata, and empty-session semantics in the frontend operator workflow.
- `REP-003` closed after `REP-002` so regression coverage now spans both the backend export contract and the frontend operator workflow.

Exit criteria:

- Backend exposes a deterministic replay export contract for the retained replay tail rather than implying full process-state export.
- Frontend provides an explicit replay-export workflow that surfaces truncation state clearly.
- Regression coverage exists for replay export across reconnect, restart-restored replay, truncation, and empty-session paths.

### v0.4.0-H18 - Shell Runtime Compatibility Foundation (Completed)

- `DRV-001`, `DRV-002`, `DRV-005`

Dependencies:

- `DRV-001` establishes the shell-adapter/CWD-tracking baseline first.
- `DRV-002` follows `DRV-001` so replay/scrollback policy can build on explicit shell/runtime contracts.
- `DRV-005` follows `DRV-001` and closes after `DRV-002` so the compatibility matrix covers both shell-adapter behavior and replay/snapshot retention semantics.

Exit criteria:

- Backend shell handling uses an explicit shell-adapter abstraction instead of bash-only inline wiring.
- Supported vs unsupported shell CWD-tracking behavior is explicit and regression-tested.
- Replay/scrollback retention policy is configurable and documented.
- Compatibility regression coverage exists for the supported shell/runtime matrix.

## Dependency Rules

- `BE-002` is a hard dependency for `BE-003` through `BE-010` and `FE-007`.
- `BE-011` is a hard dependency for `BE-004`, `BE-006`, `BE-012`, `BE-015`, and `INT-004`.
- `BE-012` and `BE-013` are hard dependencies for `FE-009` and `FE-010`.
- `FE-002` is a hard dependency for `FE-003`, `FE-006`, `FE-010`, and `FE-014`.
- `INT-003` should run after `INT-002` and before final milestone close.

## Version Plan

### v0.1.0 - Foundation and Contracts

- `INT-002`, `INT-001`, `BE-001`, `FE-001`, `BE-002`, `INT-009`, `DOC-001`, `DOC-002`

Exit criteria:

- Backend and frontend workspaces exist and build.
- OpenAPI contract exists and is the single API source.
- Local development and environment setup are documented.

### v0.2.0 - Backend Runtime and Realtime

- `BE-011`, `BE-003`, `BE-004`, `BE-005`, `BE-006`, `BE-007`, `BE-008`, `BE-009`, `BE-010`, `BE-019`
- `BE-012`, `BE-013`, `BE-014`, `BE-015`, `BE-016`, `BE-017`, `BE-018`

Exit criteria:

- Core REST lifecycle for session creation/control works against PTY runtime.
- API requests and responses are validated and errors are normalized.
- WebSocket stream is stable and multiplexed by `sessionId`.
- Session metadata persistence and restart restore work.

### v0.3.0 - Frontend, Quality, and Production Baseline

- `FE-007`, `FE-008`, `FE-002`, `FE-003`, `FE-004`, `FE-005`, `FE-006`, `FE-009`, `FE-010`, `FE-012`, `FE-013`, `FE-014`, `FE-011`
- `INT-003`, `INT-004`, `INT-005`, `INT-006`, `INT-007`, `INT-008`, `INT-010`

Exit criteria:

- Multi-session terminal UI is usable end to end.
- Unit, integration, and E2E coverage exists for critical paths.
- Repeatable deployment runbook and smoke checks are documented.

### v0.3.0-H1 - Quality Hardening Backlog

- `QLT-001`, `QLT-002`, `QLT-003`, `QLT-004`, `QLT-005`, `QLT-006`, `QLT-007`, `QLT-008`, `QLT-009`, `QLT-010`, `QLT-011`, `QLT-012`, `QLT-013`, `QLT-014`, `QLT-015`, `QLT-016`, `QLT-017`, `QLT-018`, `QLT-019`, `QLT-020`, `QLT-021`, `QLT-022`, `QLT-023`, `QLT-024`, `QLT-025`, `QLT-026`, `QLT-027`, `QLT-028`, `QLT-029`, `QLT-030`, `QLT-031`, `QLT-032`, `QLT-033`, `QLT-034`, `QLT-035`, `QLT-036`

Dependencies:

- `QLT-003` depends on `QLT-001` and `QLT-002`.
- `QLT-010` depends on `QLT-001`.
- `QLT-005` depends on test additions from `QLT-002`, `QLT-003`, and `QLT-004`.
- `QLT-005` should also include thresholds for new tests from `QLT-010`.
- `QLT-006` should be completed before production deployment updates.
- `QLT-009` depends on `QLT-008` session metadata persistence behavior.
- `QLT-012` should run after runtime-hardening items `QLT-007` and `QLT-011`.
- `QLT-014` should run after `QLT-007` to validate shutdown behavior under guarded request handling.
- `QLT-015` depends on stable route/error behavior from `QLT-004`.
- `QLT-016` should run before `QLT-012` smoke checks to ensure runtime-config consistency.
- `QLT-023` depends on `QLT-022` command-routing foundation.
- `QLT-024` depends on `QLT-022` to ensure control-plane output does not mix with PTY stream.
- `QLT-025` should run before `/restart` command support is marked complete in `QLT-023`.
- `QLT-026` depends on completion of `QLT-022`, `QLT-023`, and `QLT-025`.
- `QLT-027` should run after `QLT-021` and alongside `QLT-010` to pair performance hardening with DOM behavior coverage.
- `QLT-030` depends on `QLT-028` to ensure startup resize scheduling is stable before switching to strict fit-based geometry.
- `QLT-033` depends on `QLT-029` marker-cleaned output semantics to avoid replaying control markers on reconnect snapshots.
- `QLT-034` should run with `QLT-030` so rendered terminal geometry matches visual card height constraints.
- `QLT-035` should run after `QLT-030` so sidebar-driven fixed geometry can be applied on top of stable fit-based baseline behavior.
- `QLT-036` should run after `QLT-020` session naming support so compact quick IDs can be displayed beside human-readable names.

Exit criteria:

- Frontend error-path behavior is covered by tests.
- Backend negative-path behavior is covered by tests.
- Frontend DOM integration behavior is covered by tests.
- Backend persistence and restart behavior are resilient under partial-write risk.
- Dev static-file serving is path-safe.
- Route behavior is continuously checked against OpenAPI contract.
- Local quality gate enforces coverage minimums.
- Local quality gate runs runtime smoke checks before merge/release.
- Local quality gate validates runtime compatibility expectations for supported Node versions.
- Deployment docs include secure production CORS guidance.
- Frontend default visual baseline is dark console style with improved terminal readability.
- Session rename flow and home-directory default behavior are available in baseline runtime.
- Command input supports multiline workflows in a bottom-docked composer area.
- Slash-command control plane is explicitly separated from terminal execution input.
- Core command set (`/new`, `/close`, `/switch`, `/next`, `/prev`, `/list`, `/rename`, `/restart`, `/help`) is implemented and integration-tested.
- Frontend startup and session event paths avoid redundant roundtrips and are validated against slow-load regression scenarios.
- Reconnect snapshots restore visible terminal prompt/output context without waiting for new PTY output.
- Rendered terminal card height and effective rows/cols stay visually consistent after layout updates.

### v0.3.0-H1C - Command Extensibility and UX Hardening

- `QLT-037`, `QLT-038`, `QLT-048`, `QLT-052`
- `QLT-039`, `QLT-041`, `QLT-054`
- `QLT-047`, `QLT-040`, `QLT-042`, `QLT-056`
- `QLT-043`, `QLT-053`, `QLT-044`, `QLT-045`, `QLT-050`, `QLT-049`
- `QLT-046`, `QLT-051`, `QLT-055`, `QLT-057`
- `QLT-069`, `QLT-070`

Dependencies:

- `QLT-038` depends on `QLT-037` so command guardrails are enforced on top of persisted command CRUD behavior.
- `QLT-048` depends on `QLT-037` because WS custom-command lifecycle events require a persisted custom-command source.
- `QLT-052` depends on `QLT-037` and should complete before `QLT-047` and `QLT-043` so FE list/autocomplete behavior is deterministic.
- `QLT-039` depends on `QLT-037` and `QLT-038` to ensure `/custom` definition paths align with backend validation and persistence.
- `QLT-041` should run before `QLT-043`, `QLT-045`, and `QLT-053` so slash mode entry is stable before keyboard UX logic.
- `QLT-054` depends on `QLT-039` to harden block-definition delimiter edge cases.
- `QLT-047` depends on `QLT-037`, `QLT-038`, and `QLT-052` for deterministic management command behavior.
- `QLT-040` depends on `QLT-039` and `QLT-047` so execution uses established definition/management behavior.
- `QLT-042` depends on `QLT-040`; `QLT-056` depends on `QLT-042` to harden preview rendering safety and truncation behavior.
- `QLT-043` depends on `QLT-047` and `QLT-052`; `QLT-053` depends on `QLT-043`.
- `QLT-044` depends on `QLT-040`, `QLT-047`, and `QLT-043` for context-aware argument completion.
- `QLT-045` depends on `QLT-041`; `QLT-050` depends on `QLT-045`.
- `QLT-049` should run after `QLT-040` and `QLT-044` so target resolution behavior is reused consistently.
- `QLT-046` depends on `QLT-037` through `QLT-045`; `QLT-051` depends on `QLT-047`, `QLT-048`, `QLT-049`, and `QLT-050`.
- `QLT-055` depends on `QLT-052`, `QLT-053`, and `QLT-054`; `QLT-057` depends on `QLT-041` and `QLT-053`.
- `QLT-069` depends on `QLT-040`, `QLT-049`, and existing command-submit normalization paths so direct input and custom-command execution share one deterministic terminator contract.
- `QLT-070` depends on `QLT-069` and extends regression coverage to submit-mode matrix behavior (`LF`/`CR`/`CRLF`) for shell and TUI command targets.

Exit criteria:

- Custom commands are persisted globally with deterministic naming, sorting, overwrite, and limit behavior.
- `/custom` management (`list`, `show`, `remove`, define inline/block) is implemented with stable command-feedback semantics.
- Custom command execution supports active-session and explicit target routing with deterministic resolver behavior.
- Slash mode boundaries are explicit and keyboard behavior is deterministic (`TAB`, `Shift+TAB`, arrows, `Enter`, repeat shortcut).
- Suggestion list and preview are non-blocking, text-safe, and do not auto-execute commands.
- Multi-client custom-command state synchronization works via WebSocket lifecycle events.
- Command submit semantics are deterministic across supported newline modes and do not require extra manual confirmation keystrokes in TUI workloads.
- Integration/regression coverage exists for all listed custom-command and slash UX edge cases.

### v0.3.0-H1D - Per-Terminal Settings and Theme Personalization

- `QLT-060`, `QLT-061`
- `QLT-058`, `QLT-062`, `QLT-059`
- `QLT-063`
- `QLT-064`
- `QLT-065`
- `QLT-066`
- `QLT-067`
- `QLT-068`
- `QLT-071`

Dependencies:

- `QLT-060` should run first to establish backend contract/persistence for per-session startup settings used by FE forms.
- `QLT-061` depends on `QLT-060` so startup settings are applied consistently during create/restart flows.
- `QLT-058` should run before `QLT-062` and `QLT-059` to establish a stable per-terminal settings entry point (gear icon + panel shell).
- `QLT-062` depends on `QLT-058` and `QLT-060` so FE forms map to finalized backend fields and validation semantics.
- `QLT-059` depends on `QLT-058` and should complete after `QLT-062` to keep rename/delete behavior discoverable inside the settings panel.
- `QLT-063` depends on `QLT-058`; it should run after panel shell exists so per-session color settings stay scoped and deterministic.
- `QLT-065` depends on `QLT-058` and should run before final QA hardening so settings UX behavior is stabilized behind a proper dialog contract.
- `QLT-066` depends on `QLT-060` so full theme profile persistence aligns with finalized per-session backend settings schema.
- `QLT-067` depends on `QLT-063`, `QLT-065`, and `QLT-066` so advanced theme editing lands on top of final dialog UX and persisted theme-profile contract.
- `QLT-064` depends on `QLT-058` through `QLT-063`.
- `QLT-068` depends on `QLT-065` through `QLT-067`.
- `QLT-071` depends on `QLT-069` and `QLT-060` so per-terminal submit-mode controls can reuse deterministic submit behavior and persist within session settings scope.

Exit criteria:

- Every terminal card exposes a dedicated settings icon that opens per-session settings.
- `Rename` and `Delete` actions are available in settings and removed from the direct card toolbar.
- Per-session startup settings (`Working Directory`, `Start Command Line`, `Environment Variables`) are persisted and applied deterministically.
- Per-session color sets are configurable and applied consistently after reload.
- Per-terminal settings use a proper dialog UX with deterministic open/close/save/cancel behavior.
- Full terminal theme profiles (cursor + ANSI palette) are configurable and persisted per session.
- Command submit terminator configuration can be scoped per terminal/session instead of globally.
- Integration/regression coverage exists for per-session settings lifecycle and startup/theme apply behavior.

### v0.3.0-H2 - Enterprise Readiness Backlog

- `ENT-001`, `ENT-004`, `ENT-005`, `ENT-006`, `ENT-007`, `ENT-008`, `ENT-009`, `ENT-011`, `ENT-012`, `ENT-013`, `ENT-014`, `ENT-015`, `ENT-016`, `ENT-018`, `ENT-019`, `ENT-020`, `ENT-021`, `ENT-022`, `ENT-023`, `ENT-024`

Dependencies:

- `ENT-001` should run after `QLT-015` to build on stable API contract behavior.
- `ENT-006` depends on `QLT-007` request-size guard and should be validated by non-functional and security regression coverage.
- `ENT-008` should run after observability-producing changes in `ENT-004` logging baseline.
- `ENT-009` should run after `QLT-009` atomic persistence write hardening.
- `ENT-011` should run before any production deployment cutover.
- `ENT-012` depends on `ENT-005` secrets/key management strategy.
- `ENT-013` should run before `ENT-015` to include hardened runtime evidence in release bundles.
- `ENT-014` depends on `ENT-009` backup/restore mechanics.
- `ENT-015` depends on `ENT-007` security scanning artifacts.
- `ENT-016` should run with `ENT-011` to align transport and header-level security posture.
- `ENT-018` should run with `ENT-011` to keep HTTPS/WSS ingress and certificate handling aligned.
- `ENT-019` depends on `ENT-018` ingress topology.
- `ENT-020` depends on `ENT-006` abuse-control baseline and should be validated by `ENT-022`.
- `ENT-021` should run before `ENT-008` alerting implementation to provide metric signals.
- `ENT-022` depends on `ENT-020` and should run after `ENT-021` metric instrumentation for measurable thresholds.
- `ENT-023` should run before production hardening tasks to prevent invalid runtime config drift.
- `ENT-024` depends on `ENT-004` and `ENT-009` to align session/log retention behavior.

Exit criteria:

- Audit logs and operational logs are structured, correlated, and retention-governed.
- Security scanning and SBOM generation are active in CI.
- SLOs and alerting are defined and documented.
- Backup/restore is automated and periodically verified.
- Security and isolation tests are automated and passing.
- TLS-only production ingress and certificate operations are enforced.
- At-rest encryption and key rotation are implemented for persistence data.
- Runtime least-privilege profile is implemented and documented.
- Disaster recovery drills are automated and measured against RTO/RPO.
- Release evidence bundle is generated for audit/compliance traceability.
- Reverse-proxy deployment guidance exists for provider-agnostic HTTPS/WSS host routing.
- Trusted proxy handling is explicitly configured and validated.
- Session guardrail policies (concurrency/idle/lifetime) are enforced and tested.
- Monitoring metrics are exposed and consumed by alerting baselines.
- Load and fanout non-functional thresholds are automated and tracked.
- Runtime configuration fails fast on invalid critical env values.
- Data retention and purge policies are automated and documented.

### v0.3.0-H3 - Tag-Based Multi-Target Control

- `QLT-072`
- `QLT-073`
- `QLT-074`
- `QLT-075`
- `QLT-076`
- `QLT-077`

Completed in this milestone:

- `QLT-072`, `QLT-073`, `QLT-074`, `QLT-075`, `QLT-076`, `QLT-077`

Remaining in this milestone:

- none

Dependencies:

- `QLT-073` depends on `QLT-072` so frontend tag editing maps to finalized backend session-tag contract and persistence behavior.
- `QLT-074` depends on `QLT-072` and `QLT-073` so multi-target command resolution can use persisted tags from backend and visible FE state.
- `QLT-076` depends on `QLT-072` and existing per-session settings contract so slash-command setting updates can reuse one canonical settings schema.
- `QLT-075` depends on `QLT-072` through `QLT-074` and validates overlap-dedupe plus tag/ID coexistence semantics end to end.
- `QLT-077` depends on `QLT-073`, `QLT-074`, and `QLT-076` to verify settings-dialog/slash parity and multi-target semantics together.

Exit criteria:

- Sessions support persisted tags via API/runtime model and frontend settings.
- Multi-target control actions can address sessions via IDs, quick IDs, names, and tags in one command flow.
- Overlapping selectors (for example tag + ID hitting the same session) execute once per session ID (no duplicate execution).
- No conflict rejection is performed for tag-vs-ID token collisions; both selector types remain valid identifiers.
- All per-terminal settings from the settings dialog are also available via slash commands with matching validation and persistence behavior.
- Regression coverage exists for dedupe and deterministic multi-target execution semantics.

### v0.3.0-H4 - Rename Targeting Parity

- `QLT-078`
- `QLT-079`

Completed in this milestone:

- `QLT-078`, `QLT-079`

Remaining in this milestone:

- none

Dependencies:

- `QLT-078` depends on existing selector resolution semantics from `QLT-074` and slash settings parity baseline from `QLT-076`.
- `QLT-079` depends on `QLT-078` and validates active shorthand compatibility plus selector-based rename execution behavior.

Exit criteria:

- Slash rename supports both `/rename <name>` (active session) and `/rename <selector> <name>` (explicit target).
- Rename selector semantics align with existing target resolution behavior and require exactly one resolved target session.
- Help text and autocomplete paths remain consistent with the updated rename syntax.
- Regression coverage exists for active/session-target rename behavior and deterministic command feedback.

### v0.3.0-H5 - Restart Durability and Local-Only Delivery Flow

- `QLT-080`
- `QLT-081`
- `QLT-082`
- `PLAT-011`

Completed in this milestone:

- `QLT-080`, `QLT-081`, `QLT-082`, `QLT-094`, `PLAT-011`

Remaining in this milestone:

- none

Dependencies:

- `QLT-081` depends on `QLT-080` so FE can render backend-provided unrestored-session state deterministically.
- `QLT-082` depends on `QLT-080` and `QLT-081` to validate runtime durability and FE visibility/behavior for unrestored sessions.
- `QLT-094` depends on `QLT-082` and stabilizes environment-dependent restore-fallback race behavior in backend integration tests.
- `PLAT-011` is independent of `QLT-080` ... `QLT-082` and can run in parallel, but must complete before enforcing local-only delivery policy in docs/process gates.

Exit criteria:

- Unrestored persisted sessions are visible via API and are not silently dropped from operator view.
- FE communicates unrestored state explicitly and prevents invalid interactive operations on unrestored sessions.
- Regression tests cover repeated restart durability for unrestored sessions and FE rendering semantics.
- Restore-fallback regression tests are deterministic across environments (no short-lived restored-session `404` race in integration assertions).
- Local-only quality gate flow is documented and aligns with disabled remote-runner CI configuration.

### v0.3.0-H6 - Deck Isolation and Multi-Deck Control Plane

- `QLT-083`
- `QLT-084`
- `QLT-085`
- `QLT-086`
- `QLT-087`
- `QLT-088`
- `QLT-089`
- `QLT-090`
- `QLT-091`
- `QLT-092`
- `QLT-093`

Completed in this milestone:

- `QLT-083`, `QLT-084`, `QLT-085`, `QLT-086`, `QLT-087`, `QLT-088`, `QLT-089`, `QLT-090`, `QLT-091`, `QLT-092`, `QLT-093`

Remaining in this milestone:

- none

Dependencies:

- `QLT-084` depends on `QLT-083` (deck domain contract).
- `QLT-085` depends on `QLT-083` and `QLT-084` (OpenAPI/REST must align with persisted deck model).
- `QLT-086` depends on `QLT-084` and `QLT-085` (deck-aware list/get semantics on top of deck model + routes).
- `QLT-087` depends on `QLT-085` (conflict-safe deck lifecycle and move semantics in backend routes).
- `QLT-088` depends on `QLT-085` (frontend tab/navigation against deck CRUD APIs).
- `QLT-089` depends on `QLT-086` and `QLT-088` (active-deck-scoped rendering and active-session fallback behavior).
- `QLT-090` depends on `QLT-085` and `QLT-088` (slash command control surface for deck operations).
- `QLT-091` depends on `QLT-089` and `QLT-090` (deck-aware selector/routing semantics).
- `QLT-092` depends on `QLT-091` (dedupe guarantees across overlapping selectors).
- `QLT-093` depends on `QLT-087`, `QLT-089`, `QLT-091`, and `QLT-092` (end-to-end regression matrix).

Exit criteria:

- Decks exist as isolated terminal groups with deterministic active-deck behavior.
- Session operations are deck-aware and do not perform implicit cross-deck mutations.
- Deck-level conflicts (delete/move/selector overlap) produce deterministic behavior and explicit errors.
- Per-deck settings baseline (terminal geometry) persists and applies independently.
- Deck and move slash commands behave consistently with UI actions.
- Regression coverage validates migration, isolation semantics, and multi-selector dedupe guarantees.

### v0.3.0-H7 - Frontend State Correctness and Architecture Consolidation

- `QLT-095`
- `QLT-096`
- `QLT-097`
- `QLT-098`
- `QLT-099`
- `QLT-100`
- `QLT-101`
- `QLT-102`
- `QLT-103`
- `QLT-104`
- `QLT-105`
- `QLT-106`
- `QLT-107`
- `QLT-108`
- `QLT-109`

Completed in this milestone:

- `QLT-095`, `QLT-096`, `QLT-097`, `QLT-098`, `QLT-099`, `QLT-100`, `QLT-101`, `QLT-102`, `QLT-103`, `QLT-104`, `QLT-105`, `QLT-106`, `QLT-107`, `QLT-108`, `QLT-109`

Remaining in this milestone:

- none

Dependencies:

- `QLT-096` depends on `QLT-095` so exit-state lifecycle assertions target finalized FE state behavior.
- `QLT-098` depends on `QLT-097` so regression coverage targets the WebSocket-first custom-command state model instead of the mixed REST/WS path.
- `QLT-099` should complete before `QLT-100` so xterm compatibility boundaries are defined before broader FE modularization.
- `QLT-100` depends on `QLT-095`, `QLT-097`, and `QLT-099` so module extraction lands on top of corrected lifecycle handling, corrected command-state flow, and isolated xterm internals.
- `QLT-101` depends on existing selector resolution semantics from H6 so `>selector` uses the same single-session token rules as active-session switching and can auto-switch decks deterministically.
- `QLT-102` depends on deck/sidebar navigation baseline from H6 and should reuse the same active-session/deck switching path as `QLT-101` rather than inventing a second focus model.
- `QLT-103` depends on `QLT-101` and `QLT-102` and validates that quick-switch commands and sidebar terminal buttons stay behaviorally aligned.
- `QLT-104` depends on `QLT-101` so deck-targeted `>...` semantics build on the same quick-switch parser and target-resolution path instead of forking a separate implementation.
- `QLT-105` depends on `QLT-101` and `QLT-104` so autocomplete breadth is designed against the final `>...` grammar and can stay aligned with existing `/...` completion behavior.
- `QLT-106` depends on `QLT-101` and `QLT-104` so `>...` selector semantics remain aligned with the final quick-switch grammar for both direct terminal and deck-scoped targets.
- `QLT-107` depends on `QLT-101`, `QLT-104`, `QLT-105`, and `QLT-106` so inline quick-switch preview/feedback is built on top of the finalized `>...` selector grammar, target types, and autocomplete behavior instead of duplicating early resolution logic.
- `QLT-108` depends on the existing hidden-deck viewport-recovery baseline from H6/H7 and should complete before related render-architecture cleanup so scroll-state repair is validated against current runtime behavior first.
- `QLT-109` depends on `QLT-108` so regression coverage targets the finalized hidden-session scroll-recovery behavior instead of current stale-viewport semantics.

Exit criteria:

- Frontend handles `session.exit` deterministically with explicit exited-session UX and post-exit guardrails.
- Custom-command runtime state is WebSocket-first in steady-state frontend flows.
- xterm private/internal access is isolated behind one compatibility boundary.
- `frontend/src/public/app.js` is decomposed into layered modules without behavior regression.
- Quick terminal switching supports `>selector` command syntax with deck auto-switch when needed.
- Sidebar deck sections expose clickable terminal entries with visible quick IDs and deterministic active-terminal focus behavior.
- `>...` quick-switching can resolve both terminals and decks, with deterministic deck-name autocomplete.
- Autocomplete coverage is consistent across `/...` and `>...` navigation-related flows where deterministic suggestions are possible.
- `>...` quick-switching reuses `/switch` selector semantics instead of introducing a second incompatible navigation grammar.
- `>...` quick-switching exposes inline resolved-target preview and explicit ambiguity/no-match/no-op feedback before activation.
- Hidden sessions that receive output while invisible recover a correct scrollable viewport when shown again, including bottom-content reachability after background growth.

### v0.3.0-H8 - Terminal Search UX

- `QLT-110`
- `QLT-111`

Dependencies:

- `QLT-110` depends on `QLT-100` so search/find UX lands on top of the decomposed FE command/state/view structure instead of deepening the current `app.js` monolith.
- `QLT-111` depends on `QLT-110` so regression coverage targets the finalized search/find interaction model rather than an intermediate UI contract.

Exit criteria:

- Active terminals support deterministic output search with explicit next/previous navigation.
- Search feedback distinguishes between match, wraparound, and no-match states without mutating PTY output.
- Search behavior remains correct across deck/session switching and buffer growth.

### v0.3.0-H9 - Declarative Command Autocomplete

- `QLT-112`
- `QLT-113`
- `QLT-114`
- `QLT-115`

Dependencies:

- `QLT-112` should land first so command completion behavior is defined from explicit specs instead of continuing to spread hardcoded parser metadata across the FE runtime.
- `QLT-113` depends on `QLT-112` so contextual suggestion providers plug into one declarative command/argument contract instead of introducing a second autocomplete model.
- `QLT-114` depends on `QLT-112` and `QLT-113` so richer suggestion metadata and inline presentation are designed against the finalized suggestion payload shape.
- `QLT-115` depends on `QLT-112`, `QLT-113`, and `QLT-114` so regression coverage targets the final declarative/generator-backed autocomplete behavior rather than an intermediate contract.

Exit criteria:

- Slash and quick-switch autocomplete are driven by declarative command and argument specs instead of scattered hardcoded runtime branches.
- Contextual argument suggestions can be generated from live FE state via bounded-latency providers without mutating runtime state during typing.
- Inline autocomplete feedback can expose richer metadata while preserving deterministic keyboard-first behavior and explicit fallback semantics.

### v0.3.0-H10 - Runtime Metadata Event Consistency

- `QLT-116`
- `QLT-117`
- `QLT-118`

Completed in this milestone:

- `QLT-116`, `QLT-117`, `QLT-118`

Remaining in this milestone:

- none

Dependencies:

- `QLT-116` should land first so the backend exposes authoritative WebSocket events for session and deck metadata changes instead of leaving connected clients dependent on local mutation responses only.
- `QLT-117` depends on `QLT-116` so the frontend reducer/event-application path can consume a complete runtime event surface rather than inventing client-only patch semantics for missing events.
- `QLT-117` should follow `QLT-112` ... `QLT-114` so command/autocomplete structural cleanup lands before broader runtime-state event consolidation touches the same frontend orchestration code.
- `QLT-118` depends on `QLT-116` and `QLT-117` so regression coverage targets the finalized backend event model and frontend reducer flow instead of intermediate partial behavior.

Exit criteria:

- Backend emits authoritative metadata events for live session/deck changes that matter to connected clients.
- Frontend applies runtime metadata updates through one explicit event/reducer path instead of scattered local mutation handlers.
- Multi-client runtime state stays consistent across session rename/settings updates, deck mutations, session moves, and reconnect snapshot replacement.

### v0.3.0-H11 - Runtime Store and Contract Hardening

- `QLT-119`
- `QLT-120`
- `QLT-121`
- `QLT-122`

Dependencies:

- `QLT-119` should land first so runtime state transitions for sessions, decks, custom commands, connection state, and related derived metadata move behind one pure reducer/store boundary instead of remaining partially embedded in `app.js`.
- `QLT-120` depends on `QLT-119` and `QLT-116` ... `QLT-118` so WebSocket-authoritative bootstrap/reconnect behavior builds on the now-complete metadata event surface plus an extracted reducer/store implementation.
- `QLT-121` depends on `QLT-119` and `QLT-120` so regression coverage targets the final reducer-backed WS-authoritative runtime flow instead of transitional mixed-state behavior.
- `QLT-122` should follow `QLT-120` so FE/BE contract regression checks are written against the finalized runtime payload expectations and OpenAPI-aligned FE surfaces.

Exit criteria:

- Frontend runtime state for sessions, decks, and custom commands is applied through a dedicated reducer/store module instead of scattered inline mutation logic.
- Bootstrap and reconnect hydration are WebSocket-authoritative for runtime domains already represented in snapshots/events.
- Regression coverage validates reducer-backed state consistency and mixed local/remote event ordering behavior.
- Automated FE/BE contract checks protect OpenAPI/runtime payload alignment for sessions, decks, and custom commands.

### v0.3.0-H12 - Explicit Session Lifecycle Modeling

- `LIF-001`
- `LIF-002`
- `LIF-003`
- `LIF-004`
- `LIF-005`
- `LIF-006`

Dependencies:

- `LIF-001` should land first so backend runtime events expose an explicit lifecycle contract for startup/running state instead of leaving frontend state to infer process liveness indirectly from partial output or reconnect timing.
- `LIF-002` depends on `LIF-001` and `QLT-119` ... `QLT-122` so the formal FE lifecycle model lands on top of the extracted reducer/store boundary plus the now-authoritative runtime bootstrap/event path.
- `LIF-003` depends on `LIF-002` so derived `busy` / `idle` semantics extend the explicit lifecycle model rather than introducing a parallel heuristic-only state system.
- `LIF-004` depends on `LIF-001`, `LIF-002`, and `LIF-003` so regression coverage targets the finalized ordered lifecycle transitions, reconnect replacement behavior, and post-exit guardrails.
- `LIF-005` depends on `LIF-001` so sidebar session buttons can expose a normalized runtime-activity baseline without waiting on the full FE state-machine formalization.
- `LIF-006` depends on `LIF-005` and should validate live-vs-unseen indicator transitions plus clear-on-activation semantics.

Exit criteria:

- Backend runtime events expose a deterministic startup/running lifecycle contract plus stable exit metadata.
- Frontend runtime state models ordered lifecycle transitions explicitly instead of relying on special-case `exited` handling only.
- Derived activity state (`busy` / `idle`) is computed on top of the formal lifecycle model without conflating UI heuristics and process liveness.
- Regression coverage protects ordered lifecycle transitions, reconnect semantics, and invalid post-exit interactions.
- Sidebar deck/session navigation exposes subtle live and unseen activity indicators so background terminal output is visible without opening each session.

### v0.3.0-H13 - Stream Interpretation Foundation

- `ARC-003`
- `ARC-004`
- `ARC-005`
- `ARC-006`
- `ARC-007`
- `ARC-008`

Completed in this milestone so far:

- `ARC-003`
- `ARC-004`
- `ARC-005`
- `ARC-006`
- `ARC-007`
- `ARC-008`

Remaining in this milestone:

- none

Dependencies:

- `ARC-003` depends on `QLT-100`, `QLT-119` ... `QLT-122`, and `LIF-002` ... `LIF-004` so stream normalization lands on top of the decomposed frontend runtime, reducer-backed state flow, and explicit lifecycle/activity semantics.
- `ARC-004` depends on `ARC-003` so plugins consume one deterministic normalized stream surface rather than raw PTY chunk heuristics.
- `ARC-005` depends on `ARC-004` and `QLT-117` so plugin output reuses declarative runtime-event/update paths instead of mutating UI state ad hoc.
- `ARC-006` depends on `ARC-003`, `ARC-004`, and `ARC-005` so built-in detectors are implemented on top of the final adapter and action-dispatch contract.
- `ARC-007` depends on `ARC-005` and `ARC-006` so extracted artifacts share the same declarative state/update model as status and attention signals.
- `ARC-008` depends on `ARC-003` ... `ARC-007` so regression coverage targets the finalized normalization, plugin, and artifact-dispatch behavior.

Exit criteria:

- Frontend PTY stream handling is normalized through an explicit session-scoped adapter boundary (`onData`, `onLine`, `onIdle`) instead of raw UI-time parsing.
- A deterministic plugin-engine registry exists with explicit lifecycle, ordering, and side-effect guardrails.
- Plugin output is constrained to a declarative interpretation-action contract routed through existing runtime/store update paths.
- Built-in stream interpreters cover active-processing detection, prompt/idle recovery, and explicit attention/error signaling.
- Artifact-oriented interpretation is available without polluting raw terminal output.
- Regression coverage protects normalization, plugin ordering/conflict handling, hidden-session behavior, and declarative action dispatch determinism.

### v0.3.0-H14 - Activity Completion Notifications

- `LIF-007`
- `LIF-008`
- `LIF-009`

Completed in this milestone so far:

- `LIF-007`
- `LIF-008`
- `LIF-009`

Remaining in this milestone:

- none

Dependencies:

- `LIF-007` depends on `LIF-001` ... `LIF-004` so backend-persisted activity-completion signaling builds on the formal lifecycle baseline instead of ad hoc UI-local transitions.
- `LIF-008` depends on `LIF-007` so browser notifications trigger only from authoritative post-persist activity-completion events, and should reuse the current session/deck runtime store path without duplicate local inference.
- `LIF-009` depends on `LIF-007` and `LIF-008` so regression coverage validates exactly-once semantics, aggregation, permission-denied no-op behavior, and reconnect/update churn on top of the final backend/FE contract.

Exit criteria:

- Backend exposes an authoritative persisted activity-completion signal for session transitions from active to inactive.
- Frontend emits standard browser notifications exactly once per persisted active-to-inactive transition without throwing when notifications are unsupported or denied.
- Multiple completions inside the configured aggregation window can be collapsed into one deterministic notification payload.
- Regression coverage protects no-duplicate semantics, aggregation behavior, and permission-safe failure handling.

## Current Status

- Latest completed milestone: `v0.4.0-H46` (Deck Sidebar Action Consolidation)
- Next milestone in progress: `v0.4.0-H47` (Session File Transfer Baseline)
- Queued next milestone: none currently
- Blockers: none currently

### Active Open Tasks (Execution Queue)

- `REM-006A`
- `REM-006B`
- `REM-006C`

### v0.3.0-H15 - Auth Transport and Mode Hardening

- `ENT-026`
- `ENT-027`
- `ENT-028`

Completed in this milestone so far:

- `ENT-026`
- `ENT-027`
- `ENT-028`

Remaining in this milestone:

- none

Dependencies:

- `ENT-026` depends on the existing auth baseline so WebSocket authentication can move off query-string transport without regressing current REST/WS access behavior.
- `ENT-027` depends on the current `AUTH_MODE=dev` baseline and should land with explicit runtime validation so insecure production-like combinations fail fast instead of silently falling back.
- `ENT-028` depends on `ENT-026` and `ENT-027` so regression coverage validates the final handshake/auth-mode contract rather than a transient intermediate transport.

Exit criteria:

- WebSocket authentication no longer requires query-string token transport in steady state.
- Dev-token issuance is explicitly gated to development mode and unavailable in production mode.
- Runtime configuration rejects insecure production auth combinations deterministically.
- Regression coverage protects token-transport hardening, auth-mode gating, and token-leak prevention in observable client/runtime surfaces.

### v0.4.0-H1 - Observability Expansion

- `OBS-001`
- `OBS-002`
- `OBS-003`
- `OBS-004`

Completed in this milestone:

- `OBS-001`
- `OBS-002`
- `OBS-003`
- `OBS-004`

Remaining in this milestone:

- none

Dependencies:

- `OBS-002` depends on `OBS-001` so derived latency/quality aggregations are built on top of stable metric naming and lifecycle signal definitions.
- `OBS-003` depends on `OBS-001` and `OBS-002` so deployment guidance and dashboard/alert recommendations reflect actual emitted metric contracts.
- `OBS-004` depends on `OBS-001` and `OBS-002`, and should run alongside `OBS-003` to lock the documented metric surface to tested runtime behavior.

Exit criteria:

- Backend `/metrics` exposes explicit lifecycle and connection-quality signals with stable names.
- REST and WS quality signals include bounded latency/reconnect/error visibility suitable for local operations.
- Deployment/quality-gate docs define a concrete observability baseline for scrape, panel, and alert wiring.
- Regression coverage guards observability contract stability and runtime counter/gauge behavior.

### v0.4.0-H2 - Layered Frontend Architecture Completion

- `ARC-009`
- `ARC-010A`
- `ARC-010B`
- `ARC-010C`
- `ARC-010D`
- `ARC-011`
- `ARC-012`

Completed in this milestone so far:

- `ARC-009`
- `ARC-010A`
- `ARC-010B`
- `ARC-010C`
- `ARC-010D`
- `ARC-011`
- `ARC-012`

Remaining in this milestone:

- none

Dependencies:

- `ARC-010A` depends on `ARC-009` and is completed; the last app-level command/UI delegation glue is now extracted on top of stabilized command/runtime boundaries.
- `ARC-010B` depended on `ARC-010A` and is completed; startup/bootstrap composition wiring now lives in `frontend/src/public/app-bootstrap-composition-controller.js`, so `frontend/src/public/app.js` no longer owns the hidden runtime-assembly cluster.
- `ARC-010C` depended on `ARC-010A` and `ARC-010B` and is completed; `frontend/src/public/app.js` is now reduced to top-level startup/error-boundary code while the former inline runtime assembly lives in `frontend/src/public/app-runtime-composition-controller.js`.
- `ARC-010D` depended on `ARC-010A`, `ARC-010B`, and `ARC-010C` and is completed; explicit architecture closeout regression coverage now locks `frontend/src/public/app.js` to a bootstrap-only entrypoint and guards delegated runtime assembly in dedicated modules.
- `ARC-011` depends on `ARC-009` and completion of `ARC-010A` ... `ARC-010D` to enforce layer contracts after extraction points are final.
- `ARC-012` depends on `ARC-009`, completion of `ARC-010A` ... `ARC-010D`, and `ARC-011` so architecture-regression coverage validates the final boundary model.

Exit criteria:

- App-level command/UI delegation wrappers are extracted into explicit composition-facing controllers/facades.
- Remaining startup/bootstrap composition wiring is extracted so `app.js` no longer owns hidden orchestration clusters.
- Remaining inline/dead orchestration logic is removed from `app.js`, leaving it as a bootstrap/composition boundary only.
- Closeout regression coverage proves the final ARC-010 target shape instead of relying on informal interpretation.
- Cross-layer shortcut paths are removed so stream/interpretation/state/UI boundaries are explicit and enforceable.
- Regression coverage protects architectural boundaries against future monolith regressions.

### v0.4.0-H3 - Terminal Interaction Ergonomics

- `QLT-123`
- `QLT-124`

Completed in this milestone so far:

- `QLT-123`
- `QLT-124`

Remaining in this milestone:

- none

Dependencies:

- `QLT-123` ran after `ARC-010` so copy/paste interaction handling could be integrated on top of cleaner UI boundaries instead of deepening `app.js` coupling.
- `QLT-124` ran after `QLT-123` so terminal-header UX/layout improvements aligned with the finalized interaction model and avoided duplicate churn in session-card wiring.

Exit criteria:

- Terminal sessions and command-input box share a consistent system-clipboard-only copy/paste UX contract (left-drag + `Enter` copy, middle-click paste, right-click keeps default system context menu).
- No separate primary-selection clipboard model is introduced; behavior remains deterministic against system clipboard APIs.
- Terminal-session header implementation is structurally simplified and UX-optimized without removing current semantic header elements.
- Regression coverage protects copy/paste interaction behavior and header rendering/interaction stability.

### v0.4.0-H4 - Declarative Command Contract

- `DRV-003A`
- `DRV-003B`
- `DRV-003C`
- `DRV-004`

Completed in this milestone so far:

- `DRV-003A`
- `DRV-003B`
- `DRV-003C`
- `DRV-004`

Remaining in this milestone:

- none

Dependencies:

- `DRV-003A` should run first so command-definition metadata has one explicit source of truth before additional command-surface rewiring happens.
- `DRV-003B` depends on `DRV-003A` so autocomplete and command-engine parsing consume the same declarative command contract instead of duplicating definitions.
- `DRV-003C` depends on `DRV-003A` and `DRV-003B` so help text and validation-facing command surfaces can be proven to derive from the finalized schema/registry contract.
- `DRV-004` depends on completion of `DRV-003A` through `DRV-003C` so command-to-output correlation can attach to stable command identities and declarative metadata instead of transient parser-side strings.

Exit criteria:

- Slash-command metadata lives in one explicit declarative schema/registry contract instead of being split across completion/runtime modules.
- Command completion and command-engine parsing consume the shared schema contract for names, labels, subcommands, and argument-provider metadata.
- Help and validation-facing command surfaces derive from the same declarative contract and are protected by regression coverage.
- The follow-up command-to-output correlation task can build on stable command identities and metadata instead of duplicated ad-hoc command definitions.
- Command submissions now persist explicit per-session correlation records that are enriched by downstream output/activity/stream-interpretation actions for traceable operator context without re-coupling UI modules to stream internals.

### v0.4.0-H5 - Stream Activity Noise Filtering

- `QLT-125`

Completed in this milestone so far:

- `QLT-125`

Remaining in this milestone:

- none

Dependencies:

- `QLT-125` runs after `DRV-004` so the existing stream-interpretation and command-correlation surfaces are available while tightening activity semantics around empty/no-op stream chunks.

Exit criteria:

- Inactive sessions are not marked as newly active by empty, redraw-only, transport-only, or otherwise semantically no-op stream updates.
- Activity tracking continues to react to meaningful terminal output without regressing existing status/progress/plugin interpretation behavior.
- Regression coverage demonstrates the difference between meaningful output chunks and ignorable no-op stream noise.

### v0.4.0-H6 - Startup Warmup Gate and Bootstrap Deferral

- `QLT-126`
- `QLT-127`

Completed in this milestone so far:

- `QLT-126`
- `QLT-127`

Remaining in this milestone:

- none

Dependencies:

- `QLT-126` ran after `QLT-125` so backend startup readiness did not depend on semantically empty activity noise that should already be filtered out of session-activity semantics.
- `QLT-127` depended on `QLT-126` so frontend bootstrap deferral and the operator skip affordance consumed one explicit backend warmup-state contract instead of inferring readiness from ad-hoc startup timing heuristics.

Exit criteria:

- Backend exposes one explicit startup warmup state indicating that persisted sessions are still being brought back after server boot.
- The backend warmup state remains active until no session has been in the active state for one continuous second after startup.
- Frontend delays normal bootstrap while the backend warmup state is active and offers an explicit user-controlled skip path.
- Frontend starts automatically once the warmup state clears, without requiring a manual reload after the server finishes session startup.
- Regression coverage demonstrates backend warmup-state transitions, frontend wait/skip behavior, and automatic bootstrap handoff when startup settles.

### v0.4.0-H7 - WebSocket Origin Allowlist Enforcement

- `ENT-017`

Completed in this milestone so far:

- `ENT-017`

Remaining in this milestone:

- none

Dependencies:

- `ENT-017` runs after `v0.4.0-H6` so the restart-recovery bootstrap contract is already stable before tightening WebSocket browser-origin admission semantics on the upgrade path.

Exit criteria:

- WebSocket upgrade requests are checked against the configured origin allowlist before the connection is accepted.
- Missing or disallowed upgrade origins are rejected with an explicit unauthorized-origin error contract instead of silently proceeding.
- Explicitly allowed origins continue to connect successfully without regressing existing TLS, auth-ticket, or reconnect behavior.
- Regression coverage demonstrates allowed, missing, and disallowed WebSocket origin behavior on the upgrade path.

### v0.4.0-H8 - Script Execution Traceability

- `QLT-128`

Completed in this milestone so far:

- `QLT-128`

Remaining in this milestone:

- none

Dependencies:

- `QLT-128` runs after `v0.4.0-H7` so the recent platform/security hardening baseline is already stable before adding root-script execution logging and enforcement into the local quality gate.

Exit criteria:

- Every top-level executable under `scripts/` emits one standardized startup log line so future runtime usage can be observed without inspecting implementation details.
- One checker verifies that every top-level `scripts/*.sh` and `scripts/*.mjs` file declares that startup log line near the beginning of the file.
- The checker is wired into the normal local lint gate so missing script logging cannot drift back in silently.

### v0.4.0-H9 - Invisible Stream Activity Filtering Hardening

- `QLT-129`

Completed in this milestone so far:

- `QLT-129`

Remaining in this milestone:

- none

Dependencies:

- `QLT-129` runs after `v0.4.0-H8` so the script-traceability baseline remains intact while the frontend activity detector is hardened against invisible control-sequence noise.

Exit criteria:

- Invisible terminal-control-only or formatting-only stream updates no longer re-mark inactive sessions as active.
- Frontend activity filtering strips broader DEC/charset/DCS/OSC/C1/zero-width non-visible stream updates before emitting an activity bump.
- Regression coverage proves invisible redraw/control chunks still render safely but do not produce new activity markers.

### v0.4.0-H13 - Attention Header Text Silence

- `QLT-133`

Completed in this milestone so far:

- `QLT-133`

Remaining in this milestone:

- none

Dependencies:

- `QLT-133` runs after `v0.4.0-H12` so the existing suppression of high-frequency activity-status header churn and the default-silent notification baseline remain intact while the last remaining attention/error status writer is removed from the session-header text path.

Exit criteria:

- Error/attention interpretation still marks the session as `attention`.
- Browser notification behavior remains unchanged from `v0.4.0-H12` (default silent).
- Arbitrary attention/error source lines no longer populate `.session-status-text`.
- Regression coverage proves that attention styling survives while the session-header text remains empty for attention/error stream lines.

### v0.4.0-H14 - Frontend Quick-ID Swap Command

- `QLT-134`

Completed in this milestone so far:

- `QLT-134`

Remaining in this milestone:

- none

Dependencies:

- `QLT-134` runs after `v0.4.0-H13` so the session-header silence baseline is already stable before reintroducing any quick-ID-focused operator ergonomics in the frontend command plane.

Exit criteria:

- `/swap <selectorA> <selectorB>` is available in the frontend slash-command plane.
- Both selectors must resolve to exactly one session each using existing selector semantics.
- Quick-ID swaps remain frontend-local and are not persisted to the backend.
- Regression coverage proves runtime swap behavior, schema/help exposure, executor feedback, and live UI rerendering.

### v0.4.0-H15 - Persistent Session Notes

- `QLT-135`
- `QLT-136`

Completed in this milestone so far:

- `QLT-135`
- `QLT-136`

Remaining in this milestone:

- none

Dependencies:

- `QLT-135` runs first so the persisted session-note field exists in the backend REST/WS/session contract before any frontend note-management UX depends on it.
- `QLT-136` depends on `QLT-135` so `/note` command behavior and header rendering operate on an authoritative persisted note source instead of a frontend-local shadow state.

Exit criteria:

- Every session supports exactly one persisted note or none.
- Empty note writes clear an existing note deterministically.
- The frontend command plane exposes `/note` for session-note set/clear behavior using existing selector semantics.
- The terminal-session header renders the note in a compact small-font presentation without changing the existing one-note-per-session rule.
- Regression coverage proves backend persistence/transport behavior and frontend command/header rendering behavior.

### v0.4.0-H16 - Target Clarity and Send Safety

- `QLT-137`
- `QLT-138`
- `QLT-139`

Completed in this milestone so far:

- `QLT-137`
- `QLT-138`
- `QLT-139`

Remaining in this milestone:

- none

Dependencies:

- `QLT-137` runs first so active-target visibility and attention-state visibility stop competing for the same primary border signal before more send-safety UX depends on those cues.
- `QLT-138` runs after `QLT-137` and establishes the persisted per-session safety-profile contract that the frontend guardrails can rely on.
- `QLT-139` depends on `QLT-137` and `QLT-138` so composer-side send guardrails use both the clarified target visuals and the persisted per-session safety-profile source of truth.
- Parser-backed shell-syntax validation in `QLT-139` is scoped to opt-in shell profiles only; syntax validation is a send-gating signal, but not a replacement for separate dangerous-command or target-switch confirmation rules.

Exit criteria:

- Active target and attention/unread state are visually distinct and can be understood simultaneously on cards and in the deck list; the session-card border is reserved for active green only, and attention no longer claims its own orange border state.
- Each session can persist a per-terminal input-safety profile instead of relying on one global guard policy, with explicit fields for shell-syntax gating, incomplete-shell confirmation, natural-language confirmation, dangerous-command confirmation, multiline confirmation, recent-target-switch confirmation, and supporting timing/size thresholds.
- The frontend exposes at least the presets `off`, `shell_syntax_gated`, `shell_balanced`, `shell_strict`, and `agent`, with deterministic mappings onto the persisted profile fields.
- The first frontend safety mechanisms are configurable per terminal and include all of the following: parser-backed valid-shell-syntax gating for opted-in shell sessions, explicit confirmation for incomplete shell constructs, confirmation for likely natural-language input sent to shell sessions, confirmation for dangerous shell commands, confirmation for multiline or oversized pasted input, and confirmation after a recent target switch.
- Invalid or incomplete shell syntax does not hard-block input forever; the user can still send once after an explicit confirmation so interactive shell continuation workflows remain possible.
- Regression coverage proves the clarified target semantics and the first per-session send-safety flows.

### Completed Items

- `DOC-001`, `DOC-002`
- `BE-001` ... `BE-019`
- `FE-001` ... `FE-014`
- `INT-001` ... `INT-010`
- `QLT-001`, `QLT-002`, `QLT-004`
- `QLT-003`
- `QLT-010`
- `QLT-011`, `QLT-012`
- `QLT-013`
- `QLT-006`
- `QLT-005`
- `QLT-007`
- `QLT-008`, `QLT-009`
- `QLT-014`
- `QLT-015`
- `QLT-016`
- `QLT-017`
- `QLT-018`
- `QLT-019`, `QLT-020`
- `QLT-021`
- `QLT-022`
- `QLT-023`
- `QLT-024`
- `QLT-025`
- `QLT-026`
- `QLT-027`
- `QLT-028`, `QLT-029`, `QLT-030`, `QLT-031`, `QLT-032`, `QLT-033`, `QLT-034`
- `QLT-035`
- `QLT-036`
- `QLT-037`
- `QLT-038`
- `QLT-039`
- `QLT-040`
- `QLT-041`
- `QLT-042`
- `QLT-043`
- `QLT-044`
- `QLT-045`
- `QLT-050`
- `QLT-069`
- `QLT-047`
- `QLT-052`
- `QLT-048`
- `QLT-060`, `QLT-061`
- `QLT-062`
- `QLT-058`, `QLT-059`, `QLT-063`
- `QLT-064`
- `QLT-065`
- `QLT-066`
- `QLT-067`
- `QLT-071`
- `QLT-068`
- `QLT-046`
- `QLT-049`
- `QLT-051`
- `QLT-053`
- `QLT-054`
- `QLT-055`
- `QLT-056`
- `QLT-057`
- `QLT-070`
- `QLT-072`
- `QLT-073`
- `QLT-074`
- `QLT-075`
- `QLT-076`
- `QLT-077`
- `QLT-078`
- `QLT-079`
- `QLT-080`
- `QLT-081`
- `QLT-082`
- `QLT-094`
- `QLT-083`
- `QLT-084`
- `QLT-085`
- `QLT-086`
- `QLT-087`
- `QLT-088`
- `QLT-089`
- `QLT-090`
- `QLT-091`
- `QLT-092`
- `QLT-093`
- `QLT-095`
- `QLT-096`
- `QLT-128`
- `QLT-129`
- `QLT-130`
- `QLT-131`
- `QLT-132`
- `QLT-133`
- `QLT-134`
- `PLAT-011`
- `ENT-001`, `ENT-004`, `ENT-005`, `ENT-006`, `ENT-007`, `ENT-008`, `ENT-009`, `ENT-011`, `ENT-012`, `ENT-013`, `ENT-014`, `ENT-015`, `ENT-016`, `ENT-018`, `ENT-019`, `ENT-020`, `ENT-021`, `ENT-022`, `ENT-023`, `ENT-024`
