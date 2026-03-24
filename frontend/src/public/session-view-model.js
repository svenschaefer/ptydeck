export function formatSessionDisplayName(session) {
  return session?.name || String(session?.id || "").slice(0, 8);
}

export function createSessionViewModel(options = {}) {
  const defaultDeckId = String(options.defaultDeckId || "default").trim() || "default";
  const sessionTagPattern = options.sessionTagPattern || /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
  const sessionTagMaxEntries = Number.isInteger(options.sessionTagMaxEntries) ? options.sessionTagMaxEntries : 32;
  const sessionTagMaxLength = Number.isInteger(options.sessionTagMaxLength) ? options.sessionTagMaxLength : 32;
  const sessionEnvKeyPattern = options.sessionEnvKeyPattern || /^[A-Za-z_][A-Za-z0-9_]*$/;
  const sessionEnvMaxEntries = Number.isInteger(options.sessionEnvMaxEntries) ? options.sessionEnvMaxEntries : 64;
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const displayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : formatSessionDisplayName;

  function resolveSessionDeckId(session) {
    const deckId = String(session?.deckId || "").trim();
    return deckId || defaultDeckId;
  }

  function getSessionRuntimeState(session) {
    const lifecycleState = String(session?.lifecycleState || "").trim().toLowerCase();
    if (
      lifecycleState === "created" ||
      lifecycleState === "starting" ||
      lifecycleState === "running" ||
      lifecycleState === "busy" ||
      lifecycleState === "idle" ||
      lifecycleState === "unrestored" ||
      lifecycleState === "exited" ||
      lifecycleState === "closed"
    ) {
      return lifecycleState;
    }
    const state = String(session?.state || "").trim().toLowerCase();
    if (
      state === "created" ||
      state === "starting" ||
      state === "running" ||
      state === "busy" ||
      state === "idle" ||
      state === "unrestored" ||
      state === "exited" ||
      state === "closed"
    ) {
      return state;
    }
    return "running";
  }

  function isSessionUnrestored(session) {
    return getSessionRuntimeState(session) === "unrestored";
  }

  function isSessionExited(session) {
    return getSessionRuntimeState(session) === "exited";
  }

  function isSessionActionBlocked(session) {
    return isSessionUnrestored(session) || isSessionExited(session);
  }

  function getSessionStateBadgeText(session) {
    if (getSessionRuntimeState(session) === "starting") {
      return "STARTING";
    }
    if (isSessionUnrestored(session)) {
      return "UNRESTORED";
    }
    if (isSessionExited(session)) {
      return "EXITED";
    }
    return "";
  }

  function hasSessionLiveActivity(session) {
    return session?.hasLiveActivity === true;
  }

  function hasSessionUnreadActivity(session) {
    return session?.hasUnreadActivity === true;
  }

  function getSessionActivityIndicatorState(session) {
    if (hasSessionLiveActivity(session)) {
      return "live";
    }
    if (hasSessionUnreadActivity(session)) {
      return "unseen";
    }
    return "";
  }

  function getExitedSessionStatusSuffix(session) {
    const details = [];
    if (Number.isInteger(session?.exitCode)) {
      details.push(`exit code ${session.exitCode}`);
    }
    const signal = String(session?.exitSignal || "").trim();
    if (signal) {
      details.push(`signal ${signal}`);
    }
    return details.length > 0 ? ` (${details.join(", ")})` : "";
  }

  function getSessionStateHintText(session) {
    if (getSessionRuntimeState(session) === "starting") {
      return "Session is starting. Input and output will become active as soon as the PTY is ready.";
    }
    if (isSessionUnrestored(session)) {
      return "Session could not be restored after backend restart. Update settings or delete this session.";
    }
    if (isSessionExited(session)) {
      return `Session process exited${getExitedSessionStatusSuffix(session)}. Rename, restart, input, resize, and settings changes are disabled. Delete this session to remove the card.`;
    }
    return "";
  }

  function getUnrestoredSessionMessage(session) {
    const label = `[${formatSessionToken(session.id)}] ${displayName(session)}`;
    return `Session ${label} is unrestored after backend restart. Input, resize, and restart are disabled.`;
  }

  function getExitedSessionMessage(session) {
    const label = `[${formatSessionToken(session.id)}] ${displayName(session)}`;
    return `Session ${label} has exited${getExitedSessionStatusSuffix(session)}. Rename, restart, input, resize, and settings changes are disabled. Delete this session to remove the card.`;
  }

  function getBlockedSessionActionMessage(sessions, actionLabel) {
    const labels = sessions.map((session) => `[${formatSessionToken(session.id)}] ${displayName(session)}`);
    if (labels.length === 1) {
      return `${actionLabel} blocked for ${getSessionRuntimeState(sessions[0])} session ${labels[0]}.`;
    }
    const annotatedLabels = sessions.map(
      (session) => `[${formatSessionToken(session.id)}] ${displayName(session)} [${getSessionRuntimeState(session)}]`
    );
    return `${actionLabel} blocked for non-interactive sessions: ${annotatedLabels.join(", ")}.`;
  }

  function formatSessionEnv(env) {
    if (!env || typeof env !== "object") {
      return "";
    }
    return Object.entries(env)
      .filter(([key, value]) => typeof key === "string" && typeof value === "string")
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
  }

  function normalizeSessionTags(tags) {
    if (!Array.isArray(tags)) {
      return [];
    }
    const dedupe = new Set();
    for (const rawTag of tags) {
      if (typeof rawTag !== "string") {
        continue;
      }
      const normalized = rawTag.trim().toLowerCase();
      if (!normalized || normalized.length > sessionTagMaxLength || !sessionTagPattern.test(normalized)) {
        continue;
      }
      dedupe.add(normalized);
      if (dedupe.size >= sessionTagMaxEntries) {
        break;
      }
    }
    return Array.from(dedupe).sort((left, right) => left.localeCompare(right, "en-US", { sensitivity: "base" }));
  }

  function formatSessionTags(tags) {
    return normalizeSessionTags(tags).join(", ");
  }

  function parseSessionTags(rawText) {
    const raw = String(rawText || "").trim();
    if (!raw) {
      return { ok: true, tags: [] };
    }
    const parts = raw
      .split(/[\s,\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (parts.length > sessionTagMaxEntries) {
      return {
        ok: false,
        error: `Tag list exceeds maximum entries (${sessionTagMaxEntries}).`
      };
    }
    const dedupe = new Set();
    for (const rawTag of parts) {
      const normalized = rawTag.toLowerCase();
      if (!normalized || normalized.length > sessionTagMaxLength || !sessionTagPattern.test(normalized)) {
        return {
          ok: false,
          error: `Invalid tag '${rawTag}'. Tags must match ${sessionTagPattern} and be <= ${sessionTagMaxLength} chars.`
        };
      }
      dedupe.add(normalized);
    }
    return {
      ok: true,
      tags: Array.from(dedupe).sort((left, right) => left.localeCompare(right, "en-US", { sensitivity: "base" }))
    };
  }

  function parseSessionEnv(rawText) {
    const lines = String(rawText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > sessionEnvMaxEntries) {
      return {
        ok: false,
        error: `Environment variable list exceeds maximum entries (${sessionEnvMaxEntries}).`
      };
    }
    const env = {};
    for (const line of lines) {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        return { ok: false, error: `Invalid env line '${line}'. Expected KEY=VALUE.` };
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1);
      if (!sessionEnvKeyPattern.test(key)) {
        return { ok: false, error: `Invalid env variable name '${key}'.` };
      }
      env[key] = value;
    }
    return { ok: true, env };
  }

  function normalizeSessionStartupFromSession(session) {
    return {
      startCwd: typeof session?.startCwd === "string" ? session.startCwd : "",
      startCommand: typeof session?.startCommand === "string" ? session.startCommand : "",
      env: session?.env && typeof session.env === "object" ? session.env : {},
      tags: normalizeSessionTags(session?.tags)
    };
  }

  return {
    formatSessionDisplayName: displayName,
    resolveSessionDeckId,
    getSessionRuntimeState,
    isSessionUnrestored,
    isSessionExited,
    isSessionActionBlocked,
    hasSessionLiveActivity,
    hasSessionUnreadActivity,
    getSessionActivityIndicatorState,
    getSessionStateBadgeText,
    getExitedSessionStatusSuffix,
    getSessionStateHintText,
    getUnrestoredSessionMessage,
    getExitedSessionMessage,
    getBlockedSessionActionMessage,
    formatSessionEnv,
    normalizeSessionTags,
    formatSessionTags,
    parseSessionTags,
    parseSessionEnv,
    normalizeSessionStartupFromSession
  };
}
