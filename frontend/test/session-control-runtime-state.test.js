import test from "node:test";
import assert from "node:assert/strict";

import {
  ORIGIN_HANDOFF_QUERY_PARAM,
  buildCanonicalOriginRedirectUrl,
  canForgetSessionControlClient,
  canManageTrustedLocalDevice,
  canReleaseSessionControl,
  canTakeSessionControl,
  canTransferSessionControl,
  canUseImplicitOwnerFallback,
  canWriteToSession,
  clearOriginHandoffSearchParam,
  getLocalDeviceLabel,
  getWindowOrigin,
  isOriginHandoffRepairableSession,
  getSessionControlBadgeState,
  getSessionControlSummary,
  getTakeOrReclaimControlLabel,
  getSessionWriteBlockMessage,
  listOriginHandoffRepairableSessions,
  normalizeOriginValue,
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

test("session control helpers normalize origin/window state and handle missing browser history safely", () => {
  assert.equal(normalizeOriginValue(" https://ptydeck.local.secos.rocks/ui "), "https://ptydeck.local.secos.rocks");
  assert.equal(normalizeOriginValue("not a url"), "");
  assert.equal(
    getWindowOrigin({
      location: {
        protocol: "http:",
        host: "172.26.86.97:18081"
      }
    }),
    "http://172.26.86.97:18081"
  );
  assert.equal(getWindowOrigin({ location: { protocol: "http:" } }), "");
  assert.equal(getLocalDeviceLabel(null, createContext({ trustedLocalClientLabel: "" })), "this device");
  assert.equal(
    getLocalDeviceLabel(
      {
        controlState: {
          attachedClients: [
            {
              clientId: "client-local",
              label: "Older Attached Label",
              active: true
            }
          ]
        }
      },
      createContext({ trustedLocalClientLabel: "Desk" })
    ),
    "Desk"
  );
  assert.equal(
    clearOriginHandoffSearchParam(
      {
        location: { search: `?${ORIGIN_HANDOFF_QUERY_PARAM}=http%3A%2F%2Fold.example` },
        history: {}
      },
      ORIGIN_HANDOFF_QUERY_PARAM
    ),
    false
  );
  assert.equal(
    clearOriginHandoffSearchParam(
      {
        location: { search: "?debug=1" },
        history: { replaceState() {} }
      },
      ORIGIN_HANDOFF_QUERY_PARAM
    ),
    false
  );
});

test("session control helpers surface waiting, unattached-controller, local-controller, and spectator-remote variants", () => {
  const waitingSession = {
    id: "waiting",
    controlState: {
      currentController: null,
      attachedClients: [
        {
          clientId: "client-remote",
          label: "Desktop",
          active: true,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-1",
          tenantId: "tenant-1"
        }
      ]
    }
  };
  const unattachedControllerSession = {
    id: "free",
    controlState: {
      currentController: null,
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
        }
      ]
    }
  };
  const localControllerSession = {
    id: "local",
    controlState: {
      currentController: {
        clientId: "client-local",
        label: "Laptop",
        active: true
      },
      attachedClients: [
        {
          clientId: "client-local",
          label: "Laptop",
          active: true,
          activeConnectionCount: 2,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-1",
          tenantId: "tenant-1"
        }
      ]
    }
  };
  const spectatorRemoteSession = {
    id: "spectator",
    controlState: {
      currentController: {
        clientId: "client-remote",
        label: "Desktop",
        active: true
      },
      attachedClients: [
        {
          clientId: "client-local",
          label: "Laptop",
          active: true,
          activeConnectionCount: 1,
          accessMode: "spectator",
          permissionMode: "read",
          subject: "user-1",
          tenantId: "tenant-1"
        },
        {
          clientId: "client-remote",
          label: "Desktop",
          active: true,
          activeConnectionCount: 1,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-2",
          tenantId: "tenant-2"
        }
      ]
    }
  };
  const context = createContext();

  assert.equal(
    getSessionWriteBlockMessage(waitingSession, context),
    "Waiting for Laptop to attach to session control."
  );
  assert.equal(
    getSessionWriteBlockMessage(unattachedControllerSession, context),
    "No client currently holds control for this session. Take control before sending input or resizing."
  );
  assert.equal(
    getSessionControlSummary(unattachedControllerSession, context),
    "No active controller. Laptop can take control."
  );
  assert.equal(getSessionWriteBlockMessage(localControllerSession, context), "");
  assert.equal(
    getSessionControlSummary(localControllerSession, context),
    "Laptop controls this session. 2 tabs are attached for this device."
  );
  assert.deepEqual(getSessionControlBadgeState(localControllerSession, context), {
    label: "CONTROLLER",
    tone: "controller",
    title: "This browser client currently controls terminal input and resize for this session."
  });
  assert.equal(
    getSessionWriteBlockMessage(spectatorRemoteSession, context),
    "This session is currently controlled by another client. Input and resize are disabled."
  );
  assert.equal(
    getSessionControlSummary(spectatorRemoteSession, context),
    "Device Desktop controls this session. Observe-only on this device."
  );
  assert.deepEqual(getSessionControlBadgeState(spectatorRemoteSession, context), {
    label: "READ ONLY",
    tone: "spectator",
    title: "This browser client is attached in read-only spectator mode."
  });
});

test("session control helpers gate transfer, release, take, and origin-handoff repair on ownership and attachment state", () => {
  const inactiveLocalSession = {
    id: "inactive",
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
        active: true,
        subject: "user-1",
        tenantId: "tenant-1"
      },
      attachedClients: [
        {
          clientId: "client-local",
          label: "Laptop",
          active: false,
          activeConnectionCount: 0,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-1",
          tenantId: "tenant-1"
        }
      ]
    }
  };
  const ownerContext = createContext();
  const foreignOwnerSession = {
    id: "foreign-owner",
    controlState: {
      owner: {
        subject: "user-2",
        tenantId: "tenant-2",
        accessMode: "operator",
        permissionMode: "write"
      },
      currentController: {
        clientId: "client-remote",
        label: "Desktop",
        active: true,
        subject: "user-2",
        tenantId: "tenant-2"
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
          active: true,
          activeConnectionCount: 1,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-2",
          tenantId: "tenant-2"
        }
      ]
    }
  };

  assert.equal(canTakeSessionControl(inactiveLocalSession, ownerContext), false);
  assert.equal(canReleaseSessionControl(inactiveLocalSession, ownerContext), false);
  assert.equal(canTransferSessionControl(inactiveLocalSession, "client-remote", ownerContext), false);

  assert.equal(canReleaseSessionControl(foreignOwnerSession, ownerContext), false);
  assert.equal(canTransferSessionControl(foreignOwnerSession, "client-remote", ownerContext), false);
  assert.equal(
    isOriginHandoffRepairableSession(
      createReconnectReservedSession({
        controlState: {
          ...createReconnectReservedSession().controlState,
          currentController: {
            clientId: "client-local",
            label: "Laptop",
            active: false,
            subject: "user-1",
            tenantId: "tenant-1"
          }
        }
      }),
      ownerContext
    ),
    false
  );
  assert.equal(
    isOriginHandoffRepairableSession(createReconnectReservedSession(), createContext({ runtimeClientIdentityCreatedOnThisOrigin: false })),
    false
  );
  assert.equal(
    isOriginHandoffRepairableSession(
      createReconnectReservedSession({
        controlState: {
          ...createReconnectReservedSession().controlState,
          owner: {
            subject: "user-2",
            tenantId: "tenant-2",
            accessMode: "operator",
            permissionMode: "write"
          }
        }
      }),
      ownerContext
    ),
    false
  );
});

test("session control helpers expose null, attaching, attached, and remote-operator variants deterministically", () => {
  const attachingContext = createContext({
    runtimeClientId: "",
    trustedLocalClientLabel: "Desk"
  });
  const attachedSession = {
    id: "attached",
    controlState: {
      currentController: null,
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
        }
      ]
    }
  };
  const remoteOperatorSession = {
    id: "remote-operator",
    controlState: {
      currentController: {
        clientId: "client-remote",
        label: "Desktop",
        active: true,
        subject: "user-2",
        tenantId: "tenant-2"
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
          active: true,
          activeConnectionCount: 1,
          accessMode: "operator",
          permissionMode: "write",
          subject: "user-2",
          tenantId: "tenant-2"
        }
      ]
    }
  };

  assert.equal(getSessionWriteBlockMessage(null, createContext()), "No active session selected.");
  assert.equal(getSessionControlSummary(null, createContext()), "Control unavailable.");
  assert.deepEqual(getSessionControlBadgeState(null, createContext()), {
    label: "",
    tone: "",
    title: ""
  });
  assert.equal(normalizeOriginValue(""), "");

  assert.equal(
    getSessionControlSummary(remoteOperatorSession, attachingContext),
    "Waiting for Desk to attach."
  );
  assert.deepEqual(getSessionControlBadgeState(remoteOperatorSession, attachingContext), {
    label: "ATTACHING",
    tone: "pending",
    title: "Waiting for Desk to attach to session control metadata."
  });

  assert.equal(
    getSessionControlSummary(attachedSession, createContext()),
    "No active controller. Laptop can take control."
  );
  assert.equal(getTakeOrReclaimControlLabel(attachedSession, createContext()), "Take Control");
  assert.deepEqual(getSessionControlBadgeState(attachedSession, createContext()), {
    label: "ATTACHED",
    tone: "owner",
    title: "Laptop is attached and can take control."
  });

  assert.equal(
    getSessionWriteBlockMessage(remoteOperatorSession, createContext()),
    "Device Desktop currently controls this session. Take control to override or wait for release."
  );
  assert.equal(
    getSessionControlSummary(remoteOperatorSession, createContext()),
    "Device Desktop controls this session. Laptop can take control."
  );
  assert.deepEqual(getSessionControlBadgeState(remoteOperatorSession, createContext()), {
    label: "ATTACHED",
    tone: "owner",
    title: "Laptop is attached and can take or transfer control."
  });
});

test("session control helpers fail closed for spectator reconnect-reserved and management guardrail branches", () => {
  const spectatorReservedSession = createReconnectReservedSession({
    controlState: {
      ...createReconnectReservedSession().controlState,
      attachedClients: [
        {
          clientId: "client-local",
          label: "Laptop",
          active: true,
          activeConnectionCount: 1,
          accessMode: "spectator",
          permissionMode: "read",
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
    }
  });
  const context = createContext();
  const readOnlyContext = createContext({ isReadOnlyMode: () => true });

  assert.equal(
    getSessionWriteBlockMessage(spectatorReservedSession, context),
    "Control is reserved for reconnecting device Desktop. Input and resize are disabled on this device."
  );
  assert.equal(
    getSessionControlSummary(spectatorReservedSession, context),
    "Control is reserved for reconnecting device Desktop."
  );
  assert.equal(canTakeSessionControl(spectatorReservedSession, context), false);
  assert.equal(canTakeSessionControl(spectatorReservedSession, readOnlyContext), false);
  assert.equal(canReleaseSessionControl(spectatorReservedSession, context), false);
  assert.equal(canReleaseSessionControl(spectatorReservedSession, createContext({ runtimeClientId: "" })), false);
  assert.equal(canTransferSessionControl(spectatorReservedSession, "", context), false);
  assert.equal(canTransferSessionControl(spectatorReservedSession, "client-remote", readOnlyContext), false);
  assert.equal(canManageTrustedLocalDevice(spectatorReservedSession, context), false);
  assert.equal(canManageTrustedLocalDevice(spectatorReservedSession, createContext({ runtimeClientId: "" })), false);
  assert.equal(canForgetSessionControlClient(spectatorReservedSession, "client-remote", context), false);
  assert.equal(canForgetSessionControlClient(createReconnectReservedSession(), "missing", context), false);
});
