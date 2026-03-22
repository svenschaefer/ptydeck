import { loadConfig } from "./config.js";
import { createRuntime } from "./runtime.js";

const config = loadConfig();
const runtime = createRuntime(config);

function shutdown() {
  runtime
    .stop()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("shutdown failed", err);
      process.exit(1);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

runtime
  .start()
  .then(() => {
    console.log(`backend listening on :${runtime.getAddress()?.port ?? config.port}`);
  })
  .catch((err) => {
    console.error("startup failed", err);
    process.exit(1);
  });
