import {
  buildSplitLayoutPaneId,
  computeSplitLayoutPairWeights,
  getSplitLayoutNodeByPath,
  removeSplitLayoutPaneFromNode,
  replaceSplitLayoutPaneWithSplit
} from "./layout-runtime-state.js";
import {
  cloneDeckSplitLayoutEntry,
  cloneDeckSplitLayoutMap,
  collectSplitLayoutPaneIds,
  normalizeSplitLayoutWeights
} from "./split-layout-state.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function resolveDeckId(deckId, options = {}) {
  return normalizeText(deckId) || normalizeText(options.defaultDeckId) || "default";
}

function mutateDeckSplitLayoutEntry(deckSplitLayouts, deckId, mutator, options = {}) {
  const normalizedDeckId = resolveDeckId(deckId, options);
  const currentLayouts = cloneDeckSplitLayoutMap(deckSplitLayouts, { fallbackToDefault: false });
  const entry = cloneDeckSplitLayoutEntry(currentLayouts[normalizedDeckId], { fallbackToDefault: true });
  const nextEntry = typeof mutator === "function" ? mutator(entry) || entry : entry;
  currentLayouts[normalizedDeckId] = cloneDeckSplitLayoutEntry(nextEntry, { fallbackToDefault: true });
  return {
    deckSplitLayouts: currentLayouts,
    entry: cloneDeckSplitLayoutEntry(currentLayouts[normalizedDeckId], { fallbackToDefault: true })
  };
}

export function normalizeDeckSplitLayoutMap(deckSplitLayouts, options = {}) {
  return cloneDeckSplitLayoutMap(deckSplitLayouts, options);
}

export function getDeckSplitLayoutEntry(deckSplitLayouts, deckId, options = {}) {
  return cloneDeckSplitLayoutEntry(
    deckSplitLayouts?.[resolveDeckId(deckId, options)],
    { fallbackToDefault: true }
  );
}

export function ensureDeckSplitLayoutEntry(deckSplitLayouts, deckId, sessionIds = [], options = {}) {
  const normalizedDeckId = resolveDeckId(deckId, options);
  const orderedSessionIds = [];
  const knownSessionIds = new Set();
  for (const rawSessionId of Array.isArray(sessionIds) ? sessionIds : []) {
    const sessionId = normalizeText(rawSessionId);
    if (!sessionId || knownSessionIds.has(sessionId)) {
      continue;
    }
    knownSessionIds.add(sessionId);
    orderedSessionIds.push(sessionId);
  }

  return mutateDeckSplitLayoutEntry(deckSplitLayouts, normalizedDeckId, (entry) => {
    const paneIds = collectSplitLayoutPaneIds(entry.root);
    const nextPaneSessions = Object.fromEntries(paneIds.map((paneId) => [paneId, []]));
    const existingAssignments = new Map();
    for (const paneId of paneIds) {
      for (const rawSessionId of entry.paneSessions[paneId] || []) {
        const sessionId = normalizeText(rawSessionId);
        if (!sessionId || !knownSessionIds.has(sessionId) || existingAssignments.has(sessionId)) {
          continue;
        }
        existingAssignments.set(sessionId, paneId);
      }
    }
    const fallbackPaneId = paneIds[0] || "main";
    for (const sessionId of orderedSessionIds) {
      const paneId = existingAssignments.get(sessionId) || fallbackPaneId;
      nextPaneSessions[paneId] = nextPaneSessions[paneId] || [];
      nextPaneSessions[paneId].push(sessionId);
    }
    entry.paneSessions = nextPaneSessions;
    return entry;
  }, options);
}

export function assignSessionToDeckSplitLayoutPane(deckSplitLayouts, deckId, paneId, sessionId, options = {}) {
  const normalizedPaneId = normalizeLower(paneId);
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedPaneId || !normalizedSessionId) {
    return null;
  }

  return mutateDeckSplitLayoutEntry(deckSplitLayouts, deckId, (entry) => {
    const paneIds = new Set(collectSplitLayoutPaneIds(entry.root));
    if (!paneIds.has(normalizedPaneId)) {
      return entry;
    }
    for (const currentPaneId of Object.keys(entry.paneSessions)) {
      entry.paneSessions[currentPaneId] = (entry.paneSessions[currentPaneId] || []).filter(
        (candidate) => candidate !== normalizedSessionId
      );
    }
    entry.paneSessions[normalizedPaneId] = entry.paneSessions[normalizedPaneId] || [];
    if (!entry.paneSessions[normalizedPaneId].includes(normalizedSessionId)) {
      entry.paneSessions[normalizedPaneId].push(normalizedSessionId);
    }
    return entry;
  }, options);
}

export function splitDeckSplitLayoutPane(deckSplitLayouts, deckId, paneId, orientation, options = {}) {
  const normalizedPaneId = normalizeLower(paneId);
  const normalizedOrientation = normalizeLower(orientation);
  if (!normalizedPaneId || (normalizedOrientation !== "row" && normalizedOrientation !== "column")) {
    return null;
  }

  return mutateDeckSplitLayoutEntry(deckSplitLayouts, deckId, (entry) => {
    const existingPaneIds = new Set(collectSplitLayoutPaneIds(entry.root));
    if (!existingPaneIds.has(normalizedPaneId)) {
      return entry;
    }
    const nextPaneId = buildSplitLayoutPaneId(
      normalizedPaneId,
      normalizedOrientation === "row" ? "right" : "lower",
      existingPaneIds
    );
    const result = replaceSplitLayoutPaneWithSplit(entry.root, normalizedPaneId, normalizedOrientation, nextPaneId);
    if (!result.changed) {
      return entry;
    }
    entry.root = result.node;
    entry.paneSessions[nextPaneId] = entry.paneSessions[nextPaneId] || [];
    return entry;
  }, options);
}

export function removeDeckSplitLayoutPane(deckSplitLayouts, deckId, paneId, options = {}) {
  const normalizedPaneId = normalizeLower(paneId);
  if (!normalizedPaneId) {
    return null;
  }

  return mutateDeckSplitLayoutEntry(deckSplitLayouts, deckId, (entry) => {
    const allPaneIds = collectSplitLayoutPaneIds(entry.root);
    if (allPaneIds.length <= 1 || !allPaneIds.includes(normalizedPaneId)) {
      return entry;
    }
    const removedSessionIds = [];
    for (const sessionId of entry.paneSessions[normalizedPaneId] || []) {
      removedSessionIds.push(sessionId);
    }
    const result = removeSplitLayoutPaneFromNode(entry.root, normalizedPaneId);
    entry.root = result.node || { type: "pane", paneId: "main" };
    const remainingPaneIds = new Set(collectSplitLayoutPaneIds(entry.root));
    const nextPaneSessions = Object.fromEntries(Array.from(remainingPaneIds, (id) => [id, []]));
    for (const [currentPaneId, sessionIds] of Object.entries(entry.paneSessions)) {
      if (!remainingPaneIds.has(currentPaneId)) {
        continue;
      }
      nextPaneSessions[currentPaneId] = Array.isArray(sessionIds) ? sessionIds.slice() : [];
    }
    const fallbackPaneId = collectSplitLayoutPaneIds(entry.root)[0] || "main";
    const seen = new Set(nextPaneSessions[fallbackPaneId] || []);
    for (const sessionId of removedSessionIds) {
      if (seen.has(sessionId)) {
        continue;
      }
      seen.add(sessionId);
      nextPaneSessions[fallbackPaneId].push(sessionId);
    }
    entry.paneSessions = nextPaneSessions;
    return entry;
  }, options);
}

export function setDeckSplitLayoutContainerWeightRatio(deckSplitLayouts, deckId, path, handleIndex, ratio, options = {}) {
  const index = Number(handleIndex);
  const normalizedRatio = Number(ratio);
  if (!Number.isInteger(index) || !Number.isFinite(normalizedRatio)) {
    return null;
  }

  return mutateDeckSplitLayoutEntry(deckSplitLayouts, deckId, (entry) => {
    const node = getSplitLayoutNodeByPath(entry.root, path);
    if (!node || (node.type !== "row" && node.type !== "column") || index < 0 || index >= node.children.length - 1) {
      return entry;
    }
    node.weights = computeSplitLayoutPairWeights(
      normalizeSplitLayoutWeights(node.weights, node.children.length),
      index,
      normalizedRatio
    );
    return entry;
  }, options);
}

export function mergeDeckSplitLayoutSnapshot(currentLayouts, snapshotLayouts, options = {}) {
  const scope = normalizeLower(options.scope) || "all";
  const targetDeckId = normalizeText(options.targetDeckId);
  const nextSnapshotLayouts = cloneDeckSplitLayoutMap(snapshotLayouts);
  if (scope === "all") {
    return nextSnapshotLayouts;
  }
  const nextLayouts = cloneDeckSplitLayoutMap(currentLayouts);
  if (!targetDeckId) {
    return nextLayouts;
  }
  if (nextSnapshotLayouts[targetDeckId]) {
    nextLayouts[targetDeckId] = cloneDeckSplitLayoutEntry(nextSnapshotLayouts[targetDeckId]);
  } else {
    delete nextLayouts[targetDeckId];
  }
  return nextLayouts;
}
