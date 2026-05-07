import { createAppLayoutDeckFacadeController } from "./app-layout-deck-facade-controller.js";
import { createAppRuntimeAccessControlAssembly } from "./app-runtime-access-control-assembly.js";
import { collectAppRuntimeDomRefs } from "./app-runtime-dom-refs.js";
import { createAppRuntimeFoundation } from "./app-runtime-foundation.js";
import { createAppRuntimeOperatorControllerAssembly } from "./app-runtime-operator-controller-assembly.js";
import { createAppRuntimeOperatorSupportAssembly } from "./app-runtime-operator-support-assembly.js";
import { createAppRuntimeRecoveryComposition } from "./app-runtime-recovery-composition.js";
import { createAppRuntimeSessionSurfaceAssembly } from "./app-runtime-session-surface-assembly.js";
import { createAppRuntimeSessionGridActions } from "./app-runtime-session-grid-actions.js";
import { createAppRuntimeStartupComposition } from "./app-runtime-startup-composition.js";
import { createAppSessionRuntimeFacadeController } from "./app-session-runtime-facade-controller.js";
import { createBroadcastInputRuntimeController } from "./broadcast-input-runtime-controller.js";
import { createDeckRuntimeController } from "./deck-runtime-controller.js";
import { createTerminalCtrlCRuntimeController } from "./terminal-ctrl-c-runtime-controller.js";
import { createSessionRuntimeController } from "./session-runtime-controller.js";
import { createSessionViewModel } from "./session-view-model.js";
import { createSplitLayoutRuntimeController } from "./split-layout-runtime-controller.js";
import {
  getTerminalCellHeightPx,
  getTerminalCellWidthPx,
  isTerminalAtBottom,
  refreshTerminalViewport,
  syncTerminalScrollArea
} from "./terminal-compat.js";
import {
  normalizeCustomCommandPayloadForShell,
  sendInputWithConfiguredTerminator
} from "./terminal-stream.js";
import { createSessionStreamAuthorityController } from "./session-stream-authority-controller.js";
import { ITERM2_THEME_LIBRARY } from "./theme-library.js";
import { SYSTEM_SLASH_COMMANDS } from "./system-slash-commands.js";
import { createActionDialogController } from "./ui/action-dialog-controller.js";
import { createLayoutRuntimeController } from "./layout-runtime-controller.js";
import { createLayoutSettingsController } from "./ui/layout-settings-controller.js";
import { normalizeControlText } from "./session-control-runtime-state.js";
import { createSessionCardMetaController } from "./ui/session-card-meta-controller.js";
import { createSessionUiFacadeController } from "./ui/session-ui-facade-controller.js";

export { collectAppRuntimeDomRefs } from "./app-runtime-dom-refs.js";

export function createAppRuntimeCompositionController(options = {}) {
const {
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  createStartupBackupRuntimeController: createStartupBackupRuntimeControllerOption,
  createTrustedLocalClientRuntimeController: createTrustedLocalClientRuntimeControllerOption,
  testHooks = null
} = options;
const window = windowRef;
const document = documentRef;

const {
  appShellEl,
  stateEl,
  accessStateEl,
  gridEl,
  sidebarToggleBtn,
  sidebarToggleIcon,
  sidebarLauncherBtn,
  createBtn,
  deckTabsEl,
  deckCreateBtn,
  terminalSearchToggleBtn,
  terminalSearchToggleIcon,
  terminalSearchBodyEl,
  settingsColsEl,
  settingsRowsEl,
  settingsApplyBtn,
  settingsPanelToggleBtn,
  settingsPanelToggleIcon,
  settingsPanelBodyEl,
  layoutProfileSelectEl,
  layoutProfileSaveBtn,
  layoutProfileApplyBtn,
  layoutProfileRenameBtn,
  layoutProfileDeleteBtn,
  layoutProfileStatusEl,
  layoutProfileToggleBtn,
  layoutProfileToggleIcon,
  layoutProfileBodyEl,
  connectionProfileSelectEl,
  connectionProfileNewBtn,
  connectionProfileNewSshBtn,
  connectionProfileSaveBtn,
  connectionProfileSaveDraftBtn,
  connectionProfileSaveAndLaunchBtn,
  connectionProfileResetDraftBtn,
  connectionProfileApplyBtn,
  connectionProfileDuplicateBtn,
  connectionProfileRenameBtn,
  connectionProfileDeleteBtn,
  connectionProfileDeleteConfirmEl,
  connectionProfileDeleteConfirmMessageEl,
  connectionProfileDeleteConfirmBtn,
  connectionProfileDeleteCancelBtn,
  connectionProfileStatusEl,
  connectionProfileSummaryEl,
  connectionProfileDraftNameEl,
  connectionProfileKindEl,
  connectionProfileDeckEl,
  connectionProfileShellEl,
  connectionProfileStartCwdEl,
  connectionProfileStartCommandEl,
  connectionProfileEnvEl,
  connectionProfileTagsEl,
  connectionProfileActiveThemeEl,
  connectionProfileInactiveThemeEl,
  connectionProfileSshFieldsEl,
  connectionProfileRemoteHostEl,
  connectionProfileRemotePortEl,
  connectionProfileRemoteUsernameEl,
  connectionProfileRemoteAuthMethodEl,
  connectionProfileRemotePrivateKeyFieldEl,
  connectionProfileRemotePrivateKeyPathEl,
  connectionProfileAuthHintEl,
  connectionProfileSecretHintEl,
  connectionProfileRuntimeSecretFieldEl,
  connectionProfileRuntimeSecretEl,
  connectionProfileSshTrustStatusEl,
  connectionProfileSshTrustGuidanceEl,
  connectionProfileSshTrustProbeBtn,
  connectionProfileSshProbeSelectEl,
  connectionProfileSshTrustSelectEl,
  connectionProfileSshTrustKeyTypeEl,
  connectionProfileSshTrustFingerprintEl,
  connectionProfileSshTrustPublicKeyEl,
  connectionProfileSshTrustCompareEl,
  connectionProfileSshTrustCompareStatusEl,
  connectionProfileSshTrustCurrentKeyTypeEl,
  connectionProfileSshTrustCurrentFingerprintEl,
  connectionProfileSshTrustCandidateKeyTypeEl,
  connectionProfileSshTrustCandidateFingerprintEl,
  connectionProfileSshTrustRefreshBtn,
  connectionProfileSshTrustSaveBtn,
  connectionProfileSshTrustDeleteBtn,
  connectionProfileSshTrustReplaceBtn,
  connectionProfileDraftLaunchEl,
  connectionProfileDraftStatusEl,
  workspacePresetSelectEl,
  workspacePresetSaveBtn,
  workspacePresetApplyBtn,
  workspacePresetDuplicateBtn,
  workspacePresetRenameBtn,
  workspacePresetDeleteBtn,
  workspacePresetNameEl,
  workspacePresetDeleteConfirmEl,
  workspacePresetDeleteConfirmMessageEl,
  workspacePresetDeleteConfirmBtn,
  workspacePresetDeleteCancelBtn,
  workspacePresetGroupSelectEl,
  workspacePresetGroupSaveBtn,
  workspacePresetGroupApplyBtn,
  workspacePresetGroupRenameBtn,
  workspacePresetGroupDeleteBtn,
  workspacePresetGroupClearBtn,
  workspaceGroupNameEl,
  workspaceGroupDeleteConfirmEl,
  workspaceGroupDeleteConfirmMessageEl,
  workspaceGroupDeleteConfirmBtn,
  workspaceGroupDeleteCancelBtn,
  workspacePresetStatusEl,
  workspacePresetSummaryEl,
  workspacePresetDetailEl,
  workspaceGroupSummaryEl,
  workspaceGroupPersistenceEl,
  commandInput,
  sendBtn,
  template,
  emptyStateEl,
  statusMessageEl,
  commandTargetEl,
  commandFeedbackEl,
  commandFeedbackActionBtn,
  trustedLocalHandoffPromptEl,
  trustedLocalHandoffPromptMessageEl,
  trustedLocalHandoffPromptYesBtn,
  trustedLocalHandoffPromptNoBtn,
  trustedLocalControlOpenBtn,
  commandInlineHintEl,
  commandPreviewEl,
  commandSuggestionsEl,
  commandGuardEl,
  commandGuardSummaryEl,
  commandGuardReasonsEl,
  commandGuardPreviewEl,
  commandGuardSendOnceBtn,
  commandGuardCancelBtn,
  pasteObservationEl,
  pasteObservationSummaryEl,
  pasteObservationDetailEl,
  pasteObservationContinueBtn,
  workflowRuntimePanelEl,
  workflowStatusEl,
  workflowTargetEl,
  workflowProgressEl,
  workflowDetailEl,
  workflowResultEl,
  workflowStopBtn,
  workflowInterruptBtn,
  workflowKillBtn,
  replayViewerDialogEl,
  replayViewerTitleEl,
  replayViewerMetaEl,
  replayViewerStatusEl,
  replayViewerContentEl,
  replayViewerRefreshBtn,
  replayViewerDownloadBtn,
  replayViewerCopyBtn,
  replayViewerCloseBtn,
  terminalCtrlCDialogEl,
  terminalCtrlCMessageEl,
  terminalCtrlCCopyBtn,
  terminalCtrlCCancelBtn,
  commandPaletteDialogEl,
  commandPaletteMetaEl,
  commandPaletteInputEl,
  commandPaletteResultsEl,
  commandPaletteEmptyEl,
  commandPaletteCloseBtn,
  workspaceManagerOpenBtn,
  sendHistoryOpenBtn,
  sendHistoryDialogEl,
  sendHistoryCloseBtn,
  sendHistorySwitchSessionBtn,
  sendHistoryMetaEl,
  sendHistorySearchInputEl,
  sendHistoryDeleteSelectedBtn,
  sendHistoryClearSessionBtn,
  sendHistoryEmptyEl,
  sendHistoryListEl,
  sendHistoryDetailMetaEl,
  sendHistoryDetailTextEl,
  sendHistoryUseBtn,
  workspaceManagerDialogEl,
  workspaceManagerCloseBtn,
  workspaceManagerMetaEl,
  workspaceManagerConnectionsTabBtn,
  workspaceManagerWorkspaceTabBtn,
  workspaceManagerConnectionsPanelEl,
  workspaceManagerWorkspacePanelEl,
  actionDialogEl,
  actionDialogTitleEl,
  actionDialogMessageEl,
  actionDialogInputWrapEl,
  actionDialogInputLabelEl,
  actionDialogInputEl,
  actionDialogConfirmBtn,
  actionDialogCancelBtn,
  actionDialogCloseBtn,
  trustedLocalControlDialogEl,
  trustedLocalControlMetaEl,
  trustedLocalControlCloseBtn,
  trustedLocalControlTakeAllBtn,
  trustedLocalControlTakeDeckBtn,
  trustedLocalControlTakeSessionBtn,
  startupWarmupGateEl,
  startupWarmupMessageEl,
  startupWarmupDetailEl,
  startupWarmupSkipBtn,
  workspaceShellEl,
  controlPaneEl,
  controlPaneLauncherBtn,
  controlPaneToggleBtn,
  controlPanePositionSelectEl,
  controlPaneStatusEl,
  controlPaneResizeHandleEl,
  terminalSearchInputEl,
  terminalSearchPrevBtn,
  terminalSearchNextBtn,
  terminalSearchClearBtn,
  terminalSearchStatusEl
} = collectAppRuntimeDomRefs(document);
const terminalCtrlCRuntimeController = createTerminalCtrlCRuntimeController({
  dialogEl: terminalCtrlCDialogEl,
  messageEl: terminalCtrlCMessageEl,
  copyBtn: terminalCtrlCCopyBtn,
  cancelBtn: terminalCtrlCCancelBtn
});

const terminals = new Map();
const terminalObservers = new Map();
const resizeTimers = new Map();
const terminalSizes = new Map();
const sessionQuickIds = new Map();
const SETTINGS_STORAGE_KEY = "ptydeck.settings.v1";
const ACTIVE_DECK_STORAGE_KEY = "ptydeck.active-deck.v1";
const SESSION_INPUT_SETTINGS_STORAGE_KEY = "ptydeck.session-input-settings.v1";
const SESSION_FILTER_STORAGE_KEY = "ptydeck.session-filter.v1";
const TERMINAL_FONT_SIZE = 16;
const TERMINAL_LINE_HEIGHT = 1.2;
const TERMINAL_FONT_FAMILY = '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, monospace';
const TERMINAL_CARD_HORIZONTAL_CHROME_PX = 6;
const TERMINAL_MOUNT_VERTICAL_CHROME_PX = 18;
const QUICK_ID_POOL = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SEND_TERMINATOR_MODE_SET = new Set(["auto", "crlf", "lf", "cr", "cr2", "cr_delay"]);
const DELAYED_SUBMIT_MS = 90;
const WS_BOOTSTRAP_FALLBACK_MS = 250;
const SESSION_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SESSION_ENV_MAX_ENTRIES = 64;
const SESSION_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SESSION_TAG_MAX_ENTRIES = 32;
const SESSION_TAG_MAX_LENGTH = 32;
const DEFAULT_TERMINAL_COLS = 80;
const DEFAULT_TERMINAL_ROWS = 20;
const DEFAULT_DECK_ID = "default";
const SESSION_ACTIVITY_QUIET_MS = 1400;
const DEV_AUTH_REFRESH_SAFETY_MS = 60_000;
const DEV_AUTH_RETRY_DELAY_MS = 30_000;
const DEV_AUTH_REFRESH_MIN_DELAY_MS = 15_000;
const streamAdapter = createSessionStreamAuthorityController({
  idleMs: SESSION_ACTIVITY_QUIET_MS,
  recordTrace: (sessionId, eventType, payload) => streamDebugTraceController.record(sessionId, eventType, payload),
  appendTerminalChunk: (sessionId, chunk) => appSessionRuntimeFacadeController?.appendTerminalChunk(sessionId, chunk),
  clearSessionActivity: (sessionId) => store.clearSessionActivity(sessionId)
});
const DEFAULT_TERMINAL_THEME = {
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
const THEME_PROFILE_KEYS = [
  "background",
  "foreground",
  "cursor",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite"
];
const THEME_FILTER_CATEGORY_SET = new Set(["all", "dark", "light"]);
const DEFAULT_THEME_PRESET = {
  id: "ptydeck-default",
  name: "Ptydeck Default",
  category: "dark",
  profile: DEFAULT_TERMINAL_THEME
};
const TERMINAL_THEME_PRESETS = [
  DEFAULT_THEME_PRESET,
  ...ITERM2_THEME_LIBRARY.map((entry) => ({
    id: String(entry?.id || "").trim(),
    name: String(entry?.name || "").trim(),
    category: entry?.category === "light" ? "light" : "dark",
    profile: entry?.profile
  })).filter((entry) => entry.id && entry.name)
];
const TERMINAL_THEME_PRESET_MAP = new Map(TERMINAL_THEME_PRESETS.map((entry) => [entry.id, entry]));
const TERMINAL_THEME_MODE_SET = new Set(["custom", ...TERMINAL_THEME_PRESETS.map((entry) => entry.id)]);
let layoutRuntimeController = null;
let connectionProfileRuntimeController = null;
let terminalSettings = null;
let sessionInputSettings = {};
const sessionThemeDrafts = new Map();
const wsStateRef = { current: null };
let wsRuntimeController = null;
let authBootstrapRuntimeController = null;
let appLifecycleController = null;
let appLayoutDeckFacadeController = null;
let appRuntimeStateController = null;
let appSessionRuntimeFacadeController = null;
let appCommandUiFacadeController = null;
let sessionControlRuntimeController = null;
let deckRuntimeController = null;
let sessionViewModel = null;
let runtimeEventController = null;
let commandEngine = null;
let commandExecutor = null;
let commandComposerRuntimeController = null;
let commandComposerAutocompleteController = null;
let commandTargetRuntimeController = null;
let deckSidebarController = null;
let deckActionsController = null;
let sessionRuntimeController = null;
let sessionQuickSendRuntimeController = null;
let sessionDisposalController = null;
let sessionCardMetaController = null;
let sessionCardFactoryController = null;
let sessionGridController = null;
let sessionCardInteractionsController = null;
let sessionCardRenderController = null;
let sessionSettingsStateController = null;
let sessionUiFacadeController = null;
let sessionTerminalResizeController = null;
let sessionTerminalRuntimeController = null;
let actionDialogController = null;
let terminalSearchController = null;
let layoutSettingsController = null;
let sessionSettingsDialogController = null;
let workspaceRenderController = null;
let trustedLocalLayoutRuntimeController = null;
let trustedLocalHandoffRuntimeController = null;
let pasteObservationRuntimeController = null;
let replayViewerRuntimeController = null;
let commandPaletteRuntimeController = null;
let controlPaneRuntimeController = null;
let layoutProfileRuntimeController = null;
let workspacePresetRuntimeController = null;
let workspaceManagerRuntimeController = null;
let sendHistoryRuntimeController = null;
let broadcastInputRuntimeController = null;
let splitLayoutRuntimeController = null;
let slashWorkflowRuntimeController = null;
let appBootstrapCompositionController = null;
let appRuntimeInitializationController = null;
const {
  api,
  clipboardRuntimeController,
  commandDiscoveryUsageStore,
  config,
  debugLog,
  debugLogs,
  fileTransferRuntimeController,
  replayExportRuntimeController,
  startupBackupRuntimeController,
  store,
  streamDebugTraceController,
  streamInterpretationPluginEngine,
  traceDebugController,
  trustedLocalClientRuntimeController
} = createAppRuntimeFoundation({
  windowRef: window,
  documentRef: document,
  createStartupBackupRuntimeController: createStartupBackupRuntimeControllerOption,
  createTrustedLocalClientRuntimeController: createTrustedLocalClientRuntimeControllerOption,
  streamInterpretationPlugins: options.streamInterpretationPlugins,
  getAppRuntimeStateController: () => appRuntimeStateController,
  getAppSessionRuntimeFacadeController: () => appSessionRuntimeFacadeController
});
appSessionRuntimeFacadeController = createAppSessionRuntimeFacadeController({
  store,
  defaultDeckId: DEFAULT_DECK_ID,
  getSessionViewModel: () => sessionViewModel,
  getSessionRuntimeController: () => sessionRuntimeController,
  getAppLayoutDeckFacadeController: () => appLayoutDeckFacadeController,
  refreshTerminalViewport,
  syncTerminalScrollArea,
  windowRef: window
});
const uiState = {
  loading: true,
  error: "",
  accessMode: "operator",
  readOnlyMode: false,
  accessSummary: "",
  commandFeedback: "",
  commandFeedbackActionVisible: false,
  commandFeedbackActionLabel: "",
  commandFeedbackActionTitle: "",
  commandFeedbackActionSessionId: "",
  commandInlineHint: "",
  commandInlineHintPrefixPx: 0,
  commandPreview: "",
  commandSuggestions: "",
  commandGuardActive: false,
  commandGuardSummary: "",
  commandGuardReasons: "",
  commandGuardPreview: "",
  workflowStatus: "Workflow: ready.",
  workflowTarget: "Target: no workflow session.",
  workflowProgress: "Progress: 0/0.",
  workflowDetail: "Detail: no workflow running.",
  workflowResult: "",
  workflowCanStop: false,
  workflowCanInterrupt: false,
  workflowCanKill: false,
  commandSuggestionSelectedIndex: -1,
  startupGateActive: false,
  startupGatePhase: "",
  startupGateMessage: "",
  startupGateDetail: "",
  startupGateCanSkip: false
};

const terminalSearchState = {
  query: "",
  sessionId: "",
  selectedSessionId: "",
  matches: [],
  activeIndex: -1,
  revision: -1,
  wrapped: false,
  direction: "next",
  missingActiveSession: false
};
const nowMs =
  typeof window !== "undefined" &&
  window.performance &&
  typeof window.performance.now === "function"
    ? () => window.performance.now()
    : () => Date.now();
const startupPerf = {
  appStartAtMs: nowMs(),
  bootstrapRequestCount: 0,
  bootstrapReadyAtMs: null,
  firstNonEmptyRenderAtMs: null,
  firstTerminalMountedAtMs: null,
  startupReported: false
};
if (typeof window !== "undefined") {
  window.__PTYDECK_PERF__ = startupPerf;
}

const appRuntimeAccessControlAssembly = createAppRuntimeAccessControlAssembly({
  initializationAccessOptions: {
    windowRef: window,
    documentRef: document,
    config,
    uiState,
    startupPerf,
    nowMs,
    wsBootstrapFallbackMs: WS_BOOTSTRAP_FALLBACK_MS,
    debugLog,
    terminalSearchState,
    store,
    getAppRuntimeStateController: () => appRuntimeStateController,
    getAppCommandUiFacadeController: () => appCommandUiFacadeController,
    getAuthBootstrapRuntimeController: () => authBootstrapRuntimeController,
    getTerminalSearchController: () => terminalSearchController,
    getCommandComposerAutocompleteController: () => commandComposerAutocompleteController,
    getCommandComposerRuntimeController: () => commandComposerRuntimeController,
    getCommandTargetRuntimeController: () => commandTargetRuntimeController,
    getSessionGridController: () => sessionGridController,
    getConnectionProfileRuntimeController: () => connectionProfileRuntimeController,
    getControlPaneRuntimeController: () => controlPaneRuntimeController,
    getWorkspacePresetRuntimeController: () => workspacePresetRuntimeController,
    getWorkspaceManagerRuntimeController: () => workspaceManagerRuntimeController,
    getSendHistoryRuntimeController: () => sendHistoryRuntimeController,
    getTrustedLocalHandoffRuntimeController: () => trustedLocalHandoffRuntimeController,
    getPasteObservationRuntimeController: () => pasteObservationRuntimeController,
    getCommandExecutor: () => commandExecutor,
    api,
    getSessions: () => {
      const state = store?.getState?.() || {};
      return Array.isArray(state.sessions) ? state.sessions : [];
    },
    getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById?.(sessionId) || null,
    formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
    formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
    takeSessionControlScope: (scope, runtimeOptions) =>
      trustedLocalHandoffRuntimeController?.takeControlScope?.(scope, runtimeOptions),
    renameTrustedLocalClientIdentity: (label) => trustedLocalClientRuntimeController.renameClientIdentity(label),
    retryBlockedAction: (retryAction) => commandComposerRuntimeController?.retryBlockedAction?.(retryAction),
    applyResizeForSession: (sessionId, runtimeOptions) =>
      sessionTerminalResizeController?.applyResizeForSession?.(sessionId, runtimeOptions),
    showControlPane: () => controlPaneRuntimeController?.show?.(),
    listCustomCommands: () => appCommandUiFacadeController?.listCustomCommands?.() || [],
    resolveDeckForSession: (session) => {
      const deckId = appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session) || DEFAULT_DECK_ID;
      const deck = store.getState().decks.find((entry) => entry.id === deckId) || null;
      return {
        id: deck?.id || deckId,
        name: deck?.name || deckId || "Default"
      };
    },
    canReadClipboardText: () => clipboardRuntimeController.canReadText(),
    readClipboardText: () => clipboardRuntimeController.readText(),
    submitTerminalPaste: (sessionId, text, runtimeOptions) =>
      commandComposerRuntimeController?.submitProgrammaticPaste?.(sessionId, text, runtimeOptions) ||
      Promise.resolve({ ok: false, status: "unavailable", feedback: "Clipboard send is unavailable." }),
    apiSendInput: (sessionId, data, requestOptions) => api.sendInput(sessionId, data, requestOptions),
    sendInputWithConfiguredTerminator,
    normalizeCustomCommandPayloadForShell,
    normalizeSendTerminatorMode: (value) => appLayoutDeckFacadeController?.normalizeSendTerminatorMode?.(value) || "auto",
    getSessionSendTerminator: (sessionId) => appLayoutDeckFacadeController?.getSessionSendTerminator?.(sessionId) || "auto",
    delayedSubmitMs: DELAYED_SUBMIT_MS,
    recordCommandSubmission: (sessionId, submission) => store.recordSessionCommandSubmission(sessionId, submission),
    isSessionActionBlocked: (session) => sessionUiFacadeController?.isSessionActionBlocked?.(session) === true,
    getBlockedSessionActionMessage: (sessions, actionLabel) =>
      sessionUiFacadeController?.getBlockedSessionActionMessage?.(sessions, actionLabel) || "",
    defaultDeckId: DEFAULT_DECK_ID
  },
  testHooks,
  uiState,
  api,
  store,
  streamAdapter,
  getInitializationErrorMessage: () => appRuntimeInitializationController?.getInitializationErrorMessage?.() || "",
  getTrustedLocalHandoffRuntimeController: () => trustedLocalHandoffRuntimeController,
  getOriginHandoffSourceOrigin: () => sessionControlRuntimeController.getOriginHandoffSourceOrigin(),
  setOriginHandoffSourceOrigin: (origin) => sessionControlRuntimeController.setOriginHandoffSourceOrigin(origin),
  setRuntimeClientIdentityCreatedOnThisOrigin: (value) =>
    sessionControlRuntimeController.setRuntimeClientIdentityCreatedOnThisOrigin(value),
  normalizeCommandFeedbackActionSessionId: normalizeControlText,
  collaboratorSetters: {
    appSessionRuntimeFacadeController: (value) => {
      appSessionRuntimeFacadeController = value;
    },
    appRuntimeStateController: (value) => {
      appRuntimeStateController = value;
    },
    appCommandUiFacadeController: (value) => {
      appCommandUiFacadeController = value;
    },
    trustedLocalHandoffRuntimeController: (value) => {
      trustedLocalHandoffRuntimeController = value;
    },
    commandComposerRuntimeController: (value) => {
      commandComposerRuntimeController = value;
    },
    sessionTerminalResizeController: (value) => {
      sessionTerminalResizeController = value;
    },
    controlPaneRuntimeController: (value) => {
      controlPaneRuntimeController = value;
    }
  }
});
appRuntimeStateController = appRuntimeAccessControlAssembly.appRuntimeStateController;
appCommandUiFacadeController = appRuntimeAccessControlAssembly.appCommandUiFacadeController;
sessionControlRuntimeController = appRuntimeAccessControlAssembly.sessionControlRuntimeController;
sessionQuickSendRuntimeController = appRuntimeAccessControlAssembly.sessionQuickSendRuntimeController;
const setAccessState = appRuntimeAccessControlAssembly.setAccessState;
const isReadOnlyMode = appRuntimeAccessControlAssembly.isReadOnlyMode;
const getReadOnlyModeMessage = appRuntimeAccessControlAssembly.getReadOnlyModeMessage;
const canWriteToSession = appRuntimeAccessControlAssembly.canWriteToSession;
const getSessionWriteBlockMessage = appRuntimeAccessControlAssembly.getSessionWriteBlockMessage;
const canTakeSessionControl = appRuntimeAccessControlAssembly.canTakeSessionControl;
const setRuntimeClientId = appRuntimeAccessControlAssembly.setRuntimeClientId;
const getRuntimeClientId = appRuntimeAccessControlAssembly.getRuntimeClientId;
const renameTrustedLocalDevice = appRuntimeAccessControlAssembly.renameTrustedLocalDevice;
const showBlockedWriteReclaimUi = appRuntimeAccessControlAssembly.showBlockedWriteReclaimUi;
const renderSessionControl = appRuntimeAccessControlAssembly.renderSessionControl;
const maybeRedirectToCanonicalOrigin = appRuntimeAccessControlAssembly.maybeRedirectToCanonicalOrigin;
const maybeAutoRepairOriginHandoffControl =
  appRuntimeAccessControlAssembly.maybeAutoRepairOriginHandoffControl;
const handleCommandFeedbackAction = appRuntimeAccessControlAssembly.handleCommandFeedbackAction;

layoutRuntimeController = createLayoutRuntimeController({
  windowRef: window,
  settingsStorageKey: SETTINGS_STORAGE_KEY,
  sessionInputSettingsStorageKey: SESSION_INPUT_SETTINGS_STORAGE_KEY,
  sessionFilterStorageKey: SESSION_FILTER_STORAGE_KEY,
  defaultTerminalCols: DEFAULT_TERMINAL_COLS,
  defaultTerminalRows: DEFAULT_TERMINAL_ROWS,
  sendTerminatorModeSet: SEND_TERMINATOR_MODE_SET,
  cardHorizontalChromePx: TERMINAL_CARD_HORIZONTAL_CHROME_PX,
  getLayoutSettingsController: () => layoutSettingsController,
  getTerminalSettings: () => terminalSettings,
  setTerminalSettings: (nextSettings) => {
    terminalSettings = nextSettings;
  },
  getSessionInputSettings: () => sessionInputSettings,
  setSessionInputSettings: (nextSettings) => {
    sessionInputSettings = nextSettings;
  },
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck() || null,
  api,
  applyRuntimeEvent: (event, options) => appSessionRuntimeFacadeController?.applyRuntimeEvent(event, options) === true,
  applySettingsToAllTerminals: (options) => appLayoutDeckFacadeController?.applySettingsToAllTerminals(options),
  scheduleGlobalResize: (options) => appLayoutDeckFacadeController?.scheduleGlobalResize(options),
  render: () => appCommandUiFacadeController?.render(),
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback(message),
  setError: (message) => appCommandUiFacadeController?.setError(message),
  getErrorMessage: (err, fallback) => appCommandUiFacadeController?.getErrorMessage(err, fallback) || fallback,
  settingsApplyBtn,
  settingsColsEl,
  settingsRowsEl,
  sidebarToggleBtn,
  sidebarLauncherBtn,
  terminalSearchToggleBtn,
  settingsPanelToggleBtn,
  layoutProfileToggleBtn
});
terminalSettings = layoutRuntimeController.loadTerminalSettings();
sessionInputSettings = layoutRuntimeController.loadSessionInputSettings();

deckRuntimeController = createDeckRuntimeController({
  store,
  windowRef: window,
  activeDeckStorageKey: ACTIVE_DECK_STORAGE_KEY,
  defaultDeckId: DEFAULT_DECK_ID,
  defaultTerminalCols: DEFAULT_TERMINAL_COLS,
  defaultTerminalRows: DEFAULT_TERMINAL_ROWS,
  clampInt: (value, fallback, min, max) => appLayoutDeckFacadeController?.clampInt(value, fallback, min, max) ?? fallback,
  getTerminalSettings: () => terminalSettings,
  setTerminalSettings: (nextSettings) => {
    terminalSettings = nextSettings;
  },
  persistTerminalSettings: () => appLayoutDeckFacadeController?.saveTerminalSettings(),
  syncSettingsUi: () => appLayoutDeckFacadeController?.syncSettingsUi(),
  applySettingsToAllTerminals: (options) => appLayoutDeckFacadeController?.applySettingsToAllTerminals(options),
  scheduleGlobalResize: (options) => appLayoutDeckFacadeController?.scheduleGlobalResize(options),
  scheduleDeferredResizePasses: (options) => appLayoutDeckFacadeController?.scheduleDeferredResizePasses(options),
  getDeckSidebarController: () => deckSidebarController,
  resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId(session),
  getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById(sessionId)
});

appLayoutDeckFacadeController = createAppLayoutDeckFacadeController({
  store,
  getLayoutRuntimeController: () => layoutRuntimeController,
  getDeckRuntimeController: () => deckRuntimeController,
  getSessionTerminalResizeController: () => sessionTerminalResizeController,
  getSessionSettingsDialogController: () => sessionSettingsDialogController,
  getDeckActionsController: () => deckActionsController,
  getTerminalSettings: () => terminalSettings,
  defaultTerminalCols: DEFAULT_TERMINAL_COLS,
  defaultTerminalRows: DEFAULT_TERMINAL_ROWS,
  terminalFontSize: TERMINAL_FONT_SIZE,
  terminalLineHeight: TERMINAL_LINE_HEIGHT,
  clearUiError: () => appRuntimeStateController?.clearError()
});

({
  controlPaneRuntimeController,
  layoutProfileRuntimeController,
  connectionProfileRuntimeController,
  workspacePresetRuntimeController
} = createAppRuntimeOperatorControllerAssembly({
  windowRef: window,
  documentRef: document,
  store,
  api,
  workspaceShellEl,
  controlPaneEl,
  controlPaneLauncherBtn,
  controlPaneToggleBtn,
  controlPanePositionSelectEl,
  controlPaneStatusEl,
  controlPaneResizeHandleEl,
  layoutProfileSelectEl,
  layoutProfileSaveBtn,
  layoutProfileApplyBtn,
  layoutProfileRenameBtn,
  layoutProfileDeleteBtn,
  layoutProfileStatusEl,
  connectionProfileSelectEl,
  connectionProfileNewBtn,
  connectionProfileNewSshBtn,
  connectionProfileSaveBtn,
  connectionProfileSaveDraftBtn,
  connectionProfileSaveAndLaunchBtn,
  connectionProfileResetDraftBtn,
  connectionProfileApplyBtn,
  connectionProfileDuplicateBtn,
  connectionProfileRenameBtn,
  connectionProfileDeleteBtn,
  connectionProfileDeleteConfirmEl,
  connectionProfileDeleteConfirmMessageEl,
  connectionProfileDeleteConfirmBtn,
  connectionProfileDeleteCancelBtn,
  connectionProfileStatusEl,
  connectionProfileSummaryEl,
  connectionProfileDraftNameEl,
  connectionProfileKindEl,
  connectionProfileDeckEl,
  connectionProfileShellEl,
  connectionProfileStartCwdEl,
  connectionProfileStartCommandEl,
  connectionProfileEnvEl,
  connectionProfileTagsEl,
  connectionProfileActiveThemeEl,
  connectionProfileInactiveThemeEl,
  connectionProfileSshFieldsEl,
  connectionProfileRemoteHostEl,
  connectionProfileRemotePortEl,
  connectionProfileRemoteUsernameEl,
  connectionProfileRemoteAuthMethodEl,
  connectionProfileRemotePrivateKeyFieldEl,
  connectionProfileRemotePrivateKeyPathEl,
  connectionProfileAuthHintEl,
  connectionProfileSecretHintEl,
  connectionProfileRuntimeSecretFieldEl,
  connectionProfileRuntimeSecretEl,
  connectionProfileSshTrustStatusEl,
  connectionProfileSshTrustGuidanceEl,
  connectionProfileSshTrustProbeBtn,
  connectionProfileSshProbeSelectEl,
  connectionProfileSshTrustSelectEl,
  connectionProfileSshTrustKeyTypeEl,
  connectionProfileSshTrustFingerprintEl,
  connectionProfileSshTrustPublicKeyEl,
  connectionProfileSshTrustCompareEl,
  connectionProfileSshTrustCompareStatusEl,
  connectionProfileSshTrustCurrentKeyTypeEl,
  connectionProfileSshTrustCurrentFingerprintEl,
  connectionProfileSshTrustCandidateKeyTypeEl,
  connectionProfileSshTrustCandidateFingerprintEl,
  connectionProfileSshTrustRefreshBtn,
  connectionProfileSshTrustSaveBtn,
  connectionProfileSshTrustDeleteBtn,
  connectionProfileSshTrustReplaceBtn,
  connectionProfileDraftLaunchEl,
  connectionProfileDraftStatusEl,
  workspacePresetSelectEl,
  workspacePresetSaveBtn,
  workspacePresetApplyBtn,
  workspacePresetDuplicateBtn,
  workspacePresetRenameBtn,
  workspacePresetDeleteBtn,
  workspacePresetNameEl,
  workspacePresetDeleteConfirmEl,
  workspacePresetDeleteConfirmMessageEl,
  workspacePresetDeleteConfirmBtn,
  workspacePresetDeleteCancelBtn,
  workspacePresetGroupSelectEl,
  workspacePresetGroupSaveBtn,
  workspacePresetGroupApplyBtn,
  workspacePresetGroupRenameBtn,
  workspacePresetGroupDeleteBtn,
  workspacePresetGroupClearBtn,
  workspaceGroupNameEl,
  workspaceGroupDeleteConfirmEl,
  workspaceGroupDeleteConfirmMessageEl,
  workspaceGroupDeleteConfirmBtn,
  workspaceGroupDeleteCancelBtn,
  workspacePresetStatusEl,
  workspacePresetSummaryEl,
  workspacePresetDetailEl,
  workspaceGroupSummaryEl,
  workspaceGroupPersistenceEl,
  appLayoutDeckFacadeController,
  appSessionRuntimeFacadeController,
  appCommandUiFacadeController,
  actionDialogController,
  sessionUiFacadeController,
  splitLayoutRuntimeController,
  commandTargetRuntimeController,
  getTerminalSettings: () => terminalSettings,
  terminalThemePresets: TERMINAL_THEME_PRESETS,
  defaultTerminalTheme: DEFAULT_TERMINAL_THEME,
  defaultTerminalCols: DEFAULT_TERMINAL_COLS,
  defaultTerminalRows: DEFAULT_TERMINAL_ROWS,
  defaultDeckId: DEFAULT_DECK_ID
}));

({
  workspaceManagerRuntimeController,
  sendHistoryRuntimeController,
  trustedLocalLayoutRuntimeController,
  trustedLocalHandoffRuntimeController,
  pasteObservationRuntimeController,
  broadcastInputRuntimeController
} = createAppRuntimeOperatorSupportAssembly({
  windowRef: window,
  documentRef: document,
  localStorageRef: window?.localStorage || null,
  store,
  commandInput,
  dialogEl: workspaceManagerDialogEl,
  openBtn: workspaceManagerOpenBtn,
  closeBtn: workspaceManagerCloseBtn,
  metaEl: workspaceManagerMetaEl,
  connectionsTabBtn: workspaceManagerConnectionsTabBtn,
  workspaceTabBtn: workspaceManagerWorkspaceTabBtn,
  connectionsPanelEl: workspaceManagerConnectionsPanelEl,
  workspacePanelEl: workspaceManagerWorkspacePanelEl,
  connectionSelectEl: connectionProfileSelectEl,
  workspacePresetSelectEl,
  workspaceGroupSelectEl: workspacePresetGroupSelectEl,
  connectionSummaryEl: connectionProfileSummaryEl,
  workspacePresetSummaryEl,
  workspaceGroupSummaryEl,
  getConnectionProfileRuntimeController: () => connectionProfileRuntimeController,
  getWorkspacePresetRuntimeController: () => workspacePresetRuntimeController,
  sendHistoryDialogEl,
  sendHistoryOpenBtn,
  sendHistoryCloseBtn,
  sendHistorySwitchSessionBtn,
  sendHistoryMetaEl,
  sendHistorySearchInputEl,
  sendHistoryDeleteSelectedBtn,
  sendHistoryClearSessionBtn,
  sendHistoryEmptyEl,
  sendHistoryListEl,
  sendHistoryDetailMetaEl,
  sendHistoryDetailTextEl,
  sendHistoryUseBtn,
  formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
  formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
  confirmAction: (options) => actionDialogController?.confirm(options),
  scheduleCommandPreview: () => appCommandUiFacadeController?.scheduleCommandPreview?.(),
  scheduleCommandSuggestions: () => appCommandUiFacadeController?.scheduleCommandSuggestions?.(),
  requestRender: () => appCommandUiFacadeController?.render?.(),
  captureCurrentLayout: () => layoutProfileRuntimeController?.captureCurrentLayout?.() || {},
  applyLayoutSnapshot: (layout, runtimeOptions) =>
    layoutProfileRuntimeController?.applyLayoutSnapshot?.(layout, runtimeOptions) || "",
  promptEl: trustedLocalHandoffPromptEl,
  promptMessageEl: trustedLocalHandoffPromptMessageEl,
  promptYesBtn: trustedLocalHandoffPromptYesBtn,
  promptNoBtn: trustedLocalHandoffPromptNoBtn,
  trustedLocalControlOpenBtn,
  trustedLocalControlDialogEl,
  trustedLocalControlMetaEl,
  trustedLocalControlCloseBtn,
  trustedLocalControlTakeAllBtn,
  trustedLocalControlTakeDeckBtn,
  trustedLocalControlTakeSessionBtn,
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck?.() || null,
  getActiveDeckId: () => store?.getState?.().activeDeckId || DEFAULT_DECK_ID,
  getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById?.(sessionId) || null,
  resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session) || DEFAULT_DECK_ID,
  resolveDeckName: (deckId) => appLayoutDeckFacadeController?.resolveDeckName?.(deckId) || deckId,
  canTakeSessionControl,
  isReadOnlyMode,
  getRuntimeClientId,
  takeSessionControl: (sessionId) => api.takeSessionControl(sessionId),
  takeSessionControlScope: (payload) => api.takeSessionControlScope(payload),
  applyRuntimeEvent: (event, runtimeOptions) =>
    appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
  setError: (message) => appCommandUiFacadeController?.setError?.(message),
  getErrorMessage: (error, fallback) => appCommandUiFacadeController?.getErrorMessage?.(error, fallback) || fallback,
  pasteObservationEl,
  pasteObservationSummaryEl,
  pasteObservationDetailEl,
  pasteObservationContinueBtn,
  requestContinuePaste: (sessionId, runtimeOptions) =>
    commandComposerRuntimeController?.continueObservedPaste?.(sessionId, runtimeOptions),
  showCommandUi: () => controlPaneRuntimeController?.show?.(),
  getSessions: () => store.getState().sessions || [],
  sortSessionsByQuickId: (sessions) => appSessionRuntimeFacadeController?.sortSessionsByQuickId?.(sessions) || [],
  listGroupsForDeck: (deckId) => workspacePresetRuntimeController?.listGroupsForDeck?.(deckId) || [],
  getActiveGroupIdForDeck: (deckId) => workspacePresetRuntimeController?.getActiveGroupIdForDeck?.(deckId) || "",
  applyGroupLocally: (groupId, deckId) => workspacePresetRuntimeController?.applyGroupLocally?.(groupId, deckId) || null,
  defaultDeckId: DEFAULT_DECK_ID
}));

if (typeof window.Terminal !== "function") {
  appRuntimeStateController.setError("Terminal library failed to load.");
  throw new Error("window.Terminal is not available.");
}

sessionViewModel = createSessionViewModel({
  defaultDeckId: DEFAULT_DECK_ID,
  sessionTagPattern: SESSION_TAG_PATTERN,
  sessionTagMaxEntries: SESSION_TAG_MAX_ENTRIES,
  sessionTagMaxLength: SESSION_TAG_MAX_LENGTH,
  sessionEnvKeyPattern: SESSION_ENV_KEY_PATTERN,
  sessionEnvMaxEntries: SESSION_ENV_MAX_ENTRIES,
  formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken(sessionId) || "?"
});

sessionUiFacadeController = createSessionUiFacadeController({
  getSessionViewModel: () => sessionViewModel,
  getSessionSettingsStateController: () => sessionSettingsStateController,
  getSessionCardMetaController: () => sessionCardMetaController,
  themeProfileKeys: THEME_PROFILE_KEYS,
  defaultTerminalTheme: DEFAULT_TERMINAL_THEME
});

sessionRuntimeController = createSessionRuntimeController({
  store,
  terminals,
  sessionQuickIds,
  quickIdPool: QUICK_ID_POOL,
  terminalSearchState,
  refreshTerminalViewport,
  syncTerminalScrollArea,
  markSessionActivity: (sessionId) => appSessionRuntimeFacadeController?.markSessionActivity(sessionId),
  syncActiveTerminalSearch: (options) => appCommandUiFacadeController?.syncActiveTerminalSearch(options),
  applyResizeForSession: (sessionId, options) => appLayoutDeckFacadeController?.applyResizeForSession(sessionId, options),
  getActiveSessionId: () => store.getState().activeSessionId,
  getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById(sessionId),
  streamAdapter,
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback(message),
  getExitedSessionMessage: sessionUiFacadeController.getExitedSessionMessage,
  getRuntimeEventController: () => runtimeEventController,
  getSessionViewModel: () => sessionViewModel,
  windowRef: window
});

({
  runtimeEventController
} = createAppRuntimeRecoveryComposition({
  defaultDeckId: DEFAULT_DECK_ID,
  store,
  traceDebugController,
  debugLog,
  maybeAutoRepairOriginHandoffControl,
  getPreferredActiveDeckId: () => store.getState().activeDeckId,
  setDecks: (nextDecks, options) => appLayoutDeckFacadeController?.setDecks(nextDecks, options),
  replaceCustomCommandState: (commands) => appCommandUiFacadeController?.replaceCustomCommands(commands),
  setSessions: (sessions) => {
    store.setSessions(sessions);
  },
  replaySnapshotOutputs: (outputs, attempt) => appSessionRuntimeFacadeController?.replaySnapshotOutputs(outputs, attempt),
  scheduleSnapshotTerminalStabilization: (sessionIds) =>
    appSessionRuntimeFacadeController?.scheduleSnapshotTerminalStabilization(sessionIds),
  scheduleCommandPreview: () => appCommandUiFacadeController?.scheduleCommandPreview(),
  scheduleCommandSuggestions: () => appCommandUiFacadeController?.scheduleCommandSuggestions(),
  clearError: () => appRuntimeStateController?.clearError(),
  markRuntimeBootstrapReady: (source) => appCommandUiFacadeController?.markRuntimeBootstrapReady(source),
  setRuntimeClientId,
  applySessionInterpretationActions: (sessionId, actions) => store.applySessionInterpretationActions(sessionId, actions),
  upsertSession: (nextSession) => {
    appSessionRuntimeFacadeController?.upsertSession(nextSession);
  },
  markSessionExited: (sessionId, exitDetails) => appSessionRuntimeFacadeController?.markSessionExited(sessionId, exitDetails),
  markSessionClosed: (sessionId) => appSessionRuntimeFacadeController?.markSessionClosed(sessionId),
  upsertDeckInState: (nextDeck, options) => appLayoutDeckFacadeController?.upsertDeckInState(nextDeck, options),
  removeDeckFromState: (deckId, options) => appLayoutDeckFacadeController?.removeDeckFromState(deckId, options),
  upsertCustomCommandState: (command) => appCommandUiFacadeController?.upsertCustomCommand(command),
  removeCustomCommandState: (name) => appCommandUiFacadeController?.removeCustomCommand(name),
  getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById(sessionId),
  setActiveSession: (sessionId) => store.setActiveSession(sessionId),
  isSessionUnrestored: sessionUiFacadeController.isSessionUnrestored,
  getUnrestoredSessionMessage: sessionUiFacadeController.getUnrestoredSessionMessage,
  isSessionExited: sessionUiFacadeController.isSessionExited,
  getExitedSessionMessage: sessionUiFacadeController.getExitedSessionMessage,
  canWriteToSession,
  getSessionWriteBlockedMessage: getSessionWriteBlockMessage,
  showBlockedWriteReclaimUi,
  isReadOnlyMode,
  getReadOnlyModeMessage,
  getErrorMessage: (error, fallback) => appCommandUiFacadeController?.getErrorMessage(error, fallback) || fallback,
  setError: (message) => appCommandUiFacadeController?.setError(message),
  sendInput: (sessionId, data, requestOptions) => api.sendInput(sessionId, data, requestOptions)
}));

sessionCardMetaController = createSessionCardMetaController({
  normalizeSessionTags: sessionUiFacadeController.normalizeSessionTags,
  getSessionAppIdentityText: sessionUiFacadeController.getSessionAppIdentityText,
  getSessionAppIdentityTitle: sessionUiFacadeController.getSessionAppIdentityTitle
});

splitLayoutRuntimeController = createSplitLayoutRuntimeController({
  windowRef: window,
  documentRef: document,
  gridEl,
  defaultDeckId: DEFAULT_DECK_ID,
  requestRender: () => appCommandUiFacadeController?.render?.(),
  scheduleGlobalResize: (options) => appLayoutDeckFacadeController?.scheduleGlobalResize(options),
  scheduleDeferredResizePasses: (options) => appLayoutDeckFacadeController?.scheduleDeferredResizePasses(options),
  setActiveSession: (sessionId) => store.setActiveSession(sessionId),
  formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
  formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
  sortSessionsByQuickId: (sessions) => appSessionRuntimeFacadeController?.sortSessionsByQuickId?.(sessions) || []
});

layoutSettingsController = createLayoutSettingsController({
  documentRef: document,
  gridEl,
  appShellEl,
  sidebarToggleBtn,
  sidebarToggleIcon,
  sidebarLauncherBtn,
  terminalSearchToggleBtn,
  terminalSearchToggleIcon,
  terminalSearchBodyEl,
  settingsColsEl,
  settingsRowsEl,
  settingsPanelToggleBtn,
  settingsPanelToggleIcon,
  settingsPanelBodyEl,
  layoutProfileToggleBtn,
  layoutProfileToggleIcon,
  layoutProfileBodyEl,
  terminalFontSize: TERMINAL_FONT_SIZE,
  terminalLineHeight: TERMINAL_LINE_HEIGHT,
  terminalFontFamily: TERMINAL_FONT_FAMILY,
  cardHorizontalChromePx: TERMINAL_CARD_HORIZONTAL_CHROME_PX,
  mountVerticalChromePx: TERMINAL_MOUNT_VERTICAL_CHROME_PX
});

actionDialogController = createActionDialogController({
  windowRef: window,
  dialogEl: actionDialogEl,
  titleEl: actionDialogTitleEl,
  messageEl: actionDialogMessageEl,
  inputWrapEl: actionDialogInputWrapEl,
  inputLabelEl: actionDialogInputLabelEl,
  inputEl: actionDialogInputEl,
  confirmBtn: actionDialogConfirmBtn,
  cancelBtn: actionDialogCancelBtn,
  closeBtn: actionDialogCloseBtn
});

const appRuntimeSessionGridActions = createAppRuntimeSessionGridActions({
  api,
  defaultDeckId: DEFAULT_DECK_ID,
  getAppLayoutDeckFacadeController: () => appLayoutDeckFacadeController,
  getAppSessionRuntimeFacadeController: () => appSessionRuntimeFacadeController,
  getAppRuntimeStateController: () => appRuntimeStateController,
  getAppCommandUiFacadeController: () => appCommandUiFacadeController,
  getTrustedLocalHandoffRuntimeController: () => trustedLocalHandoffRuntimeController,
  requestText: (runtimeOptions) => actionDialogController?.requestText(runtimeOptions),
  confirmAction: (runtimeOptions) => actionDialogController?.confirm(runtimeOptions),
  renameTrustedLocalDevice: (sessionId, label) => renameTrustedLocalDevice(sessionId, label)
});

({
  sessionDisposalController,
  sessionCardFactoryController,
  sessionSettingsStateController,
  sessionCardInteractionsController,
  sessionCardRenderController,
  sessionTerminalResizeController,
  sessionTerminalRuntimeController,
  sessionSettingsDialogController,
  workspaceRenderController,
  replayViewerRuntimeController,
  terminalSearchController,
  deckActionsController,
  deckSidebarController,
  sessionGridController
} = createAppRuntimeSessionSurfaceAssembly({
  windowRef: window,
  documentRef: document,
  store,
  api,
  terminals,
  terminalObservers,
  resizeTimers,
  terminalSizes,
  sessionThemeDrafts,
  template,
  gridEl,
  deckTabsEl,
  stateEl,
  accessStateEl,
  emptyStateEl,
  statusMessageEl,
  commandTargetEl,
  commandFeedbackEl,
  commandFeedbackActionBtn,
  commandInlineHintEl,
  commandPreviewEl,
  commandSuggestionsEl,
  commandGuardEl,
  commandGuardSummaryEl,
  commandGuardReasonsEl,
  commandGuardPreviewEl,
  workflowPanelEl: workflowRuntimePanelEl,
  workflowStatusEl,
  workflowTargetEl,
  workflowProgressEl,
  workflowDetailEl,
  workflowResultEl,
  workflowStopBtn,
  workflowInterruptBtn,
  workflowKillBtn,
  createBtn,
  deckCreateBtn,
  commandInput,
  sendBtn,
  startupWarmupGateEl,
  startupWarmupMessageEl,
  startupWarmupDetailEl,
  startupWarmupSkipBtn,
  replayViewerDialogEl,
  replayViewerTitleEl,
  replayViewerMetaEl,
  replayViewerStatusEl,
  replayViewerContentEl,
  replayViewerRefreshBtn,
  replayViewerDownloadBtn,
  replayViewerCopyBtn,
  replayViewerCloseBtn,
  terminalSearchState,
  terminalSearchInputEl,
  terminalSearchPrevBtn,
  terminalSearchNextBtn,
  terminalSearchClearBtn,
  terminalSearchStatusEl,
  themeProfileKeys: THEME_PROFILE_KEYS,
  defaultTerminalTheme: DEFAULT_TERMINAL_THEME,
  themeFilterCategorySet: THEME_FILTER_CATEGORY_SET,
  terminalThemePresetMap: TERMINAL_THEME_PRESET_MAP,
  terminalThemePresets: TERMINAL_THEME_PRESETS,
  terminalThemeModeSet: TERMINAL_THEME_MODE_SET,
  terminalFontSize: TERMINAL_FONT_SIZE,
  terminalLineHeight: TERMINAL_LINE_HEIGHT,
  terminalFontFamily: TERMINAL_FONT_FAMILY,
  terminalCardHorizontalChromePx: TERMINAL_CARD_HORIZONTAL_CHROME_PX,
  terminalMountVerticalChromePx: TERMINAL_MOUNT_VERTICAL_CHROME_PX,
  defaultDeckId: DEFAULT_DECK_ID,
  appLayoutDeckFacadeController,
  appSessionRuntimeFacadeController,
  appCommandUiFacadeController,
  appRuntimeStateController,
  sessionUiFacadeController,
  sessionQuickSendRuntimeController,
  actionDialogController,
  appRuntimeSessionGridActions,
  clipboardRuntimeController,
  replayExportRuntimeController,
  terminalCtrlCRuntimeController,
  workspacePresetRuntimeController,
  getCommandTargetRuntimeController: () => commandTargetRuntimeController,
  getCommandComposerRuntimeController: () => commandComposerRuntimeController,
  splitLayoutRuntimeController,
  renderSessionControl,
  canWriteToSession,
  getSessionWriteBlockedMessage: getSessionWriteBlockMessage,
  showBlockedWriteReclaimUi,
  isReadOnlyMode,
  getReadOnlyModeMessage,
  getTerminalCellHeightPx,
  getTerminalCellWidthPx,
  isTerminalAtBottom,
  refreshTerminalViewport,
  syncTerminalScrollArea,
  getTerminalSettings: () => terminalSettings,
  debugLog
}));
({
  appBootstrapCompositionController,
  commandEngine,
  commandTargetRuntimeController,
  commandExecutor,
  authBootstrapRuntimeController,
  wsRuntimeController,
  commandComposerAutocompleteController,
  commandComposerRuntimeController,
  appLifecycleController,
  slashWorkflowRuntimeController,
  commandPaletteRuntimeController,
  appRuntimeInitializationController
} = createAppRuntimeStartupComposition({
  store,
  api,
  config,
  debugLogs,
  debugLog,
  uiState,
  commandInput,
  terminals,
  terminalObservers,
  getTerminalSettings: () => terminalSettings,
  recordTrace: (entry) => traceDebugController.record("ws.event", entry),
  defaultDeckId: DEFAULT_DECK_ID,
  delayedSubmitMs: DELAYED_SUBMIT_MS,
  systemSlashCommands: SYSTEM_SLASH_COMMANDS,
  terminalThemePresets: TERMINAL_THEME_PRESETS,
  themeProfileKeys: THEME_PROFILE_KEYS,
  defaultTerminalTheme: DEFAULT_TERMINAL_THEME,
  streamInterpretationPluginEngine,
  streamDebugTraceController,
  traceDebugController,
  pasteObservationRuntimeController,
  appCommandUiFacadeController,
  appLayoutDeckFacadeController,
  appRuntimeStateController,
  appSessionRuntimeFacadeController,
  sessionUiFacadeController,
  streamAdapter,
  sessionViewModel,
  runtimeEventController,
  deckRuntimeController,
  commandDiscoveryUsageStore,
  clipboardRuntimeController,
  trustedLocalClientRuntimeController,
  replayViewerRuntimeController,
  replayExportRuntimeController,
  fileTransferRuntimeController,
  layoutRuntimeController,
  terminalSearchController,
  layoutProfileRuntimeController,
  connectionProfileRuntimeController,
  workspacePresetRuntimeController,
  workspaceManagerRuntimeController,
  sendHistoryRuntimeController,
  broadcastInputRuntimeController,
  sessionTerminalResizeController,
  sessionQuickSendRuntimeController,
  createBtn,
  deckCreateBtn,
  startupWarmupSkipBtn,
  sendBtn,
  commandFeedbackActionBtn,
  commandGuardSendOnceBtn,
  commandGuardCancelBtn,
  windowRef: window,
  documentRef: document,
  wsStateRef,
  isReadOnlyMode,
  getReadOnlyModeMessage,
  canWriteToSession,
  getSessionWriteBlockedMessage: getSessionWriteBlockMessage,
  showBlockedWriteReclaimUi,
  setAccessState,
  handleCommandFeedbackAction,
  commandPaletteDialogEl,
  commandPaletteMetaEl,
  commandPaletteInputEl,
  commandPaletteResultsEl,
  commandPaletteEmptyEl,
  commandPaletteCloseBtn,
  maybeRedirectToCanonicalOrigin,
  consumeOriginHandoffSourceFromWindow: () => sessionControlRuntimeController.consumeOriginHandoffSourceFromWindow(),
  ensureStartupBackup: () => startupBackupRuntimeController.ensureStartupBackup(),
  getTrustedLocalClientIdentity: () => trustedLocalClientRuntimeController.getClientIdentity?.() || null,
  ensureTrustedLocalClientIdentity: () => trustedLocalClientRuntimeController.ensureClientIdentity(),
  setRuntimeClientIdentityCreatedOnThisOrigin: (value) =>
    sessionControlRuntimeController.setRuntimeClientIdentityCreatedOnThisOrigin(value),
  setTrustedLocalClientLabel: (label) => sessionControlRuntimeController.setTrustedLocalClientLabel(label),
  setRuntimeClientId,
  applyInitializationError: (message) => appCommandUiFacadeController?.setError?.(message),
  devAuthRefreshMinDelayMs: DEV_AUTH_REFRESH_MIN_DELAY_MS,
  devAuthRefreshSafetyMs: DEV_AUTH_REFRESH_SAFETY_MS,
  devAuthRetryDelayMs: DEV_AUTH_RETRY_DELAY_MS
}));

return {
  initialize: () => appRuntimeInitializationController.initialize(),
  setInitializationError: (message) => appRuntimeInitializationController.setInitializationError(message)
};
}
