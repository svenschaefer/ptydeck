import crypto from "node:crypto";
import { homedir } from "node:os";

import { ApiError } from "./errors.js";

const CUSTOM_COMMAND_KIND_VALUES = new Set(["plain", "template"]);
const CUSTOM_COMMAND_SCOPE_VALUES = new Set(["global", "project", "session"]);
const DEFAULT_CUSTOM_COMMAND_SCOPE = "project";
const CUSTOM_COMMAND_SCOPE_PRECEDENCE = Object.freeze({
  global: 100,
  project: 200,
  session: 300
});
const CUSTOM_COMMAND_NAME_LOCALE = "en-US";
const CUSTOM_COMMAND_TEMPLATE_PARAM_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const CUSTOM_COMMAND_TEMPLATE_VARIABLE_VALUES = new Set([
  "session.id",
  "session.name",
  "session.cwd",
  "session.note",
  "deck.id",
  "deck.name"
]);

const SESSION_KIND_LOCAL = "local";
const SESSION_KIND_SSH = "ssh";
const DEFAULT_SSH_CLIENT = "ssh";
const DEFAULT_SSH_PORT = 22;
const DEFAULT_DECK_ID = "default";
const DEFAULT_DECK_NAME = "Default";
const DECK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const DECK_NAME_MAX_LENGTH = 64;
const CONNECTION_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const CONNECTION_PROFILE_NAME_MAX_LENGTH = 64;
const LAYOUT_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const LAYOUT_PROFILE_NAME_MAX_LENGTH = 64;
const LAYOUT_PROFILE_FILTER_MAX_LENGTH = 256;
const CONTROL_PANE_POSITION_VALUES = new Set(["top", "bottom", "left", "right"]);
const CONTROL_PANE_DEFAULT_POSITION = "bottom";
const CONTROL_PANE_DEFAULT_SIZE = 240;
const CONTROL_PANE_MIN_SIZE = 120;
const CONTROL_PANE_MAX_SIZE = 960;
const WORKSPACE_PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const WORKSPACE_PRESET_NAME_MAX_LENGTH = 64;
const WORKSPACE_GROUP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const WORKSPACE_GROUP_NAME_MAX_LENGTH = 64;
const SPLIT_LAYOUT_PANE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const DEFAULT_SPLIT_LAYOUT_PANE_ID = "main";
const SHARE_LINK_ID_PATTERN = /^share-[a-f0-9]{24}$/;
const SHARE_LINK_TARGET_TYPE_SESSION = "session";
const SHARE_LINK_TARGET_TYPE_DECK = "deck";
const SHARE_LINK_TARGET_TYPE_VALUES = new Set([SHARE_LINK_TARGET_TYPE_SESSION, SHARE_LINK_TARGET_TYPE_DECK]);
const SHARE_LINK_PERMISSION_MODE_READ_ONLY = "read_only";
const DEFAULT_SHARE_LINK_TTL_SECONDS = 24 * 60 * 60;
const MAX_SHARE_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function normalizeSplitLayoutWeights(
  rawWeights,
  childCount,
  { strict = true, fieldPath = "layout.deckSplitLayouts.*.root.weights" } = {}
) {
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
    resolveSessionDeckId = null,
    normalizeDeckIdInput = (entry) => entry
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

export function createRuntimeLibraryNormalization(dependencies = {}) {
  const {
    decks = new Map(),
    layoutProfiles = new Map(),
    getDeckOrThrow = () => null,
    getApiSessionOrThrow = () => null,
    hasKnownSession = () => true,
    resolveSessionDeckId = () => DEFAULT_DECK_ID,
    normalizeSessionKind = () => SESSION_KIND_LOCAL,
    normalizeSessionStartupConfig = (value) => value,
    normalizeSessionRemoteConnection = (value) => value,
    normalizeSessionRemoteAuth = (value) => value,
    normalizeSessionThemeSlots = (value) => value,
    normalizeSessionTags = (value) => value,
    defaultLocalStartCwd = homedir(),
    nowFn = () => Date.now(),
    randomBytesImpl = crypto.randomBytes
  } = dependencies;

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

    const now = nowFn();
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
    const scopeCompare = String(a.scope || "").localeCompare(String(b.scope || ""), CUSTOM_COMMAND_NAME_LOCALE, {
      sensitivity: "base"
    });
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

  function buildDefaultDeck(now = nowFn()) {
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
    const now = nowFn();
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

  function normalizeConnectionProfileDeckId(value, { strict = true, hasKnownDeck = (deckId) => decks.has(deckId) } = {}) {
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
      defaultLocalStartCwd: localStartCwd = defaultLocalStartCwd,
      hasKnownDeck = (deckId) => decks.has(deckId)
    } = {}
  ) {
    let source = input;
    if (!isPlainObject(source)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'launch' must be an object.");
      }
      source = {};
    }
    const kind = normalizeSessionKind(source.kind, { strict });
    const startupConfig = normalizeSessionStartupConfig(
      {
        startCwd: source.startCwd !== undefined ? source.startCwd : source.cwd,
        startCommand: source.startCommand,
        env: source.env,
        fallbackCwd: kind === SESSION_KIND_SSH ? "~" : localStartCwd
      },
      { strict }
    );
    const remoteConnection = normalizeSessionRemoteConnection(source.remoteConnection, kind, { strict });
    const remoteAuth = normalizeSessionRemoteAuth(source.remoteAuth, kind, { strict });
    const themeSlots = normalizeSessionThemeSlots(source, { strict });
    const tags = normalizeSessionTags(source.tags, { strict });
    const deckId = normalizeConnectionProfileDeckId(source.deckId, { strict, hasKnownDeck });
    let shell = "";
    if (source.shell !== undefined && source.shell !== null && typeof source.shell !== "string") {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Field 'launch.shell' must be a string.");
      }
      shell = kind === SESSION_KIND_SSH ? DEFAULT_SSH_CLIENT : defaultShell;
    } else {
      shell = typeof source.shell === "string" && source.shell.trim()
        ? source.shell.trim()
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
      defaultLocalStartCwd: localStartCwd = defaultLocalStartCwd,
      hasKnownDeck = (deckId) => decks.has(deckId)
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
    const now = nowFn();
    const createdAt = Number.isInteger(input.createdAt) ? input.createdAt : now;
    const updatedAt = Number.isInteger(input.updatedAt) ? input.updatedAt : createdAt;
    const launchSource = isPlainObject(input.launch) ? input.launch : input;
    const launch = normalizeConnectionProfileLaunch(launchSource, {
      strict,
      defaultShell,
      defaultLocalStartCwd: localStartCwd,
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
      hasKnownSession: knownSessionLookup = hasKnownSession,
      resolveSessionDeckId: resolveDeckId = resolveSessionDeckId
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
      hasKnownSession: knownSessionLookup,
      resolveSessionDeckId: resolveDeckId,
      normalizeDeckIdInput
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
      hasKnownSession: knownSessionLookup = hasKnownSession,
      resolveSessionDeckId: resolveDeckId = resolveSessionDeckId
    } = {}
  ) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return null;
    }
    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (!id || !LAYOUT_PROFILE_ID_PATTERN.test(id)) {
      return null;
    }
    const now = nowFn();
    const createdAt = Number.isInteger(input.createdAt) ? input.createdAt : now;
    const updatedAt = Number.isInteger(input.updatedAt) ? input.updatedAt : createdAt;
    return {
      id,
      name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : id,
      createdAt,
      updatedAt,
      layout: normalizeLayoutProfileLayout(input.layout, { strict, hasKnownSession: knownSessionLookup, resolveSessionDeckId: resolveDeckId })
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

  function normalizeShareLinkTargetType(value, { strict = true } = {}) {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (SHARE_LINK_TARGET_TYPE_VALUES.has(normalized)) {
      return normalized;
    }
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'targetType' must be 'session' or 'deck'.");
    }
    return "";
  }

  function normalizeShareLinkTargetId(value, { strict = true } = {}) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized) {
      return normalized;
    }
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'targetId' must be a non-empty string.");
    }
    return "";
  }

  function normalizeShareLinkTtlSeconds(value, { strict = true } = {}) {
    if (value === undefined || value === null || value === "") {
      return DEFAULT_SHARE_LINK_TTL_SECONDS;
    }
    const normalized = Number(value);
    if (Number.isInteger(normalized) && normalized >= 60 && normalized <= MAX_SHARE_LINK_TTL_SECONDS) {
      return normalized;
    }
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'expiresInSeconds' must be an integer between 60 and ${MAX_SHARE_LINK_TTL_SECONDS}.`
      );
    }
    return DEFAULT_SHARE_LINK_TTL_SECONDS;
  }

  function buildShareLinkId() {
    return `share-${randomBytesImpl(12).toString("hex")}`;
  }

  function buildShareTokenId() {
    return randomBytesImpl(12).toString("base64url");
  }

  function normalizeShareLinkEntity(input, auth, { strict = true } = {}) {
    if (!isPlainObject(input)) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Body must be an object.");
      }
      return null;
    }
    const targetType = normalizeShareLinkTargetType(input.targetType, { strict });
    const targetId = normalizeShareLinkTargetId(input.targetId, { strict });
    if (!targetType || !targetId) {
      return null;
    }
    if (targetType === SHARE_LINK_TARGET_TYPE_SESSION) {
      getApiSessionOrThrow(targetId);
    } else {
      getDeckOrThrow(targetId);
    }
    const ttlSeconds = normalizeShareLinkTtlSeconds(input.expiresInSeconds, { strict });
    const now = nowFn();
    return {
      id: buildShareLinkId(),
      targetType,
      targetId,
      permissionMode: SHARE_LINK_PERMISSION_MODE_READ_ONLY,
      tokenId: buildShareTokenId(),
      creatorSubject: typeof auth?.subject === "string" ? auth.subject : "",
      creatorTenantId: typeof auth?.tenantId === "string" ? auth.tenantId : "",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + (ttlSeconds * 1000),
      revokedAt: null
    };
  }

  function normalizePersistedShareLinkEntity(input, { strict = true } = {}) {
    if (
      !isPlainObject(input) ||
      typeof input.id !== "string" ||
      !SHARE_LINK_ID_PATTERN.test(input.id) ||
      !SHARE_LINK_TARGET_TYPE_VALUES.has(input.targetType) ||
      typeof input.targetId !== "string" ||
      !input.targetId ||
      input.permissionMode !== SHARE_LINK_PERMISSION_MODE_READ_ONLY ||
      typeof input.tokenId !== "string" ||
      !input.tokenId ||
      !Number.isInteger(input.createdAt) ||
      !Number.isInteger(input.updatedAt) ||
      !Number.isInteger(input.expiresAt)
    ) {
      if (strict) {
        throw new ApiError(400, "ValidationError", "Persisted share link entry is invalid.");
      }
      return null;
    }
    return {
      id: input.id,
      targetType: input.targetType,
      targetId: input.targetId,
      permissionMode: SHARE_LINK_PERMISSION_MODE_READ_ONLY,
      tokenId: input.tokenId,
      creatorSubject: typeof input.creatorSubject === "string" ? input.creatorSubject : "",
      creatorTenantId: typeof input.creatorTenantId === "string" ? input.creatorTenantId : "",
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      expiresAt: input.expiresAt,
      revokedAt: Number.isInteger(input.revokedAt) ? input.revokedAt : null
    };
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
      resolveSessionDeckId,
      normalizeDeckIdInput
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
    const now = nowFn();
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

  return Object.freeze({
    buildCustomCommandEntry,
    buildCustomCommandKey,
    buildDefaultDeck,
    compareConnectionProfileEntries,
    compareCustomCommandEntries,
    compareDeckEntries,
    compareLayoutProfileEntries,
    compareWorkspacePresetEntries,
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
  });
}
