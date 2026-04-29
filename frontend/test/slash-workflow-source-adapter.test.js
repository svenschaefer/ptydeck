import test from "node:test";
import assert from "node:assert/strict";

import {
  createSlashWorkflowSourceAdapter,
  readSessionStateSource,
  readSourceValue,
  readSummarySource,
  readTerminalLineSource,
  readTerminalVisibleLineSource
} from "../src/public/slash-workflow-source-adapter.js";
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

test("workflow source adapter resolves visible-line values from the mounted viewport window", () => {
  const store = createStore();
  store.setSessions([{ id: "s1", state: "running", lifecycleState: "running", statusText: "" }]);
  const terminal = createTerminal(["boot", "", "visible start", ""], { rows: 2, ydisp: 2 });
  const adapter = createSlashWorkflowSourceAdapter({
    store,
    getTerminalEntry: () => ({ terminal })
  });

  const values = [];
  const unsubscribe = adapter.resolveSubscription("s1", "visible-line")((value) => values.push(value));
  terminal.buffer.active.ydisp = 3;
  terminal.buffer.active.length = 5;
  terminal.buffer.active.baseY = 3;
  terminal.buffer.active.getLine = (index) => {
    const lines = ["boot", "", "visible start", "", "visible end"];
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
  unsubscribe();

  assert.deepEqual(values, ["visible start", "visible end"]);
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

test("workflow source adapter fails fast for unknown sources and missing session targets", () => {
  const store = createStore();
  store.setSessions([{ id: "s1", state: "running", lifecycleState: "running", statusText: "ready" }]);
  const adapter = createSlashWorkflowSourceAdapter({
    store,
    getTerminalEntry: () => ({
      terminal: createTerminal(["ready"])
    })
  });

  assert.throws(
    () => adapter.resolveSubscription("s1", "mystery-source"),
    (error) =>
      error?.code === "workflow.source_unavailable" &&
      error?.source === "mystery-source" &&
      error?.sessionId === "s1"
  );
  assert.throws(
    () => adapter.resolveSubscription("", "status"),
    (error) => error?.code === "workflow.target_required"
  );
});

test("workflow source adapter ignores non-function listeners and returns a safe unsubscribe", () => {
  const store = createStore();
  store.setSessions([{ id: "s1", state: "running", lifecycleState: "running", statusText: "ready" }]);
  const adapter = createSlashWorkflowSourceAdapter({ store });

  const unsubscribe = adapter.resolveSubscription("s1", "status")(null);

  assert.equal(typeof unsubscribe, "function");
  assert.doesNotThrow(() => unsubscribe());
});

test("workflow source helpers handle malformed buffers, fallback lengths, and explicit source reads fail closed", () => {
  const fallbackLengthTerminal = {
    rows: 2,
    buffer: {
      active: {
        baseY: 1,
        ydisp: 1,
        getLine(index) {
          if (index !== 2) {
            return null;
          }
          return {
            translateToString() {
              return "tail";
            }
          };
        }
      }
    }
  };

  assert.equal(readTerminalLineSource(fallbackLengthTerminal), "tail");
  assert.equal(readTerminalVisibleLineSource({}), "");
  assert.equal(
    readSummarySource({
      artifacts: [null, { id: "summary", kind: "summary", text: 7 }, { id: "note", kind: "note", text: "ignore" }]
    }),
    ""
  );
  assert.equal(readSourceValue("exit-code", { exitCode: 7 }, null), "7");
  assert.equal(readSourceValue("session-state", { lifecycleState: "", state: "running" }, null), "running");
  assert.throws(
    () => readSourceValue("mystery", {}, null),
    (error) => error?.code === "workflow.source_unavailable" && error?.source === "mystery"
  );
});

test("workflow source adapter deduplicates unchanged values and ignores missing sessions after subscription", () => {
  const store = createStore();
  store.setSessions([{ id: "s1", state: "running", lifecycleState: "running", statusText: "ready" }]);
  const adapter = createSlashWorkflowSourceAdapter({ store });
  const values = [];

  const unsubscribe = adapter.resolveSubscription("s1", "status")((value) => values.push(value));
  store.applySessionInterpretationActions("s1", [{ type: "setSessionStatus", value: "ready" }]);
  store.applySessionInterpretationActions("s1", [{ type: "setSessionStatus", value: "busy" }]);
  store.setSessions([]);
  unsubscribe();

  assert.deepEqual(values, ["ready", "busy"]);
});
