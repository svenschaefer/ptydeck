import test from "node:test";
import assert from "node:assert/strict";

import {
  createSessionControlAttachmentRegistry,
  normalizeSessionControlClientLabel
} from "../src/runtime-session-control-attachments.js";

test("runtime session-control attachment registry registers, unregisters, and prunes stale clients deterministically", () => {
  let nowValue = 100;
  let scheduled = null;
  let prunedCount = 0;
  const registry = createSessionControlAttachmentRegistry({
    staleClientTtlMs: 1000,
    now: () => nowValue,
    scheduleTimeout(callback, delay) {
      scheduled = { callback, delay };
      return scheduled;
    },
    clearScheduledTimeout(handle) {
      if (scheduled === handle) {
        scheduled = null;
      }
    },
    onPruned() {
      prunedCount += 1;
    }
  });
  const auth = {
    subject: "alice",
    tenantId: "tenant-a",
    accessMode: "operator",
    permissionMode: ""
  };

  const client = registry.registerAttachment({
    auth,
    clientId: "client-1",
    label: " Laptop "
  });
  assert.equal(client.label, "Laptop");
  assert.equal(registry.findActiveAttachment(auth, "client-1")?.clientId, "client-1");
  assert.equal(scheduled, null);

  const attachmentKey = registry.getAttachmentKey({ auth, clientId: "client-1" });
  registry.unregisterAttachment({ sessionControlAttachmentKey: attachmentKey });
  assert.equal(registry.findActiveAttachment(auth, "client-1"), null);
  assert.equal(scheduled?.delay, 1000);
  assert.equal(registry.getNextPruneDelay(nowValue), 1000);

  nowValue = 1100;
  scheduled.callback();
  assert.equal(prunedCount, 1);
  assert.equal(registry.listEntries().length, 0);
});

test("runtime session-control attachment registry validates label updates and forgets detached clients", () => {
  const registry = createSessionControlAttachmentRegistry({
    staleClientTtlMs: 1000
  });
  const auth = {
    subject: "bob",
    tenantId: "tenant-b",
    accessMode: "operator",
    permissionMode: ""
  };

  registry.registerAttachment({
    auth,
    clientId: "client-2",
    label: "Desktop"
  });
  const renamed = registry.updateAttachmentLabel(auth, "client-2", " Workstation ");
  assert.equal(renamed.label, "Workstation");
  assert.throws(
    () => registry.updateAttachmentLabel(auth, "client-2", "   "),
    /must be a non-empty string/
  );

  assert.equal(normalizeSessionControlClientLabel("  tablet  ", 32), "tablet");
  assert.equal(registry.forgetAttachment(auth, "client-2"), true);
  assert.equal(registry.forgetAttachment(auth, "client-2"), false);
});
