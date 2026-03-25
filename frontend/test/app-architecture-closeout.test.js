import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appEntryPath = fileURLToPath(new URL("../src/public/app.js", import.meta.url));
const appRuntimeCompositionPath = fileURLToPath(
  new URL("../src/public/app-runtime-composition-controller.js", import.meta.url)
);

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
    "createAppBootstrapCompositionController",
    "createAppCommandUiFacadeController",
    "createAppLayoutDeckFacadeController",
    "createAppRuntimeStateController",
    "createAppSessionRuntimeFacadeController",
    "createDeckRuntimeController",
    "createRuntimeEventController",
    "createSessionRuntimeController",
    "createSessionViewModel",
    "createLayoutRuntimeController",
    "createSessionGridController",
    "createTerminalSearchController",
    "createDeckActionsController",
    "createDeckSidebarController",
    "createSessionSettingsDialogController",
    "createSessionSettingsStateController",
    "createWorkspaceRenderController",
    "appBootstrapCompositionController.bootstrapUiAndRuntime()",
    "return {\n  initialize,\n  setInitializationError\n};"
  ];

  for (const marker of requiredDelegationMarkers) {
    assert.ok(source.includes(marker), `expected runtime composition marker ${marker}`);
  }
});
