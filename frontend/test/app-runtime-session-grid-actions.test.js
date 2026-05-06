import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeSessionGridActions } from "../src/public/app-runtime-session-grid-actions.js";

function createHarness(options = {}) {
  const calls = [];
  const sessionById = new Map();
  const appLayoutDeckFacadeController = options.appLayoutDeckFacadeController || {};
  const appSessionRuntimeFacadeController = options.appSessionRuntimeFacadeController || {
    formatSessionToken(sessionId) {
      return sessionId === "s-1" ? "1" : sessionId === "s-2" ? "2" : "?";
    },
    formatSessionDisplayName(session) {
      return session?.name || session?.id || "";
    },
    applyRuntimeEvent(event) {
      calls.push(["runtime", event.type, event.session?.id || ""]);
      return true;
    },
    getSessionById(sessionId) {
      return sessionById.get(sessionId) || null;
    }
  };
  const appRuntimeStateController = options.appRuntimeStateController || {
    clearError() {
      calls.push(["clearError"]);
    }
  };
  const appCommandUiFacadeController = options.appCommandUiFacadeController || {
    getErrorMessage(error, fallback) {
      return error?.message || fallback;
    },
    setError(message) {
      calls.push(["error", message]);
    },
    setCommandFeedback(message) {
      calls.push(["feedback", message]);
    },
    render() {
      calls.push(["render"]);
    }
  };
  const trustedLocalHandoffRuntimeController = options.trustedLocalHandoffRuntimeController || {
    async takeControlScope() {
      return { updatedSessions: [] };
    }
  };
  const requestTextCalls = [];
  const confirmActionCalls = [];
  const actions = createAppRuntimeSessionGridActions({
    api: options.api || null,
    defaultDeckId: options.defaultDeckId || "default",
    getAppLayoutDeckFacadeController: () => appLayoutDeckFacadeController,
    getAppSessionRuntimeFacadeController: () => appSessionRuntimeFacadeController,
    getAppRuntimeStateController: () => appRuntimeStateController,
    getAppCommandUiFacadeController: () => appCommandUiFacadeController,
    getTrustedLocalHandoffRuntimeController: () => trustedLocalHandoffRuntimeController,
    requestText: async (runtimeOptions) => {
      requestTextCalls.push(runtimeOptions);
      return options.requestTextResult ?? "renamed";
    },
    confirmAction: async (runtimeOptions) => {
      confirmActionCalls.push(runtimeOptions);
      return options.confirmActionResult ?? true;
    },
    renameTrustedLocalDevice: options.renameTrustedLocalDevice || ((sessionId, label) => ({ sessionId, label }))
  });

  return {
    actions,
    calls,
    sessionById,
    requestTextCalls,
    confirmActionCalls
  };
}

test("app-runtime session-grid actions handle deck rename and delete success and failure deterministically", async () => {
  const calls = [];
  const renameSuccess = createHarness({
    appLayoutDeckFacadeController: {
      async renameDeckFlow() {
        calls.push("rename");
      }
    }
  });
  const deleteFailure = createHarness({
    appLayoutDeckFacadeController: {
      async deleteDeckFlow() {
        throw new Error("delete boom");
      }
    }
  });

  await renameSuccess.actions.onRenameDeck();
  await deleteFailure.actions.onDeleteDeck();

  assert.deepEqual(calls, ["rename"]);
  assert.deepEqual(renameSuccess.calls, [["clearError"]]);
  assert.deepEqual(deleteFailure.calls, [["error", "delete boom"]]);
});

test("app-runtime session-grid actions ignore invalid quick-id swap inputs", async () => {
  const swapCalls = [];
  const harness = createHarness({
    api: {
      async swapSessionQuickIds(leftId, rightId) {
        swapCalls.push([leftId, rightId]);
      }
    }
  });

  await harness.actions.onSwapDeckSessions({ id: "s-1" }, { id: "s-1" });
  await harness.actions.onSwapDeckSessions({ id: "" }, { id: "s-2" });
  await harness.actions.onSwapDeckSessions({ id: "s-1" }, null);

  assert.deepEqual(swapCalls, []);
  assert.deepEqual(harness.calls, []);
});

test("app-runtime session-grid actions swap quick ids and emit feedback through the session authority seam", async () => {
  const harness = createHarness({
    api: {
      async swapSessionQuickIds() {
        return {
          leftSession: { id: "s-1", name: "One" },
          rightSession: { id: "s-2", name: "Two" }
        };
      }
    }
  });

  await harness.actions.onSwapDeckSessions({ id: "s-1", name: "One" }, { id: "s-2", name: "Two" });

  assert.deepEqual(harness.calls, [
    ["runtime", "session.updated", "s-1"],
    ["runtime", "session.updated", "s-2"],
    ["feedback", "Swapped quick IDs: [1] One <-> [2] Two."],
    ["clearError"],
    ["render"]
  ]);
});

test("app-runtime session-grid actions fail closed on malformed swap results", async () => {
  const harness = createHarness({
    api: {
      async swapSessionQuickIds() {
        return { leftSession: { id: "s-1" } };
      }
    }
  });

  await harness.actions.onSwapDeckSessions({ id: "s-1", name: "One" }, { id: "s-2", name: "Two" });

  assert.deepEqual(harness.calls, [["error", "Failed to swap session quick IDs."]]);
});

test("app-runtime session-grid actions build deterministic rename and stale-device dialogs", async () => {
  const harness = createHarness();

  const renameResult = await harness.actions.requestSessionRename({ id: "s-1", name: "Ops" });
  const forgetResult = await harness.actions.confirmForgetSessionControlClient(
    { id: "s-1", name: "Ops" },
    { clientId: "client-stale", label: "Tablet" }
  );

  assert.equal(renameResult, "renamed");
  assert.equal(forgetResult, true);
  assert.deepEqual(harness.requestTextCalls, [
    {
      title: "Rename Session",
      message: "Enter a new name for [1] Ops.",
      inputLabel: "Session Name",
      defaultValue: "Ops",
      confirmLabel: "Rename"
    }
  ]);
  assert.deepEqual(harness.confirmActionCalls, [
    {
      title: "Forget Stale Device",
      message: "Forget Tablet from [1] Ops?",
      confirmLabel: "Forget"
    }
  ]);
});

test("app-runtime session-grid actions resolve trusted-local control updates through updated sessions or current authority state", async () => {
  const updatedHarness = createHarness({
    trustedLocalHandoffRuntimeController: {
      async takeControlScope(scope, runtimeOptions) {
        assert.equal(scope, "session");
        assert.deepEqual(runtimeOptions, { sessionId: "s-1" });
        return {
          updatedSessions: [
            { id: "s-2", name: "Other" },
            { id: "s-1", name: "Updated" }
          ]
        };
      }
    }
  });
  const fallbackHarness = createHarness({
    trustedLocalHandoffRuntimeController: {
      async takeControlScope() {
        return { updatedSessions: [] };
      }
    }
  });
  fallbackHarness.sessionById.set("s-1", { id: "s-1", name: "Fallback" });

  const updated = await updatedHarness.actions.takeTrustedLocalControl("session", { sessionId: "s-1" });
  const fallback = await fallbackHarness.actions.takeTrustedLocalControl("session", { sessionId: " s-1 " });

  assert.deepEqual(updated, { id: "s-1", name: "Updated" });
  assert.deepEqual(fallback, { id: "s-1", name: "Fallback" });
});
