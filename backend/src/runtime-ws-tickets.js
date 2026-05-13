import crypto from "node:crypto";
import { ApiError } from "./errors.js";

function normalizeSessionControlTicketAuth(auth, requestedClientId, requestedLabel) {
  const normalizedAuth =
    auth && typeof auth === "object" && !Array.isArray(auth)
      ? auth
      : {
          subject: "local-operator",
          tenantId: "default",
          scopes: [],
          accessMode: "operator",
          permissionMode: "",
          shareLinkId: "",
          shareTargetType: "",
          shareTargetId: "",
          shareTokenId: ""
        };
  return {
    subject: normalizedAuth.subject,
    tenantId: normalizedAuth.tenantId,
    scopes: Array.isArray(normalizedAuth.scopes) ? normalizedAuth.scopes.slice() : [],
    accessMode: typeof normalizedAuth.accessMode === "string" ? normalizedAuth.accessMode : "operator",
    permissionMode: typeof normalizedAuth.permissionMode === "string" ? normalizedAuth.permissionMode : "",
    shareLinkId: typeof normalizedAuth.shareLinkId === "string" ? normalizedAuth.shareLinkId : "",
    shareTargetType: typeof normalizedAuth.shareTargetType === "string" ? normalizedAuth.shareTargetType : "",
    shareTargetId: typeof normalizedAuth.shareTargetId === "string" ? normalizedAuth.shareTargetId : "",
    shareTokenId: typeof normalizedAuth.shareTokenId === "string" ? normalizedAuth.shareTokenId : "",
    sessionControlClientId: requestedClientId || "",
    sessionControlClientLabel: requestedLabel || ""
  };
}

export function normalizeWsDisconnectReason(code, wsReasonText, wsReasonHint) {
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

export function createRuntimeWsTicketRegistry({
  ttlSeconds,
  normalizeSessionControlClientLabel,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes
}) {
  const ticketTtlSeconds = Number.isInteger(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 1;
  const normalizeLabel =
    typeof normalizeSessionControlClientLabel === "function"
      ? normalizeSessionControlClientLabel
      : () => "";
  const wsTickets = new Map();

  function pruneExpired(nowMs = now()) {
    for (const [ticket, entry] of wsTickets.entries()) {
      if (entry.expiresAt <= nowMs) {
        wsTickets.delete(ticket);
      }
    }
  }

  function issue(auth, input = {}) {
    pruneExpired();
    const requestedClientId = typeof input?.clientId === "string" ? input.clientId.trim() : "";
    const requestedLabel = normalizeLabel(input?.label);
    const ticket = randomBytes(24).toString("base64url");
    wsTickets.set(ticket, {
      expiresAt: now() + (ticketTtlSeconds * 1000),
      auth: normalizeSessionControlTicketAuth(auth, requestedClientId, requestedLabel)
    });
    return {
      ticket,
      tokenType: "WsTicket",
      expiresIn: ticketTtlSeconds
    };
  }

  function consume(ticket) {
    pruneExpired();
    const normalizedTicket = typeof ticket === "string" ? ticket.trim() : "";
    if (!normalizedTicket) {
      throw new ApiError(401, "Unauthorized", "Missing WebSocket ticket.");
    }
    const entry = wsTickets.get(normalizedTicket);
    if (!entry) {
      throw new ApiError(401, "Unauthorized", "Invalid or expired WebSocket ticket.");
    }
    wsTickets.delete(normalizedTicket);
    return entry.auth;
  }

  function size() {
    return wsTickets.size;
  }

  return {
    consume,
    issue,
    pruneExpired,
    size
  };
}
