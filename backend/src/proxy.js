import { isIP } from "node:net";

const TRUST_PROXY_OFF_VALUES = new Set(["", "0", "false", "off", "no"]);
const TRUST_PROXY_ALL_VALUES = new Set(["*", "1", "true", "all"]);
const TRUST_PROXY_LOOPBACK_VALUES = new Set(["loopback", "localhost"]);

function normalizeIp(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function isLoopbackIp(ip) {
  return ip === "127.0.0.1" || ip === "::1";
}

function splitForwarded(value) {
  if (typeof value !== "string") {
    return "";
  }
  const [first] = value.split(",", 1);
  return first ? first.trim() : "";
}

function sanitizeHost(value) {
  const host = splitForwarded(value);
  if (!host) {
    return "";
  }
  if (host.includes("/") || host.includes("\\") || /\s/.test(host)) {
    return "";
  }
  return host;
}

function sanitizeForwardedProto(value) {
  const proto = splitForwarded(value).toLowerCase();
  return proto === "http" || proto === "https" ? proto : "";
}

function sanitizeForwardedIp(value) {
  const normalized = normalizeIp(splitForwarded(value));
  return isIP(normalized) ? normalized : "";
}

export function parseTrustedProxy(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (TRUST_PROXY_OFF_VALUES.has(normalized)) {
    return { mode: "off", ips: [] };
  }
  if (TRUST_PROXY_ALL_VALUES.has(normalized)) {
    return { mode: "all", ips: [] };
  }
  if (TRUST_PROXY_LOOPBACK_VALUES.has(normalized)) {
    return { mode: "loopback", ips: [] };
  }

  const ips = String(rawValue || "")
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter(Boolean);
  if (ips.length === 0) {
    return { mode: "off", ips: [] };
  }
  for (const ip of ips) {
    if (!isIP(ip)) {
      throw new Error(`TRUST_PROXY contains invalid IP address: ${ip}`);
    }
  }
  return { mode: "list", ips };
}

export function isTrustedProxyRemoteAddress(remoteAddress, trustedProxy) {
  const normalizedRemote = normalizeIp(remoteAddress);
  if (!normalizedRemote || !trustedProxy || trustedProxy.mode === "off") {
    return false;
  }
  if (trustedProxy.mode === "all") {
    return true;
  }
  if (trustedProxy.mode === "loopback") {
    return isLoopbackIp(normalizedRemote);
  }
  return trustedProxy.mode === "list" && trustedProxy.ips.includes(normalizedRemote);
}

export function resolveRequestContext(request, trustedProxy) {
  const remoteAddress = normalizeIp(request?.socket?.remoteAddress);
  const trusted = isTrustedProxyRemoteAddress(remoteAddress, trustedProxy);
  const fallbackProtocol = request?.socket?.encrypted ? "https" : "http";
  const hostHeader = sanitizeHost(request?.headers?.host);
  const forwardedProtocol = trusted ? sanitizeForwardedProto(request?.headers?.["x-forwarded-proto"]) : "";
  const forwardedHost = trusted ? sanitizeHost(request?.headers?.["x-forwarded-host"]) : "";
  const forwardedIp = trusted ? sanitizeForwardedIp(request?.headers?.["x-forwarded-for"]) : "";

  return {
    trustedProxy: trusted,
    remoteAddress: remoteAddress || "",
    clientIp: forwardedIp || remoteAddress || "",
    protocol: forwardedProtocol || fallbackProtocol,
    host: forwardedHost || hostHeader || "localhost"
  };
}
