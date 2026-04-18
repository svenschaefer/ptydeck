import {
  ORIGIN_HANDOFF_QUERY_PARAM,
  buildCanonicalOriginRedirectUrl,
  canForgetSessionControlClient as canForgetSessionControlClientState,
  canManageTrustedLocalDevice as canManageTrustedLocalDeviceState,
  canReleaseSessionControl as canReleaseSessionControlState,
  canTakeSessionControl as canTakeSessionControlState,
  canTransferSessionControl as canTransferSessionControlState,
  canUseImplicitOwnerFallback as canUseImplicitOwnerFallbackState,
  canWriteToSession as canWriteToSessionState,
  getAttachedClientsForSession,
  getCurrentSessionController,
  getLocalDeviceLabel as getLocalDeviceLabelState,
  getSessionControlBadgeState as getSessionControlBadgeStateState,
  getSessionControlClientLabel,
  getSessionControlState,
  getSessionControlSummary as getSessionControlSummaryState,
  getTakeOrReclaimControlLabel as getTakeOrReclaimControlLabelState,
  getSessionWriteBlockMessage as getSessionWriteBlockMessageState,
  getWindowOrigin,
  listOriginHandoffRepairableSessions as listOriginHandoffRepairableSessionsState,
  normalizeControlText,
  normalizeOriginValue,
  readOriginHandoffSourceOrigin,
  clearOriginHandoffSearchParam
} from "./session-control-runtime-state.js";

function clearNodeChildren(node) {
  if (!node) {
    return;
  }
  if (typeof node.replaceChildren === "function") {
    node.replaceChildren();
    return;
  }
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function appendNodeText(node, text) {
  if (!node) {
    return;
  }
  node.textContent = typeof text === "string" ? text : String(text || "");
}

export function createSessionControlRuntimeController(options = {}) {
  const {
    windowRef = globalThis.window,
    documentRef = globalThis.document,
    config = {},
    uiState = {},
    api = null,
    requestRender = () => {},
    setCommandFeedback = () => {},
    clearCommandFeedbackAction = () => {},
    setCommandFeedbackAction = () => {},
    clearError = () => {},
    getSessions = () => [],
    getSessionById = () => null,
    formatSessionToken = (sessionId) => String(sessionId || "").trim() || "?",
    formatSessionDisplayName = (session) =>
      normalizeControlText(session?.name) || normalizeControlText(session?.id) || "",
    takeSessionControlScope = async () => ({}),
    renameTrustedLocalClientIdentity = (label) => ({ label }),
    retryBlockedAction = async () => {},
    applyResizeForSession = () => {},
    showControlPane = () => {},
    debugLog = () => {}
  } = options;

  let runtimeClientId = "";
  let trustedLocalClientLabel = "";
  let commandFeedbackActionMeta = null;
  let runtimeClientIdentityCreatedOnThisOrigin = false;
  let originHandoffSourceOrigin = "";
  let originHandoffAutoRepairAttempted = false;

  function render() {
    requestRender?.();
  }

  function setAccessState(nextState = {}) {
    uiState.accessMode = typeof nextState.accessMode === "string" ? nextState.accessMode : "operator";
    uiState.readOnlyMode = nextState.readOnly === true;
    uiState.accessSummary = typeof nextState.summary === "string" ? nextState.summary : "";
    render();
  }

  function isReadOnlyMode() {
    return uiState.readOnlyMode === true;
  }

  function getReadOnlyModeMessage() {
    if (uiState.accessSummary) {
      return `${uiState.accessSummary}. Write actions are disabled.`;
    }
    return "Read-only spectator mode. Write actions are disabled.";
  }

  function getSessionControlContext() {
    return {
      runtimeClientId,
      trustedLocalClientLabel,
      isReadOnlyMode,
      getReadOnlyModeMessage,
      runtimeClientIdentityCreatedOnThisOrigin,
      originHandoffSourceOrigin
    };
  }

  function getLocalDeviceLabel(session = null) {
    return getLocalDeviceLabelState(session, getSessionControlContext());
  }

  function canUseImplicitOwnerFallback(session) {
    return canUseImplicitOwnerFallbackState(session, getSessionControlContext());
  }

  function canWriteToSession(session) {
    return canWriteToSessionState(session, getSessionControlContext());
  }

  function getSessionWriteBlockMessage(session) {
    return getSessionWriteBlockMessageState(session, getSessionControlContext());
  }

  function getSessionControlSummary(session) {
    return getSessionControlSummaryState(session, getSessionControlContext());
  }

  function canTakeSessionControl(session) {
    return canTakeSessionControlState(session, getSessionControlContext());
  }

  function listOriginHandoffRepairableSessions(sessions) {
    return listOriginHandoffRepairableSessionsState(sessions, getSessionControlContext());
  }

  function canReleaseSessionControl(session) {
    return canReleaseSessionControlState(session, getSessionControlContext());
  }

  function canTransferSessionControl(session, targetClientId) {
    return canTransferSessionControlState(session, targetClientId, getSessionControlContext());
  }

  function canManageTrustedLocalDevice(session) {
    return canManageTrustedLocalDeviceState(session, getSessionControlContext());
  }

  function canForgetSessionControlClient(session, targetClientId) {
    return canForgetSessionControlClientState(session, targetClientId, getSessionControlContext());
  }

  function getTakeOrReclaimControlLabel(session) {
    return getTakeOrReclaimControlLabelState(session, getSessionControlContext());
  }

  function getSessionControlBadgeState(session) {
    return getSessionControlBadgeStateState(session, getSessionControlContext());
  }

  function maybeRedirectToCanonicalOrigin() {
    const canonicalOrigin = normalizeOriginValue(config.canonicalOrigin);
    const currentOrigin = getWindowOrigin(windowRef);
    if (!canonicalOrigin || !currentOrigin || canonicalOrigin === currentOrigin) {
      return false;
    }
    const targetUrl = buildCanonicalOriginRedirectUrl(
      windowRef,
      canonicalOrigin,
      currentOrigin,
      ORIGIN_HANDOFF_QUERY_PARAM
    );
    if (typeof windowRef?.location?.replace === "function") {
      windowRef.location.replace(targetUrl);
      return true;
    }
    if (windowRef?.location) {
      windowRef.location.href = targetUrl;
      return true;
    }
    return false;
  }

  function consumeOriginHandoffSourceFromWindow() {
    originHandoffSourceOrigin = readOriginHandoffSourceOrigin(windowRef);
    clearOriginHandoffSearchParam(windowRef);
    return originHandoffSourceOrigin;
  }

  async function maybeAutoRepairOriginHandoffControl(sessions = getSessions()) {
    if (originHandoffAutoRepairAttempted || isReadOnlyMode()) {
      return false;
    }
    const repairableSessions = listOriginHandoffRepairableSessions(sessions);
    if (repairableSessions.length === 0) {
      return false;
    }
    const handoffOrigin = originHandoffSourceOrigin;
    originHandoffAutoRepairAttempted = true;
    debugLog("trusted_local.origin_handoff_auto_repair.start", {
      handoffOrigin,
      sessionCount: repairableSessions.length
    });
    try {
      for (const session of repairableSessions) {
        const sessionId = normalizeControlText(session?.id);
        if (!sessionId) {
          continue;
        }
        await takeSessionControlScope("session", { sessionId });
      }
      originHandoffSourceOrigin = "";
      setCommandFeedback(
        `Detected origin handoff from ${handoffOrigin}. This device reclaimed control for the affected sessions automatically.`
      );
      debugLog("trusted_local.origin_handoff_auto_repair.ok", {
        handoffOrigin,
        sessionCount: repairableSessions.length
      });
      return true;
    } catch (error) {
      debugLog("trusted_local.origin_handoff_auto_repair.error", {
        handoffOrigin,
        sessionCount: repairableSessions.length,
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  function setRuntimeClientId(clientId) {
    const nextClientId = normalizeControlText(clientId);
    if (runtimeClientId === nextClientId) {
      return runtimeClientId;
    }
    runtimeClientId = nextClientId;
    api?.setSessionControlClientId?.(runtimeClientId);
    render();
    return runtimeClientId;
  }

  function setTrustedLocalClientLabel(label) {
    trustedLocalClientLabel = normalizeControlText(label);
    return trustedLocalClientLabel;
  }

  function setRuntimeClientIdentityCreatedOnThisOrigin(value) {
    runtimeClientIdentityCreatedOnThisOrigin = value === true;
    return runtimeClientIdentityCreatedOnThisOrigin;
  }

  function setOriginHandoffSourceOrigin(origin) {
    originHandoffSourceOrigin = normalizeOriginValue(origin);
    return originHandoffSourceOrigin;
  }

  function setCommandFeedbackActionMeta(meta) {
    commandFeedbackActionMeta =
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? { ...meta }
        : null;
    return commandFeedbackActionMeta;
  }

  async function renameTrustedLocalDevice(sessionId, label) {
    const normalizedSessionId = normalizeControlText(sessionId);
    const session = normalizedSessionId ? getSessionById(normalizedSessionId) : null;
    if (!canManageTrustedLocalDevice(session)) {
      throw new Error(getSessionWriteBlockMessage(session) || "This device cannot rename its trusted-local attachment yet.");
    }
    const normalizedLabel = normalizeControlText(label);
    if (!normalizedLabel) {
      throw new Error("Device name cannot be empty.");
    }
    const updated = await api.renameSessionControlClient(normalizedSessionId, normalizedLabel);
    const identity = renameTrustedLocalClientIdentity(normalizedLabel);
    trustedLocalClientLabel = normalizeControlText(identity?.label);
    clearCommandFeedbackAction({ render: false });
    render();
    return updated;
  }

  async function forgetTrustedLocalDevice(sessionId, clientId) {
    const normalizedSessionId = normalizeControlText(sessionId);
    const session = normalizedSessionId ? getSessionById(normalizedSessionId) : null;
    if (!canForgetSessionControlClient(session, clientId)) {
      throw new Error("Only stale offline devices can be forgotten from this session.");
    }
    const updated = await api.forgetSessionControlClient(normalizedSessionId, clientId);
    clearCommandFeedbackAction({ render: false });
    return updated;
  }

  function showBlockedWriteReclaimUi(session, options = {}) {
    if (!session) {
      commandFeedbackActionMeta = null;
      clearCommandFeedbackAction({ render: false });
      return false;
    }
    const message = normalizeControlText(options.message) || getSessionWriteBlockMessage(session);
    if (!canTakeSessionControl(session)) {
      commandFeedbackActionMeta = null;
      clearCommandFeedbackAction({ render: false });
      if (message) {
        setCommandFeedback(message);
      }
      return false;
    }
    if (message) {
      setCommandFeedback(message);
    }
    const retryAction =
      options.retryAction && typeof options.retryAction === "object" && !Array.isArray(options.retryAction)
        ? { ...options.retryAction }
        : null;
    commandFeedbackActionMeta = {
      scope: "session",
      sessionId: session.id,
      retryAction
    };
    setCommandFeedbackAction({
      visible: true,
      label: retryAction ? `${getTakeOrReclaimControlLabel(session)} and Retry` : getTakeOrReclaimControlLabel(session),
      title: message,
      sessionId: session.id
    });
    showControlPane();
    return true;
  }

  async function handleCommandFeedbackAction(sessionId) {
    const normalizedSessionId = normalizeControlText(sessionId);
    if (!normalizedSessionId) {
      return false;
    }
    const session = getSessionById(normalizedSessionId);
    const retryAction = commandFeedbackActionMeta?.retryAction || null;
    const completeAction = async (feedbackMessage = "") => {
      commandFeedbackActionMeta = null;
      clearCommandFeedbackAction({ render: false });
      if (retryAction?.kind === "resize") {
        applyResizeForSession(normalizedSessionId, { force: true });
      } else if (
        retryAction?.kind === "send" ||
        retryAction?.kind === "paste" ||
        retryAction?.kind === "paste-continue"
      ) {
        await retryBlockedAction(retryAction);
      } else if (feedbackMessage) {
        setCommandFeedback(feedbackMessage);
      }
      clearError();
      return true;
    };
    if (canWriteToSession(session)) {
      return completeAction(
        `This device already controls [${formatSessionToken(normalizedSessionId)}] ${
          formatSessionDisplayName(session) || normalizedSessionId
        }.`
      );
    }
    if (!canTakeSessionControl(session)) {
      commandFeedbackActionMeta = null;
      clearCommandFeedbackAction({ render: false });
      throw new Error(getSessionWriteBlockMessage(session) || "This session cannot be controlled from this device.");
    }
    const reclaiming = getCurrentSessionController(session)?.active !== true;
    await takeSessionControlScope("session", { sessionId: normalizedSessionId });
    return completeAction(
      retryAction
        ? ""
        : `${reclaiming ? "Reclaimed" : "Took"} control of [${formatSessionToken(normalizedSessionId)}] ${
            formatSessionDisplayName(session) || normalizedSessionId
          }.`
    );
  }

  function getSessionLastInputSummary(session) {
    const lastInput = getSessionControlState(session)?.lastInput;
    if (!lastInput) {
      return "No input has been recorded for this session yet.";
    }
    const actorLabel =
      normalizeControlText(lastInput.clientId) && normalizeControlText(lastInput.clientId) === runtimeClientId
        ? "you"
        : getSessionControlClientLabel(lastInput);
    return `Last input: ${actorLabel}.`;
  }

  function renderSessionControlClients(container, session) {
    if (!container) {
      return;
    }
    clearNodeChildren(container);
    const clients = getAttachedClientsForSession(session);
    if (!clients.length) {
      appendNodeText(container, "No attached clients.");
      return;
    }
    if (!documentRef || typeof documentRef.createElement !== "function") {
      appendNodeText(
        container,
        clients
          .map((client) => {
            const isLocalClient = normalizeControlText(client?.clientId) === runtimeClientId;
            const name = isLocalClient ? "this device" : getSessionControlClientLabel(client);
            const status = client?.active === true ? "connected" : "offline window";
            return `${name} · ${status}`;
          })
          .join("\n")
      );
      return;
    }
    for (const client of clients) {
      const row = documentRef.createElement("div");
      row.className = "session-control-client";
      const meta = documentRef.createElement("div");
      meta.className = "session-control-client-meta";
      const title = documentRef.createElement("p");
      title.className = "session-control-client-name";
      const isLocalClient = normalizeControlText(client?.clientId) === runtimeClientId;
      title.textContent = isLocalClient ? "This device" : "Other device";
      const detail = documentRef.createElement("p");
      detail.className = "session-control-client-detail";
      const detailParts = [];
      if (isLocalClient) {
        detailParts.push(getLocalDeviceLabel(session));
      } else {
        detailParts.push(getSessionControlClientLabel(client));
      }
      if (normalizeControlText(client?.accessMode) === "spectator") {
        detailParts.push("read only");
      }
      if (normalizeControlText(getCurrentSessionController(session)?.clientId) === normalizeControlText(client?.clientId)) {
        detailParts.push(client?.active === true ? "controlling" : "reconnect pending");
      } else {
        detailParts.push(client?.active === true ? "connected" : "offline window");
      }
      if (Number.isInteger(client?.activeConnectionCount) && client.activeConnectionCount > 1) {
        detailParts.push(`${client.activeConnectionCount} tabs`);
      }
      detail.textContent = detailParts.join(" · ");
      meta.appendChild(title);
      meta.appendChild(detail);
      row.appendChild(meta);
      const actions = documentRef.createElement("div");
      actions.className = "session-control-client-actions";
      if (canTransferSessionControl(session, client?.clientId)) {
        const transferBtn = documentRef.createElement("button");
        transferBtn.type = "button";
        transferBtn.className = "session-control-transfer";
        transferBtn.textContent = "Transfer";
        transferBtn.dataset = transferBtn.dataset || {};
        transferBtn.dataset.sessionControlAction = "transfer";
        transferBtn.dataset.clientId = normalizeControlText(client?.clientId);
        actions.appendChild(transferBtn);
      }
      if (canForgetSessionControlClient(session, client?.clientId)) {
        const forgetBtn = documentRef.createElement("button");
        forgetBtn.type = "button";
        forgetBtn.className = "session-control-forget";
        forgetBtn.textContent = "Forget";
        forgetBtn.dataset = forgetBtn.dataset || {};
        forgetBtn.dataset.sessionControlAction = "forget";
        forgetBtn.dataset.clientId = normalizeControlText(client?.clientId);
        forgetBtn.dataset.clientLabel = getSessionControlClientLabel(client);
        actions.appendChild(forgetBtn);
      }
      const actionCount = Number(actions.childNodes?.length ?? actions.children?.length ?? 0);
      if (actionCount > 0) {
        row.appendChild(actions);
      }
      container.appendChild(row);
    }
  }

  function renderSessionControl(entry, session) {
    if (!entry || !session) {
      return;
    }
    const badgeState = getSessionControlBadgeState(session);
    if (entry.controlBadgeEl) {
      entry.controlBadgeEl.hidden = !badgeState.label;
      entry.controlBadgeEl.textContent = badgeState.label;
      entry.controlBadgeEl.className = "session-control-badge";
      if (badgeState.tone) {
        entry.controlBadgeEl.classList.add(`session-control-badge-${badgeState.tone}`);
      }
      if (badgeState.title) {
        entry.controlBadgeEl.setAttribute("title", badgeState.title);
      } else {
        entry.controlBadgeEl.removeAttribute("title");
      }
    }
    if (entry.sessionControlSummaryEl) {
      entry.sessionControlSummaryEl.textContent = `${getSessionControlSummary(session)} ${getSessionLastInputSummary(session)}`.trim();
    }
    if (entry.sessionControlTakeBtn) {
      const takeEnabled = canTakeSessionControl(session);
      const reclaiming = getCurrentSessionController(session)?.active !== true && takeEnabled;
      entry.sessionControlTakeBtn.textContent = getTakeOrReclaimControlLabel(session);
      entry.sessionControlTakeBtn.disabled = !takeEnabled;
      entry.sessionControlTakeBtn.setAttribute(
        "title",
        takeEnabled
          ? reclaiming
            ? "Reclaim active control for this session after another device disconnected."
            : "Take active control for this session."
          : getSessionWriteBlockMessage(session)
      );
    }
    if (entry.sessionControlReleaseBtn) {
      const releaseEnabled = canReleaseSessionControl(session);
      entry.sessionControlReleaseBtn.disabled = !releaseEnabled;
      entry.sessionControlReleaseBtn.setAttribute(
        "title",
        releaseEnabled
          ? "Release active control for this session."
          : "Only the active controller or another attached operator device can release control."
      );
    }
    if (entry.settingsApplyBtn) {
      const writable = canWriteToSession(session);
      entry.settingsApplyBtn.disabled = !writable;
      if (writable) {
        entry.settingsApplyBtn.removeAttribute("title");
      } else {
        entry.settingsApplyBtn.setAttribute("title", getSessionWriteBlockMessage(session));
      }
    }
    if (entry.sessionControlDeviceNameInput) {
      const localDeviceName = getLocalDeviceLabel(session);
      if (documentRef?.activeElement !== entry.sessionControlDeviceNameInput) {
        entry.sessionControlDeviceNameInput.value = localDeviceName;
      }
      entry.sessionControlDeviceNameInput.disabled = !canManageTrustedLocalDevice(session);
      entry.sessionControlDeviceNameInput.setAttribute("title", localDeviceName);
    }
    if (entry.sessionControlDeviceSaveBtn) {
      const canRenameDevice = canManageTrustedLocalDevice(session);
      entry.sessionControlDeviceSaveBtn.disabled = !canRenameDevice;
      entry.sessionControlDeviceSaveBtn.setAttribute(
        "title",
        canRenameDevice
          ? "Rename this trusted-local device for future reconnect and handoff flows."
          : getSessionWriteBlockMessage(session) || "This device must attach before it can be renamed."
      );
    }
    renderSessionControlClients(entry.sessionControlClientsEl, session);
  }

  return {
    setAccessState,
    isReadOnlyMode,
    getReadOnlyModeMessage,
    getSessionControlContext,
    getLocalDeviceLabel,
    canUseImplicitOwnerFallback,
    canWriteToSession,
    getSessionWriteBlockMessage,
    getSessionControlSummary,
    canTakeSessionControl,
    listOriginHandoffRepairableSessions,
    canReleaseSessionControl,
    canTransferSessionControl,
    canManageTrustedLocalDevice,
    canForgetSessionControlClient,
    getTakeOrReclaimControlLabel,
    getSessionControlBadgeState,
    maybeRedirectToCanonicalOrigin,
    consumeOriginHandoffSourceFromWindow,
    maybeAutoRepairOriginHandoffControl,
    setRuntimeClientId,
    getRuntimeClientId: () => runtimeClientId,
    setTrustedLocalClientLabel,
    getTrustedLocalClientLabel: () => trustedLocalClientLabel,
    setRuntimeClientIdentityCreatedOnThisOrigin,
    getRuntimeClientIdentityCreatedOnThisOrigin: () => runtimeClientIdentityCreatedOnThisOrigin,
    setOriginHandoffSourceOrigin,
    getOriginHandoffSourceOrigin: () => originHandoffSourceOrigin,
    setCommandFeedbackActionMeta,
    getCommandFeedbackActionMeta: () => commandFeedbackActionMeta,
    renameTrustedLocalDevice,
    forgetTrustedLocalDevice,
    showBlockedWriteReclaimUi,
    handleCommandFeedbackAction,
    renderSessionControlClients,
    renderSessionControl
  };
}
