import test from "node:test";
import assert from "node:assert/strict";

import { createSlashWorkflowSourceAdapter, readSessionStateSource, readSummarySource, readTerminalLineSource, readTerminalVisibleLineSource } from "../src/public/slash-workflow-source-adapter.js";
import { createStore } from "../src/public/store.js";

function createTerminal(lines, { rows = 3, ydisp = 0 } = {}) {
  return {
    rows,
    buffer: {
      active: {
        ydisp,
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
    }
  };
}

test("workflow source helpers derive terminal and artifact values deterministically", () => {
  const terminal = createTerminal(["boot", "", "ready", ""], { rows: 2, ydisp: 2 });
  assert.equal(readTerminalLineSource(terminal), "ready");
  assert.equal(readTerminalVisibleLineSource(terminal), "ready");
  assert.equal(
    readSummarySource({
      artifacts: [
        { id: "result", kind: "result", text: "ignore" },
        { id: "summary", kind: "summary", text: "final summary" }
      ]
    }),
    "final summary"
  );
  assert.equal(readSessionStateSource({ lifecycleState: "busy", state: "running" }), "busy");
  assert.equal(readSessionStateSource({ lifecycleState: "", state: "exited" }), "exited");
});

test("workflow source adapter subscriptions follow store-backed status and terminal-backed line updates", () => {
  const store = createStore();
  store.setSessions([{ id: "s1", state: "running", lifecycleState: "running", statusText: "" }]);
  const terminal = createTerminal(["boot", ""], { rows: 2, ydisp: 0 });
  const terminals = new Map([["s1", { terminal }]]);
  const adapter = createSlashWorkflowSourceAdapter({
    store,
    getTerminalEntry: (sessionId) => terminals.get(sessionId) || null
  });

  const statusValues = [];
  const unsubscribeStatus = adapter.resolveSubscription("s1", "status")((value) => statusValues.push(value));
  store.applySessionInterpretationActions("s1", [{ type: "setSessionStatus", value: "Working" }]);
  unsubscribeStatus();
  assert.deepEqual(statusValues, ["", "Working"]);

  const lineValues = [];
  const unsubscribeLine = adapter.resolveSubscription("s1", "line")((value) => lineValues.push(value));
  terminal.buffer.active.length = 3;
  terminal.buffer.active.baseY = 1;
  terminal.buffer.active.ydisp = 1;
  terminal.buffer.active.getLine = (index) => {
    const lines = ["boot", "", "done"];
    const text = lines[index];
    if (typeof text !== "string") {
      return null;
    }
    return {
      translateToString() {
        return text;
      }
    };
  };
  store.markSessionActivity("s1", { timestamp: 10 });
  unsubscribeLine();
  assert.deepEqual(lineValues, ["boot", "done"]);
});

test("workflow source adapter resolves summary values from session artifacts", () => {
  const store = createStore();
  store.setSessions([{ id: "s1", state: "running", lifecycleState: "running", artifacts: [] }]);
  const adapter = createSlashWorkflowSourceAdapter({ store });
  const values = [];
  const unsubscribe = adapter.resolveSubscription("s1", "summary")((value) => values.push(value));
  store.applySessionInterpretationActions("s1", [
    {
      type: "upsertSessionArtifact",
      artifact: { id: "summary", kind: "summary", title: "Summary", text: "all green" }
    }
  ]);
  unsubscribe();
  assert.deepEqual(values, ["", "all green"]);
});

test("workflow source adapter reports missing terminal-backed sources explicitly", () => {
  const store = createStore();
  store.setSessions([{ id: "s1", state: "running", lifecycleState: "running" }]);
  const adapter = createSlashWorkflowSourceAdapter({ store });
  assert.throws(
    () => adapter.resolveSubscription("s1", "visible-line"),
    (error) => error?.code === "workflow.source_unavailable"
  );
});
