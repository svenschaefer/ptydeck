import test from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/errors.js";
import { createRuntimeSessionControlAuthority } from "../src/runtime-session-control-authority.js";

function createControlStateHelpers() {
  let changedAt = 10;
  return {
    buildSessionControlStateView(controlState, attachedClients) {
      return {
        owner: controlState.owner,
        currentController:
          attachedClients.find((entry) => entry.clientId === controlState.controllerClientId) || null,
        attachedClients: attachedClients.map((entry) => ({ ...entry }))
      };
    },
    normalizeSessionControlState(state, options = {}) {
      return {
        owner: state?.owner || options.fallbackOwner || { subject: "owner", tenantId: "default" },
        controllerClientId: state?.controllerClientId || null,
        controllerChangedAt: Number.isInteger(state?.controllerChangedAt) ? state.controllerChangedAt : 0,
        allowAutoAssign: state?.allowAutoAssign !== false,
        lastInputBy: state?.lastInputBy || null,
        lastInputClientId: state?.lastInputClientId || null
      };
    },
    setSessionControllerClient(state, clientId, options = {}) {
      const normalizedState = {
        ...(state && typeof state === "object" ? state : {})
      };
      const nextClientId = clientId || null;
      const nextAllowAutoAssign = options.allowAutoAssign !== false;
      if (
        normalizedState.controllerClientId === nextClientId &&
        normalizedState.allowAutoAssign === nextAllowAutoAssign
      ) {
        return normalizedState;
      }
      changedAt += 1;
      return {
        ...normalizedState,
        controllerClientId: nextClientId,
        allowAutoAssign: nextAllowAutoAssign,
        controllerChangedAt: changedAt
      };
    },
    updateSessionControlLastInput(state, details = {}) {
      return {
        ...(state && typeof state === "object" ? state : {}),
        lastInputBy: details.principal || null,
        lastInputClientId: details.clientId || null
      };
    }
  };
}

function createAuthorityHarness() {
  const sessions = new Map([
    ["session-1", { id: "session-1", deckId: "deck-a", state: "running" }],
    ["session-2", { id: "session-2", deckId: "deck-a", state: "running" }],
    ["session-3", { id: "session-3", deckId: "deck-b", state: "running" }]
  ]);
  const sessionControlStates = new Map([
    [
      "session-1",
      {
        owner: { subject: "owner", tenantId: "default" },
        controllerClientId: null,
        controllerChangedAt: 1,
        allowAutoAssign: true
      }
    ],
    [
      "session-2",
      {
        owner: { subject: "owner", tenantId: "default" },
        controllerClientId: null,
        controllerChangedAt: 1,
        allowAutoAssign: false
      }
    ],
    [
      "session-3",
      {
        owner: { subject: "other-owner", tenantId: "default" },
        controllerClientId: "client-stale",
        controllerChangedAt: 2,
        allowAutoAssign: true
      }
    ]
  ]);
  const attachments = new Map([
    [
      "client-owner",
      {
        auth: { subject: "owner", tenantId: "default", allowedSessions: ["session-1", "session-2"] },
        client: {
          clientId: "client-owner",
          subject: "owner",
          tenantId: "default",
          label: "Owner Desk",
          accessMode: "operator",
          active: true,
          activeConnectionCount: 1
        }
      }
    ],
    [
      "client-other",
      {
        auth: { subject: "other-owner", tenantId: "default", allowedSessions: ["session-3"] },
        client: {
          clientId: "client-other",
          subject: "other-owner",
          tenantId: "default",
          label: "Other Desk",
          accessMode: "operator",
          active: true,
          activeConnectionCount: 1
        }
      }
    ],
    [
      "client-spectator",
      {
        auth: { subject: "viewer", tenantId: "default", allowedSessions: ["session-1"] },
        client: {
          clientId: "client-spectator",
          subject: "viewer",
          tenantId: "default",
          label: "Read Only",
          accessMode: "spectator",
          active: true,
          activeConnectionCount: 1
        }
      }
    ],
    [
      "client-offline",
      {
        auth: { subject: "owner", tenantId: "default", allowedSessions: ["session-1"] },
        client: {
          clientId: "client-offline",
          subject: "owner",
          tenantId: "default",
          label: "Offline",
          accessMode: "operator",
          active: false,
          activeConnectionCount: 0
        }
      }
    ]
  ]);
  const broadcasts = [];
  const helperFns = createControlStateHelpers();
  const registry = {
    listEntries() {
      return Array.from(attachments.values(), (entry) => ({
        auth: entry.auth ? { ...entry.auth } : null,
        client: entry.client ? { ...entry.client } : null
      }));
    },
    findActiveAttachment(auth, clientId) {
      const entry = attachments.get(clientId);
      if (!entry?.client || entry.client.active !== true) {
        return null;
      }
      if (entry.auth?.subject !== auth?.subject || entry.auth?.tenantId !== auth?.tenantId) {
        return null;
      }
      return { ...entry.client };
    },
    updateAttachmentLabel(auth, clientId, label) {
      const entry = attachments.get(clientId);
      if (!entry || entry.auth?.subject !== auth?.subject || entry.auth?.tenantId !== auth?.tenantId) {
        return null;
      }
      entry.client.label = label;
      return { ...entry.client };
    },
    forgetAttachment(auth, clientId) {
      const entry = attachments.get(clientId);
      if (!entry || entry.auth?.subject !== auth?.subject || entry.auth?.tenantId !== auth?.tenantId) {
        return;
      }
      attachments.delete(clientId);
    }
  };
  const authority = createRuntimeSessionControlAuthority({
    sessionControlAttachmentRegistry: registry,
    sessionControlStates,
    sessionControlClientIdHeader: "x-ptydeck-client-id",
    createSessionControlPrincipal: (auth) =>
      auth ? { subject: auth.subject || "", tenantId: auth.tenantId || "" } : { subject: "", tenantId: "" },
    sessionControlPrincipalsMatch: (left, right) =>
      Boolean(left && right && left.subject === right.subject && left.tenantId === right.tenantId),
    buildSessionControlStateView: helperFns.buildSessionControlStateView,
    normalizeSessionControlState: helperFns.normalizeSessionControlState,
    setSessionControllerClient: helperFns.setSessionControllerClient,
    updateSessionControlLastInput: helperFns.updateSessionControlLastInput,
    normalizeSessionControlClientLabel: (label) => String(label || "").trim(),
    getSessionControlState(sessionId, fallbackOwner = null) {
      if (!sessionControlStates.has(sessionId)) {
        sessionControlStates.set(
          sessionId,
          helperFns.normalizeSessionControlState({}, { fallbackOwner: fallbackOwner || { subject: "owner", tenantId: "default" } })
        );
      }
      return sessionControlStates.get(sessionId);
    },
    resolveSessionControlModel(sessionId) {
      return sessions.get(sessionId) || null;
    },
    isSessionVisibleToAuth(session, auth) {
      if (!auth || !Array.isArray(auth.allowedSessions)) {
        return true;
      }
      return auth.allowedSessions.includes(session.id);
    },
    getApiSessionOrThrow(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
      }
      return { ...session };
    },
    listSessionIdsForAuth(auth = null) {
      if (!auth || !Array.isArray(auth.allowedSessions)) {
        return Array.from(sessions.keys());
      }
      return auth.allowedSessions.filter((sessionId) => sessions.has(sessionId));
    },
    getDeckOrThrow(deckId) {
      if (!["deck-a", "deck-b"].includes(deckId)) {
        throw new ApiError(404, "DeckNotFound", `Deck '${deckId}' was not found.`);
      }
      return { id: deckId };
    },
    resolveSessionDeckId(sessionId) {
      return sessions.get(sessionId)?.deckId || "";
    },
    broadcastSessionUpdated(sessionId, traceSeed) {
      broadcasts.push({ sessionId, traceSeed });
    }
  });

  return {
    attachments,
    authority,
    broadcasts,
    sessions,
    sessionControlStates
  };
}

test("runtime session-control authority filters attached clients and builds persisted control snapshots deterministically", () => {
  const { authority } = createAuthorityHarness();

  assert.deepEqual(
    authority.listAttachedClientsForSession("session-1").map((entry) => entry.clientId),
    ["client-owner", "client-spectator", "client-offline"]
  );
  assert.deepEqual(
    authority.listAttachedClientsForSession("session-3").map((entry) => entry.clientId),
    ["client-other"]
  );
  assert.deepEqual(
    authority.buildApiSessionControlState("session-1"),
    {
      owner: { subject: "owner", tenantId: "default" },
      currentController: null,
      attachedClients: [
        {
          clientId: "client-owner",
          subject: "owner",
          tenantId: "default",
          label: "Owner Desk",
          accessMode: "operator",
          active: true,
          activeConnectionCount: 1
        },
        {
          clientId: "client-spectator",
          subject: "viewer",
          tenantId: "default",
          label: "Read Only",
          accessMode: "spectator",
          active: true,
          activeConnectionCount: 1
        },
        {
          clientId: "client-offline",
          subject: "owner",
          tenantId: "default",
          label: "Offline",
          accessMode: "operator",
          active: false,
          activeConnectionCount: 0
        }
      ]
    }
  );
  assert.deepEqual(
    authority.withPersistedSessionControlState({ id: "session-1", name: "Alpha" }),
    {
      id: "session-1",
      name: "Alpha",
      controlState: {
        owner: { subject: "owner", tenantId: "default" },
        controllerClientId: null,
        controllerChangedAt: 1,
        allowAutoAssign: true
      }
    }
  );
});

test("runtime session-control authority reconciles controller assignment and request-client resolution deterministically", () => {
  const { authority, sessionControlStates } = createAuthorityHarness();

  assert.equal(authority.reconcileSessionControllerForSession("missing-session"), false);
  assert.equal(authority.reconcileSessionControllerForSession("session-1"), true);
  assert.equal(sessionControlStates.get("session-1").controllerClientId, "client-owner");

  assert.equal(authority.reconcileSessionControllerForSession("session-3"), true);
  assert.equal(sessionControlStates.get("session-3").controllerClientId, "client-other");

  assert.equal(authority.resolveSessionControlClientId({ headers: {} }, "session-1", { subject: "owner", tenantId: "default" }), null);
  assert.equal(
    authority.resolveSessionControlClientId(
      { headers: { "x-ptydeck-client-id": "client-owner" } },
      "session-1",
      { subject: "owner", tenantId: "default" }
    ),
    "client-owner"
  );
  assert.equal(
    authority.resolveSessionControlClientId(
      { headers: { "x-ptydeck-client-id": "client-spectator" } },
      "session-1",
      { subject: "owner", tenantId: "default" }
    ),
    null
  );
  assert.equal(
    authority.recordSessionLastInput(
      "session-1",
      { subject: "owner", tenantId: "default" },
      { headers: { "x-ptydeck-client-id": "client-owner" } }
    ).lastInputClientId,
    "client-owner"
  );
  assert.throws(
    () => authority.requireActiveSessionControlAttachment({ subject: "owner", tenantId: "default" }, { headers: {} }),
    /active attached session client/
  );
  assert.equal(
    authority.requireSessionControlRequestClient(
      "session-1",
      { subject: "owner", tenantId: "default" },
      { headers: { "x-ptydeck-client-id": "client-owner" } }
    ).clientId,
    "client-owner"
  );
});

test("runtime session-control authority enforces controller and owner-only access deterministically", () => {
  const { authority, attachments, sessionControlStates } = createAuthorityHarness();

  attachments.get("client-owner").client.active = false;
  attachments.get("client-owner").client.activeConnectionCount = 0;
  attachments.get("client-owner").auth.allowedSessions = ["session-3"];
  attachments.get("client-offline").auth.allowedSessions = ["session-3"];
  sessionControlStates.set("session-1", {
    owner: { subject: "owner", tenantId: "default" },
    controllerClientId: null,
    controllerChangedAt: 5,
    allowAutoAssign: true
  });

  assert.equal(
    authority.ensureSessionControllerAccess("session-1", { subject: "owner", tenantId: "default" }, { headers: {} }, "write to this session").requestClient,
    null
  );
  assert.throws(
    () =>
      authority.ensureSessionControllerAccess(
        "session-1",
        { subject: "viewer", tenantId: "default" },
        { headers: {} },
        "write to this session"
      ),
    /Only the active controller may write to this session/
  );

  attachments.get("client-owner").client.active = true;
  attachments.get("client-owner").client.activeConnectionCount = 1;
  attachments.get("client-owner").auth.allowedSessions = ["session-1", "session-2"];
  authority.reconcileSessionControllerForSession("session-1");
  assert.throws(
    () =>
      authority.ensureSessionControllerAccess(
        "session-1",
        { subject: "viewer", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-spectator" } },
        "write to this session"
      ),
    /Only the active controller may write to this session/
  );
  assert.throws(
    () => authority.ensureMessagingSessionInputAccess("session-3", "send terminal input"),
    /Only the session owner may send terminal input/
  );
});

test("runtime session-control authority mutates take, release, transfer, rename, forget, and scope-take flows deterministically", () => {
  const { attachments, authority, broadcasts, sessionControlStates } = createAuthorityHarness();

  const takeResult = authority.takeSessionControlOrThrow(
    "session-1",
    { subject: "owner", tenantId: "default" },
    { headers: { "x-ptydeck-client-id": "client-owner" } },
    { source: "test" }
  );
  assert.equal(takeResult.currentController?.clientId, "client-owner");

  const transferResult = authority.transferSessionControlOrThrow(
    "session-1",
    "client-spectator",
    { subject: "owner", tenantId: "default" },
    { headers: { "x-ptydeck-client-id": "client-owner" } },
    { source: "test" }
  );
  assert.equal(transferResult.currentController?.clientId, "client-spectator");

  const releaseResult = authority.releaseSessionControlOrThrow(
    "session-1",
    { subject: "owner", tenantId: "default" },
    { headers: { "x-ptydeck-client-id": "client-owner" } },
    { source: "test" }
  );
  assert.equal(releaseResult.currentController, null);
  assert.equal(sessionControlStates.get("session-1").allowAutoAssign, false);

  const renameResult = authority.renameSessionControlClientOrThrow(
    "session-1",
    "Desk Alpha",
    { subject: "owner", tenantId: "default" },
    { headers: { "x-ptydeck-client-id": "client-owner" } },
    { source: "rename" }
  );
  assert.equal(renameResult.attachedClients.find((entry) => entry.clientId === "client-owner")?.label, "Desk Alpha");

  const forgetResult = authority.forgetSessionControlClientOrThrow(
    "session-1",
    "client-offline",
    { subject: "owner", tenantId: "default" },
    { headers: { "x-ptydeck-client-id": "client-owner" } },
    { source: "forget" }
  );
  assert.equal(forgetResult.attachedClients.some((entry) => entry.clientId === "client-offline"), false);

  const scopeResult = authority.takeSessionControlScopeOrThrow(
    "deck",
    { deckId: "deck-a" },
    { subject: "owner", tenantId: "default", allowedSessions: ["session-1", "session-2"] },
    { headers: { "x-ptydeck-client-id": "client-owner" } },
    { source: "scope" }
  );
  assert.deepEqual(scopeResult.updatedSessions.map((session) => session.id), ["session-1", "session-2"]);
  assert.equal(sessionControlStates.get("session-2").controllerClientId, "client-owner");

  assert.throws(
    () =>
      authority.takeSessionControlScopeOrThrow(
        "bogus",
        {},
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
      ),
    /Field 'scope' must be one of: all, deck, session/
  );
  assert.throws(
    () =>
      authority.forgetSessionControlClientOrThrow(
        "session-1",
        "client-owner",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
      ),
    /still attached/
  );

  assert.ok(broadcasts.length >= 6);
  assert.equal(attachments.has("client-offline"), false);
});

test("runtime session-control authority covers attachment and request guard rails", () => {
  const { attachments, authority, sessionControlStates } = createAuthorityHarness();

  assert.deepEqual(authority.listAttachedClientsForSession("missing-session"), []);
  assert.equal(authority.findAttachedClientForSession("session-1", null, { subject: "owner", tenantId: "default" }), null);
  assert.equal(
    authority.resolveSessionControlClientId(
      { headers: { "x-ptydeck-client-id": [" client-owner "] } },
      "session-1",
      { subject: "owner", tenantId: "default" }
    ),
    "client-owner"
  );

  assert.throws(
    () =>
      authority.requireActiveSessionControlAttachment(
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-offline" } }
      ),
    /active attached session client/i
  );
  assert.throws(
    () =>
      authority.requireSessionControlRequestClient(
        "session-3",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
      ),
    /active attached session client/i
  );
  assert.throws(
    () =>
      authority.requireOperatorSessionControlRequestClient(
        "session-1",
        { subject: "viewer", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-spectator" } }
      ),
    /Read-only spectator clients/i
  );
  assert.throws(
    () =>
      authority.requireOperatorSessionControlAttachment(
        { subject: "viewer", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-spectator" } }
      ),
    /Read-only spectator clients/i
  );

  attachments.get("client-owner").auth.allowedSessions = [];
  sessionControlStates.set("session-2", {
    owner: { subject: "owner", tenantId: "default" },
    controllerClientId: null,
    controllerChangedAt: 7,
    allowAutoAssign: false
  });
  assert.equal(authority.reconcileSessionControllerForSession("session-2"), true);
  assert.equal(sessionControlStates.get("session-2").allowAutoAssign, true);
});

test("runtime session-control authority covers controller, owner, rename, and scope edge cases", () => {
  const { attachments, authority, broadcasts, sessionControlStates } = createAuthorityHarness();

  sessionControlStates.set("session-1", {
    owner: { subject: "owner", tenantId: "default" },
    controllerClientId: null,
    controllerChangedAt: 12,
    allowAutoAssign: false
  });
  assert.throws(
    () =>
      authority.ensureSessionControllerAccess(
        "session-1",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } },
        "write to this session"
      ),
    /No client currently holds session control/i
  );

  authority.takeSessionControlOrThrow(
    "session-1",
    { subject: "owner", tenantId: "default" },
    { headers: { "x-ptydeck-client-id": "client-owner" } }
  );
  attachments.get("client-other").auth.allowedSessions = ["session-1"];
  assert.throws(
    () =>
      authority.releaseSessionControlOrThrow(
        "session-1",
        { subject: "other-owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-other" } }
      ),
    /Only the owner or active controller can release session control/i
  );
  assert.throws(
    () =>
      authority.transferSessionControlOrThrow(
        "session-1",
        "client-offline",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
      ),
    /not actively attached/i
  );
  assert.throws(
    () =>
      authority.renameSessionControlClientOrThrow(
        "session-1",
        "   ",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
      ),
    /Field 'label' must be a non-empty string/i
  );
  assert.throws(
    () =>
      authority.forgetSessionControlClientOrThrow(
        "session-1",
        "missing-client",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
      ),
    /not attached to this session/i
  );

  sessionControlStates.set("session-1", {
    ...sessionControlStates.get("session-1"),
    owner: { subject: "", tenantId: "" }
  });
  const messagingAccess = authority.ensureMessagingSessionInputAccess("session-1", "send terminal input through messaging");
  assert.equal(messagingAccess.requestClient, null);
  assert.equal(messagingAccess.controlView.owner.subject, "");

  assert.deepEqual(
    authority.listClaimableSessionIdsForScope(
      "all",
      {},
      { subject: "owner", tenantId: "default", allowedSessions: ["session-1", "session-2"] }
    ),
    ["session-1", "session-2"]
  );
  assert.deepEqual(
    authority.listClaimableSessionIdsForScope(
      "session",
      { sessionId: " session-1 " },
      { subject: "owner", tenantId: "default", allowedSessions: ["session-1", "session-2"] }
    ),
    ["session-1"]
  );
  assert.throws(
    () => authority.listClaimableSessionIdsForScope("deck", {}, { subject: "owner", tenantId: "default" }),
    /Field 'deckId' is required/i
  );
  assert.throws(
    () => authority.listClaimableSessionIdsForScope("session", {}, { subject: "owner", tenantId: "default" }),
    /Field 'sessionId' is required/i
  );

  const updatedState = authority.updateSessionControlStateAndBroadcast("session-1", {
    controllerClientId: "client-owner",
    controllerChangedAt: 42,
    allowAutoAssign: false
  });
  assert.equal(updatedState.currentController?.clientId, "client-owner");
  assert.equal(sessionControlStates.get("session-1").owner.subject, "");

  authority.broadcastSessionControlRefreshForAuth(
    { subject: "owner", tenantId: "default", allowedSessions: ["session-1", "session-2"] },
    { source: "refresh" }
  );
  assert.ok(broadcasts.some((entry) => entry.sessionId === "session-1" && entry.traceSeed?.source === "refresh"));
  assert.ok(broadcasts.some((entry) => entry.sessionId === "session-2" && entry.traceSeed?.source === "refresh"));
});

test("runtime session-control authority covers retained success and fallback guard rails deterministically", () => {
  const { attachments, authority, sessionControlStates } = createAuthorityHarness();

  authority.takeSessionControlOrThrow(
    "session-1",
    { subject: "owner", tenantId: "default" },
    { headers: { "x-ptydeck-client-id": "client-owner" } }
  );
  const controllerAccess = authority.ensureSessionControllerAccess(
    "session-1",
    { subject: "owner", tenantId: "default" },
    { headers: { "x-ptydeck-client-id": "client-owner" } },
    "write to this session"
  );
  assert.equal(controllerAccess.requestClient?.clientId, "client-owner");
  assert.equal(controllerAccess.controlView.currentController?.clientId, "client-owner");

  attachments.get("client-other").auth.allowedSessions = ["session-1"];
  assert.throws(
    () =>
      authority.transferSessionControlOrThrow(
        "session-1",
        "client-spectator",
        { subject: "other-owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-other" } }
      ),
    /Only the owner or active controller can transfer session control/i
  );
  assert.throws(
    () =>
      authority.transferSessionControlOrThrow(
        "session-1",
        "   ",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
      ),
    /Field 'clientId' must be a non-empty string/i
  );
  assert.throws(
    () => {
      const renameFailureAuthority = createRuntimeSessionControlAuthority({
        sessionControlAttachmentRegistry: {
          listEntries: () => [
            {
              auth: { subject: "owner", tenantId: "default", allowedSessions: ["session-1"] },
              client: {
                clientId: "client-owner",
                subject: "owner",
                tenantId: "default",
                label: "Owner Desk",
                accessMode: "operator",
                active: true,
                activeConnectionCount: 1
              }
            }
          ],
          findActiveAttachment: () => ({
            clientId: "client-owner",
            subject: "owner",
            tenantId: "default",
            label: "Owner Desk",
            accessMode: "operator",
            active: true,
            activeConnectionCount: 1
          }),
          updateAttachmentLabel: () => null,
          forgetAttachment() {}
        },
        createSessionControlPrincipal: (auth) =>
          auth ? { subject: auth.subject || "", tenantId: auth.tenantId || "" } : { subject: "", tenantId: "" },
        sessionControlPrincipalsMatch: (left, right) =>
          Boolean(left && right && left.subject === right.subject && left.tenantId === right.tenantId),
        getSessionControlState: () => ({
          owner: { subject: "owner", tenantId: "default" },
          controllerClientId: "client-owner",
          controllerChangedAt: 1,
          allowAutoAssign: true
        }),
        resolveSessionControlModel: () => ({ id: "session-1", deckId: "deck-a", state: "running" }),
        getApiSessionOrThrow: () => ({ id: "session-1" })
      });
      return renameFailureAuthority.renameSessionControlClientOrThrow(
        "session-1",
        "Desk Alpha",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
      );
    },
    /active attached session client/i
  );

  attachments.get("client-owner").client.label = "Owner Desk";
  attachments.get("client-spectator").auth.subject = "owner";
  attachments.get("client-spectator").client.subject = "owner";
  assert.throws(
    () =>
      authority.forgetSessionControlClientOrThrow(
        "session-1",
        "client-spectator",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
      ),
    /Only stale offline devices can be forgotten/i
  );

  const fallbackStates = new Map();
  const fallbackAuthority = createRuntimeSessionControlAuthority({
    sessionControlStates: fallbackStates,
    resolveSessionControlModel(sessionId) {
      return sessionId === "session-fallback" ? { id: sessionId, deckId: "deck-a", state: "running" } : null;
    },
    sessionControlAttachmentRegistry: {
      listEntries() {
        return [
          { auth: null, client: null },
          {
            auth: null,
            client: {
              clientId: "client-fallback",
              accessMode: "operator",
              active: true,
              activeConnectionCount: 1
            }
          }
        ];
      },
      findActiveAttachment() {
        return null;
      },
      updateAttachmentLabel() {
        return null;
      },
      forgetAttachment() {}
    }
  });

  assert.deepEqual(fallbackAuthority.listAttachedClientsForSession("missing-session"), []);
  assert.equal(fallbackAuthority.reconcileSessionControllerForSession("session-fallback"), true);
  assert.deepEqual(fallbackStates.get("session-fallback"), {
    owner: null,
    controllerClientId: "client-fallback",
    controllerChangedAt: 0,
    allowAutoAssign: true
  });
  assert.throws(
    () => fallbackAuthority.getSessionControlViewOrThrow("session-fallback"),
    /Session not found/i
  );

  sessionControlStates.set("session-1", {
    ...sessionControlStates.get("session-1"),
    controllerClientId: "client-owner"
  });
  assert.throws(
    () =>
      authority.forgetSessionControlClientOrThrow(
        "session-1",
        "   ",
        { subject: "owner", tenantId: "default" },
        { headers: { "x-ptydeck-client-id": "client-owner" } }
    ),
    /Field 'clientId' must be a non-empty string/i
  );
});

test("runtime session-control authority accepts trimmed array client-id headers on successful operator paths", () => {
  const { authority } = createAuthorityHarness();
  const auth = { subject: "owner", tenantId: "default" };
  const request = {
    headers: {
      "x-ptydeck-client-id": [" client-owner ", "ignored-client"]
    }
  };

  const attached = authority.requireActiveSessionControlAttachment(auth, request);
  assert.equal(attached.clientId, "client-owner");

  const operatorAttached = authority.requireOperatorSessionControlAttachment(auth, request);
  assert.equal(operatorAttached.clientId, "client-owner");

  const requestClient = authority.requireSessionControlRequestClient("session-1", auth, request);
  assert.equal(requestClient.clientId, "client-owner");

  const operatorRequestClient = authority.requireOperatorSessionControlRequestClient("session-1", auth, request);
  assert.equal(operatorRequestClient.clientId, "client-owner");

  assert.equal(authority.resolveSessionControlClientId(request, "session-1", auth), "client-owner");
  assert.equal(authority.findAttachedClientForSession("session-1", " client-owner ", auth)?.clientId, "client-owner");
});

test("runtime session-control authority rejects inactive attached clients when active-only resolution is required", () => {
  const { authority } = createAuthorityHarness();

  assert.equal(
    authority.findAttachedClientForSession(
      "session-1",
      "client-offline",
      { subject: "owner", tenantId: "default" },
      { activeOnly: true }
    ),
    null
  );
});
