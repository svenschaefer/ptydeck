import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createAccessTokenVerifier, createDevToken, verifyInternalToken } from "../src/auth.js";

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createJsonResponse(payload) {
  return {
    ok: true,
    async json() {
      return payload;
    }
  };
}

function createRs256Token({
  privateKey,
  issuer,
  audience,
  subject = "alice",
  scope = "sessions:read ws:connect",
  extraClaims = {},
  kid = "kid-1",
  ttlSeconds = 300
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid
  };
  const payload = {
    iss: issuer,
    aud: audience,
    sub: subject,
    scope,
    iat: now,
    exp: now + ttlSeconds,
    ...extraClaims
  };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

test("verifyInternalToken accepts local HS256 bearer tokens", () => {
  const token = createDevToken({
    secret: "local-secret",
    issuer: "ptydeck-local",
    audience: "ptydeck-ui",
    subject: "dev-user",
    tenantId: "dev",
    scopes: ["sessions:read", "sessions:write"],
    extraClaims: {
      accessMode: "operator"
    }
  });

  const auth = verifyInternalToken(token, {
    secret: "local-secret",
    issuer: "ptydeck-local",
    audience: "ptydeck-ui"
  });

  assert.equal(auth.subject, "dev-user");
  assert.equal(auth.tenantId, "dev");
  assert.deepEqual(auth.scopes, ["sessions:read", "sessions:write"]);
  assert.equal(auth.accessMode, "operator");
});

test("createAccessTokenVerifier verifies prod OIDC/JWKS bearer tokens and caches discovery state", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const discoveryUrl = "https://issuer.example/.well-known/openid-configuration";
  const jwksUrl = "https://issuer.example/keys";
  const fetchCalls = [];
  const verifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: "https://issuer.example",
    authProdAudience: "ptydeck-web",
    authProdDiscoveryUrl: discoveryUrl,
    authProdJwksCacheTtlSeconds: 300,
    authFetch: async (url) => {
      fetchCalls.push(url);
      if (url === discoveryUrl) {
        return createJsonResponse({
          issuer: "https://issuer.example",
          jwks_uri: jwksUrl
        });
      }
      if (url === jwksUrl) {
        return createJsonResponse({
          keys: [{ ...jwk, kid: "kid-1", use: "sig", alg: "RS256" }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  });

  await verifier.prewarm();

  const token = createRs256Token({
    privateKey,
    issuer: "https://issuer.example",
    audience: "ptydeck-web",
    extraClaims: {
      permissions: ["sessions:read", "ws:connect"]
    }
  });

  const auth = await verifier.verifyAccessToken(token);
  const secondAuth = await verifier.verifyAccessToken(token);

  assert.equal(auth.subject, "alice");
  assert.equal(auth.tenantId, "default");
  assert.deepEqual(auth.scopes, ["sessions:read", "ws:connect"]);
  assert.equal(secondAuth.subject, "alice");
  assert.deepEqual(fetchCalls, [discoveryUrl, jwksUrl]);
});

test("createAccessTokenVerifier in prod still accepts local internal share tokens without OIDC fetches", async () => {
  const fetchCalls = [];
  const verifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "internal-secret",
    authIssuer: "ptydeck-internal",
    authAudience: "ptydeck-share",
    authProdIssuer: "https://issuer.example",
    authProdAudience: "ptydeck-web",
    authProdDiscoveryUrl: "https://issuer.example/.well-known/openid-configuration",
    authFetch: async (url) => {
      fetchCalls.push(url);
      return createJsonResponse({
        issuer: "https://issuer.example",
        jwks_uri: "https://issuer.example/keys"
      });
    }
  });

  const shareToken = createDevToken({
    secret: "internal-secret",
    issuer: "ptydeck-internal",
    audience: "ptydeck-share",
    subject: "share:share-1",
    tenantId: "share",
    scopes: ["sessions:read", "ws:connect"],
    extraClaims: {
      accessMode: "spectator",
      permissionMode: "read_only",
      shareLinkId: "share-1",
      shareTargetType: "session",
      shareTargetId: "session-1",
      shareTokenId: "token-1"
    }
  });

  const auth = await verifier.verifyAccessToken(shareToken);

  assert.equal(auth.subject, "share:share-1");
  assert.equal(auth.accessMode, "spectator");
  assert.equal(auth.permissionMode, "read_only");
  assert.equal(auth.shareTargetId, "session-1");
  assert.deepEqual(fetchCalls, []);
});
