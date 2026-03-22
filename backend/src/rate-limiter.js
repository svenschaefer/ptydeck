export class FixedWindowRateLimiter {
  constructor({ windowMs }) {
    this.windowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60000;
    this.state = new Map();
  }

  check(key, limit, now = Date.now()) {
    if (!Number.isFinite(limit) || limit <= 0) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const normalizedKey = typeof key === "string" && key.trim() ? key.trim() : "unknown";
    const existing = this.state.get(normalizedKey);
    if (!existing || now - existing.windowStart >= this.windowMs) {
      this.state.set(normalizedKey, { windowStart: now, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count >= limit) {
      const msUntilReset = Math.max(0, this.windowMs - (now - existing.windowStart));
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(msUntilReset / 1000))
      };
    }

    existing.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
