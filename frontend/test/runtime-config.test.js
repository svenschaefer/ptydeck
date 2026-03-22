import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeConfig } from "../src/public/runtime-config.js";

test("runtime config falls back to browser host and default ports", () => {
  const config = resolveRuntimeConfig({
    location: {
      protocol: "http:",
      hostname: "example.local",
      search: ""
    }
  });

  assert.deepEqual(config, {
    apiBaseUrl: "http://example.local:8080/api/v1",
    wsUrl: "ws://example.local:8080/ws",
    debugLogs: false
  });
});

test("runtime config uses injected host/port overrides", () => {
  const config = resolveRuntimeConfig({
    location: {
      protocol: "https:",
      hostname: "browser-host.local",
      search: ""
    },
    __PTYDECK_CONFIG__: {
      apiHost: "api-host.local",
      apiPort: 8443,
      wsHost: "ws-host.local",
      wsPort: 9443
    }
  });

  assert.deepEqual(config, {
    apiBaseUrl: "https://api-host.local:8443/api/v1",
    wsUrl: "wss://ws-host.local:9443/ws",
    debugLogs: false
  });
});

test("runtime config gives precedence to explicit apiBaseUrl/wsUrl", () => {
  const config = resolveRuntimeConfig({
    location: {
      protocol: "https:",
      hostname: "browser-host.local",
      search: ""
    },
    __PTYDECK_CONFIG__: {
      apiBaseUrl: "https://api.explicit.local/api/v1",
      wsUrl: "wss://api.explicit.local/ws",
      apiHost: "ignored.local",
      apiPort: 1111,
      wsHost: "ignored.local",
      wsPort: 2222
    }
  });

  assert.deepEqual(config, {
    apiBaseUrl: "https://api.explicit.local/api/v1",
    wsUrl: "wss://api.explicit.local/ws",
    debugLogs: false
  });
});

test("runtime config enables debug logs via query string", () => {
  const config = resolveRuntimeConfig({
    location: {
      protocol: "http:",
      hostname: "example.local",
      search: "?debug=1"
    }
  });

  assert.equal(config.debugLogs, true);
});
