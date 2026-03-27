function normalizeText(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

function normalizePositiveInteger(value, fallback = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return fallback;
  }
  return Math.trunc(normalized);
}

function buildReplayRetentionSummary(payload) {
  const retainedChars = normalizePositiveInteger(payload?.retainedChars, normalizeText(payload?.data).length);
  const retentionLimitChars = normalizePositiveInteger(payload?.retentionLimitChars, retainedChars);
  if (payload?.truncated === true) {
    return `${retainedChars}/${retentionLimitChars} chars retained, truncated`;
  }
  return `${retainedChars} chars retained`;
}

function buildReplayFeedback({ session, payload, mode, formatSessionToken, formatSessionDisplayName }) {
  const token = formatSessionToken(session?.id);
  const name = formatSessionDisplayName(session);
  const actionText = mode === "copy" ? "Copied replay tail" : "Downloaded replay tail";
  return `${actionText} for [${token}] ${name} (${buildReplayRetentionSummary(payload)}).`;
}

export function createReplayExportRuntimeController(options = {}) {
  const api = options.api || null;
  const documentRef = options.documentRef || globalThis.document || null;
  const URLRef = options.URLRef || globalThis.URL || null;
  const BlobCtor = options.BlobCtor || globalThis.Blob;
  const writeClipboardText =
    typeof options.writeClipboardText === "function" ? options.writeClipboardText : async () => false;
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "");

  function assertDownloadSupport() {
    if (!documentRef || typeof documentRef.createElement !== "function" || !URLRef || typeof URLRef.createObjectURL !== "function" || typeof URLRef.revokeObjectURL !== "function" || typeof BlobCtor !== "function") {
      throw new Error("Replay export download is unavailable in this browser.");
    }
  }

  function triggerReplayDownload(payload) {
    assertDownloadSupport();
    const blob = new BlobCtor([normalizeText(payload?.data)], {
      type: normalizeText(payload?.contentType) || "text/plain; charset=utf-8"
    });
    const objectUrl = URLRef.createObjectURL(blob);
    const anchor = documentRef.createElement("a");
    anchor.href = objectUrl;
    anchor.download = normalizeText(payload?.fileName) || "session-replay.txt";
    if (anchor.style && typeof anchor.style === "object") {
      anchor.style.display = "none";
    }
    const parent = documentRef.body || documentRef.documentElement || null;
    if (parent && typeof parent.appendChild === "function") {
      parent.appendChild(anchor);
    }
    if (typeof anchor.click === "function") {
      anchor.click();
    }
    if (typeof anchor.remove === "function") {
      anchor.remove();
    } else if (parent && typeof parent.removeChild === "function") {
      parent.removeChild(anchor);
    }
    URLRef.revokeObjectURL(objectUrl);
  }

  async function copyReplayText(payload) {
    const ok = await writeClipboardText(normalizeText(payload?.data));
    if (!ok) {
      throw new Error("Replay export copy is unavailable in this browser.");
    }
  }

  async function fetchReplayExport(sessionId) {
    if (!api || typeof api.getSessionReplayExport !== "function") {
      throw new Error("Replay export API is unavailable.");
    }
    return api.getSessionReplayExport(sessionId);
  }

  async function loadSessionReplay(session) {
    if (!session?.id) {
      throw new Error("Replay export requires a session.");
    }
    return fetchReplayExport(session.id);
  }

  async function exportSessionReplay(session, { mode = "download", payload = null } = {}) {
    const nextPayload = payload || (await loadSessionReplay(session));
    if (mode === "copy") {
      await copyReplayText(nextPayload);
    } else {
      triggerReplayDownload(nextPayload);
    }
    return {
      payload: nextPayload,
      feedback: buildReplayFeedback({
        session,
        payload: nextPayload,
        mode,
        formatSessionToken,
        formatSessionDisplayName
      })
    };
  }

  return {
    buildReplayRetentionSummary,
    exportSessionReplay,
    loadSessionReplay
  };
}
