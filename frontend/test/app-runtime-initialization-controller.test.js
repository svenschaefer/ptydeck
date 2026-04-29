import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeInitializationController } from "../src/public/app-runtime-initialization-controller.js";

test("app-runtime initialization controller surfaces startup-backup failures before trusted-local identity bootstrap", async () => {
  let ensuredIdentityCount = 0;
  const appliedErrors = [];
  const controller = createAppRuntimeInitializationController({
    async ensureStartupBackup() {
      throw new Error("Startup backup unavailable.");
    },
    async ensureTrustedLocalClientIdentity() {
      ensuredIdentityCount += 1;
      return {
        clientId: "client-local",
        label: "Laptop"
      };
    },
    applyInitializationError(message) {
      appliedErrors.push(message);
    }
  });

  await assert.rejects(controller.initialize(), /Startup backup unavailable\./);
  assert.equal(ensuredIdentityCount, 0);
  assert.equal(controller.getInitializationErrorMessage(), "Startup backup unavailable.");
  assert.deepEqual(appliedErrors, ["Startup backup unavailable."]);
});

test("app-runtime initialization controller redirects before trusted-local bootstrap", async () => {
  const calls = [];
  const controller = createAppRuntimeInitializationController({
    maybeRedirectToCanonicalOrigin() {
      calls.push("redirect");
      return true;
    },
    consumeOriginHandoffSourceFromWindow() {
      calls.push("consume");
    },
    async ensureStartupBackup() {
      calls.push("backup");
    },
    async ensureTrustedLocalClientIdentity() {
      calls.push("identity");
      return null;
    }
  });

  const result = await controller.initialize();

  assert.deepEqual(result, { redirected: true });
  assert.deepEqual(calls, ["redirect"]);
});

test("app-runtime initialization controller bootstraps trusted-local identity and runtime in order", async () => {
  const calls = [];
  const controller = createAppRuntimeInitializationController({
    maybeRedirectToCanonicalOrigin() {
      calls.push("redirect");
      return false;
    },
    consumeOriginHandoffSourceFromWindow() {
      calls.push("consume");
    },
    async ensureStartupBackup() {
      calls.push("backup");
    },
    getTrustedLocalClientIdentity() {
      calls.push("get");
      return null;
    },
    async ensureTrustedLocalClientIdentity() {
      calls.push("ensure");
      return {
        clientId: "client-local",
        label: "Laptop"
      };
    },
    setRuntimeClientIdentityCreatedOnThisOrigin(value) {
      calls.push(["created", value]);
    },
    setTrustedLocalClientLabel(label) {
      calls.push(["label", label]);
    },
    setRuntimeClientId(clientId) {
      calls.push(["clientId", clientId]);
    },
    async bootstrapUiAndRuntime() {
      calls.push("bootstrap");
      return { bootstrapped: true };
    }
  });

  const result = await controller.initialize();

  assert.deepEqual(result, { bootstrapped: true });
  assert.deepEqual(calls, [
    "redirect",
    "consume",
    "backup",
    "get",
    "ensure",
    ["created", true],
    ["label", "Laptop"],
    ["clientId", "client-local"],
    "bootstrap"
  ]);
});

test("app-runtime initialization controller preserves the created-on-origin flag only for newly created identities", async () => {
  const createdFlags = [];
  const labels = [];
  const clientIds = [];
  const controller = createAppRuntimeInitializationController({
    getTrustedLocalClientIdentity() {
      return {
        clientId: "client-existing",
        label: "Desktop"
      };
    },
    async ensureTrustedLocalClientIdentity() {
      return {
        clientId: "client-existing",
        label: "Desktop"
      };
    },
    setRuntimeClientIdentityCreatedOnThisOrigin(value) {
      createdFlags.push(value);
    },
    setTrustedLocalClientLabel(label) {
      labels.push(label);
    },
    setRuntimeClientId(clientId) {
      clientIds.push(clientId);
    },
    async bootstrapUiAndRuntime() {
      return { ready: true };
    }
  });

  const result = await controller.initialize();

  assert.deepEqual(result, { ready: true });
  assert.deepEqual(createdFlags, [false]);
  assert.deepEqual(labels, ["Desktop"]);
  assert.deepEqual(clientIds, ["client-existing"]);
});

test("app-runtime initialization controller preserves a specific initialization error over the generic fallback", () => {
  const appliedErrors = [];
  const controller = createAppRuntimeInitializationController({
    applyInitializationError(message) {
      appliedErrors.push(message);
    }
  });

  controller.setInitializationError("Specific runtime failure.");
  controller.setInitializationError("");

  assert.equal(controller.getInitializationErrorMessage(), "Specific runtime failure.");
  assert.deepEqual(appliedErrors, ["Specific runtime failure."]);
});

test("app-runtime initialization controller falls back to the generic initialization error when no specific message exists", () => {
  const appliedErrors = [];
  const controller = createAppRuntimeInitializationController({
    applyInitializationError(message) {
      appliedErrors.push(message);
    }
  });

  controller.setInitializationError("");

  assert.equal(controller.getInitializationErrorMessage(), "Failed to initialize application runtime.");
  assert.deepEqual(appliedErrors, ["Failed to initialize application runtime."]);
});

test("app-runtime initialization controller does not overwrite an existing specific message when a later blank error bubbles out", async () => {
  const appliedErrors = [];
  const controller = createAppRuntimeInitializationController({
    async ensureStartupBackup() {
      throw new Error(" ");
    },
    applyInitializationError(message) {
      appliedErrors.push(message);
    }
  });

  controller.setInitializationError("Specific runtime failure.");

  await assert.rejects(controller.initialize(), / /);
  assert.equal(controller.getInitializationErrorMessage(), "Specific runtime failure.");
  assert.deepEqual(appliedErrors, ["Specific runtime failure."]);
});
