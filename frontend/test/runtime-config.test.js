import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeConfig } from "../src/public/runtime-config.js";

test("runtime config falls back to localhost dev ports", () => {
  const config = resolveRuntimeConfig({
    location: {
      protocol: "http:",
      hostname: "127.0.0.1",
      search: ""
    }
  });

  assert.deepEqual(config, {
    apiBaseUrl: "http://127.0.0.1:18080/api/v1",
    wsUrl: "ws://127.0.0.1:18080/ws",
    debugLogs: false
  });
});

test("runtime config derives api host from ptydeck domain without explicit env", () => {
  const config = resolveRuntimeConfig({
    location: {
      protocol: "https:",
      hostname: "ptydeck.local.example",
      search: ""
    }
  });

  assert.deepEqual(config, {
    apiBaseUrl: "https://api.ptydeck.local.example/api/v1",
    wsUrl: "wss://api.ptydeck.local.example/ws",
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

test("runtime config lets an explicit debug query override injected debugLogs defaults", () => {
  const enabled = resolveRuntimeConfig({
    location: {
      protocol: "https:",
      hostname: "example.local",
      search: "?debug=1"
    },
    __PTYDECK_CONFIG__: {
      debugLogs: false
    }
  });
  const disabled = resolveRuntimeConfig({
    location: {
      protocol: "https:",
      hostname: "example.local",
      search: "?debug=off"
    },
    __PTYDECK_CONFIG__: {
      debugLogs: true
    }
  });

  assert.equal(enabled.debugLogs, true);
  assert.equal(disabled.debugLogs, false);
});
