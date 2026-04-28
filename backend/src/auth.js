import crypto from "node:crypto";
import { ApiError } from "./errors.js";

const INTERNAL_BEARER_ALGORITHM = "HS256";
const INTERNAL_BEARER_TYPE = "JWT";
const OIDC_DISCOVERY_PATH = "/.well-known/openid-configuration";
const OIDC_ALLOWED_TYPE_VALUES = new Set(["jwt", "at+jwt"]);
const OIDC_SCOPE_CLAIM_KEYS = ["scope", "scp", "permissions"];
const OIDC_DEFAULT_CACHE_TTL_MS = 300_000;
const RSA_PSS_DIGEST_SALT_LENGTH = crypto.constants.RSA_PSS_SALTLEN_DIGEST;
const SIGNATURE_ALGORITHM_MAP = Object.freeze({
  RS256: { algorithm: "RSA-SHA256" },
  RS384: { algorithm: "RSA-SHA384" },
  RS512: { algorithm: "RSA-SHA512" },
  PS256: {
    algorithm: "RSA-SHA256",
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: RSA_PSS_DIGEST_SALT_LENGTH
  },
  PS384: {
    algorithm: "RSA-SHA384",
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: RSA_PSS_DIGEST_SALT_LENGTH
  },
  PS512: {
    algorithm: "RSA-SHA512",
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: RSA_PSS_DIGEST_SALT_LENGTH
  },
  ES256: { algorithm: "sha256" },
  ES384: { algorithm: "sha384" },
  ES512: { algorithm: "sha512" },
  EdDSA: { algorithm: null }
});

function unauthorized(message) {
  return new ApiError(401, "Unauthorized", message);
}

function authProviderUnavailable(message) {
  return new ApiError(503, "AuthProviderUnavailable", message);
}

function currentEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecodeUtf8(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function base64UrlDecodeBuffer(value) {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw unauthorized("Invalid bearer token signature encoding.");
  }
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

function normalizeScopeArray(scopes) {
  const seen = new Set();
  const normalized = [];
  for (const entry of scopes) {
    const value = typeof entry === "string" ? entry.trim() : "";
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

export function normalizeScopes(value) {
  if (Array.isArray(value)) {
    return normalizeScopeArray(value);
  }
  if (typeof value === "string" && value.trim()) {
    return normalizeScopeArray(value.split(/\s+/));
  }
  return [];
}

function normalizeScopeClaims(payload) {
  const collected = [];
  for (const key of OIDC_SCOPE_CLAIM_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) {
      continue;
    }
    collected.push(...normalizeScopes(payload[key]));
  }
  return normalizeScopeArray(collected);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTenantId(payload, fallbackValue) {
  const directTenantId = normalizeText(payload?.tenantId);
  if (directTenantId) {
    return directTenantId;
  }
  const underscoredTenantId = normalizeText(payload?.tenant_id);
  if (underscoredTenantId) {
    return underscoredTenantId;
  }
  const shortTenantId = normalizeText(payload?.tid);
  if (shortTenantId) {
    return shortTenantId;
  }
  return normalizeText(fallbackValue);
}

function normalizeAuthPrincipal(payload, { defaultTenantId = "" } = {}) {
  const subject = normalizeText(payload?.sub);
  if (!subject) {
    throw unauthorized("Bearer token subject is missing.");
  }
  return {
    subject,
    tenantId: normalizeTenantId(payload, defaultTenantId),
    scopes: normalizeScopeClaims(payload),
    accessMode: normalizeText(payload?.accessMode) || "operator",
    permissionMode: normalizeText(payload?.permissionMode),
    shareLinkId: normalizeText(payload?.shareLinkId),
    shareTargetType: normalizeText(payload?.shareTargetType),
    shareTargetId: normalizeText(payload?.shareTargetId),
    shareTokenId: normalizeText(payload?.shareTokenId)
  };
}

function audienceMatches(candidate, expectedAudience) {
  if (typeof expectedAudience !== "string" || !expectedAudience.trim()) {
    return false;
  }
  if (typeof candidate === "string") {
    return candidate === expectedAudience;
  }
  if (Array.isArray(candidate)) {
    return candidate.some((entry) => entry === expectedAudience);
  }
  return false;
}

function validateIssuerAndAudience(payload, { issuer, audience }) {
  if (normalizeText(payload?.iss) !== normalizeText(issuer) || !audienceMatches(payload?.aud, audience)) {
    throw unauthorized("Invalid bearer token issuer or audience.");
  }
}

function validateTemporalClaims(payload, { nowSeconds = currentEpochSeconds } = {}) {
  const now = nowSeconds();
  if (!Number.isInteger(payload?.exp) || payload.exp <= now) {
    throw unauthorized("Bearer token expired.");
  }
  if (payload?.nbf !== undefined && (!Number.isInteger(payload.nbf) || payload.nbf > now)) {
    throw unauthorized("Bearer token is not active yet.");
  }
}

function parseJsonSegment(encodedValue, kind) {
  try {
    return JSON.parse(base64UrlDecodeUtf8(encodedValue));
  } catch {
    throw unauthorized(`Invalid bearer token ${kind}.`);
  }
}

function parseCompactJwt(token) {
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  if (!normalizedToken) {
    throw unauthorized("Missing bearer token.");
  }

  const parts = normalizedToken.split(".");
  if (parts.length !== 3) {
    throw unauthorized("Invalid bearer token format.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonSegment(encodedHeader, "header");
  const payload = parseJsonSegment(encodedPayload, "payload");
  if (!header || typeof header !== "object" || Array.isArray(header)) {
    throw unauthorized("Invalid bearer token header.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw unauthorized("Invalid bearer token payload.");
  }

  return {
    token: normalizedToken,
    header,
    payload,
    encodedHeader,
    encodedPayload,
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: base64UrlDecodeBuffer(encodedSignature)
  };
}

function verifyInternalSignature(parsedToken, secret) {
  const expectedSignature = signInput(parsedToken.signingInput, secret);
  const providedBuffer = parsedToken.signature;
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw unauthorized("Invalid bearer token signature.");
  }
}

function verifyParsedInternalToken(parsedToken, { secret, issuer, audience, nowSeconds = currentEpochSeconds } = {}) {
  if (parsedToken.header?.alg !== INTERNAL_BEARER_ALGORITHM || parsedToken.header?.typ !== INTERNAL_BEARER_TYPE) {
    throw unauthorized("Unsupported bearer token header.");
  }
  verifyInternalSignature(parsedToken, secret);
  validateIssuerAndAudience(parsedToken.payload, { issuer, audience });
  validateTemporalClaims(parsedToken.payload, { nowSeconds });
  return normalizeAuthPrincipal(parsedToken.payload, {
    defaultTenantId: normalizeText(parsedToken.payload?.tenantId) || "dev"
  });
}

function buildOidcDiscoveryUrl(issuer) {
  return `${String(issuer || "").replace(/\/+$/, "")}${OIDC_DISCOVERY_PATH}`;
}

function normalizeOidcHeaderType(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeUsableJwk(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const kty = normalizeText(entry.kty);
  if (!kty) {
    return null;
  }
  const use = normalizeText(entry.use);
  if (use && use !== "sig") {
    return null;
  }
  if (Array.isArray(entry.key_ops) && !entry.key_ops.includes("verify")) {
    return null;
  }
  return entry;
}

function isCompatibleJwkForAlg(jwk, algorithm) {
  if (typeof algorithm !== "string" || !algorithm) {
    return false;
  }
  if (jwk.alg && jwk.alg !== algorithm) {
    return false;
  }
  if (algorithm.startsWith("RS") || algorithm.startsWith("PS")) {
    return jwk.kty === "RSA";
  }
  if (algorithm.startsWith("ES")) {
    return jwk.kty === "EC";
  }
  if (algorithm === "EdDSA") {
    return jwk.kty === "OKP";
  }
  return false;
}

function createOidcJwksVerifier({
  issuer,
  audience,
  discoveryUrl = "",
  jwksUrl = "",
  fetchFn = globalThis.fetch,
  cacheTtlMs = OIDC_DEFAULT_CACHE_TTL_MS,
  nowSeconds = currentEpochSeconds
}) {
  const normalizedIssuer = normalizeText(issuer);
  const normalizedAudience = normalizeText(audience);
  const normalizedDiscoveryUrl = normalizeText(discoveryUrl);
  const normalizedJwksUrl = normalizeText(jwksUrl);
  const normalizedCacheTtlMs = Math.max(1_000, Number(cacheTtlMs) || OIDC_DEFAULT_CACHE_TTL_MS);
  let discoveryCache = null;
  let jwksCache = null;
  let discoveryPromise = null;
  let jwksPromise = null;

  function isCacheFresh(cache) {
    return Boolean(cache && cache.expiresAt > Date.now());
  }

  async function readJsonUrl(url, label) {
    let response;
    try {
      response = await fetchFn(url, {
        headers: { accept: "application/json" }
      });
    } catch {
      throw authProviderUnavailable(`${label} could not be fetched.`);
    }
    if (!response || response.ok !== true) {
      throw authProviderUnavailable(`${label} request failed.`);
    }
    try {
      return await response.json();
    } catch {
      throw authProviderUnavailable(`${label} returned invalid JSON.`);
    }
  }

  async function getDiscovery() {
    if (normalizedJwksUrl) {
      return { jwksUri: normalizedJwksUrl };
    }
    if (isCacheFresh(discoveryCache)) {
      return discoveryCache.value;
    }
    if (discoveryPromise) {
      return discoveryPromise;
    }
    discoveryPromise = (async () => {
      const payload = await readJsonUrl(
        normalizedDiscoveryUrl || buildOidcDiscoveryUrl(normalizedIssuer),
        "OIDC discovery"
      );
      const discoveredIssuer = normalizeText(payload?.issuer);
      const discoveredJwksUri = normalizeText(payload?.jwks_uri);
      if (!discoveredIssuer) {
        throw authProviderUnavailable("OIDC discovery response is missing issuer.");
      }
      if (discoveredIssuer !== normalizedIssuer) {
        throw authProviderUnavailable("OIDC discovery issuer does not match AUTH_PROD_ISSUER.");
      }
      if (!discoveredJwksUri) {
        throw authProviderUnavailable("OIDC discovery response is missing jwks_uri.");
      }
      const value = { jwksUri: discoveredJwksUri };
      discoveryCache = {
        value,
        expiresAt: Date.now() + normalizedCacheTtlMs
      };
      return value;
    })().finally(() => {
      discoveryPromise = null;
    });
    return discoveryPromise;
  }

  async function getJwks({ forceRefresh = false } = {}) {
    if (!forceRefresh && isCacheFresh(jwksCache)) {
      return jwksCache.keys;
    }
    if (!forceRefresh && jwksPromise) {
      return jwksPromise;
    }
    jwksPromise = (async () => {
      const source = await getDiscovery();
      const payload = await readJsonUrl(source.jwksUri, "OIDC JWKS");
      if (!Array.isArray(payload?.keys)) {
        throw authProviderUnavailable("OIDC JWKS response is missing keys.");
      }
      const keys = payload.keys.map(normalizeUsableJwk).filter(Boolean);
      if (keys.length === 0) {
        throw authProviderUnavailable("OIDC JWKS response does not contain usable signing keys.");
      }
      jwksCache = {
        keys,
        expiresAt: Date.now() + normalizedCacheTtlMs
      };
      return keys;
    })().finally(() => {
      jwksPromise = null;
    });
    return jwksPromise;
  }

  function selectJwk(keys, header) {
    const compatibleKeys = keys.filter((candidate) => isCompatibleJwkForAlg(candidate, header.alg));
    if (compatibleKeys.length === 0) {
      return null;
    }
    const requestedKid = normalizeText(header?.kid);
    if (requestedKid) {
      return compatibleKeys.find((candidate) => normalizeText(candidate.kid) === requestedKid) || null;
    }
    if (compatibleKeys.length === 1) {
      return compatibleKeys[0];
    }
    return null;
  }

  async function resolveVerificationKey(header) {
    let selectedKey = selectJwk(await getJwks(), header);
    if (selectedKey) {
      return selectedKey;
    }
    selectedKey = selectJwk(await getJwks({ forceRefresh: true }), header);
    if (!selectedKey) {
      throw unauthorized("Invalid bearer token signing key.");
    }
    return selectedKey;
  }

  function verifySignature(parsedToken, jwk) {
    const signatureDescriptor = SIGNATURE_ALGORITHM_MAP[parsedToken.header.alg];
    if (!signatureDescriptor) {
      throw unauthorized("Unsupported bearer token algorithm.");
    }

    let keyObject;
    try {
      keyObject = crypto.createPublicKey({ key: jwk, format: "jwk" });
    } catch {
      throw authProviderUnavailable("OIDC JWKS contains an invalid signing key.");
    }

    try {
      const key =
        signatureDescriptor.padding === undefined
          ? keyObject
          : {
              key: keyObject,
              padding: signatureDescriptor.padding,
              saltLength: signatureDescriptor.saltLength
            };
      return crypto.verify(
        signatureDescriptor.algorithm,
        Buffer.from(parsedToken.signingInput),
        key,
        parsedToken.signature
      );
    } catch {
      return false;
    }
  }

  async function prewarm() {
    await getJwks();
  }

  async function verifyParsedToken(parsedToken) {
    const normalizedType = normalizeOidcHeaderType(parsedToken.header?.typ);
    if (normalizedType && !OIDC_ALLOWED_TYPE_VALUES.has(normalizedType)) {
      throw unauthorized("Unsupported bearer token header.");
    }
    if (!SIGNATURE_ALGORITHM_MAP[parsedToken.header?.alg]) {
      throw unauthorized("Unsupported bearer token algorithm.");
    }
    const jwk = await resolveVerificationKey(parsedToken.header);
    if (!verifySignature(parsedToken, jwk)) {
      throw unauthorized("Invalid bearer token signature.");
    }
    validateIssuerAndAudience(parsedToken.payload, {
      issuer: normalizedIssuer,
      audience: normalizedAudience
    });
    validateTemporalClaims(parsedToken.payload, { nowSeconds });
    return normalizeAuthPrincipal(parsedToken.payload, {
      defaultTenantId: "default"
    });
  }

  return {
    prewarm,
    verifyParsedToken
  };
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
  const now = currentEpochSeconds();
  const normalizedScopes = normalizeScopes(scopes);
  const header = {
    alg: INTERNAL_BEARER_ALGORITHM,
    typ: INTERNAL_BEARER_TYPE
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

export function verifyInternalToken(token, options = {}) {
  return verifyParsedInternalToken(parseCompactJwt(token), options);
}

export function createAccessTokenVerifier(config = {}) {
  const internalVerifyOptions = {
    secret: config.authDevSecret,
    issuer: config.authIssuer,
    audience: config.authAudience
  };
  const oidcVerifier =
    config.authMode === "prod"
      ? createOidcJwksVerifier({
          issuer: config.authProdIssuer,
          audience: config.authProdAudience,
          discoveryUrl: config.authProdDiscoveryUrl,
          jwksUrl: config.authProdJwksUrl,
          fetchFn: typeof config.authFetch === "function" ? config.authFetch : globalThis.fetch,
          cacheTtlMs: Number(config.authProdJwksCacheTtlSeconds) * 1_000
        })
      : null;

  async function prewarm() {
    if (!oidcVerifier) {
      return;
    }
    await oidcVerifier.prewarm();
  }

  async function verifyAccessToken(token) {
    const parsedToken = parseCompactJwt(token);
    if (config.authMode !== "prod" || parsedToken.header?.alg === INTERNAL_BEARER_ALGORITHM) {
      return verifyParsedInternalToken(parsedToken, internalVerifyOptions);
    }
    return oidcVerifier.verifyParsedToken(parsedToken);
  }

  return {
    prewarm,
    verifyAccessToken
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
