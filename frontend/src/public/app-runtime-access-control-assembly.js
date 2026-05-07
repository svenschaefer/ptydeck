import { createAppRuntimeCompositionHelperAssembly as defaultCreateAppRuntimeCompositionHelperAssembly } from "./app-runtime-composition-helper-assembly.js";
import { createAppRuntimeInitializationAccessComposition as defaultCreateAppRuntimeInitializationAccessComposition } from "./app-runtime-initialization-access-composition.js";

export function createAppRuntimeAccessControlAssembly(options = {}) {
  const createAppRuntimeInitializationAccessComposition =
    typeof options.createAppRuntimeInitializationAccessComposition === "function"
      ? options.createAppRuntimeInitializationAccessComposition
      : defaultCreateAppRuntimeInitializationAccessComposition;
  const createAppRuntimeCompositionHelperAssembly =
    typeof options.createAppRuntimeCompositionHelperAssembly === "function"
      ? options.createAppRuntimeCompositionHelperAssembly
      : defaultCreateAppRuntimeCompositionHelperAssembly;

  const accessComposition = createAppRuntimeInitializationAccessComposition(
    options.initializationAccessOptions && typeof options.initializationAccessOptions === "object"
      ? options.initializationAccessOptions
      : {}
  );
  const {
    setAccessState,
    setRuntimeClientId,
    sessionControlRuntimeController,
    showBlockedWriteReclaimUi,
    maybeAutoRepairOriginHandoffControl,
    handleCommandFeedbackAction
  } = accessComposition;

  createAppRuntimeCompositionHelperAssembly({
    testHooks: options.testHooks,
    uiState: options.uiState,
    api: options.api,
    store: options.store,
    streamAdapter: options.streamAdapter,
    setAccessState,
    setRuntimeClientId,
    sessionControlRuntimeController,
    getInitializationErrorMessage:
      typeof options.getInitializationErrorMessage === "function" ? options.getInitializationErrorMessage : () => "",
    showBlockedWriteReclaimUi:
      typeof showBlockedWriteReclaimUi === "function"
        ? showBlockedWriteReclaimUi
        : typeof options.showBlockedWriteReclaimUi === "function"
          ? options.showBlockedWriteReclaimUi
          : () => false,
    maybeAutoRepairOriginHandoffControl:
      typeof maybeAutoRepairOriginHandoffControl === "function"
        ? maybeAutoRepairOriginHandoffControl
        : typeof options.maybeAutoRepairOriginHandoffControl === "function"
          ? options.maybeAutoRepairOriginHandoffControl
          : () => false,
    handleCommandFeedbackAction:
      typeof handleCommandFeedbackAction === "function"
        ? handleCommandFeedbackAction
        : typeof options.handleCommandFeedbackAction === "function"
          ? options.handleCommandFeedbackAction
          : () => false,
    getTrustedLocalHandoffRuntimeController:
      typeof options.getTrustedLocalHandoffRuntimeController === "function"
        ? options.getTrustedLocalHandoffRuntimeController
        : () => null,
    getOriginHandoffSourceOrigin:
      typeof options.getOriginHandoffSourceOrigin === "function" ? options.getOriginHandoffSourceOrigin : () => "",
    setOriginHandoffSourceOrigin:
      typeof options.setOriginHandoffSourceOrigin === "function" ? options.setOriginHandoffSourceOrigin : () => {},
    setRuntimeClientIdentityCreatedOnThisOrigin:
      typeof options.setRuntimeClientIdentityCreatedOnThisOrigin === "function"
        ? options.setRuntimeClientIdentityCreatedOnThisOrigin
        : () => {},
    normalizeCommandFeedbackActionSessionId:
      typeof options.normalizeCommandFeedbackActionSessionId === "function"
        ? options.normalizeCommandFeedbackActionSessionId
        : (sessionId) => sessionId,
    collaboratorSetters:
      options.collaboratorSetters && typeof options.collaboratorSetters === "object"
        ? options.collaboratorSetters
        : {}
  }).installTestHooks();

  return accessComposition;
}
