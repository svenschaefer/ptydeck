export function createRuntimeSessionControlDispatch(dependencies = {}) {
  const {
    validateResponse = () => {},
    takeSessionControlOrThrow = () => null,
    takeSessionControlScopeOrThrow = () => null,
    releaseSessionControlOrThrow = () => null,
    transferSessionControlOrThrow = () => null,
    renameSessionControlClientOrThrow = () => null,
    forgetSessionControlClientOrThrow = () => null,
    getApiSessionOrThrow = () => null,
    persistNow = async () => {}
  } = dependencies;

  function buildSessionControlPayload(sessionId, auth, controlState) {
    const apiSession = getApiSessionOrThrow(sessionId, auth);
    return {
      ...apiSession,
      controlState
    };
  }

  async function dispatchSessionControlRequest({
    match,
    body,
    auth,
    req,
    requestTraceContext,
    writeJsonResponse
  }) {
    if (match.kind === "takeSessionControl") {
      const payload = takeSessionControlOrThrow(match.params.sessionId, auth, req, {
        ...requestTraceContext,
        sessionId: match.params.sessionId
      });
      const nextPayload = buildSessionControlPayload(match.params.sessionId, auth, payload);
      validateResponse({ statusCode: 200, body: nextPayload, expect: "session" });
      await persistNow("session.control.take");
      writeJsonResponse(200, nextPayload);
      return true;
    }

    if (match.kind === "takeSessionControlScope") {
      const payload = takeSessionControlScopeOrThrow(body.scope, body, auth, req, {
        ...requestTraceContext,
        scope: typeof body?.scope === "string" ? body.scope : ""
      });
      await persistNow("session.control.scope_take");
      writeJsonResponse(200, payload);
      return true;
    }

    if (match.kind === "releaseSessionControl") {
      const payload = releaseSessionControlOrThrow(match.params.sessionId, auth, req, {
        ...requestTraceContext,
        sessionId: match.params.sessionId
      });
      const nextPayload = buildSessionControlPayload(match.params.sessionId, auth, payload);
      validateResponse({ statusCode: 200, body: nextPayload, expect: "session" });
      await persistNow("session.control.release");
      writeJsonResponse(200, nextPayload);
      return true;
    }

    if (match.kind === "transferSessionControl") {
      const payload = transferSessionControlOrThrow(match.params.sessionId, body.clientId, auth, req, {
        ...requestTraceContext,
        sessionId: match.params.sessionId
      });
      const nextPayload = buildSessionControlPayload(match.params.sessionId, auth, payload);
      validateResponse({ statusCode: 200, body: nextPayload, expect: "session" });
      await persistNow("session.control.transfer");
      writeJsonResponse(200, nextPayload);
      return true;
    }

    if (match.kind === "renameSessionControlClient") {
      const payload = renameSessionControlClientOrThrow(match.params.sessionId, body.label, auth, req, {
        ...requestTraceContext,
        sessionId: match.params.sessionId
      });
      const nextPayload = buildSessionControlPayload(match.params.sessionId, auth, payload);
      validateResponse({ statusCode: 200, body: nextPayload, expect: "session" });
      await persistNow("session.control.rename_client");
      writeJsonResponse(200, nextPayload);
      return true;
    }

    if (match.kind === "forgetSessionControlClient") {
      const payload = forgetSessionControlClientOrThrow(match.params.sessionId, body.clientId, auth, req, {
        ...requestTraceContext,
        sessionId: match.params.sessionId
      });
      const nextPayload = buildSessionControlPayload(match.params.sessionId, auth, payload);
      validateResponse({ statusCode: 200, body: nextPayload, expect: "session" });
      await persistNow("session.control.forget_client");
      writeJsonResponse(200, nextPayload);
      return true;
    }

    return false;
  }

  return {
    dispatchSessionControlRequest
  };
}
