import test from "node:test";
import assert from "node:assert/strict";

import { createAppCommandUiFacadeController } from "../src/public/app-command-ui-facade-controller.js";

test("app-command-ui facade delegates command, runtime, search, and render glue", async () => {
  const calls = [];
  const state = {
    sessions: [{ id: "s1" }],
    activeSessionId: "s1",
    activeDeckId: "default",
    sessionFilterText: "ops",
    connectionState: "connected"
  };
  const uiState = { error: "", commandFeedback: "", commandPreview: "" };
  const startupPerf = { startupReported: false };
  const runtimeStateController = {
    setError(message) {
      uiState.error = message;
      calls.push(["set-error", message]);
    },
    setCommandFeedback(message) {
      uiState.commandFeedback = message;
      calls.push(["set-feedback", message]);
    },
    getErrorMessage(err, fallback) {
      calls.push(["get-error-message", err?.message || null, fallback]);
      return "resolved error";
    },
    setCommandPreview(message) {
      uiState.commandPreview = message;
      calls.push(["set-preview", message]);
    },
    maybeReportStartupPerf() {
      calls.push(["report-startup"]);
    },
    markRuntimeBootstrapReady(source) {
      calls.push(["bootstrap-ready", source]);
    },
    scheduleBootstrapFallback() {
      calls.push(["schedule-bootstrap-fallback"]);
    }
  };
  const terminalSearchController = {
    clearSelection(sessionId) {
      calls.push(["clear-search", sessionId]);
    },
    syncActiveTerminalSearch(options) {
      calls.push(["sync-search", options.preserveSelection]);
    },
    navigateActiveTerminalSearch(direction) {
      calls.push(["navigate-search", direction]);
    }
  };
  const autocompleteController = {
    clearSuggestions() {
      calls.push(["clear-suggestions"]);
    },
    scheduleSuggestions() {
      calls.push(["schedule-suggestions"]);
    }
  };
  const composerRuntimeController = {
    async submitCommand() {
      calls.push(["submit-command"]);
      return "submitted";
    },
    async refreshCommandPreview() {
      calls.push(["refresh-preview"]);
      return "preview";
    },
    scheduleCommandPreview() {
      calls.push(["schedule-preview"]);
    }
  };
  const commandTargetRuntimeController = {
    resolveFilterSelectors(token) {
      calls.push(["resolve-filter", token]);
      return { sessions: [] };
    }
  };
  const sessionGridController = {
    renderWorkspace(payload) {
      calls.push(["render", payload.state.activeSessionId, payload.uiState.commandFeedback, payload.nowMs()]);
      payload.maybeReportStartupPerf();
      payload.resolveFilterSelectors?.("tag:ops");
    }
  };
  const commandExecutor = {
    async execute(interpreted) {
      calls.push(["execute-control", interpreted.command]);
      return "ok";
    }
  };
  const store = {
    getState() {
      return state;
    },
    listCustomCommands() {
      calls.push(["list-custom"]);
      return [{ name: "docu", content: "..." }];
    },
    getCustomCommand(name) {
      calls.push(["get-custom", name]);
      return { name, content: "payload" };
    },
    upsertCustomCommand(command) {
      calls.push(["upsert-custom", command.name]);
      return { name: command.name, content: command.content };
    },
    removeCustomCommand(name) {
      calls.push(["remove-custom", name]);
      return true;
    },
    replaceCustomCommands(commands) {
      calls.push(["replace-custom", commands.length]);
    }
  };

  const controller = createAppCommandUiFacadeController({
    store,
    uiState,
    startupPerf,
    nowMs: () => 1234,
    terminalSearchState: { selectedSessionId: "s1" },
    getAppRuntimeStateController: () => runtimeStateController,
    getTerminalSearchController: () => terminalSearchController,
    getCommandComposerAutocompleteController: () => autocompleteController,
    getCommandComposerRuntimeController: () => composerRuntimeController,
    getCommandTargetRuntimeController: () => commandTargetRuntimeController,
    getSessionGridController: () => sessionGridController,
    getCommandExecutor: () => commandExecutor
  });

  assert.deepEqual(controller.listCustomCommands(), [{ name: "docu", content: "..." }]);
  assert.deepEqual(controller.getCustomCommand("docu"), { name: "docu", content: "payload" });
  assert.deepEqual(controller.upsertCustomCommand({ name: "go", content: "run" }), { name: "go", content: "run" });
  assert.equal(controller.removeCustomCommand("docu"), true);
  controller.replaceCustomCommands([{ name: "one" }, { name: "two" }]);
  controller.setError("boom");
  controller.setCommandFeedback("ok");
  assert.equal(controller.getErrorMessage(new Error("fail"), "fallback"), "resolved error");
  controller.setCommandPreview("preview");
  controller.clearTerminalSearchSelection();
  controller.syncActiveTerminalSearch({ preserveSelection: false });
  controller.navigateActiveTerminalSearch("prev");
  controller.clearCommandSuggestions();
  controller.scheduleCommandSuggestions();
  controller.maybeReportStartupPerf();
  controller.markRuntimeBootstrapReady("ws");
  controller.scheduleBootstrapFallback();
  controller.render();
  assert.equal(await controller.executeControlCommand({ command: "list" }), "ok");
  assert.equal(await controller.submitCommand(), "submitted");
  assert.equal(await controller.refreshCommandPreview(), "preview");
  controller.scheduleCommandPreview();

  assert.deepEqual(calls, [
    ["list-custom"],
    ["get-custom", "docu"],
    ["upsert-custom", "go"],
    ["remove-custom", "docu"],
    ["replace-custom", 2],
    ["set-error", "boom"],
    ["set-feedback", "ok"],
    ["get-error-message", "fail", "fallback"],
    ["set-preview", "preview"],
    ["clear-search", "s1"],
    ["sync-search", false],
    ["navigate-search", "prev"],
    ["clear-suggestions"],
    ["schedule-suggestions"],
    ["report-startup"],
    ["bootstrap-ready", "ws"],
    ["schedule-bootstrap-fallback"],
    ["render", "s1", "ok", 1234],
    ["report-startup"],
    ["resolve-filter", "tag:ops"],
    ["execute-control", "list"],
    ["submit-command"],
    ["refresh-preview"],
    ["schedule-preview"]
  ]);
});

test("app-command-ui facade falls back safely when dependencies are missing", async () => {
  const controller = createAppCommandUiFacadeController({
    nowMs: () => 55
  });

  assert.deepEqual(controller.listCustomCommands(), []);
  assert.equal(controller.getCustomCommand("docu"), null);
  assert.equal(controller.upsertCustomCommand({ name: "docu", content: "x" }), null);
  assert.equal(controller.removeCustomCommand("docu"), false);
  controller.replaceCustomCommands([{ name: "ignored" }]);
  controller.setError("ignored");
  controller.setCommandFeedback("ignored");
  assert.equal(controller.getErrorMessage(new Error("boom"), "fallback"), "fallback");
  controller.setCommandPreview("ignored");
  controller.clearTerminalSearchSelection();
  controller.syncActiveTerminalSearch();
  controller.navigateActiveTerminalSearch("next");
  controller.clearCommandSuggestions();
  controller.scheduleCommandSuggestions();
  controller.maybeReportStartupPerf();
  controller.markRuntimeBootstrapReady("fallback");
  controller.scheduleBootstrapFallback();
  controller.render();
  assert.equal(await controller.executeControlCommand({ command: "list" }), undefined);
  assert.equal(await controller.submitCommand(), undefined);
  assert.equal(await controller.refreshCommandPreview(), undefined);
  controller.scheduleCommandPreview();
});
