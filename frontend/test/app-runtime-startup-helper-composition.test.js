import test from "node:test";
import assert from "node:assert/strict";

import { createAppRuntimeStartupHelperComposition } from "../src/public/app-runtime-startup-helper-composition.js";

test("app runtime startup helper composition forwards the startup bridge contract to the helper assembly", () => {
  let received = null;
  const result = { appRuntimeInitializationController: { id: "init" } };

  const composition = createAppRuntimeStartupHelperComposition({
    store: { id: "store" },
    api: { id: "api" },
    commandInput: { id: "command" },
    terminals: new Map([["s1", { id: "terminal" }]]),
    terminalObservers: new Map([["s1", { id: "observer" }]]),
    layoutFoundationStateRef: { terminalSettings: { cols: 132, rows: 40 } },
    defaultDeckId: "ops",
    delayedSubmitMs: 120,
    systemSlashCommands: ["/help"],
    terminalThemePresets: [{ id: "aurora" }],
    themeProfileKeys: ["activeThemeProfile"],
    defaultTerminalTheme: { background: "#000000" },
    streamInterpretationPluginEngine: { id: "plugins" },
    traceDebugController: { id: "trace" },
    streamDebugTraceController: { id: "stream-trace" },
    pasteObservationRuntimeController: { id: "paste" },
    appCommandUiFacadeController: { id: "command-ui" },
    appLayoutDeckFacadeController: { id: "layout-decks" },
    appRuntimeStateController: { id: "runtime-state" },
    appSessionRuntimeFacadeController: { id: "session-runtime" },
    sessionUiFacadeController: { id: "session-ui" },
    streamAdapter: { id: "stream-adapter" },
    sessionViewModel: { id: "session-view-model" },
    runtimeEventController: { id: "runtime-events" },
    deckRuntimeController: { id: "deck-runtime" },
    commandDiscoveryUsageStore: { id: "discovery" },
    clipboardRuntimeController: { id: "clipboard" },
    trustedLocalClientRuntimeController: { id: "trusted-local" },
    replayViewerRuntimeController: { id: "replay-viewer" },
    replayExportRuntimeController: { id: "replay-export" },
    fileTransferRuntimeController: { id: "file-transfer" },
    layoutRuntimeController: { id: "layout-runtime" },
    terminalSearchController: { id: "search" },
    layoutProfileRuntimeController: { id: "layout-profiles" },
    connectionProfileRuntimeController: { id: "connection-profiles" },
    workspacePresetRuntimeController: { id: "workspace-presets" },
    workspaceManagerRuntimeController: { id: "workspace-manager" },
    sendHistoryRuntimeController: { id: "send-history" },
    broadcastInputRuntimeController: { id: "broadcast" },
    sessionTerminalResizeController: { id: "terminal-resize" },
    sessionQuickSendRuntimeController: { id: "quick-send" },
    createBtn: { id: "create" },
    deckCreateBtn: { id: "deck-create" },
    startupWarmupSkipBtn: { id: "warmup-skip" },
    sendBtn: { id: "send" },
    commandFeedbackActionBtn: { id: "feedback-action" },
    commandGuardSendOnceBtn: { id: "guard-send" },
    commandGuardCancelBtn: { id: "guard-cancel" },
    windowRef: { id: "window" },
    documentRef: { id: "document" },
    wsStateRef: { current: "connected" },
    isReadOnlyMode: () => false,
    getReadOnlyModeMessage: () => "readonly",
    canWriteToSession: () => true,
    getSessionWriteBlockedMessage: () => "blocked",
    showBlockedWriteReclaimUi: () => "reclaim",
    setAccessState: () => "access",
    handleCommandFeedbackAction: () => Promise.resolve("feedback"),
    commandPaletteDialogEl: { id: "palette-dialog" },
    commandPaletteMetaEl: { id: "palette-meta" },
    commandPaletteInputEl: { id: "palette-input" },
    commandPaletteResultsEl: { id: "palette-results" },
    commandPaletteEmptyEl: { id: "palette-empty" },
    commandPaletteCloseBtn: { id: "palette-close" },
    maybeRedirectToCanonicalOrigin: () => false,
    sessionControlRuntimeController: { id: "session-control" },
    startupBackupRuntimeController: { id: "startup-backup" },
    setRuntimeClientId: () => "client-1",
    devAuthRefreshMinDelayMs: 1500,
    devAuthRefreshSafetyMs: 5000,
    devAuthRetryDelayMs: 3000,
    createAppRuntimeStartupHelperAssembly(options) {
      received = options;
      return result;
    }
  });

  assert.equal(composition, result);
  assert.equal(received.store.id, "store");
  assert.equal(received.api.id, "api");
  assert.equal(received.commandInput.id, "command");
  assert.equal(received.terminals.get("s1").id, "terminal");
  assert.equal(received.layoutFoundationStateRef.terminalSettings.cols, 132);
  assert.equal(received.defaultDeckId, "ops");
  assert.equal(received.delayedSubmitMs, 120);
  assert.equal(received.systemSlashCommands[0], "/help");
  assert.equal(received.streamDebugTraceController.id, "stream-trace");
  assert.equal(received.appCommandUiFacadeController.id, "command-ui");
  assert.equal(received.workspaceManagerRuntimeController.id, "workspace-manager");
  assert.equal(received.commandPaletteCloseBtn.id, "palette-close");
  assert.equal(received.sessionControlRuntimeController.id, "session-control");
  assert.equal(received.startupBackupRuntimeController.id, "startup-backup");
  assert.equal(received.devAuthRetryDelayMs, 3000);
});
