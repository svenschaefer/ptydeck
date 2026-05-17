import { createServer as createHttpServer } from "node:http";
import { createRuntimeLifecycle } from "./runtime-lifecycle.js";
import { createRuntimeSessionDispatchAssembly } from "./runtime-session-dispatch-assembly.js";
import { createRuntimeStartupRestore } from "./runtime-startup-restore.js";

export function createRuntimeStartupDispatchAssembly(dependencies = {}) {
  const {
    createRuntimeSessionDispatchAssemblyImpl = createRuntimeSessionDispatchAssembly,
    createRuntimeStartupRestoreImpl = createRuntimeStartupRestore,
    createRuntimeLifecycleImpl = createRuntimeLifecycle,
    createHttpServerImpl = createHttpServer,
    handleWsUpgrade = null
  } = dependencies;

  const sessionDispatchAssembly = createRuntimeSessionDispatchAssemblyImpl(dependencies);
  const server = createHttpServerImpl(sessionDispatchAssembly.handleHttpRequest);

  if (server && typeof server.on === "function" && typeof handleWsUpgrade === "function") {
    server.on("upgrade", (request, socket, head) => {
      void handleWsUpgrade(request, socket, head);
    });
  }

  const runtimeStartupRestore = createRuntimeStartupRestoreImpl(dependencies);
  const runtimeLifecycle = createRuntimeLifecycleImpl({
    ...dependencies,
    runtimeStartupRestore,
    server
  });

  return {
    ...sessionDispatchAssembly,
    server,
    runtimeStartupRestore,
    runtimeLifecycle
  };
}
