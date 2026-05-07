import {
  assignSessionToDeckSplitLayoutPane,
  ensureDeckSplitLayoutEntry,
  getDeckSplitLayoutEntry,
  mergeDeckSplitLayoutSnapshot,
  normalizeDeckSplitLayoutMap,
  removeDeckSplitLayoutPane,
  setDeckSplitLayoutContainerWeightRatio,
  splitDeckSplitLayoutPane
} from "./layout-split-layout-runtime-state.js";

function normalizeText(value) {
  return String(value || "").trim();
}

export function createLayoutSplitLayoutRuntimeModel(options = {}) {
  const defaultDeckId = normalizeText(options.defaultDeckId) || "default";
  const notifyLayoutsChanged = typeof options.onLayoutsChanged === "function" ? options.onLayoutsChanged : () => {};

  let deckSplitLayouts = {};

  function captureDeckSplitLayouts() {
    return normalizeDeckSplitLayoutMap(deckSplitLayouts, { fallbackToDefault: true });
  }

  function replaceDeckSplitLayouts(nextLayouts) {
    deckSplitLayouts = normalizeDeckSplitLayoutMap(nextLayouts, { fallbackToDefault: true });
    notifyLayoutsChanged();
    return captureDeckSplitLayouts();
  }

  function getDeckSplitLayout(deckId) {
    return getDeckSplitLayoutEntry(deckSplitLayouts, deckId, { defaultDeckId });
  }

  function ensureDeckLayoutEntry(deckId, sessionIds = []) {
    const result = ensureDeckSplitLayoutEntry(deckSplitLayouts, deckId, sessionIds, { defaultDeckId });
    deckSplitLayouts = result.deckSplitLayouts;
    return result.entry;
  }

  function assignSessionToPane(deckId, paneId, sessionId) {
    const result = assignSessionToDeckSplitLayoutPane(deckSplitLayouts, deckId, paneId, sessionId, { defaultDeckId });
    if (!result) {
      return null;
    }
    deckSplitLayouts = result.deckSplitLayouts;
    notifyLayoutsChanged();
    return result.entry;
  }

  function splitPane(deckId, paneId, orientation) {
    const result = splitDeckSplitLayoutPane(deckSplitLayouts, deckId, paneId, orientation, { defaultDeckId });
    if (!result) {
      return null;
    }
    deckSplitLayouts = result.deckSplitLayouts;
    notifyLayoutsChanged();
    return result.entry;
  }

  function removePane(deckId, paneId) {
    const result = removeDeckSplitLayoutPane(deckSplitLayouts, deckId, paneId, { defaultDeckId });
    if (!result) {
      return null;
    }
    deckSplitLayouts = result.deckSplitLayouts;
    notifyLayoutsChanged();
    return result.entry;
  }

  function setContainerWeightRatio(deckId, path, handleIndex, ratio) {
    const result = setDeckSplitLayoutContainerWeightRatio(deckSplitLayouts, deckId, path, handleIndex, ratio, {
      defaultDeckId
    });
    if (!result) {
      return null;
    }
    deckSplitLayouts = result.deckSplitLayouts;
    notifyLayoutsChanged();
    return result.entry;
  }

  function mergeDeckSplitLayouts(snapshotLayouts, mergeOptions = {}) {
    deckSplitLayouts = mergeDeckSplitLayoutSnapshot(deckSplitLayouts, snapshotLayouts, mergeOptions);
    notifyLayoutsChanged();
    return captureDeckSplitLayouts();
  }

  return {
    captureDeckSplitLayouts,
    replaceDeckSplitLayouts,
    getDeckSplitLayout,
    ensureDeckLayoutEntry,
    assignSessionToPane,
    splitPane,
    removePane,
    setContainerWeightRatio,
    mergeDeckSplitLayouts
  };
}
