# ptydeck Messaging Adapter Framework
## Final Requirements Concept (Non-Technical, ptydeck-aligned)

### 1. Document Purpose

This document defines a generic messaging-adapter concept for ptydeck that fits the current product and architecture.

The framework is intended to:
- translate meaningful ptydeck session activity into external updates
- allow bounded remote interaction where ptydeck already permits it
- keep ptydeck independent from any specific messaging platform
- treat Telegram as the first reference adapter without coupling the core to Telegram
- preserve room for later adapters such as Discord and Slack

This is a non-technical requirements concept. It defines product goals, behavior, boundaries, and phased intent. It does not prescribe implementation details.

---

### 2. Executive Summary

ptydeck already has a real runtime model:
- PTY-backed sessions
- deck and session organization
- REST and WebSocket contracts
- replay and export capabilities
- share links with read-only spectator access
- trusted-local multi-device control in the mainline single-user runtime
- a bounded slash-command surface for operator workflows

A messaging adapter framework must extend that model, not compete with it.

The correct concept is therefore:
- observe meaningful session activity through ptydeck-owned signals
- normalize those signals into platform-neutral events
- apply message policy to reduce noise
- let adapters translate those events into platform-native messages
- let adapters send inbound actions only through the same ptydeck control boundaries that already govern local and multi-device interaction

The adapter layer must never become a second terminal runtime, a second authorization system, or a second control plane.

---

### 3. Strategic Objective

The objective is not to mirror raw terminal output into chat.

The objective is to give ptydeck a durable external communication capability that:
- makes important session activity observable outside the browser UI
- supports bounded remote actions when appropriate
- stays compatible with ptydeck's existing session/deck/share/control model
- scales from simple notifications to richer remote operating patterns
- remains reusable across multiple messaging products

This should be a permanent ptydeck capability, not a one-off Telegram integration.

---

### 4. In Scope

This concept covers:
- outbound communication from ptydeck sessions to messaging platforms
- bounded inbound communication from messaging platforms into ptydeck
- identification of which ptydeck session events should produce external messages
- session-to-conversation mapping
- adapter interaction modes and safety boundaries
- phased adapter evolution

---

### 5. Out of Scope

This concept does not aim to:
- replicate a full terminal UI inside chat
- stream every keystroke or every line verbatim by default
- replace the browser terminal as the primary execution surface
- bypass ptydeck REST, WebSocket, share, or control contracts
- create a separate authorization model for chat platforms
- define a full engineering specification

The messaging layer is a communication and bounded-control surface, not a terminal replacement.

---

### 6. Core Principles

#### 6.1 Platform Independence

ptydeck must remain independent from Telegram, Discord, Slack, or any other single messaging provider.

#### 6.2 ptydeck-Core Authority

Adapters must sit on top of the existing ptydeck runtime.

They must not bypass:
- session lifecycle ownership
- session control rules
- share and spectator constraints
- send-safety and bounded command policy
- replay and export boundaries

#### 6.3 Session-First Semantics

The primary communication unit is the terminal session.

Deck-level aggregation may exist later, but the first-class observable subject remains the session.

#### 6.4 Explicit Signal Detection

Outbound communication must come from explicit, deterministic signal extraction rather than ad-hoc guesswork.

#### 6.5 Controlled Interaction

Inbound remote actions must remain intentionally gated and must reuse ptydeck's own write/control decisions.

#### 6.6 Noise Reduction

The framework should prefer concise, meaningful updates over raw output duplication.

#### 6.7 Replaceable Adapters

Adapters must be swappable without altering terminal semantics or core runtime behavior.

---

### 7. Conceptual Architecture

The framework has three conceptual layers.

#### 7.1 ptydeck Core

Owns:
- session lifecycle
- PTY execution
- terminal input and output
- deck/session identity and state
- share and spectator access
- controller/write authority
- replay and export state
- slash-command execution and bounded control operations

The core must not contain platform-specific messaging behavior.

#### 7.2 Signal Extraction Layer

Owns:
- observation of terminal output and relevant runtime events
- pattern matching and context evaluation
- derivation of normalized events
- suppression of irrelevant noise

This layer decides what ptydeck activity is meaningful enough to become a communication candidate.

#### 7.3 Messaging Adapter Layer

Owns:
- translation of normalized events into platform-native messages or actions
- translation of validated inbound intent into ptydeck-owned actions
- conversation mapping
- adapter-specific interaction patterns

Adapters must not parse raw terminal output independently when the extraction layer already provides normalized meaning.

---

### 8. Key Concepts

#### 8.1 Session
A single terminal context in ptydeck.

#### 8.2 Conversation Target
The external destination that represents a ptydeck session on a messaging platform.

#### 8.3 Trigger
A rule that detects meaningful activity from ptydeck-observed output or runtime state.

#### 8.4 Trigger Profile
A named set of trigger rules tailored to a shell, tool, or workflow.

#### 8.5 Normalized Event
A platform-neutral event derived from ptydeck activity, such as prompt ready, task started, progress updated, warning detected, or attention required.

#### 8.6 Message Policy
A rule set that decides whether an event becomes a new message, an update to an existing message, an alert, or no external message.

#### 8.7 Action
A user-triggered inbound request from a messaging platform that ptydeck validates and maps onto an existing bounded action.

---

### 9. Session-Centric Communication Model

The communication model is session-centric.

Baseline assumptions:
- one session maps to one external conversation target in the initial model
- interaction is isolated per session
- routing must be unambiguous
- users should not need to infer which session a message belongs to

Initial operating model:
- one conversation target per terminal session
- one adapter-owned bot/application identity per messaging platform
- clear ownership of outbound and inbound communication

Deck-level summaries, grouped notifications, or supervisory views may exist later, but they should be extensions on top of a stable session-first base.

---

### 10. How Messages Are Determined

Not every line becomes a message.

Only detected, meaningful signals become message candidates.

This happens in two stages.

#### 10.1 Signal Extraction

ptydeck-observed session activity is analyzed for meaningful patterns.

#### 10.2 Message Eligibility

Detected events are evaluated according to message policy:
- should this create a new message?
- should it update an existing message?
- should it be stored silently as state?
- should it trigger an alert?
- should it be ignored as noise?

Detection and communication are related, but not identical.

---

### 11. Trigger Carriers

Signals can emerge from several carriers.

#### 11.1 Line-Based Carrier

The most common carrier.

Examples:
- prompts
- summary lines
- progress lines
- warnings
- explicit success or failure lines

#### 11.2 Chunk-Based Carrier

Terminal output may arrive in fragments.

Implication:
- the framework must tolerate partial text
- buffering may be required before evaluation

#### 11.3 Multi-Line Carrier

Some meaning only emerges across several lines.

Examples:
- section headers followed by details
- grouped summaries
- stack traces
- repeated block formats

#### 11.4 Temporal Carrier

Time and repetition can carry meaning.

Examples:
- prolonged silence after sustained output
- repeated updates at short intervals
- stalls
- transition from active output to idle state

#### 11.5 Structured Carrier

Some tools emit semi-structured text that is easier to classify than generic shell output.

This is useful when available, but must not be assumed globally.

---

### 12. Trigger Categories

The framework should support several trigger categories.

#### 12.1 Shell-Level Triggers

Generic triggers that apply across many sessions.

Examples:
- session starts
- shell becomes ready
- prompt appears for the first time
- prompt returns after a command
- shell requests user input
- shell exits

#### 12.2 Application-Level Triggers

Different tools produce different output signatures.

Useful classes include:
- coding agents
- build tools
- test runners
- package managers
- deployment tools
- transfer or synchronization tools
- long-running workers
- interactive tools

#### 12.3 Structural Triggers

Some signals are best detected by structure rather than keywords.

Examples:
- separator lines
- repeated headers
- standard block layouts
- phase boundaries
- summary block formatting

#### 12.4 Semantic Triggers

Some output communicates explicit meaning.

Examples:
- success indicators
- failure indicators
- warnings
- cancellation notices
- completion summaries
- requests for operator action

#### 12.5 Temporal Triggers

Some events are best inferred from timing behavior.

Examples:
- output has stalled
- the system is quiet after visible completion
- many small updates should collapse into one status message

#### 12.6 Noise-Reduction Triggers

Some output is meaningful only as a repeated pattern, not as isolated lines.

Examples:
- repeated identical status lines
- verbose low-value detail
- tiny progress increments
- transient substeps better represented by summary

---

### 13. Trigger Profiles

Because tools differ widely, rules should be grouped into Trigger Profiles.

A Trigger Profile is a curated bundle of detection logic for a given context.

Likely profile families:
- generic shell profile
- coding-agent profile
- build profile
- test profile
- package-manager profile
- deploy profile
- transfer/sync profile
- long-running job profile

Profile selection may later be:
- explicit
- inferred from session type or connection profile
- auto-detected from observed output style
- switched when a session changes mode

The concept does not require a perfect profile system on day one, but it should reserve the idea from the beginning.

---

### 14. Pattern Definition Model

The framework should use explicit pattern lists to identify relevant signals.

Conceptually, each rule should define:
- what it looks for
- what event it produces
- how important it is
- whether it updates an existing state or creates a new state
- whether it should create a message, update a message, or stay internal

Important expectations:
- rules should be explicit
- rules should be deterministic
- specific rules should override generic ones
- profile-specific rules should take precedence over fallback rules

---

### 15. Brainstorming of Useful Trigger Families

This section intentionally broadens the concept and should guide refinement.

#### 15.1 Generic Shell and Prompt Detection

Useful trigger ideas:
- first prompt after session creation
- prompt return after command execution
- current-working-state change
- command appears to have completed cleanly
- interactive prompt requests confirmation
- password-like or approval-like prompt appears

#### 15.2 Coding-Agent and Codex-Like Workflows

Useful trigger ideas:
- start of a new work section
- recurring status phrases for analysis, editing, testing, or planning
- explicit section separators
- user-attention requests
- summary blocks
- final completion phrasing
- waiting-for-input phrasing

This family is especially valuable because long, complex streams can be reduced into understandable progress signals.

#### 15.3 Build and Test Workflows

Useful trigger ideas:
- build started
- tests started
- test counts progressing
- warnings collected
- first failure surfaced
- pass/fail summary detected
- final artifact or output summary detected

#### 15.4 Package and Dependency Operations

Useful trigger ideas:
- dependency resolution began
- download or install progress
- retries
- completion state
- dependency conflict detected

#### 15.5 Deploy and Operations Workflows

Useful trigger ideas:
- deployment started
- environment identified
- rollout stage changed
- health-check phase entered
- rollback started
- deployment succeeded
- deployment failed

#### 15.6 Transfer and Synchronization Workflows

Useful trigger ideas:
- file counts progressing
- percentage complete
- throughput changes
- retries
- completion summary
- stalled transfer

#### 15.7 Long-Running Jobs and Workers

Useful trigger ideas:
- heartbeat detected
- iteration count advanced
- milestone reached
- no progress for too long
- worker ended or crashed

#### 15.8 Error and Escalation Signals

Useful trigger ideas:
- explicit error phrases
- exception or traceback start
- fatal termination indicator
- repeated retries with no recovery
- command completed with visible failure state

#### 15.9 Summary and Finalization Signals

Useful trigger ideas:
- summary blocks
- clear done phrases
- return to prompt after recognized work
- final statistics line
- explicit next-action hint

---

### 16. Normalized Event Model

The Signal Extraction Layer should convert output and relevant runtime state into a stable event vocabulary.

Illustrative event families:
- session created
- session ready
- prompt ready
- task started
- section detected
- progress updated
- warning detected
- error detected
- attention required
- command completed
- session completed
- session failed
- session idle
- controller changed
- share/spectator access changed

The exact taxonomy can evolve, but the principle should remain fixed: adapters consume normalized events, not raw PTY output.

---

### 17. Message Policy

A detected event does not automatically become a new message.

The framework should use message policies to decide the external representation.

#### 17.1 New Message
Use when a new section, major phase, completion result, or error requires its own message.

#### 17.2 Message Update
Use when progress evolves inside the same logical activity and should remain visually compact.

#### 17.3 Silent State Update
Use when the system should retain context internally without external noise.

#### 17.4 Escalation Message
Use when the system requires timely user attention.

#### 17.5 Suppression
Use when the signal adds little value or is already represented elsewhere.

---

### 18. Message Lifecycle Strategy

The framework should prefer a small number of meaningful messages.

Recommended strategy:
- one evolving message for one ongoing activity
- one new message for a major transition
- one final message for completion or failure
- immediate alert messages for urgent exceptions where needed

This keeps external conversations usable while preserving context.

---

### 19. Inbound Interaction Model

Messaging is not only outbound. It may also support bounded inbound interaction.

#### 19.1 Principle

Remote input is allowed only inside an explicit ptydeck control model.

#### 19.2 Interaction Modes

Useful modes include:
- read-only
- bounded-control
- extended-control

The initial product should prefer read-only plus bounded-control. Full terminal equivalence is out of scope.

#### 19.3 Action Types

Likely inbound actions:
- status request
- stop
- retry
- acknowledge
- request replay excerpt or summary
- trigger a bounded slash command
- send a predefined confirmation

These actions should map onto existing or future ptydeck-owned actions, not invent a second command language.

#### 19.4 Safety Expectations

Inbound interaction must be:
- authorized
- constrained
- observable in user-facing terms
- compatible with the session's current control and access state
- aligned with ptydeck send-safety and controller rules where write actions are involved

---

### 20. Security and Trust Model

The framework must assume that terminal sessions may expose sensitive information.

Therefore:
- output must be curated rather than dumped blindly
- write actions must be gated
- visibility must be intentional
- session routing must be unambiguous
- adapter behavior must not bypass ptydeck-level security decisions
- messaging adapters must not create a parallel trust model next to ptydeck share links, spectator access, or controller rules

If ptydeck says a session is read-only for a given actor, the adapter must respect that exactly.

---

### 21. Telegram as the First Adapter

Telegram remains a reasonable first reference adapter for this concept.

The reason is not that ptydeck should become Telegram-specific.

The reason is that the project needs one concrete adapter to validate:
- the event model
- the message lifecycle strategy
- bounded inbound actions
- session-to-conversation mapping

Telegram should therefore be treated as the first validation adapter, not as the permanent limit of the framework.

---

### 22. Telegram Operating Model

#### 22.1 Bot as Integration Anchor

All Telegram interaction should happen through one bot/application identity owned by the ptydeck deployment.

That bot is responsible for:
- sending updates
- updating running status messages
- receiving explicit user actions
- routing valid intent back into ptydeck

#### 22.2 Recommended Initial Conversation Model

Recommended starting point:
- one Telegram conversation target per ptydeck terminal session
- users observe and, where permitted, control that one session there

This is the clearest first mapping.

#### 22.3 Interaction Style

The Telegram adapter should prefer explicit interaction patterns:
- explicit commands
- explicit buttons or action affordances
- explicit session mapping

It should not depend on ambiguous free-text interpretation as the primary control path.

---

### 23. Telegram Capability Model for ptydeck

The Telegram adapter should validate the minimum useful product shape for ptydeck.

#### 23.1 Outbound Messaging

It should support:
- new status messages
- message updates for evolving activity
- concise completion summaries
- explicit alerts for warnings or failures

#### 23.2 Explicit Actions

It should support explicit bounded actions such as:
- Stop
- Retry
- Status
- Approve
- Dismiss

These should map back into ptydeck-owned operations.

#### 23.3 Text Command Fallback

A minimal text command surface may exist for:
- discoverability
- fallback control
- low-complexity operation

Where possible, it should align with existing ptydeck slash-command concepts instead of introducing unrelated terminology.

#### 23.4 Later Expansion

A richer Telegram surface may be explored later, but it is not required for the reference phase.

---

### 24. Telegram Phasing

#### Phase 1 — Outbound-Only Reference Adapter

Scope:
- session-to-conversation mapping
- status messages
- completion messages
- failure alerts
- no inbound execution control

Purpose:
- validate the event model
- validate trigger profiles
- validate message lifecycle strategy

#### Phase 2 — Controlled Interaction

Scope:
- explicit bounded actions
- minimal command surface
- stop/status/retry style interactions

Purpose:
- validate safe inbound actions
- confirm that the adapter can support practical bounded remote control

#### Phase 3 — Extended Telegram Control

Scope:
- broader action vocabulary
- richer interaction patterns
- optional richer control surfaces

Purpose:
- expand from notification layer to lightweight remote operating surface

---

### 25. Discord as a Future Adapter

Discord is relevant as a later adapter class because it encourages more structured interaction patterns than a simple message-only flow.

Strategic implications for ptydeck:
- stronger action-driven remote operation
- less reliance on free-text interpretation
- clearer structured controls once the event model is already stable

Discord should be viewed as a later interaction-oriented adapter, not the first validation target.

---

### 26. Slack as a Future Adapter

Slack is relevant as a later adapter class because it aligns well with workflow- and team-oriented operating models.

Strategic implications for ptydeck:
- stronger fit for team monitoring and operational communication
- stronger emphasis on concise summaries and handoff context
- better fit once the framework moves beyond single-operator notification value

Slack should therefore be treated as a later workflow-oriented adapter.

---

### 27. Adapter Taxonomy

Over time, the framework should recognize at least three practical adapter styles.

#### 27.1 Message-Driven Adapters
Primary focus:
- status updates
- message edits
- simple command flows

Representative example:
- Telegram as the first reference adapter

#### 27.2 Interaction-Driven Adapters
Primary focus:
- structured user actions
- stronger control surfaces
- less free-text dependence

Representative example:
- Discord-style interaction adapters

#### 27.3 Workflow-Driven Adapters
Primary focus:
- team operations
- approvals and handoffs
- operational communication rather than stream mirroring

Representative example:
- Slack-style workflow adapters

This taxonomy should influence roadmap planning, but not change the underlying ptydeck event model.

---

### 28. Recommended Roadmap

#### Phase A — Foundation

Deliver:
- Signal Extraction Layer
- initial normalized event model
- Trigger Profile concept
- message policy concept
- Telegram outbound reference adapter

#### Phase B — Safe Interaction

Deliver:
- bounded inbound action model
- explicit authorization and mode handling
- Telegram bounded action controls

#### Phase C — Richer Profiles

Deliver:
- broader profile coverage
- coding-agent-specific profiles
- build/test/deploy profiles
- stronger summary quality

#### Phase D — Advanced Adapters

Deliver:
- interaction-oriented adapters
- workflow-oriented adapters

#### Phase E — Extended Surfaces

Possible later exploration:
- richer control panels
- dashboards
- deck-level or multi-session oversight views

---

### 29. Requirements Summary

#### Must

- remain platform-independent at the core
- derive external messages from explicit signal extraction
- fit ptydeck's existing session/deck/share/control model
- support session-level isolation as the primary mapping model
- support message updates as well as new messages
- support configurable Trigger Profiles
- support a bounded inbound action model
- allow Telegram as the first operational adapter
- ensure adapters never bypass ptydeck authorization, controller rules, or share constraints

#### Should

- reduce noise aggressively
- support section-aware progress communication
- support application-specific trigger families
- support future interaction-rich adapters without redesign
- support future workflow-oriented adapters without redesign
- align inbound text control with existing ptydeck slash-command concepts where practical

#### May

- support richer dashboards later
- support auto-selection of Trigger Profiles later
- support deck-level or multi-session supervisory views later
- support richer adapter-specific surfaces later

---

### 30. Final Position

The correct product decision is not "build a Telegram bot".

The correct product decision is:
- build a generic Messaging Adapter Framework for ptydeck
- make signal extraction a first-class ptydeck capability
- derive external communication from explicit, profile-based triggers and message policy
- implement one concrete reference adapter first
- keep every adapter subordinate to ptydeck's own runtime, share, and control decisions

If that separation is preserved from the beginning, ptydeck gains a durable external communication architecture instead of a one-off integration.
