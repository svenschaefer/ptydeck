import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspaceRenderController } from "../src/public/ui/workspace-render-controller.js";

function createTextEl() {
  const style = new Map();
  return {
    textContent: "",
    style: {
      display: "",
      setProperty(name, value) {
        style.set(String(name), String(value));
      },
      getPropertyValue(name) {
        return style.get(String(name)) || "";
      }
    }
  };
}

test("workspace-render controller resolves visible sessions and active fallback", () => {
  const controller = createWorkspaceRenderController({});
  const deckSessions = [{ id: "s1" }, { id: "s2" }];

  const noFilter = controller.resolveVisibleSessions({
    sessions: deckSessions,
    deckSessions,
    sessionFilterText: "",
    activeSessionId: "s1",
    resolveFilterSelectors: () => ({ sessions: deckSessions })
  });
  assert.equal(noFilter.filterActive, false);
  assert.equal(noFilter.visibleSessionIds.has("s1"), true);
  assert.equal(noFilter.visibleSessionIds.has("s2"), true);
  assert.equal(noFilter.switchedActiveSession, false);

  let switchedTo = "";
  const withFilter = controller.resolveVisibleSessions({
    sessions: deckSessions,
    deckSessions,
    sessionFilterText: "id:s2",
    activeSessionId: "s1",
    resolveFilterSelectors: () => ({ sessions: [{ id: "s2" }] }),
    setActiveSession(sessionId) {
      switchedTo = sessionId;
    }
  });
  assert.equal(withFilter.filterActive, true);
  assert.equal(withFilter.switchedActiveSession, true);
  assert.equal(switchedTo, "s2");
});

test("workspace-render controller renders empty-state and status fields", () => {
  const stateEl = createTextEl();
  const emptyStateEl = createTextEl();
  const statusMessageEl = createTextEl();
  const commandFeedbackEl = createTextEl();
  const commandInlineHintEl = createTextEl();
  const commandPreviewEl = createTextEl();
  const commandSuggestionsEl = createTextEl();

  const controller = createWorkspaceRenderController({
    stateEl,
    emptyStateEl,
    statusMessageEl,
    commandFeedbackEl,
    commandInlineHintEl,
    commandPreviewEl,
    commandSuggestionsEl
  });

  controller.renderEmptyState({
    sessions: [{ id: "s1" }],
    deckSessions: [{ id: "s1" }],
    visibleSessionIds: new Set(["s1"]),
    filterActive: false
  });
  assert.equal(emptyStateEl.style.display, "none");

  controller.renderEmptyState({
    sessions: [{ id: "s1" }],
    deckSessions: [{ id: "s1" }],
    visibleSessionIds: new Set(),
    filterActive: true
  });
  assert.equal(emptyStateEl.style.display, "block");
  assert.equal(emptyStateEl.textContent, "No sessions match current filter.");

  controller.renderStatus({
    connectionState: "connecting",
    loading: false,
    error: "",
    commandFeedback: "ok",
    commandInlineHint: " /help",
    commandInlineHintPrefixPx: 24,
    commandPreview: "preview",
    commandSuggestions: "suggestions"
  });

  assert.equal(stateEl.textContent, "connecting");
  assert.equal(statusMessageEl.textContent, "Connection state: connecting");
  assert.equal(commandFeedbackEl.textContent, "ok");
  assert.equal(commandInlineHintEl.textContent, " /help");
  assert.equal(commandInlineHintEl.style.getPropertyValue("--hint-prefix-px"), "24px");
  assert.equal(commandPreviewEl.textContent, "preview");
  assert.equal(commandSuggestionsEl.textContent, "suggestions");
});
