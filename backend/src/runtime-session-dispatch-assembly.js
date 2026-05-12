import { createRuntimeHttpRequestHandler } from "./runtime-http-request-handler.js";
import { createRuntimeSessionDispatchAuthority } from "./runtime-session-dispatch-authority.js";

export function createRuntimeSessionDispatchAssembly(dependencies = {}) {
  const {
    createRuntimeSessionDispatchAuthorityImpl = createRuntimeSessionDispatchAuthority,
    createRuntimeHttpRequestHandlerImpl = createRuntimeHttpRequestHandler
  } = dependencies;

  const {
    resourceDispatch,
    sessionControlDispatch,
    sessionDispatch,
    runtimeSessionEventAuthority
  } = createRuntimeSessionDispatchAuthorityImpl(dependencies);

  runtimeSessionEventAuthority.registerManagerEventHandlers();

  const handleHttpRequest = createRuntimeHttpRequestHandlerImpl({
    ...dependencies,
    dispatchResourceRequest: (input) => resourceDispatch.dispatchResourceRequest(input),
    dispatchSessionRequest: (input) => sessionDispatch.dispatchSessionRequest(input),
    dispatchSessionControlRequest: (input) => sessionControlDispatch.dispatchSessionControlRequest(input)
  });

  return {
    handleHttpRequest,
    resourceDispatch,
    sessionControlDispatch,
    sessionDispatch,
    runtimeSessionEventAuthority
  };
}
