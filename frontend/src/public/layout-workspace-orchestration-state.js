import { mergeDeckSplitLayoutSnapshot } from "./layout-split-layout-runtime-state.js";
import { normalizeLayoutControlPaneState, normalizeLayoutProfileRecord } from "./layout-runtime-state.js";
import {
  captureCurrentWorkspace,
  captureLayoutProfileSnapshot,
  cloneWorkspaceDeckGroups,
  cloneWorkspaceState,
  normalizeControlPaneState,
  normalizeText,
  serializeSplitLayoutRoot
} from "./layout-workspace-capture-state.js";

const normalizeLower = (value) => normalizeText(value).toLowerCase();

export {
  captureCurrentWorkspace,
  captureLayoutProfileSnapshot,
  cloneWorkspaceDeckGroups,
  cloneWorkspaceState,
  normalizeControlPaneState,
  normalizeText,
  serializeSplitLayoutRoot
} from "./layout-workspace-capture-state.js";

export function resolveWorkspaceDeckSessions(deckId, deckSessions, deckGroups) {
  const normalizedDeckId = normalizeText(deckId);
  const orderedDeckSessions = Array.isArray(deckSessions) ? deckSessions.slice() : [];
  if (!normalizedDeckId) {
    return orderedDeckSessions;
  }
  const deckGroupState = cloneWorkspaceDeckGroups(deckGroups?.[normalizedDeckId]);
  if (!deckGroupState.activeGroupId) {
    return orderedDeckSessions;
  }
  const activeGroup = deckGroupState.groups.find((group) => group.id === deckGroupState.activeGroupId) || null;
  if (!activeGroup) {
    return orderedDeckSessions;
  }
  const byId = new Map(orderedDeckSessions.map((session) => [session.id, session]));
  const resolved = [];
  for (const sessionId of activeGroup.sessionIds) {
    const session = byId.get(sessionId);
    if (session) {
      resolved.push(session);
    }
  }
  return resolved;
}

export function captureCurrentVisibleDeckSessions(options = {}) {
  const {
    deckId = "",
    getActiveDeckId = () => "",
    getSessions = () => [],
    sortSessionsByQuickId = (sessions) => (Array.isArray(sessions) ? sessions.slice() : []),
    resolveSessionDeckId = (session) => session?.deckId || "",
    deckGroups = {},
    getSessionFilterText = () => "",
    resolveFilterSelectors = null
  } = options;
  const normalizedDeckId = normalizeText(deckId) || normalizeText(getActiveDeckId()) || "default";
  const sessions = sortSessionsByQuickId(getSessions()).filter(
    (session) => resolveSessionDeckId(session) === normalizedDeckId
  );
  const groupedSessions = resolveWorkspaceDeckSessions(normalizedDeckId, sessions, deckGroups);
  const sessionFilterText =
    normalizedDeckId === normalizeText(getActiveDeckId()) ? normalizeText(getSessionFilterText()) : "";
  if (!sessionFilterText || typeof resolveFilterSelectors !== "function") {
    return groupedSessions;
  }
  const resolved = resolveFilterSelectors(sessionFilterText, groupedSessions, {
    scopeMode: "active-deck",
    activeDeckId: normalizedDeckId
  });
  if (resolved && Array.isArray(resolved.sessions)) {
    return resolved.sessions;
  }
  return groupedSessions;
}

export async function applyLayoutProfileSnapshot(options = {}) {
  const normalizedLayout = normalizeLayoutProfileRecord({
    id: "__device-layout__",
    name: "Device Layout",
    createdAt: 0,
    updatedAt: 0,
    layout: options.layout
  })?.layout;
  if (!normalizedLayout) {
    throw new Error("Invalid layout snapshot.");
  }

  const scope = normalizeLower(options.scope) || "all";
  const getDecks = typeof options.getDecks === "function" ? options.getDecks : () => [];
  const getDeckTerminalGeometry =
    typeof options.getDeckTerminalGeometry === "function" ? options.getDeckTerminalGeometry : () => ({ cols: 80, rows: 20 });
  const updateDeckGeometry =
    typeof options.updateDeckGeometry === "function" ? options.updateDeckGeometry : async () => null;
  const setSidebarVisible =
    typeof options.setSidebarVisible === "function" ? options.setSidebarVisible : () => {};
  const setSessionFilterText =
    typeof options.setSessionFilterText === "function" ? options.setSessionFilterText : () => {};
  const setControlPaneState =
    typeof options.setControlPaneState === "function" ? options.setControlPaneState : null;
  const mergeDeckSplitLayouts =
    typeof options.mergeDeckSplitLayouts === "function" ? options.mergeDeckSplitLayouts : null;
  const setDeckSplitLayouts =
    typeof options.setDeckSplitLayouts === "function" ? options.setDeckSplitLayouts : null;
  const getDeckSplitLayouts =
    typeof options.getDeckSplitLayouts === "function" ? options.getDeckSplitLayouts : () => ({});
  const setActiveDeck = typeof options.setActiveDeck === "function" ? options.setActiveDeck : () => false;
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : () => {};
  const render = typeof options.render === "function" ? options.render : () => {};

  const currentDecks = getDecks();
  const requestedTargetDeckId = normalizeText(options.targetDeckId);
  const targetActiveDeckId = requestedTargetDeckId || normalizedLayout.activeDeckId;
  const deckIdsToApply =
    scope === "all"
      ? currentDecks
          .map((deck) => normalizeText(deck?.id))
          .filter(Boolean)
      : [targetActiveDeckId].filter(Boolean);

  for (const deckId of deckIdsToApply) {
    const nextGeometry = normalizedLayout.deckTerminalSettings[deckId];
    if (!deckId || !nextGeometry) {
      continue;
    }
    const currentGeometry = getDeckTerminalGeometry(deckId);
    if (currentGeometry?.cols === nextGeometry.cols && currentGeometry?.rows === nextGeometry.rows) {
      continue;
    }
    await updateDeckGeometry(deckId, nextGeometry, targetActiveDeckId);
  }

  setSidebarVisible(normalizedLayout.sidebarVisible);
  setSessionFilterText(normalizedLayout.sessionFilterText);
  if (typeof setControlPaneState === "function") {
    setControlPaneState(normalizeLayoutControlPaneState(normalizedLayout));
  }
  if (typeof mergeDeckSplitLayouts === "function") {
    mergeDeckSplitLayouts(normalizedLayout.deckSplitLayouts, {
      scope,
      targetDeckId: targetActiveDeckId
    });
  } else if (typeof setDeckSplitLayouts === "function") {
    setDeckSplitLayouts(
      mergeDeckSplitLayoutSnapshot(getDeckSplitLayouts(), normalizedLayout.deckSplitLayouts, {
        scope,
        targetDeckId: targetActiveDeckId
      })
    );
  }
  if (currentDecks.some((deck) => normalizeText(deck?.id) === targetActiveDeckId)) {
    setActiveDeck(targetActiveDeckId);
  }
  requestRender();
  render();
  return targetActiveDeckId
    ? `Applied layout snapshot for deck [${targetActiveDeckId}].`
    : "Applied layout snapshot.";
}
