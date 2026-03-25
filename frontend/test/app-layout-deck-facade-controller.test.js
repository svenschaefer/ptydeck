import test from "node:test";
import assert from "node:assert/strict";

import { createAppLayoutDeckFacadeController } from "../src/public/app-layout-deck-facade-controller.js";

test("app-layout-deck facade delegates layout, deck, dialog, resize, and deck-action flows", async () => {
  const calls = [];
  const store = {
    state: { sessionFilterText: "ops" },
    getState() {
      return this.state;
    },
    setSessionFilterText(value) {
      this.state.sessionFilterText = String(value || "");
      calls.push(["set-filter", this.state.sessionFilterText]);
    }
  };
  const layoutRuntimeController = {
    clampInt(value, fallback, min, max) {
      calls.push(["clamp", value, fallback, min, max]);
      return 55;
    },
    saveTerminalSettings() {
      calls.push(["save-settings"]);
    },
    loadStoredSessionFilterText() {
      calls.push(["load-filter"]);
      return "restored";
    },
    saveStoredSessionFilterText(value) {
      calls.push(["persist-filter", value]);
    },
    normalizeSendTerminatorMode(value) {
      calls.push(["normalize-terminator", value]);
      return "crlf";
    },
    getSessionSendTerminator(sessionId) {
      calls.push(["get-terminator", sessionId]);
      return "lf";
    },
    setSessionSendTerminator(sessionId, mode) {
      calls.push(["set-terminator", sessionId, mode]);
    },
    measureTerminalCellWidthPx() {
      calls.push(["measure-width"]);
      return 11;
    },
    computeFixedMountHeightPx(rows) {
      calls.push(["mount-height", rows]);
      return 444;
    },
    computeFixedCardWidthPx(cols) {
      calls.push(["card-width", cols]);
      return 555;
    },
    syncTerminalGeometryCss() {
      calls.push(["sync-geometry"]);
    },
    syncSettingsUi() {
      calls.push(["sync-settings-ui"]);
    },
    readSettingsFromUi() {
      calls.push(["read-settings"]);
      return { cols: 90, rows: 30, sidebarVisible: true };
    },
    async applyTerminalSizeSettings(cols, rows) {
      calls.push(["apply-size", cols, rows]);
      return { cols, rows };
    },
    async onApplySettings() {
      calls.push(["apply-settings"]);
      return "applied";
    },
    setSidebarVisible(visible) {
      calls.push(["sidebar", visible]);
      return visible;
    }
  };
  const deckRuntimeController = {
    getDeckById(deckId) {
      calls.push(["get-deck", deckId]);
      return { id: deckId, name: "Deck A" };
    },
    getActiveDeck() {
      calls.push(["active-deck"]);
      return { id: "deck-a" };
    },
    getDeckTerminalGeometry(deckId) {
      calls.push(["deck-geometry", deckId]);
      return { cols: 120, rows: 40 };
    },
    getSessionTerminalGeometry(sessionId) {
      calls.push(["session-geometry", sessionId]);
      return { cols: 58, rows: 20 };
    },
    setDecks(decks, options) {
      calls.push(["set-decks", decks.length, options.preferredActiveDeckId]);
    },
    upsertDeckInState(deck, options) {
      calls.push(["upsert-deck", deck.id, options.preferredActiveDeckId]);
    },
    removeDeckFromState(deckId, options) {
      calls.push(["remove-deck", deckId, options.fallbackDeckId]);
    },
    getSessionCountForDeck(deckId, sessions) {
      calls.push(["count-deck", deckId, sessions.length]);
      return 3;
    },
    renderDeckTabs(sessions) {
      calls.push(["render-tabs", sessions.length]);
    },
    setActiveDeck(deckId) {
      calls.push(["set-active-deck", deckId]);
      return true;
    }
  };
  const resizeController = {
    applySettingsToAllTerminals(options) {
      calls.push(["apply-all", options.force]);
    },
    applyResizeForSession(sessionId, options) {
      calls.push(["apply-resize", sessionId, options.force]);
    },
    scheduleGlobalResize(options) {
      calls.push(["global-resize", options.force]);
    },
    scheduleDeferredResizePasses(options) {
      calls.push(["deferred-resize", options.reason]);
    }
  };
  const dialogController = {
    open(dialog) {
      calls.push(["dialog-open", dialog.id]);
    },
    close(dialog) {
      calls.push(["dialog-close", dialog.id]);
    },
    confirmSessionDelete(session) {
      calls.push(["dialog-confirm", session.id]);
      return true;
    },
    toggle(dialog) {
      calls.push(["dialog-toggle", dialog.id]);
    }
  };
  const deckActionsController = {
    async createDeckFlow() {
      calls.push(["deck-create"]);
    },
    async renameDeckFlow() {
      calls.push(["deck-rename"]);
    },
    async deleteDeckFlow() {
      calls.push(["deck-delete"]);
    }
  };
  const controller = createAppLayoutDeckFacadeController({
    store,
    getLayoutRuntimeController: () => layoutRuntimeController,
    getDeckRuntimeController: () => deckRuntimeController,
    getSessionTerminalResizeController: () => resizeController,
    getSessionSettingsDialogController: () => dialogController,
    getDeckActionsController: () => deckActionsController,
    getTerminalSettings: () => ({ cols: 80, rows: 20, sidebarVisible: false }),
    clearUiError: () => calls.push(["clear-error"])
  });

  assert.equal(controller.clampInt("x", 12, 1, 20), 55);
  controller.saveTerminalSettings();
  assert.equal(controller.getSessionFilterText(), "ops");
  controller.setSessionFilterText("deck:ops");
  assert.deepEqual(controller.getDeckById("deck-a"), { id: "deck-a", name: "Deck A" });
  assert.equal(controller.resolveDeckName("deck-a"), "Deck A");
  assert.deepEqual(controller.getActiveDeck(), { id: "deck-a" });
  assert.deepEqual(controller.getDeckTerminalGeometry("deck-a"), { cols: 120, rows: 40 });
  assert.deepEqual(controller.getSessionTerminalGeometry("s1"), { cols: 58, rows: 20 });
  controller.setDecks([{ id: "deck-a" }], { preferredActiveDeckId: "deck-a" });
  controller.upsertDeckInState({ id: "deck-b" }, { preferredActiveDeckId: "deck-b" });
  controller.removeDeckFromState("deck-b", { fallbackDeckId: "default" });
  assert.equal(controller.normalizeSendTerminatorMode("CRLF"), "crlf");
  assert.equal(controller.loadStoredSessionFilterText(), "restored");
  controller.saveStoredSessionFilterText("deck:ops");
  assert.equal(controller.getSessionSendTerminator("s1"), "lf");
  controller.setSessionSendTerminator("s1", "crlf");
  assert.equal(controller.measureTerminalCellWidthPx(), 11);
  assert.equal(controller.computeFixedMountHeightPx(40), 444);
  assert.equal(controller.computeFixedCardWidthPx(80), 555);
  controller.syncTerminalGeometryCss();
  controller.syncSettingsUi();
  assert.deepEqual(controller.readSettingsFromUi(), { cols: 90, rows: 30, sidebarVisible: true });
  assert.deepEqual(await controller.applyTerminalSizeSettings(100, 50), { cols: 100, rows: 50 });
  controller.applySettingsToAllTerminals({ force: true });
  controller.applyResizeForSession("s1", { force: true });
  assert.equal(await controller.onApplySettings(), "applied");
  assert.equal(controller.setSidebarVisible(false), false);
  controller.scheduleGlobalResize({ force: true });
  controller.openSettingsDialog({ id: "d1" });
  controller.closeSettingsDialog({ id: "d1" });
  assert.equal(controller.confirmSessionDelete({ id: "s1" }), true);
  controller.toggleSettingsDialog({ id: "d1" });
  controller.scheduleDeferredResizePasses({ reason: "show" });
  assert.equal(controller.getSessionCountForDeck("deck-a", [{ id: "s1" }]), 3);
  controller.renderDeckTabs([{ id: "s1" }]);
  assert.equal(controller.setActiveDeck("deck-a"), true);
  await controller.createDeckFlow();
  await controller.renameDeckFlow();
  await controller.deleteDeckFlow();

  assert.deepEqual(calls, [
    ["clamp", "x", 12, 1, 20],
    ["save-settings"],
    ["set-filter", "deck:ops"],
    ["persist-filter", "deck:ops"],
    ["get-deck", "deck-a"],
    ["get-deck", "deck-a"],
    ["active-deck"],
    ["deck-geometry", "deck-a"],
    ["session-geometry", "s1"],
    ["set-decks", 1, "deck-a"],
    ["upsert-deck", "deck-b", "deck-b"],
    ["remove-deck", "deck-b", "default"],
    ["normalize-terminator", "CRLF"],
    ["load-filter"],
    ["persist-filter", "deck:ops"],
    ["get-terminator", "s1"],
    ["set-terminator", "s1", "crlf"],
    ["measure-width"],
    ["mount-height", 40],
    ["card-width", 80],
    ["sync-geometry"],
    ["sync-settings-ui"],
    ["read-settings"],
    ["clear-error"],
    ["apply-size", 100, 50],
    ["apply-all", true],
    ["apply-resize", "s1", true],
    ["apply-settings"],
    ["sidebar", false],
    ["global-resize", true],
    ["dialog-open", "d1"],
    ["dialog-close", "d1"],
    ["dialog-confirm", "s1"],
    ["dialog-toggle", "d1"],
    ["deferred-resize", "show"],
    ["count-deck", "deck-a", 1],
    ["render-tabs", 1],
    ["set-active-deck", "deck-a"],
    ["deck-create"],
    ["deck-rename"],
    ["deck-delete"]
  ]);
});

test("app-layout-deck facade falls back safely when controllers are missing", async () => {
  const store = {
    getState() {
      return { sessionFilterText: "" };
    },
    setSessionFilterText() {}
  };
  const controller = createAppLayoutDeckFacadeController({
    store,
    getTerminalSettings: () => ({ cols: 77, rows: 19, sidebarVisible: false }),
    defaultTerminalCols: 80,
    defaultTerminalRows: 20,
    terminalFontSize: 16,
    terminalLineHeight: 1.2
  });

  assert.equal(controller.clampInt("x", 12, 1, 20), 12);
  assert.equal(controller.getSessionFilterText(), "");
  assert.equal(controller.resolveDeckName("deck-x"), "deck-x");
  assert.deepEqual(controller.getDeckTerminalGeometry("deck-x"), { cols: 80, rows: 20 });
  assert.deepEqual(controller.getSessionTerminalGeometry("s1"), { cols: 80, rows: 20 });
  assert.equal(controller.normalizeSendTerminatorMode("bogus"), "auto");
  assert.equal(controller.loadStoredSessionFilterText(), "");
  assert.equal(controller.getSessionSendTerminator("s1"), "auto");
  assert.equal(controller.measureTerminalCellWidthPx(), 10);
  assert.equal(controller.computeFixedMountHeightPx(20), 384);
  assert.equal(controller.computeFixedCardWidthPx(77), 770);
  assert.deepEqual(controller.readSettingsFromUi(), { cols: 77, rows: 19, sidebarVisible: false });
  assert.equal(await controller.applyTerminalSizeSettings(80, 24), undefined);
  assert.equal(await controller.onApplySettings(), undefined);
  assert.equal(controller.setSidebarVisible(true), undefined);
  assert.equal(controller.confirmSessionDelete({ id: "s1" }), true);
  assert.equal(controller.getSessionCountForDeck("deck-a", []), 0);
  assert.equal(controller.setActiveDeck("deck-a"), false);
  await controller.createDeckFlow();
  await controller.renameDeckFlow();
  await controller.deleteDeckFlow();
});
