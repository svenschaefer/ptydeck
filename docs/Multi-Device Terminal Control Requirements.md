# ptydeck - Multi-Device Terminal Control Requirements

## 1. Purpose
This document defines the functional and non-functional requirements for enabling multi-device access and control of terminal sessions within ptydeck.

The goal is to allow multiple client devices, such as a desktop browser and a tablet, to simultaneously connect to, observe, and, when authorized, control the same terminal sessions hosted on a single desktop instance.

This document is requirement-focused. It defines system behavior and invariants but does not prescribe implementation details.

## 2. Scope
In scope:
- Shared access to terminal sessions across multiple devices
- Concurrent client connections to the same session
- Controlled input handling across clients
- Real-time synchronization of terminal output
- Session lifecycle visibility and control-state visibility
- Device-aware interaction semantics for heterogeneous clients

Out of scope:
- Distributed execution across multiple hosts
- Cloud-native or multi-node orchestration
- Long-term persistence of terminal processes beyond host lifecycle
- Cross-host control federation

## 3. Core Concepts
### 3.1 Host
The system instance that owns and executes terminal sessions.

### 3.2 Client
A user interface instance connected to the host.

### 3.3 Session
A single terminal instance backed by a PTY.

### 3.4 Deck
A logical grouping of sessions.

### 3.5 Owner
The authority responsible for a session and its access-control decisions.

### 3.6 Controller
The single client, if any, that currently has permission to send input and control PTY-authoritative interactive behavior for a session.

### 3.7 Spectator
A read-only client that may observe a session but must not send input.

## 4. Functional Requirements
### 4.1 Multi-Client Connectivity
- A session MUST support concurrent attachment by multiple clients.
- Multiple clients MAY observe the same session simultaneously.
- Client attachment and detachment MUST NOT terminate or otherwise affect the underlying PTY session.

### 4.2 Role Model and Rights
- Each session MUST have exactly one Owner.
- Each session MAY have zero or more Spectators.
- Each session MUST have zero or one Controller.
- Existing read-only sharing semantics MUST map to the Spectator role.
- The multi-device control feature MUST extend that existing read-only baseline rather than replace it.

Owner rights:
- The Owner MAY grant, transfer, or revoke control.
- The Owner MAY terminate or restart sessions, subject to broader product policy.

Controller rights:
- The Controller MAY send input.
- The Controller MAY trigger session-interactive control actions that depend on exclusive authority, including PTY resize.

Spectator rights:
- A Spectator MUST remain read-only.
- A Spectator MUST NOT send terminal input.
- A Spectator MUST NOT emit PTY-authoritative resize events.

### 4.3 Input and Control Arbitration
- The system MUST use a single-writer control model per session.
- At any point in time, at most one client MAY send input to a given session.
- Input from clients that are not the current Controller MUST be rejected.
- The system MUST NOT merge concurrent input streams from multiple clients into the same PTY.
- Simultaneous input attempts MUST be resolved deterministically.

Control transfer rules:
- Control MUST be an explicit state.
- The Owner MAY take control at any time.
- The Owner MAY transfer control to another client.
- A non-owner client MAY become Controller only if no Controller currently exists or if the Owner authorizes the transfer.

### 4.4 Real-Time Output Synchronization
- All attached clients MUST receive the same session output stream.
- Output order MUST remain consistent across clients.
- Output synchronization MUST preserve the PTY's authoritative ordering and timing semantics as closely as practical within the transport model.

### 4.5 Session Attachment and Reattachment
- A client MUST be able to attach to a running session without restarting it.
- A reconnecting client MUST be able to reattach to a running session.
- Session history depth for reattachment MUST be bounded and configurable.
- The retained history depth MUST be sufficient to make reattachment operationally useful.

### 4.6 Session Lifecycle Visibility
- All attached clients MUST be able to observe session lifecycle state, including whether the session is running, exited, degraded, or otherwise unavailable.
- Session lifecycle transitions MUST remain visible regardless of whether the observing client is the current Controller.

### 4.7 Deck Consistency
- Deck membership and session membership within a deck MUST remain globally consistent across clients.
- If a session is added to or removed from a deck, all attached clients MUST observe the same resulting deck membership.

### 4.8 PTY Resize Authority
- Exactly one authority MUST determine terminal size for a session at any moment.
- The active Controller MUST be the only client allowed to issue PTY-authoritative resize events.
- Resize events from non-controller clients MUST be ignored.
- If no Controller exists, the host MUST apply a stable default PTY size until a Controller becomes active.

### 4.9 Shared State Versus Client-Local State
The following session state MUST be globally synchronized:
- Session lifecycle state
- Deck membership and deck structure
- Current control state, including who is Controller
- Terminal output stream

The following UI state MUST remain client-local and MUST NOT be globally synchronized:
- Layout structure and pane sizing
- Active UI focus and client-local selection
- Scroll position
- Find and filter state
- Other local presentation-only view state

### 4.10 Device Heterogeneity
- The system MUST support heterogeneous clients with differing viewport sizes and interaction models.
- Device-specific UI differences MUST be resolved through client-local presentation state rather than by mutating the underlying session model.

## 5. Non-Functional Requirements
### 5.1 Latency
- On a local network, input-to-visible-effect latency SHOULD typically remain below 100 ms.
- Output propagation between attached clients SHOULD occur without user-perceptible delay.

### 5.2 Consistency
- All attached clients MUST observe the same terminal output in the same order.
- Divergence of session output between clients MUST be treated as a correctness failure.

### 5.3 Fault Tolerance
- A client disconnect MUST NOT terminate or corrupt the session.
- A reconnecting client MUST be able to reattach without session loss, subject to bounded history limits.
- Loss of a Spectator or Controller client MUST NOT invalidate the host-owned PTY.

### 5.4 Resource Management
- Session history and scrollback retention MUST be bounded.
- The system MUST remain stable under multiple concurrent client attachments to the same session.
- Multi-client observation MUST NOT cause unbounded growth in per-session runtime state.

### 5.5 Security and Authorization
- Every controlling or observing connection MUST be authenticated.
- Only authorized clients MAY become Controller.
- Spectator access MUST remain read-only.
- The system MUST preserve single-host execution authority even when multiple remote clients are attached.

### 5.6 Isolation
- Session control state MUST be isolated per session.
- Gaining control of one session MUST NOT implicitly grant control of unrelated sessions.
- Multi-device attachment to one session MUST NOT leak access into unrelated decks or sessions.

## 6. Observability Requirements
The system MUST expose control-relevant session metadata to attached clients.

At minimum, the following MUST be visible:
- The list of currently connected clients for a session
- The role of each connected client
- The current Controller, if any
- The identity of the last client that sent input
- The timestamp of the last control transfer
- The connection state of attached clients, where available through the transport/runtime model

Control-state transitions MUST be visible, including:
- Control acquisition
- Control transfer
- Control loss or revocation

## 7. Constraints
- The host remains the single execution authority for all processes.
- All session processes execute locally on the host.
- Multi-device support extends one host-owned runtime rather than distributing execution.

## 8. Resolved Requirement Decisions
The following requirement decisions are fixed by this document and are no longer open questions:
- Control model: single-writer, exclusive Controller per session
- Role model: Owner, optional single Controller, and read-only Spectators
- Resize model: Controller-owned PTY resize authority, otherwise stable host default size
- Session history: bounded, configurable, and sufficient for operationally useful reattachment
- Authentication: required for both observing and controlling access
- Device differences: resolved through client-local UI state, not session-model divergence
