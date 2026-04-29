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

test("replay export runtime controller loads and copies normalized replay excerpts", async () => {
  const excerptCalls = [];
  const clipboardWrites = [];
  const controller = createReplayExportRuntimeController({
    api: {
      async getSessionReplayExcerpt(sessionId, selector) {
        excerptCalls.push([sessionId, selector]);
        return {
          selector,
          selectorKind: "lines",
          resolvedCount: 20,
          availableCount: 20,
          selectorSatisfied: true,
          chars: 120,
          lines: 20,
          data: "line one\nline two\n"
        };
      }
    },
    writeClipboardText: async (text) => {
      clipboardWrites.push(text);
      return true;
    },
    formatSessionToken: () => "9",
    formatSessionDisplayName: () => "three"
  });

  const payload = await controller.loadSessionReplayExcerpt({ id: "s3", name: "three" }, "l:20");
  const outcome = await controller.copySessionReplayExcerpt({ id: "s3", name: "three" }, "l:20", { payload });

  assert.deepEqual(excerptCalls, [["s3", "l:20"]]);
  assert.deepEqual(clipboardWrites, ["line one\nline two\n"]);
  assert.equal(outcome.feedback, "Copied replay excerpt from [9] three (l:20 -> 20/20 units, 120 chars, 20 lines).");
});

test("replay export runtime controller formats replay excerpt previews", () => {
  const controller = createReplayExportRuntimeController({
    formatSessionToken: () => "4",
    formatSessionDisplayName: () => "alpha"
  });

  const feedback = controller.previewSessionReplayExcerpt(
    { id: "s4", name: "alpha" },
    {
      selector: "sp:2",
      selectorKind: "shell_blocks",
      resolvedCount: 1,
      availableCount: 2,
      selectorSatisfied: false,
      shellBlocksSupported: true,
      chars: 44,
      lines: 6,
      data: "prompt\noutput\n"
    }
  );

  assert.equal(
    feedback,
    "Preview from [4] alpha (sp:2 -> 1/2 units, 44 chars, 6 lines, partial).\n\nprompt\noutput\n"
  );
});

test("replay export runtime controller falls back to documentElement removal and unavailable shell-block summaries", async () => {
  const removedAnchors = [];
  const controller = createReplayExportRuntimeController({
    documentRef: {
      documentElement: {
        removeChild(node) {
          removedAnchors.push(node);
        }
      },
      createElement(tagName) {
        assert.equal(tagName, "a");
        return {
          href: "",
          download: "",
          style: {},
          click() {}
        };
      }
    },
    URLRef: {
      createObjectURL() {
        return "blob:fallback";
      },
      revokeObjectURL() {}
    },
    BlobCtor: class FakeBlob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
      }
    },
    formatSessionToken: () => "5",
    formatSessionDisplayName: () => "beta"
  });

  const outcome = await controller.exportSessionReplay(
    { id: "s5", name: "beta" },
    {
      mode: "download",
      payload: {
        data: "tail\n",
        retainedChars: 5,
        retentionLimitChars: 32,
        truncated: false
      }
    }
  );
  const preview = controller.previewSessionReplayExcerpt(
    { id: "s5", name: "beta" },
    {
      selector: "sp:4",
      selectorKind: "shell_blocks",
      resolvedCount: -1,
      availableCount: -2,
      chars: -3,
      lines: -4,
      selectorSatisfied: false,
      shellBlocksSupported: false,
      data: ""
    }
  );

  assert.equal(outcome.feedback, "Downloaded replay tail for [5] beta (5 chars retained).");
  assert.equal(removedAnchors.length, 1);
  assert.equal(preview, "Preview from [5] beta (sp:4 -> 0/0 units, 0 chars, 0 lines, unavailable).\n\n");
});

test("replay export runtime controller fails closed for missing browser support and API/session guards", async () => {
  const controller = createReplayExportRuntimeController({
    formatSessionToken: () => "6",
    formatSessionDisplayName: () => "gamma"
  });

  await assert.rejects(
    controller.exportSessionReplay(
      { id: "s6", name: "gamma" },
      {
        mode: "download",
        payload: {
          data: "tail\n",
          retainedChars: 5,
          retentionLimitChars: 5,
          truncated: false
        }
      }
    ),
    /Replay export download is unavailable in this browser\./
  );
  await assert.rejects(controller.loadSessionReplay(null), /Replay export requires a session\./);
  await assert.rejects(controller.loadSessionReplay({ id: "s6", name: "gamma" }), /Replay export API is unavailable\./);
  await assert.rejects(controller.loadSessionReplayExcerpt({ id: "s6", name: "gamma" }, ""), /Replay excerpt selector is required\./);
  await assert.rejects(
    controller.loadSessionReplayExcerpt({ id: "s6", name: "gamma" }, "l:1"),
    /Replay excerpt API is unavailable\./
  );
});
