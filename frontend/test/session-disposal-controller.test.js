import test from "node:test";
import assert from "node:assert/strict";

import { createSessionDisposalController } from "../src/public/ui/session-disposal-controller.js";

test("session-disposal controller cleans removed sessions and related runtime state", () => {
  const calls = [];
  const controller = createSessionDisposalController({
    onClearSessionStatusAnchor: (sessionId) => calls.push(`status:${sessionId}`)
  });

  const timers = new Map();
  const timerToken = setTimeout(() => {}, 1);
  clearTimeout(timerToken);
  timers.set("s1", timerToken);

  const terminals = new Map([
    [
      "s1",
      {
        terminal: { dispose: () => calls.push("terminal.dispose") },
        element: { remove: () => calls.push("element.remove") },
        settingsDialog: { open: true }
      }
    ],
    [
      "s2",
      {
        terminal: { dispose: () => calls.push("terminal.dispose.s2") },
        element: { remove: () => calls.push("element.remove.s2") },
        settingsDialog: { open: true }
      }
    ]
  ]);
  const terminalObservers = new Map([
    ["s1", { disconnect: () => calls.push("observer.disconnect") }],
    ["s2", { disconnect: () => calls.push("observer.disconnect.s2") }]
  ]);
  const terminalSizes = new Map([
    ["s1", { cols: 80, rows: 20 }],
    ["s2", { cols: 90, rows: 25 }]
  ]);
  const drafts = new Map([
    ["s1", { theme: "x" }],
    ["s2", { theme: "y" }]
  ]);
  const terminalSearchState = {
    sessionId: "s1",
    selectedSessionId: "s1",
    matches: ["a"],
    activeIndex: 0,
    revision: 1
  };

  const shouldRunResizePass = controller.cleanupRemovedSessions({
    activeSessionIds: new Set(["s2"]),
    terminals,
    terminalObservers,
    closeSettingsDialog: () => calls.push("dialog.close"),
    onSessionDisposed: (sessionId) => calls.push(`disposed:${sessionId}`),
    terminalSearchState,
    clearTerminalSearchSelection: (sessionId) => calls.push(`search.clear:${sessionId}`),
    resizeTimers: timers,
    terminalSizes,
    sessionThemeDrafts: drafts
  });

  assert.equal(shouldRunResizePass, true);
  assert.equal(terminals.has("s1"), false);
  assert.equal(terminals.has("s2"), true);
  assert.equal(terminalObservers.has("s1"), false);
  assert.equal(terminalSizes.has("s1"), false);
  assert.equal(drafts.has("s1"), false);
  assert.equal(terminalSearchState.sessionId, "");
  assert.equal(terminalSearchState.activeIndex, -1);
  assert.deepEqual(calls.includes("observer.disconnect"), true);
  assert.deepEqual(calls.includes("terminal.dispose"), true);
  assert.deepEqual(calls.includes("search.clear:s1"), true);
  assert.deepEqual(calls.includes("status:s1"), true);
  assert.deepEqual(calls.includes("disposed:s1"), true);
});
