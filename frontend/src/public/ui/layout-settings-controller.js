function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function createLayoutSettingsController(options = {}) {
  const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
  const gridEl = options.gridEl || null;
  const appShellEl = options.appShellEl || null;
  const sidebarToggleBtn = options.sidebarToggleBtn || null;
  const sidebarToggleIcon = options.sidebarToggleIcon || null;
  const sidebarLauncherBtn = options.sidebarLauncherBtn || null;
  const terminalSearchToggleBtn = options.terminalSearchToggleBtn || null;
  const terminalSearchToggleIcon = options.terminalSearchToggleIcon || null;
  const terminalSearchBodyEl = options.terminalSearchBodyEl || null;
  const settingsColsEl = options.settingsColsEl || null;
  const settingsRowsEl = options.settingsRowsEl || null;
  const settingsPanelToggleBtn = options.settingsPanelToggleBtn || null;
  const settingsPanelToggleIcon = options.settingsPanelToggleIcon || null;
  const settingsPanelBodyEl = options.settingsPanelBodyEl || null;
  const layoutProfileToggleBtn = options.layoutProfileToggleBtn || null;
  const layoutProfileToggleIcon = options.layoutProfileToggleIcon || null;
  const layoutProfileBodyEl = options.layoutProfileBodyEl || null;
  const terminalFontSize = Number(options.terminalFontSize) || 16;
  const terminalLineHeight = Number(options.terminalLineHeight) || 1.2;
  const terminalFontFamily = String(options.terminalFontFamily || "monospace");
  const cardHorizontalChromePx = Number(options.cardHorizontalChromePx) || 6;
  const mountVerticalChromePx = Number(options.mountVerticalChromePx) || 18;
  const SIDEBAR_PANEL_IDS = ["find", "terminalSize", "savedLayouts"];
  const TABLER_ICON_CLASSES = [
    "icon-tabler-caret-left-filled",
    "icon-tabler-caret-right-filled",
    "icon-tabler-caret-down-filled"
  ];

  function normalizeSidebarPanels(sidebarPanels) {
    const source = sidebarPanels && typeof sidebarPanels === "object" && !Array.isArray(sidebarPanels) ? sidebarPanels : {};
    return {
      find: source.find === true,
      terminalSize: source.terminalSize === true,
      savedLayouts: source.savedLayouts === true
    };
  }

  function syncTablerIcon(iconEl, activeIconClass) {
    if (!iconEl?.classList) {
      return;
    }
    iconEl.textContent = "";
    iconEl.classList.add("icon-tabler");
    for (const iconClass of TABLER_ICON_CLASSES) {
      iconEl.classList.toggle(iconClass, iconClass === activeIconClass);
    }
  }

  function syncSidebarPanelSection({ toggleBtn, iconEl, bodyEl, collapsed, label }) {
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggleBtn.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${label}`);
      toggleBtn.setAttribute("title", `${collapsed ? "Expand" : "Collapse"} ${label}`);
    }
    if (bodyEl) {
      bodyEl.hidden = collapsed;
    }
    syncTablerIcon(iconEl, collapsed ? "icon-tabler-caret-right-filled" : "icon-tabler-caret-down-filled");
  }

  function measureTerminalCellWidthPx() {
    if (!documentRef || typeof documentRef.createElement !== "function") {
      return 10;
    }
    const canvas = documentRef.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      return 10;
    }
    context.font = `${terminalFontSize}px ${terminalFontFamily}`;
    const metrics = context.measureText("W");
    const width = Number(metrics.width);
    return Math.max(7, Number.isFinite(width) ? width : 10);
  }

  function computeFixedMountHeightPx(rows) {
    const lineHeightPx = terminalFontSize * terminalLineHeight;
    return Math.max(120, Math.round(rows * lineHeightPx + mountVerticalChromePx));
  }

  function computeFixedCardWidthPx(cols) {
    const cellWidthPx = measureTerminalCellWidthPx();
    // Round once after computing the total terminal width. Rounding each cell up
    // overestimates wide terminals and prevents side-by-side card layouts.
    return Math.max(260, Math.ceil(cols * cellWidthPx + cardHorizontalChromePx));
  }

  function syncTerminalGeometryCss(terminalSettings) {
    if (!documentRef || !documentRef.documentElement) {
      return;
    }
    const root = documentRef.documentElement;
    const cardWidthPx = computeFixedCardWidthPx(terminalSettings.cols);
    const mountHeightPx = computeFixedMountHeightPx(terminalSettings.rows);
    root.style.setProperty("--ptydeck-terminal-card-width", `${cardWidthPx}px`);
    root.style.setProperty("--ptydeck-terminal-mount-height", `${mountHeightPx}px`);
    if (gridEl) {
      gridEl.classList.add("fixed-size");
    }
  }

  function syncSettingsUi(terminalSettings) {
    if (settingsColsEl) {
      settingsColsEl.value = String(terminalSettings.cols);
    }
    if (settingsRowsEl) {
      settingsRowsEl.value = String(terminalSettings.rows);
    }
    const sidebarVisible = terminalSettings.sidebarVisible !== false;
    if (appShellEl && appShellEl.classList) {
      appShellEl.classList.toggle("sidebar-collapsed", !sidebarVisible);
    }
    if (sidebarToggleBtn) {
      sidebarToggleBtn.setAttribute("aria-label", "Collapse sidebar");
      sidebarToggleBtn.setAttribute("title", "Collapse sidebar");
      sidebarToggleBtn.setAttribute("aria-expanded", sidebarVisible ? "true" : "false");
      sidebarToggleBtn.hidden = !sidebarVisible;
    }
    syncTablerIcon(sidebarToggleIcon, "icon-tabler-caret-left-filled");
    if (sidebarLauncherBtn) {
      sidebarLauncherBtn.setAttribute("aria-label", "Expand sidebar");
      sidebarLauncherBtn.setAttribute("title", "Expand sidebar");
      sidebarLauncherBtn.setAttribute("aria-expanded", sidebarVisible ? "true" : "false");
      sidebarLauncherBtn.hidden = sidebarVisible;
    }
    const sidebarPanels = normalizeSidebarPanels(terminalSettings.sidebarPanels);
    syncSidebarPanelSection({
      toggleBtn: terminalSearchToggleBtn,
      iconEl: terminalSearchToggleIcon,
      bodyEl: terminalSearchBodyEl,
      collapsed: sidebarPanels.find,
      label: "Find"
    });
    syncSidebarPanelSection({
      toggleBtn: settingsPanelToggleBtn,
      iconEl: settingsPanelToggleIcon,
      bodyEl: settingsPanelBodyEl,
      collapsed: sidebarPanels.terminalSize,
      label: "Terminal Size"
    });
    syncSidebarPanelSection({
      toggleBtn: layoutProfileToggleBtn,
      iconEl: layoutProfileToggleIcon,
      bodyEl: layoutProfileBodyEl,
      collapsed: sidebarPanels.savedLayouts,
      label: "Saved Layouts"
    });
    syncTerminalGeometryCss(terminalSettings);
  }

  function readSettingsFromUi(terminalSettings) {
    const sidebarPanels = normalizeSidebarPanels(terminalSettings.sidebarPanels);
    return {
      cols: clampInt(settingsColsEl?.value, terminalSettings.cols, 20, 400),
      rows: clampInt(settingsRowsEl?.value, terminalSettings.rows, 5, 120),
      sidebarVisible: terminalSettings.sidebarVisible !== false,
      sidebarPanels
    };
  }

  return {
    computeFixedCardWidthPx,
    computeFixedMountHeightPx,
    normalizeSidebarPanels,
    sidebarPanelIds: SIDEBAR_PANEL_IDS.slice(),
    syncTerminalGeometryCss,
    syncSettingsUi,
    readSettingsFromUi
  };
}
