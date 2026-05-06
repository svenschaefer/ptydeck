import { homedir } from "node:os";
import { ApiError } from "./errors.js";
import {
  normalizeRemoteAuth,
  normalizeRemoteConnection,
  normalizeRemoteSecret,
  remoteAuthRequiresSecret
} from "./session-launch-spec.js";
import { buildRemoteRuntimeMeta } from "./session-manager-remote-runtime.js";
import { normalizeSessionInputSafetyProfile } from "./session-input-safety-profile.js";
import { normalizeSessionMouseForwardingMode } from "./session-mouse-forwarding.js";
import { normalizeQuickSendUsageEntries } from "./session-quick-send-usage.js";

const DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS = 16 * 1024;
const DEFAULT_SSH_CLIENT = "ssh";
const SESSION_KIND_LOCAL = "local";
const SESSION_KIND_SSH = "ssh";
const THEME_COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SESSION_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_NOTE_MAX_LENGTH = 512;
const DEFAULT_SESSION_THEME_PROFILE = {
  background: "#0a0d12",
  foreground: "#d8dee9",
  cursor: "#8ec07c",
  black: "#0a0d12",
  red: "#fb4934",
  green: "#8ec07c",
  yellow: "#fabd2f",
  blue: "#83a598",
  magenta: "#b48ead",
  cyan: "#8fbcbb",
  white: "#d8dee9",
  brightBlack: "#4b5563",
  brightRed: "#ff6b5a",
  brightGreen: "#a5d68a",
  brightYellow: "#ffd36a",
  brightBlue: "#98b6cc",
  brightMagenta: "#c8a7d8",
  brightCyan: "#a9d9d6",
  brightWhite: "#f5f7fa"
};
const SESSION_STATE_STARTING = "starting";
const SESSION_ACTIVITY_STATE_INACTIVE = "inactive";

function getTextLength(value) {
  return typeof value === "string" ? value.length : 0;
}

function normalizeSessionKind(kind) {
  return String(kind || "").trim().toLowerCase() === SESSION_KIND_SSH ? SESSION_KIND_SSH : SESSION_KIND_LOCAL;
}

function normalizeSessionEnv(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  const normalized = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof key !== "string" || typeof value !== "string") {
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function normalizeSessionThemeProfile(themeProfile) {
  const input = themeProfile && typeof themeProfile === "object" && !Array.isArray(themeProfile) ? themeProfile : {};
  const normalized = {};
  for (const [key, defaultValue] of Object.entries(DEFAULT_SESSION_THEME_PROFILE)) {
    const candidate = typeof input[key] === "string" ? input[key] : defaultValue;
    normalized[key] = THEME_COLOR_HEX_PATTERN.test(candidate) ? candidate : defaultValue;
  }
  return normalized;
}

function normalizeSessionThemeSlots({ themeProfile, activeThemeProfile, inactiveThemeProfile } = {}) {
  const fallbackTheme = normalizeSessionThemeProfile(themeProfile);
  const normalizedActiveThemeProfile =
    activeThemeProfile !== undefined
      ? normalizeSessionThemeProfile(activeThemeProfile)
      : fallbackTheme;
  const normalizedInactiveThemeProfile =
    inactiveThemeProfile !== undefined
      ? normalizeSessionThemeProfile(inactiveThemeProfile)
      : fallbackTheme;
  return {
    themeProfile: normalizedActiveThemeProfile,
    activeThemeProfile: normalizedActiveThemeProfile,
    inactiveThemeProfile: normalizedInactiveThemeProfile
  };
}

function normalizeSessionTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const entry of tags) {
    if (typeof entry !== "string") {
      continue;
    }
    const candidate = entry.trim().toLowerCase();
    if (!candidate || !SESSION_TAG_PATTERN.test(candidate) || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    normalized.push(candidate);
  }
  normalized.sort((a, b) => a.localeCompare(b, "en-US", { sensitivity: "base" }));
  return normalized;
}

function normalizeSessionNote(note) {
  if (typeof note !== "string") {
    return undefined;
  }
  const normalized = note
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > SESSION_NOTE_MAX_LENGTH) {
    return normalized.slice(0, SESSION_NOTE_MAX_LENGTH);
  }
  return normalized;
}

function normalizeQuickIdToken(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export function normalizeReplayShellBlocks(shellBlocks, maxLength) {
  const effectiveMaxLength = Number.isInteger(maxLength) && maxLength >= 0 ? maxLength : 0;
  return (Array.isArray(shellBlocks) ? shellBlocks : [])
    .map((entry) => {
      const start = Number.isInteger(entry?.start) ? entry.start : -1;
      const end = Number.isInteger(entry?.end) ? entry.end : -1;
      if (start < 0 || end <= start || end > effectiveMaxLength) {
        return null;
      }
      return { start, end };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
}

export function buildReplayRetentionResult(value, maxChars = DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS) {
  if (typeof value !== "string" || value.length === 0) {
    return { value: "", truncated: false };
  }
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    return { value: "", truncated: true };
  }
  if (value.length > maxChars) {
    return { value: value.slice(-maxChars), truncated: true };
  }
  return { value, truncated: false };
}

export function buildReplayRetentionState(
  value,
  shellBlocks = [],
  currentShellBlockStart = null,
  maxChars = DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS
) {
  const replayOutput = buildReplayRetentionResult(value, maxChars);
  if (!replayOutput.value) {
    return {
      value: "",
      truncated: replayOutput.truncated,
      shellBlocks: [],
      currentShellBlockStart: null
    };
  }
  const trimDelta = getTextLength(value) - replayOutput.value.length;
  const nextShellBlocks = normalizeReplayShellBlocks(shellBlocks, getTextLength(value))
    .map((entry) => ({
      start: entry.start - trimDelta,
      end: entry.end - trimDelta
    }))
    .filter((entry) => entry.start >= 0 && entry.end > entry.start && entry.end <= replayOutput.value.length);
  const nextCurrentShellBlockStart =
    Number.isInteger(currentShellBlockStart) && currentShellBlockStart - trimDelta >= 0
      ? currentShellBlockStart - trimDelta
      : null;
  return {
    value: replayOutput.value,
    truncated: replayOutput.truncated,
    shellBlocks: nextShellBlocks,
    currentShellBlockStart: nextCurrentShellBlockStart
  };
}

export function buildSessionRecord(
  {
    id,
    quickIdToken,
    kind = SESSION_KIND_LOCAL,
    remoteConnection,
    remoteAuth,
    remoteSecret,
    cwd,
    shell,
    name,
    startCwd,
    startCommand = "",
    env = {},
    deckId = "",
    replayOutput = "",
    replayOutputTruncated = false,
    note,
    mouseForwardingMode,
    inputSafetyProfile,
    tags = [],
    quickSendUsage = [],
    themeProfile = {},
    activeThemeProfile,
    inactiveThemeProfile,
    createdAt,
    updatedAt,
    traceSeed = null
  } = {},
  {
    defaultShell = "bash",
    defaultLocalCwd = homedir(),
    buildLaunchBundle,
    createInitialIdentityRuntime,
    remoteReconnectMaxAttempts = 0,
    remoteReconnectDelayMs = 0,
    sessionReplayMemoryMaxChars = DEFAULT_SESSION_REPLAY_MEMORY_MAX_CHARS,
    nowFn = Date.now
  } = {}
) {
  if (typeof buildLaunchBundle !== "function") {
    throw new TypeError("buildSessionRecord requires a buildLaunchBundle function.");
  }
  if (typeof createInitialIdentityRuntime !== "function") {
    throw new TypeError("buildSessionRecord requires a createInitialIdentityRuntime function.");
  }
  const createdTimestamp = Number.isInteger(createdAt) ? createdAt : nowFn();
  const updatedTimestamp = Number.isInteger(updatedAt) ? updatedAt : createdTimestamp;
  const initialActivityTimestamp = Number.isInteger(updatedAt) ? updatedAt : createdTimestamp;
  const normalizedKind = normalizeSessionKind(kind);
  const normalizedStartCwd =
    typeof startCwd === "string" && startCwd.trim()
      ? startCwd
      : typeof cwd === "string" && cwd.trim()
        ? cwd
        : normalizedKind === SESSION_KIND_SSH
          ? "~"
          : defaultLocalCwd;
  const normalizedStartCommand = typeof startCommand === "string" ? startCommand : "";
  const normalizedEnv = normalizeSessionEnv(env);
  const normalizedNote = normalizeSessionNote(note);
  const normalizedMouseForwardingMode = normalizeSessionMouseForwardingMode(mouseForwardingMode, { strict: false });
  const normalizedInputSafetyProfile = normalizeSessionInputSafetyProfile(inputSafetyProfile, { strict: false });
  const normalizedTags = normalizeSessionTags(tags);
  const normalizedQuickSendUsage = normalizeQuickSendUsageEntries(quickSendUsage);
  const normalizedQuickIdToken = normalizeQuickIdToken(quickIdToken);
  const normalizedRemoteConnection = normalizeRemoteConnection(remoteConnection, normalizedKind);
  const normalizedRemoteAuth = normalizeRemoteAuth(remoteAuth, normalizedKind);
  const normalizedRemoteSecret = normalizeRemoteSecret(remoteSecret, normalizedRemoteAuth, normalizedKind);
  const normalizedShell =
    typeof shell === "string" && shell.trim()
      ? shell.trim()
      : normalizedKind === SESSION_KIND_SSH
        ? DEFAULT_SSH_CLIENT
        : defaultShell;
  const normalizedThemeSlots = normalizeSessionThemeSlots({
    themeProfile,
    activeThemeProfile,
    inactiveThemeProfile
  });
  const localSpawnCwd =
    normalizedKind === SESSION_KIND_SSH
      ? defaultLocalCwd
      : typeof cwd === "string" && cwd.trim()
        ? cwd
        : normalizedStartCwd;
  const launchBundle = buildLaunchBundle({
    kind: normalizedKind,
    shell: normalizedShell,
    cwd: localSpawnCwd,
    startCwd: normalizedStartCwd,
    startCommand: normalizedStartCommand,
    env: normalizedEnv,
    remoteConnection: normalizedRemoteConnection,
    remoteAuth: normalizedRemoteAuth,
    remoteSecret: normalizedRemoteSecret
  });
  if (!launchBundle?.launchSpec || typeof launchBundle.launchSpec !== "object") {
    throw new TypeError("buildLaunchBundle must return an object with a launchSpec.");
  }
  const initialReplayOutput = buildReplayRetentionResult(replayOutput, sessionReplayMemoryMaxChars);
  const identityRuntime = createInitialIdentityRuntime(
    {
      kind: normalizedKind,
      shell: normalizedShell,
      ...(typeof name === "string" ? { name } : {}),
      startCommand: normalizedStartCommand
    },
    { updatedAt: updatedTimestamp }
  );
  const initialAppIdentity = identityRuntime.appIdentity;
  return {
    session: {
      id,
      ptyProcess: null,
      shellAdapter: null,
      appIdentityState: identityRuntime.appIdentityState,
      terminalSignalState: identityRuntime.terminalSignalState,
      cwdTrackingBuffer: "",
      outputBuffer: initialReplayOutput.value,
      outputTruncated: replayOutputTruncated === true || initialReplayOutput.truncated,
      replayShellBlocks: [],
      currentShellBlockStart: null,
      replayShellBlockTrackingSupported: false,
      activityTimer: null,
      foregroundProcessRefreshTimer: null,
      launchPostStartInputTimer: null,
      remoteReconnectTimer: null,
      remoteReconnectStabilizeTimer: null,
      expectedExitReasonTimer: null,
      expectedExitReason: "",
      lastActivityAt: initialActivityTimestamp,
      pendingLaunchPostStartInput: null,
      pendingStartupTerminalQueryFallback: null,
      remoteSecret: normalizedRemoteSecret,
      traceSeed,
      meta: {
        id,
        kind: normalizedKind,
        ...(normalizedRemoteConnection ? { remoteConnection: normalizedRemoteConnection } : {}),
        ...(normalizedRemoteAuth ? { remoteAuth: normalizedRemoteAuth } : {}),
        cwd: launchBundle.launchSpec.metaCwd,
        shell: launchBundle.launchSpec.command,
        ...(typeof name === "string" ? { name } : {}),
        ...(normalizedQuickIdToken ? { quickIdToken: normalizedQuickIdToken } : {}),
        ...(typeof deckId === "string" && deckId.trim() ? { deckId: deckId.trim() } : {}),
        startCwd: normalizedStartCwd,
        startCommand: normalizedStartCommand,
        env: normalizedEnv,
        ...(normalizedNote ? { note: normalizedNote } : {}),
        mouseForwardingMode: normalizedMouseForwardingMode,
        inputSafetyProfile: normalizedInputSafetyProfile,
        tags: normalizedTags,
        quickSendUsage: normalizedQuickSendUsage,
        ...(normalizedKind === SESSION_KIND_SSH
          ? {
              remoteRuntime: buildRemoteRuntimeMeta({
                reconnectMaxAttempts: remoteReconnectMaxAttempts,
                reconnectDelayMs: remoteReconnectDelayMs
              })
            }
          : {}),
        themeProfile: normalizedThemeSlots.themeProfile,
        activeThemeProfile: normalizedThemeSlots.activeThemeProfile,
        inactiveThemeProfile: normalizedThemeSlots.inactiveThemeProfile,
        appIdentity: initialAppIdentity,
        state: SESSION_STATE_STARTING,
        activityState: SESSION_ACTIVITY_STATE_INACTIVE,
        activityUpdatedAt: initialActivityTimestamp,
        activityCompletedAt: null,
        startedAt: null,
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp
      }
    },
    launchBundle
  };
}

export function applySessionPatch(
  session,
  patch = {},
  {
    defaultShell = "bash",
    defaultLocalCwd = homedir(),
    remoteReconnectMaxAttempts = 0,
    remoteReconnectDelayMs = 0,
    clearRemoteReconnectTimers = () => {},
    clearExpectedExitReason = () => {},
    nowFn = Date.now
  } = {}
) {
  if (!session?.meta) {
    throw new TypeError("applySessionPatch requires a session record with meta.");
  }
  const currentKind = normalizeSessionKind(session.meta.kind);
  const nextKind = normalizeSessionKind(patch.kind !== undefined ? patch.kind : currentKind);
  const kindChanged = nextKind !== currentKind;
  const nextRemoteAuth =
    patch.remoteAuth !== undefined || patch.kind !== undefined
      ? normalizeRemoteAuth(
          patch.remoteAuth !== undefined ? patch.remoteAuth : kindChanged ? undefined : session.meta.remoteAuth,
          nextKind
        )
      : session.meta.remoteAuth;
  if (patch.name !== undefined) {
    session.meta.name = patch.name;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "quickIdToken")) {
    const normalizedQuickIdToken = normalizeQuickIdToken(patch.quickIdToken);
    if (normalizedQuickIdToken) {
      session.meta.quickIdToken = normalizedQuickIdToken;
    } else {
      delete session.meta.quickIdToken;
    }
  }
  if (patch.startCwd !== undefined) {
    session.meta.startCwd = patch.startCwd;
  }
  if (patch.startCommand !== undefined) {
    session.meta.startCommand = patch.startCommand;
  }
  if (patch.kind !== undefined) {
    session.meta.kind = nextKind;
    session.meta.shell = nextKind === SESSION_KIND_SSH ? DEFAULT_SSH_CLIENT : defaultShell;
    if (patch.startCwd === undefined) {
      session.meta.startCwd = nextKind === SESSION_KIND_SSH ? "~" : defaultLocalCwd;
    }
    session.meta.cwd = nextKind === SESSION_KIND_SSH ? session.meta.startCwd || "~" : session.meta.startCwd || defaultLocalCwd;
    if (nextKind === SESSION_KIND_SSH) {
      session.meta.remoteRuntime = buildRemoteRuntimeMeta({
        reconnectMaxAttempts: remoteReconnectMaxAttempts,
        reconnectDelayMs: remoteReconnectDelayMs
      });
    } else {
      delete session.meta.remoteRuntime;
      clearRemoteReconnectTimers(session);
      clearExpectedExitReason(session);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "remoteConnection") || patch.kind !== undefined) {
    const normalizedRemoteConnection = normalizeRemoteConnection(
      Object.prototype.hasOwnProperty.call(patch, "remoteConnection")
        ? patch.remoteConnection
        : kindChanged
          ? undefined
          : session.meta.remoteConnection,
      nextKind
    );
    if (normalizedRemoteConnection) {
      session.meta.remoteConnection = normalizedRemoteConnection;
    } else {
      delete session.meta.remoteConnection;
    }
  }
  if (patch.remoteAuth !== undefined || patch.kind !== undefined) {
    if (nextRemoteAuth) {
      session.meta.remoteAuth = nextRemoteAuth;
    } else {
      delete session.meta.remoteAuth;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "remoteSecret")) {
    session.remoteSecret = normalizeRemoteSecret(patch.remoteSecret, nextRemoteAuth, nextKind);
  } else if (remoteAuthRequiresSecret(nextRemoteAuth) && !session.remoteSecret) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteSecret' is required when changing to password or keyboardInteractive ssh auth."
    );
  } else if (!remoteAuthRequiresSecret(nextRemoteAuth)) {
    session.remoteSecret = undefined;
  }
  if (patch.env !== undefined) {
    session.meta.env = normalizeSessionEnv(patch.env);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "note")) {
    const normalizedNote = normalizeSessionNote(patch.note);
    if (normalizedNote) {
      session.meta.note = normalizedNote;
    } else {
      delete session.meta.note;
    }
  }
  if (patch.mouseForwardingMode !== undefined) {
    session.meta.mouseForwardingMode = normalizeSessionMouseForwardingMode(patch.mouseForwardingMode, { strict: false });
  }
  if (patch.inputSafetyProfile !== undefined) {
    session.meta.inputSafetyProfile = normalizeSessionInputSafetyProfile(patch.inputSafetyProfile, { strict: false });
  }
  if (patch.tags !== undefined) {
    session.meta.tags = normalizeSessionTags(patch.tags);
  }
  if (
    patch.themeProfile !== undefined ||
    patch.activeThemeProfile !== undefined ||
    patch.inactiveThemeProfile !== undefined
  ) {
    const nextActiveThemeInput =
      patch.activeThemeProfile !== undefined
        ? patch.activeThemeProfile
        : patch.themeProfile !== undefined
          ? patch.themeProfile
          : session.meta.activeThemeProfile;
    const normalizedThemeSlots = normalizeSessionThemeSlots({
      themeProfile: nextActiveThemeInput,
      activeThemeProfile: nextActiveThemeInput,
      inactiveThemeProfile:
        patch.inactiveThemeProfile !== undefined ? patch.inactiveThemeProfile : session.meta.inactiveThemeProfile
    });
    session.meta.themeProfile = normalizedThemeSlots.themeProfile;
    session.meta.activeThemeProfile = normalizedThemeSlots.activeThemeProfile;
    session.meta.inactiveThemeProfile = normalizedThemeSlots.inactiveThemeProfile;
  }
  const updatedAt = nowFn();
  session.meta.updatedAt = updatedAt;
  return {
    session,
    updatedAt
  };
}

export function buildRestartSessionCreatePayload({
  sessionMeta,
  remoteSecret,
  updatedAt,
  trace
} = {}) {
  const snapshot = sessionMeta && typeof sessionMeta === "object" && !Array.isArray(sessionMeta) ? sessionMeta : {};
  const restartCwd =
    typeof snapshot.startCwd === "string" && snapshot.startCwd.trim()
      ? snapshot.startCwd
      : typeof snapshot.cwd === "string" && snapshot.cwd.trim()
        ? snapshot.cwd
        : undefined;
  return {
    id: snapshot.id,
    kind: snapshot.kind,
    remoteConnection: snapshot.remoteConnection,
    remoteAuth: snapshot.remoteAuth,
    remoteSecret,
    quickIdToken: snapshot.quickIdToken,
    cwd: restartCwd,
    shell: snapshot.shell,
    name: snapshot.name,
    startCwd: restartCwd,
    startCommand: typeof snapshot.startCommand === "string" ? snapshot.startCommand : "",
    env: snapshot.env && typeof snapshot.env === "object" && !Array.isArray(snapshot.env) ? snapshot.env : {},
    note: snapshot.note,
    mouseForwardingMode: snapshot.mouseForwardingMode,
    inputSafetyProfile: snapshot.inputSafetyProfile,
    tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    quickSendUsage: Array.isArray(snapshot.quickSendUsage) ? snapshot.quickSendUsage : [],
    themeProfile: snapshot.themeProfile && typeof snapshot.themeProfile === "object" && !Array.isArray(snapshot.themeProfile)
      ? snapshot.themeProfile
      : {},
    activeThemeProfile: snapshot.activeThemeProfile,
    inactiveThemeProfile: snapshot.inactiveThemeProfile,
    createdAt: snapshot.createdAt,
    updatedAt,
    trace
  };
}
