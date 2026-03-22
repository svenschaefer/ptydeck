import test from "node:test";
import assert from "node:assert/strict";
import { FixedWindowRateLimiter } from "../src/rate-limiter.js";

test("FixedWindowRateLimiter allows requests up to limit within window", () => {
  const limiter = new FixedWindowRateLimiter({ windowMs: 1000 });
  assert.equal(limiter.check("client-a", 2, 100).allowed, true);
  assert.equal(limiter.check("client-a", 2, 200).allowed, true);
  const blocked = limiter.check("client-a", 2, 300);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
});

test("FixedWindowRateLimiter resets after window", () => {
  const limiter = new FixedWindowRateLimiter({ windowMs: 1000 });
  assert.equal(limiter.check("client-a", 1, 100).allowed, true);
  assert.equal(limiter.check("client-a", 1, 200).allowed, false);
  assert.equal(limiter.check("client-a", 1, 1201).allowed, true);
});

test("FixedWindowRateLimiter treats non-positive limits as disabled", () => {
  const limiter = new FixedWindowRateLimiter({ windowMs: 1000 });
  assert.equal(limiter.check("client-a", 0, 100).allowed, true);
  assert.equal(limiter.check("client-a", -1, 200).allowed, true);
});
