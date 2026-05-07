import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeOperatorControllerAssembly } from "../src/public/app-runtime-operator-controller-assembly.js";

test("app runtime operator controller assembly wires control, layout, connection, and workspace controllers", () => {
  const state = {
    activeDeckId: "ops",
    activeSessionId: "s-1",
    decks: [{ id: "ops", name: "Ops" }],
    sessions: [
      { id: "s-1", deckId: "ops", name: "Alpha" },
      { id: "s-2", deckId: "ops", name: "Beta" }
    ]
  };

  let controlPaneArgs = null;
  let layoutArgs = null;
  let connectionArgs = null;
  let workspaceArgs = null;
  let latestControlPaneState = { dock: "right" };

  const controlPaneRuntimeController = {
    getState() {
      return latestControlPaneState;
    },
    setState(nextState) {
      latestControlPaneState = nextState;
      return nextState;
    }
  };
  const layoutProfileRuntimeController = {
    getSelectedProfileId() {
      return "layout-1";
    },
    listProfiles() {
      return [{ id: "layout-1", name: "Ops Layout" }];
    },
    applyProfileById(profileId) {
      return `apply:${profileId}`;
    }
  };
  const connectionProfileRuntimeController = { id: "connection-profile" };
  const workspacePresetRuntimeController = { id: "workspace-preset" };

  const assembly = createAppRuntimeOperatorControllerAssembly({
    windowRef: {},
    documentRef: {},
    store: {
      getState() {
        return state;
      },
      setActiveSession(sessionId) {
        state.activeSessionId = sessionId;
      }
    },
    api: { id: "api" },
    layoutProfileSelectEl: { id: "layout-select" },
    connectionProfileSelectEl: { id: "connection-select" },
    workspacePresetSelectEl: { id: "preset-select" },
    workspacePresetGroupSelectEl: { id: "group-select" },
    connectionProfileRemoteHostEl: { id: "remote-host" },
    appLayoutDeckFacadeController: {
      getSessionFilterText() {
        return "filter";
      },
      getDeckTerminalGeometry(deckId) {
        return deckId === "ops" ? { cols: 120, rows: 40 } : null;
      },
      getDeckById(deckId) {
        return deckId === "ops" ? { id: "ops", name: "Ops" } : null;
      },
      setSessionFilterText(value) {
        return value;
      },
      setSidebarVisible(visible) {
        return visible;
      },
      setActiveDeck(deckId) {
        return deckId === "ops";
      },
      scheduleGlobalResize() {
        return "global";
      },
      scheduleDeferredResizePasses() {
        return "deferred";
      }
    },
    appSessionRuntimeFacadeController: {
      applyRuntimeEvent() {
        return true;
      },
      getSessionById(sessionId) {
        return state.sessions.find((session) => session.id === sessionId) || null;
      },
      formatSessionToken(sessionId) {
        return sessionId === "s-1" ? "1" : "?";
      },
      formatSessionDisplayName(session) {
        return session?.name || "";
      },
      resolveSessionDeckId(session) {
        return session?.deckId || "default";
      },
      sortSessionsByQuickId(sessions) {
        return sessions.slice().reverse();
      }
    },
    appCommandUiFacadeController: {
      setCommandFeedback(message) {
        return message;
      },
      setError(message) {
        return message;
      },
      getErrorMessage(error, fallback) {
        return error?.message || fallback;
      },
      render() {
        return "rendered";
      }
    },
    actionDialogController: {
      requestText(options) {
        return options?.label || "";
      },
      requestSecret(options) {
        return options?.label || "";
      },
      confirm(options) {
        return options?.label || "";
      }
    },
    sessionUiFacadeController: {
      normalizeThemeProfile(value) {
        return value && typeof value === "object" ? { ...value, normalized: true } : {};
      }
    },
    splitLayoutRuntimeController: {
      captureDeckSplitLayouts() {
        return { ops: { kind: "split" } };
      },
      replaceDeckSplitLayouts(nextLayouts) {
        return nextLayouts;
      }
    },
    commandTargetRuntimeController: {
      resolveFilterSelectors(selectorText, sessions) {
        return { selectorText, sessions, error: "" };
      }
    },
    getTerminalSettings: () => ({ sidebarVisible: true }),
    terminalThemePresets: [{ id: "default" }],
    defaultTerminalTheme: { background: "#000000" },
    defaultDeckId: "default",
    createControlPaneRuntimeController(args) {
      controlPaneArgs = args;
      return controlPaneRuntimeController;
    },
    createLayoutProfileRuntimeController(args) {
      layoutArgs = args;
      return layoutProfileRuntimeController;
    },
    createConnectionProfileRuntimeController(args) {
      connectionArgs = args;
      return connectionProfileRuntimeController;
    },
    createWorkspacePresetRuntimeController(args) {
      workspaceArgs = args;
      return workspacePresetRuntimeController;
    }
  });

  assert.equal(assembly.controlPaneRuntimeController, controlPaneRuntimeController);
  assert.equal(assembly.layoutProfileRuntimeController, layoutProfileRuntimeController);
  assert.equal(assembly.connectionProfileRuntimeController, connectionProfileRuntimeController);
  assert.equal(assembly.workspacePresetRuntimeController, workspacePresetRuntimeController);

  assert.equal(controlPaneArgs.workspaceShellEl, null);
  assert.deepEqual(layoutArgs.getDecks(), state.decks);
  assert.equal(layoutArgs.getActiveDeckId(), "ops");
  assert.deepEqual(layoutArgs.getControlPaneState(), { dock: "right" });
  assert.deepEqual(layoutArgs.getDeckTerminalGeometry("ops"), { cols: 120, rows: 40 });
  assert.equal(layoutArgs.setActiveDeck("ops"), true);
  assert.deepEqual(layoutArgs.setControlPaneState({ dock: "left" }), { dock: "left" });
  assert.deepEqual(layoutArgs.getControlPaneState(), { dock: "left" });

  assert.deepEqual(connectionArgs.getDecks(), state.decks);
  assert.deepEqual(connectionArgs.getSessions(), state.sessions);
  assert.equal(connectionArgs.getActiveSessionId(), "s-1");
  connectionArgs.setActiveSession("s-2");
  assert.equal(state.activeSessionId, "s-2");
  assert.deepEqual(connectionArgs.normalizeThemeProfile({ background: "#111111" }), {
    background: "#111111",
    normalized: true
  });
  assert.equal(connectionArgs.formatSessionToken("s-1"), "1");

  assert.deepEqual(workspaceArgs.getDecks(), state.decks);
  assert.deepEqual(workspaceArgs.getSessions(), state.sessions);
  assert.equal(workspaceArgs.getActiveDeckId(), "ops");
  assert.deepEqual(workspaceArgs.getControlPaneState(), { dock: "left" });
  assert.equal(workspaceArgs.getSelectedLayoutProfileId(), "layout-1");
  assert.deepEqual(workspaceArgs.listLayoutProfiles(), [{ id: "layout-1", name: "Ops Layout" }]);
  assert.equal(workspaceArgs.applyLayoutProfileById("layout-1"), "apply:layout-1");
  assert.deepEqual(workspaceArgs.resolveFilterSelectors("ops", state.sessions), {
    selectorText: "ops",
    sessions: state.sessions,
    error: ""
  });
});

test("app runtime operator controller assembly fails closed for missing facades and state", () => {
  let layoutArgs = null;
  let connectionArgs = null;
  let workspaceArgs = null;

  createAppRuntimeOperatorControllerAssembly({
    createControlPaneRuntimeController() {
      return {};
    },
    createLayoutProfileRuntimeController(args) {
      layoutArgs = args;
      return {};
    },
    createConnectionProfileRuntimeController(args) {
      connectionArgs = args;
      return {};
    },
    createWorkspacePresetRuntimeController(args) {
      workspaceArgs = args;
      return {};
    }
  });

  assert.deepEqual(layoutArgs.getDecks(), []);
  assert.equal(layoutArgs.getActiveDeckId(), "default");
  assert.deepEqual(layoutArgs.getDeckTerminalGeometry("missing"), { cols: 80, rows: 20 });
  assert.deepEqual(layoutArgs.getControlPaneState(), {});

  assert.deepEqual(connectionArgs.getDecks(), []);
  assert.deepEqual(connectionArgs.getSessions(), []);
  assert.equal(connectionArgs.getActiveSessionId(), "");
  assert.deepEqual(connectionArgs.normalizeThemeProfile("invalid"), {});
  assert.equal(connectionArgs.defaultDeckId, "default");

  assert.deepEqual(workspaceArgs.getDecks(), []);
  assert.deepEqual(workspaceArgs.getSessions(), []);
  assert.equal(workspaceArgs.getActiveDeckId(), "default");
  assert.deepEqual(workspaceArgs.resolveFilterSelectors("missing", null), {
    sessions: [],
    error: ""
  });
  assert.equal(workspaceArgs.getSelectedLayoutProfileId(), "");
  assert.deepEqual(workspaceArgs.listLayoutProfiles(), []);
  assert.equal(workspaceArgs.applyLayoutProfileById("missing"), "");
});
