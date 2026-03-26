import test from "node:test";
import assert from "node:assert/strict";

import { createSessionCardMetaController } from "../src/public/ui/session-card-meta-controller.js";

function createClassList() {
  const values = new Set();
  return {
    add(value) {
      values.add(String(value));
    },
    remove(value) {
      values.delete(String(value));
    },
    toggle(value, force) {
      const key = String(value);
      if (force === true) {
        values.add(key);
        return true;
      }
      if (force === false) {
        values.delete(key);
        return false;
      }
      if (values.has(key)) {
        values.delete(key);
        return false;
      }
      values.add(key);
      return true;
    },
    contains(value) {
      return values.has(String(value));
    }
  };
}

test("session-card-meta controller updates dirty/saved state", () => {
  const entry = {
    settingsStatus: { textContent: "", classList: createClassList() },
    settingsApplyBtn: { disabled: false },
    settingsDirty: false
  };
  const controller = createSessionCardMetaController({
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : [])
  });

  controller.setSettingsDirty(entry, true);
  assert.equal(entry.settingsDirty, true);
  assert.equal(entry.settingsApplyBtn.disabled, false);
  assert.equal(entry.settingsStatus.textContent, "Unsaved changes");
  assert.equal(entry.settingsStatus.classList.contains("dirty"), true);

  controller.setSettingsDirty(entry, false);
  assert.equal(entry.settingsDirty, false);
  assert.equal(entry.settingsApplyBtn.disabled, true);
  assert.equal(entry.settingsStatus.textContent, "Saved");
  assert.equal(entry.settingsStatus.classList.contains("saved"), true);
});

test("session-card-meta controller renders notes and tags", () => {
  const controller = createSessionCardMetaController({
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : [])
  });

  const entry = {
    sessionMetaRowEl: { hidden: true },
    sessionNoteEl: { textContent: "", title: "", hidden: true },
    tagListEl: { textContent: "", title: "", classList: createClassList() }
  };
  const session = {
    id: "s-1",
    note: "check metrics",
    tags: ["alpha", "beta"]
  };

  controller.renderSessionNote(entry, session);
  controller.renderSessionTagList(entry, session);

  assert.equal(entry.sessionNoteEl.textContent, "check metrics");
  assert.equal(entry.sessionNoteEl.hidden, false);
  assert.equal(entry.tagListEl.textContent, "#alpha #beta");
  assert.equal(entry.sessionMetaRowEl.hidden, false);
});

test("session-card-meta controller hides meta row when note and tags are empty", () => {
  const controller = createSessionCardMetaController({
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : [])
  });

  const entry = {
    sessionMetaRowEl: { hidden: false },
    sessionNoteEl: { textContent: "", hidden: false },
    tagListEl: { textContent: "", classList: createClassList() }
  };

  controller.renderSessionNote(entry, { note: "" });
  controller.renderSessionTagList(entry, { tags: [] });
  assert.equal(entry.sessionMetaRowEl.hidden, true);

  controller.renderSessionNote(entry, { note: "keep logs ready" });
  assert.equal(entry.sessionMetaRowEl.hidden, false);
});
