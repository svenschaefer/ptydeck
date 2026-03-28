import http from "node:http";
import crypto from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { createDevToken, ensureScope, resolveBearerToken, verifyDevToken } from "./auth.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { JsonPersistence } from "./persistence.js";
import { resolveRequestContext } from "./proxy.js";
import { FixedWindowRateLimiter } from "./rate-limiter.js";
import {
  DEFAULT_SESSION_INPUT_SAFETY_PROFILE,
  normalizeSessionInputSafetyProfile
} from "./session-input-safety-profile.js";
import { SessionManager } from "./session-manager.js";
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
const SSH_TRUST_ENTRY_ID_PATTERN = /^trust-[a-f0-9]{24}$/;
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
const SESSION_REPLAY_EXPORT_FORMAT = "text";
const SESSION_REPLAY_EXPORT_CONTENT_TYPE = "text/plain; charset=utf-8";
const SESSION_QUICK_ID_POOL = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SESSION_QUICK_ID_FALLBACK = "?";
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

function decodePathParam(value, name) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ApiError(400, "ValidationError", `Invalid path parameter encoding for '${name}'.`);
  }
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

function route(pathname, method) {
  if (pathname === "/health" && method === "GET") {
    return { kind: "health" };
  }
  if (pathname === "/ready" && method === "GET") {
    return { kind: "ready" };
  }
  if (pathname === "/metrics" && method === "GET") {
    return { kind: "metrics" };
  }
  if (pathname === "/api/v1/sessions" && method === "GET") {
    return { kind: "listSessions" };
  }
  if (pathname === "/api/v1/sessions" && method === "POST") {
    return { kind: "createSession" };
  }
  if (pathname === "/api/v1/auth/dev-token" && method === "POST") {
    return { kind: "devToken" };
  }
  if (pathname === "/api/v1/auth/ws-ticket" && method === "POST") {
    return { kind: "wsTicket" };
  }
  if (pathname === "/api/v1/custom-commands" && method === "GET") {
    return { kind: "listCustomCommands" };
  }
  if (pathname === "/api/v1/decks" && method === "GET") {
    return { kind: "listDecks" };
  }
  if (pathname === "/api/v1/decks" && method === "POST") {
    return { kind: "createDeck" };
  }
  if (pathname === "/api/v1/layout-profiles" && method === "GET") {
    return { kind: "listLayoutProfiles" };
  }
  if (pathname === "/api/v1/layout-profiles" && method === "POST") {
    return { kind: "createLayoutProfile" };
  }
  if (pathname === "/api/v1/connection-profiles" && method === "GET") {
    return { kind: "listConnectionProfiles" };
  }
  if (pathname === "/api/v1/connection-profiles" && method === "POST") {
    return { kind: "createConnectionProfile" };
  }
  if (pathname === "/api/v1/workspace-presets" && method === "GET") {
    return { kind: "listWorkspacePresets" };
  }
  if (pathname === "/api/v1/workspace-presets" && method === "POST") {
    return { kind: "createWorkspacePreset" };
  }
  if (pathname === "/api/v1/ssh-trust-entries" && method === "GET") {
    return { kind: "listSshTrustEntries" };
  }
  if (pathname === "/api/v1/ssh-trust-entries" && method === "POST") {
    return { kind: "createSshTrustEntry" };
  }

  const customCommandMatch = pathname.match(/^\/api\/v1\/custom-commands\/([^/]+)$/);
  if (customCommandMatch && method === "GET") {
    return { kind: "getCustomCommand", params: { commandName: decodePathParam(customCommandMatch[1], "commandName") } };
  }
  if (customCommandMatch && method === "PUT") {
    return {
      kind: "upsertCustomCommand",
      params: { commandName: decodePathParam(customCommandMatch[1], "commandName") }
    };
  }
  if (customCommandMatch && method === "DELETE") {
    return {
      kind: "deleteCustomCommand",
      params: { commandName: decodePathParam(customCommandMatch[1], "commandName") }
    };
  }

  const deckMatch = pathname.match(/^\/api\/v1\/decks\/([^/]+)$/);
  if (deckMatch && method === "GET") {
    return { kind: "getDeck", params: { deckId: decodePathParam(deckMatch[1], "deckId") } };
  }
  if (deckMatch && method === "PATCH") {
    return { kind: "updateDeck", params: { deckId: decodePathParam(deckMatch[1], "deckId") } };
  }
  if (deckMatch && method === "DELETE") {
    return { kind: "deleteDeck", params: { deckId: decodePathParam(deckMatch[1], "deckId") } };
  }

  const moveSessionMatch = pathname.match(/^\/api\/v1\/decks\/([^/]+)\/sessions\/([^/]+):move$/);
  if (moveSessionMatch && method === "POST") {
    return {
      kind: "moveSessionToDeck",
      params: {
        deckId: decodePathParam(moveSessionMatch[1], "deckId"),
        sessionId: decodePathParam(moveSessionMatch[2], "sessionId")
      }
    };
  }

  const layoutProfileMatch = pathname.match(/^\/api\/v1\/layout-profiles\/([^/]+)$/);
  if (layoutProfileMatch && method === "GET") {
    return { kind: "getLayoutProfile", params: { profileId: decodePathParam(layoutProfileMatch[1], "profileId") } };
  }
  if (layoutProfileMatch && method === "PATCH") {
    return { kind: "updateLayoutProfile", params: { profileId: decodePathParam(layoutProfileMatch[1], "profileId") } };
  }
  if (layoutProfileMatch && method === "DELETE") {
    return { kind: "deleteLayoutProfile", params: { profileId: decodePathParam(layoutProfileMatch[1], "profileId") } };
  }

  const connectionProfileMatch = pathname.match(/^\/api\/v1\/connection-profiles\/([^/]+)$/);
  if (connectionProfileMatch && method === "GET") {
    return {
      kind: "getConnectionProfile",
      params: { profileId: decodePathParam(connectionProfileMatch[1], "profileId") }
    };
  }
  if (connectionProfileMatch && method === "PATCH") {
    return {
      kind: "updateConnectionProfile",
      params: { profileId: decodePathParam(connectionProfileMatch[1], "profileId") }
    };
  }
  if (connectionProfileMatch && method === "DELETE") {
    return {
      kind: "deleteConnectionProfile",
      params: { profileId: decodePathParam(connectionProfileMatch[1], "profileId") }
    };
  }

  const workspacePresetMatch = pathname.match(/^\/api\/v1\/workspace-presets\/([^/]+)$/);
  if (workspacePresetMatch && method === "GET") {
    return { kind: "getWorkspacePreset", params: { presetId: decodePathParam(workspacePresetMatch[1], "presetId") } };
  }
  if (workspacePresetMatch && method === "PATCH") {
    return { kind: "updateWorkspacePreset", params: { presetId: decodePathParam(workspacePresetMatch[1], "presetId") } };
  }
  if (workspacePresetMatch && method === "DELETE") {
    return { kind: "deleteWorkspacePreset", params: { presetId: decodePathParam(workspacePresetMatch[1], "presetId") } };
  }

  const sshTrustEntryMatch = pathname.match(/^\/api\/v1\/ssh-trust-entries\/([^/]+)$/);
  if (sshTrustEntryMatch && method === "DELETE") {
    return {
      kind: "deleteSshTrustEntry",
      params: { entryId: decodePathParam(sshTrustEntryMatch[1], "entryId") }
    };
  }

  const getSessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
  if (getSessionMatch && method === "GET") {
    return { kind: "getSession", params: { sessionId: getSessionMatch[1] } };
  }
  if (getSessionMatch && method === "PATCH") {
    return { kind: "updateSession", params: { sessionId: getSessionMatch[1] } };
  }
  if (getSessionMatch && method === "DELETE") {
    return { kind: "deleteSession", params: { sessionId: getSessionMatch[1] } };
  }

  const inputMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/input$/);
  if (inputMatch && method === "POST") {
    return { kind: "input", params: { sessionId: inputMatch[1] } };
  }

  const swapQuickIdMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/swap-quick-id$/);
  if (swapQuickIdMatch && method === "POST") {
    return { kind: "swapSessionQuickId", params: { sessionId: swapQuickIdMatch[1] } };
  }

  const replayExportMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/replay-export$/);
  if (replayExportMatch && method === "GET") {
    return { kind: "getSessionReplayExport", params: { sessionId: replayExportMatch[1] } };
  }

  const resizeMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/resize$/);
  if (resizeMatch && method === "POST") {
    return { kind: "resize", params: { sessionId: resizeMatch[1] } };
  }

  const restartMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/restart$/);
  if (restartMatch && method === "POST") {
    return { kind: "restart", params: { sessionId: restartMatch[1] } };
  }

  const interruptMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/interrupt$/);
  if (interruptMatch && method === "POST") {
    return { kind: "interrupt", params: { sessionId: interruptMatch[1] } };
  }

  const terminateMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/terminate$/);
  if (terminateMatch && method === "POST") {
    return { kind: "terminate", params: { sessionId: terminateMatch[1] } };
  }

  const killMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/kill$/);
  if (killMatch && method === "POST") {
    return { kind: "kill", params: { sessionId: killMatch[1] } };
  }

  return { kind: "notFound" };
}

function normalizeMetricsPath(pathname) {
  if (/^\/api\/v1\/decks\/[^/]+\/sessions\/[^/]+:move$/.test(pathname)) {
    return "/api/v1/decks/{deckId}/sessions/{sessionId}:move";
  }
  if (/^\/api\/v1\/decks\/[^/]+$/.test(pathname)) {
    return "/api/v1/decks/{deckId}";
  }
  if (/^\/api\/v1\/layout-profiles\/[^/]+$/.test(pathname)) {
    return "/api/v1/layout-profiles/{profileId}";
  }
  if (/^\/api\/v1\/workspace-presets\/[^/]+$/.test(pathname)) {
    return "/api/v1/workspace-presets/{presetId}";
  }
  if (/^\/api\/v1\/custom-commands\/[^/]+$/.test(pathname)) {
    return "/api/v1/custom-commands/{commandName}";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/input$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/input";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/swap-quick-id$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/swap-quick-id";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/replay-export$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/replay-export";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/resize$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/resize";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/restart$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/restart";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/interrupt$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/interrupt";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/terminate$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/terminate";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/kill$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}/kill";
  }
  if (/^\/api\/v1\/sessions\/[^/]+$/.test(pathname)) {
    return "/api/v1/sessions/{sessionId}";
  }
  return pathname;
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

function normalizeCustomCommandName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeCustomCommandKind(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CUSTOM_COMMAND_KIND_VALUES.has(normalized) ? normalized : "plain";
}

function normalizeCustomCommandScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CUSTOM_COMMAND_SCOPE_VALUES.has(normalized) ? normalized : DEFAULT_CUSTOM_COMMAND_SCOPE;
}

function getCustomCommandPrecedence(scope) {
  return CUSTOM_COMMAND_SCOPE_PRECEDENCE[scope] || CUSTOM_COMMAND_SCOPE_PRECEDENCE[DEFAULT_CUSTOM_COMMAND_SCOPE];
}

function normalizeCustomCommandSessionId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildCustomCommandKey(name, scope, sessionId) {
  const normalizedName = normalizeCustomCommandName(name);
  const normalizedScope = normalizeCustomCommandScope(scope);
  const normalizedSessionId = normalizedScope === "session" ? normalizeCustomCommandSessionId(sessionId) : "";
  return `${normalizedScope}:${normalizedSessionId}:${normalizedName}`;
}

function collectCustomCommandTemplateTokens(content, { strict = true, fieldPath = "content" } = {}) {
  const text = typeof content === "string" ? content : "";
  const tokens = [];
  let invalid = false;
  const remainder = text.replaceAll(/{{[\s\S]*?}}/g, (wrapper) => {
    const match = /^{{\s*(param|var)\s*:\s*([A-Za-z0-9_.-]+)\s*}}$/.exec(wrapper);
    if (!match) {
      invalid = true;
      return "";
    }
    const type = match[1];
    const name = String(match[2] || "").trim().toLowerCase();
    if (type === "param") {
      if (!CUSTOM_COMMAND_TEMPLATE_PARAM_NAME_PATTERN.test(name)) {
        invalid = true;
        return "";
      }
    } else if (!CUSTOM_COMMAND_TEMPLATE_VARIABLE_VALUES.has(name)) {
      invalid = true;
      return "";
    }
    tokens.push({ type, name });
    return "";
  });

  if (invalid || remainder.includes("{{") || remainder.includes("}}")) {
    if (strict) {
      throw new ApiError(
        400,
        "CustomCommandTemplateInvalid",
        `Field '${fieldPath}' contains an invalid template placeholder. Use '{{param:name}}' or '{{var:session.id}}'.`
      );
    }
    return null;
  }

  return tokens;
}

function normalizeCustomCommandTemplateVariables(values, { strict = true, fieldPath = "templateVariables" } = {}) {
  if (values === undefined) {
    return [];
  }
  if (!Array.isArray(values)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be an array of allowed template-variable names.`);
    }
    return [];
  }
  const normalized = [];
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = String(values[index] || "").trim().toLowerCase();
    if (!CUSTOM_COMMAND_TEMPLATE_VARIABLE_VALUES.has(value)) {
      if (strict) {
        throw new ApiError(
          400,
          "ValidationError",
          `Field '${fieldPath}[${index}]' must be one of: ${Array.from(CUSTOM_COMMAND_TEMPLATE_VARIABLE_VALUES).join(", ")}.`
        );
      }
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized.sort((left, right) => left.localeCompare(right, CUSTOM_COMMAND_NAME_LOCALE));
}

function buildCustomCommandEntry(name, source, options = {}) {
  const strict = options.strict !== false;
  const fieldPathPrefix = options.fieldPathPrefix || "body";
  const normalizedName = normalizeCustomCommandName(name ?? source?.name);
  if (!normalizedName) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Custom command name must be a non-empty string.");
    }
    return null;
  }
  if (!source || typeof source !== "object" || Array.isArray(source) || typeof source.content !== "string") {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPathPrefix}.content' must be a string.`);
    }
    return null;
  }

  const content = source.content;
  const kind = normalizeCustomCommandKind(source.kind);
  const scope = normalizeCustomCommandScope(source.scope);
  const normalizedSessionId = normalizeCustomCommandSessionId(source.sessionId);
  if (scope === "session" && !normalizedSessionId) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field '${fieldPathPrefix}.sessionId' must be a non-empty string when '${fieldPathPrefix}.scope' is 'session'.`
      );
    }
    return null;
  }
  if (scope !== "session" && normalizedSessionId) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field '${fieldPathPrefix}.sessionId' is only allowed when '${fieldPathPrefix}.scope' is 'session'.`
      );
    }
    return null;
  }
  const templateVariables = normalizeCustomCommandTemplateVariables(source.templateVariables, {
    strict,
    fieldPath: `${fieldPathPrefix}.templateVariables`
  });

  if (kind === "plain") {
    if (templateVariables.length > 0) {
      if (strict) {
        throw new ApiError(
          400,
          "CustomCommandTemplateVariablesNotAllowed",
          "Plain custom commands cannot define templateVariables. Set kind='template' first."
        );
      }
      return null;
    }
  } else {
    const tokens = collectCustomCommandTemplateTokens(content, { strict, fieldPath: `${fieldPathPrefix}.content` });
    if (!tokens) {
      return null;
    }
    if (tokens.length === 0) {
      if (strict) {
        throw new ApiError(
          400,
          "CustomCommandTemplateEmpty",
          "Template custom commands must contain at least one '{{param:name}}' or '{{var:...}}' placeholder."
        );
      }
      return null;
    }
    const unresolvedTemplateVariables = Array.from(
      new Set(tokens.filter((token) => token.type === "var").map((token) => token.name))
    ).filter((nameValue) => !templateVariables.includes(nameValue));
    if (unresolvedTemplateVariables.length > 0) {
      if (strict) {
        throw new ApiError(
          400,
          "CustomCommandTemplateVariableNotAllowed",
          `Template custom command uses unallowed built-in variable(s): ${unresolvedTemplateVariables.join(", ")}.`
        );
      }
      return null;
    }
  }

  const now = Date.now();
  return {
    name: normalizedName,
    content,
    kind,
    scope,
    sessionId: scope === "session" ? normalizedSessionId : null,
    precedence: getCustomCommandPrecedence(scope),
    templateVariables,
    createdAt:
      Number.isInteger(source.createdAt) && source.createdAt > 0
        ? source.createdAt
        : options.currentEntry?.createdAt || now,
    updatedAt:
      Number.isInteger(source.updatedAt) && source.updatedAt > 0
        ? source.updatedAt
        : now
  };
}

function compareCustomCommandEntries(a, b) {
  const nameCompare = a.name.localeCompare(b.name, CUSTOM_COMMAND_NAME_LOCALE, { sensitivity: "base" });
  if (nameCompare !== 0) {
    return nameCompare;
  }
  if (a.precedence !== b.precedence) {
    return b.precedence - a.precedence;
  }
  const scopeCompare = String(a.scope || "").localeCompare(String(b.scope || ""), CUSTOM_COMMAND_NAME_LOCALE, { sensitivity: "base" });
  if (scopeCompare !== 0) {
    return scopeCompare;
  }
  const sessionIdCompare = String(a.sessionId || "").localeCompare(String(b.sessionId || ""), CUSTOM_COMMAND_NAME_LOCALE, {
    sensitivity: "base"
  });
  if (sessionIdCompare !== 0) {
    return sessionIdCompare;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt - b.updatedAt;
  }
  return a.content.localeCompare(b.content, CUSTOM_COMMAND_NAME_LOCALE);
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
    const canonical = decoded.toString("base64").replace(/=+$/u, "");
    if (canonical !== normalized.replace(/=+$/u, "")) {
      throw new Error("mismatch");
    }
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

  return normalized.replace(/=+$/u, "");
}

function computeSshTrustFingerprintSha256(publicKey) {
  const digest = crypto.createHash("sha256").update(Buffer.from(publicKey, "base64")).digest("base64").replace(/=+$/u, "");
  return `SHA256:${digest}`;
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

function buildDefaultDeck(now = Date.now()) {
  return {
    id: DEFAULT_DECK_ID,
    name: DEFAULT_DECK_NAME,
    createdAt: now,
    updatedAt: now,
    settings: {}
  };
}

function normalizeDeckEntity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) {
    return null;
  }
  const now = Date.now();
  const createdAt = Number.isInteger(input.createdAt) ? input.createdAt : now;
  const updatedAt = Number.isInteger(input.updatedAt) ? input.updatedAt : createdAt;
  return {
    id,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : id,
    createdAt,
    updatedAt,
    settings: input.settings && typeof input.settings === "object" && !Array.isArray(input.settings) ? input.settings : {}
  };
}

function compareDeckEntries(a, b) {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.id.localeCompare(b.id, "en-US", { sensitivity: "base" });
}

function normalizeDeckName(name) {
  if (typeof name !== "string") {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a string.");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
  }
  if (trimmed.length > DECK_NAME_MAX_LENGTH) {
    throw new ApiError(400, "ValidationError", `Field 'name' exceeds maximum length (${DECK_NAME_MAX_LENGTH}).`);
  }
  return trimmed;
}

function normalizeDeckSettings(settings, { strict = true } = {}) {
  if (settings === undefined) {
    return {};
  }
  if (!isPlainObject(settings)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'settings' must be an object.");
    }
    return {};
  }
  return JSON.parse(JSON.stringify(settings));
}

function normalizeDeckIdInput(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || !DECK_ID_PATTERN.test(normalized)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'id' must match pattern ^[a-z0-9][a-z0-9-]{0,31}$."
    );
  }
  return normalized;
}

function slugifyDeckId(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const root = base || "deck";
  const maxLength = 32;
  return root.slice(0, maxLength).replace(/-+$/g, "") || "deck";
}

function normalizeConnectionProfileName(name) {
  if (typeof name !== "string") {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a string.");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
  }
  if (trimmed.length > CONNECTION_PROFILE_NAME_MAX_LENGTH) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'name' exceeds maximum length (${CONNECTION_PROFILE_NAME_MAX_LENGTH}).`
    );
  }
  return trimmed;
}

function normalizeConnectionProfileIdInput(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || !CONNECTION_PROFILE_ID_PATTERN.test(normalized)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'id' must match pattern ^[a-z0-9][a-z0-9-]{0,31}$."
    );
  }
  return normalized;
}

function slugifyConnectionProfileId(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const root = base || "profile";
  const maxLength = 32;
  return root.slice(0, maxLength).replace(/-+$/g, "") || "profile";
}

function normalizeLayoutProfileName(name) {
  if (typeof name !== "string") {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a string.");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
  }
  if (trimmed.length > LAYOUT_PROFILE_NAME_MAX_LENGTH) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'name' exceeds maximum length (${LAYOUT_PROFILE_NAME_MAX_LENGTH}).`
    );
  }
  return trimmed;
}

function normalizeLayoutProfileIdInput(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || !LAYOUT_PROFILE_ID_PATTERN.test(normalized)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'id' must match pattern ^[a-z0-9][a-z0-9-]{0,31}$."
    );
  }
  return normalized;
}

function slugifyLayoutProfileId(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const root = base || "layout";
  const maxLength = 32;
  return root.slice(0, maxLength).replace(/-+$/g, "") || "layout";
}

function normalizeConnectionProfileDeckId(value, { strict = true, hasKnownDeck = () => true } = {}) {
  let normalizedId = DEFAULT_DECK_ID;
  try {
    normalizedId = value === undefined ? DEFAULT_DECK_ID : normalizeDeckIdInput(value) || DEFAULT_DECK_ID;
  } catch (error) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'launch.deckId' must be a valid deck id.");
    }
    normalizedId = DEFAULT_DECK_ID;
  }
  if (!hasKnownDeck(normalizedId)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Deck '${normalizedId}' was not found for connection profile launch.`);
    }
    return DEFAULT_DECK_ID;
  }
  return normalizedId;
}

function normalizeConnectionProfileLaunch(
  input,
  {
    strict = true,
    defaultShell = "",
    defaultLocalStartCwd = homedir(),
    hasKnownDeck = () => true
  } = {}
) {
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'launch' must be an object.");
    }
    input = {};
  }
  const kind = normalizeSessionKind(input.kind, { strict });
  const startupConfig = normalizeSessionStartupConfig(
    {
      startCwd: input.startCwd !== undefined ? input.startCwd : input.cwd,
      startCommand: input.startCommand,
      env: input.env,
      fallbackCwd: kind === SESSION_KIND_SSH ? "~" : defaultLocalStartCwd
    },
    { strict }
  );
  const remoteConnection = normalizeSessionRemoteConnection(input.remoteConnection, kind, { strict });
  const remoteAuth = normalizeSessionRemoteAuth(input.remoteAuth, kind, { strict });
  const themeSlots = normalizeSessionThemeSlots(input, { strict });
  const tags = normalizeSessionTags(input.tags, { strict });
  const deckId = normalizeConnectionProfileDeckId(input.deckId, { strict, hasKnownDeck });
  let shell = "";
  if (input.shell !== undefined && input.shell !== null && typeof input.shell !== "string") {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'launch.shell' must be a string.");
    }
    shell = kind === SESSION_KIND_SSH ? DEFAULT_SSH_CLIENT : defaultShell;
  } else {
    shell = typeof input.shell === "string" && input.shell.trim()
      ? input.shell.trim()
      : kind === SESSION_KIND_SSH
        ? DEFAULT_SSH_CLIENT
        : defaultShell;
  }

  return {
    kind,
    deckId,
    shell,
    startCwd: startupConfig.startCwd,
    startCommand: startupConfig.startCommand,
    env: startupConfig.env,
    tags,
    themeProfile: themeSlots.themeProfile,
    activeThemeProfile: themeSlots.activeThemeProfile,
    inactiveThemeProfile: themeSlots.inactiveThemeProfile,
    ...(remoteConnection ? { remoteConnection } : {}),
    ...(remoteAuth ? { remoteAuth } : {})
  };
}

function normalizeConnectionProfileEntity(
  input,
  {
    strict = true,
    defaultShell = "",
    defaultLocalStartCwd = homedir(),
    hasKnownDeck = () => true
  } = {}
) {
  if (!isPlainObject(input)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Body must be an object.");
    }
    return null;
  }
  const name = strict
    ? normalizeConnectionProfileName(input.name)
    : typeof input.name === "string" && input.name.trim()
      ? input.name.trim().slice(0, CONNECTION_PROFILE_NAME_MAX_LENGTH)
      : "";
  if (!name) {
    return null;
  }
  let id = "";
  try {
    id = normalizeConnectionProfileIdInput(input.id);
  } catch (error) {
    if (strict) {
      throw error;
    }
  }
  const now = Date.now();
  const createdAt = Number.isInteger(input.createdAt) ? input.createdAt : now;
  const updatedAt = Number.isInteger(input.updatedAt) ? input.updatedAt : createdAt;
  const launchSource = isPlainObject(input.launch) ? input.launch : input;
  const launch = normalizeConnectionProfileLaunch(launchSource, {
    strict,
    defaultShell,
    defaultLocalStartCwd,
    hasKnownDeck
  });
  return {
    id,
    name,
    createdAt,
    updatedAt,
    launch
  };
}

function compareConnectionProfileEntries(a, b) {
  const nameCompare = a.name.localeCompare(b.name, "en-US", { sensitivity: "base" });
  if (nameCompare !== 0) {
    return nameCompare;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.id.localeCompare(b.id, "en-US", { sensitivity: "base" });
}

function normalizeWorkspacePresetName(name) {
  if (typeof name !== "string") {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a string.");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ApiError(400, "ValidationError", "Field 'name' must be a non-empty string.");
  }
  if (trimmed.length > WORKSPACE_PRESET_NAME_MAX_LENGTH) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'name' exceeds maximum length (${WORKSPACE_PRESET_NAME_MAX_LENGTH}).`
    );
  }
  return trimmed;
}

function normalizeWorkspacePresetIdInput(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || !WORKSPACE_PRESET_ID_PATTERN.test(normalized)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'id' must match pattern ^[a-z0-9][a-z0-9-]{0,31}$."
    );
  }
  return normalized;
}

function slugifyWorkspacePresetId(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const root = base || "workspace";
  const maxLength = 32;
  return root.slice(0, maxLength).replace(/-+$/g, "") || "workspace";
}

function normalizeWorkspaceGroupName(name) {
  if (typeof name !== "string") {
    throw new ApiError(400, "ValidationError", "Field 'workspace.deckGroups.*.groups.*.name' must be a string.");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'workspace.deckGroups.*.groups.*.name' must be a non-empty string."
    );
  }
  if (trimmed.length > WORKSPACE_GROUP_NAME_MAX_LENGTH) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'workspace.deckGroups.*.groups.*.name' exceeds maximum length (${WORKSPACE_GROUP_NAME_MAX_LENGTH}).`
    );
  }
  return trimmed;
}

function normalizeWorkspaceGroupIdInput(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || !WORKSPACE_GROUP_ID_PATTERN.test(normalized)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'workspace.deckGroups.*.groups.*.id' must match pattern ^[a-z0-9][a-z0-9-]{0,31}$."
    );
  }
  return normalized;
}

function slugifyWorkspaceGroupId(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const root = base || "group";
  const maxLength = 32;
  return root.slice(0, maxLength).replace(/-+$/g, "") || "group";
}

function normalizeSplitLayoutPaneIdInput(value, fieldPath, { strict = true } = {}) {
  if (value === undefined || value === null) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be a string.`);
    }
    return "";
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || !SPLIT_LAYOUT_PANE_ID_PATTERN.test(normalized)) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field '${fieldPath}' must match pattern ^[a-z0-9][a-z0-9_-]{0,31}$.`
      );
    }
    return "";
  }
  return normalized;
}

function buildDefaultDeckSplitLayout() {
  return {
    root: {
      type: "pane",
      paneId: DEFAULT_SPLIT_LAYOUT_PANE_ID
    },
    paneSessions: {
      [DEFAULT_SPLIT_LAYOUT_PANE_ID]: []
    }
  };
}

function normalizeSplitLayoutWeights(rawWeights, childCount, { strict = true, fieldPath = "layout.deckSplitLayouts.*.root.weights" } = {}) {
  if (rawWeights === undefined) {
    return Array.from({ length: childCount }, () => Number((1 / childCount).toFixed(6)));
  }
  if (!Array.isArray(rawWeights)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be an array of positive numbers.`);
    }
    return Array.from({ length: childCount }, () => Number((1 / childCount).toFixed(6)));
  }
  if (rawWeights.length !== childCount) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field '${fieldPath}' must contain exactly ${childCount} weight entries for the split-layout children.`
      );
    }
    return Array.from({ length: childCount }, () => Number((1 / childCount).toFixed(6)));
  }

  const parsed = [];
  for (let index = 0; index < rawWeights.length; index += 1) {
    const weight = Number(rawWeights[index]);
    if (!Number.isFinite(weight) || weight <= 0) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field '${fieldPath}[${index}]' must be a positive number.`);
      }
      return Array.from({ length: childCount }, () => Number((1 / childCount).toFixed(6)));
    }
    parsed.push(weight);
  }

  const total = parsed.reduce((sum, entry) => sum + entry, 0);
  if (!(total > 0)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must sum to a positive value.`);
    }
    return Array.from({ length: childCount }, () => Number((1 / childCount).toFixed(6)));
  }

  const normalized = [];
  let consumed = 0;
  for (let index = 0; index < parsed.length; index += 1) {
    if (index === parsed.length - 1) {
      normalized.push(Number((1 - consumed).toFixed(6)));
      continue;
    }
    const value = Number((parsed[index] / total).toFixed(6));
    normalized.push(value);
    consumed += value;
  }
  return normalized;
}

function normalizeSplitLayoutNode(node, { strict = true, fieldPath = "layout.deckSplitLayouts.*.root", seenPaneIds = new Set() } = {}) {
  if (!isPlainObject(node)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be an object.`);
    }
    return null;
  }

  const type = String(node.type || "").trim().toLowerCase();
  if (type === "pane") {
    const paneId = normalizeSplitLayoutPaneIdInput(node.paneId, `${fieldPath}.paneId`, { strict });
    if (!paneId) {
      return null;
    }
    if (seenPaneIds.has(paneId)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field '${fieldPath}.paneId' must be unique within a split layout tree.`);
      }
      return null;
    }
    seenPaneIds.add(paneId);
    return {
      type: "pane",
      paneId
    };
  }

  if (type !== "row" && type !== "column") {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}.type' must be one of row, column, or pane.`);
    }
    return null;
  }

  if (!Array.isArray(node.children)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}.children' must be an array.`);
    }
    return null;
  }

  const children = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const normalizedChild = normalizeSplitLayoutNode(node.children[index], {
      strict,
      fieldPath: `${fieldPath}.children[${index}]`,
      seenPaneIds
    });
    if (normalizedChild) {
      children.push(normalizedChild);
    }
  }

  if (children.length < 2) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}.children' must contain at least two valid child nodes.`);
    }
    return children[0] || null;
  }

  const weights = normalizeSplitLayoutWeights(node.weights, children.length, {
    strict,
    fieldPath: `${fieldPath}.weights`
  });

  return {
    type,
    children,
    weights
  };
}

function normalizeSplitLayoutPaneSessions(
  paneSessions,
  deckId,
  paneIds,
  {
    strict = true,
    fieldPath = "layout.deckSplitLayouts.*.paneSessions",
    hasKnownSession = null,
    resolveSessionDeckId = null
  } = {}
) {
  const next = Object.fromEntries(Array.from(paneIds, (paneId) => [paneId, []]));
  if (paneSessions === undefined) {
    return next;
  }
  if (!isPlainObject(paneSessions)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be an object.`);
    }
    return next;
  }

  const seenSessionIds = new Set();
  for (const [rawPaneId, rawSessionIds] of Object.entries(paneSessions)) {
    const paneId = normalizeSplitLayoutPaneIdInput(rawPaneId, fieldPath, { strict: false });
    if (!paneId || !paneIds.has(paneId)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field '${fieldPath}' contains an unknown pane id '${rawPaneId}'.`);
      }
      continue;
    }
    if (!Array.isArray(rawSessionIds)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field '${fieldPath}.${paneId}' must be an array of session ids.`);
      }
      continue;
    }

    const normalizedSessionIds = [];
    const seenInPane = new Set();
    for (const rawSessionId of rawSessionIds) {
      if (typeof rawSessionId !== "string") {
        if (strict) {
          throw new ApiError(400, "ValidationError", `Field '${fieldPath}.${paneId}' must contain only strings.`);
        }
        continue;
      }
      const sessionId = rawSessionId.trim();
      if (!sessionId || seenInPane.has(sessionId)) {
        continue;
      }
      if (seenSessionIds.has(sessionId)) {
        if (strict) {
          throw new ApiError(
            400,
            "ValidationError",
            `Session '${sessionId}' cannot be assigned to multiple panes in deck '${deckId}'.`
          );
        }
        continue;
      }
      if (typeof hasKnownSession === "function" && typeof resolveSessionDeckId === "function") {
        const exists = hasKnownSession(sessionId);
        const matchesDeck = exists && resolveSessionDeckId(sessionId) === deckId;
        if (!exists || !matchesDeck) {
          if (strict) {
            throw new ApiError(
              400,
              "ValidationError",
              `Session '${sessionId}' is not available in deck '${deckId}' for split-layout pane assignment.`
            );
          }
          continue;
        }
      }
      seenInPane.add(sessionId);
      seenSessionIds.add(sessionId);
      normalizedSessionIds.push(sessionId);
    }
    next[paneId] = normalizedSessionIds;
  }

  return next;
}

function normalizeDeckSplitLayoutEntry(
  entry,
  deckId,
  {
    strict = true,
    fieldPath = "layout.deckSplitLayouts.*",
    hasKnownSession = null,
    resolveSessionDeckId = null
  } = {}
) {
  if (!isPlainObject(entry)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be an object.`);
    }
    return buildDefaultDeckSplitLayout();
  }

  const seenPaneIds = new Set();
  const normalizedRoot = normalizeSplitLayoutNode(entry.root, {
    strict,
    fieldPath: `${fieldPath}.root`,
    seenPaneIds
  });

  const fallback = buildDefaultDeckSplitLayout();
  const root = normalizedRoot || fallback.root;
  const paneIds = normalizedRoot ? seenPaneIds : new Set([DEFAULT_SPLIT_LAYOUT_PANE_ID]);
  const paneSessions = normalizeSplitLayoutPaneSessions(entry.paneSessions, deckId, paneIds, {
    strict,
    fieldPath: `${fieldPath}.paneSessions`,
    hasKnownSession,
    resolveSessionDeckId
  });

  return {
    root,
    paneSessions
  };
}

function normalizeDeckSplitLayoutMap(
  value,
  {
    strict = true,
    fieldPath = "layout.deckSplitLayouts",
    allowUnknownDeckIds = true,
    hasKnownDeck = null,
    hasKnownSession = null,
    resolveSessionDeckId = null
  } = {}
) {
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be an object.`);
    }
    return {};
  }

  const next = {};
  for (const [rawDeckId, rawEntry] of Object.entries(value)) {
    let deckId = "";
    try {
      deckId = normalizeDeckIdInput(rawDeckId);
    } catch (error) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Field '${fieldPath}' contains an invalid deck id.`);
      }
      continue;
    }
    if (!allowUnknownDeckIds && typeof hasKnownDeck === "function" && !hasKnownDeck(deckId)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Deck '${deckId}' was not found for split-layout state.`);
      }
      continue;
    }
    next[deckId] = normalizeDeckSplitLayoutEntry(rawEntry, deckId, {
      strict,
      fieldPath: `${fieldPath}.${deckId}`,
      hasKnownSession,
      resolveSessionDeckId
    });
  }
  return next;
}

function normalizeLayoutProfileSessionFilterText(value, { strict = true } = {}) {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string") {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'layout.sessionFilterText' must be a string.");
    }
    return "";
  }
  const normalized = value.trim();
  if (normalized.length > LAYOUT_PROFILE_FILTER_MAX_LENGTH) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'layout.sessionFilterText' exceeds maximum length (${LAYOUT_PROFILE_FILTER_MAX_LENGTH}).`
      );
    }
    return normalized.slice(0, LAYOUT_PROFILE_FILTER_MAX_LENGTH);
  }
  return normalized;
}

function normalizeLayoutProfileDeckTerminalSettingsEntry(value, { strict = true } = {}) {
  if (!isPlainObject(value)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Each 'layout.deckTerminalSettings' entry must be an object.");
    }
    return null;
  }
  const cols = Number.parseInt(String(value.cols ?? ""), 10);
  const rows = Number.parseInt(String(value.rows ?? ""), 10);
  if (!Number.isInteger(cols) || cols < 20 || cols > 400) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Each 'layout.deckTerminalSettings.*.cols' must be an integer between 20 and 400.");
    }
    return null;
  }
  if (!Number.isInteger(rows) || rows < 5 || rows > 120) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Each 'layout.deckTerminalSettings.*.rows' must be an integer between 5 and 120.");
    }
    return null;
  }
  return { cols, rows };
}

function normalizeControlPanePosition(value, fieldPath, { strict = true } = {}) {
  if (value === undefined) {
    return CONTROL_PANE_DEFAULT_POSITION;
  }
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (CONTROL_PANE_POSITION_VALUES.has(normalized)) {
    return normalized;
  }
  if (strict) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field '${fieldPath}' must be one of: ${Array.from(CONTROL_PANE_POSITION_VALUES).join(", ")}.`
    );
  }
  return CONTROL_PANE_DEFAULT_POSITION;
}

function normalizeControlPaneSize(value, fieldPath, { strict = true } = {}) {
  if (value === undefined) {
    return CONTROL_PANE_DEFAULT_SIZE;
  }
  const normalized = Number.parseInt(String(value), 10);
  if (Number.isInteger(normalized) && normalized >= CONTROL_PANE_MIN_SIZE && normalized <= CONTROL_PANE_MAX_SIZE) {
    return normalized;
  }
  if (strict) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field '${fieldPath}' must be an integer between ${CONTROL_PANE_MIN_SIZE} and ${CONTROL_PANE_MAX_SIZE}.`
    );
  }
  return CONTROL_PANE_DEFAULT_SIZE;
}

function normalizeControlPaneState(value, { strict = true, fieldPathPrefix = "layout" } = {}) {
  if (value !== undefined && !isPlainObject(value)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPathPrefix}' must be an object.`);
    }
    return {
      controlPaneVisible: true,
      controlPanePosition: CONTROL_PANE_DEFAULT_POSITION,
      controlPaneSize: CONTROL_PANE_DEFAULT_SIZE
    };
  }
  const source = isPlainObject(value) ? value : {};
  return {
    controlPaneVisible: source.controlPaneVisible !== false,
    controlPanePosition: normalizeControlPanePosition(source.controlPanePosition, `${fieldPathPrefix}.controlPanePosition`, { strict }),
    controlPaneSize: normalizeControlPaneSize(source.controlPaneSize, `${fieldPathPrefix}.controlPaneSize`, { strict })
  };
}

function normalizeLayoutProfileLayout(
  layout,
  {
    strict = true,
    hasKnownSession = null,
    resolveSessionDeckId = null
  } = {}
) {
  if (layout === undefined) {
    return {
      activeDeckId: DEFAULT_DECK_ID,
      sidebarVisible: true,
      sessionFilterText: "",
      ...normalizeControlPaneState(undefined, { strict: false, fieldPathPrefix: "layout" }),
      deckTerminalSettings: {},
      deckSplitLayouts: {}
    };
  }
  if (!isPlainObject(layout)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'layout' must be an object.");
    }
    return {
      activeDeckId: DEFAULT_DECK_ID,
      sidebarVisible: true,
      sessionFilterText: "",
      ...normalizeControlPaneState(undefined, { strict: false, fieldPathPrefix: "layout" }),
      deckTerminalSettings: {},
      deckSplitLayouts: {}
    };
  }

  let activeDeckId = DEFAULT_DECK_ID;
  try {
    activeDeckId =
      layout.activeDeckId === undefined ? DEFAULT_DECK_ID : normalizeDeckIdInput(layout.activeDeckId) || DEFAULT_DECK_ID;
  } catch (error) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'layout.activeDeckId' must be a valid deck id.");
    }
  }

  const sidebarVisible = layout.sidebarVisible !== false;
  const sessionFilterText = normalizeLayoutProfileSessionFilterText(layout.sessionFilterText, { strict });
  const controlPaneState = normalizeControlPaneState(layout, { strict, fieldPathPrefix: "layout" });
  const nextDeckTerminalSettings = {};
  if (layout.deckTerminalSettings !== undefined) {
    if (!isPlainObject(layout.deckTerminalSettings)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'layout.deckTerminalSettings' must be an object.");
      }
    } else {
      for (const [rawDeckId, rawSettings] of Object.entries(layout.deckTerminalSettings)) {
        let deckId = "";
        try {
          deckId = normalizeDeckIdInput(rawDeckId);
        } catch (error) {
          if (strict) {
            throw new ApiError(400, "ValidationError", "Field 'layout.deckTerminalSettings' contains an invalid deck id.");
          }
          continue;
        }
        const settings = normalizeLayoutProfileDeckTerminalSettingsEntry(rawSettings, { strict });
        if (!settings) {
          continue;
        }
        nextDeckTerminalSettings[deckId] = settings;
      }
    }
  }

  const deckSplitLayouts = normalizeDeckSplitLayoutMap(layout.deckSplitLayouts, {
    strict,
    fieldPath: "layout.deckSplitLayouts",
    allowUnknownDeckIds: true,
    hasKnownSession,
    resolveSessionDeckId
  });

  return {
    activeDeckId,
    sidebarVisible,
    sessionFilterText,
    ...controlPaneState,
    deckTerminalSettings: nextDeckTerminalSettings,
    deckSplitLayouts
  };
}

function normalizeLayoutProfileEntity(
  input,
  {
    strict = true,
    hasKnownSession = null,
    resolveSessionDeckId = null
  } = {}
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id || !LAYOUT_PROFILE_ID_PATTERN.test(id)) {
    return null;
  }
  const now = Date.now();
  const createdAt = Number.isInteger(input.createdAt) ? input.createdAt : now;
  const updatedAt = Number.isInteger(input.updatedAt) ? input.updatedAt : createdAt;
  return {
    id,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : id,
    createdAt,
    updatedAt,
    layout: normalizeLayoutProfileLayout(input.layout, { strict, hasKnownSession, resolveSessionDeckId })
  };
}

function compareLayoutProfileEntries(a, b) {
  const nameCompare = a.name.localeCompare(b.name, "en-US", { sensitivity: "base" });
  if (nameCompare !== 0) {
    return nameCompare;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.id.localeCompare(b.id, "en-US", { sensitivity: "base" });
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
  const sshKnownHostsPath = join(dirname(config.dataPath), "ssh_known_hosts");
  const sessionReplayPersistMaxChars =
    Number.isInteger(config.sessionReplayPersistMaxChars) && config.sessionReplayPersistMaxChars >= 0
      ? config.sessionReplayPersistMaxChars
      : 0;
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
    sshKnownHostsPath
  });
  const persistence = new JsonPersistence(config.dataPath, {
    encryptionProvider: config.dataEncryptionProvider || null
  });
  const createSessionRateLimiter = new FixedWindowRateLimiter({ windowMs: config.rateLimitWindowMs });
  const wsConnectRateLimiter = new FixedWindowRateLimiter({ windowMs: config.rateLimitWindowMs });
  const wsServer = new WebSocketServer({
    noServer: true,
    handleProtocols(protocols) {
      return protocols.has("ptydeck.v1") ? "ptydeck.v1" : false;
    }
  });
  const wsTickets = new Map();
  const sockets = new Set();
  const customCommands = new Map();
  const unrestoredSessions = new Map();
  let persistedReplayOutputs = new Map();
  const decks = new Map();
  const connectionProfiles = new Map();
  const layoutProfiles = new Map();
  const workspacePresets = new Map();
  const sshTrustEntries = new Map();
  const sessionDeckAssignments = new Map();
  const sessionQuickIdAssignments = new Map();
  const sessionQuickIdRank = new Map(SESSION_QUICK_ID_POOL.map((token, index) => [token, index]));
  const metrics = {
    httpRequestsTotal: 0,
    httpErrorsTotal: 0,
    httpDurationMsSum: 0,
    httpDurationMsCount: 0,
    sessionsCreatedTotal: 0,
    sessionsStartedTotal: 0,
    sessionsExitedTotal: 0,
    sessionsUnrestoredTotal: 0,
    wsConnectionsOpenedTotal: 0,
    wsConnectionsClosedTotal: 0,
    wsReconnectsTotal: 0,
    wsErrorsTotal: 0,
    httpRequestsByStatus: new Map(),
    httpRequestsByRoute: new Map(),
    httpRequestDurationMsBuckets: new Map(),
    wsErrorsByReason: new Map(),
    wsDisconnectsByReason: new Map(),
    wsReconnectsByReason: new Map()
  };
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
  let isReady = false;
  let startupWarmupEnabled = false;
  let startupWarmupGateReleased = false;
  let startupWarmupQuietTimer = null;
  let startupWarmupQuietDeadlineAt = 0;
  let startupWarmupResolve = null;
  let startupWarmupReadyPromise = Promise.resolve();
  let isStopping = false;
  let isStopped = false;
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

  function logDebug(event, details = {}) {
    if (!debugLogs) {
      return;
    }
    const timestamp = new Date().toISOString();
    const line = `[ptydeck-backend][${timestamp}] ${event} ${JSON.stringify(details)}`;
    console.log(line);
    if (config.debugLogFile) {
      appendFile(config.debugLogFile, `${line}\n`).catch(() => {
        // Ignore debug log write failures.
      });
    }
  }

  function buildCorsHeaders(req) {
    const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const allowAnyOrigin = corsAllowedOrigins.includes("*");
    const allowedOrigin = resolveAllowedRequestOrigin(requestOrigin);

    const headers = {
      ...buildSecurityHeaders(),
      "content-type": "application/json",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization"
    };

    if (allowedOrigin) {
      headers["access-control-allow-origin"] = allowedOrigin;
    }
    if (!allowAnyOrigin) {
      headers.vary = "origin";
    }

    return headers;
  }

  function resolveAllowedRequestOrigin(requestOrigin) {
    const allowAnyOrigin = corsAllowedOrigins.includes("*");
    if (allowAnyOrigin) {
      return "*";
    }
    if (requestOrigin && corsAllowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }
    return "";
  }

  function buildSecurityHeaders() {
    return {
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    };
  }

  function writeJson(req, res, statusCode, body) {
    res.writeHead(statusCode, buildCorsHeaders(req));

    if (body === undefined) {
      res.end();
      return;
    }

    res.end(JSON.stringify(body));
  }

  function clearStartupWarmupQuietTimer() {
    if (!startupWarmupQuietTimer) {
      return;
    }
    clearTimeout(startupWarmupQuietTimer);
    startupWarmupQuietTimer = null;
    startupWarmupQuietDeadlineAt = 0;
  }

  function countActiveSessions() {
    let activeSessionCount = 0;
    for (const session of manager.list()) {
      if (session?.activityState === "active") {
        activeSessionCount += 1;
      }
    }
    return activeSessionCount;
  }

  function buildReadyPayload() {
    return {
      status: isReady ? "ready" : "starting",
      phase: isReady ? "ready" : startupWarmupGateReleased && startupWarmupEnabled ? "starting_sessions" : "booting",
      warmup: {
        enabled: startupWarmupEnabled,
        gateReleased: startupWarmupGateReleased,
        quietPeriodMs: startupWarmupQuietMs,
        activeSessionCount: countActiveSessions(),
        quietMsRemaining:
          startupWarmupEnabled && startupWarmupQuietDeadlineAt > 0
            ? Math.max(0, startupWarmupQuietDeadlineAt - Date.now())
            : 0
      }
    };
  }

  function markRuntimeReady() {
    if (isReady) {
      return;
    }
    clearStartupWarmupQuietTimer();
    isReady = true;
    if (typeof startupWarmupResolve === "function") {
      startupWarmupResolve();
    }
    startupWarmupResolve = null;
    logDebug("runtime.ready", {
      port: config.port,
      sessionCount: manager.list().length,
      startupWarmupEnabled,
      startupWarmupQuietMs
    });
  }

  function reconcileStartupWarmup() {
    if (isReady || isStopping) {
      clearStartupWarmupQuietTimer();
      return;
    }
    if (!startupWarmupEnabled) {
      markRuntimeReady();
      return;
    }
    if (!startupWarmupGateReleased) {
      clearStartupWarmupQuietTimer();
      return;
    }

    const activeSessionCount = countActiveSessions();
    if (activeSessionCount > 0) {
      clearStartupWarmupQuietTimer();
      logDebug("runtime.startup_warmup.active", { activeSessionCount });
      return;
    }
    if (startupWarmupQuietTimer) {
      return;
    }

    startupWarmupQuietDeadlineAt = Date.now() + startupWarmupQuietMs;
    logDebug("runtime.startup_warmup.quiet_wait", { quietMs: startupWarmupQuietMs });
    startupWarmupQuietTimer = setTimeout(() => {
      startupWarmupQuietTimer = null;
      startupWarmupQuietDeadlineAt = 0;
      if (isStopping || isReady || !startupWarmupGateReleased) {
        return;
      }
      if (countActiveSessions() > 0) {
        reconcileStartupWarmup();
        return;
      }
      markRuntimeReady();
    }, startupWarmupQuietMs);
  }

  function renderMetrics() {
    const sessionsByLifecycle = new Map();
    for (const session of manager.list()) {
      const state = typeof session.state === "string" && session.state ? session.state : "unknown";
      bumpMetricCounter(sessionsByLifecycle, state);
    }
    if (unrestoredSessions.size > 0) {
      bumpMetricCounter(sessionsByLifecycle, "unrestored", unrestoredSessions.size);
    }

    const lines = [];
    lines.push("# HELP ptydeck_http_requests_total Total number of HTTP requests.");
    lines.push("# TYPE ptydeck_http_requests_total counter");
    lines.push(`ptydeck_http_requests_total ${metrics.httpRequestsTotal}`);
    lines.push("# HELP ptydeck_http_errors_total Total number of HTTP requests with status >= 400.");
    lines.push("# TYPE ptydeck_http_errors_total counter");
    lines.push(`ptydeck_http_errors_total ${metrics.httpErrorsTotal}`);
    lines.push("# HELP ptydeck_http_request_duration_ms_sum Sum of HTTP request duration in milliseconds.");
    lines.push("# TYPE ptydeck_http_request_duration_ms_sum counter");
    lines.push(`ptydeck_http_request_duration_ms_sum ${metrics.httpDurationMsSum}`);
    lines.push("# HELP ptydeck_http_request_duration_ms_count Total number of observed HTTP request durations.");
    lines.push("# TYPE ptydeck_http_request_duration_ms_count counter");
    lines.push(`ptydeck_http_request_duration_ms_count ${metrics.httpDurationMsCount}`);
    lines.push("# HELP ptydeck_http_request_duration_ms_bucket HTTP request duration histogram buckets in milliseconds.");
    lines.push("# TYPE ptydeck_http_request_duration_ms_bucket histogram");
    for (const bucketLimitMs of HTTP_DURATION_BUCKETS_MS) {
      lines.push(
        `ptydeck_http_request_duration_ms_bucket{le="${escapePrometheusLabel(bucketLimitMs)}"} ${metrics.httpRequestDurationMsBuckets.get(bucketLimitMs) || 0}`
      );
    }
    lines.push(`ptydeck_http_request_duration_ms_bucket{le="+Inf"} ${metrics.httpDurationMsCount}`);
    lines.push("# HELP ptydeck_sessions_active Number of active PTY sessions.");
    lines.push("# TYPE ptydeck_sessions_active gauge");
    lines.push(`ptydeck_sessions_active ${manager.list().length}`);
    lines.push("# HELP ptydeck_sessions_active_by_lifecycle Number of sessions grouped by lifecycle state.");
    lines.push("# TYPE ptydeck_sessions_active_by_lifecycle gauge");
    for (const [state, count] of sessionsByLifecycle.entries()) {
      lines.push(`ptydeck_sessions_active_by_lifecycle{state="${escapePrometheusLabel(state)}"} ${count}`);
    }
    lines.push("# HELP ptydeck_sessions_created_total Total number of created sessions.");
    lines.push("# TYPE ptydeck_sessions_created_total counter");
    lines.push(`ptydeck_sessions_created_total ${metrics.sessionsCreatedTotal}`);
    lines.push("# HELP ptydeck_sessions_started_total Total number of started sessions.");
    lines.push("# TYPE ptydeck_sessions_started_total counter");
    lines.push(`ptydeck_sessions_started_total ${metrics.sessionsStartedTotal}`);
    lines.push("# HELP ptydeck_sessions_exited_total Total number of exited sessions.");
    lines.push("# TYPE ptydeck_sessions_exited_total counter");
    lines.push(`ptydeck_sessions_exited_total ${metrics.sessionsExitedTotal}`);
    lines.push("# HELP ptydeck_sessions_unrestored_total Total number of sessions marked unrestored during startup.");
    lines.push("# TYPE ptydeck_sessions_unrestored_total counter");
    lines.push(`ptydeck_sessions_unrestored_total ${metrics.sessionsUnrestoredTotal}`);
    lines.push("# HELP ptydeck_ws_connections_active Number of active WebSocket connections.");
    lines.push("# TYPE ptydeck_ws_connections_active gauge");
    lines.push(`ptydeck_ws_connections_active ${sockets.size}`);
    lines.push("# HELP ptydeck_ws_connections_opened_total Total number of accepted WebSocket connections.");
    lines.push("# TYPE ptydeck_ws_connections_opened_total counter");
    lines.push(`ptydeck_ws_connections_opened_total ${metrics.wsConnectionsOpenedTotal}`);
    lines.push("# HELP ptydeck_ws_connections_closed_total Total number of closed WebSocket connections.");
    lines.push("# TYPE ptydeck_ws_connections_closed_total counter");
    lines.push(`ptydeck_ws_connections_closed_total ${metrics.wsConnectionsClosedTotal}`);
    lines.push("# HELP ptydeck_ws_reconnects_total Total number of websocket reconnects observed per client IP.");
    lines.push("# TYPE ptydeck_ws_reconnects_total counter");
    lines.push(`ptydeck_ws_reconnects_total ${metrics.wsReconnectsTotal}`);
    lines.push("# HELP ptydeck_ws_errors_total Total number of websocket upgrade/socket errors.");
    lines.push("# TYPE ptydeck_ws_errors_total counter");
    lines.push(`ptydeck_ws_errors_total ${metrics.wsErrorsTotal}`);
    lines.push("# HELP ptydeck_ws_errors_by_reason_total Websocket errors grouped by reason.");
    lines.push("# TYPE ptydeck_ws_errors_by_reason_total counter");
    for (const [reason, count] of metrics.wsErrorsByReason.entries()) {
      lines.push(`ptydeck_ws_errors_by_reason_total{reason="${escapePrometheusLabel(reason)}"} ${count}`);
    }
    lines.push("# HELP ptydeck_ws_disconnects_by_reason_total Websocket disconnects grouped by normalized reason.");
    lines.push("# TYPE ptydeck_ws_disconnects_by_reason_total counter");
    for (const [reason, count] of metrics.wsDisconnectsByReason.entries()) {
      lines.push(`ptydeck_ws_disconnects_by_reason_total{reason="${escapePrometheusLabel(reason)}"} ${count}`);
    }
    lines.push("# HELP ptydeck_ws_reconnects_by_reason_total Websocket reconnects grouped by previous disconnect reason.");
    lines.push("# TYPE ptydeck_ws_reconnects_by_reason_total counter");
    for (const [reason, count] of metrics.wsReconnectsByReason.entries()) {
      lines.push(`ptydeck_ws_reconnects_by_reason_total{reason="${escapePrometheusLabel(reason)}"} ${count}`);
    }
    lines.push("# HELP ptydeck_http_requests_by_status_total HTTP requests grouped by status code.");
    lines.push("# TYPE ptydeck_http_requests_by_status_total counter");
    for (const [statusCode, count] of metrics.httpRequestsByStatus.entries()) {
      lines.push(`ptydeck_http_requests_by_status_total{status="${escapePrometheusLabel(statusCode)}"} ${count}`);
    }
    lines.push("# HELP ptydeck_http_requests_by_route_total HTTP requests grouped by normalized route.");
    lines.push("# TYPE ptydeck_http_requests_by_route_total counter");
    for (const [routeKey, count] of metrics.httpRequestsByRoute.entries()) {
      const [method, route] = routeKey.split(" ", 2);
      lines.push(
        `ptydeck_http_requests_by_route_total{method="${escapePrometheusLabel(method)}",route="${escapePrometheusLabel(route)}"} ${count}`
      );
    }
    return `${lines.join("\n")}\n`;
  }

  function pruneExpiredWsTickets(now = Date.now()) {
    for (const [ticket, entry] of wsTickets.entries()) {
      if (entry.expiresAt <= now) {
        wsTickets.delete(ticket);
      }
    }
  }

  function issueWsTicket(auth) {
    pruneExpiredWsTickets();
    const ticket = crypto.randomBytes(24).toString("base64url");
    wsTickets.set(ticket, {
      expiresAt: Date.now() + (authWsTicketTtlSeconds * 1000),
      auth: {
        subject: auth.subject,
        tenantId: auth.tenantId,
        scopes: Array.isArray(auth.scopes) ? auth.scopes.slice() : []
      }
    });
    return {
      ticket,
      tokenType: "WsTicket",
      expiresIn: authWsTicketTtlSeconds
    };
  }

  function recordWsError(reason) {
    metrics.wsErrorsTotal += 1;
    bumpMetricCounter(metrics.wsErrorsByReason, reason);
  }

  function recordHttpDuration(durationMs) {
    for (const bucketLimitMs of HTTP_DURATION_BUCKETS_MS) {
      if (durationMs <= bucketLimitMs) {
        bumpMetricCounter(metrics.httpRequestDurationMsBuckets, bucketLimitMs);
      }
    }
  }

  function normalizeWsDisconnectReason(code, wsReasonText, wsReasonHint) {
    if (typeof wsReasonHint === "string" && wsReasonHint) {
      return wsReasonHint;
    }
    if (code === 1000) {
      return "normal_closure";
    }
    if (code === 1001) {
      return "going_away";
    }
    if (code === 1006) {
      return "abnormal_closure";
    }
    if (code >= 4000 && code <= 4999) {
      return "app_code_4xxx";
    }
    if (code >= 3000 && code <= 3999) {
      return "library_code_3xxx";
    }
    if (typeof wsReasonText === "string" && wsReasonText.toLowerCase().includes("timeout")) {
      return "timeout";
    }
    return "other";
  }

  function consumeWsTicket(ticket) {
    pruneExpiredWsTickets();
    const normalized = typeof ticket === "string" ? ticket.trim() : "";
    if (!normalized) {
      throw new ApiError(401, "Unauthorized", "Missing WebSocket ticket.");
    }
    const entry = wsTickets.get(normalized);
    if (!entry) {
      throw new ApiError(401, "Unauthorized", "Invalid or expired WebSocket ticket.");
    }
    wsTickets.delete(normalized);
    return entry.auth;
  }

  function parseRequestedProtocols(headerValue) {
    if (typeof headerValue !== "string" || !headerValue.trim()) {
      return [];
    }
    return headerValue.split(",").map((entry) => entry.trim()).filter(Boolean);
  }

  function resolveWsTicketFromProtocols(request) {
    const protocols = parseRequestedProtocols(request.headers["sec-websocket-protocol"]);
    for (const protocol of protocols) {
      if (protocol.startsWith("ptydeck.auth.")) {
        return protocol.slice("ptydeck.auth.".length);
      }
    }
    return "";
  }

  function requiredScopeForRoute(kind) {
    if (kind === "listDecks" || kind === "getDeck") {
      return "sessions:read";
    }
    if (kind === "createDeck" || kind === "updateDeck" || kind === "deleteDeck" || kind === "moveSessionToDeck") {
      return "sessions:write";
    }
    if (kind === "listWorkspacePresets" || kind === "getWorkspacePreset") {
      return "sessions:read";
    }
    if (kind === "createWorkspacePreset" || kind === "updateWorkspacePreset" || kind === "deleteWorkspacePreset") {
      return "sessions:write";
    }
    if (kind === "listConnectionProfiles" || kind === "getConnectionProfile") {
      return "sessions:read";
    }
    if (kind === "createConnectionProfile" || kind === "updateConnectionProfile" || kind === "deleteConnectionProfile") {
      return "sessions:write";
    }
    if (kind === "listSshTrustEntries") {
      return "sessions:read";
    }
    if (kind === "createSshTrustEntry" || kind === "deleteSshTrustEntry") {
      return "sessions:write";
    }
    if (kind === "listCustomCommands" || kind === "getCustomCommand") {
      return "sessions:read";
    }
    if (kind === "upsertCustomCommand" || kind === "deleteCustomCommand") {
      return "sessions:write";
    }
    if (kind === "listSessions" || kind === "getSession") {
      return "sessions:read";
    }
    if (kind === "getSessionReplayExport") {
      return "sessions:read";
    }
    if (kind === "createSession") {
      return "sessions:create";
    }
    if (kind === "wsTicket") {
      return "ws:connect";
    }
    if (kind === "deleteSession") {
      return "sessions:delete";
    }
    if (
      kind === "updateSession" ||
      kind === "input" ||
      kind === "resize" ||
      kind === "restart" ||
      kind === "interrupt" ||
      kind === "terminate" ||
      kind === "kill"
    ) {
      return "sessions:write";
    }
    return "";
  }

  function authenticateRequest(req, parsedUrl, requiredScope) {
    if (!config.authEnabled) {
      return null;
    }
    const token = resolveBearerToken(req, parsedUrl);
    const auth = verifyDevToken(token, {
      secret: config.authDevSecret,
      issuer: config.authIssuer,
      audience: config.authAudience
    });
    ensureScope(auth, requiredScope);
    return auth;
  }

  function ensureTlsIngress(requestContext) {
    if (!config.enforceTlsIngress) {
      return;
    }
    if (requestContext.protocol !== "https") {
      throw new ApiError(426, "TlsRequired", "TLS is required for this endpoint.");
    }
  }

  function listCustomCommands({ scope = null, sessionId = null } = {}) {
    const entries = Array.from(customCommands.values());
    const filtered = scope
      ? entries.filter((entry) =>
          entry.scope === scope && (scope !== "session" || entry.sessionId === normalizeCustomCommandSessionId(sessionId))
        )
      : entries;
    return filtered.sort(compareCustomCommandEntries);
  }

  function listCustomCommandsByName(name) {
    const normalizedName = normalizeCustomCommandName(name);
    return listCustomCommands().filter((entry) => entry.name === normalizedName);
  }

  function getCustomCommandOrThrow(name, { scope = null, sessionId = null } = {}) {
    const normalizedName = normalizeCustomCommandName(name);
    if (!normalizedName) {
      throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
    }
    if (scope) {
      const entry = customCommands.get(buildCustomCommandKey(normalizedName, scope, sessionId));
      if (!entry) {
        throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
      }
      return { ...entry };
    }
    const candidates = listCustomCommandsByName(normalizedName);
    if (candidates.length === 0) {
      throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
    }
    if (candidates.length > 1) {
      throw new ApiError(
        409,
        "CustomCommandAmbiguous",
        "Multiple scoped custom commands share this name. Specify scope (and sessionId for session scope)."
      );
    }
    return { ...candidates[0] };
  }

  function upsertCustomCommand(name, payload) {
    const normalizedName = normalizeCustomCommandName(name);
    if (normalizedName.length > customCommandMaxNameLength) {
      throw new ApiError(
        400,
        "CustomCommandNameTooLong",
        `Custom command name exceeds maximum length (${customCommandMaxNameLength}).`
      );
    }
    if (!CUSTOM_COMMAND_NAME_PATTERN.test(normalizedName)) {
      throw new ApiError(
        400,
        "CustomCommandNameInvalid",
        "Custom command name must match pattern [A-Za-z0-9][A-Za-z0-9_-]*."
      );
    }
    if (CUSTOM_COMMAND_RESERVED_NAMES.has(normalizedName)) {
      throw new ApiError(409, "CustomCommandNameReserved", "Custom command name collides with a system command.");
    }
    const nextInput = {
      ...payload,
      name: normalizedName
    };
    const nextScope = normalizeCustomCommandScope(nextInput.scope);
    const nextSessionId = nextScope === "session" ? normalizeCustomCommandSessionId(nextInput.sessionId) : "";
    if (nextScope === "session") {
      ensureSessionExistsOrThrow(nextSessionId);
    }
    const current = customCommands.get(buildCustomCommandKey(normalizedName, nextScope, nextSessionId));
    const next = buildCustomCommandEntry(normalizedName, nextInput, {
      strict: true,
      fieldPathPrefix: "body",
      currentEntry: current
    });
    const existingSameName = listCustomCommandsByName(normalizedName);
    if (existingSameName.some((entry) => entry.kind !== next.kind)) {
      throw new ApiError(
        409,
        "CustomCommandKindConflict",
        "Scoped custom commands sharing the same name must use the same kind."
      );
    }
    if (next.content.length > customCommandMaxContentLength) {
      throw new ApiError(
        400,
        "CustomCommandContentTooLarge",
        `Custom command content exceeds maximum length (${customCommandMaxContentLength}).`
      );
    }
    const nextKey = buildCustomCommandKey(normalizedName, next.scope, next.sessionId);
    if (!customCommands.has(nextKey) && customCommands.size >= customCommandMaxCount) {
      throw new ApiError(
        409,
        "CustomCommandLimitExceeded",
        `Custom command limit reached (${customCommandMaxCount}).`
      );
    }
    customCommands.set(nextKey, next);
    return { ...next };
  }

  function deleteCustomCommand(name, { scope = null, sessionId = null } = {}) {
    const existing = getCustomCommandOrThrow(name, { scope, sessionId });
    const key = buildCustomCommandKey(existing.name, existing.scope, existing.sessionId);
    if (!customCommands.has(key)) {
      throw new ApiError(404, "CustomCommandNotFound", "Custom command not found.");
    }
    customCommands.delete(key);
    return { ...existing };
  }

  function hasCustomCommand(name, { scope = null, sessionId = null } = {}) {
    if (!scope) {
      return listCustomCommandsByName(name).length > 0;
    }
    return customCommands.has(buildCustomCommandKey(name, scope, sessionId));
  }

  function removeCustomCommandsForSession(sessionId) {
    const normalizedSessionId = normalizeCustomCommandSessionId(sessionId);
    if (!normalizedSessionId) {
      return [];
    }
    const deleted = [];
    for (const [key, entry] of customCommands.entries()) {
      if (entry.scope === "session" && entry.sessionId === normalizedSessionId) {
        deleted.push({ ...entry });
        customCommands.delete(key);
      }
    }
    deleted.sort(compareCustomCommandEntries);
    return deleted;
  }

  function toApiDeck(deck) {
    return {
      id: deck.id,
      name: deck.name,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      settings: deck.settings
    };
  }

  function listDecks() {
    ensureDefaultDeck();
    return Array.from(decks.values()).sort(compareDeckEntries).map(toApiDeck);
  }

  function getDeckOrThrow(deckId) {
    const deck = decks.get(deckId);
    if (!deck) {
      throw new ApiError(404, "DeckNotFound", `Deck '${deckId}' was not found.`);
    }
    return deck;
  }

  function createDeck(body) {
    const name = normalizeDeckName(body?.name);
    const requestedId = normalizeDeckIdInput(body?.id);
    let deckId = requestedId;
    if (!deckId) {
      const slug = slugifyDeckId(name);
      deckId = slug;
      let suffix = 2;
      while (decks.has(deckId)) {
        const suffixText = `-${suffix}`;
        const rootMaxLength = 32 - suffixText.length;
        const rooted = slug.slice(0, rootMaxLength).replace(/-+$/g, "") || "deck";
        deckId = `${rooted}${suffixText}`;
        suffix += 1;
      }
    }
    if (decks.has(deckId)) {
      throw new ApiError(409, "DeckAlreadyExists", `Deck '${deckId}' already exists.`);
    }
    const now = Date.now();
    const deck = {
      id: deckId,
      name,
      createdAt: now,
      updatedAt: now,
      settings: normalizeDeckSettings(body?.settings, { strict: true })
    };
    decks.set(deck.id, deck);
    return toApiDeck(deck);
  }

  function updateDeck(deckId, body) {
    const existing = getDeckOrThrow(deckId);
    const hasName = body?.name !== undefined;
    const hasSettings = body?.settings !== undefined;
    if (!hasName && !hasSettings) {
      throw new ApiError(400, "ValidationError", "At least one updatable deck field is required.");
    }
    const next = {
      ...existing,
      name: hasName ? normalizeDeckName(body.name) : existing.name,
      settings: hasSettings ? normalizeDeckSettings(body.settings, { strict: true }) : existing.settings,
      updatedAt: Date.now()
    };
    decks.set(deckId, next);
    return toApiDeck(next);
  }

  function countSessionsInDeck(deckId) {
    let count = 0;
    for (const session of manager.list()) {
      if (resolveSessionDeckId(session.id) === deckId) {
        count += 1;
      }
    }
    for (const [sessionId] of unrestoredSessions.entries()) {
      if (resolveSessionDeckId(sessionId) === deckId) {
        count += 1;
      }
    }
    return count;
  }

  function reassignDeckSessions(deckId, targetDeckId) {
    for (const session of manager.list()) {
      if (resolveSessionDeckId(session.id) === deckId) {
        sessionDeckAssignments.set(session.id, targetDeckId);
      }
    }
    for (const [sessionId] of unrestoredSessions.entries()) {
      if (resolveSessionDeckId(sessionId) === deckId) {
        sessionDeckAssignments.set(sessionId, targetDeckId);
      }
    }
  }

  function listSessionIdsInDeck(deckId) {
    const sessionIds = [];
    for (const session of manager.list()) {
      if (resolveSessionDeckId(session.id) === deckId) {
        sessionIds.push(session.id);
      }
    }
    for (const [sessionId] of unrestoredSessions.entries()) {
      if (resolveSessionDeckId(sessionId) === deckId) {
        sessionIds.push(sessionId);
      }
    }
    return sessionIds;
  }

  function deleteDeck(deckId, { force = false } = {}) {
    if (deckId === DEFAULT_DECK_ID) {
      throw new ApiError(409, "DeckDeleteForbidden", "Default deck cannot be deleted.");
    }
    getDeckOrThrow(deckId);
    const affectedSessionIds = listSessionIdsInDeck(deckId);
    if (affectedSessionIds.length > 0 && !force) {
      throw new ApiError(409, "DeckNotEmpty", "Deck is not empty. Use force=true to delete and reassign sessions.");
    }
    if (affectedSessionIds.length > 0 && force) {
      ensureDefaultDeck();
      reassignDeckSessions(deckId, DEFAULT_DECK_ID);
    }
    decks.delete(deckId);
    cleanupConnectionProfiles();
    cleanupLayoutProfiles();
    cleanupWorkspacePresets();
    return {
      deckId,
      fallbackDeckId: DEFAULT_DECK_ID,
      reassignedSessionIds: force ? affectedSessionIds : []
    };
  }

  function toApiConnectionProfile(profile) {
    return {
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      launch: JSON.parse(JSON.stringify(profile.launch))
    };
  }

  function listConnectionProfiles() {
    return Array.from(connectionProfiles.values()).sort(compareConnectionProfileEntries).map(toApiConnectionProfile);
  }

  function getConnectionProfileOrThrow(profileId) {
    const profile = connectionProfiles.get(profileId);
    if (!profile) {
      throw new ApiError(404, "ConnectionProfileNotFound", `Connection profile '${profileId}' was not found.`);
    }
    return profile;
  }

  function createConnectionProfile(body) {
    const candidate = normalizeConnectionProfileEntity(body, {
      strict: true,
      defaultShell: config.shell,
      hasKnownDeck: (deckId) => decks.has(deckId)
    });
    let profileId = candidate.id;
    if (!profileId) {
      const slug = slugifyConnectionProfileId(candidate.name);
      profileId = slug;
      let suffix = 2;
      while (connectionProfiles.has(profileId)) {
        const suffixText = `-${suffix}`;
        const rootMaxLength = 32 - suffixText.length;
        const rooted = slug.slice(0, rootMaxLength).replace(/-+$/g, "") || "profile";
        profileId = `${rooted}${suffixText}`;
        suffix += 1;
      }
    }
    if (connectionProfiles.has(profileId)) {
      throw new ApiError(409, "ConnectionProfileAlreadyExists", `Connection profile '${profileId}' already exists.`);
    }
    const profile = {
      ...candidate,
      id: profileId
    };
    connectionProfiles.set(profile.id, profile);
    return toApiConnectionProfile(profile);
  }

  function updateConnectionProfile(profileId, body) {
    const existing = getConnectionProfileOrThrow(profileId);
    const hasName = body?.name !== undefined;
    const hasLaunch = body?.launch !== undefined;
    if (!hasName && !hasLaunch) {
      throw new ApiError(400, "ValidationError", "At least one updatable connection profile field is required.");
    }
    const next = {
      ...existing,
      name: hasName ? normalizeConnectionProfileName(body.name) : existing.name,
      launch: hasLaunch
        ? normalizeConnectionProfileLaunch(body.launch, {
            strict: true,
            defaultShell: config.shell,
            hasKnownDeck: (deckId) => decks.has(deckId)
          })
        : existing.launch,
      updatedAt: Date.now()
    };
    connectionProfiles.set(profileId, next);
    return toApiConnectionProfile(next);
  }

  function deleteConnectionProfile(profileId) {
    const profile = getConnectionProfileOrThrow(profileId);
    connectionProfiles.delete(profileId);
    return toApiConnectionProfile(profile);
  }

  function cleanupConnectionProfiles() {
    let changed = false;
    for (const [profileId, profile] of connectionProfiles.entries()) {
      const nextLaunch = normalizeConnectionProfileLaunch(profile.launch, {
        strict: false,
        defaultShell: config.shell,
        hasKnownDeck: (deckId) => decks.has(deckId)
      });
      if (JSON.stringify(nextLaunch) === JSON.stringify(profile.launch)) {
        continue;
      }
      connectionProfiles.set(profileId, {
        ...profile,
        launch: nextLaunch,
        updatedAt: Date.now()
      });
      changed = true;
    }
    return changed;
  }

  function toApiLayoutProfile(profile) {
    return {
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      layout: {
        activeDeckId: profile.layout.activeDeckId,
        sidebarVisible: profile.layout.sidebarVisible,
        sessionFilterText: profile.layout.sessionFilterText,
        controlPaneVisible: profile.layout.controlPaneVisible,
        controlPanePosition: profile.layout.controlPanePosition,
        controlPaneSize: profile.layout.controlPaneSize,
        deckTerminalSettings: JSON.parse(JSON.stringify(profile.layout.deckTerminalSettings)),
        deckSplitLayouts: JSON.parse(JSON.stringify(profile.layout.deckSplitLayouts))
      }
    };
  }

  function listLayoutProfiles() {
    return Array.from(layoutProfiles.values()).sort(compareLayoutProfileEntries).map(toApiLayoutProfile);
  }

  function getLayoutProfileOrThrow(profileId) {
    const profile = layoutProfiles.get(profileId);
    if (!profile) {
      throw new ApiError(404, "LayoutProfileNotFound", `Layout profile '${profileId}' was not found.`);
    }
    return profile;
  }

  function createLayoutProfile(body) {
    const name = normalizeLayoutProfileName(body?.name);
    const requestedId = normalizeLayoutProfileIdInput(body?.id);
    let profileId = requestedId;
    if (!profileId) {
      const slug = slugifyLayoutProfileId(name);
      profileId = slug;
      let suffix = 2;
      while (layoutProfiles.has(profileId)) {
        const suffixText = `-${suffix}`;
        const rootMaxLength = 32 - suffixText.length;
        const rooted = slug.slice(0, rootMaxLength).replace(/-+$/g, "") || "layout";
        profileId = `${rooted}${suffixText}`;
        suffix += 1;
      }
    }
    if (layoutProfiles.has(profileId)) {
      throw new ApiError(409, "LayoutProfileAlreadyExists", `Layout profile '${profileId}' already exists.`);
    }
    const now = Date.now();
    const profile = {
      id: profileId,
      name,
      createdAt: now,
      updatedAt: now,
      layout: normalizeLayoutProfileLayout(body?.layout, {
        strict: true,
        hasKnownSession,
        resolveSessionDeckId
      })
    };
    layoutProfiles.set(profile.id, profile);
    return toApiLayoutProfile(profile);
  }

  function updateLayoutProfile(profileId, body) {
    const existing = getLayoutProfileOrThrow(profileId);
    const hasName = body?.name !== undefined;
    const hasLayout = body?.layout !== undefined;
    if (!hasName && !hasLayout) {
      throw new ApiError(400, "ValidationError", "At least one updatable layout profile field is required.");
    }
    const next = {
      ...existing,
      name: hasName ? normalizeLayoutProfileName(body.name) : existing.name,
      layout: hasLayout
        ? normalizeLayoutProfileLayout(body.layout, {
            strict: true,
            hasKnownSession,
            resolveSessionDeckId
          })
        : existing.layout,
      updatedAt: Date.now()
    };
    layoutProfiles.set(profileId, next);
    return toApiLayoutProfile(next);
  }

  function deleteLayoutProfile(profileId) {
    const profile = getLayoutProfileOrThrow(profileId);
    layoutProfiles.delete(profileId);
    cleanupWorkspacePresets();
    return toApiLayoutProfile(profile);
  }

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

  function normalizeWorkspacePresetLayoutProfileId(value, { strict = true } = {}) {
    if (value === undefined || value === null || String(value).trim() === "") {
      return "";
    }
    let normalizedId = "";
    try {
      normalizedId = normalizeLayoutProfileIdInput(value);
    } catch (error) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'workspace.layoutProfileId' must be a valid layout profile id.");
      }
      return "";
    }
    if (!layoutProfiles.has(normalizedId)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Layout profile '${normalizedId}' was not found.`);
      }
      return "";
    }
    return normalizedId;
  }

  function normalizeWorkspacePresetGroupSessionIds(sessionIds, deckId, { strict = true } = {}) {
    if (sessionIds === undefined) {
      return [];
    }
    if (!Array.isArray(sessionIds)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'workspace.deckGroups.*.groups.*.sessionIds' must be an array.");
      }
      return [];
    }
    const normalized = [];
    const seen = new Set();
    for (const rawSessionId of sessionIds) {
      if (typeof rawSessionId !== "string") {
        if (strict) {
          throw new ApiError(
            400,
            "ValidationError",
            "Field 'workspace.deckGroups.*.groups.*.sessionIds' must contain only strings."
          );
        }
        continue;
      }
      const sessionId = rawSessionId.trim();
      if (!sessionId || seen.has(sessionId)) {
        continue;
      }
      const exists = hasKnownSession(sessionId);
      const matchesDeck = exists && resolveSessionDeckId(sessionId) === deckId;
      if (!exists || !matchesDeck) {
        if (strict) {
          throw new ApiError(
            400,
            "ValidationError",
            `Session '${sessionId}' is not available in deck '${deckId}' for workspace group membership.`
          );
        }
        continue;
      }
      seen.add(sessionId);
      normalized.push(sessionId);
    }
    return normalized;
  }

  function normalizeWorkspacePresetDeckGroup(deckId, deckGroup, { strict = true } = {}) {
    if (!isPlainObject(deckGroup)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Each 'workspace.deckGroups' entry must be an object.");
      }
      return {
        activeGroupId: "",
        groups: []
      };
    }
    const rawGroups = deckGroup.groups === undefined ? [] : deckGroup.groups;
    if (!Array.isArray(rawGroups)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'workspace.deckGroups.*.groups' must be an array.");
      }
      return {
        activeGroupId: "",
        groups: []
      };
    }
    const groups = [];
    const seenGroupIds = new Set();
    for (const rawGroup of rawGroups) {
      if (!isPlainObject(rawGroup)) {
        if (strict) {
          throw new ApiError(400, "ValidationError", "Each workspace group must be an object.");
        }
        continue;
      }
      const name = strict ? normalizeWorkspaceGroupName(rawGroup.name) : String(rawGroup.name || rawGroup.id || "").trim();
      if (!name) {
        continue;
      }
      let groupId = "";
      try {
        groupId = normalizeWorkspaceGroupIdInput(rawGroup.id);
      } catch (error) {
        if (strict) {
          throw error;
        }
      }
      if (!groupId) {
        groupId = slugifyWorkspaceGroupId(name);
      }
      if (seenGroupIds.has(groupId)) {
        continue;
      }
      const sessionIds = normalizeWorkspacePresetGroupSessionIds(rawGroup.sessionIds, deckId, { strict });
      seenGroupIds.add(groupId);
      groups.push({
        id: groupId,
        name: strict ? name : name.slice(0, WORKSPACE_GROUP_NAME_MAX_LENGTH) || groupId,
        sessionIds
      });
    }

    let activeGroupId = "";
    if (deckGroup.activeGroupId !== undefined && deckGroup.activeGroupId !== null && String(deckGroup.activeGroupId).trim()) {
      try {
        activeGroupId = normalizeWorkspaceGroupIdInput(deckGroup.activeGroupId);
      } catch (error) {
        if (strict) {
          throw new ApiError(400, "ValidationError", "Field 'workspace.deckGroups.*.activeGroupId' must be a valid group id.");
        }
      }
      if (activeGroupId && !groups.some((group) => group.id === activeGroupId)) {
        if (strict) {
          throw new ApiError(
            400,
            "ValidationError",
            `Active workspace group '${activeGroupId}' does not exist in deck '${deckId}'.`
          );
        }
        activeGroupId = "";
      }
    }

    return {
      activeGroupId,
      groups
    };
  }

  function normalizeWorkspacePresetWorkspace(workspace, { strict = true } = {}) {
    if (workspace === undefined) {
      return {
        activeDeckId: DEFAULT_DECK_ID,
        layoutProfileId: "",
        ...normalizeControlPaneState(undefined, { strict: false, fieldPathPrefix: "workspace" }),
        deckGroups: {},
        deckSplitLayouts: {}
      };
    }
    if (!isPlainObject(workspace)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'workspace' must be an object.");
      }
      return {
        activeDeckId: DEFAULT_DECK_ID,
        layoutProfileId: "",
        ...normalizeControlPaneState(undefined, { strict: false, fieldPathPrefix: "workspace" }),
        deckGroups: {},
        deckSplitLayouts: {}
      };
    }

    let activeDeckId = DEFAULT_DECK_ID;
    try {
      activeDeckId =
        workspace.activeDeckId === undefined ? DEFAULT_DECK_ID : normalizeDeckIdInput(workspace.activeDeckId) || DEFAULT_DECK_ID;
    } catch (error) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'workspace.activeDeckId' must be a valid deck id.");
      }
    }
    if (!decks.has(activeDeckId)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", `Deck '${activeDeckId}' was not found for workspace preset.`);
      }
      activeDeckId = decks.has(DEFAULT_DECK_ID) ? DEFAULT_DECK_ID : Array.from(decks.keys())[0] || DEFAULT_DECK_ID;
    }

    const layoutProfileId = normalizeWorkspacePresetLayoutProfileId(workspace.layoutProfileId, { strict });
    const controlPaneState = normalizeControlPaneState(workspace, { strict, fieldPathPrefix: "workspace" });
    const deckGroups = {};
    if (workspace.deckGroups !== undefined) {
      if (!isPlainObject(workspace.deckGroups)) {
        if (strict) {
          throw new ApiError(400, "ValidationError", "Field 'workspace.deckGroups' must be an object.");
        }
      } else {
        for (const [rawDeckId, rawDeckGroup] of Object.entries(workspace.deckGroups)) {
          let deckId = "";
          try {
            deckId = normalizeDeckIdInput(rawDeckId);
          } catch (error) {
            if (strict) {
              throw new ApiError(400, "ValidationError", "Field 'workspace.deckGroups' contains an invalid deck id.");
            }
            continue;
          }
          if (!decks.has(deckId)) {
            if (strict) {
              throw new ApiError(400, "ValidationError", `Deck '${deckId}' was not found for workspace preset groups.`);
            }
            continue;
          }
          deckGroups[deckId] = normalizeWorkspacePresetDeckGroup(deckId, rawDeckGroup, { strict });
        }
      }
    }

    const deckSplitLayouts = normalizeDeckSplitLayoutMap(workspace.deckSplitLayouts, {
      strict,
      fieldPath: "workspace.deckSplitLayouts",
      allowUnknownDeckIds: false,
      hasKnownDeck: (deckId) => decks.has(deckId),
      hasKnownSession,
      resolveSessionDeckId
    });

    return {
      activeDeckId,
      layoutProfileId,
      ...controlPaneState,
      deckGroups,
      deckSplitLayouts
    };
  }

  function normalizeWorkspacePresetEntity(input, { strict = true } = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return null;
    }
    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (!id || !WORKSPACE_PRESET_ID_PATTERN.test(id)) {
      return null;
    }
    const now = Date.now();
    const createdAt = Number.isInteger(input.createdAt) ? input.createdAt : now;
    const updatedAt = Number.isInteger(input.updatedAt) ? input.updatedAt : createdAt;
    return {
      id,
      name:
        typeof input.name === "string" && input.name.trim()
          ? input.name.trim().slice(0, WORKSPACE_PRESET_NAME_MAX_LENGTH)
          : id,
      createdAt,
      updatedAt,
      workspace: normalizeWorkspacePresetWorkspace(input.workspace, { strict })
    };
  }

  function compareWorkspacePresetEntries(a, b) {
    const nameCompare = a.name.localeCompare(b.name, "en-US", { sensitivity: "base" });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.id.localeCompare(b.id, "en-US", { sensitivity: "base" });
  }

  function toApiWorkspacePreset(preset) {
    return {
      id: preset.id,
      name: preset.name,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
      workspace: {
        activeDeckId: preset.workspace.activeDeckId,
        layoutProfileId: preset.workspace.layoutProfileId || undefined,
        controlPaneVisible: preset.workspace.controlPaneVisible,
        controlPanePosition: preset.workspace.controlPanePosition,
        controlPaneSize: preset.workspace.controlPaneSize,
        deckGroups: JSON.parse(JSON.stringify(preset.workspace.deckGroups)),
        deckSplitLayouts: JSON.parse(JSON.stringify(preset.workspace.deckSplitLayouts))
      }
    };
  }

  function listWorkspacePresets() {
    return Array.from(workspacePresets.values()).sort(compareWorkspacePresetEntries).map(toApiWorkspacePreset);
  }

  function getWorkspacePresetOrThrow(presetId) {
    const preset = workspacePresets.get(presetId);
    if (!preset) {
      throw new ApiError(404, "WorkspacePresetNotFound", `Workspace preset '${presetId}' was not found.`);
    }
    return preset;
  }

  function createWorkspacePreset(body) {
    const name = normalizeWorkspacePresetName(body?.name);
    const requestedId = normalizeWorkspacePresetIdInput(body?.id);
    let presetId = requestedId;
    if (!presetId) {
      const slug = slugifyWorkspacePresetId(name);
      presetId = slug;
      let suffix = 2;
      while (workspacePresets.has(presetId)) {
        const suffixText = `-${suffix}`;
        const rootMaxLength = 32 - suffixText.length;
        const rooted = slug.slice(0, rootMaxLength).replace(/-+$/g, "") || "workspace";
        presetId = `${rooted}${suffixText}`;
        suffix += 1;
      }
    }
    if (workspacePresets.has(presetId)) {
      throw new ApiError(409, "WorkspacePresetAlreadyExists", `Workspace preset '${presetId}' already exists.`);
    }
    const now = Date.now();
    const preset = {
      id: presetId,
      name,
      createdAt: now,
      updatedAt: now,
      workspace: normalizeWorkspacePresetWorkspace(body?.workspace, { strict: true })
    };
    workspacePresets.set(preset.id, preset);
    return toApiWorkspacePreset(preset);
  }

  function updateWorkspacePreset(presetId, body) {
    const existing = getWorkspacePresetOrThrow(presetId);
    const hasName = body?.name !== undefined;
    const hasWorkspace = body?.workspace !== undefined;
    if (!hasName && !hasWorkspace) {
      throw new ApiError(400, "ValidationError", "At least one updatable workspace preset field is required.");
    }
    const next = {
      ...existing,
      name: hasName ? normalizeWorkspacePresetName(body.name) : existing.name,
      workspace: hasWorkspace ? normalizeWorkspacePresetWorkspace(body.workspace, { strict: true }) : existing.workspace,
      updatedAt: Date.now()
    };
    workspacePresets.set(presetId, next);
    return toApiWorkspacePreset(next);
  }

  function deleteWorkspacePreset(presetId) {
    const preset = getWorkspacePresetOrThrow(presetId);
    workspacePresets.delete(presetId);
    return toApiWorkspacePreset(preset);
  }

  function cleanupWorkspacePresets() {
    let changed = false;
    for (const [presetId, preset] of workspacePresets.entries()) {
      const nextWorkspace = normalizeWorkspacePresetWorkspace(preset.workspace, { strict: false });
      if (JSON.stringify(nextWorkspace) === JSON.stringify(preset.workspace)) {
        continue;
      }
      workspacePresets.set(presetId, {
        ...preset,
        workspace: nextWorkspace,
        updatedAt: Date.now()
      });
      changed = true;
    }
    return changed;
  }

  function cleanupLayoutProfiles() {
    let changed = false;
    for (const [profileId, profile] of layoutProfiles.entries()) {
      const nextLayout = normalizeLayoutProfileLayout(profile.layout, {
        strict: false,
        hasKnownSession,
        resolveSessionDeckId
      });
      if (JSON.stringify(nextLayout) === JSON.stringify(profile.layout)) {
        continue;
      }
      layoutProfiles.set(profileId, {
        ...profile,
        layout: nextLayout,
        updatedAt: Date.now()
      });
      changed = true;
    }
    return changed;
  }

  function compareSshTrustEntries(a, b) {
    const hostCompare = a.host.localeCompare(b.host, "en-US", { sensitivity: "base" });
    if (hostCompare !== 0) {
      return hostCompare;
    }
    if (a.port !== b.port) {
      return a.port - b.port;
    }
    const keyTypeCompare = a.keyType.localeCompare(b.keyType, "en-US", { sensitivity: "base" });
    if (keyTypeCompare !== 0) {
      return keyTypeCompare;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.id.localeCompare(b.id, "en-US", { sensitivity: "base" });
  }

  function toApiSshTrustEntry(entry) {
    return {
      id: entry.id,
      host: entry.host,
      port: entry.port,
      keyType: entry.keyType,
      publicKey: entry.publicKey,
      fingerprintSha256: entry.fingerprintSha256,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    };
  }

  function listSshTrustEntries() {
    return Array.from(sshTrustEntries.values()).sort(compareSshTrustEntries).map(toApiSshTrustEntry);
  }

  function findSshTrustConflict(entry) {
    for (const candidate of sshTrustEntries.values()) {
      if (candidate.host !== entry.host || candidate.port !== entry.port || candidate.keyType !== entry.keyType) {
        continue;
      }
      if (candidate.publicKey === entry.publicKey) {
        return { type: "exact", entry: candidate };
      }
      return { type: "conflict", entry: candidate };
    }
    return null;
  }

  function upsertSshTrustEntry(body) {
    const normalized = normalizeSshTrustEntryEntity(body, { strict: true });
    const conflict = findSshTrustConflict(normalized);
    if (conflict?.type === "exact") {
      return { created: false, entry: toApiSshTrustEntry(conflict.entry) };
    }
    if (conflict?.type === "conflict") {
      throw new ApiError(
        409,
        "SshHostKeyTrustConflict",
        `SSH trust entry '${conflict.entry.id}' already trusts ${normalized.host}:${normalized.port} ${normalized.keyType} with a different public key. Delete the existing entry before trusting the new host key.`
      );
    }
    const now = Date.now();
    const entry = {
      ...normalized,
      createdAt: now,
      updatedAt: now
    };
    sshTrustEntries.set(entry.id, entry);
    return { created: true, entry: toApiSshTrustEntry(entry) };
  }

  function deleteSshTrustEntry(entryId) {
    const normalizedEntryId = typeof entryId === "string" ? entryId.trim() : "";
    if (!SSH_TRUST_ENTRY_ID_PATTERN.test(normalizedEntryId)) {
      throw new ApiError(404, "SshTrustEntryNotFound", `SSH trust entry '${entryId}' was not found.`);
    }
    const entry = sshTrustEntries.get(normalizedEntryId);
    if (!entry) {
      throw new ApiError(404, "SshTrustEntryNotFound", `SSH trust entry '${entryId}' was not found.`);
    }
    sshTrustEntries.delete(normalizedEntryId);
    return toApiSshTrustEntry(entry);
  }

  async function syncSshKnownHostsFile() {
    const payload = renderSshKnownHosts(Array.from(sshTrustEntries.values()).sort(compareSshTrustEntries));
    await mkdir(dirname(sshKnownHostsPath), { recursive: true });
    await writeFile(sshKnownHostsPath, payload, { encoding: "utf8", mode: 0o600 });
  }

  function ensureSessionExistsOrThrow(sessionId) {
    try {
      manager.get(sessionId);
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    if (unrestoredSessions.has(sessionId)) {
      return;
    }
    throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
  }

  function moveSessionToDeck(sessionId, deckId) {
    getDeckOrThrow(deckId);
    ensureSessionExistsOrThrow(sessionId);
    const sourceDeckId = resolveSessionDeckId(sessionId);
    if (sourceDeckId === deckId) {
      return false;
    }
    sessionDeckAssignments.set(sessionId, deckId);
    cleanupLayoutProfiles();
    cleanupWorkspacePresets();
    return true;
  }

  function ensureDefaultDeck() {
    if (decks.has(DEFAULT_DECK_ID)) {
      return decks.get(DEFAULT_DECK_ID);
    }
    const defaultDeck = buildDefaultDeck();
    decks.set(defaultDeck.id, defaultDeck);
    return defaultDeck;
  }

  function resolveSessionDeckId(sessionId) {
    const assigned = sessionDeckAssignments.get(sessionId);
    if (assigned && decks.has(assigned)) {
      return assigned;
    }
    ensureDefaultDeck();
    sessionDeckAssignments.set(sessionId, DEFAULT_DECK_ID);
    return DEFAULT_DECK_ID;
  }

  function normalizeQuickIdToken(value) {
    if (typeof value !== "string") {
      return "";
    }
    const normalized = value.trim().toUpperCase();
    if (!normalized) {
      return "";
    }
    if (normalized === SESSION_QUICK_ID_FALLBACK) {
      return SESSION_QUICK_ID_FALLBACK;
    }
    return sessionQuickIdRank.has(normalized) ? normalized : "";
  }

  function getSessionRecordRef(sessionId) {
    try {
      return manager.get(sessionId);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    const unrestored = unrestoredSessions.get(sessionId);
    if (unrestored) {
      return { meta: unrestored };
    }
    return null;
  }

  function findNextQuickIdToken(excludedSessionIds = []) {
    const excluded = new Set((Array.isArray(excludedSessionIds) ? excludedSessionIds : []).map((entry) => String(entry || "").trim()));
    const used = new Set();
    for (const [sessionId, token] of sessionQuickIdAssignments.entries()) {
      if (!excluded.has(sessionId)) {
        used.add(token);
      }
    }
    for (const candidate of SESSION_QUICK_ID_POOL) {
      if (!used.has(candidate)) {
        return candidate;
      }
    }
    return SESSION_QUICK_ID_FALLBACK;
  }

  function assignSessionQuickIdToken(sessionId, preferredToken = "") {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) {
      return SESSION_QUICK_ID_FALLBACK;
    }
    const existing = normalizeQuickIdToken(sessionQuickIdAssignments.get(normalizedSessionId));
    if (existing) {
      return existing;
    }
    const preferred = normalizeQuickIdToken(preferredToken);
    let nextToken = preferred;
    if (
      !nextToken ||
      (nextToken !== SESSION_QUICK_ID_FALLBACK &&
        Array.from(sessionQuickIdAssignments.entries()).some(
          ([otherSessionId, otherToken]) => otherSessionId !== normalizedSessionId && otherToken === nextToken
        ))
    ) {
      nextToken = findNextQuickIdToken([normalizedSessionId]);
    }
    sessionQuickIdAssignments.set(normalizedSessionId, nextToken);
    const record = getSessionRecordRef(normalizedSessionId);
    if (record?.meta) {
      record.meta.quickIdToken = nextToken;
    }
    return nextToken;
  }

  function getSessionQuickIdToken(sessionId) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) {
      return SESSION_QUICK_ID_FALLBACK;
    }
    return assignSessionQuickIdToken(normalizedSessionId);
  }

  function setSessionQuickIdToken(sessionId, token) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) {
      throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
    }
    const nextToken = normalizeQuickIdToken(token) || findNextQuickIdToken([normalizedSessionId]);
    sessionQuickIdAssignments.set(normalizedSessionId, nextToken);
    const record = getSessionRecordRef(normalizedSessionId);
    if (record?.meta) {
      record.meta.quickIdToken = nextToken;
      record.meta.updatedAt = Date.now();
    }
    return nextToken;
  }

  function deleteSessionQuickIdToken(sessionId) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) {
      return false;
    }
    return sessionQuickIdAssignments.delete(normalizedSessionId);
  }

  function swapSessionQuickIds(sessionIdA, sessionIdB) {
    const leftSessionId = typeof sessionIdA === "string" ? sessionIdA.trim() : "";
    const rightSessionId = typeof sessionIdB === "string" ? sessionIdB.trim() : "";
    if (!leftSessionId || !rightSessionId || leftSessionId === rightSessionId) {
      throw new ApiError(400, "ValidationError", "Swap requires two different session ids.");
    }
    ensureSessionExistsOrThrow(leftSessionId);
    ensureSessionExistsOrThrow(rightSessionId);
    const leftToken = getSessionQuickIdToken(leftSessionId);
    const rightToken = getSessionQuickIdToken(rightSessionId);
    setSessionQuickIdToken(leftSessionId, rightToken);
    setSessionQuickIdToken(rightSessionId, leftToken);
    return {
      leftSession: getApiSessionOrThrow(leftSessionId),
      rightSession: getApiSessionOrThrow(rightSessionId)
    };
  }

  function withDeckId(session) {
    return {
      ...session,
      deckId: resolveSessionDeckId(session.id),
      quickIdToken: getSessionQuickIdToken(session.id)
    };
  }

  function snapshotRuntimeState() {
    const snapshot = manager.getSnapshot({
      outputMaxChars: sessionReplayPersistMaxChars,
      includeTruncationMetadata: true,
      includeEmptyOutputs: true
    });
    const sessionMap = new Map();
    for (const session of snapshot.sessions) {
      sessionMap.set(session.id, withDeckId(session));
    }
    for (const [sessionId, session] of unrestoredSessions.entries()) {
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, withDeckId(session));
      }
    }
    ensureDefaultDeck();
    return {
      sessions: Array.from(sessionMap.values()),
      sessionOutputs: snapshot.outputs,
      customCommands: listCustomCommands(),
      decks: Array.from(decks.values()),
      connectionProfiles: Array.from(connectionProfiles.values()).map(toApiConnectionProfile),
      layoutProfiles: Array.from(layoutProfiles.values()).map(toApiLayoutProfile),
      workspacePresets: Array.from(workspacePresets.values()).map(toApiWorkspacePreset),
      sshTrustEntries: Array.from(sshTrustEntries.values()).sort(compareSshTrustEntries).map(toApiSshTrustEntry)
    };
  }

  function toApiSession(session, explicitState) {
    const sessionState = typeof explicitState === "string" && explicitState.trim() ? explicitState.trim() : String(session?.state || "").trim();
    return {
      ...withDeckId(session),
      state: sessionState || "running"
    };
  }

  function listApiSessions({ deckId } = {}) {
    const payload = [];
    const seen = new Set();
    for (const session of manager.list()) {
      const apiSession = toApiSession(session);
      if (!deckId || apiSession.deckId === deckId) {
        payload.push(apiSession);
      }
      seen.add(session.id);
    }
    for (const [sessionId, session] of unrestoredSessions.entries()) {
      if (seen.has(sessionId)) {
        continue;
      }
      const apiSession = toApiSession(session, "unrestored");
      if (!deckId || apiSession.deckId === deckId) {
        payload.push(apiSession);
      }
    }
    return payload;
  }

  function getApiSessionOrThrow(sessionId) {
    try {
      const active = manager.get(sessionId).meta;
      return toApiSession(active);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    const unrestored = unrestoredSessions.get(sessionId);
    if (unrestored) {
      return toApiSession(unrestored, "unrestored");
    }
    throw new ApiError(404, "SessionNotFound", `Session '${sessionId}' was not found.`);
  }

  function buildSessionReplayExportFilename(sessionId) {
    return `ptydeck-session-${String(sessionId || "").trim() || "unknown"}-replay.txt`;
  }

  function buildSessionReplayExportOrThrow(sessionId) {
    const apiSession = getApiSessionOrThrow(sessionId);
    let replayExport = null;
    try {
      replayExport = manager.getReplayExport(sessionId);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
    const persistedReplayOutput = persistedReplayOutputs.get(sessionId) || null;
    const data =
      typeof replayExport?.data === "string"
        ? replayExport.data
        : typeof persistedReplayOutput?.data === "string"
          ? persistedReplayOutput.data
          : "";
    const retainedChars = Number.isInteger(replayExport?.retainedChars)
      ? replayExport.retainedChars
      : Number.isInteger(persistedReplayOutput?.retainedChars)
        ? persistedReplayOutput.retainedChars
        : data.length;
    const retentionLimitChars = Number.isInteger(replayExport?.retentionLimitChars)
      ? replayExport.retentionLimitChars
      : Number.isInteger(persistedReplayOutput?.retentionLimitChars)
        ? persistedReplayOutput.retentionLimitChars
        : manager.sessionReplayMemoryMaxChars;
    return {
      sessionId: apiSession.id,
      sessionState: apiSession.state,
      scope: SESSION_REPLAY_EXPORT_SCOPE,
      format: SESSION_REPLAY_EXPORT_FORMAT,
      contentType: SESSION_REPLAY_EXPORT_CONTENT_TYPE,
      fileName: buildSessionReplayExportFilename(apiSession.id),
      data,
      retainedChars,
      retentionLimitChars,
      truncated: replayExport?.truncated === true || persistedReplayOutput?.truncated === true
    };
  }

function tryCreateRestoredSession({
  session,
  kind,
  remoteConnection,
  remoteAuth,
  shell,
  cwd,
  startCwd,
  startCommand,
  replayOutput,
  replayOutputTruncated,
  remoteSecret,
  env,
  note,
  inputSafetyProfile,
  tags,
  themeProfile,
  activeThemeProfile,
  inactiveThemeProfile
}) {
    return manager.create({
      id: session.id,
      kind,
      remoteConnection,
      remoteAuth,
      remoteSecret,
      cwd,
      shell,
      name: session.name,
      startCwd,
      startCommand,
      replayOutput,
      replayOutputTruncated,
      env,
      note,
      inputSafetyProfile,
      tags,
      themeProfile,
      activeThemeProfile,
      inactiveThemeProfile,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });
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
        sshTrustEntryCount: state.sshTrustEntries.length
      });
      await persistence.saveState(state);
      logDebug("persist.save.ok", {
        reason,
        sessionCount: state.sessions.length,
        customCommandCount: state.customCommands.length,
        deckCount: state.decks.length,
        connectionProfileCount: state.connectionProfiles.length,
        workspacePresetCount: state.workspacePresets.length,
        sshTrustEntryCount: state.sshTrustEntries.length
      });
    };

    persistQueue = persistQueue.then(executeSave, executeSave);
    return persistQueue;
  }

  async function persistNow(reason = "manual") {
    if (isStopping) {
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await saveStateQueued(snapshotRuntimeState(), reason);
  }

  function persistSoon() {
    if (isStopping) {
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

  function broadcast(payload) {
    const message = JSON.stringify(payload);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }

  function broadcastSessionUpdated(sessionId) {
    broadcast({
      type: "session.updated",
      session: getApiSessionOrThrow(sessionId)
    });
  }

  manager.on("session.activity.started", (event) => {
    logDebug("session.event", { type: "session.activity.started", sessionId: event.sessionId || null });
    reconcileStartupWarmup();
    persistSoon();
  });

  manager.on("session.activity.completed", async (event) => {
    logDebug("session.event", { type: "session.activity.completed", sessionId: event.sessionId || null });
    reconcileStartupWarmup();
    try {
      await persistNow("session.activity.completed");
      const apiSession = getApiSessionOrThrow(event.sessionId);
      broadcast({
        type: "session.activity.completed",
        sessionId: event.sessionId,
        activityCompletedAt: event.activityCompletedAt,
        session: apiSession
      });
    } catch (error) {
      console.error("failed to persist session activity completion", error);
    }
  });

  function broadcastDeckUpsert(type, deck) {
    broadcast({
      type,
      deck: toApiDeck(deck)
    });
  }

  function broadcastDeckDeleted(deckId, fallbackDeckId = DEFAULT_DECK_ID) {
    broadcast({
      type: "deck.deleted",
      deckId,
      fallbackDeckId
    });
  }

  const wsEventNames = ["session.created", "session.started", "session.updated", "session.data", "session.exit", "session.closed"];
  for (const eventName of wsEventNames) {
    manager.on(eventName, (event) => {
      if (eventName !== "session.data") {
        logDebug("session.event", { type: eventName, sessionId: event.session?.id || event.sessionId || null });
      }
      if ((eventName === "session.created" || eventName === "session.started" || eventName === "session.updated") && event && event.session) {
        broadcast({
          type: eventName,
          ...event,
          session: toApiSession(event.session)
        });
      } else {
        broadcast({ type: eventName, ...event });
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
          reconcileStartupWarmup();
        }
        persistSoon();
      }
    });
  }

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const methodForLog = req.method || "GET";
    let pathnameForLog = req.url || "/";
    let normalizedMetricsPathForLog = pathnameForLog;
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const statusCode = String(res.statusCode);
      const routeKey = `${methodForLog} ${normalizedMetricsPathForLog}`;
      metrics.httpRequestsTotal += 1;
      metrics.httpDurationMsCount += 1;
      metrics.httpDurationMsSum += durationMs;
      recordHttpDuration(durationMs);
      if (res.statusCode >= 400) {
        metrics.httpErrorsTotal += 1;
      }
      bumpMetricCounter(metrics.httpRequestsByStatus, statusCode);
      bumpMetricCounter(metrics.httpRequestsByRoute, routeKey);
      logDebug("http.request.done", {
        method: methodForLog,
        pathname: pathnameForLog,
        statusCode: res.statusCode,
        durationMs
      });
    });

    try {
      const requestContext = resolveRequestContext(req, config.trustedProxy);
      const parsedUrl = new URL(req.url || "/", `${requestContext.protocol}://${requestContext.host}`);
      pathnameForLog = parsedUrl.pathname;
      normalizedMetricsPathForLog = normalizeMetricsPath(parsedUrl.pathname);
      logDebug("http.request.start", {
        method: methodForLog,
        pathname: pathnameForLog,
        clientIp: requestContext.clientIp,
        protocol: requestContext.protocol,
        trustedProxy: requestContext.trustedProxy
      });

      if (req.method === "OPTIONS") {
        ensureTlsIngress(requestContext);
        writeJson(req, res, 204);
        return;
      }

      const match = route(parsedUrl.pathname, req.method || "GET");
      const body = await parseJsonBody(req, maxBodyBytes);
      const params = match.params || {};

      validateRequest({
        method: req.method || "GET",
        pathname: parsedUrl.pathname,
        params,
        query: Object.fromEntries(parsedUrl.searchParams.entries()),
        body
      });
      ensureTlsIngress(requestContext);

      if (match.kind === "health") {
        writeJson(req, res, 200, { status: "ok" });
        return;
      }

      if (match.kind === "ready") {
        writeJson(req, res, 200, buildReadyPayload());
        return;
      }

      if (match.kind === "metrics") {
        const payload = renderMetrics();
        res.writeHead(200, {
          ...buildSecurityHeaders(),
          "content-type": "text/plain; version=0.0.4; charset=utf-8",
          "cache-control": "no-store"
        });
        res.end(payload);
        return;
      }

      if (match.kind === "devToken") {
        if (!config.authEnabled || !config.authDevMode) {
          throw new ApiError(404, "NotFound", `No route for ${req.method} ${parsedUrl.pathname}`);
        }
        const scopeDefaults = ["sessions:read", "sessions:create", "sessions:write", "sessions:delete", "ws:connect"];
        const requestedScopes =
          Array.isArray(body?.scopes) && body.scopes.every((entry) => typeof entry === "string")
            ? body.scopes
            : scopeDefaults;
        const payload = {
          accessToken: createDevToken({
            secret: config.authDevSecret,
            issuer: config.authIssuer,
            audience: config.authAudience,
            subject: typeof body?.subject === "string" && body.subject.trim() ? body.subject.trim() : "dev-user",
            tenantId: typeof body?.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : "dev",
            scopes: requestedScopes,
            ttlSeconds: config.authDevTokenTtlSeconds
          }),
          tokenType: "Bearer",
          expiresIn: config.authDevTokenTtlSeconds,
          scope: requestedScopes.join(" ")
        };
        validateResponse({ statusCode: 200, body: payload, expect: "authToken" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "wsTicket") {
        const auth = authenticateRequest(req, parsedUrl, requiredScopeForRoute(match.kind));
        const payload = issueWsTicket(auth);
        validateResponse({ statusCode: 200, body: payload, expect: "wsTicket" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind !== "notFound") {
        authenticateRequest(req, parsedUrl, requiredScopeForRoute(match.kind));
      }

      if (match.kind === "listCustomCommands") {
        const scope = parsedUrl.searchParams.get("scope");
        const sessionId = parsedUrl.searchParams.get("sessionId");
        const payload = listCustomCommands({
          scope: scope ? normalizeCustomCommandScope(scope) : null,
          sessionId
        });
        validateResponse({ statusCode: 200, body: payload, expect: "customCommandList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "getCustomCommand") {
        const scope = parsedUrl.searchParams.get("scope");
        const sessionId = parsedUrl.searchParams.get("sessionId");
        const payload = getCustomCommandOrThrow(match.params.commandName, {
          scope: scope ? normalizeCustomCommandScope(scope) : null,
          sessionId
        });
        validateResponse({ statusCode: 200, body: payload, expect: "customCommand" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "upsertCustomCommand") {
        const targetScope = normalizeCustomCommandScope(body?.scope);
        const targetSessionId = targetScope === "session" ? normalizeCustomCommandSessionId(body?.sessionId) : "";
        const existed = hasCustomCommand(match.params.commandName, {
          scope: targetScope,
          sessionId: targetSessionId
        });
        const payload = upsertCustomCommand(match.params.commandName, body);
        validateResponse({ statusCode: 200, body: payload, expect: "customCommand" });
        broadcast({
          type: existed ? "custom-command.updated" : "custom-command.created",
          command: payload
        });
        await persistNow("custom-command.upsert");
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteCustomCommand") {
        const scope = parsedUrl.searchParams.get("scope");
        const sessionId = parsedUrl.searchParams.get("sessionId");
        const deletedCommand = deleteCustomCommand(match.params.commandName, {
          scope: scope ? normalizeCustomCommandScope(scope) : null,
          sessionId
        });
        broadcast({
          type: "custom-command.deleted",
          command: deletedCommand
        });
        await persistNow("custom-command.delete");
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "listDecks") {
        const payload = listDecks();
        validateResponse({ statusCode: 200, body: payload, expect: "deckList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "createDeck") {
        const payload = createDeck(body);
        validateResponse({ statusCode: 201, body: payload, expect: "deck" });
        await persistNow("deck.create");
        broadcastDeckUpsert("deck.created", payload);
        writeJson(req, res, 201, payload);
        return;
      }

      if (match.kind === "getDeck") {
        const payload = toApiDeck(getDeckOrThrow(match.params.deckId));
        validateResponse({ statusCode: 200, body: payload, expect: "deck" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "updateDeck") {
        const payload = updateDeck(match.params.deckId, body);
        validateResponse({ statusCode: 200, body: payload, expect: "deck" });
        await persistNow("deck.update");
        broadcastDeckUpsert("deck.updated", payload);
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteDeck") {
        const force = parseBooleanQueryParam(parsedUrl.searchParams.get("force"), "force");
        const result = deleteDeck(match.params.deckId, { force });
        await persistNow("deck.delete");
        for (const sessionId of result.reassignedSessionIds) {
          broadcastSessionUpdated(sessionId);
        }
        broadcastDeckDeleted(result.deckId, result.fallbackDeckId);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "moveSessionToDeck") {
        moveSessionToDeck(match.params.sessionId, match.params.deckId);
        await persistNow("deck.move-session");
        broadcastSessionUpdated(match.params.sessionId);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "listLayoutProfiles") {
        const payload = listLayoutProfiles();
        validateResponse({ statusCode: 200, body: payload, expect: "layoutProfileList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "createLayoutProfile") {
        const payload = createLayoutProfile(body);
        validateResponse({ statusCode: 201, body: payload, expect: "layoutProfile" });
        await persistNow("layout-profile.create");
        writeJson(req, res, 201, payload);
        return;
      }

      if (match.kind === "getLayoutProfile") {
        const payload = toApiLayoutProfile(getLayoutProfileOrThrow(match.params.profileId));
        validateResponse({ statusCode: 200, body: payload, expect: "layoutProfile" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "updateLayoutProfile") {
        const payload = updateLayoutProfile(match.params.profileId, body);
        validateResponse({ statusCode: 200, body: payload, expect: "layoutProfile" });
        await persistNow("layout-profile.update");
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteLayoutProfile") {
        deleteLayoutProfile(match.params.profileId);
        await persistNow("layout-profile.delete");
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "listConnectionProfiles") {
        const payload = listConnectionProfiles();
        validateResponse({ statusCode: 200, body: payload, expect: "connectionProfileList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "createConnectionProfile") {
        const payload = createConnectionProfile(body);
        validateResponse({ statusCode: 201, body: payload, expect: "connectionProfile" });
        await persistNow("connection-profile.create");
        writeJson(req, res, 201, payload);
        return;
      }

      if (match.kind === "getConnectionProfile") {
        const payload = toApiConnectionProfile(getConnectionProfileOrThrow(match.params.profileId));
        validateResponse({ statusCode: 200, body: payload, expect: "connectionProfile" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "updateConnectionProfile") {
        const payload = updateConnectionProfile(match.params.profileId, body);
        validateResponse({ statusCode: 200, body: payload, expect: "connectionProfile" });
        await persistNow("connection-profile.update");
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteConnectionProfile") {
        deleteConnectionProfile(match.params.profileId);
        await persistNow("connection-profile.delete");
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "listWorkspacePresets") {
        const payload = listWorkspacePresets();
        validateResponse({ statusCode: 200, body: payload, expect: "workspacePresetList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "createWorkspacePreset") {
        const payload = createWorkspacePreset(body);
        validateResponse({ statusCode: 201, body: payload, expect: "workspacePreset" });
        await persistNow("workspace-preset.create");
        writeJson(req, res, 201, payload);
        return;
      }

      if (match.kind === "getWorkspacePreset") {
        const payload = toApiWorkspacePreset(getWorkspacePresetOrThrow(match.params.presetId));
        validateResponse({ statusCode: 200, body: payload, expect: "workspacePreset" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "updateWorkspacePreset") {
        const payload = updateWorkspacePreset(match.params.presetId, body);
        validateResponse({ statusCode: 200, body: payload, expect: "workspacePreset" });
        await persistNow("workspace-preset.update");
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteWorkspacePreset") {
        deleteWorkspacePreset(match.params.presetId);
        await persistNow("workspace-preset.delete");
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "listSshTrustEntries") {
        const payload = listSshTrustEntries();
        validateResponse({ statusCode: 200, body: payload, expect: "sshTrustEntryList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "createSshTrustEntry") {
        const { created, entry } = upsertSshTrustEntry(body);
        await syncSshKnownHostsFile();
        await persistNow(created ? "ssh-trust-entry.create" : "ssh-trust-entry.reuse");
        validateResponse({ statusCode: created ? 201 : 200, body: entry, expect: "sshTrustEntry" });
        writeJson(req, res, created ? 201 : 200, entry);
        return;
      }

      if (match.kind === "deleteSshTrustEntry") {
        deleteSshTrustEntry(match.params.entryId);
        await syncSshKnownHostsFile();
        await persistNow("ssh-trust-entry.delete");
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "listSessions") {
        const requestedDeckId = parsedUrl.searchParams.get("deckId");
        const deckIdFilter = typeof requestedDeckId === "string" && requestedDeckId.trim() ? requestedDeckId.trim() : "";
        const payload = listApiSessions({ deckId: deckIdFilter || undefined });
        validateResponse({ statusCode: 200, body: payload, expect: "sessionList" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "createSession") {
        const rateLimitResult = createSessionRateLimiter.check(requestContext.clientIp, config.rateLimitRestCreateMax);
        if (!rateLimitResult.allowed) {
          throw new ApiError(
            429,
            "RateLimitExceeded",
            `Session creation rate limit exceeded. Retry in ${rateLimitResult.retryAfterSeconds} seconds.`
          );
        }
        const connectionProfileId =
          typeof body?.connectionProfileId === "string" && body.connectionProfileId.trim()
            ? normalizeConnectionProfileIdInput(body.connectionProfileId)
            : "";
        const connectionProfile = connectionProfileId ? getConnectionProfileOrThrow(connectionProfileId) : null;
        const launchSource = connectionProfile?.launch || {};
        const mergedBody = {
          ...launchSource,
          ...(body || {})
        };
        const kind = normalizeSessionKind(mergedBody?.kind, { strict: true });
        const startupConfig = normalizeSessionStartupConfig(
          {
            startCwd: mergedBody?.startCwd !== undefined ? mergedBody.startCwd : mergedBody?.cwd,
            startCommand: mergedBody?.startCommand,
            env: mergedBody?.env,
            fallbackCwd: kind === SESSION_KIND_SSH ? "~" : mergedBody?.cwd
          },
          { strict: true }
        );
        const remoteConnection = normalizeSessionRemoteConnection(mergedBody?.remoteConnection, kind, { strict: true });
        const remoteAuth = normalizeSessionRemoteAuth(mergedBody?.remoteAuth, kind, { strict: true });
        const remoteSecret = normalizeSessionRemoteSecret(body?.remoteSecret, remoteAuth, kind, { strict: true });
        const themeSlots = normalizeSessionThemeSlots(mergedBody, { strict: true });
        const note = normalizeSessionNote(mergedBody?.note, { strict: true });
        const inputSafetyProfile = normalizeSessionInputSafetyProfile(mergedBody?.inputSafetyProfile, { strict: true });
        const tags = normalizeSessionTags(mergedBody?.tags, { strict: true });
        const sessionId = crypto.randomUUID();
        const quickIdToken = assignSessionQuickIdToken(sessionId);
        let payload = null;
        try {
          payload = manager.create({
            id: sessionId,
            quickIdToken,
            kind,
            remoteConnection,
            remoteAuth,
            remoteSecret,
            cwd: startupConfig.startCwd,
            shell: mergedBody?.shell !== undefined ? mergedBody.shell : kind === SESSION_KIND_SSH ? DEFAULT_SSH_CLIENT : undefined,
            name: mergedBody?.name,
            startCwd: startupConfig.startCwd,
            startCommand: startupConfig.startCommand,
            env: startupConfig.env,
            note,
            inputSafetyProfile,
            tags,
            themeProfile: themeSlots.themeProfile,
            activeThemeProfile: themeSlots.activeThemeProfile,
            inactiveThemeProfile: themeSlots.inactiveThemeProfile
          });
        } catch (error) {
          deleteSessionQuickIdToken(sessionId);
          throw error;
        }
        sessionDeckAssignments.set(
          payload.id,
          normalizeConnectionProfileDeckId(mergedBody?.deckId, {
            strict: false,
            hasKnownDeck: (deckId) => decks.has(deckId)
          })
        );
        const apiPayload = toApiSession(payload);
        validateResponse({ statusCode: 201, body: apiPayload, expect: "session" });
        await persistNow("session.create");
        writeJson(req, res, 201, apiPayload);
        return;
      }

      if (match.kind === "getSession") {
        const payload = getApiSessionOrThrow(match.params.sessionId);
        validateResponse({ statusCode: 200, body: payload, expect: "session" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "getSessionReplayExport") {
        const payload = buildSessionReplayExportOrThrow(match.params.sessionId);
        validateResponse({ statusCode: 200, body: payload, expect: "sessionReplayExport" });
        writeJson(req, res, 200, payload);
        return;
      }

      if (match.kind === "deleteSession") {
        manager.delete(match.params.sessionId);
        sessionDeckAssignments.delete(match.params.sessionId);
        deleteSessionQuickIdToken(match.params.sessionId);
        unrestoredSessions.delete(match.params.sessionId);
        for (const deletedCommand of removeCustomCommandsForSession(match.params.sessionId)) {
          broadcast({
            type: "custom-command.deleted",
            command: deletedCommand
          });
        }
        cleanupLayoutProfiles();
        cleanupWorkspacePresets();
        await persistNow("session.delete");
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "swapSessionQuickId") {
        const result = swapSessionQuickIds(match.params.sessionId, body.otherSessionId);
        validateResponse({ statusCode: 200, body: result, expect: "sessionQuickIdSwap" });
        await persistNow("session.quick_id.swap");
        broadcast({
          type: "session.updated",
          session: result.leftSession
        });
        broadcast({
          type: "session.updated",
          session: result.rightSession
        });
        writeJson(req, res, 200, result);
        return;
      }

      if (match.kind === "updateSession") {
        const patch = {};
        if (body?.name !== undefined) {
          patch.name = body.name;
        }
        const current = manager.get(match.params.sessionId).meta;
        const effectiveKind = normalizeSessionKind(body?.kind !== undefined ? body.kind : current.kind, { strict: true });
        if (body?.kind !== undefined) {
          patch.kind = effectiveKind;
        }
        if (body?.remoteConnection !== undefined || body?.kind !== undefined) {
          patch.remoteConnection = normalizeSessionRemoteConnection(
            body?.remoteConnection !== undefined
              ? body.remoteConnection
              : body?.kind !== undefined && effectiveKind !== current.kind
                ? undefined
                : current.remoteConnection,
            effectiveKind,
            { strict: true }
          );
        }
        const effectiveRemoteAuth = normalizeSessionRemoteAuth(
          body?.remoteAuth !== undefined
            ? body.remoteAuth
            : body?.kind !== undefined && effectiveKind !== current.kind
              ? undefined
              : current.remoteAuth,
          effectiveKind,
          { strict: true }
        );
        if (body?.remoteAuth !== undefined || body?.kind !== undefined) {
          patch.remoteAuth = effectiveRemoteAuth;
        }
        if (body?.remoteSecret !== undefined) {
          patch.remoteSecret = normalizeSessionRemoteSecret(body.remoteSecret, effectiveRemoteAuth, effectiveKind, {
            strict: true
          });
        }
        const hasStartupUpdates =
          body?.startCwd !== undefined || body?.startCommand !== undefined || body?.env !== undefined;
        if (hasStartupUpdates) {
          const startupConfig = normalizeSessionStartupConfig(
            {
              startCwd: body?.startCwd !== undefined ? body.startCwd : current.startCwd || current.cwd,
              startCommand: body?.startCommand !== undefined ? body.startCommand : current.startCommand || "",
              env: body?.env !== undefined ? body.env : current.env || {},
              fallbackCwd: effectiveKind === SESSION_KIND_SSH ? "~" : current.startCwd || current.cwd
            },
            { strict: true }
          );
          patch.startCwd = startupConfig.startCwd;
          patch.startCommand = startupConfig.startCommand;
          patch.env = startupConfig.env;
        }
        if (
          body?.themeProfile !== undefined ||
          body?.activeThemeProfile !== undefined ||
          body?.inactiveThemeProfile !== undefined
        ) {
          const themeSlots = normalizeSessionThemeSlots(
            {
              themeProfile: body?.themeProfile,
              activeThemeProfile: body?.activeThemeProfile,
              inactiveThemeProfile: body?.inactiveThemeProfile
            },
            { strict: true }
          );
          patch.themeProfile = themeSlots.themeProfile;
          patch.activeThemeProfile = themeSlots.activeThemeProfile;
          patch.inactiveThemeProfile = themeSlots.inactiveThemeProfile;
        }
        if (body?.note !== undefined) {
          patch.note = normalizeSessionNote(body.note, { strict: true });
        }
        if (body?.inputSafetyProfile !== undefined) {
          patch.inputSafetyProfile = normalizeSessionInputSafetyProfile(body.inputSafetyProfile, { strict: true });
        }
        if (body?.tags !== undefined) {
          patch.tags = normalizeSessionTags(body.tags, { strict: true });
        }
        if (!Object.keys(patch).length) {
          throw new ApiError(400, "ValidationError", "No updatable session fields provided.");
        }
        const payload = manager.updateSession(match.params.sessionId, patch);
        const apiPayload = toApiSession(payload);
        validateResponse({ statusCode: 200, body: apiPayload, expect: "session" });
        await persistNow("session.update");
        broadcast({
          type: "session.updated",
          session: apiPayload
        });
        writeJson(req, res, 200, apiPayload);
        return;
      }

      if (match.kind === "input") {
        manager.sendInput(match.params.sessionId, body.data);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "resize") {
        manager.resize(match.params.sessionId, body.cols, body.rows);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "restart") {
        const payload = manager.restart(match.params.sessionId);
        assignSessionQuickIdToken(payload.id, payload.quickIdToken);
        const apiPayload = toApiSession(payload);
        validateResponse({ statusCode: 200, body: apiPayload, expect: "session" });
        await persistNow("session.restart");
        writeJson(req, res, 200, apiPayload);
        return;
      }

      if (match.kind === "interrupt") {
        manager.interrupt(match.params.sessionId);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "terminate") {
        manager.terminate(match.params.sessionId);
        writeJson(req, res, 204);
        return;
      }

      if (match.kind === "kill") {
        manager.kill(match.params.sessionId);
        writeJson(req, res, 204);
        return;
      }

      throw new ApiError(404, "NotFound", `No route for ${req.method} ${parsedUrl.pathname}`);
    } catch (err) {
      const mapped = toErrorResponse(err);
      validateResponse({ statusCode: mapped.statusCode, body: mapped.body, expect: "error" });
      writeJson(req, res, mapped.statusCode, mapped.body);
      logDebug("http.request.error", {
        method: methodForLog,
        pathname: pathnameForLog,
        statusCode: mapped.statusCode,
        error: mapped.body.error,
        message: mapped.body.message
      });
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const requestContext = resolveRequestContext(request, config.trustedProxy);
    const requestUrl = new URL(request.url || "/", `${requestContext.protocol}://${requestContext.host}`);
    const requestOrigin = typeof request.headers.origin === "string" ? request.headers.origin : "";
    if (requestUrl.pathname !== "/ws") {
      recordWsError("upgrade_path_rejected");
      logDebug("ws.upgrade.rejected", { pathname: requestUrl.pathname });
      socket.destroy();
      return;
    }
    if (config.enforceTlsIngress && requestContext.protocol !== "https") {
      const payload = {
        error: "TlsRequired",
        message: "TLS is required for this endpoint."
      };
      logDebug("ws.upgrade.tls_rejected", {
        clientIp: requestContext.clientIp,
        trustedProxy: requestContext.trustedProxy,
        protocol: requestContext.protocol
      });
      recordWsError("upgrade_tls_rejected");
      socket.write(
        `HTTP/1.1 426 Upgrade Required\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${JSON.stringify(payload)}`
      );
      socket.destroy();
      return;
    }
    const allowedRequestOrigin = resolveAllowedRequestOrigin(requestOrigin);
    if (!allowedRequestOrigin) {
      const payload = {
        error: "UnauthorizedOrigin",
        message: "WebSocket origin is not allowed."
      };
      logDebug("ws.upgrade.origin_rejected", {
        clientIp: requestContext.clientIp,
        trustedProxy: requestContext.trustedProxy,
        origin: requestOrigin || null
      });
      recordWsError("upgrade_origin_rejected");
      socket.write(
        `HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nConnection: close\r\nVary: Origin\r\n\r\n${JSON.stringify(payload)}`
      );
      socket.destroy();
      return;
    }

    const wsRateLimitResult = wsConnectRateLimiter.check(requestContext.clientIp, config.rateLimitWsConnectMax);
    if (!wsRateLimitResult.allowed) {
      const payload = {
        error: "RateLimitExceeded",
        message: `WebSocket connection rate limit exceeded. Retry in ${wsRateLimitResult.retryAfterSeconds} seconds.`
      };
      logDebug("ws.upgrade.rate_limited", {
        clientIp: requestContext.clientIp,
        trustedProxy: requestContext.trustedProxy
      });
      recordWsError("upgrade_rate_limited");
      socket.write(
        `HTTP/1.1 429 Too Many Requests\r\nContent-Type: application/json\r\nConnection: close\r\nRetry-After: ${wsRateLimitResult.retryAfterSeconds}\r\n\r\n${JSON.stringify(payload)}`
      );
      socket.destroy();
      return;
    }

    if (config.authEnabled) {
      try {
        const token = resolveBearerToken(request, requestUrl);
        const auth = token
          ? verifyDevToken(token, {
              secret: config.authDevSecret,
              issuer: config.authIssuer,
              audience: config.authAudience
            })
          : consumeWsTicket(resolveWsTicketFromProtocols(request));
        ensureScope(auth, "ws:connect");
      } catch (err) {
        const mapped = toErrorResponse(err);
        logDebug("ws.upgrade.auth_rejected", {
          statusCode: mapped.statusCode,
          error: mapped.body.error,
          message: mapped.body.message
        });
        recordWsError("upgrade_auth_rejected");
        socket.write(
          `HTTP/1.1 ${mapped.statusCode} ${mapped.body.error}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${JSON.stringify(mapped.body)}`
        );
        socket.destroy();
        return;
      }
    }

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      sockets.add(ws);
      metrics.wsConnectionsOpenedTotal += 1;
      const normalizedClientIp = typeof requestContext.clientIp === "string" && requestContext.clientIp ? requestContext.clientIp : "unknown";
      const wsClientState = wsClientConnections.get(normalizedClientIp) || {
        activeConnections: 0,
        acceptedConnections: 0,
        lastDisconnectReason: "none"
      };
      if (wsClientState.acceptedConnections > 0 && wsClientState.activeConnections === 0) {
        metrics.wsReconnectsTotal += 1;
        const reconnectReason =
          typeof wsClientState.lastDisconnectReason === "string" && wsClientState.lastDisconnectReason
            ? wsClientState.lastDisconnectReason
            : "unknown";
        bumpMetricCounter(metrics.wsReconnectsByReason, reconnectReason);
      }
      wsClientState.acceptedConnections += 1;
      wsClientState.activeConnections += 1;
      wsClientConnections.set(normalizedClientIp, wsClientState);
      ws.clientIp = normalizedClientIp;
      ws.isAlive = true;
      logDebug("ws.upgrade.accepted", {
        socketCount: sockets.size,
        clientIp: requestContext.clientIp,
        protocol: requestContext.protocol,
        trustedProxy: requestContext.trustedProxy
      });

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("close", (code, reasonBuffer) => {
        sockets.delete(ws);
        metrics.wsConnectionsClosedTotal += 1;
        const clientIp = typeof ws.clientIp === "string" ? ws.clientIp : "unknown";
        const wsClientState = wsClientConnections.get(clientIp);
        const reasonText = Buffer.isBuffer(reasonBuffer) ? reasonBuffer.toString("utf8") : "";
        const disconnectReason = normalizeWsDisconnectReason(code, reasonText, ws.closeReasonHint);
        bumpMetricCounter(metrics.wsDisconnectsByReason, disconnectReason);
        if (wsClientState) {
          wsClientState.activeConnections = Math.max(0, wsClientState.activeConnections - 1);
          wsClientState.lastDisconnectReason = disconnectReason;
          wsClientConnections.set(clientIp, wsClientState);
        }
        logDebug("ws.client.closed", { socketCount: sockets.size });
      });
      ws.on("error", () => {
        recordWsError("socket_error");
      });

      const snapshot = manager.getSnapshot();
      const snapshotSessions = listApiSessions();
      const customCommandSnapshot = listCustomCommands();
      ws.send(
        JSON.stringify({
          type: "snapshot",
          sessions: snapshotSessions,
          outputs: snapshot.outputs,
          customCommands: customCommandSnapshot,
          decks: listDecks()
        })
      );
      logDebug("ws.snapshot.sent", {
        sessionCount: snapshotSessions.length,
        outputCount: snapshot.outputs.length,
        customCommandCount: customCommandSnapshot.length
      });
    });
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

  async function start() {
    isStopped = false;
    isStopping = false;
    isReady = false;
    startupWarmupEnabled = false;
    startupWarmupGateReleased = false;
    clearStartupWarmupQuietTimer();
    startupWarmupReadyPromise = new Promise((resolve) => {
      startupWarmupResolve = resolve;
    });

    const persistedState = await persistence.loadState();
    persistedReplayOutputs = new Map(
      Array.isArray(persistedState.sessionOutputs)
        ? persistedState.sessionOutputs
            .filter(
              (entry) =>
                entry &&
                typeof entry.sessionId === "string" &&
                typeof entry.data === "string" &&
                (entry.truncated === undefined || typeof entry.truncated === "boolean")
            )
            .map((entry) => [
              entry.sessionId,
              {
                data: entry.data,
                retainedChars: entry.data.length,
                retentionLimitChars: sessionReplayPersistMaxChars,
                truncated: entry.truncated === true
              }
            ])
        : []
    );
    startupWarmupEnabled = Array.isArray(persistedState.sessions) && persistedState.sessions.length > 0;
    decks.clear();
    connectionProfiles.clear();
    layoutProfiles.clear();
    workspacePresets.clear();
    sshTrustEntries.clear();
    sessionDeckAssignments.clear();
    sessionQuickIdAssignments.clear();
    for (const persistedDeck of persistedState.decks) {
      const normalizedDeck = normalizeDeckEntity(persistedDeck);
      if (!normalizedDeck) {
        continue;
      }
      decks.set(normalizedDeck.id, normalizedDeck);
    }
    const persistedSessionDeckAssignments = new Map();
    for (const session of Array.isArray(persistedState.sessions) ? persistedState.sessions : []) {
      if (!session || typeof session.id !== "string" || !session.id) {
        continue;
      }
      const persistedDeckId =
        typeof session.deckId === "string" && session.deckId && decks.has(session.deckId)
          ? session.deckId
          : DEFAULT_DECK_ID;
      persistedSessionDeckAssignments.set(session.id, persistedDeckId);
    }
    for (const persistedLayoutProfile of Array.isArray(persistedState.layoutProfiles) ? persistedState.layoutProfiles : []) {
      const normalizedProfile = normalizeLayoutProfileEntity(persistedLayoutProfile, {
        strict: false,
        hasKnownSession: (sessionId) => persistedSessionDeckAssignments.has(sessionId) || hasKnownSession(sessionId),
        resolveSessionDeckId: (sessionId) =>
          persistedSessionDeckAssignments.get(sessionId) ||
          resolveSessionDeckId(sessionId)
      });
      if (!normalizedProfile) {
        continue;
      }
      layoutProfiles.set(normalizedProfile.id, normalizedProfile);
    }
    for (const persistedConnectionProfile of Array.isArray(persistedState.connectionProfiles) ? persistedState.connectionProfiles : []) {
      const normalizedProfile = normalizeConnectionProfileEntity(persistedConnectionProfile, {
        strict: false,
        defaultShell: config.shell,
        hasKnownDeck: (deckId) => decks.has(deckId)
      });
      if (!normalizedProfile) {
        continue;
      }
      if (!normalizedProfile.id) {
        normalizedProfile.id = slugifyConnectionProfileId(normalizedProfile.name);
      }
      connectionProfiles.set(normalizedProfile.id, normalizedProfile);
    }
    for (const persistedSshTrustEntry of Array.isArray(persistedState.sshTrustEntries) ? persistedState.sshTrustEntries : []) {
      const normalizedEntry = normalizeSshTrustEntryEntity(persistedSshTrustEntry, { strict: false });
      if (!normalizedEntry) {
        continue;
      }
      const conflict = findSshTrustConflict(normalizedEntry);
      if (conflict?.type === "conflict") {
        logDebug("runtime.restore.ssh_trust_entry_skip", {
          entryId: normalizedEntry.id,
          host: normalizedEntry.host,
          port: normalizedEntry.port,
          keyType: normalizedEntry.keyType,
          reason: "conflicting-existing-entry"
        });
        continue;
      }
      if (conflict?.type === "exact") {
        continue;
      }
      sshTrustEntries.set(normalizedEntry.id, normalizedEntry);
    }
    await syncSshKnownHostsFile();
    ensureDefaultDeck();
    logDebug("runtime.restore.start", {
      persistedSessionCount: persistedState.sessions.length,
      persistedCustomCommandCount: persistedState.customCommands.length,
      persistedDeckCount: persistedState.decks.length,
      persistedConnectionProfileCount: Array.isArray(persistedState.connectionProfiles) ? persistedState.connectionProfiles.length : 0,
      persistedLayoutProfileCount: Array.isArray(persistedState.layoutProfiles) ? persistedState.layoutProfiles.length : 0,
      persistedWorkspacePresetCount: Array.isArray(persistedState.workspacePresets) ? persistedState.workspacePresets.length : 0,
      persistedSshTrustEntryCount: Array.isArray(persistedState.sshTrustEntries) ? persistedState.sshTrustEntries.length : 0
    });
    for (const session of persistedState.sessions) {
      try {
        const persistedDeckId =
          typeof session.deckId === "string" && session.deckId && decks.has(session.deckId)
            ? session.deckId
            : DEFAULT_DECK_ID;
        sessionDeckAssignments.set(session.id, persistedDeckId);
        const kind = normalizeSessionKind(session.kind, { strict: false });
        const startupConfig = normalizeSessionStartupConfig(
          {
            startCwd: session.startCwd !== undefined ? session.startCwd : session.cwd,
            startCommand: session.startCommand,
            env: session.env,
            fallbackCwd: kind === SESSION_KIND_SSH ? "~" : session.cwd
          },
          { strict: false }
        );
        const remoteConnection = normalizeSessionRemoteConnection(session.remoteConnection, kind, { strict: false });
        const remoteAuth = normalizeSessionRemoteAuth(session.remoteAuth, kind, { strict: false });
        const themeSlots = normalizeSessionThemeSlots(
          {
            themeProfile: session.themeProfile,
            activeThemeProfile: session.activeThemeProfile,
            inactiveThemeProfile: session.inactiveThemeProfile
          },
          { strict: false }
        );
        const note = normalizeSessionNote(session.note, { strict: false });
        const inputSafetyProfile = normalizeSessionInputSafetyProfile(session.inputSafetyProfile, { strict: false });
        const tags = normalizeSessionTags(session.tags, { strict: false });
        const quickIdToken = assignSessionQuickIdToken(session.id, session.quickIdToken);
        const requestedShell =
          typeof session.shell === "string" && session.shell.trim()
            ? session.shell
            : kind === SESSION_KIND_SSH
              ? DEFAULT_SSH_CLIENT
              : config.shell;
        const restoredCreatedAt = Number.isInteger(session.createdAt) ? session.createdAt : Date.now();
        const restoredUpdatedAt = Number.isInteger(session.updatedAt) ? session.updatedAt : restoredCreatedAt;
        const normalizedUnrestoredSession = {
          id: typeof session.id === "string" && session.id ? session.id : "",
          kind,
          ...(remoteConnection ? { remoteConnection } : {}),
          ...(remoteAuth ? { remoteAuth } : {}),
          cwd:
            typeof session.cwd === "string" && session.cwd.trim()
              ? session.cwd
              : startupConfig.startCwd,
          shell: requestedShell,
          ...(typeof session.name === "string" ? { name: session.name } : {}),
          startCwd: startupConfig.startCwd,
          startCommand: startupConfig.startCommand,
          env: startupConfig.env,
          ...(note ? { note } : {}),
          quickIdToken,
          inputSafetyProfile,
          tags,
          themeProfile: themeSlots.themeProfile,
          activeThemeProfile: themeSlots.activeThemeProfile,
          inactiveThemeProfile: themeSlots.inactiveThemeProfile,
          deckId: persistedDeckId,
          createdAt: restoredCreatedAt,
          updatedAt: restoredUpdatedAt
        };
        const requestedCwd = startupConfig.startCwd;
        const fallbackCwd = kind === SESSION_KIND_SSH ? "~" : homedir();
        const fallbackShell = kind === SESSION_KIND_SSH ? DEFAULT_SSH_CLIENT : config.shell;
        if (remoteAuthRequiresSecret(remoteAuth)) {
          unrestoredSessions.set(normalizedUnrestoredSession.id, normalizedUnrestoredSession);
          logDebug("restore.session.skip", {
            sessionId: normalizedUnrestoredSession.id,
            reason: "missing-remote-secret",
            kind,
            authMethod: remoteAuth?.method || null
          });
          continue;
        }
        const restoreAttempts = [
          { shell: requestedShell, cwd: requestedCwd, startCwd: requestedCwd, reason: "saved-shell+saved-cwd" },
          { shell: fallbackShell, cwd: requestedCwd, startCwd: requestedCwd, reason: "fallback-shell+saved-cwd" },
          { shell: requestedShell, cwd: fallbackCwd, startCwd: fallbackCwd, reason: "saved-shell+home-cwd" },
          { shell: fallbackShell, cwd: fallbackCwd, startCwd: fallbackCwd, reason: "fallback-shell+home-cwd" }
        ];

        let restored = false;
        for (const attempt of restoreAttempts) {
          try {
            tryCreateRestoredSession({
              session,
              kind,
              remoteConnection,
              remoteAuth,
              shell: attempt.shell,
              cwd: attempt.cwd,
              startCwd: attempt.startCwd,
              startCommand: startupConfig.startCommand,
              replayOutput: persistedReplayOutputs.get(session.id)?.data || "",
              remoteSecret: undefined,
              replayOutputTruncated: persistedReplayOutputs.get(session.id)?.truncated === true,
              env: startupConfig.env,
              quickIdToken,
              note,
              inputSafetyProfile,
              tags,
              themeProfile: themeSlots.themeProfile,
              activeThemeProfile: themeSlots.activeThemeProfile,
              inactiveThemeProfile: themeSlots.inactiveThemeProfile
            });
            restored = true;
            if (attempt.reason !== "saved-shell+saved-cwd") {
              logDebug("runtime.restore.session_fallback_applied", {
                sessionId: session.id,
                reason: attempt.reason,
                requestedShell,
                requestedStartCwd: requestedCwd,
                appliedShell: attempt.shell,
                appliedStartCwd: attempt.startCwd
              });
            }
            break;
          } catch (err) {
            logDebug("runtime.restore.session_attempt_failed", {
              sessionId: session.id,
              reason: attempt.reason,
              shell: attempt.shell,
              startCwd: attempt.startCwd,
              error: err?.message || String(err)
            });
          }
        }

        if (!restored) {
          unrestoredSessions.set(normalizedUnrestoredSession.id, normalizedUnrestoredSession);
          metrics.sessionsUnrestoredTotal += 1;
          logDebug("runtime.restore.session_marked_unrestored", {
            sessionId: normalizedUnrestoredSession.id
          });
          throw new Error("all restore attempts failed");
        }
        unrestoredSessions.delete(normalizedUnrestoredSession.id);
      } catch (err) {
        console.error("failed to restore session", session.id, err);
      }
    }
    const restoreCandidates = [];
    for (const customCommand of persistedState.customCommands) {
      const candidate = buildCustomCommandEntry(customCommand?.name, customCommand, {
        strict: false,
        fieldPathPrefix: "customCommands[]"
      });
      if (!candidate) {
        continue;
      }
      if (
        candidate.name.length > customCommandMaxNameLength ||
        !CUSTOM_COMMAND_NAME_PATTERN.test(candidate.name) ||
        CUSTOM_COMMAND_RESERVED_NAMES.has(candidate.name) ||
        candidate.content.length > customCommandMaxContentLength
      ) {
        continue;
      }
      restoreCandidates.push(candidate);
    }
    restoreCandidates.sort(compareCustomCommandEntries);
    for (const candidate of restoreCandidates) {
      if (candidate.scope === "session") {
        try {
          ensureSessionExistsOrThrow(candidate.sessionId);
        } catch {
          continue;
        }
      }
      const key = buildCustomCommandKey(candidate.name, candidate.scope, candidate.sessionId);
      if (customCommands.has(key)) {
        customCommands.set(key, candidate);
        continue;
      }
      if (customCommands.size >= customCommandMaxCount) {
        continue;
      }
      customCommands.set(key, candidate);
    }
    for (const persistedWorkspacePreset of Array.isArray(persistedState.workspacePresets) ? persistedState.workspacePresets : []) {
      const normalizedPreset = normalizeWorkspacePresetEntity(persistedWorkspacePreset, { strict: false });
      if (!normalizedPreset) {
        continue;
      }
      workspacePresets.set(normalizedPreset.id, normalizedPreset);
    }
    cleanupLayoutProfiles();
    cleanupConnectionProfiles();
    cleanupWorkspacePresets();
    logDebug("runtime.restore.done", {
      restoredSessionCount: manager.list().length,
      unrestoredSessionCount: unrestoredSessions.size,
      restoredCustomCommandCount: customCommands.size,
      restoredDeckCount: decks.size,
      restoredConnectionProfileCount: connectionProfiles.size,
      restoredWorkspacePresetCount: workspacePresets.size
    });

    await new Promise((resolve) => {
      server.listen(config.port, resolve);
    });
    if (typeof config.onBeforeReady === "function") {
      await config.onBeforeReady();
    }
    startupWarmupGateReleased = true;
    reconcileStartupWarmup();
    await startupWarmupReadyPromise;
  }

  async function stopInternal() {
    isStopping = true;
    isReady = false;
    startupWarmupEnabled = false;
    startupWarmupGateReleased = false;
    clearStartupWarmupQuietTimer();
    if (typeof startupWarmupResolve === "function") {
      startupWarmupResolve();
    }
    startupWarmupResolve = null;
    clearInterval(heartbeat);
    clearInterval(guardrailTimer);
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    for (const ws of sockets) {
      ws.closeReasonHint = "server_shutdown";
      ws.terminate();
    }
    sockets.clear();
    wsServer.close();

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

    isStopped = true;
    isStopping = false;
    logDebug("runtime.stop.done", {});
  }

  async function stop() {
    if (isStopped) {
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
