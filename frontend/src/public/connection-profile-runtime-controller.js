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
    kind: "local",
    deckId,
    shell: "bash",
    startCwd: "/",
    startCommand: "",
    env: {},
    tags: [],
    activeThemeProfile: themeProfile || {},
    inactiveThemeProfile: themeProfile || {}
  });
}

export function createConnectionProfileRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const documentRef = options.documentRef || null;
  const api = options.api || {};
  const selectEl = options.selectEl || null;
  const newBtn = options.newBtn || null;
  const saveBtn = options.saveBtn || null;
  const saveDraftBtn = options.saveDraftBtn || null;
  const resetDraftBtn = options.resetDraftBtn || null;
  const applyBtn = options.applyBtn || null;
  const duplicateBtn = options.duplicateBtn || null;
  const renameBtn = options.renameBtn || null;
  const deleteBtn = options.deleteBtn || null;
  const statusEl = options.statusEl || null;
  const summaryEl = options.summaryEl || null;
  const draftNameInputEl = options.draftNameInputEl || null;
  const draftLaunchTextareaEl = options.draftLaunchTextareaEl || null;
  const draftStatusEl = options.draftStatusEl || null;
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
  const defaultThemeProfile =
    cloneThemeProfile(options.defaultThemeProfile) || cloneThemeProfile(normalizeThemeProfile({})) || undefined;

  let profiles = [];
  let selectedProfileId = "";
  let draftState = null;

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

  function createDraftState(source = {}) {
    const fallbackLaunch =
      buildBlankConnectionProfileLaunch({
        deckId: normalizeText(source.deckId) || defaultDeckId,
        defaultThemeProfile
      }) || {};
    return {
      mode: normalizeText(source.mode) || "blank",
      profileId: normalizeText(source.profileId),
      name: normalizeText(source.name),
      launch: normalizeConnectionProfileLaunch(source.launch) || fallbackLaunch
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
    return "Editing a new unsaved connection profile.";
  }

  function renderDraft() {
    if (!draftState) {
      return;
    }
    if (draftNameInputEl) {
      draftNameInputEl.value = draftState.name;
    }
    if (draftLaunchTextareaEl) {
      draftLaunchTextareaEl.value = JSON.stringify(draftState.launch || {}, null, 2);
    }
    if (summaryEl) {
      const selectedProfile = getSelectedProfile();
      summaryEl.textContent = selectedProfile
        ? formatConnectionProfileSummary(selectedProfile)
        : "No saved connection profile selected. The draft below can still be saved as a new profile.";
    }
    setDraftStatus(getDraftModeMessage());
  }

  function setDraftState(nextDraft) {
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
      name: "New Connection",
      deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
      launch: buildBlankConnectionProfileLaunch({
        deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
        defaultThemeProfile
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

  function parseDraftLaunch() {
    const raw = typeof draftLaunchTextareaEl?.value === "string" ? draftLaunchTextareaEl.value : "";
    let parsed;
    try {
      parsed = JSON.parse(raw || "{}");
    } catch (error) {
      throw new Error(`Connection profile launch JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    const launch = normalizeConnectionProfileLaunch(parsed);
    if (!launch) {
      throw new Error(
        "Connection profile launch JSON is incomplete. Required fields: shell, startCwd, activeThemeProfile, inactiveThemeProfile."
      );
    }
    return launch;
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

  async function duplicateProfileById(profileId, name) {
    const profile = getProfile(profileId);
    if (!profile) {
      throw new Error(`Unknown connection profile: ${profileId}`);
    }
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new Error("Connection profile name is required.");
    }
    const created = await api.createConnectionProfile({
      name: normalizedName,
      launch: profile.launch
    });
    const duplicated = upsertProfile(created);
    return `Duplicated connection profile [${profile.id}] ${profile.name} as [${duplicated.id}] ${duplicated.name}.`;
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

  async function saveDraftById() {
    const name = normalizeText(draftNameInputEl?.value || draftState?.name);
    if (!name) {
      throw new Error("Connection profile name is required.");
    }
    const launch = parseDraftLaunch();
    const existingProfileId = normalizeText(draftState?.profileId);
    if (existingProfileId && getProfile(existingProfileId)) {
      const updated = await api.updateConnectionProfile(existingProfileId, { name, launch });
      const profile = upsertProfile(updated);
      setDraftState({
        mode: "profile",
        profileId: profile?.id,
        name: profile?.name,
        launch: profile?.launch
      });
      return `Updated connection profile [${profile.id}] ${profile.name}.`;
    }
    const created = await api.createConnectionProfile({ name, launch });
    const profile = upsertProfile(created);
    setDraftState({
      mode: "profile",
      profileId: profile?.id,
      name: profile?.name,
      launch: profile?.launch
    });
    return `Saved connection profile [${profile.id}] ${profile.name}.`;
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

  async function newDraftFlow() {
    const activeSession = getSessionById(getActiveSessionId());
    setDraftState({
      mode: "blank",
      profileId: "",
      name: "New Connection",
      deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
      launch: buildBlankConnectionProfileLaunch({
        deckId: normalizeText(activeSession?.deckId) || defaultDeckId,
        defaultThemeProfile
      })
    });
    const feedback = "Opened a new connection profile draft.";
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function loadActiveDraftFlow() {
    loadDraftFromActiveSession();
    const feedback = "Loaded the active session into a new connection profile draft.";
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function saveDraftFlow() {
    const feedback = await saveDraftById();
    setCommandFeedback(feedback);
    setStatus(feedback);
    return feedback;
  }

  async function resetDraftFlow() {
    resetDraftFromSelectedProfile();
    const feedback = "Reset the connection profile draft.";
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

  async function duplicateSelectedProfileFlow(name) {
    const profile = getSelectedProfile();
    if (!profile) {
      return "";
    }
    const defaultName = `${profile.name} Copy`;
    const input = normalizeText(name) || normalizeText(windowRef?.prompt?.("Connection profile name", defaultName));
    if (!input) {
      return "";
    }
    const feedback = await duplicateProfileById(profile.id, input);
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
      resetDraftFromSelectedProfile();
    });
    newBtn?.addEventListener?.("click", () => {
      newDraftFlow().catch((error) => setError(getErrorMessage(error, "Failed to open a new connection profile draft.")));
    });
    saveBtn?.addEventListener?.("click", () => {
      loadActiveDraftFlow().catch((error) => setError(getErrorMessage(error, "Failed to load the active session into a connection profile draft.")));
    });
    saveDraftBtn?.addEventListener?.("click", () => {
      saveDraftFlow().catch((error) => setError(getErrorMessage(error, "Failed to save the connection profile draft.")));
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
  }

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
    resetDraftFlow,
    applySelectedProfileFlow,
    duplicateSelectedProfileFlow,
    renameSelectedProfileFlow,
    deleteSelectedProfileFlow,
    bindUiEvents,
    render
  };
}
