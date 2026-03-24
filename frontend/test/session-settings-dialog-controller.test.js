import test from "node:test";
import assert from "node:assert/strict";

import { createSessionSettingsDialogController } from "../src/public/ui/session-settings-dialog-controller.js";

function createClassList() {
  const values = new Set();
  return {
    add(value) {
      values.add(String(value));
    },
    remove(value) {
      values.delete(String(value));
    },
    contains(value) {
      return values.has(String(value));
    }
  };
}

test("session-settings dialog controller opens/closes/toggles fallback dialogs", () => {
  const controller = createSessionSettingsDialogController({ windowRef: null });
  const dialog = {
    open: false,
    classList: createClassList()
  };

  controller.open(dialog);
  assert.equal(dialog.open, true);
  assert.equal(dialog.classList.contains("open"), true);

  controller.toggle(dialog);
  assert.equal(dialog.open, false);
  assert.equal(dialog.classList.contains("open"), false);

  controller.toggle(dialog);
  assert.equal(dialog.open, true);
  assert.equal(dialog.classList.contains("open"), true);
});

test("session-settings dialog controller uses native modal methods and confirmation", () => {
  const confirmCalls = [];
  const controller = createSessionSettingsDialogController({
    windowRef: {
      confirm(message) {
        confirmCalls.push(message);
        return false;
      }
    }
  });

  const dialog = {
    open: false,
    showModalCalls: 0,
    closeCalls: 0,
    showModal() {
      this.showModalCalls += 1;
      this.open = true;
    },
    close() {
      this.closeCalls += 1;
      this.open = false;
    }
  };

  controller.open(dialog);
  assert.equal(dialog.showModalCalls, 1);
  assert.equal(dialog.open, true);

  controller.close(dialog);
  assert.equal(dialog.closeCalls, 1);
  assert.equal(dialog.open, false);

  const confirmed = controller.confirmSessionDelete({ id: "s-1", name: "Alpha" });
  assert.equal(confirmed, false);
  assert.equal(confirmCalls.length, 1);
  assert.match(confirmCalls[0], /Delete session 'Alpha' permanently\?/);
});
