import test from "node:test";
import assert from "node:assert/strict";
import { isTrustedProxyRemoteAddress, parseTrustedProxy, resolveRequestContext } from "../src/proxy.js";

test("parseTrustedProxy supports off/all/loopback/list modes", () => {
  assert.deepEqual(parseTrustedProxy(""), { mode: "off", ips: [] });
  assert.deepEqual(parseTrustedProxy("false"), { mode: "off", ips: [] });
  assert.deepEqual(parseTrustedProxy("true"), { mode: "all", ips: [] });
  assert.deepEqual(parseTrustedProxy("loopback"), { mode: "loopback", ips: [] });
  assert.deepEqual(parseTrustedProxy("127.0.0.1,10.0.0.2"), { mode: "list", ips: ["127.0.0.1", "10.0.0.2"] });
});

test("parseTrustedProxy rejects invalid list entries", () => {
  assert.throws(() => parseTrustedProxy("127.0.0.1,not-an-ip"), /TRUST_PROXY contains invalid IP address/);
});

test("isTrustedProxyRemoteAddress honors mode semantics", () => {
  assert.equal(isTrustedProxyRemoteAddress("127.0.0.1", parseTrustedProxy("loopback")), true);
  assert.equal(isTrustedProxyRemoteAddress("10.0.0.1", parseTrustedProxy("loopback")), false);
  assert.equal(isTrustedProxyRemoteAddress("10.0.0.1", parseTrustedProxy("all")), true);
  assert.equal(isTrustedProxyRemoteAddress("10.0.0.1", parseTrustedProxy("10.0.0.1")), true);
  assert.equal(isTrustedProxyRemoteAddress("10.0.0.2", parseTrustedProxy("10.0.0.1")), false);
});

test("resolveRequestContext ignores spoofed forwarded headers when proxy is untrusted", () => {
  const context = resolveRequestContext(
    {
      headers: {
        host: "backend.local",
        "x-forwarded-for": "203.0.113.8",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "api.example.com"
      },
      socket: { remoteAddress: "10.0.0.5", encrypted: false }
    },
    parseTrustedProxy("loopback")
  );

  assert.equal(context.trustedProxy, false);
  assert.equal(context.clientIp, "10.0.0.5");
  assert.equal(context.protocol, "http");
  assert.equal(context.host, "backend.local");
});

test("resolveRequestContext accepts forwarded headers from trusted proxy", () => {
  const context = resolveRequestContext(
    {
      headers: {
        host: "backend.local",
        "x-forwarded-for": "203.0.113.8, 10.0.0.2",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "api.example.com"
      },
      socket: { remoteAddress: "127.0.0.1", encrypted: false }
    },
    parseTrustedProxy("loopback")
  );

  assert.equal(context.trustedProxy, true);
  assert.equal(context.clientIp, "203.0.113.8");
  assert.equal(context.protocol, "https");
  assert.equal(context.host, "api.example.com");
});
