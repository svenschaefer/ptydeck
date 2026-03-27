import {
  buildSessionInputSafetyProfileFromPreset,
  detectSessionInputSafetyPreset,
  listSessionInputSafetyPresetOptions,
  normalizeSessionInputSafetyProfile
} from "../input-safety-profile.js";

const THEME_SLOT_OPTIONS = Object.freeze([
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" }
]);

export function createSessionSettingsStateController(options = {}) {
  const themeProfileKeys = Array.isArray(options.themeProfileKeys) ? options.themeProfileKeys.slice() : [];
  const defaultTerminalTheme = options.defaultTerminalTheme && typeof options.defaultTerminalTheme === "object"
    ? options.defaultTerminalTheme
    : {};
  const themeFilterCategorySet = options.themeFilterCategorySet || new Set(["all"]);
  const terminalThemePresetMap = options.terminalThemePresetMap || new Map();
  const terminalThemePresets = Array.isArray(options.terminalThemePresets) ? options.terminalThemePresets : [];
  const terminalThemeModeSet = options.terminalThemeModeSet || new Set(["custom"]);
  const sessionThemeDrafts = options.sessionThemeDrafts || new Map();
  const getSessionById = options.getSessionById || (() => null);
  const getSessionSendTerminator = options.getSessionSendTerminator || (() => "auto");
  const getActiveSessionId = options.getActiveSessionId || (() => "");
  const normalizeSendTerminatorMode = options.normalizeSendTerminatorMode || ((value) => value);
  const formatSessionEnv = options.formatSessionEnv || (() => "");
  const formatSessionTags = options.formatSessionTags || (() => "");
  const parseSessionEnv = options.parseSessionEnv || (() => ({ ok: true, env: {} }));
  const parseSessionTags = options.parseSessionTags || (() => ({ ok: true, tags: [] }));
  const normalizeSessionStartupFromSession = options.normalizeSessionStartupFromSession || (() => ({}));
  const terminals = options.terminals || new Map();
  const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
  const inputSafetyPresetOptions = Array.isArray(options.inputSafetyPresetOptions)
    ? options.inputSafetyPresetOptions
    : listSessionInputSafetyPresetOptions();

  function isValidHexColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
  }

  function normalizeThemeSlot(value) {
    return String(value || "").trim().toLowerCase() === "inactive" ? "inactive" : "active";
  }

  function normalizeThemeProfile(themeProfile) {
    const source = themeProfile && typeof themeProfile === "object" ? themeProfile : {};
    const normalized = {};
    for (const key of themeProfileKeys) {
      const value = source[key];
      normalized[key] = isValidHexColor(value) ? String(value).trim() : defaultTerminalTheme[key];
    }
    return normalized;
  }

  function normalizeThemeFilterCategory(value) {
    return themeFilterCategorySet.has(value) ? value : "all";
  }

  function getThemePresetById(presetId) {
    if (!presetId || typeof presetId !== "string") {
      return null;
    }
    return terminalThemePresetMap.get(presetId) || null;
  }

  function getFilteredThemePresets(category, searchText) {
    const normalizedCategory = normalizeThemeFilterCategory(String(category || "").toLowerCase());
    const normalizedSearch = String(searchText || "").trim().toLowerCase();
    return terminalThemePresets.filter((entry) => {
      if (normalizedCategory !== "all" && entry.category !== normalizedCategory) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return entry.name.toLowerCase().includes(normalizedSearch) || entry.id.toLowerCase().includes(normalizedSearch);
    });
  }

  function setSelectOptions(selectEl, options, selectedValue) {
    if (!selectEl) {
      return;
    }
    if (!documentRef || typeof documentRef.createElement !== "function" || typeof selectEl.appendChild !== "function") {
      selectEl.value = selectedValue;
      return;
    }
    while (selectEl.firstChild) {
      selectEl.removeChild(selectEl.firstChild);
    }
    for (const optionDef of options) {
      const optionEl = documentRef.createElement("option");
      optionEl.value = optionDef.value;
      optionEl.textContent = optionDef.label;
      selectEl.appendChild(optionEl);
    }
    selectEl.value = selectedValue;
  }

  function detectThemePreset(themeProfile) {
    const normalized = normalizeThemeProfile(themeProfile);
    for (const preset of terminalThemePresets) {
      let matches = true;
      const presetProfile = normalizeThemeProfile(preset.profile);
      for (const key of themeProfileKeys) {
        if (normalized[key] !== presetProfile[key]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return preset.id;
      }
    }
    return "custom";
  }

  function getSessionThemeProfile(session, slot) {
    const normalizedSlot = normalizeThemeSlot(slot);
    const directKey = normalizedSlot === "inactive" ? "inactiveThemeProfile" : "activeThemeProfile";
    const fallbackProfile = session?.themeProfile;
    return normalizeThemeProfile(session?.[directKey] || fallbackProfile);
  }

  function createThemeSlotConfig(profile) {
    const normalizedProfile = normalizeThemeProfile(profile);
    return {
      preset: detectThemePreset(normalizedProfile),
      profile: normalizedProfile,
      category: "all",
      search: ""
    };
  }

  function normalizeThemeSlotConfig(config, fallbackProfile) {
    const normalizedProfile = normalizeThemeProfile(config?.profile || fallbackProfile);
    const preset = terminalThemeModeSet.has(config?.preset) ? config.preset : detectThemePreset(normalizedProfile);
    return {
      preset,
      profile: normalizedProfile,
      category: normalizeThemeFilterCategory(String(config?.category || "all").toLowerCase()),
      search: String(config?.search || "")
    };
  }

  function getSessionThemeDraft(sessionId) {
    const draft = sessionThemeDrafts.get(sessionId);
    const session = getSessionById(sessionId);
    const activeProfile = getSessionThemeProfile(session, "active");
    const inactiveProfile = getSessionThemeProfile(session, "inactive");

    if (draft && typeof draft === "object") {
      const selectedSlot = normalizeThemeSlot(draft.selectedSlot || draft.slot || "active");
      if (draft.active || draft.inactive) {
        return {
          selectedSlot,
          active: normalizeThemeSlotConfig(draft.active, activeProfile),
          inactive: normalizeThemeSlotConfig(draft.inactive, inactiveProfile)
        };
      }
      if (draft.profile) {
        return {
          selectedSlot,
          active: normalizeThemeSlotConfig(draft, activeProfile),
          inactive: createThemeSlotConfig(inactiveProfile)
        };
      }
    }

    return {
      selectedSlot: "active",
      active: createThemeSlotConfig(activeProfile),
      inactive: createThemeSlotConfig(inactiveProfile)
    };
  }

  function getSessionThemeSelectedSlot(sessionId) {
    return getSessionThemeDraft(sessionId).selectedSlot;
  }

  function setSessionThemeSelectedSlot(sessionId, slot) {
    const draft = getSessionThemeDraft(sessionId);
    sessionThemeDrafts.set(sessionId, {
      ...draft,
      selectedSlot: normalizeThemeSlot(slot)
    });
  }

  function getSessionThemeConfig(sessionId, slot = undefined) {
    const draft = getSessionThemeDraft(sessionId);
    const resolvedSlot = normalizeThemeSlot(slot || draft.selectedSlot);
    return draft[resolvedSlot];
  }

  function buildThemeFromConfig(config) {
    return normalizeThemeProfile(config?.profile);
  }

  function getThemeInput(entry, key) {
    if (!entry) {
      return null;
    }
    if (entry.themeInputs && entry.themeInputs[key]) {
      return entry.themeInputs[key];
    }
    if (key === "background") {
      return entry.themeBg || null;
    }
    if (key === "foreground") {
      return entry.themeFg || null;
    }
    return null;
  }

  function readThemeProfileFromControls(entry) {
    const profile = {};
    for (const key of themeProfileKeys) {
      const input = getThemeInput(entry, key);
      const value = input ? String(input.value || "").trim() : "";
      profile[key] = isValidHexColor(value) ? value : defaultTerminalTheme[key];
    }
    return profile;
  }

  function setThemeProfileOnControls(entry, profile) {
    for (const key of themeProfileKeys) {
      const input = getThemeInput(entry, key);
      if (input) {
        input.value = profile[key];
      }
    }
  }

  function writeThemeDraft(sessionId, nextDraft) {
    sessionThemeDrafts.set(sessionId, {
      selectedSlot: normalizeThemeSlot(nextDraft.selectedSlot),
      active: normalizeThemeSlotConfig(nextDraft.active, nextDraft.active?.profile),
      inactive: normalizeThemeSlotConfig(nextDraft.inactive, nextDraft.inactive?.profile)
    });
    return sessionThemeDrafts.get(sessionId);
  }

  function updateSessionThemeDraftFromControls(entry, sessionId, overrides = {}) {
    const draft = getSessionThemeDraft(sessionId);
    const selectedSlot = normalizeThemeSlot(overrides.selectedSlot || entry?.themeSlotSelect?.value || draft.selectedSlot);
    const currentSlot = normalizeThemeSlot(overrides.slot || selectedSlot);
    const currentConfig = draft[currentSlot];
    const nextPreset = terminalThemeModeSet.has(overrides.preset)
      ? overrides.preset
      : terminalThemeModeSet.has(entry?.themeSelect?.value)
        ? entry.themeSelect.value
        : currentConfig.preset;
    const nextProfile = normalizeThemeProfile(overrides.profile || readThemeProfileFromControls(entry));
    const nextConfig = {
      preset: nextPreset,
      profile: nextProfile,
      category: normalizeThemeFilterCategory(
        String(overrides.category || entry?.themeCategory?.value || currentConfig.category || "all").toLowerCase()
      ),
      search: String(overrides.search !== undefined ? overrides.search : entry?.themeSearch?.value || currentConfig.search || "")
    };
    return writeThemeDraft(sessionId, {
      ...draft,
      selectedSlot,
      [currentSlot]: nextConfig
    });
  }

  function readSessionThemeProfilesForSave(entry, sessionId, session) {
    const draft = updateSessionThemeDraftFromControls(entry, sessionId, {
      selectedSlot: entry?.themeSlotSelect?.value || getSessionThemeSelectedSlot(sessionId)
    });
    return {
      activeThemeProfile: normalizeThemeProfile(draft.active?.profile || getSessionThemeProfile(session, "active")),
      inactiveThemeProfile: normalizeThemeProfile(draft.inactive?.profile || getSessionThemeProfile(session, "inactive"))
    };
  }

  function syncThemePresetOptions(entry, config) {
    if (!entry?.themeSelect) {
      return;
    }
    const category = normalizeThemeFilterCategory(config?.category);
    const search = String(config?.search || "");
    const filtered = getFilteredThemePresets(category, search);
    const selectedPresetId = terminalThemeModeSet.has(config?.preset) ? config.preset : "custom";
    const options = filtered.map((preset) => ({
      value: preset.id,
      label: `[${preset.category}] ${preset.name}`
    }));
    if (!options.some((option) => option.value === selectedPresetId) && selectedPresetId !== "custom") {
      const selectedPreset = getThemePresetById(selectedPresetId);
      if (selectedPreset) {
        options.unshift({
          value: selectedPreset.id,
          label: `[${selectedPreset.category}] ${selectedPreset.name}`
        });
      }
    }
    options.push({ value: "custom", label: "Custom Palette" });
    setSelectOptions(entry.themeSelect, options, selectedPresetId);
  }

  function syncSessionThemeControls(entry, sessionId) {
    if (!entry || !entry.themeSelect) {
      return;
    }
    const draft = getSessionThemeDraft(sessionId);
    const selectedSlot = normalizeThemeSlot(entry.themeSlotSelect?.value || draft.selectedSlot);
    if (entry.themeSlotSelect) {
      setSelectOptions(entry.themeSlotSelect, THEME_SLOT_OPTIONS, selectedSlot);
    }
    const config = draft[selectedSlot];
    if (entry.themeCategory) {
      entry.themeCategory.value = normalizeThemeFilterCategory(config.category);
    }
    if (entry.themeSearch) {
      entry.themeSearch.value = config.search || "";
    }
    syncThemePresetOptions(entry, config);
    setThemeProfileOnControls(entry, config.profile);
    const customSelected = config.preset === "custom";
    for (const key of themeProfileKeys) {
      const input = getThemeInput(entry, key);
      if (input) {
        input.disabled = !customSelected;
      }
    }
  }

  function applyThemeForSession(sessionId, options = {}) {
    const entry = terminals.get(sessionId);
    if (!entry) {
      return;
    }
    const requestedSlot = options.themeSlot ? normalizeThemeSlot(options.themeSlot) : null;
    const activeSessionId = getActiveSessionId();
    const resolvedSlot = requestedSlot || (options.active === false ? "inactive" : options.active === true ? "active" : activeSessionId === sessionId ? "active" : "inactive");
    const theme = buildThemeFromConfig(getSessionThemeConfig(sessionId, resolvedSlot));
    const themeSignature = `${resolvedSlot}:${JSON.stringify(theme)}`;
    if (entry.appliedThemeSignature === themeSignature) {
      return;
    }
    if (typeof entry.terminal?.setOption === "function") {
      entry.terminal.setOption("theme", theme);
    } else if (entry.terminal?.options && typeof entry.terminal.options === "object") {
      entry.terminal.options.theme = theme;
    }
    entry.appliedThemeSignature = themeSignature;
  }

  function setStartupSettingsFeedback(entry, message, isError = false) {
    if (!entry?.startFeedback) {
      return;
    }
    entry.startFeedback.textContent = message || "";
    entry.startFeedback.classList.toggle("error", Boolean(isError));
  }

  function syncSessionStartupControls(entry, session) {
    if (!entry || !entry.startCwdInput || !entry.startCommandInput || !entry.startEnvInput) {
      return;
    }
    const startCwd = typeof session.startCwd === "string" && session.startCwd.trim() ? session.startCwd : session.cwd || "";
    entry.startCwdInput.value = startCwd;
    entry.startCommandInput.value = typeof session.startCommand === "string" ? session.startCommand : "";
    entry.startEnvInput.value = formatSessionEnv(session.env);
    if (entry.sessionTagsInput) {
      entry.sessionTagsInput.value = formatSessionTags(session.tags);
    }
    if (entry.sessionSendTerminatorSelect) {
      entry.sessionSendTerminatorSelect.value = getSessionSendTerminator(session.id);
    }
  }

  function syncSessionInputSafetyControls(entry, session) {
    if (!entry?.inputSafetyPresetSelect) {
      return;
    }
    setSelectOptions(
      entry.inputSafetyPresetSelect,
      inputSafetyPresetOptions,
      detectSessionInputSafetyPreset(session?.inputSafetyProfile)
    );
  }

  function readSessionStartupFromControls(entry) {
    const startCwd = String(entry?.startCwdInput?.value || "").trim();
    const startCommand = String(entry?.startCommandInput?.value || "");
    const envResult = parseSessionEnv(String(entry?.startEnvInput?.value || ""));
    const sendTerminator = normalizeSendTerminatorMode(String(entry?.sessionSendTerminatorSelect?.value || "").toLowerCase());
    const tagResult = parseSessionTags(String(entry?.sessionTagsInput?.value || ""));
    return {
      startCwd,
      startCommand,
      envResult,
      sendTerminator,
      tagResult
    };
  }

  function readSessionInputSafetyFromControls(entry, session) {
    const selectedPreset = String(entry?.inputSafetyPresetSelect?.value || "").trim() || "off";
    if (selectedPreset === "custom") {
      return normalizeSessionInputSafetyProfile(session?.inputSafetyProfile);
    }
    return buildSessionInputSafetyProfileFromPreset(selectedPreset);
  }

  function areStringMapsEqual(left, right) {
    const leftEntries = Object.entries(left || {}).sort((a, b) => a[0].localeCompare(b[0]));
    const rightEntries = Object.entries(right || {}).sort((a, b) => a[0].localeCompare(b[0]));
    if (leftEntries.length !== rightEntries.length) {
      return false;
    }
    for (let index = 0; index < leftEntries.length; index += 1) {
      const [leftKey, leftValue] = leftEntries[index];
      const [rightKey, rightValue] = rightEntries[index];
      if (leftKey !== rightKey || String(leftValue) !== String(rightValue)) {
        return false;
      }
    }
    return true;
  }

  function areThemeProfilesEqual(left, right) {
    const normalizedLeft = normalizeThemeProfile(left);
    const normalizedRight = normalizeThemeProfile(right);
    return themeProfileKeys.every((key) => normalizedLeft[key] === normalizedRight[key]);
  }

  function areStringArraysEqual(left, right) {
    const normalizedLeft = Array.isArray(left) ? left.map((value) => String(value)) : [];
    const normalizedRight = Array.isArray(right) ? right.map((value) => String(value)) : [];
    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }
    for (let index = 0; index < normalizedLeft.length; index += 1) {
      if (normalizedLeft[index] !== normalizedRight[index]) {
        return false;
      }
    }
    return true;
  }

  function isSessionSettingsDirty(entry, session) {
    if (!entry || !session) {
      return false;
    }
    const currentStartup = normalizeSessionStartupFromSession(session);
    const draftStartup = readSessionStartupFromControls(entry);
    const draftThemes = readSessionThemeProfilesForSave(entry, session.id, session);
    if (!draftStartup.startCwd || !draftStartup.envResult.ok || !draftStartup.tagResult.ok) {
      return true;
    }
    if (currentStartup.startCwd !== draftStartup.startCwd) {
      return true;
    }
    if (currentStartup.startCommand !== draftStartup.startCommand) {
      return true;
    }
    if (!areStringMapsEqual(currentStartup.env, draftStartup.envResult.env)) {
      return true;
    }
    if (!areStringArraysEqual(currentStartup.tags, draftStartup.tagResult.tags)) {
      return true;
    }
    if (!areThemeProfilesEqual(getSessionThemeProfile(session, "active"), draftThemes.activeThemeProfile)) {
      return true;
    }
    if (!areThemeProfilesEqual(getSessionThemeProfile(session, "inactive"), draftThemes.inactiveThemeProfile)) {
      return true;
    }
    if (getSessionSendTerminator(session.id) !== draftStartup.sendTerminator) {
      return true;
    }
    if (
      JSON.stringify(normalizeSessionInputSafetyProfile(session?.inputSafetyProfile)) !==
      JSON.stringify(readSessionInputSafetyFromControls(entry, session))
    ) {
      return true;
    }
    return false;
  }

  return {
    isValidHexColor,
    normalizeThemeSlot,
    normalizeThemeProfile,
    normalizeThemeFilterCategory,
    getThemePresetById,
    detectThemePreset,
    getSessionThemeConfig,
    getSessionThemeSelectedSlot,
    setSessionThemeSelectedSlot,
    buildThemeFromConfig,
    applyThemeForSession,
    readThemeProfileFromControls,
    updateSessionThemeDraftFromControls,
    readSessionThemeProfilesForSave,
    syncSessionThemeControls,
    setStartupSettingsFeedback,
    syncSessionStartupControls,
    syncSessionInputSafetyControls,
    readSessionStartupFromControls,
    readSessionInputSafetyFromControls,
    isSessionSettingsDirty
  };
}
