import {
  applyTerminalSearchMatch,
  collectTerminalSearchMatches,
  formatTerminalSearchStatus,
  normalizeTerminalSearchQuery
} from "../terminal-search.js";

export function createTerminalSearchController(options = {}) {
  const terminalSearchState = options.terminalSearchState || {
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
  const terminals = options.terminals || new Map();
  const inputEl = options.inputEl || null;
  const prevBtn = options.prevBtn || null;
  const nextBtn = options.nextBtn || null;
  const clearBtn = options.clearBtn || null;
  const statusEl = options.statusEl || null;
  const getActiveSessionId =
    typeof options.getActiveSessionId === "function" ? options.getActiveSessionId : () => "";

  let detachUiHandlers = null;

  function clearSelection(sessionId = terminalSearchState.selectedSessionId) {
    const entry = terminals.get(sessionId);
    if (entry && typeof entry.terminal?.clearSelection === "function") {
      entry.terminal.clearSelection();
    }
    if (terminalSearchState.selectedSessionId === sessionId) {
      terminalSearchState.selectedSessionId = "";
    }
  }

  function updateUi() {
    const query = normalizeTerminalSearchQuery(terminalSearchState.query);
    const hasMatches = terminalSearchState.matches.length > 0;
    const missingActiveSession = Boolean(query) && terminalSearchState.missingActiveSession;
    const statusText = formatTerminalSearchStatus({
      query,
      matches: terminalSearchState.matches,
      activeIndex: terminalSearchState.activeIndex,
      wrapped: terminalSearchState.wrapped,
      direction: terminalSearchState.direction,
      missingActiveSession
    });

    if (inputEl && inputEl.value !== terminalSearchState.query) {
      inputEl.value = terminalSearchState.query;
    }
    if (statusEl) {
      statusEl.textContent = statusText;
    }
    if (prevBtn) {
      prevBtn.disabled = !query || !hasMatches;
    }
    if (nextBtn) {
      nextBtn.disabled = !query || !hasMatches;
    }
    if (clearBtn) {
      clearBtn.disabled = !query;
    }
  }

  function applyActiveSelection() {
    const activeSessionId = terminalSearchState.sessionId;
    const entry = terminals.get(activeSessionId);
    if (!entry || terminalSearchState.matches.length === 0 || terminalSearchState.activeIndex < 0) {
      clearSelection(activeSessionId);
      updateUi();
      return;
    }

    if (terminalSearchState.selectedSessionId && terminalSearchState.selectedSessionId !== activeSessionId) {
      clearSelection(terminalSearchState.selectedSessionId);
    }
    applyTerminalSearchMatch(entry.terminal, terminalSearchState.matches[terminalSearchState.activeIndex]);
    terminalSearchState.selectedSessionId = activeSessionId;
    updateUi();
  }

  function resetState() {
    clearSelection();
    terminalSearchState.sessionId = "";
    terminalSearchState.matches = [];
    terminalSearchState.activeIndex = -1;
    terminalSearchState.revision = -1;
    terminalSearchState.wrapped = false;
    terminalSearchState.direction = "next";
    terminalSearchState.missingActiveSession = false;
  }

  function syncActiveTerminalSearch({ preserveSelection = true } = {}) {
    const query = normalizeTerminalSearchQuery(terminalSearchState.query);
    terminalSearchState.query = query;

    if (!query) {
      resetState();
      updateUi();
      return;
    }

    const activeSessionId = getActiveSessionId() || "";
    if (!activeSessionId) {
      resetState();
      terminalSearchState.query = query;
      terminalSearchState.missingActiveSession = true;
      updateUi();
      return;
    }

    const entry = terminals.get(activeSessionId);
    if (!entry) {
      resetState();
      terminalSearchState.query = query;
      terminalSearchState.sessionId = activeSessionId;
      terminalSearchState.missingActiveSession = true;
      updateUi();
      return;
    }

    const revision = Number.isInteger(entry.searchRevision) ? entry.searchRevision : 0;
    const previousSessionId = terminalSearchState.sessionId;
    const previousMatch =
      preserveSelection &&
      previousSessionId === activeSessionId &&
      terminalSearchState.activeIndex >= 0 &&
      terminalSearchState.matches[terminalSearchState.activeIndex]
        ? terminalSearchState.matches[terminalSearchState.activeIndex]
        : null;
    const matches = collectTerminalSearchMatches(entry.terminal, query);
    let activeIndex = -1;

    if (matches.length > 0) {
      if (previousMatch) {
        activeIndex = matches.findIndex(
          (match) =>
            match.row === previousMatch.row &&
            match.column === previousMatch.column &&
            match.length === previousMatch.length
        );
      }
      if (activeIndex < 0) {
        activeIndex = 0;
      }
    }

    terminalSearchState.query = query;
    terminalSearchState.sessionId = activeSessionId;
    terminalSearchState.matches = matches;
    terminalSearchState.activeIndex = activeIndex;
    terminalSearchState.revision = revision;
    terminalSearchState.wrapped = false;
    terminalSearchState.direction = "next";
    terminalSearchState.missingActiveSession = false;
    applyActiveSelection();
  }

  function navigateActiveTerminalSearch(direction) {
    const normalizedDirection = direction === "previous" ? "previous" : "next";
    const query = normalizeTerminalSearchQuery(terminalSearchState.query);
    if (!query) {
      updateUi();
      return;
    }

    const activeSessionId = getActiveSessionId() || "";
    const entry = terminals.get(activeSessionId);
    if (!entry) {
      terminalSearchState.query = query;
      terminalSearchState.missingActiveSession = true;
      updateUi();
      return;
    }

    const revision = Number.isInteger(entry.searchRevision) ? entry.searchRevision : 0;
    if (
      terminalSearchState.sessionId !== activeSessionId ||
      terminalSearchState.query !== query ||
      terminalSearchState.revision !== revision
    ) {
      syncActiveTerminalSearch({ preserveSelection: true });
    }

    if (terminalSearchState.matches.length === 0) {
      updateUi();
      return;
    }

    let nextIndex = terminalSearchState.activeIndex;
    if (nextIndex < 0) {
      nextIndex = 0;
    } else if (normalizedDirection === "previous") {
      nextIndex -= 1;
    } else {
      nextIndex += 1;
    }

    let wrapped = false;
    if (nextIndex < 0) {
      nextIndex = terminalSearchState.matches.length - 1;
      wrapped = true;
    }
    if (nextIndex >= terminalSearchState.matches.length) {
      nextIndex = 0;
      wrapped = true;
    }

    terminalSearchState.activeIndex = nextIndex;
    terminalSearchState.wrapped = wrapped;
    terminalSearchState.direction = normalizedDirection;
    terminalSearchState.missingActiveSession = false;
    applyActiveSelection();
  }

  function clearQueryAndSync() {
    terminalSearchState.query = "";
    if (inputEl) {
      inputEl.value = "";
    }
    syncActiveTerminalSearch({ preserveSelection: false });
  }

  function bindUiEvents() {
    if (detachUiHandlers) {
      return detachUiHandlers;
    }

    const listeners = [];
    const add = (node, type, handler) => {
      if (!node || typeof node.addEventListener !== "function") {
        return;
      }
      node.addEventListener(type, handler);
      listeners.push(() => {
        if (typeof node.removeEventListener === "function") {
          node.removeEventListener(type, handler);
        }
      });
    };

    add(inputEl, "input", () => {
      terminalSearchState.query = inputEl?.value || "";
      syncActiveTerminalSearch({ preserveSelection: false });
    });
    add(inputEl, "keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        navigateActiveTerminalSearch(event.shiftKey ? "previous" : "next");
      }
      if (event.key === "Escape") {
        event.preventDefault();
        clearQueryAndSync();
      }
    });
    add(prevBtn, "click", () => navigateActiveTerminalSearch("previous"));
    add(nextBtn, "click", () => navigateActiveTerminalSearch("next"));
    add(clearBtn, "click", () => clearQueryAndSync());

    detachUiHandlers = () => {
      for (const detach of listeners.splice(0)) {
        detach();
      }
      detachUiHandlers = null;
    };

    return detachUiHandlers;
  }

  function dispose() {
    if (detachUiHandlers) {
      detachUiHandlers();
    }
  }

  return {
    clearSelection,
    updateUi,
    syncActiveTerminalSearch,
    navigateActiveTerminalSearch,
    bindUiEvents,
    dispose,
    getState() {
      return terminalSearchState;
    }
  };
}
