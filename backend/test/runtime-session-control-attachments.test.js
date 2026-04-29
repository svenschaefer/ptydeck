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
  assert.equal(registry.updateAttachmentLabel(auth, "   ", "Renamed"), null);
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

test("runtime session-control attachment registry handles reconnect reuse and invalid attachment inputs deterministically", () => {
  let nowValue = 200;
  const registry = createSessionControlAttachmentRegistry({
    staleClientTtlMs: 1000,
    now: () => nowValue
  });
  const auth = {
    subject: "carol",
    tenantId: "tenant-c",
    accessMode: "operator",
    permissionMode: ""
  };

  assert.equal(normalizeSessionControlClientLabel(null, 16), "");
  assert.equal(normalizeSessionControlClientLabel(" 0123456789abcdef ", 8), "01234567");
  assert.equal(registry.getAttachmentKey({ auth, clientId: "   " }), "");
  assert.equal(registry.registerAttachment({ auth, clientId: "   ", label: "ignored" }), null);
  assert.equal(registry.updateAttachmentLabel(auth, "missing", "Renamed"), null);
  assert.equal(registry.forgetAttachment(auth, "   "), false);
  assert.equal(registry.findActiveAttachment(auth, "   "), null);

  const first = registry.registerAttachment({
    auth,
    clientId: "client-3",
    label: " Desk "
  });
  const firstConnectedAt = first.connectedAt;
  assert.equal(registry.pruneStaleAttachments(nowValue), false);
  const attachmentKey = registry.getAttachmentKey({ auth, clientId: "client-3" });

  registry.unregisterAttachment({ sessionControlAttachmentKey: attachmentKey });
  nowValue = 240;
  const reattached = registry.registerAttachment({
    auth,
    clientId: "client-3",
    label: "   "
  });

  assert.equal(reattached.label, "Desk");
  assert.equal(reattached.connectedAt, firstConnectedAt);
  assert.equal(reattached.activeConnectionCount, 1);
  assert.equal(reattached.lastDisconnectedAt, null);
  assert.equal(registry.findActiveAttachment(auth, "client-3")?.label, "Desk");

  registry.unregisterAttachment({});
  registry.unregisterAttachment({ sessionControlAttachmentKey: "missing" });
});

test("runtime session-control attachment registry clears and suppresses prune timers when runtimes stop", () => {
  let nowValue = 500;
  let scheduled = null;
  let clearCalls = 0;
  let stopping = false;
  let stopped = false;
  let prunedCount = 0;
  const registry = createSessionControlAttachmentRegistry({
    staleClientTtlMs: 1000,
    now: () => nowValue,
    isStopping: () => stopping,
    isStopped: () => stopped,
    scheduleTimeout(callback, delay) {
      scheduled = { callback, delay };
      return scheduled;
    },
    clearScheduledTimeout(handle) {
      if (scheduled === handle) {
        clearCalls += 1;
        scheduled = null;
      }
    },
    onPruned() {
      prunedCount += 1;
    }
  });
  const auth = {
    subject: "dana",
    tenantId: "tenant-d",
    accessMode: "operator",
    permissionMode: ""
  };

  registry.registerAttachment({
    auth,
    clientId: "client-4",
    label: "Tablet"
  });
  const attachmentKey = registry.getAttachmentKey({ auth, clientId: "client-4" });
  registry.unregisterAttachment({ sessionControlAttachmentKey: attachmentKey });
  assert.equal(scheduled?.delay, 1000);

  nowValue = 650;
  registry.schedulePrune();
  assert.equal(clearCalls, 1);
  assert.equal(scheduled?.delay, 850);

  const detachedEntry = registry.listEntries()[0];
  detachedEntry.client.activeConnectionCount = 0;
  detachedEntry.client.lastDisconnectedAt = null;
  scheduled.callback();
  assert.equal(prunedCount, 1);
  assert.equal(registry.listEntries().length, 0);
  scheduled = null;

  stopping = true;
  registry.registerAttachment({
    auth,
    clientId: "client-5",
    label: "Phone"
  });
  registry.unregisterAttachment({ sessionControlAttachmentKey: registry.getAttachmentKey({ auth, clientId: "client-5" }) });
  assert.equal(scheduled, null);

  stopping = false;
  stopped = true;
  registry.registerAttachment({
    auth,
    clientId: "client-6",
    label: "Dock"
  });
  registry.unregisterAttachment({ sessionControlAttachmentKey: registry.getAttachmentKey({ auth, clientId: "client-6" }) });
  assert.equal(scheduled, null);

  registry.clearPruneTimer();
});
