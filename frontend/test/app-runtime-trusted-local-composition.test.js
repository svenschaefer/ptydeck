import test from "node:test";
import assert from "node:assert/strict";

import {
  createAppRuntimeTrustedLocalComposition,
  resolveTrustedLocalLayoutTargetDeckId
} from "../src/public/app-runtime-trusted-local-composition.js";

test("resolveTrustedLocalLayoutTargetDeckId prefers explicit deck, then session deck, then active deck", () => {
  const getSessionById = (sessionId) => (sessionId === "s-1" ? { id: "s-1", deckId: "ops" } : null);
  const resolveSessionDeckId = (session) => session?.deckId || "";

  assert.equal(
    resolveTrustedLocalLayoutTargetDeckId({
      runtimeOptions: { deckId: " infra ", sessionId: "s-1" },
      getSessionById,
      resolveSessionDeckId,
      getActiveDeckId: () => "default"
    }),
    "infra"
  );

  assert.equal(
    resolveTrustedLocalLayoutTargetDeckId({
      runtimeOptions: { sessionId: "s-1" },
      getSessionById,
      resolveSessionDeckId,
      getActiveDeckId: () => "default"
    }),
    "ops"
  );

  assert.equal(
    resolveTrustedLocalLayoutTargetDeckId({
      runtimeOptions: { sessionId: "missing" },
      getSessionById,
      resolveSessionDeckId,
      getActiveDeckId: () => "default"
    }),
    "default"
  );
});

test("createAppRuntimeTrustedLocalComposition wires trusted-local layout replay through the extracted seam", async () => {
  const layoutCalls = [];
  const handoffArgs = [];
  let bindCalls = 0;

  createAppRuntimeTrustedLocalComposition({
    localStorageRef: {},
    createTrustedLocalLayoutRuntimeController: (args) => ({
      args,
      async applyLayoutForClient(clientId, options) {
        layoutCalls.push([clientId, options]);
        return { applied: true, captured: false };
      }
    }),
    createTrustedLocalHandoffRuntimeController: (args) => {
      handoffArgs.push(args);
      return {
        bindUiEvents() {
          bindCalls += 1;
        }
      };
    },
    getRuntimeClientId: () => "client-local",
    getSessionById: (sessionId) => (sessionId === "s-1" ? { id: "s-1", deckId: "ops" } : null),
    resolveSessionDeckId: (session) => session?.deckId || "",
    getActiveDeckId: () => "default"
  });

  assert.equal(bindCalls, 1);
  assert.equal(handoffArgs.length, 1);

  const layoutResult = await handoffArgs[0].applyDeviceLocalLayout("session", { sessionId: "s-1" });
  assert.deepEqual(layoutResult, { applied: true, captured: false });
  assert.deepEqual(layoutCalls, [["client-local", { scope: "session", targetDeckId: "ops" }]]);
});

test("createAppRuntimeTrustedLocalComposition falls back deterministically when no layout controller apply hook exists", async () => {
  let handoffArgs = null;

  createAppRuntimeTrustedLocalComposition({
    createTrustedLocalLayoutRuntimeController: () => ({}),
    createTrustedLocalHandoffRuntimeController: (args) => {
      handoffArgs = args;
      return {
        bindUiEvents() {}
      };
    },
    getRuntimeClientId: () => "client-local",
    getActiveDeckId: () => "default"
  });

  const layoutResult = await handoffArgs.applyDeviceLocalLayout("all", {});
  assert.deepEqual(layoutResult, { applied: false, captured: false });
});
