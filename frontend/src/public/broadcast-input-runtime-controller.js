import { resolveWorkspaceGroupToken } from "./workspace-preset-runtime-controller.js";

function normalizeText(value) {
  return String(value || "").trim();
}

export function createBroadcastInputRuntimeController(options = {}) {
  const getActiveDeckId = typeof options.getActiveDeckId === "function" ? options.getActiveDeckId : () => "default";
  const getSessions = typeof options.getSessions === "function" ? options.getSessions : () => [];
  const resolveSessionDeckId =
    typeof options.resolveSessionDeckId === "function" ? options.resolveSessionDeckId : (session) => String(session?.deckId || "default");
  const sortSessionsByQuickId =
    typeof options.sortSessionsByQuickId === "function" ? options.sortSessionsByQuickId : (sessions) => (Array.isArray(sessions) ? sessions.slice() : []);
  const listGroupsForDeck = typeof options.listGroupsForDeck === "function" ? options.listGroupsForDeck : () => [];
  const getActiveGroupIdForDeck = typeof options.getActiveGroupIdForDeck === "function" ? options.getActiveGroupIdForDeck : () => "";
  const applyGroupLocally = typeof options.applyGroupLocally === "function" ? options.applyGroupLocally : () => null;

  let mode = "single";

  function getMode() {
    return mode;
  }

  function listDeckSessions(deckId = getActiveDeckId()) {
    const normalizedDeckId = normalizeText(deckId) || "default";
    return sortSessionsByQuickId(getSessions()).filter((session) => normalizeText(resolveSessionDeckId(session)) === normalizedDeckId);
  }

  function resolveGroupTarget(groupToken = "", deckId = getActiveDeckId()) {
    const normalizedDeckId = normalizeText(deckId) || "default";
    const groups = listGroupsForDeck(normalizedDeckId);
    if (!Array.isArray(groups) || groups.length === 0) {
      return { deckId: normalizedDeckId, group: null, sessions: [], error: `No workspace groups are available on deck [${normalizedDeckId}].` };
    }

    let group = null;
    let error = "";
    const requestedToken = normalizeText(groupToken);
    if (requestedToken) {
      const resolved = resolveWorkspaceGroupToken(groups, requestedToken);
      group = resolved.group || null;
      error = resolved.error || "";
    } else {
      const activeGroupId = normalizeText(getActiveGroupIdForDeck(normalizedDeckId));
      group = groups.find((entry) => normalizeText(entry.id) === activeGroupId) || null;
      if (!group) {
        error = `No active workspace group is selected on deck [${normalizedDeckId}].`;
      }
    }

    if (!group) {
      return { deckId: normalizedDeckId, group: null, sessions: [], error };
    }

    const byId = new Map(listDeckSessions(normalizedDeckId).map((session) => [session.id, session]));
    const sessions = [];
    for (const sessionId of Array.isArray(group.sessionIds) ? group.sessionIds : []) {
      const session = byId.get(sessionId);
      if (session) {
        sessions.push(session);
      }
    }
    if (sessions.length === 0) {
      return {
        deckId: normalizedDeckId,
        group,
        sessions: [],
        error: `Workspace group [${group.id}] ${group.name} has no available sessions on deck [${normalizedDeckId}].`
      };
    }
    return {
      deckId: normalizedDeckId,
      group,
      sessions,
      error: ""
    };
  }

  function getBroadcastTargets() {
    if (mode !== "group") {
      return {
        active: false,
        mode,
        sessions: [],
        error: "",
        summary: "",
        routeFeedback: ""
      };
    }

    const resolved = resolveGroupTarget("", getActiveDeckId());
    if (resolved.error) {
      return {
        active: true,
        mode,
        sessions: [],
        error: resolved.error,
        summary: `Target: workspace group unavailable.`,
        routeFeedback: ""
      };
    }

    return {
      active: true,
      mode,
      deckId: resolved.deckId,
      group: resolved.group,
      sessions: resolved.sessions,
      error: "",
      summary: `Target: group [${resolved.group.id}] ${resolved.group.name} · ${resolved.sessions.length} sessions`,
      routeFeedback: `Sent to workspace group [${resolved.group.id}] ${resolved.group.name} (${resolved.sessions.length} sessions).`
    };
  }

  function getStatus() {
    if (mode !== "group") {
      return "Broadcast: off.";
    }
    const resolved = getBroadcastTargets();
    if (resolved.error) {
      return `Broadcast: group mode unavailable. ${resolved.error}`;
    }
    return `Broadcast: workspace group [${resolved.group.id}] ${resolved.group.name} on deck [${resolved.deckId}] (${resolved.sessions.length} sessions).`;
  }

  function disableBroadcast() {
    mode = "single";
    return "Broadcast mode disabled.";
  }

  function enableGroupBroadcast(groupToken = "") {
    const normalizedDeckId = normalizeText(getActiveDeckId()) || "default";
    const requestedToken = normalizeText(groupToken);
    let nextTargets = null;
    if (requestedToken) {
      const resolved = resolveGroupTarget(requestedToken, normalizedDeckId);
      if (resolved.error) {
        throw new Error(resolved.error);
      }
      applyGroupLocally(resolved.group.id, normalizedDeckId);
      nextTargets = resolved;
    }

    if (!nextTargets) {
      nextTargets = resolveGroupTarget("", normalizedDeckId);
    }
    if (nextTargets.error) {
      throw new Error(nextTargets.error);
    }

    mode = "group";
    return `Broadcasting to workspace group [${nextTargets.group.id}] ${nextTargets.group.name} on deck [${nextTargets.deckId}].`;
  }

  function formatTargetSummary() {
    const targets = getBroadcastTargets();
    if (!targets.active) {
      return "";
    }
    if (targets.error) {
      return "Target: workspace group unavailable.";
    }
    return targets.summary;
  }

  return {
    getMode,
    getStatus,
    getBroadcastTargets,
    formatTargetSummary,
    enableGroupBroadcast,
    disableBroadcast
  };
}
