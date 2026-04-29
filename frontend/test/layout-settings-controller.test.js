import test from "node:test";
import assert from "node:assert/strict";

import { createLayoutSettingsController } from "../src/public/ui/layout-settings-controller.js";

class ClassList {
  constructor() {
    this.values = new Set();
  }
  add(value) {
    this.values.add(String(value));
  }
  toggle(value, force) {
    const key = String(value);
    if (force === true) {
      this.values.add(key);
      return;
    }
    if (force === false) {
      this.values.delete(key);
      return;
    }
    if (this.values.has(key)) {
      this.values.delete(key);
      return;
    }
    this.values.add(key);
  }
  contains(value) {
    return this.values.has(String(value));
  }
}

function createEl() {
  return {
    classList: new ClassList(),
    hidden: false,
    value: "",
    attrs: new Map(),
    setAttribute(name, value) {
      this.attrs.set(String(name), String(value));
    },
    getAttribute(name) {
      return this.attrs.get(String(name));
    }
  };
}

test("layout-settings controller syncs UI and CSS geometry", () => {
  const style = new Map();
  const documentRef = {
    createElement(tag) {
      if (tag !== "canvas") {
        return {};
      }
      return {
        getContext() {
          return {
            font: "",
            measureText() {
              return { width: 9.2 };
            }
          };
        }
      };
    },
    documentElement: {
      style: {
        setProperty(name, value) {
          style.set(String(name), String(value));
        }
      }
    }
  };

  const gridEl = { classList: new ClassList() };
  const appShellEl = { classList: new ClassList() };
  const sidebarToggleBtn = createEl();
  const sidebarToggleIcon = createEl();
  const sidebarLauncherBtn = createEl();
  const terminalSearchToggleBtn = createEl();
  const terminalSearchToggleIcon = createEl();
  const terminalSearchBodyEl = createEl();
  const settingsColsEl = createEl();
  const settingsRowsEl = createEl();
  const settingsPanelToggleBtn = createEl();
  const settingsPanelToggleIcon = createEl();
  const settingsPanelBodyEl = createEl();
  const layoutProfileToggleBtn = createEl();
  const layoutProfileToggleIcon = createEl();
  const layoutProfileBodyEl = createEl();

  const controller = createLayoutSettingsController({
    documentRef,
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
    terminalFontSize: 16,
    terminalLineHeight: 1.2,
    terminalFontFamily: "monospace",
    cardHorizontalChromePx: 6,
    mountVerticalChromePx: 18
  });

  controller.syncSettingsUi({
    cols: 80,
    rows: 20,
    sidebarVisible: true,
    sidebarPanels: {
      find: false,
      terminalSize: true,
      savedLayouts: false
    }
  });

  assert.equal(settingsColsEl.value, "80");
  assert.equal(settingsRowsEl.value, "20");
  assert.equal(gridEl.classList.contains("fixed-size"), true);
  assert.equal(sidebarToggleBtn.hidden, false);
  assert.equal(sidebarLauncherBtn.hidden, true);
  assert.equal(sidebarToggleIcon.textContent, "");
  assert.equal(sidebarToggleIcon.classList.contains("icon-tabler"), true);
  assert.equal(sidebarToggleIcon.classList.contains("icon-tabler-caret-left-filled"), true);
  assert.equal(terminalSearchToggleBtn.getAttribute("aria-expanded"), "true");
  assert.equal(terminalSearchBodyEl.hidden, false);
  assert.equal(terminalSearchToggleIcon.classList.contains("icon-tabler-caret-down-filled"), true);
  assert.equal(settingsPanelToggleBtn.getAttribute("aria-expanded"), "false");
  assert.equal(settingsPanelBodyEl.hidden, true);
  assert.equal(settingsPanelToggleIcon.classList.contains("icon-tabler-caret-right-filled"), true);
  assert.equal(layoutProfileToggleBtn.getAttribute("aria-expanded"), "true");
  assert.equal(layoutProfileBodyEl.hidden, false);
  assert.equal(style.get("--ptydeck-terminal-card-width"), "742px");
  assert.equal(style.get("--ptydeck-terminal-mount-height"), "402px");

  settingsColsEl.value = "58";
  settingsRowsEl.value = "40";
  const parsed = controller.readSettingsFromUi({
    cols: 80,
    rows: 20,
    sidebarVisible: true,
    sidebarPanels: {
      find: true,
      terminalSize: false,
      savedLayouts: true
    }
  });
  assert.deepEqual(parsed, {
    cols: 58,
    rows: 40,
    sidebarVisible: true,
    sidebarPanels: {
      find: true,
      terminalSize: false,
      savedLayouts: true
    }
  });
});

test("layout-settings controller clamps invalid values and degrades safely without measurement primitives", () => {
  const settingsColsEl = createEl();
  const settingsRowsEl = createEl();
  const appShellEl = { classList: new ClassList() };
  const sidebarToggleBtn = createEl();
  const sidebarLauncherBtn = createEl();
  const controller = createLayoutSettingsController({
    documentRef: {
      createElement() {
        return {
          getContext() {
            return null;
          }
        };
      },
      documentElement: {
        style: {
          setProperty() {}
        }
      }
    },
    appShellEl,
    sidebarToggleBtn,
    sidebarLauncherBtn,
    settingsColsEl,
    settingsRowsEl
  });

  controller.syncSettingsUi({
    cols: 80,
    rows: 24,
    sidebarVisible: false,
    sidebarPanels: null
  });

  settingsColsEl.value = "999";
  settingsRowsEl.value = "bad";

  assert.deepEqual(controller.sidebarPanelIds, ["find", "terminalSize", "savedLayouts"]);
  assert.equal(appShellEl.classList.contains("sidebar-collapsed"), true);
  assert.equal(sidebarToggleBtn.hidden, true);
  assert.equal(sidebarLauncherBtn.hidden, false);
  assert.equal(controller.computeFixedCardWidthPx(10), 260);
  assert.equal(controller.computeFixedMountHeightPx(1), 120);
  assert.deepEqual(
    controller.readSettingsFromUi({
      cols: 80,
      rows: 24,
      sidebarVisible: false,
      sidebarPanels: ["bad"]
    }),
    {
      cols: 400,
      rows: 24,
      sidebarVisible: false,
      sidebarPanels: {
        find: false,
        terminalSize: false,
        savedLayouts: false
      }
    }
  );

  assert.doesNotThrow(() =>
    createLayoutSettingsController({ documentRef: null }).syncTerminalGeometryCss({
      cols: 80,
      rows: 24
    })
  );
});
