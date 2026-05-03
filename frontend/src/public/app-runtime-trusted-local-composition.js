import { normalizeControlText as defaultNormalizeControlText } from "./session-control-runtime-state.js";
import { createTrustedLocalHandoffRuntimeController as defaultCreateTrustedLocalHandoffRuntimeController } from "./trusted-local-handoff-runtime-controller.js";
import { createTrustedLocalLayoutRuntimeController as defaultCreateTrustedLocalLayoutRuntimeController } from "./trusted-local-layout-runtime-controller.js";

export function resolveTrustedLocalLayoutTargetDeckId(options = {}) {
  const normalizeControlText =
    typeof options.normalizeControlText === "function" ? options.normalizeControlText : defaultNormalizeControlText;
  const runtimeOptions =
    options.runtimeOptions && typeof options.runtimeOptions === "object" ? options.runtimeOptions : {};
  const directDeckId = normalizeControlText(runtimeOptions.deckId);
  if (directDeckId) {
    return directDeckId;
  }
  const normalizedSessionId = normalizeControlText(runtimeOptions.sessionId);
  if (normalizedSessionId) {
    const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;
    const resolveSessionDeckId =
      typeof options.resolveSessionDeckId === "function"
        ? options.resolveSessionDeckId
        : (session) => normalizeControlText(session?.deckId);
    const targetSession = getSessionById(normalizedSessionId) || normalizedSessionId;
    const resolvedDeckId = normalizeControlText(resolveSessionDeckId(targetSession));
    if (resolvedDeckId) {
      return resolvedDeckId;
    }
  }
  const getActiveDeckId = typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "";
  return normalizeControlText(getActiveDeckId());
}

export function createAppRuntimeTrustedLocalComposition(options = {}) {
  const createTrustedLocalLayoutRuntimeController =
    typeof options.createTrustedLocalLayoutRuntimeController === "function"
      ? options.createTrustedLocalLayoutRuntimeController
      : defaultCreateTrustedLocalLayoutRuntimeController;
  const createTrustedLocalHandoffRuntimeController =
    typeof options.createTrustedLocalHandoffRuntimeController === "function"
      ? options.createTrustedLocalHandoffRuntimeController
      : defaultCreateTrustedLocalHandoffRuntimeController;
  const normalizeControlText =
    typeof options.normalizeControlText === "function" ? options.normalizeControlText : defaultNormalizeControlText;
  const getRuntimeClientId = typeof options.getRuntimeClientId === "function" ? options.getRuntimeClientId : () => "";
  const getSessionById = typeof options.getSessionById === "function" ? options.getSessionById : () => null;
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : () => "";
  const getActiveDeckId = typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "";

  const trustedLocalLayoutRuntimeController = createTrustedLocalLayoutRuntimeController({
    localStorageRef: options.localStorageRef || options.windowRef?.localStorage || null,
    captureCurrentLayout: options.captureCurrentLayout,
    applyLayoutSnapshot: options.applyLayoutSnapshot
  });

  const trustedLocalHandoffRuntimeController = createTrustedLocalHandoffRuntimeController({
    promptEl: options.promptEl || null,
    promptMessageEl: options.promptMessageEl || null,
    promptYesBtn: options.promptYesBtn || null,
    promptNoBtn: options.promptNoBtn || null,
    openBtn: options.openBtn || null,
    dialogEl: options.dialogEl || null,
    dialogMetaEl: options.dialogMetaEl || null,
    dialogCloseBtn: options.dialogCloseBtn || null,
    dialogTakeAllBtn: options.dialogTakeAllBtn || null,
    dialogTakeDeckBtn: options.dialogTakeDeckBtn || null,
    dialogTakeSessionBtn: options.dialogTakeSessionBtn || null,
    getState: options.getState,
    getSessionById,
    getActiveDeck: options.getActiveDeck,
    resolveDeckName: options.resolveDeckName,
    formatSessionToken: options.formatSessionToken,
    formatSessionDisplayName: options.formatSessionDisplayName,
    canTakeSessionControl: options.canTakeSessionControl,
    isReadOnlyMode: options.isReadOnlyMode,
    takeSessionControl: options.takeSessionControl,
    takeSessionControlScope: options.takeSessionControlScope,
    applyRuntimeEvent: options.applyRuntimeEvent,
    applyDeviceLocalLayout: (scope, runtimeOptions = {}) =>
      trustedLocalLayoutRuntimeController?.applyLayoutForClient?.(getRuntimeClientId(), {
        scope,
        targetDeckId: resolveTrustedLocalLayoutTargetDeckId({
          normalizeControlText,
          runtimeOptions,
          getSessionById,
          resolveSessionDeckId,
          getActiveDeckId
        })
      }) || Promise.resolve({ applied: false, captured: false }),
    setCommandFeedback: options.setCommandFeedback,
    setError: options.setError,
    getErrorMessage: options.getErrorMessage,
    requestRender: options.requestRender
  });
  trustedLocalHandoffRuntimeController.bindUiEvents?.();

  return {
    trustedLocalLayoutRuntimeController,
    trustedLocalHandoffRuntimeController
  };
}
