import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeLayoutFoundationAssembly } from "../src/public/app-runtime-layout-foundation-assembly.js";

test("app runtime layout foundation assembly composes the session facade, layout runtime, and deck runtime with shared state", () => {
  const store = {
    getState() {
      return {
        activeDeckId: "ops",
        sessions: [{ id: "session-1" }]
      };
    }
  };
  const stateRef = {
    terminalSettings: null,
    sessionInputSettings: {}
  };
  const created = {
    sessionFacadeOptions: null,
    layoutOptions: null,
    deckOptions: null,
    appLayoutOptions: null
  };
  const deckRuntimeController = { kind: "deck-runtime" };
  const layoutRuntimeController = {
    kind: "layout-runtime",
    loadTerminalSettings() {
      return { cols: 132, rows: 41, sidebarVisible: false };
    },
    loadSessionInputSettings() {
      return { "session-1": { sendTerminator: "enter" } };
    }
  };
  const sessionFacadeController = {
    kind: "session-facade",
    applyRuntimeEvent(event, runtimeOptions) {
      return event?.type === "deck.updated" && runtimeOptions?.source === "runtime";
    },
    resolveSessionDeckId(session) {
      return session?.deckId || "ops";
    },
    getSessionById(sessionId) {
      return sessionId ? { id: sessionId } : null;
    }
  };
  const appLayoutDeckFacadeController = {
    kind: "app-layout",
    getActiveDeck() {
      return { id: "ops", name: "Operations" };
    },
    applySettingsToAllTerminals(runtimeOptions) {
      return { mode: "apply-all", runtimeOptions };
    },
    scheduleGlobalResize(runtimeOptions) {
      return { mode: "resize-global", runtimeOptions };
    },
    scheduleDeferredResizePasses(runtimeOptions) {
      return { mode: "resize-deferred", runtimeOptions };
    },
    saveTerminalSettings() {
      return "saved-terminal-settings";
    },
    syncSettingsUi() {
      return "synced-settings-ui";
    },
    clampInt(value, fallback, min, max) {
      return Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
    },
    clearUiError() {
      return "cleared-ui-error";
    }
  };

  const assembly = createAppRuntimeLayoutFoundationAssembly({
    store,
    stateRef,
    windowRef: { name: "window" },
    defaultDeckId: "default",
    defaultTerminalCols: 120,
    defaultTerminalRows: 40,
    activeDeckStorageKey: "ptydeck.active-deck.v1",
    settingsStorageKey: "ptydeck.settings.v1",
    sessionInputSettingsStorageKey: "ptydeck.session-input-settings.v1",
    sessionFilterStorageKey: "ptydeck.session-filter.v1",
    sendTerminatorModeSet: new Set(["auto", "enter"]),
    cardHorizontalChromePx: 28,
    terminalFontSize: 14,
    terminalLineHeight: 1.3,
    api: { name: "api" },
    settingsApplyBtn: { id: "apply" },
    settingsColsEl: { id: "cols" },
    settingsRowsEl: { id: "rows" },
    sidebarToggleBtn: { id: "sidebar-toggle" },
    sidebarLauncherBtn: { id: "sidebar-launcher" },
    terminalSearchToggleBtn: { id: "search-toggle" },
    settingsPanelToggleBtn: { id: "settings-toggle" },
    layoutProfileToggleBtn: { id: "layout-toggle" },
    refreshTerminalViewport() {},
    syncTerminalScrollArea() {},
    getSessionViewModel: () => ({ id: "view-model" }),
    getSessionRuntimeController: () => ({ id: "runtime-controller" }),
    getLayoutSettingsController: () => ({ id: "layout-settings" }),
    getAppCommandUiFacadeController: () => ({
      render() {
        return "rendered";
      },
      setCommandFeedback(message) {
        return `feedback:${message}`;
      },
      setError(message) {
        return `error:${message}`;
      },
      getErrorMessage(error, fallback) {
        return error?.message || fallback;
      }
    }),
    getDeckSidebarController: () => ({ id: "deck-sidebar" }),
    getSessionTerminalResizeController: () => ({ id: "terminal-resize" }),
    getSessionSettingsDialogController: () => ({ id: "settings-dialog" }),
    getDeckActionsController: () => ({ id: "deck-actions" }),
    getAppRuntimeStateController: () => ({
      clearError() {
        return "cleared";
      }
    }),
    createAppSessionRuntimeFacadeController(options) {
      created.sessionFacadeOptions = options;
      return sessionFacadeController;
    },
    createLayoutRuntimeController(options) {
      created.layoutOptions = options;
      return layoutRuntimeController;
    },
    createDeckRuntimeController(options) {
      created.deckOptions = options;
      return deckRuntimeController;
    },
    createAppLayoutDeckFacadeController(options) {
      created.appLayoutOptions = options;
      return appLayoutDeckFacadeController;
    }
  });

  assert.equal(assembly.appSessionRuntimeFacadeController, sessionFacadeController);
  assert.equal(assembly.layoutRuntimeController, layoutRuntimeController);
  assert.equal(assembly.deckRuntimeController, deckRuntimeController);
  assert.equal(assembly.appLayoutDeckFacadeController, appLayoutDeckFacadeController);
  assert.equal(assembly.stateRef, stateRef);
  assert.deepEqual(stateRef.terminalSettings, { cols: 132, rows: 41, sidebarVisible: false });
  assert.deepEqual(stateRef.sessionInputSettings, {
    "session-1": { sendTerminator: "enter" }
  });

  assert.equal(created.sessionFacadeOptions.defaultDeckId, "default");
  assert.deepEqual(created.sessionFacadeOptions.getSessionViewModel(), { id: "view-model" });
  assert.deepEqual(created.sessionFacadeOptions.getSessionRuntimeController(), { id: "runtime-controller" });
  assert.equal(created.sessionFacadeOptions.getAppLayoutDeckFacadeController(), appLayoutDeckFacadeController);

  assert.equal(created.layoutOptions.getLayoutSettingsController().id, "layout-settings");
  assert.deepEqual(created.layoutOptions.getTerminalSettings(), { cols: 132, rows: 41, sidebarVisible: false });
  assert.deepEqual(created.layoutOptions.getSessionInputSettings(), {
    "session-1": { sendTerminator: "enter" }
  });
  assert.deepEqual(created.layoutOptions.getActiveDeck(), { id: "ops", name: "Operations" });
  assert.equal(created.layoutOptions.applyRuntimeEvent({ type: "deck.updated" }, { source: "runtime" }), true);
  assert.deepEqual(created.layoutOptions.applySettingsToAllTerminals({ reason: "test" }), {
    mode: "apply-all",
    runtimeOptions: { reason: "test" }
  });
  assert.deepEqual(created.layoutOptions.scheduleGlobalResize({ scope: "all" }), {
    mode: "resize-global",
    runtimeOptions: { scope: "all" }
  });
  assert.equal(created.layoutOptions.render(), "rendered");
  assert.equal(created.layoutOptions.setCommandFeedback("ok"), "feedback:ok");
  assert.equal(created.layoutOptions.setError("broken"), "error:broken");
  assert.equal(created.layoutOptions.getErrorMessage(new Error("failed"), "fallback"), "failed");

  created.layoutOptions.setTerminalSettings({ cols: 90, rows: 30 });
  created.layoutOptions.setSessionInputSettings({ "session-2": { sendTerminator: "auto" } });
  assert.deepEqual(stateRef.terminalSettings, { cols: 90, rows: 30 });
  assert.deepEqual(stateRef.sessionInputSettings, { "session-2": { sendTerminator: "auto" } });

  assert.equal(created.deckOptions.activeDeckStorageKey, "ptydeck.active-deck.v1");
  assert.deepEqual(created.deckOptions.getTerminalSettings(), { cols: 90, rows: 30 });
  created.deckOptions.setTerminalSettings({ cols: 100, rows: 25 });
  assert.deepEqual(stateRef.terminalSettings, { cols: 100, rows: 25 });
  assert.equal(created.deckOptions.persistTerminalSettings(), "saved-terminal-settings");
  assert.equal(created.deckOptions.syncSettingsUi(), "synced-settings-ui");
  assert.deepEqual(created.deckOptions.applySettingsToAllTerminals({ source: "deck" }), {
    mode: "apply-all",
    runtimeOptions: { source: "deck" }
  });
  assert.deepEqual(created.deckOptions.scheduleGlobalResize({ source: "deck" }), {
    mode: "resize-global",
    runtimeOptions: { source: "deck" }
  });
  assert.deepEqual(created.deckOptions.scheduleDeferredResizePasses({ source: "deck" }), {
    mode: "resize-deferred",
    runtimeOptions: { source: "deck" }
  });
  assert.equal(created.deckOptions.getDeckSidebarController().id, "deck-sidebar");
  assert.equal(created.deckOptions.resolveSessionDeckId({ deckId: "ops" }), "ops");
  assert.deepEqual(created.deckOptions.getSessionById("session-2"), { id: "session-2" });
  assert.equal(created.deckOptions.clampInt(500, 80, 40, 160), 160);

  assert.equal(created.appLayoutOptions.getLayoutRuntimeController(), layoutRuntimeController);
  assert.equal(created.appLayoutOptions.getDeckRuntimeController(), deckRuntimeController);
  assert.equal(created.appLayoutOptions.getSessionTerminalResizeController().id, "terminal-resize");
  assert.equal(created.appLayoutOptions.getSessionSettingsDialogController().id, "settings-dialog");
  assert.equal(created.appLayoutOptions.getDeckActionsController().id, "deck-actions");
  assert.deepEqual(created.appLayoutOptions.getTerminalSettings(), { cols: 100, rows: 25 });
  assert.equal(created.appLayoutOptions.clearUiError(), "cleared");
});

test("app runtime layout foundation assembly falls back safely for missing optional collaborators", () => {
  const assembly = createAppRuntimeLayoutFoundationAssembly({
    createAppSessionRuntimeFacadeController() {
      return {};
    },
    createLayoutRuntimeController() {
      return {
        loadTerminalSettings() {
          return null;
        },
        loadSessionInputSettings() {
          return {};
        }
      };
    },
    createDeckRuntimeController() {
      return {};
    },
    createAppLayoutDeckFacadeController() {
      return {};
    }
  });

  assert.equal(typeof assembly, "object");
  assert.deepEqual(assembly.stateRef, {
    terminalSettings: null,
    sessionInputSettings: {}
  });
});
