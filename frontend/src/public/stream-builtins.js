function normalizeText(value) {
  return String(value || "").trim();
}

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function normalizeChunkText(chunk) {
  return stripAnsi(String(chunk || "")).replace(/\r/g, "\n");
}

function detectActiveProcessingText(text) {
  const normalized = normalizeChunkText(text);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].replace(/^[\s`~*•◦·>›→-]+/, "");
    const match = line.match(
      /\b(working|thinking|analyzing|processing|planning|executing)(?:\s*\([^)\r\n]{1,120}\))?/i
    );
    if (match && typeof match[0] === "string" && match[0].trim()) {
      const token = match[0].trim();
      return token.charAt(0).toUpperCase() + token.slice(1);
    }
  }
  return "";
}

function isPromptLikeLine(line) {
  const normalized = stripAnsi(line).trimEnd();
  if (!normalized) {
    return false;
  }
  return (
    /^[^\n]{0,160}[$#>] ?$/.test(normalized) ||
    /^[^\n]{0,160}❯ ?$/.test(normalized) ||
    /^[^\n]{0,160}>>> ?$/.test(normalized)
  );
}

function detectAttentionText(text) {
  const normalized = normalizeChunkText(text);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (/\b(error|failed|failure|exception|traceback|panic|fatal)\b/i.test(line)) {
      return line;
    }
  }
  return "";
}

function createWorkingActions(statusText) {
  return [
    { type: "setSessionState", value: "working", conflictKey: "session-state" },
    { type: "setSessionStatus", value: statusText, conflictKey: "session-status" },
    {
      type: "setSessionBadges",
      badges: [{ id: "working", text: "Working", tone: "active" }],
      conflictKey: "session-badges"
    }
  ];
}

function createIdleRecoveryActions() {
  return [
    { type: "setSessionState", value: "idle", conflictKey: "session-state" },
    { type: "setSessionStatus", value: "", conflictKey: "session-status" },
    { type: "setSessionBadges", badges: [], conflictKey: "session-badges" }
  ];
}

function createAttentionActions(message) {
  const statusText = normalizeText(message);
  if (!statusText) {
    return [];
  }
  return [
    { type: "setSessionState", value: "attention", conflictKey: "session-state" },
    { type: "setSessionStatus", value: statusText, conflictKey: "session-status" },
    { type: "markSessionAttention", active: true, conflictKey: "session-attention" },
    {
      type: "pushSessionNotification",
      notification: {
        id: `attention:${statusText.toLowerCase()}`,
        level: "warn",
        message: statusText
      }
    }
  ];
}

export function createBuiltInStreamPlugins() {
  return [
    {
      id: "activity-status",
      priority: 0,
      onData(_session, chunk) {
        const statusText = detectActiveProcessingText(chunk);
        return statusText ? createWorkingActions(statusText) : null;
      }
    },
    {
      id: "prompt-idle-recovery",
      priority: 10,
      onLine(session, line) {
        if (!isPromptLikeLine(line)) {
          return null;
        }
        if (
          session.interpretationState === "working" ||
          session.statusText ||
          (Array.isArray(session.pluginBadges) && session.pluginBadges.length > 0)
        ) {
          return createIdleRecoveryActions();
        }
        return null;
      },
      onIdle(session) {
        if (
          session.interpretationState === "working" ||
          session.statusText ||
          (Array.isArray(session.pluginBadges) && session.pluginBadges.length > 0)
        ) {
          return createIdleRecoveryActions();
        }
        return null;
      }
    },
    {
      id: "attention-errors",
      priority: 20,
      onData(_session, chunk) {
        const message = detectAttentionText(chunk);
        return message ? createAttentionActions(message) : null;
      }
    }
  ];
}
