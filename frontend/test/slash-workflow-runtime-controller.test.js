import test from "node:test";
import assert from "node:assert/strict";

import { createSlashWorkflowRuntimeController } from "../src/public/slash-workflow-runtime-controller.js";
import { createStore } from "../src/public/store.js";

function createControllerContext(overrides = {}) {
  const store = createStore();
  store.setSessions([
    {
      id: "s1",
      name: "ops",
      deckId: "default",
      state: "running",
      lifecycleState: "running",
      activityState: "inactive",
      createdAt: 1,
      updatedAt: 1
    }
  ]);
  store.setActiveSession("s1");

  const uiStates = [];
  const calls = [];
  const terminalEntries = overrides.terminalEntries || new Map();
  const controller = createSlashWorkflowRuntimeController({
    store,
    executeControlCommandDetailed: async (interpreted) => {
      calls.push(["execute", interpreted.raw]);
      return { ok: true, feedback: `ok:${interpreted.command}` };
    },
    setWorkflowRunState: (nextState) => {
      uiStates.push({ ...nextState });
    },
    clearWorkflowRunState: () => {
      uiStates.push({ cleared: true });
    },
    requestRender: () => calls.push(["render"]),
    formatSessionToken: () => "7",
    formatSessionDisplayName: (session) => session.name,
    apiInterruptSession: async (sessionId) => calls.push(["interrupt", sessionId]),
    apiKillSession: async (sessionId) => calls.push(["kill", sessionId]),
    getTerminalEntry: (sessionId) => terminalEntries.get(sessionId) || null,
    ...overrides
  });

  return { store, uiStates, calls, controller, terminalEntries };
}

test("slash-workflow runtime controller executes multiline slash workflows through the workflow engine", async () => {
  const { calls, controller } = createControllerContext();

  const result = await controller.runWorkflowDetailed({
    kind: "control-script",
    mode: "multiline",
    raw: "/list\n/next"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "succeeded");
  assert.equal(calls.filter((entry) => entry[0] === "execute").length, 2);
  assert.deepEqual(calls.filter((entry) => entry[0] === "execute"), [
    ["execute", "/list"],
    ["execute", "/next"]
  ]);
});

test("slash-workflow runtime controller strips /run and stops waiting workflows deterministically", async () => {
  const { controller, calls } = createControllerContext();

  const pending = controller.runWorkflowDetailed({
    kind: "control-script",
    mode: "run-block",
    raw: "/run\n/wait until session-state /^exited$/ timeout 1h\n/list"
  });

  assert.equal(controller.getState().status, "waiting");
  assert.equal(controller.stopActiveWorkflow(), true);

  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.status, "stopped");
  assert.equal(calls.some((entry) => entry[0] === "execute"), false);
});

test("slash-workflow runtime controller reports terminal-backed wait sources explicitly when no terminal is mounted", async () => {
  const { controller } = createControllerContext();

  const result = await controller.runWorkflowDetailed({
    kind: "control-script",
    mode: "multiline",
    raw: "/wait until line /^done$/ timeout 1s"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.failure.code, "workflow.source_unavailable");
});

test("slash-workflow runtime controller exposes interrupt and kill actions for the bound workflow session", async () => {
  const { calls, controller } = createControllerContext();

  const pending = controller.runWorkflowDetailed({
    kind: "control-script",
    mode: "multiline",
    raw: "/wait until session-state /^exited$/ timeout 1h"
  });

  assert.equal(controller.getState().status, "waiting");
  assert.equal(await controller.interruptWorkflowSession(), "Interrupted workflow session [7] ops.");
  assert.equal(await controller.killWorkflowSession(), "Killed workflow session [7] ops.");
  controller.stopActiveWorkflow();
  await pending;

  assert.deepEqual(calls.filter((entry) => entry[0] === "interrupt" || entry[0] === "kill"), [
    ["interrupt", "s1"],
    ["kill", "s1"]
  ]);
});

test("slash-workflow runtime controller fails guardrail-exceeding workflows deterministically", async () => {
  const { controller } = createControllerContext({
    maxWorkflowSteps: 1
  });

  const result = await controller.runWorkflowDetailed({
    kind: "control-script",
    mode: "multiline",
    raw: "/list\n/next"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.failure.code, "workflow.guardrail_steps_exceeded");
});

test("slash-workflow runtime controller resolves wait conditions on PTY-exit state changes without stream scanning", async () => {
  const { controller, store } = createControllerContext();

  const pending = controller.runWorkflowDetailed({
    kind: "control-script",
    mode: "multiline",
    raw: "/wait until session-state /^exited$/ timeout 5s"
  });

  assert.equal(controller.getState().status, "waiting");
  store.upsertSession({
    ...store.getState().sessions.find((session) => session.id === "s1"),
    lifecycleState: "exited",
    state: "exited",
    updatedAt: 2
  });
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.status, "succeeded");
});

test("slash-workflow runtime controller resolves line and summary waits through explicit source adapters", async () => {
  const terminal = {
    rows: 3,
    buffer: {
      active: {
        ydisp: 0,
        baseY: 0,
        length: 1,
        getLine(index) {
          const lines = [index === 0 ? "boot" : ""];
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
  const terminalEntries = new Map([["s1", { terminal }]]);
  const { controller, store } = createControllerContext({ terminalEntries });

  const linePending = controller.runWorkflowDetailed({
    kind: "control-script",
    mode: "multiline",
    raw: "/wait until line /^done$/ timeout 5s"
  });

  terminal.buffer.active.length = 2;
  terminal.buffer.active.baseY = 1;
  terminal.buffer.active.ydisp = 1;
  terminal.buffer.active.getLine = (index) => {
    const lines = ["boot", "done"];
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
  store.markSessionActivity("s1", { timestamp: 5 });
  const lineResult = await linePending;
  assert.equal(lineResult.ok, true);
  assert.equal(lineResult.status, "succeeded");

  const summaryPending = controller.runWorkflowDetailed({
    kind: "control-script",
    mode: "multiline",
    raw: "/wait until summary /^all green$/ timeout 5s"
  });
  store.applySessionInterpretationActions("s1", [
    {
      type: "upsertSessionArtifact",
      artifact: { id: "summary", kind: "summary", title: "Summary", text: "all green" }
    }
  ]);
  const summaryResult = await summaryPending;
  assert.equal(summaryResult.ok, true);
  assert.equal(summaryResult.status, "succeeded");
});

test("slash-workflow runtime controller enforces the maximum wait timeout guardrail", async () => {
  const { controller } = createControllerContext({
    maxWaitTimeoutMs: 100
  });

  const result = await controller.runWorkflowDetailed({
    kind: "control-script",
    mode: "multiline",
    raw: "/wait until session-state /^exited$/ timeout 5s"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.failure.code, "workflow.guardrail_wait_timeout_exceeded");
});
