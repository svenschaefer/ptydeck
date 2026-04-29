import crypto from "node:crypto";
import { ApiError } from "./errors.js";

function normalizeSessionControlTicketAuth(auth, requestedClientId, requestedLabel) {
  return {
    subject: auth.subject,
    tenantId: auth.tenantId,
    scopes: Array.isArray(auth.scopes) ? auth.scopes.slice() : [],
    accessMode: typeof auth.accessMode === "string" ? auth.accessMode : "operator",
    permissionMode: typeof auth.permissionMode === "string" ? auth.permissionMode : "",
    shareLinkId: typeof auth.shareLinkId === "string" ? auth.shareLinkId : "",
    shareTargetType: typeof auth.shareTargetType === "string" ? auth.shareTargetType : "",
    shareTargetId: typeof auth.shareTargetId === "string" ? auth.shareTargetId : "",
    shareTokenId: typeof auth.shareTokenId === "string" ? auth.shareTokenId : "",
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
