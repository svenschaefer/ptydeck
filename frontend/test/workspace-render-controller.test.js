import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspaceRenderController } from "../src/public/ui/workspace-render-controller.js";

function createElement() {
  return {
    textContent: "",
    hidden: false,
    disabled: false,
    attributes: new Map(),
    style: {
      setProperty(name, value) {
        this[name] = value;
      }
    },
    setAttribute(name, value) {
      this.attributes.set(String(name), String(value));
    },
    removeAttribute(name) {
      this.attributes.delete(String(name));
    },
    getAttribute(name) {
      return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
    }
  };
}

test("workspace render controller shows spectator access state and disables write controls", () => {
  const stateEl = createElement();
  const accessStateEl = createElement();
  const statusMessageEl = createElement();
  const commandTargetEl = createElement();
  const commandFeedbackEl = createElement();
  const commandInlineHintEl = createElement();
  const commandPreviewEl = createElement();
  const commandSuggestionsEl = createElement();
  const commandGuardEl = createElement();
  const commandGuardSummaryEl = createElement();
  const commandGuardReasonsEl = createElement();
  const commandGuardPreviewEl = createElement();
  const workflowStatusEl = createElement();
  const workflowTargetEl = createElement();
  const workflowProgressEl = createElement();
  const workflowDetailEl = createElement();
  const workflowResultEl = createElement();
  const workflowStopBtn = createElement();
  const workflowInterruptBtn = createElement();
  const workflowKillBtn = createElement();
  const createBtn = createElement();
  const deckCreateBtn = createElement();
  const commandInput = createElement();
  const sendBtn = createElement();
  const startupWarmupGateEl = createElement();
  const startupWarmupMessageEl = createElement();
  const startupWarmupDetailEl = createElement();
  const startupWarmupSkipBtn = createElement();

  const controller = createWorkspaceRenderController({
    stateEl,
    accessStateEl,
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
    createBtn,
    deckCreateBtn,
    commandInput,
    sendBtn,
    startupWarmupGateEl,
    startupWarmupMessageEl,
    startupWarmupDetailEl,
    startupWarmupSkipBtn
  });

  controller.renderStatus({
    connectionState: "connected",
    accessSummary: "Spectator · Read-only deck ops",
    readOnlySpectator: true,
    workflowCanStop: false,
    workflowCanInterrupt: false,
    workflowCanKill: false
  });

  assert.equal(stateEl.textContent, "connected");
  assert.equal(accessStateEl.hidden, false);
  assert.equal(accessStateEl.textContent, "Spectator · Read-only deck ops");
  assert.equal(createBtn.disabled, true);
  assert.equal(deckCreateBtn.disabled, true);
  assert.equal(sendBtn.disabled, true);
  assert.equal(commandInput.disabled, true);
  assert.equal(commandInput.getAttribute("title"), "Spectator · Read-only deck ops");
});
