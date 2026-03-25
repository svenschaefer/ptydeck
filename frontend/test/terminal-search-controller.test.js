import test from "node:test";
import assert from "node:assert/strict";

import { createTerminalSearchController } from "../src/public/ui/terminal-search-controller.js";

function createTerminalFixture(lines, rows = 6) {
  return {
    rows,
    scrollCalls: [],
    clearSelectionCalls: 0,
    selected: null,
    buffer: {
      active: {
        baseY: Math.max(lines.length - rows, 0),
        length: lines.length,
        getLine(index) {
          const text = lines[index];
          if (typeof text !== "string") {
            return null;
          }
          return {
            translateToString() {
              return text;
            }
          };
        }
      }
    },
    scrollToLine(line) {
      this.scrollCalls.push(line);
    },
    clearSelection() {
      this.clearSelectionCalls += 1;
      this.selected = null;
    },
    select(column, row, length) {
      this.selected = { column, row, length };
    }
  };
}

function createElement(initial = {}) {
  const listeners = new Map();
  return {
    value: initial.value || "",
    textContent: initial.textContent || "",
    disabled: initial.disabled === true,
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      listeners.set(
        type,
        handlers.filter((entry) => entry !== handler)
      );
    },
    dispatchEvent(event = {}) {
      const handlers = listeners.get(event.type) || [];
      for (const handler of handlers) {
        handler(event);
      }
    },
    click() {
      this.dispatchEvent({ type: "click" });
    }
  };
}

function createState() {
  return {
    query: "",
    sessionId: "",
    selectedSessionId: "",
    matches: [],
    activeIndex: -1,
    revision: -1,
    wrapped: false,
    direction: "next",
    missingActiveSession: false
  };
}

test("terminal-search controller syncs active terminal matches and preserves selection across revisions", () => {
  const terminal = createTerminalFixture(["alpha beta", "gamma alpha"], 4);
  const state = createState();
  const inputEl = createElement();
  const prevBtn = createElement();
  const nextBtn = createElement();
  const clearBtn = createElement();
  const statusEl = createElement();
  const terminals = new Map([["s1", { terminal, searchRevision: 1 }]]);
  const controller = createTerminalSearchController({
    terminalSearchState: state,
    terminals,
    inputEl,
    prevBtn,
    nextBtn,
    clearBtn,
    statusEl,
    getActiveSessionId: () => "s1"
  });

  state.query = " alpha ";
  controller.syncActiveTerminalSearch({ preserveSelection: false });

  assert.equal(state.query, "alpha");
  assert.equal(state.sessionId, "s1");
  assert.equal(state.matches.length, 2);
  assert.equal(state.activeIndex, 0);
  assert.equal(state.selectedSessionId, "s1");
  assert.equal(statusEl.textContent, "Match 1/2");
  assert.equal(prevBtn.disabled, false);
  assert.equal(nextBtn.disabled, false);
  assert.equal(clearBtn.disabled, false);
  assert.deepEqual(terminal.selected, { column: 0, row: 0, length: 5 });

  controller.navigateActiveTerminalSearch("next");
  assert.equal(state.activeIndex, 1);
  assert.deepEqual(terminal.selected, { column: 6, row: 1, length: 5 });

  terminals.get("s1").searchRevision = 2;
  controller.syncActiveTerminalSearch({ preserveSelection: true });
  assert.equal(state.activeIndex, 1);
  assert.deepEqual(terminal.selected, { column: 6, row: 1, length: 5 });
});

test("terminal-search controller reports wrapped navigation in status text", () => {
  const terminal = createTerminalFixture(["alpha beta", "gamma alpha"], 4);
  const state = createState();
  const statusEl = createElement();
  const controller = createTerminalSearchController({
    terminalSearchState: state,
    terminals: new Map([["s1", { terminal, searchRevision: 1 }]]),
    statusEl,
    getActiveSessionId: () => "s1"
  });

  state.query = "alpha";
  controller.syncActiveTerminalSearch({ preserveSelection: false });
  controller.navigateActiveTerminalSearch("next");
  controller.navigateActiveTerminalSearch("next");
  assert.equal(statusEl.textContent, "Wrapped to next match (Match 1/2).");

  controller.navigateActiveTerminalSearch("previous");
  assert.equal(statusEl.textContent, "Wrapped to previous match (Match 2/2).");
});

test("terminal-search controller binds input controls for search, navigation, and clear", () => {
  const terminal = createTerminalFixture(["alpha beta", "gamma alpha"], 4);
  const state = createState();
  const inputEl = createElement();
  const prevBtn = createElement();
  const nextBtn = createElement();
  const clearBtn = createElement();
  const statusEl = createElement();
  const controller = createTerminalSearchController({
    terminalSearchState: state,
    terminals: new Map([["s1", { terminal, searchRevision: 1 }]]),
    inputEl,
    prevBtn,
    nextBtn,
    clearBtn,
    statusEl,
    getActiveSessionId: () => "s1"
  });

  controller.bindUiEvents();
  controller.updateUi();

  inputEl.value = "alpha";
  inputEl.dispatchEvent({ type: "input" });
  assert.equal(statusEl.textContent, "Match 1/2");

  nextBtn.click();
  assert.equal(statusEl.textContent, "Match 2/2");

  const enterEvent = {
    type: "keydown",
    key: "Enter",
    shiftKey: true,
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    }
  };
  inputEl.dispatchEvent(enterEvent);
  assert.equal(enterEvent.preventDefaultCalled, true);
  assert.equal(statusEl.textContent, "Match 1/2");

  const escapeEvent = {
    type: "keydown",
    key: "Escape",
    preventDefaultCalled: false,
    preventDefault() {
      this.preventDefaultCalled = true;
    }
  };
  inputEl.dispatchEvent(escapeEvent);
  assert.equal(escapeEvent.preventDefaultCalled, true);
  assert.equal(state.query, "");
  assert.equal(inputEl.value, "");
  assert.equal(statusEl.textContent, "");
  assert.equal(clearBtn.disabled, true);
});
