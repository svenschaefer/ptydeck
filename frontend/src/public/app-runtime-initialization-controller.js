const DEFAULT_INITIALIZATION_ERROR_MESSAGE = "Failed to initialize application runtime.";

export function createAppRuntimeInitializationController(options = {}) {
  const maybeRedirectToCanonicalOrigin =
    typeof options.maybeRedirectToCanonicalOrigin === "function" ? options.maybeRedirectToCanonicalOrigin : () => false;
  const consumeOriginHandoffSourceFromWindow =
    typeof options.consumeOriginHandoffSourceFromWindow === "function"
      ? options.consumeOriginHandoffSourceFromWindow
      : () => {};
  const ensureStartupBackup =
    typeof options.ensureStartupBackup === "function" ? options.ensureStartupBackup : async () => {};
  const getTrustedLocalClientIdentity =
    typeof options.getTrustedLocalClientIdentity === "function" ? options.getTrustedLocalClientIdentity : () => null;
  const ensureTrustedLocalClientIdentity =
    typeof options.ensureTrustedLocalClientIdentity === "function"
      ? options.ensureTrustedLocalClientIdentity
      : async () => null;
  const setRuntimeClientIdentityCreatedOnThisOrigin =
    typeof options.setRuntimeClientIdentityCreatedOnThisOrigin === "function"
      ? options.setRuntimeClientIdentityCreatedOnThisOrigin
      : () => {};
  const setTrustedLocalClientLabel =
    typeof options.setTrustedLocalClientLabel === "function" ? options.setTrustedLocalClientLabel : () => {};
  const setRuntimeClientId = typeof options.setRuntimeClientId === "function" ? options.setRuntimeClientId : () => {};
  const bootstrapUiAndRuntime =
    typeof options.bootstrapUiAndRuntime === "function" ? options.bootstrapUiAndRuntime : async () => ({});
  const applyInitializationError =
    typeof options.applyInitializationError === "function" ? options.applyInitializationError : () => {};

  let initializationErrorMessage = "";

  function setInitializationError(message) {
    const normalizedMessage =
      typeof message === "string" && message.trim() ? message.trim() : DEFAULT_INITIALIZATION_ERROR_MESSAGE;
    if (
      initializationErrorMessage &&
      normalizedMessage === DEFAULT_INITIALIZATION_ERROR_MESSAGE &&
      initializationErrorMessage !== normalizedMessage
    ) {
      return initializationErrorMessage;
    }
    initializationErrorMessage = normalizedMessage;
    applyInitializationError(normalizedMessage);
    return initializationErrorMessage;
  }

  async function initialize() {
    try {
      if (maybeRedirectToCanonicalOrigin()) {
        return { redirected: true };
      }
      consumeOriginHandoffSourceFromWindow();
      await ensureStartupBackup();
      const existingTrustedLocalClient = getTrustedLocalClientIdentity() || null;
      const trustedLocalClient = await ensureTrustedLocalClientIdentity();
      setRuntimeClientIdentityCreatedOnThisOrigin(
        !existingTrustedLocalClient && Boolean(trustedLocalClient?.clientId)
      );
      setTrustedLocalClientLabel(trustedLocalClient?.label);
      setRuntimeClientId(trustedLocalClient?.clientId || "");
      return await bootstrapUiAndRuntime();
    } catch (error) {
      if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim()) {
        setInitializationError(error.message);
      }
      throw error;
    }
  }

  return {
    initialize,
    setInitializationError,
    getInitializationErrorMessage() {
      return initializationErrorMessage;
    }
  };
}
