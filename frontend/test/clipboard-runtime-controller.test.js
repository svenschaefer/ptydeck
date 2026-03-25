import test from "node:test";
import assert from "node:assert/strict";

import { createClipboardRuntimeController } from "../src/public/clipboard-runtime-controller.js";

test("clipboard-runtime controller proxies clipboard read and write operations", async () => {
  const calls = [];
  const controller = createClipboardRuntimeController({
    navigatorRef: {
      clipboard: {
        async writeText(text) {
          calls.push(["write", text]);
        },
        async readText() {
          calls.push(["read"]);
          return "clipboard value";
        }
      }
    }
  });

  assert.equal(await controller.writeText("copied"), true);
  assert.equal(await controller.readText(), "clipboard value");
  assert.deepEqual(calls, [["write", "copied"], ["read"]]);
});

test("clipboard-runtime controller degrades safely when clipboard API is unavailable", async () => {
  const controller = createClipboardRuntimeController({ navigatorRef: {} });

  assert.equal(await controller.writeText("copied"), false);
  assert.equal(await controller.readText(), "");
});
