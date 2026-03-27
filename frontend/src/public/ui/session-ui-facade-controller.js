function createDefaultThemeProfile(themeProfileKeys, defaultTerminalTheme, themeProfile) {
  const source = themeProfile && typeof themeProfile === "object" ? themeProfile : {};
  const normalized = {};
  for (const key of themeProfileKeys) {
    const value = typeof source[key] === "string" ? source[key].trim() : "";
    normalized[key] = /^#[0-9a-fA-F]{6}$/.test(value) ? value : defaultTerminalTheme[key];
  }
  return normalized;
}

function createDefaultStartupReadResult() {
  return {
    startCwd: "",
    startCommand: "",
    envResult: { ok: true, env: {} },
    sendTerminator: "auto",
    tagResult: { ok: true, tags: [] }
  };
}

function createDefaultSessionStartupState() {
  return {
    startCwd: "",
    startCommand: "",
    env: {},
    tags: []
  };
}

export function createSessionUiFacadeController(options = {}) {
  const getSessionViewModel =
    typeof options.getSessionViewModel === "function" ? options.getSessionViewModel : () => null;
  const getSessionSettingsStateController =
    typeof options.getSessionSettingsStateController === "function"
      ? options.getSessionSettingsStateController
      : () => null;
  const getSessionCardMetaController =
    typeof options.getSessionCardMetaController === "function" ? options.getSessionCardMetaController : () => null;
  const themeProfileKeys = Array.isArray(options.themeProfileKeys) ? options.themeProfileKeys.slice() : [];
  const defaultTerminalTheme =
    options.defaultTerminalTheme && typeof options.defaultTerminalTheme === "object" ? options.defaultTerminalTheme : {};

  function isValidHexColor(value) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.isValidHexColor === "function") {
      return settingsStateController.isValidHexColor(value) === true;
    }
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
  }

  function normalizeThemeProfile(themeProfile) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.normalizeThemeProfile === "function") {
      return settingsStateController.normalizeThemeProfile(themeProfile);
    }
    return createDefaultThemeProfile(themeProfileKeys, defaultTerminalTheme, themeProfile);
  }

  function normalizeThemeFilterCategory(value) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.normalizeThemeFilterCategory === "function") {
      return settingsStateController.normalizeThemeFilterCategory(value);
    }
    return value === "dark" || value === "light" ? value : "all";
  }

  function getThemePresetById(presetId) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.getThemePresetById === "function") {
      return settingsStateController.getThemePresetById(presetId) || null;
    }
    return null;
  }

  function detectThemePreset(themeProfile) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.detectThemePreset === "function") {
      return settingsStateController.detectThemePreset(themeProfile) || "custom";
    }
    return "custom";
  }

  function getSessionRuntimeState(session) {
    return getSessionViewModel()?.getSessionRuntimeState?.(session) || "running";
  }

  function isSessionUnrestored(session) {
    return getSessionViewModel()?.isSessionUnrestored?.(session) === true;
  }

  function isSessionExited(session) {
    return getSessionViewModel()?.isSessionExited?.(session) === true;
  }

  function isSessionActionBlocked(session) {
    return getSessionViewModel()?.isSessionActionBlocked?.(session) === true;
  }

  function getSessionStateBadgeText(session) {
    return getSessionViewModel()?.getSessionStateBadgeText?.(session) || "";
  }

  function getExitedSessionStatusSuffix(session) {
    return getSessionViewModel()?.getExitedSessionStatusSuffix?.(session) || "";
  }

  function getSessionStateHintText(session) {
    return getSessionViewModel()?.getSessionStateHintText?.(session) || "";
  }

  function getSessionActivityIndicatorState(session) {
    return getSessionViewModel()?.getSessionActivityIndicatorState?.(session) || "";
  }

  function getUnrestoredSessionMessage(session) {
    return getSessionViewModel()?.getUnrestoredSessionMessage?.(session) || "";
  }

  function getExitedSessionMessage(session) {
    return getSessionViewModel()?.getExitedSessionMessage?.(session) || "";
  }

  function getBlockedSessionActionMessage(sessions, actionLabel) {
    return getSessionViewModel()?.getBlockedSessionActionMessage?.(sessions, actionLabel) || "";
  }

  function getSessionThemeConfig(sessionId, slot = undefined) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.getSessionThemeConfig === "function") {
      return settingsStateController.getSessionThemeConfig(sessionId, slot);
    }
    return {
      preset: "custom",
      profile: normalizeThemeProfile(null),
      category: "all",
      search: ""
    };
  }

  function normalizeThemeSlot(value) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.normalizeThemeSlot === "function") {
      return settingsStateController.normalizeThemeSlot(value);
    }
    return String(value || "").trim().toLowerCase() === "inactive" ? "inactive" : "active";
  }

  function getSessionThemeSelectedSlot(sessionId) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.getSessionThemeSelectedSlot === "function") {
      return settingsStateController.getSessionThemeSelectedSlot(sessionId);
    }
    return "active";
  }

  function setSessionThemeSelectedSlot(sessionId, slot) {
    getSessionSettingsStateController()?.setSessionThemeSelectedSlot?.(sessionId, slot);
  }

  function buildThemeFromConfig(config) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.buildThemeFromConfig === "function") {
      return settingsStateController.buildThemeFromConfig(config);
    }
    return normalizeThemeProfile(config?.profile);
  }

  function applyThemeForSession(sessionId) {
    getSessionSettingsStateController()?.applyThemeForSession?.(sessionId);
  }

  function readThemeProfileFromControls(entry) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.readThemeProfileFromControls === "function") {
      return settingsStateController.readThemeProfileFromControls(entry);
    }
    return normalizeThemeProfile(null);
  }

  function updateSessionThemeDraftFromControls(entry, sessionId, overrides = {}) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.updateSessionThemeDraftFromControls === "function") {
      return settingsStateController.updateSessionThemeDraftFromControls(entry, sessionId, overrides);
    }
    return null;
  }

  function readSessionThemeProfilesForSave(entry, sessionId, session) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.readSessionThemeProfilesForSave === "function") {
      return settingsStateController.readSessionThemeProfilesForSave(entry, sessionId, session);
    }
    const profile = readThemeProfileFromControls(entry);
    return {
      activeThemeProfile: profile,
      inactiveThemeProfile: profile
    };
  }

  function syncSessionThemeControls(entry, sessionId) {
    getSessionSettingsStateController()?.syncSessionThemeControls?.(entry, sessionId);
  }

  function formatSessionEnv(env) {
    return getSessionViewModel()?.formatSessionEnv?.(env) || "";
  }

  function normalizeSessionTags(tags) {
    return getSessionViewModel()?.normalizeSessionTags?.(tags) || [];
  }

  function formatSessionTags(tags) {
    return getSessionViewModel()?.formatSessionTags?.(tags) || "";
  }

  function parseSessionTags(rawText) {
    return getSessionViewModel()?.parseSessionTags?.(rawText) || { ok: true, tags: [] };
  }

  function parseSessionEnv(rawText) {
    return getSessionViewModel()?.parseSessionEnv?.(rawText) || { ok: true, env: {} };
  }

  function setStartupSettingsFeedback(entry, message, isError = false) {
    getSessionSettingsStateController()?.setStartupSettingsFeedback?.(entry, message, isError);
  }

  function syncSessionStartupControls(entry, session) {
    getSessionSettingsStateController()?.syncSessionStartupControls?.(entry, session);
  }

  function normalizeSessionStartupFromSession(session) {
    return getSessionViewModel()?.normalizeSessionStartupFromSession?.(session) || createDefaultSessionStartupState();
  }

  function readSessionStartupFromControls(entry) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.readSessionStartupFromControls === "function") {
      return settingsStateController.readSessionStartupFromControls(entry);
    }
    return createDefaultStartupReadResult();
  }

  function syncSessionInputSafetyControls(entry, session) {
    getSessionSettingsStateController()?.syncSessionInputSafetyControls?.(entry, session);
  }

  function readSessionInputSafetyFromControls(entry, session) {
    const settingsStateController = getSessionSettingsStateController();
    if (typeof settingsStateController?.readSessionInputSafetyFromControls === "function") {
      return settingsStateController.readSessionInputSafetyFromControls(entry, session);
    }
    return session?.inputSafetyProfile || {};
  }

  function setSettingsDirty(entry, dirty) {
    getSessionCardMetaController()?.setSettingsDirty?.(entry, dirty);
  }

  function isSessionSettingsDirty(entry, session) {
    return getSessionSettingsStateController()?.isSessionSettingsDirty?.(entry, session) === true;
  }

  function renderSessionTagList(entry, session) {
    getSessionCardMetaController()?.renderSessionTagList?.(entry, session);
  }

  function renderSessionNote(entry, session) {
    getSessionCardMetaController()?.renderSessionNote?.(entry, session);
  }

  return {
    isValidHexColor,
    normalizeThemeSlot,
    normalizeThemeProfile,
    normalizeThemeFilterCategory,
    getThemePresetById,
    detectThemePreset,
    getSessionRuntimeState,
    isSessionUnrestored,
    isSessionExited,
    isSessionActionBlocked,
    getSessionStateBadgeText,
    getExitedSessionStatusSuffix,
    getSessionStateHintText,
    getSessionActivityIndicatorState,
    getUnrestoredSessionMessage,
    getExitedSessionMessage,
    getBlockedSessionActionMessage,
    getSessionThemeConfig,
    getSessionThemeSelectedSlot,
    setSessionThemeSelectedSlot,
    buildThemeFromConfig,
    applyThemeForSession,
    readThemeProfileFromControls,
    updateSessionThemeDraftFromControls,
    readSessionThemeProfilesForSave,
    syncSessionThemeControls,
    formatSessionEnv,
    normalizeSessionTags,
    formatSessionTags,
    parseSessionTags,
    parseSessionEnv,
    setStartupSettingsFeedback,
    syncSessionStartupControls,
    syncSessionInputSafetyControls,
    normalizeSessionStartupFromSession,
    readSessionStartupFromControls,
    readSessionInputSafetyFromControls,
    setSettingsDirty,
    isSessionSettingsDirty,
    renderSessionTagList,
    renderSessionNote
  };
}
