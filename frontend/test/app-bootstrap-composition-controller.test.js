import test from "node:test";
import assert from "node:assert/strict";

import { createAppBootstrapCompositionController } from "../src/public/app-bootstrap-composition-controller.js";

function createBaseOptions(overrides = {}) {
  const storeState = {
    sessions: [],
    decks: [],
    activeDeckId: "default",
    activeSessionId: ""
  };
  const calls = [];
  const store = {
    getState() {
      return storeState;
    },
    hydrateRuntimePreferences(payload) {
      calls.push(["hydrate", payload]);
    },
    subscribe(handler) {
      calls.push(["subscribe"]);
      this._subscriber = handler;
    },
    setConnectionState(value) {
      calls.push(["connection", value]);
    },
    setSessions(value) {
      calls.push(["sessions", value]);
    }
  };
  const api = {
    sendInput() {},
    createWsTicket() {
      calls.push(["ticket"]);
      return Promise.resolve({ ticket: "t1" });
    }
  };
  const appCommandUiFacadeController = {
    listCustomCommands: () => [],
    getCustomCommand: () => null,
    removeCustomCommand: () => true,
    upsertCustomCommand: () => {},
    setCommandFeedback: (message) => calls.push(["feedback", message]),
    setCommandPreview: (message) => calls.push(["preview", message]),
    clearCommandSuggestions: () => calls.push(["clear-suggestions"]),
    render: () => calls.push(["render"]),
    executeControlCommand: async () => "ok",
    submitCommand: async () => "submitted",
    getErrorMessage: (_err, fallback) => fallback,
    setError: (message) => calls.push(["error", message]),
    markRuntimeBootstrapReady: (source) => calls.push(["bootstrap-ready", source]),
    scheduleBootstrapFallback: () => calls.push(["schedule-fallback"])
  };
  const appLayoutDeckFacadeController = {
    setActiveDeck: (deckId) => calls.push(["set-active-deck", deckId]),
    getActiveDeck: () => ({ id: "default", name: "Default" }),
    getSessionCountForDeck: () => 0,
    applyTerminalSizeSettings: () => {},
    setSessionFilterText: (value) => calls.push(["filter", value]),
    resolveDeckName: (deckId) => deckId,
    setDecks: (decks) => calls.push(["set-decks", decks]),
    syncSettingsUi: () => calls.push(["sync-settings"]),
    syncTerminalGeometryCss: () => calls.push(["sync-geometry"]),
    loadStoredSessionFilterText: () => "tag:ops",
    normalizeSendTerminatorMode: (value) => value || "auto",
    setSessionSendTerminator: () => {},
    getSessionSendTerminator: () => "auto",
    createDeckFlow: async () => {},
    renameDeckFlow: async () => {},
    deleteDeckFlow: async () => {},
    scheduleGlobalResize: () => calls.push(["global-resize"])
  };
  const appRuntimeStateController = {
    getRuntimeBootstrapSource: () => "pending",
    setUiError: (message) => calls.push(["ui-error", message]),
    setStartupGateState: (payload) => calls.push(["startup-gate", payload.phase]),
    clearStartupGateState: () => calls.push(["startup-gate-clear"]),
    bootstrapDevAuthToken: async () => true,
    clearError: () => calls.push(["clear-error"]),
    markRuntimeConnected: () => calls.push(["runtime-connected"]),
    dispose: () => calls.push(["dispose-runtime-state"])
  };
  const appSessionRuntimeFacadeController = {
    formatSessionToken: (sessionId) => String(sessionId || "").toUpperCase(),
    formatSessionDisplayName: (session) => String(session?.name || ""),
    resolveSessionDeckId: (session) => session?.deckId || "default",
    applyRuntimeEvent: () => true
  };
  const sessionUiFacadeController = {
    getSessionRuntimeState: () => "running",
    isSessionExited: () => false,
    isSessionActionBlocked: () => false,
    getBlockedSessionActionMessage: () => "blocked",
    normalizeSessionTags: (tags) => tags || [],
    normalizeThemeProfile: (profile) => profile || {}
  };
  const layoutRuntimeController = {
    bindUiEvents: () => calls.push(["layout-bind"])
  };
  const workspacePresetRuntimeController = {
    bindUiEvents: () => calls.push(["workspace-bind"]),
    loadPresets: async () => {
      calls.push(["workspace-load"]);
      return [];
    }
  };
  const terminalSearchController = {
    bindUiEvents: () => calls.push(["search-bind"]),
    updateUi: () => calls.push(["search-update"]),
    dispose: () => calls.push(["search-dispose"])
  };
  const sessionTerminalResizeController = {
    dispose: () => calls.push(["resize-dispose"])
  };
  const deckRuntimeController = {
    loadStoredActiveDeckId: () => "ops"
  };
  const terminals = new Map([
    [
      "s1",
      {
        terminal: {
          dispose() {
            calls.push(["terminal-dispose", "s1"]);
          }
        }
      }
    ]
  ]);
  const terminalObservers = new Map([
    [
      "s1",
      {
        disconnect() {
          calls.push(["observer-disconnect", "s1"]);
        }
      }
    ]
  ]);
  const wsStateRef = { current: null };

  return {
    calls,
    options: {
      store,
      api,
      config: { wsUrl: "ws://example.test/ws" },
      debugLog: (event) => calls.push(["debug", event]),
      uiState: {},
      commandInput: { value: "" },
      terminals,
      terminalObservers,
      getTerminalSettings: () => ({ cols: 80, rows: 20 }),
      defaultDeckId: "default",
      delayedSubmitMs: 90,
      systemSlashCommands: ["help"],
      terminalThemePresets: [{ id: "default", name: "Default" }],
      windowRef: {},
      documentRef: {},
      wsStateRef,
      activityCompletionNotifier: {
        dispose() {
          calls.push(["notifier-dispose"]);
        }
      },
      createBtn: {},
      deckCreateBtn: {},
      sendBtn: {},
      layoutRuntimeController,
      workspacePresetRuntimeController,
      terminalSearchController,
      sessionTerminalResizeController,
      appCommandUiFacadeController,
      appLayoutDeckFacadeController,
      appRuntimeStateController,
      appSessionRuntimeFacadeController,
      sessionUiFacadeController,
      streamAdapter: {
        push(sessionId, value) {
          calls.push(["stream-push", sessionId, value]);
        }
      },
      sessionViewModel: {},
      runtimeEventController: {},
      deckRuntimeController,
      devAuthRefreshMinDelayMs: 15000,
      devAuthRefreshSafetyMs: 60000,
      devAuthRetryDelayMs: 30000,
      ...overrides
    }
  };
}

test("app bootstrap composition controller composes the startup controller chain in order", () => {
  const { calls, options } = createBaseOptions();

  const controller = createAppBootstrapCompositionController({
    ...options,
    createCommandEngine: (nextOptions) => {
      calls.push(["factory", "engine", nextOptions.systemSlashCommands.slice()]);
      return { parseAutocompleteContext: () => ({}) };
    },
    createCommandTargetRuntimeController: (nextOptions) => {
      calls.push(["factory", "target", typeof nextOptions.commandEngine.parseAutocompleteContext]);
      return {
        resolveTargetSelectors: () => [],
        resolveFilterSelectors: () => [],
        resolveDeckToken: () => "",
        parseSizeCommandArgs: () => null,
        parseCustomDefinition: () => null,
        resolveSettingsTargets: () => [],
        parseSettingsPayload: () => null,
        resolveQuickSwitchTarget: () => null,
        activateSessionTarget: () => {},
        activateDeckTarget: () => {},
        parseDirectTargetRoutingInput: () => null,
        formatQuickSwitchPreview: () => ""
      };
    },
    createCommandExecutor: (nextOptions) => {
      calls.push(["factory", "executor", typeof nextOptions.resolveTargetSelectors]);
      return { execute: async () => true };
    },
    createAuthBootstrapRuntimeController: (nextOptions) => {
      calls.push(["factory", "auth", nextOptions.defaultDeckId]);
      return {
        getWsAuthToken: () => "token",
        dispose() {}
      };
    },
    createStartupWarmupController: (nextOptions) => {
      calls.push(["factory", "startup-warmup", typeof nextOptions.api.getReadyStatus]);
      return {
        waitForServerWarmup: async () => "ready",
        skipWait() {},
        dispose() {}
      };
    },
    createWsRuntimeController: (nextOptions) => {
      calls.push(["factory", "ws", nextOptions.wsUrl]);
      return { start: () => ({ close() {} }) };
    },
    createCommandComposerAutocompleteController: () => {
      calls.push(["factory", "autocomplete"]);
      return {
        bindUiEvents() {},
        resetAutocompleteState() {},
        recordSlashHistory() {},
        resetSlashHistoryNavigationState() {},
        dispose() {}
      };
    },
    createCommandComposerRuntimeController: (nextOptions) => {
      calls.push(["factory", "composer-runtime", typeof nextOptions.resetCommandAutocompleteState]);
      return {
        dispose() {}
      };
    },
    createAppLifecycleController: () => {
      calls.push(["factory", "lifecycle"]);
      return {
        bindUiEvents() {},
        bindWindowEvents() {},
        initializeRuntime: async () => {}
      };
    }
  });

  const composed = controller.composeControllers();

  assert.ok(composed.commandEngine);
  assert.ok(composed.commandTargetRuntimeController);
  assert.ok(composed.commandExecutor);
  assert.ok(composed.authBootstrapRuntimeController);
  assert.ok(composed.wsRuntimeController);
  assert.ok(composed.commandComposerAutocompleteController);
  assert.ok(composed.commandComposerRuntimeController);
  assert.ok(composed.appLifecycleController);
  assert.deepEqual(
    calls.filter((entry) => entry[0] === "factory").map((entry) => entry[1]),
    ["engine", "target", "executor", "auth", "startup-warmup", "ws", "autocomplete", "composer-runtime", "lifecycle"]
  );
});

test("app bootstrap composition controller hydrates UI bindings and starts runtime after composition", async () => {
  const { calls, options } = createBaseOptions();

  const controller = createAppBootstrapCompositionController({
    ...options,
    createCommandEngine: () => ({ parseAutocompleteContext: () => ({}) }),
    createCommandTargetRuntimeController: () => ({
      resolveTargetSelectors: () => [],
      resolveFilterSelectors: () => [],
      resolveDeckToken: () => "",
      parseSizeCommandArgs: () => null,
      parseCustomDefinition: () => null,
      resolveSettingsTargets: () => [],
      parseSettingsPayload: () => null,
      resolveQuickSwitchTarget: () => null,
      activateSessionTarget: () => {},
      activateDeckTarget: () => {},
      parseDirectTargetRoutingInput: () => null,
      formatQuickSwitchPreview: () => ""
    }),
    createCommandExecutor: () => ({ execute: async () => true }),
    createAuthBootstrapRuntimeController: () => ({
      getWsAuthToken: () => "token",
      dispose() {}
    }),
    createWsRuntimeController: () => ({ start: () => ({ close() {} }) }),
    createCommandComposerAutocompleteController: () => ({
      bindUiEvents: () => calls.push(["autocomplete-bind"]),
      resetAutocompleteState() {},
      recordSlashHistory() {},
      resetSlashHistoryNavigationState() {},
      dispose() {}
    }),
    createCommandComposerRuntimeController: () => ({
      dispose() {}
    }),
    createAppLifecycleController: () => ({
      bindUiEvents: () => calls.push(["lifecycle-bind-ui"]),
      bindWindowEvents: () => calls.push(["lifecycle-bind-window"]),
      initializeRuntime: async () => {
        calls.push(["lifecycle-init"]);
      }
    })
  });

  await assert.rejects(async () => controller.bootstrapUiAndRuntime(), /composeControllers/);

  controller.composeControllers();
  await controller.bootstrapUiAndRuntime();

  assert.deepEqual(
    calls.filter((entry) =>
      [
        "hydrate",
        "subscribe",
        "sync-settings",
        "sync-geometry",
        "render",
        "layout-bind",
        "workspace-bind",
        "search-bind",
        "search-update",
        "autocomplete-bind",
        "lifecycle-bind-ui",
        "lifecycle-bind-window",
        "lifecycle-init",
        "workspace-load"
      ].includes(entry[0])
    ),
    [
      ["hydrate", { activeDeckId: "ops", sessionFilterText: "tag:ops" }],
      ["subscribe"],
      ["sync-settings"],
      ["sync-geometry"],
      ["render"],
      ["layout-bind"],
      ["workspace-bind"],
      ["search-bind"],
      ["search-update"],
      ["autocomplete-bind"],
      ["lifecycle-bind-ui"],
      ["lifecycle-bind-window"],
      ["lifecycle-init"],
      ["workspace-load"]
    ]
  );
});
