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

function cloneDeckTerminalSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(settings)
      .map(([deckId, value]) => {
        const normalizedDeckId = normalizeText(deckId);
        const cols = Number.parseInt(String(value?.cols ?? ""), 10);
        const rows = Number.parseInt(String(value?.rows ?? ""), 10);
        if (!normalizedDeckId || !Number.isInteger(cols) || !Number.isInteger(rows)) {
          return null;
        }
        return [normalizedDeckId, { cols, rows }];
      })
      .filter(Boolean)
  );
}

function normalizeControlPanePosition(value) {
  const normalized = normalizeLower(value);
  return ["top", "bottom", "left", "right"].includes(normalized) ? normalized : "bottom";
}

function normalizeControlPaneSize(value) {
  const normalized = Number.parseInt(String(value ?? ""), 10);
  if (Number.isInteger(normalized) && normalized >= 120 && normalized <= 960) {
    return normalized;
  }
  return 185;
}

export function normalizeLayoutControlPaneState(source) {
  const value = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return {
    controlPaneVisible: value.controlPaneVisible !== false,
    controlPanePosition: normalizeControlPanePosition(value.controlPanePosition),
    controlPaneSize: normalizeControlPaneSize(value.controlPaneSize)
  };
}

export function normalizeLayoutProfileRecord(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return null;
  }
  const id = normalizeText(profile.id);
  const name = normalizeText(profile.name);
  const layout = profile.layout && typeof profile.layout === "object" && !Array.isArray(profile.layout) ? profile.layout : {};
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    createdAt: Number.isInteger(profile.createdAt) ? profile.createdAt : 0,
    updatedAt: Number.isInteger(profile.updatedAt) ? profile.updatedAt : 0,
    layout: {
      activeDeckId: normalizeText(layout.activeDeckId) || "default",
      sidebarVisible: layout.sidebarVisible !== false,
      sessionFilterText: normalizeText(layout.sessionFilterText),
      ...normalizeLayoutControlPaneState(layout),
      deckTerminalSettings: cloneDeckTerminalSettings(layout.deckTerminalSettings),
      deckSplitLayouts: cloneDeckSplitLayoutMap(layout.deckSplitLayouts)
    }
  };
}

export function normalizeLayoutProfileCollection(profiles) {
  const next = [];
  const seen = new Set();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const normalized = normalizeLayoutProfileRecord(profile);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    next.push(normalized);
  }
  next.sort((left, right) => {
    const nameCompare = left.name.localeCompare(right.name, "en-US", { sensitivity: "base" });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.id.localeCompare(right.id, "en-US", { sensitivity: "base" });
  });
  return next;
}

export function resolveLayoutProfileToken(profiles, token) {
  const normalizedToken = normalizeLower(token);
  if (!normalizedToken) {
    return { profile: null, error: "Layout profile target is required." };
  }
  const entries = normalizeLayoutProfileCollection(profiles);
  const exactId = entries.find((entry) => entry.id.toLowerCase() === normalizedToken);
  if (exactId) {
    return { profile: exactId, error: "" };
  }
  const exactName = entries.find((entry) => entry.name.toLowerCase() === normalizedToken);
  if (exactName) {
    return { profile: exactName, error: "" };
  }
  const matches = entries.filter(
    (entry) => entry.id.toLowerCase().startsWith(normalizedToken) || entry.name.toLowerCase().startsWith(normalizedToken)
  );
  if (matches.length === 1) {
    return { profile: matches[0], error: "" };
  }
  if (matches.length === 0) {
    return { profile: null, error: `Unknown layout profile: ${token}` };
  }
  return {
    profile: null,
    error: `Ambiguous layout profile '${token}': ${matches.map((entry) => entry.id).join(", ")}`
  };
}

export function getSplitLayoutNodeByPath(node, path = []) {
  let current = node || null;
  for (const segment of Array.isArray(path) ? path : []) {
    if (
      !current ||
      !Array.isArray(current.children) ||
      !Number.isInteger(segment) ||
      segment < 0 ||
      segment >= current.children.length
    ) {
      return null;
    }
    current = current.children[segment];
  }
  return current;
}

export function buildSplitLayoutPaneId(basePaneId, suffix, existingPaneIds) {
  const root = normalizeLower(basePaneId) || "pane";
  let candidateIndex = 2;
  let candidate = `${root}-${suffix}`;
  if (!existingPaneIds.has(candidate)) {
    return candidate;
  }
  while (existingPaneIds.has(`${candidate}-${candidateIndex}`)) {
    candidateIndex += 1;
  }
  return `${candidate}-${candidateIndex}`;
}

export function replaceSplitLayoutPaneWithSplit(node, paneId, orientation, nextPaneId) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return { node, changed: false };
  }
  if (node.type === "pane") {
    if (node.paneId !== paneId) {
      return { node, changed: false };
    }
    return {
      changed: true,
      node: {
        type: orientation,
        children: [
          { type: "pane", paneId },
          { type: "pane", paneId: nextPaneId }
        ],
        weights: [0.5, 0.5]
      }
    };
  }
  const children = [];
  let changed = false;
  for (const child of Array.isArray(node.children) ? node.children : []) {
    const result = replaceSplitLayoutPaneWithSplit(child, paneId, orientation, nextPaneId);
    children.push(result.node);
    if (result.changed) {
      changed = true;
    }
  }
  return {
    changed,
    node: {
      type: node.type,
      children,
      weights: normalizeSplitLayoutWeights(node.weights, children.length)
    }
  };
}

export function removeSplitLayoutPaneFromNode(node, paneId) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return { node: null, removedPaneIds: [] };
  }
  if (node.type === "pane") {
    if (node.paneId !== paneId) {
      return { node, removedPaneIds: [] };
    }
    return { node: null, removedPaneIds: [paneId] };
  }

  const nextChildren = [];
  const nextWeights = [];
  const removedPaneIds = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const result = removeSplitLayoutPaneFromNode(node.children[index], paneId);
    removedPaneIds.push(...result.removedPaneIds);
    if (result.node) {
      nextChildren.push(result.node);
      nextWeights.push(Array.isArray(node.weights) ? node.weights[index] : 1);
    }
  }

  if (nextChildren.length === 0) {
    return { node: null, removedPaneIds };
  }
  if (nextChildren.length === 1) {
    return { node: nextChildren[0], removedPaneIds };
  }
  return {
    node: {
      type: node.type,
      children: nextChildren,
      weights: normalizeSplitLayoutWeights(nextWeights, nextChildren.length)
    },
    removedPaneIds
  };
}

export function computeSplitLayoutPairWeights(weights, handleIndex, ratio) {
  const nextWeights = weights.slice();
  const pairTotal = nextWeights[handleIndex] + nextWeights[handleIndex + 1];
  const clampedRatio = Math.min(0.9, Math.max(0.1, ratio));
  nextWeights[handleIndex] = Number((pairTotal * clampedRatio).toFixed(6));
  nextWeights[handleIndex + 1] = Number((pairTotal * (1 - clampedRatio)).toFixed(6));
  return normalizeSplitLayoutWeights(nextWeights, nextWeights.length);
}

export function cloneLayoutProfileDeckSplitLayouts(layout) {
  return cloneDeckSplitLayoutMap(layout?.deckSplitLayouts);
}

export function cloneLayoutSplitLayoutEntry(entry, options = {}) {
  return cloneDeckSplitLayoutEntry(entry, options);
}

export function collectLayoutPaneIds(node, target = []) {
  return collectSplitLayoutPaneIds(node, target);
}
