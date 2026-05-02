function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeQuickSendUsageEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const lookupKey = normalizeText(entry.lookupKey);
  if (!lookupKey) {
    return null;
  }
  const count = Number.isInteger(entry.count) ? entry.count : Number.parseInt(entry.count, 10);
  const lastUsedAt = Number.isFinite(entry.lastUsedAt) ? Number(entry.lastUsedAt) : Number.parseInt(entry.lastUsedAt, 10);
  return {
    lookupKey,
    count: Number.isFinite(count) && count > 0 ? count : 1,
    lastUsedAt: Number.isFinite(lastUsedAt) && lastUsedAt > 0 ? lastUsedAt : 0
  };
}

export function cloneQuickSendUsageEntry(entry) {
  return entry && typeof entry === "object" ? { ...entry } : entry;
}

export function cloneQuickSendUsageState(state) {
  const next = {};
  for (const [sessionId, entries] of Object.entries(state || {})) {
    next[sessionId] = Array.isArray(entries) ? entries.map((entry) => cloneQuickSendUsageEntry(entry)) : [];
  }
  return next;
}

export function compareQuickSendUsageEntries(left, right) {
  const leftCount = Number(left?.count) || 0;
  const rightCount = Number(right?.count) || 0;
  if (leftCount !== rightCount) {
    return rightCount - leftCount;
  }
  const leftLastUsedAt = Number(left?.lastUsedAt) || 0;
  const rightLastUsedAt = Number(right?.lastUsedAt) || 0;
  if (leftLastUsedAt !== rightLastUsedAt) {
    return rightLastUsedAt - leftLastUsedAt;
  }
  return normalizeText(left?.lookupKey).localeCompare(normalizeText(right?.lookupKey), "en-US", { sensitivity: "base" });
}

export function mergeQuickSendUsageEntries(entries) {
  const merged = new Map();
  for (const rawEntry of Array.isArray(entries) ? entries : []) {
    const normalized = normalizeQuickSendUsageEntry(rawEntry);
    if (!normalized) {
      continue;
    }
    const current = merged.get(normalized.lookupKey);
    if (!current) {
      merged.set(normalized.lookupKey, normalized);
      continue;
    }
    merged.set(normalized.lookupKey, {
      lookupKey: normalized.lookupKey,
      count: current.count + normalized.count,
      lastUsedAt: Math.max(current.lastUsedAt, normalized.lastUsedAt)
    });
  }
  return Array.from(merged.values()).sort(compareQuickSendUsageEntries);
}

export function readSessionQuickSendUsagePayload(localStorageRef, storageKey) {
  if (!localStorageRef || typeof localStorageRef.getItem !== "function") {
    return "";
  }
  try {
    return localStorageRef.getItem(storageKey);
  } catch {
    return "";
  }
}

export function parseSessionQuickSendUsagePayload(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.sessions : null;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return {};
    }
    const next = {};
    for (const [sessionId, entries] of Object.entries(source)) {
      const normalizedSessionId = normalizeText(sessionId);
      if (!normalizedSessionId || !Array.isArray(entries)) {
        continue;
      }
      const mergedEntries = mergeQuickSendUsageEntries(entries);
      if (mergedEntries.length > 0) {
        next[normalizedSessionId] = mergedEntries;
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function serializeSessionQuickSendUsageState(state) {
  return JSON.stringify({ sessions: state });
}

export function pruneSessionQuickSendUsageState(state, { maxEntriesPerSession, maxSessions }) {
  const next = {};
  for (const [sessionId, entries] of Object.entries(state || {})) {
    const normalizedSessionId = normalizeText(sessionId);
    if (!normalizedSessionId) {
      continue;
    }
    const mergedEntries = mergeQuickSendUsageEntries(entries).slice(0, maxEntriesPerSession);
    if (mergedEntries.length > 0) {
      next[normalizedSessionId] = mergedEntries;
    }
  }

  const rankedSessions = Object.entries(next)
    .map(([sessionId, entries]) => ({
      sessionId,
      entries,
      lastUsedAt: entries.reduce((max, entry) => Math.max(max, Number(entry?.lastUsedAt) || 0), 0)
    }))
    .sort(
      (left, right) =>
        right.lastUsedAt - left.lastUsedAt ||
        left.sessionId.localeCompare(right.sessionId, "en-US", { sensitivity: "base" })
    );

  return Object.fromEntries(rankedSessions.slice(0, maxSessions).map((entry) => [entry.sessionId, entry.entries]));
}
