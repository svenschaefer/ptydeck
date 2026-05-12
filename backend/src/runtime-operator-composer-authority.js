import { ApiError } from "./errors.js";
import { createSessionControlPrincipal } from "./session-control-state.js";

const COMPOSER_PLACEMENT_MODE_VALUES = new Set(["shared-footer", "active-overlay"]);
const DEFAULT_COMPOSER_PLACEMENT_MODE = "shared-footer";
const MAX_COMPOSER_DRAFT_LENGTH = 65536;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createOperatorClientRequiredError() {
  return new ApiError(
    409,
    "OperatorClientRequired",
    "This action requires the active operator client id. Reconnect the session UI and retry."
  );
}

function normalizeComposerPlacementMode(value, { strict = true, fieldPath = "mode" } = {}) {
  if (value === undefined) {
    return DEFAULT_COMPOSER_PLACEMENT_MODE;
  }
  const normalized = normalizeText(value).toLowerCase();
  if (!COMPOSER_PLACEMENT_MODE_VALUES.has(normalized)) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field '${fieldPath}' must be one of: shared-footer, active-overlay.`
      );
    }
    return DEFAULT_COMPOSER_PLACEMENT_MODE;
  }
  return normalized;
}

function normalizeComposerDraft(value, fieldPath, { strict = true } = {}) {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string") {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be a string.`);
    }
    return "";
  }
  if (value.length > MAX_COMPOSER_DRAFT_LENGTH) {
    if (strict) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field '${fieldPath}' must not exceed ${MAX_COMPOSER_DRAFT_LENGTH} characters.`
      );
    }
    return value.slice(0, MAX_COMPOSER_DRAFT_LENGTH);
  }
  return value;
}

function normalizeKnownSessionId(value, fieldPath, { strict = true, hasKnownSession = () => false } = {}) {
  if (typeof value !== "string") {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be a string.`);
    }
    return "";
  }
  const normalized = value.trim();
  if (!normalized) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be a non-empty string.`);
    }
    return "";
  }
  if (!hasKnownSession(normalized)) {
    if (strict) {
      throw new ApiError(404, "SessionNotFound", `Session '${normalized}' was not found.`);
    }
    return "";
  }
  return normalized;
}

function normalizePinnedSessionIds(value, options = {}) {
  const { strict = true, fieldPath = "pinnedSessionIds" } = options;
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be an array of session ids.`);
    }
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    const sessionId = normalizeKnownSessionId(value[index], `${fieldPath}[${index}]`, options);
    if (!sessionId || seen.has(sessionId)) {
      continue;
    }
    seen.add(sessionId);
    normalized.push(sessionId);
  }
  return normalized;
}

function normalizePinnedDrafts(value, options = {}) {
  const { strict = true, fieldPath = "pinnedDrafts" } = options;
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", `Field '${fieldPath}' must be an object.`);
    }
    return {};
  }
  const normalized = {};
  for (const [rawSessionId, rawDraft] of Object.entries(value)) {
    const sessionId = normalizeKnownSessionId(rawSessionId, `${fieldPath}.${rawSessionId}`, options);
    if (!sessionId) {
      continue;
    }
    normalized[sessionId] = normalizeComposerDraft(rawDraft, `${fieldPath}.${sessionId}`, options);
  }
  return normalized;
}

function filterPinnedDraftsByPinnedSessionIds(pinnedDrafts, pinnedSessionIds) {
  const allowedSessionIds = new Set(Array.isArray(pinnedSessionIds) ? pinnedSessionIds : []);
  const candidateDrafts = isPlainObject(pinnedDrafts) ? pinnedDrafts : {};
  const normalized = {};
  for (const [sessionId, draft] of Object.entries(candidateDrafts)) {
    if (!allowedSessionIds.has(sessionId)) {
      continue;
    }
    normalized[sessionId] = draft;
  }
  return normalized;
}

function normalizePrincipalFields(value) {
  const principal = createSessionControlPrincipal(value);
  return {
    subject: normalizeText(principal.subject),
    tenantId: normalizeText(principal.tenantId),
    accessMode: normalizeText(principal.accessMode),
    permissionMode: normalizeText(principal.permissionMode)
  };
}

export function normalizePersistedOperatorComposerPlacementEntry(
  value,
  { strict = true, hasKnownSession = () => false, getAttachmentKey = () => "" } = {}
) {
  if (!isPlainObject(value)) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Operator composer placement entry must be an object.");
    }
    return null;
  }
  const clientId = normalizeText(value.clientId);
  if (!clientId) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'clientId' must be a non-empty string.");
    }
    return null;
  }
  const principal = normalizePrincipalFields(value);
  const attachmentKey =
    normalizeText(value.attachmentKey) ||
    normalizeText(
      getAttachmentKey({
        clientId,
        principal,
        auth: principal
      })
    );
  if (!attachmentKey) {
    if (strict) {
      throw new ApiError(400, "ValidationError", "Field 'attachmentKey' must be a non-empty string.");
    }
    return null;
  }
  const pinnedSessionIds = normalizePinnedSessionIds(value.pinnedSessionIds, {
    strict,
    fieldPath: "pinnedSessionIds",
    hasKnownSession
  });
  const pinnedDrafts = filterPinnedDraftsByPinnedSessionIds(
    normalizePinnedDrafts(value.pinnedDrafts, {
      strict,
      fieldPath: "pinnedDrafts",
      hasKnownSession
    }),
    pinnedSessionIds
  );
  return {
    attachmentKey,
    clientId,
    ...principal,
    mode: normalizeComposerPlacementMode(value.mode, { strict, fieldPath: "mode" }),
    pinnedSessionIds,
    sharedDraft: normalizeComposerDraft(value.sharedDraft, "sharedDraft", { strict }),
    pinnedDrafts
  };
}

export function createRuntimeOperatorComposerAuthority(dependencies = {}) {
  const {
    operatorComposerPlacements = new Map(),
    sessionControlAttachmentRegistry = {
      getAttachmentKey: () => ""
    },
    sessionControlClientIdHeader = "x-ptydeck-client-id",
    hasKnownSession = () => false
  } = dependencies;

  function readRequestedClientId(req = null) {
    const headerValue = req?.headers?.[sessionControlClientIdHeader];
    return Array.isArray(headerValue)
      ? normalizeText(headerValue[0])
      : normalizeText(headerValue);
  }

  function getAttachmentKeyForClient(auth = null, clientId = "") {
    const normalizedClientId = normalizeText(clientId);
    if (!normalizedClientId) {
      return "";
    }
    return normalizeText(
      sessionControlAttachmentRegistry.getAttachmentKey({
        clientId: normalizedClientId,
        auth
      })
    );
  }

  function buildApiState(entry, clientId = "") {
    const pinnedSessionIds = normalizePinnedSessionIds(entry?.pinnedSessionIds, {
      strict: false,
      hasKnownSession
    });
    const normalizedClientId = normalizeText(clientId || entry?.clientId);
    return {
      clientId: normalizedClientId,
      mode: normalizeComposerPlacementMode(entry?.mode, { strict: false }),
      pinnedSessionIds,
      sharedDraft: normalizeComposerDraft(entry?.sharedDraft, "sharedDraft", { strict: false }),
      pinnedDrafts: filterPinnedDraftsByPinnedSessionIds(
        normalizePinnedDrafts(entry?.pinnedDrafts, {
          strict: false,
          hasKnownSession
        }),
        pinnedSessionIds
      )
    };
  }

  function getStateForClient(auth = null, clientId = "") {
    const normalizedClientId = normalizeText(clientId);
    if (!normalizedClientId) {
      return buildApiState(null, "");
    }
    const attachmentKey = getAttachmentKeyForClient(auth, normalizedClientId);
    if (!attachmentKey) {
      return buildApiState(null, normalizedClientId);
    }
    return buildApiState(operatorComposerPlacements.get(attachmentKey) || null, normalizedClientId);
  }

  function requireClientContext(auth = null, req = null) {
    const clientId = readRequestedClientId(req);
    if (!clientId) {
      throw createOperatorClientRequiredError();
    }
    const attachmentKey = getAttachmentKeyForClient(auth, clientId);
    if (!attachmentKey) {
      throw createOperatorClientRequiredError();
    }
    const principal = normalizePrincipalFields(auth);
    return {
      clientId,
      attachmentKey,
      principal
    };
  }

  function getStateOrThrow(auth = null, req = null) {
    const { clientId } = requireClientContext(auth, req);
    return getStateForClient(auth, clientId);
  }

  function updateStateOrThrow(body = {}, auth = null, req = null) {
    const { clientId, attachmentKey, principal } = requireClientContext(auth, req);
    const current = operatorComposerPlacements.get(attachmentKey) || {
      attachmentKey,
      clientId,
      ...principal,
      mode: DEFAULT_COMPOSER_PLACEMENT_MODE,
      pinnedSessionIds: [],
      sharedDraft: "",
      pinnedDrafts: {}
    };
    const next = {
      ...current,
      attachmentKey,
      clientId,
      ...principal,
      ...(body.mode !== undefined
        ? { mode: normalizeComposerPlacementMode(body.mode, { strict: true, fieldPath: "mode" }) }
        : {}),
      ...(body.pinnedSessionIds !== undefined
        ? {
            pinnedSessionIds: normalizePinnedSessionIds(body.pinnedSessionIds, {
              strict: true,
              fieldPath: "pinnedSessionIds",
              hasKnownSession
            })
          }
        : {}),
      ...(body.sharedDraft !== undefined
        ? { sharedDraft: normalizeComposerDraft(body.sharedDraft, "sharedDraft", { strict: true }) }
        : {}),
      ...(body.pinnedDrafts !== undefined
        ? {
            pinnedDrafts: normalizePinnedDrafts(body.pinnedDrafts, {
              strict: true,
              fieldPath: "pinnedDrafts",
              hasKnownSession
            })
          }
        : {})
    };
    const normalized = normalizePersistedOperatorComposerPlacementEntry(next, {
      strict: true,
      hasKnownSession,
      getAttachmentKey: ({ clientId: nextClientId, principal: nextPrincipal, auth: nextAuth }) =>
        sessionControlAttachmentRegistry.getAttachmentKey({
          clientId: nextClientId,
          auth: nextAuth || nextPrincipal
        })
    });
    operatorComposerPlacements.set(attachmentKey, normalized);
    return buildApiState(normalized, clientId);
  }

  function cleanupSessionState(sessionId) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId) {
      return false;
    }
    let changed = false;
    for (const [attachmentKey, entry] of operatorComposerPlacements.entries()) {
      const nextPinnedSessionIds = Array.isArray(entry?.pinnedSessionIds)
        ? entry.pinnedSessionIds.filter((candidate) => candidate !== normalizedSessionId)
        : [];
      const nextPinnedDrafts = { ...(isPlainObject(entry?.pinnedDrafts) ? entry.pinnedDrafts : {}) };
      delete nextPinnedDrafts[normalizedSessionId];
      if (
        nextPinnedSessionIds.length === (Array.isArray(entry?.pinnedSessionIds) ? entry.pinnedSessionIds.length : 0) &&
        Object.keys(nextPinnedDrafts).length === Object.keys(isPlainObject(entry?.pinnedDrafts) ? entry.pinnedDrafts : {}).length
      ) {
        continue;
      }
      operatorComposerPlacements.set(attachmentKey, {
        ...entry,
        pinnedSessionIds: nextPinnedSessionIds,
        pinnedDrafts: nextPinnedDrafts
      });
      changed = true;
    }
    return changed;
  }

  function listPersistedOperatorComposerPlacements() {
    return Array.from(operatorComposerPlacements.values())
      .map((entry) =>
        normalizePersistedOperatorComposerPlacementEntry(entry, {
          strict: false,
          hasKnownSession,
          getAttachmentKey: ({ clientId, principal, auth }) =>
            sessionControlAttachmentRegistry.getAttachmentKey({
              clientId,
              auth: auth || principal
            })
        })
      )
      .filter(Boolean)
      .sort((left, right) =>
        [
          left.subject,
          left.tenantId,
          left.accessMode,
          left.permissionMode,
          left.clientId
        ].join("\u001f").localeCompare(
          [right.subject, right.tenantId, right.accessMode, right.permissionMode, right.clientId].join("\u001f"),
          "en-US",
          { sensitivity: "base" }
        )
      );
  }

  return {
    cleanupSessionState,
    getStateForClient,
    getStateOrThrow,
    listPersistedOperatorComposerPlacements,
    updateStateOrThrow
  };
}
