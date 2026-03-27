import test from "node:test";
import assert from "node:assert/strict";

import { createReplayExportRuntimeController } from "../src/public/replay-export-runtime-controller.js";

class FakeAnchor {
  constructor() {
    this.href = "";
    this.download = "";
    this.style = {};
    this.clicked = 0;
    this.removed = 0;
  }

  click() {
    this.clicked += 1;
  }

  remove() {
    this.removed += 1;
  }
}

test("replay export runtime controller downloads retained replay tails and formats truncation feedback", async () => {
  const createdAnchors = [];
  const objectUrls = [];
  const revokedUrls = [];
  const bodyChildren = [];
  const apiCalls = [];
  const controller = createReplayExportRuntimeController({
    api: {
      async getSessionReplayExport(sessionId) {
        apiCalls.push(sessionId);
        return {
          fileName: "session-one-replay.txt",
          contentType: "text/plain; charset=utf-8",
          data: "pwd\n",
          retainedChars: 4,
          retentionLimitChars: 4,
          truncated: true
        };
      }
    },
    documentRef: {
      body: {
        appendChild(node) {
          bodyChildren.push(node);
        }
      },
      createElement(tagName) {
        assert.equal(tagName, "a");
        const anchor = new FakeAnchor();
        createdAnchors.push(anchor);
        return anchor;
      }
    },
    URLRef: {
      createObjectURL(blob) {
        objectUrls.push(blob);
        return "blob:replay-export";
      },
      revokeObjectURL(url) {
        revokedUrls.push(url);
      }
    },
    BlobCtor: class FakeBlob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    },
    formatSessionToken: () => "7",
    formatSessionDisplayName: () => "one"
  });

  const outcome = await controller.exportSessionReplay({ id: "s1", name: "one" }, { mode: "download" });

  assert.deepEqual(apiCalls, ["s1"]);
  assert.equal(createdAnchors.length, 1);
  assert.equal(createdAnchors[0].href, "blob:replay-export");
  assert.equal(createdAnchors[0].download, "session-one-replay.txt");
  assert.equal(createdAnchors[0].clicked, 1);
  assert.equal(createdAnchors[0].removed, 1);
  assert.equal(bodyChildren.length, 1);
  assert.equal(objectUrls.length, 1);
  assert.deepEqual(objectUrls[0].parts, ["pwd\n"]);
  assert.equal(objectUrls[0].options.type, "text/plain; charset=utf-8");
  assert.deepEqual(revokedUrls, ["blob:replay-export"]);
  assert.equal(outcome.feedback, "Downloaded replay tail for [7] one (4/4 chars retained, truncated).");
});

test("replay export runtime controller copies retained replay tails to the clipboard", async () => {
  const clipboardWrites = [];
  const controller = createReplayExportRuntimeController({
    api: {
      async getSessionReplayExport() {
        return {
          data: "echo hi\n",
          retainedChars: 8,
          retentionLimitChars: 64,
          truncated: false
        };
      }
    },
    writeClipboardText: async (text) => {
      clipboardWrites.push(text);
      return true;
    },
    formatSessionToken: () => "8",
    formatSessionDisplayName: () => "two"
  });

  const outcome = await controller.exportSessionReplay({ id: "s2", name: "two" }, { mode: "copy" });

  assert.deepEqual(clipboardWrites, ["echo hi\n"]);
  assert.equal(outcome.feedback, "Copied replay tail for [8] two (8 chars retained).");
});

test("replay export runtime controller rejects copy when clipboard support is unavailable", async () => {
  const controller = createReplayExportRuntimeController({
    api: {
      async getSessionReplayExport() {
        return {
          data: "echo hi\n",
          retainedChars: 8,
          retentionLimitChars: 64,
          truncated: false
        };
      }
    }
  });

  await assert.rejects(
    controller.exportSessionReplay({ id: "s2", name: "two" }, { mode: "copy" }),
    /Replay export copy is unavailable in this browser\./
  );
});
