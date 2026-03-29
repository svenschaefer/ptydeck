import crypto from "node:crypto";
import { ApiError } from "./errors.js";

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signInput(input, secret) {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

function parseAuthHeader(headerValue) {
  if (typeof headerValue !== "string") {
    return "";
  }
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function normalizeScopes(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

export function createDevToken({
  secret,
  issuer,
  audience,
  subject = "dev-user",
  tenantId = "dev",
  scopes = [],
  ttlSeconds = 900,
  extraClaims = {}
}) {
  const now = Math.floor(Date.now() / 1000);
  const normalizedScopes = normalizeScopes(scopes);
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const payload = {
    iss: issuer,
    aud: audience,
    sub: subject,
    tenantId,
    scope: normalizedScopes.join(" "),
    iat: now,
    exp: now + ttlSeconds,
    ...(extraClaims && typeof extraClaims === "object" && !Array.isArray(extraClaims) ? extraClaims : {})
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = signInput(input, secret);
  return `${input}.${signature}`;
}

export function verifyDevToken(token, { secret, issuer, audience }) {
  if (!token) {
    throw new ApiError(401, "Unauthorized", "Missing bearer token.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new ApiError(401, "Unauthorized", "Invalid bearer token format.");
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  const expectedSignature = signInput(`${encodedHeader}.${encodedPayload}`, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new ApiError(401, "Unauthorized", "Invalid bearer token signature.");
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new ApiError(401, "Unauthorized", "Invalid bearer token payload.");
  }

  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new ApiError(401, "Unauthorized", "Unsupported bearer token header.");
  }
  if (payload.iss !== issuer || payload.aud !== audience) {
    throw new ApiError(401, "Unauthorized", "Invalid bearer token issuer or audience.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(payload.exp) || payload.exp <= now) {
    throw new ApiError(401, "Unauthorized", "Bearer token expired.");
  }

  return {
    subject: typeof payload.sub === "string" ? payload.sub : "",
    tenantId: typeof payload.tenantId === "string" ? payload.tenantId : "",
    scopes: normalizeScopes(payload.scope),
    accessMode: typeof payload.accessMode === "string" ? payload.accessMode : "operator",
    permissionMode: typeof payload.permissionMode === "string" ? payload.permissionMode : "",
    shareLinkId: typeof payload.shareLinkId === "string" ? payload.shareLinkId : "",
    shareTargetType: typeof payload.shareTargetType === "string" ? payload.shareTargetType : "",
    shareTargetId: typeof payload.shareTargetId === "string" ? payload.shareTargetId : "",
    shareTokenId: typeof payload.shareTokenId === "string" ? payload.shareTokenId : ""
  };
}

export function resolveBearerToken(req, parsedUrl) {
  void parsedUrl;
  return parseAuthHeader(req.headers.authorization);
}

export function ensureScope(auth, requiredScope) {
  if (!requiredScope) {
    return;
  }
  const scopes = Array.isArray(auth?.scopes) ? auth.scopes : [];
  if (!scopes.includes(requiredScope)) {
    throw new ApiError(403, "Forbidden", `Missing required scope: ${requiredScope}.`);
  }
}
