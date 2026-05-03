import { execFile as execFileCallback } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { ApiError } from "./errors.js";

const DEFAULT_SSH_PORT = 22;
const REMOTE_HOST_MAX_LENGTH = 255;
const REMOTE_NON_WHITESPACE_PATTERN = /^\S+$/;
const SSH_HOST_KEY_TYPE_MAX_LENGTH = 128;
const SSH_HOST_KEY_PUBLIC_KEY_MAX_LENGTH = 8192;
const SSH_HOST_KEY_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@._+-]{0,127}$/;
const SSH_HOST_KEY_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]+={0,3}$/;
export const DEFAULT_SSH_HOST_KEY_PROBE_TIMEOUT_MS = 5000;
const SSH_HOST_KEY_PROBE_KEY_TYPES = "ed25519,ecdsa,rsa";
const execFileAsync = promisify(execFileCallback);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSshTrustEntryHost(value, fieldPath, { strict = true } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized && normalized.length <= REMOTE_HOST_MAX_LENGTH && REMOTE_NON_WHITESPACE_PATTERN.test(normalized)) {
    return normalized;
  }
  if (strict) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field '${fieldPath}' must be a non-empty hostname or address without whitespace.`
    );
  }
  return "";
}

function normalizeSshTrustEntryPort(value, fieldPath, { strict = true } = {}) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_SSH_PORT;
  }
  const normalized = Number(value);
  if (Number.isInteger(normalized) && normalized >= 1 && normalized <= 65535) {
    return normalized;
  }
  if (strict) {
    throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be an integer between 1 and 65535.`);
  }
  return DEFAULT_SSH_PORT;
}

function normalizeSshTrustEntryKeyType(value, fieldPath, { strict = true } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    normalized &&
    normalized.length <= SSH_HOST_KEY_TYPE_MAX_LENGTH &&
    SSH_HOST_KEY_TYPE_PATTERN.test(normalized)
  ) {
    return normalized;
  }
  if (strict) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field '${fieldPath}' must be a non-empty SSH host-key type token without whitespace.`
    );
  }
  return "";
}

function normalizeSshTrustEntryPublicKey(value, fieldPath, { strict = true } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    !normalized ||
    normalized.length > SSH_HOST_KEY_PUBLIC_KEY_MAX_LENGTH ||
    !SSH_HOST_KEY_PUBLIC_KEY_PATTERN.test(normalized)
  ) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field '${fieldPath}' must be a base64-encoded SSH public key blob without whitespace.`
      );
    }
    return "";
  }

  try {
    const decoded = Buffer.from(normalized, "base64");
    if (decoded.length === 0) {
      throw new Error("empty");
    }
    const canonical = decoded.toString("base64");
    if (canonical.replace(/=+$/u, "") !== normalized.replace(/=+$/u, "")) {
      throw new Error("mismatch");
    }
    return canonical;
  } catch {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field '${fieldPath}' must be a valid base64-encoded SSH public key blob.`
      );
    }
    return "";
  }
}

export function computeSshTrustFingerprintSha256(publicKey) {
  const digest = crypto.createHash("sha256").update(Buffer.from(publicKey, "base64")).digest("base64").replace(/=+$/u, "");
  return `SHA256:${digest}`;
}

export function formatSshTarget(host, port) {
  const normalizedPort = normalizeSshTrustEntryPort(port, "port", { strict: false });
  return normalizedPort === DEFAULT_SSH_PORT ? host : `${host}:${normalizedPort}`;
}

export function normalizeSshHostKeyProbeRequest(input, { strict = true } = {}) {
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    return null;
  }
  const host = normalizeSshTrustEntryHost(input.host, "host", { strict });
  const port = normalizeSshTrustEntryPort(input.port, "port", { strict });
  if (!host) {
    return null;
  }
  return { host, port };
}

export function normalizeSshHostKeyProbeCandidate(input, target = {}, { strict = true } = {}) {
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    return null;
  }
  const host = normalizeSshTrustEntryHost(input.host ?? target.host, "host", { strict });
  const port = normalizeSshTrustEntryPort(input.port ?? target.port, "port", { strict });
  const keyType = normalizeSshTrustEntryKeyType(input.keyType, "keyType", { strict });
  const publicKey = normalizeSshTrustEntryPublicKey(input.publicKey, "publicKey", { strict });
  if (!host || !keyType || !publicKey) {
    return null;
  }
  return {
    host,
    port,
    keyType,
    publicKey,
    fingerprintSha256: computeSshTrustFingerprintSha256(publicKey)
  };
}

export function parseSshKeyscanOutput(output, target = {}) {
  const normalizedTarget = normalizeSshHostKeyProbeRequest(target, { strict: true });
  const candidates = [];
  const seen = new Set();
  for (const rawLine of String(output || "").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const parts = line.split(/\s+/u);
    const candidate = normalizeSshHostKeyProbeCandidate(
      {
        host: normalizedTarget.host,
        port: normalizedTarget.port,
        keyType: parts[1],
        publicKey: parts[2]
      },
      normalizedTarget,
      { strict: false }
    );
    if (!candidate) {
      continue;
    }
    const dedupeKey = `${candidate.keyType}\n${candidate.publicKey}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    candidates.push(candidate);
  }
  candidates.sort((left, right) => {
    const keyTypeCompare = left.keyType.localeCompare(right.keyType, "en-US", { sensitivity: "base" });
    if (keyTypeCompare !== 0) {
      return keyTypeCompare;
    }
    return left.fingerprintSha256.localeCompare(right.fingerprintSha256, "en-US", { sensitivity: "base" });
  });
  return candidates;
}

export async function probeSshHostKeysWithKeyscan(target, options = {}) {
  const normalizedTarget = normalizeSshHostKeyProbeRequest(target, { strict: true });
  const timeoutMs =
    Number.isInteger(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_SSH_HOST_KEY_PROBE_TIMEOUT_MS;
  const execFileAsyncImpl = typeof options.execFileAsync === "function" ? options.execFileAsync : execFileAsync;
  const args = [
    "-T",
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    "-p",
    String(normalizedTarget.port),
    "-t",
    SSH_HOST_KEY_PROBE_KEY_TYPES,
    normalizedTarget.host
  ];
  try {
    const { stdout = "" } = await execFileAsyncImpl("ssh-keyscan", args, {
      timeout: timeoutMs,
      maxBuffer: SSH_HOST_KEY_PUBLIC_KEY_MAX_LENGTH * 32
    });
    const candidates = parseSshKeyscanOutput(stdout, normalizedTarget);
    if (candidates.length === 0) {
      throw new ApiError(
        502,
        "SshHostKeyProbeFailed",
        `No SSH host keys were returned for ${formatSshTarget(normalizedTarget.host, normalizedTarget.port)}.`
      );
    }
    return candidates;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error?.code === "ENOENT") {
      throw new ApiError(503, "SshHostKeyProbeUnavailable", "SSH host-key probing is unavailable because ssh-keyscan is not installed.");
    }
    if (error?.code === "ETIMEDOUT" || error?.signal === "SIGTERM" || error?.killed === true) {
      throw new ApiError(
        504,
        "SshHostKeyProbeTimedOut",
        `SSH host-key probing timed out for ${formatSshTarget(normalizedTarget.host, normalizedTarget.port)}.`
      );
    }
    throw new ApiError(
      502,
      "SshHostKeyProbeFailed",
      `Failed to probe SSH host keys for ${formatSshTarget(normalizedTarget.host, normalizedTarget.port)}.`
    );
  }
}
