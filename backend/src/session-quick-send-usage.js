function normalizeText(value) {
  return String(value || "").trim();
}

export const SESSION_QUICK_SEND_USAGE_MAX_ENTRIES = 32;

export function normalizeQuickSendUsageEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const lookupKey = normalizeText(entry.lookupKey);
  if (!lookupKey) {
    return null;
  }
  const count = Number.isInteger(entry.count) ? entry.count : Number.parseInt(entry.count, 10);
  const lastUsedAt = Number.isInteger(entry.lastUsedAt) ? entry.lastUsedAt : Number.parseInt(entry.lastUsedAt, 10);
  return {
    lookupKey,
    count: Number.isFinite(count) && count > 0 ? count : 1,
    lastUsedAt: Number.isFinite(lastUsedAt) && lastUsedAt > 0 ? lastUsedAt : 0
  };
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

export function normalizeQuickSendUsageEntries(entries, { maxEntries = SESSION_QUICK_SEND_USAGE_MAX_ENTRIES } = {}) {
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
  return Array.from(merged.values())
    .sort(compareQuickSendUsageEntries)
    .slice(0, maxEntries);
}

export function normalizeQuickSendUsageMutation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const lookupKey = normalizeText(value.lookupKey);
  if (!lookupKey) {
    return null;
  }
  return { lookupKey };
}

export function recordQuickSendUsageEntry(
  entries,
  usage,
  { usedAt = Date.now(), maxEntries = SESSION_QUICK_SEND_USAGE_MAX_ENTRIES } = {}
) {
  const normalizedUsage = normalizeQuickSendUsageMutation(usage);
  if (!normalizedUsage) {
    return normalizeQuickSendUsageEntries(entries, { maxEntries });
  }
  const nextEntries = normalizeQuickSendUsageEntries(entries, { maxEntries: Number.MAX_SAFE_INTEGER });
  const index = nextEntries.findIndex((entry) => entry.lookupKey === normalizedUsage.lookupKey);
  if (index >= 0) {
    nextEntries[index] = {
      lookupKey: normalizedUsage.lookupKey,
      count: (Number(nextEntries[index]?.count) || 0) + 1,
      lastUsedAt: Number.isInteger(usedAt) && usedAt > 0 ? usedAt : Date.now()
    };
  } else {
    nextEntries.push({
      lookupKey: normalizedUsage.lookupKey,
      count: 1,
      lastUsedAt: Number.isInteger(usedAt) && usedAt > 0 ? usedAt : Date.now()
    });
  }
  return normalizeQuickSendUsageEntries(nextEntries, { maxEntries });
}
