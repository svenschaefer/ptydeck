import test from "node:test";
import assert from "node:assert/strict";

import {
  ORIGIN_HANDOFF_QUERY_PARAM,
  buildCanonicalOriginRedirectUrl,
  canForgetSessionControlClient,
  canReleaseSessionControl,
  canTakeSessionControl,
  canTransferSessionControl,
  canUseImplicitOwnerFallback,
  canWriteToSession,
  clearOriginHandoffSearchParam,
  getSessionControlBadgeState,
  getSessionControlSummary,
  getSessionWriteBlockMessage,
  listOriginHandoffRepairableSessions,
  readOriginHandoffSourceOrigin
} from "../src/public/session-control-runtime-state.js";

function createContext(overrides = {}) {
  return {
    runtimeClientId: "client-local",
    trustedLocalClientLabel: "Laptop",
    isReadOnlyMode: () => false,
    getReadOnlyModeMessage: () => "Read-only spectator mode. Write actions are disabled.",
    runtimeClientIdentityCreatedOnThisOrigin: true,
    originHandoffSourceOrigin: "http://172.26.86.97:18081",
    ...overrides
  };
}

function createReconnectReservedSession(overrides = {}) {
  return {
    id: "s-1",
    controlState: {
      owner: {
        subject: "user-1",
        tenantId: "tenant-1",
        accessMode: "operator",
        permissionMode: "write"
      },
      currentController: {
        clientId: "client-remote",
        label: "Desktop",
        active: false,
        subject: "user-1",
        tenantId: "tenant-1"
      },
      attachedClients: [
        {
          clientId: "client-local",
          label: "Laptop",
          active: true,
          activeConnectionCount: 1,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-1",
          tenantId: "tenant-1"
        },
        {
          clientId: "client-remote",
          label: "Desktop",
          active: false,
          activeConnectionCount: 0,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-1",
          tenantId: "tenant-1"
        }
      ]
    },
    ...overrides
  };
}

test("session control helpers preserve canonical-origin handoff markers and clear them deterministically", () => {
  const replaceCalls = [];
  const windowRef = {
    location: {
      pathname: "/ui",
      search: "?debug=1&ptydeck_origin_handoff=http%3A%2F%2Fold.example",
      hash: "#deck",
      origin: "http://172.26.86.97:18081"
    },
    history: {
      state: { ok: true },
      replaceState(state, _, url) {
        replaceCalls.push([state, url]);
      }
    }
  };

  const redirected = buildCanonicalOriginRedirectUrl(
    windowRef,
    "https://ptydeck.local.secos.rocks",
    "http://172.26.86.97:18081",
    ORIGIN_HANDOFF_QUERY_PARAM
  );
  assert.equal(
    redirected,
    "https://ptydeck.local.secos.rocks/ui?debug=1&ptydeck_origin_handoff=http%3A%2F%2F172.26.86.97%3A18081#deck"
  );
  assert.equal(readOriginHandoffSourceOrigin(windowRef, ORIGIN_HANDOFF_QUERY_PARAM), "http://old.example");
  assert.equal(clearOriginHandoffSearchParam(windowRef, ORIGIN_HANDOFF_QUERY_PARAM), true);
  assert.deepEqual(replaceCalls, [[{ ok: true }, "/ui?debug=1#deck"]]);
});

test("session control helpers classify reconnect-reserved sessions for write blocking, summaries, badges, and reclaim", () => {
  const session = createReconnectReservedSession();
  const context = createContext();

  assert.equal(canUseImplicitOwnerFallback(session, context), false);
  assert.equal(canWriteToSession(session, context), false);
  assert.equal(canTakeSessionControl(session, context), true);
  assert.equal(
    getSessionWriteBlockMessage(session, context),
    "Control is reserved for reconnecting device Desktop. Take control to reclaim it or wait for reconnect."
  );
  assert.equal(
    getSessionControlSummary(session, context),
    "Control is reserved for reconnecting device Desktop. Laptop can reclaim it."
  );
  assert.deepEqual(getSessionControlBadgeState(session, context), {
    label: "RECLAIM",
    tone: "owner",
    title: "Another device is reconnecting. This browser client can reclaim control."
  });
});

test("session control helpers classify implicit-owner fallback and read-only spectator states explicitly", () => {
  const fallbackSession = {
    id: "s-2",
    controlState: {
      currentController: null,
      attachedClients: []
    }
  };
  const spectatorContext = createContext({
    isReadOnlyMode: () => true,
    runtimeClientIdentityCreatedOnThisOrigin: false,
    originHandoffSourceOrigin: ""
  });

  assert.equal(canUseImplicitOwnerFallback(fallbackSession, createContext()), true);
  assert.equal(canWriteToSession(fallbackSession, createContext()), true);
  assert.equal(
    getSessionControlSummary(fallbackSession, createContext()),
    "Local operator write access is active until a session control client attaches."
  );
  assert.deepEqual(getSessionControlBadgeState(fallbackSession, createContext()), {
    label: "LOCAL",
    tone: "owner",
    title: "Local operator write access is active until a session control client attaches."
  });
  assert.equal(canWriteToSession(fallbackSession, spectatorContext), false);
  assert.equal(
    getSessionWriteBlockMessage(fallbackSession, spectatorContext),
    "Read-only spectator mode. Write actions are disabled."
  );
});

test("session control helpers identify repairable origin-handoff sessions and stale-device actions only when ownership is safe", () => {
  const session = createReconnectReservedSession();
  const sessions = [
    session,
    createReconnectReservedSession({
      id: "s-2",
      controlState: {
        ...createReconnectReservedSession().controlState,
        currentController: {
          clientId: "client-remote-2",
          label: "Remote Two",
          active: true,
          subject: "user-1",
          tenantId: "tenant-1"
        }
      }
    })
  ];
  const context = createContext();

  assert.deepEqual(
    listOriginHandoffRepairableSessions(sessions, context).map((entry) => entry.id),
    ["s-1"]
  );
  assert.equal(canReleaseSessionControl(session, context), true);
  assert.equal(canTransferSessionControl(session, "client-remote", context), false);
  assert.equal(canTransferSessionControl(session, "client-local", context), true);
  assert.equal(canForgetSessionControlClient(session, "client-remote", context), true);
  assert.equal(canForgetSessionControlClient(session, "client-local", context), false);
});
