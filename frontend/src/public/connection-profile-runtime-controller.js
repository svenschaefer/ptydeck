import { createConnectionProfileRuntimeActions } from "./connection-profile-runtime-actions.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function clearChildren(element) {
  if (!element || typeof element.removeChild !== "function") {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function cloneStringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => {
        const normalizedKey = normalizeText(key);
        if (!normalizedKey || typeof entryValue !== "string") {
          return null;
        }
        return [normalizedKey, entryValue];
      })
      .filter(Boolean)
  );
}

function cloneThemeProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const normalized = cloneStringRecord(value);
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function cloneRemoteConnection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const host = normalizeText(value.host);
  const port = Number.parseInt(String(value.port ?? ""), 10);
  const username = normalizeText(value.username);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }
  return {
    host,
    port,
    ...(username ? { username } : {})
  };
}

function cloneRemoteAuth(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const method = normalizeText(value.method);
  const privateKeyPath = normalizeText(value.privateKeyPath);
  if (!["password", "privateKey", "keyboardInteractive"].includes(method)) {
    return undefined;
  }
  return {
    method,
    ...(privateKeyPath ? { privateKeyPath } : {})
  };
}

function normalizeTagList(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const rawTag of tags) {
    const tag = normalizeText(rawTag);
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

export function normalizeConnectionProfileLaunch(launch) {
  if (!launch || typeof launch !== "object" || Array.isArray(launch)) {
    return null;
  }
  const kind = normalizeLower(launch.kind) === "ssh" ? "ssh" : "local";
  const deckId = normalizeText(launch.deckId) || "default";
  const shell = normalizeText(launch.shell);
  const startCwd = normalizeText(launch.startCwd);
  const startCommand = typeof launch.startCommand === "string" ? launch.startCommand : "";
  if (!shell || !startCwd) {
    return null;
  }
  const activeThemeProfile = cloneThemeProfile(launch.activeThemeProfile) || cloneThemeProfile(launch.themeProfile);
  const inactiveThemeProfile = cloneThemeProfile(launch.inactiveThemeProfile) || cloneThemeProfile(launch.themeProfile);
  if (!activeThemeProfile || !inactiveThemeProfile) {
    return null;
  }
  return {
    kind,
    deckId,
    shell,
    startCwd,
    startCommand,
    env: cloneStringRecord(launch.env),
    tags: normalizeTagList(launch.tags),
    ...(cloneThemeProfile(launch.themeProfile) ? { themeProfile: cloneThemeProfile(launch.themeProfile) } : {}),
    activeThemeProfile,
    inactiveThemeProfile,
    ...(cloneRemoteConnection(launch.remoteConnection) ? { remoteConnection: cloneRemoteConnection(launch.remoteConnection) } : {}),
    ...(cloneRemoteAuth(launch.remoteAuth) ? { remoteAuth: cloneRemoteAuth(launch.remoteAuth) } : {})
  };
}

export function normalizeConnectionProfileRecord(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }
  const id = normalizeText(profile.id);
  const name = normalizeText(profile.name);
  const launch = normalizeConnectionProfileLaunch(profile.launch);
  if (!id || !name || !launch) {
    return null;
  }
  return {
    id,
    name,
    createdAt: Number.isInteger(profile.createdAt) ? profile.createdAt : 0,
    updatedAt: Number.isInteger(profile.updatedAt) ? profile.updatedAt : 0,
    launch
  };
}

function normalizeConnectionProfileCollection(profiles) {
  const next = [];
  const seen = new Set();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const normalized = normalizeConnectionProfileRecord(profile);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    next.push(normalized);
  }
  next.sort((left, right) => {
    const nameCompare = left.name.localeCompare(right.name, "en-US", { sensitivity: "base" });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.id.localeCompare(right.id, "en-US", { sensitivity: "base" });
  });
  return next;
}

export function resolveConnectionProfileToken(profiles, token) {
  const normalizedToken = normalizeLower(token);
  if (!normalizedToken) {
    return { profile: null, error: "Connection profile target is required." };
  }
  const entries = normalizeConnectionProfileCollection(profiles);
  const exactId = entries.find((entry) => entry.id.toLowerCase() === normalizedToken);
  if (exactId) {
    return { profile: exactId, error: "" };
  }
  const exactName = entries.find((entry) => entry.name.toLowerCase() === normalizedToken);
  if (exactName) {
    return { profile: exactName, error: "" };
  }
  const matches = entries.filter(
    (entry) => entry.id.toLowerCase().startsWith(normalizedToken) || entry.name.toLowerCase().startsWith(normalizedToken)
  );
  if (matches.length === 1) {
    return { profile: matches[0], error: "" };
  }
  if (matches.length === 0) {
    return { profile: null, error: `Unknown connection profile: ${token}` };
  }
  return {
    profile: null,
    error: `Ambiguous connection profile '${token}': ${matches.map((entry) => entry.id).join(", ")}`
  };
}

export function buildConnectionProfileLaunchFromSession(session, options = {}) {
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const normalizeThemeProfile =
    typeof options.normalizeThemeProfile === "function"
      ? options.normalizeThemeProfile
      : (value) => (value && typeof value === "object" ? value : {});
  const source = session && typeof session === "object" ? session : null;
  if (!source) {
    return null;
  }
  const kind = normalizeLower(source.kind) === "ssh" ? "ssh" : "local";
  const shell = normalizeText(source.shell);
  const startCwd = normalizeText(source.startCwd) || normalizeText(source.cwd);
  if (!shell || !startCwd) {
    return null;
  }
  const activeThemeProfile = normalizeThemeProfile(source.activeThemeProfile || source.themeProfile || {});
  const inactiveThemeProfile = normalizeThemeProfile(source.inactiveThemeProfile || source.themeProfile || {});
  return normalizeConnectionProfileLaunch({
    kind,
    deckId: normalizeText(source.deckId) || defaultDeckId,
    shell,
    startCwd,
    startCommand: typeof source.startCommand === "string" ? source.startCommand : "",
    env: source.env && typeof source.env === "object" ? source.env : {},
    tags: Array.isArray(source.tags) ? source.tags : [],
    themeProfile: normalizeThemeProfile(source.themeProfile || activeThemeProfile),
    activeThemeProfile,
    inactiveThemeProfile,
    remoteConnection: source.remoteConnection,
    remoteAuth: source.remoteAuth
  });
}

function authMethodRequiresSecret(remoteAuth) {
  const method = normalizeLower(remoteAuth?.method);
  return method === "password" || method === "keyboardinteractive";
}

export function formatConnectionProfileSummary(profile) {
  const normalized = normalizeConnectionProfileRecord(profile);
  if (!normalized) {
    return "";
  }
  const parts = [
    `kind=${normalized.launch.kind}`,
    `deck=${normalized.launch.deckId}`,
    `shell=${normalized.launch.shell}`
  ];
  if (normalized.launch.kind === "ssh") {
    const host = normalized.launch.remoteConnection?.host || "?";
    const port = normalized.launch.remoteConnection?.port || 22;
    const username = normalized.launch.remoteConnection?.username || "";
    parts.push(`target=${username ? `${username}@` : ""}${host}:${port}`);
  }
  return `[${normalized.id}] ${normalized.name} -> ${parts.join(" ")}`;
}

export function formatConnectionProfileReport(profile) {
  const normalized = normalizeConnectionProfileRecord(profile);
  if (!normalized) {
    return "";
  }
  const launch = normalized.launch;
  return [
    `[${normalized.id}] ${normalized.name}`,
    `kind=${JSON.stringify(launch.kind)}`,
    `deckId=${JSON.stringify(launch.deckId)}`,
    `shell=${JSON.stringify(launch.shell)}`,
    `startCwd=${JSON.stringify(launch.startCwd)}`,
    `startCommand=${JSON.stringify(launch.startCommand || "")}`,
    `env=${JSON.stringify(launch.env || {})}`,
    `tags=${JSON.stringify(Array.isArray(launch.tags) ? launch.tags : [])}`,
    `remoteConnection=${JSON.stringify(launch.remoteConnection || null)}`,
    `remoteAuth=${JSON.stringify(launch.remoteAuth || null)}`,
    `activeThemeProfile=${JSON.stringify(launch.activeThemeProfile || {})}`,
    `inactiveThemeProfile=${JSON.stringify(launch.inactiveThemeProfile || {})}`
  ].join("\n");
}

function buildBlankConnectionProfileLaunch(options = {}) {
  const kind = normalizeLower(options.kind) === "ssh" ? "ssh" : "local";
  const deckId = normalizeText(options.deckId) || "default";
  const themeProfile =
    cloneThemeProfile(options.themeProfile) ||
    cloneThemeProfile(options.defaultThemeProfile) || {
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
  return normalizeConnectionProfileLaunch({
    kind,
    deckId,
    shell: kind === "ssh" ? "ssh" : "bash",
    startCwd: kind === "ssh" ? "~" : "/",
    startCommand: "",
    env: {},
    tags: [],
    activeThemeProfile: themeProfile || {},
    inactiveThemeProfile: themeProfile || {},
    ...(kind === "ssh"
      ? {
          remoteConnection: {
            host: "",
            port: 22
          },
          remoteAuth: {
            method: "privateKey",
            privateKeyPath: "~/.ssh/id_ed25519"
          }
        }
      : {})
  });
}

function formatStringRecord(record) {
  return Object.entries(cloneStringRecord(record))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function parseStringRecord(text) {
  const result = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = normalizeText(line.slice(0, separatorIndex));
    const value = line.slice(separatorIndex + 1);
    if (!key) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function formatTags(tags) {
  return normalizeTagList(tags).join(", ");
}

function parseTags(text) {
  return normalizeTagList(String(text || "").split(/[\s,]+/));
}

function normalizeThemePresetCollection(themePresets) {
  const next = [];
  for (const preset of Array.isArray(themePresets) ? themePresets : []) {
    const id = normalizeText(preset?.id);
    const name = normalizeText(preset?.name);
    const category = normalizeLower(preset?.category) === "light" ? "light" : "dark";
    const profile = cloneThemeProfile(preset?.profile);
    if (!id || !name || !profile) {
      continue;
    }
    next.push({ id, name, category, profile });
  }
  return next;
}

function themeProfilesEqual(left, right) {
  const normalizedLeft = cloneThemeProfile(left) || {};
  const normalizedRight = cloneThemeProfile(right) || {};
  const leftEntries = Object.entries(normalizedLeft).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const rightEntries = Object.entries(normalizedRight).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function setSelectOptions(selectEl, options, selectedValue) {
  if (!selectEl) {
    return;
  }
  clearChildren(selectEl);
  for (const optionConfig of Array.isArray(options) ? options : []) {
    const option = optionConfig.documentRef?.createElement?.("option") || {
      value: "",
      textContent: "",
      selected: false,
      disabled: false
    };
    option.value = String(optionConfig.value || "");
    option.textContent = String(optionConfig.label || option.value);
    option.selected = option.value === String(selectedValue || "");
    option.disabled = optionConfig.disabled === true;
    selectEl.appendChild(option);
  }
  selectEl.value = String(selectedValue || "");
}

function normalizeSshTrustEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const id = normalizeText(entry.id);
  const host = normalizeText(entry.host);
  const port = Number.parseInt(String(entry.port ?? ""), 10);
  const keyType = normalizeText(entry.keyType);
  const publicKey = normalizeText(entry.publicKey);
  const fingerprintSha256 = normalizeText(entry.fingerprintSha256);
  if (!id || !host || !Number.isInteger(port) || port < 1 || port > 65535 || !keyType || !publicKey || !fingerprintSha256) {
    return null;
  }
  return {
    id,
    host,
    port,
    keyType,
    publicKey,
    fingerprintSha256,
    createdAt: Number.isInteger(entry.createdAt) ? entry.createdAt : 0,
    updatedAt: Number.isInteger(entry.updatedAt) ? entry.updatedAt : 0
  };
}

function normalizeSshTrustEntryCollection(entries) {
  const next = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const normalized = normalizeSshTrustEntry(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    next.push(normalized);
  }
  next.sort((left, right) => {
    const hostCompare = left.host.localeCompare(right.host, "en-US", { sensitivity: "base" });
    if (hostCompare !== 0) {
      return hostCompare;
    }
    if (left.port !== right.port) {
      return left.port - right.port;
    }
    const keyTypeCompare = left.keyType.localeCompare(right.keyType, "en-US", { sensitivity: "base" });
    if (keyTypeCompare !== 0) {
      return keyTypeCompare;
    }
    return left.id.localeCompare(right.id, "en-US", { sensitivity: "base" });
  });
  return next;
}

function normalizeSshHostKeyProbeCandidate(entry) {
  const normalizedTrustEntry = normalizeSshTrustEntry({
    ...entry,
    id:
      normalizeText(entry?.id) ||
      `${normalizeText(entry?.host)}:${Number.parseInt(String(entry?.port ?? ""), 10)}:${normalizeText(entry?.keyType)}:${normalizeText(entry?.fingerprintSha256)}`
  });
  if (!normalizedTrustEntry) {
    return null;
  }
  return {
    id: normalizedTrustEntry.id,
    host: normalizedTrustEntry.host,
    port: normalizedTrustEntry.port,
    keyType: normalizedTrustEntry.keyType,
    publicKey: normalizedTrustEntry.publicKey,
    fingerprintSha256: normalizedTrustEntry.fingerprintSha256
  };
}

function normalizeSshHostKeyProbeCandidateCollection(entries) {
  const next = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const normalized = normalizeSshHostKeyProbeCandidate(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    next.push(normalized);
  }
  next.sort((left, right) => {
    const keyTypeCompare = left.keyType.localeCompare(right.keyType, "en-US", { sensitivity: "base" });
    if (keyTypeCompare !== 0) {
      return keyTypeCompare;
    }
    return left.fingerprintSha256.localeCompare(right.fingerprintSha256, "en-US", { sensitivity: "base" });
  });
  return next;
}

function formatSshTarget(host, port, username) {
  const normalizedHost = normalizeText(host) || "?";
  const normalizedPort = Number.isInteger(Number(port)) ? Number(port) : 22;
  const normalizedUsername = normalizeText(username);
  return `${normalizedUsername ? `${normalizedUsername}@` : ""}${normalizedHost}:${normalizedPort}`;
}

export function createConnectionProfileRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || null;
  const api = options.api || {};
  const selectEl = options.selectEl || null;
  const newBtn = options.newBtn || null;
  const newSshBtn = options.newSshBtn || null;
  const saveBtn = options.saveBtn || null;
  const saveDraftBtn = options.saveDraftBtn || null;
  const saveAndLaunchBtn = options.saveAndLaunchBtn || null;
  const resetDraftBtn = options.resetDraftBtn || null;
  const applyBtn = options.applyBtn || null;
  const duplicateBtn = options.duplicateBtn || null;
  const renameBtn = options.renameBtn || null;
  const deleteBtn = options.deleteBtn || null;
  const deleteConfirmEl = options.deleteConfirmEl || null;
  const deleteConfirmMessageEl = options.deleteConfirmMessageEl || null;
  const deleteConfirmBtn = options.deleteConfirmBtn || null;
  const deleteCancelBtn = options.deleteCancelBtn || null;
  const statusEl = options.statusEl || null;
  const summaryEl = options.summaryEl || null;
  const draftNameInputEl = options.draftNameInputEl || null;
  const draftKindSelectEl = options.draftKindSelectEl || null;
  const draftDeckSelectEl = options.draftDeckSelectEl || null;
  const draftShellInputEl = options.draftShellInputEl || null;
  const draftStartCwdInputEl = options.draftStartCwdInputEl || null;
  const draftStartCommandTextareaEl = options.draftStartCommandTextareaEl || null;
  const draftEnvTextareaEl = options.draftEnvTextareaEl || null;
  const draftTagsInputEl = options.draftTagsInputEl || null;
  const draftActiveThemeSelectEl = options.draftActiveThemeSelectEl || null;
  const draftInactiveThemeSelectEl = options.draftInactiveThemeSelectEl || null;
  const sshFieldsEl = options.sshFieldsEl || null;
  const draftRemoteHostInputEl = options.draftRemoteHostInputEl || null;
  const draftRemotePortInputEl = options.draftRemotePortInputEl || null;
  const draftRemoteUsernameInputEl = options.draftRemoteUsernameInputEl || null;
  const draftRemoteAuthMethodSelectEl = options.draftRemoteAuthMethodSelectEl || null;
  const draftRemotePrivateKeyFieldEl = options.draftRemotePrivateKeyFieldEl || null;
  const draftRemotePrivateKeyPathInputEl = options.draftRemotePrivateKeyPathInputEl || null;
  const authHintEl = options.authHintEl || null;
  const secretHintEl = options.secretHintEl || null;
  const runtimeSecretFieldEl = options.runtimeSecretFieldEl || null;
  const runtimeSecretInputEl = options.runtimeSecretInputEl || null;
  const sshTrustStatusEl = options.sshTrustStatusEl || null;
  const sshTrustProbeBtn = options.sshTrustProbeBtn || null;
  const sshProbeSelectEl = options.sshProbeSelectEl || null;
  const sshTrustSelectEl = options.sshTrustSelectEl || null;
  const sshTrustKeyTypeInputEl = options.sshTrustKeyTypeInputEl || null;
  const sshTrustFingerprintInputEl = options.sshTrustFingerprintInputEl || null;
  const sshTrustPublicKeyTextareaEl = options.sshTrustPublicKeyTextareaEl || null;
  const sshTrustRefreshBtn = options.sshTrustRefreshBtn || null;
  const sshTrustSaveBtn = options.sshTrustSaveBtn || null;
  const sshTrustDeleteBtn = options.sshTrustDeleteBtn || null;
  const draftLaunchTextareaEl = options.draftLaunchTextareaEl || null;
  const draftStatusEl = options.draftStatusEl || null;
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getSessions = typeof options.getSessions === "function" ? options.getSessions : () => [];
  const getSessionById =
    typeof options.getSessionById === "function"
      ? options.getSessionById
      : (sessionId) => (Array.isArray(getSessions()) ? getSessions().find((session) => session.id === sessionId) || null : null);
  const getActiveSessionId = typeof options.getActiveSessionId === "function" ? options.getActiveSessionId : () => "";
  const setActiveSession = typeof options.setActiveSession === "function" ? options.setActiveSession : () => {};
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const applyRuntimeEvent = typeof options.applyRuntimeEvent === "function" ? options.applyRuntimeEvent : () => false;
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setError = typeof options.setError === "function" ? options.setError : () => {};
  const getErrorMessage = typeof options.getErrorMessage === "function" ? options.getErrorMessage : (_, fallback) => fallback;
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => session?.name || String(session?.id || "");
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const normalizeThemeProfile =
    typeof options.normalizeThemeProfile === "function" ? options.normalizeThemeProfile : (value) => (value && typeof value === "object" ? value : {});
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const themePresets = normalizeThemePresetCollection(options.themePresets);
  const defaultThemeProfile =
    cloneThemeProfile(options.defaultThemeProfile) || cloneThemeProfile(normalizeThemeProfile({})) || undefined;
  const hasGuidedDraftControls = Boolean(
    draftKindSelectEl ||
      draftDeckSelectEl ||
      draftShellInputEl ||
      draftStartCwdInputEl ||
      draftStartCommandTextareaEl ||
      draftEnvTextareaEl ||
      draftTagsInputEl
  );

  let profiles = [];
  let selectedProfileId = "";
  let draftState = null;
  let sshTrustEntries = [];
  let selectedSshTrustEntryId = "";
  let sshHostKeyProbeCandidates = [];
  let selectedSshProbeCandidateId = "";
  let probingSshHostKeys = false;
  let sshProbeTargetKey = "";
  let pendingDeleteProfileId = "";
  let isRenderingDraft = false;
  let loadingSshTrustEntries = false;
  let uiEventsBound = false;

  function setStatus(message) {
    if (statusEl) {
      statusEl.textContent = normalizeText(message);
    }
  }

  function getProfile(profileId) {
    const normalizedId = normalizeText(profileId);
    if (!normalizedId) {
      return null;
    }
    return profiles.find((entry) => entry.id === normalizedId) || null;
  }

  function getSelectedProfile() {
    return getProfile(selectedProfileId);
  }

  function setDraftStatus(message) {
    if (draftStatusEl) {
      draftStatusEl.textContent = normalizeText(message);
    }
  }

  function getDraftNameInputValue() {
    return normalizeText(draftNameInputEl?.value || draftState?.name);
  }

  function clearPendingDeleteConfirmation() {
    pendingDeleteProfileId = "";
  }

  function getDefaultShellForKind(kind) {
    return normalizeLower(kind) === "ssh" ? "ssh" : "bash";
  }

  function getDefaultStartCwdForKind(kind) {
    return normalizeLower(kind) === "ssh" ? "~" : "/";
  }

  function cloneDraftLaunch(source = {}) {
    const fallbackKind = normalizeLower(source.kind) === "ssh" ? "ssh" : "local";
    const sourceLaunch = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    const normalizedLaunch = normalizeConnectionProfileLaunch(sourceLaunch) || {};
    const kind = normalizeLower(sourceLaunch.kind || normalizedLaunch.kind || fallbackKind) === "ssh" ? "ssh" : "local";
    const deckId = normalizeText(sourceLaunch.deckId || normalizedLaunch.deckId) || defaultDeckId;
    const activeThemeProfile =
      cloneThemeProfile(sourceLaunch.activeThemeProfile) ||
      cloneThemeProfile(sourceLaunch.themeProfile) ||
      cloneThemeProfile(normalizedLaunch.activeThemeProfile) ||
      cloneThemeProfile(normalizedLaunch.themeProfile) ||
      cloneThemeProfile(defaultThemeProfile) ||
      {};
    const inactiveThemeProfile =
      cloneThemeProfile(sourceLaunch.inactiveThemeProfile) ||
      cloneThemeProfile(sourceLaunch.themeProfile) ||
      cloneThemeProfile(normalizedLaunch.inactiveThemeProfile) ||
      cloneThemeProfile(normalizedLaunch.themeProfile) ||
      cloneThemeProfile(defaultThemeProfile) ||
      {};
    const base = {
      kind,
      deckId,
      shell:
        typeof sourceLaunch.shell === "string" ? sourceLaunch.shell : normalizedLaunch.shell || getDefaultShellForKind(kind),
      startCwd:
        typeof sourceLaunch.startCwd === "string"
          ? sourceLaunch.startCwd
          : normalizedLaunch.startCwd || getDefaultStartCwdForKind(kind),
      startCommand:
        typeof sourceLaunch.startCommand === "string"
          ? sourceLaunch.startCommand
          : typeof normalizedLaunch.startCommand === "string"
            ? normalizedLaunch.startCommand
            : "",
      env: cloneStringRecord(sourceLaunch.env || normalizedLaunch.env),
      tags: normalizeTagList(sourceLaunch.tags || normalizedLaunch.tags),
      themeProfile:
        cloneThemeProfile(sourceLaunch.themeProfile) ||
        cloneThemeProfile(normalizedLaunch.themeProfile) ||
        cloneThemeProfile(activeThemeProfile) ||
        undefined,
      activeThemeProfile,
      inactiveThemeProfile
    };
    if (kind !== "ssh") {
      return base;
    }
    const rawRemoteConnection =
      sourceLaunch.remoteConnection && typeof sourceLaunch.remoteConnection === "object" && !Array.isArray(sourceLaunch.remoteConnection)
        ? sourceLaunch.remoteConnection
        : normalizedLaunch.remoteConnection || {};
    const rawRemoteAuth =
      sourceLaunch.remoteAuth && typeof sourceLaunch.remoteAuth === "object" && !Array.isArray(sourceLaunch.remoteAuth)
        ? sourceLaunch.remoteAuth
        : normalizedLaunch.remoteAuth || {};
    const port = Number.parseInt(String(rawRemoteConnection.port ?? normalizedLaunch.remoteConnection?.port ?? 22), 10);
    const method = normalizeText(rawRemoteAuth.method || normalizedLaunch.remoteAuth?.method) || "privateKey";
    return {
      ...base,
      remoteConnection: {
        host: normalizeText(rawRemoteConnection.host || normalizedLaunch.remoteConnection?.host),
        port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
        username: normalizeText(rawRemoteConnection.username || normalizedLaunch.remoteConnection?.username)
      },
      remoteAuth: {
        method: ["password", "privateKey", "keyboardInteractive"].includes(method) ? method : "privateKey",
        privateKeyPath:
          typeof rawRemoteAuth.privateKeyPath === "string"
            ? rawRemoteAuth.privateKeyPath
            : typeof normalizedLaunch.remoteAuth?.privateKeyPath === "string"
              ? normalizedLaunch.remoteAuth.privateKeyPath
              : "~/.ssh/id_ed25519"
      }
    };
  }

  function createDraftState(source = {}) {
    const nextKind = normalizeLower(source.kind || source.launch?.kind) === "ssh" ? "ssh" : "local";
    const fallbackLaunch =
      buildBlankConnectionProfileLaunch({
        deckId: normalizeText(source.deckId || source.launch?.deckId) || defaultDeckId,
        defaultThemeProfile,
        kind: nextKind
      }) || {};
    return {
      mode: normalizeText(source.mode) || "blank",
      profileId: normalizeText(source.profileId),
      name: normalizeText(source.name),
      launch: cloneDraftLaunch(source.launch || fallbackLaunch)
    };
  }

  function getDraftModeMessage() {
    if (!draftState) {
      return "";
    }
    if (draftState.mode === "profile" && draftState.profileId) {
      const profile = getProfile(draftState.profileId);
      return profile ? `Editing saved profile [${profile.id}] ${profile.name}.` : "Editing a saved profile draft.";
    }
    if (draftState.mode === "session") {
      return "Loaded the active session into a new unsaved draft.";
    }
    const kindLabel = normalizeLower(draftState.launch?.kind) === "ssh" ? "SSH" : "local";
    return `Editing a new unsaved ${kindLabel} connection profile.`;
  }

  function getDeckOptionsForDraft() {
    const next = [];
    const seen = new Set();
    const currentDeckId = normalizeText(draftState?.launch?.deckId) || defaultDeckId;
    const pushDeck = (deckId, name) => {
      const normalizedDeckId = normalizeText(deckId);
      if (!normalizedDeckId || seen.has(normalizedDeckId)) {
        return;
      }
      seen.add(normalizedDeckId);
      next.push({
        value: normalizedDeckId,
        label: name ? `[${normalizedDeckId}] ${name}` : normalizedDeckId,
        documentRef
      });
    };
    for (const deck of getDecks()) {
      pushDeck(deck?.id, normalizeText(deck?.name));
    }
    pushDeck(defaultDeckId, defaultDeckId === "default" ? "Default" : "");
    pushDeck(currentDeckId, "");
    return next;
  }

  function getThemePresetSelectOptions(selectedValue) {
    const options = themePresets.map((preset) => ({
      value: preset.id,
      label: `${preset.name} (${preset.category})`,
      documentRef
    }));
    options.push({
      value: "__custom__",
      label: "Custom / keep current colors",
      documentRef
    });
    if (!options.some((option) => option.value === selectedValue)) {
      options.push({
        value: selectedValue || "__custom__",
        label: "Custom / keep current colors",
        documentRef
      });
    }
    return options;
  }

  function resolveThemePresetSelectionId(profile) {
    for (const preset of themePresets) {
      if (themeProfilesEqual(preset.profile, profile)) {
        return preset.id;
      }
    }
    return "__custom__";
  }

  function resolveThemeProfileFromSelection(selectionId, fallbackProfile) {
    const normalizedSelectionId = normalizeText(selectionId);
    if (!normalizedSelectionId || normalizedSelectionId === "__custom__") {
      return cloneThemeProfile(fallbackProfile) || cloneThemeProfile(defaultThemeProfile) || {};
    }
    const preset = themePresets.find((entry) => entry.id === normalizedSelectionId);
    return cloneThemeProfile(preset?.profile) || cloneThemeProfile(fallbackProfile) || cloneThemeProfile(defaultThemeProfile) || {};
  }

  function getDraftLaunchFromInputs() {
    if (!hasGuidedDraftControls && typeof draftLaunchTextareaEl?.value === "string") {
      try {
        const parsed = JSON.parse(draftLaunchTextareaEl.value || "{}");
        return cloneDraftLaunch(parsed);
      } catch {
        return cloneDraftLaunch(draftState?.launch);
      }
    }
    const currentLaunch = cloneDraftLaunch(draftState?.launch);
    const kind = normalizeLower(draftKindSelectEl?.value || currentLaunch.kind) === "ssh" ? "ssh" : "local";
    const shellRaw = typeof draftShellInputEl?.value === "string" ? draftShellInputEl.value : currentLaunch.shell;
    const startCwdRaw =
      typeof draftStartCwdInputEl?.value === "string" ? draftStartCwdInputEl.value : currentLaunch.startCwd;
    const startCommandRaw =
      typeof draftStartCommandTextareaEl?.value === "string"
        ? draftStartCommandTextareaEl.value
        : currentLaunch.startCommand || "";
    const draftLaunch = {
      kind,
      deckId: normalizeText(draftDeckSelectEl?.value || currentLaunch.deckId) || defaultDeckId,
      shell: typeof shellRaw === "string" ? shellRaw : getDefaultShellForKind(kind),
      startCwd: typeof startCwdRaw === "string" ? startCwdRaw : getDefaultStartCwdForKind(kind),
      startCommand: typeof startCommandRaw === "string" ? startCommandRaw : "",
      env: parseStringRecord(draftEnvTextareaEl?.value),
      tags: parseTags(draftTagsInputEl?.value),
      themeProfile: resolveThemeProfileFromSelection(
        draftActiveThemeSelectEl?.value,
        currentLaunch.themeProfile || currentLaunch.activeThemeProfile
      ),
      activeThemeProfile: resolveThemeProfileFromSelection(
        draftActiveThemeSelectEl?.value,
        currentLaunch.activeThemeProfile
      ),
      inactiveThemeProfile: resolveThemeProfileFromSelection(
        draftInactiveThemeSelectEl?.value,
        currentLaunch.inactiveThemeProfile
      )
    };
    if (kind === "ssh") {
      const portRaw = normalizeText(draftRemotePortInputEl?.value);
      const parsedPort = Number.parseInt(portRaw || "22", 10);
      const method = normalizeText(draftRemoteAuthMethodSelectEl?.value || currentLaunch.remoteAuth?.method) || "privateKey";
      draftLaunch.remoteConnection = {
        host: normalizeText(draftRemoteHostInputEl?.value || currentLaunch.remoteConnection?.host),
        port: Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 22,
        username: normalizeText(draftRemoteUsernameInputEl?.value || currentLaunch.remoteConnection?.username)
      };
      draftLaunch.remoteAuth = {
        method: ["password", "privateKey", "keyboardInteractive"].includes(method) ? method : "privateKey",
        privateKeyPath:
          typeof draftRemotePrivateKeyPathInputEl?.value === "string"
            ? draftRemotePrivateKeyPathInputEl.value
            : currentLaunch.remoteAuth?.privateKeyPath || ""
      };
    }
    return draftLaunch;
  }

  function buildPersistedDraftLaunch() {
    const currentLaunch = getDraftLaunchFromInputs();
    const kind = normalizeLower(currentLaunch.kind) === "ssh" ? "ssh" : "local";
    const shell = normalizeText(currentLaunch.shell);
    const startCwd = normalizeText(currentLaunch.startCwd);
    if (!shell) {
      throw new Error("Shell is required.");
    }
    if (!startCwd) {
      throw new Error("Start directory is required.");
    }
    const payload = {
      kind,
      deckId: normalizeText(currentLaunch.deckId) || defaultDeckId,
      shell,
      startCwd,
      startCommand: typeof currentLaunch.startCommand === "string" ? currentLaunch.startCommand : "",
      env: cloneStringRecord(currentLaunch.env),
      tags: normalizeTagList(currentLaunch.tags),
      ...(cloneThemeProfile(currentLaunch.themeProfile) ? { themeProfile: cloneThemeProfile(currentLaunch.themeProfile) } : {}),
      activeThemeProfile: cloneThemeProfile(currentLaunch.activeThemeProfile) || cloneThemeProfile(defaultThemeProfile) || {},
      inactiveThemeProfile:
        cloneThemeProfile(currentLaunch.inactiveThemeProfile) || cloneThemeProfile(defaultThemeProfile) || {}
    };
    if (kind === "ssh") {
      const host = normalizeText(currentLaunch.remoteConnection?.host);
      const port = Number.parseInt(String(currentLaunch.remoteConnection?.port ?? 22), 10);
      const username = normalizeText(currentLaunch.remoteConnection?.username);
      const method = normalizeText(currentLaunch.remoteAuth?.method) || "privateKey";
      const privateKeyPath = normalizeText(currentLaunch.remoteAuth?.privateKeyPath);
      if (!host) {
        throw new Error("SSH host is required.");
      }
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("SSH port must be an integer between 1 and 65535.");
      }
      if (!["password", "privateKey", "keyboardInteractive"].includes(method)) {
        throw new Error("SSH auth method must be password, privateKey, or keyboardInteractive.");
      }
      payload.remoteConnection = {
        host,
        port,
        ...(username ? { username } : {})
      };
      payload.remoteAuth = {
        method,
        ...(method === "privateKey" && privateKeyPath ? { privateKeyPath } : {})
      };
    }
    const normalized = normalizeConnectionProfileLaunch(payload);
    if (!normalized) {
      throw new Error("Connection profile draft is incomplete.");
    }
    return normalized;
  }

  function getSshAuthHint(launch) {
    if (normalizeLower(launch?.kind) !== "ssh") {
      return "";
    }
    const method = normalizeLower(launch?.remoteAuth?.method);
    if (method === "password") {
      return "Password auth stores only the method. The password is requested each time you launch the saved profile.";
    }
    if (method === "keyboardinteractive") {
      return "Keyboard-interactive auth stores only the method. The challenge secret is requested each time you launch the saved profile.";
    }
    return "Private-key auth stores only the optional key path. No SSH secret is stored in the saved profile.";
  }

  function getSshSecretHint(launch) {
    if (normalizeLower(launch?.kind) !== "ssh") {
      return "";
    }
    return authMethodRequiresSecret(launch?.remoteAuth)
      ? "Launching this SSH profile will prompt for a runtime secret."
      : "Launching this SSH profile will use key-based auth without prompting for a runtime secret.";
  }

  function getCurrentSshTrustTarget() {
    const draftLaunch = getDraftLaunchFromInputs();
    if (normalizeLower(draftLaunch.kind) !== "ssh") {
      return null;
    }
    const host = normalizeText(draftLaunch.remoteConnection?.host);
    const port = Number.parseInt(String(draftLaunch.remoteConnection?.port ?? 22), 10);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      return null;
    }
    return { host, port };
  }

  function getSshTrustTargetKey(target) {
    const host = normalizeText(target?.host);
    const port = Number.parseInt(String(target?.port ?? 22), 10);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      return "";
    }
    return `${host}:${port}`;
  }

  function clearSshProbeCandidates() {
    sshHostKeyProbeCandidates = [];
    selectedSshProbeCandidateId = "";
    sshProbeTargetKey = "";
  }

  function clearSshTrustState() {
    sshTrustEntries = [];
    selectedSshTrustEntryId = "";
    clearSshProbeCandidates();
  }

  function getTrustEntriesForCurrentTarget() {
    const target = getCurrentSshTrustTarget();
    if (!target) {
      return [];
    }
    return sshTrustEntries.filter((entry) => entry.host === target.host && entry.port === target.port);
  }

  function getSshProbeCandidatesForCurrentTarget() {
    const target = getCurrentSshTrustTarget();
    if (!target || getSshTrustTargetKey(target) !== sshProbeTargetKey) {
      return [];
    }
    return sshHostKeyProbeCandidates.slice();
  }

  function syncDraftStateFromInputs() {
    if (!draftState || isRenderingDraft) {
      return;
    }
    const previousTargetKey = getSshTrustTargetKey(draftState.launch?.remoteConnection);
    const nextLaunch = getDraftLaunchFromInputs();
    draftState = {
      ...draftState,
      name: normalizeText(draftNameInputEl?.value || draftState.name),
      launch: nextLaunch
    };
    if (getSshTrustTargetKey(nextLaunch?.remoteConnection) !== previousTargetKey) {
      clearSshProbeCandidates();
    }
    renderDraftComputedState();
  }

  function renderDraftComputedState() {
    if (!draftState) {
      return;
    }
    const selectedProfile = getSelectedProfile();
    const currentLaunch = cloneDraftLaunch(getDraftLaunchFromInputs());
    const isSsh = normalizeLower(currentLaunch.kind) === "ssh";
    const authMethod = normalizeLower(currentLaunch?.remoteAuth?.method) || "privatekey";
    const requiresSecret = authMethodRequiresSecret(currentLaunch?.remoteAuth);
    if (summaryEl) {
      summaryEl.textContent = selectedProfile
        ? formatConnectionProfileSummary(selectedProfile)
        : "No saved connection profile selected. You can still save and launch the draft below.";
    }
    if (sshFieldsEl) {
      sshFieldsEl.hidden = !isSsh;
    }
    if (draftRemotePrivateKeyFieldEl) {
      draftRemotePrivateKeyFieldEl.hidden = !isSsh || authMethod !== "privatekey";
    }
    if (authHintEl) {
      authHintEl.textContent = getSshAuthHint(currentLaunch);
    }
    if (secretHintEl) {
      secretHintEl.textContent = getSshSecretHint(currentLaunch);
    }
    if (runtimeSecretFieldEl) {
      runtimeSecretFieldEl.hidden = !isSsh || !requiresSecret;
    }
    if (runtimeSecretInputEl) {
      runtimeSecretInputEl.hidden = !isSsh || !requiresSecret;
      runtimeSecretInputEl.disabled = !isSsh || !requiresSecret;
      if (!requiresSecret) {
        runtimeSecretInputEl.value = "";
      }
    }
    if (draftLaunchTextareaEl) {
      draftLaunchTextareaEl.readOnly = true;
      draftLaunchTextareaEl.value = JSON.stringify(currentLaunch, null, 2);
    }
    setDraftStatus(getDraftModeMessage());
    if (deleteBtn) {
      deleteBtn.textContent = pendingDeleteProfileId && pendingDeleteProfileId === selectedProfile?.id ? "Confirm Delete Saved" : "Delete Saved";
    }
    if (deleteConfirmEl) {
      deleteConfirmEl.hidden = !(selectedProfile && pendingDeleteProfileId === selectedProfile.id);
    }
    if (deleteConfirmMessageEl) {
      deleteConfirmMessageEl.textContent =
        selectedProfile && pendingDeleteProfileId === selectedProfile.id
          ? `Delete saved connection profile [${selectedProfile.id}] ${selectedProfile.name}? This removes only the saved profile, not any already running sessions.`
          : "";
    }

    const target = getCurrentSshTrustTarget();
    const matchingTrustEntries = getTrustEntriesForCurrentTarget();
    const probeCandidates = getSshProbeCandidatesForCurrentTarget();
    const trustOptions = matchingTrustEntries.length
      ? matchingTrustEntries.map((entry) => ({
          value: entry.id,
          label: `${entry.keyType} · ${entry.fingerprintSha256}`,
          documentRef
        }))
      : [
          {
            value: "",
            label: isSsh ? "No trusted keys for this SSH target" : "Switch to SSH to manage trust entries",
            disabled: true,
            documentRef
          }
        ];
    const hasSelectedTrustEntry = matchingTrustEntries.some((entry) => entry.id === selectedSshTrustEntryId);
    if (!hasSelectedTrustEntry) {
      selectedSshTrustEntryId = matchingTrustEntries[0]?.id || "";
    }
    const probeOptions = probeCandidates.length
      ? probeCandidates.map((entry) => ({
          value: entry.id,
          label: `${entry.keyType} · ${entry.fingerprintSha256}`,
          documentRef
        }))
      : [
          {
            value: "",
            label: isSsh ? "Fetch host keys to review one before trusting it" : "Switch to SSH to fetch host keys",
            disabled: true,
            documentRef
          }
        ];
    const hasSelectedProbeCandidate = probeCandidates.some((entry) => entry.id === selectedSshProbeCandidateId);
    if (!hasSelectedProbeCandidate) {
      selectedSshProbeCandidateId = probeCandidates[0]?.id || "";
    }
    setSelectOptions(sshProbeSelectEl, probeOptions, selectedSshProbeCandidateId || probeOptions[0]?.value || "");
    setSelectOptions(sshTrustSelectEl, trustOptions, selectedSshTrustEntryId || trustOptions[0]?.value || "");
    const selectedProbeCandidate = probeCandidates.find((entry) => entry.id === selectedSshProbeCandidateId) || null;
    const selectedTrustEntry = matchingTrustEntries.find((entry) => entry.id === selectedSshTrustEntryId) || null;
    const selectedPreview = selectedProbeCandidate || selectedTrustEntry;
    if (sshTrustKeyTypeInputEl) {
      sshTrustKeyTypeInputEl.value = selectedPreview?.keyType || "";
      sshTrustKeyTypeInputEl.readOnly = true;
    }
    if (sshTrustFingerprintInputEl) {
      sshTrustFingerprintInputEl.value = selectedPreview?.fingerprintSha256 || "";
      sshTrustFingerprintInputEl.readOnly = true;
    }
    if (sshTrustPublicKeyTextareaEl) {
      sshTrustPublicKeyTextareaEl.value = selectedPreview?.publicKey || "";
      sshTrustPublicKeyTextareaEl.readOnly = true;
    }
    if (sshTrustStatusEl) {
      sshTrustStatusEl.textContent = target
        ? probingSshHostKeys
          ? `Fetching host keys for ${formatSshTarget(target.host, target.port)}...`
          : probeCandidates.length
            ? `Review ${probeCandidates.length} fetched host key(s) for ${formatSshTarget(target.host, target.port)} and trust the selected key if it matches your server.`
            : `${matchingTrustEntries.length} trusted key(s) for ${formatSshTarget(target.host, target.port)}`
        : isSsh
          ? "Enter an SSH host to manage trusted host keys."
          : "SSH trust entries are only used for SSH profiles.";
    }
    if (sshTrustProbeBtn) {
      sshTrustProbeBtn.disabled = typeof api.probeSshHostKeys !== "function" || !isSsh || !target || probingSshHostKeys;
    }
    if (sshTrustRefreshBtn) {
      sshTrustRefreshBtn.disabled = typeof api.listSshTrustEntries !== "function" || !isSsh || loadingSshTrustEntries;
    }
    if (sshTrustSaveBtn) {
      sshTrustSaveBtn.disabled = typeof api.createSshTrustEntry !== "function" || !isSsh || !selectedProbeCandidate;
    }
    if (sshTrustDeleteBtn) {
      sshTrustDeleteBtn.disabled = typeof api.deleteSshTrustEntry !== "function" || !selectedSshTrustEntryId;
    }
  }

  function renderDraft() {
    if (!draftState) {
      return;
    }
    const currentLaunch = cloneDraftLaunch(draftState.launch);
    isRenderingDraft = true;
    if (draftNameInputEl) {
      draftNameInputEl.value = draftState.name;
    }
    setSelectOptions(
      draftKindSelectEl,
      [
        { value: "local", label: "Local", documentRef },
        { value: "ssh", label: "SSH", documentRef }
      ],
      currentLaunch.kind
    );
    setSelectOptions(draftDeckSelectEl, getDeckOptionsForDraft(), currentLaunch.deckId);
    if (draftShellInputEl) {
      draftShellInputEl.value = currentLaunch.shell;
    }
    if (draftStartCwdInputEl) {
      draftStartCwdInputEl.value = currentLaunch.startCwd;
    }
    if (draftStartCommandTextareaEl) {
      draftStartCommandTextareaEl.value = currentLaunch.startCommand || "";
    }
    if (draftEnvTextareaEl) {
      draftEnvTextareaEl.value = formatStringRecord(currentLaunch.env);
    }
    if (draftTagsInputEl) {
      draftTagsInputEl.value = formatTags(currentLaunch.tags);
    }
    const activeThemeSelection = resolveThemePresetSelectionId(currentLaunch.activeThemeProfile);
    const inactiveThemeSelection = resolveThemePresetSelectionId(currentLaunch.inactiveThemeProfile);
    setSelectOptions(
      draftActiveThemeSelectEl,
      getThemePresetSelectOptions(activeThemeSelection),
      activeThemeSelection
    );
    setSelectOptions(
      draftInactiveThemeSelectEl,
      getThemePresetSelectOptions(inactiveThemeSelection),
      inactiveThemeSelection
    );
    if (draftRemoteHostInputEl) {
      draftRemoteHostInputEl.value = currentLaunch.remoteConnection?.host || "";
    }
    if (draftRemotePortInputEl) {
      draftRemotePortInputEl.value = String(currentLaunch.remoteConnection?.port || 22);
    }
    if (draftRemoteUsernameInputEl) {
      draftRemoteUsernameInputEl.value = currentLaunch.remoteConnection?.username || "";
    }
    setSelectOptions(
      draftRemoteAuthMethodSelectEl,
      [
        { value: "privateKey", label: "Private Key", documentRef },
        { value: "password", label: "Password", documentRef },
        { value: "keyboardInteractive", label: "Keyboard-Interactive", documentRef }
      ],
      currentLaunch.remoteAuth?.method || "privateKey"
    );
    if (draftRemotePrivateKeyPathInputEl) {
      draftRemotePrivateKeyPathInputEl.value = currentLaunch.remoteAuth?.privateKeyPath || "";
    }
    isRenderingDraft = false;
    renderDraftComputedState();
    if (normalizeLower(currentLaunch.kind) === "ssh") {
      refreshSshTrustEntries({ silent: true }).catch(() => {});
    }
  }

  function setDraftState(nextDraft) {
    clearPendingDeleteConfirmation();
    draftState = createDraftState(nextDraft);
    renderDraft();
    return draftState;
  }

  function resetDraftFromSelectedProfile() {
    const selectedProfile = getSelectedProfile();
    if (selectedProfile) {
      return setDraftState({
        mode: "profile",
        profileId: selectedProfile.id,
        name: selectedProfile.name,
        launch: selectedProfile.launch
      });
    }
    const activeSession = getSessionById(getActiveSessionId());
    return setDraftState({
      mode: "blank",
      name: "New Local Connection",
      deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
      launch: buildBlankConnectionProfileLaunch({
        deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
        defaultThemeProfile,
        kind: "local"
      })
    });
  }

  function loadDraftFromActiveSession(sessionOrId = undefined) {
    const activeSessionId = getActiveSessionId();
    const session = sessionOrId
      ? (typeof sessionOrId === "string" ? getSessionById(sessionOrId) : sessionOrId)
      : getSessionById(activeSessionId);
    if (!session) {
      throw new Error("No active session to load into a connection profile draft.");
    }
    const launch = getLaunchForSession(session);
    if (!launch) {
      throw new Error("Session launch settings are incomplete and cannot seed a connection profile draft.");
    }
    return setDraftState({
      mode: "session",
      profileId: "",
      name: `${formatSessionDisplayName(session)} Profile`,
      launch
    });
  }

  async function refreshSshTrustEntries(options = {}) {
    if (typeof api.listSshTrustEntries !== "function") {
      sshTrustEntries = [];
      renderDraftComputedState();
      return [];
    }
    if (loadingSshTrustEntries) {
      return sshTrustEntries.slice();
    }
    loadingSshTrustEntries = true;
    renderDraftComputedState();
    try {
      const payload = await api.listSshTrustEntries();
      sshTrustEntries = normalizeSshTrustEntryCollection(payload);
      renderDraftComputedState();
      return sshTrustEntries.slice();
    } catch (error) {
      if (options.silent !== true) {
        throw error;
      }
      return sshTrustEntries.slice();
    } finally {
      loadingSshTrustEntries = false;
      renderDraftComputedState();
    }
  }

  function syncSelection() {
    if (!selectedProfileId || !profiles.some((entry) => entry.id === selectedProfileId)) {
      selectedProfileId = profiles[0]?.id || "";
    }
    if (pendingDeleteProfileId && pendingDeleteProfileId !== selectedProfileId) {
      clearPendingDeleteConfirmation();
    }
    if (selectEl) {
      selectEl.value = selectedProfileId;
      selectEl.disabled = profiles.length === 0;
    }
    if (applyBtn) {
      applyBtn.disabled = profiles.length === 0;
    }
    if (renameBtn) {
      renameBtn.disabled = profiles.length === 0;
    }
    if (duplicateBtn) {
      duplicateBtn.disabled = profiles.length === 0;
    }
    if (deleteBtn) {
      deleteBtn.disabled = profiles.length === 0;
    }
  }

  function render() {
    if (selectEl) {
      clearChildren(selectEl);
      if (profiles.length === 0) {
        const option = documentRef?.createElement?.("option") || { value: "", textContent: "" };
        option.value = "";
        option.textContent = "No connection profiles";
        option.disabled = true;
        option.selected = true;
        selectEl.appendChild(option);
      } else {
        for (const profile of profiles) {
          const option = documentRef?.createElement?.("option") || { value: "", textContent: "" };
          option.value = profile.id;
          option.textContent = `[${profile.id}] ${profile.name}`;
          selectEl.appendChild(option);
        }
      }
    }
    syncSelection();
    if (!draftState || (draftState.mode === "profile" && !getProfile(draftState.profileId))) {
      resetDraftFromSelectedProfile();
    } else {
      renderDraft();
    }
    setStatus(profiles.length > 0 ? `${profiles.length} profile(s)` : "No saved connection profiles.");
  }

  function replaceProfiles(nextProfiles) {
    profiles = normalizeConnectionProfileCollection(nextProfiles);
    render();
    return profiles.slice();
  }

  function upsertProfile(profile) {
    const normalized = normalizeConnectionProfileRecord(profile);
    if (!normalized) {
      return null;
    }
    profiles = profiles.filter((entry) => entry.id !== normalized.id);
    profiles.push(normalized);
    profiles = normalizeConnectionProfileCollection(profiles);
    selectedProfileId = normalized.id;
    render();
    return normalized;
  }

  function requireUpsertedProfile(profile, operationLabel) {
    const normalized = upsertProfile(profile);
    if (normalized) {
      return normalized;
    }
    throw new Error(
      `Connection profile API returned an invalid profile record${normalizeText(operationLabel) ? ` for ${operationLabel}` : ""}.`
    );
  }

  function removeProfile(profileId) {
    const normalizedId = normalizeText(profileId);
    if (!normalizedId) {
      return false;
    }
    const beforeLength = profiles.length;
    profiles = profiles.filter((entry) => entry.id !== normalizedId);
    if (profiles.length === beforeLength) {
      return false;
    }
    if (selectedProfileId === normalizedId) {
      selectedProfileId = "";
    }
    render();
    return true;
  }

  function listProfiles() {
    return profiles.slice();
  }

  function resolveProfile(selectorText) {
    return resolveConnectionProfileToken(profiles, selectorText);
  }

  function getLaunchForSession(sessionOrId) {
    const session = typeof sessionOrId === "string" ? getSessionById(sessionOrId) : sessionOrId;
    return buildConnectionProfileLaunchFromSession(session, {
      defaultDeckId,
      normalizeThemeProfile
    });
  }

  async function promptForLaunchSecret(profile) {
    if (!authMethodRequiresSecret(profile?.launch?.remoteAuth)) {
      return { ok: true, remoteSecret: undefined, cancelled: false };
    }
    const inlineSecret = normalizeText(runtimeSecretInputEl?.value);
    if (runtimeSecretInputEl) {
      if (!inlineSecret) {
        throw new Error("Enter the SSH runtime secret before launching this saved profile.");
      }
      return { ok: true, remoteSecret: inlineSecret, cancelled: false };
    }
    const secret = windowRef?.prompt?.(`SSH secret for connection profile '${profile.name}'`, "");
    if (secret === null || secret === undefined) {
      return { ok: false, remoteSecret: undefined, cancelled: true };
    }
    if (!String(secret).trim()) {
      throw new Error("SSH secret is required for password and keyboard-interactive connection profiles.");
    }
    return { ok: true, remoteSecret: String(secret), cancelled: false };
  }

  async function ensureTrustedHostKeyBeforeLaunch(profile) {
    if (normalizeLower(profile?.launch?.kind) !== "ssh") {
      return "";
    }
    const host = normalizeText(profile?.launch?.remoteConnection?.host);
    const port = Number.parseInt(String(profile?.launch?.remoteConnection?.port ?? 22), 10);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Enter an SSH host and port before launching this saved profile.");
    }
    const matchingTrustEntries = sshTrustEntries.filter((entry) => entry.host === host && entry.port === port);
    if (matchingTrustEntries.length > 0) {
      return "";
    }
    if (normalizeText(selectedProfileId) !== profile.id) {
      selectedProfileId = profile.id;
      syncSelection();
      resetDraftFromSelectedProfile();
    }
    await probeSshHostKeysFlow({ auto: true });
    throw new Error(
      `No trusted host key is stored for ${formatSshTarget(host, port)}. Review the fetched host key below, trust the one that matches your server, then launch again.`
    );
  }

  async function probeSshHostKeysFlow(options = {}) {
    const target = getCurrentSshTrustTarget();
    if (!target) {
      throw new Error("Enter an SSH host and port before fetching host keys.");
    }
    if (typeof api.probeSshHostKeys !== "function") {
      throw new Error("SSH host-key probing is not available.");
    }
    probingSshHostKeys = true;
    renderDraftComputedState();
    try {
      const payload = await api.probeSshHostKeys({
        host: target.host,
        port: target.port
      });
      sshHostKeyProbeCandidates = normalizeSshHostKeyProbeCandidateCollection(payload);
      selectedSshProbeCandidateId = sshHostKeyProbeCandidates[0]?.id || "";
      sshProbeTargetKey = getSshTrustTargetKey(target);
      renderDraftComputedState();
      const feedback = options.auto === true
        ? `Fetched SSH host keys for ${formatSshTarget(target.host, target.port)}. Review the fingerprint and trust the selected key before launching.`
        : `Fetched ${sshHostKeyProbeCandidates.length} SSH host key(s) for ${formatSshTarget(target.host, target.port)}.`;
      setCommandFeedback(feedback);
      setStatus(feedback);
      return feedback;
    } finally {
      probingSshHostKeys = false;
      renderDraftComputedState();
    }
  }

  async function saveTrustEntryFlow() {
    const target = getCurrentSshTrustTarget();
    if (!target) {
      throw new Error("Enter an SSH host and port before trusting a host key.");
    }
    if (typeof api.createSshTrustEntry !== "function") {
      throw new Error("SSH trust entry management is not available.");
    }
    const selectedProbeCandidate =
      sshHostKeyProbeCandidates.find((candidate) => candidate.id === selectedSshProbeCandidateId) || null;
    if (!selectedProbeCandidate) {
      throw new Error("Fetch SSH host keys and select the key you want to trust first.");
    }
    const created = await api.createSshTrustEntry({
      host: target.host,
      port: target.port,
      keyType: selectedProbeCandidate.keyType,
      publicKey: selectedProbeCandidate.publicKey
    });
    const normalizedCreated = normalizeSshTrustEntry(created);
    if (!normalizedCreated) {
      throw new Error("SSH trust entry API returned an invalid trust entry.");
    }
    await refreshSshTrustEntries({ silent: true });
    selectedSshTrustEntryId = normalizedCreated.id;
    selectedSshProbeCandidateId = `${normalizedCreated.host}:${normalizedCreated.port}:${normalizedCreated.keyType}:${normalizedCreated.fingerprintSha256}`;
    renderDraftComputedState();
    const feedback = `Trusted SSH host key for ${formatSshTarget(target.host, target.port)} (${normalizedCreated.keyType} · ${normalizedCreated.fingerprintSha256}).`;
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function deleteTrustEntryFlow() {
    if (!selectedSshTrustEntryId) {
      throw new Error("Select a trusted SSH host key to delete.");
    }
    if (typeof api.deleteSshTrustEntry !== "function") {
      throw new Error("SSH trust entry management is not available.");
    }
    const entry = sshTrustEntries.find((candidate) => candidate.id === selectedSshTrustEntryId) || null;
    await api.deleteSshTrustEntry(selectedSshTrustEntryId);
    await refreshSshTrustEntries({ silent: true });
    const feedback = entry
      ? `Deleted trusted SSH host key for ${formatSshTarget(entry.host, entry.port)} (${entry.keyType}).`
      : "Deleted trusted SSH host key.";
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  const runtimeActions = createConnectionProfileRuntimeActions({
    api,
    defaultDeckId,
    defaultThemeProfile,
    normalizeText,
    normalizeLower,
    getErrorMessage,
    getSessionById,
    getActiveSessionId,
    getLaunchForSession,
    getProfile,
    getSelectedProfile,
    requireUpsertedProfile,
    removeProfile,
    replaceProfiles,
    listProfiles,
    promptForLaunchSecret,
    ensureTrustedHostKeyBeforeLaunch,
    runtimeSecretInputEl,
    applyRuntimeEvent,
    setActiveDeck,
    setActiveSession,
    requestRender,
    formatSessionToken,
    formatSessionDisplayName,
    buildPersistedDraftLaunch,
    getDraftState: () => draftState,
    setDraftState,
    clearSshTrustState,
    refreshSshTrustEntries,
    setError,
    setCommandFeedback,
    setStatus,
    windowRef,
    buildBlankConnectionProfileLaunch,
    loadDraftFromActiveSession,
    resetDraftFromSelectedProfile,
    getDraftNameInputValue,
    clearPendingDeleteConfirmation,
    renderDraftComputedState,
    getPendingDeleteProfileId: () => pendingDeleteProfileId,
    setPendingDeleteProfileId: (value) => {
      pendingDeleteProfileId = normalizeText(value);
    }
  });

  const {
    createProfileFromSession,
    applyProfileById,
    renameProfileById,
    duplicateProfileById,
    deleteProfileById,
    saveDraftById,
    saveAndLaunchDraftFlow,
    loadProfiles,
    createProfileFlow,
    newDraftFlow,
    loadActiveDraftFlow,
    saveDraftFlow,
    resetDraftFlow,
    applySelectedProfileFlow,
    duplicateSelectedProfileFlow,
    renameSelectedProfileFlow,
    requestDeleteSelectedProfileFlow,
    deleteSelectedProfileFlow,
    cancelDeleteSelectedProfileFlow
  } = runtimeActions;

  function bindUiEvents() {
    if (uiEventsBound) {
      return;
    }
    uiEventsBound = true;
    selectEl?.addEventListener?.("change", () => {
      selectedProfileId = normalizeText(selectEl.value);
      syncSelection();
      resetDraftFromSelectedProfile();
    });
    const bindDraftSync = (element, eventName = "input") => {
      element?.addEventListener?.(eventName, () => {
        syncDraftStateFromInputs();
      });
    };
    newBtn?.addEventListener?.("click", () => {
      newDraftFlow("local").catch((error) => setError(getErrorMessage(error, "Failed to open a new local connection profile draft.")));
    });
    newSshBtn?.addEventListener?.("click", () => {
      newDraftFlow("ssh").catch((error) => setError(getErrorMessage(error, "Failed to open a new SSH connection profile draft.")));
    });
    saveBtn?.addEventListener?.("click", () => {
      loadActiveDraftFlow().catch((error) => setError(getErrorMessage(error, "Failed to load the active session into a connection profile draft.")));
    });
    saveDraftBtn?.addEventListener?.("click", () => {
      saveDraftFlow().catch((error) => setError(getErrorMessage(error, "Failed to save the connection profile draft.")));
    });
    saveAndLaunchBtn?.addEventListener?.("click", () => {
      saveAndLaunchDraftFlow().catch((error) =>
        setError(getErrorMessage(error, "Failed to save and launch the connection profile draft."))
      );
    });
    resetDraftBtn?.addEventListener?.("click", () => {
      resetDraftFlow().catch((error) => setError(getErrorMessage(error, "Failed to reset the connection profile draft.")));
    });
    applyBtn?.addEventListener?.("click", () => {
      applySelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to apply connection profile.")));
    });
    duplicateBtn?.addEventListener?.("click", () => {
      duplicateSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to duplicate connection profile.")));
    });
    renameBtn?.addEventListener?.("click", () => {
      renameSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to rename connection profile.")));
    });
    deleteBtn?.addEventListener?.("click", () => {
      deleteSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete connection profile.")));
    });
    deleteConfirmBtn?.addEventListener?.("click", () => {
      deleteSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete connection profile.")));
    });
    deleteCancelBtn?.addEventListener?.("click", () => {
      cancelDeleteSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to cancel connection profile deletion.")));
    });
    sshTrustRefreshBtn?.addEventListener?.("click", () => {
      refreshSshTrustEntries().catch((error) => setError(getErrorMessage(error, "Failed to load SSH trust entries.")));
    });
    sshTrustProbeBtn?.addEventListener?.("click", () => {
      probeSshHostKeysFlow().catch((error) => setError(getErrorMessage(error, "Failed to fetch SSH host keys.")));
    });
    sshTrustSaveBtn?.addEventListener?.("click", () => {
      saveTrustEntryFlow().catch((error) => setError(getErrorMessage(error, "Failed to trust SSH host key.")));
    });
    sshTrustDeleteBtn?.addEventListener?.("click", () => {
      deleteTrustEntryFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete SSH trust entry.")));
    });
    sshTrustSelectEl?.addEventListener?.("change", () => {
      selectedSshTrustEntryId = normalizeText(sshTrustSelectEl.value);
      renderDraftComputedState();
    });
    sshProbeSelectEl?.addEventListener?.("change", () => {
      selectedSshProbeCandidateId = normalizeText(sshProbeSelectEl.value);
      renderDraftComputedState();
    });
    bindDraftSync(draftNameInputEl);
    bindDraftSync(draftKindSelectEl, "change");
    bindDraftSync(draftDeckSelectEl, "change");
    bindDraftSync(draftShellInputEl);
    bindDraftSync(draftStartCwdInputEl);
    bindDraftSync(draftStartCommandTextareaEl);
    bindDraftSync(draftEnvTextareaEl);
    bindDraftSync(draftTagsInputEl);
    bindDraftSync(draftActiveThemeSelectEl, "change");
    bindDraftSync(draftInactiveThemeSelectEl, "change");
    bindDraftSync(draftRemoteHostInputEl);
    bindDraftSync(draftRemotePortInputEl);
    bindDraftSync(draftRemoteUsernameInputEl);
    bindDraftSync(draftRemoteAuthMethodSelectEl, "change");
    bindDraftSync(draftRemotePrivateKeyPathInputEl);
    bindDraftSync(sshTrustKeyTypeInputEl);
    bindDraftSync(sshTrustPublicKeyTextareaEl);
  }

  bindUiEvents();
  render();

  return {
    listProfiles,
    getProfile,
    getSelectedProfile,
    getSelectedProfileId: () => selectedProfileId,
    resolveProfile,
    replaceProfiles,
    upsertProfile,
    removeProfile,
    getLaunchForSession,
    createProfileFromSession,
    saveDraftById,
    loadDraftFromActiveSession,
    setDraftState,
    getDraftState: () => (draftState ? { ...draftState, launch: normalizeConnectionProfileLaunch(draftState.launch) } : null),
    applyProfileById,
    renameProfileById,
    duplicateProfileById,
    deleteProfileById,
    loadProfiles,
    createProfileFlow,
    newDraftFlow,
    loadActiveDraftFlow,
    saveDraftFlow,
    saveAndLaunchDraftFlow,
    resetDraftFlow,
    applySelectedProfileFlow,
    duplicateSelectedProfileFlow,
    renameSelectedProfileFlow,
    requestDeleteSelectedProfileFlow,
    deleteSelectedProfileFlow,
    cancelDeleteSelectedProfileFlow,
    refreshSshTrustEntries,
    saveTrustEntryFlow,
    deleteTrustEntryFlow,
    bindUiEvents,
    render
  };
}
