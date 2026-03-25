import test from "node:test";
import assert from "node:assert/strict";

import { createLayoutRuntimeController } from "../src/public/layout-runtime-controller.js";

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
  return {
    getItem(key) {
      return data.has(String(key)) ? data.get(String(key)) : null;
    },
    setItem(key, value) {
      data.set(String(key), String(value));
    },
    removeItem(key) {
      data.delete(String(key));
    },
    dump() {
      return new Map(data);
    }
  };
}

function createEventTarget(value = "") {
  return {
    value,
    hidden: false,
    listeners: new Map(),
    addEventListener(type, handler) {
      const next = this.listeners.get(type) || [];
      next.push(handler);
      this.listeners.set(type, next);
    },
    dispatch(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) {
        handler({
          type,
          preventDefault() {},
          ...event
        });
      }
    },
    click() {
      this.dispatch("click");
    }
  };
}

test("layout runtime controller loads and persists terminal/session input settings", () => {
  const localStorageRef = createStorage({
    "ptydeck.settings.v1": JSON.stringify({
      cols: 500,
      rows: 2,
      sidebarVisible: false
    }),
    "ptydeck.session-input-settings.v1": JSON.stringify({
      "s-1": { sendTerminator: "lf" },
      "s-2": { sendTerminator: "invalid" }
    }),
    "ptydeck.session-filter.v1": " ops "
  });
  let terminalSettings = { cols: 80, rows: 20, sidebarVisible: true };
  let sessionInputSettings = {};

  const controller = createLayoutRuntimeController({
    localStorageRef,
    sendTerminatorModeSet: new Set(["auto", "lf", "crlf"]),
    getTerminalSettings: () => terminalSettings,
    setTerminalSettings: (next) => {
      terminalSettings = next;
    },
    getSessionInputSettings: () => sessionInputSettings,
    setSessionInputSettings: (next) => {
      sessionInputSettings = next;
    }
  });

  assert.deepEqual(controller.loadTerminalSettings(), {
    cols: 400,
    rows: 5,
    sidebarVisible: false
  });
  assert.equal(controller.loadStoredSessionFilterText(), "ops");
  assert.deepEqual(controller.loadSessionInputSettings(), {
    "s-1": { sendTerminator: "lf" },
    "s-2": { sendTerminator: "auto" }
  });

  sessionInputSettings = controller.loadSessionInputSettings();
  controller.setSessionSendTerminator("s-2", "crlf");
  assert.equal(controller.getSessionSendTerminator("s-2"), "crlf");
  assert.match(localStorageRef.getItem("ptydeck.session-input-settings.v1") || "", /"crlf"/);

  terminalSettings = { cols: 58, rows: 40, sidebarVisible: true };
  controller.saveTerminalSettings();
  assert.deepEqual(JSON.parse(localStorageRef.getItem("ptydeck.settings.v1") || "{}"), terminalSettings);

  controller.saveStoredSessionFilterText("");
  assert.equal(localStorageRef.getItem("ptydeck.session-filter.v1"), null);
});

test("layout runtime controller toggles sidebar state and syncs layout UI", () => {
  const syncCalls = [];
  const resizeCalls = [];
  let terminalSettings = { cols: 80, rows: 20, sidebarVisible: true };

  const controller = createLayoutRuntimeController({
    localStorageRef: createStorage(),
    getTerminalSettings: () => terminalSettings,
    setTerminalSettings: (next) => {
      terminalSettings = next;
    },
    scheduleGlobalResize: (payload) => resizeCalls.push(payload || null),
    getLayoutSettingsController: () => ({
      syncSettingsUi(settings) {
        syncCalls.push(settings);
      }
    })
  });

  assert.equal(controller.setSidebarVisible(false), true);
  assert.equal(terminalSettings.sidebarVisible, false);
  assert.equal(syncCalls.length, 1);
  assert.deepEqual(syncCalls[0], { cols: 80, rows: 20, sidebarVisible: false });
  assert.equal(resizeCalls.length, 1);

  assert.equal(controller.setSidebarVisible(false), false);
  assert.equal(resizeCalls.length, 1);
});

test("layout runtime controller binds UI events and applies deck terminal settings", async () => {
  const sidebarToggleBtn = createEventTarget();
  const sidebarLauncherBtn = createEventTarget();
  const settingsApplyBtn = createEventTarget();
  const settingsColsEl = createEventTarget("121");
  const settingsRowsEl = createEventTarget("33");
  const applyCalls = [];
  const runtimeEvents = [];
  const resizeCalls = [];
  const feedback = [];
  const errors = [];
  const renderCalls = [];
  let terminalSettings = { cols: 80, rows: 20, sidebarVisible: true };
  const activeDeck = { id: "ops", name: "Ops", settings: { terminal: { cols: 80, rows: 20 } } };

  const controller = createLayoutRuntimeController({
    localStorageRef: createStorage(),
    getTerminalSettings: () => terminalSettings,
    setTerminalSettings: (next) => {
      terminalSettings = next;
    },
    getActiveDeck: () => activeDeck,
    api: {
      async updateDeck(deckId, payload) {
        applyCalls.push({ deckId, payload });
        return {
          ...activeDeck,
          settings: payload.settings
        };
      }
    },
    applyRuntimeEvent: (event, options) => runtimeEvents.push({ event, options }),
    applySettingsToAllTerminals: (payload) => resizeCalls.push({ type: "apply", payload }),
    scheduleGlobalResize: (payload) => resizeCalls.push({ type: "resize", payload }),
    render: () => renderCalls.push("render"),
    setCommandFeedback: (message) => feedback.push(message),
    setError: (message) => errors.push(message),
    getErrorMessage: (error, fallback) => error?.message || fallback,
    settingsApplyBtn,
    settingsColsEl,
    settingsRowsEl,
    sidebarToggleBtn,
    sidebarLauncherBtn,
    getLayoutSettingsController: () => ({
      readSettingsFromUi(currentSettings) {
        return {
          cols: Number(settingsColsEl.value || currentSettings.cols),
          rows: Number(settingsRowsEl.value || currentSettings.rows),
          sidebarVisible: terminalSettings.sidebarVisible !== false
        };
      },
      syncSettingsUi() {}
    })
  });

  controller.bindUiEvents();
  sidebarToggleBtn.click();
  assert.equal(terminalSettings.sidebarVisible, false);
  sidebarLauncherBtn.click();
  assert.equal(terminalSettings.sidebarVisible, true);

  settingsApplyBtn.click();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(applyCalls.length, 1);
  assert.deepEqual(applyCalls[0], {
    deckId: "ops",
    payload: {
      settings: {
        terminal: {
          cols: 121,
          rows: 33
        }
      }
    }
  });
  assert.equal(runtimeEvents.length, 1);
  assert.equal(runtimeEvents[0].event.type, "deck.updated");
  assert.deepEqual(runtimeEvents[0].options, { preferredActiveDeckId: "ops" });
  assert.deepEqual(
    resizeCalls.map((entry) => entry.payload),
    [
      undefined,
      undefined,
      { deckId: "ops", force: true },
      { deckId: "ops", force: true }
    ]
  );
  assert.equal(renderCalls.length, 1);
  assert.deepEqual(feedback, ["Deck size set to 121x33 for 'Ops'."]);
  assert.deepEqual(errors, []);

  settingsColsEl.value = "122";
  settingsRowsEl.value = "34";
  settingsRowsEl.dispatch("keydown", { key: "Enter" });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(applyCalls.length, 2);
  assert.equal(applyCalls[1].payload.settings.terminal.cols, 122);
  assert.equal(applyCalls[1].payload.settings.terminal.rows, 34);
});
