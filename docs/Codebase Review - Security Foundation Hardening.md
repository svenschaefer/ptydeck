# Refactoring Plan: Security Foundation Hardening

## 1. Objective

Establish a **clear, production-ready security foundation** for ptydeck by:

- eliminating unsafe token transport mechanisms
- separating development and production authentication models
- reducing unintended exposure of sensitive data
- enforcing explicit trust boundaries

---

## 2. Current Risk Profile

The system currently contains several **development-oriented shortcuts** that become critical risks outside localhost:

### Observed Issues

- access tokens passed via query string (`?access_token=...`)
- tokens potentially logged in debug output
- `/api/v1/auth/dev-token` callable without authentication
- no clear production authentication model
- implicit trust in environment (local vs external not enforced)

---

## 3. Core Principle

> Security must be explicit, not assumed.

This implies:

- no hidden trust assumptions (e.g. “this is only used locally”)
- no sensitive data in observable channels (URLs, logs)
- clear separation of dev vs production behavior

---

## 4. Threat Model (Relevant Scope)

### Attack Surfaces

- browser (console, history)
- network (proxies, logs)
- backend endpoints
- WebSocket handshake

---

### Key Risks

| Risk | Description |
|------|------------|
| Token leakage | via URL, logs, or browser history |
| Unauthorized access | via open dev-token endpoint |
| Privilege escalation | no role separation |
| Replay attacks | long-lived tokens reused |
| Misconfiguration | dev-mode used in production |

---

## 5. Token Transport Refactor

### 5.1 Problem

Current pattern:

```text
ws://host/ws?access_token=...
````

### Risks

* visible in browser devtools
* logged by proxies
* stored in history
* exposed in error logs

---

### 5.2 Target Approach

#### Option A (Recommended)

Use WebSocket headers:

```http
Authorization: Bearer <token>
```

---

#### Option B (Fallback)

Short-lived handshake token:

1. client requests temporary WS token via REST
2. token valid for one connection only
3. token expires immediately after use

---

### 5.3 Logging Rule

> Never log tokens or full URLs containing tokens.

Replace:

```text
Connecting to ws://...?...access_token=...
```

With:

```text
Connecting to WebSocket endpoint
```

---

## 6. Authentication Model Separation

### 6.1 Current Problem

* dev and production auth are conflated
* `AUTH_DEV_MODE` acts as primary mechanism

---

### 6.2 Target Model

#### Dev Mode

* explicit flag: `AUTH_MODE=dev`
* relaxed rules allowed:

  * token minting endpoint
  * simplified auth

#### Production Mode

* explicit flag: `AUTH_MODE=prod`
* strict requirements:

  * no dev endpoints
  * no default secrets
  * validated tokens only

---

### 6.3 Enforcement

At startup:

```js id="c1q3ax"
if (AUTH_MODE === "prod") {
  assert(SECRET is explicitly configured)
  disableDevEndpoints()
}
```

---

## 7. Dev Token Endpoint Hardening

### 7.1 Problem

Endpoint:

```text
/api/v1/auth/dev-token
```

Currently:

* accessible without authentication
* returns valid access tokens

---

### 7.2 Target Behavior

#### In Dev Mode

* only accessible from localhost
* optionally rate-limited

#### In Production

* endpoint must be disabled entirely

---

### 7.3 Example Guard

```js id="8g2nzk"
if (AUTH_MODE !== "dev") {
  return 404
}
```

---

## 8. Token Lifecycle Improvements

### 8.1 Current Issue

* tokens likely long-lived
* no rotation or expiration enforcement

---

### 8.2 Target Model

* short-lived access tokens (e.g. minutes)
* optional refresh tokens
* expiration validation on every request

---

### 8.3 Optional Enhancements

* token revocation list
* key rotation support (already partially present)

---

## 9. Role and Scope Model

### 9.1 Current State

* minimal or implicit scope handling

---

### 9.2 Target

Explicit scopes:

```text
session:read
session:write
command:manage
admin
```

---

### 9.3 Usage

* enforced in API handlers
* validated in WS connection

---

## 10. WebSocket Security

### 10.1 Required Controls

* authenticate at connection time
* bind connection to identity
* reject unauthorized messages

---

### 10.2 Validation

Every incoming WS message must:

* reference allowed session
* pass scope checks

---

## 11. Environment Hardening

### 11.1 Configuration Validation

At startup:

* no default secrets in production
* required variables must be present

---

### 11.2 Safe Defaults

* fail fast on misconfiguration
* explicit error messages

---

## 12. Logging Policy

### Rules

* never log:

  * tokens
  * secrets
  * full URLs with credentials

* sanitize:

  * headers
  * query parameters

---

### Example

```js id="6d4mvp"
log("WS connect", { endpoint: "/ws" })
```

---

## 13. Refactoring Strategy

### Phase 1: Immediate Fixes

* remove token from query string
* remove sensitive logging
* handle dev-token endpoint access

---

### Phase 2: Auth Model Separation

* introduce `AUTH_MODE`
* enforce production constraints

---

### Phase 3: Token Lifecycle

* add expiration
* validate on each request

---

### Phase 4: Scope Enforcement

* introduce roles/scopes
* validate across API and WS

---

## 14. Benefits

### 14.1 Reduced Attack Surface

* no token leakage
* no unintended public endpoints

---

### 14.2 Predictable Behavior

* dev vs prod clearly separated

---

### 14.3 Future-Proofing

* ready for:

  * multi-user
  * SaaS deployment
  * external integrations

---

## 15. Risks if Not Addressed

* accidental exposure in non-local environments
* token leakage via logs or URLs
* unauthorized system access
* difficult retrofitting later

---

## 16. Final Assessment

Security is currently:

> implicitly assumed (dev-centric)

It must become:

> explicitly enforced (environment-aware, production-ready)

This refactor is essential before:

* exposing ptydeck beyond localhost
* adding multi-user features
* integrating external systems
