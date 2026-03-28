import { evaluateSendSafety as defaultEvaluateSendSafety } from "./command-send-safety-controller.js";
import {
  normalizeCustomCommandRecord,
  parseCustomCommandInvocation,
  renderCustomCommandForSession
} from "./custom-command-model.js";

export function createCommandComposerRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const setTimeoutFn =
    typeof windowRef.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn =
    typeof windowRef.clearTimeout === "function"
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);
  const getCommandValue = options.getCommandValue || (() => "");
  const setCommandValue = options.setCommandValue || (() => {});
  const resetCommandAutocompleteState = options.resetCommandAutocompleteState || (() => {});
  const interpretComposerInput = options.interpretComposerInput || (() => ({ kind: "input", data: "" }));
  const getState = options.getState || (() => ({ sessions: [], activeSessionId: "" }));
  const resolveQuickSwitchTarget = options.resolveQuickSwitchTarget || (() => ({ error: "Unknown target." }));
  const activateSessionTarget = options.activateSessionTarget || (() => ({ message: "" }));
  const activateDeckTarget = options.activateDeckTarget || (() => ({ message: "" }));
  const setActiveSession = options.setActiveSession || (() => {});
  const setCommandFeedback = options.setCommandFeedback || (() => {});
  const setCommandPreview = options.setCommandPreview || (() => {});
  const setCommandGuardState = options.setCommandGuardState || (() => {});
  const clearCommandGuardState = options.clearCommandGuardState || (() => {});
  const clearCommandSuggestions = options.clearCommandSuggestions || (() => {});
  const render = options.render || (() => {});
  const debugLog = options.debugLog || (() => {});
  const executeControlCommand = options.executeControlCommand || (() => Promise.resolve(""));
  const runWorkflowDetailed =
    typeof options.runWorkflowDetailed === "function" ? options.runWorkflowDetailed : null;
  const executeControlCommandDetailed =
    typeof options.executeControlCommandDetailed === "function"
      ? options.executeControlCommandDetailed
      : async (interpreted) => ({ ok: true, feedback: await executeControlCommand(interpreted) });
  const recordSlashHistory = options.recordSlashHistory || (() => {});
  const getErrorMessage = options.getErrorMessage || (() => "Failed to execute control command.");
  const resetSlashHistoryNavigationState = options.resetSlashHistoryNavigationState || (() => {});
  const parseDirectTargetRoutingInput = options.parseDirectTargetRoutingInput || (() => ({ matched: false, payload: "", targetToken: "" }));
  const resolveTargetSelectors = options.resolveTargetSelectors || (() => ({ sessions: [], error: "" }));
  const getActiveDeck = options.getActiveDeck || (() => null);
  const resolveBroadcastTargets =
    typeof options.resolveBroadcastTargets === "function"
      ? options.resolveBroadcastTargets
      : () => ({ active: false, sessions: [], error: "", routeFeedback: "" });
  const formatSessionToken = options.formatSessionToken || ((sessionId) => String(sessionId || ""));
  const formatSessionDisplayName = options.formatSessionDisplayName || ((session) => String(session?.name || ""));
  const evaluateSendSafety =
    typeof options.evaluateSendSafety === "function" ? options.evaluateSendSafety : defaultEvaluateSendSafety;
  const getLastActiveSessionSwitchAt =
    typeof options.getLastActiveSessionSwitchAt === "function" ? options.getLastActiveSessionSwitchAt : () => 0;
  const getBlockedSessionActionMessage = options.getBlockedSessionActionMessage || (() => "");
  const isSessionActionBlocked = options.isSessionActionBlocked || (() => false);
  const getSessionSendTerminator = options.getSessionSendTerminator || (() => "CR");
  const apiSendInput = options.apiSendInput || (() => Promise.resolve());
  const sendInputWithConfiguredTerminator = options.sendInputWithConfiguredTerminator || (() => Promise.resolve());
  const recordCommandSubmission = options.recordCommandSubmission || (() => null);
  const normalizeSendTerminatorMode = options.normalizeSendTerminatorMode || ((mode) => mode);
  const delayedSubmitMs = Number(options.delayedSubmitMs) || 0;
  const setError = options.setError || (() => {});
  const clearError = options.clearError || (() => {});
  const getCustomCommandState = options.getCustomCommandState || (() => null);
  const formatQuickSwitchPreview = options.formatQuickSwitchPreview || (() => "");

  let commandPreviewTimer = null;
  let pendingSend = null;

  function clearPreviewTimer() {
    if (commandPreviewTimer !== null) {
      clearTimeoutFn(commandPreviewTimer);
      commandPreviewTimer = null;
    }
  }

  function clearPendingSend({ renderAfterClear = false } = {}) {
    pendingSend = null;
    clearCommandGuardState({ render: renderAfterClear });
  }

  function formatControlScriptFeedback(results, { stopped = false, total = 0 } = {}) {
    const completed = Array.isArray(results) ? results.length : 0;
    const lines = [];
    if (completed === 0) {
      return "No slash commands executed.";
    }
    lines.push(stopped ? `Command script stopped after ${completed}/${total} step(s).` : `Command script executed ${completed}/${total} step(s).`);
    for (let index = 0; index < completed; index += 1) {
      const result = results[index];
      const raw = String(result?.raw || "").trim();
      const feedback = String(result?.feedback || "").trim();
      lines.push(`[${index + 1}] ${raw || "/"}`);
      if (feedback) {
        lines.push(feedback);
      }
    }
    return lines.join("\n");
  }

  function formatCommandGuardReasons(reasonEntries = []) {
    return reasonEntries
      .map((entry) => {
        const targets = Array.isArray(entry.targets) && entry.targets.length > 0 ? ` (${entry.targets.join(", ")})` : "";
        return `- ${entry.label}${targets}`;
      })
      .join("\n");
  }

  function resolveSendPlan(interpreted) {
    const state = getState();
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const directRouting = parseDirectTargetRoutingInput(interpreted.data);

    let targetSessions = [];
    let targetPayload = interpreted.data;
    let routeFeedback = "";

    if (directRouting.matched) {
      const resolvedTargets = resolveTargetSelectors(directRouting.targetToken, sessions, {
        source: "direct-route",
        scopeMode: "active-deck",
        activeDeckId: getActiveDeck()?.id || ""
      });
      if (resolvedTargets.error) {
        return { error: resolvedTargets.error };
      }
      targetSessions = resolvedTargets.sessions;
      targetPayload = directRouting.payload;
      if (targetSessions.length === 1) {
        routeFeedback = `Sent to [${formatSessionToken(targetSessions[0].id)}] ${formatSessionDisplayName(targetSessions[0])}.`;
      } else {
        routeFeedback = `Sent to ${targetSessions.length} sessions.`;
      }
    } else {
      const broadcastTargets = resolveBroadcastTargets();
      if (broadcastTargets?.active === true) {
        if (broadcastTargets.error) {
          return { error: broadcastTargets.error };
        }
        targetSessions = Array.isArray(broadcastTargets.sessions) ? broadcastTargets.sessions : [];
        routeFeedback = broadcastTargets.routeFeedback || (targetSessions.length > 1 ? `Sent to ${targetSessions.length} sessions.` : "");
      } else {
        const activeSession = sessions.find((session) => session.id === state.activeSessionId) || null;
        if (!activeSession) {
          return null;
        }
        targetSessions = [activeSession];
      }
    }

    if (targetSessions.length === 0) {
      return null;
    }

    const blockedSessions = targetSessions.filter((session) => isSessionActionBlocked(session));
    if (blockedSessions.length > 0) {
      return { error: getBlockedSessionActionMessage(blockedSessions, "Command send") };
    }

    return {
      targetSessions,
      targetPayload,
      routeFeedback,
      directRouteMatched: directRouting.matched === true,
      source: "composer",
      activateTargetBeforeSend: false
    };
  }

  function resolveSingleSessionPlan(sessionId, text, options = {}) {
    const state = getState();
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const session = sessions.find((entry) => entry.id === sessionId) || null;
    if (!session) {
      return { error: "Unknown session target." };
    }
    if (isSessionActionBlocked(session)) {
      return { error: getBlockedSessionActionMessage([session], "Command send") };
    }
    return {
      targetSessions: [session],
      targetPayload: String(text || ""),
      routeFeedback: options.routeFeedback || "",
      directRouteMatched: false,
      source: options.source || "composer",
      activateTargetBeforeSend: options.activateTargetBeforeSend === true
    };
  }

  function isPotentialDirectTargetControlPayload(payload) {
    const firstLine = String(payload || "")
      .split(/\r?\n/, 1)[0]
      .trimStart();
    return /^\/[A-Za-z][A-Za-z0-9._-]*(?:\s|$)/.test(firstLine);
  }

  function resolveDirectTargetedControlInput(rawInput) {
    const directRouting = parseDirectTargetRoutingInput(rawInput);
    if (!directRouting.matched || !isPotentialDirectTargetControlPayload(directRouting.payload)) {
      return null;
    }
    const nested = interpretComposerInput(directRouting.payload);
    if (nested.kind !== "control" && nested.kind !== "control-script") {
      return null;
    }
    return {
      ...nested,
      raw: directRouting.payload,
      targetSelector: directRouting.targetToken
    };
  }

  async function executeSendPlan(plan) {
    if (!plan || !Array.isArray(plan.targetSessions) || plan.targetSessions.length === 0) {
      return;
    }

    for (const session of plan.targetSessions) {
      if (plan.activateTargetBeforeSend === true) {
        setActiveSession(session.id);
      }
      const terminatorMode = getSessionSendTerminator(session.id);
      debugLog("command.send.start", {
        activeSessionId: session.id,
        mode: terminatorMode,
        directRoute: plan.directRouteMatched === true,
        source: plan.source || "composer"
      });
      await sendInputWithConfiguredTerminator(apiSendInput, session.id, plan.targetPayload, terminatorMode, {
        normalizeMode: normalizeSendTerminatorMode,
        delayedSubmitMs
      });
    }

    const submittedAt = Date.now();
    for (const session of plan.targetSessions) {
      recordCommandSubmission(session.id, {
        source: plan.source === "paste" ? "paste" : "input",
        text: plan.targetPayload,
        submittedAt
      });
    }

    clearPendingSend({ renderAfterClear: false });
    if (plan.source !== "paste") {
      setCommandValue("");
    }
    setCommandPreview("");
    clearCommandSuggestions();
    clearError();
    if (plan.routeFeedback) {
      setCommandFeedback(plan.routeFeedback);
    }
    resetSlashHistoryNavigationState();
    debugLog("command.send.ok", {
      activeSessionId: plan.targetSessions[0]?.id || "",
      directRoute: plan.directRouteMatched === true,
      source: plan.source || "composer"
    });
    render();
  }

  async function submitCommand() {
    resetCommandAutocompleteState();
    const command = getCommandValue();
    if (!command.trim()) {
      return;
    }
    clearPendingSend({ renderAfterClear: false });

    const interpreted = resolveDirectTargetedControlInput(command) || interpretComposerInput(command);
    if (interpreted.kind === "quick-switch") {
      const state = getState();
      const resolved = resolveQuickSwitchTarget(interpreted.selector, state.sessions);
      if (resolved.error) {
        setCommandFeedback(resolved.error);
        return;
      }
      const result =
        resolved.kind === "session" ? activateSessionTarget(resolved.target) : activateDeckTarget(resolved.target);
      setCommandFeedback(result.message);
      setCommandValue("");
      setCommandPreview("");
      clearCommandSuggestions();
      render();
      return;
    }

    if (interpreted.kind === "control") {
      debugLog("command.control.start", {
        command: interpreted.command,
        argsCount: interpreted.args.length
      });
      try {
        const feedback = await executeControlCommand(interpreted);
        setCommandFeedback(feedback);
        recordSlashHistory(command);
        debugLog("command.control.ok", { command: interpreted.command });
        setCommandValue("");
        setCommandPreview("");
        clearCommandSuggestions();
        resetSlashHistoryNavigationState();
        render();
      } catch (err) {
        setCommandFeedback(getErrorMessage(err, "Failed to execute control command."));
      }
      return;
    }

    if (interpreted.kind === "control-script") {
      debugLog("command.control-script.start", {
        steps: Array.isArray(interpreted.commands) ? interpreted.commands.length : 0,
        mode: interpreted.mode || "multiline"
      });
      if (runWorkflowDetailed) {
        try {
          const result = await runWorkflowDetailed(interpreted);
          setCommandFeedback(result?.feedback || "");
          recordSlashHistory(command);
          setCommandValue("");
          setCommandPreview("");
          clearCommandSuggestions();
          resetSlashHistoryNavigationState();
          render();
        } catch (err) {
          setCommandFeedback(getErrorMessage(err, "Failed to execute command script."));
        }
        return;
      }
      try {
        const commands = Array.isArray(interpreted.commands) ? interpreted.commands : [];
        const results = [];
        let stopped = false;
        for (const step of commands) {
          const result = await executeControlCommandDetailed(step);
          results.push({
            raw: step?.raw || "",
            feedback: result?.feedback || "",
            ok: result?.ok === true
          });
          if (result?.ok !== true) {
            stopped = true;
            break;
          }
        }
        setCommandFeedback(formatControlScriptFeedback(results, { stopped, total: commands.length }));
        recordSlashHistory(command);
        setCommandValue("");
        setCommandPreview("");
        clearCommandSuggestions();
        resetSlashHistoryNavigationState();
        render();
      } catch (err) {
        setCommandFeedback(getErrorMessage(err, "Failed to execute command script."));
      }
      return;
    }

    const plan = resolveSendPlan(interpreted);
    if (!plan) {
      return;
    }
    if (plan.error) {
      setCommandFeedback(plan.error);
      return;
    }

    const guardResult = evaluateSendSafety({
      sessions: plan.targetSessions,
      text: plan.targetPayload,
      directRoute: plan.directRouteMatched === true,
      recentTargetSwitchAt: getLastActiveSessionSwitchAt(),
      formatSessionToken,
      formatSessionDisplayName
    });

    if (guardResult.requiresConfirmation) {
      pendingSend = {
        command,
        plan,
        guardResult
      };
      setCommandGuardState({
        active: true,
        summary: guardResult.summary,
        reasons: formatCommandGuardReasons(guardResult.reasons),
        preview: plan.targetPayload
      });
      render();
      return;
    }

    try {
      await executeSendPlan(plan);
    } catch {
      setError("Failed to send command.");
    }
  }

  async function confirmPendingSend() {
    if (!pendingSend?.plan) {
      return false;
    }
    const plan = pendingSend.plan;
    try {
      await executeSendPlan(plan);
      return true;
    } catch {
      setError("Failed to send command.");
      return false;
    }
  }

  async function submitTerminalPaste(sessionId, text) {
    const payload = String(text || "");
    if (!payload) {
      return false;
    }

    clearPendingSend({ renderAfterClear: false });
    const plan = resolveSingleSessionPlan(sessionId, payload, {
      source: "paste",
      activateTargetBeforeSend: true
    });
    if (!plan || plan.error) {
      if (plan?.error) {
        setCommandFeedback(plan.error);
      }
      return false;
    }

    const guardResult = evaluateSendSafety({
      sessions: plan.targetSessions,
      text: plan.targetPayload,
      directRoute: false,
      recentTargetSwitchAt: getLastActiveSessionSwitchAt(),
      formatSessionToken,
      formatSessionDisplayName
    });

    if (guardResult.requiresConfirmation) {
      pendingSend = {
        command: "",
        plan,
        guardResult
      };
      setCommandGuardState({
        active: true,
        summary: guardResult.summary,
        reasons: formatCommandGuardReasons(guardResult.reasons),
        preview: plan.targetPayload
      });
      render();
      return false;
    }

    try {
      await executeSendPlan(plan);
      return true;
    } catch {
      setError("Failed to paste into terminal.");
      return false;
    }
  }

  function cancelPendingSend() {
    if (!pendingSend) {
      return false;
    }
    clearPendingSend({ renderAfterClear: true });
    setCommandFeedback("Command send cancelled.");
    return true;
  }

  function resolveCustomPreview(custom, rawInput) {
    const state = getState();
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const decks = Array.isArray(state.decks) ? state.decks : [];
    const normalized = normalizeCustomCommandRecord(custom);
    if (!normalized) {
      return "";
    }

    const invocation = parseCustomCommandInvocation(rawInput, normalized);
    if (!invocation.ok) {
      return invocation.error;
    }

    let targetSessions = [];
    if (invocation.targetSelector) {
      const resolvedTargets = resolveTargetSelectors(invocation.targetSelector, sessions, {
        source: "slash",
        scopeMode: "active-deck",
        activeDeckId: getActiveDeck()?.id || ""
      });
      if (resolvedTargets.error) {
        return resolvedTargets.error;
      }
      targetSessions = Array.isArray(resolvedTargets.sessions) ? resolvedTargets.sessions : [];
    } else {
      const activeSession = sessions.find((session) => session.id === state.activeSessionId) || null;
      targetSessions = activeSession ? [activeSession] : [];
    }

    if (targetSessions.length === 0) {
      return "No active session for custom command preview.";
    }
    if (targetSessions.length > 1) {
      return `Custom command preview varies across ${targetSessions.length} target sessions.`;
    }

    const session = targetSessions[0];
    const effectiveCustom = normalizeCustomCommandRecord(getCustomCommandState(normalized.name, { sessionId: session.id })) || normalized;
    const deck = decks.find((entry) => entry?.id === session?.deckId) || null;
    const rendered = renderCustomCommandForSession(effectiveCustom, session, deck, invocation.parameterAssignments);
    return rendered.ok ? rendered.text : rendered.error;
  }

  async function refreshCommandPreview() {
    const rawInput = getCommandValue();
    const interpreted = interpretComposerInput(rawInput);
    if (interpreted.kind === "quick-switch") {
      const preview = formatQuickSwitchPreview(interpreted.selector, getState().sessions);
      setCommandPreview(preview);
      return;
    }
    if (interpreted.kind !== "control") {
      setCommandPreview("");
      return;
    }

    const commandRaw = interpreted.command;
    const command = commandRaw.toLowerCase();
    if (!commandRaw || command === "custom" || command === "help") {
      setCommandPreview("");
      return;
    }

    const custom = getCustomCommandState(commandRaw);
    if (custom) {
      setCommandPreview(resolveCustomPreview(custom, rawInput));
      return;
    }
    if (interpreted.args.length > 1) {
      setCommandPreview("");
      return;
    }
    setCommandPreview("");
  }

  function scheduleCommandPreview() {
    clearPreviewTimer();
    commandPreviewTimer = setTimeoutFn(() => {
      commandPreviewTimer = null;
      refreshCommandPreview();
    }, 120);
  }

  function dispose() {
    clearPreviewTimer();
    clearPendingSend({ renderAfterClear: false });
  }

  return {
    submitCommand,
    submitTerminalPaste,
    confirmPendingSend,
    cancelPendingSend,
    clearPendingSend,
    refreshCommandPreview,
    scheduleCommandPreview,
    dispose
  };
}
