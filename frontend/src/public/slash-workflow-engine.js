function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function serializeFailure(error, step, stepIndex) {
  if (!error) {
    return null;
  }
  return deepFreeze({
    code: typeof error.code === "string" ? error.code : "workflow.failed",
    message: error instanceof Error ? error.message : String(error),
    stepIndex,
    stepType: step?.type || null,
    stepLine: Number.isInteger(step?.line) ? step.line : null
  });
}

function createSnapshot(state) {
  return deepFreeze({ ...state });
}

function createGuardrailError(code, message) {
  const error = new Error(message);
  error.name = "SlashWorkflowGuardrailError";
  error.code = code;
  return error;
}

export function createSlashWorkflowEngine(options = {}) {
  const executeActionStep =
    typeof options.executeActionStep === "function" ? options.executeActionStep : async () => undefined;
  const executeWaitStep = typeof options.executeWaitStep === "function" ? options.executeWaitStep : async () => undefined;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const maxSteps =
    Number.isInteger(options.maxSteps) && options.maxSteps > 0 ? options.maxSteps : Number.POSITIVE_INFINITY;
  const listeners = new Set();

  let state = createSnapshot({
    status: "ready",
    workflow: null,
    currentStepIndex: null,
    currentStep: null,
    completedSteps: 0,
    lastStepResult: null,
    startedAt: null,
    finishedAt: null,
    failure: null
  });
  let currentStepController = null;
  let stopRequested = false;
  let cancelRequested = false;

  function publish(nextState) {
    state = createSnapshot(nextState);
    for (const listener of listeners) {
      listener(state);
    }
    return state;
  }

  function getState() {
    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function requestStop(kind) {
    if (state.status !== "running" && state.status !== "waiting") {
      return getState();
    }
    if (kind === "cancel") {
      cancelRequested = true;
    } else {
      stopRequested = true;
    }
    if (currentStepController) {
      currentStepController.abort();
    }
    return getState();
  }

  async function run(workflow) {
    if (state.status === "running" || state.status === "waiting") {
      throw new Error("A workflow is already running.");
    }
    const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
    stopRequested = false;
    cancelRequested = false;
    const startedAt = now();
    if (steps.length > maxSteps) {
      return publish({
        status: "failed",
        workflow,
        currentStepIndex: null,
        currentStep: null,
        completedSteps: 0,
        lastStepResult: null,
        startedAt,
        finishedAt: now(),
        failure: serializeFailure(
          createGuardrailError(
            "workflow.guardrail_steps_exceeded",
            `Workflow exceeds the maximum step count (${steps.length}/${maxSteps}).`
          ),
          null,
          null
        )
      });
    }
    publish({
      status: "running",
      workflow,
      currentStepIndex: null,
      currentStep: null,
      completedSteps: 0,
      lastStepResult: null,
      startedAt,
      finishedAt: null,
      failure: null
    });

    let completedSteps = 0;
    let lastStepResult = null;
    let currentStepIndex = null;
    let currentStep = null;

    try {
      for (let index = 0; index < steps.length; index += 1) {
        if (stopRequested || cancelRequested) {
          break;
        }
        currentStepIndex = index;
        currentStep = steps[index];
        currentStepController = new AbortController();
        const context = Object.freeze({
          workflow,
          step: currentStep,
          stepIndex: index,
          signal: currentStepController.signal
        });

        if (currentStep.type === "wait") {
          publish({
            status: "waiting",
            workflow,
            currentStepIndex: index,
            currentStep,
            completedSteps,
            lastStepResult,
            startedAt,
            finishedAt: null,
            failure: null
          });
          lastStepResult = await executeWaitStep(currentStep, context);
        } else {
          publish({
            status: "running",
            workflow,
            currentStepIndex: index,
            currentStep,
            completedSteps,
            lastStepResult,
            startedAt,
            finishedAt: null,
            failure: null
          });
          lastStepResult = await executeActionStep(currentStep, context);
        }

        completedSteps = index + 1;
        publish({
          status: "running",
          workflow,
          currentStepIndex: index,
          currentStep,
          completedSteps,
          lastStepResult,
          startedAt,
          finishedAt: null,
          failure: null
        });
      }
    } catch (error) {
      currentStepController = null;
      const finishedAt = now();
      if (cancelRequested || error?.code === "workflow.cancelled") {
        return publish({
          status: "cancelled",
          workflow,
          currentStepIndex,
          currentStep,
          completedSteps,
          lastStepResult,
          startedAt,
          finishedAt,
          failure: null
        });
      }
      if (stopRequested || error?.code === "workflow.aborted") {
        return publish({
          status: "stopped",
          workflow,
          currentStepIndex,
          currentStep,
          completedSteps,
          lastStepResult,
          startedAt,
          finishedAt,
          failure: null
        });
      }
      return publish({
        status: "failed",
        workflow,
        currentStepIndex,
        currentStep,
        completedSteps,
        lastStepResult,
        startedAt,
        finishedAt,
        failure: serializeFailure(error, currentStep, currentStepIndex)
      });
    }

    currentStepController = null;
    const finishedAt = now();
    if (cancelRequested) {
      return publish({
        status: "cancelled",
        workflow,
        currentStepIndex,
        currentStep,
        completedSteps,
        lastStepResult,
        startedAt,
        finishedAt,
        failure: null
      });
    }
    if (stopRequested) {
      return publish({
        status: "stopped",
        workflow,
        currentStepIndex,
        currentStep,
        completedSteps,
        lastStepResult,
        startedAt,
        finishedAt,
        failure: null
      });
    }
    return publish({
      status: "succeeded",
      workflow,
      currentStepIndex,
      currentStep,
      completedSteps,
      lastStepResult,
      startedAt,
      finishedAt,
      failure: null
    });
  }

  return Object.freeze({
    getState,
    subscribe,
    run,
    stop() {
      return requestStop("stop");
    },
    cancel() {
      return requestStop("cancel");
    }
  });
}
