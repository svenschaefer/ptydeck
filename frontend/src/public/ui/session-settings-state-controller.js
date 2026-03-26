import {
  buildSessionInputSafetyProfileFromPreset,
  detectSessionInputSafetyPreset,
  listSessionInputSafetyPresetOptions,
  normalizeSessionInputSafetyProfile
} from "../input-safety-profile.js";

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

  function getSessionThemeConfig(sessionId) {
    const draft = sessionThemeDrafts.get(sessionId);
    if (draft) {
      return {
        preset: terminalThemeModeSet.has(draft.preset) ? draft.preset : "custom",
        profile: normalizeThemeProfile(draft.profile),
        category: normalizeThemeFilterCategory(draft.category),
        search: String(draft.search || "")
      };
    }
    const session = getSessionById(sessionId);
    const profile = normalizeThemeProfile(session?.themeProfile);
    const preset = detectThemePreset(profile);
    return { preset, profile, category: "all", search: "" };
  }

  function buildThemeFromConfig(config) {
    return normalizeThemeProfile(config?.profile);
  }

  function applyThemeForSession(sessionId) {
    const entry = terminals.get(sessionId);
    if (!entry) {
      return;
    }
    const theme = buildThemeFromConfig(getSessionThemeConfig(sessionId));
    if (typeof entry.terminal?.setOption === "function") {
      entry.terminal.setOption("theme", theme);
      return;
    }
    if (entry.terminal?.options && typeof entry.terminal.options === "object") {
      entry.terminal.options.theme = theme;
    }
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

  function syncSessionThemeControls(entry, sessionId) {
    if (!entry || !entry.themeSelect) {
      return;
    }
    const config = getSessionThemeConfig(sessionId);
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
    const draftTheme = readThemeProfileFromControls(entry);
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
    if (!areThemeProfilesEqual(session.themeProfile, draftTheme)) {
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
    normalizeThemeProfile,
    normalizeThemeFilterCategory,
    getThemePresetById,
    detectThemePreset,
    getSessionThemeConfig,
    buildThemeFromConfig,
    applyThemeForSession,
    readThemeProfileFromControls,
    syncSessionThemeControls,
    setStartupSettingsFeedback,
    syncSessionStartupControls,
    syncSessionInputSafetyControls,
    readSessionStartupFromControls,
    readSessionInputSafetyFromControls,
    isSessionSettingsDirty
  };
}
