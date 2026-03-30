export function createSessionTerminalResizeController(options = {}) {
  const windowRef = options.windowRef || globalThis;
  const terminals = options.terminals;
  const resizeTimers = options.resizeTimers;
  const terminalSizes = options.terminalSizes;
  const getSessionById = options.getSessionById || (() => null);
  const resolveSessionDeckId = options.resolveSessionDeckId || (() => "");
  const getSessionTerminalGeometry = options.getSessionTerminalGeometry || (() => ({ cols: 80, rows: 24 }));
  const isSessionActionBlocked = options.isSessionActionBlocked || (() => false);
  const computeFixedMountHeightPx = options.computeFixedMountHeightPx || (() => 120);
  const computeFixedCardWidthPx = options.computeFixedCardWidthPx || (() => 260);
  const getTerminalCellHeightPx = options.getTerminalCellHeightPx || (() => 0);
  const getTerminalCellWidthPx = options.getTerminalCellWidthPx || (() => 0);
  const terminalCardHorizontalChromePx = Number(options.terminalCardHorizontalChromePx) || 0;
  const terminalMountVerticalChromePx = Number(options.terminalMountVerticalChromePx) || 0;
  const debugLog = options.debugLog || (() => {});
  const api = options.api;

  let globalResizeTimer = null;
  let deferredResizeTimer = null;

  function clearTimer(timer) {
    if (!timer) {
      return;
    }
    if (typeof windowRef.clearTimeout === "function") {
      windowRef.clearTimeout(timer);
      return;
    }
    clearTimeout(timer);
  }

  function scheduleTimer(callback, delay) {
    if (typeof windowRef.setTimeout === "function") {
      return windowRef.setTimeout(callback, delay);
    }
    return setTimeout(callback, delay);
  }

  function applyMountHeight(entry, cols, rows) {
    if (!entry || !entry.mount) {
      return;
    }
    let mountHeightPx = computeFixedMountHeightPx(rows);
    let cardWidthPx = computeFixedCardWidthPx(cols);
    const runtimeCellWidthPx = getTerminalCellWidthPx(entry?.terminal);
    if (runtimeCellWidthPx > 0) {
      cardWidthPx = Math.max(260, Math.ceil(cols * runtimeCellWidthPx + terminalCardHorizontalChromePx));
    }
    const mountWidthPx = Math.max(220, cardWidthPx - terminalCardHorizontalChromePx);
    const runtimeCellHeightPx = getTerminalCellHeightPx(entry?.terminal);
    if (runtimeCellHeightPx > 0) {
      const runtimeMountHeightPx = Math.max(120, Math.ceil(rows * runtimeCellHeightPx + terminalMountVerticalChromePx));
      mountHeightPx = Math.max(mountHeightPx, runtimeMountHeightPx);
    }
    entry.mount.style.height = `${mountHeightPx}px`;
    entry.mount.style.width = `${mountWidthPx}px`;
    if (entry.element?.style) {
      entry.element.style.width = `${cardWidthPx}px`;
    }
  }

  function computeTerminalSize(entry, session) {
    if (!entry || !entry.mount || entry.mount.clientWidth < 40 || entry.mount.clientHeight < 40) {
      return null;
    }
    const geometry = getSessionTerminalGeometry(session);
    return {
      cols: geometry.cols,
      rows: geometry.rows
    };
  }

  function applyResizeForSession(sessionId, options = {}) {
    const entry = terminals.get(sessionId);
    if (!entry) {
      return;
    }
    const session = getSessionById(sessionId);
    if (isSessionActionBlocked(session)) {
      const pendingTimer = resizeTimers.get(sessionId);
      if (pendingTimer) {
        clearTimer(pendingTimer);
        resizeTimers.delete(sessionId);
      }
      return;
    }

    const size = computeTerminalSize(entry, session);
    if (!size) {
      return;
    }

    const { cols, rows } = size;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) {
      return;
    }

    applyMountHeight(entry, cols, rows);

    const previous = terminalSizes.get(sessionId);
    if (!options.force && previous && previous.cols === cols && previous.rows === rows) {
      return;
    }

    terminalSizes.set(sessionId, { cols, rows });
    entry.terminal.resize(cols, rows);
    debugLog("terminal.resize.local", { sessionId, cols, rows });

    const pendingTimer = resizeTimers.get(sessionId);
    if (pendingTimer) {
      clearTimer(pendingTimer);
    }

    const timer = scheduleTimer(() => {
      debugLog("terminal.resize.remote.start", { sessionId, cols, rows });
      api?.resizeSession?.(sessionId, cols, rows).catch(() => {
        debugLog("terminal.resize.remote.error", { sessionId, cols, rows });
      });
    }, 180);
    resizeTimers.set(sessionId, timer);
  }

  function applySettingsToAllTerminals(options = {}) {
    const deckIdFilter = String(options.deckId || "").trim();
    const force = options.force !== false;
    for (const sessionId of terminals.keys()) {
      if (deckIdFilter) {
        const session = getSessionById(sessionId);
        if (session && resolveSessionDeckId(session) !== deckIdFilter) {
          continue;
        }
      }
      applyResizeForSession(sessionId, { force });
    }
  }

  function scheduleGlobalResize(options = {}) {
    const deckIdFilter = String(options.deckId || "").trim();
    const force = options.force === true;
    if (globalResizeTimer) {
      clearTimer(globalResizeTimer);
    }
    globalResizeTimer = scheduleTimer(() => {
      globalResizeTimer = null;
      for (const sessionId of terminals.keys()) {
        if (deckIdFilter) {
          const session = getSessionById(sessionId);
          if (session && resolveSessionDeckId(session) !== deckIdFilter) {
            continue;
          }
        }
        applyResizeForSession(sessionId, force ? { force: true } : undefined);
      }
    }, 120);
    return globalResizeTimer;
  }

  function scheduleDeferredResizePasses(options = {}) {
    const deckIdFilter = String(options.deckId || "").trim();
    const force = options.force === true;
    if (deferredResizeTimer) {
      clearTimer(deferredResizeTimer);
    }
    const delays = [250, 700, 1400];
    let index = 0;
    function runNext() {
      scheduleGlobalResize(deckIdFilter ? { deckId: deckIdFilter, force } : force ? { force: true } : {});
      index += 1;
      if (index < delays.length) {
        deferredResizeTimer = scheduleTimer(runNext, delays[index]);
      } else {
        deferredResizeTimer = null;
      }
    }
    deferredResizeTimer = scheduleTimer(runNext, delays[index]);
    return deferredResizeTimer;
  }

  function dispose() {
    if (globalResizeTimer) {
      clearTimer(globalResizeTimer);
      globalResizeTimer = null;
    }
    if (deferredResizeTimer) {
      clearTimer(deferredResizeTimer);
      deferredResizeTimer = null;
    }
    for (const timer of resizeTimers.values()) {
      clearTimer(timer);
    }
  }

  return {
    applyResizeForSession,
    applySettingsToAllTerminals,
    scheduleGlobalResize,
    scheduleDeferredResizePasses,
    dispose
  };
}
