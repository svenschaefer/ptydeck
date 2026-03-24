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
  const settingsColsEl = options.settingsColsEl || null;
  const settingsRowsEl = options.settingsRowsEl || null;
  const terminalFontSize = Number(options.terminalFontSize) || 16;
  const terminalLineHeight = Number(options.terminalLineHeight) || 1.2;
  const terminalFontFamily = String(options.terminalFontFamily || "monospace");
  const cardHorizontalChromePx = Number(options.cardHorizontalChromePx) || 6;
  const mountVerticalChromePx = Number(options.mountVerticalChromePx) || 18;

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
    return Math.max(7, Math.ceil(metrics.width));
  }

  function computeFixedMountHeightPx(rows) {
    const lineHeightPx = terminalFontSize * terminalLineHeight;
    return Math.max(120, Math.round(rows * lineHeightPx + mountVerticalChromePx));
  }

  function computeFixedCardWidthPx(cols) {
    const cellWidthPx = measureTerminalCellWidthPx();
    return Math.max(260, Math.round(cols * cellWidthPx + cardHorizontalChromePx));
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
    if (sidebarToggleIcon) {
      sidebarToggleIcon.textContent = "⮜";
    }
    if (sidebarLauncherBtn) {
      sidebarLauncherBtn.setAttribute("aria-label", "Expand sidebar");
      sidebarLauncherBtn.setAttribute("title", "Expand sidebar");
      sidebarLauncherBtn.setAttribute("aria-expanded", sidebarVisible ? "true" : "false");
      sidebarLauncherBtn.hidden = sidebarVisible;
    }
    syncTerminalGeometryCss(terminalSettings);
  }

  function readSettingsFromUi(terminalSettings) {
    return {
      cols: clampInt(settingsColsEl?.value, terminalSettings.cols, 20, 400),
      rows: clampInt(settingsRowsEl?.value, terminalSettings.rows, 5, 120),
      sidebarVisible: terminalSettings.sidebarVisible !== false
    };
  }

  return {
    computeFixedCardWidthPx,
    computeFixedMountHeightPx,
    syncTerminalGeometryCss,
    syncSettingsUi,
    readSettingsFromUi
  };
}
