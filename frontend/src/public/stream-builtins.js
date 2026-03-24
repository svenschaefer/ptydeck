function normalizeText(value) {
  return String(value || "").trim();
}

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function normalizeChunkText(chunk) {
  return stripAnsi(String(chunk || "")).replace(/\r/g, "\n");
}

const ACTIVE_STATUS_WITH_TIMER_RE = /^(.+?)\(\s*((?:\d+m\s*)?\d{1,2}s)\s*[•·]\s*esc to interrupt\s*\)$/i;
const GENERIC_STATUS_WITH_TIMER_RE = /^(.+?)\(\s*((?:\d+m\s*)?\d{1,2}s)(?:[^)]*)\)$/i;
const ACTIVE_VERB_RE =
  /\b(working|thinking|analyzing|analysing|processing|planning|executing|identifying|resolving|building|compiling|running|waiting)\b/i;

const COMPLETED_FILES_PROGRESS_RE =
  /^Completed files\s+(\d+)\/(\d+)\s*\|\s*([\d.]+)([KMG]i?B)\/([\d.]+)([KMG]i?B)(?:\s*\|\s*([\d.]+)([KMG]i?B)\/s)?$/i;

function normalizeDetectionLine(line) {
  return String(line || "")
    .replace(/^[\u2800-\u28FF\s`~*•◦·>›→-]+/, "")
    .trim();
}

function titleCaseFirst(text) {
  const value = normalizeText(text);
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function detectActiveProcessingText(text) {
  const normalized = normalizeChunkText(text);
  const lines = normalized
    .split("\n")
    .map((line) => normalizeDetectionLine(line))
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    const codexStatusMatch = line.match(ACTIVE_STATUS_WITH_TIMER_RE);
    if (codexStatusMatch) {
      const status = normalizeText(codexStatusMatch[1]);
      const duration = normalizeText(codexStatusMatch[2]);
      if (status && duration) {
        return `${titleCaseFirst(status)} (${duration} • esc to interrupt)`;
      }
    }

    const genericTimedMatch = line.match(GENERIC_STATUS_WITH_TIMER_RE);
    if (genericTimedMatch && ACTIVE_VERB_RE.test(genericTimedMatch[1])) {
      return titleCaseFirst(line);
    }

    const activityVerbMatch = line.match(ACTIVE_VERB_RE);
    if (activityVerbMatch && typeof activityVerbMatch[0] === "string") {
      return titleCaseFirst(activityVerbMatch[0]);
    }
  }
  return "";
}

function parseCompletedFilesProgress(text) {
  const normalized = normalizeChunkText(text);
  const lines = normalized
    .split("\n")
    .map((line) => normalizeDetectionLine(line))
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const match = line.match(COMPLETED_FILES_PROGRESS_RE);
    if (!match) {
      continue;
    }
    const filesDone = Number.parseInt(match[1], 10);
    const filesTotal = Number.parseInt(match[2], 10);
    const bytesDoneValue = Number.parseFloat(match[3]);
    const bytesDoneUnit = match[4];
    const bytesTotalValue = Number.parseFloat(match[5]);
    const bytesTotalUnit = match[6];
    const speedValue = match[7] ? Number.parseFloat(match[7]) : null;
    const speedUnit = match[8] || "";
    if (
      !Number.isFinite(filesDone) ||
      !Number.isFinite(filesTotal) ||
      !Number.isFinite(bytesDoneValue) ||
      !Number.isFinite(bytesTotalValue)
    ) {
      continue;
    }
    return {
      filesDone,
      filesTotal,
      bytesDone: `${bytesDoneValue}${bytesDoneUnit}`,
      bytesTotal: `${bytesTotalValue}${bytesTotalUnit}`,
      speed: Number.isFinite(speedValue) ? `${speedValue}${speedUnit}/s` : ""
    };
  }
  return null;
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

function createProgressMetaActions(progress) {
  if (!progress) {
    return [];
  }
  return [
    {
      type: "mergeSessionMeta",
      patch: {
        progress: {
          filesDone: progress.filesDone,
          filesTotal: progress.filesTotal,
          bytesDone: progress.bytesDone,
          bytesTotal: progress.bytesTotal,
          speed: progress.speed || ""
        }
      },
      conflictKey: "session-progress-meta"
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
        const progress = parseCompletedFilesProgress(chunk);
        const actions = [];
        if (statusText) {
          actions.push(...createWorkingActions(statusText));
        }
        actions.push(...createProgressMetaActions(progress));
        return actions.length > 0 ? actions : null;
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
