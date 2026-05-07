function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function createEqualWeights(count) {
  if (!Number.isInteger(count) || count < 1) {
    return [];
  }
  if (count === 1) {
    return [1];
  }
  const weights = [];
  let consumed = 0;
  for (let index = 0; index < count; index += 1) {
    if (index === count - 1) {
      weights.push(Number((1 - consumed).toFixed(6)));
      continue;
    }
    const value = Number((1 / count).toFixed(6));
    weights.push(value);
    consumed += value;
  }
  return weights;
}

export function normalizeSplitLayoutWeights(weights, childCount) {
  if (!Array.isArray(weights) || weights.length !== childCount) {
    return createEqualWeights(childCount);
  }
  const parsed = [];
  for (const rawWeight of weights) {
    const weight = Number(rawWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return createEqualWeights(childCount);
    }
    parsed.push(weight);
  }
  const total = parsed.reduce((sum, entry) => sum + entry, 0);
  if (!(total > 0)) {
    return createEqualWeights(childCount);
  }
  const normalized = [];
  let consumed = 0;
  for (let index = 0; index < parsed.length; index += 1) {
    if (index === parsed.length - 1) {
      normalized.push(Number((1 - consumed).toFixed(6)));
      continue;
    }
    const value = Number((parsed[index] / total).toFixed(6));
    normalized.push(value);
    consumed += value;
  }
  return normalized;
}

export function cloneSplitLayoutNode(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return null;
  }
  const type = normalizeLower(node.type);
  if (type === "pane") {
    const paneId = normalizeLower(node.paneId);
    if (!paneId) {
      return null;
    }
    return {
      type: "pane",
      paneId
    };
  }
  if (type !== "row" && type !== "column") {
    return null;
  }
  const children = [];
  for (const rawChild of Array.isArray(node.children) ? node.children : []) {
    const child = cloneSplitLayoutNode(rawChild);
    if (child) {
      children.push(child);
    }
  }
  if (children.length < 2) {
    return children[0] || null;
  }
  return {
    type,
    children,
    weights: normalizeSplitLayoutWeights(node.weights, children.length)
  };
}

export function collectSplitLayoutPaneIds(node, target = []) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return target;
  }
  if (node.type === "pane" && normalizeLower(node.paneId)) {
    target.push(normalizeLower(node.paneId));
    return target;
  }
  for (const child of Array.isArray(node.children) ? node.children : []) {
    collectSplitLayoutPaneIds(child, target);
  }
  return target;
}

export function cloneDeckSplitLayoutEntry(entry, options = {}) {
  const root = cloneSplitLayoutNode(entry?.root);
  if (!root) {
    if (options.fallbackToDefault === true) {
      return {
        root: { type: "pane", paneId: "main" },
        paneSessions: { main: [] }
      };
    }
    return null;
  }
  const paneIds = new Set(collectSplitLayoutPaneIds(root));
  const paneSessions = Object.fromEntries(Array.from(paneIds, (paneId) => [paneId, []]));
  if (entry?.paneSessions && typeof entry.paneSessions === "object" && !Array.isArray(entry.paneSessions)) {
    for (const [rawPaneId, rawSessionIds] of Object.entries(entry.paneSessions)) {
      const paneId = normalizeLower(rawPaneId);
      if (!paneId || !paneIds.has(paneId)) {
        continue;
      }
      const seen = new Set();
      for (const rawSessionId of Array.isArray(rawSessionIds) ? rawSessionIds : []) {
        const sessionId = normalizeText(rawSessionId);
        if (!sessionId || seen.has(sessionId)) {
          continue;
        }
        seen.add(sessionId);
        paneSessions[paneId].push(sessionId);
      }
    }
  }
  return {
    root,
    paneSessions
  };
}

export function cloneDeckSplitLayoutMap(deckSplitLayouts, options = {}) {
  if (!deckSplitLayouts || typeof deckSplitLayouts !== "object" || Array.isArray(deckSplitLayouts)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(deckSplitLayouts)
      .map(([deckId, entry]) => {
        const normalizedDeckId = normalizeText(deckId);
        const clonedEntry = cloneDeckSplitLayoutEntry(entry, options);
        if (!normalizedDeckId || !clonedEntry) {
          return null;
        }
        return [normalizedDeckId, clonedEntry];
      })
      .filter(Boolean)
  );
}
