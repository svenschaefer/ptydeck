export function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

export function cloneStringRecord(value) {
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

export function cloneThemeProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const normalized = cloneStringRecord(value);
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function cloneRemoteConnection(value) {
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

export function cloneRemoteAuth(value) {
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

export function normalizeTagList(tags) {
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

export function normalizeConnectionProfileCollection(profiles) {
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

export function buildBlankConnectionProfileLaunch(options = {}) {
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

export function formatStringRecord(record) {
  return Object.entries(cloneStringRecord(record))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function parseStringRecord(text) {
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

export function formatTags(tags) {
  return normalizeTagList(tags).join(", ");
}

export function parseTags(text) {
  return normalizeTagList(String(text || "").split(/[\s,]+/));
}

export function normalizeThemePresetCollection(themePresets) {
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

export function themeProfilesEqual(left, right) {
  const normalizedLeft = cloneThemeProfile(left) || {};
  const normalizedRight = cloneThemeProfile(right) || {};
  const leftEntries = Object.entries(normalizedLeft).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const rightEntries = Object.entries(normalizedRight).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

export function getDefaultShellForKind(kind) {
  return normalizeLower(kind) === "ssh" ? "ssh" : "bash";
}

export function getDefaultStartCwdForKind(kind) {
  return normalizeLower(kind) === "ssh" ? "~" : "/";
}

export function cloneDraftLaunch(source = {}, options = {}) {
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const defaultThemeProfile = cloneThemeProfile(options.defaultThemeProfile) || {};
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

export function createDraftState(source = {}, options = {}) {
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const defaultThemeProfile = cloneThemeProfile(options.defaultThemeProfile) || {};
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
    launch: cloneDraftLaunch(source.launch || fallbackLaunch, { defaultDeckId, defaultThemeProfile })
  };
}

export function getDraftModeMessage(draftState, options = {}) {
  if (!draftState) {
    return "";
  }
  const getProfile = typeof options.getProfile === "function" ? options.getProfile : () => null;
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

export function getDeckOptionsForDraft(draftState, options = {}) {
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const documentRef = options.documentRef || null;
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

export function getThemePresetSelectOptions(themePresets, selectedValue, documentRef = null) {
  const options = normalizeThemePresetCollection(themePresets).map((preset) => ({
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

export function resolveThemePresetSelectionId(themePresets, profile) {
  for (const preset of normalizeThemePresetCollection(themePresets)) {
    if (themeProfilesEqual(preset.profile, profile)) {
      return preset.id;
    }
  }
  return "__custom__";
}

export function resolveThemeProfileFromSelection(themePresets, selectionId, fallbackProfile, defaultThemeProfile) {
  const normalizedSelectionId = normalizeText(selectionId);
  if (!normalizedSelectionId || normalizedSelectionId === "__custom__") {
    return cloneThemeProfile(fallbackProfile) || cloneThemeProfile(defaultThemeProfile) || {};
  }
  const preset = normalizeThemePresetCollection(themePresets).find((entry) => entry.id === normalizedSelectionId);
  return cloneThemeProfile(preset?.profile) || cloneThemeProfile(fallbackProfile) || cloneThemeProfile(defaultThemeProfile) || {};
}

export function getDraftLaunchFromInputs(options = {}) {
  const hasGuidedDraftControls = options.hasGuidedDraftControls === true;
  const rawDraftLaunch = typeof options.rawDraftLaunch === "string" ? options.rawDraftLaunch : "";
  const draftState = options.draftState || null;
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const defaultThemeProfile = cloneThemeProfile(options.defaultThemeProfile) || {};
  const themePresets = normalizeThemePresetCollection(options.themePresets);

  if (!hasGuidedDraftControls && typeof rawDraftLaunch === "string") {
    try {
      const parsed = JSON.parse(rawDraftLaunch || "{}");
      return cloneDraftLaunch(parsed, { defaultDeckId, defaultThemeProfile });
    } catch {
      return cloneDraftLaunch(draftState?.launch, { defaultDeckId, defaultThemeProfile });
    }
  }

  const currentLaunch = cloneDraftLaunch(draftState?.launch, { defaultDeckId, defaultThemeProfile });
  const kind = normalizeLower(options.kindValue || currentLaunch.kind) === "ssh" ? "ssh" : "local";
  const shellRaw = typeof options.shellValue === "string" ? options.shellValue : currentLaunch.shell;
  const startCwdRaw = typeof options.startCwdValue === "string" ? options.startCwdValue : currentLaunch.startCwd;
  const startCommandRaw =
    typeof options.startCommandValue === "string" ? options.startCommandValue : currentLaunch.startCommand || "";
  const draftLaunch = {
    kind,
    deckId: normalizeText(options.deckValue || currentLaunch.deckId) || defaultDeckId,
    shell: typeof shellRaw === "string" ? shellRaw : getDefaultShellForKind(kind),
    startCwd: typeof startCwdRaw === "string" ? startCwdRaw : getDefaultStartCwdForKind(kind),
    startCommand: typeof startCommandRaw === "string" ? startCommandRaw : "",
    env: parseStringRecord(options.envText),
    tags: parseTags(options.tagsText),
    themeProfile: resolveThemeProfileFromSelection(
      themePresets,
      options.activeThemeSelection,
      currentLaunch.themeProfile || currentLaunch.activeThemeProfile,
      defaultThemeProfile
    ),
    activeThemeProfile: resolveThemeProfileFromSelection(
      themePresets,
      options.activeThemeSelection,
      currentLaunch.activeThemeProfile,
      defaultThemeProfile
    ),
    inactiveThemeProfile: resolveThemeProfileFromSelection(
      themePresets,
      options.inactiveThemeSelection,
      currentLaunch.inactiveThemeProfile,
      defaultThemeProfile
    )
  };
  if (kind === "ssh") {
    const portRaw = normalizeText(options.remotePortValue);
    const parsedPort = Number.parseInt(portRaw || "22", 10);
    const method = normalizeText(options.remoteAuthMethodValue || currentLaunch.remoteAuth?.method) || "privateKey";
    draftLaunch.remoteConnection = {
      host: normalizeText(options.remoteHostValue || currentLaunch.remoteConnection?.host),
      port: Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 22,
      username: normalizeText(options.remoteUsernameValue || currentLaunch.remoteConnection?.username)
    };
    draftLaunch.remoteAuth = {
      method: ["password", "privateKey", "keyboardInteractive"].includes(method) ? method : "privateKey",
      privateKeyPath:
        typeof options.remotePrivateKeyPathValue === "string"
          ? options.remotePrivateKeyPathValue
          : currentLaunch.remoteAuth?.privateKeyPath || ""
    };
  }
  return draftLaunch;
}

export function buildPersistedDraftLaunch(currentLaunch, options = {}) {
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const defaultThemeProfile = cloneThemeProfile(options.defaultThemeProfile) || {};
  const kind = normalizeLower(currentLaunch?.kind) === "ssh" ? "ssh" : "local";
  const shell = normalizeText(currentLaunch?.shell);
  const startCwd = normalizeText(currentLaunch?.startCwd);
  if (!shell) {
    throw new Error("Shell is required.");
  }
  if (!startCwd) {
    throw new Error("Start directory is required.");
  }
  const payload = {
    kind,
    deckId: normalizeText(currentLaunch?.deckId) || defaultDeckId,
    shell,
    startCwd,
    startCommand: typeof currentLaunch?.startCommand === "string" ? currentLaunch.startCommand : "",
    env: cloneStringRecord(currentLaunch?.env),
    tags: normalizeTagList(currentLaunch?.tags),
    ...(cloneThemeProfile(currentLaunch?.themeProfile) ? { themeProfile: cloneThemeProfile(currentLaunch.themeProfile) } : {}),
    activeThemeProfile: cloneThemeProfile(currentLaunch?.activeThemeProfile) || cloneThemeProfile(defaultThemeProfile) || {},
    inactiveThemeProfile: cloneThemeProfile(currentLaunch?.inactiveThemeProfile) || cloneThemeProfile(defaultThemeProfile) || {}
  };
  if (kind === "ssh") {
    const host = normalizeText(currentLaunch?.remoteConnection?.host);
    const port = Number.parseInt(String(currentLaunch?.remoteConnection?.port ?? 22), 10);
    const username = normalizeText(currentLaunch?.remoteConnection?.username);
    const method = normalizeText(currentLaunch?.remoteAuth?.method) || "privateKey";
    const privateKeyPath = normalizeText(currentLaunch?.remoteAuth?.privateKeyPath);
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
