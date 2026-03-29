import { createSlashWorkflowEngine } from "./slash-workflow-engine.js";
import { parseSlashWorkflow } from "./slash-workflow-parser.js";
import { createSlashWorkflowSourceAdapter } from "./slash-workflow-source-adapter.js";
import { createSlashWorkflowWaitStepRunner } from "./slash-workflow-waits.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function createWorkflowRuntimeError(code, message, details = {}) {
  const error = new Error(message);
  error.name = "SlashWorkflowRuntimeError";
  error.code = code;
  Object.assign(error, details);
  return error;
}

function normalizeWorkflowResult(ok, feedback, details = {}) {
  return Object.freeze({
    ok: ok === true,
    feedback: typeof feedback === "string" ? feedback : String(feedback || ""),
    ...details
  });
}

function buildActionRaw(step) {
  if (!step || typeof step !== "object") {
    return "";
  }
  if (typeof step.payload === "string") {
    return `${step.raw || ""}\n---\n${step.payload}\n---`;
  }
  return String(step.raw || "");
}

function summarizeStep(step) {
  const text = normalizeText(step?.raw);
  return text || "(unknown step)";
}

function normalizePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeRunInput(interpreted) {
  const raw = typeof interpreted?.raw === "string" ? interpreted.raw : "";
  if (interpreted?.mode !== "run-block") {
    return raw;
  }
  const lines = raw.split(/\r?\n/);
  let removed = false;
  const kept = [];
  for (const line of lines) {
    if (!removed && line.trim() === "/run") {
      removed = true;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").trim();
}

function formatTargetText(session, formatSessionToken, formatSessionDisplayName) {
  if (!session) {
    return "Target: no workflow session.";
  }
  return `Target: [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`;
}

function formatProgressText(state) {
  const workflow = state?.workflow;
  const totalSteps = Array.isArray(workflow?.steps) ? workflow.steps.length : 0;
  if (totalSteps === 0) {
    return "Progress: 0/0.";
  }
  const completed = Number.isInteger(state?.completedSteps) ? state.completedSteps : 0;
  const currentStepNumber = Number.isInteger(state?.currentStepIndex) ? state.currentStepIndex + 1 : null;
  if (state?.status === "ready") {
    return `Progress: 0/${totalSteps}.`;
  }
  if (currentStepNumber === null) {
    return `Progress: ${completed}/${totalSteps}.`;
  }
  return `Progress: ${completed}/${totalSteps} completed · step ${currentStepNumber}/${totalSteps}.`;
}

function formatDetailText(state) {
  if (!state || state.status === "ready") {
    return "Detail: no workflow running.";
  }
  const stepLabel = summarizeStep(state.currentStep);
  if (state.status === "waiting") {
    return `Detail: waiting on ${stepLabel}`;
  }
  if (state.status === "running") {
    return `Detail: running ${stepLabel}`;
  }
  if (state.status === "failed" && state.failure?.message) {
    return `Detail: ${state.failure.message}`;
  }
  if (state.status === "stopped") {
    return "Detail: workflow stop requested.";
  }
  if (state.status === "cancelled") {
    return "Detail: workflow cancelled.";
  }
  if (state.status === "succeeded") {
    return "Detail: workflow completed.";
  }
  return "Detail: no workflow running.";
}

function formatOutcomeText(state) {
  if (!state || state.status === "ready") {
    return "";
  }
  const workflow = state.workflow;
  const totalSteps = Array.isArray(workflow?.steps) ? workflow.steps.length : 0;
  const completed = Number.isInteger(state.completedSteps) ? state.completedSteps : 0;
  if (state.status === "succeeded") {
    return `Workflow succeeded after ${completed}/${totalSteps} step(s).`;
  }
  if (state.status === "stopped") {
    return `Workflow stopped after ${completed}/${totalSteps} step(s).`;
  }
  if (state.status === "cancelled") {
    return `Workflow cancelled after ${completed}/${totalSteps} step(s).`;
  }
  if (state.status === "failed") {
    const failureMessage = normalizeText(state.failure?.message);
    if (failureMessage) {
      return `Workflow failed after ${completed}/${totalSteps} step(s): ${failureMessage}`;
    }
    return `Workflow failed after ${completed}/${totalSteps} step(s).`;
  }
  return "";
}

export function createSlashWorkflowRuntimeController(options = {}) {
  const store = options.store || null;
  const executeControlCommandDetailed =
    typeof options.executeControlCommandDetailed === "function"
      ? options.executeControlCommandDetailed
      : async () => ({ ok: true, feedback: "" });
  const setWorkflowRunState =
    typeof options.setWorkflowRunState === "function" ? options.setWorkflowRunState : () => {};
  const clearWorkflowRunState =
    typeof options.clearWorkflowRunState === "function" ? options.clearWorkflowRunState : () => {};
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "");
  const debugLog = typeof options.debugLog === "function" ? options.debugLog : () => {};
  const apiInterruptSession =
    typeof options.apiInterruptSession === "function" ? options.apiInterruptSession : async () => {};
  const apiKillSession = typeof options.apiKillSession === "function" ? options.apiKillSession : async () => {};
  const getTerminalEntry =
    typeof options.getTerminalEntry === "function" ? options.getTerminalEntry : () => null;
  const maxWorkflowSteps = normalizePositiveInteger(options.maxWorkflowSteps, 64);
  const maxWaitTimeoutMs = normalizePositiveInteger(options.maxWaitTimeoutMs, 30 * 60 * 1000);
  const maxCaptureChars = normalizePositiveInteger(options.maxCaptureChars, 4096);
  const workflowSourceAdapter = createSlashWorkflowSourceAdapter({
    store,
    getTerminalEntry
  });

  let engine = null;
  let unsubscribeEngine = null;
  let boundSessionId = "";
  let currentState = Object.freeze({
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

  function getStoreState() {
    return store?.getState?.() || { sessions: [], activeSessionId: "" };
  }

  function getSessionById(sessionId) {
    const state = getStoreState();
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    return sessions.find((session) => session.id === sessionId) || null;
  }

  function getBoundSession() {
    return boundSessionId ? getSessionById(boundSessionId) : null;
  }

  function publishUiState(state = currentState) {
    const targetSession = getBoundSession();
    const activeWorkflow = state.status === "running" || state.status === "waiting";
    setWorkflowRunState({
      workflowStatus: `Workflow: ${state.status || "ready"}.`,
      workflowTarget: formatTargetText(targetSession, formatSessionToken, formatSessionDisplayName),
      workflowProgress: formatProgressText(state),
      workflowDetail: formatDetailText(state),
      workflowResult: formatOutcomeText(state),
      workflowCanStop: activeWorkflow,
      workflowCanInterrupt: activeWorkflow && Boolean(targetSession?.id),
      workflowCanKill: activeWorkflow && Boolean(targetSession?.id)
    });
  }

  function cleanupEngine() {
    if (typeof unsubscribeEngine === "function") {
      unsubscribeEngine();
    }
    unsubscribeEngine = null;
    engine = null;
  }

  function createActivitySubscription(sessionId) {
    if (!sessionId) {
      return null;
    }
    return (listener) => {
      if (typeof listener !== "function") {
        return () => {};
      }
      let previousActivityAt = null;
      const update = (snapshot) => {
        const sessions = Array.isArray(snapshot?.sessions) ? snapshot.sessions : [];
        const session = sessions.find((entry) => entry.id === sessionId) || null;
        if (!session) {
          return;
        }
        const nextActivityAt = Number.isFinite(session.lastOutputAt)
          ? Number(session.lastOutputAt)
          : Number.isFinite(session.activityUpdatedAt)
            ? Number(session.activityUpdatedAt)
            : null;
        if (previousActivityAt !== null && nextActivityAt !== null && nextActivityAt > previousActivityAt) {
          listener(nextActivityAt);
        }
        previousActivityAt = nextActivityAt;
      };
      update(getStoreState());
      const unsubscribe = typeof store?.subscribe === "function" ? store.subscribe(update) : () => {};
      return typeof unsubscribe === "function" ? unsubscribe : () => {};
    };
  }

  function resolveSourceSubscription(source) {
    const normalizedSource = normalizeText(source).toLowerCase();
    try {
      return workflowSourceAdapter.resolveSubscription(boundSessionId, normalizedSource);
    } catch (error) {
      if (error?.code === "workflow.target_required" || error?.code === "workflow.source_unavailable") {
        throw createWorkflowRuntimeError(error.code, error.message, {
          source: normalizedSource,
          sessionId: boundSessionId || "",
          cause: error
        });
      }
      throw error;
    }
  }

  function createWorkflowEngine() {
    const waitStepRunner = createSlashWorkflowWaitStepRunner({
      subscribeActivity: createActivitySubscription(boundSessionId),
      resolveSourceSubscription,
      maxWaitTimeoutMs,
      maxCaptureChars
    });

    return createSlashWorkflowEngine({
      maxSteps: maxWorkflowSteps,
      async executeActionStep(step, context) {
        const interpreted = {
          kind: "control",
          command: step.command,
          args: Array.isArray(step.args) ? step.args.slice() : [],
          raw: buildActionRaw(step)
        };
        const result = await executeControlCommandDetailed(interpreted, context);
        if (result?.ok !== true) {
          throw createWorkflowRuntimeError(
            "workflow.failed",
            normalizeText(result?.feedback) || `Workflow step failed: ${summarizeStep(step)}`,
            {
              feedback: normalizeText(result?.feedback),
              stepRaw: interpreted.raw
            }
          );
        }
        return result;
      },
      async executeWaitStep(step, context) {
        return waitStepRunner.execute(step, context);
      }
    });
  }

  function bindEngine(nextEngine) {
    engine = nextEngine;
    currentState = engine.getState();
    unsubscribeEngine = engine.subscribe((state) => {
      currentState = state;
      publishUiState(state);
      requestRender();
    });
    publishUiState(currentState);
    requestRender();
  }

  function resolveWorkflowTargetSessionId(interpreted) {
    const state = getStoreState();
    return normalizeText(state.activeSessionId || interpreted?.sessionId);
  }

  async function runWorkflowDetailed(interpreted) {
    if (engine && (currentState.status === "running" || currentState.status === "waiting")) {
      throw createWorkflowRuntimeError("workflow.already_running", "A workflow is already running.");
    }

    const workflowInput = normalizeRunInput(interpreted);
    const workflow = parseSlashWorkflow(workflowInput);
    boundSessionId = resolveWorkflowTargetSessionId(interpreted);
    cleanupEngine();
    bindEngine(createWorkflowEngine());
    debugLog("workflow.run.start", {
      steps: Array.isArray(workflow.steps) ? workflow.steps.length : 0,
      mode: interpreted?.mode || "multiline",
      targetSessionId: boundSessionId || ""
    });
    try {
      const finalState = await engine.run(workflow);
      publishUiState(finalState);
      requestRender();
      const feedback = formatOutcomeText(finalState) || "Workflow completed.";
      debugLog("workflow.run.finish", {
        status: finalState.status,
        targetSessionId: boundSessionId || "",
        completedSteps: finalState.completedSteps || 0
      });
      return normalizeWorkflowResult(finalState.status === "succeeded", feedback, {
        status: finalState.status,
        workflow: finalState.workflow,
        failure: finalState.failure || null
      });
    } catch (error) {
      cleanupEngine();
      clearWorkflowRunState();
      requestRender();
      throw error;
    }
  }

  function stopActiveWorkflow() {
    if (!engine || (currentState.status !== "running" && currentState.status !== "waiting")) {
      return false;
    }
    debugLog("workflow.stop.requested", { targetSessionId: boundSessionId || "" });
    engine.stop();
    return true;
  }

  async function interruptWorkflowSession() {
    if (!boundSessionId) {
      return "No workflow session available to interrupt.";
    }
    const session = getBoundSession();
    if (!session) {
      return "No workflow session available to interrupt.";
    }
    await apiInterruptSession(session.id);
    return `Interrupted workflow session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
  }

  async function killWorkflowSession() {
    if (!boundSessionId) {
      return "No workflow session available to kill.";
    }
    const session = getBoundSession();
    if (!session) {
      return "No workflow session available to kill.";
    }
    await apiKillSession(session.id);
    return `Killed workflow session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
  }

  function getState() {
    return currentState;
  }

  function dispose() {
    cleanupEngine();
    clearWorkflowRunState({ render: false });
  }

  publishUiState(currentState);

  return Object.freeze({
    runWorkflowDetailed,
    stopActiveWorkflow,
    interruptWorkflowSession,
    killWorkflowSession,
    getState,
    dispose
  });
}
