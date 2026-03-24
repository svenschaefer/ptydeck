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
  const sidebarToggleIcon = { textContent: "" };
  const sidebarLauncherBtn = createEl();
  const settingsColsEl = createEl();
  const settingsRowsEl = createEl();

  const controller = createLayoutSettingsController({
    documentRef,
    gridEl,
    appShellEl,
    sidebarToggleBtn,
    sidebarToggleIcon,
    sidebarLauncherBtn,
    settingsColsEl,
    settingsRowsEl,
    terminalFontSize: 16,
    terminalLineHeight: 1.2,
    terminalFontFamily: "monospace",
    cardHorizontalChromePx: 6,
    mountVerticalChromePx: 18
  });

  controller.syncSettingsUi({ cols: 80, rows: 20, sidebarVisible: true });

  assert.equal(settingsColsEl.value, "80");
  assert.equal(settingsRowsEl.value, "20");
  assert.equal(gridEl.classList.contains("fixed-size"), true);
  assert.equal(sidebarToggleBtn.hidden, false);
  assert.equal(sidebarLauncherBtn.hidden, true);
  assert.equal(sidebarToggleIcon.textContent, "⮜");
  assert.ok(style.get("--ptydeck-terminal-card-width").endsWith("px"));
  assert.ok(style.get("--ptydeck-terminal-mount-height").endsWith("px"));

  settingsColsEl.value = "58";
  settingsRowsEl.value = "40";
  const parsed = controller.readSettingsFromUi({ cols: 80, rows: 20, sidebarVisible: true });
  assert.deepEqual(parsed, { cols: 58, rows: 40, sidebarVisible: true });
});
