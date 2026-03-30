import test from "node:test";
import assert from "node:assert/strict";

import { createSessionTerminalResizeController } from "../src/public/ui/session-terminal-resize-controller.js";

function createFakeWindow() {
  let nextId = 1;
  const scheduled = [];
  const cleared = [];
  return {
    scheduled,
    cleared,
    setTimeout(fn, delay) {
      const token = nextId++;
      scheduled.push({ token, delay, fn });
      return token;
    },
    clearTimeout(token) {
      cleared.push(token);
    }
  };
}

test("session-terminal-resize controller resizes terminal, updates mount geometry, and schedules remote resize", async () => {
  const windowRef = createFakeWindow();
  const apiCalls = [];
  const debugCalls = [];
  const terminals = new Map([
    [
      "s1",
      {
        mount: { clientWidth: 640, clientHeight: 320, style: {} },
        element: { style: {} },
        terminal: {
          resize(cols, rows) {
            debugCalls.push(`resize:${cols}x${rows}`);
          }
        }
      }
    ]
  ]);
  const resizeTimers = new Map();
  const terminalSizes = new Map();

  const controller = createSessionTerminalResizeController({
    windowRef,
    terminals,
    resizeTimers,
    terminalSizes,
    getSessionById: (sessionId) => ({ id: sessionId, deckId: "d1" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionTerminalGeometry: () => ({ cols: 80, rows: 24 }),
    computeFixedMountHeightPx: (rows) => rows * 10,
    computeFixedCardWidthPx: (cols) => cols * 5 + 20,
    getTerminalCellHeightPx: () => 10,
    terminalCardHorizontalChromePx: 20,
    debugLog: (event, payload) => debugCalls.push(`${event}:${payload.sessionId}:${payload.cols}x${payload.rows}`),
    api: {
      resizeSession(sessionId, cols, rows) {
        apiCalls.push(`${sessionId}:${cols}x${rows}`);
        return Promise.resolve();
      }
    }
  });

  controller.applyResizeForSession("s1");

  assert.deepEqual(terminalSizes.get("s1"), { cols: 80, rows: 24 });
  assert.equal(terminals.get("s1").mount.style.height, "240px");
  assert.equal(terminals.get("s1").mount.style.width, "400px");
  assert.equal(terminals.get("s1").element.style.width, "420px");
  assert.deepEqual(debugCalls, [
    "resize:80x24",
    "terminal.resize.local:s1:80x24"
  ]);
  assert.equal(windowRef.scheduled.length, 1);
  assert.equal(windowRef.scheduled[0].delay, 180);

  await windowRef.scheduled[0].fn();

  assert.deepEqual(apiCalls, ["s1:80x24"]);
  assert.equal(debugCalls.at(-1), "terminal.resize.remote.start:s1:80x24");
});

test("session-terminal-resize controller clears pending resize timers for blocked sessions", () => {
  const windowRef = createFakeWindow();
  const resizeTimers = new Map([["s1", 77]]);
  const terminalSizes = new Map();
  const controller = createSessionTerminalResizeController({
    windowRef,
    terminals: new Map([
      [
        "s1",
        {
          mount: { clientWidth: 640, clientHeight: 320, style: {} },
          element: { style: {} },
          terminal: { resize() {} }
        }
      ]
    ]),
    resizeTimers,
    terminalSizes,
    getSessionById: (sessionId) => ({ id: sessionId }),
    isSessionActionBlocked: () => true
  });

  controller.applyResizeForSession("s1");

  assert.deepEqual(windowRef.cleared, [77]);
  assert.equal(resizeTimers.has("s1"), false);
  assert.equal(terminalSizes.has("s1"), false);
});

test("session-terminal-resize controller scopes scheduled global resize passes by deck", () => {
  const windowRef = createFakeWindow();
  const resized = [];
  const terminals = new Map([
    [
      "s1",
      {
        mount: { clientWidth: 640, clientHeight: 320, style: {} },
        element: { style: {} },
        terminal: { resize(cols, rows) { resized.push(`s1:${cols}x${rows}`); } }
      }
    ],
    [
      "s2",
      {
        mount: { clientWidth: 640, clientHeight: 320, style: {} },
        element: { style: {} },
        terminal: { resize(cols, rows) { resized.push(`s2:${cols}x${rows}`); } }
      }
    ]
  ]);
  const sessions = new Map([
    ["s1", { id: "s1", deckId: "d1" }],
    ["s2", { id: "s2", deckId: "d2" }]
  ]);

  const controller = createSessionTerminalResizeController({
    windowRef,
    terminals,
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    getSessionById: (sessionId) => sessions.get(sessionId),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionTerminalGeometry: () => ({ cols: 90, rows: 30 }),
    computeFixedMountHeightPx: (rows) => rows * 10,
    computeFixedCardWidthPx: (cols) => cols * 5 + 20,
    getTerminalCellHeightPx: () => 10,
    terminalCardHorizontalChromePx: 20,
    api: {
      resizeSession() {
        return Promise.resolve();
      }
    }
  });

  controller.scheduleGlobalResize({ deckId: "d1", force: true });

  assert.equal(windowRef.scheduled[0].delay, 120);
  windowRef.scheduled[0].fn();

  assert.deepEqual(resized, ["s1:90x30"]);
});

test("session-terminal-resize controller uses runtime cell metrics for width and preserves the last row", () => {
  const windowRef = createFakeWindow();
  const terminals = new Map([
    [
      "s1",
      {
        mount: { clientWidth: 640, clientHeight: 320, style: {} },
        element: { style: {} },
        terminal: { resize() {} }
      }
    ]
  ]);

  const controller = createSessionTerminalResizeController({
    windowRef,
    terminals,
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    getSessionById: (sessionId) => ({ id: sessionId, deckId: "d1" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionTerminalGeometry: () => ({ cols: 80, rows: 24 }),
    computeFixedMountHeightPx: () => 240,
    computeFixedCardWidthPx: () => 820,
    getTerminalCellHeightPx: () => 10.5,
    getTerminalCellWidthPx: () => 8.5,
    terminalCardHorizontalChromePx: 20,
    terminalMountVerticalChromePx: 18,
    api: {
      resizeSession() {
        return Promise.resolve();
      }
    }
  });

  controller.applyResizeForSession("s1");

  assert.equal(terminals.get("s1").element.style.width, "700px");
  assert.equal(terminals.get("s1").mount.style.width, "680px");
  assert.equal(terminals.get("s1").mount.style.height, "270px");
});

test("session-terminal-resize controller reapplies mount geometry when runtime metrics appear later", () => {
  const windowRef = createFakeWindow();
  const resizeCalls = [];
  let runtimeCellHeightPx = 0;
  let runtimeCellWidthPx = 0;
  const entry = {
    mount: { clientWidth: 640, clientHeight: 320, style: {} },
    element: { style: {} },
    terminal: {
      resize(cols, rows) {
        resizeCalls.push(`${cols}x${rows}`);
      }
    }
  };
  const terminals = new Map([["s1", entry]]);
  const controller = createSessionTerminalResizeController({
    windowRef,
    terminals,
    resizeTimers: new Map(),
    terminalSizes: new Map(),
    getSessionById: (sessionId) => ({ id: sessionId, deckId: "d1" }),
    resolveSessionDeckId: (session) => session.deckId,
    getSessionTerminalGeometry: () => ({ cols: 80, rows: 24 }),
    computeFixedMountHeightPx: () => 240,
    computeFixedCardWidthPx: () => 820,
    getTerminalCellHeightPx: () => runtimeCellHeightPx,
    getTerminalCellWidthPx: () => runtimeCellWidthPx,
    terminalCardHorizontalChromePx: 20,
    terminalMountVerticalChromePx: 18,
    api: {
      resizeSession() {
        return Promise.resolve();
      }
    }
  });

  controller.applyResizeForSession("s1");
  assert.equal(entry.mount.style.height, "240px");
  assert.equal(entry.mount.style.width, "800px");
  assert.equal(entry.element.style.width, "820px");
  assert.deepEqual(resizeCalls, ["80x24"]);

  runtimeCellHeightPx = 10.5;
  runtimeCellWidthPx = 8.5;
  controller.applyResizeForSession("s1");

  assert.equal(entry.mount.style.height, "270px");
  assert.equal(entry.mount.style.width, "680px");
  assert.equal(entry.element.style.width, "700px");
  assert.deepEqual(resizeCalls, ["80x24"]);
});
