import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSessionControlStateView,
  createLocalOperatorPrincipal,
  createSessionAttachedClient,
  createSessionControlPrincipal,
  normalizeSessionControlState,
  sessionControlPrincipalsMatch,
  setSessionControllerClient,
  updateSessionControlLastInput
} from "../src/session-control-state.js";

test("session control helpers normalize fallback owner and last-input metadata", () => {
  const state = normalizeSessionControlState(
    {
      owner: { subject: "", tenantId: "tenant-a", accessMode: "operator" },
      controllerClientId: " client-1 ",
      lastInput: {
        at: 123,
        clientId: "client-1",
        subject: "alice",
        tenantId: "tenant-a",
        accessMode: "operator",
        permissionMode: ""
      }
    },
    {
      fallbackOwner: { subject: "owner-a", tenantId: "tenant-a", accessMode: "operator" },
      nowFn: () => 999
    }
  );

  assert.deepEqual(state.owner, {
    subject: "owner-a",
    tenantId: "tenant-a",
    accessMode: "operator",
    permissionMode: ""
  });
  assert.equal(state.controllerClientId, "client-1");
  assert.equal(state.controllerChangedAt, 999);
  assert.equal(state.allowAutoAssign, true);
  assert.deepEqual(state.lastInput, {
    at: 123,
    clientId: "client-1",
    subject: "alice",
    tenantId: "tenant-a",
    accessMode: "operator",
    permissionMode: ""
  });
});

test("session control view decorates attached clients with deterministic roles", () => {
  const view = buildSessionControlStateView(
    {
      owner: { subject: "owner", tenantId: "tenant-a", accessMode: "operator", permissionMode: "" },
      controllerClientId: "client-2",
      controllerChangedAt: 500,
      lastInput: null
    },
    [
      createSessionAttachedClient({
        clientId: "client-2",
        connectedAt: 200,
        principal: { subject: "owner", tenantId: "tenant-a", accessMode: "operator", permissionMode: "" }
      }),
      createSessionAttachedClient({
        clientId: "client-1",
        connectedAt: 100,
        principal: { subject: "owner", tenantId: "tenant-a", accessMode: "operator", permissionMode: "" }
      }),
      createSessionAttachedClient({
        clientId: "client-3",
        connectedAt: 300,
        principal: { subject: "viewer", tenantId: "tenant-a", accessMode: "operator", permissionMode: "" }
      })
    ]
  );

  assert.equal(view.currentController?.clientId, "client-2");
  assert.deepEqual(
    view.attachedClients.map((entry) => [entry.clientId, entry.role]),
    [
      ["client-1", "owner"],
      ["client-2", "controller"],
      ["client-3", "spectator"]
    ]
  );
});

test("session control helpers derive principals and input metadata from auth", () => {
  const principal = createSessionControlPrincipal({
    subject: "alice",
    tenantId: "tenant-a",
    accessMode: "operator",
    permissionMode: ""
  });
  assert.equal(
    sessionControlPrincipalsMatch(principal, {
      subject: "alice",
      tenantId: "tenant-a",
      accessMode: "operator",
      permissionMode: ""
    }),
    true
  );

  const updated = updateSessionControlLastInput(
    {
      owner: createLocalOperatorPrincipal(),
      controllerClientId: null,
      controllerChangedAt: null,
      lastInput: null
    },
    {
      clientId: "client-9",
      principal
    },
    { nowFn: () => 789 }
  );
  assert.deepEqual(updated.lastInput, {
    at: 789,
    clientId: "client-9",
    subject: "alice",
    tenantId: "tenant-a",
    accessMode: "operator",
    permissionMode: ""
  });

  const reassigned = setSessionControllerClient(updated, "client-9", { nowFn: () => 790 });
  assert.equal(reassigned.controllerClientId, "client-9");
  assert.equal(reassigned.controllerChangedAt, 790);

  const released = setSessionControllerClient(reassigned, null, { allowAutoAssign: false });
  assert.equal(released.controllerClientId, null);
  assert.equal(released.controllerChangedAt, null);
  assert.equal(released.allowAutoAssign, false);
});
