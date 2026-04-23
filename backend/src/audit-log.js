import { appendFile } from "node:fs/promises";

const AUDIT_ACTION_BY_ROUTE_KIND = Object.freeze({
  createSession: "session.create",
  deleteSession: "session.delete",
  input: "session.input",
  resize: "session.resize"
});

const AUTH_FAILURE_STATUSES = new Set([401, 403]);
const DENIED_STATUSES = new Set([401, 403, 426, 429]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatusCode(value) {
  return Number.isInteger(value) && value >= 100 && value <= 999 ? value : 0;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())))
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

function withoutEmptyFields(value) {
  const normalized = {};
  for (const [key, entry] of Object.entries(value || {})) {
    if (entry === "" || entry === null || entry === undefined) {
      continue;
    }
    if (Array.isArray(entry) && entry.length === 0) {
      continue;
    }
    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      Object.keys(entry).length === 0
    ) {
      continue;
    }
    normalized[key] = entry;
  }
  return normalized;
}

function normalizeAuditMetadata(metadata) {
  const normalized = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) {
        normalized[key] = text;
      }
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      normalized[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      normalized[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const entries = value
        .filter((entry) => typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")
        .map((entry) => (typeof entry === "string" ? entry.trim() : entry))
        .filter((entry) => entry !== "");
      if (entries.length > 0) {
        normalized[key] = entries;
      }
    }
  }
  return normalized;
}

export function outcomeForStatusCode(statusCode) {
  const normalizedStatus = normalizeStatusCode(statusCode);
  if (!normalizedStatus || normalizedStatus < 400) {
    return "success";
  }
  if (DENIED_STATUSES.has(normalizedStatus)) {
    return "denied";
  }
  return "failure";
}

export function actionForHttpAuditRoute({ routeKind, statusCode }) {
  const normalizedRouteKind = normalizeText(routeKind);
  if (AUDIT_ACTION_BY_ROUTE_KIND[normalizedRouteKind]) {
    return AUDIT_ACTION_BY_ROUTE_KIND[normalizedRouteKind];
  }
  if (AUTH_FAILURE_STATUSES.has(normalizeStatusCode(statusCode)) && normalizedRouteKind && normalizedRouteKind !== "notFound") {
    return "auth.failure";
  }
  return "";
}

export function normalizeAuditActor(auth, { authEnabled = false } = {}) {
  const subject = normalizeText(auth?.subject) || (authEnabled ? "anonymous" : "local-operator");
  return withoutEmptyFields({
    subject,
    accessMode: normalizeText(auth?.accessMode) || (authEnabled ? "unknown" : "operator"),
    permissionMode: normalizeText(auth?.permissionMode),
    shareLinkId: normalizeText(auth?.shareLinkId),
    shareTargetType: normalizeText(auth?.shareTargetType),
    shareTargetId: normalizeText(auth?.shareTargetId),
    scopes: normalizeStringArray(auth?.scopes)
  });
}

export function createHttpAuditEvent({
  auth = null,
  authEnabled = false,
  errorCode = "",
  metadata = {},
  method = "",
  params = {},
  pathname = "",
  requestContext = null,
  routeKind = "",
  statusCode = 0,
  target = {},
  traceContext = null
} = {}) {
  const normalizedStatus = normalizeStatusCode(statusCode);
  const action = actionForHttpAuditRoute({ routeKind, statusCode: normalizedStatus });
  if (!action) {
    return null;
  }
  const targetSessionId = normalizeText(target?.sessionId) || normalizeText(params?.sessionId);
  const normalizedMetadata = normalizeAuditMetadata({
    ...metadata,
    ...(action === "auth.failure" && routeKind ? { routeKind } : {})
  });
  const event = {
    auditVersion: 1,
    event: "audit.event",
    action,
    outcome: outcomeForStatusCode(normalizedStatus),
    actor: normalizeAuditActor(auth, { authEnabled }),
    target: withoutEmptyFields({
      sessionId: targetSessionId
    }),
    http: withoutEmptyFields({
      method: normalizeText(method).toUpperCase(),
      pathname: normalizeText(pathname),
      statusCode: normalizedStatus,
      clientIp: normalizeText(requestContext?.clientIp),
      protocol: normalizeText(requestContext?.protocol),
      trustedProxy: normalizeBoolean(requestContext?.trustedProxy)
    }),
    trace: withoutEmptyFields({
      traceId: normalizeText(traceContext?.traceId),
      correlationId: normalizeText(traceContext?.correlationId),
      requestId: normalizeText(traceContext?.requestId)
    }),
    metadata: normalizedMetadata
  };
  if (normalizeText(errorCode) && normalizedStatus >= 400) {
    event.error = {
      code: normalizeText(errorCode)
    };
  }
  return withoutEmptyFields(event);
}

export function createAuditLogger({
  appendFileImpl = appendFile,
  enabled = false,
  filePath = "",
  now = () => new Date().toISOString(),
  service = "ptydeck-backend",
  stdout = (line) => console.log(line)
} = {}) {
  const normalizedFilePath = normalizeText(filePath);
  const active = Boolean(enabled || normalizedFilePath);

  async function write(event) {
    if (!active || !event) {
      return false;
    }
    const line = JSON.stringify({
      ts: now(),
      service,
      ...event
    });
    try {
      if (normalizedFilePath) {
        await appendFileImpl(normalizedFilePath, `${line}\n`, "utf8");
        return true;
      }
      stdout(line);
      return true;
    } catch {
      return false;
    }
  }

  return {
    active,
    write
  };
}
