import test from "node:test";
import assert from "node:assert/strict";
import { createSlashWorkflowEngine } from "../src/public/slash-workflow-engine.js";
import { createSlashWorkflowWaitAbortError, createSlashWorkflowWaitTimeoutError } from "../src/public/slash-workflow-waits.js";
import { parseSlashWorkflow } from "../src/public/slash-workflow-parser.js";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("slash workflow engine executes action steps sequentially and succeeds deterministically", async () => {
  const workflow = parseSlashWorkflow("/docu\n/go");
  const calls = [];
  const engine = createSlashWorkflowEngine({
    executeActionStep(step) {
      calls.push(step.command);
      return Promise.resolve(step.command);
    }
  });
  const finalState = await engine.run(workflow);
  assert.equal(finalState.status, "succeeded");
  assert.equal(finalState.completedSteps, 2);
  assert.equal(finalState.lastStepResult, "go");
  assert.deepEqual(calls, ["docu", "go"]);
});

test("slash workflow engine fails deterministically when the workflow exceeds the step guardrail", async () => {
  const workflow = parseSlashWorkflow("/one\n/two\n/three");
  const engine = createSlashWorkflowEngine({
    maxSteps: 2,
    executeActionStep() {
      throw new Error("should not execute");
    }
  });
  const finalState = await engine.run(workflow);
  assert.equal(finalState.status, "failed");
  assert.equal(finalState.completedSteps, 0);
  assert.equal(finalState.failure.code, "workflow.guardrail_steps_exceeded");
});

test("slash workflow engine enters waiting for wait steps and returns to running on success", async () => {
  const workflow = parseSlashWorkflow("/wait delay 1s\n/docu");
  const deferred = createDeferred();
  const engine = createSlashWorkflowEngine({
    executeWaitStep() {
      return deferred.promise;
    },
    executeActionStep() {
      return Promise.resolve("docu");
    }
  });
  const runPromise = engine.run(workflow);
  await Promise.resolve();
  assert.equal(engine.getState().status, "waiting");
  deferred.resolve("done");
  const finalState = await runPromise;
  assert.equal(finalState.status, "succeeded");
  assert.equal(finalState.completedSteps, 2);
});

test("slash workflow engine fails on action-step errors and stops later execution", async () => {
  const workflow = parseSlashWorkflow("/docu\n/go");
  const calls = [];
  const engine = createSlashWorkflowEngine({
    executeActionStep(step) {
      calls.push(step.command);
      if (step.command === "go") {
        throw new Error("boom");
      }
      return Promise.resolve(step.command);
    }
  });
  const finalState = await engine.run(workflow);
  assert.equal(finalState.status, "failed");
  assert.equal(finalState.completedSteps, 1);
  assert.equal(finalState.failure.code, "workflow.failed");
  assert.deepEqual(calls, ["docu", "go"]);
});

test("slash workflow engine maps wait timeouts to failed state with deterministic failure metadata", async () => {
  const workflow = parseSlashWorkflow("/wait delay 1s");
  const engine = createSlashWorkflowEngine({
    executeWaitStep() {
      throw createSlashWorkflowWaitTimeoutError("timed out");
    }
  });
  const finalState = await engine.run(workflow);
  assert.equal(finalState.status, "failed");
  assert.equal(finalState.failure.code, "workflow.timeout");
  assert.equal(finalState.failure.stepIndex, 0);
  assert.equal(finalState.failure.stepType, "wait");
});

test("slash workflow engine can cancel an in-flight wait immediately", async () => {
  const workflow = parseSlashWorkflow("/wait delay 1s");
  const engine = createSlashWorkflowEngine({
    executeWaitStep(step, context) {
      return new Promise((resolve, reject) => {
        context.signal.addEventListener("abort", () => reject(createSlashWorkflowWaitAbortError()), { once: true });
      });
    }
  });
  const runPromise = engine.run(workflow);
  await Promise.resolve();
  engine.cancel();
  const finalState = await runPromise;
  assert.equal(finalState.status, "cancelled");
});

test("slash workflow engine can stop an in-flight wait immediately", async () => {
  const workflow = parseSlashWorkflow("/wait delay 1s");
  const engine = createSlashWorkflowEngine({
    executeWaitStep(step, context) {
      return new Promise((resolve, reject) => {
        context.signal.addEventListener("abort", () => reject(createSlashWorkflowWaitAbortError()), { once: true });
      });
    }
  });
  const runPromise = engine.run(workflow);
  await Promise.resolve();
  engine.stop();
  const finalState = await runPromise;
  assert.equal(finalState.status, "stopped");
});
