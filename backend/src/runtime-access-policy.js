import { ApiError } from "./errors.js";

const DEFAULT_ALLOWED_SPECTATOR_ROUTE_KINDS = new Set(["listSessions", "getSession", "listDecks", "getDeck", "wsTicket"]);
const DEFAULT_WS_AUTH_PROTOCOL_PREFIX = "ptydeck.auth.";
const DEFAULT_WS_TRUSTED_LOCAL_CLIENT_PROTOCOL_PREFIX = "ptydeck.client.";

function parseRequestedProtocols(headerValue) {
  if (typeof headerValue !== "string" || !headerValue.trim()) {
    return [];
  }
  return headerValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function decodeBase64UrlUtf8(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  const normalized = value.trim().replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = `${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`;
  return Buffer.from(padded, "base64").toString("utf8");
}

export function createRuntimeAccessPolicy(dependencies = {}) {
  const {
    shareLinks = new Map(),
    shareLinkPermissionModeReadOnly = "read_only",
    allowedSpectatorRouteKinds = DEFAULT_ALLOWED_SPECTATOR_ROUTE_KINDS,
    wsAuthProtocolPrefix = DEFAULT_WS_AUTH_PROTOCOL_PREFIX,
    wsTrustedLocalClientProtocolPrefix = DEFAULT_WS_TRUSTED_LOCAL_CLIENT_PROTOCOL_PREFIX,
    now = () => Date.now()
  } = dependencies;

  function isSpectatorAuth(auth) {
    return Boolean(
      auth &&
      auth.accessMode === "spectator" &&
      auth.permissionMode === shareLinkPermissionModeReadOnly &&
      typeof auth.shareLinkId === "string" &&
      auth.shareLinkId
    );
  }

  function getShareLinkOrThrow(shareId) {
    const normalizedShareId = typeof shareId === "string" ? shareId.trim() : "";
    const shareLink = shareLinks.get(normalizedShareId);
    if (!shareLink) {
      throw new ApiError(404, "ShareLinkNotFound", `Share link '${normalizedShareId}' was not found.`);
    }
    return shareLink;
  }

  function ensureShareLinkAuthActive(auth) {
    if (!isSpectatorAuth(auth)) {
      return null;
    }
    const shareLink = getShareLinkOrThrow(auth.shareLinkId);
    if (shareLink.permissionMode !== shareLinkPermissionModeReadOnly) {
      throw new ApiError(403, "Forbidden", "Share link permission mode is not supported.");
    }
    if (shareLink.revokedAt) {
      throw new ApiError(403, "Forbidden", "Share link has been revoked.");
    }
    if (shareLink.expiresAt <= now()) {
      throw new ApiError(403, "Forbidden", "Share link has expired.");
    }
    if (shareLink.tokenId !== auth.shareTokenId) {
      throw new ApiError(403, "Forbidden", "Share link token is no longer active.");
    }
    if (shareLink.targetType !== auth.shareTargetType || shareLink.targetId !== auth.shareTargetId) {
      throw new ApiError(403, "Forbidden", "Share link target does not match token claims.");
    }
    return shareLink;
  }

  function ensureShareRouteAllowed(auth, kind) {
    if (!isSpectatorAuth(auth)) {
      return;
    }
    if (allowedSpectatorRouteKinds.has(kind)) {
      return;
    }
    throw new ApiError(403, "Forbidden", "Read-only spectator access does not allow this action.");
  }

  function resolveWsTicketFromProtocols(request) {
    const protocols = parseRequestedProtocols(request?.headers?.["sec-websocket-protocol"]);
    for (const protocol of protocols) {
      if (protocol.startsWith(wsAuthProtocolPrefix)) {
        return protocol.slice(wsAuthProtocolPrefix.length);
      }
    }
    return "";
  }

  function resolveTrustedLocalWsClientMetadataFromProtocols(request) {
    const protocols = parseRequestedProtocols(request?.headers?.["sec-websocket-protocol"]);
    for (const protocol of protocols) {
      if (!protocol.startsWith(wsTrustedLocalClientProtocolPrefix)) {
        continue;
      }
      try {
        const rawPayload = decodeBase64UrlUtf8(protocol.slice(wsTrustedLocalClientProtocolPrefix.length));
        const parsed = JSON.parse(rawPayload);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          continue;
        }
        const clientId = typeof parsed.clientId === "string" ? parsed.clientId.trim() : "";
        const label = typeof parsed.label === "string" ? parsed.label.trim() : "";
        if (!clientId) {
          continue;
        }
        return {
          clientId,
          ...(label ? { label } : {})
        };
      } catch {
        continue;
      }
    }
    return null;
  }

  return {
    ensureShareLinkAuthActive,
    ensureShareRouteAllowed,
    getShareLinkOrThrow,
    isSpectatorAuth,
    resolveTrustedLocalWsClientMetadataFromProtocols,
    resolveWsTicketFromProtocols
  };
}
