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
  /^Completed files\s+(\d+)\/(\d+)(?:\s*\|\s*([\d.]+)([KMG]i?B)\/([\d.]+)([KMG]i?B)(?:\s*\|\s*([\d.]+)([KMG]i?B)\/s)?)?$/i;

const ACTIVITY_STATUS_PRIORITY = Object.freeze({
  activeTimedEsc: 500,
  activeTimed: 450,
  completedFilesSpeed: 400,
  completedFilesBytes: 350,
  completedFilesCount: 300,
  activeVerb: 100
});

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

function getOrCreateActivityState(activityStateBySession, sessionId) {
  let state = activityStateBySession.get(sessionId);
  if (state) {
    return state;
  }
  state = { currentLine: "", retainedCandidate: null };
  activityStateBySession.set(sessionId, state);
  return state;
}

function cloneProgress(progress) {
  if (!progress || typeof progress !== "object") {
    return null;
  }
  return {
    filesDone: progress.filesDone,
    filesTotal: progress.filesTotal,
    bytesDone: progress.bytesDone,
    bytesTotal: progress.bytesTotal,
    speed: progress.speed,
    statusText: progress.statusText,
    priority: progress.priority
  };
}

function cloneCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return {
    lineIndex: candidate.lineIndex,
    priority: candidate.priority,
    statusText: candidate.statusText,
    progress: cloneProgress(candidate.progress)
  };
}

function sameProgress(left, right) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function shouldReplaceRetainedCandidate(current, next) {
  if (!next) {
    return false;
  }
  if (!current) {
    return true;
  }
  if (next.priority !== current.priority) {
    return next.priority > current.priority;
  }
  if (next.statusText !== current.statusText) {
    return true;
  }
  return !sameProgress(next.progress, current.progress);
}

function collectDetectionLines(activityState, chunk) {
  const lines = [];
  const normalizedChunk = stripAnsi(String(chunk || ""));
  for (let index = 0; index < normalizedChunk.length; index += 1) {
    const char = normalizedChunk[index];
    const nextChar = normalizedChunk[index + 1];
    if (char === "\r" && nextChar === "\n") {
      lines.push(activityState.currentLine);
      activityState.currentLine = "";
      index += 1;
      continue;
    }
    if (char === "\r") {
      lines.push(activityState.currentLine);
      activityState.currentLine = "";
      continue;
    }
    if (char === "\n") {
      lines.push(activityState.currentLine);
      activityState.currentLine = "";
      continue;
    }
    activityState.currentLine += char;
  }
  lines.push(activityState.currentLine);
  return lines
    .map((line) => normalizeDetectionLine(line))
    .filter(Boolean);
}

function parseCompletedFilesProgressLine(line) {
  const match = normalizeText(line).match(COMPLETED_FILES_PROGRESS_RE);
  if (!match) {
    return null;
  }
  const filesDone = Number.parseInt(match[1], 10);
  const filesTotal = Number.parseInt(match[2], 10);
  if (!Number.isFinite(filesDone) || !Number.isFinite(filesTotal)) {
    return null;
  }
  const hasByteProgress = Boolean(match[3] && match[4] && match[5] && match[6]);
  const bytesDoneValue = hasByteProgress ? Number.parseFloat(match[3]) : null;
  const bytesDoneUnit = hasByteProgress ? match[4] : "";
  const bytesTotalValue = hasByteProgress ? Number.parseFloat(match[5]) : null;
  const bytesTotalUnit = hasByteProgress ? match[6] : "";
  const hasSpeed = hasByteProgress && Boolean(match[7] && match[8]);
  const speedValue = hasSpeed ? Number.parseFloat(match[7]) : null;
  const speedUnit = hasSpeed ? match[8] : "";
  if (
    (hasByteProgress && (!Number.isFinite(bytesDoneValue) || !Number.isFinite(bytesTotalValue))) ||
    (hasSpeed && !Number.isFinite(speedValue))
  ) {
    return null;
  }
  const rawBytesDone = hasByteProgress ? `${match[3]}${match[4]}` : "";
  const rawBytesTotal = hasByteProgress ? `${match[5]}${match[6]}` : "";
  const rawSpeed = hasSpeed ? `${match[7]}${match[8]}/s` : "";
  return {
    filesDone,
    filesTotal,
    bytesDone: hasByteProgress ? `${bytesDoneValue}${bytesDoneUnit}` : "",
    bytesTotal: hasByteProgress ? `${bytesTotalValue}${bytesTotalUnit}` : "",
    speed: hasSpeed ? `${speedValue}${speedUnit}/s` : "",
    statusText: hasSpeed
      ? `Completed files ${filesDone}/${filesTotal} | ${rawBytesDone}/${rawBytesTotal} | ${rawSpeed}`
      : hasByteProgress
        ? `Completed files ${filesDone}/${filesTotal} | ${rawBytesDone}/${rawBytesTotal}`
        : `Completed files ${filesDone}/${filesTotal}`,
    priority: hasSpeed
      ? ACTIVITY_STATUS_PRIORITY.completedFilesSpeed
      : hasByteProgress
        ? ACTIVITY_STATUS_PRIORITY.completedFilesBytes
        : ACTIVITY_STATUS_PRIORITY.completedFilesCount
  };
}

function detectActivityCandidateForLine(line, lineIndex) {
  const codexStatusMatch = line.match(ACTIVE_STATUS_WITH_TIMER_RE);
  if (codexStatusMatch) {
    const status = normalizeText(codexStatusMatch[1]);
    const duration = normalizeText(codexStatusMatch[2]);
    if (status && duration) {
      return {
        lineIndex,
        priority: ACTIVITY_STATUS_PRIORITY.activeTimedEsc,
        statusText: `${titleCaseFirst(status)} (${duration} • esc to interrupt)`,
        progress: null
      };
    }
  }

  const genericTimedMatch = line.match(GENERIC_STATUS_WITH_TIMER_RE);
  if (genericTimedMatch && ACTIVE_VERB_RE.test(genericTimedMatch[1])) {
    return {
      lineIndex,
      priority: ACTIVITY_STATUS_PRIORITY.activeTimed,
      statusText: titleCaseFirst(line),
      progress: null
    };
  }

  const progress = parseCompletedFilesProgressLine(line);
  if (progress) {
    return {
      lineIndex,
      priority: progress.priority,
      statusText: progress.statusText,
      progress
    };
  }

  const activityVerbMatch = line.match(ACTIVE_VERB_RE);
  if (activityVerbMatch && typeof activityVerbMatch[0] === "string") {
    return {
      lineIndex,
      priority: ACTIVITY_STATUS_PRIORITY.activeVerb,
      statusText: titleCaseFirst(activityVerbMatch[0]),
      progress: null
    };
  }

  return null;
}

function pickHigherPriorityCandidate(current, next) {
  if (!next) {
    return current;
  }
  if (!current) {
    return next;
  }
  if (next.priority !== current.priority) {
    return next.priority > current.priority ? next : current;
  }
  return next.lineIndex >= current.lineIndex ? next : current;
}

function detectActivityStatus(activityStateBySession, sessionId, chunk) {
  const activityState = getOrCreateActivityState(activityStateBySession, sessionId);
  const lines = collectDetectionLines(activityState, chunk);
  let bestCandidate = null;
  lines.forEach((line, lineIndex) => {
    bestCandidate = pickHigherPriorityCandidate(bestCandidate, detectActivityCandidateForLine(line, lineIndex));
  });
  const previousRetainedCandidate = cloneCandidate(activityState.retainedCandidate);
  let emittedCandidate = null;
  if (shouldReplaceRetainedCandidate(activityState.retainedCandidate, bestCandidate)) {
    activityState.retainedCandidate = cloneCandidate(bestCandidate);
    emittedCandidate = cloneCandidate(activityState.retainedCandidate);
  }
  return {
    lines,
    detectedCandidate: cloneCandidate(bestCandidate),
    emittedCandidate,
    retainedCandidate: cloneCandidate(activityState.retainedCandidate),
    previousRetainedCandidate
  };
}

function clearActivityState(activityStateBySession, sessionId) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    return;
  }
  activityStateBySession.delete(normalizedSessionId);
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

export function createBuiltInStreamPlugins(options = {}) {
  const activityStateBySession = new Map();
  const traceActivityDetection =
    typeof options.traceActivityDetection === "function" ? options.traceActivityDetection : () => {};

  return [
    {
      id: "activity-status",
      priority: 0,
      onSessionDispose(session) {
        const sessionId = normalizeText(session?.id);
        if (!sessionId) {
          return;
        }
        activityStateBySession.delete(sessionId);
      },
      onData(session, chunk) {
        const sessionId = normalizeText(session?.id) || "__activity-status__";
        const detection = detectActivityStatus(activityStateBySession, sessionId, chunk);
        traceActivityDetection({
          sessionId,
          chunk: String(chunk || ""),
          lines: detection.lines,
          detectedCandidate: detection.detectedCandidate,
          emittedCandidate: detection.emittedCandidate,
          retainedCandidate: detection.retainedCandidate,
          previousRetainedCandidate: detection.previousRetainedCandidate
        });
        const actions = [];
        if (detection.emittedCandidate?.statusText) {
          actions.push(...createWorkingActions(detection.emittedCandidate.statusText));
        }
        actions.push(...createProgressMetaActions(detection.emittedCandidate?.progress || null));
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
        clearActivityState(activityStateBySession, session?.id);
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
        clearActivityState(activityStateBySession, session?.id);
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
