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
  const commandTargetEl = createTextEl();
  const commandFeedbackEl = createTextEl();
  const commandInlineHintEl = createTextEl();
  const commandPreviewEl = createTextEl();
  const commandSuggestionsEl = createTextEl();
  const commandGuardSummaryEl = createTextEl();
  const commandGuardReasonsEl = createTextEl();
  const commandGuardPreviewEl = createTextEl();
  const workflowStatusEl = createTextEl();
  const workflowTargetEl = createTextEl();
  const workflowProgressEl = createTextEl();
  const workflowDetailEl = createTextEl();
  const workflowResultEl = createTextEl();
  const workflowStopBtn = { disabled: true };
  const workflowInterruptBtn = { disabled: true };
  const workflowKillBtn = { disabled: true };
  const commandGuardEl = { hidden: true };
  const startupWarmupGateEl = { hidden: true };
  const startupWarmupMessageEl = createTextEl();
  const startupWarmupDetailEl = createTextEl();
  const startupWarmupSkipBtn = { hidden: true };

  const controller = createWorkspaceRenderController({
    stateEl,
    emptyStateEl,
    statusMessageEl,
    commandTargetEl,
    commandFeedbackEl,
    commandInlineHintEl,
    commandPreviewEl,
    commandSuggestionsEl,
    commandGuardEl,
    commandGuardSummaryEl,
    commandGuardReasonsEl,
    commandGuardPreviewEl,
    workflowStatusEl,
    workflowTargetEl,
    workflowProgressEl,
    workflowDetailEl,
    workflowResultEl,
    workflowStopBtn,
    workflowInterruptBtn,
    workflowKillBtn,
    startupWarmupGateEl,
    startupWarmupMessageEl,
    startupWarmupDetailEl,
    startupWarmupSkipBtn
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
    commandTargetText: "Target: [7] Ops",
    commandFeedback: "ok",
    commandInlineHint: " /help",
    commandInlineHintPrefixPx: 24,
    commandPreview: "preview",
    commandSuggestions: "suggestions",
    commandGuardActive: true,
    commandGuardSummary: "Confirmation required.",
    commandGuardReasons: "- risky",
    commandGuardPreview: "rm -rf ./tmp",
    workflowStatus: "Workflow: waiting.",
    workflowTarget: "Target: [7] Ops",
    workflowProgress: "Progress: 1/3 completed · step 2/3.",
    workflowDetail: "Detail: waiting on /wait idle 10s",
    workflowResult: "Workflow stopped after 1/3 step(s).",
    workflowCanStop: true,
    workflowCanInterrupt: true,
    workflowCanKill: false
  });

  assert.equal(stateEl.textContent, "connecting");
  assert.equal(statusMessageEl.textContent, "Connection state: connecting");
  assert.equal(commandTargetEl.textContent, "Target: [7] Ops");
  assert.equal(commandFeedbackEl.textContent, "ok");
  assert.equal(commandInlineHintEl.textContent, " /help");
  assert.equal(commandInlineHintEl.style.getPropertyValue("--hint-prefix-px"), "24px");
  assert.equal(commandPreviewEl.textContent, "preview");
  assert.equal(commandSuggestionsEl.textContent, "suggestions");
  assert.equal(commandGuardEl.hidden, false);
  assert.equal(commandGuardSummaryEl.textContent, "Confirmation required.");
  assert.equal(commandGuardReasonsEl.textContent, "- risky");
  assert.equal(commandGuardPreviewEl.textContent, "rm -rf ./tmp");
  assert.equal(workflowStatusEl.textContent, "Workflow: waiting.");
  assert.equal(workflowTargetEl.textContent, "Target: [7] Ops");
  assert.equal(workflowProgressEl.textContent, "Progress: 1/3 completed · step 2/3.");
  assert.equal(workflowDetailEl.textContent, "Detail: waiting on /wait idle 10s");
  assert.equal(workflowResultEl.textContent, "Workflow stopped after 1/3 step(s).");
  assert.equal(workflowStopBtn.disabled, false);
  assert.equal(workflowInterruptBtn.disabled, false);
  assert.equal(workflowKillBtn.disabled, true);

  controller.renderStatus({
    connectionState: "starting sessions",
    loading: true,
    startupGateActive: true,
    startupGateMessage: "Server is starting sessions.",
    startupGateDetail: "Waiting for quiet.",
    startupGateCanSkip: true
  });

  assert.equal(statusMessageEl.textContent, "Server is starting sessions.");
  assert.equal(startupWarmupGateEl.hidden, false);
  assert.equal(startupWarmupMessageEl.textContent, "Server is starting sessions.");
  assert.equal(startupWarmupDetailEl.textContent, "Waiting for quiet.");
  assert.equal(startupWarmupSkipBtn.hidden, false);
  assert.equal(commandGuardEl.hidden, true);
});
