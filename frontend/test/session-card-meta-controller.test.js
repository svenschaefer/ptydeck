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
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    now: () => 0,
    windowRef: { document: { hidden: false } }
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

test("session-card-meta controller renders tags, badges, status and artifacts", () => {
  let nowMs = 1_000;
  const controller = createSessionCardMetaController({
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    now: () => nowMs,
    windowRef: { document: { hidden: false } }
  });

  const entry = {
    sessionMetaRowEl: { hidden: true },
    sessionNoteEl: { textContent: "", title: "", hidden: true },
    tagListEl: { textContent: "", title: "", classList: createClassList() },
    pluginBadgesEl: { textContent: "", title: "", classList: createClassList() },
    sessionStatusEl: { textContent: "", title: "", hidden: true },
    sessionArtifactsOverlayEl: { hidden: true },
    sessionArtifactsEl: { textContent: "", title: "", hidden: true }
  };
  const session = {
    id: "s-1",
    note: "check metrics",
    tags: ["alpha", "beta"],
    pluginBadges: [{ text: "Working" }, { text: "GPU" }],
    interpretationState: "working",
    statusText: "Working (7m 04s • esc to interrupt)",
    artifacts: [{ title: "Summary", text: "Done" }],
    commandCorrelations: [{ label: "/go" }]
  };

  controller.renderSessionNote(entry, session);
  controller.renderSessionTagList(entry, session);
  controller.renderSessionPluginBadges(entry, session);
  controller.renderSessionStatus(entry, session);
  controller.renderSessionArtifacts(entry, session);

  assert.equal(entry.sessionNoteEl.textContent, "check metrics");
  assert.equal(entry.sessionNoteEl.hidden, false);
  assert.equal(entry.tagListEl.textContent, "#alpha #beta");
  assert.equal(entry.pluginBadgesEl.textContent, "Working · GPU");
  assert.equal(entry.sessionStatusEl.textContent, "Working (7m 04s • esc to interrupt)");
  assert.equal(entry.sessionStatusEl.title, "Working (7m 04s • esc to interrupt)\nCommand: /go");
  assert.equal(entry.sessionStatusEl.hidden, false);
  assert.equal(entry.sessionMetaRowEl.hidden, false);
  assert.equal(entry.sessionArtifactsEl.textContent, "Summary: Done");
  assert.equal(entry.sessionArtifactsEl.title, "Summary: Done\nCommand: /go");
  assert.equal(entry.sessionArtifactsEl.hidden, false);
  assert.equal(entry.sessionArtifactsOverlayEl.hidden, false);

  nowMs += 2_000;
  controller.renderSessionStatus(entry, session);
  assert.equal(entry.sessionStatusEl.textContent, "Working (7m 06s • esc to interrupt)");

  controller.clearSessionStatusAnchor("s-1");
  nowMs += 2_000;
  controller.renderSessionStatus(entry, session);
  assert.equal(entry.sessionStatusEl.textContent, "Working (7m 04s • esc to interrupt)");
});

test("session-card-meta controller hides meta row when tags badges and status are empty", () => {
  const controller = createSessionCardMetaController({
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    now: () => 0,
    windowRef: { document: { hidden: false } }
  });

  const entry = {
    sessionMetaRowEl: { hidden: false },
    sessionNoteEl: { textContent: "", hidden: false },
    tagListEl: { textContent: "", classList: createClassList() },
    pluginBadgesEl: { textContent: "", classList: createClassList() },
    sessionStatusEl: { textContent: "", hidden: false }
  };

  controller.renderSessionNote(entry, { note: "" });
  controller.renderSessionTagList(entry, { tags: [] });
  controller.renderSessionPluginBadges(entry, { pluginBadges: [] });
  controller.renderSessionStatus(entry, { statusText: "", interpretationState: "idle" });
  assert.equal(entry.sessionMetaRowEl.hidden, true);

  controller.renderSessionStatus(entry, {
    id: "s-1",
    statusText: "Working (0s • esc to interrupt)",
    interpretationState: "working"
  });
  assert.equal(entry.sessionMetaRowEl.hidden, false);

  controller.renderSessionStatus(entry, { statusText: "", interpretationState: "idle" });
  controller.renderSessionNote(entry, { note: "keep logs ready" });
  assert.equal(entry.sessionMetaRowEl.hidden, false);
});

test("session-card-meta controller keeps artifacts dismissed until content changes", () => {
  const controller = createSessionCardMetaController({
    normalizeSessionTags: (tags) => (Array.isArray(tags) ? tags : []),
    now: () => 0,
    windowRef: { document: { hidden: false } }
  });

  const entry = {
    sessionArtifactsOverlayEl: { hidden: true },
    sessionArtifactsEl: { textContent: "", hidden: true },
    artifactRenderKey: "",
    dismissedArtifactKey: ""
  };

  controller.renderSessionArtifacts(entry, {
    artifacts: [{ title: "Summary", text: "Initial" }]
  });
  assert.equal(entry.sessionArtifactsOverlayEl.hidden, false);
  assert.equal(entry.sessionArtifactsEl.hidden, false);
  assert.equal(entry.artifactRenderKey, "Summary: Initial");

  entry.dismissedArtifactKey = entry.artifactRenderKey;
  controller.renderSessionArtifacts(entry, {
    artifacts: [{ title: "Summary", text: "Initial" }]
  });
  assert.equal(entry.sessionArtifactsOverlayEl.hidden, true);
  assert.equal(entry.sessionArtifactsEl.hidden, true);

  controller.renderSessionArtifacts(entry, {
    artifacts: [{ title: "Summary", text: "Updated" }]
  });
  assert.equal(entry.sessionArtifactsOverlayEl.hidden, false);
  assert.equal(entry.sessionArtifactsEl.hidden, false);
  assert.equal(entry.dismissedArtifactKey, "");
  assert.equal(entry.artifactRenderKey, "Summary: Updated");
});
