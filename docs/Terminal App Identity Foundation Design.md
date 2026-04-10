# Terminal App Identity Foundation Design

## 1. Purpose

This document defines the implementation shape for `APP-001` through `APP-004` in `v0.4.0-H79`.

The goal is to give the backend runtime one normalized, confidence-scored view of the app that currently owns a session's PTY so later consumers such as messaging, paste/continue logic, replay aggregation, and subtle UI affordances can share the same signal instead of maintaining separate heuristics.

## 2. Scope

This wave is single-user and runtime-local.

It covers:

- normalized active-app identity per session
- local PTY foreground-process inspection
- shell/app marker ingestion from the terminal stream
- alternate-screen and TUI-family signal handling
- confidence-based source arbitration
- first frontend visibility and integration seams

It does not cover:

- multi-user attribution
- plugin execution or external automation
- remote shell control
- free-form app inference from raw output alone
- adapter-specific heuristics embedded directly in messaging code

## 3. Design Goals

- Keep one shared runtime contract for app identity.
- Prefer strong runtime signals over regex guesses.
- Degrade safely to broad families or `unknown`.
- Keep the baseline useful for local sessions even when SSH or multiplexers reduce certainty.
- Make the signal consumable without forcing every consumer to understand PTY/process details.

## 4. Non-Goals

- Perfect app recognition in all cases.
- Guaranteed concrete labels for SSH, nested shells, `tmux`, or `screen` sessions.
- Terminal-stream semantic interpretation for every TUI protocol.
- Replacing the existing session lifecycle, replay, or messaging event model.

## 5. Normalized Identity Contract

The backend should expose a normalized app-identity object under each API/WS session payload.

```json
{
  "family": "coding-agent",
  "label": "codex",
  "source": "foreground-process",
  "confidence": 0.92,
  "details": {
    "processName": "codex",
    "argv0": "codex",
    "pid": 12345,
    "pgrp": 12345,
    "shellMarkers": ["osc133"],
    "alternateScreenActive": false
  },
  "updatedAt": 1775831045123
}
```

### 5.1 Required Fields

- `family`: broad runtime family
- `label`: best concrete app label when confidence is sufficient
- `source`: strongest winning source used for the current decision
- `confidence`: `0.0` to `1.0`
- `details`: source-specific diagnostics safe for operator/debug use
- `updatedAt`: unix epoch milliseconds

### 5.2 Initial Family Set

The first delivered families should be:

- `shell`
- `coding-agent`
- `build-test`
- `editor`
- `pager`
- `tui`
- `unknown`

Concrete labels may initially include:

- `bash`
- `zsh`
- `fish`
- `codex`
- `claude`
- `gemini`
- `vim`
- `nvim`
- `less`
- `man`
- `tmux`
- `screen`

The system must keep working even when `label` is empty and only `family` is available.

## 6. Source Priority

The arbitration order must be deterministic:

1. explicit launch/session hints
2. local foreground-process inspection
3. shell/app integration markers
4. bounded terminal-mode signals
5. output heuristics

Lower-priority sources may refine broad family state, but they must not override stronger contradictory evidence without a higher confidence score and an explicit conflict rule.

## 7. Source A: Explicit Hints

Examples:

- `session.name`
- `startCommand`
- connection-profile metadata
- future explicit `appHint`

Rules:

- explicit hints are strong but not absolute
- obvious stable identities such as `codex`, `claude`, `pytest`, or `vim` may seed the initial family and label
- explicit hints should not hide a later strong contradictory local foreground-process result forever; the arbitration model should be able to downgrade or replace them

## 8. Source B: Foreground Process Inspection

This is the primary local-runtime signal.

### 8.1 Baseline

For local PTY sessions, identify the controlling terminal's foreground process group and inspect the owning process tree.

Typical standard process-inspection pattern:

- resolve the PTY/TTY attached to the session
- resolve the terminal foreground process group
- enumerate candidate processes in that process group
- inspect:
  - executable name/path
  - `cmdline`
  - `comm`
  - parent/ancestor chain
  - session/process-group relationship

### 8.2 Strong Identification Cases

These should usually yield high confidence:

- direct foreground binary is `codex`, `claude`, `gemini`, `vim`, `nvim`, `less`, `man`
- direct foreground command clearly reflects a build/test tool such as `pytest`, `jest`, `vitest`, `cargo`, `go test`, `npm test`

### 8.3 Multiplexer and Wrapper Cases

When the foreground process resolves only to:

- `bash`, `zsh`, `fish`
- `tmux`
- `screen`
- wrapper shells such as `sh -c ...`

then the system should:

- degrade confidence
- preserve broader family state
- avoid pretending the wrapped app is known unless a stronger corroborating signal exists

## 9. Source C: Shell-Integration Markers

These markers are optional hints, not mandatory infrastructure.

### 9.1 Initial Marker Set

- FinalTerm-style `OSC 133`
  - prompt start / command start / command finished boundaries
- VS Code shell-integration `OSC 633`
- iTerm2 shell-integration metadata such as current-directory updates

### 9.2 First Use in H79

In this wave, markers should primarily:

- improve confidence that the session is shell-like
- indicate prompt/command boundaries
- distinguish command-output phases from idle shell prompt phases
- enrich `details`, not become a second runtime model

## 10. Source D: Terminal-Mode Signals

The first bounded mode signal is alternate-screen usage.

### 10.1 Meaning

Alternate-screen transitions should be treated as a family hint for fullscreen terminal apps.

Likely interpretations:

- `editor`
- `pager`
- `tui`

### 10.2 Limits

Alternate-screen transitions alone must not produce a concrete app label.

Example:

- entering alternate screen may justify `family: "tui"`
- it must not by itself justify `label: "vim"`

## 11. Source E: Output Heuristics

Output heuristics remain allowed, but only as fallback.

Rules:

- use bounded known-pattern hints only
- never let output regexes override a strong local process result without explicit confidence rules
- keep them provider-neutral and consumer-neutral

Examples:

- Codex placeholder strings
- known test-summary/result lines
- stable agent/tool banners

## 12. Arbitration Model

Each source should emit a candidate:

```json
{
  "family": "coding-agent",
  "label": "codex",
  "source": "foreground-process",
  "confidence": 0.92,
  "details": {"pid": 12345}
}
```

The arbitrator should:

- compare candidates by source priority and confidence
- keep the highest-confidence compatible result
- downgrade on contradiction instead of thrashing between labels
- avoid frequent flapping for short-lived wrappers or noisy transient signals

### 12.1 Recommended Stability Rules

- require a minimum confidence delta before replacing an existing concrete label
- prefer family continuity over label churn
- keep `updatedAt` monotonic only on material changes
- keep a short recent-history ring for debugging and tests

## 13. Session State Model

Each live session should hold an internal state structure similar to:

```json
{
  "current": {"family": "shell", "label": "bash", "source": "foreground-process", "confidence": 0.74},
  "recentCandidates": [],
  "alternateScreenActive": false,
  "shellMarkers": {},
  "lastForegroundProbeAt": 0,
  "lastOutputHintAt": 0
}
```

This state is runtime metadata only. It is not authoritative user data and does not need long-term persistence in the first wave.

## 14. Backend Integration Points

### 14.1 Session Manager / PTY Stream

Use stream hooks to ingest:

- shell markers
- alternate-screen transitions
- fallback output hints

### 14.2 Runtime Session API / WS Payloads

Expose normalized app identity in the session payload returned through REST and WebSocket snapshots/updates.

### 14.3 Messaging Runtime

The messaging runtime should consume the shared app-identity field instead of repeating app detection in profile selection or future message coalescing work.

### 14.4 Replay / Paste Follow-Ups

Replay-block aggregation and paste continuation may later use app identity, but `H79` should only provide the signal and minimal first-consumer wiring, not a large behavioral rewrite.

## 15. Frontend Integration

The frontend surface should stay subtle.

The first visibility path should be a small session-local indicator or detail row that can show:

- family
- label
- source
- confidence

This is for operator clarity and debugging, not as a large new management UI.

## 16. Validation Strategy

### 16.1 Backend

Add direct tests for:

- candidate normalization
- arbitration precedence
- confidence downgrade/upgrade paths
- local foreground-process resolution
- multiplexer fallback behavior
- shell-marker ingestion
- alternate-screen transitions
- low-confidence unknown fallback

### 16.2 Frontend

Add smoke-level tests for:

- rendering the normalized identity fields
- safe behavior when identity is absent or unknown
- no UI bloat/regression in the main session surface

### 16.3 Full Gate

`APP-006` closes the wave only after:

- focused regressions are green
- `npm run lint`
- `npm run test`
- `npm run test:coverage:check`

## 17. Risks

- Local foreground-process inspection may be straightforward for direct PTY children but weaker for nested shells and multiplexers.
- SSH sessions may only support broad families in the first wave.
- Output heuristics can become brittle if they are allowed to dominate stronger signals.
- App identity can flap if replacement thresholds are too aggressive.

## 18. Deliverable Boundary for H79

`H79` is done when all of the following are true:

- backend exposes one normalized active-app identity contract per session
- local PTY sessions can usually identify foreground shell versus common direct apps with confidence
- shell markers and alternate-screen state feed that same identity layer
- messaging and at least one additional consumer read the shared identity instead of duplicating heuristics
- frontend exposes a subtle operator-visible identity surface
- quality gates pass and docs remain synchronized
