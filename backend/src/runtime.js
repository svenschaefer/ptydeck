import http from "node:http";
import crypto from "node:crypto";
import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { createAuditLogger } from "./audit-log.js";
import { createAccessTokenVerifier, createDevToken } from "./auth.js";
import { ApiError } from "./errors.js";
import { JsonPersistence } from "./persistence.js";
import { createMessagingRuntime, normalizeMessagingTopicBindings } from "./messaging-runtime.js";
import { resolveRequestContext } from "./proxy.js";
import { FixedWindowRateLimiter } from "./rate-limiter.js";
import { createRuntimeCatalogAuthority } from "./runtime-catalog-authority.js";
import { createRuntimeHttpHelpers } from "./runtime-http-helpers.js";
import { createRuntimeHttpRequestHandler } from "./runtime-http-request-handler.js";
import { createRuntimeLibraryAuthority } from "./runtime-library-authority.js";
import { createRuntimeLibraryNormalization } from "./runtime-library-normalization.js";
import { createRuntimeAccessPolicy } from "./runtime-access-policy.js";
import { createRuntimeMetrics } from "./runtime-metrics.js";
import { createRuntimeResourceDispatch } from "./runtime-resource-dispatch.js";
import { createRuntimeSessionDispatch } from "./runtime-session-dispatch.js";
import { createRuntimeSessionAuthority } from "./runtime-session-authority.js";
import { createRuntimeSessionControlAuthority } from "./runtime-session-control-authority.js";
import { createRuntimeSessionControlDispatch } from "./runtime-session-control-dispatch.js";
import { createRuntimeSessionResourceAuthority } from "./runtime-session-resource-authority.js";
import { createRuntimeSessionState } from "./runtime-session-state.js";
import { createRuntimeSshTrust } from "./runtime-ssh-trust.js";
import { createRuntimeStartupReadiness } from "./runtime-startup-readiness.js";
import { createRuntimeStartupWarmup } from "./runtime-startup-warmup.js";
import { createRuntimeStartupRestore } from "./runtime-startup-restore.js";
import { createRuntimeWsConnectionHandler } from "./runtime-ws-connection.js";
import { createRuntimeWsUpgradeHandler } from "./runtime-ws-upgrade.js";
import { createRuntimeWsTicketRegistry, normalizeWsDisconnectReason } from "./runtime-ws-tickets.js";
import { countActiveRuntimeSessions } from "./runtime-status-reporting.js";
import {
  createSessionControlAttachmentRegistry,
  normalizeSessionControlClientLabel
} from "./runtime-session-control-attachments.js";
import { createSessionStreamAnalysisCapture } from "./session-stream-analysis-capture.js";
import {
  buildSessionControlStateView,
  createLocalOperatorPrincipal,
  createSessionControlPrincipal,
  normalizeSessionControlState,
  setSessionControllerClient,
  sessionControlPrincipalsMatch,
  updateSessionControlLastInput
} from "./session-control-state.js";
import {
  DEFAULT_SESSION_INPUT_SAFETY_PROFILE,
  normalizeSessionInputSafetyProfile
} from "./session-input-safety-profile.js";
import { normalizeSessionMouseForwardingMode } from "./session-mouse-forwarding.js";
import {
  normalizeQuickSendUsageEntries,
  normalizeQuickSendUsageMutation
} from "./session-quick-send-usage.js";
import { SessionManager } from "./session-manager.js";
import { deriveTerminalAppIdentityFromSessionHints, normalizeTerminalAppIdentity } from "./terminal-app-identity.js";
import {
  computeSshTrustFingerprintSha256,
  DEFAULT_SSH_HOST_KEY_PROBE_TIMEOUT_MS,
  probeSshHostKeysWithKeyscan
} from "./ssh-host-key-probe.js";
import { validateRequest, validateResponse } from "./validation.js";

const CUSTOM_COMMAND_RESERVED_NAMES = new Set([
  "new",
  "close",
  "switch",
  "next",
  "prev",
  "list",
  "rename",
  "restart",
  "note",
  "layout",
  "workspace",
  "help",
  "custom"
]);
const CUSTOM_COMMAND_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DEFAULT_CUSTOM_COMMAND_MAX_COUNT = 256;
const DEFAULT_CUSTOM_COMMAND_MAX_NAME_LENGTH = 32;
const DEFAULT_CUSTOM_COMMAND_MAX_CONTENT_LENGTH = 8192;
const CUSTOM_COMMAND_NAME_LOCALE = "en-US";
const CUSTOM_COMMAND_KIND_VALUES = new Set(["plain", "template"]);
const CUSTOM_COMMAND_SCOPE_VALUES = new Set(["global", "project", "session"]);
const DEFAULT_CUSTOM_COMMAND_SCOPE = "project";
const CUSTOM_COMMAND_SCOPE_PRECEDENCE = Object.freeze({
  global: 100,
  project: 200,
  session: 300
});
const CUSTOM_COMMAND_TEMPLATE_PARAM_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const CUSTOM_COMMAND_TEMPLATE_VARIABLE_VALUES = new Set([
  "session.id",
  "session.name",
  "session.cwd",
  "session.note",
  "deck.id",
  "deck.name"
]);
const SESSION_START_CWD_MAX_LENGTH = 1024;
const SESSION_START_COMMAND_MAX_LENGTH = 4096;
const SESSION_NOTE_MAX_LENGTH = 512;
const SESSION_KIND_LOCAL = "local";
const SESSION_KIND_SSH = "ssh";
const SESSION_KIND_VALUES = new Set([SESSION_KIND_LOCAL, SESSION_KIND_SSH]);
const DEFAULT_SSH_CLIENT = "ssh";
const DEFAULT_SSH_PORT = 22;
const SSH_AUTH_METHOD_PASSWORD = "password";
const SSH_AUTH_METHOD_PRIVATE_KEY = "privateKey";
const SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE = "keyboardInteractive";
const REMOTE_HOST_MAX_LENGTH = 255;
const REMOTE_USERNAME_MAX_LENGTH = 64;
const REMOTE_PRIVATE_KEY_PATH_MAX_LENGTH = 1024;
const REMOTE_SECRET_MAX_LENGTH = 4096;
const REMOTE_NON_WHITESPACE_PATTERN = /^\S+$/;
const SSH_HOST_KEY_TYPE_MAX_LENGTH = 128;
const SSH_HOST_KEY_PUBLIC_KEY_MAX_LENGTH = 8192;
const SSH_HOST_KEY_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9@._+-]{0,127}$/;
const SSH_HOST_KEY_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]+={0,3}$/;
const SESSION_ENV_MAX_ENTRIES = 64;
const SESSION_ENV_KEY_MAX_LENGTH = 128;
const SESSION_ENV_VALUE_MAX_LENGTH = 4096;
const SESSION_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SESSION_TAG_MAX_COUNT = 32;
const SESSION_TAG_MAX_LENGTH = 32;
const SESSION_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_THEME_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_DECK_ID = "default";
const DEFAULT_DECK_NAME = "Default";
const DEFAULT_AUTH_WS_TICKET_TTL_SECONDS = 30;
const DEFAULT_STARTUP_WARMUP_QUIET_MS = 1000;
const DEFAULT_MESSAGING_CODEX_SUBMIT_DELAY_MS = 90;
const DECK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const DECK_NAME_MAX_LENGTH = 64;
const LAYOUT_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const LAYOUT_PROFILE_NAME_MAX_LENGTH = 64;
const LAYOUT_PROFILE_FILTER_MAX_LENGTH = 256;
const CONTROL_PANE_POSITION_VALUES = new Set(["top", "bottom", "left", "right"]);
const CONTROL_PANE_DEFAULT_POSITION = "bottom";
const CONTROL_PANE_DEFAULT_SIZE = 240;
const CONTROL_PANE_MIN_SIZE = 120;
const CONTROL_PANE_MAX_SIZE = 960;
const CONNECTION_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const CONNECTION_PROFILE_NAME_MAX_LENGTH = 64;
const WORKSPACE_PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const WORKSPACE_PRESET_NAME_MAX_LENGTH = 64;
const WORKSPACE_GROUP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const WORKSPACE_GROUP_NAME_MAX_LENGTH = 64;
const SPLIT_LAYOUT_PANE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const DEFAULT_SPLIT_LAYOUT_PANE_ID = "main";
const HTTP_DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const SESSION_REPLAY_EXPORT_SCOPE = "retained_replay_tail";
const SESSION_REPLAY_EXCERPT_SCOPE = "visible_replay_excerpt";
const SESSION_REPLAY_EXPORT_FORMAT = "text";
const SESSION_REPLAY_EXCERPT_FORMAT = "text";
const SESSION_REPLAY_EXPORT_CONTENT_TYPE = "text/plain; charset=utf-8";
const SESSION_REPLAY_EXCERPT_CONTENT_TYPE = "text/plain; charset=utf-8";
const DEFAULT_SESSION_FILE_TRANSFER_MAX_BYTES = 256 * 1024;
const SESSION_FILE_TRANSFER_PATH_MAX_LENGTH = 512;
const SESSION_FILE_TRANSFER_CONTENT_TYPE = "application/octet-stream";
const SESSION_FILE_TRANSFER_ENCODING = "base64";
const SHARE_LINK_ID_PATTERN = /^share-[a-f0-9]{24}$/;
const SHARE_LINK_TARGET_TYPE_SESSION = "session";
const SHARE_LINK_TARGET_TYPE_DECK = "deck";
const SHARE_LINK_TARGET_TYPE_VALUES = new Set([SHARE_LINK_TARGET_TYPE_SESSION, SHARE_LINK_TARGET_TYPE_DECK]);
const SHARE_LINK_PERMISSION_MODE_READ_ONLY = "read_only";
const DEFAULT_SHARE_LINK_TTL_SECONDS = 24 * 60 * 60;
const MAX_SHARE_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_QUICK_ID_POOL = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SESSION_QUICK_ID_FALLBACK = "?";
const TRACE_HEADER_ID = "x-ptydeck-trace-id";
const TRACE_HEADER_CORRELATION_ID = "x-ptydeck-correlation-id";
const SESSION_CONTROL_CLIENT_ID_HEADER = "x-ptydeck-client-id";
const DEFAULT_SESSION_CONTROL_STALE_CLIENT_TTL_MS = 90_000;
const TRACE_TOKEN_MAX_LENGTH = 128;
const DEFAULT_SESSION_THEME_PROFILE = {
  background: "#0a0d12",
  foreground: "#d8dee9",
  cursor: "#8ec07c",
  black: "#0a0d12",
  red: "#fb4934",
  green: "#8ec07c",
  yellow: "#fabd2f",
  blue: "#83a598",
  magenta: "#b48ead",
  cyan: "#8fbcbb",
  white: "#d8dee9",
  brightBlack: "#4b5563",
  brightRed: "#ff6b5a",
  brightGreen: "#a5d68a",
  brightYellow: "#ffd36a",
  brightBlue: "#98b6cc",
  brightMagenta: "#c8a7d8",
  brightCyan: "#a9d9d6",
  brightWhite: "#f5f7fa"
};

function normalizeTraceToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > TRACE_TOKEN_MAX_LENGTH) {
    return "";
  }
  return normalized;
}

function buildRequestTraceContext(req, requestContext, pathname = "") {
  const requestId = `req-${crypto.randomUUID()}`;
  const incomingCorrelationId = normalizeTraceToken(req.headers?.[TRACE_HEADER_CORRELATION_ID]);
  const correlationId = incomingCorrelationId || requestId;
  return {
    traceId: requestId,
    requestId,
    correlationId,
    source: "rest",
    method: typeof req?.method === "string" ? req.method : "GET",
    pathname: typeof pathname === "string" ? pathname : "",
    clientIp: typeof requestContext?.clientIp === "string" ? requestContext.clientIp : "",
    protocol: typeof requestContext?.protocol === "string" ? requestContext.protocol : "",
    trustedProxy: requestContext?.trustedProxy === true
  };
}

function normalizeTraceSeed(trace) {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    return null;
  }
  const traceId = normalizeTraceToken(trace.traceId);
  const correlationId = normalizeTraceToken(trace.correlationId);
  const requestId = normalizeTraceToken(trace.requestId);
  const connectionId = normalizeTraceToken(trace.connectionId);
  const sessionId = normalizeTraceToken(trace.sessionId);
  const deckId = normalizeTraceToken(trace.deckId);
  const source = normalizeTraceToken(trace.source);
  const normalized = {
    ...(traceId ? { traceId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(connectionId ? { connectionId } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(deckId ? { deckId } : {}),
    ...(source ? { source } : {})
  };
  return Object.keys(normalized).length ? normalized : null;
}

function parseJsonBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    let completed = false;

    function resolveOnce(value) {
      if (completed) {
        return;
      }
      completed = true;
      resolve(value);
    }

    function rejectOnce(error) {
      if (completed) {
        return;
      }
      completed = true;
      reject(error);
    }

    req.on("data", (chunk) => {
      if (completed) {
        return;
      }
      size += Buffer.byteLength(chunk);
      if (size > maxBodyBytes) {
        rejectOnce(new ApiError(413, "PayloadTooLarge", "Request body exceeds configured maximum size."));
        return;
      }
      data += chunk;
    });

    req.on("end", () => {
      if (completed) {
        return;
      }
      if (!data) {
        resolveOnce(undefined);
        return;
      }

      try {
        resolveOnce(JSON.parse(data));
      } catch {
        rejectOnce(new ApiError(400, "InvalidJson", "Malformed JSON body."));
      }
    });

    req.on("error", (err) => rejectOnce(err));
  });
}

function escapePrometheusLabel(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("\n", "\\n");
}

function bumpMetricCounter(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSessionStartupConfig(input = {}, { strict = true } = {}) {
  const fallbackCwd =
    typeof input.fallbackCwd === "string" && input.fallbackCwd.trim() ? input.fallbackCwd.trim() : homedir();
  const startCwdRaw = typeof input.startCwd === "string" ? input.startCwd.trim() : "";
  const startCwd = startCwdRaw || fallbackCwd;
  if (!startCwd) {
    throw new ApiError(400, "ValidationError", "Field 'startCwd' must be a non-empty string.");
  }
  if (startCwd.length > SESSION_START_CWD_MAX_LENGTH) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'startCwd' exceeds maximum length (${SESSION_START_CWD_MAX_LENGTH}).`
      );
    }
    return {
      startCwd: fallbackCwd,
      startCommand: "",
      env: {}
    };
  }

  const startCommand = typeof input.startCommand === "string" ? input.startCommand : "";
  if (startCommand.length > SESSION_START_COMMAND_MAX_LENGTH) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'startCommand' exceeds maximum length (${SESSION_START_COMMAND_MAX_LENGTH}).`
      );
    }
    return {
      startCwd,
      startCommand: "",
      env: {}
    };
  }

  const envInput = input.env === undefined ? {} : input.env;
  if (!isPlainObject(envInput)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'env' must be an object with string key/value pairs.");
    }
    return {
      startCwd,
      startCommand,
      env: {}
    };
  }
  const envEntries = Object.entries(envInput);
  if (envEntries.length > SESSION_ENV_MAX_ENTRIES) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field 'env' exceeds maximum entries (${SESSION_ENV_MAX_ENTRIES}).`);
    }
  }

  const env = {};
  for (const [rawKey, rawValue] of envEntries) {
    if (Object.keys(env).length >= SESSION_ENV_MAX_ENTRIES) {
      break;
    }
    if (typeof rawKey !== "string" || !SESSION_ENV_KEY_PATTERN.test(rawKey) || rawKey.length > SESSION_ENV_KEY_MAX_LENGTH) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'env' contains an invalid variable name.");
      }
      continue;
    }
    if (typeof rawValue !== "string" || rawValue.length > SESSION_ENV_VALUE_MAX_LENGTH) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'env' contains an invalid variable value.");
      }
      continue;
    }
    env[rawKey] = rawValue;
  }

  return {
    startCwd,
    startCommand,
    env
  };
}

function normalizeSessionKind(input, { strict = true } = {}) {
  if (input === undefined || input === null || input === "") {
    return SESSION_KIND_LOCAL;
  }
  const normalized = String(input).trim().toLowerCase();
  if (SESSION_KIND_VALUES.has(normalized)) {
    return normalized;
  }
  if (strict) {
    throw new ApiError(400, "ValidationError", "Field 'kind' must be 'local' or 'ssh'.");
  }
  return SESSION_KIND_LOCAL;
}

function normalizeSessionRemoteConnection(input, kind, { strict = true } = {}) {
  if (kind !== SESSION_KIND_SSH) {
    if ((input !== undefined && input !== null) && strict) {
      throw new ApiError(400, "ValidationError", "Field 'remoteConnection' is only supported for ssh sessions.");
    }
    return undefined;
  }
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteConnection' is required for ssh sessions and must be an object."
      );
    }
    return undefined;
  }
  for (const unsupportedField of ["proxyJump", "proxyCommand", "forwardAgent", "forwardX11", "sshOptions"]) {
    if (Object.prototype.hasOwnProperty.call(input, unsupportedField)) {
      if (strict) {
        throw new ApiError(
          400,
          "ValidationError",
          `Field 'remoteConnection.${unsupportedField}' is not supported in the H38 remote baseline.`
        );
      }
      return undefined;
    }
  }

  const host = typeof input.host === "string" ? input.host.trim() : "";
  if (!host || host.length > REMOTE_HOST_MAX_LENGTH || !REMOTE_NON_WHITESPACE_PATTERN.test(host)) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteConnection.host' must be a non-empty hostname or address without whitespace."
      );
    }
    return undefined;
  }

  const port = input.port === undefined || input.port === null ? DEFAULT_SSH_PORT : Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'remoteConnection.port' must be an integer between 1 and 65535.");
    }
    return {
      host,
      port: DEFAULT_SSH_PORT
    };
  }

  const username = typeof input.username === "string" ? input.username.trim() : "";
  if (username && (username.length > REMOTE_USERNAME_MAX_LENGTH || !REMOTE_NON_WHITESPACE_PATTERN.test(username))) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteConnection.username' must be a non-empty token without whitespace."
      );
    }
    return {
      host,
      port
    };
  }

  return {
    host,
    port,
    ...(username ? { username } : {})
  };
}

function normalizeSessionRemoteAuth(input, kind, { strict = true } = {}) {
  if (kind !== SESSION_KIND_SSH) {
    if (input !== undefined && input !== null && strict) {
      throw new ApiError(400, "ValidationError", "Field 'remoteAuth' is only supported for ssh sessions.");
    }
    return undefined;
  }
  if (input === undefined || input === null) {
    return { method: SSH_AUTH_METHOD_PRIVATE_KEY };
  }
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'remoteAuth' must be an object for ssh sessions.");
    }
    return { method: SSH_AUTH_METHOD_PRIVATE_KEY };
  }
  for (const unsupportedField of ["proxyJump", "proxyCommand", "forwardAgent", "forwardX11", "sshOptions"]) {
    if (Object.prototype.hasOwnProperty.call(input, unsupportedField)) {
      if (strict) {
        throw new ApiError(
          400,
          "ValidationError",
          `Field 'remoteAuth.${unsupportedField}' is not supported in the H38 authentication baseline.`
        );
      }
      return { method: SSH_AUTH_METHOD_PRIVATE_KEY };
    }
  }
  const method =
    typeof input.method === "string" && input.method.trim() ? input.method.trim() : SSH_AUTH_METHOD_PRIVATE_KEY;
  if (
    method !== SSH_AUTH_METHOD_PASSWORD &&
    method !== SSH_AUTH_METHOD_PRIVATE_KEY &&
    method !== SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE
  ) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteAuth.method' must be 'password', 'privateKey', or 'keyboardInteractive'."
      );
    }
    return { method: SSH_AUTH_METHOD_PRIVATE_KEY };
  }
  const privateKeyPath = typeof input.privateKeyPath === "string" ? input.privateKeyPath.trim() : "";
  if (method !== SSH_AUTH_METHOD_PRIVATE_KEY && privateKeyPath) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteAuth.privateKeyPath' is only supported for privateKey ssh auth."
      );
    }
    return { method };
  }
  if (privateKeyPath && privateKeyPath.length > REMOTE_PRIVATE_KEY_PATH_MAX_LENGTH) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'remoteAuth.privateKeyPath' must not exceed ${REMOTE_PRIVATE_KEY_PATH_MAX_LENGTH} characters.`
      );
    }
    return { method };
  }
  return {
    method,
    ...(privateKeyPath ? { privateKeyPath } : {})
  };
}

function remoteAuthRequiresSecret(remoteAuth) {
  if (!remoteAuth) {
    return false;
  }
  return (
    remoteAuth.method === SSH_AUTH_METHOD_PASSWORD ||
    remoteAuth.method === SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE
  );
}

function normalizeSessionRemoteSecret(input, remoteAuth, kind, { strict = true } = {}) {
  if (kind !== SESSION_KIND_SSH) {
    if (input !== undefined && input !== null && strict) {
      throw new ApiError(400, "ValidationError", "Field 'remoteSecret' is only supported for ssh sessions.");
    }
    return undefined;
  }
  if (input === undefined || input === null) {
    if (strict && remoteAuthRequiresSecret(remoteAuth)) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteSecret' is required for password and keyboardInteractive ssh auth."
      );
    }
    return undefined;
  }
  if (!remoteAuthRequiresSecret(remoteAuth)) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteSecret' is only supported for password and keyboardInteractive ssh auth."
      );
    }
    return undefined;
  }
  if (typeof input !== "string" || input.length < 1 || input.length > REMOTE_SECRET_MAX_LENGTH) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'remoteSecret' must be a non-empty string up to ${REMOTE_SECRET_MAX_LENGTH} characters.`
      );
    }
    return undefined;
  }
  return input;
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

function buildSshTrustEntryId({ host, port, keyType, publicKey }) {
  const hash = crypto.createHash("sha256").update(`${host}\n${port}\n${keyType}\n${publicKey}`).digest("hex");
  return `trust-${hash.slice(0, 24)}`;
}

function normalizeSshTrustEntryEntity(input, { strict = true } = {}) {
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    return null;
  }

  const host = normalizeSshTrustEntryHost(input.host, "host", { strict });
  const keyType = normalizeSshTrustEntryKeyType(input.keyType, "keyType", { strict });
  const publicKey = normalizeSshTrustEntryPublicKey(input.publicKey, "publicKey", { strict });
  if (!host || !keyType || !publicKey) {
    return null;
  }
  const port = normalizeSshTrustEntryPort(input.port, "port", { strict });
  const createdAt = Number.isInteger(input.createdAt) ? input.createdAt : Date.now();
  const updatedAt = Number.isInteger(input.updatedAt) ? input.updatedAt : createdAt;
  return {
    id: buildSshTrustEntryId({ host, port, keyType, publicKey }),
    host,
    port,
    keyType,
    publicKey,
    fingerprintSha256: computeSshTrustFingerprintSha256(publicKey),
    createdAt,
    updatedAt
  };
}

function renderSshKnownHostsHostToken(host, port) {
  return port === DEFAULT_SSH_PORT ? host : `[${host}]:${port}`;
}

function renderSshKnownHosts(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "";
  }
  const lines = entries.map((entry) =>
    `${renderSshKnownHostsHostToken(entry.host, entry.port)} ${entry.keyType} ${entry.publicKey}`
  );
  return `${lines.join("\n")}\n`;
}

function normalizeSessionThemeProfile(input = {}, { strict = true } = {}) {
  if (input === undefined || input === null) {
    return { ...DEFAULT_SESSION_THEME_PROFILE };
  }
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'themeProfile' must be an object.");
    }
    return { ...DEFAULT_SESSION_THEME_PROFILE };
  }

  const normalized = {};
  const allowedKeys = new Set(Object.keys(DEFAULT_SESSION_THEME_PROFILE));
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field 'themeProfile.${key}' is not supported.`);
      }
      continue;
    }
    if (typeof value !== "string" || !SESSION_THEME_COLOR_PATTERN.test(value)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field 'themeProfile.${key}' must be a hex color like '#1d2021'.`);
      }
      continue;
    }
  }

  for (const [key, defaultValue] of Object.entries(DEFAULT_SESSION_THEME_PROFILE)) {
    normalized[key] = typeof input[key] === "string" ? input[key] : defaultValue;
  }

  return normalized;
}

function normalizeSessionThemeSlots(input = {}, { strict = true } = {}) {
  const source = isPlainObject(input) ? input : {};
  const fallbackThemeProfile = normalizeSessionThemeProfile(source.themeProfile, { strict });
  const activeThemeProfile =
    source.activeThemeProfile !== undefined
      ? normalizeSessionThemeProfile(source.activeThemeProfile, { strict })
      : fallbackThemeProfile;
  const inactiveThemeProfile =
    source.inactiveThemeProfile !== undefined
      ? normalizeSessionThemeProfile(source.inactiveThemeProfile, { strict })
      : fallbackThemeProfile;
  return {
    themeProfile: activeThemeProfile,
    activeThemeProfile,
    inactiveThemeProfile
  };
}

function normalizeSessionNote(input, { strict = true } = {}) {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (typeof input !== "string") {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'note' must be a string.");
    }
    return undefined;
  }
  const normalized = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > SESSION_NOTE_MAX_LENGTH) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'note' exceeds maximum length (${SESSION_NOTE_MAX_LENGTH}).`
      );
    }
    return normalized.slice(0, SESSION_NOTE_MAX_LENGTH);
  }
  return normalized;
}

function normalizeSessionTags(input, { strict = true } = {}) {
  if (input === undefined || input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'tags' must be an array of strings.");
    }
    return [];
  }

  const normalized = [];
  const seen = new Set();
  for (const entry of input) {
    if (typeof entry !== "string") {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'tags' must contain only strings.");
      }
      continue;
    }
    const candidate = entry.trim().toLowerCase();
    if (!candidate || candidate.length > SESSION_TAG_MAX_LENGTH || !SESSION_TAG_PATTERN.test(candidate)) {
      if (strict) {
        throw new ApiError(
          400,
          "ValidationError",
          `Each tag must match ${SESSION_TAG_PATTERN} and be at most ${SESSION_TAG_MAX_LENGTH} chars.`
        );
      }
      continue;
    }
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
    if (normalized.length >= SESSION_TAG_MAX_COUNT) {
      if (strict && input.length > SESSION_TAG_MAX_COUNT) {
        throw new ApiError(400, "ValidationError", `Field 'tags' exceeds maximum entries (${SESSION_TAG_MAX_COUNT}).`);
      }
      break;
    }
  }

  normalized.sort((a, b) => a.localeCompare(b, "en-US", { sensitivity: "base" }));
  return normalized;
}

function parseBooleanQueryParam(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new ApiError(400, "ValidationError", `Query parameter '${fieldName}' must be 'true' or 'false'.`);
}

export function createRuntime(config) {
  const maxBodyBytes =
    Number.isFinite(config.maxBodyBytes) && config.maxBodyBytes > 0 ? config.maxBodyBytes : 1024 * 1024;
  const debugLogs = config.debugLogs === true;
  const sshKnownHostsPath = resolve(dirname(config.dataPath), "ssh_known_hosts");
  const sshHostKeyProbeTimeoutMs =
    Number.isInteger(config.sshHostKeyProbeTimeoutMs) && config.sshHostKeyProbeTimeoutMs > 0
      ? config.sshHostKeyProbeTimeoutMs
      : DEFAULT_SSH_HOST_KEY_PROBE_TIMEOUT_MS;
  const probeSshHostKeys =
    typeof config.probeSshHostKeys === "function"
      ? config.probeSshHostKeys
      : (target) => probeSshHostKeysWithKeyscan(target, { timeoutMs: sshHostKeyProbeTimeoutMs });
  const sshTrustEntries = new Map();
  const runtimeSshTrust = createRuntimeSshTrust({
    sshTrustEntries,
    sshKnownHostsPath,
    normalizeSshTrustEntryPort,
    normalizeSshTrustEntryEntity,
    renderSshKnownHosts,
    probeSshHostKeys
  });
  const {
    findSshTrustConflict,
    listSshTrustEntries,
    listTrustedSshHostKeyTypes,
    probeSshHostKeysOrThrow,
    upsertSshTrustEntry,
    deleteSshTrustEntry,
    syncSshKnownHostsFile
  } = runtimeSshTrust;
  const sessionFileTransferMaxBytes =
    Number.isInteger(config.sessionFileTransferMaxBytes) && config.sessionFileTransferMaxBytes > 0
      ? config.sessionFileTransferMaxBytes
      : DEFAULT_SESSION_FILE_TRANSFER_MAX_BYTES;
  const sessionReplayPersistMaxChars =
    Number.isInteger(config.sessionReplayPersistMaxChars) && config.sessionReplayPersistMaxChars >= 0
      ? config.sessionReplayPersistMaxChars
      : 0;
  const sessionStreamAnalysisCapture = createSessionStreamAnalysisCapture({
    filePath: config.sessionStreamAnalysisCaptureFile,
    maxBytes: config.sessionStreamAnalysisCaptureMaxBytes,
    appLabels: config.sessionStreamAnalysisCaptureAppLabels
  });
  const manager = new SessionManager({
    defaultShell: config.shell,
    createPty: typeof config.createPty === "function" ? config.createPty : undefined,
    sessionMaxConcurrent: config.sessionMaxConcurrent,
    sessionIdleTimeoutMs: config.sessionIdleTimeoutMs,
    sessionMaxLifetimeMs: config.sessionMaxLifetimeMs,
    sessionReplayMemoryMaxChars: config.sessionReplayMemoryMaxChars,
    sessionActivityQuietMs: config.sessionActivityQuietMs,
    remoteReconnectMaxAttempts: config.remoteReconnectMaxAttempts,
    remoteReconnectDelayMs: config.remoteReconnectDelayMs,
    remoteReconnectStableMs: config.remoteReconnectStableMs,
    sshKnownHostsPath,
    resolveSshTrustedHostKeyTypes: listTrustedSshHostKeyTypes,
    createTraceId: () => createTraceId("mgr"),
    inspectTerminalForegroundProcess:
      typeof config.inspectTerminalForegroundProcess === "function" ? config.inspectTerminalForegroundProcess : undefined,
    foregroundProcessRefreshDelayMs:
      Number.isInteger(config.foregroundProcessRefreshDelayMs) && config.foregroundProcessRefreshDelayMs >= 0
        ? config.foregroundProcessRefreshDelayMs
        : undefined,
    captureSessionStreamChunk: (event) => sessionStreamAnalysisCapture.captureChunk(event),
    nodePtyAsyncWriteOptions:
      config.nodePtyAsyncWriteOptions &&
      typeof config.nodePtyAsyncWriteOptions === "object" &&
      !Array.isArray(config.nodePtyAsyncWriteOptions)
        ? config.nodePtyAsyncWriteOptions
        : undefined
  });
  const persistence = new JsonPersistence(config.dataPath, {
    encryptionProvider: config.dataEncryptionProvider || null
  });
  const createSessionRateLimiter = new FixedWindowRateLimiter({ windowMs: config.rateLimitWindowMs });
  const wsConnectRateLimiter = new FixedWindowRateLimiter({ windowMs: config.rateLimitWindowMs });
  const accessTokenVerifier = createAccessTokenVerifier(config);
  const wsServer = new WebSocketServer({
    noServer: true,
    handleProtocols(protocols) {
      return protocols.has("ptydeck.v1") ? "ptydeck.v1" : false;
    }
  });
  const sockets = new Set();
  const customCommands = new Map();
  const unrestoredSessions = new Map();
  let persistedReplayOutputs = new Map();
  const decks = new Map();
  const sessionControlStates = new Map();
  const connectionProfiles = new Map();
  const layoutProfiles = new Map();
  const workspacePresets = new Map();
  const shareLinks = new Map();
  const runtimeSessionResourceAuthority = createRuntimeSessionResourceAuthority({
    manager,
    getApiSessionOrThrow: (...args) => getApiSessionOrThrow(...args),
    getPersistedReplayOutputs: () => persistedReplayOutputs,
    sessionFileTransferMaxBytes,
    sessionFileTransferPathMaxLength: SESSION_FILE_TRANSFER_PATH_MAX_LENGTH,
    sessionKindLocal: SESSION_KIND_LOCAL,
    sessionReplayExportScope: SESSION_REPLAY_EXPORT_SCOPE,
    sessionReplayExcerptScope: SESSION_REPLAY_EXCERPT_SCOPE,
    sessionReplayExportFormat: SESSION_REPLAY_EXPORT_FORMAT,
    sessionReplayExcerptFormat: SESSION_REPLAY_EXCERPT_FORMAT,
    sessionReplayExportContentType: SESSION_REPLAY_EXPORT_CONTENT_TYPE,
    sessionReplayExcerptContentType: SESSION_REPLAY_EXCERPT_CONTENT_TYPE,
    sessionFileTransferContentType: SESSION_FILE_TRANSFER_CONTENT_TYPE,
    sessionFileTransferEncoding: SESSION_FILE_TRANSFER_ENCODING
  });
  const {
    buildSessionReplayExportOrThrow,
    buildSessionReplayExcerptOrThrow,
    buildSessionFileDownloadOrThrow,
    uploadSessionFileOrThrow,
    tryCreateRestoredSession
  } = runtimeSessionResourceAuthority;

  function hasKnownSession(sessionId) {
    try {
      manager.get(sessionId);
      return true;
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    return unrestoredSessions.has(sessionId);
  }

  const runtimeLibraryNormalization = createRuntimeLibraryNormalization({
    decks,
    layoutProfiles,
    getDeckOrThrow,
    getApiSessionOrThrow: (...args) => getApiSessionOrThrow(...args),
    hasKnownSession,
    resolveSessionDeckId: (...args) => resolveSessionDeckId(...args),
    normalizeSessionKind,
    normalizeSessionStartupConfig,
    normalizeSessionRemoteConnection,
    normalizeSessionRemoteAuth,
    normalizeSessionThemeSlots,
    normalizeSessionTags,
    defaultLocalStartCwd: homedir()
  });
  const {
    buildCustomCommandEntry,
    buildCustomCommandKey,
    buildDefaultDeck,
    compareConnectionProfileEntries,
    compareCustomCommandEntries,
    compareDeckEntries,
    compareLayoutProfileEntries,
    normalizeConnectionProfileDeckId,
    normalizeConnectionProfileEntity,
    normalizeConnectionProfileIdInput,
    normalizeConnectionProfileLaunch,
    normalizeConnectionProfileName,
    normalizeCustomCommandName,
    normalizeCustomCommandScope,
    normalizeCustomCommandSessionId,
    normalizeDeckEntity,
    normalizeDeckIdInput,
    normalizeDeckName,
    normalizeDeckSettings,
    normalizeLayoutProfileEntity,
    normalizeLayoutProfileIdInput,
    normalizeLayoutProfileLayout,
    normalizeLayoutProfileName,
    normalizePersistedShareLinkEntity,
    normalizeShareLinkEntity,
    normalizeWorkspacePresetEntity,
    normalizeWorkspacePresetIdInput,
    normalizeWorkspacePresetName,
    normalizeWorkspacePresetWorkspace,
    slugifyConnectionProfileId,
    slugifyDeckId,
    slugifyLayoutProfileId,
    slugifyWorkspacePresetId
  } = runtimeLibraryNormalization;
  const runtimeLibraryAuthority = createRuntimeLibraryAuthority({
    shareLinks,
    connectionProfiles,
    layoutProfiles,
    workspacePresets,
    authDevSecret: config.authDevSecret,
    authIssuer: config.authIssuer,
    authAudience: config.authAudience,
    defaultShell: config.shell,
    normalizeShareLinkEntity,
    normalizeConnectionProfileEntity,
    normalizeConnectionProfileName,
    normalizeConnectionProfileLaunch,
    slugifyConnectionProfileId,
    compareConnectionProfileEntries,
    normalizeLayoutProfileName,
    normalizeLayoutProfileIdInput,
    slugifyLayoutProfileId,
    normalizeLayoutProfileLayout,
    compareLayoutProfileEntries,
    normalizeWorkspacePresetName,
    normalizeWorkspacePresetIdInput,
    slugifyWorkspacePresetId,
    normalizeWorkspacePresetWorkspace,
    hasKnownDeck: (deckId) => decks.has(deckId),
    hasKnownSession,
    resolveSessionDeckId: (sessionId) => resolveSessionDeckId(sessionId),
    createDevTokenImpl: createDevToken
  });
  const {
    listShareLinks,
    listPersistedShareLinks,
    createShareLink,
    getApiShareLinkOrThrow,
    revokeShareLink,
    toApiConnectionProfile,
    listConnectionProfiles,
    listPersistedConnectionProfiles,
    getConnectionProfileOrThrow,
    createConnectionProfile,
    updateConnectionProfile,
    deleteConnectionProfile,
    cleanupConnectionProfiles,
    toApiLayoutProfile,
    listLayoutProfiles,
    listPersistedLayoutProfiles,
    getLayoutProfileOrThrow,
    createLayoutProfile,
    updateLayoutProfile,
    deleteLayoutProfile,
    cleanupLayoutProfiles,
    toApiWorkspacePreset,
    listWorkspacePresets,
    listPersistedWorkspacePresets,
    getWorkspacePresetOrThrow,
    createWorkspacePreset,
    updateWorkspacePreset,
    deleteWorkspacePreset,
    cleanupWorkspacePresets
  } = runtimeLibraryAuthority;
  const telegramTopicBindings = new Map();
  const sessionControlStaleClientTtlMs =
    Number.isInteger(config.sessionControlStaleClientTtlMs) && config.sessionControlStaleClientTtlMs >= 0
      ? config.sessionControlStaleClientTtlMs
      : DEFAULT_SESSION_CONTROL_STALE_CLIENT_TTL_MS;
  const sessionDeckAssignments = new Map();
  const sessionQuickIdAssignments = new Map();
  const { metrics, recordHttpDuration, recordWsError } = createRuntimeMetrics({
    httpDurationBucketsMs: HTTP_DURATION_BUCKETS_MS,
    bumpMetricCounter
  });
  const wsClientConnections = new Map();
  const customCommandMaxCount =
    Number.isInteger(config.customCommandMaxCount) && config.customCommandMaxCount > 0
      ? config.customCommandMaxCount
      : DEFAULT_CUSTOM_COMMAND_MAX_COUNT;
  const customCommandMaxNameLength =
    Number.isInteger(config.customCommandMaxNameLength) && config.customCommandMaxNameLength > 0
      ? config.customCommandMaxNameLength
      : DEFAULT_CUSTOM_COMMAND_MAX_NAME_LENGTH;
  const customCommandMaxContentLength =
    Number.isInteger(config.customCommandMaxContentLength) && config.customCommandMaxContentLength > 0
      ? config.customCommandMaxContentLength
      : DEFAULT_CUSTOM_COMMAND_MAX_CONTENT_LENGTH;
  let stopPromise = null;
  let persistTimer = null;
  let persistQueue = Promise.resolve();
  const guardrailSweepMs =
    Number.isInteger(config.sessionGuardrailSweepMs) && config.sessionGuardrailSweepMs > 0
      ? config.sessionGuardrailSweepMs
      : 1000;
  const authWsTicketTtlSeconds =
    Number.isInteger(config.authWsTicketTtlSeconds) && config.authWsTicketTtlSeconds > 0
      ? config.authWsTicketTtlSeconds
      : DEFAULT_AUTH_WS_TICKET_TTL_SECONDS;
  const startupWarmupQuietMs =
    Number.isInteger(config.startupWarmupQuietMs) && config.startupWarmupQuietMs > 0
      ? config.startupWarmupQuietMs
      : DEFAULT_STARTUP_WARMUP_QUIET_MS;
  const guardrailTimer = setInterval(() => {
    manager.enforceGuardrails();
  }, guardrailSweepMs);
  const corsAllowedOrigins = Array.isArray(config.corsAllowedOrigins)
    ? config.corsAllowedOrigins.filter((origin) => typeof origin === "string" && origin)
    : [config.corsOrigin || "*"].filter(Boolean);

  function createTraceId(prefix = "trc") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  function createTraceEnvelope(seed, overrides = {}) {
    const normalizedSeed = normalizeTraceSeed(seed);
    const normalizedOverrides = normalizeTraceSeed(overrides);
    const traceId = createTraceId("trc");
    const correlationId =
      normalizedOverrides?.correlationId ||
      normalizedSeed?.correlationId ||
      traceId;
    const parentTraceId = normalizedOverrides?.traceId || normalizedSeed?.traceId || "";
    return {
      traceId,
      correlationId,
      ...(parentTraceId ? { parentTraceId } : {}),
      ...(normalizedOverrides?.requestId || normalizedSeed?.requestId
        ? { requestId: normalizedOverrides?.requestId || normalizedSeed?.requestId }
        : {}),
      ...(normalizedOverrides?.connectionId || normalizedSeed?.connectionId
        ? { connectionId: normalizedOverrides?.connectionId || normalizedSeed?.connectionId }
        : {}),
      ...(normalizedOverrides?.sessionId || normalizedSeed?.sessionId
        ? { sessionId: normalizedOverrides?.sessionId || normalizedSeed?.sessionId }
        : {}),
      ...(normalizedOverrides?.deckId || normalizedSeed?.deckId
        ? { deckId: normalizedOverrides?.deckId || normalizedSeed?.deckId }
        : {}),
      ...(normalizedOverrides?.source || normalizedSeed?.source
        ? { source: normalizedOverrides?.source || normalizedSeed?.source }
        : {})
    };
  }

  function logDebug(event, details = {}, traceContext = null) {
    if (!debugLogs) {
      return;
    }
    const timestamp = new Date().toISOString();
    const normalizedTrace = normalizeTraceSeed(traceContext);
    const line = `[ptydeck-backend][${timestamp}] ${event} ${JSON.stringify({
      ...details,
      ...(normalizedTrace?.traceId ? { traceId: normalizedTrace.traceId } : {}),
      ...(normalizedTrace?.correlationId ? { correlationId: normalizedTrace.correlationId } : {}),
      ...(normalizedTrace?.requestId ? { requestId: normalizedTrace.requestId } : {}),
      ...(normalizedTrace?.connectionId ? { connectionId: normalizedTrace.connectionId } : {}),
      ...(normalizedTrace?.sessionId ? { sessionId: normalizedTrace.sessionId } : {}),
      ...(normalizedTrace?.deckId ? { deckId: normalizedTrace.deckId } : {}),
      ...(normalizedTrace?.source ? { traceSource: normalizedTrace.source } : {})
    })}`;
    if (config.debugLogFile) {
      appendFile(config.debugLogFile, `${line}\n`).catch(() => {
        // Ignore debug log write failures.
      });
      return;
    }
    console.log(line);
  }

  const auditLogger = createAuditLogger({
    enabled: config.auditLogs,
    filePath: config.auditLogFile
  });
  const runtimeAccessPolicy = createRuntimeAccessPolicy({
    shareLinks,
    shareLinkPermissionModeReadOnly: SHARE_LINK_PERMISSION_MODE_READ_ONLY
  });
  const {
    ensureShareLinkAuthActive,
    ensureShareRouteAllowed,
    getShareLinkOrThrow,
    isSpectatorAuth,
    resolveWsTicketFromProtocols
  } = runtimeAccessPolicy;
  const runtimeHttpHelpers = createRuntimeHttpHelpers({
    config,
    corsAllowedOrigins,
    traceHeaderId: TRACE_HEADER_ID,
    traceHeaderCorrelationId: TRACE_HEADER_CORRELATION_ID,
    sessionControlClientIdHeader: SESSION_CONTROL_CLIENT_ID_HEADER,
    normalizeTraceSeed,
    verifyAccessToken: (token) => accessTokenVerifier.verifyAccessToken(token),
    ensureShareLinkAuthActive,
    ensureShareRouteAllowed
  });
  const {
    authenticateRequest,
    buildSecurityHeaders,
    buildTraceHeaders,
    ensureTlsIngress,
    writeJson
  } = runtimeHttpHelpers;

  const runtimeStartupReadiness = createRuntimeStartupReadiness({
    logDebug,
    listSessions: () => manager.list(),
    port: config.port
  });
  const sessionControlAttachmentRegistry = createSessionControlAttachmentRegistry({
    staleClientTtlMs: sessionControlStaleClientTtlMs,
    isStopping: runtimeStartupReadiness.getIsStopping,
    isStopped: runtimeStartupReadiness.getIsStopped,
    onPruned: () => {
      broadcastSessionControlRefreshForAuth(null, { source: "ws" });
    }
  });
  const wsTicketRegistry = createRuntimeWsTicketRegistry({
    ttlSeconds: authWsTicketTtlSeconds,
    normalizeSessionControlClientLabel
  });
  const runtimeSessionState = createRuntimeSessionState({
    manager,
    unrestoredSessions,
    decks,
    defaultDeckId: DEFAULT_DECK_ID,
    buildDefaultDeck,
    getDeckOrThrow,
    sessionDeckAssignments,
    sessionQuickIdAssignments,
    sessionQuickIdPool: SESSION_QUICK_ID_POOL,
    sessionQuickIdFallback: SESSION_QUICK_ID_FALLBACK,
    cleanupLayoutProfiles,
    cleanupWorkspacePresets,
    getApiSessionOrThrow: (sessionId) => getApiSessionOrThrow(sessionId)
  });
  const {
    assignSessionQuickIdToken,
    deleteSessionQuickIdToken,
    ensureDefaultDeck,
    ensureSessionExistsOrThrow,
    getSessionQuickIdToken,
    moveSessionToDeck,
    resolveSessionControlModel,
    resolveSessionDeckId,
    setSessionDeckAssignment,
    setSessionQuickIdToken,
    swapSessionQuickIds,
    withDeckId
  } = runtimeSessionState;
  let runtimeCatalogAuthority = null;
  const runtimeSessionAuthority = createRuntimeSessionAuthority({
    manager,
    unrestoredSessions,
    isSpectatorAuth,
    toApiSession,
    withDeckId,
    shareTargetTypeSession: SHARE_LINK_TARGET_TYPE_SESSION,
    shareTargetTypeDeck: SHARE_LINK_TARGET_TYPE_DECK
  });
  const {
    filterPayloadForAuth,
    getApiSessionOrThrow,
    isDeckVisibleToAuth,
    isSessionVisibleToAuth,
    listApiSessions,
    listSessionIdsForAuth
  } = runtimeSessionAuthority;
  const runtimeSessionControlAuthority = createRuntimeSessionControlAuthority({
    sessionControlAttachmentRegistry,
    sessionControlStates,
    sessionControlClientIdHeader: SESSION_CONTROL_CLIENT_ID_HEADER,
    createSessionControlPrincipal,
    sessionControlPrincipalsMatch,
    buildSessionControlStateView,
    normalizeSessionControlState,
    setSessionControllerClient,
    updateSessionControlLastInput,
    normalizeSessionControlClientLabel,
    getSessionControlState,
    resolveSessionControlModel,
    isSessionVisibleToAuth,
    getApiSessionOrThrow,
    listSessionIdsForAuth,
    getDeckOrThrow,
    resolveSessionDeckId,
    broadcastSessionUpdated
  });
  const {
    broadcastSessionControlRefreshForAuth,
    buildApiSessionControlState,
    ensureMessagingSessionInputAccess,
    ensureSessionControllerAccess,
    forgetSessionControlClientOrThrow,
    recordSessionLastInput,
    reconcileSessionControllerForSession,
    releaseSessionControlOrThrow,
    renameSessionControlClientOrThrow,
    takeSessionControlOrThrow,
    takeSessionControlScopeOrThrow,
    transferSessionControlOrThrow,
    withPersistedSessionControlState
  } = runtimeSessionControlAuthority;
  runtimeCatalogAuthority = createRuntimeCatalogAuthority({
    customCommands,
    buildCustomCommandEntry,
    buildCustomCommandKey,
    compareCustomCommandEntries,
    normalizeCustomCommandName,
    normalizeCustomCommandScope,
    normalizeCustomCommandSessionId,
    ensureSessionExistsOrThrow,
    customCommandMaxNameLength,
    customCommandMaxContentLength,
    customCommandMaxCount,
    customCommandNamePattern: CUSTOM_COMMAND_NAME_PATTERN,
    customCommandReservedNames: CUSTOM_COMMAND_RESERVED_NAMES,
    decks,
    defaultDeckId: DEFAULT_DECK_ID,
    normalizeDeckName,
    normalizeDeckIdInput,
    slugifyDeckId,
    normalizeDeckSettings,
    compareDeckEntries,
    isDeckVisibleToAuth,
    ensureDefaultDeck,
    manager,
    unrestoredSessions,
    resolveSessionDeckId,
    setSessionDeckAssignment,
    cleanupConnectionProfiles,
    cleanupLayoutProfiles,
    cleanupWorkspacePresets,
    sessionControlStates,
    normalizeSessionControlState,
    createSessionControlPrincipal,
    withPersistedSessionControlState,
    withDeckId,
    sessionReplayPersistMaxChars,
    listPersistedConnectionProfiles,
    listPersistedLayoutProfiles,
    listPersistedWorkspacePresets,
    listSshTrustEntries,
    listPersistedShareLinks,
    telegramTopicBindings
  });
  const messagingRuntime = createMessagingRuntime({
    telegramBotToken: config.messagingTelegramBotToken,
    telegramTargets: config.messagingTelegramTargets,
    telegramTopicBindings: Array.from(telegramTopicBindings.values()),
    telegramApiBaseUrl: config.messagingTelegramApiBaseUrl,
    telegramOutboundEnabled: config.messagingTelegramOutboundEnabled,
    telegramInboundEnabled: config.messagingTelegramInboundEnabled,
    telegramPollTimeoutSeconds: config.messagingTelegramPollTimeoutSeconds,
    discordTargets: config.messagingDiscordTargets,
    discordApiBaseUrl: config.messagingDiscordApiBaseUrl,
    discordOutboundEnabled: config.messagingDiscordOutboundEnabled,
    createTelegramTransport: config.createMessagingTelegramTransport,
    fetchImpl: config.fetchImpl,
    resolveDeckNameForSession: (session) => {
      const deckId = typeof session?.deckId === "string" && session.deckId.trim() ? session.deckId.trim() : DEFAULT_DECK_ID;
      return decks.get(deckId)?.name || deckId || "Default";
    },
    resolveDeckForSession: (session) => {
      const deckId = typeof session?.deckId === "string" && session.deckId.trim() ? session.deckId.trim() : DEFAULT_DECK_ID;
      const deck = decks.get(deckId) || null;
      return {
        id: deck?.id || deckId,
        name: deck?.name || deckId || "Default"
      };
    },
    listCustomCommands,
    onTelegramTopicBindingUpsert: async (binding) => {
      telegramTopicBindings.set(`${binding.chatId}:${binding.sessionId}`, { ...binding });
      await persistNow("messaging.telegram.topic_binding");
    },
    resolveSessionForMessagingTarget,
    requestMessagingStop,
    requestMessagingRetry,
    requestMessagingSendInput,
    requestMessagingReplayExcerpt,
    logDebug
  });
  runtimeStartupReadiness.attachMessagingRuntime(messagingRuntime);
  const startupWarmup = createRuntimeStartupWarmup({
    quietMs: startupWarmupQuietMs,
    countActiveSessions: () => countActiveRuntimeSessions(manager.list()),
    onReady: () => runtimeStartupReadiness.markReadyFromWarmup(),
    onDebug: (event, details) => {
      logDebug(event, details);
    }
  });
  runtimeStartupReadiness.attachStartupWarmup(startupWarmup);
  const handleAcceptedWsConnection = createRuntimeWsConnectionHandler({
    sockets,
    metrics,
    wsClientConnections,
    logDebug,
    bumpMetricCounter,
    createTraceId,
    sessionControlAttachmentRegistry,
    normalizeWsDisconnectReason,
    broadcastSessionControlRefreshForAuth,
    listSessionIdsForAuth,
    reconcileSessionControllerForSession,
    manager,
    filterPayloadForAuth,
    withTracePayload,
    listApiSessions,
    listCustomCommands,
    listDecks,
    recordWsError
  });
  const handleWsUpgrade = createRuntimeWsUpgradeHandler({
    config,
    resolveRequestContext,
    buildRequestTraceContext,
    resolveAllowedRequestOrigin: (origin) => runtimeHttpHelpers.resolveAllowedRequestOrigin(origin),
    wsConnectRateLimiter,
    accessTokenVerifier,
    wsTicketRegistry,
    resolveWsTicketFromProtocols,
    ensureShareLinkAuthActive,
    ensureShareRouteAllowed,
    logDebug,
    recordWsError,
    wsServer,
    onAccepted: handleAcceptedWsConnection
  });

  function listCustomCommands(options = {}) {
    return runtimeCatalogAuthority.listCustomCommands(options);
  }

  function getCustomCommandOrThrow(name, options = {}) {
    return runtimeCatalogAuthority.getCustomCommandOrThrow(name, options);
  }

  function upsertCustomCommand(name, payload) {
    return runtimeCatalogAuthority.upsertCustomCommand(name, payload);
  }

  function deleteCustomCommand(name, options = {}) {
    return runtimeCatalogAuthority.deleteCustomCommand(name, options);
  }

  function hasCustomCommand(name, options = {}) {
    return runtimeCatalogAuthority.hasCustomCommand(name, options);
  }

  function removeCustomCommandsForSession(sessionId) {
    return runtimeCatalogAuthority.removeCustomCommandsForSession(sessionId);
  }

  function toApiDeck(deck) {
    return runtimeCatalogAuthority.toApiDeck(deck);
  }

  function listDecks(auth = null) {
    return runtimeCatalogAuthority.listDecks(auth);
  }

  function getDeckOrThrow(deckId, auth = null) {
    return runtimeCatalogAuthority.getDeckOrThrow(deckId, auth);
  }

  function createDeck(body) {
    return runtimeCatalogAuthority.createDeck(body);
  }

  function updateDeck(deckId, body) {
    return runtimeCatalogAuthority.updateDeck(deckId, body);
  }

  function deleteDeck(deckId, options = {}) {
    return runtimeCatalogAuthority.deleteDeck(deckId, options);
  }

  function createDefaultSessionOwner(auth = null) {
    return runtimeCatalogAuthority.createDefaultSessionOwner(auth);
  }

  function setSessionControlState(sessionId, value, fallbackOwner = null) {
    return runtimeCatalogAuthority.setSessionControlState(sessionId, value, fallbackOwner);
  }

  function getSessionControlState(sessionId, fallbackOwner = null) {
    return runtimeCatalogAuthority.getSessionControlState(sessionId, fallbackOwner);
  }

  function deleteSessionControlState(sessionId) {
    return runtimeCatalogAuthority.deleteSessionControlState(sessionId);
  }

  function snapshotRuntimeState() {
    return runtimeCatalogAuthority.snapshotRuntimeState();
  }

  function toApiSession(session, explicitState) {
    const sessionState = typeof explicitState === "string" && explicitState.trim() ? explicitState.trim() : String(session?.state || "").trim();
    const sessionModel = withDeckId(session);
    const appIdentity = normalizeTerminalAppIdentity(sessionModel.appIdentity, {
      fallbackUpdatedAt: Number.isInteger(sessionModel.updatedAt) ? sessionModel.updatedAt : Date.now()
    });
    const resolvedAppIdentity =
      appIdentity.source === "unknown" && !sessionModel.appIdentity
        ? deriveTerminalAppIdentityFromSessionHints(sessionModel, {
            existingIdentity: sessionModel.appIdentity,
            updatedAt: Number.isInteger(sessionModel.updatedAt) ? sessionModel.updatedAt : Date.now()
          })
        : appIdentity;
    return {
      ...sessionModel,
      appIdentity: resolvedAppIdentity,
      state: sessionState || "running",
      controlState: buildApiSessionControlState(session.id, sessionModel)
    };
  }

  function resolveSessionForMessagingTarget(target) {
    const normalizedSessionId = typeof target?.sessionId === "string" ? target.sessionId.trim() : "";
    if (normalizedSessionId) {
      return getApiSessionOrThrow(normalizedSessionId);
    }

    const normalizedQuickIdToken = typeof target?.quickIdToken === "string" ? target.quickIdToken.trim() : "";
    const normalizedSessionName = typeof target?.sessionName === "string" ? target.sessionName.trim() : "";
    const matches = manager.list().filter((session) => {
      if (normalizedQuickIdToken && getSessionQuickIdToken(session.id) !== normalizedQuickIdToken) {
        return false;
      }
      if (normalizedSessionName && session.name !== normalizedSessionName) {
        return false;
      }
      return Boolean(normalizedQuickIdToken || normalizedSessionName);
    });
    if (matches.length === 0) {
      throw new ApiError(404, "SessionNotFound", "Mapped ptydeck session was not found.");
    }
    if (matches.length > 1) {
      throw new ApiError(
        409,
        "MessagingTargetAmbiguous",
        "Mapped ptydeck session is ambiguous. Narrow the Telegram target selector."
      );
    }
    return toApiSession(matches[0]);
  }

  function requestMessagingStop(sessionId, options = {}) {
    manager.terminate(sessionId, options);
    return null;
  }

  function requestMessagingRetry(sessionId, options = {}) {
    try {
      const payload = manager.restart(sessionId, options);
      assignSessionQuickIdToken(payload.id, payload.quickIdToken);
      return toApiSession(payload);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }

    const snapshot = options.sessionSnapshot && typeof options.sessionSnapshot === "object" ? options.sessionSnapshot : null;
    if (!snapshot || !snapshot.id) {
      throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
    }
    const payload = manager.create({
      id: snapshot.id,
      kind: snapshot.kind,
      remoteConnection: snapshot.remoteConnection,
      remoteAuth: snapshot.remoteAuth,
      remoteSecret: snapshot.remoteSecret,
      quickIdToken: snapshot.quickIdToken,
      cwd: snapshot.startCwd || snapshot.cwd,
      shell: snapshot.shell,
      name: snapshot.name,
      deckId: snapshot.deckId,
      startCwd: snapshot.startCwd || snapshot.cwd,
      startCommand: snapshot.startCommand || "",
      env: snapshot.env || {},
      note: snapshot.note,
      mouseForwardingMode: snapshot.mouseForwardingMode,
      inputSafetyProfile: snapshot.inputSafetyProfile,
      tags: snapshot.tags || [],
      themeProfile: snapshot.themeProfile || {},
      activeThemeProfile: snapshot.activeThemeProfile,
      inactiveThemeProfile: snapshot.inactiveThemeProfile,
      createdAt: snapshot.createdAt,
      updatedAt: Date.now(),
      trace: options.trace
    });
    assignSessionQuickIdToken(payload.id, payload.quickIdToken);
    return toApiSession(payload);
  }

  function requestMessagingSendInput(sessionId, data, options = {}) {
    const sessionSnapshot = getApiSessionOrThrow(sessionId);
    ensureMessagingSessionInputAccess(sessionId, "send terminal input");
    const trace = {
      ...(options.trace && typeof options.trace === "object" ? options.trace : {}),
      sessionId
    };
    const normalizedData = typeof data === "string" ? data : "";
    const replyInputText = normalizedData.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/g, "").trim();
    const useDelayedSubmit = /\r$/.test(normalizedData);
    const replyPromotionEligible = /[\r\n]/.test(normalizedData);
    const baseWriteDetails = {
      sessionId,
      source: normalizeTraceSeed(trace)?.source || "",
      useDelayedSubmit,
      replyPromotionEligible,
      payloadBytes: Buffer.byteLength(normalizedData, "utf8")
    };
    const preSubmitObservationTrace = {
      ...trace,
      ...(replyInputText ? { replyInputText } : {})
    };
    delete preSubmitObservationTrace.replyEligible;
    delete preSubmitObservationTrace.replyPromotionEligible;
    const directInputTrace = replyPromotionEligible ? { ...trace, replyPromotionEligible: true } : trace;
    const enrichedDirectInputTrace = replyInputText ? { ...directInputTrace, replyInputText } : directInputTrace;

    function logMessagingInputWrite(event, details = {}, traceContext = null) {
      logDebug(
        event,
        {
          ...baseWriteDetails,
          ...details
        },
        traceContext || trace
      );
    }

    if (useDelayedSubmit) {
      const body = normalizedData.replace(/\r+$/g, "");
      if (body) {
        messagingRuntime.observeSessionInput(sessionId, preSubmitObservationTrace);
        const bodyTrace = replyInputText ? { ...trace, replyInputText } : trace;
        logMessagingInputWrite("messaging.input.write_attempt", {
          writeKind: "body",
          bytes: Buffer.byteLength(body, "utf8")
        }, bodyTrace);
        try {
          manager.sendInput(sessionId, body, {
            trace: bodyTrace,
            writeKind: "body"
          });
          logMessagingInputWrite("messaging.input.write_ok", {
            writeKind: "body",
            bytes: Buffer.byteLength(body, "utf8")
          }, bodyTrace);
        } catch (error) {
          logMessagingInputWrite("messaging.input.write_failed", {
            writeKind: "body",
            bytes: Buffer.byteLength(body, "utf8"),
            error: error instanceof Error ? error.message : String(error || "write failed")
          }, bodyTrace);
          throw error;
        }
      }
      logMessagingInputWrite("messaging.input.delayed_submit_scheduled", {
        writeKind: "submit_cr",
        delayMs: DEFAULT_MESSAGING_CODEX_SUBMIT_DELAY_MS,
        bodyBytes: Buffer.byteLength(body, "utf8"),
        submitBytes: 1
      });
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          const submitTrace = replyPromotionEligible ? { ...trace, replyPromotionEligible: true } : trace;
          const enrichedSubmitTrace = replyInputText ? { ...submitTrace, replyInputText } : submitTrace;
          logMessagingInputWrite("messaging.input.delayed_submit_fired", {
            writeKind: "submit_cr",
            bytes: 1
          }, enrichedSubmitTrace);
          messagingRuntime.observeSessionInput(sessionId, enrichedSubmitTrace);
          logMessagingInputWrite("messaging.input.write_attempt", {
            writeKind: "submit_cr",
            bytes: 1
          }, enrichedSubmitTrace);
          try {
            manager.sendInput(sessionId, "\r", {
              trace: enrichedSubmitTrace,
              writeKind: "submit_cr"
            });
            logMessagingInputWrite("messaging.input.write_ok", {
              writeKind: "submit_cr",
              bytes: 1
            }, enrichedSubmitTrace);
            recordSessionLastInput(sessionId, null, null);
            broadcastSessionUpdated(sessionId, options.trace || null);
            resolve(getApiSessionOrThrow(sessionId));
          } catch (error) {
            logMessagingInputWrite("messaging.input.write_failed", {
              writeKind: "submit_cr",
              bytes: 1,
              error: error instanceof Error ? error.message : String(error || "write failed")
            }, enrichedSubmitTrace);
            reject(error);
          }
        }, DEFAULT_MESSAGING_CODEX_SUBMIT_DELAY_MS);
      });
    }
    messagingRuntime.observeSessionInput(sessionId, enrichedDirectInputTrace);
    logMessagingInputWrite("messaging.input.write_attempt", {
      writeKind: "direct",
      bytes: Buffer.byteLength(normalizedData, "utf8")
    }, enrichedDirectInputTrace);
    try {
      manager.sendInput(sessionId, normalizedData, {
        trace: enrichedDirectInputTrace,
        writeKind: "direct"
      });
      logMessagingInputWrite("messaging.input.write_ok", {
        writeKind: "direct",
        bytes: Buffer.byteLength(normalizedData, "utf8")
      }, enrichedDirectInputTrace);
    } catch (error) {
      logMessagingInputWrite("messaging.input.write_failed", {
        writeKind: "direct",
        bytes: Buffer.byteLength(normalizedData, "utf8"),
        error: error instanceof Error ? error.message : String(error || "write failed")
      }, enrichedDirectInputTrace);
      throw error;
    }
    recordSessionLastInput(sessionId, null, null);
    broadcastSessionUpdated(sessionId, options.trace || null);
    return getApiSessionOrThrow(sessionId);
  }

  function requestMessagingReplayExcerpt(sessionId, selector) {
    return buildSessionReplayExcerptOrThrow(sessionId, selector);
  }

  function saveStateQueued(state, reason = "unknown") {
    const executeSave = async () => {
      logDebug("persist.save.start", {
        reason,
        sessionCount: state.sessions.length,
        customCommandCount: state.customCommands.length,
        deckCount: state.decks.length,
        connectionProfileCount: state.connectionProfiles.length,
        workspacePresetCount: state.workspacePresets.length,
        sshTrustEntryCount: state.sshTrustEntries.length,
        shareLinkCount: state.shareLinks.length
      });
      await persistence.saveState(state);
      logDebug("persist.save.ok", {
        reason,
        sessionCount: state.sessions.length,
        customCommandCount: state.customCommands.length,
        deckCount: state.decks.length,
        connectionProfileCount: state.connectionProfiles.length,
        workspacePresetCount: state.workspacePresets.length,
        sshTrustEntryCount: state.sshTrustEntries.length,
        shareLinkCount: state.shareLinks.length
      });
    };

    persistQueue = persistQueue.then(executeSave, executeSave);
    return persistQueue;
  }

  async function persistNow(reason = "manual") {
    if (runtimeStartupReadiness.getIsStopping()) {
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await saveStateQueued(snapshotRuntimeState(), reason);
  }

  function persistSoon() {
    if (runtimeStartupReadiness.getIsStopping()) {
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
      persistTimer = null;
      saveStateQueued(snapshotRuntimeState(), "debounced").catch((err) => {
        console.error("failed to persist runtime state", err);
      });
    }, 100);
  }

  function inferTraceContextFromPayload(payload) {
    const normalizedPayloadTrace = normalizeTraceSeed(payload?.trace);
    const sessionId =
      normalizedPayloadTrace?.sessionId ||
      normalizeTraceToken(payload?.session?.id) ||
      normalizeTraceToken(payload?.sessionId);
    const deckId =
      normalizedPayloadTrace?.deckId ||
      normalizeTraceToken(payload?.session?.deckId) ||
      normalizeTraceToken(payload?.deck?.id) ||
      normalizeTraceToken(payload?.deckId);
    return {
      ...(sessionId ? { sessionId } : {}),
      ...(deckId ? { deckId } : {})
    };
  }

  function withTracePayload(payload, traceSeed = null) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return payload;
    }
    if (normalizeTraceSeed(payload.trace)) {
      return payload;
    }
    return {
      ...payload,
      trace: createTraceEnvelope(traceSeed, inferTraceContextFromPayload(payload))
    };
  }

  function broadcast(payload, traceSeed = null) {
    const tracedPayload = withTracePayload(payload, traceSeed);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        const filteredPayload = filterPayloadForAuth(tracedPayload, socket.auth || null);
        if (!filteredPayload) {
          continue;
        }
        socket.send(JSON.stringify(filteredPayload));
      }
    }
  }

  function broadcastSessionUpdated(sessionId, traceSeed = null) {
    broadcast({
      type: "session.updated",
      session: getApiSessionOrThrow(sessionId)
    }, traceSeed);
  }

  manager.on("session.activity.started", (event) => {
    logDebug("session.event", { type: "session.activity.started", sessionId: event.sessionId || null }, event.trace);
    void messagingRuntime.observeSessionActivityStarted({
      sessionId: event.sessionId,
      trace: event.trace
    });
    startupWarmup.reconcile();
    persistSoon();
  });

  manager.on("session.input.write", (event) => {
    logDebug(
      "session.input.write",
      {
        sessionId: event.sessionId || null,
        phase: event.phase || "",
        writeKind: event.writeKind || "",
        bytes: Number.isInteger(event.bytes) ? event.bytes : 0,
        ...(event.error ? { error: event.error } : {}),
        ...(typeof event.code === "string" && event.code ? { code: event.code } : {}),
        ...(typeof event.failureStage === "string" && event.failureStage ? { failureStage: event.failureStage } : {}),
        ...(Number.isInteger(event.retryCount) ? { retryCount: event.retryCount } : {}),
        ...(Number.isInteger(event.queueDroppedCount) ? { queueDroppedCount: event.queueDroppedCount } : {}),
        ...(event.droppedByQueueFailure === true ? { droppedByQueueFailure: true } : {}),
        ...(event.retryable === true ? { retryable: true } : {})
      },
      event.trace
    );
  });

  manager.on("session.activity.completed", async (event) => {
    logDebug("session.event", { type: "session.activity.completed", sessionId: event.sessionId || null }, event.trace);
    startupWarmup.reconcile();
    try {
      await persistNow("session.activity.completed");
      const apiSession = getApiSessionOrThrow(event.sessionId);
      await messagingRuntime.observeSessionIdle({
        session: apiSession,
        trace: event.trace
      });
      broadcast({
        type: "session.activity.completed",
        sessionId: event.sessionId,
        activityCompletedAt: event.activityCompletedAt,
        session: apiSession,
        trace: normalizeTraceSeed(event.trace)
      }, event.trace);
    } catch (error) {
      console.error("failed to persist session activity completion", error);
    }
  });

  function broadcastDeckUpsert(type, deck, traceSeed = null) {
    broadcast({
      type,
      deck: toApiDeck(deck)
    }, traceSeed);
  }

  function broadcastDeckDeleted(deckId, fallbackDeckId = DEFAULT_DECK_ID, traceSeed = null) {
    broadcast({
      type: "deck.deleted",
      deckId,
      fallbackDeckId
    }, traceSeed);
  }

  const resourceDispatch = createRuntimeResourceDispatch({
    validateResponse,
    parseBooleanQueryParam,
    normalizeCustomCommandScope,
    normalizeCustomCommandSessionId,
    listShareLinks,
    createShareLink,
    getApiShareLinkOrThrow,
    revokeShareLink,
    persistNow,
    getApiSessionOrThrow,
    listApiSessions,
    listCustomCommands,
    getCustomCommandOrThrow,
    hasCustomCommand,
    upsertCustomCommand,
    deleteCustomCommand,
    broadcast,
    listDecks,
    createDeck,
    getDeckOrThrow,
    toApiDeck,
    updateDeck,
    deleteDeck,
    broadcastSessionUpdated,
    broadcastDeckUpsert,
    broadcastDeckDeleted,
    moveSessionToDeck,
    listLayoutProfiles,
    createLayoutProfile,
    getLayoutProfileOrThrow,
    toApiLayoutProfile,
    updateLayoutProfile,
    deleteLayoutProfile,
    listConnectionProfiles,
    createConnectionProfile,
    getConnectionProfileOrThrow,
    toApiConnectionProfile,
    updateConnectionProfile,
    deleteConnectionProfile,
    listWorkspacePresets,
    createWorkspacePreset,
    getWorkspacePresetOrThrow,
    toApiWorkspacePreset,
    updateWorkspacePreset,
    deleteWorkspacePreset,
    listSshTrustEntries,
    upsertSshTrustEntry,
    syncSshKnownHostsFile,
    probeSshHostKeysOrThrow,
    deleteSshTrustEntry,
    messagingRuntime
  });
  const sessionControlDispatch = createRuntimeSessionControlDispatch({
    validateResponse,
    takeSessionControlOrThrow,
    takeSessionControlScopeOrThrow,
    releaseSessionControlOrThrow,
    transferSessionControlOrThrow,
    renameSessionControlClientOrThrow,
    forgetSessionControlClientOrThrow,
    getApiSessionOrThrow,
    persistNow
  });
  const sessionDispatch = createRuntimeSessionDispatch({
    validateResponse,
    createSessionRateLimiter,
    rateLimitRestCreateMax: config.rateLimitRestCreateMax,
    normalizeConnectionProfileIdInput,
    getConnectionProfileOrThrow,
    normalizeSessionKind,
    normalizeSessionStartupConfig,
    normalizeSessionRemoteConnection,
    normalizeSessionRemoteAuth,
    normalizeSessionRemoteSecret,
    normalizeSessionThemeSlots,
    normalizeSessionNote,
    normalizeSessionMouseForwardingMode,
    normalizeSessionInputSafetyProfile,
    normalizeSessionTags,
    hasKnownDeck: (deckId) => decks.has(deckId),
    normalizeConnectionProfileDeckId,
    normalizeQuickSendUsageMutation,
    getApiSessionOrThrow,
    listApiSessions,
    buildSessionReplayExportOrThrow,
    buildSessionReplayExcerptOrThrow,
    buildSessionFileDownloadOrThrow,
    uploadSessionFileOrThrow,
    ensureSessionControllerAccess,
    messagingRuntime,
    manager,
    assignSessionQuickIdToken,
    deleteSessionQuickIdToken,
    createDefaultSessionOwner,
    setSessionControlState,
    deleteSessionControlState,
    reconcileSessionControllerForSession,
    toApiSession,
    persistNow,
    persistSoon,
    broadcast,
    broadcastSessionUpdated,
    removeCustomCommandsForSession,
    cleanupLayoutProfiles,
    cleanupWorkspacePresets,
    deleteUnrestoredSession: (sessionId) => unrestoredSessions.delete(sessionId),
    deleteSessionDeckAssignment: (sessionId) => sessionDeckAssignments.delete(sessionId),
    setPendingSessionDeckAssignment: (sessionId, deckId) => {
      sessionDeckAssignments.set(sessionId, deckId);
    },
    swapSessionQuickIds,
    recordSessionLastInput,
    defaultSshClient: DEFAULT_SSH_CLIENT,
    sessionKindSsh: SESSION_KIND_SSH
  });

  const wsEventNames = ["session.created", "session.started", "session.updated", "session.data", "session.exit", "session.closed"];
  for (const eventName of wsEventNames) {
    manager.on(eventName, (event) => {
      void (async () => {
        const eventSessionSnapshot =
          event && event.session && typeof event.session === "object" ? structuredClone(event.session) : null;
        const apiEventSession = eventSessionSnapshot ? toApiSession(eventSessionSnapshot, eventSessionSnapshot.state) : null;
        if (eventName !== "session.data") {
          logDebug(
            "session.event",
            {
              type: eventName,
              sessionId: eventSessionSnapshot?.id || event.sessionId || null,
              deckId: eventSessionSnapshot?.deckId || null
            },
            event.trace
          );
        }
        if (eventName === "session.data") {
          const apiSession = getApiSessionOrThrow(event.sessionId);
          await messagingRuntime.observeSessionData({
            session: apiSession,
            data: event.data,
            promptBoundaries: Array.isArray(event.promptBoundaries) ? event.promptBoundaries : [],
            trace: event.trace
          });
        } else if (eventName === "session.created" || eventName === "session.started" || eventName === "session.updated") {
          let messagingSession = apiEventSession;
          const messagingSessionId =
            typeof event.sessionId === "string" && event.sessionId.trim()
              ? event.sessionId
              : typeof eventSessionSnapshot?.id === "string" && eventSessionSnapshot.id.trim()
                ? eventSessionSnapshot.id
                : "";
          if (messagingSessionId) {
            try {
              messagingSession = getApiSessionOrThrow(messagingSessionId);
            } catch {
              messagingSession = apiEventSession;
            }
          }
          if (messagingSession) {
            await messagingRuntime.observeSessionLifecycle(eventName, messagingSession, event.trace);
            try {
              await messagingRuntime.ensureSessionTarget(messagingSession, event.trace);
            } catch (error) {
              logDebug(
                "messaging.target.ensure_failed",
                {
                  sessionId: messagingSession.id,
                  error: error instanceof Error ? error.message : String(error || "Unknown messaging target setup failure.")
                },
                event.trace
              );
            }
          }
        } else if ((eventName === "session.exit" || eventName === "session.closed") && apiEventSession) {
          await messagingRuntime.observeSessionLifecycle(
            eventName,
            apiEventSession,
            event.trace,
            event
          );
        }
        if ((eventName === "session.created" || eventName === "session.started" || eventName === "session.updated") && apiEventSession) {
          broadcast({
            type: eventName,
            ...event,
            session: apiEventSession
          }, event.trace);
        } else if (eventName === "session.data") {
          if (typeof event.data === "string" && event.data.length > 0) {
            broadcast({ type: eventName, sessionId: event.sessionId, data: event.data, trace: event.trace }, event.trace);
          }
        } else {
          broadcast({ type: eventName, ...event }, event.trace);
        }
        if (eventName === "session.created") {
          metrics.sessionsCreatedTotal += 1;
        } else if (eventName === "session.started") {
          metrics.sessionsStartedTotal += 1;
        } else if (eventName === "session.exit") {
          metrics.sessionsExitedTotal += 1;
        }
        if (eventName !== "session.data") {
          if (eventName === "session.created" || eventName === "session.started" || eventName === "session.exit" || eventName === "session.closed") {
            startupWarmup.reconcile();
          }
          persistSoon();
        }
      })().catch((error) => {
        if (error instanceof ApiError && error.error === "SessionNotFound" && eventName === "session.data") {
          return;
        }
        console.error(`failed to process ${eventName} event`, error);
      });
    });
  }

  const handleHttpRequest = createRuntimeHttpRequestHandler({
    config,
    maxBodyBytes,
    metrics,
    recordHttpDuration,
    bumpMetricCounter,
    logDebug,
    resolveRequestContext,
    buildRequestTraceContext,
    parseJsonBody,
    validateRequest,
    validateResponse,
    ensureTlsIngress,
    authenticateRequest,
    writeJson,
    buildSecurityHeaders,
    buildTraceHeaders,
    auditLogger,
    getIsReady: runtimeStartupReadiness.getIsReady,
    startupWarmup,
    manager,
    unrestoredSessions,
    sockets,
    httpDurationBucketsMs: HTTP_DURATION_BUCKETS_MS,
    escapePrometheusLabel,
    wsTicketRegistry,
    messagingRuntime,
    sessionStreamAnalysisCapture,
    dispatchResourceRequest: (input) => resourceDispatch.dispatchResourceRequest(input),
    dispatchSessionRequest: (input) => sessionDispatch.dispatchSessionRequest(input),
    dispatchSessionControlRequest: (input) => sessionControlDispatch.dispatchSessionControlRequest(input)
  });

  const server = http.createServer(handleHttpRequest);

  server.on("upgrade", (request, socket, head) => {
    void handleWsUpgrade(request, socket, head);
  });

  const heartbeat = setInterval(() => {
    for (const ws of sockets) {
      if (!ws.isAlive) {
        ws.closeReasonHint = "heartbeat_timeout";
        ws.terminate();
        sockets.delete(ws);
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  const runtimeStartupRestore = createRuntimeStartupRestore({
    persistence,
    sessionReplayPersistMaxChars,
    startupWarmup,
    decks,
    connectionProfiles,
    layoutProfiles,
    workspacePresets,
    sshTrustEntries,
    shareLinks,
    telegramTopicBindings,
    sessionDeckAssignments,
    sessionQuickIdAssignments,
    sessionControlStates,
    unrestoredSessions,
    customCommands,
    manager,
    messagingRuntime,
    normalizeDeckEntity,
    normalizeLayoutProfileEntity,
    normalizeConnectionProfileEntity,
    slugifyConnectionProfileId,
    normalizeSshTrustEntryEntity,
    findSshTrustConflict,
    normalizePersistedShareLinkEntity,
    normalizeMessagingTopicBindings,
    syncSshKnownHostsFile,
    ensureDefaultDeck,
    logDebug,
    createLocalOperatorPrincipal,
    setSessionControlState,
    normalizeSessionKind,
    normalizeSessionStartupConfig,
    normalizeSessionRemoteConnection,
    normalizeSessionRemoteAuth,
    normalizeSessionThemeSlots,
    normalizeSessionNote,
    normalizeSessionMouseForwardingMode,
    normalizeSessionInputSafetyProfile,
    normalizeSessionTags,
    normalizeQuickSendUsageEntries,
    assignSessionQuickIdToken,
    deriveTerminalAppIdentityFromSessionHints,
    remoteAuthRequiresSecret,
    tryCreateRestoredSession,
    listSessionIdsForAuth,
    reconcileSessionControllerForSession,
    buildCustomCommandEntry,
    buildCustomCommandKey,
    compareCustomCommandEntries,
    ensureSessionExistsOrThrow,
    normalizeWorkspacePresetEntity,
    cleanupLayoutProfiles,
    cleanupConnectionProfiles,
    cleanupWorkspacePresets,
    hasKnownSession,
    resolveSessionDeckId,
    metrics,
    customCommandNamePattern: CUSTOM_COMMAND_NAME_PATTERN,
    customCommandReservedNames: CUSTOM_COMMAND_RESERVED_NAMES,
    customCommandMaxNameLength,
    customCommandMaxContentLength,
    customCommandMaxCount,
    defaultDeckId: DEFAULT_DECK_ID,
    defaultSshClient: DEFAULT_SSH_CLIENT,
    sessionKindSsh: SESSION_KIND_SSH,
    defaultShell: config.shell
  });

  async function start() {
    await accessTokenVerifier.prewarm();
    messagingRuntime.prepareForRuntimeStart();
    runtimeStartupReadiness.prepareForStart();
    const restoredState = await runtimeStartupRestore.restorePersistedRuntimeState();
    persistedReplayOutputs = restoredState.persistedReplayOutputs;

    await new Promise((resolve) => {
      server.listen(config.port, resolve);
    });
    await messagingRuntime.start();
    for (const session of manager.list()) {
      try {
        await messagingRuntime.ensureSessionTarget(toApiSession(session, session.state), {
          source: "runtime.start"
        });
      } catch (error) {
        logDebug(
          "messaging.target.ensure_failed",
          {
            sessionId: session?.id || null,
            error: error instanceof Error ? error.message : String(error || "Unknown messaging target setup failure.")
          },
          { source: "runtime.start", sessionId: session?.id || "" }
        );
      }
    }
    if (typeof config.onBeforeReady === "function") {
      await config.onBeforeReady();
    }
    await runtimeStartupReadiness.releaseGateAndAwaitReadiness();
  }

  async function stopInternal() {
    runtimeStartupReadiness.beginStop();
    clearInterval(heartbeat);
    clearInterval(guardrailTimer);
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    sessionControlAttachmentRegistry.clearPruneTimer();
    await messagingRuntime.stop();

    for (const ws of sockets) {
      ws.closeReasonHint = "server_shutdown";
      ws.terminate();
    }
    sockets.clear();
    wsServer.close();
    for (const sessionId of listSessionIdsForAuth(null)) {
      reconcileSessionControllerForSession(sessionId);
    }

    const persistedSnapshot = snapshotRuntimeState();
    logDebug("runtime.stop.start", {
      sessionCount: persistedSnapshot.sessions.length,
      customCommandCount: persistedSnapshot.customCommands.length,
      deckCount: persistedSnapshot.decks.length,
      socketCount: sockets.size
    });

    for (const session of manager.list()) {
      try {
        manager.delete(session.id);
      } catch {
        // Ignore cleanup errors.
      }
    }

    await persistence.saveState(persistedSnapshot);
    logDebug("runtime.stop.persisted", {
      persistedSessionCount: persistedSnapshot.sessions.length,
      persistedCustomCommandCount: persistedSnapshot.customCommands.length,
      persistedDeckCount: persistedSnapshot.decks.length
    });

    if (server.listening) {
      await new Promise((resolve) => {
        server.close(resolve);
        if (typeof server.closeIdleConnections === "function") {
          server.closeIdleConnections();
        }
        if (typeof server.closeAllConnections === "function") {
          server.closeAllConnections();
        }
      });
    }

    runtimeStartupReadiness.markStopped();
    logDebug("runtime.stop.done", {});
  }

  async function stop() {
    if (runtimeStartupReadiness.getIsStopped()) {
      return;
    }
    if (stopPromise) {
      return stopPromise;
    }
    stopPromise = stopInternal().finally(() => {
      stopPromise = null;
    });
    return stopPromise;
  }

  function getAddress() {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      return null;
    }
    return addr;
  }

  return {
    manager,
    server,
    start,
    stop,
    getAddress
  };
}
