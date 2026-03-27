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
