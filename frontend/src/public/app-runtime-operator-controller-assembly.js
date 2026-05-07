import { createConnectionProfileRuntimeController as defaultCreateConnectionProfileRuntimeController } from "./connection-profile-runtime-controller.js";
import { createControlPaneRuntimeController as defaultCreateControlPaneRuntimeController } from "./control-pane-runtime-controller.js";
import { createLayoutProfileRuntimeController as defaultCreateLayoutProfileRuntimeController } from "./layout-profile-runtime-controller.js";
import { createWorkspacePresetRuntimeController as defaultCreateWorkspacePresetRuntimeController } from "./workspace-preset-runtime-controller.js";

function createNoopStore() {
  return {
    getState() {
      return {
        activeDeckId: "",
        activeSessionId: "",
        decks: [],
        sessions: []
      };
    },
    setActiveSession() {}
  };
}

function resolveStateArray(state, key) {
  return state && Array.isArray(state[key]) ? state[key] : [];
}

function resolveNormalizedThemeProfile(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function createAppRuntimeOperatorControllerAssembly(options = {}) {
  const createControlPaneRuntimeController =
    typeof options.createControlPaneRuntimeController === "function"
      ? options.createControlPaneRuntimeController
      : defaultCreateControlPaneRuntimeController;
  const createLayoutProfileRuntimeController =
    typeof options.createLayoutProfileRuntimeController === "function"
      ? options.createLayoutProfileRuntimeController
      : defaultCreateLayoutProfileRuntimeController;
  const createConnectionProfileRuntimeController =
    typeof options.createConnectionProfileRuntimeController === "function"
      ? options.createConnectionProfileRuntimeController
      : defaultCreateConnectionProfileRuntimeController;
  const createWorkspacePresetRuntimeController =
    typeof options.createWorkspacePresetRuntimeController === "function"
      ? options.createWorkspacePresetRuntimeController
      : defaultCreateWorkspacePresetRuntimeController;

  const windowRef = options.windowRef || globalThis.window;
  const documentRef = options.documentRef || globalThis.document;
  const store =
    options.store && typeof options.store.getState === "function" ? options.store : createNoopStore();
  const defaultDeckId = String(options.defaultDeckId || "default");
  const defaultTerminalCols = Number.isFinite(options.defaultTerminalCols) ? options.defaultTerminalCols : 80;
  const defaultTerminalRows = Number.isFinite(options.defaultTerminalRows) ? options.defaultTerminalRows : 20;

  let controlPaneRuntimeController = createControlPaneRuntimeController({
    windowRef,
    workspaceShellEl: options.workspaceShellEl || null,
    controlPaneEl: options.controlPaneEl || null,
    controlPaneLauncherBtn: options.controlPaneLauncherBtn || null,
    controlPaneToggleBtn: options.controlPaneToggleBtn || null,
    controlPanePositionSelectEl: options.controlPanePositionSelectEl || null,
    controlPaneStatusEl: options.controlPaneStatusEl || null,
    controlPaneResizeHandleEl: options.controlPaneResizeHandleEl || null,
    scheduleGlobalResize: (runtimeOptions) =>
      options.appLayoutDeckFacadeController?.scheduleGlobalResize?.(runtimeOptions),
    scheduleDeferredResizePasses: (runtimeOptions) =>
      options.appLayoutDeckFacadeController?.scheduleDeferredResizePasses?.(runtimeOptions)
  });

  let layoutProfileRuntimeController = createLayoutProfileRuntimeController({
    windowRef,
    documentRef,
    api: options.api,
    selectEl: options.layoutProfileSelectEl || null,
    saveBtn: options.layoutProfileSaveBtn || null,
    applyBtn: options.layoutProfileApplyBtn || null,
    renameBtn: options.layoutProfileRenameBtn || null,
    deleteBtn: options.layoutProfileDeleteBtn || null,
    statusEl: options.layoutProfileStatusEl || null,
    getDecks: () => resolveStateArray(store.getState(), "decks"),
    getActiveDeckId: () => String(store.getState()?.activeDeckId || defaultDeckId),
    getSessionFilterText: () => options.appLayoutDeckFacadeController?.getSessionFilterText?.() || "",
    getSidebarVisible: () => options.getTerminalSettings?.()?.sidebarVisible !== false,
    getControlPaneState: () => controlPaneRuntimeController?.getState?.() || {},
    getDeckTerminalGeometry: (deckId) =>
      options.appLayoutDeckFacadeController?.getDeckTerminalGeometry?.(deckId) || {
        cols: defaultTerminalCols,
        rows: defaultTerminalRows
      },
    getDeckById: (deckId) => options.appLayoutDeckFacadeController?.getDeckById?.(deckId),
    setSessionFilterText: (value) => options.appLayoutDeckFacadeController?.setSessionFilterText?.(value),
    setSidebarVisible: (visible) => options.appLayoutDeckFacadeController?.setSidebarVisible?.(visible),
    setControlPaneState: (nextState) => controlPaneRuntimeController?.setState?.(nextState),
    setActiveDeck: (deckId) => options.appLayoutDeckFacadeController?.setActiveDeck?.(deckId) === true,
    applyRuntimeEvent: (event, runtimeOptions) =>
      options.appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
    setCommandFeedback: (message) => options.appCommandUiFacadeController?.setCommandFeedback?.(message),
    setError: (message) => options.appCommandUiFacadeController?.setError?.(message),
    getErrorMessage: (error, fallback) =>
      options.appCommandUiFacadeController?.getErrorMessage?.(error, fallback) || fallback,
    requestText: (runtimeOptions) => options.actionDialogController?.requestText?.(runtimeOptions),
    confirmAction: (runtimeOptions) => options.actionDialogController?.confirm?.(runtimeOptions),
    requestRender: () => options.appCommandUiFacadeController?.render?.(),
    getDeckSplitLayouts: () => options.splitLayoutRuntimeController?.captureDeckSplitLayouts?.() || {},
    mergeDeckSplitLayouts: (snapshotLayouts, runtimeOptions) =>
      options.splitLayoutRuntimeController?.mergeDeckSplitLayouts?.(snapshotLayouts, runtimeOptions),
    setDeckSplitLayouts: (nextLayouts) =>
      options.splitLayoutRuntimeController?.replaceDeckSplitLayouts?.(nextLayouts)
  });

  let connectionProfileRuntimeController = createConnectionProfileRuntimeController({
    windowRef,
    documentRef,
    api: options.api,
    selectEl: options.connectionProfileSelectEl || null,
    newBtn: options.connectionProfileNewBtn || null,
    newSshBtn: options.connectionProfileNewSshBtn || null,
    saveBtn: options.connectionProfileSaveBtn || null,
    saveDraftBtn: options.connectionProfileSaveDraftBtn || null,
    saveAndLaunchBtn: options.connectionProfileSaveAndLaunchBtn || null,
    resetDraftBtn: options.connectionProfileResetDraftBtn || null,
    applyBtn: options.connectionProfileApplyBtn || null,
    duplicateBtn: options.connectionProfileDuplicateBtn || null,
    renameBtn: options.connectionProfileRenameBtn || null,
    deleteBtn: options.connectionProfileDeleteBtn || null,
    deleteConfirmEl: options.connectionProfileDeleteConfirmEl || null,
    deleteConfirmMessageEl: options.connectionProfileDeleteConfirmMessageEl || null,
    deleteConfirmBtn: options.connectionProfileDeleteConfirmBtn || null,
    deleteCancelBtn: options.connectionProfileDeleteCancelBtn || null,
    statusEl: options.connectionProfileStatusEl || null,
    summaryEl: options.connectionProfileSummaryEl || null,
    draftNameInputEl: options.connectionProfileDraftNameEl || null,
    draftKindSelectEl: options.connectionProfileKindEl || null,
    draftDeckSelectEl: options.connectionProfileDeckEl || null,
    draftShellInputEl: options.connectionProfileShellEl || null,
    draftStartCwdInputEl: options.connectionProfileStartCwdEl || null,
    draftStartCommandTextareaEl: options.connectionProfileStartCommandEl || null,
    draftEnvTextareaEl: options.connectionProfileEnvEl || null,
    draftTagsInputEl: options.connectionProfileTagsEl || null,
    draftActiveThemeSelectEl: options.connectionProfileActiveThemeEl || null,
    draftInactiveThemeSelectEl: options.connectionProfileInactiveThemeEl || null,
    sshFieldsEl: options.connectionProfileSshFieldsEl || null,
    draftRemoteHostInputEl: options.connectionProfileRemoteHostEl || null,
    draftRemotePortInputEl: options.connectionProfileRemotePortEl || null,
    draftRemoteUsernameInputEl: options.connectionProfileRemoteUsernameEl || null,
    draftRemoteAuthMethodSelectEl: options.connectionProfileRemoteAuthMethodEl || null,
    draftRemotePrivateKeyFieldEl: options.connectionProfileRemotePrivateKeyFieldEl || null,
    draftRemotePrivateKeyPathInputEl: options.connectionProfileRemotePrivateKeyPathEl || null,
    authHintEl: options.connectionProfileAuthHintEl || null,
    secretHintEl: options.connectionProfileSecretHintEl || null,
    runtimeSecretFieldEl: options.connectionProfileRuntimeSecretFieldEl || null,
    runtimeSecretInputEl: options.connectionProfileRuntimeSecretEl || null,
    sshTrustStatusEl: options.connectionProfileSshTrustStatusEl || null,
    sshTrustGuidanceEl: options.connectionProfileSshTrustGuidanceEl || null,
    sshTrustProbeBtn: options.connectionProfileSshTrustProbeBtn || null,
    sshProbeSelectEl: options.connectionProfileSshProbeSelectEl || null,
    sshTrustSelectEl: options.connectionProfileSshTrustSelectEl || null,
    sshTrustKeyTypeInputEl: options.connectionProfileSshTrustKeyTypeEl || null,
    sshTrustFingerprintInputEl: options.connectionProfileSshTrustFingerprintEl || null,
    sshTrustPublicKeyTextareaEl: options.connectionProfileSshTrustPublicKeyEl || null,
    sshTrustCompareEl: options.connectionProfileSshTrustCompareEl || null,
    sshTrustCompareStatusEl: options.connectionProfileSshTrustCompareStatusEl || null,
    sshTrustCurrentKeyTypeInputEl: options.connectionProfileSshTrustCurrentKeyTypeEl || null,
    sshTrustCurrentFingerprintInputEl: options.connectionProfileSshTrustCurrentFingerprintEl || null,
    sshTrustCandidateKeyTypeInputEl: options.connectionProfileSshTrustCandidateKeyTypeEl || null,
    sshTrustCandidateFingerprintInputEl: options.connectionProfileSshTrustCandidateFingerprintEl || null,
    sshTrustRefreshBtn: options.connectionProfileSshTrustRefreshBtn || null,
    sshTrustSaveBtn: options.connectionProfileSshTrustSaveBtn || null,
    sshTrustDeleteBtn: options.connectionProfileSshTrustDeleteBtn || null,
    sshTrustReplaceBtn: options.connectionProfileSshTrustReplaceBtn || null,
    draftLaunchTextareaEl: options.connectionProfileDraftLaunchEl || null,
    draftStatusEl: options.connectionProfileDraftStatusEl || null,
    getDecks: () => resolveStateArray(store.getState(), "decks"),
    getSessions: () => resolveStateArray(store.getState(), "sessions"),
    getSessionById: (sessionId) => options.appSessionRuntimeFacadeController?.getSessionById?.(sessionId) || null,
    getActiveSessionId: () => String(store.getState()?.activeSessionId || ""),
    setActiveSession: (sessionId) => store.setActiveSession?.(sessionId),
    setActiveDeck: (deckId) => options.appLayoutDeckFacadeController?.setActiveDeck?.(deckId) === true,
    applyRuntimeEvent: (event, runtimeOptions) =>
      options.appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
    setCommandFeedback: (message) => options.appCommandUiFacadeController?.setCommandFeedback?.(message),
    setError: (message) => options.appCommandUiFacadeController?.setError?.(message),
    getErrorMessage: (error, fallback) =>
      options.appCommandUiFacadeController?.getErrorMessage?.(error, fallback) || fallback,
    requestSecret: (runtimeOptions) => options.actionDialogController?.requestSecret?.(runtimeOptions),
    formatSessionToken: (sessionId) => options.appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
    formatSessionDisplayName: (session) =>
      options.appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
    requestRender: () => options.appCommandUiFacadeController?.render?.(),
    normalizeThemeProfile: (value) =>
      options.sessionUiFacadeController?.normalizeThemeProfile?.(value) || resolveNormalizedThemeProfile(value),
    themePresets: Array.isArray(options.terminalThemePresets) ? options.terminalThemePresets : [],
    defaultDeckId,
    defaultThemeProfile: options.defaultTerminalTheme || {}
  });

  let workspacePresetRuntimeController = createWorkspacePresetRuntimeController({
    windowRef,
    documentRef,
    api: options.api,
    presetSelectEl: options.workspacePresetSelectEl || null,
    presetSaveBtn: options.workspacePresetSaveBtn || null,
    presetApplyBtn: options.workspacePresetApplyBtn || null,
    presetDuplicateBtn: options.workspacePresetDuplicateBtn || null,
    presetRenameBtn: options.workspacePresetRenameBtn || null,
    presetDeleteBtn: options.workspacePresetDeleteBtn || null,
    presetNameInputEl: options.workspacePresetNameEl || null,
    presetDeleteConfirmEl: options.workspacePresetDeleteConfirmEl || null,
    presetDeleteConfirmMessageEl: options.workspacePresetDeleteConfirmMessageEl || null,
    presetDeleteConfirmBtn: options.workspacePresetDeleteConfirmBtn || null,
    presetDeleteCancelBtn: options.workspacePresetDeleteCancelBtn || null,
    groupSelectEl: options.workspacePresetGroupSelectEl || null,
    groupSaveBtn: options.workspacePresetGroupSaveBtn || null,
    groupApplyBtn: options.workspacePresetGroupApplyBtn || null,
    groupRenameBtn: options.workspacePresetGroupRenameBtn || null,
    groupDeleteBtn: options.workspacePresetGroupDeleteBtn || null,
    groupClearBtn: options.workspacePresetGroupClearBtn || null,
    groupNameInputEl: options.workspaceGroupNameEl || null,
    groupDeleteConfirmEl: options.workspaceGroupDeleteConfirmEl || null,
    groupDeleteConfirmMessageEl: options.workspaceGroupDeleteConfirmMessageEl || null,
    groupDeleteConfirmBtn: options.workspaceGroupDeleteConfirmBtn || null,
    groupDeleteCancelBtn: options.workspaceGroupDeleteCancelBtn || null,
    statusEl: options.workspacePresetStatusEl || null,
    summaryEl: options.workspacePresetSummaryEl || null,
    detailEl: options.workspacePresetDetailEl || null,
    groupSummaryEl: options.workspaceGroupSummaryEl || null,
    groupPersistenceEl: options.workspaceGroupPersistenceEl || null,
    getDecks: () => resolveStateArray(store.getState(), "decks"),
    getSessions: () => resolveStateArray(store.getState(), "sessions"),
    getActiveDeckId: () => String(store.getState()?.activeDeckId || defaultDeckId),
    getSessionFilterText: () => options.appLayoutDeckFacadeController?.getSessionFilterText?.() || "",
    getControlPaneState: () => controlPaneRuntimeController?.getState?.() || {},
    resolveFilterSelectors: (selectorText, sessions, resolveOptions) =>
      options.commandTargetRuntimeController?.resolveFilterSelectors?.(selectorText, sessions, resolveOptions) || {
        sessions: Array.isArray(sessions) ? sessions.slice() : [],
        error: ""
      },
    resolveSessionDeckId: (session) =>
      options.appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session) || defaultDeckId,
    sortSessionsByQuickId: (sessions) =>
      options.appSessionRuntimeFacadeController?.sortSessionsByQuickId?.(sessions) || [],
    getSelectedLayoutProfileId: () => layoutProfileRuntimeController?.getSelectedProfileId?.() || "",
    listLayoutProfiles: () => layoutProfileRuntimeController?.listProfiles?.() || [],
    applyLayoutProfileById: (profileId) => layoutProfileRuntimeController?.applyProfileById?.(profileId) || "",
    setActiveDeck: (deckId) => options.appLayoutDeckFacadeController?.setActiveDeck?.(deckId) === true,
    setControlPaneState: (nextState) => controlPaneRuntimeController?.setState?.(nextState),
    setCommandFeedback: (message) => options.appCommandUiFacadeController?.setCommandFeedback?.(message),
    setError: (message) => options.appCommandUiFacadeController?.setError?.(message),
    getErrorMessage: (error, fallback) =>
      options.appCommandUiFacadeController?.getErrorMessage?.(error, fallback) || fallback,
    requestRender: () => options.appCommandUiFacadeController?.render?.(),
    getDeckSplitLayouts: () => options.splitLayoutRuntimeController?.captureDeckSplitLayouts?.() || {},
    setDeckSplitLayouts: (nextLayouts) =>
      options.splitLayoutRuntimeController?.replaceDeckSplitLayouts?.(nextLayouts)
  });

  return {
    controlPaneRuntimeController,
    layoutProfileRuntimeController,
    connectionProfileRuntimeController,
    workspacePresetRuntimeController
  };
}
