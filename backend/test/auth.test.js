import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createAccessTokenVerifier, createDevToken, normalizeScopes, verifyInternalToken } from "../src/auth.js";

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createJsonResponse(payload, { ok = true, jsonError = null } = {}) {
  return {
    ok,
    async json() {
      if (jsonError) {
        throw jsonError;
      }
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
  ttlSeconds = 300,
  headerOverrides = {}
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid,
    ...headerOverrides
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

function createCompactToken({ header, payload, signature = "c2ln" }) {
  return `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}.${signature}`;
}

function createHs256Token({
  secret,
  issuer,
  audience,
  subject = "dev-user",
  tenantId = "dev",
  scope = "sessions:read ws:connect",
  ttlSeconds = 300,
  nbf,
  extraClaims = {},
  header = {
    alg: "HS256",
    typ: "JWT"
  }
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer,
    aud: audience,
    sub: subject,
    tenantId,
    scope,
    iat: now,
    exp: now + ttlSeconds,
    ...(nbf === undefined ? {} : { nbf }),
    ...(extraClaims && typeof extraClaims === "object" && !Array.isArray(extraClaims) ? extraClaims : {})
  };
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function withMockedDateNow(t, initialMs) {
  const originalDateNow = Date.now;
  let currentMs = initialMs;
  Date.now = () => currentMs;
  t.after(() => {
    Date.now = originalDateNow;
  });
  return {
    advanceBy(ms) {
      currentMs += ms;
    }
  };
}

test("normalizeScopes trims whitespace and deduplicates string and array inputs", () => {
  assert.deepEqual(normalizeScopes([" sessions:read ", "", "ws:connect", "sessions:read", 7, "  "]), [
    "sessions:read",
    "ws:connect"
  ]);
  assert.deepEqual(normalizeScopes(" sessions:read   ws:connect   sessions:read "), [
    "sessions:read",
    "ws:connect"
  ]);
  assert.deepEqual(normalizeScopes(undefined), []);
});

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

test("verifyInternalToken rejects malformed compact tokens and invalid internal claims", () => {
  const verifyOptions = {
    secret: "local-secret",
    issuer: "ptydeck-local",
    audience: "ptydeck-ui"
  };

  assert.throws(() => verifyInternalToken("", verifyOptions), /Missing bearer token/);
  assert.throws(() => verifyInternalToken("only.two", verifyOptions), /Invalid bearer token format/);

  const invalidHeaderJsonToken = `${Buffer.from("{").toString("base64url")}.${base64UrlEncodeJson({
    iss: "ptydeck-local",
    aud: "ptydeck-ui",
    sub: "dev-user",
    exp: Math.floor(Date.now() / 1000) + 300
  })}.sig`;
  assert.throws(() => verifyInternalToken(invalidHeaderJsonToken, verifyOptions), /Invalid bearer token header/);

  const invalidPayloadJsonToken = `${base64UrlEncodeJson({
    alg: "HS256",
    typ: "JWT"
  })}.${Buffer.from("{").toString("base64url")}.sig`;
  assert.throws(() => verifyInternalToken(invalidPayloadJsonToken, verifyOptions), /Invalid bearer token payload/);

  const arrayHeaderToken = createCompactToken({
    header: [],
    payload: {
      iss: "ptydeck-local",
      aud: "ptydeck-ui",
      sub: "dev-user",
      exp: Math.floor(Date.now() / 1000) + 300
    }
  });
  assert.throws(() => verifyInternalToken(arrayHeaderToken, verifyOptions), /Invalid bearer token header/);

  const arrayPayloadToken = createCompactToken({
    header: {
      alg: "HS256",
      typ: "JWT"
    },
    payload: []
  });
  assert.throws(() => verifyInternalToken(arrayPayloadToken, verifyOptions), /Invalid bearer token payload/);

  const unsupportedHeaderToken = createHs256Token({
    ...verifyOptions,
    header: {
      alg: "HS512",
      typ: "JWT"
    }
  });
  assert.throws(() => verifyInternalToken(unsupportedHeaderToken, verifyOptions), /Unsupported bearer token header/);

  const notYetActiveToken = createHs256Token({
    ...verifyOptions,
    nbf: Math.floor(Date.now() / 1000) + 60
  });
  assert.throws(() => verifyInternalToken(notYetActiveToken, verifyOptions), /not active yet/);

  const expiredToken = createHs256Token({
    ...verifyOptions,
    ttlSeconds: -1
  });
  assert.throws(() => verifyInternalToken(expiredToken, verifyOptions), /Bearer token expired/);

  const wrongAudienceToken = createHs256Token({
    ...verifyOptions,
    audience: "wrong-audience"
  });
  assert.throws(() => verifyInternalToken(wrongAudienceToken, verifyOptions), /issuer or audience/);

  const missingSubjectToken = createHs256Token({
    ...verifyOptions,
    subject: ""
  });
  assert.throws(() => verifyInternalToken(missingSubjectToken, verifyOptions), /subject is missing/);

  const tenantIdFallbackToken = createHs256Token({
    ...verifyOptions,
    tenantId: "",
    extraClaims: {
      tenant_id: "tenant-under",
      accessMode: ""
    }
  });
  assert.equal(verifyInternalToken(tenantIdFallbackToken, verifyOptions).tenantId, "tenant-under");
  assert.equal(verifyInternalToken(tenantIdFallbackToken, verifyOptions).accessMode, "operator");

  const tidFallbackToken = createHs256Token({
    ...verifyOptions,
    tenantId: "",
    extraClaims: {
      tid: "tenant-short"
    }
  });
  assert.equal(verifyInternalToken(tidFallbackToken, verifyOptions).tenantId, "tenant-short");

  const tamperedSignatureToken = tenantIdFallbackToken.replace(/\.[^.]+$/, ".dGFtcGVyZWQ");
  assert.throws(() => verifyInternalToken(tamperedSignatureToken, verifyOptions), /Invalid bearer token signature/);
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

test("createAccessTokenVerifier derives the discovery URL from issuer and skips discovery when JWKS override is configured", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const derivedDiscoveryUrl = "https://issuer.example/.well-known/openid-configuration";
  const jwksUrl = "https://issuer.example/keys";
  const token = createRs256Token({
    privateKey,
    issuer: "https://issuer.example",
    audience: "ptydeck-web"
  });
  const derivedFetchCalls = [];
  const derivedVerifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: "https://issuer.example",
    authProdAudience: "ptydeck-web",
    authFetch: async (url) => {
      derivedFetchCalls.push(url);
      if (url === derivedDiscoveryUrl) {
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

  await derivedVerifier.verifyAccessToken(token);
  assert.deepEqual(derivedFetchCalls, [derivedDiscoveryUrl, jwksUrl]);

  const directJwksCalls = [];
  const directJwksVerifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: "https://issuer.example",
    authProdAudience: "ptydeck-web",
    authProdDiscoveryUrl: "https://unused.example/.well-known/openid-configuration",
    authProdJwksUrl: jwksUrl,
    authFetch: async (url) => {
      directJwksCalls.push(url);
      if (url === jwksUrl) {
        return createJsonResponse({
          keys: [{ ...jwk, kid: "kid-1", use: "sig", alg: "RS256" }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  });

  await directJwksVerifier.verifyAccessToken(token);
  assert.deepEqual(directJwksCalls, [jwksUrl]);
});

test("createAccessTokenVerifier refreshes JWKS immediately when the cached key set misses the requested kid", async () => {
  const issuer = "https://issuer.example";
  const audience = "ptydeck-web";
  const discoveryUrl = "https://issuer.example/.well-known/openid-configuration";
  const jwksUrl = "https://issuer.example/keys";
  const { privateKey: stalePrivateKey, publicKey: stalePublicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048
  });
  const { privateKey: freshPrivateKey, publicKey: freshPublicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048
  });
  const staleJwk = stalePublicKey.export({ format: "jwk" });
  const freshJwk = freshPublicKey.export({ format: "jwk" });
  const fetchCalls = [];
  let jwksReads = 0;
  const verifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: issuer,
    authProdAudience: audience,
    authProdDiscoveryUrl: discoveryUrl,
    authProdJwksCacheTtlSeconds: 300,
    authFetch: async (url) => {
      fetchCalls.push(url);
      if (url === discoveryUrl) {
        return createJsonResponse({
          issuer,
          jwks_uri: jwksUrl
        });
      }
      if (url === jwksUrl) {
        jwksReads += 1;
        return createJsonResponse({
          keys:
            jwksReads === 1
              ? [{ ...staleJwk, kid: "kid-1", use: "sig", alg: "RS256" }]
              : [{ ...freshJwk, kid: "kid-2", use: "sig", alg: "RS256" }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  });

  const token = createRs256Token({
    privateKey: freshPrivateKey,
    issuer,
    audience,
    kid: "kid-2"
  });
  const auth = await verifier.verifyAccessToken(token);

  assert.equal(auth.subject, "alice");
  assert.deepEqual(fetchCalls, [discoveryUrl, jwksUrl, jwksUrl]);
});

test("createAccessTokenVerifier refreshes discovery and JWKS after cache expiry", async (t) => {
  const clock = withMockedDateNow(t, Date.parse("2026-04-28T00:00:00Z"));
  const issuer = "https://issuer.example";
  const audience = "ptydeck-web";
  const discoveryUrl = "https://issuer.example/.well-known/openid-configuration";
  const jwksUrl = "https://issuer.example/keys";
  const { privateKey: firstPrivateKey, publicKey: firstPublicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048
  });
  const { privateKey: secondPrivateKey, publicKey: secondPublicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048
  });
  const firstJwk = firstPublicKey.export({ format: "jwk" });
  const secondJwk = secondPublicKey.export({ format: "jwk" });
  const fetchCalls = [];
  let discoveryReads = 0;
  let jwksReads = 0;
  const verifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: issuer,
    authProdAudience: audience,
    authProdDiscoveryUrl: discoveryUrl,
    authProdJwksCacheTtlSeconds: 1,
    authFetch: async (url) => {
      fetchCalls.push(url);
      if (url === discoveryUrl) {
        discoveryReads += 1;
        return createJsonResponse({
          issuer,
          jwks_uri: jwksUrl
        });
      }
      if (url === jwksUrl) {
        jwksReads += 1;
        return createJsonResponse({
          keys:
            jwksReads === 1
              ? [{ ...firstJwk, kid: "kid-1", use: "sig", alg: "RS256" }]
              : [{ ...secondJwk, kid: "kid-2", use: "sig", alg: "RS256" }]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  });

  await verifier.verifyAccessToken(
    createRs256Token({
      privateKey: firstPrivateKey,
      issuer,
      audience,
      kid: "kid-1"
    })
  );

  clock.advanceBy(1_500);

  await verifier.verifyAccessToken(
    createRs256Token({
      privateKey: secondPrivateKey,
      issuer,
      audience,
      kid: "kid-2"
    })
  );

  assert.equal(discoveryReads, 2);
  assert.equal(jwksReads, 2);
  assert.deepEqual(fetchCalls, [discoveryUrl, jwksUrl, discoveryUrl, jwksUrl]);
});

test("createAccessTokenVerifier normalizes mixed OIDC scope claims and tenant fallbacks", async () => {
  const issuer = "https://issuer.example";
  const audience = "ptydeck-web";
  const jwksUrl = "https://issuer.example/keys";
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const verifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: issuer,
    authProdAudience: audience,
    authProdJwksUrl: jwksUrl,
    authFetch: async (url) => {
      if (url !== jwksUrl) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      return createJsonResponse({
        keys: [{ ...jwk, kid: "kid-1", use: "sig", alg: "RS256" }]
      });
    }
  });

  const auth = await verifier.verifyAccessToken(
    createRs256Token({
      privateKey,
      issuer,
      audience,
      scope: " sessions:read   audit:read sessions:read ",
      extraClaims: {
        tenant_id: "tenant-under",
        scp: ["ws:connect", "audit:read", ""],
        permissions: ["deploy", "ws:connect", 7, " "],
        accessMode: "   "
      }
    })
  );

  assert.equal(auth.tenantId, "tenant-under");
  assert.equal(auth.accessMode, "operator");
  assert.deepEqual(auth.scopes, ["sessions:read", "audit:read", "ws:connect", "deploy"]);

  const tidAuth = await verifier.verifyAccessToken(
    createRs256Token({
      privateKey,
      issuer,
      audience,
      scope: "",
      extraClaims: {
        tid: "tenant-short",
        permissionMode: " read_only ",
        shareLinkId: " share-1 "
      }
    })
  );

  assert.equal(tidAuth.tenantId, "tenant-short");
  assert.equal(tidAuth.permissionMode, "read_only");
  assert.equal(tidAuth.shareLinkId, "share-1");
});

test("createAccessTokenVerifier rejects malformed JOSE tokens and invalid OIDC provider responses", async () => {
  const issuer = "https://issuer.example";
  const audience = "ptydeck-web";
  const discoveryUrl = "https://issuer.example/.well-known/openid-configuration";
  const jwksUrl = "https://issuer.example/keys";
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const { privateKey: wrongPrivateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const verifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: issuer,
    authProdAudience: audience,
    authProdJwksUrl: jwksUrl,
    authFetch: async (url) => {
      if (url !== jwksUrl) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      return createJsonResponse({
        keys: [{ ...jwk, kid: "kid-1", use: "sig", alg: "RS256" }]
      });
    }
  });

  await assert.rejects(
    verifier.verifyAccessToken(
      createRs256Token({
        privateKey,
        issuer,
        audience,
        headerOverrides: { typ: "refresh+jwt" }
      })
    ),
    /Unsupported bearer token header/
  );

  await assert.rejects(
    verifier.verifyAccessToken(
      createCompactToken({
        header: {
          alg: "HS384",
          typ: "JWT",
          kid: "kid-1"
        },
        payload: {
          iss: issuer,
          aud: audience,
          sub: "alice",
          exp: Math.floor(Date.now() / 1000) + 300
        }
      })
    ),
    /Unsupported bearer token algorithm/
  );

  await assert.rejects(
    verifier.verifyAccessToken(
      createRs256Token({
        privateKey: wrongPrivateKey,
        issuer,
        audience
      })
    ),
    /Invalid bearer token signature/
  );

  const malformedJwkVerifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: issuer,
    authProdAudience: audience,
    authProdJwksUrl: jwksUrl,
    authFetch: async (url) => {
      if (url !== jwksUrl) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      return createJsonResponse({
        keys: [{ kty: "RSA", kid: "kid-1", use: "sig", alg: "RS256" }]
      });
    }
  });
  await assert.rejects(
    malformedJwkVerifier.verifyAccessToken(
      createRs256Token({
        privateKey,
        issuer,
        audience
      })
    ),
    /OIDC JWKS contains an invalid signing key/
  );

  const issuerMismatchVerifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: issuer,
    authProdAudience: audience,
    authProdDiscoveryUrl: discoveryUrl,
    authFetch: async (url) => {
      if (url === discoveryUrl) {
        return createJsonResponse({
          issuer: "https://other.example",
          jwks_uri: jwksUrl
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  });
  await assert.rejects(issuerMismatchVerifier.prewarm(), /OIDC discovery issuer does not match/);

  const invalidDiscoveryJsonVerifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: issuer,
    authProdAudience: audience,
    authProdDiscoveryUrl: discoveryUrl,
    authFetch: async (url) => {
      if (url === discoveryUrl) {
        return createJsonResponse(null, {
          jsonError: new Error("bad json")
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  });
  await assert.rejects(invalidDiscoveryJsonVerifier.prewarm(), /OIDC discovery returned invalid JSON/);
});

test("createAccessTokenVerifier surfaces OIDC provider availability and key-selection failures deterministically", async () => {
  const issuer = "https://issuer.example";
  const audience = "ptydeck-web";
  const discoveryUrl = "https://issuer.example/.well-known/openid-configuration";
  const jwksUrl = "https://issuer.example/keys";
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const baseConfig = {
    authMode: "prod",
    authDevSecret: "local-secret",
    authIssuer: "ptydeck-local",
    authAudience: "ptydeck-ui",
    authProdIssuer: issuer,
    authProdAudience: audience,
    authProdDiscoveryUrl: discoveryUrl
  };

  await assert.rejects(
    createAccessTokenVerifier({
      ...baseConfig,
      authFetch: async () => {
        throw new Error("offline");
      }
    }).prewarm(),
    /OIDC discovery could not be fetched/
  );

  await assert.rejects(
    createAccessTokenVerifier({
      ...baseConfig,
      authFetch: async () => createJsonResponse(null, { ok: false })
    }).prewarm(),
    /OIDC discovery request failed/
  );

  await assert.rejects(
    createAccessTokenVerifier({
      ...baseConfig,
      authFetch: async (url) => {
        if (url === discoveryUrl) {
          return createJsonResponse({
            jwks_uri: jwksUrl
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    }).prewarm(),
    /missing issuer/
  );

  await assert.rejects(
    createAccessTokenVerifier({
      ...baseConfig,
      authFetch: async (url) => {
        if (url === discoveryUrl) {
          return createJsonResponse({
            issuer
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    }).prewarm(),
    /missing jwks_uri/
  );

  await assert.rejects(
    createAccessTokenVerifier({
      ...baseConfig,
      authFetch: async (url) => {
        if (url === discoveryUrl) {
          return createJsonResponse({
            issuer,
            jwks_uri: jwksUrl
          });
        }
        if (url === jwksUrl) {
          return createJsonResponse({});
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    }).prewarm(),
    /missing keys/
  );

  await assert.rejects(
    createAccessTokenVerifier({
      ...baseConfig,
      authFetch: async (url) => {
        if (url === discoveryUrl) {
          return createJsonResponse({
            issuer,
            jwks_uri: jwksUrl
          });
        }
        if (url === jwksUrl) {
          return createJsonResponse({
            keys: [
              null,
              { kty: "RSA", kid: "enc-only", use: "enc", alg: "RS256" },
              { kty: "RSA", kid: "encrypt-op", use: "sig", key_ops: ["encrypt"], alg: "RS256" }
            ]
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }
    }).prewarm(),
    /does not contain usable signing keys/
  );

  const ambiguousKeysVerifier = createAccessTokenVerifier({
    ...baseConfig,
    authFetch: async (url) => {
      if (url === discoveryUrl) {
        return createJsonResponse({
          issuer,
          jwks_uri: jwksUrl
        });
      }
      if (url === jwksUrl) {
        return createJsonResponse({
          keys: [
            { ...jwk, kid: "kid-1", use: "sig", alg: "RS256" },
            { ...jwk, kid: "kid-2", use: "sig", alg: "RS256" }
          ]
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  });
  await assert.rejects(
    ambiguousKeysVerifier.verifyAccessToken(
      createRs256Token({
        privateKey,
        issuer,
        audience,
        headerOverrides: {
          kid: ""
        }
      })
    ),
    /Invalid bearer token signing key/
  );

  const incompatibleKeysVerifier = createAccessTokenVerifier({
    ...baseConfig,
    authFetch: async (url) => {
      if (url === discoveryUrl) {
        return createJsonResponse({
          issuer,
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
  await assert.rejects(
    incompatibleKeysVerifier.verifyAccessToken(
      createCompactToken({
        header: {
          alg: "ES256",
          typ: "JWT"
        },
        payload: {
          iss: issuer,
          aud: audience,
          sub: "alice",
          exp: Math.floor(Date.now() / 1000) + 300
        }
      })
    ),
    /Invalid bearer token signing key/
  );
});

test("createAccessTokenVerifier in prod still accepts local internal share tokens without OIDC fetches", async () => {
  let fetchCalled = false;
  const verifier = createAccessTokenVerifier({
    authMode: "prod",
    authDevSecret: "internal-secret",
    authIssuer: "ptydeck-internal",
    authAudience: "ptydeck-share",
    authProdIssuer: "https://issuer.example",
    authProdAudience: "ptydeck-web",
    authProdDiscoveryUrl: "https://issuer.example/.well-known/openid-configuration",
    authFetch: async () => {
      fetchCalled = true;
      throw new Error("OIDC fetch should not run for internal HS256 tokens.");
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
  assert.equal(fetchCalled, false);

  const invalidShareToken = shareToken.replace(/\.[^.]+$/, ".dGFtcGVyZWQ");
  await assert.rejects(verifier.verifyAccessToken(invalidShareToken), /Invalid bearer token signature/);
  assert.equal(fetchCalled, false);
});
