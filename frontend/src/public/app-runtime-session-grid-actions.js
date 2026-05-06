import { normalizeControlText } from "./session-control-runtime-state.js";

export function createAppRuntimeSessionGridActions(options = {}) {
  const api = options.api || null;
  const defaultDeckId = String(options.defaultDeckId || "default").trim() || "default";
  const getAppLayoutDeckFacadeController =
    typeof options.getAppLayoutDeckFacadeController === "function"
      ? options.getAppLayoutDeckFacadeController
      : () => null;
  const getAppSessionRuntimeFacadeController =
    typeof options.getAppSessionRuntimeFacadeController === "function"
      ? options.getAppSessionRuntimeFacadeController
      : () => null;
  const getAppRuntimeStateController =
    typeof options.getAppRuntimeStateController === "function" ? options.getAppRuntimeStateController : () => null;
  const getAppCommandUiFacadeController =
    typeof options.getAppCommandUiFacadeController === "function"
      ? options.getAppCommandUiFacadeController
      : () => null;
  const getTrustedLocalHandoffRuntimeController =
    typeof options.getTrustedLocalHandoffRuntimeController === "function"
      ? options.getTrustedLocalHandoffRuntimeController
      : () => null;
  const requestText = typeof options.requestText === "function" ? options.requestText : () => Promise.resolve(null);
  const confirmAction =
    typeof options.confirmAction === "function" ? options.confirmAction : () => Promise.resolve(false);
  const renameTrustedLocalDevice =
    typeof options.renameTrustedLocalDevice === "function"
      ? options.renameTrustedLocalDevice
      : () => Promise.resolve(null);

  function getSessionRuntime() {
    return getAppSessionRuntimeFacadeController() || null;
  }

  function getRuntimeState() {
    return getAppRuntimeStateController() || null;
  }

  function getCommandUi() {
    return getAppCommandUiFacadeController() || null;
  }

  function clearError() {
    getRuntimeState()?.clearError?.();
  }

  function setErrorMessage(error, fallback) {
    const message = getCommandUi()?.getErrorMessage?.(error, fallback) || fallback;
    getCommandUi()?.setError?.(message);
  }

  function formatSessionToken(sessionId) {
    return getSessionRuntime()?.formatSessionToken?.(sessionId) || "?";
  }

  function formatSessionDisplayName(session) {
    return getSessionRuntime()?.formatSessionDisplayName?.(session) || session?.id || "session";
  }

  function applyRuntimeEvent(event, runtimeOptions) {
    return getSessionRuntime()?.applyRuntimeEvent?.(event, runtimeOptions) === true;
  }

  async function onRenameDeck() {
    try {
      await getAppLayoutDeckFacadeController()?.renameDeckFlow?.();
      clearError();
    } catch (error) {
      setErrorMessage(error, "Failed to rename deck.");
    }
  }

  async function onDeleteDeck() {
    try {
      await getAppLayoutDeckFacadeController()?.deleteDeckFlow?.();
      clearError();
    } catch (error) {
      setErrorMessage(error, "Failed to delete deck.");
    }
  }

  async function onSwapDeckSessions(leftSession, rightSession) {
    const leftId = String(leftSession?.id || "").trim();
    const rightId = String(rightSession?.id || "").trim();
    if (!leftId || !rightId || leftId === rightId) {
      return;
    }
    const leftTokenBefore = formatSessionToken(leftId);
    const rightTokenBefore = formatSessionToken(rightId);
    try {
      const result = await api?.swapSessionQuickIds?.(leftId, rightId);
      if (!result?.leftSession || !result?.rightSession) {
        throw new Error("Failed to swap session quick IDs.");
      }
      applyRuntimeEvent({ type: "session.updated", session: result.leftSession });
      applyRuntimeEvent({ type: "session.updated", session: result.rightSession });
      getCommandUi()?.setCommandFeedback?.(
        `Swapped quick IDs: [${leftTokenBefore}] ${formatSessionDisplayName(leftSession)} <-> [${rightTokenBefore}] ${formatSessionDisplayName(rightSession)}.`
      );
      clearError();
      getCommandUi()?.render?.();
    } catch (error) {
      setErrorMessage(error, "Failed to swap session quick IDs.");
    }
  }

  function canDeleteDeck(deck) {
    return String(deck?.id || "") !== defaultDeckId;
  }

  function requestSessionRename(session) {
    return requestText({
      title: "Rename Session",
      message: `Enter a new name for [${formatSessionToken(session?.id)}] ${formatSessionDisplayName(session)}.`,
      inputLabel: "Session Name",
      defaultValue: session?.name || session?.id || "",
      confirmLabel: "Rename"
    });
  }

  async function takeTrustedLocalControl(scope, runtimeOptions) {
    const result = await getTrustedLocalHandoffRuntimeController()?.takeControlScope?.(scope, runtimeOptions);
    const normalizedSessionId = normalizeControlText(runtimeOptions?.sessionId);
    if (normalizedSessionId) {
      return (
        result?.updatedSessions?.find?.((session) => session?.id === normalizedSessionId) ||
        getSessionRuntime()?.getSessionById?.(normalizedSessionId) ||
        null
      );
    }
    return result?.updatedSessions?.[0] || null;
  }

  function confirmForgetSessionControlClient(session, targetClient) {
    return confirmAction({
      title: "Forget Stale Device",
      message: `Forget ${targetClient?.label || targetClient?.clientId || "this stale device"} from [${formatSessionToken(
        session?.id
      )}] ${formatSessionDisplayName(session)}?`,
      confirmLabel: "Forget"
    });
  }

  return {
    onRenameDeck,
    onDeleteDeck,
    onSwapDeckSessions,
    canDeleteDeck,
    requestSessionRename,
    renameTrustedLocalDevice,
    takeTrustedLocalControl,
    confirmForgetSessionControlClient
  };
}
