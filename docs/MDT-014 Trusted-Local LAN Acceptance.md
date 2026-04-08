# MDT-014 Trusted-Local LAN Acceptance

This document is the execution and sign-off sheet for `MDT-014`.

Use it when validating `feature/h62-multi-device-control-foundation` from a real second LAN client under the production-like local hostnames:

- `https://ptydeck.local.secos.rocks`
- `https://api.ptydeck.local.secos.rocks`

Primary references:

- [DEPLOYMENT.md](../DEPLOYMENT.md) section `8.2` for the operational smoke procedure
- [DEPLOYMENT.md](../DEPLOYMENT.md) section `8.3` for branch merge-readiness gates
- [TODO.md](../TODO.md) for the current authoritative task wording

## 1. Goal

Close `MDT-014` only after a real second LAN client verifies that the trusted-local multi-device branch works under the real hostnames, with correct startup backup boot behavior, trusted-local identity creation, REST and WebSocket bootstrap, control handoff, and device-local layout recall.

## 2. Scope

In scope:

- frontend boot under the real hostname on a second LAN client
- browser-local startup-backup creation or verification
- browser-local trusted-local device identity creation or verification
- REST bearer-auth bootstrap
- WebSocket ticket bootstrap and connected runtime state
- startup takeover prompt behavior
- scope-aware control claim:
  - `All Sessions`
  - `This Deck`
  - `This Session`
- blocked-write reclaim behavior
- automatic device-local layout and terminal-size recall on takeover
- deterministic reclaim without prior release
- stale-device visibility and cleanup

Out of scope for `MDT-014` itself:

- the full rollback-to-`main` acceptance path
- broader multi-user or non-trusted-network authorization semantics
- merge approval by itself without the remaining branch-level acceptance checks

## 3. Ownership

- Task: `MDT-014`
- Owner: `QA`
- Coordination owner: `CODY`
- Final decision authority for branch merge/readiness: `SAS`

## 4. Preconditions

All items below must be true before starting:

1. Active branch is `feature/h62-multi-device-control-foundation`.
2. Backend and frontend are running on the primary host.
3. LAN DNS resolves both hostnames to the primary host:
   - `ptydeck.local.secos.rocks`
   - `api.ptydeck.local.secos.rocks`
4. The second LAN client uses a normal browser profile with `localStorage` enabled.
5. The second LAN client is not the same browser instance/profile as the already attached primary client.
6. At least one session exists that can be observed from both clients.
7. The operator can inspect browser storage on both clients if needed.

## 5. Evidence To Record

Record these fields while executing the acceptance:

- Date and time
- Branch and commit under test
- Primary host/device used
- Second LAN client device, OS, and browser
- Hostnames tested
- Pass/fail result per checkpoint
- Any observed defect, ambiguity, or workaround

## 6. Acceptance Checkpoints

Mark every checkpoint explicitly.

### 6.1 Network Baseline

- [ ] `https://ptydeck.local.secos.rocks/` returns `200`.
- [ ] `https://api.ptydeck.local.secos.rocks/api/v1/sessions` returns `401 Missing bearer token` before auth bootstrap.
- [ ] `https://api.ptydeck.local.secos.rocks/ws` with WebSocket upgrade headers returns `401 Missing WebSocket ticket` before ticket creation.

### 6.2 Second-Client Boot And Browser-Local State

- [ ] The second LAN client opens `https://ptydeck.local.secos.rocks/`.
- [ ] The frontend boots without a startup-gate failure screen.
- [ ] Browser storage contains or reuses `ptydeck.backup.pre-h62.v1`.
- [ ] Browser storage contains or reuses `ptydeck.trusted-local-client.v1`.
- [ ] The second client reaches a usable runtime state without a persistent REST bootstrap error.

### 6.3 REST And WebSocket Bootstrap

- [ ] REST auth bootstrap succeeds under `https://api.ptydeck.local.secos.rocks`.
- [ ] The browser obtains a WebSocket ticket under the real hostname path.
- [ ] The WebSocket ticket payload contains the trusted-local `clientId`.
- [ ] The WebSocket ticket payload contains the trusted-local device `label`.
- [ ] The WebSocket connection reaches the normal connected runtime state.

### 6.4 Shared Session Observation

- [ ] With the primary client already attached, the second LAN client attaches to the same session.
- [ ] Both clients observe the same session output.
- [ ] The second client appears in the attached-device list.
- [ ] The attached-device UI distinguishes `This device` from `Other device`.

### 6.5 Startup Takeover Prompt

- [ ] When the second client is not already the effective controller, the subtle trusted-local startup takeover prompt is shown.
- [ ] Declining the prompt keeps the second client attached without silently taking control.
- [ ] Accepting the prompt can take control without requiring a prior `Release` from the first client.

### 6.6 Scope-Aware Control Claim And Write Enforcement

- [ ] A blocked non-controller write exposes `Take Control` or `Reclaim Control`.
- [ ] `Take Control` / `Reclaim Control` succeeds deterministically without repeated retries.
- [ ] The compact `Control` flow can claim `All Sessions`.
- [ ] The compact `Control` flow can claim `This Deck`.
- [ ] The compact `Control` flow can claim `This Session`.
- [ ] The controller indicator updates on both clients after a control change.
- [ ] After takeover, the new controller can send input successfully.
- [ ] After takeover, the non-controller client is blocked from concurrent input or PTY-authoritative resize.
- [ ] A blocked send/paste/resize path can use reclaim-and-retry instead of ending as a passive read-only failure.

### 6.7 Device-Local Layout Recall

- [ ] A known device reapplies its own local layout on successful takeover.
- [ ] A known device reapplies its own terminal-size preference on successful takeover.
- [ ] A previously unseen device captures a first-use baseline instead of forcing another device's layout.
- [ ] Layout or terminal-size application stays local to the claiming device and does not disturb the other attached client.

### 6.8 Stale-Device Cleanup

- [ ] Disconnect or close one attached client.
- [ ] After the offline/stale window settles, the remaining client shows the stale/offline state consistently.
- [ ] When offered, the stale device can be forgotten explicitly without corrupting active control state.

## 7. Immediate Fail Conditions

Fail `MDT-014` immediately if any of the following occur:

- The second client cannot boot because startup-backup creation or verification fails.
- Trusted-local device identity cannot be created or reused in browser storage.
- REST or WebSocket bootstrap works only on loopback/dev URLs but fails on the real hostnames.
- The attached-device list diverges between the two clients.
- Blocked writes do not offer a reclaim path.
- Control state becomes ambiguous or both clients can write concurrently.
- Control handoff still depends on a prior explicit `Release`.
- Layout recall applies the wrong device's layout or causes cross-device layout fights.

## 8. Pass Criteria

`MDT-014` passes only when all of the following are true:

1. Every checkpoint in section `6` is marked pass.
2. No immediate fail condition from section `7` occurred.
3. The evidence fields from section `5` are filled.
4. Any observed defect is either absent or recorded as a non-blocking follow-up explicitly accepted by `SAS`.

## 9. Result Record

Fill this section during the real LAN run.

### Test Metadata

- Date:
- Branch:
- Commit:
- Primary host/device:
- Second LAN client/device:
- Browser:
- Hostnames tested:

### Outcome Summary

- Overall result: `PASS | FAIL`
- Blocking defects:
- Non-blocking follow-ups:
- Notes:

### Sign-Off

- Executed by (`QA`):
- Reviewed by (`CODY`):
- Final go/no-go (`SAS`):
