import { createSlashCommandSchema } from "./command-schema.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function splitQueryTokens(query) {
  return normalizeLower(query).split(/\s+/).filter(Boolean);
}

function getPrimaryUsage(definition) {
  const usage = Array.isArray(definition?.usage) ? definition.usage.find((entry) => normalizeText(entry)) : "";
  return normalizeText(usage) || `/${normalizeText(definition?.insertText)}`;
}

function joinSearchParts(parts = []) {
  return parts.map((entry) => normalizeText(entry)).filter(Boolean).join(" ");
}

function createCommandEntry(definition, index) {
  const usage = Array.isArray(definition?.usage) ? definition.usage.map((entry) => normalizeText(entry)).filter(Boolean) : [];
  return Object.freeze({
    key: normalizeText(definition?.key) || `palette-command:${index}`,
    group: "commands",
    kind: normalizeText(definition?.kind) || "command",
    order: index,
    title: normalizeText(definition?.label) || `/${normalizeText(definition?.insertText)}`,
    subtitle: normalizeText(definition?.description) || "Slash command",
    detail: usage.join(" | "),
    commandText: getPrimaryUsage(definition),
    searchText: joinSearchParts([
      definition?.label,
      definition?.description,
      definition?.summary,
      definition?.example,
      usage.join(" ")
    ])
  });
}

function createCustomCommandEntry(command, index) {
  const name = normalizeLower(command?.name);
  if (!name) {
    return null;
  }
  const content = typeof command?.content === "string" ? command.content.trim() : "";
  return Object.freeze({
    key: `palette-custom:${name}`,
    group: "commands",
    kind: "custom-command",
    order: 10_000 + index,
    title: `/${name}`,
    subtitle: "Saved custom command",
    detail: content,
    commandText: `/${name}`,
    searchText: joinSearchParts([`/${name}`, content, "custom command saved command"])
  });
}

function buildSessionSortTuple(session, activeSessionId, activeDeckId, formatSessionToken, formatSessionDisplayName) {
  const token = normalizeText(formatSessionToken(session?.id));
  const label = normalizeText(formatSessionDisplayName(session));
  const deckId = normalizeText(session?.deckId);
  const activeRank = session?.id === activeSessionId ? 0 : deckId && deckId === activeDeckId ? 1 : 2;
  return [activeRank, normalizeLower(token), normalizeLower(label), normalizeLower(deckId), normalizeLower(session?.id)];
}

function compareSortTuples(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === rightValue) {
      continue;
    }
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return leftValue - rightValue;
    }
    return String(leftValue || "").localeCompare(String(rightValue || ""), "en-US", { sensitivity: "base" });
  }
  return 0;
}

function createSessionEntry(session, options = {}) {
  if (!session?.id) {
    return null;
  }
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (entry) => String(entry?.name || entry?.id || "");
  const activeSessionId = normalizeText(options.activeSessionId);
  const activeDeckId = normalizeText(options.activeDeckId);
  const token = normalizeText(formatSessionToken(session.id)) || normalizeText(session.id).slice(0, 8);
  const displayName = normalizeText(formatSessionDisplayName(session)) || normalizeText(session.id).slice(0, 8);
  const deckId = normalizeText(session.deckId);
  const subtitleParts = [];
  if (session.id === activeSessionId) {
    subtitleParts.push("Active session");
  }
  if (deckId) {
    subtitleParts.push(deckId === activeDeckId ? `Active deck (${deckId})` : `Deck ${deckId}`);
  }
  const tags = Array.isArray(session?.tags) ? session.tags.map((entry) => normalizeText(entry)).filter(Boolean) : [];
  return Object.freeze({
    key: `palette-session:${session.id}`,
    group: "sessions",
    kind: "session",
    order: 20_000,
    sortTuple: buildSessionSortTuple(session, activeSessionId, activeDeckId, formatSessionToken, formatSessionDisplayName),
    title: `[${token}] ${displayName}`,
    subtitle: subtitleParts.join(" · ") || "Session",
    detail: tags.length > 0 ? `Tags: ${tags.join(", ")}` : normalizeText(session?.cwd),
    searchText: joinSearchParts([token, displayName, session.id, deckId, tags.join(" "), session?.cwd]),
    session
  });
}

function buildDeckSortTuple(deck, activeDeckId) {
  return [deck?.id === activeDeckId ? 0 : 1, normalizeLower(deck?.name), normalizeLower(deck?.id)];
}

function createDeckEntry(deck, options = {}) {
  if (!deck?.id) {
    return null;
  }
  const activeDeckId = normalizeText(options.activeDeckId);
  return Object.freeze({
    key: `palette-deck:${deck.id}`,
    group: "decks",
    kind: "deck",
    order: 30_000,
    sortTuple: buildDeckSortTuple(deck, activeDeckId),
    title: `[${normalizeText(deck.id)}] ${normalizeText(deck.name) || normalizeText(deck.id)}`,
    subtitle: deck.id === activeDeckId ? "Active deck" : "Deck",
    detail: "",
    searchText: joinSearchParts([deck.id, deck.name, "deck"]),
    deck
  });
}

export function buildCommandPaletteEntries(options = {}) {
  const systemSlashCommands = Array.isArray(options.systemSlashCommands) ? options.systemSlashCommands : [];
  const customCommands = Array.isArray(options.customCommands) ? options.customCommands : [];
  const sessions = Array.isArray(options.sessions) ? options.sessions : [];
  const decks = Array.isArray(options.decks) ? options.decks : [];
  const activeSessionId = normalizeText(options.activeSessionId);
  const activeDeckId = normalizeText(options.activeDeckId);
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "");

  const commandEntries = createSlashCommandSchema(systemSlashCommands).map((entry, index) => createCommandEntry(entry, index));
  const customEntries = customCommands
    .slice()
    .sort((left, right) => normalizeLower(left?.name).localeCompare(normalizeLower(right?.name), "en-US", { sensitivity: "base" }))
    .map((entry, index) => createCustomCommandEntry(entry, index))
    .filter(Boolean);
  const sessionEntries = sessions
    .map((session) =>
      createSessionEntry(session, {
        activeSessionId,
        activeDeckId,
        formatSessionToken,
        formatSessionDisplayName
      })
    )
    .filter(Boolean)
    .sort((left, right) => compareSortTuples(left.sortTuple || [], right.sortTuple || []));
  const deckEntries = decks
    .map((deck) => createDeckEntry(deck, { activeDeckId }))
    .filter(Boolean)
    .sort((left, right) => compareSortTuples(left.sortTuple || [], right.sortTuple || []));

  return Object.freeze([...commandEntries, ...customEntries, ...sessionEntries, ...deckEntries]);
}

export function filterCommandPaletteEntries(entries = [], query = "") {
  const tokens = splitQueryTokens(query);
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  if (tokens.length === 0) {
    return normalizedEntries.slice();
  }
  return normalizedEntries.filter((entry) => {
    const haystack = normalizeLower(entry?.searchText || entry?.title || "");
    return tokens.every((token) => haystack.includes(token));
  });
}

function setDialogOpen(dialogEl, open) {
  if (!dialogEl) {
    return;
  }
  if (open) {
    if (typeof dialogEl.showModal === "function") {
      if (!dialogEl.open) {
        dialogEl.showModal();
      }
    } else {
      dialogEl.open = true;
      dialogEl.classList?.add?.("open");
    }
    return;
  }
  if (typeof dialogEl.close === "function") {
    if (dialogEl.open) {
      dialogEl.close();
    }
  } else {
    dialogEl.open = false;
    dialogEl.classList?.remove?.("open");
  }
}

function removeAllChildren(node) {
  if (!node) {
    return;
  }
  if (typeof node.replaceChildren === "function") {
    node.replaceChildren();
    return;
  }
  if (!Array.isArray(node.children)) {
    node.textContent = "";
    return;
  }
  while (node.children.length > 0) {
    const child = node.children[node.children.length - 1];
    if (typeof node.removeChild === "function") {
      node.removeChild(child);
    } else {
      node.children.pop();
    }
  }
  node.textContent = "";
}

function focusAndMoveCaretToEnd(inputEl) {
  if (!inputEl) {
    return;
  }
  const value = String(inputEl.value || "");
  inputEl.focus?.();
  if (typeof inputEl.setSelectionRange === "function") {
    inputEl.setSelectionRange(value.length, value.length);
    return;
  }
  inputEl.selectionStart = value.length;
  inputEl.selectionEnd = value.length;
}

function isPaletteShortcut(event) {
  const key = normalizeLower(event?.key);
  return key === "k" && (event?.metaKey === true || event?.ctrlKey === true) && event?.altKey !== true;
}

function createDefaultSearchInputSync({ commandInput, documentRef, windowRef } = {}) {
  return (value) => {
    if (!commandInput) {
      return;
    }
    commandInput.value = String(value || "");
    focusAndMoveCaretToEnd(commandInput);
    const EventCtor = windowRef?.Event || globalThis.Event;
    if (typeof commandInput.dispatchEvent === "function" && typeof EventCtor === "function") {
      commandInput.dispatchEvent(new EventCtor("input", { bubbles: true }));
      return;
    }
    if (typeof commandInput.dispatchEvent === "function") {
      commandInput.dispatchEvent({ type: "input" });
    }
  };
}

export function createCommandPaletteRuntimeController(options = {}) {
  const windowRef = options.windowRef || globalThis.window || globalThis;
  const documentRef = options.documentRef || globalThis.document || null;
  const dialogEl = options.dialogEl || null;
  const searchInputEl = options.searchInputEl || null;
  const resultsEl = options.resultsEl || null;
  const emptyEl = options.emptyEl || null;
  const metaEl = options.metaEl || null;
  const closeBtn = options.closeBtn || null;
  const commandInput = options.commandInput || null;
  const systemSlashCommands = Array.isArray(options.systemSlashCommands) ? options.systemSlashCommands : [];
  const getState = typeof options.getState === "function" ? options.getState : () => ({ sessions: [], decks: [] });
  const listCustomCommands = typeof options.listCustomCommands === "function" ? options.listCustomCommands : () => [];
  const formatSessionToken =
    typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => String(sessionId || "");
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function"
      ? options.formatSessionDisplayName
      : (session) => String(session?.name || session?.id || "");
  const activateSessionTarget =
    typeof options.activateSessionTarget === "function" ? options.activateSessionTarget : () => ({ ok: false, message: "" });
  const activateDeckTarget =
    typeof options.activateDeckTarget === "function" ? options.activateDeckTarget : () => ({ ok: false, message: "" });
  const setCommandFeedback = typeof options.setCommandFeedback === "function" ? options.setCommandFeedback : () => {};
  const setComposerValue =
    typeof options.setComposerValue === "function"
      ? options.setComposerValue
      : createDefaultSearchInputSync({ commandInput, documentRef, windowRef });

  let paletteEntries = [];
  let visibleEntries = [];
  let selectedIndex = 0;
  let searchListener = null;
  let searchKeydownListener = null;
  let closeListener = null;
  let windowKeydownListener = null;

  function clampSelectedIndex() {
    if (visibleEntries.length === 0) {
      selectedIndex = -1;
      return;
    }
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      selectedIndex = 0;
      return;
    }
    if (selectedIndex >= visibleEntries.length) {
      selectedIndex = visibleEntries.length - 1;
    }
  }

  function buildEntries() {
    const state = getState() || {};
    paletteEntries = buildCommandPaletteEntries({
      systemSlashCommands,
      customCommands: listCustomCommands(),
      sessions: state.sessions,
      decks: state.decks,
      activeSessionId: state.activeSessionId,
      activeDeckId: state.activeDeckId,
      formatSessionToken,
      formatSessionDisplayName
    });
    return paletteEntries;
  }

  function renderResults() {
    removeAllChildren(resultsEl);
    if (!resultsEl || !documentRef || typeof documentRef.createElement !== "function") {
      return;
    }
    let lastGroup = "";
    visibleEntries.forEach((entry, index) => {
      if (entry.group !== lastGroup) {
        lastGroup = entry.group;
        const groupLabel = documentRef.createElement("p");
        groupLabel.className = "command-palette-group";
        groupLabel.textContent = entry.group === "commands" ? "Commands" : entry.group === "sessions" ? "Sessions" : "Decks";
        resultsEl.appendChild(groupLabel);
      }

      const button = documentRef.createElement("button");
      button.className = "command-palette-item";
      button.classList?.toggle?.("selected", index === selectedIndex);
      button.setAttribute?.("type", "button");
      button.setAttribute?.("data-palette-key", entry.key);

      const titleEl = documentRef.createElement("span");
      titleEl.className = "command-palette-item-title";
      titleEl.textContent = entry.title;

      const subtitleEl = documentRef.createElement("span");
      subtitleEl.className = "command-palette-item-subtitle";
      subtitleEl.textContent = entry.subtitle || "";

      button.appendChild(titleEl);
      button.appendChild(subtitleEl);

      if (entry.detail) {
        const detailEl = documentRef.createElement("span");
        detailEl.className = "command-palette-item-detail";
        detailEl.textContent = entry.detail;
        button.appendChild(detailEl);
      }

      button.addEventListener?.("click", () => {
        selectedIndex = index;
        void commitSelection();
      });
      resultsEl.appendChild(button);
    });
  }

  function render() {
    visibleEntries = filterCommandPaletteEntries(buildEntries(), searchInputEl?.value || "");
    clampSelectedIndex();
    renderResults();
    if (emptyEl) {
      emptyEl.hidden = visibleEntries.length > 0;
    }
    if (metaEl) {
      const count = visibleEntries.length;
      metaEl.textContent = count > 0 ? `${count} result${count === 1 ? "" : "s"} · Ctrl/Cmd+K · arrows · enter · esc` : "No matches · Esc closes";
    }
  }

  function closePalette() {
    if (searchInputEl) {
      searchInputEl.value = "";
    }
    visibleEntries = [];
    selectedIndex = 0;
    render();
    setDialogOpen(dialogEl, false);
    focusAndMoveCaretToEnd(commandInput);
  }

  function executeEntry(entry) {
    if (!entry) {
      return;
    }
    if (entry.group === "commands") {
      setComposerValue(entry.commandText);
      closePalette();
      return;
    }
    if (entry.group === "sessions") {
      const outcome = activateSessionTarget(entry.session);
      if (outcome?.message) {
        setCommandFeedback(outcome.message);
      }
      closePalette();
      return;
    }
    if (entry.group === "decks") {
      const outcome = activateDeckTarget(entry.deck);
      if (outcome?.message) {
        setCommandFeedback(outcome.message);
      }
      closePalette();
    }
  }

  async function commitSelection() {
    if (selectedIndex < 0 || selectedIndex >= visibleEntries.length) {
      return false;
    }
    executeEntry(visibleEntries[selectedIndex]);
    return true;
  }

  function openPalette(initialQuery = "") {
    if (searchInputEl) {
      searchInputEl.value = normalizeText(initialQuery);
    }
    render();
    setDialogOpen(dialogEl, true);
    searchInputEl?.focus?.();
  }

  function togglePalette() {
    if (dialogEl?.open) {
      closePalette();
      return false;
    }
    openPalette("");
    return true;
  }

  function moveSelection(delta) {
    if (visibleEntries.length === 0) {
      return false;
    }
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      selectedIndex = 0;
    } else {
      selectedIndex = (selectedIndex + delta + visibleEntries.length) % visibleEntries.length;
    }
    renderResults();
    return true;
  }

  if (searchInputEl?.addEventListener) {
    searchListener = () => {
      render();
    };
    searchKeydownListener = (event) => {
      if (!event || typeof event !== "object") {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault?.();
        moveSelection(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault?.();
        moveSelection(-1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault?.();
        void commitSelection();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault?.();
        closePalette();
      }
    };
    searchInputEl.addEventListener("input", searchListener);
    searchInputEl.addEventListener("keydown", searchKeydownListener);
  }

  if (closeBtn?.addEventListener) {
    closeListener = () => closePalette();
    closeBtn.addEventListener("click", closeListener);
  }

  if (dialogEl?.addEventListener) {
    dialogEl.addEventListener("cancel", (event) => {
      event?.preventDefault?.();
      closePalette();
    });
  }

  if (windowRef?.addEventListener) {
    windowKeydownListener = (event) => {
      if (!event || typeof event !== "object") {
        return;
      }
      if (isPaletteShortcut(event)) {
        event.preventDefault?.();
        togglePalette();
        return;
      }
      if (dialogEl?.open && event.key === "Escape") {
        event.preventDefault?.();
        closePalette();
      }
    };
    windowRef.addEventListener("keydown", windowKeydownListener);
  }

  render();

  return {
    openPalette,
    closePalette,
    togglePalette,
    refresh: render,
    isOpen: () => dialogEl?.open === true,
    getVisibleEntries: () => visibleEntries.slice(),
    getSelectedEntry: () => (selectedIndex >= 0 && selectedIndex < visibleEntries.length ? visibleEntries[selectedIndex] : null)
  };
}
