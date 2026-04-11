import test from "node:test";
import assert from "node:assert/strict";

import { createReplayViewerRuntimeController } from "../src/public/replay-viewer-runtime-controller.js";

function createElement() {
  const listeners = new Map();
  return {
    textContent: "",
    disabled: false,
    open: false,
    listeners,
    classList: {
      add() {},
      remove() {}
    },
    addEventListener(type, handler) {
      listeners.set(String(type), handler);
    },
    click() {
      const handler = listeners.get("click");
      if (handler) {
        handler({ type: "click" });
      }
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    emit(type, event = {}) {
      const handler = listeners.get(String(type));
      if (handler) {
        handler(event);
      }
    }
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("replay viewer runtime controller opens and renders retained replay tails", async () => {
  const dialogEl = createElement();
  const titleEl = createElement();
  const metaEl = createElement();
  const statusEl = createElement();
  const contentEl = createElement();
  const refreshBtn = createElement();
  const downloadBtn = createElement();
  const copyBtn = createElement();
  const closeBtn = createElement();
  const controller = createReplayViewerRuntimeController({
    dialogEl,
    titleEl,
    metaEl,
    statusEl,
    contentEl,
    refreshBtn,
    downloadBtn,
    copyBtn,
    closeBtn,
    loadSessionReplay: async () => ({
      data: "line one\nline two\n",
      retainedChars: 18,
      retentionLimitChars: 32,
      truncated: true
    }),
    buildReplayRetentionSummary: (payload) =>
      payload.truncated ? `${payload.retainedChars}/${payload.retentionLimitChars} chars retained, truncated` : `${payload.retainedChars} chars retained`,
    formatSessionToken: () => "7",
    formatSessionDisplayName: () => "alpha"
  });

  const outcome = await controller.openSessionReplayViewer({ id: "s1", name: "alpha" });

  assert.equal(dialogEl.open, true);
  assert.equal(titleEl.textContent, "Replay Tail · [7] alpha");
  assert.equal(metaEl.textContent, "Retained replay tail · 18/32 chars retained, truncated.");
  assert.equal(statusEl.textContent, "Output is truncated to the retained replay tail.");
  assert.equal(contentEl.textContent, "line one\nline two\n");
  assert.equal(outcome.feedback, "Opened replay viewer for [7] alpha.");
});

test("replay viewer runtime controller refreshes and proxies copy and download actions", async () => {
  const calls = [];
  const dialogEl = createElement();
  const refreshBtn = createElement();
  const downloadBtn = createElement();
  const copyBtn = createElement();
  const closeBtn = createElement();
  const controller = createReplayViewerRuntimeController({
    dialogEl,
    titleEl: createElement(),
    metaEl: createElement(),
    statusEl: createElement(),
    contentEl: createElement(),
    refreshBtn,
    downloadBtn,
    copyBtn,
    closeBtn,
    loadSessionReplay: async () => {
      calls.push(["load"]);
      return {
        data: "pwd\n",
        retainedChars: 4,
        retentionLimitChars: 4,
        truncated: false
      };
    },
    exportSessionReplay: async (session, options) => {
      calls.push(["export", session.id, options.mode, options.payload?.data || ""]);
      return {
        feedback: `${options.mode}:${session.id}`
      };
    },
    buildReplayRetentionSummary: (payload) => `${payload.retainedChars} chars retained`,
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    formatSessionToken: () => "8",
    formatSessionDisplayName: () => "beta"
  });

  await controller.openSessionReplayViewer({ id: "s2", name: "beta" });
  refreshBtn.click();
  await Promise.resolve();
  downloadBtn.click();
  await Promise.resolve();
  copyBtn.click();
  await Promise.resolve();
  closeBtn.click();

  assert.deepEqual(calls, [
    ["load"],
    ["load"],
    ["export", "s2", "download", "pwd\n"],
    ["feedback", "download:s2"],
    ["export", "s2", "copy", "pwd\n"],
    ["feedback", "copy:s2"]
  ]);
  assert.equal(dialogEl.open, false);
  assert.equal(controller.getActiveSession(), null);
});

test("replay viewer runtime controller keeps export actions disabled when replay loading fails", async () => {
  const dialogEl = createElement();
  const statusEl = createElement();
  const downloadBtn = createElement();
  const copyBtn = createElement();
  const controller = createReplayViewerRuntimeController({
    dialogEl,
    titleEl: createElement(),
    metaEl: createElement(),
    statusEl,
    contentEl: createElement(),
    refreshBtn: createElement(),
    downloadBtn,
    copyBtn,
    closeBtn: createElement(),
    loadSessionReplay: async () => {
      throw new Error("backend failed");
    }
  });

  await assert.rejects(() => controller.openSessionReplayViewer({ id: "s3", name: "gamma" }), /backend failed/);
  assert.equal(downloadBtn.disabled, true);
  assert.equal(copyBtn.disabled, true);
  assert.match(statusEl.textContent, /backend failed/);
});

test("replay viewer runtime controller falls back to dialog class toggles and empty replay messaging", async () => {
  const classOps = [];
  const dialogEl = {
    ...createElement(),
    showModal: undefined,
    close: undefined,
    classList: {
      add(token) {
        classOps.push(["add", token]);
      },
      remove(token) {
        classOps.push(["remove", token]);
      }
    }
  };
  const titleEl = createElement();
  const metaEl = createElement();
  const statusEl = createElement();
  const contentEl = createElement();
  const controller = createReplayViewerRuntimeController({
    dialogEl,
    titleEl,
    metaEl,
    statusEl,
    contentEl,
    refreshBtn: createElement(),
    downloadBtn: createElement(),
    copyBtn: createElement(),
    closeBtn: createElement(),
    loadSessionReplay: async () => ({
      data: "",
      retainedChars: 0,
      retentionLimitChars: 32,
      truncated: false
    }),
    buildReplayRetentionSummary: () => "",
    formatSessionToken: () => "9",
    formatSessionDisplayName: () => "delta"
  });

  await controller.openSessionReplayViewer({ id: "s9", name: "delta" });

  assert.equal(dialogEl.open, true);
  assert.equal(titleEl.textContent, "Replay Tail · [9] delta");
  assert.equal(metaEl.textContent, "Retained replay tail.");
  assert.equal(statusEl.textContent, "No retained replay tail is currently available for this session.");
  assert.equal(contentEl.textContent, "");
  assert.deepEqual(classOps, [["add", "open"]]);

  let prevented = false;
  dialogEl.emit("cancel", {
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(dialogEl.open, false);
  assert.deepEqual(classOps, [
    ["add", "open"],
    ["remove", "open"]
  ]);
});

test("replay viewer runtime controller ignores stale refresh results once a newer refresh wins", async () => {
  const deferred = createDeferred();
  let callCount = 0;
  const contentEl = createElement();
  const statusEl = createElement();
  const controller = createReplayViewerRuntimeController({
    dialogEl: createElement(),
    titleEl: createElement(),
    metaEl: createElement(),
    statusEl,
    contentEl,
    refreshBtn: createElement(),
    downloadBtn: createElement(),
    copyBtn: createElement(),
    closeBtn: createElement(),
    loadSessionReplay: async () => {
      callCount += 1;
      if (callCount === 1) {
        return deferred.promise;
      }
      return {
        data: "fresh\n",
        retainedChars: 6,
        retentionLimitChars: 32,
        truncated: false
      };
    }
  });

  const openPromise = controller.openSessionReplayViewer({ id: "s1", name: "alpha" });
  await Promise.resolve();

  const secondPayload = await controller.refreshActiveSession();
  deferred.resolve({
    data: "stale\n",
    retainedChars: 6,
    retentionLimitChars: 32,
    truncated: false
  });
  await openPromise;

  assert.equal(secondPayload.data, "fresh\n");
  assert.equal(controller.getActivePayload()?.data, "fresh\n");
  assert.equal(statusEl.textContent, "Showing the full retained replay tail currently available.");
  assert.equal(contentEl.textContent, "fresh\n");
});
