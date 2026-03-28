import { createApiClient } from "./api-client.js";
import { createAppBootstrapCompositionController } from "./app-bootstrap-composition-controller.js";
import { createAppCommandUiFacadeController } from "./app-command-ui-facade-controller.js";
import { createAppLayoutDeckFacadeController } from "./app-layout-deck-facade-controller.js";
import { createAppRuntimeStateController } from "./app-runtime-state-controller.js";
import { createAppSessionRuntimeFacadeController } from "./app-session-runtime-facade-controller.js";
import { createBroadcastInputRuntimeController } from "./broadcast-input-runtime-controller.js";
import { createClipboardRuntimeController } from "./clipboard-runtime-controller.js";
import { createConnectionProfileRuntimeController } from "./connection-profile-runtime-controller.js";
import { createCommandDiscoveryUsageStore } from "./command-discovery-ranking.js";
import { createCommandPaletteRuntimeController } from "./command-palette-runtime-controller.js";
import { createControlPaneRuntimeController } from "./control-pane-runtime-controller.js";
import { createDeckRuntimeController } from "./deck-runtime-controller.js";
import { createLayoutProfileRuntimeController } from "./layout-profile-runtime-controller.js";
import { createStore } from "./store.js";
import { resolveRuntimeConfig } from "./runtime-config.js";
import { createRuntimeEventController } from "./runtime-event-controller.js";
import { createSessionRuntimeController } from "./session-runtime-controller.js";
import { createSessionViewModel } from "./session-view-model.js";
import { createSlashWorkflowRuntimeController } from "./slash-workflow-runtime-controller.js";
import { createSplitLayoutRuntimeController } from "./split-layout-runtime-controller.js";
import { createStreamDebugTraceController } from "./stream-debug-trace-controller.js";
import { createWorkspacePresetRuntimeController } from "./workspace-preset-runtime-controller.js";
import {
  getTerminalCellHeightPx,
  isTerminalAtBottom,
  refreshTerminalViewport,
  syncTerminalScrollArea
} from "./terminal-compat.js";
import {
  createSessionStreamAdapter
} from "./terminal-stream.js";
import { ITERM2_THEME_LIBRARY } from "./theme-library.js";
import { createDeckActionsController } from "./ui/deck-actions-controller.js";
import { createDeckSidebarController } from "./ui/deck-sidebar-controller.js";
import { createLayoutRuntimeController } from "./layout-runtime-controller.js";
import { createReplayExportRuntimeController } from "./replay-export-runtime-controller.js";
import { createReplayViewerRuntimeController } from "./replay-viewer-runtime-controller.js";
import { createLayoutSettingsController } from "./ui/layout-settings-controller.js";
import { createSessionDisposalController } from "./ui/session-disposal-controller.js";
import { createSessionCardMetaController } from "./ui/session-card-meta-controller.js";
import { createSessionCardFactoryController } from "./ui/session-card-factory-controller.js";
import { createSessionGridController } from "./ui/session-grid-controller.js";
import { createSessionCardInteractionsController } from "./ui/session-card-interactions-controller.js";
import { createSessionCardRenderController } from "./ui/session-card-render-controller.js";
import { createSessionSettingsDialogController } from "./ui/session-settings-dialog-controller.js";
import { createSessionSettingsStateController } from "./ui/session-settings-state-controller.js";
import { createSessionUiFacadeController } from "./ui/session-ui-facade-controller.js";
import { createSessionTerminalResizeController } from "./ui/session-terminal-resize-controller.js";
import { createSessionTerminalRuntimeController } from "./ui/session-terminal-runtime-controller.js";
import { createTerminalSearchController } from "./ui/terminal-search-controller.js";
import { createWorkspaceRenderController } from "./ui/workspace-render-controller.js";

export function createAppRuntimeCompositionController({
  windowRef = globalThis.window,
  documentRef = globalThis.document
} = {}) {
const window = windowRef;
const document = documentRef;

const config = resolveRuntimeConfig(window);
const debugLogs = config.debugLogs === true;
const debugLog = (event, details = {}) => {
  if (!debugLogs) {
    return;
  }
  const timestamp = new Date().toISOString();
  console.debug(`[ptydeck][${timestamp}] ${event}`, details);
};
const api = createApiClient(config.apiBaseUrl, {
  debug: debugLogs,
  log: debugLog,
  async onUnauthorized() {
    const refreshed = await appRuntimeStateController?.bootstrapDevAuthToken();
    if (!refreshed) {
      debugLog("auth.recovery.failed", {});
    }
    return refreshed;
  }
});
const clipboardRuntimeController = createClipboardRuntimeController({
  navigatorRef: window?.navigator || globalThis.navigator || null
});
const commandDiscoveryUsageStore = createCommandDiscoveryUsageStore({
  storageRef: window?.localStorage || null
});
const replayExportRuntimeController = createReplayExportRuntimeController({
  api,
  documentRef: document,
  URLRef: window?.URL || globalThis.URL || null,
  BlobCtor: window?.Blob || globalThis.Blob,
  writeClipboardText: (text) => clipboardRuntimeController.writeText(text),
  formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
  formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || ""
});
const streamDebugTraceController = debugLogs
  ? createStreamDebugTraceController({
      windowRef: window
    })
  : { record() {}, dispose() {} };
const store = createStore();

const appShellEl = typeof document.querySelector === "function" ? document.querySelector(".app-shell") : null;
const stateEl = document.getElementById("connection-state");
const gridEl = document.getElementById("terminal-grid");
const sidebarToggleBtn = document.getElementById("sidebar-toggle");
const sidebarToggleIcon = document.getElementById("sidebar-toggle-icon");
const sidebarLauncherBtn = document.getElementById("sidebar-launcher");
const createBtn = document.getElementById("create-session");
const deckTabsEl = document.getElementById("deck-tabs");
const deckCreateBtn = document.getElementById("deck-create");
const deckRenameBtn = document.getElementById("deck-rename");
const deckDeleteBtn = document.getElementById("deck-delete");
const settingsColsEl = document.getElementById("settings-cols");
const settingsRowsEl = document.getElementById("settings-rows");
const settingsApplyBtn = document.getElementById("settings-apply");
const layoutProfileSelectEl = document.getElementById("layout-profile-select");
const layoutProfileSaveBtn = document.getElementById("layout-profile-save");
const layoutProfileApplyBtn = document.getElementById("layout-profile-apply");
const layoutProfileRenameBtn = document.getElementById("layout-profile-rename");
const layoutProfileDeleteBtn = document.getElementById("layout-profile-delete");
const layoutProfileStatusEl = document.getElementById("layout-profile-status");
const connectionProfileSelectEl = document.getElementById("connection-profile-select");
const connectionProfileSaveBtn = document.getElementById("connection-profile-save");
const connectionProfileApplyBtn = document.getElementById("connection-profile-apply");
const connectionProfileRenameBtn = document.getElementById("connection-profile-rename");
const connectionProfileDeleteBtn = document.getElementById("connection-profile-delete");
const connectionProfileStatusEl = document.getElementById("connection-profile-status");
const workspacePresetSelectEl = document.getElementById("workspace-preset-select");
const workspacePresetSaveBtn = document.getElementById("workspace-preset-save");
const workspacePresetApplyBtn = document.getElementById("workspace-preset-apply");
const workspacePresetRenameBtn = document.getElementById("workspace-preset-rename");
const workspacePresetDeleteBtn = document.getElementById("workspace-preset-delete");
const workspacePresetGroupSelectEl = document.getElementById("workspace-group-select");
const workspacePresetGroupSaveBtn = document.getElementById("workspace-group-save");
const workspacePresetGroupApplyBtn = document.getElementById("workspace-group-apply");
const workspacePresetGroupRenameBtn = document.getElementById("workspace-group-rename");
const workspacePresetGroupDeleteBtn = document.getElementById("workspace-group-delete");
const workspacePresetGroupClearBtn = document.getElementById("workspace-group-clear");
const workspacePresetStatusEl = document.getElementById("workspace-preset-status");
const commandInput = document.getElementById("command-input");
const sendBtn = document.getElementById("send-command");
const template = document.getElementById("terminal-card-template");
const emptyStateEl = document.getElementById("empty-state");
const statusMessageEl = document.getElementById("status-message");
const commandTargetEl = document.getElementById("command-target");
const commandFeedbackEl = document.getElementById("command-feedback");
const commandInlineHintEl = document.getElementById("command-inline-hint");
const commandPreviewEl = document.getElementById("command-preview");
const commandSuggestionsEl = document.getElementById("command-suggestions");
const commandGuardEl = document.getElementById("command-guard");
const commandGuardSummaryEl = document.getElementById("command-guard-summary");
const commandGuardReasonsEl = document.getElementById("command-guard-reasons");
const commandGuardPreviewEl = document.getElementById("command-guard-preview");
const commandGuardSendOnceBtn = document.getElementById("command-guard-send-once");
const commandGuardCancelBtn = document.getElementById("command-guard-cancel");
const workflowStatusEl = document.getElementById("workflow-status");
const workflowTargetEl = document.getElementById("workflow-target");
const workflowProgressEl = document.getElementById("workflow-progress");
const workflowDetailEl = document.getElementById("workflow-detail");
const workflowResultEl = document.getElementById("workflow-result");
const workflowStopBtn = document.getElementById("workflow-stop");
const workflowInterruptBtn = document.getElementById("workflow-interrupt");
const workflowKillBtn = document.getElementById("workflow-kill");
const replayViewerDialogEl = document.getElementById("replay-viewer-dialog");
const replayViewerTitleEl = document.getElementById("replay-viewer-title");
const replayViewerMetaEl = document.getElementById("replay-viewer-meta");
const replayViewerStatusEl = document.getElementById("replay-viewer-status");
const replayViewerContentEl = document.getElementById("replay-viewer-content");
const replayViewerRefreshBtn = document.getElementById("replay-viewer-refresh");
const replayViewerDownloadBtn = document.getElementById("replay-viewer-download");
const replayViewerCopyBtn = document.getElementById("replay-viewer-copy");
const replayViewerCloseBtn = document.getElementById("replay-viewer-close");
const commandPaletteDialogEl = document.getElementById("command-palette-dialog");
const commandPaletteMetaEl = document.getElementById("command-palette-meta");
const commandPaletteInputEl = document.getElementById("command-palette-input");
const commandPaletteResultsEl = document.getElementById("command-palette-results");
const commandPaletteEmptyEl = document.getElementById("command-palette-empty");
const commandPaletteCloseBtn = document.getElementById("command-palette-close");
const startupWarmupGateEl = document.getElementById("startup-warmup-gate");
const startupWarmupMessageEl = document.getElementById("startup-warmup-message");
const startupWarmupDetailEl = document.getElementById("startup-warmup-detail");
const startupWarmupSkipBtn = document.getElementById("startup-warmup-skip");
const workspaceShellEl = document.getElementById("workspace-shell");
const executionPaneEl = document.getElementById("execution-pane");
const controlPaneEl = document.getElementById("control-pane");
const controlPaneLauncherBtn = document.getElementById("control-pane-launcher");
const controlPaneToggleBtn = document.getElementById("control-pane-toggle");
const controlPanePositionSelectEl = document.getElementById("control-pane-position");
const controlPaneStatusEl = document.getElementById("control-pane-status");
const controlPaneResizeHandleEl = document.getElementById("control-pane-resize-handle");
const terminalSearchInputEl = document.getElementById("terminal-search-input");
const terminalSearchPrevBtn = document.getElementById("terminal-search-prev");
const terminalSearchNextBtn = document.getElementById("terminal-search-next");
const terminalSearchClearBtn = document.getElementById("terminal-search-clear");
const terminalSearchStatusEl = document.getElementById("terminal-search-status");

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
const streamAdapter = createSessionStreamAdapter({
  idleMs: SESSION_ACTIVITY_QUIET_MS,
  onData(sessionId, chunk) {
    streamDebugTraceController.record(sessionId, "stream.data", {
      chunk
    });
    appSessionRuntimeFacadeController?.appendTerminalChunk(sessionId, chunk);
  },
  onIdle(sessionId) {
    streamDebugTraceController.record(sessionId, "stream.idle", {});
    store.clearSessionActivity(sessionId);
  }
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
const SYSTEM_SLASH_COMMANDS = [
  "new",
  "deck",
  "move",
  "size",
  "filter",
  "close",
  "switch",
  "swap",
  "next",
  "prev",
  "list",
  "rename",
  "restart",
  "note",
  "connection",
  "layout",
  "workspace",
  "broadcast",
  "replay",
  "settings",
  "custom",
  "help",
  "run"
];
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
let terminalSearchController = null;
let layoutSettingsController = null;
let sessionSettingsDialogController = null;
let workspaceRenderController = null;
let replayViewerRuntimeController = null;
let commandPaletteRuntimeController = null;
let controlPaneRuntimeController = null;
let layoutProfileRuntimeController = null;
let workspacePresetRuntimeController = null;
let broadcastInputRuntimeController = null;
let splitLayoutRuntimeController = null;
let slashWorkflowRuntimeController = null;
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
  commandFeedback: "",
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

appRuntimeStateController = createAppRuntimeStateController({
  windowRef: window,
  uiState,
  startupPerf,
  nowMs,
  wsBootstrapFallbackMs: WS_BOOTSTRAP_FALLBACK_MS,
  debugLog,
  requestRender: () => appCommandUiFacadeController?.render(),
  hasBootstrapInFlight: () => authBootstrapRuntimeController?.hasBootstrapInFlight?.() === true,
  runBootstrapFallback: () => authBootstrapRuntimeController?.bootstrapRuntimeFallback?.(),
  runBootstrapDevAuthToken: (options) => authBootstrapRuntimeController?.bootstrapDevAuthToken?.(options) || false
});

appCommandUiFacadeController = createAppCommandUiFacadeController({
  store,
  uiState,
  startupPerf,
  nowMs,
  terminalSearchState,
  getAppRuntimeStateController: () => appRuntimeStateController,
  getTerminalSearchController: () => terminalSearchController,
  getCommandComposerAutocompleteController: () => commandComposerAutocompleteController,
  getCommandComposerRuntimeController: () => commandComposerRuntimeController,
  getCommandTargetRuntimeController: () => commandTargetRuntimeController,
  getSessionGridController: () => sessionGridController,
  getConnectionProfileRuntimeController: () => connectionProfileRuntimeController,
  getControlPaneRuntimeController: () => controlPaneRuntimeController,
  getWorkspacePresetRuntimeController: () => workspacePresetRuntimeController,
  getCommandExecutor: () => commandExecutor
});

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
  sidebarLauncherBtn
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

controlPaneRuntimeController = createControlPaneRuntimeController({
  windowRef: window,
  workspaceShellEl,
  executionPaneEl,
  controlPaneEl,
  controlPaneLauncherBtn,
  controlPaneToggleBtn,
  controlPanePositionSelectEl,
  controlPaneStatusEl,
  controlPaneResizeHandleEl,
  scheduleGlobalResize: (options) => appLayoutDeckFacadeController?.scheduleGlobalResize(options),
  scheduleDeferredResizePasses: (options) => appLayoutDeckFacadeController?.scheduleDeferredResizePasses(options)
});

layoutProfileRuntimeController = createLayoutProfileRuntimeController({
  windowRef: window,
  documentRef: document,
  api,
  selectEl: layoutProfileSelectEl,
  saveBtn: layoutProfileSaveBtn,
  applyBtn: layoutProfileApplyBtn,
  renameBtn: layoutProfileRenameBtn,
  deleteBtn: layoutProfileDeleteBtn,
  statusEl: layoutProfileStatusEl,
  getDecks: () => store.getState().decks || [],
  getActiveDeckId: () => store.getState().activeDeckId || DEFAULT_DECK_ID,
  getSessionFilterText: () => appLayoutDeckFacadeController?.getSessionFilterText?.() || "",
  getSidebarVisible: () => terminalSettings?.sidebarVisible !== false,
  getControlPaneState: () => controlPaneRuntimeController?.getState?.() || {},
  getDeckTerminalGeometry: (deckId) => appLayoutDeckFacadeController?.getDeckTerminalGeometry?.(deckId) || {
    cols: DEFAULT_TERMINAL_COLS,
    rows: DEFAULT_TERMINAL_ROWS
  },
  getDeckById: (deckId) => appLayoutDeckFacadeController?.getDeckById?.(deckId),
  setSessionFilterText: (value) => appLayoutDeckFacadeController?.setSessionFilterText?.(value),
  setSidebarVisible: (visible) => appLayoutDeckFacadeController?.setSidebarVisible?.(visible),
  setControlPaneState: (nextState) => controlPaneRuntimeController?.setState?.(nextState),
  setActiveDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck?.(deckId) === true,
  applyRuntimeEvent: (event, options) => appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, options) === true,
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
  setError: (message) => appCommandUiFacadeController?.setError?.(message),
  getErrorMessage: (error, fallback) => appCommandUiFacadeController?.getErrorMessage?.(error, fallback) || fallback,
  requestRender: () => appCommandUiFacadeController?.render?.(),
  getDeckSplitLayouts: () => splitLayoutRuntimeController?.captureDeckSplitLayouts?.() || {},
  setDeckSplitLayouts: (nextLayouts) => splitLayoutRuntimeController?.replaceDeckSplitLayouts?.(nextLayouts)
});

connectionProfileRuntimeController = createConnectionProfileRuntimeController({
  windowRef: window,
  documentRef: document,
  api,
  selectEl: connectionProfileSelectEl,
  saveBtn: connectionProfileSaveBtn,
  applyBtn: connectionProfileApplyBtn,
  renameBtn: connectionProfileRenameBtn,
  deleteBtn: connectionProfileDeleteBtn,
  statusEl: connectionProfileStatusEl,
  getSessions: () => store.getState().sessions || [],
  getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById?.(sessionId) || null,
  getActiveSessionId: () => store.getState().activeSessionId || "",
  setActiveSession: (sessionId) => store.setActiveSession(sessionId),
  setActiveDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck?.(deckId) === true,
  applyRuntimeEvent: (event, runtimeOptions) => appSessionRuntimeFacadeController?.applyRuntimeEvent?.(event, runtimeOptions) === true,
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
  setError: (message) => appCommandUiFacadeController?.setError?.(message),
  getErrorMessage: (error, fallback) => appCommandUiFacadeController?.getErrorMessage?.(error, fallback) || fallback,
  formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
  formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
  requestRender: () => appCommandUiFacadeController?.render?.(),
  normalizeThemeProfile: (value) =>
    sessionUiFacadeController?.normalizeThemeProfile?.(value) ||
    (value && typeof value === "object" && !Array.isArray(value) ? value : {}),
  defaultDeckId: DEFAULT_DECK_ID
});

workspacePresetRuntimeController = createWorkspacePresetRuntimeController({
  windowRef: window,
  documentRef: document,
  api,
  presetSelectEl: workspacePresetSelectEl,
  presetSaveBtn: workspacePresetSaveBtn,
  presetApplyBtn: workspacePresetApplyBtn,
  presetRenameBtn: workspacePresetRenameBtn,
  presetDeleteBtn: workspacePresetDeleteBtn,
  groupSelectEl: workspacePresetGroupSelectEl,
  groupSaveBtn: workspacePresetGroupSaveBtn,
  groupApplyBtn: workspacePresetGroupApplyBtn,
  groupRenameBtn: workspacePresetGroupRenameBtn,
  groupDeleteBtn: workspacePresetGroupDeleteBtn,
  groupClearBtn: workspacePresetGroupClearBtn,
  statusEl: workspacePresetStatusEl,
  getDecks: () => store.getState().decks || [],
  getSessions: () => store.getState().sessions || [],
  getActiveDeckId: () => store.getState().activeDeckId || DEFAULT_DECK_ID,
  getSessionFilterText: () => appLayoutDeckFacadeController?.getSessionFilterText?.() || "",
  getControlPaneState: () => controlPaneRuntimeController?.getState?.() || {},
  resolveFilterSelectors: (selectorText, sessions, resolveOptions) =>
    commandTargetRuntimeController?.resolveFilterSelectors?.(selectorText, sessions, resolveOptions) || {
      sessions: Array.isArray(sessions) ? sessions.slice() : [],
      error: ""
    },
  resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session) || DEFAULT_DECK_ID,
  sortSessionsByQuickId: (sessions) => appSessionRuntimeFacadeController?.sortSessionsByQuickId?.(sessions) || [],
  getSelectedLayoutProfileId: () => layoutProfileRuntimeController?.getSelectedProfileId?.() || "",
  listLayoutProfiles: () => layoutProfileRuntimeController?.listProfiles?.() || [],
  applyLayoutProfileById: (profileId) => layoutProfileRuntimeController?.applyProfileById?.(profileId) || "",
  setActiveDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck?.(deckId) === true,
  setControlPaneState: (nextState) => controlPaneRuntimeController?.setState?.(nextState),
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
  setError: (message) => appCommandUiFacadeController?.setError?.(message),
  getErrorMessage: (error, fallback) => appCommandUiFacadeController?.getErrorMessage?.(error, fallback) || fallback,
  requestRender: () => appCommandUiFacadeController?.render?.(),
  getDeckSplitLayouts: () => splitLayoutRuntimeController?.captureDeckSplitLayouts?.() || {},
  setDeckSplitLayouts: (nextLayouts) => splitLayoutRuntimeController?.replaceDeckSplitLayouts?.(nextLayouts)
});

broadcastInputRuntimeController = createBroadcastInputRuntimeController({
  getActiveDeckId: () => store.getState().activeDeckId || DEFAULT_DECK_ID,
  getSessions: () => store.getState().sessions || [],
  resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId?.(session) || DEFAULT_DECK_ID,
  sortSessionsByQuickId: (sessions) => appSessionRuntimeFacadeController?.sortSessionsByQuickId?.(sessions) || [],
  listGroupsForDeck: (deckId) => workspacePresetRuntimeController?.listGroupsForDeck?.(deckId) || [],
  getActiveGroupIdForDeck: (deckId) => workspacePresetRuntimeController?.getActiveGroupIdForDeck?.(deckId) || "",
  applyGroupLocally: (groupId, deckId) => workspacePresetRuntimeController?.applyGroupLocally?.(groupId, deckId) || null
});

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
  getActiveSessionId: () => store.getState().activeSessionId,
  getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById(sessionId),
  streamAdapter,
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback(message),
  getExitedSessionMessage: sessionUiFacadeController.getExitedSessionMessage,
  getRuntimeEventController: () => runtimeEventController,
  getSessionViewModel: () => sessionViewModel,
  windowRef: window
});

runtimeEventController = createRuntimeEventController({
  defaultDeckId: DEFAULT_DECK_ID,
  getPreferredActiveDeckId: () => store.getState().activeDeckId,
  setDecks: (nextDecks, options) => appLayoutDeckFacadeController?.setDecks(nextDecks, options),
  replaceCustomCommandState: (commands) => appCommandUiFacadeController?.replaceCustomCommands(commands),
  setSessions: (sessions) => store.setSessions(sessions),
  replaySnapshotOutputs: (outputs, attempt) => appSessionRuntimeFacadeController?.replaySnapshotOutputs(outputs, attempt),
  scheduleCommandPreview: () => appCommandUiFacadeController?.scheduleCommandPreview(),
  scheduleCommandSuggestions: () => appCommandUiFacadeController?.scheduleCommandSuggestions(),
  clearError: () => appRuntimeStateController?.clearError(),
  markRuntimeBootstrapReady: (source) => appCommandUiFacadeController?.markRuntimeBootstrapReady(source),
  upsertSession: (nextSession) => appSessionRuntimeFacadeController?.upsertSession(nextSession),
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
  setError: (message) => appCommandUiFacadeController?.setError(message),
  sendInput: (sessionId, data) => api.sendInput(sessionId, data)
});

sessionCardMetaController = createSessionCardMetaController({
  normalizeSessionTags: sessionUiFacadeController.normalizeSessionTags
});

sessionDisposalController = createSessionDisposalController();

sessionCardFactoryController = createSessionCardFactoryController({
  ensureQuickId: (sessionId) => appSessionRuntimeFacadeController?.ensureQuickId(sessionId) || "?",
  getSessionStateBadgeText: sessionUiFacadeController.getSessionStateBadgeText,
  getSessionStateHintText: sessionUiFacadeController.getSessionStateHintText,
  isSessionUnrestored: sessionUiFacadeController.isSessionUnrestored,
  isSessionExited: sessionUiFacadeController.isSessionExited,
  renderSessionTagList: sessionUiFacadeController.renderSessionTagList,
  renderSessionNote: sessionUiFacadeController.renderSessionNote,
  setSessionCardVisibility: (node, visible) => appSessionRuntimeFacadeController?.setSessionCardVisibility(node, visible)
});

sessionSettingsStateController = createSessionSettingsStateController({
  themeProfileKeys: THEME_PROFILE_KEYS,
  defaultTerminalTheme: DEFAULT_TERMINAL_THEME,
  themeFilterCategorySet: THEME_FILTER_CATEGORY_SET,
  terminalThemePresetMap: TERMINAL_THEME_PRESET_MAP,
  terminalThemePresets: TERMINAL_THEME_PRESETS,
  terminalThemeModeSet: TERMINAL_THEME_MODE_SET,
  sessionThemeDrafts,
  getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById(sessionId),
  getActiveSessionId: () => store.getState().activeSessionId,
  getSessionSendTerminator: (sessionId) => appLayoutDeckFacadeController?.getSessionSendTerminator(sessionId) || "auto",
  normalizeSendTerminatorMode: (value) => appLayoutDeckFacadeController?.normalizeSendTerminatorMode(value) || "auto",
  formatSessionEnv: sessionUiFacadeController.formatSessionEnv,
  formatSessionTags: sessionUiFacadeController.formatSessionTags,
  parseSessionEnv: sessionUiFacadeController.parseSessionEnv,
  parseSessionTags: sessionUiFacadeController.parseSessionTags,
  normalizeSessionStartupFromSession: sessionUiFacadeController.normalizeSessionStartupFromSession,
  terminals,
  documentRef: document
});

sessionCardInteractionsController = createSessionCardInteractionsController({
  windowRef: window,
  themeModeSet: TERMINAL_THEME_MODE_SET,
  themeProfileKeys: THEME_PROFILE_KEYS,
  getThemePresetById: sessionUiFacadeController.getThemePresetById,
  normalizeThemeSlot: sessionUiFacadeController.normalizeThemeSlot,
  normalizeThemeProfile: sessionUiFacadeController.normalizeThemeProfile,
  normalizeThemeFilterCategory: sessionUiFacadeController.normalizeThemeFilterCategory,
  readThemeProfileFromControls: sessionUiFacadeController.readThemeProfileFromControls,
  updateSessionThemeDraftFromControls: sessionUiFacadeController.updateSessionThemeDraftFromControls,
  readSessionThemeProfilesForSave: sessionUiFacadeController.readSessionThemeProfilesForSave,
  readSessionStartupFromControls: sessionUiFacadeController.readSessionStartupFromControls,
  readSessionNoteFromControls: sessionUiFacadeController.readSessionNoteFromControls,
  readSessionInputSafetyFromControls: sessionUiFacadeController.readSessionInputSafetyFromControls,
  isValidHexColor: sessionUiFacadeController.isValidHexColor,
  detectThemePreset: sessionUiFacadeController.detectThemePreset,
  isSessionSettingsDirty: sessionUiFacadeController.isSessionSettingsDirty,
  isSessionExited: sessionUiFacadeController.isSessionExited,
  setActiveSettingsTab: sessionUiFacadeController.setActiveSettingsTab,
  getBlockedSessionActionMessage: sessionUiFacadeController.getBlockedSessionActionMessage,
  getErrorMessage: (error, fallback) => appCommandUiFacadeController?.getErrorMessage(error, fallback) || fallback
});

sessionCardRenderController = createSessionCardRenderController({
  isSessionUnrestored: sessionUiFacadeController.isSessionUnrestored,
  isSessionExited: sessionUiFacadeController.isSessionExited,
  getSessionStateBadgeText: sessionUiFacadeController.getSessionStateBadgeText,
  getSessionStateHintText: sessionUiFacadeController.getSessionStateHintText,
  isTerminalAtBottom,
  setSessionCardVisibility: (node, visible) => appSessionRuntimeFacadeController?.setSessionCardVisibility(node, visible),
  syncTerminalViewportAfterShow: (sessionId, entry) => appSessionRuntimeFacadeController?.syncTerminalViewportAfterShow(sessionId, entry),
  ensureQuickId: (sessionId) => appSessionRuntimeFacadeController?.ensureQuickId(sessionId) || "?",
  renderSessionTagList: sessionUiFacadeController.renderSessionTagList,
  renderSessionNote: sessionUiFacadeController.renderSessionNote,
  syncSessionStartupControls: sessionUiFacadeController.syncSessionStartupControls,
  syncSessionNoteControls: sessionUiFacadeController.syncSessionNoteControls,
  syncSessionInputSafetyControls: sessionUiFacadeController.syncSessionInputSafetyControls,
  syncSessionThemeControls: sessionUiFacadeController.syncSessionThemeControls,
  setSettingsDirty: sessionUiFacadeController.setSettingsDirty,
  applyThemeForSession: sessionUiFacadeController.applyThemeForSession
});

sessionTerminalResizeController = createSessionTerminalResizeController({
  windowRef: window,
  terminals,
  resizeTimers,
  terminalSizes,
  getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById(sessionId),
  resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId(session),
  getSessionTerminalGeometry: (sessionOrId) => appLayoutDeckFacadeController?.getSessionTerminalGeometry(sessionOrId),
  isSessionActionBlocked: sessionUiFacadeController.isSessionActionBlocked,
  computeFixedMountHeightPx: (rows) => appLayoutDeckFacadeController?.computeFixedMountHeightPx(rows),
  computeFixedCardWidthPx: (cols) => appLayoutDeckFacadeController?.computeFixedCardWidthPx(cols),
  getTerminalCellHeightPx,
  terminalCardHorizontalChromePx: TERMINAL_CARD_HORIZONTAL_CHROME_PX,
  debugLog,
  api
});

sessionTerminalRuntimeController = createSessionTerminalRuntimeController({
  windowRef: window,
  terminalFontSize: TERMINAL_FONT_SIZE,
  terminalLineHeight: TERMINAL_LINE_HEIGHT,
  terminalFontFamily: TERMINAL_FONT_FAMILY,
  readClipboardText: () => clipboardRuntimeController.readText(),
  writeClipboardText: (text) => clipboardRuntimeController.writeText(text),
  debugLog
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
  settingsColsEl,
  settingsRowsEl,
  terminalFontSize: TERMINAL_FONT_SIZE,
  terminalLineHeight: TERMINAL_LINE_HEIGHT,
  terminalFontFamily: TERMINAL_FONT_FAMILY,
  cardHorizontalChromePx: TERMINAL_CARD_HORIZONTAL_CHROME_PX,
  mountVerticalChromePx: TERMINAL_MOUNT_VERTICAL_CHROME_PX
});

sessionSettingsDialogController = createSessionSettingsDialogController({
  windowRef: window
});

workspaceRenderController = createWorkspaceRenderController({
  stateEl,
  emptyStateEl,
  statusMessageEl,
  commandTargetEl,
  commandFeedbackEl,
  commandInlineHintEl,
  commandPreviewEl,
  commandSuggestionsEl,
  commandGuardEl,
  commandGuardSummaryEl,
  commandGuardReasonsEl,
  commandGuardPreviewEl,
  workflowStatusEl,
  workflowTargetEl,
  workflowProgressEl,
  workflowDetailEl,
  workflowResultEl,
  workflowStopBtn,
  workflowInterruptBtn,
  workflowKillBtn,
  startupWarmupGateEl,
  startupWarmupMessageEl,
  startupWarmupDetailEl,
  startupWarmupSkipBtn
});
replayViewerRuntimeController = createReplayViewerRuntimeController({
  dialogEl: replayViewerDialogEl,
  titleEl: replayViewerTitleEl,
  metaEl: replayViewerMetaEl,
  statusEl: replayViewerStatusEl,
  contentEl: replayViewerContentEl,
  refreshBtn: replayViewerRefreshBtn,
  downloadBtn: replayViewerDownloadBtn,
  copyBtn: replayViewerCopyBtn,
  closeBtn: replayViewerCloseBtn,
  loadSessionReplay: (session) => replayExportRuntimeController.loadSessionReplay(session),
  exportSessionReplay: (session, options) => replayExportRuntimeController.exportSessionReplay(session, options),
  buildReplayRetentionSummary: replayExportRuntimeController.buildReplayRetentionSummary,
  formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
  formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback(message),
  getErrorMessage: (error, fallback) => appRuntimeStateController?.getErrorMessage?.(error, fallback) || fallback
});

terminalSearchController = createTerminalSearchController({
  terminalSearchState,
  terminals,
  inputEl: terminalSearchInputEl,
  prevBtn: terminalSearchPrevBtn,
  nextBtn: terminalSearchNextBtn,
  clearBtn: terminalSearchClearBtn,
  statusEl: terminalSearchStatusEl,
  getActiveSessionId: () => store.getState().activeSessionId
});

deckActionsController = createDeckActionsController({
  windowRef: window,
  api,
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck() || null,
  getDecks: () => store.getState().decks,
  getTerminalSettings: () => terminalSettings,
  applyRuntimeEvent: (event, options) => appSessionRuntimeFacadeController?.applyRuntimeEvent(event, options) === true,
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback(message),
  setError: (message) => appCommandUiFacadeController?.setError(message),
  defaultDeckId: DEFAULT_DECK_ID
});

deckSidebarController = createDeckSidebarController({
  containerEl: deckTabsEl,
  documentRef: document,
  resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId(session),
  ensureQuickId: (sessionId) => appSessionRuntimeFacadeController?.ensureQuickId(sessionId) || "?",
  sortSessionsByQuickId: (sessions) => appSessionRuntimeFacadeController?.sortSessionsByQuickId(sessions) || [],
  resolveDeckSessions: (deckId, sessions, resolveOptions) =>
    workspacePresetRuntimeController?.resolveDeckSessions?.(deckId, sessions, resolveOptions) ||
    (Array.isArray(sessions) ? sessions.slice() : []),
  formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName(session) || "",
  getSessionActivityIndicatorState: sessionUiFacadeController.getSessionActivityIndicatorState,
  onActivateDeck: (deckId) => appLayoutDeckFacadeController?.setActiveDeck(deckId),
  onActivateSession: (session) => commandTargetRuntimeController?.activateSessionTarget(session)
});

sessionGridController = createSessionGridController({
  defaultDeckId: DEFAULT_DECK_ID,
  deckRenameBtn,
  deckDeleteBtn,
  terminals,
  terminalObservers,
  resizeTimers,
  terminalSizes,
  sessionThemeDrafts,
  template,
  gridEl,
  splitLayoutRuntimeController,
  getActiveDeck: () => appLayoutDeckFacadeController?.getActiveDeck() || null,
  resolveSessionDeckId: (session) => appSessionRuntimeFacadeController?.resolveSessionDeckId(session),
  getSessionFilterText: () => appLayoutDeckFacadeController?.getSessionFilterText() || "",
  sortSessionsByQuickId: (sessions) => appSessionRuntimeFacadeController?.sortSessionsByQuickId(sessions) || [],
  resolveDeckSessions: (deckId, sessions, resolveOptions) =>
    workspacePresetRuntimeController?.resolveDeckSessions?.(deckId, sessions, resolveOptions) ||
    (Array.isArray(sessions) ? sessions.slice() : []),
  pruneQuickIds: (activeSessionIds) => appSessionRuntimeFacadeController?.pruneQuickIds(activeSessionIds),
  renderDeckTabs: (sessions) => appLayoutDeckFacadeController?.renderDeckTabs(sessions),
  workspaceRenderController,
  getCommandTargetSummary: () => commandTargetRuntimeController?.formatActiveTargetSummary?.() || "",
  syncActiveTerminalSearch: (options) => appCommandUiFacadeController?.syncActiveTerminalSearch(options),
  sessionDisposalController,
  closeSettingsDialog: (dialog) => appLayoutDeckFacadeController?.closeSettingsDialog(dialog),
  onSessionDisposed: (sessionId) => appSessionRuntimeFacadeController?.disposeSessionRuntime(sessionId),
  terminalSearchState,
  clearTerminalSearchSelection: (sessionId) => appCommandUiFacadeController?.clearTerminalSearchSelection(sessionId),
  sessionCardRenderController,
  sessionCardFactoryController,
  sessionCardInteractionsController,
  sessionTerminalRuntimeController,
  onSessionMounted: (session) => appSessionRuntimeFacadeController?.ensureSessionRuntime(session),
  resolveInitialTheme: (sessionId) =>
    sessionUiFacadeController.buildThemeFromConfig(
      sessionUiFacadeController.getSessionThemeConfig(
        sessionId,
        store.getState().activeSessionId === sessionId ? "active" : "inactive"
      )
    ),
  handleSessionTerminalInput: (sessionId, data) => appSessionRuntimeFacadeController?.handleSessionTerminalInput(sessionId, data),
  handleSessionTerminalPaste: (sessionId, text) => commandComposerRuntimeController?.submitTerminalPaste?.(sessionId, text),
  syncSessionStartupControls: sessionUiFacadeController.syncSessionStartupControls,
  syncSessionNoteControls: sessionUiFacadeController.syncSessionNoteControls,
  syncSessionInputSafetyControls: sessionUiFacadeController.syncSessionInputSafetyControls,
  syncSessionThemeControls: sessionUiFacadeController.syncSessionThemeControls,
  setSettingsDirty: sessionUiFacadeController.setSettingsDirty,
  applyResizeForSession: (sessionId, options) => appLayoutDeckFacadeController?.applyResizeForSession(sessionId, options),
  scheduleGlobalResize: (options) => appLayoutDeckFacadeController?.scheduleGlobalResize(options),
  scheduleDeferredResizePasses: (options) => appLayoutDeckFacadeController?.scheduleDeferredResizePasses(options),
  setActiveSession: (sessionId) => store.setActiveSession(sessionId),
  getSessionById: (sessionId) => appSessionRuntimeFacadeController?.getSessionById(sessionId),
  toggleSettingsDialog: (dialog) => appLayoutDeckFacadeController?.toggleSettingsDialog(dialog),
  confirmSessionDelete: (session) => appLayoutDeckFacadeController?.confirmSessionDelete(session),
  removeSession: (sessionId) => appSessionRuntimeFacadeController?.removeSession(sessionId),
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback(message),
  formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken(sessionId) || "?",
  formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName(session) || "",
  setError: (message) => appCommandUiFacadeController?.setError(message),
  clearError: () => appRuntimeStateController?.clearError(),
  applyRuntimeEvent: (event, options) => appSessionRuntimeFacadeController?.applyRuntimeEvent(event, options) === true,
  applyThemeForSession: sessionUiFacadeController.applyThemeForSession,
  getSessionThemeConfig: sessionUiFacadeController.getSessionThemeConfig,
  setSessionSendTerminator: (sessionId, mode) => appLayoutDeckFacadeController?.setSessionSendTerminator(sessionId, mode),
  setStartupSettingsFeedback: sessionUiFacadeController.setStartupSettingsFeedback,
  requestRender: () => appCommandUiFacadeController?.render(),
  api,
  themeProfileKeys: THEME_PROFILE_KEYS,
  debugLog
});
const appBootstrapCompositionController = createAppBootstrapCompositionController({
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
  defaultDeckId: DEFAULT_DECK_ID,
  delayedSubmitMs: DELAYED_SUBMIT_MS,
  systemSlashCommands: SYSTEM_SLASH_COMMANDS,
  terminalThemePresets: TERMINAL_THEME_PRESETS,
  commandGuardSendOnceBtn,
  commandGuardCancelBtn,
  windowRef: window,
  documentRef: document,
  wsStateRef,
  observeSessionData: (sessionId, data) =>
    streamDebugTraceController.record(sessionId, "ws.session.data", {
      chunk: data,
      hasTerminal: terminals.has(sessionId)
    }),
  createBtn,
  deckCreateBtn,
  deckRenameBtn,
  deckDeleteBtn,
  startupWarmupSkipBtn,
  sendBtn,
  layoutRuntimeController,
  terminalSearchController,
  layoutProfileRuntimeController,
  connectionProfileRuntimeController,
  workspacePresetRuntimeController,
  broadcastInputRuntimeController,
  sessionTerminalResizeController,
  appCommandUiFacadeController,
  appLayoutDeckFacadeController,
  appRuntimeStateController,
  appSessionRuntimeFacadeController,
  sessionUiFacadeController,
  streamAdapter,
  sessionViewModel,
  runtimeEventController,
  deckRuntimeController,
  getDiscoveryUsageScore: (key) => commandDiscoveryUsageStore.getUsageScore(key),
  recordDiscoveryUsage: (key) => commandDiscoveryUsageStore.record(key),
  readClipboardText: () => clipboardRuntimeController.readText(),
  writeClipboardText: (text) => clipboardRuntimeController.writeText(text),
  openSessionReplayViewer: (session) => replayViewerRuntimeController?.openSessionReplayViewer?.(session),
  exportSessionReplayDownload: (session) => replayExportRuntimeController.exportSessionReplay(session, { mode: "download" }),
  exportSessionReplayCopy: (session) => replayExportRuntimeController.exportSessionReplay(session, { mode: "copy" }),
  runWorkflowDetailed: (interpreted) => slashWorkflowRuntimeController?.runWorkflowDetailed?.(interpreted),
  stopWorkflow: () => slashWorkflowRuntimeController?.stopActiveWorkflow?.() === true,
  interruptWorkflowSession: () => slashWorkflowRuntimeController?.interruptWorkflowSession?.() || Promise.resolve(""),
  killWorkflowSession: () => slashWorkflowRuntimeController?.killWorkflowSession?.() || Promise.resolve(""),
  disposeWorkflowRuntime: () => slashWorkflowRuntimeController?.dispose?.(),
  disposeStreamDebugTrace: () => streamDebugTraceController.dispose(),
  devAuthRefreshMinDelayMs: DEV_AUTH_REFRESH_MIN_DELAY_MS,
  devAuthRefreshSafetyMs: DEV_AUTH_REFRESH_SAFETY_MS,
  devAuthRetryDelayMs: DEV_AUTH_RETRY_DELAY_MS
});
({
  commandEngine,
  commandTargetRuntimeController,
  commandExecutor,
  authBootstrapRuntimeController,
  wsRuntimeController,
  commandComposerAutocompleteController,
  commandComposerRuntimeController,
  appLifecycleController
} = appBootstrapCompositionController.composeControllers());

slashWorkflowRuntimeController = createSlashWorkflowRuntimeController({
  store,
  executeControlCommandDetailed: (interpreted) =>
    appCommandUiFacadeController?.executeControlCommandDetailed?.(interpreted) || { ok: true, feedback: "" },
  setWorkflowRunState: (nextState) => appRuntimeStateController?.setWorkflowRunState?.(nextState),
  clearWorkflowRunState: (runtimeOptions) => appRuntimeStateController?.clearWorkflowRunState?.(runtimeOptions),
  requestRender: () => appCommandUiFacadeController?.render?.(),
  formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
  formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
  apiInterruptSession: (sessionId) => api.interruptSession(sessionId),
  apiKillSession: (sessionId) => api.killSession(sessionId),
  debugLog
});

commandPaletteRuntimeController = createCommandPaletteRuntimeController({
  windowRef: window,
  documentRef: document,
  dialogEl: commandPaletteDialogEl,
  searchInputEl: commandPaletteInputEl,
  resultsEl: commandPaletteResultsEl,
  emptyEl: commandPaletteEmptyEl,
  metaEl: commandPaletteMetaEl,
  closeBtn: commandPaletteCloseBtn,
  commandInput,
  systemSlashCommands: SYSTEM_SLASH_COMMANDS,
  getState: () => store.getState(),
  getUsageScore: (key) => commandDiscoveryUsageStore.getUsageScore(key),
  recordUsage: (key) => commandDiscoveryUsageStore.record(key),
  listCustomCommands: () => appCommandUiFacadeController?.listCustomCommands?.() || [],
  formatSessionToken: (sessionId) => appSessionRuntimeFacadeController?.formatSessionToken?.(sessionId) || "?",
  formatSessionDisplayName: (session) => appSessionRuntimeFacadeController?.formatSessionDisplayName?.(session) || "",
  activateSessionTarget: (session) => commandTargetRuntimeController?.activateSessionTarget?.(session) || { ok: false, message: "" },
  activateDeckTarget: (deck) => commandTargetRuntimeController?.activateDeckTarget?.(deck) || { ok: false, message: "" },
  setCommandFeedback: (message) => appCommandUiFacadeController?.setCommandFeedback?.(message),
  setComposerValue: (value) => {
    if (!commandInput) {
      return;
    }
    commandInput.value = String(value || "");
    if (typeof commandInput.setSelectionRange === "function") {
      const length = commandInput.value.length;
      commandInput.setSelectionRange(length, length);
    }
    commandInput.focus?.();
    if (typeof commandInput.dispatchEvent === "function") {
      if (typeof window?.Event === "function") {
        commandInput.dispatchEvent(new window.Event("input", { bubbles: true }));
      } else {
        commandInput.dispatchEvent({ type: "input" });
      }
    }
  }
});

function setInitializationError(message) {
  appCommandUiFacadeController?.setError(message);
}

async function initialize() {
  return appBootstrapCompositionController.bootstrapUiAndRuntime();
}

return {
  initialize,
  setInitializationError
};
}
