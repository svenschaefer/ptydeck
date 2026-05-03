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
    lastUsedAt: Number.isFinite(lastUsedAt) && lastUsedAt >= 0 ? lastUsedAt : 0
  };
}

export function cloneQuickSendUsageEntry(entry) {
  return entry && typeof entry === "object" ? { ...entry } : entry;
}

export function cloneQuickSendUsageEntries(entries) {
  return Array.isArray(entries) ? entries.map((entry) => cloneQuickSendUsageEntry(entry)) : [];
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

export function pruneQuickSendUsageEntries(entries, maxEntries = 32) {
  return mergeQuickSendUsageEntries(entries).slice(0, Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : 32);
}
