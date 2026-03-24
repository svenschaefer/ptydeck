const DEFAULT_AGGREGATION_WINDOW_MS = 5000;
const MAX_REMEMBERED_COMPLETIONS = 256;

function normalizePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function truncateList(entries, maxVisible = 4) {
  if (entries.length <= maxVisible) {
    return entries;
  }
  return entries.slice(0, maxVisible);
}

export function createActivityCompletionNotifier(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const NotificationCtor = windowRef?.Notification;
  const aggregationWindowMs = normalizePositiveInt(
    options.aggregationWindowMs,
    DEFAULT_AGGREGATION_WINDOW_MS
  );
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "").trim();
  const resolveDeckName =
    typeof options.resolveDeckName === "function" ? options.resolveDeckName : (deckId) => String(deckId || "").trim();
  const onError = typeof options.onError === "function" ? options.onError : null;

  const rememberedKeys = [];
  const rememberedKeySet = new Set();
  const pendingEntries = [];
  let flushTimer = null;

  function rememberCompletionKey(key) {
    if (rememberedKeySet.has(key)) {
      return false;
    }
    rememberedKeySet.add(key);
    rememberedKeys.push(key);
    while (rememberedKeys.length > MAX_REMEMBERED_COMPLETIONS) {
      const expired = rememberedKeys.shift();
      rememberedKeySet.delete(expired);
    }
    return true;
  }

  function canNotify() {
    return typeof NotificationCtor === "function" && NotificationCtor.permission === "granted";
  }

  function buildEntry(session, completedAt) {
    const timestamp = normalizePositiveInt(
      completedAt ?? session?.activityCompletedAt ?? session?.activityUpdatedAt ?? session?.updatedAt,
      Date.now()
    );
    const sessionId = String(session?.id || "").trim();
    const token = formatSessionToken(sessionId);
    const name = formatSessionDisplayName(session) || sessionId;
    const deckName = resolveDeckName(session?.deckId);
    return {
      key: `${sessionId}:${timestamp}`,
      sessionId,
      token,
      name,
      deckName,
      completedAt: timestamp
    };
  }

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!pendingEntries.length || !canNotify()) {
      pendingEntries.length = 0;
      return;
    }

    const entries = pendingEntries.splice(0).sort((left, right) => left.completedAt - right.completedAt);
    const visibleEntries = truncateList(entries);
    let title = "Session activity completed";
    let body = "";

    if (entries.length === 1) {
      const entry = entries[0];
      const deckPart = entry.deckName ? ` in deck ${entry.deckName}` : "";
      body = `[${entry.token}] ${entry.name} finished activity${deckPart}.`;
    } else {
      title = `${entries.length} sessions completed activity`;
      const names = visibleEntries.map((entry) => `[${entry.token}] ${entry.name}`);
      body = names.join(", ");
      if (entries.length > visibleEntries.length) {
        body += `, +${entries.length - visibleEntries.length} more`;
      }
    }

    try {
      new NotificationCtor(title, {
        body,
        tag: entries.length === 1 ? `ptydeck-activity-${entries[0].key}` : "ptydeck-activity-completion-batch"
      });
    } catch (error) {
      if (onError) {
        onError(error);
      }
    }
  }

  return {
    queueCompletion(session, completedAt) {
      if (!session || !canNotify()) {
        return false;
      }
      const entry = buildEntry(session, completedAt);
      if (!entry.sessionId || !rememberCompletionKey(entry.key)) {
        return false;
      }
      pendingEntries.push(entry);
      if (!flushTimer) {
        flushTimer = setTimeout(flush, aggregationWindowMs);
      }
      return true;
    },
    flush,
    dispose() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pendingEntries.length = 0;
    }
  };
}
