import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appEntryPath = fileURLToPath(new URL("../src/public/app.js", import.meta.url));
const appRuntimeCompositionPath = fileURLToPath(
  new URL("../src/public/app-runtime-composition-controller.js", import.meta.url)
);
const appRuntimeBootstrapAssemblyPath = fileURLToPath(
  new URL("../src/public/app-runtime-bootstrap-assembly.js", import.meta.url)
);
const appRuntimeInitializationAccessCompositionPath = fileURLToPath(
  new URL("../src/public/app-runtime-initialization-access-composition.js", import.meta.url)
);
const appRuntimeAccessControlAssemblyPath = fileURLToPath(
  new URL("../src/public/app-runtime-access-control-assembly.js", import.meta.url)
);
const appRuntimeLayoutFoundationAssemblyPath = fileURLToPath(
  new URL("../src/public/app-runtime-layout-foundation-assembly.js", import.meta.url)
);
const appRuntimeCompositionHelperAssemblyPath = fileURLToPath(
  new URL("../src/public/app-runtime-composition-helper-assembly.js", import.meta.url)
);
const layoutWorkspaceCaptureStatePath = fileURLToPath(
  new URL("../src/public/layout-workspace-capture-state.js", import.meta.url)
);
const layoutWorkspaceRuntimeStatePath = fileURLToPath(
  new URL("../src/public/layout-workspace-runtime-state.js", import.meta.url)
);
const appRuntimeSessionGridActionsPath = fileURLToPath(
  new URL("../src/public/app-runtime-session-grid-actions.js", import.meta.url)
);
const appRuntimeOperatorSupportAssemblyPath = fileURLToPath(
  new URL("../src/public/app-runtime-operator-support-assembly.js", import.meta.url)
);
const appRuntimeRecoveryCompositionPath = fileURLToPath(
  new URL("../src/public/app-runtime-recovery-composition.js", import.meta.url)
);
const appRuntimeSessionAccessAssemblyPath = fileURLToPath(
  new URL("../src/public/app-runtime-session-access-assembly.js", import.meta.url)
);
const appRuntimeSessionSurfaceAssemblyPath = fileURLToPath(
  new URL("../src/public/app-runtime-session-surface-assembly.js", import.meta.url)
);
const appRuntimeStartupCompositionPath = fileURLToPath(
  new URL("../src/public/app-runtime-startup-composition.js", import.meta.url)
);
const sessionGridControllerPath = fileURLToPath(new URL("../src/public/ui/session-grid-controller.js", import.meta.url));
const sessionTerminalRuntimeControllerPath = fileURLToPath(
  new URL("../src/public/ui/session-terminal-runtime-controller.js", import.meta.url)
);
const sessionDisposalControllerPath = fileURLToPath(
  new URL("../src/public/ui/session-disposal-controller.js", import.meta.url)
);
const sessionRuntimeControllerPath = fileURLToPath(new URL("../src/public/session-runtime-controller.js", import.meta.url));

test("app entry stays bootstrap-only and delegates runtime composition", async () => {
  const source = await readFile(appEntryPath, "utf8");
  const trimmedLines = source.trim().split("\n");

  assert.ok(trimmedLines.length <= 12, `expected bootstrap-only app.js, got ${trimmedLines.length} lines`);
  assert.match(
    source,
    /^import { createAppRuntimeCompositionController } from "\.\/app-runtime-composition-controller\.js";$/m
  );
  assert.match(source, /const app = createAppRuntimeCompositionController\(\{/);
  assert.match(source, /windowRef: window,/);
  assert.match(source, /documentRef: document/);
  assert.match(source, /app\.initialize\(\)\.catch\(\(\) => \{/);
  assert.match(source, /app\.setInitializationError\("Failed to initialize application runtime\."\);/);

  const forbiddenInlineMarkers = [
    "document.getElementById(",
    "document.querySelector(",
    "createStore(",
    "createApiClient(",
    "createRuntimeEventController(",
    "createSessionGridController(",
    "createCommandExecutor(",
    "createAppBootstrapCompositionController(",
    "createDeckRuntimeController(",
    "createTerminalSearchController("
  ];

  for (const marker of forbiddenInlineMarkers) {
    assert.equal(source.includes(marker), false, `did not expect inline marker ${marker} in app.js`);
  }
});

test("runtime composition controller owns the delegated runtime assembly contract", async () => {
  const source = await readFile(appRuntimeCompositionPath, "utf8");

  const requiredDelegationMarkers = [
    "createAppRuntimeAccessControlAssembly",
    "createAppRuntimeLayoutFoundationAssembly",
    "createAppRuntimeOperatorSupportAssembly",
    "createAppRuntimeRecoveryComposition",
    "createAppRuntimeSessionSurfaceAssembly",
    "createAppRuntimeSessionGridActions",
    "createAppRuntimeStartupComposition",
    "createSessionRuntimeController",
    "createSessionStreamAuthorityController",
    "createSessionViewModel",
    "initialize: () => appRuntimeInitializationController.initialize(),",
    "setInitializationError: (message) => appRuntimeInitializationController.setInitializationError(message)"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime composition marker ${marker}`);
  }
});

test("runtime layout foundation assembly owns the delegated session facade, layout, and deck runtime contract", async () => {
  const source = await readFile(appRuntimeLayoutFoundationAssemblyPath, "utf8");

  const requiredDelegationMarkers = [
    "createAppSessionRuntimeFacadeController",
    "createLayoutRuntimeController",
    "createDeckRuntimeController",
    "createAppLayoutDeckFacadeController",
    "const stateRef = resolveStateRef(options.stateRef);",
    "stateRef.terminalSettings = layoutRuntimeController.loadTerminalSettings();",
    "stateRef.sessionInputSettings = layoutRuntimeController.loadSessionInputSettings();",
    "getSessionViewModel: () => options.getSessionViewModel?.() || null,",
    "getAppCommandUiFacadeController?.()?.render?.()",
    "clearUiError: () => options.getAppRuntimeStateController?.()?.clearError?.()"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime layout foundation marker ${marker}`);
  }
});

test("runtime session-grid actions own the delegated deck error and reclaim bridge contract", async () => {
  const source = await readFile(appRuntimeSessionGridActionsPath, "utf8");

  const requiredDelegationMarkers = [
    'import { normalizeControlText } from "./session-control-runtime-state.js";',
    "async function onRenameDeck()",
    "async function onDeleteDeck()",
    "async function onSwapDeckSessions(leftSession, rightSession)",
    "async function takeTrustedLocalControl(scope, runtimeOptions)",
    "function confirmForgetSessionControlClient(session, targetClient)",
    "renameDeckFlow",
    "deleteDeckFlow",
    "swapSessionQuickIds",
    "takeControlScope",
    "requestText({",
    "confirmAction({"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime session-grid actions marker ${marker}`);
  }
});

test("runtime initialization/access composition owns the delegated ui-state and session-access contract", async () => {
  const source = await readFile(appRuntimeInitializationAccessCompositionPath, "utf8");

  const requiredDelegationMarkers = [
    "createAppCommandUiFacadeController",
    "createAppRuntimeSessionAccessAssembly",
    "createAppRuntimeStateController",
    "appRuntimeStateController = createAppRuntimeStateController({",
    "appCommandUiFacadeController = createAppCommandUiFacadeController({",
    "const sessionAccessAssembly = createAppRuntimeSessionAccessAssembly({",
    "const getAppRuntimeStateController =",
    "const getAppCommandUiFacadeController ="
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime initialization/access marker ${marker}`);
  }
});

test("runtime access control assembly owns the delegated initialization-access and helper-hook bridge contract", async () => {
  const source = await readFile(appRuntimeAccessControlAssemblyPath, "utf8");

  const requiredDelegationMarkers = [
    "createAppRuntimeCompositionHelperAssembly",
    "createAppRuntimeInitializationAccessComposition",
    "const accessComposition = createAppRuntimeInitializationAccessComposition(",
    "createAppRuntimeCompositionHelperAssembly({",
    "sessionControlRuntimeController,",
    "}).installTestHooks();",
    "return accessComposition;"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime access control marker ${marker}`);
  }
});

test("runtime composition helper assembly owns the delegated test-hook and collaborator bridge contract", async () => {
  const source = await readFile(appRuntimeCompositionHelperAssemblyPath, "utf8");

  const requiredDelegationMarkers = [
    "export function createAppRuntimeCompositionHelperAssembly(options = {}) {",
    "function setCollaborators(overrides = {}) {",
    "Object.assign(testHooks, {",
    "setTrustedLocalClientLabel(label) {",
    "setSessionsForTest(sessions) {",
    "setCommandFeedbackActionSessionId(sessionId) {",
    "sessionControlRuntimeController.setCommandFeedbackActionMeta(meta);",
    "setCollaborators"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime composition helper marker ${marker}`);
  }
});

test("layout workspace runtime state owns the delegated split-layout snapshot and workspace capture contract", async () => {
  const captureSource = await readFile(layoutWorkspaceCaptureStatePath, "utf8");
  const source = await readFile(layoutWorkspaceRuntimeStatePath, "utf8");

  const requiredCaptureMarkers = [
    'import { normalizeLayoutControlPaneState } from "./layout-runtime-state.js";',
    'import { cloneDeckSplitLayoutMap } from "./split-layout-state.js";',
    "export function serializeSplitLayoutRoot(root) {",
    "export function cloneWorkspaceState(workspace) {",
    "export function captureCurrentWorkspace(options = {}) {",
    "export function captureLayoutProfileSnapshot(options = {}) {"
  ];

  for (const marker of requiredCaptureMarkers) {
    assert.ok(captureSource.includes(marker), `expected layout workspace capture marker ${marker}`);
  }

  const requiredDelegationMarkers = [
    'from "./layout-workspace-capture-state.js";',
    "export function resolveWorkspaceDeckSessions(deckId, deckSessions, deckGroups) {",
    "export function captureCurrentVisibleDeckSessions(options = {}) {",
    "export function formatWorkspacePresetDetail(preset) {"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected layout workspace runtime state marker ${marker}`);
  }
});

test("runtime operator support assembly owns the delegated workspace, trusted-local, paste, and broadcast composition contract", async () => {
  const source = await readFile(appRuntimeOperatorSupportAssemblyPath, "utf8");

  const requiredDelegationMarkers = [
    "createWorkspaceManagerRuntimeController",
    "createSendHistoryRuntimeController",
    "createAppRuntimeTrustedLocalComposition",
    "createPasteObservationRuntimeController",
    "createBroadcastInputRuntimeController",
    "const workspaceManagerRuntimeController = createWorkspaceManagerRuntimeController({",
    "const sendHistoryRuntimeController = createSendHistoryRuntimeController({",
    "} = createAppRuntimeTrustedLocalComposition({",
    "const pasteObservationRuntimeController = createPasteObservationRuntimeController({",
    "const broadcastInputRuntimeController = createBroadcastInputRuntimeController({"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime operator support marker ${marker}`);
  }
});

test("runtime recovery composition owns the delegated runtime-event recovery contract", async () => {
  const source = await readFile(appRuntimeRecoveryCompositionPath, "utf8");

  const requiredDelegationMarkers = [
    "createRuntimeEventController",
    "const runtimeEventController = createRuntimeEventController({",
    "setSessions: (sessions) => {",
    "upsertSession: (session) => {",
    "Promise.resolve(maybeAutoRepairOriginHandoffControl()).catch(() => {});",
    'traceDebugController.record("terminal.input.error", payload);',
    'debugLog("terminal.input.error", payload);'
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime recovery marker ${marker}`);
  }
});

test("runtime session access assembly owns the delegated session-control and quick-send composition contract", async () => {
  const source = await readFile(appRuntimeSessionAccessAssemblyPath, "utf8");

  const requiredDelegationMarkers = [
    "createSessionControlRuntimeController",
    "createSessionQuickSendRuntimeController",
    "const sessionControlRuntimeController = createSessionControlRuntimeController({",
    "const sessionQuickSendRuntimeController = createSessionQuickSendRuntimeController({",
    "function handleCommandFeedbackAction()",
    "return sessionControlRuntimeController.handleCommandFeedbackAction(uiState.commandFeedbackActionSessionId);"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime session access marker ${marker}`);
  }
});

test("runtime session surface assembly owns the delegated session/grid/operator surface contract", async () => {
  const source = await readFile(appRuntimeSessionSurfaceAssemblyPath, "utf8");

  const requiredDelegationMarkers = [
    "createSessionCardFactoryController",
    "createSessionSettingsStateController",
    "createSessionTerminalResizeController",
    "createSessionTerminalRuntimeController",
    "createWorkspaceRenderController",
    "createReplayViewerRuntimeController",
    "createTerminalSearchController",
    "createDeckActionsController",
    "createDeckSidebarController",
    "createSessionGridController",
    "const sessionCardFactoryController = createSessionCardFactoryController({",
    "const sessionTerminalRuntimeController = createSessionTerminalRuntimeController({",
    "const workspaceRenderController = createWorkspaceRenderController({",
    "const sessionGridController = createSessionGridController({",
    "return {",
    "sessionGridController"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime session surface marker ${marker}`);
  }
});

test("runtime bootstrap assembly owns the delegated bootstrap controller contract", async () => {
  const source = await readFile(appRuntimeBootstrapAssemblyPath, "utf8");

  const requiredDelegationMarkers = [
    "createAppBootstrapCompositionController",
    "const appBootstrapCompositionController = createAppBootstrapCompositionController({",
    "interpretRuntimeEvent: (event) =>",
    "streamInterpretationPluginEngine.interpretRuntimeEvent(event, {",
    'streamDebugTraceController.record(sessionId, "ws.session.data", {',
    "const composedControllers = appBootstrapCompositionController.composeControllers?.() || {};"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime bootstrap assembly marker ${marker}`);
  }
});

test("runtime startup composition owns the delegated workflow, palette, and initialization contract", async () => {
  const source = await readFile(appRuntimeStartupCompositionPath, "utf8");

  const requiredDelegationMarkers = [
    "createAppRuntimeBootstrapAssembly",
    "createSlashWorkflowRuntimeController",
    "createCommandPaletteRuntimeController",
    "createAppRuntimeInitializationController",
    "const slashWorkflowRuntimeController = createSlashWorkflowRuntimeController({",
    "const bootstrapComposition = createAppRuntimeBootstrapAssembly({",
    "const commandPaletteRuntimeController = createCommandPaletteRuntimeController({",
    "const appRuntimeInitializationController = createAppRuntimeInitializationController({",
    "bootstrapUiAndRuntime: () => appBootstrapCompositionController?.bootstrapUiAndRuntime?.()",
    "slashWorkflowRuntimeController,"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime startup composition marker ${marker}`);
  }
});

test("ui controllers consume explicit runtime contracts instead of stream internals", async () => {
  const [sessionGridSource, sessionTerminalRuntimeSource, sessionDisposalSource, sessionRuntimeSource] = await Promise.all([
    readFile(sessionGridControllerPath, "utf8"),
    readFile(sessionTerminalRuntimeControllerPath, "utf8"),
    readFile(sessionDisposalControllerPath, "utf8"),
    readFile(sessionRuntimeControllerPath, "utf8")
  ]);

  const forbiddenUiMarkers = ["streamPluginEngine", "streamAdapter"];
  for (const source of [sessionGridSource, sessionTerminalRuntimeSource, sessionDisposalSource]) {
    for (const marker of forbiddenUiMarkers) {
      assert.equal(source.includes(marker), false, `did not expect UI marker ${marker}`);
    }
  }

  assert.match(sessionGridSource, /const onSessionDisposed = options\.onSessionDisposed \|\| \(\(\) => \{\}\);/);
  assert.match(sessionGridSource, /const onSessionMounted = options\.onSessionMounted \|\| \(\(\) => \{\}\);/);
  assert.match(sessionTerminalRuntimeSource, /const onSessionMounted = args\.onSessionMounted \|\| \(\(\) => \{\}\);/);
  assert.match(sessionDisposalSource, /const onSessionDisposed = args\.onSessionDisposed \|\| \(\(\) => \{\}\);/);
  assert.match(sessionRuntimeSource, /function ensureSessionRuntime\(session\)/);
  assert.match(sessionRuntimeSource, /function disposeSessionRuntime\(sessionId\)/);
});
