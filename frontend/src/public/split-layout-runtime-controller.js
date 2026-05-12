import { createLayoutSplitLayoutRuntimeModel } from "./layout-split-layout-runtime-model.js";
import { getSplitLayoutNodeByPath } from "./layout-runtime-state.js";
import { collectSplitLayoutPaneIds, normalizeSplitLayoutWeights } from "./split-layout-state.js";
import { serializeSplitLayoutRoot } from "./layout-workspace-orchestration-state.js";
import { normalizeText, replaceSelectOptions } from "./layout-workspace-selection-state.js";

function setDataValue(element, key, value) {
  if (!element) {
    return;
  }
  if (element.dataset && typeof element.dataset === "object") {
    element.dataset[key] = value;
  }
}

function getDataValue(element, key) {
  if (!element?.dataset || typeof element.dataset !== "object") {
    return "";
  }
  return normalizeText(element.dataset[key]);
}

function getCollectionLength(collection) {
  return collection && typeof collection.length === "number" ? collection.length : 0;
}

function getCollectionItem(collection, index) {
  if (!collection) {
    return null;
  }
  if (typeof collection.item === "function") {
    return collection.item(index);
  }
  return collection[index] || null;
}

function syncChildOrder(containerEl, desiredNodes) {
  if (!containerEl || typeof containerEl.appendChild !== "function" || !Array.isArray(desiredNodes)) {
    return false;
  }
  const children = containerEl.children;
  let needsReorder = getCollectionLength(children) !== desiredNodes.length;
  if (!needsReorder) {
    for (let index = 0; index < desiredNodes.length; index += 1) {
      if (getCollectionItem(children, index) !== desiredNodes[index]) {
        needsReorder = true;
        break;
      }
    }
  }
  if (!needsReorder) {
    return false;
  }
  for (const node of desiredNodes) {
    if (node) {
      containerEl.appendChild(node);
    }
  }
  return true;
}

function applyChildWeights(childElements, weights) {
  for (let index = 0; index < childElements.length; index += 1) {
    const childEl = childElements[index];
    if (!childEl?.style) {
      continue;
    }
    const weight = Number(weights[index] || 0) || 0;
    childEl.style.flex = `${weight} ${weight} 0px`;
  }
}

export function createSplitLayoutRuntimeController(options = {}) {
  const documentRef = options.documentRef || null;
  const windowRef = options.windowRef || globalThis;
  const gridEl = options.gridEl || null;
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const scheduleGlobalResize = typeof options.scheduleGlobalResize === "function" ? options.scheduleGlobalResize : () => {};
  const scheduleDeferredResizePasses =
    typeof options.scheduleDeferredResizePasses === "function" ? options.scheduleDeferredResizePasses : () => {};
  const setActiveSession = typeof options.setActiveSession === "function" ? options.setActiveSession : () => {};
  const formatSessionToken = typeof options.formatSessionToken === "function" ? options.formatSessionToken : (sessionId) => sessionId;
  const formatSessionDisplayName =
    typeof options.formatSessionDisplayName === "function" ? options.formatSessionDisplayName : (session) => session?.name || session?.id || "";
  const sortSessionsByQuickId =
    typeof options.sortSessionsByQuickId === "function" ? options.sortSessionsByQuickId : (sessions) => (Array.isArray(sessions) ? sessions.slice() : []);

  let canvasEl = null;
  let stashEl = null;
  let renderedDeckId = "";
  let renderedSignature = "";
  let renderedRootEl = null;
  const paneRefs = new Map();
  const containerRefs = new Map();
  const splitLayoutRuntimeModel = createLayoutSplitLayoutRuntimeModel({
    defaultDeckId,
    onLayoutsChanged() {
      renderedDeckId = "";
      renderedSignature = "";
    }
  });

  function createElement(tagName) {
    return documentRef?.createElement?.(tagName) || { tagName: String(tagName || "div").toUpperCase(), style: {}, dataset: {}, children: [] };
  }

  function ensureClassName(element, className) {
    if (!element) {
      return;
    }
    if (element.classList?.add) {
      element.classList.add(className);
      return;
    }
    const existing = normalizeText(element.className);
    const next = new Set(existing ? existing.split(/\s+/) : []);
    next.add(className);
    element.className = Array.from(next).join(" ");
  }

  function ensureRootContainers() {
    if (!gridEl || typeof gridEl.appendChild !== "function") {
      return { canvasEl: null, stashEl: null };
    }
    if (!canvasEl) {
      canvasEl = createElement("div");
      ensureClassName(canvasEl, "terminal-grid-canvas");
      setDataValue(canvasEl, "role", "terminal-grid-canvas");
      gridEl.appendChild(canvasEl);
    }
    if (!stashEl) {
      stashEl = createElement("div");
      ensureClassName(stashEl, "terminal-grid-stash");
      setDataValue(stashEl, "role", "terminal-grid-stash");
      stashEl.hidden = true;
      gridEl.appendChild(stashEl);
    }
    ensureClassName(gridEl, "split-layout-active");

    const looseChildren = [];
    const children = gridEl.children;
    for (let index = 0; index < getCollectionLength(children); index += 1) {
      const child = getCollectionItem(children, index);
      if (child) {
        looseChildren.push(child);
      }
    }
    for (const child of looseChildren) {
      if (child === canvasEl || child === stashEl) {
        continue;
      }
      stashEl.appendChild(child);
    }

    return { canvasEl, stashEl };
  }

  function getCardParkingContainer() {
    return ensureRootContainers().stashEl;
  }

  const captureDeckSplitLayouts = (...args) => splitLayoutRuntimeModel.captureDeckSplitLayouts(...args);
  const replaceDeckSplitLayouts = (...args) => splitLayoutRuntimeModel.replaceDeckSplitLayouts(...args);
  const getDeckSplitLayout = (...args) => splitLayoutRuntimeModel.getDeckSplitLayout(...args);
  const ensureDeckLayoutEntry = (...args) => splitLayoutRuntimeModel.ensureDeckLayoutEntry(...args);
  const assignSessionToPane = (...args) => splitLayoutRuntimeModel.assignSessionToPane(...args);
  const splitPane = (...args) => splitLayoutRuntimeModel.splitPane(...args);
  const removePane = (...args) => splitLayoutRuntimeModel.removePane(...args);
  const setContainerWeightRatio = (...args) => splitLayoutRuntimeModel.setContainerWeightRatio(...args);
  const mergeDeckSplitLayouts = (...args) => splitLayoutRuntimeModel.mergeDeckSplitLayouts(...args);

  function clearChildren(element) {
    if (!element || typeof element.removeChild !== "function") {
      return;
    }
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function updateSelectOptions(selectEl, sessions, selectedSessionId) {
    if (!selectEl || typeof selectEl.appendChild !== "function") {
      return;
    }
    replaceSelectOptions({
      selectEl,
      selectedValue: selectedSessionId || "",
      placeholder: {
        value: "",
        label: "Assign session"
      },
      items: (Array.isArray(sessions) ? sessions : []).map((session) => ({
        value: session.id,
        label: `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`
      })),
      createOption: () => createElement("option")
    });
  }

  function bindResizeHandle(handleEl, deckId, path, handleIndex, orientation, containerEl) {
    if (!handleEl || typeof handleEl.addEventListener !== "function") {
      return;
    }
    handleEl.addEventListener("pointerdown", (event) => {
      event.preventDefault?.();
      const listenersTarget = windowRef;
      if (!listenersTarget || typeof listenersTarget.addEventListener !== "function") {
        return;
      }
      const entry = getDeckSplitLayout(deckId);
      const node = getSplitLayoutNodeByPath(entry?.root, path);
      if (!node || !Array.isArray(node.children)) {
        return;
      }
      const startWeights = normalizeSplitLayoutWeights(node.weights, node.children.length);
      const rect = typeof containerEl?.getBoundingClientRect === "function" ? containerEl.getBoundingClientRect() : null;
      const startOffset = rect ? (orientation === "row" ? rect.left : rect.top) : 0;
      const totalSize = rect ? Math.max(1, orientation === "row" ? rect.width : rect.height) : 1;
      const pairStart = startWeights.slice(0, handleIndex).reduce((sum, value) => sum + value, 0);
      const pairTotal = startWeights[handleIndex] + startWeights[handleIndex + 1];

      const onPointerMove = (moveEvent) => {
        const pointerCoord = orientation === "row" ? moveEvent.clientX : moveEvent.clientY;
        const fraction = ((pointerCoord - startOffset) / totalSize - pairStart) / pairTotal;
        const nextEntry = setContainerWeightRatio(deckId, path, handleIndex, fraction);
        const nextNode = getSplitLayoutNodeByPath(nextEntry?.root, path);
        if (nextNode) {
          const containerRef = containerRefs.get(`${normalizeText(deckId)}:${JSON.stringify(path)}`);
          if (containerRef) {
            applyChildWeights(
              containerRef.childElements,
              normalizeSplitLayoutWeights(nextNode.weights, nextNode.children.length)
            );
          }
        }
        scheduleGlobalResize({ deckId, force: true });
      };

      const onPointerUp = () => {
        listenersTarget.removeEventListener("pointermove", onPointerMove);
        listenersTarget.removeEventListener("pointerup", onPointerUp);
        listenersTarget.removeEventListener("pointercancel", onPointerUp);
        scheduleDeferredResizePasses({ deckId, force: true });
      };

      listenersTarget.addEventListener("pointermove", onPointerMove);
      listenersTarget.addEventListener("pointerup", onPointerUp);
      listenersTarget.addEventListener("pointercancel", onPointerUp);
    });
  }

  function buildPaneElement(deckId, paneId, path, paneCount) {
    const paneEl = createElement("section");
    ensureClassName(paneEl, "split-pane");
    setDataValue(paneEl, "paneId", paneId);

    const headEl = createElement("div");
    ensureClassName(headEl, "split-pane-head");
    const titleWrapEl = createElement("div");
    ensureClassName(titleWrapEl, "split-pane-heading");
    const titleEl = createElement("p");
    ensureClassName(titleEl, "split-pane-title");
    const metaEl = createElement("p");
    ensureClassName(metaEl, "split-pane-meta");
    titleWrapEl.appendChild(titleEl);
    titleWrapEl.appendChild(metaEl);

    const actionsEl = createElement("div");
    ensureClassName(actionsEl, "split-pane-actions");
    const sessionSelectEl = createElement("select");
    ensureClassName(sessionSelectEl, "split-pane-session-select");
    const assignBtn = createElement("button");
    assignBtn.type = "button";
    assignBtn.textContent = "Assign";
    const useActiveBtn = createElement("button");
    useActiveBtn.type = "button";
    useActiveBtn.textContent = "Use Active";
    const splitRowBtn = createElement("button");
    splitRowBtn.type = "button";
    splitRowBtn.textContent = "Split H";
    const splitColumnBtn = createElement("button");
    splitColumnBtn.type = "button";
    splitColumnBtn.textContent = "Split V";
    const removeBtn = createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.disabled = paneCount <= 1;

    actionsEl.appendChild(sessionSelectEl);
    actionsEl.appendChild(assignBtn);
    actionsEl.appendChild(useActiveBtn);
    actionsEl.appendChild(splitRowBtn);
    actionsEl.appendChild(splitColumnBtn);
    actionsEl.appendChild(removeBtn);
    headEl.appendChild(titleWrapEl);
    headEl.appendChild(actionsEl);

    const bodyEl = createElement("div");
    ensureClassName(bodyEl, "split-pane-body");
    paneEl.appendChild(headEl);
    paneEl.appendChild(bodyEl);

    assignBtn.addEventListener?.("click", () => {
      const sessionId = normalizeText(sessionSelectEl.value);
      if (!sessionId) {
        return;
      }
      assignSessionToPane(deckId, paneId, sessionId);
      setActiveSession(sessionId);
      requestRender();
      scheduleGlobalResize({ deckId, force: true });
      scheduleDeferredResizePasses({ deckId, force: true });
    });
    useActiveBtn.addEventListener?.("click", () => {
      const activeSessionId = getDataValue(useActiveBtn, "activeSessionId");
      if (!activeSessionId) {
        return;
      }
      assignSessionToPane(deckId, paneId, activeSessionId);
      requestRender();
      scheduleGlobalResize({ deckId, force: true });
      scheduleDeferredResizePasses({ deckId, force: true });
    });
    splitRowBtn.addEventListener?.("click", () => {
      splitPane(deckId, paneId, "row");
      requestRender();
      scheduleGlobalResize({ deckId, force: true });
      scheduleDeferredResizePasses({ deckId, force: true });
    });
    splitColumnBtn.addEventListener?.("click", () => {
      splitPane(deckId, paneId, "column");
      requestRender();
      scheduleGlobalResize({ deckId, force: true });
      scheduleDeferredResizePasses({ deckId, force: true });
    });
    removeBtn.addEventListener?.("click", () => {
      removePane(deckId, paneId);
      requestRender();
      scheduleGlobalResize({ deckId, force: true });
      scheduleDeferredResizePasses({ deckId, force: true });
    });

    paneRefs.set(paneId, {
      paneEl,
      headEl,
      titleEl,
      metaEl,
      bodyEl,
      sessionSelectEl,
      assignBtn,
      useActiveBtn,
      removeBtn,
      path
    });

    return paneEl;
  }

  function buildNodeElement(deckId, node, path, paneCount) {
    if (node.type === "pane") {
      return buildPaneElement(deckId, node.paneId, path, paneCount);
    }

    const containerEl = createElement("div");
    ensureClassName(containerEl, "split-container");
    ensureClassName(containerEl, node.type === "row" ? "split-container-row" : "split-container-column");
    const childElements = [];
    for (let index = 0; index < node.children.length; index += 1) {
      const childShellEl = createElement("div");
      ensureClassName(childShellEl, "split-container-child");
      childShellEl.appendChild(buildNodeElement(deckId, node.children[index], path.concat(index), paneCount));
      containerEl.appendChild(childShellEl);
      childElements.push(childShellEl);
      if (index < node.children.length - 1) {
        const handleEl = createElement("button");
        handleEl.type = "button";
        ensureClassName(handleEl, "split-resize-handle");
        ensureClassName(handleEl, node.type === "row" ? "split-resize-handle-row" : "split-resize-handle-column");
        bindResizeHandle(handleEl, deckId, path, index, node.type, containerEl);
        containerEl.appendChild(handleEl);
      }
    }
    applyChildWeights(childElements, normalizeSplitLayoutWeights(node.weights, node.children.length));
    containerRefs.set(`${deckId}:${JSON.stringify(path)}`, {
      containerEl,
      childElements
    });
    return containerEl;
  }

  function rebuildShell(deckId, entry) {
    const { canvasEl: nextCanvasEl } = ensureRootContainers();
    paneRefs.clear();
    containerRefs.clear();
    clearChildren(nextCanvasEl);
    const paneCount = collectSplitLayoutPaneIds(entry.root).length;
    renderedRootEl = buildNodeElement(deckId, entry.root, [], paneCount);
    nextCanvasEl.appendChild(renderedRootEl);
    renderedDeckId = deckId;
    renderedSignature = serializeSplitLayoutRoot(entry.root);
  }

  function updatePaneHeaders(deckId, entry, deckSessions, activeSessionId) {
    const sortedSessions = sortSessionsByQuickId(Array.isArray(deckSessions) ? deckSessions.slice() : []);
    const paneCount = collectSplitLayoutPaneIds(entry.root).length;
    for (const [paneId, refs] of paneRefs.entries()) {
      const assignedSessions = (entry.paneSessions[paneId] || []).map((sessionId) => sortedSessions.find((session) => session.id === sessionId)).filter(Boolean);
      if (refs.headEl) {
        refs.headEl.hidden = paneCount <= 1;
      }
      if (refs.titleEl) {
        refs.titleEl.textContent = `Pane ${paneId}`;
      }
      if (refs.metaEl) {
        refs.metaEl.textContent = `${assignedSessions.length} session(s)`;
      }
      if (refs.removeBtn) {
        refs.removeBtn.disabled = paneCount <= 1;
      }
      if (refs.useActiveBtn) {
        setDataValue(refs.useActiveBtn, "activeSessionId", sortedSessions.some((session) => session.id === activeSessionId) ? activeSessionId : "");
        refs.useActiveBtn.disabled = !getDataValue(refs.useActiveBtn, "activeSessionId");
      }
      updateSelectOptions(refs.sessionSelectEl, sortedSessions, assignedSessions[0]?.id || "");
    }
  }

  function renderDeckLayout({ deckId, orderedSessions = [], deckSessions = [], activeSessionId = "", terminals = new Map() } = {}) {
    const normalizedDeckId = normalizeText(deckId) || defaultDeckId;
    const entry = ensureDeckLayoutEntry(normalizedDeckId, deckSessions.map((session) => session.id));
    const signature = serializeSplitLayoutRoot(entry.root);
    if (renderedDeckId !== normalizedDeckId || renderedSignature !== signature || !renderedRootEl) {
      rebuildShell(normalizedDeckId, entry);
    }
    updatePaneHeaders(normalizedDeckId, entry, deckSessions, activeSessionId);

    const assignedIds = new Set();
    for (const paneId of collectSplitLayoutPaneIds(entry.root)) {
      const refs = paneRefs.get(paneId);
      if (!refs) {
        continue;
      }
      const desiredNodes = [];
      for (const sessionId of entry.paneSessions[paneId] || []) {
        const node = terminals.get(sessionId)?.element || null;
        if (!node) {
          continue;
        }
        desiredNodes.push(node);
        assignedIds.add(sessionId);
      }
      syncChildOrder(refs.bodyEl, desiredNodes);
    }

    const stashNodes = [];
    for (const session of Array.isArray(orderedSessions) ? orderedSessions : []) {
      if (assignedIds.has(session.id)) {
        continue;
      }
      const node = terminals.get(session.id)?.element || null;
      if (node) {
        stashNodes.push(node);
      }
    }
    syncChildOrder(getCardParkingContainer(), stashNodes);

    return entry;
  }

  return {
    getCardParkingContainer,
    captureDeckSplitLayouts,
    replaceDeckSplitLayouts,
    getDeckSplitLayout,
    mergeDeckSplitLayouts,
    renderDeckLayout,
    assignSessionToPane,
    splitPane,
    removePane,
    setContainerWeightRatio
  };
}
