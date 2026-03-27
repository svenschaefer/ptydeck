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

function normalizeConnectionProfileLaunch(launch) {
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

export function createConnectionProfileRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || null;
  const api = options.api || {};
  const selectEl = options.selectEl || null;
  const saveBtn = options.saveBtn || null;
  const applyBtn = options.applyBtn || null;
  const renameBtn = options.renameBtn || null;
  const deleteBtn = options.deleteBtn || null;
  const statusEl = options.statusEl || null;
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

  let profiles = [];
  let selectedProfileId = "";

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

  function syncSelection() {
    if (!selectedProfileId || !profiles.some((entry) => entry.id === selectedProfileId)) {
      selectedProfileId = profiles[0]?.id || "";
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

  async function createProfileFromSession(sessionOrId, name, options = {}) {
    const session = typeof sessionOrId === "string" ? getSessionById(sessionOrId) : sessionOrId;
    if (!session) {
      throw new Error("Session is required to save a connection profile.");
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Connection profile name is required.");
    }
    const launch = getLaunchForSession(session);
    if (!launch) {
      throw new Error("Session launch settings are incomplete and cannot be saved as a connection profile.");
    }
    const created = await api.createConnectionProfile({
      ...(normalizeText(options.id) ? { id: normalizeText(options.id) } : {}),
      name: normalizedName,
      launch
    });
    const profile = upsertProfile(created);
    return `Saved connection profile [${profile.id}] ${profile.name} from [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}.`;
  }

  async function promptForLaunchSecret(profile) {
    if (!authMethodRequiresSecret(profile?.launch?.remoteAuth)) {
      return { ok: true, remoteSecret: undefined, cancelled: false };
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

  async function applyProfileById(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileId}`);
    }
    const secretResult = await promptForLaunchSecret(profile);
    if (secretResult.cancelled) {
      return `Connection profile apply cancelled for [${profile.id}] ${profile.name}.`;
    }
    const session = await api.createSession({
      connectionProfileId: profile.id,
      ...(secretResult.remoteSecret !== undefined ? { remoteSecret: secretResult.remoteSecret } : {})
    });
    applyRuntimeEvent({ type: "session.created", session });
    if (normalizeText(session.deckId)) {
      setActiveDeck(session.deckId);
    }
    setActiveSession(session.id);
    requestRender();
    return `Started session [${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)} from connection profile [${profile.id}] ${profile.name}.`;
  }

  async function renameProfileById(profileId, name) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileId}`);
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Connection profile name is required.");
    }
    const updated = await api.updateConnectionProfile(profile.id, { name: normalizedName });
    upsertProfile(updated);
    return `Renamed connection profile [${updated.id}] to ${updated.name}.`;
  }

  async function deleteProfileById(profileId) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileId}`);
    }
    await api.deleteConnectionProfile(profile.id);
    removeProfile(profile.id);
    return `Deleted connection profile [${profile.id}] ${profile.name}.`;
  }

  async function loadProfiles() {
    if (typeof api.listConnectionProfiles !== "function") {
      replaceProfiles([]);
      return [];
    }
    try {
      const payload = await api.listConnectionProfiles();
      replaceProfiles(payload || []);
      return profiles.slice();
    } catch (error) {
      setError(getErrorMessage(error, "Failed to load connection profiles."));
      replaceProfiles([]);
      return [];
    }
  }

  async function createProfileFlow(name, sessionOrId = undefined) {
    const activeSessionId = getActiveSessionId();
    const session = sessionOrId ? (typeof sessionOrId === "string" ? getSessionById(sessionOrId) : sessionOrId) : getSessionById(activeSessionId);
    if (!session) {
      throw new Error("No active session to save as a connection profile.");
    }
    const defaultName = formatSessionDisplayName(session);
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Connection profile name", defaultName));
    if (!input) {
      return "";
    }
    const feedback = await createProfileFromSession(session, input);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function applySelectedProfileFlow() {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    const feedback = await applyProfileById(profile.id);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function renameSelectedProfileFlow(name) {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Connection profile name", profile.name));
    if (!input) {
      return "";
    }
    const feedback = await renameProfileById(profile.id, input);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function deleteSelectedProfileFlow() {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    const confirmed = windowRef?.confirm?.(`Delete connection profile '${profile.name}'?`) !== false;
    if (!confirmed) {
      return "";
    }
    const feedback = await deleteProfileById(profile.id);
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  function bindUiEvents() {
    selectEl?.addEventListener?.("change", () => {
      selectedProfileId = normalizeText(selectEl.value);
      syncSelection();
    });
    saveBtn?.addEventListener?.("click", () => {
      createProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to save connection profile.")));
    });
    applyBtn?.addEventListener?.("click", () => {
      applySelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to apply connection profile.")));
    });
    renameBtn?.addEventListener?.("click", () => {
      renameSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to rename connection profile.")));
    });
    deleteBtn?.addEventListener?.("click", () => {
      deleteSelectedProfileFlow().catch((error) => setError(getErrorMessage(error, "Failed to delete connection profile.")));
    });
  }

  render();

  return {
    listProfiles,
    getProfile,
    resolveProfile,
    replaceProfiles,
    upsertProfile,
    removeProfile,
    getLaunchForSession,
    createProfileFromSession,
    applyProfileById,
    renameProfileById,
    deleteProfileById,
    loadProfiles,
    createProfileFlow,
    applySelectedProfileFlow,
    renameSelectedProfileFlow,
    deleteSelectedProfileFlow,
    bindUiEvents,
    render
  };
}
