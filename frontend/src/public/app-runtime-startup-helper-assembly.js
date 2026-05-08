import { createAppRuntimeStartupComposition as defaultCreateAppRuntimeStartupComposition } from "./app-runtime-startup-composition.js";

export function createAppRuntimeStartupHelperAssembly(options = {}) {
  const {
    createAppRuntimeStartupComposition: createAppRuntimeStartupCompositionOption,
    layoutFoundationStateRef = null,
    traceDebugController = null,
    sessionControlRuntimeController = null,
    trustedLocalClientRuntimeController = null,
    startupBackupRuntimeController = null,
    appCommandUiFacadeController = null,
    ...startupCompositionOptions
  } = options;

  const createAppRuntimeStartupComposition =
    typeof createAppRuntimeStartupCompositionOption === "function"
      ? createAppRuntimeStartupCompositionOption
      : defaultCreateAppRuntimeStartupComposition;

  const getTerminalSettings =
    typeof startupCompositionOptions.getTerminalSettings === "function"
      ? startupCompositionOptions.getTerminalSettings
      : () => layoutFoundationStateRef?.terminalSettings || null;
  const recordTrace =
    typeof startupCompositionOptions.recordTrace === "function"
      ? startupCompositionOptions.recordTrace
      : (entry) => traceDebugController?.record?.("ws.event", entry);
  const consumeOriginHandoffSourceFromWindow =
    typeof startupCompositionOptions.consumeOriginHandoffSourceFromWindow === "function"
      ? startupCompositionOptions.consumeOriginHandoffSourceFromWindow
      : () => sessionControlRuntimeController?.consumeOriginHandoffSourceFromWindow?.() ?? null;
  const ensureStartupBackup =
    typeof startupCompositionOptions.ensureStartupBackup === "function"
      ? startupCompositionOptions.ensureStartupBackup
      : () => startupBackupRuntimeController?.ensureStartupBackup?.();
  const getTrustedLocalClientIdentity =
    typeof startupCompositionOptions.getTrustedLocalClientIdentity === "function"
      ? startupCompositionOptions.getTrustedLocalClientIdentity
      : () => trustedLocalClientRuntimeController?.getClientIdentity?.() || null;
  const ensureTrustedLocalClientIdentity =
    typeof startupCompositionOptions.ensureTrustedLocalClientIdentity === "function"
      ? startupCompositionOptions.ensureTrustedLocalClientIdentity
      : () => trustedLocalClientRuntimeController?.ensureClientIdentity?.() || null;
  const setRuntimeClientIdentityCreatedOnThisOrigin =
    typeof startupCompositionOptions.setRuntimeClientIdentityCreatedOnThisOrigin === "function"
      ? startupCompositionOptions.setRuntimeClientIdentityCreatedOnThisOrigin
      : (value) => sessionControlRuntimeController?.setRuntimeClientIdentityCreatedOnThisOrigin?.(value);
  const setTrustedLocalClientLabel =
    typeof startupCompositionOptions.setTrustedLocalClientLabel === "function"
      ? startupCompositionOptions.setTrustedLocalClientLabel
      : (label) => sessionControlRuntimeController?.setTrustedLocalClientLabel?.(label);
  const applyInitializationError =
    typeof startupCompositionOptions.applyInitializationError === "function"
      ? startupCompositionOptions.applyInitializationError
      : (message) => appCommandUiFacadeController?.setError?.(message);

  return createAppRuntimeStartupComposition({
    ...startupCompositionOptions,
    traceDebugController,
    sessionControlRuntimeController,
    trustedLocalClientRuntimeController,
    startupBackupRuntimeController,
    appCommandUiFacadeController,
    getTerminalSettings,
    recordTrace,
    consumeOriginHandoffSourceFromWindow,
    ensureStartupBackup,
    getTrustedLocalClientIdentity,
    ensureTrustedLocalClientIdentity,
    setRuntimeClientIdentityCreatedOnThisOrigin,
    setTrustedLocalClientLabel,
    applyInitializationError
  });
}
